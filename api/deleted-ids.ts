import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  errMessage,
  listDeletedInventoryIds,
  requireCatalogKey,
  setCors,
  getServiceSupabase,
} from './_catalog';

/** Inventory IDs deleted on the server — used to block re-upload from old local copies. */
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
    const inventoryIds = await listDeletedInventoryIds(supabase);
    res.status(200).json({ inventoryIds });
  } catch (e) {
    res.status(500).json({ error: errMessage(e) });
  }
}
