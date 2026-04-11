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

export async function deleteSection(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM task_completions WHERE task_id IN (SELECT id FROM tasks WHERE crop_instance_id IN (SELECT id FROM crop_instances WHERE section_id = ?))`, id);
    await db.runAsync(`DELETE FROM tasks WHERE crop_instance_id IN (SELECT id FROM crop_instances WHERE section_id = ?)`, id);
    await db.runAsync(`DELETE FROM crop_stages WHERE crop_instance_id IN (SELECT id FROM crop_instances WHERE section_id = ?)`, id);
    await db.runAsync(`DELETE FROM crop_instances WHERE section_id = ?`, id);
    await db.runAsync(`DELETE FROM sections WHERE id = ?`, id);
  });
}

export async function deleteGarden(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM task_completions WHERE task_id IN (SELECT t.id FROM tasks t JOIN crop_instances ci ON ci.id = t.crop_instance_id JOIN sections s ON s.id = ci.section_id WHERE s.garden_id = ?)`, id);
    await db.runAsync(`DELETE FROM tasks WHERE crop_instance_id IN (SELECT ci.id FROM crop_instances ci JOIN sections s ON s.id = ci.section_id WHERE s.garden_id = ?)`, id);
    await db.runAsync(`DELETE FROM crop_stages WHERE crop_instance_id IN (SELECT ci.id FROM crop_instances ci JOIN sections s ON s.id = ci.section_id WHERE s.garden_id = ?)`, id);
    await db.runAsync(`DELETE FROM crop_instances WHERE section_id IN (SELECT id FROM sections WHERE garden_id = ?)`, id);
    await db.runAsync(`DELETE FROM sections WHERE garden_id = ?`, id);
    await db.runAsync(`DELETE FROM gardens WHERE id = ?`, id);
  });
}

export async function deleteLocation(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM task_completions WHERE task_id IN (SELECT t.id FROM tasks t JOIN crop_instances ci ON ci.id = t.crop_instance_id JOIN sections s ON s.id = ci.section_id JOIN gardens g ON g.id = s.garden_id WHERE g.location_id = ?)`, id);
    await db.runAsync(`DELETE FROM tasks WHERE crop_instance_id IN (SELECT ci.id FROM crop_instances ci JOIN sections s ON s.id = ci.section_id JOIN gardens g ON g.id = s.garden_id WHERE g.location_id = ?)`, id);
    await db.runAsync(`DELETE FROM crop_stages WHERE crop_instance_id IN (SELECT ci.id FROM crop_instances ci JOIN sections s ON s.id = ci.section_id JOIN gardens g ON g.id = s.garden_id WHERE g.location_id = ?)`, id);
    await db.runAsync(`DELETE FROM crop_instances WHERE section_id IN (SELECT s.id FROM sections s JOIN gardens g ON g.id = s.garden_id WHERE g.location_id = ?)`, id);
    await db.runAsync(`DELETE FROM sections WHERE garden_id IN (SELECT id FROM gardens WHERE location_id = ?)`, id);
    await db.runAsync(`DELETE FROM gardens WHERE location_id = ?`, id);
    await db.runAsync(`DELETE FROM locations WHERE id = ?`, id);
  });
}
