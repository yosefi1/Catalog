import { useEffect } from 'react';

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

export function PhotoLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: Props) {
  const current = images[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') {
        onIndexChange((index - 1 + images.length) % images.length);
      }
      if (e.key === 'ArrowRight') {
        onIndexChange((index + 1) % images.length);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onClose, onIndexChange]);

  if (!current) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="lightbox__inner" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox__close" onClick={onClose}>
          Close
        </button>
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
        <img src={current.src} alt={current.label || 'Photo'} />
        {current.label && <p className="lightbox__caption">{current.label}</p>}
      </div>
    </div>
  );
}
