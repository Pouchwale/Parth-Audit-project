// THE ARCHIVE OF THE BLANK SHEETS FROM BEFORE THE SYSTEM WENT LIVE (REQUIREMENTS §115).
//
// The owner, 13-Oct-2026, on the banner "Found 3457 blank records generated for
// dates before 08-Sep-2026 ... Safe to remove": "make sure do fix it anyhow
// without any loss of any records or any modules". So NOTHING IS DELETED. The
// sheets the browser's rule finds (frontend/src/engine/preLaunchNoise.ts — a
// Live record dated before the go-live day, an untouched Due/Scheduled shell or
// an untouched preparation) are MOVED by the server itself, once when it
// starts, whoever signs in or nobody, into a table of DCRS's own:
//
//   records_archive  id, document_id, due_date, the whole record as jsonb,
//                    archived_at, why; restored_at and restored_by once the
//                    super admin brought it back.
//
// TWO STEPS, IN AN ORDER A CRASH CANNOT HURT. (1) Each sheet is copied into the
// archive — idempotent by id, so a second run copies nothing twice. (2) Then
// they are taken out of the records item, with the version check every write
// takes and a retry when a browser saved in between — the same path a removal
// in a browser takes (recordRepository.removeIds → PUT /api/storage/records),
// so every browser's three-way merge drops them too. A server that dies between
// the two steps loses nothing: the archive holds the copy, and the next start
// finishes, because step 2 takes out every id the archive KEEPS (restored_at
// null), found again or not.
//
// NEVER MOVED: a record a person opened, edited, submitted or verified (the
// rule itself); and a sheet the super admin brought back (restored_at set) —
// it is theirs to keep, and the rule is not run on it again.
//
// A BROWSER HOLDING THE OLD COPY cannot bring them back: PUT /api/storage/records
// keeps out every id the archive keeps (storageRoutes.ts, archivedRecordIds),
// and the browser's own merge without a common copy drops them as well
// (frontend/src/data/serverSync.ts mergeRecords).
//
// THE SUPER ADMIN, under Master Data, sees "Blank sheets from before go-live,
// kept in the archive: N" and "Bring them back", which restores exactly those —
// never a duplicate of one the records already hold — and marks them restored.
// Each move and each restore is a line of the activity log.
import type { Express, Request, RequestHandler, Response } from "express";
import type { PublicUser } from "./auth.ts";
import { database, insertActivity, readItem, registerSchema, writeItem, type StoredItem, type WriteResult } from "./db.ts";
import { isPreLaunchNoise } from "../frontend/src/engine/preLaunchNoise.ts";

registerSchema(`
  CREATE TABLE IF NOT EXISTS records_archive (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    record JSONB NOT NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    why TEXT NOT NULL DEFAULT '',
    restored_at TIMESTAMPTZ,
    restored_by TEXT
  );
  CREATE INDEX IF NOT EXISTS records_archive_kept_idx ON records_archive (archived_at) WHERE restored_at IS NULL;
`);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const idOf = (r: unknown): string | null => (isObj(r) && typeof r.id === "string" && r.id ? r.id : null);

/** One sheet as the archive holds it. */
export interface ArchiveRow {
  id: string;
  documentId: string;
  dueDate: string;
  record: unknown;
  why: string;
}

/** Where the records item and the archive live: the database, or a test's stand-in. */
export interface ArchiveStore {
  readItem(scope: string, key: string): Promise<StoredItem | null>;
  writeItem(scope: string, key: string, value: string, baseVersion: number, by: string): Promise<WriteResult>;
  /** Copies rows into the archive; one already there (by id) is left exactly as it is. */
  archive(rows: ArchiveRow[]): Promise<void>;
  /** The rows the archive keeps (not restored), oldest first. */
  kept(): Promise<ArchiveRow[]>;
  /** The ids the archive keeps (not restored). */
  keptIds(): Promise<Set<string>>;
  /** The ids the super admin brought back once: never moved by the server again. */
  restoredIds(): Promise<Set<string>>;
  /** Marks rows as brought back, by whom. */
  markRestored(ids: string[], by: string): Promise<void>;
}

export const SYSTEM_BY = "system";
const MAX_ATTEMPTS = 5;

/** The go-live day as the "live-start" item has it, or null while none is stored. */
function liveStartOf(item: StoredItem | null): string | null {
  if (!item) return null;
  try {
    const parsed: unknown = JSON.parse(item.value);
    const date = isObj(parsed) ? parsed.date : null;
    return typeof date === "string" && date ? date : null;
  } catch {
    return null;
  }
}

function recordsOf(item: StoredItem | null): unknown[] {
  if (!item) return [];
  try {
    const parsed: unknown = JSON.parse(item.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const dateWords = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(m) - 1];
  return month && d && y ? `${d}-${month}-${y}` : iso;
};

export interface ArchiveOutcome {
  /** Sheets copied into the archive this run (new ones). */
  copied: number;
  /** Sheets taken out of the records item this run (the new ones, and any a crash left behind). */
  moved: number;
  /** Sheets the archive keeps now, all told. */
  kept: number;
  /** The records item could not be written in five tries (busy); the archive holds the copies, the next run finishes. */
  busy?: boolean;
}

// ---------------------------------------------------------------------------
// the ids the archive keeps, held in memory for the storage route's guard

let keepOut = new Set<string>();

/** The ids the archive keeps, as last read: PUT /api/storage/records keeps them out (backend/storageRoutes.ts). */
export function archivedRecordIds(): Set<string> {
  return keepOut;
}

async function refreshKeepOut(store: ArchiveStore): Promise<void> {
  try {
    keepOut = await store.keptIds();
  } catch (err) {
    console.error("[records archive] the archive's ids could not be read:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// the move

/**
 * MOVES THE BLANK SHEETS FROM BEFORE GO-LIVE INTO THE ARCHIVE (§115): copied first, then taken out of the records
 * item with the version check and a retry. Idempotent: run again, it moves only what is new. Never a record a
 * person touched, never one the super admin brought back.
 */
export async function archivePreLaunchBlanks(store: ArchiveStore, by = SYSTEM_BY): Promise<ArchiveOutcome> {
  let copied = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const [item, liveItem] = await Promise.all([store.readItem("company", "records"), store.readItem("company", "live-start")]);
    const liveStart = liveStartOf(liveItem);
    const records = recordsOf(item);
    // Step 1: the copies. Nothing a person brought back is a candidate again.
    if (liveStart && records.length > 0) {
      const restored = await store.restoredIds();
      const rows: ArchiveRow[] = [];
      for (const r of records) {
        const id = idOf(r);
        if (!id || restored.has(id) || !isObj(r) || !isPreLaunchNoise(r, liveStart)) continue;
        rows.push({
          id,
          documentId: typeof r.documentId === "string" ? r.documentId : "",
          dueDate: typeof r.dueDate === "string" ? r.dueDate : "",
          record: r,
          why: `A blank sheet made for ${typeof r.dueDate === "string" ? dateWords(r.dueDate) : "a day"} before the system went live on ${dateWords(liveStart)}, that nobody opened.`,
        });
      }
      if (rows.length > 0) {
        const before = await store.keptIds();
        await store.archive(rows);
        copied += rows.filter((row) => !before.has(row.id)).length;
      }
    }
    // Step 2: out of the records — every id the archive keeps, this run's and any a crash left behind.
    const keptIds = await store.keptIds();
    keepOut = keptIds;
    if (!item || keptIds.size === 0) return { copied, moved: 0, kept: keptIds.size };
    const next = records.filter((r) => {
      const id = idOf(r);
      return !(id && keptIds.has(id));
    });
    const moved = records.length - next.length;
    if (moved === 0) return { copied, moved: 0, kept: keptIds.size };
    const written = await store.writeItem("company", "records", JSON.stringify(next), item.version, by);
    if (written.ok) return { copied, moved, kept: keptIds.size };
    // A browser saved in between: read again, worked out again.
  }
  const kept = await store.keptIds();
  keepOut = kept;
  return { copied, moved: 0, kept: kept.size, busy: true };
}

export interface RestoreOutcome {
  /** Sheets put back into the records item. */
  restored: number;
  /** Sheets the records already held (a browser's old copy put them back meanwhile): marked restored, never duplicated. */
  alreadyThere: number;
  /** The records item could not be written in five tries. */
  busy?: boolean;
}

/**
 * BRINGS BACK EVERY SHEET THE ARCHIVE KEEPS (§115), exactly as it was and never twice: one the records already hold
 * is left as it is. Marked restored only once the records are written, so a failure leaves them in the archive.
 */
export async function restoreArchivedBlanks(store: ArchiveStore, by: string): Promise<RestoreOutcome> {
  const rows = await store.kept();
  if (rows.length === 0) return { restored: 0, alreadyThere: 0 };
  const ids = rows.map((r) => r.id);
  // The guard lets them through from this moment: a browser pulling them back must not have them stripped again.
  keepOut = new Set([...keepOut].filter((id) => !ids.includes(id)));
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const item = await store.readItem("company", "records");
    const records = recordsOf(item);
    const have = new Set(records.map(idOf).filter((id): id is string => !!id));
    const add = rows.filter((r) => !have.has(r.id)).map((r) => r.record);
    const written = add.length === 0 ? ({ ok: true } as const) : await store.writeItem("company", "records", JSON.stringify([...records, ...add]), item?.version ?? 0, by);
    if (written.ok) {
      await store.markRestored(ids, by);
      await refreshKeepOut(store);
      return { restored: add.length, alreadyThere: rows.length - add.length };
    }
  }
  await refreshKeepOut(store);
  return { restored: 0, alreadyThere: 0, busy: true };
}

// ---------------------------------------------------------------------------
// the database

export const databaseArchiveStore: ArchiveStore = {
  readItem,
  writeItem: (scope, key, value, baseVersion, by) => writeItem(scope, key, value, baseVersion, by),
  async archive(rows) {
    if (rows.length === 0) return;
    await database().query(
      `INSERT INTO records_archive (id, document_id, due_date, record, why)
       SELECT id, document_id, due_date, record::jsonb, why
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS row (id, document_id, due_date, record, why)
       ON CONFLICT (id) DO NOTHING`,
      [rows.map((r) => r.id), rows.map((r) => r.documentId), rows.map((r) => r.dueDate), rows.map((r) => JSON.stringify(r.record)), rows.map((r) => r.why)]
    );
  },
  async kept() {
    const { rows } = await database().query<{ id: string; document_id: string; due_date: string; record: unknown; why: string }>(
      "SELECT id, document_id, due_date, record, why FROM records_archive WHERE restored_at IS NULL ORDER BY archived_at, id"
    );
    return rows.map((r) => ({ id: r.id, documentId: r.document_id, dueDate: r.due_date, record: r.record, why: r.why }));
  },
  async keptIds() {
    const { rows } = await database().query<{ id: string }>("SELECT id FROM records_archive WHERE restored_at IS NULL");
    return new Set(rows.map((r) => r.id));
  },
  async restoredIds() {
    const { rows } = await database().query<{ id: string }>("SELECT id FROM records_archive WHERE restored_at IS NOT NULL");
    return new Set(rows.map((r) => r.id));
  },
  async markRestored(ids, by) {
    if (ids.length === 0) return;
    await database().query("UPDATE records_archive SET restored_at = now(), restored_by = $2 WHERE id = ANY($1::text[]) AND restored_at IS NULL", [ids, by]);
  },
};

/** The server's start-up step: the move, said in one line and in the activity log; never stops the start. */
export async function archiveAtStartUp(store: ArchiveStore = databaseArchiveStore): Promise<ArchiveOutcome | null> {
  try {
    const out = await archivePreLaunchBlanks(store);
    if (out.moved > 0 || out.copied > 0) {
      const words = `${out.moved} blank sheet${out.moved === 1 ? "" : "s"} from before the system went live moved to the archive (${out.kept} kept there now); nothing deleted.`;
      console.log(`[records archive] ${words}`);
      await insertActivity([{ userId: null, userName: "System", userEmail: "", action: "Blank sheets archived", target: "Records from before go-live", detail: words }]).catch(() => undefined);
    } else if (out.busy) console.warn("[records archive] the records kept changing; the archive holds the copies and the next start finishes the move.");
    return out;
  } catch (err) {
    console.error("[records archive] the move could not be made:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// the routes: the super admin's count, the restore, and the move run by hand

type AuthedRequest = Request & { user: PublicUser };

export interface ArchiveRouteDeps {
  requireAdmin: RequestHandler;
  logActivity: (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string) => void;
  store?: ArchiveStore;
}

export function registerArchiveRoutes(app: Express, deps: ArchiveRouteDeps): void {
  const store = deps.store ?? databaseArchiveStore;

  app.get("/api/archive/blanks", deps.requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    const [ids, liveItem] = await Promise.all([store.keptIds(), store.readItem("company", "live-start")]);
    res.json({ count: ids.size, liveStartDate: liveStartOf(liveItem) });
  });

  app.post("/api/archive/blanks/restore", deps.requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const user = (req as AuthedRequest).user;
    const out = await restoreArchivedBlanks(store, user.email);
    if (out.busy) {
      res.status(409).json({ error: "The records kept changing while the sheets were being brought back. Try again in a moment.", code: "busy" });
      return;
    }
    if (out.restored > 0 || out.alreadyThere > 0) {
      deps.logActivity(
        req,
        user,
        "Blank sheets brought back",
        "Records from before go-live",
        `${out.restored} blank sheet${out.restored === 1 ? "" : "s"} brought back from the archive${out.alreadyThere ? ` (${out.alreadyThere} already in the records)` : ""}.`
      );
    }
    res.json(out);
  });

  app.post("/api/archive/blanks/run", deps.requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const user = (req as AuthedRequest).user;
    const out = await archivePreLaunchBlanks(store, user.email);
    if (out.moved > 0 || out.copied > 0) {
      deps.logActivity(req, user, "Blank sheets archived", "Records from before go-live", `${out.moved} blank sheet${out.moved === 1 ? "" : "s"} from before the system went live moved to the archive (${out.kept} kept there now); nothing deleted.`);
    }
    res.status(out.busy ? 409 : 200).json(out);
  });
}
