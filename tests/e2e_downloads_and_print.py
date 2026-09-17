"""Every document downloads as its own kind of file, and a wide one prints whole.

Asked for on 17-Sep-2026: "there will be like excel and word file also so make
sure user will get his own excel and word file which user if download then it
will become pdf and that is not applicable to excel sheet and also ... when user
take print then if there are many columns then it will be also download not
only shown in preview". REQUIREMENTS s54. This suite checks that:

  * a register or log sheet downloads as an Excel workbook, read back cell by
    cell: the header block, the grid's headings and lines, a date as a real
    date cell, a wide grid set to print landscape one page wide (F/HR/01,
    F/HR/09, the GAP report, the daily pest control register);
  * a form or a Word original downloads as a Word document, read back: the
    title, the boxes, the grid as a table (F/HR/05, a statement of compliance,
    the training record, a complaint checklist);
  * the service licence, a scanned PDF, has no download - only Print;
  * printing a document much wider than a portrait page turns the page landscape
    and scales the document to fit (F/HR/09's 29 columns), one only a little
    wider stays portrait, scaled to no less than 80% (F/HR/05), the screen is put
    back after printing, and the PDF comes out landscape.

Network-independent, against the production build on :8842.
"""
import os
import re
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET

from playwright.sync_api import sync_playwright


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


BASE = "http://localhost:8842"
FAILURES = []
PASSWORD = "PlaywrightQA123"
UNSCOPED = ("trend-qa@example.com", "Trend QA", "")
TMP = tempfile.mkdtemp(prefix="downloads-")
MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


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


def sign_in(page, email, name, department):
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(500)
    if page.locator(".app-sidebar").count() == 0:
        page.fill("#login-email", email)
        page.fill("#login-password", PASSWORD)
        page.click("button:has-text('Log In')")
        page.wait_for_timeout(1500)
        if page.locator(".app-sidebar").count() == 0:
            page.click("text=Sign up")
            page.wait_for_timeout(300)
            page.fill("#signup-name", name)
            page.fill("#signup-email", email)
            page.fill("#signup-password", PASSWORD)
            page.fill("#signup-confirm", PASSWORD)
            page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(1300)
    dismiss(page)


def goto(page, route):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(1300)
    dismiss(page)
    close_assistant(page)


def download(page, name):
    button = page.locator("[data-action='download-document']").first
    fmt = button.get_attribute("data-format")
    with page.expect_download() as dl:
        button.click()
    d = dl.value
    path = os.path.join(TMP, f"{name}.{fmt}")
    d.save_as(path)
    return fmt, d.suggested_filename, path


def workbook(path):
    """The first sheet as {row: {column: (text, style)}}, plus the sheet XML and the workbook XML."""
    with zipfile.ZipFile(path) as z:
        sheet_xml = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
        book_xml = z.read("xl/workbook.xml").decode("utf-8")
        z.read("xl/styles.xml")
    rows = {}
    for row in ET.fromstring(sheet_xml).iter(f"{MAIN}row"):
        cells = {}
        for c in row.iter(f"{MAIN}c"):
            col = re.match(r"[A-Z]+", c.get("r")).group(0)
            if c.get("t") == "inlineStr":
                text = "".join(t.text or "" for t in c.iter(f"{MAIN}t"))
            else:
                v = c.find(f"{MAIN}v")
                text = v.text if v is not None else ""
            cells[col] = (text, c.get("s"))
        rows[int(row.get("r"))] = cells
    return rows, sheet_xml, book_xml


def all_text(rows):
    return [c[0] for r in rows.values() for c in r.values()]


def word(path):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        xml = z.read("word/document.xml").decode("utf-8")
    root = ET.fromstring(xml)
    paragraphs = ["".join(t.text or "" for t in p.iter(f"{WORD}t")) for p in root.iter(f"{WORD}p")]
    tables = []
    for tbl in root.iter(f"{WORD}tbl"):
        tables.append([["".join(t.text or "" for t in tc.iter(f"{WORD}t")) for tc in tr.iter(f"{WORD}tc")] for tr in tbl.iter(f"{WORD}tr")])
    return names, xml, paragraphs, tables


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    sign_in(page, *UNSCOPED)

    # ==================================================================
    # 1. Registers and log sheets: Excel
    # ==================================================================
    goto(page, "#/hr/competence")
    fmt, suggested, path = download(page, "competence")
    rows, sheet_xml, book_xml = workbook(path)
    texts = all_text(rows)
    check("F/HR/01 Personal Competence Records downloads as an Excel workbook, named for the format", fmt == "xlsx" and suggested.startswith("F-HR-01 Personal Competence Records") and suggested.endswith(".xlsx") and 'name="F-HR-01"' in book_xml, suggested)
    check("...with the form's header block: title, Format No. F/HR/01, Rev No.", any("PERSONAL COMPETENCE RECORDS" in t for t in texts) and "Format No." in texts and "F/HR/01" in texts, texts[:12])
    heading_row = next((r for r in rows.values() if any(c[0] == "Name of person" for c in r.values())), None)
    check("...the grid's headings as a bold heading row", heading_row is not None and all(c[1] == "4" for c in heading_row.values()), heading_row)
    names = [c[0] for r in rows.values() for c in r.values() if c[0] in ("Shail Patel", "Disha Chaudhary")]
    check("...and all 80 lines, first to last", "Shail Patel" in names and "Disha Chaudhary" in names and len(rows) >= 85, len(rows))
    check("...set to print landscape, one page wide", 'orientation="landscape"' in sheet_xml and 'fitToWidth="1"' in sheet_xml and '<pageSetUpPr fitToPage="1"/>' in sheet_xml)

    goto(page, "#/hr/training-calendar")
    fmt, suggested, path = download(page, "training-calendar")
    rows, sheet_xml, _ = workbook(path)
    widest = max(len(r) for r in rows.values())
    check("F/HR/09's 29-column training calendar downloads as a workbook with every column", fmt == "xlsx" and widest >= 29 and any("Mar-27 — Actual" in t for t in all_text(rows)), widest)

    goto(page, "#/gap/gap-2023-12-13")
    fmt, suggested, path = download(page, "gap")
    rows, _, book_xml = workbook(path)
    check("The GAP report, supplied as a workbook, downloads as one - named for the report, its format number being still to be confirmed",
          fmt == "xlsx" and len(rows) > 10 and any("GAP" in t.upper() for t in all_text(rows)) and not suggested.startswith("TO BE CONFIRMED") and "TO BE CONFIRMED" not in book_xml, suggested)

    goto(page, "#/pest/daily")
    fmt, suggested, path = download(page, "daily-register")
    rows, _, _ = workbook(path)
    check("The daily pest control register downloads as a workbook", fmt == "xlsx" and len(rows) > 5, (fmt, len(rows)))

    # ==================================================================
    # 2. Forms and Word originals: Word
    # ==================================================================
    goto(page, "#/hr/induction-staff")
    fmt, suggested, path = download(page, "induction-staff")
    names_, xml, paragraphs, tables = word(path)
    check("F/HR/05, a form about one person, downloads as a Word document", fmt == "docx" and suggested.endswith(".docx") and "word/document.xml" in names_ and "word/styles.xml" in names_, suggested)
    check("...with its title and header block", any("INDUCTION TRAINING RECORD" in p for p in paragraphs) and any("F/HR/05" in c for t in tables for r in t for c in r), paragraphs[:6])
    topic_table = next((t for t in tables if any("Training Topics" in c for c in t[0])), None)
    check("...and its topics as a table with a repeating heading row", topic_table is not None and any("Briefing on Company profile" in c for r in topic_table for c in r) and "<w:tblHeader/>" in xml, topic_table[:2] if topic_table else tables[:2])
    check("...on a portrait page (five columns)", 'w:orient="landscape"' not in xml)

    goto(page, "#/soc/soc-labels")
    fmt, suggested, path = download(page, "soc")
    _, xml, paragraphs, tables = word(path)
    check("A Statement of Compliance, supplied as Word, downloads as Word", fmt == "docx" and "statement of compliance" in " ".join(paragraphs + [c for t in tables for r in t for c in r]).lower(), suggested)

    goto(page, "#/training/training-2025-12-02")
    fmt, suggested, path = download(page, "training")
    check("The training record, supplied as Word, downloads as Word", fmt == "docx" and os.path.getsize(path) > 1000, (fmt, suggested))

    goto(page, "#/library")
    page.locator("[data-action='new-record'][data-document='capa-customer-complaint']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1500)
    close_assistant(page)
    fmt, suggested, path = download(page, "complaint")
    _, xml, paragraphs, tables = word(path)
    check("A complaint checklist, supplied as Word, downloads as Word with its activities", fmt == "docx" and len(tables) >= 1 and len(xml) > 5000, (fmt, len(tables)))

    goto(page, "#/licence")
    check("The service licence - a scanned PDF - has no download, only Print", page.locator("[data-action='download-document']").count() == 0)

    # ==================================================================
    # 3. A wide document prints whole
    # ==================================================================
    stub = "() => { window.__printed = 0; window.print = () => { window.__printed++; }; }"
    goto(page, "#/hr/training-calendar")
    page.evaluate(stub)
    page.locator("button:has-text('Print')").first.click()
    page.wait_for_timeout(300)
    fit = page.evaluate(
        """() => {
             const doc = document.querySelector('[data-print-doc]');
             const style = document.getElementById('print-page-fit');
             return { printed: window.__printed, page: document.documentElement.dataset.printPage, zoom: doc.style.zoom, rule: style ? style.textContent : '' };
           }"""
    )
    check("Printing F/HR/09 turns the page landscape and scales the calendar to the paper", fit["printed"] == 1 and fit["page"] == "landscape" and "landscape" in fit["rule"] and fit["zoom"] and 0.3 <= float(fit["zoom"]) < 1, fit)
    pdf_path = os.path.join(TMP, "calendar.pdf")
    page.pdf(path=pdf_path, prefer_css_page_size=True, print_background=True)
    with open(pdf_path, "rb") as f:
        pdf = f.read()
    boxes = [tuple(float(x) for x in m.groups()) for m in re.finditer(rb"/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]", pdf)]
    check("...and the PDF comes out on landscape A4 pages", bool(boxes) and all(b[2] > b[3] for b in boxes), boxes[:2])
    page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
    page.wait_for_timeout(200)
    after = page.evaluate("() => ({ page: document.documentElement.dataset.printPage || '', zoom: document.querySelector('[data-print-doc]').style.zoom, rule: (document.getElementById('print-page-fit') || {}).textContent || '' })")
    check("...and the screen is put back once printing ends", after == {"page": "", "zoom": "", "rule": ""}, after)

    goto(page, "#/hr/induction-staff")
    page.evaluate(stub)
    page.locator("button:has-text('Print')").first.click()
    page.wait_for_timeout(300)
    fit = page.evaluate("() => ({ page: document.documentElement.dataset.printPage, zoom: document.querySelector('[data-print-doc]').style.zoom })")
    check("A form only a little wider than the paper (F/HR/05) stays portrait, scaled no smaller than 80%", fit["page"] == "portrait" and (fit["zoom"] == "" or 0.8 <= float(fit["zoom"]) <= 1), fit)
    page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nEvery document downloads as its own kind of file, and a wide one prints whole.")
