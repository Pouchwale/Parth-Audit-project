// THE MICROPHONE NEEDS A SECURE ADDRESS (REQUIREMENTS §80).
//
// A browser lends a page the microphone only on a secure address: https, or
// http://localhost on the computer itself. Opened over the LAN as
// http://192.168.x.x:port there is no navigator.mediaDevices at all, so the
// recorder (utils/recorder.ts) and the browser's own recognition
// (utils/speech.ts) fail before anyone is asked — and the page used to say the
// permission was BLOCKED and to allow it, which nobody can do. This check tells
// the two apart, so the words say what to actually do: open DCRS at
// http://localhost:<this port> on the DCRS computer, or at its https address.
//
// Written in English and Gujarati through the interface strings
// (i18n/strings.ts "ai.voiceInsecure") and in Hindi (i18n/hindi.ts), since
// people speak to Mitra in all three (REQUIREMENTS §89).
import { t } from "../i18n";
import { HINDI } from "../i18n/hindi";

/** The few things of a window this check reads — a test passes a fake one. */
export interface MicWindow {
  isSecureContext?: boolean;
  navigator?: { mediaDevices?: unknown };
  location?: { port?: string; protocol?: string };
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

/**
 * What the microphone button says when the address is the problem — in the
 * interface language, then in Hindi — or null when the address is fine and
 * the real reason (permission, an unsupported browser) should be worded.
 */
export function micSecureAddressWords(win: MicWindow | undefined = liveWindow()): string | null {
  if (!micNeedsSecureAddress(win)) return null;
  const port = dcrsPort(win);
  return `${t("ai.voiceInsecure", { port })}\n${HINDI.micSecureAddress.replace("{port}", port)}`;
}
