"""The company's three pest trend reports, cell for cell against the paper.

Asked for on 13-Sep-2026, with "GP-3 Trend Analysis - 2025.pdf" attached: "add
this three different trends analysis and make sure that what i provided you i
want exactly". So this suite is a transcription check, not a smoke test: every
figure below is typed from the supplied PDF, and the assertions fail if the
system shows anything else.

  page 1  RODENT CATCH REPORT AND TREND ANALYSIS   glue boards / Number / Rodents
  page 2  LIZARD CATCH REPORT AND TREND ANALYSIS   glue boards / Number / Lizard
  page 3  FLIES CATCH REPORT AND TREND ANALYSIS    EFKs / Gramms / Flies

The same batch also withdrew two things, and they are checked here because they
came with the same request: the Attended tick box on the Training Record, and
the SOP Reference in the Pest Control module.

The 2024 and 2025 rows are transcribed figures, never computed: this system's
Live register cannot hold a record dated before the browser first ran it
(engine/recordGenerator.ts's launch-date floor), so those two years are the
company's own report on every one of these sheets and are the same on every
machine. Network-independent, against the production build on :8842.
"""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8842"
FAILURES = []

GLUE_BOARDS = "Trapped on Glue boards in Roda-boxes"
BLANK = ""

# ---- exactly as printed on the supplied PDF -------------------------------
RODENT = {
    "route": "#/pest/trend/rodent",
    "title": "RODENT CATCH REPORT AND TREND ANALYSIS",
    "rows": {
        "2024": [GLUE_BOARDS, "Number", "Rodents", ["0"] * 12, "0"],
        "2025": [GLUE_BOARDS, "Number", "Rodents", ["0", "0", "0", "0", "1", "1", "0", "0", "0", "0", "0", "0"], "2"],
    },
}
LIZARD = {
    "route": "#/pest/trend/lizard",
    "title": "LIZARD CATCH REPORT AND TREND ANALYSIS",
    "rows": {
        "2024": [GLUE_BOARDS, "Number", "Lizard", ["0", "0", "1", "0", "1", "0", "0", "0", "0", "1", "0", "0"], "3"],
        # reported to November; December and the Total are blank on the page
        "2025": [GLUE_BOARDS, "Number", "Lizard", ["0", "0", "0", "1", "0", "0", "0", "0", "1", "0", "1", BLANK], BLANK],
    },
}
FLIES = {
    "route": "#/pest/trend/fly-catcher",
    "title": "FLIES CATCH REPORT AND TREND ANALYSIS",
    "rows": {
        "2024": [
            "Collected in EFKs",
            "Gramms",
            "Flies",
            ["30", "22", "22", "16", "15", "17", "15", "13", "22", "24", "22", "17"],
            "235",
        ],
        # reported to October; November, December and the Total are blank
        "2025": [
            "Collected in EFKs",
            "Gramms",
            "Flies",
            ["25", "23", "21", "30", "23", "23", "26", "23", "23", "29", BLANK, BLANK],
            BLANK,
        ],
    },
}
REPORTS = [RODENT, LIZARD, FLIES]


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


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def sign_in(page):
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(500)
    if page.locator(".app-sidebar").count():
        dismiss(page)
        return
    page.fill("#login-email", "trend-qa@example.com")
    page.fill("#login-password", "PlaywrightQA123")
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    if not page.locator(".app-sidebar").count():
        page.click("text=Sign up")
        page.wait_for_timeout(300)
        page.fill("#signup-name", "Trend QA")
        page.fill("#signup-email", "trend-qa@example.com")
        page.fill("#signup-password", "PlaywrightQA123")
        page.fill("#signup-confirm", "PlaywrightQA123")
        page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(1200)
    dismiss(page)


def sheet_row(page, year):
    """One year's row off the sheet, as the cells read."""
    sel = f".trend-table tbody tr[data-year='{year}']"
    if page.locator(sel).count() != 1:
        return None
    return page.eval_on_selector(
        sel,
        """(tr) => ({
             source: tr.querySelector('.src-cell').textContent.trim(),
             unit: tr.children[1].textContent.trim(),
             pest: tr.children[2].textContent.trim(),
             months: Array.from(tr.querySelectorAll('td[data-month]')).map((td) => td.textContent.trim()),
             total: tr.querySelector('.total-cell').textContent.trim(),
             tinted: Array.from(tr.querySelectorAll('td[data-month]')).map((td) => td.classList.contains('from-register')),
           })""",
    )


def bar_values(page):
    return page.eval_on_selector_all(".trend-chart .bar .value", "els => els.map((e) => e.textContent.trim())")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    sign_in(page)

    # ==================================================================
    # 1. All three reports exist, and each is the company's own page
    # ==================================================================
    for rep in REPORTS:
        page.goto(f"{BASE}/index.html{rep['route']}")
        page.wait_for_timeout(1500)
        dismiss(page)
        close_assistant(page)
        # The fly catcher page opens on the F/HR/18 register, as the Daily Report
        # page does; its trend is one of that page's three views.
        trend_view = page.locator("[data-view='trend']")
        if trend_view.count():
            trend_view.first.click()
            page.wait_for_timeout(900)
        name = rep["title"].split(" CATCH")[0].title()

        head = page.locator(".trend-sheet .trend-head")
        check(f"{name}: the report is on screen, in the company's own sheet", head.count() == 1, page.locator(".app-content").inner_text()[:200])
        if head.count() != 1:
            continue
        check(f"{name}: the title is the company's, word for word", rep["title"] in head.inner_text(), head.inner_text()[:160])
        check(
            f"{name}: the sheet carries the company name",
            "GUJARAT" in head.inner_text().upper(),
            head.inner_text()[:160],
        )
        check(
            f"{name}: the page has its \"Report prepared by\" signature line",
            page.locator(".trend-sheet .trend-signature .sig-label").count() == 1
            and "Report prepared by" in page.locator(".trend-sheet .trend-signature").inner_text(),
            page.locator(".trend-sheet").inner_text()[-200:],
        )

        # ---- the figures, cell for cell ----
        for year, (source, unit, pest, months, total) in rep["rows"].items():
            row = sheet_row(page, year)
            check(f"{name} {year}: the year is on the sheet", row is not None)
            if row is None:
                continue
            check(f"{name} {year}: Source reads \"{source}\"", row["source"] == source, row["source"])
            check(f"{name} {year}: Unit reads \"{unit}\"", row["unit"] == unit, row["unit"])
            check(f"{name} {year}: Target Pest reads \"{pest}\"", row["pest"] == pest, row["pest"])
            check(
                f"{name} {year}: every month is the figure on the paper report",
                row["months"] == months,
                {"on screen": row["months"], "on paper": months},
            )
            check(f"{name} {year}: the Total is as printed ({total or 'blank'})", row["total"] == total, row["total"])
            check(
                f"{name} {year}: nothing is claimed as computed — these are the reported figures",
                not any(row["tinted"]),
                row["tinted"],
            )

        # ---- the chart is of the data, and follows the year ----
        drawn = page.get_attribute(".trend-sheet", "data-chart-year")
        check(f"{name}: the sheet says which year the chart draws", bool(drawn and drawn.isdigit()), drawn)
        check(f"{name}: the chart is an inline SVG, not a picture", page.locator(".trend-chart svg").count() == 1 and page.locator(".trend-chart img").count() == 0)
        check(f"{name}: a bar for every month and one for the Total", page.locator(".trend-chart .bar").count() == 13)
        drawn_row = sheet_row(page, drawn)
        if drawn_row:
            expected = [c for c in drawn_row["months"] if c != ""] + ([drawn_row["total"]] if drawn_row["total"] != "" else [])
            check(
                f"{name}: the bars carry that year's own figures, and no bar for an empty month",
                bar_values(page) == expected,
                {"bars": bar_values(page), "row": expected, "year": drawn},
            )

        years = page.eval_on_selector_all(".trend-table tbody tr[data-year]", "els => els.map((e) => e.dataset.year)")
        check(f"{name}: one row per year, none repeated", len(years) == len(set(years)), years)

        # Choosing 2024 redraws the chart from the 2024 row.
        options = page.eval_on_selector_all("select[data-select='year'] option", "els => els.map((e) => e.value)")
        if "2024" not in options and options:
            # the picker offers this year and the one either side; step back to 2024
            for _ in range(4):
                first = page.eval_on_selector_all("select[data-select='year'] option", "els => els.map((e) => e.value)")[0]
                if first == "2024":
                    break
                page.select_option("select[data-select='year']", first)
                page.wait_for_timeout(700)
        if "2024" in page.eval_on_selector_all("select[data-select='year'] option", "els => els.map((e) => e.value)"):
            page.select_option("select[data-select='year']", "2024")
            page.wait_for_timeout(900)
            check(f"{name}: picking 2024 draws 2024", page.get_attribute(".trend-sheet", "data-chart-year") == "2024", page.get_attribute(".trend-sheet", "data-chart-year"))
            want = [c for c in rep["rows"]["2024"][3] if c != ""] + ([rep["rows"]["2024"][4]] if rep["rows"]["2024"][4] != "" else [])
            check(
                f"{name}: and the bars are the 2024 figures off the paper report",
                bar_values(page) == want,
                {"bars": bar_values(page), "on paper": want},
            )

    # ==================================================================
    # 2. The three reports are reachable the way the department reads them
    # ==================================================================
    page.goto(f"{BASE}/index.html#/pest-control")
    page.wait_for_timeout(1400)
    dismiss(page)
    close_assistant(page)
    overview = page.locator(".app-content").inner_text()
    for title in ("Rodent Catch Report and Trend Analysis", "Lizard Catch Report and Trend Analysis", "Flies Catch Report and Trend Analysis"):
        check(f"The module overview offers {title}", title in overview, overview[:400])

    nav = page.locator(".app-sidebar").inner_text()
    check("The sidebar lists all three trends", "Lizard Catch Trend" in nav and "Rodent Catch Trend" in nav and "Fly Catcher Infestation" in nav, nav[:400])

    page.goto(f"{BASE}/index.html#/reports")
    page.wait_for_timeout(1200)
    dismiss(page)
    tabs = page.locator(".pill-tabs.mb-4").first.inner_text()
    check("Reports has a tab for each of the three", "Rodent Catch Trend" in tabs and "Lizard Catch Trend" in tabs and "Fly Catcher Infestation" in tabs, tabs)
    page.locator(".pill-tab", has_text="Lizard Catch Trend").first.click()
    page.wait_for_timeout(1000)
    check(
        "The Lizard tab opens the company's lizard sheet",
        LIZARD["title"] in page.locator(".trend-head").first.inner_text(),
        page.locator(".app-content").inner_text()[:200],
    )

    # ==================================================================
    # 3. The Training Record has no Attended column any more
    # ==================================================================
    page.goto(f"{BASE}/index.html#/training")
    page.wait_for_timeout(1400)
    dismiss(page)
    close_assistant(page)
    new_btn = page.locator("button:has-text('New Training Record')")
    check("The Training Records register is open", new_btn.count() == 1, page.locator(".app-content").inner_text()[:200])
    if new_btn.count():
        new_btn.first.click()
        page.wait_for_timeout(1500)
        dismiss(page)
        close_assistant(page)
        heads = page.eval_on_selector_all(".app-content table th", "els => els.map((e) => e.textContent.trim())")
        check("The attendance sheet has no Attended column", "Attended" not in heads, heads)
        check(
            "...and no tick box anywhere on the record",
            page.locator(".app-content input[type='checkbox']").count() == 0,
            page.locator(".app-content input[type='checkbox']").count(),
        )
        check("...while the names and their departments are still there", "Employee" in heads and "Department" in heads, heads)
        rec = page.evaluate(
            """() => {
                 const id = location.hash.split('/').pop();
                 const all = JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]');
                 const r = all.find((x) => x.id === id) ||
                   all.filter((x) => x.documentId === 'training-record').slice(-1)[0];
                 return r ? r.data : null;
               }"""
        )
        check(
            "No attendee carries an attended flag any more",
            rec is not None and all("attended" not in a for a in (rec.get("attendees") or [])),
            rec and rec.get("attendees"),
        )

    # ==================================================================
    # 4. The SOP Reference is gone from the Pest Control module
    # ==================================================================
    page.goto(f"{BASE}/index.html#/pest-control")
    page.wait_for_timeout(1300)
    dismiss(page)
    close_assistant(page)
    check("The module no longer offers an SOP Reference", "SOP Reference" not in page.locator(".app-content").inner_text())
    check("...and neither does the sidebar", "SOP" not in page.locator(".app-sidebar").inner_text(), page.locator(".app-sidebar").inner_text()[:300])

    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(1300)
    dismiss(page)
    lib = page.locator(".app-content").inner_text()
    check("The Document Library no longer lists it", "Standard Operating Procedure" not in lib, lib[:300])
    docs = page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:documents') || '[]').map((d) => d.id)")
    check("...and it is not in this browser's document list", "sop-reference" not in docs, [d for d in docs if "sop" in d])

    page.goto(f"{BASE}/index.html#/sop")
    page.wait_for_timeout(1000)
    body = page.locator(".app-content").inner_text()
    check(
        "Its old address lands on the not-found page instead of a blank screen",
        ("not found" in body.lower() or "Dashboard" in body) and "Standard Operating Procedure" not in body,
        body[:300],
    )

    # The service agreement still quotes the five services and their frequencies,
    # which used to be read out of that transcription.
    page.goto(f"{BASE}/index.html#/pest-control")
    page.wait_for_timeout(1400)
    dismiss(page)
    close_assistant(page)
    open_agreement = page.locator("[data-action='open-service-agreement']")
    check("The service agreement is still reachable from the module", open_agreement.count() == 1)

    # The agreement's Scope of Services clause used to be read out of the SOP
    # transcription; it now lives in the agreement itself, and must still be the
    # same five services with the same frequencies.
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(1200)
    dismiss(page)
    new_agreement = page.locator("[data-action='new-record'][data-document='service-agreement']")
    check("A service agreement can still be started", new_agreement.count() == 1)
    if new_agreement.count():
        new_agreement.first.click()
        page.wait_for_timeout(1800)
        dismiss(page)
        close_assistant(page)
        scope = page.evaluate(
            """() => {
                 const all = JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]');
                 const r = all.filter((x) => x.documentId === 'service-agreement').slice(-1)[0];
                 return r ? r.data.scopeOfServices : null;
               }"""
        )
        check("The agreement still lists all five services", scope is not None and len(scope) == 5, scope)
        if scope:
            joined = " | ".join(scope)
            for service in ("General Pest Control", "Rodent Control Service", "Fly Control Service", "Mosquito Control Services", "Lizard Control Services"):
                check(f"...including {service}", service in joined, joined[:400])
            check(
                "...with the frequencies the provider's procedure states, unchanged",
                "Quarterly" in joined and joined.count("TO BE CONFIRMED") >= 4,
                joined[:400],
            )
        body = page.locator(".app-content").inner_text()
        check(
            "...and the agreement no longer sends the reader to a withdrawn SOP Reference page",
            "SOP Reference" not in body,
            [line for line in body.splitlines() if "SOP" in line][:3],
        )

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nAll three trend reports read exactly as the company's own pages.")
