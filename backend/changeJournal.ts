// ONE RECORD PER SAVE, AND A COLLEAGUE'S SAVE BRINGS ONLY THAT RECORD (REQUIREMENTS §108, its second half).
//
// The records stay stored as they always were: one item, "records", in app_storage, read whole by /api/v1, the engine
// host, the escalation job and the Database overview's views (backend/db.ts). What changes is what travels:
//
//   * A SAVE sends the records that changed and the ids removed, with the version its copy was made from
//     (PATCH /api/storage/records, backend/storageRoutes.ts). The server puts them into the stored item, record by
//     record, with the same checks of each person's level as a whole write (backend/accessLevels.ts).
//   * THE CHANGE JOURNAL (the table app_storage_changes) says which records each write changed: one row for the write
//     itself and one per record changed or removed, in the same transaction as the write. A write of the whole item
//     (the phones' engine, a CAPA closed through /api/v1, a browser's first upload) is compared with what was stored,
//     record by record, to make its rows.
//   * A BROWSER ASKING WHAT CHANGED says the version of the records it holds and the write that made it; when the
//     journal holds every write since, it is handed only the records changed since and the ids removed.
//
// This file is the part both sides of that agree on, with no database in it: the records item read as lines, what
// changed between two of them, and whether the journal covers a span. backend/db.ts keeps the rows; the unit tests'
// stand-in (backend/tests/storageRoutes.test.ts) keeps them in memory, on the same rules.

type Obj = Record<string, unknown>;

/** A line's own id (a record's), as text; null for a line that has none. */
export function lineId(line: unknown): string | null {
  if (!line || typeof line !== "object" || Array.isArray(line)) return null;
  const id = (line as Obj).id;
  return typeof id === "string" ? id || null : typeof id === "number" ? String(id) : null;
}

/**
 * AN ITEM THAT IS A LIST OF LINES, each a record with an id of its own: parsed once, and each line's text worked out
 * only when first asked for and remembered against the line itself, so a line that is the same object in the next
 * version is never written out again. The whole item's text is the lines' texts joined, exactly what JSON.stringify of
 * the list gives: the browser's own copy is written the same way (data/repositories/recordRepository.ts).
 *
 * Never changed in place: `with` makes the next version, sharing every line it did not touch.
 */
export class Lines {
  readonly items: readonly unknown[];
  /** Where each id's line is (its first, should an id ever be there twice). */
  readonly index: ReadonlyMap<string, number>;
  /** Every line has an id, and no id is there twice: only then can a change be said record by record. */
  readonly byId: boolean;
  private readonly memo: WeakMap<object, string>;

  constructor(items: readonly unknown[], memo: WeakMap<object, string> = new WeakMap()) {
    this.items = items;
    this.memo = memo;
    const index = new Map<string, number>();
    let byId = true;
    for (let i = 0; i < items.length; i++) {
      const id = lineId(items[i]);
      if (id === null || index.has(id)) {
        byId = false;
        if (id === null) continue;
      }
      if (!index.has(id)) index.set(id, i);
    }
    this.index = index;
    this.byId = byId;
  }

  /** The item's lines, or null when it is not a list. */
  static parse(value: string | null | undefined): Lines | null {
    if (typeof value !== "string") return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
    return Array.isArray(parsed) ? new Lines(parsed) : null;
  }

  static empty(): Lines {
    return new Lines([]);
  }

  get length(): number {
    return this.items.length;
  }

  /** The text of the line at `i`, as JSON.stringify writes it. */
  textAt(i: number): string {
    const line = this.items[i];
    if (!line || typeof line !== "object") return JSON.stringify(line) ?? "null";
    let text = this.memo.get(line);
    if (text === undefined) {
      text = JSON.stringify(line);
      this.memo.set(line, text);
    }
    return text;
  }

  /** The whole item, as stored. */
  text(): string {
    let out = "[";
    for (let i = 0; i < this.items.length; i++) out += (i === 0 ? "" : ",") + this.textAt(i);
    return out + "]";
  }

  get(id: string): unknown {
    const i = this.index.get(id);
    return i === undefined ? undefined : this.items[i];
  }

  /** The text of the record with this id, or null when there is none. */
  textOf(id: string): string | null {
    const i = this.index.get(id);
    return i === undefined ? null : this.textAt(i);
  }

  /**
   * The next version: each line of `put` in the place of the one with its id (a new id at the end, in the order given),
   * and the ids of `out` taken away. Every other line is the same object, its text remembered.
   */
  with(put: readonly unknown[], out: Iterable<string> = []): Lines {
    const gone = new Set(out);
    const items = this.items.slice();
    const added: unknown[] = [];
    const placed = new Map<string, number>();
    for (const line of put) {
      const id = lineId(line);
      if (id === null) continue;
      gone.delete(id);
      const at = this.index.get(id);
      const again = placed.get(id);
      if (at !== undefined) items[at] = line;
      else if (again !== undefined) added[again] = line;
      else {
        placed.set(id, added.length);
        added.push(line);
      }
    }
    const all = added.length ? items.concat(added) : items;
    if (!gone.size) return new Lines(all, this.memo);
    return new Lines(
      all.filter((line) => {
        const id = lineId(line);
        return id === null || !gone.has(id);
      }),
      this.memo
    );
  }

  /** A new list of lines that remembers the texts this one has worked out (a line kept as the same object keeps its text). */
  derive(items: readonly unknown[]): Lines {
    return new Lines(items, this.memo);
  }
}

/** What one write changed, record by record. */
export interface LineChanges {
  changed: string[];
  removed: string[];
}

/**
 * WHAT CHANGED FROM `before` TO `after`, record by record: a record new or different is changed, one gone is removed.
 * `only` limits it to those ids (a save that names what it changed). Null when it cannot be said by record: a line
 * without an id, or one id twice, on either side. The write then leaves a gap in the journal, and every browser is
 * handed the whole item until it is in step again.
 */
export function changesBetween(before: Lines | null, after: Lines, only?: Iterable<string>): LineChanges | null {
  if (!after.byId || (before && !before.byId)) return null;
  const was = before ?? Lines.empty();
  const changed: string[] = [];
  const removed: string[] = [];
  if (only) {
    for (const id of new Set(only)) {
      const now = after.textOf(id);
      const then = was.textOf(id);
      if (now === null) {
        if (then !== null) removed.push(id);
      } else if (now !== then) changed.push(id);
    }
    return { changed, removed };
  }
  for (let i = 0; i < after.length; i++) {
    const id = lineId(after.items[i])!;
    const j = was.index.get(id);
    if (j === undefined) changed.push(id);
    else if (after.items[i] !== was.items[j] && after.textAt(i) !== was.textAt(j)) changed.push(id);
  }
  for (const id of was.index.keys()) if (!after.index.has(id)) removed.push(id);
  return { changed, removed };
}

/** One row of the change journal: a write (recordId null), or one record it changed or removed. */
export interface JournalRow {
  seq: number;
  version: number;
  recordId: string | null;
  removed: boolean;
}

/** How far back a browser may be and still be handed the changes rather than the whole item. */
export const MAX_JOURNAL_ROWS = 20_000;

/**
 * THE RECORDS CHANGED SINCE A COPY WAS IN STEP, when the journal holds every write since; null when it does not.
 *
 * `from` is the copy's version and the seq of the write that made it; `to` the item as stored now. The journal covers
 * the span only when it has that very write (its row, with that version: after the item was removed and made again,
 * or the database restored, the same version is another write) and one row for each write after it, versions
 * from + 1 to `to`, none missing. `rows` are the item's rows from `from.seq` on (rows after `to.seq`, written
 * since the item was read, are left out). The ids are each record any of those writes changed or removed, once.
 */
export function changedSince(rows: readonly JournalRow[], from: { version: number; seq: number }, to: { version: number; seq: number }): string[] | null {
  if (to.version < from.version) return null;
  if (to.version === from.version) return to.seq === from.seq ? [] : null;
  let anchored = false;
  const versions = new Set<number>();
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.seq < from.seq || row.seq > to.seq) continue;
    if (row.seq === from.seq) {
      if (row.recordId === null && row.version === from.version) anchored = true;
      continue;
    }
    if (row.recordId === null) {
      if (row.version <= from.version || row.version > to.version || versions.has(row.version)) return null;
      versions.add(row.version);
    } else ids.add(row.recordId);
  }
  if (!anchored || versions.size !== to.version - from.version) return null;
  return [...ids];
}

/** The journal's rows for one write: the write itself, then each record it changed or removed. */
export function journalRows(seq: number, version: number, changes: LineChanges): JournalRow[] {
  return [
    { seq, version, recordId: null, removed: false },
    ...changes.changed.map((recordId) => ({ seq, version, recordId, removed: false })),
    ...changes.removed.map((recordId) => ({ seq, version, recordId, removed: true })),
  ];
}

/** The items whose writes are journaled: the company's records. */
export const journaled = (scope: string, key: string): boolean => scope === "company" && key === "records";

// ---------------------------------------------------------------------------
// a save of some records, and what a browser is handed: the same steps over PostgreSQL (backend/db.ts) and over the
// unit tests' stand-in

/** The records a browser has: their version, and the seq of the write that made it. */
export interface LinesAnchor {
  version: number;
  seq: number;
}

/** What a save's records make of the item as stored: the next version and the records it touched, or the ones somebody else changed first. */
export type ComposeLines = (stored: Lines, behind: ReadonlySet<string>) => { lines: Lines; touched: Iterable<string> } | { conflicts: string[] };

export type LinesWriteResult =
  /** Written (or nothing to write); `behind`: the records others changed since the browser's version, to hand back. */
  | { kind: "written"; version: number; seq: number; lines: Lines; behind: string[] }
  /** Nothing written: records the save names were changed by somebody else since; `lines` as stored. */
  | { kind: "conflict"; version: number; seq: number; lines: Lines; behind: string[]; conflicts: string[] }
  /** Nothing written, and the change cannot be said record by record (the journal does not cover it, or the item was
   *  reset): the whole item, as a whole write's 409 hands it. */
  | { kind: "whole"; current: { key: string; value: string; version: number; seq: number } | null };

/** What a browser holding the records at an anchor is handed: nothing (`same`), the records changed since, or null for the whole item. */
export type LinesAnswer = { kind: "same" } | { kind: "changes"; version: number; seq: number; lines: Lines; ids: string[] };

/** The item as one write's transaction sees it, and what that transaction may do (backend/db.ts writeLines). */
export interface LinesTransaction {
  key: string;
  /** The item's version and seq as stored, or null when it is not stored. */
  stored: { version: number; seq: number } | null;
  /** The stored item parsed (null: not a list). */
  lines(): Lines | null;
  /** The stored item as text. */
  text(): string;
  /** The journal's rows of the item from one seq to the other, both included; null when there are too many to use. */
  span(fromSeq: number, toSeq: number): Promise<JournalRow[] | null>;
  /** Writes the next version of the item. */
  write(value: string): Promise<{ version: number; seq: number }>;
  /** Writes one write's rows of the journal. */
  journal(rows: JournalRow[]): Promise<void>;
}

/**
 * A SAVE OF SOME RECORDS (REQUIREMENTS §108), inside the write's transaction. `base` is the browser's copy: its version
 * and the seq of the write that made it (seq null: not known, so only that very version is taken). When the item has
 * moved on since, the journal says which records others changed: none of the save's own, and the save is laid over
 * what is stored now; one of them, and nothing is written (`conflict`). `compose` makes the next version from the
 * stored one and may throw to refuse it (backend/accessLevels.ts AccessRefused): nothing is written then.
 */
export async function saveLines(tx: LinesTransaction, base: { version: number; seq: number | null }, compose: ComposeLines): Promise<LinesWriteResult> {
  const row = tx.stored;
  const whole = (): LinesWriteResult => ({ kind: "whole", current: row ? { key: tx.key, value: tx.text(), version: row.version, seq: row.seq } : null });
  let behind: string[] = [];
  let stored: Lines | null;
  if (!row) {
    if (base.version !== 0) return whole();
    stored = Lines.empty();
  } else {
    if (row.version < base.version) return whole();
    if (row.version === base.version) {
      if (base.seq !== null && base.seq !== row.seq) return whole();
    } else {
      if (base.seq === null || base.version === 0) return whole();
      const rows = await tx.span(base.seq, row.seq);
      const ids = rows ? changedSince(rows, { version: base.version, seq: base.seq }, row) : null;
      if (!ids) return whole();
      behind = ids;
    }
    stored = tx.lines();
    if (!stored) return whole();
  }
  const out = compose(stored, new Set(behind));
  if ("conflicts" in out) return { kind: "conflict", version: row?.version ?? 0, seq: row?.seq ?? 0, lines: stored, behind, conflicts: out.conflicts };
  const changes = changesBetween(stored, out.lines, out.touched);
  // Nothing of the save's differs from what is stored (sent twice, its answer lost on the way): nothing is written.
  if (row && changes && !changes.changed.length && !changes.removed.length) return { kind: "written", version: row.version, seq: row.seq, lines: stored, behind };
  const written = await tx.write(out.lines.text());
  // A save that cannot be said record by record (an id twice in what is stored) leaves a gap: browsers are handed the whole item.
  if (changes) await tx.journal(journalRows(written.seq, written.version, changes));
  return { kind: "written", version: written.version, seq: written.seq, lines: out.lines, behind };
}

/**
 * THE RECORDS CHANGED SINCE A BROWSER'S COPY: nothing when it is the stored version, the ids changed since when the
 * journal's `span(from.seq, stored.seq)` covers it, null (the whole item) otherwise.
 */
export async function answerLines(
  stored: { version: number; seq: number } | null,
  from: LinesAnchor,
  span: (fromSeq: number, toSeq: number) => Promise<JournalRow[] | null>,
  lines: () => Lines | null
): Promise<LinesAnswer | null> {
  if (!stored) return null;
  if (stored.version === from.version && stored.seq === from.seq) return { kind: "same" };
  if (stored.version <= from.version) return null;
  const rows = await span(from.seq, stored.seq);
  const ids = rows ? changedSince(rows, from, stored) : null;
  if (!ids) return null;
  const parsed = lines();
  return parsed ? { kind: "changes", version: stored.version, seq: stored.seq, lines: parsed, ids } : null;
}

/** A save's changes as the browser sends them: the records, and the ids removed. */
export interface PostedChanges {
  changed: Obj[];
  removed: string[];
}

/**
 * The body of a PATCH, checked: `changed` a list of records (each an object with an id and a document; the first of an
 * id is the one taken, as a whole write takes it) and `removed` a list of ids. Null for anything else.
 */
export function postedChanges(body: unknown): PostedChanges | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { changed, removed } = body as Obj;
  if ((changed !== undefined && !Array.isArray(changed)) || (removed !== undefined && !Array.isArray(removed))) return null;
  const out: PostedChanges = { changed: [], removed: [] };
  const seen = new Set<string>();
  for (const line of (changed as unknown[] | undefined) ?? []) {
    const id = lineId(line);
    if (id === null || typeof (line as Obj).documentId !== "string") return null;
    if (seen.has(id)) continue;
    seen.add(id);
    out.changed.push(line as Obj);
  }
  for (const id of (removed as unknown[] | undefined) ?? []) {
    if (typeof id !== "string" || !id) return null;
    if (!seen.has(id)) out.removed.push(id);
  }
  return out;
}
