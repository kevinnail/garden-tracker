// * ==================================================
// *
// *    Unit tests — weekly note utility functions
// *
// *    Pure functions — no mocking required.
// *    Covers serialization round-trips and the image-
// *    aware filter/sort behavior added in the note-images
// *    feature branch.
// *
// * ==================================================

(global as any).__DEV__ = false;

import {
  parseWeeklyNoteEntries,
  serializeWeeklyNoteEntries,
  createWeeklyNoteEntry,
  updateWeeklyNoteEntry,
  compareWeeklyNoteEntries,
} from '@/src/utils/noteUtils';
import { NoteImage, WeeklyNoteEntry } from '@/src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(content: string) {
  return { content, week_date: '2025-03-02', created_at: '2025-03-02T00:00:00.000Z', updated_at: '2025-03-02T00:00:00.000Z' };
}

function makeImage(id = 'img-1'): NoteImage {
  return { id, uri: `file:///app/note-images/${id}.jpg`, created_at: '2025-03-03T10:00:00.000Z' };
}

function makeEntry(overrides: Partial<WeeklyNoteEntry> = {}): WeeklyNoteEntry {
  return {
    id: 'entry-1',
    day_of_week: 1,
    text: 'some text',
    created_at: '2025-03-03T09:00:00.000Z',
    updated_at: '2025-03-03T09:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseWeeklyNoteEntries
// ---------------------------------------------------------------------------

describe('parseWeeklyNoteEntries', () => {
  it('returns empty array for null note', () => {
    expect(parseWeeklyNoteEntries(null)).toEqual([]);
  });

  it('returns empty array for empty content', () => {
    expect(parseWeeklyNoteEntries(makeNote(''))).toEqual([]);
    expect(parseWeeklyNoteEntries(makeNote('   '))).toEqual([]);
  });

  it('returns empty array for malformed JSON', () => {
    expect(parseWeeklyNoteEntries(makeNote('not json'))).toEqual([]);
  });

  it('returns empty array for JSON that fails the shape guard', () => {
    expect(parseWeeklyNoteEntries(makeNote(JSON.stringify({ version: 2, entries: [] })))).toEqual([]);
  });

  it('returns entries that have text', () => {
    const entry = makeEntry({ text: 'watered today' });
    const content = JSON.stringify({ version: 1, entries: [entry] });
    const results = parseWeeklyNoteEntries(makeNote(content));
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('watered today');
  });

  it('includes entries that have images but no text', () => {
    const entry = makeEntry({ text: '', images: [makeImage()] });
    const content = JSON.stringify({ version: 1, entries: [entry] });
    const results = parseWeeklyNoteEntries(makeNote(content));
    expect(results).toHaveLength(1);
    expect(results[0].images).toHaveLength(1);
  });

  it('excludes entries with neither text nor images', () => {
    const entry = makeEntry({ text: '', images: [] });
    const content = JSON.stringify({ version: 1, entries: [entry] });
    expect(parseWeeklyNoteEntries(makeNote(content))).toHaveLength(0);
  });

  it('excludes entries with whitespace-only text and no images', () => {
    const entry = makeEntry({ text: '   ', images: undefined });
    const content = JSON.stringify({ version: 1, entries: [entry] });
    expect(parseWeeklyNoteEntries(makeNote(content))).toHaveLength(0);
  });

  it('sorts entries by day_of_week ascending', () => {
    const fri = makeEntry({ id: 'e2', day_of_week: 5, created_at: '2025-03-07T08:00:00.000Z', updated_at: '2025-03-07T08:00:00.000Z' });
    const mon = makeEntry({ id: 'e1', day_of_week: 1, created_at: '2025-03-03T08:00:00.000Z', updated_at: '2025-03-03T08:00:00.000Z' });
    const content = JSON.stringify({ version: 1, entries: [fri, mon] });
    const results = parseWeeklyNoteEntries(makeNote(content));
    expect(results[0].day_of_week).toBe(1);
    expect(results[1].day_of_week).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// serializeWeeklyNoteEntries
// ---------------------------------------------------------------------------

describe('serializeWeeklyNoteEntries', () => {
  it('round-trips an entry with text', () => {
    const entry = makeEntry({ text: 'watered' });
    const serialized = serializeWeeklyNoteEntries([entry]);
    const results = parseWeeklyNoteEntries(makeNote(serialized));
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('watered');
  });

  it('round-trips an entry with images and no text', () => {
    const img = makeImage();
    const entry = makeEntry({ text: '', images: [img] });
    const serialized = serializeWeeklyNoteEntries([entry]);
    const results = parseWeeklyNoteEntries(makeNote(serialized));
    expect(results).toHaveLength(1);
    expect(results[0].images?.[0].id).toBe(img.id);
    expect(results[0].images?.[0].uri).toBe(img.uri);
  });

  it('round-trips an entry with both text and images', () => {
    const img = makeImage('img-2');
    const entry = makeEntry({ text: 'pruned', images: [img] });
    const serialized = serializeWeeklyNoteEntries([entry]);
    const results = parseWeeklyNoteEntries(makeNote(serialized));
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('pruned');
    expect(results[0].images?.[0].id).toBe('img-2');
  });

  it('drops entries with neither text nor images', () => {
    const entry = makeEntry({ text: '  ', images: [] });
    const serialized = serializeWeeklyNoteEntries([entry]);
    const results = parseWeeklyNoteEntries(makeNote(serialized));
    expect(results).toHaveLength(0);
  });

  it('produces valid JSON', () => {
    const entry = makeEntry();
    expect(() => JSON.parse(serializeWeeklyNoteEntries([entry]))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createWeeklyNoteEntry
// ---------------------------------------------------------------------------

describe('createWeeklyNoteEntry', () => {
  it('creates an entry with trimmed text', () => {
    const entry = createWeeklyNoteEntry(2, '  hello  ');
    expect(entry.text).toBe('hello');
    expect(entry.day_of_week).toBe(2);
  });

  it('includes images when provided', () => {
    const imgs = [makeImage('a'), makeImage('b')];
    const entry = createWeeklyNoteEntry(3, 'note', imgs);
    expect(entry.images).toHaveLength(2);
    expect(entry.images?.[0].id).toBe('a');
  });

  it('generates a unique id each call', () => {
    const a = createWeeklyNoteEntry(1, 'x');
    const b = createWeeklyNoteEntry(1, 'x');
    expect(a.id).not.toBe(b.id);
  });

  it('sets created_at and updated_at to the same ISO timestamp', () => {
    const entry = createWeeklyNoteEntry(1, 'x');
    expect(entry.created_at).toBe(entry.updated_at);
    expect(() => new Date(entry.created_at).toISOString()).not.toThrow();
  });

  it('omits images field when not provided', () => {
    const entry = createWeeklyNoteEntry(1, 'x');
    expect(entry.images).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// updateWeeklyNoteEntry
// ---------------------------------------------------------------------------

describe('updateWeeklyNoteEntry', () => {
  it('updates text and day_of_week', () => {
    const original = makeEntry({ text: 'old', day_of_week: 1 });
    const updated = updateWeeklyNoteEntry(original, 4, 'new');
    expect(updated.text).toBe('new');
    expect(updated.day_of_week).toBe(4);
  });

  it('replaces images', () => {
    const original = makeEntry({ images: [makeImage('old')] });
    const newImg = makeImage('new');
    const updated = updateWeeklyNoteEntry(original, 1, 'x', [newImg]);
    expect(updated.images).toHaveLength(1);
    expect(updated.images?.[0].id).toBe('new');
  });

  it('preserves original id and created_at', () => {
    const original = makeEntry({ id: 'keep-me', created_at: '2025-01-01T00:00:00.000Z' });
    const updated = updateWeeklyNoteEntry(original, 1, 'new');
    expect(updated.id).toBe('keep-me');
    expect(updated.created_at).toBe('2025-01-01T00:00:00.000Z');
  });

  it('bumps updated_at relative to created_at', () => {
    const original = makeEntry({ created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z' });
    const updated = updateWeeklyNoteEntry(original, 1, 'new');
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(original.updated_at).getTime());
  });
});

// ---------------------------------------------------------------------------
// compareWeeklyNoteEntries
// ---------------------------------------------------------------------------

describe('compareWeeklyNoteEntries', () => {
  it('sorts by day_of_week first', () => {
    const a = makeEntry({ day_of_week: 3 });
    const b = makeEntry({ day_of_week: 1 });
    expect(compareWeeklyNoteEntries(a, b)).toBeGreaterThan(0);
    expect(compareWeeklyNoteEntries(b, a)).toBeLessThan(0);
  });

  it('sorts by updated_at when day_of_week is equal', () => {
    const earlier = makeEntry({ day_of_week: 2, updated_at: '2025-03-03T08:00:00.000Z' });
    const later   = makeEntry({ day_of_week: 2, updated_at: '2025-03-03T10:00:00.000Z' });
    expect(compareWeeklyNoteEntries(earlier, later)).toBeLessThan(0);
  });

  it('returns 0 for identical timestamps on same day', () => {
    const a = makeEntry({ day_of_week: 2, updated_at: '2025-03-03T08:00:00.000Z' });
    const b = makeEntry({ day_of_week: 2, updated_at: '2025-03-03T08:00:00.000Z' });
    expect(compareWeeklyNoteEntries(a, b)).toBe(0);
  });
});
