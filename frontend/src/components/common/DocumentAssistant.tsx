import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiMessageCircle, FiMic, FiMicOff, FiMove, FiSend, FiX } from "react-icons/fi";
import { ApiError, assistantApi } from "../../api/client";
import { useAssistantTarget, type AssistantTarget } from "../../store/AssistantContext";
import { applyAssistantPatch, looksLikeEdit, parseLocalEdit } from "../../engine/recordPatch";
import { diffRecordData } from "../../engine/recordHistory";
import type { FieldChange, LogSheetData } from "../../types";
import { useAuth } from "../../store/AuthContext";
import { useAppStore } from "../../store/AppStore";
import { useRouter, isValidAppRoute } from "../../store/router";
import { useDraggable } from "../../utils/useDraggable";
import { masterRepository } from "../../data/repositories/masterRepository";
import { documentRepository } from "../../data/repositories/documentRepository";
import { getDocumentInfo } from "../../engine/documentInfo";
import {
  applyAnswer,
  firstStep,
  promptFor,
  stepAfter,
  summarise,
  type Chip,
  type ChipAction,
  type GuidedAnswer,
  type GuidedPrompt,
  type GuidedStep,
} from "../../engine/guidedChecklist";
import { buildAssistantContext, localAnswer, offTopicReply } from "../../engine/assistantLocal";
import { ASSISTANT_NAME, guide, openingMessage } from "../../engine/assistantPersona";
import { formatNumberAnswer } from "../../engine/formatNumbers";
import { hrMasterChatAnswer, hrMasterIntent, hrMasterVisible, proposeMasterFill } from "../../engine/hrMasterAssistant";
import { describePerson, hrMasterLinkFor } from "../../engine/hrMaster";
import { getLogSheetLayout } from "../../data/seed/logSheetLayouts";
import { parseAssistantCommand, type AssistantCommand } from "../../engine/assistantCommands";
import { createRecordForDocument, deletionNeedsReason } from "../../engine/recordCrud";
import { recordRepository } from "../../data/repositories/recordRepository";
import { routeForRecord } from "../../engine/reminders";
import { canSampleFill, sampleFillRecord, SAMPLE_FILL_NOTE } from "../../engine/sampleFill";
import { answerQuestion, interviewPlan, nextQuestion, planProgress, type InterviewQuestion } from "../../engine/guidedRecord";
import { queueAfterOpen, takeHandoff } from "../../engine/assistantHandoff";
import { useLanguage, useT, t as phrase } from "../../i18n";
import { SPEECH_LOCALES } from "../../i18n/strings";
import { settingsRepository } from "../../data/repositories/settingsRepository";
import { isVoiceInputSupported, listenForUtterance, speak, stopSpeaking, type VoiceSession } from "../../utils/speech";
import { formatDisplayDate, todayISO } from "../../utils/date";
import { generateId } from "../../utils/id";
import { openBriefing } from "./AssistantBriefingPopup";

const WIDGET_POSITION_KEY = "dcrs:v1:assistant-widget-pos";
const START_GUIDED_EVENT = "dcrs:start-guided";

// Any page can ask the assistant to open and start walking the user through
// the checklist it has registered (see ChecklistBinding in AssistantContext).
export function startGuidedChecklist(): void {
  window.dispatchEvent(new Event(START_GUIDED_EVENT));
}

const PLACEHOLDER_BY_KIND: Record<string, string> = {
  "daily-pest-monitoring": "e.g. Checkpoints 1 to 5 = Yes, checker Ramesh, time 9:15 AM",
  "fly-catcher": "e.g. PC-01 had 3 flies, cleaned by Vijay",
  "service-report": "e.g. Sprayed Cypermethrin in the Kitchen area, technician Suresh",
  "log-sheet": "e.g. 11 o'clock viscosity was 20.4, tested by Jeni",
  "complaint-checklist": "e.g. samples received on 3 Sept, or: customer is Gulab Oil, complaint CC-12",
  gap: "e.g. Found a gap near the loading dock, corrective action: install a net, target 20 Sept",
  training: "e.g. Training on 3 Sept, topic pest control basics, trainer ABC Pest Solutions",
  "complaint-ack": "e.g. customer is Krishna Packaging, FG code FGSL 3877, root cause: job card missed the HM strip",
  "pest-responsibilities": "e.g. change point 12 to: dispose of trapped pests as per the SOP",
  "service-agreement": "e.g. agreement number is GPC/2026/14, or: service charges for the term are ₹18,000 per year",
  reference: "e.g. change the dilution ratio for Rodent Control to 1:20",
};

interface ChatMessage {
  id: string;
  role: "bot" | "user";
  text: string;
  chips?: Chip[];
}

// THE ASSISTANT — one chat, everywhere. Message bubbles, quick-reply chips,
// and a text box. Three things happen in here:
//  1. Free text → the Groq-backed /api/assistant/chat: fill the open record,
//     navigate somewhere, or just answer.
//  2. Quick chips → instant local actions (briefing, today's due list, ...).
//  3. The guided walk-through of a Customer Complaint Handling Checklist —
//     header details, then Sections A→E one activity at a time, then the
//     approval question — driven by engine/guidedChecklist.ts (chips never
//     need the network; typed answers are interpreted by the backend and
//     fall back to "done + comment" if that fails).
//  4. Filling a WHOLE document on request (13-Sep-2026): question by question
//     for every other document (engine/guidedRecord.ts — "I want to fill the
//     internal CAPA", "walk me through it"), or all at once with realistic
//     sample data (engine/sampleFill.ts — "fill it with dummy data", "generate
//     an external CAPA for me"). Said where no record is open, the assistant
//     starts or opens the document first and carries on there
//     (engine/assistantHandoff.ts). Neither ever submits anything.
export function DocumentAssistant() {
  const { hasTarget, targetKind, targetDocumentId, targetSignature, getTarget } = useAssistantTarget();
  const { elRef, style: dragStyle, dragHandleProps, didJustDrag, reclamp } = useDraggable(WIDGET_POSITION_KEY);
  const { user } = useAuth();
  const { version, currentUser, mode, bump } = useAppStore();
  const { path, navigate } = useRouter();
  const { lang } = useLanguage();
  const t = useT();
  const isDemo = mode === "demo";
  const speechLocale = SPEECH_LOCALES[lang];
  const voiceSupported = isVoiceInputSupported();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [guided, setGuided] = useState<{ step: GuidedStep; prompt: GuidedPrompt } | null>(null);
  const [pickingDate, setPickingDate] = useState(false);
  const [awaitingSendBackReason, setAwaitingSendBackReason] = useState(false);
  // A delete asked for in words: the record it is about, and whether the
  // reason still has to be typed (a signed-off record always needs one).
  const [pendingDelete, setPendingDelete] = useState<{ recordId: string; needsReason: boolean } | null>(null);
  const [listening, setListening] = useState(false);
  const sessionRef = useRef<VoiceSession | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const startedRef = useRef<Set<string>>(new Set());
  const guidedRef = useRef(guided);
  guidedRef.current = guided;
  // The question-by-question fill of any other document: which record, and
  // the question on screen. Questions already put in this sitting are kept
  // apart, so a skipped one is not asked again and again.
  const [interview, setInterview] = useState<{ recordId: string; q: InterviewQuestion } | null>(null);
  const interviewRef = useRef(interview);
  interviewRef.current = interview;
  const askedRef = useRef(new Set<string>());
  const setIv = (v: { recordId: string; q: InterviewQuestion } | null) => {
    interviewRef.current = v;
    setInterview(v);
  };
  // A change to a submitted/verified record, waiting for "Yes, correct it".
  const pendingRef = useRef<{ next: unknown; changes: FieldChange[]; note: string; recordId: string; problems: string[] } | null>(null);
  // What each assistant change replaced, so "Undo" can put it back.
  const undoRef = useRef(new Map<string, { recordId: string; data: unknown }>());
  // A fetch from HR Master Data shown to the user and waiting for their yes (REQUIREMENTS §53).
  const masterFillRef = useRef<{ recordId: string; personId: string; editable: boolean; next: unknown; blanksOnly: unknown; changes: FieldChange[]; blankChanges: FieldChange[]; note: string } | null>(null);
  // Mitra asked "whose details?" — the next message names the person (REQUIREMENTS §53).
  const awaitingPersonRef = useRef<string | null>(null);

  const firstName = (user?.name ?? currentUser).trim().split(/\s+/)[0];

  useEffect(() => {
    reclamp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, pickingDate]);

  // ---- message helpers -----------------------------------------------------
  const post = (role: "bot" | "user", text: string, chips?: Chip[]) => {
    if (!text && !chips?.length) return;
    setMessages((m) => [...m.map((x) => (x.chips ? { ...x, chips: undefined } : x)), { id: generateId("msg"), role, text, chips }]);
  };
  const bot = (text: string, chips?: Chip[]) => post("bot", text, chips);
  const me = (text: string) => post("user", text);

  // Mitra introduces itself once, when the panel first opens, and asks where
  // you would like to go — with the answers as chips (REQUIREMENTS §50).
  useEffect(() => {
    if (!open || messages.length > 0) return;
    const t = getTarget();
    const where = t?.checklist
      ? phrase("ai.opening.checklist", { title: t.checklist.title })
      : t && !t.editable && t.reopen
        ? phrase("ai.opening.recordLocked", { status: t.status ?? "" })
        : hasTarget
          ? phrase("ai.opening.recordOpen")
          : "";
    const opening = openingMessage(user?.name, where);
    bot(opening.text, opening.chips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---- guided walk-through -------------------------------------------------
  const askStep = (step: GuidedStep) => {
    const t = getTarget();
    if (!t?.checklist) return;
    if (step.kind === "finished") {
      setGuided(null);
      return;
    }
    const data = t.checklist.getData();
    // A section that's already complete doesn't need a tap — announce it
    // and move straight on.
    if (step.kind === "section-intro" && data.sections[step.sectionIndex].items.every((it) => it.done || it.notRequired || it.comment.trim())) {
      bot(promptFor(step, data, currentUser).text);
      askStep(stepAfter(data, step));
      return;
    }
    const prompt = promptFor(step, data, currentUser);
    setGuided({ step, prompt });
    bot(prompt.text, prompt.chips);
  };

  const beginGuided = () => {
    const t = getTarget();
    if (!t?.checklist) {
      bot("Open a customer complaint checklist first (CAPA → External), then I'll walk you through it section by section.", [
        { label: "Open CAPA → External", action: { type: "navigate", route: "/gap/external" }, tone: "primary" },
      ]);
      return;
    }
    const data = t.checklist.getData();
    if (t.checklist.canApprove) {
      const s = summarise(data);
      bot(
        `${t.checklist.title} is waiting for approval — ${s.done} of ${s.total} activities done${s.notRequired ? `, ${s.notRequired} not required` : ""}${s.blank ? `, ${s.blank} left blank` : ""}. Prepared by ${data.preparedBy.name || "—"}${data.preparedBy.date ? ` on ${formatDisplayDate(data.preparedBy.date)}` : ""}. Approve it?`,
        [
          { label: "Approve", action: { type: "approve" }, tone: "success" },
          { label: "Send back", action: { type: "sendBack" }, tone: "danger" },
        ]
      );
      return;
    }
    if (!t.checklist.editable) {
      bot("This checklist is already signed off — nothing left to fill in. You can still print it.");
      return;
    }
    const step = firstStep(data);
    bot(`Let's do ${t.checklist.title} together. I'll go section by section — A to E — one activity at a time, and then ask you to submit it for approval. Tap an answer, or just type what happened.`);
    askStep(step);
  };

  const answerGuided = (answer: GuidedAnswer, echo?: string) => {
    const g = guidedRef.current;
    const t = getTarget();
    if (!g || !t?.checklist) return;
    if (echo) me(echo);
    setPickingDate(false);
    const data = t.checklist.getData();
    const res = applyAnswer(data, g.step, answer);
    if (res.data !== data) t.checklist.setData(res.data);
    if (res.ack) bot(res.ack);
    if (res.stay) {
      const prompt = promptFor(g.step, res.data, currentUser);
      setGuided({ step: g.step, prompt });
      bot(prompt.text, prompt.chips);
      return;
    }
    askStep(res.next ?? stepAfter(res.data, g.step));
  };

  // ---- filling a whole document ----------------------------------------------
  // Question by question (engine/guidedRecord.ts) or with sample data
  // (engine/sampleFill.ts). Both go through the same commit as any other
  // assistant change — history line, listed back, undoable, never submitted.
  const openRecordFor = (t: AssistantTarget) => ({ doc: documentRepository.getById(t.documentId), record: recordRepository.getById(t.recordId) });

  const docChips = (type: "sampleFill" | "startInterview"): Chip[] => [
    { label: "External CAPA (complaint)", action: { type, documentId: "capa-customer-complaint" }, tone: "primary" },
    { label: "Internal CAPA (inspection)", action: { type, documentId: "gap-inspection" } },
    { label: "Daily monitoring (F/HR/17)", action: { type, documentId: "daily-pest-monitoring" } },
    { label: "Fly catcher (F/HR/18)", action: { type, documentId: "fly-catcher" } },
  ];
  const candidateChips = (ids: string[], type: "sampleFill" | "startInterview", dateISO: string): Chip[] =>
    ids
      .map((id) => documentRepository.getById(id))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => ({ label: d.name.replace(/^CAPA — /, ""), action: { type, documentId: d.id, dateISO } }));

  const interviewChips = (q: InterviewQuestion): Chip[] => {
    const chips: Chip[] = [];
    const seen = new Set<string>();
    const add = (label: string, value: string, tone?: Chip["tone"]) => {
      if (seen.has(label)) return;
      seen.add(label);
      chips.push({ label, action: { type: "interviewAnswer", value }, tone });
    };
    for (const s of q.suggestions ?? []) add(s.label, s.value, chips.length === 0 ? "primary" : undefined);
    if (q.type === "yesno" && !q.suggestions?.length) {
      add("Yes", "Yes", "primary");
      add("No", "No");
    }
    if (q.type === "select" && !q.suggestions?.length) for (const o of (q.options ?? []).slice(0, 6)) add(o, o);
    if (q.optional) chips.push({ label: "Skip", action: { type: "interviewSkip" } });
    chips.push({ label: "Stop for now", action: { type: "interviewStop" } });
    return chips;
  };

  const askNextQuestion = () => {
    const t = getTarget();
    const iv = interviewRef.current;
    if (!t || !iv || t.recordId !== iv.recordId) {
      setIv(null);
      return;
    }
    const { doc, record } = openRecordFor(t);
    if (!doc || !record) {
      setIv(null);
      return;
    }
    const data = t.getData();
    const plan = interviewPlan(doc, record, data, masterRepository.get(), todayISO());
    const q = plan ? nextQuestion(plan, data, askedRef.current) : null;
    if (!q) {
      setIv(null);
      const chips: Chip[] = [];
      if (t.submit) chips.push({ label: "Submit this record", action: { type: "askSubmit" }, tone: "primary" });
      if (canSampleFill(doc.kind)) chips.push({ label: "Fill anything left with sample data", action: { type: "sampleFill" } });
      bot(`That's everything I need for ${t.title ?? "this record"}. ${REVIEW_LINE}`, chips);
      return;
    }
    setIv({ recordId: t.recordId, q });
    bot(q.ask, interviewChips(q));
  };

  const startInterview = () => {
    const t = getTarget();
    if (!t) {
      bot('Open the record you want to fill first — or name it: "I want to fill the external CAPA", "help me fill the daily monitoring record".', docChips("startInterview"));
      return;
    }
    if (t.checklist) {
      beginGuided();
      return;
    }
    if (!t.editable) {
      bot(`${t.title ?? "This record"} is ${t.status}, so it isn't open for filling in. Tell me the correction and I'll reopen it for you, or use Edit on the form.`);
      return;
    }
    const { doc, record } = openRecordFor(t);
    if (!doc || !record) return;
    const data = t.getData();
    const plan = interviewPlan(doc, record, data, masterRepository.get(), todayISO());
    if (!plan) {
      bot("This document is kept as issued — tell me the line to change and I'll change it.");
      return;
    }
    askedRef.current = new Set();
    const progress = planProgress(plan, data);
    const left = progress.total - progress.answered;
    if (left === 0) {
      bot(`${t.title ?? "This record"} already answers everything I would ask. ${REVIEW_LINE}`, t.submit ? [{ label: "Submit this record", action: { type: "askSubmit" }, tone: "primary" }] : undefined);
      return;
    }
    setIv({ recordId: t.recordId, q: plan.questions[0] });
    bot(
      `Let's fill ${t.title ?? "this record"} together — ${plan.intro}. I'll ask one thing at a time; tap an answer or type it, and each answer is saved as we go.${
        progress.answered ? ` ${progress.answered} of ${progress.total} are already on the form, so ${left} to go.` : ""
      }`
    );
    askNextQuestion();
  };

  const answerInterview = (raw: string, echo?: string) => {
    const t = getTarget();
    const iv = interviewRef.current;
    if (!t || !iv || t.recordId !== iv.recordId) return;
    if (echo) me(echo);
    const res = answerQuestion(iv.q, t.getData(), raw, todayISO());
    if (res.stay) {
      bot(res.ack, interviewChips(iv.q));
      return;
    }
    t.commit(res.data, `Q&A — ${iv.q.label}`);
    askedRef.current.add(iv.q.id);
    bot(res.ack);
    askNextQuestion();
  };

  const skipInterviewQuestion = (echo: string) => {
    const iv = interviewRef.current;
    if (!iv) return;
    me(echo);
    askedRef.current.add(iv.q.id);
    askNextQuestion();
  };

  const stopInterview = (echo: string) => {
    me(echo);
    setIv(null);
    bot('Stopped — everything you answered is saved on the form. Say "ask me question by question" whenever you want to carry on.');
  };

  // Start (or find) the named document, open it, and carry on there.
  const openThen = (documentId: string, dateISO: string | undefined, then: "sample" | "interview") => {
    const doc = documentRepository.getById(documentId);
    if (!doc) {
      bot("I couldn't find that document.");
      return;
    }
    const date = dateISO ?? todayISO();
    const { record, existed } = createRecordForDocument(doc, { dateISO: date, isDemo });
    bump();
    queueAfterOpen(record.id, then);
    const next = then === "sample" ? "filling it with sample data as soon as it opens." : "I'll ask you what to put in it as soon as it opens.";
    bot(existed ? `Opening the ${doc.name} for ${formatDisplayDate(date)} that already exists — ${next}` : `Started a new ${doc.name} for ${formatDisplayDate(date)} — ${next}`);
    navigate(routeForRecord(doc, record.id));
  };

  const fillWithSample = () => {
    const t = getTarget();
    if (!t) return;
    // A walk-through or interview in progress is superseded by the fill.
    setGuided(null);
    setPickingDate(false);
    setIv(null);
    const { doc, record } = openRecordFor(t);
    if (!doc || !record || !canSampleFill(doc.kind)) {
      bot("This document is kept as issued, so there is nothing to fill with sample data — tell me the line to change instead.");
      return;
    }
    const result = sampleFillRecord(doc, record, masterRepository.get(), currentUser);
    if (!result) {
      bot("I couldn't put together sample data for this one.");
      return;
    }
    const before = t.getData();
    const changes = diffRecordData(before, result.data, t.labels);
    const intro = `Sample data for ${t.title ?? "this record"} — realistic, but made up, so check every value:\n${result.summary.map((s) => `• ${s}`).join("\n")}`;
    if (changes.length === 0) {
      bot(`${intro}\n\nNothing on the form changed — it was already filled in.`);
      return;
    }
    if (!t.editable) {
      if (!t.reopen) {
        bot(`${t.title ?? "This record"} is ${t.status} and can't be changed from here.`);
        return;
      }
      pendingRef.current = { next: result.data, changes, note: SAMPLE_FILL_NOTE, recordId: t.recordId, problems: [] };
      bot(`${intro}\n\nThis record is ${t.status}. To fill it I'll reopen it for correction — then it has to be submitted and verified again. Go ahead?`, [
        { label: "Yes, fill it", action: { type: "confirmCorrection" }, tone: "primary" },
        { label: "No, leave it", action: { type: "cancelCorrection" } },
      ]);
      return;
    }
    commitEdit(t, result.data, changes, SAMPLE_FILL_NOTE, [], `${intro}\n\n`, { brief: true, offerSubmit: !!t.submit });
  };

  // A PERSON FROM HR MASTER DATA onto the open HR record (REQUIREMENTS §53):
  // looked up here, listed box by box — what is blank and what would be
  // replaced — and written only when the user says yes.
  const askMasterFill = (text: string, query: string, personId?: string, lead = "") => {
    awaitingPersonRef.current = null;
    masterFillRef.current = null;
    const tt = getTarget();
    const link = hrMasterLinkFor(tt?.documentId);
    const layout = tt && link ? getLogSheetLayout(tt.documentId) : undefined;
    const sheetChip: Chip = { label: phrase("nav.hrMasterData"), action: { type: "navigate", route: "/hr/master-data" } };
    if (!tt || !link || !layout) {
      const answer = hrMasterChatAnswer(text);
      bot(answer?.reply ?? "Open the HR record the details should go on first.", answer?.chips ?? [sheetChip]);
      return;
    }
    if (!tt.editable && !tt.reopen) {
      bot(`${tt.title ?? "This record"} is ${tt.status} and can't be changed from here.`);
      return;
    }
    if (!query.trim() && !personId) {
      awaitingPersonRef.current = tt.recordId;
      bot(`Whose details shall I fetch onto ${tt.title ?? "this record"}? Tell me their GP3 No. or name — e.g. “fetch GP3 1024” or “fetch Sandeep Parekh”.`, [sheetChip]);
      return;
    }
    const before = tt.getData() as LogSheetData;
    const found = proposeMasterFill(link, layout, before, query, personId, () => generateId("row"));
    if (found.kind === "not-found") {
      bot(`No one on HR Master Data has the GP3 No. or name “${query.trim()}”. Add them to the sheet first, then ask me again.`, [sheetChip]);
      return;
    }
    if (found.kind === "candidates") {
      bot(
        found.people.length === 1 ? "Do you mean this person on HR Master Data?" : `${found.people.length} people on HR Master Data match “${query.trim()}” — which one?`,
        found.people.map((p) => ({ label: describePerson(p), action: { type: "hrMasterFetch", personId: p.id } }))
      );
      return;
    }
    if (found.kind === "nothing") {
      bot(`${lead}${found.person.fullName}'s details from HR Master Data are already on ${found.where} — nothing to fetch.`);
      return;
    }
    if (found.kind === "several-lines") {
      bot(`${found.person.fullName} could be line ${found.lines.join(" or line ")} of this register, so I haven't fetched anything — fill the right line on the form.`);
      return;
    }
    const { proposal } = found;
    const changes = diffRecordData(before, proposal.next, tt.labels);
    const blankChanges = proposal.replaces ? diffRecordData(before, proposal.blanksOnly, tt.labels) : changes;
    const note = `Fetched from HR Master Data — ${describePerson(proposal.person)}`;
    masterFillRef.current = { recordId: tt.recordId, personId: proposal.person.id, editable: tt.editable, next: proposal.next, blanksOnly: proposal.blanksOnly, changes, blankChanges, note };
    const chips: Chip[] = [{ label: "Yes, fill it", action: { type: "confirmMasterFill" }, tone: "primary" }];
    if (proposal.replaces && blankChanges.length > 0) chips.push({ label: "Only the blank boxes", action: { type: "confirmMasterFill", blanksOnly: true } });
    chips.push({ label: "No, leave it", action: { type: "cancelMasterFill" } });
    const replacing = proposal.replaces ? "\n\nSome of these replace what the record already says." : "";
    const lock = tt.editable ? "" : `\n\nThis record is ${tt.status}, so I'll reopen it for correction first — then it has to be submitted and verified again.`;
    bot(`${lead}From HR Master Data — ${describePerson(proposal.person)}. On ${proposal.where}:\n${listChanges(changes)}${replacing}${lock}\n\nFill these in?`, chips);
  };

  // An outright instruction typed mid-walk-through / mid-interview.
  const runStrictCommand = (command: AssistantCommand, text: string): boolean => {
    switch (command.kind) {
      case "submit":
        runAction({ label: text, action: { type: "askSubmit" } });
        return true;
      case "verify":
        runAction({ label: text, action: { type: "doVerify" } });
        return true;
      case "delete":
        runAction({ label: text, action: { type: "askDelete" } });
        return true;
      case "print":
        runAction({ label: text, action: { type: "doPrint" } });
        return true;
      case "cancelEdit":
        runAction({ label: text, action: { type: "doCancelCorrection" } });
        return true;
      case "fill":
        // "fill it with sample data" typed while being asked questions fills
        // the whole thing instead — it is not the answer to the question.
        runAction({ label: text, action: { type: "sampleFill", documentId: command.documentId, dateISO: command.dateISO } });
        return true;
      default:
        return false;
    }
  };

  const runAction = (chip: Chip) => {
    const a: ChipAction = chip.action;
    const t = getTarget();
    switch (a.type) {
      case "guided":
        answerGuided(a.answer, chip.label);
        return;
      case "sampleFill": {
        me(chip.label);
        if (a.documentId && (!t || t.documentId !== a.documentId)) {
          openThen(a.documentId, a.dateISO, "sample");
          return;
        }
        if (!t) {
          bot('Open the record you want filled, or tell me which document — e.g. "generate an external CAPA for me".', docChips("sampleFill"));
          return;
        }
        fillWithSample();
        return;
      }
      case "startInterview": {
        me(chip.label);
        if (a.documentId && (!t || t.documentId !== a.documentId)) {
          openThen(a.documentId, a.dateISO, "interview");
          return;
        }
        startInterview();
        return;
      }
      case "interviewAnswer":
        answerInterview(a.value, chip.label);
        return;
      case "interviewSkip":
        skipInterviewQuestion(chip.label);
        return;
      case "interviewStop":
        stopInterview(chip.label);
        return;
      case "pickDate":
        setPickingDate(true);
        return;
      case "submit": {
        me(chip.label);
        if (!t?.checklist) return;
        const r = t.checklist.submit();
        if (r.ok) {
          setGuided(null);
          bot("Submitted ✅ It's now waiting for the QA Head's approval — they'll see it in their briefing and can approve it right from here. Nothing more for you to do on this one.");
        } else {
          bot(`Before I can submit it: ${r.errors.join(" ")} Let's sort that out.`);
          askStep(firstStep(t.checklist.getData()));
        }
        return;
      }
      case "later":
        me(chip.label);
        setGuided(null);
        bot("No problem — everything you've answered is saved on the form. Tap \"Walk me through it\" whenever you want to pick it up again.");
        return;
      case "approve": {
        me(chip.label);
        if (!t?.checklist) return;
        const r = t.checklist.approve();
        bot(r.ok ? "Approved ✅ The checklist is signed off as Approved By with your name and today's date, and the complaint is closed." : `I couldn't approve it yet: ${r.errors.join(" ")}`);
        return;
      }
      case "sendBack":
        me(chip.label);
        setAwaitingSendBackReason(true);
        bot("What should they fix? Type a short note and I'll send it back with that.");
        return;
      case "navigate":
        me(chip.label);
        bot(phrase("ai.onIt", { what: chip.label }), [{ label: phrase("ai.guide.whereTo"), action: { type: "guide", step: "home" } }]);
        navigate(a.route);
        return;
      // The next question of "where would you like to go?" — no network.
      case "guide": {
        me(chip.label);
        const step = guide(a.step);
        bot(step.text, step.chips);
        return;
      }
      case "briefing":
        me(chip.label);
        setOpen(false);
        openBriefing();
        return;
      case "startGuided":
        me(chip.label);
        beginGuided();
        return;
      case "focusInput":
        setInput("");
        inputRef.current?.focus();
        return;
      case "confirmCorrection": {
        me(chip.label);
        const p = pendingRef.current;
        pendingRef.current = null;
        const tt = getTarget();
        if (!p || !tt || tt.recordId !== p.recordId || !tt.reopen) {
          bot("That record isn't open any more — open it again and tell me the change.");
          return;
        }
        tt.reopen(p.note);
        commitEdit(tt, p.next, p.changes, p.note, p.problems, "Reopened for correction — it will need submitting and verifying again. ");
        return;
      }
      case "cancelCorrection":
        me(chip.label);
        pendingRef.current = null;
        bot("Okay — I've left the record exactly as it was.");
        return;
      case "hrMasterFetch":
        me(chip.label);
        askMasterFill(chip.label, "", a.personId);
        return;
      case "confirmMasterFill": {
        me(chip.label);
        const p = masterFillRef.current;
        masterFillRef.current = null;
        const tt = getTarget();
        if (!p || !tt || tt.recordId !== p.recordId) {
          bot("That record isn't open any more — open it again and tell me whose details to fetch.");
          return;
        }
        // Worked out again on the record as it is now: if it has been edited,
        // submitted or verified since the list was shown, show the new list.
        const link = hrMasterLinkFor(tt.documentId);
        const layout = link ? getLogSheetLayout(tt.documentId) : undefined;
        const now = link && layout ? proposeMasterFill(link, layout, tt.getData() as LogSheetData, "", p.personId, () => generateId("row")) : null;
        const same = (x: FieldChange[], y: FieldChange[]) => x.length === y.length && x.every((c, i) => c.label === y[i].label && c.before === y[i].before && c.after === y[i].after);
        const fresh = now?.kind === "proposal" ? now.proposal : null;
        const freshChanges = fresh ? diffRecordData(tt.getData(), a.blanksOnly ? fresh.blanksOnly : fresh.next, tt.labels) : [];
        if (!fresh || tt.editable !== p.editable || !same(freshChanges, a.blanksOnly ? p.blankChanges : p.changes)) {
          askMasterFill(chip.label, "", p.personId, "The record has changed since I listed that, so here it is again. ");
          return;
        }
        const next = a.blanksOnly ? fresh.blanksOnly : fresh.next;
        if (!tt.editable) {
          if (!tt.reopen) {
            bot(`${tt.title ?? "This record"} is ${tt.status} and can't be changed from here.`);
            return;
          }
          tt.reopen(p.note);
          commitEdit(tt, next, freshChanges, p.note, [], "Reopened for correction — it will need submitting and verifying again. ");
        } else commitEdit(tt, next, freshChanges, p.note, []);
        // An interview that was running carries on from its next question.
        if (interviewRef.current?.recordId === tt.recordId) askNextQuestion();
        return;
      }
      case "cancelMasterFill": {
        me(chip.label);
        masterFillRef.current = null;
        bot("Okay — nothing fetched; the record is as it was.");
        const tt = getTarget();
        if (tt && interviewRef.current?.recordId === tt.recordId) askNextQuestion();
        return;
      }
      case "createRecord": {
        me(chip.label);
        const doc = documentRepository.getById(a.documentId);
        if (!doc) {
          bot("I couldn't find that document.");
          return;
        }
        const { record, existed } = createRecordForDocument(doc, { dateISO: a.dateISO, isDemo });
        bump();
        // The two ways to have it filled are offered right away; both act on
        // whatever record is open when tapped — by then, this one.
        const fillChips: Chip[] = [
          { label: "Ask me question by question", action: { type: "startInterview" }, tone: "primary" },
          { label: "Fill it with sample data", action: { type: "sampleFill" } },
        ];
        bot(
          existed
            ? `There is already a ${doc.name} for ${formatDisplayDate(a.dateISO)} — opening that one rather than starting a second.`
            : `Started a new ${doc.name} for ${formatDisplayDate(a.dateISO)}. It's a draft — fill it in here or on the form. Check everything on it before you submit; anything I fill in can be corrected.`,
          fillChips
        );
        navigate(routeForRecord(doc, record.id));
        return;
      }
      case "askDelete": {
        me(chip.label);
        const tt = getTarget();
        if (!tt?.remove) {
          bot("Open the record you want deleted first, then tell me again.");
          return;
        }
        const needsReason = deletionNeedsReason(tt.status);
        setPendingDelete({ recordId: tt.recordId, needsReason });
        if (needsReason) {
          bot(
            `${tt.title ?? "This record"} is ${tt.status} — it has been through verification, so deleting it takes a reason, and the deletion itself is recorded (who, when and why). Type the reason and I'll remove it, or tap Keep it.`,
            [{ label: "Keep it", action: { type: "cancelDelete" } }]
          );
          return;
        }
        bot(`Delete ${tt.title ?? "this record"}? It is ${tt.status}, and this can't be undone.`, [
          { label: "Delete it", action: { type: "confirmDelete", reason: "Deleted from the assistant" }, tone: "danger" },
          { label: "Keep it", action: { type: "cancelDelete" } },
        ]);
        return;
      }
      case "confirmDelete": {
        me(chip.label);
        const tt = getTarget();
        const p = pendingDelete;
        setPendingDelete(null);
        if (!p || !tt?.remove || tt.recordId !== p.recordId) {
          bot("That record isn't open any more — open it again and tell me.");
          return;
        }
        const what = tt.title ?? "The record";
        tt.remove(a.reason);
        bot(`${what} is deleted. The deletion is on file — what it was, its status, who removed it, when and why (Document Library → Records deleted).`);
        return;
      }
      case "cancelDelete":
        me(chip.label);
        setPendingDelete(null);
        bot("Kept — nothing was deleted.");
        return;
      case "askSubmit": {
        me(chip.label);
        const tt = getTarget();
        if (!tt?.submit) {
          bot("This one can't be submitted from here — open the record and try again.");
          return;
        }
        bot(
          `Before I submit ${tt.title ?? "this record"}: look over the form and make sure every value is right — once it goes for verification, changing it means reopening it with a reason. Anything I filled in can still be corrected now.`,
          [
            { label: "I've checked it — submit", action: { type: "doSubmit" }, tone: "primary" },
            { label: "Not yet", action: { type: "later" } },
          ]
        );
        return;
      }
      case "doSubmit": {
        me(chip.label);
        const tt = getTarget();
        if (!tt?.submit) {
          bot("This one can't be submitted from here — open the record and try again.");
          return;
        }
        const r = tt.submit();
        bot(r.ok ? `Submitted ✅ ${tt.title ?? "The record"} is waiting for verification now.` : `Before I can submit it: ${r.errors.join(" ")}`);
        return;
      }
      case "doVerify": {
        me(chip.label);
        const tt = getTarget();
        if (!tt?.verify) {
          bot("This record isn't waiting for verification — submit it first.");
          return;
        }
        const r = tt.verify();
        bot(r.ok ? `Verified ✅ ${tt.title ?? "The record"} is signed off in your name.` : `I couldn't verify it yet: ${r.errors.join(" ")}`);
        return;
      }
      case "doCancelCorrection": {
        me(chip.label);
        const tt = getTarget();
        if (!tt?.cancelCorrection) {
          bot("This record isn't open for correction, so there's nothing to put back.");
          return;
        }
        tt.cancelCorrection();
        bot("Put back exactly as it was, at the status it came from — the history notes that the edit was cancelled.");
        return;
      }
      case "doPrint": {
        me(chip.label);
        const tt = getTarget();
        if (!tt?.print) {
          bot("Open the document you want printed, then ask me again.");
          return;
        }
        tt.print();
        bot("Printing the document itself — nothing else on the page goes on the paper.");
        return;
      }
      case "undo": {
        me(chip.label);
        const saved = undoRef.current.get(a.id);
        const tt = getTarget();
        if (!saved || !tt || tt.recordId !== saved.recordId) {
          bot("I can only undo a change while that record is still open.");
          return;
        }
        if (!tt.editable) {
          bot("This record has been submitted since then — use \"Correct this record\" to change it.");
          return;
        }
        undoRef.current.delete(a.id);
        tt.commit(saved.data, "Undo of the assistant's change");
        bot("Undone — the record is back to what it said before.");
        return;
      }
    }
  };

  const quickChips: Chip[] = useMemo(() => {
    const t = getTarget();
    const chips: Chip[] = [];
    if (t?.checklist?.editable && !guided) chips.push({ label: "Walk me through it (A → E)", action: { type: "startGuided" }, tone: "primary" });
    if (t?.checklist?.canApprove) chips.push({ label: "Review & approve", action: { type: "startGuided" }, tone: "success" });
    if (guided) chips.push({ label: "Stop the walk-through", action: { type: "later" } });
    // Filling the whole document: question by question, or with sample data.
    if (hasTarget && t?.editable && !t.checklist && !interview) chips.push({ label: "Ask me question by question", action: { type: "startInterview" }, tone: "primary" });
    if (interview) chips.push({ label: "Stop the questions", action: { type: "interviewStop" } });
    if (hasTarget && t?.editable) chips.push({ label: "Fill it with sample data", action: { type: "sampleFill" } });
    if (hasTarget && t && hrMasterLinkFor(t.documentId) && (t.editable || t.reopen)) chips.push({ label: "Fetch from HR Master Data", action: { type: "hrMasterFetch" } });
    if (!hasTarget) chips.push({ label: phrase("ai.guide.whereToChip"), action: { type: "guide", step: "home" }, tone: "primary" });
    chips.push({ label: "Today's briefing", action: { type: "briefing" } });
    chips.push({ label: "What's due today?", action: { type: "navigate", route: `/day/${todayISO()}` } });
    chips.push({ label: "This month's reports", action: { type: "navigate", route: "/reports" } });
    if (!path.startsWith("/gap")) chips.push({ label: "Open CAPA", action: { type: "navigate", route: "/gap" } });
    if (hasTarget && !t?.checklist) chips.push({ label: t && !t.editable ? "Correct this record…" : "Tell me what to fill…", action: { type: "focusInput", placeholder: "" } });
    // Everything the record's own buttons can do, in the chat as well.
    if (t?.cancelCorrection) chips.push({ label: "Cancel the edit", action: { type: "doCancelCorrection" } });
    if (t?.submit) chips.push({ label: "Submit this record", action: { type: "askSubmit" }, tone: "primary" });
    if (t?.verify) chips.push({ label: "Verify this record", action: { type: "doVerify" }, tone: "success" });
    if (t?.print) chips.push({ label: "Print the document", action: { type: "doPrint" } });
    if (t?.remove) chips.push({ label: "Delete this record", action: { type: "askDelete" }, tone: "danger" });
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTarget, targetKind, targetDocumentId, targetSignature, guided, interview, path, version]);

  // Something asked for before this record was open — "generate an external
  // CAPA for me" from the library or the full-page Assistant — is done now
  // that it is (engine/assistantHandoff.ts). Runs BEFORE the auto-start below
  // so a checklist about to be filled with sample data isn't also walked
  // through.
  useEffect(() => {
    const t = getTarget();
    if (!t) return;
    const then = takeHandoff(t.recordId);
    if (!then) return;
    if (t.checklist) startedRef.current.add(t.recordId);
    setOpen(true);
    setTimeout(() => (then === "sample" ? fillWithSample() : startInterview()), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSignature]);

  // A fresh, empty complaint checklist opens the assistant and starts the
  // walk-through by itself — the whole point is that nobody has to work out
  // where to begin. Once per record.
  useEffect(() => {
    const t = getTarget();
    if (t?.checklist?.autoStart && !startedRef.current.has(t.checklist.recordId)) {
      startedRef.current.add(t.checklist.recordId);
      setOpen(true);
      // Let the greeting effect post first so the walk-through reads in order.
      setTimeout(() => beginGuided(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSignature]);

  // Leaving the checklist page ends any walk-through in progress; leaving the
  // record being filled question by question ends that.
  useEffect(() => {
    if (guidedRef.current && targetKind !== "complaint-checklist") {
      setGuided(null);
      setPickingDate(false);
    }
    const iv = interviewRef.current;
    if (iv && getTarget()?.recordId !== iv.recordId) setIv(null);
    setAwaitingSendBackReason(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKind, targetDocumentId]);

  useEffect(() => {
    const onStart = () => {
      setOpen(true);
      setTimeout(() => beginGuided(), 0);
    };
    window.addEventListener(START_GUIDED_EVENT, onStart);
    return () => window.removeEventListener(START_GUIDED_EVENT, onStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Never leave the microphone open or a reply mid-sentence when the widget
  // unmounts (navigating to the full-page Assistant does exactly that).
  useEffect(() => {
    return () => {
      sessionRef.current?.cancel();
      stopSpeaking();
    };
  }, []);

  // ---- changing the open record ----------------------------------------------
  // Every change — typed in plain words or proposed by the model — is checked
  // by engine/recordPatch.ts before it touches the record, saved at once with
  // an "assistant" line in the record's history, listed back field by field,
  // and can be undone. A submitted/verified record is only changed after the
  // user says yes to reopening it for correction.
  const listChanges = (changes: FieldChange[]) => {
    const lines = changes.slice(0, 8).map((c) => `• ${c.label}: ${c.before || "(blank)"} → ${c.after || "(blank)"}`);
    if (changes.length > 8) lines.push(`…and ${changes.length - 8} more`);
    return lines.join("\n");
  };

  // Said after every change the assistant makes, and before it submits
  // anything — the department's standing instruction (12-Sep-2026): whatever
  // it changes, it says so and asks for it to be checked first, and says how to
  // put it right if it has got something wrong.
  const REVIEW_LINE =
    "Please check it on the form before you submit — if I have got anything wrong, tap Undo, tell me the correction, or use Edit on the record.";

  const commitEdit = (
    target: AssistantTarget,
    next: unknown,
    changes: FieldChange[],
    note: string,
    problems: string[],
    intro = "",
    // brief: a whole-document fill counts its fields instead of listing them
    // (the intro has already said what went where); offerSubmit adds the
    // review-then-submit step as a chip.
    opts: { brief?: boolean; offerSubmit?: boolean } = {}
  ) => {
    const before = target.getData();
    target.commit(next, note);
    const id = generateId("undo");
    undoRef.current.set(id, { recordId: target.recordId, data: before });
    const issues = problems.length ? `\n\n${problems.join("\n")}` : "";
    const chips: Chip[] = [{ label: "Undo", action: { type: "undo", id } }];
    if (opts.offerSubmit) chips.push({ label: "Submit this record", action: { type: "askSubmit" }, tone: "primary" });
    const what = opts.brief ? `Saved — ${changes.length} field${changes.length === 1 ? "" : "s"} filled in.` : `Done — saved. I changed:\n${listChanges(changes)}`;
    bot(`${intro}${what}${issues}\n\n${REVIEW_LINE}`, chips);
  };

  const applyEdit = (patch: Record<string, unknown>, note: string, lead?: string) => {
    const target = getTarget();
    if (!target) return;
    const before = target.getData();
    const { data: next, problems } = applyAssistantPatch(target.documentKind, target.documentId, before, patch);
    const changes = diffRecordData(before, next, target.labels);
    const intro = lead ? `${lead}\n` : "";
    const issues = problems.length ? `\n\n${problems.join("\n")}` : "";
    if (changes.length === 0) {
      bot(`${intro}Nothing on the form changed.${issues || ' Tell me the field and the new value, e.g. "checker is Vijay".'}`);
      return;
    }
    if (!target.editable) {
      if (!target.reopen) {
        bot(`${intro}This record can't be changed from here.`);
        return;
      }
      pendingRef.current = { next, changes, note, recordId: target.recordId, problems };
      bot(
        `${intro}This record is ${target.status}. To change it I'll reopen it for correction — then it has to be submitted and verified again, and its history keeps what it said before.\n\nThe change:\n${listChanges(changes)}${issues}\n\nReason I'll record: “${note}”. Go ahead?`,
        [
          { label: "Yes, correct it", action: { type: "confirmCorrection" }, tone: "primary" },
          { label: "No, leave it", action: { type: "cancelCorrection" } },
        ]
      );
      return;
    }
    commitEdit(target, next, changes, note, problems, intro);
  };

  // ---- sending free text ---------------------------------------------------
  // `spoken` = the question came in by voice, so the answer is read back even
  // when "read replies aloud" is off.
  const send = async (raw?: string, spoken = false) => {
    const text = (raw ?? input).trim();
    if (!text || loading) return;
    setInput("");
    const t2 = getTarget();
    const speakReplies = settingsRepository.get().speakReplies;
    const readOut = (reply: string) => {
      if (spoken || speakReplies) speak(reply, speechLocale);
    };

    // A delete waiting for its reason: the next thing typed (or said) is it.
    if (pendingDelete?.needsReason && t2?.remove && t2.recordId === pendingDelete.recordId) {
      me(text);
      const what = t2.title ?? "The record";
      setPendingDelete(null);
      t2.remove(text);
      bot(`${what} is deleted, with your reason on file: “${text}”. The deletion is listed in Document Library → Records deleted.`);
      return;
    }

    // A fetch from HR Master Data waiting for a yes: "yes", "only the blanks" and
    // "no" answer it; anything else sets it aside.
    const mf = masterFillRef.current;
    if (mf && t2 && mf.recordId === t2.recordId) {
      if (/^(?:only\b.*\bblank|just\b.*\bblank)/i.test(text)) {
        runAction({ label: text, action: { type: "confirmMasterFill", blanksOnly: true } });
        return;
      }
      if (/^(?:yes|yeah|yep|ok|okay|sure|go\s+ahead|do\s+it|fill\s+(?:it|them|these))\b/i.test(text)) {
        runAction({ label: text, action: { type: "confirmMasterFill" } });
        return;
      }
      if (/^(?:no|nope|cancel|leave\s+it|don'?t|not\s+now)\b/i.test(text)) {
        runAction({ label: text, action: { type: "cancelMasterFill" } });
        return;
      }
      masterFillRef.current = null;
    }
    // Asked "whose details?": the answer is the person, unless it is an instruction.
    if (awaitingPersonRef.current && t2 && awaitingPersonRef.current === t2.recordId) {
      awaitingPersonRef.current = null;
      if (!parseAssistantCommand(text, true, todayISO(), { strict: true }) && !/^(?:stop|cancel|no|never\s*mind|later)\b/i.test(text)) {
        me(text);
        askMasterFill(text, hrMasterIntent(text, true)?.kind === "fetch" ? (hrMasterIntent(text, true) as { query: string }).query || text : text);
        return;
      }
    }

    if (awaitingSendBackReason && t2?.checklist) {
      me(text);
      setAwaitingSendBackReason(false);
      t2.checklist.sendBack(text);
      bot("Sent back with your note. It's back with whoever prepared it.");
      return;
    }

    const g = guidedRef.current;
    if (g && t2?.checklist) {
      // An outright instruction — "submit this record", "print it", "delete
      // this" — is obeyed even mid-walk-through; anything else typed here is
      // the answer to the question on screen (engine/assistantCommands.ts).
      const midWalk = parseAssistantCommand(text, true, todayISO(), { strict: true });
      if (midWalk && runStrictCommand(midWalk, text)) return;
      if (g.prompt.freeText === "header") {
        answerGuided({ type: "text", text }, text);
        return;
      }
      if (g.prompt.freeText === "item" && g.step.kind === "item") {
        me(text);
        setLoading(true);
        try {
          const activity = t2.checklist.getData().sections[g.step.sectionIndex].items[g.step.itemIndex].activity;
          const parsed = await assistantApi.checklistAnswer(activity, text, todayISO());
          answerGuided({ type: "parsed", ...parsed });
        } catch {
          answerGuided({ type: "text", text });
        } finally {
          setLoading(false);
        }
        return;
      }
      if (g.step.kind === "approval" && /^(yes|yeah|yep|ok|okay|sure|submit|go ahead|do it)\b/i.test(text)) {
        runAction({ label: text, action: { type: "submit" } });
        return;
      }
    }

    // Mid-interview, what is typed is the answer to the question on screen —
    // unless it BEGINS with an instruction (submit, print, stop, skip …).
    const iv = interviewRef.current;
    if (iv && t2 && t2.recordId === iv.recordId) {
      // "fetch GP3 1024" said mid-interview fetches that person; a bare GP3 No.
      // or name is the answer to the question on screen.
      const midFetch = hrMasterIntent(text, !!hrMasterLinkFor(t2.documentId));
      if (midFetch?.kind === "fetch" && midFetch.explicit && hrMasterLinkFor(t2.documentId)) {
        me(text);
        askMasterFill(text, midFetch.query);
        return;
      }
      const midQ = parseAssistantCommand(text, true, todayISO(), { strict: true });
      if (midQ && runStrictCommand(midQ, text)) return;
      if (/^(stop|cancel|later|enough|not now|that'?s all)\b/i.test(text)) {
        stopInterview(text);
        return;
      }
      if (/^(skip|next|pass|leave it|don'?t know|not sure)\b/i.test(text)) {
        skipInterviewQuestion(text);
        return;
      }
      answerInterview(text, text);
      return;
    }

    // A document named by its format number and nothing else — "F/HR/05",
    // "open F-QC-12" — is a question about that document even with a record
    // open, never data for the open record (engine/formatNumbers.ts, §52).
    const byFormat = formatNumberAnswer(text);
    if (byFormat) {
      me(text);
      bot(byFormat.reply, byFormat.chips);
      readOut(byFormat.reply);
      if (byFormat.navigate && isValidAppRoute(byFormat.navigate)) navigate(byFormat.navigate);
      return;
    }

    // HR Master Data (REQUIREMENTS §53): "open HR master data" opens the sheet;
    // "fetch GP3 1024" / "fill from HR master data for Sandeep Parekh" on an HR
    // record that names a person lists what would go where and asks first.
    const onLinkedRecord = !!(t2 && hrMasterLinkFor(t2.documentId));
    const masterIntent = hrMasterIntent(text, onLinkedRecord);
    if (masterIntent?.kind === "fetch" && onLinkedRecord && hrMasterVisible()) {
      me(text);
      askMasterFill(text, masterIntent.query);
      return;
    }
    const masterAnswer = masterIntent ? hrMasterChatAnswer(text) : null;
    if (masterAnswer) {
      me(text);
      bot(masterAnswer.reply, masterAnswer.chips);
      readOut(masterAnswer.reply);
      if (masterAnswer.navigate && isValidAppRoute(masterAnswer.navigate)) navigate(masterAnswer.navigate);
      return;
    }

    // An instruction about the RECORD rather than its fields — create, fill the
    // whole thing, delete, submit, verify, cancel the edit, print — understood
    // here with no network, so it works spoken too (engine/assistantCommands.ts).
    const command = parseAssistantCommand(text, !!t2);
    if (command) {
      switch (command.kind) {
        case "create":
          runAction({ label: text, action: { type: "createRecord", documentId: command.documentId, dateISO: command.dateISO } });
          return;
        case "fill":
          if (command.candidates) {
            me(text);
            bot("Which document shall I fill with sample data?", candidateChips(command.candidates, "sampleFill", command.dateISO));
            return;
          }
          runAction({ label: text, action: { type: "sampleFill", documentId: command.documentId, dateISO: command.dateISO } });
          return;
        case "guide":
          if (command.candidates) {
            me(text);
            bot("Which document shall we fill?", candidateChips(command.candidates, "startInterview", command.dateISO));
            return;
          }
          runAction({ label: text, action: { type: "startInterview", documentId: command.documentId, dateISO: command.dateISO } });
          return;
        case "delete":
          runAction({ label: text, action: { type: "askDelete" } });
          return;
        case "submit":
          runAction({ label: text, action: { type: "askSubmit" } });
          return;
        case "verify":
          runAction({ label: text, action: { type: "doVerify" } });
          return;
        case "cancelEdit":
          runAction({ label: text, action: { type: "doCancelCorrection" } });
          return;
        case "print":
          runAction({ label: text, action: { type: "doPrint" } });
          return;
      }
    }

    me(text);
    // A plain-words change to the open record ("14:00 viscosity is 20.4",
    // "check point 3 is no", "customer sign is Kapila Barad") is understood
    // right here — instant, and no network needed (engine/recordPatch.ts).
    const localEdit = t2 ? parseLocalEdit(t2.documentKind, t2.documentId, t2.getData(), text) : null;
    if (localEdit) {
      applyEdit(localEdit, text);
      return;
    }
    // Calendar / workload / help QUESTIONS are answered right here from the
    // app's own data (engine/assistantLocal.ts). With a record open, an
    // instruction to change something ("can you fix the viscosity at 14:00")
    // goes to the model even when it's phrased like a question — the local
    // record-listing path would otherwise answer it with a list of records.
    const editIntent = !!t2 && looksLikeEdit(text);
    const looksLikeQuestion =
      /\?\s*$/.test(text) || /^(is|was|are|were|when|which|what|who|how|do|does|did|can|could|will|tell me|list|show|give me|i want|find|get me)\b/i.test(text);
    // With a record open, free text is normally data to fill in — but an
    // out-of-scope message never is, so it is declined either way.
    const local = !t2 || (looksLikeQuestion && !editIntent) ? localAnswer(text, isDemo, user?.name) : offTopicReply(text);
    if (local) {
      bot(local.reply, local.chips);
      readOut(local.reply);
      // e.g. "pest control documents from 1 to 19 January" opens exactly those files.
      if (local.navigate && isValidAppRoute(local.navigate)) navigate(local.navigate);
      return;
    }
    setLoading(true);
    try {
      const result = await assistantApi.chat({
        message: text,
        today: todayISO(),
        currentRoute: path,
        documentKind: t2?.documentKind,
        currentData: t2?.currentData,
        recordStatus: t2?.status,
        context: buildAssistantContext(isDemo, user?.name),
        language: lang,
      });
      if (result.action === "fill" && t2) {
        applyEdit(result.patch ?? {}, text, result.reply);
        readOut(result.reply);
        return;
      }
      if (result.action === "navigate" && result.route && isValidAppRoute(result.route)) {
        bot(result.reply);
        readOut(result.reply);
        navigate(result.route);
        return;
      }
      bot(result.reply);
      readOut(result.reply);
    } catch (err) {
      bot(err instanceof ApiError ? err.message : t("ai.error"));
    } finally {
      setLoading(false);
    }
  };

  const toggleListening = () => {
    // Pressing it while listening means "I've finished" — send what was said.
    if (listening) {
      sessionRef.current?.finish();
      sessionRef.current = null;
      setListening(false);
      return;
    }
    if (!voiceSupported) {
      bot(t("ai.voiceUnsupported"));
      return;
    }
    stopSpeaking();
    setListening(true);
    sessionRef.current = listenForUtterance({
      lang: speechLocale,
      // Show the sentence building in the box, so a pause mid-thought
      // clearly hasn't cut them off.
      onInterim: (partial) => setInput(partial),
      onFinal: (transcript) => {
        setInput("");
        void send(transcript, true);
      },
      onError: (kind) => bot(kind === "denied" ? t("ai.voiceDenied") : t("ai.voiceError")),
      onEnd: () => {
        sessionRef.current = null;
        setListening(false);
      },
    });
  };

  const describeDocument = () => {
    if (!targetDocumentId) return;
    const doc = documentRepository.getById(targetDocumentId);
    if (!doc) return;
    const info = getDocumentInfo(doc, masterRepository.get());
    me("About this document");
    bot(`${doc.name}\nWHAT — ${info.what}\nWHO — ${info.whoLabel}\nWHEN — ${info.when}\nHOW — ${info.how}`);
  };

  const placeholder = guided
    ? guided.prompt.freeText === "item"
      ? "…or type what happened, e.g. \"received on 3 Sept with photos\""
      : guided.prompt.freeText === "header"
        ? "Type it here"
        : "Tap an answer above, or ask me something else"
    : interview
      ? "Type your answer, or tap one above (\"skip\" / \"stop\" work too)"
      : (targetKind && PLACEHOLDER_BY_KIND[targetKind]) || t("ai.defaultPlaceholder");

  const subtitle = getTarget()?.checklist?.title ?? (hasTarget ? t("ai.recordOpenSubtitle") : t("ai.widgetSubtitle"));

  // The full-page Assistant IS the chat on that screen — two chat boxes
  // would just be confusing. (After every hook above, so the hook order is
  // identical on every render.)
  if (path === "/assistant") return null;

  return (
    <div ref={elRef} className="no-print" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 50, ...dragStyle }}>
      {!open && (
        <button
          className="btn btn-primary"
          style={{ borderRadius: 999, boxShadow: "var(--shadow-lg)", cursor: "grab", touchAction: "none" }}
          onClick={() => {
            if (!didJustDrag()) setOpen(true);
          }}
          {...dragHandleProps}
        >
          <FiMessageCircle size={15} /> {t("ai.widgetOpen")}
        </button>
      )}
      {open && (
        // Sized to its content, capped — a short conversation shouldn't park a
        // 640px panel over the page (it sits bottom-right, exactly where most
        // tables keep their "Open" buttons); a long one scrolls inside.
        <div className="card" style={{ width: 370, maxHeight: "min(640px, calc(100vh - 40px))", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-lg)" }}>
          <div
            className="flex items-center justify-between"
            style={{ cursor: "grab", touchAction: "none", padding: "12px 14px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}
            {...dragHandleProps}
          >
            <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
              {/* Mitra's face: its own initial, the way a person's chat avatar reads. */}
              <span className="chat-avatar" style={{ fontSize: 11, fontWeight: 700 }} aria-hidden="true">
                {ASSISTANT_NAME.charAt(0)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="text-sm font-semibold flex items-center gap-1">
                  {t("ai.title")} <FiMove size={10} className="text-faint" />
                </div>
                <div className="text-xs text-muted truncate" style={{ maxWidth: 250 }}>
                  {subtitle}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {hasTarget && (
                <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px" }} onPointerDown={(e) => e.stopPropagation()} onClick={describeDocument} title="About this document">
                  ?
                </button>
              )}
              <button
                className={`btn btn-ghost btn-sm btn-icon ${listening ? "voice-on" : ""}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={toggleListening}
                aria-label={listening ? t("ai.stopVoice") : t("ai.startVoice")}
                title={voiceSupported ? (listening ? t("ai.stopVoice") : t("ai.startVoice")) : t("ai.voiceUnsupported")}
                aria-pressed={listening}
              >
                {listening ? <FiMicOff size={14} /> : <FiMic size={14} />}
              </button>
              <button className="btn btn-ghost btn-sm" onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpen(false)} aria-label="Close assistant">
                <FiX size={14} />
              </button>
            </div>
          </div>

          <div ref={logRef} className="chat-log" style={{ flex: "1 1 auto", minHeight: 120, overflowY: "auto", padding: 14 }}>
            {messages.map((m) => (
              <React.Fragment key={m.id}>
                <div className={`chat-msg ${m.role}`}>{m.text}</div>
                {m.chips && m.chips.length > 0 && (
                  <div className="chat-chips" style={{ alignSelf: "flex-start", maxWidth: "95%" }}>
                    {m.chips.map((c) => (
                      <button key={c.label} type="button" className={`chat-chip ${c.tone ?? ""}`} onClick={() => runAction(c)}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </React.Fragment>
            ))}
            {pickingDate && (
              <div className="chat-msg bot" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="text-xs">Which date?</span>
                <input
                  type="date"
                  className="input input-sm"
                  style={{ width: 150 }}
                  autoFocus
                  max={todayISO()}
                  onChange={(e) => {
                    if (e.target.value) answerGuided({ type: "doneOn", date: e.target.value }, formatDisplayDate(e.target.value));
                  }}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => setPickingDate(false)}>
                  Cancel
                </button>
              </div>
            )}
            {loading && (
              <div className="chat-msg bot">
                <span className="chat-typing">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--color-border)", padding: "8px 12px 10px", flexShrink: 0 }}>
            <div className="chat-chips mb-2">
              {quickChips.map((c) => (
                <button key={c.label} type="button" className={`chat-chip ${c.tone ?? ""}`} style={{ fontSize: 11, padding: "3px 9px" }} onClick={() => runAction(c)}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-start">
              <textarea
                ref={inputRef}
                className="input"
                rows={2}
                style={{ flex: 1, resize: "none", fontSize: 13 }}
                placeholder={placeholder}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={loading}
              />
              <button className="btn btn-primary btn-sm" style={{ alignSelf: "stretch" }} onClick={() => send()} disabled={loading || !input.trim()} aria-label="Send">
                <FiSend size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
