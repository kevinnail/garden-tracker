// Grid dimensions — every component imports from here.
// Changing these values adjusts the entire grid proportionally.

export const CELL_WIDTH = 52;         // px per week column
export const ROW_HEIGHT = 28;         // px per crop row

// Left panel: plant count column + crop name column
export const PLANT_COUNT_WIDTH = 30;
export const CROP_NAME_WIDTH = 140;
export const ROW_HEADER_WIDTH = PLANT_COUNT_WIDTH + CROP_NAME_WIDTH; // 170

// Calendar header rows (stacked at the top)
export const YEAR_ROW_HEIGHT = 10;    // thin color strip showing year boundary
export const MONTH_ROW_HEIGHT = 18;   // month name labels
export const WEEK_ROW_HEIGHT = 18;    // day-of-month numbers
export const TOTAL_HEADER_HEIGHT = YEAR_ROW_HEIGHT + MONTH_ROW_HEIGHT + WEEK_ROW_HEIGHT; // 46

// Total columns rendered — ~3 years of weeks
export const TOTAL_WEEKS = 156;

// Colors
export const BACKGROUND_COLOR = '#1a1a1a'; // near-black canvas behind everything
export const EMPTY_CELL_COLOR = '#2e2e2e'; // dark grey for weeks outside a crop span
export const BORDER_COLOR = '#1a1a1a';     // matches background — cells leave a 1px gap

// Year header strip: alternates each calendar year
// Even offset from calendarStart year → blue, odd → yellow
export const YEAR_COLORS = ['#ADD8E6', '#FFFFE0'] as const; // light blue, light yellow

// Number of placeholder rows shown in Slice 1 before real data is wired up (Slice 5)
export const PLACEHOLDER_ROW_COUNT = 15;

// Discrete zoom levels — only CELL_WIDTH scales (horizontal axis).
// Level 3 is the default (matches the original CELL_WIDTH = 52 constant).
export const ZOOM_LEVELS = [
  { cellWidth: 24, rowHeight: ROW_HEIGHT }, // level 1 — zoomed out max
  // { cellWidth: 32, rowHeight: ROW_HEIGHT }, // level 1 — zoomed out max
  { cellWidth: 32, rowHeight: ROW_HEIGHT }, // level 2
  // { cellWidth: 42, rowHeight: ROW_HEIGHT }, // level 2
  { cellWidth: 52, rowHeight: ROW_HEIGHT }, // level 3 — default
  // { cellWidth: 64, rowHeight: ROW_HEIGHT }, // level 4
  { cellWidth: 78, rowHeight: ROW_HEIGHT }, // level 5 — zoomed in max
  // { cellWidth: 78, rowHeight: ROW_HEIGHT }, // level 5 — zoomed in max
  { cellWidth: 92, rowHeight: ROW_HEIGHT }, // level 5 — zoomed in max

] as const;

export const DEFAULT_ZOOM_LEVEL = 3;
