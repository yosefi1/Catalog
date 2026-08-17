import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { clampCrop, cropBlob, type PixelCrop } from '../services/cropImage';

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface Props {
  src: string;
  source: Blob;
  onCancel: () => void;
  onApply: (cropped: Blob) => void | Promise<void>;
  cancelLabel?: string;
}

export function PhotoCropper({
  src,
  source,
  onCancel,
  onApply,
  cancelLabel = 'Cancel',
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<PixelCrop>({ x: 0, y: 0, width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{
    handle: Handle;
    x: number;
    y: number;
    crop: PixelCrop;
  } | null>(null);

  function measureStage() {
    const el = stageRef.current;
    if (!el) return;
    setStage({ w: el.clientWidth, h: el.clientHeight });
  }

  useEffect(() => {
    let revoked = false;
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      if (revoked) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setNat({ w, h });
      const insetX = Math.round(w * 0.08);
      const insetY = Math.round(h * 0.08);
      setCrop(
        clampCrop(
          {
            x: insetX,
            y: insetY,
            width: w - insetX * 2,
            height: h - insetY * 2,
          },
          w,
          h,
        ),
      );
      measureStage();
    };
    img.onerror = () => {
      if (!revoked) setError('Failed to load photo');
    };
    img.src = url;
    return () => {
      revoked = true;
      URL.revokeObjectURL(url);
    };
  }, [source]);

  useEffect(() => {
    measureStage();
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureStage());
    ro.observe(el);
    window.addEventListener('resize', measureStage);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureStage);
    };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const scale =
    nat.w && nat.h && stage.w && stage.h
      ? Math.min(stage.w / nat.w, stage.h / nat.h)
      : 0;
  const visW = scale ? nat.w * scale : 0;
  const visH = scale ? nat.h * scale : 0;

  function onPointerDown(handle: Handle, e: PointerEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { handle, x: e.clientX, y: e.clientY, crop };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || !nat.w || !scale) return;
    const dx = (e.clientX - start.x) / scale;
    const dy = (e.clientY - start.y) / scale;
    const c = start.crop;
    let next: PixelCrop;
    if (start.handle === 'move') {
      next = { ...c, x: c.x + dx, y: c.y + dy };
    } else {
      const right = c.x + c.width;
      const bottom = c.y + c.height;
      let x = c.x;
      let y = c.y;
      let r = right;
      let b = bottom;
      if (start.handle.includes('w')) x = c.x + dx;
      if (start.handle.includes('e')) r = right + dx;
      if (start.handle.includes('n')) y = c.y + dy;
      if (start.handle.includes('s')) b = bottom + dy;
      next = { x, y, width: r - x, height: b - y };
    }
    setCrop(clampCrop(next, nat.w, nat.h));
  }

  function onPointerUp() {
    drag.current = null;
  }

  async function apply() {
    if (!nat.w || busy) return;
    setBusy(true);
    setError(null);
    try {
      const cropped = await cropBlob(source, crop);
      await onApply(cropped);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Crop failed');
    } finally {
      setBusy(false);
    }
  }

  const box = {
    left: crop.x * scale,
    top: crop.y * scale,
    width: crop.width * scale,
    height: crop.height * scale,
  };

  return (
    <div
      className="cropper"
      role="dialog"
      aria-modal="true"
      aria-label="Crop photo"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="cropper__toolbar">
        <p>Drag the box or corners to crop</p>
        <button type="button" className="lightbox__close" onClick={onCancel} disabled={busy}>
          Close
        </button>
      </div>

      <div ref={stageRef} className="cropper__stage">
        {visW > 0 && (
          <div className="cropper__fit" style={{ width: visW, height: visH }}>
            <img src={src} alt="Crop" draggable={false} />
            <div
              className="cropper__box"
              style={box}
              onPointerDown={(e) => onPointerDown('move', e)}
            >
              {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                <button
                  key={handle}
                  type="button"
                  aria-label={`Resize ${handle}`}
                  className={`cropper__handle cropper__handle--${handle}`}
                  onPointerDown={(e) => onPointerDown(handle, e)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <p className="error-text cropper__error">{error}</p>}

      <div className="cropper__actions">
        <button type="button" className="btn btn--ghost btn--large" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className="btn btn--primary btn--large"
          onClick={() => void apply()}
          disabled={busy || !nat.w}
        >
          {busy ? 'Cropping…' : 'Apply crop'}
        </button>
      </div>
    </div>
  );
}
