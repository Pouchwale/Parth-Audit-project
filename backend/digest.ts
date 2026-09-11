// Reminder digest emails. The reminder data itself is computed client-side
// (src/engine/reminders.ts) from records that live in the browser's
// localStorage — the server has no independent view of what's due — so a
// client POSTs its already-computed list whenever it has due/overdue items,
// and this module decides whether to actually send (see digest_log dedup in
// db.ts: only the first request on a given calendar date sends anything,
// no matter how many browsers/staff trigger it that day).
import { db } from "./db.ts";
import { isEmailConfigured, sendMail } from "./email.ts";

export interface DigestReminder {
  documentName: string;
  dueDate: string;
  urgency: "overdue" | "due" | "upcoming" | string;
  assignedEmployees?: { name: string; email?: string }[];
}

export interface DigestResult {
  sent: boolean;
  reason?: string;
  recipientCount?: number;
  attempted?: number;
}

const getDigestLog = db.prepare("SELECT last_sent_date FROM digest_log WHERE id = 1");
const upsertDigestLog = db.prepare(
  "INSERT INTO digest_log (id, last_sent_date) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET last_sent_date = excluded.last_sent_date"
);

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lastSentDate(): string | null {
  const row = getDigestLog.get() as { last_sent_date: string | null } | undefined;
  return row?.last_sent_date ?? null;
}

function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function renderDigestHtml(items: DigestReminder[]): string {
  const rows = items
    .map(
      (r) =>
        `<tr><td style="padding:4px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.documentName)}</td>` +
        `<td style="padding:4px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.dueDate)}</td>` +
        `<td style="padding:4px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.urgency === "overdue" ? "Overdue" : r.urgency === "due" ? "Due today" : "Upcoming")}</td></tr>`
    )
    .join("");
  return (
    `<p>The following records need your attention:</p>` +
    `<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">` +
    `<thead><tr><th style="text-align:left;padding:4px 10px;">Document</th><th style="text-align:left;padding:4px 10px;">Due date</th><th style="text-align:left;padding:4px 10px;">Status</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>` +
    `<p style="color:#6b7280;font-size:12px;">Automated reminder from the Digital Controlled Record System.</p>`
  );
}

// Groups by recipient email so each person only sees their own items.
export async function sendReminderDigestIfDue(reminders: DigestReminder[]): Promise<DigestResult> {
  if (!isEmailConfigured()) return { sent: false, reason: "not-configured" };
  const previous = lastSentDate();
  if (previous === todayISO()) return { sent: false, reason: "already-sent-today" };

  const byEmail = new Map<string, DigestReminder[]>();
  for (const r of reminders) {
    for (const emp of r.assignedEmployees ?? []) {
      if (!emp?.email) continue;
      if (!byEmail.has(emp.email)) byEmail.set(emp.email, []);
      byEmail.get(emp.email)!.push(r);
    }
  }

  // Not marked as sent: reminders are computed per browser, and one whose
  // Master Data has no emails must not use up the day for one that has.
  if (byEmail.size === 0) return { sent: false, reason: "no-recipients" };

  // Claim the day before the first await. Everything from the check above to
  // here runs without yielding (node:sqlite is synchronous), so a second
  // request arriving while this one is still sending sees it as already sent
  // instead of sending the same mail again.
  upsertDigestLog.run(todayISO());

  let successCount = 0;
  for (const [email, items] of byEmail) {
    try {
      await sendMail({ to: email, subject: `Records needing attention (${items.length})`, html: renderDigestHtml(items) });
      successCount += 1;
    } catch (err) {
      console.error(`Failed to send reminder digest to ${email}:`, err);
    }
  }

  // Nothing went out (e.g. Gmail was unreachable): give the day back so the
  // next request tries again, rather than silently skipping today's digest.
  if (successCount === 0) upsertDigestLog.run(previous);
  return { sent: successCount > 0, recipientCount: successCount, attempted: byEmail.size };
}
