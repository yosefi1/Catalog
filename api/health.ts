import type { VercelRequest, VercelResponse } from '@vercel/node';
import { errMessage, requireCatalogKey, setCors } from './_catalog';
import { getServiceSupabase } from './_catalog';

/** Lightweight ping — use Settings → Test connection. */
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
  if (!requireCatalogKey(req, res, {})) return;

  try {
    const supabase = getServiceSupabase();
    const { count, error } = await supabase
      .from('devices')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    res.status(200).json({ ok: true, deviceCount: count ?? 0 });
  } catch (e) {
    res.status(500).json({ error: errMessage(e) });
  }
}
