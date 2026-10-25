// THE MAIL SENDER: the reminder emails (backend/emailReminders.ts, the owner, 25-Oct-2026) and the escalations and the
// weekly digest (backend/escalation.ts, REQUIREMENTS §75).
//
// FREE OF COST, as the owner asked ("email the users automatically ... for the free of cost"): a Gmail account of the
// plant's own, with 2-Step Verification on and an App Password, named in backend/.env as GMAIL_USER and
// GMAIL_APP_PASSWORD (docs/DEPLOYMENT.md, "Reminder emails"). Gmail sends through its own SMTP server at no charge
// within its daily allowance, and DCRS keeps well under it (EMAIL_DAILY_CAP, backend/emailReminders.ts). Neither name is
// needed for DCRS to run: without them nothing is sent, and every caller says so in words.
//
// HOW A MESSAGE GOES (mailMode, first that applies):
//   capture  EMAIL_TRANSPORT=capture: nothing leaves this PC. The message is answered as captured; the reminder sender
//            keeps it in its email log (state "captured"). The test servers run so (scripts/run-e2e.ts), and so can the
//            owner, to see what would be sent before any of it is.
//   custom   a transport a test set (setMailTransport): the message is handed to it.
//   gmail    GMAIL_USER and GMAIL_APP_PASSWORD set: nodemailer's POOLED connection to Gmail, one connection at a time and
//            at most one message a second (rateDelta, rateLimit), so fifty morning reminders go out as a steady trickle
//            Gmail does not take for a flood.
//   off      none of them: nothing can be sent.
//
// EVERY MESSAGE: from "<the company's short name> - DCRS" <GMAIL_USER> (data/seed/masterData.ts COMPANY, the one
// spelling of the company, loaded the way backend/workingHours.ts loads the seed), with a plain-text part and an HTML
// part, never an attachment, and "Auto-Submitted: auto-generated" (RFC 3834) so an out-of-office reply leaves it alone.
//
// NEVER AN ADDRESS IN A LOG: maskAddress writes "d…@e….com", scrubAddresses masks every address in a text (an SMTP
// error quotes the mailbox it refused); the senders' own lines name the person, never the mailbox.
import nodemailer, { type Transporter } from "nodemailer";
import crypto from "node:crypto";

type Env = Record<string, string | undefined>;

export type MailMode = "capture" | "custom" | "gmail" | "off";

/** One message as it is handed to a transport: every part decided here. */
export interface OutgoingMail {
  from: { name: string; address: string };
  to: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

/** Where a message goes: Gmail by default; a test's stand-in (setMailTransport). */
export interface MailTransport {
  send(mail: OutgoingMail): Promise<{ messageId: string }>;
}

export interface MailResult {
  messageId: string;
  /** EMAIL_TRANSPORT=capture: kept on this PC, nothing sent. */
  captured: boolean;
}

/** One message to send: the HTML part, and the plain-text part (made from the HTML when not given). */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let injected: MailTransport | null = null;

/** A test's own transport (null puts Gmail back). EMAIL_TRANSPORT=capture still wins: then nothing reaches it. */
export function setMailTransport(transport: MailTransport | null): void {
  injected = transport;
}

/** How a message would go now. */
export function mailMode(env: Env = process.env): MailMode {
  if ((env.EMAIL_TRANSPORT ?? "").trim().toLowerCase() === "capture") return "capture";
  if (injected) return "custom";
  if (env.GMAIL_USER?.trim() && env.GMAIL_APP_PASSWORD?.trim()) return "gmail";
  return "off";
}

/** Whether the server has a mailbox of its own: GMAIL_USER and GMAIL_APP_PASSWORD both set (what escalation.ts asks). */
export function isEmailConfigured(env: Env = process.env): boolean {
  return !!(env.GMAIL_USER?.trim() && env.GMAIL_APP_PASSWORD?.trim());
}

/** Whether a message can go anywhere at all now (captured counts: it is recorded). */
export function canSendMail(env: Env = process.env): boolean {
  return mailMode(env) !== "off";
}

// ---------------------------------------------------------------------------
// addresses in logs

/** "dharmik@example.com" as a log may name it: "d…@e….com". */
export function maskAddress(address: string): string {
  const a = String(address ?? "").trim();
  const at = a.lastIndexOf("@");
  if (at <= 0) return a ? `${a.slice(0, 1)}…` : "";
  const domain = a.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const top = dot > 0 ? domain.slice(dot) : "";
  return `${a.slice(0, 1)}…@${domain.slice(0, 1)}…${top}`;
}

const ADDRESS_IN_TEXT = /[A-Za-z0-9._%+!#$&'*/=?^`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** A text with every address in it masked (an SMTP answer quotes the recipient, a login error the mailbox). */
export function scrubAddresses(text: string): string {
  return String(text ?? "").replace(ADDRESS_IN_TEXT, (a) => maskAddress(a));
}

// ---------------------------------------------------------------------------
// the message

// The seeded master data, for the company's name: a path held in a variable, so the type checker does not follow the
// app's extensionless imports into it; Node itself loads it (its only import is a type, which is stripped).
const SEED_MASTER_FILE: string = "../frontend/src/data/seed/masterData.ts";
let company: Promise<string> | null = null;

/** The name the mail comes from: "<the company's short name> - DCRS" (just "DCRS" if the seed could not be read). */
export function senderName(): Promise<string> {
  company ??= (import(SEED_MASTER_FILE) as Promise<{ COMPANY?: { shortName?: unknown } }>)
    .then((m) => (typeof m.COMPANY?.shortName === "string" && m.COMPANY.shortName.trim() ? `${m.COMPANY.shortName.trim()} - DCRS` : "DCRS"))
    .catch((err: unknown) => {
      console.error("[email] the company's name could not be read from the seed:", err instanceof Error ? err.message : err);
      return "DCRS";
    });
  return company;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** A plain-text part from an HTML one: its lines and list items as lines, its tags gone, its entities read. */
export function htmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e] ?? e)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Every header a message carries besides the usual ones: it was sent by a machine (RFC 3834). */
const AUTO_HEADERS: Readonly<Record<string, string>> = { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" };

/** The message as nodemailer takes it: the two parts, the headers, and nothing else (no attachment, ever). */
export function nodemailerMessage(mail: OutgoingMail): { from: { name: string; address: string }; to: string; subject: string; text: string; html: string; headers: Record<string, string> } {
  return { from: mail.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, headers: { ...mail.headers } };
}

/** nodemailer's options for Gmail: pooled, one connection, at most one message a second. */
export function gmailTransportOptions(env: Env = process.env) {
  return {
    service: "gmail",
    pool: true as const,
    maxConnections: 1,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 1,
    auth: { user: env.GMAIL_USER?.trim() ?? "", pass: env.GMAIL_APP_PASSWORD?.trim() ?? "" },
  };
}

let gmail: { key: string; transporter: Transporter } | null = null;

/** The pooled Gmail transport, made once for the mailbox and password set (made again if either changes). */
function gmailTransport(env: Env): MailTransport {
  const options = gmailTransportOptions(env);
  const key = crypto.createHash("sha256").update(`${options.auth.user}\u0000${options.auth.pass}`).digest("hex");
  if (!gmail || gmail.key !== key) {
    gmail?.transporter.close();
    const transporter = nodemailer.createTransport(options);
    // A pool's connection that fails between messages says so here; with nobody listening it would end the server.
    transporter.on("error", (err: unknown) => console.error("[email] Gmail connection:", scrubAddresses(err instanceof Error ? err.message : String(err))));
    gmail = { key, transporter };
  }
  const transporter = gmail.transporter;
  return {
    async send(mail) {
      const info = (await transporter.sendMail(nodemailerMessage(mail))) as { messageId?: unknown };
      return { messageId: typeof info?.messageId === "string" ? info.messageId : "" };
    },
  };
}

/**
 * SENDS ONE MESSAGE, or keeps it on this PC (EMAIL_TRANSPORT=capture). Throws when nothing can be sent (no mailbox set)
 * or the transport refused it; the error's words are the transport's, so a caller masks them (scrubAddresses) before
 * any log or answer.
 */
export async function sendMail(message: MailMessage, opts: { env?: Env } = {}): Promise<MailResult> {
  const env = opts.env ?? process.env;
  const mode = mailMode(env);
  if (mode === "off") throw Object.assign(new Error("Email is not set up (GMAIL_USER and GMAIL_APP_PASSWORD are not set in backend/.env)."), { code: "ENOTSETUP" });
  const mail: OutgoingMail = {
    from: { name: await senderName(), address: env.GMAIL_USER?.trim() || "dcrs@capture.invalid" },
    to: message.to,
    subject: message.subject,
    text: message.text ?? htmlToText(message.html),
    html: message.html,
    headers: { ...AUTO_HEADERS },
  };
  if (mode === "capture") return { messageId: `captured-${crypto.randomUUID()}`, captured: true };
  const transport = mode === "custom" && injected ? injected : gmailTransport(env);
  const sent = await transport.send(mail);
  return { messageId: sent.messageId, captured: false };
}
