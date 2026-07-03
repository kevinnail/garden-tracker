// expo-file-system v18 (SDK 54) uses a new synchronous class-based API.
// File and Directory instances represent paths; Paths.document is the persistent
// app document directory (equivalent to the old FileSystem.documentDirectory).
import { Directory, File, Paths } from 'expo-file-system';
import { NoteImage } from '@/src/types';
import { uuid } from '@/src/utils/uuid';

function getNoteImagesDir(): Directory {
  const dir = new Directory(Paths.document, 'note-images');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

export function createNoteImage(uri: string): NoteImage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    uuid: uuid(),
    uri,
    created_at: new Date().toISOString(),
  };
}

// A File handle inside the note-images directory (created if needed). Used by the
// image-sync download pass to write pulled bytes to a deterministic, uuid-named
// path so display can locate them.
export function noteImageDestination(fileName: string): File {
  return new File(getNoteImagesDir(), fileName);
}

// Raw bytes of a local file — the body for a presigned S3 PUT upload.
export function readImageBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

export function copyImageToAppStorage(tempUri: string): string {
  const dir = getNoteImagesDir();
  const candidate = tempUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? '';
  const ext = /^[a-z]{2,5}$/.test(candidate) ? candidate : 'jpg';
  const fileName = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const dest = new File(dir, fileName);
  const source = new File(tempUri);
  source.copy(dest);
  return dest.uri;
}

// Resolve the on-disk uri to render for an image. The uri baked into
// notes.content is the *origin device's* path — meaningless after sync — so a
// synced image is located by its uuid in the store's uuid→local_uri map, falling
// back to the embedded uri for images that predate sync or aren't downloaded yet.
export function resolveNoteImageUri(image: NoteImage, uriByUuid: Record<string, string>): string {
  return (image.uuid && uriByUuid[image.uuid]) || image.uri;
}

export function deleteImageFile(uri: string): boolean {
  try {
    if (!uri.startsWith('file://')) return false;
    const file = new File(uri);
    if (!file.exists) return false;
    file.delete();
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('Failed to delete note image.', { uri, error });
    }
    return false;
  }
}
