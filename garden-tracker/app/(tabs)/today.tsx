import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePlannerData } from '@/src/hooks/usePlannerData';
import { TodayTaskItem } from '@/src/types';
import { usePlannerStore } from '@/src/store/plannerStore';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function TaskRow({ item, overdue = false }: { item: TodayTaskItem; overdue?: boolean }) {
  const focusPlannerCrop = usePlannerStore(s => s.focusPlannerCrop);

  const handlePress = () => {
    focusPlannerCrop(item.crop_instance_id, item.due_date);
    router.navigate('/(tabs)');
  };

  return (
    <Pressable style={styles.taskRow} onPress={handlePress}>
      <View style={[styles.colorRail, { backgroundColor: item.color }]} />
      <View style={styles.taskBody}>
        <View style={styles.taskTopRow}>
          <Text style={styles.taskTitle}>{item.task_type_name}</Text>
          <Text style={[styles.taskBadge, overdue ? styles.overdueBadge : styles.dueBadge]}>
            {overdue ? 'Overdue' : 'Due Today'}
          </Text>
        </View>
        <Text style={styles.taskMeta}>{item.crop_name} · {item.section_name}</Text>
        <Text style={styles.taskMeta}>{item.location_name} · {DAY_LABELS[item.day_of_week]} · {item.due_date}</Text>
      </View>
    </Pressable>
  );
}

function Section({
  title,
  items,
  overdue = false,
  emptyText,
}: {
  title: string;
  items: TodayTaskItem[];
  overdue?: boolean;
  emptyText: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        items.map(item => (
          <TaskRow key={`${item.task_id}:${item.week_date}`} item={item} overdue={overdue} />
        ))
      )}
    </View>
  );
}

export default function TodayScreen() {
  usePlannerData();

  const todayDueTasks = usePlannerStore(s => s.todayDueTasks);
  const todayOverdueTasks = usePlannerStore(s => s.todayOverdueTasks);

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
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
          items={todayDueTasks}
          emptyText="Nothing is due today."
        />
        <Section
          title="Overdue"
          items={todayOverdueTasks}
          overdue
          emptyText="No overdue tasks from the last 7 days."
        />
      </ScrollView>
    </SafeAreaView>
  );
}

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
    gap: 16,
  },
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
  taskRow: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#171c22',
    borderWidth: 1,
    borderColor: '#263240',
  },
  colorRail: {
    width: 6,
  },
  taskBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  taskTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  taskTitle: {
    flex: 1,
    color: '#f0f0f0',
    fontSize: 15,
    fontWeight: '700',
  },
  taskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    color: '#98a3b3',
    fontSize: 12,
  },
});