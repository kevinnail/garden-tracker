import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import {
  ROW_HEIGHT,
  ROW_HEADER_WIDTH,
  PLANT_COUNT_WIDTH,
  CROP_NAME_WIDTH,
  PLACEHOLDER_ROW_COUNT,
  BACKGROUND_COLOR,
} from '@/src/constants/layout';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  rowCount?: number; // Slice 1: placeholder row count. Slice 5+: real row count from store.
}

/**
 * RowHeader renders the frozen left panel.
 *
 * In Slice 1 this shows numbered placeholder rows.
 * From Slice 5 onward it renders group headers, section headers, and crop rows
 * driven by real data from the Zustand store.
 *
 * PlannerGrid wraps this in an Animated.View that translates vertically to
 * stay in sync with GridBody's vertical scroll.
 */
export default function RowHeader({ rowCount = PLACEHOLDER_ROW_COUNT }: Props) {
  return (
    <View style={[styles.container, { height: rowCount * ROW_HEIGHT }]}>
      {Array.from({ length: rowCount }, (_, i) => (
        <View key={i} style={styles.row}>
          {/* Plant count cell */}
          <View style={styles.countCell}>
            <Text style={styles.countText}>{i + 1}</Text>
          </View>
          {/* Crop name cell */}
          <View style={styles.nameCell}>
            <Text style={styles.nameText} numberOfLines={1}>
              Row {i + 1}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    width: ROW_HEADER_WIDTH,
    backgroundColor: BACKGROUND_COLOR,
  },
  row: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  countCell: {
    width: PLANT_COUNT_WIDTH,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  countText: {
    color: '#666',
    fontSize: 9,
  },
  nameCell: {
    width: CROP_NAME_WIDTH,
    height: ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRightWidth: 2,
    borderRightColor: '#444',
  },
  nameText: {
    color: '#777',
    fontSize: 10,
  },
});
