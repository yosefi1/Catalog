const STORAGE_KEY = 'catalogAccessKey';

export function getAccessKey(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAccessKey(key: string): void {
  sessionStorage.setItem(STORAGE_KEY, key.trim());
}

export function clearAccessKey(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function hasAccessKey(): boolean {
  return getAccessKey().length > 0;
}
