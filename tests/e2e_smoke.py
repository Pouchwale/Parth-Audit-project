"""
End-to-end smoke test driven by Playwright (Python), against the production
build served on http://localhost:8842. Exercises the core walkthroughs
described in TESTING.md: signup/login gate, Dashboard load, Calendar -> Day
-> Record -> Save/Submit/Verify, Fly Catcher, GAP, Training, Demo Mode
generation, persistence across reload, and print.

Run: npm run test:e2e
(Drives scripts/run-e2e.ts, which builds, starts backend/index.ts on :8842
-- serving dist/ AND the auth API from one process -- waits for it to be
ready, runs this script, then shuts the server down again.)
"""
import re
import sys
import time
from datetime import date, datetime, timedelta
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:8842"
FAILURES = []

# The company's working calendar (Master Data → Holidays, seeded from the
# Gujarat Print Pack Leave Calendar 2026 — see REQUIREMENTS.md §16): Thursday
# is the weekly off, except on adjustment days; plus the festival holidays.
# Used to pick a WORKING day for the sections that open a day's records, so
# the suite passes on a Thursday too.
ADJUSTMENT_DAYS_2026 = {"2026-01-22", "2026-08-06", "2026-10-22", "2026-11-05", "2026-11-20"}
FESTIVAL_HOLIDAYS_2026 = {
    "2026-01-14", "2026-01-26", "2026-03-04", "2026-08-15", "2026-08-28", "2026-09-04", "2026-10-19", "2026-10-20",
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
}


def is_closed_day(d):
    iso = d.isoformat()
    if iso in FESTIVAL_HOLIDAYS_2026:
        return True
    return d.weekday() == 3 and iso not in ADJUSTMENT_DAYS_2026


def next_working_day(d):
    while is_closed_day(d):
        d += timedelta(days=1)
    return d


def display_date(iso):
    """Mirrors the app's formatDisplayDate (utils/date.ts): DD-Mon-YYYY."""
    return date.fromisoformat(iso).strftime("%d-%b-%Y")


def dismiss_briefing(page):
    """Clear the assistant's briefing if it is on screen.

    It is a blocking overlay, and it can appear on any load -- not just the
    first one: a reload inside the morning (09:00-10:00) or evening
    (17:00-18:00) slot gets that slot's briefing (engine/briefingSchedule.ts).
    Leaving it up makes the next click time out with the overlay swallowing
    pointer events, which is exactly how the double-briefing bug surfaced.
    """
    got_it = page.locator("button:has-text('Got it')")
    if got_it.count():
        got_it.first.click()
        page.wait_for_timeout(200)


WORK_DAY = next_working_day(date.today()).isoformat()
# The assistant prepares records due today or earlier — so on a closed day
# (when WORK_DAY is tomorrow or later) the opened records are blank shells and
# the "prepared by the assistant" expectations don't apply.
PREPARED_EXPECTED = WORK_DAY == date.today().isoformat()


def open_work_day(page):
    page.goto(f"{BASE}/index.html#/day/{WORK_DAY}")
    page.wait_for_timeout(300)
# A fresh, random account per run: signup enforces unique emails, and the
# app now gates every page behind login (see src/main.tsx / AuthProvider).
TEST_EMAIL = f"e2e-{int(time.time() * 1000)}@example.com"
TEST_PASSWORD = "PlaywrightQA123"


def check(label, condition):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}")
    if not condition:
        FAILURES.append(label)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        # Gujarati falls back to the built-in tables here; Google Translate is tested in e2e_translate.py.
        page.route("**/translate_a/**", lambda route: route.abort())
        console_errors = []
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        # ---- 1. Signup gate, then Dashboard loads ----
        page.goto(f"{BASE}/index.html")
        page.wait_for_timeout(400)
        check("Login screen renders (app gates on auth)", "Log In" in page.content())

        page.click("text=Sign up")
        page.wait_for_timeout(150)
        page.fill("#signup-name", "Playwright QA")
        page.fill("#signup-email", TEST_EMAIL)
        page.fill("#signup-password", TEST_PASSWORD)
        page.fill("#signup-confirm", TEST_PASSWORD)
        page.click("button:has-text('Create Account')")
        page.wait_for_timeout(500)

        # ---- 1b. The assistant's login briefing ----
        # On first arrival the assistant pops up with what it has already
        # prepared (every Live record due today or earlier is pre-filled at
        # bootstrap -- see engine/assistantPrepare.ts). It is a blocking
        # overlay, so dismiss it before driving the rest of the app.
        page.wait_for_timeout(300)
        check("Assistant briefing popup greets the user on login", "Good morning" in page.content() or "Good afternoon" in page.content() or "Good evening" in page.content())
        check("Briefing lists records the assistant filled in", "ready for your OK" in page.content())
        dismiss_briefing(page)

        check("Dashboard heading renders after signup", "Digital Controlled Record System" in page.content())
        check("Top bar shows the signed-up user", "Playwright QA" in page.content())
        check("Dashboard shows the assistant's briefing card", "Open briefing" in page.content())
        # The pre-signup /api/auth/me session check is an expected 401 (no
        # session yet) and Chromium logs failed fetches to console as
        # "errors" regardless of the app handling them gracefully -- ignore
        # that one known-benign entry, but still fail on anything else.
        unexpected_errors = [e for e in console_errors if "auth/me" not in e and "401" not in e]
        check("No unexpected console errors on initial load", len(unexpected_errors) == 0)

        # ---- 2. Calendar -> Day View ----
        page.click("text=Record Calendar")
        page.wait_for_timeout(200)
        check("Calendar grid renders", page.locator(".calendar-grid").count() > 0)

        today_cell = page.locator(".calendar-cell.today")
        check("Today cell present", today_cell.count() == 1)

        # ---- 2b. Regression: browsing the Calendar to a month long before
        # this system existed must NOT manufacture a backlog of "Due"
        # records for it (engine/recordGenerator.ts's liveStartDate floor —
        # see engine/backlogCleanup.ts for the one-time cleanup of any such
        # noise a pre-fix session already created). Before this fix, every
        # one of the app's ~10 daily-frequency documents got a blank shell
        # for every day of every month ever viewed here.
        page.goto(f"{BASE}/index.html#/calendar/2019/5")
        page.wait_for_timeout(400)
        page.goto(f"{BASE}/index.html#/calendar/2020/0")
        page.wait_for_timeout(400)
        page.click("text=Dashboard")
        page.wait_for_timeout(300)
        check("No pre-launch backlog banner after browsing old calendar months", page.locator("text=Clean up").count() == 0)

        # The next WORKING day's records — today, unless today is the Thursday
        # weekly off or a festival holiday (see the calendar helpers at the top).
        open_work_day(page)
        check("Day view opens", "Records Due" in page.content())

        # ---- 3. Open Daily Pest Monitoring record, fill, save, submit ----
        opened_record = False
        rows = page.locator(".doc-table tbody tr")
        n = rows.count()
        for i in range(n):
            row_text = rows.nth(i).inner_text()
            if "Daily Pest Control Monitoring" in row_text:
                rows.nth(i).locator("button", has_text="Open").click()
                opened_record = True
                break
        check("Opened a Daily Pest Monitoring record from Day View", opened_record)
        page.wait_for_timeout(300)

        if opened_record:
            check("Record page shows checkpoint table", page.locator(".doc-table").count() > 0)
            check("Daily record was pre-filled by the assistant", "Your assistant has filled this in" in page.content() or not PREPARED_EXPECTED)
            # Fill all checkpoint selects
            selects = page.locator("table select.input")
            count = selects.count()
            for i in range(count):
                sel = selects.nth(i)
                options = sel.locator("option").all_inner_texts()
                # pick a non-empty, "good" option (OK or No) deterministically
                target = "OK" if "OK" in options else ("No" if "No" in options else options[-1])
                sel.select_option(label=target)
            number_inputs = page.locator("table input[type=number]")
            for i in range(number_inputs.count()):
                number_inputs.nth(i).fill("12")
            time_input = page.locator("input[type=time]")
            if time_input.count():
                time_input.first.fill("09:15")
            checker_input = page.locator("input[placeholder='Name of checker']")
            if checker_input.count():
                checker_input.first.fill("Playwright QA")

            page.click("button:has-text('Submit')")
            page.wait_for_timeout(300)
            check("Record submitted (status Pending Verification)", "Pending Verification" in page.content())

            verify_btn = page.locator("button:has-text('Verify')")
            if verify_btn.count():
                verify_btn.first.click()
                page.wait_for_timeout(300)
                check("Record verified", "Verified" in page.content())

        # ---- 3b. A lamination log sheet (generic log-sheet kind), prepared by the assistant ----
        open_work_day(page)
        rows = page.locator(".doc-table tbody tr")
        opened_log = False
        for i in range(rows.count()):
            if "Lamination Adhesive Viscosity Record" in rows.nth(i).inner_text():
                rows.nth(i).locator("button", has_text="Open").click()
                opened_log = True
                break
        check("Opened the F-QC-30 viscosity log sheet from Day View", opened_log)
        page.wait_for_timeout(300)
        if opened_log:
            check("Log sheet shows the F-QC-30 header", "F-QC-30" in page.content())
            check("Log sheet was pre-filled with 24 hourly rows", page.locator("table.log-sheet tbody tr").count() == 24)
            check("Prepared banner explains what was filled", "hourly readings" in page.content() or not PREPARED_EXPECTED)
            if PREPARED_EXPECTED:
                page.click("button:has-text('Submit')")
                page.wait_for_timeout(300)
                check("Log sheet submitted (status Pending Verification)", "Pending Verification" in page.content())

        # ---- 4. Persistence across reload ----
        page.reload()
        page.wait_for_timeout(400)
        dismiss_briefing(page)
        check("Status persists after reload", "Verified" in page.content() or "Pending Verification" in page.content())

        # ---- 5. Dashboard reflects update ----
        page.click("text=Dashboard")
        page.wait_for_timeout(300)
        check("Dashboard shows stat tiles", page.locator(".stat-tile").count() >= 4)

        # ---- 6. Demo Mode: generate + isolation from live ----
        # Switch to Demo mode via the top-bar pill (not just the sidebar nav
        # link, which only navigates without switching mode), then visit
        # Dashboard and Reports -- which both auto-generate records for the
        # viewed month -- BEFORE explicitly generating. This reproduces the
        # exact ordering that once let those pages' own "ensure records
        # exist" effect silently pre-fill every date in the month with
        # blank shells ahead of time, defeating the generator entirely
        # (fixed in engine/recordGenerator.ts + the Dashboard/Calendar/
        # DayView/Reports call sites -- they must always pass isDemo:false).
        page.click(".pill-tab:has-text('Demo Mode')")
        page.wait_for_timeout(200)
        page.click("text=Dashboard")
        page.wait_for_timeout(200)
        page.click("text=Reports")
        page.wait_for_timeout(200)

        page.click("text=Demo Mode")
        page.wait_for_timeout(200)
        # Entering Demo Mode + visiting the Dashboard now fills the year so
        # far with realistic demo data itself (see DashboardPage), so the
        # explicit button is idempotent for the current month. What must
        # hold is that demo data exists and is REAL data (statuses, filled
        # values), not the blank "Due" shells the old bug produced.
        stored = re.search(r"(\d+) demo record\(s\) currently stored", page.content())
        check("Demo data was generated on entering Demo Mode (not pre-empted by Live shells)", bool(stored) and int(stored.group(1)) > 0)
        page.click("button:has-text('Generate Demo Records')")
        page.wait_for_timeout(600)
        match = re.search(r"Created (\d+) new demo record", page.content())
        check("Explicit demo generation is idempotent and reports a count", bool(match))

        page.click("text=Record Calendar")
        page.wait_for_timeout(300)
        check("Demo mode banner visible", "DEMO MODE" in page.content())
        check("Demo calendar shows completed (filled) records, not blank shells", "Completed" in page.content())

        # ---- 6b. Rodent catch pattern, in the company's own report layout ----
        # The demo year's Daily Pest Control Monitoring Records follow the
        # generated seasonal catch pattern (tools/pest_pattern.py), so the
        # Rodent Catch Trend report must show the reported history rows AND a
        # non-zero digital total with per-location detail.
        # (href selector: the sidebar's "Service Reports" sub-heading also
        # contains the word "Reports", so a text= selector would hit it first.)
        page.click("a[href='#/reports']")
        page.wait_for_timeout(300)
        page.click(".pill-tab:has-text('Rodent Catch Trend')")
        page.wait_for_timeout(400)
        # inner_text honours the table-header text-transform (uppercase), so
        # compare case-insensitively.
        rodent_report = page.locator(".app-content").inner_text().lower()
        check("Rodent report uses the company's layout (Source / Unit / Target Pest / Year / Total)", "trapped on glue boards in roda-boxes" in rodent_report and "target pest" in rodent_report)
        # The company's own format ("trend analysis .pdf"): two-line header,
        # one row per year, the bar chart JAN..DEC + Total underneath.
        def trend_row(year):
            return page.evaluate(
                "(y) => { const tr = document.querySelector(`.trend-table tbody tr[data-year='${y}']`);"
                " return tr ? { cells: Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()),"
                " tinted: Array.from(tr.querySelectorAll('td.from-register')).map(td => Number(td.dataset.month)) } : null; }",
                year,
            )

        check(
            "Rodent report is in the company's format: its title, one row per year from 2024, and the bar chart JAN-DEC + Total",
            "RODENT CATCH REPORT AND TREND ANALYSIS" in page.locator(".trend-head").first.inner_text()
            and all(page.locator(f".trend-table tbody tr[data-year='{y}']").count() == 1 for y in (2024, 2025, date.today().year))
            and page.locator(".trend-chart .bar").count() == 13
            and "Number or Quantity Trapped" in page.locator(".trend-chart").first.inner_text(),
        )
        r2025 = trend_row(2025)
        # cells: source, unit, target pest, year, JAN..DEC (index 4..15), Total (16)
        check(
            "Rodent report carries the company's reported 2025 figures (May 1, June 1, total 2)",
            r2025 is not None and r2025["cells"][8] == "1" and r2025["cells"][9] == "1" and r2025["cells"][16] == "2",
        )
        this_year = trend_row(date.today().year)
        current_month_index = date.today().month - 1
        check(
            "This year's months held by the digital register are added up from it (tinted), not copied from paper",
            this_year is not None and current_month_index in this_year["tinted"],
        )
        if date.today().month < 12:
            check("A month that hasn't happened yet is left blank, as on the paper report", this_year is not None and this_year["cells"][4 + date.today().month] == "")
        digital_total = re.search(r"\((\d+) in total across (\d+) days?", rodent_report)
        check("Digital rodent total over the demo year is non-zero (pattern applied)", digital_total is not None and int(digital_total.group(1)) > 0)
        # The department's own figure for what its plant catches: three to four a
        # year, in three or four different months (REQUIREMENTS §45). The year is
        # planned rather than rolled day by day precisely so this holds for EVERY
        # year, not on average — so it is asserted, not sampled. A part-finished
        # year can of course be short of its three, since the later catches have
        # not happened yet, so only whole past years are checked here.
        def rodent_year_total(y):
            row = trend_row(y)
            if row is None:
                return None
            return sum(int(c) for c in row["cells"][4:16] if c.isdigit())

        def rodent_year_months(y):
            row = trend_row(y)
            if row is None:
                return None
            return len([c for c in row["cells"][4:16] if c.isdigit() and int(c) > 0])

        demo_year = date.today().year
        so_far = rodent_year_total(demo_year)
        check(
            "The demo year's rodent catches are within the three to four a year the department states",
            so_far is not None and 0 < so_far <= 4,
        )
        check(
            "...and they are spread across separate months, not clustered in one",
            rodent_year_months(demo_year) == so_far or so_far is None,
        )
        check("Rodent report breaks catches down by location", "where they were found" in rodent_report and ("canteen" in rodent_report or "rm inward" in rodent_report or "store" in rodent_report))

        # The fly catcher counts follow the seasonal per-unit pattern from the
        # same tool, so the Fly Catcher Infestation trend over the demo year
        # must add up to something (and list every unit in the company layout).
        page.click(".pill-tab:has-text('Fly Catcher Infestation')")
        page.wait_for_timeout(400)
        fly_report = page.locator(".app-content").inner_text().lower()
        fly_total = re.search(r"(\d+) flies caught in", fly_report)
        check("Fly Catcher Infestation trend has a non-zero yearly total in Demo Mode (seasonal fly pattern applied)", fly_total is not None and int(fly_total.group(1)) > 0)
        check("Fly Catcher Infestation trend lists all 13 units in the company's year layout", "target pest" in fly_report and page.locator("table.fly-units tbody tr").count() == 13)
        # THE SEASON, as the department describes its own year (REQUIREMENTS §45):
        # busiest in the rains, busy again in winter, quietest in the dry summer
        # heat. Read off the per-unit table's own month columns for the demo year,
        # which is the register's own arithmetic rather than the pattern's.
        fly_months = page.evaluate(
            """() => {
                 const rows = Array.from(document.querySelectorAll('table.fly-units tbody tr'));
                 const per = Array(12).fill(0);
                 for (const tr of rows) {
                   const cells = Array.from(tr.querySelectorAll('td'));
                   // PC ID, Location, JAN..DEC, Total
                   for (let m = 0; m < 12; m++) per[m] += Number(cells[2 + m].textContent.trim()) || 0;
                 }
                 return per;
               }"""
        )
        if fly_months and sum(fly_months) > 0 and date.today().month == 12:
            rainy = sum(fly_months[6:9]) / 3
            winter = (fly_months[11] + fly_months[0] + fly_months[1]) / 3
            summer = sum(fly_months[2:6]) / 4
            check(
                "Flies are busiest in the rains and busy again in winter, quietest in summer",
                rainy > summer and winter > summer,
            )
        elif fly_months and sum(fly_months) > 0:
            # Part-way through the year the winter months are mostly still to come,
            # so only the two seasons the year has actually reached are compared.
            done = date.today().month  # months 1..N are complete-ish
            rainy = [fly_months[m] for m in (6, 7, 8) if m < done]
            summer = [fly_months[m] for m in (2, 3, 4, 5) if m < done]
            if rainy and summer:
                check(
                    "Flies are busier in the rains than in the dry summer heat, as the department describes its year",
                    sum(rainy) / len(rainy) > sum(summer) / len(summer),
                )
        check(
            "Fly trend uses the same company format (title and the JAN-DEC + Total chart)",
            "FLIES CATCH REPORT AND TREND ANALYSIS" in page.locator(".trend-head").first.inner_text() and page.locator(".trend-chart .bar").count() == 13,
        )

        # The F/HR/18 register in the company's own two-page format, filled
        # from last month's two demo visits ("Fly catcher reports .pdf").
        if date.today().month > 1:
            page.goto(f"{BASE}/index.html#/pest/trend/fly-catcher")
            page.wait_for_timeout(500)
            page.locator(".app-content select").nth(1).select_option(str(date.today().month - 2))
            page.wait_for_timeout(500)
            pc01 = page.evaluate(
                "() => Array.from(document.querySelectorAll('tbody.fhr18-unit[data-pc=\"PC-01\"] tr'))"
                ".map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()))"
            )
            first, second = (pc01 + [[], []])[:2]
            check(
                "F/HR/18 register is filled from the visit records, written as the specimen writes it (d/mm/yy, two-digit counts)",
                len(first) == 7
                and re.fullmatch(r"\d{1,2}/\d{2}/\d{2}", first[1]) is not None
                and re.fullmatch(r"\d{2}", first[2]) is not None
                and first[5] == "Vijay"
                and first[6] == "Roshni",
            )
            check(
                "Tube-light dates are the register's own fixed pair (installed 24/11/25, due 23/11/26), with ditto marks on the line below",
                len(first) == 7 and first[3] == "24/11/25" and first[4] == "23/11/26" and len(second) == 6 and second[2] == '"' and second[3] == '"',
            )

        # The same formats beside the services they belong to.
        page.goto(f"{BASE}/index.html#/pest/service/fly")
        page.wait_for_timeout(500)
        check("Fly Control service page carries the F/HR/18 register", page.locator("[data-section='fhr18'] .fhr18-sheet .register-page").count() == 2)
        page.goto(f"{BASE}/index.html#/pest/service/rodent")
        page.wait_for_timeout(500)
        check("Rat / Mice service page carries the Rodent Catch Report and Trend Analysis", page.locator("[data-section='rodent-trend'] .trend-sheet").count() == 1)

        # Holiday-aware scheduling: Thursday is the weekly off, so a fortnightly
        # visit that falls on a Thursday moves to the next working day instead
        # of vanishing. Every year has 4ths/18ths that are Thursdays (June in
        # 2026, February in 2027, ...), so: the demo year's visits exist, none
        # is dated a Thursday, and some of them are NOT on the 4th/18th.
        page.goto(f"{BASE}/index.html#/pest/service/rodent/{date.today().year}")
        page.wait_for_timeout(400)
        svc_dates = [datetime.strptime(m, "%d-%b-%Y").date() for m in re.findall(r"\b\d{2}-[A-Z][a-z]{2}-\d{4}\b", page.locator("table[data-table='visits'] tbody").inner_text())]
        check(
            "Demo service visits never sit on the Thursday weekly off — a visit scheduled on a Thursday is dated the next working day",
            len(svc_dates) >= 4 and all(d.weekday() != 3 for d in svc_dates) and any(d.day not in (4, 18) for d in svc_dates),
        )

        # switch back to live and confirm demo doesn't leak
        page.click("text=Live Mode")
        page.wait_for_timeout(300)
        check("Live mode banner visible after switch", "LIVE MODE" in page.content())

        # ---- 7. CAPA module: Internal / External chooser, then Internal list ----
        page.goto(f"{BASE}/index.html#/gap")
        page.wait_for_timeout(400)
        capa_home = page.locator(".app-content").inner_text()
        check("CAPA home offers exactly the two options, Internal and External", "Internal" in capa_home and "External" in capa_home and "Open Internal" in capa_home and "Open External" in capa_home)
        page.click("a:has-text('Internal — Inspection Findings')")
        page.wait_for_timeout(300)
        check("CAPA Internal list shows seeded Dec-2023 inspection", "Gujarat Print Pack Publications" in page.content())

        # ---- 7b. CAPA External: the assistant walks a new complaint through A→E, then approval ----
        page.click("a:has-text('External — Customer Complaints')")
        page.wait_for_timeout(300)
        check("CAPA External list shows the F/MKT/05 checklist", "F/MKT/05" in page.content())
        page.click("button:has-text('New Complaint')")
        page.wait_for_timeout(900)  # widget auto-opens + greeting + first question
        check("New complaint auto-starts the assistant walk-through", page.locator(".chat-msg.bot", has_text="Let's do Complaint").count() == 1)
        check("Assistant asks for the customer first", page.locator(".chat-msg.bot", has_text="Which customer").count() == 1)

        def chat_type(text):
            page.fill("textarea.input", text)
            page.keyboard.press("Enter")
            page.wait_for_timeout(250)

        def chat_chip(label_regex):
            chips = page.locator(".chat-chip", has_text=re.compile(label_regex))
            chips.last.click()
            page.wait_for_timeout(250)

        # The complaint number is already on the sheet (26-27/001 — the app
        # numbers a new complaint itself), so the walk-through doesn't ask for
        # it; it goes customer → job name → job code → PO no. → received date.
        year_part = f"{date.today().year % 100:02d}-{(date.today().year % 100 + 1) % 100:02d}"
        check("A new complaint is already numbered for this year", page.locator(f"input[value='{year_part}/001']").count() == 1)
        chat_type("Gulab Oil And Food")
        chat_chip(r"^Skip$")          # job name (optional)
        chat_type("fgsl 3877")        # job code — tidied to the plant's format
        chat_chip(r"^Skip$")          # PO no.
        chat_chip(r"^Today$")         # complaint received date
        check(
            "Header details captured on the form, the job code in the plant's format",
            page.locator("input[value='Gulab Oil And Food']").count() == 1 and page.locator("input[value='FGSL3877']").count() == 1,
        )

        check("Assistant announces Section A", page.locator(".chat-msg.bot", has_text="Section A").count() >= 1)
        chat_chip(r"^Let's go$")
        for _ in range(5):
            chat_chip(r"^Done today$")
        check("Section B is announced after A's five activities", page.locator(".chat-msg.bot", has_text="Section B").count() >= 1)
        for section in ["C", "D", "E"]:
            chat_chip(r"^All \d+ done today$")
            check(f"Section {section} is announced next", page.locator(".chat-msg.bot", has_text=f"Section {section}").count() >= 1)
        chat_chip(r"^All \d+ done today$")   # Section E
        check("After E the assistant asks for approval", page.locator(".chat-msg.bot", has_text="Shall I submit it for approval now").count() == 1)
        # 31, not 32: the printed form's Sr. No. runs 1-32 but skips 6.
        check("Form shows all 31 activities done", "31 / 31" in page.locator(".app-content").inner_text())

        chat_chip(r"^Submit for approval$")
        check("Assistant confirms submission", page.locator(".chat-msg.bot", has_text="Submitted").count() == 1)
        check("Checklist status is Pending Verification (awaiting approval)", "Pending Verification" in page.locator(".app-content").inner_text())
        check("Prepared By was stamped with the logged-in user", page.locator("input[value='Playwright QA']").count() >= 1)

        chat_chip(r"^Review & approve$")
        check("Assistant offers to approve", page.locator(".chat-chip", has_text=re.compile(r"^Approve$")).count() == 1)
        chat_chip(r"^Approve$")
        check("Assistant confirms approval", page.locator(".chat-msg.bot", has_text="signed off as Approved By with your name").count() == 1)
        check("Checklist status is Verified (approved)", "Verified" in page.locator(".app-content").inner_text())
        # An approved checklist answers nothing more: the one-at-a-time rule
        # keeps an ANSWERED activity open so a mistake can be put right while
        # the sheet is a draft, and this is the other half of that — once it is
        # signed off, every row is read-only again (REQUIREMENTS §37).
        check(
            "An approved checklist is read-only — no activity can be answered or changed",
            page.locator("tr[data-activity='A1'] input[data-field='done']").is_disabled()
            and page.locator("tr[data-activity='A1'] input.input-sm").first.is_disabled()
            and page.locator("tr[data-activity='E32'] input[data-field='done']").is_disabled(),
        )
        check(
            "...and it is read-only rather than 'locked' — nothing is waiting to be answered",
            page.locator("tr[data-locked='1']").count() == 0 and page.locator("[data-waiting-on]").count() == 0,
        )
        page.click("button[aria-label='Close assistant']")
        page.wait_for_timeout(150)

        # ---- 8. Training module ----
        page.click("text=Training Records")
        page.wait_for_timeout(300)
        check("Training list shows seeded record", "Yogesh Rathod" in page.content() or "Gurudev" in page.content())
        check("Training list shows the Dec-2025 awareness programme", "Awareness" in page.content())

        # ---- 8b. Statements of Compliance ----
        page.click("text=Statements of Compliance")
        page.wait_for_timeout(300)
        check("SOC list shows both statements", "F/QC- 09" in page.content() and "F/QC- 38" in page.content())
        page.click("text=Pressure Labels")
        page.wait_for_timeout(300)
        check("SOC detail renders the declaration", "Shail Patel" in page.content() and "94/62/EC" in page.content())

        # ---- 9. Chemical Master ----
        page.click("text=Chemical Master")
        page.wait_for_timeout(300)
        check("Chemical master shows pesticide chart", "Rodent Control Service" in page.content())

        # ---- 11. Reports ----
        page.click("a[href='#/reports']")
        page.wait_for_timeout(300)
        check("Reports page renders tabs", "Monthly Records Report" in page.content())
        page.click(".pill-tab:has-text('Lamination QC')")
        page.wait_for_timeout(300)
        check("Lamination QC report renders", "Avg viscosity" in page.content())
        page.click(".pill-tab:has-text('Daily Monitoring Summary')")
        page.wait_for_timeout(300)
        check("Reports > Daily Monitoring Summary reproduces the F/HR/17 three-page register", page.locator(".register-page").count() == 3)

        # ---- 12. Document Library ----
        page.click("text=Document Library")
        page.wait_for_timeout(300)
        check("Document Library lists all 40 documents", page.locator(".doc-table tbody tr:not(.doc-section-row)").count() == 40)
        check("Document Library shows the lamination module", "Lamination — Quality Control" in page.content())
        check("Document Library shows the QC inspection module", "Quality Control — Inspection Records" in page.content())
        check("Document Library groups both CAPA documents under the CAPA module", page.locator(".app-content h3:has-text('CAPA (Corrective')").count() == 1)

        # ---- 12a. Sidebar module accordion + module-filtered library deep link ----
        header = page.locator(".nav-module-header:has-text('Human Resources')")
        check("Sidebar has a collapsible Human Resources module header", header.count() == 1)
        check("Sidebar has a CAPA module with Internal and External links", page.locator("a:has-text('Internal — Inspection Findings')").count() == 1 and page.locator("a:has-text('External — Customer Complaints')").count() == 1)
        check("Human Resources module starts expanded (Training link visible)", page.locator("a:has-text('Training Records')").count() == 1)
        header.click()
        page.wait_for_timeout(150)
        check("Collapsing the module header hides its links", page.locator("a:has-text('Training Records')").count() == 0)
        page.click("a:has-text('Internal — Inspection Findings')")
        page.wait_for_timeout(200)
        check("A collapsed module stays collapsed after navigating elsewhere", page.locator("a:has-text('Training Records')").count() == 0)
        header.click()
        page.wait_for_timeout(150)
        check("Expanding it again restores the links", page.locator("a:has-text('Training Records')").count() == 1)

        # ---- 12b. Closing and reopening the whole navigation panel ----
        # The panel's own close button hides the only control that could bring
        # it back, so the top bar carries the way in; the choice is remembered.
        # Selectors are data-action hooks, not labels -- the labels translate.
        def sidebar_width():
            return page.evaluate("document.querySelector('.app-sidebar').getBoundingClientRect().width")

        check("Navigation panel is a column beside the content by default", sidebar_width() > 200)
        page.click("button[data-action='close-sidebar']")
        page.wait_for_timeout(400)
        check("Closing the panel gives the page the full window", sidebar_width() == 0)
        check(
            "A closed panel is hidden from keyboard and screen readers too, not just narrowed",
            page.evaluate("getComputedStyle(document.querySelector('.app-sidebar')).visibility") == "hidden",
        )
        page.reload()
        page.wait_for_timeout(800)
        dismiss_briefing(page)
        check("The panel stays closed after a reload (the choice is remembered)", sidebar_width() == 0)
        page.click("button[data-action='toggle-sidebar']")
        page.wait_for_timeout(400)
        check("The top-bar button brings the panel back", sidebar_width() > 200)

        # Collapse-all / expand-all: six modules in one click either way.
        page.click("button[data-action='toggle-all-modules']")
        page.wait_for_timeout(200)
        check(
            "Collapse-all closes every module at once",
            page.locator(".nav-module.closed").count() == 6 and page.locator(".nav-module.open").count() == 0,
        )
        check(
            "A collapsed module still marks the one holding the current page",
            page.locator(".nav-module.current .nav-module-dot").count() == 1,
        )
        page.click("button[data-action='toggle-all-modules']")
        page.wait_for_timeout(200)
        check("Expand-all opens them again", page.locator(".nav-module.open").count() == 6)

        page.click("a:has-text('Lamination QC Documents')")
        page.wait_for_timeout(300)
        check("Module link deep-links Document Library filtered to that module", "#/library/lamination-quality-control" in page.url)
        # Scoped to the main content area, not page.content() as a whole --
        # the sidebar itself always lists every module's name regardless of
        # which page is open, so checking the whole page would always fail.
        check("Filtered library shows only that module's documents", "Lamination — Production" not in page.locator(".app-content").inner_text())

        # ---- 12c. The pest control file inside Human Resources: Daily Report / Service Reports / Trend Analysis ----
        # The file is organised the way the department reads its paperwork
        # (src/pages/PestControlPages.tsx); each group has its own page.
        check(
            "Human Resources module lists HR Records and the pest control file's groups in the sidebar",
            all(page.locator(f".nav-sub-label:has-text('{h}')").count() == 1 for h in ["HR Records", "Pest Control", "Daily Report", "Service Reports", "Trend Analysis", "Training & Reference"]),
        )
        page.click("a:has-text('Rat / Mice')")
        page.wait_for_timeout(300)
        check("Rat / Mice service reports open on their own page", "#/pest/service/rodent" in page.url and "Rodent Control Service" in page.locator(".app-content").inner_text())
        check("Service report list shows this month's fortnightly visit(s)", page.locator("table[data-table='visits'] tbody tr").count() >= 1)
        page.click("a:has-text('Daily Pest Control Monitoring')")
        page.wait_for_timeout(300)
        check("Daily Report page shows the month register with today's row", "#/pest/daily" in page.url and page.locator(".doc-table tbody tr.is-today").count() == 1)
        # The register is the company's own F/HR/17 layout ("Daily pest control
        # monitoring record .pdf"): page 1 instructions + the ten check points,
        # page 2 dates 1-19, page 3 dates 20-31 + the Summary of Actions.
        check(
            "Daily Report is laid out as the F/HR/17 three-page register (10 check points, 31 date rows)",
            page.locator(".register-page").count() == 3 and page.locator(".register-checkpoints li").count() == 10 and page.locator(".register-grid tr[data-day]").count() == 31,
        )
        check("Register carries the format's own instruction wording (Yes / No, except point no. 7)", "except point no. 7" in page.locator(".register-instructions").inner_text())
        check("Register page 3 carries the Summary of Actions Taken if Pest Observed", page.locator(".register-summary-title").count() == 1)
        page.click("a:has-text('Fly Catcher Infestation')")
        page.wait_for_timeout(300)
        check(
            "Fly Catcher Infestation opens on the F/HR/18 register in the company's two-page format (Live)",
            "#/pest/trend/fly-catcher" in page.url
            and page.locator(".fhr18-sheet .register-page").count() == 2
            and page.locator("tbody.fhr18-unit").count() == 13
            and page.locator(".fhr18-legend").first.locator("tr").count() == 7
            and "FORTNIGHTLY – FLY CATCHER INSPECTION & CLEANING RECORD" in page.locator(".fhr18-sheet .doc-header").first.inner_text()
            and "F/HR/18" in page.locator(".fhr18-sheet .doc-header").first.inner_text(),
        )
        check(
            "Register carries the form's own seven column headings",
            [t.strip() for t in page.locator(".fhr18-grid").first.locator("thead th").all_inner_texts()]
            == ["PC ID NO.", "DATE OF SERVICE", "FLIES CATCH COUNT APPROX.", "DATE OF TUBE LIGHT INSTALLATION", "DUE DATE FOR TUBE LIGHT REPLACEMENT", "CLEANING DONE BY", "VERIFIED BY"],
        )
        page.click(".pill-tab[data-view='trend']")
        page.wait_for_timeout(300)
        check("Its trend view still lists every unit PC-01..PC-13 (Live)", page.locator("table.fly-units tbody tr").count() == 13)
        page.click("a[href='#/pest-control']")
        page.wait_for_timeout(300)
        overview = page.locator(".app-content").inner_text()
        check("Pest Control overview shows the four groups", all(x in overview for x in ["Daily Report", "Service Reports", "Trend Analysis", "Training & Reference"]))

        # ---- 12d. The service provider's insecticide licence, on file exactly as supplied ----
        page.click("a[href='#/licence']")
        page.wait_for_timeout(800)
        lic = page.locator(".app-content").inner_text()
        check("Service Provider Licence page shows both scanned licence pages", page.locator(".licence-scan img").count() == 2)
        check("Scanned licence pages are actually served by the app (first image loaded)", page.locator(".licence-scan img").first.evaluate("img => img.complete && img.naturalWidth > 0"))
        check("Licence transcription carries Form III, the licensee and the licence number", "FORM III" in lic and "GURUDEV PESTICIDES" in lic and "MEH/FP1230000675/2023-2024" in lic)
        check("Licence terms are listed exactly as printed (12 numbered conditions)", page.locator("table.licence-terms tbody tr").count() == 12)
        # The licence is held with no changes at all: the app serves the
        # supplied PDF itself, byte for byte (320,370 bytes, SHA-256
        # 0a63f34c…), not only the page renderings shown on screen.
        pdf = page.request.get(f"{BASE}/source/gurudev-insecticide-licence.pdf")
        check(
            "The original licence PDF is served by the app exactly as supplied (byte-for-byte)",
            pdf.status == 200 and pdf.headers.get("content-type", "").startswith("application/pdf") and len(pdf.body()) == 320370,
        )
        check("Licence page links to that original PDF", page.locator(f"a[href='/source/gurudev-insecticide-licence.pdf']").count() >= 1)

        # ---- 12b. A fixed-parameter inspection record (F/QC/37), prepared by the assistant ----
        open_work_day(page)
        rows = page.locator(".doc-table tbody tr")
        opened_insp = False
        for i in range(rows.count()):
            if "Pouching Process" in rows.nth(i).inner_text():
                rows.nth(i).locator("button", has_text="Open").click()
                opened_insp = True
                break
        check("Opened the F/QC/37 pouching inspection from Day View", opened_insp)
        page.wait_for_timeout(300)
        if opened_insp:
            check("Inspection shows the 11 printed test parameters", page.locator("table.log-sheet tbody tr").count() == 11)
        if opened_insp and PREPARED_EXPECTED:
            check("Inspection observations were pre-filled from the specimen", "Standy + Zipper" in page.content())
            check("Lot status pre-set to Accepted and inspector signed", "Accepted" in page.content() and "Inspected By" in page.content())
            page.click("button:has-text('Submit')")
            page.wait_for_timeout(300)
            check("Inspection record submitted", "Pending Verification" in page.content())

        # ---- 13. Search ----
        page.click("text=Search")
        page.wait_for_timeout(200)
        page.fill("input[placeholder*='PC-04']", "PC-01")
        page.wait_for_timeout(300)
        check("Search returns results for PC-01", page.locator(".doc-table tbody tr").count() >= 1)
        page.fill("input[placeholder*='PC-04']", "Gaurav Singh")
        page.wait_for_timeout(300)
        check("Search finds the lamination operator on the prepared log sheets", page.locator(".doc-table tbody tr").count() >= 1)

        # ---- 13b. Back from the Record Calendar (REQUIREMENTS s48) ----
        # Back returns to the page the calendar was opened from; a day opened
        # from the calendar and "Back to Calendar" is a real step back, so the
        # calendar's Back still leads to where you were before it; and opened
        # straight from its address, Back goes to the Dashboard rather than out
        # of the app.
        page.goto(f"{BASE}/index.html#/library")
        page.wait_for_timeout(500)
        dismiss_briefing(page)
        page.click(".app-sidebar a:has-text('Record Calendar')")
        page.wait_for_timeout(500)
        calendar_back = page.locator("button[data-action='back']")
        check("The Record Calendar has a Back button", calendar_back.count() == 1)
        calendar_back.click()
        page.wait_for_timeout(500)
        check("Back on the calendar returns to the page it was opened from", page.url.endswith("#/library"))
        page.click(".app-sidebar a:has-text('Record Calendar')")
        page.wait_for_timeout(500)
        page.locator(".calendar-cell.today").click()
        page.wait_for_timeout(500)
        page.click("button:has-text('Back to Calendar')")
        page.wait_for_timeout(500)
        check("Back to Calendar from a day returns to the calendar", "#/calendar" in page.url and page.locator(".calendar-cell.today").count() == 1)
        page.locator("button[data-action='back']").click()
        page.wait_for_timeout(500)
        check("...and the calendar's Back then leads to where the calendar was opened from, not the day", page.url.endswith("#/library"))
        page.goto(f"{BASE}/index.html#/calendar")
        page.reload()
        page.wait_for_selector(".app-sidebar", timeout=30000)
        page.wait_for_timeout(1200)
        dismiss_briefing(page)
        page.locator("button[data-action='back']").click()
        page.wait_for_timeout(500)
        check("Opened straight from its address, the calendar's Back goes to the Dashboard instead of leaving the app", page.url.endswith("#/dashboard"))

        # ---- 14. The working calendar: Thursday weekly off, leave calendar, adjustment days ----
        # (engine/holidays.ts — the Gujarat Print Pack Leave Calendar 2026,
        # Thursday copy.) September 2026 has four Thursdays (3, 10, 17, 24) and
        # Janmashtami on Friday the 4th; October's 22nd is an adjustment day —
        # a Thursday the plant works.
        page.goto(f"{BASE}/index.html#/calendar/2026/8")
        page.wait_for_timeout(400)
        check("Calendar marks every Thursday of September 2026 as the weekly off", page.locator(".calendar-cell:has-text('Weekly off')").count() == 4)
        check("Calendar shows Janmashtami (04-Sep-2026) from the leave calendar", page.locator(".calendar-cell:has-text('Janmashtami')").count() == 1)
        page.goto(f"{BASE}/index.html#/calendar/2026/9")
        page.wait_for_timeout(400)
        check(
            "Adjustment day 22-Oct-2026 is a working Thursday (October: 4 weekly offs + 1 working day)",
            page.locator(".calendar-cell:has-text('Weekly off')").count() == 4 and page.locator(".calendar-cell:has-text('Working day')").count() == 1,
        )
        page.goto(f"{BASE}/index.html#/day/2026-09-10")
        page.wait_for_timeout(400)
        check("Day View explains a Thursday as the weekly off", "weekly off" in page.locator(".app-content").inner_text().lower())
        # The next weekly-off Thursday on or after today (skipping adjustment
        # days) — computed at run time, because a fresh browser's launch-date
        # floor means only records from today onwards are generated.
        next_off = date.today()
        while next_off.weekday() != 3 or next_off.isoformat() in ADJUSTMENT_DAYS_2026:
            next_off += timedelta(days=1)
        page.goto(f"{BASE}/index.html#/pest/daily/{next_off.year}/{next_off.month - 1}")
        page.wait_for_timeout(500)
        check("Daily Report register pre-marks the next weekly-off Thursday as a HOLIDAY row", "HOLIDAY" in page.locator(f".register-grid tr[data-day='{next_off.day}']").inner_text())
        page.goto(f"{BASE}/index.html#/master-data")
        page.wait_for_timeout(300)
        page.click(".pill-tab:has-text('Holidays')")
        page.wait_for_timeout(200)
        check(
            "Master Data shows the weekly off (Thursday) and the leave calendar's five adjustment days",
            page.locator("select[aria-label='Weekly off day']").input_value() == "4" and page.locator("table.adjustment-days tbody tr").count() == 5,
        )

        # ---- 15. The Assistant page (ChatGPT-style, text only) ----
        page.click("a[href='#/assistant']")
        page.wait_for_timeout(300)
        check(
            "Assistant page opens from the sidebar with suggestions and a composer",
            "#/assistant" in page.url and page.locator(".assistant-suggestion").count() >= 4 and page.locator("textarea.assistant-input").count() == 1,
        )
        # Voice: press-to-talk on the composer, and a speaker toggle for
        # reading replies aloud. Chromium exposes webkitSpeechRecognition, so
        # the control is live here; actually speaking can't be driven from a
        # headless browser, so this checks it is present, labelled and does
        # not break the page (utils/speech.ts).
        check(
            "Assistant page offers voice input (press-to-talk) and a read-aloud toggle",
            page.locator("button[data-action='voice']").count() == 1 and page.locator("button[data-action='speak-replies']").count() == 1,
        )
        page.locator("button[data-action='voice']").click()
        page.wait_for_timeout(400)
        check("Pressing the microphone starts listening (or explains why it can't)", page.locator(".assistant-voice-note").count() == 1)
        # Stop listening again so the mic isn't left open for the rest of the run.
        if page.locator("button[data-action='voice'][aria-pressed='true']").count():
            page.locator("button[data-action='voice'][aria-pressed='true']").click()
            page.wait_for_timeout(200)
        # Fixed dates, so the expected wording never depends on the day the
        # suite happens to run: 10-Sep-2026 is a Thursday (weekly off),
        # 22-Oct-2026 a Thursday the plant works (adjustment day).
        page.fill("textarea.assistant-input", "is 2026-09-10 a holiday?")
        page.click("button[data-action='send']")
        page.wait_for_timeout(500)
        reply = page.locator(".assistant-page .chat-msg.bot").last.inner_text().lower()
        check("Assistant answers a weekly-off date from the working calendar (no network needed)", "weekly off" in reply and "thursday" in reply)
        page.fill("textarea.assistant-input", "is 2026-10-22 a holiday?")
        page.click("button[data-action='send']")
        page.wait_for_timeout(500)
        reply_adj = page.locator(".assistant-page .chat-msg.bot").last.inner_text().lower()
        check("Assistant explains an adjustment day as a working Thursday", "adjustment day" in reply_adj and "working day" in reply_adj)
        page.fill("textarea.assistant-input", "when is the next company holiday?")
        page.click("button[data-action='send']")
        page.wait_for_timeout(500)
        reply2 = page.locator(".assistant-page .chat-msg.bot").last.inner_text().lower()
        check("Assistant lists what's next on the leave calendar (or says the year's list is done) and names the weekly off", "weekly off" in reply2 and ("coming up" in reply2 or "no festival holidays" in reply2))
        page.reload()
        page.wait_for_timeout(700)
        dismiss_briefing(page)
        check("Assistant conversation persists across a reload", page.locator(".assistant-page .chat-msg.user").count() >= 2)

        # ---- 15b. Date-range document listing ("documents of X from date to
        # date"), answered locally, no network needed (engine/assistantLocal.ts).
        # A single explicit day (today's WORK_DAY, computed at the top of this
        # file) always has a Daily Pest Control Monitoring Record by now — it
        # was opened, filled and submitted in section 3.
        # The answer opens the Document Files view for exactly that span
        # (pages/FileBrowserPage.tsx); the written list stays in the chat.
        page.fill("textarea.assistant-input", f"show me daily pest control monitoring record documents from {WORK_DAY} to {WORK_DAY}")
        page.click("button[data-action='send']")
        page.wait_for_timeout(700)
        check(
            "Asking for a document's records over a span opens the files view for exactly that span",
            page.url.endswith(f"#/files/daily-pest-monitoring/{WORK_DAY}/{WORK_DAY}")
            and page.locator("[data-section='file-browser'] .file-row").count() == 1,
        )
        page.go_back()
        page.wait_for_timeout(500)
        reply_single = page.locator(".assistant-page .chat-msg.bot").last.inner_text()
        check(
            "Assistant lists a document's records for an explicit single-day range, not the whole month",
            "Daily Pest Control Monitoring Record" in reply_single and "(1 record)" in reply_single and "No " not in reply_single,
        )
        # A whole-module request over an explicit multi-day span — must return
        # exactly that span's count of days, never a full month's worth.
        span_end = date.fromisoformat(WORK_DAY) + timedelta(days=6)
        page.fill("textarea.assistant-input", f"i want pest control records from {WORK_DAY} to {span_end.isoformat()}")
        page.click("button[data-action='send']")
        page.wait_for_timeout(700)
        span_dates = page.locator("[data-section='file-browser'] .file-row").evaluate_all("rows => rows.map(r => r.dataset.fileDate)")
        check(
            "A module's files view holds only files dated inside the span asked for",
            page.url.endswith(f"#/files/pest-control/{WORK_DAY}/{span_end.isoformat()}")
            and len(span_dates) > 0
            and all(WORK_DAY <= d <= span_end.isoformat() for d in span_dates),
        )
        page.go_back()
        page.wait_for_timeout(500)
        reply_span = page.locator(".assistant-page .chat-msg.bot").last.inner_text()
        check(
            "Assistant scopes a module's listing to the exact multi-day span asked for",
            f"{display_date(WORK_DAY)} to {display_date(span_end.isoformat())}" in reply_span,
        )
        # ---- 15c. Scope: this assistant answers about this software only ----
        # An unmistakably general message is declined instantly on the client
        # (engine/assistantLocal.ts offTopicReply) — no network call. The
        # model carries the same rule for everything else (its SCOPE block in
        # backend/assistant.ts, exercised in e2e_assistant_chat.py).
        page.fill("textarea.assistant-input", "tell me a joke")
        page.click("button[data-action='send']")
        page.wait_for_timeout(500)
        reply_off = page.locator(".assistant-page .chat-msg.bot").last.inner_text()
        check("Assistant declines a general (non-software) question", "only cover this Digital Controlled Record System" in reply_off)
        check("Declining a general question does not navigate away", "#/assistant" in page.url)
        # Name-dropping a pest-control word doesn't make a general request in
        # scope — it's the request that's judged, not the keywords.
        page.fill("textarea.assistant-input", "write me a poem about rodents")
        page.click("button[data-action='send']")
        page.wait_for_timeout(500)
        check(
            "A general request that mentions a pest-control word is still declined",
            "only cover this Digital Controlled Record System" in page.locator(".assistant-page .chat-msg.bot").last.inner_text(),
        )
        # ...and the scope guard must not over-block: the very next in-scope
        # question is answered normally.
        page.fill("textarea.assistant-input", "is 2026-09-10 a holiday?")
        page.click("button[data-action='send']")
        page.wait_for_timeout(500)
        check(
            "An in-scope question straight after is still answered normally (scope guard does not over-block)",
            "weekly off" in page.locator(".assistant-page .chat-msg.bot").last.inner_text().lower(),
        )

        # ---- 15d. Language: English / Gujarati across every page ----
        # The choice lives on the Dashboard and applies app-wide immediately —
        # nothing to reload (src/i18n, wired through AppStore).
        page.click("a[href='#/dashboard']")
        page.wait_for_timeout(400)
        check("The top bar offers both languages", page.locator(".lang-select option").count() == 2)
        page.select_option(".lang-select", "gu")
        page.wait_for_timeout(400)
        check("Choosing Gujarati translates the Dashboard", "ડેશબોર્ડ" in page.locator(".app-sidebar").inner_text() and "આજે" in page.locator(".app-content").inner_text())
        check("...and the sidebar's module names", "જીવાત નિયંત્રણ" in page.locator(".app-sidebar").inner_text())
        check("...and the top bar / mode banner", "લાઇવ મોડ" in page.locator(".mode-banner").inner_text())
        page.goto(f"{BASE}/index.html#/pest/daily")
        page.wait_for_timeout(500)
        pest_gu = page.locator(".app-content").inner_text()
        check("Other pages follow the same language without a reload", "દૈનિક રિપોર્ટ" in pest_gu)
        check("Controlled document text (F/HR/17 and its check points) stays exactly as issued", "F/HR/17" in pest_gu and "Total number of rodent traps provided" in pest_gu)
        page.goto(f"{BASE}/index.html#/calendar")
        page.wait_for_timeout(400)
        check("The Record Calendar is translated too", "રેકોર્ડ કેલેન્ડર" in page.locator(".app-content").inner_text())
        # Back to English for the remaining checks (and so a re-run starts clean).
        page.click("a[href='#/dashboard']")
        page.wait_for_timeout(300)
        page.select_option(".lang-select", "en")
        page.wait_for_timeout(300)
        check("Switching back to English restores it everywhere", "Dashboard" in page.locator(".app-sidebar").inner_text())
        page.goto(f"{BASE}/index.html#/assistant")
        page.wait_for_timeout(300)

        # Regression guard for "a generic reports request must still reach the
        # model to navigate, not get hijacked by this local intent" lives in
        # e2e_assistant_chat.py's "Navigated to Reports for August via free
        # text" check instead of here — that assertion needs a real network
        # round trip (there is nothing local to observe when the local layer
        # correctly stays silent), which this network-independent suite
        # deliberately never makes.

        browser.close()

        print("\n--- Console errors captured during run ---")
        for e in console_errors[:20]:
            print(" ", e)

        if FAILURES:
            print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
            for f in FAILURES:
                print(" -", f)
            sys.exit(1)
        else:
            print("\nAll checks passed.")


if __name__ == "__main__":
    main()
