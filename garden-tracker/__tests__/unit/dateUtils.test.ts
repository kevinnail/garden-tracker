// * ==================================================
// *
// *    Unit tests — date utility functions
// *
// *    Pure functions — no mocking required.
// *    These are the calendar math rules that must match
// *    the original VBA behavior exactly.
// *
// * ==================================================

import {
  toSunday,
  formatDateKey,
  parseDateKey,
  dayXOffset,
  defaultCalendarStart,
  weekIndexToDate,
  dateToWeekIndex,
} from '@/src/utils/dateUtils';
import { CELL_WIDTH } from '@/src/constants/layout';

// ── toSunday ───────────────────────────────────────────────────────────────────

describe('toSunday', () => {
  it('returns the same date if already a Sunday', () => {
    const sunday = new Date(2025, 2, 2); // March 2, 2025 is a Sunday
    expect(toSunday(sunday).getDay()).toBe(0);
    expect(toSunday(sunday).getDate()).toBe(2);
  });

  it('snaps Monday back one day to Sunday', () => {
    const monday = new Date(2025, 2, 3); // Monday March 3
    expect(toSunday(monday).getDate()).toBe(2);
  });

  it('snaps Saturday back six days to Sunday', () => {
    const saturday = new Date(2025, 2, 8); // Saturday March 8
    expect(toSunday(saturday).getDate()).toBe(2);
  });

  it('snaps a mid-week date to the preceding Sunday', () => {
    const wednesday = new Date(2025, 2, 5); // Wednesday March 5
    expect(toSunday(wednesday).getDate()).toBe(2);
  });

  it('always returns day-of-week 0 (Sunday)', () => {
    for (let day = 0; day < 7; day++) {
      const d = new Date(2025, 2, 2 + day); // March 2–8, 2025
      expect(toSunday(d).getDay()).toBe(0);
    }
  });

  it('sets the time to midnight', () => {
    const d = new Date(2025, 2, 5, 14, 30, 0); // Wednesday afternoon
    const result = toSunday(d);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it('does not mutate the original date', () => {
    const original = new Date(2025, 2, 5);
    const originalTime = original.getTime();
    toSunday(original);
    expect(original.getTime()).toBe(originalTime);
  });
});

// ── formatDateKey ──────────────────────────────────────────────────────────────

describe('formatDateKey', () => {
  it('formats a date as YYYY-MM-DD', () => {
    const d = new Date(2025, 2, 2); // March 2, 2025
    expect(formatDateKey(d)).toBe('2025-03-02');
  });

  it('zero-pads single-digit months', () => {
    const d = new Date(2025, 0, 15); // January
    expect(formatDateKey(d)).toMatch(/^2025-01-/);
  });

  it('zero-pads single-digit days', () => {
    const d = new Date(2025, 2, 5); // March 5
    expect(formatDateKey(d)).toMatch(/-05$/);
  });

  it('handles December correctly (month index 11)', () => {
    const d = new Date(2025, 11, 31); // December 31
    expect(formatDateKey(d)).toBe('2025-12-31');
  });
});

// ── parseDateKey ───────────────────────────────────────────────────────────────

describe('parseDateKey', () => {
  it('parses a valid YYYY-MM-DD string into a local Date', () => {
    const result = parseDateKey('2025-03-02');
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(2); // March = index 2
    expect(result!.getDate()).toBe(2);
  });

  it('returns null for a non-date string', () => {
    expect(parseDateKey('not-a-date')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseDateKey('')).toBeNull();
  });

  it('returns null for an invalid date like Feb 31', () => {
    expect(parseDateKey('2025-02-31')).toBeNull();
  });

  it('returns null for partial date strings', () => {
    expect(parseDateKey('2025-03')).toBeNull();
  });

  it('returns a date at midnight', () => {
    const result = parseDateKey('2025-03-02');
    expect(result!.getHours()).toBe(0);
    expect(result!.getMinutes()).toBe(0);
  });

  it('round-trips correctly with formatDateKey', () => {
    const key = '2025-03-02';
    expect(formatDateKey(parseDateKey(key)!)).toBe(key);
  });
});

// ── dayXOffset ─────────────────────────────────────────────────────────────────

describe('dayXOffset', () => {
  it('places Sunday at 1/14 of CELL_WIDTH from the left edge', () => {
    expect(dayXOffset(0)).toBeCloseTo(CELL_WIDTH / 14);
  });

  it('places Saturday at 13/14 of CELL_WIDTH from the left edge', () => {
    expect(dayXOffset(6)).toBeCloseTo((6 / 7) * CELL_WIDTH + CELL_WIDTH / 14);
  });

  it('places Wednesday at the midpoint of the cell', () => {
    // day 3 of 7 → (3/7)*52 + 52/14 ≈ 22.28 + 3.71 ≈ 25.99
    expect(dayXOffset(3)).toBeCloseTo((3 / 7) * CELL_WIDTH + CELL_WIDTH / 14);
  });

  it('returns a value within the cell width for all days', () => {
    for (let day = 0; day <= 6; day++) {
      const offset = dayXOffset(day);
      expect(offset).toBeGreaterThan(0);
      expect(offset).toBeLessThan(CELL_WIDTH);
    }
  });
});

// ── defaultCalendarStart ───────────────────────────────────────────────────────

describe('defaultCalendarStart', () => {
  it('returns a Sunday', () => {
    expect(defaultCalendarStart().getDay()).toBe(0);
  });

  it('is approximately 8 weeks before today', () => {
    const start = defaultCalendarStart();
    const eightWeeksMs = 8 * 7 * 24 * 60 * 60 * 1000;
    const diff = Date.now() - start.getTime();
    // Within one week of 8 weeks ago (accounts for Sunday-snapping)
    expect(diff).toBeGreaterThan(eightWeeksMs - 7 * 24 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(eightWeeksMs + 7 * 24 * 60 * 60 * 1000);
  });
});

// ── weekIndexToDate ────────────────────────────────────────────────────────────

describe('weekIndexToDate', () => {
  it('returns calendarStart itself for index 0', () => {
    const start = new Date(2025, 2, 2); // Sunday
    expect(weekIndexToDate(start, 0).getTime()).toBe(start.getTime());
  });

  it('returns calendarStart + 7 days for index 1', () => {
    const start = new Date(2025, 2, 2);
    expect(weekIndexToDate(start, 1).getDate()).toBe(9); // March 9
  });

  it('returns calendarStart + 14 days for index 2', () => {
    const start = new Date(2025, 2, 2);
    expect(weekIndexToDate(start, 2).getDate()).toBe(16); // March 16
  });
});

// ── dateToWeekIndex ────────────────────────────────────────────────────────────

describe('dateToWeekIndex', () => {
  it('returns 0 for a date in the same week as calendarStart', () => {
    const start = new Date(2025, 2, 2); // Sunday March 2
    const wednesday = new Date(2025, 2, 5);
    expect(dateToWeekIndex(start, wednesday)).toBe(0);
  });

  it('returns 1 for a date in the next week', () => {
    const start = new Date(2025, 2, 2);
    const nextWeek = new Date(2025, 2, 9);
    expect(dateToWeekIndex(start, nextWeek)).toBe(1);
  });

  it('returns 4 for a date four weeks out', () => {
    const start = new Date(2025, 2, 2);
    const fourWeeks = new Date(2025, 2, 30);
    expect(dateToWeekIndex(start, fourWeeks)).toBe(4);
  });
});
