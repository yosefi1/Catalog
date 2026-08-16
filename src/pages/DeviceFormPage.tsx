import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PhotoCapture } from '../components/PhotoCapture';
import { SuggestInput } from '../components/SuggestInput';
import {
  createDevice,
  deleteDevice,
  getDevice,
  peekNextInventoryId,
  updateDevice,
} from '../db/devices';
import { useDeviceDraft } from '../hooks/useDeviceDraft';
import { uid } from '../services/utils';
import {
  deviceToForm,
  emptyDeviceForm,
  PHOTO_TYPE_LABELS,
  type DeviceFormState,
  type DraftPhoto,
} from '../types/device';

export function DeviceFormPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const deviceId = isNew ? undefined : Number(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const duplicateFrom = searchParams.get('duplicate');

  const [boot, setBoot] = useState<{
    form: DeviceFormState;
    photos: DraftPhoto[];
    inventoryId: string;
  } | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (duplicateFrom) {
          const source = await getDevice(Number(duplicateFrom));
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

        if (deviceId !== undefined) {
          const device = await getDevice(deviceId);
          if (!device) throw new Error('Device not found');
          const photos: DraftPhoto[] = device.photos.map((p) => ({
            localId: uid(),
            photoType: p.photoType,
            blob: p.blob,
            mimeType: p.mimeType,
            previewUrl: URL.createObjectURL(p.blob),
            createdAt: p.createdAt,
            existingPhotoId: p.id,
          }));
          if (!cancelled) {
            setBoot({
              form: deviceToForm(device),
              photos,
              inventoryId: device.inventoryId,
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
  }, [deviceId, duplicateFrom]);

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
      key={`editor-${isNew ? 'new' : deviceId}-${duplicateFrom ?? 'x'}`}
      isNew={isNew || Boolean(duplicateFrom)}
      deviceId={duplicateFrom ? undefined : deviceId}
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
  deviceId,
  initialForm,
  initialPhotos,
  inventoryId: initialInventoryId,
  preferInitial = false,
  navigate,
}: {
  isNew: boolean;
  deviceId?: number;
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
    deviceId,
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
        .filter((x): x is number => x !== undefined),
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

      if (isNew || deviceId === undefined) {
        await createDevice(form, photoPayload);
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
        await updateDevice(deviceId, form, photoPayload, keepIds);
        await clearDraft();
        navigate(`/devices/${deviceId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function discard() {
    await clearDraft();
    navigate(deviceId !== undefined ? `/devices/${deviceId}` : '/');
  }

  async function onDelete() {
    if (deviceId === undefined) return;
    await deleteDevice(deviceId);
    await clearDraft();
    navigate('/');
  }

  if (!ready) return <p className="page muted">Restoring draft…</p>;

  return (
    <div className="page device-form-page">
      <div className="page-heading">
        <div>
          <p className="inv-id">{inventoryId}</p>
          <h1>{isNew ? 'Add Device' : 'Edit Device'}</h1>
        </div>
        {restored && <span className="draft-pill">Draft restored</span>}
      </div>

      <form
        className="device-form"
        onSubmit={(e) => {
          e.preventDefault();
          void persist(false);
        }}
      >
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

        <div className="photo-section">
          <div className="section-title">
            <h2>Photos</h2>
            <p>Tap a type, then Take Photo</p>
          </div>
          <PhotoCapture photos={photos} onChange={setPhotos} />
          {photos.length > 0 && (
            <p className="muted small">
              {photos.map((p) => PHOTO_TYPE_LABELS[p.photoType]).join(' · ')}
            </p>
          )}
        </div>

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

        <div className="sticky-actions">
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
          <button
            type="button"
            className="btn btn--secondary btn--large"
            disabled={saving}
            onClick={() => void discard()}
          >
            Cancel
          </button>
        </div>
      </form>

      {!isNew && deviceId !== undefined && (
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
    </div>
  );
}
