import { Note, NoteImage, WeeklyNoteEntry } from '@/src/types';
import { parseDateKey } from '@/src/utils/dateUtils';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface WeeklyNotePayload {
  version: 1;
  entries: WeeklyNoteEntry[];
}

function isWeeklyNotePayload(value: unknown): value is WeeklyNotePayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as WeeklyNotePayload;
  return payload.version === 1 && Array.isArray(payload.entries);
}

function parseWeeklyNotePayload(content: string): WeeklyNotePayload | null {
  try {
    const parsed = JSON.parse(content);
    if (isWeeklyNotePayload(parsed)) {
      return parsed;
    }

    if (__DEV__) {
      console.warn('Unexpected weekly note payload shape.', parsed);
    }
    return null;
  } catch (error) {
    if (__DEV__) {
      console.warn('Failed to parse weekly note payload.', error);
    }
    return null;
  }
}

export function parseWeeklyNoteEntries(note: Pick<Note, 'content' | 'week_date' | 'created_at' | 'updated_at'> | null): WeeklyNoteEntry[] {
  if (!note?.content?.trim()) {
    return [];
  }

  const payload = parseWeeklyNotePayload(note.content);
  if (!payload) {
    return [];
  }

  return payload.entries
    .filter(entry => (typeof entry.text === 'string' && entry.text.trim().length > 0) || (entry.images?.length ?? 0) > 0)
    .sort(compareWeeklyNoteEntries);
}

export function serializeWeeklyNoteEntries(entries: WeeklyNoteEntry[]): string {
  const payload: WeeklyNotePayload = {
    version: 1,
    entries: [...entries]
      .filter(entry => entry.text.trim().length > 0 || (entry.images?.length ?? 0) > 0)
      .sort(compareWeeklyNoteEntries),
  };

  return JSON.stringify(payload);
}

export function compareWeeklyNoteEntries(a: WeeklyNoteEntry, b: WeeklyNoteEntry): number {
  if (a.day_of_week !== b.day_of_week) {
    return a.day_of_week - b.day_of_week;
  }

  const aTime = Date.parse(a.updated_at || a.created_at);
  const bTime = Date.parse(b.updated_at || b.created_at);
  return aTime - bTime;
}

export function createWeeklyNoteEntry(dayOfWeek: number, text: string, images?: NoteImage[]): WeeklyNoteEntry {
  const nowIso = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    day_of_week: dayOfWeek,
    text: text.trim(),
    images,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export function updateWeeklyNoteEntry(entry: WeeklyNoteEntry, dayOfWeek: number, text: string, images?: NoteImage[]): WeeklyNoteEntry {
  return {
    ...entry,
    day_of_week: dayOfWeek,
    text: text.trim(),
    images,
    updated_at: new Date().toISOString(),
  };
}

export function dateForWeekEntry(weekDate: string, dayOfWeek: number): Date | null {
  const weekStart = parseDateKey(weekDate);
  if (!weekStart) return null;

  const date = new Date(weekStart);
  date.setDate(date.getDate() + dayOfWeek);
  return date;
}

export function formatWeekEntryLabel(weekDate: string, entry: WeeklyNoteEntry): string {
  const date = dateForWeekEntry(weekDate, entry.day_of_week);
  const timestamp = new Date(entry.updated_at || entry.created_at);
  const timeLabel = Number.isNaN(timestamp.getTime())
    ? ''
    : timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (!date) {
    return `${DAYS_SHORT[entry.day_of_week] ?? 'Day'}${timeLabel ? ` · ${timeLabel}` : ''}`;
  }

  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
}

export function formatWeekRangeLabel(weekDate: string): string {
  const start = parseDateKey(weekDate);
  if (!start) return weekDate;

  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startLabel = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${startLabel} - ${endLabel}`;
}