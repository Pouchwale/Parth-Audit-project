"""FILLING THE A4 PAGE (REQUIREMENTS §123; the owner, 24-Oct-2026: "Still some document are not able to print not proper
because of they are not able to cover whole A4 size paper which result when user take print out on physical paper the
print will come properly but it not cover whole page and font size on that paper will be very small").

utils/print.ts draws a short one-page sheet of DCRS's own make bigger (to 1.3x at most, never wider than the page); a
sheet drawn to its own paper is left as drawn. AND A PRINTOUT HOLDS THE LINES WRITTEN AND NO OTHERS (the owner,
25-Oct-2026: "the user filled row are only should show and not whole default format like if user has filled one or two or
three or four then it should print accordingly and not by default four which are empty"): no blank line is ruled under a
register any more, and a paper's blank lines (F/QC/12's other entries) stay on the screen only. Here, each in the
browser's own PDF of the Print button's printout:
- F/PRD/23, a portrait register: one page, its written lines and no blank ones;
- F/PRD/24, a landscape register: the same, and bigger than 10 pt;
- F/STR/02, a register whose long names wrap on paper: still one page;
- F/DISP/04, a short form: drawn bigger, one page;
- F/MKT/01, a form drawn bigger: all on its one page (measured with the 12 mm margin it prints with, 28-Oct-2026);
- the fly-control service report, the contractor's March sheet to 1.5 pt (§118): left exactly as drawn;
- F/QC/01, a paper form drawn in millimetres: left exactly as drawn — no zoom, no blank lines;
- F/QC/12, the owner's own case: the week's one calibration prints as one entry (one "Deviation %" line), where the
  paper's four entries are drawn on the screen;
- and after printing, every blank line is gone from the screen.
AND EACH PAGE FILLED (the owner, 28-Oct-2026, with F/HR/17's first page: "make sure this page will print complete on A4
size paper like fonts should be good which cover the whole page ... when any this kind of page is which is small then it
should cover whole A4 size page"): F/HR/17's register prints its three pages, each covered to its foot - the check
points in writing of 12 pt or more, set further apart; the days' lines taller, as its paper rules them, never taller
than 11 mm - and a register's few written lines are never stretched past a ruled line's height.
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
    styled_before = page.evaluate("() => document.querySelectorAll('[data-print-doc] tr[style*=\"height\"], [data-print-doc] li[style*=\"padding-bottom\"], [data-print-doc] section[style*=\"zoom\"]').length")
    page.evaluate("() => window.dispatchEvent(new Event('beforeprint'))")
    during = page.evaluate(
        """() => {
             const docs = Array.from(document.querySelectorAll('[data-print-doc]')).filter((d) => d.getClientRects().length && d.getAttribute('data-print-doc') !== 'ui');
             const doc = docs.find((d) => !docs.some((o) => o !== d && o.contains(d)));
             // The lines drawn taller for the print (FILLING EACH PAGE), in mm as printed: their own height times the zooms over them.
             let tallest = 0, stretched = 0;
             for (const tr of doc ? doc.querySelectorAll('tr') : []) {
               if (!tr.style.height) continue;
               stretched += 1;
               let z = 1;
               for (let e = tr; e; e = e.parentElement) z *= Number(e.style.zoom) || 1;
               tallest = Math.max(tallest, (parseFloat(tr.style.height) * z * 25.4) / 96);
             }
             return { zoom: doc ? Number(doc.style.zoom) || 1 : null, blank: document.querySelectorAll('tbody[data-print-blank] tr').length, stretched, tallest };
           }"""
    )
    path = os.path.join(TMP, f"{name}.pdf")
    try:
        page.emulate_media(media="print")
        page.pdf(path=path, prefer_css_page_size=True, print_background=True)
    finally:
        page.emulate_media(media="screen")
        page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
    # What the print drew taller or bigger is put back: as many lines carry a height of their own as before it.
    after = page.evaluate("() => document.querySelectorAll('tbody[data-print-blank]').length") + page.evaluate("() => document.querySelectorAll('[data-print-doc] tr[style*=\"height\"], [data-print-doc] li[style*=\"padding-bottom\"], [data-print-doc] section[style*=\"zoom\"]').length") - styled_before
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
        words = "\n".join((p.extract_text() or "") for p in pdf.pages)
        # Each page: how far down its ink reaches (a share of the page's height), and its writing's median size.
        each = []
        for pg in pdf.pages:
            W, H = float(pg.width), float(pg.height)
            ink = [o for k in ("chars", "lines", "rects", "curves") for o in getattr(pg, k)
                   if not ((float(o["x1"]) - float(o["x0"])) > W * 0.98 and (float(o["bottom"]) - float(o["top"])) > H * 0.5)]
            sz = sorted(float(c["size"]) for c in pg.chars if c.get("text", "").strip())
            each.append({"foot": round(max(float(o["bottom"]) for o in ink) / H, 3) if ink else 0, "pt": sz[len(sz) // 2] if sz else 0})
    return {"zoom": during["zoom"], "blank": during["blank"], "pages": pages, "tall": tall, "wide": wide, "pt": pt, "after": after, "words": words,
            "each": each, "stretched": during["stretched"], "tallest": during["tallest"]}


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
        # Drawn bigger, it printed its comments, satisfaction and seal on a second page until 28-Oct-2026: the fill measured
        # it with the screen's margin, not the 12 mm it prints with.
        ("mkt-customer-feedback", "F/MKT/01 (a form drawn bigger, its comments and seal under its grid)", "bigger"),
        ("service-report-fly", "The fly-control service report (the contractor's March sheet)", "paper"),
        ("qc-bopp-film", "F/QC/01 (a paper form drawn in millimetres)", "paper"),
        ("qc-weight-scale-calibration", "F/QC/12 (one calibration written, the paper draws four)", "entries"),
    ]
    for doc, what, kind in cases:
        how = open_filled(page, doc)
        check(f"{what}: a record opens", how == "record", how)
        if how != "record":
            continue
        got = printed(page, doc)
        print(f"     ({what}: zoom {got['zoom']}, blank lines {got['blank']}, {got['pages']} page(s), content {got['tall'] * 100:.0f}% of the page's height and {got['wide'] * 100:.0f}% of its width, {got['pt']:.1f} pt)")
        check(f"{what}: no blank line is ruled under the lines written (the owner, 25-Oct-2026)", got["blank"] == 0, got["blank"])
        check(f"{what}: one page", got["pages"] == 1, got)
        check(f"{what}: the blank lines leave the screen when printing ends", got["after"] == 0, got)
        if kind == "form":
            check(f"{what}: drawn bigger (zoom 1.2 or more, 1.3 at most)", got["zoom"] is not None and 1.2 <= got["zoom"] <= 1.3, got)
        elif kind == "bigger":
            check(f"{what}: drawn bigger, and all on its one page", got["zoom"] is not None and got["zoom"] > 1 and got["pages"] == 1, got)
        elif kind == "entries":
            entries = got["words"].count("Deviation %")
            check(f"{what}: the printout holds the one entry written, not the paper's four", entries == 1, (entries, got["words"][:300]))
        elif kind == "paper":
            check(f"{what}: left exactly as drawn: no zoom, no blank lines, no line drawn taller", got["zoom"] == 1 and got["blank"] == 0 and got["stretched"] == 0, got)
        if kind == "register":
            check(f"{what}: its written lines no taller than a ruled line (11 mm)", got["tallest"] <= 11.05, got["tallest"])

    # F/HR/17, THE OWNER'S OWN CASE (28-Oct-2026): the register of this month, as printed from its page.
    today = time.localtime()
    # (the page's link counts the month from 0: October is 9)
    browse.open_page(page, BASE, f"#/pest/daily/{today.tm_year}/{today.tm_mon - 1}", settle=2200)
    sheets = page.locator(".register-sheet[data-print-doc] section.register-page")
    check("F/HR/17: the register opens with its three pages", sheets.count() == 3, sheets.count())
    if sheets.count() == 3:
        got = printed(page, "fhr17-register")
        print(f"     (F/HR/17: {got['pages']} page(s); each page's foot {[e['foot'] for e in got['each']]}, writing {[e['pt'] for e in got['each']]} pt; lines drawn taller {got['stretched']}, tallest {got['tallest']:.1f} mm)")
        check("F/HR/17: three pages, as its paper", got["pages"] == 3, got["pages"])
        check(
            # (Before 28-Oct-2026 its ink stopped at 43%, 85% and 78% of the three pages.)
            "F/HR/17: each page covered to its foot - the check points, days 1 to 19, days 20 to 31 and the summary (82% of the page or more)",
            len(got["each"]) == 3 and all(e["foot"] >= 0.82 for e in got["each"]),
            got["each"],
        )
        check("F/HR/17: the check points page in writing of 12 pt or more", bool(got["each"]) and got["each"][0]["pt"] >= 12, got["each"][:1])
        check("F/HR/17: its lines, drawn taller where a page needs it, never taller than a ruled line (11 mm)", got["tallest"] <= 11.05, (got["stretched"], got["tallest"]))
        check("F/HR/17: after printing, the screen is as it was (no zoom, no line drawn taller)", got["after"] == 0, got["after"])
    check("No JavaScript errors", not errors, errors[:3])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for failure in FAILURES:
        print(" -", failure)
    sys.exit(1)
print("\nA short sheet fills its A4 page: drawn bigger, a register ruled to its foot, a paper form left as drawn.")
