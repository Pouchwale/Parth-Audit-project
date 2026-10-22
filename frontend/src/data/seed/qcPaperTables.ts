// THE QC PAPERS THAT ARE ONE WORD TABLE FROM TOP TO FOOT (REQUIREMENTS §117, round 2 of 20-Oct-2026).
//
// The owner, 17-Oct-2026: "reproduce the same layout, not a redesign"; 20-Oct-2026: "make sure each and every part
// should be editable and same and when user click on print button ... it should download the same document which i have
// uploaded". F/QC/06 and F/QC/07, the certificates of analysis for labels and for shrink sleeves, are ONE portrait page:
// a single Word table whose rows each draw their own cells - the letterhead with the logo, the title, the order and party
// lines, LABEL STOCK / SLEEVE FILM, PRINTING, COATING, FINISHING, TOLERANCE, the notes, the system line and the
// corporate office strip. DCRS printed them as a web form over three landscape pages.
//
// Each paper here is drawn as its rows, in the paper's millimetres, read off the owner's PDF by tests/qc_visual (the rules
// and the words, measured: scratchpad bands.py). components/records/PaperTableSheet.tsx draws them; every box of the
// record stays a box (the same binding, the same name, the same check against the TOLERANCE), every printed word is the
// paper's, and the header's own words (the company, the title, the number) are typed over in place as on any sheet.
//
// A row:   h   its height (mm).
// A cell:  w   its width (mm); the cells of a row add up to the table's width.
//          t   printed words ("\n" breaks a line), or lab: the words of the record's box `lab` (its printed label);
//              {companyName} and {title} in the words are the header's own, typed over where they stand.
//          box the record's box filling the cell; col + ln a cell of the record's grid (the column, the line).
//          b bold, a "c" centred, pt the size, f the face where it is not the paper's body face, x / y where the
//          words start (mm in from the cell's left, mm down to the top of the letters), lh the pitch of its lines.
//          open the edges the paper leaves without a rule ("r" right, "b" under); heavy the edges it rules heavier.
//          img a picture of the paper's own (the logo, the corporate office strip), placed in the cell (mm).
//          sentence: the words around a box written inside the sentence (the retest date), centred as printed.

export interface PaperCell {
  w: number;
  t?: string;
  lab?: string;
  box?: string;
  col?: string;
  ln?: number;
  b?: true;
  a?: "c" | "r";
  pt?: number;
  f?: "arial" | "times";
  x?: number;
  y?: number;
  lh?: number;
  open?: "r" | "b" | "rb";
  heavy?: "b" | "r" | "rb";
  img?: { src: string; x: number; y: number; w: number; h: number; alt: string };
  sentence?: { before: string; box: string; after: string; boxWidth: number };
  /** A box whose words run on to a second line in the cell (a remark): a box of several lines. */
  lines?: true;
  /** Bulleted lines, the bullet drawn where the paper draws its bullet picture (mm in from the cell's left). */
  bullets?: number;
  /** Centred words standing this far right of the cell's middle (mm; negative: to the left), where Word set them so. */
  cx?: number;
  /** Lines each in its own face and size, each where the paper prints it (y: mm down to the top of its letters): the letterhead. */
  at?: { t: string; y: number; pt?: number; f?: "arial" | "times"; b?: true }[];
}

export interface PaperRow {
  h: number;
  cells: PaperCell[];
}

export interface PaperTable {
  /** The page the paper is printed on, and where the table's top-left corner stands on it (mm from the page's edges). */
  page: "portrait" | "landscape";
  left: number;
  top: number;
  /** The paper's body face and size (pt). */
  font: "calibri" | "arial" | "times";
  pt: number;
  /** The rows of the header block (the letterhead and the title), of the body, and of the foot (printed at the end). */
  head: PaperRow[];
  body: PaperRow[];
  foot: PaperRow[];
  /** The paper prints no format number, revision or page: they are shown on the screen to be typed over, never printed. */
  numberOffPaper?: true;
}

const W = 193.4;
const LOGO = "brand/gpp-paper-logo.png";
const OFFICE = "brand/gpp-corporate-office.png";

/** A printed label, 3.22 mm in from its cell's left as the certificates set their first column. */
const label = (w: number, key: string, y: number, more: Partial<PaperCell> = {}): PaperCell => ({ w, lab: key, x: 3.22, y, ...more });
const words = (w: number, t: string, y: number, more: Partial<PaperCell> = {}): PaperCell => ({ w, t, x: 3.22, y, ...more });
const box = (w: number, key: string, more: Partial<PaperCell> = {}): PaperCell => ({ w, box: key, ...more });
const centred = (w: number, t: string, y: number, more: Partial<PaperCell> = {}): PaperCell => ({ w, t, a: "c", y, ...more });
// The certificates centre their block headings 3.9 mm left of the table's middle (LABEL STOCK, PRINTING ... at 103.4 mm).
const band = (h: number, t: string, y: number): PaperRow => ({ h, cells: [{ w: W, t, b: true, a: "c", pt: 12.48, y, cx: -3.9 }] });
const blank = (w: number): PaperCell => ({ w, t: "" });

/** The ten colours' columns under PRINTING, as the certificates rule them. */
const COLOUR_WIDTHS = [14.8, 15.9, 14.6, 15.7, 15.7, 16.7, 14.9, 14.8, 14.8, 14.2];
const colourRow = (h: number, labelText: string, y: number, col: string, printed = false): PaperRow => ({
  h,
  cells: [words(41.3, labelText, y), ...COLOUR_WIDTHS.map((w, ln): PaperCell => ({ w, col, ln, a: "c", ...(printed ? { y } : {}) }))],
});

/** The letterhead and the title, the same on both certificates: the logo at the left, the company and its three lines at the right. */
const coaHead = (title: string): PaperRow[] => [
  {
    h: 23.78,
    cells: [
      { w: 59.8, t: "", open: "r", heavy: "b", img: { src: LOGO, x: 1.12, y: 0.62, w: 58.9, h: 21.6, alt: "Gujarat Print Pack Publications Pvt Ltd" } },
      {
        w: 133.6,
        a: "c",
        heavy: "b",
        at: [
          { t: "{companyName}", y: 1.68, pt: 14.52, f: "arial", b: true },
          { t: "@underCompany:0", y: 9.31, pt: 9 },
          { t: "@underCompany:1", y: 13.2, pt: 9 },
          { t: "@underCompany:2", y: 17.1, pt: 9 },
        ],
      },
    ],
  },
  { h: 7.69, cells: [{ w: W, t: "{title}", b: true, a: "c", pt: 14.52, y: 1.6, heavy: "b" }] },
];

/** The system line and the corporate office strip at the foot of both certificates. */
const coaFoot = (systemH: number, officeH: number, officeY: number, officeImgH: number): PaperRow[] => [
  { h: systemH, cells: [{ w: W, lab: "@notesAtFoot:0", b: true, a: "c", y: 0.88, heavy: "b" }] },
  { h: officeH, cells: [{ w: W, t: "", img: { src: OFFICE, x: 1.52, y: officeY, w: 163.4, h: officeImgH, alt: "Corporate Office : 201, Harsh Avenue, Navjivan Press Road, Nr. Income Tax Under Pass, Ashram Road, Ahmedabad-380 014. Gujarat, INDIA. Phone : +91 79 27545314. FAX : +91 79 27545914 E-mail : marketing@gujprintpack.com" } }] },
];

/** The TOLERANCE table's three rows, its words the layout's printed table (TOLERANCE); `shift` the centred words Word set off the middle of their cells (row, column, mm). */
const toleranceRows = (widths: number[], heights: [number, number, number], ys: [number, number, number], shift: [number, number, number][] = []): PaperRow[] =>
  heights.map((h, r) => ({
    h,
    cells: widths.map((w, c): PaperCell => {
      const cx = shift.find(([sr, sc]) => (sr < 0 || sr === r) && sc === c)?.[2];
      return { w, lab: `@table:TOLERANCE:${r - 1}:${c}`, a: "c", y: ys[r], ...(r > 0 && c === 0 ? { b: true as const } : {}), ...(cx !== undefined ? { cx } : {}) };
    }),
  }));

// ---------------------------------------------------------------------------
// F/QC/06 — Certificate of Analysis [COA] For Label ("F-QC-06_Certificate of analysis (COA)-Label (2).pdf")

const COA_LABEL: PaperTable = {
  page: "portrait",
  left: 10.58,
  top: 4.48,
  font: "calibri",
  pt: 9.48,
  numberOffPaper: true,
  head: coaHead("Certificate of Analysis [COA] For Label"),
  body: [
    {
      h: 5.84,
      cells: [
        label(36.3, "productionOrderNo", 1.38, { x: 1.72, b: true, open: "r" }),
        box(41.2, "productionOrderNo", { x: 1.72, b: true, open: "r" }),
        label(19.5, "deliveryNo", 1.43, { x: 1.72, b: true, open: "r" }),
        box(48.4, "deliveryNo", { x: 1.72, b: true, open: "r" }),
        label(18.6, "coaDate", 1.43, { x: 1.72, b: true, open: "r" }),
        box(29.4, "coaDate", { x: 1.72, b: true }),
      ],
    },
    { h: 5.66, cells: [label(42.6, "clientName", 0.96), box(150.8, "clientName", { x: 2.42 })] },
    {
      h: 6.42,
      cells: [
        label(42.6, "gp3Code", 1.02),
        box(23.8, "gp3Code", { x: 2.42 }),
        label(28.9, "clientItemCode1", 1.02, { x: 1.05 }),
        box(33.1, "clientItemCode1", { x: 0.8 }),
        label(30.0, "clientItemCode2", 1.02, { x: 1.35 }),
        box(35.0, "clientItemCode2", { x: 1.57 }),
      ],
    },
    { h: 6.12, cells: [label(42.6, "productName", 0.82), box(150.8, "productName", { x: 2.42 })] },
    { h: 6.35, cells: [words(42.6, "Specified Size", 0.92), centred(29.8, "Length(mm)", 0.92), centred(25.9, "Width(mm)", 0.92), blank(95.1)] },
    { h: 5.34, cells: [words(42.6, "Client's Specified Size", 0.71), box(29.8, "specifiedLength", { a: "c" }), box(25.9, "specifiedWidth", { a: "c" }), blank(95.1)] },
    { h: 5.77, cells: [words(42.6, "Tested Size", 0.96), box(29.8, "testedLength", { a: "c" }), box(25.9, "testedWidth", { a: "c" }), blank(95.1)] },
    band(5.65, "LABEL STOCK", 0.92),
    { h: 5.43, cells: [words(42.6, "Material", 1.1, { b: true }), centred(49.9, "Face Material", 1.1, { b: true }), centred(46.5, "Adhesive", 1.1, { b: true }), centred(54.4, "Release Liner", 1.1, { b: true })] },
    { h: 5.43, cells: [words(42.6, "Required", 1.22), box(49.9, "faceMaterialRequired", { a: "c" }), box(46.5, "adhesiveRequired", { a: "c" }), box(54.4, "releaseLinerRequired", { a: "c" })] },
    { h: 5.01, cells: [words(42.6, "Tested", 0.87), box(49.9, "faceMaterialTested", { a: "c" }), box(46.5, "adhesiveTested", { a: "c" }), box(54.4, "releaseLinerTested", { a: "c" })] },
    { h: 5.36, cells: [words(42.6, "Type Required", 1.03), box(49.9, "faceMaterialTypeRequired", { a: "c" }), box(46.5, "adhesiveTypeRequired", { a: "c" }), box(54.4, "releaseLinerTypeRequired", { a: "c" })] },
    { h: 5.44, cells: [words(42.6, "Observed", 1.09), box(49.9, "faceMaterialObserved", { a: "c" }), box(46.5, "adhesiveObserved", { a: "c" }), box(54.4, "releaseLinerObserved", { a: "c" })] },
    band(6.91, "PRINTING", 2.05),
    colourRow(6.07, "No. of Colors", 0.72, "colorNo", true),
    colourRow(6.7, "Given By Client", 1.29, "givenByClient"),
    colourRow(6.49, "Color Shade Verified", 1.37, "colorShadeVerified"),
    {
      h: 7.01,
      cells: [label(41.3, "shadeMatchGrade", 1.74), box(14.8, "shadeMatchGrade", { a: "c" }), label(30.5, "remarksForShade", 1.74, { x: 1.23, b: true }), box(106.8, "remarksForShade", { x: 2.27 })],
    },
    {
      h: 10.1,
      cells: [
        words(76.1, "Text    Matter Verification With Specified Art Work", 1.67),
        box(13.0, "textMatterVerification", { a: "c" }),
        label(45.5, "remarksForTextVerification", 1.67, { x: 1.41, b: true }),
        box(58.8, "remarksForTextVerification", { x: 1.4, lines: true }),
      ],
    },
    { h: 6.14, cells: [label(36.4, "barCodeGrade", 1.31), box(30.0, "barCodeGrade", { a: "c" }), label(31.9, "barCodeRemarks", 1.31, { x: 1.45 }), box(95.1, "barCodeRemarks", { x: 1.53 })] },
    band(7.55, "COATING", 1.53),
    {
      h: 6.39,
      cells: [
        label(25.3, "coatingDone", 1.42, { open: "r" }),
        box(46.4, "coatingDone", { x: 1.5 }),
        centred(16.5, "Aqueous", 1.42),
        centred(13.9, "U.V", 1.42),
        centred(17.8, "Lamination", 1.42),
        centred(25.5, "Achieved Gloss", 1.42),
        centred(48.0, "Scuff Test", 1.42),
      ],
    },
    {
      h: 6.63,
      cells: [
        words(71.7, "Minimum Gloss Required at 60{ring}", 1.81),
        box(16.5, "minGlossAqueous", { a: "c" }),
        box(13.9, "minGlossUv", { a: "c" }),
        box(17.8, "minGlossLamination", { a: "c" }),
        box(25.5, "achievedGloss", { a: "c" }),
        box(48.0, "scuffTest", { x: 1.5 }),
      ],
    },
    band(6.79, "FINISHING", 1.28),
    { h: 6.23, cells: [label(45.0, "finishingQualityGrade", 1.17), box(17.0, "finishingQualityGrade", { a: "c" }), label(26.2, "dieCuttingType", 1.17, { x: 1.3 }), box(105.2, "dieCuttingType", { x: 1.6 })] },
    { h: 5.48, cells: [label(45.0, "dieCutting", 1.25, { x: 11.62 }), box(43.2, "dieCutting", { x: 2.08 }), label(31.2, "rewindingQuality", 1.25, { x: 1.62 }), box(74.0, "rewindingQuality", { x: 4.47 })] },
    { h: 6.28, cells: [label(45.0, "emboss", 1.44, { x: 11.62 }), box(43.2, "emboss", { x: 2.08 }), label(31.2, "packingQuality", 1.44, { x: 1.62 }), box(74.0, "packingQuality", { x: 4.47 })] },
    { h: 5.64, cells: [label(45.0, "foilStamping", 1.18, { x: 11.62 }), box(43.2, "foilStamping", { x: 2.08 }), label(31.2, "slittingQuality", 1.18, { x: 1.62 }), box(74.0, "slittingQuality", { x: 4.47 })] },
    { h: 6.02, cells: [label(59.0, "remarksForFinishingQuality", 1.3), box(134.4, "remarksForFinishingQuality", { x: 2.45 })] },
    { h: 5.27, cells: [label(59.0, "finalInspection", 1.12), box(134.4, "finalInspection", { x: 2.45 })] },
    { h: 5.95, cells: [label(59.0, "overAllQualityRemarks", 1.61), box(134.4, "overAllQualityRemarks", { x: 2.45 })] },
    band(6.12, "TOLERANCE", 1.13),
    ...toleranceRows([29.6, 31.8, 31.8, 33.1, 34.9, 32.2], [6.01, 5.58, 6.49], [1.31, 1.1, 0.68]),
    { h: 12.13, cells: [{ w: W, lab: "@printedAbove:retestOn", x: 10.92, y: 2.24, lh: 5.67, bullets: 3.2 }] },
    {
      h: 4.77,
      cells: [{ w: W, sentence: { before: "This material should be retested on", box: "retestOn", after: "before usage.", boxWidth: 18 }, b: true, a: "c", f: "arial", y: 0.99, heavy: "b" }],
    },
  ],
  foot: coaFoot(9.86, 12.63, 0.92, 10.6),
};

// ---------------------------------------------------------------------------
// F/QC/07 — Certificate of Analysis [COA] For Shrink Sleeves ("F-QC-07_Certificate of analysis (COA)-Sleeve.pdf")

const COA_SLEEVE: PaperTable = {
  page: "portrait",
  left: 10.58,
  top: 4.48,
  font: "calibri",
  pt: 9.48,
  numberOffPaper: true,
  head: coaHead("Certificate of Analysis [COA] For Shrink Sleeves"),
  body: [
    {
      h: 5.84,
      cells: [
        label(43.2, "productionOrderNo", 1.43, { x: 1.72, b: true, open: "r" }),
        box(42.0, "productionOrderNo", { x: 1.72, b: true, open: "r" }),
        label(19.4, "deliveryNo", 1.43, { x: 1.72, b: true, open: "r" }),
        box(43.8, "deliveryNo", { x: 1.72, b: true, open: "r" }),
        label(18.6, "coaDate", 1.43, { x: 1.72, b: true, open: "r" }),
        box(26.4, "coaDate", { x: 1.72, b: true }),
      ],
    },
    { h: 5.66, cells: [label(42.6, "clientName", 0.96), box(150.8, "clientName", { x: 2.72 })] },
    {
      h: 6.42,
      cells: [
        label(42.6, "gp3Code", 1.02),
        box(23.8, "gp3Code", { x: 2.12 }),
        label(28.9, "clientItemCode1", 1.02, { x: 1.05 }),
        box(33.1, "clientItemCode1", { x: 0.8 }),
        label(30.0, "clientItemCode2", 1.02, { x: 1.35 }),
        box(35.0, "clientItemCode2", { x: 1.57 }),
      ],
    },
    { h: 6.12, cells: [label(42.6, "productName", 0.82), box(150.8, "productName", { x: 2.72 })] },
    { h: 6.35, cells: [words(42.6, "Specified Size", 0.92), centred(29.8, "Cut Length(mm)", 0.92), centred(29.0, "Open Width(mm)", 0.92), blank(92.0)] },
    { h: 5.34, cells: [words(42.6, "Client's Specified Size", 0.71), box(29.8, "specifiedCutLength", { a: "c" }), box(29.0, "specifiedOpenWidth", { a: "c" }), blank(92.0)] },
    { h: 5.77, cells: [words(42.6, "Tested Size", 0.96), box(29.8, "testedCutLength", { a: "c" }), box(29.0, "testedOpenWidth", { a: "c" }), blank(92.0)] },
    band(7.06, "SLEEVE FILM", 1.34),
    { h: 6.49, cells: [words(42.6, "Material", 1.08, { b: true }), centred(37.2, "Thickness(Microns)", 1.08, { b: true }), centred(39.5, "Shrinkage Ratio (%)", 1.08, { b: true }), centred(74.1, "Type", 1.08, { b: true })] },
    { h: 4.94, cells: [words(42.6, "Required", 1.17), box(37.2, "thicknessRequired", { a: "c" }), box(39.5, "shrinkageRatioRequired", { a: "c" }), box(74.1, "typeRequired", { x: 2.21 })] },
    { h: 5.01, cells: [words(42.6, "Tested", 0.67), box(37.2, "thicknessTested", { a: "c" }), box(39.5, "shrinkageRatioTested", { a: "c" }), box(74.1, "typeTested", { x: 2.21 })] },
    band(7.39, "PRINTING", 1.81),
    colourRow(6.21, "No. of Colors", 0.89, "colorNo", true),
    colourRow(6.7, "Given By Client", 1.28, "givenByClient"),
    colourRow(6.49, "Color Shade Verified", 1.35, "colorShadeVerified"),
    {
      h: 7.0,
      cells: [label(41.3, "shadeMatchGrade", 1.72), box(14.8, "shadeMatchGrade", { a: "c" }), label(30.5, "remarksForShade", 1.72, { x: 1.23, b: true }), box(106.8, "remarksForShade", { x: 2.57 })],
    },
    {
      h: 6.23,
      cells: [words(41.3, "Text    Matter Verification", 1.83), box(14.8, "textMatterVerification", { a: "c" }), label(46.0, "remarksForTextVerification", 1.83, { x: 1.23, b: true }), box(91.3, "remarksForTextVerification", { x: 2.95 })],
    },
    { h: 6.14, cells: [label(36.4, "barCodeGrade", 1.28), box(30.0, "barCodeGrade", { a: "c" }), label(31.9, "barCodeRemarks", 1.28, { x: 1.45 }), box(95.1, "barCodeRemarks", { x: 1.53 })] },
    band(7.55, "COATING", 1.54),
    {
      h: 6.38,
      cells: [
        label(25.3, "coatingDone", 1.44, { open: "r" }),
        box(46.4, "coatingDone", { x: 1.5 }),
        centred(16.5, "Aqueous", 1.44),
        centred(13.9, "U.V", 1.44),
        centred(17.8, "Lamination", 1.44),
        centred(29.6, "Achieved Gloss", 1.44),
        centred(43.9, "Scuff Test", 1.44),
      ],
    },
    {
      h: 6.64,
      cells: [
        words(71.7, "Minimum Gloss Required at 60{ring}", 1.83),
        box(16.5, "aqueous", { a: "c" }),
        box(13.9, "uv", { a: "c" }),
        box(17.8, "lamination", { a: "c" }),
        box(29.6, "achievedGloss", { a: "c" }),
        box(43.9, "scuffTest", { x: 0.8 }),
      ],
    },
    band(6.79, "FINISHING", 1.3),
    { h: 6.22, cells: [label(45.0, "finishingQualityGrade", 1.19), box(17.0, "finishingQualityGrade", { a: "c" }), blank(131.4)] },
    { h: 5.49, cells: [label(45.0, "perforationQuality", 1.44, { x: 11.62 }), box(43.2, "perforationQuality", { x: 1.88 }), label(31.2, "rewindingQuality", 1.44, { x: 1.62 }), box(74.0, "rewindingQuality", { x: 3.17 })] },
    { h: 6.28, cells: [label(45.0, "holdingGlueQuality", 1.46, { x: 11.62 }), box(43.2, "holdingGlueQuality", { x: 1.88 }), label(31.2, "packingQuality", 1.46, { x: 1.62 }), box(74.0, "packingQuality", { x: 3.17 })] },
    { h: 5.64, cells: [label(45.0, "whiteOpacity", 1.14, { x: 11.62 }), box(43.2, "whiteOpacity", { x: 1.88 }), label(31.2, "slittingQuality", 1.14, { x: 1.62 }), box(74.0, "slittingQuality", { x: 3.17 })] },
    { h: 6.02, cells: [label(59.0, "remarksForFinishingQuality", 1.3), box(134.4, "remarksForFinishingQuality", { x: 2.75 })] },
    { h: 5.27, cells: [label(59.0, "finalInspection", 1.08), box(134.4, "finalInspection", { x: 2.75 })] },
    { h: 5.98, cells: [label(59.0, "overAllQualityRemarks", 1.66), box(134.4, "overAllQualityRemarks", { x: 2.75 })] },
    band(7.18, "TOLERANCE", 1.12),
    // The sleeve's first column is wider than the label's, its words where the label's stand; its Microns column right of the middle.
    ...toleranceRows([40.6, 38.5, 39.1, 36.7, 38.5], [6.21, 5.57, 6.49], [1.5, 1.09, 0.69], [[-1, 0, -5.1], [-1, 4, 1.6]]),
    { h: 12.14, cells: [{ w: W, lab: "@printedAbove:retestOn:0-1", x: 10.92, y: 2.24, lh: 5.67, bullets: 3.2, heavy: "b" }] },
    { h: 4.94, cells: [{ w: W, lab: "@printedAbove:retestOn:2", b: true, a: "c", f: "arial", y: 1.06, heavy: "b" }] },
    {
      h: 4.67,
      cells: [{ w: W, sentence: { before: "This material should be retested on", box: "retestOn", after: "before usage.", boxWidth: 18 }, b: true, a: "c", f: "arial", y: 1.16, heavy: "b" }],
    },
  ],
  foot: coaFoot(11.54, 16.86, 0.99, 15.5),
};

export const QC_PAPER_TABLES: Record<string, PaperTable> = {
  "qc-coa-label": COA_LABEL,
  "qc-coa-sleeve": COA_SLEEVE,
};

/** The paper a document is drawn as, row by row, or undefined (every other document is drawn as it was). */
export const paperTableFor = (documentId: string): PaperTable | undefined => QC_PAPER_TABLES[documentId];
