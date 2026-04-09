import {
  deleteNote,
  getAllNotesForCrop,
  getNoteForCell,
  upsertNote,
} from '@/src/db/queries/noteQueries';
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

describe('noteQueries', () => {
  it('upserts a note and returns it for the same crop/week cell', async () => {
    await upsertNote(SEED.CROP_ID, '2025-03-02', 'first note');

    const note = await getNoteForCell(SEED.CROP_ID, '2025-03-02');

    expect(note).not.toBeNull();
    expect(note?.content).toBe('first note');
    expect(note?.crop_instance_id).toBe(SEED.CROP_ID);
  });

  it('upserting the same cell twice keeps a single latest note row', async () => {
    const firstId = await upsertNote(SEED.CROP_ID, '2025-03-02', 'first note');
    const secondId = await upsertNote(SEED.CROP_ID, '2025-03-02', 'updated note');

    const note = await getNoteForCell(SEED.CROP_ID, '2025-03-02');
    const allNotes = await getAllNotesForCrop(SEED.CROP_ID);

    expect(secondId).toBe(firstId);
    expect(note?.content).toBe('updated note');
    expect(allNotes).toHaveLength(1);
  });

  it('deleting a note removes it from subsequent reads', async () => {
    const id = await upsertNote(SEED.CROP_ID, '2025-03-02', 'temporary note');
    await deleteNote(id);

    await expect(getNoteForCell(SEED.CROP_ID, '2025-03-02')).resolves.toBeNull();
  });

  it('getAllNotesForCrop only returns notes for the requested crop', async () => {
    await upsertNote(SEED.CROP_ID, '2025-03-02', 'crop one');
    await upsertNote(999, '2025-03-02', 'other crop');

    const notes = await getAllNotesForCrop(SEED.CROP_ID);

    expect(notes).toHaveLength(1);
    expect(notes[0].content).toBe('crop one');
  });
});