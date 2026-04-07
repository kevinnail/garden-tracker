# Garden Tracker — Implementation Plan

## How to Use This Plan

Each **slice** produces one visible, testable result. Before approving the next slice, verify the current one looks and behaves correctly. Every slice lists exactly which files are created or modified so you know what to review.

Slices 1–4 are rendering-only (no database yet) — the grid must exist before data can be wired to it. From Slice 5 onward every slice is a full vertical: UI → store action → SQLite → visual update.

**You are the code reviewer.** Each slice should be small enough that you can read through the changed files and understand what they do before moving on.

---

## Project Location

The Expo app lives at `garden-tracker/` (this folder). All source paths below are relative to this root.

---

## Manual Package Installs (already done if you followed setup)

```bash
npx expo install expo-sqlite expo-font expo-notifications expo-device expo-constants
npx expo install react-native-reanimated react-native-gesture-handler react-native-svg
npm install zustand date-fns
npm install --save-dev @types/date-fns
```

> **Expo SDK 54 + Reanimated v4 note:** No babel.config.js changes needed. The babel plugin requirement was removed in Reanimated v4.

---

## Architecture Overview

```
┌──────────────┬────────────────────────────────────┐
│   Corner     │  ColumnHeader  (follows scrollX)    │
│  (date label)│  Year strip + Month row + Week row  │
├──────────────┼────────────────────────────────────┤
│  RowHeader   │  GridBody  (pan gesture source)     │
│  (follows    │  Virtualized CropCells              │
│   scrollY)   │  + SVG TaskOverlay on top           │
└──────────────┴────────────────────────────────────┘
```

- **PlannerGrid** owns two Reanimated `SharedValue`s: `scrollX` and `scrollY`
- **GridBody** is the only real scroll target (pan gesture). Header and sidebar follow via `useAnimatedStyle`
- **TaskOverlay** is an SVG layer sitting on top of GridBody — renders task lines and the today cursor
- **Zustand store** holds all data and UI toggle state
- **expo-sqlite** is the local database; all reads/writes go through query functions in `src/db/queries/`

---

## Layout Constants

```typescript
// src/constants/layout.ts
CELL_WIDTH = 52          // px per week column
ROW_HEIGHT = 28          // px per crop row
ROW_HEADER_WIDTH = 200   // left panel: 30px plant count + 170px name
YEAR_ROW_HEIGHT = 10     // top color stripe in header
MONTH_ROW_HEIGHT = 18
WEEK_ROW_HEIGHT = 18
TOTAL_WEEKS = 156        // ~3 years rendered
BACKGROUND_COLOR = '#1a1a1a'
EMPTY_CELL_COLOR = '#333333'
```

---

## Stage & Task Type Presets

```typescript
// src/constants/stages.ts
PRESET_STAGES = [
  { name: 'Seedling',   color: '#90EE90' },  // light green
  { name: 'Vegetative', color: '#00CC00' },  // bright green
  { name: 'Flowering',  color: '#007700' },  // dark green
  { name: 'Fruiting',   color: '#FF8C00' },  // orange
  { name: 'Drying',     color: '#C8A96E' },  // tan
  { name: 'Curing',     color: '#DAA520' },  // gold
  { name: 'Prepare',    color: '#4169E1' },  // blue
]

// src/constants/taskTypes.ts
PRESET_TASK_TYPES = [
  { name: 'Watering',     color: '#00CCFF' },  // blue
  { name: 'Fertilizing',  color: '#FF3300' },  // orange-red
  { name: 'Pest Control', color: '#CC66FF' },  // purple
  { name: 'Foliar Feed',  color: '#FFCC00' },  // yellow
  { name: 'Harvest',      color: '#FF0066' },  // pink
  { name: 'Transplant',   color: '#33FF99' },  // mint
  { name: 'Observation',  color: '#FFFFFF' },  // white
]
```

---

## SQLite Schema (reference — implemented in Slice 5)

```sql
settings           (key TEXT PK, value TEXT)
stage_definitions  (id, name, color, order_index)
task_types         (id, name, color)
location_groups    (id, name, order_index)
locations          (id, location_group_id, name, order_index)
sections           (id, location_id, name, order_index)
crop_instances     (id, section_id, name, plant_count, start_date, archived, notes, created_at, updated_at)
crop_stages        (id, crop_instance_id, stage_definition_id, duration_weeks, order_index)
tasks              (id, crop_instance_id, task_type_id, day_of_week, frequency_weeks, start_offset_weeks, created_at)
task_completions   (id, task_id, completed_date)
notes              (id, entity_type, entity_id, week_date, crop_instance_id, content, created_at, updated_at)
```

`start_date` is always an ISO date string for a Sunday.
`day_of_week`: 0 = Sunday … 6 = Saturday.
`start_offset_weeks`: how many weeks into the crop before task lines start drawing (from VBA `offsetC` param).

---

## VBA Behavioral Reference

When implementing any feature, read the corresponding VBA file first to understand intended behavior.

| Feature | VBA source |
|---|---|
| Calendar header, year colors | `VBA Files/Modules/DrawCalendar3.bas` |
| Month label logic | `VBA Files/Modules/MonthLabel.bas` |
| Stage colors, crop draw | `VBA Files/Class Modules/CropClass.cls` → `Draw()` |
| Past cell hatch | `VBA Files/Modules/Cursor_Update.bas` → `LastWeekFormat2()` |
| Today cursor position | `VBA Files/Modules/Cursor_Update.bas` → `UpdateCursor()` |
| Task line drawing | `VBA Files/Modules/LineStuff.bas` → `drawLines()` |
| Task completion (dashed) | `VBA Files/Modules/LineStuff.bas` → `TaskComplete()` |
| Add crop form | `VBA Files/Forms/CropSetUp.frm` |
| Add location form | `VBA Files/Forms/GardenSetUpForm.frm` |
| Add task form | `VBA Files/Forms/TaskForm.frm` |
| Task assessment | `VBA Files/Forms/TaskAssessForm.frm` |
| Row archive/show | `VBA Files/Modules/RowHideUtility.bas` |

### Key rules extracted from VBA
- Start dates always snap to the most recent Sunday (subtract `dayOfWeek` days)
- Task lines begin at `crop.startDate + start_offset_weeks`, end at `crop.endDate`
- Day x-position within a week cell: `(dayOfWeek / 7) * CELL_WIDTH + CELL_WIDTH / 14`
- Month label appears only on first column where `weekDate.getDate() <= 7` for that month
- Year header alternates light blue `#ADD8E6` / light yellow `#FFFFE0` each calendar year
- Past hatch applies to ALL cells left of today — inside and outside crop spans
- Solid line = task pending. Dashed (`strokeDasharray="3,3"`) = completed

---

## Slices

---

### Slice 1 — Empty scrollable grid

**What you will see:** A dark grid that pans in both directions. The year/month/week header stays frozen at the top. The left panel stays frozen on the left. All cells are empty dark grey. Today's week column is not yet highlighted.

**No database. No real data.**

#### Files created
```
src/constants/layout.ts
src/constants/stages.ts       ← colors only, no DB yet
src/constants/taskTypes.ts    ← colors only, no DB yet
src/types/index.ts
src/utils/dateUtils.ts
src/components/planner/PlannerGrid.tsx
src/components/planner/ColumnHeader.tsx
src/components/planner/RowHeader.tsx
src/components/planner/GridBody.tsx
app/index.tsx                 ← mounts PlannerGrid, clears default template content
```

#### What each file does

**`src/utils/dateUtils.ts`**
```typescript
// All date math lives here. Key exports:
toSunday(date)               // snap any date to previous Sunday
weekIndexToDate(start, i)    // Sunday of week column i
todayWeekIndex(start)        // which column index is "this week"
dayOfWeekIndex(date)         // 0–6 for a given date
dayXOffset(dayOfWeek)        // px from left edge of cell: (day/7)*CELL_WIDTH + CELL_WIDTH/14
```

**`src/components/planner/PlannerGrid.tsx`**
- Owns `scrollX` and `scrollY` as Reanimated `SharedValue<number>`
- Lays out the 4-panel grid (corner, column header, row header, body)
- Passes shared values down to children
- `calendarStart` = Sunday 8 weeks before today (hardcoded for now, DB in Slice 5)

**`src/components/planner/ColumnHeader.tsx`**
- Receives `scrollX`, translates via `useAnimatedStyle` to follow body scroll
- Renders 3 stacked rows:
  1. Year strip: alternating `#ADD8E6` / `#FFFFE0` per calendar year
  2. Month row: month name on first week of each month (`weekDate.getDate() <= 7`)
  3. Week row: `weekDate.getDate()` (day-of-month number) per column
- Only renders visible columns (uses `scrollX` to compute window)

**`src/components/planner/RowHeader.tsx`**
- Receives `scrollY`, translates to follow body scroll
- For Slice 1: renders placeholder rows (no real data yet — just empty label rows to show the panel exists)

**`src/components/planner/GridBody.tsx`**
- Mounts a `GestureDetector` with `Gesture.Pan()` that updates `scrollX` and `scrollY`
- Clamps scroll to valid range
- Renders a grid of empty cells (all `EMPTY_CELL_COLOR`) for visible range only
- Total canvas: `TOTAL_WEEKS * CELL_WIDTH` wide × `rows.length * ROW_HEIGHT` tall (use placeholder row count for now)

#### Verify
- [ ] App opens without errors
- [ ] Grid is dark with a grid of cells visible
- [ ] Panning left/right moves the cells while the top header stays put
- [ ] Panning up/down moves the cells while the left panel stays put
- [ ] Year strip shows alternating blue/yellow bands — you can see a color change where the year turns over
- [ ] Month labels appear at the correct week columns
- [ ] Week day numbers (1, 8, 15, 22, 29…) display in the bottom header row

---

### Slice 2 — Today cursor

**What you will see:** A red vertical line positioned at today's exact day-of-week slot within the correct week column. It spans the full height of the crop area.

**Still no database. Still hardcoded.**

#### Files created / modified
```
src/components/planner/TaskOverlay.tsx    ← created (SVG shell + cursor only)
src/components/planner/TodayCursor.tsx    ← created
src/components/planner/PlannerGrid.tsx    ← modified: mount TaskOverlay
src/utils/dateUtils.ts                    ← modified: add dayXOffset if not already there
```

**`src/components/planner/TodayCursor.tsx`**
- An SVG `<Line>` at `x = todayWeekIndex * CELL_WIDTH + dayXOffset(today.getDay())`
- Red (`#FF0000`), strokeWidth 2
- Small downward-pointing triangle at the top (arrowhead)
- Rendered inside TaskOverlay

**`src/components/planner/TaskOverlay.tsx`**
- Absolutely positioned `<Svg>` covering the full virtual canvas
- Translates with `scrollX`/`scrollY` via `useAnimatedStyle`
- For this slice: renders only `TodayCursor`

#### Verify
- [ ] A red vertical line is visible on the grid
- [ ] It is positioned in today's week column, not at the column edge — it sits inside the cell at today's day-of-week offset
- [ ] If today is Wednesday, the line is roughly 3/7 of the way across a week cell
- [ ] The cursor scrolls with the grid (it's part of the content, not the header)
- [ ] A small arrowhead is visible at the top of the line

---

### Slice 3 — A crop row with stage colors and past hatch

**What you will see:** One hardcoded crop row on the grid. Stage cells are colored (light green seedling, bright green vegetative, dark green flowering). Cells before today's column have a diagonal hatch overlay. Empty cells outside the crop span remain dark grey.

**Still no database.**

#### Files created / modified
```
src/components/planner/CropCell.tsx       ← created
src/utils/stageUtils.ts                   ← created
src/components/planner/GridBody.tsx       ← modified: render hardcoded crop row
src/components/planner/RowHeader.tsx      ← modified: render one hardcoded crop name row
src/types/index.ts                        ← modified: add CropInstance, CropStage, GridRowItem types
```

**`src/components/planner/CropCell.tsx`**

Props: `weekDate: Date`, `stageColor: string | null`, `isPast: boolean`, `hasNote: boolean`

Logic:
- No stage → `backgroundColor: EMPTY_CELL_COLOR`
- Has stage → `backgroundColor: stageColor`
- `isPast` → render diagonal hatch SVG overlay on top (regardless of stage color)
- `hasNote` → small red filled triangle in top-right corner

Diagonal hatch via react-native-svg:
```tsx
<Svg style={StyleSheet.absoluteFill}>
  <Defs>
    <Pattern id="hatch" width="4" height="4" patternTransform="rotate(45)">
      <Line x1="0" y1="0" x2="0" y2="4" stroke="rgba(0,0,0,0.5)" strokeWidth="2"/>
    </Pattern>
  </Defs>
  <Rect width={CELL_WIDTH} height={ROW_HEIGHT} fill="url(#hatch)"/>
</Svg>
```

**`src/utils/stageUtils.ts`**
- `getStageColorAtWeek(stages: CropStage[], weekIndex: number, cropStartWeek: number): string | null`
  - Given a week column index, returns the hex color for whichever stage is active that week, or null if outside the crop span

**Hardcoded crop data for this slice (in GridBody or a temp constant):**
```typescript
const DEMO_CROP = {
  name: 'Tomato',
  plant_count: 6,
  start_date: toSunday(subWeeks(new Date(), 4)).toISOString(), // started 4 weeks ago
  stages: [
    { stage_name: 'Seedling',   color: '#90EE90', duration_weeks: 3 },
    { stage_name: 'Vegetative', color: '#00CC00', duration_weeks: 6 },
    { stage_name: 'Flowering',  color: '#007700', duration_weeks: 8 },
  ],
};
```

#### Verify
- [ ] One crop row is visible on the grid
- [ ] Stage colors are correct: light green → bright green → dark green across the row
- [ ] Cells to the left of today have diagonal hatch over the stage color
- [ ] Empty cells (before crop start and after crop end) are dark grey — no hatch
- [ ] The crop name "Tomato" and plant count "6" appear in the left panel row header
- [ ] The row height and cell width look correct relative to the screenshot in `example-screenshot.png`

---

### Slice 4 — Task lines on the crop row

**What you will see:** Colored vertical lines appearing on the crop row at specific day-of-week positions across the crop span. One line is dashed to represent a completed task.

**Still no database.**

#### Files created / modified
```
src/utils/taskUtils.ts                    ← created
src/components/planner/TaskOverlay.tsx    ← modified: render task lines from hardcoded data
src/types/index.ts                        ← modified: add Task, TaskCompletion types
```

**`src/utils/taskUtils.ts`**
- `getTaskLinePositions(task, cropStartWeekIndex, cropEndWeekIndex, calendarStart)`: returns array of `{ x, weekIndex }` for every occurrence of the task across the crop span
  - Applies `start_offset_weeks`: first line at `cropStartWeekIndex + start_offset_weeks`
  - Applies `frequency_weeks`: every N columns after that
  - Stops at `cropEndWeekIndex`

**TaskOverlay additions:**
For each task line occurrence:
```typescript
const x = weekCol * CELL_WIDTH + dayXOffset(task.day_of_week);
const y_top = rowIndex * ROW_HEIGHT;
const y_bottom = y_top + ROW_HEIGHT;
const isDone = completions.some(c => c.completed_date === weekSunday);
// render: <Line ... strokeDasharray={isDone ? '3,3' : undefined} />
```

**Hardcoded tasks for this slice:**
```typescript
const DEMO_TASKS = [
  { task_type_name: 'Watering',    color: '#00CCFF', day_of_week: 3, frequency_weeks: 1, start_offset_weeks: 0 },
  { task_type_name: 'Fertilizing', color: '#FF3300', day_of_week: 1, frequency_weeks: 2, start_offset_weeks: 1 },
];
// Mark one watering as completed (use a specific week's Sunday date)
const DEMO_COMPLETIONS = [{ task_id: 0, completed_date: '<last sunday ISO string>' }];
```

#### Verify
- [ ] Blue vertical lines appear at Wednesday position in each week cell of the crop span
- [ ] Orange-red lines appear at Monday position every other week (starting week 2)
- [ ] All lines are at the correct day slot — not at cell edges, centered per day
- [ ] One blue line (the completed watering) appears dashed
- [ ] Lines do not extend beyond the crop span
- [ ] Cursor and task lines are both visible simultaneously without overlap issues

---

### Slice 5 — Wire grid to SQLite (first full-stack slice)

**What you will see:** Visually identical to Slice 4, but the crop data and task data now come from the SQLite database. The hardcoded demo data is removed.

**This is the first slice that touches the database.**

#### Files created / modified
```
src/db/database.ts                        ← created: schema creation + seed insert
src/db/queries/locationQueries.ts         ← created
src/db/queries/cropQueries.ts             ← created
src/db/queries/taskQueries.ts             ← created
src/store/plannerStore.ts                 ← created: Zustand store
src/hooks/usePlannerData.ts               ← created
src/components/planner/GridBody.tsx       ← modified: reads from store instead of hardcode
src/components/planner/RowHeader.tsx      ← modified: reads from store
src/components/planner/TaskOverlay.tsx    ← modified: reads from store
app/index.tsx                             ← modified: call usePlannerData on mount
```

**`src/db/database.ts`**
- Opens SQLite DB via `expo-sqlite`
- Runs all `CREATE TABLE IF NOT EXISTS` statements (full schema above)
- Checks `settings` for key `'seeded'`; if absent, inserts preset stages and task types then sets `'seeded' = '1'`
- Also inserts one demo location group → location → section → crop instance → crop stages → two tasks (so the grid shows something on first launch)
- Exports `db` instance for use in queries

**`src/db/queries/cropQueries.ts`**
```typescript
getAllCropInstances()        // returns CropInstance[]
getCropStages(cropId)        // returns CropStage[] with color joined from stage_definitions
getStageDefs()               // returns StageDefinition[]
insertCropInstance(data)     // returns new id
insertCropStage(data)
updateCropInstance(id, data)
archiveCrop(id)
```

**`src/db/queries/taskQueries.ts`**
```typescript
getTasksForCrop(cropInstanceId)    // returns Task[] with color joined from task_types
getTaskTypes()                      // returns TaskType[]
getCompletionsForCrop(cropInstanceId) // returns TaskCompletion[]
insertTask(data)                    // returns new id
insertCompletion(taskId, weekDate)
deleteCompletion(taskId, weekDate)
deleteTask(id)
```

**`src/db/queries/locationQueries.ts`**
```typescript
getAllLocationGroups()   // returns LocationGroup[]
getAllLocations()        // returns Location[]
getAllSections()         // returns Section[]
insertLocationGroup(name)
insertLocation(groupId, name)
insertSection(locationId, name)
```

**`src/store/plannerStore.ts`** (Zustand)
```typescript
interface PlannerState {
  rows: GridRowItem[];            // what the grid renders
  calendarStartDate: Date;
  stageDefinitions: StageDefinition[];
  taskTypes: TaskType[];
  showCursor: boolean;
  showArchivedRows: boolean;

  loadData: () => Promise<void>;  // reads DB, builds rows array, sets state
  toggleCursor: () => void;
  toggleArchivedRows: () => void;
}
```

`loadData()` assembles `GridRowItem[]` by:
1. Loading location groups → locations → sections
2. For each section, loading its crop instances (filtered by `archived` if `showArchivedRows` is false)
3. For each crop, loading its stages and tasks
4. Building the flat array: `[group_header, section_header, crop_row, crop_row, ...]`

**`src/hooks/usePlannerData.ts`**
```typescript
export function usePlannerData() {
  const loadData = usePlannerStore(s => s.loadData);
  useEffect(() => { loadData(); }, []);
}
```

**`src/types/index.ts`** — finalize all types:
```typescript
LocationGroup, Location, Section
StageDefinition, TaskType
CropInstance, CropStage, Task, TaskCompletion, Note
GridRowItem  // union: group_header | section_header | crop_row
NewCropData, NewTaskData  // input shapes for insert functions
```

#### Verify
- [ ] Grid renders the same visually as after Slice 4
- [ ] Open SQLite (using Expo DevTools or a DB viewer) — you can see rows in all tables
- [ ] No hardcoded demo data remains in component files
- [ ] Reloading the app shows the same data (it's persisted)

---

### Slice 6 — Add a crop

**What you do:** Tap the "+ Crop" button. Fill in name, plant count, start date, section, and stage list. Submit. The new crop row appears on the grid at the correct week position with the correct stage colors.

**Trigger → Store → DB → Grid**

#### Files created / modified
```
src/components/forms/AddCropForm.tsx      ← created
app/(modals)/add-crop.tsx                 ← created
app/(modals)/_layout.tsx                  ← created (modal stack config)
src/components/toolbar/PlannerToolbar.tsx ← created
src/db/queries/cropQueries.ts             ← modified: insertCropInstance, insertCropStage
src/store/plannerStore.ts                 ← modified: add addCrop() action
app/index.tsx                             ← modified: mount toolbar
```

**`src/components/forms/AddCropForm.tsx`**

Fields:
- Crop name (TextInput)
- Plant count (numeric TextInput)
- Start date (DateTimePicker or text input, snapped to Sunday on submit)
- Section (Picker built from `locationQueries.getAllSections()`)
- Stage list: each row has a stage type picker + week count input; "Add Stage" appends a row; "Remove" deletes a row
- Default stages pre-filled: Seedling 2wk, Vegetative 4wk, Flowering 8wk

On submit:
1. Snap start date to Sunday via `toSunday()`
2. Validate: name not empty, at least one stage, plant count > 0
3. Call `plannerStore.addCrop(data)`
4. Close modal

**`plannerStore.addCrop(data: NewCropData)`:**
1. `insertCropInstance(...)` → get new `id`
2. For each stage in order: `insertCropStage({ crop_instance_id: id, ... })`
3. Call `loadData()` to rebuild `rows`

**`src/components/toolbar/PlannerToolbar.tsx`**

For this slice: one button — "+ Crop" — that navigates to `/(modals)/add-crop`.
(More buttons added in later slices.)

#### Verify
- [ ] "+ Crop" button is visible on the planner screen
- [ ] Tapping it opens the add crop modal
- [ ] Filling in the form and submitting closes the modal
- [ ] New crop row appears on the grid at the start date you entered
- [ ] Stage colors are correct for the stages you defined
- [ ] If you entered a start date 2 weeks ago, those past cells show diagonal hatch
- [ ] Plant count and crop name appear in the left panel
- [ ] Data persists after reloading the app

---

### Slice 7 — Add a task to a crop

**What you do:** Long-press a crop row. A form opens. Choose task type, day of week, frequency, and start offset. Submit. Colored vertical lines appear across that crop's span.

**Trigger → Store → DB → SVG overlay update**

#### Files created / modified
```
src/components/forms/AddTaskForm.tsx      ← created
app/(modals)/add-task.tsx                 ← created
src/db/queries/taskQueries.ts             ← modified: insertTask
src/store/plannerStore.ts                 ← modified: add addTask(), selectedCropId state
src/components/planner/GridBody.tsx       ← modified: long-press crop row sets selectedCropId
src/components/toolbar/PlannerToolbar.tsx ← modified: add "Tasks" button (opens when crop selected)
```

**`src/components/forms/AddTaskForm.tsx`**

Fields:
- Task type (Picker from `task_types` table — shows colored dot + name)
- Day of week (7 toggle buttons: S M T W T F S)
- Frequency (4 buttons: Every week / 2 weeks / 3 weeks / 4 weeks)
- Start offset (stepper 0–6 with label "Skip first N weeks")
- Crop name shown at top (read-only, confirms which crop this is for)

On submit:
1. Validate: task type selected, day selected
2. Call `plannerStore.addTask(data)`
3. Close modal

**`plannerStore.addTask(data: NewTaskData)`:**
1. `insertTask(data)` → new `id`
2. Call `loadData()`

#### Verify
- [ ] Long-pressing a crop row highlights it (visual selection feedback)
- [ ] "Tasks" toolbar button becomes active / tappable after selecting a crop
- [ ] Task form opens with correct crop name shown
- [ ] After submitting, task lines appear across the crop span
- [ ] Lines are at the correct day-of-week position within each week cell
- [ ] Frequency is respected — every-2-weeks tasks show on alternating columns only
- [ ] Start offset is respected — lines don't appear on first N weeks if offset > 0
- [ ] Task type color matches the selection (blue for Watering, etc.)

---

### Slice 8 — Mark a task complete / incomplete

**What you do:** Long-press a crop row → task list opens. Select a task from the list. Tap "Mark Complete." That week's task line becomes dashed on the grid. Tap "Mark Incomplete" to reverse it.

**Trigger → Store → DB → SVG line style update**

#### Files created / modified
```
src/components/forms/TaskAssessForm.tsx   ← created
app/(modals)/manage-tasks.tsx             ← created
src/db/queries/taskQueries.ts             ← modified: insertCompletion, deleteCompletion, deleteTask
src/store/plannerStore.ts                 ← modified: completeTask(), uncompleteTask(), deleteTask()
```

**`src/components/forms/TaskAssessForm.tsx`**

Displays a list of all tasks on the selected crop. Each item shows:
- Color dot + task type name
- Day of week label
- Next scheduled date
- Status badge: "Due" or "Done"

Actions per item:
- Mark Complete (inserts `task_completions` row with this week's Sunday date)
- Mark Incomplete (deletes that `task_completions` row)
- Delete Task (with confirmation prompt) — removes the task and all its completions
- Adjust day ±1 (spin arrows — updates `tasks.day_of_week`)

**`plannerStore.completeTask(taskId, weekDate)`:**
1. `insertCompletion(taskId, weekDate)`
2. `loadData()`

**`plannerStore.uncompleteTask(taskId, weekDate)`:**
1. `deleteCompletion(taskId, weekDate)`
2. `loadData()`

#### Verify
- [ ] Long-pressing a crop opens the task list
- [ ] All tasks for that crop are listed with correct names and colors
- [ ] Marking a task complete: the corresponding task line on the grid becomes dashed
- [ ] Marking it incomplete: the line becomes solid again
- [ ] Deleting a task: all lines for that task disappear from the grid
- [ ] Adjusting day: lines visually shift to the new day position

---

### Slice 9 — Add location hierarchy

**What you do:** Create a location group, a location inside it, and a section inside that. The group and section header rows appear in the left panel. Crops added to that section appear grouped under it.

**Trigger → Store → DB → RowHeader renders new rows**

#### Files created / modified
```
src/components/forms/AddLocationForm.tsx  ← created (handles group, location, and section)
app/(modals)/add-location.tsx             ← created
src/db/queries/locationQueries.ts         ← modified: inserts + deletes
src/store/plannerStore.ts                 ← modified: addLocationGroup(), addLocation(), addSection()
src/components/toolbar/PlannerToolbar.tsx ← modified: add "+ Location" button
src/components/planner/RowHeader.tsx      ← modified: render group/section headers from store data
```

**`src/components/planner/RowHeader.tsx`** — group/section header rows:
- `group_header` row: dark green background (`#1a3a1a`), bold white group name, full panel width
- `section_header` row: medium grey background (`#2a2a2a`), section name, indented
- `crop_row`: plant count (right-aligned) + crop name (left-aligned)

**`src/components/forms/AddLocationForm.tsx`**

Three modes controlled by a tab or segmented control at top:
1. New Group — just a name input
2. New Location — name input + group picker
3. New Section — name input + location picker

#### Verify
- [ ] "+ Location" button opens the form
- [ ] Creating a group adds a dark green header row in the left panel
- [ ] Creating a location+section inside that group adds a grey section header below the group
- [ ] Adding a crop with that section selected places it under the correct section header in the grid
- [ ] The visual hierarchy matches the screenshot: group → section → crop rows indented/grouped

---

### Slice 10 — Edit crop, archive, and row toggle

**What you do:** Long-press a crop name in the left panel → edit form opens pre-filled. Change stage durations or name → grid updates. Tap "Archive" → row disappears. Toolbar toggle → archived rows reappear.

**Trigger → Store → DB → rows rebuilt**

#### Files created / modified
```
src/components/forms/AddCropForm.tsx      ← modified: add edit mode (pre-fill from existing crop)
app/(modals)/edit-crop.tsx                ← created
src/db/queries/cropQueries.ts             ← modified: updateCropInstance, updateCropStages, archiveCrop
src/store/plannerStore.ts                 ← modified: editCrop(), archiveCrop(), toggleArchivedRows()
src/components/planner/RowHeader.tsx      ← modified: long-press crop name → navigate to edit-crop
src/components/toolbar/PlannerToolbar.tsx ← modified: add archive toggle button
```

**Edit mode in AddCropForm:** If `cropId` prop is provided, pre-populate all fields. On submit, call `plannerStore.editCrop()` instead of `addCrop()`.

**`plannerStore.editCrop(id, data)`:**
1. `updateCropInstance(id, { name, plant_count, start_date })`
2. Delete existing `crop_stages` for this crop
3. Re-insert new `crop_stages` in order
4. `loadData()`

**`plannerStore.archiveCrop(id)`:**
1. `updateCropInstance(id, { archived: 1 })`
2. `loadData()` — if `showArchivedRows` is false, this crop disappears from `rows`

**`plannerStore.toggleArchivedRows()`:**
1. Flip `showArchivedRows` bool
2. `loadData()` — rebuilds rows with or without archived crops

#### Verify
- [ ] Long-pressing crop name opens edit form pre-filled with existing values
- [ ] Changing stage durations updates the colored spans on the grid
- [ ] Changing start date shifts the crop's position on the timeline
- [ ] Tapping Archive closes the form and the crop row disappears
- [ ] Toolbar archive toggle makes archived crops reappear (greyed or normal)
- [ ] Re-toggling hides them again

---

### Slice 11 — Notes on week cells

**What you do:** Long-press a week cell on a crop row. A note editor opens. Type a note and save. A small red triangle appears in the top-right corner of that cell. Tapping the triangle opens the note to read or edit it. Clearing the text deletes the note.

**Trigger → Store → DB → red triangle renders in CropCell**

#### Files created / modified
```
src/db/queries/noteQueries.ts             ← created
src/store/plannerStore.ts                 ← modified: addNote(), updateNote(), deleteNote(), notes state
src/components/planner/CropCell.tsx       ← modified: long-press → open note modal; show triangle
app/(modals)/cell-note.tsx                ← created
```

**`src/db/queries/noteQueries.ts`**
```typescript
getNoteForCell(cropInstanceId, weekDate)   // returns Note | null
upsertNote(cropInstanceId, weekDate, content)
deleteNote(id)
getAllNotesForCrop(cropInstanceId)         // used to populate hasNote flags
```

**CropCell changes:**
- On long-press: navigate to `/(modals)/cell-note` passing `{ cropInstanceId, weekDate }`
- If `hasNote` prop is true: render red filled triangle (SVG polygon) in top-right corner

**`app/(modals)/cell-note.tsx`**
- Shows existing note text if one exists
- TextInput for editing
- Save button: upsert note → `loadData()` → close
- Delete button (or clearing text triggers delete on save)

**`plannerStore`:**
Load notes for all crops during `loadData()` and include `hasNote: boolean` per `(cropInstanceId, weekDate)` combination. Pass this into `GridRowItem` so `CropCell` can receive it.

#### Verify
- [ ] Long-pressing a week cell opens the note editor
- [ ] Saving a note closes the modal and a red triangle appears in that cell
- [ ] Tapping the triangle opens the note and shows the saved text
- [ ] Editing and saving updates the text
- [ ] Clearing the text and saving removes the triangle
- [ ] Notes on different cells of the same crop are independent
- [ ] Notes persist after reloading the app

---

### Slice 12 — Today dashboard

**What you will see:** A second tab/screen listing tasks that are due today and overdue tasks from the past 7 days that were never marked complete. Tapping a task navigates to the planner and scrolls to that crop row.

#### Files created / modified
```
app/(tabs)/today.tsx                      ← created
app/(tabs)/_layout.tsx                    ← created or modified (add Today tab)
src/db/queries/taskQueries.ts             ← modified: getDueToday(), getOverdue()
```

**`getDueToday()`:** returns tasks where `day_of_week = today.getDay()` and no `task_completions` row exists for this week's Sunday date.

**`getOverdue()`:** same but `completed_date` is within the past 7 Sundays and still incomplete.

**`app/(tabs)/today.tsx`:**
- Two sections: "Due Today" and "Overdue"
- Each item: color dot, task type, crop name, section name
- Tap item: switch to planner tab and scroll to that crop row (pass `cropId` to planner, which scrolls `scrollY` to that row's position)

#### Verify
- [ ] Today tab shows tasks due on the current day of the week
- [ ] Overdue section shows tasks from recent weeks that were never completed
- [ ] Marking a task complete from the planner removes it from Today
- [ ] Tapping a task in Today navigates to its row in the planner

---

### Slice 13 — Crop drag to shift timeline

**What you do:** Long-press + horizontal drag on a crop row in the grid. The crop shifts left or right in week increments. Release to confirm. All task lines follow.

#### Files created / modified
```
src/components/planner/GridBody.tsx       ← modified: add crop row drag gesture
src/db/queries/cropQueries.ts             ← modified: updateStartDate
src/store/plannerStore.ts                 ← modified: shiftCrop(id, weekDelta)
```

- Drag gesture on crop rows (separate from the grid pan gesture — distinguish by long-press activation)
- While dragging: render ghost preview of new position
- On release: `shiftCrop(id, weekDelta)` — updates `start_date` by `weekDelta * 7` days, calls `loadData()`
- Tasks automatically follow since they're computed from `start_date`

#### Verify
- [ ] Long-press + drag on a crop row moves it left or right
- [ ] A ghost preview shows the destination position while dragging
- [ ] Releasing snaps to the nearest week column
- [ ] Stage colors shift with the crop
- [ ] Task lines shift with the crop
- [ ] New start date is persisted (reload confirms)

---

### Slice 14 — Notifications

**Goal:** Daily push notification summarizing tasks due today.

#### Files created / modified
```
src/notifications/scheduler.ts            ← created
app/_layout.tsx                           ← modified: request permission on first launch
```

- Request notification permission on first launch via `expo-notifications`
- Schedule a daily local notification at a user-configurable time (default 7am)
- Notification body: "You have N tasks due today" — tapping opens the Today tab

---

### Slice 15 — Accounts + cloud sync (post-MVP)

Backend: Node.js / Express / PostgreSQL per `SPEC.MD`. User auth, data sync. Not planned in detail here — implement after all local slices are complete and the app is stable.

---

## File Map (complete)

```
app/
  _layout.tsx
  index.tsx
  (tabs)/
    _layout.tsx
    today.tsx
  (modals)/
    _layout.tsx
    add-crop.tsx
    edit-crop.tsx
    add-location.tsx
    add-task.tsx
    manage-tasks.tsx
    cell-note.tsx

src/
  constants/
    layout.ts
    stages.ts
    taskTypes.ts
  types/
    index.ts
  utils/
    dateUtils.ts
    stageUtils.ts
    taskUtils.ts
  db/
    database.ts
    queries/
      locationQueries.ts
      cropQueries.ts
      taskQueries.ts
      noteQueries.ts
  store/
    plannerStore.ts
  hooks/
    usePlannerData.ts
  components/
    planner/
      PlannerGrid.tsx
      ColumnHeader.tsx
      RowHeader.tsx
      GridBody.tsx
      CropCell.tsx
      TaskOverlay.tsx
      TodayCursor.tsx
    forms/
      AddCropForm.tsx
      AddLocationForm.tsx
      AddTaskForm.tsx
      TaskAssessForm.tsx
    toolbar/
      PlannerToolbar.tsx
  notifications/
    scheduler.ts
```
