import { db } from '../db/database';

const LOCAL_DELETED_KEY = 'localDeletedInventoryIds';

export async function removeLocalDevice(inventoryId: string): Promise<void> {
  const local = await db.devices.where('inventoryId').equals(inventoryId).first();
  if (!local?.id) return;

  await db.transaction('rw', db.devices, db.photos, db.drafts, async () => {
    await db.photos.where('deviceId').equals(local.id!).delete();
    await db.devices.delete(local.id!);
    await db.drafts.delete(inventoryId);
  });
}

async function readLocalDeletedIds(): Promise<string[]> {
  const row = await db.meta.get(LOCAL_DELETED_KEY);
  if (!row || typeof row.value !== 'string' || !row.value) return [];
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function markLocalDeletion(inventoryId: string): Promise<void> {
  const ids = new Set(await readLocalDeletedIds());
  ids.add(inventoryId);
  await db.meta.put({ key: LOCAL_DELETED_KEY, value: JSON.stringify([...ids]) });
  await removeLocalDevice(inventoryId);
}

export async function getLocalDeletedIds(): Promise<Set<string>> {
  return new Set(await readLocalDeletedIds());
}

export async function clearLocalLegacyData(): Promise<{ devices: number; photos: number }> {
  const devices = await db.devices.count();
  const photos = await db.photos.count();
  await db.transaction('rw', db.devices, db.photos, async () => {
    await db.devices.clear();
    await db.photos.clear();
  });
  return { devices, photos };
}
