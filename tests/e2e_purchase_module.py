"""The Purchase module, as the company supplied it.

Five formats came on 23-Sep-2026 as PDFs - F/PUR/01, F/PUR/02, F/PUR/03,
F/PUR/05 and F/PUR/06 (F/PUR/04 was NOT supplied, so nothing stands in for it).
REQUIREMENTS s68. So this suite checks that:

  * Purchase is a module in the sidebar, divided the way the department's own
    paperwork divides - how a supplier gets onto the approved list, and how it
    is marked once it is on it - and its link opens the Document Library
    filtered to it;
  * all five formats are in the library with their format numbers exactly as
    the papers print them, and each opens on a page of its own;
  * the three registers draw the papers' own column headings verbatim,
    including the spanning METHOD OF APPROVAL heading over F/PUR/03's four
    methods;
  * F/PUR/05 works its own arithmetic out: entering X, Y and Z makes the three
    weightages (50% / 40% / 10%), the Overall Rating and the Grade appear
    without anybody typing them, and the grade follows the rule the form's own
    legend prints (A if >= 90, B if < 90 & >= 80, C if < 80) - with all four
    criteria tables on the page;
  * F/PUR/06 adds its two ratings out of 50 into the Overall Rating, over the
    thirteen serial numbers the form prints;
  * F/PUR/01 and F/PUR/02 carry the papers' own headings and prose boxes: what
    the supplier fills comes before INTERNAL OFFICE USE ONLY, and the audit
    report keeps the company's own numbering gaps (4.10 after 4.5, 6.5 after
    6.2);
  * a record is started, filled, submitted and printed - and the paper carries
    the company's header block and the format number.

Every heading below is typed from the supplied PDFs, so this is a
transcription check as much as a behaviour one. Headings are read with
textContent and compared in capitals: the stylesheet prints some of them in
capitals, and inner_text() would return them that way.

Network-independent, against the production build on :8842.
"""
import re
import sys
import time

from playwright.sync_api import sync_playwright

# The legend prints >= and <= as one character, which a Windows console's
# default code page cannot encode.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []

# The five format numbers, as the papers print them. F/PUR/03, F/PUR/05 and
# F/PUR/06 print theirs as "F/PUR/03 (00/01.12.2021)" - the number, then the
# revision and the effective date, which the app shows in its own Rev / Date
# boxes.
FORMAT_NOS = ["F/PUR/01", "F/PUR/02", "F/PUR/03", "F/PUR/05", "F/PUR/06"]

# F/PUR/03 - LIST OF APPROVED SUPPLIERS (RM, PM, SERVICE PROVIDER), verbatim
# and in order, after the printed SR. NO.. The four methods sit under one
# spanning heading, METHOD OF APPROVAL, and the paper draws GFSI scheme
# certification beneath that span too.
PUR03_COLUMNS = [
    "SUPPLIER NAME",
    "PRODUCT / SERVICE",
    "CATEGORY (TRADER / MANUFACTURER / SERVICE PROVIDER)",
    "MANUFACTURER NAME (IF MATERIALS PROCURED FROM TRADERS)",
    "CONTACT PERSON",
    "CONTACT NUMBER",
    "LOCATION",
    "MONOPOLY SUPPLIER / REPUTED SUPPLIER",
    "REGISTRATION FORM",
    "SUPPLIER VISIT / AUDIT",
    "TRIAL LOT / SAMPLE APPROVAL",
    "GFSI SCHEME CERTIFICATION",
    "APPROVAL DATE",
]

# F/PUR/05 - the RM & PM supplier performance monitoring register. The last
# five columns are the ones the form itself says are "formula based".
PUR05_COLUMNS = [
    "SUPPLIER / SERVICE PROVIDER NAME",
    "PERIOD UNDER REVIEW",
    "MATERIAL DESCRIPTION",
    "NOS. OF LOTS RECEIVED",
    "NOS. OF LOTS REJECTED / RETURNED / INFESTED",
    "PRODUCT SAFETY RATING (X)",
    "QUALITY RATING (Y)",
    "DELIVERY RATING (Z)",
    "PRODUCT SAFETY WEIGHTAGE 50%",
    "QUALITY WEIGHTAGE 40%",
    "DELIVERY WEIGHTAGE 10%",
    "OVERALL RATING",
    "GRADE",
]
PUR05_TYPED = ["PRODUCT SAFETY RATING (X)", "QUALITY RATING (Y)", "DELIVERY RATING (Z)"]
PUR05_WORKED_OUT = [
    "PRODUCT SAFETY WEIGHTAGE 50%",
    "QUALITY WEIGHTAGE 40%",
    "DELIVERY WEIGHTAGE 10%",
    "OVERALL RATING",
    "GRADE",
]
# The four criteria tables printed across the top of the form, and lines out of
# each one that no other document says.
PUR05_LEGEND_TITLES = ["Product Safety Rating", "Quality Rating", "Delivery Rating", "Overall Rating"]
PUR05_LEGEND_LINES = [
    "% ACCEPTANCE",
    "MARKS",
    "NO INFESTATION",
    "INFESTATION",
    "100% ACCEPT.",
    "ACCEPTED ON SEGREGATION",
    "REJECTED & SEND BACK TO SUPPLIER",
    "DELIVERY TIME",
    "BEFORE TIME / < 7 DAYS PO",
    "> 7 DAYS & < 15 DAYS DELAY",
    "> 15 DAYS DELAY",
    "GRADE",
    "ACTION",
    "IF ≥ 90",
    "IF < 90 & ≥ 80",
    "IF < 80",
    "CONTINUE & IMPROVE",
    "REPLACE / IMPROVE",
]
# The two guidance lines printed across the grid itself.
PUR05_GUIDANCE = [
    "ENTER VALUE BASED ON ABOVE CRITERIA IN THE FOLLOWING CELLS",
    "DON’T ENTER VALUE IN THE FOLLOWING CELL, ITS FORMULA BASED",
]

# F/PUR/06 - SERVICE PROVIDER - PERFORMANCE MONITORING REGISTER, after SR. NO..
PUR06_COLUMNS = [
    "DESCRIPTION OF SERVICE",
    "SUPPLIER NAME",
    "DELIVERY PARAMETER RATING (MAX 50)",
    "QUALITY & PRODUCT SAFETY PARAMETER RATING (MAX 50)",
    "OVERALL RATING",
    "STATUS / DECISION",
]

# F/PUR/01 - the underlined headings and the labelled lines of the three pages,
# and the numbered list of documents the form asks for.
PUR01_SUPPLIER_PART = [
    "GENERAL DETAILS",
    "TO BE FILLED UP BY SUPPLIER",
    "SUPPLIER’S NAME",
    "TYPE OF CONCERN",
    # The form prints the four kinds of concern on the line; the app offers them
    # to be chosen from, so each is looked for on its own.
    "PROPRIETARY",
    "PARTNERSHIP",
    "PRIVATE LIMITED",
    "ADDRESS (OFFICE)",
    "ADDRESS (WORKS)",
    "CONTACT PERSON",
    "DESIGNATION",
    "TELEPHONE NOS",
    "E-MAIL ADDRESS",
    "WEEKLY OFF / WORKING HOURS",
    "COMPANY ACTIVITIES",
    "NO. OF EMPLOYEES",
    "YEAR OF COMMENCEMENT",
    "RANGE OF PRODUCTS / SERVICES OFFERED",
    "LIST OF MAJOR CUSTOMERS",
    "PARTICULARS OF PLANT MACHINERY & OTHER INFRASTRUCTURE (NOT APPLICABLE FOR TRADERS)",
    "DETAILS OF QUALITY CONTROL DEPARTMENT (PROVIDE DETAILS OF TESTING FACILITY, TEST METHODS)",
    "DO YOU HOLD ISO 9001 / ISO 22000 / HACCP / FSSC / BRCGS CERTIFICATION",
    "TECHNICAL DATA SHEET / SPECIFICATION SHEET",
    "MSDS",
    "FOOD GRADE DECLARATION OR COMPATIBLE TO FOOD CONTACT PACKAGING",
    "TRACEABILITY PROTOCOL OR YOURS INTERNAL TRACEABILITY RECORD FOR ONE OF THE LOTS SUPPLIED TO US",
    "COPY OF MANAGEMENT SYSTEM CERTIFICATION (E.G. ISO 9001 / FSSC 22000 / BRCGS AS APPLICABLE)",
    "INFORMATION FURNISHED BY",
    "SIGNATURE WITH COMPANY’S SEAL",
]
PUR01_OFFICE_PART = [
    "INTERNAL OFFICE USE ONLY",
    "STATUS OF SUPPLIER",
    "ESTABLISHED",
    "IF NEW SUPPLIER/NEW PRODUCT, TYPE OF ASSESSMENT STATUS",
    "BY VISIT / SUPPLIER AUDIT",
    "BY REGISTRATION FORM DETAILS",
    "BY PLACING TRIAL ORDERS",
    "BY GFSI SCHEME CERTIFICATION",
    "BY EXCEPTION (MARKET REPUTATION)",
    "PRODUCTS / SERVICES FOR WHICH SUPPLIER IS APPROVED",
    "ASSESSMENT STATUS",
    "SIGNATURE & AUTHORISED PERSON",
]

# F/PUR/02 - the eight criteria of page 1, the eight numbered sections of pages
# 2 to 8, the answer columns and the summary of page 8 / page 9.
PUR02_HEADINGS = [
    "SUPPLIER",
    "CONTACTS",
    "DATE OF VISIT",
    "VISIT NO",
    "AUDITOR (S)",
    "SCOPE OF AUDIT",
    "PRODUCT SUPPLIED",
    "AUDIT CRITERIA",
    "DEPENDING ON THE TYPE OF SUPPLY CRITERIA MAY BE OMITTED - IF OMITTED PLEASE MARK N/A",
    "QUALITY SYSTEMS/HACCP",
    "FACTORY PREMISES/LOCATION",
    "HYGIENE OF PERSONNEL",
    "INFESTATION/FOREIGN BODY CONTROL",
    "RAW MATERIALS CONTROL",
    "PRODUCTION AND PROCESS CONTROL",
    "PRODUCT ANALYSIS AND QUALITY ASSURANCE",
    "EXTERNAL LABORATORY - IF USED",
    "PACKED PRODUCT STORAGE AND DISTRIBUTION",
    "SUMMARY OF OBSERVATIONS",
    "DETAILS OF OBSERVATIONS / NC",
    "RESPONSE EVIDENCE RECEIVED FROM SUPPLIER / ON-SITE VERIFICATION",
    "DATE OF CLOSURE",
    "OVERALL STATUS",
]
# Items whose printed number is on either side of a gap the company left.
PUR02_GAP_ITEMS = [
    "FOREIGN MATTER RISK AND ELIMINATION",
    "RISK FROM MAINTENANCE STAFF/EQUIPMENT INCLUDING GREASE/OIL RISKS",
    "IMPLEMENTATION OF HACCP",
    "QUALITY MANUAL/SYSTEM IMPLEMENTATION",
]

PREVIEW = "[data-section='document-preview'] table.log-sheet"
SHEET = "table.log-sheet"
# ONE HEADING PER COLUMN, IN COLUMN ORDER. F/PUR/03 prints a spanning heading
# (METHOD OF APPROVAL) over four of its columns, so that grid has a second
# header row holding only the columns under a span, while the others span both
# rows. This walks the two rows back into the paper's own left-to-right order,
# and reads a single-row head unchanged.
HEADINGS_JS = """(table) => {
    const rows = Array.from(table.querySelectorAll('thead tr'));
    const say = (c) => c.textContent.replace(/\\s+/g, ' ').trim();
    if (rows.length < 2) return rows.length ? Array.from(rows[0].cells).map(say) : [];
    const under = Array.from(rows[1].cells);
    const out = [];
    let i = 0;
    for (const cell of Array.from(rows[0].cells)) {
      if (cell.colSpan > 1) for (let k = 0; k < cell.colSpan && i < under.length; k++) out.push(say(under[i++]));
      else out.push(say(cell));
    }
    return out;
  }
"""


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


def open_page(page, route, settle=1300):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def record(page, rid):
    return next((r for r in records(page) if r["id"] == rid), None)


def written(page, selector):
    """The text as it was written, not as the stylesheet prints it - some
    headings are printed in capitals, and inner_text() would return them so."""
    el = page.locator(selector)
    return el.first.evaluate("e => e.textContent") if el.count() else ""


def headings(page, root):
    table = page.locator(root)
    return table.first.evaluate(HEADINGS_JS) if table.count() else []


def paper_columns(page, root):
    """The grid's headings in capitals, past the serial number: the sheet draws
    a Sr. No. of its own, and three of these forms print one as well."""
    out = [h.upper() for h in headings(page, root) if h.strip()]
    while len(out) > 1 and out[0] == "SR. NO.":
        out.pop(0)
    return out


def column_index(page, root, label):
    """Which cell of a line a column is, counting the sheet's own Sr. No.."""
    hs = [h.upper() for h in headings(page, root)]
    return hs.index(label) if label in hs else -1


def number_text(text):
    """"50.00" / "50" / "" -> a float, or None when the cell says nothing."""
    m = re.search(r"-?\d+(?:\.\d+)?", str(text or ""))
    return float(m.group(0)) if m else None


def grade_text(text):
    """The legend writes the grade as "A" Grade, so a cell may carry the quotes."""
    return str(text or "").replace('"', "").replace("“", "").replace("”", "").strip().upper()


def start_record(page, doc_id):
    """Starts a record from that document's own page and lands on it."""
    open_page(page, f"#/document/{doc_id}")
    page.locator("[data-action='document-new-record']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1500)
    close_assistant(page)
    return page.url.split("#/record/")[-1]


def composer(page):
    return page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")


def say(page, text, wait=1500):
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(300)
    composer(page).fill(text)
    composer(page).press("Enter")
    page.wait_for_timeout(wait)
    msgs = page.locator(".chat-msg.bot")
    return msgs.last.inner_text() if msgs.count() else ""


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    # A fresh account, so the module is judged as a new person sees it. The name
    # carries no word this suite presses a button by.
    email = f"pur-{int(time.time() * 1000)}@example.com"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "Pur Desk QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)

    # ==================================================================
    # 1. Purchase is a module of its own in the sidebar
    # ==================================================================
    open_page(page, "#/dashboard")
    header = page.locator(".nav-module-header:has-text('Purchase')")
    check("The sidebar has a Purchase module header", header.count() == 1, header.count())
    labels = page.eval_on_selector_all(
        ".nav-module:has(.nav-module-header:has-text('Purchase')) .nav-sub-label",
        "els => els.map((e) => e.textContent.trim())",
    )
    check(
        "...divided the way the department's paperwork divides: Supplier Approval, then Supplier Monitoring",
        labels == ["Supplier Approval", "Supplier Monitoring"],
        labels,
    )
    pur_links = page.eval_on_selector_all(
        ".nav-module:has(.nav-module-header:has-text('Purchase')) a", "els => els.map((e) => e.getAttribute('href'))"
    )
    check("...and a link that opens the Document Library filtered to the module", "#/library/purchase" in pur_links, pur_links)
    check("...with a page of its own for every one of the five formats", len([h for h in pur_links if h.startswith("#/document/")]) == 5, pur_links)

    page.locator("a[href='#/library/purchase']").first.click()
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    body = page.locator(".app-content").inner_text()
    check("The module link lands on the library filtered to Purchase", page.url.endswith("#/library/purchase") and "Filtered to: Purchase" in body, page.url)
    groups = page.eval_on_selector_all(".app-content h3", "els => els.map((e) => e.textContent.trim())")
    check("...and only Purchase's paperwork is on it", groups == ["Purchase"], groups)

    # ==================================================================
    # 2. All five formats, with their numbers as the papers print them
    # ==================================================================
    listed = page.eval_on_selector_all(
        ".doc-table tbody tr:not(.doc-section-row)",
        """els => els.map((tr) => {
             const open = tr.querySelector("[data-action='open-document']");
             return {
               id: open ? open.getAttribute('data-document') : null,
               format: tr.children[1] ? tr.children[1].textContent.trim() : '',
               name: tr.children[0] ? tr.children[0].textContent.trim() : '',
             };
           })""",
    )
    ids = {row["format"].split(" (")[0]: row["id"] for row in listed}
    check("The Purchase module holds the five formats the company supplied", len(listed) == 5, [r["format"] for r in listed])
    check(
        "...each carrying its format number exactly as the paper prints it, and no F/PUR/04 invented",
        sorted(ids) == FORMAT_NOS and all(ids[f] for f in FORMAT_NOS),
        sorted(ids),
    )
    sections = page.locator("tr.doc-section-row").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check(
        "...shelved in the module's two sections, approval before monitoring",
        sections == ["Supplier Approval", "Supplier Monitoring"],
        sections,
    )

    pur01, pur02, pur03, pur05, pur06 = (ids.get(f) for f in FORMAT_NOS)
    wrong = {}
    for format_no in FORMAT_NOS:
        doc_id = ids.get(format_no)
        if not doc_id:
            wrong[format_no] = "not in the library"
            continue
        open_page(page, f"#/document/{doc_id}", settle=1000)
        text = written(page, ".app-content")
        if page.locator(f"[data-page='document-records'][data-document='{doc_id}']").count() != 1 or format_no not in text:
            wrong[format_no] = text[:140]
    check("Each of the five opens on a page of its own, headed by its own format number", not wrong, wrong)

    # ==================================================================
    # 3. The registers draw the papers' own columns, verbatim
    # ==================================================================
    open_page(page, f"#/document/{pur03}")
    cols = paper_columns(page, PREVIEW)
    check("F/PUR/03 draws the paper's own thirteen columns, verbatim and in order", cols == PUR03_COLUMNS, cols)
    sheet_text = written(page, "[data-section='document-preview']").upper()
    # The four methods must be the run the spanning heading sits over, so they
    # have to be side by side and in the paper's order.
    methods = [cols.index(m) if m in cols else -1 for m in PUR03_COLUMNS[7:11]]
    check(
        "...under the paper's spanning METHOD OF APPROVAL heading, above its four methods",
        "METHOD OF APPROVAL" in sheet_text and methods[0] >= 0 and methods == [methods[0] + i for i in range(4)],
        (methods, sheet_text[:200]),
    )
    check("...and the list says when it was last brought up to date", "UPDATION AS ON" in sheet_text, sheet_text[:300])
    check("...with lines to write the approved suppliers on", page.locator(f"{PREVIEW} tbody tr").count() >= 1, page.locator(f"{PREVIEW} tbody tr").count())

    open_page(page, f"#/document/{pur05}")
    cols = paper_columns(page, PREVIEW)
    check("F/PUR/05 draws the register's own thirteen columns, verbatim and in order", cols == PUR05_COLUMNS, cols)
    sheet_text = written(page, "[data-section='document-preview']").upper()
    missing = [line for line in PUR05_GUIDANCE if line not in sheet_text]
    check("...with the two guidance lines the form prints across the grid", not missing, missing)
    legend_buttons = [
        page.locator(f"button:has-text('Show {title}')").count() for title in PUR05_LEGEND_TITLES
    ]
    check("The four criteria tables the form prints are on the page", all(n >= 1 for n in legend_buttons), dict(zip(PUR05_LEGEND_TITLES, legend_buttons)))
    # One Show opens all four, as the form prints them all at once.
    show = page.locator(f"button:has-text('Show {PUR05_LEGEND_TITLES[0]}')")
    if show.count():
        show.first.click()
        page.wait_for_timeout(500)
    legend = " ".join(written(page, "[data-section='document-preview']").upper().split())
    missing = [line for line in PUR05_LEGEND_LINES if line not in legend]
    check("...reading exactly as the form prints them: the marks, the delays and the three grades with their actions", not missing, missing)
    check("...with lines to rate the suppliers on", page.locator(f"{PREVIEW} tbody tr").count() >= 1, page.locator(f"{PREVIEW} tbody tr").count())

    open_page(page, f"#/document/{pur06}")
    cols = paper_columns(page, PREVIEW)
    check("F/PUR/06 draws the register's own six columns, verbatim and in order", cols == PUR06_COLUMNS, cols)
    sheet_text = written(page, "[data-section='document-preview']").upper()
    check("...asking for the rating period the form prints beneath its title", "RATING PERIOD" in sheet_text, sheet_text[:300])

    # ==================================================================
    # 4. F/PUR/05: the weightages, the Overall Rating and the Grade are
    #    worked out, never typed (the form's own "its formula based")
    # ==================================================================
    rid = start_record(page, pur05)
    # A register the department adds to as it reviews opens with one line, so
    # the review is written out first — four suppliers, one into each grade the
    # legend names.
    reply = say(page, "fill it with sample data")
    close_assistant(page)
    typed = {label: column_index(page, SHEET, label) for label in PUR05_TYPED}
    worked = {label: column_index(page, SHEET, label) for label in PUR05_WORKED_OUT}
    check("Every rating column and every worked-out column is on the record", all(i >= 0 for i in typed.values()) and all(i >= 0 for i in worked.values()), {**typed, **worked})
    # A missing column would make every reading below meaningless, so the
    # arithmetic is only put to the test once the columns are all there.
    if all(i >= 0 for i in list(typed.values()) + list(worked.values())):
        lines = page.locator(f"{SHEET} tbody tr")
        check("Written out, an F/PUR/05 carries the eight lines the form prints", lines.count() == 8, (lines.count(), reply[:160]))
        first = lines.first
        check(
            "The three weightages, the Overall Rating and the Grade have no box to type into, while X, Y and Z keep theirs",
            all(first.locator("td").nth(i).locator("input").count() == 0 for i in worked.values())
            and all(first.locator("td").nth(i).locator("input").count() == 1 for i in typed.values()),
            {label: first.locator("td").nth(i).locator("input").count() for label, i in {**typed, **worked}.items()},
        )

        def rate(index, x, y, z):
            line = lines.nth(index)
            for label, value in ((PUR05_TYPED[0], x), (PUR05_TYPED[1], y), (PUR05_TYPED[2], z)):
                line.locator("td").nth(typed[label]).locator("input").fill(str(value))
            page.wait_for_timeout(1500)
            return {label: line.locator("td").nth(i).inner_text().strip() for label, i in worked.items()}

        # 100 / 100 / 100 -> 50 + 40 + 10 = 100, an "A" Grade: Continue.
        out = rate(0, 100, 100, 100)
        check(
            "Entering 100, 100 and 100 gives 50.00, 40.00 and 10.00, an Overall Rating of 100.00 and an A Grade - none of it typed",
            number_text(out["PRODUCT SAFETY WEIGHTAGE 50%"]) == 50
            and number_text(out["QUALITY WEIGHTAGE 40%"]) == 40
            and number_text(out["DELIVERY WEIGHTAGE 10%"]) == 10
            and number_text(out["OVERALL RATING"]) == 100
            and grade_text(out["GRADE"]) == "A",
            out,
        )
        # 100 / 50 / 100 -> 50 + 20 + 10 = 80, which the legend puts in "B" Grade.
        out = rate(1, 100, 50, 100)
        check(
            "A lot accepted on segregation but delivered on time comes to 80.00 - a B Grade, the legend's Continue & improve",
            number_text(out["QUALITY WEIGHTAGE 40%"]) == 20 and number_text(out["OVERALL RATING"]) == 80 and grade_text(out["GRADE"]) == "B",
            out,
        )
        # 100 / 50 / 75 -> 50 + 20 + 7.5 = 77.5, under 80: a "C" Grade.
        out = rate(2, 100, 50, 75)
        check(
            "...and the same lot a week late comes to 77.50, which is a C Grade",
            number_text(out["DELIVERY WEIGHTAGE 10%"]) == 7.5 and number_text(out["OVERALL RATING"]) == 77.5 and grade_text(out["GRADE"]) == "C",
            out,
        )
        # An infested lot is nought for product safety: the register must say so.
        out = rate(3, 0, 100, 100)
        check(
            "An infested lot scores nought for product safety, so its Overall Rating is 50.00 and its Grade C",
            number_text(out["PRODUCT SAFETY WEIGHTAGE 50%"]) == 0 and number_text(out["OVERALL RATING"]) == 50 and grade_text(out["GRADE"]) == "C",
            out,
        )
        stored = record(page, rid)
        rows = (stored or {}).get("data", {}).get("rows", [])
        check(
            "...and every figure the sheet worked out is on the record, not only on the screen",
            len(rows) == 8
            and (rows[0].get("productSafetyWeightage"), rows[0].get("qualityWeightage"), rows[0].get("deliveryWeightage"), rows[0].get("overallRating"), rows[0].get("grade")) == ("50.00", "40.00", "10.00", "100.00", "A")
            and (rows[2].get("overallRating"), rows[2].get("grade")) == ("77.50", "C"),
            [{k: r.get(k) for k in ("overallRating", "grade")} for r in rows[:4]],
        )

    # ==================================================================
    # 5. F/PUR/06: the two ratings out of 50 make the Overall Rating
    # ==================================================================
    start_record(page, pur06)
    reply = say(page, "fill it with sample data")
    close_assistant(page)
    delivery = column_index(page, SHEET, "DELIVERY PARAMETER RATING (MAX 50)")
    quality = column_index(page, SHEET, "QUALITY & PRODUCT SAFETY PARAMETER RATING (MAX 50)")
    overall = column_index(page, SHEET, "OVERALL RATING")
    decision = column_index(page, SHEET, "STATUS / DECISION")
    lines = page.locator(f"{SHEET} tbody tr")
    serials = lines.evaluate_all("els => els.map((e) => e.querySelector('td').textContent.trim())")
    check(
        "A written-out F/PUR/06 carries the thirteen serial numbers the form prints, 1 to 13",
        lines.count() == 13 and serials == [str(n) for n in range(1, 14)],
        (lines.count(), serials, reply[:160]),
    )
    line = lines.first
    check(
        "The Overall Rating is worked out, while the Status / Decision is the person's to write",
        overall >= 0 and line.locator("td").nth(overall).locator("input").count() == 0 and decision >= 0 and line.locator("td").nth(decision).locator("input").count() == 1,
        (overall, decision),
    )
    def rate_service(row, first, second):
        row.locator("td").nth(delivery).locator("input").fill(str(first))
        row.locator("td").nth(quality).locator("input").fill(str(second))
        page.wait_for_timeout(1500)
        return row.locator("td").nth(overall).inner_text()

    if min(delivery, quality, overall) < 0:
        check("F/PUR/06's two ratings and its Overall Rating are on the register", False, (delivery, quality, overall))
    else:
        check(
            "45 out of 50 for delivery and 40 out of 50 for quality & product safety make an Overall Rating of 85",
            number_text(rate_service(line, 45, 40)) == 85,
            line.locator("td").nth(overall).inner_text(),
        )
        third = lines.nth(2)
        shown = rate_service(third, 50, 50)
        check("...and full marks on both come to 100, the most the register can give", number_text(shown) == 100, shown)

    # ==================================================================
    # 6. F/PUR/01: what the supplier fills, then INTERNAL OFFICE USE ONLY
    # ==================================================================
    open_page(page, f"#/document/{pur01}")
    text = " ".join(written(page, "[data-section='document-preview']").upper().split())
    missing = [line for line in PUR01_SUPPLIER_PART if line not in text]
    check("F/PUR/01 carries the paper's own general details and its prose boxes", not missing, missing)
    missing = [line for line in PUR01_OFFICE_PART if line not in text]
    check("...and the office's own half of the form", not missing, missing)
    supplier_at, office_at = text.find("TO BE FILLED UP BY SUPPLIER"), text.find("INTERNAL OFFICE USE ONLY")
    check(
        "...with what the supplier fills divided from INTERNAL OFFICE USE ONLY, and printed before it",
        supplier_at >= 0 and office_at > supplier_at,
        (supplier_at, office_at),
    )
    check(
        "...and the form's own three-page span said on the header block",
        "F/PUR/01" in written(page, "[data-section='document-preview'] .doc-header"),
        written(page, "[data-section='document-preview'] .doc-header")[:200],
    )

    # ==================================================================
    # 7. F/PUR/02: the audit report, gaps in the numbering and all
    # ==================================================================
    open_page(page, f"#/document/{pur02}")
    text = " ".join(written(page, "[data-section='document-preview']").upper().split())
    missing = [line for line in PUR02_HEADINGS if line not in text]
    check("F/PUR/02 carries the paper's own criteria, its eight sections and its summary", not missing, missing)
    check(
        "...answered the way the paper asks: C/NC/NA on the quality system, a rating on the other seven",
        "AUDITED YES/NO" in text and "C/NC/NA" in text and "RATING" in text,
        text[:400],
    )
    missing = [line for line in PUR02_GAP_ITEMS if line not in text]
    check("...every item of the two sections the company numbered oddly", not missing, missing)
    numbers = re.findall(r"(?<![\d.])(\d{1,2}\.\d{1,2})(?![\d.])", text)
    fours = [n for n in numbers if n.startswith("4.")]
    sixes = [n for n in numbers if n.startswith("6.")]
    check(
        "...and the company's own numbering gap is kept: 4.10 follows 4.5, with no 4.6 to 4.9",
        "4.5" in fours and "4.10" in fours and fours.index("4.10") == fours.index("4.5") + 1 and not {"4.6", "4.7", "4.8", "4.9"} & set(fours),
        fours,
    )
    check(
        "...and 6.5 follows 6.2, with no 6.3 or 6.4",
        "6.2" in sixes and "6.5" in sixes and sixes.index("6.5") == sixes.index("6.2") + 1 and not {"6.3", "6.4"} & set(sixes),
        sixes,
    )

    # ==================================================================
    # 8. A record started, filled, submitted and printed
    # ==================================================================
    rid = start_record(page, pur03)
    reply = say(page, "fill it with sample data")
    filled = record(page, rid)
    check(
        "A list of approved suppliers is filled in when asked, and the chat says it is sample data to be checked",
        ("sample data" in reply.lower() or "already filled" in reply.lower()) and filled is not None and any(any(str(v).strip() for k, v in row.items() if k != "id") for row in filled["data"]["rows"]),
        (reply[:200], (filled or {}).get("data", {}).get("rows", [])[:1]),
    )
    close_assistant(page)
    page.locator("[data-action='submit']").first.click()
    page.wait_for_timeout(1600)
    submitted = record(page, rid)
    check(
        "...and it submits, so the register goes for verification like every other record",
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
                   scoped: document.documentElement.classList.contains('print-scoped'),
                   form: shown(doc),
                   lines: doc ? doc.querySelectorAll('table.log-sheet tbody tr').length : 0,
                   company: doc ? Array.from(doc.querySelectorAll('.company-name')).map((c) => c.textContent.trim()) : [],
                   formatNos: doc ? Array.from(doc.querySelectorAll('.meta-cell .v')).map((v) => v.textContent.trim()) : [],
                   sidebar: shown(document.querySelector('.app-sidebar')),
                   topbar: shown(document.querySelector('.app-topbar')),
                   // The record's own controls, which are now Verify / Reject.
                   actions: ["verify", "reject"].filter((a) => shown(document.querySelector(`button[data-action='${a}']`))),
                 };
               }"""
        )
    finally:
        page.emulate_media(media="screen")
        page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
    check("Printing it prints the form (the browser was asked to print once)", seen["printed"] == 1 and seen["scoped"] and seen["form"] and seen["lines"] == 7, seen)
    check("...carrying the company's own header block", any("GUJARAT" in c.upper() for c in seen["company"]), seen["company"])
    check("...and the format number the paper is controlled by", "F/PUR/03" in seen["formatNos"], seen["formatNos"])
    check("...with nothing around it: not the panel, not the top bar, not the record's own buttons", not seen["sidebar"] and not seen["topbar"] and seen["actions"] == [], seen)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe Purchase module reads as the company's own five purchase formats, and does their arithmetic itself.")
