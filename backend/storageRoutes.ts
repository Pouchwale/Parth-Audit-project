import express, { type Express, type Request, type RequestHandler, type Response } from "express";
import zlib from "node:zlib";
import type { PublicUser } from "./auth.ts";
import { deleteItem, readItem, storedItems, writeItem, type StoredItem, type StoredItems, type WriteResult } from "./db.ts";
import { ACCESS_KEY, AccessRefused, checkFormatChange, composeDefinitions, composeRecords, holdsHrMaster, languageOf, levelRefusal, viewFor, writesHrMaster, type AccessView } from "./accessLevels.ts";
import { accessAccountOf, catalogueLoader, databaseItemSource } from "./accessStore.ts";
import type { AccessCatalogue } from "./accessLevels.ts";

// THE APP'S DATA, IN POSTGRESQL (REQUIREMENTS §55). The browser keeps a
// working copy of each stored item (frontend/src/data/serverSync.ts): it
// loads them all here when a person signs in, asks every few seconds what
// has changed since, and writes each item back as it changes. A write says
// which version it was made from; one made from an out-of-date copy is
// refused with the current item, which the browser merges and writes again.
// What the whole plant shares is stored once for the company; a person's
// settings, assistant conversations and screen layout are stored for them.
//
// ONLY THESE ITEMS, AS JSON. The keys are the app's own (mirrored in
// serverSync.ts); anything else is refused, so nothing stored can make the
// load fail for everybody.
//
// EACH PERSON'S DOCUMENTS, AT THEIR LEVEL (REQUIREMENTS §96, backend/accessLevels.ts). Since 9-Oct-2026 what a person
// is handed and may write follows the super admin's access rules (the company item "access", read like "master" by
// everybody and written by the super admin alone): the records and deletions-log lines of a document at Read or more
// (an account nobody has described keeps its departments' — REQUIREMENTS §40 — or every one, as before), HR Master Data
// only with Human Resources; and a write of the records is checked RECORD BY RECORD against the version stored — start,
// fill, submit, verify, send back at Write, correct and delete at Edit — while the document definitions and the format
// edits are Edit's alone. A person's own act their level does not allow is refused with 403 and the level in plain
// words; the app's own housekeeping (a blank or prepared sheet, a start-up migration) is left as stored. Everyone
// else's lines stay as they are stored. The super admin passes everything.
//
// These routes were in backend/index.ts until 9-Oct-2026; they moved here unchanged so that a unit test can drive them
// over a stand-in for the database (backend/tests/storageRoutes.test.ts).

export const COMPANY_KEYS = new Set(["records", "documents", "master", "hrMasterData", "referenceEdits", "formatEdits", "deletions", "live-start", ACCESS_KEY]);
export const USER_SCOPED_KEYS = new Set(["settings", "assistant-conversations", "sidebar-open-modules", "sidebar-visible"]);
const STORAGE_MAX_BYTES = "25mb";
const MAX_VERSION = 2147483647;
/** Items whose lines each belong to a document, and so to whoever may see that document. */
const LINE_KEYS = new Set(["records", "deletions"]);
/** Items only Human Resources may hold. */
const HR_ONLY_KEYS = ["hrMasterData"];

const storageScope = (key: string, userId: string) => (USER_SCOPED_KEYS.has(key) ? userId : "company");

type AuthedRequest = Request & { user: PublicUser };
type LogActivity = (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;

/** Where the items are read and written: the server's database (backend/db.ts) by default, a test's stand-in otherwise. */
export interface StorageStore {
  storedItems(userId: string, sinceSeq: number): Promise<StoredItems>;
  readItem(scope: string, key: string): Promise<StoredItem | null>;
  writeItem(scope: string, key: string, value: string, baseVersion: number | null, by: string, compose?: (stored: string | null) => string): Promise<WriteResult>;
  deleteItem(scope: string, key: string): Promise<void>;
  itemSeq(scope: string, key: string): Promise<number | null>;
}

export const databaseStorageStore: StorageStore = {
  storedItems: (userId, since) => storedItems(userId, since),
  readItem,
  writeItem,
  deleteItem,
  itemSeq: databaseItemSource.itemSeq,
};

/** The super admin's write of the access rules, by whichever route it comes (backend/accessRulesRoutes.ts). */
export interface AccessRulesWriter {
  save(req: Request, by: PublicUser, rules: unknown, baseVersion: number | null): Promise<WriteResult>;
}

export interface StorageDeps {
  requireAuth: RequestHandler;
  logActivity: LogActivity;
  store?: StorageStore;
  /** Where a write of the "access" item goes; without it nobody writes it here. */
  accessRules?: AccessRulesWriter;
  /** The catalogue and the rules; by default read from `store`, once per change. */
  catalogue?: () => Promise<AccessCatalogue>;
}

/** A tab still working for one account while the browser has signed in as another: refused. */
function otherAccount(req: Request, user: PublicUser): boolean {
  const claimed = req.get("x-account");
  return claimed !== undefined && claimed !== user.id;
}

function visibleLines(value: string, visible: (line: unknown) => boolean): string {
  try {
    const lines = JSON.parse(value);
    return Array.isArray(lines) ? JSON.stringify(lines.filter(visible)) : value;
  } catch {
    return value;
  }
}

/** A master-data write with the working hours put back as they are stored (unchanged, when they already are). */
export function withStoredHours(posted: string, stored: string | null): string {
  try {
    const mine = JSON.parse(posted) as Record<string, unknown> | null;
    if (!mine || typeof mine !== "object" || Array.isArray(mine)) return posted;
    const theirs = stored ? (JSON.parse(stored) as Record<string, unknown> | null) : null;
    const kept = theirs && typeof theirs === "object" && !Array.isArray(theirs) ? theirs.workingHours : undefined;
    if (JSON.stringify(mine.workingHours ?? null) === JSON.stringify(kept ?? null)) return posted;
    if (kept === undefined) delete mine.workingHours;
    else mine.workingHours = kept;
    return JSON.stringify(mine);
  } catch {
    return posted;
  }
}

// The stored data runs to megabytes; sent compressed it is a fraction of that
// over the office network, and the browser unpacks it natively.
export function sendCompressedJson(req: Request, res: Response, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.status(status).set("Vary", "Accept-Encoding");
  if (text.length < 4096 || !/\bgzip\b/.test(req.get("accept-encoding") ?? "")) {
    res.type("application/json").send(text);
    return;
  }
  zlib.gzip(text, { level: 3 }, (err, packed) => {
    if (err) {
      res.type("application/json").send(text);
      return;
    }
    res.set("Content-Encoding", "gzip").type("application/json").send(packed);
  });
}

export function registerStorageRoutes(app: Express, deps: StorageDeps): void {
  const { requireAuth, logActivity } = deps;
  const store = deps.store ?? databaseStorageStore;
  const catalogue = deps.catalogue ?? catalogueLoader(store);
  const viewOf = async (user: PublicUser): Promise<AccessView> => viewFor(await catalogue(), accessAccountOf(user));

  app.get("/api/storage", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const user = (req as AuthedRequest).user;
    if (otherAccount(req, user)) {
      res.status(401).json({ error: "This browser is signed in as another account now." });
      return;
    }
    const since = Number(req.query.since ?? 0);
    const result = await store.storedItems(user.id, Number.isSafeInteger(since) && since > 0 ? since : 0);
    const view = await viewOf(user);
    const denied = holdsHrMaster(view) ? [] : HR_ONLY_KEYS;
    if (!view.readsAll || denied.length) {
      result.items = result.items
        .filter((item) => !denied.includes(item.key))
        .map((item) => (LINE_KEYS.has(item.key) && item.scope === "company" && !view.readsAll ? { ...item, value: visibleLines(item.value, view.holds) } : item));
      for (const key of denied) delete result.versions[key];
    }
    sendCompressedJson(req, res, 200, { ...result, denied, scope: view.scope });
  });

  app.put(
    "/api/storage/:key",
    requireAuth,
    express.text({ type: () => true, limit: STORAGE_MAX_BYTES }),
    async (req: Request, res: Response): Promise<void> => {
      const key = String(req.params.key ?? "");
      if (!(COMPANY_KEYS.has(key) || USER_SCOPED_KEYS.has(key)) || typeof req.body !== "string") {
        res.status(400).json({ error: "Bad storage key or value." });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(req.body);
      } catch {
        res.status(400).json({ error: "A stored value must be JSON." });
        return;
      }
      const base = req.get("x-base-version");
      const baseVersion = base === undefined || base === "*" ? null : Number(base);
      if (baseVersion !== null && (!Number.isSafeInteger(baseVersion) || baseVersion < 0 || baseVersion > MAX_VERSION)) {
        res.status(400).json({ error: "Bad base version." });
        return;
      }
      const user = (req as AuthedRequest).user;
      if (otherAccount(req, user)) {
        res.status(401).json({ error: "This browser is signed in as another account now." });
        return;
      }
      // WHO MAY DO WHAT IS THE SUPER ADMIN'S TO SAY (REQUIREMENTS §96): written by the super admin alone, and only
      // through the rules' own writer, which checks them, logs every change and tells each person concerned.
      if (key === ACCESS_KEY) {
        if (user.role !== "admin" || !deps.accessRules) {
          res.status(403).json({ error: "Only the super admin changes who may do what.", code: "super-admin-only" });
          return;
        }
        const result = await deps.accessRules.save(req, user, parsed, baseVersion);
        if (result.ok) res.json({ version: result.version, seq: result.seq });
        else sendCompressedJson(req, res, 409, { current: result.current, scope: "*" });
        return;
      }
      const view = await viewOf(user);
      if (key === "hrMasterData") {
        if (!holdsHrMaster(view)) {
          res.status(403).json({ error: "This account's departments do not hold that." });
          return;
        }
        if (!writesHrMaster(view)) {
          res.status(403).json({ error: levelRefusal("HR Master Data", "read", "write", "fill", languageOf(req.get("x-language"))), code: "access-level", level: "read", needed: "write", action: "fill" });
          return;
        }
      }
      const lineKey = LINE_KEYS.has(key);
      const scoped = lineKey && !view.readsAll;
      const scopeNow = view.scope;
      const claimedScope = req.get("x-scope");
      if (lineKey && claimedScope !== undefined && claimedScope !== scopeNow) {
        const stored = await store.readItem(storageScope(key, user.id), key);
        const current = stored && scoped ? { ...stored, value: visibleLines(stored.value, view.holds) } : stored;
        sendCompressedJson(req, res, 409, { current, scope: scopeNow });
        return;
      }
      const posted: string = req.body;
      if (lineKey && !view.editsAll && !Array.isArray(parsed)) {
        res.status(400).json({ error: "A stored value must be JSON." });
        return;
      }
      let kept: string[] = [];
      let compose: ((stored: string | null) => string) | undefined;
      if (key === "records" && !view.editsAll) {
        // Record by record, against the version stored: the person's own lines as their level allows, everyone else's as stored.
        compose = (stored) => {
          const out = composeRecords(view, stored, parsed as unknown[], user.name);
          kept = out.kept;
          return out.value;
        };
      } else if (key === "deletions" && scoped) {
        // A person's deletions-log lines replace their own; everyone else's stay as stored.
        compose = (stored) => {
          const mine = (parsed as unknown[]).filter(view.holds);
          let others: unknown[] = [];
          try {
            const all = stored ? JSON.parse(stored) : [];
            if (Array.isArray(all)) others = all.filter((line) => !view.holds(line));
          } catch {
            /* nothing readable stored */
          }
          return JSON.stringify([...mine, ...others]);
        };
      } else if (key === "documents" && !view.editsAll) {
        // The issued definitions reach the server from anybody's browser; a stored one is changed only with Edit on it.
        compose = (stored) => {
          const out = composeDefinitions(view, stored, posted);
          kept = out.kept;
          return out.value;
        };
      } else if (key === "formatEdits" && !view.editsAll) {
        // A format's printed words and layout are Edit's alone.
        compose = (stored) => {
          checkFormatChange(view, key, stored, posted);
          return posted;
        };
      } else if (key === "master" && user.role !== "admin") {
        // THE PLANT'S HOURS ARE THE SUPER ADMIN'S TO CHANGE (REQUIREMENTS §84): the
        // Master Data page offers them to nobody else, and a write of the master data
        // by anybody else keeps the hours exactly as they are stored — the screen is
        // never the lock (§66). Everything else in that write is theirs as before.
        compose = (stored) => withStoredHours(posted, stored);
      }
      let result: WriteResult;
      try {
        result = await store.writeItem(storageScope(key, user.id), key, posted, baseVersion, user.email, compose);
      } catch (err) {
        if (err instanceof AccessRefused) {
          logActivity(req, user, "Change refused", view.catalogue.title(err.body.documentId).slice(0, 240), err.body.error.slice(0, 600));
          res.status(403).json(err.body);
          return;
        }
        throw err;
      }
      if (result.ok) {
        res.json({ version: result.version, seq: result.seq, ...(kept.length ? { kept } : {}) });
        return;
      }
      const current = result.current && scoped ? { ...result.current, value: visibleLines(result.current.value, view.holds) } : result.current;
      sendCompressedJson(req, res, 409, { current, scope: scopeNow });
    }
  );

  app.delete("/api/storage/:key", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const key = String(req.params.key ?? "");
    const user = (req as AuthedRequest).user;
    if (otherAccount(req, user)) {
      res.status(401).json({ error: "This browser is signed in as another account now." });
      return;
    }
    if (!(COMPANY_KEYS.has(key) || USER_SCOPED_KEYS.has(key))) {
      res.status(400).json({ error: "Bad storage key." });
      return;
    }
    // The company's items are removed only by the administrator; a person's own, by them.
    if (COMPANY_KEYS.has(key) && user.role !== "admin") {
      res.status(403).json({ error: "Only the administrator may remove the company's data." });
      return;
    }
    await store.deleteItem(storageScope(key, user.id), key);
    if (key === ACCESS_KEY) logActivity(req, user, "Access changed", "Everybody", "The access rules were cleared: every person has the owner's table again (REQUIREMENTS §96)");
    res.status(204).end();
  });
}
