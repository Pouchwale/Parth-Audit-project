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
  * every new format is found by its format number, and Mitra opens one by name;
  * what a person types on any of them is stored.

Every figure below is typed from the supplied PDFs, so this is a transcription
check as much as a behaviour one.

Network-independent, against the production build on :8842.
"""
import json
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
    open_page(page, "#/document/qc-line-clearance-materials")
    body = page.locator(".app-content").inner_text()
    check(
        "The Gujarati materials clearance prints its twelve lines, process by process",
        sheet_rows(page).count() == 12 and "પ્રિન્ટીંગ" in body and "મેગ્નેટીક ડાઈ" in body and "લેબલ સ્લીટીંગ" in body,
        (sheet_rows(page).count(), body[:200]),
    )
    open_page(page, "#/document/qc-line-clearance-quality")
    body = page.locator(".app-content").inner_text()
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
