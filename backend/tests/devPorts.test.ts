// NPM RUN DEV WITH ITS PORTS ALREADY TAKEN, scripts/dev-ports.ts (REQUIREMENTS §101):
//   * a free port reads as free; one held reads as taken, unless DCRS answers on it;
//   * DCRS's API is known by /api/health, its website by its page naming the system;
//   * the plan: nothing started twice, the website moved to the next free port when
//     another program holds 5173, and a taken API port stops the start with words.
// Run: npm run test:unit -- devPorts
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { nextFreePort, planDev, portFree, portState, type PortState } from "../../scripts/dev-ports.ts";

// A server on a port the system picks. Closing it ends its connections too: the bare
// one never answers, so a probe's connection would otherwise hold it open for ever.
function listen(handler?: http.RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = handler ? http.createServer(handler) : net.createServer();
    const sockets = new Set<net.Socket>();
    server.on("connection", (socket: net.Socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      const close = () =>
        new Promise<void>((done) => {
          server.close(() => done());
          for (const socket of sockets) socket.destroy();
        });
      resolve({ port, close });
    });
  });
}

test("a free port reads as free, a held one as taken", async () => {
  const held = await listen();
  try {
    assert.equal(await portFree(held.port), false);
    assert.equal(await portState(held.port, "web", 500), "taken");
  } finally {
    await held.close();
  }
  assert.equal(await portFree(held.port), true);
  assert.equal(await portState(held.port, "web", 500), "free");
});

test("DCRS's API is known by its health answer, and only by it", async () => {
  const dcrs = await listen((req, res) => {
    if (req.url === "/api/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, at: new Date().toISOString() }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  const other = await listen((_req, res) => {
    res.statusCode = 404;
    res.end("Not here");
  });
  try {
    assert.equal(await portState(dcrs.port, "api", 1000), "dcrs-api");
    assert.equal(await portState(other.port, "api", 1000), "taken");
  } finally {
    await dcrs.close();
    await other.close();
  }
});

test("DCRS's website is known by its page naming the system", async () => {
  const page = await listen((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><title>Digital Controlled Record System — Gujarat Print Pack Publications Pvt Ltd</title>");
  });
  const vite = await listen((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><title>Another app</title>");
  });
  try {
    assert.equal(await portState(page.port, "web", 1000), "dcrs-web");
    assert.equal(await portState(vite.port, "web", 1000), "taken");
  } finally {
    await page.close();
    await vite.close();
  }
});

test("the next free port skips a held one", async () => {
  const held = await listen();
  try {
    const next = await nextFreePort(held.port - 1, 5);
    assert.notEqual(next, held.port);
    assert.ok(next !== null && next > held.port - 1);
  } finally {
    await held.close();
  }
});

// The plan, with the ports' states given rather than probed.
const probeOf = (api: PortState, web: PortState, freeAfter: number | null = 5174) => ({
  portState: async (_port: number, kind: "api" | "web") => (kind === "api" ? api : web),
  nextFreePort: async () => freeAfter,
  holderOf: () => "node.exe (PID 4242)",
});

test("both ports free: both parts start where they always did", async () => {
  const plan = await planDev(4000, 5173, probeOf("free", "free"));
  assert.deepEqual({ startApi: plan.startApi, webPort: plan.webPort, stop: plan.stop }, { startApi: true, webPort: 5173, stop: undefined });
  assert.equal(plan.notes.length, 0);
});

test("another npm run dev still open: nothing starts twice, and it says where DCRS already is", async () => {
  const plan = await planDev(4000, 5173, probeOf("dcrs-api", "dcrs-web"));
  assert.equal(plan.startApi, false);
  assert.equal(plan.webPort, null);
  assert.equal(plan.stop, undefined);
  assert.match(plan.notes.join(" "), /already running: open http:\/\/localhost:5173/);
});

test("another program on 5173: the website moves to the next free port and says so", async () => {
  const plan = await planDev(4000, 5173, probeOf("free", "taken", 5174));
  assert.equal(plan.startApi, true);
  assert.equal(plan.webPort, 5174);
  assert.match(plan.notes.join(" "), /Port 5173 is used by node\.exe \(PID 4242\), so the website starts at http:\/\/localhost:5174 instead/);
});

test("another program on the API's port: nothing starts, and it names the program", async () => {
  const plan = await planDev(4000, 5173, probeOf("taken", "free"));
  assert.equal(plan.startApi, false);
  assert.equal(plan.webPort, null);
  assert.match(plan.stop ?? "", /Port 4000, which DCRS's server needs, is used by node\.exe \(PID 4242\)/);
});

test("DCRS's server already running alone: only the website starts", async () => {
  const plan = await planDev(4000, 5173, probeOf("dcrs-api", "free"));
  assert.equal(plan.startApi, false);
  assert.equal(plan.webPort, 5173);
  assert.match(plan.notes.join(" "), /server is already running on port 4000/);
});
