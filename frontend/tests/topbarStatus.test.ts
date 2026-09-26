// THE TOP BAR'S CONNECTION BADGE AND CLOCK (REQUIREMENTS §78), judged without a
// browser: what the readings add up to, the figures beside the word, and the
// 12-hour clock. And the header block told to Mitra in words (REQUIREMENTS §77):
// the sentences read, the values applied, the questions asked.
import test from "node:test";
import assert from "node:assert/strict";
import { connectionKind, connectionState, formatClock12h, speedLabel, type ConnectionReading } from "../src/engine/connectionQuality";
import { applyFormatCommand, parseFormatCommand, sentenceFor } from "../src/engine/formatCommands";
import type { FormatDraft } from "../src/engine/formatOps";

const reading = (r: Partial<ConnectionReading>): ConnectionReading => ({ online: true, serverOk: true, probeMs: 80, downlinkMbps: 10, rttMs: 50, type: null, ...r });

test("the badge's state: offline is certain, a server that does not answer is down, else the slower of speed and latency decides", () => {
  assert.equal(connectionState(reading({ online: false })), "offline");
  assert.equal(connectionState(reading({ online: false, serverOk: false })), "offline", "no network outranks a failed probe");
  assert.equal(connectionState(reading({ serverOk: false })), "down");
  assert.equal(connectionState(reading({ serverOk: null, probeMs: null })), "checking");
  assert.equal(connectionState(reading({})), "good");
  assert.equal(connectionState(reading({ downlinkMbps: 2 })), "fair", "a slow line");
  assert.equal(connectionState(reading({ probeMs: 900 })), "fair", "a slow answer");
  assert.equal(connectionState(reading({ downlinkMbps: 0.5 })), "poor");
  assert.equal(connectionState(reading({ probeMs: 3000 })), "poor");
  assert.equal(connectionState(reading({ downlinkMbps: 50, probeMs: 3000 })), "poor", "a fast line to a slow server reads slow");
  assert.equal(connectionState(reading({ downlinkMbps: null, rttMs: null, probeMs: 120 })), "good", "a browser that estimates nothing: the probe alone");
});

test("the figures beside the word, and the kind of line", () => {
  assert.equal(speedLabel(reading({ downlinkMbps: 12.5, probeMs: 85 })), "13 Mbps · 85 ms");
  assert.equal(speedLabel(reading({ downlinkMbps: 1.75, probeMs: 85 })), "1.8 Mbps · 85 ms");
  assert.equal(speedLabel(reading({ downlinkMbps: null, probeMs: 85 })), "85 ms");
  assert.equal(speedLabel(reading({ downlinkMbps: null, probeMs: null, rttMs: null })), "");
  assert.equal(connectionKind("wifi"), "Wi‑Fi");
  assert.equal(connectionKind("ethernet"), "LAN");
  assert.equal(connectionKind(undefined), null);
});

test("the clock: 12-hour, two figures each, midnight 12 AM and noon 12 PM", () => {
  assert.equal(formatClock12h(new Date(2026, 8, 26, 14, 5, 9)), "02:05:09 PM");
  assert.equal(formatClock12h(new Date(2026, 8, 26, 0, 0, 0)), "12:00:00 AM");
  assert.equal(formatClock12h(new Date(2026, 8, 26, 12, 0, 0)), "12:00:00 PM");
  assert.equal(formatClock12h(new Date(2026, 8, 26, 9, 30, 59)), "09:30:59 AM");
  assert.equal(formatClock12h(new Date(2026, 8, 26, 23, 59, 1)), "11:59:01 PM");
});

const draft: FormatDraft = { name: "Customer Value added Feedback", companyName: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", formatNo: "F/MKT/01", revisionNo: "01", revisionDate: "2021-12-01" };

test("the header told to Mitra: the sentence people say, the values applied, the question when a value is missing", () => {
  // The very words of the request that was refused before (REQUIREMENTS §77).
  const asked = parseFormatCommand("i need to change format number and revision number. so help me out", undefined);
  assert.deepEqual(asked, { kind: "setHeader", changes: [{ field: "formatNo" }, { field: "revisionNo" }] });
  const question = applyFormatCommand(draft, asked!);
  assert.equal(question.ok, false);
  if (!question.ok) assert.match(question.ask, /What should the format number and revision number be\?.*F\/MKT\/01-A/);

  const both = parseFormatCommand("change the format number to F/MKT/01-A and the revision to 02", undefined);
  assert.deepEqual(both, { kind: "setHeader", changes: [{ field: "formatNo", value: "F/MKT/01-A" }, { field: "revisionNo", value: "02" }] });
  const applied = applyFormatCommand(draft, both!);
  assert.ok(applied.ok, JSON.stringify(applied));
  if (applied.ok) {
    assert.equal(applied.draft.formatNo, "F/MKT/01-A");
    assert.equal(applied.draft.revisionNo, "02");
    assert.equal(applied.plan, "change the format number to \"F/MKT/01-A\" and number the revision 02");
    assert.equal(applied.what, "changed the format number to \"F/MKT/01-A\" and numbered the revision 02");
  }
  assert.equal(sentenceFor(both!), "change the format number to \"F/MKT/01-A\" and number the revision 02");

  // Bare values, small figures, small letters: "rev 2" is Rev 02, "f/mkt/1" prints in capitals.
  const bare = parseFormatCommand("set revision 2", undefined);
  assert.deepEqual(bare, { kind: "setHeader", changes: [{ field: "revisionNo", value: "2" }] });
  const padded = applyFormatCommand(draft, bare!);
  assert.ok(padded.ok && padded.draft.revisionNo === "02");
  const lower = applyFormatCommand(draft, parseFormatCommand("update the format no. to f/mkt/1", undefined)!);
  assert.ok(lower.ok && lower.draft.formatNo === "F/MKT/1");

  // The company's name and the revision's date, the date read from words.
  const two = parseFormatCommand("change the revision date to 1 sep 2026 and the company name to Gujarat Print Pack Publications Pvt. Ltd.", undefined);
  const dated = applyFormatCommand(draft, two!);
  assert.ok(dated.ok, JSON.stringify(dated));
  if (dated.ok) {
    assert.equal(dated.draft.revisionDate, "2026-09-01");
    assert.equal(dated.draft.companyName, "Gujarat Print Pack Publications Pvt. Ltd.");
    assert.match(dated.plan, /date the revision 01-Sep-2026 and change the company name to/);
  }
  const unread = applyFormatCommand(draft, parseFormatCommand("change the revision date to soon", undefined)!);
  assert.equal(unread.ok, false);
  if (!unread.ok) assert.match(unread.ask, /could not read “soon” as a date/);

  // Already so: refused, not saved as an empty revision.
  const same = applyFormatCommand(draft, parseFormatCommand("change the format number to F/MKT/01", undefined)!);
  assert.equal(same.ok, false);
});

test("what is NOT a header change: a record's Date box, a box called Company, a column's type, a rename", () => {
  assert.equal(parseFormatCommand("change the date to 12.09.2026", undefined), null, "a bare Date is the record's own box");
  const layout = undefined;
  const typed = parseFormatCommand("change the type of the Date column to text", layout);
  assert.notEqual(typed?.kind, "setHeader");
  assert.notEqual(parseFormatCommand("rename the Company Seal & Sign box to Seal", layout)?.kind, "setHeader");
  assert.notEqual(parseFormatCommand("make the company seal box required", layout)?.kind, "setHeader");
  assert.equal(parseFormatCommand("rename this format to Customer Feedback Form", layout)?.kind, "renameFormat", "the format's name keeps its own reader");
});
