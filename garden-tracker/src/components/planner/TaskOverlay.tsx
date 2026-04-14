import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, SharedValue } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { TOTAL_WEEKS } from '@/src/constants/layout';
import { PrecomputedTaskLine } from '@/src/types';
import { usePlannerStore } from '@/src/store/plannerStore';
import { useCellLayout } from '@/src/hooks/useCellLayout';
import TodayCursor from './TodayCursor';

interface Props {
  calendarStart: Date;
  totalHeight: number;
  taskLines: PrecomputedTaskLine[];
  scrollX: SharedValue<number>;
  scrollY: SharedValue<number>;
}

/**
 * SVG overlay covering the full virtual canvas.
 * Receives precomputed task lines from the store — x computed at render time
 * from weekIndex + dayFraction so it scales correctly with zoom level.
 * Solid line = pending. Dashed = completed.
 */
export default function TaskOverlay({ calendarStart, totalHeight, taskLines, scrollX, scrollY }: Props) {
  const { cellWidth } = useCellLayout();
  const showTasks = usePlannerStore(s => s.showTasks);
  const showCursor = usePlannerStore(s => s.showCursor);

  const totalWidth = TOTAL_WEEKS * cellWidth;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -scrollX.value },
      { translateY: -scrollY.value },
    ],
  }));

  const lineElements = useMemo(() =>
    taskLines.map((line) => {
      const x = (line.weekIndex + line.dayFraction) * cellWidth;
      return (
        <Line
          key={`${line.key}-${line.dashed ? 'dashed' : 'solid'}`}
          x1={x}
          y1={line.y1}
          x2={x}
          y2={line.y2}
          stroke={line.color}
          strokeWidth={2}
          strokeDasharray={line.dashed ? '3,3' : undefined}
        />
      );
    }),
  [taskLines, cellWidth]);

  if (!showTasks && !showCursor) return null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { width: totalWidth, height: totalHeight }, animatedStyle]}
      pointerEvents="none"
    >
      <Svg width={totalWidth} height={totalHeight} style={StyleSheet.absoluteFill}>
        {showTasks && lineElements}
        {showCursor && (
          <TodayCursor calendarStart={calendarStart} totalHeight={totalHeight} />
        )}
      </Svg>
    </Animated.View>
  );
}
