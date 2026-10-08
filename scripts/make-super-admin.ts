// MAKES AN ACCOUNT THE SUPER ADMIN, FROM THE COMPUTER THAT RUNS DCRS (backend/superAdmin.ts says why).
//
//   npm run super-admin -- name@example.com
//
// It reads backend/.env and opens the database exactly as the server does (backend/db.ts openDatabase: DATABASE_URL,
// or this computer's own PostgreSQL, started if it is not running), changes that one account and writes one line in
// the activity log. No password is read or shown. The server may keep running; the change counts from the account's
// next sign-in.
import "../backend/env.ts";
import { closeDatabase, database, getUserByEmail, insertActivity, openDatabase } from "../backend/db.ts";
import { makeSuperAdmin, outcomeWords } from "../backend/superAdmin.ts";

const given = process.argv.slice(2).find((a) => !a.startsWith("-")) ?? "";
let exitCode = 0;
await openDatabase();
try {
  const outcome = await makeSuperAdmin(given, {
    async find(email) {
      const row = await getUserByEmail(email);
      return row ? { id: row.id, name: row.name, email: row.email, role: row.role, departments: row.departments ?? "", active: row.active !== false } : undefined;
    },
    async promote(id) {
      await database().query("UPDATE users SET role = 'admin', departments = '', active = TRUE WHERE id = $1", [id]);
    },
    async log(line) {
      await insertActivity([line]);
    },
  });
  console.log(outcomeWords(outcome));
  if (outcome.kind === "bad-email" || outcome.kind === "no-account") exitCode = 1;
} catch (err) {
  console.error(`The database could not be changed: ${err instanceof Error ? err.message : String(err)}`);
  exitCode = 1;
} finally {
  await closeDatabase();
}
process.exit(exitCode);
