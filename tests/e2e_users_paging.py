"""Users & Access and User access a page of people at a time (the owner, 25-Oct-2026):

  "so now use pagination in user access because there are many id's we have created currently and so low ending
  devices take time to load that page so make sure it should load fast"

The super admin makes 60 accounts (each on a random password made in the browser, never kept), and then:

  * Users & Access: the accounts table draws 25 of them, with "1–25 of N accounts" and the pages; Next, a page
    number and the last page; Find a person finds one account on a later page by its name, every word typed, and
    says so when nobody matches; clearing it goes back to the first page; the same pages under the table, whose
    Next brings the table's top back into view;
  * Who may do what: the grid draws the super admins and 25 staff - 250 level boxes, not one row per account -
    with its own pages and Find a person;
  * User access: Today and Who may use which module each draw 25 people with their own pages and Find a person;
  * fast on a low-end laptop: at 6x CPU throttle each page is drawn well inside the bound below, where with every
    account drawn Users & Access took over nine seconds with 300 accounts (scratchpad measurement, 25-Oct-2026);
  * no JavaScript errors.

Against the product server on :8843 (DCRS_BASE overrides it) with the plant's seeded super admin on the first
password the runner gives it (DCRS_SEED_PASSWORD). It runs last of the product server's suites: its accounts stay.
"""
import math
import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD")
if not SEED_PASSWORD:
    raise SystemExit("DCRS_SEED_PASSWORD is not set: run this suite through npm run test:e2e.")
ADMIN = "admin@gpp.local"
STAMP = str(int(time.time()))[-5:]
MAKE = 60
PAGE = 25
# A page drawn at 6x CPU throttle, from the Dashboard: generous for a busy test PC, a fraction of the nine seconds before.
BOUND_MS = 5000
FAILURES = []
ERRORS = []

MAKE_JS = """async ({ n, stamp }) => {
  const depts = [["QC"], ["PRD"], ["STR"], ["HR"], ["PUR"], ["QC", "PRD"], []];
  const pw = () => Array.from(crypto.getRandomValues(new Uint8Array(9))).map((b) => b.toString(16).padStart(2, "0")).join("") + "Aa1";
  let made = 0; const failed = [];
  for (let i = 1; i <= n; i++) {
    const num = String(i).padStart(3, "0");
    const res = await fetch("/api/users", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Paging Person ${num} ${stamp}`, email: `paging.person${num}.${stamp}@gpp.local`, password: pw(), departments: depts[i % depts.length] }) });
    if (res.ok) made++; else if (failed.length < 3) failed.push(res.status + " " + (await res.text()).slice(0, 160));
  }
  return { made, failed };
}"""


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:900])


def dismiss(page):
    for _ in range(3):
        g = page.locator("button:has-text('Got it')")
        if g.count():
            try:
                g.first.click(timeout=3000)
            except Exception:
                pass
            page.wait_for_timeout(200)


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        try:
            btn.first.click(timeout=3000)
        except Exception:
            pass
        page.wait_for_timeout(200)


def open_page(page, route, settle=1500):
    page.goto(f"{BASE}/index.html#{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def pager(page, name):
    bar = page.locator(f"[data-section='pager'][data-list='{name}']")
    if bar.count() != 1:
        return {"count": bar.count()}
    return bar.evaluate(
        """(el) => ({ count: 1, page: Number(el.getAttribute('data-page')), pages: Number(el.getAttribute('data-pages')), total: Number(el.getAttribute('data-total')),
             words: (el.querySelector("[data-field='pager-count']") || {}).textContent || '' })"""
    )


def rows(page, table):
    return page.locator(f"[data-table='{table}'] tbody tr").count()


def find(page, name, typed):
    page.locator(f"[data-section='pager'][data-list='{name}'] input[data-action='find-person']").fill(typed)
    page.wait_for_timeout(500)


def click_in(page, name, selector):
    page.locator(f"[data-section='pager'][data-list='{name}'] {selector}").first.click()
    page.wait_for_timeout(500)


def timed(page, cdp, route, tables):
    """From the Dashboard to the page's tables drawn and no longer growing, at 6x CPU throttle: milliseconds."""
    open_page(page, "/dashboard", settle=2000)
    page.evaluate("() => { window.__cnt = -1; window.__cntAt = 0; }")
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 6})
    try:
        t0 = page.evaluate("() => performance.now()")
        page.evaluate(f"() => {{ location.hash = '{route}'; }}")
        count = " + ".join(f"document.querySelectorAll(\"[data-table='{t}'] tbody tr\").length" for t in tables)
        each = " && ".join(f"document.querySelectorAll(\"[data-table='{t}'] tbody tr\").length > 0" for t in tables)
        page.wait_for_function(
            "() => { const n = " + count + "; const now = performance.now();"
            " if (n !== window.__cnt) { window.__cnt = n; window.__cntAt = now; return false; } return " + each + " && now - window.__cntAt > 600; }",
            timeout=120000,
            polling=100,
        )
        return round(page.evaluate("() => window.__cntAt") - t0)
    finally:
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1366, "height": 768})
    page.add_init_script("try { sessionStorage.setItem('dcrs:intro-seen', '1'); } catch (e) {}")
    page.on("pageerror", lambda e: ERRORS.append(str(e)))
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    page.fill("#login-email", ADMIN)
    page.fill("#login-password", SEED_PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=90000)
    page.wait_for_timeout(1200)
    dismiss(page)
    close_assistant(page)
    ERRORS[:] = [e for e in ERRORS if "401" not in e]

    print("\n==== Sixty accounts made by the super admin ====")
    made = page.evaluate(MAKE_JS, {"n": MAKE, "stamp": STAMP})
    check(f"The super admin makes {MAKE} accounts", made["made"] == MAKE, made)

    # ---- Users & Access ----
    print("\n==== Users & Access: the accounts, 25 to a page ====")
    open_page(page, "/users", settle=2500)
    bar = pager(page, "users")
    total = bar.get("total", 0)
    pages = math.ceil(total / PAGE) if total else 0
    check("The accounts have a pager: the count, the pages and Find a person", bar.get("count") == 1 and total >= MAKE and bar.get("pages") == pages, bar)
    check("...the first page draws 25 accounts, not every one", rows(page, "users") == PAGE, rows(page, "users"))
    check("...and says which: 1–25 of them", bar.get("words", "").startswith(f"1–{PAGE} of {total} accounts"), bar.get("words"))
    first_on_one = page.locator("[data-table='users'] tbody tr").first.get_attribute("data-user")
    click_in(page, "users", "[data-action='page-next']")
    bar = pager(page, "users")
    first_on_two = page.locator("[data-table='users'] tbody tr").first.get_attribute("data-user")
    check("Next shows page 2: the next 25, other accounts", bar.get("page") == 2 and rows(page, "users") == PAGE and first_on_two != first_on_one and bar.get("words", "").startswith(f"{PAGE + 1}–{2 * PAGE} of"), (bar, first_on_one, first_on_two))
    click_in(page, "users", f"[data-action='page'][data-page='{pages}']")
    bar = pager(page, "users")
    last_rows = total - PAGE * (pages - 1)
    check(f"The last page ({pages}) holds the {last_rows} left over", bar.get("page") == pages and rows(page, "users") == last_rows, (bar, rows(page, "users")))
    check("...and its Next is off", page.locator("[data-section='pager'][data-list='users'] [data-action='page-next']").is_disabled())
    target = f"paging.person047.{STAMP}@gpp.local"
    find(page, "users", f"person 047 {STAMP}")
    bar = pager(page, "users")
    found = page.locator("[data-table='users'] tbody tr").evaluate_all("(trs) => trs.map((tr) => tr.getAttribute('data-user'))")
    check("Find a person finds the account on a later page, every word typed in its name", found == [target] and bar.get("page") == 1, (found, bar))
    check("...and the count says 1 of the accounts", bar.get("words", "").startswith(f"1–1 of 1 accounts (of {total})"), bar.get("words"))
    find(page, "users", f"paging.person012.{STAMP}")
    found = page.locator("[data-table='users'] tbody tr").evaluate_all("(trs) => trs.map((tr) => tr.getAttribute('data-user'))")
    check("...or by its sign-in", found == [f"paging.person012.{STAMP}@gpp.local"], found)
    find(page, "users", "nobody by this name zz")
    bar = pager(page, "users")
    check("Nobody found: no rows, and the pager says so", rows(page, "users") == 0 and "Nobody matches" in bar.get("words", ""), bar)
    find(page, "users", "")
    bar = pager(page, "users")
    check("Cleared, the list is back at its first page", bar.get("page") == 1 and rows(page, "users") == PAGE and bar.get("total") == total, bar)
    foot = page.locator("[data-section='pager-foot'][data-list='users']")
    check("The same pages under the table, without a second Find a person", foot.count() == 1 and foot.locator("input").count() == 0, foot.count())
    if foot.count():
        foot.locator("[data-action='page-next']").click()
        page.wait_for_timeout(600)
        bar = pager(page, "users")
        top = page.evaluate("() => document.querySelector(\"[data-section='pager'][data-list='users']\").getBoundingClientRect().top")
        check("...Next there shows page 2, and brings the table's top into view", bar.get("page") == 2 and -5 <= top <= 400, (bar, top))
        click_in(page, "users", "[data-action='page'][data-page='1']")

    print("\n==== Who may do what: the grid, 25 people to a page ====")
    grid = pager(page, "access-grid")
    staff_rows = page.locator("[data-table='access-grid'] tbody tr:not([data-boss])").count()
    boxes = page.locator("[data-table='access-grid'] select[data-field='module-level']").count()
    check("The grid has a pager of its own", grid.get("count") == 1 and grid.get("total", 0) >= MAKE, grid)
    check("...and draws 25 staff, 250 level boxes, not one row per account", staff_rows == PAGE and boxes == PAGE * 10, (staff_rows, boxes))
    find(page, "access-grid", f"Paging Person 059 {STAMP}")
    people = page.locator("[data-table='access-grid'] tbody tr:not([data-boss])").evaluate_all("(trs) => trs.map((tr) => tr.getAttribute('data-access-person'))")
    check("Find a person in the grid", people == [f"paging.person059.{STAMP}@gpp.local"], people)
    page.locator("[data-table='access-grid'] tbody tr:not([data-boss]) select[data-field='module-level']").first.select_option("read")
    page.wait_for_timeout(400)
    ask = page.locator("[data-section='confirm-access']")
    check("...and the person found can be given a level, asked first", ask.count() == 1 and "Paging Person 059" in ask.inner_text(), ask.inner_text() if ask.count() else None)
    no = page.locator("button:has-text('No, leave it')")
    if no.count():
        no.first.click()
        page.wait_for_timeout(300)
    find(page, "access-grid", "")

    # ---- User access ----
    print("\n==== User access: Today and Who may use which module, 25 to a page ====")
    open_page(page, "/access", settle=3000)
    for name, table in (("access-today", "access-today"), ("access-modules", "access-modules")):
        bar = pager(page, name)
        check(f"{table}: a pager, and 25 people drawn", bar.get("count") == 1 and bar.get("total", 0) >= MAKE and rows(page, table) == PAGE, (bar, rows(page, table)))
        click_in(page, name, "[data-action='page-next']")
        bar = pager(page, name)
        check("...Next shows its page 2", bar.get("page") == 2 and rows(page, table) == PAGE, bar)
        find(page, name, f"person 033 {STAMP}")
        found = page.locator(f"[data-table='{table}'] tbody tr").evaluate_all("(trs) => trs.map((tr) => tr.getAttribute('data-user'))")
        check("...and Find a person finds one", found == [f"paging.person033.{STAMP}@gpp.local"], found)
        find(page, name, "")

    # ---- Fast on a low-end laptop ----
    print("\n==== At 6x CPU throttle, a low-end laptop ====")
    cdp = page.context.new_cdp_session(page)
    users_ms = timed(page, cdp, "#/users", ["users", "access-grid"])
    access_ms = timed(page, cdp, "#/access", ["access-today", "access-modules"])
    print(f"     (Users & Access drawn in {users_ms} ms, User access in {access_ms} ms, with {total} accounts, 6x throttle)")
    check(f"Users & Access is drawn within {BOUND_MS} ms at 6x CPU throttle", users_ms < BOUND_MS, users_ms)
    check(f"User access is drawn within {BOUND_MS} ms at 6x CPU throttle", access_ms < BOUND_MS, access_ms)

    check("No JavaScript errors", not ERRORS, ERRORS[:5])
    browser.close()

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
