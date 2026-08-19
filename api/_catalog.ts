import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type ApiDevice = {
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

export type ApiPhoto = {
  id: string;
  inventoryId: string;
  photoType: string;
  mimeType: string;
  createdAt: number;
  storagePath: string;
  url: string;
};

export function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Catalog-Key, Authorization',
  );
}

export function parseBody(req: VercelRequest): Record<string, unknown> {
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

export function getCatalogKey(
  req: VercelRequest,
  body: Record<string, unknown>,
): string | undefined {
  const header =
    (req.headers['x-catalog-key'] as string | undefined) ||
    (req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? undefined);
  if (header) return header;
  if (typeof body.accessKey === 'string') return body.accessKey;
  return undefined;
}

export function requireCatalogKey(
  req: VercelRequest,
  res: VercelResponse,
  body: Record<string, unknown>,
): boolean {
  const expected = process.env.CATALOG_ACCESS_KEY;
  if (!expected) {
    res.status(500).json({
      error:
        'Server missing CATALOG_ACCESS_KEY. Add it in Vercel → Settings → Environment Variables, then Redeploy.',
    });
    return false;
  }

  const provided = getCatalogKey(req, body);
  if (!provided || provided !== expected) {
    res.status(401).json({ error: 'Invalid access key.' });
    return false;
  }
  return true;
}

export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as {
      message?: string;
      error?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    return (
      [o.message || o.error, o.details, o.hint, o.code]
        .filter(Boolean)
        .join(' | ') || JSON.stringify(e)
    );
  }
  return String(e);
}

function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  url = url.replace(/\/rest\/v1$/i, '');
  url = url.replace(/\/auth\/v1$/i, '');
  url = url.replace(/\/storage\/v1$/i, '');
  return url;
}

export function getServiceSupabase(): SupabaseClient {
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
      'Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).',
    );
  }

  const url = normalizeSupabaseUrl(urlRaw);
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error(
      `SUPABASE_URL looks wrong: "${urlRaw}". Use https://YOURPROJECT.supabase.co`,
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function rowToDevice(row: Record<string, unknown>): ApiDevice {
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

export function deviceToRow(d: ApiDevice) {
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

export function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

export function randomPathId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function signedPhotoUrl(
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

export async function attachPhotoUrls(
  supabase: SupabaseClient,
  rows: Array<Record<string, unknown>>,
): Promise<ApiPhoto[]> {
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

export async function peekNextInventoryId(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase.from('devices').select('inventory_id');
  if (error) throw error;
  let max = 0;
  for (const row of data ?? []) {
    const id = String((row as { inventory_id: string }).inventory_id);
    const m = /^EQ-(\d+)$/i.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EQ-${String(max + 1).padStart(4, '0')}`;
}

export async function recordDeletion(
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

export async function isInventoryIdDeleted(
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

export async function listDeletedInventoryIds(
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
