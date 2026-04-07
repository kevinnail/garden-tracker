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

  // Small downward-pointing triangle arrowhead at the top
  const tipSize = 5;
  const arrowPoints = `${x},${y1 + tipSize * 2} ${x - tipSize},${y1} ${x + tipSize},${y1}`;

  return (
    <>
      <Polygon points={arrowPoints} fill="#FF0000" />
      <Line
        x1={x}
        y1={y1}
        x2={x}
        y2={y2}
        stroke="#FF0000"
        strokeWidth={2}
      />
    </>
  );
}
