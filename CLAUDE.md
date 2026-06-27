# CLAUDE.md

This is the **garden-tracker** iOS app repo (`com.kevinnail.gardentracker`) — a React Native / Expo crop planning app, a VBA Excel workbook translated into a mobile-first app. **The MVP is built and live on the App Store.** Current work is the opt-in cloud backup / sync feature (see "Current work" below).

Read `SPEC.MD` for the product spec and `design/backend-starter/PLAN.md` for the original phased implementation plan (schema, types, architecture).

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff, no long code snippets.

**Always choose the simplest possible implementation.** Before suggesting a solution, ask: does this require new files, new abstractions, flags, or infrastructure that wouldn't otherwise exist? If not, don't suggest them. A problem solved by adding data to an existing file is always better than one solved by adding a new file, flag, env variable, or wrapper. Never layer on complexity that the problem doesn't require.

Whenever working with any third-party library or something similar, you MUST look up the official documentation to ensure that you're working with up-to-date information. Use the DocsExplorer subagent for efficient documentation lookup.

**Cross-platform UI:** Before writing or fixing any UI, consult `.claude/UI_CHECKLIST.md` — it tracks recurring iOS↔Android pitfalls (some can hard-crash) and logs every UI fix with per-platform end-to-end verification status. When you fix a UI issue, add a row to its section 2 and don't mark a platform ✅ until verified on a real build.

## Repo layout

```
garden-tracker/                  <- this git repo (iOS app + planning docs)
├── CLAUDE.md                    <- this file (loads for all work in the repo)
├── garden-tracker/              <- the Expo app itself (src/, app/, __tests__/, package.json)
├── design/                      <- planning + handoff docs (no code)
│   ├── HANDOFF-TO-IOS.md        <- iOS cloud-sync spec, Slices A–G
│   ├── PROGRESS.md              <- shared cross-repo status, source of truth
│   └── backend-starter/         <- the crop-planner-server repo's docs, copied in as reference
│       ├── CLAUDE.md            <- backend's own CLAUDE (only loads when working in that folder)
│       └── PLAN.md, SPEC.md, SETUP.md
└── VBA Files/                   <- working Excel/VBA source (defines correct behavior)
```

There is intentionally only one app-side `CLAUDE.md` (this one, at repo root). It loads whether you're working in `garden-tracker/` or `design/`. Don't add a second copy inside the nested app dir.

## Current work — cloud backup / sync

The MVP (offline-first planner, phases below) is **done and shipped**. Active work is the opt-in cloud backup feature, which spans two repos — this iOS app and the backend (**crop-planner-server**) — built in coordinated vertical slices.

- **`design/HANDOFF-TO-IOS.md`** is the iOS-side spec: **Slices A–G**. It opens with a "Why this order" section explaining the dependency chain — read it once and **do not relitigate the ordering or scope**; it's settled.
- The backend spec is the server repo's `PLAN.md` (Slices 1–10), mirrored at `design/backend-starter/PLAN.md`.
- **`design/PROGRESS.md`** is the **shared source of truth** for cross-repo status. It travels between the two repos manually when switching sides.
- **At the end of every slice, update `design/PROGRESS.md`** (the *At a glance* table + the slice's *Per-feature detail* markers) before wrapping up. Flip "Wired up?" to ✅ only after an end-to-end test across both repos passes.

Current state: backend done through Slice 5 (auth + password reset, not deployed); iOS integration Foundation done (runtime config, typed API client, `/health` button). Next iOS slice: **A** (`deleted_at` migration).

## Development Commands

The Expo app lives in the nested `garden-tracker/` directory.

```bash
cd garden-tracker
npx expo start          # Start dev server (opens Expo Go on device/emulator)
npx expo start --ios    # iOS simulator
npx expo start --android
npm test                # Jest (unit + integration); __tests__/
```

## Build & Deploy — READ BEFORE giving any build/run instruction

This project is developed on a **Windows host with no Mac/Xcode**. Do NOT instruct the user to run `expo run:ios` / `expo run:android` for native builds — there is no local Xcode. **All iOS builds go through EAS cloud** (`eas build`).

- **iOS dev build** (needed for native modules like `react-native-purchases`, deep links — anything Expo Go sandboxes):
  - Dev builds install as a **separate app** via the `.dev` bundle id: `app.config.js` overrides identifiers when `APP_VARIANT=development` (set by the `development` profile in `eas.json`). This keeps the App Store build's local SQLite data untouched.
  - One-time per device: `eas device:create` → register via the QR/website profile.
  - Build: `eas build --profile development --platform ios` → install on phone via the QR code.
- **Daily dev loop:** `npx expo start --dev-client`, then open the **dev** app icon (not Expo Go).
- **`EXPO_PUBLIC_*` env vars — how they reach a build:**
  - **Dev builds run JS from local Metro.** Metro inlines `EXPO_PUBLIC_*` at bundle time from the local **`.env.development`** (gitignored). So for dev/Test-Store work the local `.env.development` is all that's needed — nothing goes in `eas.json`.
  - **Production builds bake JS in the cloud** (no Metro). Gitignored `.env*` files are NOT uploaded to EAS, so production `EXPO_PUBLIC_*` values must come from **EAS environment variables** (dashboard / `eas env`) or an `eas.json` `build.<profile>.env` block — `.env.production` alone won't reach a cloud-baked build.
- These are **public** SDK keys (`EXPO_PUBLIC_*` is embedded in the client by design), not secrets.

## Architecture

See `design/backend-starter/PLAN.md` for the canonical structure. Key points:

### Grid Layout (4-panel frozen-header design)
```
┌──────────────┬──────────────────────────────────┐
│  Corner      │  ColumnHeader (follows scrollX)  │
│  (today date)│  YearRow + MonthRow + WeekRow     │
├──────────────┼──────────────────────────────────┤
│  RowHeader   │  GridBody (primary scroll)        │
│  (follows    │  Virtualized cells                │
│   scrollY)   │  + SVG TaskOverlay on top         │
└──────────────┴──────────────────────────────────┘
```
`GridBody` is the only real scroll target. `ColumnHeader` and `RowHeader` follow via `useAnimatedStyle` on `Reanimated.SharedValue`s (`scrollX`, `scrollY`).

### Virtualization
Only render cells in the visible window. Cells are absolutely positioned:
```typescript
{ position: 'absolute', left: col * CELL_WIDTH, top: row * ROW_HEIGHT }
```

### Task Lines (SVG overlay)
`TaskOverlay` is an absolutely-positioned `<Svg>` covering the full virtual grid, translated by scroll. Lines are vertical, colored by task type, dashed if completed.

Day x-position formula (must match VBA exactly):
```typescript
dayXOffset(day) = (day / 7) * CELL_WIDTH + CELL_WIDTH / 14
```

### State Management
Zustand store (`plannerStore.ts`) holds all grid rows and UI toggle state. SQLite (expo-sqlite) is the local data store — all reads/writes go through `garden-tracker/src/db/queries/`.

## Key Constants

| Constant | Value |
|---|---|
| `CELL_WIDTH` | 52px |
| `ROW_HEIGHT` | 28px |
| `ROW_HEADER_WIDTH` | 170px (30 plant count + 140 name) |
| `TOTAL_WEEKS` | 156 (3 years) |
| `BACKGROUND_COLOR` | `#1a1a1a` |
| `EMPTY_CELL_COLOR` | `#333333` |

## VBA Source Reference

When any behavior is unclear, read the VBA file. This table maps features to source:

| Feature | VBA Source |
|---|---|
| Calendar header drawing | `VBA Files/Modules/DrawCalendar3.bas` |
| Stage coloring + crop draw | `VBA Files/Class Modules/CropClass.cls` → `Draw()` |
| Date cursor positioning | `VBA Files/Modules/Cursor_Update.bas` → `UpdateCursor()` |
| Past cell hatch pattern | `VBA Files/Modules/Cursor_Update.bas` → `LastWeekFormat2()` |
| Task line drawing | `VBA Files/Modules/LineStuff.bas` → `drawLines()` |
| Task completion toggle | `VBA Files/Modules/LineStuff.bas` → `TaskComplete()` |
| Row hide/show | `VBA Files/Modules/RowHideUtility.bas` |

## Critical Behavioral Rules (from VBA)

- **Start dates always snap to Sunday.** Subtract 0–6 days based on `Weekday()`.
- **Past hatch applies to all cells left of today** — both inside crop spans and empty grey cells.
- **Task `start_offset_weeks`** (VBA `offsetC`): shifts where task lines begin drawing (from crop start), but the end stays at crop end.
- **Calendar start**: default to Sunday ~8 weeks before today so recent history is visible on load.
- **Year header alternation**: even year offset = `#ADD8E6` (light blue), odd = `#FFFFE0` (light yellow).
- **Month label**: write only on first week column where `weekDate.getDate() <= 7` for that month.
- **Solid line = pending task, dashed (`strokeDasharray="3,3"`) = completed.**

## Implementation Phases

See `design/backend-starter/PLAN.md § Implementation Phases` for the original phased plan. The current work is cloud backup / sync, tracked in `design/HANDOFF-TO-IOS.md` (Slices A–G). I do not have verified per-phase completion status — do not infer it from this file.
