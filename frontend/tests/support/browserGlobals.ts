// THE BROWSER THE APP EXPECTS, STOOD UP IN NODE FOR THE UNIT TESTS.
//
// The engine and the repositories were written for a browser: every
// repository reads and writes through data/storageAdapter.ts, which looks for
// window.localStorage the moment it is loaded, and a few modules dispatch
// events on window (a failed write, a sync state). Node has neither, so
// without this the adapter falls back to its in-memory copy with a warning —
// and the tests would be exercising a different storage class from the one
// every person in the plant runs.
//
// scripts/unit-tests.ts injects this file into every test bundle ahead of the
// app's own modules, so it has run before storageAdapter.ts decides which
// adapter to use. Each test file runs in a process of its own (node --test),
// so every file starts with an empty store, the way a fresh browser does.
// Nothing here is ever written to disk: PostgreSQL stays the only store
// (REQUIREMENTS §55), and a test's records vanish with its process.

class MemoryStorage {
  private readonly items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.has(key) ? this.items.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
}

function define(name: string, value: unknown): void {
  // Replaced outright rather than left alone when present: a Node that ships
  // its own experimental Web Storage keeps it in a file, and a test must never
  // leave anything behind or read what an earlier run left.
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

const events = new EventTarget();
const scope = globalThis as unknown as Record<string, unknown>;

define("localStorage", new MemoryStorage());
define("sessionStorage", new MemoryStorage());
// window IS the global object in a browser, so window.setTimeout, window.localStorage
// and a bare localStorage are the same things here too.
define("window", globalThis);
if (typeof scope.addEventListener !== "function") define("addEventListener", events.addEventListener.bind(events));
if (typeof scope.removeEventListener !== "function") define("removeEventListener", events.removeEventListener.bind(events));
if (typeof scope.dispatchEvent !== "function") define("dispatchEvent", events.dispatchEvent.bind(events));

export {};
