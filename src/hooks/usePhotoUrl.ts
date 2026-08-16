import { useEffect, useState } from 'react';
import { db } from '../db/database';
import type { PhotoType } from '../types/device';

const urlCache = new Map<number, string>();

export function usePhotoUrl(
  photoId: number | undefined,
  blob?: Blob,
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (photoId !== undefined && urlCache.has(photoId)) {
      return urlCache.get(photoId);
    }
    return undefined;
  });

  useEffect(() => {
    let revoked = false;
    let created: string | undefined;

    async function load() {
      if (blob) {
        created = URL.createObjectURL(blob);
        if (!revoked) setUrl(created);
        return;
      }
      if (photoId === undefined) {
        setUrl(undefined);
        return;
      }
      if (urlCache.has(photoId)) {
        setUrl(urlCache.get(photoId));
        return;
      }
      const photo = await db.photos.get(photoId);
      if (!photo || revoked) return;
      created = URL.createObjectURL(photo.blob);
      urlCache.set(photoId, created);
      setUrl(created);
    }

    void load();
    return () => {
      revoked = true;
      // Keep cache for list scrolling; only revoke ephemeral blob URLs
      if (blob && created) URL.revokeObjectURL(created);
    };
  }, [photoId, blob]);

  return url;
}

export async function getMainPhotoId(
  deviceId: number,
): Promise<number | undefined> {
  const photos = await db.photos.where('deviceId').equals(deviceId).toArray();
  const main = photos.find((p) => p.photoType === 'main');
  return (main ?? photos[0])?.id;
}

export function photoTypeBadgeClass(type: PhotoType): string {
  return `photo-badge photo-badge--${type}`;
}
