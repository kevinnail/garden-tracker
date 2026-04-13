// * ==================================================
// *
// *    Unit tests — location read and write queries
// *
// *    getDb is mocked. Tests verify each function calls
// *    the db correctly and maps/returns the right values.
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

jest.mock('@/src/db/database', () => ({
  getDb: jest.fn(),
}));

const mockDb = {
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  runAsync: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDb as jest.Mock).mockResolvedValue(mockDb);
});

// ── getAllLocations ─────────────────────────────────────────────────────────────

describe('getAllLocations', () => {
  it('returns all locations ordered by order_index', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, name: 'Home', order_index: 0 },
    ]);

    const locations = await getAllLocations();

    expect(locations).toHaveLength(1);
    expect(locations[0].name).toBe('Home');
    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('ORDER BY order_index'));
  });

  it('returns empty array when no locations exist', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const locations = await getAllLocations();

    expect(locations).toHaveLength(0);
  });

  it('handles database errors', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getAllLocations()).rejects.toThrow('Database error');
  });
});

// ── getAllGardens ──────────────────────────────────────────────────────────────

describe('getAllGardens', () => {
  it('returns all gardens ordered by order_index', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, location_id: 1, name: 'Raised Beds', order_index: 0 },
    ]);

    const gardens = await getAllGardens();

    expect(gardens).toHaveLength(1);
    expect(gardens[0].name).toBe('Raised Beds');
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('ORDER BY order_index'));
  });

  it('returns empty array when no gardens exist', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const gardens = await getAllGardens();

    expect(gardens).toHaveLength(0);
  });

  it('handles database errors', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getAllGardens()).rejects.toThrow('Database error');
  });
});

// ── getAllSections ─────────────────────────────────────────────────────────────

describe('getAllSections', () => {
  it('returns all sections ordered by order_index', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, garden_id: 1, name: 'Bed A', order_index: 0 },
    ]);

    const sections = await getAllSections();

    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('Bed A');
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('ORDER BY order_index'));
  });

  it('returns empty array when no sections exist', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const sections = await getAllSections();

    expect(sections).toHaveLength(0);
  });

  it('handles database errors', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getAllSections()).rejects.toThrow('Database error');
  });
});

// ── insertLocation ─────────────────────────────────────────────────────────────

describe('insertLocation', () => {
  it('inserts a location after computing order_index and returns new id', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ max: 0 });
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 2, changes: 1 });

    const id = await insertLocation('Home');

    expect(id).toBe(2);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO locations'),
      'Home', 1
    );
  });

  it('uses order_index 0 when table is empty', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ max: null });
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 1, changes: 1 });

    await insertLocation('First Location');

    expect(mockDb.runAsync).toHaveBeenCalledWith(expect.any(String), 'First Location', 0);
  });

  it('handles database errors', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ max: null });
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(insertLocation('Fail')).rejects.toThrow('Database error');
  });
});

// ── insertGarden ──────────────────────────────────────────────────────────────

describe('insertGarden', () => {
  it('inserts a garden with the correct locationId and returns new id', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ max: null });
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 3, changes: 1 });

    const id = await insertGarden(1, 'Greenhouse');

    expect(id).toBe(3);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO gardens'),
      1, 'Greenhouse', 0
    );
  });

  it('handles database errors', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ max: null });
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(insertGarden(1, 'Fail')).rejects.toThrow('Database error');
  });
});

// ── insertSection ──────────────────────────────────────────────────────────────

describe('insertSection', () => {
  it('inserts a section with the correct gardenId and returns new id', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ max: null });
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 4, changes: 1 });

    const id = await insertSection(2, 'Row 1');

    expect(id).toBe(4);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sections'),
      2, 'Row 1', 0
    );
  });

  it('handles database errors', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ max: null });
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(insertSection(1, 'Fail')).rejects.toThrow('Database error');
  });
});

// ── updateLocationName ─────────────────────────────────────────────────────────

describe('updateLocationName', () => {
  it('calls UPDATE locations with the new name and id', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await updateLocationName(1, 'Renamed');

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE locations'),
      'Renamed', 1
    );
  });

  it('resolves without a return value', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await expect(updateLocationName(1, 'x')).resolves.toBeUndefined();
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(updateLocationName(1, 'x')).rejects.toThrow('Database error');
  });
});

// ── updateGardenName ───────────────────────────────────────────────────────────

describe('updateGardenName', () => {
  it('calls UPDATE gardens with the new name and id', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await updateGardenName(2, 'New Garden Name');

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE gardens'),
      'New Garden Name', 2
    );
  });

  it('resolves without a return value', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await expect(updateGardenName(2, 'x')).resolves.toBeUndefined();
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(updateGardenName(2, 'x')).rejects.toThrow('Database error');
  });
});

// ── updateSectionName ──────────────────────────────────────────────────────────

describe('updateSectionName', () => {
  it('calls UPDATE sections with the new name and id', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await updateSectionName(3, 'New Section Name');

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE sections'),
      'New Section Name', 3
    );
  });

  it('resolves without a return value', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await expect(updateSectionName(3, 'x')).resolves.toBeUndefined();
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(updateSectionName(3, 'x')).rejects.toThrow('Database error');
  });
});

// ── deleteSection ──────────────────────────────────────────────────────────────

describe('deleteSection', () => {
  it('deletes the section by id', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await deleteSection(1);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM sections WHERE id = ?'),
      1
    );
  });

  it('resolves without a return value', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await expect(deleteSection(1)).resolves.toBeUndefined();
  });
});

// ── deleteGarden ───────────────────────────────────────────────────────────────

describe('deleteGarden', () => {
  it('deletes the garden by id', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await deleteGarden(1);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM gardens WHERE id = ?'),
      1
    );
  });

  it('resolves without a return value', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await expect(deleteGarden(1)).resolves.toBeUndefined();
  });
});

// ── deleteLocation ─────────────────────────────────────────────────────────────

describe('deleteLocation', () => {
  it('deletes the location by id', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await deleteLocation(1);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM locations WHERE id = ?'),
      1
    );
  });

  it('resolves without a return value', async () => {
    mockDb.runAsync.mockResolvedValue({});

    await expect(deleteLocation(1)).resolves.toBeUndefined();
  });
});
