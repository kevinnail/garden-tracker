// expo-file-system v18 (SDK 54) uses a new synchronous class-based API.
// File and Directory instances represent paths; Paths.document is the persistent
// app document directory (equivalent to the old FileSystem.documentDirectory).
import { Directory, File, Paths } from 'expo-file-system';
import { NoteImage } from '@/src/types';
import { uuid } from '@/src/utils/uuid';

// Mirrors the server's MAX_IMAGE_BYTES (crop-planner-server src/lib/s3.ts). The
// upload form rejects anything larger before it enters a note; the server still
// enforces the same cap in the presigned URL, since the client check is only UX.
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

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

// iOS assigns the app a new container UUID on every update/reinstall, so any
// persisted absolute file:// path (note_images.local_uri, the uri baked into
// notes.content) eventually points at a container that no longer exists — even
// though the file itself survived under the new container. Every note image
// lives flat in the note-images directory under a unique file name, so the file
// name alone identifies it: re-anchor stored paths to the current container at
// every use. URIs outside note-images (e.g. picker temp files) pass through.
export function rebaseNoteImageUri(uri: string): string {
  const marker = '/note-images/';
  const markerIndex = uri.lastIndexOf(marker);
  if (markerIndex === -1) return uri;
  const fileName = uri.slice(markerIndex + marker.length);
  if (fileName.length === 0 || fileName.includes('/')) return uri;
  return new File(getNoteImagesDir(), fileName).uri;
}

// Raw bytes of a local file — the body for a presigned S3 PUT upload.
export function readImageBytes(uri: string): Promise<Uint8Array> {
  return new File(rebaseNoteImageUri(uri)).bytes();
}

// Byte size of a local file without reading its contents (form-level upload
// gate). Falls through to null when the file can't be stat'd, so callers treat
// an unknown size as "let it through" rather than blocking a valid image.
export function getImageByteSize(uri: string): number | null {
  return new File(uri).size;
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
// Either way the stored path may predate a container move, so it is rebased.
export function resolveNoteImageUri(image: NoteImage, uriByUuid: Record<string, string>): string {
  return rebaseNoteImageUri((image.uuid && uriByUuid[image.uuid]) || image.uri);
}

export function deleteImageFile(uri: string): boolean {
  try {
    if (!uri.startsWith('file://')) return false;
    const file = new File(rebaseNoteImageUri(uri));
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
