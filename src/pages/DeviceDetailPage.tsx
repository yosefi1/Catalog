import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PhotoCropper } from '../components/PhotoCropper';
import { DeviceNavButtons } from '../components/DeviceNavButtons';
import { PhotoLightbox } from '../components/PhotoLightbox';
import { PhotoSizeToggle } from '../components/PhotoSizeToggle';
import type { ThumbSize } from '../components/DeviceList';
import { getMeta, setMeta } from '../db/database';
import {
  deviceRouteId,
  formatDisplayNumber,
  getDeviceByRoute,
  resolveInventoryId,
  updateDevicePhotoBlob,
  deleteDevicePhoto,
} from '../db/devices';
import { compressPhoto } from '../services/photoCompression';
import { rotateBlob } from '../services/cropImage';
import { useMediaDesktop } from '../hooks/useMediaDesktop';
import { formatDate } from '../services/utils';
import { PHOTO_TYPE_LABELS, sortPhotosForDisplay, type DeviceWithPhotos } from '../types/device';

const GALLERY_SIZE_KEY = 'devicePhotoGallerySize';

function asThumbSize(value: string | number | boolean): ThumbSize {
  if (value === 'small' || value === 'medium' || value === 'large') return value;
  return 'medium';
}

async function blobFromUrl(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load photo');
  return res.blob();
}

export function DeviceDetailPage() {
  const { id: routeId } = useParams();
  const [device, setDevice] = useState<DeviceWithPhotos | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  const [confirmPhotoId, setConfirmPhotoId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gallerySize, setGallerySize] = useState<ThumbSize>('medium');
  const isDesktop = useMediaDesktop();

  useEffect(() => {
    void getMeta(GALLERY_SIZE_KEY, 'medium').then((v) =>
      setGallerySize(asThumbSize(v)),
    );
  }, []);

  async function reload() {
    if (!routeId) return;
    const d = await getDeviceByRoute(routeId);
    if (!d) {
      setError('Device not found');
      return;
    }
    setDevice({ ...d, photos: sortPhotosForDisplay(d.photos) });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!routeId) throw new Error('Device not found');
        resolveInventoryId(routeId);
        const d = await getDeviceByRoute(routeId);
        if (cancelled) return;
        if (!d) {
          setError('Device not found');
          return;
        }
        setDevice({ ...d, photos: sortPhotosForDisplay(d.photos) });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  async function applyDetailCrop(cropped: Blob) {
    if (cropIndex === null || !device || !routeId) return;
    const photo = device.photos[cropIndex];
    if (!photo?.id) return;
    setCropBusy(true);
    try {
      const compressed = await compressPhoto(cropped, photo.photoType);
      await updateDevicePhotoBlob(device.inventoryId, photo.id, photo.photoType, {
        blob: compressed.blob,
        mimeType: compressed.mimeType,
      });
      await reload();
      setCropIndex(null);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Failed to crop photo');
    } finally {
      setCropBusy(false);
    }
  }

  async function applyDetailRotate(index: number, degrees: 90 | -90) {
    if (!device) return;
    const photo = device.photos[index];
    if (!photo?.id || !photo.url) return;
    setCropBusy(true);
    try {
      const source = await blobFromUrl(photo.url);
      const rotated = await rotateBlob(source, degrees);
      const compressed = await compressPhoto(rotated, photo.photoType);
      await updateDevicePhotoBlob(device.inventoryId, photo.id, photo.photoType, {
        blob: compressed.blob,
        mimeType: compressed.mimeType,
      });
      await reload();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Failed to rotate photo');
    } finally {
      setCropBusy(false);
    }
  }

  async function onDeletePhoto(photoId: string) {
    setCropBusy(true);
    try {
      await deleteDevicePhoto(photoId);
      setConfirmPhotoId(null);
      setPhotoError(null);
      setLightbox(null);
      await reload();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Failed to delete photo');
    } finally {
      setCropBusy(false);
    }
  }

  if (error) {
    return (
      <div className="page">
        <p className="error-text">{error}</p>
        <Link to="/">Back</Link>
      </div>
    );
  }

  if (!device) return <p className="page muted">Loading…</p>;

  const croppingPhoto = cropIndex !== null ? device.photos[cropIndex] : undefined;
  const croppingUrl = croppingPhoto?.url;

  return (
    <div className="page device-detail-page">
      <div className="page-heading">
        <div>
          <p className="inv-id">{formatDisplayNumber(device.inventoryId)}</p>
          <h1>{device.deviceName || 'Untitled'}</h1>
        </div>
        <DeviceNavButtons routeId={routeId} compact />
      </div>

      <div className="detail-serial">
        <span>Serial</span>
        <strong>{device.serialNumber || '—'}</strong>
      </div>

      <dl className="detail-grid">
        <div>
          <dt>Manufacturer</dt>
          <dd>{device.manufacturer || '—'}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{device.model || '—'}</dd>
        </div>
        <div>
          <dt>Asset Tag</dt>
          <dd>{device.assetTag || '—'}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{device.deviceType || '—'}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{device.location || '—'}</dd>
        </div>
        <div>
          <dt>Room</dt>
          <dd>{device.room || '—'}</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>{device.area || '—'}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{device.owner || '—'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDate(device.createdAt)}</dd>
        </div>
        <div>
          <dt>Modified</dt>
          <dd>{formatDate(device.updatedAt)}</dd>
        </div>
      </dl>

      {device.notes && (
        <section className="notes-block">
          <h2>Notes</h2>
          <p>{device.notes}</p>
        </section>
      )}

      <section>
        <div className="section-title section-title--row">
          <h2>Photos</h2>
          <PhotoSizeToggle
            value={gallerySize}
            onChange={(size) => {
              setGallerySize(size);
              void setMeta(GALLERY_SIZE_KEY, size);
            }}
          />
        </div>
        {photoError && <p className="error-text">{photoError}</p>}
        <div className={`photo-grid photo-grid--${gallerySize}`}>
          {device.photos.map((p, i) => (
            <div key={p.id} className="photo-tile">
              <button
                type="button"
                className="photo-tile__preview"
                onClick={() => setLightbox(i)}
              >
                <img src={p.url} alt={PHOTO_TYPE_LABELS[p.photoType]} />
                <span className={`photo-badge photo-badge--${p.photoType}`}>
                  {PHOTO_TYPE_LABELS[p.photoType]}
                </span>
              </button>
              <div className={`photo-tile__bar photo-tile__bar--split ${isDesktop ? 'photo-tile__bar--desktop' : ''}`}>
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  disabled={cropBusy}
                  onClick={() => setCropIndex(i)}
                >
                  Crop
                </button>
                {isDesktop && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    title="Rotate clockwise"
                    disabled={cropBusy}
                    onClick={() => void applyDetailRotate(i, 90)}
                  >
                    ↻
                  </button>
                )}
                {confirmPhotoId === p.id ? (
                  <>
                    <button
                      type="button"
                      className="btn btn--danger btn--small"
                      disabled={cropBusy}
                      onClick={() => void onDeletePhoto(p.id)}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      disabled={cropBusy}
                      onClick={() => setConfirmPhotoId(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn--danger btn--small"
                    disabled={cropBusy}
                    onClick={() => setConfirmPhotoId(p.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
          {!device.photos.length && <p className="muted">No photos</p>}
        </div>
      </section>

      <DeviceNavButtons routeId={routeId} />

      <div className="sticky-actions" role="toolbar" aria-label="Device actions">
        <Link className="btn btn--ghost btn--large" to="/">
          Back
        </Link>
        <Link
          className="btn btn--secondary btn--large"
          to={`/devices/new?duplicate=${deviceRouteId(device.inventoryId)}`}
        >
          Duplicate
        </Link>
        <Link
          className="btn btn--primary btn--large"
          to={`/devices/${deviceRouteId(device.inventoryId)}/edit`}
        >
          Edit
        </Link>
      </div>

      {lightbox !== null && (
        <PhotoLightbox
          images={device.photos.map((p) => ({
            src: p.url,
            label: PHOTO_TYPE_LABELS[p.photoType],
          }))}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onIndexChange={setLightbox}
          onCrop={(i) => {
            setLightbox(null);
            setCropIndex(i);
          }}
        />
      )}

      {croppingPhoto && croppingUrl && (
        <PhotoCropper
          src={croppingUrl}
          onCancel={() => setCropIndex(null)}
          onApply={(blob) => applyDetailCrop(blob)}
        />
      )}
    </div>
  );
}
