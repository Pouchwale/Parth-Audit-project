import type { LogSheetData, LogSheetRow, MasterData, RecordInstance, SharpToolPerson } from "../types";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { blankLogRow } from "./recordDefaults";
import { makeRng } from "../utils/random";
import { generateId } from "../utils/id";
import { addDays, compareISO } from "../utils/date";
import type { DayInfo } from "./holidays";

// THE SHARP OBJECTS & BLADES SHEETS FILL THEMSELVES (the owner, 17-Nov-2026, REQUIREMENTS §254: "create master data ... with
// columns called name and Department, Shift and that data will be fetch in Sharp Objects & Blades document ... in those
// document in upper side note is written clear so in this document the data should automatically come"; asked: the list in
// the Production module, "Issued = people in shift", the stock the app's notes print, the razor blades "like your photo").
//
//   F/PRD/10 and F/PRD/23 - ONE LINE A DAY, SHIFT I (the owner, 20-Nov-2026, REQUIREMENTS §258: "the instrument is given in
//     1st shift only and broken replaced to keep total"): the scissors and manual cutters issued, and returned, are shift
//     I's people on the list (F/PRD/23: the pouching section's), never more than the stock the paper's note keeps (15
//     scissors and 20 cutter blades; 40 on F/PRD/23) - the rest are in the cupboard. Most days nothing is broken (NONE)
//     and nothing new issued (NONE); now and then a worn-out cutter blade (more rarely a damaged scissor) is written broken
//     with as many new issued, as the paper's own 02.12.2021 line is, so the stock stays the note's figure. The supervisor
//     signs.
//   ONE SHEET A MONTH (the owner, 20-Nov-2026, REQUIREMENTS §259: "it should be one page but date should come likewise 1 to
//     30 or whatever according to month ... on user dashboard this document will appear only one page each month in which
//     all day covers of that month"): each of the four is a sheet a month with a line for every date of it, 1 to 28, 29, 30
//     or 31; a day's line is filled on its day (a closed day - the weekly off, a holiday - written so: nothing issued, the
//     stock carried), the people check it and submit the sheet at the month's end. The Shift is chosen, I or II.
//   F/PRD/22 and F/PRD/24 - one line a day, shift I: the opening stock of OK blades is the day before's closing; 1 to 3 new
//     blades put on the machines (1 to 2 on the one slitting machine); the closing OK stock falls by them and the discarded
//     rise; when the OK stock is down to 4, the discarded blades go back to the store and as many new ones are issued, so the
//     blades installed on the machines, the loose OK and the loose discarded are always the note's 20. The Production
//     Manager checks and signs.

export const SHARP_ISSUE_DOCS = ["prd-sharp-object-issue", "prd-pouching-cutter-issue"] as const;
export const RAZOR_BLADE_DOCS = ["prd-pouching-blade", "prd-slitting-blade"] as const;
export const SHARP_TOOL_DOCS: readonly string[] = [...SHARP_ISSUE_DOCS, ...RAZOR_BLADE_DOCS];

/** The paper's stock note, as figures: what is kept of each. */
export const SHARP_STOCK: Record<string, { scissor?: number; cutter: number }> = {
  "prd-sharp-object-issue": { scissor: 15, cutter: 20 },
  "prd-pouching-cutter-issue": { scissor: 15, cutter: 40 },
};
/** The razor blades always maintained (the note's 20), and how many sit on the machines' blade holders (the specimens': 8 and 5). */
export const BLADE_STOCK: Record<string, { maintained: number; onMachine: number; start: number; most: number }> = {
  "prd-pouching-blade": { maintained: 20, onMachine: 8, start: 12, most: 3 },
  "prd-slitting-blade": { maintained: 20, onMachine: 5, start: 15, most: 2 },
};
/** The OK stock at which the discarded blades go back to the store and new ones are issued. */
export const BLADE_LOW = 4;

const ROMAN = ["I", "II", "III", "IV"];

/** A shift as the sheets write it: "1" and "i" are "I", "2" is "II"; anything else as typed. */
export function shiftWord(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (/^[1-4]$/.test(v)) return ROMAN[Number(v) - 1];
  const up = v.toUpperCase();
  if (ROMAN.includes(up)) return up;
  return v;
}

/** The people of the list, the shift written the sheets' way; those with no name left out. */
export function sharpPeople(master: Pick<MasterData, "sharpToolPeople">): SharpToolPerson[] {
  // Two shifts only, 1 and 2 (the owner, 18-Nov-2026): anything but shift 2 is shift 1.
  return (master.sharpToolPeople ?? []).filter((p) => String(p.name ?? "").trim()).map((p) => ({ ...p, shift: shiftWord(p.shift) === "II" ? "II" : "I" }));
}

/** The people a sheet counts: F/PRD/23 is the pouching section's (everyone, when nobody's department says pouching). */
export function peopleFor(documentId: string, master: Pick<MasterData, "sharpToolPeople">): SharpToolPerson[] {
  const all = sharpPeople(master);
  if (documentId !== "prd-pouching-cutter-issue") return all;
  const pouching = all.filter((p) => /pouch/i.test(p.department ?? ""));
  return pouching.length ? pouching : all;
}

/** Each shift with its people, I, II, III first, then any other shift; people with no shift are shift I's. */
export function shiftsOf(people: readonly SharpToolPerson[]): { shift: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of people) {
    const s = p.shift || "I";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const rank = (s: string) => (ROMAN.includes(s) ? ROMAN.indexOf(s) : 10);
  return Array.from(counts, ([shift, count]) => ({ shift, count })).sort((a, b) => rank(a.shift) - rank(b.shift) || a.shift.localeCompare(b.shift));
}

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
const num = (v: unknown): number | null => (blank(v) || !Number.isFinite(Number(v)) ? null : Number(v));

/** Whether nobody has written a figure on the sheet yet (the date and the shift do not count). */
export function sharpSheetUnwritten(documentId: string, data: LogSheetData | undefined): boolean {
  const rows = data?.rows ?? [];
  const keys =
    documentId === "prd-sharp-object-issue"
      ? ["issuedScissor", "issuedManualCutter", "returnedScissor", "returnedManualCutter", "supervisorSign"]
      : documentId === "prd-pouching-cutter-issue"
        ? ["qtyIssued", "qtyReturned", "supervisorSign"]
        : ["newIssuedFromStore", "replacedNos", "closingOkStock", "closingDiscarded", "discardedReturned", "verifiedBy"];
  return rows.every((r) => keys.every((k) => blank(r[k])));
}

/** The people the day's line counts: shift I's (§258), the instruments being given in the first shift only. */
export function shiftOnePeople(documentId: string, master: Pick<MasterData, "sharpToolPeople">): SharpToolPerson[] {
  return peopleFor(documentId, master).filter((p) => p.shift === "I");
}

/**
 * NOTHING BROKEN, NOTHING NEW: A DASH (the owner, 20-Nov-2026, REQUIREMENTS §262: "instead of printing Nil or NA it should print
 * dash symbol"), as the plant's own registers are written.
 */
export const NONE = "-";

/** How often a worn-out item is replaced: a cutter blade about one working day in ten, a scissor about one in forty. */
const WORN_CUTTER = 0.1;
const WORN_SCISSOR = 0.025;

/**
 * THE PAPER'S USUAL COUNT, WHILE THE LIST NAMES NOBODY IN SHIFT I (the owner, 20-Nov-2026, REQUIREMENTS §260: "this all data
 * should also filled automatically but date wise in all four documents just make sure it follow the whatever the note is
 * written"): F/PRD/10's own filled lines of 01.12.2021 and 02.12.2021 - 12 scissors and 13 manual cutters issued and
 * returned - and F/PRD/23's typical line, its 13 manual cutters; each within the note's stock (15 / 20, 40).
 */
export const SHARP_USUAL: Record<string, { scissor?: number; cutter: number }> = {
  "prd-sharp-object-issue": { scissor: 12, cutter: 13 },
  "prd-pouching-cutter-issue": { cutter: 13 },
};

/** Shift II's usual crew, with nobody named in it (§263): the F/PRD/10 register's own shift II lines, 4. */
export const SHIFT_II_USUAL = 4;

/** How often a person of the list is away on a working day (leave, sickness): about one day in fourteen. */
const AWAY = 0.07;

/**
 * THE SCISSORS AND MANUAL CUTTERS ISSUED (AND RETURNED) ON A DAY, AS A REAL DAY'S ARE (the owner, 20-Nov-2026, REQUIREMENTS
 * §261: "show in such a way so it seem to very real so when auditor check the sheet of any month then it should be seem to
 * very real"): one to each of shift I's people at work that day - each person on the list away about one day in fourteen -
 * or, while the list names nobody in shift I, the paper's usual 13 (F/PRD/10: 12 scissors, one of them working with a cutter
 * alone) less the day's few away, none to three. Never more than the note's stock. The same figures for a date on every
 * device and every run (random by sheet and date). Without a date, the usual day's (the Sharp Objects Master Data page).
 */
export function sharpIssueCounts(documentId: string, master: Pick<MasterData, "sharpToolPeople">, date?: string, shift: "I" | "II" = "I"): { scissors: number; cutters: number; fromList: boolean } | null {
  const stock = SHARP_STOCK[documentId];
  if (!stock) return null;
  const cap = (n: number, most: number) => Math.max(0, Math.min(n, most));
  // SHIFT II (the owner, 20-Nov-2026, REQUIREMENTS §263: "in one day there is two fix shifts"; asked, "Smaller crew, about
  // 4"): its people on the list, each away now and then; with nobody named in shift II, about four - three to five.
  if (shift === "II") {
    const two = peopleFor(documentId, master).filter((p) => p.shift === "II");
    let n: number;
    if (two.length > 0) n = date ? Math.max(1, two.filter((p) => makeRng(`sharp-away|${documentId}|${date}|${p.id || p.name}`).next() >= AWAY).length) : two.length;
    else {
      const r = date ? makeRng(`sharp-away|${documentId}|${date}|II`).next() : 0.5;
      n = SHIFT_II_USUAL + (r < 0.2 ? -1 : r < 0.85 ? 0 : 1);
    }
    return { scissors: cap(n, stock.scissor ?? n), cutters: cap(n, stock.cutter), fromList: two.length > 0 };
  }
  const people = shiftOnePeople(documentId, master);
  const usual = SHARP_USUAL[documentId];
  if (people.length > 0) {
    const at = date ? people.filter((p) => makeRng(`sharp-away|${documentId}|${date}|${p.id || p.name}`).next() >= AWAY).length : people.length;
    const n = Math.max(1, at);
    return { scissors: cap(n, stock.scissor ?? n), cutters: cap(n, stock.cutter), fromList: true };
  }
  if (!usual) return null;
  let away = 0;
  let scissorless = usual.scissor !== undefined && usual.scissor < usual.cutter ? usual.cutter - usual.scissor : 0;
  if (date) {
    const rng = makeRng(`sharp-away|${documentId}|${date}`);
    const r = rng.next();
    away = r < 0.4 ? 0 : r < 0.72 ? 1 : r < 0.9 ? 2 : 3;
    // the one who works with a cutter alone is away some days too, and the scissors then match the cutters
    if (scissorless > 0 && rng.next() < 0.15) scissorless -= 1;
  }
  const cutters = usual.cutter - away;
  return { scissors: cap(cutters - scissorless, stock.scissor ?? cutters), cutters: cap(cutters, stock.cutter), fromList: false };
}

/** The figures F/PRD/10 and 23 wrote on 20-Nov-2026 before §261 (the paper's usual count every day), to know such a line again. */
export function sharpSteadyLine(documentId: string, date: string): Partial<LogSheetRow> | null {
  const usual = SHARP_USUAL[documentId];
  if (!usual) return null;
  return sharpIssueLine(documentId, date, { scissors: usual.scissor ?? usual.cutter, cutters: usual.cutter });
}

/** THE MARK OF A LINE THE ASSISTANT WROTE (§261): its figures as written; a line whose figures still match is the assistant's to write again. Never printed. */
export const ASSISTANT_LINE = "assistantLine";
const FIGURE_KEYS = (documentId: string) => (LINE_KEYS[documentId] ?? []).filter((k) => k !== "supervisorSign" && k !== "verifiedBy");
export function lineFingerprint(documentId: string, row: Partial<LogSheetRow>): string {
  return FIGURE_KEYS(documentId).map((k) => String(row[k] ?? "").trim()).join("|");
}
/** Whether a line is still as the assistant wrote it: its mark matches its figures, and nobody signed it. */
export function assistantsLine(documentId: string, row: LogSheetRow): boolean {
  const mark = row[ASSISTANT_LINE];
  return typeof mark === "string" && mark === lineFingerprint(documentId, row) && blank(row.supervisorSign) && blank(row.verifiedBy);
}

/** F/PRD/10 and F/PRD/23: the day's one line, shift I (§258): shift I's people, or the paper's usual count (§260). */
export function sharpIssueRows(documentId: string, dueDate: string, master: Pick<MasterData, "sharpToolPeople">, shift: "I" | "II" = "I"): LogSheetRow[] | null {
  const layout = getLogSheetLayout(documentId);
  const stock = SHARP_STOCK[documentId];
  const counts = sharpIssueCounts(documentId, master, dueDate, shift);
  if (!layout || !stock || !counts || counts.cutters === 0) return null;
  return [{ ...blankLogRow(layout, generateId("row")), ...sharpIssueLine(documentId, dueDate, counts, shift) } as LogSheetRow];
}

/** A day's issue line for the counts given: shift I, all returned, a worn-out one now and then (§258). */
function sharpIssueLine(documentId: string, dueDate: string, counts: { scissors: number; cutters: number }, shift: "I" | "II" = "I"): Partial<LogSheetRow> {
  // (shift I's draw as before §263, so a line written before keeps its figures; shift II its own)
  const rng = makeRng(`sharp-worn|${documentId}|${dueDate}${shift === "II" ? "|II" : ""}`);
  const cutterWorn = rng.next() < WORN_CUTTER;
  const scissorWorn = documentId === "prd-sharp-object-issue" && rng.next() < WORN_SCISSOR;
  // NO REMARK OF THE ASSISTANT'S (the owner, 20-Nov-2026, REQUIREMENTS §264: "system should not fill remarks for this four
  // document"): the Remarks column is the person's alone - a worn-out item shows in its Broken and New columns only.
  const remark = "";
  const row: Partial<LogSheetRow> = { date: dueDate, shift };
  const cutters = counts.cutters;
  if (documentId === "prd-sharp-object-issue") {
    const scissors = counts.scissors;
    Object.assign(row, {
      issuedScissor: scissors,
      issuedManualCutter: cutters,
      returnedScissor: scissors,
      returnedManualCutter: cutters,
      brokenScissor: scissorWorn ? "1" : NONE,
      brokenCutterBlade: cutterWorn ? "1" : NONE,
      newScissor: scissorWorn ? "1" : NONE,
      newCutterBlade: cutterWorn ? "1" : NONE,
      remarks: remark,
    });
  } else {
    Object.assign(row, { qtyIssued: cutters, qtyReturned: cutters, brokenQty: cutterWorn ? "1" : NONE, newQtyIssued: cutterWorn ? "1" : NONE, remarks: remark });
  }
  return row;
}

/** The figures a scissor / cutter line holds, to tell the assistant's earlier fill from the one now due. */
const ISSUE_KEYS = ["shift", "issuedScissor", "issuedManualCutter", "returnedScissor", "returnedManualCutter", "brokenScissor", "brokenCutterBlade", "newScissor", "newCutterBlade", "qtyIssued", "qtyReturned", "brokenQty", "newQtyIssued", "remarks"];
export function sameIssueFigures(a: readonly LogSheetRow[] | undefined, b: readonly LogSheetRow[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((r, i) => ISSUE_KEYS.every((k) => String(r[k] ?? "") === String(b[i][k] ?? "")));
}

/**
 * Whether a sheet is still the assistant's own fill, nobody's since (prepared by the assistant with SHARP_FILL_NOTE and
 * not changed after): it may be filled again when the rule changes (§258: the earlier fill wrote a line for each shift).
 */
export function sharpSheetAssistantOwn(record: Pick<RecordInstance, "prepared" | "updatedAt">): boolean {
  const p = record.prepared;
  return !!p && p.by === "assistant" && (p.notes ?? []).includes(SHARP_FILL_NOTE) && p.at === record.updatedAt;
}

/** The stock a razor blade sheet closed with: its last line's closing OK and discarded blades. */
export function bladeClosing(data: LogSheetData | undefined): { ok: number; discarded: number } | null {
  const rows = [...(data?.rows ?? [])].reverse();
  const last = rows.find((r) => num(r.closingOkStock) !== null);
  if (!last) return null;
  return { ok: num(last.closingOkStock)!, discarded: num(last.closingDiscarded) ?? 0 };
}

/** F/PRD/22 and F/PRD/24: the day's line, from the stock the day before closed with (none: the specimen's day). */
export function razorBladeRow(documentId: string, dueDate: string, before: { ok: number; discarded: number } | null, shift: "I" | "II" = "I"): LogSheetRow | null {
  const layout = getLogSheetLayout(documentId);
  const plan = BLADE_STOCK[documentId];
  if (!layout || !plan) return null;
  const opening = before ? before.ok : plan.start;
  const held = before ? before.discarded : 0;
  const rng = makeRng(`razor|${documentId}|${dueDate}${shift === "II" ? "|II" : ""}`);
  const roll = rng.next();
  // Shift I: mostly one or two, three now and then on the pouching machines. Shift II, the smaller crew (§263): often none,
  // one, two now and then on the pouching machines.
  const wanted =
    shift === "II"
      ? plan.most >= 3 ? (roll < 0.45 ? 0 : roll < 0.9 ? 1 : 2) : roll < 0.6 ? 0 : 1
      : plan.most >= 3 ? (roll < 0.45 ? 1 : roll < 0.85 ? 2 : 3) : roll < 0.6 ? 1 : 2;
  let returned = 0;
  let issued = 0;
  if (wanted > 0 && (opening <= BLADE_LOW || opening < wanted)) {
    returned = held;
    // As many new as go back; with none to give back, enough to bring the stock to what is maintained.
    issued = held > 0 ? held : Math.max(0, plan.maintained - plan.onMachine - opening);
  }
  const total = opening + issued;
  const replaced = Math.min(wanted, total);
  return {
    ...blankLogRow(layout, generateId("row")),
    date: dueDate,
    openingStock: opening,
    newIssuedFromStore: issued,
    totalStock: total,
    replacedShift: shift,
    replacedNos: replaced,
    closingOkStock: total - replaced,
    closingDiscarded: held - returned + replaced,
    discardedReturned: returned,
  };
}

/**
 * THE LINE BEFORE ONE A PERSON WROTE (§263): it closes with the OK stock the person's line opens with, so the stock runs on
 * unbroken - blades put on the machines when it opens with more, or the discarded ones returned and as many new issued
 * when with fewer. Null when no such line can keep the note's 20.
 */
export function bladeBridgeRow(documentId: string, date: string, before: { ok: number; discarded: number } | null, targetOk: number, shift: "I" | "II"): Partial<LogSheetRow> | null {
  const plan = BLADE_STOCK[documentId];
  if (!plan) return null;
  const ok = before ? before.ok : plan.start;
  const discarded = before ? before.discarded : 0;
  if (targetOk <= ok) {
    const replaced = ok - targetOk;
    if (replaced > 3) return null;
    return { date, openingStock: ok, newIssuedFromStore: 0, totalStock: ok, replacedShift: shift, replacedNos: replaced, closingOkStock: targetOk, closingDiscarded: discarded + replaced, discardedReturned: 0 };
  }
  const issued = targetOk - ok;
  if (issued > discarded) return null;
  return { date, openingStock: ok, newIssuedFromStore: issued, totalStock: ok + issued, replacedShift: shift, replacedNos: 0, closingOkStock: targetOk, closingDiscarded: discarded - issued, discardedReturned: issued };
}

/** The razor blade sheet closest before `dueDate` that has a closing stock: a person's, or one filled before it. */
export function bladeSheetBefore(records: readonly RecordInstance[], dueDate: string): RecordInstance<LogSheetData> | undefined {
  return (records as RecordInstance<LogSheetData>[])
    .filter((r) => compareISO(r.dueDate, dueDate) < 0 && bladeClosing(r.data) !== null)
    .sort((a, b) => compareISO(b.dueDate, a.dueDate))[0];
}

export const SHARP_FILL_NOTE =
  "Filled by the assistant from the Sharp Objects Master Data and the stock the paper's note keeps (REQUIREMENTS §254): count what was really issued, returned, broken and replaced, change any figure that differs, and sign.";

// ---------------------------------------------------------------------------
// one sheet a month (§259)

/** Every date of the month "YYYY-MM", the 1st to its last. */
export function monthDays(month: string): string[] {
  const out: string[] = [];
  for (let d = `${month}-01`; d.slice(0, 7) === month; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The figures a line holds once written, by the assistant or a person (the date and the line's id do not count). */
const LINE_KEYS: Record<string, string[]> = {
  "prd-sharp-object-issue": ["shift", "issuedScissor", "issuedManualCutter", "returnedScissor", "returnedManualCutter", "brokenScissor", "brokenCutterBlade", "newScissor", "newCutterBlade", "supervisorSign", "remarks"],
  "prd-pouching-cutter-issue": ["shift", "qtyIssued", "qtyReturned", "brokenQty", "newQtyIssued", "supervisorSign", "remarks"],
  "prd-pouching-blade": ["openingStock", "newIssuedFromStore", "totalStock", "replacedShift", "replacedNos", "closingOkStock", "closingDiscarded", "discardedReturned", "verifiedBy"],
  "prd-slitting-blade": ["openingStock", "newIssuedFromStore", "totalStock", "replacedShift", "replacedNos", "closingOkStock", "closingDiscarded", "discardedReturned", "verifiedBy"],
};

/** Whether a day's line has anything written on it. */
export function sharpLineWritten(documentId: string, row: LogSheetRow | undefined): boolean {
  // (the shift is set on each of the day's two lines beforehand, §263: it alone is not a line written)
  return !!row && (LINE_KEYS[documentId] ?? []).some((k) => !/shift/i.test(k) && !blank(row[k]));
}

/** The column a sheet writes its shift in: F/PRD/22 and 24 the replacement's SHIFT, F/PRD/10 and 23 Shift. */
export function shiftColumn(documentId: string): "shift" | "replacedShift" {
  return (RAZOR_BLADE_DOCS as readonly string[]).includes(documentId) ? "replacedShift" : "shift";
}

/** A line's shift, I or II: blank or anything but II is the first shift's. */
export function lineShift(documentId: string, row: LogSheetRow): "I" | "II" {
  return shiftWord(String(row[shiftColumn(documentId)] ?? "")) === "II" ? "II" : "I";
}

/** The two fixed shifts of every day (§263), in their order on the sheet. */
export const DAY_SHIFTS = ["I", "II"] as const;

/** Whether a line holds a figure or a sign (its date and its shift alone do not count): what a day's sheet carries over. */
export function sharpLineHoldsFigure(documentId: string, row: LogSheetRow | undefined): boolean {
  return !!row && (LINE_KEYS[documentId] ?? []).some((k) => !/shift/i.test(k) && !blank(row[k]));
}

/** A line's own figures, to lay on the month's line of the same date (a day's sheet from before §259), its shift I or II. */
export function sharpLineFigures(documentId: string, row: LogSheetRow): Partial<LogSheetRow> {
  const out: Partial<LogSheetRow> = {};
  for (const k of LINE_KEYS[documentId] ?? []) if (!blank(row[k])) out[k] = /shift/i.test(k) ? shiftWord(String(row[k])) : row[k];
  return out;
}

/** Whether a sheet is a month's: a line for most of a month's days (a day's sheet from before §259 has one or two). */
export function isSharpMonthSheet(data: LogSheetData | undefined): boolean {
  return (data?.rows ?? []).length >= 28;
}

/**
 * The sheet with a line for every date of its month, in order: a line already dated keeps its place and all it holds; a
 * date with none gets a blank one; a line with no date and nothing written goes (a day's blank shell's), one with
 * something written stays at the foot. Null when it already is so.
 */
export function withMonthDays(documentId: string, data: LogSheetData | undefined, month: string): LogSheetData | null {
  const layout = getLogSheetLayout(documentId);
  if (!layout) return null;
  const rows = data?.rows ?? [];
  const col = shiftColumn(documentId);
  // TWO FIXED SHIFTS A DAY (the owner, 20-Nov-2026, REQUIREMENTS §263): a line for shift I and one for shift II on every
  // date, the shift set on each. A line of the date already there keeps its place as its shift's (blank: shift I's).
  const byKey = new Map<string, LogSheetRow>();
  const loose: LogSheetRow[] = [];
  for (const r of rows) {
    const d = String(r.date ?? "").slice(0, 10);
    const key = `${d}|${lineShift(documentId, r)}`;
    if (d.slice(0, 7) === month && !byKey.has(key)) byKey.set(key, blank(r[col]) ? { ...r, [col]: lineShift(documentId, r) } : r);
    else if (sharpLineWritten(documentId, r)) loose.push(r);
  }
  const lineFor = (d: string, s: string) => byKey.get(`${d}|${s}`) ?? { ...blankLogRow(layout, generateId("row")), date: d, [col]: s };
  const next = [...monthDays(month).flatMap((d) => DAY_SHIFTS.map((s) => lineFor(d, s))), ...loose];
  if (next.length === rows.length && next.every((r, i) => r === rows[i])) return null;
  return { header: { ...(data?.header ?? {}) }, rows: next };
}

/** A closed day's line (the weekly off, a holiday): nothing issued, nothing replaced, the stock carried, the day named. */
export function closedDayLine(documentId: string, date: string, day: Pick<DayInfo, "short" | "name">, before: { ok: number; discarded: number } | null, shift: "I" | "II" = "I"): Partial<LogSheetRow> {
  if (documentId === "prd-sharp-object-issue") {
    return { date, shift, issuedScissor: 0, issuedManualCutter: 0, returnedScissor: 0, returnedManualCutter: 0, brokenScissor: NONE, brokenCutterBlade: NONE, newScissor: NONE, newCutterBlade: NONE, remarks: "" };
  }
  if (documentId === "prd-pouching-cutter-issue") {
    return { date, shift, qtyIssued: 0, qtyReturned: 0, brokenQty: NONE, newQtyIssued: NONE, remarks: "" };
  }
  const plan = BLADE_STOCK[documentId];
  const ok = before ? before.ok : plan?.start ?? 0;
  const discarded = before ? before.discarded : 0;
  return { date, openingStock: ok, newIssuedFromStore: 0, totalStock: ok, replacedShift: shift, replacedNos: 0, closingOkStock: ok, closingDiscarded: discarded, discardedReturned: 0 };
}

/** The razor blade stock some line dated before `date` closed with, on any of the document's sheets: the latest. */
export function bladeClosingBefore(records: readonly RecordInstance[], date: string, skipId?: string): { ok: number; discarded: number } | null {
  let best: { date: string; ok: number; discarded: number } | null = null;
  for (const r of records) {
    if (r.id === skipId) continue;
    for (const row of (r.data as LogSheetData | undefined)?.rows ?? []) {
      const d = String(row.date ?? "").slice(0, 10) || r.dueDate;
      const ok = num(row.closingOkStock);
      if (ok === null || compareISO(d, date) >= 0) continue;
      if (!best || compareISO(d, best.date) >= 0) best = { date: d, ok, discarded: num(row.closingDiscarded) ?? 0 };
    }
  }
  return best ? { ok: best.ok, discarded: best.discarded } : null;
}

/** The stock a blade line closed with, or null when it holds none. */
export function bladeLineClosing(row: LogSheetRow | undefined): { ok: number; discarded: number } | null {
  const ok = num(row?.closingOkStock);
  return ok === null ? null : { ok, discarded: num(row?.closingDiscarded) ?? 0 };
}
