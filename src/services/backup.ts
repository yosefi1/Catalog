import type JSZip from 'jszip';
import type { JSZipObject } from 'jszip';
import { db } from '../db/database';
import {
  clearAllData,
  createDevice,
  ensureCounterPastExisting,
  getAllDevices,
} from '../db/devices';
import type { Device, DeviceFormState, PhotoType } from '../types/device';
import {
  base64ToBlob,
  blobToBase64,
  saveBlobAsFile,
  todayStamp,
} from './utils';

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
  sourceLabel: string;
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

function parseTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return t;
  }
  return fallback;
}

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function photoTypeFromName(name: string): PhotoType {
  const base = name.split('/').pop()?.toLowerCase() ?? '';
  if (base.startsWith('main')) return 'main';
  if (base.startsWith('model')) return 'model_label';
  if (base.startsWith('serial')) return 'serial_label';
  if (base.startsWith('asset')) return 'asset_tag';
  return 'additional';
}

function normalizePhotoType(value: unknown, fileName: string): PhotoType {
  const raw = String(value ?? '').toLowerCase();
  const allowed: PhotoType[] = [
    'main',
    'model_label',
    'serial_label',
    'asset_tag',
    'additional',
  ];
  if (allowed.includes(raw as PhotoType)) return raw as PhotoType;
  return photoTypeFromName(fileName);
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
  // Keep both names for clarity / older tooling
  const json = JSON.stringify(payload, null, 2);
  zip.file('backup.json', json);
  zip.file('EquipmentBackup.json', json);
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
  });
  await saveBlobAsFile(blob, `EquipmentBackup_${todayStamp()}.zip`);
}

function findZipEntry(
  zip: JSZip,
  matcher: (name: string) => boolean,
): JSZipObject | undefined {
  return Object.values(zip.files).find(
    (f) => !f.dir && matcher(f.name.replace(/\\/g, '/')),
  );
}

async function zipObjectToBlob(entry: JSZipObject, mime: string): Promise<Blob> {
  const bytes = await entry.async('uint8array');
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: mime });
}

async function payloadFromBackupJson(jsonText: string): Promise<BackupPayload> {
  const parsed = JSON.parse(jsonText) as BackupPayload;
  if (!parsed?.devices || !Array.isArray(parsed.devices)) {
    throw new Error('Invalid backup format (missing devices array)');
  }
  return {
    version: 1,
    exportedAt: parsed.exportedAt || new Date().toISOString(),
    devices: parsed.devices,
  };
}

/** Convert Inventory Package ZIP (inventory.json + images/) into a backup payload. */
async function payloadFromInventoryZip(zip: JSZip): Promise<BackupPayload> {
  const inventoryEntry = findZipEntry(zip, (name) => {
    const n = name.toLowerCase();
    return n === 'inventory.json' || n.endsWith('/inventory.json');
  });
  if (!inventoryEntry) {
    throw new Error(
      'No backup.json or inventory.json found in ZIP. On iPhone use Data → Export Backup (not Inventory Package), then AirDrop/Files the ZIP to your PC.',
    );
  }

  const jsonText = await inventoryEntry.async('string');
  const parsed = JSON.parse(jsonText) as {
    exportedAt?: string;
    devices?: Array<Record<string, unknown>>;
  };
  if (!parsed.devices || !Array.isArray(parsed.devices)) {
    throw new Error('inventory.json is missing a devices array');
  }

  const now = Date.now();
  const devices: BackupDevice[] = [];

  for (const d of parsed.devices) {
    const inventoryId = String(d.inventoryId ?? '').trim();
    if (!inventoryId) continue;

    const photoMeta = Array.isArray(d.photos) ? d.photos : [];
    const photos: BackupPhoto[] = [];

    for (const meta of photoMeta as Array<Record<string, unknown>>) {
      const rel = String(meta.path ?? '').replace(/\\/g, '/');
      if (!rel) continue;

      const candidates = [
        rel,
        rel.replace(/^\.\//, ''),
        `EquipmentInventory/${rel}`,
      ];
      const fileEntry =
        candidates.map((c) => zip.file(c)).find((x): x is JSZipObject => Boolean(x)) ||
        findZipEntry(zip, (name) => name.replace(/\\/g, '/').endsWith(rel));

      if (!fileEntry) continue;

      const mime = mimeFromName(rel);
      const blob = await zipObjectToBlob(fileEntry, mime);
      photos.push({
        photoType: normalizePhotoType(meta.type ?? meta.photoType, rel),
        mimeType: mime,
        createdAt: now,
        dataBase64: await blobToBase64(blob),
      });
    }

    if (!photos.length) {
      const needle = `images/${inventoryId.toLowerCase()}/`;
      const prefixMatches = Object.values(zip.files).filter(
        (f) => !f.dir && f.name.replace(/\\/g, '/').toLowerCase().includes(needle),
      );
      for (const f of prefixMatches) {
        const mime = mimeFromName(f.name);
        const blob = await zipObjectToBlob(f, mime);
        photos.push({
          photoType: photoTypeFromName(f.name),
          mimeType: mime,
          createdAt: now,
          dataBase64: await blobToBase64(blob),
        });
      }
    }

    devices.push({
      inventoryId,
      deviceName: String(d.deviceName ?? ''),
      manufacturer: String(d.manufacturer ?? ''),
      model: String(d.model ?? ''),
      serialNumber: String(d.serialNumber ?? ''),
      assetTag: String(d.assetTag ?? ''),
      deviceType: String(d.deviceType ?? ''),
      location: String(d.location ?? ''),
      room: String(d.room ?? ''),
      area: String(d.area ?? ''),
      owner: String(d.owner ?? ''),
      notes: String(d.notes ?? ''),
      createdAt: parseTimestamp(d.createdAt, now),
      updatedAt: parseTimestamp(d.updatedAt, now),
      photos,
    });
  }

  return {
    version: 1,
    exportedAt: parsed.exportedAt || new Date().toISOString(),
    devices,
  };
}

export async function parseBackupFile(file: File): Promise<BackupPreview> {
  const name = file.name.toLowerCase();
  const looksZip =
    name.endsWith('.zip') ||
    file.type.includes('zip') ||
    file.type === 'application/octet-stream' ||
    file.type === '';

  let payload: BackupPayload;
  let sourceLabel = 'Backup file';

  if (looksZip) {
    const { default: JSZip } = await import('jszip');
    let zip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      // Some iOS shares save JSON with a wrong .zip extension
      try {
        payload = await payloadFromBackupJson(await file.text());
        sourceLabel = 'Backup JSON';
        return summarize(payload, sourceLabel);
      } catch {
        throw new Error(
          'Could not read this file as a ZIP. On iPhone use Export Backup, then AirDrop it (or save to Files) and import that ZIP on the PC.',
        );
      }
    }

    const backupEntry = findZipEntry(zip, (n) => {
      const lower = n.toLowerCase();
      return (
        lower === 'backup.json' ||
        lower.endsWith('/backup.json') ||
        lower === 'equipmentbackup.json' ||
        lower.endsWith('/equipmentbackup.json')
      );
    });

    if (backupEntry) {
      payload = await payloadFromBackupJson(await backupEntry.async('string'));
      sourceLabel = 'Equipment Backup ZIP';
    } else {
      payload = await payloadFromInventoryZip(zip);
      sourceLabel = 'Inventory Package ZIP (converted)';
    }
  } else {
    payload = await payloadFromBackupJson(await file.text());
    sourceLabel = 'Backup JSON';
  }

  return summarize(payload, sourceLabel);
}

function summarize(payload: BackupPayload, sourceLabel: string): BackupPreview {
  const photoCount = payload.devices.reduce(
    (n, d) => n + (d.photos?.length ?? 0),
    0,
  );
  return {
    deviceCount: payload.devices.length,
    photoCount,
    payload,
    sourceLabel,
  };
}

async function importDeviceKeepingId(d: BackupDevice): Promise<void> {
  const now = Date.now();
  const form = deviceToForm(d);

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
