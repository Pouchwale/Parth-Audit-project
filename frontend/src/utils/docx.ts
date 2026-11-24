import { CUSTOM_PROPERTIES_PART, CUSTOM_PROPERTIES_REL, CUSTOM_PROPERTIES_TYPE, customPropertiesXml, xmlText, zipStored } from "./xlsx";

// A REAL WORD DOCUMENT, WITHOUT A LIBRARY (REQUIREMENTS §54).
//
// A .docx is a zip of a few XML parts: the content types, the package
// relationship, the document itself and a styles part giving it the body font.
// Paragraphs and tables are all a downloaded form needs — a heading line, the
// form's boxes as a two-column table, its grid as a bordered table whose heading
// rows repeat on every page. A table too wide for a portrait page turns the
// section to landscape. Stored uncompressed, like the workbooks (utils/xlsx.ts).
//
// A VALUE THAT CAN BE READ BACK (REQUIREMENTS §81). A piece of text carrying a
// tag is written inside a plain-text content control (w:sdt) tagged with it —
// Word keeps the control, and its tag, through every edit and save, and locks
// the control itself (not its words) so it cannot be deleted by accident. A
// table with a caption keeps it (w:tblCaption), so rows a person adds to it can
// be found again. The map that says what each tag means travels as a custom XML
// part, and a few named values as custom document properties
// (engine/roundTrip/exportMap.ts).

/** A content control around a piece of text: its tag (e.g. "dcrs:12") and the title Word shows on it. */
export interface DocxTag {
  tag: string;
  alias: string;
}

/** A piece of a paragraph or a cell: plain words, or a value inside a content control. */
export interface DocxRun {
  text: string;
  tag?: DocxTag;
}

export type DocxCell = string | DocxRun[];

/** The look a format's style gives some words (engine/formatStyles.ts WordsLook, REQUIREMENTS §318). Size in points. */
export interface DocxLook {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
  font?: string;
  align?: "left" | "center" | "right" | "justify";
}

/** A run's properties: bold and size as the writer chose, laid over by the look where it says otherwise (in Word's own order). */
function runProps(bold: boolean, halfPoints: number | undefined, look?: DocxLook): string {
  if (!look) return `${bold ? "<w:b/>" : ""}${halfPoints ? `<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>` : ""}`;
  const b = look.bold ?? bold;
  const sz = look.size ? Math.round(look.size * 2) : halfPoints;
  const font = look.font ? `<w:rFonts w:ascii="${escape(look.font)}" w:hAnsi="${escape(look.font)}" w:cs="${escape(look.font)}"/>` : "";
  return `${font}${b ? "<w:b/>" : ""}${look.italic ? "<w:i/>" : ""}${sz ? `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` : ""}${look.underline ? '<w:u w:val="single"/>' : ""}`;
}
const jcOf = (align: DocxLook["align"]): string => (align ? `<w:jc w:val="${align === "justify" ? "both" : align}"/>` : "");

/** A cell of a table drawn as the company's own Word page (type "paper"): its words, how they are set, and its four edges. */
export interface DocxPaperCell {
  text: DocxCell;
  /** Columns it spans (w:gridSpan). */
  colSpan?: number;
  /** The first cell of a vertical merge ("restart") or one it covers ("continue"). */
  vMerge?: "restart" | "continue";
  /** Half-points, as Word writes them (20 = 10 pt). */
  size: number;
  bold: boolean;
  align: "left" | "center" | "right";
  valign: "top" | "center";
  underline?: boolean;
  /** A face other than the document's (the page number of F/HR/18 is Times New Roman). */
  font?: string;
  /** Words in bold before the cell's own (F/QC/11's "PROCEDURE:"). */
  boldLead?: string;
  /** The cell's shading, "#rrggbb" (F/QC/16's number box, F/HR/17's headings). */
  fill?: string;
  /** left, right, top, bottom in eighths of a point (0 none; 4 is half a point, 12 a point and a half). */
  borders: [number, number, number, number];
}

export type DocxBlock =
  | { type: "paragraph"; text: string; bold?: boolean; size?: number; center?: boolean; parts?: DocxRun[]; look?: DocxLook }
  /**
   * A table laid in points, as the company's Word original draws it: fixed column widths, row heights, merged cells, a face
   * and size to each cell, edges to each cell. `indent` is its distance from the margin, `pageBreakBefore` starts a page.
   */
  | { type: "paper"; widths: number[]; rows: { height?: number; keepNext?: boolean; cells: DocxPaperCell[] }[]; indent?: number; pageBreakBefore?: boolean; spaceAfter?: number; cellPad?: number }
  | { type: "table"; rows: DocxCell[][]; headerRows?: number; boldFirstColumn?: boolean; caption?: string; band?: true; labelColumns?: true; spans?: Record<string, number>; looks?: Record<string, DocxLook> };

/** What a document carries besides its body. */
export interface DocxExtras {
  /** A custom XML part (the whole XML text, declaration left out), related from the document. */
  customXml?: { xml: string; schema?: string };
  /** Custom document properties (docProps/custom.xml). */
  customProperties?: [name: string, value: string][];
  /** The paper's own orientation (LogSheetLayout.paper, REQUIREMENTS §117); without it the widest grid decides. */
  paper?: "portrait" | "landscape";
  /** The page's margins in points, where the paper's are not the default 12.7 mm (F/HR/18: 18 pt above, 28.7 pt at the left). */
  margins?: { top: number; right: number; bottom: number; left: number };
  /**
   * ALL ITS LINES ON ONE PAGE (LogSheetLayout.onePage; the owner, 20-Nov-2026, REQUIREMENTS §259: F/PRD/10, 22, 23 and 24, a
   * line for every date of the month): a grid's lines set close (no space above or below a line's words, single spacing)
   * and 10 mm margins, so a month's 31 lines print on the one page.
   */
  onePage?: boolean;
  /** The columns of the sheet's grid in mm, set as they print (F/HR/15's 31 days, F/HR/16's twelve months, §282). */
  columnsMm?: number[];
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const escape = (s: string) => xmlText(s).replace(/"/g, "&quot;");

// An empty control still needs something to click into in Word: a few no-break
// spaces, which read back as nothing.
const EMPTY_CONTROL = "    ";

function runs(text: string, props: string): string {
  const lines = text.split("\n");
  return lines
    .map((line, i) => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${escape(line)}</w:t></w:r>`)
    .join("");
}

/** Writes pieces of text, each tagged one inside its own content control; numbers the controls. */
class Controls {
  private next = 1;
  pieces(parts: DocxRun[], props: string): string {
    return parts
      .map((p) => {
        if (!p.tag) return p.text ? runs(p.text, props) : "";
        const id = this.next++;
        const alias = p.tag.alias.replace(/\s+/g, " ").trim().slice(0, 120);
        return (
          `<w:sdt><w:sdtPr>${alias ? `<w:alias w:val="${escape(alias)}"/>` : ""}<w:tag w:val="${escape(p.tag.tag)}"/><w:id w:val="${id}"/>` +
          `<w:lock w:val="sdtLocked"/><w:text w:multiLine="1"/></w:sdtPr>` +
          `<w:sdtContent>${runs(p.text === "" ? EMPTY_CONTROL : p.text, props)}</w:sdtContent></w:sdt>`
        );
      })
      .join("");
  }
  cell(cell: DocxCell, props: string): string {
    return typeof cell === "string" ? runs(cell, props) : this.pieces(cell, props);
  }
}

function paragraph(controls: Controls, text: string, opts: { bold?: boolean; size?: number; center?: boolean; spacingAfter?: number; parts?: DocxRun[]; look?: DocxLook } = {}): string {
  const rPr = runProps(!!opts.bold, opts.size, opts.look);
  const jc = opts.look?.align ? jcOf(opts.look.align) : opts.center ? '<w:jc w:val="center"/>' : "";
  const pPr = `<w:pPr>${jc}<w:spacing w:before="0" w:after="${opts.spacingAfter ?? 80}"/></w:pPr>`;
  const body = opts.parts && opts.parts.some((p) => p.tag) ? controls.pieces(opts.parts, rPr) : runs(text, rPr);
  return `<w:p>${pPr}${body}</w:p>`;
}

/** A one-page grid's line (DocxExtras.onePage): 12 pt, so 31 lines and the heading fill a landscape A4 page. */
const CLOSE_ROW = 240;

function table(controls: Controls, block: Extract<DocxBlock, { type: "table" }>, fontSize: number, close = false, columnsMm?: number[]): string {
  const columns = Math.max(1, ...block.rows.map((r) => r.length));
  const set = columnsMm?.length === columns ? columnsMm.map((mm) => Math.round(mm * 56.693)) : null;
  const headerRows = block.headerRows ?? 0;
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
  const rows = block.rows
    .map((row, ri) => {
      const header = ri < headerRows;
      // A run of the line's cells drawn as one (`spans`, "row:column" -> columns, §309: F/PUR/03's SERVICE AGREEMENT): one
      // cell over them, its words in the middle; the cells it covers are not written.
      const spanAt = (ci: number) => block.spans?.[`${ri}:${ci}`] ?? 1;
      const covered = new Set<number>();
      for (let ci = 0; ci < columns; ci++) for (let k = 1; k < spanAt(ci); k++) covered.add(ci + k);
      const cells = Array.from({ length: columns }, (_, ci): DocxCell => row[ci] ?? "")
        .map((cell, ci) => {
          if (covered.has(ci)) return "";
          const span = Math.min(spanAt(ci), columns - ci);
          // A table of boxes laid several to a line (labelColumns) has a label in every other column.
          const bold = header || (!!block.boldFirstColumn && ci === 0) || (!!block.labelColumns && ci % 2 === 0);
          const shade = header ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E9EE"/>' : "";
          // (the look the format's style gives this cell, §318: its words' style and alignment)
          const look = block.looks?.[`${ri}:${ci}`];
          const rPr = runProps(bold, fontSize, look);
          // (set close, every value in the middle of its box, §262; and a date stays on one line: "01-11-2026" broke at its dashes in a narrow column and drew its line twice as tall)
          const text = typeof cell === "string" ? cell : cell.map((c) => c.text).join("");
          const noWrap = close && /^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/.test(text.trim()) ? "<w:noWrap/>" : "";
          const width = set ? set.slice(ci, ci + span).reduce((a, b) => a + b, 0) : 0;
          const across = span > 1 ? `<w:gridSpan w:val="${span}"/>` : "";
          const centred = look?.align ? jcOf(look.align) : span > 1 && !close ? '<w:jc w:val="center"/>' : "";
          const tc = `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="${set ? "dxa" : "auto"}"/>${across}${shade}${noWrap}${columnsMm ? '<w:vAlign w:val="center"/>' : ""}</w:tcPr><w:p><w:pPr>${set ? '<w:spacing w:before="0" w:after="0" w:line="228" w:lineRule="auto"/>' : close ? '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/>' : '<w:spacing w:before="20" w:after="20"/>'}${centred}</w:pPr>${controls.cell(cell, rPr)}</w:p></w:tc>`;
          // (a styled cell's own alignment stands alone: the centring a close table gives every cell gives way to it, §318)
          return close && look?.align ? tc.replace('<w:jc w:val="center"/>', "") : tc;
        })
        .join("");
      // (set close, a line is ruled CLOSE_ROW high at least, as a paper's ruled line, so the month fills its page)
      return `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : `<w:trPr><w:cantSplit/>${close ? `<w:trHeight w:val="${CLOSE_ROW}" w:hRule="atLeast"/>` : ""}</w:trPr>`}${cells}</w:tr>`;
    })
    .join("");
  return (
    `<w:tbl><w:tblPr>${set ? `<w:tblW w:w="${set.reduce((a, b) => a + b, 0)}" w:type="dxa"/>` : '<w:tblW w:w="5000" w:type="pct"/>'}` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>` +
    `<w:tblLayout w:type="${set ? "fixed" : "autofit"}"/><w:tblCellMar><w:left w:w="${set ? 20 : 60}" w:type="dxa"/><w:right w:w="${set ? 20 : 60}" w:type="dxa"/></w:tblCellMar>` +
    `${block.caption ? `<w:tblCaption w:val="${escape(block.caption)}"/>` : ""}</w:tblPr>` +
    `<w:tblGrid>${Array.from({ length: columns }, (_, ci) => (set ? `<w:gridCol w:w="${set[ci]}"/>` : "<w:gridCol/>")).join("")}</w:tblGrid>${rows}</w:tbl>` +
    // (set close, the line Word needs after a table is drawn 1 pt high: at the page's foot it started a blank page)
    paragraph(controls, "", close ? { spacingAfter: 0, size: 2 } : { spacingAfter: 60 })
  );
}

function paperTable(controls: Controls, block: Extract<DocxBlock, { type: "paper" }>): string {
  const tw = (pt: number) => Math.round(pt * 20);
  const total = block.widths.reduce((a, b) => a + b, 0);
  const edge = (side: string, eighths: number) => (eighths > 0 ? `<w:${side} w:val="single" w:sz="${eighths}" w:space="0" w:color="000000"/>` : `<w:${side} w:val="nil"/>`);
  const grid = block.widths.map((w) => `<w:gridCol w:w="${tw(w)}"/>`).join("");
  const rows = block.rows
    .map((row) => {
      let at = 0;
      const cells = row.cells
        .map((c) => {
          const span = c.colSpan ?? 1;
          const width = block.widths.slice(at, at + span).reduce((a, b) => a + b, 0);
          at += span;
          const [l, r, t, b] = c.borders;
          const props = (bold: boolean) =>
            `${c.font ? `<w:rFonts w:ascii="${c.font}" w:hAnsi="${c.font}" w:cs="${c.font}"/>` : ""}${bold ? "<w:b/>" : ""}` +
            `<w:sz w:val="${c.size}"/><w:szCs w:val="${c.size}"/>${c.underline ? '<w:u w:val="single"/>' : ""}`;
          const rPr = props(c.bold);
          const tcPr =
            `<w:tcPr><w:tcW w:w="${tw(width)}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}` +
            `${c.vMerge === "restart" ? '<w:vMerge w:val="restart"/>' : c.vMerge === "continue" ? "<w:vMerge/>" : ""}` +
            `<w:tcBorders>${edge("top", t)}${edge("left", l)}${edge("bottom", b)}${edge("right", r)}</w:tcBorders>` +
            (c.fill && /^#?[0-9a-f]{6}$/i.test(c.fill) ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fill.replace("#", "").toUpperCase()}"/>` : "") +
            `<w:vAlign w:val="${c.valign}"/></w:tcPr>`;
          // (keepNext: the row stays on the page of the row after it - F/HR/18's two lines of a unit never part, 31-Oct-2026)
          const para = `<w:p><w:pPr>${row.keepNext ? "<w:keepNext/>" : ""}<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${c.align}"/></w:pPr>${c.boldLead ? runs(c.boldLead, props(true)) : ""}${controls.cell(c.text, rPr)}</w:p>`;
          return `<w:tc>${tcPr}${para}</w:tc>`;
        })
        .join("");
      return `<w:tr><w:trPr><w:cantSplit/>${row.height ? `<w:trHeight w:val="${tw(row.height)}" w:hRule="atLeast"/>` : ""}</w:trPr>${cells}</w:tr>`;
    })
    .join("");
  // A new page as a paragraph that starts one (pageBreakBefore), not a break inside a line: a page already full to its foot
  // then gets no page with only that line on it (the owner, 31-Oct-2026: "not even a single page should be blank").
  const lead = block.pageBreakBefore ? `<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>` : "";
  return (
    lead +
    `<w:tbl><w:tblPr><w:tblW w:w="${tw(total)}" w:type="dxa"/><w:tblInd w:w="${tw(block.indent ?? 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:left w:w="${block.cellPad ?? 108}" w:type="dxa"/><w:right w:w="${block.cellPad ?? 108}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>` +
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.max(20, tw(block.spaceAfter ?? 1))}" w:lineRule="exact"/></w:pPr></w:p>`
  );
}

/** A GUID in braces, as Office writes a data-store item's id. */
function guid(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
}

/** A one-section Word document. */
export function buildDocx(blocks: DocxBlock[], extras: DocxExtras = {}): Uint8Array<ArrayBuffer> {
  // A grid (a table with a heading row) of more than six columns, or any table of
  // more than eight, turns the page; the form's Format No. / Rev No. row (a band,
  // whatever the paper prints in it since REQUIREMENTS §111) does not.
  const columnsOf = (b: DocxBlock) => (b.type === "table" ? Math.max(0, ...b.rows.map((r) => r.length)) : 0);
  const widest = Math.max(0, ...blocks.map((b) => (b.type === "table" && !b.band && ((b.headerRows ?? 0) > 0 || columnsOf(b) > 8) ? columnsOf(b) : 0)));
  // ...unless the paper itself says which way its page is (REQUIREMENTS §117).
  const landscape = extras.paper ? extras.paper === "landscape" : widest > 6;
  const fontSize = widest > 12 ? 14 : widest > 8 ? 16 : 18;
  const controls = new Controls();
  const body = blocks.map((b) => (b.type === "paragraph" ? paragraph(controls, b.text, b) : b.type === "paper" ? paperTable(controls, b) : table(controls, b, extras.onePage || extras.columnsMm ? Math.max(fontSize, 16) : fontSize, !!extras.onePage, extras.columnsMm))).join("");
  // A page drawn as paper tables ends on its own small spacing line: no empty line of the body's size after it, which on a
  // page filled to its foot would start a blank page (the owner, 31-Oct-2026: "not even a single page should be blank").
  const endsOnPaper = blocks.length > 0 && blocks[blocks.length - 1].type === "paper";
  // A4, 12.7 mm margins; landscape swaps the sides.
  const [w, h] = landscape ? [16838, 11906] : [11906, 16838];
  const mm = extras.margins;
  const margin = mm ? { top: Math.round(mm.top * 20), right: Math.round(mm.right * 20), bottom: Math.round(mm.bottom * 20), left: Math.round(mm.left * 20) } : extras.onePage ? { top: 567, right: 567, bottom: 567, left: 567 } : { top: 720, right: 720, bottom: 720, left: 720 };
  const section = `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${landscape ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="${margin.top}" w:right="${margin.right}" w:bottom="${margin.bottom}" w:left="${margin.left}" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>`;
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const props = extras.customProperties?.length ? extras.customProperties : null;
  const custom = extras.customXml ?? null;
  const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
  const parts: [string, string][] = [
    [
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
        (custom ? `<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>` : "") +
        (props ? `<Override PartName="/${CUSTOM_PROPERTIES_PART}" ContentType="${CUSTOM_PROPERTIES_TYPE}"/>` : "") +
        `</Types>`,
    ],
    [
      "_rels/.rels",
      `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/>` +
        (props ? `<Relationship Id="rId2" Type="${CUSTOM_PROPERTIES_REL}" Target="${CUSTOM_PROPERTIES_PART}"/>` : "") +
        `</Relationships>`,
    ],
    [
      "word/_rels/document.xml.rels",
      `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/>` +
        (custom ? `<Relationship Id="rId2" Type="${R}/customXml" Target="../customXml/item1.xml"/>` : "") +
        `</Relationships>`,
    ],
    [
      "word/styles.xml",
      `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault>` +
        `<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
        `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`,
    ],
    ["word/document.xml", `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}${endsOnPaper ? "" : paragraph(controls, "")}${section}</w:body></w:document>`],
  ];
  if (custom) {
    parts.push(
      ["customXml/item1.xml", custom.xml],
      [
        "customXml/itemProps1.xml",
        `<ds:datastoreItem ds:itemID="${guid()}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml">` +
          (custom.schema ? `<ds:schemaRefs><ds:schemaRef ds:uri="${escape(custom.schema)}"/></ds:schemaRefs>` : "<ds:schemaRefs/>") +
          `</ds:datastoreItem>`,
      ],
      ["customXml/_rels/item1.xml.rels", `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${R}/customXmlProps" Target="itemProps1.xml"/></Relationships>`]
    );
  }
  if (props) parts.push([CUSTOM_PROPERTIES_PART, customPropertiesXml(props)]);
  return zipStored(parts.map(([name, xml]) => ({ name, data: new TextEncoder().encode(declaration + xml) })));
}
