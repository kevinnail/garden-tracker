import {
  deleteNote,
  getAllNotesForCrop,
  getNoteForCell,
  upsertNote,
} from '@/src/db/queries/noteQueries';
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

describe('getNoteForCell', () => {
  it('calls db with cropInstanceId and weekDate', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: 1, content: 'note' });

    await getNoteForCell(1, '2025-03-02');

    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE entity_type = ? AND crop_instance_id = ? AND week_date = ?'),
      'week_cell',
      1,
      '2025-03-02'
    );
  });

  it('returns null when no note exists', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    await expect(getNoteForCell(1, '2025-03-02')).resolves.toBeNull();
  });

  it('handles database errors', async () => {
    mockDb.getFirstAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getNoteForCell(1, '2025-03-02')).rejects.toThrow('Database error');
  });
});

describe('upsertNote', () => {
  it('inserts a new note and returns the inserted id', async () => {
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 8, changes: 1 });
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: 8 });

    const id = await upsertNote(1, '2025-03-02', 'hello');

    expect(id).toBe(8);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notes'),
      'week_cell',
      1,
      '2025-03-02',
      'hello'
    );
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM notes WHERE entity_type = ? AND crop_instance_id = ? AND week_date = ?'),
      'week_cell',
      1,
      '2025-03-02'
    );
  });

  it('updates an existing note via the upsert path and returns the existing id', async () => {
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 3, changes: 1 });
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: 3 });

    const id = await upsertNote(1, '2025-03-02', 'updated');

    expect(id).toBe(3);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notes'),
      'week_cell',
      1,
      '2025-03-02',
      'updated'
    );
  });

  it('handles database errors', async () => {
    mockDb.getFirstAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(upsertNote(1, '2025-03-02', 'x')).rejects.toThrow('Database error');
  });
});

describe('deleteNote', () => {
  it('calls db with the note id', async () => {
    mockDb.runAsync.mockResolvedValueOnce({});

    await deleteNote(4);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM notes WHERE id = ?'),
      4
    );
  });

  it('handles database errors', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(deleteNote(4)).rejects.toThrow('Database error');
  });
});

describe('getAllNotesForCrop', () => {
  it('returns all notes for a given crop', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, crop_instance_id: 1, week_date: '2025-03-02', content: 'a' },
      { id: 2, crop_instance_id: 1, week_date: '2025-03-09', content: 'b' },
    ]);

    const results = await getAllNotesForCrop(1);

    expect(results).toHaveLength(2);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE entity_type = ? AND crop_instance_id = ?'),
      'week_cell',
      1
    );
  });

  it('handles database errors', async () => {
    mockDb.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

    await expect(getAllNotesForCrop(1)).rejects.toThrow('Database error');
  });
});