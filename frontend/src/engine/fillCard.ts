// ONE FORM, DESCRIBED SHORT ENOUGH FOR ONE SMALL MODEL CALL (REQUIREMENTS §94).
//
// When DCRS's own rules cannot read every value a person said (engine/
// fillRequest.ts), one JSON call is made with a fixed prompt, the person's words
// and THIS card: the form's boxes in the keys a reply must use, each select
// box's options, the time slots as one line ("time, hourly 09:00..08:00"), the
// limits of a reading, which boxes are signatures, and F/HR/17's ten questions
// with the answer that is a finding. Measured live on 7-Oct-2026: a call with
// such a card costs 500 to 1,018 tokens, against 6,000 to 21,000 for a fill
// through the agent. The card is at most 1,200 characters.
//
// The whole document list is never sent (125 documents are about 2,300 tokens):
// when the document is not certain, at most twelve candidates go up, one line
// each (candidateLines).
//
// layoutOf is the form "in the keys a patch names", which the phone's API has
// answered since REQUIREMENTS §85 (engineHost/entry.ts); it lives here now so the
// browser and the engine host share one copy.
import type { DocumentDefinition, LogColumn, LogHeaderField, LogSheetLayout, MasterData, RecordInstance } from "../types";
import { getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { masterRepository } from "../data/repositories/masterRepository";
import { createDefaultData } from "./recordDefaults";
import { humanKey } from "./recordPatch";
import { todayISO } from "../utils/date";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** The card's ceiling, and the candidate list's. */
export const FORM_CARD_MAX_CHARS = 1200;
export const MAX_CANDIDATES = 12;

// A box that takes a signature: its key or printed label says so.
const SIGN_RE = /sign|signature|by$|in-?charge|verified|checked by|tested by|checker/i;

/** Whether a box or column is a signature (a name is written there only when the person said whose). */
export function isSignField(f: { key: string; label: string; autoFill?: { sign?: boolean } }): boolean {
  return !!f.autoFill?.sign || SIGN_RE.test(f.key) || SIGN_RE.test(f.label.split(" (")[0]);
}

const short = (s: string, max: number): string => (s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s);

/** "F-QC-30 Lamination Adhesive Viscosity Record" (no "TO BE CONFIRMED"). */
export function formatAndName(doc: Pick<DocumentDefinition, "formatNo" | "name">): string {
  return `${doc.formatNo && !doc.formatNo.startsWith("TO BE") ? `${doc.formatNo} ` : ""}${doc.name}`;
}

/** "09:00..08:00 (next day)" for consecutive hours, else the slots themselves. */
function slotsLine(slots: readonly string[]): string {
  if (slots.length < 3) return slots.join(", ");
  const hour = (s: string) => Number(s.slice(0, 2));
  const hourly = slots.every((s, i) => i === 0 || (hour(s) - hour(slots[i - 1]) + 24) % 24 === 1);
  if (hourly) {
    const wraps = hour(slots[slots.length - 1]) < hour(slots[0]);
    return `hourly ${slots[0]}..${slots[slots.length - 1]}${wraps ? " (next day)" : ""}`;
  }
  return slots.join(", ");
}

/** One box or column in a few words: "viscosity (number, Sec., 19.0-21.0)", "cleaningType (Dry|Wet)", "driverSign (text, sign)". */
function fieldLine(f: LogHeaderField | LogColumn): string {
  const c = f as LogColumn;
  const bits: string[] = [];
  if (f.type === "select" && f.options?.length) bits.push(f.options.length <= 6 ? f.options.join("|") : `one of: ${f.options.slice(0, 8).join(" | ")}${f.options.length > 8 ? " …" : ""}`);
  else bits.push(f.type);
  if (c.unit) bits.push(c.unit);
  if (typeof c.min === "number" && typeof c.max === "number") bits.push(`${c.min.toFixed(c.decimals ? 1 : 0)}-${c.max.toFixed(c.decimals ? 1 : 0)}`);
  if (isSignField(f)) bits.push("sign");
  const label = humanKey(f.key).toLowerCase() === f.label.split(" (")[0].toLowerCase() ? "" : ` "${short(f.label.split(" (")[0], 30)}"`;
  return `${f.key}${label} (${bits.join(", ")})`;
}

const writable = (c: LogColumn): boolean => !c.fixed && !c.computed && !c.linkedFrom;

/** The card's lines for a log sheet. */
function logSheetCard(layout: LogSheetLayout): string[] {
  const lines: string[] = [];
  const boxes = [...layout.headerFields, ...(layout.footerFields ?? [])].filter((f) => !f.computed);
  if (boxes.length) lines.push(`header: ${boxes.map(fieldLine).join("; ")}`);
  const cols = layout.columns.filter(writable);
  const mode = layout.rowMode;
  if (mode.kind === "timeSlots") {
    lines.push(`slots: ${mode.slotKey}, ${slotsLine(mode.slots)}`);
    lines.push(`per slot: ${cols.map(fieldLine).join("; ")}`);
  } else if (mode.kind === "free") {
    lines.push(`rows (a new line per entry): ${cols.map(fieldLine).join("; ")}`);
  } else if (mode.kind === "single") {
    lines.push(`rows (one line): ${cols.map(fieldLine).join("; ")}`);
  } else {
    const printed = layout.columns.find((c) => c.fixed);
    const names = mode.rows.map((r, i) => `${i + 1} ${short(String(printed ? (r[printed.key] ?? "") : ""), 24)}`);
    lines.push(`rows (printed, give "row":n): ${names.join("; ")}`);
    lines.push(`per row: ${cols.map(fieldLine).join("; ")}`);
  }
  return lines;
}

/** F/HR/17's ten questions, short, each with the answer that is a finding. */
function dailyPestCard(master: MasterData): string[] {
  const shortQ = (t: string): string =>
    short(
      t
        .replace(/\?.*$/, "?")
        .replace(/\s*\(.*?\)\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      44
    );
  const qs = master.checkpoints.map((c) => `${c.no} ${shortQ(c.text)} (${c.responseType === "number" ? "a count" : `finding when ${c.flagWhen ?? "-"}`})`);
  return [`checks: ${qs.join("; ")}`, "fields: checker (text, sign); timeOfChecking (time); isHoliday (yesno)"];
}

/**
 * THE CARD: the form a reply must fit, at most 1,200 characters.
 * `record` is the record the values go on (its revision decides the layout), or null for one not started yet.
 */
export function formCard(doc: DocumentDefinition, record: RecordInstance | null, today = todayISO()): string {
  const head = `FORM ${doc.id}: ${formatAndName(doc)}. Today ${today}.${record && record.dueDate !== today ? ` Record of ${record.dueDate}.` : ""}`;
  let body: string[];
  if (doc.kind === "log-sheet") {
    const layout = getLogSheetLayoutForRecord(doc.id, record);
    body = layout ? logSheetCard(layout) : [];
  } else if (doc.kind === "daily-pest-monitoring") {
    body = dailyPestCard(masterRepository.get());
  } else {
    const shape = layoutOf(doc, record ?? undefined);
    const fields = Array.isArray(shape.fields) ? (shape.fields as Obj[]) : [];
    body = [`fields: ${fields.map((f) => `${String(f.key)} (${String(f.type)})`).join("; ")}`];
  }
  const card = [head, ...body].join("\n");
  return card.length <= FORM_CARD_MAX_CHARS ? card : `${card.slice(0, FORM_CARD_MAX_CHARS - 1)}…`;
}

/** "id | formatNo name", one line each, at most twelve — what a pick call chooses from. */
export function candidateLines(docs: readonly DocumentDefinition[]): string {
  return docs
    .slice(0, MAX_CANDIDATES)
    .map((d) => `${d.id} | ${formatAndName(d)}`)
    .join("\n");
}

/** How a person could say values for this form: "09:00 viscosity 20.1", "vehicle ECHO, Dry, driver Ramesh". */
export function exampleFor(doc: DocumentDefinition | null | undefined): string {
  if (!doc) return "\"fill today's F-QC-30: 20.1 at 09:00\"";
  if (doc.kind === "daily-pest-monitoring") return "\"all fine, checker Vinay, at 09:30\"";
  if (doc.kind === "log-sheet") {
    const layout = getLogSheetLayoutForRecord(doc.id, null);
    if (layout) {
      const mode = layout.rowMode;
      const num = layout.columns.find((c) => writable(c) && c.type === "number");
      if (mode.kind === "timeSlots" && num) {
        const v = typeof num.nominal === "number" ? num.nominal : typeof num.min === "number" ? num.min : 10;
        return `"${mode.slots[0]} ${num.label.split(" (")[0].toLowerCase()} ${v}"`;
      }
      const sel = [...layout.headerFields, ...layout.columns].find((f) => f.type === "select" && f.options?.length);
      const name = layout.columns.find((c) => writable(c) && isSignField(c));
      if (sel || name) {
        const opt = sel?.options?.[0] ?? "";
        const word = opt.includes("–") ? opt.split("–").pop()!.trim() : opt;
        return `"${[word, name ? `${name.label.split(" (")[0].toLowerCase()} Ramesh` : ""].filter(Boolean).join(", ")}"`;
      }
      const any = layout.columns.find(writable) ?? layout.headerFields[0];
      if (any) return `"${any.label.split(" (")[0].toLowerCase()} is ..."`;
    }
  }
  return `"${doc.formatNo || doc.name}: <box> is <value>"`;
}

// ---------------------------------------------------------------------------
// the form in the keys a patch names (moved from engineHost/entry.ts)

const fieldOf = (f: LogHeaderField | LogColumn): Obj => {
  const c = f as LogColumn;
  return {
    key: f.key,
    label: f.label,
    type: f.type,
    ...(f.options?.length ? { options: f.options } : {}),
    ...(f.required ? { required: true } : {}),
    ...(c.unit ? { unit: c.unit } : {}),
    ...(c.group ? { group: c.group } : {}),
    ...(c.fixed ? { printed: true } : {}),
    ...(f.computed ? { computed: true } : {}),
    ...(c.linkedFrom ? { readFrom: c.linkedFrom } : {}),
    ...(typeof c.min === "number" ? { min: c.min } : {}),
    ...(typeof c.max === "number" ? { max: c.max } : {}),
  };
};

function typeOfValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return "yesno";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "list";
  if (isObj(value)) return "group";
  if (/date/i.test(key)) return "date";
  if (/^time|Time/.test(key)) return "time";
  return value === null ? "number or blank" : "text";
}

/** What the form is made of, in the keys a patch names: a log sheet's boxes and columns, F/HR/17's check points, any other form's fields. */
export function layoutOf(doc: DocumentDefinition, record?: RecordInstance): Obj {
  if (doc.kind === "log-sheet") {
    const l: LogSheetLayout | undefined = getLogSheetLayoutForRecord(doc.id, record);
    if (l) {
      const mode = l.rowMode;
      const rows = record && isObj(record.data) && Array.isArray((record.data as Obj).rows) ? ((record.data as Obj).rows as unknown[]).length : undefined;
      return {
        kind: "log-sheet",
        header: l.headerFields.map(fieldOf),
        footer: (l.footerFields ?? []).map(fieldOf),
        columns: l.columns.map(fieldOf),
        rows: {
          mode: mode.kind,
          ...(mode.kind === "timeSlots" ? { slotKey: mode.slotKey, slots: mode.slots } : {}),
          ...(mode.kind === "fixedRows" ? { fixed: mode.rows.length } : {}),
          ...(rows !== undefined ? { count: rows } : {}),
        },
      };
    }
  }
  const master: MasterData = masterRepository.get();
  if (doc.kind === "daily-pest-monitoring") {
    return {
      kind: doc.kind,
      checkpoints: master.checkpoints.map((c) => ({ number: Number(c.no), question: c.text, answer: c.responseType, ...(c.notePrompt ? { noteAsks: c.notePrompt } : {}), ...(c.flagWhen ? { findingWhen: c.flagWhen } : {}) })),
      fields: [
        { key: "checker", label: "Checker", type: "text" },
        { key: "timeOfChecking", label: "Time of checking", type: "time" },
        { key: "isHoliday", label: "Holiday", type: "yesno" },
      ],
      lists: [
        { key: "rodentCatches", label: "Rodent catches", items: ["trapBoxNo", "location", "count"] },
        { key: "summaryActions", label: "Observations and actions", items: ["dateOfObservation", "descriptionOfObservation", "actionTaken", "remarks"] },
      ],
    };
  }
  const data = record?.data ?? createDefaultData(doc, todayISO(), master);
  if (!isObj(data)) return { kind: doc.kind, fields: [] };
  const fields: Obj[] = [];
  for (const [key, value] of Object.entries(data)) {
    const type = typeOfValue(key, value);
    const field: Obj = { key, label: humanKey(key), type };
    if (Array.isArray(value)) {
      const first = value.find(isObj);
      if (first) field.items = Object.keys(first).filter((k) => k !== "id");
      field.count = value.length;
    } else if (isObj(value)) field.parts = Object.keys(value);
    fields.push(field);
  }
  return { kind: doc.kind, fields };
}
