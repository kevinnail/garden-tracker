# Crop Planner— Bugs Report

**Date:** 2026-04-11
**Mode:** BUGS
**Scope:** `garden-tracker/` Expo app (all `src/**`, `app/**`)

Ordered roughly by severity. Items marked *latent* are correct under current inputs but fragile to future changes or data corruption.

---

## 1. `AddTaskForm` locks `taskTypeId` to `1` when task types load after mount — MEDIUM

**File:** `src/components/forms/AddTaskForm.tsx:22`

```ts
const [taskTypeId, setTaskTypeId] = useState<number>(taskTypes[0]?.id ?? 1);
```

`useState`'s initializer is run once on mount. If the form opens before `taskTypes` is populated in the store (empty array on first open), the initial value falls back to the hardcoded literal `1`. When task types load a moment later, the chips re-render but the selected `taskTypeId` is *not* updated — it stays at `1`. The visually "first" chip may not have id `1`, so a user who submits without tapping a chip silently writes the wrong task type. Worse, if id `1` doesn't exist (e.g. after `resetAllData` + partial re-seed), the `INSERT` fails the FK `tasks.task_type_id → task_types(id)`.

**Fix:** Initialize to `null` and sync via `useEffect` when `taskTypes` arrives; block submit if `taskTypeId == null`.

---

## 2. `defaultCalendarStart` DST drift — LOW/LATENT

**File:** `src/utils/dateUtils.ts:131`

```ts
export function defaultCalendarStart(): Date {
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
  return toSunday(eightWeeksAgo);
}
```

Subtracting a fixed number of milliseconds crosses DST boundaries wrong. If `now` is at local midnight Sunday and 8 weeks back straddles a spring-forward, the returned `Date` is 11:00 pm the previous Saturday *local time*. Then `toSunday` reads `getDay() === 6` and rolls back 6 days, producing a calendar start **9 weeks** before today rather than 8.

Same pattern (less exposed) in `database.ts:153` when computing the demo crop's `startDate`.

**Fix:** Use day-based arithmetic — `const d = new Date(); d.setDate(d.getDate() - 56); return toSunday(d);`.

---

## 3. `getTaskLineOccurrences` has no guard against `frequency_weeks <= 0` — LOW/LATENT

**File:** `src/utils/taskUtils.ts:25`

```ts
while (col <= cropEndWeek) {
  ...
  col += task.frequency_weeks;
}
```

The DB schema enforces `CHECK (frequency_weeks > 0)`, so in the live app this is safe. However:
- If that check is ever loosened or a migration forgets it, the UI thread spins forever.
- Tests that synthesize `Task` objects bypass the DB and could hang the runner.

**Fix:** `col += Math.max(1, task.frequency_weeks);` or assert > 0 at the top.

---

## 4. `CropCell` empty cells swallow short taps — LOW (likely intentional but inconsistent)

**File:** `src/components/planner/CropCell.tsx:33`

```tsx
<Pressable
  onPress={hasNote ? onPress : undefined}
  onLongPress={onLongPress}
```

`GridBody` passes both `onPress` and `onLongPress` for every cell (both opening the note modal at `GridBody.tsx:61`). `CropCell` then silently drops `onPress` unless a note already exists. Result: an empty cell needs a long-press to create a note, but one that already has a note responds to both.

This inconsistency is almost certainly deliberate (stop scrolling taps from creating stray notes), but two things to tighten:
- Comment it so future refactors don't "fix" it.
- `GridBody.tsx:61` constructs an `openNote` callback inline for every cell on every render — even the short-press branch that will be thrown away. Minor perf loss in a very hot loop.

---

## 5. `migrateLegacyHierarchy` toggles `PRAGMA foreign_keys` *inside* a transaction — LATENT

**File:** `src/db/database.ts:72-98`

```ts
await db.withTransactionAsync(async () => {
  await db.runAsync('PRAGMA foreign_keys = OFF');
  ...
  await db.runAsync('PRAGMA foreign_keys = ON');
});
```

Per SQLite docs, `PRAGMA foreign_keys` is a no-op while a transaction is open. The intended "drop FK checks while renaming" effect doesn't happen. Today the `ALTER TABLE RENAME` / `RENAME COLUMN` statements in this block don't actually need FKs off, so nothing currently breaks. But the code is lying to itself — anyone who adds a DDL operation that *does* need FKs off (e.g. a table recreate-and-copy) will find the pragma silently ignored.

**Fix:** Set the pragma outside the transaction, or remove the misleading lines entirely.

---

## 6. `notes` table has no UNIQUE constraint — race in `upsertNote` — LOW

**Files:** `src/db/schema.ts:77`, `src/db/queries/noteQueries.ts:17`

```ts
export async function upsertNote(cropInstanceId, weekDate, content) {
  const existing = await getNoteForCell(...);
  if (existing) { /* UPDATE */ }
  const result = await db.runAsync(`INSERT INTO notes ...`);
}
```

Two concurrent `upsertNote` calls (e.g. user double-taps Save, or a stale React render fires twice) can both read "nothing exists" and both INSERT. There is no `UNIQUE(entity_type, crop_instance_id, week_date)` constraint, so duplicate rows slip in. The subsequent `getNoteForCell` will silently pick the most recent one (`ORDER BY updated_at DESC, id DESC LIMIT 1`), hiding the ghost rows from the UI — they just accumulate.

**Fix:** Add `UNIQUE(entity_type, crop_instance_id, week_date)` and swap the manual upsert for `INSERT ... ON CONFLICT(...) DO UPDATE`.

---

## 7. `AddCropForm` fallback date parse interprets `YYYY-MM-DD` as UTC — LOW/LATENT

**File:** `src/components/forms/AddCropForm.tsx:99`

```ts
setStartDate(parsedStart ?? toSunday(new Date(cropRow.crop.start_date)));
```

`parsedStart` (via `parseDateKey`) is the correct local-midnight code path. The fallback `new Date('2026-04-05')` parses as **UTC** midnight, which in any Western timezone lands on April 4 local time. `toSunday` then snaps to whatever Sunday ≤ April 4.

Today this only bites if `crop.start_date` isn't a strict `YYYY-MM-DD` string — which shouldn't happen because `normalizeStartDate` gates all writes. But the `normalizeStartDate` itself has the same shape (`cropQueries.ts:9-12`), so any legacy row written outside the normalizer on a prior build can land one day off.

Same pattern appears in `plannerStore.ts:376` and `taskQueries.ts:43` — all three should be audited together.

**Fix:** Drop the `new Date(string)` fallback entirely; if `parseDateKey` fails, treat the row as corrupted and fall back to `toSunday(new Date())` explicitly.

---

## 8. `TodayCursor` does not advance across midnight — COSMETIC

**File:** `src/components/planner/TodayCursor.tsx:19`

```ts
const today = new Date();
const col = todayWeekIndex(calendarStart);
```

Computed once at render. A session that stays open past midnight (rare on mobile, possible on landscape/tablet use) shows yesterday's cursor until something triggers a re-render. Same issue in `PlannerToolbar.tsx:20` (`todayLabel`) and `PlannerGrid.tsx:150`.

**Fix:** If worth it, a lightweight `useEffect` that recomputes on day change, or accept the limitation.

---

## 9. Stale comments on row-header widths — DOCS

- `src/constants/layout.ts:10` — comment claims `ROW_HEADER_WIDTH = 200` but actual is `30 + 140 = 170`.
- `src/components/planner/RowHeader.tsx:166` — comment claims `CROP_NAME_WIDTH = 200 - 30 - 24 = 146` but actual is `170 - 30 - 24 = 116`.

Both computations use the imported constant correctly, so the runtime is fine — only the comments mislead. The project's `CLAUDE.md` also still documents `ROW_HEADER_WIDTH = 200`; that file is the authoritative reference the AI tooling reads, so it should be updated or reconciled.

---

## 10. `seedIfNeeded` seeds demo data that `removeDemoData` deletes on the very next line — WASTED WORK

**File:** `src/db/database.ts:22-27`

```ts
const db = await SQLite.openDatabaseAsync('garden_tracker.db');
await initSchema(db);
await seedIfNeeded(db);
await removeDemoData(db);
```

On a fresh install: `seedIfNeeded` inserts `Home / My Garden / Bed 1 / Tomato / stages / tasks / completions`, then `removeDemoData` deletes `Home / My Garden / Bed 1` (which cascades everything except the stage_definitions and task_types). Functionally fine — both flags get set and it never repeats — but every write is throwaway on first launch. If the intent is that task_types and stage_definitions should ship but the hierarchy shouldn't, split those into separate seed steps and skip the demo hierarchy entirely.

---

## 11. `countMissedOccurrences` caps at 12 silently — BEHAVIOR

**File:** `src/db/queries/taskQueries.ts:84`

```ts
for (let i = 0; i < 12; i++) { ... }
```

The dashboard badge reads `"N wks overdue"`. A task neglected 13+ weeks will stop counting at 12 and display "12 wks overdue". Not a crash, but a silently-misleading display for long-abandoned crops. If the intent is to cap at some visible maximum, say "12+ wks overdue"; if not, remove the hard cap.

---

## 12. Redundant (but harmless) manual cascades — DEFENSIVE

**File:** `src/db/queries/locationQueries.ts:64-98`, `cropQueries.ts:183-191`

`deleteSection`, `deleteGarden`, `deleteLocation`, `deleteCropInstance` all hand-delete children in a transaction even though the schema declares `ON DELETE CASCADE`. This is redundant work but also a useful safety belt in case `PRAGMA foreign_keys = ON` is ever bypassed. Not a bug, noted only because the hand-written SQL has to be kept in sync with any future schema changes — a real foot-gun waiting to happen. Consider dropping the manual deletes now that `initSchema` reliably sets the pragma, or at least leaving a comment explaining why both exist.

---

## Non-findings (things I checked and cleared)

- **`GridBody.tsx` band-color switch** — every spacer/header type maps to a color that matches what `RowHeader` draws. The `default: BACKGROUND_COLOR` branch correctly catches `location_spacer` and `crop_row` is handled separately above.
- **`getVisibleRowRange`** — edge case when `scrollY` lands exactly on a row boundary still produces a correct (slightly over-eager) overscan.
- **`ColumnHeader.computeHeaderData` month-boundary logic** — `dayOfMonth <= 7` uniquely identifies one Sunday per month because Sundays are 7 days apart.
- **`getTodayAndOverdue` window boundaries** — `>= overdueFloor` correctly includes the 7-days-ago-exactly case; `daysBack === 0 ? 7 : dayDelta` correctly routes "today is the task day" tasks to the `due` list instead of `overdue`.
- **`updateCropInstance` variadic spread** (`cropQueries.ts:149`) — `runAsync(sql, ...values, id)` is valid; `Object.entries` preserves spread-key order; whitelist filter keeps column names safe from injection.
- **SVG `Pattern id="hatch"` collisions across cells** — scoped per `<Svg>` root, so per-cell duplication is fine.
- **`YEAR_COLORS[Math.abs((currentYear - baseYear) % 2)]`** — handles negative modulo correctly.
