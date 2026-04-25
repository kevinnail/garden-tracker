import * as SQLite from 'expo-sqlite';
import { PRESET_STAGES, PRESET_MUSHROOM_STAGES } from '@/src/constants/stages';
import { PRESET_TASK_TYPES, PRESET_MUSHROOM_TASK_TYPES } from '@/src/constants/taskTypes';
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
    await insertPresetsIfNeeded(db);
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

async function insertPresetsIfNeeded(db: SQLite.SQLiteDatabase) {
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

    // Mushroom stage definitions
    for (const s of PRESET_MUSHROOM_STAGES) {
      await db.runAsync(
        `INSERT INTO stage_definitions (name, color, order_index) VALUES (?, ?, ?)`,
        s.name, s.color, s.order_index
      );
    }

    // Mushroom task types
    for (const tt of PRESET_MUSHROOM_TASK_TYPES) {
      await db.runAsync(
        `INSERT INTO task_types (name, color) VALUES (?, ?)`,
        tt.name, tt.color
      );
    }

    await db.runAsync(`INSERT INTO settings (key, value) VALUES ('seeded', '1')`);

    // Record the fixed calendar origin — computed once, never recalculated
    const origin = new Date();
    origin.setDate(origin.getDate() - 365);
    const day = origin.getDay();
    if (day !== 0) origin.setDate(origin.getDate() - day); // snap to Sunday
    const dateStr = origin.toISOString().slice(0, 10);
    await db.runAsync(`INSERT INTO settings (key, value) VALUES ('calendar_start', ?)`, dateStr);
  });
}

export async function getCalendarStart(db: SQLite.SQLiteDatabase): Promise<Date> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'calendar_start'`
  );
  if (row) return new Date(row.value + 'T00:00:00');

  const origin = new Date();
  origin.setDate(origin.getDate() - 365);
  const day = origin.getDay();
  if (day !== 0) origin.setDate(origin.getDate() - day);
  const dateStr = origin.toISOString().slice(0, 10);
  await db.runAsync(`INSERT INTO settings (key, value) VALUES ('calendar_start', ?)`, dateStr);
  return new Date(dateStr + 'T00:00:00');
}
