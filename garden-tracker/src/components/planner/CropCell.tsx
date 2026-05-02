import React, { useRef } from 'react';
import { Pressable, ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { EMPTY_CELL_COLOR } from '@/src/constants/layout';
import { useCellLayout } from '@/src/hooks/useCellLayout';

interface Props {
  stageColor: string | null;     // null = empty cell (outside crop span)
  hasNote?: boolean;             // shows red triangle in top-right corner
  showNoteIndicators?: boolean;  // when false, suppresses the red triangle
  style?: ViewStyle;             // position: absolute left/top injected by GridBody
  onPress?: () => void;
  onLongPress?: () => void;
}

/**
 * A single week cell in a crop row.
 *
 * - No stage  → dark grey background
 * - Has stage → colored background
 * - hasNote   → small red triangle in top-right corner
 *
 */
export default function CropCell({ stageColor, hasNote = false, showNoteIndicators = true, style, onPress, onLongPress }: Props) {
  const { cellWidth, rowHeight } = useCellLayout();
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
      style={[{ position: 'absolute', width: cellWidth - 1, height: rowHeight - 1, overflow: 'hidden', backgroundColor: bg }, style]}
      onPress={hasNote ? handlePress : undefined}
      onLongPress={handleLongPress}
      delayLongPress={250}
    >
      {showNoteIndicators && hasNote && (
        <Svg style={styles.noteCorner} width={8} height={8}>
          <Polygon points="0,0 8,0 8,8" fill="#FF0000" />
        </Svg>
      )}
    </Pressable>
  );
}

const styles = {
  noteCorner: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
  },
};
