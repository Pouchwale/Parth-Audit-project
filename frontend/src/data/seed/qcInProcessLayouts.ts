import type { LogSheetLayout } from "../../types";

// F/QC/13 — IN PROCESS QUALITY CONTROL, the Gujarati form the QA person grades a printing job's sample sheets on
// (REQUIREMENTS §57, §58), as the owner's original of 13-Oct-2026: "F-QC-13 IPQC format (2).jpg" in
// source-documents/qc-originals-2026-10-13/ (REQUIREMENTS §111). Every line below is the paper's own Gujarati,
// its spellings and spacing included ("વ્યકિત", "મેનેઝર", "સેડ", "ટેકસ", "રહયા", "છેં" with its stray
// anusvara, "તી" for "ની" in the print-pressure F grade, "સેમ્પલ કોલીટી"); with English chosen it reads in
// English from i18n/documentTextEn.ts, as it always did. The page prints no format number of its own: F/QC/13
// is the department's number for it.

/** The procedure printed at the head of the page. */
export const FQC13_PROCEDURE =
  "પ્રોસીઝરઃ– ઉત્પાદન ની પ્રક્રિયા દરમિયાન Q.A. વ્યકિત ખાતરી કરશે કે ૩ પૂર્ણ સીટ્સ ના જોબના દર ૬૦૦૦ મીટરે નમુના લેવામાં આવે. તે નમુના ઓને નીચે જણાવેલા પોઈન્ટ પ્રમાણે ચકાશી ને ગ્રેડ આપશે. જો કોઈ સમસ્યા ઓની જાણ થાય તો તરતજ Q.A. મેનેજર અને સુપરવાઈઝર ને જાણ કરશે. જો મટીરીયલ સ્વીકાર્ય છે. તો Q.A. મેનેઝર તેમજ સુપરવાઈઝર ની શહી કરાવવી આવશ્યક છે.";

/** The grade criteria table printed under the procedure: સ.નં | પેરામીટર | ગ્રેડ ક્રાઈટ, the four grades one to a line. */
export const FQC13_GRADE_CRITERIA: string[][] = [
  [
    "૧",
    "રજિસ્ટ્રેશન",
    [
      "A– બધાજ રજિસ્ટર સંપુર્ણ પણે બરાબર છે. કોઈપણ પ્રીન્ટ ખરાબ ઠરાવવામાં આવી નથી.",
      "B– રજિસ્ટર માં અને પ્રીન્ટના વિસ્તારમાં ન્યૂનત્તમ નોધણી મળી.",
      "C– રજિસ્ટર માં મધ્યમ ગેરરીતી મળી, પરંતુ પ્રીન્ટ અને ટેકસ માં ઓવર લાઈન્સ બતાવતું નથી.",
      "F– મોટી અને ગંભીર ગેરરીતી ના મુદા ઓ અથવા ઓવરલેપ લાઈન્સ સ્પષ્ટ પણે દેખાય છે.",
    ].join("\n"),
  ],
  [
    "૨",
    "શેડ",
    [
      "A– બધાજ સેડો, કલર ના સંદર્ભ મુજબ બરાબર મળી રહયા છે.",
      "B– લોગો બરાબર રહયો છે, પરંતુ બીજા કલરો માં નાના ફેરફારો જોવા મળે છે.",
      "C– લોગો અને પ્રોસેસ કલર માં નાના ફેરફાર જોવા મળે છે.",
      "F– લોગોના કલર માં મધ્યમ ફેરફાર અને બીજા કલરો મોટા ફેરફાર જોવા મળી રહયા છે.",
    ].join("\n"),
  ],
  [
    "૩",
    "કોટીંગ",
    [
      "A– કોટીંગ ના તમામ ક્ષેત્રો સરળ, સ્પોટ, મળી રહયા છે. અને કરચલી વગર ના",
      "B– કોટીંગ વાળા વિસ્તાર માં નાની–નાની કરચલીઓ  અને બબલસ મળી આવે છે.",
      // The coating's C and F repeat the shade's, as the paper prints them.
      "C– લોગો અને પ્રોસેસ કલર માં નાના ફેરફાર જોવા મળે છે.",
      "F– લોગોના કલરમાં મધ્યમ ફેરફાર અને બીજા કલરો મોટા ફેરફાર જોવા મળી રહયા છે.",
    ].join("\n"),
  ],
  [
    "૪",
    "પંચીંગ",
    [
      "A– છીછરૂ પંચીંગ અથવા ગેરસમજ દેખાય છે.",
      "B– ઓછામાં ઓછું ઉંડું પંચીંગ અથવા ખોટી નોધણી નું અવલોકન થાય છેં",
      "C– ન્યુનત્તમ છીછરૂ પંચીંગ અથવા મધ્યમ ગેરમાર્ગે પંચીંગ નજર માં આવે છે. (ટેકસ પર મંજુરી નથી)",
      "F– ખુબજ વધારે ઉંડું પંચીંગ ભારે ગેરરીતી મળી.",
    ].join("\n"),
  ],
  [
    "૫",
    "પ્રીન્ટ પ્રેસર",
    [
      "A– ઉચ્ચ અને નીચા છાપ ના દબાણ વાળા કોઈપણ ક્ષેત્ર મળ્યા નથી.",
      "B– ન્યુનત્તમ દબાણની સમસ્યા મળી. લોગો અને ચાવીરૂપ અસકય મતો ને અસર થતી નથી.",
      "C– મધ્યમ દબાણની સમસ્યા મળી લોગો અને બારકોડ પર અસર થતી નથી.",
      "F– લોગો અને બારકોડ પર મુખ્ય દબાણ તી અસર ગ્રસ્ત છે.",
    ].join("\n"),
  ],
  [
    "૬",
    "પ્રીન્ટ ડીફોરમીટસ",
    [
      "A– કોઈ નાની અથવા મુખ્ય પ્રિન્ટ ની વિકૃતી નુ અવલોકન થાય છે.",
      "B– પ્રિન્ટ વિસ્તાર માં ફીકી અથવા નાની બબલ્સ મળી આવે છે.",
      "C– ટેકસ માં લોગો ના કે નોનપ્રિન્ટ વિસ્તાર માં નાની વિકૃતી મળી આવે છે.",
      "F– ફ્રેમસ, લોગોના કે નોનપ્રિન્ટ વિસ્તાર માં મોટી વિકૃતી મળી આવે છે.",
    ].join("\n"),
  ],
];

/** The six lines of the grid: the paper's own સ.નં, the parameter and its ટેસ્ટ ક્રાઈટ. */
export const FQC13_TESTS: [string, string, string][] = [
  ["૧", "રજિસ્ટ્રેશન", "બધા જ ચાર ખુણા ઓનું રજીસ્ટ્રેશન અને લેબલ નું કેન્દ્ર નિયત્રણમાં હોવુ જોઈએ બધાજ ઓવરલેપીગ અને નીયત્રણની નોધણીને ચશમાં નો ઉપયોગ કરીને તપાસો."],
  ["૨", "શેડ", "સીટ ના શેડ ને તપાસવા માટે શેડ કાર્ડ, પેન્ટોન કોડ અને છેલ્લા સપ્લાય ની સીટ નો ઉપયોગ કરવો, કલાયન્ટ ની મેચીંગ સ્ટડી મુજબ જ સેડ મેચ થવો જોઈ એ."],
  ["૩", "કોટીંગ", "કોટીંગ સમાન રૂપે લાગું થઈ રહયું છે અને ત્યા કોઈ લેમીનેશન માં બબલ્સ ની રચના ઓ નથી તેની ખાતરી કરો, વાર્નિસ ન હોય તેવા વિસ્તારો, અસમાન વાર્નિસ અને વિંડોઝ ના વિસ્તાર માં પણ વાર્નિસ તપાસ કરો"],
  ["૪", "પંચીંગ", "દરેક સીટ માં થોડું હાથથી પ્રેસર આપીને, રીલીઝ લાઈનર પર પણ તપાસો કે તુટતું નથી. તેની ચોકકસ તપાસ કરો. છીછરૂ પંચીંગ તપાસવા, અમુક લેબલો કાઢી ને તપાસો. નીચેનું પેપર જરાય પણ તુટે નહી તે રીતે લેબલ આસાની થી ઉખાડવું જોઈ એ તેની તપાસ કરો."],
  ["૫", "પ્રીન્ટ પ્રેસર", "લેબલ ચાર ખુણા ઓ અને સીટના વચ્ચેના કેન્દ્ર માં ખુબજ વધારે અથવા ખુબજ ઓછા પ્રિન્ટીગ ના દબાણ ને તપાસો પ્રિન્ટીગ માં અધારે ઘટ્ટ પ્રકારના વિસ્તારો અને ઓછી સમાન છબીના હળવા વિસ્તરો પણ તપાસો."],
  ["૬", "પ્રીન્ટ ડીફોર્મીટસ", "હીકીઝ જેવી પ્રિન્ટ વિકૃતિ ઓ માટે સીટ માના  બધાજ લેબલો તપાસો બબલ્સ, ગુમ થયેલ પ્રકાર ગુમ થયેલ છબી. શ્યામ અથવા પ્રકાસ પેચો, રેખા ઓ જેવા પ્રકારની સમસ્યા ઓ મંજુર થયેલ આર્ટવર્ક માં અન્ય ચિન્હો જોવા મળ્યા નથી."],
];

/** What F/QC/13 printed above its grid until 13-Oct-2026 and this paper does not (data/seed/logSheetLayouts.ts WITHDRAWN_EXPLANATIONS). */
export const FQC13_WITHDRAWN_LINES: string[] = [
  "ગ્રેડિંગ માપદંડ: બધા ગ્રેડ નીચે મુજબના માપદંડ મુજબ આપવા જોઈએ. જો કોઈ માપદંડમાં એફ ગ્રેડ આપવામાં આવે તો ઉત્પાદન બંધ કરવું આવશ્યક છે. જો ૧ થી વધુ સી ગ્રેડ મળી આવે, તો છાપવાનું બંધ કરવું જોઈએ અને ક્યુ.એ. મેનેજર કેવી રીતે આગળ વધવું તેના વિશે નિર્ણય કરશે. જો ૩ થી વધુ બી ગ્રેડ મળ્યા હોય, તો છાપવાનું બંધ કરવું જોઈએ અને ક્યુ.એ. મેનેજર કેવી રીતે આગળ વધવું તેના વિશે નિર્ણય કરશે.",
  "ખામી યુક્ત અપ્સ (બધીજ એકત્રિત સીટમાં) મુજબ ગ્રેડ: <11% of total ups = A · <21% = B · <25% = C · >25% = F. જો એરર્સ બેથી ઓછા અપ્સ માં માત્ર હોય તો એ ગ્રેડ આપવો.",
];

export const QC_IN_PROCESS_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F/QC/13 — In Process Quality Control (Gujarati form, printing) ----
  // As the owner's original of 13-Oct-2026, "F-QC-13 IPQC format (2).jpg" (REQUIREMENTS §111), word for word in
  // its own Gujarati spellings: the procedure; the grade criteria table, printed in full on the page (not a chart
  // shown on request); the boxes આઈટમ કોડ, પ્રો. નંબર, તારીખ / મશીન, ઓપરેટર, QA પર્સન / ઓર્ડર લેન્થ ઈન મીટર,
  // સેમ્પલ કોલીટી, three to a line; the grid સ.નં | પેરામીટર | ટેસ્ટ ક્રાઈટ | ગ્રેડ | પાસ? with the paper's own
  // numbers ૧ to ૬; and the five boxes below it in the paper's English. It was built from a photographed register
  // whose labels carried English glosses, a "Defect count" column, a Total Ups box and two lines of grading rules
  // above the grid that this paper does not print; those are gone. The paper draws પાસ? as one cell down the six
  // lines; a grid cannot merge cells, so each line has its own. Keys unchanged where the box is the same.
  "qc-inprocess-printing": {
    documentId: "qc-inprocess-printing",
    paperTitle: "In Process Quality Control",
    // In its own letters, as the paper prints it (REQUIREMENTS §111 part 6).
    titleAsPrinted: true,
    instructions: [FQC13_PROCEDURE],
    referenceTables: [
      {
        title: "ગ્રેડ ક્રાઈટ",
        printed: true,
        columns: ["સ.નં", "પેરામીટર", "ગ્રેડ ક્રાઈટ"],
        rows: FQC13_GRADE_CRITERIA,
      },
    ],
    headerColumns: 3,
    headerFields: [
      { key: "itemCode", label: "આઈટમ કોડ", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "poNumber", label: "પ્રો. નંબર", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "date", label: "તારીખ", type: "date", autoFill: { dueDate: true } },
      { key: "machine", label: "મશીન", type: "text", required: true, autoFill: { carryForward: true, default: "Lombardi" } },
      { key: "operator", label: "ઓપરેટર", type: "text", autoFill: { carryForward: true, default: "Pankajbhai" } },
      { key: "qaPerson", label: "QA પર્સન", type: "text", required: true, autoFill: { sign: true } },
      { key: "orderLength", label: "ઓર્ડર લેન્થ ઈન મીટર", type: "text", autoFill: { carryForward: true } },
      // "કોલીટી" as the paper prints it (for કોન્ટીટી, quantity).
      { key: "sampleQty", label: "સેમ્પલ કોલીટી", type: "text", autoFill: { carryForward: true, default: "1" } },
    ],
    columns: [
      { key: "srNo", label: "સ.નં", type: "text", fixed: true, width: 60 },
      { key: "parameter", label: "પેરામીટર", type: "text", fixed: true, width: 150 },
      { key: "testChart", label: "ટેસ્ટ ક્રાઈટ", type: "text", fixed: true, width: 440 },
      { key: "grade", label: "ગ્રેડ", type: "select", options: ["A", "B", "C", "F", "-"], required: true, autoFill: { carryForward: true }, width: 80 },
      { key: "pass", label: "પાસ?", type: "yesno", autoFill: { carryForward: true }, width: 90 },
    ],
    // The paper's own સ.નં, ૧ to ૬: no Sr. No. of the sheet's beside it (REQUIREMENTS §102).
    ownLineNumbers: true,
    rowMode: {
      kind: "fixedRows",
      rows: FQC13_TESTS.map(([srNo, parameter, testChart]) => ({ srNo, parameter, testChart })),
    },
    footerFields: [
      { key: "mlDescription", label: "Description of NC (If applicable):", type: "text", autoFill: { default: "N/A" } },
      { key: "overrideReason", label: "Sign Off Reason (If Applicable)", type: "text", autoFill: { default: "N/A" } },
      { key: "signOffName", label: "Sign Off By: (If Applicable)", type: "text", autoFill: { default: "N/A" } },
      { key: "remarks", label: "REMARKS:", type: "text" },
      { key: "qaSign", label: "QA Sign:", type: "text", required: true, autoFill: { sign: true } },
    ],
    specimenHeader: {
      itemCode: "FGLA 19377", poNumber: "89480", machine: "Lombardi", operator: "Pankajbhai", qaPerson: "HNP", sampleQty: "1", orderLength: "",
      mlDescription: "N/A", overrideReason: "N/A", signOffName: "N/A", remarks: "Adjust by Pankajbhai", qaSign: "HNP",
    },
    specimenRows: [
      { grade: "B", pass: "Yes" }, { grade: "A", pass: "" }, { grade: "A", pass: "" },
      { grade: "-", pass: "" }, { grade: "A", pass: "" }, { grade: "B", pass: "" },
    ],
    specimenSource: "Photographed F/QC/13 register, 2 pages (filled 6-9-26, Lombardi, PO 89480); the format as the owner's original of 13-Oct-2026, F-QC-13 IPQC format (2).jpg",
  } satisfies LogSheetLayout,
};
