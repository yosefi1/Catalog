import { db } from '../db/database';
import {
  createDeviceOnServer,
  fetchDeletedInventoryIds,
  fetchDevice,
  fetchDevices,
  uploadPhoto,
} from './catalogApi';
import {
  clearLocalLegacyData,
  getLocalDeletedIds,
  markLocalDeletion,
  removeLocalDevice,
} from './localLegacy';
import { deviceToForm, type PhotoType } from '../types/device';
import { notifyCatalogChanged } from './catalogEvents';

export { clearLocalLegacyData, markLocalDeletion, removeLocalDevice };

export async function countLocalDevices(): Promise<number> {
  try {
    return await db.devices.count();
  } catch {
    return 0;
  }
}

export async function countLocalPhotos(): Promise<number> {
  try {
    return await db.photos.count();
  } catch {
    return 0;
  }
}

export async function migrateLocalToServer(
  onProgress?: (msg: string) => void,
): Promise<{ uploaded: number; skipped: number; photos: number; purged: number }> {
  const localDevices = await db.devices.toArray();
  const remote = await fetchDevices();
  const remoteIds = new Set(remote.map((d) => d.inventoryId));
  const serverDeleted = await fetchDeletedInventoryIds();
  const localDeleted = await getLocalDeletedIds();
  const blockedIds = new Set([...serverDeleted, ...localDeleted]);

  let uploaded = 0;
  let skipped = 0;
  let photos = 0;
  let purged = 0;

  for (const local of localDevices) {
    if (blockedIds.has(local.inventoryId)) {
      await removeLocalDevice(local.inventoryId);
      purged += 1;
      onProgress?.(`Skip ${local.inventoryId} — deleted on server`);
      continue;
    }

    const onServer = remoteIds.has(local.inventoryId);
    const localPhotoCount =
      local.id !== undefined
        ? await db.photos.where('deviceId').equals(local.id).count()
        : 0;

    let remotePhotoCount = 0;
    if (onServer) {
      const remoteFull = await fetchDevice(local.inventoryId).catch(() => null);
      remotePhotoCount = remoteFull?.photos.length ?? 0;
    }

    const needsDevice = !onServer;
    const needsPhotos =
      localPhotoCount > 0 &&
      (!onServer || remotePhotoCount < localPhotoCount);

    if (!needsDevice && !needsPhotos) {
      await removeLocalDevice(local.inventoryId);
      skipped += 1;
      onProgress?.(`Skip ${local.inventoryId} — already complete on server`);
      continue;
    }

    if (needsDevice) {
      onProgress?.(`Uploading ${local.inventoryId}…`);
      const form = deviceToForm(local);
      await createDeviceOnServer(form, local.inventoryId);
      uploaded += 1;
    } else if (needsPhotos) {
      onProgress?.(
        `Restoring ${localPhotoCount - remotePhotoCount} photo(s) for ${local.inventoryId}…`,
      );
    }

    if (needsPhotos && local.id !== undefined) {
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
  return { uploaded, skipped, photos, purged };
}
