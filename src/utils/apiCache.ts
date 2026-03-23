// src/utils/apiCache.ts
export function setCached<T>(key: string, value: T): void {
  const item = { ts: Date.now(), value };
  try {
    localStorage.setItem(key, JSON.stringify(item));
  } catch (e) {
    console.error('Failed to set cache:', e);
  }
}

export function getCached<T>(key: string, ttlSec = 60): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, value } = JSON.parse(raw);
    if ((Date.now() - ts) / 1000 > ttlSec) {
      localStorage.removeItem(key);
      return null;
    }
    return value as T;
  } catch {
    return null;
  }
}
// Refresh 03/17/2026 00:21:40
