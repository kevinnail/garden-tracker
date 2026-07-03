// Cloud sync engine (Slice E). Push local changes, pull the full active server
// state, reconcile by last-write-wins on `uuid`. Built to SYNC-WIRE-CONTRACT.md:
// the wire keys every row on its client-generated `uuid`, sends foreign keys as
// the parent's `uuid` (never a local integer id), and uses the same
// space-separated millisecond timestamp strings the local schema writes.

import { getDb } from '@/src/db/database';
import { TS_NOW } from '@/src/db/schema';
import { reconcileNoteImages } from '@/src/db/queries/noteImageQueries';
import { requestJson } from '@/src/services/apiClient';
import { authClient } from '@/src/services/authClient';
import {
  uploadPendingImages,
  downloadPendingImages,
  cleanupTombstonedImages,
} from '@/src/services/imageSync';
import { backfillNoteImageUuids, collectSyncedNoteImages } from '@/src/utils/noteUtils';

type WireRow = Record<string, unknown>;

export interface PushPayload {
  changed: { table: string; rows: WireRow[] }[];
}

export interface PushResponse {
  accepted: number;
  skipped: number;
}

export interface PullResponse {
  last_sync_at: string;
  [table: string]: WireRow[] | string;
}

// Minimal database surface these functions need — satisfied by both the real
// expo-sqlite handle and the better-sqlite3 test adapter.
interface SyncDb {
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  runAsync(source: string, ...params: unknown[]): Promise<unknown>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
}

// SELECT per table, in wire shape. Parent foreign keys are resolved to the
// parent's `uuid` via a JOIN; reference ids (stage_definition_id, task_type_id)
// stay integers. No `deleted_at` filter — tombstones must push. `uuid IS NOT
// NULL` guards the (post-migration, should-never-happen) unkeyed row that the
// server would reject with a 400 for the whole batch.
const COLLECT_SQL: Record<string, string> = {
  locations: `
    SELECT uuid, name, order_index, updated_at, deleted_at
    FROM locations
    WHERE uuid IS NOT NULL AND updated_at > ?`,
  gardens: `
    SELECT gardens.uuid, locations.uuid AS location_uuid, gardens.name,
           gardens.record_type, gardens.order_index, gardens.updated_at, gardens.deleted_at
    FROM gardens JOIN locations ON locations.id = gardens.location_id
    WHERE gardens.uuid IS NOT NULL AND gardens.updated_at > ?`,
  sections: `
    SELECT sections.uuid, gardens.uuid AS garden_uuid, sections.name,
           sections.order_index, sections.updated_at, sections.deleted_at
    FROM sections JOIN gardens ON gardens.id = sections.garden_id
    WHERE sections.uuid IS NOT NULL AND sections.updated_at > ?`,
  crop_instances: `
    SELECT crop_instances.uuid, sections.uuid AS section_uuid, crop_instances.name,
           crop_instances.plant_count, crop_instances.start_date, crop_instances.record_type,
           crop_instances.archived, crop_instances.notes, crop_instances.created_at,
           crop_instances.updated_at, crop_instances.deleted_at
    FROM crop_instances JOIN sections ON sections.id = crop_instances.section_id
    WHERE crop_instances.uuid IS NOT NULL AND crop_instances.updated_at > ?`,
  crop_stages: `
    SELECT crop_stages.uuid, crop_instances.uuid AS crop_instance_uuid,
           crop_stages.stage_definition_id, crop_stages.duration_weeks, crop_stages.order_index,
           crop_stages.updated_at, crop_stages.deleted_at
    FROM crop_stages JOIN crop_instances ON crop_instances.id = crop_stages.crop_instance_id
    WHERE crop_stages.uuid IS NOT NULL AND crop_stages.updated_at > ?`,
  tasks: `
    SELECT tasks.uuid, crop_instances.uuid AS crop_instance_uuid, tasks.task_type_id,
           tasks.day_of_week, tasks.frequency_weeks, tasks.start_offset_weeks,
           tasks.created_at, tasks.updated_at, tasks.deleted_at
    FROM tasks JOIN crop_instances ON crop_instances.id = tasks.crop_instance_id
    WHERE tasks.uuid IS NOT NULL AND tasks.updated_at > ?`,
  task_completions: `
    SELECT task_completions.uuid, tasks.uuid AS task_uuid, task_completions.completed_date,
           task_completions.updated_at, task_completions.deleted_at
    FROM task_completions JOIN tasks ON tasks.id = task_completions.task_id
    WHERE task_completions.uuid IS NOT NULL AND task_completions.updated_at > ?`,
  // LEFT JOIN — a note's crop_instance_id is nullable on the wire.
  notes: `
    SELECT notes.uuid, notes.entity_type, notes.week_date,
           crop_instances.uuid AS crop_instance_uuid, notes.content,
           notes.created_at, notes.updated_at, notes.deleted_at
    FROM notes LEFT JOIN crop_instances ON crop_instances.id = notes.crop_instance_id
    WHERE notes.uuid IS NOT NULL AND notes.updated_at > ?`,
  // Only push rows the server can actually use: an uploaded row (has s3_key) or a
  // tombstone (deleted_at). An active row still pending its S3 upload waits.
  note_images: `
    SELECT note_images.uuid, notes.uuid AS note_uuid, note_images.s3_key,
           note_images.created_at, note_images.updated_at, note_images.deleted_at
    FROM note_images JOIN notes ON notes.id = note_images.note_id
    WHERE note_images.uuid IS NOT NULL AND note_images.updated_at > ?
      AND (note_images.s3_key IS NOT NULL OR note_images.deleted_at IS NOT NULL)`,
};

interface ForeignKey {
  wireField: string; // e.g. 'location_uuid'
  localColumn: string; // e.g. 'location_id'
  parentTable: string; // e.g. 'locations'
  nullable?: boolean;
}

interface TableConfig {
  table: string;
  // Data columns copied verbatim from wire → local (excludes uuid, the FK, and
  // the timestamp columns, which are handled separately).
  dataColumns: string[];
  hasCreatedAt: boolean;
  foreignKey?: ForeignKey;
  // Extra predicate restricting which local rows the pull sweep may tombstone
  // when they're absent from the server response. Used by note_images to spare
  // rows still pending their S3 upload (s3_key IS NULL) — those were never
  // pushed, so their absence from pull is expected, not a server-side delete.
  pullDeleteFilter?: string;
}

// Parents before children — the order the server processes push in, and the
// order pull must reconcile in so a child's parent uuid always resolves first.
const TABLE_CONFIGS: TableConfig[] = [
  { table: 'locations', dataColumns: ['name', 'order_index'], hasCreatedAt: false },
  {
    table: 'gardens',
    dataColumns: ['name', 'record_type', 'order_index'],
    hasCreatedAt: false,
    foreignKey: {
      wireField: 'location_uuid',
      localColumn: 'location_id',
      parentTable: 'locations',
    },
  },
  {
    table: 'sections',
    dataColumns: ['name', 'order_index'],
    hasCreatedAt: false,
    foreignKey: { wireField: 'garden_uuid', localColumn: 'garden_id', parentTable: 'gardens' },
  },
  {
    table: 'crop_instances',
    dataColumns: ['name', 'plant_count', 'start_date', 'record_type', 'archived', 'notes'],
    hasCreatedAt: true,
    foreignKey: { wireField: 'section_uuid', localColumn: 'section_id', parentTable: 'sections' },
  },
  {
    table: 'crop_stages',
    dataColumns: ['stage_definition_id', 'duration_weeks', 'order_index'],
    hasCreatedAt: false,
    foreignKey: {
      wireField: 'crop_instance_uuid',
      localColumn: 'crop_instance_id',
      parentTable: 'crop_instances',
    },
  },
  {
    table: 'tasks',
    dataColumns: ['task_type_id', 'day_of_week', 'frequency_weeks', 'start_offset_weeks'],
    hasCreatedAt: true,
    foreignKey: {
      wireField: 'crop_instance_uuid',
      localColumn: 'crop_instance_id',
      parentTable: 'crop_instances',
    },
  },
  {
    table: 'task_completions',
    dataColumns: ['completed_date'],
    hasCreatedAt: false,
    foreignKey: { wireField: 'task_uuid', localColumn: 'task_id', parentTable: 'tasks' },
  },
  {
    table: 'notes',
    dataColumns: ['entity_type', 'week_date', 'content'],
    hasCreatedAt: true,
    foreignKey: {
      wireField: 'crop_instance_uuid',
      localColumn: 'crop_instance_id',
      parentTable: 'crop_instances',
      nullable: true,
    },
  },
  {
    table: 'note_images',
    dataColumns: ['s3_key'],
    hasCreatedAt: true,
    foreignKey: { wireField: 'note_uuid', localColumn: 'note_id', parentTable: 'notes' },
    // local_uri is device-local (not a dataColumn), so pull never clobbers it and
    // a freshly pulled row lands with local_uri = NULL → the download pass fetches
    // its bytes. Only server-known rows (s3_key set) are eligible for pull-delete.
    pullDeleteFilter: 's3_key IS NOT NULL',
  },
];

const TABLE_ORDER = TABLE_CONFIGS.map((config) => config.table);

// ── Checkpoints (persisted in the existing settings k/v table) ──────────────

async function getSetting(db: SyncDb, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`,
    key,
  );
  return row?.value ?? null;
}

async function setSetting(db: SyncDb, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

// ── Existing-image backfill ───────────────────────────────────────────────────

/**
 * One-time-per-note upgrade for images created before Slice F: they live in
 * notes.content with a local `uri` but no `uuid` and no `note_images` row. Mint a
 * `uuid` into each such image (bumping the note's `updated_at` so the uuid
 * reaches other devices) and create its `note_images` row (upload pending). Runs
 * at the top of every sync; a no-op once every image is keyed.
 */
export async function backfillNoteImages(db: SyncDb): Promise<void> {
  const notes = await db.getAllAsync<{ id: number; content: string }>(
    `SELECT id, content FROM notes WHERE deleted_at IS NULL AND content IS NOT NULL`,
  );
  for (const note of notes) {
    const updated = backfillNoteImageUuids(note.content);
    if (updated == null) continue;
    await db.runAsync(
      `UPDATE notes SET content = ?, updated_at = ${TS_NOW} WHERE id = ?`,
      updated,
      note.id,
    );
    await reconcileNoteImages(note.id, collectSyncedNoteImages(updated));
  }
}

// ── Push ────────────────────────────────────────────────────────────────────

export async function collectChanges(since: string): Promise<PushPayload> {
  const db = await getDb();
  const changed: PushPayload['changed'] = [];
  for (const table of TABLE_ORDER) {
    const rows = await db.getAllAsync<WireRow>(COLLECT_SQL[table], since);
    if (rows.length > 0) changed.push({ table, rows });
  }
  return { changed };
}

// ── Pull + reconcile ──────────────────────────────────────────────────────────

async function applyTable(
  db: SyncDb,
  config: TableConfig,
  incomingRows: WireRow[],
  syncStartedAt: string,
): Promise<void> {
  const incomingUuids = new Set<string>();

  for (const row of incomingRows) {
    const uuid = row.uuid as string;
    if (!uuid) continue;
    incomingUuids.add(uuid);

    // Resolve the wire parent uuid → local integer id. Parents are reconciled
    // first, so an active parent is already present; a genuinely missing
    // required parent (shouldn't happen on a full pull) means we skip the child.
    let foreignKeyId: number | null = null;
    if (config.foreignKey) {
      const wireValue = row[config.foreignKey.wireField];
      if (wireValue == null) {
        if (!config.foreignKey.nullable) continue;
      } else {
        const parent = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM ${config.foreignKey.parentTable} WHERE uuid = ?`,
          wireValue,
        );
        if (!parent) continue;
        foreignKeyId = parent.id;
      }
    }

    const existing = await db.getFirstAsync<{ updated_at: string }>(
      `SELECT updated_at FROM ${config.table} WHERE uuid = ?`,
      uuid,
    );

    // Last-write-wins: apply only when the incoming row is at least as new.
    if (existing && String(row.updated_at) < existing.updated_at) continue;

    const columns = ['uuid', ...config.dataColumns];
    const values: unknown[] = [uuid, ...config.dataColumns.map((column) => row[column] ?? null)];
    if (config.foreignKey) {
      columns.push(config.foreignKey.localColumn);
      values.push(foreignKeyId);
    }
    columns.push('updated_at', 'deleted_at');
    values.push(row.updated_at, row.deleted_at ?? null);

    if (!existing) {
      // created_at is pinned to the incoming value on first insert only.
      if (config.hasCreatedAt) {
        columns.push('created_at');
        values.push(row.created_at ?? row.updated_at);
      }
      const placeholders = columns.map(() => '?').join(', ');
      await db.runAsync(
        `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${placeholders})`,
        ...values,
      );
    } else {
      // Update by uuid; created_at is immutable, so it is never in the SET list.
      const assignments = columns
        .filter((column) => column !== 'uuid')
        .map((column) => `${column} = ?`)
        .join(', ');
      const assignmentValues = values.slice(1);
      await db.runAsync(
        `UPDATE ${config.table} SET ${assignments} WHERE uuid = ?`,
        ...assignmentValues,
        uuid,
      );
    }
  }

  // Soft-delete rows the server no longer returns. Guard on `updated_at <=
  // syncStartedAt` so a row created locally during this sync (not yet pushed,
  // so legitimately absent from the pull) is left alone rather than deleted.
  const extraFilter = config.pullDeleteFilter ? ` AND ${config.pullDeleteFilter}` : '';
  const localActive = await db.getAllAsync<{ uuid: string; updated_at: string }>(
    `SELECT uuid, updated_at FROM ${config.table}
     WHERE deleted_at IS NULL AND uuid IS NOT NULL${extraFilter}`,
  );
  for (const local of localActive) {
    if (!incomingUuids.has(local.uuid) && local.updated_at <= syncStartedAt) {
      await db.runAsync(
        `UPDATE ${config.table} SET deleted_at = ?, updated_at = ? WHERE uuid = ?`,
        syncStartedAt,
        syncStartedAt,
        local.uuid,
      );
    }
  }
}

export async function applyPull(response: PullResponse, syncStartedAt: string): Promise<void> {
  const db = (await getDb()) as unknown as SyncDb;
  await db.withTransactionAsync(async () => {
    for (const config of TABLE_CONFIGS) {
      const rows = (response[config.table] as WireRow[] | undefined) ?? [];
      await applyTable(db, config, rows, syncStartedAt);
    }
  });
}

// ── Orchestration ─────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const cookie = authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}

/**
 * One sync event: push local changes, then pull the full active server state and
 * reconcile. Push-then-pull so the server has applied this device's changes
 * under LWW before we overwrite the local view. The checkpoint advances only
 * after the push succeeds, so a failed push is retried next time (no data loss).
 *
 * Image bytes bracket the row sync: backfill legacy images and upload pending
 * bytes *before* the push (so their rows are pushable in the same event), then
 * download newly-pulled bytes and clean up tombstoned files *after* the pull.
 */
export async function runSync(): Promise<{ lastSyncAt: string }> {
  const db = (await getDb()) as unknown as SyncDb;

  // Key any pre-Slice-F images and mint their rows before we snapshot the clock,
  // so the content/updated_at bump lands under this sync's checkpoint.
  await backfillNoteImages(db);

  // Capture the sync-start instant from SQLite so it is byte-identical in format
  // to every row timestamp we compare it against.
  const startRow = await db.getFirstAsync<{ now: string }>(`SELECT ${TS_NOW} AS now`);
  const syncStartedAt = startRow!.now;

  // Upload before collecting: a successful upload sets s3_key + stamps updated_at
  // to syncStartedAt, so the row is picked up by this same push.
  await uploadPendingImages(syncStartedAt);

  const lastPushedAt = (await getSetting(db, 'last_pushed_at')) ?? '';
  const payload = await collectChanges(lastPushedAt);

  if (payload.changed.length > 0) {
    await requestJson<PushResponse>('/sync/push', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  }
  // Everything up to syncStartedAt is now on the server (or there was nothing).
  await setSetting(db, 'last_pushed_at', syncStartedAt);

  const pull = await requestJson<PullResponse>('/sync/pull', {
    method: 'GET',
    headers: authHeaders(),
  });
  await applyPull(pull, syncStartedAt);
  await setSetting(db, 'last_sync_at', pull.last_sync_at);

  // Fetch bytes for rows just pulled, and drop files for rows just tombstoned.
  await downloadPendingImages();
  await cleanupTombstonedImages();

  return { lastSyncAt: pull.last_sync_at };
}
