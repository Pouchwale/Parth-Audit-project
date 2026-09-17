import React, { useEffect, useRef, useState } from "react";
import { FiMessageSquare, FiMic, FiMicOff, FiPlus, FiSend, FiTrash2, FiVolume2, FiVolumeX, FiZap } from "react-icons/fi";
import { ApiError, assistantApi } from "../api/client";
import { useAuth } from "../store/AuthContext";
import { useAppStore } from "../store/AppStore";
import { isValidAppRoute, useRouter } from "../store/router";
import { onExternalChange, readJSON, writeJSON } from "../data/storageAdapter";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { buildAssistantContext, localAnswer, suggestedPrompts } from "../engine/assistantLocal";
import { parseAssistantCommand } from "../engine/assistantCommands";
import { hrMasterChatAnswer } from "../engine/hrMasterAssistant";
import { createRecordForDocument } from "../engine/recordCrud";
import { documentRepository } from "../data/repositories/documentRepository";
import { routeForRecord } from "../engine/reminders";
import { sampleFillStoredRecord } from "../engine/sampleFill";
import { queueAfterOpen } from "../engine/assistantHandoff";
import type { Chip } from "../engine/guidedChecklist";
import { openBriefing } from "../components/common/AssistantBriefingPopup";
import { useLanguage, useT } from "../i18n";
import { guide, hello } from "../engine/assistantPersona";
import { SPEECH_LOCALES } from "../i18n/strings";
import { isSpeechOutputSupported, isVoiceInputSupported, listenForUtterance, speak, stopSpeaking, type VoiceSession } from "../utils/speech";
import { generateId } from "../utils/id";
import { formatDisplayDate, toISODate, todayISO } from "../utils/date";

// The backend rejects messages over 2000 characters; a locally answered
// message never reaches it, so the same cap is applied here before storing.
const MAX_MESSAGE_CHARS = 2000;

// THE ASSISTANT, FULL PAGE — the same assistant as the floating widget, laid
// out like a chat app: conversations on the left, the thread in the middle, a
// composer at the bottom, suggested questions when a chat is empty.
// Conversations are kept in this browser (localStorage) so a chat survives
// navigating away (the assistant will happily take you to another screen
// mid-conversation) and coming back.
//
// Voice: press the microphone and speak — the browser's own speech
// recognition turns it into text, which then follows exactly the same path as
// anything typed (nothing is sent anywhere extra). Replies to a spoken
// question are read back aloud, and the speaker button turns that on for
// typed questions too. Both listen and speak follow the interface language
// (English or Gujarati). Where the browser has no speech recognition (Firefox)
// the microphone explains itself instead of failing silently.
//
// Answers come from two places: a few intents are answered on the client
// instantly (holidays / weekly off / adjustment days, what's due, the
// briefing, out-of-scope questions, help — see engine/assistantLocal.ts);
// everything else goes to /api/assistant/chat with a digest of live facts
// attached, so the model can answer from the app's own data.

interface StoredMessage {
  id: string;
  role: "bot" | "user";
  text: string;
  at: string; // ISO timestamp
  chips?: Chip[];
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

function loadState(): StoredState {
  const s = readJSON<Partial<StoredState>>(STORE_KEY, {});
  return { activeId: s.activeId ?? null, conversations: Array.isArray(s.conversations) ? s.conversations : [] };
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

export function AssistantPage() {
  const { user } = useAuth();
  const { mode, currentUser, bump } = useAppStore();
  const { navigate } = useRouter();
  const { lang } = useLanguage();
  const t = useT();
  const isDemo = mode === "demo";
  const [state, setState] = useState<StoredState>(loadState);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Which conversation the in-flight request belongs to — the typing bubble
  // is only shown there, and that conversation can't be deleted from under
  // its own pending reply.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(() => settingsRepository.get().speakReplies);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  const firstName = (user?.name ?? currentUser).trim().split(/\s+/)[0];
  const active = state.conversations.find((c) => c.id === state.activeId) ?? null;
  const voiceSupported = isVoiceInputSupported();
  const speechSupported = isSpeechOutputSupported();
  const speechLocale = SPEECH_LOCALES[lang];

  // Written only when it changed — and a conversation brought in from another
  // device (data/serverSync.ts) is taken in, not written over with this page's
  // older copy.
  useEffect(() => {
    if (JSON.stringify(loadState()) !== JSON.stringify(state)) writeJSON(STORE_KEY, state);
  }, [state]);
  useEffect(
    () =>
      onExternalChange((key) => {
        if (key === null || key === STORE_KEY) setState(loadState());
      }),
    []
  );

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [state.activeId]);

  // Leaving the page must not leave the microphone open or a reply still
  // being read out.
  useEffect(() => {
    return () => {
      sessionRef.current?.cancel();
      stopSpeaking();
    };
  }, []);

  const createConversation = (): string => {
    const id = generateId("conv");
    const now = new Date().toISOString();
    setState((s) => ({
      activeId: id,
      conversations: [{ id, title: t("ai.newChat"), createdAt: now, updatedAt: now, messages: [] }, ...s.conversations].slice(0, MAX_CONVERSATIONS),
    }));
    return id;
  };

  const removeConversation = (id: string) => {
    setState((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id);
      return { activeId: s.activeId === id ? (conversations[0]?.id ?? null) : s.activeId, conversations };
    });
  };

  const append = (convId: string, msg: StoredMessage) => {
    setState((s) => ({
      ...s,
      conversations: s.conversations.map((c) =>
        c.id !== convId
          ? c
          : {
              ...c,
              updatedAt: msg.at,
              // A conversation is named after its first real message — in
              // whichever language that chat was started in.
              title: !c.messages.some((m) => m.role === "user") && msg.role === "user" ? msg.text.slice(0, 48) : c.title,
              // Older chips are retired once the conversation moves on — the
              // same rule as the widget, so a stale "Open" button can't act
              // on an outdated answer.
              messages: [...c.messages.map((m) => (m.chips ? { ...m, chips: undefined } : m)), msg].slice(-MAX_MESSAGES),
            }
      ),
    }));
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

  // `spoken` = the question arrived by voice, so the reply is read back even
  // when "read replies aloud" is off — answering out loud is the whole point
  // of having asked out loud.
  const send = async (raw?: string, spoken = false) => {
    const text = (raw ?? input).trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text || loading) return;
    setInput("");
    setVoiceNote(null);
    const convId = active?.id ?? createConversation();
    const readOut = (reply: string) => {
      if (spoken || speakReplies) speak(reply, speechLocale);
    };
    append(convId, { id: generateId("msg"), role: "user", text, at: stamp() });

    // HR Master Data (REQUIREMENTS §53) — "open HR master data"; a fetch said
    // here is told which record to open first.
    const master = hrMasterChatAnswer(text);
    if (master) {
      append(convId, { id: generateId("msg"), role: "bot", text: master.reply, at: stamp(), chips: master.chips });
      readOut(master.reply);
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

    const local = localAnswer(text, isDemo, user?.name);
    if (local) {
      append(convId, { id: generateId("msg"), role: "bot", text: local.reply, at: stamp(), chips: local.chips });
      readOut(local.reply);
      // e.g. "pest control documents from 1 to 19 January" opens exactly those files.
      if (local.navigate && isValidAppRoute(local.navigate)) navigate(local.navigate);
      return;
    }

    setLoading(true);
    setPendingId(convId);
    try {
      const result = await assistantApi.chat({
        message: text,
        today: todayISO(),
        currentRoute: "/assistant",
        context: buildAssistantContext(isDemo, user?.name),
        language: lang,
      });
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
      append(convId, { id: generateId("msg"), role: "bot", text: result.reply, at: stamp() });
      readOut(result.reply);
    } catch (err) {
      append(convId, {
        id: generateId("msg"),
        role: "bot",
        text: err instanceof ApiError ? err.message : t("ai.error"),
        at: stamp(),
      });
    } finally {
      setLoading(false);
      setPendingId(null);
    }
  };

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

  const toggleSpeakReplies = () => {
    const next = !speakReplies;
    setSpeakReplies(next);
    settingsRepository.update({ speakReplies: next });
    if (!next) stopSpeaking();
  };

  return (
    <div className={`assistant-page ${isDemo ? "demo-watermark" : ""}`}>
      <aside className="assistant-side card">
        <div className="assistant-side-head">
          <span className="text-sm font-semibold">{t("ai.conversations")}</span>
          <button className="btn btn-primary btn-sm" onClick={() => createConversation()} aria-label={t("ai.newChat")}>
            <FiPlus size={13} /> {t("ai.newChat")}
          </button>
        </div>
        <div className="assistant-side-list">
          {state.conversations.length === 0 && (
            <div className="text-xs text-faint" style={{ padding: "10px 12px" }}>
              {t("ai.noConversations")}
            </div>
          )}
          {state.conversations.map((c) => (
            <div key={c.id} className={`assistant-conv ${c.id === state.activeId ? "active" : ""}`} onClick={() => setState((s) => ({ ...s, activeId: c.id }))}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="text-sm truncate">{c.title}</div>
                <div className="text-xs text-faint">{dayLabel(c.updatedAt)}</div>
              </div>
              <button
                className="btn btn-ghost btn-sm btn-icon"
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
      </aside>

      <section className="assistant-main card">
        <header className="assistant-head">
          <span className="chat-avatar" style={{ width: 30, height: 30 }}>
            <FiZap size={14} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="font-semibold">{t("ai.title")}</div>
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

        <div ref={logRef} className="assistant-log chat-log">
          {(!active || active.messages.length === 0) && (
            <div className="assistant-welcome">
              <h2 className="text-xl mb-1">{hello(user?.name)}</h2>
              <p className="text-muted mb-4" style={{ maxWidth: 560 }}>
                {t("ai.welcome")}
              </p>
              {/* "Where would you like to go?" — the same question the widget
                  opens with, answered right here (REQUIREMENTS §50). */}
              <div className="chat-chips mb-4">
                <button type="button" className="chat-chip primary" data-action="guide-home" onClick={() => runChip({ label: t("ai.guide.whereToChip"), action: { type: "guide", step: "home" } })}>
                  {t("ai.whereTo")}
                </button>
              </div>
              <div className="assistant-suggestions">
                {suggestedPrompts().map((p) => (
                  <button key={p.title} type="button" className="assistant-suggestion" onClick={() => send(p.text)}>
                    <FiMessageSquare size={13} className="text-faint" />
                    <span>
                      <strong>{p.title}</strong>
                      <span className="text-xs text-muted" style={{ display: "block" }}>
                        {p.text}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {active?.messages.map((m) => (
            <React.Fragment key={m.id}>
              <div className={`chat-msg ${m.role}`} title={timeLabel(m.at)}>
                {m.text}
              </div>
              {m.chips && m.chips.length > 0 && (
                <div className="chat-chips" style={{ alignSelf: "flex-start", maxWidth: "80%" }}>
                  {m.chips.map((c) => (
                    <button key={c.label} type="button" className={`chat-chip ${c.tone ?? ""}`} onClick={() => runChip(c)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </React.Fragment>
          ))}
          {loading && pendingId === active?.id && (
            <div className="chat-msg bot">
              <span className="chat-typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
        </div>

        {(listening || voiceNote) && (
          <div className={`assistant-voice-note ${listening ? "listening" : ""}`}>
            {listening ? (
              <>
                <span className="voice-pulse" /> {t("ai.listening")}
              </>
            ) : (
              voiceNote
            )}
          </div>
        )}

        <div className="assistant-composer">
          <textarea
            ref={inputRef}
            className="input assistant-input"
            rows={2}
            maxLength={MAX_MESSAGE_CHARS}
            placeholder={t("ai.composerPlaceholder")}
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
          {/* data-action is a stable hook for tests and shortcuts: the
              aria-label is translated, so it can't be selected on. */}
          <button
            className={`btn ${listening ? "btn-danger" : "btn-secondary"}`}
            data-action="voice"
            onClick={toggleListening}
            disabled={loading}
            aria-label={listening ? t("ai.stopVoice") : t("ai.startVoice")}
            title={voiceSupported ? (listening ? t("ai.stopVoice") : t("ai.startVoice")) : t("ai.voiceUnsupported")}
            aria-pressed={listening}
          >
            {listening ? <FiMicOff size={14} /> : <FiMic size={14} />} {listening ? t("ai.done") : t("ai.speak")}
          </button>
          <button className="btn btn-primary" data-action="send" onClick={() => send()} disabled={loading || !input.trim()} aria-label={t("ai.send")}>
            <FiSend size={14} /> {t("ai.send")}
          </button>
        </div>
        <div className="text-xs text-faint" style={{ padding: "0 16px 12px" }}>
          {t("ai.footer")}
        </div>
      </section>
    </div>
  );
}
