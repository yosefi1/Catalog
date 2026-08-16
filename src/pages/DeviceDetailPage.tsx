import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PhotoLightbox } from '../components/PhotoLightbox';
import { getDevice } from '../db/devices';
import { formatDate } from '../services/utils';
import { PHOTO_TYPE_LABELS, type DeviceWithPhotos } from '../types/device';

export function DeviceDetailPage() {
  const { id } = useParams();
  const deviceId = Number(id);
  const [device, setDevice] = useState<DeviceWithPhotos | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    async function load() {
      const d = await getDevice(deviceId);
      if (cancelled) return;
      if (!d) {
        setError('Device not found');
        return;
      }
      const photoUrls = d.photos.map((p) => {
        const url = URL.createObjectURL(p.blob);
        created.push(url);
        return url;
      });
      setDevice(d);
      setUrls(photoUrls);
    }

    void load();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [deviceId]);

  if (error) {
    return (
      <div className="page">
        <p className="error-text">{error}</p>
        <Link to="/">Back</Link>
      </div>
    );
  }

  if (!device) return <p className="page muted">Loading…</p>;

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
        <h2>Photos</h2>
        <div className="photo-grid">
          {device.photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="photo-tile__preview"
              onClick={() => setLightbox(i)}
            >
              <img src={urls[i]} alt={PHOTO_TYPE_LABELS[p.photoType]} />
              <span className={`photo-badge photo-badge--${p.photoType}`}>
                {PHOTO_TYPE_LABELS[p.photoType]}
              </span>
            </button>
          ))}
          {!device.photos.length && <p className="muted">No photos</p>}
        </div>
      </section>

      <div className="sticky-actions">
        <Link
          className="btn btn--primary btn--large"
          to={`/devices/${device.id}/edit`}
        >
          Edit
        </Link>
        <Link
          className="btn btn--secondary btn--large"
          to={`/devices/new?duplicate=${device.id}`}
        >
          Duplicate Device
        </Link>
        <Link className="btn btn--ghost btn--large" to="/">
          Back
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
        />
      )}
    </div>
  );
}
