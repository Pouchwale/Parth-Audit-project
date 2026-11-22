import type { LogSheetData, LogSheetRow, RecordInstance } from "../types";
import { GSM_PLATES } from "../data/seed/qcCalibrationLayouts";
import { RULER_300_ID, RULER_600_ID } from "../data/seed/qcRulerVerificationLayouts";
import { NOMINAL_FILL_NOTE, SCALE_DAY_NOTE, SCALE_WEEKS_NOTE } from "./nominalFill";

// THE NAME IN THE SIGN COLUMNS OF F/QC/11, F/QC/12 AND F/QC/17 (REQUIREMENTS §278; the owner, 22-Nov-2026: "those who have
// logged in or verified that document, their name should come there automatically and it should be editable").
//
//   - On Submit, a name DCRS wrote (the person who first opened the sheet) or a blank box takes the submitter's name.
//   - On Verify, a Sign box (F/QC/11's Sign. line, F/QC/12's Sign) takes the verifier's name. Tested By and Calibration
//     performed by say who did the work, so a verifier's name goes there only where the box is blank.
//   - A name a person typed is theirs and is never replaced (data.typedNames). Emptying the box hands it back to DCRS.
//   - F/QC/12's weeks with no reading yet are nobody's: no name goes on them.

const GSM = "qc-gsm-plate-calibration";
const SCALE = "qc-weight-scale-calibration";
const DCRS_WROTE = new Set([NOMINAL_FILL_NOTE, SCALE_DAY_NOTE, SCALE_WEEKS_NOTE]);

const words = (v: unknown): string => String(v ?? "").trim();

/** F/QC/12: a week somebody has read: a Pass or Fail, or a reading in Tested Values 3 to 5. */
const scaleLineRead = (row: LogSheetRow): boolean => words(row.passFail) !== "" || [3, 4, 5].some((i) => words(row[`testedValue${i}`]) !== "");

/** The name boxes of a line: `sign` is a signature, `doer` says who did the work. */
function nameBoxes(documentId: string, row: LogSheetRow, line: number): { key: string; sign: boolean }[] {
  if (documentId === GSM) return words(row.parameter) === "Sign." ? GSM_PLATES.map((p) => ({ key: p.key, sign: true })) : [];
  if (documentId === SCALE) return scaleLineRead(row) ? [{ key: "testedBy", sign: false }, { key: "sign", sign: true }] : [];
  if (documentId === RULER_600_ID || documentId === RULER_300_ID) return line === 0 ? [{ key: "performedBy", sign: false }] : [];
  return [];
}

/** The names DCRS itself put on this record: whoever opened it, submitted it or verified it before. */
function namesDcrsWrote(record: RecordInstance): Set<string> {
  const names = new Set<string>();
  for (const e of record.history ?? []) if (e.action === "submitted" || e.action === "verified" || (e.note && DCRS_WROTE.has(e.note))) names.add(words(e.by));
  if (record.submittedBy) names.add(words(record.submittedBy));
  names.delete("");
  return names;
}

function withNames(record: RecordInstance, actor: string, verifying: boolean): RecordInstance {
  const name = words(actor);
  const data = record.data as LogSheetData | undefined;
  if (!name || !Array.isArray(data?.rows)) return record;
  const typed = new Set(data.typedNames ?? []);
  const dcrs = namesDcrsWrote(record);
  let changed = false;
  const rows = data.rows.map((row, line) => {
    let next = row;
    for (const { key, sign } of nameBoxes(record.documentId, row, line)) {
      const held = words(row[key]);
      if (held === name) continue;
      const ours = !typed.has(`${row.id}:${key}`) && (dcrs.has(held) || (key === "sign" && held === words(row.testedBy)));
      if (held !== "" && !(ours && (!verifying || sign))) continue;
      next = { ...next, [key]: name };
      changed = true;
    }
    return next;
  });
  return changed ? { ...record, data: { ...data, rows } } : record;
}

export const signedOnSubmit = (record: RecordInstance, actor: string): RecordInstance => withNames(record, actor, false);
export const signedOnVerify = (record: RecordInstance, actor: string): RecordInstance => withNames(record, actor, true);

/** The mark that a person typed the name in this box, or emptied it; nothing for any other box. */
export function typedNameMark(documentId: string, data: LogSheetData, rowId: string, key: string, value: unknown): Pick<LogSheetData, "typedNames"> | Record<string, never> {
  const line = data.rows.findIndex((r) => r.id === rowId);
  const isNameBox =
    line >= 0 &&
    (documentId === SCALE ? key === "testedBy" || key === "sign" : nameBoxes(documentId, data.rows[line], line).some((b) => b.key === key));
  if (!isNameBox) return {};
  const place = `${rowId}:${key}`;
  const others = (data.typedNames ?? []).filter((p) => p !== place);
  return { typedNames: words(value) ? [...others, place] : others };
}
