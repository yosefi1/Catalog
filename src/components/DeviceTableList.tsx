import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDisplayNumber, getDevice } from '../db/devices';
import { deleteDeviceEverywhere } from '../services/cloudSync';
import { formatDate } from '../services/utils';
import {
  PHOTO_TYPE_LABELS,
  sortPhotosForDisplay,
  type Device,
  type DeviceWithPhotos,
} from '../types/device';

interface Props {
  devices: Device[];
}

function ExpandedDevice({ deviceId }: { deviceId: number }) {
  const [device, setDevice] = useState<DeviceWithPhotos | null>(null);
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    void getDevice(deviceId).then((d) => {
      if (cancelled || !d) return;
      const sorted = sortPhotosForDisplay(d.photos);
      const photoUrls = sorted.map((p) => {
        const u = URL.createObjectURL(p.blob);
        created.push(u);
        return u;
      });
      setDevice({ ...d, photos: sorted });
      setUrls(photoUrls);
    });

    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [deviceId]);

  if (!device) return <td colSpan={7} className="table-expand muted">Loading…</td>;

  return (
    <td colSpan={7} className="table-expand">
      <div className="table-expand__grid">
        <dl className="detail-grid detail-grid--compact">
          <div>
            <dt>Manufacturer</dt>
            <dd>{device.manufacturer || '—'}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{device.model || '—'}</dd>
          </div>
          <div>
            <dt>Serial</dt>
            <dd>{device.serialNumber || '—'}</dd>
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
            <dt>Modified</dt>
            <dd>{formatDate(device.updatedAt)}</dd>
          </div>
        </dl>
        {device.notes && <p className="table-expand__notes">{device.notes}</p>}
        {device.photos.length > 0 && (
          <div className="table-expand__photos">
            {device.photos.map((p, i) => (
              <figure key={p.id ?? i}>
                <img src={urls[i]} alt={PHOTO_TYPE_LABELS[p.photoType]} />
                <figcaption>{PHOTO_TYPE_LABELS[p.photoType]}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <div className="table-expand__actions">
          <Link className="btn btn--primary btn--small" to={`/devices/${device.id}`}>
            Open full page
          </Link>
          <Link className="btn btn--secondary btn--small" to={`/devices/${device.id}/edit`}>
            Edit
          </Link>
        </div>
      </div>
    </td>
  );
}

export function DeviceTableList({ devices }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function onDelete(device: Device) {
    if (device.id === undefined) return;
    setBusyId(device.id);
    try {
      await deleteDeviceEverywhere(device.id);
      setConfirmId(null);
      if (expandedId === device.id) setExpandedId(null);
    } finally {
      setBusyId(null);
    }
  }

  if (!devices.length) {
    return (
      <div className="empty-state">
        <h2>No devices match</h2>
        <p>Try another filter or add a device.</p>
      </div>
    );
  }

  return (
    <div className="device-table-wrap">
      <table className="device-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Manufacturer</th>
            <th>Model</th>
            <th>Serial</th>
            <th>Location</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => {
            const open = expandedId === d.id;
            return (
              <Fragment key={d.id}>
                <tr
                  className={`device-table__row ${open ? 'is-open' : ''}`}
                  onClick={() =>
                    d.id !== undefined &&
                    setExpandedId((cur) => (cur === d.id ? null : d.id!))
                  }
                >
                  <td className="inv-id">{formatDisplayNumber(d.inventoryId)}</td>
                  <td>{d.deviceName || 'Untitled'}</td>
                  <td>{d.manufacturer || '—'}</td>
                  <td>{d.model || '—'}</td>
                  <td>{d.serialNumber || '—'}</td>
                  <td>{d.location || '—'}</td>
                  <td className="device-table__actions" onClick={(e) => e.stopPropagation()}>
                    {confirmId === d.id ? (
                      <>
                        <button
                          type="button"
                          className="btn btn--danger btn--small"
                          disabled={busyId === d.id}
                          onClick={() => void onDelete(d)}
                        >
                          {busyId === d.id ? '…' : 'Del'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => setConfirmId(null)}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--danger btn--small"
                        onClick={() => d.id !== undefined && setConfirmId(d.id)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
                {open && d.id !== undefined && (
                  <tr className="device-table__expand-row">
                    <ExpandedDevice deviceId={d.id} />
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
