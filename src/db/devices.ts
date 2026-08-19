import { db, getMeta, setMeta } from './database';
import type {
  Device,
  DeviceFormState,
  DevicePhoto,
  DeviceWithPhotos,
  InventoryFilters,
  SortField,
} from '../types/device';
import { recordSuggestionsFromDevice } from './suggestions';

const INVENTORY_COUNTER_KEY = 'inventoryCounter';

export async function peekNextInventoryId(): Promise<string> {
  const counter = Number(await getMeta(INVENTORY_COUNTER_KEY, 0));
  return formatInventoryId(counter + 1);
}

export async function allocateInventoryId(): Promise<string> {
  return db.transaction('rw', db.meta, async () => {
    const counter = Number(await getMeta(INVENTORY_COUNTER_KEY, 0));
    const next = counter + 1;
    await setMeta(INVENTORY_COUNTER_KEY, next);
    return formatInventoryId(next);
  });
}

export function formatInventoryId(n: number): string {
  return `EQ-${String(n).padStart(4, '0')}`;
}

export function parseInventoryIdNumber(inventoryId: string): number | null {
  const m = /^EQ-(\d+)$/i.exec(inventoryId.trim());
  return m ? Number(m[1]) : null;
}

/** UI label: EQ-0003 → 3. Keeps stored inventoryId unchanged. */
export function formatDisplayNumber(inventoryId: string): string {
  const n = parseInventoryIdNumber(inventoryId);
  return n !== null ? String(n) : inventoryId;
}

/** Keep counter ahead of any existing inventory IDs (e.g. after merge import). */
export async function ensureCounterPastExisting(): Promise<void> {
  const devices = await db.devices.toArray();
  const raw = await getMeta(INVENTORY_COUNTER_KEY, 0);
  let max = typeof raw === 'number' ? raw : Number(raw) || 0;
  for (const d of devices) {
    const n = parseInventoryIdNumber(d.inventoryId);
    if (n !== null && n > max) max = n;
  }
  await setMeta(INVENTORY_COUNTER_KEY, max);
}

export async function createDevice(
  form: DeviceFormState,
  photos: Omit<DevicePhoto, 'id' | 'deviceId'>[],
): Promise<Device> {
  const now = Date.now();
  const inventoryId = await allocateInventoryId();

  const device: Device = {
    inventoryId,
    ...form,
    createdAt: now,
    updatedAt: now,
  };

  const id = await db.transaction('rw', db.devices, db.photos, db.suggestions, async () => {
    const deviceId = await db.devices.add(device);
    if (photos.length) {
      await db.photos.bulkAdd(
        photos.map((p) => ({
          ...p,
          deviceId: deviceId as number,
        })),
      );
    }
    await recordSuggestionsFromDevice(form);
    return deviceId as number;
  });

  return { ...device, id };
}

export async function updateDevice(
  id: number,
  form: DeviceFormState,
  photos: Array<Omit<DevicePhoto, 'id' | 'deviceId'> & { id?: number }>,
  keepPhotoIds: number[],
): Promise<Device> {
  const existing = await db.devices.get(id);
  if (!existing) throw new Error('Device not found');

  const updated: Device = {
    ...existing,
    ...form,
    updatedAt: Date.now(),
  };

  await db.transaction('rw', db.devices, db.photos, db.suggestions, async () => {
    await db.devices.put(updated);

    const currentPhotos = await db.photos.where('deviceId').equals(id).toArray();
    const toDelete = currentPhotos.filter(
      (p) => p.id !== undefined && !keepPhotoIds.includes(p.id),
    );
    if (toDelete.length) {
      await db.photos.bulkDelete(toDelete.map((p) => p.id!));
    }

    for (const photo of photos) {
      if (photo.id) {
        await db.photos.update(photo.id, {
          photoType: photo.photoType,
          blob: photo.blob,
          mimeType: photo.mimeType,
          width: photo.width,
          height: photo.height,
          ocrRawText: photo.ocrRawText,
        });
      } else {
        await db.photos.add({
          deviceId: id,
          photoType: photo.photoType,
          blob: photo.blob,
          mimeType: photo.mimeType,
          width: photo.width,
          height: photo.height,
          createdAt: photo.createdAt,
          ocrRawText: photo.ocrRawText,
        });
      }
    }

    await recordSuggestionsFromDevice(form);
  });

  return updated;
}

export async function deleteDevice(id: number): Promise<void> {
  await db.transaction('rw', db.devices, db.photos, async () => {
    await db.photos.where('deviceId').equals(id).delete();
    await db.devices.delete(id);
  });
}

export async function getDevice(id: number): Promise<DeviceWithPhotos | undefined> {
  const device = await db.devices.get(id);
  if (!device) return undefined;
  const photos = await db.photos.where('deviceId').equals(id).toArray();
  return { ...device, photos };
}

export async function updateDevicePhotoBlob(
  photoId: number,
  patch: { blob: Blob; mimeType: string; width?: number; height?: number },
  fallback?: { deviceId: number; index: number },
): Promise<number> {
  let id = Number(photoId);
  let photo = Number.isFinite(id) ? await db.photos.get(id) : undefined;
  if (!photo && fallback) {
    const rows = await db.photos.where('deviceId').equals(fallback.deviceId).toArray();
    photo = rows[fallback.index];
    id = Number(photo?.id);
  }
  if (!photo || !Number.isFinite(id)) throw new Error('Photo not found');
  const deviceKey = photo.deviceId;
  const now = Date.now();
  await db.transaction('rw', db.devices, db.photos, async () => {
    await db.photos.update(id, {
      blob: patch.blob,
      mimeType: patch.mimeType,
      width: patch.width,
      height: patch.height,
      createdAt: now,
    });
    await db.devices.update(deviceKey, { updatedAt: now });
  });
  return id;
}

export async function deleteDevicePhoto(photoId: number): Promise<void> {
  const id = Number(photoId);
  const photo = Number.isFinite(id) ? await db.photos.get(id) : undefined;
  if (!photo) throw new Error('Photo not found');
  const now = Date.now();
  await db.transaction('rw', db.devices, db.photos, async () => {
    await db.photos.delete(id);
    await db.devices.update(photo.deviceId, { updatedAt: now });
  });
}

export async function getAllDevices(): Promise<Device[]> {
  return db.devices.orderBy('inventoryId').toArray();
}

export async function getDeviceCount(): Promise<number> {
  return db.devices.count();
}

export async function getPhotoCount(): Promise<number> {
  return db.photos.count();
}

function matchesSearch(device: Device, q: string): boolean {
  if (!q) return true;
  const hay = [
    device.inventoryId,
    formatDisplayNumber(device.inventoryId),
    device.deviceName,
    device.manufacturer,
    device.model,
    device.serialNumber,
    device.assetTag,
    device.location,
    device.room,
    device.notes,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function compareDevices(
  a: Device,
  b: Device,
  sortBy: SortField,
  sortDir: 'asc' | 'desc',
): number {
  const dir = sortDir === 'asc' ? 1 : -1;
  const av = a[sortBy];
  const bv = b[sortBy];
  if (typeof av === 'number' && typeof bv === 'number') {
    return (av - bv) * dir;
  }
  return String(av ?? '').localeCompare(String(bv ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  }) * dir;
}

export async function queryDevices(filters: InventoryFilters): Promise<Device[]> {
  let devices = await db.devices.toArray();

  if (filters.location) {
    devices = devices.filter((d) => d.location === filters.location);
  }
  if (filters.manufacturer) {
    devices = devices.filter((d) => d.manufacturer === filters.manufacturer);
  }
  if (filters.deviceType) {
    devices = devices.filter((d) => d.deviceType === filters.deviceType);
  }
  if (filters.room) {
    devices = devices.filter((d) => d.room === filters.room);
  }
  if (filters.search.trim()) {
    devices = devices.filter((d) => matchesSearch(d, filters.search.trim()));
  }

  devices.sort((a, b) => compareDevices(a, b, filters.sortBy, filters.sortDir));
  return devices;
}

export async function getDistinctFieldValues(
  field: 'location' | 'manufacturer' | 'deviceType' | 'room',
): Promise<string[]> {
  const devices = await db.devices.toArray();
  const set = new Set<string>();
  for (const d of devices) {
    const v = d[field]?.trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    db.devices,
    db.photos,
    db.drafts,
    db.suggestions,
    db.meta,
    async () => {
      await Promise.all([
        db.devices.clear(),
        db.photos.clear(),
        db.drafts.clear(),
        db.suggestions.clear(),
        db.meta.clear(),
      ]);
    },
  );
}
