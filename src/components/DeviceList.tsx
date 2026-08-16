import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Device } from '../types/device';
import { getMainPhotoId } from '../hooks/usePhotoUrl';
import { usePhotoUrl } from '../hooks/usePhotoUrl';

function DeviceThumb({ deviceId }: { deviceId: number }) {
  const [photoId, setPhotoId] = useState<number | undefined>();
  useEffect(() => {
    void getMainPhotoId(deviceId).then(setPhotoId);
  }, [deviceId]);
  const url = usePhotoUrl(photoId);
  if (!url) return <div className="device-row__thumb placeholder">No photo</div>;
  return <img className="device-row__thumb" src={url} alt="" loading="lazy" />;
}

interface Props {
  devices: Device[];
}

export function DeviceList({ devices }: Props) {
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
        <li key={d.id}>
          <Link className="device-row" to={`/devices/${d.id}`}>
            {d.id !== undefined ? (
              <DeviceThumb deviceId={d.id} />
            ) : (
              <div className="device-row__thumb placeholder">No photo</div>
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
        </li>
      ))}
    </ul>
  );
}
