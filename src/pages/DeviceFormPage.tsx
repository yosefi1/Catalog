import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PhotoCapture } from '../components/PhotoCapture';
import { DeviceNavButtons } from '../components/DeviceNavButtons';
import { SuggestInput } from '../components/SuggestInput';
import {
  createDevice,
  formatDisplayNumber,
  getDeviceByRoute,
  peekNextInventoryId,
  updateDevice,
  deleteDevice,
} from '../db/devices';
import { useDeviceDraft } from '../hooks/useDeviceDraft';
import { uid } from '../services/utils';
import {
  deviceToForm,
  emptyDeviceForm,
  PHOTO_TYPE_LABELS,
  sortPhotosForDisplay,
  type DeviceFormState,
  type DraftPhoto,
} from '../types/device';
import type { DeviceRouteState } from '../services/deviceRouteState';

async function blobFromUrl(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load photo');
  return res.blob();
}

export function DeviceFormPage() {
  const { id: routeId } = useParams();
  const location = useLocation();
  const inventoryIdHint = (location.state as DeviceRouteState | null)?.inventoryId;
  const isNew = !routeId || routeId === 'new';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const duplicateFrom = searchParams.get('duplicate');

  const [boot, setBoot] = useState<{
    form: DeviceFormState;
    photos: DraftPhoto[];
    inventoryId: string;
    editInventoryId?: string;
  } | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (duplicateFrom) {
          const source = await getDeviceByRoute(duplicateFrom);
          if (!source) throw new Error('Source device not found');
          const form = emptyDeviceForm({
            deviceName: source.deviceName,
            manufacturer: source.manufacturer,
            model: source.model,
            deviceType: source.deviceType,
            location: source.location,
            room: source.room,
            area: source.area,
            owner: source.owner,
          });
          const inventoryId = await peekNextInventoryId();
          if (!cancelled) setBoot({ form, photos: [], inventoryId });
          return;
        }

        if (!isNew && routeId) {
          const device = await getDeviceByRoute(routeId, inventoryIdHint);
          if (!device) throw new Error('Device not found');
          const photos: DraftPhoto[] = await Promise.all(
            device.photos.map(async (p) => {
              const blob = await blobFromUrl(p.url);
              return {
                localId: uid(),
                photoType: p.photoType,
                blob,
                mimeType: p.mimeType,
                previewUrl: URL.createObjectURL(blob),
                createdAt: p.createdAt,
                existingPhotoId: p.id,
              };
            }),
          );
          if (!cancelled) {
            setBoot({
              form: deviceToForm(device),
              photos,
              inventoryId: device.inventoryId,
              editInventoryId: device.inventoryId,
            });
          }
          return;
        }

        const inventoryId = await peekNextInventoryId();
        if (!cancelled) {
          setBoot({ form: emptyDeviceForm(), photos: [], inventoryId });
        }
      } catch (e) {
        if (!cancelled) {
          setBootError(e instanceof Error ? e.message : 'Failed to load');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [routeId, duplicateFrom, isNew, inventoryIdHint]);

  if (bootError) {
    return (
      <div className="page">
        <p className="error-text">{bootError}</p>
        <Link to="/">Back to inventory</Link>
      </div>
    );
  }

  if (!boot) {
    return <p className="page muted">Loading…</p>;
  }

  return (
    <DeviceFormEditor
      key={`editor-${isNew ? 'new' : routeId}-${duplicateFrom ?? 'x'}`}
      isNew={isNew || Boolean(duplicateFrom)}
      editInventoryId={duplicateFrom ? undefined : boot.editInventoryId}
      routeId={routeId}
      initialForm={boot.form}
      initialPhotos={boot.photos}
      inventoryId={boot.inventoryId}
      preferInitial={Boolean(duplicateFrom)}
      navigate={navigate}
    />
  );
}

function DeviceFormEditor({
  isNew,
  editInventoryId,
  routeId,
  initialForm,
  initialPhotos,
  inventoryId: initialInventoryId,
  preferInitial = false,
  navigate,
}: {
  isNew: boolean;
  editInventoryId?: string;
  routeId?: string;
  initialForm: DeviceFormState;
  initialPhotos: DraftPhoto[];
  inventoryId: string;
  preferInitial?: boolean;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const {
    form,
    setForm,
    photos,
    setPhotos,
    ready,
    restored,
    clearDraft,
    resetFormKeepingContext,
  } = useDeviceDraft({
    inventoryId: editInventoryId,
    initialForm,
    initialPhotos,
    enabled: true,
    preferInitial,
  });

  const [inventoryId, setInventoryId] = useState(initialInventoryId);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const keepIds = useMemo(
    () =>
      photos
        .map((p) => p.existingPhotoId)
        .filter((x): x is string => x !== undefined),
    [photos],
  );

  function patch<K extends keyof DeviceFormState>(
    key: K,
    value: DeviceFormState[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function persist(andNext: boolean) {
    setSaving(true);
    setError(null);
    try {
      const photoPayload = photos.map((p) => ({
        id: p.existingPhotoId,
        photoType: p.photoType,
        blob: p.blob,
        mimeType: p.mimeType,
        createdAt: p.createdAt,
      }));

      if (isNew || !editInventoryId) {
        await createDevice(form, photoPayload, inventoryId);
        await clearDraft();
        if (andNext) {
          resetFormKeepingContext({
            location: form.location,
            room: form.room,
            area: form.area,
            owner: form.owner,
            manufacturer: form.manufacturer,
            deviceType: form.deviceType,
          });
          setInventoryId(await peekNextInventoryId());
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          navigate('/');
        }
      } else {
        await updateDevice(editInventoryId, form, photoPayload, keepIds);
        await clearDraft();
        navigate(routeId ? `/devices/${routeId}` : '/');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function discard() {
    await clearDraft();
    navigate(routeId ? `/devices/${routeId}` : '/');
  }

  async function onDelete() {
    if (!editInventoryId) return;
    setSaving(true);
    setError(null);
    try {
      await deleteDevice(editInventoryId);
      await clearDraft();
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <p className="page muted">Restoring draft…</p>;

  return (
    <div className={`page device-form-page${photos.length ? ' has-photos' : ''}`}>
      <div className="page-heading">
        <div>
          <p className="inv-id">
            {!isNew && routeId ? `#${routeId}` : formatDisplayNumber(inventoryId)}
          </p>
          <h1>{isNew ? 'Add Device' : 'Edit Device'}</h1>
        </div>
        <div className="page-heading__aside">
          {restored && <span className="draft-pill">Draft restored</span>}
          {!isNew && routeId && (
            <DeviceNavButtons routeId={routeId} edit compact />
          )}
        </div>
      </div>

      <form
        className="device-form"
        onSubmit={(e) => {
          e.preventDefault();
          void persist(false);
        }}
      >
        <div className="device-form__fields">
          <SuggestInput
            label="Location"
            field="location"
            value={form.location}
            onChange={(v) => patch('location', v)}
            placeholder="e.g. JER Lab"
            enterKeyHint="next"
          />

          <div className="field-row">
            <SuggestInput
              label="Room"
              field="room"
              value={form.room}
              onChange={(v) => patch('room', v)}
              placeholder="Lab 1"
            />
            <SuggestInput
              label="Area / Bench / Rack"
              field="area"
              value={form.area}
              onChange={(v) => patch('area', v)}
              placeholder="Bench 4"
            />
          </div>

          <label className="field">
            <span className="field__label">Device Name</span>
            <input
              className="field__input"
              value={form.deviceName}
              onChange={(e) => patch('deviceName', e.target.value)}
              placeholder="Keysight Oscilloscope"
              enterKeyHint="next"
            />
          </label>

          <SuggestInput
            label="Manufacturer"
            field="manufacturer"
            value={form.manufacturer}
            onChange={(v) => patch('manufacturer', v)}
            placeholder="Keysight"
          />

          <label className="field">
            <span className="field__label">Model</span>
            <input
              className="field__input field__input--emphasis"
              value={form.model}
              onChange={(e) => patch('model', e.target.value)}
              placeholder="DSOX1204G"
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span className="field__label">Serial Number</span>
            <input
              className="field__input field__input--serial"
              value={form.serialNumber}
              onChange={(e) => patch('serialNumber', e.target.value)}
              placeholder="MY12345678"
              autoCapitalize="characters"
              enterKeyHint="next"
            />
          </label>

          <label className="field">
            <span className="field__label">Notes</span>
            <textarea
              className="field__input"
              rows={3}
              value={form.notes}
              onChange={(e) => patch('notes', e.target.value)}
              placeholder="Condition, cables, power issues…"
            />
          </label>

          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setShowMore(!showMore)}
          >
            {showMore ? 'Hide extra fields' : 'More fields'}
          </button>

          {showMore && (
            <div className="more-fields">
              <label className="field">
                <span className="field__label">Asset Tag</span>
                <input
                  className="field__input"
                  value={form.assetTag}
                  onChange={(e) => patch('assetTag', e.target.value)}
                />
              </label>
              <SuggestInput
                label="Device Type / Category"
                field="deviceType"
                value={form.deviceType}
                onChange={(v) => patch('deviceType', v)}
                placeholder="Oscilloscope"
              />
              <SuggestInput
                label="Owner / Team"
                field="owner"
                value={form.owner}
                onChange={(v) => patch('owner', v)}
              />
            </div>
          )}

          {error && <p className="error-text">{error}</p>}
        </div>

        <section className="photo-section">
          <div className="section-title">
            <h2>Photos</h2>
            <p>Uploaded directly to the server when you save</p>
          </div>
          <PhotoCapture photos={photos} onChange={setPhotos} />
          {photos.length > 0 && (
            <p className="muted small">
              {sortPhotosForDisplay(photos)
                .map((p) => PHOTO_TYPE_LABELS[p.photoType])
                .join(' · ')}
            </p>
          )}
        </section>
      </form>

      {!isNew && routeId && <DeviceNavButtons routeId={routeId} edit />}

      {!isNew && editInventoryId && (
        <div className="danger-zone">
          {!confirmDelete ? (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => setConfirmDelete(true)}
            >
              Delete device
            </button>
          ) : (
            <div className="confirm-row">
              <p>Delete this device and its photos?</p>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => void onDelete()}
              >
                Confirm delete
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </button>
            </div>
          )}
        </div>
      )}

      <div className="sticky-actions" role="toolbar" aria-label="Device actions">
        <button
          type="button"
          className="btn btn--secondary btn--large"
          disabled={saving}
          onClick={() => void discard()}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary btn--large"
          disabled={saving}
          onClick={() => void persist(false)}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {isNew && (
          <button
            type="button"
            className="btn btn--accent btn--large"
            disabled={saving}
            onClick={() => void persist(true)}
          >
            Save & Add Next
          </button>
        )}
      </div>
    </div>
  );
}
