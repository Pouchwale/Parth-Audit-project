"""Quality Control's two internal calibration records, as the supplied pages have them.

Asked for on 16-Sep-2026 with "weekly and monthly internal calibration
records.pdf": "add this in QC module with same format which i gave and make
sure there is two page in it with different names ... here bot need to perform
some calulation for the data present in it so don't do it first just for now
add". REQUIREMENTS s51. So this suite is a transcription check of the two
formats and the two pages on file, and it also checks that nothing calculates
the deviation yet - the columns are there, holding what the paper wrote.

  page 1  F/QC/12  WEEKLY INTERNAL CALIBRATION RECORDS - WEIGHT SCALE
  page 2  F/QC/11  MONTHLY INTERNAL CALIBRATION RECORDS - GSM CUTTING PLATE

Network-independent, against the production build on :8842.
"""
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
    """What the sheet's header block says — the fields above the grid."""
    return page.locator("[data-section='document-preview'] .field input, [data-section='document-preview'] .field select").evaluate_all("els => els.map((e) => e.value)")


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
    check("Quality Control - Inspection Records now holds thirty-eight documents", rows.count() == 38, rows.count())
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
    check("...and shown in full when picked: its four calibrations", sheet.locator("table.log-sheet tbody tr").count() == 4, sheet.locator("table.log-sheet tbody tr").count())
    headings = sheet.locator("table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    expected = ["Sr. No.", "Date", "Tested By"]
    for i in range(1, 6):
        expected += [f"Weight {i}", f"Tested Value {i}", "Deviation %"]
    expected += ["Pass / Fail", "Sign", "Next Due Date"]
    check("...the form's own columns, in order, with a Deviation % beside every weight", headings == expected, headings)
    body = sheet.inner_text()
    values = header_values(page)
    check(
        "...and the header block as written: QC-76, Laboratory, LAB, Force Strain Sensors, serial 06, 0.1 gm to 600 gm, 0.05 %",
        values[:9] == ["QC-76", "Laboratory", "LAB", "Force Strain Sensors", "06", "2024-08-27", "0.1 gm", "600 gm", "0.05 %"],
        values,
    )
    check("...the procedure note the form prints", "reported to the QA manager" in body and "Calibration records of all weights used must be available and valid" in body)

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
    expected = ["Sr. No.", "Index", "No. 54 (20 x 20cm)", "Deviation %", "No. 55 (10 x 10cm)", "Deviation %", "No. 56 (5 x 5cm)", "Deviation %", "No. 57 (2.5 x 2.5cm)", "Deviation %"]
    check("...the four plates with their sizes, each with a Deviation % column", headings == expected, headings)
    values = header_values(page)
    check(
        "...the header as written: the four device ids, LAB, Global Eng. Co. (GEC), expiry 22.09.2025, calibrated 31.12.2024",
        values[:8] == ["1-54, 2-55, 3-56, 4-57", "LAB", "LAB", "Global Eng. Co. (GEC)", "TO BE CONFIRMED", "2025-09-22", "2024-12-31", ""],
        values,
    )
    check("...with the serial number marked TO BE CONFIRMED, being a scribble on the scan, and the due date left blank", "TO BE CONFIRMED" in values and values[7] == "")

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
    # 4. Nothing calculates the deviation yet - it holds what was written
    # ==================================================================
    open_page(page, "#/library")
    page.locator("[data-action='new-record'][data-document='qc-weight-scale-calibration']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1400)
    close_assistant(page)
    new_id = page.url.split("#/record/")[-1]
    fresh = record(page, new_id)
    # On its Wednesday the week's sheet is already prepared from the page on
    # file (engine/assistantPrepare.ts), and New record opens that one. Any
    # other day New record starts it blank, and Mitra fills it when asked - the
    # same carry-forward (engine/sampleFill.ts), so this holds whatever the day.
    if fresh is not None and not fresh.get("prepared"):
        page.click("button:has-text('Ask Mitra')")
        page.wait_for_timeout(400)
        mitra_box = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
        mitra_box.fill("fill it with sample data")
        mitra_box.press("Enter")
        page.wait_for_timeout(1500)
        close_assistant(page)
        fresh = record(page, new_id)
    check("A new weight scale sheet starts from the page on file, ready to be checked", fresh is not None and len(fresh["data"]["rows"]) == 4, len(fresh["data"]["rows"]) if fresh else None)
    if fresh:
        check(
            "...carrying the device, its capacities and its tolerance forward",
            fresh["data"]["header"].get("deviceIdNo") == "QC-76" and fresh["data"]["header"].get("acceptableTolerance") == "0.05 %",
            fresh["data"]["header"],
        )
    inputs = page.locator("table.log-sheet tbody tr").first.locator("input")
    check("...and its Deviation % cells are ordinary entry cells, as asked - no arithmetic yet", inputs.count() >= 18 and not page.locator("table.log-sheet [readonly]").count())

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nBoth internal calibration records read exactly as the supplied pages.")
