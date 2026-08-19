export const CATALOG_CHANGED = 'catalog-changed';

export function notifyCatalogChanged(): void {
  window.dispatchEvent(new Event(CATALOG_CHANGED));
}

export function onCatalogChanged(fn: () => void): () => void {
  window.addEventListener(CATALOG_CHANGED, fn);
  return () => window.removeEventListener(CATALOG_CHANGED, fn);
}
