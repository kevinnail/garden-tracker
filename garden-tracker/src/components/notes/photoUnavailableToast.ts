// Shared toast for an image that fails to render — most often one too large to
// have been backed up (over MAX_IMAGE_BYTES) or one whose bytes never reached
// this device. Kept in one place so the strip and the full-screen viewer show
// the same wording. expo-image's onError carries no reason, so the copy stays
// honest about the likely cause without over-claiming it.
export const PHOTO_UNAVAILABLE_TOAST = {
  type: 'error',
  text1: 'Photo unavailable',
  text2: "It may be too large to back up, or hasn't synced to this device.",
  visibilityTime: 4000,
} as const;
