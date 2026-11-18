import type { LogSheetData, LogSheetRow, MasterData, RecordInstance, SharpToolPerson } from "../types";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { blankLogRow } from "./recordDefaults";
import { makeRng } from "../utils/random";
import { generateId } from "../utils/id";
import { compareISO } from "../utils/date";

// THE SHARP OBJECTS & BLADES SHEETS FILL THEMSELVES (the owner, 17-Nov-2026, REQUIREMENTS §254: "create master data ... with
// columns called name and Department, Shift and that data will be fetch in Sharp Objects & Blades document ... in those
// document in upper side note is written clear so in this document the data should automatically come"; asked: the list in
// the Production module, "Issued = people in shift", the stock the app's notes print, the razor blades "like your photo").
//
//   F/PRD/10 and F/PRD/23 - a line for each shift the Sharp Objects Master Data names, every working day: the scissors and
//     manual cutters issued, and returned, are the people of that shift (F/PRD/23: the pouching section's), never more than
//     the stock the paper's note keeps (15 scissors and 20 cutter blades; 40 on F/PRD/23); nothing broken ("Nil"), nothing
//     new issued ("NA"). The supervisor signs.
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

/** F/PRD/10 and F/PRD/23: the day's lines, a shift each; null when the list names nobody. */
export function sharpIssueRows(documentId: string, dueDate: string, master: Pick<MasterData, "sharpToolPeople">): LogSheetRow[] | null {
  const layout = getLogSheetLayout(documentId);
  const stock = SHARP_STOCK[documentId];
  if (!layout || !stock) return null;
  const shifts = shiftsOf(peopleFor(documentId, master));
  if (shifts.length === 0) return null;
  return shifts.map(({ shift, count }) => {
    const row: LogSheetRow = { ...blankLogRow(layout, generateId("row")), date: dueDate, shift };
    if (documentId === "prd-sharp-object-issue") {
      const scissors = Math.min(count, stock.scissor ?? count);
      const cutters = Math.min(count, stock.cutter);
      Object.assign(row, { issuedScissor: scissors, issuedManualCutter: cutters, returnedScissor: scissors, returnedManualCutter: cutters, brokenScissor: "Nil", brokenCutterBlade: "Nil", newScissor: "NA", newCutterBlade: "NA" });
    } else {
      const cutters = Math.min(count, stock.cutter);
      Object.assign(row, { qtyIssued: cutters, qtyReturned: cutters, brokenQty: "Nil", newQtyIssued: "NA" });
    }
    return row;
  });
}

/** The stock a razor blade sheet closed with: its last line's closing OK and discarded blades. */
export function bladeClosing(data: LogSheetData | undefined): { ok: number; discarded: number } | null {
  const rows = [...(data?.rows ?? [])].reverse();
  const last = rows.find((r) => num(r.closingOkStock) !== null);
  if (!last) return null;
  return { ok: num(last.closingOkStock)!, discarded: num(last.closingDiscarded) ?? 0 };
}

/** F/PRD/22 and F/PRD/24: the day's line, from the stock the day before closed with (none: the specimen's day). */
export function razorBladeRow(documentId: string, dueDate: string, before: { ok: number; discarded: number } | null): LogSheetRow | null {
  const layout = getLogSheetLayout(documentId);
  const plan = BLADE_STOCK[documentId];
  if (!layout || !plan) return null;
  const opening = before ? before.ok : plan.start;
  const held = before ? before.discarded : 0;
  const rng = makeRng(`razor|${documentId}|${dueDate}`);
  const roll = rng.next();
  // Mostly one or two a day; three now and then on the pouching machines.
  const wanted = plan.most >= 3 ? (roll < 0.45 ? 1 : roll < 0.85 ? 2 : 3) : roll < 0.6 ? 1 : 2;
  let returned = 0;
  let issued = 0;
  if (opening <= BLADE_LOW || opening < wanted) {
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
    replacedShift: "I",
    replacedNos: replaced,
    closingOkStock: total - replaced,
    closingDiscarded: held - returned + replaced,
    discardedReturned: returned,
  };
}

/** The razor blade sheet closest before `dueDate` that has a closing stock: a person's, or one filled before it. */
export function bladeSheetBefore(records: readonly RecordInstance[], dueDate: string): RecordInstance<LogSheetData> | undefined {
  return (records as RecordInstance<LogSheetData>[])
    .filter((r) => compareISO(r.dueDate, dueDate) < 0 && bladeClosing(r.data) !== null)
    .sort((a, b) => compareISO(b.dueDate, a.dueDate))[0];
}

export const SHARP_FILL_NOTE =
  "Filled by the assistant from the Sharp Objects Master Data and the stock the paper's note keeps (REQUIREMENTS §254): count what was really issued, returned, broken and replaced, change any figure that differs, and sign.";
