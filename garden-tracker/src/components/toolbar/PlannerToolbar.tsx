import React, { useMemo } from 'react';
import { View, Pressable, Text, StyleSheet, useWindowDimensions, LayoutAnimation, UIManager, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/src/store/plannerStore';
import { useTodayTick } from '@/src/hooks/useTodayTick';
import { useWeatherStore } from '@/src/store/weatherStore';
import { wmoEmoji } from '@/src/hooks/useWeather';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ---------------------------------------------------------------------------
// Small helper: a single icon+label toggle button inside the view panel
// ---------------------------------------------------------------------------
function ViewToggle({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.viewToggle, active && styles.viewToggleActive]}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? '#2ecc71' : '#666'}
      />
      <Text style={[styles.viewToggleLabel, active && styles.viewToggleLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main toolbar
// ---------------------------------------------------------------------------
export default function PlannerToolbar() {
  // Re-render at midnight so `todayLabel` flips.
  useTodayTick();

  const {
    hasSections,
    showArchivedRows, toggleArchivedRows,
    showTasks, toggleShowTasks,
    showCursor, toggleShowCursor,
    showNoteIndicators, toggleShowNoteIndicators,
    cellZoomLevel, setCellZoomLevel,
    showViewControls, toggleViewControls,
    dueTodayCount, overdueCount,
  } = usePlannerStore(useShallow(s => ({
    hasSections: s.rows.some(r => r.type === 'section_header'),
    showArchivedRows: s.showArchivedRows,
    toggleArchivedRows: s.toggleArchivedRows,
    showTasks: s.showTasks,
    toggleShowTasks: s.toggleShowTasks,
    showCursor: s.showCursor,
    toggleShowCursor: s.toggleShowCursor,
    showNoteIndicators: s.showNoteIndicators,
    toggleShowNoteIndicators: s.toggleShowNoteIndicators,
    cellZoomLevel: s.cellZoomLevel,
    setCellZoomLevel: s.setCellZoomLevel,
    showViewControls: s.showViewControls,
    toggleViewControls: s.toggleViewControls,
    dueTodayCount: s.todayDueTasks.length,
    overdueCount: s.todayOverdueTasks.length,
  })));

  const weather = useWeatherStore(s => s.weather);
  const todayWeather = weather.status === 'ok' ? weather.days[0] : null;
  const todayCount    = dueTodayCount + overdueCount;

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const todayLabel = useMemo(() => new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  }), []);

  const handleViewToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    toggleViewControls();
  };

  // ── Today banner ──────────────────────────────────────────────────────────
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
      accessibilityLabel={todayCount > 0 ? `Today: ${dueTodayCount} due, ${overdueCount} overdue` : 'Today: all clear'}
      accessibilityHint="Opens the Today dashboard"
    >
      <View style={styles.todayBannerMain}>
        <Text style={styles.todayBannerTitle}>Today</Text>
        {!isLandscape && (
          <Text style={styles.todayBannerText} numberOfLines={1}>
            {todayCount > 0 ? (
              <>
                <Text style={dueTodayCount > 0 ? styles.todayBannerDueToday : undefined}>
                  {`${dueTodayCount} due today`}
                </Text>
                {` · ${overdueCount} overdue`}
              </>
            ) : todayLabel}
          </Text>
        )}
        {isLandscape && todayCount > 0 && (
          <Text style={styles.todayBannerText} numberOfLines={1}>
            <Text style={dueTodayCount > 0 ? styles.todayBannerDueToday : undefined}>
              {`${dueTodayCount} due`}
            </Text>
            {` · ${overdueCount} overdue`}
          </Text>
        )}
      </View>
      <View style={styles.todayBannerRight}>
        {todayWeather && (
          <View style={styles.weatherChip}>
            <Text style={styles.weatherEmoji}>{wmoEmoji(todayWeather.code)}</Text>
            <Text style={styles.weatherTemp}>{todayWeather.tempMax}°</Text>
          </View>
        )}
        {todayCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{todayCount}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  // ── Action row (+ Crop, Locations, View toggle) ───────────────────────────
  const actionButtons = (
    <View style={[styles.actionRow, isLandscape && styles.actionRowLandscape]}>
      <Pressable
        style={styles.btn}
        onPress={() => router.push(hasSections ? '/(modals)/add-crop' : '/(modals)/add-location')}
        accessibilityRole="button"
        accessibilityLabel="Add crop"
        accessibilityHint={hasSections ? 'Opens the add crop form' : 'Opens hierarchy setup first'}
      >
        <Text style={styles.btnText}>+ Crop</Text>
      </Pressable>
      <Pressable
        style={styles.locationBtn}
        onPress={() => router.push('/(modals)/add-location')}
        accessibilityRole="button"
        accessibilityLabel="Manage locations"
        accessibilityHint="Opens the locations, gardens, and sections editor"
      >
        <Text style={styles.locationBtnText}>Locations</Text>
      </Pressable>
      <Pressable
        style={[styles.viewBtn, showViewControls && styles.viewBtnActive]}
        onPress={handleViewToggle}
        accessibilityRole="button"
        accessibilityLabel="View controls"
        accessibilityHint="Toggle task lines, cursor, notes visibility and zoom"
      >
        <Ionicons
          name={showViewControls ? 'eye' : 'eye-outline'}
          size={15}
          color={showViewControls ? '#fff' : '#666'}
        />
        <Text style={[styles.viewBtnText, showViewControls && styles.viewBtnTextActive]}>
          View {showViewControls ? '▲' : '▾'}
        </Text>
      </Pressable>
    </View>
  );

  // ── Expandable view controls panel ────────────────────────────────────────
  const viewPanel = showViewControls && (
    <View style={styles.viewPanel}>
      {/* Toggle row */}
      <View style={styles.viewToggleRow}>
        <ViewToggle
          icon="reorder-three-outline"
          label="Tasks"
          active={showTasks}
          onPress={toggleShowTasks}
          />
        <ViewToggle
          icon="locate-outline"
          label="Today"
          active={showCursor}
          onPress={toggleShowCursor}
        />
        <ViewToggle
          icon="chatbubble-ellipses-outline"
          label="Notes"
          active={showNoteIndicators}
          onPress={toggleShowNoteIndicators}
        />
        <ViewToggle
          icon="archive-outline"
          label="Archived"
          active={showArchivedRows}
          onPress={toggleArchivedRows}
        />
      </View>

      {/* Zoom row */}
      <View style={styles.zoomRow}>
        <Pressable
          style={[styles.zoomBtn, cellZoomLevel <= 1 && styles.zoomBtnDisabled]}
          onPress={() => setCellZoomLevel(cellZoomLevel - 1)}
          disabled={cellZoomLevel <= 1}
          accessibilityLabel="Zoom out"
        >
          <Text style={[styles.zoomBtnText, cellZoomLevel <= 1 && styles.zoomBtnTextDisabled]}>−</Text>
        </Pressable>
        <View style={styles.zoomDots}>
          {[1, 2, 3, 4, 5].map(l => (
            <View key={l} style={[styles.dot, l <= cellZoomLevel && styles.dotActive]} />
          ))}
        </View>
        <Pressable
          style={[styles.zoomBtn, cellZoomLevel >= 5 && styles.zoomBtnDisabled]}
          onPress={() => setCellZoomLevel(cellZoomLevel + 1)}
          disabled={cellZoomLevel >= 5}
          accessibilityLabel="Zoom in"
        >
          <Text style={[styles.zoomBtnText, cellZoomLevel >= 5 && styles.zoomBtnTextDisabled]}>+</Text>
        </Pressable>
      </View>
    </View>
  );

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      {isLandscape ? (
        <View>
          <View style={styles.containerLandscape}>
            {todayBanner}
            {actionButtons}
          </View>
          {viewPanel}
        </View>
      ) : (
        <View style={styles.container}>
          {todayBanner}
          {actionButtons}
          {viewPanel}
        </View>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
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
  todayBannerIdle:   { backgroundColor: '#14181d', borderColor: '#28313b' },
  todayBannerActive: { backgroundColor: '#18222e', borderColor: '#35506a' },
  todayBannerOverdue:{ backgroundColor: '#2a1c1c', borderColor: '#6a3d3d' },
  todayBannerMain: { flex: 1 },
  todayBannerTitle: { color: '#edf4ff', fontSize: 14, fontWeight: '700' },
  todayBannerText:      { color: '#a8b6c7', fontSize: 12 },
  todayBannerDueToday:  { color: '#f5c842', fontWeight: '600' },
  todayBannerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weatherChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  weatherEmoji: { fontSize: 16 },
  weatherTemp:  { color: '#f0c060', fontSize: 13, fontWeight: '700' },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d64545',
  },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
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
    paddingVertical: 8,
    backgroundColor: '#1a9148',
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  locationBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#161e1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a5a3a',
  },
  locationBtnText: { color: '#7dcea0', fontWeight: '700', fontSize: 13 },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  viewBtnActive: {
    backgroundColor: '#1a9148',
    borderColor: '#1a9148',
  },
  viewBtnText: { color: '#777', fontWeight: '700', fontSize: 13 },
  viewBtnTextActive: { color: '#fff' },

  // ── View panel ─────────────────────────────────────────────────────────────
  viewPanel: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  viewToggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  viewToggle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#333',
  },
  viewToggleActive: {
    backgroundColor: '#1a2e1e',
    borderColor: '#2ecc71',
  },
  viewToggleLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '600',
  },
  viewToggleLabelActive: {
    color: '#2ecc71',
  },

  // ── Zoom row ───────────────────────────────────────────────────────────────
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnDisabled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#2a2a2a',
  },
  zoomBtnText: {
    color: '#ccc',
    fontSize: 18,
    fontWeight: '300',
    lineHeight: 22,
  },
  zoomBtnTextDisabled: {
    color: '#333',
  },
  zoomDots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  dotActive: {
    backgroundColor: '#2ecc71',
  },
});
