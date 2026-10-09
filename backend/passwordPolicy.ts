// PASSWORDS ARE THE SUPER ADMIN'S (REQUIREMENTS §105).
//
// The owner, 9-Oct-2026, with a picture of the "Choose your own password" dialog:
// "So once Superadmin assign any new password then user can login with that only
// and remove this option from all other users except superadmin".
//
// So a password the super admin gives an account is the one it signs in with:
// nobody is asked to choose their own, and nobody but the super admin changes a
// password, their own or anybody else's (Users & Access). The super admin keeps
// "Change password" in the top bar, and is still asked to choose their own while
// their account is on the built-in first password, which is written in the
// documentation (§66).
//
// Two consequences, both kept safe:
// - An account the system makes with no password the super admin chose (the
//   named accounts, when SEED_ACCOUNT_PASSWORD is not set) has NO_PASSWORD_YET,
//   which no password matches. Nobody signs in to it until the super admin gives
//   it one, and Users & Access says "No password yet" against it.
// - Accounts already on file that were waiting to choose their own are settled
//   once, at start-up (settleFirstPasswords). One still on the built-in first
//   password, which anybody can read, is given NO_PASSWORD_YET the same way. One
//   on a password the super admin typed simply keeps it, and the wait is lifted.

/** The first password the named accounts were given before §105, written in the documentation. */
export const BUILT_IN_FIRST_PASSWORD = "Gpp@12345";

/**
 * What an account waiting for the super admin's password has in place of a hash: not a bcrypt hash,
 * so no password ever matches it, and the system can tell the account apart to say so.
 */
export const NO_PASSWORD_YET = "none:waiting-for-the-super-admin";

/** Whether this account may change its own password: the super admin only. */
export function mayChangeOwnPassword(user: { role?: string | null }): boolean {
  return user.role === "admin";
}

/** Whether nobody can sign in to this account yet, until the super admin gives it a password. */
export function hasNoPasswordYet(account: { password_hash?: string | null }): boolean {
  return account.password_hash === NO_PASSWORD_YET;
}

export interface PasswordAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  password_hash: string;
  must_change_password: boolean;
}

export interface SettleDeps {
  accounts: () => Promise<PasswordAccount[]>;
  verify: (password: string, hash: string) => Promise<boolean>;
  setPassword: (id: string, hash: string, mustChange: boolean) => Promise<void>;
  log: (line: string) => void;
}

/**
 * Accounts other than the super admin's that were waiting to choose their own password: the wait is
 * lifted, and one still on the built-in first password waits for the super admin's password instead.
 */
export async function settleFirstPasswords(deps: SettleDeps): Promise<{ cleared: string[]; locked: string[] }> {
  const cleared: string[] = [];
  const locked: string[] = [];
  for (const a of await deps.accounts()) {
    if (!a.must_change_password || mayChangeOwnPassword(a)) continue;
    if (await deps.verify(BUILT_IN_FIRST_PASSWORD, a.password_hash)) {
      await deps.setPassword(a.id, NO_PASSWORD_YET, false);
      locked.push(a.email);
      deps.log(`${a.name} <${a.email}> was on the built-in first password: nobody can sign in to it until the super admin gives it a password (Users & Access).`);
    } else {
      await deps.setPassword(a.id, a.password_hash, false);
      cleared.push(a.email);
    }
  }
  if (cleared.length) deps.log(`${cleared.length} account(s) sign in with the password the super admin gave them; nobody is asked to choose their own (REQUIREMENTS §105).`);
  return { cleared, locked };
}
