// MITRA ON THE PHONES: GET /api/phone-app, backend/phoneApp.ts, on a real Express
// server, with stand-ins for Expo's server and the Mitra server on spare ports of
// this computer — never the plant's own 8081 and 3000. What is proved:
//   * the door: not signed in is refused (requireAuth), and the answer is never
//     cached;
//   * the answer is EXACTLY { expoGo: { port, running }, mitraServer: { port,
//     running }, addresses: [{ ip, interface }] } (the QR card reads it), the
//     addresses best first;
//   * "running" is true only for the right answer: Expo's "packager-status:running"
//     at /status, the Mitra server's { "ok": true } at /health — not for another
//     program on the port, an error, a closed port, or a server that never
//     answers (given up after the time allowed: a second at the plant);
//   * the ports come from MITRA_EXPO_PORT and MITRA_SERVER_PORT, 8081 and 3000
//     unless set to a real port;
//   * DCRS's start-up lines name this computer's address.
// Run: npm run test:unit -- phoneApp
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { InterfaceTable } from "../lanAddresses.ts";
import { DEFAULT_EXPO_GO_PORT, DEFAULT_MITRA_SERVER_PORT, EXPO_RUNNING_TEXT, PROBE_TIMEOUT_MS, phoneAppAnswer, portFrom, printCompanyNetwork, registerPhoneAppRoutes } from "../phoneApp.ts";

// ---------------------------------------------------------------------------
// the stand-ins

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

interface StandIn {
  port: number;
  setHandler(h: Handler): void;
  close(): Promise<void>;
}

async function standIn(initial: Handler): Promise<StandIn> {
  let handler = initial;
  const server = http.createServer((req, res) => handler(req, res));
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  return {
    port: (server.address() as AddressInfo).port,
    setHandler: (h) => {
      handler = h;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Expo's server as Expo Go meets it: /status says it runs. */
const expoAnswers: Handler = (req, res) => {
  if (req.url === "/status") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(EXPO_RUNNING_TEXT);
    return;
  }
  res.writeHead(404).end();
};

/** The Mitra server: /health is { ok: true }. */
const mitraAnswers: Handler = (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404).end();
};

/** A port nothing listens on: one the system just handed out and took back. */
async function closedPort(): Promise<number> {
  const s = await standIn(() => undefined);
  const port = s.port;
  await s.close();
  return port;
}

const TABLE: InterfaceTable = {
  "vEthernet (WSL (Hyper-V firewall))": [{ address: "172.29.144.1", family: "IPv4", internal: false }],
  "Ethernet 7": [{ address: "10.192.193.24", family: "IPv4", internal: false }],
  "Wi-Fi": [{ address: "192.168.0.107", family: "IPv4", internal: false }],
  "Loopback Pseudo-Interface 1": [{ address: "127.0.0.1", family: "IPv4", internal: true }],
};

// The server's own requireAuth reads the session; this one reads a test header.
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.get("x-test-user") !== "staff") {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  next();
}

let expo: StandIn;
let mitra: StandIn;
let dcrs: http.Server;
let base = "";

before(async () => {
  expo = await standIn(expoAnswers);
  mitra = await standIn(mitraAnswers);
  const app = express();
  registerPhoneAppRoutes(app, {
    requireAuth,
    env: { MITRA_EXPO_PORT: String(expo.port), MITRA_SERVER_PORT: String(mitra.port) },
    networkInterfaces: () => TABLE,
    timeoutMs: 300,
  });
  dcrs = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => dcrs.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(dcrs.address() as AddressInfo).port}`;
});

after(async () => {
  await expo.close();
  await mitra.close();
  await new Promise<void>((resolve) => dcrs.close(() => resolve()));
});

async function ask(who: string | null = "staff"): Promise<{ status: number; json: any; headers: Headers }> {
  const res = await fetch(`${base}/api/phone-app`, { headers: who ? { "x-test-user": who } : {} });
  return { status: res.status, json: await res.json(), headers: res.headers };
}

// ---------------------------------------------------------------------------

describe("GET /api/phone-app", () => {
  it("is refused to somebody not signed in", async () => {
    const got = await ask(null);
    assert.equal(got.status, 401);
    assert.equal(got.json.expoGo, undefined);
  });

  it("answers exactly the agreed shape, both servers running, this PC's addresses best first, never cached", async () => {
    expo.setHandler(expoAnswers);
    mitra.setHandler(mitraAnswers);
    const got = await ask();
    assert.equal(got.status, 200);
    assert.equal(got.headers.get("cache-control"), "no-store");
    assert.deepEqual(got.json, {
      expoGo: { port: expo.port, running: true },
      mitraServer: { port: mitra.port, running: true },
      addresses: [
        { ip: "192.168.0.107", interface: "Wi-Fi" },
        { ip: "10.192.193.24", interface: "Ethernet 7" },
        { ip: "172.29.144.1", interface: "vEthernet (WSL (Hyper-V firewall))" },
      ],
    });
    assert.deepEqual(Object.keys(got.json), ["expoGo", "mitraServer", "addresses"]);
  });

  it("says not running when another program answers on the port, or answers wrongly", async () => {
    expo.setHandler((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html>some other program</html>");
    });
    mitra.setHandler((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
    });
    let got = await ask();
    assert.deepEqual([got.json.expoGo.running, got.json.mitraServer.running], [false, false]);

    expo.setHandler((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(EXPO_RUNNING_TEXT);
    });
    mitra.setHandler((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{ not json");
    });
    got = await ask();
    assert.deepEqual([got.json.expoGo.running, got.json.mitraServer.running], [false, false]);

    mitra.setHandler((_req, res) => {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    got = await ask();
    assert.equal(got.json.mitraServer.running, false);
    expo.setHandler(expoAnswers);
    mitra.setHandler(mitraAnswers);
  });

  it("gives up on a server that never answers, within the time allowed", async () => {
    expo.setHandler(() => undefined); // never answers
    mitra.setHandler((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"ok":'); // starts, never finishes
    });
    const started = Date.now();
    const got = await ask();
    const took = Date.now() - started;
    assert.deepEqual([got.json.expoGo.running, got.json.mitraServer.running], [false, false]);
    // Both are looked at together, each for at most 300 ms here.
    assert.ok(took < 2000, `took ${took} ms`);
    expo.setHandler(expoAnswers);
    mitra.setHandler(mitraAnswers);
  });
});

describe("the answer without the route", () => {
  it("says not running when nothing listens", async () => {
    const port = await closedPort();
    const got = await phoneAppAnswer({ env: { MITRA_EXPO_PORT: String(port), MITRA_SERVER_PORT: String(port) }, networkInterfaces: () => ({}), timeoutMs: 500 });
    assert.deepEqual(got, { expoGo: { port, running: false }, mitraServer: { port, running: false }, addresses: [] });
  });

  it("uses 8081 and 3000 unless the environment names a real port", () => {
    assert.equal(DEFAULT_EXPO_GO_PORT, 8081);
    assert.equal(DEFAULT_MITRA_SERVER_PORT, 3000);
    assert.equal(PROBE_TIMEOUT_MS, 1000);
    assert.equal(portFrom(undefined, 8081), 8081);
    assert.equal(portFrom("", 8081), 8081);
    assert.equal(portFrom(" 19000 ", 8081), 19000);
    for (const bad of ["abc", "0", "65536", "70000", "-1", "80.5", "1e3"]) assert.equal(portFrom(bad, 3000), 3000, bad);
    assert.equal(portFrom("65535", 3000), 65535);
  });

  it("answers no addresses, rather than failing, when the system cannot list its network cards", async () => {
    const port = await closedPort();
    const got = await phoneAppAnswer({
      env: { MITRA_EXPO_PORT: String(port), MITRA_SERVER_PORT: String(port) },
      networkInterfaces: () => {
        throw new Error("uv_interface_addresses failed");
      },
      timeoutMs: 200,
    });
    assert.deepEqual(got.addresses, []);
  });
});

describe("what DCRS prints when it starts", () => {
  it("prints one line per real network card of this computer, or says it has none", () => {
    const lines: string[] = [];
    printCompanyNetwork(4000, (line) => lines.push(line));
    assert.ok(lines.length >= 1);
    for (const line of lines) assert.match(line, /^On the company network: (http:\/\/\d{1,3}(\.\d{1,3}){3}:4000 \(.+\)|no address yet - this computer is not connected to a network\.)$/);
  });
});
