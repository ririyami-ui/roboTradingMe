// src/utils/apiCache.js
export function setCached(key, value) {
  const item = { ts: Date.now(), value };
  try { localStorage.setItem(key, JSON.stringify(item)); } catch {}
}

export function getCached(key, ttlSec = 60) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, value } = JSON.parse(raw);
    if ((Date.now() - ts) / 1000 > ttlSec) {
      localStorage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
