# Refactor & Tech Debt Backlog

Findings from code review 2026-04-09. Full report: `.claude/reports/code-review-2026-04-09.md`.

Check off items as completed so sessions can resume without re-investigation.

---

## High Priority — Data Integrity

### ~~1. Cascade deletes not in transactions~~ ✅
**Files:** `src/db/queries/locationQueries.ts`, `src/db/queries/cropQueries.ts`

`deleteLocationGroup`, `deleteLocation`, `deleteSection`, and `deleteCropInstance` each run a chain of sequential `runAsync` calls. If the app crashes mid-chain the DB is left with orphaned rows (e.g. crop rows with no parent section).

**Fix:** Wrap each cascade delete in `withTransactionAsync` (same pattern already used in `seedIfNeeded`).

---

### ~~2. `addCrop` inserts stages outside a transaction~~ ✅
**File:** `src/store/plannerStore.ts:158–164`

```ts
const cropId = await insertCropInstance(...);
for (const stage of data.stages) {
  await insertCropStage(cropId, ...);
}
```

A crash after `insertCropInstance` but before all stages are inserted leaves a crop with incomplete stages.

**Fix:** Move crop + stages insert into a single `withTransactionAsync` call in `cropQueries.ts`, returning the new crop ID.

---

## Medium Priority — Performance / Correctness

### ~~3. Double DB fetch in `getDueToday` + `getOverdue`~~ ✅
**File:** `src/db/queries/taskQueries.ts`

Both functions independently call `getDashboardTasks()` + `getCompletionSet()` — 4 DB round-trips where 2 suffice. They're called together in `loadData()`'s `Promise.all`.

**Fix:** Extract a shared `getTodayAndOverdue(referenceDate)` that fetches tasks and completions once and returns both arrays.

---

### ~~4. Sequential per-crop DB queries in `loadData()`~~ ✅
**File:** `src/store/plannerStore.ts:225–291`

Crops are fetched section-by-section inside nested loops (`await getCropsForSection` per section). With many sections this serializes many DB round-trips.

**Fix:** Add a `getAllCrops(showArchived)` query that fetches all crops in one call, then filter by section in JS. Run it in the top-level `Promise.all` alongside groups/locations/sections.

---

### ~~5. Dynamic SQL from field names in `updateCropInstance`~~ ✅
**File:** `src/db/queries/cropQueries.ts`

```ts
const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
```

Field names flow directly into SQL. A typo produces a runtime SQLite error instead of a TypeScript compile error.

**Fix:** Use an explicit allowlist of valid column names, or replace with typed individual update functions.

---

### ~~6. Hardcoded stage definition IDs in `AddCropForm`~~ ✅
**File:** `src/components/forms/AddCropForm.tsx`

`DEFAULT_STAGES` uses hardcoded IDs 1, 2, 3. If the DB is ever re-seeded differently, the defaults silently point to wrong stage definitions.

**Fix:** Derive defaults dynamically from the `stageDefinitions` slice of the store (take the first N entries).

---

## Low Priority — Cleanup

### ~~7. `Math.min/max` spread on large array in `TaskAssessForm`~~ ✅
**File:** `src/components/forms/TaskAssessForm.tsx`

```ts
Math.min(...Object.keys(weekColorMap).map(Number))
```

`weekColorMap` can have hundreds of keys. Spreading into `Math.min/max` can hit call stack limits.

**Fix:** Use `reduce` instead of spread.

---

### ~~8. Dead `currentTop` variable in `loadData()`~~ ✅ (false positive)
**File:** `src/store/plannerStore.ts:205`

`currentTop` is captured as `y1` at each crop row to precompute task line SVG positions. Not dead — no change needed.

---

### ~~9. `countMissedOccurrences` loops up to 52 iterations~~ ✅
**File:** `src/db/queries/taskQueries.ts:83`

The loop cap of 52 means it can walk back a full year per task. For the "how overdue" UX badge, 12 iterations (3 months) is more than enough.

**Fix:** Change `i < 52` to `i < 12`.

---

### ~~10. Unused Expo template stubs~~ ✅
**Files:** `app/modal.tsx`, `components/hello-wave.tsx`, `components/haptic-tab.tsx`, `components/external-link.tsx`, `components/parallax-scroll-view.tsx`, `components/themed-text.tsx`, `components/themed-view.tsx`, `components/ui/collapsible.tsx`, `components/ui/icon-symbol.tsx`, `components/ui/icon-symbol.ios.tsx`

Expo scaffold files — none imported by app code. All deleted.

---

### ~~11. No SQLite FK cascade constraints~~ ✅
**Schema:** migrations

SQLite supports `ON DELETE CASCADE` via `PRAGMA foreign_keys = ON`, but the schema doesn't use FK constraints. All referential integrity is manual JS cascade code.

**Fix (optional):** Enable `PRAGMA foreign_keys = ON` in `database.ts` after opening the connection, and add `ON DELETE CASCADE` to FK columns in a schema migration. This would make the JS cascade code redundant but adds a safety net for direct DB access.

---

### ~~12. No error handling on store actions~~ ✅

No try/catch anywhere in the store. Unhandled promise rejections give users no feedback and may crash the app.

**Fix:** Installed `react-native-toast-message`. Added `showError` helper in store. Wrapped all async store actions (including `loadData`) in try/catch — errors show as toast notifications. `<Toast />` mounted in `_layout.tsx`.

