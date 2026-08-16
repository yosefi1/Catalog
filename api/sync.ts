import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireCatalogKey, setCors } from './_lib/auth';
import { getServiceSupabase } from './_lib/supabase';

export type SyncDevice = {
  inventoryId: string;
  deviceName: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  deviceType: string;
  location: string;
  room: string;
  area: string;
  owner: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
};

export type SyncPhotoIn = {
  inventoryId: string;
  photoType: string;
  mimeType: string;
  createdAt: number;
  /** base64 without data: prefix */
  dataBase64: string;
  clientPhotoKey?: string;
};

export type SyncPhotoOut = {
  id: string;
  inventoryId: string;
  photoType: string;
  mimeType: string;
  createdAt: number;
  storagePath: string;
};

function rowToDevice(row: Record<string, unknown>): SyncDevice {
  return {
    inventoryId: String(row.inventory_id),
    deviceName: String(row.device_name ?? ''),
    manufacturer: String(row.manufacturer ?? ''),
    model: String(row.model ?? ''),
    serialNumber: String(row.serial_number ?? ''),
    assetTag: String(row.asset_tag ?? ''),
    deviceType: String(row.device_type ?? ''),
    location: String(row.location ?? ''),
    room: String(row.room ?? ''),
    area: String(row.area ?? ''),
    owner: String(row.owner ?? ''),
    notes: String(row.notes ?? ''),
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

function deviceToRow(d: SyncDevice) {
  return {
    inventory_id: d.inventoryId,
    device_name: d.deviceName ?? '',
    manufacturer: d.manufacturer ?? '',
    model: d.model ?? '',
    serial_number: d.serialNumber ?? '',
    asset_tag: d.assetTag ?? '',
    device_type: d.deviceType ?? '',
    location: d.location ?? '',
    room: d.room ?? '',
    area: d.area ?? '',
    owner: d.owner ?? '',
    notes: d.notes ?? '',
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!requireCatalogKey(req, res)) return;

  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Supabase config error',
    });
    return;
  }

  try {
    if (req.method === 'GET' || (req.method === 'POST' && req.body?.action === 'pull')) {
      const { data: deviceRows, error: dErr } = await supabase
        .from('devices')
        .select('*')
        .order('inventory_id');
      if (dErr) throw dErr;

      const { data: photoRows, error: pErr } = await supabase
        .from('photos')
        .select('*');
      if (pErr) throw pErr;

      const devices = (deviceRows ?? []).map((r) =>
        rowToDevice(r as Record<string, unknown>),
      );
      const photos: SyncPhotoOut[] = (photoRows ?? []).map((r) => ({
        id: String((r as { id: string }).id),
        inventoryId: String((r as { inventory_id: string }).inventory_id),
        photoType: String((r as { photo_type: string }).photo_type),
        mimeType: String((r as { mime_type: string }).mime_type ?? 'image/jpeg'),
        createdAt: Number((r as { created_at: number }).created_at) || 0,
        storagePath: String((r as { storage_path: string }).storage_path),
      }));

      res.status(200).json({ devices, photos });
      return;
    }

    if (req.method === 'POST' && req.body?.action === 'push') {
      const devices = (req.body.devices ?? []) as SyncDevice[];
      const photos = (req.body.photos ?? []) as SyncPhotoIn[];
      const replacePhotoInventoryIds = (req.body.replacePhotoInventoryIds ??
        []) as string[];

      for (const d of devices) {
        if (!d?.inventoryId) continue;
        const { error } = await supabase
          .from('devices')
          .upsert(deviceToRow(d), { onConflict: 'inventory_id' });
        if (error) throw error;
      }

      for (const inventoryId of replacePhotoInventoryIds) {
        const { data: existing } = await supabase
          .from('photos')
          .select('id, storage_path')
          .eq('inventory_id', inventoryId);

        if (existing?.length) {
          const paths = existing.map((p) => p.storage_path as string);
          await supabase.storage.from('device-photos').remove(paths);
          await supabase.from('photos').delete().eq('inventory_id', inventoryId);
        }
      }

      const uploaded: SyncPhotoOut[] = [];
      for (const photo of photos) {
        if (!photo?.inventoryId || !photo.dataBase64) continue;
        const ext = extFromMime(photo.mimeType || 'image/jpeg');
        const id = randomId();
        const storagePath = `${photo.inventoryId}/${id}.${ext}`;
        const binary = Buffer.from(photo.dataBase64, 'base64');

        const { error: upErr } = await supabase.storage
          .from('device-photos')
          .upload(storagePath, binary, {
            contentType: photo.mimeType || 'image/jpeg',
            upsert: true,
          });
        if (upErr) throw upErr;

        const { data: inserted, error: insErr } = await supabase
          .from('photos')
          .insert({
            inventory_id: photo.inventoryId,
            photo_type: photo.photoType,
            storage_path: storagePath,
            mime_type: photo.mimeType || 'image/jpeg',
            created_at: photo.createdAt || Date.now(),
          })
          .select('*')
          .single();
        if (insErr) throw insErr;

        uploaded.push({
          id: String(inserted.id),
          inventoryId: photo.inventoryId,
          photoType: photo.photoType,
          mimeType: photo.mimeType || 'image/jpeg',
          createdAt: photo.createdAt || Date.now(),
          storagePath,
        });
      }

      res.status(200).json({ ok: true, uploadedCount: uploaded.length });
      return;
    }

    if (req.method === 'POST' && req.body?.action === 'downloadPhoto') {
      const storagePath = String(req.body.storagePath ?? '');
      if (!storagePath) {
        res.status(400).json({ error: 'storagePath required' });
        return;
      }
      const { data, error } = await supabase.storage
        .from('device-photos')
        .download(storagePath);
      if (error) throw error;
      const buf = Buffer.from(await data.arrayBuffer());
      res.status(200).json({
        storagePath,
        mimeType: data.type || 'image/jpeg',
        dataBase64: buf.toString('base64'),
      });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Sync failed',
    });
  }
}
