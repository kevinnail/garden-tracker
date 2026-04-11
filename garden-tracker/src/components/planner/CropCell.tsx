import React, { useRef } from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Defs, Pattern, Line, Rect, Polygon } from 'react-native-svg';

import { CELL_WIDTH, ROW_HEIGHT, EMPTY_CELL_COLOR } from '@/src/constants/layout';

interface Props {
  stageColor: string | null; // null = empty cell (outside crop span)
  isPast: boolean;           // true = left of today's column
  hasNote?: boolean;         // shows red triangle in top-right corner
  style?: ViewStyle;         // position: absolute left/top injected by GridBody
  onPress?: () => void;
  onLongPress?: () => void;
}

/**
 * A single week cell in a crop row.
 *
 * - No stage  → dark grey background
 * - Has stage → colored background
 * - isPast    → diagonal hatch SVG overlay (matches VBA LastWeekFormat2 behavior)
 * - hasNote   → small red triangle in top-right corner
 *
 * Past hatch applies regardless of stage color — empty past cells also get hatched.
 * Per VBA: ALL cells left of today get the hatch, inside AND outside crop spans.
 */
export default function CropCell({ stageColor, isPast, hasNote = false, style, onPress, onLongPress }: Props) {
  const bg = stageColor ?? EMPTY_CELL_COLOR;
  const longPressTriggered = useRef(false);

  const handlePress = () => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }

    onPress?.();
  };

  const handleLongPress = () => {
    longPressTriggered.current = true;
    onLongPress?.();
  };

  return (
    <Pressable
      style={[styles.cell, { backgroundColor: bg }, style]}
      onPress={hasNote ? handlePress : undefined}
      onLongPress={handleLongPress}
      delayLongPress={250}
    >
      {isPast && (
        <Svg style={StyleSheet.absoluteFill} width={CELL_WIDTH} height={ROW_HEIGHT}>
          <Defs>
            <Pattern
              id="hatch"
              width="4"
              height="4"
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <Line x1="0" y1="0" x2="0" y2="4" stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
            </Pattern>
          </Defs>
          <Rect width={CELL_WIDTH} height={ROW_HEIGHT} fill="url(#hatch)" />
        </Svg>
      )}

      {hasNote && (
        <Svg style={styles.noteCorner} width={8} height={8}>
          <Polygon points="0,0 8,0 8,8" fill="#FF0000" />
        </Svg>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
    width: CELL_WIDTH - 1,
    height: ROW_HEIGHT - 1,
    overflow: 'hidden',
  },
  noteCorner: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
});
