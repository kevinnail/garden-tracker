import { useEffect, useState } from 'react';

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Local NOON of the given date's calendar day. Anchoring to noon makes the
 * returned Date immune to Hermes' timezone-offset cache wobble: that cache can
 * be ~an hour stale, which only changes the calendar day when the real time is
 * within an hour of midnight — noon is never close, so `getDate()` on this value
 * is stable no matter which way the offset flickers.
 */
function localNoon(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

/**
 * Returns the current local day as a `Date` and re-renders the caller when the
 * day rolls over, so date-derived UI (today label, today cursor, due/overdue
 * split) advances without a manual refresh.
 *
 * IMPORTANT: format the RETURNED Date (e.g. `formatDateLabel(useTodayTick())`)
 * rather than a fresh `new Date()` at render time. See the body comment — a
 * render-time `new Date()` can catch a boundary-lagged local date and, on a
 * component that renders only once per rollover, freeze there.
 *
 * Polls on a 30s interval rather than aiming a setTimeout at midnight: JS timers
 * count elapsed time, not wall-clock time, so a single long timeout never fires
 * when the device clock changes and drifts when iOS suspends the app. The
 * interval catches a real midnight, a manual clock change, and an app resume
 * onto a new day, all within one poll cycle.
 */
export function useTodayTick(): Date {
  // Holds the current local day, captured WHEN the poll detects a rollover — not
  // re-read from `new Date()` at render time. At the exact midnight boundary the
  // local getters (getDate/getMonth) can briefly lag the wall clock; a component
  // that re-reads `new Date()` in that instant renders yesterday's date and, if
  // it only re-renders once (on the tick), sticks there. Capturing the poll's
  // reading — which has already crossed the boundary cleanly — avoids that.
  const [today, setToday] = useState(() => localNoon(new Date()));

  useEffect(() => {
    let lastDateKey = localDateKey(new Date());
    const interval = setInterval(() => {
      const now = new Date();
      const currentDateKey = localDateKey(now);
      if (currentDateKey !== lastDateKey) {
        lastDateKey = currentDateKey;
        setToday(localNoon(now));
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  return today;
}
