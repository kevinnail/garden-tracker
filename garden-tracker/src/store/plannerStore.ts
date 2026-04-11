import { create } from 'zustand';
import Toast from 'react-native-toast-message';

import {
  CropStage,
  Garden,
  GridRowItem,
  Location,
  NewCropData,
  NewTaskData,
  Note,
  PrecomputedTaskLine,
  Section,
  StageDefinition,
  Task,
  TaskCompletion,
  TodayTaskItem,
  TaskType,
} from '@/src/types';
import { ROW_HEIGHT } from '@/src/constants/layout';
import { defaultCalendarStart, dateToWeekIndex, parseDateKey, toSunday } from '@/src/utils/dateUtils';
import { getRowHeight } from '../utils/rowLayout';
import { getTaskLineOccurrences } from '@/src/utils/taskUtils';

import { getAllLocations, getAllGardens, getAllSections, insertLocation, insertGarden, insertSection, deleteLocation, deleteGarden, deleteSection } from '@/src/db/queries/locationQueries';
import { archiveCrop as archiveCropQuery,  getAllCrops, getCropStagesForCrops, getStageDefs, insertCropWithStages, deleteCropInstance, replaceCropStages, updateCropInstance } from '@/src/db/queries/cropQueries';
import { getTasksForCrops, getCompletionsForCrops, getTaskTypes, insertTask, insertCompletion, deleteCompletion, deleteTask as dbDeleteTask, updateTaskDay, getTodayAndOverdue } from '@/src/db/queries/taskQueries';
import { deleteNote as deleteNoteQuery, getNotesForCrops, upsertNote } from '@/src/db/queries/noteQueries';
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
  addLocation: (name: string) => Promise<number>;
  addGarden: (locationId: number, name: string) => Promise<number>;
  addSection: (gardenId: number, name: string) => Promise<number>;
  removeLocation: (id: number) => Promise<void>;
  removeGarden: (id: number) => Promise<void>;
  removeSection: (id: number) => Promise<void>;
  ensureDefaultHierarchy: () => Promise<void>;
  resetAllData: () => Promise<void>;
  setSelectedCrop: (id: number | null) => void;
  focusPlannerCrop: (id: number | null, focusDate?: string | null) => void;
  clearPlannerFocus: () => void;
  toggleArchivedRows: () => Promise<void>;
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

  addLocation: async (name) => {
    try {
      const id = await insertLocation(name);
      await get().loadData();
      return id;
    } catch (e) { showError('Failed to add location', e); throw e; }
  },

  addGarden: async (locationId, name) => {
    try {
      const id = await insertGarden(locationId, name);
      await get().loadData();
      return id;
    } catch (e) { showError('Failed to add garden', e); throw e; }
  },

  addSection: async (gardenId, name) => {
    try {
      const id = await insertSection(gardenId, name);
      await get().loadData();
      return id;
    } catch (e) { showError('Failed to add section', e); throw e; }
  },

  ensureDefaultHierarchy: async () => {
    try {
      const sections = await getAllSections();
      if (sections.length > 0) return;
      const locationId = await insertLocation('Home');
      const gardenId = await insertGarden(locationId, 'My Garden');
      await insertSection(gardenId, 'My Section');
      await get().loadData();
    } catch (e) { showError('Failed to set up default hierarchy', e); throw e; }
  },

  resetAllData: async () => {
    try {
      await resetDatabase();
      await get().loadData();
    } catch (e) { showError('Failed to reset data', e); throw e; }
  },

  removeLocation: async (id) => {
    try {
      await deleteLocation(id);
      await get().loadData();
    } catch (e) { showError('Failed to remove location', e); throw e; }
  },

  removeGarden: async (id) => {
    try {
      await deleteGarden(id);
      await get().loadData();
    } catch (e) { showError('Failed to remove garden', e); throw e; }
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

  toggleArchivedRows: async () => {
    set(s => ({ showArchivedRows: !s.showArchivedRows }));
    try {
      await get().loadData();
    } catch (e) { showError('Failed to reload after archive toggle', e); }
  },

  loadData: async () => {
    try {
    const calendarStart = get().calendarStart;
    const showArchived  = get().showArchivedRows;

    const [locations, gardens, sections, allCrops, stageDefs, taskTypeList, { due: todayDueTasks, overdue: todayOverdueTasks }] = await Promise.all([
      getAllLocations(),
      getAllGardens(),
      getAllSections(),
      getAllCrops(showArchived),
      getStageDefs(),
      getTaskTypes(),
      getTodayAndOverdue(),
    ]);

    // Batch-fetch all per-crop data in parallel (fixes N+1 query pattern)
    const cropIds = allCrops.map(c => c.id);
    const [allStages, allTasks, allCompletions, allCellNotes] = await Promise.all([
      getCropStagesForCrops(cropIds),
      getTasksForCrops(cropIds),
      getCompletionsForCrops(cropIds),
      getNotesForCrops(cropIds),
    ]);

    // Pre-index everything by parent key for O(1) lookup in the render loop
    const gardensByLocation = new Map<number, Garden[]>();
    for (const garden of gardens) {
      const arr = gardensByLocation.get(garden.location_id);
      if (arr) arr.push(garden); else gardensByLocation.set(garden.location_id, [garden]);
    }

    const sectionsByGarden = new Map<number, Section[]>();
    for (const sec of sections) {
      const arr = sectionsByGarden.get(sec.garden_id);
      if (arr) arr.push(sec); else sectionsByGarden.set(sec.garden_id, [sec]);
    }

    const cropsBySection = new Map<number, typeof allCrops>();
    for (const crop of allCrops) {
      const arr = cropsBySection.get(crop.section_id);
      if (arr) arr.push(crop); else cropsBySection.set(crop.section_id, [crop]);
    }

    const stagesByCrop = new Map<number, CropStage[]>();
    for (const stage of allStages) {
      const arr = stagesByCrop.get(stage.crop_instance_id);
      if (arr) arr.push(stage); else stagesByCrop.set(stage.crop_instance_id, [stage]);
    }

    const tasksByCrop = new Map<number, Task[]>();
    for (const task of allTasks) {
      const arr = tasksByCrop.get(task.crop_instance_id);
      if (arr) arr.push(task); else tasksByCrop.set(task.crop_instance_id, [task]);
    }

    const completionsByCrop = new Map<number, TaskCompletion[]>();
    for (const comp of allCompletions) {
      const arr = completionsByCrop.get(comp.crop_instance_id);
      if (arr) arr.push(comp); else completionsByCrop.set(comp.crop_instance_id, [comp]);
    }

    const notesByCrop = new Map<number, Note[]>();
    for (const note of allCellNotes) {
      if (note.crop_instance_id == null) continue;
      const arr = notesByCrop.get(note.crop_instance_id);
      if (arr) arr.push(note); else notesByCrop.set(note.crop_instance_id, [note]);
    }

    const rows: GridRowItem[]           = [];
    const allTaskLines: PrecomputedTaskLine[] = [];
    const notes: Note[] = [];
    let currentTop = 0;

    const pushRow = (row: GridRowItem) => {
      rows.push(row);
      currentTop += getRowHeight(row);
    };

    for (const location of locations) {
      pushRow({ type: 'location_header', location });

      const locationGardens = gardensByLocation.get(location.id) ?? [];

      for (const garden of locationGardens) {
        const gardenSections = sectionsByGarden.get(garden.id) ?? [];

        pushRow({ type: 'garden_header', garden });

        for (const section of gardenSections) {
          pushRow({ type: 'section_header', section });

          const crops = cropsBySection.get(section.id) ?? [];

          if (crops.length === 0) {
            pushRow({ type: 'section_footer' });
            pushRow({ type: 'section_spacer' });
          }

          for (const crop of crops) {
            const y1 = currentTop;

            const stages      = stagesByCrop.get(crop.id) ?? [];
            const tasks       = tasksByCrop.get(crop.id) ?? [];
            const completions = completionsByCrop.get(crop.id) ?? [];
            const cellNotes   = notesByCrop.get(crop.id) ?? [];

            const notesByWeek: Record<string, Note> = {};
            for (const note of cellNotes) {
              notes.push(note);
              if (note.week_date && !notesByWeek[note.week_date]) {
                notesByWeek[note.week_date] = note;
              }
            }

            // Precompute weekColorMap — O(1) lookup per cell at render time
            // Strict parse only — never `new Date(string)`, which interprets
            // YYYY-MM-DD as UTC and can land a day off in local time.
            const parsedStartDate = parseDateKey(crop.start_date) ?? toSunday(new Date());
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

        pushRow({ type: 'garden_footer' });
        pushRow({ type: 'garden_spacer' });
      }
      pushRow({ type: 'location_footer' });
      pushRow({ type: 'location_spacer' });
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
