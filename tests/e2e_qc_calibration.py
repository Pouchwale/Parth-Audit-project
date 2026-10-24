"""Quality Control's two internal calibration records, as the supplied pages have them.

Asked for on 16-Sep-2026 with "weekly and monthly internal calibration
records.pdf": "add this in QC module with same format which i gave and make
sure there is two page in it with different names ... here bot need to perform
some calulation for the data present in it so don't do it first just for now
add". REQUIREMENTS s51. So this suite is a transcription check of the two
formats and the two pages on file. The calculation followed on 19-Sep-2026
(REQUIREMENTS s61), so it also checks that every Deviation % is worked out from
what is written - typed or told to Mitra, in gm or mg - with Pass / Fail
following the sheet's Acceptable Tolerance, and the GSM plate by area.

  page 1  F/QC/12  WEEKLY INTERNAL CALIBRATION RECORDS - WEIGHT SCALE
  page 2  F/QC/11  MONTHLY INTERNAL CALIBRATION RECORDS - GSM CUTTING PLATE

EXACTLY AS THE PAPER (REQUIREMENTS s111, 13-Oct-2026). The owner sent the blank
originals of both again, and of F-QC-32, with DCRS's own prints and his marked
F-QC-30: the two calibration records print their PROCEDURE below the grid and
nothing of DCRS's above it; F/QC/11's Device ID No, Location, Department and
Manufacturer are printed, not typed; F/QC/12 has no Sr. No., and each entry takes
two lines, the second headed "Deviation %"; one calibration a week; F-QC-30's
Sr. No. holds the day's date on its first line; F-QC-32 has its Date column; and
an empty date box prints empty. Section 6 checks the four on screen and in print.
With QC_PAPER_SHOTS set to a folder, the four are photographed there, on screen
and in print, to be laid beside the originals.

Network-independent, against the production build on :8842.
"""
import os
import re
import sys
from playwright.sync_api import sync_playwright


def settle_briefing(page):
    """Mark today's briefing slots as already shown (engine/briefingSchedule.ts)."""
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


BASE = "http://localhost:8842"
FAILURES = []
PASSWORD = "PlaywrightQA123"

WEIGHT_LINE = {
    "weight1": "0.050mg", "testedValue1": "0.050mg", "deviation1": "0%",
    "weight2": "50.000gm", "testedValue2": "50.000gm", "deviation2": "0%",
    "weight3": "100.000gm", "testedValue3": "100.000gm", "deviation3": "0%",
    "weight4": "200.000gm", "testedValue4": "200.000gm", "deviation4": "0%",
    "weight5": "400.000gm", "testedValue5": "400.000gm", "deviation5": "0%",
    "passFail": "Pass",
}
WEIGHT_DATES = [
    ("2024-02-25", "Rashmi", "2024-03-08"),
    ("2024-03-08", "Rashmi", "2024-03-20"),
    ("2024-03-20", "Anjali", "2024-03-27"),
    ("2024-03-27", "Anjali", ""),
]
PLATES = [("p54", "20 x 20cm"), ("p55", "10 x 10cm"), ("p56", "5 x 5cm"), ("p57", "2.5 x 2.5cm")]


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:600])


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
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(1200)
    dismiss(page)


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def record(page, rid):
    return next((r for r in records(page) if r["id"] == rid), None)


def header_values(page):
    """What the sheet's header block says — the fields above the grid that are written in."""
    return page.locator("[data-section='document-preview'] .field input, [data-section='document-preview'] .field select").evaluate_all("els => els.map((e) => e.value)")


def printed_values(page):
    """The boxes whose value the paper prints (s111), by key."""
    # The document's page shows the sheet under document-preview; a record's page is the printed document itself.
    return page.locator("[data-section='document-preview'] [data-printed], [data-print-doc] [data-printed]").evaluate_all("els => Object.fromEntries(els.map((e) => [e.getAttribute('data-printed'), e.textContent.trim()]))")


def sheet_text(page):
    return page.locator("[data-section='document-preview']").evaluate("e => e.textContent")


def shoot(page, name):
    """With QC_PAPER_SHOTS set, the document photographed on screen and as it prints."""
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


def open_page(page, route):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(1400)
    dismiss(page)
    close_assistant(page)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    sign_in(page)

    # ==================================================================
    # 1. Two documents, one per page of the PDF, in Quality Control's module
    # ==================================================================
    open_page(page, "#/library/quality-control-inspection-records")
    rows = page.locator(".doc-table tbody tr:not(.doc-section-row)")
    text = page.locator(".app-content").inner_text()
    check("Quality Control - Inspection Records now holds forty-seven documents", rows.count() == 47, rows.count())
    check(
        "...the two calibration records among them, each with its own name and format number",
        "Weekly Internal Calibration Records - Weight Scale" in text and "F/QC/12" in text
        and "Monthly Internal Calibration Records – GSM Cutting Plate" in text and "F/QC/11" in text,
    )
    check("...both at revision 01 of 01.01.2022, as the forms print", text.count("(Rev 01)") >= 2, text.count("(Rev 01)"))
    check("...weekly and monthly as the forms are headed", "Weekly" in text and "Monthly" in text)

    # ==================================================================
    # 2. F/QC/12 - the weight scale page, cell for cell
    # ==================================================================
    open_page(page, "#/document/qc-weight-scale-calibration")
    sheet = page.locator("[data-section='document-preview']")
    check("The weight scale record opens on its own page, with a sheet on it", page.locator("[data-page='document-records'][data-document='qc-weight-scale-calibration']").count() == 1 and sheet.count() == 1)
    supplied = page.locator("tr[data-record='qc-weight-scale-calibration-2024-03']")
    check("...the supplied page listed among this document's sheets", supplied.count() == 1)
    supplied.click()
    page.wait_for_timeout(500)
    firsts = sheet.locator("table.log-sheet tbody tr[data-line='first']")
    seconds = sheet.locator("table.log-sheet tbody tr[data-line='second']")
    check("...and shown in full when picked: its four calibrations, each on two lines as the paper", firsts.count() == 4 and seconds.count() == 4, (firsts.count(), seconds.count()))
    headings = sheet.locator("table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    expected = ["Date", "Tested By"]
    for i in range(1, 6):
        expected += [f"Weight {i}", f"Tested Value {i}"]
    expected += ["Pass / Fail", "Sign", "Next Due Date"]
    check("...the paper's own headings, in order: no Sr. No., and no Deviation % among them (s111)", headings == expected, headings)
    second = seconds.first.locator("td").evaluate_all("els => els.map((e) => e.getAttribute('data-beneath') || e.textContent.trim())")
    check(
        "...each entry's second line headed Deviation % in the Date column, with each weight's Deviation % under its Tested Value",
        second == ["Deviation %", "", "", "deviation1", "", "deviation2", "", "deviation3", "", "deviation4", "", "deviation5", "", "", ""],
        second,
    )
    check(
        "...under them the 0% the scan shows",
        seconds.first.locator("td[data-beneath]").evaluate_all("els => els.map((e) => e.textContent.trim())") == ["0%"] * 5,
    )
    body = sheet.inner_text()
    values = header_values(page)
    check(
        "...and the header block as written: QC-76, Laboratory, LAB, Force Strain Sensors, serial 06, 0.1 gm to 600 gm, 0.05 %",
        values[:9] == ["QC-76", "Laboratory", "LAB", "Force Strain Sensors", "06", "2024-08-27", "0.1 gm", "600 gm", "0.05 %"],
        values,
    )
    check("...the procedure note the form prints", "reported to the QA manager" in body and "Calibration records of all weights used must be available and valid" in body)
    notes = sheet.locator("[data-section='notes-below']")
    check(
        "...printed below the grid, as the paper prints it, with its heading 'PROCEDURE:' on a line of its own",
        notes.count() == 1 and notes.locator("p").first.inner_text().strip() == "PROCEDURE:"
        and sheet.evaluate("e => { const t = e.querySelector('table.log-sheet'); const n = e.querySelector('[data-section=notes-below]'); return !!t && !!n && !!(t.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING); }"),
    )
    check(
        "...and nothing of DCRS's own above the grid (the two explanation lines are gone)",
        "One line per weekly calibration" not in body and "On the paper the Deviation %" not in body and "worked out" not in body,
    )
    check("...the nine boxes three to a line, as the paper draws them", sheet.locator("[data-section='sheet-boxes'].sheet-boxes-paper").count() == 1)

    stored = record(page, "qc-weight-scale-calibration-2024-03")
    check("The supplied page is on file as a Verified record of four lines", stored is not None and stored["status"] == "Verified" and len(stored["data"]["rows"]) == 4, stored["status"] if stored else None)
    if stored:
        h = stored["data"]["header"]
        check(
            "...its header exactly as the scan: device QC-76, serial 06, expiry 27.08.2024, 0.1 gm / 600 gm, tolerance 0.05 %",
            (h.get("deviceIdNo"), h.get("serialNo"), h.get("calibrationExpiry"), h.get("minReadingCapacity"), h.get("maxReadingCapacity"), h.get("acceptableTolerance"))
            == ("QC-76", "06", "2024-08-27", "0.1 gm", "600 gm", "0.05 %"),
            h,
        )
        for i, (date, tester, next_due) in enumerate(WEIGHT_DATES):
            row = stored["data"]["rows"][i]
            same = all(row.get(k) == v for k, v in WEIGHT_LINE.items())
            check(
                f"...line {i + 1}: {date} by {tester}, every tested value equal to its weight, every deviation 0%, Pass",
                row.get("date") == date and row.get("testedBy") == tester and row.get("nextDueDate") == next_due and same,
                row,
            )
        check("...the last line's Next Due Date left blank, being illegible on the copy, and no signature invented", stored["data"]["rows"][3].get("nextDueDate") == "" and not any(r.get("sign") for r in stored["data"]["rows"]))

    # ==================================================================
    # 3. F/QC/11 - the GSM cutting plate page, cell for cell
    # ==================================================================
    open_page(page, "#/document/qc-gsm-plate-calibration")
    sheet = page.locator("[data-section='document-preview']")
    check("The GSM plate record opens on its own page", page.locator("[data-page='document-records'][data-document='qc-gsm-plate-calibration']").count() == 1 and sheet.count() == 1)
    supplied = page.locator("tr[data-record='qc-gsm-plate-calibration-2024-12']")
    check("...with the 31.12.2024 calibration listed among its sheets", supplied.count() == 1)
    supplied.click()
    page.wait_for_timeout(500)
    check("...six printed lines: four measurements, then Pass/Fail and Sign", sheet.locator("table.log-sheet tbody tr").count() == 6, sheet.locator("table.log-sheet tbody tr").count())
    headings = sheet.locator("table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    expected = ["Index", "No. 54", "No. 55", "No. 56", "No. 57", "20 x 20cm", "Deviation", "10 x 10cm", "Deviation", "5 x 5cm", "Deviation", "2.5 x 2.5cm", "Deviation"]
    check("...the four plates as the paper heads them: No. 54 to 57, each over its size and Deviation (s111)", headings == expected, headings)
    check("...Device ID No, Location, Department and Manufacturer are boxes, not printed words (s117: every part editable)", printed_values(page) == {}, printed_values(page))
    values = header_values(page)
    check(
        "...the four boxes holding the paper's words, then serial blank as the paper's box (s111 part 6), expiry 22.09.2025, calibrated 31.12.2024, due date blank",
        values[:8] == ["1-54, 2-55, 3-56, 4-57", "LAB", "LAB", "Global Eng. Co. (GEC)", "", "2025-09-22", "2024-12-31", ""],
        values,
    )
    labels = sheet.locator(".field label").all_inner_texts()
    check("...the calibration date headed 'I. Calibration Date:-' and its Due Date:-, as printed (s111 part 6)", "I. Calibration Date:-" in labels and "Due Date:-" in labels and "Serial No:" in labels, labels)
    one_a_plate = sheet.locator("table.log-sheet tbody tr").evaluate_all("rows => rows.map((r) => r.querySelectorAll('td').length)")
    check("...Pass/Fail and Sign. one cell under each plate, as printed (s111 part 6)", one_a_plate == [9, 9, 9, 9, 5, 5], one_a_plate)
    body = sheet_text(page)
    check(
        "...the PROCEDURE below the grid and no explanation of DCRS's above it",
        sheet.locator("[data-section='notes-below']").count() == 1 and "PROCEDURE:" in body and "The four plates" not in body and "worked out" not in body,
    )

    stored = record(page, "qc-gsm-plate-calibration-2024-12")
    check("The 31.12.2024 calibration is on file, Verified", stored is not None and stored["status"] == "Verified" and stored["data"]["header"].get("calibrationDate") == "2024-12-31", stored["data"]["header"] if stored else None)
    if stored:
        rows = stored["data"]["rows"]
        check("...the form's six lines in order", [r.get("parameter") for r in rows] == ["Tasted-1", "2", "3", "4", "Pass/Fail", "Sign."], [r.get("parameter") for r in rows])
        check(
            "...each plate measured at its own size four times, with 0% deviation each time",
            all(rows[i].get(key) == size and rows[i].get(f"{key}dev") == "0%" for i in range(4) for key, size in PLATES),
            rows[0],
        )
        check("...all four plates Pass, signed Rashmi", all(rows[4].get(k) == "Pass" and rows[5].get(k) == "Rashmi" for k, _ in PLATES), (rows[4], rows[5]))
        check("...the due date beside the calibration date left blank, being illegible on the copy", stored["data"]["header"].get("dueDate") == "")

    # ==================================================================
    # 4. A new sheet starts from the page on file
    # ==================================================================
    open_page(page, "#/library")
    page.locator("[data-action='new-record'][data-document='qc-weight-scale-calibration']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1400)
    close_assistant(page)
    new_id = page.url.split("#/record/")[-1]
    fresh = record(page, new_id)
    # On its Wednesday the week's sheet is already prepared, and New record
    # opens that one; since 8-Oct-2026 the prepare writes only its known parts
    # (REQUIREMENTS s98: the device's identity carried from the page on file,
    # one dated line, never a weight or a tested value). Any other day New
    # record starts it blank. Either way Mitra fills it when asked, carrying the
    # page on file's four lines forward (engine/sampleFill.ts, allowed in a Live
    # record on the test server), so this holds whatever the day.
    # One sheet a week holds that week's calibration, one entry (s111: never four lines on one day).
    if fresh is not None and not (fresh["data"]["rows"] and fresh["data"]["rows"][0].get("weight4")):
        # Mitra waits to be asked on a record (s123, amending s60): the pill opens it, unless it is open already.
        if page.locator("button:has-text('Ask Mitra')").count():
            page.click("button:has-text('Ask Mitra')")
        page.wait_for_timeout(400)
        mitra_box = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
        mitra_box.fill("fill it with sample data")
        mitra_box.press("Enter")
        page.wait_for_timeout(1500)
        close_assistant(page)
        fresh = record(page, new_id)
    check(
        "A new weight scale sheet holds the week's one calibration, dated the sheet's day, from the page on file",
        fresh is not None and len(fresh["data"]["rows"]) == 1 and fresh["data"]["rows"][0].get("date") == fresh["dueDate"],
        [(r.get("date"), r.get("weight4")) for r in fresh["data"]["rows"]] if fresh else None,
    )
    if fresh:
        check(
            "...carrying the device, its capacities and its tolerance forward",
            fresh["data"]["header"].get("deviceIdNo") == "QC-76" and fresh["data"]["header"].get("acceptableTolerance") == "0.05 %",
            fresh["data"]["header"],
        )
    # ==================================================================
    # 5. The deviation is worked out, not typed (REQUIREMENTS s61)
    # ==================================================================
    # The entry's first line: Date, Tested By, then Weight / Tested Value x 5, Pass / Fail, Sign, Next Due (no Sr. No.);
    # its second line: "Deviation %", then each weight's Deviation % under its Tested Value (s111).
    line = page.locator("table.log-sheet tbody tr[data-line='first']").first
    below = page.locator("table.log-sheet tbody tr[data-line='second']").first
    cell = lambda n: line.locator("td").nth(n)
    under = lambda n: below.locator("td").nth(n)
    check(
        "The Deviation % cells are worked out, not typed: no box to type into, while the weights and tested values keep theirs",
        under(3).locator("input").count() == 0 and under(9).locator("input").count() == 0 and cell(2).locator("input").count() == 1 and cell(3).locator("input").count() == 1,
    )
    cell(9).locator("input").fill("200.04 gm")
    page.wait_for_timeout(1500)
    row = record(page, new_id)["data"]["rows"][0]
    check(
        "Typing a tested value of 200.04 gm against the 200.000gm weight gives 0.02%, on the sheet (under it) and in the record",
        row["deviation4"] == "0.02%" and under(9).inner_text().strip() == "0.02%",
        (row["deviation4"], under(9).inner_text()),
    )
    check("...inside the 0.05 % tolerance, so the line stays Pass, and the other weights stay 0%", row["passFail"] == "Pass" and row["deviation1"] == "0%" and row["deviation5"] == "0%", row)
    cell(9).locator("input").fill("200400 mg")
    page.wait_for_timeout(1500)
    row = record(page, new_id)["data"]["rows"][0]
    check("A tested value written in mg against a weight in gm is read in its own unit: 200400 mg is 0.2%", row["deviation4"] == "0.2%", row["deviation4"])
    check("...which is over the tolerance, so the line turns Fail by itself", row["passFail"] == "Fail", row["passFail"])
    if page.locator("button:has-text('Ask Mitra')").count():
        page.click("button:has-text('Ask Mitra')")
    page.wait_for_timeout(400)
    mitra_box = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
    mitra_box.fill("row 1 tested value 4 is 200.06 gm")
    mitra_box.press("Enter")
    page.wait_for_timeout(1800)
    row = record(page, new_id)["data"]["rows"][0]
    check(
        "Told to Mitra instead, the same happens: tested value 200.06 gm, deviation 0.03%, Pass again",
        row["testedValue4"] == "200.06 gm" and row["deviation4"] == "0.03%" and row["passFail"] == "Pass",
        (row["testedValue4"], row["deviation4"], row["passFail"], page.locator(".chat-msg.bot").last.inner_text()[:200]),
    )
    close_assistant(page)

    # The GSM cutting plate: the measured plate against the size at the head of its column, by area.
    open_page(page, "#/library")
    page.locator("[data-action='new-record'][data-document='qc-gsm-plate-calibration']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1400)
    close_assistant(page)
    gsm_id = page.url.split("#/record/")[-1]
    first = page.locator("table.log-sheet tbody tr").first
    # Columns: Index (the paper's own, no Sr. No.), then each plate's size and its Deviation.
    check("The GSM plate's Deviation cells are worked out too", first.locator("td").nth(2).locator("input").count() == 0 and first.locator("td").nth(1).locator("input").count() == 1)
    device_box = page.locator("[data-print-doc] input[data-bind='header/deviceIdNo']")
    check(
        "...and a new sheet starts its Device ID No box with the paper's words, in a box to type into (s117)",
        device_box.count() == 1 and device_box.input_value() == "1-54, 2-55, 3-56, 4-57" and printed_values(page) == {},
        printed_values(page),
    )
    location_box = page.locator("[data-print-doc] input[data-bind='header/location']")
    location_box.fill("QC Lab")
    page.wait_for_timeout(1200)
    check("...and Location, circled on the owner's print of 16-Oct-2026, takes what is written over the paper's LAB", record(page, gsm_id)["data"]["header"].get("location") == "QC Lab", record(page, gsm_id)["data"]["header"])
    location_box.fill("LAB")
    page.wait_for_timeout(800)
    first.locator("td").nth(1).locator("input").fill("20.1 x 20cm")
    page.wait_for_timeout(1500)
    grow = record(page, gsm_id)["data"]["rows"][0]
    check("No. 54 measured 20.1 x 20cm against its 20 x 20cm is 0.5%", grow["p54dev"] == "0.5%", grow)
    first.locator("td").nth(1).locator("input").fill("20 x 20cm")
    page.wait_for_timeout(1500)
    rows = record(page, gsm_id)["data"]["rows"]
    check("...and back at its own size, 0% - with nothing worked out on the Pass/Fail and Sign lines", rows[0]["p54dev"] == "0%" and (rows[4].get("p54dev") or "") == "" and (rows[5].get("p54dev") or "") == "", [r.get("p54dev") for r in rows])
    check("...and the record holds the paper's words where nobody wrote over them", record(page, gsm_id)["data"]["header"].get("manufacturer") == "Global Eng. Co. (GEC)", record(page, gsm_id)["data"]["header"])
    shoot(page, "F-QC-11")

    # ==================================================================
    # 6. The four the owner named, as their papers (REQUIREMENTS s111)
    # ==================================================================
    # F/QC/12 in print: an entry with no Next Due Date written prints an empty box, not "dd-mm-yyyy".
    page.goto(f"{BASE}/index.html#/record/{new_id}")
    page.wait_for_timeout(1400)
    dismiss(page)
    close_assistant(page)
    due = page.locator("table.log-sheet tbody tr[data-line='first']").first.locator("td").nth(14).locator("input")
    due.fill("")
    page.wait_for_timeout(800)
    shoot(page, "F-QC-12")
    page.evaluate("() => window.dispatchEvent(new Event('beforeprint'))")
    page.emulate_media(media="print")
    written_date = page.locator("table.log-sheet tbody tr[data-line='first']").first.locator("td").nth(0).locator("input")
    try:
        empty = due.evaluate("e => ({ marked: e.hasAttribute('data-empty'), fill: getComputedStyle(e).webkitTextFillColor })")
        # A written date prints its words, not the browser's drawing of the date (s111 part 6: '14·10·2026').
        as_text = written_date.evaluate("e => ({ value: e.value, hidden: getComputedStyle(e).display === 'none', text: (e.nextElementSibling && e.nextElementSibling.classList.contains('print-box-text')) ? e.nextElementSibling.textContent : null })")
    finally:
        page.emulate_media(media="screen")
        page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
    check("F/QC/12: an empty Next Due Date prints empty, not dd-mm-yyyy", empty["marked"] and empty["fill"] in ("rgba(0, 0, 0, 0)", "transparent"), empty)
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    want = f"{as_text['value'][8:10]}-{months[int(as_text['value'][5:7]) - 1]}-{as_text['value'][:4]}" if as_text.get("value") else None
    check("F/QC/12: the entry's written Date prints as the sheet writes it (14-Oct-2026), its box not printed (s111 part 6)", as_text["hidden"] and as_text["text"] == want, as_text)
    left = written_date.evaluate("e => ({ marked: e.classList.contains('print-as-text'), beside: !!(e.nextElementSibling && e.nextElementSibling.classList.contains('print-box-text')) })")
    check("...and after printing the box is the box again, the words gone", not left["marked"] and not left["beside"], left)

    # F-QC-30: nothing above the grid; the Sr. No. numbers the lines and the day is the header's Date alone
    # (the owner, 14-Oct-2026, with a phone picture: the date standing in the Sr. No. column was wrong).
    open_page(page, "#/library")
    page.locator("[data-action='new-record'][data-document='qc-viscosity']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1400)
    close_assistant(page)
    sheet = page.locator("[data-section='document-preview']")
    if sheet.count() == 0:
        sheet = page.locator("[data-print-doc]").first
    # Drawn as its paper's own table since s117 round 2 (22-Oct-2026): the band of logo, title and number, then two
    # tables side by side, each Sr. No. | Date/Time | Viscosity | Tested By; the day's 23 lines in the first.
    headings = page.locator("[data-print-doc] table[data-paper-part] tr[data-pt-heading] td").evaluate_all("els => els.map((e) => e.textContent.replace(/\\s+/g, ' ').trim())")
    one = ["Sr. No.", "Date/Time", "Viscosity (20.0 ± 1.0 Sec.)", "Tested By"]
    check("F-QC-30: Sr. No. | Date/Time | Viscosity (20.0 ± 1.0 Sec.) | Tested By, twice side by side as the paper", headings == one + [""] + one, headings)
    sr = page.locator("[data-print-doc] table[data-paper-part='body'] tr[data-pt-line]:not(.pt-pad) td:first-child").evaluate_all("els => els.map((e) => e.textContent.trim())")
    # The paper's band prints the number, its revision and its date in its own cell; there is no Date cell of DCRS's
    # and no FORMAT NO. block (s117, the owner, 16-Oct-2026 and 22-Oct-2026).
    band = page.locator("[data-print-doc] table[data-paper-part='head'] tr").first.locator("td").evaluate_all("els => els.map((e) => e.textContent.replace(/\\s+/g, ' ').trim())")
    meta = page.locator("[data-print-doc] .doc-header .meta-cell").count()
    check(
        "...the Sr. No. numbers its 23 lines, and the band prints the paper's own number cell, no Date cell or number block of DCRS's",
        len(sr) == 23 and sr == [str(i + 1) for i in range(23)] and len(band) == 3 and band[2] == "Format No.: F-QC-30 Rev. 00 Date : 15.12.2024" and meta == 0,
        (sr[:3], band, meta),
    )
    text30 = page.locator("[data-print-doc]").first.evaluate("e => e.textContent")
    check("...and the specification line the owner crossed out is gone", "Viscosity specification" not in text30 and "round the clock" not in text30)
    shoot(page, "F-QC-30")

    # F-QC-32: the Date column, dated the record's day, and nothing above the grid.
    open_page(page, "#/library")
    page.locator("[data-action='new-record'][data-document='qc-adhesive-mixing']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1400)
    close_assistant(page)
    mix_id = page.url.split("#/record/")[-1]
    # (its paper's own table since s117 round 2: the heading row it marks so; "Adhesive" over "(kg)" read as one heading)
    headings = page.locator("[data-print-doc] table[data-paper-part] tr[data-pt-heading] td").evaluate_all("els => els.map((e) => e.textContent.replace(/\\s+/g, ' ').trim())")
    check(
        "F-QC-32: Sr. No. | Date | Time | Adhesive (kg) | Hardener (kg) | Ethyl (kg) | Viscosity (Sec.) | Remark | Checked by | Verified by",
        headings == ["Sr. No.", "Date", "Time", "Adhesive (kg)", "Hardener (kg)", "Ethyl (kg)", "Viscosity (Sec.)", "Remark", "Checked by", "Verified by"],
        headings,
    )
    mix = record(page, mix_id)
    # Prepared in the morning, its line carries the record's date (a known part); a sheet started blank
    # has nothing written yet, so Mitra fills it with sample data (allowed on the test server), as above.
    if mix is not None and not any(r.get("date") for r in mix["data"]["rows"]):
        if page.locator("button:has-text('Ask Mitra')").count():
            page.click("button:has-text('Ask Mitra')")
        page.wait_for_timeout(400)
        mitra_box = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
        mitra_box.fill("fill it with sample data")
        mitra_box.press("Enter")
        page.wait_for_timeout(1500)
        close_assistant(page)
        mix = record(page, mix_id)
    check(
        "...each line dated the record's day",
        mix is not None and len(mix["data"]["rows"]) >= 1 and all(r.get("date") == mix["dueDate"] for r in mix["data"]["rows"]),
        [(r.get("date"), r.get("time")) for r in mix["data"]["rows"]] if mix else None,
    )
    text32 = page.locator("[data-print-doc]").first.evaluate("e => e.textContent")
    check("...and the 'One row per adhesive batch mixed' line is gone", "One row per adhesive batch" not in text32 and "Standard mix observed" not in text32)
    shoot(page, "F-QC-32")

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nBoth internal calibration records, F-QC-30 and F-QC-32 read exactly as the papers.")
