import { getDb } from '@/src/db/database';
import { LocationGroup, Location, Section } from '@/src/types';

export async function getAllLocationGroups(): Promise<LocationGroup[]> {
  const db = await getDb();
  return db.getAllAsync<LocationGroup>(
    `SELECT * FROM location_groups ORDER BY order_index`
  );
}

export async function getAllLocations(): Promise<Location[]> {
  const db = await getDb();
  return db.getAllAsync<Location>(
    `SELECT * FROM locations ORDER BY order_index`
  );
}

export async function getAllSections(): Promise<Section[]> {
  const db = await getDb();
  return db.getAllAsync<Section>(
    `SELECT * FROM sections ORDER BY order_index`
  );
}

export async function insertLocationGroup(name: string): Promise<number> {
  const db = await getDb();
  const maxIdx = await db.getFirstAsync<{ max: number | null }>(
    `SELECT MAX(order_index) as max FROM location_groups`
  );
  const orderIndex = (maxIdx?.max ?? -1) + 1;
  const result = await db.runAsync(
    `INSERT INTO location_groups (name, order_index) VALUES (?, ?)`,
    name, orderIndex
  );
  return result.lastInsertRowId;
}

export async function insertLocation(groupId: number, name: string): Promise<number> {
  const db = await getDb();
  const maxIdx = await db.getFirstAsync<{ max: number | null }>(
    `SELECT MAX(order_index) as max FROM locations WHERE location_group_id = ?`, groupId
  );
  const orderIndex = (maxIdx?.max ?? -1) + 1;
  const result = await db.runAsync(
    `INSERT INTO locations (location_group_id, name, order_index) VALUES (?, ?, ?)`,
    groupId, name, orderIndex
  );
  return result.lastInsertRowId;
}

export async function insertSection(locationId: number, name: string): Promise<number> {
  const db = await getDb();
  const maxIdx = await db.getFirstAsync<{ max: number | null }>(
    `SELECT MAX(order_index) as max FROM sections WHERE location_id = ?`, locationId
  );
  const orderIndex = (maxIdx?.max ?? -1) + 1;
  const result = await db.runAsync(
    `INSERT INTO sections (location_id, name, order_index) VALUES (?, ?, ?)`,
    locationId, name, orderIndex
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

export async function deleteLocation(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM task_completions WHERE task_id IN (SELECT t.id FROM tasks t JOIN crop_instances ci ON ci.id = t.crop_instance_id JOIN sections s ON s.id = ci.section_id WHERE s.location_id = ?)`, id);
    await db.runAsync(`DELETE FROM tasks WHERE crop_instance_id IN (SELECT ci.id FROM crop_instances ci JOIN sections s ON s.id = ci.section_id WHERE s.location_id = ?)`, id);
    await db.runAsync(`DELETE FROM crop_stages WHERE crop_instance_id IN (SELECT ci.id FROM crop_instances ci JOIN sections s ON s.id = ci.section_id WHERE s.location_id = ?)`, id);
    await db.runAsync(`DELETE FROM crop_instances WHERE section_id IN (SELECT id FROM sections WHERE location_id = ?)`, id);
    await db.runAsync(`DELETE FROM sections WHERE location_id = ?`, id);
    await db.runAsync(`DELETE FROM locations WHERE id = ?`, id);
  });
}

export async function deleteLocationGroup(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM task_completions WHERE task_id IN (SELECT t.id FROM tasks t JOIN crop_instances ci ON ci.id = t.crop_instance_id JOIN sections s ON s.id = ci.section_id JOIN locations l ON l.id = s.location_id WHERE l.location_group_id = ?)`, id);
    await db.runAsync(`DELETE FROM tasks WHERE crop_instance_id IN (SELECT ci.id FROM crop_instances ci JOIN sections s ON s.id = ci.section_id JOIN locations l ON l.id = s.location_id WHERE l.location_group_id = ?)`, id);
    await db.runAsync(`DELETE FROM crop_stages WHERE crop_instance_id IN (SELECT ci.id FROM crop_instances ci JOIN sections s ON s.id = ci.section_id JOIN locations l ON l.id = s.location_id WHERE l.location_group_id = ?)`, id);
    await db.runAsync(`DELETE FROM crop_instances WHERE section_id IN (SELECT s.id FROM sections s JOIN locations l ON l.id = s.location_id WHERE l.location_group_id = ?)`, id);
    await db.runAsync(`DELETE FROM sections WHERE location_id IN (SELECT id FROM locations WHERE location_group_id = ?)`, id);
    await db.runAsync(`DELETE FROM locations WHERE location_group_id = ?`, id);
    await db.runAsync(`DELETE FROM location_groups WHERE id = ?`, id);
  });
}
