// ONE RUN OF THE BROWSER SUITES AT A TIME, scripts/e2e-run-lock.ts (REQUIREMENTS §111, part 4):
//   * the first run takes the lock, naming its process and folder, and lets it go when it ends;
//   * a second run waits for it, says once whose run it waits for, and starts when the first ends;
//   * a lock left by a run that was killed (its process gone), one older than any run, or one torn
//     mid-write a minute ago is taken over; one being written this moment is not;
//   * a run still held after the wait gives up with words naming the other run.
// Run: npm run test:unit -- e2eRunLock
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { STALE_AFTER_MS, holdE2eRunLock, lockLeftBehind, processAlive } from "../../scripts/e2e-run-lock.ts";

const dir = mkdtempSync(path.join(os.tmpdir(), "dcrs-lock-test-"));
const lockAt = (name: string) => path.join(dir, name);
test.after(() => rmSync(dir, { recursive: true, force: true }));

test("the first run takes the lock with its process and folder, and lets it go", async () => {
  const file = lockAt("first.lock");
  const release = await holdE2eRunLock({ file, root: "C:/worktree-a" });
  const held = JSON.parse(readFileSync(file, "utf-8"));
  assert.equal(held.pid, process.pid);
  assert.equal(held.root, "C:/worktree-a");
  assert.ok(!Number.isNaN(Date.parse(held.since)));
  release();
  assert.equal(existsSync(file), false, "the lock is gone once the run lets it go");
  release(); // twice is harmless
});

test("a second run waits for the first, says once whose run it waits for, then starts", async () => {
  const file = lockAt("second.lock");
  const first = await holdE2eRunLock({ file, root: "C:/worktree-a" });
  // The same process stands in for "another run": its pid is alive, so the lock is not left behind.
  const told: unknown[] = [];
  let started = false;
  const second = holdE2eRunLock({ file, root: "C:/worktree-b", pollMs: 20, onWait: (h) => told.push(h) }).then((release) => {
    started = true;
    return release;
  });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(started, false, "the second run does not start while the first holds the ports");
  assert.equal(told.length, 1, "it says so once");
  assert.equal((told[0] as { root?: string }).root, "C:/worktree-a", "naming the run it waits for");
  first();
  const releaseSecond = await second;
  assert.equal(started, true);
  assert.equal(JSON.parse(readFileSync(file, "utf-8")).root, "C:/worktree-b");
  releaseSecond();
});

test("a lock left by a killed run, by a run older than any, or torn a minute ago is taken over", async () => {
  const dead = lockAt("dead.lock");
  writeFileSync(dead, JSON.stringify({ pid: 999_999, root: "C:/gone", since: new Date().toISOString() }));
  assert.equal(lockLeftBehind(dead, Date.now(), () => false), true, "its process has ended");
  const release = await holdE2eRunLock({ file: dead, alive: (pid) => pid === process.pid, pollMs: 10, waitMs: 1000 });
  assert.equal(JSON.parse(readFileSync(dead, "utf-8")).pid, process.pid, "taken over by this run");
  release();

  const old = lockAt("old.lock");
  writeFileSync(old, JSON.stringify({ pid: process.pid, root: "C:/old", since: "2026-10-12T00:00:00.000Z" }));
  const longAgo = (Date.now() - STALE_AFTER_MS - 60_000) / 1000;
  utimesSync(old, longAgo, longAgo);
  assert.equal(lockLeftBehind(old, Date.now(), () => true), true, "older than any run, even with a live process number");

  const torn = lockAt("torn.lock");
  writeFileSync(torn, "{\"pid\":");
  assert.equal(lockLeftBehind(torn, Date.now(), () => true), false, "being written this moment: not taken");
  assert.equal(lockLeftBehind(torn, Date.now() + 61_000, () => true), true, "still torn a minute later: left behind");
  assert.equal(lockLeftBehind(lockAt("none.lock")), false, "no lock: nothing to take over");
});

test("a run still held after the wait gives up, naming the other run", async () => {
  const file = lockAt("held.lock");
  writeFileSync(file, JSON.stringify({ pid: process.pid, root: "C:/worktree-a", since: "2026-10-13T13:26:37.000Z" }));
  await assert.rejects(holdE2eRunLock({ file, waitMs: 50, pollMs: 10 }), (err: Error) => {
    assert.match(err.message, /still holds the test ports/);
    assert.match(err.message, new RegExp(`process ${process.pid}`));
    assert.match(err.message, /C:\/worktree-a/);
    return true;
  });
  assert.equal(existsSync(file), true, "another run's lock is never removed by the run that gave up");
});

test("a live process is told from an ended one", () => {
  assert.equal(processAlive(process.pid), true);
  assert.equal(processAlive(999_999), false);
});
