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
  getAllLocationGroups,
  getAllLocations,
  getAllSections,
  insertLocationGroup,
  insertLocation,
  insertSection,
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

// ── getAllLocationGroups ────────────────────────────────────────────────────────

describe('getAllLocationGroups', () => {
  it('returns the seeded location group', async () => {
    const groups = await getAllLocationGroups();

    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0].id).toBeDefined();
    expect(typeof groups[0].name).toBe('string');
  });

  it('returns groups in order_index order', async () => {
    await insertLocationGroup('ZZZ Last');
    await insertLocationGroup('AAA Also Last');

    const groups = await getAllLocationGroups();

    for (let i = 1; i < groups.length; i++) {
      expect(groups[i].order_index).toBeGreaterThanOrEqual(groups[i - 1].order_index);
    }
  });
});

// ── getAllLocations ─────────────────────────────────────────────────────────────

describe('getAllLocations', () => {
  it('returns the seeded location', async () => {
    const locations = await getAllLocations();

    expect(locations.length).toBeGreaterThan(0);
    expect(typeof locations[0].location_group_id).toBe('number');
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
    const groups = await getAllLocationGroups();
    const locations = await getAllLocations();
    const locId = locations.find(l => l.location_group_id === groups[0].id)!.id;

    await insertSection(locId, 'Section B');
    await insertSection(locId, 'Section C');

    const sections = await getAllSections();

    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].order_index).toBeGreaterThanOrEqual(sections[i - 1].order_index);
    }
  });
});

// ── insertLocationGroup ────────────────────────────────────────────────────────

describe('insertLocationGroup', () => {
  it('returns a numeric id greater than zero', async () => {
    const id = await insertLocationGroup('New Group');

    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('new group appears in getAllLocationGroups', async () => {
    await insertLocationGroup('Rooftop');

    const groups = await getAllLocationGroups();
    const found = groups.find(g => g.name === 'Rooftop');

    expect(found).toBeDefined();
  });

  it('assigns sequential order_index values', async () => {
    const id1 = await insertLocationGroup('First');
    const id2 = await insertLocationGroup('Second');

    const groups = await getAllLocationGroups();
    const g1 = groups.find(g => g.id === id1)!;
    const g2 = groups.find(g => g.id === id2)!;

    expect(g2.order_index).toBeGreaterThan(g1.order_index);
  });
});

// ── insertLocation ─────────────────────────────────────────────────────────────

describe('insertLocation', () => {
  it('inserts a location under the correct group', async () => {
    const groupId = await insertLocationGroup('Test Group');
    const locId = await insertLocation(groupId, 'Test Location');

    const locations = await getAllLocations();
    const found = locations.find(l => l.id === locId);

    expect(found).toBeDefined();
    expect(found!.location_group_id).toBe(groupId);
    expect(found!.name).toBe('Test Location');
  });
});

// ── insertSection ──────────────────────────────────────────────────────────────

describe('insertSection', () => {
  it('inserts a section under the correct location', async () => {
    const groupId  = await insertLocationGroup('G');
    const locId    = await insertLocation(groupId, 'L');
    const secId    = await insertSection(locId, 'Bed 1');

    const sections = await getAllSections();
    const found = sections.find(s => s.id === secId);

    expect(found).toBeDefined();
    expect(found!.location_id).toBe(locId);
    expect(found!.name).toBe('Bed 1');
  });

  it('full hierarchy round-trip: group → location → section', async () => {
    const groupId  = await insertLocationGroup('Greenhouse');
    const locId    = await insertLocation(groupId, 'North Wing');
    await insertSection(locId, 'Row A');

    const groups   = await getAllLocationGroups();
    const locs     = await getAllLocations();
    const sections = await getAllSections();

    expect(groups.find(g => g.name === 'Greenhouse')).toBeDefined();
    expect(locs.find(l => l.name === 'North Wing')).toBeDefined();
    expect(sections.find(s => s.name === 'Row A')).toBeDefined();
  });
});
