import type { AuthUser, ManagedUser } from "../types/auth";

// Thin fetch wrapper for the auth API (backend/index.ts). Requests are
// same-origin in both dev (proxied, see frontend/scripts/dev-server.ts) and
// production (backend/index.ts serves the built frontend itself), so no
// base URL configuration is needed.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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
    throw new ApiError(message, res.status);
  }

  return body as T;
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

// WHO MAY SEE WHICH DEPARTMENT'S DOCUMENTS. Only the administrator account
// (the first one created) can read this list or change an assignment — the
// restriction has to be set by somebody else, or it would be a preference
// rather than a rule (REQUIREMENTS §40, backend/index.ts requireAdmin).
export const usersApi = {
  list: () => api.get<{ users: ManagedUser[] }>("/users"),
  setDepartments: (userId: string, departments: string[]) =>
    api.post<{ user: AuthUser }>(`/users/${encodeURIComponent(userId)}/departments`, { departments }),
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
