import { Link } from 'react-router-dom';
import { useDeviceNavigation } from '../hooks/useDeviceNavigation';
import { deviceLinkState } from '../services/deviceRouteState';

interface Props {
  routeId: string | undefined;
  edit?: boolean;
  compact?: boolean;
}

export function DeviceNavButtons({ routeId, edit = false, compact = false }: Props) {
  const { prev, next } = useDeviceNavigation(routeId);
  if (!prev && !next) return null;

  const cls = compact ? 'device-nav-row device-nav-row--compact' : 'device-nav-row';

  return (
    <div className={cls}>
      {prev ? (
        <Link
          className="btn btn--ghost btn--small"
          to={edit ? `/devices/${prev.routeId}/edit` : `/devices/${prev.routeId}`}
          state={deviceLinkState(prev.inventoryId)}
        >
          ‹ Prev
        </Link>
      ) : (
        <span className="device-nav-spacer" />
      )}
      {next ? (
        <Link
          className="btn btn--ghost btn--small"
          to={edit ? `/devices/${next.routeId}/edit` : `/devices/${next.routeId}`}
          state={deviceLinkState(next.inventoryId)}
        >
          Next ›
        </Link>
      ) : (
        <span className="device-nav-spacer" />
      )}
    </div>
  );
}
