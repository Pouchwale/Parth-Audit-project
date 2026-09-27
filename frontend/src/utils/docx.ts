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

export type DocxBlock =
  | { type: "paragraph"; text: string; bold?: boolean; size?: number; center?: boolean; parts?: DocxRun[] }
  | { type: "table"; rows: DocxCell[][]; headerRows?: number; boldFirstColumn?: boolean; caption?: string };

/** What a document carries besides its body. */
export interface DocxExtras {
  /** A custom XML part (the whole XML text, declaration left out), related from the document. */
  customXml?: { xml: string; schema?: string };
  /** Custom document properties (docProps/custom.xml). */
  customProperties?: [name: string, value: string][];
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

function paragraph(controls: Controls, text: string, opts: { bold?: boolean; size?: number; center?: boolean; spacingAfter?: number; parts?: DocxRun[] } = {}): string {
  const rPr = `${opts.bold ? "<w:b/>" : ""}${opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : ""}`;
  const pPr = `<w:pPr>${opts.center ? '<w:jc w:val="center"/>' : ""}<w:spacing w:before="0" w:after="${opts.spacingAfter ?? 80}"/></w:pPr>`;
  const body = opts.parts && opts.parts.some((p) => p.tag) ? controls.pieces(opts.parts, rPr) : runs(text, rPr);
  return `<w:p>${pPr}${body}</w:p>`;
}

function table(controls: Controls, block: Extract<DocxBlock, { type: "table" }>, fontSize: number): string {
  const columns = Math.max(1, ...block.rows.map((r) => r.length));
  const headerRows = block.headerRows ?? 0;
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
  const rows = block.rows
    .map((row, ri) => {
      const header = ri < headerRows;
      const cells = Array.from({ length: columns }, (_, ci): DocxCell => row[ci] ?? "")
        .map((cell, ci) => {
          const bold = header || (!!block.boldFirstColumn && ci === 0);
          const shade = header ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E9EE"/>' : "";
          const rPr = `${bold ? "<w:b/>" : ""}<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/>`;
          return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${shade}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>${controls.cell(cell, rPr)}</w:p></w:tc>`;
        })
        .join("");
      return `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : "<w:trPr><w:cantSplit/></w:trPr>"}${cells}</w:tr>`;
    })
    .join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>` +
    `<w:tblLayout w:type="autofit"/><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar>` +
    `${block.caption ? `<w:tblCaption w:val="${escape(block.caption)}"/>` : ""}</w:tblPr>` +
    `<w:tblGrid>${Array.from({ length: columns }, () => "<w:gridCol/>").join("")}</w:tblGrid>${rows}</w:tbl>` +
    paragraph(controls, "", { spacingAfter: 60 })
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
  // more than eight, turns the page; the form's Format No. / Rev No. row does not.
  const columnsOf = (b: DocxBlock) => (b.type === "table" ? Math.max(0, ...b.rows.map((r) => r.length)) : 0);
  const widest = Math.max(0, ...blocks.map((b) => (b.type === "table" && ((b.headerRows ?? 0) > 0 || columnsOf(b) > 8) ? columnsOf(b) : 0)));
  const landscape = widest > 6;
  const fontSize = widest > 12 ? 14 : widest > 8 ? 16 : 18;
  const controls = new Controls();
  const body = blocks.map((b) => (b.type === "paragraph" ? paragraph(controls, b.text, b) : table(controls, b, fontSize))).join("");
  // A4, 12.7 mm margins; landscape swaps the sides.
  const [w, h] = landscape ? [16838, 11906] : [11906, 16838];
  const section = `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${landscape ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>`;
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
    ["word/document.xml", `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}${paragraph(controls, "")}${section}</w:body></w:document>`],
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
