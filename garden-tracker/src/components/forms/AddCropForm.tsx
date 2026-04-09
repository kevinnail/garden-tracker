import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Pressable, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { formatDateKey, parseDateKey, toSunday } from '@/src/utils/dateUtils';
import { usePlannerStore } from '@/src/store/plannerStore';
import { getAllSections, getAllLocations } from '@/src/db/queries/locationQueries';
import { getCropStages } from '@/src/db/queries/cropQueries';
import { Section, Location } from '@/src/types';

interface StageRow {
  stage_definition_id: number;
  duration_weeks: string; // string for TextInput, parsed on submit
}

const DEFAULT_STAGES: StageRow[] = [
  { stage_definition_id: 1, duration_weeks: '2' }, // Seedling
  { stage_definition_id: 2, duration_weeks: '4' }, // Vegetative
  { stage_definition_id: 3, duration_weeks: '8' }, // Flowering
];

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
  const stageDefs    = usePlannerStore(s => s.stageDefinitions);
  const rows         = usePlannerStore(s => s.rows);
  const addCrop      = usePlannerStore(s => s.addCrop);
  const editCrop     = usePlannerStore(s => s.editCrop);
  const archiveCrop  = usePlannerStore(s => s.archiveCrop);
  const deleteCrop   = usePlannerStore(s => s.deleteCrop);
  const isEditMode   = cropId != null;
  const cropRow = isEditMode
    ? rows.find(row => row.type === 'crop_row' && row.crop.id === cropId)
    : null;

  const [name, setName]             = useState('');
  const [plantCount, setPlantCount] = useState('1');
  const [startDate, setStartDate]   = useState<Date>(() => toSunday(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [sectionId, setSectionId]   = useState<number | null>(null);
  const [stages, setStages]         = useState<StageRow[]>(DEFAULT_STAGES);
  const [sections, setSections]     = useState<Section[]>([]);
  const [locations, setLocations]   = useState<Location[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(isEditMode);

  useEffect(() => {
    let isCancelled = false;

    const loadFormData = async () => {
      const [secs, locs, existingStages] = await Promise.all([
        getAllSections(),
        getAllLocations(),
        isEditMode && cropId != null ? getCropStages(cropId) : Promise.resolve([]),
      ]);

      if (isCancelled) {
        return;
      }

      setSections(secs);
      setLocations(locs);

      if (isEditMode && cropRow?.type === 'crop_row') {
        const parsedStart = parseDateKey(cropRow.crop.start_date);
        setName(cropRow.crop.name);
        setPlantCount(String(cropRow.crop.plant_count));
        setStartDate(parsedStart ?? toSunday(new Date(cropRow.crop.start_date)));
        setSectionId(cropRow.crop.section_id);
        setStages(
          existingStages.length > 0
            ? existingStages.map(stage => ({
                stage_definition_id: stage.stage_definition_id,
                duration_weeks: String(stage.duration_weeks),
              }))
            : [{ stage_definition_id: stageDefs[0]?.id ?? 1, duration_weeks: '1' }]
        );
        setLoadingInitial(false);
        return;
      }

      if (secs.length > 0) {
        setSectionId(secs[0].id);
      }
      setLoadingInitial(false);
    };

    loadFormData().catch(() => {
      if (!isCancelled) {
        setLoadingInitial(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [cropId, cropRow, isEditMode, stageDefs]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'dismissed' || !selectedDate) {
      return;
    }
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

  const submitCrop = async () => {
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
          stages: stageData,
        });
      } else {
        await addCrop({ name: name.trim(), plant_count: count, start_date: snappedDate, section_id: sectionId, stages: stageData });
      }
      router.back();
    } catch {
      Alert.alert('Error', `Failed to ${isEditMode ? 'update' : 'save'} crop.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    await submitCrop();
  };

  const handleArchive = () => {
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
            await archiveCrop(cropId);
            router.back();
          },
        },
      ]
    );
  };

  const handleDelete = () => {
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
            await deleteCrop(cropId);
            router.back();
          },
        },
      ]
    );
  };

  useImperativeHandle(ref, () => ({
    submit: submitCrop,
    archive: handleArchive,
    remove: handleDelete,
  }), [name, plantCount, startDate, sectionId, stages, submitting, cropId, isEditMode, cropRow, stageDefs]);

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

  const formContent = (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, embedded && styles.embeddedContent]}
        keyboardShouldPersistTaps="handled"
      >

      <Text style={styles.label}>Section</Text>
      <View style={styles.sectionList}>
        {sections.map(sec => {
          const loc = locations.find(l => l.id === sec.location_id);
          const label = loc ? `${loc.name} › ${sec.name}` : sec.name;
          return (
            <Pressable
              key={sec.id}
              style={[styles.sectionOption, sectionId === sec.id && styles.sectionSelected]}
              onPress={() => setSectionId(sec.id)}
            >
              <Text style={[styles.sectionText, sectionId === sec.id && styles.sectionTextSelected]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>


      <Text style={styles.label}>Crop Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Tomato"
        placeholderTextColor="#555"
        autoFocus={!isEditMode}
      />

      <Text style={styles.label}>Plant Count</Text>
      <TextInput
        style={[styles.input, styles.inputSmall]}
        value={plantCount}
        onChangeText={setPlantCount}
        keyboardType="numeric"
        placeholder="1"
        placeholderTextColor="#555"
      />

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
          {/* Stage type selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stagePicker}>
            {stageDefs.map(def => (
              <Pressable
                key={def.id}
                style={[styles.stageChip, { borderColor: def.color }, stage.stage_definition_id === def.id && { backgroundColor: def.color }]}
                onPress={() => updateStageDefinition(i, def.id)}
              >
                <Text style={[styles.stageChipText, stage.stage_definition_id === def.id && styles.stageChipTextSelected]}>
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

      </ScrollView>
  );

  return embedded ? formContent : (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      {formContent}
    </SafeAreaView>
  );
});

export default AddCropForm;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  content: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 40 },
  embeddedContent: { paddingBottom: 16 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingText: { color: '#999', fontSize: 13 },
  label: { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 4 },
  input: { backgroundColor: '#2a2a2a', color: '#eee', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1, borderColor: '#3a3a3a' },
  inputSmall: { width: 140 },
  dateButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateButtonMain: { color: '#eee', fontSize: 14, fontWeight: '600' },
  dateButtonSub: { color: '#999', fontSize: 12, marginTop: 2 },
  datePickerCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    borderRadius: 8,
    backgroundColor: '#202020',
    overflow: 'hidden',
  },
  dateDoneBtn: {
    borderTopWidth: 1,
    borderTopColor: '#3a3a3a',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#272727',
  },
  dateDoneText: { color: '#7dcea0', fontWeight: '600', fontSize: 14 },
  sectionList: { gap: 6 },
  sectionOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#3a3a3a', backgroundColor: '#2a2a2a' },
  sectionSelected: { borderColor: '#5a9', backgroundColor: '#1e3a2a' },
  sectionText: { color: '#aaa', fontSize: 13 },
  sectionTextSelected: { color: '#7dcea0' },
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
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4a4a4a',
    backgroundColor: '#262626',
  },
  cancelBtnText: { color: '#ddd', fontWeight: '600', fontSize: 15 },
  submitBtn: { flex: 1, backgroundColor: '#2ecc71', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: '#111', fontWeight: 'bold', fontSize: 15 },
  archiveBtn: {
    marginTop: 12,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7b5b16',
    backgroundColor: '#2f2611',
  },
  archiveBtnText: { color: '#e7c46a', fontWeight: '700', fontSize: 14 },
  deleteBtn: { marginTop: 8, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  deleteBtnText: { color: '#7a5454', fontSize: 13 },
});
