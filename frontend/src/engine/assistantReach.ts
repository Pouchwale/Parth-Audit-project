import { assistantConfigured } from "./features";

// CAN MITRA'S MODEL BE REACHED RIGHT NOW? (REQUIREMENTS §72)
//
// The plant noticed that the assistant answered perfectly with the internet
// switched off, and asked why it was not using the API. It was not: the app
// answered every question from its own tables first (engine/assistantLocal.ts)
// and only fell through to the model for what those tables could not handle.
// The tables are good, and offline they are all there is — but a person could
// not tell which of the two had answered, and that is the part that was wrong.
//
// So now the MODEL answers, and this module is what says whether it can be
// asked. Three things can stop it:
//
//   1. THE BROWSER IS OFFLINE. navigator.onLine is a hint, not a promise — it
//      says the machine has a network, not that Groq is reachable — so it is
//      used only to skip a request that is certain to fail, never as proof
//      that one will succeed.
//   2. THE SERVER HAS NO KEY. Then there is no model at all, for anybody, and
//      saying "no internet" would be a lie. The server says so with the other
//      feature flags (backend/features.ts → engine/features.ts).
//   3. A REQUEST JUST FAILED. Asking again immediately would make every
//      message wait for the same timeout, so a failure is remembered — but
//      only for a short while, and it is forgotten the moment the browser
//      says it is back online. A network that comes back must not need a
//      reload to be noticed.

/** Why the model could not be asked — what the person is told, in the app's own words. */
export type Unreachable = "offline" | "not-configured" | "failed";

const RETRY_AFTER_MS = 20_000;

let failedAt = 0;
let lastReason: Unreachable | null = null;
let installed = false;

/** The machine's own answer, treated as a hint. `undefined` in a non-browser context. */
const browserOnline = (): boolean => (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean" ? true : navigator.onLine);

function install(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // Back online: forget the failure at once rather than making the next
  // message serve out the rest of the cool-off.
  window.addEventListener("online", () => {
    failedAt = 0;
    lastReason = null;
  });
  window.addEventListener("offline", () => {
    lastReason = "offline";
  });
}

/**
 * WHETHER TO ASK THE MODEL. When this says no, the caller answers from the
 * app's own tables and SAYS SO — the answer is never passed off as the
 * model's (that is the whole complaint this module exists for).
 */
export function modelReachable(): { ok: true } | { ok: false; why: Unreachable } {
  install();
  if (!assistantConfigured()) return { ok: false, why: "not-configured" };
  if (!browserOnline()) return { ok: false, why: "offline" };
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return { ok: false, why: lastReason ?? "failed" };
  return { ok: true };
}

/**
 * A request to the model failed. Remembered briefly so the next few messages
 * are answered at once instead of each waiting for the same timeout. If the
 * browser says it is offline, that is the honest reason to give.
 */
export function noteModelFailed(): Unreachable {
  install();
  failedAt = Date.now();
  lastReason = browserOnline() ? "failed" : "offline";
  return lastReason;
}

/** The model answered: whatever was wrong is over. */
export function noteModelAnswered(): void {
  failedAt = 0;
  lastReason = null;
}

/** For the tests and for the composer's own pill. */
export function lastUnreachableReason(): Unreachable | null {
  return lastReason;
}
