// * ==================================================
// *
// *    Integration tests — location read and write queries
// *
// *    Uses a real in-memory SQLite database via better-sqlite3.
// *    getDb is mocked to return the test adapter.
// *    Tests assert on actual returned data, not SQL strings.
// *
// * ==================================================

import {
  getAllLocations,
  getAllGardens,
  getAllSections,
  insertLocation,
  insertGarden,
  insertSection,
  deleteSection,
  deleteGarden,
  deleteLocation,
  updateLocationName,
  updateGardenName,
  updateSectionName,
} from '@/src/db/queries/locationQueries';
import { getDb } from '@/src/db/database';
import { setupTestDb, SEED } from '../setup';

jest.mock('@/src/db/database', () => ({
  getDb: jest.fn(),
}));

let adapter: ReturnType<typeof setupTestDb>['adapter'];

beforeEach(() => {
  const { adapter: a } = setupTestDb();
  adapter = a;
  (getDb as jest.Mock).mockResolvedValue(adapter);
});

// ── getAllLocations ─────────────────────────────────────────────────────────────

describe('getAllLocations', () => {
  it('returns the seeded location', async () => {
    const locations = await getAllLocations();

    expect(locations.length).toBeGreaterThan(0);
    expect(locations[0].id).toBeDefined();
    expect(typeof locations[0].name).toBe('string');
  });

  it('returns locations in order_index order', async () => {
    await insertLocation('ZZZ Last');
    await insertLocation('AAA Also Last');

    const locations = await getAllLocations();

    for (let i = 1; i < locations.length; i++) {
      expect(locations[i].order_index).toBeGreaterThanOrEqual(locations[i - 1].order_index);
    }
  });
});

// ── getAllGardens ──────────────────────────────────────────────────────────────

describe('getAllGardens', () => {
  it('returns the seeded garden', async () => {
    const gardens = await getAllGardens();

    expect(gardens.length).toBeGreaterThan(0);
    expect(typeof gardens[0].location_id).toBe('number');
  });
});

// ── getAllSections ─────────────────────────────────────────────────────────────

describe('getAllSections', () => {
  it('returns the seeded section', async () => {
    const sections = await getAllSections();

    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0].id).toBe(SEED.SECTION_ID);
  });

  it('returns sections in order_index order', async () => {
    const locations = await getAllLocations();
    const gardens = await getAllGardens();
    const gardenId = gardens.find(g => g.location_id === locations[0].id)!.id;

    await insertSection(gardenId, 'Section B');
    await insertSection(gardenId, 'Section C');

    const sections = await getAllSections();

    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].order_index).toBeGreaterThanOrEqual(sections[i - 1].order_index);
    }
  });
});

// ── insertLocation ─────────────────────────────────────────────────────────────

describe('insertLocation', () => {
  it('returns a numeric id greater than zero', async () => {
    const id = await insertLocation('New Location');

    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('new location appears in getAllLocations', async () => {
    await insertLocation('Rooftop');

    const locations = await getAllLocations();
    const found = locations.find(l => l.name === 'Rooftop');

    expect(found).toBeDefined();
  });

  it('assigns sequential order_index values', async () => {
    const id1 = await insertLocation('First');
    const id2 = await insertLocation('Second');

    const locations = await getAllLocations();
    const l1 = locations.find(l => l.id === id1)!;
    const l2 = locations.find(l => l.id === id2)!;

    expect(l2.order_index).toBeGreaterThan(l1.order_index);
  });
});

// ── insertGarden ──────────────────────────────────────────────────────────────

describe('insertGarden', () => {
  it('inserts a garden under the correct location', async () => {
    const locationId = await insertLocation('Home');
    const gardenId = await insertGarden(locationId, 'Test Garden');

    const gardens = await getAllGardens();
    const found = gardens.find(g => g.id === gardenId);

    expect(found).toBeDefined();
    expect(found!.location_id).toBe(locationId);
    expect(found!.name).toBe('Test Garden');
  });
});

// ── insertSection ──────────────────────────────────────────────────────────────

describe('insertSection', () => {
  it('inserts a section under the correct garden', async () => {
    const locationId = await insertLocation('G');
    const gardenId = await insertGarden(locationId, 'L');
    const secId = await insertSection(gardenId, 'Bed 1');

    const sections = await getAllSections();
    const found = sections.find(s => s.id === secId);

    expect(found).toBeDefined();
    expect(found!.garden_id).toBe(gardenId);
    expect(found!.name).toBe('Bed 1');
  });

  it('full hierarchy round-trip: location -> garden -> section', async () => {
    const locationId = await insertLocation('Greenhouse');
    const gardenId = await insertGarden(locationId, 'North Wing');
    await insertSection(gardenId, 'Row A');

    const locations = await getAllLocations();
    const gardens = await getAllGardens();
    const sections = await getAllSections();

    expect(locations.find(l => l.name === 'Greenhouse')).toBeDefined();
    expect(gardens.find(g => g.name === 'North Wing')).toBeDefined();
    expect(sections.find(s => s.name === 'Row A')).toBeDefined();
  });
});

// ── updateLocationName ─────────────────────────────────────────────────────────

describe('updateLocationName', () => {
  it('renames a location so the new name appears in getAllLocations', async () => {
    const locations = await getAllLocations();
    const id = locations[0].id;

    await updateLocationName(id, 'Renamed Location');

    const updated = await getAllLocations();
    expect(updated.find(l => l.id === id)!.name).toBe('Renamed Location');
  });

  it('does not affect other locations', async () => {
    const id1 = await insertLocation('Alpha');
    const id2 = await insertLocation('Beta');

    await updateLocationName(id1, 'Alpha Renamed');

    const locations = await getAllLocations();
    expect(locations.find(l => l.id === id2)!.name).toBe('Beta');
  });

  it('does nothing when id does not exist', async () => {
    await expect(updateLocationName(999, 'Ghost')).resolves.toBeUndefined();
  });
});

// ── updateGardenName ───────────────────────────────────────────────────────────

describe('updateGardenName', () => {
  it('renames a garden so the new name appears in getAllGardens', async () => {
    const gardens = await getAllGardens();
    const id = gardens[0].id;

    await updateGardenName(id, 'Renamed Garden');

    const updated = await getAllGardens();
    expect(updated.find(g => g.id === id)!.name).toBe('Renamed Garden');
  });

  it('does not affect other gardens', async () => {
    const locationId = await insertLocation('Loc');
    const id1 = await insertGarden(locationId, 'Garden One');
    const id2 = await insertGarden(locationId, 'Garden Two');

    await updateGardenName(id1, 'Garden One Renamed');

    const gardens = await getAllGardens();
    expect(gardens.find(g => g.id === id2)!.name).toBe('Garden Two');
  });

  it('does nothing when id does not exist', async () => {
    await expect(updateGardenName(999, 'Ghost')).resolves.toBeUndefined();
  });
});

// ── updateSectionName ──────────────────────────────────────────────────────────

describe('updateSectionName', () => {
  it('renames a section so the new name appears in getAllSections', async () => {
    await updateSectionName(SEED.SECTION_ID, 'Renamed Section');

    const sections = await getAllSections();
    expect(sections.find(s => s.id === SEED.SECTION_ID)!.name).toBe('Renamed Section');
  });

  it('does not affect other sections', async () => {
    const locationId = await insertLocation('Loc');
    const gardenId = await insertGarden(locationId, 'Garden');
    const id1 = await insertSection(gardenId, 'Bed A');
    const id2 = await insertSection(gardenId, 'Bed B');

    await updateSectionName(id1, 'Bed A Renamed');

    const sections = await getAllSections();
    expect(sections.find(s => s.id === id2)!.name).toBe('Bed B');
  });

  it('does nothing when id does not exist', async () => {
    await expect(updateSectionName(999, 'Ghost')).resolves.toBeUndefined();
  });
});

// ── deleteSection ──────────────────────────────────────────────────────────────

describe('deleteSection', () => {
  it('removes the section so it no longer appears in getAllSections', async () => {
    await deleteSection(SEED.SECTION_ID);

    const sections = await getAllSections();

    expect(sections.find(s => s.id === SEED.SECTION_ID)).toBeUndefined();
  });

  it('does nothing when section does not exist', async () => {
    await expect(deleteSection(999)).resolves.toBeUndefined();
  });

  it('removing a section leaves the parent garden intact', async () => {
    await deleteSection(SEED.SECTION_ID);

    const gardens = await getAllGardens();

    expect(gardens.length).toBeGreaterThan(0);
  });
});

// ── deleteGarden ───────────────────────────────────────────────────────────────

describe('deleteGarden', () => {
  it('removes the garden and its sections', async () => {
    const gardens = await getAllGardens();
    const gardenId = gardens[0].id;

    await deleteGarden(gardenId);

    const remaining = await getAllGardens();
    expect(remaining.find(g => g.id === gardenId)).toBeUndefined();

    const sections = await getAllSections();
    expect(sections.find(s => s.id === SEED.SECTION_ID)).toBeUndefined();
  });

  it('does nothing when garden does not exist', async () => {
    await expect(deleteGarden(999)).resolves.toBeUndefined();
  });

  it('removing a garden leaves the parent location intact', async () => {
    const gardens = await getAllGardens();
    await deleteGarden(gardens[0].id);

    const locations = await getAllLocations();

    expect(locations.length).toBeGreaterThan(0);
  });
});

// ── deleteLocation ─────────────────────────────────────────────────────────────

describe('deleteLocation', () => {
  it('removes the location and its full hierarchy', async () => {
    const locations = await getAllLocations();
    const locationId = locations[0].id;

    await deleteLocation(locationId);

    const remaining = await getAllLocations();
    expect(remaining.find(l => l.id === locationId)).toBeUndefined();

    const gardens = await getAllGardens();
    expect(gardens).toHaveLength(0);

    const sections = await getAllSections();
    expect(sections).toHaveLength(0);
  });

  it('does nothing when location does not exist', async () => {
    await expect(deleteLocation(999)).resolves.toBeUndefined();
  });
});
