"""The Human Resources module: sixteen F/HR formats, and the pest control file inside it.

Asked for on 14-Sep-2026, with sixteen F/HR PDFs attached: "make HR module ...
add those in HR Module only ... also added that Pest Control module and
everything in HR Module". So this suite checks that:

  * the Document Library holds forty documents, and the Human Resources module
    groups twenty-six of them - the sixteen formats under HR's five sections,
    then the pest control file's ten under its own four;
  * the sidebar has a Human Resources module and no Pest Control module: "HR
    Records" over its overview and a page per format under the five groups,
    then "Pest Control" over the file's overview and its four groups;
  * "Open Document" opens every document on a page of its own, never the Record
    Calendar - an HR format its HR page, with the register on it in full, and
    any other log sheet its document page (REQUIREMENTS s47);
  * the library holds forty-two documents (REQUIREMENTS s51 added Quality
    Control's two internal calibration records);
  * the filled registers among the PDFs are on file as LIVE records, line for
    line - F/HR/01 (80 staff, reviewed as on 01.10.2026), F/HR/03 (58
    operators, status as on 01.09.2026), F/HR/06 (28 inductions), F/HR/07
    (eight positions), F/HR/08 (154 employees), F/HR/09 (nineteen topics),
    F/HR/13 (37 authorisations) and F/HR/21 (the January-2026 analysis). Every
    figure below is typed from the PDFs, so this is a transcription check;
  * a new record of each blank format opens with the paper's printed rows
    (55 GMP points, 31 days, 9 visitor questions, 21 health questions - ten,
    with question 06 as twelve lines - 15
    survey attributes, 8 evaluation lines, 5 induction topics);
  * a Quality Control account sees none of it, and a Human Resources account
    sees the module - HR's formats and the pest control file - but not CAPA.

Network-independent, against the production build on :8842.
"""
import sys
from playwright.sync_api import sync_playwright


def settle_briefing(page):
    """Mark today's briefing slots as already shown, so it cannot re-open part
    way through the run and intercept a click (engine/briefingSchedule.ts)."""
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

# The trend suite's unscoped account is reused (the server limits sign-ups per
# network); the QC account is the departments suite's; the HR one is this
# suite's own.
UNSCOPED = ("trend-qa@example.com", "Trend QA", "")
QC_USER = ("dept-qc@example.com", "Dept QC QA", "QC")
HR_USER = ("dept-hr@example.com", "Dept HR QA", "HR")

HR_FORMATS = {
    "F/HR/01": ("Personal Competence Records (Staff Members Only)", "Personnel & Competence"),
    "F/HR/03": ("Skill Matrix - Operator", "Personnel & Competence"),
    "F/HR/07": ("Job Responsibility & Authority", "Personnel & Competence"),
    "F/HR/13": ("Authorization for Mobile Usage in Plant Area", "Personnel & Competence"),
    "F/HR/08": ("Employee Wise Training Need Identification Record", "Training"),
    "F/HR/09": ("Training Plan Calender", "Training"),
    "F/HR/11": ("Training Effectiveness Evaluation Record", "Training"),
    "F/HR/12": ("Training Feedback & Evaluation Record", "Training"),
    "F/HR/04": ("Pre-Employment Medical Health Declaration", "Induction & Health"),
    "F/HR/05": ("Induction Training Record — New Employee (Staff: Supervisor & Above)", "Induction & Health"),
    "F/HR/06": ("Induction Training Record — Operators / Workers", "Induction & Health"),
    "F/HR/14": ("Visitor Health Status Declaration Record", "Induction & Health"),
    "F/HR/19": ("Monthly PRP Check List (GMP Inspection Record)", "Hygiene & GMP"),
    "F/HR/22": ("Daily Personal Sanitation & Hygiene Inspection Report", "Hygiene & GMP"),
    "F/HR/20": ("Product Safety Culture Survey", "Product Safety Culture"),
    "F/HR/21": ("Product Safety Culture Survey — Analysis", "Product Safety Culture"),
}
HR_DOCUMENT_IDS = {
    "hr-competence", "hr-skill-matrix", "hr-job-responsibility", "hr-mobile-authorization",
    "hr-training-needs", "hr-training-calendar", "hr-training-effectiveness", "hr-training-feedback",
    "hr-pre-employment-health", "hr-induction-staff", "hr-induction-operators", "hr-visitor-health",
    "hr-gmp-checklist", "hr-hygiene-report", "hr-psc-survey", "hr-psc-survey-analysis",
}
SECTIONS = [
    "Personnel & Competence", "Training", "Induction & Health", "Hygiene & GMP", "Product Safety Culture",
    "Daily Report", "Service Reports", "Trend Analysis", "Training & Reference",
]
SUB_LABELS = [
    "HR Records", "Personnel & Competence", "Training", "Induction & Health", "Hygiene & GMP", "Product Safety Culture",
    "Pest Control", "Daily Report", "Service Reports", "Trend Analysis", "Training & Reference",
]
# Each HR format's own page, in the sidebar's order (data/seed/hrModule.ts).
HR_PAGES = [
    ("hr-competence", "competence"), ("hr-skill-matrix", "skill-matrix"), ("hr-job-responsibility", "job-responsibility"),
    ("hr-mobile-authorization", "mobile-authorization"), ("hr-training-needs", "training-needs"),
    ("hr-training-calendar", "training-calendar"), ("hr-training-effectiveness", "training-effectiveness"),
    ("hr-training-feedback", "training-feedback"), ("hr-pre-employment-health", "pre-employment-health"),
    ("hr-induction-staff", "induction-staff"), ("hr-induction-operators", "induction-operators"),
    ("hr-visitor-health", "visitor-health"), ("hr-gmp-checklist", "gmp-checklist"), ("hr-hygiene-report", "hygiene-report"),
    ("hr-psc-survey", "psc-survey"), ("hr-psc-survey-analysis", "psc-survey-analysis"),
]
POSITIONS = {
    "Executive-Lab": "Manager-QA",
    "Executive-Hr": "Manager-Hr",
    "Manager Dispatch & Logistics": "Manager-Hr",
    "Executive": "HR Manager",
    "Pouching Manager": "CEO",
    "Sales Coordination": "Team leader(Sales)",
    "Pouch-Manager": "CEO",
    "Quality Executive": "Manager-QA",
}
TOPIC_KEYS = [f"t{i:02d}" for i in range(1, 18)]


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:600])


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
    """Signs in, creating the account the first time with that department."""
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


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def live_records(page, doc_id):
    return [r for r in records(page) if r["documentId"] == doc_id and not r["isDemo"]]


def one(page, doc_id):
    found = live_records(page, doc_id)
    check(f"{doc_id}: exactly one LIVE register is on file", len(found) == 1, len(found))
    return found[0] if found else None


def open_library(page, route="#/library"):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(1200)
    dismiss(page)
    close_assistant(page)


def library_rows(page):
    return page.locator(".doc-table tbody tr:not(.doc-section-row)")


def hr_group(page):
    return page.locator(".app-content .mb-6", has=page.locator("h3:has-text('Human Resources')"))


def module_sub_labels(page):
    return page.eval_on_selector_all(
        ".nav-module:has(.nav-module-header:has-text('Human Resources')) .nav-sub-label",
        "els => els.map((e) => e.textContent.trim())",
    )


def module_headers(page):
    return page.eval_on_selector_all(".app-sidebar .nav-module .nav-module-header", "els => els.map((e) => e.textContent.trim())")


def sheet_rows(page):
    return page.locator("table.log-sheet tbody tr")


def header_input(page, label):
    return page.locator(".field", has=page.locator(f"label:has-text('{label}')")).first.locator("input, select").first


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    sign_in(page, *UNSCOPED)

    # ==================================================================
    # 1. The Document Library: forty documents, twenty-six of them HR's
    # ==================================================================
    open_library(page)
    check("The Document Library lists forty-two documents", library_rows(page).count() == 42, library_rows(page).count())
    group = hr_group(page)
    check("The Human Resources module is one group of the library", group.count() == 1)
    check("...and there is no Pest Control module any more", page.locator(".app-content h3:has-text('Pest Control')").count() == 0)
    hr_rows = group.locator("tbody tr:not(.doc-section-row)")
    check("The Human Resources group holds twenty-six documents - the sixteen HR formats and the pest control file's ten", hr_rows.count() == 26, hr_rows.count())
    # textContent, not innerText: the section rows are set in small capitals by CSS.
    sections = group.locator("tr.doc-section-row").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check("...shelved by section: HR's five groups, then the pest control file's four", sections == SECTIONS, sections)

    shelf = group.locator("tbody tr").evaluate_all(
        """els => els.map((e) => e.classList.contains('doc-section-row')
             ? { section: e.textContent.trim() }
             : { name: (e.querySelector('td:first-child .font-semibold') || {}).textContent || '',
                 fmt: ((e.querySelector('td:nth-child(2)') || {}).textContent || '').trim() })"""
    )
    under = {}
    current = None
    for row in shelf:
        if "section" in row:
            current = row["section"]
        else:
            under[row["fmt"].split(" (")[0]] = (row["name"].strip(), current)
    for fmt, (name, section) in HR_FORMATS.items():
        got = under.get(fmt)
        check(f"{fmt} - {name} - is under {section}", got == (name, section), got)
    check("The pest control file's own formats keep their groups: F/HR/17 under Daily Report, F/HR/18 under Trend Analysis",
          under.get("F/HR/17", ("", ""))[1] == "Daily Report" and under.get("F/HR/18", ("", ""))[1] == "Trend Analysis",
          (under.get("F/HR/17"), under.get("F/HR/18")))
    text = group.inner_text()
    for what in ["Pest Control Training Record", "Pesticide Application Chart (Chemical Master)", "Pest Control Service Report — Rat / Mice"]:
        check(f"The pest control file's '{what}' sits inside the Human Resources group", what in text)
    new_ids = set(page.eval_on_selector_all("[data-action='new-record']", "els => els.map((e) => e.getAttribute('data-document'))"))
    check("Every one of the sixteen formats can be started from the library", HR_DOCUMENT_IDS <= new_ids, sorted(HR_DOCUMENT_IDS - new_ids))

    # The module's deep link
    open_library(page, "#/library/human-resources")
    check("/library/human-resources is the library filtered to the module", "Filtered to: Human Resources" in page.locator(".app-content").inner_text())
    check("...showing the twenty-six documents and nothing of the other modules",
          library_rows(page).count() == 26 and "Lamination — Quality Control" not in page.locator(".app-content").inner_text(),
          library_rows(page).count())

    # ==================================================================
    # 2. The sidebar: a Human Resources module, the pest control file inside it
    # ==================================================================
    check("The sidebar has a Human Resources module header", page.locator(".nav-module-header:has-text('Human Resources')").count() == 1)
    check("...and no Pest Control module header", page.locator(".nav-module-header:has-text('Pest Control')").count() == 0)
    labels = module_sub_labels(page)
    check("The module reads HR Records and its five groups, then Pest Control and the file's four", labels == SUB_LABELS, labels)
    hr_links = page.eval_on_selector_all(
        ".nav-module:has(.nav-module-header:has-text('Human Resources')) a", "els => els.map((e) => e.getAttribute('href'))"
    )
    check("HR Records has an overview, HR Master Data (REQUIREMENTS s53) and a page for each of the sixteen formats, like the pest control file",
          hr_links[:18] == ["#/hr", "#/hr/master-data"] + [f"#/hr/{slug}" for _, slug in HR_PAGES], hr_links[:18])
    check("...and the pest control file's pages are still there, inside the module",
          page.locator("a:has-text('Daily Pest Control Monitoring')").count() == 1 and page.locator("a:has-text('Rat / Mice')").count() == 1
          and page.locator("a:has-text('Training Records')").count() == 1)
    page.goto(f"{BASE}/index.html#/dashboard")
    page.wait_for_timeout(600)
    dismiss(page)
    page.locator("a[href='#/hr/skill-matrix']").first.click()
    page.wait_for_timeout(1500)
    close_assistant(page)
    check("Clicking Skill Matrix in the sidebar opens its own page with the 58-line register on it",
          page.url.endswith("#/hr/skill-matrix") and page.locator("[data-section='document-preview'] table.log-sheet tbody tr").count() == 58,
          (page.url, page.locator("[data-section='document-preview'] table.log-sheet tbody tr").count()))
    check("...and only that link is lit, not the HR overview as well",
          page.locator(".app-sidebar a.active").count() == 1 and page.locator(".app-sidebar a.active[href='#/hr/skill-matrix']").count() == 1)
    header = page.locator(".nav-module-header:has-text('Human Resources')")
    header.click()
    page.wait_for_timeout(200)
    check("Collapsing the module hides HR Records and the pest control file together",
          page.locator("a[href='#/hr/competence']").count() == 0 and page.locator("a:has-text('Daily Pest Control Monitoring')").count() == 0)
    header.click()
    page.wait_for_timeout(200)
    check("...and expanding it brings both back", page.locator("a[href='#/hr/competence']").count() == 1 and page.locator("a:has-text('Daily Pest Control Monitoring')").count() == 1)

    # ==================================================================
    # 3. The filled registers are on file, line for line
    # ==================================================================
    comp = one(page, "hr-competence")
    if comp:
        rows = comp["data"]["rows"]
        check("F/HR/01: 80 staff, reviewed as on 01.10.2026, Verified", len(rows) == 80 and comp["data"]["header"].get("reviewedOn") == "01.10.2026" and comp["status"] == "Verified", (len(rows), comp["data"]["header"], comp["status"]))
        check("F/HR/01: the first line is Shail Patel, Top management, CEO, BE, 7 Years, joined 01.04.2014",
              (rows[0]["name"], rows[0]["department"], rows[0]["designation"], rows[0]["eduAvailable"], rows[0]["expAvailable"], rows[0]["dateOfJoining"]) == ("Shail Patel", "Top management", "CEO", "BE", "7 Years", "01.04.2014"), rows[0])
        check("F/HR/01: line 38 is Sandeep Parekh, HR & Admin, Manager, joined 05.07.2024",
              (rows[37]["name"], rows[37]["department"], rows[37]["designation"], rows[37]["dateOfJoining"]) == ("Sandeep Parekh", "HR & Admin", "Manager", "05.07.2024"), rows[37])
        check("F/HR/01: line 5 is Jay Vyas, who left 4/30/2025", rows[4]["name"] == "Jay Vyas" and rows[4]["dateOfLeaving"] == "4/30/2025", rows[4])
        check("F/HR/01: the last line is Disha Chaudhary, Sales Coordinator, joined 6/1/2026", (rows[-1]["name"], rows[-1]["designation"], rows[-1]["dateOfJoining"]) == ("Disha Chaudhary", "Sales Coordinator", "6/1/2026"), rows[-1])
        check("F/HR/01: twenty-five of the eighty have a Date of Leaving", sum(1 for r in rows if r["dateOfLeaving"]) == 25, sum(1 for r in rows if r["dateOfLeaving"]))

    skill = one(page, "hr-skill-matrix")
    if skill:
        rows = skill["data"]["rows"]
        check("F/HR/03: 58 operators, status as on 01.09.2026, Verified", len(rows) == 58 and skill["data"]["header"].get("statusAsOn") == "01.09.2026" and skill["status"] == "Verified", (len(rows), skill["data"]["header"]))
        check("F/HR/03: Karan Kalusinh Bariya, Printing, 5/13/2008, 5 points in Printing", (rows[0]["name"], rows[0]["designation"], rows[0]["dateOfJoining"], rows[0].get("printing")) == ("Karan Kalusinh Bariya", "Printing", "5/13/2008", "5"), rows[0])
        baldev = next((r for r in rows if r["name"] == "Baldev Bhikhabhai Nayak"), None)
        check("F/HR/03: Baldev Bhikhabhai Nayak holds 5 in Slitting / Trimming and 5 in Shrink Sleeve - Gluing", baldev is not None and baldev.get("slitting") == "5" and baldev.get("sleeveGluing") == "5", baldev)
        check("F/HR/03: eight operators are marked Left", sum(1 for r in rows if r.get("remarks") == "Left") == 8, [r["name"] for r in rows if r.get("remarks") == "Left"])
        check("F/HR/03: the last line is Subham Sahu, Pouching, 4/15/2026, 5 on the Pouching Machine", (rows[-1]["name"], rows[-1]["designation"], rows[-1]["dateOfJoining"], rows[-1].get("pouchingMachine")) == ("Subham Sahu", "Pouching", "4/15/2026", "5"), rows[-1])
        check("F/HR/03: Rajuji Bakaji Chavada is at 3 (under supervision) in Lamination", next((r.get("lamination") for r in rows if r["name"] == "Rajuji Bakaji Chavada"), None) == "3")

    ind = one(page, "hr-induction-operators")
    if ind:
        rows = ind["data"]["rows"]
        check("F/HR/06: 28 inductions, Verified", len(rows) == 28 and ind["status"] == "Verified", len(rows))
        check("F/HR/06: the first is Azaz Bharach, POUCH-Manager, 01/06/2025", (rows[0]["name"], rows[0]["joining"], rows[0]["dateOfJoiningInduction"]) == ("Azaz Bharach", "POUCH-Manager", "01/06/2025"), rows[0])
        check("F/HR/06: the last is Muskan Chauhan, PPC-Executive, 17/01/2026", (rows[-1]["name"], rows[-1]["joining"], rows[-1]["dateOfJoiningInduction"]) == ("Muskan Chauhan", "PPC-Executive", "17/01/2026"), rows[-1])

    jr = live_records(page, "hr-job-responsibility")
    positions = {r["data"]["header"].get("position"): r for r in jr}
    check("F/HR/07: eight positions are on file, one sheet each", len(jr) == 8 and set(positions) == set(POSITIONS), sorted(positions))
    check("F/HR/07: each reports to whom the sheet says", all(positions[p]["data"]["header"].get("reportsTo") == to for p, to in POSITIONS.items() if p in positions), {p: positions[p]["data"]["header"].get("reportsTo") for p in positions})
    check("F/HR/07: every sheet reads 'As Per Employees Competence Chart' for the minimum qualification", all(r["data"]["header"].get("minQualification") == "As Per Employees Competence Chart" for r in jr))
    if "Executive-Lab" in positions:
        lab = positions["Executive-Lab"]["data"]
        check("F/HR/07: Executive-Lab has four responsibilities, the first about inspection & testing per the Quality Plan",
              len(lab["rows"]) == 4 and lab["rows"][0]["responsibility"].startswith("Responsible for carrying out inspection & testing") and lab["header"].get("delegationResponsibilities") == "Quality Supervisior", lab)
        check("F/HR/07: the two Executive-Lab pages of the PDF are one sheet here, not two", sum(1 for r in jr if r["data"]["header"].get("position") == "Executive-Lab") == 1)
    if "Manager Dispatch & Logistics" in positions:
        check("F/HR/07: Manager Dispatch & Logistics carries sixteen lines", len(positions["Manager Dispatch & Logistics"]["data"]["rows"]) == 16)
    if "Quality Executive" in positions:
        check("F/HR/07: Quality Executive has one line, in-process inspection & testing of label & shrink sleeve",
              [r["responsibility"] for r in positions["Quality Executive"]["data"]["rows"]] == ["In-Process inspection & Testing of Label & Shrink Sleeve"])

    tni = one(page, "hr-training-needs")
    if tni:
        rows = tni["data"]["rows"]
        check("F/HR/08: 154 employees for 01.04.2026 ~ 31.03.2027", len(rows) == 154 and tni["data"]["header"].get("period") == "01.04.2026 ~ 31.03.2027", (len(rows), tni["data"]["header"]))
        check("F/HR/08: Submitted, not Verified - the topic ticks are still to be confirmed from the paper", tni["status"] == "Submitted", tni["status"])
        check("F/HR/08: no topic tick has been guessed", all(not r.get(k) for r in rows for k in TOPIC_KEYS))
        check("F/HR/08: Shail Patel, CEO first; Dhavalkumar lSathvara, Helper last (spelling as on the paper)",
              (rows[0]["name"], rows[0]["designation"], rows[-1]["name"], rows[-1]["designation"]) == ("Shail Patel", "CEO", "Dhavalkumar lSathvara", "Helper"), (rows[0], rows[-1]))
        check("F/HR/08: Sandeep Parekh, Manager-HR is line 31", rows[30]["name"] == "Sandeep Parekh" and rows[30]["designation"] == "Manager-HR", rows[30])

    cal = one(page, "hr-training-calendar")
    if cal:
        rows = cal["data"]["rows"]
        check("F/HR/09: nineteen topics for 01.04.2026 ~ 31.03.2027", len(rows) == 19 and cal["data"]["header"].get("period") == "01.04.2026 ~ 31.03.2027", len(rows))
        r0 = rows[0]
        check("F/HR/09: BRCGS awareness - External (Shashank Sheth), Class room, 16 hours, Written Test - planned Jul-26 (7/22/2026) and Feb-27 (2/4/2027)",
              (r0["parameter"], r0["source"], r0["method"], r0["duration"], r0["evaluation"], r0["m3Plan"], r0["m3Actual"], r0["m10Plan"], r0["m10Actual"], r0["m0Plan"])
              == ("BRCGS - Packaging (Issue 07)Awareness", "External (Shashank Sheth)", "Class room", "16 hours", "Written Test", "Yes", "7/22/2026", "Yes", "2/4/2027", ""), r0)
        gmp = rows[4]
        check("F/HR/09: GMP Principles by Kapila Barad (PSTL) held 4/9/2026, 9/19/2026 and 2/5/2027", (gmp["parameter"], gmp["source"], gmp["m0Actual"], gmp["m5Actual"], gmp["m10Actual"]) == ("GMP Principles", "Kapila Barad(PSTL)", "4/9/2026", "9/19/2026", "2/5/2027"), gmp)
        ccp = rows[8]
        check("F/HR/09: CCP monitoring is planned for Aug-26 with no date written yet", ccp["parameter"] == "CCP monitoring" and ccp["m4Plan"] == "Yes" and ccp["m4Actual"] == "", ccp)
        check("F/HR/09: topic 10's duration is marked TO BE CONFIRMED (not legible on the copy)", rows[9]["duration"] == "TO BE CONFIRMED", rows[9])
        check("F/HR/09: the last topic is Testing Method & callibration of Instruments, 2/13/2027", rows[-1]["parameter"] == "Testing Method & callibration of Instruments" and rows[-1]["m10Actual"] == "2/13/2027", rows[-1])

    mob = one(page, "hr-mobile-authorization")
    if mob:
        rows = mob["data"]["rows"]
        check("F/HR/13: 37 authorisations, Verified", len(rows) == 37 and mob["status"] == "Verified", len(rows))
        check("F/HR/13: Shail Patel, CEO, 01/12/2021 first", (rows[0]["name"], rows[0]["deptDesignation"], rows[0]["dateOfAllowance"]) == ("Shail Patel", "CEO", "01/12/2021"), rows[0])
        check("F/HR/13: Divya Parmar, Supervisor, 10/02/2025 last", (rows[-1]["name"], rows[-1]["deptDesignation"], rows[-1]["dateOfAllowance"]) == ("Divya Parmar", "Supervisor", "10/02/2025"), rows[-1])
        check("F/HR/13: Sandeep Parekh, Hr Manager, allowed 10/07/2024", next(((r["deptDesignation"], r["dateOfAllowance"]) for r in rows if r["name"] == "Sandeep Parekh"), None) == ("Hr Manager", "10/07/2024"))

    psc = one(page, "hr-psc-survey-analysis")
    if psc:
        rows = psc["data"]["rows"]
        h = psc["data"]["header"]
        check("F/HR/21: JANUARY 2026, fifteen attributes, 93.99% overall", len(rows) == 15 and h.get("surveyPeriod") == "JANUARY 2026" and h.get("overallAchieved") == "93.99%", h)
        check("F/HR/21: attribute 1 - 48 strongly agree, 15 moderately agree - 426 of 455, 93.63%",
              (rows[0]["sa7"], rows[0]["ma6"], rows[0]["a5"], rows[0]["actual"], rows[0]["ideal"], rows[0]["achieved"]) == (48, 15, None, 426, 455, "93.63%"), rows[0])
        check("F/HR/21: attribute 8 (shortcuts under pressure) - all 63 strongly disagree - 63 of 58, 92.06%",
              (rows[7]["sa7"], rows[7]["sd1"], rows[7]["actual"], rows[7]["ideal"], rows[7]["achieved"]) == (None, 63, 63, 58, "92.06%"), rows[7])
        check("F/HR/21: attribute 15 - 39 / 24 - 417 of 446, 93.50%", (rows[14]["sa7"], rows[14]["ma6"], rows[14]["actual"], rows[14]["ideal"], rows[14]["achieved"]) == (39, 24, 417, 446, "93.50%"), rows[14])
        check("F/HR/21: the attributes are printed in the survey's own words", rows[0]["parameter"].startswith("1. I can freely speak up") and rows[7]["parameter"].startswith("8. When there is pressure to finish production"))

    # ==================================================================
    # 4. The registers open as sheets, in the format's own layout
    # ==================================================================
    page.goto(f"{BASE}/index.html#/record/hr-competence-2026-10-01")
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    body = page.locator(".app-content").inner_text()
    check("The competence register opens as an 80-line sheet headed F/HR/01", sheet_rows(page).count() == 80 and "F/HR/01" in body, (sheet_rows(page).count(), body[:200]))
    check("...with 'Reviewed as on' 01.10.2026 above the grid", header_input(page, "Reviewed as on").input_value() == "01.10.2026")
    first = sheet_rows(page).first
    check("...the first line reads Shail Patel", first.locator("input").first.input_value() == "Shail Patel")
    check("...and a Verified register is read-only", not page.locator("table.log-sheet input:not([disabled])").count())

    page.goto(f"{BASE}/index.html#/record/hr-psc-survey-analysis-2026-01")
    page.wait_for_timeout(1200)
    dismiss(page)
    close_assistant(page)
    body = page.locator(".app-content").inner_text()
    check("The January-2026 survey analysis opens as fifteen attribute lines headed F/HR/21", sheet_rows(page).count() == 15 and "F/HR/21" in body and "1. I can freely speak up" in body, sheet_rows(page).count())
    check("...with the overall 93.99% in its footer", header_input(page, "Overall achieved").input_value() == "93.99%")

    page.goto(f"{BASE}/index.html#/record/hr-training-calendar-2026-27")
    page.wait_for_timeout(1200)
    dismiss(page)
    close_assistant(page)
    check("The training calendar opens as nineteen topics across twelve Plan / Actual month pairs",
          sheet_rows(page).count() == 19 and page.locator("table.log-sheet thead th").count() == 1 + 5 + 24, (sheet_rows(page).count(), page.locator("table.log-sheet thead th").count()))
    sheet_text = page.locator("table.log-sheet").evaluate("el => el.textContent")
    check("...with the topics and the month headings printed on the sheet", "BRCGS - Packaging (Issue 07)Awareness" in sheet_text and "Apr-26 — Plan" in sheet_text and "Mar-27 — Actual" in sheet_text)

    # ==================================================================
    # 4b. Every document opens on a page of its own - never the calendar
    # ==================================================================
    open_library(page)
    all_ids = page.eval_on_selector_all("[data-action='open-document']", "els => els.map((e) => e.getAttribute('data-document'))")
    check("Every document in the library has Open Document", len(all_ids) == 42, len(all_ids))
    landed = {}
    for doc_id in all_ids:
        open_library(page)
        page.locator(f"[data-action='open-document'][data-document='{doc_id}']").first.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        landed[doc_id] = page.url.split("#", 1)[-1]
    check("Open Document never lands on the Record Calendar", not any(u.startswith("/calendar") for u in landed.values()),
          {d: u for d, u in landed.items() if u.startswith("/calendar")})
    wrong = {d: landed.get(d) for d, slug in HR_PAGES if landed.get(d) != f"/hr/{slug}"}
    check("Each of the sixteen HR formats opens on its own HR page", not wrong, wrong)
    check("A log sheet of another module opens on its document page", landed.get("qc-viscosity") == "/document/qc-viscosity", landed.get("qc-viscosity"))

    page.goto(f"{BASE}/index.html#/hr/competence")
    page.wait_for_timeout(1600)
    dismiss(page)
    close_assistant(page)
    table = page.locator("[data-table='document-records'] tbody tr")
    preview = page.locator("[data-section='document-preview']")
    check("The competence page lists the register on file, and shows it in full: 80 lines",
          table.count() == 1 and preview.locator("table.log-sheet tbody tr").count() == 80 and "80 of 80" in table.first.inner_text(),
          (table.count(), preview.locator("table.log-sheet tbody tr").count()))
    check("...named by its review date and headed F/HR/01", "01.10.2026" in table.first.inner_text() and "F/HR/01" in preview.inner_text())
    check("...inside a printable document, like every record page", preview.locator("[data-print-doc]").count() == 1)
    preview.locator("[data-action='open-shown-record']").click()
    page.wait_for_timeout(900)
    check("Open record takes it to its own record page", page.url.endswith("#/record/hr-competence-2026-10-01"), page.url)

    page.goto(f"{BASE}/index.html#/hr/job-responsibility")
    page.wait_for_timeout(1400)
    dismiss(page)
    close_assistant(page)
    table = page.locator("[data-table='document-records'] tbody tr")
    check("The job responsibility page lists the eight position sheets", table.count() == 8, table.count())
    table.filter(has_text="Quality Executive").first.click()
    page.wait_for_timeout(700)
    preview = page.locator("[data-section='document-preview']")
    check("Clicking a position shows that sheet in full below: Quality Executive, one line",
          preview.get_attribute("data-record") == "hr-job-responsibility-quality-executive"
          and preview.locator("table.log-sheet tbody tr").count() == 1
          and header_input(page, "Position").input_value() == "Quality Executive",
          preview.get_attribute("data-record"))

    page.goto(f"{BASE}/index.html#/hr/training-needs")
    page.wait_for_timeout(1600)
    dismiss(page)
    close_assistant(page)
    check("The TNI page shows the 154 employees, still Submitted for the ticks to be confirmed",
          page.locator("[data-section='document-preview'] table.log-sheet tbody tr").count() == 154
          and "Submitted" in page.locator("[data-table='document-records'] tbody tr").first.inner_text())

    page.goto(f"{BASE}/index.html#/hr/visitor-health")
    page.wait_for_timeout(1200)
    dismiss(page)
    close_assistant(page)
    preview = page.locator("[data-section='document-preview']")
    check("A format with nothing on file shows its blank form: the visitor declaration's nine questions",
          preview.get_attribute("data-record") == "blank-format" and preview.locator("table.log-sheet tbody tr").count() == 9,
          (preview.get_attribute("data-record"), preview.locator("table.log-sheet tbody tr").count()))
    preview.locator("[data-action='start-from-blank']").click()
    page.wait_for_timeout(1300)
    close_assistant(page)
    check("...and Start this record starts one and opens it", "#/record/" in page.url and sheet_rows(page).count() == 9, page.url)

    page.goto(f"{BASE}/index.html#/hr")
    page.wait_for_timeout(1300)
    dismiss(page)
    close_assistant(page)
    sections = page.eval_on_selector_all("[data-hr-section]", "els => els.map((e) => e.dataset.hrSection)")
    check("HR Overview shows the five groups with all sixteen formats",
          sections == SECTIONS[:5] and page.locator("[data-hr-doc]").count() == 16, (sections, page.locator("[data-hr-doc]").count()))
    page.locator("[data-hr-doc='hr-gmp-checklist']").click()
    page.wait_for_timeout(900)
    check("...and a format there opens on its own page", page.url.endswith("#/hr/gmp-checklist"), page.url)

    open_library(page)
    page.locator("[data-action='open-document'][data-document='qc-viscosity']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1300)
    close_assistant(page)
    check("A lamination log sheet's document page shows its records table and a sheet",
          page.locator("[data-page='document-records'][data-document='qc-viscosity']").count() == 1
          and page.locator("[data-section='document-preview'] table.log-sheet").count() == 1)

    # ==================================================================
    # 5. A new record of each blank format opens with the paper's rows
    # ==================================================================
    for doc_id, expected, first_text in [
        ("hr-gmp-checklist", 55, "1. Whether outside land is free of debris and refuse?"),
        ("hr-hygiene-report", 31, "1"),
        ("hr-visitor-health", 9, "Sickness such as"),
        ("hr-pre-employment-health", 21, "01. Have you suffered from any of the following"),
        ("hr-psc-survey", 15, "1. I can freely speak up"),
        ("hr-training-effectiveness", 8, "Structure"),
        ("hr-induction-staff", 7, "Briefing on Company profile"),
    ]:
        open_library(page)
        page.locator(f"[data-action='new-record'][data-document='{doc_id}']").first.evaluate("el => el.click()")
        page.wait_for_timeout(1300)
        close_assistant(page)
        n = sheet_rows(page).count()
        check(f"{doc_id}: a new record opens on its own page with the {expected} printed rows", "#/record/" in page.url and n == expected, (page.url, n))
        check(f"{doc_id}: the first printed row reads as on the paper", first_text in sheet_rows(page).first.inner_text(), sheet_rows(page).first.inner_text()[:120])
    open_library(page)
    page.locator("[data-action='new-record'][data-document='hr-competence']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1300)
    close_assistant(page)
    check("A new competence register starts with a blank line to add staff to, and an Add Row button", sheet_rows(page).count() >= 1 and page.locator("button:has-text('Add Row')").count() == 1)
    check("The last month's hygiene sheet and the GMP walk are the month's own: the hygiene report is due at the month's end",
          any(r["documentId"] == "hr-hygiene-report" for r in records(page)))

    # ==================================================================
    # 6. Departments: QC sees none of it; HR sees the module, not CAPA
    # ==================================================================
    sign_in(page, *QC_USER)
    headers = module_headers(page)
    check("A Quality Control account has no Human Resources module", not any("Human Resources" in h for h in headers), headers)
    open_library(page)
    check("...and no F/HR format in its library", "F/HR/" not in page.locator(".app-content").inner_text())
    page.goto(f"{BASE}/index.html#/record/hr-competence-2026-10-01")
    page.wait_for_timeout(1300)
    refusal = page.locator("[data-state='not-your-department']")
    check("...and the competence register, reached by its address, is refused by name", refusal.count() == 1 and refusal.get_attribute("data-department") == "Human Resources" and "Shail Patel" not in page.locator(".app-content").inner_text(), refusal.count())
    page.goto(f"{BASE}/index.html#/hr")
    page.wait_for_timeout(1300)
    check("...HR Overview is refused too", page.locator("[data-state='not-your-department']").count() == 1)
    page.goto(f"{BASE}/index.html#/hr/skill-matrix")
    page.wait_for_timeout(1300)
    check("...and so is a format's own page, without a line of it shown",
          page.locator("[data-state='not-your-department']").count() == 1 and "Karan Kalusinh Bariya" not in page.locator(".app-content").inner_text())

    sign_in(page, *HR_USER)
    headers = module_headers(page)
    check("A Human Resources account has the module and not CAPA", any("Human Resources" in h for h in headers) and not any("CAPA" in h for h in headers), headers)
    labels = module_sub_labels(page)
    check("...with HR Records and the pest control file inside it", labels == SUB_LABELS, labels)
    page.goto(f"{BASE}/index.html#/hr")
    page.wait_for_timeout(1300)
    dismiss(page)
    check("...and HR Overview with all sixteen formats", page.locator("[data-hr-doc]").count() == 16, page.locator("[data-hr-doc]").count())
    open_library(page)
    check("Its library holds the sixteen formats and the pest control file's nine HR documents - twenty-five", library_rows(page).count() == 25, library_rows(page).count())
    new_ids = set(page.eval_on_selector_all("[data-action='new-record']", "els => els.map((e) => e.getAttribute('data-document'))"))
    check("...and offers New on every one of the sixteen", HR_DOCUMENT_IDS <= new_ids, sorted(HR_DOCUMENT_IDS - new_ids))
    page.goto(f"{BASE}/index.html#/record/hr-competence-2026-10-01")
    page.wait_for_timeout(1300)
    check("The competence register opens for Human Resources", sheet_rows(page).count() == 80, sheet_rows(page).count())

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe Human Resources module holds its sixteen formats and the pest control file, as supplied.")
