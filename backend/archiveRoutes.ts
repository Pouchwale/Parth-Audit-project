// THE ACTIVITY LOG'S ARCHIVE, OVER HTTP (REQUIREMENTS §62, §75) — the super
// admin's alone, whatever the screen shows: every route here answers 403 to
// any other account. The work itself is in activityArchive.ts; this file only
// reads the request, checks who is asking, and answers.
//
//   GET  /api/activity/archive/preview?years=N   what archiving would move
//   POST /api/activity/archive {years, cutoff}   moves it (cutoff = the day the
//                                                preview was made for; 409 with
//                                                a fresh preview if today has
//                                                moved on since)
//   GET  /api/activity/with-archive              GET /api/activity, the archive included
//   GET  /api/activity/with-archive/summary      GET /api/activity/summary, the archive included
//
// The two readings take exactly the query GET /api/activity takes — limit,
// before, q, person, from, to — read by index.ts's own activityFilter, handed
// in with the server's other pieces by registerActivityArchiveRoutes, so the
// log with and without its archive can never be filtered differently.
import type { Express, NextFunction, Request, Response } from "express";
import type { PublicUser } from "./auth.ts";
import type { ActivityFilter } from "./db.ts";
import { activityTally, archiveActivity, archivePreview, archiveYears, defaultArchiveYears, listActivityWithArchive } from "./activityArchive.ts";

type Middleware = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

export interface ArchiveRouteDeps {
  /** Signed in, and on a password of their own (index.ts). */
  requireAuth: Middleware;
  /** index.ts's reading of a request into the log's filter. */
  activityFilter: (req: Request) => ActivityFilter;
  /** index.ts's JSON answer, compressed when it is long. */
  sendJson: (req: Request, res: Response, status: number, body: unknown) => void;
}

// The "Show older" cursor and the page size, read as GET /api/activity reads them (index.ts).
const BEFORE_RE = /^[0-9]{1,18}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerActivityArchiveRoutes(app: Express, deps: ArchiveRouteDeps): void {
  const { requireAuth, activityFilter, sendJson } = deps;

  /** The super admin, or null having answered 403. */
  const superAdmin = (req: Request, res: Response): PublicUser | null => {
    const user = (req as Request & { user: PublicUser }).user;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Only the super admin can archive the activity log or read its archive." });
      return null;
    }
    return user;
  };

  app.get("/api/activity/archive/preview", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!superAdmin(req, res)) return;
    res.json(await archivePreview(archiveYears(req.query.years) ?? defaultArchiveYears()));
  });

  app.post("/api/activity/archive", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const user = superAdmin(req, res);
    if (!user) return;
    const body = (req.body ?? {}) as { years?: unknown; cutoff?: unknown };
    const years = archiveYears(body.years);
    if (years === null) {
      res.status(400).json({ error: "Say how many years old a line must be: a whole number from 1 to 10." });
      return;
    }
    const cutoff = typeof body.cutoff === "string" && DAY_RE.test(body.cutoff) ? body.cutoff : null;
    const result = await archiveActivity(years, cutoff, { id: user.id, name: user.name, email: user.email, ip: req.ip ?? "" });
    if (!result.ok) {
      res.status(409).json({ error: "The date has moved on since the count was shown. Look at the new count, then archive.", preview: await archivePreview(years) });
      return;
    }
    res.json({ moved: result.moved, cutoff: result.cutoff, from: result.from, to: result.to });
  });

  app.get("/api/activity/with-archive", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!superAdmin(req, res)) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const before = typeof req.query.before === "string" && BEFORE_RE.test(req.query.before) ? req.query.before : undefined;
    sendJson(req, res, 200, { lines: await listActivityWithArchive({ ...activityFilter(req), limit, before }) });
  });

  app.get("/api/activity/with-archive/summary", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!superAdmin(req, res)) return;
    sendJson(req, res, 200, { people: await activityTally(activityFilter(req), true) });
  });
}
