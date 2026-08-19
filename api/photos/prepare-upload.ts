import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  errMessage,
  parseBody,
  requireCatalogKey,
  setCors,
} from '../_catalog';
import {
  extFromMime,
  getServiceSupabase,
  randomPathId,
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
  const photoType = String(body.photoType ?? 'additional');
  const mimeType = String(body.mimeType ?? 'image/jpeg');
  const replaceExisting = body.replaceExisting !== false;

  if (!inventoryId) {
    res.status(400).json({ error: 'inventoryId required' });
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
    const { data: device, error: dErr } = await supabase
      .from('devices')
      .select('inventory_id')
      .eq('inventory_id', inventoryId)
      .maybeSingle();
    if (dErr) throw dErr;
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    if (replaceExisting && photoType !== 'additional') {
      const { data: old } = await supabase
        .from('photos')
        .select('id, storage_path')
        .eq('inventory_id', inventoryId)
        .eq('photo_type', photoType);
      if (old?.length) {
        const paths = old.map((p) => p.storage_path as string);
        if (paths.length) {
          await supabase.storage.from('device-photos').remove(paths);
        }
        await supabase
          .from('photos')
          .delete()
          .eq('inventory_id', inventoryId)
          .eq('photo_type', photoType);
      }
    }

    const ext = extFromMime(mimeType);
    const storagePath = `${inventoryId}/${randomPathId()}.${ext}`;

    const { data, error } = await supabase.storage
      .from('device-photos')
      .createSignedUploadUrl(storagePath);
    if (error || !data?.signedUrl) {
      throw new Error(
        `Upload URL failed (${error?.message ?? 'unknown'}). Bucket must be named "device-photos".`,
      );
    }

    res.status(200).json({
      uploadUrl: data.signedUrl,
      token: data.token,
      storagePath,
      inventoryId,
      photoType,
      mimeType,
    });
  } catch (e) {
    console.error('prepare-upload error', e);
    res.status(500).json({ error: errMessage(e) });
  }
}
