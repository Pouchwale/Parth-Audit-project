// READING THE ACTIVITY LOG OVER HTTP (REQUIREMENTS §62, §73, §75) — the two
// routes the Activity Log page reads, and the one reading of a request into
// the log's filter that every reading of the log shares (the archive's two
// routes in archiveRoutes.ts take it too, so the log with and without its
// archive can never be filtered differently):
//
//   GET /api/activity          the lines, newest first, a page at a time
//   GET /api/activity/summary  who did what over the same lines, counted
//
// THE QUERY. `from` / `to` as plain YYYY-MM-DD, both ends included; `q`, words
// anywhere in a line; and, for the super admin's chips (the owner, 14-Oct-2026:
// "which user what does and in which modules and documents"), `person` (an
// account id), `department` (a module's code, "QC"), `document` (words of a
// format number or name, found in the line's target) and `action` (exactly as
// the log holds it, "Record started"). They combine: each is one more AND.
//
// WHO MAY READ WHAT does not change with any of them. The super admin reads
// every line; an account kept to departments reads its own lines and its
// departments'; an account with no departments reads every line but the
// escalations' two (db.ts activityWhere). The chips only ever NARROW what the
// account may already read: a member of staff asking for another module's
// lines is handed their own lines in that module, and nobody else's. Every
// value is a parameter of the SQL, never part of its text.
//
// The work itself — the SQL — is db.ts listActivity and activityArchive.ts
// activityTally; this file reads the request, and answers. The database is
// reached through `lines` and `summary`, handed in by index.ts, so the routes
// can be driven on a stand-in with no PostgreSQL (tests/activityRoutes.test.ts).
import type { Express, NextFunction, Request, Response } from "express";
import type { PublicUser } from "./auth.ts";
import type { ActivityFilter, ActivityLine, ActivityTally } from "./db.ts";

type Middleware = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

export interface ActivityRouteDeps {
  /** Signed in, with the modules the person sees (index.ts requireAuthWithModules). */
  requireAuth: Middleware;
  /** db.ts listActivity. */
  lines: (opts: ActivityFilter & { limit: number; before?: string }) => Promise<ActivityLine[]>;
  /** db.ts activitySummary. */
  summary: (opts: ActivityFilter) => Promise<ActivityTally[]>;
  /** index.ts's JSON answer, compressed when it is long. */
  sendJson: (req: Request, res: Response, status: number, body: unknown) => void;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A department code as the log files it (index.ts DEPARTMENT_CODE_RE): two to four capitals. */
const DEPARTMENT_CODE_RE = /^[A-Z]{2,4}$/;
// A line's id as the "Show older" cursor: digits only, and no more than 18 of
// them, so it is always inside PostgreSQL's bigint — a longer one used to fail
// the whole request instead of simply finding nothing.
const BEFORE_RE = /^[0-9]{1,18}$/;
/** The longest action the log keeps (index.ts POST /api/activity clips at 80). */
const ACTION_MAX = 80;
const DOCUMENT_MAX = 80;

const day = (v: unknown): string | undefined => (typeof v === "string" && DAY_RE.test(v) ? v : undefined);
const personId = (v: unknown): string | undefined => (typeof v === "string" && v.trim().length > 0 && v.length <= 64 ? v.trim() : undefined);
const words = (v: unknown, max: number): string | undefined => {
  const w = typeof v === "string" ? v.trim().slice(0, max) : "";
  return w || undefined;
};
/** The module's code, however it was typed ("qc" is QC); anything that is not a code is no filter at all. */
const departmentCode = (v: unknown): string | undefined => {
  const code = typeof v === "string" ? v.trim().toUpperCase() : "";
  return DEPARTMENT_CODE_RE.test(code) ? code : undefined;
};

/**
 * WHAT A READING OF THE LOG IS KEPT TO — one reading of the request for the
 * lines AND for the tally beside them, so the two can never be filtered
 * differently: the account's scope, then `person`, `from`, `to`, the search
 * `q`, and the chips' `department`, `document` and `action`. (The tally used to
 * ignore the search, so a search showed ten lines beside a count of the whole day.)
 *
 * `modules`: the modules the person sees at Read or more (REQUIREMENTS §96),
 * worked out by index.ts requireAuthWithModules; undefined when nobody worked
 * them out, in which case the account's own departments decide, as before.
 */
export function readActivityFilter(query: Record<string, unknown>, user: PublicUser, modules: string[] | null | undefined): ActivityFilter {
  return {
    departments: user.role === "admin" ? null : modules === undefined ? (user.departments.length > 0 ? user.departments : null) : modules,
    userId: user.id,
    // The escalations' lines are the super admin's alone (db.ts SUPER_ADMIN_ACTIONS, REQUIREMENTS §75).
    superAdmin: user.role === "admin",
    search: words(query.q, 80),
    person: personId(query.person),
    from: day(query.from),
    to: day(query.to),
    department: departmentCode(query.department),
    document: words(query.document, DOCUMENT_MAX),
    action: words(query.action, ACTION_MAX),
  };
}

/** index.ts's reading of a request into the log's filter: the signed-in account and the modules it sees. */
export function activityFilterOf(req: Request): ActivityFilter {
  const user = (req as Request & { user: PublicUser }).user;
  const modules = (req as Request & { accessModules?: string[] | null }).accessModules;
  return readActivityFilter(req.query as Record<string, unknown>, user, modules);
}

/** The page size and the "Show older" cursor, as every reading of the log takes them. */
export function readActivityPage(query: Record<string, unknown>): { limit: number; before?: string } {
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
  const before = typeof query.before === "string" && BEFORE_RE.test(query.before) ? query.before : undefined;
  return { limit, before };
}

export function registerActivityRoutes(app: Express, deps: ActivityRouteDeps): void {
  const { requireAuth, lines, summary, sendJson } = deps;

  // THE ACTIVITY LOG IS THE SUPER ADMIN'S (REQUIREMENTS §116, the owner, 15-Oct-2026): the page refuses anybody else
  // (pages/ActivityLogPage.tsx), and so do its two readings here, whatever is asked for. The scope an account's lines
  // were read with until then (readActivityFilter) is kept for the archive's readings and the server's own use.
  const superAdminOnly = (req: Request, res: Response): boolean => {
    if ((req as Request & { user?: { role?: string } }).user?.role === "admin") return true;
    sendJson(req, res, 403, { error: "Only the super admin can open the Activity Log." });
    return false;
  };

  app.get("/api/activity", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!superAdminOnly(req, res)) return;
    sendJson(req, res, 200, { lines: await lines({ ...activityFilterOf(req), ...readActivityPage(req.query as Record<string, unknown>) }) });
  });

  // WHAT EACH PERSON DID OVER THE SPAN, counted (REQUIREMENTS §73) — the tally
  // the Performance Scorecard is read beside. Same scoping: the administrator
  // sees everybody, an account kept to departments sees itself and its
  // departments'. The counts are worked out in PostgreSQL, not here, over
  // exactly the lines GET /api/activity would list for the same request.
  app.get("/api/activity/summary", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!superAdminOnly(req, res)) return;
    sendJson(req, res, 200, { people: await summary(activityFilterOf(req)) });
  });
}
