import type { AuthUser, ManagedUser } from "../types/auth";

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
