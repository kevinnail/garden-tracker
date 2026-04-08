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
