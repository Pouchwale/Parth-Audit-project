import type { Cell, ExportBlock, PaperCellSpec } from "./documentExport";
import { wrappedHeight } from "./calibrationExcel";

// F/HR/17 - THE DAILY PEST CONTROL MONITORING REGISTER, DOWNLOADED AS WORD AND AS EXCEL AS ITS PAGES ARE DRAWN (the owner,
// 31-Oct-2026: "in hr/17 the excel and word both preview is not proper make that proper also"). The register on the page
// (components/records/DailyRegisterSheet.tsx) is three A4 portrait pages, each under its header box (the company, the
// title underlined, the FORMAT NO. / REV NO. / REV DATE / PAGE NO. band): page 1 the instructions and the ten check
// points, numbered; page 2 the days 1-19; page 3 the days 20-31, the notes and the SUMMARY OF ACTIONS TAKEN. The grid's
// headings are shaded; DATE, TIME OF CHECKING and CHECKER stand down both heading rows and the CHECK POINTS heading
// across the ten; a closed day is H O L I D A Y across the ten. The words and bound values are the page's, so a file
// edited in Word or Excel reads back as every download does. A single day's record is not this page and downloads as before.

export const DAILY_PEST = "daily-pest-monitoring";
/** The register's page margins (pt): the 12 mm the page prints with. */
export const REGISTER_MARGINS = { top: 34, right: 34, bottom: 34, left: 34 };

const WIDTH = 527; // A4 portrait less its 12 mm margins, in points
const ARIAL = "Arial";
const HAIR = 4; // half a point, in eighths
const NONE: PaperCellSpec["borders"] = [0, 0, 0, 0];
const SHADE = "#D9D9D9"; // the page's grey headings
const GRID = [34, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 82, 91];
const SUMMARY = [80, 236, 136, 75];
type Text = Extract<ExportBlock, { kind: "text" }>;
type Table = Extract<ExportBlock, { kind: "table" }>;
type Paper = Extract<ExportBlock, { kind: "paper" }>;
type Row = Paper["rows"][number];

const text = (c: Cell | undefined): string => (c?.text ?? "").trim();
const isTitle = (b: ExportBlock | undefined): b is Text => b?.kind === "text" && !!b.title;
const isGrid = (b: ExportBlock): b is Table => b.kind === "table" && !b.band && /^Check points/i.test(text(b.rows[0]?.[1]));
const isSummary = (b: ExportBlock): b is Table => b.kind === "table" && !b.band && /^Date of observation/i.test(text(b.rows[0]?.[0]));

function cell(c: Cell | undefined, size: number, bold: boolean, align: PaperCellSpec["align"], valign: PaperCellSpec["valign"], more: Partial<PaperCellSpec> = {}): PaperCellSpec {
  return { ...(c ?? { text: "" }), size, bold, align, valign, font: ARIAL, borders: [HAIR, HAIR, HAIR, HAIR], ...more };
}

/** The header box every page stands under: the company, the title (underlined), the band of four, each its words over its value. */
function header(company: string, title: string, band: Cell[], first: boolean): Paper {
  const quarter = WIDTH / 4;
  const pairs: Cell[] = [];
  for (let i = 0; i + 1 < band.length && pairs.length < 4; i += 2) {
    const label = `${text(band[i]).toUpperCase()}\n`;
    const v = band[i + 1] ?? { text: "" };
    pairs.push({ text: `${label}${v.text}`, ...(v.parts ? { parts: [{ text: label }, ...v.parts] } : {}) });
  }
  const rows: Row[] = [
    { height: 24, cells: [cell({ text: company }, 22, true, "center", "center", { colSpan: 4 })] },
    { height: 22, cells: [cell({ text: title }, 18, true, "center", "center", { colSpan: 4, underline: true })] },
  ];
  if (pairs.length) rows.push({ height: 26, cells: pairs.map((p) => cell(p, 14, false, "left", "top")) });
  return { kind: "paper", widths: pairs.length ? pairs.map(() => quarter) : [WIDTH], rows, spaceAfter: 8, ...(first ? {} : { pageBreakBefore: true }) };
}

/** Lines of words without rules: each as tall as it wraps. */
function words(lines: { text: string; bold: boolean; size: number }[]): Paper {
  return {
    kind: "paper",
    widths: [WIDTH],
    rows: lines.map((l) => ({ height: Math.round(wrappedHeight(l.text, WIDTH, l.size, 0.46) * 4) / 4, cells: [cell({ text: l.text }, l.size, l.bold, "left", "top", { borders: NONE })] })),
    spaceAfter: 4,
  };
}

/** The day grid: DATE, the ten check points, TIME OF CHECKING, CHECKER; a closed day H O L I D A Y across the ten. */
function grid(table: Table): Paper {
  const head = table.rows[0] ?? [];
  const shaded = { fill: SHADE };
  const rows: Row[] = [
    {
      height: 16,
      cells: [
        cell({ text: text(head[0]).toUpperCase() }, 14, true, "center", "center", { ...shaded, vMerge: "restart" }),
        cell({ text: text(head[1]).toUpperCase() }, 14, true, "left", "center", { ...shaded, colSpan: 10 }),
        cell({ text: text(head[11]).toUpperCase() }, 14, true, "center", "center", { ...shaded, vMerge: "restart" }),
        cell({ text: text(head[12]).toUpperCase() }, 14, true, "center", "center", { ...shaded, vMerge: "restart" }),
      ],
    },
    {
      height: 16,
      cells: [
        cell({ text: "" }, 14, true, "center", "center", { ...shaded, vMerge: "continue" }),
        ...Array.from({ length: 10 }, (_, k) => cell(table.rows[1]?.[k + 1], 14, true, "center", "center", shaded)),
        cell({ text: "" }, 14, true, "center", "center", { ...shaded, vMerge: "continue" }),
        cell({ text: "" }, 14, true, "center", "center", { ...shaded, vMerge: "continue" }),
      ],
    },
  ];
  for (const r of table.rows.slice(Math.max(2, table.headerRows))) {
    const row = Array.from({ length: 13 }, (_, i) => r[i] ?? { text: "" });
    const holiday = /^H\s*O\s*L\s*I\s*D\s*A\s*Y$/i.test(text(row[1])) && row.slice(2, 11).every((c) => !text(c));
    const checks = holiday
      ? [cell({ text: "H O L I D A Y" }, 16, true, "center", "center", { colSpan: 10 })]
      : row.slice(1, 11).map((c) => cell(c, 16, false, "center", "center"));
    const cells = [cell(row[0], 16, true, "right", "center"), ...checks, cell(row[11], 16, false, "center", "center"), cell(row[12], 16, false, "center", "center")];
    const tall = Math.max(22, wrappedHeight(text(row[12]), GRID[12], 16), wrappedHeight(text(row[11]), GRID[11], 16));
    rows.push({ height: Math.round(tall * 4) / 4, cells });
  }
  return { kind: "paper", widths: GRID, rows, spaceAfter: 6 };
}

/** The SUMMARY OF ACTIONS TAKEN IF PEST OBSERVED: its shaded heading over the table. */
function summary(heading: string, table: Table | undefined): Paper[] {
  const out: Paper[] = [{ kind: "paper", widths: [WIDTH], rows: [{ height: 20, cells: [cell({ text: heading }, 16, true, "left", "center", { fill: SHADE })] }], spaceAfter: 1 }];
  if (!table) return out;
  const rows: Row[] = [{ height: 26, cells: SUMMARY.map((_, i) => cell({ text: text(table.rows[0]?.[i]).toUpperCase() }, 14, true, "left", "center", { fill: SHADE })) }];
  for (const r of table.rows.slice(Math.max(1, table.headerRows))) {
    const row = SUMMARY.map((_, i) => r[i] ?? { text: "" });
    const tall = Math.max(20, ...row.map((c, i) => wrappedHeight(text(c), SUMMARY[i], 16)));
    rows.push({ height: Math.round(tall * 4) / 4, cells: row.map((c) => cell(c, 16, false, "left", "center")) });
  }
  out.push({ kind: "paper", widths: SUMMARY, rows, spaceAfter: 4 });
  return out;
}

/** The register's pages as Word tables, or null where the blocks are not the monthly register (a single day's record). */
export function dailyPestRegister(blocks: ExportBlock[]): ExportBlock[] | null {
  if (!blocks.some(isGrid)) return null;
  // A page starts at the company's name followed by the page's title.
  const starts = blocks.flatMap((b, i) => (isTitle(b) && isTitle(blocks[i + 1]) ? [i] : []));
  if (starts.length === 0) return null;
  const out: ExportBlock[] = [];
  starts.forEach((start, p) => {
    const part = blocks.slice(start, starts[p + 1] ?? blocks.length);
    const company = (part[0] as Text).text;
    const title = (part[1] as Text).text;
    const band = part.find((b): b is Table => b.kind === "table" && !!b.band)?.rows[0] ?? [];
    out.push(header(company, title, band, p === 0));
    let lines: { text: string; bold: boolean; size: number }[] = [];
    let numbered = 0;
    const flush = () => {
      if (lines.length) out.push(words(lines));
      lines = [];
    };
    for (let i = 2; i < part.length; i++) {
      const b = part[i];
      if (b.kind === "text") {
        const t = b.text.trim();
        if (!t) continue;
        if (/^SUMMARY OF ACTIONS/i.test(t)) {
          flush();
          const next = part.slice(i + 1).find(isSummary);
          out.push(...summary(t, next));
          if (next) i = part.indexOf(next);
          continue;
        }
        // The ten check points after "Please mention the status ...", numbered as the page numbers them.
        if (numbered > 0 && !b.strong && !t.startsWith("*")) {
          lines.push({ text: `${numbered++}.  ${t}`, bold: false, size: 18 });
          continue;
        }
        lines.push({ text: t, bold: b.strong, size: t.startsWith("*") ? 15 : 18 });
        if (b.strong && /^Please mention/i.test(t)) numbered = 1;
      } else if (isGrid(b)) {
        flush();
        out.push(grid(b));
      } else if (isSummary(b)) {
        flush();
        out.push(...summary("SUMMARY OF ACTIONS TAKEN IF PEST OBSERVED", b));
      }
    }
    flush();
  });
  return out;
}
