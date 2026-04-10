import { getDb } from '@/src/db/database';
import { Task, TaskCompletion, TaskType, TodayTaskItem } from '@/src/types';
import { formatDateKey, parseDateKey, toSunday } from '@/src/utils/dateUtils';

interface DashboardTaskRow {
  task_id: number;
  crop_instance_id: number;
  task_type_id: number;
  task_type_name: string;
  color: string;
  crop_name: string;
  section_name: string;
  location_name: string;
  start_date: string;
  day_of_week: number;
  frequency_weeks: number;
  start_offset_weeks: number;
  total_duration_weeks: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcMidnightMs(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
}

function wholeWeekDiff(startSunday: Date, endSunday: Date): number {
  return Math.round((utcMidnightMs(endSunday) - utcMidnightMs(startSunday)) / (7 * MS_PER_DAY));
}

function getCropStartDate(startDate: string): Date | null {
  const strict = parseDateKey(startDate);
  if (strict) return strict;

  const loose = new Date(startDate);
  if (isNaN(loose.getTime())) {
    return null;
  }

  return toSunday(loose);
}

function isTaskScheduledOnDate(task: DashboardTaskRow, dueDate: Date): boolean {
  if (dueDate.getDay() !== task.day_of_week) {
    return false;
  }

  const cropStartDate = getCropStartDate(task.start_date);
  if (!cropStartDate || task.total_duration_weeks <= 0) {
    return false;
  }

  const occurrenceWeekDate = toSunday(dueDate);
  const weekOffset = wholeWeekDiff(cropStartDate, occurrenceWeekDate);

  if (weekOffset < task.start_offset_weeks) {
    return false;
  }

  if (weekOffset >= task.total_duration_weeks) {
    return false;
  }

  return (weekOffset - task.start_offset_weeks) % task.frequency_weeks === 0;
}

function countMissedOccurrences(
  task: DashboardTaskRow,
  mostRecentDueDate: Date,
  completions: Set<string>
): number {
  const stepDays = task.frequency_weeks * 7;
  let count = 0;
  let date = mostRecentDueDate;

  for (let i = 0; i < 52; i++) {
    if (!isTaskScheduledOnDate(task, date)) break;
    if (completions.has(`${task.task_id}:${formatDateKey(toSunday(date))}`)) break;
    count++;
    date = addDays(date, -stepDays);
  }

  return count;
}

function buildDashboardItem(task: DashboardTaskRow, dueDate: Date, missed_count = 1): TodayTaskItem {
  return {
    task_id: task.task_id,
    crop_instance_id: task.crop_instance_id,
    task_type_id: task.task_type_id,
    task_type_name: task.task_type_name,
    color: task.color,
    crop_name: task.crop_name,
    section_name: task.section_name,
    location_name: task.location_name,
    day_of_week: task.day_of_week,
    frequency_weeks: task.frequency_weeks,
    start_offset_weeks: task.start_offset_weeks,
    due_date: formatDateKey(dueDate),
    week_date: formatDateKey(toSunday(dueDate)),
    missed_count,
  };
}

function compareDashboardItems(a: TodayTaskItem, b: TodayTaskItem): number {
  if (a.due_date !== b.due_date) {
    return a.due_date.localeCompare(b.due_date);
  }

  if (a.location_name !== b.location_name) {
    return a.location_name.localeCompare(b.location_name);
  }

  if (a.section_name !== b.section_name) {
    return a.section_name.localeCompare(b.section_name);
  }

  if (a.crop_name !== b.crop_name) {
    return a.crop_name.localeCompare(b.crop_name);
  }

  return a.task_type_name.localeCompare(b.task_type_name);
}

async function getDashboardTasks(): Promise<DashboardTaskRow[]> {
  const db = await getDb();
  return db.getAllAsync<DashboardTaskRow>(`
    SELECT
      t.id AS task_id,
      t.crop_instance_id,
      t.task_type_id,
      tt.name AS task_type_name,
      tt.color,
      ci.name AS crop_name,
      ci.start_date,
      s.name AS section_name,
      l.name AS location_name,
      t.day_of_week,
      t.frequency_weeks,
      t.start_offset_weeks,
      COALESCE((
        SELECT SUM(cs.duration_weeks)
        FROM crop_stages cs
        WHERE cs.crop_instance_id = ci.id
      ), 0) AS total_duration_weeks
    FROM tasks t
    JOIN task_types tt ON tt.id = t.task_type_id
    JOIN crop_instances ci ON ci.id = t.crop_instance_id
    JOIN sections s ON s.id = ci.section_id
    JOIN locations l ON l.id = s.location_id
    WHERE ci.archived = 0
    ORDER BY l.order_index, s.order_index, ci.start_date, ci.id, t.id
  `);
}

async function getCompletionSet(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ task_id: number; completed_date: string }>(`
    SELECT tc.task_id, tc.completed_date
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    JOIN crop_instances ci ON ci.id = t.crop_instance_id
    WHERE ci.archived = 0
  `);

  return new Set((rows ?? []).map(row => `${row.task_id}:${row.completed_date}`));
}

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

export async function updateTaskDay(id: number, dayOfWeek: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE tasks SET day_of_week = ? WHERE id = ?`, dayOfWeek, id);
}

export async function getTodayAndOverdue(referenceDate: Date = new Date()): Promise<{ due: TodayTaskItem[]; overdue: TodayTaskItem[] }> {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const [tasks, completions] = await Promise.all([getDashboardTasks(), getCompletionSet()]);

  const todayWeekDate = formatDateKey(toSunday(today));
  const due = tasks
    .filter(task => task.day_of_week === today.getDay())
    .filter(task => isTaskScheduledOnDate(task, today))
    .filter(task => !completions.has(`${task.task_id}:${todayWeekDate}`))
    .map(task => buildDashboardItem(task, today))
    .sort(compareDashboardItems);

  const overdueFloor = addDays(today, -7);
  const overdue = tasks
    .map(task => {
      const dayDelta = (7 + today.getDay() - task.day_of_week) % 7;
      const daysBack = dayDelta === 0 ? 7 : dayDelta;
      return { task, dueDate: addDays(today, -daysBack) };
    })
    .filter(({ dueDate }) => utcMidnightMs(dueDate) >= utcMidnightMs(overdueFloor))
    .filter(({ task, dueDate }) => isTaskScheduledOnDate(task, dueDate))
    .filter(({ task, dueDate }) => !completions.has(`${task.task_id}:${formatDateKey(toSunday(dueDate))}`))
    .map(({ task, dueDate }) => buildDashboardItem(task, dueDate, countMissedOccurrences(task, dueDate, completions)))
    .sort(compareDashboardItems);

  return { due, overdue };
}
