import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PhotoCropper } from '../components/PhotoCropper';
import { PhotoLightbox } from '../components/PhotoLightbox';
import { PhotoSizeToggle } from '../components/PhotoSizeToggle';
import type { ThumbSize } from '../components/DeviceList';
import { getMeta, setMeta } from '../db/database';
import { getDevice, updateDevicePhotoBlob, deleteDevicePhoto } from '../db/devices';
import { compressPhoto } from '../services/photoCompression';
import { syncDeviceAfterSave } from '../services/cloudSync';
import { formatDate } from '../services/utils';
import { PHOTO_TYPE_LABELS, type DeviceWithPhotos } from '../types/device';

const GALLERY_SIZE_KEY = 'devicePhotoGallerySize';

function asThumbSize(value: string | number | boolean): ThumbSize {
  if (value === 'small' || value === 'medium' || value === 'large') return value;
  return 'medium';
}

export function DeviceDetailPage() {
  const { id } = useParams();
  const deviceId = Number(id);
  const [device, setDevice] = useState<DeviceWithPhotos | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const urlsRef = useRef<string[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  const [confirmPhotoId, setConfirmPhotoId] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gallerySize, setGallerySize] = useState<ThumbSize>('medium');

  useEffect(() => {
    void getMeta(GALLERY_SIZE_KEY, 'medium').then((v) =>
      setGallerySize(asThumbSize(v)),
    );
  }, []);

  function showDevice(d: DeviceWithPhotos) {
    const photoUrls = d.photos.map((p) => URL.createObjectURL(p.blob));
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = photoUrls;
    setDevice(d);
    setUrls(photoUrls);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const d = await getDevice(deviceId);
      if (cancelled) return;
      if (!d) {
        setError('Device not found');
        return;
      }
      showDevice(d);
    }

    void load();
    return () => {
      cancelled = true;
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
  }, [deviceId]);

  async function applyDetailCrop(cropped: Blob) {
    if (cropIndex === null || !device) return;
    const wantedId = device.photos[cropIndex]?.id;
    const photoType = device.photos[cropIndex]?.photoType ?? 'additional';
    setCropBusy(true);
    try {
      const compressed = await compressPhoto(cropped, photoType);
      await updateDevicePhotoBlob(
        wantedId ?? Number.NaN,
        {
          blob: compressed.blob,
          mimeType: compressed.mimeType,
          width: compressed.width,
          height: compressed.height,
        },
        { deviceId, index: cropIndex },
      );
      const fresh = await getDevice(deviceId);
      if (fresh) showDevice(fresh);
      setCropIndex(null);
      void syncDeviceAfterSave(deviceId);
    } catch (e) {
      throw e instanceof Error ? e : new Error('Failed to crop photo');
    } finally {
      setCropBusy(false);
    }
  }

  async function onDeletePhoto(photoId: number) {
    setCropBusy(true);
    try {
      await deleteDevicePhoto(photoId);
      setConfirmPhotoId(null);
      setPhotoError(null);
      setLightbox(null);
      const fresh = await getDevice(deviceId);
      if (fresh) showDevice(fresh);
      void syncDeviceAfterSave(deviceId);
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
  const croppingUrl = cropIndex !== null ? urls[cropIndex] : undefined;

  return (
    <div className="page device-detail-page">
      <div className="page-heading">
        <div>
          <p className="inv-id">{device.inventoryId}</p>
          <h1>{device.deviceName || 'Untitled'}</h1>
        </div>
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
                <img src={urls[i]} alt={PHOTO_TYPE_LABELS[p.photoType]} />
                <span className={`photo-badge photo-badge--${p.photoType}`}>
                  {PHOTO_TYPE_LABELS[p.photoType]}
                </span>
              </button>
              <div className="photo-tile__bar photo-tile__bar--split">
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  disabled={cropBusy}
                  onClick={() => setCropIndex(i)}
                >
                  Crop
                </button>
                {confirmPhotoId === p.id ? (
                  <>
                    <button
                      type="button"
                      className="btn btn--danger btn--small"
                      disabled={cropBusy || p.id === undefined}
                      onClick={() => p.id !== undefined && void onDeletePhoto(p.id)}
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
                    disabled={cropBusy || p.id === undefined}
                    onClick={() => p.id !== undefined && setConfirmPhotoId(p.id)}
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

      <div className="sticky-actions" role="toolbar" aria-label="Device actions">
        <Link className="btn btn--ghost btn--large" to="/">
          Back
        </Link>
        <Link
          className="btn btn--secondary btn--large"
          to={`/devices/new?duplicate=${device.id}`}
        >
          Duplicate
        </Link>
        <Link
          className="btn btn--primary btn--large"
          to={`/devices/${device.id}/edit`}
        >
          Edit
        </Link>
      </div>

      {lightbox !== null && (
        <PhotoLightbox
          images={device.photos.map((p, i) => ({
            src: urls[i],
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
          source={croppingPhoto.blob}
          onCancel={() => setCropIndex(null)}
          onApply={(blob) => applyDetailCrop(blob)}
        />
      )}
    </div>
  );
}
