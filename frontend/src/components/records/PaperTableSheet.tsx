import React from "react";
import type { LogHeaderField, LogSheetLayout } from "../../types";
import { lineRow, type PaperCell, type PaperPick, type PaperRow, type PaperTable } from "../../data/seed/qcPaperTables";
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
  for (const row of [...form.head, ...form.body, ...(form.lines ? [{ h: form.lines.h, cells: lineRow(form, 0) }] : []), ...form.foot]) {
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
  /** For the print of a long register: the lines each later page starts at (utils/paperPages.ts, §277). */
  pageBreaks?: number[] | null;
  /** A line of the record put in under this one, on an HR paper's register (§276). */
  insertLine?: (line: number) => void;
  /** Take a line of the record off (the screen's bin on a register's line), where lines may be removed. */
  removeLine?: (line: number) => void;
  /** What a box of the record holds: its words where the paper prints them again, or where the print shows them as words. */
  value?: (key: string) => string;
  /** The words of a row of a table of boxes the record keeps its own rows in (§246): typed over where it can be written. */
  rowWords?: (table: string, key: string, words: string) => React.ReactNode;
  /** A row put in under this one, and this one taken off (§246); undefined where the record cannot be written. */
  addRow?: (table: string, after: string) => void;
  removeRow?: (table: string, key: string) => void;
  /** A row of an HR paper put in under this one, and this one taken off (§276); undefined where the record cannot be written. */
  paperRow?: { add: (key: string) => void; remove: (key: string) => void };
  /** A paper whose every printed word is the record's (PaperTable.ownWords): the words at this place, typed over where they stand. */
  printed?: (place: string, words: string, drawn: React.ReactNode) => React.ReactNode;
  /** One answer of a choice set across the paper's cells (§275), on the record's line where it is a grid's. */
  pick?: (pick: PaperPick, line: number | undefined) => React.ReactNode;
  /** Whether the line holds something in this column (PaperCell.bgIf). */
  holds?: (line: number, col: string) => boolean;
  /** A figure worked out from a column of the line, as the paper works it out (PaperCell.calc). */
  calc?: (line: number, of: string, times: number) => string;
  /** The month of the sheet's financial year a heading names: "Apr-26" (0 is April). */
  fyMonth?: (month: number) => string;
}

/** Words whose lines the paper underlines (PaperCell.ul, F-QC-14's specifications): each such line in its own underlined span. */
export function withUnderlinedLines(text: string, ul: number[] | undefined, render: (line: string) => React.ReactNode = (line) => line): React.ReactNode {
  if (!ul || ul.length === 0) return render(text);
  return text.split("\n").map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && "\n"}
      {ul.includes(i) ? <span className="pt-ul">{render(line)}</span> : render(line)}
    </React.Fragment>
  ));
}

/** The field of the layout a cell names, header or footer. */
function fieldOf(layout: LogSheetLayout, key: string): LogHeaderField | undefined {
  return layout.headerFields.find((f) => f.key === key) ?? layout.footerFields?.find((f) => f.key === key);
}

/** The words a cell prints by reference to the layout: a box's printed label, a printed table's cell, the paper's foot lines. */
function referenced(layout: LogSheetLayout, ref: string): string {
  if (ref.startsWith("@notesAtFoot:")) return layout.notesAtFoot?.[Number(ref.slice(13))] ?? "";
  // A box's own printed label, where the words stand on their own (F/QC/13's "QA પર્સન", run on under its box's rule).
  if (ref.startsWith("@label:")) return referenced(layout, ref.slice(7));
  // The words the paper prints under a signature's space ("(QA Inspector)"), a column's heading as the paper prints it
  // ("Specified  GSM"), and the heading over a group of columns ("GSM").
  if (ref.startsWith("@printedBelow:")) return fieldOf(layout, ref.slice(14))?.printedBelow ?? "";
  if (ref.startsWith("@column:")) {
    // @column:key:br breaks the heading before its bracket, where the paper does ("Viscosity" over "(20.0 ± 1.0 Sec.)").
    const [, key, br] = ref.split(":");
    const c = layout.columns.find((col) => col.key === key);
    const words = c ? (c.printedLabel ?? c.label) : "";
    return br === "br" ? words.replace(/ \(/, "\n(") : words;
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

/** "{fy:3}" in a heading: that month of the sheet's own financial year (F/HR/09's Apr-26 ... Mar-27). */
function fyWords(text: string, parts: PaperTableParts): string {
  return parts.fyMonth && text.includes("{fy:") ? text.replace(/\{fy:(\d+)\}/g, (_, m: string) => parts.fyMonth!(Number(m))) : text;
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
          if (c.a === "j" || c.a === "jj") classes.push("pt-aj");
          if (c.a === "jj") classes.push("pt-ajj");
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
          // A register's line the record does not hold, in a row that shows (a second block beside the record's lines).
          if (row.line !== undefined && !row.pad && c.ln !== undefined && c.ln >= (parts.rowCount ?? 0)) classes.push("pt-padc");
          if (c.ww) classes.push("pt-ww");
          if (c.ov) classes.push("pt-ov");
          if (c.pw && c.box) classes.push("pt-pwc");
          const style: Record<string, string> = {
            "--pt-size": String(pt),
            "--pt-lh": String(lh),
            "--pt-x": String(c.a === "c" ? 0 : (c.x ?? 0)),
            "--pt-pl": String(c.a === "c" ? (c.pad ?? 0) + (c.cx ? Math.max(0, 2 * c.cx) : 0) : 0),
            "--pt-pr": String(c.a === "c" ? (c.pad ?? 0) + (c.cx ? Math.max(0, -2 * c.cx) : 0) : 0),
            "--pt-y": String(Math.max(0, (c.y ?? 0) - letterTop(font, pt, lh))),
          };
          if (c.bg) style["--pt-bg"] = c.bg;
          if (c.bgIf && c.col && c.ln !== undefined && parts.holds?.(c.ln, c.col)) {
            classes.push("pt-bg");
            style["--pt-bg"] = c.bgIf;
          }
          if (c.ww) style["--pt-ww"] = String(c.ww);
          let body: React.ReactNode = null;
          if (c.at) {
            // Each line in its own face and size, where the paper prints it: the letterhead's name over its three lines.
            body = c.at.map((line, li) => {
              const lf = line.f ?? form.font;
              const lpt = line.pt ?? pt;
              const llh = lpt * MM;
              const text = fyWords(line.t.startsWith("@") ? referenced(layout, line.t) : line.t, parts);
              // Its left: its own x, or the cell's where the cell is not centred (a centred line stands in the middle).
              const lx = line.x ?? (c.a === "c" ? 0 : (c.x ?? 0));
              const place = `${c.pl ?? `${row0 + ri}:${ci}`}:${li}`;
              return (
                <span
                  key={li}
                  className={`pt-at${line.b ? " pt-b" : ""}${line.u ? " pt-at-u" : ""}${line.f ? ` pt-f-${line.f}` : ""}${line.wrap ? " pt-wrap" : ""}${line.caps ? " pt-caps" : ""}`}
                  style={{ "--pt-size": String(lpt), "--pt-lh": String(llh), "--pt-ay": String(line.y - letterTop(lf, lpt, llh)), "--pt-ax": String(lx) } as React.CSSProperties}
                >
                  {parts.printed ? parts.printed(place, text, text) : withHeaderWords(text, words, edit, !!line.caps)}
                </span>
              );
            });
          } else if (c.box) {
            // (a box the print shows as its words: the box on the screen, its words on the paper, wrapping as the paper's)
            body = c.pw ? (
              <>
                {parts.box(c.box, c)}
                <span className="pt-pw" aria-hidden="true">
                  {parts.value?.(c.box) ?? ""}
                </span>
              </>
            ) : (
              parts.box(c.box, c)
            );
          }
          else if (c.calc) {
            const line = c.ln ?? row.line;
            body = <span className="pt-words">{line !== undefined ? parts.calc?.(line, c.calc.of, c.calc.times) : ""}</span>;
          } else if (c.pick) {
            const line = c.ln ?? row.line;
            body = (
              <span className={`pt-words pt-picks${c.pick.some((p) => p.mark === "check") ? " pt-picks-check" : ""}`}>
                {c.pick.map((p, pi) => (
                  <React.Fragment key={pi}>
                    {pi > 0 && p.mark !== "check" && " / "}
                    {parts.pick?.(p, p.ln ?? line)}
                  </React.Fragment>
                ))}
              </span>
            );
          } else if (c.num && row.line !== undefined) {
            const n = c.ln ?? row.line;
            const shownNo = c.num === "all" || n < (parts.rowCount ?? 0);
            body = !shownNo ? null : parts.printed && !row.pad ? parts.printed(`num:${n}`, String(n + 1), n + 1) : <span className="pt-words">{n + 1}</span>;
          } else if (c.col !== undefined && c.ln !== undefined) body = row.line !== undefined && c.ln >= (parts.rowCount ?? 0) ? null : parts.gridCell(c.ln, c.col, c);
          else if (c.sentence) {
            const s = c.sentence;
            const f = fieldOf(layout, s.box);
            // The cell's own words on the line above ("Inspector - 1" over the name), the words before the box (its own
            // label for "@key"), the box, the words after; the paper's spaces between.
            const head = c.lab !== undefined ? referenced(layout, c.lab) : c.t;
            const before = s.before.startsWith("@") ? referenced(layout, s.before.slice(1)) : (f?.inSentence?.before ?? s.before);
            const after = f?.inSentence?.after ?? s.after;
            const gap = " ".repeat(s.space ?? 1);
            const value = parts.value?.(s.box) ?? "";
            body = (
              <span className={`pt-words pt-sentence${s.pw ? " pt-sw" : ""}`} style={{ "--pt-bw": String(s.boxWidth) } as React.CSSProperties}>
                {head ? `${head}\n` : null}
                {before && parts.printed ? parts.printed(`${c.pl ?? `${row0 + ri}:${ci}`}:b`, before, before) : before}
                {before && !before.endsWith("\n") ? gap : null}
                {s.copy ? (
                  // the box's words written again where the paper prints them again (the box is where it prints them first)
                  <span className="pt-copy" data-copies={s.box}>
                    {value}
                  </span>
                ) : (
                  <>
                    {parts.box(s.box, c)}
                    {s.pw && (
                      <span className="pt-pw" aria-hidden="true">
                        {value}
                      </span>
                    )}
                  </>
                )}
                {after && !after.startsWith("\n") ? gap : null}
                {after && parts.printed ? parts.printed(`${c.pl ?? `${row0 + ri}:${ci}`}:a`, after, after) : after}
              </span>
            );
          } else {
            const text = fyWords(c.lab !== undefined ? referenced(layout, c.lab) : (c.t ?? ""), parts);
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
            } else if (c.rowKey && c.rowTable && parts.rowWords) body = <span className="pt-words">{parts.rowWords(c.rowTable, c.rowKey, text)}</span>;
            // (a cell the paper leaves blank can be written in too: every part of the paper is the record's)
            // (not the hair-thin strips between a paper's rules: nothing is ever written there)
            else if (parts.printed && !c.img && !row.pad && (text || (c.w >= 4 && row.h >= 2.5))) body = parts.printed(c.pl ?? `${row0 + ri}:${ci}`, text, text ? withUnderlinedLines(text, c.ul) : null);
            else if (text) body = <span className="pt-words">{withUnderlinedLines(text, c.ul, (line) => withHeaderWords(line, words, edit, !!c.caps))}</span>;
          }
          cells.push(
            <td
              key={ci}
              className={classes.join(" ")}
              colSpan={span > 1 ? span : undefined}
              rowSpan={c.rs && c.rs > 1 ? c.rs : undefined}
              style={style as React.CSSProperties}
              data-pt-cell={`${row0 + ri}:${ci}`}
              // A cell of the record's grid says its line (from 0) and column; a cell the paper leaves blank says so.
              data-pt-ln={c.col !== undefined && c.ln !== undefined ? c.ln : undefined}
              data-pt-col={c.col}
              data-pt-blank={c.t === "" && !c.box && !c.col && !c.sentence && !c.img && !c.at && !c.num && c.lab === undefined ? "" : undefined}
            >
              {/* A row of a table of boxes: a row put in under it, and it taken off - outside the paper's table, never printed (§246). */}
              {ci === 0 && c.rowKey && c.rowTable && parts.addRow && (
                <span className="pt-rowtools no-print">
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" data-action="box-row-add" title="Add a row below" aria-label="Add a row below" onClick={() => parts.addRow?.(c.rowTable!, c.rowKey!)}>
                    +
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" data-action="box-row-remove" title="Remove this row" aria-label="Remove this row" onClick={() => parts.removeRow?.(c.rowTable!, c.rowKey!)}>
                    ×
                  </button>
                </span>
              )}
              {/* Any row of an HR paper: one put in under it, or it taken off - outside the paper's table, never printed (§276). */}
              {row.rowKey && parts.paperRow && ci === row.cells.findIndex((x) => !x.skip) && (
                <span className="pt-rowtools no-print">
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" data-action="paper-row-add" data-row={row.rowKey} title="Add a row below" aria-label="Add a row below" onClick={() => parts.paperRow?.add(row.rowKey!)}>
                    +
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" data-action="paper-row-remove" data-row={row.rowKey} title="Delete this row" aria-label="Delete this row" onClick={() => parts.paperRow?.remove(row.rowKey!)}>
                    ×
                  </button>
                </span>
              )}
              {ci === 0 && row.line !== undefined && !row.pad && parts.insertLine && form.lines && (
                <button type="button" className="btn btn-ghost btn-sm btn-icon pt-line-add no-print" data-action="paper-line-add" data-line={row.line} title="Add a row below" aria-label={`Add a row below line ${row.line + 1}`} onClick={() => parts.insertLine?.(row.line!)}>
                  +
                </button>
              )}
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
              {/* The record's boxes standing inside the paper's words (§275). */}
              {c.over?.map((o, oi) => {
                const ln = o.ln ?? c.ln ?? row.line;
                if (o.col && (ln === undefined || ln >= (parts.rowCount ?? 0))) return null;
                const at = { "--ox": String(o.x), "--oy": String(o.y), "--ow": String(o.w), "--oh": String(o.h), "--pt-x": "0", "--pt-y": "0", ...(o.rule ? { "--orw": String(o.rule) } : {}) } as React.CSSProperties;
                return (
                  <span key={oi} className={`pt-over${o.rule ? " pt-over-rule" : ""}${o.pick?.some((p) => p.mark === "check") ? " pt-over-checks" : ""}`} style={at}>
                    {o.pick
                      ? o.pick.map((p, pi) => (
                          <React.Fragment key={pi}>
                            {pi > 0 && p.mark !== "check" && " / "}
                            {parts.pick?.(p, p.ln ?? ln)}
                          </React.Fragment>
                        ))
                      : o.box
                        ? parts.box(o.box, { ...c, lines: o.lines })
                        : parts.gridCell(ln!, o.col!, { ...c, lines: o.lines })}
                  </span>
                );
              })}
            </td>
          );
        });
        return (
          <tr
            key={ri}
            className={[row.pad ? "pt-pad" : "", row.pb ? "pt-pb" : ""].filter(Boolean).join(" ") || undefined}
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

/** A cell of the paper's head saying this page's number and how many there are (its "Page No.: 1 Of 1"). */
function onPage(c: PaperCell, page: number, pages: number): PaperCell {
  const words = c.at ? c.at.map((l) => l.t).join(" ") : (c.t ?? "");
  if (!/Page\s*No/i.test(words)) return c;
  let n = 0;
  const numbered = (s: string) => s.replace(/\d+/g, (d) => (++n === 1 ? String(page) : n === 2 ? String(pages) : d));
  return c.at ? { ...c, at: c.at.map((l) => ({ ...l, t: numbered(l.t) })) } : { ...c, t: numbered(c.t ?? "") };
}

/**
 * The rows a continued page repeats: the letterhead down to its number band and the blank strip under it, not the table that
 * follows it on the first page. A cell running down past them stops with them, or it would push the lines below out of line.
 */
function pageHeadRows(form: PaperTable): PaperRow[] {
  const words = (c: PaperCell) => (c.at ? c.at.map((l) => l.t).join(" ") : (c.t ?? ""));
  let end = -1;
  form.head.forEach((r, i) => {
    if (r.cells.some((c) => /Format No|Page\s*No|F\/HR\/\d+/i.test(words(c)))) end = i;
  });
  if (end < 0) end = form.head.length - 1;
  const next = form.head[end + 1];
  if (next && next.cells.every((c) => !words(c).trim() && !c.box && !c.col && !c.sentence)) end += 1;
  const rows = form.head.slice(0, end + 1);
  return rows.map((r, ri) => ({ ...r, cells: r.cells.map((c) => (c.rs && c.rs > rows.length - ri ? { ...c, rs: rows.length - ri } : c)) }));
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
          cells: lineRow(form, ln),
          line: ln,
          pad: ln >= held,
        }))
      : [];
  const breaks = form.ownWords ? (parts.pageBreaks ?? []) : [];
  // (a paper may draw its first pages itself: the pages after them count on from those)
  const ownPages = 1 + [...form.head, ...form.body].filter((r) => r.pb).length;
  const pages = breaks.length + ownPages;
  const rows: DrawnRow[] = part === "head" && breaks.length ? form.head.map((r) => ({ ...r, cells: r.cells.map((c) => onPage(c, 1, pages)) })) : [...form[part], ...lines];
  // (a paper whose words are kept by their place numbers its foot the same however many lines the record holds)
  const row0 = part === "head" ? 0 : part === "body" ? form.head.length : form.head.length + form.body.length + (form.lines ? (form.ownWords ? form.lines.count : Math.max(form.lines.count, held)) : 0);
  if (rows.length === 0) return null;
  const widths = edges.slice(1).map((e, i) => Math.round((e - edges[i]) * 100) / 100);
  const table = (drawn: DrawnRow[], first: number, heading?: DrawnRow[]) => (
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
      {heading && (
        <thead>
          <PaperRows rows={heading} edges={edges} parts={parts} row0={first - heading.length} />
        </thead>
      )}
      <tbody>
        <PaperRows rows={drawn} edges={edges} parts={parts} row0={first} />
      </tbody>
    </table>
  );
  // Each page a paper draws for itself is a table of its own: the rule under a page's last line stays as long as that line (§275).
  const paged = (drawn: DrawnRow[], first: number) => {
    const starts = drawn.flatMap((r, i) => (i === 0 || r.pb ? [i] : []));
    return starts.map((s, k) => <React.Fragment key={s}>{table(drawn.slice(s, starts[k + 1] ?? drawn.length), first + s)}</React.Fragment>);
  };
  // The print of a long register: each page its own head, with its number, and the column headings again (§277).
  if (part === "body" && breaks.length > 0) {
    const stamped = (r: PaperRow, at: number): PaperRow => ({ ...r, cells: r.cells.map((c, ci) => (c.pl ? c : { ...c, pl: `${at}:${ci}` })) });
    const headings = form.body.flatMap((r, i) => (r.head ? [stamped(r, form.head.length + i)] : []));
    let bodyPage = 1;
    const drawn: DrawnRow[] = form.body.map((r) => {
      if (r.pb) bodyPage += 1;
      return { ...r, cells: r.cells.map((c) => onPage(c, bodyPage, pages)) };
    });
    let from = 0;
    [...breaks, lines.length].forEach((end, k) => {
      drawn.push(...lines.slice(from, end));
      from = end;
      if (k < breaks.length) {
        const pageHead = pageHeadRows(form).map((r, ri): DrawnRow => {
          const row = stamped(r, ri);
          const { pb: _own, ...rest } = row;
          return { ...rest, ...(ri === 0 ? { pb: true as const } : {}), cells: row.cells.map((c) => onPage(c, ownPages + k + 1, pages)) };
        });
        drawn.push(...pageHead, ...headings);
      }
    });
    return <>{paged(drawn, row0)}</>;
  }
  // A register running past its page: the paper's column headings at the top of every page (§275).
  if (part === "body" && form.ownWords && form.lines) {
    const from = form.body.findIndex((r) => r.head);
    if (from >= 0) {
      const to = form.body.length - 1 - [...form.body].reverse().findIndex((r) => r.head);
      return (
        <>
          {from > 0 && paged(form.body.slice(0, from), row0)}
          {table([...form.body.slice(to + 1), ...lines], row0 + to + 1, form.body.slice(from, to + 1))}
        </>
      );
    }
  }
  return form.ownWords ? <>{paged(rows, row0)}</> : table(rows, row0);
}
