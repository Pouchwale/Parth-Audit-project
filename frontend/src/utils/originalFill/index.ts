// EVERY DOWNLOAD IS THE OWNER'S OWN FILE (REQUIREMENTS §119). The owner, 20-Oct-2026: "when user click on print button or
// download the any particular document then it should download the same document which i have uploaded / Supplied to you
// and this is applicable to all modules."
//
// A document with a template (data/seed/originalFiles.ts) downloads as that file, filled with the record: the template is
// fetched only when someone presses Download (frontend/public/originals, served beside the app), filled by its kind
// (xlsxFill.ts, docxFill.ts), and READ BACK before it is handed over (engine/roundTrip/readFile.ts): a file whose map does
// not give back every value it holds, or that would read a line of the paper's own as a new line, is never downloaded -
// the generic download is made instead (utils/documentExport.ts), which never errors (REQUIREMENTS §81).

import type { ExportBlock } from "../documentExport";
import type { RoundTripEnvelope } from "../../engine/roundTrip/exportMap";
import { readUploadedFile } from "../../engine/roundTrip/readFile";
import { originalFileOf, type OriginalFile } from "../../data/seed/originalFiles";
import { COMPANY } from "../../data/seed/masterData";
import { fillXlsx } from "./xlsxFill";
import { fillDocx } from "./docxFill";
import { hintsOf } from "./hints";
import type { FillReport } from "./types";

export type { FillReport } from "./types";
export { originalFileOf } from "../../data/seed/originalFiles";

/**
 * The four documents whose download was drawn by hand on their original's grid before the templates (REQUIREMENTS §118):
 * kept as they are until the template's file is verified at least as good (tests/originals_check).
 */
export const HAND_DRAWN = new Set(["service-report-rodent", "service-report-general", "service-report-fly", "hr-daily-cleaning", "hr-monthly-cleaning", "fly-catcher"]);

/**
 * Documents whose own file the filler cannot yet fill as his paper, or whose Word or Excel original is not the document DCRS
 * keeps (REQUIREMENTS §119 round 2 and its QC part of 22-Oct-2026): they keep the generic download. F/SYS/04-A's only Word
 * original is the meeting RECORD (F/SYS/04), not the agenda and notification DCRS keeps (its PDF). The QC ones, after the
 * QC print round 2: F/QC/06 and F/QC/07 - his Word files are reports exported from SAP Business Objects, every word in a
 * positioned frame, no table or line to write in; F/QC-09, F/QC-10, F/QC-38 - the statement's sections are boxes on DCRS's
 * page (heading and lines editable) that his paper prints as its own words; F-QC-14 (both) - his paper names its four
 * inspectors in the column headings (his examples), the record's inspectors are DCRS's; F/QC/21 flexo ink - his Word file
 * draws its table as lines of tabs, no table to write the observations in; F/QC/30 - the key points and the participants
 * are numbered lines under a heading on his paper, a grid and a list on DCRS's page.
 */
export const NOT_YET = new Set([
  "qc-coa-label",
  "qc-coa-sleeve",
  "soc-labels",
  "soc-shrink-sleeves",
  "soc-flexible-packaging",
  "qc-test-reliability-label",
  "qc-test-reliability-sleeve",
  "qc-flexo-ink",
  "qc-minutes-of-meetings",
  "sys-mrm-agenda",
  "sys-mrm-record",
  "sys-audit-nc",
  "sys-nc-car",
  "pur-supplier-registration",
]);

const cache = new Map<string, ArrayBuffer>();

async function template(file: OriginalFile): Promise<ArrayBuffer> {
  const known = cache.get(file.file);
  if (known) return known.slice(0);
  const base = typeof document !== "undefined" && document.baseURI ? document.baseURI : "/";
  const res = await fetch(new URL(file.file, base).toString(), { cache: "force-cache" });
  if (!res.ok) throw new Error(`template ${file.file}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  cache.set(file.file, buffer);
  return buffer.slice(0);
}

/** The template filled with the blocks (the map in it when an envelope is given). Throws on anything it cannot do. */
export async function fillTemplate(
  file: Pick<OriginalFile, "kind" | "sheet">,
  buffer: ArrayBuffer,
  blocks: ExportBlock[],
  envelope: RoundTripEnvelope | undefined,
  documentId: string
): Promise<{ bytes: Uint8Array<ArrayBuffer>; report: FillReport }> {
  const hints = hintsOf(documentId);
  const out = file.kind === "xlsx" ? await fillXlsx(buffer, blocks, { envelope, sheet: file.sheet, hints, company: COMPANY.name }) : await fillDocx(buffer, blocks, { envelope, hints, company: COMPANY.name });
  // A value DCRS shows that found no place on the paper: the file would not be the record, so it is not handed over (the
  // generic download is made instead) - unless the paper is known not to print it (hints.ts notOnPaper).
  if (out.report.notPlaced.length) throw new Error(`no place on the paper for: ${out.report.notPlaced.slice(0, 5).join(", ")}`);
  // A grid of the page the paper has no headings for: its lines (bound or not) would be lost, and the paper's own example
  // lines under some other heading might stay - the file is not the record.
  if (out.report.gridsMissed.length) throw new Error(`no grid on the paper for: ${out.report.gridsMissed.slice(0, 3).join(" / ")}`);
  if (envelope) {
    // Read back as an upload would be: every value where the map says, no line of the paper's own taken for a new one.
    const read = await readUploadedFile(out.bytes.slice().buffer, `check.${file.kind}`);
    if (!read.ok) throw new Error(`the filled file does not read back: ${read.reason}`);
    if (read.missing.length) throw new Error(`the filled file lost ${read.missing.length} value(s)`);
    if (read.appended.length) throw new Error(`the filled file reads ${read.appended.length} new line(s) that are the paper's own`);
  }
  return out;
}

/** The document's own file filled with what the page shows, or null where it has no template (or it cannot be filled). */
export async function originalFileBytes(documentId: string, blocks: ExportBlock[], envelope: RoundTripEnvelope | undefined): Promise<{ bytes: Uint8Array<ArrayBuffer>; kind: "xlsx" | "docx"; report: FillReport } | null> {
  const file = originalFileOf(documentId);
  if (!file || HAND_DRAWN.has(documentId) || NOT_YET.has(documentId)) return null;
  const buffer = await template(file);
  const { bytes, report } = await fillTemplate(file, buffer, blocks, envelope, documentId);
  return { bytes, kind: file.kind, report };
}
