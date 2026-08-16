import { db, getMeta, setMeta } from '../db/database';
import {
  getAllDevices,
  getDevice,
  ensureCounterPastExisting,
} from '../db/devices';
import type { Device, DeviceFormState, PhotoType } from '../types/device';
import { blobToBase64, base64ToBlob } from './utils';

const META_KEY = 'syncAccessKey';
const META_ENABLED = 'syncEnabled';
const META_LAST = 'syncLastAt';
const META_LAST_ERROR = 'syncLastError';
const META_LAST_MSG = 'syncLastMessage';

export interface SyncSettings {
  accessKey: string;
  enabled: boolean;
  lastSyncAt: number | null;
  lastError: string;
  lastMessage: string;
}

export interface SyncResult {
  ok: boolean;
  message: string;
  pulledDevices?: number;
  pushedDevices?: number;
  pulledPhotos?: number;
  pushedPhotos?: number;
}

type RemoteDevice = {
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

type RemotePhotoMeta = {
  id: string;
  inventoryId: string;
  photoType: string;
  mimeType: string;
  createdAt: number;
  storagePath: string;
};

function apiUrl(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

async function callSync<T>(
  accessKey: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(apiUrl('/api/sync'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Catalog-Key': accessKey,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(
      `Sync HTTP ${res.status}: ${text.slice(0, 240) || '(empty response)'}`,
    );
  }
  if (!res.ok) {
    throw new Error(data.error || `Sync HTTP ${res.status}`);
  }
  return data;
}

export async function getSyncSettings(): Promise<SyncSettings> {
  const accessKey = String(await getMeta(META_KEY, ''));
  const enabled = Boolean(await getMeta(META_ENABLED, false));
  const lastRaw = await getMeta(META_LAST, 0);
  const lastSyncAt = Number(lastRaw) || null;
  return {
    accessKey,
    enabled,
    lastSyncAt: lastSyncAt && lastSyncAt > 0 ? lastSyncAt : null,
    lastError: String(await getMeta(META_LAST_ERROR, '')),
    lastMessage: String(await getMeta(META_LAST_MSG, '')),
  };
}

export async function saveSyncSettings(partial: {
  accessKey?: string;
  enabled?: boolean;
}): Promise<void> {
  if (partial.accessKey !== undefined) {
    await setMeta(META_KEY, partial.accessKey.trim());
  }
  if (partial.enabled !== undefined) {
    await setMeta(META_ENABLED, partial.enabled);
  }
}

async function markSyncResult(ok: boolean, message: string): Promise<void> {
  await setMeta(META_LAST, Date.now());
  await setMeta(META_LAST_MSG, message);
  await setMeta(META_LAST_ERROR, ok ? '' : message);
}

function remoteToForm(d: RemoteDevice): DeviceFormState {
  return {
    deviceName: d.deviceName,
    manufacturer: d.manufacturer,
    model: d.model,
    serialNumber: d.serialNumber,
    assetTag: d.assetTag,
    deviceType: d.deviceType,
    location: d.location,
    room: d.room,
    area: d.area,
    owner: d.owner,
    notes: d.notes,
  };
}

async function downloadRemotePhoto(
  accessKey: string,
  storagePath: string,
): Promise<{ blob: Blob; mimeType: string }> {
  const data = await callSync<{
    dataBase64: string;
    mimeType: string;
  }>(accessKey, { action: 'downloadPhoto', storagePath });
  return {
    blob: base64ToBlob(data.dataBase64, data.mimeType || 'image/jpeg'),
    mimeType: data.mimeType || 'image/jpeg',
  };
}

/** Full bidirectional sync: push local, pull remote, merge by updatedAt. */
export async function runFullSync(): Promise<SyncResult> {
  const settings = await getSyncSettings();
  if (!settings.enabled) {
    return { ok: false, message: 'Cloud sync is disabled' };
  }
  if (!settings.accessKey) {
    return { ok: false, message: 'Set a sync key first' };
  }
  if (!navigator.onLine) {
    return { ok: false, message: 'Offline — sync when you have internet' };
  }

  try {
    const accessKey = settings.accessKey;
    const localDevices = await getAllDevices();

    // Pull remote snapshot first for merge decisions
    const remote = await callSync<{
      devices: RemoteDevice[];
      photos: RemotePhotoMeta[];
    }>(accessKey, { action: 'pull' });

    const remoteById = new Map(
      remote.devices.map((d) => [d.inventoryId, d] as const),
    );
    const localById = new Map(
      localDevices
        .filter((d) => d.inventoryId)
        .map((d) => [d.inventoryId, d] as const),
    );

    // Push local devices that are newer or missing remotely
    const toPushMeta: RemoteDevice[] = [];
    const toPushPhotoInventoryIds: string[] = [];

    for (const local of localDevices) {
      if (!local.inventoryId || local.id === undefined) continue;
      const rem = remoteById.get(local.inventoryId);
      if (!rem || local.updatedAt >= rem.updatedAt) {
        toPushMeta.push({
          inventoryId: local.inventoryId,
          deviceName: local.deviceName,
          manufacturer: local.manufacturer,
          model: local.model,
          serialNumber: local.serialNumber,
          assetTag: local.assetTag,
          deviceType: local.deviceType,
          location: local.location,
          room: local.room,
          area: local.area,
          owner: local.owner,
          notes: local.notes,
          createdAt: local.createdAt,
          updatedAt: local.updatedAt,
        });
        toPushPhotoInventoryIds.push(local.inventoryId);
      }
    }

    let pushedPhotos = 0;
    // Push in chunks: one device photos at a time to stay under body limits
    if (toPushMeta.length) {
      await callSync(accessKey, {
        action: 'push',
        devices: toPushMeta,
        photos: [],
        replacePhotoInventoryIds: [],
      });
    }

    for (const inventoryId of toPushPhotoInventoryIds) {
      const local = localById.get(inventoryId);
      if (!local?.id) continue;
      const photos = await db.photos.where('deviceId').equals(local.id).toArray();
      const payload = [];
      for (const p of photos) {
        payload.push({
          inventoryId,
          photoType: p.photoType,
          mimeType: p.mimeType,
          createdAt: p.createdAt,
          dataBase64: await blobToBase64(p.blob),
        });
      }
      await callSync(accessKey, {
        action: 'push',
        devices: [],
        photos: payload,
        replacePhotoInventoryIds: [inventoryId],
      });
      pushedPhotos += payload.length;
    }

    // Re-pull after push for authoritative remote photo list
    const remoteAfter = await callSync<{
      devices: RemoteDevice[];
      photos: RemotePhotoMeta[];
    }>(accessKey, { action: 'pull' });

    let pulledDevices = 0;
    let pulledPhotos = 0;

    for (const rem of remoteAfter.devices) {
      const local = localById.get(rem.inventoryId);
      const shouldApply =
        !local || rem.updatedAt > local.updatedAt || local.id === undefined;

      if (!shouldApply && local) {
        // Still ensure we have photos if local has none but remote has some
        const localPhotoCount = local.id
          ? await db.photos.where('deviceId').equals(local.id).count()
          : 0;
        const remotePhotoCount = remoteAfter.photos.filter(
          (p) => p.inventoryId === rem.inventoryId,
        ).length;
        if (localPhotoCount > 0 || remotePhotoCount === 0) continue;
      } else if (!shouldApply) {
        continue;
      }

      const form = remoteToForm(rem);
      const remotePhotos = remoteAfter.photos.filter(
        (p) => p.inventoryId === rem.inventoryId,
      );

      if (local?.id !== undefined) {
        // Replace local device row + photos when remote is newer (or filling missing photos)
        if (shouldApply) {
          await db.devices.update(local.id, {
            ...form,
            createdAt: rem.createdAt,
            updatedAt: rem.updatedAt,
          });
        }
        await db.photos.where('deviceId').equals(local.id).delete();
        for (const rp of remotePhotos) {
          const downloaded = await downloadRemotePhoto(accessKey, rp.storagePath);
          await db.photos.add({
            deviceId: local.id,
            photoType: rp.photoType as PhotoType,
            blob: downloaded.blob,
            mimeType: downloaded.mimeType,
            createdAt: rp.createdAt,
          });
          pulledPhotos++;
        }
        if (shouldApply) pulledDevices++;
      } else {
        const device: Device = {
          inventoryId: rem.inventoryId,
          ...form,
          createdAt: rem.createdAt,
          updatedAt: rem.updatedAt,
        };
        const deviceId = (await db.devices.add(device)) as number;
        for (const rp of remotePhotos) {
          const downloaded = await downloadRemotePhoto(accessKey, rp.storagePath);
          await db.photos.add({
            deviceId,
            photoType: rp.photoType as PhotoType,
            blob: downloaded.blob,
            mimeType: downloaded.mimeType,
            createdAt: rp.createdAt,
          });
          pulledPhotos++;
        }
        pulledDevices++;
      }
    }

    await ensureCounterPastExisting();

    const message = `Synced — pushed ${toPushMeta.length} devices / ${pushedPhotos} photos, pulled ${pulledDevices} devices / ${pulledPhotos} photos`;
    await markSyncResult(true, message);
    return {
      ok: true,
      message,
      pushedDevices: toPushMeta.length,
      pushedPhotos,
      pulledDevices,
      pulledPhotos,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed';
    await markSyncResult(false, message);
    return { ok: false, message };
  }
}

/** After saving one device — opportunistic cloud push (non-blocking caller). */
export async function syncDeviceAfterSave(deviceId: number): Promise<void> {
  const settings = await getSyncSettings();
  if (!settings.enabled || !settings.accessKey || !navigator.onLine) return;

  const device = await getDevice(deviceId);
  if (!device) return;

  try {
    await callSync(settings.accessKey, {
      action: 'push',
      devices: [
        {
          inventoryId: device.inventoryId,
          deviceName: device.deviceName,
          manufacturer: device.manufacturer,
          model: device.model,
          serialNumber: device.serialNumber,
          assetTag: device.assetTag,
          deviceType: device.deviceType,
          location: device.location,
          room: device.room,
          area: device.area,
          owner: device.owner,
          notes: device.notes,
          createdAt: device.createdAt,
          updatedAt: device.updatedAt,
        },
      ],
      photos: [],
      replacePhotoInventoryIds: [],
    });

    const photoPayload = [];
    for (const p of device.photos) {
      photoPayload.push({
        inventoryId: device.inventoryId,
        photoType: p.photoType,
        mimeType: p.mimeType,
        createdAt: p.createdAt,
        dataBase64: await blobToBase64(p.blob),
      });
    }
    await callSync(settings.accessKey, {
      action: 'push',
      devices: [],
      photos: photoPayload,
      replacePhotoInventoryIds: [device.inventoryId],
    });
    await markSyncResult(
      true,
      `Pushed ${device.inventoryId} (${photoPayload.length} photos)`,
    );
  } catch (e) {
    await markSyncResult(
      false,
      e instanceof Error ? e.message : 'Background sync failed',
    );
  }
}

export async function syncOnLaunchIfEnabled(): Promise<void> {
  const settings = await getSyncSettings();
  if (!settings.enabled || !settings.accessKey) return;
  if (!navigator.onLine) return;
  await runFullSync();
}

let syncInFlight: Promise<SyncResult> | null = null;

/** Deduped full sync — safe to call from focus/visibility handlers. */
export async function syncIfEnabledQuiet(): Promise<SyncResult | null> {
  const settings = await getSyncSettings();
  if (!settings.enabled || !settings.accessKey) return null;
  if (!navigator.onLine) return null;
  if (syncInFlight) return syncInFlight;
  syncInFlight = runFullSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}
