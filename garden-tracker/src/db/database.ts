import * as SQLite from 'expo-sqlite';
import { PRESET_STAGES } from '@/src/constants/stages';
import { PRESET_TASK_TYPES } from '@/src/constants/taskTypes';
import { toSunday, formatDateKey } from '@/src/utils/dateUtils';
import { SCHEMA_SQL } from '@/src/db/schema';

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function resetDatabase(): Promise<void> {
  if (_db) {
    await _db.closeAsync();
    _db = null;
  }
  _dbPromise = null;
  await SQLite.deleteDatabaseAsync('garden_tracker.db');
}

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

  await migrateLegacyHierarchy(db);
  await db.execAsync(SCHEMA_SQL);
}

async function tableExists(db: SQLite.SQLiteDatabase, tableName: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    tableName
  );
  return Boolean(row?.name);
}

async function columnExists(db: SQLite.SQLiteDatabase, tableName: string, columnName: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  return rows.some(row => row.name === columnName);
}

async function migrateLegacyHierarchy(db: SQLite.SQLiteDatabase) {
  const hasLegacyLocationGroups = await tableExists(db, 'location_groups');
  if (!hasLegacyLocationGroups) {
    return;
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('PRAGMA foreign_keys = OFF');

    const hasLegacyLocations = await tableExists(db, 'locations');
    const hasGardens = await tableExists(db, 'gardens');

    if (hasLegacyLocations && !hasGardens) {
      await db.runAsync(`ALTER TABLE locations RENAME TO gardens`);
    }

    const hasLocations = await tableExists(db, 'locations');
    if (!hasLocations) {
      await db.runAsync(`ALTER TABLE location_groups RENAME TO locations`);
    }

    const hasGardenLocationGroupId = await columnExists(db, 'gardens', 'location_group_id');
    if (hasGardenLocationGroupId) {
      await db.runAsync(`ALTER TABLE gardens RENAME COLUMN location_group_id TO location_id`);
    }

    const hasSectionLocationId = await columnExists(db, 'sections', 'location_id');
    if (hasSectionLocationId) {
      await db.runAsync(`ALTER TABLE sections RENAME COLUMN location_id TO garden_id`);
    }

    await db.runAsync('PRAGMA foreign_keys = ON');
  });
}

async function removeDemoData(db: SQLite.SQLiteDatabase) {
  const done = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'demo_removed'`
  );
  if (done) return;

  // Remove the seeded demo hierarchy (Home -> My Garden -> Bed 1)
  // Safe to run even if already gone — DELETE WHERE matches nothing is a no-op
  await db.runAsync(`DELETE FROM sections WHERE name = 'Bed 1' AND garden_id IN (SELECT id FROM gardens WHERE name = 'My Garden')`);
  await db.runAsync(`DELETE FROM gardens WHERE name = 'My Garden'`);
  await db.runAsync(`DELETE FROM locations WHERE name = 'Home'`);

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

    // Demo hierarchy
    const location = await db.runAsync(
      `INSERT INTO locations (name, order_index) VALUES ('Home', 0)`
    );
    const garden = await db.runAsync(
      `INSERT INTO gardens (location_id, name, order_index) VALUES (?, 'My Garden', 0)`,
      location.lastInsertRowId
    );
    const section = await db.runAsync(
      `INSERT INTO sections (garden_id, name, order_index) VALUES (?, 'Bed 1', 0)`,
      garden.lastInsertRowId
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
