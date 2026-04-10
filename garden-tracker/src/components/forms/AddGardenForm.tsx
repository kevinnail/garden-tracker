import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePlannerStore } from '@/src/store/plannerStore';
import { LocationGroup, Location, Section } from '@/src/types';
import { getAllLocationGroups, getAllLocations, getAllSections } from '@/src/db/queries/locationQueries';

type Mode = 'garden' | 'location' | 'section';

const TIPS: Record<Mode, string> = {
  garden:   'Step 1 — A Garden is your top-level space (e.g. "Backyard"). Add a Location inside it next.',
  location: 'Step 2 — A Location is an area within a Garden (e.g. "Raised Beds"). Add a Section inside it next.',
  section:  'Step 3 — A Section is where crops live (e.g. "Bed 1"). Once added, you can assign crops to it.',
};

function gardenStatus(g: LocationGroup, locations: Location[], sections: Section[]): 'ready' | 'needs-location' | 'needs-section' {
  const locs = locations.filter(l => l.location_group_id === g.id);
  if (locs.length === 0) return 'needs-location';
  const hasSec = locs.some(l => sections.some(s => s.location_id === l.id));
  return hasSec ? 'ready' : 'needs-section';
}

const STATUS_LABEL: Record<string, string> = {
  'ready':          '✓ Ready',
  'needs-location': '→ Add Location',
  'needs-section':  '→ Add Section',
};
const STATUS_COLOR: Record<string, string> = {
  'ready':          '#2ecc71',
  'needs-location': '#e67e22',
  'needs-section':  '#e67e22',
};

export default function AddGardenForm() {
  const addLocationGroup  = usePlannerStore(s => s.addLocationGroup);
  const addLocation       = usePlannerStore(s => s.addLocation);
  const addSection        = usePlannerStore(s => s.addSection);
  const removeLocationGroup = usePlannerStore(s => s.removeLocationGroup);
  const removeLocation    = usePlannerStore(s => s.removeLocation);
  const removeSection     = usePlannerStore(s => s.removeSection);
  const resetAllData      = usePlannerStore(s => s.resetAllData);

  const [mode, setMode]             = useState<Mode>('garden');
  const [name, setName]             = useState('');
  const [groups, setGroups]         = useState<LocationGroup[]>([]);
  const [locations, setLocations]   = useState<Location[]>([]);
  const [sections, setSections]     = useState<Section[]>([]);
  const [groupId, setGroupId]       = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastAdded, setLastAdded]   = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const reload = useCallback(async () => {
    const [g, l, s] = await Promise.all([getAllLocationGroups(), getAllLocations(), getAllSections()]);
    setGroups(g);
    setLocations(l);
    setSections(s);
    return { g, l, s };
  }, []);

  useEffect(() => { reload(); }, []);

  // Keep locationId in sync when groupId changes
  useEffect(() => {
    const filtered = locations.filter(l => l.location_group_id === groupId);
    if (filtered.length > 0) {
      if (!filtered.find(l => l.id === locationId)) setLocationId(filtered[0].id);
    } else {
      setLocationId(null);
    }
  }, [groupId, locations]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setName('');
    setLastAdded(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return Alert.alert('Validation', 'Name is required.');
    if (mode === 'location' && groupId == null)
      return Alert.alert('Validation', 'Select a Garden first.');
    if (mode === 'section' && locationId == null)
      return Alert.alert('Validation', 'Select a Location first.');

    setSubmitting(true);
    try {
      const trimmed = name.trim();
      if (mode === 'garden') {
        await addLocationGroup(trimmed);
        const { g } = await reload();
        const created = g.find(x => x.name === trimmed);
        if (created) setGroupId(created.id);
        setMode('location');
      } else if (mode === 'location') {
        await addLocation(groupId!, trimmed);
        const { l } = await reload();
        const created = l.find(x => x.name === trimmed && x.location_group_id === groupId);
        if (created) setLocationId(created.id);
        setMode('section');
      } else {
        await addSection(locationId!, trimmed);
        await reload();
      }
      setLastAdded(name.trim());
      setName('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch {
      Alert.alert('Error', 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteGroup = (g: LocationGroup) => {
    const locCount = locations.filter(l => l.location_group_id === g.id).length;
    const detail = locCount > 0 ? ` It contains ${locCount} location(s) and all their crops.` : '';
    Alert.alert(
      'Delete Garden',
      `Delete "${g.name}"?${detail} This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          await removeLocationGroup(g.id);
          if (groupId === g.id) setGroupId(null);
          await reload();
        }},
      ]
    );
  };

  const confirmDeleteLocation = (l: Location) => {
    const secCount = sections.filter(s => s.location_id === l.id).length;
    const detail = secCount > 0 ? ` It contains ${secCount} section(s) and all their crops.` : '';
    Alert.alert(
      'Delete Location',
      `Delete "${l.name}"?${detail} This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          await removeLocation(l.id);
          if (locationId === l.id) setLocationId(null);
          await reload();
        }},
      ]
    );
  };

  const confirmDeleteSection = (s: Section) => {
    Alert.alert(
      'Delete Section',
      `Delete "${s.name}"? All crops in this section will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          await removeSection(s.id);
          await reload();
        }},
      ]
    );
  };

  const filteredLocations = locations.filter(l => l.location_group_id === groupId);
  const filteredSections  = sections.filter(s => s.location_id === locationId);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['garden', 'location', 'section'] as Mode[]).map((m, i) => (
          <Pressable key={m} style={[styles.tab, mode === m && styles.tabActive]} onPress={() => switchMode(m)}>
            <Text style={styles.tabStep}>{i + 1}</Text>
            <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
              {m === 'garden' ? 'Garden' : m === 'location' ? 'Location' : 'Section'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Tip */}
        <View style={styles.tipBox}>
          <Text style={styles.tipText}>{TIPS[mode]}</Text>
        </View>

        {/* Success confirmation */}
        {lastAdded && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>✓ &quot;{lastAdded}&quot; added</Text>
          </View>
        )}

        {/* Add input */}
        <Text style={styles.label}>
          {mode === 'garden' ? 'New Garden Name' : mode === 'location' ? 'New Location Name' : 'New Section Name'}
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { flex: 1 }]}
            value={name}
            onChangeText={setName}
            placeholder={
              mode === 'garden'   ? 'e.g. Backyard, Allotment...' :
              mode === 'location' ? 'e.g. Raised Beds, Greenhouse...' :
                                    'e.g. Bed 1, Row A...'
            }
            placeholderTextColor="#555"
            autoFocus
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />
          <Pressable style={styles.addBtn} onPress={handleSubmit} disabled={submitting}>
            {submitting
              ? <ActivityIndicator color="#111" size="small" />
              : <Text style={styles.addBtnText}>Add</Text>
            }
          </Pressable>
        </View>

        {/* ── Garden tab: parent picker for location/section + existing list ── */}
        {mode !== 'garden' && (
          <>
            <Text style={styles.label}>Garden</Text>
            {groups.length === 0
              ? <Text style={styles.emptyHint}>No gardens yet — go to Step 1 first.</Text>
              : <View style={styles.pickerList}>
                  {groups.map(g => (
                    <Pressable key={g.id} style={[styles.pickerOption, groupId === g.id && styles.pickerSelected]} onPress={() => setGroupId(g.id)}>
                      <Text style={[styles.pickerText, groupId === g.id && styles.pickerTextSelected]}>{g.name}</Text>
                    </Pressable>
                  ))}
                </View>
            }
          </>
        )}

        {mode === 'section' && (
          <>
            <Text style={styles.label}>Location</Text>
            {filteredLocations.length === 0
              ? <Text style={styles.emptyHint}>No locations in this garden — go to Step 2 first.</Text>
              : <View style={styles.pickerList}>
                  {filteredLocations.map(l => (
                    <Pressable key={l.id} style={[styles.pickerOption, locationId === l.id && styles.pickerSelected]} onPress={() => setLocationId(l.id)}>
                      <Text style={[styles.pickerText, locationId === l.id && styles.pickerTextSelected]}>{l.name}</Text>
                    </Pressable>
                  ))}
                </View>
            }
          </>
        )}

        {/* ── Existing items list with status / delete ── */}
        {mode === 'garden' && groups.length > 0 && (
          <>
            <Text style={styles.label}>Your Gardens</Text>
            {groups.map(g => {
              const status = gardenStatus(g, locations, sections);
              return (
                <View key={g.id} style={styles.existingRow}>
                  <View style={styles.existingInfo}>
                    <Text style={styles.existingName}>{g.name}</Text>
                    <Text style={[styles.existingStatus, { color: STATUS_COLOR[status] }]}>
                      {STATUS_LABEL[status]}
                    </Text>
                  </View>
                  <Pressable style={styles.deleteBtn} onPress={() => confirmDeleteGroup(g)}>
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </Pressable>
                </View>
              );
            })}
          </>
        )}

        {mode === 'location' && filteredLocations.length > 0 && (
          <>
            <Text style={styles.label}>Locations in this Garden</Text>
            {filteredLocations.map(l => (
              <View key={l.id} style={styles.existingRow}>
                <Text style={[styles.existingName, { flex: 1 }]}>{l.name}</Text>
                <Pressable style={styles.deleteBtn} onPress={() => confirmDeleteLocation(l)}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {mode === 'section' && filteredSections.length > 0 && (
          <>
            <Text style={styles.label}>Sections in this Location</Text>
            {filteredSections.map(s => (
              <View key={s.id} style={styles.existingRow}>
                <Text style={[styles.existingName, { flex: 1 }]}>{s.name}</Text>
                <Pressable style={styles.deleteBtn} onPress={() => confirmDeleteSection(s)}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {groups.some(g => gardenStatus(g, locations, sections) === 'ready') && (
          <Pressable
            style={styles.addCropBtn}
            onPress={() => { router.back(); router.push('/(modals)/add-crop'); }}
          >
            <Text style={styles.addCropBtnText}>+ Add a Crop</Text>
          </Pressable>
        )}

        <Pressable style={styles.doneBtn} onPress={() => router.back()}>
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>

        <Pressable
          style={styles.resetBtn}
          onPress={() =>
            Alert.alert('Reset All Data', 'Delete everything and start fresh? This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: async () => {
                await resetAllData();
                await reload();
              }},
            ])
          }
        >
          <Text style={styles.resetBtnText}>⚠ Reset Database</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#2ecc71' },
  tabStep: { color: '#444', fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
  tabText: { color: '#555', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#2ecc71' },
  content: { padding: 16, paddingBottom: 40 },
  tipBox: { backgroundColor: '#1e2a1e', borderRadius: 8, padding: 10, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: '#2ecc71' },
  tipText: { color: '#7dcea0', fontSize: 12, lineHeight: 18 },
  successBox: { backgroundColor: '#1a3a2a', borderRadius: 6, padding: 8, marginTop: 8 },
  successText: { color: '#2ecc71', fontSize: 12, fontWeight: '600' },
  label: { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: '#2a2a2a', color: '#eee', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1, borderColor: '#3a3a3a' },
  addBtn: { backgroundColor: '#2ecc71', borderRadius: 6, paddingHorizontal: 18, justifyContent: 'center' },
  addBtnText: { color: '#111', fontWeight: 'bold', fontSize: 14 },
  emptyHint: { color: '#664', fontSize: 12, fontStyle: 'italic', paddingVertical: 6 },
  pickerList: { gap: 6 },
  pickerOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#3a3a3a', backgroundColor: '#2a2a2a' },
  pickerSelected: { borderColor: '#5a9', backgroundColor: '#1e3a2a' },
  pickerText: { color: '#aaa', fontSize: 13 },
  pickerTextSelected: { color: '#7dcea0' },
  existingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#222', borderRadius: 6, marginBottom: 6 },
  existingInfo: { flex: 1 },
  existingName: { color: '#ccc', fontSize: 13 },
  existingStatus: { fontSize: 11, marginTop: 2 },
  deleteBtn: { padding: 6 },
  deleteBtnText: { color: '#664444', fontSize: 14 },
  addCropBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 8, backgroundColor: '#2ecc71', alignItems: 'center' },
  addCropBtnText: { color: '#111', fontWeight: '700', fontSize: 15 },
  doneBtn: { marginTop: 10, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: '#4a4a4a', backgroundColor: '#262626', alignItems: 'center' },
  doneBtnText: { color: '#ddd', fontWeight: '600', fontSize: 15 },
  resetBtn: { marginTop: 32, paddingVertical: 10, alignItems: 'center' },
  resetBtnText: { color: '#5a2020', fontSize: 12, fontWeight: '600' },
});
