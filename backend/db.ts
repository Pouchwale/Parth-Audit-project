// User account storage. Uses Node's built-in `node:sqlite` (no native
// compilation / extra dependency required) so a real account database
// persists to disk across restarts, instead of the app's per-browser
// localStorage — see DATA_MODEL.md / DEPLOYMENT.md for why the rest of the
// app's operational records intentionally stay local for now.
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { dataDir } from "./paths.ts";

export const db = new DatabaseSync(path.join(dataDir, "app.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TEXT NOT NULL,
    departments TEXT NOT NULL DEFAULT ''
  )
`);

// The departments a user may see — the department codes of the company's own
// master list of formats (F/SYS/02: QC, PRD, HR, MKT, ...), comma separated;
// EMPTY means every department, which is what management / QA need and what a
// new account has until somebody assigns it (see
// frontend/src/engine/departmentScope.ts).
//
// CREATE TABLE IF NOT EXISTS above does nothing to a database that already
// exists, so an app.db from before this column has to be altered. SQLite
// allows ADD COLUMN with a non-null DEFAULT, which fills every existing row;
// the guard keeps it idempotent across restarts.
{
  const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "departments")) {
    db.exec("ALTER TABLE users ADD COLUMN departments TEXT NOT NULL DEFAULT ''");
  }
}

// Single-row table (id is always 1) tracking the last calendar date a
// reminder digest email was sent. The reminder data itself lives in the
// browser (see storageAdapter.ts), so any client with due/overdue items can
// ask the server to send a digest — this table is what stops five different
// staff opening the app the same morning from triggering five duplicate
// emails; only the first request each day actually sends.
db.exec(`
  CREATE TABLE IF NOT EXISTS digest_log (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_sent_date TEXT
  )
`);

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "admin" | "staff";
  created_at: string;
  /** Comma-separated department codes; "" = every department. */
  departments: string;
}
