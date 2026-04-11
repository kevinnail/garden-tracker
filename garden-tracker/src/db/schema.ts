export const SCHEMA_SQL = `
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
    location_group_id INTEGER NOT NULL REFERENCES location_groups(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    order_index       INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sections (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS crop_instances (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id  INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    plant_count INTEGER NOT NULL DEFAULT 1 CHECK (plant_count > 0),
    start_date  TEXT NOT NULL,
    archived    INTEGER NOT NULL DEFAULT 0,
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS crop_stages (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    crop_instance_id    INTEGER NOT NULL REFERENCES crop_instances(id) ON DELETE CASCADE,
    stage_definition_id INTEGER NOT NULL REFERENCES stage_definitions(id),
    duration_weeks      INTEGER NOT NULL CHECK (duration_weeks > 0),
    order_index         INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    crop_instance_id   INTEGER NOT NULL REFERENCES crop_instances(id) ON DELETE CASCADE,
    task_type_id       INTEGER NOT NULL REFERENCES task_types(id),
    day_of_week        INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    frequency_weeks    INTEGER NOT NULL DEFAULT 1 CHECK (frequency_weeks > 0),
    start_offset_weeks INTEGER NOT NULL DEFAULT 0 CHECK (start_offset_weeks >= 0),
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_completions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id        INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    completed_date TEXT NOT NULL,
    UNIQUE(task_id, completed_date)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type      TEXT NOT NULL,
    entity_id        INTEGER,
    week_date        TEXT,
    crop_instance_id INTEGER REFERENCES crop_instances(id) ON DELETE CASCADE,
    content          TEXT NOT NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_crop_instances_section_id  ON crop_instances(section_id);
  CREATE INDEX IF NOT EXISTS idx_crop_instances_archived     ON crop_instances(archived);
  CREATE INDEX IF NOT EXISTS idx_tasks_crop_instance_id      ON tasks(crop_instance_id);
  CREATE INDEX IF NOT EXISTS idx_task_completions_task_id    ON task_completions(task_id);
  CREATE INDEX IF NOT EXISTS idx_notes_crop_instance_id      ON notes(crop_instance_id);
`;
