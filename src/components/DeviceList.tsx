import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Device } from '../types/device';
import { getMainPhotoId, usePhotoUrl } from '../hooks/usePhotoUrl';
import { deleteDeviceEverywhere } from '../services/cloudSync';

export type ThumbSize = 'small' | 'medium' | 'large';

function DeviceThumb({
  deviceId,
  size,
}: {
  deviceId: number;
  size: ThumbSize;
}) {
  const [photoId, setPhotoId] = useState<number | undefined>();
  useEffect(() => {
    void getMainPhotoId(deviceId).then(setPhotoId);
  }, [deviceId]);
  const url = usePhotoUrl(photoId);
  if (!url) {
    return <div className={`device-row__thumb placeholder size-${size}`}>No photo</div>;
  }
  return (
    <img
      className={`device-row__thumb size-${size}`}
      src={url}
      alt=""
      loading="lazy"
    />
  );
}

interface Props {
  devices: Device[];
  thumbSize?: ThumbSize;
}

export function DeviceList({ devices, thumbSize = 'medium' }: Props) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function onDelete(device: Device) {
    if (device.id === undefined) return;
    setBusyId(device.id);
    try {
      await deleteDeviceEverywhere(device.id);
      setConfirmId(null);
    } finally {
      setBusyId(null);
    }
  }

  if (!devices.length) {
    return (
      <div className="empty-state">
        <h2>No devices yet</h2>
        <p>Start walking the lab and add your first device.</p>
        <Link className="btn btn--primary btn--large" to="/devices/new">
          Add Device
        </Link>
      </div>
    );
  }

  return (
    <ul className="device-list">
      {devices.map((d) => (
        <li key={d.id} className={`device-item device-item--${thumbSize}`}>
          <Link className="device-row" to={`/devices/${d.id}`}>
            {d.id !== undefined ? (
              <DeviceThumb deviceId={d.id} size={thumbSize} />
            ) : (
              <div className={`device-row__thumb placeholder size-${thumbSize}`}>
                No photo
              </div>
            )}
            <div className="device-row__body">
              <div className="device-row__title">
                <span className="inv-id">{d.inventoryId}</span>
                <span className="device-name">{d.deviceName || 'Untitled'}</span>
              </div>
              <div className="device-row__meta">
                {[d.manufacturer, d.model].filter(Boolean).join(' · ') || '—'}
              </div>
              <div className="device-row__serial">
                {d.serialNumber ? `S/N ${d.serialNumber}` : 'No serial'}
              </div>
              <div className="device-row__loc">{d.location || 'No location'}</div>
            </div>
          </Link>
          <div className="device-item__actions">
            {confirmId === d.id ? (
              <>
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  disabled={busyId === d.id}
                  onClick={() => void onDelete(d)}
                >
                  {busyId === d.id ? 'Deleting…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  disabled={busyId === d.id}
                  onClick={() => setConfirmId(null)}
                >
                  Cancel
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
          </div>
        </li>
      ))}
    </ul>
  );
}
