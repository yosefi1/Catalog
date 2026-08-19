import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PhotoLightbox } from './PhotoLightbox';
import {
  deviceToForm,
  PHOTO_TYPE_LABELS,
  sortPhotosForDisplay,
  type DeviceFormState,
  type DeviceWithPhotos,
  type SortDirection,
  type SortField,
} from '../types/device';
import {
  deviceRouteId,
  deleteDevice,
  formatDisplayNumber,
  getDevice,
  updateDeviceFields,
} from '../db/devices';
import type { DeviceListRow } from '../services/catalogApi';
import { formatDateShort } from '../services/utils';

const COL_COUNT = 8;

interface Props {
  devices: DeviceListRow[];
  sortBy: SortField;
  sortDir: SortDirection;
  onSort: (field: SortField) => void;
  editAll: boolean;
}

function SortHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  field: SortField;
  sortBy: SortField;
  sortDir: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const active = sortBy === field;
  return (
    <th scope="col">
      <button
        type="button"
        className={`device-table__sort ${active ? `is-${sortDir}` : ''}`}
        onClick={() => onSort(field)}
      >
        {label}
        {active && <span aria-hidden="true">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
      </button>
    </th>
  );
}

function ExpandedDevice({
  inventoryId,
  editMode,
}: {
  inventoryId: string;
  editMode: boolean;
}) {
  const [device, setDevice] = useState<DeviceWithPhotos | null>(null);
  const [form, setForm] = useState<DeviceFormState | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void getDevice(inventoryId).then((d) => {
      if (!d) return;
      setDevice({ ...d, photos: sortPhotosForDisplay(d.photos) });
      setForm(deviceToForm(d));
    });
  }

  useEffect(() => {
    load();
  }, [inventoryId]);

  function patch<K extends keyof DeviceFormState>(key: K, value: DeviceFormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSaveNote(null);
    try {
      await updateDeviceFields(inventoryId, form);
      setSaveNote('Saved');
      load();
      window.setTimeout(() => setSaveNote(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!device || !form) {
    return (
      <td colSpan={COL_COUNT} className="table-expand muted">
        Loading…
      </td>
    );
  }

  return (
    <td colSpan={COL_COUNT} className="table-expand">
      <div className="table-expand__grid">
        {editMode ? (
          <div className="table-expand__form">
            <label className="field">
              <span className="field__label">Device Name</span>
              <input
                className="field__input"
                value={form.deviceName}
                onChange={(e) => patch('deviceName', e.target.value)}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span className="field__label">Manufacturer</span>
                <input
                  className="field__input"
                  value={form.manufacturer}
                  onChange={(e) => patch('manufacturer', e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field__label">Model</span>
                <input
                  className="field__input"
                  value={form.model}
                  onChange={(e) => patch('model', e.target.value)}
                />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field__label">Serial</span>
                <input
                  className="field__input"
                  value={form.serialNumber}
                  onChange={(e) => patch('serialNumber', e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field__label">Location</span>
                <input
                  className="field__input"
                  value={form.location}
                  onChange={(e) => patch('location', e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span className="field__label">Room</span>
              <input
                className="field__input"
                value={form.room}
                onChange={(e) => patch('room', e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Notes</span>
              <textarea
                className="field__input"
                rows={2}
                value={form.notes}
                onChange={(e) => patch('notes', e.target.value)}
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            {saveNote && <p className="muted">{saveNote}</p>}
            <button
              type="button"
              className="btn btn--primary btn--small"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <>
            <dl className="detail-grid detail-grid--compact">
              <div>
                <dt>Manufacturer</dt>
                <dd>{device.manufacturer || '—'}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{device.model || '—'}</dd>
              </div>
              <div>
                <dt>Serial</dt>
                <dd>{device.serialNumber || '—'}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{device.location || '—'}</dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>{device.room || '—'}</dd>
              </div>
              <div>
                <dt>Added</dt>
                <dd>{formatDateShort(device.createdAt)}</dd>
              </div>
            </dl>
            {device.notes && <p className="table-expand__notes">{device.notes}</p>}
          </>
        )}

        {device.photos.length > 0 && (
          <div className="table-expand__photos">
            {device.photos.map((p, i) => (
              <figure key={p.id ?? i}>
                <button
                  type="button"
                  className="table-expand__photo-btn"
                  onClick={() => setLightbox(i)}
                >
                  <img src={p.url} alt={PHOTO_TYPE_LABELS[p.photoType]} />
                </button>
                <figcaption>{PHOTO_TYPE_LABELS[p.photoType]}</figcaption>
              </figure>
            ))}
          </div>
        )}

        <div className="table-expand__actions">
          <Link className="btn btn--primary btn--small" to={`/devices/${deviceRouteId(device.inventoryId)}`}>
            Open full page
          </Link>
          {!editMode && (
            <Link className="btn btn--secondary btn--small" to={`/devices/${deviceRouteId(device.inventoryId)}/edit`}>
              Edit
            </Link>
          )}
        </div>
      </div>

      {lightbox !== null && (
        <PhotoLightbox
          images={device.photos.map((p) => ({
            src: p.url,
            label: PHOTO_TYPE_LABELS[p.photoType],
          }))}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onIndexChange={setLightbox}
        />
      )}
    </td>
  );
}

export function DeviceTableList({
  devices,
  sortBy,
  sortDir,
  onSort,
  editAll,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onDelete(device: DeviceListRow) {
    setBusyId(device.inventoryId);
    try {
      await deleteDevice(device.inventoryId);
      setConfirmId(null);
      if (expandedId === device.inventoryId) setExpandedId(null);
    } finally {
      setBusyId(null);
    }
  }

  if (!devices.length) {
    return (
      <div className="empty-state">
        <h2>No devices match</h2>
        <p>Try another filter or add a device.</p>
      </div>
    );
  }

  return (
    <div className="device-table-wrap">
      <table className="device-table">
        <thead>
          <tr>
            <SortHeader label="#" field="inventoryId" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Name" field="deviceName" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortHeader
              label="Manufacturer"
              field="manufacturer"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortHeader label="Model" field="model" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Serial" field="serialNumber" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Location" field="location" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Added" field="createdAt" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <th scope="col" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => {
            const open = expandedId === d.inventoryId;
            return (
              <Fragment key={d.inventoryId}>
                <tr
                  className={`device-table__row ${open ? 'is-open' : ''}`}
                  onClick={() =>
                    setExpandedId((cur) =>
                      cur === d.inventoryId ? null : d.inventoryId,
                    )
                  }
                >
                  <td className="inv-id">{formatDisplayNumber(d.inventoryId)}</td>
                  <td>{d.deviceName || 'Untitled'}</td>
                  <td>{d.manufacturer || '—'}</td>
                  <td>{d.model || '—'}</td>
                  <td>{d.serialNumber || '—'}</td>
                  <td>{d.location || '—'}</td>
                  <td className="device-table__date">{formatDateShort(d.createdAt)}</td>
                  <td className="device-table__actions" onClick={(e) => e.stopPropagation()}>
                    {confirmId === d.inventoryId ? (
                      <>
                        <button
                          type="button"
                          className="btn btn--danger btn--small"
                          disabled={busyId === d.inventoryId}
                          onClick={() => void onDelete(d)}
                        >
                          {busyId === d.inventoryId ? '…' : 'Del'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => setConfirmId(null)}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--danger btn--small"
                        onClick={() => setConfirmId(d.inventoryId)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
                {open && (
                  <tr className="device-table__expand-row">
                    <ExpandedDevice inventoryId={d.inventoryId} editMode={editAll} />
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
