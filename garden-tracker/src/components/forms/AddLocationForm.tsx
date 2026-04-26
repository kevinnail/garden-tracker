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
import { Location, Garden, Section } from '@/src/types';
import { getAllLocations, getAllGardens, getAllSections } from '@/src/db/queries/locationQueries';
import { getAllCrops } from '@/src/db/queries/cropQueries';

function locationStatus(location: Location, gardens: Garden[], sections: Section[]): 'ready' | 'needs-garden' | 'needs-section' {
  const locationGardens = gardens.filter(g => g.location_id === location.id);
  if (locationGardens.length === 0) return 'needs-garden';
  const hasSection = locationGardens.some(g => sections.some(s => s.garden_id === g.id));
  return hasSection ? 'ready' : 'needs-section';
}

const STATUS_LABEL: Record<string, string> = {
  ready: 'Ready',
  'needs-garden': 'Add Garden',
  'needs-section': 'Add Section',
};

const STATUS_COLOR: Record<string, string> = {
  ready: '#2ecc71',
  'needs-garden': '#e67e22',
  'needs-section': '#e67e22',
};

const GUIDE_STEPS = [
  '1. Add a Location (e.g. Home, Farm)',
  '2. Add a Garden or Zone under it (e.g. Backyard, Lab)',
  '3. Add a Section (e.g. Bed 1, Shelf 1)',
  'Once you have a section, tap "Continue to Add Crop".',
];

export default function AddLocationForm() {
  const navigation = useNavigation();

  const addLocation = usePlannerStore(s => s.addLocation);
  const addGarden = usePlannerStore(s => s.addGarden);
  const addSection = usePlannerStore(s => s.addSection);
  const removeLocation = usePlannerStore(s => s.removeLocation);
  const removeGarden = usePlannerStore(s => s.removeGarden);
  const removeSection = usePlannerStore(s => s.removeSection);
  const renameLocation = usePlannerStore(s => s.renameLocation);
  const renameGarden = usePlannerStore(s => s.renameGarden);
  const renameSection = usePlannerStore(s => s.renameSection);
  const resetAllData = usePlannerStore(s => s.resetAllData);

  const [locationName, setLocationName] = useState('');
  const [gardenName, setGardenName] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [gardenId, setGardenId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastAdded, setLastAdded] = useState<{ text: string; level: 'location' | 'garden' | 'section' } | null>(null);
  const [gardenRecordType, setGardenRecordType] = useState<'plant' | 'mushroom'>('plant');
  const [showGuide, setShowGuide] = useState(false);
  const [editingItem, setEditingItem] = useState<{ type: 'location' | 'garden' | 'section'; id: number; value: string } | null>(null);
  const [initialCropCount, setInitialCropCount] = useState<number | null>(null);
  const [allowDismiss, setAllowDismiss] = useState(false);
  const [createdEntityCount, setCreatedEntityCount] = useState(0);
  const [prefilledTopLevel, setPrefilledTopLevel] = useState(false);

  const createdLocationIds = useRef<Set<number>>(new Set());
  const createdGardenIds = useRef<Set<number>>(new Set());
  const createdSectionIds = useRef<Set<number>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  const reload = useCallback(async () => {
    const [ls, gs, ss] = await Promise.all([getAllLocations(), getAllGardens(), getAllSections()]);
    setLocations(ls);
    setGardens(gs);
    setSections(ss);
    setLocationId(prev => {
      if (prev != null && ls.some(x => x.id === prev)) return prev;
      return ls[0]?.id ?? null;
    });
    return { ls, gs, ss };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadInitial = async () => {
      const [, crops] = await Promise.all([reload(), getAllCrops(true)]);
      if (!cancelled) setInitialCropCount(crops.length);
    };
    void loadInitial().catch(() => {
      if (!cancelled) setInitialCropCount(0);
    });
    return () => { cancelled = true; };
  }, [reload]);

  useEffect(() => {
    if (prefilledTopLevel) return;
    if (initialCropCount !== 0) return;
    if (locations.length > 0) return;
    if (locationName.trim().length > 0) return;
    setLocationName('Home');
    setPrefilledTopLevel(true);
  }, [initialCropCount, locations.length, locationName, prefilledTopLevel]);

  useEffect(() => {
    const filtered = gardens.filter(g => g.location_id === locationId);
    if (filtered.length > 0) {
      if (!filtered.find(g => g.id === gardenId)) setGardenId(filtered[0].id);
    } else {
      setGardenId(null);
    }
  }, [gardenId, gardens, locationId]);

  const syncCreatedEntityCount = useCallback(() => {
    setCreatedEntityCount(
      createdLocationIds.current.size + createdGardenIds.current.size + createdSectionIds.current.size
    );
  }, []);

  const allowAndRun = useCallback((fn: () => void) => {
    setAllowDismiss(true);
    setTimeout(fn, 0);
  }, []);

  const discardSessionHierarchy = useCallback(async () => {
    const sectionIds = [...createdSectionIds.current];
    const gardenIds = [...createdGardenIds.current];
    const locationIds = [...createdLocationIds.current];
    for (const id of sectionIds) await removeSection(id);
    for (const id of gardenIds) await removeGarden(id);
    for (const id of locationIds) await removeLocation(id);
    createdSectionIds.current.clear();
    createdGardenIds.current.clear();
    createdLocationIds.current.clear();
    syncCreatedEntityCount();
    await reload();
  }, [reload, removeGarden, removeLocation, removeSection, syncCreatedEntityCount]);

  const openAddCrop = useCallback(() => {
    allowAndRun(() => { router.replace('/(modals)/add-crop'); });
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
        { text: 'Add crop now', onPress: openAddCrop },
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
    handleExitAttempt(() => { navigation.dispatch(data.action); });
  });

  const handleAddLocation = async () => {
    const trimmed = locationName.trim();
    if (!trimmed) return Alert.alert('Validation', 'Name is required.');
    setSubmitting(true);
    try {
      const createdId = await addLocation(trimmed);
      createdLocationIds.current.add(createdId);
      syncCreatedEntityCount();
      setLocationId(createdId);
      await reload();
      setLastAdded({ text: trimmed, level: 'location' });
      setLocationName('');
    } catch {
      Alert.alert('Error', 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddGarden = async () => {
    if (locationId == null) return Alert.alert('Validation', 'Select a Location first.');
    const trimmed = gardenName.trim();
    if (!trimmed) return Alert.alert('Validation', 'Name is required.');
    setSubmitting(true);
    try {
      const createdId = await addGarden(locationId, trimmed, gardenRecordType);
      createdGardenIds.current.add(createdId);
      syncCreatedEntityCount();
      setGardenId(createdId);
      setGardenRecordType('plant');
      await reload();
      setLastAdded({ text: trimmed, level: 'garden' });
      setGardenName('');
    } catch {
      Alert.alert('Error', 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSection = async () => {
    if (gardenId == null) return Alert.alert('Validation', 'Select a Garden first.');
    const trimmed = sectionName.trim();
    if (!trimmed) return Alert.alert('Validation', 'Name is required.');
    setSubmitting(true);
    try {
      const createdId = await addSection(gardenId, trimmed);
      createdSectionIds.current.add(createdId);
      syncCreatedEntityCount();
      await reload();
      setLastAdded({ text: trimmed, level: 'section' });
      setSectionName('');
    } catch {
      Alert.alert('Error', 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteLocation = (location: Location) => {
    const locationGardenIds = gardens.filter(g => g.location_id === location.id).map(g => g.id);
    const locationSectionIds = sections.filter(s => locationGardenIds.includes(s.garden_id)).map(s => s.id);
    const gardenCount = gardens.filter(g => g.location_id === location.id).length;
    const detail = gardenCount > 0 ? ` It contains ${gardenCount} garden(s) and all their crops.` : '';
    Alert.alert(
      'Delete Location',
      `Delete "${location.name}"?${detail} This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeLocation(location.id);
              createdLocationIds.current.delete(location.id);
              for (const id of locationGardenIds) createdGardenIds.current.delete(id);
              for (const id of locationSectionIds) createdSectionIds.current.delete(id);
              syncCreatedEntityCount();
              if (locationId === location.id) setLocationId(null);
              await reload();
            } catch {}
          },
        },
      ]
    );
  };

  const confirmDeleteGarden = (garden: Garden) => {
    const gardenSectionIds = sections.filter(s => s.garden_id === garden.id).map(s => s.id);
    const sectionCount = sections.filter(s => s.garden_id === garden.id).length;
    const detail = sectionCount > 0 ? ` It contains ${sectionCount} section(s) and all their crops.` : '';
    Alert.alert(
      'Delete Garden',
      `Delete "${garden.name}"?${detail} This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeGarden(garden.id);
              createdGardenIds.current.delete(garden.id);
              for (const id of gardenSectionIds) createdSectionIds.current.delete(id);
              syncCreatedEntityCount();
              if (gardenId === garden.id) setGardenId(null);
              await reload();
            } catch {}
          },
        },
      ]
    );
  };

  const confirmDeleteSection = (section: Section) => {
    Alert.alert(
      'Delete Section',
      `Delete "${section.name}"? All crops in this section will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeSection(section.id);
              createdSectionIds.current.delete(section.id);
              syncCreatedEntityCount();
              await reload();
            } catch {}
          },
        },
      ]
    );
  };

  const handleSaveRename = async () => {
    if (!editingItem) return;
    const trimmed = editingItem.value.trim();
    if (!trimmed) return Alert.alert('Validation', 'Name cannot be empty.');
    try {
      if (editingItem.type === 'location') await renameLocation(editingItem.id, trimmed);
      else if (editingItem.type === 'garden') await renameGarden(editingItem.id, trimmed);
      else await renameSection(editingItem.id, trimmed);
      setEditingItem(null);
      await reload();
    } catch {}
  };

  const filteredGardens = gardens.filter(g => g.location_id === locationId);
  const filteredSections = sections.filter(s => s.garden_id === gardenId);
  const selectedLocation = locations.find(l => l.id === locationId) ?? null;
  const selectedGarden = gardens.find(g => g.id === gardenId) ?? null;
  const hasReadyLocation = locations.some(l => locationStatus(l, gardens, sections) === 'ready');

  const handleDone = () => {
    handleExitAttempt(() => { router.back(); });
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
          {/* Guide */}
          <Pressable style={styles.guideToggle} onPress={() => setShowGuide(v => !v)}>
            <Text style={styles.guideToggleText}>{showGuide ? 'Hide guide' : 'How does this work?'}</Text>
          </Pressable>
          {showGuide && (
            <View style={styles.guideBox}>
              {GUIDE_STEPS.map((step, i) => (
                <Text key={i} style={styles.guideText}>{step}</Text>
              ))}
            </View>
          )}

          {/* ── LEVEL 1: LOCATION ── */}
          <View style={styles.levelBox}>
            <Text style={styles.levelTitle}>1. Location</Text>

            {locations.map(location => {
              const status = locationStatus(location, gardens, sections);
              const isEditing = editingItem?.type === 'location' && editingItem.id === location.id;
              const isSelected = locationId === location.id;
              return (
                <View key={location.id} style={[styles.itemRow, isSelected && styles.itemRowSelected]}>
                  {isEditing ? (
                    <>
                      <TextInput
                        style={[styles.input, styles.inlineEditInput]}
                        value={editingItem.value}
                        onChangeText={v => setEditingItem(e => e ? { ...e, value: v } : e)}
                        onSubmitEditing={handleSaveRename}
                        returnKeyType="done"
                        autoFocus
                      />
                      <Pressable style={styles.saveBtn} onPress={handleSaveRename}>
                        <Text style={styles.saveBtnText}>✓</Text>
                      </Pressable>
                      <Pressable style={styles.iconBtn} onPress={() => setEditingItem(null)}>
                        <Text style={styles.deleteBtnText}>✕</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable style={styles.itemSelectArea} onPress={() => { setLocationId(location.id); setEditingItem(null); }}>
                        <Text style={[styles.itemName, isSelected && styles.itemNameSelected]}>{location.name}</Text>
                        <Text style={[styles.itemBadge, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status]}</Text>
                      </Pressable>
                      <Pressable style={styles.iconBtn} onPress={() => setEditingItem({ type: 'location', id: location.id, value: location.name })}>
                        <Text style={styles.editBtnText}>✎</Text>
                      </Pressable>
                      <Pressable style={styles.iconBtn} onPress={() => confirmDeleteLocation(location)}>
                        <Text style={styles.deleteBtnText}>×</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })}

            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={locationName}
                onChangeText={setLocationName}
                placeholder="e.g. Home, Farm"
                placeholderTextColor="#555"
                maxLength={100}
                onSubmitEditing={handleAddLocation}
                returnKeyType="done"
                onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
              />
              <Pressable style={styles.addBtn} onPress={handleAddLocation} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#111" size="small" /> : <Text style={styles.addBtnText}>Add</Text>}
              </Pressable>
            </View>
            {lastAdded?.level === 'location' && (
              <View style={styles.successBox}>
                <Text style={styles.successText}>Saved: &quot;{lastAdded.text}&quot;</Text>
              </View>
            )}
          </View>

          {/* ── LEVEL 2: GARDEN / ZONE ── */}
          {locationId != null && (
            <View style={styles.levelBox}>
              <Text style={styles.levelTitle}>
                {'2. Garden / Zone  '}
                <Text style={styles.levelParent}>in: {selectedLocation?.name}</Text>
              </Text>

              <View style={styles.recordTypeToggle}>
                <Pressable
                  style={[styles.recordTypeBtn, gardenRecordType === 'plant' && styles.recordTypeBtnActive]}
                  onPress={() => setGardenRecordType('plant')}
                >
                  <Text style={[styles.recordTypeBtnText, gardenRecordType === 'plant' && styles.recordTypeBtnTextActive]}>Plants</Text>
                </Pressable>
                <Pressable
                  style={[styles.recordTypeBtn, gardenRecordType === 'mushroom' && styles.recordTypeBtnMushroomActive]}
                  onPress={() => setGardenRecordType('mushroom')}
                >
                  <Text style={[styles.recordTypeBtnText, gardenRecordType === 'mushroom' && styles.recordTypeBtnTextActive]}>Mushrooms</Text>
                </Pressable>
              </View>

              {filteredGardens.map(garden => {
                const isEditing = editingItem?.type === 'garden' && editingItem.id === garden.id;
                const isSelected = gardenId === garden.id;
                return (
                  <View key={garden.id} style={[styles.itemRow, isSelected && styles.itemRowSelected]}>
                    {isEditing ? (
                      <>
                        <TextInput
                          style={[styles.input, styles.inlineEditInput]}
                          value={editingItem.value}
                          onChangeText={v => setEditingItem(e => e ? { ...e, value: v } : e)}
                          onSubmitEditing={handleSaveRename}
                          returnKeyType="done"
                          autoFocus
                        />
                        <Pressable style={styles.saveBtn} onPress={handleSaveRename}>
                          <Text style={styles.saveBtnText}>✓</Text>
                        </Pressable>
                        <Pressable style={styles.iconBtn} onPress={() => setEditingItem(null)}>
                          <Text style={styles.deleteBtnText}>✕</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable style={styles.itemSelectArea} onPress={() => { setGardenId(garden.id); setEditingItem(null); }}>
                          <View style={styles.gardenNameRow}>
                            <Text style={[styles.itemName, isSelected && styles.itemNameSelected]}>{garden.name}</Text>
                            {garden.record_type === 'mushroom' && (
                              <View style={styles.zoneBadge}>
                                <Text style={styles.zoneBadgeText}>Zone</Text>
                              </View>
                            )}
                          </View>
                        </Pressable>
                        <Pressable style={styles.iconBtn} onPress={() => setEditingItem({ type: 'garden', id: garden.id, value: garden.name })}>
                          <Text style={styles.editBtnText}>✎</Text>
                        </Pressable>
                        <Pressable style={styles.iconBtn} onPress={() => confirmDeleteGarden(garden)}>
                          <Text style={styles.deleteBtnText}>×</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                );
              })}

              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={gardenName}
                  onChangeText={setGardenName}
                  placeholder={gardenRecordType === 'mushroom' ? 'e.g. Lab, Fruiting Chamber' : 'e.g. Backyard Beds'}
                  placeholderTextColor="#555"
                  maxLength={100}
                  onSubmitEditing={handleAddGarden}
                  returnKeyType="done"
                  onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                />
                <Pressable style={styles.addBtn} onPress={handleAddGarden} disabled={submitting}>
                  {submitting ? <ActivityIndicator color="#111" size="small" /> : <Text style={styles.addBtnText}>Add</Text>}
                </Pressable>
              </View>
              {lastAdded?.level === 'garden' && (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>Saved: &quot;{lastAdded.text}&quot;</Text>
                </View>
              )}
            </View>
          )}

          {/* ── LEVEL 3: SECTION ── */}
          {gardenId != null && (
            <View style={styles.levelBox}>
              <Text style={styles.levelTitle}>
                {'3. Section  '}
                <Text style={styles.levelParent}>{selectedLocation?.name} {'>'} {selectedGarden?.name}</Text>
              </Text>

              {filteredSections.map(section => {
                const isEditing = editingItem?.type === 'section' && editingItem.id === section.id;
                return (
                  <View key={section.id} style={styles.itemRow}>
                    {isEditing ? (
                      <>
                        <TextInput
                          style={[styles.input, styles.inlineEditInput]}
                          value={editingItem.value}
                          onChangeText={v => setEditingItem(e => e ? { ...e, value: v } : e)}
                          onSubmitEditing={handleSaveRename}
                          returnKeyType="done"
                          autoFocus
                        />
                        <Pressable style={styles.saveBtn} onPress={handleSaveRename}>
                          <Text style={styles.saveBtnText}>✓</Text>
                        </Pressable>
                        <Pressable style={styles.iconBtn} onPress={() => setEditingItem(null)}>
                          <Text style={styles.deleteBtnText}>✕</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.itemName, { flex: 1 }]}>{section.name}</Text>
                        <Pressable style={styles.iconBtn} onPress={() => setEditingItem({ type: 'section', id: section.id, value: section.name })}>
                          <Text style={styles.editBtnText}>✎</Text>
                        </Pressable>
                        <Pressable style={styles.iconBtn} onPress={() => confirmDeleteSection(section)}>
                          <Text style={styles.deleteBtnText}>×</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                );
              })}

              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={sectionName}
                  onChangeText={setSectionName}
                  placeholder="e.g. Bed 1, Shelf 1"
                  placeholderTextColor="#555"
                  maxLength={100}
                  onSubmitEditing={handleAddSection}
                  returnKeyType="done"
                  onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                />
                <Pressable style={styles.addBtn} onPress={handleAddSection} disabled={submitting}>
                  {submitting ? <ActivityIndicator color="#111" size="small" /> : <Text style={styles.addBtnText}>Add</Text>}
                </Pressable>
              </View>
              {lastAdded?.level === 'section' && (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>Saved: &quot;{lastAdded.text}&quot;</Text>
                </View>
              )}
            </View>
          )}

          {hasReadyLocation && (
            <Pressable style={styles.addCropBtn} onPress={openAddCrop}>
              <Text style={styles.addCropBtnText}>Continue to Add Crop</Text>
            </Pressable>
          )}

          <View style={styles.actionRow}>
            <Pressable style={styles.doneBtn} onPress={handleDone}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.resetBtn}
            onPress={() =>
              Alert.alert('Reset All Data', 'Delete everything and start fresh? This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reset',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await resetAllData();
                      await reload();
                    } catch {}
                  },
                },
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

  guideToggle: { alignSelf: 'flex-end', marginBottom: 8 },
  guideToggleText: { color: '#7dcea0', fontSize: 12, fontWeight: '600' },
  guideBox: {
    borderWidth: 1,
    borderColor: '#2a4a35',
    borderRadius: 8,
    backgroundColor: '#1a2e22',
    padding: 10,
    marginBottom: 12,
    gap: 4,
  },
  guideText: { color: '#7dcea0', fontSize: 12, lineHeight: 18 },

  levelBox: {
    borderWidth: 1,
    borderColor: '#343434',
    borderRadius: 10,
    backgroundColor: '#202020',
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  levelTitle: { color: '#ddd', fontSize: 14, fontWeight: '700' },
  levelParent: { color: '#666', fontSize: 12, fontWeight: '400' },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#1c2920',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2e4a38',
  },
  itemRowSelected: { borderColor: '#5a9', backgroundColor: '#1e3a2a' },
  itemSelectArea: { flex: 1 },
  gardenNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { color: '#ccc', fontSize: 13 },
  itemNameSelected: { color: '#7dcea0' },
  itemBadge: { fontSize: 11, marginTop: 1 },

  zoneBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#3A2010' },
  zoneBadgeText: { color: '#d4a882', fontSize: 10, fontWeight: '700' },

  inputRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#eee',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  inlineEditInput: { flex: 1, paddingVertical: 4, marginRight: 4 },
  addBtn: { backgroundColor: '#2ecc71', borderRadius: 6, paddingHorizontal: 18, justifyContent: 'center' },
  addBtnText: { color: '#111', fontWeight: 'bold', fontSize: 14 },

  successBox: { backgroundColor: '#1a3a2a', borderRadius: 6, padding: 8 },
  successText: { color: '#2ecc71', fontSize: 12, fontWeight: '600' },

  iconBtn: { padding: 6 },
  editBtnText: { marginRight: 10, color: '#7dcea0', fontSize: 15 },
  saveBtn: { padding: 6 },
  saveBtnText: { marginRight: 10, color: '#2ecc71', fontSize: 16, fontWeight: '700' },
  deleteBtnText: { color: '#664444', fontSize: 14 },

  recordTypeToggle: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  recordTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: '#262626',
  },
  recordTypeBtnActive: { borderColor: '#5a9', backgroundColor: '#1e3a2a' },
  recordTypeBtnMushroomActive: { borderColor: '#8B4513', backgroundColor: '#2a1508' },
  recordTypeBtnText: { color: '#9a9a9a', fontSize: 12, fontWeight: '600' },
  recordTypeBtnTextActive: { color: '#eee' },

  addCropBtn: { marginBottom: 4, paddingVertical: 14, borderRadius: 8, backgroundColor: '#2ecc71', alignItems: 'center' },
  addCropBtnText: { color: '#111', fontWeight: '700', fontSize: 15 },

  actionRow: { marginTop: 6 },
  doneBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4a4a4a',
    backgroundColor: '#262626',
    alignItems: 'center',
  },
  doneBtnText: { color: '#ddd', fontWeight: '600', fontSize: 15 },

  resetBtn: { marginTop: 32, paddingVertical: 10, alignItems: 'center' },
  resetBtnText: { color: '#5a2020', fontSize: 12, fontWeight: '600' },
});
