import * as SQLite from 'expo-sqlite';
import { PRESET_STAGES } from '@/src/constants/stages';
import { PRESET_TASK_TYPES } from '@/src/constants/taskTypes';
import { toSunday, formatDateKey } from '@/src/utils/dateUtils';
import { SCHEMA_SQL } from '@/src/db/schema';

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_dbPromise) return _dbPromise;

  _dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync('garden_tracker.db');
    await initSchema(db);
    await seedIfNeeded(db);
    await removeDemoData(db);
    _db = db;
    return db;
  })();

  try {
    return await _dbPromise;
  } catch (error) {
    _dbPromise = null;
    throw error;
  }
}

async function initSchema(db: SQLite.SQLiteDatabase) {
  await db.runAsync('PRAGMA foreign_keys = ON');

  try {
    await db.runAsync('PRAGMA journal_mode = WAL');
  } catch {
    // Expo SQLite web support is still alpha; continue if WAL is unavailable.
  }

  await db.execAsync(SCHEMA_SQL);
}

async function removeDemoData(db: SQLite.SQLiteDatabase) {
  const done = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'demo_removed'`
  );
  if (done) return;

  // Remove the seeded demo location hierarchy (My Garden → Raised Beds → Bed 1)
  // Safe to run even if already gone — DELETE WHERE matches nothing is a no-op
  await db.runAsync(`DELETE FROM sections WHERE name = 'Bed 1' AND location_id IN (SELECT id FROM locations WHERE name = 'Raised Beds')`);
  await db.runAsync(`DELETE FROM locations WHERE name = 'Raised Beds'`);
  await db.runAsync(`DELETE FROM location_groups WHERE name = 'My Garden'`);

  await db.runAsync(`INSERT INTO settings (key, value) VALUES ('demo_removed', '1')`);
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
    const startDate = formatDateKey(toSunday(new Date(Date.now() - 4 * 7 * 24 * 60 * 60 * 1000)));

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
