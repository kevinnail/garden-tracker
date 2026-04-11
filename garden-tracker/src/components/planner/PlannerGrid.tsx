import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withDecay,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

import {
  CELL_WIDTH,
  TOTAL_WEEKS,
  TOTAL_HEADER_HEIGHT,
  ROW_HEIGHT,
  ROW_HEADER_WIDTH,
  BACKGROUND_COLOR,
} from '@/src/constants/layout';
import { parseDateKey, todayWeekIndex, dateToWeekIndex } from '@/src/utils/dateUtils';
import { usePlannerStore } from '@/src/store/plannerStore';
import { getRowOffsets, getTotalRowsHeight } from '../../utils/rowLayout';

import ColumnHeader from './ColumnHeader';
import RowHeader from './RowHeader';
import GridBody from './GridBody';
import TaskOverlay from './TaskOverlay';

export default function PlannerGrid() {
  const { left: leftInset } = useSafeAreaInsets();

  const rows         = usePlannerStore(s => s.rows);
  const allTaskLines = usePlannerStore(s => s.allTaskLines);
  const calendarStart = usePlannerStore(s => s.calendarStart);
  const isLoaded     = usePlannerStore(s => s.isLoaded);
  const plannerFocusCropId = usePlannerStore(s => s.plannerFocusCropId);
  const plannerFocusDate = usePlannerStore(s => s.plannerFocusDate);
  const clearPlannerFocus = usePlannerStore(s => s.clearPlannerFocus);

  const totalWidth  = TOTAL_WEEKS * CELL_WIDTH;
  const totalHeight = Math.max(getTotalRowsHeight(rows), 1);
  const rowOffsets = useMemo(() => getRowOffsets(rows), [rows]);

  // ── Shared values (UI thread) ─────────────────────────────────────────────
  const scrollX      = useSharedValue(0);
  const scrollY      = useSharedValue(0);
  const startScrollX = useSharedValue(0);
  const startScrollY = useSharedValue(0);
  const sharedViewW  = useSharedValue(1);
  const sharedViewH  = useSharedValue(1);

  // ── React state (JS thread) — drives virtualization ───────────────────────
  const [renderScrollX, setRenderScrollX] = useState(0);
  const [renderScrollY, setRenderScrollY] = useState(0);
  const [viewDims, setViewDims] = useState({ width: 1, height: 1 });

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
      scrollX.value = Math.min(Math.max(startScrollX.value - e.translationX, 0), maxX);
      scrollY.value = Math.min(Math.max(startScrollY.value - e.translationY, 0), maxY);
    })
    .onEnd((e) => {
      const maxX = Math.max(0, totalWidth  - sharedViewW.value);
      const maxY = Math.max(0, totalHeight - sharedViewH.value);
      scrollX.value = withDecay({ velocity: -e.velocityX, clamp: [0, maxX] });
      scrollY.value = withDecay({ velocity: -e.velocityY, clamp: [0, maxY] });
    });

  // ── Keep virtualization in sync during drag and decay ─────────────────────
  useAnimatedReaction(
    () => scrollX.value,
    (val) => scheduleOnRN(setRenderScrollX, val),
  );
  useAnimatedReaction(
    () => scrollY.value,
    (val) => scheduleOnRN(setRenderScrollY, val),
  );

  // ── Animated styles ───────────────────────────────────────────────────────
  const columnHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollX.value }],
  }));
  const rowHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollY.value }],
  }));
  const gridBodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollX.value }, { translateY: -scrollY.value }],
  }));

  // ── Layout — set initial scroll position once ─────────────────────────────
  const handleBodyLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    sharedViewW.value = width;
    sharedViewH.value = height;
    setViewDims({ width, height });

    if (!initialized.current) {
      initialized.current = true;
      const todayCol = todayWeekIndex(calendarStart);
      const initialX = Math.max(0, (todayCol - 3) * CELL_WIDTH);
      scrollX.value = initialX;
      setRenderScrollX(initialX);
    }
  };

  useEffect(() => {
    if (!plannerFocusCropId || viewDims.height <= 1 || viewDims.width <= 1) {
      return;
    }

    const rowIndex = rows.findIndex(
      row => row.type === 'crop_row' && row.crop.id === plannerFocusCropId
    );

    if (rowIndex < 0) {
      clearPlannerFocus();
      return;
    }

    const targetTop = rowOffsets[rowIndex] ?? 0;
    const maxY = Math.max(0, totalHeight - viewDims.height);
    const centeredY = Math.max(0, targetTop - Math.max(0, (viewDims.height - ROW_HEIGHT) / 2));
    const nextY = Math.min(centeredY, maxY);

    const parsedFocusDate = plannerFocusDate ? parseDateKey(plannerFocusDate) : null;
    const focusCol = parsedFocusDate
      ? dateToWeekIndex(calendarStart, parsedFocusDate)
      : todayWeekIndex(calendarStart);
    const maxX = Math.max(0, totalWidth - viewDims.width);
    const centeredX = Math.max(0, focusCol * CELL_WIDTH - Math.max(0, (viewDims.width - CELL_WIDTH) / 2));
    const nextX = Math.min(centeredX, maxX);

    scrollX.value = nextX;
    scrollY.value = nextY;
    setRenderScrollX(nextX);
    setRenderScrollY(nextY);
    clearPlannerFocus();
  }, [calendarStart, clearPlannerFocus, plannerFocusCropId, plannerFocusDate, rowOffsets, rows, scrollX, scrollY, totalHeight, totalWidth, viewDims.height, viewDims.width]);

  const todayLabel = new Date().toLocaleDateString('en-US', {
    month: 'numeric', day: 'numeric', year: '2-digit',
  });

  if (isLoaded && rows.length === 0) {
    return (
      <View style={[styles.root, styles.emptyRoot, { paddingLeft: leftInset }]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Welcome to Garden Tracker</Text>
          <Text style={styles.emptyBody}>
            Tap <Text style={styles.emptyHighlight}>+ Crop</Text> to add your first crop and it will appear here on the planner timeline.
          </Text>
          <Text style={styles.emptyHint}>
            Each row shows a crop&apos;s growing stages across the calendar.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingLeft: leftInset }]}>

      {/* ── Top row: corner + column header ── */}
      <View style={styles.headerRow}>
        <View style={styles.corner}>
          <Text style={styles.cornerText}>{todayLabel}</Text>
        </View>
        <View style={styles.columnHeaderClip}>
          <Animated.View style={[{ position: 'absolute', width: totalWidth }, columnHeaderStyle]}>
            <ColumnHeader calendarStart={calendarStart} />
          </Animated.View>
        </View>
      </View>

      {/* ── Main row: row header + grid body ── */}
      <View style={styles.mainRow}>
        <View style={styles.rowHeaderClip}>
          <Animated.View
            style={[{ position: 'absolute', width: ROW_HEADER_WIDTH, height: totalHeight }, rowHeaderStyle]}
          >
            <RowHeader rows={rows} />
          </Animated.View>
        </View>

        <View style={styles.bodyClip} onLayout={handleBodyLayout}>
          <GestureDetector gesture={panGesture}>
            <View style={StyleSheet.absoluteFill}>
              <Animated.View
                style={[{ position: 'absolute', width: totalWidth, height: totalHeight }, gridBodyStyle]}
              >
                <GridBody
                  rows={rows}
                  calendarStart={calendarStart}
                  renderScrollX={renderScrollX}
                  renderScrollY={renderScrollY}
                  viewWidth={viewDims.width}
                  viewHeight={viewDims.height}
                />
              </Animated.View>

              <TaskOverlay
                calendarStart={calendarStart}
                totalHeight={totalHeight}
                taskLines={allTaskLines}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BACKGROUND_COLOR },
  emptyRoot: { justifyContent: 'center' },
  headerRow: { flexDirection: 'row', height: TOTAL_HEADER_HEIGHT },
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
  cornerText: { color: '#888', fontSize: 11, fontWeight: 'bold' },
  columnHeaderClip: { flex: 1, height: TOTAL_HEADER_HEIGHT, overflow: 'hidden' },
  mainRow: { flex: 1, flexDirection: 'row' },
  rowHeaderClip: { width: ROW_HEADER_WIDTH, overflow: 'hidden' },
  bodyClip: { flex: 1, overflow: 'hidden' },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyTitle: {
    color: '#ccc',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyBody: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyHighlight: {
    color: '#4CAF50',
    fontWeight: '700',
  },
  emptyHint: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
