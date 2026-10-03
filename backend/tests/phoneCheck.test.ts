// THE PHONE APP CHECK, scripts/phone-check.ts (npm run phone:check), against
// stand-ins for DCRS, the Mitra server and Expo's server on spare ports of this
// computer — never the plant's own 4000, 3000 and 8081. The PC's network address
// is a made-up 10.9.8.7, which the stand-in fetch sends to 127.0.0.1. Proved:
//   * everything up and right: ten PASS lines, the two addresses to hand out,
//     and a sign-in through the Mitra server that sends the password there and
//     nowhere else — it is never printed, nor is the session token, and the
//     session is signed out again;
//   * nothing running: a FAIL for each server with what to do, the steps that
//     depend on them skipped, and the count of problems;
//   * the Mitra server's demo is told apart from the real one;
//   * the manifest's hostUri: the phone itself, a virtual adapter, an address
//     not this PC's, a wrong port, another card's;
//   * the Expo account: iPhones fail without one on this PC (Expo, 3 September
//     2026), Android passes with a note, and the account is named when there is one;
//   * the clock: a zone that only differs in name passes, another offset fails
//     with how to set India Standard Time, a DCRS clock minutes away fails;
//   * DCRS's settings: hours off, Demo Mode, open sign-up, hours unreadable;
//   * a refused sign-in in the Mitra server's (DCRS's) own words, and no
//     password: no request at all;
//   * the command line: --email, and never a password.
// Run: npm run test:unit -- phoneCheck
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { parseArgs, readManifest, report, runChecks, timeWords, wallClock, whyNoAnswer, type CheckSetup, type Step } from "../../scripts/phone-check.ts";

const LAN = "10.9.8.7";
const PASSWORD = "Correct-Horse-7";
const TOKEN = "mitra-session-token-0123456789";

// ---------------------------------------------------------------------------
// the stand-ins

type Handler = (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void;

interface StandIn {
  port: number;
  handler: Handler;
  seen: { method: string; url: string; headers: http.IncomingHttpHeaders; body: string }[];
  close(): Promise<void>;
}

async function standIn(handler: Handler): Promise<StandIn> {
  const s: StandIn = { port: 0, handler, seen: [], close: async () => undefined };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString("utf-8")));
    req.on("end", () => {
      s.seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });
      s.handler(req, body, res);
    });
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  s.port = (server.address() as AddressInfo).port;
  s.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return s;
}

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

let dcrsClockShiftMs = 0;
let config: unknown;
const OPEN_HOURS = {
  enforced: true,
  start: "08:40",
  end: "18:20",
  timeZone: "Asia/Kolkata",
  openNow: true,
  opensAt: null,
  hoursText: "DCRS is open 8:40 am to 6:20 pm on working days.",
  todayText: "Today is Friday, a working day.",
};

const dcrsHandler: Handler = (req, _body, res) => {
  if (req.url === "/api/health") return json(res, 200, { ok: true, at: new Date(Date.now() + dcrsClockShiftMs).toISOString() });
  if (req.url === "/api/auth/config") return json(res, 200, config);
  json(res, 404, { error: "Not found." });
};

let providerName = "Digital Controlled Record System";
let loginAnswer: { status: number; body: unknown } | null = null;
const mitraHandler: Handler = (req, body, res) => {
  if (req.url === "/health") return json(res, 200, { ok: true });
  if (req.url === "/auth/provider") return json(res, 200, { system: providerName });
  if (req.url === "/auth/login" && req.method === "POST") {
    if (loginAnswer) return json(res, loginAnswer.status, loginAnswer.body);
    const sent = JSON.parse(body) as { username: string; password: string; device: { deviceId: string } };
    if (sent.password !== PASSWORD || !sent.device?.deviceId) return json(res, 401, { error: "invalid_credentials", message: "Wrong username or password." });
    return json(res, 200, { token: TOKEN, user: { id: "u1", username: sent.username, displayName: "Kapila Barad", role: "user" } });
  }
  if (req.url === "/me") {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { error: "unauthorized", message: "Sign in again." });
    return json(res, 200, { user: { id: "u1", username: "kapila.barad@gpp.local", displayName: "Kapila Barad", role: "user" } });
  }
  if (req.url === "/auth/logout" && req.method === "POST") {
    res.writeHead(204).end();
    return;
  }
  json(res, 404, { error: "not_found", message: "Not found." });
};

let hostUri = "";
let expoStatus = "packager-status:running";
let expoAccount: string | null = "plant-expo";
const expoHandler: Handler = (req, _body, res) => {
  if (req.url === "/status") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(expoStatus);
    return;
  }
  if (req.url === "/" && req.headers["expo-platform"]) {
    res.writeHead(200, { "Content-Type": "application/expo+json" });
    const expoGo = { debuggerHost: hostUri, ...(expoAccount ? { username: expoAccount } : {}) };
    res.end(JSON.stringify({ runtimeVersion: "exposdk:57.0.0", extra: { expoClient: { sdkVersion: "57.0.0", hostUri }, expoGo } }));
    return;
  }
  res.writeHead(404).end();
};

let dcrs: StandIn;
let mitra: StandIn;
let expo: StandIn;

before(async () => {
  dcrs = await standIn(dcrsHandler);
  mitra = await standIn(mitraHandler);
  expo = await standIn(expoHandler);
});
after(async () => {
  await dcrs.close();
  await mitra.close();
  await expo.close();
});
beforeEach(() => {
  dcrsClockShiftMs = 0;
  config = { features: { demoMode: false, signup: false, assistant: true }, hours: OPEN_HOURS };
  providerName = "Digital Controlled Record System";
  loginAnswer = null;
  hostUri = `${LAN}:${expo.port}`;
  expoStatus = "packager-status:running";
  expoAccount = "plant-expo";
  for (const s of [dcrs, mitra, expo]) s.seen.length = 0;
  asked.length = 0;
});

/** Every address the check asked, before the made-up network address is sent to this computer, where the stand-ins are. */
const asked: string[] = [];
const lanFetch: typeof fetch = (input, init) => {
  asked.push(String(input));
  return fetch(String(input).replace(`//${LAN}:`, "//127.0.0.1:"), init);
};

function setup(over: Partial<CheckSetup> = {}): CheckSetup {
  return {
    host: "127.0.0.1",
    dcrsPort: dcrs.port,
    mitraPort: mitra.port,
    expoPort: expo.port,
    addresses: [
      { ip: LAN, interface: "Ethernet 7" },
      { ip: "172.29.144.1", interface: "vEthernet (WSL (Hyper-V firewall))" },
    ],
    plantTimeZone: "Asia/Kolkata",
    localTimeZone: "Asia/Kolkata",
    now: () => new Date(),
    fetch: lanFetch,
    timeoutMs: 2000,
    manifestTimeoutMs: 2000,
    ...over,
  };
}

/** A port nothing listens on. */
async function closedPort(): Promise<number> {
  const s = await standIn(() => undefined);
  await s.close();
  return s.port;
}

const step = (steps: Step[], title: RegExp): Step => {
  const found = steps.find((s) => title.test(s.title));
  assert.ok(found, `no step ${title}: ${steps.map((s) => s.title).join(" | ")}`);
  return found;
};

// ---------------------------------------------------------------------------

describe("everything up and right", () => {
  it("passes every step, signs in and out through the Mitra server, and never prints the password or the token", async () => {
    const s = setup({ email: "kapila.barad@gpp.local", password: PASSWORD });
    const steps = await runChecks(s);
    assert.deepEqual(
      steps.map((x) => `${x.status} ${x.title}`),
      [
        "PASS This computer on the company network",
        `PASS DCRS (port ${dcrs.port})`,
        "PASS DCRS's working hours and settings",
        "PASS Clock and time zone",
        `PASS Mitra server (port ${mitra.port})`,
        "PASS Mitra signs people in with DCRS",
        `PASS Mitra for Expo Go (port ${expo.port})`,
        "PASS What Expo Go loads on an Android phone",
        "PASS What Expo Go loads on an iPhone",
        "PASS A sign-in through Mitra",
      ]
    );
    const text = report(steps, s);
    assert.match(text, new RegExp(`Laptops and desktops open DCRS at:  http://${LAN.replace(/\./g, "\\.")}:${dcrs.port}`));
    assert.match(text, new RegExp(`Phones open Mitra in Expo Go at:    exp://${LAN.replace(/\./g, "\\.")}:${expo.port}`));
    assert.match(text, /All 10 checks passed\./);
    assert.match(text, /Signed in as Kapila Barad \(kapila\.barad@gpp\.local\), then signed out again\./);
    assert.match(text, /Expo SDK 57\.0\.0/);
    assert.match(text, /a virtual adapter, which phones and other computers cannot use/);
    assert.ok(!text.includes(PASSWORD), "the password is printed");
    assert.ok(!text.includes(TOKEN), "the session token is printed");
    // The password went to the Mitra server's sign-in, the token to /me and the sign-out, and both asked as a phone does.
    const login = mitra.seen.find((r) => r.url === "/auth/login")!;
    assert.equal(JSON.parse(login.body).password, PASSWORD);
    assert.equal(JSON.parse(login.body).username, "kapila.barad@gpp.local");
    assert.equal(mitra.seen.find((r) => r.url === "/auth/logout")?.headers.authorization, `Bearer ${TOKEN}`);
    const manifests = expo.seen.filter((r) => r.url === "/");
    assert.deepEqual(manifests.map((r) => r.headers["expo-platform"]), ["android", "ios"]);
    assert.ok(manifests.every((r) => r.headers.accept === "application/expo+json,application/json"));
    // Asked at the PC's network address (the one in the QR code), as a phone asks; DCRS and the Mitra server there too.
    assert.equal(asked.filter((u) => u === `http://${LAN}:${expo.port}/`).length, 2);
    assert.ok(asked.includes(`http://${LAN}:${dcrs.port}/api/health`));
    assert.ok(asked.includes(`http://${LAN}:${mitra.port}/health`));
    assert.ok(dcrs.seen.some((r) => r.url === "/api/health") && dcrs.seen.some((r) => r.url === "/api/auth/config"));
  });

  it("skips the sign-in without --email, and says how to run one", async () => {
    const steps = await runChecks(setup());
    const signIn = step(steps, /sign-in through Mitra/);
    assert.equal(signIn.status, "SKIP");
    assert.match(signIn.hint ?? "", /PHONE_CHECK_PASSWORD/);
    assert.match(report(steps, setup()), /All 9 checks passed\./);
    assert.equal(mitra.seen.filter((r) => r.url === "/auth/login").length, 0);
  });
});

describe("nothing running", () => {
  it("fails each server with what to do, skips what depends on them, and counts the problems", async () => {
    const port = await closedPort();
    const s = setup({ dcrsPort: port, mitraPort: port, expoPort: port });
    const steps = await runChecks(s);
    const status = (re: RegExp) => step(steps, re).status;
    assert.equal(status(/^DCRS \(port/), "FAIL");
    assert.equal(status(/working hours/), "SKIP");
    assert.equal(status(/^Mitra server/), "FAIL");
    assert.equal(status(/signs people in/), "SKIP");
    assert.equal(status(/Expo Go \(port/), "FAIL");
    assert.equal(status(/Android/), "SKIP");
    assert.equal(status(/iPhone/), "SKIP");
    assert.match(step(steps, /^DCRS \(port/).lines.join(" "), /nothing is listening there/);
    for (const re of [/^DCRS \(port/, /^Mitra server/, /Expo Go \(port/]) assert.match(step(steps, re).hint ?? "", /npm run plant:start/);
    const text = report(steps, s);
    assert.match(text, /3 problems: fix the FAIL lines from the top, then run npm run phone:check again\./);
    assert.match(text, /What to do: Start DCRS/);
  });

  it("fails the address step on a computer with no network, and hands out no address", async () => {
    const port = await closedPort();
    const s = setup({ addresses: [], dcrsPort: port, mitraPort: port, expoPort: port });
    const steps = await runChecks(s);
    assert.equal(steps[0].status, "FAIL");
    assert.match(steps[0].hint ?? "", /Connect this PC to the company network/);
    assert.match(report(steps, s), /No address to hand out yet/);
  });
});

describe("the Mitra server", () => {
  it("tells its demo from the real one", async () => {
    providerName = "Demo Records";
    const provider = step(await runChecks(setup()), /signs people in/);
    assert.equal(provider.status, "FAIL");
    assert.match(provider.lines[0], /"Demo Records", not DCRS/);
    assert.match(provider.hint ?? "", /npm run demo/);
    assert.match(provider.hint ?? "", /DCRS_BASE_URL=http:\/\/127\.0\.0\.1:/);
  });

  it("accepts the connector's short name as well", async () => {
    providerName = "DCRS";
    assert.equal(step(await runChecks(setup()), /signs people in/).status, "PASS");
  });
});

describe("where the manifest sends the phones", () => {
  const manifestStatus = async (uri: string, over: Partial<CheckSetup> = {}) => {
    hostUri = uri;
    const steps = await runChecks(setup(over));
    return [step(steps, /Android/), step(steps, /iPhone/)];
  };

  it("fails the phone itself", async () => {
    for (const uri of [`localhost:${0}`, `127.0.0.1:${0}`]) {
      const [android, ios] = await manifestStatus(uri.replace(":0", `:${expo.port}`));
      assert.equal(android.status, "FAIL");
      assert.equal(ios.status, "FAIL");
      assert.match(android.lines.join(" "), /is the phone itself/);
      assert.match(android.hint ?? "", new RegExp(`REACT_NATIVE_PACKAGER_HOSTNAME set to this PC's address \\(${LAN.replace(/\./g, "\\.")}\\)`));
    }
  });

  it("fails a virtual adapter, an address not this PC's, and a wrong port", async () => {
    let [android] = await manifestStatus(`172.29.144.1:${expo.port}`);
    assert.equal(android.status, "FAIL");
    assert.match(android.lines.join(" "), /a virtual adapter no phone can reach/);
    [android] = await manifestStatus(`192.168.0.50:${expo.port}`);
    assert.equal(android.status, "FAIL");
    assert.match(android.lines.join(" "), /not an address of this computer/);
    [android] = await manifestStatus(`${LAN}:9999`);
    assert.equal(android.status, "FAIL");
    assert.match(android.lines.join(" "), /names port 9999/);
  });

  it("warns when it names this PC's other network card", async () => {
    const [android] = await manifestStatus(`192.168.0.107:${expo.port}`, {
      addresses: [
        { ip: LAN, interface: "Ethernet 7" },
        { ip: "192.168.0.107", interface: "Wi-Fi 2" },
      ],
    });
    assert.equal(android.status, "WARN");
    assert.match(android.lines.join(" "), /That is Wi-Fi 2, not Ethernet 7/);
  });

  it("fails an Expo that answers /status wrongly, and then skips the manifests", async () => {
    expoStatus = "something else";
    const steps = await runChecks(setup());
    assert.equal(step(steps, /Expo Go \(port/).status, "FAIL");
    assert.equal(step(steps, /Android/).status, "SKIP");
  });

  it("names the Expo account the iPhones must sign in to", async () => {
    const steps = await runChecks(setup());
    assert.match(step(steps, /iPhone/).lines.join(" "), /signed in to the Expo account "plant-expo": each iPhone's Expo Go must be signed in to that same account/);
    assert.match(step(steps, /Android/).lines.join(" "), /signed in to the Expo account "plant-expo"\./);
  });

  it("fails the iPhone, not Android, when Expo on this PC is signed in to no Expo account", async () => {
    expoAccount = null;
    const steps = await runChecks(setup());
    const android = step(steps, /Android/);
    const ios = step(steps, /iPhone/);
    assert.equal(android.status, "PASS");
    assert.match(android.lines.join(" "), /Android phones do not need it yet/);
    assert.equal(ios.status, "FAIL");
    assert.match(ios.lines.join(" "), /not signed in to an Expo account/);
    assert.match(ios.hint ?? "", /npx expo login/);
    assert.match(ios.hint ?? "", /the same Expo account/);
    assert.match(report(steps, setup()), /1 problem: fix the FAIL lines/);
  });

  it("gives both fixes when the address is wrong and there is no Expo account", async () => {
    expoAccount = null;
    hostUri = `localhost:${expo.port}`;
    const ios = step(await runChecks(setup()), /iPhone/);
    assert.equal(ios.status, "FAIL");
    assert.match(ios.hint ?? "", /REACT_NATIVE_PACKAGER_HOSTNAME/);
    assert.match(ios.hint ?? "", /npx expo login/);
  });

  it("reads the SDK, the address and the Expo account from a manifest, or the SDK from its runtime version", () => {
    assert.deepEqual(readManifest(JSON.stringify({ extra: { expoClient: { sdkVersion: "57.0.0", hostUri: "10.0.0.2:8081" }, expoGo: { username: "plant-expo" } } })), {
      sdkVersion: "57.0.0",
      hostUri: "10.0.0.2:8081",
      username: "plant-expo",
    });
    assert.deepEqual(readManifest(JSON.stringify({ runtimeVersion: "exposdk:57.0.0", extra: { expoGo: { debuggerHost: "10.0.0.2:8081" } } })), { sdkVersion: "57.0.0", hostUri: "10.0.0.2:8081" });
    assert.equal(readManifest("<html>"), null);
    assert.equal(readManifest("[]"), null);
  });
});

describe("the clock and time zone", () => {
  it("passes a zone that differs only in its name", async () => {
    const clock = step(await runChecks(setup({ localTimeZone: "Asia/Calcutta" })), /Clock/);
    assert.equal(clock.status, "PASS");
    assert.match(clock.lines[0], /agrees with the plant's \(Asia\/Kolkata\)/);
    assert.match(clock.lines.join(" "), /DCRS's clock agrees with this computer's/);
  });

  it("fails another time zone, with how to set India Standard Time", async () => {
    const clock = step(await runChecks(setup({ localTimeZone: "Asia/Karachi" })), /Clock/);
    assert.equal(clock.status, "FAIL");
    assert.match(clock.hint ?? "", /India Standard Time/);
    assert.match(clock.hint ?? "", /Set-TimeZone -Id "India Standard Time"/);
    assert.match(clock.lines.join(" "), /counts "today" by this computer's clock/);
  });

  it("fails a DCRS clock minutes away from this computer's", async () => {
    dcrsClockShiftMs = 10 * 60 * 1000;
    const clock = step(await runChecks(setup()), /Clock/);
    assert.equal(clock.status, "FAIL");
    assert.match(clock.lines.join(" "), /differ by 10 minutes/);
  });

  it("writes the factory's time in words", () => {
    const at = new Date("2026-10-02T12:15:00Z");
    assert.equal(wallClock(at, "Asia/Kolkata"), "2026-10-02 17:45");
    assert.equal(timeWords(at, "Asia/Kolkata"), "Friday 2 October 2026, 5:45 pm");
    assert.equal(timeWords(new Date("2026-10-01T18:40:00Z"), "Asia/Kolkata"), "Friday 2 October 2026, 12:10 am");
    assert.equal(wallClock(at, "Not/AZone"), null);
  });
});

describe("DCRS's settings and hours", () => {
  it("says when staff can sign in, open or closed", async () => {
    let hoursStep = step(await runChecks(setup()), /working hours/);
    assert.equal(hoursStep.status, "PASS");
    assert.match(hoursStep.lines.join(" "), /Right now staff can sign in/);
    config = { features: { demoMode: false, signup: false }, hours: { ...OPEN_HOURS, openNow: false, todayText: "Today is Thursday, the weekly off." } };
    hoursStep = step(await runChecks(setup()), /working hours/);
    assert.equal(hoursStep.status, "PASS");
    assert.match(hoursStep.lines.join(" "), /only the super admin can sign in/);
    assert.match(hoursStep.lines.join(" "), /weekly off/);
  });

  it("warns about hours switched off, Demo Mode, open sign-up and unreadable hours", async () => {
    config = { features: { demoMode: true, signup: true }, hours: { ...OPEN_HOURS, enforced: false } };
    let hoursStep = step(await runChecks(setup()), /working hours/);
    assert.equal(hoursStep.status, "WARN");
    assert.match(hoursStep.lines.join(" "), /switched off \(DCRS_WORKING_HOURS=off\)/);
    assert.match(hoursStep.lines.join(" "), /Demo Mode is on/);
    assert.match(hoursStep.lines.join(" "), /Anyone can create an account/);
    assert.match(hoursStep.hint ?? "", /DEMO_MODE/);
    config = { features: {}, hours: null };
    hoursStep = step(await runChecks(setup()), /working hours/);
    assert.equal(hoursStep.status, "WARN");
    assert.match(hoursStep.lines.join(" "), /could not read its database/);
  });
});

describe("a sign-in through Mitra", () => {
  it("shows a refusal in DCRS's own words", async () => {
    loginAnswer = { status: 403, body: { error: "forbidden", message: "DCRS is closed now. It opens on Saturday 3 October at 8:40 am." } };
    const signIn = step(await runChecks(setup({ email: "kapila.barad@gpp.local", password: PASSWORD })), /sign-in through Mitra/);
    assert.equal(signIn.status, "FAIL");
    assert.match(signIn.lines[0], /refused \(403\): DCRS is closed now/);
    assert.match(signIn.hint ?? "", /DCRS's own words/);
  });

  it("says what a wrong password and an unreachable DCRS mean", async () => {
    let signIn = step(await runChecks(setup({ email: "kapila.barad@gpp.local", password: "wrong-password" })), /sign-in through Mitra/);
    assert.equal(signIn.status, "FAIL");
    assert.match(signIn.hint ?? "", /Check the email and the password/);
    assert.ok(!report([signIn], setup()).includes("wrong-password"));
    loginAnswer = { status: 503, body: { error: "upstream_unavailable", message: "Couldn't reach Digital Controlled Record System. Try again in a moment." } };
    signIn = step(await runChecks(setup({ email: "kapila.barad@gpp.local", password: PASSWORD })), /sign-in through Mitra/);
    assert.match(signIn.hint ?? "", /DCRS_BASE_URL=http:\/\/127\.0\.0\.1:/);
  });

  it("asks nothing of the Mitra server without a password", async () => {
    const signIn = step(await runChecks(setup({ email: "kapila.barad@gpp.local" })), /sign-in through Mitra/);
    assert.equal(signIn.status, "FAIL");
    assert.match(signIn.lines[0], /PHONE_CHECK_PASSWORD is not set/);
    assert.match(signIn.hint ?? "", /never typed on the command line/);
    assert.equal(mitra.seen.filter((r) => r.url === "/auth/login").length, 0);
  });
});

describe("the command line", () => {
  it("takes --email, and refuses a password", () => {
    assert.deepEqual(parseArgs([]), { help: false });
    assert.deepEqual(parseArgs(["--email", "kapila.barad@gpp.local"]), { help: false, email: "kapila.barad@gpp.local" });
    assert.deepEqual(parseArgs(["--email=admin@gpp.local"]), { help: false, email: "admin@gpp.local" });
    assert.equal(parseArgs(["--help"]).help, true);
    assert.match(parseArgs(["--email"]).error ?? "", /needs a DCRS sign-in email/);
    assert.match(parseArgs(["--email", "not-an-email"]).error ?? "", /not an email address/);
    for (const a of ["--password", "--password=secret", "--pass", "-password"]) assert.match(parseArgs(["--email", "a@b.c", a]).error ?? "", /never given on the command line/, a);
    assert.match(parseArgs(["--host", "1.2.3.4"]).error ?? "", /not something this check knows/);
  });

  it("says why a request got no answer, in words", () => {
    assert.equal(whyNoAnswer(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }), 5000), "nothing is listening there");
    assert.equal(whyNoAnswer(new DOMException("timed out", "TimeoutError"), 5000), "no answer within 5 seconds");
    assert.equal(whyNoAnswer(Object.assign(new TypeError("fetch failed"), { cause: { code: "EHOSTUNREACH" } }), 5000), "that address cannot be reached from here");
  });
});
