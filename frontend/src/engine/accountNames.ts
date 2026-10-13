// THE NAMES AN ACCOUNT SIGNS IN BY: TYPED SHORT, AND ONE GIVEN UP TO ANOTHER ACCOUNT (REQUIREMENTS §110).
//
// The owner, 12-Oct-2026: "change username kapilabarad01@gmail.com change to kapila barad only and also remove all
// others except kapila, superadmin, admin, vinay, sandeep and bharat, chirag, ankur, dharmik". The plant's own
// accounts sign in as name.surname@gpp.local (REQUIREMENTS §96); "kapila barad" is the short name of one of them.
//
//   * THE SHORT NAME. The sign-in box takes "kapila.barad", "kapila barad" or "KAPILA BARAD" for
//     kapila.barad@gpp.local: small letters, the spaces between the words made dots, at @gpp.local. Only an account at
//     @gpp.local is reached that way, and only by an exact match of that (backend/index.ts POST /api/auth/login).
//   * A SIGN-IN GIVEN UP. When the super admin renames an account to the sign-in of an account nobody has used, and
//     says "replace it", the unused one is removed and its sign-in goes to the renamed account (backend/accountRoutes.ts).
//     Every sign-in is one account's (the users table keeps each address once), so the removed one keeps a sign-in
//     nobody types: its own with "#removed-" and its id after it. It is shown as the sign-in it gave up; it is still
//     the plant's when the seeding (backend/index.ts) and "Create the missing accounts" look for who has an account, so
//     neither makes the account again; and "Bring back" gives it its own sign-in again when nobody holds it by then.
//
// WITH NO IMPORTS, like engine/accessRules.ts: the server loads this file with Node's type stripping.

/** The plant's own sign-ins end with this (name.surname@gpp.local, REQUIREMENTS §96). */
export const PLANT_DOMAIN = "gpp.local";

/**
 * WHAT WAS TYPED IN THE SIGN-IN BOX, AS THE ADDRESS IT NAMES. An address (anything with an @) as it is, trimmed and in
 * small letters, exactly as before. Anything else is a short name of the plant's own: in small letters, the spaces
 * between its words made dots, at @gpp.local ("Kapila  Barad" is kapila.barad@gpp.local). Nothing is guessed: "kapila"
 * names kapila@gpp.local, which is nobody's.
 */
export function signInAddress(typed: unknown): string {
  const t = typeof typed === "string" ? typed.trim().toLowerCase() : "";
  if (!t || t.includes("@")) return t;
  return `${t.split(/\s+/).join(".")}@${PLANT_DOMAIN}`;
}

/** The short name of one of the plant's own sign-ins ("kapila.barad" for kapila.barad@gpp.local), or null for any other. */
export function shortSignIn(email: string): string | null {
  const e = email.trim().toLowerCase();
  const suffix = `@${PLANT_DOMAIN}`;
  return e.endsWith(suffix) && e.length > suffix.length && !e.includes(RELEASED_MARK) ? e.slice(0, -suffix.length) : null;
}

/** What marks a sign-in given up to another account. */
export const RELEASED_MARK = "#removed-";

/** The sign-in an account keeps once it has given its own up: unique (its id is in it), and never one a person types. */
export function releasedSignIn(email: string, id: string): string {
  return `${email.trim().toLowerCase()}${RELEASED_MARK}${String(id).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

/** The sign-in a given-up one was ("kapila.barad@gpp.local" for "kapila.barad@gpp.local#removed-…"); null for any other. */
export function releasedFrom(email: string): string | null {
  const at = email.indexOf(RELEASED_MARK);
  return at > 0 ? email.slice(0, at) : null;
}

/** What separates the sign-ins an account had before it was renamed (users.former_emails): no sign-in has a line break. */
export const FORMER_SEPARATOR = String.fromCharCode(10);

/** The sign-in an account is shown by: a given-up one as the sign-in it was. */
export function shownSignIn(email: string): string {
  return releasedFrom(email) ?? email;
}
