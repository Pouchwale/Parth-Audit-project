// Stops this machine's own PostgreSQL (backend/data/postgres) with a clean,
// fast shutdown. The server starts it when DATABASE_URL is not set and leaves
// it running when the server stops (backend/db.ts), so that a second server
// on this machine can keep using it; this is how to shut it down — before
// copying backend/data/postgres as a backup, for instance. `npm run db:stop`.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { EMBEDDED_DIR, pgCtlPath } from "../backend/db.ts";

if (!existsSync(path.join(EMBEDDED_DIR, "postmaster.pid"))) {
  console.log("The local PostgreSQL is not running.");
  process.exit(0);
}
const result = spawnSync(await pgCtlPath(), ["stop", "-D", EMBEDDED_DIR, "-m", "fast", "-w", "-t", "60"], { stdio: "inherit", windowsHide: true });
process.exit(result.status ?? 1);
