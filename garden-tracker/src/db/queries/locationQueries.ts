import { getDb } from '@/src/db/database';
import { Location, Garden, Section } from '@/src/types';

export async function getAllLocations(): Promise<Location[]> {
  const db = await getDb();
  return db.getAllAsync<Location>(
    `SELECT * FROM locations ORDER BY order_index`
  );
}

export async function getAllGardens(): Promise<Garden[]> {
  const db = await getDb();
  return db.getAllAsync<Garden>(
    `SELECT * FROM gardens ORDER BY order_index`
  );
}

export async function getAllSections(): Promise<Section[]> {
  const db = await getDb();
  return db.getAllAsync<Section>(
    `SELECT * FROM sections ORDER BY order_index`
  );
}

export async function insertLocation(name: string): Promise<number> {
  const db = await getDb();
  const maxIdx = await db.getFirstAsync<{ max: number | null }>(
    `SELECT MAX(order_index) as max FROM locations`
  );
  const orderIndex = (maxIdx?.max ?? -1) + 1;
  const result = await db.runAsync(
    `INSERT INTO locations (name, order_index) VALUES (?, ?)`,
    name, orderIndex
  );
  return result.lastInsertRowId;
}

export async function insertGarden(locationId: number, name: string): Promise<number> {
  const db = await getDb();
  const maxIdx = await db.getFirstAsync<{ max: number | null }>(
    `SELECT MAX(order_index) as max FROM gardens WHERE location_id = ?`, locationId
  );
  const orderIndex = (maxIdx?.max ?? -1) + 1;
  const result = await db.runAsync(
    `INSERT INTO gardens (location_id, name, order_index) VALUES (?, ?, ?)`,
    locationId, name, orderIndex
  );
  return result.lastInsertRowId;
}

export async function insertSection(gardenId: number, name: string): Promise<number> {
  const db = await getDb();
  const maxIdx = await db.getFirstAsync<{ max: number | null }>(
    `SELECT MAX(order_index) as max FROM sections WHERE garden_id = ?`, gardenId
  );
  const orderIndex = (maxIdx?.max ?? -1) + 1;
  const result = await db.runAsync(
    `INSERT INTO sections (garden_id, name, order_index) VALUES (?, ?, ?)`,
    gardenId, name, orderIndex
  );
  return result.lastInsertRowId;
}

// Children at every level below (gardens → sections → crop_instances →
// crop_stages/tasks/notes → task_completions) use ON DELETE CASCADE, so a
// single DELETE at any level propagates all the way down via FK enforcement.
// `PRAGMA foreign_keys = ON` is set in initSchema and applies to this connection.

export async function updateLocationName(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE locations SET name = ? WHERE id = ?`, name, id);
}

export async function updateGardenName(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE gardens SET name = ? WHERE id = ?`, name, id);
}

export async function updateSectionName(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE sections SET name = ? WHERE id = ?`, name, id);
}

export async function deleteSection(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sections WHERE id = ?`, id);
}

export async function deleteGarden(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM gardens WHERE id = ?`, id);
}

export async function deleteLocation(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM locations WHERE id = ?`, id);
}
