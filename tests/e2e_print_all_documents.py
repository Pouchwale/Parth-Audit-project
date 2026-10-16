"""Printing prints the DOCUMENT — on every document of every module.

The rule (REQUIREMENTS §29) is checked here one screen at a time, across the
whole app rather than on a sample: every document that holds records is started
from the Document Library, opened, and inspected under print media; then every
reference document, register, report sheet and file list is opened and inspected
the same way. On each one:

  * the document itself is on the paper;
  * nothing around it is — the navigation panel, the top bar, the page's own
    title and explanation, its buttons, the assistant, the record's history, the
    banners;
  * and it is the same whether the page's own Print button is used or the
    browser's (Ctrl+P), because both go through the same scoping
    (utils/print.ts: printDocument() and the beforeprint listener);
  * an empty date, time or choice box prints empty — no "dd-mm-yyyy", "--:--" or
    "Select…" on the paper (REQUIREMENTS §111: the owner's F/QC/12 printout read
    "dd-mm-yyyy" in a Next Due Date nobody had written);
  * the four QC formats the owner named on 13-Oct-2026 print as their papers:
    F/QC/11 and F/QC/12 with the PROCEDURE below the grid and nothing of DCRS's
    above it, F/QC/12 with no Sr. No. and each entry on two lines, F-QC-30 with the
    day's date in its Sr. No., F-QC-32 with its Date column (REQUIREMENTS §111).

Network-independent, and driven against the production build on :8842.
"""
import sys
import time
from playwright.sync_api import sync_playwright
def settle_briefing(page):
    """Mark today's briefing slots as already shown, so it cannot re-open part
    way through the run and intercept a click. The briefing shows itself once in
    the first hour of the working day and once in the last
    (engine/briefingSchedule.ts); a suite that crosses one of those boundaries
    while running would otherwise fail on whatever it was clicking at the time.
    Reopening it deliberately from the top bar still works, which is how the
    suites that test the briefing itself get at it."""
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

STUB_PRINT = "() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }"
START_BROWSER_PRINT = "() => window.dispatchEvent(new Event('beforeprint'))"
END_PRINT = "() => window.dispatchEvent(new Event('afterprint'))"
# What the printout holds. An element's own computed `display` stays "block"
# when a parent is hidden, so only a box in the print layout answers this.
PRINTED = """
  () => {
    const shown = (el) => !!el && el.getClientRects().length > 0;
    const docs = Array.from(document.querySelectorAll('[data-print-doc]')).filter(shown);
    const inDoc = (el) => docs.some((d) => d.contains(el));
    const outside = (sel) =>
      Array.from(document.querySelectorAll(sel)).filter((el) => shown(el) && !inDoc(el)).length;
    return {
      documents: docs.length,
      sidebar: shown(document.querySelector('.app-sidebar')),
      topbar: shown(document.querySelector('.app-topbar')),
      buttons: outside('button'),
      headings: outside('h1, h2'),
      history: outside('.record-history'),
      assistant: outside('.assistant-widget, .assistant-panel, [data-section="assistant"]'),
      banners: outside('.correction-banner, .prepared-banner, .agreement-card, .card-header'),
      // An empty date, time or choice box that would print the browser's words in it (s111).
      emptyShown: Array.from(document.querySelectorAll('[data-print-doc] input[type="date"], [data-print-doc] input[type="time"], [data-print-doc] select'))
        .filter((el) => shown(el) && el.value === '' && !['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(el).webkitTextFillColor))
        .map((el) => el.getAttribute('data-bind') || el.getAttribute('data-field') || el.outerHTML.slice(0, 80)),
      emptyBoxes: Array.from(document.querySelectorAll('[data-print-doc] input[type="date"], [data-print-doc] input[type="time"], [data-print-doc] select')).filter((el) => shown(el) && el.value === '').length,
      gridHeadings: Array.from(document.querySelectorAll('[data-print-doc] table.log-sheet thead th')).filter(shown).map((e) => e.textContent.trim()),
      srNo: Array.from(document.querySelectorAll('[data-print-doc] table.log-sheet td[data-sr-no]')).filter(shown).map((e) => e.textContent.trim()),
      secondLines: Array.from(document.querySelectorAll('[data-print-doc] table.log-sheet tr[data-line="second"]')).filter(shown).length,
      notesAfterGrid: (() => {
        const n = document.querySelector('[data-print-doc] [data-section="notes-below"]');
        const t = document.querySelector('[data-print-doc] table.log-sheet');
        return !!n && !!t && shown(n) && !!(t.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) ? n.textContent : null;
      })(),
      text: docs.map((d) => d.textContent).join(' '),
      // What the boxes above and below the grid hold (an input's value is not in textContent).
      boxValues: Array.from(document.querySelectorAll('[data-print-doc] .field input, [data-print-doc] .field select, [data-print-doc] .field textarea')).filter(shown).map((e) => e.value),
    };
  }
"""


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:400])


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


def printout(page):
    """What is on the paper, with the browser's own Print (Ctrl+P) path."""
    page.evaluate(START_BROWSER_PRINT)
    page.emulate_media(media="print")
    try:
        return page.evaluate(PRINTED)
    finally:
        page.emulate_media(media="screen")
        page.evaluate(END_PRINT)


def check_printout(page, what):
    """The document, and nothing around it."""
    seen = printout(page)
    check(f"{what}: the document is on the printout", seen["documents"] >= 1, seen)
    check(
        f"{what}: and nothing around it — no panel, top bar, buttons, page title, history or assistant",
        not seen["sidebar"]
        and not seen["topbar"]
        and seen["buttons"] == 0
        and seen["headings"] == 0
        and seen["history"] == 0
        and seen["assistant"] == 0,
        {k: v for k, v in seen.items() if k != "text"},
    )
    check(f"{what}: an empty date, time or choice box prints empty (s111)", seen["emptyShown"] == [], (seen["emptyShown"][:5], seen["emptyBoxes"]))
    return seen


# The four QC formats the owner named on 13-Oct-2026, as their papers print (REQUIREMENTS s111).
PROCEDURE = "Calibration to be done by qualified QA person as per calibration work procedure."


def check_paper(doc_id, seen):
    if doc_id == "qc-viscosity":
        check("F-QC-30 prints Sr. No. | Date/Time | Viscosity (20.0 ± 1.0 Sec.) | Tested By", seen["gridHeadings"] == ["Sr. No.", "Date/Time", "Viscosity (20.0 ± 1.0 Sec.)", "Tested By"], seen["gridHeadings"])
        # The owner, 14-Oct-2026 (a phone picture): the Sr. No. numbers the lines; the day is the header's DATE alone.
        check("...the Sr. No. numbers its 23 lines, the date never in it", len(seen["srNo"]) == 23 and seen["srNo"] == [str(i + 1) for i in range(23)], seen["srNo"][:3])
        check("...and no specification line above the grid", "Viscosity specification" not in seen["text"])
    elif doc_id == "qc-adhesive-mixing":
        check("F-QC-32 prints its Date column", seen["gridHeadings"][:3] == ["Sr. No.", "Date", "Time"], seen["gridHeadings"])
        check("...and no 'One row per adhesive batch mixed' line", "One row per adhesive batch" not in seen["text"])
    elif doc_id == "qc-gsm-plate-calibration":
        check("F/QC/11 prints No. 54 to 57 over size and Deviation", seen["gridHeadings"][:5] == ["Index", "No. 54", "No. 55", "No. 56", "No. 57"], seen["gridHeadings"])
        check("...the four boxes holding the paper's words, each a box to type into (s117)", all(v in seen["boxValues"] for v in ["1-54, 2-55, 3-56, 4-57", "LAB", "Global Eng. Co. (GEC)"]), seen["boxValues"][:6])
        check("...the PROCEDURE below the grid", bool(seen["notesAfterGrid"]) and PROCEDURE in seen["notesAfterGrid"], seen["notesAfterGrid"])
        check("...and no explanation of DCRS's", "The four plates" not in seen["text"] and "worked out" not in seen["text"])
    elif doc_id == "qc-weight-scale-calibration":
        check("F/QC/12 prints no Sr. No. and no Deviation % heading", seen["gridHeadings"][:2] == ["Date", "Tested By"] and "Deviation %" not in seen["gridHeadings"], seen["gridHeadings"])
        check("...each entry on two lines, the second headed Deviation %", seen["secondLines"] >= 1 and "Deviation %" in seen["text"], seen["secondLines"])
        check("...the PROCEDURE below the grid", bool(seen["notesAfterGrid"]) and PROCEDURE in seen["notesAfterGrid"], seen["notesAfterGrid"])
        check("...and no explanation of DCRS's", "One line per weekly calibration" not in seen["text"] and "On the paper the Deviation %" not in seen["text"])


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    # A fixed account, created only the first time (the server limits new
    # accounts per network — MAX_SIGNUPS_PER_IP, backend/index.ts).
    page.fill("#login-email", "print-suite@example.com")
    page.fill("#login-password", "PlaywrightQA123")
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    if page.locator(".app-sidebar").count() == 0:
        page.click("text=Sign up")
        page.wait_for_timeout(200)
        page.fill("#signup-name", "Print QA")
        page.fill("#signup-email", "print-suite@example.com")
        page.fill("#signup-password", "PlaywrightQA123")
        page.fill("#signup-confirm", "PlaywrightQA123")
        page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(800)
    dismiss(page)
    page.evaluate("() => { localStorage.removeItem('dcrs:v1:records'); localStorage.removeItem('dcrs:v1:settings'); }")
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(1200)
    dismiss(page)
    page.evaluate(STUB_PRINT)

    # ---- every document that holds records, started from the library ----
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(1000)
    dismiss(page)
    doc_ids = page.eval_on_selector_all("[data-action='new-record']", "els => els.map(e => e.getAttribute('data-document'))")
    check("The library offers a record of every document that holds one", len(doc_ids) >= 10, doc_ids)

    for doc_id in doc_ids:
        page.goto(f"{BASE}/index.html#/library")
        page.wait_for_timeout(700)
        dismiss(page)
        button = page.locator(f"[data-action='new-record'][data-document='{doc_id}']")
        if button.count() == 0:
            check(f"{doc_id}: New is offered", False, "button missing on the second visit")
            continue
        button.first.click()
        page.wait_for_timeout(1300)
        close_assistant(page)
        page.evaluate(STUB_PRINT)
        check_paper(doc_id, check_printout(page, doc_id))

    # ---- the reference documents, registers, reports and file lists ----
    pages = [
        ("Chemical Master", "#/chemical-master"),
        ("Service Provider Licence", "#/licence"),
        ("Daily register (F/HR/17)", "#/pest/daily"),
        ("Fly Catcher Infestation (F/HR/18)", "#/pest/trend/fly-catcher"),
        ("Rodent Catch Report", "#/pest/trend/rodent"),
        ("Lizard Catch Report", "#/pest/trend/lizard"),
        ("Rat / Mice service page", "#/pest/service/rodent"),
        ("HR Records: the Skill Matrix page (F/HR/03)", "#/hr/skill-matrix"),
        ("A log sheet's own page (F-QC-30)", "#/document/qc-viscosity"),
        ("Reports", "#/reports"),
        ("Document Files", "#/files"),
    ]
    for label, route in pages:
        page.goto(f"{BASE}/index.html{route}")
        page.wait_for_timeout(1100)
        dismiss(page)
        close_assistant(page)
        page.evaluate(STUB_PRINT)
        seen = printout(page)
        if seen["documents"] == 0:
            # A list page with nothing on it yet is not a document — say so
            # rather than pretending it passed.
            check(f"{label}: a document is on the page to print", False, seen)
            continue
        check_printout(page, label)

    # ---- an inspection findings report (CAPA Internal keeps its own page) ----
    gap_id = page.evaluate(
        "() => (JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').find(r => r.documentId === 'gap-inspection' && !r.isDemo) || {}).id"
    )
    check("There is an inspection findings report to open", bool(gap_id), gap_id)
    if gap_id:
        page.goto(f"{BASE}/index.html#/gap/{gap_id}")
        page.wait_for_timeout(1100)
        dismiss(page)
        close_assistant(page)
        page.evaluate(STUB_PRINT)
        check_printout(page, "Inspection findings report (CAPA Internal)")

    # ---- a Statement of Compliance (its own page per statement) ----
    page.goto(f"{BASE}/index.html#/soc")
    page.wait_for_timeout(900)
    dismiss(page)
    first_soc = page.locator("a:has-text('Open'), button:has-text('Open'), .card-clickable").first
    if first_soc.count():
        first_soc.click()
        page.wait_for_timeout(1000)
        close_assistant(page)
        page.evaluate(STUB_PRINT)
        check_printout(page, "Statement of Compliance")

    # ---- the page's own Print button prints once, and puts the page back ----
    page.goto(f"{BASE}/index.html#/chemical-master")
    page.wait_for_timeout(900)
    dismiss(page)
    page.evaluate(STUB_PRINT)
    # The PAGE's Print button: the person's own name in the top bar is a button
    # too (it opens Change password, REQUIREMENTS s62), and this account is "Print QA".
    page.locator(".app-content button:has-text('Print')").first.click()
    page.wait_for_timeout(500)
    printed = page.evaluate("() => window.__printed")
    check("A page's own Print button asks the browser to print once", printed == 1, printed)
    page.evaluate(END_PRINT)
    page.wait_for_timeout(300)
    check(
        "...and when printing ends the page is back as it was",
        page.evaluate("() => document.querySelectorAll('.print-scope-hidden, .print-scope-ancestor').length") == 0
        and page.locator(".app-sidebar").is_visible(),
    )

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nEvery document prints as the document alone.")
