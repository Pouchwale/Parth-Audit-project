import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express, Request, RequestHandler, Response } from "express";
import type { PublicUser } from "./auth.ts";
import { repoRoot as defaultRepoRoot } from "./paths.ts";

// BACKUPS FROM USERS & ACCESS (REQUIREMENTS §160; the owner, 2-Nov-2026: "add a backup option ... give two options
// like backup database, and backup with code and database, and make sure it works").
//
// Two buttons for the super admin, one job behind them:
//
//   the database              scripts/database/backup.ts, run exactly as `npm run db:backup` runs it: pg_dump of the
//                             whole database (every schema, table and row) and pg_dumpall of the server's roles,
//                             into backend/data/backups (or BACKUP_DIR), the older files kept fourteen days.
//   the code and the database the same, then one zip beside it — dcrs-code-and-database-<stamp>.zip — holding this
//                             repository (the source, the built website, the docs, the scripts, the git history
//                             and the phone app's folder) and the backup's own files, with a BACKUP-README.txt
//                             saying what is in it and how to restore. Left out: node_modules (npm install makes
//                             them again), backend/data (the running database and the backups themselves),
//                             the logs, and every .env — the keys are the owner's to copy by hand. The three
//                             newest zips are kept.
//
// The zip is made by the tar the operating system ships (Windows 10 and later carry bsdtar, which writes zip; any
// other system gets a .tgz), so nothing is added to the application for it. One backup runs at a time; the page
// polls GET /api/backup while it runs and lists every backup file for download. Each run, done or failed, is one
// line in the activity log.

export type BackupKind = "database" | "code-and-database";
export const BACKUP_KINDS: readonly BackupKind[] = ["database", "code-and-database"];
export const BACKUP_RUNNING_CODE = "backup-running";

export type BackupFileKind = "database" | "roles" | "mitra" | "code-and-database" | "other";

export interface BackupFile {
  name: string;
  kind: BackupFileKind;
  size: number;
  /** ISO time the file was written. */
  at: string;
}

export interface BackupRun {
  kind: BackupKind;
  by: string;
  startedAt: string;
  finishedAt?: string;
  ok?: boolean;
  /** What happened, in words for the page and the activity log. */
  message?: string;
  /** The files this run wrote, the zip last. */
  files?: string[];
}

export interface BackupStatus {
  running: BackupRun | null;
  last: BackupRun | null;
  files: BackupFile[];
  /** Where the files are, for the page to say. */
  dir: string;
}

export interface DatabaseBackupResult {
  ok: boolean;
  /** Everything the script printed (it hides passwords itself). */
  output: string;
}

export interface BackupDeps {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  logActivity: (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string) => void;
  /** The repository the code zip holds and the backup script runs in; the server's own when left out. */
  repoRoot?: string;
  /** Where the files go; backend/data/backups under `repoRoot`, or BACKUP_DIR, when left out. */
  dir?: string;
  /** The database step; the backup script when left out (tests put a stand-in here). */
  runDatabase?: (ctx: { repoRoot: string; dir: string; env: NodeJS.ProcessEnv }) => Promise<DatabaseBackupResult>;
  clock?: () => Date;
  env?: NodeJS.ProcessEnv;
}

// ---------------------------------------------------------------------------
// the files

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SCRIPT_FILE = /^(dcrs|roles|mitra)-\d{4}-\d{2}-\d{2}-\d{4}\.(dump|sql)$/;
const CODE_FILE = /^dcrs-code-and-database-\d{4}-\d{2}-\d{2}-\d{4}\.(zip|tgz)$/;

/** What a file in the backup folder is, by its name; null for a file that is not a backup at all. */
export function backupFileKind(name: string): BackupFileKind | null {
  if (!SAFE_NAME.test(name)) return null;
  if (CODE_FILE.test(name)) return "code-and-database";
  if (/^roles-.*\.sql$/.test(name)) return "roles";
  if (/^mitra-.*\.dump$/.test(name)) return "mitra";
  if (/\.dump$/.test(name)) return "database";
  if (/\.(sql|zip|tgz)$/.test(name)) return "other";
  return null;
}

export function backupDirOf(repoRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  const chosen = env.BACKUP_DIR?.trim();
  return chosen ? path.resolve(chosen) : path.join(repoRoot, "backend", "data", "backups");
}

/** Every backup file in the folder, newest first. */
export function listBackups(dir: string): BackupFile[] {
  if (!existsSync(dir)) return [];
  const out: BackupFile[] = [];
  for (const name of readdirSync(dir)) {
    const kind = backupFileKind(name);
    if (!kind) continue;
    try {
      const st = statSync(path.join(dir, name));
      if (!st.isFile()) continue;
      out.push({ name, kind, size: st.size, at: st.mtime.toISOString() });
    } catch {
      /* gone between the listing and the stat */
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.name.localeCompare(b.name)));
}

/** The script's own files written since `sinceMs` (a little slack for a clock that writes whole seconds). */
function filesWrittenSince(dir: string, sinceMs: number): string[] {
  return listBackups(dir)
    .filter((f) => SCRIPT_FILE.test(f.name) && new Date(f.at).getTime() >= sinceMs - 2000)
    .map((f) => f.name)
    .sort();
}

const pad = (n: number): string => String(n).padStart(2, "0");
/** YYYY-MM-DD-HHmm in this computer's time, as the backup script stamps its files. */
export const stampOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// the database step: the backup script, as `npm run db:backup` runs it

export function runBackupScript(ctx: { repoRoot: string; dir: string; env: NodeJS.ProcessEnv }): Promise<DatabaseBackupResult> {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", path.join("scripts", "database", "backup.ts")], {
      cwd: ctx.repoRoot,
      env: ctx.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d: Buffer) => (output += d.toString()));
    child.stderr.on("data", (d: Buffer) => (output += d.toString()));
    child.on("error", (err) => resolve({ ok: false, output: `${output}\n${err.message}` }));
    child.on("close", (code) => resolve({ ok: code === 0, output }));
  });
}

/** The line that says why, out of what the script printed. */
export function failureLineOf(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const failed = lines.find((l) => l.startsWith("The backup FAILED."));
  if (failed) return failed;
  const cannot = lines.find((l) => /not found|could not|cannot|no such|is not|ENOENT|error/i.test(l));
  return cannot ?? lines[lines.length - 1] ?? "The backup script said nothing.";
}

// ---------------------------------------------------------------------------
// the code step: one zip of the repository and the backup's files

/** Left out of the code zip: what npm makes again, the running database and its backups, the logs, and every key. */
export const CODE_EXCLUDES: readonly string[] = [
  "node_modules",
  "backend/data",
  "logs",
  "*.log",
  ".env",
  ".env.local",
  ".claude",
  ".devbuild",
  ".vscode",
  "tests/shots",
  "__pycache__",
  "desktop.ini",
  // Old copies of the whole project kept beside it on the plant PC (636 MB, each with its own database files): not
  // the code, and not git's.
  "IMPROVEMENTS",
];

export const README_NAME = "BACKUP-README.txt";

function readmeText(stamp: string, dumps: string[]): string {
  return [
    `DCRS - backup of the code and the database, ${stamp}`,
    "",
    "This zip holds:",
    "  - the application's whole repository: the source (backend/, frontend/, scripts/, docs/, tests/), the built",
    "    website (frontend/dist), the source documents, the git history (.git) and the phone app's folder;",
    ...(dumps.length
      ? [`  - the database backup made with it: ${dumps.join(", ")} (pg_dump --format=custom, and the server's roles).`]
      : ["  - no database file: the database step did not write one."]),
    "",
    "Left out on purpose:",
    "  - node_modules: run `npm install` in the restored folder (and in the phone app's folders) to make them again;",
    "  - backend/data: the running database's own files, the backups folder, the OCR cache and the server's secrets;",
    "  - every .env file: the keys are the owner's. Copy backend/.env (see backend/.env.example) by hand;",
    "  - the logs, and the IMPROVEMENTS folder of old copies of the project.",
    "",
    "To restore:",
    "  1. Unzip into a folder of its own and run `npm install` there.",
    "  2. Put backend/.env back (from your own copy of it).",
    '  3. Restore the database: docs/DEPLOYMENT.md, "Backups of the shared database". In short:',
    "     pg_restore --clean --if-exists --dbname=<the database> <the .dump file>, after the roles file.",
    "  4. `npm run build`, then start the server the usual way (scripts/windows/start-plant-servers.ps1).",
    "",
  ].join("\n");
}

/** The tar this computer ships: Windows 10 and later carry bsdtar in System32, which writes zip. */
function tarPath(): string {
  if (process.platform !== "win32") return "tar";
  const system = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  return existsSync(system) ? system : "tar";
}

export async function zipCode(ctx: { repoRoot: string; dir: string; stamp: string; dumps: string[] }): Promise<{ name: string; size: number }> {
  const win = process.platform === "win32";
  const name = `dcrs-code-and-database-${ctx.stamp}.${win ? "zip" : "tgz"}`;
  const out = path.join(ctx.dir, name);
  // Written under a name the listing does not know, and renamed when whole: a zip still being written is never
  // listed for download.
  const part = `${out}.part`;
  const readmeDir = path.join(os.tmpdir(), `dcrs-backup-readme-${process.pid}-${Date.now()}`);
  mkdirSync(readmeDir, { recursive: true });
  writeFileSync(path.join(readmeDir, README_NAME), readmeText(ctx.stamp, ctx.dumps), "utf8");
  const args = [
    ...(win ? ["-a", "--format=zip", "-cf"] : ["-czf"]),
    part,
    ...CODE_EXCLUDES.map((e) => `--exclude=${e}`),
    "-C",
    ctx.repoRoot,
    ".",
    ...(ctx.dumps.length ? ["-C", ctx.dir, ...ctx.dumps] : []),
    "-C",
    readmeDir,
    README_NAME,
  ];
  try {
    await new Promise<void>((resolve, reject) => {
      let err = "";
      const child = spawn(tarPath(), args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      child.stderr.on("data", (d: Buffer) => (err += d.toString()));
      child.on("error", (e) => reject(new Error(`The zip could not be made: ${e.message}`)));
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`The zip could not be made (tar exited ${code}): ${err.trim().split(/\r?\n/).slice(-3).join(" ")}`));
      });
    });
  } catch (e) {
    try {
      if (existsSync(part)) unlinkSync(part);
    } catch {
      /* leave it */
    }
    throw e;
  } finally {
    try {
      unlinkSync(path.join(readmeDir, README_NAME));
    } catch {
      /* already gone */
    }
  }
  renameSync(part, out);
  return { name, size: statSync(out).size };
}

/** The three newest code zips stay; the older ones go. Returns what was deleted. */
export function pruneCodeZips(dir: string, keep = 3): string[] {
  const zips = listBackups(dir).filter((f) => f.kind === "code-and-database");
  const gone: string[] = [];
  for (const f of zips.slice(keep)) {
    try {
      unlinkSync(path.join(dir, f.name));
      gone.push(f.name);
    } catch {
      /* keep it, then */
    }
  }
  return gone;
}

// ---------------------------------------------------------------------------
// the routes

export function registerBackupRoutes(app: Express, deps: BackupDeps): { status: () => BackupStatus } {
  const repoRoot = deps.repoRoot ?? defaultRepoRoot;
  const env = deps.env ?? process.env;
  const dir = deps.dir ?? backupDirOf(repoRoot, env);
  const clock = deps.clock ?? (() => new Date());
  const runDatabase = deps.runDatabase ?? runBackupScript;
  let running: BackupRun | null = null;
  let last: BackupRun | null = null;

  const status = (): BackupStatus => ({ running, last, files: listBackups(dir), dir });
  const kindWords = (kind: BackupKind): string => (kind === "database" ? "the database" : "the code and the database");

  async function job(req: Request, user: PublicUser, run: BackupRun): Promise<void> {
    const started = clock();
    const files: string[] = [];
    try {
      mkdirSync(dir, { recursive: true });
      const db = await runDatabase({ repoRoot, dir, env });
      if (!db.ok) throw new Error(failureLineOf(db.output));
      files.push(...filesWrittenSince(dir, started.getTime()));
      if (files.length === 0) throw new Error("The backup script finished, but no backup file of this run is in the folder.");
      const sizes = (names: string[]): string => names.map((n) => `${n} (${formatBytes(statSync(path.join(dir, n)).size)})`).join(", ");
      let message = `The database was backed up: ${sizes(files)}.`;
      if (run.kind === "code-and-database") {
        const zip = await zipCode({ repoRoot, dir, stamp: stampOf(started), dumps: files.slice() });
        const dumps = files.slice();
        files.push(zip.name);
        const gone = pruneCodeZips(dir);
        message =
          `The code and the database were backed up: ${zip.name} (${formatBytes(zip.size)}), holding the repository and ` +
          `${dumps.length === 1 ? "the database file" : "the database files"} ${dumps.join(", ")}.` +
          (gone.length ? ` Older zips deleted: ${gone.join(", ")}.` : "");
      }
      last = { ...run, finishedAt: clock().toISOString(), ok: true, message, files };
      deps.logActivity(req, user, run.kind === "database" ? "Backed up the database" : "Backed up the code and the database", "Backup", message);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      last = { ...run, finishedAt: clock().toISOString(), ok: false, message: `The backup failed. ${why}`, files };
      deps.logActivity(req, user, "Backup failed", "Backup", `${kindWords(run.kind)}: ${why}`);
    } finally {
      running = null;
    }
  }

  app.get("/api/backup", deps.requireAuth, deps.requireAdmin, (_req: Request, res: Response): void => {
    res.json(status());
  });

  app.post("/api/backup", deps.requireAuth, deps.requireAdmin, (req: Request, res: Response): void => {
    const kind = (req.body as { kind?: unknown } | undefined)?.kind;
    if (kind !== "database" && kind !== "code-and-database") {
      res.status(400).json({ error: 'Say which backup: "database", or "code-and-database".' });
      return;
    }
    if (running) {
      res.status(409).json({ error: `A backup is already running (${kindWords(running.kind)}, started by ${running.by}). Wait for it to finish.`, code: BACKUP_RUNNING_CODE });
      return;
    }
    const user = (req as Request & { user: PublicUser }).user;
    running = { kind, by: user.email, startedAt: clock().toISOString() };
    void job(req, user, running);
    res.status(202).json(status());
  });

  app.get("/api/backup/files/:name", deps.requireAuth, deps.requireAdmin, (req: Request, res: Response): void => {
    const name = String(req.params.name ?? "");
    if (!SAFE_NAME.test(name) || !backupFileKind(name)) {
      res.status(400).json({ error: "That is not the name of a backup file." });
      return;
    }
    const full = path.join(dir, name);
    if (!existsSync(full) || !statSync(full).isFile()) {
      res.status(404).json({ error: `There is no backup file called ${name}.` });
      return;
    }
    res.download(full, name);
  });

  // A BACKUP FILE DELETED BY THE SUPER ADMIN (the owner, 4-Nov-2026: "add delete option in backup where download option
  // is there", REQUIREMENTS §182): only a file the folder lists as a backup, by its exact name; never while a backup runs
  // (it may be writing that very file); one line in the activity log. The answer is the folder as it now stands.
  app.delete("/api/backup/files/:name", deps.requireAuth, deps.requireAdmin, (req: Request, res: Response): void => {
    const name = String(req.params.name ?? "");
    if (!SAFE_NAME.test(name) || !backupFileKind(name)) {
      res.status(400).json({ error: "That is not the name of a backup file." });
      return;
    }
    if (running) {
      res.status(409).json({ error: `A backup is running (${kindWords(running.kind)}, started by ${running.by}). Delete files once it has finished.`, code: BACKUP_RUNNING_CODE });
      return;
    }
    const full = path.join(dir, name);
    if (!existsSync(full) || !statSync(full).isFile()) {
      res.status(404).json({ error: `There is no backup file called ${name}.` });
      return;
    }
    const size = statSync(full).size;
    try {
      unlinkSync(full);
    } catch (e) {
      res.status(500).json({ error: `${name} could not be deleted: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    const user = (req as Request & { user: PublicUser }).user;
    deps.logActivity(req, user, "Deleted a backup", "Backup", `${name} (${formatBytes(size)})`);
    res.json(status());
  });

  return { status };
}
