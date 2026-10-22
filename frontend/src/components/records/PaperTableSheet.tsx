import React from "react";
import type { LogHeaderField, LogSheetLayout } from "../../types";
import type { PaperCell, PaperRow, PaperTable } from "../../data/seed/qcPaperTables";
import { HeaderWord, type AnyHeaderField, type HeaderEdit } from "../documents/DocumentHeader";

// A QC PAPER DRAWN AS ITS OWN WORD TABLE (REQUIREMENTS §117, round 2 of 20-Oct-2026): the rows of
// data/seed/qcPaperTables.ts in the paper's millimetres, one table for the header block, one for the body, one for the
// foot, all on the same columns, so the three print as the one table the paper is. Every box of the record stays the
// record's box (the sheet hands each cell its box or its grid cell, bound as everywhere else); the paper's words are
// printed words; the header's own words are typed over where they stand.

/** The columns every row of the paper is cut from: each cell's edges, gathered and merged where they are a hair apart. */
function columnEdges(form: PaperTable): number[] {
  const xs = new Set<number>([0]);
  // (a register's ruled lines are cut from the same columns: their cells' edges count too)
  for (const row of [...form.head, ...form.body, ...(form.lines ? [{ h: form.lines.h, cells: form.lines.cells }] : []), ...form.foot]) {
    let x = 0;
    for (const c of row.cells) {
      x = Math.round((x + c.w) * 100) / 100;
      xs.add(x);
    }
  }
  const out: number[] = [];
  for (const x of Array.from(xs).sort((a, b) => a - b)) if (out.length === 0 || x - out[out.length - 1] > 0.35) out.push(x);
  return out;
}

const nearest = (edges: number[], x: number): number => {
  let best = 0;
  for (let i = 1; i < edges.length; i++) if (Math.abs(edges[i] - x) < Math.abs(edges[best] - x)) best = i;
  return best;
};

/** mm per pt. */
const MM = 25.4 / 72;
/**
 * How far below the top of a line box the top of its letters stands, as a PDF measures it (the font's size above its
 * descent), for a line `lh` mm tall of a `pt` face: what puts the paper's measured "top of the letters" where it is.
 */
function letterTop(font: "calibri" | "arial" | "times" | "gothic", pt: number, lh: number): number {
  const k = font === "calibri" ? 0.408 : font === "arial" ? 0.4415 : font === "gothic" ? 0.45 : 0.4465;
  return lh / 2 - k * pt * MM;
}

export interface PaperTableParts {
  form: PaperTable;
  layout: LogSheetLayout;
  /** The header's words as the header block prints them: the company (in the paper's own letters), the title. */
  words: Partial<Record<AnyHeaderField, string>>;
  edit?: HeaderEdit;
  /** The record's box filling a cell (header and footer boxes alike). */
  box: (key: string, cell: PaperCell) => React.ReactNode;
  /** A cell of the record's grid: the line, the column. */
  gridCell: (line: number, col: string, cell: PaperCell) => React.ReactNode;
  /** How many lines the record holds (a register's ruled lines beyond them print blank). */
  rowCount?: number;
  /** Take a line of the record off (the screen's bin on a register's line), where lines may be removed. */
  removeLine?: (line: number) => void;
}

/** The field of the layout a cell names, header or footer. */
function fieldOf(layout: LogSheetLayout, key: string): LogHeaderField | undefined {
  return layout.headerFields.find((f) => f.key === key) ?? layout.footerFields?.find((f) => f.key === key);
}

/** The words a cell prints by reference to the layout: a box's printed label, a printed table's cell, the paper's foot lines. */
function referenced(layout: LogSheetLayout, ref: string): string {
  if (ref.startsWith("@notesAtFoot:")) return layout.notesAtFoot?.[Number(ref.slice(13))] ?? "";
  // The words the paper prints under a signature's space ("(QA Inspector)"), a column's heading as the paper prints it
  // ("Specified  GSM"), and the heading over a group of columns ("GSM").
  if (ref.startsWith("@printedBelow:")) return fieldOf(layout, ref.slice(14))?.printedBelow ?? "";
  if (ref.startsWith("@column:")) {
    const c = layout.columns.find((col) => col.key === ref.slice(8));
    return c ? (c.printedLabel ?? c.label) : "";
  }
  if (ref.startsWith("@group:")) return layout.columns.find((col) => col.key === ref.slice(7))?.group ?? "";
  // A table of boxes' heading across it, and the words of its rows (F/QC/17's master scale and scale under calibration).
  if (ref.startsWith("@corner:")) return fieldOf(layout, ref.slice(8))?.boxTable?.corner ?? "";
  if (ref.startsWith("@boxRow:")) {
    const [, key, i] = ref.split(":");
    return fieldOf(layout, key)?.boxTable?.rows?.[Number(i)] ?? "";
  }
  // The paper's own words the layout carries as its instructions (F/QC/08's Note, printed in its ruled row).
  if (ref.startsWith("@instructions:")) return layout.instructions?.[Number(ref.slice(14))] ?? "";
  if (ref.startsWith("@underCompany:")) return layout.underCompany?.[Number(ref.slice(14))] ?? "";
  if (ref.startsWith("@table:")) {
    // @table:TITLE:row:column, and :line (or :from-to) for the lines of a cell the paper sets apart (F/QC/25's DOC.NO.).
    const [, title, r, c, ln] = ref.split(":");
    const table = layout.referenceTables?.find((t) => t.title === title);
    if (!table) return "";
    const row = Number(r);
    const cell = (row < 0 ? table.columns[Number(c)] : table.rows[row]?.[Number(c)]) ?? "";
    if (ln === undefined) return cell;
    const [from, to] = ln.split("-").map(Number);
    return cell.split("\n").slice(from, (to ?? from) + 1).join("\n");
  }
  if (ref.startsWith("@printedAbove:")) {
    const [, key, span] = ref.split(":");
    const lines = fieldOf(layout, key)?.printedAbove ?? [];
    if (!span) return lines.join("\n");
    const [from, to] = span.split("-").map(Number);
    return lines.slice(from, (to ?? from) + 1).join("\n");
  }
  const f = fieldOf(layout, ref);
  if (!f) return "";
  return f.inSentence ? f.inSentence.before : (f.printedLabel ?? f.label);
}

/**
 * Printed words with the header's own in braces ({companyName}, {title}): each of those a value typed over where it stands.
 * caps: the paper prints them in capitals (F/QC/25's company, as COMPANY.name prints it); the words, not a style, so what
 * is read and printed is the same (the value typed over keeps its own letters).
 */
function withHeaderWords(text: string, words: PaperTableParts["words"], edit: HeaderEdit | undefined, caps = false): React.ReactNode {
  const parts = text.split(/(\{(?:companyName|title|formatNo|revisionNo|revisionDate(?::yy)?|page|ring)\})/);
  if (parts.length === 1) return caps ? text.toUpperCase() : text;
  return parts.map((p, i) => {
    const m = /^\{(\w+)(:yy)?\}$/.exec(p);
    if (!m) return caps ? p.toUpperCase() : p;
    // The paper's degree sign: a small raised ring, drawn (it is no letter of the paper's words).
    if (m[1] === "ring") return <span key={i} className="pt-ring" role="img" aria-label="°" />;
    const field = m[1] as AnyHeaderField;
    // {revisionDate:yy}: the date with its year in two figures, as the temperature records print it (28.02.25).
    const shown = m[2] ? (words[field] ?? "").replace(/\.(\d{2})(\d{2})$/, ".$2") : (words[field] ?? "");
    return (
      <HeaderWord key={i} field={field} edit={edit}>
        {caps ? shown.toUpperCase() : shown}
      </HeaderWord>
    );
  });
}

/** A row as drawn: a register's line knows its number, and whether it is one of the paper's blank lines (pad). */
type DrawnRow = PaperRow & { line?: number; pad?: boolean };

function PaperRows({ rows, edges, parts, row0 }: { rows: DrawnRow[]; edges: number[]; parts: PaperTableParts; row0: number }) {
  const { form, layout, words, edit } = parts;
  return (
    <>
      {rows.map((row, ri) => {
        let x = 0;
        const cells: React.ReactNode[] = [];
        row.cells.forEach((c, ci) => {
          const start = nearest(edges, x);
          x = Math.round((x + c.w) * 100) / 100;
          const span = Math.max(1, nearest(edges, x) - start);
          // A cell a cell above spans down over (its rs): the paper draws it once, so here it takes its width and nothing else.
          if (c.skip) return;
          const font = c.f ?? form.font;
          const pt = c.pt ?? form.pt;
          const lh = c.lh ?? pt * MM;
          const classes = ["pt-c"];
          if (c.b) classes.push("pt-b");
          if (c.a === "c") classes.push("pt-ac");
          if (c.a === "r") classes.push("pt-ar");
          if (c.open?.includes("r")) classes.push("pt-or");
          if (c.open?.includes("b")) classes.push("pt-ob");
          if (c.heavy?.includes("b")) classes.push("pt-hb");
          if (c.heavy?.includes("r")) classes.push("pt-hr");
          if (c.f) classes.push(`pt-f-${c.f}`);
          if (form.rules === "cells") {
            // The edges this cell rules, all four where the paper's table rules them (border-collapse draws a shared edge once).
            classes.push("pt-e");
            for (const e of c.edges ?? "ltrb") classes.push(`pt-e${e}`);
          }
          if (c.u) classes.push("pt-u");
          if (c.caps) classes.push("pt-caps");
          if (c.bg) classes.push("pt-bg");
          if (c.vm) classes.push("pt-vm");
          if (c.ww) classes.push("pt-ww");
          const style: Record<string, string> = {
            "--pt-size": String(pt),
            "--pt-lh": String(lh),
            "--pt-x": String(c.a === "c" ? 0 : (c.x ?? 0)),
            "--pt-pl": String(c.a === "c" ? (c.pad ?? 0) + (c.cx ? Math.max(0, 2 * c.cx) : 0) : 0),
            "--pt-pr": String(c.a === "c" ? (c.pad ?? 0) + (c.cx ? Math.max(0, -2 * c.cx) : 0) : 0),
            "--pt-y": String(Math.max(0, (c.y ?? 0) - letterTop(font, pt, lh))),
          };
          if (c.bg) style["--pt-bg"] = c.bg;
          if (c.ww) style["--pt-ww"] = String(c.ww);
          let body: React.ReactNode = null;
          if (c.at) {
            // Each line in its own face and size, where the paper prints it: the letterhead's name over its three lines.
            body = c.at.map((line, li) => {
              const lf = line.f ?? form.font;
              const lpt = line.pt ?? pt;
              const llh = lpt * MM;
              const text = line.t.startsWith("@") ? referenced(layout, line.t) : line.t;
              // Its left: its own x, or the cell's where the cell is not centred (a centred line stands in the middle).
              const lx = line.x ?? (c.a === "c" ? 0 : (c.x ?? 0));
              return (
                <span
                  key={li}
                  className={`pt-at${line.b ? " pt-b" : ""}${line.f ? ` pt-f-${line.f}` : ""}${line.wrap ? " pt-wrap" : ""}${line.caps ? " pt-caps" : ""}`}
                  style={{ "--pt-size": String(lpt), "--pt-lh": String(llh), "--pt-ay": String(line.y - letterTop(lf, lpt, llh)), "--pt-ax": String(lx) } as React.CSSProperties}
                >
                  {withHeaderWords(text, words, edit, !!line.caps)}
                </span>
              );
            });
          } else if (c.box) body = parts.box(c.box, c);
          else if (c.num && row.line !== undefined)
            body = c.num === "all" || !row.pad ? <span className="pt-words">{row.line + 1}</span> : null;
          else if (c.col !== undefined && c.ln !== undefined) body = row.pad ? null : parts.gridCell(c.ln, c.col, c);
          else if (c.sentence) {
            const f = fieldOf(layout, c.sentence.box);
            body = (
              <span className="pt-words pt-sentence" style={{ "--pt-bw": String(c.sentence.boxWidth) } as React.CSSProperties}>
                {f?.inSentence?.before ?? c.sentence.before}{" "}
                {parts.box(c.sentence.box, c)} {f?.inSentence?.after ?? c.sentence.after}
              </span>
            );
          } else {
            const text = c.lab !== undefined ? referenced(layout, c.lab) : (c.t ?? "");
            if (c.bullets !== undefined) {
              body = (
                <span className="pt-words">
                  {text
                    .split("\n")
                    .filter(Boolean)
                    .map((line, li) => (
                      <span key={li} className="pt-bullet" style={{ "--pt-bx": String(c.bullets! - (c.x ?? 0)) } as React.CSSProperties}>
                        {line.replace(/^●\s*/, "")}
                      </span>
                    ))}
                </span>
              );
            } else if (text) body = <span className="pt-words">{withHeaderWords(text, words, edit, !!c.caps)}</span>;
          }
          cells.push(
            <td
              key={ci}
              className={classes.join(" ")}
              colSpan={span > 1 ? span : undefined}
              rowSpan={c.rs && c.rs > 1 ? c.rs : undefined}
              style={style as React.CSSProperties}
              data-pt-cell={`${row0 + ri}:${ci}`}
            >
              {/* The screen's bin on a register's line, outside the paper's table; never printed. */}
              {ci === 0 && row.line !== undefined && !row.pad && parts.removeLine && form.lines && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon pt-bin no-print"
                  title="Remove row"
                  aria-label={`Remove line ${row.line + 1}`}
                  onClick={() => parts.removeLine?.(row.line!)}
                >
                  ×
                </button>
              )}
              {c.img && (
                <img
                  className="pt-img"
                  src={c.img.src}
                  alt={c.img.alt}
                  draggable={false}
                  style={{ "--pt-ix": String(c.img.x), "--pt-iy": String(c.img.y), "--pt-iw": String(c.img.w), "--pt-ih": String(c.img.h) } as React.CSSProperties}
                />
              )}
              {body}
            </td>
          );
        });
        return (
          <tr
            key={ri}
            className={row.pad ? "pt-pad" : undefined}
            aria-hidden={row.pad ? true : undefined}
            data-pt-heading={row.head ? "" : undefined}
            data-pt-line={row.line !== undefined ? row.line + 1 : undefined}
            style={{ "--pt-h": String(row.h) } as React.CSSProperties}
          >
            {cells}
          </tr>
        );
      })}
    </>
  );
}

/** One part of the paper (its header block, its body or its foot), as a table on the paper's columns. */
export function PaperTablePart({ part, parts }: { part: "head" | "body" | "foot"; parts: PaperTableParts }) {
  const { form } = parts;
  const edges = React.useMemo(() => columnEdges(form), [form]);
  // A register's ruled lines follow the body's rows: the record's lines, then the paper's blank ones up to its count.
  const held = parts.rowCount ?? 0;
  const lines: DrawnRow[] =
    part === "body" && form.lines
      ? Array.from({ length: Math.max(form.lines.count, held) }, (_, ln) => ({
          h: form.lines!.h,
          cells: form.lines!.cells.map((c) => ({ ...c, ln })),
          line: ln,
          pad: ln >= held,
        }))
      : [];
  const rows: DrawnRow[] = [...form[part], ...lines];
  const row0 = part === "head" ? 0 : part === "body" ? form.head.length : form.head.length + form.body.length + (form.lines ? Math.max(form.lines.count, held) : 0);
  if (rows.length === 0) return null;
  const widths = edges.slice(1).map((e, i) => Math.round((e - edges[i]) * 100) / 100);
  return (
    <table
      className={`pt-table pt-${part} pt-font-${form.font}${form.frame ? " pt-frame" : ""}`}
      style={{ "--pt-w": String(edges[edges.length - 1]) } as React.CSSProperties}
      data-paper-part={part}
      data-pt-rules={form.rules}
    >
      <colgroup>
        {widths.map((w, i) => (
          <col key={i} style={{ "--pt-col": String(w) } as React.CSSProperties} />
        ))}
      </colgroup>
      <tbody>
        <PaperRows rows={rows} edges={edges} parts={parts} row0={row0} />
      </tbody>
    </table>
  );
}
