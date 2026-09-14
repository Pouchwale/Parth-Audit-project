"""Document Files: ask for a module's documents over any span, get exactly that span.

Drives the real UI, network-independent (the request is understood locally,
engine/assistantLocal.ts, and the view is pages/FileBrowserPage.tsx):

  * "all documents of pest control module from June to August" opens the
    files view for 1 June - 31 August only — a folder per month, nothing
    from outside those months, nothing from another module;
  * a day-to-day span ("from 3 June to 17 July") holds only files between
    those two days, and "November to February" runs into the next year;
  * "all documents from ... to ..." with no module named opens every module;
  * a folder narrows the list, the From/To boxes change the span, and a
    file opens its record;
  * a broken /files address falls back to this month instead of failing.
"""
import calendar
import sys
import time
from datetime import date
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
TODAY = date.today()


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


def month_end(y, m):
    return date(y, m, calendar.monthrange(y, m)[1])


def ask(page, text):
    if "#/assistant" not in page.url:
        page.goto(f"{BASE}/index.html#/assistant")
        page.wait_for_timeout(600)
        dismiss(page)
    page.fill("textarea.assistant-input", text)
    page.click("button[data-action='send']")
    page.wait_for_timeout(900)


def files(page):
    """Every file in the view (month folders opened first), as (date, doc)."""
    heads = page.locator(".file-month-head[aria-expanded='false']:not([disabled])")
    for _ in range(heads.count()):
        heads.first.click()
        page.wait_for_timeout(40)
    return page.locator(".file-row").evaluate_all("rs => rs.map(r => [r.dataset.fileDate, r.dataset.doc])")


def month_folders(page):
    return page.locator(".file-month").evaluate_all("ms => ms.map(m => m.dataset.month)")


# The three whole months before this one ("June to August" in September).
end_y, end_m = (TODAY.year, TODAY.month - 1) if TODAY.month > 1 else (TODAY.year - 1, 12)
start_y, start_m = (end_y, end_m - 2) if end_m > 2 else (end_y - 1, end_m + 10)
SPAN_FROM = date(start_y, start_m, 1)
SPAN_TO = month_end(end_y, end_m)
M1, M2 = calendar.month_name[start_m], calendar.month_name[end_m]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950})
    page.on("pageerror", lambda e: FAILURES.append(f"page error: {e}"))
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    page.click("text=Sign up")
    page.fill("#signup-name", "Files QA")
    page.fill("#signup-email", f"files-{int(time.time()*1000)}@example.com")
    page.fill("#signup-password", "PlaywrightQA123")
    page.fill("#signup-confirm", "PlaywrightQA123")
    page.click("button:has-text('Create Account')")
    page.wait_for_timeout(1200)
    dismiss(page)

    # ---- the plain view, and a broken address ----
    this_from = date(TODAY.year, TODAY.month, 1).isoformat()
    this_to = month_end(TODAY.year, TODAY.month).isoformat()
    page.goto(f"{BASE}/index.html#/files")
    page.wait_for_timeout(700)
    check(
        "Document Files opens on this month by itself",
        page.locator("[data-section='file-browser']").count() == 1
        and page.input_value("[data-field='files-from']") == this_from
        and page.input_value("[data-field='files-to']") == this_to,
    )
    page.goto(f"{BASE}/index.html#/files/all/{TODAY.year}-13-40/{TODAY.year}-01-01")
    page.wait_for_timeout(700)
    check(
        "A /files address with an impossible date falls back to this month, without an error",
        page.locator("[data-section='file-browser']").count() == 1 and page.input_value("[data-field='files-from']") == this_from,
    )

    # ---- month to month across the new year (Live: cheap, only what's scheduled) ----
    ask(page, "show fly catcher records from November to February")
    rollover_to = month_end(TODAY.year + 1, 2).isoformat()
    check(
        '"November to February" runs from 1 November to the end of February next year',
        page.url.endswith(f"#/files/fly-catcher/{TODAY.year}-11-01/{rollover_to}"),
        page.url,
    )
    rows = files(page)
    check(
        "…and every file in it is a fly catcher file inside that span",
        all(d >= f"{TODAY.year}-11-01" and d <= rollover_to and doc == "fly-catcher" for d, doc in rows),
        rows[:5],
    )

    # ---- Demo Mode: a year of records to search ----
    page.click(".pill-tab:has-text('Demo Mode')")
    page.wait_for_timeout(3000)
    dismiss(page)

    ask(page, f"i want all document of pest control module from {M1} to {M2}")
    check(
        f"Asking for pest control documents from {M1} to {M2} opens exactly that span",
        page.url.endswith(f"#/files/pest-control/{SPAN_FROM.isoformat()}/{SPAN_TO.isoformat()}"),
        page.url,
    )
    expected_months = [f"{SPAN_FROM.year}-{start_m:02d}"]
    y, m = SPAN_FROM.year, start_m
    while (y, m) != (end_y, end_m):
        y, m = (y, m + 1) if m < 12 else (y + 1, 1)
        expected_months.append(f"{y}-{m:02d}")
    check("One month folder per month asked for — no more, no fewer", month_folders(page) == expected_months, month_folders(page))
    rows = files(page)
    pest_docs = page.locator("[data-folder^='doc:']").evaluate_all("bs => bs.map(b => b.dataset.folder.slice(4))")
    check("The folders are the pest control documents only", len(pest_docs) >= 3 and not any(d.startswith(("qc-", "prd-")) for d in pest_docs), pest_docs)
    check(
        "Every file is a pest control document dated inside the span",
        len(rows) > 50 and all(SPAN_FROM.isoformat() <= d <= SPAN_TO.isoformat() and doc in pest_docs for d, doc in rows),
        (len(rows), rows[:5]),
    )
    summary = page.locator("[data-section='file-summary']").inner_text()
    check("The summary counts exactly the files shown", summary.startswith(f"{len(rows)} files"), summary)

    # A folder narrows the list; the breadcrumb says where you are.
    page.click("[data-folder='doc:fly-catcher']")
    page.wait_for_timeout(300)
    fly = files(page)
    check(
        "Opening the fly catcher folder shows its files only",
        len(fly) > 0 and all(doc == "fly-catcher" for _, doc in fly) and len(fly) < len(rows),
        fly[:5],
    )
    check("The breadcrumb names the folder", "Fly" in page.locator("[data-section='file-breadcrumb']").inner_text())

    # The From box changes the span (and the address).
    new_from = date(end_y, end_m, 1).isoformat()
    page.fill("[data-field='files-from']", new_from)
    page.wait_for_timeout(700)
    rows_after = files(page)
    check(
        "Changing From narrows the span and the address follows",
        page.url.endswith(f"#/files/pest-control/{new_from}/{SPAN_TO.isoformat()}") and all(d >= new_from for d, _ in rows_after) and len(rows_after) > 0,
        page.url,
    )

    # The chat kept the written answer.
    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_timeout(600)
    reply = page.locator(".assistant-page .chat-msg.bot").last.inner_text()
    check("The chat keeps a written list with the span it covered", f"{M1} {SPAN_FROM.year} to {M2} {end_y}" in reply, reply[:200])

    # ---- day to day ----
    d1 = date(start_y, start_m, 3)
    d2 = date(end_y, end_m, 17) if (end_y, end_m) != (start_y, start_m) else date(end_y, end_m, 20)
    ask(page, f"pest control documents from {d1.day} {M1} to {d2.day} {calendar.month_name[d2.month]}")
    rows = files(page)
    check(
        f"A day-to-day span ({d1.day} {M1} to {d2.day} {calendar.month_name[d2.month]}) holds only files between those two days",
        page.url.endswith(f"#/files/pest-control/{d1.isoformat()}/{d2.isoformat()}")
        and len(rows) > 0
        and min(d for d, _ in rows) >= d1.isoformat()
        and max(d for d, _ in rows) <= d2.isoformat(),
        (page.url, rows[:3], rows[-3:]),
    )

    # ---- every module ----
    ask(page, f"show all documents from 1 {M2} to 5 {M2}")
    first5 = date(end_y, end_m, 5).isoformat()
    rows = files(page)
    modules = page.locator("[data-folder^='module:']").count()
    check(
        '"All documents from 1 to 5 …" opens every module for those five days',
        page.url.endswith(f"#/files/all/{date(end_y, end_m, 1).isoformat()}/{first5}") and modules >= 3 and all(d <= first5 for d, _ in rows),
        (page.url, modules),
    )

    # ---- a file opens its record ----
    page.locator(".file-row").first.click()
    page.wait_for_timeout(900)
    check("Opening a file opens that record", "#/files" not in page.url and page.locator(".doc-sheet, .doc-table, [data-section]").count() > 0, page.url)

    # ---- month words that aren't months ----
    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_timeout(500)
    ask(page, "may i see the pest control records marked this week")
    check('"may I … marked …" is read as this week, not as May or March', "/files/pest-control/" in page.url and f"-05-01/" not in page.url and "-03-01/" not in page.url, page.url)

    browser.close()

print(f"\n{'ALL PASS' if not FAILURES else f'{len(FAILURES)} FAILED'}")
for f in FAILURES:
    print("  -", f)
sys.exit(1 if FAILURES else 0)
