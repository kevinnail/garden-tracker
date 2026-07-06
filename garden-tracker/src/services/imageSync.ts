// Binary half of note-image sync (Slice F). The row metadata rides the normal
// push/pull engine (syncClient); the image bytes never do. Instead:
//   • upload pass  — before push: PUT each pending image's bytes straight to S3
//     via a presigned URL, then record the returned s3_key so the row becomes
//     pushable.
//   • download pass — after pull: fetch each new row's bytes once to a uuid-named
//     local file, then record local_uri so display can render from disk.
//   • cleanup      — delete local files for tombstoned rows.
// Every step is best-effort per row: one failure logs and is retried next sync,
// never aborting the surrounding sync.
import { File } from 'expo-file-system';

import { requestJson } from '@/src/services/apiClient';
import { authClient } from '@/src/services/authClient';
import {
  getPendingUploads,
  getPendingDownloads,
  getTombstonedLocalFiles,
  setS3Key,
  setLocalUri,
  clearLocalUri,
} from '@/src/db/queries/noteImageQueries';
import { noteImageDestination, readImageBytes, deleteImageFile } from '@/src/utils/imageStorage';
import { UUID_SHAPE } from '@/src/utils/uuid';

interface UploadUrlResponse {
  upload_url: string;
  s3_key: string;
}

interface DownloadUrlResponse {
  download_url: string;
}

// Every value here must be in the server's upload allow-list (jpeg/png/webp/heic
// in src/lib/s3.ts CONTENT_TYPE_EXT) — an unlisted type is rejected 400 at
// /sync/image/upload-url. HEIF-family picks map to the server's supported
// image/heic; anything unknown falls back to image/jpeg (contentTypeFor).
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heic',
};

function extOf(pathOrUri: string): string {
  const candidate = pathOrUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? '';
  return /^[a-z0-9]{2,5}$/.test(candidate) ? candidate : 'jpg';
}

function contentTypeFor(uri: string): string {
  return CONTENT_TYPE_BY_EXT[extOf(uri)] ?? 'image/jpeg';
}

// Same session-cookie header syncClient attaches to every /sync/* call (RN fetch
// has no cookie jar). Built here rather than imported from syncClient to avoid a
// circular import (syncClient's runSync drives these passes).
function authHeaders(): Record<string, string> {
  const cookie = authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}

function logImageSyncError(action: string, imageUuid: string, error: unknown): void {
  if (__DEV__) {
    console.warn(`Image sync ${action} failed for ${imageUuid}; will retry next sync.`, error);
  }
}

/**
 * Upload every image with local bytes but no S3 object yet. Runs before push so a
 * successful upload makes the row pushable in the same sync. `syncStartedAt` is
 * the sync-start instant used to stamp the row's updated_at (see setS3Key).
 */
export async function uploadPendingImages(syncStartedAt: string): Promise<void> {
  const pending = await getPendingUploads();
  for (const image of pending) {
    try {
      const contentType = contentTypeFor(image.local_uri);
      const { upload_url, s3_key } = await requestJson<UploadUrlResponse>(
        '/sync/image/upload-url',
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ uuid: image.uuid, content_type: contentType }),
        },
      );

      const bytes = await readImageBytes(image.local_uri);
      // Content-Type must byte-match what the server signed, or S3 rejects the
      // PUT with SignatureDoesNotMatch. Raw bytes (not a Blob) send no implicit
      // Content-Type, so our explicit header is the only one.
      const response = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        // expo/fetch accepts a raw Uint8Array body (sending no implicit
        // Content-Type); the DOM BodyInit type is narrower, hence the cast.
        body: bytes as unknown as BodyInit,
      });
      if (!response.ok) throw new Error(`S3 PUT failed: ${response.status}`);

      await setS3Key(image.uuid, s3_key, syncStartedAt);
    } catch (error) {
      logImageSyncError('upload', image.uuid, error);
    }
  }
}

/**
 * Download bytes for every pulled row that has an S3 object but no local file
 * yet, writing to a uuid-named file and recording local_uri. Runs after pull.
 */
export async function downloadPendingImages(): Promise<void> {
  const pending = await getPendingDownloads();
  for (const image of pending) {
    // The uuid becomes an on-disk file name below — never build a path from a
    // malformed one (defense-in-depth; synced rows are shape-checked on pull,
    // but uuids can also enter note_images via synced note content).
    if (!UUID_SHAPE.test(image.uuid)) continue;
    try {
      const { download_url } = await requestJson<DownloadUrlResponse>('/sync/image/download-url', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ s3_key: image.s3_key }),
      });

      const destination = noteImageDestination(`${image.uuid}.${extOf(image.s3_key)}`);
      // Throws on a non-2xx download; idempotent overwrites a partial retry.
      const downloaded = await File.downloadFileAsync(download_url, destination, {
        idempotent: true,
      });
      await setLocalUri(image.uuid, downloaded.uri);
    } catch (error) {
      logImageSyncError('download', image.uuid, error);
    }
  }
}

/** Delete on-disk files for tombstoned rows (best-effort; server GCs the S3 object). */
export async function cleanupTombstonedImages(): Promise<void> {
  const tombstoned = await getTombstonedLocalFiles();
  for (const image of tombstoned) {
    try {
      deleteImageFile(image.local_uri);
      await clearLocalUri(image.uuid);
    } catch (error) {
      logImageSyncError('cleanup', image.uuid, error);
    }
  }
}
