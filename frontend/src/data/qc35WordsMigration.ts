import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { getLogSheetLayout } from "./seed/logSheetLayouts";

// F/QC/35'S SHEETS STILL OPEN TAKE THE PAPER'S WORDS (REQUIREMENTS §313). A sheet keeps its own lines, so the sheets made before the
// paper's layout still read "Bond Strength", "Odour Test", "Slitted Roll Width (mm)" and a lot status "Accepted": on a sheet not yet
// submitted each takes the paper's capitals, the same words. What anybody wrote in a line, and every submitted or verified sheet,
// stays as it is. Each sheet changed has a line in its history; run again it changes nothing.

export const QC35_WORDS_NOTE = "The paper's words: the test parameters and the lot status in the capitals F/QC/35 prints (REQUIREMENTS §313)";
// F/QC/37 the same, from its paper of the same day (§319): "Pouch Height (mm)" becomes "POUCH HEIGHT (mm)", "Accepted" "ACCEPTED".
export const QC37_WORDS_NOTE = "The paper's words: the test parameters and the lot status as F/QC/37 prints them (REQUIREMENTS §319)";
const NOTES: Record<string, string> = { "qc-inspection-slitting": QC35_WORDS_NOTE, "qc-inspection-pouching": QC37_WORDS_NOTE };
const OPEN: ReadonlySet<string> = new Set(["Scheduled", "Due", "In Progress"]);
const same = (a: unknown, b: string) => String(a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/** The sheet in the paper's words; null where it already is. */
export function inPaperWords(r: RecordInstance): LogSheetData | null {
  const layout = NOTES[r.documentId] ? getLogSheetLayout(r.documentId) : undefined;
  const d = r.data as LogSheetData | undefined;
  if (!layout || layout.rowMode.kind !== "fixedRows" || !d || !Array.isArray(d.rows)) return null;
  const words = layout.rowMode.rows.map((x) => String(x.parameter));
  let changed = false;
  const rows = d.rows.map((row) => {
    const word = words.find((w) => same(row.parameter, w));
    if (!word || row.parameter === word) return row;
    changed = true;
    return { ...row, parameter: word };
  });
  const options = layout.footerFields?.find((f) => f.key === "lotStatus")?.options ?? [];
  const status = options.find((o) => same(d.header?.lotStatus, o));
  let header = d.header;
  if (status && d.header?.lotStatus !== status) {
    header = { ...d.header, lotStatus: status };
    changed = true;
  }
  return changed ? { ...d, header, rows } : null;
}

/** Every open F/QC/35 and F/QC/37 sheet, once; returns how many changed. */
export function qc35SheetsInPaperWords(): number {
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    const note = NOTES[r.documentId];
    if (!note || r.correction || !OPEN.has(r.status) || !mayWriteRecordsOf(r.documentId)) continue;
    const data = inPaperWords(r);
    if (!data) continue;
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
