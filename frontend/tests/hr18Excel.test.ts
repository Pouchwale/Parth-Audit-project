// F/HR/18 AS EXCEL TOO (the owner, 30-10-2026: "in the hr 18 document give me the option to download in excel also"): the
// Excel file is the page its Word download draws (utils/paperSheets.ts flyCatcherWord), laid on one sheet by paperAsSheet,
// each printed page starting a new page.
import test from "node:test";
import assert from "node:assert/strict";
import { paperSheetBlocks } from "../src/utils/paperSheets";
import { documentFileKind, documentFileKinds, type Cell, type ExportBlock } from "../src/utils/documentExport";
import { documentRepository, ensureSeeded } from "../src/data/repositories/documentRepository";

ensureSeeded();

const t = (text: string): Cell => ({ text });
const page = (units: number[], pageNo: number): ExportBlock[] => [
  { kind: "text", text: "GUJARAT PRINT PACK PUBLICATIONS PVT LTD", strong: true, title: true },
  { kind: "text", text: "FORTNIGHTLY FLY CATCHER INSPECTION & CLEANING RECORD", strong: true, title: true },
  { kind: "table", band: true, headerRows: 0, rows: [[t("Format No.:"), t("F/HR/18"), t("Rev. No.:"), t("00"), t("Date:"), t("01.12.2021"), t("Page:"), t(`${pageNo} of 2`)]] },
  { kind: "text", text: "Month & Year", strong: true },
  { kind: "text", text: "Nov-26", strong: false },
  { kind: "table", headerRows: 0, rows: [[t("PC-01"), t("Near main gate"), t("PC-02"), t("Store room")], [t("PC-03"), t("Canteen"), t("PC-04"), t("Lab")]] },
  {
    kind: "table",
    headerRows: 1,
    rows: [
      ["PC ID NO.", "Date", "Flies catch count", "Tube light installation date", "Tube light due for change", "Cleaned by", "Checked by"].map(t),
      ...units.flatMap((u) => [
        [t(`PC-${String(u).padStart(2, "0")}`), t("02-11-2026"), t("1"), t("01-06-2026"), t("31-05-2027"), t("Ramesh"), t("Super Admin")],
        [t(""), t("16-11-2026"), t("0"), t("01-06-2026"), t("31-05-2027"), t("Ramesh"), t("Super Admin")],
      ]),
    ],
  },
];
const blocks = [...page([1, 2, 3, 4, 5, 6, 7], 1), ...page([8, 9, 10, 11, 12, 13], 2)];

test("F/HR/18 downloads as Word or Excel; so does every other document, its own kind first (the owner, 31-Oct-2026)", () => {
  assert.deepEqual(documentFileKinds(documentRepository.getByIdUnscoped("fly-catcher")), ["docx", "xlsx"]);
  for (const d of documentRepository.getAllUnscoped()) {
    const own = documentFileKind(d);
    assert.deepEqual(documentFileKinds(d), own === "pdf" ? ["pdf"] : [own, own === "xlsx" ? "docx" : "xlsx"], d.id);
  }
});

test("the Excel sheet is the Word page: the header band, Month & Year, the legend, each unit's PC ID merged down its two lines, a page break before page 2", () => {
  const out = paperSheetBlocks("fly-catcher", blocks);
  assert.ok(out && out[0].kind === "sheet");
  const s = out![0] as Extract<ExportBlock, { kind: "sheet" }>;
  const find = (text: string) => s.cells.filter((c) => c.text === text);
  assert.equal(find("GUJARAT PRINT PACK PUBLICATIONS PVT LTD").length, 2, "the header on both pages");
  assert.ok(find("GUJARAT PRINT PACK PUBLICATIONS PVT LTD").every((c) => c.style.bold && c.colSpan > 1));
  assert.equal(find("Month & Year  Nov-26").length, 2);
  for (const u of ["PC-01", "PC-13"]) assert.ok(s.cells.some((c) => c.text === u && c.rowSpan === 2 && c.style.bold), u);
  assert.equal(s.breaks?.length, 1, "one break: page 2");
  const page2 = find("GUJARAT PRINT PACK PUBLICATIONS PVT LTD")[1].row;
  assert.equal(s.breaks![0], page2, "page 2 starts at its header");
});
