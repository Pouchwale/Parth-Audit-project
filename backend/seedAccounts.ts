// THE PLANT'S NAMED ACCOUNTS (REQUIREMENTS §62, §96), added once by the server if they are not there (backend/index.ts).
//
// The super admin, and the twelve people the owner named on 7-Oct-2026 (frontend/src/engine/accessRules.ts
// DEFAULT_PEOPLE), at name.surname@gpp.local. What each may do is the access rules' to say (REQUIREMENTS §96), not
// their departments; the departments below are the modules each sees by the owner's table (the modules of the
// documents they answer for), so a page that still reads departments shows each person the same modules. The first
// three keep the departments they were made with (Kapila Barad: Quality Control; Vinay Bhojak and Sandeep Parekh:
// Human Resources) — an account that already exists is never touched. backend/tests/seedAccounts.test.ts holds the
// list to DEFAULT_PEOPLE.
import { DEFAULT_PEOPLE } from "../frontend/src/engine/accessRules.ts";
import { FORMER_SEPARATOR, releasedFrom } from "../frontend/src/engine/accountNames.ts";

export interface SeedAccount {
  name: string;
  email: string;
  role: "admin" | "staff";
  /** Comma-separated department codes; "" = every department. */
  departments: string;
}

/** The modules each of the owner's people sees by his table (access-spec of 7-Oct-2026: "views"). */
const SEEN: Record<string, string> = {
  "kapila.barad@gpp.local": "QC",
  "vinay.bhojak@gpp.local": "HR",
  "sandeep.parekh@gpp.local": "HR",
  "chirag.parmar@gpp.local": "PUR",
  "bharat.ahir@gpp.local": "STR",
  "ajaysinh.vaghela@gpp.local": "PRD,QC",
  "dharmik.mistry@gpp.local": "PRD",
  "anil.ravad@gpp.local": "PRD",
  "vishnu.jadhav@gpp.local": "PRD",
  "raghunath.mane@gpp.local": "MNT",
  "ajay.zala@gpp.local": "QC,MNT",
  "ankur.raval@gpp.local": "QC",
};

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: "" },
  ...DEFAULT_PEOPLE.map((p) => ({ name: p.name, email: p.email, role: "staff" as const, departments: SEEN[p.email] ?? "" })),
];

/** An account on file as the seeding looks at it: its sign-in, and the ones it had before it was renamed (one a line). */
export interface AccountOnFile {
  email: string;
  former_emails?: string | null;
}

/**
 * THE NAMED ACCOUNTS THE SEEDING STILL ADDS (REQUIREMENTS §110): those of SEED_ACCOUNTS that no account has, ever had or
 * gave up. An account the super admin REMOVED keeps its sign-in, so it is never added again; one whose sign-in was given
 * to another account with a rename's "Replace it" keeps the given-up one (accountNames.ts releasedSignIn), and an account
 * RENAMED keeps the sign-ins it had (users.former_emails): the seeding never puts back what the super admin took away.
 * backend/db.ts seedUser holds the same rule in its own statement, for two servers starting at once.
 */
export function seedAccountsToAdd(onFile: readonly AccountOnFile[], seed: readonly SeedAccount[] = SEED_ACCOUNTS): SeedAccount[] {
  const known = new Set<string>();
  for (const a of onFile) {
    const email = a.email.trim().toLowerCase();
    known.add(email);
    const gaveUp = releasedFrom(email);
    if (gaveUp) known.add(gaveUp);
    for (const f of String(a.former_emails ?? "").split(FORMER_SEPARATOR)) if (f.trim()) known.add(f.trim().toLowerCase());
  }
  return seed.filter((a) => !known.has(a.email));
}
