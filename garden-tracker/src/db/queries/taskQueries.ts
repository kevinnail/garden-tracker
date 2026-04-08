import { getDb } from '@/src/db/database';
import { Task, TaskCompletion, TaskType } from '@/src/types';

export async function getTasksForCrop(cropInstanceId: number): Promise<Task[]> {
  const db = await getDb();
  return db.getAllAsync<Task>(`
    SELECT
      t.id,
      t.crop_instance_id,
      t.task_type_id,
      t.day_of_week,
      t.frequency_weeks,
      t.start_offset_weeks,
      tt.color,
      tt.name AS task_type_name
    FROM tasks t
    JOIN task_types tt ON tt.id = t.task_type_id
    WHERE t.crop_instance_id = ?
  `, cropInstanceId);
}

export async function getCompletionsForCrop(cropInstanceId: number): Promise<TaskCompletion[]> {
  const db = await getDb();
  return db.getAllAsync<TaskCompletion>(`
    SELECT tc.id, tc.task_id, tc.completed_date
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE t.crop_instance_id = ?
  `, cropInstanceId);
}

export async function getTaskTypes(): Promise<TaskType[]> {
  const db = await getDb();
  return db.getAllAsync<TaskType>(`SELECT * FROM task_types ORDER BY id`);
}

export async function insertTask(
  cropInstanceId: number,
  taskTypeId: number,
  dayOfWeek: number,
  frequencyWeeks: number,
  startOffsetWeeks: number
): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO tasks (crop_instance_id, task_type_id, day_of_week, frequency_weeks, start_offset_weeks) VALUES (?, ?, ?, ?, ?)`,
    cropInstanceId, taskTypeId, dayOfWeek, frequencyWeeks, startOffsetWeeks
  );
  return result.lastInsertRowId;
}

export async function insertCompletion(taskId: number, weekDate: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO task_completions (task_id, completed_date) VALUES (?, ?)`,
    taskId, weekDate
  );
}

export async function deleteCompletion(taskId: number, weekDate: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM task_completions WHERE task_id = ? AND completed_date = ?`,
    taskId, weekDate
  );
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM tasks WHERE id = ?`, id);
}
