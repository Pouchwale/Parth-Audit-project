// WHAT A PERSON TYPES INTO EXCEL OR WORD, AS THE RECORD'S DATA (REQUIREMENTS §81):
// parseUploadedValue for every kind of bound value, table-driven; and the pure
// pieces the readers stand on — the XML reader, the map's own serialisations,
// a defined name's reference, a number format's kind, cutting values out of a
// cell with words around them.
import test from "node:test";
import assert from "node:assert/strict";
import { parseUploadedValue } from "../src/engine/roundTrip/plan";
import { unchangedInFile } from "../src/engine/roundTrip/plan";
import { cutSegments, numberFormatKind, parseDefinedRef, type UploadedValue } from "../src/engine/roundTrip/readFile";
import { parseXml, attr, descendants, textContent, childElements } from "../src/engine/roundTrip/xml";
import {
  envelopePropertyValue,
  makeEnvelope,
  mapJson,
  mapSheetRows,
  parseEnvelopeProperty,
  parseMapJson,
  parseMapSheetRows,
  rowSignature,
  type MapEntry,
  type MapTable,
} from "../src/engine/roundTrip/exportMap";
import { isoToSerial } from "../src/utils/xlsx";
import type { BindOption, BindType } from "../src/engine/roundTrip/bindPath";

const TODAY = "2026-10-05";
const SHIFTS: BindOption[] = [
  { value: "A", label: "Shift A" },
  { value: "B", label: "Shift B" },
  { value: "N/A", label: "Not applicable" },
];

type Case = [input: string | UploadedValue, expected: unknown, display?: string];

function check(type: BindType, cases: Case[], options: BindOption[] = []): void {
  for (const [input, expected, display] of cases) {
    const v: UploadedValue = typeof input === "string" ? { text: input } : input;
    const got = parseUploadedValue(v, type, options, TODAY);
    const what = `${type} ${JSON.stringify(v)}`;
    if (expected instanceof Error) {
      assert.equal(got.ok, false, `${what} is rejected`);
      if (!got.ok) assert.equal(got.why, expected.message, `${what}: the reason`);
      continue;
    }
    assert.ok(got.ok, `${what} is read`);
    if (got.ok) {
      assert.deepEqual(got.value, expected, `${what} → ${JSON.stringify(expected)}`);
      if (display !== undefined) assert.equal(got.display, display, `${what} shows as ${display}`);
    }
  }
}

test("text: trimmed, one line; a paragraph keeps its line breaks", () => {
  check("text", [
    ["  Ravi Patel  ", "Ravi Patel"],
    ["Ravi\nPatel", "Ravi Patel"],
    ["Ravi\t  Patel", "Ravi Patel"],
    ["", ""],
    ["    ", ""],
    [{ text: "12.5", number: 12.5 }, "12.5"],
  ]);
  check("paragraph", [
    ["  First line  \r\nSecond line\n\nFourth  ", "First line\nSecond line\n\nFourth"],
    ["\n\nOnly\n", "Only"],
    ["", ""],
  ]);
});

test("number: grouping, spaces, float noise, Gujarati digits; empty is null; anything else is rejected", () => {
  check("number", [
    ["1,234.5", 1234.5, "1234.5"],
    ["1,23,456", 123456],
    [" 12 ", 12],
    ["-3.25", -3.25],
    ["−4", -4],
    [".5", 0.5],
    ["1e3", 1000],
    ["૧૨.૫", 12.5],
    [{ text: "12.300000000000001", number: 12.300000000000001 }, 12.3],
    [{ text: "0.1", number: 0.1 + 0.2 - 0.2 }, 0.1],
    ["", null, ""],
    [" ", null],
    ["abc", new Error("‘abc’ is not a number.")],
    ["12 kg", new Error("‘12 kg’ is not a number.")],
    ["1,5", new Error("‘1,5’ is not a number.")],
  ]);
});

test("date: ISO, dd-Mmm-yyyy, day-first numbers, an Excel serial or a date cell; empty is \"\"", () => {
  const serial = isoToSerial("2026-10-01")!;
  check("date", [
    ["2026-10-01", "2026-10-01", "01-Oct-2026"],
    ["01-Oct-2026", "2026-10-01"],
    ["1 October 2026", "2026-10-01"],
    ["01 oct 26", "2026-10-01"],
    ["Oct 1, 2026", "2026-10-01"],
    ["01/10/2026", "2026-10-01"],
    ["01-10-2026", "2026-10-01"],
    ["1.10.2026", "2026-10-01"],
    ["01/10/26", "2026-10-01"],
    ["1/10", "2026-10-01"],
    ["2026/10/01", "2026-10-01"],
    ["2026-10-01T00:00:00", "2026-10-01"],
    [{ text: "01-Oct-2026", number: serial, serial, isDate: true }, "2026-10-01"],
    [{ text: String(serial), number: serial }, "2026-10-01"],
    [String(serial), "2026-10-01"],
    ["૦૧/૧૦/૨૦૨૬", "2026-10-01"],
    ["", "", ""],
    ["31/02/2026", new Error("‘31/02/2026’ is not a date — write it like 01-Oct-2026.")],
    ["2026", new Error("‘2026’ is not a date — write it like 01-Oct-2026.")],
    ["next week", new Error("‘next week’ is not a date — write it like 01-Oct-2026.")],
    [{ text: "2026", number: 2026 }, new Error("‘2026’ is not a date — write it like 01-Oct-2026.")],
  ]);
});

test("time: HH:MM, H:MM am/pm, an Excel day fraction; empty is \"\"", () => {
  check("time", [
    ["10:30", "10:30"],
    ["9:05", "09:05"],
    ["9.05", "09:05"],
    ["10:30:45", "10:30"],
    ["2:15 pm", "14:15"],
    ["12:00 AM", "00:00"],
    ["12:30 p.m.", "12:30"],
    ["5 pm", "17:00"],
    ["0930", "09:30"],
    [{ text: "0.4375", number: 0.4375 }, "10:30"],
    [{ text: "10:30", number: 46296.4375, serial: 46296.4375, isDate: true }, "10:30"],
    ["0.75", "18:00"],
    ["", ""],
    ["25:00", new Error("‘25:00’ is not a time — write it like 14:30.")],
    ["13 pm", new Error("‘13 pm’ is not a time — write it like 14:30.")],
    ["noon", new Error("‘noon’ is not a time — write it like 14:30.")],
  ]);
});

test("yes/no: every way of writing it; empty is \"\"; another choice of the box is kept", () => {
  check("yesno", [
    ["Yes", "Yes", "Yes"],
    ["y", "Yes"],
    ["✓", "Yes"],
    ["✔", "Yes"],
    ["☑", "Yes"],
    ["x", "Yes"],
    ["TRUE", "Yes"],
    ["1", "Yes"],
    ["હા", "Yes"],
    [{ text: "TRUE", bool: true }, "Yes"],
    ["No", "No", "No"],
    ["n", "No"],
    ["false", "No"],
    ["0", "No"],
    ["ના", "No"],
    ["", "", ""],
    ["maybe", new Error("‘maybe’ is not Yes or No.")],
  ]);
  check("yesno", [["not applicable", "N/A", "Not applicable"]], SHIFTS);
});

test("select: the option's value or label, however cased and spaced; else the choices are listed", () => {
  check(
    "select",
    [
      ["Shift A", "A", "Shift A"],
      ["shift  a", "A"],
      ["b", "B", "Shift B"],
      ["SHIFTB", "B"],
      ["", "", ""],
      ["Shift D", new Error("‘Shift D’ is not one of the choices: Shift A, Shift B, Not applicable.")],
    ],
    SHIFTS
  );
  check("select", [["Anything at all", "Anything at all"]]);
});

test("a tick box: ticked or not, and nothing else", () => {
  check("bool", [
    ["☑", true, "☑"],
    ["☒", true],
    ["✓", true],
    ["✔", true],
    ["x", true],
    ["X", true],
    ["yes", true],
    ["true", true],
    ["1", true],
    ["હા", true],
    [{ text: "TRUE", bool: true }, true],
    ["☐", false, "☐"],
    ["", false],
    ["no", false],
    ["false", false],
    ["0", false],
    [{ text: "FALSE", bool: false }, false],
    ["perhaps", new Error("‘perhaps’ is not a tick — write ☑ (or Yes) for ticked and leave it empty (or ☐) for not.")],
  ]);
});

test("a value the file only shows differently is not a change", () => {
  const same = (up: string | UploadedValue, written: string, type: BindType, options: BindOption[] = []) =>
    unchangedInFile(typeof up === "string" ? { text: up } : up, written, type, options, TODAY);
  assert.ok(same("  Ravi   Patel ", "Ravi Patel", "text"));
  assert.ok(same("All good\r\n\r\nNo leaks  ", "All good\nNo leaks", "paragraph"));
  assert.ok(same({ text: "1.5", number: 1.5 }, "1.50", "number"));
  assert.ok(same({ text: "1.5", number: 1.5 }, "1.50", "text"), "Excel re-typed a number-looking text");
  assert.ok(same("12.0000001", "12", "number"));
  assert.ok(!same("12.01", "12", "number"));
  assert.ok(same({ text: "01-Oct-2026", number: 46296, serial: isoToSerial("2026-10-01")!, isDate: true }, "01-Oct-2026", "date"));
  assert.ok(same("01/10/2026", "01-Oct-2026", "date"));
  assert.ok(same("9:05", "09:05", "time"));
  assert.ok(same("Y", "Yes", "yesno"));
  assert.ok(same("a", "Shift A", "select", SHIFTS));
  assert.ok(same({ text: "FALSE", bool: false }, "☐", "bool"));
  assert.ok(same("    ", "", "text"), "an empty Word control's no-break spaces");
  assert.ok(!same("Ravi", "Ravi Patel", "text"));
  assert.ok(!same("☑", "☐", "bool"));
});

test("values are cut out of a cell with words around them — or not at all when the words were changed", () => {
  const e = (pre: string, post: string) => ({ pre, post });
  assert.deepEqual(cutSegments("Temp: 12 °C", [e("Temp: ", " °C")]), ["12"]);
  assert.deepEqual(cutSegments("Temp:  °C", [e("Temp: ", " °C")]), [""]);
  assert.deepEqual(cutSegments("A: Mehul, B: Suresh", [e("A: ", ", B: "), e(", B: ", "")]), ["Mehul", "Suresh"]);
  assert.deepEqual(cutSegments("A: Mehul; B: Suresh", [e("A: ", ", B: "), e(", B: ", "")]), [null, null]);
  assert.deepEqual(cutSegments("Temperature 12", [e("Temp: ", "")]), [null]);
  assert.deepEqual(cutSegments("Remarks\nline one\nline two", [e("Remarks\n", "")]), ["line one\nline two"]);
  assert.deepEqual(cutSegments("12 kg", [e("", " kg")]), ["12"]);
  assert.deepEqual(cutSegments("1020", [e("", ""), e("", "")]), [null, null], "two values that touch cannot be told apart");
});

test("the XML reader: prefixes ignored, entities, CDATA, comments, attributes in either quotes", () => {
  const doc = parseXml(
    '﻿<?xml version="1.0"?>\n<!-- a comment --><w:document xmlns:w="urn:w"><w:p a=\'1\' w:val="x &amp; y &#10;z"><w:t>Tom &amp; Jerry &lt;3 &#x2713;</w:t><![CDATA[<raw>]]><x:t/></w:p></w:document>'
  );
  assert.equal(doc.local, "document");
  const p = descendants(doc, "p")[0];
  assert.equal(attr(p, "a"), "1");
  assert.equal(attr(p, "val"), "x & y \nz");
  assert.equal(textContent(p), "Tom & Jerry <3 ✓<raw>");
  assert.equal(descendants(doc, "t").length, 2);
  assert.equal(childElements(p).length, 2);
  assert.throws(() => parseXml("<a><b></a>"));
  assert.throws(() => parseXml("<a>"));
  assert.throws(() => parseXml("just text"));
});

test("a defined name's reference, and a number format's kind", () => {
  assert.deepEqual(parseDefinedRef("'F-QC-99'!$C$12"), { sheet: "F-QC-99", col: 2, row: 12 });
  assert.deepEqual(parseDefinedRef("'It''s mine'!$AA$3"), { sheet: "It's mine", col: 26, row: 3 });
  assert.deepEqual(parseDefinedRef("Sheet1!B7"), { sheet: "Sheet1", col: 1, row: 7 });
  assert.deepEqual(parseDefinedRef("=Sheet1!$B$7:$B$7"), { sheet: "Sheet1", col: 1, row: 7 });
  assert.equal(parseDefinedRef("'F-QC-99'!#REF!"), null);
  assert.equal(parseDefinedRef("#REF!"), null);
  assert.equal(numberFormatKind(14, undefined), "date");
  assert.equal(numberFormatKind(20, undefined), "time");
  assert.equal(numberFormatKind(22, undefined), "datetime");
  assert.equal(numberFormatKind(0, undefined), null);
  assert.equal(numberFormatKind(49, undefined), null);
  assert.equal(numberFormatKind(164, "[$-409]dd\\-mmm\\-yyyy"), "date");
  assert.equal(numberFormatKind(170, "dd/mm/yyyy;@"), "date");
  assert.equal(numberFormatKind(171, "h:mm AM/PM"), "time");
  assert.equal(numberFormatKind(172, "[h]:mm:ss"), "time");
  assert.equal(numberFormatKind(173, "dd-mm-yy hh:mm"), "datetime");
  assert.equal(numberFormatKind(174, "0.00"), null);
  assert.equal(numberFormatKind(175, '#,##0.00 "kg"'), null);
  assert.equal(numberFormatKind(176, "General"), null);
  assert.equal(numberFormatKind(177, "@"), null);
  assert.equal(numberFormatKind(178, "mmm-yy"), "date");
});

test("the map survives its own serialisations: the hidden sheet's rows and the Word part's JSON", () => {
  const envelope = makeEnvelope("xlsx", { documentId: "qc-test", formatNo: "F/QC/99", revisionNo: "01" }, ["rec-1", "rec-2", "rec-1"], "2026-09-27T10:00:00.000Z");
  assert.deepEqual(envelope.recordIds, ["rec-1", "rec-2"]);
  const entries: MapEntry[] = [
    { i: 0, recordId: "rec-1", path: "header/date", type: "date", label: "Date", options: [], text: "01-Oct-2026", ref: "B3" },
    { i: 1, recordId: "rec-1", path: "rows/@r%2F1/shift", type: "select", label: "Shift, line 1", options: SHIFTS, text: "Shift A", ref: "E10", anchor: { col: 0, text: "1", grid: 0 } },
    { i: 2, recordId: "rec-2", path: "header/temperature", type: "number", label: "Temp", options: [], text: "12", ref: "B5", pre: "Temp: ", post: " °C" },
    { i: 3, recordId: "rec-2", path: "remarks", type: "paragraph", label: "Remarks", options: [], text: "line one\nline two" },
  ];
  const tables: MapTable[] = [
    {
      t: 0,
      recordId: "rec-1",
      listPath: "rows",
      columns: [
        { key: "time", type: "time", options: [], col: 1, label: "Time" },
        { key: "shift", type: "select", options: SHIFTS, col: 4 },
      ],
      headerRow: 9,
      lastRow: 11,
      firstRow: 9,
      nextRow: 13,
      fixedRows: ["Sr. No. | Time", "No rows yet."],
    },
  ];
  const fromSheet = parseMapSheetRows(mapSheetRows(envelope, entries, tables));
  assert.ok(fromSheet);
  assert.deepEqual(fromSheet!.envelope, envelope);
  assert.deepEqual(fromSheet!.entries, entries);
  assert.deepEqual(fromSheet!.tables, tables);
  const fromJson = parseMapJson(mapJson({ ...envelope, kind: "docx" }, entries, tables));
  assert.ok(fromJson);
  assert.deepEqual(fromJson!.envelope, { ...envelope, kind: "docx" });
  assert.deepEqual(fromJson!.entries, entries);
  assert.deepEqual(fromJson!.tables, tables);
  assert.equal(parseMapSheetRows([["hello"]]), null);
  assert.equal(parseMapJson("{}"), null);
  assert.equal(parseMapJson("not json"), null);
  // A malformed entry (a bad path, an unknown type) is dropped, not trusted.
  const rows = mapSheetRows(envelope, entries, tables);
  const bad = rows.map((r) => (r[0] === "1" ? ["1", "E10", "rec-1", "rows//x", "select"] : r[0] === "3" ? ["3", "", "rec-2", "remarks", "colour"] : r));
  assert.deepEqual(
    parseMapSheetRows(bad)!.entries.map((e) => e.i),
    [0, 2]
  );
});

test("the small envelope stays within Office's 255 characters", () => {
  const short = makeEnvelope("docx", { documentId: "hr-competence" }, ["rec-1"], "2026-09-27T10:00:00.000Z");
  assert.deepEqual(parseEnvelopeProperty(envelopePropertyValue(short)), { documentId: "hr-competence", recordId: "rec-1", exportedAt: "2026-09-27T10:00:00.000Z" });
  const long = makeEnvelope("docx", { documentId: "d".repeat(180) }, ["r".repeat(180)], "2026-09-27T10:00:00.000Z");
  const value = envelopePropertyValue(long);
  assert.ok(value.length <= 255);
  assert.equal(parseEnvelopeProperty(value)?.documentId.slice(0, 10), "dddddddddd");
});

test("a grid's fixed lines are recognised however the file spaces them or rewrites their numbers", () => {
  assert.equal(rowSignature(["No rows yet.", "", " "]), "No rows yet.");
  assert.equal(rowSignature(["Total", "12.50", ""]), rowSignature(["Total ", "12.5"]));
  assert.notEqual(rowSignature(["Total", "12.5"]), rowSignature(["Total", "12.6"]));
});
