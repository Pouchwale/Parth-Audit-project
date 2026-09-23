// Storage abstraction. Everything above this line (repositories, engine,
// components) only ever talks to `IStorageAdapter` — never to the database or
// REST directly. The data itself lives in PostgreSQL (backend/db.ts,
// REQUIREMENTS §55): what is read here is this browser's working copy, loaded
// from the database at sign-in, and every write is sent on to the database by
// data/serverSync.ts. See DATA_MODEL.md.
import { NAMESPACE, noteLocalRemove, noteLocalWrite, onServerChange } from "./serverSync";
export interface IStorageAdapter {
  getItem(key: string): string | null;
  /** False when the value could not be stored (e.g. the browser's quota is full). */
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
  keys(): string[];
}


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
      noteLocalWrite(key);
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
      noteLocalRemove(key);
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

// Checks that the browser's storage can be reached at all — not that there is
// room in it: a full store is still the working copy, and a write that does not
// fit says so (StorageFullBanner) instead of the app silently running on a
// copy nothing is sent from. When storage is blocked outright, signing in stops
// with a message instead (data/serverSync.ts).
function detectAdapter(): IStorageAdapter {
  try {
    const ls = window.localStorage;
    if (!ls) throw new Error("no localStorage");
    ls.getItem("__dcrs_test__");
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

// PARSED ONCE PER STORED VALUE, not once per read (REQUIREMENTS §65), in the
// manner of data/formatEdits.ts. The documents list, the master data and the
// HR master sheet are asked for dozens of times per screen — once per line of
// a report, once per reminder — and each of those was a JSON.parse of the whole
// item. The copy is remembered against the RAW STRING it was parsed from, and
// that string is read from storage on every call: whatever replaced the item —
// a save here, another tab, a colleague's work brought in from the database, a
// different person signing in — is a different string, and is parsed afresh.
// So it can never answer with anything but what is stored now.
//
// Every caller is handed the SAME object, so it must never be changed in place:
// it is frozen all the way down, and a change made to it throws where it is
// made instead of quietly showing every later reader something that was never
// stored. Whoever means to change what it read (an upsert, an ensureSeeded)
// uses readJSON and gets a copy of its own.
const parsedItems = new Map<string, { raw: string; value: unknown }>();

function frozen<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) frozen(inner);
  }
  return value;
}

/** As readJSON, for a value that is only READ: the same frozen object until the stored value changes. */
export function readJSONCached<T>(key: string, fallback: T): T {
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  const hit = parsedItems.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  try {
    const value = frozen(JSON.parse(raw) as T);
    parsedItems.set(key, { raw, value });
    return value;
  } catch {
    console.error(`Corrupt JSON in storage key "${key}" — using fallback.`);
    return fallback;
  }
}

/** Returns false when the value could not be stored. */
export function writeJSON<T>(key: string, value: T): boolean {
  return storage.setItem(key, JSON.stringify(value));
}

/** As writeJSON, for a caller that has already made the JSON itself (data/repositories/recordRepository.ts). */
export function writeText(key: string, text: string): boolean {
  return storage.setItem(key, text);
}

// THE WORKING COPY IS NEARLY AS LARGE AS THE BROWSER ALLOWS (REQUIREMENTS §65).
// A browser gives a site about five million characters of localStorage, and a
// year of records comes close to that. Past it, a save does not fit
// (STORAGE_WRITE_FAILED) and, at the next sign-in, the working copy cannot be
// loaded at all. So the size is added up ONCE, when the app has started
// (main.tsx) — no timer — and above the mark the banner that reports a failed
// save says so months before the wall, while there is still time to archive.
// Everything the browser counts is counted: every item's name and value.
export const STORAGE_NEARLY_FULL = "dcrs:storage-nearly-full";
const NEARLY_FULL_CHARS = 4_000_000;
let nearlyFull = false;

/** Whether the last measurement found the working copy close to the browser's limit (components/common/StorageFullBanner.tsx). */
export const storageNearlyFull = (): boolean => nearlyFull;

/** Adds up what this browser holds for the app and raises the banner when it is close to the limit. Returns the characters counted. */
export function measureWorkingCopy(): number {
  let chars = 0;
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const name = ls.key(i);
      if (name !== null) chars += name.length + (ls.getItem(name)?.length ?? 0);
    }
  } catch {
    return 0; // no localStorage (in-memory fallback): there is no limit to be near
  }
  nearlyFull = chars > NEARLY_FULL_CHARS;
  if (nearlyFull) {
    console.warn(`The working copy in this browser is ${chars.toLocaleString("en-IN")} characters — close to what the browser allows.`);
    try {
      window.dispatchEvent(new Event(STORAGE_NEARLY_FULL));
    } catch {
      /* no window (tests) */
    }
  }
  return chars;
}

/**
 * Calls `onChange` when something other than this page changed stored data:
 * ANOTHER tab of the app (the browser only sends `storage` events to the other
 * tabs), or another person's work brought in from the database
 * (data/serverSync.ts). `key` is the app's key without the namespace, or null
 * when everything may have changed.
 */
export function onExternalChange(onChange: (key: string | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === null) onChange(null);
    else if (e.key.startsWith(NAMESPACE)) onChange(e.key.slice(NAMESPACE.length));
  };
  window.addEventListener("storage", handler);
  const stopServer = onServerChange(onChange);
  return () => {
    window.removeEventListener("storage", handler);
    stopServer();
  };
}
