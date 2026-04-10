import { create } from 'zustand';
import Toast from 'react-native-toast-message';

import {
  GridRowItem,
  NewCropData,
  NewTaskData,
  Note,
  PrecomputedTaskLine,
  StageDefinition,
  TodayTaskItem,
  TaskType,
} from '@/src/types';
import { ROW_HEIGHT } from '@/src/constants/layout';
import { defaultCalendarStart, dateToWeekIndex, parseDateKey, toSunday } from '@/src/utils/dateUtils';
import { getRowHeight } from '../utils/rowLayout';
import { getTaskLineOccurrences } from '@/src/utils/taskUtils';

import { getAllLocationGroups, getAllLocations, getAllSections, insertLocationGroup, insertLocation, insertSection, deleteLocationGroup, deleteLocation, deleteSection } from '@/src/db/queries/locationQueries';
import { archiveCrop as archiveCropQuery,  getAllCrops, getCropStages, getStageDefs, insertCropWithStages, deleteCropInstance, replaceCropStages, updateCropInstance } from '@/src/db/queries/cropQueries';
import { getTasksForCrop, getCompletionsForCrop, getTaskTypes, insertTask, insertCompletion, deleteCompletion, deleteTask as dbDeleteTask, updateTaskDay, getTodayAndOverdue } from '@/src/db/queries/taskQueries';
import { deleteNote as deleteNoteQuery, getAllNotesForCrop, upsertNote } from '@/src/db/queries/noteQueries';
import { resetDatabase } from '@/src/db/database';

interface PlannerState {
  rows: GridRowItem[];
  allTaskLines: PrecomputedTaskLine[];
  calendarStart: Date;
  stageDefinitions: StageDefinition[];
  taskTypes: TaskType[];
  notes: Note[];
  todayDueTasks: TodayTaskItem[];
  todayOverdueTasks: TodayTaskItem[];
  showArchivedRows: boolean;
  isLoaded: boolean;
  selectedCropId: number | null;
  plannerFocusCropId: number | null;
  plannerFocusDate: string | null;

  loadData: () => Promise<void>;
  addCrop: (data: NewCropData) => Promise<void>;
  editCrop: (cropId: number, data: NewCropData) => Promise<void>;
  archiveCrop: (cropId: number) => Promise<void>;
  deleteCrop: (cropId: number) => Promise<void>;
  addTask: (data: NewTaskData) => Promise<void>;
  completeTask: (taskId: number, weekDate: string) => Promise<void>;
  uncompleteTask: (taskId: number, weekDate: string) => Promise<void>;
  deleteTask: (taskId: number) => Promise<void>;
  adjustTaskDay: (taskId: number, dayOfWeek: number) => Promise<void>;
  saveCellNote: (cropInstanceId: number, weekDate: string, content: string) => Promise<void>;
  deleteNote: (noteId: number) => Promise<void>;
  addLocationGroup: (name: string) => Promise<void>;
  addLocation: (groupId: number, name: string) => Promise<void>;
  addSection: (locationId: number, name: string) => Promise<void>;
  removeLocationGroup: (id: number) => Promise<void>;
  removeLocation: (id: number) => Promise<void>;
  removeSection: (id: number) => Promise<void>;
  ensureDefaultGarden: () => Promise<void>;
  resetAllData: () => Promise<void>;
  setSelectedCrop: (id: number | null) => void;
  focusPlannerCrop: (id: number | null, focusDate?: string | null) => void;
  clearPlannerFocus: () => void;
  toggleArchivedRows: () => void;
}

function showError(action: string, e: unknown) {
  const detail = e instanceof Error ? e.message : String(e);
  Toast.show({ type: 'error', text1: action, text2: detail, visibilityTime: 4000 });
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  rows: [],
  allTaskLines: [],
  calendarStart: defaultCalendarStart(),
  stageDefinitions: [],
  taskTypes: [],
  notes: [],
  todayDueTasks: [],
  todayOverdueTasks: [],
  showArchivedRows: false,
  isLoaded: false,
  selectedCropId: null,
  plannerFocusCropId: null,
  plannerFocusDate: null,

  addLocationGroup: async (name) => {
    try {
      await insertLocationGroup(name);
      await get().loadData();
    } catch (e) { showError('Failed to add group', e); throw e; }
  },

  addLocation: async (groupId, name) => {
    try {
      await insertLocation(groupId, name);
      await get().loadData();
    } catch (e) { showError('Failed to add location', e); throw e; }
  },

  addSection: async (locationId, name) => {
    try {
      await insertSection(locationId, name);
      await get().loadData();
    } catch (e) { showError('Failed to add section', e); throw e; }
  },

  ensureDefaultGarden: async () => {
    try {
      const sections = await getAllSections();
      if (sections.length > 0) return;
      await insertLocationGroup('Home');
      const groups = await getAllLocationGroups();
      const group = groups[0];
      if (!group) return;
      await insertLocation(group.id, 'My Garden');
      const locations = await getAllLocations();
      const loc = locations.find(l => l.location_group_id === group.id);
      if (!loc) return;
      await insertSection(loc.id, 'My Section');
      await get().loadData();
    } catch (e) { showError('Failed to set up default garden', e); throw e; }
  },

  resetAllData: async () => {
    try {
      await resetDatabase();
      await get().loadData();
    } catch (e) { showError('Failed to reset data', e); throw e; }
  },

  removeLocationGroup: async (id) => {
    try {
      await deleteLocationGroup(id);
      await get().loadData();
    } catch (e) { showError('Failed to remove group', e); throw e; }
  },

  removeLocation: async (id) => {
    try {
      await deleteLocation(id);
      await get().loadData();
    } catch (e) { showError('Failed to remove location', e); throw e; }
  },

  removeSection: async (id) => {
    try {
      await deleteSection(id);
      await get().loadData();
    } catch (e) { showError('Failed to remove section', e); throw e; }
  },

  setSelectedCrop: (id) => set({ selectedCropId: id }),

  focusPlannerCrop: (id, focusDate = null) => set({
    plannerFocusCropId: id,
    plannerFocusDate: focusDate,
    selectedCropId: id,
  }),

  clearPlannerFocus: () => set({ plannerFocusCropId: null, plannerFocusDate: null }),

  addTask: async (data: NewTaskData) => {
    try {
      await insertTask(data.crop_instance_id, data.task_type_id, data.day_of_week, data.frequency_weeks, data.start_offset_weeks);
      await get().loadData();
    } catch (e) { showError('Failed to add task', e); throw e; }
  },

  completeTask: async (taskId, weekDate) => {
    try {
      await insertCompletion(taskId, weekDate);
      await get().loadData();
    } catch (e) { showError('Failed to complete task', e); throw e; }
  },

  uncompleteTask: async (taskId, weekDate) => {
    try {
      await deleteCompletion(taskId, weekDate);
      await get().loadData();
    } catch (e) { showError('Failed to uncomplete task', e); throw e; }
  },

  deleteTask: async (taskId) => {
    try {
      await dbDeleteTask(taskId);
      await get().loadData();
    } catch (e) { showError('Failed to delete task', e); throw e; }
  },

  adjustTaskDay: async (taskId, dayOfWeek) => {
    try {
      await updateTaskDay(taskId, dayOfWeek);
      await get().loadData();
    } catch (e) { showError('Failed to adjust task day', e); throw e; }
  },

  saveCellNote: async (cropInstanceId, weekDate, content) => {
    try {
      await upsertNote(cropInstanceId, weekDate, content);
      await get().loadData();
    } catch (e) { showError('Failed to save note', e); throw e; }
  },

  deleteNote: async (noteId) => {
    try {
      await deleteNoteQuery(noteId);
      await get().loadData();
    } catch (e) { showError('Failed to delete note', e); throw e; }
  },

  deleteCrop: async (cropId) => {
    try {
      await deleteCropInstance(cropId);
      set({ selectedCropId: null });
      await get().loadData();
    } catch (e) { showError('Failed to delete crop', e); throw e; }
  },

  addCrop: async (data: NewCropData) => {
    try {
      await insertCropWithStages(data.section_id, data.name, data.plant_count, data.start_date, data.stages);
      await get().loadData();
    } catch (e) { showError('Failed to add crop', e); throw e; }
  },

  editCrop: async (cropId, data) => {
    try {
      await updateCropInstance(cropId, {
        name: data.name,
        plant_count: data.plant_count,
        start_date: data.start_date,
        section_id: data.section_id,
      });
      await replaceCropStages(cropId, data.stages);
      await get().loadData();
    } catch (e) { showError('Failed to save crop', e); throw e; }
  },

  archiveCrop: async (cropId) => {
    try {
      await archiveCropQuery(cropId);
      set({ selectedCropId: null });
      await get().loadData();
    } catch (e) { showError('Failed to archive crop', e); throw e; }
  },

  toggleArchivedRows: () => {
    set(s => ({ showArchivedRows: !s.showArchivedRows }));
    get().loadData();
  },

  loadData: async () => {
    try {
    const calendarStart = get().calendarStart;
    const showArchived  = get().showArchivedRows;

    const [groups, locations, sections, allCrops, stageDefs, taskTypeList, { due: todayDueTasks, overdue: todayOverdueTasks }] = await Promise.all([
      getAllLocationGroups(),
      getAllLocations(),
      getAllSections(),
      getAllCrops(showArchived),
      getStageDefs(),
      getTaskTypes(),
      getTodayAndOverdue(),
    ]);

    const rows: GridRowItem[]           = [];
    const allTaskLines: PrecomputedTaskLine[] = [];
    const notes: Note[] = [];
    let currentTop = 0;

    const pushRow = (row: GridRowItem) => {
      rows.push(row);
      currentTop += getRowHeight(row);
    };

    for (const group of groups) {
      pushRow({ type: 'group_header', group });

      const groupLocations = locations.filter(l => l.location_group_id === group.id);

      for (const location of groupLocations) {
        const locationSections = sections.filter(s => s.location_id === location.id);

        pushRow({ type: 'location_header', location });

        for (const section of locationSections) {
          pushRow({ type: 'section_header', section });

          const crops = allCrops.filter(c => c.section_id === section.id);

          if (crops.length === 0) {
            pushRow({ type: 'section_footer' });
            pushRow({ type: 'section_spacer' });
          }

          for (const crop of crops) {
            const y1 = currentTop;

            const [stages, tasks, completions, cellNotes] = await Promise.all([
              getCropStages(crop.id),
              getTasksForCrop(crop.id),
              getCompletionsForCrop(crop.id),
              getAllNotesForCrop(crop.id),
            ]);

            const notesByWeek: Record<string, Note> = {};
            for (const note of cellNotes) {
              notes.push(note);
              if (note.week_date && !notesByWeek[note.week_date]) {
                notesByWeek[note.week_date] = note;
              }
            }

            // Precompute weekColorMap — O(1) lookup per cell at render time
            const parsedStartDate = (() => {
              const strict = parseDateKey(crop.start_date);
              if (strict) return strict;

              const loose = new Date(crop.start_date);
              if (!isNaN(loose.getTime())) return toSunday(loose);

              return toSunday(new Date());
            })();
            const cropStartWeek = dateToWeekIndex(calendarStart, parsedStartDate);
            const weekColorMap: Record<number, string> = {};
            let cursor = cropStartWeek;
            for (const stage of stages) {
              for (let w = 0; w < stage.duration_weeks; w++) {
                weekColorMap[cursor + w] = stage.color;
              }
              cursor += stage.duration_weeks;
            }
            const cropEndWeek = cursor - 1;

            pushRow({ type: 'crop_row', crop, weekColorMap, tasks, completions, notesByWeek });

            // Precompute task lines for this row — zero work at render time
            const completionSet = new Set(
              completions.map(c => `${c.task_id}:${c.completed_date}`)
            );
            const y2 = y1 + ROW_HEIGHT;

            for (const task of tasks) {
              const occurrences = getTaskLineOccurrences(task, cropStartWeek, cropEndWeek, calendarStart);
              for (const occ of occurrences) {
                allTaskLines.push({
                  key: `t${task.id}-w${occ.weekIndex}`,
                  x: occ.x,
                  y1,
                  y2,
                  color: task.color,
                  dashed: completionSet.has(`${task.id}:${occ.weekSunday}`),
                });
              }
            }
          }

          if (crops.length > 0) {
            pushRow({ type: 'section_footer' });
            pushRow({ type: 'section_spacer' });
          }
        }

        pushRow({ type: 'location_footer' });
      }
      pushRow({ type: 'group_footer' });
    }

    set({
      rows,
      allTaskLines,
      notes,
      todayDueTasks,
      todayOverdueTasks,
      stageDefinitions: stageDefs,
      taskTypes: taskTypeList,
      isLoaded: true,
    });
    } catch (e) { showError('Failed to load data', e); throw e; }
  },
}));
