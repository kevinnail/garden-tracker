# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

This repo contains the design artifacts for a **React Native / Expo crop planning app** — a VBA Excel workbook translated into a mobile-first app. The actual app code lives (or will live) in a subdirectory created by `create-expo-app`. This repo holds:

- `SPEC.MD` — product specification
- `PLAN.md` — full phased implementation plan with schema, types, and architecture (authoritative reference)
- `VBA Files/` — the working Excel/VBA source that defines correct behavior for all features
- `Screenshots/` — reference screenshots

## Development Commands

The Expo app will be scaffolded under `garden-tracker/` (or similar). Once that directory exists:

```bash
cd garden-tracker
npx expo start          # Start dev server (opens Expo Go on device/emulator)
npx expo start --ios    # iOS simulator
npx expo start --android
npx expo run:ios        # Native build (requires Xcode)
npx expo run:android    # Native build (requires Android Studio)
```

No build or test commands exist yet — the app hasn't been scaffolded.

## Architecture

See `PLAN.md` for the canonical structure. Key points:

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
Zustand store (`plannerStore.ts`) holds all grid rows and UI toggle state. SQLite (expo-sqlite) is the local data store — all reads/writes go through `src/db/queries/`.

## Key Constants (from `PLAN.md`)

| Constant | Value |
|---|---|
| `CELL_WIDTH` | 52px |
| `ROW_HEIGHT` | 28px |
| `ROW_HEADER_WIDTH` | 200px (30 plant count + 170 name) |
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

The plan is phased — see `PLAN.md § Implementation Phases` for the full breakdown. Phase 1 (walking skeleton) must be verified working before adding forms or DB integration. The phases are:

1. Walking skeleton (grid renders with hardcoded data)
2. SQLite data loading
3. Add Crop form
4. Add Task form + task rendering
5. Task Assessment form
6. Location hierarchy forms
7. Crop editing + archive
8. Notes
9. Crop drag to shift timeline
10. Today Dashboard
11. Notifications
12. Accounts + Cloud Sync (post-MVP)
