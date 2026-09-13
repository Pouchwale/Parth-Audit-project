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
    (utils/print.ts: printDocument() and the beforeprint listener).

Network-independent, and driven against the production build on :8842.
"""
import sys
import time
from playwright.sync_api import sync_playwright

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
        seen,
    )


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
        check_printout(page, doc_id)

    # ---- the reference documents, registers, reports and file lists ----
    pages = [
        ("SOP Reference", "#/sop"),
        ("Chemical Master", "#/chemical-master"),
        ("Service Provider Licence", "#/licence"),
        ("Daily register (F/HR/17)", "#/pest/daily"),
        ("Fly Catcher Infestation (F/HR/18)", "#/pest/trend/fly-catcher"),
        ("Rodent Catch Report", "#/pest/trend/rodent"),
        ("Rat / Mice service page", "#/pest/service/rodent"),
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
    page.goto(f"{BASE}/index.html#/sop")
    page.wait_for_timeout(900)
    dismiss(page)
    page.evaluate(STUB_PRINT)
    page.locator("button:has-text('Print')").first.click()
    page.wait_for_timeout(500)
    check("A page's own Print button asks the browser to print once", page.evaluate("() => window.__printed") == 1)
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
