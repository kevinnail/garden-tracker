// * ==================================================
// *
// *    Integration tests — task read and write queries
// *
// *    Uses a real in-memory SQLite database via better-sqlite3.
// *    getDb is mocked to return the test adapter.
// *    Tests assert on actual returned data, not SQL strings.
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
  updateTaskDay,
  getTasksForCrops,
  getCompletionsForCrops,
  getTodayAndOverdue,
} from '@/src/db/queries/taskQueries';
import { getDb } from '@/src/db/database';
import { setupTestDb, SEED } from '../setup';

jest.mock('@/src/db/database', () => ({
  getDb: jest.fn(),
}));

let adapter: ReturnType<typeof setupTestDb>['adapter'];

beforeEach(() => {
  const { adapter: a } = setupTestDb();
  adapter = a;
  (getDb as jest.Mock).mockResolvedValue(adapter);
});

// ── getTasksForCrop ────────────────────────────────────────────────────────────

describe('getTasksForCrop', () => {
  it('returns the seeded task with joined task_type data', async () => {
    const tasks = await getTasksForCrop(SEED.CROP_ID);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(SEED.TASK_ID);
    expect(tasks[0].crop_instance_id).toBe(SEED.CROP_ID);
    expect(tasks[0].task_type_id).toBe(SEED.TASK_TYPE_ID);
    expect(tasks[0].day_of_week).toBe(SEED.TASK_DAY_OF_WEEK);
    expect(tasks[0].frequency_weeks).toBe(1);
    expect(tasks[0].start_offset_weeks).toBe(0);
  });

  it('returns color and task_type_name from joined task_types', async () => {
    const tasks = await getTasksForCrop(SEED.CROP_ID);

    expect(tasks[0].color).toBeTruthy();
    expect(typeof tasks[0].task_type_name).toBe('string');
    expect(tasks[0].task_type_name.length).toBeGreaterThan(0);
  });

  it('returns empty array for a crop with no tasks', async () => {
    const tasks = await getTasksForCrop(999);

    expect(tasks).toHaveLength(0);
  });

  it('only returns tasks for the given crop', async () => {
    const tasks = await getTasksForCrop(SEED.CROP_ID);

    expect(tasks.every(t => t.crop_instance_id === SEED.CROP_ID)).toBe(true);
  });
});

// ── getCompletionsForCrop ──────────────────────────────────────────────────────

describe('getCompletionsForCrop', () => {
  it('returns empty array when no completions exist', async () => {
    const completions = await getCompletionsForCrop(SEED.CROP_ID);

    expect(completions).toHaveLength(0);
  });

  it('returns a completion after inserting one', async () => {
    await insertCompletion(SEED.TASK_ID, '2025-03-05');

    const completions = await getCompletionsForCrop(SEED.CROP_ID);

    expect(completions).toHaveLength(1);
    expect(completions[0].task_id).toBe(SEED.TASK_ID);
    expect(completions[0].completed_date).toBe('2025-03-05');
  });

  it('returns multiple completions for the same task', async () => {
    await insertCompletion(SEED.TASK_ID, '2025-03-05');
    await insertCompletion(SEED.TASK_ID, '2025-03-12');

    const completions = await getCompletionsForCrop(SEED.CROP_ID);

    expect(completions).toHaveLength(2);
  });

  it('returns empty array for a crop with no completions', async () => {
    const completions = await getCompletionsForCrop(999);

    expect(completions).toHaveLength(0);
  });
});

// ── getTaskTypes ───────────────────────────────────────────────────────────────

describe('getTaskTypes', () => {
  it('returns all seeded task types', async () => {
    const types = await getTaskTypes();

    expect(types.length).toBeGreaterThan(0);
  });

  it('each task type has id, name, and color', async () => {
    const types = await getTaskTypes();

    for (const t of types) {
      expect(typeof t.id).toBe('number');
      expect(typeof t.name).toBe('string');
      expect(typeof t.color).toBe('string');
    }
  });

  it('the first type matches the seed task type', async () => {
    const types = await getTaskTypes();

    expect(types[0].id).toBe(SEED.TASK_TYPE_ID);
  });
});

// ── insertTask ─────────────────────────────────────────────────────────────────

describe('insertTask', () => {
  it('inserts a new task and returns its id', async () => {
    const id = await insertTask(SEED.CROP_ID, SEED.TASK_TYPE_ID, 1, 2, 0);

    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(SEED.TASK_ID);
  });

  it('the inserted task is readable via getTasksForCrop', async () => {
    const id = await insertTask(SEED.CROP_ID, SEED.TASK_TYPE_ID, 1, 2, 0);
    const tasks = await getTasksForCrop(SEED.CROP_ID);
    const inserted = tasks.find(t => t.id === id);

    expect(inserted).toBeDefined();
    expect(inserted!.day_of_week).toBe(1);
    expect(inserted!.frequency_weeks).toBe(2);
    expect(inserted!.start_offset_weeks).toBe(0);
  });

  it('does not affect tasks for other crops', async () => {
    await insertTask(SEED.CROP_ID, SEED.TASK_TYPE_ID, 1, 1, 0);

    const tasks = await getTasksForCrop(999);

    expect(tasks).toHaveLength(0);
  });
});

// ── insertCompletion ───────────────────────────────────────────────────────────

describe('insertCompletion', () => {
  it('inserts a completion that is then returned by getCompletionsForCrop', async () => {
    await insertCompletion(SEED.TASK_ID, '2025-03-05');

    const completions = await getCompletionsForCrop(SEED.CROP_ID);

    expect(completions).toHaveLength(1);
    expect(completions[0].completed_date).toBe('2025-03-05');
  });

  it('is idempotent — duplicate inserts do not throw or duplicate rows', async () => {
    await insertCompletion(SEED.TASK_ID, '2025-03-05');
    await insertCompletion(SEED.TASK_ID, '2025-03-05');

    const completions = await getCompletionsForCrop(SEED.CROP_ID);

    expect(completions).toHaveLength(1);
  });
});

// ── deleteCompletion ───────────────────────────────────────────────────────────

describe('deleteCompletion', () => {
  it('removes a completion so it no longer appears in getCompletionsForCrop', async () => {
    await insertCompletion(SEED.TASK_ID, '2025-03-05');
    await deleteCompletion(SEED.TASK_ID, '2025-03-05');

    const completions = await getCompletionsForCrop(SEED.CROP_ID);

    expect(completions).toHaveLength(0);
  });

  it('only deletes the matching date, not other completions', async () => {
    await insertCompletion(SEED.TASK_ID, '2025-03-05');
    await insertCompletion(SEED.TASK_ID, '2025-03-12');
    await deleteCompletion(SEED.TASK_ID, '2025-03-05');

    const completions = await getCompletionsForCrop(SEED.CROP_ID);

    expect(completions).toHaveLength(1);
    expect(completions[0].completed_date).toBe('2025-03-12');
  });

  it('does nothing when the completion does not exist', async () => {
    await expect(deleteCompletion(SEED.TASK_ID, '2025-03-05')).resolves.toBeUndefined();
  });
});

// ── deleteTask ─────────────────────────────────────────────────────────────────

describe('deleteTask', () => {
  it('removes the task so it no longer appears in getTasksForCrop', async () => {
    await deleteTask(SEED.TASK_ID);

    const tasks = await getTasksForCrop(SEED.CROP_ID);

    expect(tasks).toHaveLength(0);
  });

  it('does nothing when the task does not exist', async () => {
    await expect(deleteTask(999)).resolves.toBeUndefined();
  });
});

// ── dashboard queries ────────────────────────────────────────────────────────

describe('getTodayAndOverdue', () => {
  it('returns a seeded task in due when the day matches the reference date', async () => {
    const { due } = await getTodayAndOverdue(new Date('2025-03-05T12:00:00'));

    expect(due).toHaveLength(1);
    expect(due[0].task_id).toBe(SEED.TASK_ID);
    expect(due[0].crop_instance_id).toBe(SEED.CROP_ID);
    expect(due[0].crop_name).toBe(SEED.CROP_NAME);
    expect(due[0].section_name).toBe('Section A');
    expect(due[0].due_date).toBe('2025-03-05');
    expect(due[0].week_date).toBe(SEED.START_DATE);
  });

  it('does not return the task in due after completion is recorded for that week', async () => {
    await insertCompletion(SEED.TASK_ID, SEED.START_DATE);

    const { due } = await getTodayAndOverdue(new Date('2025-03-05T12:00:00'));

    expect(due).toHaveLength(0);
  });

  it('returns a task in overdue when due earlier this week and incomplete', async () => {
    const { overdue } = await getTodayAndOverdue(new Date('2025-03-06T12:00:00'));

    expect(overdue).toHaveLength(1);
    expect(overdue[0].task_id).toBe(SEED.TASK_ID);
    expect(overdue[0].due_date).toBe('2025-03-05');
  });

  it('does not return the task in overdue when that week is completed', async () => {
    await insertCompletion(SEED.TASK_ID, SEED.START_DATE);

    const { overdue } = await getTodayAndOverdue(new Date('2025-03-06T12:00:00'));

    expect(overdue).toHaveLength(0);
  });
});

// ── updateTaskDay ──────────────────────────────────────────────────────────────

describe('updateTaskDay', () => {
  it('updates the day_of_week field and the change is visible in getTasksForCrop', async () => {
    await updateTaskDay(SEED.TASK_ID, 5);

    const tasks = await getTasksForCrop(SEED.CROP_ID);

    expect(tasks[0].day_of_week).toBe(5);
  });

  it('does nothing when the task does not exist', async () => {
    await expect(updateTaskDay(999, 1)).resolves.toBeUndefined();
  });
});

// ── getTasksForCrops ───────────────────────────────────────────────────────────

describe('getTasksForCrops', () => {
  it('returns empty array for empty input without hitting the db', async () => {
    const tasks = await getTasksForCrops([]);

    expect(tasks).toHaveLength(0);
  });

  it('returns the seeded task when queried by crop id', async () => {
    const tasks = await getTasksForCrops([SEED.CROP_ID]);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(SEED.TASK_ID);
    expect(tasks[0].crop_instance_id).toBe(SEED.CROP_ID);
  });

  it('returns tasks for multiple crop ids', async () => {
    const id2 = await insertTask(SEED.CROP_ID, SEED.TASK_TYPE_ID, 1, 1, 0);

    const tasks = await getTasksForCrops([SEED.CROP_ID]);

    expect(tasks.map(t => t.id)).toContain(SEED.TASK_ID);
    expect(tasks.map(t => t.id)).toContain(id2);
  });

  it('returns empty array for a crop with no tasks', async () => {
    const tasks = await getTasksForCrops([999]);

    expect(tasks).toHaveLength(0);
  });
});

// ── getCompletionsForCrops ─────────────────────────────────────────────────────

describe('getCompletionsForCrops', () => {
  it('returns empty array for empty input', async () => {
    const completions = await getCompletionsForCrops([]);

    expect(completions).toHaveLength(0);
  });

  it('returns empty array when no completions exist', async () => {
    const completions = await getCompletionsForCrops([SEED.CROP_ID]);

    expect(completions).toHaveLength(0);
  });

  it('returns completions with crop_instance_id after inserting one', async () => {
    await insertCompletion(SEED.TASK_ID, '2025-03-05');

    const completions = await getCompletionsForCrops([SEED.CROP_ID]);

    expect(completions).toHaveLength(1);
    expect(completions[0].task_id).toBe(SEED.TASK_ID);
    expect(completions[0].crop_instance_id).toBe(SEED.CROP_ID);
    expect(completions[0].completed_date).toBe('2025-03-05');
  });

  it('returns empty array for a crop with no matching completions', async () => {
    await insertCompletion(SEED.TASK_ID, '2025-03-05');

    const completions = await getCompletionsForCrops([999]);

    expect(completions).toHaveLength(0);
  });
});
