import { useEffect, useRef, useState, type PointerEvent, type TouchEvent, type WheelEvent, type MouseEvent } from 'react';

export interface LightboxImage {
  src: string;
  label?: string;
}

interface Props {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

export function PhotoLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: Props) {
  const current = images[index];
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [index, current?.src]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') {
        onIndexChange((index - 1 + images.length) % images.length);
      }
      if (e.key === 'ArrowRight') {
        onIndexChange((index + 1) % images.length);
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        bumpZoom(1.25);
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        bumpZoom(1 / 1.25);
      }
      if (e.key === '0') {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onClose, onIndexChange]);

  function clampZoom(z: number) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }

  function bumpZoom(factor: number) {
    setZoom((z) => {
      const next = clampZoom(z * factor);
      if (next <= MIN_ZOOM) setOffset({ x: 0, y: 0 });
      return next;
    });
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    bumpZoom(factor);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current || zoom <= 1) return;
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onDoubleClick(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (zoom > 1) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } else {
      setZoom(2.5);
    }
  }

  function touchDist(touches: { length: number; [index: number]: { clientX: number; clientY: number } }) {
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2) {
      pinch.current = { dist: touchDist(e.touches), zoom };
      drag.current = null;
    }
  }

  function onTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      const dist = touchDist(e.touches);
      const next = clampZoom(pinch.current.zoom * (dist / pinch.current.dist));
      setZoom(next);
      if (next <= MIN_ZOOM) setOffset({ x: 0, y: 0 });
    }
  }

  function onTouchEnd(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length < 2) pinch.current = null;
  }

  if (!current) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <div className="lightbox__toolbar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn btn--secondary btn--small" onClick={() => bumpZoom(1 / 1.3)}>
          −
        </button>
        <button type="button" className="btn btn--secondary btn--small" onClick={() => bumpZoom(1.3)}>
          +
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={() => {
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          Fit
        </button>
        <span className="lightbox__zoom-label">{Math.round(zoom * 100)}%</span>
        <button type="button" className="lightbox__close" onClick={onClose}>
          Close
        </button>
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="lightbox__nav lightbox__nav--prev"
            onClick={() =>
              onIndexChange((index - 1 + images.length) % images.length)
            }
          >
            ‹
          </button>
          <button
            type="button"
            className="lightbox__nav lightbox__nav--next"
            onClick={() => onIndexChange((index + 1) % images.length)}
          >
            ›
          </button>
        </>
      )}

      <div
        className="lightbox__viewport"
        onClick={(e) => {
          if (e.target === e.currentTarget && zoom <= 1) onClose();
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
      >
        <img
          src={current.src}
          alt={current.label || 'Photo'}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
        />
      </div>
      {current.label && <p className="lightbox__caption">{current.label}</p>}
      <p className="lightbox__hint">Pinch, scroll, or +/− to zoom · drag to pan · double-tap to reset</p>
    </div>
  );
}
