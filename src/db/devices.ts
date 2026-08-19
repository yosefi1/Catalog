import type {
  Device,
  DeviceFormState,
  DevicePhoto,
  DeviceWithPhotos,
  InventoryFilters,
  PhotoType,
  SortField,
} from '../types/device';
import {
  createDeviceOnServer,
  deleteDeviceOnServer,
  deletePhotoOnServer,
  fetchDevice,
  fetchDevices,
  fetchDistinctValues,
  peekNextInventoryIdFromServer,
  replacePhotoBlob,
  updateDeviceOnServer,
  uploadPhoto,
  type DeviceListRow,
} from '../services/catalogApi';
import { notifyCatalogChanged } from '../services/catalogEvents';
import { getMeta } from './database';

const INVENTORY_FILTERS_KEY = 'inventoryFilters';

const DEFAULT_FILTERS: InventoryFilters = {
  search: '',
  location: '',
  manufacturer: '',
  deviceType: '',
  room: '',
  sortBy: 'inventoryId',
  sortDir: 'asc',
};

function parseFilters(raw: string | number | boolean): InventoryFilters {
  if (typeof raw !== 'string' || !raw) return DEFAULT_FILTERS;
  try {
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) as Partial<InventoryFilters> };
  } catch {
    return DEFAULT_FILTERS;
  }
}

async function activeFilters(): Promise<InventoryFilters> {
  return parseFilters(await getMeta(INVENTORY_FILTERS_KEY, ''));
}

export function formatInventoryId(n: number): string {
  return `EQ-${String(n).padStart(4, '0')}`;
}

export function parseInventoryIdNumber(inventoryId: string): number | null {
  const m = /^EQ-(\d+)$/i.exec(inventoryId.trim());
  return m ? Number(m[1]) : null;
}

export function formatDisplayNumber(
  device: { displayNumber: number } | string,
): string {
  if (typeof device === 'object') return String(device.displayNumber);
  const n = parseInventoryIdNumber(device);
  return n !== null ? String(n) : device;
}

/** URL segment — list position 1, 2, 3… */
export function deviceRouteId(device: { displayNumber: number }): string {
  return String(device.displayNumber);
}

export async function resolveInventoryIdFromRoute(routeId: string): Promise<string> {
  const trimmed = routeId.trim();
  if (/^EQ-\d+$/i.test(trimmed)) return trimmed.toUpperCase();

  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    throw new Error('Device not found');
  }

  const devices = await queryDevices(await activeFilters());
  const device = devices[n - 1];
  if (!device) throw new Error('Device not found');
  return device.inventoryId;
}

export async function peekNextInventoryId(): Promise<string> {
  return peekNextInventoryIdFromServer();
}

export async function getAllDevices() {
  return fetchDevices();
}

export async function getDevice(inventoryId: string): Promise<DeviceWithPhotos | undefined> {
  try {
    return await fetchDevice(inventoryId);
  } catch (e) {
    if (e instanceof Error && e.message.includes('not found')) return undefined;
    throw e;
  }
}

export async function getDeviceByRoute(
  routeId: string,
  inventoryIdHint?: string,
): Promise<DeviceWithPhotos | undefined> {
  try {
    if (inventoryIdHint) {
      const direct = await getDevice(inventoryIdHint);
      if (direct) return direct;
    }
    const inventoryId = await resolveInventoryIdFromRoute(routeId);
    return getDevice(inventoryId);
  } catch {
    return undefined;
  }
}

export async function findDisplayNumber(inventoryId: string): Promise<number | undefined> {
  const devices = await queryDevices(await activeFilters());
  const idx = devices.findIndex((d) => d.inventoryId === inventoryId);
  return idx >= 0 ? devices[idx].displayNumber : undefined;
}

type PhotoInput = {
  id?: string;
  photoType: PhotoType;
  blob: Blob;
  mimeType: string;
  createdAt: number;
};

export async function createDevice(
  form: DeviceFormState,
  photos: PhotoInput[],
): Promise<Device> {
  const device = await createDeviceOnServer(form);
  for (const p of photos) {
    await uploadPhoto(device.inventoryId, p.photoType, p.blob, p.mimeType, {
      replaceExisting: p.photoType !== 'additional',
      createdAt: p.createdAt,
    });
  }
  notifyCatalogChanged();
  return device;
}

export async function updateDevice(
  inventoryId: string,
  form: DeviceFormState,
  photos: PhotoInput[],
  keepPhotoIds: string[],
): Promise<Device> {
  const existing = await fetchDevice(inventoryId);
  const device = await updateDeviceOnServer(inventoryId, form);

  const toDelete = existing.photos.filter(
    (p) => p.id && !keepPhotoIds.includes(p.id),
  );
  for (const p of toDelete) {
    if (p.id) await deletePhotoOnServer(p.id);
  }

  for (const p of photos) {
    if (p.id && keepPhotoIds.includes(p.id)) continue;
    if (p.id) {
      await replacePhotoBlob(inventoryId, p.id, p.photoType, p.blob, p.mimeType);
    } else {
      await uploadPhoto(inventoryId, p.photoType, p.blob, p.mimeType, {
        replaceExisting: p.photoType !== 'additional',
        createdAt: p.createdAt,
      });
    }
  }

  notifyCatalogChanged();
  return device;
}

export async function updateDeviceFields(
  inventoryId: string,
  form: DeviceFormState,
): Promise<Device> {
  const device = await updateDeviceOnServer(inventoryId, form);
  notifyCatalogChanged();
  return device;
}

export async function deleteDevice(inventoryId: string): Promise<void> {
  await deleteDeviceOnServer(inventoryId);
  notifyCatalogChanged();
}

export async function updateDevicePhotoBlob(
  inventoryId: string,
  photoId: string,
  photoType: PhotoType,
  patch: { blob: Blob; mimeType: string },
): Promise<DevicePhoto> {
  const photo = await replacePhotoBlob(
    inventoryId,
    photoId,
    photoType,
    patch.blob,
    patch.mimeType,
  );
  notifyCatalogChanged();
  return photo;
}

export async function deleteDevicePhoto(photoId: string): Promise<void> {
  await deletePhotoOnServer(photoId);
  notifyCatalogChanged();
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
  if (sortBy === 'inventoryId') {
    const an = parseInventoryIdNumber(a.inventoryId) ?? 0;
    const bn = parseInventoryIdNumber(b.inventoryId) ?? 0;
    return (an - bn) * dir;
  }
  const av = a[sortBy];
  const bv = b[sortBy];
  if (typeof av === 'number' && typeof bv === 'number') {
    return (av - bv) * dir;
  }
  return (
    String(av ?? '').localeCompare(String(bv ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    }) * dir
  );
}

export async function queryDevices(filters: InventoryFilters): Promise<DeviceListRow[]> {
  let devices = await fetchDevices();

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

  devices.sort((a, b) =>
    compareDevices(a, b, filters.sortBy, filters.sortDir),
  );
  return devices.map((d, i) => ({ ...d, displayNumber: i + 1 }));
}

export async function getDistinctFieldValues(
  field: 'location' | 'manufacturer' | 'deviceType' | 'room',
): Promise<string[]> {
  return fetchDistinctValues(field);
}

export async function getDeviceCount(): Promise<number> {
  const devices = await fetchDevices();
  return devices.length;
}

export async function getPhotoCount(): Promise<number> {
  const devices = await fetchDevices();
  let count = 0;
  for (const d of devices) {
    const full = await fetchDevice(d.inventoryId);
    count += full.photos.length;
  }
  return count;
}

/** Legacy no-op — data lives on server now. */
export async function clearAllData(): Promise<void> {
  throw new Error('Clear all is disabled — data is stored on the server.');
}

export async function ensureCounterPastExisting(): Promise<void> {
  /* server allocates IDs */
}
