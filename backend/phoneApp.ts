// MITRA ON THE PHONES: WHERE THEY FIND IT (2-Oct-2026, docs/phone-app-setup.md).
//
// The plant's server PC runs DCRS, the Mitra server (its own folder, "Audit
// project chatbot-mobile", port 3000) and Expo's server for Expo Go (port 8081),
// which serves the Mitra app to the staff's phones. The Ask Mitra page shows a QR
// code for exp://<this PC's address>:8081 (frontend/src/components/mitra/
// MitraPhoneCard.tsx), and it asks this server where that is:
//
//   GET /api/phone-app, signed in (requireAuth), never cached:
//     { expoGo:      { port, running },
//       mitraServer: { port, running },
//       addresses:   [ { ip, interface } ] }      this PC's addresses, the best first
//
// The ports are MITRA_EXPO_PORT (8081 unless set) and MITRA_SERVER_PORT (3000
// unless set), from the environment or backend/.env. "running" is a quick look on
// this computer, at most a second each and both at once: Expo answers
// GET /status with "packager-status:running", the Mitra server answers
// GET /health with { "ok": true }. Nothing else is asked of either, and nothing
// is written.
//
// The same addresses go on the console when DCRS starts (printCompanyNetwork),
// beside "API server listening on http://localhost:<port>", so whoever starts it
// sees the address the laptops open. The rules for which address is best are in
// backend/lanAddresses.ts.
import os from "node:os";
import type { Express, Request, RequestHandler, Response } from "express";
import { companyNetworkLines, lanAddresses, type InterfaceTable, type LanAddress } from "./lanAddresses.ts";

/** Where Expo's server for Expo Go listens unless MITRA_EXPO_PORT says otherwise. */
export const DEFAULT_EXPO_GO_PORT = 8081;
/** Where the Mitra server listens unless MITRA_SERVER_PORT says otherwise (the app looks for it there). */
export const DEFAULT_MITRA_SERVER_PORT = 3000;
/** How long each look at the two servers may take. */
export const PROBE_TIMEOUT_MS = 1000;
/** What Expo's development server answers at /status while it runs. */
export const EXPO_RUNNING_TEXT = "packager-status:running";

export interface PhoneAppAnswer {
  expoGo: { port: number; running: boolean };
  mitraServer: { port: number; running: boolean };
  addresses: LanAddress[];
}

export interface PhoneAppDeps {
  requireAuth: RequestHandler;
  /** The environment the ports are read from; process.env unless a test hands in another. */
  env?: NodeJS.ProcessEnv;
  /** This computer's network cards; os.networkInterfaces() unless a test hands in a table. */
  networkInterfaces?: () => InterfaceTable;
  /** Where the two servers are looked for; this computer (127.0.0.1) unless a test says otherwise. */
  probeHost?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** A port from the environment: a whole number from 1 to 65535, else the default. */
export function portFrom(value: string | undefined, fallback: number): number {
  const text = (value ?? "").trim();
  if (!/^\d{1,5}$/.test(text)) return fallback;
  const n = Number(text);
  return n >= 1 && n <= 65535 ? n : fallback;
}

interface Probe {
  host: string;
  timeoutMs: number;
  fetch: typeof fetch;
}

/** GET http://host:port/path, answered with status and body within the time; null when nothing answered. */
async function look(probe: Probe, port: number, path: string): Promise<{ status: number; text: string } | null> {
  try {
    const res = await probe.fetch(`http://${probe.host}:${port}${path}`, { signal: AbortSignal.timeout(probe.timeoutMs), redirect: "manual" });
    return { status: res.status, text: await res.text() };
  } catch {
    return null;
  }
}

/** Expo's server for Expo Go answers /status with "packager-status:running" while it runs. */
export async function expoGoRunning(probe: Probe, port: number): Promise<boolean> {
  const got = await look(probe, port, "/status");
  return !!got && got.status === 200 && got.text.includes(EXPO_RUNNING_TEXT);
}

/** The Mitra server answers /health with { "ok": true }. */
export async function mitraServerRunning(probe: Probe, port: number): Promise<boolean> {
  const got = await look(probe, port, "/health");
  if (!got || got.status !== 200) return false;
  try {
    return (JSON.parse(got.text) as { ok?: unknown })?.ok === true;
  } catch {
    return false;
  }
}

/** The whole answer of GET /api/phone-app. */
export async function phoneAppAnswer(deps: Omit<PhoneAppDeps, "requireAuth"> = {}): Promise<PhoneAppAnswer> {
  const env = deps.env ?? process.env;
  const expoPort = portFrom(env.MITRA_EXPO_PORT, DEFAULT_EXPO_GO_PORT);
  const mitraPort = portFrom(env.MITRA_SERVER_PORT, DEFAULT_MITRA_SERVER_PORT);
  const probe: Probe = { host: deps.probeHost ?? "127.0.0.1", timeoutMs: deps.timeoutMs ?? PROBE_TIMEOUT_MS, fetch: deps.fetch ?? fetch };
  const [expoUp, mitraUp] = await Promise.all([expoGoRunning(probe, expoPort), mitraServerRunning(probe, mitraPort)]);
  let table: InterfaceTable = {};
  try {
    table = (deps.networkInterfaces ?? (() => os.networkInterfaces() as InterfaceTable))();
  } catch {
    /* no network information: no addresses */
  }
  return {
    expoGo: { port: expoPort, running: expoUp },
    mitraServer: { port: mitraPort, running: mitraUp },
    addresses: lanAddresses(table),
  };
}

export function registerPhoneAppRoutes(app: Express, deps: PhoneAppDeps): void {
  const { requireAuth, ...rest } = deps;
  app.get("/api/phone-app", requireAuth, async (_req: Request, res: Response): Promise<void> => {
    res.set("Cache-Control", "no-store");
    res.json(await phoneAppAnswer(rest));
  });
}

/** At start-up: the address laptops and desktops open DCRS at, one line per real network card. */
export function printCompanyNetwork(port: number, log: (line: string) => void = console.log): void {
  let table: InterfaceTable = {};
  try {
    table = os.networkInterfaces() as InterfaceTable;
  } catch {
    /* no network information: said as "no address yet" */
  }
  for (const line of companyNetworkLines(port, lanAddresses(table))) log(line);
}
