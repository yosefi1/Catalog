import imageCompression from 'browser-image-compression';
import type { PhotoType } from '../types/device';

export interface CompressedImage {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
}

/** Label photos need higher fidelity so serials stay readable. */
function optionsForType(photoType: PhotoType) {
  if (
    photoType === 'model_label' ||
    photoType === 'serial_label' ||
    photoType === 'asset_tag'
  ) {
    return {
      maxSizeMB: 1.2,
      maxWidthOrHeight: 2048,
      initialQuality: 0.92,
      useWebWorker: true,
      fileType: 'image/jpeg' as const,
    };
  }
  return {
    maxSizeMB: 0.55,
    maxWidthOrHeight: 1600,
    initialQuality: 0.82,
    useWebWorker: true,
    fileType: 'image/jpeg' as const,
  };
}

function readDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read image dimensions'));
    };
    img.src = url;
  });
}

export async function compressPhoto(
  file: File | Blob,
  photoType: PhotoType,
): Promise<CompressedImage> {
  const asFile =
    file instanceof File
      ? file
      : new File([file], 'photo.jpg', { type: file.type || 'image/jpeg' });

  // Skip compression for already-small images
  if (asFile.size < 180_000) {
    const dims = await readDimensions(asFile).catch(() => ({
      width: 0,
      height: 0,
    }));
    return {
      blob: asFile,
      mimeType: asFile.type || 'image/jpeg',
      width: dims.width,
      height: dims.height,
    };
  }

  const compressed = await imageCompression(asFile, optionsForType(photoType));
  const dims = await readDimensions(compressed).catch(() => ({
    width: 0,
    height: 0,
  }));

  return {
    blob: compressed,
    mimeType: compressed.type || 'image/jpeg',
    width: dims.width,
    height: dims.height,
  };
}

export function revokePreviewUrls(urls: string[]): void {
  for (const url of urls) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}
