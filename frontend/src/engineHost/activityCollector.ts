import { departmentOfDocument } from "../data/seed/documentDepartments";

// THE ACTIVITY LOG, AS THE SERVER'S ENGINE HOST HEARS IT (REQUIREMENTS §85).
//
// In a browser, utils/activityLog.ts queues each line and sends it to
// POST /api/activity, where the server stamps who and when. When DCRS's engine
// runs on the server itself for the Mitra mobile app (backend/engineHost.ts),
// there is no page to send from: the bundle the host builds puts THIS file in
// the place of utils/activityLog.ts, so every line the engine writes — "Record
// edited through Mitra", "Record submitted for verification", "Record deleted"
// — is kept here instead, word for word, and the host writes it into the
// activity log in the person's name, with "Through <client>" before its detail.
//
// The same exports as utils/activityLog.ts, so the engine's modules import it
// unchanged. Nothing here sends anything.

export interface ActivityEvent {
  action: string;
  target?: string;
  detail?: string;
  department?: string;
  documentId?: string;
  clientId?: string;
}

/** No id is needed: the host writes each line once, itself. */
export function newClientId(): string | undefined {
  return undefined;
}

let heard: ActivityEvent[] = [];

/** One line for the activity log, kept until the host takes it. */
export function logActivity(action: string, target = "", detail = "", documentId?: string): void {
  heard.push({ action, target, detail, department: documentId ? (departmentOfDocument(documentId) ?? "") : "", ...(documentId ? { documentId } : {}) });
}

/** Every line written since the last call, in the order written. */
export function drainActivity(): ActivityEvent[] {
  const out = heard;
  heard = [];
  return out;
}
