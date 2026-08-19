import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  errMessage,
  requireCatalogKey,
  setCors,
} from './_catalog';
import { getServiceSupabase } from './_catalog';

const ALLOWED = new Set(['location', 'manufacturer', 'deviceType', 'room']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET required' });
    return;
  }

  const field = String(req.query.field ?? '');
  if (!ALLOWED.has(field)) {
    res.status(400).json({ error: 'Invalid field' });
    return;
  }

  if (!requireCatalogKey(req, res, {})) return;

  const column =
    field === 'deviceType'
      ? 'device_type'
      : field === 'serialNumber'
        ? 'serial_number'
        : field;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from('devices').select(column);
    if (error) throw error;

    const set = new Set<string>();
    for (const row of data ?? []) {
      const v = String((row as Record<string, string>)[column] ?? '').trim();
      if (v) set.add(v);
    }
    const values = Array.from(set).sort((a, b) => a.localeCompare(b));
    res.status(200).json({ values });
  } catch (e) {
    res.status(500).json({ error: errMessage(e) });
  }
}
