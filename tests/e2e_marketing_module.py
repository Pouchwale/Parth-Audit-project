"""The Marketing module and its three supplied F/MKT formats, and the header
block of every format designed in place (REQUIREMENTS s77), asked for on
26-Sep-2026: "add new module called Marketing ... and that editable thing is
apply to each and every document of each and every module".

  * Marketing (MKT) is a module of its own, SECOND in the sidebar - right
    after System / Management, where the company's Master List of Formats &
    Records puts F/MKT - with its three formats under two groups;
  * the pages supplied filled in are on file as the pages printed them:
    Pidilite's feedback of 22.01.2025, the three feedback analyses of 2025
    with their % Satisfaction Index WORKED OUT (LABELS 92%, POUCHES 89%,
    SLEEVES 83%), and the three complaint trend analyses of 2025 with their
    Paretos (the first 9 label causes cover 76.19% of the defects);
  * the analysis' totals are worked out the moment a count is typed; the
    trend's bar chart and its Pareto are drawn from the figures;
  * every supplied page can be seen as it came, and really loads;
  * THE HEADER BLOCK IS EDITABLE: on a sheet designed in place the company's
    name, the title, the format number, the revision and its date are clicked
    and typed over where they stand; on a form the program draws the same
    boxes are in the Edit format dialog - and either way the change is saved
    as a revision, shows on every record's header, and "Restore the issued
    format" brings the paper's own back;
  * Mitra opens an F/MKT format by its number.

Network-independent (Google Translate is blocked; the server has no model key).
Against the production build on :8842.
"""
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []
PREVIEW = "[data-section='document-preview']"
ORIGINAL = "[data-section='supplied-original']"
PAPER_COMPANY = "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED"

MKT_DOCS = {
    "mkt-customer-feedback": "F/MKT/01",
    "mkt-feedback-analysis": "F/MKT/02",
    "mkt-complaint-trend": "F/MKT/04",
}
SUPPLIED_PAGES = {"mkt-customer-feedback": 1, "mkt-feedback-analysis": 1, "mkt-complaint-trend": 6}


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


def open_page(page, route, settle=1500):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def record(page, rid):
    return next((r for r in records(page) if r["id"] == rid), None)


def rows_of(rec):
    return ((rec or {}).get("data") or {}).get("rows") or []


def header_of(rec):
    return ((rec or {}).get("data") or {}).get("header") or {}


def composer(page):
    return page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")


def say(page, text, wait=2500):
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(300)
    composer(page).fill(text)
    composer(page).press("Enter")
    try:
        page.wait_for_function("() => !document.querySelector('.chat-typing')", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(wait)
    msgs = page.locator(".chat-msg.bot")
    return msgs.last.inner_text() if msgs.count() else ""


def start_record(page, doc_id):
    open_page(page, f"#/document/{doc_id}")
    page.locator("[data-action='document-new-record']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1800)
    dismiss(page)
    close_assistant(page)
    return page.url.split("#/record/")[-1]


def show_originals(page):
    show = page.locator("[data-action='show-supplied-original']")
    if not show.count():
        return None
    show.first.click()
    page.wait_for_timeout(1500)
    imgs = page.locator(f"{ORIGINAL} img")
    for i in range(imgs.count()):
        imgs.nth(i).scroll_into_view_if_needed()
    page.wait_for_timeout(800)
    return imgs.evaluate_all(
        """els => els.map((el) => ({
             loaded: el.complete && el.naturalWidth > 0,
             src: el.currentSrc,
             caption: ((el.closest('figure') || {}).textContent || '').trim(),
           }))"""
    )


def header_company(page, within=""):
    el = page.locator(f"{within} .doc-header .company-name".strip())
    return el.first.text_content().strip() if el.count() else ""


def stored_doc(page, doc_id):
    """The definition as the app now holds it: the issued one with any format edit laid over (data/formatEdits.ts)."""
    return page.evaluate(
        """(id) => {
             const docs = JSON.parse(localStorage.getItem('dcrs:v1:documents') || '[]');
             const edits = JSON.parse(localStorage.getItem('dcrs:v1:formatEdits') || '{}');
             const d = docs.find((x) => x.id === id) || {};
             const e = edits[id];
             return e ? { ...d, name: e.name ?? d.name, companyName: e.companyName ?? d.companyName, formatNo: e.formatNo ?? d.formatNo, revisionNo: e.revisionNo, revisionDate: e.revisionDate, edited: true } : { ...d, edited: false };
           }""",
        doc_id,
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    email = f"mkt-{int(time.time() * 1000)}@example.com"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "Marketing Desk QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)

    # ==================================================================
    # 1. The module: second in the sidebar, its three formats, its library
    # ==================================================================
    print("\n==== The Marketing module ====")
    names = page.eval_on_selector_all(".app-sidebar .nav-module .nav-module-header", "els => els.map((e) => e.textContent.trim())")
    check("Marketing is the second module, right after System / Management, named with its code", len(names) > 1 and names[1].startswith("Marketing (MKT)"), names[:3])
    header = page.locator(".nav-module-header:has-text('Marketing')")
    if header.count() and page.locator(".nav-module:has(.nav-module-header:has-text('Marketing')) a").count() == 0:
        header.first.click()
        page.wait_for_timeout(400)
    links = page.eval_on_selector_all(".nav-module:has(.nav-module-header:has-text('Marketing')) a", "els => els.map((e) => e.getAttribute('href'))")
    check("...with its library and a link to each of the three formats", all(f"#/document/{d}" in links for d in MKT_DOCS) and "#/library/marketing" in links, links)

    open_page(page, "#/library/marketing")
    rows = page.locator(".doc-table tbody tr:not(.doc-section-row)")
    check("The Document Library, filtered to Marketing, lists its three documents", rows.count() == 3, rows.count())
    library = page.locator(".doc-table").first.inner_text()
    check("...by the format numbers the papers print", all(n in library for n in MKT_DOCS.values()), library[:300])
    sections = page.locator(".doc-table tr.doc-section-row").all_inner_texts()
    for group in ["Customer Feedback", "Customer Complaints"]:
        check(f"...under its group '{group}'", any(group.lower() in s.lower() for s in sections), sections)

    # ==================================================================
    # 2. The supplied pages, on file as the pages printed them
    # ==================================================================
    print("\n==== The pages on file ====")
    fb = record(page, "seed-mkt-feedback-pidilite-2025-01")
    h = header_of(fb)
    check("Pidilite's feedback of 22.01.2025 is on file, verified, live", bool(fb) and fb["status"] == "Verified" and fb["isDemo"] is False and h.get("organization") == "Pidilite" and h.get("date") == "2025-01-22", (fb or {}).get("status"))
    ratings = {r.get("attribute"): r.get("rating") for r in rows_of(fb)}
    check(
        "...its six ratings as ticked: Product Quality 3 Good, packaging 5 Excellent, delivery 2 Average, documents 5 Excellent, response 4 Very Good, competency 3 Good",
        ratings.get("Product Quality") == "3 Good"
        and ratings.get("Condition of packaging on receipt") == "5 Excellent"
        and ratings.get("Product Delivery - as per your requirements") == "2 Average"
        and ratings.get("Completeness of documents - Invoice, Test certificate, Packing list") == "5 Excellent"
        and ratings.get("Response time & approach to your query") == "4 Very Good"
        and ratings.get("Technical knowledge & competency") == "3 Good",
        ratings,
    )
    check("...the customer's comment, verbatim, and Satisfactory / Yes as highlighted", "Quality check needs to be more robust" in (h.get("comments") or "") and h.get("overallSatisfaction", "").startswith("Satisfactory") and h.get("associateInFuture") == "Yes", (h.get("overallSatisfaction"), h.get("associateInFuture")))

    labels = record(page, "seed-mkt-feedback-analysis-labels-2025")
    lh = header_of(labels)
    quality = next((r for r in rows_of(labels) if r.get("attribute") == "Product Quality"), {})
    check("The LABELS analysis of 2025 works out to 249 of 270 — a 92% Satisfaction Index", lh.get("averageRatingTotal") == "249" and lh.get("idealRatingTotal") == "270" and lh.get("satisfactionIndex") == "92%", (lh.get("averageRatingTotal"), lh.get("idealRatingTotal"), lh.get("satisfactionIndex")))
    check("...Product Quality: 8 rated Excellent and 1 Very Good make 44 of 45, 97.78%", quality.get("count5") == 8 and quality.get("count4") == 1 and quality.get("averageRating") == "44" and quality.get("idealRating") == "45" and quality.get("satisfiedPct") == "97.78%", quality)
    check("...the tallies of each rating, as the page prints them: 35, 17, 2 and 175, 68, 6", (lh.get("tally5"), lh.get("tally4"), lh.get("tally3"), lh.get("weighted5"), lh.get("weighted4"), lh.get("weighted3")) == ("35", "17", "2", "175", "68", "6"), lh)
    pouches = header_of(record(page, "seed-mkt-feedback-analysis-pouches-2025"))
    sleeves = record(page, "seed-mkt-feedback-analysis-sleeves-2025")
    sh = header_of(sleeves)
    delivery = next((r for r in rows_of(sleeves) if r.get("attribute") == "Product Delivery - as per your requirements"), {})
    check("POUCHES 89% (107 of 120) and SLEEVES 83% (75 of 90), from the company's own workbooks", pouches.get("satisfactionIndex") == "89%" and pouches.get("averageRatingTotal") == "107" and sh.get("satisfactionIndex") == "83%" and sh.get("idealRatingTotal") == "90", (pouches.get("satisfactionIndex"), sh.get("satisfactionIndex")))
    check("...and the sleeves' delivery, 73.33%, carries its own further action", delivery.get("satisfiedPct") == "73.33%" and delivery.get("furtherAction") == "Not needed due to fewer order qty", delivery)

    trend = record(page, "seed-mkt-complaint-trend-labels-2025")
    th = header_of(trend)
    # A box holds what was typed, as text: "1", not 1.
    check("The LABELS complaint trend: 1, 7, 6, 4, 2 complaints from December 2021 to 2025, the Total row repeating them", [str(th.get(f"complaints{i}")) for i in range(1, 6)] == ["1", "7", "6", "4", "2"] and th.get("period1") == "DEC 2021" and th.get("period5") == "CY 2025" and th.get("total1") == "1" and th.get("total5") == "2", th)
    check("...2025's complaints in June and December", str(th.get("jun")) == "1" and str(th.get("dec")) == "1" and str(th.get("jan")) == "0", (th.get("jun"), th.get("dec"), th.get("jan")))
    causes = rows_of(trend)
    check("...its Pareto: 14 causes, 21 defects, the first 9 within the 80% cut-off", len(causes) == 14 and causes[0].get("cause") == "Winding direction is in reverse" and causes[0].get("cumulativePct") == "14.3%" and sum(1 for c in causes if c.get("classification") == "Vital Few") == 9 and th.get("paretoSummary") == "The first 9 Causes cover 76.19% of the Total Defects", (len(causes), th.get("paretoSummary")))
    sleeve_trend = record(page, "seed-mkt-complaint-trend-shrink-sleeve-2025")
    check("SHRINK SLEEVE: the first 4 causes cover 78.57% — the paper says 3 and 64.29% (TBC)", header_of(sleeve_trend).get("paretoSummary") == "The first 4 Causes cover 78.57% of the Total Defects" and rows_of(sleeve_trend)[0].get("cause") == "Prinint issue", header_of(sleeve_trend).get("paretoSummary"))
    pouch_trend = header_of(record(page, "seed-mkt-complaint-trend-laminated-pouch-2025"))
    check("LAMINATED POUCH: none in 2024, two in 2025, its row headed LAMINATES as the paper heads it", pouch_trend.get("period1") == "CY 2024" and str(pouch_trend.get("complaints1")) == "0" and str(pouch_trend.get("complaints2")) == "2" and pouch_trend.get("seriesName") == "LAMINATES", pouch_trend)

    # ==================================================================
    # 3. Drawn as the paper draws it: worked-out boxes as text, the charts
    # ==================================================================
    print("\n==== The sheets on screen ====")
    open_page(page, "#/record/seed-mkt-feedback-analysis-labels-2025", settle=2000)
    check("The analysis is headed with the company's name as the paper prints it — PRINT PACK, two words", header_company(page) == PAPER_COMPANY, header_company(page))
    index_box = page.locator("[data-computed='satisfactionIndex']")
    check("Its % Satisfaction Index is text, 92%, with no box to type it into", index_box.count() == 1 and index_box.first.inner_text().strip() == "92%" and page.locator("input[data-computed]").count() == 0, index_box.all_inner_texts())
    open_page(page, "#/record/seed-mkt-complaint-trend-labels-2025", settle=2000)
    bars = page.locator("[data-chart='bars'] .bar")
    check("The complaint trend's bar chart has one bar per year written — five", bars.count() == 5, bars.count())
    pareto_bars = page.locator("[data-chart='pareto'] .bar")
    check("...and its Pareto one bar per cause — fourteen, nine of them the Vital Few, with the cut-off line at 80%", pareto_bars.count() == 14 and page.locator("[data-chart='pareto'] .bar[data-vital='true']").count() == 9 and page.locator("[data-chart='pareto'] .cutoff[data-cutoff='80']").count() == 1, (pareto_bars.count(), page.locator("[data-chart='pareto'] .bar[data-vital='true']").count()))

    # ==================================================================
    # 4. Every supplied page, beside its form
    # ==================================================================
    print("\n==== The supplied pages, beside their forms ====")
    for doc_id, count in SUPPLIED_PAGES.items():
        open_page(page, f"#/document/{doc_id}", settle=1200)
        shown = show_originals(page) or []
        check(f"{MKT_DOCS[doc_id]}: its {count} supplied page(s) can be seen, each captioned, and they load", len(shown) == count and all(s["loaded"] for s in shown) and all(s["caption"] for s in shown), [(s["src"].split("/")[-1], s["loaded"]) for s in shown])

    # ==================================================================
    # 5. Worked out the moment a count is typed
    # ==================================================================
    print("\n==== A new analysis works itself out ====")
    rid = start_record(page, "mkt-feedback-analysis")
    first = page.locator("table.log-sheet tbody tr").first
    counts = first.locator("input[type='number']")
    if counts.count() >= 2:
        counts.nth(0).fill("8")
        counts.nth(1).fill("1")
        counts.nth(1).press("Tab")
        page.wait_for_timeout(1500)
    fresh = record(page, rid)
    row = rows_of(fresh)[:1]
    fh = header_of(fresh)
    check("8 Excellent and 1 Very Good on the first line give 44 of 45, 97.78% — and a 98% index for the one line written", bool(row) and row[0].get("averageRating") == "44" and row[0].get("idealRating") == "45" and row[0].get("satisfiedPct") == "97.78%" and fh.get("satisfactionIndex") == "98%", (row, fh.get("satisfactionIndex")))
    check("...shown as text on the sheet", page.locator("[data-computed='satisfactionIndex']").first.inner_text().strip() == "98%", page.locator("[data-computed='satisfactionIndex']").all_inner_texts())

    # ==================================================================
    # 6. THE HEADER, DESIGNED IN PLACE on a sheet
    # ==================================================================
    print("\n==== The header block, typed over where it stands ====")
    open_page(page, "#/document/mkt-customer-feedback", settle=1500)
    check("The document page's preview is headed as the paper is", header_company(page, PREVIEW) == PAPER_COMPANY, header_company(page, PREVIEW))
    page.click("[data-action='edit-format']")
    page.wait_for_timeout(800)
    designer = page.locator("[data-section='sheet-designer']")
    check("Edit format opens the sheet itself", designer.count() == 1)
    page.click("[data-action='rename-company']")
    box = page.locator("[data-field='designer-companyName']")
    check("The company's name on the header is clicked and becomes a box, holding the printed name", box.count() == 1 and box.first.input_value() == PAPER_COMPANY, box.first.input_value() if box.count() else None)
    NEW_COMPANY = "GUJARAT PRINT PACK PUBLICATIONS PVT. LTD."
    box.first.fill(NEW_COMPANY)
    box.first.press("Enter")
    page.wait_for_timeout(300)
    check("...typed over, the header reads the new name at once", header_company(page, "[data-section='sheet-designer']") == NEW_COMPANY, header_company(page, "[data-section='sheet-designer']"))
    page.click("[data-action='rename-revision-date']")
    date_box = page.locator("[data-field='designer-revisionDate']")
    check("The date on the header is a date box", date_box.count() == 1 and date_box.first.get_attribute("type") == "date")
    date_box.first.fill("2026-09-01")
    date_box.first.press("Enter")
    page.wait_for_timeout(300)
    page.click("[data-action='rename-format-no']")
    no_box = page.locator("[data-field='designer-formatNo']")
    check("The format number is clicked and typed over too", no_box.count() == 1 and no_box.first.input_value() == "F/MKT/01")
    no_box.first.press("Escape")
    page.wait_for_timeout(200)
    header_text = designer.locator(".doc-header").inner_text()
    check("The designer's header shows the new name and 01-Sep-2026, and the number unchanged", NEW_COMPANY in header_text and "01-Sep-2026" in header_text and "F/MKT/01" in header_text, header_text)
    check("The save button is live: something has changed", page.locator("[data-action='designer-save']").is_enabled())
    page.click("[data-action='designer-save']")
    page.wait_for_timeout(500)
    dialog = page.locator("[data-section='designer-save-dialog']")
    check("Saving says what changed, in words: the company name and the date", dialog.count() == 1 and "company name" in dialog.inner_text() and "01-Sep-2026" in dialog.inner_text(), dialog.inner_text()[:300] if dialog.count() else None)
    page.fill("[data-field='designer-reason']", "The registered name is printed in full on the letterhead")
    page.click("[data-action='designer-confirm-save']")
    page.wait_for_timeout(800)
    saved = page.locator("[data-section='designer-saved']")
    check("...and is saved as the next revision", saved.count() == 1 and "02" in saved.inner_text(), saved.inner_text()[:200] if saved.count() else None)
    if page.locator("[data-action='designer-saved-close']").count():
        page.click("[data-action='designer-saved-close']")
        page.wait_for_timeout(600)
    d = stored_doc(page, "mkt-customer-feedback")
    check("The format now carries the new company name, Rev 02 dated 01-Sep-2026 — its number untouched", d.get("companyName") == NEW_COMPANY and d.get("revisionNo") == "02" and d.get("revisionDate") == "2026-09-01" and d.get("formatNo") == "F/MKT/01", d)
    open_page(page, "#/record/seed-mkt-feedback-pidilite-2025-01", settle=1500)
    check("Pidilite's record is headed with the new name and Rev 02 — its own date kept", header_company(page) == NEW_COMPANY and "02" in page.locator(".doc-header").inner_text() and "22-Jan-2025" in page.locator(".doc-header").inner_text(), page.locator(".doc-header").inner_text())
    # Back to the paper's own: the designer's dialog restores the issued format.
    open_page(page, "#/document/mkt-customer-feedback", settle=1200)
    page.click("[data-action='edit-format']")
    page.wait_for_timeout(600)
    page.click("[data-action='designer-more']")
    page.wait_for_timeout(500)
    restore = page.locator("[data-action='restore-format']")
    check("The format's dialog offers to restore the issued format", restore.count() == 1)
    if restore.count():
        restore.first.click()
        page.wait_for_timeout(800)
    d2 = stored_doc(page, "mkt-customer-feedback")
    check("Restored, the header is the paper's again: PRINT PACK, Rev 01 of 01-Dec-2021", d2.get("companyName") == PAPER_COMPANY and d2.get("revisionNo") == "01" and d2.get("revisionDate") == "2021-12-01" and d2.get("edited") is False, d2)

    # ==================================================================
    # 7. THE HEADER, IN THE DIALOG on a form the program draws
    # ==================================================================
    print("\n==== The header of a form the program draws ====")
    open_page(page, "#/document/daily-pest-monitoring", settle=1500)
    page.click("[data-action='edit-format']")
    page.wait_for_timeout(600)
    editor = page.locator("[data-section='format-editor']")
    fields = [page.locator(f"[data-field='{f}']").count() for f in ("format-company", "format-number", "format-revision-date")]
    check("Edit format on the Daily Report opens the dialog with the company name, the format number and the revision date", editor.count() == 1 and fields == [1, 1, 1], fields)
    DAILY_COMPANY = "GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED, MEHSANA"
    page.fill("[data-field='format-company']", DAILY_COMPANY)
    page.fill("[data-field='format-reason']", "The header is to carry the plant's place")
    page.click("[data-action='save-format']")
    page.wait_for_timeout(1000)
    dd = stored_doc(page, "daily-pest-monitoring")
    check("Saved as the next revision with the new company name", dd.get("companyName") == DAILY_COMPANY and dd.get("edited") is True, dd)
    daily = next((r for r in records(page) if r["documentId"] == "daily-pest-monitoring"), None)
    if daily:
        open_page(page, f"#/record/{daily['id']}", settle=1500)
        check("A Daily Report record is headed with the new name", header_company(page) == DAILY_COMPANY, header_company(page))
    else:
        check("A Daily Report record is headed with the new name", False, "no daily record on file to open")
    open_page(page, "#/document/daily-pest-monitoring", settle=1200)
    page.click("[data-action='edit-format']")
    page.wait_for_timeout(600)
    if page.locator("[data-action='restore-format']").count():
        page.click("[data-action='restore-format']")
        page.wait_for_timeout(800)
    check("...and restored, the issued header is back", stored_doc(page, "daily-pest-monitoring").get("edited") is False and not stored_doc(page, "daily-pest-monitoring").get("companyName"), stored_doc(page, "daily-pest-monitoring"))

    # ==================================================================
    # 8. Mitra knows the formats by their numbers
    # ==================================================================
    print("\n==== Mitra ====")
    open_page(page, "#/dashboard", settle=800)
    say(page, "open f/mkt/04")
    page.wait_for_timeout(1200)
    check("Told to open F/MKT/04, Mitra opens the Customer Complaints Trend Analysis", "#/document/mkt-complaint-trend" in page.url, page.url)
    reply = say(page, "what is F/MKT/02?")
    check("Asked what F/MKT/02 is, Mitra names the Customer Feedback analysis", "Customer Feedback analysis" in reply, reply[:300])
    close_assistant(page)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nMarketing holds its three formats as the company issued them, their figures worked out and drawn, and every format's header is the plant's to change.")
