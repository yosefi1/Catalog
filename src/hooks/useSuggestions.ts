import { useEffect, useState } from 'react';
import { getSuggestions } from '../db/suggestions';

type Field =
  | 'location'
  | 'room'
  | 'area'
  | 'owner'
  | 'manufacturer'
  | 'deviceType';

export function useSuggestions(field: Field, query: string): string[] {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void getSuggestions(field, query).then((list) => {
        if (!cancelled) setItems(list);
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [field, query]);

  return items;
}
