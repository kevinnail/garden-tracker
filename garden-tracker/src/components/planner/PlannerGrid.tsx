import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

import {
  CELL_WIDTH,
  ROW_HEIGHT,
  TOTAL_WEEKS,
  TOTAL_HEADER_HEIGHT,
  ROW_HEADER_WIDTH,
  PLACEHOLDER_ROW_COUNT,
  BACKGROUND_COLOR,
} from '@/src/constants/layout';
import { defaultCalendarStart, todayWeekIndex } from '@/src/utils/dateUtils';

import ColumnHeader from './ColumnHeader';
import RowHeader from './RowHeader';
import GridBody from './GridBody';
import TaskOverlay from './TaskOverlay';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PlannerGrid is the master container for the planner screen.
 *
 * Layout (4 panels):
 *
 *   ┌──────────────┬────────────────────────────────┐
 *   │   Corner     │  ColumnHeader (follows scrollX) │
 *   │  (today date)│  YearRow + MonthRow + WeekRow   │
 *   ├──────────────┼────────────────────────────────┤
 *   │  RowHeader   │  GridBody  (pan gesture source) │
 *   │  (follows    │  Virtualized cells              │
 *   │   scrollY)   │                                 │
 *   └──────────────┴────────────────────────────────┘
 *
 * Scroll architecture:
 * - scrollX / scrollY are Reanimated SharedValues (UI thread, drives animations)
 * - renderScrollX / renderScrollY are React state (JS thread, drives virtualization)
 * - The pan gesture updates both; the shared values do it instantly for smooth
 *   animation, runOnJS updates the state slightly later for cell virtualization.
 */
export default function PlannerGrid() {
  // All data is hardcoded for Slice 1.  From Slice 5 onward these come from
  // the Zustand store via usePlannerData().
  const rowCount = PLACEHOLDER_ROW_COUNT;
  const calendarStart = defaultCalendarStart();

  // Total virtual canvas dimensions
  const totalWidth  = TOTAL_WEEKS * CELL_WIDTH;
  const totalHeight = rowCount * ROW_HEIGHT;

  // ── Shared values (UI thread) — drive the animated transforms ────────────
  const scrollX      = useSharedValue(0);
  const scrollY      = useSharedValue(0);
  const startScrollX = useSharedValue(0); // captured at gesture begin
  const startScrollY = useSharedValue(0);
  const sharedViewW  = useSharedValue(1); // viewport dimensions, updated by onLayout
  const sharedViewH  = useSharedValue(1);

  // ── React state (JS thread) — drive cell virtualization ──────────────────
  const [renderScrollX, setRenderScrollX] = useState(0);
  const [renderScrollY, setRenderScrollY] = useState(0);
  const [viewDims, setViewDims] = useState({ width: 1, height: 1 });

  // Prevent double-initialization on layout
  const initialized = useRef(false);

  // ── Pan gesture ───────────────────────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      startScrollX.value = scrollX.value;
      startScrollY.value = scrollY.value;
    })
    .onUpdate((e) => {
      const maxX = Math.max(0, totalWidth  - sharedViewW.value);
      const maxY = Math.max(0, totalHeight - sharedViewH.value);

      const newX = Math.min(Math.max(startScrollX.value - e.translationX, 0), maxX);
      const newY = Math.min(Math.max(startScrollY.value - e.translationY, 0), maxY);

      scrollX.value = newX;
      scrollY.value = newY;

      // Update JS state for virtualization (slightly behind animation, which is fine —
      // the 1-cell render buffer ensures no visible gaps during fast scrolling)
      runOnJS(setRenderScrollX)(newX);
      runOnJS(setRenderScrollY)(newY);
    });

  // ── Animated styles ───────────────────────────────────────────────────────

  // Column header slides left/right with horizontal scroll
  const columnHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollX.value }],
  }));

  // Row header slides up/down with vertical scroll
  const rowHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollY.value }],
  }));

  // Grid body canvas slides in both axes
  const gridBodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -scrollX.value },
      { translateY: -scrollY.value },
    ],
  }));

  // ── Layout handler — called once when the grid body viewport is measured ──
  const handleBodyLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;

    sharedViewW.value = width;
    sharedViewH.value = height;
    setViewDims({ width, height });

    if (!initialized.current) {
      initialized.current = true;

      // Scroll so today's column is visible about 3 columns from the left
      const todayCol = todayWeekIndex(calendarStart);
      const initialX = Math.max(0, (todayCol - 3) * CELL_WIDTH);

      scrollX.value = initialX;
      setRenderScrollX(initialX);
    }
  };

  // ── Today's date label for the corner cell ────────────────────────────────
  const todayLabel = new Date().toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>

      {/* ── Top row: corner + column header ── */}
      <View style={styles.headerRow}>

        {/* Corner: shows today's date */}
        <View style={styles.corner}>
          <Text style={styles.cornerText}>{todayLabel}</Text>
        </View>

        {/* Column header — overflows its container; Animated.View translates it */}
        <View style={styles.columnHeaderClip}>
          <Animated.View style={[{ position: 'absolute', width: totalWidth }, columnHeaderStyle]}>
            <ColumnHeader calendarStart={calendarStart} />
          </Animated.View>
        </View>

      </View>

      {/* ── Main row: row header + grid body ── */}
      <View style={styles.mainRow}>

        {/* Row header — clips vertically; Animated.View translates it */}
        <View style={styles.rowHeaderClip}>
          <Animated.View
            style={[{ position: 'absolute', width: ROW_HEADER_WIDTH, height: totalHeight }, rowHeaderStyle]}
          >
            <RowHeader rowCount={rowCount} />
          </Animated.View>
        </View>

        {/* Grid body — the primary scroll target */}
        <View style={styles.bodyClip} onLayout={handleBodyLayout}>
          <GestureDetector gesture={panGesture}>
            <View style={StyleSheet.absoluteFill}>
              {/*
                The virtual canvas: TOTAL_WEEKS * CELL_WIDTH wide × rowCount * ROW_HEIGHT tall.
                Translated by scrollX / scrollY to create the scroll effect.
                GridBody renders only the visible subset of cells (virtualization).
              */}
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    width: totalWidth,
                    height: totalHeight,
                  },
                  gridBodyStyle,
                ]}
              >
                <GridBody
                  rowCount={rowCount}
                  renderScrollX={renderScrollX}
                  renderScrollY={renderScrollY}
                  viewWidth={viewDims.width}
                  viewHeight={viewDims.height}
                />
              </Animated.View>

              {/* SVG overlay — task lines + today cursor, sits on top of cells */}
              <TaskOverlay
                calendarStart={calendarStart}
                totalHeight={totalHeight}
                scrollX={scrollX}
                scrollY={scrollY}
              />
            </View>
          </GestureDetector>
        </View>

      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },

  // ── Header row ──
  headerRow: {
    flexDirection: 'row',
    height: TOTAL_HEADER_HEIGHT,
  },
  corner: {
    width: ROW_HEADER_WIDTH,
    height: TOTAL_HEADER_HEIGHT,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderRightWidth: 2,
    borderColor: '#444',
  },
  cornerText: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
  },
  columnHeaderClip: {
    flex: 1,
    height: TOTAL_HEADER_HEIGHT,
    overflow: 'hidden',
  },

  // ── Main row ──
  mainRow: {
    flex: 1,
    flexDirection: 'row',
  },
  rowHeaderClip: {
    width: ROW_HEADER_WIDTH,
    overflow: 'hidden',
  },
  bodyClip: {
    flex: 1,
    overflow: 'hidden',
  },
});
