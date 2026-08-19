import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type SyncDevice = {
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

type SyncPhotoIn = {
  inventoryId: string;
  photoType: string;
  mimeType: string;
  createdAt: number;
  dataBase64: string;
};

type SyncPhotoOut = {
  id: string;
  inventoryId: string;
  photoType: string;
  mimeType: string;
  createdAt: number;
  storagePath: string;
};

function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Catalog-Key',
  );
}

function requireCatalogKey(req: VercelRequest, res: VercelResponse, body: Record<string, unknown>): boolean {
  const expected = process.env.CATALOG_ACCESS_KEY;
  if (!expected) {
    res.status(500).json({
      error:
        'Server missing CATALOG_ACCESS_KEY. Add it in Vercel → Settings → Environment Variables, then Redeploy.',
    });
    return false;
  }

  const provided =
    (req.headers['x-catalog-key'] as string | undefined) ||
    (typeof body.accessKey === 'string' ? body.accessKey : undefined);

  if (!provided || provided !== expected) {
    res.status(401).json({
      error:
        'Invalid sync key. Use the exact same CATALOG_ACCESS_KEY value from Vercel in Data → Cloud sync.',
    });
    return false;
  }
  return true;
}

function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  // Common mistake: pasting the REST endpoint instead of the project URL
  url = url.replace(/\/rest\/v1$/i, '');
  url = url.replace(/\/auth\/v1$/i, '');
  url = url.replace(/\/storage\/v1$/i, '');
  return url;
}

function getServiceSupabase(): SupabaseClient {
  const urlRaw = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!urlRaw) {
    throw new Error(
      'Missing SUPABASE_URL in Vercel env. Example: https://xxxx.supabase.co',
    );
  }
  if (!key) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY). Use Legacy service_role JWT or Secret keys sb_secret_…',
    );
  }

  const url = normalizeSupabaseUrl(urlRaw);
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error(
      `SUPABASE_URL looks wrong: "${urlRaw}". It must be exactly https://YOURPROJECT.supabase.co (no /rest/v1, no trailing slash).`,
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as { message?: string; error?: string; details?: string; hint?: string; code?: string };
    return [o.message || o.error, o.details, o.hint, o.code].filter(Boolean).join(' | ') || JSON.stringify(e);
  }
  return String(e);
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof req.body === 'object') return req.body as Record<string, unknown>;
  return {};
}

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

async function signedPhotoUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('device-photos')
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`Signed URL failed (${error?.message ?? 'unknown'})`);
  }
  return data.signedUrl;
}

async function attachPhotoUrls(
  supabase: SupabaseClient,
  rows: Array<Record<string, unknown>>,
) {
  return Promise.all(
    rows.map(async (row) => {
      const storagePath = String(row.storage_path);
      return {
        id: String(row.id),
        inventoryId: String(row.inventory_id),
        photoType: String(row.photo_type),
        mimeType: String(row.mime_type ?? 'image/jpeg'),
        createdAt: Number(row.created_at) || 0,
        storagePath,
        url: await signedPhotoUrl(supabase, storagePath),
      };
    }),
  );
}

async function recordDeletion(
  supabase: SupabaseClient,
  inventoryId: string,
): Promise<void> {
  const { error } = await supabase.from('deleted_inventory_ids').upsert({
    inventory_id: inventoryId,
    deleted_at: Date.now(),
  });
  if (error && !/deleted_inventory_ids|schema cache/i.test(error.message)) {
    throw error;
  }
}

async function isInventoryIdDeleted(
  supabase: SupabaseClient,
  inventoryId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('deleted_inventory_ids')
    .select('inventory_id')
    .eq('inventory_id', inventoryId)
    .maybeSingle();
  if (error) {
    if (/deleted_inventory_ids|schema cache/i.test(error.message)) return false;
    throw error;
  }
  return Boolean(data);
}

async function listDeletedInventoryIds(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('deleted_inventory_ids')
    .select('inventory_id')
    .order('deleted_at');
  if (error) {
    if (/deleted_inventory_ids|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((row) => String((row as { inventory_id: string }).inventory_id));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const body = parseBody(req);

  if (!requireCatalogKey(req, res, body)) return;

  let supabase: SupabaseClient;
  try {
    supabase = getServiceSupabase();
  } catch (e) {
    res.status(500).json({ error: errMessage(e) });
    return;
  }

  try {
    const action = body.action ?? (req.method === 'GET' ? 'pull' : undefined);

    if (req.method === 'GET' || action === 'pull') {
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

      const photosByDevice = new Map<string, SyncPhotoOut[]>();
      for (const photo of photos) {
        const list = photosByDevice.get(photo.inventoryId) ?? [];
        list.push(photo);
        photosByDevice.set(photo.inventoryId, list);
      }

      const devicesWithThumbs = await Promise.all(
        devices.map(async (device) => {
          const devicePhotos = photosByDevice.get(device.inventoryId) ?? [];
          const main =
            devicePhotos.find((p) => p.photoType === 'main') ?? devicePhotos[0];
          let thumbnailUrl: string | undefined;
          if (main) {
            try {
              thumbnailUrl = await signedPhotoUrl(supabase, main.storagePath);
            } catch {
              /* missing file in storage */
            }
          }
          return {
            ...device,
            thumbnailUrl,
            mainPhotoId: main?.id,
          };
        }),
      );

      const deletedInventoryIds = await listDeletedInventoryIds(supabase);

      res.status(200).json({ devices: devicesWithThumbs, photos, deletedInventoryIds });
      return;
    }

    if (action === 'push') {
      const devices = (body.devices ?? []) as SyncDevice[];
      const photos = (body.photos ?? []) as SyncPhotoIn[];
      const replacePhotoInventoryIds = (body.replacePhotoInventoryIds ??
        []) as string[];

      for (const d of devices) {
        if (!d?.inventoryId) continue;
        if (await isInventoryIdDeleted(supabase, d.inventoryId)) continue;
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
          if (paths.length) {
            await supabase.storage.from('device-photos').remove(paths);
          }
          await supabase.from('photos').delete().eq('inventory_id', inventoryId);
        }
      }

      let uploadedCount = 0;
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
        if (upErr) {
          throw new Error(
            `Storage upload failed (${upErr.message}). Bucket must be named exactly "device-photos".`,
          );
        }

        const { error: insErr } = await supabase.from('photos').insert({
          inventory_id: photo.inventoryId,
          photo_type: photo.photoType,
          storage_path: storagePath,
          mime_type: photo.mimeType || 'image/jpeg',
          created_at: photo.createdAt || Date.now(),
        });
        if (insErr) throw insErr;
        uploadedCount += 1;
      }

      res.status(200).json({ ok: true, uploadedCount });
      return;
    }

    if (action === 'delete') {
      const inventoryIds = (body.inventoryIds ?? []) as string[];
      for (const inventoryId of inventoryIds) {
        if (!inventoryId) continue;
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
        await recordDeletion(supabase, inventoryId);
      }
      res.status(200).json({ ok: true, deleted: inventoryIds.length });
      return;
    }

    if (action === 'getDevice') {
      const inventoryId = String(body.inventoryId ?? '');
      if (!inventoryId) {
        res.status(400).json({ error: 'inventoryId required' });
        return;
      }

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

    if (action === 'downloadPhoto') {
      const storagePath = String(body.storagePath ?? '');
      if (!storagePath) {
        res.status(400).json({ error: 'storagePath required' });
        return;
      }
      const { data, error } = await supabase.storage
        .from('device-photos')
        .download(storagePath);
      if (error) {
        throw new Error(
          `Storage download failed (${error.message}). Bucket must be named exactly "device-photos".`,
        );
      }
      const buf = Buffer.from(await data.arrayBuffer());
      res.status(200).json({
        storagePath,
        mimeType: data.type || 'image/jpeg',
        dataBase64: buf.toString('base64'),
      });
      return;
    }

    res.status(400).json({
      error: `Unknown action. Got method=${req.method} action=${String(action)}`,
    });
  } catch (e) {
    console.error('sync error', e);
    res.status(500).json({ error: errMessage(e) });
  }
}
