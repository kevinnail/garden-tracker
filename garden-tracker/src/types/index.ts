// All shared TypeScript types for the app.
// Slices 1-4 use only GridRowItem (placeholder variant).
// Full entity types (CropInstance, Task, etc.) are used from Slice 5 onward.

// ---------------------------------------------------------------------------
// Database entity types (populated from SQLite in Slice 5+)
// ---------------------------------------------------------------------------

export interface LocationGroup {
  id: number;
  name: string;
  order_index: number;
}

export interface Location {
  id: number;
  location_group_id: number;
  name: string;
  order_index: number;
}

export interface Section {
  id: number;
  location_id: number;
  name: string;
  order_index: number;
}

export interface StageDefinition {
  id: number;
  name: string;
  color: string; // hex
  order_index: number;
}

export interface TaskType {
  id: number;
  name: string;
  color: string; // hex
}

export interface CropInstance {
  id: number;
  name: string;
  plant_count: number;
  start_date: string; // ISO date string, always a Sunday
  section_id: number;
  archived: boolean;
  notes?: string;
}

// A single stage block on a crop row, joined with stage_definitions color
export interface CropStage {
  id: number;
  crop_instance_id: number;
  stage_definition_id: number;
  duration_weeks: number;
  order_index: number;
  color: string;       // joined from stage_definitions
  stage_name: string;  // joined from stage_definitions
}

// A recurring task definition for a crop row, joined with task_types color
export interface Task {
  id: number;
  crop_instance_id: number;
  task_type_id: number;
  day_of_week: number;          // 0=Sun … 6=Sat
  frequency_weeks: number;      // draw a line every N weeks
  start_offset_weeks: number;   // skip first N weeks before drawing lines (VBA offsetC)
  color: string;                // joined from task_types
  task_type_name: string;       // joined from task_types
}

export interface TaskCompletion {
  id: number;
  task_id: number;
  completed_date: string; // ISO date — the Sunday of the week this was completed
}

export interface Note {
  id: number;
  entity_type: 'crop_instance' | 'task' | 'week_cell';
  entity_id?: number;
  week_date?: string;
  crop_instance_id?: number;
  content: string;
}

// ---------------------------------------------------------------------------
// Grid row types — the flat list that PlannerGrid renders
// ---------------------------------------------------------------------------

export type GridRowItem =
  | { type: 'group_header';    group: LocationGroup }
  | { type: 'group_footer' }
  | { type: 'location_header'; location: Location }
  | { type: 'location_footer' }
  | { type: 'section_header';  section: Section }
  | { type: 'section_footer' }
  | { type: 'crop_row';        crop: CropInstance; weekColorMap: Record<number, string>; tasks: Task[]; completions: TaskCompletion[] }
  | { type: 'placeholder';     index: number };

// Precomputed task line ready to hand directly to the SVG renderer — zero work at render time
export interface PrecomputedTaskLine {
  key: string;
  x: number;
  y1: number;
  y2: number;
  color: string;
  dashed: boolean;
}

// ---------------------------------------------------------------------------
// Input shapes for store actions (Slice 5+)
// ---------------------------------------------------------------------------

export interface NewCropData {
  name: string;
  plant_count: number;
  start_date: string; // ISO Sunday
  section_id: number;
  stages: { stage_definition_id: number; duration_weeks: number }[];
}

export interface NewTaskData {
  crop_instance_id: number;
  task_type_id: number;
  day_of_week: number;
  frequency_weeks: number;
  start_offset_weeks: number;
}
