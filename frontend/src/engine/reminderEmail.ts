// A PERSON'S REMINDER EMAIL: WHICH ADDRESSES DCRS TAKES (the owner, 25-Oct-2026).
//
// "i want a system that will email the users automatically for the updates on their given email id's for the free of
// cost so the system will update the user that you have to complete this records and those are the records remaining
// till now to filled or submit/verify according to there before the due date and system will remind the user again and
// again until he or she complete his tasks."
//
// A sign-in is name.surname@gpp.local: a name, not a mailbox (REQUIREMENTS §62), and DCRS never sends mail to it. So
// the super admin gives each person a REMINDER EMAIL of its own on Users & Access (backend/emailRoutes.ts keeps it in
// PostgreSQL, email_contacts), and the server's reminder emails go there (backend/emailReminders.ts). This file is the
// one rule both sides check an address by: the page before it sends, the server before it stores.
//
// ONE PLAIN ADDRESS: trimmed and in small letters, at most 254 characters (RFC 5321), one "@", no comma, semicolon,
// angle bracket, quote, bracket or space (any of them would let one "address" fan out to others, or carry a display name),
// a domain of letters, digits and hyphens with a dot and a name of two letters or more at its end (no IP address). NOT
// A NAME THAT RECEIVES NO MAIL: .local (the plant's own sign-ins, gpp.local, among them), .localhost, .test, .invalid and
// .example are refused, and so is the mark of a sign-in given up to another account (engine/accountNames.ts
// RELEASED_MARK, written in here; backend/tests/emailReminders.test.ts holds the two equal).
//
// WITH NO IMPORTS AT ALL, like engine/notificationText.ts: the server loads it with Node's type stripping.

/** The longest address there is (RFC 5321). */
export const MAX_ADDRESS_LENGTH = 254;
/** The longest part before the "@" (RFC 5321). */
const MAX_LOCAL_LENGTH = 64;

/** Names at the end of a domain that never receive mail: the plant's own sign-ins and the reserved test names (RFC 2606, 6761, 6762). */
export const NO_MAIL_ENDINGS: readonly string[] = ["local", "localhost", "test", "invalid", "example"];

/** engine/accountNames.ts RELEASED_MARK, written in: a sign-in given up to another account carries it, and it is no mailbox. */
export const REMOVED_ACCOUNT_MARK = "#removed-";

export type ReminderAddressProblem = "empty" | "too-long" | "not-one-address" | "bad-domain" | "sign-in" | "no-mail-domain";

/** Why an address was refused, or the address as DCRS keeps it. */
export type ReminderAddressCheck = { ok: true; address: string } | { ok: false; problem: ReminderAddressProblem };

/** A character that would turn one address into several, or carry a display name or a comment. */
const NOT_IN_AN_ADDRESS = /[\s,;<>"'()[\]\\]/;
/** What may stand before the "@": letters, digits and the punctuation addresses use, with no dot at either end or two together. */
const LOCAL_RE = /^[a-z0-9!#$%&*+\/=?^_`{|}~-]+(\.[a-z0-9!#$%&*+\/=?^_`{|}~-]+)*$/;
/** One label of a domain: letters, digits, hyphens, never a hyphen at either end. */
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** The last label: letters only, two or more (no IP address, no number). */
const TOP_RE = /^[a-z]{2,63}$/;

/** The address as it is kept (trimmed, small letters), or why it is not one DCRS sends reminders to. */
export function reminderAddress(typed: unknown): ReminderAddressCheck {
  const address = typeof typed === "string" ? typed.trim().toLowerCase() : "";
  if (!address) return { ok: false, problem: "empty" };
  if (address.length > MAX_ADDRESS_LENGTH) return { ok: false, problem: "too-long" };
  if (address.includes(REMOVED_ACCOUNT_MARK)) return { ok: false, problem: "sign-in" };
  if (NOT_IN_AN_ADDRESS.test(address)) return { ok: false, problem: "not-one-address" };
  const at = address.indexOf("@");
  if (at <= 0 || at !== address.lastIndexOf("@")) return { ok: false, problem: "not-one-address" };
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (local.length > MAX_LOCAL_LENGTH || !LOCAL_RE.test(local)) return { ok: false, problem: "not-one-address" };
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l)) || !TOP_RE.test(labels[labels.length - 1])) return { ok: false, problem: "bad-domain" };
  // The plant's own sign-ins first: the words then say it is a sign-in, not only a name that receives no mail.
  if (domain === "gpp.local") return { ok: false, problem: "sign-in" };
  if (NO_MAIL_ENDINGS.includes(labels[labels.length - 1])) return { ok: false, problem: "no-mail-domain" };
  return { ok: true, address };
}

/** The languages a reminder email is written in (engine/notificationText.ts words it). */
export type ReminderLanguage = "en" | "gu" | "hi";

export const REMINDER_LANGUAGES: readonly ReminderLanguage[] = ["en", "gu", "hi"];

export const isReminderLanguage = (v: unknown): v is ReminderLanguage => v === "en" || v === "gu" || v === "hi";

/** Each language in its own words, as the choice on Users & Access names it. */
export const REMINDER_LANGUAGE_NAMES: Readonly<Record<ReminderLanguage, string>> = { en: "English", gu: "ગુજરાતી", hi: "हिन्दी" };
