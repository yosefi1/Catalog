import { useCallback, useEffect, useState } from 'react';
import { queryDevices, getDistinctFieldValues } from '../db/devices';
import { onCatalogChanged } from '../services/catalogEvents';
import type { InventoryFilters } from '../types/device';
import type { DeviceListRow } from '../services/catalogApi';

export const defaultFilters: InventoryFilters = {
  search: '',
  location: '',
  manufacturer: '',
  deviceType: '',
  room: '',
  sortBy: 'inventoryId',
  sortDir: 'asc',
};

export const INVENTORY_FILTERS_KEY = 'inventoryFilters';
export const INVENTORY_VIEW_KEY = 'inventoryViewMode';

export function parseStoredFilters(raw: string | number | boolean): InventoryFilters {
  if (typeof raw !== 'string' || !raw) return defaultFilters;
  try {
    const parsed = JSON.parse(raw) as Partial<InventoryFilters>;
    return { ...defaultFilters, ...parsed };
  } catch {
    return defaultFilters;
  }
}

export function useDevices(filters: InventoryFilters): DeviceListRow[] | undefined {
  const [devices, setDevices] = useState<DeviceListRow[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDevices(await queryDevices(filters));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load devices');
      setDevices([]);
    }
  }, [
    filters.search,
    filters.location,
    filters.manufacturer,
    filters.deviceType,
    filters.room,
    filters.sortBy,
    filters.sortDir,
  ]);

  useEffect(() => {
    void refresh();
    return onCatalogChanged(() => {
      void refresh();
    });
  }, [refresh]);

  if (error) console.error(error);
  return devices;
}

export function useFilterOptions() {
  const [locations, setLocations] = useState<string[]>([]);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<string[]>([]);
  const [rooms, setRooms] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [l, m, t, r] = await Promise.all([
        getDistinctFieldValues('location'),
        getDistinctFieldValues('manufacturer'),
        getDistinctFieldValues('deviceType'),
        getDistinctFieldValues('room'),
      ]);
      setLocations(l);
      setManufacturers(m);
      setDeviceTypes(t);
      setRooms(r);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onCatalogChanged(() => {
      void refresh();
    });
  }, [refresh]);

  return { locations, manufacturers, deviceTypes, rooms, refresh };
}
