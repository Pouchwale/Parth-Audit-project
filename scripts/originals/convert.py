"""THE OWNER'S OWN FILES AS DOWNLOAD TEMPLATES (REQUIREMENTS section 119).

The owner, 20-Oct-2026: "when user click on print button or download the any particular document then it should download the
same document which i have uploaded / Supplied to you and this is applicable to all modules."

For every document whose original was supplied as a Word or Excel file, this script
  1. picks the right original (and says why): where two versions exist, the one whose text matches the owner's own PDF of
     it best (his QC-Pdf's folder, or the PDF the document was built from); where one workbook holds several documents
     (F/QC/15-A to G, F-QC-14's Label and Sleeve, F/PRD/23 and F/PRD/10), the document's own sheet;
  2. converts it with Microsoft Word / Excel themselves (.doc -> .docx, .xls -> .xlsx; a .docx/.xlsx is saved again by
     Office as it is), keeping only the document's own sheet of a shared workbook, and sets it on A4 with Word / Excel
     themselves (every Word section, its orientation kept; the Excel sheet's paper) - the owner, 22-Oct-2026: "mostly user
     take print on A4 size paper so print should be print accordingly";
  3. saves it as frontend/public/originals/<document-id>.<docx|xlsx> (copied into dist by the build, fetched by the
     browser only when someone downloads);
  4. exports the original to PDF as the reference: source-documents/originals-pdf/<document-id>.pdf;
  5. copies into source-documents/ any original not yet there;
  6. writes the manifest frontend/src/data/seed/originalFiles.ts (document id -> file, kind, the original's name, the
     sheet, notes).

The originals are READ ONLY: every file is copied into a temporary folder first and opened read-only from there. Word and
Excel run hidden, alerts off, and are closed and quit at the end; an Office process this script started and that is still
running afterwards is ended by its own PID (never one it did not start).

    python -I scripts/originals/convert.py                 # everything
    python -I scripts/originals/convert.py --only a,b      # some documents (their DCRS ids); the manifest keeps the rest
    python -I scripts/originals/convert.py --dry-run       # print the picks, convert nothing
    python -I scripts/originals/convert.py --manifest-only # write the manifest again from picks.json

Needs Windows with Microsoft Office 16 (Word, Excel), Python with pywin32, pdfplumber, openpyxl and xlrd.
"""
import csv
import difflib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
AUDIT = r"C:\Users\parth\Desktop\GP3 work\Audit document"
QC_PDFS = os.path.join(AUDIT, "QC", "QC-Pdf's")
SRC = os.path.join(REPO, "source-documents")
OUT_TEMPLATES = os.path.join(REPO, "frontend", "public", "originals")
OUT_PDFS = os.path.join(SRC, "originals-pdf")
MANIFEST = os.path.join(REPO, "frontend", "src", "data", "seed", "originalFiles.ts")
REPORT = os.path.join(HERE, "picks.json")

# Pictures in his files that are one record's example, not the form (REQUIREMENTS section 98): blanked in the template, their
# frame and size kept, as the print leaves their place empty - F/QC/29's photograph of the label roll his example was for.
EXAMPLE_PICTURES = {"qc-analysis-report": ["word/media/image1.jpeg"]}


def blank_pictures(path, names):
    """Each named picture of the package replaced by a white one of the same pixel size (the drawing keeps its frame)."""
    import zipfile

    from PIL import Image

    with zipfile.ZipFile(path) as z:
        items = [(i, z.read(i.filename)) for i in z.infolist()]
    assert set(names) <= {i.filename for i, _ in items}, (path, names)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for info, data in items:
            if info.filename in names:
                im = Image.open(io.BytesIO(data))
                out = io.BytesIO()
                Image.new("RGB", im.size, "white").save(out, format=im.format or "PNG")
                data = out.getvalue()
            z.writestr(info, data)

# ---------------------------------------------------------------------------------------------------------------------
# THE PICKS. A candidate is "A:<path under the owner's Audit document folder>" or "S:<path under source-documents>", or a
# (candidate, sheet) pair. `ref` is the owner's PDF of the document (Q: = his QC-Pdf's folder, S: = source-documents):
# with more than one candidate, or a workbook of many sheets and no sheet named, the one matching it best is taken.
# Format numbers shared by two documents are resolved by CONTENT and name, never by number (the brief, 20-Oct-2026).

def D(doc_id, candidates, ref=None, sheet=None, note=""):
    return {"id": doc_id, "candidates": candidates, "ref": ref, "sheet": sheet, "note": note}


TWO_VERSIONS = "Two versions are in the owner's folder; the one whose text matches his own PDF of it is taken."

PICKS = [
    # ---- HR
    D("fly-catcher", ["S:F-HR-18_Fly Catcher Inspection & Cleaning Record.doc"], note="The company's own Word original, sent 16-Oct-2026."),
    D("hr-competence", ["A:HR/F-HR-01_Personal Competence record (R-2023).xls"]),
    D("hr-skill-matrix", ["A:HR/F-HR-03_Operator skill matr3ix-2023.xls"], sheet="29.09.2026", note="The workbook keeps two status sheets (01.02.2025 and 29.09.2026) of the same matrix; the latest is taken."),
    D("hr-job-responsibility", ["A:HR/F-HR-07_Job responsibility & authorities (SC)..doc", "A:HR/F-HR-07_Job responsibility & authorities sales corrdinator.doc"], note="Two position sheets of the same format; the first is taken."),
    D("hr-mobile-authorization", ["A:HR/F-HR-13_Authorization for Mobile inside Plant.doc"]),
    D("hr-training-needs", ["A:HR/F-HR-08_Employee wise Training need identification Record(2024-25).xls"], sheet="Formate 01 (2)"),
    D("hr-training-calendar", ["A:HR/F-HR-09_Training Calender(2026-27).xlsx"]),
    D("hr-training-effectiveness", ["A:HR/F-HR-11_Trainging Evaluation sheet.doc"]),
    D("hr-training-feedback", ["A:HR/F-HR-12_Training Feedback & Evaluation Record (1).xls"]),
    D("hr-pre-employment-health", ["A:HR/F-HR-04_Pre Employment Health declaration.doc"]),
    D("hr-induction-staff", ["A:HR/F-HR-05_Induction Training  programme-Staff.doc"]),
    D("hr-induction-operators", ["A:HR/F-HR-06_Induction Training  programme -Operators.doc"]),
    D("hr-visitor-health", ["A:HR/F-HR-14_Visitor health declaration record.doc"]),
    D("hr-daily-cleaning", ["S:F-HR-15_Daily Cleaning record_01_15.12.2024.xls"]),
    D("hr-monthly-cleaning", ["S:F-HR-16_Monthly Cleaning record_01_15.12.2024.xls"]),
    D("hr-gmp-checklist", ["A:HR/F-HR-19_Monthly GMP Inspection record.doc"]),
    D("hr-hygiene-report", ["A:HR/F-HR-22_Daily Employee Sanitation & Hygiene record.xls"]),
    D("hr-psc-survey", ["A:HR/F-HR-20_Product safety culture survey (1).xlsx"], sheet="english", note="The workbook holds the survey in English and in Gujarati; DCRS's survey is the English sheet."),
    D("hr-psc-survey-analysis", ["A:HR/F-HR-21_Product Safety Culture Survey analysis record.xlsx"]),
    # ---- QC (the incoming-material records, their "(2)" versions where the owner's QC-Pdf's folder holds the "(2)" print)
    D("qc-bopp-film", ["A:QC/F-QC-01_Inspection record for BOPP Film (2).doc", "A:QC/F-QC-01_Inspection record for BOPP Film.doc"], ref="Q:F-QC-01_Inspection record for BOPP Film (2).pdf", note=TWO_VERSIONS),
    D("qc-corrugated-box", ["A:QC/F-QC-02_Inspection record for CORRUGATED BOX (2).doc", "A:QC/F-QC-02_Inspection record for CORRUGATED BOX.doc"], ref="Q:F-QC-02_Inspection record for CORRUGATED BOX (2).pdf", note=TWO_VERSIONS),
    D("qc-label-stock", ["A:QC/F-QC-03_Inspection record for Label stock (2).doc", "A:QC/F-QC-03_Inspection record for Label stock.doc"], ref="Q:F-QC-03_Inspection record for Label stock (2).pdf", note=TWO_VERSIONS),
    D("qc-paper-core", ["A:QC/F-QC-04_Inspection record for Paper core (2).doc", "A:QC/F-QC-04_Inspection record for Paper core.doc"], ref="Q:F-QC-04_Inspection record for Paper core (2).pdf", note=TWO_VERSIONS),
    D("qc-pvc-pet-film", ["A:QC/F-QC-05_Inspection record for PVC+PET Film (2).doc", "A:QC/F-QC-05_Inspection record for PVC+PET Film.doc"], ref="Q:F-QC-05_Inspection record for PVC+PET Film (2).pdf", note=TWO_VERSIONS),
    D("qc-coa-label", ["A:QC/F-QC-06_Certificate of analysis (COA)-Label (2).doc", "A:QC/F-QC-06_Certificate of analysis (COA)-Label.doc"], ref="Q:F-QC-06_Certificate of analysis (COA)-Label (2).pdf", note=TWO_VERSIONS),
    D("qc-coa-sleeve", ["A:QC/F-QC-07_Certificate of analysis (COA)-Sleeve (2).doc", "A:QC/F-QC-07_Certificate of analysis (COA)-Sleeve.doc"], ref="Q:F-QC-07_Certificate of analysis (COA)-Sleeve.pdf", note=TWO_VERSIONS),
    D("qc-calibration-master-list", ["A:QC/F-QC-08_Master list of Calibration instruments (2).xlsx", "A:QC/F-QC-08_Master list of Calibration instruments.xlsx"], ref="Q:Copy of F-QC-08_Master list of Calibration instruments (2).pdf", note=TWO_VERSIONS),
    D("soc-labels", ["A:QC/F-QC-09_Statement of Compliance (SOC) - Label.docx"]),
    D("soc-shrink-sleeves", ["A:QC/F-QC-10_Statement of Compliance (SOC) - Shrink Sleeve.docx"]),
    D("qc-gsm-plate-calibration", ["A:QC/F-QC-11 GSM cutting plate internal calibration record (2).docx", "A:QC/F-QC-11 GSM cutting plate internal calibration record.docx"], ref="Q:F-QC-11 GSM cutting plate internal calibration record (2).pdf", note=TWO_VERSIONS),
    D("qc-weight-scale-calibration", ["A:QC/F-QC-12 Weighing balance internal calibration record (2).docx", "A:QC/F-QC-12 Weighing balance internal calibration record.docx"], ref="Q:F-QC-12 Weighing balance internal calibration record (2).pdf", note=TWO_VERSIONS),
    D("qc-test-reliability-label", [("A:QC/F-QC-14 TEST RELIABILITY RECORD (1).xlsx", "Label"), ("S:qc-originals-2026-10-13/F-QC-14 TEST RELIABILITY RECORD.xlsx", "Label")], note="F-QC-14's workbook holds the Label and the Sleeve record; this is the Label sheet."),
    D("qc-test-reliability-sleeve", [("A:QC/F-QC-14 TEST RELIABILITY RECORD (1).xlsx", "Sleeve"), ("S:qc-originals-2026-10-13/F-QC-14 TEST RELIABILITY RECORD.xlsx", "Sleeve")], note="F-QC-14's workbook holds the Label and the Sleeve record; this is the Sleeve sheet."),
    # F/QC/15-A to G: one workbook, a sheet to a department; three copies of it are kept, each sheet printed by the owner.
    *[
        D(doc, [("A:QC/F-QC-15-A-G Line Clearance - Printing (2).xls", sheet), ("A:QC/F-QC-15-A-G Line Clearance - Printing.xls", sheet), ("S:qc-originals-2026-10-13/F-QC-15-A-G Line Clearance Quality inspection-2 - Printing.xls", sheet)], ref=ref, note=f"F/QC/15's workbook holds the seven line clearance reports A to G, a sheet to each; this is the sheet \"{sheet}\". Three copies of the workbook are kept; the one matching the owner's PDF of this sheet best is taken.")
        for doc, sheet, ref in [
            ("qc-line-clearance-printing", "Printing", "Q:F-QC-15-A-G Line Clearance Printing Printing.pdf"),
            ("qc-line-clearance-punching", "Punching", "Q:F-QC-15-A-G Line Clearance Punching - Printing.pdf"),
            ("qc-line-clearance-qc-machine", "QC Machine inspection", "Q:F-QC-15-A-G Line Clearance Quality inspection - Printing.pdf"),
            ("qc-line-clearance-qc-manual", "QC Manual inspection (2)", "Q:F-QC-15-A-G Line Clearance Quality inspection-2 - Printing.pdf"),
            ("qc-line-clearance-slitting", "Slitting", "Q:Copy of F-QC-15-A-G Line Clearance for slitting- Printing.pdf"),
            ("qc-line-clearance-sleeve-gluing", "Shrink Sleeve Gluing", "Q:Copy of F-QC-15-A-G Line Clearance - Printing.pdf"),
            ("qc-line-clearance-sleeve-cutting", "Shrink Sleeve cutting", "Q:Copy of F-QC-15-A-G Line Clearance - Printing (2).pdf"),
        ]
    ],
    D("qc-obsolete-artwork", ["A:QC/F-QC-16 OBSOLETE ARTWORK & SHADE CARD RECORD (2).xls", "A:QC/F-QC-16 OBSOLETE ARTWORK & SHADE CARD RECORD.xls"], ref="Q:Copy of F-QC-16 OBSOLETE ARTWORK & SHADE CARD RECORD.pdf", note=TWO_VERSIONS + " The workbook's sheet matching that print is taken."),
    D("qc-ruler-verification", ["A:QC/Copy of F-QC-17-Updated Scale (Ruler) internal verification record - Copy.xlsx"], ref="Q:Copy of F-QC-17-Updated Scale (Ruler) internal verification record - Copy.pdf", note="The workbook keeps a sheet to each scale and verification; the sheet matching the owner's PDF (the 600 mm scale) is taken."),
    D("qc-ruler-verification-300", ["A:QC/Copy of F-QC-17-Updated Scale (Ruler) internal verification record - Copy.xlsx"], ref="S:Copy of F-QC-17-Updated Scale (Ruler) internal verification record-300.pdf", note="The 300 mm scale was supplied only as a PDF of the same F/QC/17 page; the company's F/QC/17 workbook's sheet matching that PDF best is taken (the scale's own boxes come from DCRS)."),
    D("qc-offset-ink", ["A:QC/F-QC-18_Inspection record for Offset Ink.doc"]),
    D("qc-duplex-board", ["A:QC/F-QC-19_Inspection record for Duplex board.doc"], note="F/QC/19 is also the number of the Nivea tolerance card; this is the duplex board inspection record, by its content."),
    D("qc-tolerance-card-nivea", ["A:QC/F-QC-19_ Tolerance card for Nivea.docx"], note="F/QC/19 is also the number of the duplex board record; this is the tolerance card, by its content."),
    D("qc-kraft-paper", ["A:QC/F-QC-20_Inspection record for Kraft Paper.doc"], note="F/QC/20 is also the number of the printing aids destruction record; this is the kraft paper inspection record, by its content."),
    D("qc-printing-aids-destruction", ["A:QC/F-QC-20.doc"], note="F/QC/20 is also the number of the kraft paper record; F-QC-20.doc is the printing aids destruction record, by its content."),
    D("qc-flexo-ink", ["A:QC/F-QC-21- Flexo INk.doc"], note="F/QC/21 is also the number of the lamination film adhesive record; this is the flexo ink record, by its content."),
    D("qc-lamination-adhesive-inspection", ["A:QC/F-QC-21_Inspection record for Lamination film adhesive.doc"], note="F/QC/21 is also the number of the flexo ink record; this is the lamination film adhesive record, by its content."),
    D("qc-side-pasting-adhesive", ["A:QC/F-QC-22_Inspection record for Side pasting adhesive.doc"]),
    D("qc-starch-powder", ["A:QC/F-QC-23_Inspection record for Corru. starch powder.doc"]),
    D("qc-sheet-pasting-powder", ["A:QC/F-QC-24_Inspection record for Corru.sheet pasting powder.doc"]),
    D("qc-analysis-report", ["A:QC/F-QC-29 _ Analysis report.doc", "A:QC/F-QC-29 Analysis report.doc"], ref="Q:F-QC-29 _ Analysis report.pdf", note="Two F/QC/29 files are kept (the analysis report and the utility test report); the one matching the owner's PDF of this one is taken."),
    D("qc-utility-test-report", ["A:QC/F-QC-29 Analysis report.doc", "A:QC/F-QC-29 _ Analysis report.doc"], ref="Q:F-QC-29 Analysis report.pdf", note="Two F/QC/29 files are kept (the analysis report and the utility test report); the one matching the owner's PDF of this one is taken."),
    D("qc-minutes-of-meetings", ["A:QC/F-QC-30 MOM.doc"], note="F-QC-30 MOM.doc is the minutes of meetings, by its content (the viscosity register numbered F-QC-30 was supplied only as a photograph)."),
    D("qc-incoming-lamination-film", ["S:F-QC-33_Inspection record for Incoming Lamination Film.doc"]),
    D("qc-inspection-sb-lamination", ["S:F-QC-36_Inspection record for SB Lamination Film.doc"]),
    D("soc-flexible-packaging", ["A:QC/F-QC-38_Statement of Compliance (SOC) - Flexible packaging Pouch & Film.docx"]),
    # ---- Production
    D("prd-sharp-object-issue", [("A:Prd/F-PRD-10_DAILY SCISSOR ISSUE & RETURN INTEGRITY MONITORING RECORD - LABEL & SLEEVE DEPARTMENT.xls", "F-SYS-20 (2)"), ("S:F-PRD-23_Manual cutter Daily Issue & Return monitoring record.xls", "F-SYS-20 (2)"), ("A:Prd/F-PRD-10_DAILY SCISSOR ISSUE & RETURN INTEGRITY MONITORING RECORD - LABEL & SLEEVE DEPARTMENT.xls", "F-SYS-20")], ref="S:F-PRD-10.pdf", note="F/PRD/10 is kept twice: Rev 00 (sheet \"F-SYS-20 (2)\", the page DCRS was built from) and the plant's newer Rev 01 of 01.01.2026 (sheet \"F-SYS-20\", DAILY SCISSOR ISSUE); the sheet matching the PDF DCRS was built from is taken."),
    D("prd-alc-production", ["S:F-PRD-18_SB LAMINATION Logbook -24.06.25.xls"]),
    D("prd-process-parameter", ["S:F-PRD-19_SOLVENT BASE LAMINATION - PROCESS PARAMETER RECORD.xlsx"]),
    D("prd-slitting-alc", ["S:F-PRD-20_SLITTING PRODUCTION LOGBOOK -24.06.25.xlsx"]),
    D("prd-pouching-line-clearance", ["S:F-PRD-21_Area Line clearance record - POUCHING.xlsx"]),
    D("prd-pouching-blade", ["S:F-PRD-22_Blade Change Record - All Pouching machine.xlsx"], note="The workbook sent with the PDF DCRS was built from (Rev 00); the plant's folder also holds a newer Rev 01 of 01.01.2026 (TIo2 COATED TRIMMING BLADE ...), not used."),
    D("prd-pouching-cutter-issue", [("S:F-PRD-23_Manual cutter Daily Issue & Return monitoring record.xls", "F-PRD-23")], note="The workbook's first sheet; its second is F/PRD/10's."),
    D("prd-slitting-blade", ["S:F-PRD-24_Razor Blade Change Record - Laminated FIlms Slittig machine.xlsx"], note="The workbook sent with the PDF DCRS was built from (Rev 00); the plant's folder also holds a newer Rev 01 of 01.01.2026, not used."),
    D("prd-doctoring-alc", ["S:F-PRD-26_Doctoring PRODUCTION LOGBOOK.xlsx"]),
    # ---- Maintenance
    D("mnt-equipment-list", ["S:Master List of Equipments-Flexo & Pouch.xlsx"], ref="S:Master List of Equipments-Flexo & Pouch-Flexo.pdf", note="The company's own workbook of the equipment list."),
    D("mnt-pm-record", ["S:DCM Sleeves Seaming Machine - F-MNT-02_PM schedule & record_GALLOPS.docx"], note="The only Word original of F/MNT/02 kept: the PM schedule and record as filled for one machine (DCM sleeve seaming, GALLOPS)."),
    D("mnt-yearly-pm-schedule", [("S:F-MNT-03_Yearly PM Schedule(R).xls", "Sheet1")]),
    D("mnt-new-equipment", ["S:F-MNT-08_New Equipment Installation & commissioning record.doc"]),
    D("mnt-glass-breakage", ["S:F-MNT-09_List of Glass articles & weekly Glass Breakage monitoring record Dt.17-01-2024 (1) (2).doc"]),
    D("mnt-wooden-articles", ["S:F-MNT-10_Weekly Wooden article condition monitoring record (1) (1) (1).doc"]),
    # ---- Purchase, Store, Dispatch
    D("pur-supplier-registration", ["A:3 Purchase/F-PUR-01_Supplier registration form.docx"]),
    D("pur-supplier-audit-report", ["A:3 Purchase/F-PUR-02_Supplier audit report.doc"]),
    D("pur-approved-suppliers", [("A:3 Purchase/F-PUR-03_List of Approved suppliers.xlsx", "Sheet1")], note="The workbook's first sheet is the format; the other two are a copy for another company and a list of vendors."),
    D("pur-supplier-performance", ["A:3 Purchase/F-PUR-05_RM & PM Supplier Performance Monitoring.xls"]),
    D("pur-service-provider-performance", ["A:3 Purchase/F-PUR-06_Service provider monitoring.xls"]),
    D("str-sharp-metal-objects", ["S:F-STR-02_Sharp metal objects issuance & replacement record.docx"]),
    D("disp-safe-transporter-agreement", ["A:9 Dispatch/F-DISP-01_Safe Transportation agreement (Finish product).doc"]),
    D("disp-container-stuffing", ["A:9 Dispatch/F-DISP-02_Container stuffing & Vehicle Inspection record.doc"]),
    D("disp-vehicle-cleaning", ["S:F-DISP-04_Vehicle cleaning Protocol & Record_01.11.2023.docx"]),
    # ---- System
    D("sys-document-list", [("S:F-SYS-01-Master List of Documents. (R-2025)..xlsx", "GPPL - Doc list")], note="The R-2025 workbook DCRS was built from; its list sheet."),
    D("sys-format-list", [("S:F-SYS-02-Master List of Formats. (R-2025)..xlsx", "GPPL - Formats list")], note="The R-2025 workbook DCRS was built from; its list sheet."),
    D("sys-document-change", ["A:1 Product safety team leader/F-SYS-03-Document change request & approval note.doc"]),
    D("sys-mrm-agenda", ["A:1 Product safety team leader/F-SYS-04-Management review meeting agenda & Record_R01_09.12.2020.doc"], note="The company's Word original of F/SYS/04 (agenda and record in one file)."),
    D("sys-mrm-record", ["A:1 Product safety team leader/F-SYS-04-Management review meeting agenda & Record_R01_09.12.2020.doc"], note="The company's Word original of F/SYS/04 (agenda and record in one file)."),
    D("sys-audit-schedule", ["A:1 Product safety team leader/F-SYS-05-Internal_Audit_Schedule.xlsx"]),
    D("sys-audit-plan", ["A:1 Product safety team leader/F-SYS-06-Internal Audit Plan.doc"]),
    D("sys-audit-risk", ["A:1 Product safety team leader/F-SYS-07-Internal Audit Risk assessment.xlsx"]),
    D("sys-audit-findings", ["A:1 Product safety team leader/F-SYS-08-Internal Audit Findings & observation Report.doc"]),
    D("sys-audit-nc", ["A:1 Product safety team leader/F-SYS-10-Internal audit NC report.DOC"]),
    D("sys-nc-car", ["A:1 Product safety team leader/F-SYS-11-Non Confirmance & Corrective Action Report.DOC"]),
    D("sys-hara-monthly", ["A:1 Product safety team leader/F-SYS-12-Monthly HARA Verification.doc"]),
    D("sys-mock-recall", ["A:1 Product safety team leader/F-SYS-13-Mock Product Withdrawal record.xlsx"]),
    # ---- Marketing
    D("mkt-feedback-analysis", ["S:F-MKT-02_Customer Feedback analysis - Labels-2026.xlsx"], note="The Labels workbook DCRS was built from (the Pouches and Sleeves workbooks are the same format)."),
    D("mkt-complaint-trend", [("S:F-MKT-04_Complaint trend analysis(R-2026).xls", "Summary - Labels")], note="The workbook keeps a summary sheet to each product and the Pareto charts; the Labels summary is taken."),
    # ---- Pest control documents supplied without a format number
    D("gap-inspection", ["S:GAP Analysis Report -Pest control Dec 2023.xlsx"]),
    D("capa-customer-complaint", ["S:Updated Checklist.doc"]),
    D("training-record", ["S:Training - Yrl (1).doc"]),
    D("chemical-master", ["S:Chemical Cahrt new.docx"]),
    *[D(doc, ["S:Service Report-April 2026.xls"], note="The contractor's service report workbook (April 2026); its first sheet.") for doc in ("service-report-rodent", "service-report-general", "service-report-fly")],
]

# Documents whose number matches an Office file that is NOT theirs, and the documents with no Office original at all:
# they keep the generic download, and say why (REQUIREMENTS section 119).
NOT_THEIRS = {
    "qc-viscosity": "F-QC-30 MOM.doc carries the same number but is the minutes of meetings (qc-minutes-of-meetings); the viscosity register was supplied only as a photograph.",
}

WORD_EXT = (".doc", ".docx")
EXCEL_EXT = (".xls", ".xlsx")


def resolve(spec):
    """'A:QC/x.doc' -> the owner's folder; 'S:x' -> source-documents; 'Q:x' -> his QC-Pdf's folder."""
    root, rel = spec.split(":", 1)
    base = {"A": AUDIT, "S": SRC, "Q": QC_PDFS}[root]
    return os.path.join(base, *rel.split("/"))


# ---------------------------------------------------------------------------------------------------------------------
# text, for choosing

def norm_tokens(text):
    return re.findall(r"[a-z0-9]+", (text or "").lower())


def similarity(a, b):
    """How alike two texts are, 0..1: the mean of the token-sequence ratio and the token-set overlap."""
    ta, tb = norm_tokens(a), norm_tokens(b)
    if not ta or not tb:
        return 0.0
    seq = difflib.SequenceMatcher(None, ta, tb, autojunk=False).ratio()
    sa, sb = set(ta), set(tb)
    jac = len(sa & sb) / max(1, len(sa | sb))
    return round((seq + jac) / 2, 4)


def pdf_text(path):
    import pdfplumber

    with pdfplumber.open(path) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


def sheet_texts(path):
    """Each sheet's text (name -> text), read without Office."""
    out = {}
    if path.lower().endswith(".xls"):
        import xlrd

        wb = xlrd.open_workbook(path)
        for sh in wb.sheets():
            parts = []
            for r in range(min(sh.nrows, 400)):
                for c in range(min(sh.ncols, 60)):
                    v = sh.cell_value(r, c)
                    if v not in ("", None):
                        parts.append(str(v))
            out[sh.name] = " ".join(parts)
    else:
        import openpyxl

        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            parts = []
            for row in ws.iter_rows(min_row=1, max_row=400, max_col=60, values_only=True):
                for v in row:
                    if v not in ("", None):
                        parts.append(str(v))
            out[ws.title] = " ".join(parts)
    return out


# ---------------------------------------------------------------------------------------------------------------------
# Office

def office_pids(image):
    try:
        out = subprocess.run(["tasklist", "/FI", f"IMAGENAME eq {image}", "/FO", "CSV", "/NH"], capture_output=True, text=True, timeout=30).stdout
    except Exception:
        return set()
    pids = set()
    for row in csv.reader(io.StringIO(out)):
        if len(row) >= 2 and row[0].lower() == image.lower():
            try:
                pids.add(int(row[1]))
            except ValueError:
                pass
    return pids


WD_PAPER_A4 = 7  # wdPaperA4
XL_PAPER_A4 = 9  # xlPaperA4
MIN_MARGIN = 18.0  # pt: no margin made narrower than this (a quarter inch, the owner's own narrowest)


def word_tables(doc):
    """Every table of the document's text and of its headers and footers (each story once), outermost first."""
    seen = set()
    stories = [doc.Content]
    for s in range(1, doc.Sections.Count + 1):
        sec = doc.Sections(s)
        for i in (1, 2, 3):  # primary, first page, even pages
            for hf in (sec.Headers(i), sec.Footers(i)):
                try:
                    if hf.Exists:
                        stories.append(hf.Range)
                except Exception:
                    pass
    for story in stories:
        for t in range(1, story.Tables.Count + 1):
            tbl = story.Tables(t)
            key = (story.StoryType, tbl.Range.Start)
            if key not in seen:
                seen.add(key)
                yield tbl


def table_reach(tbl):
    """How far a table reaches from its section's left margin (points): its widest row, after its indent or position."""
    rows = {}
    for c in tbl.Range.Cells:
        if c.NestingLevel == tbl.NestingLevel:
            rows[c.RowIndex] = rows.get(c.RowIndex, 0.0) + c.Width
    width = max(rows.values()) if rows else 0.0
    r = tbl.Rows
    if r.WrapAroundText and r.HorizontalPosition > -999990:  # a floating table at a measured place, not centred or aligned
        return width + max(0.0, r.HorizontalPosition), width
    if r.WrapAroundText or r.Alignment == 1:  # centred
        return width, width
    return width + max(0.0, r.LeftIndent), width


SAFE_EDGE = 14.0  # pt (about 5 mm): an office printer prints nothing within about 4 mm of the paper's edge


def pdf_edges(path):
    """The nearest ink (characters, rules, boxes, pictures) to the paper's left and right edges over all pages, in points."""
    import pdfplumber

    left = right = None
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages:
            W = float(pg.width)
            ink = [o for o in list(pg.chars) + list(pg.rects) + list(pg.lines) + list(pg.curves) + list(pg.images) if not (o.get("object_type") == "char" and not o.get("text", "").strip())]
            if not ink:
                continue
            lo, hi = min(o["x0"] for o in ink), W - max(o["x1"] for o in ink)
            left = lo if left is None else min(left, lo)
            right = hi if right is None else min(right, hi)
    return left, right


def word_a4(doc, scratch):
    """Every section of a Word file on A4, each keeping its orientation (the owner prints on A4, 22-Oct-2026), set by Word
    itself. His lines break where they broke on his paper: where A4 is narrower or shorter than it, each margin gives half the
    difference (never below MIN_MARGIN), so the text keeps the width and height he set. Where the ink then comes nearer the
    paper's edge than on his paper and nearer than SAFE_EDGE (a table that ran into his margin, F-02's header box, a centred
    table wider than the text), every table reaching past the margins has its own widths scaled by A4's width over his paper's,
    each cell, as Word's "scale content for A4" prints it: its ink as far from the edges as on his paper. Word's own PDF of the
    page (in `scratch`) is the measure. Returns what was done, in points."""
    out = []
    narrowed = []
    before = os.path.join(scratch, "a4-before.pdf")
    doc.ExportAsFixedFormat(before, 17)
    edges0 = pdf_edges(before)
    for i in range(1, doc.Sections.Count + 1):
        ps = doc.Sections(i).PageSetup
        orientation = ps.Orientation
        w0, h0 = ps.PageWidth, ps.PageHeight
        if ps.PaperSize == WD_PAPER_A4:
            out.append(f"section {i}: A4 already")
            continue
        ps.PaperSize = WD_PAPER_A4
        if ps.Orientation != orientation:
            ps.Orientation = orientation
        note = f"section {i}: {round(w0)}x{round(h0)} pt -> A4 {round(ps.PageWidth)}x{round(ps.PageHeight)} pt" + (" landscape" if orientation == 1 else "")
        dw, dh = (w0 - ps.PageWidth) / 2, (h0 - ps.PageHeight) / 2
        if dw > 0.5:
            if ps.LeftMargin - dw >= MIN_MARGIN and ps.RightMargin - dw >= MIN_MARGIN:
                ps.LeftMargin, ps.RightMargin = ps.LeftMargin - dw, ps.RightMargin - dw
                note += f"; left and right margins {dw:.1f} pt narrower (the text as wide as on his paper)"
            narrowed.append(ps.PageWidth / w0)
        if dh > 0.5 and ps.TopMargin - dh >= MIN_MARGIN and ps.BottomMargin - dh >= MIN_MARGIN:
            ps.TopMargin, ps.BottomMargin = ps.TopMargin - dh, ps.BottomMargin - dh
            note += f"; top and bottom margins {dh:.1f} pt narrower (the text as tall as on his paper)"
        out.append(note)
    if not narrowed:
        return out
    after = os.path.join(scratch, "a4-after.pdf")
    doc.ExportAsFixedFormat(after, 17)
    edges1 = pdf_edges(after)
    near0 = min(x for x in edges0 if x is not None) if any(x is not None for x in edges0) else None
    near1 = min(x for x in edges1 if x is not None) if any(x is not None for x in edges1) else None
    out.append(f"ink nearest the side edges: {near0:.1f} pt on his paper, {near1:.1f} pt on A4" if near0 is not None and near1 is not None else "no ink measured")
    if near0 is None or near1 is None or near1 >= min(SAFE_EDGE, near0) - 0.5:
        return out
    ratio = min(narrowed)
    for tbl in word_tables(doc):
        try:
            if tbl.PreferredWidthType == 2:  # wdPreferredWidthPercent: Word lays it out on the text's width, A4's
                continue
            ps = tbl.Range.Sections(1).PageSetup
            text = ps.PageWidth - ps.LeftMargin - ps.RightMargin
            reach, width = table_reach(tbl)
            if reach <= text + 2:
                continue
            cells = [c for c in tbl.Range.Cells]
            widths = [c.Width for c in cells]
            if not widths or any(not (0 < w < 1584) for w in widths):
                out.append(f"a table reaching {round(reach)} pt of {round(text)} pt left as it is: Word gives no width to some of its cells")
                continue
            done = []
            try:
                for c, w in zip(cells, widths):  # its nested tables too: each keeps its share of its cell
                    c.Width = w * ratio
                    done.append((c, w))
            except Exception:
                for c, w in done:  # never half a table scaled
                    c.Width = w
                raise
            if tbl.PreferredWidthType == 3 and 0 < tbl.PreferredWidth < 1584:  # a width in points (none: Word's 9999999)
                tbl.PreferredWidth = tbl.PreferredWidth * ratio
            out.append(f"a table {round(width)} pt wide (reaching {round(reach)} pt of the {round(text)} pt text) scaled to {round(width * ratio)} pt")
        except Exception as e:  # a table Word cannot measure is left as it is, and said
            out.append(f"a table not scaled: {type(e).__name__}: {e}")
    scaled = os.path.join(scratch, "a4-scaled.pdf")
    doc.ExportAsFixedFormat(scaled, 17)
    edges2 = pdf_edges(scaled)
    if any(x is not None for x in edges2):
        out.append(f"ink nearest the side edges after: {min(x for x in edges2 if x is not None):.1f} pt")
    return out


def excel_pages(ws):
    try:
        return ws.PageSetup.Pages.Count
    except Exception:
        return None


def fit_to_width(excel, ps):
    """Excel's own fit to the page's width: one page across, the length left to run."""
    excel.PrintCommunication = False
    try:
        ps.Zoom = False
        ps.FitToPagesWide = 1
        ps.FitToPagesTall = False
    finally:
        excel.PrintCommunication = True


def excel_a4(excel, ws):
    """The sheet on A4 (xlPaperA4), its orientation, scale and fit to page as the owner set them - unless his columns do not
    fit across the A4 page: then Excel fits the sheet to the page's width (one page across, the length left to run). They do
    not fit where, at his scale, the printed columns are wider than A4's width between his margins (F/PUR/03's approved
    suppliers and F/PRD/24's blade record put their last column on a page of its own, on his own A4 setting), or where A4,
    narrower than his paper, prints the sheet on more pages than his paper did (F/HR/20's survey) - kept only where the fit
    gives his number of pages."""
    ps = ws.PageSetup
    was = ps.PaperSize
    pages0 = excel_pages(ws)
    if was == XL_PAPER_A4:
        note = f"{ws.Name}: A4 already"
        pages = pages0
    else:
        excel.PrintCommunication = False
        try:
            ps.PaperSize = XL_PAPER_A4
        finally:
            excel.PrintCommunication = True
        pages = excel_pages(ws)
        note = f"{ws.Name}: paper {int(was)} -> {int(ws.PageSetup.PaperSize)}" + (" landscape" if ps.Orientation == 2 else "") + f"; {pages0} page(s) on his paper, {pages} on A4"
    zoom = ps.Zoom
    if zoom:  # a scale he set; a sheet he fitted to its pages fits them by itself
        area = ps.PrintArea
        width = (ws.Range(area) if area else ws.UsedRange).Width * zoom / 100.0
        printable = (841.9 if ps.Orientation == 2 else 595.3) - ps.LeftMargin - ps.RightMargin
        if width > printable + 1:
            fit_to_width(excel, ps)
            return [note + f"; his columns {width:.0f} pt wide at his {zoom} %, A4's width between his margins {printable:.0f} pt: fitted to the page's width ({excel_pages(ws)} page(s))"]
    if pages0 and pages and pages > pages0:
        zoom, wide, tall = ps.Zoom, ps.FitToPagesWide, ps.FitToPagesTall
        fit_to_width(excel, ps)
        fitted = excel_pages(ws)
        if fitted and fitted <= pages0:
            note += f"; fitted to the page's width: {fitted} page(s) (it was at {zoom} %)"
        else:
            excel.PrintCommunication = False
            try:
                ps.Zoom = zoom if zoom else False
                if not zoom:
                    ps.FitToPagesWide, ps.FitToPagesTall = wide, tall
            finally:
                excel.PrintCommunication = True
            note += f"; fitting to the page's width gives {fitted} page(s): left at his scale"
    return [note]


class Office:
    """Word and Excel, started hidden on first use; quit at the end. PIDs this script started are remembered."""

    def __init__(self):
        self.word = None
        self.excel = None
        self.started = {"WINWORD.EXE": set(), "EXCEL.EXE": set()}

    def _start(self, prog, image):
        import win32com.client as win32

        before = office_pids(image)
        app = win32.DispatchEx(prog)
        time.sleep(0.5)
        self.started[image] |= office_pids(image) - before
        return app

    def get_word(self):
        if self.word is None:
            self.word = self._start("Word.Application", "WINWORD.EXE")
            self.word.Visible = False
            self.word.DisplayAlerts = 0
        return self.word

    def get_excel(self):
        if self.excel is None:
            self.excel = self._start("Excel.Application", "EXCEL.EXE")
            self.excel.Visible = False
            self.excel.DisplayAlerts = False
            self.excel.ScreenUpdating = False
            self.excel.EnableEvents = False
        return self.excel

    def close(self):
        for app in (self.word, self.excel):
            if app is None:
                continue
            try:
                app.Quit()
            except Exception:
                pass
        self.word = self.excel = None
        time.sleep(1.5)
        for image, pids in self.started.items():
            alive = office_pids(image) & pids
            for pid in alive:
                subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True)

    def word_convert(self, src, out_docx, out_pdf):
        word = self.get_word()
        doc = word.Documents.Open(src, ConfirmConversions=False, ReadOnly=True, AddToRecentFiles=False, Visible=False)
        try:
            info = {}
            if out_docx:
                # The template prints on A4 (the owner, 22-Oct-2026: "mostly user take print on A4 size paper"), set by Word.
                info["pagesAsSupplied"] = doc.ComputeStatistics(2)  # wdStatisticPages
                info["paper"] = word_a4(doc, os.path.dirname(src))
                doc.SaveAs2(out_docx, FileFormat=16)  # wdFormatXMLDocument
            if out_pdf:
                doc.ExportAsFixedFormat(out_pdf, 17)  # wdExportFormatPDF
            info["pages"] = doc.ComputeStatistics(2)  # wdStatisticPages
        finally:
            doc.Close(0)
        return info

    def excel_convert(self, src, sheet, out_xlsx, out_pdf):
        excel = self.get_excel()
        wb = excel.Workbooks.Open(src, UpdateLinks=0, ReadOnly=True, AddToMru=False)
        try:
            names = [ws.Name for ws in wb.Sheets]
            keep = sheet if sheet in names else None
            if keep is None:
                # the first visible worksheet
                for ws in wb.Worksheets:
                    if ws.Visible == -1:
                        keep = ws.Name
                        break
                keep = keep or names[0]
            target = wb.Sheets(keep)
            target.Visible = -1
            # Only the document's own sheet stays (the other sheets are other documents or old copies).
            for name in names:
                if name != keep:
                    try:
                        wb.Sheets(name).Visible = -1
                        wb.Sheets(name).Delete()
                    except Exception:
                        pass
            target.Activate()
            info = {"sheet": keep, "sheets": names}
            if out_xlsx:
                # The sheet prints on A4 (the owner, 22-Oct-2026), set by Excel; its orientation and scale stay as he set them.
                info["pagesAsSupplied"] = excel_pages(target)
                info["paper"] = excel_a4(excel, target)
                wb.SaveAs(out_xlsx, FileFormat=51)  # xlOpenXMLWorkbook
            if out_pdf:
                wb.ExportAsFixedFormat(0, out_pdf)  # xlTypePDF
            info["pages"] = excel_pages(target)
        finally:
            wb.Close(False)
        return info


# ---------------------------------------------------------------------------------------------------------------------

def ts_string(s):
    return json.dumps(s, ensure_ascii=False)


def manifest_entry(e):
    """A picks.json entry as the manifest holds it: the original named from its folder (the owner's Audit document folder, or
    the repo's source-documents)."""
    return {
        "id": e["id"],
        "file": e["file"],
        "kind": e["kind"],
        "original": f"{e.get('originalRoot', 'source-documents')}/{e['original']}",
        "sheet": e.get("sheet") if e["kind"] == "xlsx" else None,
        "notes": e.get("notes", ""),
    }


def write_manifest(entries):
    lines = [
        "// GENERATED by scripts/originals/convert.py - do not edit by hand (run the script again).",
        "//",
        "// THE OWNER'S OWN FILES, ONE TO A DOCUMENT (REQUIREMENTS section 119). The owner, 20-Oct-2026: \"when user click on print",
        "// button or download the any particular document then it should download the same document which i have uploaded /",
        "// Supplied to you and this is applicable to all modules.\" Each document below downloads as its original, converted by Word or",
        "// Excel themselves (frontend/public/originals/<id>.docx|xlsx, fetched only when someone downloads) and filled with the record",
        "// by utils/originalFill. The original's own PDF export is source-documents/originals-pdf/<id>.pdf.",
        "",
        "export interface OriginalFile {",
        "  /** The template's path under the app's root (frontend/public). */",
        "  file: string;",
        "  kind: \"docx\" | \"xlsx\";",
        "  /** The owner's file it was made from. */",
        "  original: string;",
        "  /** A workbook's sheet that is this document (the only sheet kept in the template). */",
        "  sheet?: string;",
        "  /** Why this original, where there was a choice. */",
        "  notes?: string;",
        "}",
        "",
        "export const ORIGINAL_FILES: Record<string, OriginalFile> = {",
    ]
    for e in sorted(entries, key=lambda x: x["id"]):
        parts = [f"file: {ts_string(e['file'])}", f"kind: {ts_string(e['kind'])}", f"original: {ts_string(e['original'])}"]
        if e.get("sheet"):
            parts.append(f"sheet: {ts_string(e['sheet'])}")
        if e.get("notes"):
            parts.append(f"notes: {ts_string(e['notes'])}")
        lines.append(f"  {ts_string(e['id'])}: {{ {', '.join(parts)} }},")
    lines.append("};")
    lines.append("")
    lines.append("/** The template of a document, or undefined where it has none (its download is the generic one). */")
    lines.append("export function originalFileOf(documentId: string): OriginalFile | undefined {")
    lines.append("  return Object.prototype.hasOwnProperty.call(ORIGINAL_FILES, documentId) ? ORIGINAL_FILES[documentId] : undefined;")
    lines.append("}")
    lines.append("")
    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))


def main(argv):
    if "--manifest-only" in argv:
        ordered = json.load(open(REPORT, encoding="utf-8"))
        good = [e for e in ordered if not e.get("error") and os.path.exists(os.path.join(OUT_TEMPLATES, f"{e['id']}.{e['kind']}"))]
        write_manifest([manifest_entry(e) for e in good])
        print(f"{len(good)} templates; manifest {os.path.relpath(MANIFEST, REPO)}")
        return
    only = None
    if "--only" in argv:
        only = set(argv[argv.index("--only") + 1].split(","))
    dry = "--dry-run" in argv
    os.makedirs(OUT_TEMPLATES, exist_ok=True)
    os.makedirs(OUT_PDFS, exist_ok=True)
    previous = {}
    if os.path.exists(REPORT):
        try:
            previous = {e["id"]: e for e in json.load(open(REPORT, encoding="utf-8"))}
        except Exception:
            previous = {}
    work = tempfile.mkdtemp(prefix="dcrs-originals-")
    office = Office()
    results = dict(previous)
    try:
        for pick in PICKS:
            if only and pick["id"] not in only:
                continue
            doc_id = pick["id"]
            cands = [(c, None) if isinstance(c, str) else c for c in pick["candidates"]]
            cands = [(resolve(c), sheet or pick["sheet"]) for c, sheet in cands]
            missing = [c for c, _ in cands if not os.path.exists(c)]
            cands = [(c, s) for c, s in cands if os.path.exists(c)]
            if not cands:
                print(f"!! {doc_id}: no candidate exists ({missing})")
                continue
            ext0 = os.path.splitext(cands[0][0])[1].lower()
            kind = "docx" if ext0 in WORD_EXT else "xlsx"
            ref = resolve(pick["ref"]) if pick["ref"] else None
            ref_text = pdf_text(ref) if ref and os.path.exists(ref) else None
            scores = []
            chosen = cands[0]
            if ref_text is not None and kind == "xlsx":
                # Each candidate sheet against the PDF, read without Office (a workbook may hold sixty sheets).
                best = None
                for path, sheet in cands:
                    texts = sheet_texts(path)
                    for name, text in texts.items():
                        if sheet and name != sheet:
                            continue
                        s = similarity(text, ref_text)
                        scores.append({"file": os.path.basename(path), "sheet": name, "score": s})
                        if best is None or s > best[0]:
                            best = (s, path, name)
                if best:
                    chosen = (best[1], best[2])
            elif ref_text is not None and len(cands) > 1 and kind == "docx":
                best = None
                for i, (path, sheet) in enumerate(cands):
                    tmp = os.path.join(work, f"cand-{doc_id}-{i}{os.path.splitext(path)[1].lower()}")
                    shutil.copyfile(path, tmp)
                    pdf = os.path.join(work, f"cand-{doc_id}-{i}.pdf")
                    if not dry:
                        office.word_convert(tmp, None, pdf)
                        s = similarity(pdf_text(pdf), ref_text)
                    else:
                        s = 0.0
                    scores.append({"file": os.path.basename(path), "score": s})
                    if best is None or s > best[0]:
                        best = (s, path, sheet)
                if best:
                    chosen = (best[1], best[2])
            src, sheet = chosen
            entry = {
                "id": doc_id,
                "kind": kind,
                "file": f"originals/{doc_id}.{kind}",
                "original": os.path.relpath(src, AUDIT if src.startswith(AUDIT) else SRC).replace("\\", "/"),
                "originalRoot": "Audit document" if src.startswith(AUDIT) else "source-documents",
                "sheet": sheet,
                "notes": pick["note"],
                "scores": scores,
            }
            print(f"{doc_id:36s} {kind} <- {entry['originalRoot']}/{entry['original']}" + (f" [{sheet}]" if sheet else "") + (f"  scores={[(x.get('file'), x.get('sheet'), x['score']) for x in sorted(scores, key=lambda y: -y['score'])[:3]]}" if scores else ""))
            if dry:
                results[doc_id] = entry
                continue
            tmp = os.path.join(work, f"{doc_id}{os.path.splitext(src)[1].lower()}")
            shutil.copyfile(src, tmp)
            out_file = os.path.join(OUT_TEMPLATES, f"{doc_id}.{kind}")
            out_pdf = os.path.join(OUT_PDFS, f"{doc_id}.pdf")
            for p in (out_file, out_pdf):
                if os.path.exists(p):
                    os.remove(p)
            try:
                if kind == "docx":
                    info = office.word_convert(tmp, out_file, out_pdf)
                    if doc_id in EXAMPLE_PICTURES:
                        blank_pictures(out_file, EXAMPLE_PICTURES[doc_id])
                else:
                    info = office.excel_convert(tmp, sheet, out_file, out_pdf)
                    entry["sheet"] = info["sheet"]
                entry.update({k: v for k, v in info.items() if k != "sheet"})
            except Exception as e:  # one document failing must not stop the run
                print(f"!! {doc_id}: {type(e).__name__}: {e}")
                entry["error"] = f"{type(e).__name__}: {e}"
                results[doc_id] = entry
                continue
            entry["bytes"] = os.path.getsize(out_file)
            # The original into source-documents, where it is not yet (any folder of it).
            name = os.path.basename(src)
            here = any(name in files for _, _, files in os.walk(SRC))
            if not here:
                shutil.copyfile(src, os.path.join(SRC, name))
                entry["copiedToSourceDocuments"] = name
            elif previous.get(doc_id, {}).get("copiedToSourceDocuments"):  # copied by an earlier run: still said
                entry["copiedToSourceDocuments"] = previous[doc_id]["copiedToSourceDocuments"]
            results[doc_id] = entry
    finally:
        office.close()
        shutil.rmtree(work, ignore_errors=True)
    ordered = [results[k] for k in sorted(results)]
    with open(REPORT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(ordered, f, ensure_ascii=False, indent=1)
    good = [e for e in ordered if not e.get("error") and os.path.exists(os.path.join(OUT_TEMPLATES, f"{e['id']}.{e['kind']}"))]
    if not dry:
        write_manifest([manifest_entry(e) for e in good])
    print(f"\n{len(good)} templates; manifest {os.path.relpath(MANIFEST, REPO)}; picks {os.path.relpath(REPORT, REPO)}")
    for k, why in NOT_THEIRS.items():
        print(f"   no template: {k}: {why}")


if __name__ == "__main__":
    main(sys.argv[1:])
