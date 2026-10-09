// WHO MAY DO WHAT TO WHICH DOCUMENT (REQUIREMENTS §96), without a browser: engine/accessRules.ts held to the owner's table.
//
// On 7-Oct-2026 the owner said who fills each document, by format number (QC, HR, SYS, Purchase, Store, Production and its
// ranges, Maintenance, the QA camera test), answered two rounds of questions, and on 8-Oct-2026 asked for Read, Write and
// Edit levels set only by the super admin. These tests hold the rules to that, document by document:
//   * the table below says who answers for each of the catalogue's documents; it was worked out from his words, apart from
//     the rules' own code, and every line was read against what he said;
//   * each of the twelve people sees the modules of what they fill and nothing else (Kapila Barad and the super admin see all);
//   * a person has Edit on what they answer for, Read on the rest of their modules, and nothing elsewhere (Kapila Barad:
//     Edit on all of QC and SYS as well);
//   * the three levels are cumulative, and decide start, fill, submit, verify, correct, delete and change the format;
//   * what the super admin sets wins over the default, a document's setting over its module's;
//   * an account nobody has described keeps what it had; stored junk is dropped;
//   * a format supplied later lands with the right person by its number.
// Run: npm run test:unit -- accessRules
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { PLANT_DEPARTMENTS } from "../src/data/seed/documentDepartments";
import { departmentOfDocument } from "../src/data/seed/departments";
import {
  ACCESS_MODULES,
  DEFAULT_PEOPLE,
  atLeast,
  buildAccess,
  defaultResponsible,
  levelNeeded,
  normalizeAccessRules,
  parseFormatNo,
  type AccessAccount,
  type AccessDoc,
  type AccessLevel,
  type DocumentAction,
} from "../src/engine/accessRules";
import { noProblems } from "./support/catalogue";

ensureDocumentsSeeded();
ensureMasterSeeded();

const catalogue = (): AccessDoc[] =>
  documentRepository.getAllUnscoped().map((d) => ({ id: d.id, formatNo: d.formatNo, department: departmentOfDocument(d.id, d.formatNo), reference: !!d.isReferenceOnly }));

const FIRST_NAMES: Record<string, string> = {
  "kapila.barad@gpp.local": "Kapila",
  "vinay.bhojak@gpp.local": "Vinay",
  "sandeep.parekh@gpp.local": "Sandeep",
  "chirag.parmar@gpp.local": "Chirag",
  "bharat.ahir@gpp.local": "Bharat",
  "ajaysinh.vaghela@gpp.local": "AjaySinh",
  "dharmik.mistry@gpp.local": "Dharmik",
  "anil.ravad@gpp.local": "Anil",
  "vishnu.jadhav@gpp.local": "Vishnu",
  "raghunath.mane@gpp.local": "Raghunath",
  "ajay.zala@gpp.local": "Zala",
  "ankur.raval@gpp.local": "Ankur",
};
const EMAIL_OF = Object.fromEntries(Object.entries(FIRST_NAMES).map(([email, name]) => [name, email]));
const names = (emails: string[]): string => emails.map((e) => FIRST_NAMES[e] ?? e).join("+");

const account = (who: string): AccessAccount => ({ email: EMAIL_OF[who]!, role: "staff", departments: [] });
const BOSS: AccessAccount = { email: "admin@gpp.local", role: "admin", departments: [] };

/** WHO ANSWERS FOR EACH DOCUMENT, from the owner's words of 7-Oct-2026 (his answers to the two rounds of questions included). */
const EXPECTED: Record<string, string> = {
  "disp-safe-transporter-agreement":  "Kapila",  // F/DISP/01
  "disp-container-stuffing":          "Kapila",  // F/DISP/02
  "disp-vehicle-cleaning":            "Kapila",  // F/DISP/04
  "hr-competence":                    "Vinay+Sandeep",  // F/HR/01
  "hr-training-effectiveness":        "Vinay+Sandeep",  // F/HR/11
  "hr-training-feedback":             "Vinay+Sandeep",  // F/HR/12
  "hr-mobile-authorization":          "Vinay+Sandeep",  // F/HR/13
  "hr-visitor-health":                "Vinay+Sandeep",  // F/HR/14
  "hr-daily-cleaning":                "Kapila",  // F/HR/15
  "hr-monthly-cleaning":              "Kapila",  // F/HR/16
  "daily-pest-monitoring":            "Kapila",  // F/HR/17
  "fly-catcher":                      "Kapila",  // F/HR/18
  "hr-gmp-checklist":                 "Vinay+Sandeep",  // F/HR/19
  "hr-psc-survey":                    "Vinay+Sandeep",  // F/HR/20
  "hr-psc-survey-analysis":           "Vinay+Sandeep",  // F/HR/21
  "hr-hygiene-report":                "Vinay+Sandeep",  // F/HR/22
  "hr-skill-matrix":                  "Vinay+Sandeep",  // F/HR/03
  "hr-pre-employment-health":         "Vinay+Sandeep",  // F/HR/04
  "hr-induction-staff":               "Vinay+Sandeep",  // F/HR/05
  "hr-induction-operators":           "Vinay+Sandeep",  // F/HR/06
  "hr-job-responsibility":            "Vinay+Sandeep",  // F/HR/07
  "hr-training-needs":                "Vinay+Sandeep",  // F/HR/08
  "hr-training-calendar":             "Vinay+Sandeep",  // F/HR/09
  "chemical-master":                  "",  // TO BE CONFIRMED (reference: filled by nobody)
  "gurudev-insecticide-licence":      "",  // FORM III — MEH/FP1230000675/2023-2024 (reference: filled by nobody)
  "pest-responsibilities":            "Kapila",  // TO BE CONFIRMED
  "service-report-fly":               "Kapila",  // TO BE CONFIRMED
  "service-report-general":           "Kapila",  // TO BE CONFIRMED
  "service-report-rodent":            "Kapila",  // TO BE CONFIRMED
  "training-record":                  "Kapila",  // TO BE CONFIRMED
  "mkt-customer-feedback":            "Kapila",  // F/MKT/01
  "mkt-feedback-analysis":            "Kapila",  // F/MKT/02
  "mkt-complaint-trend":              "Kapila",  // F/MKT/04
  "capa-customer-complaint":          "Kapila",  // F/MKT/05
  "capa-complaint-ack":               "Kapila",  // QA-CAF-00
  "mnt-equipment-list":               "Kapila",  // F/MNT/01
  "mnt-wooden-articles":              "Zala",  // F/MNT/10
  "mnt-lux-level":                    "Kapila",  // F/MNT/11
  "mnt-pm-record":                    "Raghunath",  // F/MNT/02
  "mnt-yearly-pm-schedule":           "Raghunath",  // F/MNT/03
  "mnt-daily-health":                 "Raghunath",  // F/MNT/04
  "mnt-breakdown-clearance":          "Raghunath",  // F/MNT/05
  "mnt-breakdown-memo":               "Raghunath",  // F/MNT/05
  "mnt-breakdown-record":             "Raghunath",  // F/MNT/06
  "mnt-temporary-engineering":        "Raghunath",  // F/MNT/07
  "mnt-new-equipment":                "Raghunath",  // F/MNT/08
  "mnt-glass-breakage":               "Zala",  // F/MNT/09
  "prd-sharp-object-issue":           "Dharmik+Anil+AjaySinh",  // F/PRD/10
  "prd-alc-production":               "Vishnu+AjaySinh",  // F-PRD-18
  "prd-process-parameter":            "Vishnu+AjaySinh",  // F-PRD-19
  "prd-slitting-alc":                 "Vishnu+AjaySinh",  // F-PRD-20
  "prd-pouching-line-clearance":      "Vishnu+AjaySinh",  // F/PRD/21
  "prd-pouching-blade":               "Vishnu+AjaySinh",  // F/PRD/22
  "prd-pouching-cutter-issue":        "Vishnu+AjaySinh",  // F/PRD/23
  "prd-slitting-blade":               "Vishnu+AjaySinh",  // F/PRD/24
  "prd-doctoring-alc":                "Vishnu+AjaySinh",  // F-PRD-26
  "pur-supplier-registration":        "Chirag",  // F/PUR/01
  "pur-supplier-audit-report":        "Chirag",  // F/PUR/02
  "pur-approved-suppliers":           "Chirag",  // F/PUR/03
  "pur-supplier-performance":         "Chirag",  // F/PUR/05
  "pur-service-provider-performance": "Chirag",  // F/PUR/06
  "service-agreement":                "Chirag",  // TO BE CONFIRMED
  "gap-inspection":                   "Kapila",  // TO BE CONFIRMED
  "qc-bopp-film":                     "Kapila",  // F/QC/01
  "qc-gsm-plate-calibration":         "Kapila",  // F/QC/11
  "qc-weight-scale-calibration":      "Kapila",  // F/QC/12
  "qc-inprocess-printing":            "Zala",  // F/QC/13
  "qc-line-clearance-printing":       "Kapila",  // F/QC/15-A
  "qc-line-clearance-punching":       "Kapila",  // F/QC/15-B
  "qc-line-clearance-qc-machine":     "Kapila",  // F/QC/15-C
  "qc-line-clearance-qc-manual":      "Kapila",  // F/QC/15-D
  "qc-line-clearance-slitting":       "Kapila",  // F/QC/15-E
  "qc-line-clearance-sleeve-gluing":  "Kapila",  // F/QC/15-F
  "qc-line-clearance-sleeve-cutting": "Kapila",  // F/QC/15-G
  "qc-obsolete-artwork":              "Kapila",  // F/QC/16
  "qc-offset-ink":                    "Kapila",  // F/QC/18
  "qc-duplex-board":                  "Kapila",  // F/QC/19
  "qc-tolerance-card-nivea":          "Kapila",  // F-QC-19
  "qc-corrugated-box":                "Kapila",  // F/QC/02
  "qc-kraft-paper":                   "Kapila",  // F/QC/20
  "qc-printing-aids-destruction":     "Kapila",  // F/QC/20
  "qc-flexo-ink":                     "Kapila",  // F/QC/21
  "qc-lamination-adhesive-inspection": "Kapila",  // F/QC/21
  "qc-side-pasting-adhesive":         "Kapila",  // F/QC/22
  "qc-starch-powder":                 "Kapila",  // F/QC/23
  "qc-sheet-pasting-powder":          "Kapila",  // F/QC/24
  "qc-coa-corrugated":                "Kapila",  // F/QC/25
  "qc-analysis-report":               "Kapila",  // F/QC/29
  "qc-utility-test-report":           "Kapila",  // F/QC/29
  "qc-label-stock":                   "Kapila",  // F/QC/03
  "qc-minutes-of-meetings":           "Kapila",  // F/QC/30
  "qc-viscosity":                     "Ankur",  // F-QC-30
  "qc-adhesive-mixing":               "Ankur",  // F-QC-32
  "qc-incoming-lamination-film":      "Kapila",  // F/QC/33
  "qc-inspection-printed-film":       "Zala",  // F/QC/34
  "qc-inspection-slitting":           "Kapila",  // F/QC/35
  "qc-inspection-sb-lamination":      "Kapila",  // F/QC/36
  "qc-inspection-pouching":           "Kapila",  // F/QC/37
  "soc-flexible-packaging":           "",  // F/QC-38 (reference: filled by nobody)
  "qc-paper-core":                    "Kapila",  // F/QC/04
  "qc-temperature":                   "Ankur",  // F-QC-40.C
  "qc-pvc-pet-film":                  "Kapila",  // F/QC/05
  "qc-coa-label":                     "Kapila",  // F/QC/06
  "qc-coa-sleeve":                    "Kapila",  // F/QC/07
  "qc-calibration-master-list":       "Kapila",  // F/QC/08
  "soc-labels":                       "",  // F/QC-09 (reference: filled by nobody)
  "qc-camera-challenge-test":         "AjaySinh",  // F: QA/PRO/FL/CCT/01
  "qc-line-clearance-materials":      "Kapila",  // TO BE CONFIRMED
  "qc-line-clearance-quality":        "Kapila",  // TO BE CONFIRMED
  "str-incoming-material-vehicle":    "Bharat",  // F/STR/01
  "str-sharp-metal-objects":          "Bharat",  // F/STR/02
  "sys-document-list":                "Kapila",  // F/SYS/01
  "sys-audit-nc":                     "Kapila",  // F/SYS/10
  "sys-nc-car":                       "Kapila",  // F/SYS/11
  "sys-hara-monthly":                 "Kapila",  // F/SYS/12
  "sys-mock-recall":                  "Kapila",  // F/SYS/13
  "sys-backward-trace":               "Kapila",  // F/SYS/14
  "sys-forward-trace":                "Kapila",  // F/SYS/15
  "sys-objectives":                   "Kapila",  // F/SYS/16
  "sys-site-security":                "Kapila",  // F/SYS/17
  "sys-format-list":                  "Kapila",  // F/SYS/02
  "sys-hara-annual":                  "Kapila",  // F/SYS/20
  "sys-document-change":              "Kapila",  // F/SYS/03
  "sys-mrm-record":                   "Kapila",  // F/SYS/04
  "sys-mrm-agenda":                   "Kapila",  // F/SYS/04-A
  "sys-audit-schedule":               "Kapila",  // F/SYS/05
  "sys-audit-plan":                   "Kapila",  // F/SYS/06
  "sys-audit-risk":                   "Kapila",  // F/SYS/07
  "sys-audit-findings":               "Kapila",  // F/SYS/08
};

test("the plant's ten modules are the ten departments of the master list", () => {
  assert.deepEqual([...ACCESS_MODULES].sort(), PLANT_DEPARTMENTS.map((d) => d.code).sort());
});

test("every document of the catalogue is in the owner's table, and every line of it is a document", () => {
  const ids = catalogue().map((d) => d.id).sort();
  assert.deepEqual(Object.keys(EXPECTED).sort(), ids);
});

test("each document is answered for by exactly the people the owner named", () => {
  const problems: string[] = [];
  for (const d of catalogue()) {
    const got = names(defaultResponsible(d));
    if (got !== EXPECTED[d.id]) problems.push(`${d.id} (${d.formatNo}): ${got || "nobody"}, the owner's table says ${EXPECTED[d.id] || "nobody"}`);
  }
  noProblems("A document with the wrong person", problems);
});

test("a reference document is filled by nobody", () => {
  for (const d of catalogue().filter((x) => x.reference)) assert.deepEqual(defaultResponsible(d), [], d.id);
});

/** The modules each of the twelve sees (the owner: "own module only"; Kapila Barad and the super admin see everything). */
const MODULES_SEEN: Record<string, string> = {
  Kapila: "QC HR SYS MNT PRD PUR STR MKT DISP QA",
  Vinay: "HR",
  Sandeep: "HR",
  Chirag: "PUR",
  Bharat: "STR",
  AjaySinh: "QC PRD",
  Dharmik: "PRD",
  Anil: "PRD",
  Vishnu: "PRD",
  Raghunath: "MNT",
  Zala: "QC MNT",
  Ankur: "QC",
};

test("each person sees the modules of the documents they fill, and Kapila Barad and the super admin see all ten", () => {
  const access = buildAccess(catalogue());
  for (const [who, modules] of Object.entries(MODULES_SEEN)) {
    const seen = access.modules(account(who)).map((m) => m.module);
    assert.deepEqual([...seen].sort(), modules.split(" ").sort(), who);
  }
  assert.deepEqual(access.modules(BOSS).map((m) => m.module), [...ACCESS_MODULES]);
  assert.ok(access.modules(BOSS).every((m) => m.level === "edit"));
});

test("a person has Edit on what they answer for and Read on the rest of their modules; Kapila Barad has Edit on all of QC and SYS as well; nobody has anything elsewhere", () => {
  const docs = catalogue();
  const access = buildAccess(docs);
  const problems: string[] = [];
  for (const who of Object.keys(MODULES_SEEN)) {
    const me = account(who);
    const seen = new Set(MODULES_SEEN[who]!.split(" "));
    for (const d of docs) {
      const answers = EXPECTED[d.id]!.split("+").includes(who);
      const kapilaEdits = who === "Kapila" && (d.department === "QC" || d.department === "SYS");
      const want: AccessLevel = answers || kapilaEdits ? "edit" : seen.has(d.department ?? "") ? "read" : "none";
      const got = access.level(me, d.id);
      if (got !== want) problems.push(`${who} on ${d.id}: ${got}, expected ${want}`);
    }
  }
  noProblems("A level that is not the owner's", problems);
});

test("the people are told about the documents they fill, the super admin about none in particular, and a reference document about nobody", () => {
  const docs = catalogue();
  const access = buildAccess(docs);
  for (const who of Object.keys(MODULES_SEEN)) {
    const want = docs.filter((d) => EXPECTED[d.id]!.split("+").includes(who)).map((d) => d.id);
    assert.deepEqual(access.answersFor(account(who)).sort(), want.sort(), who);
  }
  assert.deepEqual(access.answersFor(BOSS), []);
});

test("the super admin has Edit on every document and is the boss", () => {
  const docs = catalogue();
  const access = buildAccess(docs);
  assert.ok(access.isBoss(BOSS));
  for (const d of docs) assert.equal(access.level(BOSS, d.id), "edit", d.id);
  assert.equal(access.level(BOSS, "no-such-document"), "edit");
});

test("the levels are cumulative and each decides the actions it should", () => {
  const ACTIONS: DocumentAction[] = ["view", "start", "fill", "submit", "verify", "send_back", "correct", "delete", "format"];
  const allowed: Record<AccessLevel, DocumentAction[]> = {
    none: [],
    read: ["view"],
    write: ["view", "start", "fill", "submit", "verify", "send_back"],
    edit: ACTIONS,
  };
  for (const level of Object.keys(allowed) as AccessLevel[]) {
    for (const action of ACTIONS) assert.equal(atLeast(level, levelNeeded(action)), allowed[level].includes(action), `${level} / ${action}`);
  }
  const docs = catalogue();
  const access = buildAccess(docs, { people: { "ankur.raval@gpp.local": { documents: { "qc-bopp-film": "write" } } } });
  const me = account("Ankur");
  assert.ok(access.may(me, "qc-bopp-film", "submit"));
  assert.ok(!access.may(me, "qc-bopp-film", "correct"));
  assert.ok(access.may(me, "qc-viscosity", "correct"));
  assert.ok(access.may(me, "qc-inprocess-printing", "view"));
  assert.ok(!access.may(me, "qc-inprocess-printing", "start"));
  assert.ok(!access.may(me, "hr-competence", "view"));
});

test("what the super admin sets wins over the default, and a document's setting over its module's", () => {
  const docs = catalogue();
  const stored = {
    people: {
      // A module switched off, though they answer for documents in it: the setting is the super admin's own word.
      "vinay.bhojak@gpp.local": { modules: { HR: "none" } },
      // Production at Write, one Quality Control document at Edit.
      "ankur.raval@gpp.local": { modules: { PRD: "write" }, documents: { "qc-bopp-film": "edit" } },
    },
    // Somebody else answers for the competence record now.
    responsibility: { "hr-competence": ["sandeep.parekh@gpp.local"] },
  };
  const access = buildAccess(docs, stored);
  assert.equal(access.level(account("Vinay"), "hr-hygiene-report"), "none");
  assert.deepEqual(access.responsible("hr-competence"), ["sandeep.parekh@gpp.local"]);
  assert.equal(access.level(account("Sandeep"), "hr-competence"), "edit");
  assert.equal(access.level(account("Sandeep"), "hr-hygiene-report"), "edit");
  assert.equal(access.level(account("Ankur"), "prd-alc-production"), "write");
  assert.equal(access.level(account("Ankur"), "qc-bopp-film"), "edit");
  assert.equal(access.level(account("Ankur"), "qc-inprocess-printing"), "read");
  assert.ok(access.modules(account("Ankur")).some((m) => m.module === "PRD"));
  // The people nobody changed are as they were.
  assert.equal(access.level(account("Chirag"), "pur-supplier-audit-report"), "edit");
  // Somebody the super admin names on a document in a module they could not see now sees the module.
  const named = buildAccess(docs, { responsibility: { "str-sharp-metal-objects": ["chirag.parmar@gpp.local", "bharat.ahir@gpp.local"] } });
  assert.deepEqual(named.modules(account("Chirag")).map((m) => m.module).sort(), ["PUR", "STR"]);
  assert.equal(named.level(account("Chirag"), "str-sharp-metal-objects"), "edit");
  assert.equal(named.level(account("Chirag"), "str-incoming-material-vehicle"), "read");
});

test("an account nobody has described keeps what it had: every module without departments, else its own departments", () => {
  const docs = catalogue();
  const open = { email: "someone.new@gpp.local", role: "staff", departments: [] as string[] };
  const qcOnly = { email: "qc.helper@gpp.local", role: "staff", departments: ["qc"] };
  const access = buildAccess(docs);
  assert.equal(access.level(open, "hr-competence"), "edit");
  assert.equal(access.level(qcOnly, "qc-bopp-film"), "edit");
  assert.equal(access.level(qcOnly, "hr-competence"), "none");
  assert.equal(access.moduleLevel(qcOnly, "QC"), "edit");
  assert.equal(access.moduleLevel(qcOnly, "HR"), "none");
  // Once the super admin describes the account, the old rule no longer applies to it.
  const described = buildAccess(docs, { people: { "qc.helper@gpp.local": { modules: { QC: "read" } } } });
  assert.equal(described.level(qcOnly, "qc-bopp-film"), "read");
  assert.equal(described.level(qcOnly, "hr-competence"), "none");
  const emptied = buildAccess(docs, { people: { "someone.new@gpp.local": {} } });
  assert.equal(emptied.level(open, "hr-competence"), "none");
});

test("the person's email is matched in any capitals, and a document that is not in the catalogue is nobody's but the super admin's", () => {
  const access = buildAccess(catalogue());
  assert.equal(access.level({ email: "  Vinay.Bhojak@GPP.local ", role: "staff" }, "hr-competence"), "edit");
  assert.equal(access.level(account("Vinay"), "no-such-document"), "none");
  assert.deepEqual(access.responsible("no-such-document"), []);
});

test("what was stored is made safe: unknown levels, modules and emails are dropped, emails are lower-cased and listed once", () => {
  const safe = normalizeAccessRules({
    version: 7,
    people: {
      " Ankur.Raval@GPP.local ": { modules: { qc: "edit", XX: "edit", HR: "root" }, documents: { "qc-bopp-film": "write", "": "edit", "qc-paper-core": 3 } },
      "not-an-email": { modules: { QC: "edit" } },
      "bad@gpp.local": "edit",
    },
    responsibility: { "hr-competence": ["A@x.local", "a@x.local", 5, "nobody"], "": ["a@x.local"], "mnt-pm-record": "x" },
  });
  assert.deepEqual(safe, {
    version: 1,
    people: { "ankur.raval@gpp.local": { modules: { QC: "edit" }, documents: { "qc-bopp-film": "write" } } },
    responsibility: { "hr-competence": ["a@x.local"] },
  });
  for (const junk of [null, undefined, 5, "x", [], { people: [] }]) assert.deepEqual(normalizeAccessRules(junk), { version: 1, people: {}, responsibility: {} });
});

test("a format number is read in every way the plant writes it", () => {
  const cases: [string, ReturnType<typeof parseFormatNo>][] = [
    ["F/HR/05", { department: "HR", number: 5, suffix: "" }],
    ["F-QC-30", { department: "QC", number: 30, suffix: "" }],
    ["F/QC-38", { department: "QC", number: 38, suffix: "" }],
    ["F/QC/15-A", { department: "QC", number: 15, suffix: "A" }],
    ["F-QC-40.C", { department: "QC", number: 40, suffix: "C" }],
    ["F/SYS/04-A", { department: "SYS", number: 4, suffix: "A" }],
    ["QA-CAF-00", null],
    ["TO BE CONFIRMED", null],
    ["F: QA/PRO/FL/CCT/01", null],
  ];
  for (const [given, want] of cases) assert.deepEqual(parseFormatNo(given), want, given);
});

test("a format supplied later lands with the right person by its number", () => {
  const later: [string, string, string][] = [
    ["QC", "F/QC/41", "Ankur"],
    ["QC", "F/QC/40.A", "Zala"],
    ["QC", "F/QC/40.B", "Zala"],
    ["QC", "F/QC/10", "Kapila"],
    ["HR", "F/HR/02", "Vinay+Sandeep"],
    ["HR", "F/HR/10", "Vinay+Sandeep"],
    ["QA", "F/QA/01", "Kapila"],
    ["PRD", "F/PRD/05", "Dharmik+Anil+AjaySinh"],
    ["PRD", "F/PRD/17.A", "Dharmik+Anil+AjaySinh"],
    ["PRD", "F/PRD/14.A", "AjaySinh"],
    ["PRD", "F/PRD/16", "AjaySinh"],
    ["PRD", "F/PRD/25", "Vishnu+AjaySinh"],
    ["PRD", "F/PRD/27", "AjaySinh"],
    ["PUR", "F/PUR/04", "Chirag"],
    ["MKT", "F/MKT/03", "Kapila"],
    ["MNT", "F/MNT/12", "Kapila"],
  ];
  for (const [department, formatNo, want] of later) assert.equal(names(defaultResponsible({ id: `later-${formatNo}`, formatNo, department })), want, formatNo);
  // A number in the wrong department's shape never counts for it: QA-01 is Quality Assurance's, not the HR range's.
  assert.equal(names(defaultResponsible({ id: "odd", formatNo: "F/HR/12", department: "QC" })), "Kapila");
});

test("the twelve people are the owner's, with their name.surname addresses", () => {
  assert.equal(DEFAULT_PEOPLE.length, 12);
  for (const p of DEFAULT_PEOPLE) {
    assert.ok(FIRST_NAMES[p.email], p.email);
    assert.match(p.email, /^[a-z]+\.[a-z]+@gpp\.local$/);
  }
});
