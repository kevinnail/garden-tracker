import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';

import {
  ROW_HEIGHT,
  ROW_HEADER_WIDTH,
  PLANT_COUNT_WIDTH,
  BACKGROUND_COLOR,
} from '@/src/constants/layout';
import { GridRowItem } from '@/src/types';
import { usePlannerStore } from '@/src/store/plannerStore';

interface Props {
  rows: GridRowItem[];
}

// ── Visual hierarchy ──────────────────────────────────────────────────────────
// Each level has a BAND color (header/footer row background) and a BAR color
// (the thin left strip that runs through all rows inside that level,
//  connecting the top and bottom bands into a visible box).

// Bar colors MATCH their band colors — the left bar IS the same color as the
// header/footer it connects, making each level read as one continuous frame.
export const GARDEN_BAND   = '#0d0d0d';
export const GARDEN_BAR    = '#0d0d0d';  // 5 px — same as garden band

export const LOCATION_BAND = '#003e14';
export const LOCATION_BAR  = '#003e14';  // 4 px — same as location band

export const SECTION_BAND  = '#cdcdcd';
export const SECTION_BAR   = '#cdcdcd';  // 3 px — same as section band

const CROP_BG = '#191928';

// ─────────────────────────────────────────────────────────────────────────────

export default function RowHeader({ rows }: Props) {
  const selectedCropId = usePlannerStore(s => s.selectedCropId);
  const setSelectedCrop = usePlannerStore(s => s.setSelectedCrop);

  return (
    <View style={[styles.container, { height: rows.length * ROW_HEIGHT }]}>
      {rows.map((item, i) => {

        // ── Garden top band ────────────────────────────────────────────────
        if (item.type === 'group_header') return (
          <View key={i} style={[styles.row, { backgroundColor: GARDEN_BAND }]}>
            <Text style={styles.gardenText} numberOfLines={1}>{item.group.name}</Text>
          </View>
        );

        // ── Garden bottom band ─────────────────────────────────────────────
        if (item.type === 'group_footer') return (
          <View key={i} style={[styles.row, { backgroundColor: GARDEN_BAND }]} />
        );

        // ── Location top band (garden bar on left connects to garden bands) ─
        if (item.type === 'location_header') return (
          <View key={i} style={[styles.row, { backgroundColor: LOCATION_BAND }]}>
            <View style={[styles.bar, { width: 5, backgroundColor: GARDEN_BAR }]} />
            <Text style={styles.locationText} numberOfLines={1}>{item.location.name}</Text>
          </View>
        );

        // ── Location bottom band ───────────────────────────────────────────
        if (item.type === 'location_footer') return (
          <View key={i} style={[styles.row, { backgroundColor: LOCATION_BAND }]}>
            <View style={[styles.bar, { width: 5, backgroundColor: GARDEN_BAR }]} />
          </View>
        );

        // ── Section top band ───────────────────────────────────────────────
        if (item.type === 'section_header') return (
          <View key={i} style={[styles.row, { backgroundColor: SECTION_BAND }]}>
            <View style={[styles.bar, { width: 5, backgroundColor: GARDEN_BAR }]} />
            <View style={[styles.bar, { width: 4, backgroundColor: LOCATION_BAR }]} />
            <Text style={styles.sectionText} numberOfLines={1}>{item.section.name}</Text>
          </View>
        );

        // ── Section gap (left bars visible through the gap) ────────────────
        if (item.type === 'section_footer') return (
          <View key={i} style={[styles.row, { backgroundColor: BACKGROUND_COLOR }]}>
            <View style={[styles.bar, { width: 5, backgroundColor: GARDEN_BAR }]} />
            <View style={[styles.bar, { width: 4, backgroundColor: LOCATION_BAR }]} />
          </View>
        );

        // ── Crop row ───────────────────────────────────────────────────────
        if (item.type === 'crop_row') {
          const isSelected = selectedCropId === item.crop.id;
          return (
            <Pressable
              key={i}
              style={[styles.row, { backgroundColor: isSelected ? '#1a2a3a' : CROP_BG }]}
              onLongPress={() => {
                setSelectedCrop(item.crop.id);
                router.push(item.tasks.length > 0 ? '/(modals)/manage-tasks' : '/(modals)/add-task');
              }}
            >
              <View style={[styles.bar, { width: 5, backgroundColor: GARDEN_BAR }]} />
              <View style={[styles.bar, { width: 4, backgroundColor: LOCATION_BAR }]} />
              <View style={[styles.bar, { width: 3, backgroundColor: SECTION_BAR }]} />
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

        return <View key={i} style={[styles.row, { backgroundColor: BACKGROUND_COLOR }]} />;
      })}
    </View>
  );
}

const CROP_NAME_WIDTH = ROW_HEADER_WIDTH - PLANT_COUNT_WIDTH - 5 - 4 - 3; // 200 - 30 - 12 = 158

const styles = StyleSheet.create({
  container: {
    width: ROW_HEADER_WIDTH,
    backgroundColor: BACKGROUND_COLOR,
  },
  row: {
    flexDirection: 'row',
    width: ROW_HEADER_WIDTH,
    height: ROW_HEIGHT,
    alignItems: 'center',
  },
  bar: {
    height: ROW_HEIGHT,
    flexShrink: 0,
  },

  // ── Text styles ────────────────────────────────────────────────────────────
  gardenText: {
    flex: 1,
    color: '#aaa',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 8,
  },
  locationText: {
    flex: 1,
    color: '#aaa',
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
  },
  sectionText: {
    flex: 1,
    color: '#000000',
    fontSize: 10,
    paddingHorizontal: 5,
  },

  // ── Crop cell internals ────────────────────────────────────────────────────
  countCell: {
    width: PLANT_COUNT_WIDTH,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#2a2a3a',
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
  },
  nameText: {
    color: '#ddd',
    fontSize: 10,
  },
  nameTextSelected: {
    color: '#74b9ff',
  },
});
