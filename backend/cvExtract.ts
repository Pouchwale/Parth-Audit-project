// READING A CV / RÉSUMÉ INTO THE NEW-JOINER FORM (REQUIREMENTS §49).
//
// HR uploads a candidate's CV on Personal Competence Records (F/HR/01); this
// reads what the CV states — name, sex and date of birth where written,
// contact, the highest qualification, the experience — so the form comes up
// filled in for HR to check, and from there the person goes onto F/HR/01 and
// the other HR formats that carry the same facts (frontend/src/engine/hrJoiner.ts).
//
// Two readers, and the result is the same shape either way:
//   - TEXT RULES, always: labelled lines ("Date of Birth:", "Gender:"), the
//     e-mail and phone patterns, the qualification ladder (10th … Ph.D), an
//     explicit total experience or the employment periods listed under the
//     experience heading. Deterministic, offline, and enough for most CVs.
//   - THE ASSISTANT (Groq), when configured and not switched off with
//     CV_READ_WITH_ASSISTANT=0: it fills what the rules could not find in a
//     CV laid out some other way. It is told to return only what the CV
//     states, and anything it returns that cannot be found in the CV's own
//     text is dropped — a name, e-mail, employer or position that isn't in the
//     document is a guess, and a guess must not reach a controlled record.
// A rule's value wins over the assistant's wherever both found one: rules
// read a labelled "Date of Birth: 12/03/1998" exactly, a model may reformat it.
//
// Nothing here stores the file or the text; it answers and forgets.

import { inflateRawSync } from "node:zlib";
import { extractText, getDocumentProxy } from "unpdf";
import { groqChatJSON } from "./groq.ts";

export interface CvProfile {
  name: string;
  sex: "" | "Male" | "Female";
  /** YYYY-MM-DD, or "" when the CV doesn't state it. */
  dateOfBirth: string;
  email: string;
  phone: string;
  /** The highest qualification, in the short form the registers use: "MBA", "B.Com", "Diploma", "ITI", "12 Pass". */
  qualification: string;
  /** The CV's own line for that qualification, e.g. "MBA (Finance), Gujarat University, 2021". */
  qualificationDetail: string;
  /** "3 Years", "2.5 Years", "8 Months", "Fresher", or "". */
  experience: string;
  positionAppliedFor: string;
  lastDesignation: string;
  lastEmployer: string;
}

export type CvFileKind = "pdf" | "docx" | "text";

export interface CvReadResult {
  profile: CvProfile;
  fileKind: CvFileKind;
  readBy: "assistant" | "rules";
  /** The fields the CV did not give, left for HR to enter. */
  missing: string[];
  characters: number;
}

/** A CV that can't be read — the message is shown to the person as it is. */
export class CvReadError extends Error {}

export const CV_MAX_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 60000;
const ASSISTANT_TEXT = 12000;

// ---------------------------------------------------------------------------
// the file → its text

function fileKindOf(buf: Buffer, fileName: string): CvFileKind | "doc" | "image" | "unknown" {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "docx";
  if (buf.length > 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return "doc";
  if (
    (buf[0] === 0xff && buf[1] === 0xd8) ||
    (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") ||
    /\.(png|jpe?g|gif|webp|bmp|tiff?|heic)$/i.test(fileName)
  ) {
    return "image";
  }
  if (/\.(txt|text|md)$/i.test(fileName) || looksLikeText(buf)) return "text";
  return "unknown";
}

function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 4096);
  if (sample.length === 0) return false;
  let control = 0;
  for (const b of sample) if (b < 9 || (b > 13 && b < 32)) control += 1;
  return control / sample.length < 0.01;
}

/** One file out of a .docx (a zip) — central directory, then the local entry, inflated. */
function readZipEntry(buf: Buffer, wanted: string): Buffer | null {
  try {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return null;
    const entries = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let n = 0; n < entries; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) return null;
      const method = buf.readUInt16LE(p + 10);
      const compressedSize = buf.readUInt32LE(p + 20);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const localOffset = buf.readUInt32LE(p + 42);
      const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
      if (name === wanted) {
        if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
        const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
        const data = buf.subarray(start, start + compressedSize);
        if (method === 0) return Buffer.from(data);
        // A cap on what inflates, so a crafted file can't balloon in memory.
        if (method === 8) return inflateRawSync(data, { maxOutputLength: 20 * 1024 * 1024 });
        return null;
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function docxText(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<[^>]+>/g, "")
  );
}

async function cvText(buf: Buffer, fileName: string): Promise<{ text: string; fileKind: CvFileKind }> {
  const kind = fileKindOf(buf, fileName);
  if (kind === "doc") throw new CvReadError("This is an old Word (.doc) file, which can't be read here. Save it as .docx or PDF and upload that — or enter the details by hand.");
  if (kind === "image") throw new CvReadError("This is a picture of the CV, which has no text to read. Upload the CV as a PDF or Word (.docx) file — or enter the details by hand.");
  if (kind === "unknown") throw new CvReadError("This file isn't a PDF, Word (.docx) or text file, so it can't be read as a CV.");

  let text = "";
  if (kind === "pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const result = await extractText(pdf, { mergePages: false });
      text = (Array.isArray(result.text) ? result.text : [result.text]).join("\n");
    } catch {
      throw new CvReadError("This PDF couldn't be opened — it may be damaged or password-protected. Upload another copy, or enter the details by hand.");
    }
  } else if (kind === "docx") {
    const xml = readZipEntry(buf, "word/document.xml");
    if (!xml) throw new CvReadError("This file isn't a Word (.docx) document that can be read. Upload the CV as PDF or .docx — or enter the details by hand.");
    text = docxText(xml.toString("utf8"));
  } else {
    text = buf.toString("utf8");
  }

  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \f\v]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_TEXT);
  if (text.replace(/\s/g, "").length < 20) {
    throw new CvReadError("No text could be read from this CV — it looks like a scanned picture saved as PDF. Upload a PDF or Word file with text in it, or enter the details by hand.");
  }
  return { text, fileKind: kind };
}

// ---------------------------------------------------------------------------
// the text → the details, by rules

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");

function realDate(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** A date of birth as a CV writes it — day first, as Indian CVs do — or "". */
export function parseCvDate(raw: string): string {
  const s = raw.trim().replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  const fullYear = (y: string) => (y.length === 2 ? Number(y) + (Number(y) > 30 ? 1900 : 2000) : Number(y));
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(s);
  if (m) return realDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(s);
  if (m) return realDate(fullYear(m[3]), Number(m[2]), Number(m[1]));
  m = /\b(\d{1,2})[\s-]*([a-z]{3,9})\.?[\s,-]*(\d{4})\b/i.exec(s);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return realDate(Number(m[3]), MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, Number(m[1]));
  m = /\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/i.exec(s);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return realDate(Number(m[3]), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, Number(m[2]));
  return "";
}

function plausibleBirthDate(iso: string): string {
  if (!iso) return "";
  const year = Number(iso.slice(0, 4));
  const now = new Date().getFullYear();
  return year >= now - 80 && year <= now - 14 ? iso : "";
}

// The qualification ladder, highest first within a rank the specific degree
// before the generic word. The short forms are the ones the plant's own
// registers write (F/HR/01: "B.Com", "MBA", "Diploma", "ITI", "12 Pass").
const QUALIFICATIONS: { rank: number; canonical: string; pattern: RegExp }[] = [
  { rank: 7, canonical: "Ph.D", pattern: /\bph\.?\s?d\b|\bdoctorate\b/i },
  { rank: 6, canonical: "MBA", pattern: /\bm\.?\s?b\.?\s?a\b/i },
  { rank: 6, canonical: "PGDM", pattern: /\bp\.?\s?g\.?\s?d\.?\s?m\b/i },
  { rank: 6, canonical: "M.Tech", pattern: /\bm\.?\s?tech\b/i },
  { rank: 6, canonical: "MCA", pattern: /\bm\.?\s?c\.?\s?a\b/i },
  { rank: 6, canonical: "M.Com", pattern: /\bm\.?\s?com\b/i },
  { rank: 6, canonical: "M.Sc", pattern: /\bm\.?\s?sc\b/i },
  { rank: 6, canonical: "M.Pharm", pattern: /\bm\.?\s?pharm\b/i },
  { rank: 6, canonical: "M.E", pattern: /\bm\.\s?e\.?(?=[\s,(/]|$)/im },
  { rank: 6, canonical: "M.A", pattern: /\bm\.\s?a\.?(?=[\s,(/]|$)/im },
  { rank: 6, canonical: "Post Graduate", pattern: /\bpost[\s-]*graduat|\bmaster'?s?\s+(?:degree|of)\b/i },
  { rank: 5, canonical: "B.Tech", pattern: /\bb\.?\s?tech\b/i },
  { rank: 5, canonical: "B.Com", pattern: /\bb\.?\s?com\b/i },
  { rank: 5, canonical: "B.Sc", pattern: /\bb\.?\s?sc\b/i },
  { rank: 5, canonical: "BBA", pattern: /\bb\.?\s?b\.?\s?a\b/i },
  { rank: 5, canonical: "BCA", pattern: /\bb\.?\s?c\.?\s?a\b/i },
  { rank: 5, canonical: "B.Pharm", pattern: /\bb\.?\s?pharm\b/i },
  { rank: 5, canonical: "B.E", pattern: /\bb\.\s?e\.?(?=[\s,(/]|$)/im },
  { rank: 5, canonical: "B.A", pattern: /\bb\.\s?a\.?(?=[\s,(/]|$)/im },
  { rank: 5, canonical: "Graduate", pattern: /\bgraduat(?:e|ion)\b|\bbachelor'?s?\b/i },
  { rank: 4, canonical: "Diploma", pattern: /\bdiploma\b/i },
  { rank: 3, canonical: "ITI", pattern: /\bi\.?\s?t\.?\s?i\b/i },
  { rank: 2, canonical: "12 Pass", pattern: /\b(?:12th|xiith|h\.?\s?s\.?\s?c|higher\s+secondary|12\s*(?:pass|std|standard))\b/i },
  { rank: 1, canonical: "10 Pass", pattern: /\b(?:10th|s\.?\s?s\.?\s?c|secondary\s+school|10\s*(?:pass|std|standard)|matriculation)\b/i },
];

/** The highest qualification a piece of text names, and the line it is on. */
export function highestQualification(text: string): { canonical: string; rank: number; line: string } | null {
  let best: { canonical: string; rank: number; line: string } | null = null;
  const lines = text.split("\n");
  for (const q of QUALIFICATIONS) {
    if (best && q.rank <= best.rank) continue;
    const line = lines.find((l) => q.pattern.test(l));
    if (line) best = { canonical: q.canonical, rank: q.rank, line: line.slice(0, 140) };
  }
  return best;
}

function formatYears(months: number): string {
  if (months <= 0) return "";
  if (months < 12) return `${months} Month${months === 1 ? "" : "s"}`;
  const years = Math.round(months / 6) / 2;
  return `${years} Year${years === 1 ? "" : "s"}`;
}

type Section = "work" | "education" | "other" | "none";

function sectionOf(line: string): Section | null {
  if (line.length > 45) return null;
  const l = line.toLowerCase().replace(/[:\-–|]+$/, "").trim();
  if (/^(?:work|professional|employment|job|career)?\s*(?:experience|history|background|details)(?:\s*details)?$|^employment|^work history|^experience/.test(l)) return "work";
  if (/^(?:educational|academic)?\s*(?:qualifications?|education|details)$|^education|^academic/.test(l)) return "education";
  if (/^(?:skills?|key skills|technical skills|projects?|personal|personal details|declaration|hobbies|languages?|certifications?|strengths|objective|career objective|summary|profile|references?)\b/.test(l)) return "other";
  return null;
}

function monthIndex(word: string): number {
  return MONTHS.indexOf(word.slice(0, 3).toLowerCase());
}

/** Months worked, from the periods listed under the experience heading (overlaps counted once). */
function monthsFromPeriods(lines: string[], today: Date): number {
  let section: Section = "none";
  const spans: [number, number][] = [];
  const nowIndex = today.getFullYear() * 12 + today.getMonth();
  // Four-digit years first, and never part of a longer number: "Feb 2022" is
  // 2022, not "Feb 20" followed by a stray "22".
  const range = /([a-z]{3,9})\.?\s*['’]?(\d{4}|\d{2})(?!\d)\s*(?:-|–|—|to|till)\s*(present|current|till\s*date|to\s*date|date|now|([a-z]{3,9})\.?\s*['’]?(\d{4}|\d{2})(?!\d))/gi;
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  for (const line of lines) {
    const heading = sectionOf(line);
    if (heading) {
      section = heading;
      continue;
    }
    if (section !== "work") continue;
    for (const m of line.matchAll(range)) {
      const fromMonth = monthIndex(m[1]);
      if (fromMonth < 0) continue;
      const from = year(m[2]) * 12 + fromMonth;
      let to = nowIndex;
      if (m[4]) {
        const toMonth = monthIndex(m[4]);
        if (toMonth < 0) continue;
        to = year(m[5]) * 12 + toMonth;
      }
      if (to >= from && to <= nowIndex + 1 && from > nowIndex - 50 * 12) spans.push([from, to + 1]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const s of spans) {
    if (!cur || s[0] > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [s[0], s[1]];
    } else cur[1] = Math.max(cur[1], s[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

function titleCase(s: string): string {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : s;
}

const NOT_A_NAME = /resume|résumé|curriculum|vitae|\bcv\b|bio-?data|profile|objective|contact|address|e-?mail|phone|mobile|summary|details|experience|education|skills|declaration|@|\d/i;

interface RuleRead {
  profile: CvProfile;
  /** true when the name came from a "Name:" line rather than a guess at the heading. */
  nameLabelled: boolean;
  /** true when the CV states its total experience outright. */
  experienceStated: boolean;
  experienceFromPeriods: string;
}

export function readCvByRules(text: string, today = new Date()): RuleRead {
  const lines = text.split("\n");
  // A line often carries several "Label: value" pairs — "Email: … | Phone: …".
  const segments = lines.flatMap((l) => l.split(/\s+[|•·]\s+|\t+/)).map((s) => s.trim()).filter(Boolean);
  const labelled = (label: RegExp): string => {
    for (const seg of segments) {
      const m = new RegExp(`^(?:${label.source})\\s*[:\\-–]\\s*(.+)$`, "i").exec(seg);
      if (m && m[1].trim()) return m[1].trim();
    }
    return "";
  };

  let name = labelled(/full\s*name|name|candidate'?s?\s*name|applicant'?s?\s*name/);
  const nameLabelled = !!name;
  if (!name) {
    const candidate = lines.slice(0, 6).find((l) => !NOT_A_NAME.test(l) && /^[A-Za-z][A-Za-z.' ]{2,48}$/.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 5);
    name = candidate ?? "";
  }
  name = titleCase(name.replace(/\s{2,}/g, " ").trim()).slice(0, 60);

  const sexRaw = labelled(/gender|sex/);
  const sex: CvProfile["sex"] = /^f/i.test(sexRaw) ? "Female" : /^m/i.test(sexRaw) ? "Male" : "";

  const dateOfBirth = plausibleBirthDate(parseCvDate(labelled(/date\s*of\s*birth|d\.?\s*o\.?\s*b\.?|birth\s*date|born(?:\s*on)?/)));

  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0] ?? "";
  const phone = /(?:\+?91[\s-]*)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/.exec(text)?.[0]?.trim() ?? "";

  const q = highestQualification(text);

  let experience = "";
  let experienceStated = false;
  const stated =
    /(?:total|overall)?\s*(?:work|professional|industry)?\s*experience\s*(?:of)?\s*[:\-–]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*\+?\s*(years?|yrs?|months?)/i.exec(text) ??
    /(\d{1,2}(?:\.\d{1,2})?)\s*\+?\s*(years?|yrs?|months?)\s*(?:of\s*)?(?:total\s*|overall\s*|work\s*|professional\s*|industry\s*|relevant\s*)?experience/i.exec(text);
  if (stated) {
    const n = Number(stated[1]);
    const months = /^m/i.test(stated[2]) ? Math.round(n) : Math.round(n * 12);
    experience = formatYears(months);
    experienceStated = !!experience;
  }
  const experienceFromPeriods = formatYears(monthsFromPeriods(lines, today));
  if (!experience && /\bfresher\b/i.test(text)) experience = "Fresher";

  return {
    profile: {
      name,
      sex,
      dateOfBirth,
      email,
      phone,
      qualification: q?.canonical ?? "",
      qualificationDetail: q?.line ?? "",
      experience,
      positionAppliedFor: labelled(/(?:position|post|job|role)\s*applied\s*(?:for)?|applying\s*for(?:\s*the\s*(?:post|position|role)\s*of)?/).slice(0, 80),
      lastDesignation: labelled(/current\s*designation|designation|present\s*designation/).slice(0, 80),
      lastEmployer: labelled(/current\s*(?:employer|company|organi[sz]ation)|present\s*(?:employer|company)|employer|company\s*name/).slice(0, 80),
    },
    nameLabelled,
    experienceStated,
    experienceFromPeriods,
  };
}

// ---------------------------------------------------------------------------
// the assistant, for what the rules could not find

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function statedIn(text: string, value: unknown, max = 80): string {
  if (typeof value !== "string") return "";
  const v = value.replace(/\s+/g, " ").trim();
  if (!v || v.length > max) return "";
  return squash(text).includes(squash(v)) ? v : "";
}

async function readCvWithAssistant(text: string): Promise<Partial<CvProfile> & { experienceYears?: number | null; fresher?: boolean }> {
  const system = [
    "You read one job applicant's CV / résumé for an HR department and return ONLY the facts the CV itself states, as a JSON object with exactly these keys:",
    '{ "name": string|null, "sex": "Male"|"Female"|null, "dateOfBirth": "YYYY-MM-DD"|null, "email": string|null, "phone": string|null,',
    '  "highestQualification": string|null, "totalExperienceYears": number|null, "fresher": boolean,',
    '  "lastDesignation": string|null, "lastEmployer": string|null, "positionAppliedFor": string|null }',
    "Rules: never guess and never infer — null when the CV does not say it. Copy names, designations and employers exactly as written.",
    "sex only from an explicit Gender / Sex line, never from the person's name. Dates in Indian CVs are day first (12/03/1998 is 12 March 1998).",
    "highestQualification: the highest degree, diploma or school level the CV names, in its short form (MBA, B.Com, B.E, Diploma, ITI, 12th, 10th).",
    "totalExperienceYears: the total the CV states, or else the sum of the employment periods it lists (not education), to one decimal; null if neither. fresher: true only if the CV says so.",
  ].join("\n");
  const raw = (await groqChatJSON({ system, user: text.slice(0, ASSISTANT_TEXT), temperature: 0 })) as Record<string, unknown>;
  const out: Partial<CvProfile> & { experienceYears?: number | null; fresher?: boolean } = {};
  out.name = titleCase(statedIn(text, raw.name, 60));
  out.sex = raw.sex === "Male" || raw.sex === "Female" ? raw.sex : "";
  out.dateOfBirth = typeof raw.dateOfBirth === "string" ? plausibleBirthDate(parseCvDate(raw.dateOfBirth)) : "";
  out.email = statedIn(text, raw.email);
  const phoneDigits = typeof raw.phone === "string" ? raw.phone.replace(/\D/g, "") : "";
  out.phone = phoneDigits.length >= 10 && text.replace(/\D/g, "").includes(phoneDigits.slice(-10)) ? String(raw.phone).trim() : "";
  if (typeof raw.highestQualification === "string" && raw.highestQualification.trim()) {
    const q = highestQualification(raw.highestQualification);
    out.qualification = q?.canonical ?? statedIn(text, raw.highestQualification, 40);
  }
  const years = typeof raw.totalExperienceYears === "number" && raw.totalExperienceYears >= 0 && raw.totalExperienceYears <= 50 ? raw.totalExperienceYears : null;
  out.experienceYears = years;
  out.fresher = raw.fresher === true;
  out.lastDesignation = statedIn(text, raw.lastDesignation);
  out.lastEmployer = statedIn(text, raw.lastEmployer);
  out.positionAppliedFor = statedIn(text, raw.positionAppliedFor);
  return out;
}

// ---------------------------------------------------------------------------

export async function readCv(buf: Buffer, fileName: string, opts: { useAssistant: boolean }): Promise<CvReadResult> {
  if (buf.length > CV_MAX_BYTES) throw new CvReadError("The CV file is larger than 5 MB.");
  const { text, fileKind } = await cvText(buf, fileName);
  const rules = readCvByRules(text);
  const profile: CvProfile = { ...rules.profile };
  let readBy: CvReadResult["readBy"] = "rules";

  if (opts.useAssistant) {
    try {
      const a = await readCvWithAssistant(text);
      readBy = "assistant";
      if (!rules.nameLabelled && a.name) profile.name = a.name;
      if (!profile.sex && a.sex) profile.sex = a.sex;
      if (!profile.dateOfBirth && a.dateOfBirth) profile.dateOfBirth = a.dateOfBirth;
      if (!profile.email && a.email) profile.email = a.email;
      if (!profile.phone && a.phone) profile.phone = a.phone;
      if (!profile.qualification && a.qualification) profile.qualification = a.qualification;
      if (!rules.experienceStated) {
        if (a.experienceYears !== null && a.experienceYears !== undefined && a.experienceYears > 0) profile.experience = formatYears(Math.round(a.experienceYears * 12));
        else if (a.fresher && !rules.experienceFromPeriods) profile.experience = "Fresher";
      }
      for (const key of ["lastDesignation", "lastEmployer", "positionAppliedFor"] as const) {
        if (!profile[key] && a[key]) profile[key] = a[key] as string;
      }
    } catch (err) {
      // The rules have already read the CV; an assistant outage only means
      // fewer gaps get filled.
      console.error("CV read: assistant unavailable —", err instanceof Error ? err.message : err);
    }
  }
  if (!profile.experience && rules.experienceFromPeriods) profile.experience = rules.experienceFromPeriods;

  const missing = (
    [
      ["name", "Name"],
      ["qualification", "Education"],
      ["experience", "Experience"],
      ["dateOfBirth", "Date of Birth"],
      ["sex", "Sex"],
    ] as const
  )
    .filter(([key]) => !profile[key])
    .map(([, label]) => label);

  return { profile, fileKind, readBy, missing, characters: text.length };
}
