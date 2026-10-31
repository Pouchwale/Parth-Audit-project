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
    """The visible sheet as {row: {column: (text, style)}}, plus the sheet XML and the workbook XML. The owner's own workbook
    (REQUIREMENTS section 119) keeps his words in Excel's shared-strings table and his sheet under its own name: both read."""
    with zipfile.ZipFile(path) as z:
        book_xml = z.read("xl/workbook.xml").decode("utf-8")
        rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8")
        target = "worksheets/sheet1.xml"
        for tag in re.findall(r"<sheet\b[^>]*>", book_xml):
            if 'state="hidden"' in tag or 'state="veryHidden"' in tag:
                continue
            rid = re.search(r'r:id="([^"]+)"', tag).group(1)
            t = re.search(r'Id="%s"[^>]*Target="([^"]+)"' % re.escape(rid), rels) or re.search(r'Target="([^"]+)"[^>]*Id="%s"' % re.escape(rid), rels)
            if t:
                target = t.group(1)
            break
        sheet_xml = z.read("xl/" + target.lstrip("/").replace("xl/", "", 1)).decode("utf-8")
        z.read("xl/styles.xml")
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{MAIN}si"):
                shared.append("".join(t.text or "" for t in si.iter(f"{MAIN}t")))
    rows = {}
    for row in ET.fromstring(sheet_xml).iter(f"{MAIN}row"):
        cells = {}
        for c in row.iter(f"{MAIN}c"):
            col = re.match(r"[A-Z]+", c.get("r")).group(0)
            v = c.find(f"{MAIN}v")
            if c.get("t") == "inlineStr":
                text = "".join(t.text or "" for t in c.iter(f"{MAIN}t"))
            elif c.get("t") == "s" and v is not None:
                text = shared[int(v.text)] if v.text and int(v.text) < len(shared) else ""
            else:
                text = v.text if v is not None else ""
            cells[col] = (text, c.get("s"))
        rows[int(row.get("r"))] = cells
    return rows, sheet_xml, book_xml


def all_text(rows):
    return [c[0] for r in rows.values() for c in r.values()]


def word(path):
    """The Word file's names, its body XML, its paragraphs (the page headers' and footers' too: the owner's own Word files
    print their band there, REQUIREMENTS section 119) and its tables as rows of cell texts."""
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        xml = z.read("word/document.xml").decode("utf-8")
        heads = [z.read(n).decode("utf-8") for n in names if re.match(r"word/(header|footer)\d*\.xml$", n)]
    root = ET.fromstring(xml)
    paragraphs = ["".join(t.text or "" for t in p.iter(f"{WORD}t")) for p in root.iter(f"{WORD}p")]
    for h in heads:
        paragraphs += ["".join(t.text or "" for t in p.iter(f"{WORD}t")) for p in ET.fromstring(h).iter(f"{WORD}p")]
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
    # The owner's own workbook (REQUIREMENTS section 119, 20-Oct-2026: "it should download the same document which i have
    # uploaded / Supplied to you"): his sheet "Formate 01  (2)", his header cells, his heading rows, his page set-up, and
    # the record's eighty lines in his rows - with the round-trip map beside it (the very hidden "_dcrs" sheet).
    check("F/HR/01 Personal Competence Records downloads as the owner's own workbook, named for the format", fmt == "xlsx" and suggested.startswith("F-HR-01 Personal Competence Records") and suggested.endswith(".xlsx") and 'name="Formate 01  (2)"' in book_xml and 'name="_dcrs"' in book_xml, suggested)
    check("...with his header block: the title and F/HR/01 with its revision", any("PERSONAL COMPETENCE RECORDS" in t for t in texts) and any(t.startswith("F/HR/01") for t in texts), texts[:12])
    heading_row = next((r for r in rows.values() if any(c[0] == "Name of person" for c in r.values())), None)
    check("...his grid's headings", heading_row is not None and any(c[0] == "Date of Joining" for c in heading_row.values()), heading_row)
    names = [c[0] for r in rows.values() for c in r.values() if c[0] in ("Shail Patel", "Disha Chaudhary")]
    check("...and all 80 lines, first to last", "Shail Patel" in names and "Disha Chaudhary" in names and len(rows) >= 84, len(rows))
    check("...on his own page set-up (A4 portrait, as his workbook prints)", 'orientation="portrait"' in sheet_xml and 'paperSize="9"' in sheet_xml)

    goto(page, "#/hr/training-calendar")
    fmt, suggested, path = download(page, "training-calendar")
    rows, sheet_xml, book_xml = workbook(path)
    texts = all_text(rows)
    # The owner's own workbook (REQUIREMENTS section 119, round 2): his calendar writes each topic on two rows, Plan and Actual
    # (his column G says which), under one column per month; DCRS's Plan and Actual columns of a month go to their own rows.
    check("F/HR/09's training calendar downloads as the owner's own workbook: each topic on its Plan and Actual rows under his months",
          fmt == "xlsx" and 'name="_dcrs"' in book_xml and any(t.startswith("Training Plan Calender") for t in texts)
          and sum(1 for t in texts if t.strip() == "Plan") >= 19 and sum(1 for t in texts if t.strip() == "Actual") >= 19 and any("BRCGS" in t for t in texts),
          (suggested, texts[:16]))

    goto(page, "#/gap/gap-2023-12-13")
    fmt, suggested, path = download(page, "gap")
    rows, _, book_xml = workbook(path)
    check("The GAP report, supplied as a workbook, downloads as one - named for the report, its format number being still to be confirmed",
          fmt == "xlsx" and len(rows) > 10 and any("GAP" in t.upper() for t in all_text(rows)) and not suggested.startswith("TO BE CONFIRMED") and "TO BE CONFIRMED" not in book_xml, suggested)

    goto(page, "#/pest/daily")
    fmt, suggested, path = download(page, "daily-register")
    rows, _, _ = workbook(path)
    check("The daily pest control register downloads as a workbook", fmt == "xlsx" and len(rows) > 5, (fmt, len(rows)))

    # F/QC/12 and F/QC/17 as their papers (REQUIREMENTS s117, the owner, 16-Oct-2026: "Download formatting reqd.",
    # "After download setting not ok"): the workbook on the paper's own page, the boxes as many to a line as the paper draws them.
    goto(page, "#/library")
    page.locator("[data-action='new-record'][data-document='qc-weight-scale-calibration']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1500)
    close_assistant(page)
    fmt, suggested, path = download(page, "fqc12")
    # The paper is the owner's Word file (REQUIREMENTS section 119): it downloads as that file, on its landscape page.
    names_, xml, paragraphs, tables = word(path)
    check("F/QC/12 downloads as the owner's Word file, on its landscape page (s117, s119)", fmt == "docx" and 'w:orient="landscape"' in xml and "word/settings.xml" in names_, (fmt, suggested))
    lines = [r for t in tables for r in t]
    three_a_line = [l for l in lines if len(l) == 3 and l[0].startswith("Device ID No")]
    check("...its boxes three to a line, the Device ID No first on the first line (s117)", bool(three_a_line) and three_a_line[0][1].strip().startswith("Location") and three_a_line[0][2].strip().startswith("Department"), lines[:6])
    # The line starts from the standards since REQUIREMENTS s142 (the owner, 29-Oct-2026): the five weights and the fixed
    # Tested Values 1 and 2 - never the last week's line (the page on file's tester, Anjali).
    rec_lines = [l for l in lines if any("200.000gm" in c for c in l)]
    check("...and its line the standard one: the weights and the fixed Tested Values 1 and 2, not the last week's tester (s142)",
          bool(rec_lines) and any(sum(1 for c in l if "0.050mg" in c) >= 2 for l in rec_lines) and not any("Anjali" in c for l in rec_lines for c in l), lines[-6:])
    # EVERY QC FORMAT DOWNLOADS AS WORD AND AS EXCEL (the owner, 31-Oct-2026, s153), each holding what the screen shows.
    kinds = page.locator("[data-action='download-document']").evaluate_all("els => els.map((e) => e.getAttribute('data-format'))")
    check("F/QC/12 offers Download Word and Download Excel (s153)", kinds == ["docx", "xlsx"], kinds)
    screen = " ".join(page.locator("[data-print-doc]").first.evaluate_all("els => els.flatMap((el) => [el.innerText, ...Array.from(el.querySelectorAll('input, textarea')).map((i) => i.value)])"))
    with page.expect_download() as dl:
        page.locator("[data-action='download-document'][data-format='xlsx']").first.click()
    xpath = os.path.join(TMP, "fqc12-excel.xlsx")
    dl.value.save_as(xpath)
    xrows, _, _ = workbook(xpath)
    xtext = " ".join(str(c[0]) for r in xrows.values() for c in r.values())
    check("...its Excel file holds what the screen shows: the header, the boxes, the weights",
          dl.value.suggested_filename.endswith(".xlsx") and all(w in xtext for w in ("QC-76", "Force Strain Sensors", "200.000gm", "400.000gm", "Weight 1")) and "QC-76" in screen,
          xtext[:400])
    goto(page, "#/library")
    page.locator("[data-action='new-record'][data-document='qc-ruler-verification']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1500)
    close_assistant(page)
    fmt, suggested, path = download(page, "fqc17")
    rows, sheet_xml, _ = workbook(path)
    lines = [[c[0] for c in r.values()] for r in rows.values()]
    check("F/QC/17 downloads as a portrait workbook, as its paper is (s117)", fmt == "xlsx" and 'orientation="portrait"' in sheet_xml, (fmt, suggested))
    check("...with the paper's + / - 1 mm starting its tolerance box and its six points, 100 to 500 mm and 490 mm as printed (28-Oct-2026)", any("+ / - 1 mm" in l for l in lines) and any("490 mm" in l for l in lines) and not any("590 mm" in l for l in lines), lines[:20])
    # F/QC/17's second page, the 300 mm scale's (REQUIREMENTS s117, 17-Oct-2026): the same workbook, its own two values.
    goto(page, "#/library")
    page.locator("[data-action='new-record'][data-document='qc-ruler-verification-300']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1500)
    close_assistant(page)
    fmt, suggested, path = download(page, "fqc17-300")
    rows, sheet_xml, _ = workbook(path)
    lines = [[c[0] for c in r.values()] for r in rows.values()]
    check("F/QC/17 of the 300 mm scale downloads as a portrait workbook too, as its paper is (s117)", fmt == "xlsx" and 'orientation="portrait"' in sheet_xml, (fmt, suggested))
    check("...with the 300 mm paper's GP-3/MS/42 and 0-300 mm, the + / - 1 mm and the six points", any("GP-3/MS/42" in l for l in lines) and any("0-300 mm" in l for l in lines) and any("+ / - 1 mm" in l for l in lines) and any("290 mm" in l for l in lines), lines[:24])

    # ==================================================================
    # 2. Forms and Word originals: Word
    # ==================================================================
    goto(page, "#/hr/induction-staff")
    fmt, suggested, path = download(page, "induction-staff")
    names_, xml, paragraphs, tables = word(path)
    check("F/HR/05, a form about one person, downloads as a Word document", fmt == "docx" and suggested.endswith(".docx") and "word/document.xml" in names_ and "word/styles.xml" in names_, suggested)
    # The owner's own Word file (REQUIREMENTS section 119): its title and format number in his page header, read with the body.
    check("...with its title and header block", any("INDUCTION TRAINING RECORD" in p for p in paragraphs) and any("F/HR/05" in p for p in paragraphs + [c for t in tables for r in t for c in r]), paragraphs[:6])
    topic_table = next((t for t in tables if any("Training Topics" in c for c in t[0])), None)
    check("...and its topics as the paper's table", topic_table is not None and any("Briefing on Company profile" in c for r in topic_table for c in r), topic_table[:2] if topic_table else tables[:2])
    print(f"    (F/HR/05 Word tables, columns each: {[max(len(r) for r in t) for t in tables]}; heading rows: {xml.count('<w:tblHeader/>')}; landscape: {'w:orient=' + chr(34) + 'landscape' + chr(34) in xml})")
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
    # Short of its page since 23-Oct-2026, it is drawn bigger as it prints, 1.3x at most (utils/print.ts FILL_SCALE, REQUIREMENTS §123).
    check("A form only a little wider than the paper (F/HR/05) stays portrait, scaled no smaller than 80% and no bigger than 1.3x", fit["page"] == "portrait" and (fit["zoom"] == "" or 0.8 <= float(fit["zoom"]) <= 1.3), fit)
    page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")

    # ==================================================================
    # 4. The papers supplied as Excel and Word download as THEIR OWN sheet and page (REQUIREMENTS section 118; the owner,
    #    17-Oct-2026: "whenever user download the Excel file or Word file, it should be real, which I have supplied to you")
    # ==================================================================
    SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "source-documents")

    def col_name(i):
        s = ""
        i += 1
        while i:
            i, r = divmod(i - 1, 26)
            s = chr(65 + r) + s
        return s

    def original(name, sheet=0):
        """The merged ranges, column widths (Excel characters) and row count of a supplied .xls; None where xlrd is not installed."""
        try:
            import xlrd
        except ImportError:
            return None
        sh = xlrd.open_workbook(os.path.join(SRC, name), formatting_info=True).sheets()[sheet]
        merges = {f"{col_name(c1)}{r1 + 1}:{col_name(c2 - 1)}{r2}" for (r1, r2, c1, c2) in sh.merged_cells}
        widths = [round(sh.colinfo_map[c].width / 256.0, 2) for c in range(sh.ncols) if c in sh.colinfo_map]
        return merges, widths, sh.nrows, sh.ncols

    def made(sheet_xml):
        merges = set(re.findall(r'<mergeCell ref="([A-Z]+\d+:[A-Z]+\d+)"', sheet_xml))
        widths = [round(float(w), 2) for w in re.findall(r'<col min="\d+" max="\d+" width="([\d.]+)" customWidth="1"/>', sheet_xml)]
        return merges, widths

    def new_record(doc_id):
        goto(page, "#/library")
        page.locator(f"[data-action='new-record'][data-document='{doc_id}']").first.evaluate("el => el.click()")
        page.wait_for_timeout(1500)
        close_assistant(page)

    # The three service reports: the contractor's sheet (Service Report-April 2026.xls holds the same grid as the March paper).
    for doc_id, sheet_no, label in (("service-report-rodent", 0, "Rodent Control"), ("service-report-general", 2, "General Pest Control"), ("service-report-fly", 4, "Fly Control")):
        new_record(doc_id)
        fmt, suggested, path = download(page, doc_id)
        rows, sheet_xml, book_xml = workbook(path)
        got_merges, got_widths = made(sheet_xml)
        want = original("Service Report-April 2026.xls", sheet_no)
        check(f"The {label} service report downloads as a workbook on the A4 page, one page wide", fmt == "xlsx" and 'orientation="portrait"' in sheet_xml and 'paperSize="9"' in sheet_xml and 'fitToWidth="1"' in sheet_xml, suggested)
        if want:
            # The contractor's workbook's merged cells are all in the download, but its foot: one merged caption row after three blank ones, where
            # the download has the names row and the captions row (each C:E merged).
            wanted = {m for m in want[0] if not re.fullmatch(r"C\d+:E\d+", m)}
            check(f"...every merged cell of the contractor's workbook is merged in it: the title, the band, the unit line, the material, quantity and method blocks, the remarks", wanted <= got_merges, sorted(wanted - got_merges))
            check("...its six columns at the contractor's own widths", got_widths[:6] == want[1][:6], (got_widths[:6], want[1][:6]))
        check("...in Calibri, with the paper's 24 bold title and medium and thin rules", 'name val="Calibri"' in zipfile.ZipFile(path).read("xl/styles.xml").decode() and 'sz val="24"' in zipfile.ZipFile(path).read("xl/styles.xml").decode() and 'style="medium"' in zipfile.ZipFile(path).read("xl/styles.xml").decode(), None)
        if doc_id == "service-report-rodent":
            check("...the rodent report's two blocks of eight: glue boards on areas 1-8, bait on 9-16", {"C5:C12", "D5:D12", "E5:E12", "C13:C20", "D13:D20", "E13:E20", "F5:F20"} <= got_merges, sorted(got_merges))
            texts = all_text(rows)
            check("...and the March sheet's words, no quantity or remark pre-written", "Glue Board" in texts and "Bromadiolone Cake" in texts and "Trouble gum placement" in texts and "Baiting" in texts and "No Rodent Trapped" not in texts, texts[:30])

    # F/HR/15 and F/HR/16: the cleaning records, on the grids of their supplied workbooks.
    for doc_id, source, label in (("hr-daily-cleaning", "F-HR-15_Daily Cleaning record_01_15.12.2024.xls", "F/HR/15"), ("hr-monthly-cleaning", "F-HR-16_Monthly Cleaning record_01_15.12.2024.xls", "F/HR/16")):
        new_record(doc_id)
        fmt, suggested, path = download(page, doc_id)
        rows, sheet_xml, book_xml = workbook(path)
        got_merges, got_widths = made(sheet_xml)
        want = original(source)
        check(f"{label} downloads as a landscape workbook, one page wide", fmt == "xlsx" and 'orientation="landscape"' in sheet_xml and 'fitToWidth="1"' in sheet_xml, suggested)
        if want:
            check(f"...with every merged cell of the supplied workbook ({len(want[0])}) and no other", got_merges == want[0], (sorted(want[0] - got_merges), sorted(got_merges - want[0])))
            check("...its columns at the supplied widths", got_widths == want[1], (got_widths[:6], want[1][:6]))
            check("...and as many rows and columns as the supplied sheet", max(rows) == want[2] and max(len(r) for r in rows.values()) <= want[3] + 1, (max(rows), want[2], want[3]))

    # F/HR/18: the Word original's page - A4 portrait, the framed band, the legend, the heading box, two lines a unit.
    goto(page, "#/pest/trend/fly-catcher")
    fmt, suggested, path = download(page, "fhr18")
    names_, xml, paragraphs, tables = word(path)
    texts18 = [c for t in tables for r in t for c in r]
    check("F/HR/18 downloads as a Word document", fmt == "docx" and suggested.endswith(".docx") and "word/document.xml" in names_, suggested)
    check("...on A4 portrait, as the paper is, with its margins", 'w:orient="landscape"' not in xml and '<w:pgSz w:w="11906" w:h="16838"/>' in xml and 'w:left="574"' in xml, xml[-300:])
    check("...the band's four cells as the paper words them, on both pages", all(any(t == w for t in texts18) for w in ("Format No.: F/HR/18", "Rev No: 02", "Date: 15.12.2024", "Page No.: 1 of 2", "Page No.: 2 of 2")), texts18[:12])
    unit_tables = [[r[0] for r in t if r and r[0].startswith("PC-")] for t in tables if len(t[0]) == 7 and t[0][0].startswith("PC-")]
    check("...two pages: PC-01 to PC-08 on the first, PC-09 to PC-13 on the second, a page break between", xml.count('<w:br w:type="page"/>') == 1 and unit_tables == [[f"PC-{n:02d}" for n in range(1, 9)], [f"PC-{n:02d}" for n in range(9, 14)]], (unit_tables, xml.count('<w:br w:type="page"/>')))
    check("...the unit's number merged down its two lines, the band's name spanning its four cells", xml.count('w:vMerge w:val="restart"') == 13 and '<w:gridSpan w:val="4"/>' in xml, (xml.count('w:vMerge w:val="restart"'), xml.count("gridSpan")))
    check("...Calibri at the paper's sizes: 20 pt name, 14 pt title, 12 pt cells, 10 pt grid", all(f'<w:sz w:val="{n}"/>' in xml for n in (40, 28, 24, 20)), None)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nEvery document downloads as its own kind of file, and a wide one prints whole.")
