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
import { getRowHeight } from '../../utils/rowLayout';

interface Props {
  rows: GridRowItem[];
  rowOffsets: number[];
}

// ── Visual hierarchy ──────────────────────────────────────────────────────────
// Each level has a BAND color (header/footer row background) and a BAR color
// (the thin left strip that runs through all rows inside that level,
//  connecting the top and bottom bands into a visible box).

// Bar colors MATCH their band colors — the left bar IS the same color as the
// header/footer it connects, making each level read as one continuous frame.
export const LOCATION_BAND = '#0d0d0d';
export const LOCATION_BAR  = '#0d0d0d';  // 10 px — same as location band

export const GARDEN_BAND   = '#003e14';
export const GARDEN_BAR    = '#003e14';  // 8 px — same as garden band

export const SECTION_BAND  = '#cdcdcd';
export const SECTION_BAR   = '#cdcdcd';  // 6 px — same as section band

const CROP_BG = '#191928';

const CONTAINER_RADIUS = 5;

// ─────────────────────────────────────────────────────────────────────────────

export default function RowHeader({ rows, rowOffsets }: Props) {
  const selectedCropId = usePlannerStore(s => s.selectedCropId);
  const setSelectedCrop = usePlannerStore(s => s.setSelectedCrop);
  const totalHeight = rowOffsets[rowOffsets.length - 1] ?? 0;

  return (
    <View style={[styles.container, { height: totalHeight }] }>
      {rows.map((item, i) => {
        const rowHeight = getRowHeight(item);
        const rowStyle = [
          styles.row,
          { top: rowOffsets[i], height: rowHeight },
        ] as const;

        // ── Location top band ──────────────────────────────────────────────
        if (item.type === 'location_header') return (
          <View key={i} style={[rowStyle, { backgroundColor: BACKGROUND_COLOR }]}>
            <View style={[styles.bandContent, { backgroundColor: LOCATION_BAND,  }]}>
              <Text style={styles.locationText} numberOfLines={1}>{item.location.name}</Text>
            </View>
          </View>
        );

        // ── Location bottom band ───────────────────────────────────────────
        if (item.type === 'location_footer') return (
          <View key={i} style={[rowStyle, { backgroundColor: BACKGROUND_COLOR }]}>
            <View style={[styles.bandContent, { backgroundColor: LOCATION_BAND,  }]} />
          </View>
        );

        // ── Location spacer (between locations, in background color) ───────
        if (item.type === 'location_spacer') return (
          <View key={i} style={[rowStyle, { backgroundColor: BACKGROUND_COLOR }]} />
        );

        // ── Garden top band (location bar on left connects to location bands) ─
        if (item.type === 'garden_header') return (
          <View key={i} style={[rowStyle, { backgroundColor: LOCATION_BAND }]}>
            <View style={[styles.bar, { width: 10, backgroundColor: LOCATION_BAR }]} />
            <View style={[styles.bandContent, { backgroundColor: GARDEN_BAND, borderTopLeftRadius: CONTAINER_RADIUS }]}>
              <Text style={styles.gardenText} numberOfLines={1}>{item.garden.name}</Text>
            </View>
          </View>
        );

        // ── Garden bottom band ─────────────────────────────────────────────
        if (item.type === 'garden_footer') return (
          <View key={i} style={[rowStyle, { backgroundColor: LOCATION_BAND }]}>
            <View style={[styles.bar, { width: 10, backgroundColor: LOCATION_BAR }]} />
            <View style={[styles.bandContent, { backgroundColor: GARDEN_BAND, borderBottomLeftRadius: CONTAINER_RADIUS }]} />
          </View>
        );

        // ── Garden spacer (between gardens, in location band color) ────────
        if (item.type === 'garden_spacer') return (
          <View key={i} style={[rowStyle, { backgroundColor: LOCATION_BAND }]}>
            <View style={[styles.bar, { width: 10, backgroundColor: LOCATION_BAR }]} />
          </View>
        );

        // ── Section top band ───────────────────────────────────────────────
        if (item.type === 'section_header') return (
          <View key={i} style={[rowStyle, { backgroundColor: GARDEN_BAND }]}>
            <View style={[styles.bar, { width: 10, backgroundColor: LOCATION_BAR }]} />
            <View style={[styles.bar, { width: 8, backgroundColor: GARDEN_BAR }]} />
            <View style={[styles.bandContent, { backgroundColor: SECTION_BAND, borderTopLeftRadius: CONTAINER_RADIUS }]}>
              <Text style={styles.sectionText} numberOfLines={1}>{item.section.name}</Text>
            </View>
          </View>
        );

        // ── Section bottom band ────────────────────────────────────────────
        if (item.type === 'section_footer') return (
          <View key={i} style={[rowStyle, { backgroundColor: GARDEN_BAND }]}>
            <View style={[styles.bar, { width: 10, backgroundColor: LOCATION_BAR }]} />
            <View style={[styles.bar, { width: 8, backgroundColor: GARDEN_BAR }]} />
            <View style={[styles.bandContent, { backgroundColor: SECTION_BAND, borderBottomLeftRadius: CONTAINER_RADIUS }]} />
          </View>
        );

        // ── Section spacer between framed sections ────────────────────────
        if (item.type === 'section_spacer') return (
          <View key={i} style={[rowStyle, { backgroundColor: GARDEN_BAND }] }> 
            <View style={[styles.bar, { width: 10, backgroundColor: LOCATION_BAR }]} />
          </View>
        );

        // ── Crop row ───────────────────────────────────────────────────────
        if (item.type === 'crop_row') {
          const isSelected = selectedCropId === item.crop.id;
          return (
            <Pressable
              key={i}
              style={[rowStyle, { backgroundColor: isSelected ? '#1a2a3a' : CROP_BG }]}
              onPress={() => {
                setSelectedCrop(item.crop.id);
                router.push('/(modals)/manage-tasks');
              }}
              onLongPress={() => {
                setSelectedCrop(item.crop.id);
                router.push('/(modals)/edit-crop');
              }}
            >
              <View style={[styles.bar, { width: 10, backgroundColor: LOCATION_BAR }]} />
              <View style={[styles.bar, { width: 8, backgroundColor: GARDEN_BAR }]} />
              <View style={[styles.bar, { width: 6, backgroundColor: SECTION_BAR }]} />
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

        return <View key={i} style={[rowStyle, { backgroundColor: BACKGROUND_COLOR }]} />;
      })}
    </View>
  );
}

const CROP_NAME_WIDTH = ROW_HEADER_WIDTH - PLANT_COUNT_WIDTH - 10 - 8 - 6; // 200 - 30 - 24 = 146

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: ROW_HEADER_WIDTH,
    backgroundColor: BACKGROUND_COLOR,
  },
  row: {
    position: 'absolute',
    flexDirection: 'row',
    width: ROW_HEADER_WIDTH,
    alignItems: 'center',
  },
  bar: {
    height: '100%',
    flexShrink: 0,
  },
  bandContent: {
    flex: 1,
    height: '100%',
    justifyContent: 'center' as const,
    overflow: 'hidden',
  },

  // ── Text styles ────────────────────────────────────────────────────────────
  locationText: {
    flex: 1,
    color: '#aaa',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 8,
    paddingTop:4
  },
  gardenText: {
    flex: 1,
    color: '#aaa',
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingTop:4
  },
  sectionText: {
    flex: 1,
    color: '#000000',
    fontSize: 10,
    paddingHorizontal: 5,
    paddingTop:4
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
