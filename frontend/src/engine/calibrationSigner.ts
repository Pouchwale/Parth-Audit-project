import type { LogSheetData, LogSheetRow, RecordInstance } from "../types";
import { GSM_PLATES } from "../data/seed/qcCalibrationLayouts";
import { RULER_300_ID, RULER_600_ID } from "../data/seed/qcRulerVerificationLayouts";
import { NOMINAL_FILL_NOTE, SCALE_DAY_NOTE, SCALE_WEEKS_NOTE } from "./nominalFill";

// THE SIGN BOXES OF F/QC/11, F/QC/12 AND F/QC/17 ARE THE PERSON'S (REQUIREMENTS §288; the owner, 22-Nov-2026: "in qc module make
// sure that always sign part remain empty so user will manually add name specially only for qc-11, 12, 17"; this replaces §278,
// which wrote the submitter's and verifier's names).
//
// F/QC/11's Sign. line, F/QC/12's Tested By and Sign, and F/QC/17's Calibration performed by start empty on every sheet and line.
// DCRS never writes a name there: not on opening, not from the last sheet, not on a confirmed reading, not on Submit or Verify.

const GSM = "qc-gsm-plate-calibration";
const SCALE = "qc-weight-scale-calibration";
const DCRS_WROTE = new Set([NOMINAL_FILL_NOTE, SCALE_DAY_NOTE, SCALE_WEEKS_NOTE]);

const words = (v: unknown): string => String(v ?? "").trim();

/** The name boxes of a line of these three formats; none for any other document. */
export function signKeys(documentId: string | undefined, row: LogSheetRow): string[] {
  if (documentId === GSM) return words(row.parameter) === "Sign." ? GSM_PLATES.map((p) => p.key) : [];
  if (documentId === SCALE) return ["testedBy", "sign"];
  if (documentId === RULER_600_ID || documentId === RULER_300_ID) return ["performedBy"];
  return [];
}

/** The sheet with nobody's name in its sign boxes: what a new sheet starts from when it is written as the last one was. */
export function withoutSignNames(documentId: string | undefined, data: LogSheetData): LogSheetData {
  let changed = false;
  const rows = data.rows.map((row) => {
    const held = signKeys(documentId, row).filter((k) => words(row[k]) !== "");
    if (held.length === 0) return row;
    changed = true;
    return { ...row, ...Object.fromEntries(held.map((k) => [k, ""])) };
  });
  return changed ? { ...data, rows } : data;
}

/** The names DCRS itself put on this record when it was opened, before §288. */
export function namesDcrsWrote(record: RecordInstance): Set<string> {
  const names = new Set<string>();
  // (the opening note has been worded a little differently over time: its start is the same)
  for (const e of record.history ?? []) if (e.note && (DCRS_WROTE.has(e.note) || e.note.startsWith("Filled as the plant's pages"))) names.add(words(e.by));
  names.delete("");
  return names;
}

/** The mark that a person typed the name in this box, or emptied it; nothing for any other box. */
export function typedNameMark(documentId: string, data: LogSheetData, rowId: string, key: string, value: unknown): Pick<LogSheetData, "typedNames"> | Record<string, never> {
  const row = data.rows.find((r) => r.id === rowId);
  if (!row || !signKeys(documentId, row).includes(key)) return {};
  const place = `${rowId}:${key}`;
  const others = (data.typedNames ?? []).filter((p) => p !== place);
  return { typedNames: words(value) ? [...others, place] : others };
}
