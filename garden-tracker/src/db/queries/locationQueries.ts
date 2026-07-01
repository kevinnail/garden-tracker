import { getDb } from '@/src/db/database';
import { softDeleteCrops } from '@/src/db/queries/cropQueries';
import { TS_NOW, UUID4_SQL } from '@/src/db/schema';
import { Location, Garden, Section } from '@/src/types';

export async function getAllLocations(): Promise<Location[]> {
  const db = await getDb();
  return db.getAllAsync<Location>(
    `SELECT * FROM locations WHERE deleted_at IS NULL ORDER BY order_index`,
  );
}

export async function getAllGardens(): Promise<Garden[]> {
  const db = await getDb();
  return db.getAllAsync<Garden>(
    `SELECT * FROM gardens WHERE deleted_at IS NULL ORDER BY order_index`,
  );
}

export async function getAllSections(): Promise<Section[]> {
  const db = await getDb();
  return db.getAllAsync<Section>(
    `SELECT * FROM sections WHERE deleted_at IS NULL ORDER BY order_index`,
  );
}

export async function insertLocation(name: string): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO locations (uuid, name, order_index, updated_at)
     VALUES ((${UUID4_SQL}), ?, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM locations), ${TS_NOW})`,
    name,
  );
  return result.lastInsertRowId;
}

export async function insertGarden(
  locationId: number,
  name: string,
  recordType: 'plant' | 'mushroom' = 'plant',
): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO gardens (uuid, location_id, name, record_type, order_index, updated_at)
     VALUES ((${UUID4_SQL}), ?, ?, ?, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM gardens WHERE location_id = ?), ${TS_NOW})`,
    locationId,
    name,
    recordType,
    locationId,
  );
  return result.lastInsertRowId;
}

export async function updateGardenRecordType(
  id: number,
  recordType: 'plant' | 'mushroom',
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE gardens SET record_type = ?, updated_at = ${TS_NOW} WHERE id = ?`,
    recordType,
    id,
  );
}

export async function insertSection(gardenId: number, name: string): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO sections (uuid, garden_id, name, order_index, updated_at)
     VALUES ((${UUID4_SQL}), ?, ?, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM sections WHERE garden_id = ?), ${TS_NOW})`,
    gardenId,
    name,
    gardenId,
  );
  return result.lastInsertRowId;
}

export async function updateLocationName(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE locations SET name = ?, updated_at = ${TS_NOW} WHERE id = ?`, name, id);
}

export async function updateGardenName(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE gardens SET name = ?, updated_at = ${TS_NOW} WHERE id = ?`, name, id);
}

export async function updateSectionName(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE sections SET name = ?, updated_at = ${TS_NOW} WHERE id = ?`, name, id);
}

// Soft-delete cascades down the hierarchy explicitly: the schema's ON DELETE
// CASCADE FKs no longer fire now that deletes are tombstones, so each level
// soft-deletes its crop subtree (via softDeleteCrops) plus the intermediate rows.

export async function deleteSection(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const crops = await db.getAllAsync<{ id: number }>(
      `SELECT id FROM crop_instances WHERE section_id = ?`,
      id,
    );
    await softDeleteCrops(
      db,
      crops.map((c) => c.id),
    );
    await db.runAsync(
      `UPDATE sections SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW} WHERE id = ?`,
      id,
    );
  });
}

export async function deleteGarden(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const crops = await db.getAllAsync<{ id: number }>(
      `SELECT ci.id FROM crop_instances ci
       JOIN sections s ON s.id = ci.section_id
       WHERE s.garden_id = ?`,
      id,
    );
    await softDeleteCrops(
      db,
      crops.map((c) => c.id),
    );
    await db.runAsync(
      `UPDATE sections SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW} WHERE garden_id = ? AND deleted_at IS NULL`,
      id,
    );
    await db.runAsync(
      `UPDATE gardens SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW} WHERE id = ?`,
      id,
    );
  });
}

export async function deleteLocation(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const crops = await db.getAllAsync<{ id: number }>(
      `SELECT ci.id FROM crop_instances ci
       JOIN sections s ON s.id = ci.section_id
       JOIN gardens g ON g.id = s.garden_id
       WHERE g.location_id = ?`,
      id,
    );
    await softDeleteCrops(
      db,
      crops.map((c) => c.id),
    );
    await db.runAsync(
      `UPDATE sections SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW}
       WHERE garden_id IN (SELECT id FROM gardens WHERE location_id = ?) AND deleted_at IS NULL`,
      id,
    );
    await db.runAsync(
      `UPDATE gardens SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW} WHERE location_id = ? AND deleted_at IS NULL`,
      id,
    );
    await db.runAsync(
      `UPDATE locations SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW} WHERE id = ?`,
      id,
    );
  });
}
