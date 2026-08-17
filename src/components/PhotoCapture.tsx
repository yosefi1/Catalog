import { useEffect, useRef, useState } from 'react';
import {
  PHOTO_TYPE_LABELS,
  PHOTO_TYPES,
  SINGLE_PHOTO_TYPES,
  type DraftPhoto,
  type PhotoType,
} from '../types/device';
import { compressPhoto } from '../services/photoCompression';
import { uid } from '../services/utils';
import { getMeta, setMeta } from '../db/database';
import { PhotoLightbox } from './PhotoLightbox';
import { PhotoSizeToggle } from './PhotoSizeToggle';
import type { ThumbSize } from './DeviceList';

const GALLERY_SIZE_KEY = 'devicePhotoGallerySize';

interface Props {
  photos: DraftPhoto[];
  onChange: (photos: DraftPhoto[]) => void;
}

export function PhotoCapture({ photos, onChange }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeType, setActiveType] = useState<PhotoType>('main');
  const [busy, setBusy] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gallerySize, setGallerySize] = useState<ThumbSize>('medium');

  useEffect(() => {
    void getMeta(GALLERY_SIZE_KEY, 'medium').then((v) => {
      if (v === 'small' || v === 'medium' || v === 'large') setGallerySize(v);
    });
  }, []);

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    setError(null);
    try {
      let next = [...photos];
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith('image/')) continue;
        const compressed = await compressPhoto(file, activeType);

        if (SINGLE_PHOTO_TYPES.includes(activeType)) {
          const existing = next.find((p) => p.photoType === activeType);
          if (existing) {
            URL.revokeObjectURL(existing.previewUrl);
            next = next.filter((p) => p.localId !== existing.localId);
          }
        }

        const draft: DraftPhoto = {
          localId: uid(),
          photoType: activeType,
          blob: compressed.blob,
          mimeType: compressed.mimeType,
          previewUrl: URL.createObjectURL(compressed.blob),
          createdAt: Date.now(),
        };
        next.push(draft);

        if (activeType !== 'additional') {
          // Advance to next useful slot after capturing a single-slot photo
          const order: PhotoType[] = [
            'main',
            'model_label',
            'serial_label',
            'asset_tag',
            'additional',
          ];
          const idx = order.indexOf(activeType);
          if (idx >= 0 && idx < order.length - 1) {
            setActiveType(order[idx + 1]);
          }
        }
      }
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process photo');
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removePhoto(localId: string) {
    const target = photos.find((p) => p.localId === localId);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(photos.filter((p) => p.localId !== localId));
  }

  async function replacePhoto(localId: string, file: File) {
    const target = photos.find((p) => p.localId === localId);
    if (!target) return;
    setBusy(true);
    try {
      const compressed = await compressPhoto(file, target.photoType);
      URL.revokeObjectURL(target.previewUrl);
      onChange(
        photos.map((p) =>
          p.localId === localId
            ? {
                ...p,
                blob: compressed.blob,
                mimeType: compressed.mimeType,
                previewUrl: URL.createObjectURL(compressed.blob),
                createdAt: Date.now(),
                existingPhotoId: undefined,
              }
            : p,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="photo-capture">
      <div className="photo-capture__types">
        {PHOTO_TYPES.map((type) => {
          const count = photos.filter((p) => p.photoType === type).length;
          return (
            <button
              key={type}
              type="button"
              className={`photo-type-chip ${activeType === type ? 'is-active' : ''} ${count ? 'has-photo' : ''}`}
              onClick={() => setActiveType(type)}
            >
              <span>{PHOTO_TYPE_LABELS[type]}</span>
              {count > 0 && <em>{count}</em>}
            </button>
          );
        })}
      </div>

      <div className="photo-capture__actions">
        <button
          type="button"
          className="btn btn--primary btn--large"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
        >
          Take Photo
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--large"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Choose Photo
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        onChange={(e) => void addFiles(e.target.files)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="visually-hidden"
        onChange={(e) => void addFiles(e.target.files)}
      />

      {busy && <p className="muted">Processing photo…</p>}
      {error && <p className="error-text">{error}</p>}

      {photos.length > 0 && (
        <PhotoSizeToggle
          value={gallerySize}
          onChange={(size) => {
            setGallerySize(size);
            void setMeta(GALLERY_SIZE_KEY, size);
          }}
        />
      )}

      <div className={`photo-grid photo-grid--${gallerySize}`}>
        {photos.map((photo, index) => (
          <div key={photo.localId} className="photo-tile">
            <button
              type="button"
              className="photo-tile__preview"
              onClick={() => setLightboxIndex(index)}
            >
              <img src={photo.previewUrl} alt={PHOTO_TYPE_LABELS[photo.photoType]} />
              <span className={`photo-badge photo-badge--${photo.photoType}`}>
                {PHOTO_TYPE_LABELS[photo.photoType]}
              </span>
            </button>
            <div className="photo-tile__bar">
              <label className="btn btn--ghost btn--small">
                Replace
                <input
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void replacePhoto(photo.localId, f);
                  }}
                />
              </label>
              <button
                type="button"
                className="btn btn--danger btn--small"
                onClick={() => removePhoto(photo.localId)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          images={photos.map((p) => ({
            src: p.previewUrl,
            label: PHOTO_TYPE_LABELS[p.photoType],
          }))}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </section>
  );
}
