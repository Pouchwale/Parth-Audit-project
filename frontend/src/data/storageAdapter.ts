// Storage abstraction. Everything above this line (repositories, engine,
// components) only ever talks to `IStorageAdapter` — never to
// localStorage/SQLite/REST directly. That keeps the promise in
// TECHNICAL REQUIREMENTS: swap `LocalStorageAdapter` for a real DB-backed
// adapter later without touching the rest of the app. See DATA_MODEL.md.
export interface IStorageAdapter {
  getItem(key: string): string | null;
  /** False when the value could not be stored (e.g. the browser's quota is full). */
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
  keys(): string[];
}

const NAMESPACE = "dcrs:v1:"; // Digital Controlled Record System

/** Fired on window when a write fails — see components/common/StorageFullBanner.tsx. */
export const STORAGE_WRITE_FAILED = "dcrs:storage-write-failed";

function announceWriteFailure(): void {
  try {
    window.dispatchEvent(new Event(STORAGE_WRITE_FAILED));
  } catch {
    /* no window (tests) */
  }
}

export class LocalStorageAdapter implements IStorageAdapter {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(NAMESPACE + key);
    } catch {
      return null;
    }
  }
  setItem(key: string, value: string): boolean {
    try {
      window.localStorage.setItem(NAMESPACE + key, value);
      return true;
    } catch (err) {
      // Logging alone left the screen showing a change that was never
      // stored, and lost it on the next reload with nothing said. The caller
      // now learns it failed, and the page tells the user.
      console.error("Storage write failed (quota exceeded?)", err);
      announceWriteFailure();
      return false;
    }
  }
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(NAMESPACE + key);
    } catch {
      /* noop */
    }
  }
  keys(): string[] {
    try {
      const out: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(NAMESPACE)) out.push(k.slice(NAMESPACE.length));
      }
      return out;
    } catch {
      return [];
    }
  }
}

// In-memory fallback (used automatically if localStorage is unavailable, e.g.
// private browsing edge cases, or for tests).
export class MemoryStorageAdapter implements IStorageAdapter {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): boolean {
    this.map.set(key, value);
    return true;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return Array.from(this.map.keys());
  }
}

function detectAdapter(): IStorageAdapter {
  try {
    const testKey = "__dcrs_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return new LocalStorageAdapter();
  } catch {
    console.warn("localStorage unavailable — falling back to in-memory storage (data will not persist).");
    return new MemoryStorageAdapter();
  }
}

export const storage: IStorageAdapter = detectAdapter();

export function readJSON<T>(key: string, fallback: T): T {
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.error(`Corrupt JSON in storage key "${key}" — using fallback.`);
    return fallback;
  }
}

/** Returns false when the value could not be stored. */
export function writeJSON<T>(key: string, value: T): boolean {
  return storage.setItem(key, JSON.stringify(value));
}

/**
 * Calls `onChange` when ANOTHER tab of the app writes to storage (the browser
 * only sends `storage` events to the other tabs). `key` is the app's key
 * without the namespace, or null when that tab cleared storage altogether.
 */
export function onExternalChange(onChange: (key: string | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === null) onChange(null);
    else if (e.key.startsWith(NAMESPACE)) onChange(e.key.slice(NAMESPACE.length));
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
