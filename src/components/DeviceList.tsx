import { useState } from 'react';
import { Link } from 'react-router-dom';
import { deviceRouteId, deleteDevice, formatDisplayNumber } from '../db/devices';
import type { DeviceListRow } from '../services/catalogApi';

export type ThumbSize = 'small' | 'medium' | 'large';

interface Props {
  devices: DeviceListRow[];
  thumbSize?: ThumbSize;
}

export function DeviceList({ devices, thumbSize = 'medium' }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onDelete(device: DeviceListRow) {
    setBusyId(device.inventoryId);
    try {
      await deleteDevice(device.inventoryId);
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
        <li key={d.inventoryId} className={`device-item device-item--${thumbSize}`}>
          <Link className="device-row" to={`/devices/${deviceRouteId(d.inventoryId)}`}>
            {d.thumbnailUrl ? (
              <img
                className={`device-row__thumb size-${thumbSize}`}
                src={d.thumbnailUrl}
                alt=""
                loading="lazy"
              />
            ) : (
              <div className={`device-row__thumb placeholder size-${thumbSize}`}>
                No photo
              </div>
            )}
            <div className="device-row__body">
              <div className="device-row__title">
                <span className="inv-id">#{formatDisplayNumber(d.inventoryId)}</span>
                <strong>{d.deviceName || 'Untitled'}</strong>
              </div>
              <p className="device-row__meta">
                {[d.manufacturer, d.model].filter(Boolean).join(' · ') || '—'}
              </p>
              <p className="device-row__meta">
                {d.location}
                {d.room ? ` · ${d.room}` : ''}
              </p>
            </div>
          </Link>
          <div className="device-item__actions">
            {confirmId === d.inventoryId ? (
              <>
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  disabled={busyId === d.inventoryId}
                  onClick={() => void onDelete(d)}
                >
                  {busyId === d.inventoryId ? '…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => setConfirmId(null)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--danger btn--small"
                onClick={() => setConfirmId(d.inventoryId)}
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
