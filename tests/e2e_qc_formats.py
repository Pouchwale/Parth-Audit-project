"""Quality Control's formats, as the company supplied them.

Asked for on 18-Sep-2026 with the formats attached: "from now onwards i will
give you all documents which you have put in QC Module and make sure each and
every document will be editable and bot will perform task according to user
query". REQUIREMENTS s57. So this suite checks that:

  * the Quality Control module holds all forty-three documents, shelved in the
    department's seven sections;
  * every one of the thirty-two new formats, F/QC/15-B, F/QC/33 and F/QC/36, opens on a page of
    its own, headed by its own format number;
  * an incoming material inspection record prints its test parameters and
    specifications and takes the reading beside each - one observation on most,
    three samples on the corrugated box and the paper core - with the form's own
    four lot statuses;
  * a line clearance register takes a line per job change, with the area's own
    clearance checklist printed above it, and the two Gujarati clearance
    checklists print their processes and lines;
  * F/QC/15-B, the punching line clearance built on 30-Sep-2026 from the paper
    the plant saved with the others (REQUIREMENTS s85), prints its own title,
    checklist and machine box as the paper does, shows the paper beside it, and
    a record of it is started, filled with sample data by Mitra, submitted,
    printed and downloaded;
  * the master list of calibration instruments takes its sixteen columns;
  * the pages supplied filled in are on file, line for line: the thirteen
    obsolete artworks, the printing aids destroyed, the label and sleeve
    certificates of analysis, the PSL analysis, the nine Nivea utility tests and
    the Gangwal meeting's seven points;
  * the registers and reports as their papers (REQUIREMENTS s111): F/QC/20's
    title and foot, the utility test on the MINUTES OF MEETINGS format, nothing
    of DCRS's above the analysis report, F-QC-40.C's DATE and TEMP. + SIGN
    columns; F-QC-14's two sheets as the workbook, a Label record filled with
    sample data by Mitra as a real exercise and submitted;
  * a certificate, a report and the tolerance card download as Word, and a
    register as Excel;
  * QC Records at /qc lists every one of the department's formats as the
    department asks for it - "format number - name" - in its section, including
    the three of its log sheets the Lamination module keeps, and a row opens
    that format's own page (REQUIREMENTS s58);
  * the three formats the department issues in Gujarati read in English while
    English is chosen, line for line, while a record of one still holds the
    Gujarati the form was issued in (REQUIREMENTS s58);
  * opening a document opens Mitra beside it, docked, offering the task - one
    tap starts today's record and asks the first question - and it goes again
    when the document is left untouched (REQUIREMENTS s60);
  * every new format is found by its format number, and Mitra opens one by name;
  * what a person types on any of them is stored;
  * EXACTLY AS THE PAPER (REQUIREMENTS s111, 13-Oct-2026): the fourteen incoming
    material records with their header box two to a line read across and their
    footer in the paper's lines, F/QC/21 Flexo Ink's system line at the foot,
    F/QC/36's seven boxes and both signatures, the two certificates of analysis
    with every block in the paper's order and the TOLERANCE printed open, F/QC/25
    and the tolerance card headed as printed, nothing of DCRS's own on any of
    them; a BOPP lot filled with sample data reads as a real one. With
    QC_PAPER_SHOTS set to a folder, they are photographed there on screen and in
    print, to be laid beside the originals.

Every figure below is typed from the supplied PDFs, so this is a transcription
check as much as a behaviour one.

Network-independent, against the production build on :8842 (DCRS_BASE
overrides it).
"""
import json
import os
import re
import sys
import tempfile
import zipfile

from playwright.sync_api import sync_playwright

# The Gujarati clearance checklists put Gujarati in a failure detail, which a
# Windows console's default code page cannot encode.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8842").rstrip("/")
PASSWORD = "PlaywrightQA123"
FAILURES = []

QC_SECTIONS = [
    "In-Process & Inspection",
    "Incoming Material Inspection",
    "Line Clearance",
    "Calibration",
    "Certificates of Analysis",
    "Registers & Records",
    "Analysis & Meetings",
]

# id -> the format number the page must show
NEW_FORMATS = {
    "qc-bopp-film": "F/QC/01",
    "qc-corrugated-box": "F/QC/02",
    "qc-label-stock": "F/QC/03",
    "qc-paper-core": "F/QC/04",
    "qc-pvc-pet-film": "F/QC/05",
    "qc-offset-ink": "F/QC/18",
    "qc-duplex-board": "F/QC/19",
    "qc-kraft-paper": "F/QC/20",
    "qc-flexo-ink": "F/QC/21",
    "qc-lamination-adhesive-inspection": "F/QC/21",
    "qc-side-pasting-adhesive": "F/QC/22",
    "qc-starch-powder": "F/QC/23",
    "qc-sheet-pasting-powder": "F/QC/24",
    "qc-line-clearance-printing": "F/QC/15-A",
    # Built on 30-Sep-2026 from the paper saved with the others (s85).
    "qc-line-clearance-punching": "F/QC/15-B",
    "qc-line-clearance-qc-machine": "F/QC/15-C",
    "qc-line-clearance-qc-manual": "F/QC/15-D",
    "qc-line-clearance-slitting": "F/QC/15-E",
    "qc-line-clearance-sleeve-gluing": "F/QC/15-F",
    "qc-line-clearance-sleeve-cutting": "F/QC/15-G",
    "qc-line-clearance-materials": "TO BE CONFIRMED",
    "qc-line-clearance-quality": "TO BE CONFIRMED",
    "qc-calibration-master-list": "F/QC/08",
    "qc-coa-label": "F/QC/06",
    "qc-coa-sleeve": "F/QC/07",
    "qc-coa-corrugated": "F/QC/25",
    "qc-obsolete-artwork": "F/QC/16",
    "qc-printing-aids-destruction": "F/QC/20",
    "qc-camera-challenge-test": "QA/PRO/FL/CCT/01",
    "qc-tolerance-card-nivea": "F-QC-19",
    "qc-analysis-report": "F/QC/29",
    "qc-utility-test-report": "F/QC/29",
    "qc-minutes-of-meetings": "F/QC/30",
    # Supplied on 02-Oct-2026 (REQUIREMENTS s86).
    "qc-incoming-lamination-film": "F/QC/33",
    "qc-inspection-sb-lamination": "F/QC/36",
    # Supplied on 13-Oct-2026 (REQUIREMENTS s111): F-QC-14's Label and Sleeve sheets.
    "qc-test-reliability-label": "F-QC-14",
    "qc-test-reliability-sleeve": "F-QC-14",
}


# id -> format number for the formats that were already on file (s51/s57) and
# for Quality Control's three log sheets that the Lamination module keeps: with
# NEW_FORMATS above, this is everything QC Records must list (REQUIREMENTS s58).
OTHER_QC_FORMATS = {
    "qc-inprocess-printing": "F/QC/13",
    "qc-inspection-printed-film": "F/QC/34",
    "qc-inspection-slitting": "F/QC/35",
    "qc-inspection-pouching": "F/QC/37",
    "qc-weight-scale-calibration": "F/QC/12",
    "qc-gsm-plate-calibration": "F/QC/11",
    "qc-viscosity": "F-QC-30",
    "qc-adhesive-mixing": "F-QC-32",
    "qc-temperature": "F-QC-40.C",
    # QC's two Statements of Compliance, kept in the Compliance module and read
    # on their own page - F/QC numbers, so Quality Control's formats.
    "soc-labels": "F/QC-09",
    "soc-flexible-packaging": "F/QC-38",
}

# The camera challenge test is numbered as a QA procedure, and the overview
# prints that number exactly as the form does.
OVERVIEW_FORMATS = {**NEW_FORMATS, **OTHER_QC_FORMATS, "qc-camera-challenge-test": "F: QA/PRO/FL/CCT/01"}

QC_OVERVIEW_GROUPS = QC_SECTIONS + ["Lamination — Quality Control", "Quality — Compliance"]

# The three formats issued in Gujarati carry a Gujarati title; with English
# chosen they are listed, headed and filed under their English (s58).
GUJARATI_NAMES_IN_ENGLISH = {
    "qc-inprocess-printing": "In Process Quality Control (Printing)",
    "qc-line-clearance-materials": "Line Clearance — Materials",
    "qc-line-clearance-quality": "Line Clearance — Quality",
}

# ---- REQUIREMENTS s58 and s111: the three Gujarati QC papers print as issued in every language (the review of
# 13-Oct-2026: with English chosen they printed the English of i18n/documentTextEn.ts, which is not the paper). The
# English below is what they printed then, and must not print now; the Gujarati is the paper's.
GUJARATI = re.compile("[\u0a80-\u0aff]")

MATERIALS_IN_GUJARATI = [
    "પ્રોસેસઃ– નીચે લખેલા દરેક પોઈન્ટ", "આઈટમ નં.", "પ્રો.નં.", "મશીનનું નામઃ–", "તા.",
    "પ્રોસેસ", "મટીરીયલ્સ", "ઓપરેટર ની શહી", "Q.A એ ચેકીંગ", "Q.A ની શહી",
    "પ્રિન્ટીંગ", "રો–મટીરીયલ્સ સ્ટોક", "મેગ્નેટીક ડાઈ", "પંચીંગ", "ક્વોલીટી ચેકીંગ", "લેબલ સ્લીટીંગ", "સ્લીટ રોલ",
]
QUALITY_IN_GUJARATI = ["પ્રોસીઝરઃ– ઓપરેટર ખાતરી કરવી", "આઈટમ નં.", "પ્રોડકશન નં.", "પેરામિટર", "Q.A ચેકીંગ", "એપુવ થયેલ આર્ટવર્ક", "માસ્ટર – સ્પોટસ"]
FQC13_IN_GUJARATI = [
    "પ્રોસીઝરઃ– ઉત્પાદન ની પ્રક્રિયા દરમિયાન", "આઈટમ કોડ", "પ્રો. નંબર", "તારીખ", "મશીન", "ઓપરેટર", "QA પર્સન", "ઓર્ડર લેન્થ ઈન મીટર", "સેમ્પલ કોલીટી",
    "સ.નં", "પેરામીટર", "ટેસ્ટ ક્રાઈટ", "ગ્રેડ", "પાસ?",
    # The five boxes below the grid, which the paper prints in English.
    "Description of NC (If applicable):", "Sign Off Reason (If Applicable)", "Sign Off By: (If Applicable)", "REMARKS:", "QA Sign:",
]
GRADE_CHART_IN_GUJARATI = ["ગ્રેડ ક્રાઈટ", "A– બધાજ રજિસ્ટર સંપુર્ણ પણે બરાબર છે.", "F– ખુબજ વધારે ઉંડું પંચીંગ ભારે ગેરરીતી મળી."]

MATERIALS_IN_ENGLISH = [
    "Process:– For each point written below, a QUALIFIED Q.A person must check the first correct sheet.",
    "Item No.", "PO No.", "Machine name:–", "Date",
    "Process", "Materials", "Operator's sign", "Checked by Q.A", "Q.A's sign",
    "Printing", "Raw materials stock", "Mounted plate", "Special ink", "Special varnish", "Magnetic die", "Printed rolls",
    "Punching", "Die-cut rolls", "Bakelite die",
    "Quality checking", "Rolls checked in QC", "Rolls taken off the machine",
    "Label slitting", "Packing table", "Slit rolls",
]

QUALITY_IN_ENGLISH = [
    "Procedure:– The operator must make sure that all the items listed below have been removed from the production area.",
    "Item No.", "Production No.", "Parameter", "Q.A checking",
    "Job specs", "Shade", "Text", "Image", "Varnish / Lamination", "Approved artwork",
    "Dimension", "Gap", "Reduce corner", "Depth",
    "Master – Registration", "Master – Shade", "Master – Spots",
    "Packing table", "Slit rolls",
]

# F/QC/13 as the owner's original of 13-Oct-2026, "F-QC-13 IPQC format (2).jpg" (REQUIREMENTS s111): the
# procedure, the grade criteria printed in full, the eight boxes, the paper's own Sr. No. and its five columns,
# and the five boxes below the grid, which the paper prints in English.
FQC13_IN_ENGLISH = [
    "Procedure:– During the production process the Q.A. person shall ensure that samples of 3 full sheets of the job are taken every 6000 meters.",
    "Item Code", "PO Number", "Date", "Machine", "Operator", "QA Person", "Order Length in Meter", "Sample Quantity",
    "Sr. No.", "Parameter", "Test criteria", "Grade", "Pass?",
    "Registration", "Shade", "Coating", "Punching", "Print pressure", "Print deformities",
    "Description of NC (If applicable):", "Sign Off Reason (If Applicable)", "Sign Off By: (If Applicable)", "REMARKS:", "QA Sign:",
]

GRADE_CHART_IN_ENGLISH = [
    "Grade criteria",
    "A – All registers are perfectly in order. No print has been judged spoiled.",
    "F – Major and serious misregistration issues or overlap lines are clearly visible.",
    "F – Excessive deep punching, heavy misregistration found.",
]

BOPP_PARAMETERS = ["SIZE (mm)", "COLOUR", "THICKNESS OF FILM (µm)", "CORONA TREATMENT (Dynes)"]
LOT_STATUSES = ["ACCEPTED", "REJECT & SEND BACK TO SUPPLIER / SCRAP", "SEGREGATION", "ACCEPTED ON DEVIATION"]
CLEARANCE_HEADINGS = [
    "Completion Date", "Completion Time", "PO No. of previous Job", "Previous PO Customer name",
    "Line Clearance* (Done/Not Done)", "Verified by IPQC executive", "Starting Date", "Starting Time",
    "PO No. of New Job", "New PO Customer name", "Operator sign", "Verified by IPQC executive",
]

# F/QC/15-B as its paper prints it ("F-QC-15-A-G Line Clearance Punching -
# Printing.pdf"), the paper's own spacing included. The title is the header's,
# printed once (REQUIREMENTS s111), where a page's whitespace reads as one space.
PUNCHING_TITLE = "AREA LINE CLEARANCE REPORT - PUNCHING"
PUNCHING_CHECKLIST = (
    "(1) Die of Previous Job removed ? (2) Die of Current / New Job changed ? (3) Matrix Roll (Wastage) of previous job removed ? "
    "(4) Finished Punching Rolls of Previous Production order shifted to designated place ?"
)
# The paper's words before its printed rule: the box is the rule (the review of 13-Oct-2026).
PUNCHING_MACHINE_BOX = "PUNCHING MACHINE NAME : -"

# EXACTLY AS THE PAPER (REQUIREMENTS s111, the originals sent again on 13-Oct-2026): the fourteen incoming material
# inspection records, as source-documents/qc-originals-2026-10-13/ prints them.
INCOMING_RECORDS = {
    "qc-bopp-film": "F/QC/01",
    "qc-corrugated-box": "F/QC/02",
    "qc-label-stock": "F/QC/03",
    "qc-paper-core": "F/QC/04",
    "qc-pvc-pet-film": "F/QC/05",
    "qc-offset-ink": "F/QC/18",
    "qc-duplex-board": "F/QC/19",
    "qc-kraft-paper": "F/QC/20",
    "qc-flexo-ink": "F/QC/21 (Flexo Ink)",
    "qc-lamination-adhesive-inspection": "F/QC/21 (Lamination Film Adhesive)",
    "qc-side-pasting-adhesive": "F/QC/22",
    "qc-starch-powder": "F/QC/23",
    "qc-sheet-pasting-powder": "F/QC/24",
    "qc-incoming-lamination-film": "F/QC/33",
}
OBSERVATION_HEADINGS = ["TEST PARAMETERS", "SPECIFICATION", "OBSERVATION"]
SAMPLE_HEADINGS = ["TEST PARAMETERS", "SPECIFICATION", "SAMPLE – 1", "SAMPLE – 2", "SAMPLE - 3"]
# The footer's headings as the paper prints them: INSPECTED BY and APPROVED BY, with QA INSPECTOR and QA MANAGER
# printed under the signatures (s111 part 4; the boxes are still named "INSPECTED BY (QA INSPECTOR)" ...).
INCOMING_FOOTER = ["LOT STATUS", "REASON FOR DEVIATION / REJECTION / SEGREGATION", "INSPECTED BY", "APPROVED BY"]
# The paper's own marks on an open record as it prints (s111 part 4): the LOT STATUS line's four statuses across
# beside its label with the chosen one ringed and its choice box gone, QA INSPECTOR and QA MANAGER under the
# signatures, the lines numbered as printed, and no "*" of the screen's on any label.
PAPER_MARKS = """() => {
  const doc = document.querySelector('[data-print-doc]');
  const lot = doc.querySelector('[data-choices-across="lotStatus"]');
  const box = lot && lot.closest('.field');
  const label = box && box.querySelector(':scope > label');
  const select = box && box.querySelector('select');
  const words = lot ? Array.from(lot.querySelectorAll('.choice-across')) : [];
  const mid = (e) => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
  const below = (k) => {
    const s = doc.querySelector(`[data-printed-below="${k}"]`);
    const f = s && s.closest('.field');
    const i = f && f.querySelector('input');
    const l = f && f.querySelector(':scope > label');
    return s && i && l ? [l.innerText.trim(), s.textContent, s.getBoundingClientRect().top >= i.getBoundingClientRect().bottom - 1] : null;
  };
  return {
    words: words.map((w) => w.textContent),
    chosen: words.filter((w) => w.classList.contains('is-chosen')).map((w) => w.textContent),
    shown: !!lot && getComputedStyle(lot).display !== 'none',
    oneLine: words.length > 0 && words.every((w) => Math.abs(mid(w) - mid(words[0])) < 6),
    besideLabel: !!label && words.length > 0 && Math.abs(mid(words[0]) - mid(label)) < 12 && words[0].getBoundingClientRect().left > label.getBoundingClientRect().right - 1,
    selectShown: !!select && getComputedStyle(select).display !== 'none',
    inspector: below('inspectedBy'),
    manager: below('approvedBy'),
    srNo: Array.from(doc.querySelectorAll('td[data-sr-no]')).map((t) => t.textContent.trim()),
    stars: Array.from(doc.querySelectorAll('.field > label')).filter((l) => l.innerText.includes('*')).length,
  };
}"""
# A certificate's retest sentence with its date inside it, and Coating Done : beside its value, on one line each (s111 part 4).
ONE_LINE = """(selector) => {
  const f = document.querySelector(`[data-print-doc] ${selector}`);
  if (!f) return null;
  const parts = [f.querySelector(':scope > label'), f.querySelector('input'), f.querySelector('.field-sentence-after')].filter(Boolean);
  const r = parts.map((p) => p.getBoundingClientRect());
  const mid = (x) => (x.top + x.bottom) / 2;
  return { parts: parts.length, oneLine: r.every((x) => Math.abs(mid(x) - mid(r[0])) < 10), inOrder: r.every((x, i) => i === 0 || r[i - 1].right <= x.left + 1), value: (f.querySelector('input') || {}).value };
}"""
# The certificates' letterhead line, its own two spaces kept.
COA_LETTERHEAD_GSTIN = "GSTIN :  24AAACG7781P1Z1, IEC CODE : 0894007882, PAN : AAACG7781P"
# Words of DCRS's own that once stood above these grids (s111): none may stand on them now.
DCRS_WORDS = [
    "A grid reads down the page",
    "is the last box below the grid",
    "the PRINTING block's colours are the grid",
    "are printed on the form, 7 breaking",
    "this reproduces the card's panels",
    "Sample mounted",
]
PREVIEW = "[data-section='document-preview']"
# A table's rows as the page shows them: each cell's words, a box's label then what the box holds (s111).
TABLE_WORDS = """t => Array.from(t.rows).map((r) => Array.from(r.cells).map((c) => {
  const box = c.querySelector('input, select');
  const label = c.querySelector('label');
  const words = label ? label.textContent.trim() : (box ? '' : c.textContent.trim());
  return [words, box ? box.value : ''].filter(Boolean).join(' ');
}))"""
# The certificates' tables, as the supplied certificates of 04/01/2022 (label) and production order 33814 (sleeve) print them.
COA_TABLES = {
    "F-QC-06": [
        [["Specified Size", "Length(mm)", "Width(mm)"], ["Client's Specified Size", "70", "115"], ["Tested Size", "70", "115"]],
        [
            ["Material", "Face Material", "Adhesive", "Release Liner"],
            ["Required", "80 GSM /Microns", "27 GSM", "60 GSM"],
            ["Tested", "80 GSM/Microns", "26 GSM", "59 GSM"],
            ["Type Required", "Chromo", "HotMelt", "Glassine"],
            ["Observed", "Chromo", "Rubber Based (Hot Melt)", "Glassine Paper"],
        ],
        [
            ["Coating Done : Gloss UV", "Aqueous", "U.V", "Lamination", "Achieved Gloss", "Scuff Test"],
            ["Minimum Gloss Required at 60°", "35%", "72%", "75%", "84.00%", "2 lbs, 100 rounds Okay"],
        ],
    ],
    "F-QC-07": [
        [["Specified Size", "Cut Length(mm)", "Open Width(mm)"], ["Client's Specified Size", "152.40", "168.00"], ["Tested Size", "152", "168"]],
        [
            ["Material", "Thickness(Microns)", "Shrinkage Ratio (%)", "Type"],
            ["Required", "40", "50", "Centroiid Plastopack PVC Blown 40 mic 200 mm"],
            ["Tested", "40", "49", "PVC Blown"],
        ],
        [
            ["Coating Done : Matt UV", "Aqueous", "U.V", "Lamination", "Achieved Gloss", "Scuff Test"],
            ["Minimum Gloss Required at 60°", "35%", "72%", "75%", "50%", "2 lbs, 100 rounds Okay"],
        ],
    ],
}
COA_PRINTING = {
    "F-QC-06": [
        ["PRINTING"],
        ["No. of Colors", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
        ["Given By Client", "Cyan", "Magenta", "Yellow", "Black", "Blue", "P.151C", "", "", "", ""],
        ["Color Shade Verified", "OK", "OK", "OK", "OK", "OK", "OK", "", "", "", ""],
    ],
    "F-QC-07": [
        ["PRINTING"],
        ["No. of Colors", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
        ["Given By Client", "Cyan", "Magenta", "Yellow", "Black", "Gold", "", "", "", "", ""],
        ["Color Shade Verified", "OK", "OK", "OK", "OK", "OK", "", "", "", "", ""],
    ],
}
# Whether the box holding `label` stands in the right-hand column of its line, under the box `under`, and below `above`.
AT_THE_RIGHT = """([label, under, above]) => {
  const boxes = Array.from(document.querySelectorAll("[data-section='document-preview'] .field, [data-print-doc] .field"));
  const named = (w) => boxes.find((b) => (b.querySelector(':scope > label') || {}).textContent?.replace(/\\s*\\*$/, '').trim() === w);
  const box = named(label), top = named(under), before = named(above);
  if (!box || !top || !before) return false;
  const a = box.getBoundingClientRect(), b = top.getBoundingClientRect(), c = before.getBoundingClientRect();
  return Math.abs(a.left - b.left) < 2 && a.top > c.top + 4 && a.left > c.left + 40;
}"""
# F/QC/25: "Date:" alone at the right above the grid; OID :- and Job Code: side by side on the grid's top line, as the
# paper prints them (s111 part 4, answerAcross).
DATE_ALONE = """() => {
  const boxes = Array.from(document.querySelectorAll("[data-print-doc] .field"));
  const named = (w) => boxes.find((b) => (b.querySelector(':scope > label') || {}).textContent?.trim() === w);
  const date = named('Date:'), oid = named('OID :-'), job = named('Job Code:');
  if (!date || !oid || !job) return false;
  if (!oid.closest('th.grid-head-box') || !job.closest('th.grid-head-box') || date.closest('table.log-sheet')) return false;
  const d = date.getBoundingClientRect(), o = oid.getBoundingClientRect(), j = job.getBoundingClientRect();
  return d.left > o.left + 40 && d.top + 4 < o.top && Math.abs(o.top - j.top) < 2 && o.left + 40 < j.left;
}"""


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:600])


def settle_briefing(page):
    page.evaluate(
        """() => {
             const KEY = 'dcrs:v1:settings';
             const now = new Date();
             const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
             const s = JSON.parse(localStorage.getItem(KEY) || '{}');
             s.briefingShown = { date: today, slots: ['first', 'morning', 'evening'] };
             localStorage.setItem(KEY, JSON.stringify(s));
           }"""
    )


def dismiss(page):
    for _ in range(3):
        g = page.locator("button:has-text('Got it')")
        if g.count():
            g.first.click()
            page.wait_for_timeout(200)
    settle_briefing(page)


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def sign_in(page):
    """The trend suite's unscoped account (the server limits sign-ups per network)."""
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(500)
    if page.locator(".app-sidebar").count() == 0:
        page.fill("#login-email", "trend-qa@example.com")
        page.fill("#login-password", PASSWORD)
        page.click("button:has-text('Log In')")
        page.wait_for_timeout(1500)
        if page.locator(".app-sidebar").count() == 0:
            page.click("text=Sign up")
            page.wait_for_timeout(300)
            page.fill("#signup-name", "Trend QA")
            page.fill("#signup-email", "trend-qa@example.com")
            page.fill("#signup-password", PASSWORD)
            page.fill("#signup-confirm", PASSWORD)
            page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1200)
    dismiss(page)


def open_page(page, route, settle=1300):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def record(page, rid):
    return next((r for r in records(page) if r["id"] == rid), None)


def sheet_rows(page):
    # A blank line the paper leaves between its processes is no line of the record (gapBetweenRuns, s111).
    return page.locator("[data-section='document-preview'] table.log-sheet tbody tr:not([data-gap-line])")


def printed_text(page):
    """The preview's text as it is written, not as the CSS prints it: a column
    heading and the header row are printed in capitals, and inner_text() would
    return them that way."""
    return page.locator("[data-section='document-preview']").evaluate("e => e.textContent")


def cell_texts(page, index):
    """The printed (read-only) cells of one preview line."""
    return sheet_rows(page).nth(index).locator("td").evaluate_all("els => els.map((e) => e.textContent.trim())")


def start_record(page, doc_id):
    """Starts a record of an as-required format from its own page and lands on it."""
    open_page(page, f"#/document/{doc_id}")
    page.locator("[data-action='document-new-record']").first.click()
    page.wait_for_timeout(1400)
    close_assistant(page)
    return page.url.split("#/record/")[-1]


def fill_with_sample_data(page):
    """Asks Mitra for sample data on the open record (allowed in a Live record on the test server, s98)."""
    if page.locator("button:has-text('Ask Mitra')").count():
        page.click("button:has-text('Ask Mitra')")
    page.wait_for_timeout(400)
    mitra_box = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
    mitra_box.fill("fill it with sample data")
    mitra_box.press("Enter")
    page.wait_for_timeout(1800)
    close_assistant(page)


def shoot(page, name):
    """With QC_PAPER_SHOTS set to a folder, the open record photographed on screen and as it prints (s111)."""
    folder = os.environ.get("QC_PAPER_SHOTS")
    if not folder:
        return
    os.makedirs(folder, exist_ok=True)
    doc = page.locator("[data-print-doc]").first
    if doc.count():
        doc.screenshot(path=os.path.join(folder, f"{name}-screen.png"))
        page.evaluate("() => window.dispatchEvent(new Event('beforeprint'))")
        page.emulate_media(media="print")
        try:
            doc.screenshot(path=os.path.join(folder, f"{name}-print.png"))
        finally:
            page.emulate_media(media="screen")
            page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    sign_in(page)

    # ==================================================================
    # 1. The module holds all forty-three, in the department's seven sections
    # ==================================================================
    open_page(page, "#/library/quality-control-inspection-records")
    rows = page.locator(".doc-table tbody tr:not(.doc-section-row)")
    check("Quality Control - Inspection Records holds forty-three documents", rows.count() == 43, rows.count())
    sections = page.locator("tr.doc-section-row").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check("...shelved in the department's seven sections, in order", sections == QC_SECTIONS, sections)
    text = page.locator(".app-content").inner_text()
    check(
        "...naming the formats as the papers are headed",
        all(name in text for name in ["Inspection Record - BOPP Film", "Area Line Clearance Report - Printing", "Master List of Calibration Instruments",
                                      "Certificate of Analysis [COA] For Label", "Register of Obsolete Artwork", "Minutes of Meetings"]),
        text[:400],
    )

    # ==================================================================
    # 2. Every one of the thirty-two (and F/QC/15-B, F/QC/33, F/QC/36) opens on its own page, with its number
    # ==================================================================
    wrong = {}
    for doc_id, format_no in NEW_FORMATS.items():
        open_page(page, f"#/document/{doc_id}", settle=900)
        body = page.locator(".app-content").inner_text()
        if page.locator(f"[data-page='document-records'][data-document='{doc_id}']").count() != 1 or format_no not in body:
            wrong[doc_id] = body[:120]
    check("Each of the thirty-two new formats and F/QC/15-B opens on a page of its own, headed by its format number", not wrong, wrong)

    # ==================================================================
    # 3. An incoming material inspection record: F/QC/01 BOPP Film
    # ==================================================================
    open_page(page, "#/document/qc-bopp-film")
    check("The BOPP film record prints the form's four test parameters", sheet_rows(page).count() == 4, sheet_rows(page).count())
    printed = [cell_texts(page, i) for i in range(4)]
    check(
        "...each with the parameter and the specification the form prints",
        [row[1] for row in printed] == BOPP_PARAMETERS and printed[3][2] == "Both side Minimum 36 dynes",
        printed,
    )
    headings = page.locator("[data-section='document-preview'] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check("...and the form's own columns", headings == ["Sr. No.", "TEST PARAMETERS", "SPECIFICATION", "OBSERVATION"], headings)
    labels = page.locator("[data-section='document-preview'] .field label").all_inner_texts()
    check(
        "The header box asks for the supplier, product, GRN and report details and the date of inspection",
        all(any(want in l for l in labels) for want in ["Supplier Name", "Product Description", "GRN Qty.", "Report number", "SAP Batch number", "GRN number", "Date of Inspection"]),
        labels,
    )
    check(
        "The footer carries the lot status, the reason and the two signatures",
        all(any(want in l for l in labels) for want in ["LOT STATUS", "REASON FOR DEVIATION", "INSPECTED BY", "APPROVED BY"]),
        labels,
    )

    rid = start_record(page, "qc-bopp-film")
    observation = page.locator("table.log-sheet tbody tr").nth(1).locator("input, select").first
    observation.fill("Transparent")
    observation.blur()
    page.wait_for_timeout(900)
    status = page.locator(".field", has=page.locator("label:has-text('LOT STATUS')")).first.locator("select")
    options = status.locator("option").evaluate_all("els => els.map((e) => e.value).filter(Boolean)")
    check("A new BOPP inspection offers the form's own four lot statuses", options == LOT_STATUSES, options)
    status.select_option(LOT_STATUSES[0])
    page.wait_for_timeout(1000)
    stored = record(page, rid)
    check(
        "What is typed on it is stored - the observation and the lot status",
        bool(stored) and stored["data"]["rows"][1].get("observation") == "Transparent" and stored["data"]["header"].get("lotStatus") == LOT_STATUSES[0],
        stored["data"] if stored else None,
    )

    # ==================================================================
    # 4. Three samples where the form asks for three
    # ==================================================================
    open_page(page, "#/document/qc-corrugated-box")
    headings = page.locator("[data-section='document-preview'] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check(
        "The corrugated box record takes three samples per lot, as the form prints them",
        headings[-3:] == ["SAMPLE – 1", "SAMPLE – 2", "SAMPLE - 3"] and sheet_rows(page).count() == 4,
        headings,
    )
    open_page(page, "#/document/qc-paper-core")
    check("The paper core record prints its six parameters, also in three samples", sheet_rows(page).count() == 6, sheet_rows(page).count())

    open_page(page, "#/document/qc-offset-ink")
    drying = next((row for row in (cell_texts(page, i) for i in range(9)) if "DRYING TEST" in row[1]), [])
    check(
        "The offset ink record keeps both drying tests the form prints against the one parameter",
        "By Thumb Impression" in " ".join(drying) and "On Glass surface" in " ".join(drying),
        drying,
    )

    # ==================================================================
    # 5. Line clearance: a line per job change, with the area's own checklist
    # ==================================================================
    open_page(page, "#/document/qc-line-clearance-printing")
    headings = page.locator("[data-section='document-preview'] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    # No Sr. No. of the sheet's: the paper's grid opens with Completion Date (REQUIREMENTS s111).
    check("The printing line clearance takes the register's twelve columns, and no Sr. No.", headings == CLEARANCE_HEADINGS, headings)
    body = page.locator(".app-content").inner_text()
    check(
        "...under the clearance the area asks for, printed as the form has it",
        "Unprinted Rolls, Master Shade card, Nylo Plates" in body and "(5) Job change waste removed ? (7)" in body,
        body[:400],
    )
    rid = start_record(page, "qc-line-clearance-printing")
    first = page.locator("table.log-sheet tbody tr").first
    first.locator("input").nth(1).fill("11.00 AM")
    first.locator("input").nth(2).fill("36633")
    first.locator("input").nth(2).blur()
    page.wait_for_timeout(1000)
    stored = record(page, rid)
    check(
        "A line clearance line is written and stored",
        bool(stored) and stored["data"]["rows"][0].get("previousJobPoNo") == "36633",
        stored["data"]["rows"][0] if stored else None,
    )
    page.locator("button:has-text('Add Row')").first.click()
    page.wait_for_timeout(900)
    check("...and another line can be added, as a register must allow", page.locator("table.log-sheet tbody tr").count() >= 2, page.locator("table.log-sheet tbody tr").count())

    # ==================================================================
    # 5b. F/QC/15-B, the punching line clearance (REQUIREMENTS s85)
    # ==================================================================
    open_page(page, "#/document/qc-line-clearance-punching")
    headings = page.locator("[data-section='document-preview'] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check("The punching line clearance takes the register's twelve columns, and no Sr. No.", headings == CLEARANCE_HEADINGS, headings)
    written_out = printed_text(page)
    check(
        "...under its own title, once, and the four-point punching checklist, as the paper prints them",
        written_out.count(PUNCHING_TITLE) == 1 and PUNCHING_CHECKLIST in written_out and "Activity to make sure a production line & its processing area are completely cleared" in written_out,
        written_out[:600],
    )
    labels = page.locator("[data-section='document-preview'] .field label").all_inner_texts()
    check("...with the punching machine box the paper prints", any(PUNCHING_MACHINE_BOX in l for l in labels), labels)
    body = page.locator(".app-content").inner_text()
    check("...headed F/QC/15-B, Rev 00", "F/QC/15-B" in body and "PUNCHING" in body.upper(), body[:300])
    check(
        "...and says where its example lines come from: the paper's own, without its filler PO number and customer",
        "F-QC-15-A-G Line Clearance Punching - Printing.pdf" in written_out and "36633" not in written_out,
        written_out[-400:],
    )
    page.locator("[data-action='show-supplied-original']").first.click()
    page.wait_for_timeout(900)
    original = page.evaluate(
        """() => {
             const img = document.querySelector("[data-section='supplied-original'] img");
             return img ? { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0, alt: img.alt } : null;
           }"""
    )
    check(
        "The supplied page is shown beside it, unaltered",
        bool(original) and original["src"] == "/source/fqc15b-line-clearance-punching-p1.jpg" and original["loaded"] and "F/QC/15-B" in original["alt"],
        original,
    )

    rid = start_record(page, "qc-line-clearance-punching")
    check("A record of it is started from its own page", bool(rid) and bool(record(page, rid)), page.url)
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(400)
    composer = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
    composer.fill("fill it with sample data")
    composer.press("Enter")
    page.wait_for_timeout(2500)
    replies = page.locator(".chat-msg.bot")
    reply = replies.last.inner_text() if replies.count() else ""
    filled = record(page, rid)
    filled_rows = (filled or {}).get("data", {}).get("rows", [])
    check(
        "Mitra fills it with sample data when asked, and says it is sample data",
        "sample data" in reply.lower() and len(filled_rows) >= 1 and filled_rows[0].get("lineClearance") == "Done" and bool(filled_rows[0].get("operatorSign")),
        (reply[:200], filled_rows[:1]),
    )
    check(
        "...never writing the template's own PO number or customer onto the sheet",
        all(r.get("previousJobPoNo") != "36633" and r.get("previousPoCustomerName") != "xyz" for r in filled_rows),
        filled_rows,
    )
    close_assistant(page)
    page.locator("[data-action='submit']").first.click()
    page.wait_for_timeout(1600)
    submitted = record(page, rid)
    check(
        "...and it submits, for the IPQC executive's verification",
        submitted is not None and submitted["status"] in ("Submitted", "Pending Verification"),
        ((submitted or {}).get("status"), page.locator(".app-content").inner_text()[:300]),
    )

    page.evaluate("() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }")
    page.locator("button:has-text('Print Original-Style Record')").first.click()
    page.wait_for_timeout(300)
    page.emulate_media(media="print")
    try:
        seen = page.evaluate(
            """() => {
                 const shown = (el) => !!el && el.getClientRects().length > 0;
                 const doc = document.querySelector('[data-print-doc]');
                 return {
                   printed: window.__printed,
                   form: shown(doc),
                   lines: doc ? doc.querySelectorAll('table.log-sheet tbody tr').length : 0,
                   text: doc ? doc.textContent : '',
                   sidebar: shown(document.querySelector('.app-sidebar')),
                 };
               }"""
        )
    finally:
        page.emulate_media(media="screen")
        page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
    check(
        "Printing it prints the form, the lines Mitra wrote and the paper's own words",
        seen["printed"] == 1 and seen["form"] and seen["lines"] == len(filled_rows) and "F/QC/15-B" in seen["text"] and PUNCHING_CHECKLIST in seen["text"] and not seen["sidebar"],
        {k: (v[:300] if isinstance(v, str) else v) for k, v in seen.items()},
    )

    button = page.locator("[data-action='download-document']").first
    kind = button.get_attribute("data-format") if button.count() else None
    book = {}
    if kind:
        with page.expect_download() as dl:
            button.click()
        saved_to = os.path.join(tempfile.gettempdir(), "dcrs-fqc15b.xlsx")
        dl.value.save_as(saved_to)
        book["name"] = dl.value.suggested_filename
        with zipfile.ZipFile(saved_to) as z:
            book["sheet"] = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
    check(
        "...and it downloads as an Excel workbook, as the register it is, named for its format",
        kind == "xlsx" and book.get("name", "").startswith("F-QC-15-B") and book.get("name", "").endswith(".xlsx")
        and "Matrix Roll (Wastage)" in book.get("sheet", "") and "Completion Date" in book.get("sheet", ""),
        (kind, book.get("name"), book.get("sheet", "")[:300]),
    )

    # ==================================================================
    # 6. The two Gujarati clearance checklists
    # ==================================================================
    # English is chosen, and both print as issued all the same (REQUIREMENTS s111, the review of 13-Oct-2026, checked
    # line for line further down): each process once beside its lines, its two signatures once, a blank line between.
    open_page(page, "#/document/qc-line-clearance-materials")
    body = printed_text(page)
    check(
        "The Gujarati materials clearance prints its twelve lines, process by process",
        sheet_rows(page).count() == 12 and "પ્રિન્ટીંગ" in body and "મેગ્નેટીક ડાઈ" in body and "લેબલ સ્લીટીંગ" in body,
        (sheet_rows(page).count(), body[:200]),
    )
    merged = page.locator("[data-section='document-preview'] table.log-sheet td[data-merged]").evaluate_all("els => els.map((e) => e.getAttribute('data-merged'))")
    check(
        "...each process printed once beside its lines, and signed once by the operator and by QA, a blank line between processes",
        merged == ["6", "6", "6", "2", "2", "2", "2", "2", "2", "2", "2", "2"] and page.locator("[data-section='document-preview'] tr[data-gap-line]").count() == 3,
        (merged, page.locator("[data-section='document-preview'] tr[data-gap-line]").count()),
    )
    head = page.locator("[data-section='document-preview'] .doc-header").first.inner_text()
    check("...its header prints no format number of DCRS's: never TO BE CONFIRMED", "TO BE CONFIRMED" not in head, head)
    open_page(page, "#/document/qc-line-clearance-quality")
    body = printed_text(page)
    check(
        "The Gujarati quality clearance prints its fifteen lines",
        sheet_rows(page).count() == 15 and "એપુવ થયેલ આર્ટવર્ક" in body and "માસ્ટર – સ્પોટસ" in body,
        (sheet_rows(page).count(), body[:200]),
    )

    # ==================================================================
    # 7. The master list of calibration instruments
    # ==================================================================
    open_page(page, "#/document/qc-calibration-master-list")
    headings = page.locator("[data-section='document-preview'] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check(
        "The master list of calibration instruments takes the list's sixteen columns",
        len(headings) == 17 and headings[1] == "Name of Instrument" and headings[-1] == "Remarks",
        headings,
    )
    check("...with the note the list prints above it", "impact the process conformity" in page.locator(".app-content").inner_text())

    # ==================================================================
    # 8. The pages supplied filled in are on file
    # ==================================================================
    artwork = record(page, "qc-obsolete-artwork-2022-02")
    check(
        "The thirteen obsolete artworks of January and February 2022 are on file, Verified",
        bool(artwork) and artwork["status"] == "Verified" and len(artwork["data"]["rows"]) == 13,
        (artwork or {}).get("status"),
    )
    if artwork:
        rows13 = artwork["data"]["rows"]
        check(
            "...the first line Nivea's Soft 50ml Side label, FGLA11067, obsolete on 03.01.2022",
            rows13[0].get("customerName") == "Nivea India Pvt Ltd" and rows13[0].get("artworkNumber") == "FGLA11067" and rows13[0].get("dateOfObsolete") == "2022-01-03",
            rows13[0],
        )
        check(
            "...and the last Shreeji Agchem's Wiltez 250ml Label, FGLA7697, on 18.02.2022",
            rows13[12].get("artworkNumber") == "FGLA7697" and rows13[12].get("dateOfObsolete") == "2022-02-18",
            rows13[12],
        )
        check("...every one of them an artwork change", all(r.get("reasonObsolete") == "A/W Change" for r in rows13), [r.get("reasonObsolete") for r in rows13])

    destroyed = record(page, "qc-printing-aids-destruction-2022-06")
    check(
        "The printing aids destroyed on 01.06.2022 are on file: two Nivea back labels",
        bool(destroyed) and destroyed["data"]["rows"][0].get("actualQty") == "2" and "Nivea Nourshing Body milk lotion" in json.dumps(destroyed["data"]["rows"][0]),
        (destroyed or {}).get("data"),
    )

    coa = record(page, "qc-coa-label-2022-01")
    check(
        "The label certificate of analysis of 04.01.2022 is on file: Weener Empire, Dr. fixit 301, order 33858",
        bool(coa) and coa["data"]["header"].get("productionOrderNo") == "33858" and "Weener Empire" in json.dumps(coa["data"]["header"]),
        (coa or {}).get("data", {}).get("header"),
    )
    if coa:
        colours = [r for r in coa["data"]["rows"] if r.get("givenByClient")]
        check(
            "...with the six colours printed and every shade verified OK",
            len(colours) == 6 and [c.get("givenByClient") for c in colours] == ["Cyan", "Magenta", "Yellow", "Black", "Blue", "P.151C"] and all(c.get("colorShadeVerified") == "OK" for c in colours),
            colours,
        )

    sleeve = record(page, "qc-coa-sleeve-2022-01")
    check(
        "The sleeve certificate is on file: The Unjha Pharmacy, Narogi Churana, order 33814",
        bool(sleeve) and sleeve["data"]["header"].get("productionOrderNo") == "33814" and "Unjha" in json.dumps(sleeve["data"]["header"]),
        (sleeve or {}).get("data", {}).get("header"),
    )

    analysis = record(page, "qc-analysis-report-2022-01")
    check(
        "The PSL analysis of 07.01.2022 is on file: plain label, chromo face, glassine liner, acrylic adhesive",
        bool(analysis) and [r.get("observation") for r in analysis["data"]["rows"]][:4] == ["Plain Label", "Chromo Paper", "Glassine Paper", "Acrylic"],
        [r.get("observation") for r in (analysis or {}).get("data", {}).get("rows", [])],
    )
    utility = record(page, "qc-utility-test-report-2022-12")
    check(
        "The nine Nivea utility tests are on file, every one passed in the freezer, the desiccator and the oven",
        bool(utility) and len(utility["data"]["rows"]) == 9 and all(r.get("freeze") == "Pass" and r.get("desiccator") == "Pass" and r.get("oven") == "Pass" for r in utility["data"]["rows"]),
        (utility or {}).get("data", {}).get("rows"),
    )
    minutes = record(page, "qc-minutes-of-meetings-2022-06")
    check(
        "The Gangwal meeting of 07.06.2022 is on file with its seven points",
        bool(minutes) and len(minutes["data"]["rows"]) == 7 and "Gangwal" in json.dumps(minutes["data"]["header"]),
        (minutes or {}).get("data", {}).get("header"),
    )
    if minutes:
        check(
            "...the fifth point the shade variation on the beard wash label, in the plant's own words",
            "Shade variation issue in TBS deep cleansing beard wash-250ml Label" in json.dumps(minutes["data"]["rows"][4]),
            minutes["data"]["rows"][4],
        )


    # ==================================================================
    # 8b. The registers and reports as their papers, and F-QC-14 (REQUIREMENTS s111)
    # ==================================================================
    def heads(page):
        return page.locator("[data-section='document-preview'] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")

    # With QC_PAPER_SHOTS set, each paper's preview is photographed there, to be looked at beside its original.
    def shot(name):
        folder = os.environ.get("QC_PAPER_SHOTS")
        if folder:
            os.makedirs(folder, exist_ok=True)
            page.locator("[data-section='document-preview']").first.screenshot(path=os.path.join(folder, f"{name}.png"))

    open_page(page, "#/document/qc-printing-aids-destruction")
    shot("fqc20-destruction")
    body = printed_text(page)
    whole = page.locator(".app-content").evaluate("e => e.textContent")
    head = page.locator("[data-section='document-preview'] .doc-header").first.evaluate("e => e.textContent")
    check(
        "F/QC/20 is headed DESTRUCTION RECORD, PRINTING AIDS DESTRUCTION RECORD above its Date:, the issue and review dates with its format number",
        "DESTRUCTION RECORD" in whole.upper() and "PRINTING AIDS DESTRUCTION RECORD" in body and "Next Review date" in head and "31st December 2024" in head
        and "1st January 2022" in head and "The form's footer prints" not in whole,
        (head, body[:600]),
    )
    check(
        "...its Date: at the right of its line, as printed",
        page.locator("[data-section='document-preview'] [data-paper-column='3']").count() == 1,
        page.locator("[data-section='document-preview'] [data-paper-column]").count(),
    )
    open_page(page, "#/document/qc-utility-test-report")
    shot("fqc29-utility-test")
    whole = page.locator(".app-content").evaluate("e => e.textContent")
    check(
        "The Nivea utility test is headed MINUTES OF MEETINGS, the format it is printed on, with its own heading above the grid in the paper's spacing",
        "MINUTES OF MEETINGS" in whole.upper() and "NIVEA SAMPLES -  UTILITY TEST  REPORT" in whole and "for the MR to confirm" not in whole,
        whole[:600],
    )
    check("...Job Name under Description, as the paper heads it", "Description" in heads(page) and "Job Name" in heads(page), heads(page))
    check(
        "...and Observation (24Hrs.) over each of Freeze, Desiccator and Oven, a cell each",
        heads(page).count("Observation (24Hrs.)") == 3 and heads(page)[-3:] == ["Freeze", "Desiccator", "Oven"],
        heads(page),
    )
    open_page(page, "#/document/qc-analysis-report")
    shot("fqc29-analysis-report")
    whole = page.locator(".app-content").evaluate("e => e.textContent")
    check("The analysis report prints nothing of DCRS's above its grid", "The scan of the supplied page" not in whole and "eleven printed descriptions" not in whole, whole[:600])
    open_page(page, "#/document/qc-minutes-of-meetings")
    shot("fqc30-minutes")
    check("The minutes' grid is headed Key points Discussed:, as the paper", "Key points Discussed:" in heads(page), heads(page))
    open_page(page, "#/document/qc-temperature")
    shot("fqc40c-temperature")
    check(
        "F-QC-40.C: DATE and the six TEMP. + SIGN readings, and no Sign column of DCRS's",
        heads(page)[1:] == ["DATE", "08:30 HRS TEMP. + SIGN", "12:30 HRS TEMP. + SIGN", "16:30 HRS TEMP. + SIGN", "20:30 HRS TEMP. + SIGN", "12:30am HRS TEMP. + SIGN", "04:30 HRS TEMP. + SIGN"],
        heads(page),
    )

    open_page(page, "#/document/qc-test-reliability-label")
    shot("fqc14-label")
    whole = page.locator(".app-content").evaluate("e => e.textContent")
    check(
        "F-QC-14 Label opens headed INTERNAL TEST RELIABILITY RECORD and F-QC-14",
        "INTERNAL TEST RELIABILITY RECORD" in whole.upper() and "F-QC-14" in whole,
        whole[:400],
    )
    # The workbook's eight small tables, two to a row (the review of 13-Oct-2026: it was one grid).
    panels = page.locator("[data-section='document-preview'] table.paper-panel")
    first_heads = panels.first.locator("thead th").evaluate_all("els => els.map((e) => e.textContent.trim())") if panels.count() else []
    check(
        "...the workbook's eight small tables, the first headed Paper Reel SAP batch no. and GSM - Total over the four inspectors, Kapila under Inspector - 1",
        panels.count() == 8 and first_heads[0] == "Paper Reel SAP batch no." and first_heads[1].startswith("GSM - Total") and first_heads[2].replace(" ", "") == "Inspector-1\n(Kapila)".replace(" ", ""),
        (panels.count(), first_heads),
    )
    first = cell_texts(page, 0)
    check(
        "...the workbook of 12.02.2022 on file: eight checks of three lines, 9460/5234/15 read 72, 71, 70, 71",
        sheet_rows(page).count() == 24 and first == ["9460/5234/15", "72", "71", "70", "71"],
        (sheet_rows(page).count(), first),
    )
    body = printed_text(page)
    check(
        "...each check concluded under its own table in the workbook's words, with no words of DCRS's",
        body.count("Conclusion") == 8 and "Variation are within specification limit, hence test reliability accepted" in body
        and "Conclusion (" not in body and "FG Code" not in body and "Paper Reel SAP batch no. / Roll no." not in body,
        body[-600:],
    )
    open_page(page, "#/document/qc-test-reliability-sleeve")
    shot("fqc14-sleeve")
    body = printed_text(page)
    check(
        "F-QC-14 Sleeve: five checks of three lines, the shrinkage ratio as written",
        sheet_rows(page).count() == 15 and "Shrinkage Ratio : TD 60 ± 2 %, MD 0 ~ 6%" in body and "TD-61 MD-3" in body,
        (sheet_rows(page).count(), body[:400]),
    )

    if os.environ.get("QC_PAPER_SHOTS"):
        # The rest of this group's papers, photographed only (their checks are above and in qcPaperFormatsMore.test.ts).
        for route, name in [
            ("qc-calibration-master-list", "fqc08-calibration-master-list"),
            ("qc-obsolete-artwork", "fqc16-obsolete-artwork"),
            ("qc-line-clearance-printing", "fqc15a-line-clearance-printing"),
            ("qc-line-clearance-punching", "fqc15b-line-clearance-punching"),
            ("qc-inprocess-printing", "fqc13-ipqc"),
            ("qc-line-clearance-materials", "fqc15-gujarati-materials"),
            ("qc-line-clearance-quality", "fqc15-gujarati-quality"),
        ]:
            open_page(page, f"#/document/{route}")
            shot(name)

    rid = start_record(page, "qc-test-reliability-label")
    started = record(page, rid) or {}
    started_rows = started.get("data", {}).get("rows", [])
    check(
        "A new F-QC-14 Label record holds the twenty-four printed lines and nothing written in them",
        len(started_rows) == 24 and all(not r.get("reading1") and not r.get("sampleNo") for r in started_rows),
        started_rows[:2],
    )
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(400)
    composer = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
    composer.fill("fill it with sample data")
    composer.press("Enter")
    page.wait_for_timeout(2500)
    filled = record(page, rid) or {}
    header = filled.get("data", {}).get("header", {})
    filled_rows = filled.get("data", {}).get("rows", [])
    gsm = [r for r in filled_rows if str(r.get("parameter", "")).startswith("GSM - Total")]
    readings = [float(r.get(k)) for r in gsm for k in ("reading1", "reading2", "reading3", "reading4") if str(r.get(k, "")).strip()]
    check(
        "Mitra's sample data is a real exercise: four inspectors, the reel's rolls, every GSM - Total inside 70 ± 5%",
        bool(header.get("inspector1")) and len(gsm) == 3 and len(readings) == 12 and all(66.5 <= v <= 73.5 for v in readings)
        and not any(str(r.get("sampleNo", "")).startswith("9460/5234") for r in filled_rows),
        (header, gsm),
    )
    close_assistant(page)
    page.locator("[data-action='submit']").first.click()
    page.wait_for_timeout(1600)
    submitted = record(page, rid) or {}
    check("...and it is submitted", submitted.get("status") in ("Submitted", "Pending Verification"), submitted.get("status"))

    # ==================================================================
    # 9. A certificate is a document, a register is a spreadsheet
    # ==================================================================
    open_page(page, "#/document/qc-coa-label")
    check("The label certificate downloads as Word", page.locator("[data-action='download-document'][data-format='docx']").count() >= 1)
    open_page(page, "#/document/qc-minutes-of-meetings")
    check("...so do the minutes of a meeting", page.locator("[data-action='download-document'][data-format='docx']").count() >= 1)
    open_page(page, "#/document/qc-obsolete-artwork")
    check("A register downloads as Excel", page.locator("[data-action='download-document'][data-format='xlsx']").count() >= 1)

    # ==================================================================
    # 10. Found by format number, and opened by name
    # ==================================================================

    # ------------------------------------------------------------------ QC RECORDS, the module's own page (s58)
    open_page(page, "#/qc")
    groups = page.eval_on_selector_all("[data-qc-section]", "els => els.map((e) => e.dataset.qcSection)")
    check(
        "QC Records shows the department's seven sections, then the formats other modules keep",
        groups == QC_OVERVIEW_GROUPS,
        groups,
    )
    rows = page.eval_on_selector_all(
        "[data-qc-doc]",
        "els => els.map((e) => ({ id: e.dataset.qcDoc, text: e.querySelector('[data-qc-format]').textContent.trim(), sub: e.querySelector('.text-faint').textContent.trim() }))",
    )
    check(
        f"…and every one of Quality Control's {len(OVERVIEW_FORMATS)} formats, each in one row",
        len(rows) == len(OVERVIEW_FORMATS) and {r["id"] for r in rows} == set(OVERVIEW_FORMATS),
        (len(rows), sorted(set(OVERVIEW_FORMATS) - {r["id"] for r in rows}), sorted({r["id"] for r in rows} - set(OVERVIEW_FORMATS))),
    )
    docs_by_id = {d["id"]: d for d in page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:documents') || '[]')")}

    def expected_row(doc_id):
        fmt = OVERVIEW_FORMATS[doc_id]
        name = GUJARATI_NAMES_IN_ENGLISH.get(doc_id, docs_by_id[doc_id]["name"])
        # A format the paper carries no number for is listed by name alone, the
        # way the department access list does it (s57's TO BE CONFIRMED #3).
        return name if fmt.startswith("TO BE") else f"{fmt} - {name}"

    wrong = [(r["id"], r["text"]) for r in rows if r["text"] != expected_row(r["id"])]
    check("Every row reads “format number - name of that document”", not wrong, wrong[:4])
    unnumbered = [r for r in rows if OVERVIEW_FORMATS[r["id"]].startswith("TO BE")]
    check(
        "…and the two forms that print no format number say so instead of showing a placeholder",
        len(unnumbered) == 2 and all("no format number printed" in r["sub"] for r in unnumbered),
        [(r["text"], r["sub"]) for r in unnumbered],
    )
    guj_named = [r for r in rows if r["id"] in GUJARATI_NAMES_IN_ENGLISH]
    check(
        "…and a format issued in Gujarati is listed under its English name, English being chosen",
        len(guj_named) == 3 and not any(GUJARATI.search(r["text"]) for r in guj_named),
        [r["text"] for r in guj_named],
    )
    check(
        "The row says which department keeps the format — Quality Control's and Quality Assurance's are both here",
        any(r["sub"].startswith("Quality Control ·") for r in rows) and any(r["sub"].startswith("Quality Assurance ·") for r in rows),
        [r["sub"] for r in rows[:3]],
    )
    guj_rows = [r for r in rows if r["id"] in ("qc-inprocess-printing", "qc-line-clearance-materials", "qc-line-clearance-quality")]
    check(
        "The three Gujarati formats say so — printed as issued, never shown in English (s111)",
        len(guj_rows) == 3 and all("Gujarati form" in r["sub"] and "shown in English" not in r["sub"] for r in guj_rows),
        [r["sub"] for r in guj_rows],
    )
    page.locator("[data-qc-doc='qc-bopp-film']").click()
    page.wait_for_timeout(1300)
    check(
        "A row opens that format's own page",
        page.url.endswith("#/document/qc-bopp-film") and "F/QC/01" in page.locator(".app-content").inner_text(),
        page.url,
    )
    open_page(page, "#/qc")
    page.locator("[data-action='open-qc-library']").click()
    page.wait_for_timeout(1300)
    check(
        "…and “All Quality Control documents” opens the library on the module",
        page.url.endswith("#/library/quality-control-inspection-records"),
        page.url,
    )
    open_page(page, "#/dashboard")
    qc_link = page.locator(".app-sidebar a[href*='#/qc'], .app-sidebar [data-to='/qc']")
    if qc_link.count() == 0:
        qc_link = page.locator(".app-sidebar").get_by_text("QC Overview", exact=True)
    check("The sidebar reaches QC Records", qc_link.count() >= 1, page.locator(".app-sidebar").inner_text()[:400])


    # ------------------------------------------------------------------ THE GUJARATI QC PAPERS, AS ISSUED (s58, s111)
    # English is chosen, and the three QC papers the department issues in Gujarati print their own Gujarati all the
    # same (the review of 13-Oct-2026): the paper is the format. What printed before — their English, from
    # i18n/documentTextEn.ts — is not printed; Mitra and the guided questions still have it.
    open_page(page, "#/document/qc-line-clearance-materials")
    sheet = printed_text(page)
    missing = [w for w in MATERIALS_IN_GUJARATI if w not in sheet]
    english = [w for w in ["Operator's sign", "Raw materials stock", "Checked by Q.A", "LINE CLEARANCE"] if w in sheet]
    check(
        "The Gujarati line clearance checklist prints its own Gujarati with English chosen, line for line",
        not missing and not english,
        missing[:6] or english or sheet[:400],
    )

    open_page(page, "#/document/qc-line-clearance-quality")
    sheet = printed_text(page)
    missing = [w for w in QUALITY_IN_GUJARATI if w not in sheet]
    check(
        "The Gujarati quality checklist prints its own Gujarati, its fifteen parameters included",
        not missing and "Approved artwork" not in sheet and "QUALITY SIGN" not in sheet.upper(),
        missing[:6] or sheet[:400],
    )

    open_page(page, "#/document/qc-inprocess-printing")
    sheet = printed_text(page)
    missing = [w for w in FQC13_IN_GUJARATI if w not in sheet]
    check(
        "F/QC/13 prints its own Gujarati — its procedure, its boxes and its six graded parameters — and its five boxes in its English",
        not missing and "Test criteria" not in sheet,
        missing[:6] or sheet[:500],
    )
    # The grade criteria are printed on the page in full, as the paper prints them: open, with no button (s111).
    printed_chart = page.locator("[data-section='document-preview'] [data-reference-table='printed']")
    chart = printed_chart.first.evaluate("e => e.textContent") if printed_chart.count() else ""
    check(
        "…and the grade criteria printed with it in full, A to F, as issued, with no button to show them",
        printed_chart.count() == 1 and all(w in chart for w in GRADE_CHART_IN_GUJARATI)
        and page.locator("[data-section='document-preview'] button:has-text('Grade')").count() == 0,
        [w for w in GRADE_CHART_IN_GUJARATI if w not in chart][:4] or printed_chart.count(),
    )

    # The form prints as issued, and what the record HOLDS is the Gujarati the department issued.
    rid = start_record(page, "qc-line-clearance-materials")
    rec = record(page, rid)
    rows = (rec or {}).get("data", {}).get("rows", [])
    check(
        "A record of it still holds the form's own Gujarati, not the English it is read in",
        len(rows) == 12
        and rows[0].get("process") == "પ્રિન્ટીંગ"
        and rows[0].get("material") == "રો–મટીરીયલ્સ સ્ટોક"
        and rows[11].get("material") == "સ્લીટ રોલ",
        [{k: v for k, v in r.items() if k in ("process", "material")} for r in rows[:3]],
    )
    shown = page.locator("[data-print-doc]").evaluate("e => e.textContent")
    check(
        "…and the line on screen reads as the paper, પ્રિન્ટીંગ / રો–મટીરીયલ્સ સ્ટોક",
        "પ્રિન્ટીંગ" in shown and "રો–મટીરીયલ્સ સ્ટોક" in shown and "Raw materials stock" not in shown,
        shown[:300],
    )


    # ------------------------------------------------------------------ MITRA OPENS WITH THE DOCUMENT (s60)
    # Whenever a document is opened the assistant opens beside it, docked, and
    # offers the task; it goes again when the document is left untouched.
    page.goto(f"{BASE}/index.html#/dashboard")
    # A fresh sitting: Mitra comes forward once per document, and this suite has
    # already opened every format above.
    page.reload()
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    page.goto(f"{BASE}/index.html#/document/qc-pvc-pet-film")
    page.wait_for_timeout(1500)
    dock = page.evaluate(
        """() => {
             const d = document.querySelector('.assistant-dock');
             return {
               open: !!d && document.querySelectorAll("button[aria-label='Close assistant']").length === 1,
               pill: Array.from(document.querySelectorAll('button')).some((b) => b.textContent.includes('Ask Mitra')),
               docked: document.documentElement.classList.contains('assistant-docked'),
               right: d ? Math.round(window.innerWidth - d.getBoundingClientRect().right) : null,
               top: d ? Math.round(d.getBoundingClientRect().top) : null,
               room: getComputedStyle(document.querySelector('.app-main')).marginRight,
             };
           }"""
    )
    check(
        "Opening a document opens Mitra by itself, docked down the side with the page making room",
        dock["open"] and not dock["pill"] and dock["docked"] and dock["right"] == 0 and dock["top"] == 0 and dock["room"] == "380px",
        dock,
    )
    said = page.locator(".chat-log .chat-msg.bot").last.inner_text()
    chips = page.locator(".chat-log .chat-chip").all_inner_texts()
    check(
        "…and it names the document and offers to start today's record",
        "F/QC/05" in said and "PVC / PET Film" in said and "Start today's record and fill it with me" in chips,
        (said, chips),
    )
    page.locator(".chat-log .chat-chip", has_text="Start today's record and fill it with me").click()
    page.wait_for_timeout(2200)
    asked = page.locator(".chat-log .chat-msg.bot").last.inner_text()
    opened = record(page, page.url.split("#/record/")[-1]) if "#/record/" in page.url else None
    check(
        "One tap and it performs the task: today's record is started, opened, and the first question asked",
        bool(opened) and opened["documentId"] == "qc-pvc-pet-film" and asked.rstrip().endswith("?"),
        (page.url, asked),
    )
    page.locator(".chat-log .chat-chip", has_text="Stop for now").click()
    page.wait_for_timeout(400)
    close_assistant(page)

    # A record opened directly: Mitra says where it stands and offers the fill.
    rid = start_record(page, "qc-label-stock")
    page.goto(f"{BASE}/index.html#/dashboard")
    page.reload()  # a fresh sitting: starting it above already brought Mitra forward once
    page.wait_for_timeout(1500)
    dismiss(page)
    page.goto(f"{BASE}/index.html#/record/{rid}")
    page.wait_for_timeout(1500)
    chips = page.locator(".chat-log .chat-chip").all_inner_texts()
    check(
        "Opening a record opens Mitra with the fill on offer",
        page.locator(".assistant-dock").count() == 1 and any(c in chips for c in ("Fill it in with me", "Carry on filling it with me")) and "Fill it with sample data" in chips,
        chips,
    )
    page.goto(f"{BASE}/index.html#/dashboard")
    page.wait_for_timeout(900)
    check(
        "Left untouched, it goes with the document: the dashboard has the pill again",
        page.locator(".assistant-dock").count() == 0 and page.locator("button:has-text('Ask Mitra')").count() == 1,
    )
    page.goto(f"{BASE}/index.html#/record/{rid}")
    page.wait_for_timeout(1200)
    check("…and a record it has already come forward for is not interrupted a second time", page.locator(".assistant-dock").count() == 0)

    open_page(page, "#/search")
    box = page.locator(".app-content input").first

    def search_documents(query):
        box.fill(query)
        page.wait_for_timeout(1100)
        return page.locator(".app-content").inner_text()

    found = search_documents("F/QC/01")
    check("Searching F/QC/01 finds the BOPP film inspection record", "Inspection Record - BOPP Film" in found, found[:300])
    found = search_documents("F/QC/15-E")
    check("Searching F/QC/15-E finds the slitting line clearance", "Area Line Clearance Report - Slitting" in found, found[:300])
    found = search_documents("F/QC/15-B")
    check("Searching F/QC/15-B finds the punching line clearance", "Area Line Clearance Report - Punching" in found and "not in DCRS yet" not in found, found[:300])
    found = search_documents("F/QC/21")
    check(
        "Searching F/QC/21 finds both formats the company numbered F/QC/21",
        "Inspection Record – Flexo Ink" in found and "Inspection Record – Lamination Film Adhesive" in found,
        found[:400],
    )

    open_page(page, "#/assistant")
    page.fill("textarea.assistant-input", "open the register of obsolete artwork")
    page.click("[data-action='send']")
    page.wait_for_timeout(2500)
    # Asked for a format by name, Mitra opens it: its own page, or the record of
    # it that is on file (the register's supplied page is).
    opened = page.url.split("#/")[-1]
    landed = opened == "document/qc-obsolete-artwork" or (
        opened.startswith("record/") and (record(page, opened.split("record/")[-1]) or {}).get("documentId") == "qc-obsolete-artwork"
    )
    check("Mitra opens a new format asked for by name", landed, page.url)

    # Without a model (these suites have none) a request is read by Mitra's own
    # rules, which open a document named with a record word or by its number.
    for asked in ("open the punching line clearance report", "open F/QC/15-B"):
        open_page(page, "#/assistant")
        page.fill("textarea.assistant-input", asked)
        page.click("[data-action='send']")
        page.wait_for_timeout(2500)
        opened = page.url.split("#/")[-1]
        landed = opened == "document/qc-line-clearance-punching" or (
            opened.startswith("record/") and (record(page, opened.split("record/")[-1]) or {}).get("documentId") == "qc-line-clearance-punching"
        )
        check(f"...and the punching line clearance, asked for as '{asked}'", landed, page.url)

    # ==================================================================
    # 11. Exactly as the paper (REQUIREMENTS s111): the incoming material records, F/QC/36,
    #     the certificates of analysis and the tolerance card, on screen and in print
    # ==================================================================
    for doc_id, fmt in INCOMING_RECORDS.items():
        open_page(page, f"#/document/{doc_id}", settle=900)
        heads = page.locator(f"{PREVIEW} table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
        columns = SAMPLE_HEADINGS if doc_id in ("qc-corrugated-box", "qc-paper-core") else OBSERVATION_HEADINGS
        labels = page.locator(f"{PREVIEW} .field > label").evaluate_all("els => els.map((e) => e.textContent.replace(/\\s*\\*$/, '').trim())")
        boxes = page.locator(f"{PREVIEW} [data-section='sheet-boxes'].sheet-boxes-paper").evaluate_all("els => els.map((e) => e.style.getPropertyValue('--paper-box-columns'))")
        written = printed_text(page)
        batch = "Batch number" if doc_id == "qc-flexo-ink" else "SAP Batch number"
        check(
            f"{fmt}: the paper's columns, its header box two to a line read across, its footer, and nothing of DCRS's (s111)",
            heads == ["Sr. No.", *columns]
            and labels == ["Supplier Name", "Report number", "Product Description", batch, "GRN Qty.", "GRN number", "Date of Inspection", *INCOMING_FOOTER]
            and boxes == ["2"]
            and not any(w in written for w in DCRS_WORDS),
            (heads, labels, boxes),
        )
        check(
            f"{fmt}: ...Date of Inspection in the right-hand column of the fourth line, under GRN number, as printed",
            page.evaluate(AT_THE_RIGHT, ["Date of Inspection", "Report number", "GRN Qty."]),
        )
    groups = page.locator(f"{PREVIEW} [data-section='printed-group'][data-area='footer']").evaluate_all(
        "els => els.map((g) => Array.from(g.querySelectorAll('.field > label')).map((l) => l.textContent.trim()))"
    )
    check(
        "...below the grid the LOT STATUS and the REASON a line each, then INSPECTED BY beside APPROVED BY",
        groups == [INCOMING_FOOTER[:2], INCOMING_FOOTER[2:]],
        groups,
    )
    open_page(page, "#/document/qc-flexo-ink", settle=900)
    foot = page.locator(f"{PREVIEW} [data-section='notes-at-foot']")
    check(
        "F/QC/21 Flexo Ink prints its system-generated line at the foot, under the signatures, not above the grid",
        foot.count() == 1 and "This is a system generated document with regulated access" in foot.inner_text()
        and page.locator(PREVIEW).evaluate("e => { const f = e.querySelector('[data-section=notes-at-foot]'); const s = Array.from(e.querySelectorAll('.field')).pop(); return !!f && !!s && !!(s.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING); }"),
    )

    # A new BOPP film inspection filled with sample data reads as a real lot: a supplier, a product, a GRN, a
    # reading on every line inside its specification, and the inspector and the QA Manager two people.
    rid = start_record(page, "qc-bopp-film")
    fill_with_sample_data(page)
    lot = (record(page, rid) or {}).get("data", {})
    head = lot.get("header", {})
    check(
        "A BOPP lot filled with sample data reads as a real one: supplier, product, GRN, batch, report, every line read, two signatures",
        all((head.get(k) or "").strip() for k in ("supplierName", "productDescription", "grnQty", "grnNumber", "batchNumber", "reportNumber", "inspectedBy", "approvedBy"))
        and head.get("inspectedBy") != head.get("approvedBy")
        and all((r.get("observation") or "").strip() for r in lot.get("rows", [])),
        head,
    )
    # The paper's own marks (s111 part 4), on the screen open for writing and as it prints.
    on_screen = page.evaluate(PAPER_MARKS)
    check(
        "F/QC/01 open for writing: LOT STATUS is still the choice box, the paper's four words wait for the print",
        on_screen["selectShown"] and not on_screen["shown"] and on_screen["srNo"] == ["1.", "2.", "3.", "4."],
        on_screen,
    )
    page.evaluate("() => window.dispatchEvent(new Event('beforeprint'))")
    page.emulate_media(media="print")
    try:
        marks = page.evaluate(PAPER_MARKS)
    finally:
        page.emulate_media(media="screen")
        page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
    check(
        "F/QC/01 prints LOT STATUS as the paper does: the four statuses across beside it, the chosen one ringed, no choice box",
        marks["shown"] and marks["words"] == LOT_STATUSES and marks["chosen"] == [head.get("lotStatus")] and marks["oneLine"] and marks["besideLabel"] and not marks["selectShown"],
        marks,
    )
    check(
        "...INSPECTED BY over QA INSPECTOR and APPROVED BY over QA MANAGER, the lines numbered 1. to 4., and no '*' of the screen's",
        marks["inspector"] == ["INSPECTED BY", "QA INSPECTOR", True] and marks["manager"] == ["APPROVED BY", "QA MANAGER", True]
        and marks["srNo"] == ["1.", "2.", "3.", "4."] and marks["stars"] == 0,
        marks,
    )
    shoot(page, "F-QC-01")
    # Signed off, the LOT STATUS line shows the paper's words on the screen too; Flexo Ink's first is "Accepted".
    open_page(page, "#/document/qc-flexo-ink", settle=900)
    flexo = page.locator(f"{PREVIEW} [data-choices-across='lotStatus'] .choice-across").evaluate_all("els => els.map((e) => e.textContent)")
    check("F/QC/21 Flexo Ink prints its own 'Accepted' first on the LOT STATUS line, and numbers its lines 1, 2 with no full stop",
          flexo[:1] == ["Accepted"] and page.locator(f"{PREVIEW} td[data-sr-no]").first.text_content().strip() == "1", flexo)

    # F/QC/36: the paper's seven boxes two to a line, and both signatures.
    open_page(page, "#/document/qc-inspection-sb-lamination", settle=900)
    labels = page.locator(f"{PREVIEW} .field > label").evaluate_all("els => els.map((e) => e.textContent.replace(/\\s*\\*$/, '').trim())")
    check(
        "F/QC/36: its header box two to a line as the paper's, and INSPECTED BY beside the APPROVED BY the paper prints",
        labels[:7] == ["JOB CODE (FG CODE)", "PO NUMBER", "Date / SHIFT", "Laminated Roll number", "1st SUBSTRATE DETAILS", "2nd  SUBSTRATE DETAILS", "1st Pass / 2nd Pass / 3rd Pass"]
        and labels[7:] == INCOMING_FOOTER
        and page.locator(f"{PREVIEW} [data-section='sheet-boxes'].sheet-boxes-paper").count() == 1,
        labels,
    )
    widths = page.evaluate(
        """() => ['JOB CODE (FG CODE)', '1st Pass / 2nd Pass / 3rd Pass'].map((w) => {
             const b = Array.from(document.querySelectorAll("[data-section='document-preview'] .field")).find((f) => (f.querySelector(':scope > label') || {}).textContent?.replace(/\\s*\\*$/, '').trim() === w);
             return b ? Math.round(b.getBoundingClientRect().width) : 0; })"""
    )
    check("...the pass alone on the header box's last line, the width of the sheet", widths[0] > 0 and widths[1] > 1.8 * widths[0], widths)

    # The two certificates on file: every block in the paper's order, the TOLERANCE printed open.
    for rid, name, film in (("qc-coa-label-2022-01", "F-QC-06", "LABEL STOCK"), ("qc-coa-sleeve-2022-01", "F-QC-07", "SLEEVE FILM")):
        open_page(page, f"#/record/{rid}")
        doc = page.locator("[data-print-doc]").first
        written = doc.evaluate("e => e.textContent")
        at = [written.find(w) for w in [COA_LETTERHEAD_GSTIN, "Production Order No.", film, "PRINTING", "Shade Match Grade", "COATING", "FINISHING", "TOLERANCE", "All Grades are given on a scale of 5", "This material should be retested on", "THIS IS A SYSTEM GENERATED DOCUMENT.", "Corporate Office :"]]
        check(f"{name}: every block where the certificate prints it, in its order (s111)", all(a >= 0 for a in at) and at == sorted(at), at)
        check(
            f"{name}: ...the TOLERANCE table printed open in its place, not behind Show; nothing of DCRS's",
            doc.locator("[data-section='printed-table'][data-table='TOLERANCE'] table").count() == 1
            and page.locator("button:has-text('Show TOLERANCE')").count() == 0
            and not any(w in written for w in DCRS_WORDS),
        )
        tables = doc.locator("table[data-section='box-table']").evaluate_all(f"els => els.map({TABLE_WORDS})")
        check(f"{name}: ...Specified Size, {film} and COATING drawn as the paper's tables, box for box (s111)", tables == COA_TABLES[name], tables)
        printing = doc.locator("table[data-across]").evaluate_all(f"els => els.map({TABLE_WORDS})")
        check(
            f"{name}: ...the colour table printed across under PRINTING, numbered 1 to 10 as printed, no Sr. No.",
            printing == [COA_PRINTING[name]] and doc.locator("table.log-sheet:not([data-across])").count() == 0 and "Sr. No." not in written,
            printing,
        )
        page.evaluate("() => window.dispatchEvent(new Event('beforeprint'))")
        page.emulate_media(media="print")
        try:
            shown = (
                doc.locator("[data-section='printed-table'] table").first.is_visible()
                and doc.locator("[data-section='notes-at-foot']").first.is_visible()
                and doc.locator("table[data-across]").first.is_visible()
                and doc.locator("table[data-section='box-table']").count() == 3
                and all(doc.locator("table[data-section='box-table']").nth(i).is_visible() for i in range(3))
            )
        finally:
            page.emulate_media(media="screen")
            page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
        check(f"{name}: ...and all of them print", shown)
        # Its headings in the paper's letters, the retest date inside its sentence, Coating Done : beside its value (s111 part 4).
        letters = [
            doc.locator("table[data-section='box-table'] th").first.inner_text().strip(),
            doc.locator("[data-section='printed-table'][data-table='TOLERANCE'] th").first.inner_text().strip(),
            doc.locator("table[data-across] th.log-sheet-across-head").first.inner_text().strip(),
        ]
        check(f"{name}: ...its headings in the paper's own letters (Specified Size, Field, No. of Colors), not the sheet's capitals", letters == ["Specified Size", "Field", "No. of Colors"], letters)
        retest = page.evaluate(ONE_LINE, ".field-in-sentence")
        corner = page.evaluate(ONE_LINE, "th.paper-box-table-corner > .field")
        check(
            f"{name}: ...'This material should be retested on' its date 'before usage.' on one line, and 'Coating Done :' beside its value",
            bool(retest) and retest["parts"] == 3 and retest["oneLine"] and retest["inOrder"] and bool(corner) and corner["parts"] == 2 and corner["oneLine"] and corner["inOrder"],
            (retest, corner),
        )
        shoot(page, name)

    # F/QC/25 and the tolerance card: the headings the paper prints, and none it does not.
    rid = start_record(page, "qc-coa-corrugated")
    fill_with_sample_data(page)
    heads = page.locator("[data-print-doc] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check("F/QC/25: Sr.No., nothing over the descriptions, then OID :- and Job Code: on the grid's top line", heads == ["Sr.No.", "", "OID :-", "Job Code:"], heads)
    seven = page.locator("[data-print-doc] table.log-sheet tbody tr[data-heading-line] th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check("...GSM over Specified  GSM and Tested GSM, BF and Grade of Paper headed on line 7, Material Specification", seven == ["GSM", "BF", "Grade of Paper", "Specified  GSM", "Tested GSM"], seven)
    across = page.locator("[data-print-doc] table.log-sheet tbody td[colspan='4']").count()
    check("...one answer across the four columns on each of the 13 lines not written in them", across == 13, across)
    check("...its Date: alone at the right above the grid, OID :- and Job Code: side by side on the grid's top line", page.evaluate(DATE_ALONE))
    # Its letterhead as the paper's three cells, Sr.No. in its own letters, its roles under the signatures (s111 part 4).
    letterhead = page.locator("[data-print-doc] [data-table='Letterhead'] td").evaluate_all("els => els.map((e) => e.innerText.split('\\n').map((l) => l.trim()).filter(Boolean))")
    written = page.locator("[data-print-doc]").first.evaluate("e => e.textContent")
    check(
        "F/QC/25: its letterhead the paper's three cells, each in its lines, with no dashes of DCRS's between them",
        letterhead == [
            ["GUJARAT PRINT PACK PUBLICATIONS PVT LTD", "308/9, GIDC DEDIASAN", "MEHSANA. GUJARAT."],
            ["DEPT:QUALITY", "ASSURENCE", "(2009 EDITION)"],
            ["DOC.NO.", "QA-IP-TRFCBA-011-00-01-09-18", "FG(CO) =FINISH GOODS", "(CORRUGATION)"],
        ]
        and "GUJARAT. — DEPT" not in written,
        letterhead,
    )
    corrugated = page.evaluate(
        """() => ({
             head: document.querySelector('[data-print-doc] table.log-sheet thead th').innerText.trim(),
             testing: Array.from(document.querySelectorAll('[data-print-doc] [data-printed-below]')).map((s) => [s.closest('.field').querySelector(':scope > label').innerText.trim(), s.textContent]),
           })"""
    )
    check("...Sr.No. as the paper writes it, and '(QA Inspector)' under Testing By, '(QA Manager)' under Sign By",
          corrugated == {"head": "Sr.No.", "testing": [["Testing By", "(QA Inspector)"], ["Sign By", "(QA Manager)"]]}, corrugated)
    shoot(page, "F-QC-25")
    rid = start_record(page, "qc-tolerance-card-nivea")
    heads = page.locator("[data-print-doc] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    panels = page.locator("[data-print-doc] table.log-sheet tbody tr").count()
    check("The tolerance card: seven panels, each with its own APPROVED BY: and SIGN. :, no Sr. No.", heads == ["", "APPROVED BY:", "SIGN. :"] and panels == 7, (heads, panels))
    shoot(page, "F-QC-19-tolerance-card")

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nQuality Control's supplied formats are all on file and editable.")
