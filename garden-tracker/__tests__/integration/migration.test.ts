// * ==================================================
// *
// *    Integration tests — Slice A schema migration (deleted_at)
// *
// *    Builds a pre-migration database matching the shipped App
// *    Store schema (no `deleted_at`), seeds rows, then runs the
// *    real runMigrations() through the better-sqlite3 adapter and
// *    asserts the column is added with NULL defaults and every
// *    existing row survives untouched.
// *
// * ==================================================

// runMigrations lives in database.ts, which imports expo-sqlite only for
// types/namespace. Stub it so the module loads in Node — the migration itself
// only touches the db handle we pass in.
jest.mock('expo-sqlite', () => ({}));

import BetterSqlite3 from 'better-sqlite3';
import { runMigrations, SYNCED_TABLES } from '@/src/db/database';
import { createTestAdapter } from '../setup';

// The synced tables exactly as the shipped build created them — i.e. without
// deleted_at. Foreign keys are omitted so the fixture can seed each table in
// isolation; the migration is purely additive and FK-agnostic.
const OLD_SCHEMA_SQL = `
  CREATE TABLE locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, order_index INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE gardens (
    id INTEGER PRIMARY KEY AUTOINCREMENT, location_id INTEGER NOT NULL, name TEXT NOT NULL,
    record_type TEXT NOT NULL DEFAULT 'plant', order_index INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, garden_id INTEGER NOT NULL, name TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE crop_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT, section_id INTEGER NOT NULL, name TEXT NOT NULL,
    plant_count INTEGER NOT NULL DEFAULT 1, start_date TEXT NOT NULL,
    record_type TEXT NOT NULL DEFAULT 'plant', archived INTEGER NOT NULL DEFAULT 0,
    notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE crop_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, crop_instance_id INTEGER NOT NULL,
    stage_definition_id INTEGER NOT NULL, duration_weeks INTEGER NOT NULL, order_index INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, crop_instance_id INTEGER NOT NULL, task_type_id INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL, frequency_weeks INTEGER NOT NULL DEFAULT 1,
    start_offset_weeks INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE task_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, completed_date TEXT NOT NULL,
    UNIQUE(task_id, completed_date)
  );
  CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id INTEGER, week_date TEXT,
    crop_instance_id INTEGER, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

// One representative row per synced table, keyed by table name. Values are the
// "real user data" the migration must preserve byte-for-byte.
function seedOldDb(db: BetterSqlite3.Database) {
  db.prepare('INSERT INTO locations (id, name, order_index) VALUES (1, ?, 0)').run('Backyard');
  db.prepare('INSERT INTO gardens (id, location_id, name, order_index) VALUES (1, 1, ?, 0)').run(
    'Raised Beds',
  );
  db.prepare('INSERT INTO sections (id, garden_id, name, order_index) VALUES (1, 1, ?, 0)').run(
    'Bed 1',
  );
  db.prepare(
    'INSERT INTO crop_instances (id, section_id, name, plant_count, start_date) VALUES (1, 1, ?, 6, ?)',
  ).run('Tomato', '2025-03-02');
  db.prepare(
    'INSERT INTO crop_stages (id, crop_instance_id, stage_definition_id, duration_weeks, order_index) VALUES (1, 1, 1, 3, 0)',
  ).run();
  db.prepare(
    'INSERT INTO tasks (id, crop_instance_id, task_type_id, day_of_week) VALUES (1, 1, 1, 3)',
  ).run();
  db.prepare('INSERT INTO task_completions (id, task_id, completed_date) VALUES (1, 1, ?)').run(
    '2025-03-19',
  );
  db.prepare("INSERT INTO notes (id, entity_type, content) VALUES (1, 'crop', ?)").run(
    'Looking healthy',
  );
}

function makeOldDb() {
  const db = new BetterSqlite3(':memory:');
  db.exec(OLD_SCHEMA_SQL);
  seedOldDb(db);
  return db;
}

describe('runMigrations — v0 → v1 deleted_at', () => {
  it('adds deleted_at to every synced table', async () => {
    const db = makeOldDb();
    const adapter = createTestAdapter(db);

    await runMigrations(adapter);

    for (const table of SYNCED_TABLES) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      expect(cols.map((c) => c.name)).toContain('deleted_at');
    }
  });

  it('sets deleted_at to NULL on all pre-existing rows', async () => {
    const db = makeOldDb();
    await runMigrations(createTestAdapter(db));

    for (const table of SYNCED_TABLES) {
      const rows = db.prepare(`SELECT deleted_at FROM ${table}`).all() as {
        deleted_at: string | null;
      }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).toBeNull();
    }
  });

  it('preserves existing row data (no data loss)', async () => {
    const db = makeOldDb();
    await runMigrations(createTestAdapter(db));

    const loc = db.prepare('SELECT * FROM locations WHERE id = 1').get() as any;
    expect(loc.name).toBe('Backyard');

    const crop = db.prepare('SELECT * FROM crop_instances WHERE id = 1').get() as any;
    expect(crop.name).toBe('Tomato');
    expect(crop.plant_count).toBe(6);
    expect(crop.start_date).toBe('2025-03-02');

    const note = db.prepare('SELECT * FROM notes WHERE id = 1').get() as any;
    expect(note.content).toBe('Looking healthy');
  });

  it('bumps user_version to 1', async () => {
    const db = makeOldDb();
    await runMigrations(createTestAdapter(db));
    expect(db.pragma('user_version', { simple: true }) as number).toBe(1);
  });

  it('is idempotent — running twice does not error or duplicate columns', async () => {
    const db = makeOldDb();
    const adapter = createTestAdapter(db);

    await runMigrations(adapter);
    await runMigrations(adapter);

    const cols = db.prepare('PRAGMA table_info(notes)').all() as { name: string }[];
    expect(cols.filter((c) => c.name === 'deleted_at')).toHaveLength(1);
  });

  it('is a no-op on a fresh DB already created with deleted_at', async () => {
    // Fresh install: tables already have the column. Migration must not throw
    // (no duplicate-column ALTER) and must still set the version.
    const db = new BetterSqlite3(':memory:');
    db.exec(
      'CREATE TABLE locations (id INTEGER PRIMARY KEY, name TEXT, order_index INTEGER, deleted_at TEXT);',
    );
    for (const t of SYNCED_TABLES) {
      if (t === 'locations') continue;
      db.exec(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, deleted_at TEXT);`);
    }

    await expect(runMigrations(createTestAdapter(db))).resolves.toBeUndefined();
    expect(db.pragma('user_version', { simple: true }) as number).toBe(1);
  });
});
