import type { DocumentDefinition, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { ensureDemoRecordsGeneratedForYear } from "../data/demoGenerator";
import { ensureRecordsGeneratedForMonth } from "./recordGenerator";
import { moduleSlug } from "../utils/moduleSlug";
import { PEST_CONTROL_SECTIONS } from "../data/seed/documentDefinitions";
import { compareISO, daysInMonth, pad2, todayISO } from "../utils/date";

// DOCUMENT FILES — every record filed like a file system: module folder →
// document folder → month folder → one file per record, for EXACTLY the
// dates asked for. Shared by the Document Files page (/files/{scope}/{from}/
// {to}) and the assistant, which opens that page when someone asks for "all
// pest control documents from 1 to 19 January" or "lamination files from June
// to August" — the files for that span, not the whole calendar of the month.
//
// A scope is "all", a module slug ("human-resources"), the pest control file
// ("pest-control" — the shelf of the Human Resources module that holds
// F/HR/17, F/HR/18, the service reports and the training record, REQUIREMENTS
// §46), or comma-separated document ids ("daily-pest-monitoring,fly-catcher").

/** A range this wide (in months) is the most one view shows. */
export const FILES_MAX_MONTHS = 36;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface FileScope {
  docs: DocumentDefinition[];
  kind: "all" | "module" | "documents";
  /** The one module every document in scope belongs to, if there is one. */
  module?: string;
}

/** The pest control file: the shelf of the Human Resources module the department reads as "pest control". */
export const PEST_FILE_SCOPE = "pest-control";
const PEST_SECTIONS: ReadonlySet<string> = new Set(PEST_CONTROL_SECTIONS);
export const isPestFileDocument = (d: DocumentDefinition): boolean => d.module === "Human Resources" && PEST_SECTIONS.has(d.section ?? "");

export function resolveFileScope(scope: string | undefined): FileScope {
  const recordable = documentRepository.getRecordable();
  if (!scope || scope === "all") return { docs: recordable, kind: "all" };
  const byModule = recordable.filter((d) => moduleSlug(d.module) === scope);
  if (byModule.length > 0) return { docs: byModule, kind: "module", module: byModule[0].module };
  if (scope === PEST_FILE_SCOPE) {
    const pest = recordable.filter(isPestFileDocument);
    if (pest.length > 0) return { docs: pest, kind: "documents", module: "Human Resources" };
  }
  const ids = new Set(scope.split(",").filter(Boolean));
  const docs = recordable.filter((d) => ids.has(d.id));
  const oneModule = docs.length > 0 && docs.every((d) => d.module === docs[0].module) ? docs[0].module : undefined;
  return { docs, kind: "documents", module: oneModule };
}

/** The shortest scope that names exactly these documents: "all", a module slug, or the ids. */
export function scopeForDocuments(docIds: string[]): string {
  const recordable = documentRepository.getRecordable();
  const wanted = new Set(docIds);
  if (recordable.length > 0 && recordable.every((d) => wanted.has(d.id))) return "all";
  const modules = Array.from(new Set(recordable.filter((d) => wanted.has(d.id)).map((d) => d.module)));
  if (modules.length === 1) {
    const inModule = recordable.filter((d) => d.module === modules[0]);
    if (inModule.length === wanted.size && inModule.every((d) => wanted.has(d.id))) return moduleSlug(modules[0]);
  }
  const pest = recordable.filter(isPestFileDocument);
  if (pest.length > 0 && pest.length === wanted.size && pest.every((d) => wanted.has(d.id))) return PEST_FILE_SCOPE;
  return docIds.join(",");
}

export function filesRoute(scope: string, from: string, to: string): string {
  return `/files/${scope}/${from}/${to}`;
}

function isRealDate(iso: string): boolean {
  if (!ISO_RE.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function monthIndex(iso: string): number {
  return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
}

function lastDayOf(index: number): string {
  const y = Math.floor(index / 12);
  const m = index % 12;
  return `${y}-${pad2(m + 1)}-${pad2(daysInMonth(y, m))}`;
}

/**
 * A usable range: both ends real dates, in order, at most FILES_MAX_MONTHS
 * wide. No start date, or one that isn't a real date (2026-13-40), means this
 * month; a missing or malformed end means the start day alone.
 */
export function normaliseRange(from?: string, to?: string, today = todayISO()): { from: string; to: string; capped: boolean } {
  if (!from || !isRealDate(from)) return { from: `${today.slice(0, 7)}-01`, to: lastDayOf(monthIndex(today)), capped: false };
  let f = from;
  let t = to && isRealDate(to) ? to : from;
  if (compareISO(f, t) > 0) [f, t] = [t, f];
  if (monthIndex(t) - monthIndex(f) + 1 > FILES_MAX_MONTHS) return { from: f, to: lastDayOf(monthIndex(f) + FILES_MAX_MONTHS - 1), capped: true };
  return { from: f, to: t, capped: false };
}

/** Every calendar month the range touches, as "YYYY-MM". */
export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = monthIndex(from); i <= monthIndex(to) && out.length < FILES_MAX_MONTHS; i++) out.push(`${Math.floor(i / 12)}-${pad2((i % 12) + 1)}`);
  return out;
}

/**
 * The records due in the range for these documents, oldest first — after
 * making sure the records that should exist do, exactly as the calendar
 * would. Live records are never created before this system went live (the
 * launch-date floor in engine/recordGenerator.ts), so looking far back never
 * fabricates a backlog.
 */
export function recordsInRange(docIds: string[], from: string, to: string, isDemo: boolean): RecordInstance[] {
  const months = monthsInRange(from, to);
  if (isDemo) {
    for (const year of Array.from(new Set(months.map((m) => Number(m.slice(0, 4)))))) ensureDemoRecordsGeneratedForYear(year);
  } else {
    for (const ym of months) ensureRecordsGeneratedForMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, { documentIds: docIds, isDemo: false });
  }
  const wanted = new Set(docIds);
  return recordRepository
    .query({ isDemo, fromDate: from, toDate: to })
    .filter((r) => wanted.has(r.documentId))
    .sort((a, b) => compareISO(a.dueDate, b.dueDate) || a.documentId.localeCompare(b.documentId));
}
