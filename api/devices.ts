import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  errMessage,
  parseBody,
  requireCatalogKey,
  setCors,
} from './_lib/auth';
import {
  deviceToRow,
  getServiceSupabase,
  peekNextInventoryId,
  rowToDevice,
  signedPhotoUrl,
  type ApiDevice,
} from './_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
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
      const { data: deviceRows, error: dErr } = await supabase
        .from('devices')
        .select('*')
        .order('inventory_id');
      if (dErr) throw dErr;

      const { data: photoRows, error: pErr } = await supabase
        .from('photos')
        .select('*');
      if (pErr) throw pErr;

      const photosByDevice = new Map<string, Array<Record<string, unknown>>>();
      for (const row of photoRows ?? []) {
        const inv = String((row as { inventory_id: string }).inventory_id);
        const list = photosByDevice.get(inv) ?? [];
        list.push(row as Record<string, unknown>);
        photosByDevice.set(inv, list);
      }

      const devices = (deviceRows ?? []).map((row) => {
        const device = rowToDevice(row as Record<string, unknown>);
        const photos = photosByDevice.get(device.inventoryId) ?? [];
        const main =
          photos.find((p) => p.photo_type === 'main') ?? photos[0];
        return {
          ...device,
          thumbnailUrl: main
            ? undefined // filled below
            : undefined,
          mainPhotoId: main ? String(main.id) : undefined,
          _mainPath: main ? String(main.storage_path) : undefined,
        };
      });

      const withThumbs = await Promise.all(
        devices.map(async (d) => {
          const { _mainPath, ...rest } = d as ApiDevice & {
            thumbnailUrl?: string;
            mainPhotoId?: string;
            _mainPath?: string;
          };
          if (_mainPath) {
            try {
              rest.thumbnailUrl = await signedPhotoUrl(supabase, _mainPath);
            } catch {
              /* missing file in storage — still list device */
            }
          }
          return rest;
        }),
      );

      res.status(200).json({ devices: withThumbs });
      return;
    }

    if (req.method === 'POST') {
      const form = body.form as Record<string, string> | undefined;
      if (!form) {
        res.status(400).json({ error: 'form required' });
        return;
      }

      let inventoryId =
        typeof body.inventoryId === 'string' && body.inventoryId
          ? body.inventoryId
          : await peekNextInventoryId(supabase);

      if (typeof body.inventoryId === 'string' && body.inventoryId) {
        const { data: exists } = await supabase
          .from('devices')
          .select('inventory_id')
          .eq('inventory_id', inventoryId)
          .maybeSingle();
        if (exists) {
          res.status(409).json({ error: `Device ${inventoryId} already exists` });
          return;
        }
      }

      const now = Date.now();
      const device: ApiDevice = {
        inventoryId,
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
        createdAt: now,
        updatedAt: now,
      };

      const { error } = await supabase
        .from('devices')
        .insert(deviceToRow(device));
      if (error) throw error;

      res.status(201).json({ device });
      return;
    }

    res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (e) {
    console.error('devices api error', e);
    res.status(500).json({ error: errMessage(e) });
  }
}
