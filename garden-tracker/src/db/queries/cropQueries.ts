import { type SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '@/src/db/database';
import { TS_NOW, UUID4_SQL } from '@/src/db/schema';
import { tombstoneNoteImagesForNotes } from '@/src/db/queries/noteImageQueries';
import { CropInstance, CropStage, StageDefinition } from '@/src/types';
import { formatDateKey, parseDateKey, toSunday } from '@/src/utils/dateUtils';

function normalizeStartDate(startDate: string): string {
  const strict = parseDateKey(startDate);
  if (strict) return formatDateKey(toSunday(strict));

  const loose = new Date(startDate);
  if (!isNaN(loose.getTime())) return formatDateKey(toSunday(loose));

  return formatDateKey(toSunday(new Date()));
}

export async function getCropsForSection(
  sectionId: number,
  includeArchived = false,
): Promise<CropInstance[]> {
  const db = await getDb();
  // uuid is the tiebreaker so same-start_date crops sort identically on every
  // device — local `id` (SQLite rowid) is assigned per-device and would order the
  // grid differently on each one.
  const sql = includeArchived
    ? `SELECT * FROM crop_instances WHERE section_id = ? AND deleted_at IS NULL ORDER BY start_date, uuid`
    : `SELECT * FROM crop_instances WHERE section_id = ? AND archived = 0 AND deleted_at IS NULL ORDER BY start_date, uuid`;
  const rows = await db.getAllAsync<any>(sql, sectionId);
  return rows.map((r) => ({ ...r, archived: r.archived === 1 }));
}

export async function getAllCrops(includeArchived = false): Promise<CropInstance[]> {
  const db = await getDb();
  // uuid tiebreaks same-start_date crops so the grid order is identical across
  // devices (local `id` is per-device and must not drive display order).
  const sql = includeArchived
    ? `SELECT * FROM crop_instances WHERE deleted_at IS NULL ORDER BY section_id, start_date, uuid`
    : `SELECT * FROM crop_instances WHERE archived = 0 AND deleted_at IS NULL ORDER BY section_id, start_date, uuid`;
  const rows = await db.getAllAsync<any>(sql);
  return rows.map((r) => ({ ...r, archived: r.archived === 1 }));
}

export async function getCropStages(cropInstanceId: number): Promise<CropStage[]> {
  const db = await getDb();
  return db.getAllAsync<CropStage>(
    `
    SELECT
      cs.id,
      cs.crop_instance_id,
      cs.stage_definition_id,
      cs.duration_weeks,
      cs.order_index,
      sd.color,
      sd.name AS stage_name
    FROM crop_stages cs
    JOIN stage_definitions sd ON sd.id = cs.stage_definition_id
    WHERE cs.crop_instance_id = ? AND cs.deleted_at IS NULL
    ORDER BY cs.order_index
  `,
    cropInstanceId,
  );
}

export async function getCropStagesForCrops(cropInstanceIds: number[]): Promise<CropStage[]> {
  if (cropInstanceIds.length === 0) return [];
  const db = await getDb();
  const placeholders = cropInstanceIds.map(() => '?').join(',');
  return db.getAllAsync<CropStage>(
    `
    SELECT
      cs.id,
      cs.crop_instance_id,
      cs.stage_definition_id,
      cs.duration_weeks,
      cs.order_index,
      sd.color,
      sd.name AS stage_name
    FROM crop_stages cs
    JOIN stage_definitions sd ON sd.id = cs.stage_definition_id
    WHERE cs.crop_instance_id IN (${placeholders}) AND cs.deleted_at IS NULL
    ORDER BY cs.crop_instance_id, cs.order_index
  `,
    ...cropInstanceIds,
  );
}

export async function getStageDefs(): Promise<StageDefinition[]> {
  const db = await getDb();
  return db.getAllAsync<StageDefinition>(`SELECT * FROM stage_definitions ORDER BY order_index`);
}

export async function insertCropInstance(
  sectionId: number,
  name: string,
  plantCount: number,
  startDate: string,
  recordType: 'plant' | 'mushroom' = 'plant',
): Promise<number> {
  const db = await getDb();
  const normalizedStartDate = normalizeStartDate(startDate);
  const result = await db.runAsync(
    `INSERT INTO crop_instances (uuid, section_id, name, plant_count, start_date, record_type, updated_at) VALUES ((${UUID4_SQL}), ?, ?, ?, ?, ?, ${TS_NOW})`,
    sectionId,
    name,
    plantCount,
    normalizedStartDate,
    recordType,
  );
  return result.lastInsertRowId;
}

export async function insertCropStage(
  cropInstanceId: number,
  stageDefinitionId: number,
  durationWeeks: number,
  orderIndex: number,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO crop_stages (uuid, crop_instance_id, stage_definition_id, duration_weeks, order_index, updated_at) VALUES ((${UUID4_SQL}), ?, ?, ?, ?, ${TS_NOW})`,
    cropInstanceId,
    stageDefinitionId,
    durationWeeks,
    orderIndex,
  );
}

export async function insertCropWithStages(
  sectionId: number,
  name: string,
  plantCount: number,
  startDate: string,
  stages: { stage_definition_id: number; duration_weeks: number }[],
  recordType: 'plant' | 'mushroom' = 'plant',
): Promise<number> {
  const db = await getDb();
  const normalizedStartDate = normalizeStartDate(startDate);
  let cropId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO crop_instances (uuid, section_id, name, plant_count, start_date, record_type, updated_at) VALUES ((${UUID4_SQL}), ?, ?, ?, ?, ?, ${TS_NOW})`,
      sectionId,
      name,
      plantCount,
      normalizedStartDate,
      recordType,
    );
    cropId = result.lastInsertRowId;
    for (let i = 0; i < stages.length; i++) {
      await db.runAsync(
        `INSERT INTO crop_stages (uuid, crop_instance_id, stage_definition_id, duration_weeks, order_index, updated_at) VALUES ((${UUID4_SQL}), ?, ?, ?, ?, ${TS_NOW})`,
        cropId,
        stages[i].stage_definition_id,
        stages[i].duration_weeks,
        i,
      );
    }
  });
  return cropId;
}

const CROP_INSTANCE_COLUMNS = new Set([
  'name',
  'plant_count',
  'start_date',
  'notes',
  'section_id',
  'record_type',
]);

export async function updateCropInstance(
  id: number,
  fields: Partial<
    Pick<
      CropInstance,
      'name' | 'plant_count' | 'start_date' | 'notes' | 'section_id' | 'record_type'
    >
  >,
): Promise<void> {
  const normalizedFields = {
    ...fields,
    ...(fields.start_date ? { start_date: normalizeStartDate(fields.start_date) } : {}),
  };

  const entries = Object.entries(normalizedFields).filter(([k]) => CROP_INSTANCE_COLUMNS.has(k));
  if (entries.length === 0) return;

  const db = await getDb();
  const sets = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  await db.runAsync(
    `UPDATE crop_instances SET ${sets}, updated_at = ${TS_NOW} WHERE id = ?`,
    ...values,
    id,
  );
}

export async function replaceCropStages(
  cropInstanceId: number,
  stages: { stage_definition_id: number; duration_weeks: number }[],
): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    // Uuid-stable diff keyed by order_index: update existing rows in place,
    // tombstone surplus rows, insert only genuinely new indices. Stages must
    // keep their uuids across edits — the old tombstone-everything-and-reinsert
    // approach minted fresh uuids on every crop edit, so two devices editing the
    // same crop between syncs each tombstoned only the uuids they knew about and
    // both generations survived on the server (duplicated stages after sync).
    // An unchanged stage is not touched at all, so a name-only crop edit no
    // longer rewrites stages. If an order_index already holds duplicates (data
    // doubled by the old behavior), the first row by uuid survives and the rest
    // are tombstoned here — the tombstones sync out and heal the other devices.
    const existingRows = await db.getAllAsync<{
      id: number;
      order_index: number;
      stage_definition_id: number;
      duration_weeks: number;
    }>(
      `SELECT id, order_index, stage_definition_id, duration_weeks FROM crop_stages
       WHERE crop_instance_id = ? AND deleted_at IS NULL
       ORDER BY order_index, uuid`,
      cropInstanceId,
    );

    const keeperByIndex = new Map<number, (typeof existingRows)[number]>();
    const surplusIds: number[] = [];
    for (const row of existingRows) {
      if (row.order_index < stages.length && !keeperByIndex.has(row.order_index)) {
        keeperByIndex.set(row.order_index, row);
      } else {
        surplusIds.push(row.id);
      }
    }

    for (let index = 0; index < stages.length; index++) {
      const incoming = stages[index];
      const keeper = keeperByIndex.get(index);
      if (!keeper) {
        await db.runAsync(
          `INSERT INTO crop_stages (uuid, crop_instance_id, stage_definition_id, duration_weeks, order_index, updated_at) VALUES ((${UUID4_SQL}), ?, ?, ?, ?, ${TS_NOW})`,
          cropInstanceId,
          incoming.stage_definition_id,
          incoming.duration_weeks,
          index,
        );
      } else if (
        keeper.stage_definition_id !== incoming.stage_definition_id ||
        keeper.duration_weeks !== incoming.duration_weeks
      ) {
        await db.runAsync(
          `UPDATE crop_stages SET stage_definition_id = ?, duration_weeks = ?, updated_at = ${TS_NOW} WHERE id = ?`,
          incoming.stage_definition_id,
          incoming.duration_weeks,
          keeper.id,
        );
      }
    }

    if (surplusIds.length > 0) {
      const surplusPlaceholders = surplusIds.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE crop_stages SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW} WHERE id IN (${surplusPlaceholders})`,
        ...surplusIds,
      );
    }
  });
}

export async function archiveCrop(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE crop_instances SET archived = 1, updated_at = ${TS_NOW} WHERE id = ?`,
    id,
  );
}

/**
 * Soft-delete the given crops and every descendant row (tasks, task_completions,
 * crop_stages, notes). The schema's `ON DELETE CASCADE` FKs no longer fire now
 * that deletes are tombstones, so the cascade is done explicitly here. Each step
 * guards on `deleted_at IS NULL` so an already-tombstoned row keeps its original
 * deletion timestamp (the LWW comparator Slice E relies on). Caller wraps this in
 * a transaction.
 */
export async function softDeleteCrops(db: SQLiteDatabase, cropIds: number[]): Promise<void> {
  if (cropIds.length === 0) return;
  const cropIdPlaceholders = cropIds.map(() => '?').join(',');

  await db.runAsync(
    `UPDATE task_completions SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW}
     WHERE task_id IN (SELECT id FROM tasks WHERE crop_instance_id IN (${cropIdPlaceholders})) AND deleted_at IS NULL`,
    ...cropIds,
  );
  await db.runAsync(
    `UPDATE tasks SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW} WHERE crop_instance_id IN (${cropIdPlaceholders}) AND deleted_at IS NULL`,
    ...cropIds,
  );
  await db.runAsync(
    `UPDATE crop_stages SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW} WHERE crop_instance_id IN (${cropIdPlaceholders}) AND deleted_at IS NULL`,
    ...cropIds,
  );
  // Cascade to note images before their parent notes are tombstoned, so their
  // S3 objects get cleaned up on sync (same discipline as the note-level delete).
  const noteRows = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM notes WHERE crop_instance_id IN (${cropIdPlaceholders}) AND deleted_at IS NULL`,
    ...cropIds,
  );
  await tombstoneNoteImagesForNotes(
    db,
    noteRows.map((row) => row.id),
  );
  await db.runAsync(
    `UPDATE notes SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW}
     WHERE crop_instance_id IN (${cropIdPlaceholders}) AND deleted_at IS NULL`,
    ...cropIds,
  );
  await db.runAsync(
    `UPDATE crop_instances SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW}
     WHERE id IN (${cropIdPlaceholders}) AND deleted_at IS NULL`,
    ...cropIds,
  );
}

export async function deleteCropInstance(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await softDeleteCrops(db, [id]);
  });
}
