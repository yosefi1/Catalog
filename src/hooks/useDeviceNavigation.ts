import { useEffect, useState } from 'react';
import { getMeta } from '../db/database';
import { queryDevices } from '../db/devices';
import { INVENTORY_FILTERS_KEY, parseStoredFilters } from './useDevices';

const FILTERS_KEY = INVENTORY_FILTERS_KEY;

function parseStoredFiltersLocal(raw: string | number | boolean) {
  return parseStoredFilters(raw);
}

export function useDeviceNavigation(currentId: number | undefined) {
  const [prevId, setPrevId] = useState<number | undefined>();
  const [nextId, setNextId] = useState<number | undefined>();

  useEffect(() => {
    if (currentId === undefined || Number.isNaN(currentId)) {
      setPrevId(undefined);
      setNextId(undefined);
      return;
    }

    let cancelled = false;

    async function load() {
      const stored = await getMeta(FILTERS_KEY, '');
      const filters = parseStoredFiltersLocal(stored);
      const devices = await queryDevices(filters);
      if (cancelled) return;
      const idx = devices.findIndex((d) => d.id === currentId);
      if (idx < 0) {
        setPrevId(undefined);
        setNextId(undefined);
        return;
      }
      setPrevId(idx > 0 ? devices[idx - 1].id : undefined);
      setNextId(idx < devices.length - 1 ? devices[idx + 1].id : undefined);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  return { prevId, nextId };
}
