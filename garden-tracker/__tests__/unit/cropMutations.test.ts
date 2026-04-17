// * ==================================================
// *
// *    Unit tests — crop write queries
// *
// *    getDb is mocked. Tests verify each mutation function
// *    calls the db with correct SQL and params.
// *
// *    Key invariant: start_date always snaps to the
// *    preceding Sunday before being written (VBA rule).
// *
// * ==================================================

import {
  insertCropInstance,
  insertCropStage,
  replaceCropStages,
  updateCropInstance,
  archiveCrop,
} from '@/src/db/queries/cropQueries';
import { getDb } from '@/src/db/database';

jest.mock('@/src/db/database', () => ({
  getDb: jest.fn(),
}));

const mockDb = {
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  runAsync: jest.fn(),
  withTransactionAsync: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDb as jest.Mock).mockResolvedValue(mockDb);
  mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
  mockDb.withTransactionAsync.mockImplementation(async (callback: () => Promise<void>) => callback());
});

// ── insertCropInstance ─────────────────────────────────────────────────────────

describe('insertCropInstance', () => {
  it('inserts into crop_instances and returns the new row id', async () => {
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 42, changes: 1 });

    const id = await insertCropInstance(1, 'Tomato', 6, '2025-03-02');

    expect(id).toBe(42);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crop_instances'),
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything()
    );
  });

  it('snaps a mid-week date to the preceding Sunday', async () => {
    // 2025-03-05 is Wednesday → should snap to 2025-03-02 (Sunday)
    await insertCropInstance(1, 'Basil', 2, '2025-03-05');

    const [, , , , writtenDate] = mockDb.runAsync.mock.calls[0];
    expect(writtenDate).toBe('2025-03-02');
  });

  it('leaves an already-Sunday date unchanged', async () => {
    // 2025-03-02 is a Sunday
    await insertCropInstance(1, 'Pepper', 4, '2025-03-02');

    const [, , , , writtenDate] = mockDb.runAsync.mock.calls[0];
    expect(writtenDate).toBe('2025-03-02');
  });

  it('snaps a Saturday to the Sunday six days earlier', async () => {
    // 2025-03-08 is Saturday → should snap to 2025-03-02
    await insertCropInstance(1, 'Kale', 3, '2025-03-08');

    const [, , , , writtenDate] = mockDb.runAsync.mock.calls[0];
    expect(writtenDate).toBe('2025-03-02');
  });

  it('falls back gracefully for an unparseable date string', async () => {
    await insertCropInstance(1, 'Kale', 3, 'not-a-date');

    const [, , , , writtenDate] = mockDb.runAsync.mock.calls[0];
    expect(writtenDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(insertCropInstance(1, 'Tomato', 6, '2025-03-02')).rejects.toThrow('Database error');
  });
});

// ── insertCropStage ────────────────────────────────────────────────────────────

describe('insertCropStage', () => {
  it('inserts into crop_stages with correct params', async () => {
    await insertCropStage(1, 2, 4, 0);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crop_stages'),
      1, 2, 4, 0
    );
  });

  it('resolves without a return value', async () => {
    await expect(insertCropStage(1, 1, 3, 0)).resolves.toBeUndefined();
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(insertCropStage(1, 1, 3, 0)).rejects.toThrow('Database error');
  });
});

// ── updateCropInstance ─────────────────────────────────────────────────────────

describe('updateCropInstance', () => {
  it('builds a SET clause for each provided field', async () => {
    await updateCropInstance(1, { name: 'Updated Tomato', plant_count: 8 });

    const sql: string = mockDb.runAsync.mock.calls[0][0];
    expect(sql).toContain('name = ?');
    expect(sql).toContain('plant_count = ?');
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it('always stamps updated_at', async () => {
    await updateCropInstance(1, { name: 'Basil' });

    const sql: string = mockDb.runAsync.mock.calls[0][0];
    expect(sql).toContain("updated_at = datetime('now')");
  });

  it('passes field values followed by id', async () => {
    await updateCropInstance(5, { name: 'Pepper', plant_count: 4 });

    const args: unknown[] = mockDb.runAsync.mock.calls[0];
    expect(args[args.length - 1]).toBe(5); // id is last
    expect(args).toContain('Pepper');
    expect(args).toContain(4);
  });

  it('normalizes start_date to the preceding Sunday before updating', async () => {
    await updateCropInstance(2, { start_date: '2025-03-05' });

    const args: unknown[] = mockDb.runAsync.mock.calls[0];
    expect(args).toContain('2025-03-02');
  });

  it('updates section_id when moving a crop between sections', async () => {
    await updateCropInstance(3, { section_id: 9 });

    const sql: string = mockDb.runAsync.mock.calls[0][0];
    expect(sql).toContain('section_id = ?');
    expect(mockDb.runAsync.mock.calls[0]).toContain(9);
  });

  it('returns early without writing when no fields are provided', async () => {
    await expect(updateCropInstance(1, {})).resolves.toBeUndefined();

    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('resolves without a return value', async () => {
    await expect(updateCropInstance(1, { plant_count: 3 })).resolves.toBeUndefined();
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(updateCropInstance(1, { name: 'Kale' })).rejects.toThrow('Database error');
  });
});

// ── replaceCropStages ─────────────────────────────────────────────────────────

describe('replaceCropStages', () => {
  it('replaces all stages for a crop inside a transaction', async () => {
    await replaceCropStages(7, [
      { stage_definition_id: 2, duration_weeks: 4 },
      { stage_definition_id: 3, duration_weeks: 8 },
    ]);

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(1, 'DELETE FROM crop_stages WHERE crop_instance_id = ?', 7);
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO crop_stages'),
      7,
      2,
      4,
      0
    );
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO crop_stages'),
      7,
      3,
      8,
      1
    );
  });

  it('supports replacing a crop with zero stages', async () => {
    await replaceCropStages(7, []);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM crop_stages WHERE crop_instance_id = ?', 7);
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(replaceCropStages(7, [{ stage_definition_id: 2, duration_weeks: 4 }])).rejects.toThrow('Database error');
  });
});

// ── archiveCrop ────────────────────────────────────────────────────────────────

describe('archiveCrop', () => {
  it('sets archived = 1 for the given id', async () => {
    await archiveCrop(5);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('archived = 1'),
      5
    );
  });

  it('stamps updated_at', async () => {
    await archiveCrop(3);

    const sql: string = mockDb.runAsync.mock.calls[0][0];
    expect(sql).toContain("updated_at = datetime('now')");
  });

  it('resolves without a return value', async () => {
    await expect(archiveCrop(1)).resolves.toBeUndefined();
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(archiveCrop(1)).rejects.toThrow('Database error');
  });
});
