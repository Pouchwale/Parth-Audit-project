// EVERY DATE THE APP WRITES IS NUMBERS, DAY-MONTH-YEAR: 24-10-26 (the owner, 24-Oct-2026: "all are number like this
// example:- 24-10-26 and not 24-oct-2026 and this applies to all document for all modules"; REQUIREMENTS §124).
//
// utils/date.ts formatDisplayDate is the one writer, and displayDateToISO reads back exactly what it writes. What the
// app WRITES changed; what it READS did not: a person may still type 01-Oct-2026, 14.08.2026 or 14/08/26, and Mitra,
// the voice, Search and the Excel upload all still understand it. These tests hold both halves, one place each:
//   - the writer and its reader, every day of 2000 to 2099;
//   - Mitra reading a typed 24-10-26, and the labels she writes for a period;
//   - the voice saying 24-10-26 as a date, "24th October";
//   - Search finding a record by 14-08-26, 14-Aug-2026 and 14.08.2026;
//   - the paper's dotted 16.02.2022 made from the new writing as from the old;
//   - the Excel upload reading 24-10-26 back, and the notification text.
import test from "node:test";
import assert from "node:assert/strict";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { parseDateRange } from "../src/engine/assistantLocal";
import { analyticIntent } from "../src/engine/historyDigest";
import { displayDate as notificationDate } from "../src/engine/notificationText";
import { readDate } from "../src/engine/roundTrip/values";
import { containsAllTerms, recordSearchText, searchTerms } from "../src/engine/recordText";
import { readSearchQuery } from "../src/engine/recordSearch";
import { addDays, displayDateToISO, formatDisplayDate } from "../src/utils/date";
import { forTheEar } from "../src/utils/earText";
import { numberFormatKind } from "../src/engine/roundTrip/readFile";
import { buildXlsx, isoToSerial, unzip } from "../src/utils/xlsx";
import { workbookFromBlocks, type ExportBlock } from "../src/utils/documentExport";
import { dotted } from "../src/utils/originalFill/text";
import type { RecordInstance } from "../src/types";

ensureDocumentsSeeded();
ensureMasterSeeded();

// ---------------------------------------------------------------------------
// the writer and its reader

test("a date is written in numbers, day-month-year, with two figures for the year", () => {
  assert.equal(formatDisplayDate("2026-10-24"), "24-10-26");
  assert.equal(formatDisplayDate("2026-01-01"), "01-01-26");
  assert.equal(formatDisplayDate("2026-12-31"), "31-12-26");
  assert.equal(formatDisplayDate("2000-01-01"), "01-01-00");
  assert.equal(formatDisplayDate("2099-12-31"), "31-12-99");
  assert.equal(formatDisplayDate("2028-02-29"), "29-02-28", "a 29 February");
  assert.equal(formatDisplayDate("2026-09-03"), "03-09-26", "a day and a month under ten keep their nought");
  // No month name in any of them.
  assert.ok(!/[A-Za-z]/.test(formatDisplayDate("2026-10-24")));
});

test("no date: TO BE CONFIRMED, as it was", () => {
  assert.equal(formatDisplayDate(null), "TO BE CONFIRMED");
  assert.equal(formatDisplayDate(""), "TO BE CONFIRMED");
});

test("displayDateToISO reads back what formatDisplayDate writes, for every day from 2000 to 2099", () => {
  for (const iso of ["2026-01-01", "2026-10-24", "2026-12-31", "2000-01-01", "2028-02-29", "2099-12-31"]) {
    assert.equal(displayDateToISO(formatDisplayDate(iso)), iso, iso);
  }
  let day = "2000-01-01";
  let count = 0;
  while (day <= "2099-12-31") {
    const written = formatDisplayDate(day);
    assert.match(written, /^\d{2}-\d{2}-\d{2}$/, day);
    assert.equal(displayDateToISO(written), day, `${day} -> ${written}`);
    day = addDays(day, 1);
    count++;
  }
  assert.equal(count, 36525, "every day of the hundred years, once");
  assert.equal(displayDateToISO("24-10-26"), "2026-10-24");
});

test("displayDateToISO: what is not a real day written that way is null", () => {
  for (const text of [
    "31-02-26", // no 31 February
    "29-02-27", // 2027 is not a leap year
    "00-10-26",
    "32-10-26",
    "24-00-26",
    "24-13-26",
    "24-Oct-26", // the old words are the reader's business (roundTrip/values.ts), not this one's
    "24-10-2026", // four figures for the year
    "2026-10-24",
    "24/10/26",
    "24.10.26",
    "4-10-26", // two figures for each
    "24-10-6",
    " 24-10-26",
    "24-10-26 ",
    "",
    "TO BE CONFIRMED",
  ]) {
    assert.equal(displayDateToISO(text), null, JSON.stringify(text));
  }
});

// ---------------------------------------------------------------------------
// what other writers say

test("the notification text, the server's and the Excel upload's reader agree with it", () => {
  assert.equal(notificationDate("2026-10-09"), "09-10-26");
  assert.equal(notificationDate("2099-12-31"), "31-12-99");
  assert.equal(notificationDate(undefined), "");
  assert.equal(notificationDate("not a day"), "not a day");
  assert.equal(notificationDate("2026-10-09"), formatDisplayDate("2026-10-09"), "the same as every screen's");
});

test("a date typed or saved in Excel is read back in every way: 24-10-26 as the app writes it, and the older ways", () => {
  const read = (text: string) => readDate({ text }, "2026-10-05");
  assert.equal(read("24-10-26"), "2026-10-24", "the way the app now writes it");
  assert.equal(read("01-01-26"), "2026-01-01");
  assert.equal(read("31-12-99"), "2099-12-31");
  assert.equal(read("24-Oct-2026"), "2026-10-24", "the way it was written until 24-Oct-2026");
  assert.equal(read("24-Oct-26"), "2026-10-24");
  assert.equal(read("24/10/2026"), "2026-10-24");
  assert.equal(read("24.10.2026"), "2026-10-24");
  assert.equal(read("24.10.26"), "2026-10-24");
  assert.equal(read("2026-10-24"), "2026-10-24");
  assert.equal(read("31-02-26"), null, "no 31 February");
  assert.equal(read(""), "");
});

// ---------------------------------------------------------------------------
// Mitra reads a typed date

test("Mitra reads 24-10-26 and 24/10/26 as a day, besides the ways she read before", () => {
  const TODAY = "2026-10-24";
  const day = (text: string) => parseDateRange(text, TODAY);
  assert.deepEqual(day("documents for 24-10-26"), { from: "2026-10-24", to: "2026-10-24", label: "24-10-26" });
  assert.deepEqual(day("records of 13/10/26"), { from: "2026-10-13", to: "2026-10-13", label: "13-10-26" });
  assert.deepEqual(day("documents from 01-10-26 to 24-10-26"), { from: "2026-10-01", to: "2026-10-24", label: "01-10-26 to 24-10-26" });
  assert.deepEqual(day("documents from 24-10-26 back to 01-10-26"), { from: "2026-10-01", to: "2026-10-24", label: "01-10-26 to 24-10-26" }, "either way round");
  // The old ways still read, and say themselves in the new writing.
  assert.deepEqual(day("documents for 24-10-2026"), { from: "2026-10-24", to: "2026-10-24", label: "24-10-26" });
  assert.deepEqual(day("documents for 24 October"), { from: "2026-10-24", to: "2026-10-24", label: "24-10-26" });
  assert.deepEqual(day("documents for 2026-10-24"), { from: "2026-10-24", to: "2026-10-24", label: "24-10-26" });
  // A day that is not one is not read as one.
  assert.equal(day("documents for 31-02-26"), null);
  assert.equal(day("documents for 24-13-26"), null);
  // A week and a month are said with the dates they run over, in the new writing.
  assert.equal(day("documents of this week")?.label, "this week (18-10-26 to 24-10-26)");
  assert.equal(day("documents of last week")?.label, "last week (11-10-26 to 17-10-26)");
});

test("the label of a period Mitra works over is in numbers, and one that already carries its dates is not said twice", () => {
  const TODAY = "2026-09-24";
  assert.equal(analyticIntent("how many breakdowns since last week?", TODAY)?.label, "since 13-09-26 (to 24-09-26)");
  assert.equal(analyticIntent("how many breakdowns since 5 August?", TODAY)?.label, "since 05-08-26 (to 24-09-26)");
  assert.equal(analyticIntent("how many breakdowns this week so far?", TODAY)?.label, "this week (20-09-26 to 24-09-26)");
  assert.equal(analyticIntent("how many breakdowns last week?", TODAY)?.label, "last week (13-09-26 to 19-09-26)");
  assert.equal(analyticIntent("how many breakdowns in August so far?", TODAY)?.label, "August 2026 to date (01-08-26 to 24-09-26)");
  assert.equal(analyticIntent("how many breakdowns on 14-08-26?", TODAY)?.label, "14-08-26", "a day typed the way the app writes it");
  assert.equal(analyticIntent("how many breakdowns from 01-08-26 to 31-08-26?", TODAY)?.label, "01-08-26 to 31-08-26");
});

// ---------------------------------------------------------------------------
// the voice says a date as a date

test("the voice says 24-10-26 as a date: the 24th of October, with the year only when it is not this one", () => {
  const now = new Date("2026-09-30T10:00:00");
  const ear = (t: string, lang = "en") => forTheEar(t, lang, now);
  assert.equal(ear("due on 24-10-26"), "due on 24th October.");
  assert.equal(ear("F/HR/17 is due 30-09-26 at 14:30."), "form F H R 17 is due 30th September at 2:30 PM.");
  assert.equal(ear("Done on 12-03-25."), "Done on 12th March 2025.", "another year is said");
  assert.equal(ear("Due 24/10/26."), "Due 24th October.", "a slash as well");
  assert.equal(ear("From 01-10-26 to 24-10-26."), "From 1st October to 24th October.");
  assert.equal(ear("Due 30-Sep-2026."), "Due 30th September.", "the older way is still said");
  assert.equal(ear("Due 30-09-2026."), "Due 30th September.");
  assert.equal(ear("Due 2026-10-02 at 09:00"), "Due 2nd October at 9 AM.");
  // Not a date: a month that is not one, a day that is not one, a range of hours.
  const MONTH_SAID = /January|February|March|April|May|June|July|August|September|October|November|December/;
  assert.ok(!MONTH_SAID.test(ear("Lot 31-13-26 shipped.")), ear("Lot 31-13-26 shipped."));
  assert.ok(!MONTH_SAID.test(ear("Lot 45-10-26 shipped.")), ear("Lot 45-10-26 shipped."));
  assert.equal(ear("Ran 10-20 hrs."), "Ran 10 to 20 hours.");
  // In Gujarati and in Hindi the day's number and the month's own name.
  assert.ok(ear("સમય 24-10-26 સુધી", "gu").includes("24 ઓક્ટોબર"), ear("સમય 24-10-26 સુધી", "gu"));
  assert.ok(ear("24-10-26 तक", "hi").includes("24 अक्टूबर"), ear("24-10-26 तक", "hi"));
});

// ---------------------------------------------------------------------------
// Search finds a date however it is typed

function record(id: string, data: unknown, due: string): RecordInstance {
  return {
    id,
    documentId: "gap-inspection",
    periodKey: due,
    dueDate: due,
    status: "Pending Verification",
    isDemo: false,
    data,
    createdAt: `${due}T09:00:00.000Z`,
    updatedAt: `${due}T10:00:00.000Z`,
    submittedBy: "Roshni",
    submittedAt: `${due}T10:00:00.000Z`,
  };
}

test("a record dated 2026-08-14 is found by typing 14-08-26, 14-Aug-2026, 14.08.2026 and the other ways it is written", () => {
  const r = record("t-numdate", { findings: [{ findingOfInspection: "Door gap near dispatch", targetDate: "2026-08-14" }] }, "2026-08-14");
  const { text, cells } = recordSearchText(r, { name: "Internal CAPA", formatNo: "F/QA/01", kind: "gap-inspection" });
  for (const typed of ["14-08-26", "14-Aug-2026", "14-aug-2026", "14.08.2026", "14/08/2026", "14-08-2026", "14/08/26", "14.08.26", "2026-08-14"]) {
    assert.ok(containsAllTerms(text, searchTerms(typed)), `typing ${typed} finds it`);
  }
  // A different day, or a different year, is not it.
  for (const typed of ["15-08-26", "14-08-27", "14-09-26", "14-Sep-2026", "14.08.2025"]) {
    assert.ok(!containsAllTerms(text, searchTerms(typed)), `typing ${typed} does not`);
  }
  // The line a result shows reads the date as every screen does.
  assert.equal(cells.find((c) => c.label === "Target date")?.value, "14-08-26");
  // A date typed on its own is a word to look for, never a request for a register.
  assert.equal(readSearchQuery("14-08-26").kind, "words");
});

// ---------------------------------------------------------------------------
// the paper's own way: 16.02.2022

test("the paper's dotted date comes from the new writing as from the old", () => {
  assert.equal(dotted("16-02-22"), "16.02.2022");
  assert.equal(dotted("01-12-21"), "01.12.2021");
  assert.equal(dotted("31-12-99"), "31.12.2099");
  assert.equal(dotted(" 16-02-22 "), "16.02.2022", "spaces around it");
  assert.equal(dotted("16-Feb-2022"), "16.02.2022", "the older writing gives what it gave");
  assert.equal(dotted("1-Dec-2021"), "01.12.2021");
  assert.equal(dotted("16.02.2022"), "16.02.2022", "already dotted: as it is");
  assert.equal(dotted("Rev 00"), "Rev 00");
  assert.equal(dotted(""), "");
  assert.equal(dotted(formatDisplayDate("2022-02-16")), "16.02.2022", "what formatDisplayDate writes");
});

// ---------------------------------------------------------------------------
// Excel: a date cell is a real date, shown dd-mm-yy

const decoder = new TextDecoder();
async function stylesOf(bytes: Uint8Array): Promise<string> {
  const zip = await unzip(bytes.slice().buffer);
  const get = zip.get("xl/styles.xml");
  assert.ok(get, "the workbook has its styles");
  return decoder.decode(await get());
}

test("both Excel writers show a date cell as dd-mm-yy, and the reader still knows that format and the old one", async () => {
  // The generic writer (HR master data and the like): serial numbers in the date columns.
  const plain = buildXlsx("Dates", [{ header: "On", kind: "date", width: 12 }, { header: "What", kind: "text", width: 20 }], [["2026-10-24", "x"]]);
  const plainStyles = await stylesOf(plain);
  assert.ok(plainStyles.includes('formatCode="[$-409]dd\\-mm\\-yy"'), plainStyles);
  assert.ok(!plainStyles.includes("mmm"), "no month name in the format");
  const plainSheet = decoder.decode(await (await unzip(plain.slice().buffer)).get("xl/worksheets/sheet1.xml")!());
  assert.ok(plainSheet.includes(`<v>${isoToSerial("2026-10-24")}</v>`), "the day is a real Excel date, not text");

  // The document writer (every downloaded record).
  const blocks: ExportBlock[] = [{ kind: "text", text: "GUJARAT PRINT PACK PUBLICATIONS PVT LTD", strong: true, title: true }];
  const sheet = workbookFromBlocks("Record", blocks);
  const sheetStyles = await stylesOf(sheet);
  assert.ok(sheetStyles.includes('formatCode="[$-409]dd\\-mm\\-yy"'), sheetStyles);
  assert.ok(!sheetStyles.includes("mmm"), "no month name in the format");

  // A file saved by either writer before 24-Oct-2026 (dd-mmm-yyyy), one Excel itself saved, and the new one: all dates.
  assert.equal(numberFormatKind(164, "[$-409]dd\\-mmm\\-yyyy"), "date");
  assert.equal(numberFormatKind(164, "[$-409]dd\\-mm\\-yy"), "date");
  assert.equal(numberFormatKind(170, "dd/mm/yyyy;@"), "date");
});
