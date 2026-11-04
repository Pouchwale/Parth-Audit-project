// BACKUPS FROM USERS & ACCESS (backend/backupRoutes.ts; the owner, 2-Nov-2026), on a real Express server with a
// stand-in for the database step: the super admin alone starts one, one runs at a time, the database backup's files
// are listed and downloadable, the code-and-database backup zips the repository (made here as a tiny folder) with
// the dump and a README and without node_modules, backend/data or any .env, three zips are kept, and each run is
// one line in the activity log.
// Run: npm run test:unit -- backup
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import { BACKUP_RUNNING_CODE, backupFileKind, failureLineOf, listBackups, pruneCodeZips, registerBackupRoutes, stampOf, type BackupStatus, type DatabaseBackupResult } from "../backupRoutes.ts";

const PEOPLE: Record<string, PublicUser> = {
  "u-admin": { id: "u-admin", name: "Super Admin", email: "superadmin05@gmail.com", role: "admin", departments: [] },
  "u-kapila": { id: "u-kapila", name: "Kapila Barad", email: "kapila.barad@gpp.local", role: "staff", departments: ["QC"] },
};

interface Server {
  base: string;
  dir: string;
  repo: string;
  lines: { who: string | null; action: string; target: string; detail: string }[];
  /** What the next database step does. */
  next: { kind: "ok" | "fail" | "wait"; release?: () => void };
  close: () => Promise<void>;
}

const WIN = process.platform === "win32";

function makeRepo(root: string): void {
  for (const d of ["backend/data/backups", "frontend/src", "node_modules/left-pad", "docs", ".git", "logs"]) mkdirSync(path.join(root, d), { recursive: true });
  writeFileSync(path.join(root, "backend", "index.ts"), "// the server\n");
  writeFileSync(path.join(root, "backend", ".env"), "CHATGPT_API_KEY=secret\n");
  writeFileSync(path.join(root, "backend", "data", "postgres-password"), "pw\n");
  writeFileSync(path.join(root, "frontend", "src", "App.tsx"), "// the app\n");
  writeFileSync(path.join(root, "node_modules", "left-pad", "index.js"), "module.exports = 1\n");
  writeFileSync(path.join(root, "docs", "REQUIREMENTS.md"), "# req\n");
  writeFileSync(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(path.join(root, "logs", "server.log"), "lines\n");
  writeFileSync(path.join(root, "package.json"), "{}\n");
}

async function start(): Promise<Server> {
  const repo = mkdtempSync(path.join(os.tmpdir(), "dcrs-backup-test-"));
  makeRepo(repo);
  const dir = path.join(repo, "backend", "data", "backups");
  writeFileSync(path.join(dir, "dcrs-before-demo-removal-2026-09-19.dump"), "old dump");
  writeFileSync(path.join(dir, "backup-log.txt"), "not a backup\n");
  const lines: Server["lines"] = [];
  const next: Server["next"] = { kind: "ok" };
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 10, 2, 6, 0, tick++));
  const app = express();
  app.use(express.json());
  const signedIn = (req: Request): PublicUser | undefined => PEOPLE[String(req.get("x-test-user"))];
  const requireAuth = (req: Request, res: Response, nextFn: NextFunction): void => {
    const u = signedIn(req);
    if (!u) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }
    (req as Request & { user: PublicUser }).user = u;
    nextFn();
  };
  const requireAdmin = (req: Request, res: Response, nextFn: NextFunction): void => {
    const u = signedIn(req);
    if (!u || u.role !== "admin") {
      res.status(403).json({ error: "Admin only." });
      return;
    }
    nextFn();
  };
  const runDatabase = async (ctx: { dir: string }): Promise<DatabaseBackupResult> => {
    if (next.kind === "wait") await new Promise<void>((resolve) => (next.release = resolve));
    if (next.kind === "fail") return { ok: false, output: "Backing up...\nThe backup FAILED. pg_dump is not installed on this computer.\nNothing older was deleted.\n" };
    const stamp = stampOf(new Date());
    writeFileSync(path.join(ctx.dir, `dcrs-${stamp}.dump`), "PGDMP fake dump");
    writeFileSync(path.join(ctx.dir, `roles-${stamp}.sql`), "CREATE ROLE dcrs_backup;\n");
    return { ok: true, output: "Done. The backup is complete.\n" };
  };
  registerBackupRoutes(app, {
    requireAuth,
    requireAdmin,
    logActivity: (_req, who, action, target = "", detail = "") => lines.push({ who: who?.email ?? null, action, target, detail }),
    repoRoot: repo,
    dir,
    runDatabase,
    clock,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    dir,
    repo,
    lines,
    next,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          rmSync(repo, { recursive: true, force: true });
          resolve();
        });
      }),
  };
}

let s: Server;
before(async () => {
  s = await start();
});
after(async () => {
  await s.close();
});

const call = async (method: string, route: string, who: string | null, body?: unknown): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> => {
  const res = await fetch(`${s.base}${route}`, {
    method,
    headers: { "content-type": "application/json", ...(who ? { "x-test-user": who } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { text };
  }
  return { status: res.status, body: parsed, headers: res.headers };
};

async function untilDone(): Promise<BackupStatus> {
  for (let i = 0; i < 200; i++) {
    const r = await call("GET", "/api/backup", "u-admin");
    const st = r.body as unknown as BackupStatus;
    if (!st.running) return st;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the backup never finished");
}

describe("backups from Users & Access", () => {
  it("the file kinds are told by name, and nothing that is not a backup is listed or served", () => {
    assert.equal(backupFileKind("dcrs-2026-11-02-1130.dump"), "database");
    assert.equal(backupFileKind("dcrs-before-demo-removal-2026-09-19.dump"), "database");
    assert.equal(backupFileKind("roles-2026-11-02-1130.sql"), "roles");
    assert.equal(backupFileKind("mitra-2026-11-02-1130.dump"), "mitra");
    assert.equal(backupFileKind("dcrs-code-and-database-2026-11-02-1130.zip"), "code-and-database");
    assert.equal(backupFileKind("backup-log.txt"), null);
    assert.equal(backupFileKind("../backend/.env"), null);
    assert.equal(backupFileKind("..\\x.dump"), null);
    assert.equal(failureLineOf("Backing up...\nThe backup FAILED. pg_dump is not installed.\nNothing older was deleted.\n"), "The backup FAILED. pg_dump is not installed.");
  });

  it("the staff cannot read, start or download a backup; the super admin reads the folder", async () => {
    assert.equal((await call("GET", "/api/backup", "u-kapila")).status, 403);
    assert.equal((await call("POST", "/api/backup", "u-kapila", { kind: "database" })).status, 403);
    assert.equal((await call("GET", "/api/backup/files/dcrs-before-demo-removal-2026-09-19.dump", "u-kapila")).status, 403);
    assert.equal((await call("DELETE", "/api/backup/files/dcrs-before-demo-removal-2026-09-19.dump", "u-kapila")).status, 403, "nor delete one");
    assert.equal((await call("GET", "/api/backup", null)).status, 401);
    const r = await call("GET", "/api/backup", "u-admin");
    assert.equal(r.status, 200);
    const st = r.body as unknown as BackupStatus;
    assert.equal(st.running, null);
    assert.equal(st.last, null);
    assert.deepEqual(
      st.files.map((f) => [f.name, f.kind]),
      [["dcrs-before-demo-removal-2026-09-19.dump", "database"]],
      "the old dump is listed; backup-log.txt is not"
    );
  });

  it("a backup must be asked for by kind", async () => {
    assert.equal((await call("POST", "/api/backup", "u-admin", { kind: "everything" })).status, 400);
    assert.equal((await call("POST", "/api/backup", "u-admin", {})).status, 400);
  });

  it("the database backup runs the script's step, lists its files, and is one line in the activity log", async () => {
    s.next.kind = "ok";
    const r = await call("POST", "/api/backup", "u-admin", { kind: "database" });
    assert.equal(r.status, 202);
    const st = await untilDone();
    assert.ok(st.last?.ok, st.last?.message ?? "no last run");
    assert.equal(st.last?.kind, "database");
    assert.equal(st.last?.by, "superadmin05@gmail.com");
    assert.equal(st.last?.files?.length, 2);
    assert.match(st.last?.message ?? "", /^The database was backed up: dcrs-\d{4}-\d{2}-\d{2}-\d{4}\.dump \(\d+ B\), roles-.*\.sql \(\d+ B\)\.$/);
    // Two files written in the same instant list in either order.
    assert.deepEqual(st.files.slice(0, 2).map((f) => f.kind).sort(), ["database", "roles"]);
    const line = s.lines[s.lines.length - 1];
    assert.equal(line.action, "Backed up the database");
    assert.equal(line.target, "Backup");
    assert.equal(line.who, "superadmin05@gmail.com");
  });

  it("a backup file is downloaded by its name; a name that is not a backup's is refused, a missing one is 404", async () => {
    const st = (await call("GET", "/api/backup", "u-admin")).body as unknown as BackupStatus;
    const dump = st.files.find((f) => f.kind === "database" && f.name !== "dcrs-before-demo-removal-2026-09-19.dump")!;
    const res = await fetch(`${s.base}/api/backup/files/${dump.name}`, { headers: { "x-test-user": "u-admin" } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition") ?? "", new RegExp(`attachment; filename="${dump.name}"`));
    assert.equal(await res.text(), "PGDMP fake dump");
    assert.equal((await call("GET", "/api/backup/files/backup-log.txt", "u-admin")).status, 400);
    assert.equal((await call("GET", "/api/backup/files/dcrs-2020-01-01-0000.dump", "u-admin")).status, 404);
  });

  it("the code-and-database backup zips the repository with the dump and a README, leaving node_modules, backend/data, the logs and every .env out", async () => {
    s.next.kind = "ok";
    assert.equal((await call("POST", "/api/backup", "u-admin", { kind: "code-and-database" })).status, 202);
    const st = await untilDone();
    assert.ok(st.last?.ok, st.last?.message ?? "no last run");
    const zip = st.last!.files![st.last!.files!.length - 1];
    assert.match(zip, WIN ? /^dcrs-code-and-database-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/ : /^dcrs-code-and-database-\d{4}-\d{2}-\d{2}-\d{4}\.tgz$/);
    assert.match(st.last?.message ?? "", /^The code and the database were backed up: dcrs-code-and-database-.* holding the repository and the database files dcrs-.*\.dump, roles-.*\.sql\.$/);
    assert.equal(st.files[0].name, zip, "the zip is the newest file listed");
    assert.equal(st.files[0].kind, "code-and-database");
    const tar = WIN ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
    const listed = execFileSync(tar, ["-tf", path.join(s.dir, zip)], { encoding: "utf8" })
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^\.\//, ""))
      .filter(Boolean);
    for (const want of ["backend/index.ts", "frontend/src/App.tsx", "docs/REQUIREMENTS.md", ".git/HEAD", "package.json", "BACKUP-README.txt"]) assert.ok(listed.includes(want), `${want} is in the zip`);
    assert.ok(listed.some((l) => /^dcrs-\d{4}-\d{2}-\d{2}-\d{4}\.dump$/.test(l)), "the dump is in the zip");
    assert.ok(listed.some((l) => /^roles-.*\.sql$/.test(l)), "the roles file is in the zip");
    for (const not of ["node_modules", "backend/data", "backend/.env", "logs/", "server.log"]) assert.ok(!listed.some((l) => l.includes(not)), `${not} is not in the zip: ${listed.join(" ")}`);
    assert.equal(s.lines[s.lines.length - 1].action, "Backed up the code and the database");
  });

  it("three code zips are kept, the older ones deleted", async () => {
    for (const stamp of ["2026-10-01-0100", "2026-10-02-0100", "2026-10-03-0100", "2026-10-04-0100"]) {
      const name = `dcrs-code-and-database-${stamp}.${WIN ? "zip" : "tgz"}`;
      writeFileSync(path.join(s.dir, name), "zip");
      const t = new Date(`${stamp.slice(0, 10)}T01:00:00Z`);
      const { utimesSync } = await import("node:fs");
      utimesSync(path.join(s.dir, name), t, t);
    }
    const before = listBackups(s.dir).filter((f) => f.kind === "code-and-database").length;
    assert.ok(before >= 5);
    const gone = pruneCodeZips(s.dir);
    assert.equal(gone.length, before - 3);
    assert.ok(gone.includes(`dcrs-code-and-database-2026-10-01-0100.${WIN ? "zip" : "tgz"}`));
    assert.equal(listBackups(s.dir).filter((f) => f.kind === "code-and-database").length, 3);
  });

  it("one backup at a time: a second start is refused while the first runs", async () => {
    s.next.kind = "wait";
    assert.equal((await call("POST", "/api/backup", "u-admin", { kind: "database" })).status, 202);
    const again = await call("POST", "/api/backup", "u-admin", { kind: "database" });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, BACKUP_RUNNING_CODE);
    const running = (await call("GET", "/api/backup", "u-admin")).body as unknown as BackupStatus;
    assert.equal(running.running?.kind, "database");
    s.next.kind = "ok";
    s.next.release?.();
    const st = await untilDone();
    assert.ok(st.last?.ok);
  });

  it("a failed database step is said in the script's own words, nothing is listed for it, and the log says it failed", async () => {
    s.next.kind = "fail";
    const countBefore = readdirSync(s.dir).length;
    assert.equal((await call("POST", "/api/backup", "u-admin", { kind: "code-and-database" })).status, 202);
    const st = await untilDone();
    assert.equal(st.last?.ok, false);
    assert.equal(st.last?.message, "The backup failed. The backup FAILED. pg_dump is not installed on this computer.");
    assert.equal(readdirSync(s.dir).length, countBefore, "no zip was made");
    assert.equal(s.lines[s.lines.length - 1].action, "Backup failed");
    assert.match(s.lines[s.lines.length - 1].detail, /^the code and the database: The backup FAILED/);
    assert.ok(existsSync(path.join(s.repo, "backend", ".env")), "nothing of the repository was touched");
  });

  it("the super admin deletes a backup file by its name (REQUIREMENTS §182): listed no more, one line in the log; a name that is not a backup's is refused, a missing one is 404, nothing is deleted while a backup runs", async () => {
    s.next.kind = "ok";
    writeFileSync(path.join(s.dir, "dcrs-2026-10-01-0900.dump"), "PGDMP to delete");
    assert.equal((await call("DELETE", "/api/backup/files/backup-log.txt", "u-admin")).status, 400, "not a backup: refused");
    assert.ok(existsSync(path.join(s.dir, "backup-log.txt")), "...and left where it was");
    assert.equal((await call("DELETE", "/api/backup/files/..%2F..%2Fpackage.json", "u-admin")).status, 400, "no way out of the folder");
    assert.equal((await call("DELETE", "/api/backup/files/dcrs-2020-01-01-0000.dump", "u-admin")).status, 404);
    s.next.kind = "wait";
    assert.equal((await call("POST", "/api/backup", "u-admin", { kind: "database" })).status, 202);
    const busy = await call("DELETE", "/api/backup/files/dcrs-2026-10-01-0900.dump", "u-admin");
    assert.equal(busy.status, 409, "not while a backup runs");
    assert.ok(existsSync(path.join(s.dir, "dcrs-2026-10-01-0900.dump")));
    s.next.kind = "ok";
    s.next.release?.();
    await untilDone();
    const r = await call("DELETE", "/api/backup/files/dcrs-2026-10-01-0900.dump", "u-admin");
    assert.equal(r.status, 200);
    assert.ok(!existsSync(path.join(s.dir, "dcrs-2026-10-01-0900.dump")), "the file is gone");
    const st = r.body as unknown as BackupStatus;
    assert.ok(!st.files.some((f) => f.name === "dcrs-2026-10-01-0900.dump"), "the answer is the folder as it now stands");
    const line = s.lines[s.lines.length - 1];
    assert.deepEqual([line.action, line.target], ["Deleted a backup", "Backup"]);
    assert.match(line.detail, /^dcrs-2026-10-01-0900\.dump \(/);
  });
});

