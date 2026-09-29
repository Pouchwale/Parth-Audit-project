"""F/MNT/03 follows F/MNT/02 (REQUIREMENTS s82), asked for on 29-Sep-2026:
"mnt-03 is connected to 02, so make the data operate accordingly".

  * the 2026 schedule (F/MNT/03, Rev 01) shows every Actual as linked TEXT read
    from the machines' F/MNT/02 sheets - never a box to type in - and each date
    opens the F/MNT/02 it is written on;
  * the sample year that ships with the app ("all dates are always fake") is
    there: a sheet for each machine, the schedule Verified, the Actuals filled
    for January to August;
  * M-07, printed on two blocks, links neither and says why;
  * F/MNT/02 shows the machine's next planned PM from the schedule, and a
    machine that is not on it (M-68) says so;
  * a PM date corrected on F/MNT/02 is followed on F/MNT/03 - which stays
    Verified and is not written to - and Insights reads it as M6 does;
  * the date is put back afterwards, so the suites after this one see the
    sample year as it ships.

Network-independent. Against the production build on :8842.
"""
import sys
import time
from datetime import date, timedelta

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []
SCHEDULE_ID = "seed-sample-mnt-pm-schedule-2026"
M47_SHEET = "seed-sample-mnt-pm-M-47-2026"
M68_SHEET = "seed-sample-mnt-pm-M-68-2026"
FESTIVAL_HOLIDAYS_2026 = {
    "2026-01-14", "2026-01-26", "2026-03-04", "2026-08-15", "2026-08-28", "2026-09-04", "2026-10-19", "2026-10-20",
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
}


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:600])


def open_day(d):
    """The day itself, or the next one that is neither a Thursday (the weekly off) nor a festival holiday."""
    while d.weekday() == 3 or d.isoformat() in FESTIVAL_HOLIDAYS_2026:
        d += timedelta(days=1)
    return d


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


def open_page(page, route, settle=1800):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def record(page, rid):
    return page.evaluate("(id) => (JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')).find((r) => r.id === id) || null", rid)


def schedule_line(page, machine, frequency):
    """The schedule's line for a machine and frequency: its cells by column key, as the page shows them."""
    return page.evaluate(
        """([machine, frequency]) => {
             const rows = Array.from(document.querySelectorAll('table.log-sheet tbody tr'));
             for (const tr of rows) {
               const cells = Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim());
               if (cells[1] !== machine || cells[3] !== frequency) continue;
               const out = { plans: {}, actuals: {}, links: {}, titles: {}, inputs: tr.querySelectorAll('[data-computed] input, [data-computed] select, [data-computed] textarea').length };
               for (const el of tr.querySelectorAll('[data-computed]')) {
                 const k = el.getAttribute('data-computed');
                 out.actuals[k] = (el.textContent || '').trim();
                 out.links[k] = Array.from(el.querySelectorAll('a[data-linked-record]')).map((a) => a.getAttribute('data-linked-record'));
                 out.titles[k] = Array.from(el.querySelectorAll('a[data-linked-record]')).map((a) => a.getAttribute('title') || '');
               }
               return { cells, ...out };
             }
             return null;
           }""",
        [machine, frequency],
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" and "translate" not in m.text.lower() else None)
    email = f"pmlink-{int(time.time() * 1000)}@example.com"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "PM Link QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    errors.clear()  # the sign-in page's /api/auth/me answers 401 before the account exists; what counts starts here

    # ==================================================================
    # 1. The 2026 schedule: Actuals read from F/MNT/02, as linked text
    # ==================================================================
    print("\n==== F/MNT/03 2026: the Actuals come from F/MNT/02 ====")
    sched = record(page, SCHEDULE_ID)
    check("The sample 2026 schedule is on file, Verified by Mukesh Patel", bool(sched) and sched["status"] == "Verified" and sched.get("verifiedBy") == "Mukesh Patel", sched and sched.get("status"))
    check("...on Rev 01 (not pinned to Rev 00), with no Actual stored", bool(sched) and not sched.get("formatRevision") and all(v == "" for r in sched["data"]["rows"] for k, v in r.items() if k.endswith("Actual")))
    check("...and says in its history that it is sample data", bool(sched) and any("Sample data" in (h.get("note") or "") for h in sched.get("history", [])))
    stamp_before = sched["updatedAt"] if sched else None

    open_page(page, f"#/record/{SCHEDULE_ID}")
    heads = page.locator("table.log-sheet thead th").evaluate_all("els => els.map((e) => (e.textContent || '').trim())")
    check("The schedule is headed M/C No., Equipment Name, Frequency", all(h in heads for h in ["M/C No.", "Equipment Name", "Frequency"]), heads)
    check("...and 'Equipoment Name' is not on the Rev 01 grid", "Equipoment Name" not in heads, heads)
    check("Where the Actuals come from is said above the grid", page.locator("[data-section='pm-link-notice']").count() == 1)
    check("...and under it, with the day they were read (it prints)", page.locator("[data-section='pm-actuals-note']").count() == 1 and "Actual dates read from F/MNT/02 on" in (page.locator("[data-section='pm-actuals-note']").first.inner_text() or ""))
    check("No Actual is a box to type in", page.locator("table.log-sheet [data-computed] input, table.log-sheet [data-computed] select").count() == 0)
    linked = page.locator("table.log-sheet [data-computed] a[data-linked-record]").count()
    check("Actual dates are drawn as links to their F/MNT/02", linked > 100, linked)
    filled = page.evaluate(
        """() => ['jan','feb','mar','apr','may','jun','jul','aug'].map((m) =>
             Array.from(document.querySelectorAll(`[data-computed='${m}Actual']`)).some((el) => (el.textContent || '').trim() !== ''))"""
    )
    check("Every month from January to August has Actuals", all(filled), filled)

    m47 = schedule_line(page, "M-47", "Monthly")
    check("M-47's Monthly line is on the schedule", bool(m47), m47)
    jan_plan = (m47 or {}).get("cells", [""] * 6)[4] if m47 else ""
    jan_actual = (m47 or {}).get("actuals", {}).get("janActual", "")
    jan_links = (m47 or {}).get("links", {}).get("janActual", [])
    check("...its January Actual is read from M-47's F/MNT/02", bool(jan_actual) and jan_links == [M47_SHEET], [jan_actual, jan_links])
    check("...with who did it in its tooltip", any("by Rahul Patel, supervised by Mukesh Patel" in t for t in (m47 or {}).get("titles", {}).get("janActual", [])), (m47 or {}).get("titles", {}).get("janActual"))

    m07 = page.locator("[data-state='pm-unlinked'][data-machine='M-07']")
    check("M-07, printed on two blocks, is not linked - and the reason is shown", m07.count() == 1 and "printed on 2 blocks" in m07.first.inner_text(), m07.all_inner_texts())
    m07_line = schedule_line(page, "M-07", "Half Yearly")
    check("...its lines carry no Actual", bool(m07_line) and all(v == "" for v in m07_line["actuals"].values()), m07_line and m07_line["actuals"])

    # The link opens the F/MNT/02 it was read from.
    page.locator(f"a[data-linked-record='{M47_SHEET}']").first.click()
    page.wait_for_timeout(2000)
    dismiss(page)
    close_assistant(page)
    check("Clicking the date opens M-47's F/MNT/02", page.url.endswith(f"#/record/{M47_SHEET}"), page.url)

    # ==================================================================
    # 2. F/MNT/02: the machine's next planned PM from the schedule
    # ==================================================================
    print("\n==== F/MNT/02: the line from the schedule ====")
    this_year = date.today().year
    line = page.locator("[data-section='pm-plan-line'][data-machine='M-47']")
    words = line.first.inner_text() if line.count() else ""
    if this_year == 2026:
        check("M-47's F/MNT/02 shows its next planned PM on the 2026 schedule", f"On the {this_year} schedule (F/MNT/03):" in words and "Monthly planned" in words and "Half Yearly planned" in words, words)
    else:
        check("M-47's F/MNT/02 says what the schedule of this year says", line.count() == 1, words)
    if this_year == 2026:
        check("...with a link to the schedule", page.locator("[data-section='pm-plan-line'] a[data-action='open-pm-schedule']").count() == 1)

    # ==================================================================
    # 3. A PM corrected on F/MNT/02 is followed on F/MNT/03
    # ==================================================================
    print("\n==== A corrected F/MNT/02 date is followed ====")
    sheet = record(page, M47_SHEET)
    original = sheet["data"]["rows"][0]["date"] if sheet else ""
    check("M-47's sample sheet holds a January date", bool(original) and original.startswith("2026-01-"), original)
    # Nine days after January's plan (moved off a closed day): late by M6's rule, still January's.
    plan_day = int(jan_plan.split(".")[0]) if jan_plan and "." in jan_plan else 10
    new_date = open_day(date(2026, 1, plan_day) + timedelta(days=9))
    if new_date.isoformat() == original:
        new_date = open_day(new_date + timedelta(days=1))
    late_by = (new_date - date(2026, 1, plan_day)).days
    box = page.locator("table.log-sheet tbody tr").nth(0).locator("input[type='date']")
    check("The first Monthly slot is a date box on the sheet (In Progress)", box.count() == 1)
    if box.count():
        box.first.fill(new_date.isoformat())
        box.first.press("Tab")
        page.wait_for_timeout(3000)
    after = record(page, M47_SHEET)
    check("...and the corrected date is saved on F/MNT/02", bool(after) and after["data"]["rows"][0]["date"] == new_date.isoformat(), after and after["data"]["rows"][0]["date"])

    open_page(page, f"#/record/{SCHEDULE_ID}")
    m47 = schedule_line(page, "M-47", "Monthly")
    shown = f"{new_date.day:02d}.{new_date.month:02d}"
    # The sample sheets are In Progress, so the schedule marks their dates "*" (not yet Verified).
    star = "" if (after or {}).get("status") == "Verified" else "*"
    check(f"F/MNT/03 follows: M-47's January Actual now reads {shown}{star}", bool(m47) and m47["actuals"].get("janActual") == shown + star, m47 and m47["actuals"].get("janActual"))
    check("...set against January's plan, and said to be late", bool(m47) and any(f"{late_by} days late" in t for t in m47["titles"].get("janActual", [])), m47 and m47["titles"].get("janActual"))
    sched_after = record(page, SCHEDULE_ID)
    check("F/MNT/03 stays Verified and is not written to", bool(sched_after) and sched_after["status"] == "Verified" and sched_after["updatedAt"] == stamp_before, sched_after and [sched_after["status"], sched_after["updatedAt"], stamp_before])

    # Insights reads the same Actual as M6.
    open_page(page, "#/insights", settle=2500)
    expected = f"planned {jan_plan}, done {shown} ({late_by} days late)"
    try:
        # The list is drawn a batch at a time (utils/useProgressive.ts): wait for the line itself.
        page.wait_for_function("(t) => document.body.innerText.includes(t)", arg=expected, timeout=20000)
    except Exception:
        pass
    body = page.locator("body").inner_text()
    check("Insights: M6 says M-47's January PM was done late, from F/MNT/02", expected in body, expected)
    check("...and M8 says M-07 is printed on two blocks", "M-07 is printed on 2 blocks" in body)

    # ==================================================================
    # 4. A machine not on the schedule, and the date put back
    # ==================================================================
    print("\n==== M-68, and the sample put back ====")
    open_page(page, f"#/record/{M68_SHEET}")
    m68 = page.locator("[data-section='pm-plan-line'][data-machine='M-68']")
    m68_words = m68.first.inner_text() if m68.count() else ""
    if this_year == 2026:
        check("M-68's supplied sheet says it is not on the 2026 schedule", "M-68 is not on the 2026 schedule (F/MNT/03)." in m68_words, m68_words)
    m68_all = page.evaluate("() => document.body.innerText + Array.from(document.querySelectorAll('textarea, input')).map((e) => e.value).join(String.fromCharCode(10))")
    check("...and carries its check points as supplied", "Gluing Tap Leakage Checking" in m68_all)

    open_page(page, f"#/record/{M47_SHEET}")
    box = page.locator("table.log-sheet tbody tr").nth(0).locator("input[type='date']")
    if box.count() and original:
        box.first.fill(original)
        box.first.press("Tab")
        page.wait_for_timeout(3000)
    back = record(page, M47_SHEET)
    check("The sample date is put back", bool(back) and back["data"]["rows"][0]["date"] == original, back and back["data"]["rows"][0]["date"])
    open_page(page, f"#/record/{SCHEDULE_ID}")
    m47 = schedule_line(page, "M-47", "Monthly")
    check("...and F/MNT/03 follows it back", bool(m47) and m47["actuals"].get("janActual") == jan_actual, m47 and m47["actuals"].get("janActual"))

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

print(f"\n{len(FAILURES)} failure(s)")
for f in FAILURES:
    print(" -", f)
sys.exit(1 if FAILURES else 0)
