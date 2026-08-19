import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  errMessage,
  parseBody,
  requireCatalogKey,
  setCors,
} from './_catalog';
import {
  attachPhotoUrls,
  deviceToRow,
  getServiceSupabase,
  rowToDevice,
} from './_catalog';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const inventoryId = decodeURIComponent(
    String(req.query.inventoryId ?? req.query.inventory_id ?? ''),
  );
  if (!inventoryId) {
    res.status(400).json({ error: 'inventoryId query required' });
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
    if (req.method === 'GET') {
      const { data: row, error } = await supabase
        .from('devices')
        .select('*')
        .eq('inventory_id', inventoryId)
        .maybeSingle();
      if (error) throw error;
      if (!row) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }

      const { data: photoRows, error: pErr } = await supabase
        .from('photos')
        .select('*')
        .eq('inventory_id', inventoryId);
      if (pErr) throw pErr;

      const photos = await attachPhotoUrls(
        supabase,
        (photoRows ?? []) as Record<string, unknown>[],
      );

      res.status(200).json({
        device: rowToDevice(row as Record<string, unknown>),
        photos,
      });
      return;
    }

    if (req.method === 'PUT') {
      const form = body.form as Record<string, string> | undefined;
      if (!form) {
        res.status(400).json({ error: 'form required' });
        return;
      }

      const { data: existing, error: getErr } = await supabase
        .from('devices')
        .select('*')
        .eq('inventory_id', inventoryId)
        .maybeSingle();
      if (getErr) throw getErr;
      if (!existing) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }

      const prev = rowToDevice(existing as Record<string, unknown>);
      const updated = {
        ...prev,
        deviceName: String(form.deviceName ?? ''),
        manufacturer: String(form.manufacturer ?? ''),
        model: String(form.model ?? ''),
        serialNumber: String(form.serialNumber ?? ''),
        assetTag: String(form.assetTag ?? ''),
        deviceType: String(form.deviceType ?? ''),
        location: String(form.location ?? ''),
        room: String(form.room ?? ''),
        area: String(form.area ?? ''),
        owner: String(form.owner ?? ''),
        notes: String(form.notes ?? ''),
        updatedAt: Date.now(),
      };

      const { error } = await supabase
        .from('devices')
        .update(deviceToRow(updated))
        .eq('inventory_id', inventoryId);
      if (error) throw error;

      res.status(200).json({ device: updated });
      return;
    }

    if (req.method === 'DELETE') {
      const { data: existing } = await supabase
        .from('photos')
        .select('storage_path')
        .eq('inventory_id', inventoryId);
      const paths = (existing ?? []).map((p) => p.storage_path as string);
      if (paths.length) {
        await supabase.storage.from('device-photos').remove(paths);
      }
      await supabase.from('photos').delete().eq('inventory_id', inventoryId);
      const { error } = await supabase
        .from('devices')
        .delete()
        .eq('inventory_id', inventoryId);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (e) {
    console.error('device api error', e);
    res.status(500).json({ error: errMessage(e) });
  }
}
