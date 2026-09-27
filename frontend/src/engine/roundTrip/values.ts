// A VALUE READ BACK FROM A FILE, TURNED INTO THE RECORD'S DATA (REQUIREMENTS §81).
//
// What a person types into Excel or Word is not what the record stores: "1,234.5"
// is 1234.5, "01/10/2026" and an Excel date serial are both "2026-10-01", "y",
// "✓" and "હા" are all "Yes", an option may be written as its label. Each kind of
// bound value (engine/roundTrip/bindPath.ts BindType) is parsed here, and shown
// back the way the record view shows it, so the preview says "Was 12.5 → Now 13".

import { formatDisplayDate, MONTH_NAMES } from "../../utils/date";
import { serialToIso } from "../../utils/xlsx";
import type { BindOption, BindType } from "./bindPath";
import type { UploadedValue } from "./readFile";

export type Parsed = { ok: true; value: unknown; display: string } | { ok: false; why: string };

const ok = (value: unknown, display: string): Parsed => ({ ok: true, value, display });
const bad = (why: string): Parsed => ({ ok: false, why });

/** Gujarati (and Devanagari) digits as ASCII ones. */
export function asciiDigits(s: string): string {
  return s.replace(/[૦-૯०-९]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x0ae6 ? code - 0x0ae6 : code - 0x0966);
  });
}

const quoteOf = (s: string) => `‘${s.length > 60 ? `${s.slice(0, 57)}…` : s}’`;

const pad2 = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// numbers

const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const GROUPED_RE = /^[+-]?\d{1,3}(?:,\d{2,3})+(?:\.\d+)?$/;

/** A number read back: Excel's float noise rounded to 6 decimals; null for empty; undefined when it is not a number. */
export function readNumber(v: UploadedValue): number | null | undefined {
  if (typeof v.number === "number" && Number.isFinite(v.number) && !v.isDate) return round6(v.number);
  let s = asciiDigits(v.text ?? "")
    .replace(/[\s  ]+/g, "")
    .replace(/[−‒–]/g, "-");
  if (s === "") return null;
  if (GROUPED_RE.test(s)) s = s.replace(/,/g, "");
  if (!NUMBER_RE.test(s)) {
    if (typeof v.number === "number" && Number.isFinite(v.number)) return round6(v.number);
    return undefined;
  }
  const n = Number(s);
  return Number.isFinite(n) ? round6(n) : undefined;
}

export function round6(n: number): number {
  const r = Number(n.toFixed(6));
  return Object.is(r, -0) ? 0 : r;
}

// ---------------------------------------------------------------------------
// dates

const MONTHS = MONTH_NAMES.map((m) => m.toLowerCase());

function monthOf(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return -1;
  if (w === "sept") return 8;
  return MONTHS.findIndex((m) => m === w || m.slice(0, 3) === w);
}

function isoOf(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > days || y < 1900 || y > 2200) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const fullYear = (y: string, today: string) => {
  if (y.length === 4) return Number(y);
  const n = Number(y);
  const century = Math.floor(Number(today.slice(0, 4) || "2000") / 100) * 100;
  return century + n;
};

/** An Excel date serial that plausibly is one (1954–2119), as ISO. */
function serialDate(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  return serialToIso(n);
}

/** A date read back as ISO "YYYY-MM-DD"; "" for empty; null when it is not a date. */
export function readDate(v: UploadedValue, today: string): string | null {
  if (v.isDate && typeof v.serial === "number") {
    const iso = serialToIso(v.serial);
    if (iso) return iso;
  }
  if (typeof v.number === "number" && !v.isDate) {
    const iso = serialDate(v.number);
    if (iso) return iso;
  }
  const s = asciiDigits(v.text ?? "")
    .replace(/[  ]/g, " ")
    .trim();
  if (s === "") return "";
  const year = today.slice(0, 4);
  let m: RegExpExecArray | null;
  // 2026-10-01, 2026/10/01, 2026-10-01T00:00:00
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s))) return isoOf(+m[1], +m[2], +m[3]);
  // 01-Oct-2026, 1 October 2026, 01-Oct-26, 01 Oct (this year), 01-Oct-2026 10:30
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[-\s/.,]+([A-Za-z]{3,9}\.?)(?:[-\s/.,]+(\d{4}|\d{2}))?(?:\s+\d{1,2}:\d{2}.*)?$/.exec(s))) {
    const month = monthOf(m[2]);
    return month === -1 ? null : isoOf(m[3] ? fullYear(m[3], today) : +year, month + 1, +m[1]);
  }
  // Oct 1, 2026 · October 01 2026
  if ((m = /^([A-Za-z]{3,9}\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}|\d{2}))?$/.exec(s))) {
    const month = monthOf(m[1]);
    return month === -1 ? null : isoOf(m[3] ? fullYear(m[3], today) : +year, month + 1, +m[2]);
  }
  // 01/10/2026, 01-10-2026, 1.10.2026, 01/10/26 — the day first, as India writes it
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:\s+\d{1,2}:\d{2}.*)?$/.exec(s))) return isoOf(fullYear(m[3], today), +m[2], +m[1]);
  // 01/10 (this year)
  if ((m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(s))) return isoOf(+year, +m[2], +m[1]);
  // a serial typed as text
  if (/^\d{5}(?:\.\d+)?$/.test(s)) return serialDate(Number(s));
  return null;
}

// ---------------------------------------------------------------------------
// times

/** A time of day read back as "HH:MM" (24-hour); "" for empty; null when it is not a time. */
export function readTime(v: UploadedValue): string | null {
  if (typeof v.number === "number" && Number.isFinite(v.number) && v.number >= 0) {
    const frac = v.number - Math.floor(v.number);
    let minutes = Math.round(frac * 1440);
    if (minutes >= 1440) minutes = 0;
    return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
  }
  const s = asciiDigits(v.text ?? "")
    .replace(/[  ]/g, " ")
    .trim()
    .toLowerCase();
  if (s === "") return "";
  let m: RegExpExecArray | null;
  const build = (h: number, min: number, half?: string): string | null => {
    if (!Number.isInteger(h) || !Number.isInteger(min) || min < 0 || min > 59) return null;
    if (half) {
      if (h < 1 || h > 12) return null;
      if (half.startsWith("a")) h = h === 12 ? 0 : h;
      else h = h === 12 ? 12 : h + 12;
    } else if (h < 0 || h > 24 || (h === 24 && min > 0)) return null;
    if (h === 24) h = 0;
    return `${pad2(h)}:${pad2(min)}`;
  };
  const HALF = "(a\\.?m\\.?|p\\.?m\\.?)";
  if ((m = new RegExp(`^(\\d{1,2})[:.](\\d{2})(?::\\d{2}(?:\\.\\d+)?)?\\s*${HALF}?$`).exec(s))) {
    const t = build(+m[1], +m[2], m[3]);
    // "0.75" is no time on a clock; as a fraction of a day it is 18:00.
    if (t !== null || !/^0?\.\d+$/.test(s)) return t;
  }
  if ((m = new RegExp(`^(\\d{1,2})\\s*${HALF}$`).exec(s))) return build(+m[1], 0, m[2]);
  if ((m = /^(\d{1,2})(\d{2})$/.exec(s))) return build(+m[1], +m[2]);
  if ((m = /^\d{4}-\d{2}-\d{2}[t\s](\d{1,2}):(\d{2})/.exec(s))) return build(+m[1], +m[2]);
  if ((m = /^0?\.\d+$/.exec(s))) return readTime({ text: "", number: Number(s) });
  return null;
}

// ---------------------------------------------------------------------------
// ticks and yes/no

const TRUE_WORDS = new Set(["☑", "☒", "✓", "✔", "✅", "x", "yes", "y", "true", "1", "હા", "ha", "haa"]);
const FALSE_WORDS = new Set(["☐", "", "no", "n", "false", "0", "ના", "✗", "✘", "❌"]);

const tickKey = (s: string) =>
  asciiDigits(s ?? "")
    .replace(/[\s  ]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");

/** A tick or a yes/no read back: true, false, or undefined when it is neither. */
export function readTick(v: UploadedValue): boolean | undefined {
  if (typeof v.bool === "boolean") return v.bool;
  const k = tickKey(v.text);
  if (TRUE_WORDS.has(k)) return true;
  if (FALSE_WORDS.has(k)) return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// choices

const choiceKey = (s: string) => (s ?? "").normalize("NFC").toLowerCase().replace(/[\s  ]+/g, "");

export function findOption(options: readonly BindOption[], text: string): BindOption | undefined {
  const k = choiceKey(text);
  if (!k) return undefined;
  return options.find((o) => choiceKey(o.value) === k) ?? options.find((o) => choiceKey(o.label) === k);
}

function choicesList(options: readonly BindOption[]): string {
  const labels = options.map((o) => o.label || o.value).filter(Boolean);
  const shown = labels.slice(0, 12).join(", ");
  return labels.length > 12 ? `${shown} …` : shown;
}

// ---------------------------------------------------------------------------
// the value, by kind

/** A value read from a file, turned into the value the record stores at a path of this kind. */
export function parseUploadedValue(v: UploadedValue, type: BindType, options: BindOption[], today: string): Parsed {
  const raw = (v.text ?? "").replace(/\r\n?/g, "\n");
  switch (type) {
    case "text": {
      // One line: a line break, a tab or a run of spaces typed into it is one space.
      const text = raw.replace(/\s+/g, " ").trim();
      return ok(text, text);
    }
    case "paragraph": {
      const text = raw
        .split("\n")
        .map((line) => line.replace(/[ \t ]+$/g, ""))
        .join("\n")
        .replace(/^\s*\n/, "")
        .trim();
      return ok(text, text);
    }
    case "number": {
      const n = readNumber(v);
      if (n === undefined) return bad(`${quoteOf(raw.trim())} is not a number.`);
      return ok(n, n === null ? "" : String(n));
    }
    case "date": {
      const iso = readDate(v, today);
      if (iso === null) return bad(`${quoteOf(raw.trim())} is not a date — write it like 01-Oct-2026.`);
      return ok(iso, iso ? formatDisplayDate(iso) : "");
    }
    case "time": {
      const t = readTime(v);
      if (t === null) return bad(`${quoteOf(raw.trim())} is not a time — write it like 14:30.`);
      return ok(t, t);
    }
    case "yesno": {
      if (!raw.trim() && typeof v.bool !== "boolean") return ok("", "");
      const tick = readTick(v);
      if (tick !== undefined) return ok(tick ? "Yes" : "No", tick ? "Yes" : "No");
      const option = findOption(options, raw);
      if (option) return ok(option.value, option.label || option.value);
      return bad(`${quoteOf(raw.trim())} is not Yes or No.`);
    }
    case "select": {
      const text = raw.replace(/\s*\n\s*/g, " ").trim();
      if (!text) return ok("", "");
      if (options.length === 0) return ok(text, text);
      const option = findOption(options, text);
      if (option) return ok(option.value, option.label || option.value);
      return bad(`${quoteOf(text)} is not one of the choices: ${choicesList(options)}.`);
    }
    case "bool": {
      const tick = readTick(v);
      if (tick === undefined) return bad(`${quoteOf(raw.trim())} is not a tick — write ☑ (or Yes) for ticked and leave it empty (or ☐) for not.`);
      return ok(tick, tick ? "☑" : "☐");
    }
  }
}

/** A value of the record as the preview shows it ("Was"). */
export function displayValue(value: unknown, type: BindType, options: readonly BindOption[] = []): string {
  if (value === undefined || value === null) return "";
  switch (type) {
    case "bool":
      return value === true || value === "true" || value === "Yes" ? "☑" : "☐";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDisplayDate(value) : String(value);
    case "number":
      return typeof value === "number" ? String(round6(value)) : String(value);
    case "select":
    case "yesno": {
      const s = String(value);
      const o = options.find((x) => x.value === s);
      return o ? o.label || o.value : s;
    }
    default:
      return typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

/** Whether the record already holds this value (so writing it would change nothing). */
export function sameStored(current: unknown, next: unknown, type: BindType): boolean {
  const empty = (x: unknown) => x === undefined || x === null || x === "";
  if (empty(current) && empty(next)) return true;
  switch (type) {
    case "number": {
      const a = typeof current === "number" ? current : typeof current === "string" && current.trim() !== "" ? Number(current) : NaN;
      return typeof next === "number" && Number.isFinite(a) && Math.abs(a - next) <= 1e-6;
    }
    case "bool":
      return (current === true || current === "true") === next;
    case "text":
    case "paragraph":
      return typeof current === "string" && typeof next === "string" && current.replace(/\r\n?/g, "\n").trim() === next;
    default:
      return String(current ?? "") === String(next ?? "");
  }
}
