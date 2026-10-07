// MITRA FILLS THE RECORD, ON THE WEBSITE (REQUIREMENTS §94).
//
// One hook for both hosts, the dock (components/common/DocumentAssistant.tsx)
// and the Ask Mitra page (pages/AssistantPage.tsx). A message is read by DCRS's
// own rules first (engine/fillRequest.ts) — with no key and no network too.
// When it is a fill:
//
//   1. the document, the day and the record are settled, asking when they are
//      not certain (which form, which vehicle's record, "kal" = which day);
//      a record that is not open for writing is refused before anything else;
//   2. the values: the rules' reading when it is whole (no model call, 0
//      tokens), else ONE small JSON call (POST /api/assistant/fill, about 500 to
//      1,000 tokens) with the form's card, merged with the rules' reading;
//   3. the plan, on a copy (engine/fillPlan.ts): nothing is opened, started or
//      written yet, so a spent allowance or a "No" leaves everything as it was;
//   4. a finding or a reading out of limits: one yes/no before it is written;
//   5. the write: the record started or opened, saved through its page's own
//      commit or as a draft, never submitted unless the words asked for it;
//      the record opened on screen with the changed boxes glowing for 2 s;
//   6. the reply, from DCRS's fixed sentences in the person's language
//      (i18n/fillPhrases.ts), listing every box written, "label: before → after".
//
// A bare "fill it" gets three offers (ask me each box, copy from the last
// checked record, sample data marked made up), or, on a record the app
// prepared, the estimates are named and offered for checking. The agent's
// fill_record tool (engine/mitraTools.ts) hands its fills to the same flow.
import { useRef } from "react";
import type { AssistantTarget } from "../../store/AssistantContext";
import type { ChipAction } from "../../engine/guidedChecklist";
import type { MitraStep, MitraToolContext, MitraToolResult } from "../../engine/mitraTypes";
import { ApiError, assistantApi } from "../../api/client";
import { assistantConfigured } from "../../engine/features";
import { modelReachable } from "../../engine/assistantReach";
import { readFillRequest, type FillRequest, type FillValues } from "../../engine/fillRequest";
import { candidateLines, exampleFor, formCard, formatAndName } from "../../engine/fillCard";
import {
  commitFill,
  copySourceOf,
  fillDoneWords,
  lineText,
  mergeValues,
  planCopy,
  planFromValues,
  planNames,
  planSample,
  preparedUntouched,
  resolveFillRecord,
  shortIdentity,
  type FillLine,
  type FillPlan,
} from "../../engine/fillPlan";
import { createRecordForDocument } from "../../engine/recordCrud";
import { routeForRecord } from "../../engine/reminders";
import { documentOnPath } from "../../engine/mitraTools";
import { queueAfterOpen, queueHighlight, takeHighlight } from "../../engine/assistantHandoff";
import { documentRepository } from "../../data/repositories/documentRepository";
import { recordRepository } from "../../data/repositories/recordRepository";
import { boxesSay, fillSay, type FillLanguage } from "../../i18n/fillPhrases";
import { formatDisplayDate, todayISO } from "../../utils/date";
import { generateId } from "../../utils/id";

/** What the host shows: one message (its words, the options tapped as the next message, its steps). */
export interface FillMessage {
  text: string;
  options?: string[];
  steps?: MitraStep[];
}

/** Where the flow speaks, for one message. */
export interface FillIO {
  post: (m: FillMessage) => void;
  /** The person's words, shown by hosts that have not shown them yet. */
  echo?: (text: string) => void;
  /** The thinking line ("Waiting for Mitra... 12 s"), null to clear it. */
  thinking?: (label: string | null) => void;
  /** Busy while the model is asked. */
  busy?: (on: boolean) => void;
  readOut?: (text: string) => void;
  /** A yes/no as two chips, answered by a tap or a typed yes/no (the agent's own ctx.confirm). */
  confirm?: (question: string, yes: string, no: string) => Promise<boolean>;
}

export interface FillHostSetup {
  getTarget: () => AssistantTarget | null;
  currentRoute: () => string;
  navigate: (route: string) => void;
  bump: () => void;
  userName: string;
  isDemo: boolean;
  /** The screens' language, for words that have none of their own ("fill it"). */
  language: "en" | "gu";
  /** The dock's own flows (its walk-through); absent on the page, which hands the walk-through over on opening the record. */
  runWidgetAction?: (action: ChipAction) => void;
}

/** What a fill came to: done (with words), a question, or not a fill at all. */
interface Outcome {
  handled: boolean;
  ok: boolean;
  say?: string;
  question?: string;
  options?: string[];
  lines?: FillLine[];
  card?: string;
}

type Pending =
  | { kind: "findings"; plan: FillPlan; words: string; lang: FillLanguage; yes: string; no: string }
  | { kind: "offer"; documentId: string; dateISO: string; recordId: string | null; lang: FillLanguage; labels: Record<string, "ask" | "copy" | "sample" | "tell" | "open" | "check">; words: string }
  | { kind: "choose-record"; words: string; documentId: string; dateISO: string; byLabel: Record<string, string> }
  | { kind: "choose-doc"; words: string; byLabel: Record<string, string> }
  | { kind: "choose-day"; words: string; byLabel: Record<string, string> };

const NOT_HANDLED: Outcome = { handled: false, ok: false };
const YES_RE = /^(?:yes|yeah|yep|ok|okay|sure|go\s+ahead|do\s+it|write(?:\s+(?:it|them))?|fill(?:\s+(?:it|them))?|हाँ|हां|हा|जी|हाँ\s*भर\s*दो|भर\s*दो|હા|હાં|ભરી\s*દો|haa?n?|ha|haan\s+bhar\s+do|ha\s+bhari\s+do)\b/iu;
const NO_RE = /^(?:no|nope|cancel|don'?t|leave\s+it|stop|नहीं|ना|मत|ના|નહીં|nahi|nai|na)\b/iu;

/** The changed boxes glow for two seconds once the record is on screen. */
function glowWhenShown(recordId: string): void {
  const started = Date.now();
  const tick = () => {
    const paths = takeHighlight(recordId, true);
    if (!paths || typeof document === "undefined") return;
    const els: HTMLElement[] = [];
    for (const p of paths) {
      try {
        document.querySelectorAll<HTMLElement>(`[data-bind="${CSS.escape(p)}"]`).forEach((el) => els.push(el));
      } catch {
        /* a path the selector cannot hold */
      }
    }
    if (els.length === 0) {
      if (Date.now() - started < 4000) window.setTimeout(tick, 120);
      else takeHighlight(recordId);
      return;
    }
    takeHighlight(recordId);
    for (const el of els) {
      el.setAttribute("data-mitra-filled", "1");
      el.style.outline = "2px solid var(--accent, #2f855a)";
      el.style.outlineOffset = "1px";
      el.style.transition = "outline-color 0.4s";
    }
    els[0]?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    window.setTimeout(() => {
      for (const el of els) {
        el.style.outline = "";
        el.style.outlineOffset = "";
        el.removeAttribute("data-mitra-filled");
      }
    }, 2000);
  };
  window.setTimeout(tick, 80);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useMitraFill(setup: FillHostSetup) {
  const pending = useRef<Pending | null>(null);
  const last = useRef<string | null>(null);
  const live = useRef(setup);
  live.current = setup;

  /** ONE SMALL CALL (Tier 1): the values the rules could not read, or the document when it is not certain. A refusal comes back as words. */
  async function askModel(io: FillIO, lang: FillLanguage, body: { words: string; card?: string; candidates?: string }, doc: Parameters<typeof exampleFor>[0]): Promise<{ values?: FillValues; pick?: { doc: string | null; date: string | null; unclear: string }; refusal?: string }> {
    const example = exampleFor(doc);
    if (!assistantConfigured() || !modelReachable().ok) return { refusal: fillSay(lang, "needsModel", { example }) };
    const turnId = generateId("turn");
    io.busy?.(true);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          io.thinking?.(null);
          const res = await assistantApi.fill({ ...body, words: body.words.slice(0, 2000), ...(body.card ? { card: body.card.slice(0, 2500) } : {}), today: todayISO(), language: lang, turnId });
          if (res.kind === "values") return { values: res.values as FillValues };
          return { pick: { doc: res.doc, date: res.date, unclear: res.unclear } };
        } catch (err) {
          const e = err instanceof ApiError ? err : null;
          if (e?.code === "daily-allowance") return { refusal: fillSay(lang, "allowance", { example }) };
          if (e?.code === "busy") {
            const wait = e.retryInMs ?? 0;
            if (attempt === 0 && wait > 0 && wait <= 20000) {
              // "Waiting for Mitra... 12 s": the minute's allowance refills, then the one call goes again.
              for (let s = Math.ceil(wait / 1000); s > 0; s--) {
                io.thinking?.(fillSay(lang, "waiting", { s }));
                await sleep(1000);
              }
              continue;
            }
            return { refusal: fillSay(lang, "busy") };
          }
          return { refusal: fillSay(lang, "needsModel", { example }) };
        }
      }
      return { refusal: fillSay(lang, "busy") };
    } finally {
      io.thinking?.(null);
      io.busy?.(false);
    }
  }

  /** The record written, opened on screen, its boxes glowing; the words to say. */
  function write(plan: FillPlan, words: string, lang: FillLanguage): Outcome {
    const s = live.current;
    const target = () => s.getTarget();
    const out = commitFill(plan, { userName: s.userName, isDemo: s.isDemo, words, onScreen: (id) => (target()?.recordId === id ? target() : null) });
    if ("refusedLocked" in out) {
      const names = planNames(plan);
      return { handled: true, ok: false, say: fillSay(lang, "locked", { ...names, status: out.refusedLocked.status }) };
    }
    s.bump();
    last.current = out.record.id;
    if (out.changed === 0) {
      const names = planNames(plan);
      return { handled: true, ok: false, say: fillSay(lang, "nothingChanged", names) };
    }
    const route = routeForRecord(plan.doc, out.record.id);
    queueHighlight(out.record.id, out.paths);
    if (s.currentRoute() !== route) s.navigate(route);
    glowWhenShown(out.record.id);
    const say = fillDoneWords({ ...plan, record: out.record }, out.changed, out.started, lang, out.submitted);
    return { handled: true, ok: true, say, lines: plan.lines, card: `${boxesSay("en", out.changed)} on ${formatAndName(plan.doc)} of ${formatDisplayDate(out.record.dueDate)}` };
  }

  /** The plan's findings, asked first: through the agent's own yes/no when there is one, else as the next message. */
  async function findingsFirst(plan: FillPlan, words: string, lang: FillLanguage, io: FillIO): Promise<Outcome> {
    const flagged = plan.lines.filter((l) => l.flag === "finding" || l.flag === "limits");
    const question = fillSay(lang, "findingsQuestion", { n: flagged.length, lines: flagged.map((l) => lineText(l, lang)).join("\n") });
    const yes = fillSay(lang, "chipYesWrite");
    const no = fillSay(lang, "chipNo");
    if (io.confirm) {
      const agreed = await io.confirm(question, yes, no);
      return agreed ? write(plan, words, lang) : { handled: true, ok: false, say: fillSay(lang, "declined", planNames(plan)) };
    }
    pending.current = { kind: "findings", plan, words, lang, yes, no };
    return { handled: true, ok: true, question, options: [yes, no] };
  }

  /** "fill it", nothing more: the offers — or, on a record the app prepared, its estimates named. */
  function offer(req: Extract<FillRequest, { kind: "fill" }>, record: ReturnType<typeof recordRepository.getById> | null): Outcome {
    const doc = req.doc!;
    const lang = req.language;
    const s = live.current;
    const names = { doc: formatAndName(doc), date: formatDisplayDate(record?.dueDate ?? req.dateISO) };
    const labels: Record<string, "ask" | "copy" | "sample" | "tell" | "open" | "check"> = {};
    let text: string;
    if (record && preparedUntouched(record)) {
      const at = new Date(record.prepared!.at);
      const time = Number.isNaN(at.getTime()) ? "" : `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
      text = fillSay(lang, "preparedOffer", { ...names, time });
      labels[fillSay(lang, "chipCheckEstimates")] = "check";
      labels[fillSay(lang, "chipTellValues")] = "tell";
      labels[fillSay(lang, "chipOpen")] = "open";
    } else {
      const source = copySourceOf(doc, record?.dueDate ?? req.dateISO, s.isDemo);
      const blankSheet = !record || !record.history?.length;
      text = fillSay(lang, blankSheet ? "blankOffer" : "partOffer", names);
      labels[fillSay(lang, "chipAsk")] = "ask";
      if (source) labels[fillSay(lang, "chipCopy", { date: formatDisplayDate(source.dueDate) })] = "copy";
      labels[fillSay(lang, "chipSample")] = "sample";
    }
    pending.current = { kind: "offer", documentId: doc.id, dateISO: record?.dueDate ?? req.dateISO, recordId: record?.id ?? null, lang, labels, words: req.words };
    return { handled: true, ok: true, question: text, options: Object.keys(labels) };
  }

  /** The walk-through: the dock asks one box at a time on the open record; elsewhere the record is opened and the dock begins there. */
  function walkThrough(docId: string, dateISO: string, recordId: string | null, lang: FillLanguage): Outcome {
    const s = live.current;
    const doc = documentRepository.getById(docId);
    if (!doc) return NOT_HANDLED;
    const names = { doc: formatAndName(doc), date: formatDisplayDate(dateISO) };
    const target = s.getTarget();
    if (target && recordId && target.recordId === recordId && s.runWidgetAction) {
      s.runWidgetAction({ type: "startInterview" });
      return { handled: true, ok: true, say: fillSay(lang, "walkThrough", names) };
    }
    const record = recordId ? recordRepository.getById(recordId) : createRecordForDocument(doc, { dateISO, isDemo: s.isDemo }).record;
    if (!record) return NOT_HANDLED;
    s.bump();
    last.current = record.id;
    queueAfterOpen(record.id, "interview");
    s.navigate(routeForRecord(doc, record.id));
    return { handled: true, ok: true, say: fillSay(lang, "walkThrough", names) };
  }

  /** THE FLOW (see the header). */
  async function run(req: Extract<FillRequest, { kind: "fill" }>, io: FillIO): Promise<Outcome> {
    const s = live.current;
    const lang = req.language;
    if (req.dayQuestion) {
      const y = fillSay(lang, "chipYesterday", { date: formatDisplayDate(req.dayQuestion.yesterday) });
      const t = fillSay(lang, "chipTomorrow", { date: formatDisplayDate(req.dayQuestion.tomorrow) });
      pending.current = { kind: "choose-day", words: req.words, byLabel: { [y]: req.dayQuestion.yesterday, [t]: req.dayQuestion.tomorrow } };
      return { handled: true, ok: true, question: fillSay(lang, "whichDay", { word: req.dayQuestion.word }), options: [y, t] };
    }
    let doc = req.doc;
    if (!doc) {
      if (req.candidates.length === 0) return { handled: true, ok: false, say: fillSay(lang, "noDocument", { example: exampleFor(null) }) };
      // Not certain which form: the model picks among at most twelve, when it can; else the person does.
      if (req.candidates.length > 1 && assistantConfigured() && modelReachable().ok) {
        const picked = await askModel(io, lang, { words: req.words, candidates: candidateLines(req.candidates) }, null);
        const id = picked.pick?.doc && req.candidates.some((d) => d.id === picked.pick!.doc) ? picked.pick.doc : null;
        if (id) return run2(req.words, { documentId: id, ...(picked.pick?.date ? { dateISO: picked.pick.date } : {}) }, io);
        if (picked.refusal) return { handled: true, ok: false, say: picked.refusal };
      }
      const byLabel: Record<string, string> = {};
      for (const d of req.candidates.slice(0, 6)) byLabel[formatAndName(d)] = d.id;
      pending.current = { kind: "choose-doc", words: req.words, byLabel };
      return { handled: true, ok: true, question: fillSay(lang, "whichDocument"), options: Object.keys(byLabel) };
    }
    if (req.candidates.length === 0 && req.doc && !doc) doc = req.doc;
    const resolved = resolveFillRecord(doc, req.dateISO, req.identity, { isDemo: s.isDemo, recordId: req.recordId });
    const names = { doc: formatAndName(doc), date: formatDisplayDate(req.dateISO) };
    if (resolved.kind === "locked") return { handled: true, ok: false, say: fillSay(lang, "locked", { ...names, date: formatDisplayDate(resolved.record.dueDate), status: resolved.record.status }) };
    if (resolved.kind === "choose") {
      const byLabel: Record<string, string> = {};
      for (const c of resolved.choices) byLabel[c.label] = c.recordId;
      pending.current = { kind: "choose-record", words: req.words, documentId: doc.id, dateISO: req.dateISO, byLabel };
      return { handled: true, ok: true, question: fillSay(lang, "whichRecord", { ...names, n: resolved.choices.length }), options: Object.keys(byLabel) };
    }
    const record = resolved.record;

    switch (req.mode) {
      case "bare":
        return offer({ ...req, doc }, record);
      case "guide":
        return walkThrough(doc.id, record?.dueDate ?? req.dateISO, record?.id ?? null, lang);
      case "sample": {
        const plan = planSample(doc, record, req.dateISO, s.userName, s.isDemo);
        if (!plan) return { handled: true, ok: false, say: fillSay(lang, "noSample", names) };
        if (plan.lines.length === 0) {
          const time = plan.prepared?.time;
          return { handled: true, ok: false, say: time ? fillSay(lang, "alreadyFilled", { ...names, time }) : fillSay(lang, "alreadyComplete", names) };
        }
        return write(plan, req.words, lang);
      }
      case "copy": {
        const plan = planCopy(doc, record, req.dateISO, s.isDemo);
        if (!plan) return { handled: true, ok: false, say: fillSay(lang, "noCopySource", names) };
        if (plan.lines.length === 0) return { handled: true, ok: false, say: fillSay(lang, "nothingChanged", names) };
        return write(plan, req.words, lang);
      }
      case "values": {
        const rules = req.rules;
        let model: FillValues | null = null;
        // The rules read every value: no model call. Else one small call, for the whole message.
        if (!rules?.recognised || rules.residual) {
          const asked = await askModel(io, lang, { words: req.words, card: formCard(doc, record, todayISO()) }, doc);
          if (asked.refusal) return { handled: true, ok: false, say: asked.refusal };
          model = asked.values ?? null;
          if (model?.unclear && !rules?.recognised && !hasAny(model)) return { handled: true, ok: false, say: String(model.unclear) };
        }
        const values = mergeValues(rules?.values, model);
        const plan = planFromValues(doc, record, values, {
          words: req.words,
          dateISO: req.dateISO,
          dateSaid: req.dateSaid,
          lang,
          isDemo: s.isDemo,
          rules,
          model,
          identity: req.identity,
          submitAsked: req.submitAsked,
        });
        if (plan.lines.length === 0) {
          const why = plan.refused.length ? `\n${fillSay(lang, "notWritten")}\n${plan.refused.slice(0, 6).map((r) => `• ${r}`).join("\n")}` : "";
          return { handled: true, ok: false, say: `${hasAny(values) ? fillSay(lang, "nothingChanged", names) : fillSay(lang, "noValues", { example: exampleFor(doc) })}${why}` };
        }
        if (plan.flagged > 0) return findingsFirst(plan, req.words, lang, io);
        return write(plan, req.words, lang);
      }
    }
    return NOT_HANDLED;
  }

  /** The flow again with the document, day or record now known (the answer to a question). */
  function run2(words: string, extra: { documentId?: string; dateISO?: string; recordId?: string }, io: FillIO, forceFill = true): Promise<Outcome> {
    const s = live.current;
    const target = s.getTarget();
    const req = readFillRequest(words, {
      isDemo: s.isDemo,
      openRecordId: target?.recordId ?? null,
      screenDocumentId: documentOnPath(s.currentRoute()),
      lastRecordId: last.current,
      language: s.language,
      forceFill,
      ...extra,
    });
    if (req.kind !== "fill") return Promise.resolve(NOT_HANDLED);
    return run(req, io);
  }

  /** An answer to the question waiting, if this message is one. */
  async function answerPending(text: string, io: FillIO): Promise<Outcome | null> {
    const p = pending.current;
    if (!p) return null;
    const said = text.trim();
    const lower = said.toLowerCase();
    if (p.kind === "findings") {
      pending.current = null;
      if (said === p.yes || YES_RE.test(said)) return write(p.plan, p.words, p.lang);
      if (said === p.no || NO_RE.test(said)) return { handled: true, ok: false, say: fillSay(p.lang, "declined", planNames(p.plan)) };
      return null; // a new message: the question is set aside
    }
    const pick = (byLabel: Record<string, string>): string | null => {
      const exact = Object.keys(byLabel).find((l) => l.toLowerCase() === lower);
      if (exact) return byLabel[exact];
      const within = Object.keys(byLabel).filter((l) => lower.length >= 3 && l.toLowerCase().includes(lower));
      return within.length === 1 ? byLabel[within[0]] : null;
    };
    if (p.kind === "choose-doc") {
      const id = pick(p.byLabel);
      pending.current = null;
      return id ? run2(p.words, { documentId: id }, io) : null;
    }
    if (p.kind === "choose-day") {
      const day = pick(p.byLabel) ?? (/yesterday|બીત|ગઈ|बीता|पिछल/i.test(said) ? Object.values(p.byLabel)[0] : /tomorrow|આવતી|आने|अगल/i.test(said) ? Object.values(p.byLabel)[1] : null);
      pending.current = null;
      return day ? run2(p.words, { dateISO: day }, io) : null;
    }
    if (p.kind === "choose-record") {
      const byShort: Record<string, string> = {};
      for (const [l, id] of Object.entries(p.byLabel)) byShort[l.split(" · ")[0]] = id;
      const id = pick(p.byLabel) ?? pick(byShort);
      pending.current = null;
      return id ? run2(p.words, { recordId: id }, io) : null;
    }
    // The offers.
    const exact = Object.keys(p.labels).find((l) => l.toLowerCase() === lower);
    if (!exact) {
      pending.current = null;
      return null;
    }
    const action = p.labels[exact];
    pending.current = null;
    const s = live.current;
    const doc = documentRepository.getById(p.documentId);
    if (!doc) return null;
    if (action === "ask" || action === "check") return walkThrough(doc.id, p.dateISO, p.recordId, p.lang);
    if (action === "open") {
      const record = p.recordId ? recordRepository.getById(p.recordId) : createRecordForDocument(doc, { dateISO: p.dateISO, isDemo: s.isDemo }).record;
      if (record) {
        s.bump();
        s.navigate(routeForRecord(doc, record.id));
      }
      return { handled: true, ok: true, say: `${formatAndName(doc)} · ${formatDisplayDate(p.dateISO)}` };
    }
    if (action === "tell") return { handled: true, ok: true, say: fillSay(p.lang, "tellValues", { example: exampleFor(doc) }) };
    const req = readFillRequest(action === "sample" ? "fill it with sample data" : "copy from the last record", {
      isDemo: s.isDemo,
      documentId: doc.id,
      dateISO: p.dateISO,
      recordId: p.recordId,
      language: p.lang,
      forceFill: true,
    });
    if (req.kind !== "fill") return null;
    return run({ ...req, language: p.lang, mode: action === "sample" ? "sample" : "copy" }, io);
  }

  /**
   * A MESSAGE, TRIED AS A FILL FIRST. True when it was one (or answered a fill's
   * question) and has been answered; false lets the host carry on as before.
   */
  async function tryFill(text: string, io: FillIO): Promise<boolean> {
    const s = live.current;
    const answered = await answerPending(text, io);
    let out = answered;
    if (!out) {
      const target = s.getTarget();
      const req = readFillRequest(text, {
        isDemo: s.isDemo,
        openRecordId: target?.recordId ?? null,
        screenDocumentId: documentOnPath(s.currentRoute()),
        lastRecordId: last.current,
        language: s.language,
      });
      if (req.kind !== "fill") return false;
      io.echo?.(text);
      out = await run(req, io);
      if (!out.handled) return false;
    } else {
      io.echo?.(text);
    }
    const steps: MitraStep[] = out.card ? [{ id: generateId("step"), tool: "fill_record", label: out.card, status: out.ok ? "done" : "failed" }] : [];
    const words = out.question ?? out.say ?? "";
    io.post({ text: words, ...(out.options?.length ? { options: out.options } : {}), ...(steps.length ? { steps } : {}) });
    io.readOut?.(words);
    return true;
  }

  /** The agent's fill_record (engine/mitraTools.ts): the same flow, its words handed back to end the turn. */
  function toolFill(ctx: Pick<MitraToolContext, "userWords" | "confirm">): NonNullable<MitraToolContext["fill"]> {
    return async (args) => {
      const out = await run2(ctx.userWords, { ...(args.documentId ? { documentId: args.documentId } : {}), ...(args.dateISO ? { dateISO: args.dateISO } : {}), ...(args.recordId ? { recordId: args.recordId } : {}) }, { post: () => undefined, confirm: ctx.confirm });
      const result: MitraToolResult = {
        ok: out.ok,
        result: { ok: out.ok, ...(out.say ? { say: out.say } : {}), ...(out.question ? { question: out.question, options: out.options ?? [] } : {}), ...(out.lines ? { lines: out.lines.slice(0, 12).map((l) => `${l.label}: ${l.before} → ${l.after}`) } : {}) },
        card: out.card ?? (out.ok ? "Read your values" : "Nothing written"),
      };
      if (!out.handled) return { ok: false, result: { ok: false, why: "not a fill DCRS can read; ask the person for the values" }, card: "Nothing written" };
      return result;
    };
  }

  return { tryFill, toolFill, lastRecordId: () => last.current };
}

function hasAny(v: FillValues | null | undefined): boolean {
  if (!v) return false;
  return !!(
    (v.header && Object.keys(v.header).length) ||
    (v.fields && Object.keys(v.fields).length) ||
    (v.checks && Object.keys(v.checks).length) ||
    (v.slots && Object.values(v.slots).some((x) => x && Object.keys(x).length)) ||
    (v.rows && v.rows.some((x) => x && Object.keys(x).length)) ||
    v.itemEdits?.length
  );
}

/** For hosts and tests: the identity of a record as the people say it. */
export { shortIdentity };
