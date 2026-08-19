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
        'Server error — wait 1 minute after deploy and try again.',
        res.status,
      );
    }
    throw new CatalogApiError(
      `HTTP ${res.status}: ${text.slice(0, 240) || '(empty)'}`,
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
}> {
  return apiFetch('/api/sync', {
    method: 'POST',
    body: JSON.stringify({ action: 'pull' }),
  });
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

export async function fetchDevice(inventoryId: string): Promise<DeviceWithPhotos> {
  try {
    const data = await apiFetch<{
      device: Device;
      photos: DevicePhoto[];
    }>(`/api/device?inventoryId=${encodeURIComponent(inventoryId)}`);
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

export async function createDeviceOnServer(
  form: DeviceFormState,
  inventoryId?: string,
): Promise<Device> {
  const data = await apiFetch<{ device: Device }>('/api/devices', {
    method: 'POST',
    body: JSON.stringify({ form, inventoryId }),
  });
  return data.device;
}

export async function updateDeviceOnServer(
  inventoryId: string,
  form: DeviceFormState,
): Promise<Device> {
  const data = await apiFetch<{ device: Device }>(
    `/api/device?inventoryId=${encodeURIComponent(inventoryId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ form }),
    },
  );
  return data.device;
}

export async function deleteDeviceOnServer(inventoryId: string): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>(
      `/api/device?inventoryId=${encodeURIComponent(inventoryId)}`,
      { method: 'DELETE' },
    );
  } catch {
    await apiFetch<{ ok: boolean }>('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', inventoryIds: [inventoryId] }),
    });
  }
}

export async function peekNextInventoryIdFromServer(): Promise<string> {
  const data = await apiFetch<{ inventoryId: string }>('/api/next-id');
  return data.inventoryId;
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
  const prep = await apiFetch<{
    uploadUrl: string;
    storagePath: string;
    mimeType: string;
  }>('/api/photos/prepare-upload', {
    method: 'POST',
    body: JSON.stringify({
      inventoryId,
      photoType,
      mimeType,
      replaceExisting: options?.replaceExisting ?? photoType !== 'additional',
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

  const done = await apiFetch<{ photo: DevicePhoto }>('/api/photos/complete', {
    method: 'POST',
    body: JSON.stringify({
      inventoryId,
      storagePath: prep.storagePath,
      photoType,
      mimeType,
      createdAt: options?.createdAt ?? Date.now(),
    }),
  });
  return done.photo;
}

export async function deletePhotoOnServer(photoId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(
    `/api/photos/delete?id=${encodeURIComponent(photoId)}`,
    { method: 'DELETE', body: '{}' },
  );
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
  try {
    const data = await apiFetch<{ ok: boolean; deviceCount: number }>('/api/health');
    return `Connected — ${data.deviceCount} device${data.deviceCount === 1 ? '' : 's'} on server.`;
  } catch {
    const remote = await syncPull();
    return `Connected — ${remote.devices.length} device${remote.devices.length === 1 ? '' : 's'} on server.`;
  }
}
