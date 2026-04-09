import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePlannerStore } from '@/src/store/plannerStore';

export default function PlannerToolbar() {
  const showArchivedRows = usePlannerStore(s => s.showArchivedRows);
  const toggleArchivedRows = usePlannerStore(s => s.toggleArchivedRows);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.bar}>
        <Pressable style={styles.btn} onPress={() => router.push('/(modals)/add-crop')}>
          <Text style={styles.btnText}>+ Crop</Text>
        </Pressable>
        <Pressable style={styles.locationBtn} onPress={() => router.push('/(modals)/add-garden')}>
          <Text style={styles.locationBtnText}>Gardens ⚙ </Text>
        </Pressable>
        <Pressable
          style={[styles.archiveBtn, showArchivedRows && styles.archiveBtnActive]}
          onPress={toggleArchivedRows}
        >
          <Text style={[styles.archiveBtnText, showArchivedRows && styles.archiveBtnTextActive]}>
            {showArchivedRows ? 'Archived On' : 'Archived'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#111',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    gap: 8,
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
