import React from 'react';
import { Line, Polygon } from 'react-native-svg';

import { CELL_WIDTH } from '@/src/constants/layout';
import { dayXOffset, todayWeekIndex } from '@/src/utils/dateUtils';

interface Props {
  calendarStart: Date;
  totalHeight: number;
}

/**
 * Red vertical line at today's exact day-of-week slot.
 * Rendered inside TaskOverlay's <Svg> — no wrapper element.
 *
 * x = todayCol * CELL_WIDTH + dayXOffset(today.getDay())
 */
export default function TodayCursor({ calendarStart, totalHeight }: Props) {
  const today = new Date();
  const col = todayWeekIndex(calendarStart);

  const x = col * CELL_WIDTH + dayXOffset(today.getDay());
  const y1 = 0;
  const y2 = totalHeight;

  // Excel-like "double line": two thin strokes with a small gap.
  const stroke = '#9000ff';
  const lineStrokeWidth = 1;
  const lineGap = 2; // distance between the two line centers

  // For crisp 1px strokes, align to half-pixels.
  const crisp = (value: number) => Math.round(value) + 0.5;
  const xLeft = crisp(x - lineGap / 2);
  const xRight = crisp(x + lineGap / 2);

  // Small downward-pointing triangle arrowhead at the top
  const tipSize = 5;
  const arrowPoints = `${x},${y1 + tipSize * 2} ${x - tipSize},${y1} ${x + tipSize},${y1}`;

  return (
    <>
      <Polygon points={arrowPoints} fill={stroke} />
      <Line x1={xLeft} y1={y1} x2={xLeft} y2={y2} stroke={stroke} strokeWidth={lineStrokeWidth} />
      <Line x1={xRight} y1={y1} x2={xRight} y2={y2} stroke={stroke} strokeWidth={lineStrokeWidth} />
    </>
  );
}
