// A NOTIFICATION IN WORDS (REQUIREMENTS §97): engine/notificationText.ts, every kind in English, Hindi and Gujarati.
//
// What is proved here:
//   * every kind is worded in all three languages, from facts alone: a title and a body, nothing left unfilled, in the
//     language's own script, with no gendered pronoun and no em dash;
//   * the owner's sentence: "12 readings to enter" for the daily pest control record;
//   * several items in one push: "N records need you" with the top three names;
//   * the ten modules' names are the plant's own (data/seed/documentDepartments.ts), in each language;
//   * a language it does not know is English, never a failure;
//   * the reminder email's own words (the owner, 25-Oct-2026): in each language, no em dash, no gendered pronoun; the
//     groups each kind is listed under; the subject is the push's words, with the slot in the afternoon.
// Run: npm run test:unit -- notificationText
import test from "node:test";
import assert from "node:assert/strict";
import { EMAIL_GROUPS, emailGroupOf, emailSubject, emailWords, groupWords, MODULE_NAMES, moduleName, notificationWords, NOTIFICATION_LANGUAGES, slotWords, testWords, type WordsData } from "../src/engine/notificationText";
import { NOTIFICATION_KINDS } from "../src/engine/notificationPlan";
import { ACCESS_MODULES } from "../src/engine/accessRules";
import { PLANT_DEPARTMENTS } from "../src/data/seed/documentDepartments";

const PEST: WordsData = { documentId: "daily-pest-monitoring", formatNo: "F/HR/17", documentName: "Daily Pest Control Monitoring Record", module: "HR", recordId: "rec-1", dueDate: "2026-10-09" };

const DATA: Record<string, WordsData> = {
  ready: PEST,
  needs_input: { ...PEST, count: 12 },
  due: PEST,
  upcoming: { ...PEST, dueDate: "2026-10-12" },
  overdue: { ...PEST, daysLate: 2 },
  verify: { ...PEST, by: "Vinay Bhojak" },
  sent_back: { ...PEST, by: "Super Admin", reason: "Sign the sheet" },
  boss_summary: { part: "morning", dueDate: "2026-10-09", modules: [{ module: "QC", ready: 2, needsInput: 3, awaitingVerification: 1, notSubmitted: 4, overdue: 5 }] },
  escalation: { subject: "Kapila Barad", module: "QC", late: 3, neverDone: 2 },
  access_changed: { module: "PRD", level: "write", by: "Super Admin" },
};

const SCRIPT = { en: /[A-Za-z]/, hi: /[ऀ-ॿ]/, gu: /[઀-૿]/ } as const;

test("every kind in every language: a title and a body, worded from the facts, in the language's script", () => {
  for (const kind of NOTIFICATION_KINDS) {
    assert.ok(DATA[kind], `a sample for ${kind}`);
    for (const lang of NOTIFICATION_LANGUAGES) {
      const w = notificationWords(kind, DATA[kind], lang);
      for (const [part, text] of Object.entries(w)) {
        const where = `${kind} ${lang} ${part}: ${text}`;
        assert.ok(text.trim().length > 3, where);
        assert.doesNotMatch(text, /undefined|NaN|null|\{|\}|\[object/, where);
        assert.doesNotMatch(text, /—/, `${where} (no em dash)`);
        if (lang === "en") assert.doesNotMatch(text, /\b(he|she|his|her|hers|him|himself|herself)\b/i, `${where} (no gendered pronoun)`);
      }
      assert.match(w.body, SCRIPT[lang], `${kind} ${lang}`);
    }
  }
});

test("the owner's sentence: 12 readings to enter for the Daily Pest Control Monitoring Record", () => {
  const en = notificationWords("needs_input", DATA.needs_input, "en");
  assert.equal(en.title, "12 readings to enter: Daily Pest Control Monitoring Record");
  assert.equal(en.body, "F/HR/17 Daily Pest Control Monitoring Record of 09-10-26 is ready for you: 12 readings to enter, then submit.");
  assert.match(notificationWords("needs_input", DATA.needs_input, "hi").title, /^12 रीडिंग भरनी हैं: /);
  assert.match(notificationWords("needs_input", DATA.needs_input, "gu").title, /^12 રીડિંગ ભરવાના બાકી: /);
  assert.match(notificationWords("needs_input", { ...PEST, count: 1 }, "en").title, /^1 reading to enter/);
  assert.match(notificationWords("needs_input", PEST, "en").title, /^To fill in: /, "no count: nothing invented");
});

test("the facts each kind carries are said: the days late, who submitted, the reason, the counts, the level", () => {
  assert.match(notificationWords("overdue", DATA.overdue, "en").body, /2 days late/);
  assert.match(notificationWords("overdue", { ...PEST, daysLate: 1 }, "en").body, /1 day late/);
  assert.match(notificationWords("verify", DATA.verify, "en").body, /^Vinay Bhojak submitted F\/HR\/17/);
  assert.match(notificationWords("sent_back", DATA.sent_back, "en").body, /Super Admin sent back .*: "Sign the sheet"\. Put it right/);
  const summary = notificationWords("boss_summary", DATA.boss_summary, "en");
  assert.equal(summary.title, "This morning's summary");
  assert.match(summary.body, /Ready to submit: 2\. Needing input: 3\. Awaiting verification: 1\. Not yet submitted today: 4\. Overdue: 5\. Most overdue: Quality Control \(5\)\./);
  assert.equal(notificationWords("boss_summary", { part: "evening", modules: [] }, "en").body, "Nothing is waiting in any module.");
  assert.match(notificationWords("escalation", DATA.escalation, "en").body, /^Kapila Barad: 3 late and 2 never done in the last 30 days\.$/);
  assert.match(notificationWords("access_changed", DATA.access_changed, "en").body, /You now have Write access to Production\./);
  assert.match(notificationWords("access_changed", { module: "PRD", level: "none" }, "gu").body, /ઉત્પાદન/);
  assert.match(notificationWords("ready", { ...PEST, formatNo: "TO BE CONFIRMED" }, "en").body, /^Daily Pest Control/, "a number still to be confirmed is not printed");
});

test("several in one push: N records need you, with the top three names", () => {
  const items = ["A", "B", "C", "D", "E"].map((x) => ({ kind: "due", data: { ...PEST, documentName: `Record ${x}` } }));
  assert.deepEqual(groupWords(items, "en"), { title: "5 records need you", body: "Record A, Record B, Record C and 2 more." });
  assert.match(groupWords(items, "hi").title, /^5 रिकॉर्ड/);
  assert.match(groupWords(items, "gu").body, /અને બીજા 2\.$/);
  assert.deepEqual(groupWords(items.slice(0, 1), "en"), notificationWords("due", items[0].data, "en"), "one item says its own words");
  for (const lang of NOTIFICATION_LANGUAGES) assert.match(testWords(lang).body, /DCRS/);
});

test("the day's two reminders say so, in each language: still open at 15:30, the last call at 17:45", () => {
  const items = ["A", "B"].map((x) => ({ kind: "ready", data: { ...PEST, documentName: `Record ${x}` } }));
  assert.deepEqual(slotWords("reminder", groupWords(items, "en"), "en"), { title: "Still open: 2 records need you", body: "Record A, Record B." });
  assert.equal(slotWords("lastCall", notificationWords("due", PEST, "en"), "en").title, "Last call: Due today: Daily Pest Control Monitoring Record");
  for (const lang of NOTIFICATION_LANGUAGES) {
    for (const slot of ["reminder", "lastCall"] as const) {
      const w = slotWords(slot, groupWords(items, lang), lang);
      assert.match(w.title, SCRIPT[lang], `${slot} ${lang}`);
      assert.doesNotMatch(w.title, /undefined|—/, `${slot} ${lang}`);
    }
  }
});

test("the ten modules are the plant's, named in each language; a language not known is English", () => {
  assert.deepEqual(Object.keys(MODULE_NAMES).sort(), [...ACCESS_MODULES].sort());
  for (const d of PLANT_DEPARTMENTS) {
    assert.equal(moduleName(d.code, "en"), d.name, d.code);
    assert.match(moduleName(d.code, "hi"), SCRIPT.hi, d.code);
    assert.match(moduleName(d.code, "gu"), SCRIPT.gu, d.code);
  }
  assert.deepEqual(notificationWords("ready", PEST, "fr"), notificationWords("ready", PEST, "en"));
  assert.equal(notificationWords("not-a-kind", PEST, "en").title, "DCRS");
});

test("the reminder email's own words, in each language: no em dash, no gendered pronoun, the language's script (the owner, 25-Oct-2026)", () => {
  const times = { reminder: "15:30", lastCall: "17:45" };
  for (const lang of NOTIFICATION_LANGUAGES) {
    const w = emailWords(lang);
    const texts = [
      w.hello("Kapila Barad"),
      w.hello(""),
      ...Object.values(w.intro),
      ...Object.values(w.groups),
      w.otherModule,
      w.more(3),
      w.openLink,
      w.openButton,
      w.openNoLink,
      ...(["morning", "reminder", "lastCall"] as const).map((s) => w.again(s, times)),
      w.why,
      w.testSubject,
      w.testBody,
    ];
    for (const text of texts) {
      assert.ok(text.trim().length > 1, `${lang}: ${text}`);
      assert.doesNotMatch(text, /—|undefined|NaN|\{|\}/, `${lang}: ${text}`);
      if (lang === "en") assert.doesNotMatch(text, /\b(he|she|his|her|hers|him|himself|herself)\b/i, text);
    }
    assert.match(w.intro.morning + w.why + w.groups.to_fill, SCRIPT[lang], lang);
    assert.ok(w.hello("Kapila Barad").includes("Kapila Barad"));
    assert.ok(w.more(3).includes("3"));
    assert.ok(w.again("morning", times).includes("15:30") && w.again("morning", times).includes("17:45"), lang);
    assert.ok(w.again("reminder", times).includes("17:45") && !w.again("reminder", times).includes("15:30"), lang);
  }
  assert.equal(emailWords("fr"), emailWords("en"), "a language not known is English");
  assert.deepEqual([...EMAIL_GROUPS], ["overdue", "sent_back", "to_fill", "verify", "upcoming"]);
  assert.deepEqual(
    ["overdue", "sent_back", "due", "needs_input", "ready", "verify", "upcoming", "boss_summary", "escalation", "access_changed"].map(emailGroupOf),
    ["overdue", "sent_back", "to_fill", "to_fill", "to_fill", "verify", "upcoming", null, null, null],
    "the summaries, the escalations and an access change are in no email"
  );
});

test("a reminder email's subject is the push's own words, with the slot in front in the afternoon", () => {
  const items = ["A", "B", "C"].map((x) => ({ kind: "due", data: { ...PEST, documentName: `Record ${x}` } }));
  assert.equal(emailSubject(items, "morning", "en"), "3 records need you");
  assert.equal(emailSubject(items, "reminder", "en"), "Still open: 3 records need you");
  assert.equal(emailSubject(items, "lastCall", "en"), "Last call: 3 records need you");
  assert.equal(emailSubject(items.slice(0, 1), "morning", "en"), "Due today: Record A");
  assert.match(emailSubject(items, "reminder", "gu"), /^હજી બાકી: 3 રેકોર્ડ/);
  assert.match(emailSubject(items, "lastCall", "hi"), /^आज की आख़िरी याद: 3 रिकॉर्ड/);
});
