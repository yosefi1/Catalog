export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampCrop(
  crop: PixelCrop,
  imageWidth: number,
  imageHeight: number,
  minSize = 24,
): PixelCrop {
  const minW = Math.min(minSize, imageWidth);
  const minH = Math.min(minSize, imageHeight);
  let width = Math.min(imageWidth, Math.max(minW, crop.width));
  let height = Math.min(imageHeight, Math.max(minH, crop.height));
  let x = Math.min(imageWidth - width, Math.max(0, crop.x));
  let y = Math.min(imageHeight - height, Math.max(0, crop.y));
  width = Math.min(width, imageWidth - x);
  height = Math.min(height, imageHeight - y);
  return { x, y, width, height };
}

export function cropBlob(source: Blob, crop: PixelCrop): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      const boxed = clampCrop(crop, img.naturalWidth, img.naturalHeight);
      const x = Math.round(boxed.x);
      const y = Math.round(boxed.y);
      const w = Math.max(1, Math.round(boxed.width));
      const h = Math.max(1, Math.round(boxed.height));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('Crop failed'));
          else resolve(blob);
        },
        'image/jpeg',
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load photo'));
    };
    img.src = url;
  });
}

export function rotateBlob(source: Blob, degrees: 90 | -90): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = h;
      canvas.height = w;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('Rotate failed'));
          else resolve(blob);
        },
        'image/jpeg',
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load photo'));
    };
    img.src = url;
  });
}
