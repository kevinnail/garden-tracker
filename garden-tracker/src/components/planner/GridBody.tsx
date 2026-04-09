import React from 'react';
import { View, StyleSheet } from 'react-native';

import {
  CELL_WIDTH,
  ROW_HEIGHT,
  TOTAL_WEEKS,
  BACKGROUND_COLOR,
} from '@/src/constants/layout';
import { todayWeekIndex } from '@/src/utils/dateUtils';
import { GridRowItem } from '@/src/types';
import CropCell from './CropCell';

// Must match RowHeader band colors so the full-width strips feel continuous
import {
  GARDEN_BAND,
  LOCATION_BAND,
  SECTION_BAND,
} from './RowHeader';

const TOTAL_WIDTH = TOTAL_WEEKS * CELL_WIDTH;

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
  const rowCount = rows.length;
  const todayCol = todayWeekIndex(calendarStart);

  const colStart = Math.max(0, Math.floor(renderScrollX / CELL_WIDTH) - 1);
  const colEnd   = Math.min(TOTAL_WEEKS - 1, Math.ceil((renderScrollX + viewWidth) / CELL_WIDTH) + 1);
  const rowStart = Math.max(0, Math.floor(renderScrollY / ROW_HEIGHT) - 1);
  const rowEnd   = Math.min(rowCount - 1, Math.ceil((renderScrollY + viewHeight) / ROW_HEIGHT) + 1);

  const elements: React.ReactElement[] = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    const rowItem = rows[row];
    const top = row * ROW_HEIGHT;

    if (rowItem?.type === 'crop_row') {
      for (let col = colStart; col <= colEnd; col++) {
        elements.push(
          <CropCell
            key={`${row}-${col}`}
            stageColor={rowItem.weekColorMap[col] ?? null}
            isPast={col < todayCol}
            style={{ left: col * CELL_WIDTH, top }}
          />
        );
      }
    } else {
      // All band rows render as a single seamless full-width strip (no cell-gap grid pattern)
      let bandColor: string;
      switch (rowItem?.type) {
        case 'group_header':
        case 'group_footer':
          bandColor = GARDEN_BAND;
          break;
        case 'location_header':
        case 'location_footer':
          bandColor = LOCATION_BAND;
          break;
        case 'section_header':
          bandColor = SECTION_BAND;
          break;
        default:
          // section_footer — gap between sections
          bandColor = BACKGROUND_COLOR;
      }

      elements.push(
        <View
          key={`band-${row}`}
          style={[styles.bandStrip, { top, backgroundColor: bandColor }]}
        />
      );
    }
  }

  return <>{elements}</>;
}

const styles = StyleSheet.create({
  bandStrip: {
    position: 'absolute',
    left: 0,
    width: TOTAL_WIDTH,
    height: ROW_HEIGHT,
  },
});
