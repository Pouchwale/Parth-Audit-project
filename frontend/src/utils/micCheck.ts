// THE MICROPHONE NEEDS A SECURE ADDRESS (REQUIREMENTS §80).
//
// A browser lends a page the microphone only on a secure address: https, or
// http://localhost on the computer itself. Opened over the LAN as
// http://192.168.x.x:port there is no navigator.mediaDevices at all, so the
// recorder (utils/recorder.ts) and the browser's own recognition
// (utils/speech.ts) fail before anyone is asked — and the page used to say the
// permission was BLOCKED and to allow it, which nobody can do. This check tells
// the two apart, so the words say what to actually do.
//
// DCRS ANSWERS ON A SECURE ADDRESS OF ITS OWN (the owner, 23-Oct-2026: "when i
// deployed it locally microphone is unable to start ... fix it any how"):
// https://<the same computer>:<port + 443>, on its own certificate
// (backend/secureAddress.ts). On the http address the words name it, and the
// microphone's message offers a button that opens the same page there; the
// first time on a computer the browser may warn once that the address is not
// private (docs/DEPLOYMENT.md: install the plant's certificate, and it never does).
//
// Written in English and Gujarati through the interface strings
// (i18n/strings.ts "ai.voiceInsecure", "ai.voiceSecureAddress") and in Hindi
// (i18n/hindi.ts), since people speak to Mitra in all three (REQUIREMENTS §89).
import { t } from "../i18n";
import { HINDI } from "../i18n/hindi";

/** The few things of a window this check reads — a test passes a fake one. */
export interface MicWindow {
  isSecureContext?: boolean;
  navigator?: { mediaDevices?: unknown };
  location?: { port?: string; protocol?: string; hostname?: string; hash?: string };
}

function liveWindow(): MicWindow | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as MicWindow);
}

/** True when the page's address keeps the microphone out of reach (not a secure context, so no mediaDevices). */
export function micNeedsSecureAddress(win: MicWindow | undefined = liveWindow()): boolean {
  if (!win) return false;
  return win.isSecureContext === false || !win.navigator?.mediaDevices;
}

/** The port this DCRS is served on, for the localhost address the words suggest. */
export function dcrsPort(win: MicWindow | undefined = liveWindow()): string {
  const port = win?.location?.port;
  if (port) return port;
  return win?.location?.protocol === "https:" ? "443" : "80";
}

/** Where this DCRS's secure address answers (GET /api/secure-address, backend/secureAddress.ts). */
export interface SecureAddress {
  port: number | null;
  certificate: string | null;
}

let known: SecureAddress | null = null;
let asking: Promise<SecureAddress | null> | null = null;

/**
 * Asks the server once where its secure address is — only on an address where the microphone needs it (on
 * localhost or https nothing is asked). Kept for the page's life; null when the server has none.
 */
export function loadSecureAddress(
  win: MicWindow | undefined = liveWindow(),
  get: typeof fetch | undefined = typeof fetch === "undefined" ? undefined : fetch,
): Promise<SecureAddress | null> {
  if (known) return Promise.resolve(known);
  if (!micNeedsSecureAddress(win) || !get) return Promise.resolve(null);
  asking ??= get("/api/secure-address", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<Partial<SecureAddress>>) : null))
    .then((a) => {
      known = a && typeof a.port === "number" && a.port > 0 ? { port: a.port, certificate: typeof a.certificate === "string" ? a.certificate : null } : null;
      return known;
    })
    .catch(() => null)
    .finally(() => {
      asking = null;
    });
  return asking;
}

/** What loadSecureAddress found (a test sets it). */
export function setSecureAddress(address: SecureAddress | null): void {
  known = address;
}

/** The same page on the secure address — https://<this computer>:<secure port>/#<page> — or null while it is not known. */
export function secureAddressUrl(win: MicWindow | undefined = liveWindow(), address: SecureAddress | null = known): string | null {
  const host = win?.location?.hostname;
  if (!address?.port || !host) return null;
  const shownHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `https://${shownHost}:${address.port}/${win?.location?.hash ?? ""}`;
}

/**
 * What the microphone button says when the address is the problem — in the
 * interface language, then in Hindi — or null when the address is fine and
 * the real reason (permission, an unsupported browser) should be worded.
 */
export function micSecureAddressWords(win: MicWindow | undefined = liveWindow(), address: SecureAddress | null = known): string | null {
  if (!micNeedsSecureAddress(win)) return null;
  const url = secureAddressUrl(win, address);
  if (url) return `${t("ai.voiceSecureAddress", { url })}\n${HINDI.micSecureAddressUrl.replace("{url}", url)}`;
  const port = dcrsPort(win);
  return `${t("ai.voiceInsecure", { port })}\n${HINDI.micSecureAddress.replace("{port}", port)}`;
}
