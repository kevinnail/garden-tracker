// expo-file-system v18 (SDK 54) uses a new synchronous class-based API.
// File and Directory instances represent paths; Paths.document is the persistent
// app document directory (equivalent to the old FileSystem.documentDirectory).
import { Directory, File, Paths } from 'expo-file-system';
import { NoteImage } from '@/src/types';

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
    uri,
    created_at: new Date().toISOString(),
  };
}

export function copyImageToAppStorage(tempUri: string): string {
  const dir = getNoteImagesDir();
  const ext = tempUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
  const fileName = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const dest = new File(dir, fileName);
  const source = new File(tempUri);
  source.copy(dest);
  return dest.uri;
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
