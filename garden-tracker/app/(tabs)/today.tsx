import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReanimatedSwipeable from 'react-native-gesture-handler/Swipeable';

import { usePlannerData } from '@/src/hooks/usePlannerData';
import { TodayTaskItem } from '@/src/types';
import { usePlannerStore } from '@/src/store/plannerStore';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Data grouping ─────────────────────────────────────────────────────────────

interface CropTaskGroup {
  cropId: number;
  cropName: string;
  gardenName: string;
  sectionName: string;
  locationName: string;
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

function TaskSwipeRow({ item, overdue }: { item: TodayTaskItem; overdue: boolean }) {
  const completeTask = usePlannerStore(s => s.completeTask);

  return (
    <ReanimatedSwipeable
      friction={2}
      leftThreshold={60}
      renderLeftActions={() => <DoneAction />}
      onSwipeableOpen={() => { completeTask(item.task_id, item.week_date).catch(() => {}); }}
    >
      <View style={styles.taskRow}>
        <View style={styles.taskBody}>
          <View style={styles.taskTopRow}>
            <Text style={styles.taskTitle}>{item.task_type_name}</Text>
            <Text style={[styles.taskBadge, overdue ? styles.overdueBadge : styles.dueBadge]}>
              {overdue ? overdueBadgeLabel(item.missed_count) : 'Due Today'}
            </Text>
          </View>
          <Text style={styles.taskMeta}>{DAY_LABELS[item.day_of_week]} · {item.due_date}</Text>
        </View>
      </View>
    </ReanimatedSwipeable>
  );
}

// ── Crop group card ───────────────────────────────────────────────────────────

function CropGroup({ group, overdue }: { group: CropTaskGroup; overdue: boolean }) {
  const focusPlannerCrop = usePlannerStore(s => s.focusPlannerCrop);
  const setSelectedCrop = usePlannerStore(s => s.setSelectedCrop);

  const handleHeaderPress = () => {
    const firstTask = group.tasks[0];
    setSelectedCrop(group.cropId);
    focusPlannerCrop(group.cropId, firstTask?.due_date ?? null);
    router.navigate('/(tabs)');
    router.push('/(modals)/manage-tasks');
  };

  return (
    <View style={styles.cropGroup}>
      <Pressable style={styles.cropHeader} onPress={handleHeaderPress}>
        <View style={styles.cropHeaderLeft}>
          <Text style={styles.cropName}>{group.cropName}</Text>
          <Text style={styles.cropMeta}>{group.locationName} · {group.gardenName} · {group.sectionName}</Text>
        </View>
        <Text style={styles.cropArrow}>
          {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''} ›
        </Text>
      </Pressable>
      <View style={styles.taskList}>
        {group.tasks.map(task => (
          <TaskSwipeRow
            key={`${task.task_id}:${task.week_date}`}
            item={task}
            overdue={overdue}
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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TodayScreen() {
  usePlannerData();

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
          title="Due Today"
          groups={dueGroups}
          emptyText="Nothing is due today."
        />
        <Section
          title="Overdue"
          groups={overdueGroups}
          overdue
          emptyText="No overdue tasks from the last 7 days."
        />
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
    borderColor: '#1e2d3d',
  },
  cropHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#0d1a27',
    borderBottomWidth: 1,
    borderBottomColor: '#1e2d3d',
  },
  cropHeaderLeft: {
    flex: 1,
    gap: 3,
  },
  cropName: {
    color: '#cde0f0',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  cropMeta: {
    color: '#3d5a72',
    fontSize: 12,
  },
  cropArrow: {
    color: '#2d5070',
    fontSize: 12,
    fontWeight: '600',
    paddingLeft: 12,
  },

  // Task list inside the group
  taskList: {
    gap: 0,
    backgroundColor: '#080e14',
  },
  taskRow: {
    backgroundColor: '#080e14',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1a2535',
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
    color: '#9db8cc',
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
    color: '#d0e4ff',
    backgroundColor: '#213148',
  },
  overdueBadge: {
    color: '#ffd7d7',
    backgroundColor: '#4a2020',
  },
  taskMeta: {
    color: '#2e4a5e',
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
