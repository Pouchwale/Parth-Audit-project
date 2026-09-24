// THE SUPER ADMIN'S ESCALATIONS AND WEEKLY DIGEST, OVER HTTP (REQUIREMENTS §75).
// Registered by backend/index.ts with one call; the work is backend/escalation.ts
// and the schedule backend/jobs.ts.
//
//   GET  /api/escalations?open=1   the ones not yet acknowledged (the bell)
//   GET  /api/escalations          every one raised or grown in the last 30 days
//                                  (the Performance page's "Escalated" badges,
//                                  the day's notification)
//   POST /api/escalations/:id/ack  "I have seen it" — who and when are kept, and
//                                  the activity log has a line
//   GET  /api/digests/latest       the newest weekly digest, or null
//   POST /api/jobs/run             { job: "escalation" | "weekly-digest",
//                                    today?: "YYYY-MM-DD" } — runs it NOW,
//                                  whatever the clock says: for an administrator
//                                  who wants it now, and for the test suites,
//                                  whose servers run with JOBS=0
//
// EVERY ONE IS THE SUPER ADMIN'S. The session is checked by index.ts's own
// requireAuth — the one every other route uses, which also holds back an
// account still on the password the administrator gave it (§66) — and then the
// role, here. An escalation names people, so nobody else is handed one.
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import type { PublicUser } from "./auth.ts";
import { ESCALATION_RULE, acknowledgeEscalation, escalationSentence, isDay, isoWeek, latestDigest, listEscalations, plantClock } from "./escalation.ts";
import { JOB_NAMES, runJob, type JobName } from "./jobs.ts";

type AuthedRequest = Request & { user: PublicUser };
type LogActivity = (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;

const ID_RE = /^[0-9]{1,18}$/;

function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if ((req as AuthedRequest).user?.role !== "admin") {
    res.status(403).json({ error: "Only the super admin sees escalations and the weekly digest." });
    return;
  }
  next();
}

export function registerEscalationRoutes(app: Express, { requireAuth, logActivity }: { requireAuth: RequestHandler; logActivity: LogActivity }): void {
  const admin = [requireAuth, adminOnly];

  app.get("/api/escalations", ...admin, async (req: Request, res: Response): Promise<void> => {
    const escalations = await listEscalations(req.query.open === "1");
    // The plant's today and its ISO week, so a screen saying "this week" means the server's week.
    const today = plantClock().date;
    res.json({ escalations, rule: ESCALATION_RULE, today, week: isoWeek(today) });
  });

  app.post("/api/escalations/:id/ack", ...admin, async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id ?? "");
    if (!ID_RE.test(id)) {
      res.status(400).json({ error: "No such escalation." });
      return;
    }
    const user = (req as AuthedRequest).user;
    const done = await acknowledgeEscalation(id, user.name);
    if (!done) {
      res.status(404).json({ error: "No such escalation." });
      return;
    }
    // Acknowledged once; asked again, it stays as it was and nothing more is written.
    if (!done.already) logActivity(req, user, "Escalation acknowledged", done.row.subjectName, `${done.row.period}: ${escalationSentence(done.row)}`, done.row.department);
    res.json({ escalation: done.row });
  });

  app.get("/api/digests/latest", ...admin, async (_req: Request, res: Response): Promise<void> => {
    res.json({ digest: await latestDigest() });
  });

  app.post("/api/jobs/run", ...admin, async (req: Request, res: Response): Promise<void> => {
    const { job, today } = (req.body ?? {}) as { job?: unknown; today?: unknown };
    if (typeof job !== "string" || !JOB_NAMES.includes(job as JobName)) {
      res.status(400).json({ error: `job must be one of: ${JOB_NAMES.join(", ")}.` });
      return;
    }
    // "today" is for a suite that needs a day of its own; left out, it is the plant's today.
    if (today !== undefined && !(isDay(today) && today >= "2000-01-01" && today <= "2100-12-31")) {
      res.status(400).json({ error: "today must be a date, YYYY-MM-DD." });
      return;
    }
    const day = typeof today === "string" ? today : plantClock().date;
    const { outcome, result } = await runJob(job as JobName, day);
    logActivity(req, (req as AuthedRequest).user, "Ran a scheduled job by hand", job, `${day}: ${outcome}`.slice(0, 600));
    res.json({ job, today: day, outcome, result });
  });
}
