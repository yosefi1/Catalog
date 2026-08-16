import { db } from '../db/database';
import { getAllDevices, getPhotoCount, getDeviceCount } from '../db/devices';

export interface StorageStats {
  deviceCount: number;
  photoCount: number;
  approxBytes: number;
  approxLabel: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function getStorageStats(): Promise<StorageStats> {
  const [deviceCount, photoCount] = await Promise.all([
    getDeviceCount(),
    getPhotoCount(),
  ]);

  let approxBytes = 0;
  const photos = await db.photos.toArray();
  for (const p of photos) {
    approxBytes += p.blob.size;
  }

  // Rough JSON overhead for device records
  const devices = await getAllDevices();
  approxBytes += new Blob([JSON.stringify(devices)]).size;

  // Prefer browser estimate when available
  if (navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number' && est.usage > approxBytes) {
        approxBytes = est.usage;
      }
    } catch {
      /* ignore */
    }
  }

  return {
    deviceCount,
    photoCount,
    approxBytes,
    approxLabel: formatBytes(approxBytes),
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
