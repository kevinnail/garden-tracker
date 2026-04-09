// * ==================================================
// *
// *    Test database setup — used by integration tests only.
// *
// *    Creates an in-memory SQLite database via better-sqlite3
// *    and returns an adapter that matches the expo-sqlite
// *    async API that our query functions expect.
// *
// *    Call setupTestDb() in beforeEach to get a fresh,
// *    seeded database for every test.
// *
// * ==================================================

import BetterSqlite3 from 'better-sqlite3';
import { PRESET_STAGES } from '@/src/constants/stages';
import { PRESET_TASK_TYPES } from '@/src/constants/taskTypes';

// Known seed values — import these in integration tests for assertions
export const SEED = {
  SECTION_ID: 1,
  CROP_ID: 1,
  CROP_NAME: 'Tomato',
  PLANT_COUNT: 6,
  START_DATE: '2025-03-02', // a Sunday
  STAGE_COUNT: 2,           // Seedling + Vegetative
  TASK_ID: 1,
  TASK_TYPE_ID: 1,          // Watering (first in PRESET_TASK_TYPES)
  TASK_DAY_OF_WEEK: 3,      // Wednesday
};

// Adapter that wraps better-sqlite3's sync API to match expo-sqlite's async API
export function createTestAdapter(db: BetterSqlite3.Database) {
  return {
    getAllAsync: async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
      return db.prepare(sql).all(...params) as T[];
    },
    getFirstAsync: async <T>(sql: string, ...params: unknown[]): Promise<T | null> => {
      return (db.prepare(sql).get(...params) as T) ?? null;
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      const result = db.prepare(sql).run(...params);
      return { lastInsertRowId: result.lastInsertRowid as number, changes: result.changes };
    },
    execAsync: async (sql: string) => { db.exec(sql); },
    withTransactionAsync: async (fn: () => Promise<void>) => { await fn(); },
  };
}

export function setupTestDb() {
  const db = new BetterSqlite3(':memory:');

  db.exec(`
    CREATE TABLE stage_definitions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      color       TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE task_types (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL,
      color TEXT NOT NULL
    );
    CREATE TABLE location_groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE locations (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      location_group_id INTEGER NOT NULL,
      name              TEXT NOT NULL,
      order_index       INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE sections (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      name        TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE crop_instances (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id  INTEGER NOT NULL,
      name        TEXT NOT NULL,
      plant_count INTEGER NOT NULL DEFAULT 1,
      start_date  TEXT NOT NULL,
      archived    INTEGER NOT NULL DEFAULT 0,
      notes       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE crop_stages (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      crop_instance_id    INTEGER NOT NULL,
      stage_definition_id INTEGER NOT NULL,
      duration_weeks      INTEGER NOT NULL,
      order_index         INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE tasks (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      crop_instance_id   INTEGER NOT NULL,
      task_type_id       INTEGER NOT NULL,
      day_of_week        INTEGER NOT NULL,
      frequency_weeks    INTEGER NOT NULL DEFAULT 1,
      start_offset_weeks INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE task_completions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id        INTEGER NOT NULL,
      completed_date TEXT NOT NULL,
      UNIQUE(task_id, completed_date)
    );
    CREATE TABLE notes (
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

  // Stage definitions (all 7 presets)
  for (const s of PRESET_STAGES) {
    db.prepare('INSERT INTO stage_definitions (name, color, order_index) VALUES (?, ?, ?)').run(s.name, s.color, s.order_index);
  }

  // Task types
  for (const tt of PRESET_TASK_TYPES) {
    db.prepare('INSERT INTO task_types (name, color) VALUES (?, ?)').run(tt.name, tt.color);
  }

  // Location hierarchy
  const group = db.prepare('INSERT INTO location_groups (name, order_index) VALUES (?, ?)').run('Test Garden', 0);
  const loc   = db.prepare('INSERT INTO locations (location_group_id, name, order_index) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Test Beds', 0);
  db.prepare('INSERT INTO sections (location_id, name, order_index) VALUES (?, ?, ?)').run(loc.lastInsertRowid, 'Section A', 0);
  // → section_id = 1 = SEED.SECTION_ID

  // One known crop
  db.prepare('INSERT INTO crop_instances (section_id, name, plant_count, start_date) VALUES (?, ?, ?, ?)').run(
    SEED.SECTION_ID, SEED.CROP_NAME, SEED.PLANT_COUNT, SEED.START_DATE
  );
  // → crop id = 1 = SEED.CROP_ID

  // Two stages on that crop: Seedling (3 weeks) + Vegetative (6 weeks)
  const seedlingId   = (db.prepare("SELECT id FROM stage_definitions WHERE name = 'Seedling'").get()   as any).id;
  const vegetativeId = (db.prepare("SELECT id FROM stage_definitions WHERE name = 'Vegetative'").get() as any).id;
  db.prepare('INSERT INTO crop_stages (crop_instance_id, stage_definition_id, duration_weeks, order_index) VALUES (?, ?, ?, ?)').run(SEED.CROP_ID, seedlingId, 3, 0);
  db.prepare('INSERT INTO crop_stages (crop_instance_id, stage_definition_id, duration_weeks, order_index) VALUES (?, ?, ?, ?)').run(SEED.CROP_ID, vegetativeId, 6, 1);

  // One seeded task: Watering on Wednesday, every week, no offset
  db.prepare('INSERT INTO tasks (crop_instance_id, task_type_id, day_of_week, frequency_weeks, start_offset_weeks) VALUES (?, ?, ?, ?, ?)').run(
    SEED.CROP_ID, SEED.TASK_TYPE_ID, SEED.TASK_DAY_OF_WEEK, 1, 0
  );
  // → task_id = 1 = SEED.TASK_ID

  return { db, adapter: createTestAdapter(db) };
}
