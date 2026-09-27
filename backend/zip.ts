// WHAT AN UPLOADED FILE IS, AND HOW TO OPEN THE ZIPPED KINDS.
//
// Two readers take files people upload — the CV reader (cvExtract.ts,
// REQUIREMENTS §49) and Mitra's attachment reader (attachments.ts, §80) — and
// both need the same three things: to tell from a file's first bytes what it
// is (a PDF, a picture, an old .doc, a zip), to pull one member out of a zip
// (a .docx or .xlsx IS a zip of XML files), and to turn Word's XML into plain
// text. They live here once, with no dependency: the zip walk is the central
// directory read by hand and node:zlib's inflateRaw, which is all these two
// formats ever use. Nothing here keeps a file.
import { inflateRawSync } from "node:zlib";

/** What the first bytes of a file say it is, or null when they say nothing. */
export type MagicKind = "pdf" | "zip" | "doc" | "png" | "jpeg" | "gif" | "webp" | "bmp" | "tiff";

/**
 * The kind a file's own bytes name. A zip may be a .docx, an .xlsx or any other
 * zip — see zipHasEntry for which. "doc" is the old binary Office container
 * (Word 97–2003, also old .xls/.ppt), which nothing here can read.
 */
export function sniffFileKind(buf: Buffer): MagicKind | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "zip";
  if (buf.length > 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return "doc";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "png";
  if (buf.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  const four = buf.subarray(0, 4).toString("latin1");
  if (four === "II*\0" || four === "MM\0*") return "tiff";
  // "BM" alone is too weak a signature (a text file may start with it): a real
  // bitmap also has zero reserved bytes and a pixel-data offset inside the file.
  if (buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4d && buf.readUInt32LE(6) === 0 && buf.readUInt32LE(10) >= 26 && buf.readUInt32LE(10) < buf.length) return "bmp";
  return null;
}

export function isImageKind(kind: MagicKind | null): boolean {
  return kind === "png" || kind === "jpeg" || kind === "gif" || kind === "webp" || kind === "bmp" || kind === "tiff";
}

/** Whether a buffer reads as text: fewer than 1% control characters in its first 4 KB. */
export function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 4096);
  if (sample.length === 0) return false;
  let control = 0;
  for (const b of sample) if (b < 9 || (b > 13 && b < 32)) control += 1;
  return control / sample.length < 0.01;
}

// ---------------------------------------------------------------------------
// zip members

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

// A .docx has a few dozen members and a big workbook a few hundred; a zip that
// claims more than this is not a document anybody attaches.
const MAX_ZIP_ENTRIES = 10000;
// A cap on what one member inflates to, so a crafted file can't balloon in memory.
const MAX_INFLATED = 20 * 1024 * 1024;

/** The zip's central directory, or null when the buffer isn't a zip that can be walked. */
function centralDirectory(buf: Buffer): ZipEntry[] | null {
  try {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return null;
    const count = Math.min(buf.readUInt16LE(eocd + 10), MAX_ZIP_ENTRIES);
    let p = buf.readUInt32LE(eocd + 16);
    const entries: ZipEntry[] = [];
    for (let n = 0; n < count; n++) {
      // A damaged directory keeps the members read before the damage.
      if (buf.readUInt32LE(p) !== 0x02014b50) break;
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      entries.push({
        name: buf.subarray(p + 46, p + 46 + nameLen).toString("utf8"),
        method: buf.readUInt16LE(p + 10),
        compressedSize: buf.readUInt32LE(p + 20),
        localOffset: buf.readUInt32LE(p + 42),
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } catch {
    return null;
  }
}

/** Whether the zip has a member of exactly this name (nothing is inflated). */
export function zipHasEntry(buf: Buffer, wanted: string): boolean {
  return centralDirectory(buf)?.some((e) => e.name === wanted) ?? false;
}

/** The names of the zip's members, in directory order (empty when it isn't a zip). */
export function listZipEntries(buf: Buffer): string[] {
  return centralDirectory(buf)?.map((e) => e.name) ?? [];
}

/** One member of a zip (a .docx or .xlsx) — found in the central directory, read at its local entry, inflated. Null when absent or unreadable. */
export function readZipEntry(buf: Buffer, wanted: string): Buffer | null {
  try {
    const entry = centralDirectory(buf)?.find((e) => e.name === wanted);
    if (!entry) return null;
    const { localOffset, compressedSize, method } = entry;
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const data = buf.subarray(start, start + compressedSize);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_INFLATED });
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Office XML → text

/** The five XML entities and numeric character references, decoded. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Word's document.xml as plain text: a line per paragraph, a tab per table cell, tabs and breaks kept. */
export function docxText(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<[^>]+>/g, "")
  );
}
