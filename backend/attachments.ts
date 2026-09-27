// WHAT A FILE ATTACHED TO MITRA SAYS (REQUIREMENTS §80).
//
// A person attaches a supplier's PDF, a customer's Excel sheet, a photo of a
// register page; the browser posts the bytes to /api/assistant/extract and this
// reads them into text that travels with the message. PDF by unpdf, Word and
// Excel by opening the zip they are (backend/zip.ts — no library, the two
// formats are XML members), CSV/TXT as they are, and pictures by OCR: this
// key has no vision model, so a picture is read by tesseract.js (English and
// Gujarati) and never sent to the model as pixels — and when a picture has no
// readable text, the answer says so in plain words rather than guess.
//
// The contract: never throw for a file. Whatever the file is, the answer is
// an ExtractResult, with an empty `text` and a `note` when nothing could be
// read. Nothing is kept — the file is read and forgotten, like the CV reader.
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { dataDir } from "./paths.ts";
import { decodeEntities, docxText, isImageKind, looksLikeText, readZipEntry, sniffFileKind, zipHasEntry } from "./zip.ts";

export type AttachmentKind = "pdf" | "docx" | "xlsx" | "csv" | "text" | "image" | "unknown";

/** What POST /api/assistant/extract answers (frontend/src/engine/mitraTypes.ts ExtractResult). */
export interface ExtractResult {
  name: string;
  kind: AttachmentKind;
  text: string;
  characters: number;
  truncated: boolean;
  pages?: number;
  sheets?: string[];
  /** Plain words for the person when the file could not be read, or only in part. */
  note?: string;
  readBy: "text" | "ocr";
}

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
/** The most text one attachment yields; the rest is cut and `truncated` says so. */
export const MAX_ATTACHMENT_TEXT = 60000;
const MAX_ROWS_PER_SHEET = 300;

const NOTES = {
  empty: "The file is empty.",
  unknown: "This kind of file cannot be read here — attach a PDF, Word (.docx), Excel (.xlsx), CSV, text file or a picture.",
  oldOffice: "Old .doc / .xls files cannot be read; save the file as .docx, .xlsx or PDF and attach that.",
  zip: "This zip holds no Word or Excel document that can be read — attach the files inside it.",
  pdfClosed: "This PDF could not be opened — it may be damaged or password-protected.",
  pdfScan: "This PDF has no readable text — it looks like a scanned picture. Attach its pages as pictures to read them by OCR.",
  docxEmpty: "This Word file has no readable text inside it.",
  xlsxEmpty: "This workbook has no readable sheets inside it.",
  textUnreadable: "This file's text could not be decoded.",
  noText: "This file has no readable text.",
  pictureNoText: "This picture has no readable text.",
  ocrOff: "Pictures are not read on this server (OCR is switched off).",
  ocrUnavailable: "This picture could not be read on this server (no OCR data).",
  ocrTimeout: "Reading this picture took too long — try a smaller or sharper picture.",
  ocrFailed: "This picture could not be read — try a PNG or JPEG of the page.",
} as const;

// ---------------------------------------------------------------------------
// what the file is

type InnerKind = AttachmentKind | "doc" | "zip";

const TEXT_EXTENSIONS = /^(csv|tsv|txt|text|md|markdown|json|log)$/;
const IMAGE_EXTENSIONS = /^(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|avif)$/;

function extensionOf(fileName: string): string {
  return (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? "").toLowerCase();
}

/** The file's bytes first, then its name and mime — the kind Mitra reads it as. */
export function detectAttachmentKind(buf: Buffer, fileName: string, mime?: string): InnerKind {
  const ext = extensionOf(fileName);
  const type = (mime ?? "").split(";")[0].trim().toLowerCase();
  const magic = sniffFileKind(buf);
  if (magic === "pdf") return "pdf";
  if (magic === "zip") {
    if (zipHasEntry(buf, "word/document.xml")) return "docx";
    if (zipHasEntry(buf, "xl/workbook.xml")) return "xlsx";
    return "zip";
  }
  if (magic === "doc") return "doc";
  if (isImageKind(magic)) return "image";
  // No signature: the name decides, and a text file is one that reads as text.
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (ext === "doc" || ext === "xls") return "doc";
  if (IMAGE_EXTENSIONS.test(ext) || type.startsWith("image/")) return "image";
  // A UTF-16 export (Excel's "Unicode Text") is half NUL bytes; its BOM vouches for it.
  const utf16 = buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff));
  if ((TEXT_EXTENSIONS.test(ext) || type.startsWith("text/") || type === "application/json") && (utf16 || looksLikeText(buf))) {
    return ext === "csv" || ext === "tsv" || type === "text/csv" || type === "text/tab-separated-values" ? "csv" : "text";
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// text, tidied and capped

function tidy(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[  -   　]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cap(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_ATTACHMENT_TEXT) return { text, truncated: false };
  let cut = text.slice(0, MAX_ATTACHMENT_TEXT);
  // Back to the last line break if one is near, so no line is left half-read.
  const nl = cut.lastIndexOf("\n");
  if (nl > MAX_ATTACHMENT_TEXT - 400) cut = cut.slice(0, nl);
  return { text: cut.trimEnd(), truncated: true };
}

/** Whether there is anything to read: at least a few letters or digits, in any script. */
function hasWords(text: string): boolean {
  let n = 0;
  for (const ch of text) {
    if (/[\p{L}\p{N}]/u.test(ch) && ++n >= 3) return true;
  }
  return false;
}

/** A text file's characters: UTF-16 by its BOM, else strict UTF-8, else Latin-1 (a Windows-1252 export still reads). */
function decodeText(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const even = buf.subarray(2, 2 + ((buf.length - 2) & ~1));
    return Buffer.from(even).swap16().toString("utf16le");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return buf.toString("latin1");
  }
}

// ---------------------------------------------------------------------------
// PDF

async function pdfText(buf: Buffer): Promise<{ text: string; pages?: number; note?: string }> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buf));
  } catch {
    return { text: "", note: NOTES.pdfClosed };
  }
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const tidied = tidy(text);
    if (!hasWords(tidied)) return { text: "", pages: totalPages, note: NOTES.pdfScan };
    return { text: tidied, pages: totalPages };
  } catch {
    return { text: "", note: NOTES.pdfClosed };
  } finally {
    // pdf.js frees the document's memory on destroy(); unpdf's type leaves it out.
    try {
      await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
    } catch {
      /* freeing the document is best effort */
    }
  }
}

// ---------------------------------------------------------------------------
// Excel — the .xlsx zip read by hand: workbook.xml names the sheets, the rels
// file says which member each is, sharedStrings.xml holds the texts the cells
// point at, and each sheet is rows of cells with a reference ("B3"), a type
// and a value. Out come tab-separated rows, the first 300 of each sheet.

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? (m[1] ?? m[2]) : undefined;
}

/** Every <t> text inside a fragment, joined — a shared string's runs, an inline string. */
function innerTexts(xml: string): string {
  const parts: string[] = [];
  const re = /<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) parts.push(m[1] ?? "");
  return decodeEntities(parts.join(""));
}

function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(innerTexts(m[1].replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "")));
  return out;
}

/** "AB" of "AB12" → 27 (0-based column). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return Math.max(0, n - 1);
}

function sheetRows(xml: string, shared: string[]): string[] {
  const rows: string[] = [];
  const rowRe = /<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
  const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  const valueRe = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(xml)) && rows.length < MAX_ROWS_PER_SHEET) {
    const inner = row[1];
    if (inner === undefined) continue;
    const cells: string[] = [];
    cellRe.lastIndex = 0;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(inner))) {
      const attrs = cell[1];
      const body = cell[2];
      const ref = attr(attrs, "r");
      const type = attr(attrs, "t");
      let value = "";
      if (body !== undefined) {
        if (type === "inlineStr") value = innerTexts(body);
        else {
          const v = valueRe.exec(body)?.[1] ?? "";
          if (type === "s") value = shared[Number(v)] ?? "";
          else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
          else value = decodeEntities(v);
        }
      }
      const col = ref ? columnIndex(ref.toUpperCase()) : cells.length;
      while (cells.length < col) cells.push("");
      cells[col] = value.replace(/[\t\r\n]+/g, " ").trim();
    }
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    if (cells.length === 0) continue;
    rows.push(cells.join("\t"));
  }
  return rows;
}

function xlsxText(buf: Buffer): { text: string; sheets: string[]; note?: string } {
  const workbook = readZipEntry(buf, "xl/workbook.xml")?.toString("utf8");
  if (!workbook) return { text: "", sheets: [], note: NOTES.xlsxEmpty };
  const rels = readZipEntry(buf, "xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const shared = sharedStrings(readZipEntry(buf, "xl/sharedStrings.xml")?.toString("utf8") ?? "");
  const sheets: string[] = [];
  const parts: string[] = [];
  let n = 0;
  let chars = 0;
  for (const m of workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    n += 1;
    const name = decodeEntities(attr(m[0], "name") ?? `Sheet${n}`);
    // r:id as a rule; another prefix for the relationships namespace is legal.
    const rid = attr(m[0], "r:id") ?? /\s\w+:id\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(m[0])?.slice(1).find(Boolean);
    const target = (rid && targets.get(rid)) || `xl/worksheets/sheet${n}.xml`;
    const xml = readZipEntry(buf, target)?.toString("utf8");
    if (!xml) continue;
    sheets.push(name);
    if (chars > MAX_ATTACHMENT_TEXT) continue; // the cap is reached; the names of the other sheets are still told
    const part = `## ${name}\n${sheetRows(xml, shared).join("\n")}`;
    chars += part.length;
    parts.push(part);
  }
  if (sheets.length === 0) return { text: "", sheets, note: NOTES.xlsxEmpty };
  return { text: parts.join("\n\n"), sheets };
}

// ---------------------------------------------------------------------------
// pictures — OCR with tesseract.js, ONE worker for the whole server, its jobs
// one after another (a worker reads one picture at a time), each given 45
// seconds, and the worker put down after ten idle minutes so an evening's
// last photo does not keep 100 MB of engine in memory all night. The engine
// and its language data are loaded lazily: the first picture ever attached
// downloads eng + guj (about 15 MB) into backend/data/ocr (gitignored with
// backend/data), and every later start reads them from there.
//
// MITRA_OCR=0 switches OCR off (the unit tests, a server that must not reach
// the internet); MITRA_OCR_LANG_PATH names a folder or URL holding
// <lang>.traineddata.gz for a plant with no internet at all.

const OCR_LANGS = ["eng", "guj"];
const OCR_TIMEOUT_MS = 45000;
const OCR_START_WAIT_MS = 60000;
const OCR_IDLE_MS = 10 * 60 * 1000;
const OCR_RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const ocrDir = path.join(dataDir, "ocr");

interface OcrWorker {
  recognize(image: Buffer): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}
type CreateWorker = (langs: string[], oem: number, options: Record<string, unknown>) => Promise<OcrWorker>;

class OcrTimeout extends Error {}

/** Whether pictures are read at all on this server. */
export function ocrEnabled(): boolean {
  return process.env.MITRA_OCR !== "0";
}

let workerPromise: Promise<OcrWorker> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let idleTimer: NodeJS.Timeout | null = null;
let unavailableUntil = 0;

async function createOcrWorker(): Promise<OcrWorker> {
  mkdirSync(ocrDir, { recursive: true });
  const missing = OCR_LANGS.filter((lang) => !existsSync(path.join(ocrDir, `${lang}.traineddata`)));
  if (missing.length > 0 && !process.env.MITRA_OCR_LANG_PATH) {
    console.log(`Mitra OCR: downloading the ${missing.join(" and ")} language data (about 15 MB, once) into ${ocrDir} …`);
  }
  const mod = (await import("tesseract.js")) as unknown as { createWorker?: CreateWorker; default?: { createWorker?: CreateWorker } };
  const createWorker = mod.createWorker ?? mod.default?.createWorker;
  if (typeof createWorker !== "function") throw new Error("tesseract.js has no createWorker");
  // OEM 1 = LSTM only, the engine the downloaded data is for. errorHandler is
  // required: without one tesseract.js THROWS inside its message handler when
  // a job fails, which would take the server down (the job's own promise is
  // rejected as well, which is all this file needs).
  return createWorker(OCR_LANGS, 1, {
    cachePath: ocrDir,
    ...(process.env.MITRA_OCR_LANG_PATH ? { langPath: process.env.MITRA_OCR_LANG_PATH } : {}),
    gzip: true,
    logger: () => {},
    errorHandler: () => {},
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new OcrTimeout(what)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/** Puts the worker down (after idling, after a stuck job, or when a test asks). */
export async function stopOcrWorker(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    await (await pending).terminate();
  } catch {
    /* a worker that never started has nothing to stop */
  }
}

function restIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void stopOcrWorker(), OCR_IDLE_MS);
  idleTimer.unref();
}

// Read through a function on purpose: inside ocrJob TypeScript would take the
// worker it just started for always there, though a stuck job puts it down.
const workerAlive = (): boolean => workerPromise !== null;

async function ocrJob(buf: Buffer): Promise<{ text: string; note?: string }> {
  if (Date.now() < unavailableUntil) return { text: "", note: NOTES.ocrUnavailable };
  let worker: OcrWorker;
  try {
    if (!workerPromise) {
      workerPromise = createOcrWorker();
      workerPromise.catch(() => {
        workerPromise = null;
      });
    }
    worker = await withTimeout(workerPromise, OCR_START_WAIT_MS, "start");
  } catch (err) {
    if (err instanceof OcrTimeout) {
      // Still downloading, most likely — the promise is kept, so the next picture finds the worker ready.
      return { text: "", note: NOTES.ocrTimeout };
    }
    // A worker whose load failed cannot be terminated (tesseract.js gives no
    // handle back); a pause before the next attempt keeps failures from piling up.
    unavailableUntil = Date.now() + OCR_RETRY_AFTER_FAILURE_MS;
    console.error("Mitra OCR unavailable —", err instanceof Error ? err.message : err);
    return { text: "", note: NOTES.ocrUnavailable };
  }
  try {
    const result = await withTimeout(worker.recognize(buf), OCR_TIMEOUT_MS, "recognize");
    const text = tidy(result.data.text).replace(/[ \t]{2,}/g, " ");
    return hasWords(text) ? { text } : { text: "", note: NOTES.pictureNoText };
  } catch (err) {
    if (err instanceof OcrTimeout) {
      // A job that hangs has hung the worker; a fresh one serves the next picture.
      await stopOcrWorker();
      return { text: "", note: NOTES.ocrTimeout };
    }
    return { text: "", note: NOTES.ocrFailed };
  } finally {
    if (workerAlive()) restIdleTimer();
  }
}

function ocrImage(buf: Buffer): Promise<{ text: string; note?: string }> {
  if (!ocrEnabled()) return Promise.resolve({ text: "", note: NOTES.ocrOff });
  const run = queue.then(() => ocrJob(buf));
  queue = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------

/** Reads one attached file into text. Never throws: an unreadable file answers with an empty text and a note. */
export async function readAttachment(buf: Buffer, fileName: string, mime?: string): Promise<ExtractResult> {
  const name = fileName.trim().slice(0, 200) || "file";
  const inner = buf.length === 0 ? "unknown" : detectAttachmentKind(buf, name, mime);
  const kind: AttachmentKind = inner === "doc" || inner === "zip" ? "unknown" : inner;
  const answer = (text: string, extra: { pages?: number; sheets?: string[]; note?: string; readBy?: "text" | "ocr" } = {}): ExtractResult => {
    const capped = cap(text);
    return {
      name,
      kind,
      text: capped.text,
      characters: capped.text.length,
      truncated: capped.truncated,
      ...(extra.pages !== undefined ? { pages: extra.pages } : {}),
      ...(extra.sheets ? { sheets: extra.sheets } : {}),
      ...(extra.note ? { note: extra.note } : {}),
      readBy: extra.readBy ?? "text",
    };
  };

  try {
    if (buf.length === 0) return answer("", { note: NOTES.empty });
    switch (inner) {
      case "pdf": {
        const r = await pdfText(buf);
        return answer(r.text, { pages: r.pages, note: r.note });
      }
      case "docx": {
        const xml = readZipEntry(buf, "word/document.xml");
        // docxText (shared with the CV reader) ends every paragraph with a line
        // break, so a table cell's last paragraph would break the row: here
        // a row is a line and its cells are tab-separated, like a sheet's.
        const rows = xml ? xml.toString("utf8").replace(/<\/w:p>(\s*)<\/w:tc>/g, "$1</w:tc>").replace(/<\/w:tr>/g, "</w:tr>\n") : "";
        const text = rows ? tidy(docxText(rows)) : "";
        return answer(text, hasWords(text) ? {} : { note: NOTES.docxEmpty });
      }
      case "xlsx": {
        const r = xlsxText(buf);
        return answer(r.text, { sheets: r.sheets, note: r.note ?? (hasWords(r.text) ? undefined : NOTES.xlsxEmpty) });
      }
      case "csv":
      case "text": {
        const text = tidy(decodeText(buf));
        return answer(text, hasWords(text) ? {} : { note: NOTES.noText });
      }
      case "image": {
        const r = await ocrImage(buf);
        return answer(r.text, { note: r.note, readBy: "ocr" });
      }
      case "doc":
        return answer("", { note: NOTES.oldOffice });
      case "zip":
        return answer("", { note: NOTES.zip });
      default:
        return answer("", { note: NOTES.unknown });
    }
  } catch (err) {
    console.error("Attachment could not be read —", err instanceof Error ? err.message : err);
    return answer("", { note: inner === "image" ? NOTES.ocrFailed : NOTES.noText, readBy: inner === "image" ? "ocr" : "text" });
  }
}
