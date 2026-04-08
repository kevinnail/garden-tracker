import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, SharedValue } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { CELL_WIDTH, TOTAL_WEEKS } from '@/src/constants/layout';
import { PrecomputedTaskLine } from '@/src/types';
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
 * Receives precomputed task lines from the store — no computation here.
 * Solid line = pending. Dashed = completed.
 */
export default function TaskOverlay({ calendarStart, totalHeight, taskLines, scrollX, scrollY }: Props) {
  const totalWidth = TOTAL_WEEKS * CELL_WIDTH;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -scrollX.value },
      { translateY: -scrollY.value },
    ],
  }));

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
