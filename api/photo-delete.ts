import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  errMessage,
  getServiceSupabase,
  parseBody,
  requireCatalogKey,
  setCors,
} from './_catalog';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const photoId = decodeURIComponent(String(req.query.id ?? ''));
  if (!photoId) {
    res.status(400).json({ error: 'id query required' });
    return;
  }

  const body = parseBody(req);
  if (!requireCatalogKey(req, res, body)) return;

  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch (e) {
    res.status(500).json({ error: errMessage(e) });
    return;
  }

  try {
    if (req.method === 'DELETE') {
      const { data: photo, error: getErr } = await supabase
        .from('photos')
        .select('id, inventory_id, storage_path')
        .eq('id', photoId)
        .maybeSingle();
      if (getErr) throw getErr;
      if (!photo) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }

      await supabase.storage
        .from('device-photos')
        .remove([photo.storage_path as string]);
      const { error } = await supabase.from('photos').delete().eq('id', photoId);
      if (error) throw error;

      await supabase
        .from('devices')
        .update({ updated_at: Date.now() })
        .eq('inventory_id', photo.inventory_id as string);

      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (e) {
    console.error('photo delete error', e);
    res.status(500).json({ error: errMessage(e) });
  }
}
