// FILES, FOLDERS AND PICTURES ATTACHED TO A MESSAGE FOR MITRA (REQUIREMENTS §80).
//
// A file is read on the SERVER (POST /api/assistant/extract, backend/
// attachments.ts): a PDF's text, a Word document's paragraphs, a workbook's
// sheets, a CSV or text file as it is, a picture by OCR — and forgotten there;
// only the text comes back and travels with the person's message
// (engine/mitraAgent.ts buildUserContent). Nothing new is persisted anywhere
// (SPEC "Hard constraints").
//
// A picture also keeps a small preview in the browser (a scaled-down JPEG,
// utils/image.ts) so the chat can show it and add_photo_to_open_record can put
// it on a complaint acknowledgement or a service agreement; a picture over 2 MB
// is read for its text alone.
import type { AttachmentKind, ExtractResult, MitraAttachment } from "./mitraTypes";
import { ApiError, assistantApi } from "../api/client";
import { imageFileToDataUrl } from "../utils/image";
import { generateId } from "../utils/id";
import { t } from "../i18n";

/** Attachments a message may carry; a folder gives its first ten readable files. */
export const MAX_ATTACHMENTS = 10;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** A picture up to this size keeps a preview for the chat and for adding to a record. */
export const IMAGE_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

function say(key: string, english: string, vars: Record<string, string | number> = {}): string {
  const said = t(key, vars);
  if (said !== key.split(".").pop()) return said;
  return english.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

const EXTENSION_KINDS: Record<string, AttachmentKind> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  xlsm: "xlsx",
  csv: "csv",
  tsv: "csv",
  txt: "text",
  md: "text",
  json: "text",
  log: "text",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
  heic: "image",
  heif: "image",
};

/** Hidden and system files a folder pick brings along: never read, never counted. */
const SYSTEM_FILE = /^(?:\.|~\$|thumbs\.db$|desktop\.ini$|\.ds_store$)/i;

export const isSystemFile = (name: string): boolean => SYSTEM_FILE.test(name.split(/[\\/]/).pop() ?? name);

const extensionOf = (name: string): string => {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
};

/** What kind of file this is, by its extension first (the plant's files are named plainly), then by its mime type. */
export function kindOf(file: Pick<File, "name" | "type">): AttachmentKind {
  const byExt = EXTENSION_KINDS[extensionOf(file.name)];
  if (byExt) return byExt;
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (mime === "text/csv") return "csv";
  if (mime.startsWith("text/") || mime === "application/json") return "text";
  return "unknown";
}

/**
 * Whether a file may be attached at all: not a hidden or system file, not
 * empty, at most 15 MB, and of a kind the server can read. The reason is in
 * plain words, for the chip that shows why a file was left out.
 */
export function acceptFile(file: Pick<File, "name" | "type" | "size">): { ok: true } | { ok: false; why: string } {
  if (isSystemFile(file.name)) return { ok: false, why: say("ai.attach.systemFile", "{name} is a hidden or system file", { name: file.name }) };
  if (file.size === 0) return { ok: false, why: say("ai.attach.empty", "{name} is empty", { name: file.name }) };
  if (file.size > MAX_FILE_BYTES) return { ok: false, why: say("ai.tooBig", "{name} is too big — a file can be up to {mb} MB.", { name: file.name, mb: MAX_FILE_BYTES / (1024 * 1024) }) };
  if (kindOf(file) === "unknown") return { ok: false, why: say("ai.unsupportedFile", "{name} is not a kind of file I can read — PDF, Word, Excel, CSV, plain text or a picture.", { name: file.name }) };
  return { ok: true };
}

export interface FolderPick {
  /** The files to attach, in the order they came, at most MAX_ATTACHMENTS. */
  files: File[];
  /** How many were left out — hidden files, unreadable kinds, files past the tenth. */
  skipped: number;
  /** Why the first few were left out, in plain words. */
  reasons: string[];
}

/**
 * The files of a folder (or a multiple pick) worth attaching: hidden and
 * system files skipped, unreadable kinds skipped, the first ten kept, and how
 * many were left out said back so the person is told.
 */
export function pickFromFolder(files: FileList | readonly File[]): FolderPick {
  const all: File[] = Array.from(files as ArrayLike<File>);
  const kept: File[] = [];
  const reasons: string[] = [];
  let skipped = 0;
  for (const f of all) {
    const verdict = acceptFile(f);
    if (!verdict.ok) {
      skipped++;
      // A hidden file is nobody's fault and needs no line; an unreadable one is worth a word.
      if (!isSystemFile(f.name) && reasons.length < 3) reasons.push(verdict.why);
      continue;
    }
    if (kept.length >= MAX_ATTACHMENTS) {
      skipped++;
      continue;
    }
    kept.push(f);
  }
  const readable = all.filter((f) => acceptFile(f).ok).length;
  if (readable > MAX_ATTACHMENTS) {
    reasons.push(say("ai.folderSkipped", "{n} files in the folder were left out — at most {max} readable files go with one message.", { n: readable - MAX_ATTACHMENTS, max: MAX_ATTACHMENTS }));
  }
  return { files: kept, skipped, reasons };
}

/** A data URL of the picture for the preview: a scaled-down JPEG in a browser, the bytes as they are elsewhere. */
async function previewOf(file: File): Promise<string | undefined> {
  if (file.size > IMAGE_PREVIEW_MAX_BYTES) return undefined;
  if (typeof document !== "undefined" && typeof Image !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    try {
      return await imageFileToDataUrl(file);
    } catch {
      /* not decodable as a picture here: the raw bytes below */
    }
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const encoded = typeof btoa === "function" ? btoa(binary) : "";
    return encoded ? `data:${file.type || "image/jpeg"};base64,${encoded}` : undefined;
  } catch {
    return undefined;
  }
}

/** The words for a failure to read: the server's own plain words when it gave some, else the reachability line. */
function failureNote(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return say("ai.tooBig", "{name} is too big — a file can be up to {mb} MB.", { name: "The file", mb: MAX_FILE_BYTES / (1024 * 1024) });
    if (err.status === 401) return say("ai.attach.signedOut", "You are signed out — sign in again and attach it once more");
    if (err.message && !/^Request failed/.test(err.message)) return err.message;
  }
  return say("ai.readFailed", "The file could not be read — is the server reachable?");
}

/**
 * Reads one attachment: says at once that it is being read (status
 * "reading"), sends the bytes to the server, and says again when the text is
 * back ("ready") or could not be had ("failed", with a note in plain words).
 * `onChange` is called on each state, with a fresh object every time.
 */
export async function readAttachment(file: File, onChange: (a: MitraAttachment) => void): Promise<MitraAttachment> {
  const kind = kindOf(file);
  let a: MitraAttachment = { id: generateId("att"), name: file.name, kind, size: file.size, status: "reading", text: "", characters: 0 };
  onChange(a);
  if (kind === "image") {
    const dataUrl = await previewOf(file);
    if (dataUrl) {
      a = { ...a, dataUrl };
      onChange(a);
    }
  }
  try {
    const res: ExtractResult = await assistantApi.extract(file, file.name);
    const text = typeof res.text === "string" ? res.text : "";
    a = {
      ...a,
      status: "ready",
      kind: res.kind ?? kind,
      text,
      characters: typeof res.characters === "number" ? res.characters : text.length,
      ...(res.truncated ? { truncated: true } : {}),
      ...(res.note ? { note: res.note } : {}),
      ...(res.readBy ? { readBy: res.readBy } : {}),
    };
  } catch (err) {
    a = { ...a, status: "failed", note: failureNote(err) };
  }
  onChange(a);
  return a;
}

/** "12,345 chars", "no readable text", "reading…" — the chip's own line. */
export function attachmentStatusLine(a: MitraAttachment): string {
  if (a.status === "reading") return say("ai.reading", "Reading…");
  if (a.status === "failed") return a.note ?? say("ai.readFailed", "Could not be read");
  if (a.characters === 0) return a.note ?? say("ai.attach.noText", "No readable text");
  return say("ai.readChars", "{n} chars", { n: a.characters.toLocaleString("en-IN") }) + (a.truncated ? " …" : "");
}
