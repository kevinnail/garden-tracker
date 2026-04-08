import React from 'react';
import { View, StyleSheet } from 'react-native';

import {
  CELL_WIDTH,
  ROW_HEIGHT,
  TOTAL_WEEKS,
  EMPTY_CELL_COLOR,
} from '@/src/constants/layout';
import { todayWeekIndex } from '@/src/utils/dateUtils';
import { GridRowItem } from '@/src/types';
import CropCell from './CropCell';

interface Props {
  rows: GridRowItem[];
  calendarStart: Date;
  renderScrollX: number;
  renderScrollY: number;
  viewWidth: number;
  viewHeight: number;
}

export default function GridBody({
  rows,
  calendarStart,
  renderScrollX,
  renderScrollY,
  viewWidth,
  viewHeight,
}: Props) {
  const rowCount  = rows.length;
  const todayCol  = todayWeekIndex(calendarStart);

  const colStart = Math.max(0, Math.floor(renderScrollX / CELL_WIDTH) - 1);
  const colEnd   = Math.min(TOTAL_WEEKS - 1, Math.ceil((renderScrollX + viewWidth)  / CELL_WIDTH) + 1);
  const rowStart = Math.max(0, Math.floor(renderScrollY / ROW_HEIGHT) - 1);
  const rowEnd   = Math.min(rowCount - 1, Math.ceil((renderScrollY + viewHeight) / ROW_HEIGHT) + 1);

  const cells: React.ReactElement[] = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    const rowItem = rows[row];
    const isPastRow = false; // group/section headers never get hatch

    for (let col = colStart; col <= colEnd; col++) {
      const left = col * CELL_WIDTH;
      const top  = row * ROW_HEIGHT;
      const isPast = col < todayCol;

      if (rowItem?.type === 'crop_row') {
        const stageColor = rowItem.weekColorMap[col] ?? null;
        cells.push(
          <CropCell
            key={`${row}-${col}`}
            stageColor={stageColor}
            isPast={isPast}
            style={{ left, top }}
          />
        );
      } else {
        cells.push(
          <View
            key={`${row}-${col}`}
            style={[styles.cell, { left, top }]}
          />
        );
      }
    }
  }

  return <>{cells}</>;
}

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
    width:  CELL_WIDTH  - 1,
    height: ROW_HEIGHT  - 1,
    backgroundColor: EMPTY_CELL_COLOR,
  },
});
