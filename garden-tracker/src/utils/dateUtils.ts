import { CELL_WIDTH } from '@/src/constants/layout';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

/**
 * Format a Date as local YYYY-MM-DD without UTC conversion.
 */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse YYYY-MM-DD into a local Date at midnight.
 * Returns null for invalid input.
 */
export function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  const parsed = new Date(year, monthIndex, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function utcMidnightMs(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function weekDiff(startSunday: Date, endSunday: Date): number {
  const diffDays = (utcMidnightMs(endSunday) - utcMidnightMs(startSunday)) / MS_PER_DAY;
  return Math.round(diffDays / 7);
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
  return weekDiff(calendarStart, todaySunday);
}

/**
 * Return the 0-based column index for a specific date.
 * The date is snapped to its week's Sunday first.
 */
export function dateToWeekIndex(calendarStart: Date, date: Date): number {
  const sunday = toSunday(date);
  return weekDiff(calendarStart, sunday);
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
