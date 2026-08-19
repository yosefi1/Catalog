import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteDraft,
  draftIdForDevice,
  getDraft,
  saveDraft,
} from '../db/drafts';
import type { DeviceDraft, DeviceFormState, DraftPhoto } from '../types/device';
import { emptyDeviceForm } from '../types/device';
import { revokePreviewUrls } from '../services/photoCompression';

interface UseDraftOptions {
  inventoryId?: string;
  initialForm?: DeviceFormState;
  initialPhotos?: DraftPhoto[];
  enabled?: boolean;
  /** When true, ignore any saved draft and start from initialForm/photos */
  preferInitial?: boolean;
}

export function useDeviceDraft({
  inventoryId,
  initialForm,
  initialPhotos = [],
  enabled = true,
  preferInitial = false,
}: UseDraftOptions) {
  const draftKey = draftIdForDevice(inventoryId);
  const [form, setForm] = useState<DeviceFormState>(
    initialForm ?? emptyDeviceForm(),
  );
  const [photos, setPhotos] = useState<DraftPhoto[]>(initialPhotos);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!enabled) {
        setReady(true);
        return;
      }

      if (preferInitial) {
        setForm(initialForm ?? emptyDeviceForm());
        setPhotos(initialPhotos);
        setReady(true);
        return;
      }

      const existing = await getDraft(draftKey);
      if (cancelled) return;

      if (existing) {
        setForm(existing.form);
        const withUrls = existing.photos.map((p) => ({
          ...p,
          previewUrl: URL.createObjectURL(p.blob),
        }));
        setPhotos(withUrls);
        setRestored(true);
      } else if (initialForm) {
        setForm(initialForm);
        setPhotos(initialPhotos);
      }
      setReady(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
    // Only on mount / device change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, enabled, preferInitial]);

  useEffect(() => {
    if (!ready || !enabled) return;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const draft: DeviceDraft = {
        id: draftKey,
        form,
        // Store without relying on previewUrl persistence
        photos: photos.map(({ previewUrl: _p, ...rest }) => ({
          ...rest,
          previewUrl: '',
        })),
        updatedAt: Date.now(),
      };
      void saveDraft(draft);
    }, 400);

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [form, photos, ready, enabled, draftKey]);

  useEffect(() => {
    return () => {
      revokePreviewUrls(photosRef.current.map((p) => p.previewUrl));
    };
  }, []);

  const clearDraft = useCallback(async () => {
    await deleteDraft(draftKey);
  }, [draftKey]);

  const resetFormKeepingContext = useCallback(
    (keep: Partial<DeviceFormState>) => {
      const next = emptyDeviceForm({
        location: keep.location ?? '',
        room: keep.room ?? '',
        area: keep.area ?? '',
        owner: keep.owner ?? '',
        manufacturer: keep.manufacturer ?? '',
        deviceType: keep.deviceType ?? '',
      });
      revokePreviewUrls(photosRef.current.map((p) => p.previewUrl));
      setForm(next);
      setPhotos([]);
      setRestored(false);
    },
    [],
  );

  return {
    form,
    setForm,
    photos,
    setPhotos,
    ready,
    restored,
    clearDraft,
    resetFormKeepingContext,
    draftKey,
  };
}
