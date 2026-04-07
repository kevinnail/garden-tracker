import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, SharedValue } from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { CELL_WIDTH, TOTAL_WEEKS } from '@/src/constants/layout';
import TodayCursor from './TodayCursor';

interface Props {
  calendarStart: Date;
  totalHeight: number;
  scrollX: SharedValue<number>;
  scrollY: SharedValue<number>;
}

/**
 * Absolutely-positioned SVG covering the full virtual canvas.
 * Translates with scrollX/scrollY so its content stays aligned with GridBody cells.
 *
 * For Slice 2: renders only TodayCursor.
 * Future slices will add task lines here.
 */
export default function TaskOverlay({ calendarStart, totalHeight, scrollX, scrollY }: Props) {
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
        <TodayCursor calendarStart={calendarStart} totalHeight={totalHeight} />
      </Svg>
    </Animated.View>
  );
}
