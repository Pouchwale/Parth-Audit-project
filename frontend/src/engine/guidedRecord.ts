import type {
  ComplaintAckData,
  DailyPestMonitoringData,
  DocumentDefinition,
  FlyCatcherData,
  GapFinding,
  GapInspectionData,
  LogHeaderField,
  LogSheetData,
  LogSheetRow,
  MasterData,
  PestResponsibilitiesData,
  RecordInstance,
  ServiceAgreementData,
  ServiceReportData,
  TrainingRecordData,
} from "../types";
import { TBC } from "../types";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { applyFills, describePerson, hrMasterLinkFor, personFill, searchPeople } from "./hrMaster";
import { SEED_AWARENESS_TRAINING_RECORD } from "../data/seed/historicalRecords";
import { CAF_COMPLAINT_SUB_TYPES, CAF_COMPLAINT_TYPES } from "../data/seed/complaintAck";
import { COMPANY } from "../data/seed/masterData";
import { autoFillRecord } from "./autoFill";
import { latestConfirmedRecord } from "./assistantPrepare";
import { codeRulesFor, FG_CODE_EXAMPLE } from "./documentFormats";
import { dayInfo } from "./holidays";
import { normDate, normNumber, normOption, normTime, normYesNo } from "./recordPatch";
import { termEnd } from "./serviceAgreement";
import { addDays, formatDisplayDate, todayISO } from "../utils/date";
import { generateId } from "../utils/id";
import { TUBE_LIGHT_DUE, TUBE_LIGHT_INSTALLED } from "./flyPattern";

// THE ASSISTANT'S QUESTION-BY-QUESTION FILL, for every document that is not
// the customer complaint checklist (which has its own A→E walk-through in
// engine/guidedChecklist.ts). The department's request, 13-Sep-2026: "open
// that document and ask questions like what to fill where … like an agent".
//
// A pure plan, recomputed from the record's data after every answer: each
// question knows how to tell whether the form already answers it, and how to
// write the answer in. The widget (components/common/DocumentAssistant.tsx)
// asks the first question that is neither answered on the form nor already
// asked in this sitting, saves each answer as it comes (an "assistant" line in
// the record's history, undoable), and hands the finished form back to be
// checked — never submitting it itself.
//
// Answers are typed the way the form stores them (recordPatch's normalisers:
// dates day-first, 24-hour times, Yes/No, the exact select option) and the
// codes are held to the department's formats (engine/documentFormats.ts), so
// an answer that cannot be read is asked again rather than written wrong.

type Obj = Record<string, unknown>;

export type AnswerType = "text" | "date" | "time" | "number" | "yesno" | "select" | "list";

export interface Suggestion {
  label: string;
  value: string;
}

export interface InterviewQuestion {
  /** Stable within a sitting — what "already asked" is keyed on. */
  id: string;
  /** Short field name, for the history note and the acknowledgement. */
  label: string;
  ask: string;
  type: AnswerType;
  options?: string[];
  /** Quick-reply answers offered as chips. */
  suggestions?: Suggestion[];
  /** May be skipped; the form is still complete without it. */
  optional?: boolean;
  /** Does the form already answer this? (then it is not asked) */
  answered: (data: Obj) => boolean;
  /** Writes the normalised answer into a copy of the data. */
  apply: (data: Obj, value: unknown) => Obj;
  /** Reads the raw answer itself instead of the type-based normaliser; null = could not read it. */
  parse?: (raw: string) => unknown | null;
  /** A format problem with the (normalised) value, or null when it is fine. */
  validate?: (value: unknown) => string | null;
  /** What to say once it is saved — default "<label>: <value>." */
  ack?: (value: unknown) => string;
}

export interface InterviewPlan {
  intro: string;
  questions: InterviewQuestion[];
}

const YES_NO: Suggestion[] = [
  { label: "Yes", value: "Yes" },
  { label: "No", value: "No" },
];
const chips = (...values: string[]): Suggestion[] => values.map((v) => ({ label: v, value: v }));
const blank = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === "";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// the plan, per document kind

/** The questions for this record, or null when the document has no interview (the checklist has its own; reference documents are kept as issued). */
export function interviewPlan(doc: DocumentDefinition, record: RecordInstance, data: unknown, master: MasterData, today = todayISO()): InterviewPlan | null {
  const d = (data ?? {}) as Obj;
  switch (doc.kind) {
    case "daily-pest-monitoring":
      return dailyPlan(record, d as unknown as DailyPestMonitoringData, master, today);
    case "fly-catcher":
      return flyPlan(d as unknown as FlyCatcherData, master);
    case "service-report":
      return servicePlan(doc, d as unknown as ServiceReportData, master);
    case "log-sheet":
      return logSheetPlan(doc, record, d as unknown as LogSheetData, master);
    case "gap-inspection":
      return inspectionPlan(d as unknown as GapInspectionData, today);
    case "training-record":
      return trainingPlan(d as unknown as TrainingRecordData);
    case "complaint-ack":
      return complaintAckPlan(d as unknown as ComplaintAckData, master);
    case "pest-responsibilities":
      return responsibilitiesPlan(d as unknown as PestResponsibilitiesData);
    case "service-agreement":
      return agreementPlan(d as unknown as ServiceAgreementData);
    default:
      return null;
  }
}

/** The next question worth asking: not answered on the form, not asked in this sitting. */
export function nextQuestion(plan: InterviewPlan, data: unknown, asked: Set<string>): InterviewQuestion | null {
  const d = (data ?? {}) as Obj;
  return plan.questions.find((q) => !asked.has(q.id) && !q.answered(d)) ?? null;
}

/** How many of the plan's questions the form already answers, for the intro. */
export function planProgress(plan: InterviewPlan, data: unknown): { answered: number; total: number } {
  const d = (data ?? {}) as Obj;
  const total = plan.questions.length;
  return { answered: plan.questions.filter((q) => q.answered(d)).length, total };
}

// ---------------------------------------------------------------------------
// answering

export interface AnswerOutcome {
  data: Obj;
  ack: string;
  /** The answer could not be read — ask the same question again. */
  stay?: boolean;
}

/** "in 7 days", "next week", plus everything normDate reads (day-first). */
function readDate(text: string, today: string): string | null {
  const t = text.trim().toLowerCase();
  const inDays = t.match(/^(?:in\s+)?(\d{1,3})\s+days?(?:\s+time)?$/) ?? t.match(/^(?:after\s+)?(\d{1,3})\s+days?$/);
  if (inDays) return addDays(today, Number(inDays[1]));
  if (/^(next|in a) week$/.test(t)) return addDays(today, 7);
  if (/^(in )?two weeks$/.test(t) || /^(in a )?fortnight$/.test(t)) return addDays(today, 14);
  if (/^(next|in a) month$/.test(t)) return addDays(today, 30);
  return normDate(t.replace(/^on\s+/, ""), today);
}

function display(value: unknown): string {
  if (Array.isArray(value)) return value.length === 1 ? String(value[0]) : `${value.length} lines`;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDisplayDate(value);
  return String(value);
}

export function answerQuestion(q: InterviewQuestion, data: unknown, raw: string, today = todayISO()): AnswerOutcome {
  const d = (data ?? {}) as Obj;
  const text = raw.trim().replace(/[.!]+$/, "");
  const again = (ack: string): AnswerOutcome => ({ data: d, ack, stay: true });
  let value: unknown;
  if (q.parse) {
    value = q.parse(text);
    if (value === null || value === undefined) return again("I couldn't read that — try again, or tap one of the answers.");
  } else {
    switch (q.type) {
      case "date": {
        const iso = readDate(text, today);
        if (!iso) return again('I couldn\'t read that as a date — try 15-09-2026, 15 Sep, "today", "yesterday" or "in 7 days".');
        value = iso;
        break;
      }
      case "time": {
        const tm = /^now$/i.test(text) ? nowTime() : normTime(text);
        if (!tm) return again('I couldn\'t read that as a time — try 09:15, 2 pm, or "now".');
        value = tm;
        break;
      }
      case "number": {
        const n = /^(none|nil|zero|nothing|no)$/i.test(text) ? 0 : normNumber(text);
        if (n === null) return again("I need a number here.");
        value = n;
        break;
      }
      case "yesno": {
        const yn = normYesNo(text);
        if (!yn) return again("Yes or No?");
        value = yn;
        break;
      }
      case "select": {
        const o = normOption(text, q.options ?? []);
        if (!o) return again(`It has to be one of: ${(q.options ?? []).join(", ")}.`);
        value = o;
        break;
      }
      case "list": {
        const items = text
          .split(/\r?\n|;|,(?!\s*\d)/)
          .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
          .filter(Boolean);
        if (items.length === 0) return again("Type at least one line, or tap Skip.");
        value = items;
        break;
      }
      default:
        if (!text) return again("Type it in, or tap Skip.");
        value = text;
    }
  }
  if (q.validate) {
    const problem = q.validate(value);
    if (problem) return again(`${problem} What shall I put?`);
  }
  const next = q.apply(clone(d), value);
  return { data: next, ack: q.ack ? q.ack(value) : `${q.label}: ${display(value)}.` };
}

// ---------------------------------------------------------------------------
// small shared question builders

function textQ(id: string, label: string, ask: string, get: (d: Obj) => unknown, set: (d: Obj, v: string) => Obj, extra: Partial<InterviewQuestion> = {}): InterviewQuestion {
  return { id, label, ask, type: "text", answered: (d) => !blank(get(d)), apply: (d, v) => set(d, String(v)), ...extra };
}

function dateQ(id: string, label: string, ask: string, get: (d: Obj) => unknown, set: (d: Obj, v: string) => Obj, extra: Partial<InterviewQuestion> = {}): InterviewQuestion {
  return {
    id,
    label,
    ask,
    type: "date",
    suggestions: [{ label: "Today", value: "today" }, { label: "Yesterday", value: "yesterday" }],
    answered: (d) => !blank(get(d)),
    apply: (d, v) => set(d, String(v)),
    ...extra,
  };
}

/** The plant's people whose role mentions any of these words, as chips. */
function people(master: MasterData, ...roleWords: string[]): Suggestion[] {
  const names = master.employees
    .filter((e) => e.active && roleWords.some((w) => e.role.toLowerCase().includes(w.toLowerCase())))
    .map((e) => e.name.replace(/^(Mr|Ms|Mrs)\.\s*/, ""));
  return chips(...Array.from(new Set(names)).slice(0, 4));
}

// ---------------------------------------------------------------------------
// 1. Daily Pest Control Monitoring Record (F/HR/17)

function dailyPlan(record: RecordInstance, d: DailyPestMonitoringData, master: MasterData, today: string): InterviewPlan {
  const qs: InterviewQuestion[] = [];
  const holiday = (x: Obj) => (x as unknown as DailyPestMonitoringData).isHoliday === true;
  const cpValue = (x: Obj, no: number) => (x as unknown as DailyPestMonitoringData).checkpoints?.[no]?.value;
  const cpNote = (x: Obj, no: number) => (x as unknown as DailyPestMonitoringData).checkpoints?.[no]?.note;
  const setCp = (x: Obj, no: number, patch: Obj): Obj => {
    const cps = { ...((x.checkpoints as Obj) ?? {}) };
    cps[no] = { ...((cps[no] as Obj) ?? {}), ...patch };
    return { ...x, checkpoints: cps };
  };

  const day = dayInfo(record.dueDate, master);
  if (day.isHoliday && !d.isHoliday) {
    qs.push({
      id: "isHoliday",
      label: "Holiday",
      ask: `${formatDisplayDate(record.dueDate)} is ${day.label} on the leave calendar — mark this sheet as a holiday (no round done)?`,
      type: "yesno",
      suggestions: YES_NO,
      answered: () => false,
      apply: (x, v) => ({ ...x, isHoliday: v === "Yes" }),
      ack: (v) => (v === "Yes" ? "Marked as a holiday — nothing else to fill on this sheet." : "Treated as a working day — let's go through the check points."),
    });
  }

  for (const cp of master.checkpoints) {
    const no = Number(cp.no);
    if (cp.responseType === "number") {
      qs.push({
        id: `cp${no}`,
        label: `Check point ${no}`,
        ask: `Check point ${no}: ${cp.text}?`,
        type: "number",
        suggestions: chips("100"),
        answered: (x) => holiday(x) || !blank(cpValue(x, no)),
        apply: (x, v) => setCp(x, no, { value: Number(v) }),
      });
      continue;
    }
    const flagWhen = cp.flagWhen;
    qs.push({
      id: `cp${no}`,
      label: `Check point ${no}`,
      ask: `Check point ${no}: ${cp.text} — Yes or No?`,
      type: "yesno",
      suggestions: YES_NO,
      answered: (x) => holiday(x) || !blank(cpValue(x, no)),
      // "OK" means the point is fine — which on a point that asks about a
      // problem ("any gaps?") is "No" (the same rule as recordPatch.ts).
      parse: (raw) => {
        const s = raw.toLowerCase();
        if (flagWhen && /^(ok|okay|fine|all ok|all fine|normal)$/.test(s)) return flagWhen === "Yes" ? "No" : "Yes";
        if (flagWhen && /^(not ok|notok|not okay|problem)$/.test(s)) return flagWhen;
        return normYesNo(raw);
      },
      apply: (x, v) => setCp(x, no, { value: v }),
    });
    if (cp.responseType === "yesno-note") {
      qs.push(
        textQ(
          `cp${no}-note`,
          `Check point ${no} — ${cp.notePrompt ?? "note"}`,
          `${cp.notePrompt ?? "Where"}?`,
          (x) => (cpValue(x, no) !== "Yes" ? "n/a" : cpNote(x, no)),
          (x, v) => setCp(x, no, { note: v }),
          { answered: (x) => holiday(x) || cpValue(x, no) !== "Yes" || !blank(cpNote(x, no)) }
        )
      );
    }
    if (no === 7) {
      const areas = master.areas.filter((a) => /rodent/i.test(a.context)).map((a) => a.name);
      qs.push({
        id: "rodentCatch",
        label: "Rodent catch",
        ask: "Which trap box caught it, where is that box, and how many rodents? (e.g. \"RB-27, Canteen, 1\")",
        type: "text",
        answered: (x) => holiday(x) || cpValue(x, 7) !== "Yes" || ((x.rodentCatches as unknown[] | undefined)?.length ?? 0) > 0,
        parse: (raw) => {
          const box = raw.match(/\b(rb\s*-?\s*\d+|box\s*(?:no\.?\s*)?\d+|\d+)\b/i);
          if (!box && !raw.trim()) return null;
          const trapBoxNo = box ? box[1].toUpperCase().replace(/^BOX\s*(?:NO\.?\s*)?/, "RB-").replace(/^RB\s*-?\s*/, "RB-").replace(/^(\d+)$/, "RB-$1") : "";
          let rest = box ? raw.replace(box[0], " ") : raw;
          const count = rest.match(/\b(\d{1,2})\b(?!\s*(?:st|nd|rd|th)\b)/);
          const n = count ? Number(count[1]) : 1;
          if (count) rest = rest.replace(count[0], " ");
          const words = rest.toLowerCase().replace(/[^a-z0-9& ]+/g, " ").split(/\s+/).filter((w) => w && !["and", "in", "at", "the", "a", "rodent", "rodents", "rat", "rats", "mouse", "mice", "trap", "box"].includes(w));
          const area = areas.find((a) => words.length > 0 && words.every((w) => a.toLowerCase().includes(w))) ?? areas.find((a) => words.some((w) => w.length > 3 && a.toLowerCase().includes(w)));
          const location = area ?? rest.replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim();
          if (!location) return null;
          return { trapBoxNo, location, count: Math.max(1, n) };
        },
        apply: (x, v) => ({ ...x, rodentCatches: [...((x.rodentCatches as unknown[]) ?? []), { id: generateId("catch"), ...(v as Obj) }] }),
        ack: (v) => {
          const c = v as { trapBoxNo: string; location: string; count: number };
          return `Logged ${c.count} rodent${c.count === 1 ? "" : "s"} in ${c.trapBoxNo || "the box"} at ${c.location}.`;
        },
      });
    }
  }

  qs.push({
    id: "timeOfChecking",
    label: "Time of checking",
    ask: "What time was the round done?",
    type: "time",
    suggestions: [{ label: "Now", value: "now" }, ...chips("09:15", "09:30")],
    answered: (x) => holiday(x) || !blank(x.timeOfChecking),
    apply: (x, v) => ({ ...x, timeOfChecking: v }),
  });
  qs.push(
    textQ("checker", "Checker", "Who did the round (checker's name)?", (x) => x.checker, (x, v) => ({ ...x, checker: v }), {
      suggestions: people(master, "checker", "fly catcher cleaning"),
      answered: (x) => holiday(x) || !blank(x.checker),
    })
  );

  // A check point answered the "finding" way wants its action on the Summary
  // of Actions, as the printed form asks.
  const flagged = (x: Obj) => master.checkpoints.filter((cp) => cp.flagWhen && cpValue(x, Number(cp.no)) === cp.flagWhen && Number(cp.no) !== 7);
  qs.push({
    id: "summaryAction",
    label: "Action taken",
    ask: "A check point is recorded as a finding — what action was taken? (one line for the Summary of Actions)",
    type: "text",
    optional: true,
    answered: (x) => holiday(x) || flagged(x).length === 0 || ((x.summaryActions as unknown[] | undefined)?.length ?? 0) > 0,
    apply: (x, v) => ({
      ...x,
      summaryActions: [
        ...((x.summaryActions as unknown[]) ?? []),
        {
          id: generateId("act"),
          dateOfObservation: record.dueDate,
          descriptionOfObservation: flagged(x)
            .map((cp) => `Check point ${cp.no}: ${cp.text}`)
            .join("; "),
          actionTaken: String(v),
          remarks: "",
        },
      ],
    }),
  });

  void today;
  return { intro: "the ten check points, then the time and who did the round", questions: qs };
}

// ---------------------------------------------------------------------------
// 2. Fly Catcher Inspection & Cleaning Record (F/HR/18)

function flyPlan(d: FlyCatcherData, master: MasterData): InterviewPlan {
  const qs: InterviewQuestion[] = [];
  const entries = (x: Obj) => ((x.entries as Obj[]) ?? []);
  const mapEntries = (x: Obj, fn: (e: Obj) => Obj): Obj => ({ ...x, entries: entries(x).map(fn) });
  for (const e of d.entries ?? []) {
    const where = master.pcLocations.find((p) => p.id === e.pcId)?.location;
    qs.push({
      id: `count-${e.pcId}`,
      label: `${e.pcId} flies`,
      ask: `${e.pcId}${where ? ` (${where})` : ""}: about how many flies were caught?`,
      type: "number",
      suggestions: chips("0", "1", "2", "3", "5", "8"),
      answered: (x) => !blank(entries(x).find((en) => en.pcId === e.pcId)?.catchCountApprox),
      apply: (x, v) => mapEntries(x, (en) => (en.pcId === e.pcId ? { ...en, catchCountApprox: Number(v) } : en)),
    });
  }
  qs.push({
    id: "cleaningDoneBy",
    label: "Cleaning done by",
    ask: "Who cleaned the units? (the same name goes against every unit)",
    type: "text",
    suggestions: people(master, "fly catcher cleaning", "checker"),
    answered: (x) => entries(x).length > 0 && entries(x).every((en) => !blank(en.cleaningDoneBy)),
    apply: (x, v) => mapEntries(x, (en) => ({ ...en, cleaningDoneBy: blank(en.cleaningDoneBy) ? String(v) : en.cleaningDoneBy })),
  });
  qs.push({
    id: "verifiedBy",
    label: "Verified by",
    ask: "Who verified the cleaning?",
    type: "text",
    optional: true,
    suggestions: people(master, "checker", "client contact"),
    answered: (x) => entries(x).length > 0 && entries(x).every((en) => !blank(en.verifiedBy)),
    apply: (x, v) => mapEntries(x, (en) => ({ ...en, verifiedBy: blank(en.verifiedBy) ? String(v) : en.verifiedBy })),
  });
  qs.push({
    id: "tubeLightInstall",
    label: "Tube light install date",
    ask: "When were the tube lights last changed? (one date for all units — Skip if the dates on the form are right)",
    type: "date",
    optional: true,
    // The register's own date first: it is fixed for every unit
    // (REQUIREMENTS §44), so normally the form already has it and this
    // question does not come up at all. The due date follows at +364 days,
    // which is what makes 24-11-2025 fall due on 23-11-2026.
    suggestions: [{ label: "24-11-2025, as on the register", value: TUBE_LIGHT_INSTALLED }, { label: "Today", value: "today" }],
    // Both dates, not just the install one: a sheet with an install date and a
    // blank due date would never be asked about otherwise.
    answered: (x) =>
      entries(x).length > 0 && entries(x).every((en) => !blank(en.tubeLightInstallDate) && !blank(en.tubeLightDueDate)),
    apply: (x, v) =>
      mapEntries(x, (en) => ({
        ...en,
        tubeLightInstallDate: blank(en.tubeLightInstallDate) ? String(v) : en.tubeLightInstallDate,
        // The register's own install date has its own stated due date; any
        // other date a person gives is a tube changed since, and carries a
        // year's validity from that day — which is the same rule the
        // register's own pair follows (REQUIREMENTS §44).
        tubeLightDueDate: blank(en.tubeLightDueDate)
          ? String(v) === TUBE_LIGHT_INSTALLED
            ? TUBE_LIGHT_DUE
            : addDays(String(v), 364)
          : en.tubeLightDueDate,
      })),
  });
  return { intro: `the flies caught at each of the ${d.entries?.length ?? 0} units, then who cleaned and verified`, questions: qs };
}

// ---------------------------------------------------------------------------
// 3. Pest Control Service Report

function servicePlan(doc: DocumentDefinition, d: ServiceReportData, master: MasterData): InterviewPlan {
  const qs: InterviewQuestion[] = [];
  const lines = (x: Obj) => ((x.lines as Obj[]) ?? []);
  const materials = Array.from(new Set((d.lines ?? []).map((l) => l.materialName).filter(Boolean)));
  const typical = (m: string) => (m === "Glue Board" ? "4" : m === "Bromadiolone Cake" ? "35 grams" : /deltamethrin/i.test(m) ? "150 ml" : /cyfluthrin/i.test(m) ? "125 ml" : "");
  for (const m of materials) {
    qs.push({
      id: `qty-${m}`,
      label: `${m} used`,
      ask: `How much ${m} was used in all?${typical(m) ? ` (e.g. ${typical(m)})` : ""}`,
      type: "text",
      suggestions: typical(m) ? chips(typical(m)) : undefined,
      answered: (x) => !blank(lines(x).find((l) => l.materialName === m)?.qtyUsed),
      apply: (x, v) => ({ ...x, lines: lines(x).map((l) => (l.materialName === m ? { ...l, qtyUsed: String(v) } : l)) }),
    });
  }
  const isRodent = /rodent/i.test(doc.variantKey ?? "");
  const nothing = isRodent ? "No Rodent Trapped" : "-";
  qs.push({
    id: "remarks",
    label: "Remarks",
    ask: `Anything to note against any area? Type lines like "Canteen: bait consumed - replaced" — or tap Nothing to note (every area then reads "${nothing}").`,
    type: "text",
    suggestions: [{ label: "Nothing to note", value: "__none__" }],
    answered: (x) => lines(x).length > 0 && lines(x).every((l) => !blank(l.remarks)),
    apply: (x, v) => {
      const raw = String(v);
      const notes = raw === "__none__" ? [] : raw.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean);
      const next = lines(x).map((l) => ({ ...l }));
      for (const note of notes) {
        const m = note.match(/^(.+?)\s*[:\-–]\s*(.+)$/);
        const areaWords = (m ? m[1] : note).toLowerCase().split(/[^a-z0-9&]+/).filter((w) => w.length > 2);
        const remark = m ? m[2].trim() : note;
        const hit = next.find((l) => areaWords.length > 0 && areaWords.every((w) => String(l.areaName).toLowerCase().includes(w)));
        if (hit) hit.remarks = remark;
      }
      for (const l of next) if (blank(l.remarks)) l.remarks = nothing;
      return { ...x, lines: next };
    },
    ack: (v) => (String(v) === "__none__" ? `Every area marked "${nothing}".` : "Remarks written against the areas you named; the rest marked routine."),
  });
  qs.push(textQ("technicianSign", "Technician", "Which technician did the service?", (x) => x.technicianSign, (x, v) => ({ ...x, technicianSign: v }), { suggestions: people(master, "technician") }));
  qs.push(
    textQ("customerSign", "Customer's representative", "Who countersigned for the site? (Skip if not yet)", (x) => x.customerSign, (x, v) => ({ ...x, customerSign: v }), {
      optional: true,
      suggestions: people(master, "client contact"),
    })
  );
  return { intro: "the quantity of each material, any remarks by area, then the technician and the site's countersignature", questions: qs };
}

// ---------------------------------------------------------------------------
// 4. The lamination / QC log sheets

function fieldType(f: LogHeaderField): AnswerType {
  return f.type === "select" ? "select" : f.type === "date" ? "date" : f.type === "time" ? "time" : f.type === "number" ? "number" : f.type === "yesno" ? "yesno" : "text";
}

function logSheetPlan(doc: DocumentDefinition, record: RecordInstance, d: LogSheetData, master: MasterData): InterviewPlan | null {
  const layout = getLogSheetLayout(doc.id);
  if (!layout) return null;
  const qs: InterviewQuestion[] = [];
  const header = (x: Obj) => ((x.header as Record<string, string>) ?? {});
  const rows = (x: Obj) => ((x.rows as LogSheetRow[]) ?? []);
  const setHeader = (x: Obj, key: string, v: unknown): Obj => ({ ...x, header: { ...header(x), [key]: String(v ?? "") } });

  // The person an HR form is about can be answered with a GP3 No. or a name on
  // HR Master Data, which fills their other blank boxes too — so those
  // questions are not asked (REQUIREMENTS §53).
  const link = hrMasterLinkFor(doc.id);
  const personKey = link?.where === "header" ? link.nameField : null;

  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) {
    if (link && f.key === personKey) {
      qs.push({
        id: `h-${f.key}`,
        label: f.label,
        ask: `${f.label}? (a GP3 No. or a name on HR Master Data fills in the rest)`,
        type: "text",
        optional: !f.required,
        answered: (x) => !blank(header(x)[f.key]),
        parse: (raw) => {
          const text = raw.trim();
          if (!text) return null;
          const { exact } = searchPeople(text, hrMasterRepository.all());
          if (exact) return { personId: exact.id };
          // A number is a GP3 No., never a name.
          return /\d/.test(text) && !/[a-z]{3,}/i.test(text.replace(/\bgp\s*-?\s*3\b|\bno\b\.?/gi, "")) ? { unknownNumber: text } : text;
        },
        validate: (v) =>
          typeof v === "object" && v && "unknownNumber" in v
            ? `No one on HR Master Data has the GP3 No. "${(v as { unknownNumber: string }).unknownNumber}" — give their name, or add them to the sheet first.`
            : null,
        apply: (x, v) => {
          const person = typeof v === "object" && v ? hrMasterRepository.get((v as { personId: string }).personId) : undefined;
          if (!person) return setHeader(x, f.key, v);
          const current = { ...header(x), [f.key]: "" };
          const { fills } = personFill(link, person, current);
          return { ...x, header: applyFills(current, fills) };
        },
        ack: (v) => {
          const person = typeof v === "object" && v ? hrMasterRepository.get((v as { personId: string }).personId) : undefined;
          return person ? `${f.label}: ${person.fullName} — from HR Master Data (${describePerson(person)}); the rest of their details are filled in.` : `${f.label}: ${String(v)}.`;
        },
      });
      continue;
    }
    const isReason = f.key === "deviationReason";
    const suggestion = layout.specimenHeader?.[f.key] ?? (f.autoFill?.default !== undefined ? String(f.autoFill.default) : undefined);
    qs.push({
      id: `h-${f.key}`,
      label: f.label,
      ask: isReason ? "The lot is not Accepted — what is the reason for the deviation / rejection / segregation?" : `${f.label}?`,
      type: fieldType(f),
      options: f.options,
      suggestions: f.type === "select" ? chips(...(f.options ?? [])) : f.autoFill?.sign ? people(master, "qc", "qa", "operator") : suggestion ? chips(suggestion) : undefined,
      optional: !f.required && !isReason,
      answered: (x) => (isReason ? blank(header(x).lotStatus) || header(x).lotStatus === "Accepted" || !blank(header(x)[f.key]) : !blank(header(x)[f.key])),
      apply: (x, v) => setHeader(x, f.key, v),
    });
  }

  const typicalRows = (): LogSheetRow[] => {
    const filled = autoFillRecord(doc, record.dueDate, master, latestConfirmedRecord(doc.id, record.dueDate, record.isDemo));
    return ((filled?.data as LogSheetData | undefined)?.rows ?? []).map((r) => ({ ...r }));
  };
  const editable = layout.columns.filter((c) => !c.fixed);
  const mode = layout.rowMode;

  if (mode.kind === "timeSlots") {
    const main = editable.find((c) => c.type === "number") ?? editable[0];
    const signCol = editable.find((c) => c.autoFill?.sign);
    qs.push({
      id: "rows",
      label: "Readings",
      ask: `The ${mode.slots.length} time slots — tap "Fill typical readings for me", or type the readings as time and value pairs (e.g. "11:00 20.4, 12:00 20.6").`,
      type: "text",
      suggestions: [{ label: "Fill typical readings for me", value: "__typical__" }],
      answered: (x) => rows(x).length > 0 && rows(x).every((r) => !blank(r[main.key])),
      apply: (x, v) => {
        if (String(v) === "__typical__") return { ...x, rows: typicalRows() };
        const typical = typicalRows();
        const next = rows(x).map((r) => ({ ...r }));
        for (const m of String(v).matchAll(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/gi)) {
          const time = normTime(m[1]);
          const row = time ? next.find((r) => normTime(r[mode.slotKey]) === time) : undefined;
          if (!row) continue;
          row[main.key] = Number(m[2]);
          if (signCol && blank(row[signCol.key])) {
            const t = typical.find((r) => normTime(r[mode.slotKey]) === time);
            if (t) row[signCol.key] = t[signCol.key];
          }
        }
        return { ...x, rows: next };
      },
      ack: (v) => (String(v) === "__typical__" ? "Filled every slot with a typical reading (check them against the register)." : "Written into the slots you named."),
    });
  } else if (mode.kind === "fixedRows") {
    const obsCol = editable.find((c) => c.key === "observation" || c.key === "grade") ?? editable[0];
    mode.rows.forEach((fixed, i) => {
      const parameter = String(fixed.parameter ?? `Row ${i + 1}`);
      const spec = fixed.specification ? ` (spec: ${fixed.specification})` : "";
      const specimen = layout.specimenRows?.[i]?.[obsCol.key];
      qs.push({
        id: `row-${i}`,
        label: parameter,
        ask: `${parameter}${spec} — ${obsCol.label.split(" (")[0].toLowerCase()}?`,
        type: obsCol.type === "select" ? "select" : obsCol.type === "number" ? "number" : "text",
        options: obsCol.options,
        suggestions: obsCol.options ? chips(...obsCol.options) : specimen !== undefined && specimen !== null && specimen !== "" ? chips(String(specimen), "OK") : chips("OK", "PASS"),
        answered: (x) => !blank(rows(x)[i]?.[obsCol.key]),
        apply: (x, v) => {
          const next = rows(x).map((r) => ({ ...r }));
          while (next.length <= i) next.push({ id: generateId("row"), ...mode.rows[next.length] });
          next[i][obsCol.key] = v as string | number;
          return { ...x, rows: next };
        },
      });
    });
  } else if (mode.kind === "single") {
    for (const col of editable) {
      qs.push({
        id: `col-${col.key}`,
        label: col.label,
        ask: `${col.label}${col.unit ? ` (${col.unit})` : ""}?`,
        type: col.type === "select" ? "select" : col.type === "number" ? "number" : col.type === "time" ? "time" : col.type === "date" ? "date" : col.type === "yesno" ? "yesno" : "text",
        options: col.options,
        suggestions: col.autoFill?.sign ? people(master, "qc", "qa") : col.nominal !== undefined ? chips(String(col.nominal)) : undefined,
        optional: !col.required,
        answered: (x) => !blank(rows(x)[0]?.[col.key]),
        apply: (x, v) => {
          const next = rows(x).map((r) => ({ ...r }));
          if (next.length === 0) next.push({ id: generateId("row") });
          next[0][col.key] = v as string | number;
          return { ...x, rows: next };
        },
      });
    }
  } else {
    const cols = editable.filter((c) => !c.autoFill?.sign);
    qs.push({
      id: "rows",
      label: "Rows",
      ask: `Today's rows — tap "Fill typical rows for me", or type one row per line with the values in this order: ${cols.map((c) => c.label.split(" (")[0]).join(", ")}.`,
      type: "text",
      suggestions: [{ label: "Fill typical rows for me", value: "__typical__" }],
      answered: (x) => rows(x).length > 0 && rows(x).some((r) => cols.some((c) => !blank(r[c.key]))),
      apply: (x, v) => {
        if (String(v) === "__typical__") return { ...x, rows: typicalRows() };
        const template = typicalRows()[0];
        const added: LogSheetRow[] = String(v)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const values = line.split(/,|\t|\|/).map((s) => s.trim());
            const row: LogSheetRow = { id: generateId("row") };
            for (const c of layout.columns) if (c.autoFill?.sign && template) row[c.key] = template[c.key] ?? "";
            cols.forEach((c, i) => {
              const raw = values[i];
              if (raw === undefined || raw === "") return;
              row[c.key] = c.type === "number" ? normNumber(raw) : c.type === "time" ? normTime(raw) ?? raw : raw;
            });
            return row;
          });
        return { ...x, rows: [...rows(x), ...added] };
      },
      ack: (v) => (String(v) === "__typical__" ? "Filled the rows the way today's sheet would typically read — check them against the register." : "Rows added."),
    });
  }
  return { intro: "the header details, then the readings", questions: qs };
}

// ---------------------------------------------------------------------------
// 5. CAPA — Internal: the inspection findings report

function inspectionPlan(d: GapInspectionData, today: string): InterviewPlan {
  const qs: InterviewQuestion[] = [];
  const findings = (x: Obj) => ((x.findings as GapFinding[]) ?? []);
  const ensure = (x: Obj, i: number): Obj => {
    const list = findings(x).map((f) => ({ ...f }));
    while (list.length <= i) {
      list.push({
        id: generateId("finding"),
        sNo: list.length + 1,
        findingOfInspection: "",
        commentsOnFindings: "",
        correctiveActionContractor: "NA",
        correctiveActionClient: "",
        targetDate: null,
        actualDateOfAction: null,
        verifiedByServiceProvider: "",
        status: "Open",
        source: "Internal",
      });
    }
    return { ...x, findings: list };
  };
  const setFinding = (x: Obj, i: number, patch: Partial<GapFinding>): Obj => {
    const y = ensure(x, i);
    return { ...y, findings: findings(y).map((f, j) => (j === i ? { ...f, ...patch } : f)) };
  };

  qs.push(dateQ("inspectionDate", "Inspection date", "When was the inspection done?", (x) => x.inspectionDate, (x, v) => ({ ...x, inspectionDate: v })));
  qs.push(
    textQ("contactPerson", "Contact person", "Who was the site's contact person for the inspection?", (x) => x.contactPerson, (x, v) => ({ ...x, contactPerson: v }), {
      suggestions: chips("Ms. Kapila Barad", "Chirag Parmar"),
    })
  );

  const n = Math.max(1, d.findings?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const f = (x: Obj) => findings(x)[i];
    qs.push(
      textQ(`f${i}-text`, `Finding ${i + 1}`, `Finding ${i + 1} — what did the inspection find?`, (x) => f(x)?.findingOfInspection, (x, v) => setFinding(x, i, { findingOfInspection: v }), {
        suggestions: i === 0 ? chips("Gap below the RM inward shutter", "Fly killer unit found switched off", "Material stored against the wall") : undefined,
      })
    );
    qs.push(
      textQ(`f${i}-comment`, `Finding ${i + 1} — comments`, "Comments on the finding — why does it matter? (or Skip)", (x) => f(x)?.commentsOnFindings, (x, v) => setFinding(x, i, { commentsOnFindings: v }), {
        optional: true,
      })
    );
    qs.push(textQ(`f${i}-action`, `Finding ${i + 1} — corrective action`, "What is the corrective action for the site?", (x) => f(x)?.correctiveActionClient, (x, v) => setFinding(x, i, { correctiveActionClient: v })));
    qs.push({
      id: `f${i}-target`,
      label: `Finding ${i + 1} — target date`,
      ask: "By when should it be done (target date)?",
      type: "date",
      optional: true,
      suggestions: [
        { label: "In 7 days", value: addDays(today, 7) },
        { label: "In 15 days", value: addDays(today, 15) },
        { label: "In 30 days", value: addDays(today, 30) },
      ],
      answered: (x) => !blank(f(x)?.targetDate),
      apply: (x, v) => setFinding(x, i, { targetDate: String(v) }),
    });
    qs.push({
      id: `f${i}-source`,
      label: `Finding ${i + 1} — source`,
      ask: "Was this raised internally (our own or the service provider's inspection) or by an outside party (auditor / customer / regulator)?",
      type: "select",
      options: ["Internal", "External"],
      suggestions: chips("Internal", "External"),
      optional: true,
      answered: () => false,
      apply: (x, v) => setFinding(x, i, { source: v as GapFinding["source"] }),
    });
    if (i === n - 1) {
      qs.push({
        id: `f${i}-more`,
        label: "Another finding",
        ask: "Is there another finding?",
        type: "yesno",
        suggestions: YES_NO,
        answered: (x) => blank(f(x)?.findingOfInspection),
        apply: (x, v) => (v === "Yes" ? ensure(x, i + 1) : x),
        ack: (v) => (v === "Yes" ? `Finding ${i + 2}, then.` : "That's all the findings."),
      });
    }
  }
  qs.push({
    id: "generalComments",
    label: "General comments",
    ask: "Any general comments for the site? (one per line — or Skip)",
    type: "list",
    optional: true,
    answered: (x) => ((x.generalComments as unknown[] | undefined)?.length ?? 0) > 0,
    apply: (x, v) => ({ ...x, generalComments: [...((x.generalComments as string[]) ?? []), ...(v as string[])] }),
  });
  return { intro: "the inspection details, then each finding with its corrective action and target date", questions: qs };
}

// ---------------------------------------------------------------------------
// 6. Training record

function trainingPlan(d: TrainingRecordData): InterviewPlan {
  const qs: InterviewQuestion[] = [];
  const attendees = (x: Obj) => ((x.attendees as Obj[]) ?? []);
  qs.push(dateQ("trainingDate", "Training date", "When was the training held?", (x) => x.trainingDate, (x, v) => ({ ...x, trainingDate: v })));
  qs.push(
    textQ("trainingType", "Training type", "What training was it?", (x) => x.trainingType, (x, v) => ({ ...x, trainingType: v }), {
      suggestions: chips("Pest Control Awareness Training Program (annual)", "Technician Training & Certification"),
    })
  );
  qs.push(textQ("trainerProvider", "Trainer / provider", "Who conducted it (trainer / provider)?", (x) => x.trainerProvider, (x, v) => ({ ...x, trainerProvider: v }), { suggestions: chips("Gurudev Pest Control") }));
  qs.push({
    id: "topics",
    label: "Topics",
    ask: 'Which topics were covered? (one per line, or tap "Use the standard awareness topics")',
    type: "list",
    suggestions: [{ label: "Use the standard awareness topics", value: "__standard__" }],
    answered: (x) => ((x.topics as unknown[] | undefined)?.length ?? 0) > 0,
    apply: (x, v) => {
      const items = v as string[];
      const topics = items.length === 1 && items[0] === "__standard__" ? [...SEED_AWARENESS_TRAINING_RECORD.data.topics] : items;
      return { ...x, topics };
    },
    ack: (v) => {
      const items = v as string[];
      return items.length === 1 && items[0] === "__standard__" ? `The ${SEED_AWARENESS_TRAINING_RECORD.data.topics.length} standard topics are on the record.` : `${items.length} topic${items.length === 1 ? "" : "s"} written.`;
    },
  });
  qs.push({
    id: "attendees",
    label: "Attendance",
    ask: `Who attended? Names separated by commas — or "everyone".${d.attendees?.length ? ` (${d.attendees.length} names are carried forward on the form.)` : ""}`,
    type: "text",
    suggestions: [{ label: "Everyone attended", value: "everyone" }],
    answered: (x) => attendees(x).length > 0,
    apply: (x, v) => {
      const raw = String(v).trim();
      if (/^(everyone|everybody|all|all of them|all attended)$/i.test(raw)) {
        // "Everyone" on a form with no list yet means the usual attendees —
        // the plant's awareness-programme list.
        const list = attendees(x).length ? attendees(x) : SEED_AWARENESS_TRAINING_RECORD.data.attendees.map((a) => ({ ...a, id: generateId("att") }));
        return { ...x, attendees: list };
      }
      // The names given ARE the attendance sheet: anybody carried forward who
      // is not named is taken off it, since the list no longer carries a tick
      // to leave them unmarked with.
      const names = raw.split(/,|;|\band\b|\r?\n/).map((s) => s.trim()).filter(Boolean);
      const carried = attendees(x).map((a) => ({ ...a }));
      const list: Obj[] = [];
      for (const name of names) {
        const words = name.toLowerCase().replace(/^(mr|ms|mrs)\.?\s+/, "").split(/\s+/).filter(Boolean);
        const hit = carried.find((a) => words.every((w) => String(a.employeeName).toLowerCase().includes(w)));
        if (hit) list.push(hit);
        else list.push({ id: generateId("att"), employeeName: name, department: COMPANY.shortName });
      }
      return { ...x, attendees: list };
    },
    ack: (v) => (/^(everyone|everybody|all)/i.test(String(v)) ? "Everyone on the list is marked as having attended." : "The attendance sheet now holds the names you gave."),
  });
  qs.push(textQ("certificateRef", "Certificate reference", "Certificate / attendance sheet reference? (or Skip)", (x) => x.certificateRef, (x, v) => ({ ...x, certificateRef: v }), { optional: true }));
  qs.push(textQ("remarks", "Remarks", "Any remarks? (or Skip)", (x) => x.remarks, (x, v) => ({ ...x, remarks: v }), { optional: true }));
  return { intro: "the session details, the topics and who attended", questions: qs };
}

// ---------------------------------------------------------------------------
// 7. CAPA — Internal: the complaint acknowledgement report (QA-CAF-00)

function complaintAckPlan(d: ComplaintAckData, master: MasterData): InterviewPlan {
  const qs: InterviewQuestion[] = [];
  const set = (key: keyof ComplaintAckData) => (x: Obj, v: string) => ({ ...x, [key]: v });
  const get = (key: keyof ComplaintAckData) => (x: Obj) => x[key];
  const fgRule = codeRulesFor("complaint-ack").fgCode;
  qs.push(dateQ("reportDate", "Date", "What date is the report?", get("reportDate"), set("reportDate")));
  qs.push(textQ("toName", "To", "Who is the complaint being explained to (the employee's name)?", get("toName"), set("toName"), { suggestions: people(master, "operator", "inspector") }));
  qs.push(textQ("toDesignation", "Designation", "Their designation?", get("toDesignation"), set("toDesignation"), { suggestions: chips("Machine Operator", "Shift In-charge", "QC Inspector") }));
  qs.push(textQ("customerName", "Customer", "Which customer raised the complaint?", get("customerName"), set("customerName")));
  qs.push(
    textQ("fgCode", "FG code", `FG code of the job? (like ${FG_CODE_EXAMPLE})`, get("fgCode"), (x, v) => ({ ...x, fgCode: fgRule ? fgRule.normalise(v) : v }), {
      validate: (v) => (fgRule ? fgRule.problem(String(v)) : null),
    })
  );
  qs.push(dateQ("complaintReceivedOn", "Complaint received on", "When was the complaint received?", get("complaintReceivedOn"), set("complaintReceivedOn")));
  qs.push(textQ("jobName", "Job name", "Which job is it about?", get("jobName"), set("jobName")));
  qs.push(textQ("complaintType", "Complaint type", "What type of complaint is it?", get("complaintType"), set("complaintType"), { suggestions: chips(...CAF_COMPLAINT_TYPES, "Packing related", "Delivery related") }));
  qs.push(textQ("complaintSubType", "Complaint sub-type", "And the sub-type?", get("complaintSubType"), set("complaintSubType"), { suggestions: chips(...CAF_COMPLAINT_SUB_TYPES, "Seal failure", "Registration shift") }));
  qs.push(textQ("scenario", "Scenario", "Describe the scenario — what happened, as the customer reported it.", get("scenario"), set("scenario")));
  qs.push(textQ("rootCause", "Root cause", "What was the root cause?", get("rootCause"), set("rootCause")));
  qs.push(textQ("correctiveAction", "Corrective action", "What corrective action was taken?", get("correctiveAction"), set("correctiveAction")));
  qs.push(textQ("preventiveAction", "Preventive action", "And the preventive action, so it doesn't recur?", get("preventiveAction"), set("preventiveAction")));
  qs.push(
    textQ("employeeName", "Employee (acknowledgement)", "Who signs the acknowledgement (the employee's name)?", get("employeeName"), set("employeeName"), {
      suggestions: d.toName ? chips(d.toName) : undefined,
    })
  );
  qs.push(dateQ("employeeSignDate", "Signed on", "When did they sign?", get("employeeSignDate"), set("employeeSignDate"), { optional: true }));
  return { intro: "who it is addressed to, the complaint, what happened, the root cause and the actions", questions: qs };
}

// ---------------------------------------------------------------------------
// 8. Responsibilities of Pest Control — the two signatures

function responsibilitiesPlan(d: PestResponsibilitiesData): InterviewPlan {
  const qs: InterviewQuestion[] = [];
  const party = (key: "client" | "provider", who: string, nameChips: string[], desigChips: string[]) => {
    const get = (field: string) => (x: Obj) => ((x[key] as Obj) ?? {})[field];
    const set = (field: string) => (x: Obj, v: string) => ({ ...x, [key]: { ...((x[key] as Obj) ?? {}), [field]: v } });
    qs.push(textQ(`${key}-name`, `${who} — name`, `Who signs for ${who.toLowerCase()}?`, get("name"), set("name"), { suggestions: chips(...nameChips) }));
    qs.push(textQ(`${key}-designation`, `${who} — designation`, "Their designation?", get("designation"), set("designation"), { suggestions: chips(...desigChips) }));
    if (key === "client") qs.push(textQ(`${key}-department`, `${who} — department`, "Their department?", get("department"), set("department"), { suggestions: chips("Purchase", "Quality", "Administration") }));
    qs.push(dateQ(`${key}-dated`, `${who} — dated`, "Dated?", get("dated"), set("dated")));
  };
  party("client", "the site (client)", ["Chirag Parmar", "Ms. Kapila Barad"], ["Manager", "Manager, Purchase"]);
  party("provider", "the service provider", ["Rohit Patel"], ["Owner", "Proprietor"]);
  void d;
  return { intro: "the two signatures — the printed responsibilities stay as issued", questions: qs };
}

// ---------------------------------------------------------------------------
// 9. The service agreement — what the format leaves TO BE CONFIRMED

function agreementPlan(d: ServiceAgreementData): InterviewPlan {
  const qs: InterviewQuestion[] = [];
  const isTbc = (v: unknown) => blank(v) || String(v).includes(TBC);
  qs.push(
    textQ("agreementNo", "Agreement No.", "What is the agreement number?", (x) => x.agreementNo, (x, v) => ({ ...x, agreementNo: v }), {
      answered: (x) => !isTbc(x.agreementNo),
      suggestions: chips(`GPC/AG/${(d.effectiveFrom || todayISO()).slice(0, 4)}/001`),
    })
  );
  qs.push(dateQ("effectiveFrom", "Effective from", "From which date does the agreement run?", (x) => x.effectiveFrom, (x, v) => ({ ...x, effectiveFrom: v })));
  qs.push({
    id: "effectiveTo",
    label: "Effective to",
    ask: "Until which date? (the term is two years)",
    type: "date",
    suggestions: [{ label: "Two years from the start", value: "__term__" }],
    answered: (x) => !blank(x.effectiveTo),
    parse: (raw) => (raw === "__term__" ? "__term__" : readDate(raw, todayISO())),
    apply: (x, v) => ({ ...x, effectiveTo: v === "__term__" ? termEnd(String(x.effectiveFrom || todayISO())) : String(v) }),
    ack: (v) => (v === "__term__" ? "Set to the end of the two-year term." : `Effective to: ${display(v)}.`),
  });
  (d.commercialTerms ?? []).forEach((line, i) => {
    const head = line.split(":")[0];
    qs.push({
      id: `commercial-${i}`,
      label: head,
      ask: `${head}?`,
      type: "text",
      optional: true,
      answered: (x) => !isTbc(((x.commercialTerms as string[]) ?? [])[i]),
      apply: (x, v) => ({ ...x, commercialTerms: ((x.commercialTerms as string[]) ?? []).map((l, j) => (j === i ? `${head}: ${String(v)}` : l)) }),
    });
  });
  (d.generalTerms ?? []).forEach((line, i) => {
    if (!line.includes(TBC)) return;
    const what = /notice period/i.test(line) ? "notice period for ending the agreement" : /indemnif/i.test(line) ? "extent of the provider's indemnity" : `clause ${i + 1}`;
    qs.push({
      id: `general-${i}`,
      label: what,
      ask: `What is the ${what}? (the clause says TO BE CONFIRMED)`,
      type: "text",
      optional: true,
      suggestions: /notice period/i.test(line) ? chips("thirty days", "sixty days") : undefined,
      answered: (x) => !String(((x.generalTerms as string[]) ?? [])[i] ?? "").includes(TBC),
      apply: (x, v) => ({ ...x, generalTerms: ((x.generalTerms as string[]) ?? []).map((l, j) => (j === i ? l.replace(/is TO BE CONFIRMED/, `is ${String(v)}`).replace(TBC, String(v)) : l)) }),
    });
  });
  const signatory = (key: "clientSignatory" | "providerSignatory", who: string, nameChips: string[], desigChips: string[]) => {
    const get = (field: string) => (x: Obj) => ((x[key] as Obj) ?? {})[field];
    const set = (field: string) => (x: Obj, v: string) => ({ ...x, [key]: { ...((x[key] as Obj) ?? {}), [field]: v } });
    qs.push(textQ(`${key}-name`, `${who} — signed by`, `Who signs for ${who.toLowerCase()}?`, get("name"), set("name"), { suggestions: chips(...nameChips) }));
    qs.push(textQ(`${key}-designation`, `${who} — designation`, "Their designation?", get("designation"), set("designation"), { suggestions: chips(...desigChips) }));
    qs.push(dateQ(`${key}-dated`, `${who} — dated`, "Dated?", get("dated"), set("dated")));
  };
  signatory("clientSignatory", "the client", [d.client?.contactName || "Chirag Parmar"], [d.client?.designation || "Manager, Purchase"]);
  signatory("providerSignatory", "the service provider", [d.provider?.contactName || "Rohit Patel"], [d.provider?.designation || "Owner"]);
  return { intro: "the agreement number and term, the commercial terms the format leaves open, and the two signatures", questions: qs };
}
