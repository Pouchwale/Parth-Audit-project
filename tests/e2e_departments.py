"""Departments: every document belongs to one, and a person sees only theirs.

Also covers the other two requests of 13-Sep-2026 that came with it:

  * PRINTING PRINTS THE WHOLE DOCUMENT (REQUIREMENTS §38) — a list that is a
    document on paper now carries the company's own header block (company name,
    title, Format No. / Rev No.), and a table is no longer a scroll container
    under print media, which used to clip everything past the first page.
  * THE TREND GRAPH FOLLOWS THE DATA (REQUIREMENTS §39) — the Rodent Catch
    Report's chart is an inline SVG built from the same rows as the table, not a
    picture: its bars carry the table's own figures, it redraws when the year is
    changed, and the year picker no longer offers a year that cannot have any.
  * DEPARTMENTS (REQUIREMENTS §40) — the plant's own Master List of Formats &
    Records (F/SYS/02) groups every format by the department inside its number
    (F-QC-30 is Quality Control's, F-HR-17 is HR's). A QC account sees the nine
    QC documents and nothing else: not in the library, not in the sidebar, not
    on the calendar, not through search or the assistant, and not by typing
    another department's record address.

Network-independent, against the production build on :8842. Two fixed accounts
are used (created only the first time, like the other fixed-account suites):
one left unassigned, which therefore covers every department, and one assigned
to Quality Control at signup.
"""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8842"
FAILURES = []

ALL_DEPARTMENT_CODES = ["SYS", "MKT", "PUR", "STR", "QC", "QA", "PRD", "MNT", "HR", "DISP"]
# The nine documents whose format number is F-QC-... on the company's master list.
QC_DOCUMENT_IDS = {
    "qc-viscosity",
    "qc-adhesive-mixing",
    "qc-temperature",
    "qc-inspection-pouching",
    "qc-inspection-slitting",
    "qc-inspection-printed-film",
    "qc-inprocess-printing",
    "soc-labels",
    "soc-flexible-packaging",
}

UNSCOPED = ("dept-all@example.com", "Dept All QA", "")
QC_USER = ("dept-qc@example.com", "Dept QC QA", "QC")
PASSWORD = "PlaywrightQA123"


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:500])


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


def me(page):
    return page.evaluate("() => fetch('/api/auth/me', {credentials:'include'}).then((r) => r.json())")


def library_documents(page):
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(1200)
    dismiss(page)
    return page.eval_on_selector_all(
        ".doc-table tbody tr td:first-child .font-semibold", "els => els.map((e) => e.textContent.trim())"
    )


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


PRINTED = """
  () => {
    const shown = (el) => !!el && el.getClientRects().length > 0;
    const docs = Array.from(document.querySelectorAll('[data-print-doc]')).filter(shown);
    const inDoc = (el) => docs.some((d) => d.contains(el));
    const outside = (sel) =>
      Array.from(document.querySelectorAll(sel)).filter((el) => shown(el) && !inDoc(el)).length;
    const tables = docs.flatMap((d) => Array.from(d.querySelectorAll('.doc-table')));
    return {
      documents: docs.length,
      companyNames: docs.flatMap((d) => Array.from(d.querySelectorAll('.company-name')).map((c) => c.textContent.trim())),
      formatNos: docs.flatMap((d) => Array.from(d.querySelectorAll('.meta-cell .v')).map((v) => v.textContent.trim())),
      sidebar: shown(document.querySelector('.app-sidebar')),
      topbar: shown(document.querySelector('.app-topbar')),
      headings: outside('h1, h2'),
      buttonsOutside: outside('button'),
      tableCount: tables.length,
      clippedTables: tables.filter((t) => {
        const o = getComputedStyle(t);
        return o.overflowX !== 'visible' || o.overflowY !== 'visible';
      }).length,
    };
  }
"""


def printout(page):
    """What reaches the paper, through the browser's own Print path."""
    page.evaluate("() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }")
    page.evaluate("() => window.dispatchEvent(new Event('beforeprint'))")
    page.emulate_media(media="print")
    try:
        return page.evaluate(PRINTED)
    finally:
        page.emulate_media(media="screen")
        page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")


def cells(page, selector):
    return [c for c in page.eval_on_selector_all(selector, "els => els.map((e) => e.textContent.trim())") if c != ""]


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ==================================================================
    # 1. An account with no department assigned covers every department
    # ==================================================================
    sign_in(page, *UNSCOPED)
    who = me(page)
    check("An account with no department assigned is stored with none", who.get("user", {}).get("departments") == [], who)
    all_docs = library_documents(page)
    check("...and its Document Library holds the whole catalogue", len(all_docs) >= 25, len(all_docs))
    all_modules = page.eval_on_selector_all(".app-sidebar .nav-module", "els => els.length")
    check("...and every module is in the sidebar", all_modules >= 6, all_modules)

    # ==================================================================
    # 2. Printing prints the whole document (REQUIREMENTS §38)
    # ==================================================================
    page.goto(f"{BASE}/index.html#/pest/daily")
    page.wait_for_timeout(1400)
    dismiss(page)
    close_assistant(page)
    page.locator(".pill-tab", has_text=re.compile("list", re.I)).first.click()
    page.wait_for_timeout(800)
    seen = printout(page)
    check(
        "The daily status list prints as a document, with the company's own header block",
        seen["documents"] >= 1 and any("GUJARAT" in c.upper() for c in seen["companyNames"]),
        seen,
    )
    check("...carrying the register's Format No.", "F/HR/17" in seen["formatNos"], seen["formatNos"])
    check(
        "...and nothing around it: no panel, top bar, page title or buttons",
        not seen["sidebar"] and not seen["topbar"] and seen["headings"] == 0 and seen["buttonsOutside"] == 0,
        seen,
    )
    check(
        "A printed table is no longer a scroll container, so nothing past page one is clipped",
        seen["tableCount"] > 0 and seen["clippedTables"] == 0,
        seen,
    )

    page.goto(f"{BASE}/index.html#/pest/service/rodent")
    page.wait_for_timeout(1400)
    dismiss(page)
    close_assistant(page)
    seen = printout(page)
    check(
        "The service report's visit register prints with its own header block too",
        seen["documents"] >= 1 and any("GUJARAT" in c.upper() for c in seen["companyNames"]),
        seen,
    )

    # ==================================================================
    # 3. The trend graph is drawn from the data (REQUIREMENTS §39)
    # ==================================================================
    page.goto(f"{BASE}/index.html#/pest/trend/rodent")
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    check("The rodent trend report is the company's own sheet", page.locator(".trend-sheet").count() == 1)
    check(
        "The chart is an inline SVG, not a picture",
        page.locator(".trend-chart svg").count() == 1 and page.locator(".trend-chart img").count() == 0,
    )
    check("...with a bar for every month and one for the total", page.locator(".trend-chart .bar").count() == 13)
    drawn = page.get_attribute(".trend-sheet", "data-chart-year")
    check("The sheet says which year the chart is drawing", bool(drawn and drawn.isdigit()), drawn)

    # The bars must carry the figures of that year's own table row — that is
    # what makes it a chart OF the data rather than a picture of one.
    expected = cells(page, f".trend-table tbody tr[data-year='{drawn}'] td[data-month]") + cells(
        page, f".trend-table tbody tr[data-year='{drawn}'] td.total-cell"
    )
    bar_labels = cells(page, ".trend-chart .bar .value")
    check(
        "Every bar carries the figure the table shows for that month, and the total bar the row's total",
        bar_labels == expected,
        {"bars": bar_labels, "table": expected, "year": drawn},
    )

    options = page.eval_on_selector_all("select[data-select='year'] option", "els => els.map((e) => e.value)")
    check(
        "The year picker never offers a year that hasn't happened",
        len(options) > 0 and all(int(o) <= int(drawn) for o in options),
        options,
    )
    others = [o for o in options if o != drawn]
    if others:
        page.select_option("select[data-select='year']", others[0])
        page.wait_for_timeout(1000)
        now_drawn = page.get_attribute(".trend-sheet", "data-chart-year")
        check("Choosing another year redraws the chart for that year", now_drawn == others[0], (now_drawn, others[0]))
        new_expected = cells(page, f".trend-table tbody tr[data-year='{now_drawn}'] td[data-month]") + cells(
            page, f".trend-table tbody tr[data-year='{now_drawn}'] td.total-cell"
        )
        check(
            "...and the new bars are that year's own figures",
            cells(page, ".trend-chart .bar .value") == new_expected,
            {"bars": cells(page, ".trend-chart .bar .value"), "table": new_expected},
        )

    years = page.eval_on_selector_all(".trend-table tbody tr[data-year]", "els => els.map((e) => e.dataset.year)")
    check("The table carries one row per year", len(years) == len(set(years)) and len(years) >= 2, years)

    # ==================================================================
    # 4. Master Data -> Departments & access lists the plant's own ten
    # ==================================================================
    page.goto(f"{BASE}/index.html#/master-data")
    page.wait_for_timeout(1200)
    dismiss(page)
    page.locator(".pill-tab", has_text="Departments & access").first.click()
    page.wait_for_timeout(800)
    codes = page.eval_on_selector_all("[data-table='departments'] tbody tr", "els => els.map((e) => e.dataset.department)")
    check("All ten departments of the master list are configured", codes == ALL_DEPARTMENT_CODES, codes)
    qc_row = page.locator("[data-table='departments'] tbody tr[data-department='QC']").inner_text()
    check("...each with the documents it owns (Quality Control has nine)", "9" in qc_row and "F-QC" in qc_row, qc_row[:200])

    # ==================================================================
    # 5. A Quality Control account sees QC's documents and nothing else
    # ==================================================================
    sign_in(page, *QC_USER)
    who = me(page)
    check("An account assigned to QC at signup is stored that way", who.get("user", {}).get("departments") == ["QC"], who)
    check("...and is ordinary staff, not the administrator", who.get("user", {}).get("role") == "staff", who)

    qc_docs = library_documents(page)
    check(
        "Its Document Library holds only Quality Control's nine documents",
        len(qc_docs) == 9 and len(qc_docs) < len(all_docs),
        {"count": len(qc_docs), "docs": qc_docs},
    )
    ids = page.eval_on_selector_all("[data-action='new-record']", "els => els.map((e) => e.dataset.document)")
    check("...and offers New only on those it may hold records for", set(ids) <= QC_DOCUMENT_IDS, ids)
    modules = page.eval_on_selector_all(
        ".app-sidebar .nav-module .nav-module-header", "els => els.map((e) => e.textContent.trim())"
    )
    check(
        "The sidebar drops the modules that hold no QC document",
        len(modules) < all_modules and not any("Pest Control" in m for m in modules) and not any("CAPA" in m for m in modules),
        modules,
    )

    # Another department's own page refuses, by name, instead of crashing.
    page.goto(f"{BASE}/index.html#/pest/daily")
    page.wait_for_timeout(1300)
    refusal = page.locator("[data-state='not-your-department']")
    check(
        "Another department's register refuses instead of opening",
        refusal.count() == 1,
        page.locator(".app-content").inner_text()[:300],
    )
    if refusal.count() == 1:
        check("...naming the department that owns it", refusal.get_attribute("data-department") == "Human Resources", refusal.get_attribute("data-department"))
        check("...and saying who can give them access", "administrator" in refusal.inner_text().lower(), refusal.inner_text()[:300])

    page.goto(f"{BASE}/index.html#/gap/external")
    page.wait_for_timeout(1100)
    check(
        "Marketing's complaint checklist refuses too",
        page.locator("[data-state='not-your-department']").count() == 1,
        page.locator(".app-content").inner_text()[:200],
    )

    # A record address typed by hand is refused, and none of its fields shown.
    hr_record = next((r for r in records(page) if r["documentId"] == "daily-pest-monitoring" and not r["isDemo"]), None)
    check("There is a Human Resources record on file to try", bool(hr_record))
    if hr_record:
        page.goto(f"{BASE}/index.html#/record/{hr_record['id']}")
        page.wait_for_timeout(1200)
        body = page.locator(".app-content").inner_text()
        check(
            "A record reached by its own address is refused, not shown",
            page.locator("[data-state='not-your-department']").count() == 1 and "Time of checking" not in body,
            body[:300],
        )
        check("...and it is not reported as a missing document definition", "definition missing" not in body.lower(), body[:200])

    # Nothing of another department leaks into the shared screens.
    page.goto(f"{BASE}/index.html#/calendar")
    page.wait_for_timeout(1400)
    dismiss(page)
    cal = page.locator(".app-content").inner_text()
    check(
        "The Record Calendar shows no Human Resources paperwork",
        "Daily Pest Control" not in cal and "Fly Catcher" not in cal,
        cal[:300],
    )

    page.goto(f"{BASE}/index.html#/search")
    page.wait_for_timeout(1000)
    dismiss(page)
    box = page.locator(".app-content input").first
    if box.count():
        box.fill("pest")
        page.wait_for_timeout(1000)
        check(
            "Searching for another department's document finds nothing",
            "Daily Pest Control Monitoring" not in page.locator(".app-content").inner_text(),
            page.locator(".app-content").inner_text()[:300],
        )

    # The assistant answers for this department only.
    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_timeout(1000)
    dismiss(page)
    page.fill("textarea.assistant-input", "give me the CAPA summary")
    page.click("[data-action='send']")
    page.wait_for_timeout(1400)
    reply = page.locator(".chat-msg.bot").last.inner_text()
    check(
        "The assistant will not report another department's CAPA figures",
        "Internal —" not in reply and "External —" not in reply,
        reply[:300],
    )

    # A staff account cannot give itself another department.
    page.goto(f"{BASE}/index.html#/master-data")
    page.wait_for_timeout(1100)
    dismiss(page)
    page.locator(".pill-tab", has_text="Departments & access").first.click()
    page.wait_for_timeout(800)
    check(
        "Only the administrator may change an assignment, and staff are told so",
        page.locator("[data-state='not-admin']").count() == 1,
        page.locator("[data-section='departments-access']").inner_text()[:300],
    )
    check("...and the accounts table is not shown to them", page.locator("[data-table='user-access']").count() == 0)
    status = page.evaluate("() => fetch('/api/users', {credentials:'include'}).then((r) => r.status)")
    check("...and the API refuses them the list of accounts", status == 403, status)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nEvery document belongs to a department, and a person sees only theirs.")
