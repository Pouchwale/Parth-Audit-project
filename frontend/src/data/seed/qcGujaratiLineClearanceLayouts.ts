import type { LogColumn, LogSheetLayout } from "../../types";

// THE TWO GUJARATI LINE CLEARANCE FORMS (REQUIREMENTS §57) — photographed and
// supplied on 18-Sep-2026, both printed on one page:
//
//   લાઈન કિલયરન્સ (materials)  the items of the previous job that must be off
//                              the line, process by process
//   ક્વોલીટી શહી (quality)      the parameters of the new job that must be
//                              right before production starts
//
// NEITHER PAGE PRINTS A FORMAT NUMBER, so both are "TO BE CONFIRMED" until the
// MR gives them one (§57's TO BE CONFIRMED list). They are not the same form as
// the English AREA LINE CLEARANCE REPORTS, F/QC/15-A to F/QC/15-G, which are a
// register of job changeovers; these two are the checklist a QA person ticks
// and signs before the changeover is allowed.
//
// Every word below is the page's own Gujarati, and nothing else (REQUIREMENTS
// §111, against the owner's original of 13-Oct-2026, "F-QC-15 Line Clearance
// format (2).jpg", the two forms on one page): no English gloss beside a label
// and no line of DCRS's own above the grid — with English chosen the form reads
// in English from i18n/documentTextEn.ts, as it always did. Neither form has a
// Sr. No. column (ownLineNumbers). The paper merges the "પ્રોસેસ" cell across
// the lines of each process; a grid cannot merge cells, so the process is
// printed on every one of its lines instead. The paper writes the two QC lines
// of "ક્વોલીટી ચેકીંગ" in one cell with one tick box; here each is a line of its
// own, so each is ticked. Nothing else differs.
//
// The two tick-and-sign columns are the paper's own: "Q.A એ ચેકીંગ" /
// "Q.A ચેકીંગ" is the tick, and "Q.A ની શહી" the signature beside it.

const PROCESS: LogColumn = { key: "process", label: "પ્રોસેસ", type: "text", fixed: true, width: 150 };

/** The three columns every line of both forms ends with: the operator's sign, QA's tick, QA's sign. */
const signOffColumns = (checkLabel: string): LogColumn[] => [
  { key: "operatorSign", label: "ઓપરેટર ની શહી", type: "text", width: 150, autoFill: { sign: true } },
  { key: "qaChecked", label: checkLabel, type: "yesno", width: 130 },
  { key: "qaSign", label: "Q.A ની શહી", type: "text", width: 140, autoFill: { sign: true } },
];

const materialRows = (rows: [string, string][]) => rows.map(([process, material]) => ({ process, material }));
const parameterRows = (rows: [string, string][]) => rows.map(([process, parameter]) => ({ process, parameter }));

export const QC_GUJARATI_LINE_CLEARANCE_LAYOUTS: Record<string, LogSheetLayout> = {
  "qc-line-clearance-materials": {
    documentId: "qc-line-clearance-materials",
    // The words the paper prints at the head of the form, in its first box (REQUIREMENTS §111).
    paperTitle: "લાઈન કિલયરન્સ",
    instructions: [
      "પ્રોસેસઃ– નીચે લખેલા દરેક પોઈન્ટ માટે QUALIFIED Q.A વ્યકિત એ પહેલી સાચી સીટ તપાસવી. જો દરેક પોઈન્ટ સાચો ઠરે તો એનાથી લાગતી પ્રોસેસ ઉપર ✓ અને સહી કરવી. સહી થયા બાદ ઓપરેટર પ્રોડકશન ચાલુ કરી શકે છે. લાઈન કિલયરન્સ બોર્ડ પર સાચો જોબ લખેલો છે કે નહી તે પણ તપાસવું કોઈપણ તકલીફ દેખાય તો QA MANAGER ને જાણ કરવી.",
    ],
    headerFields: [
      { key: "itemNo", label: "આઈટમ નં.", type: "text", autoFill: { carryForward: true } },
      { key: "poNo", label: "પ્રો.નં.", type: "text", autoFill: { carryForward: true } },
      { key: "machineName", label: "મશીનનું નામઃ–", type: "text", autoFill: { carryForward: true } },
      { key: "date", label: "તા.", type: "date", required: true, autoFill: { dueDate: true } },
    ],
    columns: [PROCESS, { key: "material", label: "મટીરીયલ્સ", type: "text", fixed: true, width: 260 }, ...signOffColumns("Q.A એ ચેકીંગ")],
    ownLineNumbers: true,
    rowMode: {
      kind: "fixedRows",
      rows: materialRows([
        ["પ્રિન્ટીંગ", "રો–મટીરીયલ્સ સ્ટોક"],
        ["પ્રિન્ટીંગ", "માઉન્ટ કરેલી પ્લેટ"],
        ["પ્રિન્ટીંગ", "સ્પેસીયલ ઈંક"],
        ["પ્રિન્ટીંગ", "સ્પેસીયલ વારનીસ"],
        ["પ્રિન્ટીંગ", "મેગ્નેટીક ડાઈ"],
        ["પ્રિન્ટીંગ", "પ્રિન્ટ થયેલા રોલ"],
        ["પંચીંગ", "ડાઈ કટ રોલ"],
        ["પંચીંગ", "બેકેલાઇટ ડાઈ"],
        ["ક્વોલીટી ચેકીંગ", "કયૂશી માં ચેક થયેલ રોલ"],
        ["ક્વોલીટી ચેકીંગ", "મશીન પરથી ઉતારેલ રોલ"],
        ["લેબલ સ્લીટીંગ", "પેકીંગ ટેબલ"],
        ["લેબલ સ્લીટીંગ", "સ્લીટ રોલ"],
      ]),
    },
    specimenSource: "Photographed Gujarati લાઈન કિલયરન્સ form, blank (supplied 18-Sep-2026) — no format number printed",
  } satisfies LogSheetLayout,

  "qc-line-clearance-quality": {
    documentId: "qc-line-clearance-quality",
    // The words the paper prints at the head of the form, in its first box (REQUIREMENTS §111).
    paperTitle: "ક્વોલીટી શહી",
    instructions: [
      "પ્રોસીઝરઃ– ઓપરેટર ખાતરી કરવી જોઈ એ કે નીચે ની સૂચિબદ્ધસ બ્ધીજ આઈટમ્સો ઉત્પાદન ક્ષેત્ર માં થી દૂર કરવા માં આવી છે. અને યોગ્ય રીસે મુકવા માં આવી છે. તે બ્ધીજ સામગ્રી સંગ્રહ સ્થાન થી દૂર કર્યા પછી. QA ના વ્યકિત એ લાઈન કિલયરન્સ તપાસી લેવું. અને તે મંજુર કરવું આવશ્યક છે. તે પણ ખાતરી કરવી જ જોઈ એ કે લાઈન કિલયરન્સ બોર્ડ પર સાચા જોબ નો ઉલ્લેખ કરવા માં આવ્યો છે કે નહી. જો કોઈ સમસ્યા જાણ થઈ હોય તો બ્ધુજ કિલયરન્સ થઈ જાય પછી જ ઉત્પાદન શરૂ થવું જોઈએ",
    ],
    headerFields: [
      { key: "itemNo", label: "આઈટમ નં.", type: "text", autoFill: { carryForward: true } },
      { key: "productionNo", label: "પ્રોડકશન નં.", type: "text", autoFill: { carryForward: true } },
    ],
    columns: [PROCESS, { key: "parameter", label: "પેરામિટર", type: "text", fixed: true, width: 260 }, ...signOffColumns("Q.A ચેકીંગ")],
    ownLineNumbers: true,
    rowMode: {
      kind: "fixedRows",
      rows: parameterRows([
        ["પ્રિન્ટીંગ", "જોબ સ્પેકસ"],
        ["પ્રિન્ટીંગ", "સેડ"],
        ["પ્રિન્ટીંગ", "ટેક્સ"],
        ["પ્રિન્ટીંગ", "ઇમેજ"],
        ["પ્રિન્ટીંગ", "વારનીસ / લેમીનેશન"],
        ["પ્રિન્ટીંગ", "એપુવ થયેલ આર્ટવર્ક"],
        ["પંચીંગ", "ડાઈમેન્સન"],
        ["પંચીંગ", "ગેપ"],
        ["પંચીંગ", "રેડ્યૂસ કોર્નર"],
        ["પંચીંગ", "ડેપ્થ"],
        ["ક્વોલીટી ચેકીંગ", "માસ્ટર – રજીસ્ટ્રેશન"],
        ["ક્વોલીટી ચેકીંગ", "માસ્ટર – સેડ"],
        ["ક્વોલીટી ચેકીંગ", "માસ્ટર – સ્પોટસ"],
        ["લેબલ સ્લીટીંગ", "પેકીંગ ટેબલ"],
        ["લેબલ સ્લીટીંગ", "સ્લીટ રોલ"],
      ]),
    },
    specimenSource: "Photographed Gujarati ક્વોલીટી શહી form, blank (supplied 18-Sep-2026) — no format number printed",
  } satisfies LogSheetLayout,
};
