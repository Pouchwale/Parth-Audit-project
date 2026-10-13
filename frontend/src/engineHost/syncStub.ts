// THE WORKING COPY, AS THE SERVER'S ENGINE HOST HOLDS IT (REQUIREMENTS §85).
//
// In a browser, data/serverSync.ts keeps the working copy (localStorage) in
// step with PostgreSQL: it loads it at sign-in, sends each write a moment
// later, and pulls in other people's work. When DCRS's engine runs on the
// server for the Mitra mobile app (backend/engineHost.ts), the host itself
// loads the stored items for each request and writes back only what the
// request changed, with the version it read. So the bundle the host builds
// puts THIS file in the place of data/serverSync.ts: the same names
// storageAdapter.ts imports, none of which sends anything — and a way for the
// host to tell the repositories that it has loaded new items (announceLoad),
// which is what the real module does when another person's work arrives.

export const NAMESPACE = "dcrs:v1:";
export const SYNC_STATE_EVENT = "dcrs:sync-state";
export const SESSION_ENDED_EVENT = "dcrs:session-ended";

const listeners = new Set<(key: string | null) => void>();
const written = new Set<string>();

/** Called when the working copy was replaced from the database — here, when the host loads a request's items. */
export function onServerChange(listener: (key: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** storageAdapter.ts: an item was written. Only noted — the host decides what is stored. */
export function noteLocalWrite(key: string): void {
  written.add(key);
}

/** storageAdapter.ts: an item was removed. Only noted. */
export function noteLocalRemove(key: string): void {
  written.add(key);
}

// What does not fit in a browser is held in its page's memory (data/serverSync.ts, REQUIREMENTS §93). The host's
// working copy is in memory already, and every write fits, so nothing is ever held here.
export function heldCopy(_key: string): string | null {
  return null;
}

export function holdChange(_key: string, _value: string): boolean {
  return false;
}

export function releaseHeld(_key: string): void {
  /* nothing is held */
}

export function syncState(): { pending: number; failing: boolean; active: boolean } {
  return { pending: 0, failing: false, active: false };
}

export const syncableKey = (key: string): boolean => key.length > 0;

// The rest of what data/serverSync.ts exports — the sign-in state (store/AuthContext.tsx)
// is bundled with the i18n it shares a module with — none of which ever runs here.
export type SyncErrorKind = "unreachable" | "signed-out" | "no-room" | "storage-disabled";

export class SyncError extends Error {
  kind: SyncErrorKind;
  constructor(kind: SyncErrorKind, message: string) {
    super(message);
    this.name = "SyncError";
    this.kind = kind;
  }
}

export function startServerSync(_userId: string): Promise<void> {
  return Promise.resolve();
}

export function stopServerSync(): Promise<void> {
  return Promise.resolve();
}

/** The host loaded new items: every repository drops what it had parsed (recordRepository's cache). */
export function announceLoad(): void {
  written.clear();
  for (const listener of listeners) listener(null);
}

/** The items the engine wrote since the last load, for the host's own checks. */
export function writtenSinceLoad(): string[] {
  return [...written];
}
