import { db } from '../db/database';
import {
  createDeviceOnServer,
  fetchDevice,
  fetchDevices,
  uploadPhoto,
} from './catalogApi';
import { deviceToForm, type PhotoType } from '../types/device';
import { notifyCatalogChanged } from './catalogEvents';

export async function countLocalDevices(): Promise<number> {
  try {
    return await db.devices.count();
  } catch {
    return 0;
  }
}

export async function migrateLocalToServer(
  onProgress?: (msg: string) => void,
): Promise<{ uploaded: number; skipped: number; photos: number }> {
  const localDevices = await db.devices.toArray();
  const remote = await fetchDevices();
  const remoteIds = new Set(remote.map((d) => d.inventoryId));

  let uploaded = 0;
  let skipped = 0;
  let photos = 0;

  for (const local of localDevices) {
    const onServer = remoteIds.has(local.inventoryId);

    if (onServer) {
      const remoteFull = await fetchDevice(local.inventoryId).catch(() => null);
      const remotePhotoCount = remoteFull?.photos.length ?? 0;
      const localPhotoCount =
        local.id !== undefined
          ? await db.photos.where('deviceId').equals(local.id).count()
          : 0;

      if (remotePhotoCount > 0 || localPhotoCount === 0) {
        skipped += 1;
        onProgress?.(`Skip ${local.inventoryId} — already on server`);
        continue;
      }

      onProgress?.(`Upload photos for ${local.inventoryId} (metadata already on server)…`);
    } else {
      onProgress?.(`Uploading ${local.inventoryId}…`);
      const form = deviceToForm(local);
      await createDeviceOnServer(form, local.inventoryId);
      uploaded += 1;
    }

    if (local.id !== undefined) {
      const localPhotos = await db.photos
        .where('deviceId')
        .equals(local.id)
        .toArray();
      for (const p of localPhotos) {
        onProgress?.(`  Photo ${p.photoType}…`);
        await uploadPhoto(
          local.inventoryId,
          p.photoType as PhotoType,
          p.blob,
          p.mimeType,
          {
            replaceExisting: p.photoType !== 'additional',
            createdAt: p.createdAt,
          },
        );
        photos += 1;
      }
    }
  }

  notifyCatalogChanged();
  return { uploaded, skipped, photos };
}
