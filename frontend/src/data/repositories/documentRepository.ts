import type { DocumentDefinition } from "../../types";
import { RETIRED_DOCUMENT_IDS, SEED_DOCUMENTS } from "../seed/documentDefinitions";
import { isDocumentVisible } from "../../engine/departmentScope";
import { readJSON, readJSONCached, writeJSON } from "../storageAdapter";
import { formatEdits } from "../formatEdits";

const KEY = "documents";

// The definitions as they stand now: the issued ones, with the name and the
// revision of any format the plant has changed laid over them
// (data/formatEdits.ts, REQUIREMENTS §62). What is STORED stays the issued
// list — ensureSeeded puts it back on every start-up — so a change is never
// lost to a re-seed and "Restore the issued format" only has to drop the edit.
// READ ONCE PER STORED VALUE (REQUIREMENTS §65). This is asked ninety-eight
// times over a screen — once per line of a report, once per reminder — and each
// was a JSON.parse of the whole 53 KB list. readJSONCached hands back the same
// parsed copy until the stored string changes; the OVERLAID list is remembered
// beside it, against both of the things it is made from, so a change to either
// (a format revised, a re-seed, a colleague's edit arriving) is laid over
// afresh. Nothing here is ever changed in place — upsert and ensureSeeded read
// with readJSON and get a copy of their own.
let overlaid: { issued: DocumentDefinition[]; edits: object; value: DocumentDefinition[] } | null = null;

function loadAll(): DocumentDefinition[] {
  const issued = readJSONCached<DocumentDefinition[]>(KEY, []);
  const edits = formatEdits();
  if (Object.keys(edits).length === 0) return issued;
  if (overlaid && overlaid.issued === issued && overlaid.edits === edits) return overlaid.value;
  const value = issued.map((d) => {
    const e = edits[d.id];
    return e ? { ...d, name: e.name ?? d.name, revisionNo: e.revisionNo, revisionDate: e.revisionDate } : d;
  });
  overlaid = { issued, edits, value };
  return value;
}

function saveAll(docs: DocumentDefinition[]): void {
  writeJSON(KEY, docs);
}

// Document definitions are configuration, not user data (nothing in the UI
// edits them), so the seed list is always authoritative: every boot
// re-syncs it by id. That's what lets a browser that already used the app
// pick up newly digitized formats (e.g. the lamination QC/production log
// sheets added from "Audit documents.zip") and schedule changes (Training
// moving from As Required to Yearly) without anyone clearing localStorage.
// Any definition that isn't in the seed is kept untouched — unless it has
// been explicitly retired (RETIRED_DOCUMENT_IDS), in which case it is
// dropped so a withdrawn document doesn't keep generating records.
export function ensureSeeded(): void {
  const existing = readJSON<DocumentDefinition[]>(KEY, []);
  const seedIds = new Set(SEED_DOCUMENTS.map((d) => d.id));
  const retired = new Set(RETIRED_DOCUMENT_IDS);
  const extras = existing.filter((d) => !seedIds.has(d.id) && !retired.has(d.id));
  const next = [...SEED_DOCUMENTS, ...extras];
  if (JSON.stringify(next) !== JSON.stringify(existing)) saveAll(next);
}

// THE DEPARTMENT FILTER LIVES HERE, so every screen that asks this repository
// for documents is answered for the logged-in user's own department(s) without
// having to remember to filter (engine/departmentScope.ts, REQUIREMENTS §40).
//
// The *Unscoped variants exist for the handful of callers that must work on
// the plant's whole catalogue whoever happens to be logged in: the record
// generator, the demo generator, the boot migrations and this file's own
// ensureSeeded. Scoping those would mean another department's records were
// never created — and since localStorage is the only store, that obligation
// would vanish for everyone, not just for the person looking.
export const documentRepository = {
  getAll(): DocumentDefinition[] {
    return loadAll().filter(isDocumentVisible);
  },
  getById(id: string): DocumentDefinition | undefined {
    const doc = loadAll().find((d) => d.id === id);
    return doc && isDocumentVisible(doc) ? doc : undefined;
  },
  getRecordable(): DocumentDefinition[] {
    return loadAll().filter((d) => !d.isReferenceOnly && isDocumentVisible(d));
  },

  /** Every definition, whatever the viewer's department — for generators and migrations. */
  getAllUnscoped(): DocumentDefinition[] {
    return loadAll();
  },
  /** One definition, whatever the viewer's department. */
  getByIdUnscoped(id: string): DocumentDefinition | undefined {
    return loadAll().find((d) => d.id === id);
  },
  /** Every record-holding definition, whatever the viewer's department. */
  getRecordableUnscoped(): DocumentDefinition[] {
    return loadAll().filter((d) => !d.isReferenceOnly);
  },

  upsert(doc: DocumentDefinition): void {
    const all = readJSON<DocumentDefinition[]>(KEY, []);
    const idx = all.findIndex((d) => d.id === doc.id);
    if (idx >= 0) all[idx] = doc;
    else all.push(doc);
    saveAll(all);
  },
  resetToSeed(): void {
    saveAll(SEED_DOCUMENTS);
  },
};
