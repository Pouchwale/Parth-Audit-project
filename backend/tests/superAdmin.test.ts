// The super admin made from the server PC (backend/superAdmin.ts): the owner's own account, added after the first
// one, was staff, and on the plant's weekly off DCRS refused him with the staff's hours (8-Oct-2026).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MADE_SUPER_ADMIN, makeSuperAdmin, outcomeWords, type SuperAdminAccount, type SuperAdminStore } from "../superAdmin.ts";
import { createWorkingHoursGate } from "../workingHours.ts";

function storeWith(accounts: SuperAdminAccount[]) {
  const promoted: string[] = [];
  const lines: Parameters<SuperAdminStore["log"]>[0][] = [];
  const store: SuperAdminStore = {
    async find(email) {
      return accounts.find((a) => a.email === email);
    },
    async promote(id) {
      promoted.push(id);
      const a = accounts.find((x) => x.id === id)!;
      a.role = "admin";
      a.departments = "";
      a.active = true;
    },
    async log(line) {
      lines.push(line);
    },
  };
  return { store, promoted, lines };
}

const owner = (): SuperAdminAccount => ({ id: "u2", name: "Owner", email: "superadmin05@gmail.com", role: "staff", departments: "QC", active: true });

describe("making an account the super admin from the server PC", () => {
  it("makes a staff account the super admin: role admin, every department, one activity line", async () => {
    const accounts = [{ id: "u1", name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: "", active: true }, owner()];
    const { store, promoted, lines } = storeWith(accounts);
    const outcome = await makeSuperAdmin("superadmin05@gmail.com", store);
    assert.equal(outcome.kind, "made");
    assert.deepEqual(promoted, ["u2"]);
    assert.equal(accounts[1]!.role, "admin");
    assert.equal(accounts[1]!.departments, "");
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.action, MADE_SUPER_ADMIN);
    assert.equal(lines[0]!.target, "superadmin05@gmail.com");
    assert.match(lines[0]!.detail, /it was staff \(QC\)/);
    // Only that account: the first super admin is left as it was.
    assert.equal(accounts[0]!.role, "admin");
    assert.match(outcomeWords(outcome), /is now the super admin: they may sign in at any hour of any day/);
  });

  it("finds the account the way the sign-in does: spaces trimmed, any capitals", async () => {
    const { store } = storeWith([owner()]);
    assert.equal((await makeSuperAdmin("  SuperAdmin05@Gmail.com ", store)).kind, "made");
  });

  it("switches a switched-off super admin back on", async () => {
    const off = { ...owner(), role: "admin", departments: "", active: false };
    const { store, lines } = storeWith([off]);
    const outcome = await makeSuperAdmin(off.email, store);
    assert.equal(outcome.kind, "made");
    assert.equal(off.active, true);
    assert.match(lines[0]!.detail, /admin, switched off/);
  });

  it("changes nothing for an account that is already the super admin", async () => {
    const already = { ...owner(), role: "admin", departments: "" };
    const { store, promoted, lines } = storeWith([already]);
    const outcome = await makeSuperAdmin(already.email, store);
    assert.equal(outcome.kind, "already");
    assert.deepEqual(promoted, []);
    assert.deepEqual(lines, []);
    assert.match(outcomeWords(outcome), /already the super admin\. Nothing was changed/);
  });

  it("says plainly when there is no such account, or no email at all", async () => {
    const { store, promoted } = storeWith([owner()]);
    const missing = await makeSuperAdmin("nobody@gmail.com", store);
    assert.equal(missing.kind, "no-account");
    assert.match(outcomeWords(missing), /No account has the email nobody@gmail\.com/);
    const bad = await makeSuperAdmin("superadmin05", store);
    assert.equal(bad.kind, "bad-email");
    assert.match(outcomeWords(bad), /npm run super-admin -- name@example\.com/);
    assert.deepEqual(promoted, []);
  });

  it("the account made super admin is let in on the weekly off, where it was refused as staff", async () => {
    // Thursday 8 October 2026, 10:30 in the factory: the plant's weekly off.
    const gate = createWorkingHoursGate({
      source: { seq: async () => null, read: async () => null },
      seed: async () => ({ weeklyOffDay: 4, holidays: [], adjustmentDays: [], workingHours: null }),
      clock: () => new Date("2026-10-08T05:00:00Z"),
      enforced: true,
      timeZone: () => "Asia/Kolkata",
    });
    const account = owner();
    assert.ok(await gate.refusal(account), "as staff, refused on the weekly off");
    const { store } = storeWith([account]);
    await makeSuperAdmin(account.email, store);
    assert.equal(await gate.refusal(account), null, "as the super admin, let in");
  });
});
