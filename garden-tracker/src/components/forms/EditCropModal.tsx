import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePlannerStore } from '@/src/store/plannerStore';

import AddCropForm from './AddCropForm';
import TaskAssessForm from './TaskAssessForm';

type TabKey = 'crop' | 'tasks';

export default function EditCropModal() {
  const [activeTab, setActiveTab] = useState<TabKey>('crop');
  const selectedCropId = usePlannerStore(s => s.selectedCropId);
  const rows = usePlannerStore(s => s.rows);

  const cropRow = rows.find(row => row.type === 'crop_row' && row.crop.id === selectedCropId);

  if (cropRow?.type !== 'crop_row' || selectedCropId == null) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No crop selected.</Text>
          <Text style={styles.emptyText}>Long-press a crop row to open its details.</Text>
          <Pressable style={styles.closeBtn} onPress={() => router.back()}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{cropRow.crop.name}</Text>
        <Text style={styles.subtitle}>{cropRow.crop.plant_count} plants</Text>
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabBtn, activeTab === 'crop' && styles.tabBtnActive]}
            onPress={() => setActiveTab('crop')}
          >
            <Text style={[styles.tabText, activeTab === 'crop' && styles.tabTextActive]}>Crop</Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, activeTab === 'tasks' && styles.tabBtnActive]}
            onPress={() => setActiveTab('tasks')}
          >
            <Text style={[styles.tabText, activeTab === 'tasks' && styles.tabTextActive]}>Tasks</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        {activeTab === 'crop'
          ? <AddCropForm cropId={selectedCropId} />
          : <TaskAssessForm embedded />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    backgroundColor: '#111',
  },
  title: { color: '#e7e7e7', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#787878', fontSize: 12, marginTop: 2, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 10,
  },
  tabBtnActive: {
    backgroundColor: '#d8d0bf',
  },
  tabText: { color: '#8f8f8f', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  tabTextActive: { color: '#111' },
  content: { flex: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyTitle: { color: '#ddd', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: '#777', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  closeBtn: {
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  closeBtnText: { color: '#ddd', fontWeight: '600', fontSize: 14 },
});