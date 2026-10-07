// MITRA FILLS THE RECORD (REQUIREMENTS §94): DCRS's own reading of a fill, with
// no network (engine/fillRequest.ts).
//   * fill or not a fill, on the website's and the phone's requests from the
//     two diagnoses of 6/7-Oct-2026, and the questions that must never write;
//   * the Tier 0 values: slot readings (the 24-reading register too), the
//     "all fine" lexicon of F/HR/17 in English, Hindi and Gujarati, checker
//     and time, "tested by", a select option said by its own word, a driver's
//     name in three scripts;
//   * the document by its format number, its words with stems and the
//     Hindi/Gujarati noun table (the ECHO sentence in three languages gives
//     disp-vehicle-cleaning), and the day ("kal" alone is asked).
// Run: npm run test:unit -- fillRequest
import test from "node:test";
import assert from "node:assert/strict";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { asciiDigits, readFillRequest, scanTimes, type FillRequest } from "../src/engine/fillRequest";
import { addDays, todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const today = todayISO();
const read = (text: string, extra: Record<string, unknown> = {}): FillRequest => readFillRequest(text, { today, isDemo: false, ...extra });
type Fill = Extract<FillRequest, { kind: "fill" }>;
const fill = (text: string, extra: Record<string, unknown> = {}): Fill => {
  const r = read(text, extra);
  assert.equal(r.kind, "fill", `"${text}" should read as a fill`);
  return r as Fill;
};

const T8_24 =
  "Viscosity readings, tested by Jeni: 09:00 20.1, 10:00 20.3, 11:00 19.8, 12:00 20.0, 13:00 20.4, 14:00 19.9, 15:00 20.2, 16:00 20.1, 17:00 19.7, 18:00 20.0, 19:00 20.3, 20:00 20.5, 21:00 19.6, 22:00 19.9, 23:00 20.0, 00:00 20.2, 01:00 20.1, 02:00 19.8, 03:00 20.0, 04:00 19.9, 05:00 20.3, 06:00 20.1, 07:00 19.8, 08:00 20.0";

test("the website's and the phone's fill requests read as fills, each in its mode", () => {
  const cases: [string, string, string][] = [
    ["Fill today's daily pest control record", "daily-pest-monitoring", "bare"],
    ["Open today's F-QC-30 and fill it with sample data", "qc-viscosity", "sample"],
    ["Vehicle ECHO cleaned today, dry mopping, driver Rameshbhai", "disp-vehicle-cleaning", "values"],
    ["In today's F-QC-30, viscosity 18 seconds at 10:00 and 19 at 14:00", "qc-viscosity", "values"],
    ["viscosity 18 seconds at 10:00 and 19 at 14:00", "qc-viscosity", "values"],
    ["આજે ECHO ગાડી સાફ કરી, ડ્રાય મોપિંગ, ડ્રાઇવર રમેશભાઈ", "disp-vehicle-cleaning", "values"],
    ["आज ECHO गाड़ी की सफाई हुई, ड्राई मॉपिंग, ड्राइवर रमेशभाई", "disp-vehicle-cleaning", "values"],
    ["आज BOLERO गाड़ी की सफाई हुई, ड्राई मॉपिंग, ड्राइवर रमेशभाई", "disp-vehicle-cleaning", "values"],
    ["fill the vehicle cleaning record", "disp-vehicle-cleaning", "bare"],
    ["Open tomorrow's F-QC-30 and put 19.5 at 09:00", "qc-viscosity", "values"],
    ["fill today's F-QC-30: 18 at 10:00 and 19 at 14:00", "qc-viscosity", "values"],
    ["Put 19.6 at 11:00 in tomorrow's F-QC-30", "qc-viscosity", "values"],
    ["Yesterday ECHO was cleaned, dry mopping, driver Rameshbhai", "disp-vehicle-cleaning", "values"],
    ["Yesterday BOLERO was also cleaned, wet mopping, driver Sureshbhai", "disp-vehicle-cleaning", "values"],
    ["Fill tomorrow's pest control record with sample data", "daily-pest-monitoring", "sample"],
    ["Set today's pest control time of checking to 10:15", "daily-pest-monitoring", "values"],
    ["આજનો પેસ્ટ કંટ્રોલ રેકોર્ડ ભરો: બધું બરાબર છે, કોઈ ઉંદર મળ્યો નથી, ચેકર વિનય ભોજક, સવારે 9:30", "daily-pest-monitoring", "values"],
    ["आज F-QC-30 में सुबह 10 बजे viscosity 18 सेकंड और दोपहर 2 बजे 19 सेकंड", "qc-viscosity", "values"],
    ["help me fill the daily pest control record", "daily-pest-monitoring", "guide"],
  ];
  for (const [text, docId, mode] of cases) {
    const r = fill(text);
    assert.equal(r.doc?.id, docId, `"${text}": document ${r.doc?.id ?? "none"} (candidates ${r.candidates.map((d) => d.id).join(", ")})`);
    assert.equal(r.mode, mode, `"${text}": mode`);
  }
});

test("questions and other instructions are never a fill", () => {
  for (const text of [
    "what was viscosity at 10:00?",
    "What was the viscosity at 10:00",
    "is today a holiday?",
    "Open yesterday's vehicle cleaning record",
    "open today's F-QC-30",
    "show me today's records",
    "which records are due today",
    "hello",
    "what can you do",
    "submit this record",
    "print it",
    "how many traps are provided?",
    "add a column Remarks after Viscosity",
    "go to the dashboard",
    "આજે કયા રેકોર્ડ બાકી છે?",
    "क्या आज छुट्टी है",
    "create a new fly catcher record",
  ]) {
    assert.equal(read(text).kind, "not-a-fill", `"${text}" must not read as a fill`);
  }
  // On an open record too: a question about it is not data for it.
  assert.equal(read("what is the viscosity at 14:00?", { openRecordId: null }).kind, "not-a-fill");
});

test("slot readings: '18 at 10:00 and 19 at 14:00', time first, Hindi hours, and the 24-reading register with its tester", () => {
  const a = fill("fill today's F-QC-30: 18 at 10:00 and 19 at 14:00");
  assert.deepEqual(a.rules?.values.slots, { "10:00": { viscosity: 18 }, "14:00": { viscosity: 19 } });
  assert.equal(a.rules?.residual, false, "nothing left for the model");
  const b = fill("In today's F-QC-30, viscosity 18 seconds at 10:00 and 19 at 14:00");
  assert.deepEqual(b.rules?.values.slots, { "10:00": { viscosity: 18 }, "14:00": { viscosity: 19 } });
  assert.equal(b.rules?.residual, false);
  const hi = fill("आज F-QC-30 में सुबह 10 बजे viscosity 18 सेकंड और दोपहर 2 बजे 19 सेकंड");
  assert.deepEqual(hi.rules?.values.slots, { "10:00": { viscosity: 18 }, "14:00": { viscosity: 19 } });
  assert.equal(hi.rules?.residual, false);
  assert.equal(hi.language, "hi");
  const tomorrow = fill("Open tomorrow's F-QC-30 and put 19.5 at 09:00");
  assert.equal(tomorrow.dateISO, addDays(today, 1));
  assert.deepEqual(tomorrow.rules?.values.slots, { "09:00": { viscosity: 19.5 } });
  const all = fill(T8_24, { documentId: "qc-viscosity" });
  const slots = all.rules?.values.slots ?? {};
  assert.equal(Object.keys(slots).length, 24, "every one of the 24 readings");
  assert.deepEqual(slots["09:00"], { viscosity: 20.1, testedBy: "Jeni" });
  assert.deepEqual(slots["00:00"], { viscosity: 20.2, testedBy: "Jeni" });
  assert.deepEqual(slots["08:00"], { viscosity: 20, testedBy: "Jeni" });
  assert.equal(all.rules?.residual, false);
  // Gujarati and Devanagari digits are digits.
  assert.equal(asciiDigits("૧૮ at ૧૦:૦૦ और १९"), "18 at 10:00 और 19");
  assert.deepEqual(scanTimes("સાંજે 7 વાગ્યે, रात 11 बजे, 2 pm, 10 am").map((t) => t.time), ["19:00", "23:00", "14:00", "10:00"]);
});

test("F/HR/17's 'all fine' in three languages and scripts: points 1-3 and 5-10 fine, 4 untouched; no rodent; checker and time", () => {
  const fine = ["1", "2", "3", "5", "6", "7", "8", "9", "10"];
  const expectFine = (text: string) => {
    const r = fill(text, { documentId: "daily-pest-monitoring" });
    const checks = r.rules?.values.checks ?? {};
    for (const n of fine) assert.equal(checks[n], "ok", `"${text}": point ${n}`);
    assert.equal(checks["4"], undefined, `"${text}": point 4 is a count, never "ok"`);
    assert.equal(r.rules?.allFine, true);
    return r;
  };
  const en = expectFine("All ten are fine, Yes for all of them, no rodents caught. Checker Vinay Bhojak, checked at 09:30.");
  assert.deepEqual(en.rules?.values.fields, { checker: "Vinay Bhojak", timeOfChecking: "09:30" });
  assert.equal(en.rules?.residual, false, "everything read by the rules: no model call");
  const gu = expectFine("આજનો પેસ્ટ કંટ્રોલ રેકોર્ડ ભરો: બધું બરાબર છે, કોઈ ઉંદર મળ્યો નથી, ચેકર વિનય ભોજક, સવારે 9:30");
  assert.deepEqual(gu.rules?.values.fields, { checker: "વિનય ભોજક", timeOfChecking: "09:30" });
  assert.equal(gu.rules?.residual, false);
  assert.equal(gu.language, "gu");
  const hi = expectFine("सब ठीक है, कोई चूहा नहीं, चेकर विनय भोजक, सुबह 9:30 बजे");
  assert.deepEqual(hi.rules?.values.fields, { checker: "विनय भोजक", timeOfChecking: "09:30" });
  expectFine("badhu barabar che, checker Vinay");
  expectFine("sab theek hai, checker Vinay");
  expectFine("બધુ ઠીક છે");
  expectFine("everything is normal");
  // A count of traps only when a count is said.
  const traps = fill("all fine, 100 traps provided", { documentId: "daily-pest-monitoring" });
  assert.equal(traps.rules?.values.checks?.["4"], 100);
  // A point named is remembered, so the model's "not ok" for it is kept.
  const except = fill("all fine except point 2, gaps near the store shutter", { documentId: "daily-pest-monitoring" });
  assert.ok(except.rules?.namedPoints.includes(2));
  assert.equal(except.rules?.residual, true, "the exception is for the model to read");
});

test("the vehicle sentence in English, Gujarati and Hindi: vehicle, cleaning type, the driver as said, and today's date on the line", () => {
  for (const [text, driver] of [
    ["Vehicle ECHO cleaned today, dry mopping, driver Rameshbhai", "Rameshbhai"],
    ["આજે ECHO ગાડી સાફ કરી, ડ્રાય મોપિંગ, ડ્રાઇવર રમેશભાઈ", "રમેશભાઈ"],
    ["आज ECHO गाड़ी की सफाई हुई, ड्राई मॉपिंग, ड्राइवर रमेशभाई", "रमेशभाई"],
  ] as const) {
    const r = fill(text);
    assert.equal(r.doc?.id, "disp-vehicle-cleaning");
    assert.deepEqual(r.rules?.values.header, { vehicleNumber: "GJ02ZZ6403 – ECHO" }, text);
    assert.deepEqual(r.rules?.values.rows, [{ cleaningType: "Dry", driverSign: driver, date: today }], text);
    assert.deepEqual(r.identity, { key: "vehicleNumber", label: "Vehicle number", value: "GJ02ZZ6403 – ECHO" });
    assert.equal(r.rules?.residual, false, `${text}: read by the rules alone`);
  }
  const bolero = fill("आज BOLERO गाड़ी की सफाई हुई, ड्राई मॉपिंग, ड्राइवर रमेशभाई");
  assert.equal(bolero.identity?.value, "GJ02AT4947 – BOLERO PICK UP");
  const wet = fill("Yesterday BOLERO was also cleaned, wet mopping, driver Sureshbhai");
  assert.equal(wet.dateISO, addDays(today, -1));
  assert.deepEqual(wet.rules?.values.rows, [{ cleaningType: "Wet", driverSign: "Sureshbhai", date: addDays(today, -1) }]);
  // Something the rules cannot read is left for the model.
  const more = fill("Vehicle ECHO cleaned today, dry mopping, driver Rameshbhai, odour found near the back door");
  assert.equal(more.rules?.residual, true);
});

test("the day: today, yesterday, tomorrow in three languages; 'kal' alone is asked, never guessed", () => {
  assert.equal(fill("આવતીકાલે F-QC-30 માં 10:00 એ 18").dateISO, addDays(today, 1));
  assert.equal(fill("ગઈકાલે ECHO ગાડી સાફ કરી, ડ્રાય મોપિંગ").dateISO, addDays(today, -1));
  const kal = fill("कल ECHO गाड़ी की सफाई हुई, ड्राई मॉपिंग");
  assert.ok(kal.dayQuestion, "kal is asked");
  assert.equal(kal.dayQuestion?.yesterday, addDays(today, -1));
  assert.equal(kal.dayQuestion?.tomorrow, addDays(today, 1));
  assert.equal(fill("put 18 at 10:00 on 06-Oct-2026 in F-QC-30").dateISO, "2026-10-06");
});

test("the record on screen: values for it stay on it unless another document is named", () => {
  // With a record open, "fill it" is that record, bare; a submit asked for is noted, never assumed.
  const r = fill("fill it", { documentId: "qc-viscosity" });
  assert.equal(r.mode, "bare");
  assert.equal(fill("fill 18 at 10:00 and submit it", { documentId: "qc-viscosity" }).submitAsked, true);
  assert.equal(fill("fill 18 at 10:00", { documentId: "qc-viscosity" }).submitAsked, false);
});
