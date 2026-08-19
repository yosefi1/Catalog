import { useEffect, useState } from 'react';
import { getMeta } from '../db/database';
import { deviceRouteId, queryDevices, resolveInventoryIdFromRoute } from '../db/devices';
import type { DeviceListRow } from '../services/catalogApi';
import { INVENTORY_FILTERS_KEY, parseStoredFilters } from './useDevices';

export type DeviceNavTarget = {
  routeId: string;
  inventoryId: string;
};

export function useDeviceNavigation(currentRouteId: string | undefined) {
  const [prev, setPrev] = useState<DeviceNavTarget | undefined>();
  const [next, setNext] = useState<DeviceNavTarget | undefined>();

  useEffect(() => {
    if (!currentRouteId) {
      setPrev(undefined);
      setNext(undefined);
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
          setPrev(undefined);
          setNext(undefined);
        }
        return;
      }

      const stored = await getMeta(INVENTORY_FILTERS_KEY, '');
      const filters = parseStoredFilters(stored);
      const devices = await queryDevices(filters);
      if (cancelled) return;

      const idx = devices.findIndex((d) => String(d.displayNumber) === routeId);
      if (idx < 0) {
        setPrev(undefined);
        setNext(undefined);
        return;
      }
      setPrev(idx > 0 ? navTarget(devices[idx - 1]) : undefined);
      setNext(idx < devices.length - 1 ? navTarget(devices[idx + 1]) : undefined);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentRouteId]);

  return { prev, next };
}

function navTarget(device: DeviceListRow): DeviceNavTarget {
  return { routeId: deviceRouteId(device), inventoryId: device.inventoryId };
}
