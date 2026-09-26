import React, { useCallback, useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiLoader, FiWifi, FiWifiOff } from "react-icons/fi";
import { useT } from "../../i18n";
import { connectionKind, connectionState, formatClock12h, speedLabel, type ConnectionReading, type ConnectionState } from "../../engine/connectionQuality";

// THE TOP BAR'S CONNECTION BADGE AND CLOCK (REQUIREMENTS §78).
//
// Two small things people look up from their work to see: is the site
// reachable, and what time is it — beside Today's briefing and the language
// control, on every screen. Each is its own component with its own state, so
// a second ticking by redraws the clock's few characters and nothing else on
// the bar; the badge redraws only when a reading changes.
//
// The badge asks the site's own server (/api/health) every PROBE_EVERY_MS, at
// once when the browser says the network came or went, and at once when it is
// clicked — sooner, every RETRY_EVERY_MS, while the answer is bad, so recovery
// shows within seconds. It is quiet while the tab is hidden. What the readings
// mean is decided in engine/connectionQuality.ts, where it is tested.

const PROBE_EVERY_MS = 10_000;
const RETRY_EVERY_MS = 4_000;
const PROBE_TIMEOUT_MS = 5_000;

interface NetworkInformationLike {
  downlink?: number;
  rtt?: number;
  type?: string;
  effectiveType?: string;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}

const browserLine = (): NetworkInformationLike | undefined => (typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: NetworkInformationLike }).connection);

function lineReading(): Pick<ConnectionReading, "downlinkMbps" | "rttMs" | "type"> {
  const c = browserLine();
  return {
    downlinkMbps: typeof c?.downlink === "number" && Number.isFinite(c.downlink) ? c.downlink : null,
    rttMs: typeof c?.rtt === "number" && Number.isFinite(c.rtt) ? c.rtt : null,
    type: c?.type ?? null,
  };
}

const ICONS: Record<ConnectionState, React.ReactNode> = {
  checking: <FiLoader size={13} />,
  good: <FiWifi size={13} />,
  fair: <FiWifi size={13} />,
  poor: <FiWifi size={13} />,
  offline: <FiWifiOff size={13} />,
  down: <FiAlertTriangle size={13} />,
};

const LABEL_KEYS: Record<ConnectionState, string> = {
  checking: "top.connChecking",
  good: "top.connGood",
  fair: "top.connFair",
  poor: "top.connPoor",
  offline: "top.connOffline",
  down: "top.connDown",
};

export function ConnectionStatus() {
  const t = useT();
  const [reading, setReading] = useState<ConnectionReading>(() => ({
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
    serverOk: null,
    probeMs: null,
    ...lineReading(),
  }));
  const timer = useRef<number | null>(null);
  const probing = useRef(false);

  const probe = useCallback(async () => {
    if (probing.current || typeof window === "undefined") return;
    probing.current = true;
    const controller = new AbortController();
    const cutoff = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const started = performance.now();
    let ok = false;
    try {
      const res = await fetch(`/api/health?t=${Date.now()}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      ok = res.ok;
    } catch {
      ok = false;
    } finally {
      window.clearTimeout(cutoff);
      probing.current = false;
    }
    const took = Math.round(performance.now() - started);
    setReading((r) => ({ ...r, online: navigator.onLine !== false, serverOk: ok, probeMs: ok ? took : r.probeMs, ...lineReading() }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const schedule = (ms: number) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(tick, ms);
    };
    const tick = async () => {
      if (cancelled) return;
      // Quiet while the tab is hidden: a laptop lid closed on it wastes nothing.
      if (document.visibilityState === "hidden") {
        schedule(PROBE_EVERY_MS);
        return;
      }
      await probe();
      if (cancelled) return;
      setReading((r) => {
        schedule(connectionState(r) === "good" || connectionState(r) === "fair" ? PROBE_EVERY_MS : RETRY_EVERY_MS);
        return r;
      });
    };
    const network = () => {
      setReading((r) => ({ ...r, online: navigator.onLine !== false, ...lineReading() }));
      schedule(200);
    };
    const shown = () => {
      if (document.visibilityState === "visible") schedule(200);
    };
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    document.addEventListener("visibilitychange", shown);
    const line = browserLine();
    line?.addEventListener?.("change", network);
    schedule(0);
    return () => {
      cancelled = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      document.removeEventListener("visibilitychange", shown);
      line?.removeEventListener?.("change", network);
    };
  }, [probe]);

  const state = connectionState(reading);
  const speed = state === "offline" || state === "down" || state === "checking" ? "" : speedLabel(reading);
  const kind = connectionKind(reading.type) ?? "Wi‑Fi/LAN";
  const detail =
    state === "offline"
      ? "This computer is not on the network — check the Wi‑Fi or the cable."
      : state === "down"
        ? `The network is there but the site's server did not answer. Trying again every ${RETRY_EVERY_MS / 1000} seconds; click to try now.`
        : state === "checking"
          ? "Asking the site's server…"
          : `${kind} connected — ${speed || "speed not measured"}${reading.probeMs !== null ? ` (${Math.round(reading.probeMs)} ms to the server)` : ""}. Click to check again.`;
  return (
    <button
      type="button"
      className={`conn-badge conn-${state}`}
      data-connection={state}
      data-speed={speed}
      title={detail}
      aria-label={`${t(LABEL_KEYS[state])}${speed ? ` — ${speed}` : ""}`}
      onClick={() => void probe()}
    >
      <span className={`conn-icon${state === "checking" ? " conn-spin" : ""}`}>{ICONS[state]}</span>
      <span className="topbar-label">{t(LABEL_KEYS[state])}</span>
      {speed && <span className="conn-speed notranslate" translate="no">{speed}</span>}
    </button>
  );
}

/** The time of day, ticking: hours, minutes and seconds, 12-hour. Its own state, so the tick redraws these few characters and nothing else. */
export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="topbar-clock notranslate" translate="no" data-clock title={now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}>
      {formatClock12h(now)}
    </span>
  );
}
