// MITRA ADDS, CHANGES AND DELETES ANYTHING IN ANY RECORD, AND NOTHING IS LOST
// (REQUIREMENTS §113; the owner, 13-Oct-2026).
//
// Before: a list sent whole through Mitra's patch kept only the lines it
// named — one fly catcher unit sent of 13 left 1, one service area of 16 left
// 1, one CAPA finding of two left one, three free rows and a new one left one —
// with no warning; there was no way to add or take off a line except by
// sending the whole list; and a removed line's values were gone from the
// history ("(row present) → (row removed)"). Now one registry
// (engine/recordLines.ts) says what every list of every kind allows, a list
// sent whole means "set these lines, keep the rest", and addItems /
// removeItems / clearItems are checked against the registry.
// Run: npm run test:unit -- recordLines
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyAssistantPatch, lineValuesWords, parseLocalEdit } from "../src/engine/recordPatch";
import { lineRulesFor, logRowsRule, newRow, WHY_FIXED, type LineRule } from "../src/engine/recordLines";
import { applyRowCommand, parseRowCommand } from "../src/engine/recordRowCommands";
import { appendHistory, diffRecordData, lineChangeWords, makeEntry } from "../src/engine/recordHistory";
import { createDefaultData } from "../src/engine/recordDefaults";
import { validateForSubmit } from "../src/engine/validation";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { todayISO } from "../src/utils/date";
import type { DailyPestMonitoringData, DocumentDefinition, FlyCatcherData, GapInspectionData, LogSheetData, RecordInstance, ServiceReportData, TrainingRecordData } from "../src/types";

ensureMasterSeeded();
ensureDocumentsSeeded();

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const master = masterRepository.get();
const today = todayISO();
const recordable = documentRepository.getRecordable();
const docOf = (id: string): DocumentDefinition => {
  const d = documentRepository.getById(id);
  assert.ok(d, `${id} is in the catalogue`);
  return d;
};
const freshData = (doc: DocumentDefinition): Obj => createDefaultData(doc, today, master) as Obj;
const recordOf = (doc: DocumentDefinition, data: unknown): RecordInstance =>
  ({ id: `unit-${doc.id}`, documentId: doc.id, periodKey: today, dueDate: today, status: "In Progress", isDemo: false, data, createdAt: today, updatedAt: today }) as RecordInstance;

/** A value a box of this list takes, by the box's type on the layout or the shape of its blank. */
function valueFor(doc: DocumentDefinition, rule: LineRule, key: string): unknown {
  if (doc.kind === "log-sheet" && rule.key === "rows") {
    const col = getLogSheetLayout(doc.id)!.columns.find((c) => c.key === key)!;
    if (col.type === "number") return 2;
    if (col.type === "time") return "10:00";
    if (col.type === "date") return today;
    if (col.type === "select") return col.options?.[0] ?? "x";
    if (col.type === "yesno") return "Yes";
    return "Jeni";
  }
  const blank = isObj(rule.blank) ? rule.blank[key] : "";
  if (typeof blank === "boolean") return true;
  if (/date/i.test(key)) return today;
  if (blank === null || typeof blank === "number") return 2;
  if (key === "trapBoxNo") return "RB-27";
  if (key === "location") return master.areas[0]?.name ?? "Store";
  return "Jeni";
}

/** The lines of a list on a record, through the checklist's sections where the list sits inside them. */
const linesOf = (data: Obj, rule: LineRule): unknown[] => (rule.within ? (((data[rule.within] as Obj[])[0] as Obj)[rule.key] as unknown[]) : ((data[rule.key] as unknown[]) ?? []));
const idsOf = (lines: unknown[]) => lines.map((l) => (isObj(l) ? l.id : l));

/** Every list of every recordable document, with the document and its blank record. */
function everyList(): { doc: DocumentDefinition; rule: LineRule; data: Obj }[] {
  const out: { doc: DocumentDefinition; rule: LineRule; data: Obj }[] = [];
  for (const doc of recordable) for (const rule of lineRulesFor(doc.kind, doc.id)) out.push({ doc, rule, data: freshData(doc) });
  return out;
}

/** The record with `n` lines on this list, added through the patch where the list starts empty. */
function withLines(doc: DocumentDefinition, rule: LineRule, data: Obj, n: number): Obj {
  const have = linesOf(data, rule).length;
  if (have >= n || !rule.canAdd) return data;
  const values = Array.from({ length: n - have }, (_, i) => (rule.scalar ? `line ${have + i + 1}` : rule.writable.length ? { [rule.writable[0]]: valueFor(doc, rule, rule.writable[0]) } : { name: `page-${have + i + 1}.jpg` }));
  const out = applyAssistantPatch(doc.kind, doc.id, data, { addItems: { [rule.key]: values } });
  assert.deepEqual(out.problems, [], `${doc.id} ${rule.key}: adding ${n - have} lines`);
  return out.data as Obj;
}

describe("the registry names the lists of every kind, and every recordable document has its rules", () => {
  it("covers the ten kinds with records, and a reference document has no lists", () => {
    const kinds = new Set(recordable.map((d) => d.kind));
    for (const kind of ["log-sheet", "daily-pest-monitoring", "fly-catcher", "service-report", "gap-inspection", "training-record", "complaint-checklist", "complaint-ack", "pest-responsibilities", "service-agreement"]) {
      assert.ok(kinds.has(kind as DocumentDefinition["kind"]), `${kind} holds records`);
    }
    for (const doc of recordable) assert.ok(lineRulesFor(doc.kind, doc.id).length > 0, `${doc.id} (${doc.kind}) has at least one list`);
    assert.deepEqual(lineRulesFor("chemical-master", "chemical-master"), []);
    assert.deepEqual(lineRulesFor("licence", "licence"), []);
    assert.ok(recordable.length >= 125, `${recordable.length} recordable documents walked`);
  });

  it("every rule says what a new line is, and a fixed list says why in words", () => {
    for (const { doc, rule } of everyList()) {
      if (!rule.canAdd || !rule.canRemove) assert.ok(rule.whyFixed && rule.whyFixed.length > 20, `${doc.id} ${rule.key} says why its lines are fixed`);
      if (!rule.scalar) assert.ok(isObj(rule.blank) && !("id" in rule.blank), `${doc.id} ${rule.key} has a blank line without an id`);
      for (const k of rule.writable) assert.ok(isObj(rule.blank) && k in rule.blank, `${doc.id} ${rule.key}: writable ${k} is a box of the blank line`);
    }
  });
});

describe("on every list of every kind: a list sent whole never drops the lines it leaves out", () => {
  for (const { doc, rule, data: blank } of everyList()) {
    if (rule.within || rule.writable.length === 0) continue;
    it(`${doc.id} · ${rule.key}`, () => {
      const data = withLines(doc, rule, blank, 2);
      const before = linesOf(data, rule);
      if (before.length < 2) return; // a printed list of one line: nothing to lose
      const key = rule.writable.find((k) => k !== rule.nameKey) ?? rule.writable[0];
      const second = before[1];
      const sent = isObj(second)
        ? { ...(typeof second.id === "string" ? { id: second.id } : rule.nameKey ? { [rule.nameKey]: second[rule.nameKey] } : {}), [key]: valueFor(doc, rule, key) }
        : "changed";
      const patch = rule.within ? {} : { [rule.key]: [sent] };
      const out = applyAssistantPatch(doc.kind, doc.id, data, patch);
      const after = linesOf(out.data as Obj, rule);
      assert.equal(after.length, before.length, `${doc.id} ${rule.key}: ${before.length} lines stay ${before.length} (problems: ${out.problems.join(" | ")})`);
      if (before.every(isObj)) assert.deepEqual(idsOf(after).slice(0, before.length), idsOf(before), "ids stay");
      const hit = isObj(second) ? after.find((l) => isObj(l) && (typeof second.id === "string" ? l.id === second.id : rule.nameKey ? String(l[rule.nameKey]) === String(second[rule.nameKey]) : false)) : after[0];
      if (isObj(second) && (typeof second.id === "string" || rule.nameKey)) assert.ok(isObj(hit) && String(hit[key]) === String(valueFor(doc, rule, key)), `${doc.id} ${rule.key}: the line sent is set`);
      // itemEdits never drops a line either.
      const edited = applyAssistantPatch(doc.kind, doc.id, data, { itemEdits: [{ collection: rule.key, match: { row: 1 }, set: rule.scalar ? { text: "x" } : { [key]: valueFor(doc, rule, key) } }] });
      assert.equal(linesOf(edited.data as Obj, rule).length, before.length, `${doc.id} ${rule.key}: itemEdits keeps every line`);
    });
  }
});

describe("on every list of every kind: add at the end and at a position, remove by id and by number, clear two boxes, or the refusal in words", () => {
  for (const { doc, rule, data: blank } of everyList()) {
    if (rule.within) continue;
    it(`${doc.id} · ${rule.key} (${rule.canAdd ? "add" : "no add"}, ${rule.canRemove ? "remove" : "no remove"})`, () => {
      const key = rule.writable[0];
      const one = rule.scalar ? "first" : key ? { [key]: valueFor(doc, rule, key) } : { name: "a.jpg" };
      if (rule.canAdd) {
        const added = applyAssistantPatch(doc.kind, doc.id, blank, { addItems: { [rule.key]: [one] } });
        assert.deepEqual(added.problems, [], `${doc.id} ${rule.key}: one line added`);
        const lines = linesOf(added.data as Obj, rule);
        assert.equal(lines.length, linesOf(blank, rule).length + 1);
        const last = lines[lines.length - 1];
        if (rule.scalar) assert.equal(last, "first");
        else {
          assert.ok(isObj(last));
          if (key) assert.equal(String(last[key]), String(valueFor(doc, rule, key)), "the value said is on the line");
          for (const k of Object.keys(isObj(rule.blank) ? rule.blank : {})) if (!(k in (one as Obj)) && k !== rule.numberKey) assert.deepEqual(last[k], (rule.blank as Obj)[k], `${doc.id} ${rule.key}: ${k} is not decided for the person (§98)`);
        }
        assert.doesNotThrow(() => validateForSubmit(doc, recordOf(doc, added.data)), "the submit check reads the new line");
        // At a position: after line 1 of a list with two lines.
        const two = withLines(doc, rule, blank, 2);
        const placed = applyAssistantPatch(doc.kind, doc.id, two, { addItems: { [rule.key]: [{ values: rule.scalar ? "between" : one, after: 1 }] } });
        assert.deepEqual(placed.problems, []);
        const placedLines = linesOf(placed.data as Obj, rule);
        assert.equal(placedLines.length, linesOf(two, rule).length + 1);
        assert.deepEqual([idsOf(placedLines)[0], idsOf(placedLines)[2]], [idsOf(linesOf(two, rule))[0], idsOf(linesOf(two, rule))[1]], "the lines around it keep their ids");
      } else {
        const refused = applyAssistantPatch(doc.kind, doc.id, blank, { addItems: { [rule.key]: [one] } });
        assert.deepEqual(refused.problems, [rule.whyFixed], `${doc.id} ${rule.key}: adding is refused in the registry's words`);
        assert.deepEqual(refused.data, blank, "and nothing changed");
      }
      if (rule.canRemove) {
        const three = withLines(doc, rule, blank, Math.max(3, rule.minLines + 2));
        const lines = linesOf(three, rule);
        const byNumber = applyAssistantPatch(doc.kind, doc.id, three, { removeItems: { [rule.key]: [2] } });
        assert.deepEqual(byNumber.problems, [], `${doc.id} ${rule.key}: line 2 removed by number`);
        assert.deepEqual(idsOf(linesOf(byNumber.data as Obj, rule)), [idsOf(lines)[0], ...idsOf(lines).slice(2)], "the others keep their ids and order");
        const second = lines[1];
        if (isObj(second) && typeof second.id === "string") {
          const byId = applyAssistantPatch(doc.kind, doc.id, three, { removeItems: { [rule.key]: [second.id] } });
          assert.deepEqual(byId.problems, []);
          assert.deepEqual(idsOf(linesOf(byId.data as Obj, rule)), [idsOf(lines)[0], ...idsOf(lines).slice(2)]);
        }
        const gone = applyAssistantPatch(doc.kind, doc.id, three, { removeItems: { [rule.key]: [99] } });
        assert.match(gone.problems[0] ?? "", /couldn't find/);
        assert.deepEqual(gone.data, three, "a line that is not there changes nothing");
      } else {
        const data = withLines(doc, rule, blank, 1);
        if (linesOf(data, rule).length === 0) return;
        const refused = applyAssistantPatch(doc.kind, doc.id, data, { removeItems: { [rule.key]: [1] } });
        assert.ok(refused.problems[0]?.startsWith(rule.whyFixed!), `${doc.id} ${rule.key}: ${refused.problems[0]}`);
        assert.match(refused.problems[0]!, /clear/);
        assert.deepEqual(refused.data, data);
      }
      if (rule.writable.length >= 1 && !rule.scalar) {
        const data = withLines(doc, rule, blank, 1);
        const keys = rule.writable.slice(0, 2);
        const set = Object.fromEntries(keys.map((k) => [k, valueFor(doc, rule, k)]));
        const filled = applyAssistantPatch(doc.kind, doc.id, data, { itemEdits: [{ collection: rule.key, match: { row: 1 }, set }] });
        assert.deepEqual(filled.problems, [], `${doc.id} ${rule.key}: ${keys.join(", ")} set`);
        const cleared = applyAssistantPatch(doc.kind, doc.id, filled.data, { clearItems: { [rule.key]: [{ row: 1, keys }] } });
        assert.deepEqual(cleared.problems, []);
        const line = linesOf(cleared.data as Obj, rule)[0] as Obj;
        for (const k of keys) assert.ok(line[k] === "" || line[k] === null || line[k] === false, `${doc.id} ${rule.key}: ${k} cleared (${String(line[k])})`);
        assert.equal(linesOf(cleared.data as Obj, rule).length, linesOf(filled.data as Obj, rule).length, "the line itself stays");
      }
    });
  }
});

describe("the brief's own cases (§2.3), each a loss before", () => {
  it("fly catcher: one unit sent of 13 leaves 13, PC-05 set and the others untouched", () => {
    const doc = docOf("fly-catcher");
    const data = freshData(doc) as unknown as FlyCatcherData;
    assert.equal(data.entries.length, 13);
    const out = applyAssistantPatch("fly-catcher", doc.id, data, { entries: [{ pcId: "PC-05", catchCountApprox: 3 }] });
    assert.deepEqual(out.problems, []);
    assert.equal(out.data.entries.length, 13);
    assert.equal(out.data.entries.find((e) => e.pcId === "PC-05")?.catchCountApprox, 3);
    assert.deepEqual(out.data.entries.filter((e) => e.pcId !== "PC-05"), data.entries.filter((e) => e.pcId !== "PC-05"));
    const one = applyAssistantPatch("fly-catcher", doc.id, data, { itemEdits: [{ collection: "entries", match: { pcId: "PC-05" }, set: { catchCountApprox: 3 } }] });
    assert.equal(one.data.entries.length, 13);
    const unknown = applyAssistantPatch("fly-catcher", doc.id, data, { entries: [{ pcId: "PC-99", catchCountApprox: 3 }] });
    assert.match(unknown.problems[0] ?? "", /couldn't find unit PC-99/);
    assert.equal(unknown.data.entries.length, 13);
  });

  it("service report: one area sent of many leaves them all, with its quantity set", () => {
    const doc = docOf("service-report-general");
    const data = freshData(doc) as unknown as ServiceReportData;
    assert.ok(data.lines.length >= 5, `${data.lines.length} areas`);
    const out = applyAssistantPatch("service-report", doc.id, data, { lines: [{ slNo: 3, remarks: "bait replaced" }] });
    assert.deepEqual(out.problems, []);
    assert.equal(out.data.lines.length, data.lines.length);
    assert.equal(out.data.lines.find((l) => l.slNo === 3)?.remarks, "bait replaced");
    assert.deepEqual(out.data.lines.map((l) => l.areaName), data.lines.map((l) => l.areaName));
  });

  it("CAPA: two findings on file, one sent whole leaves two; a new one is numbered 3 and never reuses a number", () => {
    const doc = docOf("gap-inspection");
    const blank = freshData(doc) as unknown as GapInspectionData;
    const two = applyAssistantPatch("gap-inspection", doc.id, blank, { addItems: { findings: [{ findingOfInspection: "Gap under the store door" }, { findingOfInspection: "Bait station 4 missing" }] } });
    assert.deepEqual(two.problems, []);
    assert.deepEqual(two.data.findings.map((f) => f.sNo), [1, 2]);
    assert.equal(two.data.findings[0].status, "Open");
    const sent = applyAssistantPatch("gap-inspection", doc.id, two.data, { findings: [{ sNo: 2, correctiveActionClient: "Replace it" }] });
    assert.deepEqual(sent.problems, []);
    assert.equal(sent.data.findings.length, 2);
    assert.equal(sent.data.findings[1].correctiveActionClient, "Replace it");
    const added = applyAssistantPatch("gap-inspection", doc.id, two.data, { findings: [{ findingOfInspection: "Fly killer off" }] });
    assert.equal(added.data.findings.length, 3, "a finding with no number is new, and the two stay");
    assert.equal(added.data.findings[2].sNo, 3);
    const removed = applyAssistantPatch("gap-inspection", doc.id, added.data, { removeItems: { findings: [{ no: 2 }] } });
    assert.deepEqual(removed.problems, []);
    assert.deepEqual(removed.data.findings.map((f) => f.sNo), [1, 3], "finding 3 keeps its number");
    const next = applyAssistantPatch("gap-inspection", doc.id, removed.data, { addItems: { findings: [{ findingOfInspection: "Door gap" }] } });
    assert.equal(next.data.findings[2].sNo, 4, "the next number is one past the highest, never 2 again");
  });

  it("free rows: three rows and a new one sent whole leave four; a row is placed after row 1 and removed by id", () => {
    const doc = docOf("qc-adhesive-mixing");
    const data = freshData(doc) as unknown as LogSheetData;
    const three = applyAssistantPatch("log-sheet", doc.id, data, { addItems: { rows: [{ time: "09:00", viscosity: 19.87, checkedBy: "Jeni" }, { time: "10:00", viscosity: 20.1 }] } });
    assert.deepEqual(three.problems, []);
    assert.equal(three.data.rows.length, 3);
    const sent = applyAssistantPatch("log-sheet", doc.id, three.data, { rows: [{ time: "11:00", viscosity: 20.4 }] });
    assert.deepEqual(sent.problems, []);
    assert.equal(sent.data.rows.length, 4, "the three stay and the new one is added");
    assert.deepEqual(sent.data.rows.slice(0, 3).map((r) => r.id), three.data.rows.map((r) => r.id));
    const placed = applyAssistantPatch("log-sheet", doc.id, three.data, { addItems: { rows: [{ values: { time: "09:30" }, after: 1 }] } });
    assert.equal(placed.data.rows[1].time, "09:30");
    assert.equal(placed.data.rows[2].id, three.data.rows[1].id);
    const gone = applyAssistantPatch("log-sheet", doc.id, three.data, { removeItems: { rows: [three.data.rows[1].id] } });
    assert.deepEqual(gone.problems, []);
    assert.deepEqual(gone.data.rows.map((r) => r.id), [three.data.rows[0].id, three.data.rows[2].id]);
    const byTime = applyAssistantPatch("log-sheet", doc.id, three.data, { removeItems: { rows: [{ time: "10:00" }] } });
    assert.equal(byTime.data.rows.length, 2);
    const kept = applyAssistantPatch("log-sheet", doc.id, data, { removeItems: { rows: [1] } });
    assert.match(kept.problems[0] ?? "", /keeps at least 1 row/);
    assert.equal(kept.data.rows.length, 1, "the printed line stays");
  });

  it("F/HR/17: the first rodent catch, by addItems and by the list sent whole, and the record then submits", () => {
    const doc = docOf("daily-pest-monitoring");
    const blank = freshData(doc) as unknown as DailyPestMonitoringData;
    const base = { ...blank, isHoliday: false, checker: "Kapila", timeOfChecking: "09:30", checkpoints: Object.fromEntries(master.checkpoints.map((c) => [c.no, { value: Number(c.no) === 4 ? 12 : Number(c.no) === 7 ? "Yes" : c.flagWhen === "No" ? "Yes" : "No" }])) } as DailyPestMonitoringData;
    const byAdd = applyAssistantPatch("daily-pest-monitoring", doc.id, base, { addItems: { rodentCatches: [{ trapBoxNo: "RB-27", location: "Canteen", count: 1 }] } });
    assert.deepEqual(byAdd.problems, []);
    assert.equal(byAdd.data.rodentCatches?.length, 1);
    assert.equal(byAdd.data.rodentCatches?.[0].count, 1);
    let result: ReturnType<typeof validateForSubmit> | undefined;
    assert.doesNotThrow(() => void (result = validateForSubmit(doc, recordOf(doc, byAdd.data))));
    assert.ok(result && !result.errors.some((e) => /Rodent catch/.test(e)), result?.errors.join(" | ") ?? "");
    const whole = applyAssistantPatch("daily-pest-monitoring", doc.id, base, { rodentCatches: [{ trapBoxNo: "RB-27", location: "Canteen", count: 1 }] });
    assert.equal(whole.data.rodentCatches?.length, 1);
    const second = applyAssistantPatch("daily-pest-monitoring", doc.id, whole.data, { rodentCatches: [{ trapBoxNo: "RB-3", location: "Store", count: 2 }] });
    assert.equal(second.data.rodentCatches?.length, 2, "a second catch sent whole keeps the first");
    const cleared = applyAssistantPatch("daily-pest-monitoring", doc.id, second.data, { checkpoints: { 3: "" }, clearItems: { rodentCatches: [{ trapBoxNo: "RB-3", keys: ["count"] }] } });
    assert.deepEqual(cleared.problems, []);
    assert.equal(cleared.data.checkpoints[3], undefined, "a check point still clears");
    assert.equal(cleared.data.rodentCatches?.[1].count, null);
  });

  it("a time-slot sheet, a printed-rows sheet and a single-line sheet refuse add and remove in the registry's words, and clear a line instead", () => {
    for (const [id, kind] of [
      ["qc-viscosity", "timeSlots"],
      ["qc-inspection-pouching", "fixedRows"],
      ["qc-temperature", "single"],
    ] as const) {
      const doc = docOf(id);
      const data = freshData(doc) as unknown as LogSheetData;
      const rule = logRowsRule(getLogSheetLayout(id)!);
      assert.equal(rule.canAdd, false);
      assert.equal(rule.whyFixed, WHY_FIXED[kind]);
      const added = applyAssistantPatch("log-sheet", doc.id, data, { addItems: { rows: [{}] } });
      assert.deepEqual(added.problems, [WHY_FIXED[kind]], id);
      assert.equal(added.data.rows.length, data.rows.length);
      const removed = applyAssistantPatch("log-sheet", doc.id, data, { removeItems: { rows: [1] } });
      assert.equal(removed.problems[0], `${WHY_FIXED[kind]} I can clear it instead.`, id);
      assert.equal(removed.data.rows.length, data.rows.length);
      const col = getLogSheetLayout(id)!.columns.find((c) => !c.fixed && !c.computed && c.type === "number") ?? getLogSheetLayout(id)!.columns.find((c) => !c.fixed && !c.computed)!;
      const filled = applyAssistantPatch("log-sheet", doc.id, data, { itemEdits: [{ collection: "rows", match: { row: 1 }, set: { [col.key]: col.type === "number" ? 2 : col.type === "time" ? "10:00" : col.type === "date" ? today : col.type === "select" ? col.options?.[0] : col.type === "yesno" ? "Yes" : "x" } }] });
      assert.deepEqual(filled.problems, [], `${id}: ${col.key} set`);
      const spec = rule.nameKey ? { [rule.nameKey]: data.rows[0][rule.nameKey] } : 1;
      const cleared = applyAssistantPatch("log-sheet", doc.id, filled.data, { clearItems: { rows: [spec] } });
      assert.deepEqual(cleared.problems, [], id);
      assert.ok(cleared.data.rows[0][col.key] === null || cleared.data.rows[0][col.key] === "", `${id}: cleared`);
      assert.equal(cleared.data.rows.length, data.rows.length);
      // The typed row commands say the same thing.
      const cmd = applyRowCommand(getLogSheetLayout(id)!, data, parseRowCommand("add a row")!, () => "x");
      assert.deepEqual(cmd, { ok: false, why: WHY_FIXED[kind] });
    }
  });

  it("a whole list replaces only when replaceList is asked for", () => {
    const doc = docOf("fly-catcher");
    const data = freshData(doc) as unknown as FlyCatcherData;
    const printed = applyAssistantPatch("fly-catcher", doc.id, data, { replaceList: true, entries: [{ pcId: "PC-05", catchCountApprox: 3 }] });
    assert.equal(printed.data.entries.length, 1, "asked for, the whole list is the list sent (nobody sends it by default)");
    const gap = docOf("gap-inspection");
    const two = applyAssistantPatch("gap-inspection", gap.id, freshData(gap), { addItems: { findings: [{ findingOfInspection: "a" }, { findingOfInspection: "b" }] } });
    const replaced = applyAssistantPatch("gap-inspection", gap.id, two.data, { replaceList: true, findings: [{ findingOfInspection: "c" }] });
    assert.equal((replaced.data as unknown as GapInspectionData).findings.length, 1);
    const merged = applyAssistantPatch("gap-inspection", gap.id, two.data, { findings: [{ findingOfInspection: "c" }] });
    assert.equal((merged.data as unknown as GapInspectionData).findings.length, 3);
  });

  it("a list of plain words: one clause changed by its number, one added, one removed, the rest kept", () => {
    const doc = docOf("training-record");
    const data = { ...(freshData(doc) as unknown as TrainingRecordData), topics: ["Hygiene", "Rodent control", "Fly control"] };
    const changed = applyAssistantPatch("training-record", doc.id, data, { itemEdits: [{ collection: "topics", match: { row: 2 }, set: { text: "Rodent control and baiting" } }] });
    assert.deepEqual(changed.problems, []);
    assert.deepEqual(changed.data.topics, ["Hygiene", "Rodent control and baiting", "Fly control"]);
    const added = applyAssistantPatch("training-record", doc.id, data, { addItems: { topics: ["Record keeping"] } });
    assert.deepEqual(added.data.topics, ["Hygiene", "Rodent control", "Fly control", "Record keeping"]);
    const removed = applyAssistantPatch("training-record", doc.id, data, { removeItems: { topics: [1] } });
    assert.deepEqual(removed.data.topics, ["Rodent control", "Fly control"]);
    const whole = applyAssistantPatch("training-record", doc.id, data, { topics: ["Hygiene (food)"] });
    assert.deepEqual(whole.data.topics, ["Hygiene (food)", "Rodent control", "Fly control"], "a list sent whole sets by place and keeps the rest");
  });

  it("the complaint checklist: an activity cleared by its section and number; sections and activities fixed", () => {
    const doc = docOf("capa-customer-complaint");
    const data = freshData(doc) as Obj;
    const done = applyAssistantPatch("complaint-checklist", doc.id, data, { itemEdits: [{ collection: "sections", match: { key: "A" }, set: { items: [{ srNo: 1, done: true, comment: "Logged" }] } }] });
    assert.deepEqual(done.problems, []);
    const a1 = ((done.data as Obj).sections as Obj[])[0].items as Obj[];
    assert.equal(a1[0].done, true);
    assert.equal(a1.length, ((data.sections as Obj[])[0].items as Obj[]).length, "the section's other activities stay");
    const cleared = applyAssistantPatch("complaint-checklist", doc.id, done.data, { clearItems: { items: [{ section: "A", no: 1, keys: ["done", "comment"] }] } });
    assert.deepEqual(cleared.problems, []);
    const after = ((cleared.data as Obj).sections as Obj[])[0].items as Obj[];
    assert.equal(after[0].done, false);
    assert.equal(after[0].comment, "");
    const removed = applyAssistantPatch("complaint-checklist", doc.id, done.data, { removeItems: { items: [{ section: "A", no: 1 }] } });
    assert.match(removed.problems[0] ?? "", /prints its sections and activities/);
    assert.deepEqual(removed.data, done.data);
  });

  it("the typed attendance rule adds only the name said and removes by id; the row commands add and remove through the registry", () => {
    const doc = docOf("training-record");
    const data = freshData(doc) as unknown as TrainingRecordData;
    // The training page registers the kind as "training" with Mitra's dock (pages/TrainingPage.tsx), the gap page as "gap".
    const addPatch = parseLocalEdit("training", doc.id, data, "Rahul Patel attended");
    assert.deepEqual(addPatch, { addItems: { attendees: [{ employeeName: "Rahul Patel" }] } });
    const added = applyAssistantPatch("training", doc.id, data, addPatch!);
    assert.deepEqual(added.problems, []);
    assert.equal(added.data.attendees[0].employeeName, "Rahul Patel");
    assert.equal(added.data.attendees[0].department, "", "no department decided for the person (§98)");
    assert.ok(typeof added.data.attendees[0].id === "string" && added.data.attendees[0].id.length > 0);
    const absentPatch = parseLocalEdit("training", doc.id, added.data, "Rahul Patel was absent");
    assert.deepEqual(absentPatch, { removeItems: { attendees: [added.data.attendees[0].id] } });
    assert.equal(applyAssistantPatch("training", doc.id, added.data, absentPatch!).data.attendees.length, 0);
    const gapAdd = applyAssistantPatch("gap", "gap-inspection", freshData(docOf("gap-inspection")), { addItems: { findings: [{ findingOfInspection: "Door gap" }] } });
    assert.deepEqual(gapAdd.problems, []);
    assert.equal((gapAdd.data as unknown as GapInspectionData).findings[0].sNo, 1);

    const layout = getLogSheetLayout("qc-adhesive-mixing")!;
    const sheet = freshData(docOf("qc-adhesive-mixing")) as unknown as LogSheetData;
    const addRows = applyRowCommand(layout, sheet, parseRowCommand("add 2 rows")!, () => `r${Math.random()}`);
    assert.ok(addRows.ok && addRows.data.rows.length === 3);
    const blankRow = newRow(layout, sheet.rows, "x");
    for (const c of layout.columns) assert.equal(blankRow[c.key], c.type === "number" ? null : "", `${c.label} starts blank`);
  });
});

describe("the history keeps a removed line's values, and an added line's, and never folds such an entry", () => {
  const rows = [
    { id: "r1", time: "08:00", viscosity: 20.1, checkedBy: "Jeni" },
    { id: "r2", time: "09:00", viscosity: 19.87, checkedBy: "Jeni" },
    { id: "r3", time: "10:00", viscosity: 20.4, checkedBy: "" },
  ];
  const before = { header: {}, rows };

  it('writes "Row 2 (09:00)": "09:00, 19.87, Jeni" → "(row removed)", and the words "Line 2 removed (09:00, 19.87, Jeni)"', () => {
    const after = { header: {}, rows: [rows[0], rows[2]] };
    const changes = diffRecordData(before, after);
    assert.equal(changes.length, 1, JSON.stringify(changes));
    assert.equal(changes[0].label, "Row 2 (09:00)");
    assert.equal(changes[0].before, "09:00, 19.87, Jeni");
    assert.equal(changes[0].after, "(row removed)");
    assert.equal(lineChangeWords(changes[0]), "Line 2 removed (09:00, 19.87, Jeni)");
    assert.equal(lineValuesWords("log-sheet", "qc-adhesive-mixing", "rows", rows[1]), "09:00, 19.87, Jeni");
  });

  it("writes an added line as (no row) → its values, and a finding by its own name", () => {
    const after = { header: {}, rows: [...rows, { id: "r4", time: "11:00", viscosity: 20.2, checkedBy: "Singh" }] };
    const [c] = diffRecordData(before, after);
    assert.equal(c.before, "(no row)");
    assert.equal(c.after, "11:00, 20.2, Singh");
    assert.equal(lineChangeWords(c), "Line 4 added (11:00, 20.2, Singh)");
    const [f] = diffRecordData({ findings: [{ id: "f1", sNo: 1, findingOfInspection: "Gap under the door", status: "Open" }] }, { findings: [] });
    assert.equal(lineChangeWords(f), "Finding 1 removed (Gap under the door, Open)");
    assert.equal(lineChangeWords({ field: "checker", label: "Checker", before: "a", after: "b" }), null);
  });

  it("an entry that removes a line is not folded into the edit before it, and a line put back is its own entry too", () => {
    const now = Date.now();
    const at = (s: number) => new Date(now + s * 1000).toISOString();
    let record = { id: "x", documentId: "qc-adhesive-mixing", periodKey: today, dueDate: today, status: "In Progress", isDemo: true, data: before, createdAt: today, updatedAt: today, history: [] } as unknown as RecordInstance;
    record = appendHistory(record, { ...makeEntry("assistant-edit", "Kapila", { changes: diffRecordData(before, { header: {}, rows: [rows[0], { ...rows[1], viscosity: 19.9 }, rows[2]] }) }), at: at(0) });
    const removed = { header: {}, rows: [rows[0], rows[2]] };
    record = appendHistory(record, { ...makeEntry("assistant-edit", "Kapila", { changes: diffRecordData(before, removed) }), at: at(30) });
    record = appendHistory(record, { ...makeEntry("assistant-edit", "Kapila", { changes: diffRecordData(removed, before) }), at: at(60) });
    assert.equal(record.history?.length, 3, "three entries: the edit, the line removed, the line put back");
    assert.equal(record.history?.[1].changes?.[0].before, "09:00, 19.87, Jeni");
    assert.equal(record.history?.[2].changes?.[0].after, "09:00, 19.87, Jeni");
  });
});
