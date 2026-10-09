import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { IconType } from "react-icons";
import {
  FiBarChart2,
  FiCalendar,
  FiClipboard,
  FiClock,
  FiFolder,
  FiLoader,
  FiMessageCircle,
  FiMessageSquare,
  FiPlus,
  FiRepeat,
  FiShield,
  FiSidebar,
  FiSun,
  FiTarget,
  FiTrash2,
  FiTrendingUp,
  FiVolume2,
  FiVolumeX,
  FiZap,
} from "react-icons/fi";
import { ApiError, assistantApi } from "../api/client";
import { useAuth } from "../store/AuthContext";
import { useAppStore } from "../store/AppStore";
import { isValidAppRoute, useRouter } from "../store/router";
import { onExternalChange, readJSON, writeJSON } from "../data/storageAdapter";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { answerLanguageFor, answerStaysLocal, buildAssistantContext, localAnswer, suggestedPrompts, withHindiNote } from "../engine/assistantLocal";
import { modelReachable, noteModelAnswered, noteModelFailed, unreachableLabel, type Unreachable } from "../engine/assistantReach";
import { assistantConfigured } from "../engine/features";
import {
  analyticIntent,
  citeLinks,
  evidenceAnswer,
  evidenceOptionsFor,
  historyForModel,
  keepIntent,
  looksLikeFollowUp,
  prepareEvidence,
  previousIntentIn,
  type CiteLink,
  type EvidencePack,
  type KeptIntent,
} from "../engine/historyDigest";
import { prepareScopedInsights } from "../engine/scopedInsights";
import { parseAssistantCommand } from "../engine/assistantCommands";
import { hrMasterChatAnswer } from "../engine/hrMasterAssistant";
import { createRecordForDocument } from "../engine/recordCrud";
import { refusalFor } from "../engine/accessRefusal";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { routeForRecord } from "../engine/reminders";
import { sampleFillDeclined, sampleFillOffered, sampleFillStoredRecord } from "../engine/sampleFill";
import { queueAfterOpen } from "../engine/assistantHandoff";
import type { Chip, ChipAction } from "../engine/guidedChecklist";
import { openBriefing } from "../components/common/AssistantBriefingPopup";
import { answerIn, tr, useLanguage, useT } from "../i18n";
import { guide, hello } from "../engine/assistantPersona";
import { SPEECH_LOCALES } from "../i18n/strings";
import { isSpeechOutputSupported, isVoiceInputSupported, listenForUtterance, speak, stopSpeaking, type VoiceSession } from "../utils/speech";
import { isRecorderSupported, recorderErrorKind, startRecording, type Recording } from "../utils/recorder";
// Mitra never talks over a person speaking into the microphone (REQUIREMENTS §81).
import { noVoiceHintOnce, setMicBusy } from "../utils/voice";
import { generateId } from "../utils/id";
import { formatDisplayDate, toISODate, todayISO } from "../utils/date";
import { historyForAgent, runMitraTurn } from "../engine/mitraAgent";
import { acceptFile, MAX_ATTACHMENTS, pickFromFolder, readAttachment } from "../engine/mitraAttachments";
import type { AttachmentKind, MitraAttachment, MitraStep, MitraToolContext } from "../engine/mitraTypes";
import { MitraComposer, type AttachSource } from "../components/mitra/MitraComposer";
import { MitraThread } from "../components/mitra/MitraThread";
import { MitraPhoneCard } from "../components/mitra/MitraPhoneCard";
import type { MitraMessageView } from "../components/mitra/MitraMessage";
import { stripMarkdown } from "../components/mitra/markdown";
import { attachmentNotes, attachmentsForResend, rememberAttachments, startTurn, stoppableContext, threadBefore } from "../components/mitra/messageActions";

// THE ASSISTANT, FULL PAGE — the same Mitra as the docked widget, laid out
// like a chat app: conversations on the left, the thread in the middle, a
// composer at the bottom, suggested questions when a chat is empty.
// Conversations are kept in this browser (localStorage) so a chat survives
// navigating away (Mitra will happily take you to another screen
// mid-conversation) and coming back.
//
// WHO ANSWERS (REQUIREMENTS §80, §72). When the server has a model, every
// message goes first to MITRA AS AN AGENT (engine/mitraAgent.ts): the model
// reads the message and the files attached to it, calls the app's own tools
// (engine/mitraTools.ts — open a document, fill the open record, search the
// records, work out history…) and answers in words; the steps it took are
// drawn under its answer as it works. When the model cannot be reached — no
// key on this server, no internet, the plant's daily allowance used up, or
// the call failed — the message falls through to the app's own chain, exactly
// as before: a few intents are answered on the client instantly (holidays,
// what's due, the briefing, out-of-scope questions, starting a document —
// engine/assistantLocal.ts, engine/assistantCommands.ts) and the rest goes to
// /api/assistant/chat with a digest of live facts; an answer the model did not
// give says so on its face (§72).
//
// Voice: press the microphone and speak. With a key on the server the sound
// is recorded and written down by the server (Groq Whisper); without one the
// browser's own speech recognition does it (utils/speech.ts), as it always
// has. Either way the words follow exactly the same path as anything typed,
// and a reply to a spoken question is read back aloud.
//
// Files: a PDF, a Word or Excel file, a CSV, a text file, a photo — attached
// with the +, dropped on the composer or pasted into it. The server reads the
// words out of each (a photo by OCR) and they travel with the message.
//
// Copy, Edit and Stop (REQUIREMENTS §85), as in Claude: every message can be
// copied; the person's own can be edited in place, and saving it cuts the
// conversation back to just before that message — in the stored conversation
// too — and sends the edited words as that turn again, with the same files, so
// the new answer replaces everything that came after. A turn being answered is
// stopped first: Stop marks its answer "Stopped.", answers no to any yes/no a
// tool is waiting on, and whatever the model sends back afterwards is never
// carried out (components/mitra/messageActions.ts).

// What may be typed in one message. The message the agent sends carries the
// attachments' text besides (engine/mitraAgent.ts caps that); the older /chat
// endpoint rejects messages over 2000 characters, so what goes there is cut.
const MAX_INPUT_CHARS = 4000;
const MAX_CHAT_CHARS = 2000;

/** What a stored message keeps of a file that went with it. */
interface StoredAttachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  characters: number;
}

interface StoredMessage {
  id: string;
  role: "bot" | "user";
  text: string;
  at: string; // ISO timestamp
  chips?: Chip[];
  /**
   * WHY THIS ANSWER DID NOT COME FROM THE MODEL (REQUIREMENTS §72), when it
   * did not. The plant could not tell that the assistant was answering from
   * the app's own tables rather than from the API — it worked with the
   * internet off, which is exactly how they noticed. An answer given without
   * the model now says so on its face.
   */
  offline?: Unreachable;
  /** The records an answer about history was read from, as links (REQUIREMENTS §75). */
  cites?: CiteLink[];
  /**
   * A question about history as it was understood when it was sent — its
   * topics, documents and dates (REQUIREMENTS §75) — so a follow-up, however
   * many messages later and on whatever day, builds on exactly that.
   */
  intent?: KeptIntent;
  /** The tools the agent called for this answer, in order (REQUIREMENTS §80). */
  steps?: MitraStep[];
  /** The files that went with the person's message. */
  attachments?: StoredAttachment[];
  /** The answers to a question Mitra asked, as chips; retired once the conversation moves on. */
  options?: string[];
  /** The agent is still writing this one. Never true after the page is loaded again. */
  pending?: boolean;
  /** A yes/no a tool put to the person (MitraToolContext.confirm); `options` holds the two words. */
  confirm?: { yes: string; no: string };
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
}

interface StoredState {
  activeId: string | null;
  conversations: Conversation[];
}

const STORE_KEY = "assistant-conversations";
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES = 200;

// THE CONVERSATIONS LIVE IN THE BROWSER'S STORE, AND ARE WRITTEN THERE AT ONCE.
// A tool the agent calls may take the person to another screen in the middle
// of a turn — "open today's daily record" does exactly that — and this page is
// then gone while the turn is still running. Its answer must still be kept, so
// every change is written straight to the store here, outside React, and the
// mounted page (this one or the next) is told. React's own state only mirrors
// the store.
const listeners = new Set<(s: StoredState) => void>();
let turnsInFlight = 0;

function readState(): StoredState {
  const s = readJSON<Partial<StoredState>>(STORE_KEY, {});
  return { activeId: s.activeId ?? null, conversations: Array.isArray(s.conversations) ? s.conversations : [] };
}

function commitState(next: StoredState): void {
  writeJSON(STORE_KEY, next);
  listeners.forEach((tell) => tell(next));
}

function mutateState(change: (s: StoredState) => StoredState): void {
  commitState(change(readState()));
}

// A turn cannot outlive the browser it ran in: a message still "pending" when
// the app was closed is closed here, and the chips of a yes/no whose promise
// is gone retire. Returns the same object when there is nothing to settle.
function settle(c: Conversation): Conversation {
  if (!c.messages.some((m) => m.pending || m.confirm)) return c;
  return {
    ...c,
    messages: c.messages.map((m) => (m.pending || m.confirm ? { ...m, pending: undefined, confirm: undefined, options: m.confirm ? undefined : m.options, text: m.text || "…" } : m)),
  };
}

function settleAll(s: StoredState): StoredState {
  let changed = false;
  const conversations = s.conversations.map((c) => {
    const next = settle(c);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...s, conversations } : s;
}

/** The state as the page should show it: settled, unless a turn is still running somewhere. */
function currentState(): StoredState {
  const raw = readState();
  if (turnsInFlight > 0) return raw;
  const settled = settleAll(raw);
  if (settled !== raw) writeJSON(STORE_KEY, settled);
  return settled;
}

// Timestamps are stored as UTC ISO strings; both the date and the time shown
// come from the same LOCAL Date, so a 01:15 IST message isn't labelled with
// the previous (UTC) calendar day.
function dayLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDisplayDate(toISODate(d));
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDisplayDate(toISODate(d))} ${hh}:${mm}`;
}

const narrowWindow = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches;

// A picture for each suggested question (engine/assistantLocal.ts SUGGESTION_IDS),
// found by its title in either language; a question this list does not know
// keeps the plain speech bubble.
const SUGGESTION_ICONS: [string, IconType][] = [
  ["due", FiClock],
  ["tomorrow", FiCalendar],
  ["nextHoliday", FiSun],
  ["adjustment", FiRepeat],
  ["reports", FiBarChart2],
  ["rat", FiTarget],
  ["daily", FiClipboard],
  ["rodent", FiTrendingUp],
  ["range", FiFolder],
];

function suggestionIcon(title: string): IconType {
  const hit = SUGGESTION_ICONS.find(([id]) => tr("en", `sugg.${id}.title`) === title || tr("gu", `sugg.${id}.title`) === title);
  return hit ? hit[1] : FiMessageSquare;
}

export function AssistantPage() {
  const { user } = useAuth();
  const { mode, currentUser, bump, uiLang } = useAppStore();
  const { navigate } = useRouter();
  const { lang } = useLanguage();
  const t = useT();
  const isDemo = mode === "demo";
  const [state, setState] = useState<StoredState>(currentState);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Which conversation the in-flight request belongs to — the typing bubble
  // is only shown there, and that conversation can't be deleted from under
  // its own pending reply.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(() => settingsRepository.get().speakReplies);
  // The files attached to the message being written (REQUIREMENTS §80).
  const [attachments, setAttachments] = useState<MitraAttachment[]>([]);
  const [recording, setRecording] = useState({ active: false, seconds: 0, transcribing: false });
  // The list of conversations folds away on a narrow window, and on request.
  const [sideCollapsed, setSideCollapsed] = useState(narrowWindow);
  // While the phone code is shown it has the conversations' room (styles.css .is-phone-open).
  const [phoneOpen, setPhoneOpen] = useState(false);
  // Drawn again when the network comes or goes, so the status dot is honest.
  const [, setNetTick] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  const recorderRef = useRef<Recording | null>(null);
  const attachmentsRef = useRef<MitraAttachment[]>([]);
  // The yes/no questions tools have put and not yet had answered, by message id.
  const confirmsRef = useRef(new Map<string, (yes: boolean) => void>());
  // What Stop does for the answer being waited for, while there is one (REQUIREMENTS §85).
  const stopRef = useRef<(() => void) | null>(null);
  const firstName = (user?.name ?? currentUser).trim().split(/\s+/)[0];
  const active = state.conversations.find((c) => c.id === state.activeId) ?? null;
  const voiceSupported = isVoiceInputSupported();
  const speechSupported = isSpeechOutputSupported();
  const speechLocale = SPEECH_LOCALES[lang];
  // Whisper when the server has a key and this browser can record; else the
  // browser's own recognition, exactly as before; else a button that explains.
  const voiceMode: "whisper" | "browser" | "none" = assistantConfigured() && isRecorderSupported() ? "whisper" : voiceSupported ? "browser" : "none";
  const reachNow = modelReachable();
  const ready = assistantConfigured() && reachNow.ok;
  const notReadyWhy: Unreachable = reachNow.ok ? "not-configured" : reachNow.why;

  // The store tells this page about every change — its own, and one made by a
  // turn that outlived an earlier copy of the page. A conversation brought in
  // from another device (data/serverSync.ts) is taken in the same way.
  useEffect(() => {
    listeners.add(setState);
    const off = onExternalChange((key) => {
      if (key === null || key === STORE_KEY) setState(currentState());
    });
    return () => {
      listeners.delete(setState);
      off();
    };
  }, []);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Ready to type at once — without scrolling the window to the composer, which
  // on a phone pushed Mitra's greeting off the top of the screen.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [state.activeId]);

  useEffect(() => {
    const tick = () => setNetTick((n) => n + 1);
    window.addEventListener("online", tick);
    window.addEventListener("offline", tick);
    return () => {
      window.removeEventListener("online", tick);
      window.removeEventListener("offline", tick);
    };
  }, []);

  // Leaving the page must not leave the microphone open or a reply still
  // being read out.
  useEffect(() => {
    return () => {
      sessionRef.current?.cancel();
      recorderRef.current?.cancel();
      recorderRef.current = null;
      setMicBusy(false);
      stopSpeaking();
    };
  }, []);

  const createConversation = (): string => {
    const id = generateId("conv");
    const now = new Date().toISOString();
    mutateState((s) => ({
      activeId: id,
      conversations: [{ id, title: t("ai.newChat"), createdAt: now, updatedAt: now, messages: [] }, ...s.conversations].slice(0, MAX_CONVERSATIONS),
    }));
    return id;
  };

  const selectConversation = (id: string) => mutateState((s) => ({ ...s, activeId: id }));

  const removeConversation = (id: string) => {
    mutateState((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id);
      return { activeId: s.activeId === id ? (conversations[0]?.id ?? null) : s.activeId, conversations };
    });
  };

  const append = (convId: string, msg: StoredMessage) => {
    mutateState((s) => ({
      ...s,
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        // A conversation is named after its first real message — in whichever
        // language that chat was started in; a message that is only files, after them.
        const first = msg.role === "user" && !c.messages.some((m) => m.role === "user");
        const title = first ? (msg.text || msg.attachments?.map((a) => a.name).join(", ") || c.title).slice(0, 48) : c.title;
        return {
          ...c,
          updatedAt: msg.at,
          title,
          // Older chips and options are retired once the conversation moves on —
          // the same rule as the widget, so a stale "Open" or "Yes" can't act on
          // an outdated answer.
          messages: [...c.messages.map((m) => (m.chips || m.options ? { ...m, chips: undefined, options: undefined } : m)), msg].slice(-MAX_MESSAGES),
        };
      }),
    }));
  };

  const patchMessage = (convId: string, messageId: string, change: Partial<StoredMessage> | ((m: StoredMessage) => StoredMessage)) => {
    mutateState((s) => ({
      ...s,
      conversations: s.conversations.map((c) =>
        c.id !== convId ? c : { ...c, messages: c.messages.map((m) => (m.id !== messageId ? m : typeof change === "function" ? change(m) : { ...m, ...change })) }
      ),
    }));
  };

  const removeMessage = (convId: string, messageId: string) => {
    mutateState((s) => ({ ...s, conversations: s.conversations.map((c) => (c.id !== convId ? c : { ...c, messages: c.messages.filter((m) => m.id !== messageId) })) }));
  };

  const stamp = () => new Date().toISOString();

  // "Generate an external CAPA for me", "I want to fill the daily monitoring
  // record", "create a new fly catcher record" — said here, where no record
  // is open. The record is started (or today's found) and opened; sample data
  // is written before it opens, and question-by-question filling is parked
  // for the widget to begin the moment it does (engine/assistantHandoff.ts).
  const startDocument = (kind: "create" | "fill" | "guide", documentId: string, dateISO: string, convId: string) => {
    const doc = documentRepository.getById(documentId);
    if (!doc) return;
    // Sample data never goes into a live record in the plant (REQUIREMENTS §98): say so, and start nothing for it.
    if (kind === "fill" && !sampleFillOffered(isDemo)) {
      append(convId, { id: generateId("msg"), role: "bot", text: sampleFillDeclined(), at: stamp() });
      return;
    }
    // Starting a record, or filling one, needs Write on the document (REQUIREMENTS §96): said in the screens' language, and nothing started.
    const onFile = recordRepository.query({ documentId: doc.id, isDemo, dueDate: dateISO }).length > 0;
    const stop = (onFile ? null : refusalFor(doc.id, "start", uiLang)) ?? (kind === "create" ? null : refusalFor(doc.id, "fill", uiLang));
    if (stop) {
      append(convId, { id: generateId("msg"), role: "bot", text: stop, at: stamp() });
      return;
    }
    const { record, existed } = createRecordForDocument(doc, { dateISO, isDemo });
    bump();
    const opened = existed ? `Opening the ${doc.name} for ${formatDisplayDate(dateISO)} that already exists` : `Started a new ${doc.name} for ${formatDisplayDate(dateISO)}`;
    let reply = `${opened}. It's a draft — fill it in on the form, or ask me there.`;
    if (kind === "fill") {
      const filled = sampleFillStoredRecord(record.id, user?.name ?? currentUser);
      reply = filled
        ? `${opened} and filled it with sample data — realistic, but made up, so check every value before you submit:\n${filled.summary.map((s) => `• ${s}`).join("\n")}`
        : `${opened}. This document is kept as issued, so there was nothing to fill with sample data.`;
    } else if (kind === "guide") {
      queueAfterOpen(record.id, "interview");
      reply = `${opened} — I'll ask you what to put in it, one thing at a time, as soon as it opens.`;
    }
    const route = routeForRecord(doc, record.id);
    append(convId, { id: generateId("msg"), role: "bot", text: reply, at: stamp(), chips: [{ label: t("ai.openItAgain"), action: { type: "navigate", route } }] });
    navigate(route);
  };

  const runChip = (chip: Chip) => {
    const a = chip.action;
    if (a.type === "guide") {
      // Mitra's own walk-through, answered in the conversation itself.
      const convId = active?.id ?? createConversation();
      const step = guide(a.step);
      append(convId, { id: generateId("msg"), role: "user", text: chip.label, at: stamp() });
      append(convId, { id: generateId("msg"), role: "bot", text: step.text, chips: step.chips, at: stamp() });
      return;
    }
    if (a.type === "navigate") navigate(a.route);
    else if (a.type === "briefing") openBriefing();
    else if (a.type === "focusInput") inputRef.current?.focus();
    else if ((a.type === "sampleFill" || a.type === "startInterview") && a.documentId) {
      startDocument(a.type === "sampleFill" ? "fill" : "guide", a.documentId, a.dateISO ?? todayISO(), active?.id ?? createConversation());
    } else if (a.type === "createRecord") startDocument("create", a.documentId, a.dateISO, active?.id ?? createConversation());
  };

  // What a tool may ask the page to do on its behalf (engine/mitraTools.ts
  // start_guided_fill and its kin): the flows this page already runs for a
  // chip. Anything that needs the widget's open record is left alone here.
  const runToolAction = (action: ChipAction) => {
    if (action.type === "navigate" || action.type === "briefing" || action.type === "sampleFill" || action.type === "startInterview" || action.type === "createRecord") {
      runChip({ label: "", action });
    }
  };

  // A YES/NO PUT BY A TOOL before something that cannot be undone — deleting a
  // record, reopening a verified one — drawn as two chips; the click answers
  // the promise, the chips retire, and the choice shows as the person's.
  const askToConfirm = (convId: string, question: string, yes: string, no: string): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const id = generateId("msg");
      confirmsRef.current.set(id, resolve);
      append(convId, { id, role: "bot", text: question, at: stamp(), options: [yes, no], confirm: { yes, no } });
    });

  /** Every question still waiting is answered this way — typing something else means no. */
  const settleConfirms = (answer: boolean) => {
    confirmsRef.current.forEach((resolve) => resolve(answer));
    confirmsRef.current.clear();
  };

  // ONE ANSWER BEING WAITED FOR (REQUIREMENTS §85): the typing dots or the
  // thinking line in its conversation, the busy composer, and Stop. `end` is
  // safe to call twice — a stopped turn's own ending, arriving later, must not
  // end the next turn's wait.
  const beginWait = (convId: string, onStopped: () => void, agent: boolean) => {
    const turn = startTurn();
    let over = false;
    if (agent) turnsInFlight += 1;
    const end = () => {
      if (over) return;
      over = true;
      if (agent) turnsInFlight = Math.max(0, turnsInFlight - 1);
      if (stopRef.current === stop) stopRef.current = null;
      setLoading(false);
      setPendingId(null);
    };
    const stop = () => {
      if (over) return;
      turn.stop();
      // A yes/no a tool is waiting on is answered no: nothing it would have done is done.
      settleConfirms(false);
      onStopped();
      end();
    };
    stopRef.current = stop;
    setLoading(true);
    setPendingId(convId);
    return { turn, end };
  };

  const onOption = (choice: string, m: MitraMessageView) => {
    const convId = active?.id;
    if (m.confirm && convId) {
      const resolve = confirmsRef.current.get(m.id);
      confirmsRef.current.delete(m.id);
      patchMessage(convId, m.id, { options: undefined });
      append(convId, { id: generateId("msg"), role: "user", text: choice, at: stamp() });
      resolve?.(choice === m.confirm.yes);
      return;
    }
    // An answer to ask_user goes as the next message, as if typed.
    void send(choice);
  };

  const toolContext = (convId: string, words: string, files: MitraAttachment[]): MitraToolContext => ({
    today: todayISO(),
    isDemo,
    language: lang,
    userName: user?.name ?? currentUser,
    currentRoute: "/assistant",
    navigate: (route) => {
      if (isValidAppRoute(route)) navigate(route);
    },
    // No record is open on this page; the widget is the host for that.
    target: null,
    bump,
    attachments: files,
    confirm: (question, yes, no) => askToConfirm(convId, question, yes, no),
    runWidgetAction: runToolAction,
    userWords: words,
  });

  // FILES FOR THE MESSAGE BEING WRITTEN (REQUIREMENTS §80). Each is read on the
  // server as soon as it is chosen (engine/mitraAttachments.ts) so its chip
  // says what it holds before the message goes; a file that cannot go says why.
  const upsertAttachment = (a: MitraAttachment) => setAttachments((list) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a]));

  const addFiles = (files: File[], source: AttachSource) => {
    const notes: string[] = [];
    let chosen = files;
    let skipped = 0;
    if (source === "folder") {
      const picked = pickFromFolder(files);
      chosen = picked.files;
      skipped = picked.skipped;
      notes.push(...picked.reasons.slice(0, 2));
    }
    const room = MAX_ATTACHMENTS - attachmentsRef.current.length;
    if (chosen.length > room) {
      notes.push(t("ai.tooMany", { n: MAX_ATTACHMENTS }));
      chosen = chosen.slice(0, Math.max(0, room));
    }
    for (const file of chosen) {
      // Too big, empty, hidden, or a kind nobody here can read — said in the interface language.
      const verdict = acceptFile(file);
      if (!verdict.ok) {
        notes.push(verdict.why);
        continue;
      }
      void readAttachment(file, upsertAttachment)
        .then(upsertAttachment)
        .catch(() => {
          // The reader says a failure through its own chip; should it throw
          // instead, the chip must not stay "reading" for ever.
          setAttachments((list) => list.map((a) => (a.status === "reading" && a.name === file.name && a.size === file.size ? { ...a, status: "failed", note: t("ai.readFailed") } : a)));
        });
    }
    if (skipped > 0) notes.push(t("ai.folderSkipped", { n: skipped, max: MAX_ATTACHMENTS }));
    if (notes.length) setVoiceNote(notes.join(" "));
    inputRef.current?.focus();
  };

  const removeAttachment = (id: string) => setAttachments((list) => list.filter((a) => a.id !== id));

  // `spoken` = the question arrived by voice, so the reply is read back even
  // when "read replies aloud" is off — answering out loud is the whole point
  // of having asked out loud.
  //
  // `edit` = an edited message sent as its turn again (REQUIREMENTS §85): its
  // own files, and the conversation as it stood before it (the thread is
  // already cut back in the store). The composer — what is being typed there,
  // the files waiting in it — is not touched.
  const send = async (raw?: string, spoken = false, edit?: { files: MitraAttachment[]; earlier: StoredMessage[] }) => {
    const text = (raw ?? input).trim().slice(0, MAX_INPUT_CHARS);
    const files = edit ? edit.files : attachmentsRef.current.filter((a) => a.status === "ready");
    if ((!text && files.length === 0) || loading) return;
    // A file still being read goes with the next message, not half-read with this one.
    if (!edit && attachmentsRef.current.some((a) => a.status === "reading")) return;
    if (!edit) {
      setInput("");
      setAttachments([]);
    }
    setVoiceNote(null);
    // A yes/no still waiting is answered by moving on: no.
    settleConfirms(false);
    const convId = active?.id ?? createConversation();
    // The conversation before this message (the message itself is not in it).
    const before = edit ? edit.earlier : (active?.messages ?? []);
    // A reply in Hindi or Gujarati this browser has no voice for is shown, not said, and once a
    // session the line above the composer says where Mitra can be heard (REQUIREMENTS §89).
    const readOut = (reply: string) => {
      if (!spoken && !speakReplies) return;
      speak(stripMarkdown(reply), speechLocale, {
        onNoVoice: (l) => {
          const hint = noVoiceHintOnce(l, t);
          if (hint) setVoiceNote(hint);
        },
      });
    };
    // Kept in this tab, so an edit of this message goes with the same files' words.
    rememberAttachments(files);
    const askedId = generateId("msg");
    append(convId, {
      id: askedId,
      role: "user",
      text,
      at: stamp(),
      ...(files.length ? { attachments: attachmentNotes(files) } : {}),
    });

    // MITRA AS AN AGENT (REQUIREMENTS §80). With a model to ask, the message and
    // its files go to the agent loop: the model calls the app's tools and the
    // steps appear under its answer as it works; a question it needs answered
    // comes back with its options as chips (ask_user). Should the loop fail —
    // the allowance used up, the server unreachable, the call refused — the
    // message falls through to the app's own chain below, whose answer then
    // says the model did not give it (§72).
    const reach = modelReachable();
    let agentFailure: Unreachable | null = null;
    if (assistantConfigured() && reach.ok) {
      const botId = generateId("msg");
      append(convId, { id: botId, role: "bot", text: "", at: stamp(), pending: true });
      // Stopped: what was said so far stays, the rest reads "Stopped."; a step
      // cut off mid-way is not left spinning, and a yes/no's chips retire.
      const { turn, end } = beginWait(
        convId,
        () => {
          patchMessage(convId, botId, (m) => ({
            ...m,
            pending: false,
            text: m.text || t("ai.agent.stopped"),
            ...(m.steps ? { steps: m.steps.map((s) => (s.status === "running" ? { ...s, status: "failed" as const } : s)) } : {}),
          }));
          mutateState((s) => ({
            ...s,
            conversations: s.conversations.map((c) => (c.id !== convId ? c : { ...c, messages: c.messages.map((m) => (m.confirm ? { ...m, confirm: undefined, options: undefined } : m)) })),
          }));
        },
        true
      );
      let steps: MitraStep[] = [];
      try {
        // The conversation so far — whoever answered each turn — is the agent's
        // memory (engine/mitraAgent.ts keeps at most six turns of it); the
        // message just sent is not in `before`, which is as it should be.
        const earlier = before.filter((m) => m.text && !m.pending).map((m) => ({ role: m.role === "bot" ? ("assistant" as const) : ("user" as const), text: m.text }));
        const out = await runMitraTurn({
          text,
          attachments: files,
          history: historyForAgent(earlier),
          // Once stopped, a tool call the model still sends back fails at its first step.
          ctx: stoppableContext(toolContext(convId, text, files), () => turn.stopped),
          signal: turn.signal,
          onEvent: (e) => {
            if (turn.stopped) return;
            if (e.type === "step") {
              steps = steps.some((s) => s.id === e.id)
                ? steps.map((s) => (s.id === e.id ? { ...s, label: e.label, status: e.status } : s))
                : [...steps, { id: e.id, tool: e.tool, label: e.label, status: e.status }];
              patchMessage(convId, botId, { steps });
            } else if (e.type === "text" && e.text.trim()) {
              patchMessage(convId, botId, { text: e.text });
            }
          },
        });
        if (turn.stopped) return;
        const said = (out.final ?? out.ask?.question ?? "").trim();
        patchMessage(convId, botId, (m) => ({
          ...m,
          pending: false,
          text: said || m.text || t("ai.done"),
          steps: out.steps.length ? out.steps : m.steps,
          ...(out.ask ? { options: out.ask.options } : {}),
        }));
        readOut(said || t("ai.done"));
        noteModelAnswered();
        return;
      } catch (err) {
        // Stopped: the person has moved on, and nothing answers in its place.
        if (turn.stopped) return;
        agentFailure = noteModelFailed(err);
        removeMessage(convId, botId);
        // …and on to the app's own chain.
      } finally {
        end();
      }
    }

    // Files were attached, but nothing could read them: said, never swallowed.
    if (files.length > 0) {
      append(convId, { id: generateId("msg"), role: "bot", text: t("ai.attachNeedsMitra"), at: stamp(), offline: agentFailure ?? (reach.ok ? "not-configured" : reach.why) });
      if (!text) return;
    }

    // HR Master Data (REQUIREMENTS §53) — "open HR master data"; a fetch said
    // here is told which record to open first.
    const master = answerIn(answerLanguageFor(text), () => hrMasterChatAnswer(text));
    if (master) {
      const reply = withHindiNote(master.reply, text);
      append(convId, { id: generateId("msg"), role: "bot", text: reply, at: stamp(), chips: master.chips });
      readOut(reply);
      if (master.navigate && isValidAppRoute(master.navigate)) navigate(master.navigate);
      return;
    }

    // Starting or filling a whole document (engine/assistantCommands.ts) —
    // no network, and the same whether typed or spoken.
    const command = parseAssistantCommand(text, false);
    if (command && (command.kind === "create" || command.kind === "fill" || command.kind === "guide")) {
      if (command.documentId) {
        startDocument(command.kind, command.documentId, command.dateISO, convId);
        return;
      }
      if (command.kind !== "create") {
        const type = command.kind === "fill" ? "sampleFill" : "startInterview";
        const ids = command.candidates ?? ["capa-customer-complaint", "gap-inspection", "daily-pest-monitoring", "fly-catcher", "training-record"];
        const chips: Chip[] = ids
          .map((id) => documentRepository.getById(id))
          .filter((d): d is NonNullable<typeof d> => !!d)
          .map((d) => ({ label: d.name.replace(/^CAPA — /, ""), action: { type, documentId: d.id, dateISO: command.dateISO } }));
        const reply = command.candidates
          ? "Which document do you mean?"
          : command.kind === "fill"
            ? "Which document shall I fill with sample data? Name it, or pick one:"
            : "Which document shall we fill together? Name it, or pick one:";
        append(convId, { id: generateId("msg"), role: "bot", text: reply, at: stamp(), chips });
        readOut(reply);
        return;
      }
    }

    // WHO ANSWERS (REQUIREMENTS §72). Scope, identity, the opening greeting and
    // anything that OPENS a screen are this app's own to answer and are
    // answered here. Everything else is a question, and the model answers it —
    // which is the whole point of having one. The app's own tables are still
    // there, but as a FALLBACK that says it is one.
    const local = localAnswer(text, isDemo, user?.name);
    if (local && answerStaysLocal(local)) {
      append(convId, { id: generateId("msg"), role: "bot", text: local.reply, at: stamp(), chips: local.chips });
      readOut(local.reply);
      // e.g. "pest control documents from 1 to 19 January" opens exactly those files.
      if (local.navigate && isValidAppRoute(local.navigate)) navigate(local.navigate);
      return;
    }

    // A QUESTION ABOUT HISTORY (REQUIREMENTS §75) — "which machine breaks down
    // most?", "how did QC do last quarter?", and a follow-up to the last one in
    // this conversation ("and the month before?"). The figures are worked out
    // here, on send and in slices, from the records this person may see
    // (engine/historyDigest.ts), and go with the question.
    const earlier = before;
    const today = todayISO();
    // The conversation is looked back through only for what reads as a
    // follow-up, and for the question about history last understood in it —
    // kept on the message that asked it, with its dates as they were then. A
    // conversation from before questions were kept is read again as before.
    const previous = looksLikeFollowUp(text) ? previousIntentIn(earlier, today) : null;
    const intent = analyticIntent(text, today, previous);
    if (intent) patchMessage(convId, askedId, { intent: keepIntent(intent) });
    // The conversation so far, so the model can read a follow-up (at most six turns).
    const history = historyForModel(earlier.map((m) => ({ role: m.role === "bot" ? ("assistant" as const) : ("user" as const), text: m.text })));

    // Stopped (REQUIREMENTS §85): said in one word, and the answer, when it comes, is not shown.
    const { turn, end } = beginWait(convId, () => append(convId, { id: generateId("msg"), role: "bot", text: t("ai.agent.stopped"), at: stamp() }), false);
    try {
      let evidence: EvidencePack | null = null;
      if (intent) {
        try {
          // A person's score among the accounts the Performance Scorecard scores them with.
          evidence = await prepareEvidence(intent, isDemo, 6000, await evidenceOptionsFor(intent, user));
        } catch (err) {
          // The question still goes to the model, without figures, rather than not at all.
          console.error("The evidence for this question could not be worked out", err);
        }
      }
      if (turn.stopped) return;
      // The app's own answer for when the model cannot give one: what its tables
      // already say, else the same figures said plainly (§72), with their records.
      const fallback = local ?? (intent && evidence ? evidenceAnswer(intent, evidence) : null);
      const fallbackCites = !local && evidence ? citeLinks(evidence.recordIds, evidence.recordIds) : undefined;
      const citesOf = (cites: CiteLink[] | undefined) => (cites && cites.length ? { cites } : {});

      // No model to ask — or the agent was just asked and could not answer, so
      // it is not asked twice: answered from the app's own tables, marked as such.
      const unreachable: Unreachable | null = !reach.ok ? reach.why : agentFailure;
      if (unreachable) {
        // In the question's language where the tables have it, a Hindi question's with its Hindi line (REQUIREMENTS §89).
        const asked = answerLanguageFor(text);
        const answer = fallback ?? { reply: asked ? tr(asked, "ai.offline.noAnswer") : t("ai.offline.noAnswer"), chips: undefined };
        const reply = withHindiNote(answer.reply, text);
        append(convId, { id: generateId("msg"), role: "bot", text: reply, at: stamp(), chips: answer.chips, offline: unreachable, ...citesOf(fallback ? fallbackCites : undefined) });
        readOut(reply);
        return;
      }

      try {
        // What stands out, for the live facts: worked out in slices before it is read.
        await prepareScopedInsights(isDemo).catch((err) => console.error("The insights could not be worked out", err));
        if (turn.stopped) return;
        const result = await assistantApi.chat({
          message: text.slice(0, MAX_CHAT_CHARS),
          today,
          currentRoute: "/assistant",
          context: buildAssistantContext(isDemo, user?.name, text),
          language: lang,
          ...(evidence ? { evidence: evidence.text } : {}),
          ...(history.length ? { history } : {}),
        });
        if (turn.stopped) return;
        if (result.action === "navigate" && result.route && isValidAppRoute(result.route)) {
          append(convId, {
            id: generateId("msg"),
            role: "bot",
            text: result.reply,
            at: stamp(),
            chips: [{ label: t("ai.openItAgain"), action: { type: "navigate", route: result.route } }],
          });
          readOut(result.reply);
          navigate(result.route);
          return;
        }
        // The records the answer was read from — only those the evidence tagged.
        append(convId, { id: generateId("msg"), role: "bot", text: result.reply, at: stamp(), ...citesOf(evidence ? citeLinks(result.cites, evidence.recordIds) : undefined) });
        readOut(result.reply);
        noteModelAnswered();
      } catch (err) {
        // THE MODEL COULD NOT ANSWER (REQUIREMENTS §72). The internet may have
        // gone mid-sentence, the server may have no key, or the plant's daily
        // allowance may be used up (§75) — so where the app's own tables have an
        // answer it is given, marked as the app's and saying why, never passed
        // off as the model's.
        if (turn.stopped) return;
        const why = noteModelFailed(err);
        if (fallback) {
          const reply = withHindiNote(fallback.reply, text);
          append(convId, { id: generateId("msg"), role: "bot", text: reply, at: stamp(), chips: fallback.chips, offline: why, ...citesOf(fallbackCites) });
          readOut(reply);
        } else {
          append(convId, {
            id: generateId("msg"),
            role: "bot",
            text: err instanceof ApiError ? err.message : t("ai.error"),
            at: stamp(),
            offline: why,
          });
        }
      }
    } finally {
      end();
    }
  };

  // EDIT (REQUIREMENTS §85). The person's message, changed and saved, is sent
  // as that turn again: the conversation is cut back to just before it — in
  // the store, so the kept conversation holds the edited thread — and the new
  // words go with the same files; the answer to them replaces everything that
  // came after. Refused while an answer is on its way (Stop first).
  const editMessage = (m: MitraMessageView, text: string): boolean => {
    if (loading || !active || active.messages.some((x) => x.pending)) return false;
    const earlier = threadBefore(active.messages, m.id);
    if (!earlier) return false;
    const files = attachmentsForResend(active.messages[earlier.length].attachments);
    if (!text && files.length === 0) return false;
    const convId = active.id;
    mutateState((s) => ({
      ...s,
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const at = c.messages.findIndex((x) => x.id === m.id);
        return at < 0 ? c : { ...c, messages: c.messages.slice(0, at) };
      }),
    }));
    void send(text, false, { files, earlier });
    inputRef.current?.focus();
    return true;
  };

  // THE BROWSER'S OWN RECOGNITION (utils/speech.ts), when the server has no
  // key: the sentence appears in the composer as it is spoken and goes as
  // typed once the speaker has finished (tests/e2e_voice.py).
  const toggleListening = () => {
    // Pressing it while listening means "I've finished" — send what was said
    // rather than throwing it away.
    if (listening) {
      sessionRef.current?.finish();
      sessionRef.current = null;
      setListening(false);
      return;
    }
    if (!voiceSupported) {
      setVoiceNote(t("ai.voiceUnsupported"));
      return;
    }
    stopSpeaking();
    setVoiceNote(null);
    setListening(true);
    sessionRef.current = listenForUtterance({
      lang: speechLocale,
      // The sentence appears in the composer as it is spoken, so the speaker
      // can see it building and knows they haven't been cut off.
      onInterim: (partial) => setInput(partial),
      onFinal: (transcript) => {
        setInput("");
        // Straight into the same send() as a typed message — voice is an
        // input method, not a separate assistant.
        void send(transcript, true);
      },
      onError: (kind) => setVoiceNote(kind === "denied" ? t("ai.voiceDenied") : t("ai.voiceError")),
      onEnd: () => {
        sessionRef.current = null;
        setListening(false);
      },
    });
  };

  // VOICE BY THE SERVER (Groq Whisper, REQUIREMENTS §80): record until the
  // button is pressed again (or the recorder's own limit of 90 s), have the
  // server write it down, and send the words as spoken. No language is forced
  // on the server (REQUIREMENTS §89): the screens' language says nothing of the
  // language spoken (English, Hindi or Gujarati, or a mix), and Whisper hears
  // which, so Mitra can answer in it.
  const transcribeClip = async (blob: Blob) => {
    setRecording({ active: false, seconds: 0, transcribing: true });
    try {
      const heard = await assistantApi.transcribe(blob, "auto");
      const said = heard.text.trim();
      if (said) void send(said, true);
      else setVoiceNote(t("ai.voiceError"));
    } catch (err) {
      setVoiceNote(err instanceof ApiError && err.code === "not-configured" ? t("ai.voiceUnsupported") : t("ai.voiceError"));
    } finally {
      setRecording({ active: false, seconds: 0, transcribing: false });
    }
  };

  const finishRecording = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setMicBusy(false);
    setRecording({ active: false, seconds: 0, transcribing: true });
    try {
      await transcribeClip(await rec.stop());
    } catch {
      setRecording({ active: false, seconds: 0, transcribing: false });
      setVoiceNote(t("ai.voiceError"));
    }
  };

  const startWhisper = async () => {
    stopSpeaking();
    setVoiceNote(null);
    try {
      const rec = await startRecording({
        onSeconds: (s) => setRecording((r) => (r.active ? { ...r, seconds: s } : r)),
        // The recorder stopped itself at its limit: the clip goes as if the button had been pressed.
        onAutoStop: (blob) => {
          recorderRef.current = null;
          setMicBusy(false);
          void transcribeClip(blob);
        },
      });
      recorderRef.current = rec;
      setMicBusy(true);
      setRecording({ active: true, seconds: 0, transcribing: false });
    } catch (err) {
      setMicBusy(false);
      const kind = recorderErrorKind(err);
      setVoiceNote(kind === "denied" ? t("ai.voiceDenied") : kind === "unsupported" ? t("ai.voiceUnsupported") : t("ai.voiceError"));
    }
  };

  const toggleWhisper = () => {
    if (recording.transcribing) return;
    if (recorderRef.current) void finishRecording();
    else void startWhisper();
  };

  const toggleSpeakReplies = () => {
    const next = !speakReplies;
    setSpeakReplies(next);
    settingsRepository.update({ speakReplies: next });
    if (!next) stopSpeaking();
  };

  const onCite = useCallback(
    (route: string) => {
      if (isValidAppRoute(route)) navigate(route);
    },
    [navigate]
  );

  // The line above the composer: listening or recording (red), the words
  // coming back, or what went wrong with a file or the microphone.
  const note =
    listening || recording.active
      ? {
          text: (
            <>
              <span className="voice-pulse" /> {recording.active ? t("ai.recording") : t("voice.mic.listening", { lang: t(`voice.mic.lang.${lang}`) })}
            </>
          ),
          listening: true,
        }
      : recording.transcribing
        ? {
            text: (
              <>
                <FiLoader size={12} className="mitra-spin" /> {t("ai.transcribing")}
              </>
            ),
          }
        : voiceNote
          ? { text: voiceNote }
          : null;

  return (
    <div className={`assistant-page ${isDemo ? "demo-watermark" : ""}`}>
      <aside className={`assistant-side card${sideCollapsed ? " is-collapsed" : ""}${phoneOpen ? " is-phone-open" : ""}`}>
        <div className="assistant-side-head">
          <span className="assistant-side-title">{t("ai.conversations")}</span>
          <button className="btn btn-primary btn-sm" onClick={() => createConversation()} aria-label={t("ai.newChat")}>
            <FiPlus size={13} /> {t("ai.newChat")}
          </button>
        </div>
        <div className="assistant-side-list">
          {/* Nothing kept yet: said kindly, with where the chats will be. */}
          {state.conversations.length === 0 && (
            <div className="assistant-side-empty">
              <span className="assistant-side-empty-icon" aria-hidden="true">
                <FiMessageCircle size={18} />
              </span>
              <div className="assistant-side-empty-title">{t("ai.side.emptyTitle")}</div>
              <div className="assistant-side-empty-text">{t("ai.side.emptyText")}</div>
            </div>
          )}
          {state.conversations.map((c) => (
            <div key={c.id} className={`assistant-conv ${c.id === state.activeId ? "active" : ""}`} onClick={() => selectConversation(c.id)}>
              <span className="assistant-conv-icon" aria-hidden="true">
                <FiMessageSquare size={13} />
              </span>
              <div className="assistant-conv-text">
                <div className="assistant-conv-title">{c.title}</div>
                <div className="assistant-conv-day">{dayLabel(c.updatedAt)}</div>
              </div>
              <button
                className="btn btn-ghost btn-sm btn-icon assistant-conv-delete"
                aria-label={t("ai.deleteConversation")}
                title={t("ai.deleteConversation")}
                disabled={c.id === pendingId}
                onClick={(e) => {
                  e.stopPropagation();
                  removeConversation(c.id);
                }}
              >
                <FiTrash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        {/* Mitra on the plant's phones, through Expo Go (2-Oct-2026): asked for and drawn only when opened. */}
        <MitraPhoneCard onOpenChange={setPhoneOpen} />
      </aside>

      <section className="assistant-main card">
        <header className="assistant-head">
          <button
            className="btn btn-ghost btn-sm btn-icon"
            data-action="toggle-conversations"
            onClick={() => setSideCollapsed((c) => !c)}
            aria-label={t("ai.toggleConversations")}
            title={t("ai.toggleConversations")}
            aria-pressed={!sideCollapsed}
          >
            <FiSidebar size={15} />
          </button>
          {/* Mitra's face: the same spark on every surface of the chat; a ring breathes round it while it answers. */}
          <span className={`chat-avatar${loading ? " is-thinking" : ""}`} aria-hidden="true">
            <FiZap size={16} />
          </span>
          <div className="assistant-head-text">
            <div className="font-semibold flex items-center gap-2" style={{ minWidth: 0 }}>
              <span>{t("ai.title")}</span>
              {/* Green: a model to ask, and the internet to reach it. Grey: this
                  system's own records answer, and the tooltip says why (§72). */}
              <span className="mitra-status" data-state={ready ? "ready" : "offline"} title={ready ? t("ai.ready") : unreachableLabel(notReadyWhy, t)}>
                {ready ? t("ai.ready") : t("ai.statusOffline")}
              </span>
            </div>
            <div className="text-xs text-muted truncate">{t("ai.headerSubtitle")}</div>
          </div>
          {speechSupported && (
            <button
              className={`btn btn-ghost btn-sm btn-icon ${speakReplies ? "voice-on" : ""}`}
              data-action="speak-replies"
              onClick={toggleSpeakReplies}
              aria-label={speakReplies ? t("ai.muteReplies") : t("ai.speakReplies")}
              title={speakReplies ? t("ai.muteReplies") : t("ai.speakReplies")}
              aria-pressed={speakReplies}
            >
              {speakReplies ? <FiVolume2 size={15} /> : <FiVolumeX size={15} />}
            </button>
          )}
        </header>

        <MitraThread
          className="assistant-log"
          messages={active?.messages ?? []}
          thinking={loading && pendingId === active?.id}
          onChip={runChip}
          onOption={onOption}
          onCite={onCite}
          timeLabel={timeLabel}
          onEdit={editMessage}
          // A turn begun before this page was opened again (a tool took the
          // person elsewhere mid-turn) is still being answered too.
          editLocked={loading || !!active?.messages.some((m) => m.pending)}
          emptyState={
            // THE WELCOME (2-Oct-2026): Mitra turns to the person — its face, a
            // greeting by the hour, what it is for — then offers where to go and
            // what to ask, each question a card with its own picture. The pieces
            // arrive in that order, a few pixels and a fade each (styles.css),
            // and stand still for somebody who asks for less motion.
            <div className="assistant-welcome">
              <div className="mitra-hero">
                <span className="mitra-hero-face" aria-hidden="true">
                  <FiZap size={24} />
                </span>
                <div className="mitra-hero-text">
                  <h2 className="mitra-hero-title">{hello(user?.name)}</h2>
                  <p className="mitra-hero-lead">{t("ai.welcome")}</p>
                  {/* "Where would you like to go?" — the same question the widget
                      opens with, answered right here (REQUIREMENTS §50). */}
                  <div className="chat-chips mitra-hero-chips">
                    <button type="button" className="chat-chip primary" data-action="guide-home" data-chip="guide" onClick={() => runChip({ label: t("ai.guide.whereToChip"), action: { type: "guide", step: "home" } })}>
                      {t("ai.whereTo")}
                    </button>
                  </div>
                </div>
              </div>
              <div className="assistant-suggestions">
                {suggestedPrompts().map((p, i) => {
                  const Icon = suggestionIcon(p.title);
                  return (
                    <button key={p.title} type="button" className="assistant-suggestion" style={{ "--i": i } as CSSProperties} onClick={() => void send(p.text)}>
                      <span className="assistant-suggestion-icon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span className="assistant-suggestion-words">
                        <strong>{p.title}</strong>
                        <span className="assistant-suggestion-ask">{p.text}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          }
        />

        <MitraComposer
          className="assistant-composer"
          inputRef={inputRef}
          value={input}
          onChange={setInput}
          onSend={() => void send()}
          busy={loading}
          onStop={loading && stopRef.current ? () => stopRef.current?.() : undefined}
          attachments={attachments}
          onAttach={addFiles}
          onRemoveAttachment={removeAttachment}
          recording={voiceMode === "whisper" ? recording : { active: listening, seconds: 0, transcribing: false }}
          onToggleVoice={voiceMode === "whisper" ? toggleWhisper : toggleListening}
          voiceMode={voiceMode}
          listenIn={t(`voice.mic.lang.${lang}`)}
          placeholder={t("ai.composerPlaceholderShort")}
          maxLength={MAX_INPUT_CHARS}
          note={note}
        />
        <div className="mitra-footer">
          <FiShield size={11} aria-hidden="true" />
          <span>{t("ai.footer")}</span>
        </div>
      </section>
    </div>
  );
}
