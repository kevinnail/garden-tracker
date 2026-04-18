import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Pressable, Alert, useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePlannerStore } from '@/src/store/plannerStore';
import { toSunday, dateToWeekIndex, parseDateKey } from '@/src/utils/dateUtils';
import { getTaskLineOccurrences } from '@/src/utils/taskUtils';
import { Task } from '@/src/types';

interface TaskAssessFormProps {
  embedded?: boolean;
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function formatShortDate(date: Date | null): string {
  if (!date) return 'Unknown';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatOccurrenceDate(weekSunday: string, dayOfWeek: number): string {
  const sunday = parseDateKey(weekSunday);
  if (!sunday) return weekSunday;
  const date = new Date(sunday);
  date.setDate(date.getDate() + dayOfWeek);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function TaskAssessForm({ embedded = false }: TaskAssessFormProps) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const occurrenceListMaxHeight = Math.max(180, Math.min(300, Math.round(height * 0.4)));
  const rows = usePlannerStore(s => s.rows);
  const calendarStart = usePlannerStore(s => s.calendarStart);
  const selectedCropId = usePlannerStore(s => s.selectedCropId);
  const completeTask = usePlannerStore(s => s.completeTask);
  const uncompleteTask = usePlannerStore(s => s.uncompleteTask);
  const deleteTask = usePlannerStore(s => s.deleteTask);
  const adjustTaskDay = usePlannerStore(s => s.adjustTaskDay);

  const cropRow = rows.find(r => r.type === 'crop_row' && r.crop.id === selectedCropId);

  const wrapInSafeArea = (content: React.ReactNode) => {
    if (embedded) {
      return content;
    }

    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        {content}
      </SafeAreaView>
    );
  };

  if (cropRow?.type !== 'crop_row') {
    return wrapInSafeArea(
      <View style={styles.container}>
        <Text style={styles.empty}>No crop selected.</Text>
        {!embedded && (
          <Pressable style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const { tasks, completions, crop, weekColorMap } = cropRow;
  const completionSet = new Set(completions.map(c => `${c.task_id}:${c.completed_date}`));
  const isMushroom = crop.record_type === 'mushroom';

  const colorKeys = Object.keys(weekColorMap).map(Number);
  const cropStartWeek = colorKeys.length > 0 ? colorKeys.reduce((a, b) => a < b ? a : b) : dateToWeekIndex(calendarStart, (() => {
    const d = parseDateKey(crop.start_date);
    return d ?? toSunday(new Date());
  })());
  const cropEndWeek = colorKeys.length > 0 ? colorKeys.reduce((a, b) => a > b ? a : b) : cropStartWeek;
  const cropEndDate = (() => {
    if (colorKeys.length === 0) {
      return parseDateKey(crop.start_date);
    }
    const endDate = new Date(calendarStart);
    endDate.setDate(endDate.getDate() + cropEndWeek * 7 + 6);
    endDate.setHours(0, 0, 0, 0);
    return endDate;
  })();
  const unitLabel = isMushroom ? (crop.plant_count === 1 ? 'unit' : 'units') : (crop.plant_count === 1 ? 'plant' : 'plants');
  const cropSummary = `${crop.plant_count} ${unitLabel} • ${formatShortDate(parseDateKey(crop.start_date))} to ${formatShortDate(cropEndDate)}`;

  const todayDate = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const todayWeek = dateToWeekIndex(calendarStart, toSunday(new Date()));

  const handleToggle = async (task: Task, weekSunday: string) => {
    try {
      const key = `${task.id}:${weekSunday}`;
      if (completionSet.has(key)) {
        await uncompleteTask(task.id, weekSunday);
      } else {
        await completeTask(task.id, weekSunday);
      }
    } catch { /* toast shown by store */ }
  };

  const handleDelete = (task: Task) => {
    Alert.alert(
      'Delete Task',
      `Delete "${task.task_type_name}" (${DAYS_SHORT[task.day_of_week]}, every ${task.frequency_weeks}w)? This removes all completion history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteTask(task.id); } catch { /* toast shown by store */ } } },
      ]
    );
  };

  const handleAdjustDay = async (task: Task, delta: number) => {
    try {
      await adjustTaskDay(task.id, (task.day_of_week + delta + 7) % 7);
    } catch { /* toast shown by store */ }
  };

  const handleAddTask = () => {
    router.push('/(modals)/add-task');
  };

  if (tasks.length === 0) {
    return wrapInSafeArea(
      <View style={styles.container}>
        {!embedded && (
          <View style={[styles.header, isMushroom && styles.headerMushroom, isLandscape && styles.headerCompact]}>
            <Text style={styles.cropName}>{crop.name}</Text>
            <Text style={[styles.cropSummary, isMushroom && styles.cropSummaryMushroom, isLandscape && styles.cropSummaryCompact]}>{cropSummary}</Text>
          </View>
        )}
        <Text style={styles.empty}>
          No tasks for {crop.name}.{"\n"}Tap + Task to add your first one.
        </Text>
        <View style={styles.actionRow}>
          <Pressable style={styles.addTaskBtn} onPress={handleAddTask}>
            <Text style={styles.addTaskBtnText}>+ Task</Text>
          </Pressable>
          {!embedded && (
            <Pressable style={styles.doneBtn} onPress={() => router.back()}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return wrapInSafeArea(
    <View style={styles.container}>
      {!embedded && (
        <View style={[styles.header, isMushroom && styles.headerMushroom, isLandscape && styles.headerCompact]}>
          <Text style={styles.cropName}>{crop.name}</Text>
          <Text style={[styles.cropSummary, isMushroom && styles.cropSummaryMushroom, isLandscape && styles.cropSummaryCompact]}>{cropSummary}</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={[styles.content, embedded && styles.embeddedContent]}>

        {tasks.map(task => {
        const occurrences = getTaskLineOccurrences(task, cropStartWeek, cropEndWeek, calendarStart)
          .filter(occ => occ.weekIndex >= cropStartWeek && occ.weekIndex <= cropEndWeek);

        return (
          <View key={task.id} style={styles.taskBlock}>
            <View style={styles.taskTypeHeader}>
              <View style={[styles.colorDot, { backgroundColor: task.color }]} />
              <Text style={styles.taskTypeName}>{task.task_type_name}</Text>
              <View style={styles.dayAdjuster}>
                <Pressable style={styles.adjBtn} onPress={() => handleAdjustDay(task, -1)}>
                  <Text style={styles.adjBtnText}>◀</Text>
                </Pressable>
                <Text style={styles.dayLabel}>{DAYS_SHORT[task.day_of_week]}</Text>
                <Pressable style={styles.adjBtn} onPress={() => handleAdjustDay(task, 1)}>
                  <Text style={styles.adjBtnText}>▶</Text>
                </Pressable>
              </View>
              <Text style={styles.freqLabel}>/{task.frequency_weeks}w</Text>
              <Pressable onPress={() => handleDelete(task)} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>✕</Text>
              </Pressable>
            </View>

            {occurrences.length === 0 ? (
              <Text style={styles.noOccurrences}>No occurrences in this window</Text>
            ) : (
              <ScrollView
                style={[styles.occurrenceList, { maxHeight: occurrenceListMaxHeight }]}
                nestedScrollEnabled
                showsVerticalScrollIndicator={occurrences.length > 4}
              >
                {occurrences.map(occ => {
                  const done = completionSet.has(`${task.id}:${occ.weekSunday}`);
                  const taskSunday = parseDateKey(occ.weekSunday);
                  const taskDate = taskSunday
                    ? new Date(taskSunday.getTime() + task.day_of_week * 24 * 60 * 60 * 1000)
                    : null;
                  const isPast = taskDate ? taskDate < todayDate : occ.weekIndex < todayWeek;
                  const isThisWeek = occ.weekIndex === todayWeek;
                  return (
                    <Pressable
                      key={occ.weekSunday}
                      style={[styles.occurrenceRow, done && styles.occurrenceRowDone]}
                      onPress={() => handleToggle(task, occ.weekSunday)}
                    >
                      <View style={[styles.checkBox, done && { backgroundColor: task.color, borderColor: task.color }]}>
                        {done && <Text style={styles.checkMark}>✓</Text>}
                      </View>
                      <Text style={[styles.occurrenceDate, done && styles.occurrenceDateDone, isPast && !done && styles.occurrenceDateOverdue]}>
                        {formatOccurrenceDate(occ.weekSunday, task.day_of_week)}
                      </Text>
                      {isPast && !done && (
                        <View style={styles.overdueBadge}>
                          <Text style={styles.overdueBadgeText}>Overdue</Text>
                        </View>
                      )}
                      {!isPast && !done && isThisWeek && (
                        <View style={styles.dueBadge}>
                          <Text style={styles.dueBadgeText}>Due</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        );
        })}

        <View style={styles.actionRow}>
          <Pressable style={styles.addTaskBtn} onPress={handleAddTask}>
            <Text style={styles.addTaskBtnText}>+ Task</Text>
          </Pressable>
          {!embedded && (
            <Pressable style={styles.doneBtn} onPress={() => router.back()}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#148a3e',
    backgroundColor: '#1a9148',
  },
  headerMushroom: {
    backgroundColor: '#3A2010',
    borderBottomColor: '#5c2e08',
  },
  headerCompact: {
    paddingTop: 6,
    paddingBottom: 6,
  },
  cropName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  cropSummary: {
    marginTop: 4,
    color: '#c8ffe0',
    fontSize: 13,
    fontWeight: '600',
  },
  cropSummaryMushroom: { color: '#d4a882' },
  cropSummaryCompact: {
    marginTop: 2,
  },
  content: { padding: 16, paddingBottom: 40 },
  embeddedContent: { paddingBottom: 20 },
  empty: { color: '#555', fontSize: 14, padding: 24, textAlign: 'center', lineHeight: 22 },

  taskBlock: {
    backgroundColor: '#222',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
    overflow: 'hidden',
  },
  taskTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e2e',
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  taskTypeName: { flex: 1, color: '#ddd', fontSize: 14, fontWeight: '600' },
  dayAdjuster: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  adjBtn: { padding: 4 },
  adjBtnText: { color: '#666', fontSize: 11 },
  dayLabel: { color: '#aaa', fontSize: 12, minWidth: 28, textAlign: 'center' },
  freqLabel: { color: '#555', fontSize: 11 },
  deleteBtn: { padding: 6 },
  deleteBtnText: { color: '#664444', fontSize: 13 },

  noOccurrences: { color: '#444', fontSize: 12, padding: 12, fontStyle: 'italic' },
  occurrenceList: { maxHeight: 240 },

  occurrenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  occurrenceRowDone: { opacity: 0.6 },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#111', fontSize: 12, fontWeight: 'bold' },
  occurrenceDate: { flex: 1, color: '#ccc', fontSize: 13 },
  occurrenceDateDone: { color: '#666', textDecorationLine: 'line-through' },
  occurrenceDateOverdue: { color: '#e07070' },
  overdueBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: '#3a1a1a' },
  overdueBadgeText: { color: '#e07070', fontSize: 10, fontWeight: 'bold' },
  dueBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: '#0c2d36' },
  dueBadgeText: { color: '#67e8f9', fontSize: 10 },

  actionRow: { marginTop: 8, flexDirection: 'row', gap: 10 },
  addTaskBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: '#0891b2', backgroundColor: '#0c2d36', alignItems: 'center' },
  addTaskBtnText: { color: '#67e8f9', fontWeight: '700', fontSize: 15 },
  doneBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: '#4a4a4a', backgroundColor: '#262626', alignItems: 'center' },
  doneBtnText: { color: '#ddd', fontWeight: '600', fontSize: 15 },
});
