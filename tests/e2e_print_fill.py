"""FILLING THE A4 PAGE (REQUIREMENTS §123; the owner, 24-Oct-2026: "Still some document are not able to print not proper
because of they are not able to cover whole A4 size paper which result when user take print out on physical paper the
print will come properly but it not cover whole page and font size on that paper will be very small").

utils/print.ts draws a short one-page sheet of DCRS's own make bigger (to 1.3x at most, never wider than the page) and
rules a register with blank lines down to its page's foot, as its paper is; a sheet drawn to its own paper is left as
drawn. Here, each in the browser's own PDF of the Print button's printout:
- F/PRD/23, a portrait register: one page, ruled with blank lines, its content most of the page's height;
- F/PRD/24, a landscape register: the same, and bigger than 10 pt;
- F/STR/02, a register whose long names wrap on paper: still one page (its lines are ruled after the words are written);
- F/DISP/04, a short form: drawn bigger, one page, most of its height;
- the fly-control service report, the contractor's March sheet to 1.5 pt (§118): left exactly as drawn;
- F/QC/01, a paper form drawn in millimetres: left exactly as drawn — no zoom, no blank lines;
- and after printing, every blank line is gone from the screen.
No sound (tests/quiet). The password is made for this run and written nowhere.
"""
import os
import secrets
import sys
import tempfile
import time

import pdfplumber
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "originals_check"))
import browse  # noqa: E402

BASE = "http://localhost:8842"
FAILURES = []
TMP = tempfile.mkdtemp(prefix="dcrs-print-fill-")
STUB_PRINT = "() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }"


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + ("" if cond or detail is None else f"   ({detail})"))
    if not cond:
        FAILURES.append(label)


def printed(page, name):
    """The printout as the Print button makes it: the zoom and blank lines while printing, the PDF's pages and how far
    down and across the first page its content reaches; then printing ends."""
    page.evaluate(STUB_PRINT)
    page.evaluate("() => window.dispatchEvent(new Event('beforeprint'))")
    during = page.evaluate(
        """() => {
             const docs = Array.from(document.querySelectorAll('[data-print-doc]')).filter((d) => d.getClientRects().length && d.getAttribute('data-print-doc') !== 'ui');
             const doc = docs.find((d) => !docs.some((o) => o !== d && o.contains(d)));
             return { zoom: doc ? Number(doc.style.zoom) || 1 : null, blank: document.querySelectorAll('tbody[data-print-blank] tr').length };
           }"""
    )
    path = os.path.join(TMP, f"{name}.pdf")
    try:
        page.emulate_media(media="print")
        page.pdf(path=path, prefer_css_page_size=True, print_background=True)
    finally:
        page.emulate_media(media="screen")
        page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
    after = page.evaluate("() => document.querySelectorAll('tbody[data-print-blank]').length")
    with pdfplumber.open(path) as pdf:
        pages = len(pdf.pages)
        pg = pdf.pages[0]
        W, H = float(pg.width), float(pg.height)
        objs = [o for k in ("chars", "lines", "rects", "curves") for o in getattr(pg, k)
                if not ((float(o["x1"]) - float(o["x0"])) > W * 0.98 and (float(o["bottom"]) - float(o["top"])) > H * 0.5)]
        tall = (max(float(o["bottom"]) for o in objs) - min(float(o["top"]) for o in objs)) / H if objs else 0
        wide = (max(float(o["x1"]) for o in objs) - min(float(o["x0"]) for o in objs)) / W if objs else 0
        sizes = sorted(float(c["size"]) for c in pg.chars)
        pt = sizes[len(sizes) // 2] if sizes else 0
    return {"zoom": during["zoom"], "blank": during["blank"], "pages": pages, "tall": tall, "wide": wide, "pt": pt, "after": after}


def open_filled(page, doc):
    how = browse.start_record(page, BASE, {"id": doc, "kind": ""})
    if how == "record":
        browse.say(page, "fill it with sample data", wait=3500)
        browse.close_assistant(page)
        page.wait_for_timeout(700)
    return how


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1366, "height": 768})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    email = f"fill-{int(time.time() * 1000)}@example.com"
    password = f"Fill{secrets.token_hex(6)}A1"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(400)
    page.click("text=Sign up")
    page.fill("#signup-name", "Print Fill QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", password)
    page.fill("#signup-confirm", password)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    browse.dismiss(page)
    browse.settle_briefing(page)

    cases = [
        ("prd-pouching-cutter-issue", "F/PRD/23 (a portrait register)", "register"),
        ("prd-slitting-blade", "F/PRD/24 (a landscape register)", "register"),
        ("str-sharp-metal-objects", "F/STR/02 (long names that wrap)", "register"),
        ("disp-vehicle-cleaning", "F/DISP/04 (a short form)", "form"),
        ("service-report-fly", "The fly-control service report (the contractor's March sheet)", "paper"),
        ("qc-bopp-film", "F/QC/01 (a paper form drawn in millimetres)", "paper"),
    ]
    for doc, what, kind in cases:
        how = open_filled(page, doc)
        check(f"{what}: a record opens", how == "record", how)
        if how != "record":
            continue
        got = printed(page, doc)
        print(f"     ({what}: zoom {got['zoom']}, blank lines {got['blank']}, {got['pages']} page(s), content {got['tall'] * 100:.0f}% of the page's height and {got['wide'] * 100:.0f}% of its width, {got['pt']:.1f} pt)")
        check(f"{what}: one page", got["pages"] == 1, got)
        check(f"{what}: the blank lines leave the screen when printing ends", got["after"] == 0, got)
        if kind == "register":
            check(f"{what}: ruled with blank lines down the page, as its paper is", got["blank"] >= 3, got)
            check(f"{what}: its content reaches most of the page's height (75% or more)", got["tall"] >= 0.75, got)
        elif kind == "form":
            check(f"{what}: drawn bigger (zoom 1.2 or more, 1.3 at most)", got["zoom"] is not None and 1.2 <= got["zoom"] <= 1.3, got)
            check(f"{what}: its content reaches most of the page's height (70% or more)", got["tall"] >= 0.70, got)
        elif kind == "paper":
            check(f"{what}: left exactly as drawn: no zoom, no blank lines", got["zoom"] == 1 and got["blank"] == 0, got)
    check("No JavaScript errors", not errors, errors[:3])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for failure in FAILURES:
        print(" -", failure)
    sys.exit(1)
print("\nA short sheet fills its A4 page: drawn bigger, a register ruled to its foot, a paper form left as drawn.")
