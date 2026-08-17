import type { ThumbSize } from './DeviceList';

interface Props {
  value: ThumbSize;
  onChange: (size: ThumbSize) => void;
  label?: string;
}

export function PhotoSizeToggle({ value, onChange, label = 'Photo size' }: Props) {
  return (
    <div className="thumb-size-row">
      <span className="field__label">{label}</span>
      <div className="thumb-size-toggle" role="group" aria-label={label}>
        {(
          [
            ['small', 'S', 'Small'],
            ['medium', 'M', 'Medium'],
            ['large', 'L', 'Large'],
          ] as const
        ).map(([size, short, title]) => (
          <button
            key={size}
            type="button"
            title={title}
            aria-label={title}
            className={`thumb-size-toggle__btn ${value === size ? 'is-active' : ''}`}
            onClick={() => onChange(size)}
          >
            {short}
          </button>
        ))}
      </div>
    </div>
  );
}
