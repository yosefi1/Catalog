import { getDeviceCount } from '../db/devices';
import { fetchDevices } from './catalogApi';
import { hasAccessKey } from './accessKey';

export interface StorageStats {
  deviceCount: number;
  photoCount: number | string;
  approxLabel: string;
  source: 'server' | 'offline';
}

export async function getStorageStats(): Promise<StorageStats> {
  if (!hasAccessKey()) {
    return {
      deviceCount: 0,
      photoCount: '—',
      approxLabel: 'Set access key',
      source: 'offline',
    };
  }

  try {
    const devices = await fetchDevices();
    return {
      deviceCount: devices.length,
      photoCount: 'On server',
      approxLabel: 'Cloud storage',
      source: 'server',
    };
  } catch {
    const count = await getDeviceCount().catch(() => 0);
    return {
      deviceCount: count,
      photoCount: '—',
      approxLabel: 'Server unreachable',
      source: 'offline',
    };
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
