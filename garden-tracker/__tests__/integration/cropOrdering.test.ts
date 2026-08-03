// * ==================================================
// *
// *    Integration tests — device-independent crop ordering
// *
// *    Real in-memory SQLite. Crops within a section render in
// *    the order the read queries return them. When two crops
// *    share a start_date, the tiebreaker must be their `uuid`
// *    (identical on every device) — never the local `id`
// *    (SQLite rowid, assigned per-device), or the same garden
// *    would list its crops in a different order on each device.
// *
// * ==================================================

import { getCropsForSection, getAllCrops } from '@/src/db/queries/cropQueries';
import { getDb } from '@/src/db/database';
import { setupTestDb, SEED } from '../setup';
import type BetterSqlite3 from 'better-sqlite3';

jest.mock('@/src/db/database', () => ({
  getDb: jest.fn(),
}));

let rawDb: BetterSqlite3.Database;

beforeEach(() => {
  const { db, adapter } = setupTestDb();
  rawDb = db;
  (getDb as jest.Mock).mockResolvedValue(adapter);
});

// All three share one start_date so only the tiebreaker decides their order.
const SHARED_START_DATE = '2025-04-06'; // a Sunday

// Insert in an id order (cccc → aaaa → bbbb) deliberately different from the
// uuid order, so a test that passes can only be honouring uuid, not rowid. Each
// crop is named after its uuid so we can assert order via the returned `name`
// (the CropInstance type doesn't expose uuid).
function insertCropWithUuid(uuid: string): void {
  rawDb
    .prepare(
      `INSERT INTO crop_instances (uuid, section_id, name, plant_count, start_date)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(uuid, SEED.SECTION_ID, `crop-${uuid}`, 1, SHARED_START_DATE);
}

function seedOutOfOrder(): void {
  insertCropWithUuid('cccc');
  insertCropWithUuid('aaaa');
  insertCropWithUuid('bbbb');
}

function sharedDateNames(crops: { name: string; start_date: string }[]): string[] {
  return crops.filter((crop) => crop.start_date === SHARED_START_DATE).map((crop) => crop.name);
}

describe('crop ordering tiebreaks on uuid, not local id', () => {
  it('getCropsForSection returns same-date crops in uuid order regardless of insert/id order', async () => {
    seedOutOfOrder();

    const crops = await getCropsForSection(SEED.SECTION_ID);

    expect(sharedDateNames(crops)).toEqual(['crop-aaaa', 'crop-bbbb', 'crop-cccc']);
  });

  it('getAllCrops returns same-date crops in uuid order regardless of insert/id order', async () => {
    seedOutOfOrder();

    const crops = await getAllCrops();

    expect(sharedDateNames(crops)).toEqual(['crop-aaaa', 'crop-bbbb', 'crop-cccc']);
  });

  it('start_date still sorts ahead of the uuid tiebreak (earliest crop first)', async () => {
    // An earlier crop with a uuid that sorts LAST must still come first by date.
    rawDb
      .prepare(
        `INSERT INTO crop_instances (uuid, section_id, name, plant_count, start_date)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('zzzz', SEED.SECTION_ID, 'crop-earlier', 1, '2025-03-30');
    insertCropWithUuid('aaaa');

    const crops = await getCropsForSection(SEED.SECTION_ID);
    const names = crops.filter((crop) => crop.name.startsWith('crop-')).map((crop) => crop.name);

    expect(names).toEqual(['crop-earlier', 'crop-aaaa']);
  });
});
