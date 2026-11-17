// A PERSON KNOWN BY NAME IS SCORED BY THE ADDRESS THE PLANT'S RULES HOLD FOR THEM (REQUIREMENTS §247; the owner,
// 17-Nov-2026, with the dashboard's line "Kapila Barad · Quality Control · No record fell due": "for kapila barad i can't
// see score of it"). The plant's Users & Access names her "kapilabarad@gpp.local" for her 79 documents; the people the
// scores are drawn for carry no address, so she was known as the owner's "kapila.barad@gpp.local" and found answering
// for none of them. Run: npm run test:unit -- scorePlantAddresses
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { scoreAnswerRule, setAccessScope } from "../src/engine/departmentScope";
import type { AccessAccount } from "../src/engine/accessRules";
import { scorecards, type Person } from "../src/engine/performance";
import { createDefaultData } from "../src/engine/recordDefaults";
import { addDays, todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();

const BOSS: AccessAccount = { email: "admin@gpp.local", role: "admin", departments: [] };
// The plant's rules as stored on 17-Nov-2026, in part: its addresses without the dot.
const PLANT_RULES = {
  version: 1,
  people: {
    "kapilabarad@gpp.local": { modules: { HR: "edit", QC: "edit", SYS: "edit", MNT: "edit" } },
    "vinaybhojak@gpp.local": { modules: { HR: "edit" } },
    "sandeepparekh@gpp.local": { modules: { HR: "edit" } },
  },
  responsibility: {
    "qc-gsm-plate-calibration": ["kapilabarad@gpp.local"],
    "qc-weight-scale-calibration": ["kapilabarad@gpp.local"],
    "daily-pest-monitoring": ["kapilabarad@gpp.local"],
    "hr-hygiene-report": ["vinaybhojak@gpp.local", "sandeepparekh@gpp.local"],
  },
};

const record = (documentId: string, dueDate: string): RecordInstance => ({
  id: `score-${documentId}-${dueDate}`,
  documentId,
  periodKey: `${documentId}:score:${dueDate}`,
  dueDate,
  status: "Due",
  isDemo: false,
  data: createDefaultData(documentRepository.getByIdUnscoped(documentId)!, dueDate, masterRepository.get()),
  createdAt: `${dueDate}T03:00:00.000Z`,
  updatedAt: `${dueDate}T03:00:00.000Z`,
});

test("Kapila Barad, known by name, answers for the documents the plant's rules give kapilabarad@gpp.local - and is scored", () => {
  const today = todayISO();
  const due = addDays(today, -4);
  const ids = ["qc-gsm-plate-calibration", "qc-weight-scale-calibration", "daily-pest-monitoring", "hr-hygiene-report"];
  const docs = ids.map((id) => documentRepository.getByIdUnscoped(id)!);
  const records = ids.map((id) => record(id, due));
  // As the dashboard has them: names, roles and departments, no addresses.
  const people: Person[] = [
    { id: "k", name: "Kapila Barad", role: "staff", departments: ["QC"] },
    { id: "v", name: "Vinay Bhojak", role: "staff", departments: ["HR"] },
  ];
  setAccessScope(BOSS, PLANT_RULES);
  try {
    const rule = scoreAnswerRule()!;
    for (const id of ids.slice(0, 3)) assert.ok(rule(people[0], documentRepository.getByIdUnscoped(id)!), `Kapila answers for ${id}`);
    assert.ok(!rule(people[0], documentRepository.getByIdUnscoped("hr-hygiene-report")!), "not for Vinay's");
    assert.ok(rule(people[1], documentRepository.getByIdUnscoped("hr-hygiene-report")!), "Vinay Bhojak by vinaybhojak@gpp.local too");
    const cards = scorecards(records, docs, people, { from: addDays(today, -10), to: today }, today, undefined, rule);
    const kapila = cards.byPerson.find((p) => p.person.id === "k")!;
    assert.ok(kapila.due >= 2, `her records that fell due count against her: she has a score (${kapila.due})`);
    assert.ok(kapila.answers);
    assert.deepEqual(kapila.departments.slice().sort(), ["HR", "QC"], "Quality Control and Human Resources, as her documents are");
  } finally {
    setAccessScope(null);
  }
});
