"""Quality Control's formats, as the company supplied them.

Asked for on 18-Sep-2026 with the formats attached: "from now onwards i will
give you all documents which you have put in QC Module and make sure each and
every document will be editable and bot will perform task according to user
query". REQUIREMENTS s57. So this suite checks that:

  * the Quality Control module holds all thirty-eight documents, shelved in the
    department's seven sections;
  * every one of the thirty-two new formats opens on a page of its own, headed
    by its own format number;
  * an incoming material inspection record prints its test parameters and
    specifications and takes the reading beside each - one observation on most,
    three samples on the corrugated box and the paper core - with the form's own
    four lot statuses;
  * a line clearance register takes a line per job change, with the area's own
    clearance checklist printed above it, and the two Gujarati clearance
    checklists print their processes and lines;
  * the master list of calibration instruments takes its sixteen columns;
  * the pages supplied filled in are on file, line for line: the thirteen
    obsolete artworks, the printing aids destroyed, the label and sleeve
    certificates of analysis, the PSL analysis, the nine Nivea utility tests and
    the Gangwal meeting's seven points;
  * a certificate, a report and the tolerance card download as Word, and a
    register as Excel;
  * QC Records at /qc lists every one of the department's formats as the
    department asks for it - "format number - name" - in its section, including
    the three of its log sheets the Lamination module keeps, and a row opens
    that format's own page (REQUIREMENTS s58);
  * the three formats the department issues in Gujarati read in English while
    English is chosen, line for line, while a record of one still holds the
    Gujarati the form was issued in (REQUIREMENTS s58);
  * every new format is found by its format number, and Mitra opens one by name;
  * what a person types on any of them is stored.

Every figure below is typed from the supplied PDFs, so this is a transcription
check as much as a behaviour one.

Network-independent, against the production build on :8842.
"""
import json
import re
import sys

from playwright.sync_api import sync_playwright

# The Gujarati clearance checklists put Gujarati in a failure detail, which a
# Windows console's default code page cannot encode.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
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

# ---- REQUIREMENTS s58: the English the three Gujarati formats read in while
# English is chosen, typed from i18n/documentTextEn.ts (the plant's own words).
GUJARATI = re.compile("[\u0a80-\u0aff]")

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

FQC13_IN_ENGLISH = [
    "Procedure:- During the production process the Q.A. person shall ensure that samples of 3 full sheets of the job are taken every 6000 meters.",
    "Grading criteria: All grades must be given as per the criteria below.",
    "<11% of total ups = A",
    "Item Code", "PO Number", "Machine", "Operator", "QA Person", "Sample Qty, sheets", "Total Ups", "Order Length, m",
    "Parameter", "Test chart", "Grade", "Pass?", "Defect count",
    "Registration", "Shade", "Coating", "Punching", "Print pressure", "Print deformities",
    "M.C. description (if applicable)", "Reason for signing (override)", "Name of the person signing off", "Remarks", "QA Sign",
]

GRADE_CHART_IN_ENGLISH = [
    "Grade chart — A / B / C / F per parameter",
    "All registers are perfectly in order; no print has been spoiled.",
    "Major and serious misregistration issues or overlap lines are clearly visible.",
    "Excessive shallow punching / heavy misregistration found.",
]

BOPP_PARAMETERS = ["SIZE (mm)", "COLOUR", "THICKNESS OF FILM (µm)", "CORONA TREATMENT (Dynes)"]
LOT_STATUSES = ["ACCEPTED", "REJECT & SEND BACK TO SUPPLIER / SCRAP", "SEGREGATION", "ACCEPTED ON DEVIATION"]
CLEARANCE_HEADINGS = [
    "Completion Date", "Completion Time", "PO No. of previous Job", "Previous PO Customer name",
    "Line Clearance* (Done/Not Done)", "Verified by IPQC executive", "Starting Date", "Starting Time",
    "PO No. of New Job", "New PO Customer name", "Operator sign", "Verified by IPQC executive",
]


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
    return page.locator("[data-section='document-preview'] table.log-sheet tbody tr")


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


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    sign_in(page)

    # ==================================================================
    # 1. The module holds all thirty-eight, in the department's seven sections
    # ==================================================================
    open_page(page, "#/library/quality-control-inspection-records")
    rows = page.locator(".doc-table tbody tr:not(.doc-section-row)")
    check("Quality Control - Inspection Records holds thirty-eight documents", rows.count() == 38, rows.count())
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
    # 2. Every one of the thirty-two opens on its own page, with its number
    # ==================================================================
    wrong = {}
    for doc_id, format_no in NEW_FORMATS.items():
        open_page(page, f"#/document/{doc_id}", settle=900)
        body = page.locator(".app-content").inner_text()
        if page.locator(f"[data-page='document-records'][data-document='{doc_id}']").count() != 1 or format_no not in body:
            wrong[doc_id] = body[:120]
    check("Each of the thirty-two new formats opens on a page of its own, headed by its format number", not wrong, wrong)

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
    check("The printing line clearance takes the register's twelve columns", headings[1:] == CLEARANCE_HEADINGS, headings)
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
    # 6. The two Gujarati clearance checklists
    # ==================================================================
    # English is chosen, so both read in English (REQUIREMENTS s58, checked line
    # for line further down); what a record of one HOLDS is the form's own
    # Gujarati, also checked there.
    open_page(page, "#/document/qc-line-clearance-materials")
    body = printed_text(page)
    check(
        "The Gujarati materials clearance prints its twelve lines, process by process",
        sheet_rows(page).count() == 12 and "Printing" in body and "Magnetic die" in body and "Label slitting" in body,
        (sheet_rows(page).count(), body[:200]),
    )
    open_page(page, "#/document/qc-line-clearance-quality")
    body = printed_text(page)
    check(
        "The Gujarati quality clearance prints its fifteen lines",
        sheet_rows(page).count() == 15 and "Approved artwork" in body and "Master – Spots" in body,
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
        "The three Gujarati formats say so, and that they are being shown in English",
        len(guj_rows) == 3 and all("Gujarati form, shown in English" in r["sub"] for r in guj_rows),
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


    # ------------------------------------------------------------------ THE GUJARATI FORMATS, IN ENGLISH (s58)
    # English is chosen, so Google Translate is not loaded at all and the three
    # formats the department issues in Gujarati read from the English written
    # down in i18n/documentTextEn.ts - every printed line of them.
    open_page(page, "#/document/qc-line-clearance-materials")
    sheet = printed_text(page)
    missing = [w for w in MATERIALS_IN_ENGLISH if w not in sheet]
    check(
        "The Gujarati line clearance checklist reads in English, line for line",
        not missing,
        missing[:6] or sheet[:400],
    )
    check(
        "…with nothing of it left in Gujarati",
        not GUJARATI.search(sheet),
        (GUJARATI.findall(sheet)[:8], sheet[:300]),
    )

    open_page(page, "#/document/qc-line-clearance-quality")
    sheet = printed_text(page)
    missing = [w for w in QUALITY_IN_ENGLISH if w not in sheet]
    check(
        "The Gujarati quality checklist reads in English, its fifteen parameters included",
        not missing and not GUJARATI.search(sheet),
        missing[:6] or GUJARATI.findall(sheet)[:8] or sheet[:400],
    )

    open_page(page, "#/document/qc-inprocess-printing")
    sheet = printed_text(page)
    missing = [w for w in FQC13_IN_ENGLISH if w not in sheet]
    check(
        "F/QC/13 reads in English — its procedure, its boxes and its six graded parameters",
        not missing and not GUJARATI.search(sheet),
        missing[:6] or GUJARATI.findall(sheet)[:8] or sheet[:500],
    )
    grade_chart = page.locator("[data-section='document-preview'] button:has-text('Grade chart')")
    if grade_chart.count():
        grade_chart.first.click()
        page.wait_for_timeout(500)
        chart = printed_text(page)
        check(
            "…and the grade chart printed with it, A to F, in English",
            all(w in chart for w in GRADE_CHART_IN_ENGLISH) and not GUJARATI.search(chart),
            [w for w in GRADE_CHART_IN_ENGLISH if w not in chart][:4] or GUJARATI.findall(chart)[:6],
        )
    else:
        check("…and the grade chart printed with it, A to F, in English", False, "no Grade chart button on the preview")

    # The form READS in English; what the record HOLDS is the Gujarati the
    # department issued, so a printed line is never rewritten by being read.
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
        "…while the line on screen reads Printing / Raw materials stock",
        "Printing" in shown and "Raw materials stock" in shown and not GUJARATI.search(shown),
        shown[:300],
    )

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

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nQuality Control's supplied formats are all on file and editable.")
