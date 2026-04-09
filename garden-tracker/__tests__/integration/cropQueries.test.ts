// * ==================================================
// *
// *    Integration tests — crop queries against real SQLite
// *
// *    getDb is wired to a real in-memory SQLite database
// *    (better-sqlite3) seeded with known data before each test.
// *    No SQL strings or call counts are asserted here —
// *    only that the actual data round-trips correctly.
// *
// * ==================================================

import {
  getCropsForSection,
  getCropStages,
  getStageDefs,
  insertCropInstance,
  insertCropStage,
  replaceCropStages,
  updateCropInstance,
  archiveCrop,
} from '@/src/db/queries/cropQueries';
import { getDb } from '@/src/db/database';
import { setupTestDb, SEED } from '../setup';
import { PRESET_STAGES } from '@/src/constants/stages';

jest.mock('@/src/db/database', () => ({
  getDb: jest.fn(),
}));

beforeEach(() => {
  const { adapter } = setupTestDb();
  (getDb as jest.Mock).mockResolvedValue(adapter);
});

afterAll(() => {
  jest.clearAllMocks();
});

// ── getCropsForSection ─────────────────────────────────────────────────────────

describe('getCropsForSection', () => {
  it('returns the seeded crop with the correct shape', async () => {
    const results = await getCropsForSection(SEED.SECTION_ID);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: SEED.CROP_ID,
      name: SEED.CROP_NAME,
      plant_count: SEED.PLANT_COUNT,
      start_date: SEED.START_DATE,
      section_id: SEED.SECTION_ID,
      archived: false,
      notes: null,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it('returns empty array for a section with no crops', async () => {
    const results = await getCropsForSection(999);

    expect(results).toHaveLength(0);
    expect(Array.isArray(results)).toBe(true);
  });

  it('hides archived crops by default', async () => {
    await archiveCrop(SEED.CROP_ID);

    const results = await getCropsForSection(SEED.SECTION_ID);

    expect(results).toHaveLength(0);
  });

  it('returns archived crops when includeArchived is true', async () => {
    await archiveCrop(SEED.CROP_ID);

    const results = await getCropsForSection(SEED.SECTION_ID, true);

    expect(results).toHaveLength(1);
    expect(results[0].archived).toBe(true);
  });
});

// ── getCropStages ──────────────────────────────────────────────────────────────

describe('getCropStages', () => {
  it('returns the seeded stages with joined color and stage_name', async () => {
    const results = await getCropStages(SEED.CROP_ID);

    expect(results).toHaveLength(SEED.STAGE_COUNT);
    expect(results[0]).toEqual({
      id: expect.any(Number),
      crop_instance_id: SEED.CROP_ID,
      stage_definition_id: expect.any(Number),
      duration_weeks: 3,
      order_index: 0,
      color: expect.any(String),
      stage_name: 'Seedling',
    });
    expect(results[1].stage_name).toBe('Vegetative');
    expect(results[1].duration_weeks).toBe(6);
  });

  it('returns stages in order_index order', async () => {
    const results = await getCropStages(SEED.CROP_ID);

    expect(results[0].order_index).toBeLessThan(results[1].order_index);
  });

  it('returns empty array for a crop with no stages', async () => {
    const newCropId = await insertCropInstance(SEED.SECTION_ID, 'Bare Crop', 1, '2025-03-02');
    const results = await getCropStages(newCropId);

    expect(results).toHaveLength(0);
  });
});

// ── getStageDefs ───────────────────────────────────────────────────────────────

describe('getStageDefs', () => {
  it('returns all seeded stage definitions', async () => {
    const results = await getStageDefs();

    expect(results).toHaveLength(PRESET_STAGES.length);
  });

  it('returns stage definitions in order_index order', async () => {
    const results = await getStageDefs();

    expect(results[0].name).toBe('Seedling');
    expect(results[0].order_index).toBe(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].order_index).toBeGreaterThan(results[i - 1].order_index);
    }
  });

  it('returns each definition with id, name, color, and order_index', async () => {
    const results = await getStageDefs();

    results.forEach((def) => {
      expect(def).toEqual({
        id: expect.any(Number),
        name: expect.any(String),
        color: expect.any(String),
        order_index: expect.any(Number),
      });
    });
  });
});

// ── insertCropInstance ─────────────────────────────────────────────────────────

describe('insertCropInstance', () => {
  it('inserts a crop and makes it retrievable', async () => {
    const id = await insertCropInstance(SEED.SECTION_ID, 'Basil', 4, '2025-04-06');
    const crops = await getCropsForSection(SEED.SECTION_ID);

    const inserted = crops.find(c => c.id === id);
    expect(inserted).toBeDefined();
    expect(inserted!.name).toBe('Basil');
    expect(inserted!.plant_count).toBe(4);
  });

  it('snaps a non-Sunday start date to the preceding Sunday', async () => {
    // 2025-03-05 is Wednesday → should snap to 2025-03-02 (Sunday)
    const id = await insertCropInstance(SEED.SECTION_ID, 'Spinach', 2, '2025-03-05');
    const crops = await getCropsForSection(SEED.SECTION_ID);

    const inserted = crops.find(c => c.id === id);
    expect(inserted!.start_date).toBe('2025-03-02');
  });

  it('returns a numeric id greater than zero', async () => {
    const id = await insertCropInstance(SEED.SECTION_ID, 'Kale', 3, '2025-03-02');

    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('new crop does not appear with archived filter when freshly inserted', async () => {
    await insertCropInstance(SEED.SECTION_ID, 'Pepper', 6, '2025-03-02');
    const active = await getCropsForSection(SEED.SECTION_ID);

    active.forEach(c => expect(c.archived).toBe(false));
  });
});

// ── insertCropStage ────────────────────────────────────────────────────────────

describe('insertCropStage', () => {
  it('inserts a stage that is retrievable via getCropStages', async () => {
    const stageDefs = await getStageDefs();
    const floweringId = stageDefs.find(s => s.name === 'Flowering')!.id;

    await insertCropStage(SEED.CROP_ID, floweringId, 8, 2);

    const stages = await getCropStages(SEED.CROP_ID);
    const flowering = stages.find(s => s.stage_name === 'Flowering');

    expect(flowering).toBeDefined();
    expect(flowering!.duration_weeks).toBe(8);
    expect(flowering!.order_index).toBe(2);
  });

  it('the joined color comes from the stage definition', async () => {
    const stageDefs = await getStageDefs();
    const fruitingDef = stageDefs.find(s => s.name === 'Fruiting')!;

    await insertCropStage(SEED.CROP_ID, fruitingDef.id, 4, 3);

    const stages = await getCropStages(SEED.CROP_ID);
    const fruiting = stages.find(s => s.stage_name === 'Fruiting');

    expect(fruiting!.color).toBe(fruitingDef.color);
  });
});

// ── updateCropInstance ─────────────────────────────────────────────────────────

describe('updateCropInstance', () => {
  it('updates name and is immediately reflected on read', async () => {
    await updateCropInstance(SEED.CROP_ID, { name: 'Cherry Tomato' });

    const crops = await getCropsForSection(SEED.SECTION_ID);
    expect(crops[0].name).toBe('Cherry Tomato');
  });

  it('updates plant_count and is immediately reflected on read', async () => {
    await updateCropInstance(SEED.CROP_ID, { plant_count: 12 });

    const crops = await getCropsForSection(SEED.SECTION_ID);
    expect(crops[0].plant_count).toBe(12);
  });

  it('updates multiple fields in one call', async () => {
    await updateCropInstance(SEED.CROP_ID, { name: 'Beefsteak', plant_count: 3 });

    const crops = await getCropsForSection(SEED.SECTION_ID);
    expect(crops[0].name).toBe('Beefsteak');
    expect(crops[0].plant_count).toBe(3);
  });

  it('does not affect other crops in the section', async () => {
    const otherId = await insertCropInstance(SEED.SECTION_ID, 'Basil', 2, '2025-03-02');
    await updateCropInstance(SEED.CROP_ID, { name: 'Updated Tomato' });

    const crops = await getCropsForSection(SEED.SECTION_ID);
    const basil = crops.find(c => c.id === otherId);
    expect(basil!.name).toBe('Basil');
  });

  it('snaps an updated mid-week start_date back to Sunday', async () => {
    await updateCropInstance(SEED.CROP_ID, { start_date: '2025-03-05' });

    const crops = await getCropsForSection(SEED.SECTION_ID);
    expect(crops[0].start_date).toBe('2025-03-02');
  });
});

// ── replaceCropStages ─────────────────────────────────────────────────────────

describe('replaceCropStages', () => {
  it('removes existing stages and writes the replacement set in order', async () => {
    const stageDefs = await getStageDefs();
    const flowering = stageDefs.find(stage => stage.name === 'Flowering');
    const fruiting = stageDefs.find(stage => stage.name === 'Fruiting');

    await replaceCropStages(SEED.CROP_ID, [
      { stage_definition_id: flowering!.id, duration_weeks: 5 },
      { stage_definition_id: fruiting!.id, duration_weeks: 3 },
    ]);

    const stages = await getCropStages(SEED.CROP_ID);

    expect(stages).toHaveLength(2);
    expect(stages[0].stage_name).toBe('Flowering');
    expect(stages[0].duration_weeks).toBe(5);
    expect(stages[0].order_index).toBe(0);
    expect(stages[1].stage_name).toBe('Fruiting');
    expect(stages[1].duration_weeks).toBe(3);
    expect(stages[1].order_index).toBe(1);
  });
});

// ── archiveCrop ────────────────────────────────────────────────────────────────

describe('archiveCrop', () => {
  it('removes the crop from the default (active-only) query', async () => {
    await archiveCrop(SEED.CROP_ID);

    const active = await getCropsForSection(SEED.SECTION_ID);
    expect(active).toHaveLength(0);
  });

  it('keeps the crop visible when includeArchived is true', async () => {
    await archiveCrop(SEED.CROP_ID);

    const all = await getCropsForSection(SEED.SECTION_ID, true);
    expect(all).toHaveLength(1);
    expect(all[0].archived).toBe(true);
    expect(all[0].id).toBe(SEED.CROP_ID);
  });

  it('does not archive other crops in the same section', async () => {
    const otherId = await insertCropInstance(SEED.SECTION_ID, 'Basil', 2, '2025-03-02');
    await archiveCrop(SEED.CROP_ID);

    const active = await getCropsForSection(SEED.SECTION_ID);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(otherId);
  });
});

