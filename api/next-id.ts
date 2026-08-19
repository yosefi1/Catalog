import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  errMessage,
  requireCatalogKey,
  setCors,
} from '../_lib/auth';
import { getServiceSupabase, peekNextInventoryId } from '../_lib/supabase';

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
    const inventoryId = await peekNextInventoryId(supabase);
    res.status(200).json({ inventoryId });
  } catch (e) {
    res.status(500).json({ error: errMessage(e) });
  }
}
