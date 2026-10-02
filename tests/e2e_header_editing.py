"""The header block, typed over where it stands, on every document (REQUIREMENTS s86).

Asked for on 02-Oct-2026, of a record's header (company, title, Format No.,
Rev No., Date, Page No.): "make it editable, and that is applicable to each and
every document of every module". So this suite checks, against the demo build
on :8842, that:

  * on a log sheet's record, the record's own Date and Page No. are clicked and
    typed over: saved on that record alone, in its history, kept on a reload;
  * the format's own cells - the company, the title, the number, the revision -
    are clicked and typed over too, but the page asks why first: saving makes
    the next revision, in the format's change history, the header alone (no
    copy of the sheet's layout); "Keep the header as it is" changes nothing; a
    revision number typed alone is a re-issue;
  * the document's own page shows the format as changed, and its preview of the
    latest record is not itself typed over;
  * a submitted record's own Date and Page No. take no click, its format's cells
    still do; Edit reopens them, and Cancel edit puts the header back;
  * a page kept on a superseded revision (F/MNT/11's 2024 round, Rev 00) takes
    no click anywhere on its header;
  * the program-drawn forms take it too: the daily pest monitoring record (its
    Date cell is the format's revision date), the F/HR/17 and F/HR/18 registers
    (their first page's header), and the customer complaint checklist.
"""
import re
import sys
from datetime import date, datetime, timedelta
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
FAILURES = []
# The account the assistant-fill suite signs up (the server limits sign-ups per network).
ACCOUNT = ("fill-suite@example.com", "PlaywrightQA123", "Fill QA")
DOC = "qc-incoming-lamination-film"
HEADER = """() => Object.fromEntries(Array.from(document.querySelectorAll('[data-print-doc] .doc-header .meta-cell'))
  .map((c) => [(c.querySelector('.k') || {}).textContent?.trim(), (c.querySelector('.v') || {}).textContent?.trim()]))"""
HEADER_COMPANY = "() => (document.querySelector('[data-print-doc] .doc-header .company-name') || {}).textContent?.trim()"
CLICKABLE = "(sel) => document.querySelectorAll(sel).length"
# The document page's preview of its latest record: its header's cells, read exactly.
PREVIEW_HEADER = HEADER.replace("[data-print-doc] .doc-header", '[data-section="document-preview"] .doc-header')


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


def open_page(page, route, settle=1100):
    page.goto(f"{BASE}/index.html{route if route.startswith('#') else '#' + route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def record_by_id(page, rid):
    return next((r for r in records(page) if r["id"] == rid), None)


def format_edit(page, doc_id):
    return page.evaluate("(id) => (JSON.parse(localStorage.getItem('dcrs:v1:formatEdits') || '{}'))[id] || null", doc_id)


def header(page):
    return page.evaluate(HEADER)


def clickable(page, action):
    return page.evaluate(CLICKABLE, f"[data-print-doc] .doc-header [data-action='{action}']")


def type_over(page, action, field, value):
    """Click a header value and type over it; Enter keeps it."""
    page.locator(f"[data-print-doc] .doc-header [data-action='{action}']").first.click()
    page.wait_for_timeout(250)
    box = page.locator(f"[data-field='{field}']")
    initial = box.first.input_value() if box.count() else None
    if box.count():
        box.first.fill(value)
        box.first.press("Enter")
        page.wait_for_timeout(700)
    return initial


def say(page, text, wait=1600):
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(300)
    box = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
    box.fill(text)
    box.press("Enter")
    page.wait_for_timeout(wait)
    bots = page.locator(".chat-msg.bot")
    return bots.last.inner_text() if bots.count() else ""


def shown_date(iso):
    return datetime.strptime(iso, "%Y-%m-%d").strftime("%d-%b-%Y")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    page.fill("#login-email", ACCOUNT[0])
    page.fill("#login-password", ACCOUNT[1])
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    if page.locator(".app-sidebar").count() == 0:
        page.click("text=Sign up")
        page.wait_for_timeout(200)
        page.fill("#signup-name", ACCOUNT[2])
        page.fill("#signup-email", ACCOUNT[0])
        page.fill("#signup-password", ACCOUNT[1])
        page.fill("#signup-confirm", ACCOUNT[1])
        page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(800)
    dismiss(page)

    # ==================================================================
    print("\n==== A log sheet's record: its own Date and Page No. ====")
    # ==================================================================
    open_page(page, "#/library")
    new_button = page.locator(f"[data-action='new-record'][data-document='{DOC}']")
    if new_button.count() == 0:
        # Reported, not timed out on: what the library shows instead (a failing check must say why).
        shown = page.eval_on_selector_all("[data-action='new-record']", "els => els.map((e) => e.dataset.document)")
        print("     library at", page.url, "offers New on", len(shown), "documents:", shown[-8:])
        print("     page text:", page.locator(".app-content").inner_text()[:400].replace("\n", " | ") if page.locator(".app-content").count() else page.content()[:400])
    check("The Document Library offers New on F/QC/33", new_button.count() >= 1)
    new_button.first.evaluate("el => el.click()")
    page.wait_for_timeout(1400)
    dismiss(page)
    close_assistant(page)
    rid = page.url.rstrip("/").split("/")[-1]
    rec = record_by_id(page, rid) or {}
    check("New on F/QC/33 opens its record", "#/record/" in page.url and rec.get("documentId") == DOC, page.url)
    offered = {a: clickable(page, a) for a in ("rename-company", "rename-title", "rename-format-no", "rename-revision", "rename-record-date", "rename-page-no")}
    check("Its header offers every value to be typed over: the company, the title, the number, the revision, the Date and the Page No.", all(n == 1 for n in offered.values()), offered)
    before = header(page)
    check("...headed as the paper is: F/QC/33, Rev 00, the record's date, 1 of 1 (digital)",
          before.get("Format No.") == "F/QC/33" and before.get("Rev No.") == "00" and before.get("Date") == shown_date(rec.get("dueDate", "2000-01-01")) and before.get("Page No.") == "1 of 1 (digital)", before)

    initial = type_over(page, "rename-page-no", "header-page", "1 of 2")
    check("The Page No. is clicked and becomes a box, holding what the header prints", initial == "1 of 1 (digital)", initial)
    now = header(page)
    rec = record_by_id(page, rid) or {}
    check("...typed over, the header prints 1 of 2", now.get("Page No.") == "1 of 2", now)
    check("...saved on the record alone, beside its boxes", (rec.get("headerBlock") or {}).get("page") == "1 of 2" and "headerBlock" not in (rec.get("data") or {}), rec.get("headerBlock"))
    last = (rec.get("history") or [{}])[-1]
    lines = [(c.get("label"), c.get("before"), c.get("after")) for c in last.get("changes") or []]
    check("...with a line in its history naming what the header said before and after", ("Header · Page No.", "1 of 1 (digital)", "1 of 2") in lines, last)

    due = rec.get("dueDate", date.today().isoformat())
    written = (datetime.strptime(due, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    page.locator("[data-print-doc] .doc-header [data-action='rename-record-date']").first.click()
    page.wait_for_timeout(250)
    date_box = page.locator("[data-field='header-date']")
    check("The Date is a date box", date_box.count() == 1 and date_box.first.get_attribute("type") == "date")
    if date_box.count():
        date_box.first.fill(written)
        date_box.first.press("Enter")
        page.wait_for_timeout(700)
    check("...typed over, the header prints the day before the record's own", header(page).get("Date") == shown_date(written), header(page))
    page.reload()
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    again = header(page)
    check("Both are kept: the page read again prints them", again.get("Date") == shown_date(written) and again.get("Page No.") == "1 of 2", again)

    # ==================================================================
    print("\n==== The format's own header: asked why, then the next revision ====")
    # ==================================================================
    initial = type_over(page, "rename-format-no", "header-formatNo", "F/QC/33-A")
    panel = page.locator("[data-section='header-change']")
    check("The format number is clicked and typed over, holding F/QC/33", initial == "F/QC/33", initial)
    check("...and the page asks why before anything is saved, saying it becomes Rev 01",
          panel.count() == 1 and "Rev 01" in panel.inner_text() and header(page).get("Format No.") == "F/QC/33" and format_edit(page, DOC) is None,
          panel.inner_text() if panel.count() else None)
    page.click("[data-action='header-change-save']")
    page.wait_for_timeout(400)
    err = page.locator("[data-section='header-change-error']")
    check("Saved without a reason, it is refused and nothing is saved", err.count() == 1 and format_edit(page, DOC) is None, err.inner_text() if err.count() else None)
    page.fill("[data-field='header-change-reason']", "The master list numbers it F/QC/33-A")
    page.click("[data-action='header-change-save']")
    page.wait_for_timeout(900)
    now = header(page)
    edit = format_edit(page, DOC) or {}
    check("With a reason it is saved: F/QC/33-A, Rev 01", panel.count() == 0 and now.get("Format No.") == "F/QC/33-A" and now.get("Rev No.") == "01", now)
    check("...in the format's change history, with the reason",
          edit.get("formatNo") == "F/QC/33-A" and (edit.get("revisions") or [{}])[0].get("reason") == "The master list numbers it F/QC/33-A", edit)
    check("...the header alone - no copy of the sheet's layout", not edit.get("layout"), list(edit.keys()))
    check("...and the record keeps its own Date and Page No.", now.get("Date") == shown_date(written) and now.get("Page No.") == "1 of 2", now)

    company = page.evaluate(HEADER_COMPANY)
    type_over(page, "rename-company", "header-companyName", "SOMEBODY ELSE PVT. LTD.")
    check("The company's name typed over asks why too", panel.count() == 1)
    page.click("[data-action='header-change-cancel']")
    page.wait_for_timeout(400)
    check("'Keep the header as it is' changes nothing", panel.count() == 0 and page.evaluate(HEADER_COMPANY) == company and len((format_edit(page, DOC) or {}).get("revisions") or []) == 1,
          page.evaluate(HEADER_COMPANY))

    initial = type_over(page, "rename-revision", "header-revisionNo", "02")
    check("The revision number is typed over, holding 01", initial == "01", initial)
    check("...and saving it alone is a re-issue as Rev 02", panel.count() == 1 and "Save as Rev 02" in panel.inner_text(), panel.inner_text() if panel.count() else None)
    page.fill("[data-field='header-change-reason']", "Re-issued after the audit")
    page.click("[data-action='header-change-save']")
    page.wait_for_timeout(900)
    edit = format_edit(page, DOC) or {}
    check("...saved as Rev 02, described as a re-issue", header(page).get("Rev No.") == "02" and (edit.get("revisions") or [{}])[0].get("summary") == "re-issued as Rev 02", edit.get("revisions"))

    open_page(page, f"#/document/{DOC}", settle=1300)
    preview = page.evaluate(PREVIEW_HEADER)
    check("The document's own page is headed F/QC/33-A, Rev 02", preview.get("Format No.") == "F/QC/33-A" and preview.get("Rev No.") == "02", preview)
    check("...and its preview of the latest record is not typed over there", page.evaluate(CLICKABLE, ".doc-header [data-action^='rename-']") == 0)

    # ==================================================================
    print("\n==== A submitted record, and Edit then Cancel edit ====")
    # ==================================================================
    open_page(page, f"#/record/{rid}", settle=1300)
    reply = say(page, "fill it with sample data")
    close_assistant(page)
    page.wait_for_timeout(500)
    page.locator("[data-action='submit']").first.click()
    page.wait_for_timeout(1300)
    dismiss(page)
    rec = record_by_id(page, rid) or {}
    check("Filled with sample data and submitted", rec.get("status") in ("Submitted", "Pending Verification"), (rec.get("status"), reply[:200]))
    check("...its own Date and Page No. take no click once submitted", clickable(page, "rename-page-no") == 0 and clickable(page, "rename-record-date") == 0)
    check("...its format's cells still do - they are the format's, not the record's", clickable(page, "rename-format-no") == 1)
    page.locator("[data-action='correct']").first.click()
    page.wait_for_timeout(400)
    page.fill("[data-field='correction-reason']", "The page number was wrong")
    page.click("[data-action='confirm-correct']")
    page.wait_for_timeout(1000)
    check("Edit reopens them", clickable(page, "rename-page-no") == 1)
    type_over(page, "rename-page-no", "header-page", "2 of 2")
    check("...and the Page No. is typed over again", header(page).get("Page No.") == "2 of 2", header(page))
    page.locator("[data-action='cancel-correction']").first.click()
    page.wait_for_timeout(400)
    page.click("[data-action='confirm-cancel-correction']")
    page.wait_for_timeout(1000)
    rec = record_by_id(page, rid) or {}
    check("Cancel edit puts the header back as it was when Edit reopened it", header(page).get("Page No.") == "1 of 2" and (rec.get("headerBlock") or {}).get("page") == "1 of 2" and rec.get("status") in ("Submitted", "Pending Verification"),
          (header(page), rec.get("status")))

    # ==================================================================
    print("\n==== A page of the past, and the forms the program draws ====")
    # ==================================================================
    open_page(page, "#/record/seed-mnt-lux-2024", settle=1300)
    check("F/MNT/11's 2024 round, kept on Rev 00, takes no click anywhere on its header",
          page.locator("[data-revision='00']").count() >= 1 and page.evaluate(CLICKABLE, ".doc-header [data-action^='rename-']") == 0)

    # The register's own page first: opening it files the month's daily records, if nothing has yet.
    open_page(page, "#/pest/daily", settle=1500)
    check("The F/HR/17 register: its first page's header is typed over, the other two repeat it",
          page.evaluate(CLICKABLE, ".register-sheet [data-action='rename-format-no']") == 1 and page.evaluate(CLICKABLE, ".register-sheet .doc-header") == 3)
    daily = next((r for r in records(page) if r["documentId"] == "daily-pest-monitoring" and not r.get("isDemo") and r["status"] in ("Due", "In Progress", "Scheduled")), None)
    if daily:
        open_page(page, f"#/record/{daily['id']}", settle=1300)
        check("The daily pest monitoring record: its Page No. is its own, its Date cell is the format's revision date",
              clickable(page, "rename-page-no") == 1 and clickable(page, "rename-revision-date") == 1 and clickable(page, "rename-record-date") == 0)
        type_over(page, "rename-page-no", "header-page", "1 of 1")
        stored = record_by_id(page, daily["id"]) or {}
        check("...typed over, saved on that day's record", (stored.get("headerBlock") or {}).get("page") == "1 of 1", stored.get("headerBlock"))
    else:
        check("A daily pest monitoring record is on file to open", False, [r["status"] for r in records(page) if r["documentId"] == "daily-pest-monitoring"][:5])

    open_page(page, "#/pest/trend/fly-catcher", settle=1500)
    check("The F/HR/18 register: its first page's header too",
          page.evaluate(CLICKABLE, ".fhr18-sheet [data-action='rename-format-no']") == 1 and page.evaluate(CLICKABLE, ".fhr18-sheet .doc-header") == 2)

    open_page(page, "#/library")
    page.locator("[data-action='new-record'][data-document='capa-customer-complaint']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    cid = page.url.rstrip("/").split("/")[-1]
    check("The customer complaint checklist: its Date and Page No. are its own too",
          "/gap/complaint/" in page.url and clickable(page, "rename-page-no") == 1 and clickable(page, "rename-record-date") == 1, page.url)
    type_over(page, "rename-page-no", "header-page", "1 of 3")
    check("...typed over, saved on the checklist", ((record_by_id(page, cid) or {}).get("headerBlock") or {}).get("page") == "1 of 3")

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe header block is typed over where it stands, on every document - the format's under document control, the record's on the record.")
