import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import {
  CELL_WIDTH,
  TOTAL_WEEKS,
  YEAR_ROW_HEIGHT,
  MONTH_ROW_HEIGHT,
  WEEK_ROW_HEIGHT,
  TOTAL_HEADER_HEIGHT,
  YEAR_COLORS,
  BACKGROUND_COLOR,
} from '@/src/constants/layout';
import { weekIndexToDate } from '@/src/utils/dateUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface YearBlock {
  startCol: number;
  colCount: number;
  color: string;
}

interface MonthLabel {
  col: number;
  label: string;
}

interface WeekCell {
  col: number;
  dayOfMonth: number;
  isMonthBoundary: boolean; // true when this is the first week of a month
}

// ---------------------------------------------------------------------------
// Pre-computation
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Walk all 156 week columns once and produce the data needed to render the
 * three header rows.  This is memoized so it only runs when calendarStart changes.
 */
function computeHeaderData(calendarStart: Date) {
  const yearBlocks: YearBlock[] = [];
  const monthLabels: MonthLabel[] = [];
  const weekCells: WeekCell[] = [];

  const baseYear = calendarStart.getFullYear();
  let currentYear = -1;
  let yearStartCol = 0;

  for (let col = 0; col < TOTAL_WEEKS; col++) {
    const d = weekIndexToDate(calendarStart, col);
    const year = d.getFullYear();
    const dayOfMonth = d.getDate();
    const isMonthBoundary = dayOfMonth <= 7; // first week of a month (VBA: day <= 7 check)

    // Detect year change → close previous block, open new one
    if (year !== currentYear) {
      if (currentYear !== -1) {
        yearBlocks.push({
          startCol: yearStartCol,
          colCount: col - yearStartCol,
          // Alternate color per year; Math.abs handles hypothetical negative offsets
          color: YEAR_COLORS[Math.abs((currentYear - baseYear) % 2)],
        });
      }
      currentYear = year;
      yearStartCol = col;
    }

    // Month label on first week of each month
    if (isMonthBoundary) {
      monthLabels.push({ col, label: MONTH_NAMES[d.getMonth()] });
    }

    weekCells.push({ col, dayOfMonth, isMonthBoundary });
  }

  // Close the final year block
  if (currentYear !== -1) {
    yearBlocks.push({
      startCol: yearStartCol,
      colCount: TOTAL_WEEKS - yearStartCol,
      color: YEAR_COLORS[Math.abs((currentYear - baseYear) % 2)],
    });
  }

  return { yearBlocks, monthLabels, weekCells };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  calendarStart: Date;
}

/**
 * ColumnHeader renders three stacked rows across the full virtual width
 * (TOTAL_WEEKS * CELL_WIDTH).  PlannerGrid wraps it in an Animated.View
 * that translates horizontally to stay in sync with GridBody's scroll.
 */
export default function ColumnHeader({ calendarStart }: Props) {
  const { yearBlocks, monthLabels, weekCells } = useMemo(
    () => computeHeaderData(calendarStart),
    [calendarStart],
  );

  const totalWidth = TOTAL_WEEKS * CELL_WIDTH;

  return (
    <View style={[styles.container, { width: totalWidth }]}>

      {/* ── Row 1: Year color strip ── */}
      <View style={styles.yearRow}>
        {yearBlocks.map((block) => (
          <View
            key={block.startCol}
            style={{
              position: 'absolute',
              left: block.startCol * CELL_WIDTH,
              top: 0,
              width: block.colCount * CELL_WIDTH,
              height: YEAR_ROW_HEIGHT,
              backgroundColor: block.color,
            }}
          />
        ))}
      </View>

      {/* ── Row 2: Month labels ── */}
      <View style={styles.monthRow}>
        {monthLabels.map(({ col, label }) => (
          <React.Fragment key={col}>
            {/* Thick left border at month boundary */}
            <View
              style={{
                position: 'absolute',
                left: col * CELL_WIDTH,
                top: 0,
                width: 2,
                height: MONTH_ROW_HEIGHT,
                backgroundColor: '#555',
              }}
            />
            {/* Month name */}
            <Text
              style={{
                position: 'absolute',
                left: col * CELL_WIDTH + 4,
                top: 0,
                height: MONTH_ROW_HEIGHT,
                lineHeight: MONTH_ROW_HEIGHT,
                color: '#cccccc',
                fontSize: 10,
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </React.Fragment>
        ))}
      </View>

      {/* ── Row 3: Week day-of-month numbers ── */}
      <View style={styles.weekRow}>
        {weekCells.map(({ col, dayOfMonth, isMonthBoundary }) => (
          <View
            key={col}
            style={[
              styles.weekCell,
              { left: col * CELL_WIDTH },
              isMonthBoundary && styles.weekCellMonthBoundary,
            ]}
          >
            <Text style={styles.weekCellText}>{dayOfMonth}</Text>
          </View>
        ))}
      </View>

    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    height: TOTAL_HEADER_HEIGHT,
    backgroundColor: BACKGROUND_COLOR,
  },
  yearRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: YEAR_ROW_HEIGHT,
    backgroundColor: BACKGROUND_COLOR,
  },
  monthRow: {
    position: 'absolute',
    top: YEAR_ROW_HEIGHT,
    left: 0,
    right: 0,
    height: MONTH_ROW_HEIGHT,
    backgroundColor: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  weekRow: {
    position: 'absolute',
    top: YEAR_ROW_HEIGHT + MONTH_ROW_HEIGHT,
    left: 0,
    right: 0,
    height: WEEK_ROW_HEIGHT,
    backgroundColor: '#252525',
  },
  weekCell: {
    position: 'absolute',
    top: 0,
    width: CELL_WIDTH,
    height: WEEK_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  weekCellMonthBoundary: {
    borderLeftWidth: 2,
    borderLeftColor: '#555',
  },
  weekCellText: {
    color: '#999',
    fontSize: 9,
  },
});
