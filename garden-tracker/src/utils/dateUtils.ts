import { CELL_WIDTH } from '@/src/constants/layout';

// ---------------------------------------------------------------------------
// Sunday snapping
// ---------------------------------------------------------------------------

/**
 * Return the most recent Sunday on or before the given date.
 * The calendar always starts on a Sunday (matching VBA behavior in DrawCalendar3.bas).
 */
export function toSunday(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // getDay() returns 0 for Sunday
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Column index math
// ---------------------------------------------------------------------------

/**
 * Return the Date (a Sunday) for the given 0-based week column index.
 * Column 0 = calendarStart, column 1 = calendarStart + 7 days, etc.
 */
export function weekIndexToDate(calendarStart: Date, index: number): Date {
  const d = new Date(calendarStart);
  d.setDate(d.getDate() + index * 7);
  return d;
}

/**
 * Return the 0-based column index for the week that contains today.
 * Returns -1 if today is before calendarStart.
 */
export function todayWeekIndex(calendarStart: Date): number {
  const todaySunday = toSunday(new Date());
  const diffMs = todaySunday.getTime() - calendarStart.getTime();
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Return the 0-based column index for a specific date.
 * The date is snapped to its week's Sunday first.
 */
export function dateToWeekIndex(calendarStart: Date, date: Date): number {
  const sunday = toSunday(date);
  const diffMs = sunday.getTime() - calendarStart.getTime();
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// Day-of-week positioning
// ---------------------------------------------------------------------------

/**
 * Return 0=Sun, 1=Mon, … 6=Sat for a given date.
 */
export function dayOfWeekIndex(date: Date): number {
  return date.getDay();
}

/**
 * X offset in pixels from the LEFT EDGE of a week cell to the center of
 * a given day's slot within that cell.
 *
 * The week cell is divided into 7 equal slots.  This places the line at the
 * CENTER of the slot for the requested day, which gives the same visual
 * result as the VBA pixel offsets in TaskForm.frm / Cursor_Update.bas.
 *
 *   dayXOffset(0) ≈ CELL_WIDTH * (1/14)   → Sunday center
 *   dayXOffset(3) ≈ CELL_WIDTH * (7/14)   → Wednesday center
 *   dayXOffset(6) ≈ CELL_WIDTH * (13/14)  → Saturday center
 */
export function dayXOffset(dayOfWeek: number): number {
  return (dayOfWeek / 7) * CELL_WIDTH + CELL_WIDTH / 14;
}

// ---------------------------------------------------------------------------
// Calendar start
// ---------------------------------------------------------------------------

/**
 * Default calendar start: the Sunday that is 8 weeks before today.
 * This gives a bit of historical context to the left of today on first load.
 */
export function defaultCalendarStart(): Date {
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
  return toSunday(eightWeeksAgo);
}
