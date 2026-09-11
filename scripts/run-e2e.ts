// Orchestrates the network-independent Playwright suites (tests/e2e_smoke.py,
// tests/e2e_backlog_regression.py, tests/e2e_voice.py, tests/e2e_realism.py, tests/e2e_editing.py, tests/e2e_files.py,
// tests/e2e_translate.py): build,
// single-process server (dist/ + auth API) on the port the tests expect,
// wait for it to answer, run each suite in turn against the same server,
// then always tear the server down again -- regardless of pass/fail -- so
// `npm run test:e2e` doesn't leak a background process. (tests/visual_qa.py
// and tests/e2e_assistant_chat.py are NOT run here -- they're slower/make
// real network calls to Groq -- see TESTING.md for running those manually.)
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const TEST_PORT = 8842;
const nodeArgs = ["--no-warnings=ExperimentalWarning"];

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// `python3` is the norm on macOS/Linux; plain `python` is what Windows
// installs actually provide (`python3` typically doesn't exist there).
function findPython(): string {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("No Python interpreter found (tried python3, python).");
}

async function answers(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return !!res.status;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await answers(url)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main(): Promise<void> {
  // A server left over from an earlier run would answer the readiness probe
  // while the fresh one dies on EADDRINUSE — and every suite would then pass
  // or fail against the old build without saying so.
  if (await answers(`http://localhost:${TEST_PORT}/api/auth/me`)) {
    console.error(`Something is already listening on :${TEST_PORT} — stop it first, so the tests run against this build.`);
    process.exit(1);
  }

  console.log("Building frontend...");
  run(process.execPath, [...nodeArgs, "frontend/scripts/build.ts"]);

  console.log(`Starting server on :${TEST_PORT}...`);
  const server = spawn(process.execPath, [...nodeArgs, "backend/index.ts"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, API_PORT: String(TEST_PORT) },
  });

  let exitCode = 1;
  try {
    const ready = await waitForServer(`http://localhost:${TEST_PORT}/api/auth/me`, 15000);
    if (!ready) throw new Error(`Server did not come up on :${TEST_PORT} in time.`);

    const python = findPython();
    const suites = ["tests/e2e_smoke.py", "tests/e2e_backlog_regression.py", "tests/e2e_voice.py", "tests/e2e_realism.py", "tests/e2e_editing.py", "tests/e2e_files.py", "tests/e2e_translate.py"];
    exitCode = 0;
    for (const suite of suites) {
      console.log(`Running ${suite}...`);
      const test = spawnSync(python, [suite], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
      const suiteExit = test.status ?? 1;
      if (suiteExit !== 0) {
        exitCode = suiteExit;
        break; // don't run later suites against a server whose earlier suite already failed/left it in an odd state
      }
    }
  } finally {
    server.kill();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
