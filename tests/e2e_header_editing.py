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
    Page No. a page number only), the F/HR/17 and F/HR/18 registers (their
    first page's header), and the customer complaint checklist.

Since 16-Oct-2026 (REQUIREMENTS s117) the header has NO Date cell of the
record's own: it prints the paper's cells, Format No. | Rev No. | Rev Date |
Page No., and only the Page No. is the record's to type over.
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
# A framed QC paper (data/seed/qcPageFrames.ts, s117) prints no header block: the logo and the title in a band, and the
# Format number, Rev. no., Rev. date and Page in a bordered line at the foot of the page, as the owner's PDFs do.
HEADER = """() => {
  const cells = Array.from(document.querySelectorAll('[data-print-doc] .doc-header .meta-cell'));
  if (cells.length) return Object.fromEntries(cells.map((c) => [(c.querySelector('.k') || {}).textContent?.trim(), (c.querySelector('.v') || {}).textContent?.trim()]));
  const foot = document.querySelector('[data-print-doc] .page-foot');
  const m = foot && /Format number:\\s*-\\s*(.+?)\\s*\\(\\s*(.+?)\\s*\\/\\s*(.+?)\\s*\\)\\s*Page\\s+(.+)$/.exec(foot.textContent.replace(/\\s+/g, ' ').trim());
  return m ? { 'Format No.': m[1], 'Rev No.': m[2], 'Rev Date': m[3], 'Page No.': m[4] } : {};
}"""
HEADER_COMPANY = "() => (document.querySelector('[data-print-doc] .doc-header .company-name') || {}).textContent?.trim()"
HEADER_TITLE = "() => (document.querySelector('[data-print-doc] .doc-header .dhf-title, [data-print-doc] .doc-header .doc-title') || {}).textContent?.trim()"
# Where a cell of the header is clicked: the header block, or on a framed paper the head's title and the foot's line.
HEAD = "[data-print-doc] :is(.doc-header, .page-foot)"
CLICKABLE = "(sel) => document.querySelectorAll(sel).length"
# The document page's preview of its latest record: its header's cells, read exactly.
PREVIEW_HEADER = HEADER.replace("[data-print-doc]", '[data-section="document-preview"]')


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


def sure(page, yes=True, timeout=2500):
    """Answers the question every change to what a form prints asks first (REQUIREMENTS s138): "Yes, I am sure" or
    "No". Returns what the question said, or None when nothing was asked."""
    button = f"[data-action='{'sure-yes' if yes else 'sure-no'}']"
    try:
        page.wait_for_selector(button, state="visible", timeout=timeout)
    except Exception:
        return None
    said = page.locator("[data-section='sure-first']").inner_text()
    # The revision offered in its box (REQUIREMENTS s148), said with the question's words.
    offered = page.locator("[data-section='sure-first'] [data-field='revision-no']")
    if offered.count():
        said += " | Rev " + offered.input_value() + " offered"
    page.click(button)
    page.wait_for_timeout(400)
    return said


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
    return page.evaluate(CLICKABLE, f"{HEAD} [data-action='{action}']")


def type_over(page, action, field, value, yes=True):
    """Click a header value and type over it; Enter keeps it - asked first where it changes the record at once (s138)."""
    page.locator(f"{HEAD} [data-action='{action}']").first.click()
    page.wait_for_timeout(250)
    box = page.locator(f"[data-field='{field}']")
    initial = box.first.input_value() if box.count() else None
    if box.count():
        box.first.fill(value)
        box.first.press("Enter")
        page.wait_for_timeout(700)
        sure(page, yes, timeout=600)
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
    return datetime.strptime(iso, "%Y-%m-%d").strftime("%d-%m-%y")


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
    offered = {a: clickable(page, a) for a in ("rename-company", "rename-title", "rename-format-no", "rename-revision", "rename-revision-date", "rename-page-no")}
    # The paper's head is the logo (which carries the company's name) and the title; its foot line holds the number, revision, date and Page.
    check("Its header offers every value to be typed over: the title in the head, the number, the revision, its date and the Page No. in the foot line (the company is the logo's picture on the paper, with no text to type over)",
          all(n == 1 for a, n in offered.items() if a != "rename-company") and offered["rename-company"] == 0, offered)
    # The DATE cell DCRS added for the record's own date is gone (REQUIREMENTS s117, the owner, 16-Oct-2026).
    check("...and no Date cell of the record's own: the header is the paper's", clickable(page, "rename-record-date") == 0 and "Date" not in header(page), header(page))
    before = header(page)
    check("...footed as the paper is: F/QC/33 (00 / 15.12.2024), Page 1 of 1",
          before.get("Format No.") == "F/QC/33" and before.get("Rev No.") == "00" and before.get("Rev Date") == "15.12.2024" and before.get("Page No.") == "1 of 1"
          and list(before.keys()) == ["Format No.", "Rev No.", "Rev Date", "Page No."], before)

    type_over(page, "rename-page-no", "header-page", "1 of 3", yes=False)
    check("The Page No. typed over is asked about first (REQUIREMENTS s138); No keeps the header's 1 of 1",
          header(page).get("Page No.") == "1 of 1" and not ((record_by_id(page, rid) or {}).get("headerBlock") or {}).get("page"), header(page))
    initial = type_over(page, "rename-page-no", "header-page", "1 of 2")
    check("The Page No. is clicked and becomes a box, holding what the header prints", initial == "1 of 1", initial)
    now = header(page)
    rec = record_by_id(page, rid) or {}
    check("...typed over, the header prints 1 of 2", now.get("Page No.") == "1 of 2", now)
    check("...saved on the record alone, beside its boxes", (rec.get("headerBlock") or {}).get("page") == "1 of 2" and "headerBlock" not in (rec.get("data") or {}), rec.get("headerBlock"))
    last = (rec.get("history") or [{}])[-1]
    lines = [(c.get("label"), c.get("before"), c.get("after")) for c in last.get("changes") or []]
    check("...with a line in its history naming what the header said before and after", ("Header · Page No.", "1 of 1", "1 of 2") in lines, last)

    page.reload()
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    again = header(page)
    check("It is kept: the page read again prints it, and still no Date cell", again.get("Page No.") == "1 of 2" and "Date" not in again, again)

    # ==================================================================
    print("\n==== The format's own header: asked why, then the next revision ====")
    # ==================================================================
    initial = type_over(page, "rename-format-no", "header-formatNo", "F/QC/33-A")
    panel = page.locator("[data-section='header-change']")
    check("The format number is clicked and typed over, holding F/QC/33", initial == "F/QC/33", initial)
    # The panel asks why, and which revision (the owner, 30/31-Oct-2026, s148): a new one - Rev 01 and today in boxes - or none.
    panel_no = panel.locator("[data-field='revision-no']")
    check("...and the page asks why and which revision before anything is saved: a new one, Rev 01 in its box, or none",
          panel.count() == 1 and panel_no.count() == 1 and panel_no.input_value() == "01" and panel.locator("[data-choice='revision-keep']").count() == 1
          and header(page).get("Format No.") == "F/QC/33" and format_edit(page, DOC) is None,
          panel.inner_text() if panel.count() else None)
    page.click("[data-action='header-change-save']")
    page.wait_for_timeout(400)
    err = page.locator("[data-section='header-change-error']")
    check("Saved without a reason, it is refused and nothing is saved", err.count() == 1 and format_edit(page, DOC) is None, err.inner_text() if err.count() else None)
    page.fill("[data-field='header-change-reason']", "The master list numbers it F/QC/33-A")
    page.click("[data-action='header-change-save']")
    asked = sure(page, yes=False)
    check("With a reason, Save asks first: Are you sure? - naming Rev 01 - and No saves nothing, the panel still open (REQUIREMENTS s138, s148)",
          bool(asked) and "Are you sure?" in asked and "Rev 01" in asked and format_edit(page, DOC) is None and panel.count() == 1, asked)
    page.click("[data-action='header-change-save']")
    check("...asked again, Yes, I am sure", bool(sure(page)))
    page.wait_for_timeout(900)
    now = header(page)
    edit = format_edit(page, DOC) or {}
    check("With a reason it is saved: F/QC/33-A, Rev 01", panel.count() == 0 and now.get("Format No.") == "F/QC/33-A" and now.get("Rev No.") == "01", now)
    check("...in the format's change history, with the reason",
          edit.get("formatNo") == "F/QC/33-A" and (edit.get("revisions") or [{}])[0].get("reason") == "The master list numbers it F/QC/33-A", edit)
    check("...the header alone - no copy of the sheet's layout", not edit.get("layout"), list(edit.keys()))
    check("...and the record keeps its own Page No.", now.get("Page No.") == "1 of 2", now)

    # F/QC/33's head is the logo and the title: the title is the format's cell typed over here (the daily pest record below keeps a header block, and its company cell is typed over there).
    title_was = page.evaluate(HEADER_TITLE)
    type_over(page, "rename-title", "header-title", "SOMETHING ELSE")
    check("The title typed over asks why too", panel.count() == 1)
    page.click("[data-action='header-change-cancel']")
    page.wait_for_timeout(400)
    check("'Keep the header as it is' changes nothing", panel.count() == 0 and page.evaluate(HEADER_TITLE) == title_was and len((format_edit(page, DOC) or {}).get("revisions") or []) == 1,
          page.evaluate(HEADER_TITLE))
    # SAVED WITHOUT A NEW REVISION (the owner, 30-Oct-2026, s148): the format keeps its number and its date.
    type_over(page, "rename-title", "header-title", "SOMETHING ELSE")
    page.fill("[data-field='header-change-reason']", "A word mended")
    page.click("[data-section='header-change'] [data-choice='revision-keep']")
    page.click("[data-action='header-change-save']")
    kept_asked = sure(page)
    check("...the question names the revision kept", bool(kept_asked) and "keeps Rev 01" in kept_asked, kept_asked)
    page.wait_for_timeout(900)
    edit = format_edit(page, DOC) or {}
    latest = (edit.get("revisions") or [{}])[0]
    check("A change saved without a new revision keeps Rev 01 and its date, its history saying so (s148)",
          header(page).get("Rev No.") == "01" and edit.get("revisionNo") == "01" and "saved without a new revision" in (latest.get("summary") or ""), (header(page), latest))

    initial = type_over(page, "rename-revision", "header-revisionNo", "02")
    check("The revision number is typed over, holding 01", initial == "01", initial)
    check("...and saving it alone is a re-issue as Rev 02", panel.count() == 1 and "Save as Rev 02" in panel.inner_text(), panel.inner_text() if panel.count() else None)
    page.fill("[data-field='header-change-reason']", "Re-issued after the audit")
    page.click("[data-action='header-change-save']")
    sure(page)
    page.wait_for_timeout(900)
    edit = format_edit(page, DOC) or {}
    check("...saved as Rev 02, described as a re-issue", header(page).get("Rev No.") == "02" and (edit.get("revisions") or [{}])[0].get("summary") == "re-issued as Rev 02", edit.get("revisions"))

    open_page(page, f"#/document/{DOC}", settle=1300)
    preview = page.evaluate(PREVIEW_HEADER)
    check("The document's own page is headed F/QC/33-A, Rev 02", preview.get("Format No.") == "F/QC/33-A" and preview.get("Rev No.") == "02", preview)
    check("...and its preview of the latest record is not typed over there", page.evaluate(CLICKABLE, ":is(.doc-header, .page-foot) [data-action^='rename-']") == 0)

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
    check("...its own Page No. takes no click once submitted", clickable(page, "rename-page-no") == 0)
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
    # The month after its title stays while the title's box is open (the owner, 31-Oct-2026, s155: "October 2026 is wipe
    # out"), and its revision's date prints the whole year ("not 21 it should be like 2021").
    reg_title = page.locator(".register-sheet .doc-header .doc-title").first
    month_words = reg_title.locator("[data-title-after]").inner_text().strip() if reg_title.locator("[data-title-after]").count() else ""
    rev_words = page.locator(".register-sheet .doc-header [data-meta='revision-date'] .v").first.inner_text().strip() if page.locator(".register-sheet .doc-header [data-meta='revision-date'] .v").count() else ""
    title_btn = reg_title.locator("[data-action='rename-title']")
    if title_btn.count():
        title_btn.first.click()
        page.wait_for_timeout(400)
    still = reg_title.locator("[data-title-after]").inner_text().strip() if reg_title.locator("[data-title-after]").count() else ""
    box_open = reg_title.locator("input, textarea").count() >= 1
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    check("...its title clicked: the title's box opens and the month stays beside it; its Rev Date has the whole year",
          title_btn.count() == 1 and box_open and month_words.startswith("\u2014 ") and still == month_words and re.fullmatch(r"\d{2}-\d{2}-\d{4}", rev_words) is not None,
          (month_words, still, box_open, rev_words))
    daily = next((r for r in records(page) if r["documentId"] == "daily-pest-monitoring" and not r.get("isDemo") and r["status"] in ("Due", "In Progress", "Scheduled")), None)
    if daily:
        open_page(page, f"#/record/{daily['id']}", settle=1300)
        daily_header = header(page)
        check("The daily pest monitoring record: its Page No. is its own and a page number only (never its row of the register, s117), the Rev Date the format's",
              clickable(page, "rename-page-no") == 1 and clickable(page, "rename-revision-date") == 1 and daily_header.get("Page No.") == "1 of 1" and "Date" not in daily_header, daily_header)
        title = page.locator("[data-print-doc] .doc-header .doc-title").first.inner_text().strip()
        check("...and its title is the paper's alone, with no date after it", title == "DAILY PEST CONTROL MONITORING RECORD", title)
        company = page.evaluate(HEADER_COMPANY)
        type_over(page, "rename-company", "header-companyName", "SOMEBODY ELSE PVT. LTD.")
        asked = panel.count() == 1
        page.click("[data-action='header-change-cancel']")
        page.wait_for_timeout(400)
        check("...a header block's company name typed over asks why, and 'Keep the header as it is' changes nothing",
              asked and panel.count() == 0 and page.evaluate(HEADER_COMPANY) == company, (asked, page.evaluate(HEADER_COMPANY), company))
        type_over(page, "rename-page-no", "header-page", "1 of 3")
        stored = record_by_id(page, daily["id"]) or {}
        check("...typed over, saved on that day's record", (stored.get("headerBlock") or {}).get("page") == "1 of 3", stored.get("headerBlock"))
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
    check("The customer complaint checklist: its Page No. is its own too, and no Date cell",
          "/gap/complaint/" in page.url and clickable(page, "rename-page-no") == 1 and "Date" not in header(page), (page.url, header(page)))
    type_over(page, "rename-page-no", "header-page", "1 of 3")
    check("...typed over, saved on the checklist", ((record_by_id(page, cid) or {}).get("headerBlock") or {}).get("page") == "1 of 3")

    # ==================================================================
    print("\n==== A certificate drawn as its own Word table (s117 round 2): its letterhead's words and its number ====")
    # ==================================================================
    # F/QC/06 prints its company and title in its letterhead and no format number, revision or page at all: the first two
    # are typed over where the letterhead prints them; the others on the screen's strip under it, which never prints.
    open_page(page, "#/document/qc-coa-label", settle=1300)
    page.locator("[data-action='document-new-record']").first.click()
    page.wait_for_timeout(1400)
    dismiss(page)
    close_assistant(page)
    coa_id = page.url.rstrip("/").split("/")[-1]
    coa_offered = {a: clickable(page, a) for a in ("rename-company", "rename-title", "rename-format-no", "rename-revision", "rename-revision-date", "rename-page-no")}
    check("F/QC/06: its company and title are typed over in the letterhead, its number, revision, its date and the Page No. on the screen's strip",
          all(n == 1 for n in coa_offered.values()), coa_offered)
    strip = page.evaluate("() => { const s = document.querySelector('[data-print-doc] [data-section=\"number-off-paper\"]'); return s ? [s.classList.contains('no-print'), s.textContent] : null; }")
    check("...the strip is the screen's alone (no-print): the paper prints no number", bool(strip) and strip[0] and "F/QC/06" in strip[1], strip)
    company_was = page.locator("[data-print-doc] [data-action='rename-company']").first.inner_text().strip()
    check("...the company in the paper's own letters, the owner's name for it", company_was == "Gujarat Print Pack Publications Pvt Ltd", company_was)
    type_over(page, "rename-title", "header-title", "SOMETHING ELSE")
    asked = panel.count() == 1
    page.click("[data-action='header-change-cancel']")
    page.wait_for_timeout(400)
    check("...the title typed over in the letterhead asks why, and 'Keep the header as it is' changes nothing",
          asked and panel.count() == 0 and page.locator("[data-print-doc] [data-action='rename-title']").first.inner_text().strip() == "Certificate of Analysis [COA] For Label")
    initial = type_over(page, "rename-page-no", "header-page", "1 of 2")
    stored = record_by_id(page, coa_id) or {}
    check("...its own Page No. is typed over on the strip and saved on that record alone", initial == "1 of 1" and (stored.get("headerBlock") or {}).get("page") == "1 of 2", (initial, stored.get("headerBlock")))

    # ==================================================================
    print("\n==== The other papers of round 2 (s117, 20-Oct-2026): every header word typed over where it prints, every blank a box ====")
    # ==================================================================
    # F/QC/11 prints its number at the foot of its page; the three reports print theirs in the framed page's foot. On each,
    # the title and the number, revision and page are typed over where the paper prints them, every blank of the paper is
    # a box of the record (no empty cell without one; a worked-out box is the sheet's), and what is typed in a cell is kept. (F/QC/12 is left to
    # e2e_qc_calibration: a new weighing-scale sheet waits for a working day.)
    OFFERS = """() => Object.fromEntries(['rename-company', 'rename-title', 'rename-format-no', 'rename-revision', 'rename-page-no'].map((a) =>
      [a, document.querySelectorAll(`[data-print-doc] [data-action='${a}']`).length]))"""
    BLANKS = """() => {
      const doc = document.querySelector('[data-print-doc]');
      const blanks = [];
      doc.querySelectorAll('table.log-sheet tbody tr:not(.pf-pad)').forEach((tr, i) => Array.from(tr.children).forEach((td, j) => {
        if (td.matches('[data-sr-no]') || td.querySelector('input, select, textarea, button') || td.textContent.trim()) return;
        blanks.push([i, j]);
      }));
      const boxes = Array.from(doc.querySelectorAll('input[data-bind], select[data-bind], textarea[data-bind]'));
      return { blanks, boxes: boxes.length, open: boxes.filter((b) => !b.disabled).length };
    }"""
    for doc_id, number, wanted in (
        ("qc-gsm-plate-calibration", "F/QC/11", ("rename-company", "rename-title", "rename-format-no", "rename-revision", "rename-page-no")),
        ("qc-analysis-report", "F/QC/29", ("rename-title", "rename-format-no", "rename-revision", "rename-page-no")),
        ("qc-utility-test-report", "F/QC/29", ("rename-title", "rename-format-no", "rename-revision", "rename-page-no")),
        ("qc-printing-aids-destruction", "F/QC/20", ("rename-title", "rename-format-no", "rename-revision", "rename-page-no")),
    ):
        open_page(page, f"#/document/{doc_id}", settle=1300)
        page.locator("[data-action='document-new-record']").first.click()
        page.wait_for_timeout(1400)
        dismiss(page)
        close_assistant(page)
        rid = page.url.rstrip("/").split("/")[-1]
        offered = page.evaluate(OFFERS)
        check(f"{number} ({doc_id}): its title, number, revision and page are typed over where the paper prints them",
              all(offered.get(a, 0) >= 1 for a in wanted), offered)
        seen = page.evaluate(BLANKS)
        check(f"...every blank of its paper is a box of the record, and its boxes can be written in",
              not seen["blanks"] and seen["open"] > 0, seen)
        cell = page.locator("[data-print-doc] table.log-sheet tbody tr:not(.pf-pad) td input[data-bind]:not([type='date']):not([type='number']):not(:disabled)").first
        written = None
        if cell.count():
            cell.fill("R2 CHECK")
            cell.press("Tab")
            page.wait_for_timeout(900)
            written = "R2 CHECK" in str((record_by_id(page, rid) or {}).get("data"))
        check("...and what is typed in its grid is kept on the record", written is True, written)

    # ==================================================================
    print("\n==== The papers drawn as their own table on 22-Oct-2026 (s117 round 2): every header word, every blank ====")
    # ==================================================================
    # Each prints its header words in its own cells (the company, the title, the number with its revision and its date);
    # what it does not print (F/QC/25's and F-QC-14's number, revision, date and page) is typed over on the screen's strip.
    # Every cell of the paper holds its words or a box of the record, but the blank rows it rules between its parts; a
    # worked-out cell is the sheet's. What is typed in its grid is kept on the record.
    PT_OFFERS = """() => Object.fromEntries(['rename-company', 'rename-title', 'rename-format-no', 'rename-revision', 'rename-revision-date', 'rename-page-no'].map((a) =>
      [a, document.querySelectorAll(`[data-print-doc] [data-action='${a}']`).length]))"""
    PT_BLANKS = """() => {
      const doc = document.querySelector('[data-print-doc]');
      const blanks = Array.from(doc.querySelectorAll('table[data-paper-part] td.pt-c')).filter((td) =>
        !td.hasAttribute('data-pt-blank') && !td.closest('tr.pt-pad') && !td.classList.contains('pt-padc')
        && !td.querySelector('input, select, textarea, img, [data-computed]') && !td.textContent.trim()).map((td) => td.getAttribute('data-pt-cell'));
      const boxes = Array.from(doc.querySelectorAll('input[data-bind], select[data-bind], textarea[data-bind]'));
      return { paper: !!doc.querySelector('[data-paper-form="table"]'), blanks, boxes: boxes.length, open: boxes.filter((b) => !b.disabled).length };
    }"""
    every = ("rename-company", "rename-title", "rename-format-no", "rename-revision", "rename-revision-date", "rename-page-no")
    # (F/QC/25 is filed with no revision date: there is none to type over; the line clearances print no company and are
    # filed with none either)
    undated = ("rename-company", "rename-title", "rename-format-no", "rename-revision", "rename-page-no")
    checklist = ("rename-title", "rename-format-no", "rename-revision", "rename-page-no")
    printed = ("rename-company", "rename-title", "rename-format-no", "rename-revision", "rename-revision-date")
    logo = ("rename-title", "rename-format-no", "rename-revision", "rename-revision-date")
    for doc_id, number, wanted in (
        ("qc-coa-corrugated", "F/QC/25", undated),
        ("qc-calibration-master-list", "F/QC/08", printed),
        ("qc-obsolete-artwork", "F/QC/16", printed),
        ("qc-ruler-verification", "F/QC/17", printed),
        ("qc-ruler-verification-300", "F/QC/17 (300 mm)", printed),
        ("qc-temperature-humidity", "F-QC-40.A", logo),
        ("qc-temperature-sleeve", "F-QC-40.B", logo),
        ("qc-temperature", "F-QC-40.C", logo),
        ("qc-viscosity", "F-QC-30", logo),
        ("qc-adhesive-mixing", "F-QC-32", logo),
        ("qc-test-reliability-label", "F-QC-14 (Label)", every),
        ("qc-test-reliability-sleeve", "F-QC-14 (Sleeve)", every),
        ("qc-inprocess-printing", "F/QC/13", every),
        ("qc-line-clearance-materials", "Line clearance (materials)", checklist),
        ("qc-line-clearance-quality", "Line clearance (quality)", checklist),
    ):
        open_page(page, "#/library", settle=1000)
        new_record = page.locator(f"[data-action='new-record'][data-document='{doc_id}']")
        if new_record.count():
            new_record.first.evaluate("el => el.click()")
        else:
            open_page(page, f"#/document/{doc_id}", settle=1300)
            page.locator("[data-action='document-new-record']").first.click()
        page.wait_for_timeout(1400)
        dismiss(page)
        close_assistant(page)
        rid = page.url.rstrip("/").split("/")[-1]
        offered = page.evaluate(PT_OFFERS)
        check(f"{number} ({doc_id}): the header words it prints are typed over where it prints them, the rest on the screen's strip",
              "#/record/" in page.url and all(offered.get(a, 0) >= 1 for a in wanted), (page.url.split("#")[-1], offered))
        seen = page.evaluate(PT_BLANKS)
        check("...drawn as its paper's own table, every blank of it a box of the record, and its boxes can be written in",
              seen["paper"] and not seen["blanks"] and seen["open"] > 0, seen)
        cell = page.locator("[data-print-doc] table[data-paper-part] td[data-pt-col] input[data-bind]:not([type='date']):not([type='time']):not(:disabled)").first
        written = None
        if cell.count():
            word = "97531" if cell.get_attribute("type") == "number" else "R2 CHECK"
            cell.fill(word)
            cell.press("Tab")
            page.wait_for_timeout(900)
            written = word in str((record_by_id(page, rid) or {}).get("data"))
        else:
            # (a grid of choices alone, F/QC/13's grades: a choice made is kept on its line)
            pick = page.locator("[data-print-doc] table[data-paper-part] td[data-pt-col] select[data-bind]:not(:disabled)").first
            if pick.count():
                td = pick.locator("xpath=ancestor::td[1]")
                col, ln = td.get_attribute("data-pt-col"), int(td.get_attribute("data-pt-ln"))
                value = pick.locator("option").nth(1).get_attribute("value")
                pick.select_option(value)
                page.wait_for_timeout(900)
                lines = ((record_by_id(page, rid) or {}).get("data") or {}).get("rows") or []
                written = len(lines) > ln and lines[ln].get(col) == value
        check("...and what is typed in its grid is kept on the record", written is True, written)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe header block is typed over where it stands, on every document - the format's under document control, the record's on the record.")
