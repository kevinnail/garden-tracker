// * ==================================================
// *
// *    Unit tests — image storage utilities
// *
// *    expo-file-system's class-based API (SDK 54) is
// *    mocked at the module level so tests run in Node
// *    without a device.
// *
// * ==================================================

(global as any).__DEV__ = false;

import {
  createNoteImage,
  copyImageToAppStorage,
  deleteImageFile,
  getImageByteSize,
  rebaseNoteImageUri,
  resolveNoteImageUri,
} from '@/src/utils/imageStorage';

// ---------------------------------------------------------------------------
// Mock expo-file-system
// ---------------------------------------------------------------------------

const MOCK_IMAGES_DIR_URI = 'file:///app/documents/note-images/';

const mockDirCreate = jest.fn();
const mockFileCopy = jest.fn();
const mockFileDelete = jest.fn();

jest.mock('expo-file-system', () => {
  // Directory mock — has a .uri so File(dir, name) can derive its path
  const MockDirectory = jest.fn().mockImplementation(() => ({
    uri: MOCK_IMAGES_DIR_URI,
    exists: true,
    create: mockDirCreate,
  }));

  // File mock — handles both File(uri) and File(directory, name)
  const MockFile = jest.fn().mockImplementation((uriOrDir: unknown, name?: string) => {
    const uri = name ? `${(uriOrDir as { uri: string }).uri}${name}` : (uriOrDir as string);
    return {
      uri,
      exists: true,
      copy: mockFileCopy,
      delete: mockFileDelete,
    };
  });

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { document: 'file:///app/documents' },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createNoteImage
// ---------------------------------------------------------------------------

describe('createNoteImage', () => {
  it('returns an object with the provided uri', () => {
    const img = createNoteImage('file:///tmp/photo.jpg');
    expect(img.uri).toBe('file:///tmp/photo.jpg');
  });

  it('returns a non-empty string id', () => {
    const img = createNoteImage('file:///tmp/photo.jpg');
    expect(typeof img.id).toBe('string');
    expect(img.id.length).toBeGreaterThan(0);
  });

  it('generates unique ids on successive calls', () => {
    const a = createNoteImage('file:///tmp/a.jpg');
    const b = createNoteImage('file:///tmp/b.jpg');
    expect(a.id).not.toBe(b.id);
  });

  it('sets created_at to a valid ISO string', () => {
    const img = createNoteImage('file:///tmp/photo.jpg');
    expect(() => new Date(img.created_at).toISOString()).not.toThrow();
    expect(img.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// rebaseNoteImageUri — iOS moves the app container on every update/reinstall,
// so a stored absolute path must be re-anchored to the current container.
// ---------------------------------------------------------------------------

describe('rebaseNoteImageUri', () => {
  it('re-anchors a stale-container note-images path to the current directory', () => {
    const staleUri =
      'file:///var/mobile/Containers/Data/Application/EFFA1952-OLD/Documents/note-images/note-123-abc.jpg';
    expect(rebaseNoteImageUri(staleUri)).toBe(`${MOCK_IMAGES_DIR_URI}note-123-abc.jpg`);
  });

  it('passes through uris outside the note-images directory (picker temp files)', () => {
    const tempUri = 'file:///tmp/ImagePicker/photo.jpg';
    expect(rebaseNoteImageUri(tempUri)).toBe(tempUri);
  });

  it('passes through a note-images directory uri with no file name', () => {
    const dirUri = 'file:///var/mobile/old-container/Documents/note-images/';
    expect(rebaseNoteImageUri(dirUri)).toBe(dirUri);
  });
});

// ---------------------------------------------------------------------------
// resolveNoteImageUri
// ---------------------------------------------------------------------------

describe('resolveNoteImageUri', () => {
  const image = {
    id: 'entry-image-1',
    uuid: 'aaaa-bbbb',
    uri: 'file:///var/mobile/origin-device/Documents/note-images/note-777-xyz.jpg',
    created_at: '2026-07-01T00:00:00.000Z',
  };

  it('prefers the uuid-mapped local_uri, rebased to the current container', () => {
    const uriByUuid = {
      'aaaa-bbbb': 'file:///var/mobile/old-container/Documents/note-images/aaaa-bbbb.jpg',
    };
    expect(resolveNoteImageUri(image, uriByUuid)).toBe(`${MOCK_IMAGES_DIR_URI}aaaa-bbbb.jpg`);
  });

  it('falls back to the content-embedded uri, rebased, when the uuid is unmapped', () => {
    expect(resolveNoteImageUri(image, {})).toBe(`${MOCK_IMAGES_DIR_URI}note-777-xyz.jpg`);
  });
});

// ---------------------------------------------------------------------------
// deleteImageFile
// ---------------------------------------------------------------------------

describe('deleteImageFile', () => {
  it('returns false for URIs that do not start with file://', () => {
    expect(deleteImageFile('https://example.com/photo.jpg')).toBe(false);
    expect(deleteImageFile('')).toBe(false);
  });

  // The next two tests use uris outside note-images so the rebase passes them
  // through and the mockImplementationOnce lands on the delete's File handle.
  it('returns false when the file does not exist', () => {
    const { File } = jest.requireMock('expo-file-system');
    File.mockImplementationOnce((uri: string) => ({ uri, exists: false, delete: mockFileDelete }));

    expect(deleteImageFile('file:///app/photos/missing.jpg')).toBe(false);
    expect(mockFileDelete).not.toHaveBeenCalled();
  });

  it('calls file.delete() and returns true for a valid existing file', () => {
    expect(deleteImageFile('file:///app/note-images/photo.jpg')).toBe(true);
    expect(mockFileDelete).toHaveBeenCalledTimes(1);
  });

  it('deletes via the rebased path when given a stale-container uri', () => {
    const { File } = jest.requireMock('expo-file-system');
    expect(deleteImageFile('file:///var/old-container/Documents/note-images/photo.jpg')).toBe(true);
    const lastFileUri = File.mock.results[File.mock.results.length - 1]?.value.uri;
    expect(lastFileUri).toBe(`${MOCK_IMAGES_DIR_URI}photo.jpg`);
    expect(mockFileDelete).toHaveBeenCalledTimes(1);
  });

  it('returns false and does not throw when delete throws', () => {
    const { File } = jest.requireMock('expo-file-system');
    File.mockImplementationOnce((uri: string) => ({
      uri,
      exists: true,
      delete: jest.fn().mockImplementation(() => {
        throw new Error('permission denied');
      }),
    }));

    expect(deleteImageFile('file:///app/photos/photo.jpg')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getImageByteSize
// ---------------------------------------------------------------------------

describe('getImageByteSize', () => {
  it('returns the file size in bytes reported by the File handle', () => {
    const { File } = jest.requireMock('expo-file-system');
    File.mockImplementationOnce((uri: string) => ({ uri, size: 6018901 }));

    expect(getImageByteSize('file:///tmp/photo.heic')).toBe(6018901);
  });

  it('returns null when the file size is unreadable', () => {
    const { File } = jest.requireMock('expo-file-system');
    File.mockImplementationOnce((uri: string) => ({ uri, size: null }));

    expect(getImageByteSize('file:///tmp/missing.jpg')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// copyImageToAppStorage
// ---------------------------------------------------------------------------

describe('copyImageToAppStorage', () => {
  it('calls source.copy() with a destination File', () => {
    copyImageToAppStorage('file:///tmp/picked.jpg');
    expect(mockFileCopy).toHaveBeenCalledTimes(1);
  });

  it('returns a file:// URI', () => {
    const result = copyImageToAppStorage('file:///tmp/picked.jpg');
    expect(result).toMatch(/^file:\/\//);
  });

  it('preserves the file extension from the source URI', () => {
    const result = copyImageToAppStorage('file:///tmp/photo.png');
    expect(result).toMatch(/\.png$/);
  });

  it('defaults to .jpg when source has no extension', () => {
    const result = copyImageToAppStorage('file:///tmp/photo');
    expect(result).toMatch(/\.jpg$/);
  });

  it('strips query strings when determining extension', () => {
    const result = copyImageToAppStorage('file:///tmp/photo.jpeg?token=abc');
    expect(result).toMatch(/\.jpeg$/);
  });
});
