// THE WORDS A RECORD TYPED OVER ON ITS HR PAPER, IN THE COMPANY'S OWN WORD AND EXCEL FILE (REQUIREMENTS §275). The paper keeps a
// record's words by their place on the paper (LogSheetRecordView "paper:<place>"). The filler writes the record's boxes into
// the company's file; this then changes the file's printed words the record changed, wherever the file prints them - a
// heading a file repeats on every page changes on every page. A word the file does not hold is left: nothing is added.

import type { PaperTable } from "../../data/seed/qcPaperTables";
import { unzip, zipStored } from "../xlsx";

export interface PaperWordEdit {
  from: string;
  to: string;
}

/** Every printed word of the paper by its place, as components/records/PaperTableSheet.tsx numbers them. */
export function paperWordsOf(form: PaperTable): Map<string, string> {
  const out = new Map<string, string>();
  const foot = form.head.length + form.body.length + (form.lines?.count ?? 0);
  const read = (rows: PaperTable["head"], row0: number) => {
    rows.forEach((row, ri) => {
      row.cells.forEach((c, ci) => {
        const place = c.pl ?? `${row0 + ri}:${ci}`;
        if (c.at) c.at.forEach((line, li) => out.set(`${place}:${li}`, line.t));
        else if (c.sentence) {
          if (c.sentence.before) out.set(`${place}:b`, c.sentence.before);
          if (c.sentence.after) out.set(`${place}:a`, c.sentence.after);
        } else if (c.t) out.set(place, c.t);
      });
    });
  };
  read(form.head, 0);
  read(form.body, form.head.length);
  read(form.foot, foot);
  return out;
}

/** What a record changed of the paper's printed words. */
export function paperWordEdits(form: PaperTable | undefined, headings: Record<string, string> | undefined): PaperWordEdit[] {
  if (!form?.ownWords || !headings) return [];
  const own = paperWordsOf(form);
  const edits: PaperWordEdit[] = [];
  for (const [key, to] of Object.entries(headings)) {
    if (!key.startsWith("paper:")) continue;
    const from = own.get(key.slice(6));
    if (from && from.trim() !== to.trim()) edits.push({ from, to });
  }
  return edits;
}

/** Words a record wrote where its paper prints none (a blank cell, a line's number): its own file has no place for them. */
export function paperWordsWithoutPlace(form: PaperTable | undefined, headings: Record<string, string> | undefined): boolean {
  if (!form?.ownWords || !headings) return false;
  const own = paperWordsOf(form);
  return Object.entries(headings).some(([key, to]) => {
    if (!key.startsWith("paper:") || own.has(key.slice(6))) return false;
    const num = /^paper:num:(\d+)$/.exec(key);
    return to.trim() !== "" && (!num || to.trim() !== String(Number(num[1]) + 1));
  });
}

const same = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();
const unescape = (s: string): string => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
const escape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The words a piece of text reads after the edits, or null where none of them is in it. */
function edited(text: string, edits: PaperWordEdit[]): string | null {
  const whole = edits.find((e) => same(e.from) === same(text));
  if (whole) return whole.to;
  let next = text;
  // (inside a longer line only for words long enough to be that place's and no other's, however the file spaces them)
  for (const e of edits) {
    if (e.from.trim().length < 8) continue;
    const words = e.from.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    next = next.replace(new RegExp(words.join("\\s*"), "gi"), () => e.to.trim());
  }
  return next === text ? null : next;
}

/** Each run of words holding `tag`, written again: the new words in the first, the others emptied. */
function rewrite(block: string, tag: string, edits: PaperWordEdit[]): string {
  const re = new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const texts = [...block.matchAll(re)].map((m) => unescape(m[1]));
  if (texts.length === 0) return block;
  const next = edited(texts.join(""), edits);
  if (next === null) return block;
  let first = true;
  return block.replace(re, () => {
    const out = `<${tag} xml:space="preserve">${first ? escape(next) : ""}</${tag}>`;
    first = false;
    return out;
  });
}

function changedPart(name: string, xml: string, edits: PaperWordEdit[]): string {
  if (/^xl\/sharedStrings\.xml$/.test(name)) return xml.replace(/<si>[\s\S]*?<\/si>/g, (si) => rewrite(si, "t", edits));
  if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) return xml.replace(/<is>[\s\S]*?<\/is>/g, (is) => rewrite(is, "t", edits)).replace(/<c [^>]*t="str"[^>]*>[\s\S]*?<\/c>/g, (c) => (c.includes("<f") ? c : rewrite(c, "v", edits).replace(/<v xml:space="preserve">/g, "<v>")));
  if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) return xml.replace(/<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g, (p) => rewrite(p, "w:t", edits));
  return xml;
}

/** The filled file with the record's own printed words. */
export async function withPaperWords(bytes: Uint8Array<ArrayBuffer>, edits: PaperWordEdit[]): Promise<Uint8Array<ArrayBuffer>> {
  if (edits.length === 0) return bytes;
  const copy = bytes.slice();
  const zip = await unzip(copy.buffer);
  const files: { name: string; data: Uint8Array }[] = [];
  const landed = new Set<PaperWordEdit>();
  for (const [name, get] of zip) {
    if (name.endsWith("/")) continue;
    const data = await get();
    if (!/\.xml$/.test(name)) {
      files.push({ name, data });
      continue;
    }
    const xml = new TextDecoder("utf-8").decode(data);
    const next = changedPart(name, xml, edits);
    for (const e of edits) if (next !== xml && next.includes(escape(e.to.trim()))) landed.add(e);
    files.push({ name, data: next === xml ? data : new TextEncoder().encode(next) });
  }
  // (a word this file does not print: the file would not be the record, so the paper is drawn instead)
  if (landed.size < edits.length) throw new Error("a typed word has no place in the file");
  return zipStored(files);
}
