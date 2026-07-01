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

import { collectChanges, applyPull, runSync, PullResponse } from '@/src/services/syncClient';
import { insertLocation, insertGarden, insertSection } from '@/src/db/queries/locationQueries';
import { insertCropWithStages, deleteCropInstance } from '@/src/db/queries/cropQueries';
import { getDb } from '@/src/db/database';
import { setupTestDb } from '../setup';
import type BetterSqlite3 from 'better-sqlite3';

jest.mock('@/src/db/database', () => ({ getDb: jest.fn() }));
jest.mock('@/src/services/authClient', () => ({
  authClient: { getCookie: jest.fn(() => 'better-auth.session_token=test-cookie') },
}));

let rawDb: BetterSqlite3.Database;

beforeEach(() => {
  const { db, adapter } = setupTestDb();
  rawDb = db;
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
  last_sync_at: '2026-06-30T00:00:00.000Z',
  ...overrides,
});

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
