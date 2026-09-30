# Document coverage: DCRS against the Master List of Formats (F/SYS/02)

Checked on 30-Sep-2026 (REQUIREMENTS §84), from the owner's request: "check each and every module whether all the
documents according to the PDF are present or not; if not, ask me and I will share them."

## In short

- The master list you shared today lists **135 formats** across ten departments. **DCRS has 88 of them.** One more
  (F-QC-15-B, the punching line clearance) is already on your computer but was never built. **45 have not been
  supplied yet**, and one (F-QC-41) is marked obsolete on the list itself.
- **Complete:** System / Management (16 of 16), Store (2 of 2) and Maintenance (11 of 11).
- **Nearly complete:** Human Resources (18 of 22), Quality Control (29 of 40), Purchase (5 of 6), Marketing (3 of 4),
  Dispatch (2 of 3).
- **The big gap is Production:** 2 of its 30 formats are in DCRS (the two lamination registers). Quality Assurance's
  one format (F-QA-01) is not in DCRS either.
- The company's own workbook of the same list is newer than the PDF and has six more lines. DCRS has two of them
  (F-MKT-05 and F-MKT-06, in the CAPA module); the other four (F-PRD-27 to F-PRD-30) have not been supplied.
- **49 formats to ask for** are listed at the end, grouped by department, with a few things to confirm.

## What was compared

1. **The PDF you shared today:** `C:\Users\parth\Downloads\F-SYS-02-Master List of Formats (R-2025).pdf`,
   "MASTER LIST OF FORMATS & RECORDS, F/SYS/02 (00/01.12.2021)". Pages 1 to 5 hold the list, Sr. No. 1 to 135.
   Pages 6 to 10 are Excel's overflow of the notes column beside it: "Hotroom -In time added" (beside F-PRD-18),
   "Hotroom -out time added" (beside F-PRD-20) and "Not added in project" (beside F-HR-11). Pages 6 and 7 are blank.
2. **The repository's copy:** `source-documents/F-SYS-02-Master List of Formats. (R-2025)..pdf`, supplied on
   25-Sep-2026. **It is the same list.** Every line, date and note reads the same in both. The only difference is
   that today's file was exported again from Excel (30-Sep-2026 10:33, against 25-Sep-2026 09:33) with the Format
   Number column a little wider, so "QA-PRO-FL-CCT-01" now fits on one line instead of two. Nothing was added,
   removed or changed.
3. **The company's workbook:** `source-documents/F-SYS-02-Master List of Formats. (R-2025)..xlsx`. Its sheet
   "GPPL - Formats list" is the list as last updated: 141 formats, up to 01.09.2026. It is newer than the PDF. It
   has six more formats, later revisions for some, and a few cells that differ (see "Where the PDF and the workbook
   differ" below). Its other sheet, "GPPL - Formats list (2)", is an older copy that also has five un-numbered
   lines (F-QC-18, 19, 20, 22 and 25). DCRS keeps the workbook's 141 lines as its F/SYS/02 record (`FORMAT_LINES`
   in `frontend/src/data/seed/sysDocumentControlLayouts.ts`).
4. **DCRS's documents:** the 116 definitions in `frontend/src/data/seed/documentDefinitions.ts` (id, name, format
   number, revision). Each one's department comes from `frontend/src/data/seed/documentDepartments.ts`.
5. **What you supplied:** the 91 files in `source-documents/`, and what `docs/REQUIREMENTS.md` records about every
   paper sent and what was built from it (searched for every format number). To make sure nothing sent was
   missed, the format files in your Downloads folder were checked as well. Nothing there was changed.

Format numbers are written in many ways on the papers: F/HR/17, F-HR-17, F/QC-09, F-QC-40.C, "F-QC-40. C",
"F: QA/PRO/FL/CCT/01". They were all matched as the same number, whatever the slashes, dashes, spaces and dots.

"Department" means the department code in the format number. It is also the module a person is given in DCRS
(Master Data > Departments & access). Some documents are shown in a sidebar module with a different name
(Lamination, Compliance, CAPA, the Pest Control shelf of Human Resources); where that happens, the row says so.

## Summary

| Department | On the list (PDF) | In DCRS | Supplied but not built | Not supplied yet | Obsolete on the list |
|---|---|---|---|---|---|
| System / Management (SYS) | 16 | 16 | 0 | 0 | 0 |
| Marketing (MKT) | 4 | 3 | 0 | 1 | 0 |
| Purchase (PUR) | 6 | 5 | 0 | 1 | 0 |
| Store (STR) | 2 | 2 | 0 | 0 | 0 |
| Quality Control (QC) \* | 40 | 29 | 1 | 9 | 1 |
| Quality Assurance (QA) | 1 | 0 | 0 | 1 | 0 |
| Production (PRD) | 30 | 2 | 0 | 28 | 0 |
| Maintenance (MNT) | 11 | 11 | 0 | 0 | 0 |
| Human Resources (HR) | 22 | 18 | 0 | 4 | 0 |
| Dispatch (DISP) | 3 | 2 | 0 | 1 | 0 |
| **Total** | **135** | **88** | **1** | **45** | **1** |

\* Quality Control includes QA-PRO-FL-CCT-01, the Camera Challenge Test (list line 99). Its number has no
department code; DCRS files it under Quality Control.

**Lines only in the workbook** (not on the PDF): Marketing has 2 more (F-MKT-05 and F-MKT-06, both in DCRS) and
Production has 4 more (F-PRD-27 to F-PRD-30, not supplied yet).

**The other way round:** DCRS holds 116 documents. 90 of them are formats on the list (F-QC-15 and F-MNT-05 each
have two DCRS documents). The other 26 are not on the PDF list; they are explained in "DCRS documents that are not
on the master list" below.

## Every format on the list, by department

What the status words mean:

- **In DCRS**: the document's id in DCRS, its name as DCRS shows it, and its revision. DCRS uses the name printed on
  the form itself, which is sometimes worded differently from the list.
- **Supplied but not built**: the paper exists among what you sent, but no document was made from it.
- **Not supplied yet**: there is no paper for it in `source-documents/`, in REQUIREMENTS or in your Downloads folder.
- **Obsolete on the list**: the list itself marks it obsolete.

"Sr." is the line number printed on the PDF. Names are copied as printed, spelling included.

### System / Management (SYS)

| Sr. | Format number | Name on the list | Status |
|---|---|---|---|
| 1 | F-SYS-01 | Master List of Document | **In DCRS** as `sys-document-list` "Master List of Documents", Rev 00 |
| 2 | F-SYS-02 | Master List of Formats & Records | **In DCRS** as `sys-format-list` "Master List of Formats & Records", Rev 00 |
| 3 | F-SYS-03 | Document change request & approval note | **In DCRS** as `sys-document-change` "Document Change Request & Approval Note", Rev 01 |
| 4 | F-SYS-04 | Management review meeting agenda & record | **In DCRS** as `sys-mrm-record` "Management Review Meeting Record – BRCGS Packaging (Issue 7)", Rev 01. Its notice is in DCRS too, as `sys-mrm-agenda` (F/SYS/04-A, a number the list does not have). |
| 5 | F-SYS-05 | Internal Audit schedule | **In DCRS** as `sys-audit-schedule` "Yearly Internal Audit Schedule (BRCGS Packaging – Issue 06)", Rev 01 |
| 6 | F-SYS-06 | Internal audit plan | **In DCRS** as `sys-audit-plan` "Internal Audit Schedule & Plan", Rev 01 |
| 7 | F-SYS-07 | Internal Audit Risk assessment | **In DCRS** as `sys-audit-risk` "Internal Audit Risk Assessment", Rev 01 |
| 8 | F-SYS-08 | Internal Audit Findings & observation Report | **In DCRS** as `sys-audit-findings` "Internal Audit Findings / Observation Report", Rev 01 |
| 9 | F-SYS-10 | Internal audit NC report | **In DCRS** as `sys-audit-nc` "BRCGS Packaging (Issue 06) - Internal Audit NC Report", Rev 01 |
| 10 | F-SYS-11 | Non Conformance & Corrective Action Report | **In DCRS** as `sys-nc-car` "Non-Conformance & Corrective Action Report (CAR)", Rev 00 |
| 11 | F-SYS-12 | Monthly HARA Verification | **In DCRS** as `sys-hara-monthly` "Monthly Review & HARA Verification Meeting Record", Rev 00 |
| 12 | F-SYS-13 | Mock Product Withdrawal record | **In DCRS** as `sys-mock-recall` "Mock Product Withdrawal Record", Rev 00 |
| 13 | F-SYS-14 | Backward Traceability Record | **In DCRS** as `sys-backward-trace` "Backward Traceability Record (Customer to Supplier)", Rev 00 |
| 14 | F-SYS-15 | Forward Traceability Record | **In DCRS** as `sys-forward-trace` "Forward Traceability Check List (Supplier to Customer)", Rev 00 |
| 15 | F-SYS-16 | Quality & Product Safety objectives | **In DCRS** as `sys-objectives` "Quality & Product Safety Objectives", Rev 00 |
| 16 | F-SYS-17 | Site security risk assessment record | **In DCRS** as `sys-site-security` "Site Security Risk Assessment", Rev 00 |

### Marketing (MKT)

| Sr. | Format number | Name on the list | Status |
|---|---|---|---|
| 17 | F-MKT-01 | Customer Feedback Form | **In DCRS** as `mkt-customer-feedback` "Customer Value added Feedback", Rev 01 |
| 18 | F-MKT-02 | Customer Feedback analysis | **In DCRS** as `mkt-feedback-analysis` "Customer Feedback analysis", Rev 01 |
| 19 | F-MKT-03 | Customer complaint Form | **Not supplied yet.** The workbook calls it "Customer complaint Form (CAPA report)"; nothing in DCRS stands in for it (§77). |
| 20 | F-MKT-04 | Complaint trend analysis | **In DCRS** as `mkt-complaint-trend` "Customer Complaints Trend Analysis", Rev 00 |

### Purchase (PUR)

| Sr. | Format number | Name on the list | Status |
|---|---|---|---|
| 21 | F-PUR-01 | Supplier registration form | **In DCRS** as `pur-supplier-registration` "Supplier Registration Form", Rev 00 |
| 22 | F-PUR-02 | Supplier audit & visit report | **In DCRS** as `pur-supplier-audit-report` "Supplier Audit Report", Rev 00 |
| 23 | F-PUR-03 | List of Approved Suppliers | **In DCRS** as `pur-approved-suppliers` "List of Approved Suppliers (RM, PM, Service Provider)", Rev 00 |
| 24 | F-PUR-04 | Purchase Order | **Not supplied yet.** The company's own file, F-PUR-04_Purchase order.xlsx, exists but was not sent (§68). |
| 25 | F-PUR-05 | RM & PM Supplier performance monitoring | **In DCRS** as `pur-supplier-performance` "Raw Material (Label Stock, Ink, Films etc.) & Packing Materials Supplier (Paper Core, Wooden Pallets etc.) Performance Monitoring Register", Rev 00 |
| 26 | F-PUR-06 | Service provider performance monitoring | **In DCRS** as `pur-service-provider-performance` "Service Provider - Performance Monitoring Register", Rev 00 |

### Store (STR)

| Sr. | Format number | Name on the list | Status |
|---|---|---|---|
| 27 | F-STR-01 | Incoming Material & Vehicle inspection Record | **In DCRS** as `str-incoming-material-vehicle` "Incoming Material Vehicle & Condition Monitoring Record", Rev TO BE CONFIRMED. Supplied as a photograph of the rubber stamp (§71). |
| 28 | F-STR-02 | Sharp metal objects issuance & replacement record | **In DCRS** as `str-sharp-metal-objects` "Sharp Metal Objects Issuance (New) & Return (Old) Record", Rev 00 |

### Quality Control (QC)

| Sr. | Format number | Name on the list | Status |
|---|---|---|---|
| 29 | F-QC-01 | Inspection record for BOPP Film | **In DCRS** as `qc-bopp-film` "Inspection Record - BOPP Film", Rev 01 |
| 30 | F-QC-02 | Inspection record for CORRUGATED BOX | **In DCRS** as `qc-corrugated-box` "Inspection Record - Corrugated Box", Rev 01 |
| 31 | F-QC-03 | Inspection record for Label stock | **In DCRS** as `qc-label-stock` "Inspection Record - Label Stock", Rev 01 |
| 32 | F-QC-04 | Inspection record for Paper core | **In DCRS** as `qc-paper-core` "Inspection Record: Paper Core", Rev 01 |
| 33 | F-QC-05 | Inspection record for PVC+PET Film | **In DCRS** as `qc-pvc-pet-film` "Inspection Record - PVC / PET Film", Rev 01 |
| 34 | F-QC-06 | Certificate of analysis (COA)-Label | **In DCRS** as `qc-coa-label` "Certificate of Analysis [COA] For Label", Rev TO BE CONFIRMED |
| 35 | F-QC-07 | Certificate of analysis (COA)-Sleeve | **In DCRS** as `qc-coa-sleeve` "Certificate of Analysis [COA] For Shrink Sleeves", Rev TO BE CONFIRMED |
| 36 | F-QC-08 | MASTER LIST OF CALIBRATION INSTRUMENTS | **In DCRS** as `qc-calibration-master-list` "Master List of Calibration Instruments", Rev 01 |
| 37 | F-QC-09 | Statement of Compliance (SOC) - Label | **In DCRS** as `soc-labels` "Statement of Compliance (SOC) — Pressure Labels", Rev 00. Shown in the "Quality — Compliance" module. |
| 38 | F-QC-10 | Statement of Compliance (SOC) - Sleeve | **Not supplied yet.** |
| 39 | F-QC-11 | GSM cutting plate internal calibration record | **In DCRS** as `qc-gsm-plate-calibration` "Monthly Internal Calibration Records – GSM Cutting Plate", Rev 01 |
| 40 | F-QC-12 | Weighing balance internal calibration record | **In DCRS** as `qc-weight-scale-calibration` "Weekly Internal Calibration Records - Weight Scale", Rev 01 |
| 41 | F-QC-13 | IPQC - PRINTING | **In DCRS** as `qc-inprocess-printing` "In Process Quality Control (Printing) — ઇન પ્રોસેસ ક્વોલિટી કંટ્રોલ", Rev TO BE CONFIRMED. The Gujarati form. |
| 42 | F-QC-14 | TEST RELIABILITY RECORD | **Not supplied yet.** |
| 43 | F-QC-15 | Area Line Clearance format | **In DCRS** as `qc-line-clearance-materials` "Line Clearance — Materials (લાઈન કિલયરન્સ)", Rev TO BE CONFIRMED and `qc-line-clearance-quality` "Line Clearance — Quality (ક્વોલીટી શહી)", Rev TO BE CONFIRMED. The Gujarati checklist prints no number, so DCRS still shows "TO BE CONFIRMED" (§57), but its photograph is saved on your computer as "F-QC-15 Line Clearance format (2).jpg", so it is very likely F-QC-15. Please confirm. |
| 44 | F-QC-15 - A | Area Line Clearance - PRINTING | **In DCRS** as `qc-line-clearance-printing` "Area Line Clearance Report - Printing", Rev 00 |
| 45 | F-QC-15 - B | Area Line Clearance - PUNCHING | **Supplied but not built.** The paper is on your computer: "F-QC-15-A-G Line Clearance Punching - Printing.pdf" in your Downloads folder, saved on 18-Sep-2026 with the other QC papers. It prints "AREA LINE CLEARANCE REPORT - PUNCHING", Format no. F/QC/15-B, Rev 00, effective 16.02.2022. REQUIREMENTS §57 says 15-B was not supplied, and the file is not in source-documents/, so it was probably never sent. No need to ask for it: just confirm it can be used. |
| 46 | F-QC-15 - C | Area Line Clearance - QC MACHINE INSPECTION | **In DCRS** as `qc-line-clearance-qc-machine` "Area Line Clearance Report - QC Machine Inspection", Rev 00 |
| 47 | F-QC-15 - D | Area Line Clearance - QC MANUAL INSPECTION | **In DCRS** as `qc-line-clearance-qc-manual` "Area Line Clearance Report - QC Manual Inspection", Rev 00 |
| 48 | F-QC-15 - E | Area Line Clearance - SLITTING | **In DCRS** as `qc-line-clearance-slitting` "Area Line Clearance Report - Slitting", Rev 00 |
| 49 | F-QC-15 - F | Area Line Clearance - SHRINK SLEEVE GLUING | **In DCRS** as `qc-line-clearance-sleeve-gluing` "Area Line Clearance Report - Shrink Sleeve Gluing", Rev 00 |
| 50 | F-QC-15 - G | Area Line Clearance - SHRINK SLEEVE CUTTING | **In DCRS** as `qc-line-clearance-sleeve-cutting` "Area Line Clearance Report - Shrink Sleeve Cutting", Rev 00 |
| 51 | F-QC-16 | OBSOLETE ARTWORK & SHADE CARD RECORD | **In DCRS** as `qc-obsolete-artwork` "Register of Obsolete Artwork", Rev 00 |
| 52 | F-QC-17 | Scale / Ruler internal calibration record | **Not supplied yet.** |
| 53 | F-QC-21 | _Inspection record for Flexo Ink | **In DCRS** as `qc-flexo-ink` "Inspection Record – Flexo Ink", Rev 00. A second supplied paper also prints F/QC/21 (the lamination film adhesive record, see below). |
| 54 | F-QC-30 | Lamination Adhesive Viscosity Record | **In DCRS** as `qc-viscosity` "Lamination Adhesive Viscosity Record", Rev 00. Shown in the "Lamination — Quality Control" module. |
| 55 | F-QC-31 | COA Pouch | **Not supplied yet.** |
| 56 | F-QC-32 | Adhesive mixing ratio | **In DCRS** as `qc-adhesive-mixing` "Adhesive Mixing Ratio Record", Rev 00. Shown in the "Lamination — Quality Control" module. |
| 57 | F-QC-33 | INSPECTION RECORD – INCOMING LAMINATION GRADE FILM | **Not supplied yet.** |
| 58 | F-QC-34 | INSPECTION RECORD – LAMINATION GRADE PRINTED FILM | **In DCRS** as `qc-inspection-printed-film` "Inspection Record — Lamination Grade Printed Film", Rev 00 |
| 59 | F-QC-35 | SLITTING - LAMINATION GRADE FILM | **In DCRS** as `qc-inspection-slitting` "Inspection Record — Slitting - Lamination Grade Film", Rev 00 |
| 60 | F-QC-36 | SOLVENT BASE LAMINATION FILM | **Not supplied yet.** |
| 61 | F-QC-37 | INSPECTION RECORD – POUCHING PROCESS | **In DCRS** as `qc-inspection-pouching` "Inspection Record — Pouching Process", Rev 00 |
| 62 | F-QC-38 | Statement of Compliance (SOC) - Flexible packaging materials (Laminated Pouch & Rolls) | **In DCRS** as `soc-flexible-packaging` "Statement of Compliance (SOC) — Flexible Packaging (Rolls & Pouches)", Rev 00. Shown in the "Quality — Compliance" module. |
| 63 | F-QC-39 | FGPO Specification | **Not supplied yet.** The workbook says it is kept in SAP. |
| 64 | F-QC-40. A | Temperature Monitoring record - Printing machine, Ink kitchen, Ware house | **Not supplied yet.** The workbook adds revision 01.07.2026 and the note "Humidity also mentioned". |
| 65 | F-QC-40. B | Temperature Monitoring record - Sleeve Division | **Not supplied yet.** |
| 66 | F-QC-40. C | Temperature Monitoring record - Hotroom | **In DCRS** as `qc-temperature` "Temperature Monitoring Record — Hot Room", Rev 00. Shown in the "Lamination — Quality Control" module. |
| 67 | F-QC-41 | Curing time monitoring record | **Obsolete on the list.** The list prints "Obsolate-24.06.25" (the workbook says "Obsolate on 25.06.25"). Not in DCRS, and nothing to ask for. |
| 99 | QA-PRO-FL-CCT-01 | Camera Challenge Test | **In DCRS** as `qc-camera-challenge-test` "Defect Detection System Camera Challenge Test", Rev 00. The list prints it after the Production formats and its number has no department code; DCRS files it under Quality Control. |

### Quality Assurance (QA)

| Sr. | Format number | Name on the list | Status |
|---|---|---|---|
| 68 | F-QA-01 | Traceability Report | **Not supplied yet.** The workbook says "SAP/ Hard copy". |

### Production (PRD)

| Sr. | Format number | Name on the list | Status |
|---|---|---|---|
| 69 | F-PRD-01 | Flexo Printing Production Register | **Not supplied yet.** |
| 70 | F-PRD-02 | Punching Production Register | **Not supplied yet.** |
| 71 | F-PRD-03 | On-line QC Inspection Register | **Not supplied yet.** |
| 72 | F-PRD-04 | Off-line QC Inspection Register | **Not supplied yet.** |
| 73 | F-PRD-05 | Slitting Production Register | **Not supplied yet.** |
| 74 | F-PRD-06 | Shrink sleeve Gluing Register | **Not supplied yet.** The workbook adds revision 1 of 01.09.2026. |
| 75 | F-PRD-07 | Shrink Sleeve cutting Production Register | **Not supplied yet.** The workbook adds revision 1 of 01.09.2026. |
| 76 | F-PRD-08 | Dispatch Card | **Not supplied yet.** |
| 77 | F-PRD-09 | Packing Label. | **Not supplied yet.** The workbook gives F-PRD-09 to "Prepress Specification" instead. |
| 78 | F-PRD-10 | Sharp metal object Daily Issue & Return monitoring record | **Not supplied yet.** |
| 79 | F-PRD-11 | Surgical Machine Blade Change Record | **Not supplied yet.** |
| 80 | F-PRD-12 | Razor Blade Change Record | **Not supplied yet.** |
| 81 | F-PRD-13 | Prepress Specification | **Not supplied yet.** The workbook gives F-PRD-13 to "Packing Label" instead. |
| 82 | F-PRD-14.A | Job Card - LABEL | **Not supplied yet.** |
| 83 | F-PRD-14.B | Job Card - SLEEVE | **Not supplied yet.** |
| 84 | F-PRD-14.E | Job Card - POUCH | **Not supplied yet.** |
| 85 | F-PRD-15 | QC- wastage tracking record | **Not supplied yet.** The workbook says it is kept in SAP. |
| 86 | F-PRD-16 | Production issues Analysis | **Not supplied yet.** The workbook says it is kept in SAP. |
| 87 | F-PRD- 17. A | Ink Formulation record- Label | **Not supplied yet.** The workbook marks 17. A, B and C "Merged in one sheet". |
| 88 | F-PRD- 17. B | Ink Formulation record- Sleeve | **Not supplied yet.** |
| 89 | F-PRD- 17. C | Ink Formulation record- Pouch | **Not supplied yet.** |
| 90 | F-PRD-18 | SOLVENT BASE LAMINATION - ALC & PRODUCTION REPORT | **In DCRS** as `prd-alc-production` "Solvent Base Lamination — ALC & Production Report", Rev 01. Shown in the "Lamination — Production" module. |
| 91 | F-PRD-19 | SOLVENT BASE LAMINATION - PROCESS PARAMETER RECORD | **In DCRS** as `prd-process-parameter` "Solvent Base Lamination — Process Parameter Record", Rev 00. Shown in the "Lamination — Production" module. DCRS still shows its number as "TO BE CONFIRMED" (hidden under the clip in the photograph, §12); the list's F-PRD-19 of 15.12.2024 matches the "(00/15.12.2024)" that is visible. |
| 92 | F-PRD-20 | SLITTING - ALC & PRODUCTION REPORT | **Not supplied yet.** |
| 93 | F-PRD-21 | Area Line clearance record - POUCHING | **Not supplied yet.** |
| 94 | F-PRD-22 | Blade Change Record - All Pouching machine | **Not supplied yet.** |
| 95 | F-PRD-23 | Manual cutter Daily Issue & Return monitoring record | **Not supplied yet.** |
| 96 | F-PRD-24 | Razor Blade Change Record - Laminated FIlms Slittig machine | **Not supplied yet.** |
| 97 | F-PRD-25 | POUCHING - PROCESS PARAMETER RECORD | **Not supplied yet.** |
| 98 | F-PRD-26 | DOCTORING - ALC & PRODUCTION REPORT | **Not supplied yet.** The workbook adds revision 1 of 23.07.2025 ("Job bag require KG added"). |

### Maintenance (MNT)

| Sr. | Format number | Name on the list | Status |
|---|---|---|---|
| 100 | F-MNT-01 | List of Equipments | **In DCRS** as `mnt-equipment-list` "List of Equipments & Utilities", Rev 00 |
| 101 | F-MNT-02 | Preventive maintenance plan & record | **In DCRS** as `mnt-pm-record` "Preventive Maintenance Schedule & Record", Rev 01 |
| 102 | F-MNT-03 | Yearly PM Schedule | **In DCRS** as `mnt-yearly-pm-schedule` "Yearly Preventive Maintenance Schedule", Rev 01 |
| 103 | F-MNT-04 | Daily Equipment Health Status & Cleaning Record | **In DCRS** as `mnt-daily-health` "Daily Equipment Health Status & Cleaning Record", Rev 00 |
| 104 | F-MNT-05 | Breakdown intimation Slip | **In DCRS** as `mnt-breakdown-memo` "Breakdown Maintenance Memo & Post Maintenance Hygiene Record", Rev 00 and `mnt-breakdown-clearance` "Breakdown Maintenance Memo & Hygiene Clearance Record", Rev 00. Two different slips print F/MNT/05; both are built (TBC 32). |
| 105 | F-MNT-06 | Equipment breakdown record | **In DCRS** as `mnt-breakdown-record` "Equipments Breakdown Maintenance Record", Rev 00 |
| 106 | F-MNT-07 | Temporary engineering record | **In DCRS** as `mnt-temporary-engineering` "Temporary Engineering Log", Rev 00 |
| 107 | F-MNT-08 | New Equipment Installation & commissioning record | **In DCRS** as `mnt-new-equipment` "New Equipment Installation Report", Rev 00 |
| 108 | F-MNT-09 | List of Glass articles & weekly Glass Breakage monitoring record | **In DCRS** as `mnt-glass-breakage` "List of Glass Articles & Weekly Glass Brekage Monitoring Record", Rev 02 |
| 109 | F-MNT-10 | Weekly Wooden article condition monitoring record | **In DCRS** as `mnt-wooden-articles` "List of Wooden Articles & Weekly Wooden Article Monitoring Record", Rev 02 |
| 110 | F-MNT-11 | Lux measurement record | **In DCRS** as `mnt-lux-level` "Lux Level Measurement Record", Rev 01 |

### Human Resources (HR)

| Sr. | Format number | Name on the list | Status |
|---|---|---|---|
| 111 | F-HR-01 | Personal competence record | **In DCRS** as `hr-competence` "Personal Competence Records (Staff Members Only)", Rev 00 |
| 112 | F-HR-02 | Personnel competence criteria | **Not supplied yet.** |
| 113 | F-HR-03 | Operator skill matrix | **In DCRS** as `hr-skill-matrix` "Skill Matrix - Operator", Rev 00 |
| 114 | F-HR-04 | Pre Employment Health declaration. | **In DCRS** as `hr-pre-employment-health` "Pre-Employment Medical Health Declaration", Rev 00 |
| 115 | F-HR-05 | Induction Training programme-Staff | **In DCRS** as `hr-induction-staff` "Induction Training Record — New Employee (Staff: Supervisor & Above)", Rev 00 |
| 116 | F-HR-06 | Induction Training programme -Operators | **In DCRS** as `hr-induction-operators` "Induction Training Record — Operators / Workers", Rev 00 |
| 117 | F-HR-07 | Job responsibility & authorities | **In DCRS** as `hr-job-responsibility` "Job Responsibility & Authority", Rev 00 |
| 118 | F-HR-08 | Employee wise Training need identification Record | **In DCRS** as `hr-training-needs` "Employee Wise Training Need Identification Record", Rev 00 |
| 119 | F-HR-09 | Training Calendar | **In DCRS** as `hr-training-calendar` "Training Plan Calender", Rev 00 |
| 120 | F-HR-10 | Training Imparted Record | **Not supplied yet.** |
| 121 | F-HR-11 | Training Evaluation Record | **In DCRS** as `hr-training-effectiveness` "Training Effectiveness Evaluation Record", Rev 00. The PDF prints the note "Not added in project" beside this line. DCRS does have F/HR/11: the form prints "TRAINING EFFECTIVENESS EVALUATION RECORD", which is the name the list gives F-HR-12, so the names disagree (TBC 23). |
| 122 | F-HR-12 | TRAINING EFFECTIVENESS EVALUATION RECORD | **In DCRS** as `hr-training-feedback` "Training Feedback & Evaluation Record", Rev 00. The form prints "TRAINING FEEDBACK & EVALUATION RECORD" (TBC 23). |
| 123 | F-HR-13 | Authorization for Mobile Inside Plant | **In DCRS** as `hr-mobile-authorization` "Authorization for Mobile Usage in Plant Area", Rev 00 |
| 124 | F-HR-14 | Visitor health declaration record | **In DCRS** as `hr-visitor-health` "Visitor Health Status Declaration Record", Rev 00 |
| 125 | F-HR-15 | Daily cleaning record | **Not supplied yet.** |
| 126 | F-HR-16 | Monthly Cleaning record | **Not supplied yet.** |
| 127 | F-HR-17 | Daily pest Control monitoring Record | **In DCRS** as `daily-pest-monitoring` "Daily Pest Control Monitoring Record", Rev 00. On the Pest Control shelf of Human Resources. |
| 128 | F-HR-18 | Fly Catcher Inspection & Cleaning Record | **In DCRS** as `fly-catcher` "Fortnightly — Fly Catcher Inspection & Cleaning Record", Rev 02. On the Pest Control shelf of Human Resources. |
| 129 | F-HR-19 | Monthly GMP Inspection record | **In DCRS** as `hr-gmp-checklist` "Monthly PRP Check List (GMP Inspection Record)", Rev 00 |
| 130 | F-HR-20 | HARA pri | **In DCRS** as `hr-psc-survey` "Product Safety Culture Survey", Rev 00. The PDF prints "HARA pri" here; the workbook and the form say "Product Safety Culture Survey". |
| 131 | F-HR-21 | Product Safety Culture Survey analysis record | **In DCRS** as `hr-psc-survey-analysis` "Product Safety Culture Survey — Analysis", Rev 00 |
| 132 | F-HR-22 | Daily Employee Sanitation & Hygiene record | **In DCRS** as `hr-hygiene-report` "Daily Personal Sanitation & Hygiene Inspection Report", Rev 00 |

### Dispatch (DISP)

| Sr. | Format number | Name on the list | Status |
|---|---|---|---|
| 133 | F-DISP-01 | Safe transportation agreement | **In DCRS** as `disp-safe-transporter-agreement` "Safe Transporter Agreement", Rev TO BE CONFIRMED |
| 134 | F-DISP-02 | Container stuffing & Vehicle Inspection Report | **In DCRS** as `disp-container-stuffing` "Container Stuffing & Vehicle Inspection Record — કન્ટેનર સ્ટફિંગ અને વાહન નિરીક્ષણ રેકોર્ડ", Rev 00 |
| 135 | F-DISP-04 | Vehicle cleaning Protocol & Record | **Not supplied yet.** |

### Only in the workbook (not on the PDF)

| Workbook Sr. | Format number | Name in the workbook | Status |
|---|---|---|---|
| 21 | F-MKT-05 | Customer complaint handling checklist (21.07.26) | **In DCRS** as `capa-customer-complaint` "CAPA — External: Customer Complaint Handling Checklist", Rev 00. Shown in the CAPA module, where complaints are handled (§19, TBC 29). |
| 22 | F-MKT-06 | Complaint Acknowldgement form (01.07.2026) | **In DCRS** as `capa-complaint-ack` "CAPA — Internal: Complaint Acknowledgement Report", Rev TO BE CONFIRMED. The form itself prints "QA-CAF-00 (22.03.26)", not F-MKT-06; DCRS files it under Marketing because the workbook does (§30, TBC 29). Shown in the CAPA module. |
| 101 | F-PRD-27 | Rewinding with LC- SS (01.09.2026) | **Not supplied yet.** |
| 102 | F-PRD-28 | Slitting with LC- SS (01.09.2026) | **Not supplied yet.** |
| 103 | F-PRD-29 | Shrink Sleeve Post press process checklist (10.07.2026) | **Not supplied yet.** |
| 104 | F-PRD-30 | Gluing adhesive mixing ratio (17.08.2026) | **Not supplied yet.** |

### Where the PDF and the workbook differ

These matter when the papers are sent, so the right number goes on the right form. The full cell-by-cell list is
in the comment above `FORMAT_LINES` in `frontend/src/data/seed/sysDocumentControlLayouts.ts` (TBC 25).

- **F-PRD-09 and F-PRD-13 are swapped.** The PDF gives F-PRD-09 to "Packing Label." and F-PRD-13 to "Prepress
  Specification"; the workbook gives them the other way round. When you send these two, please say which number
  each paper prints.
- **F-HR-20** reads "HARA pri" on the PDF, and "Product Safety Culture Survey" in the workbook and on the form.
- **F-MKT-03** reads "Customer complaint Form" on the PDF, and "Customer complaint Form (CAPA report)" in the workbook.
- **Later revisions in the workbook only:** F-SYS-14 and F-SYS-15 revision 1 of 01.04.2025 (not supplied; the
  pages in DCRS are Rev 00), F-PRD-06 and F-PRD-07 revision 1 of 01.09.2026, F-PRD-26 revision 1 of 23.07.2025,
  F-QC-40. A revision 01.07.2026, F-MNT-09 revision 2 of 01.09.2025, and F-MNT-11 revision 1 of 15.12.2024. The
  workbook also dates F-QC-15 - A to G 16.02.22 (the PDF: 01.12.21), and F-HR-15 and F-HR-16 revision 1 15.12.24
  (the PDF: 15.01.25).
- **Kept in SAP, says the workbook:** F-QC-39 and F-PRD-15 and 16 ("SAP"); F-QA-01, F-PRD-09, F-PRD-13 and
  F-PRD-14.A, B and E ("SAP/ Hard copy"). The PDF says "Hard copy" for all but F-QC-39.

## DCRS documents that are not on the master list

DCRS holds 26 documents whose format is not on the PDF list. Why each one is in DCRS, from REQUIREMENTS:

| DCRS id | Name in DCRS | Number it prints, Rev | Department | Why it is in DCRS |
|---|---|---|---|---|
| `service-report-rodent` | "Pest Control Service Report — Rat / Mice (Rodent Control Service)" | none printed, Rev TO BE CONFIRMED | HR | Gurudev Pest Control's own fortnightly visit report, on the provider's template, which prints no format number (§5, "Service Report-April 2026.xls"). Filed with F-HR-17 and F-HR-18 in the pest control file. |
| `service-report-general` | "Pest Control Service Report — Ants & Cockroaches (General Pest Control Services)" | none printed, Rev TO BE CONFIRMED | HR | The same provider report, general pest control round (§5). |
| `service-report-fly` | "Pest Control Service Report — Fly Control Services" | none printed, Rev TO BE CONFIRMED | HR | The same provider report, fly control round (§5). |
| `pest-responsibilities` | "Responsibilities of Pest Control — Site & Service Provider" | none printed, Rev TO BE CONFIRMED | HR | What the site and the provider are each responsible for, signed by both on 01-Jan-2025 (§31). |
| `service-agreement` | "Pest Control Service Agreement — Site & Service Provider" | none printed, Rev TO BE CONFIRMED | PUR | The two-year contract with Gurudev Pest Control, on the provider's letterhead; asked for again every two years (§33). |
| `training-record` | "Pest Control Training Record" | none printed, Rev TO BE CONFIRMED | HR | The provider's yearly pest control awareness training for plant staff, last held 24-Dec-2025 (§7, §15). |
| `chemical-master` | "Pesticide Application Chart (Chemical Master)" | none printed, Rev TO BE CONFIRMED | HR | Reference chart of the pesticides and their dilutions (§3). Kept when the provider's SOP was withdrawn, because it is the company's own chart. |
| `gurudev-insecticide-licence` | "Insecticide Licence — Gurudev Pesticides (Form III, Govt. of Gujarat)" | FORM III — MEH/FP1230000675/2023-2024, Rev TO BE CONFIRMED | HR | The provider's government licence, kept for reference exactly as supplied (§22). |
| `gap-inspection` | "CAPA — Internal: Pest Control Inspection Findings Report" | none printed, Rev TO BE CONFIRMED | QA | The December-2023 pest control GAP analysis and its corrective actions (§6). |
| `capa-customer-complaint` | "CAPA — External: Customer Complaint Handling Checklist" | F/MKT/05, Rev 00 | MKT | On the workbook as F-MKT-05 but not on the PDF (§19). |
| `capa-complaint-ack` | "CAPA — Internal: Complaint Acknowledgement Report" | QA-CAF-00, Rev TO BE CONFIRMED | MKT | The workbook's F-MKT-06 "Complaint Acknowldgement form"; not on the PDF (§30). |
| `qc-offset-ink` | "Inspection Record – Offset Ink" | F/QC/18, Rev 01 | QC | Supplied by Quality Control on 18-Sep-2026 (§57). F-QC-18 is not on the current list; the workbook's older sheet has an un-numbered line "F-QC-18 Carton Ink". |
| `qc-duplex-board` | "Inspection Record – Duplex Board" | F/QC/19, Rev 01 | QC | Supplied on 18-Sep-2026 (§57). Not on the list; the tolerance card prints the same number (§57 TBC 1). |
| `qc-tolerance-card-nivea` | "Tolerance Card for Beiersdorf AG. Germany" | F-QC-19, Rev TO BE CONFIRMED | QC | Supplied on 18-Sep-2026 (§57). Not on the current list; the older sheet has "F-QC-19 Nivea Tolerance card". |
| `qc-kraft-paper` | "Inspection Record – Kraft Paper & White Top Liner" | F/QC/20, Rev 01 | QC | Supplied on 18-Sep-2026 (§57). Not on the list; the printing aids record prints the same number (§57 TBC 1). |
| `qc-printing-aids-destruction` | "Destruction Record — Printing Aids" | F/QC/20, Rev 00 | QC | Supplied on 18-Sep-2026 (§57). Not on the current list; the older sheet has "F-QC-20 PRINTING AIDS DESTRUCTION RECORD (Nivea)". |
| `qc-lamination-adhesive-inspection` | "Inspection Record – Lamination Film Adhesive" | F/QC/21, Rev 01 | QC | Supplied on 18-Sep-2026 (§57). The list gives F-QC-21 to the flexo ink record, which DCRS also holds. |
| `qc-side-pasting-adhesive` | "Inspection Record – Side Pasting Adhesive" | F/QC/22, Rev 01 | QC | Supplied on 18-Sep-2026 (§57). Not on the current list; the older sheet has "F-QC-22 Sheet pasting Viscosity measurement", which may or may not be this form. |
| `qc-starch-powder` | "Inspection Record – Corrugation Starch Powder" | F/QC/23, Rev 01 | QC | Supplied on 18-Sep-2026 (§57). Not on the list. |
| `qc-sheet-pasting-powder` | "Inspection Record – Sheet Pasting Powder" | F/QC/24, Rev 01 | QC | Supplied on 18-Sep-2026 (§57). Not on the list. |
| `qc-coa-corrugated` | "Certificate of Analysis [COA] For Corrugated Boxes" | F/QC/25, Rev TO BE CONFIRMED | QC | Supplied on 18-Sep-2026 (§57); it also carries an older number, QA-IP-TRFCBA-011-00-01-09-18. Not on the current list; the older sheet gives F-QC-25 to "MOM". |
| `qc-analysis-report` | "Analysis Report" | F/QC/29, Rev 00 | QC | Supplied on 18-Sep-2026 (§57). Not on the list; shares F/QC/29 with the utility test report. |
| `qc-utility-test-report` | "Utility Test Report (Nivea samples)" | F/QC/29, Rev 00 | QC | Supplied on 18-Sep-2026, typed on the Minutes of Meetings form (§57). Not on the list. |
| `qc-minutes-of-meetings` | "Minutes of Meetings" | F/QC/30, Rev 01 | QC | Supplied on 18-Sep-2026 (§57). The list gives F-QC-30 to the Lamination Adhesive Viscosity Record, which DCRS also holds. |
| `sys-mrm-agenda` | "Agenda for BRCGS Packaging (Issue 7) Management Review Meeting Record" | F/SYS/04-A, Rev 01 | SYS | The management review's notice, supplied filled (July 2025). Its number is printed on the paper but is not on the list (§76, TBC 24). |
| `sys-hara-annual` | "Annual HARA Review & Verification Record" | F/SYS/20, Rev 00 | SYS | Supplied filled (January 2026). Its number is printed on the paper but is not on the list (§76, TBC 24). |

Most of the Quality Control ones are the carton and Nivea papers (duplex board, kraft paper, starch and sheet
pasting powder, the corrugated box certificate, the tolerance card). Five of their numbers are printed on two
different papers each: F/QC/19, 20, 21, 29 and 30 (§57 TBC 1).

Withdrawn earlier and no longer in DCRS: the pest control provider's SOP (withdrawn on 13-Sep-2026 on your
instruction, because it is the provider's procedure and not on the list; §4, §42) and a Lizard Control service
report (withdrawn on 08-Sep-2026; no specimen was ever supplied; §5).

## Formats to ask for

Please send the paper for each of these 49 formats: the blank format, and a filled page if there is one.

**Marketing (1)**
- F-MKT-03 Customer complaint Form (the workbook: "Customer complaint Form (CAPA report)")

**Purchase (1)**
- F-PUR-04 Purchase Order (the company's own file is F-PUR-04_Purchase order.xlsx)

**Quality Control (9)**
- F-QC-10 Statement of Compliance (SOC) - Sleeve
- F-QC-14 TEST RELIABILITY RECORD
- F-QC-17 Scale / Ruler internal calibration record
- F-QC-31 COA Pouch
- F-QC-33 INSPECTION RECORD – INCOMING LAMINATION GRADE FILM
- F-QC-36 SOLVENT BASE LAMINATION FILM
- F-QC-39 FGPO Specification (the workbook says it is kept in SAP; say if it should stay out of DCRS)
- F-QC-40. A Temperature Monitoring record - Printing machine, Ink kitchen, Ware house (the workbook's latest revision is 01.07.2026)
- F-QC-40. B Temperature Monitoring record - Sleeve Division

**Quality Assurance (1)**
- F-QA-01 Traceability Report

**Production (32)**
- F-PRD-01 Flexo Printing Production Register
- F-PRD-02 Punching Production Register
- F-PRD-03 On-line QC Inspection Register
- F-PRD-04 Off-line QC Inspection Register
- F-PRD-05 Slitting Production Register
- F-PRD-06 Shrink sleeve Gluing Register (the workbook's latest revision is 01.09.2026)
- F-PRD-07 Shrink Sleeve cutting Production Register (the workbook's latest revision is 01.09.2026)
- F-PRD-08 Dispatch Card
- F-PRD-09 Packing Label. (the workbook calls F-PRD-09 "Prepress Specification")
- F-PRD-10 Sharp metal object Daily Issue & Return monitoring record
- F-PRD-11 Surgical Machine Blade Change Record
- F-PRD-12 Razor Blade Change Record
- F-PRD-13 Prepress Specification (the workbook calls F-PRD-13 "Packing Label")
- F-PRD-14.A Job Card - LABEL
- F-PRD-14.B Job Card - SLEEVE
- F-PRD-14.E Job Card - POUCH
- F-PRD-15 QC- wastage tracking record (the workbook says SAP)
- F-PRD-16 Production issues Analysis (the workbook says SAP)
- F-PRD- 17. A Ink Formulation record- Label (the workbook says A, B and C are "Merged in one sheet", so one paper may cover all three)
- F-PRD- 17. B Ink Formulation record- Sleeve
- F-PRD- 17. C Ink Formulation record- Pouch
- F-PRD-20 SLITTING - ALC & PRODUCTION REPORT
- F-PRD-21 Area Line clearance record - POUCHING
- F-PRD-22 Blade Change Record - All Pouching machine
- F-PRD-23 Manual cutter Daily Issue & Return monitoring record
- F-PRD-24 Razor Blade Change Record - Laminated FIlms Slittig machine
- F-PRD-25 POUCHING - PROCESS PARAMETER RECORD
- F-PRD-26 DOCTORING - ALC & PRODUCTION REPORT
- F-PRD-27 Rewinding with LC- SS (workbook only)
- F-PRD-28 Slitting with LC- SS (workbook only)
- F-PRD-29 Shrink Sleeve Post press process checklist (workbook only)
- F-PRD-30 Gluing adhesive mixing ratio (workbook only)

**Human Resources (4)**
- F-HR-02 Personnel competence criteria
- F-HR-10 Training Imparted Record
- F-HR-15 Daily cleaning record
- F-HR-16 Monthly Cleaning record

**Dispatch (1)**
- F-DISP-04 Vehicle cleaning Protocol & Record

### Not to send, only to confirm

1. **F-QC-15 - B, Area Line Clearance - Punching.** The paper is already in your Downloads folder as
   "F-QC-15-A-G Line Clearance Punching - Printing.pdf" (F/QC/15-B, Rev 00, 16.02.2022). May it be built from that file?
2. **F-QC-15, Area Line Clearance format.** Are the two Gujarati line clearance checklists in DCRS (materials and
   quality) this format? Their photograph is saved as "F-QC-15 Line Clearance format (2).jpg", but the paper prints
   no number.
3. **F-PRD-19.** Is the Solvent Base Lamination Process Parameter Record F-PRD-19, as the list says? Its number was
   hidden under the clip in the photograph (§12).
4. **F-HR-11 and the note "Not added in project".** DCRS does hold F/HR/11: the form headed "TRAINING EFFECTIVENESS
   EVALUATION RECORD". The list calls F-HR-11 "Training Evaluation Record" and gives the "effectiveness" name to
   F-HR-12. Is the note only about the name, or is there another F-HR-11 paper?
5. **F-HR-20 "HARA pri"** on the PDF: is it a typing slip for "Product Safety Culture Survey"?
6. **Which list is current:** the PDF (135 formats) or the workbook (141)? DCRS keeps the workbook (TBC 25).
7. **The 26 DCRS documents not on the list:** should F/SYS/04-A, F/SYS/20 and the QC numbers F/QC/18 to 25, 29 and
   30 go onto the master list, and should the pest control provider's papers stay as they are (TBC 24, 29, §57)?
8. **The formats kept in SAP** (see above): should DCRS hold them as well?

## Also found

`fwdallpmmaintenancerecordsforbrc.zip` in your Downloads folder (saved 29-Sep-2026, with the Maintenance papers of
that day) holds 16 filled F-MNT-02 preventive maintenance records, one per machine: Core Cutter, Doctoring
Rewinder, SB Lamination 1 and 2, Slitting 1 and 2, Viscosity Machine, and nine pouching machines. F/MNT/02 itself is
in DCRS, but these records are not in `source-documents/` and REQUIREMENTS does not mention them. If they should be
on file as records, please say so. They may also answer TBC 34, which asks why no Pouch machine is on the 2026 PM
schedule.
