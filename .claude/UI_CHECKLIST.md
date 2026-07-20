# UI_CHECKLIST.md — cross-platform UI tracker

Living doc. Two jobs: (1) keep us cognizant of recurring iOS↔Android UI pitfalls while
building, and (2) make sure every UI fix gets end-to-end tested on **both** platforms
before it's considered done. When you touch UI, consult section 1; when you fix a UI
issue, add a row to section 2 and don't mark it ✅ until verified on a real device/build.

Platforms: **iOS** (primary, 25 real users) · **Android** (deferred — keep preventative
fixes in, full QA pass postponed; see CLAUDE.md strategic note).

---

## 1. Recurring pattern catalog (be cognizant of these)

Most are Android-only and cosmetic; the ⚠️ ones can hard-crash.

| # | Pattern | Risk | Notes |
|---|---------|------|-------|
| 1 | **Edge-to-edge (SDK 54 default)** | Layout | RN 0.81/Expo 54 draw content under status/nav bars on Android. Check top/bottom insets. `SafeAreaView` excluding `edges={['top']}` will tuck under the status bar. |
| 2 | ⚠️ **`navigation.setOptions` header mid-transition** | Crash (Android) | Mutating `headerStyle`/`headerLeft`/etc. while a screen/modal is sliding in throws a native UI exception (~50% intermittent). Defer with `InteractionManager.runAfterInteractions` or a `transitionEnd` listener. |
| 3 | **`presentation: 'modal'`** | Cosmetic | iOS-only visually; Android renders full-screen. Modals won't *look* like modals on Android. |
| 4 | **Shadows** | Cosmetic | iOS `shadow*` props render nothing on Android — needs `elevation`. Floating UI looks flat. |
| 5 | ⚠️ **SVG + `NaN`/invalid numeric props** | Crash (Android) | `react-native-svg` throws natively on `NaN` x/width/d. Grid (`TaskOverlay`, `CropCell`) computes from dates/durations — guard divisions and zero/empty cases. |
| 6 | **Overflow / zIndex clipping** | Layout/touch | Android clips children outside parent bounds; absolutely-positioned overlays outside a parent can be untouchable. Relevant to frozen-header overlay design. |
| 7 | **Keyboard** | Layout | `KeyboardAvoidingView` behavior `padding` (iOS) / `height` (Android). Set `softwareKeyboardLayoutMode` / `android:windowSoftInputMode` in app.json. Android is flakier. |
| 8 | **Hardware back button** | Behavior (Android) | Android-only. Verify back during guarded flows (e.g. `usePreventRemove` in first-run setup) hits the guard, not a raw exit. |
| 9 | **Text rendering** | Cosmetic | `includeFontPadding` + `lineHeight` crop differently on Android. |
| 10 | **DateTimePicker** | Behavior | iOS inline/spinner vs Android dismiss-on-select dialog. Always Platform-branch. |

---

## 2. Fix log + E2E verification tracker

Add a row per UI fix. ✅ only after testing on a real build for that platform. N/A = not
applicable to that platform. Android may sit ⏳ while full QA is deferred.

| Date | Issue | Fix | iOS | Android | Pattern # |
|------|-------|-----|-----|---------|-----------|
| 2026-06-06 | First-run setup crashes app entering Add Crop | Defer `setOptions` header tint via `InteractionManager.runAfterInteractions` (`AddCropForm.tsx`) | ✅ Expo Go + tsc/lint clean | ⏳ pending build+logcat | 2 |
| 2026-07-18 | Add/Edit Crop garden-section picker: selected row not visually distinct from bright-grey unselected rows | Unselected rows now dim/dark (`#242424` bg, grey text); selected row is the only lit-up one (green/brown + ✓) (`AddCropForm.tsx`) | ✅ pending device check | ⏳ deferred | — |
| 2026-07-18 | Zoom ± shifts the visible date sideways (scrollX in px, not rescaled for new cellWidth) | Rescale scrollX on cellWidth change so the week at viewport center stays anchored; home-button reset pre-syncs the ref (`PlannerGrid.tsx`) | ✅ pending device check | ⏳ deferred | — |
