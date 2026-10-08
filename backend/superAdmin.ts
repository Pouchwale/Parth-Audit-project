// MAKING AN ACCOUNT THE SUPER ADMIN, FROM THE SERVER PC (the owner, 8-Oct-2026).
//
// DCRS makes the FIRST account ever its super admin (role "admin": insertUser in
// backend/db.ts; on most installs the seeded admin@gpp.local), and every account
// added later is staff; no screen changes a role. An owner whose own account came
// later therefore had no way, from the app, to make it the super admin, the one
// account that may use DCRS at any hour of any day (REQUIREMENTS §84): on the
// plant's weekly off he was refused with the staff's hours. This is that way, run
// on the computer that runs DCRS (scripts/make-super-admin.ts, `npm run
// super-admin -- <email>`). Whoever can run it there can already read the
// database, so it gives nobody anything they did not have.
//
// It changes that one account only: role admin, every department (the super
// admin covers them all), switched on. Its password, its history and every other
// account stay exactly as they are, and one line goes into the activity log.

/** The few fields of an account this reads. */
export interface SuperAdminAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  departments: string;
  active: boolean;
}

/** Where the accounts are: the database (scripts/make-super-admin.ts), or a test's stand-in. */
export interface SuperAdminStore {
  /** The account with this email, already trimmed and in lower case, as the sign-in looks it up. */
  find(email: string): Promise<SuperAdminAccount | undefined>;
  /** Makes it the super admin: role admin, every department, switched on. */
  promote(id: string): Promise<void>;
  /** One line in the activity log. */
  log(line: { userId: string; userName: string; userEmail: string; action: string; target: string; detail: string; ip: string }): Promise<void>;
}

export type SuperAdminOutcome =
  | { kind: "bad-email"; given: string }
  | { kind: "no-account"; email: string }
  | { kind: "already"; account: SuperAdminAccount }
  | { kind: "made"; account: SuperAdminAccount; was: string };

/** The activity log's action word for it, so the log and its tests agree. */
export const MADE_SUPER_ADMIN = "Made super admin";

/** How the account stood before, in words for the activity log: "staff (QC)", "admin, switched off". */
function standing(a: SuperAdminAccount): string {
  const departments = a.departments.trim();
  return `${a.role}${departments ? ` (${departments})` : ""}${a.active ? "" : ", switched off"}`;
}

export async function makeSuperAdmin(given: string, store: SuperAdminStore): Promise<SuperAdminOutcome> {
  const email = given.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return { kind: "bad-email", given };
  const account = await store.find(email);
  if (!account) return { kind: "no-account", email };
  if (account.role === "admin" && account.active && account.departments.trim() === "") return { kind: "already", account };
  const was = standing(account);
  await store.promote(account.id);
  await store.log({
    userId: account.id,
    userName: account.name,
    userEmail: account.email,
    action: MADE_SUPER_ADMIN,
    target: account.email,
    detail: `From the server PC (npm run super-admin); it was ${was}`,
    ip: "server",
  });
  return { kind: "made", account, was };
}

/** What the command prints, in plain words. */
export function outcomeWords(o: SuperAdminOutcome): string {
  switch (o.kind) {
    case "bad-email":
      return `"${o.given}" is not an email address. Write it like this: npm run super-admin -- name@example.com`;
    case "no-account":
      return `No account has the email ${o.email}. Check the spelling, or create the account first (Users & Access), then run this again.`;
    case "already":
      return `${o.account.name} (${o.account.email}) is already the super admin. Nothing was changed.`;
    case "made":
      return `${o.account.name} (${o.account.email}) is now the super admin: they may sign in at any hour of any day and see every department. It was ${o.was}. Sign in again for it to take effect.`;
  }
}
