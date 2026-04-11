import { useEffect, useState } from 'react';

/**
 * Re-renders the caller at the next local midnight so components that read
 * `new Date()` (today cursor, today label, etc.) advance across the day
 * boundary for a long-running session that never unmounts.
 *
 * Returns an opaque tick counter — callers don't need to read it; the act of
 * returning a changed value is what triggers the re-render.
 */
export function useTodayTick(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0, 0, 0, 100, // +100ms cushion so Date() is unambiguously on the new day
    ).getTime();
    const delay = Math.max(1000, nextMidnight - now.getTime());

    const timer = setTimeout(() => setTick(t => t + 1), delay);
    return () => clearTimeout(timer);
  }, [tick]);

  return tick;
}
