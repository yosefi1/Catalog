import { useCallback, useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../db/database';
import { queryDevices, getDistinctFieldValues } from '../db/devices';
import type { Device, InventoryFilters } from '../types/device';

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

export function useDevices(filters: InventoryFilters): Device[] | undefined {
  const [devices, setDevices] = useState<Device[] | undefined>(undefined);

  useEffect(() => {
    const observable = liveQuery(() => queryDevices(filters));
    const sub = observable.subscribe({
      next: (value) => setDevices(value),
      error: (err) => console.error(err),
    });
    return () => sub.unsubscribe();
  }, [
    filters.search,
    filters.location,
    filters.manufacturer,
    filters.deviceType,
    filters.room,
    filters.sortBy,
    filters.sortDir,
  ]);

  return devices;
}

export function useFilterOptions() {
  const [locations, setLocations] = useState<string[]>([]);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<string[]>([]);
  const [rooms, setRooms] = useState<string[]>([]);

  const refresh = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    const observable = liveQuery(() => db.devices.count());
    const sub = observable.subscribe({
      next: () => {
        void refresh();
      },
    });
    return () => sub.unsubscribe();
  }, [refresh]);

  return { locations, manufacturers, deviceTypes, rooms, refresh };
}
