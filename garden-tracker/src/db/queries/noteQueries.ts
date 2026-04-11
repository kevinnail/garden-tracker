import { getDb } from '@/src/db/database';
import { Note } from '@/src/types';

const WEEK_CELL_ENTITY = 'week_cell';

export async function getNoteForCell(cropInstanceId: number, weekDate: string): Promise<Note | null> {
  const db = await getDb();
  return db.getFirstAsync<Note>(`
    SELECT id, entity_type, entity_id, week_date, crop_instance_id, content, created_at, updated_at
    FROM notes
    WHERE entity_type = ? AND crop_instance_id = ? AND week_date = ?
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `, WEEK_CELL_ENTITY, cropInstanceId, weekDate);
}

export async function upsertNote(cropInstanceId: number, weekDate: string, content: string): Promise<number> {
  const db = await getDb();
  // Atomic upsert against the partial unique index on
  // (entity_type, crop_instance_id, week_date). No pre-read race possible.
  await db.runAsync(
    `INSERT INTO notes (entity_type, crop_instance_id, week_date, content)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(entity_type, crop_instance_id, week_date)
     WHERE entity_type = 'week_cell' AND crop_instance_id IS NOT NULL AND week_date IS NOT NULL
     DO UPDATE SET content = excluded.content, updated_at = datetime('now')`,
    WEEK_CELL_ENTITY,
    cropInstanceId,
    weekDate,
    content
  );
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM notes WHERE entity_type = ? AND crop_instance_id = ? AND week_date = ? LIMIT 1`,
    WEEK_CELL_ENTITY,
    cropInstanceId,
    weekDate
  );
  return row?.id ?? 0;
}

export async function deleteNote(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM notes WHERE id = ?`, id);
}

export async function getAllNotesForCrop(cropInstanceId: number): Promise<Note[]> {
  const db = await getDb();
  return db.getAllAsync<Note>(`
    SELECT id, entity_type, entity_id, week_date, crop_instance_id, content, created_at, updated_at
    FROM notes
    WHERE entity_type = ? AND crop_instance_id = ?
    ORDER BY week_date, updated_at DESC, id DESC
  `, WEEK_CELL_ENTITY, cropInstanceId);
}

export async function getNotesForCrops(cropInstanceIds: number[]): Promise<Note[]> {
  if (cropInstanceIds.length === 0) return [];
  const db = await getDb();
  const placeholders = cropInstanceIds.map(() => '?').join(',');
  return db.getAllAsync<Note>(`
    SELECT id, entity_type, entity_id, week_date, crop_instance_id, content, created_at, updated_at
    FROM notes
    WHERE entity_type = ? AND crop_instance_id IN (${placeholders})
    ORDER BY crop_instance_id, week_date, updated_at DESC, id DESC
  `, WEEK_CELL_ENTITY, ...cropInstanceIds);
}