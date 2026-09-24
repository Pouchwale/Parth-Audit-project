import { departmentOfDocument } from "../data/seed/documentDepartments";

// THE ACTIVITY LOG, FROM THE BROWSER'S SIDE (REQUIREMENTS §62).
//
// Everything a person does on the portal is one line in the server's
// activity_log table (backend/db.ts): opening a document or a record, writing
// on it, submitting, verifying, sending back, correcting, deleting, printing,
// downloading, changing a format. Signing in and out, accounts and department
// access are written by the server itself, which is where they happen.
//
// A line says WHAT was done and to WHAT; WHO and WHEN are stamped by the
// server from the session, so a browser cannot write a line in somebody
// else's name or at another time. Lines are sent a moment after they happen,
// several together, and on the way out of the page; one that cannot be sent is
// tried again with the next, and the thing it describes is never held up by it.
// Nothing is kept in the browser's storage: the log lives in PostgreSQL only.
//
// SENT AGAIN, WRITTEN ONCE (REQUIREMENTS §75). "Could not be sent" is not
// always true: the lines may have been written and only the answer lost — the
// connection dropped after the server saved them. Each line is therefore given
// an id of its own when it is queued (clientId, a random UUID), and keeps it
// through every retry; the server writes a line whose id it already has no
// second time (backend/db.ts insertActivity).

export interface ActivityEvent {
  action: string;
  target?: string;
  detail?: string;
  /** Department code of the document concerned, so a department's account can read its own lines. */
  department?: string;
  /**
   * The document itself (REQUIREMENTS §75). The server works the department
   * out from it with the same rule it scopes records by, so a line is filed
   * under its department even where this browser's map does not name the
   * document — which is how every Purchase, Store and Dispatch line came to be
   * filed under no department at all.
   */
  documentId?: string;
  /** Made once, when the line is queued, and sent with it every time — so a resent line is written once. */
  clientId?: string;
}

/**
 * A random UUID for a line. crypto.randomUUID exists only on a secure page
 * (https, or localhost) — and the plant opens the portal over its own network,
 * by address, on plain http — so the same kind of id is also made from
 * crypto.getRandomValues, which every browser has on any page. A browser with
 * neither sends the line without one; it is still written.
 */
export function newClientId(): string | undefined {
  const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
  if (!c) return undefined;
  if (typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      /* not a secure page after all: made by hand below */
    }
  }
  if (typeof c.getRandomValues !== "function") return undefined;
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // the RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const FLUSH_AFTER_MS = 1200;
const MAX_BATCH = 50;
const MAX_WAITING = 400;

let waiting: ActivityEvent[] = [];
let timer: number | null = null;
let installed = false;

function send(events: ActivityEvent[], leaving: boolean): void {
  const body = JSON.stringify({ events });
  if (leaving && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon("/api/activity", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/activity", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body, keepalive: true })
    .then((res) => {
      // Signed out meanwhile: there is nobody to write these lines as.
      if (!res.ok && res.status !== 401 && res.status !== 400) waiting = [...events, ...waiting].slice(0, MAX_WAITING);
    })
    .catch(() => {
      waiting = [...events, ...waiting].slice(0, MAX_WAITING);
    });
}

function flush(leaving = false): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  while (waiting.length > 0) {
    const batch = waiting.slice(0, MAX_BATCH);
    waiting = waiting.slice(MAX_BATCH);
    send(batch, leaving);
    if (!leaving) break;
  }
  if (waiting.length > 0 && !leaving) timer = window.setTimeout(() => flush(), FLUSH_AFTER_MS);
}

/** One line for the activity log. `documentId` gives the line its department. */
export function logActivity(action: string, target = "", detail = "", documentId?: string): void {
  if (typeof window === "undefined") return;
  if (!installed) {
    installed = true;
    window.addEventListener("pagehide", () => flush(true));
  }
  const clientId = newClientId();
  waiting.push({ action, target, detail, department: documentId ? (departmentOfDocument(documentId) ?? "") : "", ...(documentId ? { documentId } : {}), ...(clientId ? { clientId } : {}) });
  if (waiting.length > MAX_WAITING) waiting = waiting.slice(-MAX_WAITING);
  if (timer === null) timer = window.setTimeout(() => flush(), FLUSH_AFTER_MS);
}
