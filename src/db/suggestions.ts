import { db, type SuggestionRecord } from './database';
import type { DeviceFormState } from '../types/device';

type SuggestionField = SuggestionRecord['field'];

const FIELDS: SuggestionField[] = [
  'location',
  'room',
  'area',
  'owner',
  'manufacturer',
  'deviceType',
];

export async function recordSuggestion(
  field: SuggestionField,
  value: string,
): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) return;

  const existing = await db.suggestions
    .where('[field+value]')
    .equals([field, trimmed])
    .first();

  if (existing?.id !== undefined) {
    await db.suggestions.update(existing.id, {
      lastUsedAt: Date.now(),
      useCount: existing.useCount + 1,
    });
  } else {
    await db.suggestions.add({
      field,
      value: trimmed,
      lastUsedAt: Date.now(),
      useCount: 1,
    });
  }
}

export async function recordSuggestionsFromDevice(
  form: DeviceFormState,
): Promise<void> {
  const map: Record<SuggestionField, string> = {
    location: form.location,
    room: form.room,
    area: form.area,
    owner: form.owner,
    manufacturer: form.manufacturer,
    deviceType: form.deviceType,
  };
  for (const field of FIELDS) {
    await recordSuggestion(field, map[field]);
  }
}

export async function getSuggestions(
  field: SuggestionField,
  query = '',
  limit = 12,
): Promise<string[]> {
  const q = query.trim().toLowerCase();
  let rows = await db.suggestions.where('field').equals(field).toArray();
  rows.sort((a, b) => {
    if (b.useCount !== a.useCount) return b.useCount - a.useCount;
    return b.lastUsedAt - a.lastUsedAt;
  });
  if (q) {
    rows = rows.filter((r) => r.value.toLowerCase().includes(q));
  }
  return rows.slice(0, limit).map((r) => r.value);
}
