import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReanimatedSwipeable from 'react-native-gesture-handler/Swipeable';

import { usePlannerData } from '@/src/hooks/usePlannerData';
import { useTodayTick } from '@/src/hooks/useTodayTick';
import { TodayTaskItem } from '@/src/types';
import { usePlannerStore } from '@/src/store/plannerStore';
import { useWeather, wmoEmoji, wmoLabel, localDateStr, type DayForecast, type CurrentWeather, type HourForecast } from '@/src/hooks/useWeather';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Data grouping ─────────────────────────────────────────────────────────────

interface CropTaskGroup {
  cropId: number;
  cropName: string;
  gardenName: string;
  sectionName: string;
  locationName: string;
  record_type: 'plant' | 'mushroom';
  tasks: TodayTaskItem[];
}

function groupByCrop(items: TodayTaskItem[]): CropTaskGroup[] {
  const map = new Map<number, CropTaskGroup>();
  for (const item of items) {
    if (!map.has(item.crop_instance_id)) {
      map.set(item.crop_instance_id, {
        cropId: item.crop_instance_id,
        cropName: item.crop_name,
        gardenName: item.garden_name,
        sectionName: item.section_name,
        locationName: item.location_name,
        record_type: item.record_type,
        tasks: [],
      });
    }
    map.get(item.crop_instance_id)!.tasks.push(item);
  }
  return Array.from(map.values());
}

// ── Swipe-to-complete action panel ────────────────────────────────────────────

function DoneAction() {
  return (
    <View style={styles.doneAction}>
      <Text style={styles.doneActionText}>✓ Done</Text>
    </View>
  );
}

// ── Individual task row (swipeable) ───────────────────────────────────────────

function overdueBadgeLabel(missed_count: number): string {
  if (missed_count <= 1) return 'Overdue';
  return `${missed_count} wks overdue`;
}

function TaskSwipeRow({ item, overdue, onPress }: { item: TodayTaskItem; overdue: boolean; onPress: () => void }) {
  const completeTask = usePlannerStore(s => s.completeTask);
  const taskBg = overdue ? '#180808' : '#121008';
  const taskBorderColor = overdue ? '#2e1010' : '#241e08';

  return (
    <ReanimatedSwipeable
      friction={2}
      leftThreshold={60}
      renderLeftActions={() => <DoneAction />}
      onSwipeableOpen={() => { completeTask(item.task_id, item.week_date).catch(() => {}); }}
    >
      <View style={[styles.taskRow, { backgroundColor: taskBg, borderTopColor: taskBorderColor }]}>
        <Pressable style={styles.taskBody} onPress={onPress}>
          <View style={styles.taskTopRow}>
            <Text style={styles.taskTitle}>{item.task_type_name}</Text>
            <Text style={[styles.taskBadge, overdue ? styles.overdueBadge : styles.dueBadge]}>
              {overdue ? overdueBadgeLabel(item.missed_count) : 'Do today'}
            </Text>
          </View>
          <Text style={styles.taskMeta}>{DAY_LABELS[item.day_of_week]} · {item.due_date}</Text>
        </Pressable>
      </View>
    </ReanimatedSwipeable>
  );
}

// ── Crop group card ───────────────────────────────────────────────────────────

function CropGroup({ group, overdue }: { group: CropTaskGroup; overdue: boolean }) {
  const focusPlannerCrop = usePlannerStore(s => s.focusPlannerCrop);
  const setSelectedCrop = usePlannerStore(s => s.setSelectedCrop);

  const isMushroom = group.record_type === 'mushroom';
  const headerBg    = isMushroom ? '#231008' : '#0a2010';
  const cardBorder  = isMushroom ? '#4a2e14' : '#1e3d28';
  const taskListBg  = overdue ? '#180808' : '#121008';
  const cropNameColor  = isMushroom ? '#d8c0a0' : '#a8d8b0';
  const cropMetaColor  = isMushroom ? '#6a4530' : '#3a6048';
  const cropArrowColor = isMushroom ? '#c07840' : '#48a860';

  const handleHeaderPress = () => {
    const firstTask = group.tasks[0];
    setSelectedCrop(group.cropId);
    focusPlannerCrop(group.cropId, firstTask?.due_date ?? null);
    router.navigate('/(tabs)');
    router.push('/(modals)/manage-tasks');
  };

  return (
    <View style={[styles.cropGroup, { borderColor: cardBorder }]}>
      <Pressable
        style={[styles.cropHeader, { backgroundColor: headerBg, borderBottomColor: cardBorder }]}
        onPress={handleHeaderPress}
      >
        <View style={styles.cropHeaderLeft}>
          <Text style={[styles.cropName, { color: cropNameColor }]}>{group.cropName}</Text>
          <Text style={[styles.cropMeta, { color: cropMetaColor }]}>
            {group.locationName} · {group.gardenName} · {group.sectionName}
          </Text>
        </View>
        <Text style={[styles.cropArrow, { color: cropArrowColor }]}>
          {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''} ›
        </Text>
      </Pressable>
      <View style={[styles.taskList, { backgroundColor: taskListBg }]}>
        {group.tasks.map(task => (
          <TaskSwipeRow
            key={`${task.task_id}:${task.week_date}`}
            item={task}
            overdue={overdue}
            onPress={handleHeaderPress}
          />
        ))}
      </View>
    </View>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  title,
  groups,
  overdue = false,
  emptyText,
}: {
  title: string;
  groups: CropTaskGroup[];
  overdue?: boolean;
  emptyText: string;
}) {
  const totalTasks = groups.reduce((n, g) => n + g.tasks.length, 0);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{totalTasks}</Text>
      </View>

      {groups.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        groups.map(group => (
          <CropGroup key={group.cropId} group={group} overdue={overdue} />
        ))
      )}
    </View>
  );
}

// ── Weather ───────────────────────────────────────────────────────────────────

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHour(time: string): string {
  const h = parseInt(time.slice(11, 13), 10);
  if (h === 0)  return '12 AM';
  if (h === 12) return '12 PM';
  return h > 12 ? `${h - 12} PM` : `${h} AM`;
}

// ── Now panel ─────────────────────────────────────────────────────────────────

function NowStat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={wxStyles.nowStatItem}>
      <Text style={[wxStyles.nowStatValue, highlight && wxStyles.nowStatHighlight]}>{value}</Text>
      <Text style={wxStyles.nowStatLabel}>{label}</Text>
    </View>
  );
}

function NowPanel({ current }: { current: CurrentWeather }) {
  return (
    <View style={wxStyles.nowCard}>
      <View style={wxStyles.nowMain}>
        <Text style={wxStyles.nowEmoji}>{wmoEmoji(current.code)}</Text>
        <View style={wxStyles.nowTempBlock}>
          <Text style={wxStyles.nowTemp}>{current.tempF}°</Text>
          <Text style={wxStyles.nowCondition}>{wmoLabel(current.code)}</Text>
          <Text style={wxStyles.nowFeels}>Feels like {current.feelsLikeF}°</Text>
        </View>
      </View>
      <View style={wxStyles.nowStats}>
        <NowStat label="Humidity" value={`${current.humidity}%`} highlight={current.humidity >= 85} />
        <NowStat label="Wind" value={`${current.windMph} mph`} />
        {current.precipIn > 0
          ? <NowStat label="Rain" value={`${current.precipIn.toFixed(2)}"`} />
          : <NowStat label="Rain" value="None" />
        }
      </View>
    </View>
  );
}

// ── Hourly list ───────────────────────────────────────────────────────────────

function HourCard({ hour, isNow }: { hour: HourForecast; isNow: boolean }) {
  return (
    <View style={[wxStyles.hourCard, isNow && wxStyles.hourCardNow]}>
      <Text style={[wxStyles.hourLabel, isNow && wxStyles.hourLabelNow]}>
        {isNow ? 'Now' : formatHour(hour.time)}
      </Text>
      <Text style={wxStyles.hourEmoji}>{wmoEmoji(hour.code)}</Text>
      <Text style={wxStyles.hourTemp}>{hour.tempF}°</Text>
      <View style={wxStyles.hourDetails}>
        {hour.precipPct > 0 && <Text style={wxStyles.hourPrecip}>💧 {hour.precipPct}%</Text>}
        {hour.windMph >= 20 && <Text style={wxStyles.hourWind}>💨 {hour.windMph}</Text>}
      </View>
    </View>
  );
}

function HourlyScroll({ hourly }: { hourly: HourForecast[] }) {
  return (
    <View style={wxStyles.verticalList}>
      {hourly.map((hour, i) => (
        <HourCard key={hour.time} hour={hour} isNow={i === 0} />
      ))}
    </View>
  );
}

// ── 10-day list ───────────────────────────────────────────────────────────────

function DayCard({ day, isToday }: { day: DayForecast; isToday: boolean }) {
  const date = new Date(day.date + 'T12:00:00'); // noon local avoids DST edge
  const dayName = isToday ? 'Today' : DAY_ABBR[date.getDay()];
  const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;

  return (
    <View style={[wxStyles.card, isToday && wxStyles.cardToday]}>
      <View style={wxStyles.cardDayCol}>
        <Text style={[wxStyles.cardDay, isToday && wxStyles.cardDayToday]}>{dayName}</Text>
        <Text style={wxStyles.cardDate}>{monthDay}</Text>
      </View>
      <View style={wxStyles.cardConditionCol}>
        <Text style={wxStyles.cardEmoji}>{wmoEmoji(day.code)}</Text>
        <Text style={wxStyles.cardCondition} numberOfLines={1}>{wmoLabel(day.code)}</Text>
      </View>
      <View style={wxStyles.cardTemps}>
        <Text style={wxStyles.tempHigh}>{day.tempMax}°</Text>
        <Text style={wxStyles.tempLow}>{day.tempMin}°</Text>
      </View>
      <View style={wxStyles.cardDetails}>
        {day.precipPct > 0 && <Text style={wxStyles.cardPrecip}>💧 {day.precipPct}%</Text>}
        {day.uvIndex >= 6 && <Text style={wxStyles.cardUv}>UV {day.uvIndex}</Text>}
        {day.windMph >= 15 && <Text style={wxStyles.cardWind}>💨 {day.windMph}</Text>}
      </View>
    </View>
  );
}

// ── Weather section ───────────────────────────────────────────────────────────

type WeatherTab = 'now' | 'hourly' | '10day';

const TAB_LABELS: Record<WeatherTab, string> = { now: 'Now', hourly: 'Hourly', '10day': '10 Days' };
const TAB_ORDER: WeatherTab[] = ['now', 'hourly', '10day'];

function WeatherSection() {
  const wx = useWeather();
  const today = localDateStr();
  const [tab, setTab] = useState<WeatherTab>('now');

  const statusContent = wx.status === 'loading' ? (
    <View style={wxStyles.statusCard}><Text style={wxStyles.statusText}>Loading weather…</Text></View>
  ) : wx.status === 'no_network' ? (
    <View style={wxStyles.statusCard}><Text style={wxStyles.statusText}>Weather unavailable — no network connection.</Text></View>
  ) : wx.status === 'no_location' ? (
    <View style={wxStyles.statusCard}><Text style={wxStyles.statusText}>Weather unavailable — location permission denied.</Text></View>
  ) : wx.status === 'error' ? (
    <View style={[wxStyles.statusCard, wxStyles.statusCardError]}><Text style={wxStyles.statusTextError}>Weather error: {wx.message}</Text></View>
  ) : null;

  if (statusContent) {
    return (
      <View style={wxStyles.container}>
        <Text style={wxStyles.sectionTitle}>Weather</Text>
        {statusContent}
      </View>
    );
  }

  if (wx.status !== 'ok') return null;

  return (
    <View style={wxStyles.container}>
      <View style={wxStyles.sectionHeaderRow}>
        <Text style={wxStyles.sectionTitle}>Weather</Text>
        <Text style={wxStyles.locationLabel}>{wx.locationLabel}</Text>
      </View>
      <View style={wxStyles.tabBar}>
        {TAB_ORDER.map(t => (
          <Pressable key={t} style={[wxStyles.tab, tab === t && wxStyles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[wxStyles.tabText, tab === t && wxStyles.tabTextActive]}>{TAB_LABELS[t]}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'now' && <NowPanel current={wx.current} />}
      {tab === 'hourly' && <HourlyScroll hourly={wx.hourly} />}
      {tab === '10day' && (
        <View style={wxStyles.verticalList}>
          {wx.days.map(day => (
            <DayCard key={day.date} day={day} isToday={day.date === today} />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TodayScreen() {
  usePlannerData();
  // Re-render across local midnight so `todayLabel` advances.
  useTodayTick();

  const todayDueTasks    = usePlannerStore(s => s.todayDueTasks);
  const todayOverdueTasks = usePlannerStore(s => s.todayOverdueTasks);

  const dueGroups      = useMemo(() => groupByCrop(todayDueTasks),    [todayDueTasks]);
  const overdueGroups  = useMemo(() => groupByCrop(todayOverdueTasks), [todayOverdueTasks]);

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.subtitle}>{todayLabel}</Text>
        </View>
        <Pressable style={styles.plannerBtn} onPress={() => router.navigate('/(tabs)')}>
          <Text style={styles.plannerBtnText}>Planner</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section
          title="Up Today"
          groups={dueGroups}
          emptyText="Nothing is due today."
        />
        <Section
          title="Overdue"
          groups={overdueGroups}
          overdue
          emptyText="No overdue tasks from the last 7 days."
        />
        <WeatherSection />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#111111',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2b2b2b',
    backgroundColor: '#0f0f0f',
  },
  title: {
    color: '#f3f3f3',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#8c8c8c',
    fontSize: 13,
    marginTop: 2,
  },
  plannerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#202833',
    borderWidth: 1,
    borderColor: '#35465a',
  },
  plannerBtnText: {
    color: '#d9e6f5',
    fontSize: 13,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    gap: 20,
  },

  // Section
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#f0f0f0',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionCount: {
    color: '#8d8d8d',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#262626',
  },
  emptyText: {
    color: '#828282',
    fontSize: 13,
  },

  // Crop group card
  cropGroup: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cropHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  cropHeaderLeft: {
    flex: 1,
    gap: 3,
  },
  cropName: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  cropMeta: {
    fontSize: 12,
  },
  cropArrow: {
    fontSize: 12,
    fontWeight: '600',
    paddingLeft: 12,
  },

  // Task list inside the group
  taskList: {
    gap: 0,
  },
  taskRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  taskBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 3,
  },
  taskTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  taskTitle: {
    flex: 1,
    color: '#c8cec8',
    fontSize: 13,
    fontWeight: '500',
  },
  taskBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  dueBadge: {
    color: '#f0c840',
    backgroundColor: '#3a2e00',
  },
  overdueBadge: {
    color: '#ff7878',
    backgroundColor: '#5c1818',
  },
  taskMeta: {
    color: '#4a5248',
    fontSize: 11,
  },

  // Swipe-to-complete action
  doneAction: {
    backgroundColor: '#1e5c2e',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    minWidth: 80,
  },
  doneActionText: {
    color: '#7fdb9e',
    fontSize: 13,
    fontWeight: '700',
  },
});

// ── Weather styles ────────────────────────────────────────────────────────────

const wxStyles = StyleSheet.create({
  container: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#f0f0f0',
    fontSize: 18,
    fontWeight: '700',
  },
  locationLabel: {
    color: '#4a7a9b',
    fontSize: 12,
    fontWeight: '500',
  },
  verticalList: {
    gap: 6,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    gap: 6,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#111820',
    borderWidth: 1,
    borderColor: '#1a2a38',
  },
  tabActive: {
    backgroundColor: '#0f2035',
    borderColor: '#3b7abf',
  },
  tabText: {
    color: '#3a5a72',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#7ecbf0',
  },

  // Now panel
  nowCard: {
    backgroundColor: '#0d1a27',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e2d3d',
    padding: 16,
    gap: 14,
  },
  nowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  nowEmoji: {
    fontSize: 52,
  },
  nowTempBlock: {
    gap: 2,
  },
  nowTemp: {
    color: '#f0c060',
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 44,
  },
  nowCondition: {
    color: '#8daec8',
    fontSize: 16,
    fontWeight: '600',
  },
  nowFeels: {
    color: '#4a6a85',
    fontSize: 13,
    marginTop: 2,
  },
  nowStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1e2d3d',
    paddingTop: 12,
  },
  nowStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  nowStatValue: {
    color: '#8daec8',
    fontSize: 17,
    fontWeight: '700',
  },
  nowStatHighlight: {
    color: '#f0c060',
  },
  nowStatLabel: {
    color: '#3a5a72',
    fontSize: 11,
    fontWeight: '500',
  },

  // Hourly rows
  hourCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d1a27',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e2d3d',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  hourCardNow: {
    borderColor: '#3b7abf',
    backgroundColor: '#0f2035',
  },
  hourLabel: {
    color: '#4a6a85',
    fontSize: 12,
    fontWeight: '700',
    width: 46,
  },
  hourLabelNow: {
    color: '#7ecbf0',
  },
  hourEmoji: {
    fontSize: 20,
  },
  hourTemp: {
    color: '#f0c060',
    fontSize: 14,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
  },
  hourDetails: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  hourPrecip: {
    color: '#5bb5d8',
    fontSize: 12,
  },
  hourWind: {
    color: '#a8b8c8',
    fontSize: 12,
  },

  // 10-day rows
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d1a27',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e2d3d',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  cardToday: {
    borderColor: '#3b7abf',
    backgroundColor: '#0f2035',
  },
  cardDayCol: {
    width: 52,
  },
  cardDay: {
    color: '#8daec8',
    fontSize: 12,
    fontWeight: '700',
  },
  cardDayToday: {
    color: '#7ecbf0',
  },
  cardDate: {
    color: '#4a6a85',
    fontSize: 10,
    marginTop: 1,
  },
  cardConditionCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardEmoji: {
    fontSize: 20,
  },
  cardCondition: {
    flex: 1,
    color: '#7a9db8',
    fontSize: 12,
  },
  cardTemps: {
    flexDirection: 'row',
    gap: 6,
    width: 68,
    justifyContent: 'flex-end',
  },
  tempHigh: {
    color: '#f0c060',
    fontSize: 13,
    fontWeight: '700',
  },
  tempLow: {
    color: '#6898b8',
    fontSize: 13,
  },
  cardDetails: {
    width: 58,
    alignItems: 'flex-end',
    gap: 2,
  },
  cardPrecip: {
    color: '#5bb5d8',
    fontSize: 11,
  },
  cardUv: {
    color: '#e8a040',
    fontSize: 11,
  },
  cardWind: {
    color: '#a8b8c8',
    fontSize: 11,
  },

  // Status cards
  statusCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#262626',
  },
  statusCardError: {
    backgroundColor: '#1f0f0f',
    borderColor: '#4a2020',
  },
  statusText: {
    color: '#828282',
    fontSize: 13,
  },
  statusTextError: {
    color: '#e07070',
    fontSize: 13,
  },
});
