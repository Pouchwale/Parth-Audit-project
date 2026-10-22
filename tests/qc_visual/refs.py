"""The QC reference papers and the DCRS documents they stand for - the kit's single source of truth.

The owner's folder (C:/Users/parth/Desktop/GP3 work/Audit document/QC/QC-Pdf's) holds 44 files. All of them are
byte-identical to files already in source-documents/, so the kit reads the repo copies (REPO column). make_map.py
writes docs/QC-VISUAL-MAP-2026-10-17.md from this table and from the catalogue (catalog.mjs).

role
  reference      a paper (PDF) the DCRS document is held against, page by page
  photo          a photographed paper (JPG): looked at, never measured - the score is -1; the kit also wraps it
                 into a one-page PDF (the owner: "convert them to PDFs if not already")
  not-reference  one of DCRS's own earlier prints that the owner marked with a pen - never a reference
"""

OWNER_FOLDER = "C:/Users/parth/Desktop/GP3 work/Audit document/QC/QC-Pdf's"
ORIG = "qc-originals-2026-10-13/"
PRINTS = "qc-dcrs-prints-2026-10-13/"
# Word's PDF of an original the owner sent only as Word or Excel (20-Oct-2026, the brief of QC print round 2): the reference
# where there is no PDF of the owner's own.
EXPORTS = "qc-office-exports-2026-10-20/"


def _r(file, repo, fmt, docs, role="reference", note=""):
    kind = "photo" if file.lower().endswith((".jpg", ".jpeg", ".png")) else "pdf"
    if role == "reference" and kind == "photo":
        role = "photo"
    return dict(file=file, repo=repo, fmt=fmt, docs=list(docs), kind=kind, role=role, note=note)


REFERENCES = [
    _r("F-QC-01_Inspection record for BOPP Film (2).pdf", ORIG + "F-QC-01_Inspection record for BOPP Film (2).pdf", "F/QC/01", ["qc-bopp-film"]),
    _r("F-QC-02_Inspection record for CORRUGATED BOX (2).pdf", ORIG + "F-QC-02_Inspection record for CORRUGATED BOX (2).pdf", "F/QC/02", ["qc-corrugated-box"]),
    _r("F-QC-03_Inspection record for Label stock (2).pdf", ORIG + "F-QC-03_Inspection record for Label stock (2).pdf", "F/QC/03", ["qc-label-stock"]),
    _r("F-QC-04_Inspection record for Paper core (2).pdf", ORIG + "F-QC-04_Inspection record for Paper core (2).pdf", "F/QC/04", ["qc-paper-core"]),
    _r("F-QC-05_Inspection record for PVC+PET Film (2).pdf", ORIG + "F-QC-05_Inspection record for PVC+PET Film (2).pdf", "F/QC/05", ["qc-pvc-pet-film"]),
    _r("F-QC-06_Certificate of analysis (COA)-Label (2).pdf", ORIG + "F-QC-06_Certificate of analysis (COA)-Label (2).pdf", "F/QC/06", ["qc-coa-label"]),
    _r("F-QC-07_Certificate of analysis (COA)-Sleeve.pdf", ORIG + "F-QC-07_Certificate of analysis (COA)-Sleeve.pdf", "F/QC/07", ["qc-coa-sleeve"]),
    _r("Copy of F-QC-08_Master list of Calibration instruments (2).pdf", ORIG + "Copy of F-QC-08_Master list of Calibration instruments (2).pdf", "F/QC/08", ["qc-calibration-master-list"]),
    _r("F-QC-10_Statement of Compliance (SOC) - Shrink Sleeve.pdf", ORIG + "F-QC-10_Statement of Compliance (SOC) - Shrink Sleeve.pdf", "F/QC-10", ["soc-shrink-sleeves"]),
    _r(
        "F-QC-10_Statement of Compliance (SOC) - Flexible packaging Pouch & Film.pdf",
        ORIG + "F-QC-10 file as sent 2026-10-14 - its pages are F-QC-38, not F-QC-10.pdf",
        "F/QC-38",
        ["soc-flexible-packaging"],
        note="sent under the name F-QC-10; its pages are the F/QC-38 statement",
    ),
    _r("F-QC-11 GSM cutting plate internal calibration record (2).pdf", ORIG + "F-QC-11 GSM cutting plate internal calibration record (2).pdf", "F/QC/11", ["qc-gsm-plate-calibration"]),
    _r("F-QC-12 Weighing balance internal calibration record (2).pdf", ORIG + "F-QC-12 Weighing balance internal calibration record (2).pdf", "F/QC/12", ["qc-weight-scale-calibration"]),
    _r("F-QC-13 IPQC format (2).jpg", ORIG + "F-QC-13 IPQC format (2).jpg", "F/QC/13", ["qc-inprocess-printing"], note="photograph; visual only"),
    _r(
        "F-QC-15 Line Clearance format (2).jpg",
        ORIG + "F-QC-15 Line Clearance format (2).jpg",
        "F/QC/15 (Gujarati)",
        ["qc-line-clearance-materials", "qc-line-clearance-quality"],
        note="photograph of the Gujarati form; both of its halves; visual only",
    ),
    _r("F-QC-15-A-G Line Clearance Printing Printing.pdf", ORIG + "F-QC-15-A-G Line Clearance Printing Printing.pdf", "F/QC/15-A", ["qc-line-clearance-printing"]),
    _r("F-QC-15-A-G Line Clearance Punching - Printing.pdf", ORIG + "F-QC-15-A-G Line Clearance Punching - Printing.pdf", "F/QC/15-B", ["qc-line-clearance-punching"], note="the same file also sits at the top of source-documents/"),
    _r("F-QC-15-A-G Line Clearance Quality inspection - Printing.pdf", ORIG + "F-QC-15-A-G Line Clearance Quality inspection - Printing.pdf", "F/QC/15-C", ["qc-line-clearance-qc-machine"]),
    _r("F-QC-15-A-G Line Clearance Quality inspection-2 - Printing.pdf", ORIG + "F-QC-15-A-G Line Clearance Quality inspection-2 - Printing.pdf", "F/QC/15-D", ["qc-line-clearance-qc-manual"]),
    _r("Copy of F-QC-15-A-G Line Clearance for slitting- Printing.pdf", ORIG + "Copy of F-QC-15-A-G Line Clearance for slitting- Printing.pdf", "F/QC/15-E", ["qc-line-clearance-slitting"]),
    _r("Copy of F-QC-15-A-G Line Clearance - Printing.pdf", ORIG + "Copy of F-QC-15-A-G Line Clearance - Printing.pdf", "F/QC/15-F", ["qc-line-clearance-sleeve-gluing"]),
    _r("Copy of F-QC-15-A-G Line Clearance - Printing (2).pdf", ORIG + "Copy of F-QC-15-A-G Line Clearance - Printing (2).pdf", "F/QC/15-G", ["qc-line-clearance-sleeve-cutting"]),
    _r("Copy of F-QC-16 OBSOLETE ARTWORK & SHADE CARD RECORD.pdf", ORIG + "Copy of F-QC-16 OBSOLETE ARTWORK & SHADE CARD RECORD.pdf", "F/QC/16", ["qc-obsolete-artwork"]),
    _r("Copy of F-QC-17-Updated Scale (Ruler) internal verification record - Copy.pdf", ORIG + "Copy of F-QC-17-Updated Scale (Ruler) internal verification record - Copy.pdf", "F/QC/17", ["qc-ruler-verification"]),
    # The 300 mm scale's page (the owner, 17-Oct-2026: "this PDF is for QC17 for 300mm"), in source-documents/ only.
    _r(
        "Copy of F-QC-17-Updated Scale (Ruler) internal verification record-300.pdf",
        "Copy of F-QC-17-Updated Scale (Ruler) internal verification record-300.pdf",
        "F/QC/17 (300 mm)",
        ["qc-ruler-verification-300"],
        note="the 300 mm scale's page, supplied 17-Oct-2026 (source-documents/, not in the owner's folder)",
    ),
    _r("F-QC-18_Inspection record for Offset Ink.pdf", ORIG + "F-QC-18_Inspection record for Offset Ink.pdf", "F/QC/18", ["qc-offset-ink"]),
    _r("F-QC-19_Inspection record for Duplex board.pdf", ORIG + "F-QC-19_Inspection record for Duplex board.pdf", "F/QC/19", ["qc-duplex-board"]),
    _r("F-QC-19_ Tolerance card for Nivea.pdf", ORIG + "F-QC-19_ Tolerance card for Nivea.pdf", "F-QC-19 (card)", ["qc-tolerance-card-nivea"]),
    _r("F-QC-20_Inspection record for Kraft Paper.pdf", ORIG + "F-QC-20_Inspection record for Kraft Paper.pdf", "F/QC/20", ["qc-kraft-paper"]),
    _r("F-QC-20.pdf", ORIG + "F-QC-20.pdf", "F/QC/20 (destruction)", ["qc-printing-aids-destruction"]),
    _r("F-QC-21- Flexo INk.pdf", ORIG + "F-QC-21- Flexo INk.pdf", "F/QC/21 (flexo ink)", ["qc-flexo-ink"]),
    _r("F-QC-21_Inspection record for Lamination film adhesive.pdf", ORIG + "F-QC-21_Inspection record for Lamination film adhesive.pdf", "F/QC/21 (adhesive)", ["qc-lamination-adhesive-inspection"]),
    _r("F-QC-22_Inspection record for Side pasting adhesive.pdf", ORIG + "F-QC-22_Inspection record for Side pasting adhesive.pdf", "F/QC/22", ["qc-side-pasting-adhesive"]),
    _r("F-QC-23_Inspection record for Corru. starch powder.pdf", ORIG + "F-QC-23_Inspection record for Corru. starch powder.pdf", "F/QC/23", ["qc-starch-powder"]),
    _r("F-QC-24_Inspection record for Corru.sheet pasting powder.pdf", ORIG + "F-QC-24_Inspection record for Corru.sheet pasting powder.pdf", "F/QC/24", ["qc-sheet-pasting-powder"]),
    _r("F-QC-25_COA Corrugated.pdf", ORIG + "F-QC-25_COA Corrugated.pdf", "F/QC/25", ["qc-coa-corrugated"]),
    _r("F-QC-29 _ Analysis report.pdf", ORIG + "F-QC-29 _ Analysis report.pdf", "F/QC/29 (analysis)", ["qc-analysis-report"]),
    _r("F-QC-29 Analysis report.pdf", ORIG + "F-QC-29 Analysis report.pdf", "F/QC/29 (utility test)", ["qc-utility-test-report"], note="a Nivea utility test written on the Minutes of Meetings format"),
    _r("F-QC-30 MOM.pdf", ORIG + "F-QC-30 MOM.pdf", "F/QC/30 (minutes)", ["qc-minutes-of-meetings"]),
    _r("F-QC-33_Inspection record for Incoming Lamination Film.pdf", ORIG + "F-QC-33_Inspection record for Incoming Lamination Film.pdf", "F/QC/33", ["qc-incoming-lamination-film"], note="the same file also sits at the top of source-documents/"),
    _r("F-QC-36_Inspection record for SB Lamination Film.pdf", ORIG + "F-QC-36_Inspection record for SB Lamination Film.pdf", "F/QC/36", ["qc-inspection-sb-lamination"], note="the same file also sits at the top of source-documents/"),
    _r("F-QC-40  -TEMPERATURE Monitoring-A.pdf", ORIG + "F-QC-40  -TEMPERATURE Monitoring-A.pdf", "F-QC-40.A", ["qc-temperature-humidity"]),
    _r("F-QC-40  -TEMPERATURE Monitoring-B.pdf", ORIG + "F-QC-40  -TEMPERATURE Monitoring-B.pdf", "F-QC-40.B", ["qc-temperature-sleeve"]),
    _r("F-QC-09_Statement of Compliance (SOC) - Label.docx", EXPORTS + "F-QC-09_Statement of Compliance (SOC) - Label.pdf", "F/QC-09", ["soc-labels"], note="no PDF was sent: Word's PDF of the owner's .docx, made on 20-Oct-2026"),
    # --- not references: DCRS's own earlier prints that the owner marked with a pen ---
    _r("F-QC-11 Monthly Internal Calibration Records - GSM Cutting Plate 2026-10-12.pdf", PRINTS + "F-QC-11 Monthly Internal Calibration Records - GSM Cutting Plate 2026-10-12.pdf", "F/QC/11", ["qc-gsm-plate-calibration"], role="not-reference", note="DCRS's print of 12-Oct, marked by the owner; the reference of F/QC/11 is its (2) paper"),
    _r("F-QC-12 Weekly Internal Calibration Records - Weight Scale 2026-10-12.pdf", PRINTS + "F-QC-12 Weekly Internal Calibration Records - Weight Scale 2026-10-12.pdf", "F/QC/12", ["qc-weight-scale-calibration"], role="not-reference", note="DCRS's print of 12-Oct, marked by the owner; the reference of F/QC/12 is its (2) paper"),
    _r("F-QC-32 Adhesive Mixing Ratio Record 2026-10-10.pdf", PRINTS + "F-QC-32 Adhesive Mixing Ratio Record 2026-10-10.pdf", "F-QC-32", ["qc-adhesive-mixing"], role="not-reference", note="DCRS's print of 10-Oct, marked by the owner; its paper is the photograph WhatsApp Image 2026-09-07 at 2.15.17 PM.jpeg"),
]

# F-QC-32's paper is a photograph that is in the repo but not in the owner's folder (docs/QC-CHECK-2026-10-14.md).
EXTRA_PHOTOS = [
    dict(
        file="WhatsApp Image 2026-09-07 at 2.15.17 PM.jpeg",
        repo="WhatsApp Image 2026-09-07 at 2.15.17 PM.jpeg",
        fmt="F-QC-32",
        docs=["qc-adhesive-mixing"],
        kind="photo",
        role="photo",
        note="the photographed register (not in the owner's folder; in source-documents/); visual only",
    )
]

# Where each DCRS QC document's layout is defined (frontend/src/data/seed/...). The statements are complianceStatements.ts.
LAYOUT_SOURCE = {
    "qc-viscosity": "logSheetLayouts.ts",
    "qc-adhesive-mixing": "logSheetLayouts.ts",
    "qc-temperature": "logSheetLayouts.ts",
    "qc-inspection-pouching": "logSheetLayouts.ts",
    "qc-inspection-sb-lamination": "logSheetLayouts.ts",
    "qc-inspection-slitting": "logSheetLayouts.ts",
    "qc-inspection-printed-film": "logSheetLayouts.ts",
    "qc-inprocess-printing": "qcInProcessLayouts.ts",
    "qc-weight-scale-calibration": "qcCalibrationLayouts.ts",
    "qc-gsm-plate-calibration": "qcCalibrationLayouts.ts",
    "qc-calibration-master-list": "qcRegisterLayouts.ts",
    "qc-camera-challenge-test": "qcRegisterLayouts.ts",
    "qc-obsolete-artwork": "qcRegisterLayouts.ts",
    "qc-printing-aids-destruction": "qcRegisterLayouts.ts",
    "qc-tolerance-card-nivea": "qcRegisterLayouts.ts",
    "qc-coa-label": "qcCoaLayouts.ts",
    "qc-coa-sleeve": "qcCoaLayouts.ts",
    "qc-coa-corrugated": "qcCoaLayouts.ts",
    "qc-line-clearance-printing": "qcLineClearanceLayouts.ts",
    "qc-line-clearance-punching": "qcLineClearanceLayouts.ts",
    "qc-line-clearance-qc-machine": "qcLineClearanceLayouts.ts",
    "qc-line-clearance-qc-manual": "qcLineClearanceLayouts.ts",
    "qc-line-clearance-slitting": "qcLineClearanceLayouts.ts",
    "qc-line-clearance-sleeve-gluing": "qcLineClearanceLayouts.ts",
    "qc-line-clearance-sleeve-cutting": "qcLineClearanceLayouts.ts",
    "qc-line-clearance-materials": "qcGujaratiLineClearanceLayouts.ts",
    "qc-line-clearance-quality": "qcGujaratiLineClearanceLayouts.ts",
    "qc-ruler-verification": "qcRulerVerificationLayouts.ts",
    "qc-temperature-humidity": "qcTemperatureLayouts.ts",
    "qc-temperature-sleeve": "qcTemperatureLayouts.ts",
    "qc-test-reliability-label": "qcTestReliabilityLayouts.ts",
    "qc-test-reliability-sleeve": "qcTestReliabilityLayouts.ts",
    "qc-analysis-report": "qcReportLayouts.ts",
    "qc-utility-test-report": "qcReportLayouts.ts",
    "qc-minutes-of-meetings": "qcReportLayouts.ts",
    "soc-labels": "complianceStatements.ts",
    "soc-flexible-packaging": "complianceStatements.ts",
    "soc-shrink-sleeves": "complianceStatements.ts",
}
for _id in (
    "qc-bopp-film qc-corrugated-box qc-label-stock qc-paper-core qc-pvc-pet-film qc-offset-ink qc-duplex-board qc-kraft-paper "
    "qc-flexo-ink qc-lamination-adhesive-inspection qc-side-pasting-adhesive qc-starch-powder qc-sheet-pasting-powder qc-incoming-lamination-film"
).split():
    LAYOUT_SOURCE[_id] = "qcIncomingLayouts.ts"

# The sub-renderer inside LogSheetRecordView that draws the grid, where it is not the plain log-sheet table.
GRID_RENDERER = {
    "qc-coa-label": "PaperTableSheet: the paper's own Word table, row by row (qcPaperTables.ts, s117 round 2)",
    "qc-coa-sleeve": "PaperTableSheet: the paper's own Word table, row by row (qcPaperTables.ts, s117 round 2)",
    "qc-coa-corrugated": "AnswerAcrossGrid (answerAcross) + the letterhead PrintedTable",
    "qc-test-reliability-label": "PanelGrid (panels)",
    "qc-test-reliability-sleeve": "PanelGrid (panels)",
    "qc-analysis-report": "log-sheet table + HeadingBox (asHeading) + SheetPhotos (photoBelowGrid)",
    "qc-inprocess-printing": "log-sheet table + PrintedTable (the grade criteria reference table)",
}

def _base_key(ref):
    stem = ref["file"].rsplit(".", 1)[0]
    safe = "".join(c if c.isalnum() else "_" for c in stem)
    while "__" in safe:
        safe = safe.replace("__", "_")
    return safe.strip("_")


def ref_key(ref):
    """The folder name of a reference's rendering: its file name made safe; two names that come to the same ("F-QC-29 Analysis report" and
    "F-QC-29 _ Analysis report") are told apart by a short hash of the exact name."""
    import hashlib

    base = _base_key(ref)
    clash = sum(1 for r in REFERENCES + EXTRA_PHOTOS if _base_key(r) == base) > 1
    return base + ("_" + hashlib.sha1(ref["file"].encode("utf-8")).hexdigest()[:5] if clash else "")


def all_references():
    return REFERENCES + EXTRA_PHOTOS


def reference_for_doc(doc_id):
    """The references a document is held against (role reference or photo), in the order of the table."""
    return [r for r in all_references() if doc_id in r["docs"] and r["role"] in ("reference", "photo")]
