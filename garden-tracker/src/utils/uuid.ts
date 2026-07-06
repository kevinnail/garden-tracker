// RFC-4122 v4 UUID, pure JS (no dependency). Used as the cross-device sync key
// stamped into a NoteImage inside notes.content (Slice F), so the same identity
// can be matched against a `note_images` row on any device. SQLite-side rows
// generate their uuid via schema.UUID4_SQL; this is the JS-side equivalent for
// values that must exist before they reach the database.
// Allow-list for uuids that arrive from outside this device (sync wire, synced
// note content) before they are used to build local file paths or DB rows:
// letters, digits, and hyphens only — every generated uuid matches, and a
// hostile value (e.g. `../`) can never traverse paths when used as a file name.
export const UUID_SHAPE = /^[A-Za-z0-9-]{1,64}$/;

export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
