// Preset task types — each becomes a colored vertical line on the grid.
// Colors match the original VBA app (TaskForm.frm / TaskAssessForm.frm).
// Seeded into SQLite on first launch (Slice 5).

export interface PresetTaskType {
  name: string;
  color: string; // line color on the grid
}

export const PRESET_TASK_TYPES: PresetTaskType[] = [
  { name: 'Watering',     color: '#00CCFF' }, // blue    (VBA: RGB(0, 204, 255))
  { name: 'Fertilizing',  color: '#FF3300' }, // orange  (VBA: RGB(255, 51, 0))
  { name: 'Pest Control', color: '#CC66FF' }, // purple  (VBA: RGB(204, 102, 255))
  { name: 'Foliar Feed',  color: '#FFCC00' }, // yellow  (VBA: RGB(255, 204, 0))
  { name: 'Harvest',      color: '#FF0066' }, // pink
  { name: 'Transplant',   color: '#33FF99' }, // mint
  { name: 'Observation',  color: '#FFFFFF' }, // white
];

export const PRESET_MUSHROOM_TASK_TYPES: PresetTaskType[] = [
  { name: 'Cleaning/Sanitizing',   color: '#E8E8E8' }, // silver-white
  { name: 'Misting',               color: '#64B5F6' }, // sky blue
  { name: 'Fresh Air Exchange',    color: '#A5D6A7' }, // pale green
  { name: 'Contamination Check',   color: '#EF5350' }, // coral red
  { name: 'Mushroom Harvest',      color: '#FFD54F' }, // amber yellow
  { name: 'Spawn Transfer',        color: '#CE93D8' }, // lavender
];
