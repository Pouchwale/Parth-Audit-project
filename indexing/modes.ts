// HOW EACH FORMAT IS KEPT — THE SUPER ADMIN'S SWITCH ON THE INDEXING PAGE (REQUIREMENTS §304).
//
//   Automatic       sheets fall due by the frequency, and the system's logic fills what it knows when a sheet is opened
//                   (F/QC/12 by itself on its day).
//   Manual          sheets still fall due by the frequency, but the system fills nothing: every box is typed by a person.
//   Manual start    no sheet falls due; a person starts one when it is needed (As Required).
//   Reference only  read only, never filled in DCRS.
//   SAP             kept in SAP: never filled in DCRS (shown as SAP's).
//   Not in DCRS     a Master List line DCRS holds no format for.
//
// Stored as the index-only field `mode` of a format's line (indexState.ts), so every switch is a version: compared,
// restored and reset like any other index change. Read here by the document list (documentRepository.ts lays
// Manual start / Reference only / SAP over the format) and by the fill (engine/assistantPrepare.ts asks systemFills).

// (Imports nothing but the stored index: data/repositories/documentRepository.ts reads it, and indexRows.ts reads that.)
import { readIndexState } from "./indexState";

export const INDEX_MODES = ["Automatic", "Manual", "Manual start", "Reference only", "SAP", "Not in DCRS"] as const;
export type IndexMode = (typeof INDEX_MODES)[number];

export const MODE_HELP: Record<IndexMode, string> = {
  Automatic:
    "Falls due on its own by its frequency; the system fills the known parts when the sheet is opened. Readings and signatures are a person's. A Statement of Compliance: its renewal is reminded 90 days before it runs out. A line with no format in DCRS: marked Automatic, no format yet.",
  Manual: "Falls due by its frequency, but the system fills nothing: every box is typed by a person.",
  "Manual start": "As Required: nothing falls due; a person starts a record when the event happens.",
  "Reference only": "Read only: no records are made or filled in DCRS. Records already filled stay.",
  SAP: "Kept in SAP: no records are made or filled in DCRS. Records already filled stay.",
  "Not in DCRS": "On the Master List, but DCRS holds no format for it: kept on paper.",
};

/**
 * The modes a line may be switched to, from what it is as issued (its base mode). The owner, 24-Nov-2026 (§305): a Master
 * List line with no format may be marked Automatic (it stays marked "No format in DCRS"); a Statement of Compliance
 * (`renewable`) may be Automatic, meaning its renewal is reminded; an As Required format may be Automatic once it has a
 * frequency (choosing Automatic sets Daily, which can be changed).
 */
export function modeOptions(baseMode: string, renewable = false): IndexMode[] {
  if (baseMode === "Not in DCRS") return ["Not in DCRS", "Automatic", "SAP"];
  if (baseMode === "Reference only") return renewable ? ["Reference only", "Automatic", "SAP"] : ["Reference only", "SAP"];
  if (baseMode === "Manual start") return ["Manual start", "Automatic", "Manual", "Reference only", "SAP"];
  return ["Automatic", "Manual", "Manual start", "Reference only", "SAP"];
}

/** A Statement of Compliance's renewal is reminded (the daily briefing, 90 days ahead) only while it is Automatic (§305). */
export const renewalReminderOn = (docId: string): boolean => indexModeOf(docId) === "Automatic";

/** The mode the super admin set for a DCRS format, or undefined (it runs as issued). */
export function indexModeOf(docId: string, formats = readIndexState().current.formats): IndexMode | undefined {
  // The line's key, as indexRows.ts formatLineKey makes it for a DCRS format.
  const m = formats[`doc:${docId}`]?.mode;
  return m && (INDEX_MODES as readonly string[]).includes(m) ? (m as IndexMode) : undefined;
}

/** Whether the system's logic may fill this format's sheets (false when the super admin made it Manual, Reference only or SAP). */
export function systemFills(docId: string): boolean {
  const m = indexModeOf(docId);
  return m === undefined || m === "Automatic" || m === "Manual start";
}
