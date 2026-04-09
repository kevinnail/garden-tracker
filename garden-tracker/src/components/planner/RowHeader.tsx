import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

import {
  ROW_HEIGHT,
  ROW_HEADER_WIDTH,
  PLANT_COUNT_WIDTH,
  CROP_NAME_WIDTH,
  BACKGROUND_COLOR,
} from '@/src/constants/layout';
import { GridRowItem } from '@/src/types';
import { usePlannerStore } from '@/src/store/plannerStore';

interface Props {
  rows: GridRowItem[];
}

export default function RowHeader({ rows }: Props) {
  const selectedCropId = usePlannerStore(s => s.selectedCropId);
  const setSelectedCrop = usePlannerStore(s => s.setSelectedCrop);

  return (
    <View style={[styles.container, { height: rows.length * ROW_HEIGHT }]}>
      {rows.map((item, i) => {
        if (item.type === 'group_header') {
          return (
            <View key={i} style={[styles.row, styles.groupHeader]}>
              <Text style={styles.groupText} numberOfLines={1}>
                {item.group.name}
              </Text>
            </View>
          );
        }

        if (item.type === 'section_header') {
          return (
            <View key={i} style={[styles.row, styles.sectionHeader]}>
              <Text style={styles.sectionText} numberOfLines={1}>
                {item.location.name} › {item.section.name}
              </Text>
            </View>
          );
        }

        if (item.type === 'crop_row') {
          const isSelected = selectedCropId === item.crop.id;
          return (
            <Pressable
              key={i}
              style={[styles.row, isSelected && styles.rowSelected]}
              onLongPress={() => setSelectedCrop(isSelected ? null : item.crop.id)}
            >
              <View style={styles.countCell}>
                <Text style={styles.countText}>{item.crop.plant_count}</Text>
              </View>
              <View style={styles.nameCell}>
                <Text style={[styles.nameText, isSelected && styles.nameTextSelected]} numberOfLines={1}>
                  {item.crop.name}
                </Text>
              </View>
            </Pressable>
          );
        }

        // placeholder
        return (
          <View key={i} style={styles.row}>
            <View style={styles.countCell}>
              <Text style={styles.countText}>{i + 1}</Text>
            </View>
            <View style={styles.nameCell}>
              <Text style={styles.placeholderText} numberOfLines={1}>—</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

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
  groupHeader: {
    backgroundColor: '#1e1e2e',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  groupText: {
    color: '#aaa',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeader: {
    backgroundColor: '#1a1a28',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingLeft: 14,
  },
  sectionText: {
    color: '#888',
    fontSize: 9,
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
    color: '#aaa',
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
  rowSelected: {
    backgroundColor: '#1a2a3a',
  },
  nameText: {
    color: '#ddd',
    fontSize: 10,
  },
  nameTextSelected: {
    color: '#74b9ff',
  },
  placeholderText: {
    color: '#444',
    fontSize: 10,
  },
});
