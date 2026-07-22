// * ==================================================
// *
// *    Unit tests — Slice F image binary transfer (imageSync)
// *
// *    The presigned-URL endpoints, the S3 PUT/GET, the local
// *    file system, and the DB layer are all mocked. These lock
// *    the request shapes and the s3_key / local_uri persistence;
// *    the real S3 round-trip is a manual device pass.
// *
// * ==================================================

(global as any).__DEV__ = false;

import {
  uploadPendingImages,
  downloadPendingImages,
  cleanupTombstonedImages,
} from '@/src/services/imageSync';
import { requestJson, ApiClientError } from '@/src/services/apiClient';
import {
  getPendingUploads,
  getPendingDownloads,
  getTombstonedLocalFiles,
  setS3Key,
  setLocalUri,
  clearLocalUri,
  markImageTooLarge,
} from '@/src/db/queries/noteImageQueries';
import {
  noteImageDestination,
  readImageBytes,
  deleteImageFile,
  MAX_IMAGE_BYTES,
} from '@/src/utils/imageStorage';
import { File } from 'expo-file-system';

// Keep the real ApiClientError (the give-up branch does `instanceof` on it);
// only requestJson is stubbed.
jest.mock('@/src/services/apiClient', () => ({
  ...jest.requireActual('@/src/services/apiClient'),
  requestJson: jest.fn(),
}));
jest.mock('@/src/services/authClient', () => ({
  authClient: { getCookie: () => 'better-auth.session_token=cookie' },
}));
jest.mock('@/src/db/queries/noteImageQueries', () => ({
  getPendingUploads: jest.fn(),
  getPendingDownloads: jest.fn(),
  getTombstonedLocalFiles: jest.fn(),
  setS3Key: jest.fn(),
  setLocalUri: jest.fn(),
  clearLocalUri: jest.fn(),
  markImageTooLarge: jest.fn(),
}));
jest.mock('@/src/utils/imageStorage', () => ({
  noteImageDestination: jest.fn((name: string) => ({
    uri: `file:///documents/note-images/${name}`,
  })),
  readImageBytes: jest.fn(async () => new Uint8Array([1, 2, 3])),
  deleteImageFile: jest.fn(),
  MAX_IMAGE_BYTES: 15 * 1024 * 1024,
}));
jest.mock('expo-file-system', () => ({
  File: {
    downloadFileAsync: jest.fn(async (_url: string, dest: { uri: string }) => ({ uri: dest.uri })),
  },
}));

const requestJsonMock = requestJson as jest.Mock;
const okResponse = { ok: true, status: 200 } as Response;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => okResponse) as unknown as typeof global.fetch;
});

describe('uploadPendingImages', () => {
  beforeEach(() => {
    (getPendingUploads as jest.Mock).mockResolvedValue([
      { uuid: 'img-a', local_uri: 'file:///documents/note-images/a.jpg' },
    ]);
    requestJsonMock.mockResolvedValue({
      upload_url: 'https://s3.example/put?sig=1',
      s3_key: 'note-images/user-1/img-a.jpg',
    });
  });

  it('requests an upload URL with the uuid, content type, and exact byte length', async () => {
    await uploadPendingImages('2026-07-01 00:00:00.000');

    expect(requestJsonMock).toHaveBeenCalledWith(
      '/sync/image/upload-url',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(requestJsonMock.mock.calls[0][1].body);
    // readImageBytes is mocked to return a 3-byte Uint8Array, so content_length
    // must be exactly 3 — the value the server signs into the PUT's ContentLength.
    expect(body).toEqual({ uuid: 'img-a', content_type: 'image/jpeg', content_length: 3 });
  });

  it('PUTs the raw bytes to S3 with a Content-Type that matches the presign', async () => {
    await uploadPendingImages('2026-07-01 00:00:00.000');

    expect(readImageBytes).toHaveBeenCalledWith('file:///documents/note-images/a.jpg');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://s3.example/put?sig=1');
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('image/jpeg');
    expect(init.body).toBeInstanceOf(Uint8Array);
  });

  it('records the returned s3_key stamped with the sync-start time', async () => {
    await uploadPendingImages('2026-07-01 00:00:00.000');
    expect(setS3Key).toHaveBeenCalledWith(
      'img-a',
      'note-images/user-1/img-a.jpg',
      '2026-07-01 00:00:00.000',
    );
  });

  it('is best-effort: a failed S3 PUT does not throw and does not record the key', async () => {
    global.fetch = jest.fn(
      async () => ({ ok: false, status: 403 }) as Response,
    ) as unknown as typeof global.fetch;

    // A non-IMAGE_TOO_LARGE failure is logged + retried, not flagged: 0 skipped.
    await expect(uploadPendingImages('2026-07-01 00:00:00.000')).resolves.toBe(0);
    expect(setS3Key).not.toHaveBeenCalled();
    expect(markImageTooLarge).not.toHaveBeenCalled();
  });

  it('gives up locally on an oversize image: flags it, requests no URL, counts it', async () => {
    // Stub the byte read as one byte over the cap (no real 15 MB allocation).
    (readImageBytes as jest.Mock).mockResolvedValueOnce({
      byteLength: MAX_IMAGE_BYTES + 1,
    } as unknown as Uint8Array);

    const skipped = await uploadPendingImages('2026-07-01 00:00:00.000');

    expect(skipped).toBe(1);
    expect(markImageTooLarge).toHaveBeenCalledWith('img-a');
    expect(requestJsonMock).not.toHaveBeenCalled(); // never asked for an upload URL
    expect(global.fetch).not.toHaveBeenCalled(); // never PUT to S3
    expect(setS3Key).not.toHaveBeenCalled();
  });

  it('gives up on a server 400 IMAGE_TOO_LARGE: flags it and counts it', async () => {
    requestJsonMock.mockRejectedValueOnce(
      new ApiClientError('Image too large', 'http', 400, {
        error: 'Image too large',
        code: 'IMAGE_TOO_LARGE',
        max_bytes: MAX_IMAGE_BYTES,
      }),
    );

    const skipped = await uploadPendingImages('2026-07-01 00:00:00.000');

    expect(skipped).toBe(1);
    expect(markImageTooLarge).toHaveBeenCalledWith('img-a');
    expect(setS3Key).not.toHaveBeenCalled();
  });

  it('does not flag on other 400s (only IMAGE_TOO_LARGE): 0 skipped', async () => {
    requestJsonMock.mockRejectedValueOnce(
      new ApiClientError('Bad request', 'http', 400, { error: 'Bad request' }),
    );

    await expect(uploadPendingImages('2026-07-01 00:00:00.000')).resolves.toBe(0);
    expect(markImageTooLarge).not.toHaveBeenCalled();
  });

  it('flags only the oversize row and still uploads the normal one', async () => {
    (getPendingUploads as jest.Mock).mockResolvedValue([
      { uuid: 'img-big', local_uri: 'file:///documents/note-images/big.jpg' },
      { uuid: 'img-ok', local_uri: 'file:///documents/note-images/ok.jpg' },
    ]);
    // First row oversize (local give-up), second row normal 3 bytes.
    (readImageBytes as jest.Mock)
      .mockResolvedValueOnce({ byteLength: MAX_IMAGE_BYTES + 1 } as unknown as Uint8Array)
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]));

    const skipped = await uploadPendingImages('2026-07-01 00:00:00.000');

    expect(skipped).toBe(1);
    expect(markImageTooLarge).toHaveBeenCalledWith('img-big');
    expect(markImageTooLarge).toHaveBeenCalledTimes(1);
    // The normal row still uploaded and recorded its key.
    expect(setS3Key).toHaveBeenCalledWith(
      'img-ok',
      'note-images/user-1/img-a.jpg',
      '2026-07-01 00:00:00.000',
    );
  });
});

describe('downloadPendingImages', () => {
  beforeEach(() => {
    (getPendingDownloads as jest.Mock).mockResolvedValue([
      { uuid: 'img-b', s3_key: 'note-images/user-1/img-b.png' },
    ]);
    requestJsonMock.mockResolvedValue({ download_url: 'https://s3.example/get?sig=2' });
  });

  it('requests a download URL for the s3_key and writes bytes to a uuid-named file', async () => {
    await downloadPendingImages();

    const body = JSON.parse(requestJsonMock.mock.calls[0][1].body);
    expect(requestJsonMock.mock.calls[0][0]).toBe('/sync/image/download-url');
    expect(body).toEqual({ s3_key: 'note-images/user-1/img-b.png' });

    expect(noteImageDestination).toHaveBeenCalledWith('img-b.png');
    expect(File.downloadFileAsync).toHaveBeenCalledWith(
      'https://s3.example/get?sig=2',
      { uri: 'file:///documents/note-images/img-b.png' },
      { idempotent: true },
    );
    expect(setLocalUri).toHaveBeenCalledWith('img-b', 'file:///documents/note-images/img-b.png');
  });

  it('is best-effort: a failed download does not throw and does not record local_uri', async () => {
    (File.downloadFileAsync as jest.Mock).mockRejectedValueOnce(new Error('UnableToDownload'));

    await expect(downloadPendingImages()).resolves.toBeUndefined();
    expect(setLocalUri).not.toHaveBeenCalled();
  });
});

describe('cleanupTombstonedImages', () => {
  it('deletes the local file and clears local_uri for each tombstoned row', async () => {
    (getTombstonedLocalFiles as jest.Mock).mockResolvedValue([
      { uuid: 'img-c', local_uri: 'file:///documents/note-images/c.jpg' },
    ]);

    await cleanupTombstonedImages();

    expect(deleteImageFile).toHaveBeenCalledWith('file:///documents/note-images/c.jpg');
    expect(clearLocalUri).toHaveBeenCalledWith('img-c');
  });
});
