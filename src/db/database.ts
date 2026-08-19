import Dexie, { type EntityTable } from 'dexie';
import type { DeviceDraft, PhotoType } from '../types/device';

export interface MetaRecord {
  key: string;
  value: string | number | boolean;
}

/** Legacy IndexedDB device row (for migration / drafts only). */
export interface LocalDevice {
  id?: number;
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
}

export interface LocalDevicePhoto {
  id?: number;
  deviceId: number;
  photoType: PhotoType;
  blob: Blob;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: number;
  ocrRawText?: string;
}

export interface SuggestionRecord {
  id?: number;
  field:
    | 'location'
    | 'room'
    | 'area'
    | 'owner'
    | 'manufacturer'
    | 'deviceType';
  value: string;
  lastUsedAt: number;
  useCount: number;
}

export class CatalogDatabase extends Dexie {
  devices!: EntityTable<LocalDevice, 'id'>;
  photos!: EntityTable<LocalDevicePhoto, 'id'>;
  drafts!: EntityTable<DeviceDraft, 'id'>;
  suggestions!: EntityTable<SuggestionRecord, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor() {
    super('EquipmentCatalogDB');

    this.version(1).stores({
      devices:
        '++id, inventoryId, deviceName, manufacturer, model, serialNumber, assetTag, deviceType, location, room, createdAt, updatedAt',
      photos: '++id, deviceId, photoType, createdAt',
      drafts: 'id, updatedAt',
      suggestions: '++id, [field+value], field, lastUsedAt',
      meta: 'key',
    });
  }
}

export const db = new CatalogDatabase();

export async function getMeta(
  key: string,
  fallback: string | number | boolean,
): Promise<string | number | boolean> {
  const row = await db.meta.get(key);
  if (row === undefined) return fallback;
  return row.value;
}

export async function setMeta(
  key: string,
  value: string | number | boolean,
): Promise<void> {
  await db.meta.put({ key, value });
}
