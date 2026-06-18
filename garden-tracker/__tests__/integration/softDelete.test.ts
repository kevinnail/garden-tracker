// * ==================================================
// *
// *    Integration tests — Slice B soft-delete semantics
// *
// *    Real in-memory SQLite. These cover the behaviour that
// *    distinguishes soft-delete from the old hard-delete and
// *    spans multiple query modules:
// *      1. Deleted rows are *preserved* with deleted_at set
// *         (so a future sync can propagate the tombstone).
// *      2. Deleting a parent cascades a tombstone to every
// *         descendant in code (the FK ON DELETE CASCADE no
// *         longer fires for an UPDATE).
// *      3. Re-creating a uniquely-keyed row (task completion,
// *         week-cell note) revives its tombstone rather than
// *         silently no-opping against the UNIQUE constraint.
// *
// * ==================================================

import { deleteCropInstance, getCropStages } from '@/src/db/queries/cropQueries';
import {
  deleteLocation,
  getAllGardens,
  getAllLocations,
  getAllSections,
} from '@/src/db/queries/locationQueries';
import {
  deleteCompletion,
  getCompletionsForCrop,
  getTasksForCrop,
  insertCompletion,
} from '@/src/db/queries/taskQueries';
import { deleteNote, getNoteForCell, upsertNote } from '@/src/db/queries/noteQueries';
import { getDb } from '@/src/db/database';
import { setupTestDb, SEED } from '../setup';
import type BetterSqlite3 from 'better-sqlite3';

jest.mock('@/src/db/database', () => ({
  getDb: jest.fn(),
}));

let rawDb: BetterSqlite3.Database;

beforeEach(() => {
  const { db, adapter } = setupTestDb();
  rawDb = db;
  (getDb as jest.Mock).mockResolvedValue(adapter);
});

const countLive = (table: string, where = '1=1', ...params: unknown[]): number =>
  (
    rawDb
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted_at IS NULL AND ${where}`)
      .get(...params) as { n: number }
  ).n;

const getRow = <T>(sql: string, ...params: unknown[]): T => rawDb.prepare(sql).get(...params) as T;

// ── preserves the row, doesn't destroy it ───────────────────────────────────────

describe('soft-delete preserves the row', () => {
  it('tombstones the crop in place: row survives with data intact and deleted_at set', async () => {
    await deleteCropInstance(SEED.CROP_ID);

    const row = getRow<{ id: number; name: string; deleted_at: string | null }>(
      `SELECT id, name, deleted_at FROM crop_instances WHERE id = ?`,
      SEED.CROP_ID,
    );

    // The row is NOT gone — that is the whole point: a future sync needs the
    // tombstone to propagate the delete to other devices.
    expect(row).toBeDefined();
    expect(row.name).toBe(SEED.CROP_NAME);
    expect(row.deleted_at).not.toBeNull();
  });
});

// ── cascade: deleting a crop tombstones every descendant ────────────────────────

describe('deleteCropInstance cascade', () => {
  it('tombstones the crop and all of its stages, tasks, completions, and notes', async () => {
    // Seed already has 2 stages + 1 task on the crop. Add a completion + a note.
    await insertCompletion(SEED.TASK_ID, SEED.START_DATE);
    await upsertNote(SEED.CROP_ID, SEED.START_DATE, 'overwinter the bed');

    // Sanity: everything is live before the delete.
    expect(countLive('crop_stages', 'crop_instance_id = ?', SEED.CROP_ID)).toBe(SEED.STAGE_COUNT);
    expect(countLive('tasks', 'crop_instance_id = ?', SEED.CROP_ID)).toBe(1);
    expect(countLive('task_completions', 'task_id = ?', SEED.TASK_ID)).toBe(1);
    expect(countLive('notes', 'crop_instance_id = ?', SEED.CROP_ID)).toBe(1);

    await deleteCropInstance(SEED.CROP_ID);

    // Every descendant table now has zero *live* rows for this crop...
    expect(countLive('crop_stages', 'crop_instance_id = ?', SEED.CROP_ID)).toBe(0);
    expect(countLive('tasks', 'crop_instance_id = ?', SEED.CROP_ID)).toBe(0);
    expect(countLive('task_completions', 'task_id = ?', SEED.TASK_ID)).toBe(0);
    expect(countLive('notes', 'crop_instance_id = ?', SEED.CROP_ID)).toBe(0);

    // ...but the rows still physically exist as tombstones.
    expect(
      (
        rawDb
          .prepare(`SELECT COUNT(*) AS n FROM crop_stages WHERE crop_instance_id = ?`)
          .get(SEED.CROP_ID) as { n: number }
      ).n,
    ).toBe(SEED.STAGE_COUNT);

    // And the read layer hides them.
    expect(await getCropStages(SEED.CROP_ID)).toHaveLength(0);
    expect(await getTasksForCrop(SEED.CROP_ID)).toHaveLength(0);
    expect(await getCompletionsForCrop(SEED.CROP_ID)).toHaveLength(0);
    expect(await getNoteForCell(SEED.CROP_ID, SEED.START_DATE)).toBeNull();
  });
});

// ── cascade reaches all the way down from a top-level delete ─────────────────────

describe('deleteLocation cascade', () => {
  it('tombstones gardens, sections, crop_instances, and tasks beneath the location', async () => {
    const locationId = (await getAllLocations())[0].id;

    await deleteCompletion(SEED.TASK_ID, SEED.START_DATE); // no-op; just exercises the path
    await deleteLocation(locationId);

    // List reads at every level are empty.
    expect(await getAllLocations()).toHaveLength(0);
    expect(await getAllGardens()).toHaveLength(0);
    expect(await getAllSections()).toHaveLength(0);
    expect(await getTasksForCrop(SEED.CROP_ID)).toHaveLength(0);

    // Grandchildren two+ levels down are tombstoned, not orphaned-live.
    expect(countLive('crop_instances', 'section_id = ?', SEED.SECTION_ID)).toBe(0);
    expect(countLive('tasks', 'crop_instance_id = ?', SEED.CROP_ID)).toBe(0);
    expect(countLive('crop_stages', 'crop_instance_id = ?', SEED.CROP_ID)).toBe(0);
  });
});

// ── revive: re-creating a uniquely-keyed row clears its tombstone ────────────────

describe('undo / revive paths', () => {
  it('re-completing a task after uncompleting it revives the single existing row', async () => {
    await insertCompletion(SEED.TASK_ID, SEED.START_DATE);
    await deleteCompletion(SEED.TASK_ID, SEED.START_DATE);
    expect(await getCompletionsForCrop(SEED.CROP_ID)).toHaveLength(0);

    await insertCompletion(SEED.TASK_ID, SEED.START_DATE);

    const completions = await getCompletionsForCrop(SEED.CROP_ID);
    expect(completions).toHaveLength(1);
    expect(completions[0].completed_date).toBe(SEED.START_DATE);

    // The revive must not have inserted a duplicate — one physical row total.
    expect(
      (
        rawDb
          .prepare(
            `SELECT COUNT(*) AS n FROM task_completions WHERE task_id = ? AND completed_date = ?`,
          )
          .get(SEED.TASK_ID, SEED.START_DATE) as { n: number }
      ).n,
    ).toBe(1);
  });

  it('re-noting a week cell after deleting the note revives it with the new content', async () => {
    const id = await upsertNote(SEED.CROP_ID, SEED.START_DATE, 'first pass');
    await deleteNote(id);
    expect(await getNoteForCell(SEED.CROP_ID, SEED.START_DATE)).toBeNull();

    await upsertNote(SEED.CROP_ID, SEED.START_DATE, 'second pass');

    const note = await getNoteForCell(SEED.CROP_ID, SEED.START_DATE);
    expect(note).not.toBeNull();
    expect(note!.content).toBe('second pass');

    // Still a single physical row for the cell — revived, not duplicated.
    expect(
      (
        rawDb
          .prepare(`SELECT COUNT(*) AS n FROM notes WHERE crop_instance_id = ? AND week_date = ?`)
          .get(SEED.CROP_ID, SEED.START_DATE) as { n: number }
      ).n,
    ).toBe(1);
  });
});
