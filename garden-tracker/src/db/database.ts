import * as SQLite from 'expo-sqlite';
import { PRESET_STAGES, PRESET_MUSHROOM_STAGES } from '@/src/constants/stages';
import { PRESET_TASK_TYPES, PRESET_MUSHROOM_TASK_TYPES } from '@/src/constants/taskTypes';
import { NOTE_IMAGES_SQL, SCHEMA_SQL, TS_NOW, UUID4_SQL } from '@/src/db/schema';
import { formatDateKey, parseDateKey, toSunday } from '@/src/utils/dateUtils';

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Current local schema version. Bump when adding a migration step.
const SCHEMA_VERSION = 3;

// Tables that will be synced to the cloud (Slices E/F). Each needs a nullable
// `deleted_at` tombstone column. `note_images` is created with the column in
// Slice F, so it is not listed here.
export const SYNCED_TABLES = [
  'locations',
  'gardens',
  'sections',
  'crop_instances',
  'crop_stages',
  'tasks',
  'task_completions',
  'notes',
] as const;

// Synced tables that shipped without an `updated_at` column. `crop_instances`
// and `notes` already had it. v1→v2 adds it to these so uniform server LWW
// (D2) has a comparator on every table.
const TABLES_NEEDING_UPDATED_AT = [
  'locations',
  'gardens',
  'sections',
  'crop_stages',
  'tasks',
  'task_completions',
] as const;

// Minimal surface of the SQLite handle the migrations need. The real expo
// database and the better-sqlite3 test adapter both satisfy it.
interface MigrationDb {
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  execAsync(source: string): Promise<void>;
}

async function columnExists(db: MigrationDb, table: string, column: string): Promise<boolean> {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

/**
 * Forward-only schema migrations, gated by SQLite's `user_version`.
 *
 * v0 → v1: add nullable `deleted_at` to every synced table (cloud-sync
 * tombstones).
 *
 * v1 → v2: cloud-sync foundation (D1/D2). Add `uuid` (client-generated sync
 * key) + a unique index to every synced table, backfilling existing rows; add
 * `updated_at` to the 6 tables that lacked it (LWW comparator), backfilling
 * existing rows.
 *
 * v2 → v3: note image sync (Slice F). Create the `note_images` table (9th synced
 * table) fresh with all sync columns. No existing table is touched.
 *
 * All steps are additive, idempotent, and forward-only — column guards make
 * each a no-op on DBs already carrying it (fresh installs built via SCHEMA_SQL,
 * or a re-run), and they apply to existing App Store DBs that predate the
 * columns. No existing data is reshaped.
 */
export async function runMigrations(db: MigrationDb): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  // v0 → v1: deleted_at tombstones
  for (const table of SYNCED_TABLES) {
    if (!(await columnExists(db, table, 'deleted_at'))) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
    }
  }

  // v1 → v2: uuid sync key (all 8) + updated_at (the 6 that lacked it)
  for (const table of SYNCED_TABLES) {
    if (!(await columnExists(db, table, 'uuid'))) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN uuid TEXT`);
    }
    // randomblob is re-evaluated per row, so each NULL gets a distinct uuid.
    await db.execAsync(`UPDATE ${table} SET uuid = (${UUID4_SQL}) WHERE uuid IS NULL`);
    await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uuid ON ${table}(uuid)`);
  }

  for (const table of TABLES_NEEDING_UPDATED_AT) {
    if (!(await columnExists(db, table, 'updated_at'))) {
      // Nullable on ALTER (SQLite forbids a dynamic default there); the backfill
      // below fills it and every insert/edit sets it explicitly.
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN updated_at TEXT`);
    }
    await db.execAsync(`UPDATE ${table} SET updated_at = ${TS_NOW} WHERE updated_at IS NULL`);
  }

  // v2 → v3: note_images table (idempotent — CREATE TABLE/INDEX IF NOT EXISTS).
  await db.execAsync(NOTE_IMAGES_SQL);

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

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
    await runMigrations(db);
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
    `SELECT value FROM settings WHERE key = 'seeded'`,
  );
  if (seeded) return;

  await db.withTransactionAsync(async () => {
    // Stage definitions
    for (let i = 0; i < PRESET_STAGES.length; i++) {
      await db.runAsync(
        `INSERT INTO stage_definitions (name, color, order_index) VALUES (?, ?, ?)`,
        PRESET_STAGES[i].name,
        PRESET_STAGES[i].color,
        i,
      );
    }

    // Task types
    for (const tt of PRESET_TASK_TYPES) {
      await db.runAsync(`INSERT INTO task_types (name, color) VALUES (?, ?)`, tt.name, tt.color);
    }

    // Mushroom stage definitions
    for (const s of PRESET_MUSHROOM_STAGES) {
      await db.runAsync(
        `INSERT INTO stage_definitions (name, color, order_index) VALUES (?, ?, ?)`,
        s.name,
        s.color,
        s.order_index,
      );
    }

    // Mushroom task types
    for (const tt of PRESET_MUSHROOM_TASK_TYPES) {
      await db.runAsync(`INSERT INTO task_types (name, color) VALUES (?, ?)`, tt.name, tt.color);
    }

    await db.runAsync(`INSERT INTO settings (key, value) VALUES ('seeded', '1')`);

    // Record the fixed calendar origin — computed once, never recalculated.
    // formatDateKey is the local YYYY-MM-DD; toISOString would shift to UTC
    // and could land a day off, breaking the Sunday alignment that
    // task-completion keys depend on.
    const origin = new Date();
    origin.setDate(origin.getDate() - 365);
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES ('calendar_start', ?)`,
      formatDateKey(toSunday(origin)),
    );
  });
}

export async function getCalendarStart(db: SQLite.SQLiteDatabase): Promise<Date> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'calendar_start'`,
  );
  if (row) {
    const parsed = parseDateKey(row.value);
    // Defensive snap: an older seed may have written a non-Sunday date via the
    // toISOString bug — re-snap on read so existing DBs self-correct.
    if (parsed) return toSunday(parsed);
  }

  const origin = new Date();
  origin.setDate(origin.getDate() - 365);
  const sunday = toSunday(origin);
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES ('calendar_start', ?)`,
    formatDateKey(sunday),
  );
  return sunday;
}
