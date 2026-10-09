// THE RODENT BOX PICKER (REQUIREMENTS §104).
//
// The owner, 9-Oct-2026: "if user manually select yes for question 8, 9 ... it will automatically select location
// like RC-1 or any RC". What is proved here:
//   * the list: Master Data's Active stations, else RC-1 to RC-<check point 4's count on the record>, else
//     RC-1 to RC-<the last confirmed record's count>, worked out and never written to Master Data;
//   * the note stays text both ways ("RC-3, RC-17", "RC-3; Other: near RM inward shutter"), a note written before the
//     picker reads as written, and words are put in the list's spelling only where they name boxes alone;
//   * validation keeps "note required when Yes" and refuses a box not on the stations list only when there is one;
//     Mitra's and the phone's patch is held to the same;
//   * Master Data: "Add RC-1 to RC-N", a Station ID of its own, the next number, stored stations kept at start-up;
//   * the record page: Yes on 8 or 9 opens the picker with nothing picked; check point 7's Trap box no. uses the list.
// The engine host's layout for the phone is in backend/tests/engineHostRodentBoxes.test.ts.
// Run: npm run test:unit -- rodentBoxes
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DailyPestMonitoringData, DocumentDefinition, MasterData, RecordInstance, RodentStation } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { writeJSON } from "../src/data/storageAdapter";
import {
  addStationsInBulk,
  boxesMatching,
  boxGroups,
  boxIdOf,
  boxListFrom,
  boxNote,
  lastTrapCount,
  MOST_WORKED_OUT_BOXES,
  nextStationId,
  parseBoxNote,
  rodentBoxListFor,
  stationIdProblem,
  tidyBoxNote,
} from "../src/engine/rodentBoxes";
import { boxListSentence, RODENT_BOX_WORDS } from "../src/engine/rodentBoxWords";
import { validateForSubmit } from "../src/engine/validation";
import { applyAssistantPatch } from "../src/engine/recordPatch";
import { addDays, todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
const scopeGlobals = globalThis as unknown as Record<string, unknown>;
if (!scopeGlobals.location) scopeGlobals.location = { hash: "", href: "http://localhost/", pathname: "/", search: "", origin: "http://localhost" };
if (!scopeGlobals.history) scopeGlobals.history = { state: null, replaceState() {}, pushState() {}, go() {}, back() {} };

const KIND = "daily-pest-monitoring";
const station = (id: string, extra: Partial<RodentStation> = {}): RodentStation => ({ id, location: "TO BE CONFIRMED", type: "TO BE CONFIRMED", status: "Active", ...extra });
const day = (checkpoints: DailyPestMonitoringData["checkpoints"], extra: Partial<DailyPestMonitoringData> = {}): DailyPestMonitoringData => ({
  isHoliday: false,
  checkpoints,
  timeOfChecking: "09:30",
  checker: "Roshni",
  summaryActions: [],
  rodentCatches: [],
  ...extra,
});
const rec = (id: string, dueDate: string, status: RecordInstance["status"], data: DailyPestMonitoringData, extra: Partial<Omit<RecordInstance, "data">> = {}): RecordInstance<DailyPestMonitoringData> => ({
  id,
  documentId: KIND,
  periodKey: `${KIND}:${dueDate}:${id}`,
  dueDate,
  status,
  isDemo: false,
  data,
  createdAt: `${dueDate}T03:00:00.000Z`,
  updatedAt: `${dueDate}T04:00:00.000Z`,
  ...extra,
});
/** Runs `check` with these stations on Master Data, then puts the stored ones back. */
function withStations(stations: RodentStation[], check: () => void): void {
  const before = masterRepository.get().rodentStations;
  masterRepository.update({ rodentStations: stations });
  try {
    check();
  } finally {
    masterRepository.update({ rodentStations: before });
  }
}
const ids = (list: { id: string }[]) => list.map((c) => c.id);

test("the list: the Active stations, else RC-1 to RC-<today's count>, else the last confirmed record's, else none", () => {
  const stations = [station("RC-1", { location: "Canteen" }), station("RC-2"), station("RC-3", { status: "Inactive" }), station("RC-4", { status: "TO BE CONFIRMED" })];
  const fromStations = boxListFrom(stations, 100, { count: 50, date: "2026-10-08" });
  assert.equal(fromStations.source, "stations");
  assert.deepEqual(fromStations.choices, [{ id: "RC-1", area: "Canteen" }, { id: "RC-2" }], "the Active ones, with their area");
  assert.equal(fromStations.prefix, "RC");
  assert.ok(fromStations.known?.has("RC-3") && fromStations.known.has("RC-4"), "a box not offered is still known");

  const today = boxListFrom([], 100, { count: 50, date: "2026-10-08" });
  assert.equal(today.source, "today");
  assert.equal(today.choices.length, 100);
  assert.deepEqual([today.choices[0].id, today.choices[99].id], ["RC-1", "RC-100"]);
  assert.equal(today.known, undefined, "a worked-out list knows no station");
  assert.equal(boxListFrom([], "12").choices.length, 12, "a count typed as words");
  assert.equal(boxListFrom([station("RC-9", { status: "Inactive" })], 5).source, "today", "stations none of which is Active offer the count's");

  const last = boxListFrom([], null, { count: 50, date: "2026-10-08" });
  assert.deepEqual([last.source, last.choices.length, last.date], ["last", 50, "2026-10-08"]);

  const none = boxListFrom([], 0, null);
  assert.deepEqual([none.source, none.choices.length, none.prefix], ["none", 0, "RC"]);
  assert.equal(boxListFrom([], 100000).choices.length, MOST_WORKED_OUT_BOXES, "a count typed by mistake draws no thousand boxes");

  const own = boxListFrom([station("RBS-01"), station("RBS-02"), station("X-1")]);
  assert.deepEqual([own.prefix, own.prefixes], ["RBS", ["RBS", "X"]], "with stations, the prefix is the stations' own");
});

test("the last confirmed record's count: submitted, waiting or verified, before the day, not a holiday, of its own side", () => {
  const records = [
    rec("a", "2026-10-01", "Verified", day({ 4: { value: 90 } })),
    rec("b", "2026-10-05", "Submitted", day({ 4: { value: 100 } })),
    rec("c", "2026-10-06", "In Progress", day({ 4: { value: 120 } })),
    rec("d", "2026-10-07", "Verified", day({ 4: { value: 80 } }, { isHoliday: true })),
    rec("e", "2026-10-07", "Pending Verification", day({ 4: { value: null } })),
    rec("f", "2026-10-08", "Verified", day({ 4: { value: 130 } }), { isDemo: true }),
    rec("g", "2026-10-09", "Verified", day({ 4: { value: 140 } })),
  ];
  assert.deepEqual(lastTrapCount(records, "2026-10-09"), { count: 100, date: "2026-10-05" }, "not a draft, a holiday, a blank count, Demo Mode's or the day itself");
  assert.deepEqual(lastTrapCount(records, "2026-10-09", true), { count: 130, date: "2026-10-08" });
  assert.equal(lastTrapCount(records, "2026-10-01"), null);
});

test("the list for a record is read from the stored master data and records, and never written to Master Data", () => {
  const yesterday = addDays(todayISO(), -1);
  recordRepository.upsert(rec("rbl-before", addDays(yesterday, -1), "Verified", day({ 4: { value: 100 } })));
  const record = rec("rbl-today", yesterday, "In Progress", day({}));
  const stored = JSON.stringify(masterRepository.get().rodentStations);

  const last = rodentBoxListFor(record);
  assert.deepEqual([last.source, last.choices.length, last.date], ["last", 100, addDays(yesterday, -1)]);
  const own = rodentBoxListFor({ ...record, data: day({ 4: { value: 12 } }) });
  assert.deepEqual([own.source, own.choices.length], ["today", 12], "this record's count comes first");
  assert.equal(rodentBoxListFor(null).source, "last", "with no record, today's: the last confirmed before tomorrow");
  withStations([station("RC-7", { location: "Canteen" })], () => assert.deepEqual(rodentBoxListFor(record).choices, [{ id: "RC-7", area: "Canteen" }]));
  assert.equal(JSON.stringify(masterRepository.get().rodentStations), stored, "nothing worked out is stored");
});

test("the note is text both ways, a note written before reads as written, and words take the list's spelling", () => {
  const list = boxListFrom([], 100);
  assert.equal(boxNote(["RC-3", "RC-17"]), "RC-3, RC-17");
  assert.equal(boxNote(["RC-3"], "near RM inward shutter"), "RC-3; Other: near RM inward shutter");
  assert.equal(boxNote([], " Canteen "), "Other: Canteen");
  assert.equal(boxNote([]), "");
  for (const note of ["RC-3, RC-17", "RC-3; Other: near RM inward shutter", "Other: Canteen", "RC-17", ""]) {
    const p = parseBoxNote(note, list);
    assert.equal(boxNote(p.boxes, p.other), note, `${note} round trip`);
  }
  assert.deepEqual(parseBoxNote("RC-3; Other: near RM inward shutter", list), { boxes: ["RC-3"], other: "near RM inward shutter" });
  assert.deepEqual(parseBoxNote("near the store", list), { boxes: [], other: "near the store" }, "a note written before the picker");
  assert.deepEqual(parseBoxNote("RB-27 near the store", list), { boxes: [], other: "RB-27 near the store" });
  assert.deepEqual(parseBoxNote("RC-3, RC-3, rc 17", list).boxes, ["RC-3", "RC-17"], "each box once");

  assert.equal(tidyBoxNote("rc 3 and 17", list), "RC-3, RC-17");
  assert.equal(tidyBoxNote("box 4; other: near the gate", list), "RC-4; Other: near the gate");
  assert.equal(tidyBoxNote("૧૭", list), "RC-17", "Gujarati digits");
  assert.equal(tidyBoxNote("१७, rc05", list), "RC-17, RC-5", "Devanagari digits and a box run together");
  assert.equal(tidyBoxNote("near the store", list), "near the store");
  assert.equal(tidyBoxNote("RC-3, behind the press", list), "RC-3, behind the press", "other words: kept exactly as given");

  const own = boxListFrom([station("RC-05"), station("RC-17")]);
  assert.equal(boxIdOf("5", own), "RC-05", "the station's own spelling");
  assert.equal(tidyBoxNote("rc 5, 17", own), "RC-05, RC-17");
  assert.equal(boxIdOf("near 5", own), null);
});

test("the picker finds a box by its number, its ID or its area, the exact one first; boxes grouped by area", () => {
  const list = boxListFrom([], 100);
  const one = ids(boxesMatching(list, "1"));
  assert.deepEqual(one.slice(0, 3), ["RC-1", "RC-10", "RC-11"]);
  assert.equal(one.length, 12, "1, 10 to 19 and 100");
  assert.deepEqual(ids(boxesMatching(list, "17")), ["RC-17"]);
  assert.equal(boxesMatching(list, "rc-17")[0].id, "RC-17");
  assert.equal(boxesMatching(list, "").length, 100);
  assert.deepEqual(ids(boxesMatching(list, "101")), []);

  const areas = boxListFrom([station("RC-1", { location: "Canteen" }), station("RC-2", { location: "QC Lab" }), station("RC-3", { location: "Canteen" })]);
  assert.deepEqual(ids(boxesMatching(areas, "canteen")), ["RC-1", "RC-3"]);
  assert.deepEqual(
    boxGroups(areas.choices).map((g) => [g.area, ids(g.boxes)]),
    [
      ["Canteen", ["RC-1", "RC-3"]],
      ["QC Lab", ["RC-2"]],
    ]
  );
  assert.deepEqual(boxGroups(list.choices.slice(0, 2)), [{ area: null, boxes: list.choices.slice(0, 2) }]);
});

test("validation keeps 'note required when Yes' and refuses a box not on the stations list only when there is one", () => {
  const doc = documentRepository.getById(KIND) as DocumentDefinition;
  const all: DailyPestMonitoringData["checkpoints"] = {
    1: { value: "Yes" },
    2: { value: "No" },
    3: { value: "Yes" },
    4: { value: 100 },
    5: { value: "Yes" },
    6: { value: "Yes" },
    7: { value: "No" },
    8: { value: "No" },
    9: { value: "No" },
    10: { value: "Yes" },
  };
  const errors = (cps: DailyPestMonitoringData["checkpoints"]) => validateForSubmit(doc, rec("v", "2026-10-09", "In Progress", day({ ...all, ...cps }))).errors;
  assert.deepEqual(errors({}), []);
  assert.deepEqual(errors({ 9: { value: "Yes" } }), ["Checkpoint 9: Mention the Rodent box number is required when the answer is Yes."]);
  assert.deepEqual(errors({ 9: { value: "Yes", note: "RC-140" } }), [], "a worked-out list refuses nothing");
  withStations([station("RC-1"), station("RC-3"), station("RC-9", { status: "Inactive" })], () => {
    assert.deepEqual(errors({ 9: { value: "Yes", note: "RC-3" } }), []);
    assert.deepEqual(errors({ 9: { value: "Yes", note: "RC-9" } }), [], "a box taken out of use is still allowed on a record");
    assert.deepEqual(errors({ 9: { value: "Yes", note: "RC-3, RC-140" } }), ["Checkpoint 9: RC-140 is not on the rodent box list (Master Data → Rodent Stations)."]);
    assert.deepEqual(errors({ 8: { value: "Yes", note: "Other: near RC-77" } }), ["Checkpoint 8: RC-77 is not on the rodent box list (Master Data → Rodent Stations)."]);
    assert.deepEqual(errors({ 8: { value: "Yes", note: "RC-1; Other: near RM inward shutter" } }), []);
    assert.deepEqual(errors({ 8: { value: "Yes", note: "near the store" } }), [], "a place in words");
    assert.deepEqual(errors({ 9: { value: "Yes" } }), ["Checkpoint 9: Mention the Rodent box number is required when the answer is Yes."], "still required");
  });
});

test("Mitra's and the phone's patch: box words in the list's spelling, a box not on the stations list refused", () => {
  const data = day({});
  const patched = (from: DailyPestMonitoringData, checkpoints: Record<string, unknown>) => applyAssistantPatch(KIND, KIND, from, { checkpoints });
  assert.deepEqual(patched(data, { "9": { value: "Yes", note: "rc 17" } }).data.checkpoints[9], { value: "Yes", note: "RC-17" });
  assert.deepEqual(patched(data, { "8": { value: "Yes", note: "near the store" } }).data.checkpoints[8], { value: "Yes", note: "near the store" });
  withStations([station("RC-1"), station("RC-17")], () => {
    const refused = patched(data, { "9": { value: "Yes", note: "RC-140" } });
    assert.deepEqual(refused.data.checkpoints[9], { value: "Yes" }, "the answer is kept, the note is not written");
    assert.match(refused.problems.join(" "), /^RC-140 is not on the rodent box list \(Master Data → Rodent Stations\), so check point 9's note wasn't changed\.$/);
    const noteOnly = patched(day({ 9: { value: "Yes" } }), { "9": { note: "17" } });
    assert.deepEqual(noteOnly.data.checkpoints[9], { value: "Yes", note: "RC-17" }, "the phone's note alone, the answer kept");
  });
});

test("Master Data: Add RC-1 to RC-N, a Station ID of its own, the next number, and stored stations kept at start-up", () => {
  const first = addStationsInBulk([], { prefix: "rc", from: 1, to: 100, location: "Canteen", type: "Tamper Proof Bait Station" });
  assert.ok(!("problem" in first));
  assert.equal(first.added.length, 100);
  assert.deepEqual(first.stations[0], { id: "RC-1", location: "Canteen", type: "Tamper Proof Bait Station", status: "Active" });
  assert.equal(first.stations[99].id, "RC-100");

  const had = [station("RC-05", { location: "QC Lab", status: "Inactive" }), station("Canteen-A")];
  const again = addStationsInBulk(had, { prefix: "RC", from: 1, to: 10 });
  assert.ok(!("problem" in again));
  assert.deepEqual(again.kept, ["RC-5"], "RC-05 is RC-5");
  assert.equal(again.added.length, 9);
  assert.deepEqual(again.stations.slice(0, 2), had, "what was there is left as it is");
  assert.deepEqual(again.stations[2], { id: "RC-1", location: "TO BE CONFIRMED", type: "TO BE CONFIRMED", status: "Active" });

  const problem = (prefix: string, from: number, to: number) => {
    const r = addStationsInBulk([], { prefix, from, to });
    return "problem" in r ? r.problem : null;
  };
  assert.equal(problem("R1", 1, 5), "prefix");
  assert.equal(problem("", 1, 5), "prefix");
  assert.equal(problem("RC", 0, 5), "range");
  assert.equal(problem("RC", 6, 5), "range");
  assert.equal(problem("RC", 1.5, 5), "range");
  assert.equal(problem("RC", 1, 501), "tooMany");

  const two = [station("RC-1"), station("RC-2")];
  assert.equal(stationIdProblem(two, 0, "RC-02"), "taken");
  assert.equal(stationIdProblem(two, 0, "rc 1"), null, "its own ID, written another way");
  assert.equal(stationIdProblem(two, 0, "  "), "empty");
  assert.equal(stationIdProblem(two, 0, "RC-3"), null);
  assert.equal(nextStationId([]), "RC-1");
  assert.equal(nextStationId([station("RC-1"), station("RC-7"), station("X-9")]), "RC-8");

  const kept: RodentStation[] = [station("RC-1", { location: "Canteen" }), station("RC-2", { status: "Inactive" })];
  masterRepository.update({ rodentStations: kept });
  ensureMasterSeeded();
  assert.deepEqual(masterRepository.get().rodentStations, kept, "ensureSeeded keeps the stored stations");
  const { rodentStations: _gone, ...older } = masterRepository.get();
  void _gone;
  writeJSON("master", older as MasterData);
  ensureMasterSeeded();
  assert.deepEqual(masterRepository.get().rodentStations ?? [], [], "master data stored before the list existed: none");
  assert.equal(rodentBoxListFor(rec("old", "2026-10-09", "In Progress", day({ 4: { value: 5 } }))).choices.length, 5, "and the pickers still work");
  masterRepository.update({ rodentStations: [] });
});

test("Master Data → Rodent Stations drawn: the count, Location from the 16 areas, and the bulk add the super admin's alone", async () => {
  const [stationsTab, auth, store] = await Promise.all([import("../src/components/master/RodentStations"), import("../src/store/AuthContext"), import("../src/store/AppStore")]);
  const draw = () => renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(stationsTab.RodentStations))));
  const empty = draw();
  assert.ok(empty.includes("No Rodent Bait Station list was in the papers supplied"), "none yet: said, and what the pickers offer meanwhile");
  withStations([station("RC-1", { location: "Canteen" }), station("RC-2", { status: "Inactive" }), station("RC-3", { location: "near the old gate" })], () => {
    const html = draw();
    assert.ok(html.includes("3 boxes, 2 of them Active."));
    assert.ok(html.includes('value="RC-1"') && html.includes('data-field="station-id"'), "the Station ID is a box to type in");
    const areas = masterRepository.get().areas.filter((a) => a.context === "service-report:Rodent Control Service");
    assert.equal(areas.length, 16);
    for (const a of areas) assert.ok(html.includes(`<option value="${a.name.replace(/&/g, "&amp;")}"`), `${a.name} offered`);
    assert.ok(html.includes('<option value="near the old gate" selected="">'), "a location typed before stays offered");
    assert.ok(!html.includes('data-section="stations-bulk"'), "Add RC-1 to RC-N is not drawn for anybody but the super admin");
  });
});

test("the words: the same in English, Gujarati and Hindi, where the list came from, and no em dash", () => {
  const keys = (o: object): string[] => Object.keys(o).sort();
  assert.deepEqual(keys(RODENT_BOX_WORDS.gu), keys(RODENT_BOX_WORDS.en));
  assert.deepEqual(keys(RODENT_BOX_WORDS.hi), keys(RODENT_BOX_WORDS.en));
  assert.deepEqual(keys(RODENT_BOX_WORDS.gu.stations), keys(RODENT_BOX_WORDS.en.stations));
  assert.deepEqual(keys(RODENT_BOX_WORDS.hi.stations), keys(RODENT_BOX_WORDS.en.stations));
  assert.doesNotMatch(JSON.stringify(RODENT_BOX_WORDS), /—/);
  assert.equal(boxListSentence(boxListFrom([], 100), "en"), "Box numbers RC-1 to RC-100 from today's trap count (check point 4); Master Data → Rodent Stations holds the plant's own list.");
  assert.match(boxListSentence(boxListFrom([], null, { count: 100, date: "2026-10-08" }), "en"), /^Box numbers RC-1 to RC-100 from the trap count of 08-Oct-2026 /);
  assert.equal(boxListSentence(boxListFrom([station("RC-1"), station("RC-2")]), "en"), "2 boxes from Master Data → Rodent Stations.");
  assert.match(boxListSentence(boxListFrom([], 100), "gu"), /^બોક્સ નંબર RC-1 થી RC-100/);
  assert.match(boxListSentence(boxListFrom([], 100), "hi"), /^बॉक्स नंबर RC-1 से RC-100/);
  assert.match(boxListSentence(boxListFrom([]), "en"), /^No box list yet/);
});

async function dailyPage(data: DailyPestMonitoringData, editable: boolean): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/DailyPestMonitoringRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  const doc = documentRepository.getById(KIND) as DocumentDefinition;
  const record = rec("page", "2026-10-09", editable ? "In Progress" : "Verified", data);
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.DailyPestMonitoringRecordView, { doc, record, editable, onChange: () => undefined }))))
  );
}

test("the record page: Yes on 9 opens the picker with nothing picked; check point 7's Trap box no. uses the list", async () => {
  const yes = await dailyPage(day({ 4: { value: 100 }, 7: { value: "Yes" }, 9: { value: "Yes" } }, { rodentCatches: [{ id: "c1", trapBoxNo: "", location: "Canteen", count: 1 }] }), true);
  assert.ok(yes.includes('data-box-picker-row="9"'), "the picker under check point 9");
  assert.ok(!yes.includes('data-box-picker-row="8"'), "not under 8, answered nothing");
  assert.ok(yes.includes(">RC-1<") && yes.includes(">RC-40<"), "the boxes, RC-1 first");
  assert.ok(!yes.includes(">RC-41<"), "forty at first, the rest on Show all");
  assert.ok(yes.includes("Show all 100"));
  assert.ok(!yes.includes('aria-pressed="true"'), "nothing picked for the person");
  assert.ok(yes.includes("from today&#x27;s trap count") || yes.includes("from today's trap count"), "where the list came from");
  assert.ok(yes.includes('list="rodent-boxes"') && yes.includes('id="rodent-boxes"'), "the trap box takes the same list");
  assert.ok(!yes.includes("RB-27"), "no RB- placeholder");

  const picked = await dailyPage(day({ 4: { value: 100 }, 8: { value: "Yes", note: "RC-3; Other: near RM inward shutter" } }), true);
  assert.ok(picked.includes('data-picked="RC-3"'), "the box in the note shows as picked");
  assert.ok(picked.includes('value="near RM inward shutter"'), "check point 8's other place");
  assert.ok(picked.includes('value="RC-3; Other: near RM inward shutter"'), "the Note box holds the text, bound as before");

  const no = await dailyPage(day({ 4: { value: 100 }, 9: { value: "No" } }), true);
  assert.ok(!no.includes("data-box-picker-row"), "no picker on No");
  const locked = await dailyPage(day({ 4: { value: 100 }, 9: { value: "Yes", note: "RC-17" } }), false);
  assert.ok(!locked.includes("data-box-picker-row") && locked.includes('value="RC-17"'), "a signed-off record shows the note only");
});
