// * ==================================================
// *
// *    Unit tests — task read and write queries
// *
// *    getDb is mocked. Tests verify each function calls
// *    the db correctly and maps/returns the right values.
// *
// * ==================================================

import {
  getTasksForCrop,
  getCompletionsForCrop,
  getTaskTypes,
  insertTask,
  insertCompletion,
  deleteCompletion,
  deleteTask,
  getTodayAndOverdue,
} from '@/src/db/queries/taskQueries';
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

// ── getTasksForCrop ────────────────────────────────────────────────────────────

describe('getTasksForCrop', () => {
  it('returns tasks joined with task_types color and name', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, crop_instance_id: 1, task_type_id: 1, day_of_week: 3, frequency_weeks: 1, start_offset_weeks: 0, color: '#00CCFF', task_type_name: 'Watering' },
    ]);

    const results = await getTasksForCrop(1);

    expect(results).toHaveLength(1);
    expect(results[0].task_type_name).toBe('Watering');
    expect(results[0].color).toBe('#00CCFF');
    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('JOIN task_types'), 1);
  });

  it('returns empty array when crop has no tasks', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const results = await getTasksForCrop(99);

    expect(results).toHaveLength(0);
  });

  it('filters by the given crop_instance_id', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    await getTasksForCrop(42);

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.any(String), 42);
  });

  it('handles database errors', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getTasksForCrop(1)).rejects.toThrow('Database error');
  });
});

// ── getCompletionsForCrop ──────────────────────────────────────────────────────

describe('getCompletionsForCrop', () => {
  it('returns completions for the given crop', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, task_id: 1, completed_date: '2025-03-02' },
    ]);

    const results = await getCompletionsForCrop(1);

    expect(results).toHaveLength(1);
    expect(results[0].completed_date).toBe('2025-03-02');
    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('JOIN tasks'), 1);
  });

  it('returns empty array when no completions exist', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const results = await getCompletionsForCrop(1);

    expect(results).toHaveLength(0);
  });

  it('handles database errors', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getCompletionsForCrop(1)).rejects.toThrow('Database error');
  });
});

// ── getTaskTypes ───────────────────────────────────────────────────────────────

describe('getTaskTypes', () => {
  it('returns all task types', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, name: 'Watering', color: '#00CCFF' },
      { id: 2, name: 'Fertilizing', color: '#FF3300' },
    ]);

    const results = await getTaskTypes();

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Watering');
    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no task types exist', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const results = await getTaskTypes();

    expect(results).toHaveLength(0);
  });

  it('handles database errors', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getTaskTypes()).rejects.toThrow('Database error');
  });
});

// ── insertTask ─────────────────────────────────────────────────────────────────

describe('insertTask', () => {
  it('inserts into tasks and returns the new id', async () => {
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 7, changes: 1 });

    const id = await insertTask(1, 1, 3, 1, 0);

    expect(id).toBe(7);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tasks'),
      1, 1, 3, 1, 0
    );
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(insertTask(1, 1, 3, 1, 0)).rejects.toThrow('Database error');
  });
});

// ── insertCompletion ───────────────────────────────────────────────────────────

describe('insertCompletion', () => {
  it('inserts a completion record using INSERT OR IGNORE', async () => {
    mockDb.runAsync.mockResolvedValueOnce({});

    await insertCompletion(1, '2025-03-02');

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE'),
      1, '2025-03-02'
    );
  });

  it('resolves without a return value', async () => {
    mockDb.runAsync.mockResolvedValueOnce({});

    await expect(insertCompletion(1, '2025-03-02')).resolves.toBeUndefined();
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(insertCompletion(1, '2025-03-02')).rejects.toThrow('Database error');
  });
});

// ── deleteCompletion ───────────────────────────────────────────────────────────

describe('deleteCompletion', () => {
  it('deletes the completion matching task_id and completed_date', async () => {
    mockDb.runAsync.mockResolvedValueOnce({});

    await deleteCompletion(1, '2025-03-02');

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM task_completions'),
      1, '2025-03-02'
    );
  });

  it('resolves without a return value', async () => {
    mockDb.runAsync.mockResolvedValueOnce({});

    await expect(deleteCompletion(1, '2025-03-02')).resolves.toBeUndefined();
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(deleteCompletion(1, '2025-03-02')).rejects.toThrow('Database error');
  });
});

// ── deleteTask ─────────────────────────────────────────────────────────────────

describe('deleteTask', () => {
  it('deletes the task by id', async () => {
    mockDb.runAsync.mockResolvedValueOnce({});

    await deleteTask(5);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tasks'),
      5
    );
  });

  it('resolves without a return value', async () => {
    mockDb.runAsync.mockResolvedValueOnce({});

    await expect(deleteTask(1)).resolves.toBeUndefined();
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(deleteTask(1)).rejects.toThrow('Database error');
  });
});

// ── getTodayAndOverdue ────────────────────────────────────────────────────────

const TASK_ROW = {
  task_id: 1,
  crop_instance_id: 1,
  task_type_id: 1,
  task_type_name: 'Watering',
  color: '#00CCFF',
  crop_name: 'Tomato',
  section_name: 'Section A',
  garden_name: 'Raised Beds',
  location_name: 'Test Beds',
  start_date: '2025-03-02',
  day_of_week: 3,
  frequency_weeks: 1,
  start_offset_weeks: 0,
  total_duration_weeks: 9,
};

describe('getTodayAndOverdue', () => {
  it('returns due tasks for the reference date when incomplete', async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([TASK_ROW])
      .mockResolvedValueOnce([]);

    const { due } = await getTodayAndOverdue(new Date('2025-03-05T12:00:00'));

    expect(due).toHaveLength(1);
    expect(due[0].crop_name).toBe('Tomato');
    expect(due[0].due_date).toBe('2025-03-05');
    expect(due[0].week_date).toBe('2025-03-02');
  });

  it('excludes due tasks already completed for that week', async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([TASK_ROW])
      .mockResolvedValueOnce([{ task_id: 1, completed_date: '2025-03-02' }]);

    const { due } = await getTodayAndOverdue(new Date('2025-03-05T12:00:00'));

    expect(due).toHaveLength(0);
  });

  it('returns overdue tasks due in the last 7 days when incomplete', async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([TASK_ROW])
      .mockResolvedValueOnce([]);

    const { overdue } = await getTodayAndOverdue(new Date('2025-03-06T12:00:00'));

    expect(overdue).toHaveLength(1);
    expect(overdue[0].due_date).toBe('2025-03-05');
    expect(overdue[0].week_date).toBe('2025-03-02');
  });

  it('does not return overdue tasks completed for that week', async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([TASK_ROW])
      .mockResolvedValueOnce([{ task_id: 1, completed_date: '2025-03-02' }]);

    const { overdue } = await getTodayAndOverdue(new Date('2025-03-06T12:00:00'));

    expect(overdue).toHaveLength(0);
  });

  it('handles database errors', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getTodayAndOverdue(new Date('2025-03-05T12:00:00'))).rejects.toThrow('Database error');
  });
});
