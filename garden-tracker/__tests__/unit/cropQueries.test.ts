// * ==================================================
// *
// *    Unit tests — crop read queries
// *
// *    getDb is mocked. Tests verify each query function
// *    calls the db correctly and maps the returned rows.
// *
// * ==================================================

import { getCropsForSection, getCropStages, getStageDefs } from '@/src/db/queries/cropQueries';
import { getDb } from '@/src/db/database';

jest.mock('@/src/db/database', () => ({
  getDb: jest.fn(),
}));

const mockDb = {
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  runAsync: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDb as jest.Mock).mockResolvedValue(mockDb);
});

// ── getCropsForSection ─────────────────────────────────────────────────────────

describe('getCropsForSection', () => {
  it('returns active crops for a section', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, name: 'Tomato', plant_count: 6, start_date: '2025-03-02', section_id: 1, archived: 0, notes: null, created_at: '2025-03-02', updated_at: '2025-03-02' },
    ]);

    const results = await getCropsForSection(1);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Tomato');
    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('AND archived = 0'), 1);
  });

  it('maps SQLite integer 0 to boolean false for archived', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, name: 'Tomato', plant_count: 6, start_date: '2025-03-02', section_id: 1, archived: 0, notes: null },
    ]);

    const results = await getCropsForSection(1);

    expect(results[0].archived).toBe(false);
  });

  it('maps SQLite integer 1 to boolean true for archived when includeArchived is true', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 2, name: 'Lettuce', plant_count: 4, start_date: '2025-01-05', section_id: 1, archived: 1, notes: null },
    ]);

    const results = await getCropsForSection(1, true);

    expect(results[0].archived).toBe(true);
  });

  it('omits the archived filter when includeArchived is true', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    await getCropsForSection(1, true);

    const sql: string = mockDb.getAllAsync.mock.calls[0][0];
    expect(sql).not.toContain('AND archived = 0');
  });

  it('returns empty array when no crops exist for the section', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const results = await getCropsForSection(99);

    expect(results).toHaveLength(0);
  });

  it('handles database errors', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getCropsForSection(1)).rejects.toThrow('Database error');
  });
});

// ── getCropStages ──────────────────────────────────────────────────────────────

describe('getCropStages', () => {
  it('returns stages joined with stage_definitions color and name', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, crop_instance_id: 1, stage_definition_id: 1, duration_weeks: 3, order_index: 0, color: '#90EE90', stage_name: 'Seedling' },
      { id: 2, crop_instance_id: 1, stage_definition_id: 2, duration_weeks: 6, order_index: 1, color: '#00CC00', stage_name: 'Vegetative' },
    ]);

    const results = await getCropStages(1);

    expect(results).toHaveLength(2);
    expect(results[0].stage_name).toBe('Seedling');
    expect(results[0].color).toBe('#90EE90');
    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('JOIN stage_definitions'), 1);
  });

  it('orders results by order_index', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    await getCropStages(1);

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY cs.order_index'),
      1
    );
  });

  it('returns empty array when crop has no stages', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const results = await getCropStages(999);

    expect(results).toHaveLength(0);
  });

  it('handles database errors', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getCropStages(1)).rejects.toThrow('Database error');
  });
});

// ── getStageDefs ───────────────────────────────────────────────────────────────

describe('getStageDefs', () => {
  it('returns all stage definitions ordered by order_index', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, name: 'Seedling',   color: '#90EE90', order_index: 0 },
      { id: 2, name: 'Vegetative', color: '#00CC00', order_index: 1 },
    ]);

    const results = await getStageDefs();

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Seedling');
    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('ORDER BY order_index'));
  });

  it('returns empty array when no stage definitions exist', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const results = await getStageDefs();

    expect(results).toHaveLength(0);
  });

  it('handles database errors', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getStageDefs()).rejects.toThrow('Database error');
  });
});
