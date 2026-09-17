"""HR Master Data - the employee master sheet the HR formats fetch a person from.

Asked for on 17-Sep-2026: "there is one master excel sheet which you have to
create by yourself and in that there are 6 columns which is GP3 No., Joining
Date, Full Name, Department, Designation/Position, Date of birth so this sheet
will help all other required documents of HR to fill it through fetch ... add
this in HR Module only". REQUIREMENTS s53. This suite checks that:

  * the sheet is in the HR module (sidebar, HR Overview), with exactly the six
    columns in that order, set up from F/HR/01, F/HR/03 and F/HR/06 as on file:
    current employees only, one line per person across registers, the notes
    HR has to confirm, GP3 No. and Date of Birth blank for HR;
  * a cell is written in place and saved; a GP3 No. given twice is flagged; a
    line is added, found and removed; the sheet sorts;
  * Download Excel gives a real workbook - bold headings, text GP3 Nos., date
    cells - and Upload takes a workbook shaped the way Excel saves one (shared
    strings, compressed, a title line, other heading names, dates as dates or
    as text) and a CSV, showing what it will do before it does it; an old .xls
    is refused with a reason;
  * on a record, Fetch fills a one-person form (F/HR/05) by GP3 No. or name,
    lists a box that already says something else and replaces it only when
    told; a name box left holding a name on the sheet fills that person's blank
    boxes (F/HR/04, with the date of birth); a partial name offers the people
    it could be (F/HR/11); Add line puts a person on a register in the
    register's own date style (F/HR/06, F/HR/01 reopened), and Fill blanks
    restores a blank box on a register's line;
  * Mitra fetches "GP3 1031" / "fill from HR master data for ..." only after
    listing what goes where and hearing yes, leaves the record alone on no,
    says when nobody matches, opens the sheet when asked, fills the rest of a
    form from a GP3 No. given as the answer to its "Employee name?" question,
    and the full-page Assistant says where a fetch is done;
  * the CV import takes a GP3 No., fills in from the sheet for a person already
    on it, and puts a new joiner on the sheet;
  * Search finds people by GP3 No. and name and shows them on the sheet;
  * a Quality Control account sees none of it.

Network-independent, against the production build on :8842.
"""
import io
import os
import re
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from datetime import date
from xml.sax.saxutils import escape

from playwright.sync_api import sync_playwright


def settle_briefing(page):
    """Mark today's briefing slots as already shown (engine/briefingSchedule.ts)."""
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
QC_USER = ("dept-qc@example.com", "Dept QC QA", "QC")
COLUMNS = ["GP3 No.", "Joining Date", "Full Name", "Department", "Designation/Position", "Date of Birth"]
MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
TMP = tempfile.mkdtemp(prefix="hr-master-")
TODAY = date.today()


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


def logged_in(page):
    return page.locator(".app-sidebar").count() > 0


def sign_in(page, email, name, department):
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(500)
    if logged_in(page):
        page.locator("button[title='Log Out']").first.click()
        page.wait_for_timeout(900)
    page.fill("#login-email", email)
    page.fill("#login-password", PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    if not logged_in(page):
        page.click("text=Sign up")
        page.wait_for_timeout(300)
        page.fill("#signup-name", name)
        page.fill("#signup-email", email)
        page.fill("#signup-password", PASSWORD)
        page.fill("#signup-confirm", PASSWORD)
        if department:
            page.select_option("#signup-department", department)
        page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(1300)
    dismiss(page)


def goto(page, route):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(1200)
    dismiss(page)


def sheet(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:hrMasterData') || '{\"people\": []}').people")


def person(page, pid):
    return next((p for p in sheet(page) if p["id"] == pid), None)


def named(page, name):
    return [p for p in sheet(page) if p["fullName"] == name]


def stat(page, key):
    return page.locator(f"[data-stat='{key}']").inner_text().strip()


def cell(page, pid, key):
    return page.locator(f"[data-table='hr-master'] tr[data-person='{pid}'] input[data-field='{key}']")


def set_cell(page, pid, key, value):
    loc = cell(page, pid, key)
    loc.fill(value)
    loc.blur()
    page.wait_for_timeout(350)


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def record(page, rid):
    return next((r for r in records(page) if r["id"] == rid), None)


def header_input(page, label):
    return page.locator(f".field:has(label:has-text('{label}'))").first.locator("input, select").first


def new_record(page, slug):
    goto(page, f"#/hr/{slug}")
    close_assistant(page)
    page.click("[data-action='document-new-record']")
    page.wait_for_timeout(1400)
    close_assistant(page)
    return page.url.split("#/record/")[-1]


def fetch(page, query, action="hr-master-fetch"):
    page.fill("[data-field='hr-master-query']", query)
    page.click(f"[data-action='{action}']")
    page.wait_for_timeout(500)
    res = page.locator("[data-state='hr-master-result']")
    return (res.get_attribute("data-result"), res.inner_text()) if res.count() else (None, "")


def row_values(page, index, keys):
    """The inputs of a line of the log sheet, as {key: value}, by the layout's column order."""
    tds = page.locator("table.log-sheet tbody tr").nth(index).locator("td")
    out = {}
    for i, key in enumerate(keys):
        box = tds.nth(i + 1).locator("input, select")
        out[key] = box.first.input_value() if box.count() else tds.nth(i + 1).inner_text()
    return out


def open_mitra(page):
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.click()
        page.wait_for_timeout(500)


def say(page, text, wait=900):
    page.fill("textarea.input", text)
    page.click("button[aria-label='Send']")
    page.wait_for_timeout(wait)
    return page.locator(".chat-log .chat-msg.bot").last.inner_text()


def chip(page, label):
    page.locator(".chat-log .chat-chip", has_text=label).last.click()
    page.wait_for_timeout(700)


def serial(d):
    return (d - date(1899, 12, 30)).days


def excel_like_workbook(path, rows):
    """A workbook shaped the way Excel saves one: shared strings, every part
    compressed, the sheet reached through a relationship id that is not rId1,
    dates as serial numbers in a date-formatted cell, empty cells left out."""
    strings = []

    def sidx(s):
        if s not in strings:
            strings.append(s)
        return strings.index(s)

    xml_rows = []
    for r, row in enumerate(rows, start=1):
        cells = []
        for c, v in enumerate(row):
            ref = f"{'ABCDEFGHIJ'[c]}{r}"
            if v is None or v == "":
                continue
            if isinstance(v, date):
                cells.append(f'<c r="{ref}" s="1"><v>{serial(v)}</v></c>')
            elif isinstance(v, int):
                cells.append(f'<c r="{ref}"><v>{v}</v></c>')
            else:
                cells.append(f'<c r="{ref}" t="s"><v>{sidx(v)}</v></c>')
        xml_rows.append(f'<row r="{r}">{"".join(cells)}</row>')
    main = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    rel = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    parts = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook {main} {rel}><sheets><sheet name="Employees" sheetId="2" r:id="rId3"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
        "xl/styles.xml": f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet {main}><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
        "xl/sharedStrings.xml": f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst {main} count="{len(strings)}" uniqueCount="{len(strings)}">' + "".join(f"<si><t>{escape(s)}</t></si>" for s in strings) + "</sst>",
        "xl/worksheets/sheet1.xml": f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet {main} {rel}><sheetData>{"".join(xml_rows)}</sheetData></worksheet>',
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, xml in parts.items():
            z.writestr(name, xml)


def read_workbook(path):
    with zipfile.ZipFile(path) as z:
        workbook = z.read("xl/workbook.xml").decode("utf-8")
        styles = z.read("xl/styles.xml").decode("utf-8")
        root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows = {}
    for row in root.iter(f"{MAIN}row"):
        cells = {}
        for c in row.iter(f"{MAIN}c"):
            col = re.match(r"[A-Z]+", c.get("r")).group(0)
            if c.get("t") == "inlineStr":
                value = "".join(t.text or "" for t in c.iter(f"{MAIN}t"))
            else:
                v = c.find(f"{MAIN}v")
                value = v.text if v is not None else ""
            cells[col] = (value, c.get("t"), c.get("s"))
        rows[int(row.get("r"))] = cells
    return workbook, styles, rows


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    sign_in(page, *UNSCOPED)

    # ==================================================================
    # 1. In the HR module, in six columns, set up from the registers on file
    # ==================================================================
    goto(page, "#/dashboard")
    hr_links = page.eval_on_selector_all(".nav-module:has(.nav-module-header:has-text('Human Resources')) a", "els => els.map((e) => e.getAttribute('href'))")
    check("The HR module's sidebar has HR Master Data straight after HR Overview", hr_links[:3] == ["#/hr", "#/hr/master-data", "#/hr/competence"], hr_links[:3])
    goto(page, "#/hr")
    page.click("[data-action='open-hr-master']")
    page.wait_for_timeout(1200)
    check("...and HR Overview opens it", page.url.endswith("#/hr/master-data") and page.locator("[data-page='hr-master-data']").count() == 1, page.url)
    headings = page.eval_on_selector_all("[data-table='hr-master'] thead [data-sort]", "els => els.map((e) => e.textContent.replace(/[▲▼]/g, '').trim())")
    check("The sheet has exactly six columns: GP3 No., Joining Date, Full Name, Department, Designation/Position, Date of Birth", headings == COLUMNS, headings)
    people = sheet(page)
    check("It is set up with 115 current employees from F/HR/01, F/HR/03 and F/HR/06", len(people) == 115 and page.locator("[data-table='hr-master'] tr[data-person]").count() == 115 and stat(page, "people") == "115", len(people))
    check("...GP3 No. and Date of Birth blank for every one - no supplied document has them", all(x["gp3No"] == "" and x["dateOfBirth"] == "" for x in people) and stat(page, "no-gp3") == "115" and stat(page, "no-dob") == "115")
    shail = person(page, "hrm-hrc-1")
    check("F/HR/01's first line: Shail Patel, Top management, CEO, joined 01.04.2014", shail and (shail["fullName"], shail["department"], shail["designation"], shail["joiningDate"], shail["sources"]) == ("Shail Patel", "Top management", "CEO", "2014-04-01", ["F/HR/01 line 1"]), shail)
    azaz = person(page, "hrm-hrc-60")
    check(
        "A person on two registers is one line, with the fuller spelling and a note on the dates they disagree on (Azaz Bharach, F/HR/01 and F/HR/06)",
        azaz and azaz["fullName"] == "Azaz Bharach" and azaz["sources"] == ["F/HR/01 line 60", "F/HR/06 line 1"] and azaz["joiningDate"] == "2025-06-23"
        and any("Azaz Bhaach" in n for n in azaz["notes"]) and any("disagree" in n for n in azaz["notes"]) and len(named(page, "Azaz Bharach")) == 1,
        azaz,
    )
    sunny = person(page, "hrm-hrs-44")
    check("An operator on F/HR/03 and F/HR/06 takes the joining department and designation F/HR/06 writes (Sunny Mahesh Singh: POUCH / OPERATOR, 20.07.2025)",
          sunny and (sunny["fullName"], sunny["department"], sunny["designation"], sunny["joiningDate"]) == ("Sunny Mahesh Singh", "POUCH", "OPERATOR", "2025-07-20") and not named(page, "Sunny Singh"), sunny)
    keyur = person(page, "hrm-hrc-11")
    check("F/HR/01's 30.02.2020 is not a date: Keyur Sathavara's Joining Date is left blank with a note to confirm", keyur and keyur["joiningDate"] == "" and any("30.02.2020" in n for n in keyur["notes"]), keyur)
    names = {x["fullName"] for x in people}
    check("People who have left are not on it (Jay Vyas left per F/HR/01; Dinesh Dayabhai Barot marked Left on F/HR/03; Pooja Prajapati left per F/HR/01 though on F/HR/06)",
          not {"Jay Vyas", "Dinesh Dayabhai Barot", "Pooja Prajapati"} & names)
    fena = named(page, "Fena Modi")
    check("...a leaving date still to come keeps the person on, with a note (Fena Modi)", len(fena) == 1 and any("11/20/2026" in n for n in fena[0]["notes"]), fena)
    check("Registers that record no joining are not used (Milan Rajput is only on F/HR/08 and F/HR/13)", "Milan Rajput" not in names)
    check("17 lines carry a note for HR to confirm, and none needs a correction", stat(page, "to-confirm") == "17" and stat(page, "problems") == "0", (stat(page, "to-confirm"), stat(page, "problems")))
    check("The sheet lists the ten HR formats that fetch from it", page.locator("[data-section='hr-master-links'] [data-linked-doc]").count() == 10)
    page.locator("tr[data-person='hrm-hrc-60'] [data-action='hr-master-notes']").click()
    page.wait_for_timeout(300)
    check("...and a line's notes and sources open under it", "Put on the sheet from F/HR/01 line 60 and F/HR/06 line 1" in page.locator("tr[data-notes-for='hrm-hrc-60']").inner_text())

    # ==================================================================
    # 2. Written in place
    # ==================================================================
    set_cell(page, "hrm-hrc-38", "gp3No", "1024")
    set_cell(page, "hrm-hrc-38", "dateOfBirth", "1985-03-12")
    sandeep = person(page, "hrm-hrc-38")
    check("A GP3 No. and a Date of Birth typed into Sandeep Parekh's line are saved as they are left", sandeep["gp3No"] == "1024" and sandeep["dateOfBirth"] == "1985-03-12" and sandeep["updatedBy"] == "Trend QA", sandeep)
    check("...and the counts follow", stat(page, "no-gp3") == "114" and stat(page, "no-dob") == "114")
    set_cell(page, "hrm-hrc-4", "gp3No", "1024")
    check("The same GP3 No. given to a second person is flagged on both lines", stat(page, "problems") == "2" and "also given to Sandeep Parekh" in page.locator("tr[data-notes-for='hrm-hrc-4']").inner_text(), stat(page, "problems"))
    set_cell(page, "hrm-hrc-4", "gp3No", "1025")
    set_cell(page, "hrm-hrc-2", "gp3No", "1040")
    check("...and cleared once corrected", stat(page, "problems") == "0")
    page.click("[data-action='hr-master-add']")
    page.wait_for_timeout(500)
    added = sheet(page)[-1]
    for key, value in [("gp3No", "7701"), ("fullName", "Sheet Line Test"), ("joiningDate", "2026-09-01"), ("department", "QC"), ("designation", "Lab Executive"), ("dateOfBirth", "2000-01-15")]:
        set_cell(page, added["id"], key, value)
    line = person(page, added["id"])
    check("Add employee puts a new line at the end of the sheet, written cell by cell", len(sheet(page)) == 116 and line and (line["gp3No"], line["fullName"], line["joiningDate"], line["department"], line["designation"], line["dateOfBirth"]) == ("7701", "Sheet Line Test", "2026-09-01", "QC", "Lab Executive", "2000-01-15"), line)
    page.fill("[data-field='hr-master-search']", "7701")
    page.wait_for_timeout(300)
    check("Search on the sheet finds a line by its GP3 No.", page.locator("[data-table='hr-master'] tr[data-person]").count() == 1 and "1 of 116" in page.locator("[data-state='hr-master-count']").inner_text())
    page.locator(f"tr[data-person='{added['id']}'] [data-action='hr-master-delete']").click()
    page.wait_for_timeout(300)
    page.click("[data-action='hr-master-confirm-delete']")
    page.wait_for_timeout(500)
    page.fill("[data-field='hr-master-search']", "")
    page.wait_for_timeout(300)
    check("...and Remove takes the line off", len(sheet(page)) == 115 and person(page, added["id"]) is None and stat(page, "people") == "115")
    cell(page, "hrm-hrc-8", "gp3No").click()
    page.keyboard.type("0202")
    cell(page, "hrm-hrc-8", "department").click()
    page.keyboard.press("End")
    page.keyboard.type(" Studio")
    page.locator("[data-field='hr-master-search']").click()
    page.wait_for_timeout(400)
    bhavesh = person(page, "hrm-hrc-8")
    check("Typing a cell and clicking straight into the next keeps each value in its own column", (bhavesh["gp3No"], bhavesh["department"]) == ("0202", "Design & Development Studio"), bhavesh)
    set_cell(page, "hrm-hrc-8", "department", "Design & Development")
    page.click("[data-sort='fullName']")
    page.wait_for_timeout(400)
    first_names = page.eval_on_selector_all("[data-table='hr-master'] tr[data-person] input[data-field='fullName']", "els => els.slice(0, 5).map((e) => e.value)")
    check("A column heading sorts the sheet by it", first_names == sorted(first_names, key=str.lower) and first_names[0].lower().startswith("a"), first_names)
    page.click("[data-sort='fullName']")
    page.click("[data-sort='fullName']")
    page.wait_for_timeout(300)

    # ==================================================================
    # 3. Excel out, and back in
    # ==================================================================
    with page.expect_download() as dl:
        page.click("[data-action='hr-master-export']")
    download = dl.value
    xlsx_path = os.path.join(TMP, "exported.xlsx")
    download.save_as(xlsx_path)
    workbook, styles, rows = read_workbook(xlsx_path)
    check("Download Excel gives an .xlsx workbook named for the sheet", download.suggested_filename.endswith(".xlsx") and 'name="HR Master Data"' in workbook, download.suggested_filename)
    check("...its heading row is the six columns, bold", [rows[1][c][0] for c in "ABCDEF"] == COLUMNS and rows[1]["A"][2] == "1" and "<b/>" in styles, rows.get(1))
    sandeep_row = next((r for r in rows.values() if r.get("C", ("",))[0] == "Sandeep Parekh"), None)
    check(
        "...with a line per employee - GP3 No. as text, Joining Date and Date of Birth as real Excel dates",
        len(rows) == 116 and sandeep_row and sandeep_row["A"][:2] == ("1024", "inlineStr") and sandeep_row["B"] == (str(serial(date(2024, 7, 5))), None, "2") and sandeep_row["F"][0] == str(serial(date(1985, 3, 12))) and 'formatCode="[$-409]dd\\-mmm\\-yyyy"' in styles,
        sandeep_row,
    )

    workbook_in = os.path.join(TMP, "Employees from Excel.xlsx")
    excel_like_workbook(
        workbook_in,
        [
            ["GP-3 employee list, September 2026"],
            [],
            ["Emp No", "Name", "DOB", "Date of Joining", "Dept", "Position"],
            [1030, "Shail Patel", date(1975, 5, 1), "", "", ""],
            [1031, "Import Newcomer", "01.02.1999", "15/08/2026", "Stores", "Assistant"],
            ["1024", "Sandeep Parekh", date(1985, 3, 12), "", "", ""],
            [1031, "Someone Else", "", "", "", ""],
            ["", "Nobody Numbered", "not a date", "", "Stores", "Helper"],
            [],
        ],
    )
    page.set_input_files("[data-field='hr-master-file']", workbook_in)
    page.wait_for_timeout(1200)
    preview = page.locator("[data-section='hr-master-import-preview']")
    counts = {k: preview.locator(f"[data-count='{k}']").inner_text() for k in ["additions", "updates", "unchanged", "skipped"]} if preview.count() else {}
    check("Upload reads a workbook saved the Excel way - title line, other heading names, shared strings, compressed - and shows what it will do first",
          counts == {"additions": "2", "updates": "1", "unchanged": "1", "skipped": "1"} and "line 3" in preview.inner_text(), counts)
    left_out = preview.locator("[data-list='import-left-out']").inner_text() if preview.count() else ""
    check("...a repeated GP3 No. is left out, and a date that is not a date is named", "GP3 No. 1031 is already on line 5" in left_out and '"not a date"' in left_out, left_out)
    check("...nothing is written until it is applied", person(page, "hrm-hrc-1")["gp3No"] == "")
    page.click("[data-action='hr-master-apply-import']")
    page.wait_for_timeout(700)
    shail = person(page, "hrm-hrc-1")
    newcomer = named(page, "Import Newcomer")
    nobody = named(page, "Nobody Numbered")
    check("Applied: Shail Patel gets his GP3 No. and date of birth; the blank cells leave the rest as it was",
          (shail["gp3No"], shail["dateOfBirth"], shail["department"], shail["joiningDate"]) == ("1030", "1975-05-01", "Top management", "2014-04-01"), shail)
    check("...a new person is added, with dates written as text read day first",
          len(newcomer) == 1 and (newcomer[0]["gp3No"], newcomer[0]["joiningDate"], newcomer[0]["dateOfBirth"], newcomer[0]["department"], newcomer[0]["designation"]) == ("1031", "2026-08-15", "1999-02-01", "Stores", "Assistant"), newcomer)
    check("...and so is the line without a number, without its bad date", len(nobody) == 1 and nobody[0]["dateOfBirth"] == "" and len(sheet(page)) == 117, nobody)
    check("...and the page says what was done", "2 employees added, 1 updated" in page.locator("[data-state='hr-master-done']").inner_text())

    csv_path = os.path.join(TMP, "gp3 numbers.csv")
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        f.write('GP3 No.,Full Name,Designation/Position\r\n1041,"Rajgor, Virat",\r\n1042,Virat Rajgor,"Director - Operations"\r\n')
    page.set_input_files("[data-field='hr-master-file']", csv_path)
    page.wait_for_timeout(900)
    preview = page.locator("[data-section='hr-master-import-preview']")
    check("A CSV uploads the same way (quoted commas, a column set of its own)", preview.count() == 1 and preview.locator("[data-count='updates']").inner_text() == "1" and preview.locator("[data-count='additions']").inner_text() == "1")
    page.click("[data-action='hr-master-apply-import']")
    page.wait_for_timeout(600)
    virat = person(page, "hrm-hrc-3")
    check("...updating Virat Rajgor's GP3 No. and designation", (virat["gp3No"], virat["designation"]) == ("1042", "Director - Operations"), virat)
    zero_path = os.path.join(TMP, "without zeros.csv")
    with open(zero_path, "w", encoding="utf-8", newline="") as f:
        f.write("GP3 No.,Full Name\r\n202,Bhavesh Nagarkar\r\n")
    page.set_input_files("[data-field='hr-master-file']", zero_path)
    page.wait_for_timeout(900)
    preview = page.locator("[data-section='hr-master-import-preview']")
    check("A file that writes GP3 No. 0202 as 202 matches the line and leaves its number as it is",
          preview.count() == 1 and preview.locator("[data-count='unchanged']").inner_text() == "1" and preview.locator("[data-count='updates']").inner_text() == "0")
    page.locator(".modal-box button:has-text('Cancel')").click()
    page.wait_for_timeout(300)
    mdy_path = os.path.join(TMP, "month first.csv")
    with open(mdy_path, "w", encoding="utf-8", newline="") as f:
        f.write("Full Name,Joining Date\r\nMonth First One,5/13/2024\r\nMonth First Two,4/1/2025\r\n")
    page.set_input_files("[data-field='hr-master-file']", mdy_path)
    page.wait_for_timeout(900)
    preview = page.locator("[data-section='hr-master-import-preview']")
    added_dates = preview.locator("[data-table='import-additions'] tbody tr").all_inner_texts() if preview.count() else []
    check("A file whose slashed dates are month first is read month first throughout, and says so",
          any("13-May-2024" in r for r in added_dates) and any("01-Apr-2025" in r for r in added_dates) and "month first" in preview.inner_text(), added_dates)
    page.locator(".modal-box button:has-text('Cancel')").click()
    page.wait_for_timeout(300)
    old_xls = os.path.join(TMP, "old.xls")
    with open(old_xls, "wb") as f:
        f.write(bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) + b"\x00" * 512)
    page.set_input_files("[data-field='hr-master-file']", old_xls)
    page.wait_for_timeout(700)
    check("An old .xls is refused with what to do instead", "Save it from Excel as .xlsx" in page.locator("[data-state='hr-master-error']").inner_text() and page.locator("[data-section='hr-master-import-preview']").count() == 0)
    # the CSV's "Rajgor, Virat" line added a person of that name; take it off again
    extra = named(page, "Rajgor, Virat")
    if extra:
        page.fill("[data-field='hr-master-search']", "1041")
        page.wait_for_timeout(300)
        page.locator(f"tr[data-person='{extra[0]['id']}'] [data-action='hr-master-delete']").click()
        page.click("[data-action='hr-master-confirm-delete']")
        page.wait_for_timeout(400)

    # ==================================================================
    # 4. Fetched onto the HR formats
    # ==================================================================
    staff_id = new_record(page, "induction-staff")
    check("A new F/HR/05 record has the Fetch from HR Master Data bar", page.locator("[data-section='hr-master-fetch']").count() == 1, page.url)
    result, text = fetch(page, "1024")
    got = [header_input(page, label).input_value() for label in ["Name", "Department / Process", "Designation", "Date of Joining"]]
    check("Fetch by GP3 No. fills F/HR/05's Name, Department / Process, Designation and Date of Joining", result == "filled" and got == ["Sandeep Parekh", "HR & Admin", "Manager", "2024-07-05"], (result, got, text))
    page.wait_for_timeout(1200)
    stored = record(page, staff_id)
    check("...and the record saves it", stored and (stored["data"]["header"].get("name"), stored["data"]["header"].get("deptProcess"), stored["data"]["header"].get("dateOfJoining")) == ("Sandeep Parekh", "HR & Admin", "2024-07-05"), stored and stored["data"]["header"])
    header_input(page, "Designation").fill("Supervisor")
    page.wait_for_timeout(300)
    result, text = fetch(page, "Sandeep Parekh")
    conflicts = page.locator("[data-section='hr-master-conflicts']")
    check("A box that already says something else is listed, not replaced", result == "conflict" and conflicts.count() == 1 and "Designation: “Supervisor” → “Manager”" in conflicts.inner_text() and header_input(page, "Designation").input_value() == "Supervisor", (result, text))
    page.click("[data-action='hr-master-cancel']")
    page.wait_for_timeout(300)
    check("...Leave it keeps what the form says", header_input(page, "Designation").input_value() == "Supervisor")
    fetch(page, "sandeep parekh")
    page.click("[data-action='hr-master-replace']")
    page.wait_for_timeout(300)
    check("...and Replace writes the sheet's", header_input(page, "Designation").input_value() == "Manager")

    health_id = new_record(page, "pre-employment-health")
    name_box = header_input(page, "Name")
    name_box.fill("Shail Patel")
    name_box.blur()
    page.wait_for_timeout(500)
    check("A name on the sheet typed into F/HR/04's Name fills Department & Designation and the Date of Birth as it is left",
          header_input(page, "Department & Designation").input_value() == "Top management - CEO" and header_input(page, "Date of Birth").input_value() == "1975-05-01",
          (header_input(page, "Department & Designation").input_value(), header_input(page, "Date of Birth").input_value()))

    effectiveness_id = new_record(page, "training-effectiveness")
    result, text = fetch(page, "Swarup")
    check("Part of a name offers the people it could be (F/HR/11)", result == "several" and page.locator("[data-candidate='hrm-hrc-2']").count() == 1, (result, text))
    page.click("[data-candidate='hrm-hrc-2']")
    page.wait_for_timeout(400)
    check("...and picking one fills the Trainee's Name, Department and Designation",
          [header_input(page, l).input_value() for l in ["Trainee", "Department", "Designation"]] == ["Swarup Rajgor", "Sales & Marketing", "Director"])
    result, text = fetch(page, "Nobody Here 404")
    check("A GP3 No. or name that is not on the sheet is said so", result == "not-found" and "No one on HR Master Data" in text, text)

    induction_id = new_record(page, "induction-operators")
    induction_keys = ["name", "joining", "dateOfJoiningInduction"]
    first = page.locator("table.log-sheet tbody tr").nth(0).locator("td").nth(1).locator("input")
    first.fill("Azad Popatlal Patel")
    first.blur()
    page.wait_for_timeout(500)
    check("On F/HR/06 a name on the sheet typed into a line fills its joining department & designation and date, day first",
          row_values(page, 0, induction_keys) == {"name": "Azad Popatlal Patel", "joining": "OPERATOR - POUCH", "dateOfJoiningInduction": "01/07/2025"}, row_values(page, 0, induction_keys))
    result, text = fetch(page, "Sunny Mahesh Singh", action="hr-master-add-line")
    check("Add line puts another person on the register", result == "added" and page.locator("table.log-sheet tbody tr").count() == 2 and row_values(page, 1, induction_keys) == {"name": "Sunny Mahesh Singh", "joining": "OPERATOR - POUCH", "dateOfJoiningInduction": "20/07/2025"}, (result, text))
    result, text = fetch(page, "sunny mahesh singh", action="hr-master-add-line")
    check("...but not twice", result == "already" and page.locator("table.log-sheet tbody tr").count() == 2, text)
    result, text = fetch(page, "Sunny Singh", action="hr-master-add-line")
    check("...nor under the other spelling a register uses for the same person (F/HR/06's \"Sunny Singh\")", result == "already" and page.locator("table.log-sheet tbody tr").count() == 2, (result, text))

    goto(page, "#/record/hr-competence-2026-10-01")
    close_assistant(page)
    check("A verified register (F/HR/01) offers no fetch until it is reopened", page.locator("[data-section='hr-master-fetch']").count() == 0)
    page.click("[data-action='correct']")
    page.wait_for_timeout(400)
    page.click(".chat-chip:has-text('Typing mistake')")
    page.click("[data-action='confirm-correct']")
    page.wait_for_timeout(900)
    close_assistant(page)
    competence_keys = ["name", "department", "designation", "eduRequired", "eduAvailable", "expRequired", "expAvailable", "gapJustification", "dateOfJoining"]
    result, text = fetch(page, "1031", action="hr-master-add-line")
    count = page.locator("table.log-sheet tbody tr").count()
    new_line = row_values(page, count - 1, competence_keys)
    check("Reopened, Add line by GP3 No. adds the person to F/HR/01 in its own dotted date style",
          result == "added" and count == 81 and (new_line["name"], new_line["department"], new_line["designation"], new_line["dateOfJoining"]) == ("Import Newcomer", "Stores", "Assistant", "15.08.2026"), (result, count, new_line))
    dept = page.locator("table.log-sheet tbody tr").nth(0).locator("td").nth(2).locator("input")
    dept.fill("")
    page.wait_for_timeout(300)
    page.click("[data-action='hr-master-fill-blanks']")
    page.wait_for_timeout(500)
    res = page.locator("[data-state='hr-master-result']")
    check("Fill blanks from the sheet fills a blank box on a register's line (Shail Patel's Department) and changes nothing written",
          res.get_attribute("data-result") == "filled" and dept.input_value() == "Top management" and row_values(page, 1, competence_keys)["name"] == "Swarup Rajgor", res.inner_text())

    # ==================================================================
    # 5. Mitra - asks before it writes
    # ==================================================================
    goto(page, f"#/record/{staff_id}")
    open_mitra(page)
    check("On an HR record Mitra offers Fetch from HR Master Data", page.locator(".chat-chip:has-text('Fetch from HR Master Data')").count() >= 1)
    reply = say(page, "fetch GP3 1031")
    check("\"fetch GP3 1031\" lists what would go where and asks first", "From HR Master Data — Import Newcomer" in reply and "Fill these in?" in reply and "Designation: Manager → Assistant" in reply, reply)
    chip(page, "No, leave it")
    check("...No leaves the record as it was", header_input(page, "Name").input_value() == "Sandeep Parekh")
    reply = say(page, "fill from HR master data for Import Newcomer")
    check("\"fill from HR master data for <name>\" asks the same way", "Fill these in?" in reply, reply)
    chip(page, "Yes, fill it")
    page.wait_for_timeout(900)
    stored = record(page, staff_id)
    check("...and Yes writes it, saved", [header_input(page, l).input_value() for l in ["Name", "Department / Process", "Designation", "Date of Joining"]] == ["Import Newcomer", "Stores", "Assistant", "2026-08-15"]
          and stored["data"]["header"].get("name") == "Import Newcomer", stored and stored["data"]["header"])
    reply = say(page, "fetch GP3 1024")
    check("\"fetch GP3 1024\" on the same form lists Sandeep Parekh's details again", "From HR Master Data — Sandeep Parekh" in reply and "Fill these in?" in reply, reply)
    say(page, "yes")
    page.wait_for_timeout(700)
    check("...and a typed \"yes\" is the go-ahead", header_input(page, "Name").input_value() == "Sandeep Parekh" and header_input(page, "Department / Process").input_value() == "HR & Admin")
    reply = say(page, "fetch Sandeep Parekh")
    check("\"fetch Sandeep Parekh\" needs no mention of the sheet, and says when nothing is left to fetch", "already on the form" in reply and "nothing to fetch" in reply, reply)
    reply = say(page, "fetch GP3 9999")
    check("A GP3 No. not on the sheet is said so", "No one on HR Master Data" in reply, reply)
    close_assistant(page)

    survey_id = new_record(page, "psc-survey")
    open_mitra(page)
    page.locator(".chat-chip:has-text('Ask me question by question')").first.click()
    page.wait_for_timeout(900)
    for _ in range(4):
        question = page.locator(".chat-log .chat-msg.bot").last.inner_text()
        if "Employee name?" in question:
            reply = say(page, "8888")
            check("Asked \"Employee name?\", a GP3 No. that is nobody's is not written as the name", "No one on HR Master Data has the GP3 No." in reply, reply)
            say(page, "1024")
            break
        if "Date?" in question:
            say(page, TODAY.strftime("%d-%m-%Y"))
        else:
            break
    page.wait_for_timeout(900)
    stored = record(page, survey_id)
    h = stored["data"]["header"] if stored else {}
    check("Asked \"Employee name?\" by Mitra, a GP3 No. answers it and fills the Department and Designation too (F/HR/20)",
          (h.get("employeeName"), h.get("department"), h.get("designation")) == ("Sandeep Parekh", "HR & Admin", "Manager"), h)
    say(page, "stop")
    close_assistant(page)

    goto(page, "#/dashboard")
    open_mitra(page)
    say(page, "open HR master data", wait=1300)
    check("\"open HR master data\" opens the sheet", page.url.endswith("#/hr/master-data"), page.url)
    close_assistant(page)
    goto(page, "#/assistant")
    page.fill("textarea.assistant-input", "fetch GP3 1024")
    page.click("button[data-action='send']")
    page.wait_for_timeout(900)
    reply = page.locator(".assistant-page .chat-msg.bot").last.inner_text()
    check("The full-page Assistant says a fetch is done on an open HR record, and that GP3 1024 is on the sheet", "open HR record" in reply and "Sandeep Parekh" in reply, reply)

    # ==================================================================
    # 6. The CV import and HR Master Data
    # ==================================================================
    goto(page, "#/hr/competence")
    close_assistant(page)
    page.click("[data-action='cv-import']")
    page.wait_for_timeout(400)
    page.click("[data-action='cv-manual']")
    page.wait_for_timeout(300)
    review = page.locator("[data-section='cv-review']")
    review.locator("[data-field='joiner-name']").fill("Sandeep Parekh")
    review.locator("[data-field='joiner-name']").blur()
    page.wait_for_timeout(300)
    values = [review.locator(f"[data-field='{f}']").input_value() for f in ["joiner-gp3", "joiner-department", "joiner-designation", "joiner-doj", "joiner-dob"]]
    check("The CV import's form takes a GP3 No., and a person already on the sheet fills it in from there",
          review.locator("[data-state='cv-master-match']").count() == 1 and values == ["1024", "HR & Admin", "Manager", "2024-07-05", "1985-03-12"], values)
    page.locator(".modal-box button:has-text('Cancel')").click()
    page.wait_for_timeout(300)
    page.click("[data-action='cv-import']")
    page.wait_for_timeout(400)
    page.click("[data-action='cv-manual']")
    page.wait_for_timeout(300)
    review = page.locator("[data-section='cv-review']")
    for f, v in [("joiner-name", "Master Joiner Test"), ("joiner-department", "QC"), ("joiner-designation", "Lab Executive"), ("joiner-gp3", "1024")]:
        review.locator(f"[data-field='{f}']").fill(v)
        review.locator(f"[data-field='{f}']").blur()
    page.wait_for_timeout(300)
    check("A GP3 No. that is somebody else's on the sheet is pointed out, and Add waits for it to be corrected",
          review.locator("[data-state='cv-gp3-clash']").count() == 1 and "Sandeep Parekh" in review.locator("[data-state='cv-gp3-clash']").inner_text() and page.locator("[data-action='cv-apply']").is_disabled())
    review.locator("[data-field='joiner-gp3']").fill("2050")
    review.locator("[data-field='joiner-gp3']").blur()
    page.wait_for_timeout(300)
    check("...and correcting it takes back what that number had filled in",
          review.locator("[data-state='cv-gp3-clash']").count() == 0 and review.locator("[data-field='joiner-doj']").input_value() == TODAY.isoformat()
          and review.locator("[data-field='joiner-dob']").input_value() == "" and page.locator("[data-action='cv-apply']").is_enabled(),
          (review.locator("[data-field='joiner-doj']").input_value(), review.locator("[data-field='joiner-dob']").input_value()))
    page.click("[data-action='cv-apply']")
    page.wait_for_timeout(900)
    joined = named(page, "Master Joiner Test")
    check("A new joiner added from the CV import is put on HR Master Data with their GP3 No.",
          page.locator("[data-state='cv-master'][data-result='added']").count() == 1 and len(joined) == 1 and (joined[0]["gp3No"], joined[0]["department"], joined[0]["designation"], joined[0]["joiningDate"]) == ("2050", "QC", "Lab Executive", TODAY.isoformat()), joined)
    page.click("[data-action='cv-close']")
    page.wait_for_timeout(300)

    # ==================================================================
    # 7. Search
    # ==================================================================
    goto(page, "#/search")
    page.fill("[data-field='search-query']", "1024")
    page.wait_for_timeout(400)
    check("Search finds a person on HR Master Data by GP3 No.", page.locator("[data-search-person='hrm-hrc-38']").count() == 1)
    page.locator("[data-search-person='hrm-hrc-38'] [data-action='search-show-person']").click()
    page.wait_for_timeout(1000)
    check("...and Show on the sheet opens the sheet at that line", page.url.endswith("#/hr/master-data") and page.locator("[data-table='hr-master'] tr[data-person]").count() == 1 and page.locator("tr[data-person='hrm-hrc-38']").count() == 1)
    goto(page, "#/search")
    page.fill("[data-field='search-query']", "hr master")
    page.wait_for_timeout(400)
    check("Searching \"hr master\" offers the sheet", page.locator("[data-section='search-people'] [data-action='search-open-hr-master']").count() == 1)
    page.fill("[data-field='search-query']", "F/HR/05")
    page.wait_for_timeout(400)
    check("...and a format number lists no people", page.locator("[data-section='search-people']").count() == 0)

    # ==================================================================
    # 8. Human Resources' own
    # ==================================================================
    sign_in(page, *QC_USER)
    goto(page, "#/hr/master-data")
    check("A Quality Control account is refused HR Master Data by name", page.locator("[data-state='not-your-department']").count() == 1 and page.locator("[data-table='hr-master']").count() == 0)
    check("...has no link to it", page.locator("a[href='#/hr/master-data']").count() == 0)
    goto(page, "#/dashboard")
    open_mitra(page)
    reply = say(page, "open HR master data", wait=1100)
    check("...and Mitra tells it the sheet isn't one of its departments", "isn't one of your departments" in reply and not page.url.endswith("#/hr/master-data"), reply)
    close_assistant(page)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nHR Master Data is in the HR module, and the HR formats fetch from it.")
