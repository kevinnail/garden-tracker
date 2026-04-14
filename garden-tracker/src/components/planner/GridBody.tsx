import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, Pattern, Line, Rect } from 'react-native-svg';
import { router } from 'expo-router';

import {
  TOTAL_WEEKS,
  BACKGROUND_COLOR,
} from '@/src/constants/layout';
import { formatDateKey, todayWeekIndex, weekIndexToDate } from '@/src/utils/dateUtils';
import { GridRowItem } from '@/src/types';
import { getRowHeight, getVisibleRowRange } from '../../utils/rowLayout';
import { usePlannerStore } from '@/src/store/plannerStore';
import { useCellLayout } from '@/src/hooks/useCellLayout';
import CropCell from './CropCell';

// Must match RowHeader band colors so the full-width strips feel continuous
import {
  LOCATION_BAND,
  GARDEN_BAND,
  SECTION_BAND,
} from './RowHeader';

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
  const { cellWidth } = useCellLayout();
  const showNoteIndicators = usePlannerStore(s => s.showNoteIndicators);
  const todayCol = todayWeekIndex(calendarStart);
  const totalWidth = TOTAL_WEEKS * cellWidth;

  const totalHeight = rowOffsets[rowOffsets.length - 1] ?? 1;

  const colStart = Math.max(0, Math.floor(renderScrollX / cellWidth) - 1);
  const colEnd   = Math.min(TOTAL_WEEKS - 1, Math.ceil((renderScrollX + viewWidth) / cellWidth) + 1);
  const { rowStart, rowEnd } = getVisibleRowRange(rowOffsets, renderScrollY, viewHeight);

  const elements: React.ReactElement[] = [];
  const pastRects: { x: number; y: number; w: number; h: number }[] = [];

  for (let row = rowStart; row <= rowEnd; row++) {
    const rowItem = rows[row];
    const top = rowOffsets[row];
    const height = getRowHeight(rowItem);

    if (rowItem?.type === 'crop_row') {
      for (let col = colStart; col <= colEnd; col++) {
        const weekDate = formatDateKey(weekIndexToDate(calendarStart, col));
        const hasNote = Boolean(rowItem.notesByWeek[weekDate]);

        const openNote = (mode: 'view' | 'compose') => {
          router.push({
            pathname: '/(modals)/cell-note',
            params: {
              cropId: String(rowItem.crop.id),
              weekDate,
              mode,
            },
          });
        };

        if (col < todayCol) {
          pastRects.push({ x: col * cellWidth, y: top, w: cellWidth - 1, h: height - 1 });
        }

        elements.push(
          <CropCell
            key={`${row}-${col}`}
            stageColor={rowItem.weekColorMap[col] ?? null}
            hasNote={hasNote}
            showNoteIndicators={showNoteIndicators}
            style={{ left: col * cellWidth, top }}
            onPress={hasNote ? () => openNote('view') : undefined}
            onLongPress={() => openNote('compose')}
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
        case 'garden_spacer':
          bandColor = LOCATION_BAND;
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
          style={{ position: 'absolute', left: 0, width: totalWidth, top, height, backgroundColor: bandColor }}
        />
      );
    }
  }

  return (
    <>
      {elements}
      {pastRects.length > 0 && (
        <View style={{ position: 'absolute', left: 0, top: 0, width: totalWidth, height: totalHeight }} pointerEvents="none">
          <Svg width={totalWidth} height={totalHeight}>
            <Defs>
          <Pattern id="past-hatch" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">                                                 
          -                                                                                                                                                                         
      135 -              <Line x1="0" y1="0" x2="0" y2="4" stroke="rgba(0,0,0,1)" strokeWidth="6" />    
              </Pattern>
            </Defs>
            {pastRects.map(({ x, y, w, h }, i) => (
              <Rect key={i} x={x} y={y} width={w} height={h} fill="url(#past-hatch)" />
            ))}
          </Svg>
        </View>
      )}
    </>
  );
}

