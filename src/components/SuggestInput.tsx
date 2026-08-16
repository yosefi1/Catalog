import { useId, useState, type InputHTMLAttributes } from 'react';
import { useSuggestions } from '../hooks/useSuggestions';

type Field =
  | 'location'
  | 'room'
  | 'area'
  | 'owner'
  | 'manufacturer'
  | 'deviceType';

interface Props {
  label: string;
  field: Field;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  enterKeyHint?: InputHTMLAttributes<HTMLInputElement>['enterKeyHint'];
}

export function SuggestInput({
  label,
  field,
  value,
  onChange,
  placeholder,
  autoComplete = 'off',
  enterKeyHint,
}: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const suggestions = useSuggestions(field, value);
  const [open, setOpen] = useState(false);

  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className="field__input"
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        enterKeyHint={enterKeyHint}
        list={listId}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {open && suggestions.length > 0 && (
        <ul className="suggest-list" role="listbox">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="suggest-list__item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
