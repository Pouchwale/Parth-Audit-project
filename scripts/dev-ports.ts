// NPM RUN DEV WITH ITS PORTS ALREADY TAKEN (REQUIREMENTS §101). Before `npm run dev`
// starts anything, it asks who holds its two ports:
//   * nobody: the port is free and the part starts as before;
//   * DCRS itself (the API answers /api/health, the website's page names the system):
//     another `npm run dev` is still open, so that part is not started twice;
//   * something else: the website moves to the next free port and says so; the API
//     cannot move (the website proxies to it and the phones are told it), so the
//     start stops with the program that holds it and how to free it.
// Before this, a second `npm run dev` died with Node's EADDRINUSE stack and took the
// API it had just started down with it.
import { spawnSync } from "node:child_process";
import http from "node:http";
import net from "node:net";

export type PortState = "free" | "dcrs-api" | "dcrs-web" | "taken";

/** Whether the port can be listened on the way the servers listen (every address). */
export function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port);
  });
}

function ask(port: number, path: string, timeoutMs: number): Promise<{ status: number; body: string } | null> {
  return new Promise((resolve) => {
    // A connection of its own (agent: false), closed after the answer, not kept alive.
    const req = http.get({ host: "127.0.0.1", port, path, timeout: timeoutMs, agent: false }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        if (body.length < 50_000) body += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      res.on("error", () => resolve(null));
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

/** Who holds the port: nobody, DCRS's own API or website, or some other program. */
export async function portState(port: number, kind: "api" | "web", timeoutMs = 1500): Promise<PortState> {
  if (await portFree(port)) return "free";
  if (kind === "api") {
    const answer = await ask(port, "/api/health", timeoutMs);
    if (answer && answer.status === 200 && /"ok"\s*:\s*true/.test(answer.body)) return "dcrs-api";
  } else {
    const answer = await ask(port, "/", timeoutMs);
    if (answer && answer.status === 200 && answer.body.includes("Digital Controlled Record System")) return "dcrs-web";
  }
  return "taken";
}

/** The first free port after `from`, or null when none of the next `tries` is free. */
export async function nextFreePort(from: number, tries = 20): Promise<number | null> {
  for (let port = from + 1; port <= from + tries; port++) if (await portFree(port)) return port;
  return null;
}

/** The program listening on the port, on Windows ("node.exe (PID 1234)"), or null when it cannot be told. */
export function holderOf(port: number): string | null {
  if (process.platform !== "win32") return null;
  const netstat = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8", windowsHide: true });
  if (netstat.status !== 0 || !netstat.stdout) return null;
  const line = netstat.stdout.split(/\r?\n/).find((l) => new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+\\d+\\s*$`).test(l));
  const pid = line?.trim().split(/\s+/).pop();
  if (!pid || !/^\d+$/.test(pid)) return null;
  const tasklist = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
  const name = tasklist.stdout?.split(/\r?\n/)[0]?.split('","')[0]?.replace(/^"/, "");
  return name && !name.startsWith("INFO:") ? `${name} (PID ${pid})` : `PID ${pid}`;
}

export interface DevPlan {
  startApi: boolean;
  /** The website's port, or null when it is not started (DCRS's website already answers there). */
  webPort: number | null;
  /** Plain sentences for the terminal, in order. */
  notes: string[];
  /** When set, nothing may start: say this and stop with an error. */
  stop?: string;
}

/** What `npm run dev` should start, from who holds its two ports. */
export async function planDev(apiPort: number, webPort: number, probe = { portState, nextFreePort, holderOf }): Promise<DevPlan> {
  const notes: string[] = [];
  const api = await probe.portState(apiPort, "api");
  if (api === "taken") {
    const who = probe.holderOf(apiPort);
    return {
      startApi: false,
      webPort: null,
      notes,
      stop:
        `Port ${apiPort}, which DCRS's server needs, is used by ${who ?? "another program"}. ` +
        `Close that program (or end it in Task Manager${who ? `: ${who}` : ""}), then run npm run dev again.`,
    };
  }
  const startApi = api === "free";
  if (!startApi) notes.push(`DCRS's server is already running on port ${apiPort} (another npm run dev is still open), so it is not started again.`);

  const web = await probe.portState(webPort, "web");
  let chosen: number | null = webPort;
  if (web === "dcrs-web") {
    chosen = null;
    notes.push(`DCRS's website is already open at http://localhost:${webPort}, so it is not started again.`);
  } else if (web === "taken") {
    const who = probe.holderOf(webPort);
    chosen = await probe.nextFreePort(webPort);
    if (chosen === null) {
      return { startApi: false, webPort: null, notes, stop: `Port ${webPort} is used by ${who ?? "another program"} and no free port was found after it. Close that program, then run npm run dev again.` };
    }
    notes.push(`Port ${webPort} is used by ${who ?? "another program"}, so the website starts at http://localhost:${chosen} instead.`);
  }
  if (!startApi && chosen === null) {
    notes.push(`DCRS is already running: open http://localhost:${webPort}. To restart it with new code, stop the other npm run dev first (Ctrl+C in its window), then run npm run dev again.`);
  }
  return { startApi, webPort: chosen, notes };
}
