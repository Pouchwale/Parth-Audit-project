// ONE RUN OF THE BROWSER SUITES AT A TIME ON THIS COMPUTER (REQUIREMENTS §111, part 4).
//
// Every run of `npm run test:e2e` takes the same two ports (:8842 for the suites' server, :8843 for the
// product's own) and starts a PostgreSQL of its own. On 13-Oct-2026 two worktrees of the same repository
// started a run each in the same minute: one run's server could not have :8842, so it read the OTHER run's
// server and stopped on "DCRS's tables are not in this database"; another time both PostgreSQLs were
// starting at once and one of them gave up after twenty-four minutes ("postgres exited while starting").
// A check of the ports before starting cannot see a run that is starting at the same moment.
//
// So a run holds a lock file in the computer's temp folder for as long as it runs, made with the "wx" flag
// (only one process can create it), naming its process and its folder. A second run waits for it — saying
// whose run it waits for — and starts when the first has ended. A lock left by a run that was killed (its
// process is gone, or it is older than any run) is taken over; so is one left torn mid-write.
import { closeSync, openSync, readFileSync, rmSync, statSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** The lock every worktree's run shares. */
export const E2E_RUN_LOCK = path.join(os.tmpdir(), "dcrs-e2e-run.lock");

/** No run lasts this long: the whole run is about three hours on this computer. A lock older than this was left behind. */
export const STALE_AFTER_MS = 8 * 60 * 60 * 1000;

/** Who holds the lock, as its file says. */
export interface LockHolder {
  pid?: number;
  root?: string;
  since?: string;
}

/** Whether a process is still running (EPERM: it is, and belongs to somebody else). */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readHolder(file: string): LockHolder | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as LockHolder) : null;
  } catch {
    return null;
  }
}

/**
 * Whether the lock as it stands was left behind: its process has ended, it is older than any run, or —
 * unreadable — it was torn while being written more than a minute ago (a run writes it the moment it makes it).
 */
export function lockLeftBehind(file: string, now = Date.now(), alive: (pid: number) => boolean = processAlive): boolean {
  let age: number;
  try {
    age = now - statSync(file).mtimeMs;
  } catch {
    return false; // gone already: nothing to take over
  }
  const holder = readHolder(file);
  if (!holder || typeof holder.pid !== "number") return age > 60_000;
  return !alive(holder.pid) || age > STALE_AFTER_MS;
}

export interface LockOptions {
  file?: string;
  /** How long to wait for another run before giving up, in milliseconds. */
  waitMs?: number;
  /** How often to look again. */
  pollMs?: number;
  /** Told once, when the lock is held by another run. */
  onWait?: (holder: LockHolder | null) => void;
  alive?: (pid: number) => boolean;
  /** The folder this run is started from, written into the lock so a waiting run can say whose run it waits for. */
  root?: string;
}

/**
 * Takes the lock, waiting for another run to end first. Hands back the function that lets it go (also run when
 * this process exits, however it exits short of being killed). Throws when another run still holds it after `waitMs`.
 */
export async function holdE2eRunLock(options: LockOptions = {}): Promise<() => void> {
  const file = options.file ?? E2E_RUN_LOCK;
  const pollMs = options.pollMs ?? 5000;
  const alive = options.alive ?? processAlive;
  const giveUpAt = Date.now() + (options.waitMs ?? 60 * 60 * 1000);
  let told = false;
  for (;;) {
    try {
      const fd = openSync(file, "wx");
      try {
        writeSync(fd, JSON.stringify({ pid: process.pid, root: options.root ?? process.cwd(), since: new Date().toISOString() } satisfies LockHolder));
      } finally {
        closeSync(fd);
      }
      let released = false;
      const release = (): void => {
        if (released) return;
        released = true;
        process.removeListener("exit", release);
        // Only our own lock: never one a later run made after ours was taken over.
        if (readHolder(file)?.pid === process.pid) rmSync(file, { force: true });
      };
      process.once("exit", release);
      return release;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    if (lockLeftBehind(file, Date.now(), alive)) {
      rmSync(file, { force: true });
      continue;
    }
    const holder = readHolder(file);
    if (Date.now() >= giveUpAt) {
      throw new Error(
        `Another run of the browser suites still holds the test ports after waiting (process ${holder?.pid ?? "?"}, ${holder?.root ?? "another folder"}, since ${holder?.since ?? "?"}). ` +
          `Run again when it has ended; ${file} is its lock.`
      );
    }
    if (!told) {
      told = true;
      options.onWait?.(holder);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
