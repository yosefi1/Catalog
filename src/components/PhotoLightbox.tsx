import { useEffect, useRef, useState, type PointerEvent, type TouchEvent } from 'react';

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

/**
 * Keep the <img> at naturalWidth × naturalHeight (same bitmap as “open in new tab”).
 * Fit/zoom only scales that full-resolution element visually — never shrinks then upsamples.
 */
export function PhotoLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: Props) {
  const current = images[index];
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState(1);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    sl: number;
    st: number;
  } | null>(null);

  useEffect(() => {
    setNat({ w: 0, h: 0 });
  }, [index, current?.src]);

  function applyFitFrom(nw: number, nh: number) {
    const vp = viewportRef.current;
    if (!vp || !nw || !nh) return 1;
    const nextFit = Math.min(vp.clientWidth / nw, vp.clientHeight / nh, 1);
    setFit(nextFit);
    setScale(nextFit);
    return nextFit;
  }

  function onImgLoad() {
    const el = imgRef.current;
    if (!el) return;
    const nw = el.naturalWidth;
    const nh = el.naturalHeight;
    setNat({ w: nw, h: nh });
    applyFitFrom(nw, nh);
  }

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
        bump(1.25);
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        bump(1 / 1.25);
      }
      if (e.key === '0') applyFitFrom(nat.w, nat.h);
      if (e.key === '1') setScale(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onClose, onIndexChange, nat.w, nat.h]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      bump(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [fit]);

  function clamp(s: number) {
    const min = Math.max(fit * 0.5, 0.05);
    const max = Math.max(1, fit) * 3;
    return Math.min(max, Math.max(min, s));
  }

  function bump(factor: number) {
    setScale((s) => clamp(s * factor));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const vp = viewportRef.current;
    if (!vp) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      sl: vp.scrollLeft,
      st: vp.scrollTop,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const vp = viewportRef.current;
    if (!vp || !drag.current || pinch.current) return;
    vp.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
    vp.scrollTop = drag.current.st - (e.clientY - drag.current.y);
  }

  function onPointerUp() {
    drag.current = null;
  }

  function touchDist(touches: { length: number; [i: number]: { clientX: number; clientY: number } }) {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
  }

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2) {
      pinch.current = { dist: touchDist(e.touches), scale };
      drag.current = null;
    }
  }

  function onTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      setScale(clamp(pinch.current.scale * (touchDist(e.touches) / pinch.current.dist)));
    }
  }

  function onTouchEnd(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length < 2) pinch.current = null;
  }

  if (!current) return null;

  const nativePct = nat.w ? Math.round(scale * 100) : 0;
  const visW = nat.w ? nat.w * scale : undefined;
  const visH = nat.h ? nat.h * scale : undefined;

  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <div className="lightbox__toolbar">
        <button type="button" className="btn btn--secondary btn--small" onClick={() => bump(1 / 1.3)}>
          −
        </button>
        <button type="button" className="btn btn--secondary btn--small" onClick={() => bump(1.3)}>
          +
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={() => applyFitFrom(nat.w, nat.h)}
        >
          Fit
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={() => setScale(1)}
        >
          100%
        </button>
        <span className="lightbox__zoom-label">{nativePct}%</span>
        <a
          className="btn btn--secondary btn--small"
          href={current.src}
          target="_blank"
          rel="noreferrer"
        >
          Open original
        </a>
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
        ref={viewportRef}
        className="lightbox__viewport lightbox__viewport--native"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="lightbox__frame">
          <div
            className="lightbox__native"
            style={visW && visH ? { width: visW, height: visH } : undefined}
          >
            <img
              ref={imgRef}
              src={current.src}
              alt={current.label || 'Photo'}
              width={nat.w || undefined}
              height={nat.h || undefined}
              draggable={false}
              decoding="sync"
              onLoad={onImgLoad}
              style={
                nat.w
                  ? {
                      width: nat.w,
                      height: nat.h,
                      maxWidth: 'none',
                      maxHeight: 'none',
                      transform: scale === 1 ? undefined : `scale(${scale})`,
                      transformOrigin: 'top left',
                    }
                  : { maxWidth: 'none', maxHeight: 'none' }
              }
            />
          </div>
        </div>
      </div>
      {current.label && <p className="lightbox__caption">{current.label}</p>}
      <p className="lightbox__hint">
        100% = original pixels · pinch / scroll to zoom · drag to pan
      </p>
    </div>
  );
}
