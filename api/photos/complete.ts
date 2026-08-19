import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  errMessage,
  parseBody,
  requireCatalogKey,
  setCors,
} from '../_catalog';
import {
  attachPhotoUrls,
  getServiceSupabase,
} from '../_catalog';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const body = parseBody(req);
  if (!requireCatalogKey(req, res, body)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST required' });
    return;
  }

  const inventoryId = String(body.inventoryId ?? '');
  const storagePath = String(body.storagePath ?? '');
  const photoType = String(body.photoType ?? 'additional');
  const mimeType = String(body.mimeType ?? 'image/jpeg');
  const createdAt = Number(body.createdAt) || Date.now();

  if (!inventoryId || !storagePath) {
    res.status(400).json({ error: 'inventoryId and storagePath required' });
    return;
  }

  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch (e) {
    res.status(500).json({ error: errMessage(e) });
    return;
  }

  try {
    const { data: row, error } = await supabase
      .from('photos')
      .insert({
        inventory_id: inventoryId,
        photo_type: photoType,
        storage_path: storagePath,
        mime_type: mimeType,
        created_at: createdAt,
      })
      .select('*')
      .single();
    if (error) throw error;

    const [photo] = await attachPhotoUrls(supabase, [
      row as Record<string, unknown>,
    ]);

    await supabase
      .from('devices')
      .update({ updated_at: Date.now() })
      .eq('inventory_id', inventoryId);

    res.status(201).json({ photo });
  } catch (e) {
    console.error('complete-upload error', e);
    res.status(500).json({ error: errMessage(e) });
  }
}
