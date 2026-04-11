import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Pressable, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePlannerStore } from '@/src/store/plannerStore';
import { LocationGroup, Location, Section } from '@/src/types';
import { getAllLocationGroups, getAllLocations, getAllSections } from '@/src/db/queries/locationQueries';
import { getAllCrops } from '@/src/db/queries/cropQueries';

type Mode = 'garden' | 'location' | 'section';

const HELP_TEXT: Record<Mode, string[]> = {
  garden: [
    'Location is the top level, such as Home or Farm.',
    'Each Location can contain multiple Gardens.',
  ],
  location: [
    'Garden sits inside a Location, such as Backyard Beds.',
    'Each Garden can contain multiple Sections.',
  ],
  section: [
    'Section sits inside a Garden, such as Bed 1.',
    'At least one Section is required before adding crops.',
  ],
};

function gardenStatus(g: LocationGroup, locations: Location[], sections: Section[]): 'ready' | 'needs-location' | 'needs-section' {
  const locs = locations.filter(l => l.location_group_id === g.id);
  if (locs.length === 0) return 'needs-location';
  const hasSec = locs.some(l => sections.some(s => s.location_id === l.id));
  return hasSec ? 'ready' : 'needs-section';
}

const STATUS_LABEL: Record<string, string> = {
  ready: 'Ready',
  'needs-location': 'Add Garden',
  'needs-section': 'Add Section',
};
const STATUS_COLOR: Record<string, string> = {
  ready: '#2ecc71',
  'needs-location': '#e67e22',
  'needs-section': '#e67e22',
};

export default function AddGardenForm() {
  const navigation = useNavigation();

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
  const [showHelp, setShowHelp]     = useState(false);
  const [initialCropCount, setInitialCropCount] = useState<number | null>(null);
  const [allowDismiss, setAllowDismiss] = useState(false);
  const [createdEntityCount, setCreatedEntityCount] = useState(0);
  const [prefilledTopLevel, setPrefilledTopLevel] = useState(false);

  const createdGroupIds = useRef<Set<number>>(new Set());
  const createdLocationIds = useRef<Set<number>>(new Set());
  const createdSectionIds = useRef<Set<number>>(new Set());
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const [editorTop, setEditorTop] = useState(0);

  const reload = useCallback(async () => {
    const [g, l, s] = await Promise.all([getAllLocationGroups(), getAllLocations(), getAllSections()]);
    setGroups(g);
    setLocations(l);
    setSections(s);

    setGroupId(prev => {
      if (prev != null && g.some(x => x.id === prev)) return prev;
      return g[0]?.id ?? null;
    });

    return { g, l, s };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      const [, crops] = await Promise.all([reload(), getAllCrops(true)]);
      if (!cancelled) {
        setInitialCropCount(crops.length);
      }
    };

    void loadInitial().catch(() => {
      if (!cancelled) setInitialCropCount(0);
    });

    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (prefilledTopLevel) return;
    if (initialCropCount !== 0) return;
    if (mode !== 'garden') return;
    if (groups.length > 0) return;
    if (name.trim().length > 0) return;

    setName('Home');
    setPrefilledTopLevel(true);
  }, [groups.length, initialCropCount, mode, name, prefilledTopLevel]);

  // Keep locationId in sync when groupId changes
  useEffect(() => {
    const filtered = locations.filter(l => l.location_group_id === groupId);
    if (filtered.length > 0) {
      if (!filtered.find(l => l.id === locationId)) setLocationId(filtered[0].id);
    } else {
      setLocationId(null);
    }
  }, [groupId, locationId, locations]);

  const ensureEditorVisible = useCallback(() => {
    // Keep the editor/input region above the keyboard after tab changes or manual focus.
    scrollRef.current?.scrollTo({ y: Math.max(editorTop - 12, 0), animated: true });
  }, [editorTop]);

  const focusAndRevealInput = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
      setTimeout(ensureEditorVisible, 80);
    }, 50);
  }, [ensureEditorVisible]);

  const switchMode = useCallback((m: Mode) => {
    setMode(m);
    setName('');
    setLastAdded(null);
    focusAndRevealInput();
  }, [focusAndRevealInput]);

  const syncCreatedEntityCount = useCallback(() => {
    setCreatedEntityCount(
      createdGroupIds.current.size + createdLocationIds.current.size + createdSectionIds.current.size
    );
  }, []);

  const allowAndRun = useCallback((fn: () => void) => {
    setAllowDismiss(true);
    setTimeout(fn, 0);
  }, []);

  const discardSessionHierarchy = useCallback(async () => {
    const sectionIds = [...createdSectionIds.current];
    const locationIds = [...createdLocationIds.current];
    const groupIds = [...createdGroupIds.current];

    for (const id of sectionIds) {
      await removeSection(id);
    }
    for (const id of locationIds) {
      await removeLocation(id);
    }
    for (const id of groupIds) {
      await removeLocationGroup(id);
    }

    createdSectionIds.current.clear();
    createdLocationIds.current.clear();
    createdGroupIds.current.clear();
    syncCreatedEntityCount();
    await reload();
  }, [reload, removeLocation, removeLocationGroup, removeSection, syncCreatedEntityCount]);

  const openAddCrop = useCallback(() => {
    allowAndRun(() => {
      router.replace('/(modals)/add-crop');
    });
  }, [allowAndRun]);

  const handleExitAttempt = useCallback((onAllowedExit: () => void) => {
    if (initialCropCount !== 0 || createdEntityCount === 0 || allowDismiss) {
      onAllowedExit();
      return;
    }

    Alert.alert(
      'Finish first setup',
      'You created hierarchy items but no crop yet. To avoid partial setup, add a crop now or discard and exit.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Add crop now',
          onPress: openAddCrop,
        },
        {
          text: 'Discard and exit',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await discardSessionHierarchy();
                allowAndRun(onAllowedExit);
              } catch {
                Alert.alert('Error', 'Failed to discard setup. Please try again.');
              }
            })();
          },
        },
      ]
    );
  }, [allowAndRun, allowDismiss, createdEntityCount, discardSessionHierarchy, initialCropCount, openAddCrop]);

  usePreventRemove(initialCropCount === 0 && createdEntityCount > 0 && !allowDismiss, ({ data }) => {
    handleExitAttempt(() => {
      navigation.dispatch(data.action);
    });
  });

  const handleSubmit = async () => {
    if (!name.trim()) return Alert.alert('Validation', 'Name is required.');
    if (mode === 'location' && groupId == null)
      return Alert.alert('Validation', 'Select a Location first.');
    if (mode === 'section' && locationId == null)
      return Alert.alert('Validation', 'Select a Garden first.');

    setSubmitting(true);
    try {
      const trimmed = name.trim();
      if (mode === 'garden') {
        const createdId = await addLocationGroup(trimmed);
        createdGroupIds.current.add(createdId);
        syncCreatedEntityCount();
        setGroupId(createdId);
        await reload();
        setMode('location');
      } else if (mode === 'location') {
        const createdId = await addLocation(groupId!, trimmed);
        createdLocationIds.current.add(createdId);
        syncCreatedEntityCount();
        setLocationId(createdId);
        await reload();
        setMode('section');
      } else {
        const createdId = await addSection(locationId!, trimmed);
        createdSectionIds.current.add(createdId);
        syncCreatedEntityCount();
        await reload();
      }
      setLastAdded(name.trim());
      setName('');
      focusAndRevealInput();
    } catch {
      Alert.alert('Error', 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteGroup = (g: LocationGroup) => {
    const groupLocationIds = locations.filter(l => l.location_group_id === g.id).map(l => l.id);
    const groupSectionIds = sections.filter(s => groupLocationIds.includes(s.location_id)).map(s => s.id);
    const locCount = locations.filter(l => l.location_group_id === g.id).length;
    const detail = locCount > 0 ? ` It contains ${locCount} garden(s) and all their crops.` : '';
    Alert.alert(
      'Delete Location',
      `Delete "${g.name}"?${detail} This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await removeLocationGroup(g.id);

            createdGroupIds.current.delete(g.id);
            for (const id of groupLocationIds) createdLocationIds.current.delete(id);
            for (const id of groupSectionIds) createdSectionIds.current.delete(id);
            syncCreatedEntityCount();

            if (groupId === g.id) setGroupId(null);
            await reload();
          } catch { /* toast shown by store */ }
        }},
      ]
    );
  };

  const confirmDeleteLocation = (l: Location) => {
    const locationSectionIds = sections.filter(s => s.location_id === l.id).map(s => s.id);
    const secCount = sections.filter(s => s.location_id === l.id).length;
    const detail = secCount > 0 ? ` It contains ${secCount} section(s) and all their crops.` : '';
    Alert.alert(
      'Delete Garden',
      `Delete "${l.name}"?${detail} This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await removeLocation(l.id);

            createdLocationIds.current.delete(l.id);
            for (const id of locationSectionIds) createdSectionIds.current.delete(id);
            syncCreatedEntityCount();

            if (locationId === l.id) setLocationId(null);
            await reload();
          } catch { /* toast shown by store */ }
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
          try {
            await removeSection(s.id);
            createdSectionIds.current.delete(s.id);
            syncCreatedEntityCount();
            await reload();
          } catch { /* toast shown by store */ }
        }},
      ]
    );
  };

  const filteredLocations = locations.filter(l => l.location_group_id === groupId);
  const filteredSections  = sections.filter(s => s.location_id === locationId);
  const selectedGroup = groups.find(g => g.id === groupId) ?? null;
  const selectedLocation = locations.find(l => l.id === locationId) ?? null;
  const hasReadyGarden = groups.some(g => gardenStatus(g, locations, sections) === 'ready');

  const modeContext =
    mode === 'garden'
      ? 'Add a top-level Location.'
      : mode === 'location'
        ? selectedGroup
          ? `Parent Location: ${selectedGroup.name}`
          : 'Select a Location above first.'
        : selectedGroup && selectedLocation
          ? `Parent: ${selectedGroup.name} > ${selectedLocation.name}`
          : 'Select Location and Garden above first.';

  const handleDone = () => {
    handleExitAttempt(() => {
      router.back();
    });
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >

        <View style={styles.hierarchyBox}>
          <Text style={styles.boxTitle}>Hierarchy</Text>

          <Text style={styles.levelTitle}>1. Location</Text>
          {groups.length === 0 ? (
            <Text style={styles.emptyHint}>No locations yet.</Text>
          ) : (
            <View style={styles.pickerList}>
              {groups.map(g => (
                <Pressable
                  key={g.id}
                  style={[styles.pickerOption, groupId === g.id && styles.pickerSelected]}
                  onPress={() => setGroupId(g.id)}
                >
                  <Text style={[styles.pickerText, groupId === g.id && styles.pickerTextSelected]}>{g.name}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.levelTitle}>2. Garden</Text>
          {filteredLocations.length === 0 ? (
            <Text style={styles.emptyHint}>
              {groupId == null ? 'Select a location first.' : 'No gardens in this location yet.'}
            </Text>
          ) : (
            <View style={styles.pickerList}>
              {filteredLocations.map(l => (
                <Pressable
                  key={l.id}
                  style={[styles.pickerOption, locationId === l.id && styles.pickerSelected]}
                  onPress={() => setLocationId(l.id)}
                >
                  <Text style={[styles.pickerText, locationId === l.id && styles.pickerTextSelected]}>{l.name}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.levelTitle}>3. Section</Text>
          {filteredSections.length === 0 ? (
            <Text style={styles.emptyHint}>
              {locationId == null ? 'Select a garden first.' : 'No sections in this garden yet.'}
            </Text>
          ) : (
            <View style={styles.sectionBadgeList}>
              {filteredSections.map(s => (
                <View key={s.id} style={styles.sectionBadge}>
                  <Text style={styles.sectionBadgeText}>{s.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.editorBox} onLayout={(e) => setEditorTop(e.nativeEvent.layout.y)}>
          <Text style={styles.boxTitle}>Add Item</Text>

          <View style={styles.tabs}>
            {(['garden', 'location', 'section'] as Mode[]).map((m) => (
              <Pressable key={m} style={[styles.tab, mode === m && styles.tabActive]} onPress={() => switchMode(m)}>
                <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                  {m === 'garden' ? 'Location' : m === 'location' ? 'Garden' : 'Section'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.modeContext}>{modeContext}</Text>

          <Text style={styles.label}>
            {mode === 'garden' ? 'New Location Name' : mode === 'location' ? 'New Garden Name' : 'New Section Name'}
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { flex: 1 }]}
              value={name}
              onChangeText={setName}
              placeholder={
                mode === 'garden' ? 'e.g. Home, Farm' :
                mode === 'location' ? 'e.g. Backyard Beds' :
                'e.g. Bed 1'
              }
              placeholderTextColor="#555"
              maxLength={100}
              autoFocus
              onFocus={ensureEditorVisible}
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
        </View>

        {lastAdded && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>Saved: &quot;{lastAdded}&quot;</Text>
          </View>
        )}

        <Pressable style={styles.helpToggle} onPress={() => setShowHelp(v => !v)}>
          <Text style={styles.helpToggleText}>{showHelp ? 'Hide quick guide' : 'Need a quick guide?'}</Text>
        </Pressable>

        {showHelp && (
          <View style={styles.helpBox}>
            {HELP_TEXT[mode].map(line => (
              <Text key={line} style={styles.helpText}>- {line}</Text>
            ))}
          </View>
        )}

        {mode === 'garden' && groups.length > 0 && (
          <>
            <Text style={styles.label}>Current Locations</Text>
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
                    <Text style={styles.deleteBtnText}>x</Text>
                  </Pressable>
                </View>
              );
            })}
          </>
        )}

        {mode === 'location' && filteredLocations.length > 0 && (
          <>
            <Text style={styles.label}>Gardens in this Location</Text>
            {filteredLocations.map(l => (
              <View key={l.id} style={styles.existingRow}>
                <Text style={[styles.existingName, { flex: 1 }]}>{l.name}</Text>
                <Pressable style={styles.deleteBtn} onPress={() => confirmDeleteLocation(l)}>
                  <Text style={styles.deleteBtnText}>x</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {mode === 'section' && filteredSections.length > 0 && (
          <>
            <Text style={styles.label}>Sections in this Garden</Text>
            {filteredSections.map(s => (
              <View key={s.id} style={styles.existingRow}>
                <Text style={[styles.existingName, { flex: 1 }]}>{s.name}</Text>
                <Pressable style={styles.deleteBtn} onPress={() => confirmDeleteSection(s)}>
                  <Text style={styles.deleteBtnText}>x</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {hasReadyGarden && (
          <Pressable
            style={styles.addCropBtn}
            onPress={openAddCrop}
          >
            <Text style={styles.addCropBtnText}>Continue to Add Crop</Text>
          </Pressable>
        )}

        <Pressable style={styles.doneBtn} onPress={handleDone}>
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>

        <Pressable
          style={styles.resetBtn}
          onPress={() =>
            Alert.alert('Reset All Data', 'Delete everything and start fresh? This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: async () => {
                try {
                  await resetAllData();
                  await reload();
                } catch { /* toast shown by store */ }
              }},
            ])
          }
        >
          <Text style={styles.resetBtnText}>Reset Database</Text>
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  keyboardAvoider: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  hierarchyBox: {
    borderWidth: 1,
    borderColor: '#343434',
    borderRadius: 10,
    backgroundColor: '#202020',
    padding: 12,
    gap: 8,
  },
  editorBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#343434',
    borderRadius: 10,
    backgroundColor: '#202020',
    padding: 12,
    gap: 8,
  },
  boxTitle: { color: '#ddd', fontSize: 14, fontWeight: '700' },
  levelTitle: { color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#3a3a3a', backgroundColor: '#262626' },
  tabActive: { borderColor: '#5a9', backgroundColor: '#1e3a2a' },
  tabText: { color: '#9a9a9a', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#7dcea0' },
  modeContext: { color: '#9b9b9b', fontSize: 12 },
  successBox: { backgroundColor: '#1a3a2a', borderRadius: 6, padding: 8, marginTop: 8 },
  successText: { color: '#2ecc71', fontSize: 12, fontWeight: '600' },
  label: { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: '#2a2a2a', color: '#eee', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1, borderColor: '#3a3a3a' },
  addBtn: { backgroundColor: '#2ecc71', borderRadius: 6, paddingHorizontal: 18, justifyContent: 'center' },
  addBtnText: { color: '#111', fontWeight: 'bold', fontSize: 14 },
  emptyHint: { color: '#7d7d7d', fontSize: 12, fontStyle: 'italic', paddingVertical: 6 },
  pickerList: { gap: 6 },
  pickerOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#3a3a3a', backgroundColor: '#2a2a2a' },
  pickerSelected: { borderColor: '#5a9', backgroundColor: '#1e3a2a' },
  pickerText: { color: '#aaa', fontSize: 13 },
  pickerTextSelected: { color: '#7dcea0' },
  sectionBadgeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sectionBadge: { borderRadius: 999, borderWidth: 1, borderColor: '#4b6a55', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#1e3a2a' },
  sectionBadgeText: { color: '#7dcea0', fontSize: 12, fontWeight: '600' },
  helpToggle: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: '#232323',
    paddingVertical: 8,
    alignItems: 'center',
  },
  helpToggleText: { color: '#a5a5a5', fontSize: 12, fontWeight: '600' },
  helpBox: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#343434',
    backgroundColor: '#1f1f1f',
    padding: 10,
    gap: 4,
  },
  helpText: { color: '#949494', fontSize: 12, lineHeight: 18 },
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
