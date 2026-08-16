import { useEffect, useMemo, useState } from 'react';
import { DeviceList } from '../components/DeviceList';
import { defaultFilters, useDevices, useFilterOptions } from '../hooks/useDevices';
import { syncIfEnabledQuiet } from '../services/cloudSync';
import type { InventoryFilters, SortField } from '../types/device';

export function InventoryPage() {
  const [filters, setFilters] = useState<InventoryFilters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const devices = useDevices(filters);
  const options = useFilterOptions();

  const countLabel = useMemo(() => {
    if (!devices) return 'Loading…';
    return `${devices.length} device${devices.length === 1 ? '' : 's'}`;
  }, [devices]);

  useEffect(() => {
    let cancelled = false;

    async function pull() {
      setSyncNote('Syncing…');
      const result = await syncIfEnabledQuiet();
      if (cancelled) return;
      if (!result) {
        setSyncNote(null);
        return;
      }
      setSyncNote(result.ok ? 'Cloud synced' : result.message);
      window.setTimeout(() => {
        if (!cancelled) setSyncNote(null);
      }, 2500);
    }

    void pull();

    // Keep open screens roughly live without manual Sync now
    const intervalId = window.setInterval(() => {
      void pull();
    }, 20_000);

    function onVisible() {
      if (document.visibilityState === 'visible') void pull();
    }
    function onOnline() {
      void pull();
    }

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  function patch(partial: Partial<InventoryFilters>) {
    setFilters((f) => ({ ...f, ...partial }));
  }

  return (
    <div className="page inventory-page">
      <div className="page-heading">
        <div>
          <h1>Inventory</h1>
          <p>{countLabel}</p>
        </div>
        {syncNote && <span className="draft-pill">{syncNote}</span>}
      </div>

      <div className="search-block sticky-search">
        <input
          className="field__input search-input"
          type="search"
          placeholder="Search ID, serial, name, location…"
          value={filters.search}
          onChange={(e) => patch({ search: e.target.value })}
          enterKeyHint="search"
        />
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setShowFilters((v) => !v)}
        >
          {showFilters ? 'Hide filters' : 'Filters & sort'}
        </button>
      </div>

      {showFilters && (
        <div className="filter-panel">
          <label className="field">
            <span className="field__label">Location</span>
            <select
              className="field__input"
              value={filters.location}
              onChange={(e) => patch({ location: e.target.value })}
            >
              <option value="">All</option>
              {options.locations.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Manufacturer</span>
            <select
              className="field__input"
              value={filters.manufacturer}
              onChange={(e) => patch({ manufacturer: e.target.value })}
            >
              <option value="">All</option>
              {options.manufacturers.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Device Type</span>
            <select
              className="field__input"
              value={filters.deviceType}
              onChange={(e) => patch({ deviceType: e.target.value })}
            >
              <option value="">All</option>
              {options.deviceTypes.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Room</span>
            <select
              className="field__input"
              value={filters.room}
              onChange={(e) => patch({ room: e.target.value })}
            >
              <option value="">All</option>
              {options.rooms.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Sort by</span>
            <select
              className="field__input"
              value={filters.sortBy}
              onChange={(e) => patch({ sortBy: e.target.value as SortField })}
            >
              <option value="inventoryId">Inventory ID</option>
              <option value="deviceName">Device Name</option>
              <option value="manufacturer">Manufacturer</option>
              <option value="model">Model</option>
              <option value="serialNumber">Serial</option>
              <option value="createdAt">Date Added</option>
              <option value="updatedAt">Last Modified</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Direction</span>
            <select
              className="field__input"
              value={filters.sortDir}
              onChange={(e) =>
                patch({ sortDir: e.target.value as 'asc' | 'desc' })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </div>
      )}

      {devices === undefined ? (
        <p className="muted">Loading inventory…</p>
      ) : (
        <DeviceList devices={devices} />
      )}
    </div>
  );
}
