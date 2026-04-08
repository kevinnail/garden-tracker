import React from 'react';
import { View, StyleSheet } from 'react-native';

import {
  CELL_WIDTH,
  ROW_HEIGHT,
  TOTAL_WEEKS,
  EMPTY_CELL_COLOR,
  PLACEHOLDER_ROW_COUNT,
} from '@/src/constants/layout';
import { toSunday, dateToWeekIndex, todayWeekIndex } from '@/src/utils/dateUtils';
import { getStageColorAtWeek } from '@/src/utils/stageUtils';
import CropCell from './CropCell';

// ---------------------------------------------------------------------------
// Demo crop (Slice 3 hardcoded data — removed in Slice 5 when DB is wired)
// ---------------------------------------------------------------------------

const _today = new Date();
const DEMO_START_DATE = toSunday(new Date(_today.getTime() - 4 * 7 * 24 * 60 * 60 * 1000));

const DEMO_STAGES = [
  { stage_name: 'Seedling',   color: '#90EE90', duration_weeks: 3 },
  { stage_name: 'Vegetative', color: '#00CC00', duration_weeks: 6 },
  { stage_name: 'Flowering',  color: '#007700', duration_weeks: 8 },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  rowCount?: number;
  calendarStart: Date;
  renderScrollX: number;
  renderScrollY: number;
  viewWidth: number;
  viewHeight: number;
}

export default function GridBody({
  rowCount = PLACEHOLDER_ROW_COUNT,
  calendarStart,
  renderScrollX,
  renderScrollY,
  viewWidth,
  viewHeight,
}: Props) {

  const cropStartWeek = dateToWeekIndex(calendarStart, DEMO_START_DATE);
  const todayCol      = todayWeekIndex(calendarStart);

  const colStart = Math.max(0, Math.floor(renderScrollX / CELL_WIDTH) - 1);
  const colEnd   = Math.min(TOTAL_WEEKS - 1, Math.ceil((renderScrollX + viewWidth)  / CELL_WIDTH) + 1);
  const rowStart = Math.max(0, Math.floor(renderScrollY / ROW_HEIGHT) - 1);
  const rowEnd   = Math.min(rowCount - 1, Math.ceil((renderScrollY + viewHeight) / ROW_HEIGHT) + 1);

  const cells: React.ReactElement[] = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const isPast = col < todayCol;

      if (row === 0) {
        // Demo crop row — use CropCell with stage color
        const stageColor = getStageColorAtWeek(DEMO_STAGES, col, cropStartWeek);
        cells.push(
          <CropCell
            key={`${row}-${col}`}
            stageColor={stageColor}
            isPast={isPast}
            style={{ left: col * CELL_WIDTH, top: row * ROW_HEIGHT }}
          />,
        );
      } else {
        // Placeholder rows — plain empty cell, no hatch outside crop spans
        cells.push(
          <View
            key={`${row}-${col}`}
            style={[styles.cell, { left: col * CELL_WIDTH, top: row * ROW_HEIGHT }]}
          />,
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
