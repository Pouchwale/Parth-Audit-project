import type { ApprovedSupplier, SupplierValues } from "../../types";
import { DOCUMENT_KEYS, SERVICE_PROVIDER, blankSupplierValues, dateOrWords } from "../../engine/purchaseMaster";

// PURCHASE MASTER DATA'S FIRST LINES (REQUIREMENTS §186) — the owner's "LIST OF APPROVED SUPPLIERS.pdf", 5-Nov-2026:
// photographs of the plant's List of Approved Suppliers (F/PUR/03), its Sr. No. 32 to 72, and of the 2025 RM & PM
// supplier performance register (F/PUR/05, 01.01.2025 ~ 31.12.2025).
//
//   * F/PUR/03's lines are transcribed cell by cell, spelling as printed ("Adheshiv", "Solvant ink", "Banglore"). A cell
//     the photograph leaves unreadable is not guessed: the line says so in its notes (Sr. No. 61's name, Sr. No. 34's
//     TRACEABILITY "??", Sr. No. 72's contact, cut at the page's edge).
//   * F/PUR/03's Sr. No. 1 to 31 were not among the pages. The 24 suppliers of the F/PUR/05 register are put on the sheet
//     from it, with the material it names; the rest of their line is Purchase's to write in (or to upload), and each says
//     so in its notes.
//   * Every rating starts full, 100 (the owner's word): the sheet is the list as it is kept from now on. The figures the
//     2025 register gave (Avery Dennison 97.80, Mazda Agencies 87.50 …) stay on that register.
//
// The ids are fixed: a seeded line Purchase removes stays removed (data/repositories/purchaseMasterRepository.ts). New
// lines are only ever added at the end.

export const PURCHASE_MASTER_SEEDED_BY = "List of Approved Suppliers (F/PUR/03), shared 5-Nov-2026";
const SEEDED_AT = "2026-11-05T00:00:00.000Z";

// Sr. No. | Vendor Code | SUPPLIER NAME | PRODUCT / SERVICE | APPLICABLE PRODUCT | CATEGORY | MANUFACTURER NAME |
// SRF TDS/SPECS MSDS FOOD-GRADE TRACEABILITY ISO (or a service provider's one cell) | CONTACT PERSON | CONTACT NUMBER |
// LOCATION | APPROVAL DATE | Re-approval Due date | File No
type ListLine = [number, string, string, string, string, string, string, string, string, string, string, string, string, string];

const M = "MANUFACTURER";
const T = "TRADER";
const S = SERVICE_PROVIDER;
const AGREEMENT = "SERVICE AGREEMENT";
const ISO17025 = "ISO 17025 ACCREDITATION";

const LIST: ListLine[] = [
  [32, "S0137", "K S Inctech Pvt.Ltd.", "Printing Ink", "PRESSURE LABEL", M, "NA", "YES YES YES YES YES YES", "Rajnarayan", "8754013955", "Banglore", "17.01.2025", "16.01.2028", "1"],
  [33, "S0086", "Fujifilm Sericol India Private Limited", "Printing Ink", "PRESSURE LABEL", M, "NA", "YES YES YES YES YES YES", "Vaibhavbhai", "9725145260", "Mumbai", "27.01.2025", "26.01.2028", "1"],
  [34, "S1105", "Hubergroup India Pvt.Ltd", "Printing Ink", "PRESSURE LABEL", M, "NA", "YES YES YES YES ?? NA", "Umangbhai", "9824750056", "Ahmedabad", "12.01.2025", "11.01.2028", "1"],
  [35, "S0584", "San Printech Pvt.Ltd.", "Flexo Printing Ink", "PRESSURE LABEL", M, "NA", "YES YES YES NA YES NA", "Niyatibhai", "9892061360", "Mumbai", "20.01.2024", "19.01.2027", "1"],
  [36, "S0191", "Poojan Industries", "Printing Ink", "PRESSURE LABEL", T, "TOYO Ink", "YES YES YES NA NA NA", "Bhavneshbhai", "9825503831", "Ahmedabad", "28.01.2025", "27.01.2028", "1"],
  [37, "S1381", "Setco Inks Private Limited", "Solvant ink", "Laminated", M, "NA", "YES YES YES YES YES NA", "Sachinbhai", "9512043320", "Vapi", "31.01.2025", "30.01.2028", "1"],
  [38, "S1346", "Arham Chemicals", "Adheshiv", "Laminated", T, "Dow", "YES YES YES NA NA NA", "Nimishbhai", "9978650211", "Ahmedabad", "15.02.2025", "14.02.2028", "1"],
  [39, "S1751", "Solvex Chem", "Adheshiv", "Laminated", T, "Dow", "YES YES YES NA NA NA", "Nimishbhai", "9978650211", "Ahmedabad", "30.12.2025", "29.12.2028", "1"],
  [40, "S1355", "Michelman Private Limited", "water-based specialty coatings", "Laminated", T, "Michelman", "YES NA NA NA NA NA", "Rohan Aranjo", "2262213838", "Mumbai", "17.11.2025", "16.11.2028", "1"],
  [41, "S1784", "MAKPRO SOLUTION", "Adheshiv", "Laminated", T, "UFLEX", "YES YES YES YES YES NA", "Mehul Patel", "9427678808", "Ahmedabad", "23.12.2025", "22.12.2028", "1"],
  [42, "S1770", "SGS & COMPANY", "Ethyl", "Laminated", T, "GNFC", "YES YES YES YES YES NA", "Kumkum Rajput", "9327670766", "Vadodara", "23.12.2025", "22.12.2028", "1"],
  [43, "S1670", "Prakash Chemicals Agencies Pvt Ltd", "Ethyl", "Laminated", T, "GNFC", "YES YES YES YES YES NA", "Nayanbhai", "6358808757", "Vadodara", "19.11.2025", "18.11.2028", "1"],
  [44, "S0007", "Ajanta Chemical", "Anilox cleanin Chemical", "PRESSURE LABEL", T, "deepak phenolics ltd", "YES YES NA NA NA NA", "Pratikbhai", "9825885295", "Ahmedabad", "25.01.2025", "24.01.2028", "1"],
  [45, "S0240", "Shikha Trading Co.", "HMA", "PRESSURE LABEL", T, "AEROBOND", "YES YES NA NA NA NA", "Anitaben", "9825095968", "Ahmedabad", "19.01.2025", "18.01.2028", "1"],
  [46, "S0240", "Shikha Trading Co.", "Gum", "Mono Carton", T, "AEROBOND", "YES YES YES YES YES NA", "Anitaben", "9825095968", "Ahmedabad", "19.01.2025", "18.01.2028", "1"],
  [47, "S0349", "Shendaliya sons", "Anilox cleanin Chemical", "PRESSURE LABEL", M, "NA", "YES YES YES NA NA NA", "bhasker damle", "9867153091", "Ahmedabad", "12.02.2025", "11.02.2028", "1"],
  [48, "S0015", "Ambica Traders", "Printing clean Chemicals", "PRESSURE LABEL", T, "Andhra Petrochemicals Ltd.", "YES NA YES NA NA NA", "Shailesh Shah", "917878-79-7078", "Ahmedabad", "27.01.2025", "26.01.2028", "5"],
  [49, "S0082", "Flexibond Industries", "Adheshiv Tape", "GENERAL", M, "NA", "YES YES YES YES NA YES", "Mukeshbhai", "9824006000", "Kalol", "27.01.2025", "26.01.2028", "5"],
  [50, "S0194", "Pratik Plast Engineers & Computer", "PVC CORE PLUG", "PRESSURE LABEL + SHRINK SLEEVE", M, "NA", "YES NA NA NA NA NA", "Pratikbhai", "9825338971", "Surendernagr", "27.01.2025", "26.01.2028", "5"],
  [51, "S0407", "Shree Bansidhar Paper Tubes", "Paper Core", "PRESSURE LABEL", M, "NA", "YES YES NA NA NA NA", "Pankajbhai", "9904567066", "vijapur", "29.12.2025", "28.12.2028", "5"],
  [52, "S1562", "LEXUS PLAST CO.", "Spouts", "Laminated", M, "NA", "YES YES NA NA NA NA", "Gopi", "96876 75789", "Rajkot", "14.02.2025", "13.02.2028", "5"],
  [53, "S0242", "Shilp Gravures Ltd.", "Nylo Plate", "PRESSURE LABEL + SHRINK SLEEVE", M, "NA", "NA NA NA NA NA NA", "Pankajbhai", "9925204061", "Ahmedabad", "Approved Prior to 01.1.2021", "", ""],
  [54, "S0289", "Tesa Tap India pvt ltd", "Tesa Tap", "PRESSURE LABEL", M, "NA", "NA NA NA NA NA NA", "swetaben", "8451007358", "Mumbai", "Approved Prior to 01.1.2021", "", ""],
  [55, "S0529", "Gurudev Pest Control", "PEST CONTROL", "NA", S, "NA", AGREEMENT, "Rohit patel", "", "Mahesana", "01.04.2025", "31.03.2026", "Service File"],
  [56, "S0505", "Industrial Solution", "CALIBRATION", "NA", S, "NA", ISO17025, "-", "", "-", "01.04.2025", "31.03.2026", "Service File"],
  [57, "S1200", "Accurate Laboratory", "ENVIRONMENT MONITORING", "NA", S, "NA", ISO17025, "Priyesh Patel", "9824014571", "Ahmedabad", "01.04.2025", "31.03.2026", "Service File"],
  [58, "S0901", "Intertek", "PRODUCT TESTING", "NA", S, "NA", ISO17025, "Gorav Kaushik", "9837617259", "Noida, UP", "01.04.2025", "31.03.2026", "Service File"],
  [59, "S1175", "Hindustan Security Services", "SITE SECURITY", "NA", S, "NA", AGREEMENT, "Yuvrajbhai", "-", "Ahmedabad", "01.04.2025", "31.03.2026", "Service File"],
  [60, "S1196", "Shree Vinayak Consol LLP", "QUALITY & PRODUCT SAFETY MANAGEMENT CONSULTANT", "NA", S, "NA", AGREEMENT, "Shashank Sheth", "9909964230", "Ahmedabad", "01.04.2025", "31.03.2026", "Service File"],
  [61, "S0224", "?? Traders", "WASTE COLLECTION", "NA", S, "NA", AGREEMENT, "Prahladbhai", "9825016823", "Mahesana", "01.04.2025", "31.03.2026", "Service File"],
  [62, "S0495", "Vipul Roadline", "Transporter", "NA", S, "NA", AGREEMENT, "Vipulji Thakor", "", "Mehsana", "01.04.2025", "31.03.2026", "Service File"],
  [63, "S0180", "Om Roadways", "Transporter", "NA", S, "NA", AGREEMENT, "Vasantbhai", "9825596600", "Mehsana", "01.04.2025", "31.03.2026", "Service File"],
  [64, "S0383", "V-Trans (India)Ltd.", "Transporter", "NA", S, "NA", AGREEMENT, "Bhavsarbhai", "+912762250914", "Mehsana", "01.04.2025", "31.03.2026", "Service File"],
  [65, "", "Sarukh Khan", "Transporter", "NA", S, "NA", AGREEMENT, "Sarukhbhai", "+912762250914", "Mehsana", "01.04.2025", "31.03.2026", "Service File"],
  [66, "", "Bharat N Raval", "Transporter", "NA", S, "NA", AGREEMENT, "Bharat Raval", "+912762250914", "Mehsana", "01.04.2025", "31.03.2026", "Service File"],
  [67, "S0223", "Sakhidas Papers", "Duplex", "Mono Carton", T, "Aditya", "YES NA NA NA NA NA", "Ashitbhai", "9825607434", "Ahmedabad", "03.01.2026", "02.01.2029", "6"],
  [68, "S1676", "Paperpack Agencies", "Duplex & Kraft", "Mono Carton", T, "Mehali/Soham/Ambani", "YES NA NA NA NA NA", "MUSTAKBHAI", "7922135191", "AHMEDABAD", "23.12.2025", "22.12.2028", "6"],
  [69, "S1812", "PAPTECH CORP PVT LTD", "Duplex", "Mono Carton", T, "Tulsi/NR", "YES NA NA NA NA NA", "Akshay Mehta", "7738463018", "MUMBAI", "21.01.2026", "20.01.2029", "6"],
  [70, "S0182", "Paramount Traders", "Duplex", "Mono Carton", T, "Tirthank/NR", "YES NA NA NA NA NA", "Nitin Thakkar", "+917926563811", "Ahmedabad", "17.11.2025", "16.11.2028", "6"],
  [71, "S0766", "Jigar Trading Co.", "Kraft Paper", "TRAYS", T, "Devang/Gaytrishakti/Maheshwari/Skwin", "YES NA NA NA NA NA", "Jigar Shah", "+919323156334", "Mumbai", "03.01.2026", "02.01.2029", "6"],
  [72, "S0459", "Vibrant Marketing", "Kraft Paper", "TRAYS", T, "Mahadev & Swaraj Mills", "YES NA NA NA NA NA", "Ghanshyambhai Patel", "+919879104206", "Mehsana", "01.01.2026", "31.12.2028", "6"],
];

/** What the photograph leaves for Purchase to confirm, by Sr. No. */
const LIST_NOTES: Record<number, string[]> = {
  34: ['TRACEABILITY reads "??" on the list as shared on 5-Nov-2026 — to confirm.'],
  61: ['The first part of the supplier\'s name cannot be read on the photograph of the list ("?? Traders", Vendor Code S0224, waste collection) — write it in.'],
  72: ['CONTACT PERSON is cut at the edge of the photograph ("…hanshyambhai Pat…"), read as Ghanshyambhai Patel — to confirm.'],
};

// The 2025 RM & PM supplier performance register (F/PUR/05): Supplier Name | Material Description.
const REGISTER_2025: [string, string][] = [
  ["Avery Dennison (India)Pvt.Ltd.", "Label Stock"],
  ["Jindal SMI Coated Products ltd", "Label Stock"],
  ["UPM Kymmene India Pvt.Ltd.", "Label Stock"],
  ["Kurz India Pvt.Ltd.", "Stamping Foil"],
  ["Manish Packaging Pvt Ltd", "PVC cast Film"],
  ["ADDON FILMTECH PRIVATE LIMITED", "PET-SHRINK FILM"],
  ["Garware Hi-Tech Films Limited", "PET-SHRINK FILM"],
  ["Centroiid Plastopack Industries", "PVC Blown Film"],
  ["Akshar NX Digital Pvt.Ltd", "Nylo Plate"],
  ["Creative Graphics Solutions (I) Ltd.", "Nylo Plate"],
  ["Numex Blocks(India)Pvt.Ltd.", "Nylo Plate"],
  ["Veepee Graphic Solutions ( P ) Ltd.", "Nylo Plate"],
  ["Dimple Enterprise", "BOPP Lamination Film"],
  ["Kaveri Metallsing & Coating Ind.Pvt.Ltd", "BOPP & Poly Film"],
  ["JIL PACK MARKETING LLP", "Aluminium foil & bopa film"],
  ["RAVIRAJ FOILS LIMITED", "Aluminium foil"],
  ["Jagdamba Polymers", "PET/METPET"],
  ["Mazda Agencies", "PET/METPET"],
  ["OSCAR CHEMICALS PVT. LTD.", "PET/METPET"],
  ["SHREE HARI POLY FILMS", "PET/METPET"],
  ["SMART PACK SOLUTIONS", "PET/METPET"],
  ["SHREE HARI TRADERS", "BOPP/BOPET"],
  ["Marudhar Industries Ltd. (Unit-II)", "Ldpe Poly"],
  ["PARIKH FLEXIBLES PRIVATE LIMITED", "Ldpe Poly"],
];

const REGISTER_NOTE =
  "On the 2025 RM & PM supplier performance register (F/PUR/05); its line of the List of Approved Suppliers (Sr. No. 1 to 31) was not among the pages shared on 5-Nov-2026 — write in its Vendor Code, CATEGORY, documents, contact and approval dates, or upload the list.";

function listLine(line: ListLine): ApprovedSupplier {
  const [sr, vendorCode, supplierName, productService, applicableProduct, category, manufacturerName, documents, contactPerson, contactNumber, location, approval, reapproval, fileNo] = line;
  const values: SupplierValues = {
    ...blankSupplierValues(),
    vendorCode,
    supplierName,
    productService,
    applicableProduct,
    category,
    manufacturerName,
    contactPerson,
    contactNumber,
    location,
    approvalDate: dateOrWords(approval),
    reapprovalDueDate: dateOrWords(reapproval),
    fileNo,
  };
  if (category === SERVICE_PROVIDER) values.serviceApproval = documents;
  else documents.split(" ").forEach((answer, i) => (values[DOCUMENT_KEYS[i]] = answer));
  return {
    id: `pur-sup-${sr}`,
    ...values,
    ...(LIST_NOTES[sr] ? { notes: LIST_NOTES[sr] } : {}),
    sources: [`F/PUR/03 Sr. No. ${sr}`],
    updatedAt: SEEDED_AT,
    updatedBy: PURCHASE_MASTER_SEEDED_BY,
  };
}

/** The sheet's first lines: F/PUR/03's Sr. No. 32 to 72, then the F/PUR/05 register's 24 suppliers. A fresh copy each call. */
export function purchaseMasterSeed(): ApprovedSupplier[] {
  return [
    ...LIST.map(listLine),
    ...REGISTER_2025.map(([supplierName, productService], i) => ({
      id: `pur-sup-r${String(i + 1).padStart(2, "0")}`,
      ...blankSupplierValues(),
      supplierName,
      productService,
      notes: [REGISTER_NOTE],
      sources: ["F/PUR/05 01.01.2025 ~ 31.12.2025"],
      updatedAt: SEEDED_AT,
      updatedBy: PURCHASE_MASTER_SEEDED_BY,
    })),
  ];
}
