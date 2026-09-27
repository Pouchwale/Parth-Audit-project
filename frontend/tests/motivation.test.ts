// MITRA'S PRAISE, THE STREAK AND THE BADGES (REQUIREMENTS §81).
//
// engine/motivation.ts works a person's day, streak and badges out of the
// records they keep, and picks the words Mitra says about them — the line under
// the reaction toast, the all-done card, what is said aloud, the Dashboard's day
// card. These tests hold it to a made-up fortnight whose every figure is known,
// and hold the words to what was promised: many lines, not one; English and
// Gujarati for every one; the figures a line names only when they are worth
// saying; never a document's or a module's name in a celebration; and a late
// record never scolded.
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, RecordInstance } from "../src/types";
import { STRINGS } from "../src/i18n/strings";
import { MOTIVATION_STRINGS } from "../src/i18n/strings.motivation";
import { plantClosedDays, type PlantCalendar } from "../src/engine/latenessCore";
import { purposeLine } from "../src/engine/purpose";
import {
  allDoneView,
  badgeFor,
  cheerLine,
  computeMotivation,
  dayGapScore,
  formatGapScore,
  gapScoreLine,
  gapScoreNote,
  gapTone,
  lateLine,
  motivationFor,
  newAchievements,
  outcomeOf,
  praiseLine,
  spokenAllDone,
  variantKeys,
  whenText,
  type MotivationStats,
  type PraiseKind,
} from "../src/engine/motivation";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { masterRepository } from "../src/data/repositories/masterRepository";
import { closedDays } from "../src/engine/performance";
import type { ReactionEvent } from "../src/engine/reactions";

// ---- A made-up fortnight ------------------------------------------------------------
//
// Saturday 26-Sep-2026. The plant's weekly off is Thursday (the 24th). Two daily
// sheets in two modules; everything of the week handed in on its day, and one
// late record on Friday the 18th — which is where the streak must stop.

const TODAY = "2026-09-26";
const CALENDAR: PlantCalendar = { isClosedDay: plantClosedDays({}), countedFrom: "2026-09-01" };

const doc = (id: string, module: string, schedule: DocumentDefinition["schedule"] = { type: "daily" }): DocumentDefinition =>
  ({
    id,
    kind: "log-sheet",
    name: `Sheet ${id.toUpperCase()}`,
    formatNo: `F/T/${id.toUpperCase()}`,
    revisionNo: "00",
    revisionDate: null,
    department: "QC",
    module,
    frequency: "Daily",
    status: "Configured",
    description: "",
    sourceFile: "",
    schedule,
  }) as DocumentDefinition;

const A = doc("a", "Module Alpha");
const B = doc("b", "Module Beta");
const DOCS = [A, B];

let n = 0;
/** A record due `due`; handed in on `on` at `hour`:00 (local time), or still open with `status`. */
function rec(d: DocumentDefinition, due: string, opts: { on?: string; hour?: number; status?: RecordInstance["status"] } = {}): RecordInstance {
  n += 1;
  const base = { id: `r-${d.id}-${due}-${n}`, documentId: d.id, periodKey: `${d.id}:${due}`, dueDate: due, isDemo: false, data: {}, createdAt: `${due}T00:30:00.000Z`, updatedAt: `${due}T12:00:00.000Z` };
  if (!opts.on) return { ...base, status: opts.status ?? "Due" } as RecordInstance;
  const [y, m, dd] = opts.on.split("-").map(Number);
  const at = new Date(y, m - 1, dd, opts.hour ?? 15, 5).toISOString();
  return {
    ...base,
    status: opts.status ?? "Pending Verification",
    submittedAt: at,
    submittedBy: "Asha Patel",
    history: [{ id: `h-${n}`, at, by: "Asha Patel", action: "submitted" }],
  } as RecordInstance;
}

const WEEK = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-25"];
function fortnight(): RecordInstance[] {
  const out: RecordInstance[] = [];
  // Last week's Friday: A handed in a day late.
  out.push(rec(A, "2026-09-18", { on: "2026-09-19" }));
  out.push(rec(B, "2026-09-18", { on: "2026-09-18" }));
  for (const day of WEEK) {
    out.push(rec(A, day, { on: day }));
    out.push(rec(B, day, { on: day }));
  }
  return out;
}

function stats(records: RecordInstance[], calendar: PlantCalendar = CALENDAR): MotivationStats {
  return computeMotivation({ docs: DOCS, records, today: TODAY, calendar, firstName: "Asha" });
}

// ---- The figures ------------------------------------------------------------------------

test("a finished day: everything counted, the streak steps over the weekly off and stops at the late record", () => {
  const s = stats([...fortnight(), rec(A, TODAY, { on: TODAY, hour: 10 }), rec(B, TODAY, { on: TODAY, hour: 14 })]);
  assert.deepEqual(s.day, { total: 2, done: 2, onTime: 2, late: 0, remaining: 0, overdue: 0, dueToday: 2 });
  // 21, 22, 23 and 25 (the 24th is Thursday, closed; the 19th and 20th had nothing due) — then the 18th was late.
  assert.equal(s.streakIncludesToday, true);
  assert.equal(s.streakDays, 5);
  // This month: 9 on time and 1 late before today, plus today's 2 → 11 on time of 12.
  assert.equal(s.judgedThisMonth, 12);
  assert.equal(s.onTimeThisMonth, Math.round((100 * 11) / 12));
  assert.equal(s.next, null);
  for (const k of ["first-on-time-today", "early-bird", "all-done-today", "streak-5", "clean-week"]) assert.ok(s.achievements.includes(k), `${k} missing from ${s.achievements.join(", ")}`);
  // Module Beta had nothing late this month; Module Alpha had the 18th.
  assert.ok(s.achievements.includes("module-hero:Module Beta"));
  assert.ok(!s.achievements.includes("module-hero:Module Alpha"));
});

test("a day under way: what is left, what is late, and the most urgent thing next", () => {
  const records = [...fortnight().filter((r) => !(r.documentId === "a" && r.dueDate === "2026-09-25")), rec(A, "2026-09-25", { status: "In Progress" }), rec(A, TODAY, { on: TODAY, hour: 12 }), rec(B, TODAY)];
  const s = stats(records);
  assert.deepEqual(s.day, { total: 3, done: 1, onTime: 1, late: 0, remaining: 2, overdue: 1, dueToday: 2 });
  // Yesterday's is still open, so it is overdue: the streak is broken at once, and today does not count yet.
  assert.equal(s.streakDays, 0);
  assert.equal(s.streakIncludesToday, false);
  assert.equal(s.next?.documentId, "a");
  assert.equal(s.next?.dueDate, "2026-09-25");
  assert.equal(s.next?.daysUntilDue, -1);
  assert.equal(s.next?.route, `/record/${s.next?.recordId}`);
  assert.equal(s.next?.what, "F/T/A Sheet A");
  assert.ok(s.achievements.includes("first-on-time-today"));
  assert.ok(!s.achievements.includes("all-done-today"));
  assert.ok(!s.achievements.includes("early-bird"), "handed in at noon is not early");
});

test("handed in late today counts as done and late, never as on time", () => {
  const s = stats([rec(A, "2026-09-23", { on: TODAY }), rec(A, TODAY, { on: TODAY })]);
  assert.equal(s.day.done, 2);
  assert.equal(s.day.late, 1);
  assert.equal(s.day.onTime, 1);
});

test("the streak never reaches back before the system went live", () => {
  const s = stats([...fortnight(), rec(A, TODAY, { on: TODAY }), rec(B, TODAY, { on: TODAY })], { ...CALENDAR, countedFrom: "2026-09-23" });
  // 23 and 25, and today.
  assert.equal(s.streakDays, 3);
  assert.ok(s.achievements.includes("streak-3"));
});

test("a day with nothing of theirs due is a free day, not a finished one", () => {
  const s = stats(fortnight());
  assert.equal(s.day.total, 0);
  assert.ok(!s.achievements.includes("all-done-today"));
  // The streak still stands, ending yesterday.
  assert.equal(s.streakDays, 4);
  assert.equal(s.streakIncludesToday, false);
});

test("a badge is new only until it has been celebrated today", () => {
  const s = stats([...fortnight(), rec(A, TODAY, { on: TODAY, hour: 9 }), rec(B, TODAY, { on: TODAY, hour: 9 })]);
  const celebrated = new Set(["first-on-time-today", "early-bird"]);
  const fresh = newAchievements(s, (k) => celebrated.has(k));
  assert.ok(!fresh.includes("early-bird") && !fresh.includes("first-on-time-today"));
  assert.ok(fresh.includes("all-done-today") && fresh.includes("streak-5"));
  // Remembered in the person's settings, for today only.
  settingsRepository.markDoneToday("celebratedToday", TODAY, "streak-5");
  assert.ok(!newAchievements(s).includes("streak-5"));
  assert.ok(newAchievements(s).includes("clean-week"));
});

// ---- Today's score, counted from what is missing -------------------------------------------
//
// "When some user is given 10 tasks for a day and completes 8 of them, his score
// will not be 80, it will be −20" (the plant, 27-Sep-2026).

test("today's score is round(done ÷ total × 100) − 100: 8 of 10 is −20, all done is 0, nothing done is −100", () => {
  assert.equal(dayGapScore(8, 10), -20);
  assert.ok(Object.is(dayGapScore(10, 10), 0), "all done is 0, never −0");
  assert.equal(dayGapScore(0, 4), -100);
  assert.ok(Object.is(dayGapScore(0, 0), 0), "nothing due is 0");
  assert.equal(dayGapScore(2, 3), -33);
  assert.equal(dayGapScore(1, 3), -67);
  assert.equal(dayGapScore(1, 2), -50);
  assert.equal(dayGapScore(3, 8), -62, "37.5 rounds up to 38, as Math.round does");
  // Never above 0, never below −100, whatever it is handed.
  assert.equal(dayGapScore(12, 10), 0);
  assert.equal(dayGapScore(-3, 10), -100);
  assert.equal(dayGapScore(5, -1), 0);
  assert.equal(dayGapScore(Number.NaN, 4), -100);
  // Only a day with nothing missing reads 0: 199 of 200 is not rounded up to perfect.
  assert.equal(dayGapScore(199, 200), -1);
  for (let total = 1; total <= 40; total++) {
    for (let done = 0; done <= total; done++) {
      const s = dayGapScore(done, total);
      assert.ok(Number.isInteger(s) && s <= 0 && s >= -100, `${done}/${total} → ${s}`);
      assert.equal(s === 0, done === total, `${done}/${total} → ${s}`);
      if (done < total) assert.ok(dayGapScore(done + 1, total) >= s, "one more done never lowers the score");
    }
  }
});

test("the score's tone: perfect at 0, close to −20, behind to −50, far below that — shown with a true minus sign", () => {
  assert.equal(gapTone(0), "perfect");
  assert.equal(gapTone(-1), "close");
  assert.equal(gapTone(-20), "close");
  assert.equal(gapTone(-21), "behind");
  assert.equal(gapTone(-50), "behind");
  assert.equal(gapTone(-51), "far");
  assert.equal(gapTone(-100), "far");
  assert.equal(formatGapScore(-20), "−20");
  assert.equal(formatGapScore(0), "0");
  assert.equal(formatGapScore(-100), "−100");
});

test("the day's figures carry today's score, from the same count as the ring", () => {
  const finished = stats([...fortnight(), rec(A, TODAY, { on: TODAY, hour: 10 }), rec(B, TODAY, { on: TODAY, hour: 14 })]);
  assert.equal(finished.gapScore, 0);
  // 1 of 3 on today's plate (yesterday's overdue one counts as missing too).
  const records = [...fortnight().filter((r) => !(r.documentId === "a" && r.dueDate === "2026-09-25")), rec(A, "2026-09-25", { status: "In Progress" }), rec(A, TODAY, { on: TODAY, hour: 12 }), rec(B, TODAY)];
  const underWay = stats(records);
  assert.equal(underWay.gapScore, dayGapScore(underWay.day.done, underWay.day.total));
  assert.equal(underWay.gapScore, -67);
  assert.equal(stats(fortnight()).gapScore, 0, "nothing due today: nothing missing");
  assert.equal(stats([rec(A, TODAY), rec(B, TODAY)]).gapScore, -100);
});

test("under the score, in both languages: what it means and how to reach 0 — and the same said aloud", () => {
  assert.equal(gapScoreNote(8, 10, "en"), "8 of 10 done — finish 2 more to reach 0.");
  assert.equal(gapScoreNote(9, 10, "en"), "9 of 10 done — finish 1 more to reach 0.");
  assert.equal(gapScoreNote(10, 10, "en"), "All done — nothing missing today.");
  assert.equal(gapScoreNote(0, 0, "en"), "Nothing due today — nothing missing.");
  assert.equal(gapScoreNote(8, 10, "gu"), "10 માંથી 8 પૂરાં — 0 સુધી પહોંચવા હજુ 2 પૂરાં કરો.");
  assert.equal(gapScoreNote(9, 10, "gu"), "10 માંથી 9 પૂરાં — 0 સુધી પહોંચવા હજુ 1 પૂરું કરો.");
  assert.ok(GUJARATI.test(gapScoreNote(10, 10, "gu")) && GUJARATI.test(gapScoreNote(0, 0, "gu")));

  assert.equal(gapScoreLine(8, 10, "en"), "You are at minus 20 today — finish 2 more to reach zero.");
  assert.equal(gapScoreLine(0, 4, "en"), "You are at minus 100 today — finish 4 more to reach zero.");
  assert.equal(gapScoreLine(2, 3, "en"), "You are at minus 33 today — finish 1 more to reach zero.");
  assert.equal(gapScoreLine(10, 10, "en"), "You are at zero today — nothing missing. Well done!");
  assert.ok(gapScoreLine(0, 0, "en").startsWith("Nothing is due for you today"), gapScoreLine(0, 0, "en"));
  assert.equal(gapScoreLine(8, 10, "gu"), "આજે તમે માઇનસ 20 પર છો — શૂન્ય સુધી પહોંચવા હજુ 2 પૂરાં કરો.");
  assert.equal(gapScoreLine(9, 10, "gu"), "આજે તમે માઇનસ 10 પર છો — શૂન્ય સુધી પહોંચવા હજુ 1 પૂરું કરો.");
  for (const [d, t] of [[10, 10], [0, 0]] as const) assert.ok(GUJARATI.test(gapScoreLine(d, t, "gu")) && !/[A-Za-z]{3}/.test(gapScoreLine(d, t, "gu")));
  for (const s of [gapScoreLine(8, 10, "en"), gapScoreLine(8, 10, "gu"), gapScoreNote(8, 10, "en")]) assert.ok(!/[{}]/.test(s), s);
});

// ---- The words ------------------------------------------------------------------------------

const KINDS: PraiseKind[] = ["onTime", "asRequired", "again", "verified", "sentBack", "dayDone", "allDone", "streak", "earlyBird", "cleanWeek", "moduleHero", "progress", "dayHappy", "nothingDue", "sayAllDone", "sayStreak"];
const GUJARATI = /[઀-૿]/;
const placeholders = (s: string) => Array.from(s.matchAll(/\{(\w+)\}/g), (m) => m[1]).sort().join(",");

test("every line is in English and Gujarati, with the same figures in both", () => {
  const { en, gu } = MOTIVATION_STRINGS as unknown as { en: Record<string, string>; gu: Record<string, string> };
  for (const key of Object.keys(en)) {
    assert.ok(key.startsWith("cheer."), `${key} is not a cheer.* key`);
    assert.ok(gu[key] && gu[key].trim(), `${key} has no Gujarati`);
    assert.equal(placeholders(gu[key]), placeholders(en[key]), `${key}: the Gujarati names different figures`);
    if (/[A-Za-z]{3}/.test(en[key].replace(/\{\w+\}/g, ""))) assert.ok(GUJARATI.test(gu[key]), `${key}: the Gujarati is not in Gujarati script — ${gu[key]}`);
    for (const s of [en[key], gu[key]]) assert.ok(!/sign up|demo/i.test(s), `${key} says "sign up" or "demo"`);
  }
  // Spread into the app's own tables.
  assert.equal((STRINGS.en as Record<string, string>)["cheer.day.next"], "Go to the next one");
});

// A streak's lines are only ever said about a streak: they are asked with one.
const WITH_A_STREAK: PraiseKind[] = ["streak", "sayStreak"];

test("many lines, not one — and every kind can always say something", () => {
  assert.ok(variantKeys("cheer.onTime").length >= 10);
  assert.ok(variantKeys("cheer.allDone").length >= 8);
  const streaky = stats([...fortnight(), rec(A, TODAY, { on: TODAY }), rec(B, TODAY, { on: TODAY })]);
  for (const kind of KINDS) {
    for (const lang of ["en", "gu"] as const) {
      const line = praiseLine(kind, WITH_A_STREAK.includes(kind) ? streaky : null, lang, "any");
      assert.ok(line.length > 0, `${kind} (${lang}) said nothing`);
      assert.ok(!/[{}]/.test(line), `${kind} (${lang}) left a placeholder: ${line}`);
    }
  }
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) seen.add(praiseLine("onTime", null, "en", `seed-${i}`));
  assert.ok(seen.size >= 6, `only ${seen.size} different on-time lines over 60 moments`);
  // The same moment always reads the same way.
  assert.equal(praiseLine("allDone", null, "en", "2026-09-26|r1"), praiseLine("allDone", null, "en", "2026-09-26|r1"));
});

test("a figure is named only when it is worth saying, and a missing name leaves no stray comma", () => {
  const one = stats([rec(A, TODAY, { on: TODAY })]);
  for (let i = 0; i < 40; i++) {
    const line = praiseLine("allDone", { ...one, firstName: "" }, "en", `s${i}`);
    assert.ok(!/\{|\}|, [.!]|^,|\s,/.test(line), `badly filled: "${line}"`);
    assert.ok(!/^1 records/.test(line), line);
    assert.ok(/^[A-Z0-9🌟]/u.test(line), `does not start with a capital: "${line}"`);
  }
  const streaky = stats([...fortnight(), rec(A, TODAY, { on: TODAY }), rec(B, TODAY, { on: TODAY })]);
  const lines = new Set<string>();
  for (let i = 0; i < 40; i++) lines.add(praiseLine("streak", streaky, "en", `s${i}`));
  for (const l of lines) assert.ok(l.includes("5"), `a streak line without the streak: ${l}`);
});

test("praise in Gujarati is Gujarati, and picks the same line as the English", () => {
  const s = stats([...fortnight(), rec(A, TODAY, { on: TODAY }), rec(B, TODAY, { on: TODAY })]);
  for (const kind of KINDS) {
    const gu = praiseLine(kind, s, "gu", "x");
    assert.ok(GUJARATI.test(gu), `${kind}: ${gu}`);
  }
  const en = praiseLine("onTime", s, "en", "x");
  const idx = variantKeys("cheer.onTime").find((k) => (STRINGS.en as Record<string, string>)[k].replace("{name}", "Asha") === en);
  assert.ok(idx, "the English line is one of the variants");
});

test("a late record is never scolded, and is told when the next one is due", () => {
  const cases: [number, string | null][] = [
    [1, TODAY],
    [2, "2026-09-27"],
    [3, "2026-10-02"],
    [1, null],
  ];
  for (const [days, nextDue] of cases) {
    const line = lateLine("late", { days, nextDue, today: TODAY }, "en", `${days}`);
    assert.ok(line.startsWith(days === 1 ? "Done — a day late this time" : `Done — ${days} days late this time`), line);
    assert.ok(!/\b(should|must|failed|bad|careless|again\?|why)\b/i.test(line), `scolding: ${line}`);
    if (nextDue === TODAY) assert.ok(line.includes("due today"), line);
    if (nextDue === "2026-09-27") assert.ok(line.includes("due tomorrow"), line);
    if (nextDue === "2026-10-02") assert.ok(line.includes("02-Oct-2026"), line);
    assert.ok(GUJARATI.test(lateLine("late", { days, nextDue, today: TODAY }, "gu", `${days}`)));
  }
  assert.equal(lateLine("waiting", { count: 3, today: TODAY }, "en"), "3 are waiting from earlier days — clearing them keeps the file whole.");
  assert.equal(whenText("2026-09-24", TODAY, "en"), "2 days late");
  assert.equal(whenText(TODAY, TODAY, "en"), "due today");
  assert.equal(whenText("2026-09-27", TODAY, "en"), "due tomorrow");
});

// ---- Under the toast --------------------------------------------------------------------------

const submitted = (over: Partial<Extract<ReactionEvent, { kind: "submitted" }>> = {}): ReactionEvent => ({
  kind: "submitted",
  what: "F/T/A Sheet A — 26-Sep-2026",
  dueDate: TODAY,
  on: TODAY,
  asRequired: false,
  documentId: "a",
  recordId: "r-x",
  ...over,
});

test("the line under the toast: a count and a streak, the module's purpose for the first one, a gentle word for a late one", () => {
  const busy = stats([...fortnight(), rec(A, TODAY, { on: TODAY }), rec(B, TODAY, { on: TODAY })]);
  const ctx = { stats: busy, lang: "en" as const, today: TODAY, moduleOf: (id: string) => DOCS.find((d) => d.id === id)?.module, nextDueOf: () => "2026-09-27" };
  const counted = cheerLine([submitted()], ctx) ?? "";
  assert.ok(counted.startsWith("🔥 2 on time today — a 5-day streak. "), counted);

  const first = stats([rec(A, TODAY, { on: TODAY })]);
  const firstLine = cheerLine([submitted()], { ...ctx, stats: first }) ?? "";
  assert.ok(firstLine.startsWith("✨ "), firstLine);
  assert.equal(firstLine.slice(2).trim(), purposeLine("Module Alpha", "en", `${TODAY}|r-x`));

  const late = cheerLine([submitted({ dueDate: "2026-09-23" })], ctx) ?? "";
  assert.ok(late.startsWith("💪 Done — 3 days late this time; the next one is due tomorrow"), late);

  assert.ok((cheerLine([submitted({ lastOneDue: true })], ctx) ?? "").startsWith("✨"));
  assert.ok((cheerLine([{ kind: "verified", what: "x" }], ctx) ?? "").startsWith("👏 "));
  assert.ok((cheerLine([{ kind: "rejected", what: "x", reason: "wrong date" }], ctx) ?? "").startsWith("🙏 "));
  assert.ok((cheerLine([submitted({ asRequired: true })], ctx) ?? "").startsWith("📝 "));
  assert.ok((cheerLine([submitted({ again: true })], ctx) ?? "").startsWith("🔧 "));
  const seven = Array.from({ length: 7 }, (_, i) => submitted({ recordId: `r${i}`, on: i === 6 ? "2026-09-27" : TODAY }));
  assert.ok((cheerLine(seven, ctx) ?? "").startsWith("🔥 2 on time today"));
  assert.ok(GUJARATI.test(cheerLine([submitted()], { ...ctx, lang: "gu" }) ?? ""));
  assert.equal(cheerLine([], ctx), null);
});

test("one press, several records: what the batch amounted to", () => {
  const o = outcomeOf([submitted(), submitted({ dueDate: "2026-09-20" }), submitted({ asRequired: true }), submitted({ again: true, lastOneDue: true }), { kind: "verified", what: "x" }, { kind: "rejected", what: "y", reason: "z" }]);
  assert.deepEqual(o, { onTime: 1, late: 1, plain: 1, again: 1, verified: 1, sentBack: 1, lastOneDue: true });
});

// ---- The celebration's own words --------------------------------------------------------------

test("the all-done card and what is said aloud: the first name, the count, the streak — and no document or module", () => {
  const s = stats([...fortnight(), rec(A, TODAY, { on: TODAY, hour: 9 }), rec(B, TODAY, { on: TODAY, hour: 9 })]);
  const fresh = newAchievements(s, () => false);
  const view = allDoneView(s, fresh, "en", "seed");
  assert.equal(view.title, "🌟 All done for today, Asha!");
  assert.equal(view.score, "Today's score: 0 — nothing missing");
  assert.equal(allDoneView(s, fresh, "gu", "seed").score, "આજનો સ્કોર: 0 — કંઈ ખૂટતું નથી");
  assert.equal(view.count, "2 records handed in today");
  assert.equal(view.streak, "🔥 5-day streak");
  assert.equal(view.onTime, `${s.onTimeThisMonth}% on time this month`);
  assert.ok(view.badges.some((b) => b.key === "streak-5" && b.label === "5-day streak"));
  assert.ok(!view.badges.some((b) => b.key === "all-done-today" || b.key === "first-on-time-today"), "the card's own title says those");
  // What the card prints.
  const words = [view.title, view.score, view.count, view.streak, view.onTime ?? "", view.praise, view.purpose, ...view.badges.map((b) => `${b.emoji} ${b.label}`)].join(" | ");
  for (const d of DOCS) for (const name of [d.name, d.formatNo, d.module]) assert.ok(!words.includes(name), `the card names ${name}: ${words}`);
  assert.equal(badgeFor("module-hero:Module Beta", "en").label, "Module hero");

  const said = spokenAllDone(s, "en", "seed");
  assert.ok(said.includes("Asha") && said.includes("2 records handed in today") && said.includes("5 days in a row"), said);
  assert.ok(said.length <= 600, "the speak route takes 600 characters at most");
  const gu = allDoneView(s, fresh, "gu", "seed");
  assert.equal(gu.title, "🌟 આજનું બધું પૂરું, Asha!");
  assert.ok(GUJARATI.test(spokenAllDone(s, "gu", "seed")));
  // Nobody known: no stray comma.
  assert.equal(allDoneView({ ...s, firstName: "" }, [], "en").title, "🌟 All done for today!");
  assert.equal(allDoneView(null, [], "en").streak, "🔥 A fresh streak starts tomorrow");
});

// ---- From the repositories, remembered ----------------------------------------------------------

test("the signed-in person's figures come from the stored records, and are worked out once per change", () => {
  ensureDocumentsSeeded();
  const daily = documentRepository.getRecordable().find((d) => d.schedule.type === "daily" && d.kind === "log-sheet");
  assert.ok(daily, "a daily log sheet in the seeded library");
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const open = { ...rec(daily!, iso), documentId: daily!.id, id: "live-today" } as RecordInstance;
  recordRepository.upsert(open);
  const first = motivationFor({ name: "Asha Patel" });
  assert.equal(motivationFor({ name: "Asha Patel" }), first, "asked twice with nothing changed, the walk is not done again");
  const closed = closedDays(masterRepository.get())(iso);
  if (!closed) {
    assert.ok(first.day.remaining >= 1);
    assert.equal(first.next?.recordId !== undefined, true);
  }
  recordRepository.upsert({ ...open, status: "Pending Verification", submittedAt: new Date().toISOString(), history: [{ id: "h", at: new Date().toISOString(), by: "Asha Patel", action: "submitted" }] } as RecordInstance);
  const after = motivationFor({ name: "Asha Patel" });
  assert.notEqual(after, first, "a change to the records is seen at once");
  assert.equal(after.day.done, first.day.done + 1);
  assert.equal(after.firstName, "Asha");
});

// ---- The confetti never widens the page ----------------------------------------------------------

test("a burst is 18 pieces fanning up and right from the toast's corner, rain 36 across the width — all inside a phone's screen", async () => {
  const { confettiPieces } = await import("../src/components/common/Celebration");
  const px = (v: string | undefined) => Number(String(v).replace(/px$/, ""));
  for (let seed = 1; seed <= 20; seed++) {
    const burst = confettiPieces("burst", seed);
    assert.equal(burst.length, 18);
    for (const p of burst) {
      // It starts 48 px in from the left; a 390 px phone leaves 342 px to the right.
      assert.ok(px(p["--dx"]) >= 0 && px(p["--dx"]) * 1.15 <= 342, `too far right: ${p["--dx"]}`);
      assert.ok(px(p["--dy"]) > 0, "a burst goes up");
      assert.match(String(p["--d"]), /^\d+ms$/);
    }
    const rain = confettiPieces("rain", seed);
    assert.equal(rain.length, 36);
    for (const p of rain) {
      const x = Number(String(p["--x"]).replace(/%$/, ""));
      assert.ok(x >= 0 && x <= 100, `off the screen: ${p["--x"]}`);
      assert.ok(Number(String(p["--t"]).replace(/ms$/, "")) + Number(String(p["--d"]).replace(/ms$/, "")) <= 2700, "rain is over before it is taken away");
    }
  }
});
