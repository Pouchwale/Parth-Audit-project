import type { LogSheetLayout } from "../../types";

// DISPATCH — THE TWO FORMATS THE DEPARTMENT SUPPLIED (REQUIREMENTS §70).
//
// F/DISP/01  Safe Transporter Agreement — the code of practice a contract
//            transporter signs. All words: the clauses as the paper prints
//            them, under the paper's own headings, and the two signature
//            blocks at the end. There is no grid on it at all.
// F/DISP/02  Container Stuffing & Vehicle Inspection Record — printed in
//            GUJARATI, like the three Quality Control forms of §58: the
//            seven instructions, the consignment's own boxes, the nine-point
//            checklist and the two authorisations. Every printed line of it
//            is written down in English in i18n/documentTextEn.ts, so the
//            form reads in whichever language the person chose.
//
// Both are transcribed from the company's own PDFs, supplied 23-Sep-2026 and
// kept in source-documents/. Verbatim means verbatim: the checklist runs
// 1, 2, 3, 4, 6, 7, 8, 9 — the paper has no 5 — and the numbers are declared
// rather than drawn, so the gap survives.

const SAFE_TRANSPORTER: LogSheetLayout = {
  documentId: "disp-safe-transporter-agreement",
  // The agreement itself, clause by clause, under the paper's own headings.
  instructions: [
    "In order to maintain Quality, Product safety, integrity & legality of the products being supplied by us, following standards & code of practices are required to be followed by contract transport / distribution service providers.",
    "This contract is valid for the period of 01.04.2025 to 31.03.2026, unless any major changes in technical aspects. This contract doesn’t contain any commercial values.",
    "GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED will inspect the vehicle presented by the transport company to ensure that it complies with this Code of Practice before it is loaded with product.",
    "Vehicle drivers shall comply with site hygiene rules & shall not enter any of the restricted area including processing & warehouse",
    "All vehicles shall have valid registration, PUC & driver shall have valid driving license",
    "Vehicle / container shall not have any sharp edges, nails protruded or uneven surface",
    "Ensure compliance to applicable regulatory requirements as per your business setup",
    "Damage / Contamination",
    "Chemicals (Oil, Grease, Pesticides), Perishable foods, products with excessive odour / fragrance etc. or any products which can compromise the safety & integrity plastic packaging materials produced by us, must not be stored or transported in conjunction with any product that could cause damage to or contamination of our products.",
    "You will ensure that no Vehicle would be sent which has in last consignment dispatched any type of Chemicals / Pesticides or any spillage of material from the previous consignment. In case of emergency, the vehicles will be sent with proper cleaning & fumigation process as per our requirement & with our prior consent & approval",
    "The vehicle should be in a clean condition and free from contaminants that would render it unsuitable for the transportation of plastic packaging materials produced by us.",
    "Loading / Protection",
    "Plastic packaging materials produced by us must be protected from the elements whilst in the care of the transport company. Handling of packed pallets or boxes during loading must be such that the packaging material and its protective coverings are not damaged.",
    "Products must be loaded so as to prevent movement during the journey.",
    "If the transport company is of the opinion that the product is not stable or secure enough to withstand the intended journey, then they shall reject the load.",
    "The Transport Company must ensure that vehicles are of hygienic design and designated for safe transportation of packaging materials use, and procedures must be in place to prevent cross contamination from previous loads.",
    "If previous loads contain the objectionable materials which can put the safety of our products at risk, shall be informed to us",
    "Any open vehicles shall be covered with tarpaulin during transportation to prevent from external environmental implications",
    "Contracted transport and distribution shall be undertaken in such a way as to prevent our product being exposed to the risk of contamination including taint or odour",
    "Load Acceptance",
    "The acceptance of the load by the transport company confirms that the above procedures have been followed.",
    "Product Security & Integrity",
    "All products being transported must be secure at all times.",
    "It is the loaders responsibility to ensure all products are secure.",
    "Trailer doors are to be opened immediately prior to loading and must be securely closed immediately after loading.",
    "All products are to be unloaded and loaded at secure loading bays.",
    "Drivers must not leave the vehicle abandoned during transit",
    "During transit for any breaks such as tea or food break, it shall be at designated eating place, which shall be safe & can ensure the integrity of the vehicle",
    "In case of any suspicious activities related to breakage or tempering of seal, immediately inform to us before delivery of the products to our prescribed destination",
    "Vehicle breaks down in transit",
    "If the vehicle breaks down, drivers are to contact the Transport Manager immediately, who should then inform the relevant customer depot.",
    "The Transport Manager is to contact the approved vendor for vehicle breakdown assistance, or a replacement vehicle.",
    "If the vehicle breaks down but the doors have been opened, drivers are to contact the Transport Manager immediately.",
    "On Arrival Inspection - The load will be inspected by the receiver before being unloaded. If the load arrives damaged, received in an unsatisfactory condition, or not transported in accordance with this Code of Practice the receiver has the right to reject the load.",
    "In Case of Rejection - Any costs of rejection will be borne by the party responsible for the cause of the rejection.",
    "To confirm that you have been made aware of this Code of Practice please complete the details below and return to us as soon as possible, not later than 7 days from the date of our submission.",
    "If you cannot comply with any of the requirements contained in the Code of Practice, please state the reasons on a supplementary sheet. If you have questions, please contact our representative.",
  ],
  // The two sides sign at the foot of the paper, side by side.
  headerFields: [
    { key: "transporterName", label: "For Transporter - M/s", type: "text", required: false, autoFill: { carryForward: true } },
    { key: "validFrom", label: "Contract valid from", type: "date", autoFill: { carryForward: true } },
    { key: "validTo", label: "Contract valid to", type: "date", autoFill: { carryForward: true } },
  ],
  columns: [],
  rowMode: { kind: "single" },
  footerFields: [
    { key: "gppName", label: "For, GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED — Name of the person", type: "text", autoFill: { sign: true } },
    { key: "gppDesignation", label: "For, GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED — Designation", type: "text", autoFill: { carryForward: true } },
    { key: "gppSign", label: "For, GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED — Sign", type: "text" },
    { key: "gppDated", label: "For, GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED — On dated", type: "date", autoFill: { dueDate: true } },
    { key: "transporterPerson", label: "For Transporter — Name of the person", type: "text", autoFill: { carryForward: true } },
    { key: "transporterDesignation", label: "For Transporter — Designation", type: "text", autoFill: { carryForward: true } },
    { key: "transporterSign", label: "For Transporter — Sign", type: "text" },
    { key: "transporterDated", label: "For Transporter — On dated", type: "date" },
  ],
  // The company's own filled copy, as the paper shows it.
  specimenHeader: {
    transporterName: "V-Trans (India) Ltd.",
    validFrom: "2025-04-01",
    validTo: "2026-03-31",
    gppName: "Chirag Parmar",
    gppDesignation: "Purchase Manager",
    transporterPerson: "Bhavsar Bhai",
    transporterDesignation: "Logistic In charge",
  },
  specimenSource: "F-DISP-01_Safe Transportation agreement (Finish product).pdf (the signed agreement with M/s V-Trans (India) Ltd.)",
};

// THE CHECKLIST, AS THE PAPER NUMBERS IT. The company's own form runs
// 1, 2, 3, 4, 6, 7, 8, 9 — there is no 5 — so the numbers are printed values,
// not a count the screen works out.
const CONTAINER_CHECKS: { checkNo: string; checklist: string }[] = [
  { checkNo: "1", checklist: "શું કન્ટેનર દૂષણથી મુક્ત છે અને અમારા ઉત્પાદનના પરિવહન માટે યોગ્ય છે?" },
  { checkNo: "2", checklist: "શું કન્ટેનર આંતરિક સપાટી પર કોઈપણ ખાડા, છિદ્રો, લીક અથવા નખથી મુક્ત છે?" },
  { checkNo: "3", checklist: "શું કન્ટેનર દૂષિતતા, ઘનીકરણ, ઝેરી પદાર્થો અથવા જંતુઓથી મુક્ત છે?" },
  { checkNo: "4", checklist: "શું કન્ટેનર અપ્રિય / તીવ્ર ગંધથી મુક્ત છે?" },
  { checkNo: "6", checklist: "ફેબ્રિકથી ઢંકાયેલો ફ્લોર" },
  { checkNo: "7", checklist: "લાકડાના પેલેટની સ્થિતિ યોગ્ય અને કોઈ નુકસાન નથી" },
  { checkNo: "8", checklist: "ગાંસડી/પેલેટ્સ પર માર્કિંગ ઉપલબ્ધ છે" },
  { checkNo: "9", checklist: "બધા દસ્તાવેજો (લાયસન્સ, પીયુસી, વીમો અને નોંધણી જગ્યાએ?" },
];

const CONTAINER_STUFFING: LogSheetLayout = {
  documentId: "disp-container-stuffing",
  // The seven things to do on the container's arrival, printed above the boxes.
  instructions: [
    "1. તેના આગમન પર કન્ટેનર ખોલો.",
    "2. જુઓ કે તે કોઈપણ પ્રકારના દૃશ્યમાન સંકટથી મુક્ત છે (દા.ત. - ગંદકી, ધૂળ, અગાઉના શિપમેન્ટના રાસાયણિક અવશેષો, પક્ષીઓની છી, ખાદ્ય ચીજો, કોઈપણ વાંધાજનક વસ્તુઓ વગેરે). જો કોઈ નુકસાન/સફાઈ ન કરી શકાય તેવી સ્થિતિ મળી આવે, તો કન્ટેનર પરત કરો. ત્યાં કોઈ વાંધાજનક ગંધ હોવી જોઈએ નહીં",
    "3. જો જરૂરી હોય તો કન્ટેનર સાફ કરો.",
    "4. જો લોડિંગ તરત જ શરૂ ન થાય તો કન્ટેનર લોડિંગ સમયે જ બંધ અને ખોલવું જોઈએ.",
    "5. કન્ટેનરનો ફ્લોર સુધ અને સ્વચ્છ ફેબ્રિકથી ઢંકાયેલો હોવો જોઈએ, માત્ર ગાંસડીના કિસ્સામાં.",
    "6. લોડિંગ સમર્પિત કેનોપી હેઠળ થવું જોઈએ.",
    "7. લોડ થઈ જાય પછી કન્ટેનર તરત જ બંધ કરવું જોઈએ.",
  ],
  headerFields: [
    { key: "date", label: "તારીખ", type: "date", required: true, autoFill: { dueDate: true } },
    { key: "customerName", label: "ગ્રાહકનું નામ", type: "text", required: true, autoFill: { carryForward: true } },
    { key: "invoiceNo", label: "ઇન્વોઇસ નં.", type: "text", autoFill: { carryForward: true } },
    { key: "internalPoNumber", label: "આંતરિક પીઓ નંબર", type: "text", autoFill: { carryForward: true } },
    { key: "driverName", label: "ડ્રાઈવરનું નામ", type: "text", autoFill: { carryForward: true } },
    { key: "customerPoNumber", label: "ગ્રાહક પીઓ નંબર", type: "text", autoFill: { carryForward: true } },
    { key: "transporterName", label: "ટ્રાન્સપોર્ટરનું નામ", type: "text", autoFill: { carryForward: true } },
    { key: "vehicleNo", label: "વાહન નં.", type: "text", required: true, autoFill: { carryForward: true } },
  ],
  columns: [
    { key: "checkNo", label: "ક્રમ નં.", type: "text", fixed: true, width: 70 },
    { key: "checklist", label: "ચેકલિસ્ટ", type: "text", fixed: true, width: 420 },
    // The paper prints હા / નાં side by side and says to strike NA out.
    { key: "compliance", label: "પાલન (NA સ્ટ્રાઈક આઉટ)", type: "select", options: ["હા", "નાં", "NA"], width: 150, autoFill: { default: "હા" } },
    { key: "observations", label: "જો કોઈ અન્ય અવલોકનો હોય", type: "text", width: 220 },
  ],
  rowMode: { kind: "fixedRows", rows: CONTAINER_CHECKS },
  footerFields: [
    { key: "dispatchAuthorisation", label: "(ડિસ્પેચ ઇન્ચાર્જ) પ્રોડક્ટ રિલીઝ ઓથોરાઇઝેશન — નામ", type: "text", autoFill: { sign: true } },
    { key: "dispatchDesignation", label: "(ડિસ્પેચ ઇન્ચાર્જ) પ્રોડક્ટ રિલીઝ ઓથોરાઇઝેશન — હોદ્દો", type: "text", autoFill: { carryForward: true } },
    { key: "dispatchSign", label: "(ડિસ્પેચ ઇન્ચાર્જ) પ્રોડક્ટ રિલીઝ ઓથોરાઇઝેશન — સાઇન", type: "text" },
    { key: "qcApprovalName", label: "(QC) દ્વારા ચેક અને મંજૂર — નામ", type: "text", autoFill: { sign: true } },
    { key: "qcApprovalDesignation", label: "(QC) દ્વારા ચેક અને મંજૂર — હોદ્દો", type: "text", autoFill: { carryForward: true } },
    { key: "qcApprovalSign", label: "(QC) દ્વારા ચેક અને મંજૂર — સાઇન", type: "text" },
  ],
  specimenHeader: {
    customerName: "Nivea India Pvt. Ltd.",
    invoiceNo: "GPP/2026/0418",
    internalPoNumber: "IPO-2026-0418",
    driverName: "Rameshbhai Patel",
    customerPoNumber: "4500218764",
    transporterName: "V-Trans (India) Ltd.",
    vehicleNo: "GJ 01 KT 4412",
    dispatchDesignation: "Dispatch In charge",
    qcApprovalDesignation: "QC Executive",
  },
  specimenRows: CONTAINER_CHECKS.map((row) => ({ ...row, compliance: "હા", observations: "" })),
  specimenSource: "F-DISP-02_Container stuffing & Vehicle Inspection record.pdf (the blank format — the company supplied no filled copy)",
};

export const DISPATCH_LAYOUTS: Record<string, LogSheetLayout> = {
  [SAFE_TRANSPORTER.documentId]: SAFE_TRANSPORTER,
  [CONTAINER_STUFFING.documentId]: CONTAINER_STUFFING,
};
