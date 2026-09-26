// THE CONNECTION, JUDGED (REQUIREMENTS §78). The top bar shows whether this
// computer is on the network, whether the site's own server answers, and how
// fast the line is — as a colour anyone reads at a glance: green when good,
// amber when slow, red-orange when very slow, grey when there is no internet
// at all, red when the internet is there but the site is down.
//
// What it is judged from, and why each:
//   - `online`: the browser's own word (navigator.onLine, and its online /
//     offline events). False is certain — the cable is out or the Wi‑Fi is
//     gone. True only means "not certainly off", so the server is asked too.
//   - `serverOk` / `probeMs`: a small GET of /api/health, timed. It answers the
//     question the person actually has — "is the site working?" — and the time
//     it takes is the one speed figure that is true for THIS site, whatever the
//     browser estimates. Null while the first answer is awaited.
//   - `downlinkMbps` / `rttMs`: the browser's estimate of the line
//     (navigator.connection, where a browser offers it — Chromium does, others
//     do not), shown as the speed figure when it is there.
// Pure functions, so the judgement is tested without a browser
// (frontend/tests/topbarStatus.test.ts); components/layout/TopbarStatus.tsx
// gathers the readings and draws the badge.

export type ConnectionState = "checking" | "good" | "fair" | "poor" | "offline" | "down";

export interface ConnectionReading {
  /** navigator.onLine — false is certain, true only means "not certainly off". */
  online: boolean;
  /** The site's own server answered the last probe (null until the first answer). */
  serverOk: boolean | null;
  /** How long the last probe took, ms. */
  probeMs: number | null;
  /** The browser's estimate of the line, where it offers one. */
  downlinkMbps: number | null;
  rttMs: number | null;
  /** "wifi", "ethernet", "cellular" … where the browser says (few desktop browsers do). */
  type?: string | null;
}

/** A line is GOOD to this many ms to the server, FAIR to the next, POOR beyond. */
export const GOOD_MS = 400;
export const FAIR_MS = 1200;
/** A line is GOOD from this many Mbps down, FAIR from the next, POOR below. */
export const GOOD_MBPS = 5;
export const FAIR_MBPS = 1.5;

/** What the badge is: the state the readings add up to. */
export function connectionState(r: ConnectionReading): ConnectionState {
  if (!r.online) return "offline";
  if (r.serverOk === false) return "down";
  if (r.serverOk === null) return "checking";
  // The slower of the two figures decides, so a fast line to a slow server
  // and a slow line to a fast server read the same way — slow.
  const ms = r.probeMs ?? r.rttMs;
  const bySpeed = r.downlinkMbps === null ? "good" : r.downlinkMbps >= GOOD_MBPS ? "good" : r.downlinkMbps >= FAIR_MBPS ? "fair" : "poor";
  const byLatency = ms === null ? "good" : ms <= GOOD_MS ? "good" : ms <= FAIR_MS ? "fair" : "poor";
  const rank = { good: 0, fair: 1, poor: 2 } as const;
  return rank[bySpeed] >= rank[byLatency] ? bySpeed : byLatency;
}

/** The figures beside the word: "12.5 Mbps · 85 ms", "85 ms", or "" when nothing has been measured. */
export function speedLabel(r: ConnectionReading): string {
  const parts: string[] = [];
  if (r.downlinkMbps !== null && r.downlinkMbps > 0) parts.push(`${r.downlinkMbps >= 10 ? Math.round(r.downlinkMbps) : Math.round(r.downlinkMbps * 10) / 10} Mbps`);
  const ms = r.probeMs ?? r.rttMs;
  if (ms !== null && ms >= 0) parts.push(`${Math.round(ms)} ms`);
  return parts.join(" · ");
}

/** The kind of line, in the word people use for it, where the browser says. */
export function connectionKind(type: string | null | undefined): "Wi‑Fi" | "LAN" | "Mobile data" | null {
  switch (type) {
    case "wifi":
      return "Wi‑Fi";
    case "ethernet":
      return "LAN";
    case "cellular":
      return "Mobile data";
    default:
      return null;
  }
}

/** The time as the plant reads a clock: hours, minutes and seconds, 12-hour, "02:05:09 PM"; midnight is 12:00:00 AM. */
export function formatClock12h(d: Date): string {
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h12)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${h24 < 12 ? "AM" : "PM"}`;
}
