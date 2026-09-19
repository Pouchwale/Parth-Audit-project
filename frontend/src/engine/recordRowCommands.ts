import type { LogColumn, LogSheetData, LogSheetLayout, LogSheetRow } from "../types";
import { findByLabel } from "./formatCommands";

// A RECORD'S OWN LINES, CHANGED BY SAYING SO (REQUIREMENTS §64).
//
// On a sheet whose lines are written by a person (rowMode "free") — a register,
// a job list — "add 3 rows", "delete the last row", "duplicate row 2", "clear
// row 4", "clear the Remarks of row 2" do to the open record what the Add Row
// button and the bin beside a line do, and no more: the sheet keeps the lines
// the form prints (rowMode.minRows), a new line is built exactly as the sheet's
// own Add Row builds one (components/records/LogSheetRecordView.tsx), and a cell
// the form prints, or one the sheet works out, is never touched.
//
// A VALUE for a cell — "row 2 line speed is 90" — is not read here; that is
// engine/recordPatch.ts, and every sentence below is anchored so it cannot
// swallow one. Where the FORM prints its lines (rowMode "fixedRows") "delete
// line 3" is a change to the format and is read by engine/formatCommands.ts
// before this is asked.

export type RowRef = number | "last";

export type RowCommand =
  | { kind: "add"; count: number; at?: { rel: "after" | "before"; row: RowRef } }
  | { kind: "remove"; rows: RowRef[] }
  | { kind: "removeLast"; count: number }
  | { kind: "removeBlank" }
  | { kind: "duplicate"; row: RowRef; times: number }
  | { kind: "clear"; row: RowRef; column?: string };

export type RowCommandResult = { ok: true; data: LogSheetData; what: string } | { ok: false; why: string };

const LEAD = /^(?:(?:hey|hi|ok|okay)[,!]?\s+)?(?:mitra[,:!]?\s+)?(?:(?:please|pls|kindly|now|then|also|and|just)[,]?\s+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|i\s+(?:want|need|would\s+like)\s+(?:you\s+)?to\s+|let'?s\s+)?/i;
const TAIL = /\s+(?:(?:from|to|on|in|of)\s+(?:the|this)\s+(?:sheet|record|register|table|grid|form)|for\s+me|please|pls)$/i;

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, another: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, once: 1, twice: 2, thrice: 3 };
const numberOf = (word: string | undefined): number => (word === undefined ? 1 : /^\d+$/.test(word) ? Number(word) : (NUMBER_WORDS[word.toLowerCase()] ?? 1));

const ORDINAL_WORDS: Record<string, RowRef> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: "last", final: "last" };
const ordinalOf = (word: string): RowRef => ORDINAL_WORDS[word.toLowerCase()] ?? Number.parseInt(word, 10);

const COUNT = "\\d{1,3}|a|an|one|another|two|three|four|five|six|seven|eight|nine|ten";
const ORDINAL = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|final|\\d{1,3}(?:st|nd|rd|th)";
const ROW = "(?:rows?|lines?)";
const NO = "(?:no\\.?\\s*|number\\s+|#\\s*)?";
const ADD = "add|insert|append|create|put\\s+in|put|give\\s+me|i\\s+need|i\\s+want|we\\s+need|new";
const DELETE = "delete|remove|drop|erase|scrap|strike\\s+(?:off|out)|get\\s+rid\\s+of|take\\s+(?:off|out|away)";
const CLEAR = "clear|empty|blank|wipe|rub\\s+out";

/** "row 3" or "the last row", wherever a sentence names one line. */
const ONE_ROW = `(?:the\\s+)?(?:${ROW}\\s+${NO}(\\d{1,3})|(${ORDINAL})\\s+${ROW})`;
const rowOf = (byNumber: string | undefined, byOrdinal: string | undefined): RowRef => (byNumber !== undefined ? Number(byNumber) : ordinalOf(byOrdinal ?? "last"));

/**
 * Reads `text` as something to do to the lines of the open record, or returns
 * null. Whether the sheet allows it is decided by applyRowCommand, which knows
 * the layout; this only reads the sentence.
 */
export function parseRowCommand(text: string): RowCommand | null {
  let s = text.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "").replace(LEAD, "");
  s = s.replace(TAIL, "").trim();
  if (!s) return null;

  // add a row / add 3 rows / add two more rows / add a row after row 2
  let m = s.match(new RegExp(`^(?:${ADD})\\s+(?:(${COUNT})\\s+)?(?:(?:more|new|blank|empty|extra)\\s+)*${ROW}(?:\\s+(?:more|at\\s+the\\s+(?:end|bottom)|below|to\\s+the\\s+end))?(?:\\s+(after|before|below|above|under)\\s+${ONE_ROW})?$`, "i"));
  if (m) {
    const at = m[2] ? { rel: /^(?:before|above)$/i.test(m[2]) ? ("before" as const) : ("after" as const), row: rowOf(m[3], m[4]) } : undefined;
    return { kind: "add", count: numberOf(m[1]), at };
  }

  // delete the empty rows
  if (new RegExp(`^(?:${DELETE})\\s+(?:all\\s+)?(?:the\\s+)?(?:blank|empty|unused|unfilled)\\s+${ROW}$`, "i").test(s)) return { kind: "removeBlank" };

  // delete the last 2 rows
  m = s.match(new RegExp(`^(?:${DELETE})\\s+(?:the\\s+)?last\\s+(${COUNT})\\s+${ROW}$`, "i"));
  if (m) return { kind: "removeLast", count: numberOf(m[1]) };

  // delete rows 3 to 5 / delete rows 3, 4 and 6
  m = s.match(new RegExp(`^(?:${DELETE})\\s+(?:the\\s+)?${ROW}\\s+${NO}(\\d{1,3})\\s*(?:to|-|–|through|till|until)\\s*(\\d{1,3})$`, "i"));
  if (m) {
    const from = Math.min(Number(m[1]), Number(m[2]));
    const to = Math.max(Number(m[1]), Number(m[2]));
    if (to - from > 200) return null;
    return { kind: "remove", rows: Array.from({ length: to - from + 1 }, (_, i) => from + i) };
  }
  m = s.match(new RegExp(`^(?:${DELETE})\\s+(?:the\\s+)?${ROW}\\s+${NO}(\\d{1,3}(?:\\s*(?:,|and|&)\\s*\\d{1,3})+)$`, "i"));
  if (m) return { kind: "remove", rows: Array.from(new Set(m[1].split(/\s*(?:,|and|&)\s*/).map(Number))) };

  // delete row 3 / delete the last row
  m = s.match(new RegExp(`^(?:${DELETE})\\s+${ONE_ROW}$`, "i"));
  if (m) return { kind: "remove", rows: [rowOf(m[1], m[2])] };

  // duplicate row 2 / copy the last row twice / another row like row 2
  m =
    s.match(new RegExp(`^(?:duplicate|copy|clone|repeat)\\s+${ONE_ROW}(?:\\s+(${COUNT}|once|twice|thrice)(?:\\s+times?)?)?$`, "i")) ??
    s.match(new RegExp(`^(?:(?:${ADD})\\s+)?(?:another|one\\s+more|a|an|one)\\s+${ROW}\\s+(?:just\\s+)?(?:like|same\\s+as|similar\\s+to)\\s+${ONE_ROW}$`, "i"));
  if (m) return { kind: "duplicate", row: rowOf(m[1], m[2]), times: Math.min(20, numberOf(m[3])) };

  // clear row 4
  m = s.match(new RegExp(`^(?:${CLEAR})\\s+(?:out\\s+)?${ONE_ROW}$`, "i"));
  if (m) return { kind: "clear", row: rowOf(m[1], m[2]) };

  // clear the Remarks of row 2 / clear row 2 remarks / delete the remarks in row 2
  m = s.match(new RegExp(`^(?:${CLEAR}|${DELETE})\\s+(?:out\\s+)?(?:the\\s+)?(.+?)\\s+(?:of|in|on|for|from|at)\\s+${ONE_ROW}$`, "i"));
  if (m) return { kind: "clear", column: m[1].trim(), row: rowOf(m[2], m[3]) };
  m = s.match(new RegExp(`^(?:${CLEAR})\\s+(?:out\\s+)?${ONE_ROW}(?:'s|’s)?\\s+(.+)$`, "i"));
  if (m) return { kind: "clear", column: m[3].trim(), row: rowOf(m[1], m[2]) };

  return null;
}

// ---------------------------------------------------------------------------
// doing it

/** A new line, exactly as the sheet's own Add Row builds one (components/records/LogSheetRecordView.tsx). */
export function blankRow(layout: LogSheetLayout, id: string): LogSheetRow {
  const row: LogSheetRow = { id };
  for (const c of layout.columns) row[c.key] = c.type === "number" ? null : c.autoFill?.default !== undefined && c.type !== "text" ? String(c.autoFill.default) : "";
  return row;
}

const isBlank = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === "";
const writable = (c: LogColumn): boolean => !c.fixed && !c.computed;
const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;
const rowList = (numbers: number[]): string => (numbers.length === 1 ? `row ${numbers[0]}` : `rows ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`);

const WHY_FIXED: Record<Exclude<LogSheetLayout["rowMode"]["kind"], "free">, string> = {
  timeSlots: "This sheet has one line for each time slot the form prints, so lines are not added or removed — only filled in.",
  single: "This sheet is a single line, so lines are not added or removed — only filled in.",
  fixedRows: "This form prints its own lines, so they are the format's, not this record's.",
};

/**
 * What `cmd` makes of `data`, and a sentence saying what was done — or why it
 * was not. `newId` gives each new line its id (utils/id.ts in the app).
 */
export function applyRowCommand(layout: LogSheetLayout, data: LogSheetData, cmd: RowCommand, newId: () => string): RowCommandResult {
  const rows = data.rows ?? [];
  const mode = layout.rowMode;
  const at = (ref: RowRef): number => (ref === "last" ? rows.length - 1 : ref - 1);
  const missing = (ref: RowRef): string => (rows.length === 0 || ref === "last" ? "This record has no rows yet." : `There is no row ${ref} on this record — it has ${plural(rows.length, "row")}.`);

  // Clearing what is written is allowed on any sheet; the lines themselves change only where a person writes them.
  if (cmd.kind === "clear") {
    const i = at(cmd.row);
    const row = rows[i];
    if (!row) return { ok: false, why: missing(cmd.row) };
    let columns = layout.columns.filter(writable);
    let what = `cleared row ${i + 1}`;
    if (cmd.column !== undefined) {
      const hits = findByLabel(layout.columns, (c) => [c.label], cmd.column);
      if (hits.length === 0) return { ok: false, why: `I can't find a column called “${cmd.column}” on this sheet. Its columns are ${layout.columns.map((c) => `“${c.label}”`).join(", ")}.` };
      if (hits.length > 1) return { ok: false, why: `${hits.length} columns answer to “${cmd.column}”: ${hits.map((c) => `“${c.label}”`).join(", ")}. Tell me which one, by its full name.` };
      const col = hits[0];
      if (!writable(col)) return { ok: false, why: `“${col.label}” is ${col.computed ? "worked out by the sheet" : "printed on the form"}, so it is not mine to clear.` };
      columns = [col];
      what = `cleared “${col.label}” of row ${i + 1}`;
    }
    if (columns.every((c) => isBlank(row[c.key]))) return { ok: false, why: cmd.column !== undefined ? `That cell of row ${i + 1} is already blank.` : `Row ${i + 1} is already blank.` };
    const cleared: LogSheetRow = { ...row };
    for (const c of columns) cleared[c.key] = c.type === "number" ? null : "";
    return { ok: true, data: { ...data, rows: rows.map((r, ri) => (ri === i ? cleared : r)) }, what };
  }

  if (mode.kind !== "free") return { ok: false, why: WHY_FIXED[mode.kind] };
  const minRows = mode.minRows ?? 0;

  if (cmd.kind === "add") {
    if (cmd.count < 1 || cmd.count > 50) return { ok: false, why: "I add between 1 and 50 rows at a time." };
    let index = rows.length;
    if (cmd.at) {
      const beside = at(cmd.at.row);
      if (!rows[beside]) return { ok: false, why: missing(cmd.at.row) };
      index = cmd.at.rel === "before" ? beside : beside + 1;
    }
    const fresh = Array.from({ length: cmd.count }, () => blankRow(layout, newId()));
    const numbers = fresh.map((_, i) => index + i + 1);
    const where = index === rows.length ? "at the end" : `${cmd.at?.rel} row ${at(cmd.at?.row ?? "last") + 1}`;
    return { ok: true, data: { ...data, rows: [...rows.slice(0, index), ...fresh, ...rows.slice(index)] }, what: `added ${plural(cmd.count, "blank row")} ${where} (${rowList(numbers)})` };
  }

  if (cmd.kind === "duplicate") {
    const i = at(cmd.row);
    const row = rows[i];
    if (!row) return { ok: false, why: missing(cmd.row) };
    const copies = Array.from({ length: cmd.times }, () => ({ ...row, id: newId() }));
    return { ok: true, data: { ...data, rows: [...rows.slice(0, i + 1), ...copies, ...rows.slice(i + 1)] }, what: `copied row ${i + 1} as ${rowList(copies.map((_, c) => i + c + 2))}` };
  }

  // The three ways of taking lines off come down to which lines.
  let gone: number[];
  if (cmd.kind === "removeBlank") {
    const writableColumns = layout.columns.filter(writable);
    const blank = rows.map((r, i) => (writableColumns.every((c) => isBlank(r[c.key])) ? i : -1)).filter((i) => i >= 0);
    if (blank.length === 0) return { ok: false, why: "There are no blank rows on this record." };
    // The sheet keeps the lines the form prints: blank ones are taken from the foot first, down to that many.
    gone = blank.slice(Math.max(0, blank.length - Math.max(0, rows.length - minRows)));
    if (gone.length === 0) return { ok: false, why: `This sheet keeps at least ${plural(minRows, "row")} — the form prints that many — so the blank ones stay.` };
  } else if (cmd.kind === "removeLast") {
    if (cmd.count < 1) return { ok: false, why: "Tell me how many rows to take off." };
    gone = Array.from({ length: Math.min(cmd.count, rows.length) }, (_, i) => rows.length - 1 - i).reverse();
    if (gone.length === 0) return { ok: false, why: "This record has no rows yet." };
  } else {
    const wanted = cmd.rows.map(at);
    const bad = cmd.rows.find((ref, i) => !rows[wanted[i]]);
    if (bad !== undefined) return { ok: false, why: missing(bad) };
    gone = Array.from(new Set(wanted)).sort((x, y) => x - y);
  }
  if (rows.length - gone.length < minRows) {
    return {
      ok: false,
      why: `This sheet keeps at least ${plural(minRows, "row")} — the form prints that many — and it has ${rows.length}, so ${gone.length === 1 ? `row ${gone[0] + 1} stays` : "those rows stay"}. I can clear ${gone.length === 1 ? "it" : "them"} instead: say “clear row ${gone[0] + 1}”.`,
    };
  }
  const drop = new Set(gone);
  return { ok: true, data: { ...data, rows: rows.filter((_, i) => !drop.has(i)) }, what: `removed ${rowList(gone.map((i) => i + 1))}` };
}
