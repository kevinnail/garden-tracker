import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePlannerStore } from '@/src/store/plannerStore';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FREQ_OPTIONS = [1, 2, 3, 4];

export default function AddTaskForm() {
  const taskTypes      = usePlannerStore(s => s.taskTypes);
  const selectedCropId = usePlannerStore(s => s.selectedCropId);
  const addTask        = usePlannerStore(s => s.addTask);
  const deleteCrop     = usePlannerStore(s => s.deleteCrop);
  const rows           = usePlannerStore(s => s.rows);

  const cropRow = rows.find(r => r.type === 'crop_row' && r.crop.id === selectedCropId);
  const cropName = cropRow?.type === 'crop_row' ? cropRow.crop.name : null;

  const [taskTypeId, setTaskTypeId]       = useState<number>(taskTypes[0]?.id ?? 1);
  const [dayOfWeek, setDayOfWeek]         = useState<number>(1);
  const [frequencyWeeks, setFrequency]    = useState<number>(1);
  const [startOffsetWeeks, setOffset]     = useState<number>(0);
  const [submitting, setSubmitting]       = useState(false);

  const handleDeleteCrop = () => {
    if (selectedCropId == null || !cropName) return;
    Alert.alert(
      'Delete Crop',
      `Permanently delete "${cropName}" and all its tasks and completions? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await deleteCrop(selectedCropId); router.back(); } },
      ]
    );
  };

  const handleSubmit = async () => {
    if (selectedCropId == null) return Alert.alert('Error', 'No crop selected.');

    setSubmitting(true);
    try {
      await addTask({
        crop_instance_id: selectedCropId,
        task_type_id: taskTypeId,
        day_of_week: dayOfWeek,
        frequency_weeks: frequencyWeeks,
        start_offset_weeks: startOffsetWeeks,
      });
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save task.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >

        <Text style={styles.label}>Task Type</Text>
        <View style={styles.chipRow}>
          {taskTypes.map(tt => (
            <Pressable
              key={tt.id}
              style={[styles.chip, { borderColor: tt.color }, taskTypeId === tt.id && { backgroundColor: tt.color }]}
              onPress={() => setTaskTypeId(tt.id)}
            >
              <Text style={[styles.chipText, taskTypeId === tt.id && styles.chipTextSelected]}>
                {tt.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Day of Week</Text>
        <View style={styles.chipRow}>
          {DAYS.map((day, i) => (
            <Pressable
              key={i}
              style={[styles.dayChip, dayOfWeek === i && styles.dayChipSelected]}
              onPress={() => setDayOfWeek(i)}
            >
              <Text style={[styles.dayChipText, dayOfWeek === i && styles.dayChipTextSelected]}>
                {day}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Frequency (weeks)</Text>
        <View style={styles.chipRow}>
          {FREQ_OPTIONS.map(f => (
            <Pressable
              key={f}
              style={[styles.freqChip, frequencyWeeks === f && styles.freqChipSelected]}
              onPress={() => setFrequency(f)}
            >
              <Text style={[styles.freqChipText, frequencyWeeks === f && styles.freqChipTextSelected]}>
                Every {f}w
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Start Offset (weeks from crop start)</Text>
        <View style={styles.stepperRow}>
          <Pressable
            style={styles.stepperBtn}
            onPress={() => setOffset(o => Math.max(0, o - 1))}
          >
            <Text style={styles.stepperBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{startOffsetWeeks}</Text>
          <Pressable
            style={styles.stepperBtn}
            onPress={() => setOffset(o => o + 1)}
          >
            <Text style={styles.stepperBtnText}>+</Text>
          </Pressable>
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.cancelBtn} onPress={() => router.back()} disabled={submitting}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>Add Task</Text>
            }
          </Pressable>
        </View>

        <Pressable style={styles.deleteCropBtn} onPress={handleDeleteCrop}>
          <Text style={styles.deleteCropBtnText}>Delete Crop</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  content: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 40 },
  label: { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { color: '#aaa', fontSize: 12 },
  chipTextSelected: { color: '#111', fontWeight: 'bold' },
  dayChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#3a3a3a', backgroundColor: '#2a2a2a' },
  dayChipSelected: { borderColor: '#3498db', backgroundColor: '#1a3a5a' },
  dayChipText: { color: '#888', fontSize: 12 },
  dayChipTextSelected: { color: '#74b9ff', fontWeight: 'bold' },
  freqChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#3a3a3a', backgroundColor: '#2a2a2a' },
  freqChipSelected: { borderColor: '#9b59b6', backgroundColor: '#2d1b40' },
  freqChipText: { color: '#888', fontSize: 12 },
  freqChipTextSelected: { color: '#c39bd3', fontWeight: 'bold' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperBtn: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: '#4a4a4a', backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { color: '#eee', fontSize: 20, lineHeight: 24 },
  stepperValue: { color: '#eee', fontSize: 18, fontWeight: 'bold', minWidth: 32, textAlign: 'center' },
  actionRow: { marginTop: 32, flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderRadius: 8, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#4a4a4a', backgroundColor: '#262626' },
  cancelBtnText: { color: '#ddd', fontWeight: '600', fontSize: 15 },
  submitBtn: { flex: 1, backgroundColor: '#3498db', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  deleteCropBtn: { marginTop: 8, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  deleteCropBtnText: { color: '#664444', fontSize: 13 },
});
