// THIS BROWSER, AS THE SIGN-IN NAMES IT (REQUIREMENTS §106).
//
// Every account may be signed in on at most two devices (DCRS_MAX_DEVICES), and a device that signs in again takes
// its own place rather than a second one. So the server has to know one browser from another: the website sends a
// random id it keeps here, made once, with the sign-in (store/AuthContext.tsx login), and how many touch points the
// screen has (an iPad asking for the desktop site says it is a Mac; only its touch screen tells it apart). The name
// and the category (computer, mobile or tablet) the server works out itself, from the browser's own words
// (backend/deviceSessions.ts describeUserAgent).
//
// KEPT OUTSIDE THE dcrs:v1: NAMESPACE, so emptying the app's working copy (data/storageAdapter.ts, the browser's room
// made again) leaves the device the same device. The id says nothing about the person or the computer: it is random.
// Where the browser keeps nothing (a private window, storage switched off), the id lives as long as the page, which is
// still one device for every sign-in made from it.

const KEY = "dcrs-device-id";
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

let inMemory: string | null = null;

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* an old browser, or an insecure origin: made below */
  }
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** This browser's own id, made once and kept. */
export function browserDeviceId(): string {
  if (inMemory) return inMemory;
  try {
    const kept = window.localStorage.getItem(KEY);
    if (kept && ID_RE.test(kept)) {
      inMemory = kept;
      return kept;
    }
  } catch {
    /* storage refused: the page's own id below */
  }
  const made = randomId();
  inMemory = made;
  try {
    window.localStorage.setItem(KEY, made);
  } catch {
    /* kept for this page only */
  }
  return made;
}

/** What the sign-in says of this browser: its id, and how many touch points its screen has. */
export function browserDevice(): { id: string; touchPoints: number } {
  let touchPoints = 0;
  try {
    touchPoints = typeof navigator !== "undefined" && typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
  } catch {
    touchPoints = 0;
  }
  return { id: browserDeviceId(), touchPoints };
}
