import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import {
  CELL_WIDTH,
  TOTAL_WEEKS,
  BACKGROUND_COLOR,
} from '@/src/constants/layout';
import { formatDateKey, todayWeekIndex, weekIndexToDate } from '@/src/utils/dateUtils';
import { GridRowItem } from '@/src/types';
import { getRowHeight, getVisibleRowRange } from '../../utils/rowLayout';
import CropCell from './CropCell';

// Must match RowHeader band colors so the full-width strips feel continuous
import {
  LOCATION_BAND,
  GARDEN_BAND,
  SECTION_BAND,
} from './RowHeader';

const TOTAL_WIDTH = TOTAL_WEEKS * CELL_WIDTH;

interface Props {
  rows: GridRowItem[];
  rowOffsets: number[];
  calendarStart: Date;
  renderScrollX: number;
  renderScrollY: number;
  viewWidth: number;
  viewHeight: number;
}

export default function GridBody({
  rows,
  rowOffsets,
  calendarStart,
  renderScrollX,
  renderScrollY,
  viewWidth,
  viewHeight,
}: Props) {
  const todayCol = todayWeekIndex(calendarStart);

  const colStart = Math.max(0, Math.floor(renderScrollX / CELL_WIDTH) - 1);
  const colEnd   = Math.min(TOTAL_WEEKS - 1, Math.ceil((renderScrollX + viewWidth) / CELL_WIDTH) + 1);
  const { rowStart, rowEnd } = getVisibleRowRange(rowOffsets, renderScrollY, viewHeight);

  const elements: React.ReactElement[] = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    const rowItem = rows[row];
    const top = rowOffsets[row];
    const height = getRowHeight(rowItem);

    if (rowItem?.type === 'crop_row') {
      for (let col = colStart; col <= colEnd; col++) {
        const weekDate = formatDateKey(weekIndexToDate(calendarStart, col));
        const hasNote = Boolean(rowItem.notesByWeek[weekDate]);

        const openNote = () => {
          router.push({
            pathname: '/(modals)/cell-note',
            params: {
              cropId: String(rowItem.crop.id),
              weekDate,
            },
          });
        };

        elements.push(
          <CropCell
            key={`${row}-${col}`}
            stageColor={rowItem.weekColorMap[col] ?? null}
            isPast={col < todayCol}
            hasNote={hasNote}
            style={{ left: col * CELL_WIDTH, top }}
            onPress={openNote}
            onLongPress={openNote}
          />
        );
      }
    } else {
      // All band rows render as a single seamless full-width strip (no cell-gap grid pattern)
      let bandColor: string;
      switch (rowItem?.type) {
        case 'location_header':
        case 'location_footer':
          bandColor = LOCATION_BAND;
          break;
        case 'garden_header':
        case 'garden_footer':
        case 'section_spacer':
          bandColor = GARDEN_BAND;
          break;
        case 'section_header':
        case 'section_footer':
          bandColor = SECTION_BAND;
          break;
        default:
          bandColor = BACKGROUND_COLOR;
      }

      elements.push(
        <View
          key={`band-${row}`}
          style={[styles.bandStrip, { top, height, backgroundColor: bandColor }]}
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
  },
});
