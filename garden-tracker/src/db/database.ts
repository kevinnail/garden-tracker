import * as SQLite from 'expo-sqlite';
import { PRESET_STAGES } from '@/src/constants/stages';
import { PRESET_TASK_TYPES } from '@/src/constants/taskTypes';
import { toSunday } from '@/src/utils/dateUtils';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('garden_tracker.db');
  await initSchema(_db);
  await seedIfNeeded(_db);
  return _db;
}

async function initSchema(db: SQLite.SQLiteDatabase) {
  await db.runAsync('PRAGMA journal_mode = WAL');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stage_definitions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      color       TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS task_types (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS location_groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS locations (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      location_group_id INTEGER NOT NULL REFERENCES location_groups(id),
      name              TEXT NOT NULL,
      order_index       INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sections (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL REFERENCES locations(id),
      name        TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS crop_instances (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL REFERENCES sections(id),
      name       TEXT NOT NULL,
      plant_count INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      archived   INTEGER NOT NULL DEFAULT 0,
      notes      TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crop_stages (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      crop_instance_id    INTEGER NOT NULL REFERENCES crop_instances(id),
      stage_definition_id INTEGER NOT NULL REFERENCES stage_definitions(id),
      duration_weeks      INTEGER NOT NULL,
      order_index         INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      crop_instance_id     INTEGER NOT NULL REFERENCES crop_instances(id),
      task_type_id         INTEGER NOT NULL REFERENCES task_types(id),
      day_of_week          INTEGER NOT NULL,
      frequency_weeks      INTEGER NOT NULL DEFAULT 1,
      start_offset_weeks   INTEGER NOT NULL DEFAULT 0,
      created_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_completions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id        INTEGER NOT NULL REFERENCES tasks(id),
      completed_date TEXT NOT NULL,
      UNIQUE(task_id, completed_date)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type      TEXT NOT NULL,
      entity_id        INTEGER,
      week_date        TEXT,
      crop_instance_id INTEGER,
      content          TEXT NOT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function seedIfNeeded(db: SQLite.SQLiteDatabase) {
  const seeded = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'seeded'`
  );
  if (seeded) return;

  await db.withTransactionAsync(async () => {
    // Stage definitions
    for (let i = 0; i < PRESET_STAGES.length; i++) {
      await db.runAsync(
        `INSERT INTO stage_definitions (name, color, order_index) VALUES (?, ?, ?)`,
        PRESET_STAGES[i].name, PRESET_STAGES[i].color, i
      );
    }

    // Task types
    for (const tt of PRESET_TASK_TYPES) {
      await db.runAsync(
        `INSERT INTO task_types (name, color) VALUES (?, ?)`,
        tt.name, tt.color
      );
    }

    // Demo location hierarchy
    const group = await db.runAsync(
      `INSERT INTO location_groups (name, order_index) VALUES ('My Garden', 0)`
    );
    const loc = await db.runAsync(
      `INSERT INTO locations (location_group_id, name, order_index) VALUES (?, 'Raised Beds', 0)`,
      group.lastInsertRowId
    );
    const section = await db.runAsync(
      `INSERT INTO sections (location_id, name, order_index) VALUES (?, 'Bed 1', 0)`,
      loc.lastInsertRowId
    );

    // Demo crop — started 4 weeks ago
    const startDate = toSunday(new Date(Date.now() - 4 * 7 * 24 * 60 * 60 * 1000))
      .toISOString().slice(0, 10);

    const crop = await db.runAsync(
      `INSERT INTO crop_instances (section_id, name, plant_count, start_date) VALUES (?, 'Tomato', 6, ?)`,
      section.lastInsertRowId, startDate
    );

    // Get stage def ids for Seedling, Vegetative, Flowering
    const stageDefs = await db.getAllAsync<{ id: number; name: string }>(
      `SELECT id, name FROM stage_definitions WHERE name IN ('Seedling','Vegetative','Flowering') ORDER BY order_index`
    );
    const stageMap: Record<string, number> = {};
    for (const s of stageDefs) stageMap[s.name] = s.id;

    const cropStages = [
      { name: 'Seedling',   duration: 3 },
      { name: 'Vegetative', duration: 6 },
      { name: 'Flowering',  duration: 8 },
    ];
    for (let i = 0; i < cropStages.length; i++) {
      await db.runAsync(
        `INSERT INTO crop_stages (crop_instance_id, stage_definition_id, duration_weeks, order_index) VALUES (?, ?, ?, ?)`,
        crop.lastInsertRowId, stageMap[cropStages[i].name], cropStages[i].duration, i
      );
    }

    // Demo tasks
    const wateringType = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM task_types WHERE name = 'Watering'`
    );
    const fertType = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM task_types WHERE name = 'Fertilizing'`
    );

    const watering = await db.runAsync(
      `INSERT INTO tasks (crop_instance_id, task_type_id, day_of_week, frequency_weeks, start_offset_weeks) VALUES (?, ?, 3, 1, 0)`,
      crop.lastInsertRowId, wateringType!.id
    );
    await db.runAsync(
      `INSERT INTO tasks (crop_instance_id, task_type_id, day_of_week, frequency_weeks, start_offset_weeks) VALUES (?, ?, 1, 2, 1)`,
      crop.lastInsertRowId, fertType!.id
    );

    // Mark first watering as completed
    await db.runAsync(
      `INSERT INTO task_completions (task_id, completed_date) VALUES (?, ?)`,
      watering.lastInsertRowId, startDate
    );

    await db.runAsync(`INSERT INTO settings (key, value) VALUES ('seeded', '1')`);
  });
}
