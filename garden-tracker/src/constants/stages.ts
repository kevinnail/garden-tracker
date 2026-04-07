// Preset crop growth stages.
// These are seeded into the SQLite database on first launch (Slice 5).
// Colors match the original VBA app: light green → bright green → dark green progression.

export interface PresetStage {
  name: string;
  color: string;
  order_index: number;
}

export const PRESET_STAGES: PresetStage[] = [
  { name: 'Seedling',   color: '#90EE90', order_index: 0 }, // light green  (VBA ColorIndex 35)
  { name: 'Vegetative', color: '#00CC00', order_index: 1 }, // bright green (VBA ColorIndex 4 / RGB 65280)
  { name: 'Flowering',  color: '#007700', order_index: 2 }, // dark green   (VBA ColorIndex 10)
  { name: 'Fruiting',   color: '#FF8C00', order_index: 3 }, // orange
  { name: 'Drying',     color: '#C8A96E', order_index: 4 }, // tan
  { name: 'Curing',     color: '#DAA520', order_index: 5 }, // gold
  { name: 'Prepare',    color: '#4169E1', order_index: 6 }, // blue         (VBA ColorIndex 5)
];
