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
    day's date in its Sr. No., F-QC-32 with its Date column (REQUIREMENTS §111);
  * on A4 (REQUIREMENTS §117, the owner, 16-Oct-2026): every document's grids,
    laid out as narrow as they can be, fit the printable width of the page chosen
    (portrait 186 mm, landscape 273 mm, A4 less the 12 mm each side), the page is
    the paper's where the layout names it, the sheet is drawn in its three parts
    (header block, body, foot), and F/QC/11, F/QC/12, F/QC/17 (both its pages, the 600 mm
    and the 300 mm scale's, 17-Oct-2026), F/HR/15 and F/HR/16 come out of the browser's PDF as
    one page each, the paper's way round.

Network-independent, and driven against the production build on :8842.
"""
import os
import re
import sys
import tempfile
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
      // The page chosen (utils/print.ts), the paper the sheet names (s117), and the document's scale.
      // A QC paper drawn on its framed page (data/seed/qcPageFrames.ts, s117) keeps the paper's own 8.446 mm margin.
      framed: docs.length > 0 && docs.every((d) => d.matches('[data-frame]') || d.querySelector('[data-frame]') !== null),
      // A QC paper drawn as its own Word table (s117 round 2) stands where the paper stands: its own millimetres from the page's left.
      paperLeft: (() => { const el = document.querySelector('[data-print-doc] [data-paper-left]'); return el ? Number(el.getAttribute('data-paper-left')) : null; })(),
      page: document.documentElement.dataset.printPage || 'portrait',
      paper: (() => { const el = document.querySelector('[data-print-doc][data-paper], [data-print-doc] [data-paper]'); return el ? el.getAttribute('data-paper') : null; })(),
      zoom: docs.map((d) => d.style.zoom || ''),
      // The narrowest each grid can be laid out, as it prints (the document's scale included): within A4's printable width.
      widestTable: Math.max(0, ...Array.from(document.querySelectorAll('[data-print-doc] table')).filter(shown).map((t) => { const w = t.style.width; t.style.width = 'min-content'; const r = t.getBoundingClientRect().width; t.style.width = w; return r; })),
      // The sheet's three parts (s117): the header block in the head, a grid in the body, and the foot.
      parts: docs.filter((d) => d.querySelector('.paper-sheet')).map((d) => [!!d.querySelector('.paper-head .doc-header'), !!d.querySelector('.paper-body table'), !!d.querySelector('.paper-foot')]),
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


# A4 less the 12 mm each side a printed document keeps for itself (utils/print.ts PRINTABLE_WIDTH), in CSS pixels.
PRINTABLE = {"portrait": (210 - 24) * 96 / 25.4, "landscape": (297 - 24) * 96 / 25.4}
# A framed QC paper's page keeps 8.446 mm each side, as the owner's PDFs do (their frame is 8.446 mm from the edge; utils/print.ts FRAMED_MARGIN_MM).
PRINTABLE_FRAMED = {"portrait": (210 - 2 * 8.446) * 96 / 25.4, "landscape": (297 - 2 * 8.446) * 96 / 25.4}
# The papers whose page is named on their layout (s117), and how many pages each is.
PAPER_PAGES = {
    "qc-gsm-plate-calibration": ("landscape", 1),
    "qc-weight-scale-calibration": ("landscape", 1),
    "qc-ruler-verification": ("portrait", 1),
    # F/QC/17's second page, the 300 mm scale's (REQUIREMENTS s117, 17-Oct-2026): the same paper.
    "qc-ruler-verification-300": ("portrait", 1),
    "hr-daily-cleaning": ("landscape", 1),
    # The contractor's service reports (REQUIREMENTS section 118): one A4 portrait page each, as the March paper is one page.
    "service-report-rodent": ("portrait", 1),
    "service-report-general": ("portrait", 1),
    "service-report-fly": ("portrait", 1),
    # F/HR/16 is one landscape page on paper and one here (REQUIREMENTS section 118): its cleaning cell holds the paper's two lines
    # (what is cleaned, "Cleaning by"), no longer three, so its eighteen areas fit; it ran to two pages before.
    "hr-monthly-cleaning": ("landscape", 1),
    # The certificates of analysis for labels and for shrink sleeves are one portrait page each, as their papers are
    # (s117 round 2, 20-Oct-2026: they printed on three landscape pages before).
    "qc-coa-label": ("portrait", 1),
    "qc-coa-sleeve": ("portrait", 1),
}
TMP = tempfile.mkdtemp(prefix="dcrs-print-")
try:
    import pdfplumber
except ImportError:  # the measured checks below are skipped, and said to be
    pdfplumber = None


def check_a4(what, seen):
    """Nothing cut at the right edge: the grids fit the page chosen; the page is the paper's where named (s117)."""
    page_kind = seen["page"]
    # Two pixels of slack: the scale is floored to a thousandth (utils/print.ts), and the rectangle is rounded.
    limit = (PRINTABLE_FRAMED if seen.get("framed") else PRINTABLE)[page_kind]
    if seen.get("paperLeft") is not None:
        # A QC paper drawn as its own Word table (s117 round 2) keeps the paper's own left margin: its grids fit what is left
        # of the page to 2 mm short of its right edge (utils/print.ts ownLeftMargin).
        limit = ((297 if page_kind == "landscape" else 210) - seen["paperLeft"] - 2) * 96 / 25.4
    if "fly-catcher" in what.lower() or "F/HR/18" in what:
        # F/HR/18's Word page has its own margins (REQUIREMENTS section 118): its band is 538 pt across from 28.7 pt in, so it is wider than the 12 mm
        # every other document keeps; it is whole on the page all the same (the A4 page is 794 px, the band ends at 752).
        limit = 794 - 38.3 - 20
    check(f"{what}: its grids fit A4 {page_kind} (s117: nothing cut at the right edge)", seen["widestTable"] <= limit + 2, (round(seen["widestTable"]), round(limit), seen["zoom"], "framed page" if seen.get("framed") else ""))
    if seen["paper"]:
        check(f"{what}: the page is the paper's, {seen['paper']}", page_kind == seen["paper"], (page_kind, seen["paper"]))


def pdf_pages(page, name):
    """The pages of the browser's own PDF of what is on screen, scoped as the Print button scopes it: their orientation each."""
    page.evaluate(START_BROWSER_PRINT)
    try:
        pdf_path = os.path.join(TMP, f"{name}.pdf")
        # printout() leaves the page's media forced to "screen"; Playwright's pdf then renders the SCREEN layout (its
        # documented way to get a screen-media PDF), which put a one-page sheet on two pages. The PDF is the print's.
        page.emulate_media(media="print")
        page.pdf(path=pdf_path, prefer_css_page_size=True, print_background=True)
    finally:
        page.emulate_media(media="screen")
        page.evaluate(END_PRINT)
    with open(pdf_path, "rb") as f:
        pdf = f.read()
    boxes = [tuple(float(x) for x in m.groups()) for m in re.finditer(rb"/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]", pdf)]
    return ["landscape" if b[2] - b[0] > b[3] - b[1] else "portrait" for b in boxes], pdf_path


def check_printout(page, what):
    """The document, and nothing around it."""
    seen = printout(page)
    check(f"{what}: the document is on the printout", seen["documents"] >= 1, seen)
    if seen["documents"] >= 1:
        check_a4(what, seen)
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
        seen = check_printout(page, doc_id)
        check_paper(doc_id, seen)
        # A log sheet (components/records/LogSheetRecordView.tsx) is drawn in three parts; the registers and letters have their own pages.
        if seen["parts"]:
            # ...a sheet of boxes alone (a memo, an agreement) has no grid in its body.
            check(f"{doc_id}: the sheet is drawn in its three parts - the header block in the head, a body, a foot (s117)", all(p[0] and p[2] for p in seen["parts"]), seen["parts"])
        if doc_id in PAPER_PAGES:
            orient, count = PAPER_PAGES[doc_id]
            pages_, pdf_path = pdf_pages(page, doc_id)
            if count is None:
                check(f"{doc_id}: the browser's PDF is {orient}, as the paper (s117)", bool(pages_) and all(p == orient for p in pages_), (pages_, pdf_path))
                print(f"    ({doc_id}: {len(pages_)} page(s) where the paper is one - open, REQUIREMENTS §117)")
            else:
                check(f"{doc_id}: the browser's PDF is {count} page(s), {orient}, as the paper (s117)", len(pages_) == count and all(p == orient for p in pages_), (pages_, pdf_path))
            if doc_id.startswith("service-report-") and pdfplumber:
                # The contractor's sheet measured on the PDF (section 118): the table is the paper's 432 pt across (the March PDF's), whole inside the page.
                with pdfplumber.open(pdf_path) as pdf:
                    pg = pdf.pages[0]
                    # (the page's own white background is a rectangle too)
                    drawn = [r for r in pg.rects if r["x1"] - r["x0"] < pg.width - 5 or r["bottom"] - r["top"] < pg.height - 5]
                    xs = [r["x0"] for r in drawn] + [r["x1"] for r in drawn]
                    ys = [r["top"] for r in drawn] + [r["bottom"] for r in drawn]
                    wide = max(xs) - min(xs)
                    words_ = pg.extract_words()
                    check(f"{doc_id}: on the PDF the table is the paper's 432 pt across (the March sheet) and nothing is cut at the page's edge",
                          abs(wide - 432.1) <= 4 and min(xs) >= 20 and max(xs) <= pg.width - 20 and max(ys) <= pg.height - 20 and all(w["x1"] <= pg.width - 15 and w["bottom"] <= pg.height - 15 for w in words_),
                          (round(wide, 1), round(min(xs)), round(max(xs)), round(max(ys)), pg.width))
        elif doc_id == "hr-training-needs":
            pages_, pdf_path = pdf_pages(page, doc_id)
            print(f"    (F/HR/08's PDF: {len(pages_)} page(s) at {pdf_path} - the header block and the foot should stand on each)")

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

    # ---- F/HR/18's register and F/HR/17's: the pages and the places, on the browser's own PDF (REQUIREMENTS section 118) ----
    page.goto(f"{BASE}/index.html#/pest/trend/fly-catcher")
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    page.evaluate(STUB_PRINT)
    orients, fly_pdf = pdf_pages(page, "fhr18-register")
    check("F/HR/18's register prints on two A4 portrait pages, as the paper is (section 118)", orients == ["portrait", "portrait"], orients)
    if pdfplumber:
        # The owner's PDF of the Word original, measured in points (A4, 595 x 842): the band, the legend, the heading box and the units.
        with pdfplumber.open(fly_pdf) as pdf:
            first, second = pdf.pages[0], pdf.pages[1]

            def rows_of(pg):
                return sorted({round((r["top"] + r["bottom"]) / 2) for r in pg.rects if r["bottom"] - r["top"] < 3 and r["x1"] - r["x0"] > 60 and r["top"] > 300})

            def units_of(pg):
                return [w["text"] for w in pg.extract_words() if re.fullmatch(r"PC-\d\d", w["text"]) and w["top"] > 330]

            check("...PC-01 to PC-08 on the first page, PC-09 to PC-13 on the second (the break after PC-08)", units_of(first) == [f"PC-{n:02d}" for n in range(1, 9)] and units_of(second) == [f"PC-{n:02d}" for n in range(9, 14)], (units_of(first), units_of(second)))
            xs = sorted({round((r["x0"] + r["x1"]) / 2) for r in first.rects if r["x1"] - r["x0"] < 3 and r["bottom"] - r["top"] > 20 and r["top"] > 330})
            paper_columns = [37, 100, 172, 246, 334, 423, 499, 572]
            check("...the grid's eight vertical rules at the paper's places (within 3 pt)", len(xs) >= 8 and all(any(abs(x - c) <= 3 for x in xs) for c in paper_columns), xs)
            grid_rows = [y for y in rows_of(first)]
            pitch = [b - a for a, b in zip(grid_rows, grid_rows[1:]) if 25 <= b - a <= 32]
            check("...two lines to a unit, each the paper's 28.9 pt (the rules are read to the point: 28.9 within 0.7 on average, no line 2 pt out)", len(pitch) >= 14 and abs(sum(pitch) / len(pitch) - 28.9) <= 0.7 and all(abs(d - 28.9) <= 2 for d in pitch), pitch)
            check("...nothing cut at the page's edge", all(w["x1"] <= first.width - 15 and w["bottom"] <= first.height - 15 for w in first.extract_words() + second.extract_words()), None)
    else:
        print("    (pdfplumber is not installed: F/HR/18's printed places are not measured)")
    page.goto(f"{BASE}/index.html#/pest/daily")
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    page.evaluate(STUB_PRINT)
    orients, _ = pdf_pages(page, "fhr17-register")
    check("F/HR/17's register prints on three A4 portrait pages, as the paper is (section 118)", orients == ["portrait"] * 3, orients)

    # ---- the contractor's March-2026 report: its data entered, the print held against the contractor's own PDF (section 118) ----
    if pdfplumber:
        page.goto(f"{BASE}/index.html#/library")
        page.wait_for_timeout(900)
        dismiss(page)
        page.locator("[data-action='new-record'][data-document='service-report-rodent']").first.evaluate("el => el.click()")
        page.wait_for_timeout(1500)
        close_assistant(page)
        page.locator("input[data-field='qty']").nth(0).fill("3")
        page.locator("input[data-field='qty']").nth(1).fill("50 gramms")
        page.locator("td[data-cell='remarks'] textarea").fill("No Rodent Trapped")
        page.wait_for_timeout(700)
        page.evaluate(STUB_PRINT)
        _, march_print = pdf_pages(page, "service-report-march")
        march_ref = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "source-documents", "Service Report- March 2026.pdf")
        with pdfplumber.open(march_print) as mine, pdfplumber.open(march_ref) as ref:
            def rules(pg):
                rs = [r for r in pg.rects if r["x1"] - r["x0"] < pg.width - 5 or r["bottom"] - r["top"] < pg.height - 5]
                h = [(r["top"] + r["bottom"]) / 2 for r in rs if r["bottom"] - r["top"] < 3 and r["x1"] - r["x0"] > 6]
                v = [(r["x0"] + r["x1"]) / 2 for r in rs if r["x1"] - r["x0"] < 3 and r["bottom"] - r["top"] > 6]
                x0, y0 = min(r["x0"] for r in rs), min(r["top"] for r in rs)
                return sorted({round(y - y0, 1) for y in h}), sorted({round(x - x0, 1) for x in v})

            def out_of_place(want, got, tol=2.0):
                return [round(w, 1) for w in want if not any(abs(w - g) <= tol for g in got)]

            (rh, rv), (mh, mv) = rules(ref.pages[0]), rules(mine.pages[0])
            check("The printed March report has every horizontal rule of the contractor's PDF within 2 pt (its table's corner as the origin)", not out_of_place(rh, mh), (out_of_place(rh, mh), len(rh), len(mh)))
            check("...and every vertical rule", not out_of_place(rv, mv), (out_of_place(rv, mv), len(rv), len(mv)))
            pool = [w["text"] for w in mine.pages[0].extract_words()]
            lost = []
            for w in [w["text"] for w in ref.pages[0].extract_words()]:
                if w in pool:
                    pool.remove(w)
                else:
                    lost.append(w)
            # The contractor's own spelling of the company and its address line ("PRINTPACK PUBLICATION PRIVATE LIMITED, ... GUAJRAT") is not the
            # company's name as the owner gave it (02-Oct-2026), and the sheet's date is the record's own: everything else is the sheet's words.
            check("...and every word of it, the data entered (3, 50 gramms, No Rodent Trapped), but the company's name as the owner spells it and the record's date", set(lost) <= {"PRINTPACK", "PUBLICATION", "PRIVATE", "LIMITED,", "GUAJRAT,", "07.03.2026"}, lost)

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
