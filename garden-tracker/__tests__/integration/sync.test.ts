// * ==================================================
// *
// *    Integration tests — Slice E sync engine
// *
// *    Real in-memory SQLite (better-sqlite3). Covers the three
// *    load-bearing pieces of syncClient against actual rows:
// *      1. collectChanges — wire shape, FK-by-uuid, tombstones
// *         included, `since` filtering, integer reference ids.
// *      2. applyPull — uuid→local-id resolution, LWW, absent-row
// *         soft-delete, verbatim timestamps.
// *      3. runSync — push-before-pull ordering + checkpoint only
// *         advancing when the push succeeds.
// *
// * ==================================================

import {
  collectChanges,
  applyPull,
  runSync,
  backfillNoteImages,
  PullResponse,
} from '@/src/services/syncClient';
import { insertLocation, insertGarden, insertSection } from '@/src/db/queries/locationQueries';
import { insertCropWithStages, deleteCropInstance } from '@/src/db/queries/cropQueries';
import { insertTask, insertCompletion } from '@/src/db/queries/taskQueries';
import { upsertNote } from '@/src/db/queries/noteQueries';
import { getDb } from '@/src/db/database';
import { SEED, setupTestDb } from '../setup';
import type BetterSqlite3 from 'better-sqlite3';

jest.mock('@/src/db/database', () => ({ getDb: jest.fn() }));
jest.mock('@/src/services/authClient', () => ({
  authClient: { getCookie: jest.fn(() => 'better-auth.session_token=test-cookie') },
}));
// runSync now imports imageSync → expo-file-system (native). These suites create
// no image bytes, so a stub keeps the module graph loadable without a device.
jest.mock('expo-file-system', () => ({
  File: class {},
  Directory: class {},
  Paths: { document: 'file:///documents' },
}));

let rawDb: BetterSqlite3.Database;
let testAdapter: ReturnType<typeof setupTestDb>['adapter'];

beforeEach(() => {
  const { db, adapter } = setupTestDb();
  rawDb = db;
  testAdapter = adapter;
  (getDb as jest.Mock).mockResolvedValue(adapter);
});

const uuidOf = (table: string, column: string, value: unknown): string =>
  (rawDb.prepare(`SELECT uuid FROM ${table} WHERE ${column} = ?`).get(value) as { uuid: string })
    .uuid;

const row = <T>(sql: string, ...params: unknown[]): T => rawDb.prepare(sql).get(...params) as T;

// ── collectChanges ──────────────────────────────────────────────────────────

describe('collectChanges', () => {
  it('emits the wire shape with foreign keys as parent uuids, in dependency order', async () => {
    const locationId = await insertLocation('Backyard');
    const gardenId = await insertGarden(locationId, 'Raised Beds');
    const sectionId = await insertSection(gardenId, 'North Row');
    await insertCropWithStages(sectionId, 'Kale', 4, '2026-03-01', [
      { stage_definition_id: 1, duration_weeks: 3 },
    ]);

    const { changed } = await collectChanges('');
    const tables = changed.map((entry) => entry.table);

    // The seed's own rows have NULL uuid (pre-sync fixtures) so only the rows we
    // created through the query layer surface, and in parents-first order.
    expect(tables).toEqual(['locations', 'gardens', 'sections', 'crop_instances', 'crop_stages']);

    const locationUuid = uuidOf('locations', 'name', 'Backyard');
    const gardenRow = changed.find((entry) => entry.table === 'gardens')!.rows[0];
    // FK travels as the parent's uuid, never the local integer id.
    expect(gardenRow.location_uuid).toBe(locationUuid);
    expect(gardenRow).not.toHaveProperty('location_id');
    expect(gardenRow).toMatchObject({ name: 'Raised Beds', record_type: 'plant' });

    const stageRow = changed.find((entry) => entry.table === 'crop_stages')!.rows[0];
    const cropUuid = uuidOf('crop_instances', 'name', 'Kale');
    expect(stageRow.crop_instance_uuid).toBe(cropUuid);
    // Reference id stays an integer — it is deterministic device seed data.
    expect(stageRow.stage_definition_id).toBe(1);
  });

  it('includes tombstoned rows (deleted_at set), so deletes propagate', async () => {
    const locationId = await insertLocation('Plot');
    const gardenId = await insertGarden(locationId, 'Bed');
    const sectionId = await insertSection(gardenId, 'Row');
    const cropId = await insertCropWithStages(sectionId, 'Basil', 2, '2026-04-05', []);

    await deleteCropInstance(cropId);

    const cropUuid = uuidOf('crop_instances', 'id', cropId);
    const { changed } = await collectChanges('');
    const cropRows = changed.find((entry) => entry.table === 'crop_instances')!.rows;
    const cropRow = cropRows.find((entry) => entry.uuid === cropUuid)!;
    expect(cropRow.deleted_at).not.toBeNull();
  });

  it('only returns rows changed strictly after the `since` checkpoint', async () => {
    await insertLocation('Old');
    await insertLocation('New');
    // Pin timestamps so the assertion doesn't depend on wall-clock resolution.
    rawDb
      .prepare(`UPDATE locations SET updated_at = '2000-01-01 00:00:00.000' WHERE name = 'Old'`)
      .run();
    rawDb
      .prepare(`UPDATE locations SET updated_at = '2100-01-01 00:00:00.000' WHERE name = 'New'`)
      .run();

    const { changed } = await collectChanges('2050-01-01 00:00:00.000');
    const locationNames = new Set(
      (changed.find((entry) => entry.table === 'locations')?.rows ?? []).map((entry) => entry.name),
    );
    expect(locationNames.has('New')).toBe(true);
    expect(locationNames.has('Old')).toBe(false);
  });
});

// ── touch-parent on task-child mutation ────────────────────────────────────────
//
// Sync is pure per-row LWW with no cascade, so a crop only survives a remote
// tombstone if the client re-pushes the crop_instances row itself. A task-level
// child mutation must therefore bump the parent crop's updated_at so it rides the
// next push batch (deleted_at null → resurrect) — unless the crop is tombstoned
// on THIS device, in which case the parent must stay untouched.

describe('touch-parent on task-child mutation', () => {
  // A realistic past checkpoint: a "now" touch clears it, an untouched old row
  // does not. (A future checkpoint would swallow the real wall-clock bump.)
  const SINCE = '2020-01-01 00:00:00.000';
  const PARKED = '2000-01-01 00:00:00.000';

  const collectedCrop = (
    changed: Awaited<ReturnType<typeof collectChanges>>['changed'],
    cropUuid: string,
  ) =>
    changed
      .find((entry) => entry.table === 'crop_instances')
      ?.rows.find((r) => r.uuid === cropUuid);

  it('enqueues the parent crop (deleted_at null) when a task is added after the checkpoint', async () => {
    const cropUuid = uuidOf('crop_instances', 'id', SEED.CROP_ID);
    // Park the crop before the checkpoint so only a child-driven touch surfaces it.
    rawDb
      .prepare(`UPDATE crop_instances SET updated_at = ? WHERE id = ?`)
      .run(PARKED, SEED.CROP_ID);

    const before = await collectChanges(SINCE);
    expect(collectedCrop(before.changed, cropUuid)).toBeUndefined();

    await insertTask(SEED.CROP_ID, SEED.TASK_TYPE_ID, SEED.TASK_DAY_OF_WEEK, 1, 0);

    const after = await collectChanges(SINCE);
    const cropRow = collectedCrop(after.changed, cropUuid);
    expect(cropRow).toBeDefined();
    expect(cropRow!.deleted_at).toBeNull();
    // The new task rides the same batch, keyed to the same crop.
    const taskRows = after.changed.find((entry) => entry.table === 'tasks')?.rows ?? [];
    expect(taskRows.some((r) => r.crop_instance_uuid === cropUuid)).toBe(true);
  });

  it('enqueues the parent crop when a task completion is added', async () => {
    const cropUuid = uuidOf('crop_instances', 'id', SEED.CROP_ID);
    rawDb
      .prepare(`UPDATE crop_instances SET updated_at = ? WHERE id = ?`)
      .run(PARKED, SEED.CROP_ID);

    await insertCompletion(SEED.TASK_ID, SEED.START_DATE);

    const cropRow = collectedCrop((await collectChanges(SINCE)).changed, cropUuid);
    expect(cropRow).toBeDefined();
    expect(cropRow!.deleted_at).toBeNull();
  });

  it('does NOT resurrect a crop tombstoned on this device when a task is added', async () => {
    const cropUuid = uuidOf('crop_instances', 'id', SEED.CROP_ID);
    // Deleted on THIS device: tombstoned and parked before the checkpoint.
    rawDb
      .prepare(`UPDATE crop_instances SET deleted_at = ?, updated_at = ? WHERE id = ?`)
      .run(PARKED, PARKED, SEED.CROP_ID);

    await insertTask(SEED.CROP_ID, SEED.TASK_TYPE_ID, SEED.TASK_DAY_OF_WEEK, 1, 0);

    // Guard held: updated_at was not bumped, so the crop stays below the checkpoint.
    expect(collectedCrop((await collectChanges(SINCE)).changed, cropUuid)).toBeUndefined();
  });
});

// ── applyPull ────────────────────────────────────────────────────────────────

const emptyPull = (overrides: Partial<PullResponse>): PullResponse => ({
  locations: [],
  gardens: [],
  sections: [],
  crop_instances: [],
  crop_stages: [],
  tasks: [],
  task_completions: [],
  notes: [],
  note_images: [],
  last_sync_at: '2026-06-30T00:00:00.000Z',
  ...overrides,
});

// Insert a note_images row directly, bypassing the query layer, so tests can pin
// s3_key / local_uri / updated_at exactly.
function insertImageRow(fields: {
  uuid: string;
  note_id: number;
  s3_key?: string | null;
  local_uri?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
}): void {
  rawDb
    .prepare(
      `INSERT INTO note_images (uuid, note_id, s3_key, local_uri, created_at, updated_at, deleted_at)
       VALUES (@uuid, @note_id, @s3_key, @local_uri, '2026-01-01 00:00:00.000', @updated_at, @deleted_at)`,
    )
    .run({
      s3_key: null,
      local_uri: null,
      updated_at: '2026-06-01 10:00:00.000',
      deleted_at: null,
      ...fields,
    });
}

const SEED_CROP_ID = 1;
const SEED_WEEK = '2025-03-02';

describe('applyPull', () => {
  it('inserts new rows and resolves parent uuids to local integer ids', async () => {
    const response = emptyPull({
      locations: [
        {
          uuid: 'loc-1',
          name: 'Cloud Yard',
          order_index: 0,
          updated_at: '2026-06-01 10:00:00.000',
          deleted_at: null,
        },
      ],
      gardens: [
        {
          uuid: 'gar-1',
          location_uuid: 'loc-1',
          name: 'Cloud Bed',
          record_type: 'plant',
          order_index: 0,
          updated_at: '2026-06-01 10:00:00.000',
          deleted_at: null,
        },
      ],
    });

    await applyPull(response, '2026-06-30 00:00:00.000');

    const location = row<{ id: number; name: string; updated_at: string }>(
      `SELECT id, name, updated_at FROM locations WHERE uuid = 'loc-1'`,
    );
    expect(location.name).toBe('Cloud Yard');
    // Timestamp stored verbatim — never re-stamped (would loop it back into push).
    expect(location.updated_at).toBe('2026-06-01 10:00:00.000');

    const garden = row<{ location_id: number }>(
      `SELECT location_id FROM gardens WHERE uuid = 'gar-1'`,
    );
    expect(garden.location_id).toBe(location.id);
  });

  it('applies a strictly-newer incoming row and skips a stale one (LWW)', async () => {
    const localId = await insertLocation('Local Name');
    const localUuid = uuidOf('locations', 'id', localId);

    // Stale: older updated_at than the local row — must be ignored.
    await applyPull(
      emptyPull({
        locations: [
          {
            uuid: localUuid,
            name: 'Stale Name',
            order_index: 0,
            updated_at: '2000-01-01 00:00:00.000',
            deleted_at: null,
          },
        ],
      }),
      '2000-01-01 00:00:00.000',
    );
    expect(row<{ name: string }>(`SELECT name FROM locations WHERE uuid = ?`, localUuid).name).toBe(
      'Local Name',
    );

    // Newer: greater updated_at — must overwrite.
    await applyPull(
      emptyPull({
        locations: [
          {
            uuid: localUuid,
            name: 'Fresh Name',
            order_index: 0,
            updated_at: '2999-01-01 00:00:00.000',
            deleted_at: null,
          },
        ],
      }),
      '2999-01-01 00:00:00.000',
    );
    expect(row<{ name: string }>(`SELECT name FROM locations WHERE uuid = ?`, localUuid).name).toBe(
      'Fresh Name',
    );
  });

  it('soft-deletes a previously-synced local row that is absent from the pull', async () => {
    const localId = await insertLocation('To Be Removed');
    const localUuid = uuidOf('locations', 'id', localId);

    // Far-future syncStartedAt → the row counts as already pushed, so its absence
    // means the server deleted it.
    await applyPull(emptyPull({}), '9999-12-31 00:00:00.000');

    expect(
      row<{ deleted_at: string | null }>(
        `SELECT deleted_at FROM locations WHERE uuid = ?`,
        localUuid,
      ).deleted_at,
    ).not.toBeNull();
  });

  it('leaves a locally-new unpushed row alone when it is absent from the pull', async () => {
    const localId = await insertLocation('Just Created');
    const localUuid = uuidOf('locations', 'id', localId);

    // Far-past syncStartedAt → the row's updated_at is newer, so it is treated as
    // created-during-sync and must not be deleted.
    await applyPull(emptyPull({}), '2000-01-01 00:00:00.000');

    expect(
      row<{ deleted_at: string | null }>(
        `SELECT deleted_at FROM locations WHERE uuid = ?`,
        localUuid,
      ).deleted_at,
    ).toBeNull();
  });
});

// ── note_images (Slice F) ──────────────────────────────────────────────────────

describe('note_images sync', () => {
  it('collects the wire shape (note_uuid FK, s3_key) for uploaded rows and tombstones, but not pending uploads', async () => {
    const noteId = await upsertNote(SEED_CROP_ID, SEED_WEEK, 'weekly');
    const noteUuid = uuidOf('notes', 'id', noteId);

    insertImageRow({ uuid: 'img-pending', note_id: noteId, local_uri: 'file:///p.jpg' }); // s3_key null
    insertImageRow({
      uuid: 'img-up',
      note_id: noteId,
      s3_key: 'note-images/u/img-up.jpg',
      local_uri: 'file:///u.jpg',
    });
    insertImageRow({
      uuid: 'img-tomb',
      note_id: noteId,
      s3_key: 'note-images/u/img-tomb.jpg',
      deleted_at: '2026-06-02 10:00:00.000',
    });

    const { changed } = await collectChanges('');
    const imageRows = changed.find((entry) => entry.table === 'note_images')!.rows;
    const byUuid = new Set(imageRows.map((entry) => entry.uuid));

    expect(byUuid.has('img-up')).toBe(true);
    expect(byUuid.has('img-tomb')).toBe(true);
    expect(byUuid.has('img-pending')).toBe(false); // still awaiting its S3 upload

    const uploaded = imageRows.find((entry) => entry.uuid === 'img-up')!;
    expect(uploaded.note_uuid).toBe(noteUuid);
    expect(uploaded.s3_key).toBe('note-images/u/img-up.jpg');
    expect(uploaded).not.toHaveProperty('note_id');
    expect(uploaded).not.toHaveProperty('local_uri'); // device-local, never on the wire
  });

  it('omits a tombstone that never got an s3_key (never uploaded → nothing to GC; would 400 the batch)', async () => {
    const noteId = await upsertNote(SEED_CROP_ID, SEED_WEEK, 'weekly');
    // Image added then its note deleted before any sync uploaded it: tombstoned
    // with s3_key still NULL. The server never knew this row, so it must not push
    // (a NULL s3_key fails the server's validation and rejects the whole batch).
    insertImageRow({
      uuid: 'img-tomb-nokey',
      note_id: noteId,
      deleted_at: '2026-06-02 10:00:00.000',
    });

    const { changed } = await collectChanges('');
    const imageEntry = changed.find((entry) => entry.table === 'note_images');
    const collected = imageEntry?.rows.map((entry) => entry.uuid) ?? [];
    expect(collected).not.toContain('img-tomb-nokey');
  });

  it('applyPull inserts a note_images row (note_uuid → local id) with local_uri left NULL for download', async () => {
    const noteId = await upsertNote(SEED_CROP_ID, SEED_WEEK, 'weekly');
    const noteUuid = uuidOf('notes', 'id', noteId);

    await applyPull(
      emptyPull({
        note_images: [
          {
            uuid: 'img-remote',
            note_uuid: noteUuid,
            s3_key: 'note-images/u/img-remote.jpg',
            created_at: '2026-06-01 10:00:00.000',
            updated_at: '2026-06-01 10:00:00.000',
            deleted_at: null,
          },
        ],
      }),
      '2026-06-30 00:00:00.000',
    );

    const imageRow = row<{ note_id: number; s3_key: string; local_uri: string | null }>(
      `SELECT note_id, s3_key, local_uri FROM note_images WHERE uuid = 'img-remote'`,
    );
    expect(imageRow.note_id).toBe(noteId);
    expect(imageRow.s3_key).toBe('note-images/u/img-remote.jpg');
    expect(imageRow.local_uri).toBeNull(); // triggers the download pass
  });

  it('pull sweep reaps an absent uploaded row but spares an absent pending-upload row', async () => {
    const noteId = await upsertNote(SEED_CROP_ID, SEED_WEEK, 'weekly');
    // Both old enough to be "previously synced" relative to syncStartedAt below.
    insertImageRow({
      uuid: 'img-old',
      note_id: noteId,
      s3_key: 'note-images/u/img-old.jpg',
      local_uri: 'file:///o.jpg',
      updated_at: '2000-01-01 00:00:00.000',
    });
    insertImageRow({
      uuid: 'img-pending',
      note_id: noteId,
      local_uri: 'file:///p.jpg',
      updated_at: '2000-01-01 00:00:00.000',
    });

    await applyPull(emptyPull({ note_images: [] }), '9999-12-31 00:00:00.000');

    // Server-known row absent from pull → deleted.
    expect(
      row<{ deleted_at: string | null }>(
        `SELECT deleted_at FROM note_images WHERE uuid = 'img-old'`,
      ).deleted_at,
    ).not.toBeNull();
    // Never-uploaded row → spared (its absence is expected, not a server delete).
    expect(
      row<{ deleted_at: string | null }>(
        `SELECT deleted_at FROM note_images WHERE uuid = 'img-pending'`,
      ).deleted_at,
    ).toBeNull();
  });
});

// ── backfillNoteImages (Slice F, existing-user upgrade) ─────────────────────────

describe('backfillNoteImages', () => {
  const legacyContent = JSON.stringify({
    version: 1,
    entries: [
      {
        id: 'entry-1',
        day_of_week: 2,
        text: 'planted',
        images: [
          { id: 'local-1', uri: 'file:///legacy.jpg', created_at: '2026-01-01T00:00:00.000Z' },
        ],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  });

  it('mints a uuid into each pre-Slice-F image and creates its note_images row', async () => {
    const noteId = await upsertNote(SEED_CROP_ID, SEED_WEEK, legacyContent);

    await backfillNoteImages(testAdapter);

    const content = row<{ content: string }>(
      `SELECT content FROM notes WHERE id = ?`,
      noteId,
    ).content;
    const mintedUuid = JSON.parse(content).entries[0].images[0].uuid as string;
    expect(mintedUuid).toBeTruthy();

    const imageRow = row<{ uuid: string; local_uri: string; s3_key: string | null }>(
      `SELECT uuid, local_uri, s3_key FROM note_images WHERE note_id = ?`,
      noteId,
    );
    // The row is keyed by the same uuid now embedded in the content (the join key).
    expect(imageRow.uuid).toBe(mintedUuid);
    expect(imageRow.local_uri).toBe('file:///legacy.jpg');
    expect(imageRow.s3_key).toBeNull(); // upload pending
  });

  it('is a no-op on a second run — no new rows, uuid stays stable', async () => {
    const noteId = await upsertNote(SEED_CROP_ID, SEED_WEEK, legacyContent);
    await backfillNoteImages(testAdapter);
    const firstUuid = row<{ content: string }>(
      `SELECT content FROM notes WHERE id = ?`,
      noteId,
    ).content.match(/"uuid":"([^"]+)"/)?.[1];

    await backfillNoteImages(testAdapter);

    const count = row<{ n: number }>(
      `SELECT COUNT(*) AS n FROM note_images WHERE note_id = ?`,
      noteId,
    ).n;
    expect(count).toBe(1);
    const secondUuid = row<{ content: string }>(
      `SELECT content FROM notes WHERE id = ?`,
      noteId,
    ).content.match(/"uuid":"([^"]+)"/)?.[1];
    expect(secondUuid).toBe(firstUuid);
  });
});

// ── runSync orchestration ─────────────────────────────────────────────────────

describe('runSync', () => {
  const originalFetch = global.fetch;

  const jsonResponse = (body: unknown, status = 200): Response =>
    ({
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (key: string) => (key.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as unknown as Response;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('pushes before pulling and advances the checkpoint on success', async () => {
    await insertLocation('Pushable');

    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      calls.push(url.includes('/sync/push') ? 'push' : 'pull');
      if (url.includes('/sync/push')) return jsonResponse({ accepted: 1, skipped: 0 });
      return jsonResponse(emptyPull({}));
    }) as unknown as typeof global.fetch;

    await runSync();

    expect(calls).toEqual(['push', 'pull']);
    const checkpoint = row<{ value: string } | undefined>(
      `SELECT value FROM settings WHERE key = 'last_pushed_at'`,
    );
    expect(checkpoint?.value).toBeTruthy();
  });

  it('does not advance the checkpoint when the push fails', async () => {
    await insertLocation('Pushable');

    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/sync/push')) return jsonResponse({ error: 'boom' }, 500);
      return jsonResponse(emptyPull({}));
    }) as unknown as typeof global.fetch;

    await expect(runSync()).rejects.toThrow();

    const checkpoint = row<{ value: string } | undefined>(
      `SELECT value FROM settings WHERE key = 'last_pushed_at'`,
    );
    expect(checkpoint).toBeUndefined();
  });
});
