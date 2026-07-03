// * ==================================================
// *
// *    Integration tests — Slice F note_images data layer
// *
// *    Real in-memory SQLite. Covers reconcileNoteImages (the
// *    bridge that keeps note_images rows in step with the image
// *    uuids embedded in a note's content) and the cascade
// *    tombstone that fires when a note or its parent crop is
// *    deleted. A tombstone must retain its s3_key so the server
// *    can delete the S3 object on push.
// *
// * ==================================================

import {
  reconcileNoteImages,
  getPendingUploads,
  getNoteImageUriMap,
} from '@/src/db/queries/noteImageQueries';
import { deleteNote, upsertNote } from '@/src/db/queries/noteQueries';
import { deleteCropInstance } from '@/src/db/queries/cropQueries';
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

interface ImageRow {
  uuid: string;
  note_id: number;
  s3_key: string | null;
  local_uri: string | null;
  deleted_at: string | null;
}

const imageRow = (imageUuid: string): ImageRow =>
  rawDb.prepare('SELECT * FROM note_images WHERE uuid = ?').get(imageUuid) as ImageRow;

async function seedNote(content = 'weekly note'): Promise<number> {
  return upsertNote(SEED.CROP_ID, SEED.START_DATE, content);
}

describe('reconcileNoteImages', () => {
  it('inserts an active, upload-pending row for each new image uuid', async () => {
    const noteId = await seedNote();
    await reconcileNoteImages(noteId, [
      { uuid: 'img-a', uri: 'file:///docs/a.jpg' },
      { uuid: 'img-b', uri: 'file:///docs/b.png' },
    ]);

    const rowA = imageRow('img-a');
    expect(rowA.note_id).toBe(noteId);
    expect(rowA.local_uri).toBe('file:///docs/a.jpg');
    expect(rowA.s3_key).toBeNull(); // upload pending
    expect(rowA.deleted_at).toBeNull();
    expect(imageRow('img-b').local_uri).toBe('file:///docs/b.png');
  });

  it('tombstones a removed image but keeps its s3_key for the server-side delete', async () => {
    const noteId = await seedNote();
    await reconcileNoteImages(noteId, [
      { uuid: 'img-a', uri: 'file:///docs/a.jpg' },
      { uuid: 'img-b', uri: 'file:///docs/b.jpg' },
    ]);
    // Simulate img-a having been uploaded.
    rawDb
      .prepare("UPDATE note_images SET s3_key = 'note-images/u/img-a.jpg' WHERE uuid = 'img-a'")
      .run();

    // Save again with img-a removed.
    await reconcileNoteImages(noteId, [{ uuid: 'img-b', uri: 'file:///docs/b.jpg' }]);

    const rowA = imageRow('img-a');
    expect(rowA.deleted_at).not.toBeNull();
    expect(rowA.s3_key).toBe('note-images/u/img-a.jpg'); // retained for DeleteObject
    expect(imageRow('img-b').deleted_at).toBeNull();
  });

  it('is idempotent — re-saving the same set neither duplicates nor tombstones, and preserves s3_key', async () => {
    const noteId = await seedNote();
    await reconcileNoteImages(noteId, [{ uuid: 'img-a', uri: 'file:///docs/a.jpg' }]);
    rawDb
      .prepare("UPDATE note_images SET s3_key = 'note-images/u/img-a.jpg' WHERE uuid = 'img-a'")
      .run();

    await reconcileNoteImages(noteId, [{ uuid: 'img-a', uri: 'file:///docs/a.jpg' }]);

    const count = (
      rawDb.prepare("SELECT COUNT(*) AS n FROM note_images WHERE uuid = 'img-a'").get() as {
        n: number;
      }
    ).n;
    expect(count).toBe(1);
    const rowA = imageRow('img-a');
    expect(rowA.deleted_at).toBeNull();
    expect(rowA.s3_key).toBe('note-images/u/img-a.jpg');
  });

  it('tombstones every image when the note keeps no images', async () => {
    const noteId = await seedNote();
    await reconcileNoteImages(noteId, [{ uuid: 'img-a', uri: 'file:///docs/a.jpg' }]);

    await reconcileNoteImages(noteId, []);

    expect(imageRow('img-a').deleted_at).not.toBeNull();
  });
});

describe('getPendingUploads', () => {
  it('returns only active rows without an s3_key', async () => {
    const noteId = await seedNote();
    await reconcileNoteImages(noteId, [
      { uuid: 'img-a', uri: 'file:///docs/a.jpg' },
      { uuid: 'img-b', uri: 'file:///docs/b.jpg' },
    ]);
    rawDb
      .prepare("UPDATE note_images SET s3_key = 'note-images/u/img-b.jpg' WHERE uuid = 'img-b'")
      .run();

    const pending = await getPendingUploads();
    expect(pending).toEqual([{ uuid: 'img-a', local_uri: 'file:///docs/a.jpg' }]);
  });
});

describe('getNoteImageUriMap', () => {
  it('maps uuid → local_uri for active rows that have bytes on disk', async () => {
    const noteId = await seedNote();
    await reconcileNoteImages(noteId, [{ uuid: 'img-a', uri: 'file:///docs/a.jpg' }]);
    // A pulled-but-not-downloaded row: has s3_key, no local_uri — excluded.
    rawDb
      .prepare(
        "INSERT INTO note_images (uuid, note_id, s3_key) VALUES ('img-remote', ?, 'note-images/u/img-remote.jpg')",
      )
      .run(noteId);

    const map = await getNoteImageUriMap();
    expect(map).toEqual({ 'img-a': 'file:///docs/a.jpg' });
  });
});

describe('cascade tombstone on delete', () => {
  it('deleteNote tombstones the note and its images', async () => {
    const noteId = await seedNote();
    await reconcileNoteImages(noteId, [{ uuid: 'img-a', uri: 'file:///docs/a.jpg' }]);

    await deleteNote(noteId);

    expect(imageRow('img-a').deleted_at).not.toBeNull();
  });

  it('deleteCropInstance cascades a tombstone down to the note images', async () => {
    const noteId = await seedNote();
    await reconcileNoteImages(noteId, [{ uuid: 'img-a', uri: 'file:///docs/a.jpg' }]);

    await deleteCropInstance(SEED.CROP_ID);

    expect(imageRow('img-a').deleted_at).not.toBeNull();
  });
});
