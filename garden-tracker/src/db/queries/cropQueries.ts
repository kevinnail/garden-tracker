import { getDb } from '@/src/db/database';
import { CropInstance, CropStage, StageDefinition } from '@/src/types';
import { formatDateKey, parseDateKey, toSunday } from '@/src/utils/dateUtils';

function normalizeStartDate(startDate: string): string {
  const strict = parseDateKey(startDate);
  if (strict) return formatDateKey(toSunday(strict));

  const loose = new Date(startDate);
  if (!isNaN(loose.getTime())) return formatDateKey(toSunday(loose));

  return formatDateKey(toSunday(new Date()));
}

export async function getCropsForSection(sectionId: number, includeArchived = false): Promise<CropInstance[]> {
  const db = await getDb();
  const sql = includeArchived
    ? `SELECT * FROM crop_instances WHERE section_id = ? ORDER BY start_date`
    : `SELECT * FROM crop_instances WHERE section_id = ? AND archived = 0 ORDER BY start_date`;
  const rows = await db.getAllAsync<any>(sql, sectionId);
  return rows.map(r => ({ ...r, archived: r.archived === 1 }));
}

export async function getCropStages(cropInstanceId: number): Promise<CropStage[]> {
  const db = await getDb();
  return db.getAllAsync<CropStage>(`
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
    WHERE cs.crop_instance_id = ?
    ORDER BY cs.order_index
  `, cropInstanceId);
}

export async function getStageDefs(): Promise<StageDefinition[]> {
  const db = await getDb();
  return db.getAllAsync<StageDefinition>(
    `SELECT * FROM stage_definitions ORDER BY order_index`
  );
}

export async function insertCropInstance(
  sectionId: number,
  name: string,
  plantCount: number,
  startDate: string
): Promise<number> {
  const db = await getDb();
  const normalizedStartDate = normalizeStartDate(startDate);
  const result = await db.runAsync(
    `INSERT INTO crop_instances (section_id, name, plant_count, start_date) VALUES (?, ?, ?, ?)`,
    sectionId, name, plantCount, normalizedStartDate
  );
  return result.lastInsertRowId;
}

export async function insertCropStage(
  cropInstanceId: number,
  stageDefinitionId: number,
  durationWeeks: number,
  orderIndex: number
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO crop_stages (crop_instance_id, stage_definition_id, duration_weeks, order_index) VALUES (?, ?, ?, ?)`,
    cropInstanceId, stageDefinitionId, durationWeeks, orderIndex
  );
}

export async function updateCropInstance(
  id: number,
  fields: Partial<Pick<CropInstance, 'name' | 'plant_count' | 'start_date' | 'notes' | 'section_id'>>
): Promise<void> {
  if (Object.keys(fields).length === 0) {
    return;
  }

  const db = await getDb();
  const normalizedFields = {
    ...fields,
    ...(fields.start_date ? { start_date: normalizeStartDate(fields.start_date) } : {}),
  };
  const sets = Object.keys(normalizedFields).map(k => `${k} = ?`).join(', ');
  const values = Object.values(normalizedFields);
  await db.runAsync(
    `UPDATE crop_instances SET ${sets}, updated_at = datetime('now') WHERE id = ?`,
    ...values, id
  );
}

export async function replaceCropStages(
  cropInstanceId: number,
  stages: { stage_definition_id: number; duration_weeks: number }[]
): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM crop_stages WHERE crop_instance_id = ?`, cropInstanceId);

    for (let i = 0; i < stages.length; i++) {
      await db.runAsync(
        `INSERT INTO crop_stages (crop_instance_id, stage_definition_id, duration_weeks, order_index) VALUES (?, ?, ?, ?)`,
        cropInstanceId,
        stages[i].stage_definition_id,
        stages[i].duration_weeks,
        i
      );
    }
  });
}

export async function archiveCrop(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE crop_instances SET archived = 1, updated_at = datetime('now') WHERE id = ?`, id
  );
}

export async function deleteCropInstance(id: number): Promise<void> {
  const db = await getDb();
  // Delete dependent rows first, then the crop itself
  await db.runAsync(`DELETE FROM task_completions WHERE task_id IN (SELECT id FROM tasks WHERE crop_instance_id = ?)`, id);
  await db.runAsync(`DELETE FROM tasks WHERE crop_instance_id = ?`, id);
  await db.runAsync(`DELETE FROM crop_stages WHERE crop_instance_id = ?`, id);
  await db.runAsync(`DELETE FROM crop_instances WHERE id = ?`, id);
}
