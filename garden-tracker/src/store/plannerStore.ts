import { create } from 'zustand';

import {
  GridRowItem,
  PrecomputedTaskLine,
  StageDefinition,
  TaskType,
} from '@/src/types';
import { ROW_HEIGHT } from '@/src/constants/layout';
import { defaultCalendarStart, dateToWeekIndex } from '@/src/utils/dateUtils';
import { getStageColorAtWeek } from '@/src/utils/stageUtils';
import { getTaskLineOccurrences } from '@/src/utils/taskUtils';

import { getAllLocationGroups, getAllLocations, getAllSections } from '@/src/db/queries/locationQueries';
import { getCropsForSection, getCropStages, getStageDefs } from '@/src/db/queries/cropQueries';
import { getTasksForCrop, getCompletionsForCrop, getTaskTypes } from '@/src/db/queries/taskQueries';

interface PlannerState {
  rows: GridRowItem[];
  allTaskLines: PrecomputedTaskLine[];
  calendarStart: Date;
  stageDefinitions: StageDefinition[];
  taskTypes: TaskType[];
  showArchivedRows: boolean;
  isLoaded: boolean;

  loadData: () => Promise<void>;
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

        for (const section of locationSections) {
          rows.push({ type: 'section_header', section, location });

          const crops = await getCropsForSection(section.id, showArchived);

          for (const crop of crops) {
            const rowIndex = rows.length; // this row's position in the flat list

            const [stages, tasks, completions] = await Promise.all([
              getCropStages(crop.id),
              getTasksForCrop(crop.id),
              getCompletionsForCrop(crop.id),
            ]);

            // Precompute weekColorMap — O(1) lookup per cell at render time
            const cropStartWeek = dateToWeekIndex(calendarStart, new Date(crop.start_date));
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
        }
      }
    }

    set({ rows, allTaskLines, stageDefinitions: stageDefs, taskTypes: taskTypeList, isLoaded: true });
  },
}));
