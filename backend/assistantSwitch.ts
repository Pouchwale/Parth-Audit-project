import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import type { PublicUser } from "./auth.ts";
import { readItem, writeItem, type StoredItem, type WriteResult } from "./db.ts";

// MITRA, SWITCHED OFF FOR THE STAFF BY THE SUPER ADMIN (the owner, 2-Nov-2026: "give an option to the super admin
// only, that he can disable the AI option for all the other users").
//
// One switch for the whole plant, kept as the company item "assistantAccess" in PostgreSQL beside the access rules:
//
//   { version: 1, staff: true | false, by: "<who set it>", at: "<when>" }
//
//   GET /api/assistant/access   anybody signed in: { staff, mine, by, at } — whether the staff have Mitra, and whether
//                               the asker does (the super admin always)
//   PUT /api/assistant/access   the super admin alone: { staff: boolean } -> the same answer; a line in the activity log
//
// The switch is told with who is signed in (`features.mitra`, backend/index.ts featuresFor), so the app draws no Ask
// Mitra page, no floating Mitra and no Mitra buttons for a person it is off for — and THE SCREEN IS NEVER THE LOCK:
// every route that asks the model, reads a picture or a document for Mitra, transcribes a recording or speaks is
// refused for them here (requireAssistant), 403 with the code "assistant-off". The super admin's own Mitra is never
// touched. Nothing is stored about the model; the key stays where it was (backend/features.ts).

export const ASSISTANT_SWITCH_KEY = "assistantAccess";
export const ASSISTANT_OFF_CODE = "assistant-off";
export const ASSISTANT_OFF_MESSAGE = "Mitra has been switched off for the staff by the super admin.";

export interface AssistantSwitch {
  /** Whether everybody but the super admin has Mitra. On until the super admin says otherwise. */
  staff: boolean;
  by: string;
  at: string;
}

export interface AssistantSwitchStore {
  readItem(scope: string, key: string): Promise<StoredItem | null>;
  writeItem(scope: string, key: string, value: string, baseVersion: number | null, by: string): Promise<WriteResult>;
}

const databaseStore: AssistantSwitchStore = { readItem, writeItem: (scope, key, value, baseVersion, by) => writeItem(scope, key, value, baseVersion, by) };

const DEFAULT: AssistantSwitch = { staff: true, by: "", at: "" };

/** The switch as stored; on, when nothing has been stored or what was stored cannot be read. */
export async function readAssistantSwitch(store: AssistantSwitchStore = databaseStore): Promise<AssistantSwitch> {
  try {
    const item = await store.readItem("company", ASSISTANT_SWITCH_KEY);
    if (!item) return DEFAULT;
    const parsed = JSON.parse(item.value) as Partial<AssistantSwitch> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.staff !== "boolean") return DEFAULT;
    return { staff: parsed.staff, by: typeof parsed.by === "string" ? parsed.by : "", at: typeof parsed.at === "string" ? parsed.at : "" };
  } catch {
    return DEFAULT;
  }
}

/** Whether this person has Mitra: the super admin always, anybody else while the switch is on. */
export async function assistantAllowedFor(user: Pick<PublicUser, "role">, store: AssistantSwitchStore = databaseStore): Promise<boolean> {
  if (user.role === "admin") return true;
  return (await readAssistantSwitch(store)).staff;
}

type LogActivity = (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string) => void;
type AuthedRequest = Request & { user: PublicUser };

export interface AssistantSwitchDeps {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  logActivity: LogActivity;
  store?: AssistantSwitchStore;
  clock?: () => Date;
}

export interface AssistantSwitchService {
  /** After requireAuth: lets the super admin through always, the staff while the switch is on; 403 `assistant-off` otherwise. */
  requireAssistant: RequestHandler;
}

export function registerAssistantSwitchRoutes(app: Express, deps: AssistantSwitchDeps): AssistantSwitchService {
  const store = deps.store ?? databaseStore;
  const clock = deps.clock ?? (() => new Date());

  const answer = async (user: PublicUser) => {
    const state = await readAssistantSwitch(store);
    return { staff: state.staff, mine: user.role === "admin" || state.staff, by: state.by, at: state.at };
  };

  app.get("/api/assistant/access", deps.requireAuth, async (req: Request, res: Response): Promise<void> => {
    res.json(await answer((req as AuthedRequest).user));
  });

  app.put("/api/assistant/access", deps.requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const user = (req as AuthedRequest).user;
    const staff = (req.body ?? {}).staff;
    if (typeof staff !== "boolean") {
      res.status(400).json({ error: "Say whether the staff have Mitra: { staff: true } or { staff: false }." });
      return;
    }
    const before = await readAssistantSwitch(store);
    if (before.staff !== staff) {
      const next: AssistantSwitch = { staff, by: user.email, at: clock().toISOString() };
      await store.writeItem("company", ASSISTANT_SWITCH_KEY, JSON.stringify({ version: 1, ...next }), null, user.email);
      deps.logActivity(req, user, staff ? "Mitra switched on for the staff" : "Mitra switched off for the staff", "Mitra", staff ? "Everybody has Mitra again — the Ask Mitra page, the floating Mitra and its buttons." : "Nobody but the super admin has Mitra: no Ask Mitra page, no floating Mitra, no Mitra buttons, and the server refuses Mitra's routes for them.");
    }
    res.json(await answer(user));
  });

  const requireAssistant: RequestHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as Partial<AuthedRequest>).user;
    if (!user) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }
    if (await assistantAllowedFor(user, store)) {
      next();
      return;
    }
    res.status(403).json({ error: ASSISTANT_OFF_MESSAGE, code: ASSISTANT_OFF_CODE });
  };

  return { requireAssistant };
}
