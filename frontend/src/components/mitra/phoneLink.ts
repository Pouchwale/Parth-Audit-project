// MITRA ON YOUR PHONE: WHERE A PHONE FINDS IT (2-Oct-2026, components/mitra/MitraPhoneCard.tsx).
//
// The plant's phones, Android and iPhone, run the Mitra app in Expo Go, served
// by Expo's own server on the PC that runs DCRS. Expo Go opens an address of the
// form exp://<host>:<port>: the server PC's address on the company network, and
// the port Expo's server listens on (8081 unless the server says otherwise).
//
// THE HOST is the one this page was opened from, which a phone on the same
// network reaches too — unless the page was opened as "localhost" on the server
// itself, which no phone can reach. Then the server's own answer (GET
// /api/phone-app: { expoGo: { port, running }, mitraServer: { port, running },
// addresses: [{ ip, interface }] }) names the PC's network addresses, and the
// first is used. THE PORT is the one that answer gives, else 8081. When the route
// is missing (404) or fails, the browser's host and 8081 stand, and nothing is
// claimed about whether the phone app is running.
//
// The QR code is drawn from that address by lean-qr (MIT, no dependencies): its
// modules as one SVG path, with the four-module quiet zone the standard asks for.
import { correction, generate } from "lean-qr";
import { toSvgPath } from "lean-qr/extras/svg";

/** The port Expo's development server listens on unless told otherwise. */
export const EXPO_GO_PORT = 8081;
/** The blank border every QR code needs around it, in modules (ISO/IEC 18004). */
export const QR_QUIET_ZONE = 4;
/** How long the server is given to say where the phone app is before the browser's own host is used. */
export const PHONE_APP_WAIT_MS = 4000;

/** The server's answer to GET /api/phone-app, as far as it could be read. */
export interface PhoneAppAnswer {
  expoGo: { port: number | null; running: boolean | null };
  addresses: string[];
}

/** What the card shows: the address to open, and what is known about it. */
export interface PhoneTarget {
  /** exp://host:port — what the QR code holds. */
  url: string;
  host: string;
  port: number;
  /** false: the server says the phone app is not running; null: nobody said. */
  running: boolean | null;
  /** false when the host is this computer's own name, which a phone cannot open. */
  reachable: boolean;
}

/** localhost, 127.x.x.x, ::1 and the like: a name only this computer answers to. */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0" || /^127(\.\d{1,3}){3}$/.test(h);
}

const portOf = (n: unknown): number | null => (typeof n === "number" && Number.isInteger(n) && n > 0 && n < 65536 ? n : null);

/** The route's answer, read defensively: anything missing or malformed counts as not said. */
export function readPhoneAppAnswer(body: unknown): PhoneAppAnswer | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { expoGo?: unknown; addresses?: unknown };
  const expo = b.expoGo && typeof b.expoGo === "object" ? (b.expoGo as { port?: unknown; running?: unknown }) : {};
  const addresses = Array.isArray(b.addresses)
    ? b.addresses
        .map((a) => (a && typeof a === "object" && typeof (a as { ip?: unknown }).ip === "string" ? (a as { ip: string }).ip.trim() : ""))
        .filter((ip) => ip.length > 0)
    : [];
  return { expoGo: { port: portOf(expo.port), running: typeof expo.running === "boolean" ? expo.running : null }, addresses };
}

/** An IPv6 address goes into a URL in brackets. */
const hostForUrl = (host: string): string => (host.includes(":") && !host.startsWith("[") ? `[${host}]` : host);

/** The address a phone opens, from the host this page was opened on and the server's answer (null: no answer). */
export function phoneTarget(browserHost: string, answer: PhoneAppAnswer | null): PhoneTarget {
  const port = answer?.expoGo.port ?? EXPO_GO_PORT;
  let host = browserHost.trim();
  if (!host || isLoopbackHost(host)) {
    const network = answer?.addresses.find((ip) => !isLoopbackHost(ip));
    if (network) host = network;
  }
  if (!host) host = "localhost";
  return { url: `exp://${hostForUrl(host)}:${port}`, host, port, running: answer?.expoGo.running ?? null, reachable: !isLoopbackHost(host) };
}

/** Asks the server where the phone app is. A missing route (404), a refusal or no answer in time: null. */
export async function fetchPhoneApp(fetchImpl: typeof fetch = fetch, waitMs = PHONE_APP_WAIT_MS): Promise<PhoneAppAnswer | null> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), waitMs) : null;
  try {
    const res = await fetchImpl("/api/phone-app", { credentials: "include", headers: { Accept: "application/json" }, ...(controller ? { signal: controller.signal } : {}) });
    if (!res.ok) return null;
    return readPhoneAppAnswer(await res.json());
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The QR code for a piece of text: its width in modules and its dark modules as one SVG path. Null if it cannot be made. */
export function qrArt(text: string): { size: number; path: string } | null {
  try {
    const code = generate(text, { minCorrectionLevel: correction.M });
    return { size: code.size, path: toSvgPath(code) };
  } catch {
    return null;
  }
}
