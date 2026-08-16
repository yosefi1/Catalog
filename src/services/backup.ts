import { db } from '../db/database';
import {
  clearAllData,
  createDevice,
  ensureCounterPastExisting,
  getAllDevices,
} from '../db/devices';
import type { Device, DeviceFormState, PhotoType } from '../types/device';
import { base64ToBlob, blobToBase64, downloadBlob, todayStamp } from './utils';

export interface BackupPhoto {
  photoType: PhotoType;
  mimeType: string;
  createdAt: number;
  width?: number;
  height?: number;
  ocrRawText?: string;
  dataBase64: string;
}

export interface BackupDevice {
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
  photos: BackupPhoto[];
}

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  devices: BackupDevice[];
}

export interface BackupPreview {
  deviceCount: number;
  photoCount: number;
  payload: BackupPayload;
}

function deviceToForm(d: BackupDevice): DeviceFormState {
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

export async function buildBackupPayload(): Promise<BackupPayload> {
  const devices = await getAllDevices();
  const backupDevices: BackupDevice[] = [];

  for (const device of devices) {
    if (device.id === undefined) continue;
    const photos = await db.photos.where('deviceId').equals(device.id).toArray();
    const backupPhotos: BackupPhoto[] = [];
    for (const p of photos) {
      backupPhotos.push({
        photoType: p.photoType,
        mimeType: p.mimeType,
        createdAt: p.createdAt,
        width: p.width,
        height: p.height,
        ocrRawText: p.ocrRawText,
        dataBase64: await blobToBase64(p.blob),
      });
    }
    backupDevices.push({
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
      photos: backupPhotos,
    });
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    devices: backupDevices,
  };
}

export async function exportBackupZip(): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const payload = await buildBackupPayload();
  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(payload, null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `EquipmentBackup_${todayStamp()}.zip`);
}

export async function parseBackupFile(file: File): Promise<BackupPreview> {
  let jsonText: string;

  if (file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip')) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const entry =
      zip.file('backup.json') ||
      Object.values(zip.files).find(
        (f) => !f.dir && f.name.toLowerCase().endsWith('backup.json'),
      );
    if (!entry) throw new Error('backup.json not found in ZIP');
    jsonText = await entry.async('string');
  } else {
    jsonText = await file.text();
  }

  const payload = JSON.parse(jsonText) as BackupPayload;
  if (!payload?.devices || !Array.isArray(payload.devices)) {
    throw new Error('Invalid backup format');
  }

  const photoCount = payload.devices.reduce(
    (n, d) => n + (d.photos?.length ?? 0),
    0,
  );

  return {
    deviceCount: payload.devices.length,
    photoCount,
    payload,
  };
}

async function importDeviceKeepingId(
  d: BackupDevice,
): Promise<void> {
  const now = Date.now();
  const form = deviceToForm(d);

  // Insert with explicit inventory ID via raw put after allocating a placeholder
  // We bypass allocateInventoryId and set inventoryId from backup.
  const device: Device = {
    inventoryId: d.inventoryId,
    ...form,
    createdAt: d.createdAt || now,
    updatedAt: d.updatedAt || now,
  };

  await db.transaction('rw', db.devices, db.photos, async () => {
    const deviceId = (await db.devices.add(device)) as number;
    for (const p of d.photos ?? []) {
      await db.photos.add({
        deviceId,
        photoType: p.photoType,
        blob: base64ToBlob(p.dataBase64, p.mimeType || 'image/jpeg'),
        mimeType: p.mimeType || 'image/jpeg',
        width: p.width,
        height: p.height,
        createdAt: p.createdAt || now,
        ocrRawText: p.ocrRawText,
      });
    }
  });
}

export async function importBackupReplace(payload: BackupPayload): Promise<void> {
  await clearAllData();
  for (const d of payload.devices) {
    await importDeviceKeepingId(d);
  }
  await ensureCounterPastExisting();
}

export async function importBackupMerge(payload: BackupPayload): Promise<{
  imported: number;
  skipped: number;
  remapped: number;
}> {
  const existing = await getAllDevices();
  const usedIds = new Set(existing.map((d) => d.inventoryId));
  let imported = 0;
  let remapped = 0;

  for (const d of payload.devices) {
    if (!usedIds.has(d.inventoryId)) {
      await importDeviceKeepingId(d);
      usedIds.add(d.inventoryId);
      imported++;
      continue;
    }

    // Duplicate inventory ID: create as new device with new ID (photos preserved)
    const form = deviceToForm(d);
    const photos = (d.photos ?? []).map((p) => ({
      photoType: p.photoType,
      blob: base64ToBlob(p.dataBase64, p.mimeType || 'image/jpeg'),
      mimeType: p.mimeType || 'image/jpeg',
      width: p.width,
      height: p.height,
      createdAt: p.createdAt || Date.now(),
      ocrRawText: p.ocrRawText,
    }));
    await createDevice(form, photos);
    remapped++;
    imported++;
  }

  await ensureCounterPastExisting();
  return { imported, skipped: 0, remapped };
}
