import { CELL_WIDTH } from '@/src/constants/layout';
import { dayXOffset, weekIndexToDate, formatDateKey } from '@/src/utils/dateUtils';

export interface TaskLineOccurrence {
  x: number;           // pixel x within the virtual canvas
  weekIndex: number;   // column index (used to check completions)
  weekSunday: string;  // ISO date of that week's Sunday (key for completion lookup)
}

interface TaskDef {
  day_of_week: number;
  frequency_weeks: number;
  start_offset_weeks: number;
}

/**
 * Returns every x-position where a task line should be drawn across the crop span.
 *
 * - First occurrence: cropStartWeek + start_offset_weeks
 * - Subsequent: every frequency_weeks columns after that
 * - Stops at (and including) cropEndWeek
 *
 * Precomputed once per crop load — not called per cell render.
 */
export function getTaskLineOccurrences(
  task: TaskDef,
  cropStartWeek: number,
  cropEndWeek: number,
  calendarStart: Date,
): TaskLineOccurrence[] {
  const results: TaskLineOccurrence[] = [];
  // DB schema enforces frequency_weeks > 0, but clamp defensively so a bad
  // synthesized Task (tests, future schema changes) can never spin forever.
  const step = Math.max(1, task.frequency_weeks);
  const xOffset = dayXOffset(task.day_of_week);
  let col = cropStartWeek + task.start_offset_weeks;

  while (col <= cropEndWeek) {
    const weekSunday = formatDateKey(weekIndexToDate(calendarStart, col));
    results.push({
      x: col * CELL_WIDTH + xOffset,
      weekIndex: col,
      weekSunday,
    });
    col += step;
  }

  return results;
}
