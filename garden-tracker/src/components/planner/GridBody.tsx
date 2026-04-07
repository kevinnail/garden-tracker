import React from 'react';
import { View, StyleSheet } from 'react-native';

import {
  CELL_WIDTH,
  ROW_HEIGHT,
  TOTAL_WEEKS,
  EMPTY_CELL_COLOR,
  PLACEHOLDER_ROW_COUNT,
} from '@/src/constants/layout';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  rowCount?: number;
  renderScrollX: number; // current horizontal scroll offset (JS state, from PlannerGrid)
  renderScrollY: number; // current vertical scroll offset (JS state, from PlannerGrid)
  viewWidth: number;     // visible viewport width in px
  viewHeight: number;    // visible viewport height in px
}

/**
 * GridBody renders the crop cell area — the part of the grid that contains
 * colored stage cells, past-week hatching, task lines, etc.
 *
 * It sits inside a large Animated.View (owned by PlannerGrid) whose dimensions
 * are TOTAL_WEEKS * CELL_WIDTH × rowCount * ROW_HEIGHT.  PlannerGrid translates
 * that Animated.View to create the scroll effect.
 *
 * GridBody itself only renders cells that fall within the visible viewport
 * (virtualization), using renderScrollX/renderScrollY to calculate the window.
 *
 * In Slice 1:  all cells are empty dark grey — just proving the grid renders.
 * In Slice 3:  CropCell is introduced with stage colors and past-week hatching.
 * In Slice 4:  TaskOverlay SVG is layered on top.
 */
export default function GridBody({
  rowCount = PLACEHOLDER_ROW_COUNT,
  renderScrollX,
  renderScrollY,
  viewWidth,
  viewHeight,
}: Props) {

  // ── Compute the visible window (with a 1-cell buffer on every edge) ──────
  const colStart = Math.max(0, Math.floor(renderScrollX / CELL_WIDTH) - 1);
  const colEnd   = Math.min(TOTAL_WEEKS - 1, Math.ceil((renderScrollX + viewWidth)  / CELL_WIDTH) + 1);
  const rowStart = Math.max(0, Math.floor(renderScrollY / ROW_HEIGHT) - 1);
  const rowEnd   = Math.min(rowCount - 1, Math.ceil((renderScrollY + viewHeight) / ROW_HEIGHT) + 1);

  // ── Render only the visible cells ─────────────────────────────────────────
  const cells: React.ReactElement[] = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      cells.push(
        <View
          key={`${row}-${col}`}
          style={[
            styles.cell,
            {
              left: col * CELL_WIDTH,
              top:  row * ROW_HEIGHT,
            },
          ]}
        />,
      );
    }
  }

  return <>{cells}</>;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
    // 1px less than full cell size — the gap shows BACKGROUND_COLOR through,
    // creating a thin grid-line effect without explicit border rendering.
    width:  CELL_WIDTH  - 1,
    height: ROW_HEIGHT  - 1,
    backgroundColor: EMPTY_CELL_COLOR,
  },
});
