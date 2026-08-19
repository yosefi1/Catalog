import { useEffect, useState } from 'react';
import type { PhotoType } from '../types/device';

export function usePhotoUrl(
  url: string | undefined,
  blob?: Blob,
): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(() => {
    if (url) return url;
    return undefined;
  });

  useEffect(() => {
    let created: string | undefined;
    if (blob) {
      created = URL.createObjectURL(blob);
      setResolved(created);
      return () => {
        if (created) URL.revokeObjectURL(created);
      };
    }
    setResolved(url);
    return undefined;
  }, [url, blob]);

  return resolved;
}

export function photoTypeBadgeClass(type: PhotoType): string {
  return `photo-badge photo-badge--${type}`;
}
