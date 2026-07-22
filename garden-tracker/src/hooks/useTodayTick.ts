import { useEffect, useState } from 'react';

function localDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
}

/**
 * Re-renders the caller when the local calendar date changes, so components
 * that read `new Date()` (today cursor, today label, due/overdue split)
 * advance across the day boundary without a manual refresh.
 *
 * Polls the date key on a 30s interval rather than aiming a setTimeout at
 * midnight: JS timers count elapsed time, not wall-clock time, so a single
 * long timeout never fires when the device clock is changed and drifts when
 * iOS suspends the app. The interval catches a real midnight, a manual clock
 * change, and an app resume onto a new day, all within one poll cycle.
 *
 * Returns an opaque tick counter — callers don't need to read it; the act of
 * returning a changed value is what triggers the re-render.
 */
export function useTodayTick(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let lastDateKey = localDateKey();
    const interval = setInterval(() => {
      const currentDateKey = localDateKey();
      if (currentDateKey !== lastDateKey) {
        lastDateKey = currentDateKey;
        setTick((count) => count + 1);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  return tick;
}
