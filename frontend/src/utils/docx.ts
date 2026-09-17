import { xmlText, zipStored } from "./xlsx";

// A REAL WORD DOCUMENT, WITHOUT A LIBRARY (REQUIREMENTS §54).
//
// A .docx is a zip of a few XML parts: the content types, the package
// relationship, the document itself and a styles part giving it the body font.
// Paragraphs and tables are all a downloaded form needs — a heading line, the
// form's boxes as a two-column table, its grid as a bordered table whose heading
// rows repeat on every page. A table too wide for a portrait page turns the
// section to landscape. Stored uncompressed, like the workbooks (utils/xlsx.ts).

export type DocxBlock =
  | { type: "paragraph"; text: string; bold?: boolean; size?: number; center?: boolean }
  | { type: "table"; rows: string[][]; headerRows?: number; boldFirstColumn?: boolean };

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const escape = (s: string) => xmlText(s).replace(/"/g, "&quot;");

function runs(text: string, props: string): string {
  const lines = text.split("\n");
  return lines
    .map((line, i) => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${escape(line)}</w:t></w:r>`)
    .join("");
}

function paragraph(text: string, opts: { bold?: boolean; size?: number; center?: boolean; spacingAfter?: number } = {}): string {
  const rPr = `${opts.bold ? "<w:b/>" : ""}${opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : ""}`;
  const pPr = `<w:pPr>${opts.center ? '<w:jc w:val="center"/>' : ""}<w:spacing w:before="0" w:after="${opts.spacingAfter ?? 80}"/></w:pPr>`;
  return `<w:p>${pPr}${runs(text, rPr)}</w:p>`;
}

function table(block: Extract<DocxBlock, { type: "table" }>, fontSize: number): string {
  const columns = Math.max(1, ...block.rows.map((r) => r.length));
  const headerRows = block.headerRows ?? 0;
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
  const rows = block.rows
    .map((row, ri) => {
      const header = ri < headerRows;
      const cells = Array.from({ length: columns }, (_, ci) => row[ci] ?? "")
        .map((text, ci) => {
          const bold = header || (!!block.boldFirstColumn && ci === 0);
          const shade = header ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E9EE"/>' : "";
          const rPr = `${bold ? "<w:b/>" : ""}<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/>`;
          return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${shade}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>${runs(text, rPr)}</w:p></w:tc>`;
        })
        .join("");
      return `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : "<w:trPr><w:cantSplit/></w:trPr>"}${cells}</w:tr>`;
    })
    .join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>` +
    `<w:tblLayout w:type="autofit"/><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${Array.from({ length: columns }, () => "<w:gridCol/>").join("")}</w:tblGrid>${rows}</w:tbl>` +
    paragraph("", { spacingAfter: 60 })
  );
}

/** A one-section Word document. */
export function buildDocx(blocks: DocxBlock[]): Uint8Array<ArrayBuffer> {
  // A grid (a table with a heading row) of more than six columns, or any table of
  // more than eight, turns the page; the form's Format No. / Rev No. row does not.
  const columnsOf = (b: DocxBlock) => (b.type === "table" ? Math.max(0, ...b.rows.map((r) => r.length)) : 0);
  const widest = Math.max(0, ...blocks.map((b) => (b.type === "table" && ((b.headerRows ?? 0) > 0 || columnsOf(b) > 8) ? columnsOf(b) : 0)));
  const landscape = widest > 6;
  const fontSize = widest > 12 ? 14 : widest > 8 ? 16 : 18;
  const body = blocks.map((b) => (b.type === "paragraph" ? paragraph(b.text, b) : table(b, fontSize))).join("");
  // A4, 12.7 mm margins; landscape swaps the sides.
  const [w, h] = landscape ? [16838, 11906] : [11906, 16838];
  const section = `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${landscape ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>`;
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const parts: [string, string][] = [
    [
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
        `</Types>`,
    ],
    [
      "_rels/.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
    ],
    [
      "word/_rels/document.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "word/styles.xml",
      `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault>` +
        `<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
        `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`,
    ],
    ["word/document.xml", `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}${paragraph("")}${section}</w:body></w:document>`],
  ];
  return zipStored(parts.map(([name, xml]) => ({ name, data: new TextEncoder().encode(declaration + xml) })));
}
