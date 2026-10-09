// PASSWORDS ARE THE SUPER ADMIN'S (REQUIREMENTS §105), backend/passwordPolicy.ts: only the super admin changes their
// own password; a password the super admin gives anybody else is the one they sign in with; accounts waiting to choose
// their own are settled once at start-up, and one still on the built-in first password waits for the super admin's.
// Run: npm run test:unit -- passwordPolicy
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import bcrypt from "bcryptjs";
import {
  BUILT_IN_FIRST_PASSWORD,
  NO_PASSWORD_YET,
  hasNoPasswordYet,
  mayChangeOwnPassword,
  settleFirstPasswords,
  type PasswordAccount,
} from "../passwordPolicy.ts";

const verify = (password: string, hash: string) => bcrypt.compare(password, hash);

function account(id: string, role: string, password_hash: string, must_change_password: boolean): PasswordAccount {
  return { id, name: id, email: `${id}@gpp.local`, role, password_hash, must_change_password };
}

describe("who changes their own password", () => {
  it("the super admin only", () => {
    assert.equal(mayChangeOwnPassword({ role: "admin" }), true);
    assert.equal(mayChangeOwnPassword({ role: "staff" }), false);
    assert.equal(mayChangeOwnPassword({ role: null }), false);
    assert.equal(mayChangeOwnPassword({}), false);
  });
});

describe("no password yet", () => {
  it("matches no password, the built-in one and an empty one included", async () => {
    for (const p of [BUILT_IN_FIRST_PASSWORD, "", NO_PASSWORD_YET]) assert.equal(await verify(p, NO_PASSWORD_YET), false, p);
  });

  it("is told apart from a real password", async () => {
    assert.equal(hasNoPasswordYet({ password_hash: NO_PASSWORD_YET }), true);
    assert.equal(hasNoPasswordYet({ password_hash: await bcrypt.hash("Typed@2026", 4) }), false);
    assert.equal(hasNoPasswordYet({ password_hash: null }), false);
  });
});

describe("settling the accounts waiting to choose their own, at start-up", () => {
  it("keeps a password the super admin typed and lifts the wait; one on the built-in password waits for the super admin's", async () => {
    const typed = await bcrypt.hash("Typed@2026", 4);
    const builtIn = await bcrypt.hash(BUILT_IN_FIRST_PASSWORD, 4);
    const ownChosen = await bcrypt.hash("MyOwn@2026", 4);
    const accounts = [
      account("given", "staff", typed, true),
      account("built-in", "staff", builtIn, true),
      account("chose-own", "staff", ownChosen, false),
      account("admin", "admin", builtIn, true),
    ];
    const set: Array<[string, string, boolean]> = [];
    const lines: string[] = [];
    const out = await settleFirstPasswords({
      accounts: async () => accounts,
      verify,
      setPassword: async (id, hash, mustChange) => void set.push([id, hash, mustChange]),
      log: (line) => lines.push(line),
    });
    assert.deepEqual(out, { cleared: ["given@gpp.local"], locked: ["built-in@gpp.local"] });
    assert.deepEqual(set, [
      ["given", typed, false],
      ["built-in", NO_PASSWORD_YET, false],
    ]);
    assert.ok(!set.some(([id]) => id === "admin"), "the super admin is still asked to choose their own");
    assert.ok(!set.some(([id]) => id === "chose-own"), "an account that already chose its own keeps it");
    assert.ok(lines.some((l) => l.includes("built-in@gpp.local") && l.includes("super admin gives it a password")));
    assert.ok(!lines.some((l) => l.includes(BUILT_IN_FIRST_PASSWORD) || l.includes("Typed@2026")), "no password is written down");
  });

  it("does nothing the second time", async () => {
    const accounts = [account("given", "staff", "h", false), account("locked", "staff", NO_PASSWORD_YET, false)];
    const set: string[] = [];
    const lines: string[] = [];
    const out = await settleFirstPasswords({
      accounts: async () => accounts,
      verify,
      setPassword: async (id) => void set.push(id),
      log: (line) => lines.push(line),
    });
    assert.deepEqual(out, { cleared: [], locked: [] });
    assert.deepEqual(set, []);
    assert.deepEqual(lines, []);
  });
});
