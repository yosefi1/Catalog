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
  const imgRef = useRef<HTMLImageElement>(null);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<PixelCrop>({ x: 0, y: 0, width: 0, height: 0 });
  const [view, setView] = useState({ left: 0, top: 0, scaleX: 1, scaleY: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{
    handle: Handle;
    x: number;
    y: number;
    crop: PixelCrop;
  } | null>(null);

  function measure() {
    const img = imgRef.current;
    const stage = stageRef.current;
    if (!img?.naturalWidth || !stage) return;
    const ir = img.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    setView({
      left: ir.left - sr.left,
      top: ir.top - sr.top,
      scaleX: ir.width / img.naturalWidth,
      scaleY: ir.height / img.naturalHeight,
    });
  }

  function onImgLoad() {
    const img = imgRef.current;
    if (!img) return;
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
    measure();
    requestAnimationFrame(() => measure());
  }

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth) onImgLoad();
  }, [src]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onResize() {
      measure();
    }
    window.addEventListener('resize', onResize);
    const stage = stageRef.current;
    const ro = stage ? new ResizeObserver(onResize) : null;
    if (stage && ro) ro.observe(stage);
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function onPointerDown(handle: Handle, e: PointerEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { handle, x: e.clientX, y: e.clientY, crop };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || !nat.w) return;
    const dx = (e.clientX - start.x) / view.scaleX;
    const dy = (e.clientY - start.y) / view.scaleY;
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
    left: view.left + crop.x * view.scaleX,
    top: view.top + crop.y * view.scaleY,
    width: crop.width * view.scaleX,
    height: crop.height * view.scaleY,
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
        <img
          ref={imgRef}
          src={src}
          alt="Crop"
          draggable={false}
          onLoad={onImgLoad}
        />
        {nat.w > 0 && (
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
