// MITRA'S RULES PATH OFFERS AND REFUSES BY THE PERSON'S LEVEL (REQUIREMENTS §96; the people review of 9-Oct-2026).
//
// Asked about a document by its number, Mitra offered "Start a new one" and "Fill it question by question" to people
// who only read it, and told a person who does not see a document's module the old department story ("belongs to
// Human Resources, which isn't one of your departments — the system administrator can add it to your account").
// The chips now follow the level (start needs Write, so does filling), and the words are the levels' own.
// (Asked to fill a record they only read, Mitra gives the access refusal first: components/common/DocumentAssistant.tsx
// startInterview, driven by tests/e2e_access_levels.py.)
// Run: npm run test:unit -- mitraRulesAccess
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { formatChips, formatNumberAnswer } from "../src/engine/formatNumbers";
import { setAccessRules, setAccessScope, setDepartmentScope } from "../src/engine/departmentScope";
import type { AccessAccount } from "../src/engine/accessRules";

ensureDocumentsSeeded();
ensureMasterSeeded();

const VINAY: AccessAccount = { email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] };
const CHIRAG: AccessAccount = { email: "chirag.parmar@gpp.local", role: "staff", departments: [] };

function as<T>(who: AccessAccount, run: () => T): T {
  setAccessScope(who, null);
  try {
    return run();
  } finally {
    setDepartmentScope(null);
    setAccessRules(null);
  }
}

const byNumber = (formatNo: string) => documentRepository.getAllUnscoped().find((d) => d.formatNo === formatNo)!;
const kinds = (chips: { action: { type: string } }[]) => chips.map((c) => c.action.type);

test("a document Vinay Bhojak only reads is offered to open, never to start or to fill question by question", () => {
  const read = as(VINAY, () => formatChips(byNumber("F/HR/17")));
  assert.deepEqual(kinds(read), ["navigate"], JSON.stringify(read));
  const own = as(VINAY, () => formatChips(byNumber("F/HR/14")));
  assert.ok(kinds(own).includes("createRecord") && kinds(own).includes("startInterview"), JSON.stringify(own));
});

test("a document outside the person's modules is refused in the levels' words, not the old department story", () => {
  const answer = as(CHIRAG, () => formatNumberAnswer("F/HR/17"));
  assert.ok(answer, "Mitra answers a format number");
  assert.doesNotMatch(answer!.reply, /one of your departments|add it to your account/, answer!.reply);
  assert.match(answer!.reply, /which you do not see/, answer!.reply);
  assert.match(answer!.reply, /super admin/, answer!.reply);
});
