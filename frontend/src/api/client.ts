import type { AuthUser, ManagedUser } from "../types/auth";
import type { ActivityTally } from "../engine/activityWork";

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
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (code) this.code = code;
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
    throw new ApiError(message, res.status, code);
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
