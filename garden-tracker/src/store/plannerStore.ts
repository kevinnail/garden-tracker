import { create } from 'zustand';

import {
  GridRowItem,
  PrecomputedTaskLine,
  StageDefinition,
  TaskType,
} from '@/src/types';
import { ROW_HEIGHT } from '@/src/constants/layout';
import { defaultCalendarStart, dateToWeekIndex, parseDateKey, toSunday } from '@/src/utils/dateUtils';
import { getStageColorAtWeek } from '@/src/utils/stageUtils';
import { getTaskLineOccurrences } from '@/src/utils/taskUtils';

import { getAllLocationGroups, getAllLocations, getAllSections, insertLocationGroup, insertLocation, insertSection, deleteLocationGroup, deleteLocation, deleteSection } from '@/src/db/queries/locationQueries';
import { getCropsForSection, getCropStages, getStageDefs, insertCropInstance, insertCropStage, deleteCropInstance } from '@/src/db/queries/cropQueries';
import { getTasksForCrop, getCompletionsForCrop, getTaskTypes, insertTask, insertCompletion, deleteCompletion, deleteTask as dbDeleteTask, updateTaskDay } from '@/src/db/queries/taskQueries';
import { NewCropData, NewTaskData } from '@/src/types';

interface PlannerState {
  rows: GridRowItem[];
  allTaskLines: PrecomputedTaskLine[];
  calendarStart: Date;
  stageDefinitions: StageDefinition[];
  taskTypes: TaskType[];
  showArchivedRows: boolean;
  isLoaded: boolean;
  selectedCropId: number | null;

  loadData: () => Promise<void>;
  addCrop: (data: NewCropData) => Promise<void>;
  deleteCrop: (cropId: number) => Promise<void>;
  addTask: (data: NewTaskData) => Promise<void>;
  completeTask: (taskId: number, weekDate: string) => Promise<void>;
  uncompleteTask: (taskId: number, weekDate: string) => Promise<void>;
  deleteTask: (taskId: number) => Promise<void>;
  adjustTaskDay: (taskId: number, dayOfWeek: number) => Promise<void>;
  addLocationGroup: (name: string) => Promise<void>;
  addLocation: (groupId: number, name: string) => Promise<void>;
  addSection: (locationId: number, name: string) => Promise<void>;
  removeLocationGroup: (id: number) => Promise<void>;
  removeLocation: (id: number) => Promise<void>;
  removeSection: (id: number) => Promise<void>;
  setSelectedCrop: (id: number | null) => void;
  toggleArchivedRows: () => void;
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  rows: [],
  allTaskLines: [],
  calendarStart: defaultCalendarStart(),
  stageDefinitions: [],
  taskTypes: [],
  showArchivedRows: false,
  isLoaded: false,
  selectedCropId: null,

  addLocationGroup: async (name) => {
    await insertLocationGroup(name);
    await get().loadData();
  },

  addLocation: async (groupId, name) => {
    await insertLocation(groupId, name);
    await get().loadData();
  },

  addSection: async (locationId, name) => {
    await insertSection(locationId, name);
    await get().loadData();
  },

  removeLocationGroup: async (id) => {
    await deleteLocationGroup(id);
    await get().loadData();
  },

  removeLocation: async (id) => {
    await deleteLocation(id);
    await get().loadData();
  },

  removeSection: async (id) => {
    await deleteSection(id);
    await get().loadData();
  },

  setSelectedCrop: (id) => set({ selectedCropId: id }),

  addTask: async (data: NewTaskData) => {
    await insertTask(data.crop_instance_id, data.task_type_id, data.day_of_week, data.frequency_weeks, data.start_offset_weeks);
    await get().loadData();
  },

  completeTask: async (taskId, weekDate) => {
    await insertCompletion(taskId, weekDate);
    await get().loadData();
  },

  uncompleteTask: async (taskId, weekDate) => {
    await deleteCompletion(taskId, weekDate);
    await get().loadData();
  },

  deleteTask: async (taskId) => {
    await dbDeleteTask(taskId);
    await get().loadData();
  },

  adjustTaskDay: async (taskId, dayOfWeek) => {
    await updateTaskDay(taskId, dayOfWeek);
    await get().loadData();
  },

  deleteCrop: async (cropId) => {
    await deleteCropInstance(cropId);
    set({ selectedCropId: null });
    await get().loadData();
  },

  addCrop: async (data: NewCropData) => {
    const cropId = await insertCropInstance(data.section_id, data.name, data.plant_count, data.start_date);
    for (let i = 0; i < data.stages.length; i++) {
      await insertCropStage(cropId, data.stages[i].stage_definition_id, data.stages[i].duration_weeks, i);
    }
    await get().loadData();
  },

  toggleArchivedRows: () => {
    set(s => ({ showArchivedRows: !s.showArchivedRows }));
    get().loadData();
  },

  loadData: async () => {
    const calendarStart = get().calendarStart;
    const showArchived  = get().showArchivedRows;

    const [groups, locations, sections, stageDefs, taskTypeList] = await Promise.all([
      getAllLocationGroups(),
      getAllLocations(),
      getAllSections(),
      getStageDefs(),
      getTaskTypes(),
    ]);

    const rows: GridRowItem[]           = [];
    const allTaskLines: PrecomputedTaskLine[] = [];

    for (const group of groups) {
      rows.push({ type: 'group_header', group });

      const groupLocations = locations.filter(l => l.location_group_id === group.id);

      for (const location of groupLocations) {
        const locationSections = sections.filter(s => s.location_id === location.id);

        rows.push({ type: 'location_header', location });

        for (const section of locationSections) {
          rows.push({ type: 'section_header', section });

          const crops = await getCropsForSection(section.id, showArchived);

          if (crops.length === 0) {
            rows.push({ type: 'section_footer' });
          }

          for (const crop of crops) {
            const rowIndex = rows.length; // this row's position in the flat list

            const [stages, tasks, completions] = await Promise.all([
              getCropStages(crop.id),
              getTasksForCrop(crop.id),
              getCompletionsForCrop(crop.id),
            ]);

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

            rows.push({ type: 'crop_row', crop, weekColorMap, tasks, completions });

            // Precompute task lines for this row — zero work at render time
            const completionSet = new Set(
              completions.map(c => `${c.task_id}:${c.completed_date}`)
            );
            const y1 = rowIndex * ROW_HEIGHT;
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
            rows.push({ type: 'section_footer' });
          }
        }

        rows.push({ type: 'location_footer' });
      }
      rows.push({ type: 'group_footer' });
    }

    set({ rows, allTaskLines, stageDefinitions: stageDefs, taskTypes: taskTypeList, isLoaded: true });
  },
}));
