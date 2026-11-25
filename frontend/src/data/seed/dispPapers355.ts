// THE DISPATCH FORMATS DRAWN AS THE OWNER'S OWN PAPERS (REQUIREMENTS §372; the owner, 24/25-Nov-2026: "same format present in my
// system which is present in google drive ... whenever user download any document of any module or take a print on A4 size
// paper, that should be very perfect"). Each is read off the printout of his own Word file (source-documents/originals-pdf,
// measured with pymupdf: every rule and every line of words in mm) and drawn rule by rule:
//
//   F/DISP/01 Safe Transporter Agreement: three pages under the underlined title his Word header repeats, the clauses with
//     their bullets and bold words, the headings bold and underlined, the signature table on page 3. His file prints no
//     company box and no format number (§329), so neither is printed: the number is shown on the screen only.
//   F/DISP/02 Container Stuffing & Vehicle Inspection Record: his Gujarati page, the letterhead on both pages with its own
//     "Page No.: 1 Of 2", the seven instructions, the consignment's boxes, the checklist with હા / નાં printed in two cells
//     (the answer ringed), the two authorisations, and their names, designations and signs on page 2.
//   F/DISP/04 Vehicle (Company Owned) Cleaning Protocol & Record: landscape, the letterhead with the vehicle in its title's
//     blank, the protocol in its box with the four vehicles in their cells, and the grid of two sets of four columns: its
//     heading and first line at the foot of page 1, fifteen lines on page 2, as his file prints them.
//
// Every printed word is his and is typed over on a record (ownWords, §275); every place a person writes is the record's box,
// bound to the layout's own keys (data/seed/dispatchLayouts.ts). No colours (§282). Dates print dd-mm-yyyy.

import type { PaperCell, PaperRow, PaperTable } from "./qcPaperTables";
import { COMPANY_VEHICLES } from "./dispatchLayouts";

/** A cell with no rules and no words: the space beside a table. */
const blank = (w: number, more: Partial<PaperCell> = {}): PaperCell => ({ w, t: "", edges: "", ...more });

// ===========================================================================
// F/DISP/01 — SAFE TRANSPORTER AGREEMENT (portrait, three pages)
// ===========================================================================

/** The page from 16.0 mm (his bullets at 16.3) to 205.0 mm; his words start at 22.6 mm. */
const A_W = 189;
const A_BULLET = 6.6;
const A_TEXT = A_W - A_BULLET;
/** His line pitch: Calibri 12 pt at 1.5 lines, 7.75 mm. */
const A_LH = 7.75;
const A_PT = 12;

/** A clause: the bullet, then its lines as his file breaks them. */
const clause = (text: string, more: Partial<PaperCell> = {}): PaperRow => ({
  h: A_LH * text.split("\n").length,
  cells: [
    { w: A_BULLET, t: "•", x: 0.3, lh: A_LH, edges: "" },
    { w: A_TEXT, t: text, lh: A_LH, edges: "", ...more },
  ],
});
/** Words his file sets on without a bullet (a heading, the last paragraph). */
const unbulleted = (text: string, more: Partial<PaperCell> = {}): PaperRow => ({
  h: A_LH * text.split("\n").length,
  cells: [blank(A_BULLET), { w: A_TEXT, t: text, lh: A_LH, edges: "", ...more }],
});
const heading = (text: string): PaperRow => unbulleted(text, { b: true, u: true });

/** His Word header, on every page: the space above the title, then "SAFE TRANSPORTER AGREEMENT" (39.0 mm down). */
const agreementHead = (page: number): PaperRow[] => [
  { h: 25.4, cells: [blank(A_W, page > 1 ? { pl: "0:0" } : {})], ...(page > 1 ? { pb: true as const } : {}) },
  // (centred on his text's width, 22.6 to 202.5 mm: 2.05 mm right of the cell's middle)
  { h: 6.0, cells: [{ w: A_W, t: "SAFE TRANSPORTER AGREEMENT", b: true, u: true, a: "c", cx: 2.05, pt: 12.96, y: 1.6, edges: "", ...(page > 1 ? { pl: "1:0" } : {}) }] },
];

/** His signature table on page 3: 20.45 to 187.9 mm, four columns. */
const A_TABLE = [41.02, 40.74, 40.77, 44.93];
const A_TABLE_LEFT = 4.45;
const A_TABLE_RIGHT = A_W - A_TABLE_LEFT - A_TABLE.reduce((a, b) => a + b, 0);
const signRow = (label: string, ours: string, theirs: string, h: number): PaperRow => ({
  h,
  cells: [
    blank(A_TABLE_LEFT),
    { w: A_TABLE[0], t: label, x: 2.15, y: 0.9, edges: "ltrb" },
    { w: A_TABLE[1], box: ours, x: 1.7, y: 0.9, lines: true, edges: "ltrb" },
    { w: A_TABLE[2], t: label, x: 1.9, y: 0.9, edges: "ltrb" },
    { w: A_TABLE[3], box: theirs, x: 1.9, y: 0.9, lines: true, edges: "ltrb" },
    blank(A_TABLE_RIGHT),
  ],
});

const SAFE_TRANSPORTER_PAPER: PaperTable = {
  page: "portrait",
  left: 16.0,
  top: 12.0,
  font: "calibri",
  pt: A_PT,
  rules: "cells",
  ownWords: true,
  flows: true,
  // His file prints no format number, revision or page (§329): shown on the screen only, to be typed over there.
  numberOffPaper: true,
  head: agreementHead(1),
  body: [
    // ---- page 1
    clause(
      "In order to maintain Quality, Product safety, integrity & legality of the products being supplied by us,\nfollowing standards & code of practices are required to be followed by contract transport / distribution\nservice providers."
    ),
    // The period the agreement holds for: the record's two dates, bold, where his clause prints them.
    {
      h: A_LH,
      cells: [
        { w: A_BULLET, t: "•", x: 0.3, lh: A_LH, edges: "" },
        { w: 64.8, t: "This contract is valid for the period of", lh: A_LH, edges: "" },
        { w: 20.3, box: "validFrom", b: true, a: "c", vm: true, edges: "" },
        { w: 4.8, t: "to", a: "c", lh: A_LH, edges: "" },
        { w: 19.5, box: "validTo", b: true, a: "c", vm: true, edges: "" },
        { w: A_TEXT - 64.8 - 20.3 - 4.8 - 19.5, t: ", unless any major changes in technical", lh: A_LH, edges: "" },
      ],
    },
    unbulleted("aspects.  This contract doesn’t contain any commercial values."),
    clause(
      "GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED will inspect the vehicle presented by the\ntransport company to ensure that it complies with this Code of Practice before it is loaded with product.",
      { bs: [0, 47] }
    ),
    clause("Vehicle drivers shall comply with site hygiene rules & shall not enter any of the restricted area including\nprocessing & warehouse"),
    clause("All vehicles shall have valid registration, PUC & driver shall have valid driving license"),
    clause("Vehicle / container shall not have any sharp edges, nails protruded or uneven surface"),
    clause("Ensure compliance to applicable regulatory requirements as per your business setup"),
    heading("Damage / Contamination"),
    clause(
      "Chemicals (Oil, Grease, Pesticides), Perishable foods, products with excessive odour / fragrance etc. or\nany products which can compromise the safety & integrity plastic packaging materials produced by us,\nmust not be stored or transported in conjunction with any product that could cause damage to or\ncontamination of our products."
    ),
    clause(
      "You will ensure that no Vehicle would be sent which has in last consignment dispatched any type of\nChemicals / Pesticides or any spillage of material from the previous consignment. In case of emergency,\nthe vehicles will be sent with proper cleaning & fumigation process as per our requirement & with our\nprior consent & approval"
    ),
    clause("The vehicle should be in a clean condition and free from contaminants that would render it unsuitable\nfor the transportation of plastic packaging materials produced by us."),
    heading("Loading / Protection"),
    clause(
      "Plastic packaging materials produced by us must be protected from the elements whilst in the care of\nthe transport company. Handling of packed pallets or boxes during loading must be such that the\npackaging material and its protective coverings are not damaged."
    ),
    clause("Products must be loaded so as to prevent movement during the journey."),
    clause("If the transport company is of the opinion that the product is not stable or secure enough to withstand\nthe intended journey, then they shall reject the load."),
    // ---- page 2
    ...agreementHead(2),
    clause(
      "The Transport Company must ensure that vehicles are of hygienic design and designated for safe\ntransportation of packaging materials use, and procedures must be in place to prevent cross\ncontamination from previous loads."
    ),
    clause("If previous loads contain the objectionable materials which can put the safety of our products at risk,\nshall be informed to us"),
    clause("Any open vehicles shall be covered with tarpaulin during transportation to prevent from external\nenvironmental implications"),
    clause("Contracted transport and distribution shall be undertaken in such a way as to prevent our product being\nexposed to the risk of contamination including taint or odour"),
    heading("Load Acceptance"),
    clause("The acceptance of the load by the transport company confirms that the above procedures have been\nfollowed."),
    heading("Product Security & Integrity"),
    clause("All products being transported must be secure at all times."),
    clause("It is the loaders responsibility to ensure all products are secure."),
    clause("Trailer doors are to be opened immediately prior to loading and must be securely closed immediately\nafter loading."),
    clause("All products are to be unloaded and loaded at secure loading bays."),
    clause("Drivers must not leave the vehicle abandoned during transit"),
    clause("During transit for any breaks such as tea or food break, it shall be at designated eating place, which shall\nbe safe & can ensure the integrity of the vehicle"),
    clause("In case of any suspicious activities related to breakage or tempering of seal, immediately inform to us\nbefore delivery of the products to our prescribed destination"),
    heading("Vehicle breaks down in transit"),
    clause("If the vehicle breaks down, drivers are to contact the Transport Manager immediately, who should then\ninform the relevant customer depot."),
    clause("The Transport Manager is to contact the approved vendor for vehicle breakdown assistance, or a\nreplacement vehicle."),
    clause("If the vehicle breaks down but the doors have been opened, drivers are to contact the Transport\nManager immediately."),
    // ---- page 3
    ...agreementHead(3),
    clause(
      "On Arrival Inspection - The load will be inspected by the receiver before being unloaded.  If the load\narrives damaged, received in an unsatisfactory condition, or not transported in accordance with this\nCode of Practice the receiver has the right to reject the load."
    ),
    clause("In Case of Rejection - Any costs of rejection will be borne by the party responsible for the cause of the\nrejection."),
    clause("To confirm that you have been made aware of this Code of Practice please complete the details below\nand return to us as soon as possible, not later than 7 days from the date of our submission."),
    unbulleted(
      "If you cannot comply with any of the requirements contained in the Code of Practice, please state the\nreasons on a supplementary sheet. If you have questions, please contact our representative."
    ),
    { h: 0.6, cells: [blank(A_W)] },
    // The two parties side by side: the transporter named in its heading (the record's box).
    {
      h: 16.56,
      cells: [
        blank(A_TABLE_LEFT),
        { w: A_TABLE[0] + A_TABLE[1], t: "For, GUJARAT PRINT PACK PUBLICATIONS\nPRIVATE  LIMITED", b: true, x: 2.15, y: 1.4, lh: 7.8, edges: "ltrb" },
        {
          w: A_TABLE[2] + A_TABLE[3],
          b: true,
          x: 1.9,
          y: 0.9,
          edges: "ltrb",
          sentence: { before: "For Transporter - M/s", box: "transporterName", after: "", boxWidth: 40, pw: true },
        },
        blank(A_TABLE_RIGHT),
      ],
    },
    signRow("Name of the person", "gppName", "transporterPerson", 8.29),
    signRow("Designation", "gppDesignation", "transporterDesignation", 8.26),
    signRow("Sign", "gppSign", "transporterSign", 8.3),
    signRow("On dated", "gppDated", "transporterDated", 8.13),
  ],
  foot: [],
};

// ===========================================================================
// F/DISP/02 — CONTAINER STUFFING & VEHICLE INSPECTION RECORD (portrait, two pages, Gujarati)
// ===========================================================================

/** The page from 16.75 mm to 200.1 mm (his checklist's right rule); the letterhead and the other tables end at 193.3 mm. */
const B_W = 183.35;
const B_IN = 176.55;
const B_OUT = B_W - B_IN;
const B_PT = 9.96;
/** The letterhead's number band: Format No. | Rev No | Date | Page No. */
const B_BAND = [52.55, 39.7, 41.3, 43.0];

/** His Word header, on both pages: the company, the title, the number band with this page's number. */
const containerHead = (page: number): PaperRow[] => {
  const pl = (place: string) => (page > 1 ? { pl: place } : {});
  return [
    {
      h: 11.7,
      ...(page > 1 ? { pb: true as const } : {}),
      cells: [{ w: B_IN, t: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", b: true, a: "c", pt: 18, vm: true, ...pl("0:0") }, blank(B_OUT)],
    },
    { h: 11.5, cells: [{ w: B_IN, t: "CONTAINER STUFFING & VEHICLE INSPECTION RECORD", b: true, a: "c", pt: 14.04, vm: true, ...pl("1:0") }, blank(B_OUT)] },
    {
      h: 7.7,
      cells: [
        { w: B_BAND[0], t: "Format No.: F/DISP/02", x: 1.75, vm: true, ...pl("2:0") },
        { w: B_BAND[1], t: "Rev No: 00", x: 1.7, vm: true, ...pl("2:1") },
        { w: B_BAND[2], t: "Date: 01.12.2021", x: 1.6, vm: true, ...pl("2:2") },
        // (numbered for each page by the sheet: "Page No.: 1 Of 2", "Page No.: 2 Of 2")
        { w: B_BAND[3], t: `Page No.: ${page} Of 2`, x: 1.6, vm: true },
        blank(B_OUT),
      ],
    },
  ];
};

/** An instruction, its lines as his page breaks them (6.85 mm apart), standing 8.65 mm in (25.4 mm on the page). */
const instruction = (text: string): PaperRow => ({
  h: 6.85 * text.split("\n").length,
  cells: [blank(8.65), { w: B_IN - 8.65, t: text, lh: 6.85, edges: "" }, blank(B_OUT)],
});

/** The consignment's boxes: two to a row, each label in its own ruled cell. */
const B_DETAILS = [40.45, 55.8, 34.7, 45.6];
const detailRow = (h: number, left: string, leftBox: string, right: string, rightBox: string): PaperRow => ({
  h,
  cells: [
    { w: B_DETAILS[0], t: left, x: 2.55, y: 1.2 },
    { w: B_DETAILS[1], box: leftBox, x: 1.5, vm: true },
    { w: B_DETAILS[2], t: right, x: 1.9, y: 1.2 },
    { w: B_DETAILS[3], box: rightBox, x: 1.5, vm: true },
    blank(B_OUT),
  ],
});

/** The checklist's columns: ક્રમ નં. | ચેકલિસ્ટ | હા | નાં | જો કોઈ અન્ય અવલોકનો હોય. */
const B_CHECKS = [16.65, 92.1, 17.4, 20.7, 36.5];
/** His checklist's line heights, 1 to 4 then 6 to 9 (the paper has no 5). */
const B_CHECK_H = [12.0, 12.1, 12.0, 9.0, 9.1, 9.1, 9.1, 13.5];
const checkRow = (ln: number): PaperRow => ({
  h: B_CHECK_H[ln],
  line: ln,
  cells: [
    { w: B_CHECKS[0], col: "checkNo", ln, a: "c", vm: true },
    { w: B_CHECKS[1], col: "checklist", ln, x: 1.8, y: 1.2, lh: 5.9 },
    // હા and નાં printed in their own cells: the answer is ringed (NA, the third answer, is struck out by hand on his paper).
    { w: B_CHECKS[2], pick: [{ col: "compliance", ln, value: "હા", word: "હા", mark: "ring" }], a: "c", y: 1.2 },
    { w: B_CHECKS[3], pick: [{ col: "compliance", ln, value: "નાં", word: "નાં", mark: "ring" }], a: "c", y: 1.2 },
    { w: B_CHECKS[4], col: "observations", ln, x: 1.2, y: 1.2, lh: 5.9, lines: true },
  ],
});

/** Page 2's table: નામ, હોદ્દો, સાઇન for each side. */
const B_SIGN = [24.05, 66.4, 24.5, 61.6];
const signedRow = (h: number, label: string, left: string, right: string): PaperRow => ({
  h,
  cells: [
    { w: B_SIGN[0], t: label, x: 2.55, y: 1.2 },
    { w: B_SIGN[1], box: left, x: 1.5, vm: true },
    { w: B_SIGN[2], t: label, x: 1.9, y: 1.2 },
    { w: B_SIGN[3], box: right, x: 1.5, vm: true },
    blank(B_OUT),
  ],
});

const CONTAINER_STUFFING_PAPER: PaperTable = {
  page: "portrait",
  left: 16.75,
  top: 6.6,
  font: "calibri",
  pt: B_PT,
  rules: "cells",
  ownWords: true,
  flows: true,
  head: containerHead(1),
  body: [
    { h: 4.9, cells: [blank(B_W)] },
    instruction("1. તેના આગમન પર કન્ટેનર ખોલો."),
    instruction(
      "2. જુઓ કે તે કોઈપણ પ્રકારના દૃશ્યમાન સંકટથી મુક્ત છે (દા.ત. - ગંદકી, ધૂળ, અગાઉના શિપમેન્ટના રાસાયણિક\nઅવશેષો, પક્ષીઓની છી, ખાદ્ય ચીજો, કોઈપણ વાંધાજનક વસ્તુઓ વગેરે). જો કોઈ નુકસાન/સફાઈ ન કરી શકાય તેવી\nસ્થિતિ મળી આવે, તો કન્ટેનર પરત કરો. ત્યાં કોઈ વાંધાજનક ગંધ હોવી જોઈએ નહીં"
    ),
    instruction("3. જો જરૂરી હોય તો કન્ટેનર સાફ કરો."),
    instruction("4. જો લોડિંગ તરત જ શરૂ ન થાય તો કન્ટેનર લોડિંગ સમયે જ બંધ અને ખોલવું જોઈએ."),
    instruction("5. કન્ટેનરનો ફ્લોર સુઘડ અને સ્વચ્છ ફેબ્રિકથી ઢંકાયેલો હોવો જોઈએ, માત્ર ગાંસડીના કિસ્સામાં."),
    instruction("6. લોડિંગ સમર્પિત કેનોપી હેઠળ થવું જોઈએ."),
    instruction("7. લોડ થઈ જાય પછી કન્ટેનર તરત જ બંધ કરવું જોઈએ."),
    { h: 0.4, cells: [blank(B_W)] },
    detailRow(9.1, "તારીખ", "date", "ગ્રાહકનું નામ", "customerName"),
    detailRow(11.9, "ઇન્વોઇસ નં.", "invoiceNo", "આંતરિક પીઓ નંબર", "internalPoNumber"),
    detailRow(9.1, "ડ્રાઈવરનું નામ", "driverName", "ગ્રાહક પીઓ નંબર", "customerPoNumber"),
    detailRow(9.0, "ટ્રાન્સપોર્ટરનું નામ", "transporterName", "વાહન નં.", "vehicleNo"),
    { h: 7.1, cells: [blank(8.65), { w: B_W - 8.65, t: "પરિવહન વાહન નિરીક્ષણ અહેવાલ", y: 1.2, edges: "" }] },
    {
      h: 13.8,
      head: true,
      cells: [
        { w: B_CHECKS[0], t: "ક્રમ નં.", a: "c", vm: true },
        { w: B_CHECKS[1], t: "ચેકલિસ્ટ", a: "c", vm: true },
        { w: B_CHECKS[2] + B_CHECKS[3], t: "પાલન\n(NA સ્ટ્રાઈક આઉટ)", a: "c", vm: true, lh: 6.8 },
        { w: B_CHECKS[4], t: "જો કોઈ અન્ય\nઅવલોકનો હોય", a: "c", vm: true, lh: 6.8 },
      ],
    },
    ...B_CHECK_H.map((_, ln) => checkRow(ln)),
    { h: 5.1, cells: [blank(B_W)] },
    {
      h: 12.1,
      cells: [
        { w: B_SIGN[0] + B_SIGN[1], t: "(ડિસ્પેચ ઇન્ચાર્જ) પ્રોડક્ટ રિલીઝ ઓથોરાઇઝેશન", x: 2.55, y: 1.2 },
        { w: B_SIGN[2] + B_SIGN[3], t: "(QC) દ્વારા ચેક અને મંજૂર", x: 1.9, y: 1.2 },
        blank(B_OUT),
      ],
    },
    // ---- page 2: his header again, then the names, designations and signs
    ...containerHead(2),
    { h: 5.5, cells: [blank(B_W)] },
    signedRow(12.0, "નામ", "dispatchAuthorisation", "qcApprovalName"),
    signedRow(12.1, "હોદ્દો", "dispatchDesignation", "qcApprovalDesignation"),
    signedRow(12.0, "સાઇન", "dispatchSign", "qcApprovalSign"),
  ],
  foot: [],
};

// ===========================================================================
// F/DISP/04 — VEHICLE (COMPANY OWNED) CLEANING PROTOCOL & RECORD (landscape, two pages)
// ===========================================================================

/** The page from 10.9 mm (his letterhead's left rule) to 292.1 mm (his grid's right rule). */
const C_W = 281.2;
/** The letterhead: 10.9 to 290.9 mm; the protocol's box: 10.9 to 289.3 mm. */
const C_HEAD = 280.0;
const C_BOX = 278.4;
/** A set of the grid's four columns: Date | Type of cleaning (Dry / Wet) | Driver sign | Dispatch In-charge (Random verification). */
const C_SET = [35.1, 35.0, 34.9, 35.1];
/** Between his two sets: the rule his second set's Date draws (the first set's last column does not rule its right). */
const C_GAP = 1.0;
const C_HEADINGS = ["Date", "Type of cleaning\n(Dry / Wet)", "Driver sign", "Dispatch In-charge\n(Random\nverification)"];

const VEHICLE_CLEANING_PAPER: PaperTable = {
  page: "landscape",
  left: 10.9,
  top: 12.7,
  font: "calibri",
  pt: 12,
  rules: "cells",
  ownWords: true,
  flows: true,
  head: [
    { h: 12.5, cells: [{ w: C_HEAD, t: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", b: true, u: true, a: "c", pt: 14.04, vm: true }, blank(C_W - C_HEAD)] },
    // The vehicle this sheet is for, in his title's blank.
    {
      h: 12.2,
      cells: [
        {
          w: C_HEAD,
          b: true,
          u: true,
          a: "c",
          pt: 15.96,
          vm: true,
          sentence: { before: "VEHICLE (COMPANY OWNED) CLEANING PROTOCOL & RECORD [ Vehicle number:", box: "vehicleNumber", after: "]", boxWidth: 66, pw: true },
        },
        blank(C_W - C_HEAD),
      ],
    },
    {
      h: 8.6,
      cells: [
        { w: 90.3, t: "Format No.: F / DISP / 04", b: true, a: "c", pt: 14.04, vm: true },
        { w: 90.0, t: "Rev. no. – 01", b: true, a: "c", pt: 14.04, vm: true },
        { w: 99.7, t: "Effective date: - 01-11-2023", b: true, a: "c", pt: 14.04, vm: true },
        blank(C_W - C_HEAD),
      ],
    },
    { h: 3.7, cells: [blank(C_W)] },
  ],
  body: [
    // The protocol, in its box.
    { h: 10.2, cells: [{ w: C_BOX, t: "Protocol for Cleaning of Company Owned Vehicle as mentioned below.", b: true, x: 2.2, y: 3.2, edges: "ltr" }, blank(C_W - C_BOX)] },
    {
      h: 10.1,
      cells: [
        { w: 2.3, t: "", edges: "l" },
        ...COMPANY_VEHICLES.map((v): PaperCell => ({ w: 66.5, t: v, b: true, x: 1.9, vm: true })),
        { w: C_BOX - 2.3 - 4 * 66.5, t: "", edges: "r" },
        blank(C_W - C_BOX),
      ],
    },
    ...[
      ["Company owned vehicles shall be exclusively used for transportation of Finish products to customers or Transporters.", 10.1, "l", "r"],
      ["Each vehicle shall be Daily cleaned with dry mopping & wet mopping with on weekly basis. Record of cleaning shall be maintained as below.", 10.0, "l", "r"],
      ["Each vehicle shall be checked for any objectionable material, Odour, sign of pest or foreign matter & to be effectively cleaned to remove any sign or\ntrace of such material.", 18.3, "lb", "rb"],
    ].map(
      ([text, h, left, right]): PaperRow => ({
        h: h as number,
        cells: [
          { w: 9.7, t: "•", x: 4.7, y: 3.0, lh: 8.9, b: true, edges: left as string },
          { w: C_BOX - 9.7, t: text as string, b: true, y: 3.0, lh: 8.9, edges: right as string },
          blank(C_W - C_BOX),
        ],
      })
    ),
    // His empty lines under the protocol: the grid's heading and first line stand at the foot of page 1.
    { h: 71.7, cells: [blank(C_W)] },
    {
      h: 15.0,
      cells: [
        ...C_HEADINGS.map((t, i): PaperCell => ({ w: C_SET[i] + (i === 3 ? C_GAP : 0), t, b: true, pt: 9.96, x: 1.9, y: 0.8, lh: 4.97 })),
        ...C_HEADINGS.map((t, i): PaperCell => ({ w: C_SET[i], t, b: true, pt: 9.96, x: 1.9, y: 0.8, lh: 4.97 })),
      ],
    },
  ],
  // Two sets side by side on each ruled line: the record's lines fill the first set, then the second (lines 17 to 32).
  lines: {
    h: 7.05,
    count: 16,
    blocks: 2,
    gap: C_GAP,
    cells: [
      { w: C_SET[0], col: "date", x: 1.9, vm: true, pt: 11, edges: "ltrb" },
      { w: C_SET[1], col: "cleaningType", x: 1.9, vm: true, pt: 11, edges: "trb" },
      { w: C_SET[2], col: "driverSign", x: 1.9, vm: true, pt: 11, edges: "trb" },
      { w: C_SET[3], col: "dispatchInCharge", x: 1.9, vm: true, pt: 11, edges: "tb" },
    ],
  },
  foot: [],
};

export const DISP_PAPERS_355: Record<string, PaperTable> = {
  "disp-safe-transporter-agreement": SAFE_TRANSPORTER_PAPER,
  "disp-container-stuffing": CONTAINER_STUFFING_PAPER,
  "disp-vehicle-cleaning": VEHICLE_CLEANING_PAPER,
};
