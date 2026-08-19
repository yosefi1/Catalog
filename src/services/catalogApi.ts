import { getAccessKey } from './accessKey';
import { onCatalogChanged } from './catalogEvents';
import type {
  Device,
  DeviceFormState,
  DevicePhoto,
  DeviceWithPhotos,
  PhotoType,
} from '../types/device';

type SyncPullPhoto = {
  id: string;
  inventoryId: string;
  photoType: string;
  mimeType: string;
  createdAt: number;
  storagePath: string;
};

export class CatalogApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const key = getAccessKey();
  if (!key) {
    throw new CatalogApiError('Set your access key in Settings first.', 401);
  }

  const headers = new Headers(init.headers);
  headers.set('X-Catalog-Key', key);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(text) as T & { error?: string };
  } catch {
    if (text.includes('FUNCTION_INVOCATION_FAILED')) {
      throw new CatalogApiError(
        `${path}: Server error — wait 1 minute after deploy and try again.`,
        res.status,
      );
    }
    throw new CatalogApiError(
      `${path}: HTTP ${res.status}: ${text.slice(0, 240) || '(empty)'}`,
      res.status,
    );
  }
  if (!res.ok) {
    throw new CatalogApiError(data.error || `HTTP ${res.status}`, res.status);
  }
  return data;
}

async function syncPull(): Promise<{
  devices: Device[];
  photos: SyncPullPhoto[];
  deletedInventoryIds?: string[];
}> {
  return apiFetch('/api/sync', {
    method: 'POST',
    body: JSON.stringify({ action: 'pull' }),
  });
}

export async function fetchDeletedInventoryIds(): Promise<Set<string>> {
  try {
    const data = await apiFetch<{ inventoryIds: string[] }>('/api/deleted-ids');
    return new Set(data.inventoryIds);
  } catch {
    try {
      const remote = await syncPull();
      return new Set(remote.deletedInventoryIds ?? []);
    } catch {
      return new Set();
    }
  }
}

export type DeviceListRow = Device & {
  thumbnailUrl?: string;
  mainPhotoId?: string;
  /** 1-based row # in current filtered/sorted list */
  displayNumber: number;
};

type DeviceRowFromApi = Omit<DeviceListRow, 'displayNumber'>;

let devicesCache: DeviceRowFromApi[] | null = null;

export function invalidateDevicesCache(): void {
  devicesCache = null;
}

if (typeof window !== 'undefined') {
  onCatalogChanged(() => {
    devicesCache = null;
  });
}

function pickMainPhoto(
  photos: SyncPullPhoto[],
  inventoryId: string,
): SyncPullPhoto | undefined {
  const devicePhotos = photos.filter((p) => p.inventoryId === inventoryId);
  return devicePhotos.find((p) => p.photoType === 'main') ?? devicePhotos[0];
}

async function loadDevicesFromNetwork(): Promise<DeviceRowFromApi[]> {
  try {
    const data = await apiFetch<{ devices: DeviceRowFromApi[] }>('/api/devices');
    return data.devices;
  } catch {
    const remote = await syncPull();
    return remote.devices.map((d) => {
      const row = d as DeviceRowFromApi;
      if (row.thumbnailUrl) return row;
      const main = pickMainPhoto(remote.photos, d.inventoryId);
      return {
        ...d,
        mainPhotoId: main?.id,
      };
    });
  }
}

export async function fetchDevices(): Promise<DeviceRowFromApi[]> {
  if (devicesCache) return devicesCache;
  devicesCache = await loadDevicesFromNetwork();
  return devicesCache;
}

const DEVICE_DETAIL_PATH = '/api/device-detail';

export async function fetchDevice(inventoryId: string): Promise<DeviceWithPhotos> {
  try {
    const data = await apiFetch<{
      device: Device;
      photos: DevicePhoto[];
    }>(`${DEVICE_DETAIL_PATH}?inventoryId=${encodeURIComponent(inventoryId)}`);
    return { ...data.device, photos: data.photos };
  } catch (primaryError) {
    if (
      primaryError instanceof CatalogApiError &&
      primaryError.status === 404
    ) {
      throw primaryError;
    }
    try {
      const data = await apiFetch<{
        device: Device;
        photos: DevicePhoto[];
      }>('/api/sync', {
        method: 'POST',
        body: JSON.stringify({ action: 'getDevice', inventoryId }),
      });
      return { ...data.device, photos: data.photos };
    } catch {
      const remote = await syncPull();
      const device = remote.devices.find((d) => d.inventoryId === inventoryId);
      if (!device) throw new CatalogApiError('Device not found', 404);
      const metas = remote.photos.filter((p) => p.inventoryId === inventoryId);
      const photos: DevicePhoto[] = await Promise.all(
        metas.map(async (pm) => {
          const dl = await apiFetch<{ dataBase64: string; mimeType: string }>(
            '/api/sync',
            {
              method: 'POST',
              body: JSON.stringify({
                action: 'downloadPhoto',
                storagePath: pm.storagePath,
              }),
            },
          );
          return {
            id: pm.id,
            photoType: pm.photoType as PhotoType,
            mimeType: dl.mimeType || pm.mimeType,
            url: `data:${dl.mimeType || pm.mimeType};base64,${dl.dataBase64}`,
            createdAt: pm.createdAt,
          };
        }),
      );
      return { ...device, photos };
    }
  }
}

async function syncPush(body: Record<string, unknown>): Promise<void> {
  await apiFetch('/api/sync', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function deviceFromForm(form: DeviceFormState, inventoryId: string): Device {
  const now = Date.now();
  return {
    inventoryId,
    deviceName: form.deviceName,
    manufacturer: form.manufacturer,
    model: form.model,
    serialNumber: form.serialNumber,
    assetTag: form.assetTag,
    deviceType: form.deviceType,
    location: form.location,
    room: form.room,
    area: form.area,
    owner: form.owner,
    notes: form.notes,
    createdAt: now,
    updatedAt: now,
  };
}

function nextIdFromDevices(devices: Device[], deleted: Set<string>): string {
  let max = 0;
  for (const d of devices) {
    const m = /^EQ-(\d+)$/i.exec(d.inventoryId);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let candidate = max + 1;
  while (deleted.has(`EQ-${String(candidate).padStart(4, '0')}`)) {
    candidate += 1;
  }
  return `EQ-${String(candidate).padStart(4, '0')}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read photo'));
    reader.readAsDataURL(blob);
  });
}

export async function createDeviceOnServer(
  form: DeviceFormState,
  inventoryId?: string,
): Promise<Device> {
  try {
    const data = await apiFetch<{ device: Device }>('/api/devices', {
      method: 'POST',
      body: JSON.stringify({ form, inventoryId }),
    });
    return data.device;
  } catch (primaryError) {
    if (primaryError instanceof CatalogApiError && primaryError.status === 409) {
      throw primaryError;
    }
    const id =
      inventoryId ??
      (await peekNextInventoryIdFromServer().catch(async () => {
        const remote = await syncPull();
        return nextIdFromDevices(
          remote.devices,
          new Set(remote.deletedInventoryIds ?? []),
        );
      }));
    const device = deviceFromForm(form, id);
    await syncPush({
      action: 'push',
      devices: [device],
      photos: [],
      replacePhotoInventoryIds: [],
    });
    return device;
  }
}

export async function updateDeviceOnServer(
  inventoryId: string,
  form: DeviceFormState,
): Promise<Device> {
  try {
    const data = await apiFetch<{ device: Device }>(
      `${DEVICE_DETAIL_PATH}?inventoryId=${encodeURIComponent(inventoryId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ form }),
      },
    );
    return data.device;
  } catch (primaryError) {
    if (
      primaryError instanceof CatalogApiError &&
      primaryError.status === 404
    ) {
      throw primaryError;
    }
    const data = await apiFetch<{ device: Device }>('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ action: 'updateDevice', inventoryId, form }),
    });
    return data.device;
  }
}

export async function deleteDeviceOnServer(inventoryId: string): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>(
      `${DEVICE_DETAIL_PATH}?inventoryId=${encodeURIComponent(inventoryId)}`,
      { method: 'DELETE' },
    );
  } catch (primaryError) {
    if (
      primaryError instanceof CatalogApiError &&
      primaryError.status === 404
    ) {
      return;
    }
    await apiFetch<{ ok: boolean }>('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', inventoryIds: [inventoryId] }),
    });
  }
}

export async function peekNextInventoryIdFromServer(): Promise<string> {
  try {
    const data = await apiFetch<{ inventoryId: string }>('/api/next-id');
    return data.inventoryId;
  } catch {
    const remote = await syncPull();
    return nextIdFromDevices(
      remote.devices,
      new Set(remote.deletedInventoryIds ?? []),
    );
  }
}

export async function fetchDistinctValues(
  field: 'location' | 'manufacturer' | 'deviceType' | 'room',
): Promise<string[]> {
  const data = await apiFetch<{ values: string[] }>(
    `/api/suggestions?field=${encodeURIComponent(field)}`,
  );
  return data.values;
}

export async function uploadPhoto(
  inventoryId: string,
  photoType: PhotoType,
  blob: Blob,
  mimeType: string,
  options?: { replaceExisting?: boolean; createdAt?: number },
): Promise<DevicePhoto> {
  const replaceExisting =
    options?.replaceExisting ?? photoType !== 'additional';
  const createdAt = options?.createdAt ?? Date.now();

  try {
    const prep = await apiFetch<{
      uploadUrl: string;
      storagePath: string;
      mimeType: string;
    }>('/api/photo-prepare-upload', {
      method: 'POST',
      body: JSON.stringify({
        inventoryId,
        photoType,
        mimeType,
        replaceExisting,
      }),
    });

    const putRes = await fetch(prep.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: blob,
    });
    if (!putRes.ok) {
      throw new CatalogApiError(
        `Photo upload failed (HTTP ${putRes.status})`,
        putRes.status,
      );
    }

    const done = await apiFetch<{ photo: DevicePhoto }>('/api/photo-complete', {
      method: 'POST',
      body: JSON.stringify({
        inventoryId,
        storagePath: prep.storagePath,
        photoType,
        mimeType,
        createdAt,
      }),
    });
    return done.photo;
  } catch {
    const dataBase64 = await blobToBase64(blob);
    await syncPush({
      action: 'push',
      devices: [],
      photos: [
        {
          inventoryId,
          photoType,
          mimeType,
          createdAt,
          dataBase64,
        },
      ],
      replacePhotoSlots:
        replaceExisting && photoType !== 'additional'
          ? [{ inventoryId, photoType }]
          : [],
    });
    const full = await fetchDevice(inventoryId);
    const photo =
      full.photos.find((p) => p.photoType === photoType) ??
      full.photos[full.photos.length - 1];
    if (!photo) {
      throw new CatalogApiError('Photo upload failed', 500);
    }
    return photo;
  }
}

export async function deletePhotoOnServer(photoId: string): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>(
      `/api/photo-delete?id=${encodeURIComponent(photoId)}`,
      { method: 'DELETE', body: '{}' },
    );
  } catch (primaryError) {
    if (
      primaryError instanceof CatalogApiError &&
      primaryError.status === 404
    ) {
      return;
    }
    await syncPush({ action: 'deletePhoto', photoId });
  }
}

export async function replacePhotoBlob(
  inventoryId: string,
  photoId: string,
  photoType: PhotoType,
  blob: Blob,
  mimeType: string,
): Promise<DevicePhoto> {
  await deletePhotoOnServer(photoId);
  return uploadPhoto(inventoryId, photoType, blob, mimeType, {
    replaceExisting: false,
    createdAt: Date.now(),
  });
}

export async function testConnection(): Promise<string> {
  let primaryError: unknown;
  try {
    const data = await apiFetch<{ ok: boolean; deviceCount: number }>('/api/health');
    return `Connected — ${data.deviceCount} device${data.deviceCount === 1 ? '' : 's'} on server.`;
  } catch (e) {
    primaryError = e;
  }
  try {
    const remote = await syncPull();
    return `Connected — ${remote.devices.length} device${remote.devices.length === 1 ? '' : 's'} on server (sync fallback).`;
  } catch (fallbackError) {
    const primary =
      primaryError instanceof Error ? primaryError.message : String(primaryError);
    const fallback =
      fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    throw new CatalogApiError(
      `Health: ${primary} | Sync: ${fallback}`,
      fallbackError instanceof CatalogApiError ? fallbackError.status : 500,
    );
  }
}
