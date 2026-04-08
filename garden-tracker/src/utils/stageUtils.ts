/**
 * Given a flat ordered list of stages (each with a duration_weeks and color),
 * return the hex color active at `weekIndex`, or null if outside the crop span.
 *
 * cropStartWeek: the column index where the crop begins (week 0 of the crop).
 */
export function getStageColorAtWeek(
  stages: { color: string; duration_weeks: number }[],
  weekIndex: number,
  cropStartWeek: number,
): string | null {
  const offset = weekIndex - cropStartWeek;
  if (offset < 0) return null;

  let cursor = 0;
  for (const stage of stages) {
    cursor += stage.duration_weeks;
    if (offset < cursor) return stage.color;
  }

  return null; // past the end of the crop span
}
