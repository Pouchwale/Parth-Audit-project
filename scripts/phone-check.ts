// THE PHONE APP CHECK (2-Oct-2026, docs/phone-app-setup.md, step 9).
//
//   npm run phone:check
//   npm run phone:check -- --email someone@company     (also tries a real sign-in)
//
// Run on the plant's server PC, the one that runs DCRS (port 4000), the Mitra
// server (port 3000, the "Audit project chatbot-mobile" folder) and Expo's server
// for Expo Go (port 8081). It asks each of them what a laptop or a phone would,
// and says PASS or FAIL for each step, with what to do about a FAIL:
//   1. this PC's address on the company network (backend/lanAddresses.ts);
//   2. DCRS answers /api/health, here and on that address;
//   3. DCRS's working hours and settings (GET /api/auth/config);
//   4. the clock and time zone DCRS's engine counts "today" by;
//   5. the Mitra server answers /health, here and on that address;
//   6. it signs people in with DCRS (/auth/provider);
//   7. Expo answers /status ("packager-status:running");
//   8-9. the manifest Expo Go loads, for Android and for iPhone: its Expo SDK,
//        the address (hostUri) it sends the phones to, and the Expo account Expo
//        on this PC is signed in to, without which an iPhone's Expo Go now refuses
//        to open the app (Expo, 3 September 2026);
//   10. with --email: a sign-in through the Mitra server (POST /auth/login, then
//       GET /me, then signed out again). The password comes from the environment
//       variable PHONE_CHECK_PASSWORD only: never an argument, never printed.
// Then the two addresses to hand out: http://<address>:4000 for browsers and
// exp://<address>:8081 for Expo Go. It exits 1 when any step FAILed.
//
// It runs on the server PC itself, so it cannot see Windows Firewall or the
// Wi-Fi between a phone and this PC: the phone checklist in the guide does that.
// Ports: API_PORT (4000), MITRA_SERVER_PORT (3000) and MITRA_EXPO_PORT (8081),
// from the environment or backend/.env, as DCRS reads them.
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { isVirtualAdapter, lanAddresses, type InterfaceTable, type LanAddress } from "../backend/lanAddresses.ts";
import { DEFAULT_EXPO_GO_PORT, DEFAULT_MITRA_SERVER_PORT, EXPO_RUNNING_TEXT, portFrom } from "../backend/phoneApp.ts";

export type Status = "PASS" | "FAIL" | "WARN" | "SKIP";

export interface Step {
  status: Status;
  title: string;
  /** What was found, in plain words. */
  lines: string[];
  /** What to do about a FAIL or a WARN. */
  hint?: string;
}

export interface CheckSetup {
  /** Where DCRS, the Mitra server and Expo are asked: this computer. */
  host: string;
  dcrsPort: number;
  mitraPort: number;
  expoPort: number;
  /** This computer's addresses, the best first (backend/lanAddresses.ts). */
  addresses: LanAddress[];
  /** The plant's time zone when DCRS does not say it (PLANT_TIMEZONE, else Asia/Kolkata). */
  plantTimeZone: string;
  /** This computer's own time zone. */
  localTimeZone: string;
  now: () => Date;
  /** --email: a DCRS sign-in email to try through the Mitra server. */
  email?: string;
  /** PHONE_CHECK_PASSWORD. Sent to the Mitra server only; never printed. */
  password?: string;
  fetch: typeof fetch;
  /** How long each server may take to answer. */
  timeoutMs: number;
  /** How long Expo may take to answer a manifest. */
  manifestTimeoutMs: number;
}

/** The DCRS connector's own name, which the Mitra server answers at /auth/provider. */
export const DCRS_SYSTEM_NAMES = ["Digital Controlled Record System", "DCRS"];
const APP_FOLDER = "Audit project chatbot-mobile";
const DEFAULT_DCRS_PORT = 4000;
/** More than this between DCRS's clock and this computer's is a problem. */
const CLOCK_TOLERANCE_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// asking a server

type Answer = { ok: true; status: number; type: string; text: string } | { ok: false; why: string };

async function ask(setup: CheckSetup, url: string, init: RequestInit = {}, timeoutMs = setup.timeoutMs): Promise<Answer> {
  try {
    const res = await setup.fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    return { ok: true, status: res.status, type: res.headers.get("content-type") ?? "", text: await res.text() };
  } catch (err) {
    return { ok: false, why: whyNoAnswer(err, timeoutMs) };
  }
}

/** Why a request got no answer, in plain words. */
export function whyNoAnswer(err: unknown, timeoutMs: number): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
  const code = e?.cause?.code ?? e?.code ?? "";
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return `no answer within ${Math.round(timeoutMs / 1000)} seconds`;
  if (code === "ECONNREFUSED") return "nothing is listening there";
  if (code === "ECONNRESET") return "the connection was cut off";
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") return "that address cannot be reached from here";
  if (code === "ENOTFOUND") return "no computer has that name";
  return err instanceof Error && err.message ? err.message : "no answer";
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const words = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

// ---------------------------------------------------------------------------
// clocks and time zones

/** "2026-10-02 17:45" on that zone's clock; null for a zone this computer does not know. */
export function wallClock(at: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
    const p = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
    return `${p("year")}-${p("month")}-${p("day")} ${p("hour")}:${p("minute")}`;
  } catch {
    return null;
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Friday 2 October 2026, 5:45 pm" on that zone's clock. */
export function timeWords(at: Date, timeZone: string): string {
  const wall = wallClock(at, timeZone);
  if (!wall) return at.toISOString();
  const [date, time] = wall.split(" ");
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${weekday} ${d} ${MONTHS[m - 1]} ${y}, ${hour12}:${String(min).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

// ---------------------------------------------------------------------------
// the steps

const hostOf = (hostUri: string): { host: string; port: number | null } => {
  const m = /^\[?([^\]]*?)\]?(?::(\d+))?$/.exec(hostUri.trim());
  if (!m) return { host: hostUri, port: null };
  return { host: m[1].toLowerCase(), port: m[2] ? Number(m[2]) : null };
};

const isLoopback = (host: string): boolean => host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0" || /^127\./.test(host);

interface Found {
  dcrsUp: boolean;
  /** DCRS's clock less this computer's, when DCRS answered; null when it did not say. */
  dcrsClockOffsetMs: number | null;
  dcrsZone: string | null;
  mitraUp: boolean;
  expoUp: boolean;
  /** The manifest the step being run read. */
  manifest: { sdkVersion?: string; hostUri?: string; username?: string } | null;
}

function addressStep(setup: CheckSetup): Step {
  const real = setup.addresses.filter((a) => !isVirtualAdapter(a.interface));
  const virtual = setup.addresses.filter((a) => isVirtualAdapter(a.interface));
  const lines = real.map((a, i) => `${a.ip} (${a.interface})${i === 0 && real.length > 1 ? " - the one handed out below" : ""}`);
  for (const a of virtual) lines.push(`Also ${a.ip} (${a.interface}): a virtual adapter, which phones and other computers cannot use.`);
  if (real.length === 0) {
    return {
      status: "FAIL",
      title: "This computer on the company network",
      lines: lines.length ? lines : ["This computer has no network address."],
      hint: "Connect this PC to the company network (its Wi-Fi or a cable), then run the check again.",
    };
  }
  return { status: "PASS", title: "This computer on the company network", lines };
}

async function dcrsStep(setup: CheckSetup, best: LanAddress | undefined, found: Found): Promise<Step> {
  const title = `DCRS (port ${setup.dcrsPort})`;
  const here = `http://${setup.host}:${setup.dcrsPort}`;
  const asked = setup.now();
  const got = await ask(setup, `${here}/api/health`);
  const body = got.ok ? record(parseJson(got.text)) : {};
  if (!got.ok || got.status !== 200 || body.ok !== true) {
    return {
      status: "FAIL",
      title,
      lines: [`${here}/api/health: ${got.ok ? `answered ${got.status}, not DCRS's "ok"` : got.why}.`],
      hint: "Start DCRS: npm run plant:start starts everything (or npm run server in the DCRS folder, for DCRS alone). It is ready when it prints \"API server listening\".",
    };
  }
  found.dcrsUp = true;
  // DCRS stamped its answer somewhere between the question and the answer: the middle is the fair guess.
  const at = typeof body.at === "string" ? new Date(body.at).getTime() : NaN;
  if (!Number.isNaN(at)) found.dcrsClockOffsetMs = at - (asked.getTime() + setup.now().getTime()) / 2;
  const lines = [`Answers at ${here}.`];
  if (!best) return { status: "PASS", title, lines };
  const there = `http://${best.ip}:${setup.dcrsPort}`;
  const lan = await ask(setup, `${there}/api/health`);
  if (!lan.ok || lan.status !== 200 || record(parseJson(lan.text)).ok !== true) {
    return {
      status: "FAIL",
      title,
      lines: [...lines, `${there}/api/health: ${lan.ok ? `answered ${lan.status}` : lan.why}.`],
      hint: `DCRS answers on this computer but not on its network address. Start it again (npm run plant:start), and make sure no other program uses port ${setup.dcrsPort}.`,
    };
  }
  lines.push(`Answers at ${there}, the address laptops and desktops open.`);
  return { status: "PASS", title, lines };
}

async function hoursStep(setup: CheckSetup, found: Found): Promise<Step> {
  const title = "DCRS's working hours and settings";
  if (!found.dcrsUp) return { status: "SKIP", title, lines: ["DCRS does not answer (see above)."] };
  const here = `http://${setup.host}:${setup.dcrsPort}/api/auth/config`;
  const got = await ask(setup, here);
  const body = got.ok ? record(parseJson(got.text)) : {};
  if (!got.ok || got.status !== 200) {
    return { status: "FAIL", title, lines: [`${here}: ${got.ok ? `answered ${got.status}` : got.why}.`], hint: "Start DCRS again (npm run plant:start) and look at logs\\dcrs.log." };
  }
  const features = record(body.features);
  const hours = body.hours === null || body.hours === undefined ? null : record(body.hours);
  const lines: string[] = [];
  const warnings: string[] = [];
  let status: Status = "PASS";
  if (!hours) {
    status = "WARN";
    lines.push("DCRS could not read its database, so it could not say its hours.");
    warnings.push("Look at logs\\dcrs.log: DCRS must reach its PostgreSQL database.");
  } else {
    found.dcrsZone = words(hours.timeZone) ?? null;
    if (hours.enforced === false) {
      status = "WARN";
      lines.push("Working hours are switched off (DCRS_WORKING_HOURS=off): every account can sign in at any hour.");
      warnings.push("To keep the plant's hours, remove DCRS_WORKING_HOURS from backend\\.env and start DCRS again.");
    } else {
      if (words(hours.hoursText)) lines.push(words(hours.hoursText)!);
      if (words(hours.todayText)) lines.push(words(hours.todayText)!);
      lines.push(hours.openNow === true ? "Right now staff can sign in, on the phone too." : "Right now only the super admin can sign in; staff are turned away until their hours start again, on the phone too.");
    }
  }
  if (features.demoMode === true) {
    status = "WARN";
    lines.push("Demo Mode is on (DEMO_MODE=1): this is not the plant's own setup.");
    warnings.push("Remove DEMO_MODE from backend\\.env and start DCRS again.");
  }
  if (features.signup === true) {
    status = "WARN";
    lines.push("Anyone can create an account (ALLOW_SIGNUP=1).");
    warnings.push("Remove ALLOW_SIGNUP from backend\\.env and start DCRS again: the super admin makes the accounts.");
  }
  return { status, title, lines, ...(warnings.length ? { hint: warnings.join(" ") } : {}) };
}

function clockStep(setup: CheckSetup, found: Found): Step {
  const title = "Clock and time zone";
  const zone = found.dcrsZone ?? setup.plantTimeZone;
  const now = setup.now();
  const local = wallClock(now, setup.localTimeZone);
  const plant = wallClock(now, zone);
  const indian = zone === "Asia/Kolkata" || zone === "Asia/Calcutta";
  const setZone = indian
    ? 'Set this PC to India Standard Time: Settings > Time & language > Date & time > Time zone "(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi" (or, in PowerShell, Set-TimeZone -Id "India Standard Time"), and turn on "Set time automatically".'
    : `Set this PC's time zone to the plant's (${zone}), and turn on "Set time automatically".`;
  if (!plant) return { status: "FAIL", title, lines: [`The plant's time zone "${zone}" is not one this computer knows.`], hint: "PLANT_TIMEZONE in backend\\.env must be a zone name such as Asia/Kolkata." };
  if (local !== plant) {
    return {
      status: "FAIL",
      title,
      lines: [`This computer's clock is on ${setup.localTimeZone} (${local ?? "unknown"}); the plant's is ${zone} (${plant}).`, 'DCRS\'s engine counts "today" by this computer\'s clock, so records would be dated wrongly.'],
      hint: `${setZone} Then start DCRS again (npm run plant:start).`,
    };
  }
  const lines = [`This computer's time zone (${setup.localTimeZone}) agrees with the plant's (${zone}): it is ${timeWords(now, zone)} at the factory.`];
  if (found.dcrsClockOffsetMs !== null) {
    const off = Math.abs(found.dcrsClockOffsetMs);
    if (off > CLOCK_TOLERANCE_MS) {
      return {
        status: "FAIL",
        title,
        lines: [...lines, `DCRS's clock and this computer's differ by ${Math.round(off / 60000)} minutes.`],
        hint: 'Turn on "Set time automatically" on the PC that runs DCRS, then start DCRS again.',
      };
    }
    lines.push("DCRS's clock agrees with this computer's.");
  }
  lines.push("If that time is wrong, turn on \"Set time automatically\" in Windows' Date & time settings.");
  return { status: "PASS", title, lines };
}

async function mitraStep(setup: CheckSetup, best: LanAddress | undefined, found: Found): Promise<Step> {
  const title = `Mitra server (port ${setup.mitraPort})`;
  const here = `http://${setup.host}:${setup.mitraPort}`;
  const got = await ask(setup, `${here}/health`);
  if (!got.ok || got.status !== 200 || record(parseJson(got.text)).ok !== true) {
    return {
      status: "FAIL",
      title,
      lines: [`${here}/health: ${got.ok ? `answered ${got.status}, not the Mitra server's "ok"` : got.why}.`],
      hint: `Start it: npm run plant:start starts everything (or, in the "${APP_FOLDER}" folder, npm --prefix server start). If it stops at once, read logs\\mitra-server.log: a missing CREDENTIALS_KEY in server\\.env is the usual reason.`,
    };
  }
  found.mitraUp = true;
  const lines = [`Answers at ${here}.`];
  if (!best) return { status: "PASS", title, lines };
  const there = `http://${best.ip}:${setup.mitraPort}`;
  const lan = await ask(setup, `${there}/health`);
  if (!lan.ok || lan.status !== 200 || record(parseJson(lan.text)).ok !== true) {
    return {
      status: "FAIL",
      title,
      lines: [...lines, `${there}/health: ${lan.ok ? `answered ${lan.status}` : lan.why}.`],
      hint: "The phones reach the Mitra server on this PC's network address: leave HOST out of server\\.env (or set HOST=0.0.0.0) and start it again.",
    };
  }
  lines.push(`Answers at ${there}, where the app on the phones finds it by itself.`);
  return { status: "PASS", title, lines };
}

async function providerStep(setup: CheckSetup, found: Found): Promise<Step> {
  const title = "Mitra signs people in with DCRS";
  if (!found.mitraUp) return { status: "SKIP", title, lines: ["The Mitra server does not answer (see above)."] };
  const url = `http://${setup.host}:${setup.mitraPort}/auth/provider`;
  const got = await ask(setup, url);
  const system = got.ok && got.status === 200 ? words(record(parseJson(got.text)).system) : undefined;
  if (!system) return { status: "FAIL", title, lines: [`${url}: ${got.ok ? `answered ${got.status}` : got.why}.`], hint: "Start the Mitra server again (npm run plant:start) and read logs\\mitra-server.log." };
  if (!DCRS_SYSTEM_NAMES.includes(system)) {
    return {
      status: "FAIL",
      title,
      lines: [`It signs people in with "${system}", not DCRS.`],
      hint: `That is its demo (npm run demo), with sample data. Stop it and start the real one: npm run plant:start (or npm --prefix server start in "${APP_FOLDER}"), with DCRS_BASE_URL=http://127.0.0.1:${setup.dcrsPort} in server\\.env.`,
    };
  }
  return { status: "PASS", title, lines: [`People sign in with "${system}": their DCRS email and password. Run the check with --email to try one.`] };
}

async function expoStep(setup: CheckSetup, found: Found): Promise<Step> {
  const title = `Mitra for Expo Go (port ${setup.expoPort})`;
  const url = `http://${setup.host}:${setup.expoPort}/status`;
  const got = await ask(setup, url);
  if (!got.ok || got.status !== 200 || !got.text.includes(EXPO_RUNNING_TEXT)) {
    return {
      status: "FAIL",
      title,
      lines: [`${url}: ${got.ok ? `answered ${got.status}, not Expo's "${EXPO_RUNNING_TEXT}"` : got.why}.`],
      hint: `Start it: npm run plant:start starts everything (or, in "${APP_FOLDER}\\mobile", npx expo start --lan --port ${setup.expoPort} --no-dev --minify, with REACT_NATIVE_PACKAGER_HOSTNAME set to this PC's address). Its log is logs\\expo.log.`,
    };
  }
  found.expoUp = true;
  return { status: "PASS", title, lines: [`Expo answers "${EXPO_RUNNING_TEXT}".`] };
}

/**
 * The Expo SDK, the address a manifest sends the phones to, and the Expo account Expo on this PC is
 * signed in to: Expo CLI puts that account's name in every manifest it serves (extra.expoGo.username,
 * "used by Expo Go to verify account match"), and leaves it out when it is signed in to none.
 */
export function readManifest(text: string): { sdkVersion?: string; hostUri?: string; username?: string } | null {
  const m = record(parseJson(text));
  if (Object.keys(m).length === 0) return null;
  const extra = record(m.extra);
  const client = record(extra.expoClient);
  const go = record(extra.expoGo);
  const runtime = words(m.runtimeVersion);
  const sdkVersion = words(client.sdkVersion) ?? words(m.sdkVersion) ?? (runtime?.startsWith("exposdk:") ? runtime.slice("exposdk:".length) : undefined);
  const hostUri = words(client.hostUri) ?? words(go.debuggerHost);
  const username = words(go.username);
  return { sdkVersion, hostUri, ...(username ? { username } : {}) };
}

/**
 * EXPO GO ON AN IPHONE NEEDS AN EXPO ACCOUNT (Expo's changelog, 3 September 2026, "Login now required
 * for running projects in Expo Go"): the current Expo Go for iOS runs an app from a computer's
 * `npx expo start` only when Expo on that computer and Expo Go on the phone are signed in to the same
 * Expo account. Expo says Android will follow; today it does not need it.
 */
function accountStep(platform: "android" | "ios", step: Step, username: string | undefined): Step {
  const login = `Sign Expo in once on this PC, as the Windows account that runs the servers: in "${APP_FOLDER}\\mobile", run npx expo login. Then start the servers again (scripts\\windows\\start-plant-servers.ps1 -Stop, then npm run plant:start), and sign each iPhone's Expo Go in to the same Expo account (the round picture at the top right in Expo Go).`;
  if (username) {
    const line =
      platform === "ios"
        ? `Expo on this PC is signed in to the Expo account "${username}": each iPhone's Expo Go must be signed in to that same account (the round picture at the top right in Expo Go).`
        : `Expo on this PC is signed in to the Expo account "${username}".`;
    return { ...step, lines: [...step.lines, line] };
  }
  if (platform === "android") {
    return { ...step, lines: [...step.lines, "Expo on this PC is not signed in to an Expo account: Android phones do not need it yet (Expo says they will); iPhones do."] };
  }
  return {
    status: "FAIL",
    title: step.title,
    lines: [
      ...step.lines,
      "Expo on this PC is not signed in to an Expo account. Expo Go on an iPhone now opens an app from a computer only when that computer and the iPhone are signed in to the same Expo account (Expo, 3 September 2026).",
    ],
    hint: step.status === "FAIL" && step.hint ? `${step.hint} ${login}` : login,
  };
}

async function manifestStep(setup: CheckSetup, platform: "android" | "ios", best: LanAddress | undefined, found: Found): Promise<Step> {
  const step = await manifestAddressStep(setup, platform, best, found);
  return step.status === "SKIP" || !found.manifest ? step : accountStep(platform, step, found.manifest.username);
}

async function manifestAddressStep(setup: CheckSetup, platform: "android" | "ios", best: LanAddress | undefined, found: Found): Promise<Step> {
  found.manifest = null;
  const title = `What Expo Go loads on ${platform === "android" ? "an Android phone" : "an iPhone"}`;
  if (!found.expoUp) return { status: "SKIP", title, lines: ["Expo does not answer (see above)."] };
  // Asked as a phone asks: at the address in the QR code.
  const url = `http://${best?.ip ?? setup.host}:${setup.expoPort}/`;
  const got = await ask(setup, url, { headers: { "expo-platform": platform, accept: "application/expo+json,application/json" } }, setup.manifestTimeoutMs);
  const manifest = got.ok && got.status === 200 ? readManifest(got.text) : null;
  found.manifest = manifest;
  if (!manifest) {
    return {
      status: "FAIL",
      title,
      lines: [`${url} (expo-platform: ${platform}): ${got.ok ? `answered ${got.status}${got.status === 200 ? " in a way this check does not read" : ""}` : got.why}.`],
      hint: "Read logs\\expo.log: the app itself may have an error. Start Expo again with npm run plant:start.",
    };
  }
  const lines = [`Expo SDK ${manifest.sdkVersion ?? "(not said)"}: Expo Go from the store must open this SDK (the guide, step 8).`];
  const fix = `Start Expo with REACT_NATIVE_PACKAGER_HOSTNAME set to this PC's address${best ? ` (${best.ip})` : ""}: npm run plant:start does it.`;
  if (!manifest.hostUri) return { status: "FAIL", title, lines: [...lines, "It does not say where the phones should load the app from."], hint: fix };
  const { host, port } = hostOf(manifest.hostUri);
  lines.push(`It sends the phones to ${manifest.hostUri}; the app then finds the Mitra server at http://${host.includes(":") ? `[${host}]` : host}:${DEFAULT_MITRA_SERVER_PORT}.`);
  const mine = setup.addresses.find((a) => a.ip === host);
  if (isLoopback(host)) return { status: "FAIL", title, lines: [...lines, `${host} is the phone itself to a phone.`], hint: fix };
  if (!mine) return { status: "FAIL", title, lines: [...lines, `${host} is not an address of this computer (an old address?).`], hint: fix };
  if (isVirtualAdapter(mine.interface)) return { status: "FAIL", title, lines: [...lines, `${host} is ${mine.interface}, a virtual adapter no phone can reach.`], hint: fix };
  if (port !== null && port !== setup.expoPort) {
    return { status: "FAIL", title, lines: [...lines, `It names port ${port}, but Expo listens on ${setup.expoPort}.`], hint: `Start Expo on port ${setup.expoPort} (npm run plant:start), or set MITRA_EXPO_PORT in backend\\.env to the port it uses.` };
  }
  if (best && host !== best.ip) {
    return { status: "WARN", title, lines: [...lines, `That is ${mine.interface}, not ${best.interface} (${best.ip}): the phones must be on that network.`], hint: fix };
  }
  return { status: "PASS", title, lines };
}

/** The Mitra server's refusal, in its own words. */
function refusal(body: Record<string, unknown>, status: number): { said: string; code: string } {
  return { said: words(body.message) ?? words(body.error) ?? `answered ${status}`, code: words(body.error) ?? "" };
}

async function signInStep(setup: CheckSetup, found: Found): Promise<Step> {
  const title = "A sign-in through Mitra";
  const howTo =
    'In PowerShell: $env:PHONE_CHECK_PASSWORD = [Net.NetworkCredential]::new("", (Read-Host "Password" -AsSecureString)).Password  then  npm run phone:check -- --email <a DCRS sign-in email>  and afterwards  Remove-Item Env:PHONE_CHECK_PASSWORD';
  if (!setup.email) return { status: "SKIP", title, lines: ["Not tried: run the check with --email to try one."], hint: howTo };
  if (!setup.password) {
    return { status: "FAIL", title, lines: [`--email ${setup.email} was given, but PHONE_CHECK_PASSWORD is not set.`], hint: `The password is never typed on the command line. ${howTo}` };
  }
  if (!found.mitraUp) return { status: "SKIP", title, lines: ["The Mitra server does not answer (see above)."] };
  const base = `http://${setup.host}:${setup.mitraPort}`;
  const device = { deviceId: "dcrs-phone-check", name: "DCRS phone check", model: os.hostname().slice(0, 100), os: "Windows", osVersion: os.release().slice(0, 50), appVersion: "phone-check" };
  const login = await ask(setup, `${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: setup.email, password: setup.password, device }),
  });
  if (!login.ok) return { status: "FAIL", title, lines: [`${base}/auth/login: ${login.why}.`], hint: "Start the Mitra server again (npm run plant:start)." };
  const body = record(parseJson(login.text));
  if (login.status !== 200 || typeof body.token !== "string") {
    const { said, code } = refusal(body, login.status);
    const hint =
      code === "invalid_credentials"
        ? "Check the email and the password: they are the person's DCRS ones."
        : code === "upstream_unavailable"
          ? `The Mitra server could not reach DCRS: server\\.env must say DCRS_BASE_URL=http://127.0.0.1:${setup.dcrsPort}, and DCRS must be running.`
          : code === "rate_limited" || login.status === 429
            ? "Too many sign-ins in a minute. Wait a minute and try again."
            : code === "forbidden"
              ? "Those are DCRS's own words: outside the working hours only the super admin may sign in, and an account on the first password the administrator gave must choose its own in a DCRS browser first."
              : "Read logs\\mitra-server.log.";
    return { status: "FAIL", title, lines: [`Signing in as ${setup.email} was refused (${login.status}): ${said}`], hint };
  }
  const token = body.token;
  const me = await ask(setup, `${base}/me`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const user = me.ok && me.status === 200 ? record(record(parseJson(me.text)).user) : {};
  // Signed out again either way, so the check leaves no session behind.
  await ask(setup, `${base}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!words(user.username)) {
    return { status: "FAIL", title, lines: [`Signed in, but ${base}/me: ${me.ok ? `answered ${me.status}` : me.why}.`], hint: "Read logs\\mitra-server.log." };
  }
  const who = words(user.displayName) ?? words(user.username)!;
  return {
    status: "PASS",
    title,
    lines: [`Signed in as ${who} (${words(user.username)})${user.role === "super_admin" ? ", with the super admin's view" : ""}, then signed out again.`],
  };
}

/** Every step, in order. */
export async function runChecks(setup: CheckSetup): Promise<Step[]> {
  const found: Found = { dcrsUp: false, dcrsClockOffsetMs: null, dcrsZone: null, mitraUp: false, expoUp: false, manifest: null };
  const best = setup.addresses.find((a) => !isVirtualAdapter(a.interface));
  const steps: Step[] = [addressStep(setup)];
  steps.push(await dcrsStep(setup, best, found));
  steps.push(await hoursStep(setup, found));
  steps.push(clockStep(setup, found));
  steps.push(await mitraStep(setup, best, found));
  steps.push(await providerStep(setup, found));
  steps.push(await expoStep(setup, found));
  steps.push(await manifestStep(setup, "android", best, found));
  steps.push(await manifestStep(setup, "ios", best, found));
  steps.push(await signInStep(setup, found));
  return steps;
}

/** The report, as printed. */
export function report(steps: Step[], setup: CheckSetup): string {
  const out: string[] = [`Phone app check, ${timeWords(setup.now(), setup.plantTimeZone)} (${setup.plantTimeZone})`, ""];
  for (const s of steps) {
    out.push(`${s.status.padEnd(4)}  ${s.title}`);
    for (const line of s.lines) out.push(`      ${line}`);
    if (s.hint && (s.status === "FAIL" || s.status === "WARN")) out.push(`      What to do: ${s.hint}`);
  }
  const best = setup.addresses.find((a) => !isVirtualAdapter(a.interface));
  out.push("");
  if (best) {
    out.push(`Laptops and desktops open DCRS at:  http://${best.ip}:${setup.dcrsPort}`);
    out.push(`Phones open Mitra in Expo Go at:    exp://${best.ip}:${setup.expoPort}   (or scan the QR code on DCRS's Ask Mitra page)`);
  } else {
    out.push("No address to hand out yet: this computer is not on a network.");
  }
  out.push("This check ran on the server PC itself, so it cannot see Windows Firewall or the Wi-Fi: try a phone too (docs/phone-app-setup.md, step 9).");
  const failed = steps.filter((s) => s.status === "FAIL").length;
  const warned = steps.filter((s) => s.status === "WARN").length;
  const checked = steps.filter((s) => s.status !== "SKIP").length;
  out.push(
    failed
      ? `${failed} ${failed === 1 ? "problem" : "problems"}: fix the FAIL lines from the top, then run npm run phone:check again.`
      : `All ${checked} checks passed${warned ? `, with ${warned} ${warned === 1 ? "warning" : "warnings"} to read` : ""}.`
  );
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// the command line

export interface Args {
  email?: string;
  help: boolean;
  error?: string;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h" || a === "/?") args.help = true;
    else if (a === "--email") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) return { ...args, error: "--email needs a DCRS sign-in email after it." };
      args.email = next.trim();
      i++;
    } else if (a.startsWith("--email=")) args.email = a.slice("--email=".length).trim();
    else if (/^--?pass(word)?(=|$)/i.test(a)) return { ...args, error: "The password is never given on the command line: set PHONE_CHECK_PASSWORD instead (npm run phone:check -- --help says how)." };
    else return { ...args, error: `"${a}" is not something this check knows.` };
  }
  if (args.email !== undefined && !/^[^\s@]+@[^\s@]+$/.test(args.email)) return { ...args, error: `"${args.email}" is not an email address.` };
  return args;
}

const USAGE = `npm run phone:check                       checks DCRS, the Mitra server and Expo for Expo Go on this PC
npm run phone:check -- --email <email>    also signs in through the Mitra server as that DCRS account
                                          (the password from PHONE_CHECK_PASSWORD; never on the command line)

To set the password without it showing or staying in the history, in PowerShell:
  $env:PHONE_CHECK_PASSWORD = [Net.NetworkCredential]::new("", (Read-Host "Password" -AsSecureString)).Password
and afterwards:
  Remove-Item Env:PHONE_CHECK_PASSWORD`;

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.error) {
    console.error(`${args.error}\n\n${USAGE}`);
    return 2;
  }
  // backend/.env, read the way DCRS reads it (API_PORT, PLANT_TIMEZONE, MITRA_*_PORT). Nothing from it is printed.
  await import("../backend/env.ts");
  const zone = (process.env.PLANT_TIMEZONE ?? "").trim() || "Asia/Kolkata";
  const setup: CheckSetup = {
    host: "127.0.0.1",
    dcrsPort: portFrom(process.env.API_PORT, DEFAULT_DCRS_PORT),
    mitraPort: portFrom(process.env.MITRA_SERVER_PORT, DEFAULT_MITRA_SERVER_PORT),
    expoPort: portFrom(process.env.MITRA_EXPO_PORT, DEFAULT_EXPO_GO_PORT),
    addresses: lanAddresses(os.networkInterfaces() as InterfaceTable),
    plantTimeZone: zone,
    localTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    now: () => new Date(),
    ...(args.email ? { email: args.email } : {}),
    ...(process.env.PHONE_CHECK_PASSWORD ? { password: process.env.PHONE_CHECK_PASSWORD } : {}),
    fetch,
    timeoutMs: 5000,
    manifestTimeoutMs: 20000,
  };
  const steps = await runChecks(setup);
  console.log(report(steps, setup));
  return steps.some((s) => s.status === "FAIL") ? 1 : 0;
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const self = fileURLToPath(import.meta.url);
if (entry && (process.platform === "win32" ? entry.toLowerCase() === self.toLowerCase() : entry === self)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  );
}
