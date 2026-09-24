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
  waiting.push({ action, target, detail, department: documentId ? (departmentOfDocument(documentId) ?? "") : "", ...(documentId ? { documentId } : {}) });
  if (waiting.length > MAX_WAITING) waiting = waiting.slice(-MAX_WAITING);
  if (timer === null) timer = window.setTimeout(() => flush(), FLUSH_AFTER_MS);
}
