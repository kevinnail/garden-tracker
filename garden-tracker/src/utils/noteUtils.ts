import { Note, WeeklyNoteEntry } from '@/src/types';
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

function fallbackDayOfWeek(note: Pick<Note, 'week_date' | 'created_at'>): number {
  if (note.created_at) {
    const created = new Date(note.created_at);
    if (!Number.isNaN(created.getTime())) {
      return created.getDay();
    }
  }

  const week = note.week_date ? parseDateKey(note.week_date) : null;
  return week?.getDay() ?? 0;
}

export function parseWeeklyNoteEntries(note: Pick<Note, 'content' | 'week_date' | 'created_at' | 'updated_at'> | null): WeeklyNoteEntry[] {
  if (!note?.content?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(note.content);
    if (isWeeklyNotePayload(parsed)) {
      return parsed.entries
        .filter(entry => typeof entry.text === 'string' && entry.text.trim().length > 0)
        .sort(compareWeeklyNoteEntries);
    }
  } catch {
    // Legacy note content was plain text. Preserve it as a single entry.
  }

  return [{
    id: `legacy-${note.created_at ?? note.updated_at ?? 'entry'}`,
    day_of_week: fallbackDayOfWeek(note),
    text: note.content.trim(),
    created_at: note.created_at ?? new Date().toISOString(),
    updated_at: note.updated_at ?? note.created_at ?? new Date().toISOString(),
  }];
}

export function serializeWeeklyNoteEntries(entries: WeeklyNoteEntry[]): string {
  const payload: WeeklyNotePayload = {
    version: 1,
    entries: [...entries]
      .filter(entry => entry.text.trim().length > 0)
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

export function createWeeklyNoteEntry(dayOfWeek: number, text: string): WeeklyNoteEntry {
  const nowIso = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    day_of_week: dayOfWeek,
    text: text.trim(),
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export function updateWeeklyNoteEntry(entry: WeeklyNoteEntry, dayOfWeek: number, text: string): WeeklyNoteEntry {
  return {
    ...entry,
    day_of_week: dayOfWeek,
    text: text.trim(),
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