// CLOSING A CAPA FINDING THROUGH THE API IS DCRS'S OWN CLOSE (REQUIREMENTS §83).
//
// The Audit Assistant closes a finding through POST /api/v1/findings/{id}/close
// (backend/apiV1.ts), which the server works out with backend/findingsCore.ts —
// the server cannot run the page's engine. So the two are run here side by
// side on the same record: DCRS's own Close button (pages/GapPage.tsx
// closeFinding: status "Closed", date of action today, saved through
// engine/recordLifecycle.ts saveDraft with engine/recordHistory.ts's history)
// and the API's closeFindingChange. They must leave the same record data, the
// same report status, the same history changes and the same activity-log line.
// And the status people see (findingStatus) must be the one DCRS's own
// Overdue refresh stores (data/selectors.ts refreshGapFindingStatuses).
// Run: npm run test:unit -- findingsClose
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import type { GapFinding, GapInspectionData, HistoryEntry, RecordInstance, RecordStatus } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { saveDraft } from "../src/engine/recordLifecycle";
import { recordLabel as dcrsRecordLabel } from "../src/engine/recordHistory";
import { refreshGapFindingStatuses } from "../src/data/selectors";
import { SEED_GAP_RECORD } from "../src/data/seed/historicalRecords";
import { addDays, todayISO } from "../src/utils/date";
import type { ActivityEvent } from "../src/utils/activityLog";
import { activityDetail, clientName, closeFindingChange, findingStatus, identifyFindings, recordLabel, throughNote } from "../../backend/findingsCore";

ensureDocumentsSeeded();

// The activity lines the page's engine sends, caught where they would leave the browser.
const sent: ActivityEvent[] = [];
globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
  sent.push(...(JSON.parse(String(init?.body)) as { events: ActivityEvent[] }).events);
  return new Response(null, { status: 204 });
}) as typeof fetch;
mock.timers.enable({ apis: ["setTimeout"] });
const flushLog = () => mock.timers.tick(1500);

const BY = "Kajal Shah";
const today = todayISO();

function finding(id: string, extra: Partial<GapFinding> & Record<string, unknown> = {}): GapFinding {
  return {
    id,
    sNo: 1,
    findingOfInspection: `Finding ${id}`,
    commentsOnFindings: "",
    correctiveActionContractor: "NA",
    correctiveActionClient: "Close the gap",
    targetDate: "2023-12-31",
    actualDateOfAction: null,
    verifiedByServiceProvider: "",
    status: "Overdue",
    source: "Internal",
    ...extra,
  } as GapFinding;
}

function report(id: string, status: RecordStatus, findings: unknown[]): RecordInstance<GapInspectionData> {
  return {
    id,
    documentId: "gap-inspection",
    periodKey: `gap-inspection:2024-05-06:${id}`,
    dueDate: "2024-05-06",
    status,
    isDemo: false,
    data: { inspectionDate: "2024-05-06", premisesName: "Plant", premisesAddress: "", contactPerson: "", findings: findings as GapFinding[], generalComments: ["kept"] },
    createdAt: "2024-05-06T09:00:00.000Z",
    updatedAt: "2024-05-06T09:00:00.000Z",
  };
}

/** Exactly what the page's Close button does to the stored record (pages/GapPage.tsx closeFinding → applyPatch → saveDraft). */
function closeOnThePage(recordId: string, findingId: string, opts: { note?: string } = {}): RecordInstance<GapInspectionData> {
  const base = recordRepository.getById(recordId) as RecordInstance<GapInspectionData>;
  const patch = { findings: base.data.findings.map((f) => (f.id === findingId ? { ...f, status: "Closed" as const, actualDateOfAction: todayISO() } : f)) };
  return saveDraft(base, { ...base.data, ...patch }, BY, opts) as RecordInstance<GapInspectionData>;
}

const scenarios: { name: string; record: RecordInstance<GapInspectionData>; position: number }[] = [
  { name: "the seeded report of 13-Dec-2023, awaiting verification with its findings overdue", record: { ...structuredClone(SEED_GAP_RECORD), id: "gap-seed-copy" }, position: 1 },
  {
    name: "a report still Due, whose finding was stored without a date-of-action field at all",
    record: report("gap-due", "Due", [finding("f-1"), (({ actualDateOfAction: _gone, ...rest }) => ({ ...rest, sNo: 4 }))(finding("f-2"))]),
    position: 1,
  },
  { name: "a report pending verification, whose finding already had a date of action (the single Close replaces it)", record: report("gap-pending", "Pending Verification", [finding("f-3", { status: "Open", actualDateOfAction: "2024-05-01" })]), position: 0 },
  {
    name: "a report in progress, a finding with no S.No and one with its S.No written as text",
    record: report("gap-progress", "In Progress", [finding("f-4"), finding("f-5", { sNo: undefined }), finding("f-6", { sNo: "7" as unknown as number, status: "Open", targetDate: null })]),
    position: 2,
  },
  { name: "a finding with no S.No at all, the second in its report", record: report("gap-nosno", "Submitted", [finding("f-7"), (({ sNo: _gone, ...rest }) => rest)(finding("f-8"))]), position: 1 },
  { name: "a report scheduled for later", record: report("gap-scheduled", "Scheduled", [finding("f-9", { status: "Open", targetDate: addDays(today, 10) })]), position: 0 },
];

for (const { name, record, position } of scenarios) {
  test(`the API's close is the page's close: ${name}`, () => {
    recordRepository.upsert(record as RecordInstance);
    const before = recordRepository.getById(record.id) as RecordInstance<GapInspectionData>;
    const findingId = before.data.findings[position].id;
    const note = throughNote(clientName("Audit Assistant"), "Done as agreed with the contractor");

    sent.length = 0;
    const onPage = closeOnThePage(record.id, findingId, { note });
    flushLog();
    const byApi = closeFindingChange(before, position, { today, at: new Date().toISOString(), by: BY, note, historyId: "hist-api" });

    // The same record data — every finding and every other field — and the same report status.
    assert.deepEqual(byApi.record.data, onPage.data);
    assert.equal(byApi.record.status, onPage.status);
    assert.equal(JSON.stringify(Object.keys(byApi.record.data.findings[position])), JSON.stringify(Object.keys(onPage.data.findings[position])), "the same field order");

    // The same history entry, its id and time aside.
    const pageEntry = onPage.history!.at(-1)! as HistoryEntry;
    assert.equal(onPage.history!.length, (before.history ?? []).length + 1);
    assert.equal((byApi.record.history as unknown[]).length, onPage.history!.length);
    assert.deepEqual(byApi.entry.changes, pageEntry.changes);
    assert.equal(byApi.entry.action, pageEntry.action);
    assert.equal(byApi.entry.by, pageEntry.by);
    assert.equal(byApi.entry.note, pageEntry.note);

    // The same activity-log line (the server writes the API's; the page's is sent from the browser).
    assert.equal(sent.length, 1);
    assert.equal(sent[0].action, "Record edited");
    assert.equal(sent[0].target, recordLabel(documentRepository.getById("gap-inspection"), "gap-inspection", before.dueDate));
    assert.equal(sent[0].target, dcrsRecordLabel(before));
    assert.equal(sent[0].detail, activityDetail(byApi.entry));
    assert.equal(sent[0].department, "QA");
  });
}

test("the page's own Close, with no note at all, lists the very changes the API lists", () => {
  const record = report("gap-plain", "Submitted", [finding("p-1"), finding("p-2", { sNo: 2 })]);
  recordRepository.upsert(record as RecordInstance);
  const before = recordRepository.getById(record.id) as RecordInstance<GapInspectionData>;
  const onPage = closeOnThePage(record.id, "p-2");
  flushLog();
  const byApi = closeFindingChange(before, 1, { today, at: new Date().toISOString(), by: BY, note: "n", historyId: "h" });
  assert.deepEqual(byApi.entry.changes, onPage.history!.at(-1)!.changes);
  assert.deepEqual(byApi.record.data, onPage.data);
});

test("the status people see is the one DCRS's own Overdue refresh stores", () => {
  const findings = [
    finding("s-1", { status: "Open", targetDate: addDays(today, -1) }),
    finding("s-2", { status: "Open", targetDate: today }),
    finding("s-3", { status: "Overdue", targetDate: addDays(today, 5) }),
    finding("s-4", { status: "Overdue", targetDate: addDays(today, -30), actualDateOfAction: addDays(today, -2) }),
    finding("s-5", { status: "Open", targetDate: null }),
    finding("s-6", { status: "Closed", targetDate: addDays(today, -30) }),
    finding("s-7", { status: "Verified", targetDate: addDays(today, -30) }),
    finding("s-8", { status: "Open", targetDate: addDays(today, -400) }),
  ];
  const record = report("gap-statuses", "In Progress", findings);
  recordRepository.upsert(record as RecordInstance);
  refreshGapFindingStatuses(false);
  const refreshed = (recordRepository.getById("gap-statuses") as RecordInstance<GapInspectionData>).data.findings;
  assert.deepEqual(
    findings.map((f) => findingStatus(f as unknown as Record<string, unknown>, today)),
    refreshed.map((f) => f.status)
  );
});

test("the seeded CAPA report's findings are CAPA-2023-12-13-1 to -5, and each can be found by its reference", () => {
  const found = identifyFindings([SEED_GAP_RECORD]);
  assert.deepEqual(
    found.map((f) => f.id),
    ["CAPA-2023-12-13-1", "CAPA-2023-12-13-2", "CAPA-2023-12-13-3", "CAPA-2023-12-13-4", "CAPA-2023-12-13-5"]
  );
  assert.ok(found.every((f, i) => f.ref === `gap-2023-12-13:${SEED_GAP_RECORD.data.findings[i].id}`));
});
