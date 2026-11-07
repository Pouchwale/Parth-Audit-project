// A SUPPLIER'S FILLED-IN REGISTRATION FORM READ INTO F/PUR/01 (REQUIREMENTS §191; backend/supplierFormExtract.ts):
//   * every box read by the paper's own label - the value on the label's line, or on the lines under it; an address or a
//     list running over several lines kept whole; the paper's notes and its own lines never taken as a value;
//   * the two DESIGNATIONs told apart (the contact's, then the furnisher's), the office's block never read;
//   * a choice box takes the paper's choices (Pvt. Ltd. -> Private Limited, "Manufacturer of..." -> Manufacturing),
//     the certification question Yes / No, the date a date, the employees two figures;
//   * a blank form gives nothing, and says what was not found; a text file is read end to end without the assistant.
// Run: npm run test:unit -- supplierFormExtract
import test from "node:test";
import assert from "node:assert/strict";
import { SUPPLIER_FORM_KEYS, readSupplierForm, readSupplierFormByRules } from "../supplierFormExtract.ts";

const FILLED = [
  "GUJARAT PRINT PACK PUBLICATIONS PVT LTD",
  "SUPPLIER REGISTRATION FORM",
  "Format no. - F/PUR/01   Rev. - 00   Effective Date - 01.12.2021   Page 1 of 3",
  "GENERAL DETAILS - TO BE FILLED UP BY SUPPLIER",
  "SUPPLIER'S NAME : Shree Ambica Packaging Pvt. Ltd.",
  "TYPE OF CONCERN : Pvt. Ltd.",
  "ADDRESS (OFFICE) : 214, Sunrise Complex, Nr. Tulsi Circle,",
  "Ring Road, Rajkot - 360 001, Gujarat",
  "ADDRESS (WORKS) : Plot No. 48, GIDC Phase II, Lodhika,",
  "Rajkot - 360 021, Gujarat",
  "CONTACT PERSON : Mr. Hiren Patel",
  "DESIGNATION : Sales Manager",
  "TELEPHONE NOS : 98250 12345, 0281 2461234",
  "E-MAIL ADDRESS : sales@ambicapack.in",
  "WEEKLY OFF / WORKING HOURS : Sunday / 9.00 am to 6.00 pm",
  "COMPANY ACTIVITIES : Manufacturer of corrugated boxes",
  "NO. OF EMPLOYEES : Technical 18   Non-Technical 42",
  "YEAR OF COMMENCEMENT : 2009",
  "RANGE OF PRODUCTS / SERVICES OFFERED (Please attach a separate sheet if required)",
  "3 ply and 5 ply corrugated boxes, die-cut cartons, printed shippers",
  "and corrugated partitions in kraft and white top liner.",
  "LIST OF MAJOR CUSTOMERS (Attach separate sheet if required)",
  "Amul Dairy, Balaji Wafers, Jyoti CNC, Ajanta Pharma",
  "PARTICULARS OF PLANT MACHINERY & OTHER INFRASTRUCTURE (NOT APPLICABLE FOR TRADERS) (Attach separate sheet if required)",
  "5 ply automatic corrugation line (1600 mm), 4 colour flexo printer slotter,",
  "rotary die cutter, semi-automatic stitching and gluing machines.",
  "DETAILS OF QUALITY CONTROL DEPARTMENT (PROVIDE DETAILS OF TESTING FACILITY, TEST METHODS) (Please attach a separate sheet if required)",
  "In-house lab with bursting strength tester, box compression tester,",
  "GSM balance and cobb tester; tests as per IS 1060 and IS 7063.",
  "DO YOU HOLD ISO 9001 / ISO 22000 / HACCP / FSSC / BRCGS CERTIFICATION: Yes - ISO 9001:2015",
  "Please provide following documents along with this form.",
  "1. Technical data sheet / Specification sheet",
  "2. MSDS",
  "INFORMATION FURNISHED BY",
  "NAME : Hiren Patel",
  "DESIGNATION : Sales Manager",
  "DATE : 04/11/2026",
  "PLACE : Rajkot",
  "SIGNATURE WITH COMPANY'S SEAL",
  "INTERNAL OFFICE USE ONLY",
  "Status of Supplier : New",
  "ASSESSMENT STATUS : APPROVED",
].join("\n");

test("every box of the filled-in form is read by the paper's label: on the label's line, or on the lines under it", () => {
  const f = readSupplierFormByRules(FILLED);
  assert.equal(f.supplierName, "Shree Ambica Packaging Pvt. Ltd.");
  assert.equal(f.typeOfConcern, "Private Limited");
  assert.equal(f.addressOffice, "214, Sunrise Complex, Nr. Tulsi Circle,\nRing Road, Rajkot - 360 001, Gujarat");
  assert.equal(f.addressWorks, "Plot No. 48, GIDC Phase II, Lodhika,\nRajkot - 360 021, Gujarat");
  assert.equal(f.contactPerson, "Mr. Hiren Patel");
  assert.equal(f.contactDesignation, "Sales Manager");
  assert.equal(f.telephoneNos, "98250 12345, 0281 2461234");
  assert.equal(f.emailAddress, "sales@ambicapack.in");
  assert.equal(f.weeklyOffWorkingHours, "Sunday / 9.00 am to 6.00 pm");
  assert.equal(f.companyActivities, "Manufacturing");
  assert.deepEqual([f.employeesTechnical, f.employeesNonTechnical], ["18", "42"]);
  assert.equal(f.yearOfCommencement, "2009");
  assert.equal(f.rangeOfProducts, "3 ply and 5 ply corrugated boxes, die-cut cartons, printed shippers\nand corrugated partitions in kraft and white top liner.");
  assert.equal(f.majorCustomers, "Amul Dairy, Balaji Wafers, Jyoti CNC, Ajanta Pharma");
  assert.equal(f.plantMachinery, "5 ply automatic corrugation line (1600 mm), 4 colour flexo printer slotter,\nrotary die cutter, semi-automatic stitching and gluing machines.");
  assert.equal(f.qualityControlDept, "In-house lab with bursting strength tester, box compression tester,\nGSM balance and cobb tester; tests as per IS 1060 and IS 7063.");
  assert.equal(f.holdsCertification, "Yes");
  // The furnisher's block, told from the contact's DESIGNATION; the date a date; the office's block never read.
  assert.deepEqual([f.furnishedName, f.furnishedDesignation, f.furnishedDate, f.furnishedPlace], ["Hiren Patel", "Sales Manager", "2026-11-04", "Rajkot"]);
  assert.equal(Object.keys(f).length, SUPPLIER_FORM_KEYS.length, "every box, and nothing of the office's");
  assert.ok(!JSON.stringify(f).includes("APPROVED") && !JSON.stringify(f).includes("Technical data sheet"));
});

test("a one-line box's value on the line below; a number before a label; the choices and the yes / no in the supplier's own words", () => {
  const f = readSupplierFormByRules(
    [
      "1) SUPPLIER'S NAME :",
      "Mehta Traders LLP",
      "2) TYPE OF CONCERN :",
      "3) CONTACT PERSON : Kiran Mehta",
      "DESIGNATION :",
      "Partner",
      "COMPANY ACTIVITIES : Dealer & stockist of paper",
      "NO. OF EMPLOYEES : 6 / 9",
      "DO YOU HOLD ISO 9001 / ISO 22000 / HACCP / FSSC / BRCGS CERTIFICATION:",
      "No",
    ].join("\n")
  );
  assert.equal(f.supplierName, "Mehta Traders LLP");
  assert.equal(f.typeOfConcern, "Partnership", "from the supplier's name when the box was left empty");
  assert.deepEqual([f.contactPerson, f.contactDesignation], ["Kiran Mehta", "Partner"]);
  assert.equal(f.companyActivities, "Trading");
  assert.deepEqual([f.employeesTechnical, f.employeesNonTechnical], ["6", "9"]);
  assert.equal(f.holdsCertification, "No");
  assert.equal(f.furnishedName, undefined);
});

test("a blank form gives nothing; the paper's own lines are never a value", () => {
  const f = readSupplierFormByRules(
    ["SUPPLIER'S NAME :", "TYPE OF CONCERN :", "ADDRESS (OFFICE) :", "ADDRESS (WORKS) :", "RANGE OF PRODUCTS / SERVICES OFFERED (Please attach a separate sheet if required)", "LIST OF MAJOR CUSTOMERS (Attach separate sheet if required)", "INFORMATION FURNISHED BY", "NAME :", "SIGNATURE WITH COMPANY'S SEAL", "INTERNAL OFFICE USE ONLY", "Status of Supplier : New"].join("\n")
  );
  assert.deepEqual(f, {});
});

test("a text file is read end to end without the assistant, and what the file did not give is said", async () => {
  const r = await readSupplierForm(Buffer.from("SUPPLIER'S NAME : Om Inks\nCONTACT PERSON : Raju\nE-MAIL ADDRESS : raju@ominks.in\n", "utf8"), "form.txt", { useAssistant: false });
  assert.equal(r.fileKind, "text");
  assert.equal(r.readBy, "rules");
  assert.deepEqual(r.fields, { supplierName: "Om Inks", contactPerson: "Raju", emailAddress: "raju@ominks.in" });
  assert.ok(r.missing.includes("TYPE OF CONCERN") && r.missing.includes("INFORMATION FURNISHED BY — DATE"));
  assert.equal(r.missing.length, SUPPLIER_FORM_KEYS.length - 3);
  await assert.rejects(readSupplierForm(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "scan.jpg", { useAssistant: false }), /picture of the form/);
});

// THE COMPANY'S OWN FORM AS WORD PRINTS IT (REQUIREMENTS §200; the owner, 7-Nov-2026: "when user upload the pdf files then
// make sure it will fetch perfectly whatever the field required"): the original F/PUR/01 .docx filled in Word and exported to
// PDF puts a bullet before every label, its header on every page, the notes on lines of their own, two boxes on one line,
// and the printed choices beside the one marked. Read from text shaped exactly as the server's reader saw that PDF.
const AS_WORD_PRINTS = [
  "SUPPLIER",
  "REGISTRATION FORM",
  "Document no. F/PUR/01",
  "Rev. no. 00",
  "Effective date 01.12.2021",
  "Page no. 1 Of 3",
  "GENERAL DETAILS – TO BE FILLED UP BY SUPPLIER",
  "❑ SUPPLIER’S NAME : Shree Ambica Packaging Pvt. Ltd.",
  "❑ TYPE OF CONCERN : Proprietary / Partnership / Private Limited / Limited",
  "❑ ADDRESS (OFFICE) : 214, Sunrise Complex, Nr. Tulsi Circle,",
  "Ring Road, Rajkot - 360 001, Gujarat",
  "❑ ADDRESS (WORKS) :",
  "Plot No. 48, GIDC Phase II, Lodhika,",
  "Rajkot - 360 021, Gujarat",
  "❑ CONTACT PERSON : Mr. Hiren Patel DESIGNATION : Sales Manager",
  "❑ TELEPHONE NOS : 98250 12345, 0281 2461234",
  "❑ E-MAIL ADDRESS : sales@ambicapack.in",
  "❑ WEEKLY OFF / WORKING HOURS : Sunday / 9.00 am to 6.00 pm",
  "❑ COMPANY ACTIVITIES : Trading X Manufacturing Services",
  "500570517653000302450517653000",
  "❑ NO. OF EMPLOYEES : Technical Non-Technical",
  "Technical: 18 Non-Technical: 42",
  "❑ YEAR OF COMMENCEMENT : 2009",
  "RANGE OF PRODUCTS / SERVICES OFFERED",
  "3 ply and 5 ply corrugated boxes, die-cut cartons, printed shippers",
  "(Please attach a separate sheet if required)",
  "SUPPLIER",
  "REGISTRATION FORM",
  "Document no. F/PUR/01",
  "Rev. no. 00",
  "Effective date 01.12.2021",
  "Page no. 2 Of 3",
  "and corrugated partitions in kraft and white top liner.",
  "LIST OF MAJOR CUSTOMERS",
  "Amul Dairy, Balaji Wafers, Jyoti CNC, Ajanta Pharma",
  "(Attach separate sheet if required)",
  "PARTICULARS OF PLANT MACHINERY & OTHER INFRASTRUCTURE (NOT APPLICABLE FOR TRADERS)",
  "5 ply automatic corrugation line (1600 mm), 4 colour flexo printer slotter.",
  "(Attach separate sheet if required)",
  "DETAILS OF QUALITY CONTROL DEPARTMENT (PROVIDE DETAILS OF TESTING FACILITY, TEST METHODS)",
  "In-house lab with bursting strength tester, box compression tester.",
  "(Please attach a separate sheet if required)",
  "DO YOU HOLD ISO 9001 / ISO 22000 / HACCP / FSSC / BRCGS CERTIFICATION: YES NO X",
  "Please provide following documents along with this form.",
  "1. Technical data sheet / Specification sheet",
  "SUPPLIER",
  "REGISTRATION FORM",
  "Page no. 3 Of 3",
  "INFORMATION FURNISHED BY :",
  "NAME : Hiren Patel",
  "DESIGNATION : Sales Manager",
  "DATE : 04/11/2026",
  "PLACE : Rajkot",
  "SIGNATURE WITH COMPANY’S SEAL",
  "____________________________________________________________________________________",
  "INTERNAL OFFICE USE ONLY",
  "Status of Supplier :  New  Established",
  "ASSESSMENT STATUS :  APPROVED  REJECTED",
].join("\n");

test("the company's own form as Word prints it: bullets before the labels, the header on every page, two boxes on one line, the choices beside the one marked (§200)", () => {
  const f = readSupplierFormByRules(AS_WORD_PRINTS);
  assert.equal(f.supplierName, "Shree Ambica Packaging Pvt. Ltd.");
  assert.equal(f.typeOfConcern, "Private Limited", "the choices left as printed: from the supplier's name");
  assert.equal(f.addressOffice, "214, Sunrise Complex, Nr. Tulsi Circle,\nRing Road, Rajkot - 360 001, Gujarat");
  assert.equal(f.addressWorks, "Plot No. 48, GIDC Phase II, Lodhika,\nRajkot - 360 021, Gujarat", "written under its label");
  assert.deepEqual([f.contactPerson, f.contactDesignation], ["Mr. Hiren Patel", "Sales Manager"], "two boxes on one line, told apart");
  assert.equal(f.telephoneNos, "98250 12345, 0281 2461234");
  assert.equal(f.companyActivities, "Manufacturing", "the one marked with an X");
  assert.deepEqual([f.employeesTechnical, f.employeesNonTechnical], ["18", "42"], "the paper's own words on the label's line, the figures under");
  assert.equal(f.yearOfCommencement, "2009");
  assert.equal(f.rangeOfProducts, "3 ply and 5 ply corrugated boxes, die-cut cartons, printed shippers\nand corrugated partitions in kraft and white top liner.", "a block running on past the page's header, the note left out");
  assert.equal(f.majorCustomers, "Amul Dairy, Balaji Wafers, Jyoti CNC, Ajanta Pharma");
  assert.equal(f.plantMachinery, "5 ply automatic corrugation line (1600 mm), 4 colour flexo printer slotter.");
  assert.equal(f.qualityControlDept, "In-house lab with bursting strength tester, box compression tester.");
  assert.equal(f.holdsCertification, "No", "the X beside NO");
  assert.deepEqual([f.furnishedName, f.furnishedDesignation, f.furnishedDate, f.furnishedPlace], ["Hiren Patel", "Sales Manager", "2026-11-04", "Rajkot"]);
  assert.equal(Object.keys(f).length, SUPPLIER_FORM_KEYS.length);
  assert.ok(!JSON.stringify(f).includes("APPROVED") && !JSON.stringify(f).includes("Page no") && !JSON.stringify(f).includes("500570517653"));
});

test("the company's form sent back as it was gives nothing: the printed choices are no answer, nor the paper's notes (§200)", () => {
  const f = readSupplierFormByRules(
    [
      "❑ SUPPLIER’S NAME :",
      "❑ TYPE OF CONCERN : Proprietary / Partnership / Private Limited / Limited",
      "❑ CONTACT PERSON : DESIGNATION :",
      "❑ COMPANY ACTIVITIES : Trading Manufacturing Services",
      "❑ NO. OF EMPLOYEES : Technical Non-Technical",
      "RANGE OF PRODUCTS / SERVICES OFFERED",
      "(Please attach a separate sheet if required)",
      "DO YOU HOLD ISO 9001 / ISO 22000 / HACCP / FSSC / BRCGS CERTIFICATION: YES NO",
      "INFORMATION FURNISHED BY :",
      "NAME :",
      "DATE :",
    ].join("\n")
  );
  assert.deepEqual(f, {});
});

test("two boxes on one line, both written on the line under them, at the gap between; a choice marked after its word, or left alone (§200)", () => {
  const f = readSupplierFormByRules(["CONTACT PERSON : DESIGNATION :", "Mr. Kiran Mehta\t\t\tPartner", "TYPE OF CONCERN : Proprietary / Partnership ✓ / Private Limited / Limited", "COMPANY ACTIVITIES : Trading", "DO YOU HOLD ISO 9001 CERTIFICATION: ☒ YES ☐ NO"].join("\n"));
  assert.deepEqual([f.contactPerson, f.contactDesignation, f.typeOfConcern, f.companyActivities, f.holdsCertification], ["Mr. Kiran Mehta", "Partner", "Partnership", "Trading", "Yes"]);
});

