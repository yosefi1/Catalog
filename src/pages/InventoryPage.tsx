import { useEffect, useMemo, useState } from 'react';
import { DeviceList, type ThumbSize } from '../components/DeviceList';
import { DeviceTableList } from '../components/DeviceTableList';
import {
  defaultFilters,
  INVENTORY_FILTERS_KEY,
  INVENTORY_VIEW_KEY,
  parseStoredFilters,
  useDevices,
  useFilterOptions,
} from '../hooks/useDevices';
import { getMeta, setMeta } from '../db/database';
import type { InventoryFilters, SortField } from '../types/device';

const THUMB_KEY = 'inventoryThumbSize';

type ViewMode = 'cards' | 'table';

function asThumbSize(value: string | number | boolean): ThumbSize {
  if (value === 'small' || value === 'medium' || value === 'large') return value;
  return 'medium';
}

function asViewMode(value: string | number | boolean): ViewMode {
  return value === 'table' ? 'table' : 'cards';
}

export function InventoryPage() {
  const [filters, setFilters] = useState<InventoryFilters>(defaultFilters);
  const [filtersReady, setFiltersReady] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [thumbSize, setThumbSize] = useState<ThumbSize>('medium');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const devices = useDevices(filtersReady ? filters : defaultFilters);
  const options = useFilterOptions();

  const countLabel = useMemo(() => {
    if (!devices) return 'Loading…';
    return `${devices.length} device${devices.length === 1 ? '' : 's'}`;
  }, [devices]);

  useEffect(() => {
    void Promise.all([
      getMeta(THUMB_KEY, 'medium'),
      getMeta(INVENTORY_VIEW_KEY, 'cards'),
      getMeta(INVENTORY_FILTERS_KEY, ''),
    ]).then(([thumb, view, storedFilters]) => {
      setThumbSize(asThumbSize(thumb));
      setViewMode(asViewMode(view));
      setFilters(parseStoredFilters(storedFilters));
      setFiltersReady(true);
    });
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    void setMeta(INVENTORY_FILTERS_KEY, JSON.stringify(filters));
  }, [filters, filtersReady]);

  function changeThumbSize(size: ThumbSize) {
    setThumbSize(size);
    void setMeta(THUMB_KEY, size);
  }

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    void setMeta(INVENTORY_VIEW_KEY, mode);
  }

  function patch(partial: Partial<InventoryFilters>) {
    setFilters((f) => ({ ...f, ...partial }));
  }

  function applyLocation(location: string) {
    patch({ location });
  }

  function applyRecent() {
    patch({
      sortBy: 'updatedAt',
      sortDir: 'desc',
    });
  }

  function applyAll() {
    patch({
      location: '',
      manufacturer: '',
      deviceType: '',
      room: '',
      search: '',
      sortBy: 'inventoryId',
      sortDir: 'asc',
    });
  }

  const recentActive =
    filters.sortBy === 'updatedAt' && filters.sortDir === 'desc' && !filters.location;

  return (
    <div className="page inventory-page">
      <div className="page-heading">
        <div>
          <h1>Inventory</h1>
          <p>{countLabel}</p>
        </div>
        <div className="view-mode-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`view-mode-toggle__btn ${viewMode === 'cards' ? 'is-active' : ''}`}
            onClick={() => changeViewMode('cards')}
          >
            Cards
          </button>
          <button
            type="button"
            className={`view-mode-toggle__btn ${viewMode === 'table' ? 'is-active' : ''}`}
            onClick={() => changeViewMode('table')}
          >
            List
          </button>
        </div>
      </div>

      <div className="quick-filters">
        <button
          type="button"
          className={`quick-filter-chip ${!filters.location && !recentActive ? 'is-active' : ''}`}
          onClick={applyAll}
        >
          All
        </button>
        <button
          type="button"
          className={`quick-filter-chip ${recentActive ? 'is-active' : ''}`}
          onClick={applyRecent}
        >
          Recent
        </button>
        {options.locations.map((loc) => (
          <button
            key={loc}
            type="button"
            className={`quick-filter-chip ${filters.location === loc ? 'is-active' : ''}`}
            onClick={() => applyLocation(loc)}
          >
            {loc}
          </button>
        ))}
      </div>

      <div className="search-block sticky-search">
        <input
          className="field__input search-input"
          type="search"
          placeholder="Search #, serial, name, location…"
          value={filters.search}
          onChange={(e) => patch({ search: e.target.value })}
          enterKeyHint="search"
        />
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setShowFilters((v) => !v)}
        >
          {showFilters ? 'Hide filters' : 'More filters'}
        </button>
        {viewMode === 'cards' && (
          <div className="thumb-size-toggle" role="group" aria-label="Photo size">
            {(
              [
                ['small', 'S', 'Small'],
                ['medium', 'M', 'Medium'],
                ['large', 'L', 'Large'],
              ] as const
            ).map(([size, label, title]) => (
              <button
                key={size}
                type="button"
                title={title}
                aria-label={title}
                className={`thumb-size-toggle__btn ${thumbSize === size ? 'is-active' : ''}`}
                onClick={() => changeThumbSize(size)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
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
              <option value="inventoryId">#</option>
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

      {!filtersReady || devices === undefined ? (
        <p className="muted">Loading inventory…</p>
      ) : viewMode === 'table' ? (
        <DeviceTableList devices={devices} />
      ) : (
        <DeviceList devices={devices} thumbSize={thumbSize} />
      )}
    </div>
  );
}
