import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlannerStore } from '@/src/store/plannerStore';

import AddCropForm, { AddCropFormHandle } from './AddCropForm';
import TaskAssessForm from './TaskAssessForm';

type TabKey = 'crop' | 'tasks';

export default function EditCropModal() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [activeTab, setActiveTab] = useState<TabKey>('crop');
  const cropFormRef = useRef<AddCropFormHandle>(null);
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
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.container}>
      <View style={[styles.header, isLandscape && styles.headerCompact]}>
        <Text style={[styles.title, isLandscape && styles.titleCompact]}>{cropRow.crop.name}</Text>
        {!isLandscape && (
          <Text style={styles.subtitle}>{cropRow.crop.plant_count} plants</Text>
        )}
        <View style={[styles.tabRow, isLandscape && styles.tabRowCompact]}>
          <Pressable
            style={[styles.tabBtn, isLandscape && styles.tabBtnCompact, activeTab === 'crop' && styles.tabBtnActive]}
            onPress={() => setActiveTab('crop')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'crop' }}
            accessibilityLabel="Crop details tab"
          >
            <Text style={[styles.tabText, activeTab === 'crop' && styles.tabTextActive]}>Crop</Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, isLandscape && styles.tabBtnCompact, activeTab === 'tasks' && styles.tabBtnActive]}
            onPress={() => setActiveTab('tasks')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'tasks' }}
            accessibilityLabel="Tasks tab"
          >
            <Text style={[styles.tabText, activeTab === 'tasks' && styles.tabTextActive]}>Tasks</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        <View style={[styles.panel, activeTab !== 'crop' && styles.hiddenPanel]}>
          <AddCropForm ref={cropFormRef} cropId={selectedCropId} embedded />
        </View>
        <View style={[styles.panel, activeTab !== 'tasks' && styles.hiddenPanel]}>
          <TaskAssessForm embedded />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
        <View style={styles.footerMainRow}>
          <Pressable
            style={styles.closeBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityHint="Closes this modal without saving"
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
          <Pressable
            style={styles.saveBtn}
            onPress={() => cropFormRef.current?.submit()}
            accessibilityRole="button"
            accessibilityLabel="Save crop"
          >
            <Text style={styles.saveBtnText}>Save Crop</Text>
          </Pressable>
        </View>

        {activeTab === 'crop' && (
          <View style={styles.footerDangerRow}>
            <Pressable
              style={styles.archiveBtn}
              onPress={() => cropFormRef.current?.archive()}
              accessibilityRole="button"
              accessibilityLabel="Archive crop"
              accessibilityHint="Hides this crop from the planner; can be restored from the Archived toggle"
            >
              <Text style={styles.archiveBtnText}>Archive</Text>
            </Pressable>
            <Pressable
              style={styles.deleteBtn}
              onPress={() => cropFormRef.current?.remove()}
              accessibilityRole="button"
              accessibilityLabel="Delete crop"
              accessibilityHint="Permanently deletes this crop and all its tasks and completions"
            >
              <Text style={styles.deleteBtnText}>Delete</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    backgroundColor: '#111',
  },
  headerCompact: {
    paddingTop: 2,
    paddingBottom: 6,
  },
  title: { color: '#e7e7e7', fontSize: 20, fontWeight: '700' },
  titleCompact: { fontSize: 15 },
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
  tabRowCompact: {
    padding: 2,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 10,
  },
  tabBtnCompact: {
    paddingVertical: 7,
  },
  tabBtnActive: {
    backgroundColor: '#d8d0bf',
  },
  tabText: { color: '#8f8f8f', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  tabTextActive: { color: '#111' },
  content: { flex: 1, minHeight: 0 },
  panel: { flex: 1 },
  hiddenPanel: { display: 'none' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#262626',
    backgroundColor: '#111',
    gap: 8,
  },
  footerMainRow: {
    flexDirection: 'row',
    gap: 10,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#2ecc71',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#111',
    fontWeight: '700',
    fontSize: 15,
  },
  footerDangerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  archiveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  archiveBtnText: {
    color: '#e7c46a',
    fontSize: 13,
    fontWeight: '600',
  },
  deleteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  deleteBtnText: {
    color: '#7a5454',
    fontSize: 13,
  },
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