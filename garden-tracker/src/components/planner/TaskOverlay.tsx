import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, SharedValue } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { CELL_WIDTH, ROW_HEIGHT, TOTAL_WEEKS } from '@/src/constants/layout';
import { toSunday, dateToWeekIndex } from '@/src/utils/dateUtils';
import { getTaskLineOccurrences } from '@/src/utils/taskUtils';
import TodayCursor from './TodayCursor';

// ---------------------------------------------------------------------------
// Demo data (Slice 4 — removed in Slice 5 when DB is wired)
// ---------------------------------------------------------------------------

const _today = new Date();
const DEMO_START_DATE = toSunday(new Date(_today.getTime() - 4 * 7 * 24 * 60 * 60 * 1000));
const DEMO_TOTAL_WEEKS = 3 + 6 + 8; // must match GridBody demo stages

const DEMO_TASKS = [
  { id: 0, color: '#00CCFF', day_of_week: 3, frequency_weeks: 1, start_offset_weeks: 0 }, // Watering, Wed, weekly
  { id: 1, color: '#FF3300', day_of_week: 1, frequency_weeks: 2, start_offset_weeks: 1 }, // Fertilizing, Mon, biweekly
];

// Mark the first watering occurrence as completed
const DEMO_COMPLETED_WEEK_OFFSET = 0; // weekIndex = cropStartWeek + 0

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  calendarStart: Date;
  totalHeight: number;
  scrollX: SharedValue<number>;
  scrollY: SharedValue<number>;
}

/**
 * SVG overlay covering the full virtual canvas.
 * Renders task lines for every crop row + the today cursor.
 *
 * Lines are precomputed in useMemo (not per-frame) and passed as static SVG elements.
 * Solid line = pending. Dashed (strokeDasharray="3,3") = completed.
 */
export default function TaskOverlay({ calendarStart, totalHeight, scrollX, scrollY }: Props) {
  const totalWidth = TOTAL_WEEKS * CELL_WIDTH;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -scrollX.value },
      { translateY: -scrollY.value },
    ],
  }));

  // Precompute all task line positions once — not on every render
  const taskLines = useMemo(() => {
    const cropStartWeek = dateToWeekIndex(calendarStart, DEMO_START_DATE);
    const cropEndWeek   = cropStartWeek + DEMO_TOTAL_WEEKS - 1;
    const completedWeek = cropStartWeek + DEMO_COMPLETED_WEEK_OFFSET;

    // Row 0 = demo crop row
    const rowY1 = 0;
    const rowY2 = ROW_HEIGHT;

    return DEMO_TASKS.flatMap((task) =>
      getTaskLineOccurrences(task, cropStartWeek, cropEndWeek, calendarStart).map((occ) => {
        const isDone = task.id === 0 && occ.weekIndex === completedWeek;
        return {
          key: `t${task.id}-w${occ.weekIndex}`,
          x: occ.x,
          y1: rowY1,
          y2: rowY2,
          color: task.color,
          dashed: isDone,
        };
      }),
    );
  }, [calendarStart]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { width: totalWidth, height: totalHeight }, animatedStyle]}
      pointerEvents="none"
    >
      <Svg width={totalWidth} height={totalHeight} style={StyleSheet.absoluteFill}>
        {taskLines.map((line) => (
          <Line
            key={line.key}
            x1={line.x}
            y1={line.y1}
            x2={line.x}
            y2={line.y2}
            stroke={line.color}
            strokeWidth={2}
            strokeDasharray={line.dashed ? '3,3' : undefined}
          />
        ))}
        <TodayCursor calendarStart={calendarStart} totalHeight={totalHeight} />
      </Svg>
    </Animated.View>
  );
}
