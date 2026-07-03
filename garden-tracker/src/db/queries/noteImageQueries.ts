// Data access for the `note_images` table (Slice F). Each row is the sync
// counterpart of one image embedded in a note's content JSON, joined by `uuid`.
// The binary lives in S3 (`s3_key`) and on disk (`local_uri`, device-local —
// never synced). These functions maintain the table alongside note edits and
// feed the sync passes in syncClient.
import { type SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '@/src/db/database';
import { TS_NOW } from '@/src/db/schema';

export interface PendingUpload {
  uuid: string;
  local_uri: string;
}

export interface PendingDownload {
  uuid: string;
  s3_key: string;
}

/**
 * Bring the `note_images` rows for one note in line with the images currently in
 * its content. Inserts a row (active, `s3_key`/upload pending) for each image
 * `uuid` not already present; tombstones rows whose `uuid` is gone. A tombstone
 * keeps its `s3_key` so the server's best-effort `DeleteObject` can fire on push.
 * Existing active rows are left untouched (preserving `s3_key`/`local_uri`).
 */
export async function reconcileNoteImages(
  noteId: number,
  images: { uuid: string; uri: string }[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const image of images) {
      await db.runAsync(
        `INSERT INTO note_images (uuid, note_id, local_uri, created_at, updated_at)
         VALUES (?, ?, ?, ${TS_NOW}, ${TS_NOW})
         ON CONFLICT(uuid) DO NOTHING`,
        image.uuid,
        noteId,
        image.uri,
      );
    }

    // Tombstone rows for this note whose image is no longer present.
    const keepUuids = images.map((image) => image.uuid);
    const placeholders = keepUuids.map(() => '?').join(',');
    const notInClause = keepUuids.length > 0 ? `AND uuid NOT IN (${placeholders})` : '';
    await db.runAsync(
      `UPDATE note_images SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW}
       WHERE note_id = ? AND deleted_at IS NULL ${notInClause}`,
      noteId,
      ...keepUuids,
    );
  });
}

/**
 * Cascade-tombstone every image of the given notes. Used when a note (or its
 * parent crop) is deleted — mirrors the Slice A/B soft-delete discipline so the
 * removal, and the server-side S3 delete, propagate on the next sync. Accepts the
 * caller's db handle so it can run inside an existing transaction.
 */
export async function tombstoneNoteImagesForNotes(
  db: SQLiteDatabase,
  noteIds: number[],
): Promise<void> {
  if (noteIds.length === 0) return;
  const placeholders = noteIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE note_images SET deleted_at = ${TS_NOW}, updated_at = ${TS_NOW}
     WHERE note_id IN (${placeholders}) AND deleted_at IS NULL`,
    ...noteIds,
  );
}

/** `uuid → local_uri` for every active image that has bytes on disk (display). */
export async function getNoteImageUriMap(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ uuid: string; local_uri: string }>(
    `SELECT uuid, local_uri FROM note_images WHERE deleted_at IS NULL AND local_uri IS NOT NULL`,
  );
  const map: Record<string, string> = {};
  for (const row of rows) map[row.uuid] = row.local_uri;
  return map;
}

/** Active rows with bytes on disk but not yet in S3 — upload before push. */
export async function getPendingUploads(): Promise<PendingUpload[]> {
  const db = await getDb();
  return db.getAllAsync<PendingUpload>(
    `SELECT uuid, local_uri FROM note_images
     WHERE deleted_at IS NULL AND s3_key IS NULL AND local_uri IS NOT NULL`,
  );
}

/** Active rows with an S3 object but no local bytes yet — download after pull. */
export async function getPendingDownloads(): Promise<PendingDownload[]> {
  const db = await getDb();
  return db.getAllAsync<PendingDownload>(
    `SELECT uuid, s3_key FROM note_images
     WHERE deleted_at IS NULL AND s3_key IS NOT NULL AND local_uri IS NULL`,
  );
}

/**
 * Record the S3 key after a successful upload and stamp `updated_at` to the
 * sync-start instant. The bump makes a *deferred* upload (a row created in an
 * earlier sync whose first upload failed) eligible for the immediately-following
 * push, while still landing at/below the checkpoint so the row isn't re-collected
 * on the next sync. Passed `syncTimestamp` (the SQLite-captured sync start) so it
 * is byte-identical in format to every other timestamp.
 */
export async function setS3Key(
  imageUuid: string,
  s3Key: string,
  syncTimestamp: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE note_images SET s3_key = ?, updated_at = ? WHERE uuid = ?`,
    s3Key,
    syncTimestamp,
    imageUuid,
  );
}

/**
 * Record the on-disk path after a successful download. Local-only — never bumps
 * `updated_at`, so a pulled row's downloaded bytes don't loop back into push.
 */
export async function setLocalUri(imageUuid: string, localUri: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE note_images SET local_uri = ? WHERE uuid = ?`, localUri, imageUuid);
}

/** Tombstoned rows that still have a local file to clean up. */
export async function getTombstonedLocalFiles(): Promise<{ uuid: string; local_uri: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ uuid: string; local_uri: string }>(
    `SELECT uuid, local_uri FROM note_images WHERE deleted_at IS NOT NULL AND local_uri IS NOT NULL`,
  );
}

/** Forget a tombstoned row's local path once its file is deleted (idempotent GC). */
export async function clearLocalUri(imageUuid: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE note_images SET local_uri = NULL WHERE uuid = ?`, imageUuid);
}
