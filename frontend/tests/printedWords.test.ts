// THE HR MODULE'S OWN VIEWS: EVERY PRINTED WORD TYPED OVER ON THE RECORD (REQUIREMENTS §137; the owner, 28-Oct-2026, with
// the contractor's service report: "make HR Module each and every part of all documents editable"). A place the record
// has not changed draws exactly what it drew (the same markup, so the printout is as before); a place typed over draws the
// record's words, kept in its printedWords, the form's otherwise. Run: npm run test:unit -- printedWords
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { PrintedWordsAt, withWordsAt, wordsAt } from "../src/components/records/PrintedWordsAt";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

test("a place keeps the form's words until the record types over them; an unchanged place is not stored", () => {
  assert.equal(wordsAt(undefined, "title", "Pest control Service Report"), "Pest control Service Report");
  assert.equal(wordsAt({ title: "Our report" }, "title", "Pest control Service Report"), "Our report");
  assert.deepEqual(withWordsAt(undefined, "area:3", "Gate", "1st floor - Stair case"), { "area:3": "Gate" });
  assert.deepEqual(withWordsAt({ "area:3": "Gate" }, "area:3", "1st floor - Stair case", "1st floor - Stair case"), {}, "typed back to the form's: not stored");
});

test("drawn as before where nothing is typed and nothing can be; the record's lines where it has its own; the caret where it can be written on", () => {
  const none = { place: "title", words: undefined, original: "Pest control Service Report", editable: false, onWords: () => {} };
  assert.equal(html(React.createElement(PrintedWordsAt, none)), "Pest control Service Report");
  const own = { ...none, words: { title: "Our report\nNovember" } };
  assert.equal(html(React.createElement(PrintedWordsAt, own)), "Our report<br/>November");
  const open = { ...none, editable: true };
  assert.match(html(React.createElement(PrintedWordsAt, open)), /^<span class="editable-words" contenteditable="true"[^>]*>Pest control Service Report<\/span>$/i);
});

test("every printed place of the service report, F/HR/17's day and F/HR/18's visit goes through it", () => {
  // (a call written over two lines reads as one)
  const svc = read("frontend", "src", "components", "records", "ServiceReportRecordView.tsx").replace(/at\(\s+/g, "at(");
  for (const place of ['"title"', '"provider"', '"serviceNameLabel"', '"dateLabel"', '"unit"', '"serviceName"', '"date"', "`heading:${i}`", "`area:${l.slNo}`", "`material:${l.slNo}`", "`method:${l.slNo}`", '"technicianCaption"', '"customerCaption"']) {
    assert.ok(svc.includes(`at(${place}`), `the service report: ${place}`);
  }
  const day = read("frontend", "src", "components", "records", "DailyPestMonitoringRecordView.tsx");
  for (const place of ['"instruction:1"', '"instruction:2"', "`cp:${cp.no}`", '"summaryTitle"', '"head:checkPoint"', '"head:remarks"']) {
    assert.ok(day.includes(`at(${place}`), `F/HR/17's day: ${place}`);
  }
  const fly = read("frontend", "src", "components", "records", "FlyCatcherRecordView.tsx");
  for (const place of ["`pc:${e.pcId}`", "`date:${e.pcId}`"]) assert.ok(fly.includes(`at(${place}`), `F/HR/18: ${place}`);
  assert.match(fly, /<Fhr18Legend pcLocations=\{pcLocations\} host=\{host\} \/>/);
  assert.match(fly, /<Fhr18GridHead host=\{host\} \/>/);
  const types = read("frontend", "src", "types", "record.ts");
  assert.equal((types.match(/printedWords\?: PrintedWords;/g) ?? []).length, 3, "the day, the visit and the service report keep their own words");
});
