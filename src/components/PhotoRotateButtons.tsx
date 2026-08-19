interface Props {
  disabled?: boolean;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  size?: 'small' | 'large';
}

function IconRotateLeft() {
  return (
    <svg
      className="photo-rotate-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M7.34 6.41 5.93 5 2 8.93l3.93 3.93 1.41-1.41L6.41 10H13a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5.92 5.92 0 0 1-3.45-1.11l-1.06 1.06A7.48 7.48 0 0 0 13 22a7 7 0 0 0 0-14H6.41l.93-.93z"
      />
    </svg>
  );
}

function IconRotateRight() {
  return (
    <svg
      className="photo-rotate-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M16.66 6.41 18.07 5 22 8.93l-3.93 3.93-1.41-1.41L17.59 10H11a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5.92 5.92 0 0 0 3.45-1.11l1.06 1.06A7.48 7.48 0 0 1 11 22a7 7 0 0 1 0-14h6.59l-.93-.93z"
      />
    </svg>
  );
}

export function PhotoRotateButtons({
  disabled,
  onRotateLeft,
  onRotateRight,
  size = 'small',
}: Props) {
  const cls =
    size === 'small' ? 'btn btn--ghost btn--small photo-rotate-btn' : 'btn btn--ghost btn--large photo-rotate-btn';

  return (
    <div className="photo-rotate-btns">
      <button
        type="button"
        className={cls}
        title="Rotate left 90°"
        aria-label="Rotate left 90 degrees"
        disabled={disabled}
        onClick={onRotateLeft}
      >
        <IconRotateLeft />
      </button>
      <button
        type="button"
        className={cls}
        title="Rotate right 90°"
        aria-label="Rotate right 90 degrees"
        disabled={disabled}
        onClick={onRotateRight}
      >
        <IconRotateRight />
      </button>
    </div>
  );
}
