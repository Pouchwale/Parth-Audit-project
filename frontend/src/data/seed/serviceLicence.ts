// The pest control service provider's insecticide licence — Government of
// Gujarat FORM III, granted to GURUDEV PESTICIDES (the "Gurudev Pest
// Control" that files the Service Reports). Supplied as a two-page scan
// ("Service licence GP3 kapila mam.pdf"); the scanned pages themselves are
// what the app shows (frontend/public/source/gurudev-licence-page-*.jpg,
// rendered from the PDF, nothing altered), and everything below is a
// verbatim transcription of them for reading and search — spelling,
// capitalisation and the printed numbering gaps in the terms (no 8, 11,
// 12 on the page) are kept exactly as printed.

export interface LicenceTerm {
  srNo: number;
  text: string;
}

export const SERVICE_LICENCE = {
  documentId: "gurudev-insecticide-licence",
  sourceFile: "Service licence GP3 kapila mam.pdf",
  // The supplied file itself, served byte-for-byte (SHA-256
  // 0a63f34c3d689bcbc75c5fde4391400ba70f0badbe4ec45798794aae08c6c96f, 320,370
  // bytes) — the licence is held exactly as issued, and `pages` below are
  // only page renderings of this same file for on-screen display and print.
  originalPdf: "/source/gurudev-insecticide-licence.pdf",
  originalBytes: 320370,
  pages: ["/source/gurudev-licence-page-1.jpg", "/source/gurudev-licence-page-2.jpg"],

  issuer: "GOVERNMENT OF GUJARAT",
  department: "Agriculture, Farmers Welfare & Cooperation Department, Govt of Gujarat",
  form: "FORM III",
  formTitle: "LICENSE TO SELL, STOCK OR EXHIBIT FOR SALE OR DISTRIBUTE INSECTICIDES",
  formRule: "[See sub-rules (4) of rule 10]",

  registrationNo: "FP1230000675",
  licenseNo: "MEH/FP1230000675/2023-2024",
  dateOfIssue: "2023-04-12", // printed "12/04/2023"
  validUpto: "As per prevailing norms",

  licensee: "GURUDEV PESTICIDES",
  premises: "SHOP NO- F-54, GOLDEN SQUARE, RADHANPUR ROAD, PANCHOT, MEHSANA",
  grantText:
    "License to Sell, stock or exhibit for sale or distribute insecticide(s) in the premises situated at SHOP NO- F-54, GOLDEN SQUARE, RADHANPUR ROAD, PANCHOT, MEHSANA is granted to GURUDEV PESTICIDES",
  supervisionText: "The insecticide(s) shall be sell, stock or exhibit for sale or distributed under the direction and supervision of the following expert staff:",
  expertStaff: {
    name: "PATEL KAUSHAL JAYANTIBHAI",
    designation: "TECHNICAL PERSON",
    qualification: "BSc in Chemistry",
  },
  conditionsNote:
    "The license is subject to such conditions as may be specified in the rules for the time being in force under the insecticides Act, 1968 as well as the conditions on the certificate of registration and others as specified in next page.",
  signedDate: "12-04-23",
  seal: "Licensing Authority & Dy Director (Extn.) MAHESANA",
  signatory: { name: "(S. S. PATEL)", title: "Deputy Director of Agriculture (Extension) Mehsana" },
  printStamp: "Print : 12-04-23 12:51:18 PM",

  termsTitle: "TERMS AND CONDITIONS OF THIS LICENSE",
  applicantLine: "Name of Applicant: Mr. GURUDEV PESTICIDES",
  // Sr. Nos. exactly as printed on the page — 8, 11 and 12 are not printed.
  terms: [
    {
      srNo: 1,
      text: "This licence shall be displayed in the prominent place in the premises for which the licence is being issued and shall be produced for inspection as and when required by an Insecticide inspector, licensing officer or any other officer authorized by the Government in this regard.",
    },
    { srNo: 2, text: "Any change in the name of the expert staff, named in the licence, shall forthwith be reported to the licensing officer." },
    { srNo: 3, text: "The licensee shall scrupulously comply with each and every condition of registration of the insecticide(s), failing which the licence is liable to be cancelled." },
    {
      srNo: 4,
      text: "No insecticide shall be sold or exhibited for sale or distributed or issued for use in commercial pest control operations except in packages approved by the Registration Committee from time to time.",
    },
    {
      srNo: 5,
      text: "If the licensee wants to sell, stock or exhibit for sale or distribute, any additional insecticide, he may apply to the licensing officer for addition in the licence for each such insecticide on payment of the prescribed fee.",
    },
    { srNo: 6, text: "For pest control operations an application for the renewal of the licence shall be made as laid down in sub-rule (3A) of rule 10 of the Insecticides Rules, 1971." },
    { srNo: 7, text: "The licensee shall comply with the provisions of the Insecticides Act, 1968, and the rules made there under for the time being in force." },
    { srNo: 9, text: "The licensee shall maintain the record of 'date expired insecticides' separately in the format as per Appendix A." },
    { srNo: 10, text: "The licensee shall maintain the record of sale /distribution of insecticides in the format as per appendix B and shall submit monthly return to the Licensing Officer." },
    { srNo: 13, text: "The licensee shall maintain a record of periodical medical examination of persons engaged in connection with insecticides as per Appendix E." },
    {
      srNo: 14,
      text: "All the registers are to be kept under secured custody by the Licensee and shall be provided for scrutiny any time to the Insecticide Inspector, Licensing Officer or any other officer authorized by the Central Government and / or the State Government.",
    },
    { srNo: 15, text: "Any other condition(s) as specified by licensing authority during the currency of license." },
  ] as LicenceTerm[],
};
