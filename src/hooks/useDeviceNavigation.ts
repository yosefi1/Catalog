import { useEffect, useState } from 'react';
import { getMeta } from '../db/database';
import { deviceRouteId, queryDevices, resolveInventoryIdFromRoute } from '../db/devices';
import { INVENTORY_FILTERS_KEY, parseStoredFilters } from './useDevices';

export function useDeviceNavigation(currentRouteId: string | undefined) {
  const [prevId, setPrevId] = useState<string | undefined>();
  const [nextId, setNextId] = useState<string | undefined>();

  useEffect(() => {
    if (!currentRouteId) {
      setPrevId(undefined);
      setNextId(undefined);
      return;
    }

    let cancelled = false;

    async function load() {
      const routeId = currentRouteId;
      if (!routeId) return;

      try {
        await resolveInventoryIdFromRoute(routeId);
      } catch {
        if (!cancelled) {
          setPrevId(undefined);
          setNextId(undefined);
        }
        return;
      }

      const stored = await getMeta(INVENTORY_FILTERS_KEY, '');
      const filters = parseStoredFilters(stored);
      const devices = await queryDevices(filters);
      if (cancelled) return;

      const idx = devices.findIndex((d) => String(d.displayNumber) === routeId);
      if (idx < 0) {
        setPrevId(undefined);
        setNextId(undefined);
        return;
      }
      setPrevId(idx > 0 ? deviceRouteId(devices[idx - 1]) : undefined);
      setNextId(idx < devices.length - 1 ? deviceRouteId(devices[idx + 1]) : undefined);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentRouteId]);

  return { prevId, nextId };
}
