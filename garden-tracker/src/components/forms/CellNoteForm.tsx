import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WeeklyNoteEntry } from '@/src/types';
import { usePlannerStore } from '@/src/store/plannerStore';
import {
  compareWeeklyNoteEntries,
  createWeeklyNoteEntry,
  dateForWeekEntry,
  formatWeekEntryLabel,
  formatWeekRangeLabel,
  parseWeeklyNoteEntries,
  serializeWeeklyNoteEntries,
  updateWeeklyNoteEntry,
} from '@/src/utils/noteUtils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CellNoteFormProps {
  cropId: number;
  weekDate: string;
  initialMode?: 'view' | 'compose';
}

function defaultDayOfWeek(weekDate: string): number {
  const today = new Date();
  const target = dateForWeekEntry(weekDate, 0);
  if (!target) return 0;

  const weekEnd = dateForWeekEntry(weekDate, 6);
  if (weekEnd) {
    weekEnd.setHours(23, 59, 59, 999);
  }

  if (weekEnd && today >= target && today <= weekEnd) {
    return today.getDay();
  }

  return 0;
}

export default function CellNoteForm({ cropId, weekDate, initialMode = 'view' }: CellNoteFormProps) {
  const headerHeight = useHeaderHeight();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const rows = usePlannerStore(s => s.rows);
  const saveCellNote = usePlannerStore(s => s.saveCellNote);
  const deleteNote = usePlannerStore(s => s.deleteNote);

  const cropRow = rows.find(row => row.type === 'crop_row' && row.crop.id === cropId);
  const note = cropRow?.type === 'crop_row' ? cropRow.notesByWeek[weekDate] ?? null : null;

  const [entries, setEntries] = useState<WeeklyNoteEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [selectedDay, setSelectedDay] = useState(() => defaultDayOfWeek(weekDate));
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(initialMode === 'compose');
  const [saving, setSaving] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  // Ref guard stops a double-tap from queuing two persistEntries calls before
  // React flushes the `saving` state that would disable the button.
  const saveInFlight = useRef(false);

  useEffect(() => {
    const parsed = parseWeeklyNoteEntries(note);
    setEntries(parsed);
    setDraft('');
    setSelectedDay(defaultDayOfWeek(weekDate));
    setEditingEntryId(null);
    setComposerOpen(initialMode === 'compose' || parsed.length === 0);
  }, [initialMode, note, weekDate]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const cropName = cropRow?.type === 'crop_row' ? cropRow.crop.name : 'Weekly note';
  const editingEntry = useMemo(
    () => entries.find(entry => entry.id === editingEntryId) ?? null,
    [editingEntryId, entries]
  );
  const entriesByDay = useMemo(
    () => DAYS
      .map((day, index) => ({
        day,
        index,
        date: dateForWeekEntry(weekDate, index),
        entries: entries.filter(entry => entry.day_of_week === index),
      }))
      .filter(group => group.entries.length > 0),
    [entries, weekDate]
  );

  const persistEntries = async (nextEntries: WeeklyNoteEntry[]) => {
    if (saveInFlight.current) return false;
    saveInFlight.current = true;

    const filtered = nextEntries.filter(entry => entry.text.trim().length > 0);
    setSaving(true);

    try {
      if (filtered.length === 0) {
        if (note?.id) {
          await deleteNote(note.id);
        }
      } else {
        await saveCellNote(cropId, weekDate, serializeWeeklyNoteEntries(filtered));
      }
      return true;
    } catch {
      Alert.alert('Error', 'Failed to save note.');
      return false;
    } finally {
      setSaving(false);
      saveInFlight.current = false;
    }
  };

  const handleSaveEntry = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      if (editingEntry) {
        await handleDeleteEntry(editingEntry.id);
      }
      return;
    }

    const nextEntries = editingEntry
      ? entries.map(entry => (
          entry.id === editingEntry.id
            ? updateWeeklyNoteEntry(entry, selectedDay, trimmed)
            : entry
        ))
      : [...entries, createWeeklyNoteEntry(selectedDay, trimmed)];

    const saved = await persistEntries(nextEntries);
    if (!saved) return;

    const sortedEntries = [...nextEntries].sort(compareWeeklyNoteEntries);
    setEntries(sortedEntries);
    setDraft('');
    setEditingEntryId(null);
    setSelectedDay(defaultDayOfWeek(weekDate));
    if (initialMode === 'view' && sortedEntries.length > 0) {
      setComposerOpen(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    const nextEntries = entries.filter(entry => entry.id !== entryId);
    const saved = await persistEntries(nextEntries);
    if (!saved) return;

    setEntries(nextEntries);
    if (editingEntryId === entryId) {
      setDraft('');
      setEditingEntryId(null);
      setSelectedDay(defaultDayOfWeek(weekDate));
    }
    if (nextEntries.length === 0) {
      setComposerOpen(true);
    }
  };

  const beginEdit = (entry: WeeklyNoteEntry) => {
    setEditingEntryId(entry.id);
    setDraft(entry.text);
    setSelectedDay(entry.day_of_week);
    setComposerOpen(true);
  };

  const cancelEdit = () => {
    setEditingEntryId(null);
    setDraft('');
    setSelectedDay(defaultDayOfWeek(weekDate));
    if (entries.length > 0 && initialMode === 'view') {
      setComposerOpen(false);
    }
  };

  const openComposer = (dayOfWeek = defaultDayOfWeek(weekDate)) => {
    setEditingEntryId(null);
    setDraft('');
    setSelectedDay(dayOfWeek);
    setComposerOpen(true);
  };

  const handleSecondaryAction = () => {
    if (keyboardOpen) {
      Keyboard.dismiss();
      return;
    }
    router.back();
  };

  if (cropRow?.type !== 'crop_row') {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Crop not found</Text>
          <Pressable style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Math.max(0, headerHeight - 16)}
      >
        {/* Single scrollable column — works in both portrait and landscape */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* Header — collapsed to one line in landscape to save vertical space */}
          <View style={[styles.header, isLandscape && styles.headerCompact]}>
            <Text style={styles.cropName}>{cropName}</Text>
            <Text style={[styles.weekLabel, isLandscape && styles.weekLabelCompact]}>{formatWeekRangeLabel(weekDate)}</Text>
            {!isLandscape && (
              <Text style={styles.helperText}>
                {entries.length > 0
                  ? 'Quick tap reads the week first. Long press from the planner jumps straight into adding.'
                  : 'Add short daily notes so the week reads like a timeline instead of one long paragraph.'}
              </Text>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>This week</Text>
              <Text style={styles.sectionSubtitle}>
                {entries.length === 0
                  ? 'No notes yet for this week.'
                  : `${entries.length} ${entries.length === 1 ? 'note' : 'notes'} arranged by day.`}
              </Text>
            </View>
            {entries.length > 0 && !composerOpen && (
              <Pressable style={styles.sectionAction} onPress={() => openComposer()}>
                <Text style={styles.sectionActionText}>Add Note</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.list}>
            {entries.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardTitle}>No entries yet</Text>
                {!isLandscape && (
                  <Text style={styles.emptyCardText}>Long press a week in the planner to jump right into adding. Once notes exist, a quick tap brings you here to read them first.</Text>
                )}
              </View>
            ) : (
              <View style={styles.weekPanel}>
                {entriesByDay.map(group => (
                  <View key={group.index} style={styles.daySection}>
                    <Text style={styles.daySectionLabel}>
                      {group.date
                        ? group.date.toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'short',
                            day: 'numeric',
                          })
                        : group.day}
                    </Text>

                    {group.entries.map((entry, index) => (
                      <View
                        key={entry.id}
                        style={[
                          styles.entryRow,
                          editingEntryId === entry.id && styles.entryRowEditing,
                          index < group.entries.length - 1 && styles.entryRowDivider,
                        ]}
                      >
                        <View style={styles.entryHeader}>
                          <Text style={styles.entryLabel}>{formatWeekEntryLabel(weekDate, entry)}</Text>
                          <View style={styles.entryActions}>
                            <Pressable style={styles.inlineBtn} onPress={() => beginEdit(entry)}>
                              <Text style={styles.inlineBtnText}>Edit</Text>
                            </Pressable>
                            <Pressable style={styles.inlineBtn} onPress={() => handleDeleteEntry(entry.id)}>
                              <Text style={[styles.inlineBtnText, styles.deleteInlineText]}>Delete</Text>
                            </Pressable>
                          </View>
                        </View>
                        <Text style={styles.entryBody}>{entry.text}</Text>
                      </View>
                    ))}

                    <Pressable style={styles.dayAddBtn} onPress={() => openComposer(group.index)}>
                      <Text style={styles.dayAddBtnText}>Add note for {group.day}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {composerOpen ? (
            <View style={styles.composerCard}>
              <View style={styles.composerHeader}>
                <View style={styles.composerHeaderText}>
                  <Text style={styles.composerTitle}>{editingEntry ? 'Edit note' : 'Add note'}</Text>
                  {!keyboardOpen && !draft.trim() && !isLandscape && (
                    <Text style={styles.composerSubtitle}>
                      {editingEntry
                        ? 'Adjust the day or wording, then save it back into the weekly timeline.'
                        : 'Choose the day first, then add a short note that is easy to scan later.'}
                    </Text>
                  )}
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayPicker} keyboardShouldPersistTaps="handled">
                {DAYS.map((day, index) => (
                  <Pressable
                    key={day}
                    style={[styles.dayChip, selectedDay === index && styles.dayChipSelected]}
                    onPress={() => setSelectedDay(index)}
                  >
                    <Text style={[styles.dayChipText, selectedDay === index && styles.dayChipTextSelected]}>{day}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <TextInput
                style={[styles.input, isLandscape && styles.inputCompact]}
                multiline
                value={draft}
                onChangeText={setDraft}
                maxLength={2000}
                placeholder="What happened, what changed, what to remember next time?"
                placeholderTextColor="#5a5a5a"
                textAlignVertical="top"
                scrollEnabled
              />

              <View style={styles.actionRow}>
                {editingEntry ? (
                  <Pressable style={styles.secondaryBtn} onPress={cancelEdit} disabled={saving}>
                    <Text style={styles.secondaryBtnText}>Cancel Edit</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={entries.length > 0 ? () => setComposerOpen(false) : handleSecondaryAction}
                    disabled={saving}
                  >
                    <Text style={styles.secondaryBtnText}>
                      {entries.length > 0 ? 'Back to Notes' : keyboardOpen ? 'Done' : 'Close'}
                    </Text>
                  </Pressable>
                )}

                <Pressable style={styles.primaryBtn} onPress={handleSaveEntry} disabled={saving}>
                  <Text style={styles.primaryBtnText}>
                    {editingEntry ? 'Save Note' : 'Add Note'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.footer}>
              <Pressable style={styles.footerCloseBtn} onPress={() => router.back()}>
                <Text style={styles.footerCloseBtnText}>Close</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#141414',
  },
  keyboardAvoider: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#242424',
  },
  headerCompact: {
    paddingTop: 6,
    paddingBottom: 6,
  },
  cropName: {
    color: '#e7e7e7',
    fontSize: 18,
    fontWeight: '700',
  },
  weekLabel: {
    marginTop: 4,
    color: '#9cb2bf',
    fontSize: 13,
  },
  weekLabelCompact: {
    marginTop: 2,
  },
  helperText: {
    marginTop: 8,
    color: '#7d7d7d',
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    color: '#ececec',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSubtitle: {
    marginTop: 4,
    color: '#8c989d',
    fontSize: 12,
  },
  sectionAction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2f6b86',
    backgroundColor: '#173745',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionActionText: {
    color: '#dff4ff',
    fontSize: 12,
    fontWeight: '700',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  emptyCard: {
    backgroundColor: '#1d1d1d',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    padding: 14,
  },
  emptyCardTitle: {
    color: '#d3d3d3',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCardText: {
    marginTop: 6,
    color: '#7c7c7c',
    fontSize: 13,
    lineHeight: 19,
  },
  weekPanel: {
    backgroundColor: '#171b1d',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 12,
    overflow: 'hidden',
  },
  daySection: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#252b2f',
  },
  daySectionLabel: {
    color: '#9bd1eb',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  entryRow: {
    borderRadius: 10,
    paddingVertical: 10,
  },
  entryRowEditing: {
    backgroundColor: '#192127',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#2f6b86',
  },
  entryRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#252b2f',
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  entryLabel: {
    flex: 1,
    color: '#9bd1eb',
    fontSize: 13,
    fontWeight: '700',
  },
  entryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  inlineBtn: {
    paddingVertical: 2,
  },
  inlineBtnText: {
    color: '#8a8a8a',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteInlineText: {
    color: '#c78484',
  },
  entryBody: {
    marginTop: 10,
    color: '#dfdfdf',
    fontSize: 14,
    lineHeight: 21,
  },
  dayAddBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 4,
  },
  dayAddBtnText: {
    color: '#8fc4dd',
    fontSize: 12,
    fontWeight: '700',
  },
  composerCard: {
    borderTopWidth: 1,
    borderTopColor: '#242424',
    borderWidth: 1,
    borderColor: '#2a3136',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: '#101416',
    marginTop: 8,
  },
  composerHeader: {
    marginBottom: 10,
  },
  composerHeaderText: {
    width: '100%',
  },
  composerTitle: {
    color: '#dcdcdc',
    fontSize: 14,
    fontWeight: '700',
  },
  composerSubtitle: {
    marginTop: 4,
    color: '#8ea3ae',
    fontSize: 12,
    lineHeight: 17,
  },
  dayPicker: {
    gap: 8,
    paddingBottom: 10,
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#313131',
    backgroundColor: '#1b1b1b',
  },
  dayChipSelected: {
    backgroundColor: '#24516a',
    borderColor: '#2f6b86',
  },
  dayChipText: {
    color: '#8a8a8a',
    fontSize: 12,
    fontWeight: '600',
  },
  dayChipTextSelected: {
    color: '#d9f0fb',
  },
  input: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#35505d',
    backgroundColor: '#161d20',
    color: '#ededed',
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputCompact: {
    minHeight: 60,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#363636',
    backgroundColor: '#202020',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  secondaryBtnText: {
    color: '#d0d0d0',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2f6b86',
    backgroundColor: '#214a5f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: '#e5f7ff',
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  footerCloseBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#363636',
    backgroundColor: '#202020',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  footerCloseBtnText: {
    color: '#d0d0d0',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  emptyTitle: {
    color: '#ddd',
    fontSize: 16,
    fontWeight: '600',
  },
  doneBtn: {
    minWidth: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#363636',
    backgroundColor: '#202020',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  doneBtnText: {
    color: '#ddd',
    fontWeight: '600',
  },
});
