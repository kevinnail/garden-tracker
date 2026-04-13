# Garden Tracker

A mobile crop-planning app for small-scale growers — built with React Native, Expo, and TypeScript.

## What It Does

Garden Tracker replaces a working Excel/VBA crop planner I built from scratch with a mobile-first app that gives growers a at-a-glance view of everything in the ground across a rolling 3-year timeline.

The core UI is a **scrollable planner grid**: crops run horizontally across weekly columns, color-coded by growth stage (germination, vegetative, flowering, harvest, etc.). Task lines are drawn as vertical SVG overlays on the grid — solid for pending, dashed for complete. A red cursor marks today. The whole thing is designed to let you manage hundreds of plants without losing your place.

**Key features:**
- Scrollable timeline grid with frozen row/column headers (156-week span)
- Color-coded crop stages with customizable start dates and durations
- Task tracking with visual line overlays, types, and completion states
- Location/group hierarchy to organize crops by bed, row, or zone
- Crop assessment form to quickly mark task completions across a season
- SQLite local storage — works fully offline, no account required
- Dark-themed UI optimized for outdoor/greenhouse use

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React Native + Expo (file-based routing) |
| Language | TypeScript |
| State | Zustand |
| Local DB | expo-sqlite |
| Animation | react-native-reanimated |
| Gestures | react-native-gesture-handler |
| Graphics | react-native-svg |
| Date logic | date-fns |

## Status

In active development. Core planner grid, crop management, task tracking, and assessment form are functional. Publishing to iOS App Store and Google Play as a free app — premium features planned post-launch based on user feedback.

## Background

This started as a personal Excel tool I used to manage my own growing operation. When it outgrew what a spreadsheet could reasonably do, I decided to rebuild it properly as a native app. It's also my main portfolio project for demonstrating React Native / Expo skills after coming from a background in VBA and Excel automation.
