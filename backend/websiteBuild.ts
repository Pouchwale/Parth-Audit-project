// THE WEBSITE THE SERVER SERVES IS THE CODE AS IT IS NOW (REQUIREMENTS §102, 9-Oct-2026).
//
// The plant's server serves the built website (frontend/dist) on port 4000. It is
// started by `npm run server` or `npm run plant:start`, and neither builds it. On
// 9-Oct-2026 the owner still saw "1. I can freely speak up" after the fix was
// pushed: the website on port 4000 was the build of 7-Oct.
//
// Now, when the server starts, a built website older than any file it is built
// from (frontend/src, frontend/public, frontend/index.html, frontend/scripts/
// build.ts) is built again before the server answers, and the terminal says so.
// After a `git pull` the changed files are newer, so the next start builds. The
// build takes some seconds once, at the start, never while people work.
//
// When not to build:
// - `npm run dev` serves the website from its own dev server on port 5173
//   (DCRS_DEV=1, set by scripts/dev-all.ts), so the server only says the built
//   copy is old.
// - A test run (NODE_TEST_CONTEXT) never builds.
// - DCRS_AUTO_BUILD=0 switches the build off.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export interface WebsiteFreshness {
  /** Whether a built website exists and is newer than everything it is built from. */
  current: boolean;
  /** When the built app was written; null when there is none. */
  builtAt: number | null;
  /** The newest file it is built from, and when it changed. */
  newestFile: string | null;
  newestAt: number;
}

/** The built website against the files it is built from: one walk of frontend/src and frontend/public. */
export function websiteFreshness(frontendDir: string): WebsiteFreshness {
  let builtAt: number | null = null;
  try {
    if (existsSync(path.join(frontendDir, "dist", "index.html"))) builtAt = statSync(path.join(frontendDir, "dist", "assets", "app.js")).mtimeMs;
  } catch {
    builtAt = null;
  }
  let newestAt = 0;
  let newestFile: string | null = null;
  const consider = (file: string) => {
    try {
      const at = statSync(file).mtimeMs;
      if (at > newestAt) {
        newestAt = at;
        newestFile = file;
      }
    } catch {
      /* gone: nothing to compare */
    }
  };
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else consider(p);
    }
  };
  walk(path.join(frontendDir, "src"));
  walk(path.join(frontendDir, "public"));
  consider(path.join(frontendDir, "index.html"));
  consider(path.join(frontendDir, "scripts", "build.ts"));
  return { current: builtAt !== null && builtAt >= newestAt, builtAt, newestFile, newestAt };
}

export type WebsiteBuildOutcome = "current" | "built" | "old" | "missing" | "failed";

/**
 * Builds the website when it is missing or older than its code, before the server answers.
 * `build` runs the frontend's own build (frontend/scripts/build.ts) and says whether it succeeded.
 */
export function ensureWebsiteBuilt(
  frontendDir: string,
  env: NodeJS.ProcessEnv = process.env,
  say: (line: string) => void = (line) => console.log(line),
  build: () => boolean = () => runFrontendBuild(frontendDir)
): WebsiteBuildOutcome {
  const fresh = websiteFreshness(frontendDir);
  if (fresh.current) return "current";
  const changed = fresh.newestFile ? `frontend/${path.relative(frontendDir, fresh.newestFile).split(path.sep).join("/")}` : "the website's code";
  if (env.DCRS_AUTO_BUILD === "0" || env.DCRS_DEV === "1" || env.NODE_TEST_CONTEXT) {
    if (env.DCRS_DEV !== "1" && !env.NODE_TEST_CONTEXT) {
      say(
        fresh.builtAt === null
          ? "The website is not built (frontend/dist): run npm run build, or start the server without DCRS_AUTO_BUILD=0."
          : `The built website (frontend/dist) is older than its code (${changed} changed since): run npm run build.`
      );
    }
    return fresh.builtAt === null ? "missing" : "old";
  }
  say(
    fresh.builtAt === null
      ? "Building the website (frontend/dist) for the first time, before the server answers..."
      : `The built website is older than its code (${changed} changed since): building it again before the server answers...`
  );
  const started = Date.now();
  if (!build()) {
    say("The website could not be built (see the lines above). The server keeps the copy it has; run npm run build to see why.");
    return "failed";
  }
  say(`Website built in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  return "built";
}

function runFrontendBuild(frontendDir: string): boolean {
  const result = spawnSync(process.execPath, ["--no-warnings=ExperimentalWarning", "scripts/build.ts"], { cwd: frontendDir, stdio: "inherit", windowsHide: true });
  return result.status === 0;
}
