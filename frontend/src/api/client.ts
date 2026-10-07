import type { AuthUser, ManagedUser } from "../types/auth";
import type { ActivityTally } from "../engine/activityWork";
import type { AgentRequest, AgentResponse, ExtractResult, FillModelRequest, FillModelResponse, TranscribeResult } from "../engine/mitraTypes";
import { OUTSIDE_HOURS_CODE, type PublicHours } from "../engine/workingHoursCore";

export type { PublicHours };

// OUTSIDE THE PLANT'S WORKING HOURS (REQUIREMENTS §84). The server refuses an
// account held to the hours with 403 `outside-working-hours` on any route, the
// reason in plain words and the next opening. Wherever that comes back, it is
// said on window, and the sign-in state (store/AuthContext.tsx) signs the person
// out to those words — whichever screen asked.
export const OUTSIDE_HOURS_EVENT = "dcrs:outside-working-hours";

export interface OutsideHoursDetail {
  message: string;
  opensAt: string | null;
}

function sayOutsideHours(detail: OutsideHoursDetail): void {
  try {
    window.dispatchEvent(new CustomEvent<OutsideHoursDetail>(OUTSIDE_HOURS_EVENT, { detail }));
  } catch {
    /* no window */
  }
}

// Thin fetch wrapper for the auth API (backend/index.ts). Requests are
// same-origin in both dev (proxied, see frontend/scripts/dev-server.ts) and
// production (backend/index.ts serves the built frontend itself), so no
// base URL configuration is needed.
export class ApiError extends Error {
  status: number;
  /**
   * What the server said the failure IS, where it says (a short word such as
   * "daily-allowance"), so the app can act on it without reading the words
   * meant for a person. Absent for most errors.
   */
  code?: string;
  /** How long the server says to wait before asking again (a fill's "busy", REQUIREMENTS §94), when it says. */
  retryInMs?: number;
  constructor(message: string, status: number, code?: string, retryInMs?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (code) this.code = code;
    if (typeof retryInMs === "number" && Number.isFinite(retryInMs)) this.retryInMs = retryInMs;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty/non-JSON body */
  }

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed (${res.status})`;
    const code = body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code : undefined;
    // Not for the sign-in itself: that refusal is the sign-in form's to show, and nobody is signed in to sign out.
    if (res.status === 403 && code === OUTSIDE_HOURS_CODE && path !== "/auth/login" && path !== "/auth/signup") {
      const opensAt = (body as { opensAt?: unknown }).opensAt;
      sayOutsideHours({ message, opensAt: typeof opensAt === "string" ? opensAt : null });
    }
    const retryInMs = body && typeof body === "object" && typeof (body as { retryInMs?: unknown }).retryInMs === "number" ? (body as { retryInMs: number }).retryInMs : undefined;
    throw new ApiError(message, res.status, code, retryInMs);
  }

  return body as T;
}

/**
 * What GET /auth/me, POST /auth/login and POST /auth/signup answer: who is
 * signed in, and what this server has switched on (engine/features.ts,
 * REQUIREMENTS §65). `features` is optional: a server from before it says nothing, which reads as off.
 */
export interface AuthResponse {
  user: AuthUser;
  features?: ServerFeatures;
  /** The administrator set this password: they must choose their own before they can work (REQUIREMENTS §66). */
  mustChangePassword?: boolean;
  /** When this session ends (REQUIREMENTS §84). Optional: a server from before it says nothing, and nothing ends by itself. */
  session?: SessionEnd;
  /** The plant's hours and where today stands (§84). */
  hours?: PublicHours | null;
}

/** A day's session (backend/workingHours.ts SessionAnswer): when it ends, and whether the browser signs out by itself then. */
export interface SessionEnd {
  endsAt: string;
  /** A non-admin while the hours are enforced: warned ten minutes before `endsAt`, signed out at it. */
  signOutAtEnd: boolean;
  /** The server's clock when it answered. */
  now: string;
}

/** What the server has switched on. Both optional: a server from before them says nothing, which reads as off. */
export interface ServerFeatures {
  demoMode?: boolean;
  signup?: boolean;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) }),
};

export type AssistantAction = "fill" | "navigate" | "reply";

export interface AssistantChatResult {
  action: AssistantAction;
  patch?: Record<string, unknown>;
  route?: string;
  reply: string;
  // The records an answer about history was read from (REQUIREMENTS §75) —
  // only ids the evidence pack tagged, at most five; shown as "Open" links.
  // Optional: a server from before it, or a stubbed reply, says nothing.
  cites?: string[];
}

/** One earlier turn of the conversation, for a follow-up question (engine/historyDigest.ts historyForModel). */
export interface AssistantChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AssistantChatRequest {
  message: string;
  today: string;
  currentRoute: string;
  documentKind?: string;
  currentData?: unknown;
  // The open record's status. A change to a submitted/verified record is
  // still returned as a fill — the app asks the user to confirm reopening it.
  recordStatus?: string;
  // Short plain-text digest of live app facts (today's working-day status,
  // the weekly off, upcoming holidays / adjustment days, what's due) so the
  // model answers from the app's own data — see engine/assistantLocal.ts.
  context?: string;
  // Interface language: the reply comes back in this language, so a user
  // working in Gujarati is answered in Gujarati.
  language?: "en" | "gu";
  // THE EVIDENCE PACK for a question about history (REQUIREMENTS §75): the
  // figures worked out from the records this user may see
  // (engine/historyDigest.ts). The server then answers with its analyst prompt.
  // At most 8,000 characters.
  evidence?: string;
  // The last turns of the conversation — at most six, 800 characters each and
  // 3,000 in all — so a follow-up ("and the month before?") can be understood.
  history?: AssistantChatTurn[];
}

export interface ChecklistAnswerResult {
  done: boolean;
  notRequired: boolean;
  date: string | null;
  comment: string;
}

export const assistantApi = {
  chat: (req: AssistantChatRequest) => api.post<AssistantChatResult>("/assistant/chat", req),
  checklistAnswer: (activity: string, answer: string, today: string) =>
    api.post<ChecklistAnswerResult>("/assistant/checklist-answer", { activity, answer, today }),
  // MITRA AS AN AGENT (REQUIREMENTS §80, engine/mitraAgent.ts): the conversation
  // and the tool schemas go up, the model's words or its tool calls come back.
  agent: (req: AgentRequest) => api.post<AgentResponse>("/assistant/agent", req),
  // A FILL'S ONE SMALL CALL (REQUIREMENTS §94, components/mitra/useMitraFill.ts): the
  // words DCRS's rules could not read, with the form's card, read into the fixed shape.
  // 429 "daily-allowance" or "busy" (with retryInMs) comes back as an ApiError.
  fill: (req: FillModelRequest) => api.post<FillModelResponse>("/assistant/fill", req),
  // AN ATTACHED FILE, READ ON THE SERVER (backend/attachments.ts) — the raw bytes
  // as the body, like the CV reader below: the JSON limit is far too small for a
  // PDF or a photograph. Nothing is kept on the server.
  extract: (file: File | Blob, name: string) =>
    request<ExtractResult>("/assistant/extract", {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(name),
        ...(file.type ? { "x-file-type": file.type } : {}),
      },
      body: file,
    }),
  // WHAT WAS SAID, TRANSCRIBED BY WHISPER on the server; 503 `not-configured` without a key.
  // "auto": Whisper hears which language it is (REQUIREMENTS §89); a language only when the person chose one.
  transcribe: (blob: Blob, language: "en" | "hi" | "gu" | "auto") =>
    request<TranscribeResult>("/assistant/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "x-mime": blob.type || "audio/webm",
        "x-language": language,
      },
      body: blob,
    }),
  // MITRA'S NATURAL VOICE (REQUIREMENTS §81, backend/tts.ts): the line as one WAV.
  // Not through request(), which reads every answer as JSON. A 503 comes back as
  // an ApiError whose code is "voice-unavailable" (the speech model's terms are
  // not accepted for the Groq organisation) or "not-configured" (no key) — the
  // browser then speaks with its own voice (utils/voice.ts).
  speak: async (text: string, voice: "female" | "male", signal?: AbortSignal): Promise<Blob> => {
    const res = await fetch("/api/assistant/speak", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
      signal,
    });
    if (res.ok) return res.blob();
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    const said = body && typeof body === "object" ? (body as { error?: unknown; code?: unknown }) : {};
    throw new ApiError(typeof said.error === "string" ? said.error : `Request failed (${res.status})`, res.status, typeof said.code === "string" ? said.code : undefined);
  },
};

/** An account as the Performance Scorecard reads it: who it is and which departments it answers for — never the sign-in address. */
export type DirectoryPerson = Pick<AuthUser, "id" | "name" | "role" | "departments">;

// WHO MAY SEE WHICH DEPARTMENT'S DOCUMENTS. Only the administrator account
// (the first one created) can read this list or change an assignment — the
// restriction has to be set by somebody else, or it would be a preference
// rather than a rule (REQUIREMENTS §40, backend/index.ts requireAdmin).
export const usersApi = {
  list: () => api.get<{ users: ManagedUser[] }>("/users"),
  // THE ADMINISTRATOR'S OWN (REQUIREMENTS §66) — every one of them refused by
  // the server for anybody else, whatever the screen shows (backend/index.ts
  // requireAdmin). A password is sent to be stored and never comes back.
  create: (person: { name: string; email: string; password: string; departments: string[] }) => api.post<{ user: ManagedUser }>("/users", person),
  resetPassword: (userId: string, password: string) => api.post<{ ok: true }>(`/users/${encodeURIComponent(userId)}/password`, { password }),
  setActive: (userId: string, active: boolean) => api.post<{ user: ManagedUser }>(`/users/${encodeURIComponent(userId)}/active`, { active }),
  // Anybody signed in may read this one (REQUIREMENTS §64): every account for
  // the administrator and for an account with no departments, the accounts
  // that share a department for everybody else (backend/index.ts).
  directory: () => api.get<{ people: DirectoryPerson[] }>("/users/directory"),
  setDepartments: (userId: string, departments: string[]) =>
    api.post<{ user: AuthUser }>(`/users/${encodeURIComponent(userId)}/departments`, { departments }),
};

// A CANDIDATE'S CV, READ ON THE SERVER (backend/cvExtract.ts, REQUIREMENTS §49).
export interface CvProfile {
  name: string;
  sex: "" | "Male" | "Female";
  dateOfBirth: string;
  email: string;
  phone: string;
  qualification: string;
  qualificationDetail: string;
  experience: string;
  positionAppliedFor: string;
  lastDesignation: string;
  lastEmployer: string;
}

export interface CvReadResult {
  profile: CvProfile;
  fileKind: "pdf" | "docx" | "text";
  readBy: "assistant" | "rules";
  missing: string[];
  characters: number;
}

export const hrApi = {
  // The file goes as the raw body, not base64 in JSON: the server's JSON limit
  // is 100KB and a CV is often more.
  readCv: (file: File) =>
    request<CvReadResult>("/hr/cv/read", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
      body: file,
    }),
};

export interface DigestReminderInput {
  documentName: string;
  dueDate: string;
  urgency: string;
  assignedEmployees: { name: string; email?: string }[];
}

export const reminderDigestApi = {
  send: (reminders: DigestReminderInput[]) =>
    api.post<{ sent: boolean; reason?: string; recipientCount?: number }>("/reminders/send-digest", { reminders }),
};

// ESCALATION TO THE SUPER ADMIN AND THE WEEKLY DIGEST (REQUIREMENTS §75),
// worked out on the server from the records in PostgreSQL (backend/escalation.ts,
// on the rule engine/latenessCore.ts shares with the Performance Scorecard) and
// shown to the super admin in the bell, the day's notification and the
// Performance page. Every route is the super admin's alone (a 403 for anybody
// else). The shapes mirror backend/escalation.ts.

/** One record behind an escalation. */
export interface EscalationRecordRef {
  id: string;
  documentId: string;
  /** The format number, or the name while the number is to be confirmed. */
  what: string;
  dueDate: string;
  outcome: "late" | "never done";
  daysLate: number;
}

/** The escalation rule's numbers: this many late, or this many never done, in this many days. */
export interface EscalationRule {
  late: number;
  neverDone: number;
  windowDays: number;
}

export interface Escalation {
  id: string;
  raisedAt: string;
  updatedAt: string;
  /** A person by name, or a department (several accounts, or none answering for it). */
  kind: "person" | "department";
  /** The account's id, or "dept:HR". */
  subjectKey: string;
  subjectName: string;
  department: string;
  /** The ISO week it was raised in, "2026-W39". */
  period: string;
  late: number;
  neverDone: number;
  evidence: {
    window: { from: string; to: string };
    rule: EscalationRule;
    people?: string[];
    worst: { documentId: string; what: string; late: number; neverDone: number }[];
    records: EscalationRecordRef[];
  };
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

interface DigestCounts {
  due: number;
  onTime: number;
  late: number;
  neverDone: number;
  pending: number;
  score: number | null;
}

/** The super admin's digest of one week (backend/escalation.ts DigestBody). */
export interface WeeklyDigest {
  period: string;
  createdAt: string;
  body: {
    period: string;
    from: string;
    to: string;
    judgedOn: string;
    totals: DigestCounts;
    departments: (DigestCounts & { code: string; name: string; people: string[] })[];
    worstDocuments: (DigestCounts & { documentId: string; what: string; department: string })[];
    capa: { internalOpen: number; internalOverdue: number; oldestOverdue: { finding: string; targetDate: string | null } | null; externalOpen: number; externalAwaiting: number };
    escalations: { raised: number; open: number; list: { id: string; kind: string; subjectName: string; department: string; late: number; neverDone: number; acknowledged: boolean }[] };
  };
}

export interface EscalationList {
  escalations: Escalation[];
  rule: EscalationRule;
  /** The plant's date on the server. */
  today: string;
  /** Its ISO week, "2026-W39" — what "this week" means for an escalation's `period`. */
  week: string;
}

/** Said on window when an escalation is acknowledged, so every surface showing escalations asks again. */
export const ESCALATIONS_CHANGED = "dcrs:escalations-changed";

// THE LAST OPEN LIST THIS TAB WAS HANDED — in memory only, never stored — so
// something drawn without asking the server (Mitra's live facts for the super
// admin) can say what is escalated without a request of its own. The bell asks
// when it is first drawn, when it is opened and after an acknowledgement.
let lastOpen: EscalationList | null = null;
export const escalationsSeen = (): EscalationList | null => lastOpen;
/** Forgotten when the account in this tab is not the super admin's (the bell, on a change of account). */
export const forgetEscalationsSeen = (): void => {
  lastOpen = null;
};

export const escalationsApi = {
  /** The ones not yet acknowledged, newest first (the bell). */
  open: () =>
    api.get<EscalationList>("/escalations?open=1").then((list) => {
      lastOpen = Array.isArray(list?.escalations) ? list : lastOpen;
      return list;
    }),
  /** Every one raised or grown in the last 30 days, acknowledged or not (the Performance page, the day's notification). */
  recent: () => api.get<EscalationList>("/escalations"),
  acknowledge: (id: string) => api.post<{ escalation: Escalation }>(`/escalations/${encodeURIComponent(id)}/ack`),
  latestDigest: () => api.get<{ digest: WeeklyDigest | null }>("/digests/latest"),
  /** Runs a scheduled job now, whatever the clock says; `today` is for a check that needs a day of its own. */
  runJob: (job: "escalation" | "weekly-digest", today?: string) => api.post<{ job: string; today: string; outcome: string }>("/jobs/run", today ? { job, today } : { job }),
};

// THE ACTIVITY LOG'S ARCHIVE (REQUIREMENTS §62, §75) — the super admin's
// alone: the server answers 403 to anybody else (backend/archiveRoutes.ts).
// Nothing leaves the log by itself; the admin sees what is old enough, and
// only a deliberate move takes it to the archive, in the same database, where
// it stays searchable.

/** What archiving lines older than `years` years would move, and what the archive holds already. */
export interface ActivityArchivePreview {
  years: number;
  /** ACTIVITY_ARCHIVE_AFTER_YEARS on the server, or 3. */
  defaultYears: number;
  /** The first day KEPT (YYYY-MM-DD): every line before it would move. Sent back with the move. */
  cutoff: string;
  count: number;
  /** The days the oldest and newest of those lines fall on; null when there are none. */
  from: string | null;
  to: string | null;
  archived: { count: number; from: string | null; to: string | null };
}

/** A line of the log read with its archive: the log's own fields, and whether it has been archived. */
export interface ArchivedActivityLine {
  id: string;
  at: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  action: string;
  target: string;
  detail: string;
  department: string;
  archived: boolean;
}

export const activityArchiveApi = {
  /** Without `years`, for the server's own default (ACTIVITY_ARCHIVE_AFTER_YEARS). */
  preview: (years?: number) => api.get<ActivityArchivePreview>(`/activity/archive/preview${years ? `?years=${years}` : ""}`),
  /** Moves them. Refused with 409 (and a fresh `preview`) when today has moved on since `cutoff` was shown. */
  archive: (years: number, cutoff: string) => api.post<{ moved: number; cutoff: string; from: string | null; to: string | null }>("/activity/archive", { years, cutoff }),
  // The same query GET /activity and /activity/summary take (limit, before, q, person, from, to).
  lines: (query: string) => api.get<{ lines: ArchivedActivityLine[] }>(`/activity/with-archive${query ? `?${query}` : ""}`),
  summary: (query: string) => api.get<{ people: ActivityTally[] }>(`/activity/with-archive/summary${query ? `?${query}` : ""}`),
};

// THE DATABASE OVERVIEW (REQUIREMENTS §83) — the super admin's alone: the
// server answers 403 to anybody else (backend/overviewRoutes.ts). It reads the
// plain-English views of the shared database, read-only, through a role that
// can read nothing else. A 503 with the code "overview-not-set-up" means this
// server has not been given the database's views yet.

/** One column of an answer: its name in the database, its heading in plain words, and the view's own comment on it. */
export interface OverviewColumn {
  name: string;
  label: string;
  comment: string | null;
}

/** A view of the overview schema, as the catalog describes it. */
export interface OverviewView {
  name: string;
  label: string;
  comment: string | null;
  /** The column its from/to dates filter on; null when it has none. */
  dayColumn: string | null;
  columns: OverviewColumn[];
}

export interface OverviewStatus {
  setUp: true;
  database: string | null;
  role: string | null;
  readOnly: boolean;
  views: string[];
}

export interface OverviewQuestion {
  key: string;
  title: string;
  description: string;
  /** "week": asked of last week or this week; "month": this month so far; null: no dates. */
  span: "week" | "month" | null;
  view: string;
}

/** The days an answer covers, and the same in words ("Monday 21 September 2026 to Sunday 27 September 2026"). */
export interface OverviewRange {
  from: string;
  to: string;
  label: string;
  week?: "this" | "last";
}

/** A page of rows: of a question's answer, or of a view. */
export interface OverviewAnswer {
  title: string;
  description?: string;
  view: string;
  comment: string | null;
  /** A question's days. */
  range?: OverviewRange | null;
  /** A view's filter, as the rows were read with it. */
  filter?: { from: string | null; to: string | null; q: string | null };
  columns: OverviewColumn[];
  rows: (string | null)[][];
  offset: number;
  limit: number;
  more: boolean;
}

/** A file the server hands over, with the name it gives it. */
async function fetchFile(path: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) {
    let body: { error?: unknown; code?: unknown } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* not JSON */
    }
    throw new ApiError(typeof body.error === "string" ? body.error : `Request failed (${res.status})`, res.status, typeof body.code === "string" ? body.code : undefined);
  }
  const named = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "");
  return { blob: await res.blob(), filename: named ? named[1] : "overview.csv" };
}

export const overviewApi = {
  /** Set up or not, and which views there are. The server logs "Database overview opened". */
  status: () => api.get<OverviewStatus>("/overview/status"),
  views: () => api.get<{ views: OverviewView[] }>("/overview/views"),
  /** `query`: from, to (YYYY-MM-DD), q, limit (at most 500), offset. */
  rows: (view: string, query: string) => api.get<OverviewAnswer>(`/overview/views/${encodeURIComponent(view)}${query ? `?${query}` : ""}`),
  /** The same rows, up to 20,000, as a CSV file. The server logs "Database overview exported". */
  rowsCsv: (view: string, query: string) => fetchFile(`/overview/views/${encodeURIComponent(view)}.csv${query ? `?${query}` : ""}`),
  questions: () => api.get<{ questions: OverviewQuestion[] }>("/overview/questions"),
  /** `query`: week (this or last), limit, offset. */
  ask: (key: string, query: string) => api.get<OverviewAnswer>(`/overview/questions/${encodeURIComponent(key)}${query ? `?${query}` : ""}`),
  askCsv: (key: string, query: string) => fetchFile(`/overview/questions/${encodeURIComponent(key)}.csv${query ? `?${query}` : ""}`),
};
