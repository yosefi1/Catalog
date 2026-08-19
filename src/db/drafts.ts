import { db } from './database';
import type { DeviceDraft } from '../types/device';

const NEW_DRAFT_ID = 'new';

export function draftIdForDevice(inventoryId?: string): string {
  return inventoryId ?? NEW_DRAFT_ID;
}

export async function saveDraft(draft: DeviceDraft): Promise<void> {
  await db.drafts.put({
    ...draft,
    updatedAt: Date.now(),
  });
}

export async function getDraft(id: string): Promise<DeviceDraft | undefined> {
  return db.drafts.get(id);
}

export async function deleteDraft(id: string): Promise<void> {
  await db.drafts.delete(id);
}

export async function getNewDeviceDraft(): Promise<DeviceDraft | undefined> {
  return getDraft(NEW_DRAFT_ID);
}

export { NEW_DRAFT_ID };
