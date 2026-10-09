// THE CAPA FINDINGS AS ANOTHER SYSTEM SEES THEM (REQUIREMENTS §83): the one
// rule that names a finding (CAPA-<day tag>-<number>), the status people see,
// and the close the API makes — backend/findingsCore.ts. The database overview
// names findings by the same rule in SQL (overview.findings); its database test
// compares the two over every finding of a copy. That the close is DCRS's own
// Close button is proved against the page's engine in
// frontend/tests/findingsCloseEquivalence.test.ts.
// Run: npm run test:unit -- findingsCore
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activityDetail,
  clientName,
  closeFindingChange,
  closeRefusal,
  dayTag,
  DEFAULT_CLIENT_NAME,
  findFinding,
  findingChanges,
  findingStatus,
  identifyFindings,
  isOpenStatus,
  recordLabel,
  throughNote,
  type StoredRecord,
} from "../findingsCore.ts";

function finding(id: string, sNo: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    sNo,
    findingOfInspection: `Finding ${id}`,
    commentsOnFindings: "",
    correctiveActionContractor: "",
    correctiveActionClient: "",
    targetDate: "2030-01-31",
    actualDateOfAction: null,
    verifiedByServiceProvider: "",
    status: "Open",
    source: "Internal",
    ...extra,
  };
}

function report(id: string, dueDate: string, createdAt: string, findings: unknown[], extra: Partial<StoredRecord> = {}): StoredRecord {
  return { id, documentId: "gap-inspection", dueDate, status: "In Progress", isDemo: false, createdAt, updatedAt: createdAt, data: { inspectionDate: dueDate, findings }, ...extra };
}

describe("the day tag", () => {
  it("is the date for the first report of a day, then b to z, then -27 onwards", () => {
    assert.equal(dayTag("2023-12-13", 1), "2023-12-13");
    assert.equal(dayTag("2023-12-13", 2), "2023-12-13b");
    assert.equal(dayTag("2023-12-13", 3), "2023-12-13c");
    assert.equal(dayTag("2023-12-13", 26), "2023-12-13z");
    assert.equal(dayTag("2023-12-13", 27), "2023-12-13-27");
    assert.equal(dayTag("2023-12-13", 40), "2023-12-13-40");
  });
});

describe("the readable finding id", () => {
  it("gives the spec's own examples", () => {
    const records = [
      report("gap-a", "2023-12-13", "2023-12-13T09:00:00.000Z", [finding("f1", 1), finding("f2", 2), finding("f3", 3), finding("f3b", 3)]),
      report("gap-b", "2023-12-13", "2023-12-13T10:00:00.000Z", [finding("g1", 1), finding("g2", 2)]),
    ];
    const ids = identifyFindings(records).map((f) => f.id);
    assert.deepEqual(ids, ["CAPA-2023-12-13-1", "CAPA-2023-12-13-2", "CAPA-2023-12-13-3", "CAPA-2023-12-13-3.2", "CAPA-2023-12-13b-1", "CAPA-2023-12-13b-2"]);
  });

  it("orders the reports of one date by when they were made (plain text), then by record id — never by their place in the list", () => {
    const records = [
      report("gap-z", "2026-09-23", "2026-09-23T13:00:00.000Z", [finding("z1", 1)]),
      report("gap-y", "2026-09-23", "2026-09-23T08:00:00.000Z", [finding("y1", 1)]),
      report("gap-x", "2026-09-23", "2026-09-23T13:00:00.000Z", [finding("x1", 1)]),
    ];
    const byRecord = Object.fromEntries(identifyFindings(records).map((f) => [f.record.id, f.id]));
    assert.deepEqual(byRecord, { "gap-y": "CAPA-2026-09-23-1", "gap-x": "CAPA-2026-09-23b-1", "gap-z": "CAPA-2026-09-23c-1" });
  });

  it("uses the S.No when it is a whole number above zero, and the place in the list otherwise", () => {
    const records = [report("gap-a", "2024-01-05", "t", [finding("a", 7), finding("b", 0), finding("c", "3"), finding("d", 2.5), finding("e", undefined), finding("f", -1)])];
    assert.deepEqual(
      identifyFindings(records).map((f) => [f.id, f.number]),
      [
        ["CAPA-2024-01-05-7", 7],
        ["CAPA-2024-01-05-2", 2],
        ["CAPA-2024-01-05-3", 3],
        ["CAPA-2024-01-05-4", 4],
        ["CAPA-2024-01-05-5", 5],
        ["CAPA-2024-01-05-6", 6],
      ]
    );
  });

  it("counts a repeated number within one report only, and counts each repeat", () => {
    const records = [
      report("gap-a", "2024-02-01", "t1", [finding("a", 1), finding("b", 1), finding("c", 1), finding("d", 2)]),
      report("gap-b", "2024-02-02", "t2", [finding("e", 1)]),
    ];
    assert.deepEqual(
      identifyFindings(records).map((f) => f.id),
      ["CAPA-2024-02-01-1", "CAPA-2024-02-01-1.2", "CAPA-2024-02-01-1.3", "CAPA-2024-02-01-2", "CAPA-2024-02-02-1"]
    );
  });

  it("reads LIVE CAPA reports only: never demo data, a record that does not say it is live, or another document", () => {
    const records = [
      report("gap-demo", "2024-03-01", "t0", [finding("x", 1)], { isDemo: true }),
      report("gap-unsaid", "2024-03-01", "t0", [finding("y", 1)], { isDemo: undefined }),
      { ...report("rec-other", "2024-03-01", "t0", [finding("z", 1)]), documentId: "capa-customer-complaint" },
      report("gap-live", "2024-03-01", "t9", [finding("w", 1)]),
    ];
    const found = identifyFindings(records);
    assert.deepEqual(
      found.map((f) => [f.id, f.record.id]),
      [["CAPA-2024-03-01-1", "gap-live"]]
    );
  });

  it("gives the stable reference <record id>:<finding id>, and none to a finding stored without an id", () => {
    const [a, b] = identifyFindings([report("gap-a", "2024-04-01", "t", [finding("finding-abc", 1), { sNo: 2, status: "Open" }])]);
    assert.equal(a.ref, "gap-a:finding-abc");
    assert.equal(b.ref, null);
    assert.equal(b.id, "CAPA-2024-04-01-2");
  });

  it("finds a finding by its readable id in any case and with spaces round it, or by its reference", () => {
    const all = identifyFindings([report("gap-a", "2023-12-13", "t", [finding("finding-1", 1), finding("finding-2", 2)])]);
    assert.equal(findFinding(all, " capa-2023-12-13-2 ")?.finding.id, "finding-2");
    assert.equal(findFinding(all, "gap-a:finding-1")?.id, "CAPA-2023-12-13-1");
    assert.equal(findFinding(all, "CAPA-2023-12-13-9"), undefined);
    assert.equal(findFinding(all, "   "), undefined);
  });
});

describe("the status people see", () => {
  const today = "2026-09-29";
  it("is Closed or Verified as stored", () => {
    assert.equal(findingStatus({ status: "Closed", targetDate: "2020-01-01", actualDateOfAction: null }, today), "Closed");
    assert.equal(findingStatus({ status: "Verified", targetDate: "2020-01-01", actualDateOfAction: null }, today), "Verified");
  });
  it("is Overdue when the target date is before today and no date of action is filled in — whatever is stored", () => {
    assert.equal(findingStatus({ status: "Open", targetDate: "2026-09-28", actualDateOfAction: null }, today), "Overdue");
    assert.equal(findingStatus({ status: "Open", targetDate: "2026-09-28", actualDateOfAction: "" }, today), "Overdue");
    assert.equal(findingStatus({ status: "Open", targetDate: "2026-09-28" }, today), "Overdue");
  });
  it("is Open otherwise: target today or later, a date of action filled in, no target, or a target that is not a date", () => {
    assert.equal(findingStatus({ status: "Overdue", targetDate: "2026-09-29", actualDateOfAction: null }, today), "Open");
    assert.equal(findingStatus({ status: "Overdue", targetDate: "2026-09-01", actualDateOfAction: "2026-09-02" }, today), "Open");
    assert.equal(findingStatus({ status: "Open", targetDate: null, actualDateOfAction: null }, today), "Open");
    assert.equal(findingStatus({ status: "Open", targetDate: "soon", actualDateOfAction: null }, today), "Open");
  });
  it("counts Open and Overdue as open", () => {
    assert.deepEqual(
      (["Open", "Overdue", "Closed", "Verified"] as const).map(isOpenStatus),
      [true, true, false, false]
    );
  });
});

describe("closing a finding", () => {
  it("refuses a finding already closed first, then a verified report, a report sent back, and a report in no state to change", () => {
    const open = { status: "Open" };
    const base = report("gap-a", "2024-01-01", "t", []);
    assert.equal(closeRefusal({ ...base, status: "Verified" }, { status: "Closed" }), "already-closed");
    assert.equal(closeRefusal(base, { status: "Verified" }), "already-closed");
    assert.equal(closeRefusal({ ...base, status: "Verified" }, open), "report-verified");
    assert.equal(closeRefusal({ ...base, status: "Rejected" }, open), "report-sent-back");
    assert.equal(closeRefusal({ ...base, status: "Archived?" }, open), "report-locked");
    for (const status of ["Scheduled", "Due", "In Progress", "Submitted", "Pending Verification"]) assert.equal(closeRefusal({ ...base, status }, open), null, status);
  });

  it("changes the finding's status and date of action only, moves a Due report to In Progress, and adds one history entry", () => {
    const record = report("gap-a", "2024-01-01", "2024-01-01T08:00:00.000Z", [finding("f1", 1), finding("f2", 2, { status: "Overdue", targetDate: "2024-01-10" })], {
      status: "Due",
      history: [{ id: "h0", at: "2024-01-01T08:00:00.000Z", by: "Someone", action: "edited" }],
    });
    const frozen = JSON.stringify(record);
    const { record: after, entry } = closeFindingChange(record, 1, { today: "2026-09-29", at: "2026-09-29T06:30:00.000Z", by: "Kajal Shah", note: throughNote("Audit Assistant", "Done"), historyId: "hist-x" });
    assert.equal(JSON.stringify(record), frozen, "the record handed in is not changed");
    assert.equal(after.status, "In Progress");
    assert.equal(after.updatedAt, "2026-09-29T06:30:00.000Z");
    const findings = (after.data as { findings: Record<string, unknown>[] }).findings;
    assert.deepEqual(findings[0], finding("f1", 1));
    assert.deepEqual(findings[1], finding("f2", 2, { status: "Closed", targetDate: "2024-01-10", actualDateOfAction: "2026-09-29" }));
    assert.equal((after.history as unknown[]).length, 2);
    assert.deepEqual(entry, {
      id: "hist-x",
      at: "2026-09-29T06:30:00.000Z",
      by: "Kajal Shah",
      action: "edited",
      note: "Through Audit Assistant: Done",
      changes: [
        { field: "findings[#f2].actualDateOfAction", label: "Finding 2 · Actual date of action", before: "", after: "2026-09-29" },
        { field: "findings[#f2].status", label: "Finding 2 · Status", before: "Overdue", after: "Closed" },
      ],
    });
  });

  it("keeps any other report status, and lists a field the finding did not have before after the ones it had", () => {
    const bare = { id: "f9", sNo: 4, findingOfInspection: "x", status: "Open" };
    const record = report("gap-b", "2024-01-01", "t", [bare], { status: "Pending Verification" });
    const { record: after, entry } = closeFindingChange(record, 0, { today: "2026-09-29", at: "2026-09-29T06:30:00.000Z", by: "A", note: "n", historyId: "h" });
    assert.equal(after.status, "Pending Verification");
    assert.deepEqual(
      entry.changes.map((c) => c.field),
      ["findings[#f9].status", "findings[#f9].actualDateOfAction"]
    );
    assert.equal(entry.changes[0].label, "Finding 1 (4) · Status");
  });

  it("names a row without an id by its place, as DCRS's history does", () => {
    const changes = findingChanges({ sNo: 3, status: "Open", actualDateOfAction: null }, { sNo: 3, status: "Closed", actualDateOfAction: "2026-09-29" }, 2);
    assert.deepEqual(
      changes.map((c) => [c.field, c.label]),
      [
        ["findings[#2].status", "Finding 3 · Status"],
        ["findings[#2].actualDateOfAction", "Finding 3 · Actual date of action"],
      ]
    );
  });
});

describe("the audit trail's words", () => {
  it("names the calling server as it said, made safe: printable, no colon, at most 40 characters, else DCRS API", () => {
    assert.equal(clientName("Audit Assistant"), "Audit Assistant");
    assert.equal(clientName("  Audit   Assistant  "), "Audit Assistant");
    assert.equal(clientName(undefined), DEFAULT_CLIENT_NAME);
    assert.equal(clientName(""), "DCRS API");
    assert.equal(clientName("\u0000\u0007"), "DCRS API");
    assert.equal(clientName("Bot: evil"), "Bot evil");
    assert.equal(clientName("x".repeat(60)).length, 40);
    assert.equal(clientName(["First", "Second"]), "First");
    assert.equal(clientName("Assistant\r\nX-Injected: 1"), "AssistantX-Injected 1");
  });

  it("is read back by the overview's own pattern: the client name, whatever the note says", () => {
    const THROUGH = /^Through (.+?)(?:: | · |$)/;
    const entry = { note: throughNote(clientName("Audit Assistant"), "Sealed: all gaps · done"), changes: [{ label: "Finding 1 (1) · Status" }, { label: "Finding 1 (1) · Actual date of action" }] };
    const detail = activityDetail(entry);
    assert.equal(detail, "Through Audit Assistant: Sealed: all gaps · done · 2 field(s): Finding 1 (1) · Status, Finding 1 (1) · Actual date of action");
    assert.equal(THROUGH.exec(detail)?.[1], "Audit Assistant");
    assert.equal(THROUGH.exec(`Through ${clientName("A: B")}: x`)?.[1], "A B");
    assert.equal(THROUGH.exec("Through DCRS API")?.[1], "DCRS API");
  });

  it("calls a record by its format number, name and date — leaving out a number still TO BE CONFIRMED", () => {
    assert.equal(recordLabel({ name: "CAPA — Internal: Pest Control Inspection Findings Report", formatNo: "TO BE CONFIRMED" }, "gap-inspection", "2023-12-13"), "CAPA — Internal: Pest Control Inspection Findings Report — 2023-12-13");
    assert.equal(recordLabel({ name: "Daily Pest Control Monitoring Record", formatNo: "F/HR/17" }, "daily-pest-monitoring", "2026-09-28"), "F/HR/17 Daily Pest Control Monitoring Record — 2026-09-28");
    assert.equal(recordLabel(undefined, "gap-inspection", "2023-12-13"), "gap-inspection — 2023-12-13");
  });
});
