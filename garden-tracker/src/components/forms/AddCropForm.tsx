import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Pressable, Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { formatDateKey, parseDateKey, toSunday } from '@/src/utils/dateUtils';
import { usePlannerStore } from '@/src/store/plannerStore';

interface StageRow {
  stage_definition_id: number;
  duration_weeks: string;
}

interface AddCropFormProps {
  cropId?: number;
  embedded?: boolean;
}

export interface AddCropFormHandle {
  submit: () => Promise<void>;
  archive: () => void;
  remove: () => void;
}

const AddCropForm = forwardRef<AddCropFormHandle, AddCropFormProps>(function AddCropForm({ cropId, embedded = false }: AddCropFormProps, ref) {
  const stageDefs          = usePlannerStore(s => s.stageDefinitions);
  const stageDefsAvailable = usePlannerStore(s => s.stageDefinitions.length > 0);
  const addCrop            = usePlannerStore(s => s.addCrop);
  const editCrop           = usePlannerStore(s => s.editCrop);
  const archiveCrop        = usePlannerStore(s => s.archiveCrop);
  const deleteCrop         = usePlannerStore(s => s.deleteCrop);
  const cropRowAvailable   = usePlannerStore(s => (
    cropId == null ? true : s.rows.some(row => row.type === 'crop_row' && row.crop.id === cropId)
  ));
  const sections  = usePlannerStore(s => s.sections);
  const gardens   = usePlannerStore(s => s.gardens);
  const locations = usePlannerStore(s => s.locations);
  const isEditMode = cropId != null;

  const navigation = useNavigation();

  const [name, setName]             = useState('');
  const [plantCount, setPlantCount] = useState('1');
  const [startDate, setStartDate]   = useState<Date>(() => toSunday(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [sectionId, setSectionId]   = useState<number | null>(null);
  const [stages, setStages]         = useState<StageRow[]>([]);
  const [recordType, setRecordType] = useState<'plant' | 'mushroom'>('plant');
  const [submitting, setSubmitting] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [page, setPage] = useState<1 | 2>(1);
  const scrollRef = useRef<ScrollView>(null);

  // Tint the nav header when in mushroom mode
  useEffect(() => {
    if (!embedded) {
      navigation.setOptions({
        headerStyle: { backgroundColor: recordType === 'mushroom' ? '#3A2010' : '#003e14' },
      });
    }
  }, [embedded, navigation, recordType]);

  const mushroomDefaultStages = useCallback((): StageRow[] => {
    const inoculation  = stageDefs.find(d => d.name === 'Inoculation');
    const colonization = stageDefs.find(d => d.name === 'Colonization');
    const fruiting     = stageDefs.find(d => d.name === 'Fruiting' && d.order_index >= 7);
    if (inoculation && colonization && fruiting) {
      return [
        { stage_definition_id: inoculation.id,  duration_weeks: '4' },
        { stage_definition_id: colonization.id, duration_weeks: '4' },
        { stage_definition_id: fruiting.id,     duration_weeks: '3' },
      ];
    }
    return stageDefs.slice(0, 3).map((def, i) => ({
      stage_definition_id: def.id,
      duration_weeks: ['4', '4', '3'][i] ?? '4',
    }));
  }, [stageDefs]);

  const plantDefaultStages = useCallback((): StageRow[] =>
    stageDefs.slice(0, 3).map((def, i) => ({
      stage_definition_id: def.id,
      duration_weeks: ['2', '4', '8'][i] ?? '4',
    }))
  , [stageDefs]);

  // Toggle handler — also resets stages to matching defaults
  const handleToggleRecordType = useCallback((next: 'plant' | 'mushroom') => {
    setRecordType(next);
    if (next === 'mushroom') setStages(mushroomDefaultStages());
    else setStages(plantDefaultStages());
  }, [mushroomDefaultStages, plantDefaultStages]);

  useEffect(() => {
    let isCancelled = false;

    const loadFormData = () => {
      if (isEditMode && !cropRowAvailable) {
        setLoadingInitial(false);
        return;
      }
      if (isCancelled) return;

      const storeState       = usePlannerStore.getState();
      const currentStageDefs = storeState.stageDefinitions;
      const cropRow = isEditMode && cropId != null
        ? storeState.rows.find(row => row.type === 'crop_row' && row.crop.id === cropId)
        : null;

      if (currentStageDefs.length === 0) {
        setLoadingInitial(false);
        return;
      }

      if (isEditMode && cropRow?.type === 'crop_row') {
        const parsedStart = parseDateKey(cropRow.crop.start_date);
        setName(cropRow.crop.name);
        setPlantCount(String(cropRow.crop.plant_count));
        setRecordType(cropRow.crop.record_type ?? 'plant');
        setStartDate(parsedStart ?? toSunday(new Date()));
        setSectionId(cropRow.crop.section_id);
        setStages(
          cropRow.stages.length > 0
            ? cropRow.stages.map(stage => ({
                stage_definition_id: stage.stage_definition_id,
                duration_weeks: String(stage.duration_weeks),
              }))
            : [{ stage_definition_id: currentStageDefs[0]?.id ?? 1, duration_weeks: '1' }]
        );
        setLoadingInitial(false);
        return;
      }

      // New crop — cascade record_type from the first section's parent garden
      const firstSection = storeState.sections[0] ?? null;
      let initialRecordType: 'plant' | 'mushroom' = 'plant';
      if (firstSection) {
        setSectionId(firstSection.id);
        const parentGarden = storeState.gardens.find(g => g.id === firstSection.garden_id);
        initialRecordType = parentGarden?.record_type ?? 'plant';
        setRecordType(initialRecordType);
      }

      if (initialRecordType === 'mushroom') {
        const inoculation  = currentStageDefs.find(d => d.name === 'Inoculation');
        const colonization = currentStageDefs.find(d => d.name === 'Colonization');
        const fruiting     = currentStageDefs.find(d => d.name === 'Fruiting' && d.order_index >= 7);
        if (inoculation && colonization && fruiting) {
          setStages([
            { stage_definition_id: inoculation.id,  duration_weeks: '4' },
            { stage_definition_id: colonization.id, duration_weeks: '4' },
            { stage_definition_id: fruiting.id,     duration_weeks: '3' },
          ]);
        } else {
          const mushroomDefs = currentStageDefs.filter(d => d.order_index >= 7);
          setStages(mushroomDefs.slice(0, 3).map((def, i) => ({
            stage_definition_id: def.id,
            duration_weeks: ['4', '4', '3'][i] ?? '4',
          })));
        }
      } else {
        setStages(
          currentStageDefs.filter(d => d.order_index < 7).slice(0, 3).map((def, i) => ({
            stage_definition_id: def.id,
            duration_weeks: ['2', '4', '8'][i] ?? '4',
          }))
        );
      }
      setLoadingInitial(false);
    };

    loadFormData();
    return () => { isCancelled = true; };
  }, [cropId, cropRowAvailable, isEditMode, sections.length, stageDefsAvailable]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed' || !selectedDate) return;
    setStartDate(selectedDate);
  };

  const updateStageDefinition = (index: number, stageDefinitionId: number) => {
    setStages(prev => prev.map((s, i) => (i === index ? { ...s, stage_definition_id: stageDefinitionId } : s)));
  };

  const updateStageDuration = (index: number, value: string) => {
    const numeric = value.replace(/[^0-9]/g, '');
    setStages(prev => prev.map((s, i) => (i === index ? { ...s, duration_weeks: numeric } : s)));
  };

  const addStageRow = () => {
    setStages(prev => [...prev, { stage_definition_id: stageDefs[0]?.id ?? 1, duration_weeks: '4' }]);
  };

  const removeStageRow = (index: number) => {
    setStages(prev => prev.filter((_, i) => i !== index));
  };

  const submitCrop = useCallback(async () => {
    if (!name.trim()) return Alert.alert('Validation', 'Crop name is required.');
    const count = parseInt(plantCount, 10);
    if (isNaN(count) || count < 1) return Alert.alert('Validation', 'Plant count must be at least 1.');
    if (stages.length === 0) return Alert.alert('Validation', 'Add at least one stage.');
    if (sectionId == null) return Alert.alert('Validation', 'Select a section.');

    const snappedDate = formatDateKey(toSunday(startDate));
    const stageData = stages.map(s => {
      const duration = parseInt(s.duration_weeks, 10);
      return {
        stage_definition_id: s.stage_definition_id,
        duration_weeks: isNaN(duration) || duration < 1 ? 1 : duration,
      };
    });

    setSubmitting(true);
    try {
      if (isEditMode && cropId != null) {
        await editCrop(cropId, {
          name: name.trim(),
          plant_count: count,
          start_date: snappedDate,
          section_id: sectionId,
          record_type: recordType,
          stages: stageData,
        });
      } else {
        await addCrop({
          name: name.trim(),
          plant_count: count,
          start_date: snappedDate,
          section_id: sectionId,
          record_type: recordType,
          stages: stageData,
        });
      }
      router.back();
    } catch {
      Alert.alert('Error', `Failed to ${isEditMode ? 'update' : 'save'} crop.`);
    } finally {
      setSubmitting(false);
    }
  }, [addCrop, cropId, editCrop, isEditMode, name, plantCount, recordType, sectionId, stages, startDate]);

  const handleSubmit = async () => { await submitCrop(); };

  const handleArchive = useCallback(() => {
    if (!isEditMode || cropId == null) return;
    Alert.alert(
      'Archive Crop',
      `Archive "${name.trim() || 'this crop'}"? You can show archived rows again from the toolbar.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try { await archiveCrop(cropId); router.back(); }
            catch { /* toast shown by store */ }
          },
        },
      ]
    );
  }, [archiveCrop, cropId, isEditMode, name]);

  const handleDelete = useCallback(() => {
    if (!isEditMode || cropId == null) return;
    Alert.alert(
      'Delete Crop',
      `Permanently delete "${name.trim() || 'this crop'}" and all its tasks and completions? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try { await deleteCrop(cropId); router.back(); }
            catch { /* toast shown by store */ }
          },
        },
      ]
    );
  }, [cropId, deleteCrop, isEditMode, name]);

  useImperativeHandle(ref, () => ({
    submit: submitCrop,
    archive: handleArchive,
    remove: handleDelete,
  }), [handleArchive, handleDelete, submitCrop]);

  if (loadingInitial) {
    const loadingContent = (
      <View style={styles.loadingState}>
        <ActivityIndicator color="#7dcea0" />
        <Text style={styles.loadingText}>Loading crop details...</Text>
      </View>
    );
    return embedded ? loadingContent : (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        {loadingContent}
      </SafeAreaView>
    );
  }

  const isMushroom = recordType === 'mushroom';

  const page1Content = (
    <>
      {/* Plants / Mushrooms toggle */}
      <View style={styles.recordTypeToggle}>
        <Pressable
          style={[styles.recordTypeBtn, !isMushroom && styles.recordTypeBtnPlantActive]}
          onPress={() => handleToggleRecordType('plant')}
        >
          <Text style={[styles.recordTypeBtnText, !isMushroom && styles.recordTypeBtnTextActive]}>
            Plants
          </Text>
        </Pressable>
        <Pressable
          style={[styles.recordTypeBtn, isMushroom && styles.recordTypeBtnMushroomActive]}
          onPress={() => handleToggleRecordType('mushroom')}
        >
          <Text style={[styles.recordTypeBtnText, isMushroom && styles.recordTypeBtnTextActive]}>
            Mushrooms
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Choose garden / section for new crop</Text>
      <View style={styles.sectionList}>
        {locations.map(location => {
          const locationGardens = gardens
            .filter(g => g.location_id === location.id)
            .sort((a, b) => a.order_index - b.order_index);
          const gardenRows = locationGardens.flatMap(garden => {
            const gardenSections = sections
              .filter(s => s.garden_id === garden.id)
              .sort((a, b) => a.order_index - b.order_index);
            if (gardenSections.length === 0) return [];
            const isMshrm = garden.record_type === 'mushroom';
            return [(
              <View key={garden.id} style={[styles.gardenGroup, isMshrm && styles.gardenGroupMushroom]}>
                <View style={[styles.gardenHeader, isMshrm && styles.gardenHeaderMushroom]}>
                  <Text style={[styles.gardenGroupLabel, isMshrm && styles.gardenGroupLabelMushroom]}>
                    {garden.name}
                  </Text>
                </View>
                <View style={styles.sectionItems}>
                  {gardenSections.map(sec => (
                    <Pressable
                      key={sec.id}
                      style={[styles.sectionOption, sectionId === sec.id && (isMshrm ? styles.sectionSelectedMushroom : styles.sectionSelected)]}
                      onPress={() => {
                        setSectionId(sec.id);
                        handleToggleRecordType(garden.record_type ?? 'plant');
                      }}
                    >
                      <Text style={[styles.sectionText, sectionId === sec.id && styles.sectionTextSelected]}>
                        {sec.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )];
          });
          if (gardenRows.length === 0) return null;
          return (
            <View key={location.id} style={styles.locationGroup}>
              <View style={styles.locationHeader}>
                <Text style={styles.locationGroupLabel}>{location.name}</Text>
              </View>
              <View style={styles.locationBody}>{gardenRows}</View>
            </View>
          );
        })}
        {sections.length === 0 && (
          <View style={styles.emptyStateBox}>
            <Text style={styles.emptyStateText}>No sections available yet.</Text>
            <Text style={styles.emptyStateSubtext}>Create Location, then Garden, then Section first.</Text>
            <Pressable style={styles.emptyStateBtn} onPress={() => router.push('/(modals)/add-location')}>
              <Text style={styles.emptyStateBtnText}>Set up hierarchy</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Text style={styles.label}>Crop Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={isMushroom ? 'e.g. Oyster, Shiitake' : 'e.g. Tomato, Basil'}
        placeholderTextColor="#555"
        maxLength={100}
        onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
      />

      <Text style={styles.label}>{isMushroom ? 'Block / Jar Count' : 'Plant Count'}</Text>
      <TextInput
        style={[styles.input, styles.inputSmall]}
        value={plantCount}
        onChangeText={setPlantCount}
        keyboardType="numeric"
        placeholder="1"
        placeholderTextColor="#555"
        maxLength={4}
        onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
      />

      {!embedded && (
        <View style={styles.actionRow}>
          <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.submitBtn} onPress={() => setPage(2)}>
            <Text style={styles.submitBtnText}>Next</Text>
          </Pressable>
        </View>
      )}
    </>
  );

  const page2Content = (
    <>
      <Text style={styles.label}>Start Date (snaps to Sunday on save)</Text>
      <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
        <Text style={styles.dateButtonMain}>
          {startDate.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
          })}
        </Text>
        <Text style={styles.dateButtonSub}>Starts: {formatDateKey(toSunday(startDate))}</Text>
      </Pressable>
      {showDatePicker && (
        <View style={styles.datePickerCard}>
          <DateTimePicker
            value={startDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleDateChange}
          />
          {Platform.OS === 'ios' && (
            <Pressable style={styles.dateDoneBtn} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.dateDoneText}>Done</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={styles.label}>Stages</Text>
      {stages.map((stage, i) => (
        <View key={i} style={styles.stageRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stagePicker}>
            {stageDefs.filter(def => isMushroom ? def.order_index >= 7 : def.order_index < 7).map(def => (
              <Pressable
                key={def.id}
                style={[
                  styles.stageChip,
                  { borderColor: def.color },
                  stage.stage_definition_id === def.id && { backgroundColor: def.color },
                ]}
                onPress={() => updateStageDefinition(i, def.id)}
              >
                <Text style={[
                  styles.stageChipText,
                  stage.stage_definition_id === def.id && styles.stageChipTextSelected,
                ]}>
                  {def.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.stageRight}>
            <TextInput
              style={styles.weekInput}
              value={stage.duration_weeks}
              onChangeText={v => updateStageDuration(i, v)}
              keyboardType="numeric"
              maxLength={3}
            />
            <Text style={styles.weekLabel}>wk</Text>
            {stages.length > 1 && (
              <Pressable onPress={() => removeStageRow(i)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>✕</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}
      <Pressable style={styles.addStageBtn} onPress={addStageRow}>
        <Text style={styles.addStageBtnText}>+ Add Stage</Text>
      </Pressable>

      {!embedded && (
        <>
          <View style={styles.actionRow}>
            <Pressable style={styles.cancelBtn} onPress={() => router.back()} disabled={submitting}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>{isEditMode ? 'Save Crop' : 'Add Crop'}</Text>
              }
            </Pressable>
          </View>

          {isEditMode && (
            <>
              <Pressable style={styles.archiveBtn} onPress={handleArchive}>
                <Text style={styles.archiveBtnText}>Archive Crop</Text>
              </Pressable>
              <Pressable style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteBtnText}>Delete Crop</Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </>
  );

  const scrollContent = (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={[styles.content, embedded && styles.embeddedContent]}
      keyboardShouldPersistTaps="handled"
    >
      {embedded ? (
        <>{page1Content}{page2Content}</>
      ) : (
        page === 1 ? page1Content : page2Content
      )}
    </ScrollView>
  );

  return embedded ? scrollContent : (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        {scrollContent}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
});

export default AddCropForm;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  keyboardAvoider: { flex: 1 },
  content: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 40 },
  embeddedContent: { paddingBottom: 16 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingText: { color: '#999', fontSize: 13 },

  // ── Plants / Mushrooms toggle ─────────────────────────────────────────────
  recordTypeToggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  recordTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: '#262626',
  },
  recordTypeBtnPlantActive:    { borderColor: '#2ecc71', backgroundColor: '#1a3a2a' },
  recordTypeBtnMushroomActive: { borderColor: '#8B4513', backgroundColor: '#2a1508' },
  recordTypeBtnText:           { color: '#888', fontSize: 13, fontWeight: '600' },
  recordTypeBtnTextActive:     { color: '#eee' },

  label: { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 4 },
  input: { backgroundColor: '#2a2a2a', color: '#eee', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1, borderColor: '#3a3a3a' },
  inputSmall: { width: 140 },
  dateButton: { backgroundColor: '#2a2a2a', borderRadius: 6, borderWidth: 1, borderColor: '#3a3a3a', paddingHorizontal: 12, paddingVertical: 10 },
  dateButtonMain: { color: '#eee', fontSize: 14, fontWeight: '600' },
  dateButtonSub: { color: '#999', fontSize: 12, marginTop: 2 },
  datePickerCard: { marginTop: 8, borderWidth: 1, borderColor: '#3a3a3a', borderRadius: 8, backgroundColor: '#202020', overflow: 'hidden' },
  dateDoneBtn: { borderTopWidth: 1, borderTopColor: '#3a3a3a', alignItems: 'center', paddingVertical: 10, backgroundColor: '#272727' },
  dateDoneText: { color: '#7dcea0', fontWeight: '600', fontSize: 14 },

  sectionList: { gap: 8 },
  locationGroup: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#0d0d0d' },
  locationHeader: { backgroundColor: '#0d0d0d', paddingHorizontal: 12, paddingVertical: 8 },
  locationGroupLabel: { color: '#ccc', fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  locationBody: { padding: 8, gap: 6 },

  gardenGroup: { borderRadius: 6, overflow: 'hidden', backgroundColor: '#003e14' },
  gardenGroupMushroom: { backgroundColor: '#3A2010' },
  gardenHeader: { backgroundColor: '#003e14', paddingHorizontal: 10, paddingVertical: 6 },
  gardenHeaderMushroom: { backgroundColor: '#3A2010' },
  gardenGroupLabel: { color: '#a8e6b8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  gardenGroupLabelMushroom: { color: '#d4a882' },

  sectionItems: { paddingHorizontal: 8, paddingBottom: 8, gap: 5 },
  sectionOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 5, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#cdcdcd' },
  sectionSelected: { borderColor: 'transparent', backgroundColor: '#1a9148' },
  sectionSelectedMushroom: { borderColor: 'transparent', backgroundColor: '#8B4513' },
  sectionText: { color: '#1a1a1a', fontSize: 13, fontWeight: '600' },
  sectionTextSelected: { color: '#fff', fontWeight: '700' },

  emptyStateBox: { borderWidth: 1, borderColor: '#3a3a3a', borderRadius: 8, backgroundColor: '#232323', padding: 10, gap: 8 },
  emptyStateText: { color: '#bbb', fontSize: 13, fontWeight: '600' },
  emptyStateSubtext: { color: '#8a8a8a', fontSize: 12 },
  emptyStateBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#4b6a55', borderRadius: 6, backgroundColor: '#1e3a2a', paddingHorizontal: 10, paddingVertical: 6 },
  emptyStateBtnText: { color: '#7dcea0', fontSize: 12, fontWeight: '700' },

  stageRow: { marginBottom: 8, gap: 6 },
  stagePicker: { flexGrow: 0 },
  stageChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginRight: 6 },
  stageChipText: { color: '#aaa', fontSize: 11 },
  stageChipTextSelected: { color: '#111', fontWeight: 'bold' },
  stageRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekInput: { backgroundColor: '#2a2a2a', color: '#eee', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 14, borderWidth: 1, borderColor: '#3a3a3a', width: 48, textAlign: 'center' },
  weekLabel: { color: '#666', fontSize: 12 },
  removeBtn: { padding: 4 },
  removeBtnText: { color: '#e74c3c', fontSize: 14 },
  addStageBtn: { marginTop: 4, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#3a3a3a', borderRadius: 6, borderStyle: 'dashed' },
  addStageBtnText: { color: '#7dcea0', fontSize: 13 },

  actionRow: { marginTop: 28, flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderRadius: 8, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#4a4a4a', backgroundColor: '#262626' },
  cancelBtnText: { color: '#ddd', fontWeight: '600', fontSize: 15 },
  submitBtn: { flex: 1, backgroundColor: '#2ecc71', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: '#111', fontWeight: 'bold', fontSize: 15 },
  archiveBtn: { marginTop: 12, borderRadius: 8, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#7b5b16', backgroundColor: '#2f2611' },
  archiveBtnText: { color: '#e7c46a', fontWeight: '700', fontSize: 14 },
  deleteBtn: { marginTop: 8, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  deleteBtnText: { color: '#7a5454', fontSize: 13 },
});
