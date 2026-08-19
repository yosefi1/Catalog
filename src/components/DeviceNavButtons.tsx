import { Link } from 'react-router-dom';
import { useDeviceNavigation } from '../hooks/useDeviceNavigation';

interface Props {
  deviceId: number | undefined;
  edit?: boolean;
}

export function DeviceNavButtons({ deviceId, edit = false }: Props) {
  const { prevId, nextId } = useDeviceNavigation(deviceId);
  if (prevId === undefined && nextId === undefined) return null;

  return (
    <div className="device-nav-row">
      {prevId !== undefined ? (
        <Link
          className="btn btn--ghost btn--small"
          to={edit ? `/devices/${prevId}/edit` : `/devices/${prevId}`}
        >
          ‹ Prev
        </Link>
      ) : (
        <span className="device-nav-spacer" />
      )}
      {nextId !== undefined ? (
        <Link
          className="btn btn--ghost btn--small"
          to={edit ? `/devices/${nextId}/edit` : `/devices/${nextId}`}
        >
          Next ›
        </Link>
      ) : (
        <span className="device-nav-spacer" />
      )}
    </div>
  );
}
