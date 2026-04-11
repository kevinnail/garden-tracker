import React from 'react';
import { View, Pressable, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePlannerStore } from '@/src/store/plannerStore';

export default function PlannerToolbar() {
  const hasSections = usePlannerStore(s => s.rows.some(r => r.type === 'section_header'));
  const showArchivedRows = usePlannerStore(s => s.showArchivedRows);
  const toggleArchivedRows = usePlannerStore(s => s.toggleArchivedRows);
  const dueTodayCount = usePlannerStore(s => s.todayDueTasks.length);
  const overdueCount = usePlannerStore(s => s.todayOverdueTasks.length);
  const todayCount = dueTodayCount + overdueCount;

  
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  
  const todayBanner = (
    <Pressable
      style={[
        styles.todayBanner,
        isLandscape && styles.todayBannerCompact,
        overdueCount > 0
          ? styles.todayBannerOverdue
          : todayCount > 0
            ? styles.todayBannerActive
            : styles.todayBannerIdle,
      ]}
      onPress={() => router.navigate('/(tabs)/today')}
      accessibilityRole="button"
      accessibilityLabel={
        todayCount > 0
          ? `Today: ${dueTodayCount} due, ${overdueCount} overdue`
          : 'Today: all clear'
      }
      accessibilityHint="Opens the Today dashboard"
      >
      <View style={styles.todayBannerMain}>
        <Text style={styles.todayBannerTitle}>Today</Text>
        {!isLandscape && (
          <Text style={styles.todayBannerText} numberOfLines={1}>
            {todayCount > 0
              ? `${dueTodayCount} due today · ${overdueCount} overdue`
              : `All clear · ${todayLabel}`}
          </Text>
        )}
        {isLandscape && todayCount > 0 && (
          <Text style={styles.todayBannerText} numberOfLines={1}>
            {dueTodayCount} due · {overdueCount} overdue
          </Text>
        )}
      </View>
      <View style={styles.todayBannerRight}>
        {todayCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{todayCount}</Text>
          </View>
        ) }
      </View>
    </Pressable>
  );

  const actionButtons = (
    <View style={[styles.actionRow, isLandscape && styles.actionRowLandscape]}>
      <Pressable
        style={styles.btn}
        onPress={() => router.push(hasSections ? '/(modals)/add-crop' : '/(modals)/add-garden')}
        accessibilityRole="button"
        accessibilityLabel="Add crop"
        accessibilityHint={hasSections ? 'Opens the add crop form' : 'Opens hierarchy setup first'}
      >
        <Text style={styles.btnText}>+ Crop</Text>
      </Pressable>
      <Pressable
        style={styles.locationBtn}
        onPress={() => router.push('/(modals)/add-garden')}
        accessibilityRole="button"
        accessibilityLabel="Manage locations"
        accessibilityHint="Opens the locations, gardens, and sections editor"
      >
        <Text style={styles.locationBtnText}>Locations</Text>
      </Pressable>
      <Pressable
        style={[styles.archiveBtn, showArchivedRows && styles.archiveBtnActive]}
        onPress={toggleArchivedRows}
        accessibilityRole="switch"
        accessibilityState={{ checked: showArchivedRows }}
        accessibilityLabel="Show archived crops"
      >
        <Text style={[styles.archiveBtnText, showArchivedRows && styles.archiveBtnTextActive]}>
          {showArchivedRows ? 'Archived On' : 'Archived'}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      {isLandscape ? (
        <View style={styles.containerLandscape}>
          {todayBanner}
          {actionButtons}
        </View>
      ) : (
        <View style={styles.container}>
          {todayBanner}
          {actionButtons}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#111',
  },
  container: {
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    gap: 8,
  },
  containerLandscape: {
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  todayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  todayBannerCompact: {
    flex: 1,
    minHeight: 0,
    paddingVertical: 5,
  },
  todayBannerIdle: {
    backgroundColor: '#14181d',
    borderColor: '#28313b',
  },
  todayBannerActive: {
    backgroundColor: '#18222e',
    borderColor: '#35506a',
  },
  todayBannerOverdue: {
    backgroundColor: '#2a1c1c',
    borderColor: '#6a3d3d',
  },
  todayBannerMain: {
    flex: 1,
  },
  todayBannerTitle: {
    color: '#edf4ff',
    fontSize: 14,
    fontWeight: '700',
  },
  todayBannerText: {
    color: '#a8b6c7',
    fontSize: 12,
  },
  todayBannerRight: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  todayBannerHint: {
    color: '#dce8f8',
    fontSize: 11,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionRowLandscape: {
    flexWrap: 'nowrap',
    flexShrink: 0,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#2ecc71',
    borderRadius: 6,
  },
  btnText: {
    color: '#111',
    fontWeight: 'bold',
    fontSize: 13,
  },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d64545',
  },
  badgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  badgeIdle: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#233243',
  },
  badgeIdleText: {
    color: '#dce8f8',
    fontSize: 13,
    fontWeight: '700',
  },
  locationBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#555',
    borderRadius: 6,
  },
  locationBtnText: {
    color: '#ddd',
    fontWeight: 'bold',
    fontSize: 13,
  },
  archiveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#2e2a16',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4b4420',
  },
  archiveBtnActive: {
    backgroundColor: '#d8d0bf',
    borderColor: '#d8d0bf',
  },
  archiveBtnText: {
    color: '#d8c36a',
    fontWeight: 'bold',
    fontSize: 13,
  },
  archiveBtnTextActive: {
    color: '#111',
  },
});
