"""The Performance Scorecard (REQUIREMENTS s64), asked for on 19-Sep-2026:

  "make separate dashboard which give score to Kapila, HR's and module wise who
   is responsible for their document and decision will be taken on basis of
   what assigned task is done on time or not."

  * /performance is a dashboard of its own, and it says on its face how a score
    is worked out - on time 1, late 1/2, never done 0, as-required records get
    2 days - because people are judged by it;
  * departments, modules and documents are scored worst first, and every line
    ADDS UP: on time + late + never done = records due, and the score is the
    formula, recomputed here from the line's own numbers; one document is
    recounted here from its records on file;
  * the period changes what is counted;
  * a document's line opens that format's own page; the scorecard exports as
    CSV and prints alone;
  * the accounts come from GET /api/users/directory, which never carries an
    email or a password: an account with no departments is listed without a
    score, an account kept to Quality Control is scored on QC's documents,
    sees QC only, and is handed only the accounts that share QC;
  * where a department has two accounts a submitted record counts for whoever
    submitted it and an unsubmitted one against both, and a person who also
    answers for a department the viewer cannot see is marked as part-scored
    (the page is handed a made-up directory for this; the records are real).

Network-independent, against the production build on :8842. The suite signs up
two accounts: a fresh one with no departments, and one kept to Quality Control
that is created the first time and signed in to after that.

It runs on the real clock: in the first three days of a month the lines are
read over the last 3 months, because next to nothing of the month is due yet.
"""
import calendar
import csv
import io
import json
import math
import os
import sys
import tempfile
import time
from datetime import date, datetime

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
# Names with no word in them that is also a button's label.
VIEWER = "Tally QA"
QC_PERSON = "Meena Tally"
QC_EMAIL = "meena.tally@example.com"
FAILURES = []
TMP = tempfile.mkdtemp(prefix="performance-")

STUB_PRINT = "() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }"
END_PRINT = "() => window.dispatchEvent(new Event('afterprint'))"
# Whether an element is on the printout: a box in the (print) layout.
SHOWN = "const shown = (s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; };"


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:600])


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


def open_page(page, route, settle=1300):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def stored(page, key):
    return page.evaluate("(k) => JSON.parse(localStorage.getItem('dcrs:v1:' + k) || 'null')", key)


def js_round(x):
    """Math.round, which rounds a half up - Python's round() rounds it to even."""
    return math.floor(x + 0.5)


def expected_score(on_time, late, overdue):
    due = on_time + late + overdue
    return None if due == 0 else js_round(100 * (on_time + 0.5 * late) / due)


def table_rows(page, table):
    """Each line of a scorecard table: its key and its figures, read from the cells' own names."""
    return page.locator(f"[data-table='{table}'] tbody tr[data-grade]").evaluate_all(
        """els => els.map((tr) => {
             const cell = (name) => (tr.querySelector(`[data-col='${name}']`) || {}).textContent || '';
             const n = (name) => Number(cell(name).trim());
             return {
               key: tr.dataset.row || tr.dataset.document || '',
               grade: tr.dataset.grade,
               due: n('due'), onTime: n('onTime'), late: n('late'), overdue: n('overdue'), pending: n('pending'),
               score: cell('score').trim(),
             };
           })"""
    )


def adds_up(rows):
    """The lines whose counts do not add up, or whose score is not the formula."""
    wrong = []
    for r in rows:
        want = expected_score(r["onTime"], r["late"], r["overdue"])
        shown_score = None if r["score"] == "—" else int(r["score"])
        if r["onTime"] + r["late"] + r["overdue"] != r["due"] or shown_score != want:
            wrong.append((r, want))
    return wrong


def grade_for(score):
    if score is None:
        return "nothing-due"
    return "excellent" if score >= 90 else "on-track" if score >= 75 else "needs-attention" if score >= 50 else "falling-behind"


def worst_first(rows):
    scores = [None if r["score"] == "—" else int(r["score"]) for r in rows]
    numbered = [s for s in scores if s is not None]
    # Lowest score first, and the lines with nothing due after every scored one.
    return numbered == sorted(numbered) and all(s is None for s in scores[len(numbered):])


def overall(page):
    return page.locator("[data-section='performance-overall']").evaluate(
        """el => Object.fromEntries(Array.from(el.querySelectorAll('[data-overall]')).map((c) => [c.dataset.overall, c.textContent.trim()]))"""
    )


def select_period(page, key):
    page.select_option("[data-field='performance-period']", key)
    page.wait_for_timeout(900)


def directory(page):
    return page.evaluate(
        """async () => {
             const res = await fetch('/api/users/directory', { credentials: 'include' });
             const text = await res.text();
             return { status: res.status, text };
           }"""
    )


def all_keys(value, into):
    if isinstance(value, dict):
        for k, v in value.items():
            into.add(k)
            all_keys(v, into)
    elif isinstance(value, list):
        for v in value:
            all_keys(v, into)
    return into


def sign_up(page, name, email, department=None):
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", name)
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    if department:
        page.select_option("#signup-department", department)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)


def demo_mode(page):
    """The top bar's Demo Mode, which lands on the Demo Mode page."""
    page.locator(".app-topbar .pill-tab").nth(1).click()
    page.wait_for_timeout(600)
    dismiss(page)


def closed_day(iso, master):
    """engine/holidays.ts: a festival holiday, else an adjustment day (open), else the weekly off."""
    if any(h.get("date") == iso for h in (master or {}).get("holidays") or []):
        return True
    if any(a.get("date") == iso for a in (master or {}).get("adjustmentDays") or []):
        return False
    weekly_off = (master or {}).get("weeklyOffDay")
    weekly_off = 4 if weekly_off is None else weekly_off
    # Python's Monday = 0; the app's Sunday = 0.
    return (date.fromisoformat(iso).weekday() + 1) % 7 == weekly_off


def months_back(day, n):
    """The first day of the month n months before `day`'s."""
    year, month = day.year, day.month - n
    while month < 1:
        year, month = year - 1, month + 12
    return date(year, month, 1)


def card_figures(card):
    """A person's card: the score, the counts and the decision, read from its own names."""
    return card.evaluate(
        """el => {
             const n = (name) => Number(((el.querySelector(`[data-count='${name}'] strong`) || {}).textContent || '0').trim());
             const text = (sel) => ((el.querySelector(sel) || {}).textContent || '').trim();
             return {
               scored: el.dataset.scored, grade: el.dataset.grade,
               score: text("[data-field='person-score']"), onTime: n('onTime'), late: n('late'), overdue: n('overdue'),
               decision: text("[data-section='person-decision']"), partial: text("[data-section='person-partial']"),
             };
           }"""
    )


def recount(records, master, document_id, first, last, today):
    """One scheduled document's records on file, judged the way the page says it judges them."""
    got = {"onTime": 0, "late": 0, "overdue": 0, "pending": 0}
    for r in records:
        if r["documentId"] != document_id or not r.get("isDemo") or not (first <= r["dueDate"] <= last):
            continue
        if closed_day(r["dueDate"], master):
            continue
        handed_in = next((h["at"] for h in r.get("history") or [] if h.get("action") == "submitted"), None) or r.get("submittedAt")
        if handed_in:
            on = datetime.fromisoformat(handed_in.replace("Z", "+00:00")).astimezone().date().isoformat()
            got["onTime" if on <= r["dueDate"] else "late"] += 1
        elif r["status"] in ("Submitted", "Pending Verification", "Verified", "Rejected"):
            got["onTime"] += 1
        elif r["dueDate"] < today and r["status"] in ("Scheduled", "Due", "In Progress"):
            got["overdue"] += 1
        else:
            got["pending"] += 1
    return got


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000}, accept_downloads=True)
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    email = f"tally-{int(time.time() * 1000)}@example.com"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    sign_up(page, VIEWER, email)

    # ==================================================================
    # 0. A demo year to score: hundreds of records, on time, late and never done
    # ==================================================================
    demo_mode(page)
    page.click("button:has-text('Generate Demo Records')")
    page.wait_for_timeout(1500)
    # The Dashboard fills the demo year so far (pages/DashboardPage.tsx).
    open_page(page, "#/dashboard", settle=4000)
    records = stored(page, "records") or []
    demo = [r for r in records if r.get("isDemo")]
    check("Demo Mode holds hundreds of records to score", len(demo) >= 300, len(demo))

    today = date.today()
    today_iso = today.isoformat()
    month_first = today.replace(day=1).isoformat()
    month_last = today.replace(day=calendar.monthrange(today.year, today.month)[1]).isoformat()
    # THE SUITE RUNS ON THE REAL CLOCK. On the first days of a month next to
    # nothing of it has fallen due yet (and the 1st may be the weekly off), so
    # the lines are then read over the last 3 months instead; the page still
    # opens on this month. In the first days of January even that is thin - the
    # demo year starts on the 1st - and "something was due" is not asked.
    EARLY = today.day <= 3
    THIN = EARLY and today.month == 1
    FOCUS = "last-3-months" if EARLY else "this-month"
    focus_first = months_back(today, 2).isoformat() if EARLY else month_first

    # ==================================================================
    # 1. The page, and the rule people are judged by
    # ==================================================================
    open_page(page, "#/performance", settle=2500)
    check("The Performance Scorecard is a page of its own", page.locator("[data-page='performance']").count() == 1 and page.locator("[data-section='performance-scorecard']").count() == 1)
    rule = page.locator("[data-section='performance-rule']").evaluate("el => el.textContent")
    check(
        "It says exactly how a score is worked out: on time 1, late ½, never done 0, and 2 days for an as-required record",
        all(part in rule for part in ("on time 1", "late ½", "never done 0", "as-required record gets 2 days")),
        rule,
    )
    check("It opens on this month", page.locator("[data-field='performance-period']").input_value() == "this-month")
    check("A demo year has no go-live date to leave records out by", page.locator("[data-section='performance-counted-from']").count() == 0)
    if EARLY:
        select_period(page, FOCUS)

    # ==================================================================
    # 2. Departments and modules: the counts add up, the score is the formula
    # ==================================================================
    departments = table_rows(page, "performance-departments")
    modules = table_rows(page, "performance-modules")
    check("The department table has the plant's departments, some with records due", len(departments) >= 4 and (THIN or any(r["due"] > 0 for r in departments)), departments)
    check("Every department line adds up (on time + late + never done = due) and its score is the formula", not adds_up(departments), adds_up(departments)[:3])
    check("The module table has the modules, some with records due", len(modules) >= 4 and (THIN or any(r["due"] > 0 for r in modules)), modules)
    check("Every module line adds up, and its score is the formula", not adds_up(modules), adds_up(modules)[:3])
    check("Each line's grade follows its score", all(r["grade"] == grade_for(None if r["score"] == "—" else int(r["score"])) for r in departments + modules), [(r["key"], r["score"], r["grade"]) for r in departments + modules])
    check("Departments and modules are listed worst first", worst_first(departments) and worst_first(modules), ([r["score"] for r in departments], [r["score"] for r in modules]))
    total = overall(page)
    check(
        "The plant's figures are the departments added up - every document is in exactly one",
        int(total["due"]) == sum(r["due"] for r in departments) == sum(r["due"] for r in modules) and int(total["onTime"]) == sum(r["onTime"] for r in departments),
        (total, sum(r["due"] for r in departments), sum(r["due"] for r in modules)),
    )

    # ==================================================================
    # 3. Documents: worst first, each line its own records on file
    # ==================================================================
    page.wait_for_timeout(800)  # the long list fills a batch at a time
    documents = table_rows(page, "performance-documents")
    check("The documents table lists every record-holding format", len(documents) >= 40, len(documents))
    check("Every document line adds up, and its score is the formula", not adds_up(documents), adds_up(documents)[:3])
    check("Documents are listed worst first", worst_first(documents), [r["score"] for r in documents][:20])
    master = stored(page, "master")
    viscosity = next((r for r in documents if r["key"] == "qc-viscosity"), None)
    mine = recount(records, master, "qc-viscosity", focus_first, month_last, today_iso)
    check(
        "F-QC-30's line is what its records on file say, recounted here: on time, late, never done and not yet due",
        viscosity is not None and {k: viscosity[k] for k in mine} == mine and (THIN or viscosity["due"] > 0),
        (viscosity, mine),
    )

    # ==================================================================
    # 4. The period changes what is counted
    # ==================================================================
    select_period(page, "this-year")
    year_total = overall(page)
    year_departments = table_rows(page, "performance-departments")
    check("This year's lines add up as well", not adds_up(year_departments) and not adds_up(table_rows(page, "performance-modules")), adds_up(year_departments)[:3])
    check(
        "The demo year has the spread a scorecard is for: records on time, late and never done",
        THIN or (int(year_total["onTime"]) > 0 and int(year_total["late"]) > 0 and int(year_total["overdue"]) > 0),
        year_total,
    )
    year_viscosity = next((r for r in table_rows(page, "performance-documents") if r["key"] == "qc-viscosity"), None)
    year_mine = recount(records, master, "qc-viscosity", f"{today.year}-01-01", f"{today.year}-12-31", today_iso)
    check("F-QC-30's line for the year is its records on file for the year", year_viscosity is not None and {k: year_viscosity[k] for k in year_mine} == year_mine, (year_viscosity, year_mine))
    # Every period, and what each one counts. Which of them differ depends on
    # the day (in January the year IS the month so far), so the periods are
    # asked together: they cannot all count the same, and a wider one never
    # counts less than a period inside it.
    dues = {}
    shown_for = {}
    for key in ("this-month", "last-month", "last-3-months", "this-year"):
        select_period(page, key)
        dues[key] = int(overall(page)["due"])
        shown_for[key] = page.locator("[data-section='performance-overall']").get_attribute("data-period")
    check("Each period chosen is the period shown", all(shown_for[k] == k for k in dues), shown_for)
    check("Changing the period changes what is counted", THIN or len(set(dues.values())) > 1, dues)
    check(
        "...a wider period never counting less than one inside it",
        dues["this-month"] <= dues["last-3-months"] and dues["last-month"] <= dues["last-3-months"] and dues["this-month"] <= dues["this-year"],
        dues,
    )
    if today.month > 1:
        select_period(page, "last-month")
        check("Last month counts last month's records", dues["last-month"] > 0, dues)
        last_rows = table_rows(page, "performance-departments")
        # (An as-required record started on the month's last day still has its 2 days on the 1st and 2nd.)
        check("...with nothing 'not due yet' in a month that is over", EARLY or all(r["pending"] == 0 for r in last_rows), last_rows)

    # ==================================================================
    # 5. The people: who is listed, and what the server hands out about them
    # ==================================================================
    card = page.locator(f"[data-person='{VIEWER}']")
    check("The signed-in account, which has no departments, is listed", card.count() == 1, card.count())
    check(
        "...without a score: it works across the plant and answers for no document of its own",
        card.count() == 1 and card.get_attribute("data-scored") == "no" and card.locator("[data-field='person-score']").count() == 0 and card.locator("[data-field='person-unscored']").count() == 1,
        card.first.evaluate("el => el.textContent") if card.count() else None,
    )
    written = card.locator(".score-card-name.notranslate[translate='no']")
    check("A person's name is shown as written, never translated", card.count() == 1 and written.count() == 1 and written.evaluate("el => el.textContent.trim()") == VIEWER)
    check("The page says how a record counts where a department has more than one account", "counts for the person who submitted it" in page.locator("[data-section='performance-people-rule']").evaluate("el => el.textContent"))
    listing = directory(page)
    body = json.loads(listing["text"]) if listing["status"] == 200 else {}
    people = body.get("people") or []
    check("GET /api/users/directory answers a signed-in account with the accounts", listing["status"] == 200 and len(people) >= 1, listing["text"][:300])
    check(
        "Each account is a name, a role and its departments",
        all(isinstance(x.get("name"), str) and x["name"] and x.get("role") in ("admin", "staff") and isinstance(x.get("departments"), list) and isinstance(x.get("id"), str) for x in people),
        people[:3],
    )
    keys = all_keys(body, set())
    check(
        "...and never an email or a password: no such key, and no address anywhere in what is sent",
        keys == {"people", "id", "name", "role", "departments"} and "@" not in listing["text"] and email not in listing["text"] and "password" not in listing["text"].lower(),
        sorted(keys),
    )
    check("An account with no departments reads every account, itself among them", any(x["name"] == VIEWER and x["departments"] == [] for x in people), [x["name"] for x in people])
    anonymous = page.evaluate("() => fetch('/api/users/directory', { credentials: 'omit' }).then((r) => r.status)")
    check("Nobody reads it without signing in", anonymous == 401, anonymous)
    scored = page.locator("[data-person][data-scored='yes']").evaluate_all(
        """els => els.map((el) => {
             const n = (name) => Number(((el.querySelector(`[data-count='${name}'] strong`) || {}).textContent || '0').trim());
             return { name: el.dataset.person, score: el.querySelector("[data-field='person-score']").textContent.trim(), onTime: n('onTime'), late: n('late'), overdue: n('overdue') };
           })"""
    )
    check(
        "Every person who is scored carries the formula's score for their own counts",
        all((None if s["score"] == "—" else int(s["score"])) == expected_score(s["onTime"], s["late"], s["overdue"]) for s in scored),
        scored,
    )

    # ==================================================================
    # 6. A document's line opens the format's own page
    # ==================================================================
    select_period(page, "this-month")
    page.locator("[data-table='performance-documents'] tr[data-document='qc-viscosity'] [data-action='open-scored-document']").click()
    page.wait_for_timeout(1500)
    check("A document's line opens that format's own page", page.url.endswith("#/document/qc-viscosity"), page.url)

    # ==================================================================
    # 7. Export CSV, and Print prints the scorecard alone
    # ==================================================================
    open_page(page, "#/performance", settle=2500)
    page.wait_for_timeout(800)
    on_screen = table_rows(page, "performance-documents")
    with page.expect_download() as dl:
        page.click("[data-action='performance-export']")
    download = dl.value
    path = os.path.join(TMP, "scorecard.csv")
    download.save_as(path)
    with io.open(path, encoding="utf-8-sig") as f:
        lines = list(csv.reader(f))
    check(
        "Export CSV downloads the scorecard, named for the period and marked as demo",
        download.suggested_filename == f"performance-scorecard-{month_first}-to-{month_last}-demo.csv",
        download.suggested_filename,
    )
    check("...headed with what each figure is", lines[0][:9] == ["Scored", "Name", "Department", "Records due", "On time", "Late", "Never done", "Not due yet", "Score"], lines[0])
    kinds = [l[0] for l in lines[1:]]
    check("...with the people, the departments, the modules and every document", {"Person", "Department", "Module", "Document"} <= set(kinds) and kinds.count("Document") == len(on_screen), (sorted(set(kinds)), kinds.count("Document"), len(on_screen)))
    exported = next((l for l in lines if l[0] == "Department" and l[2] == "QC"), None)
    qc_row = next((r for r in table_rows(page, "performance-departments") if r["key"] == "QC"), None)
    check(
        "...and the same figures as the screen",
        exported is not None and qc_row is not None and [int(x) for x in exported[3:7]] == [qc_row["due"], qc_row["onTime"], qc_row["late"], qc_row["overdue"]],
        (exported, qc_row),
    )

    page.evaluate(STUB_PRINT)
    page.click("[data-action='performance-print']")
    page.wait_for_timeout(300)
    page.emulate_media(media="print")
    try:
        seen = page.evaluate(
            f"""() => {{ {SHOWN} return {{
                  printed: window.__printed,
                  scoped: document.documentElement.classList.contains('print-scoped'),
                  scorecard: shown("[data-section='performance-scorecard']"),
                  rule: shown("[data-section='performance-rule']"),
                  heading: shown("[data-section='performance-scorecard'] .doc-header"),
                  departments: shown("[data-table='performance-departments']"),
                  rows: document.querySelectorAll("[data-table='performance-documents'] tbody tr[data-grade]").length,
                  sidebar: shown('.app-sidebar'),
                  topbar: shown('.app-topbar'),
                  period: shown("[data-field='performance-period']"),
                  exportButton: shown("[data-action='performance-export']"),
                  printButton: shown("[data-action='performance-print']"),
                }}; }}"""
        )
    finally:
        page.emulate_media(media="screen")
        page.evaluate(END_PRINT)
    check(
        "Print prints the scorecard - its heading, the rule, every table and every document line",
        seen["printed"] == 1 and seen["scoped"] and seen["scorecard"] and seen["rule"] and seen["heading"] and seen["departments"] and seen["rows"] == len(on_screen),
        seen,
    )
    check("...alone: no sidebar, no top bar, no period picker and no buttons on the paper", not any(seen[k] for k in ("sidebar", "topbar", "period", "exportButton", "printButton")), seen)

    # ==================================================================
    # 8. An account kept to Quality Control: scored, and shown QC only
    # ==================================================================
    page.wait_for_timeout(2500)  # what was generated goes to the database before the session ends
    page.locator("button[title='Log Out']").first.click()
    page.wait_for_selector("#login-email", timeout=30000)
    page.fill("#login-email", QC_EMAIL)
    page.fill("#login-password", PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(2500)
    if page.locator(".app-sidebar").count() == 0:
        sign_up(page, QC_PERSON, QC_EMAIL, "QC")
    page.wait_for_timeout(2500)
    dismiss(page)
    demo_mode(page)
    open_page(page, "#/performance", settle=3000)
    if EARLY:
        select_period(page, FOCUS)
    scope = page.locator("[data-section='performance-scope']")
    check("A QC account is told it is seeing Quality Control only", scope.count() == 1 and "Quality Control" in scope.evaluate("el => el.textContent"))
    qc_departments = table_rows(page, "performance-departments")
    check("...its department table holds Quality Control and nothing else", [r["key"] for r in qc_departments] == ["QC"], qc_departments)
    page.wait_for_timeout(800)
    qc_documents = table_rows(page, "performance-documents")
    check("...and its documents are QC's own", len(qc_documents) >= 20 and all(r["key"].startswith("qc-") for r in qc_documents), [r["key"] for r in qc_documents if not r["key"].startswith("qc-")])
    check("...with records to score, handed out by the server for that department", bool(qc_departments) and (THIN or qc_departments[0]["due"] > 0) and not adds_up(qc_departments), qc_departments)
    me = page.locator(f"[data-person='{QC_PERSON}']")
    check("The QC account has a card of its own, with a score", me.count() == 1 and me.get_attribute("data-scored") == "yes" and me.locator("[data-field='person-score']").count() == 1)
    if me.count() == 1 and qc_departments:
        figures = card_figures(me)
        dept = qc_departments[0]
        # The demo year's records were submitted by the plant's operators, who are
        # not accounts, so they count for every account of the department.
        check(
            "...answering for every QC record due: the card's counts are the department's",
            (figures["onTime"], figures["late"], figures["overdue"]) == (dept["onTime"], dept["late"], dept["overdue"]) and figures["score"] == dept["score"],
            (figures, dept),
        )
        check(
            "...with the decision as a plain sentence built from those numbers",
            (f"{dept['onTime']} of {dept['due']} on time" in figures["decision"] if dept["due"] > 0 else "due" in figures["decision"])
            and figures["grade"] == grade_for(None if dept["score"] == "—" else int(dept["score"])),
            figures["decision"],
        )
        check("...and no warning of a part score: every department it answers for is on its own screen", figures["partial"] == "", figures["partial"])
    qc_listing = directory(page)
    qc_people = (json.loads(qc_listing["text"]) if qc_listing["status"] == 200 else {}).get("people") or []
    check(
        "The server hands a QC account only the accounts that share Quality Control - itself among them, the unrestricted one not",
        qc_listing["status"] == 200 and any(x["name"] == QC_PERSON for x in qc_people) and all("QC" in x["departments"] for x in qc_people) and not any(x["name"] == VIEWER for x in qc_people),
        qc_people,
    )
    check("...still without an address in it", "@" not in qc_listing["text"], qc_listing["text"][:300])
    check("...so the unrestricted account has no card on a QC account's scorecard", page.locator(f"[data-person='{VIEWER}']").count() == 0)

    # ==================================================================
    # 9. Two accounts in one department: a record counts for whoever submitted it
    # ==================================================================
    # The e2e server has no two accounts whose names are on the demo records, so
    # the page is handed a directory that has: "ROSHNI" (the operator who submits
    # most of the demo year, typed differently) and somebody who answers for QC
    # and HR both. Only the list of accounts is made up; the records and the
    # scoring are the real ones.
    SUBMITTER = "ROSHNI"
    BOTH = "Desk Twofold"
    made_up = {
        "people": [
            {"id": "made-up-1", "name": SUBMITTER, "role": "staff", "departments": ["QC"]},
            {"id": "made-up-2", "name": BOTH, "role": "staff", "departments": ["QC", "HR"]},
        ]
    }
    page.route("**/api/users/directory", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps(made_up)))
    page.reload()
    page.wait_for_timeout(3000)
    dismiss(page)
    close_assistant(page)
    if EARLY:
        select_period(page, FOCUS)
    shared_dept = next((r for r in table_rows(page, "performance-departments") if r["key"] == "QC"), None)
    submitter_card = page.locator(f"[data-person='{SUBMITTER}']")
    both_card = page.locator(f"[data-person='{BOTH}']")
    check("Both accounts of the department have a card", submitter_card.count() == 1 and both_card.count() == 1 and shared_dept is not None)
    if submitter_card.count() == 1 and both_card.count() == 1 and shared_dept is not None:
        hers = card_figures(submitter_card)
        theirs = card_figures(both_card)
        qc_master = stored(page, "master")
        by_her = sum(
            1
            for r in stored(page, "records") or []
            if r.get("isDemo")
            and r["documentId"].startswith("qc-")
            and focus_first <= r["dueDate"] <= month_last
            and not closed_day(r["dueDate"], qc_master)
            and (r.get("submittedBy") or "").strip().lower() == SUBMITTER.lower()
        )
        check("The operator's records are on file to be counted", THIN or by_her > 0, by_her)
        check(
            "A record nobody submitted counts against every account of the department",
            hers["overdue"] == theirs["overdue"] == shared_dept["overdue"],
            (hers, theirs, shared_dept),
        )
        check(
            "A submitted record counts for the person who submitted it, however the name was typed: hers are hers alone",
            hers["onTime"] + hers["late"] == shared_dept["onTime"] + shared_dept["late"] and theirs["onTime"] + theirs["late"] == shared_dept["onTime"] + shared_dept["late"] - by_her,
            (hers, theirs, shared_dept, by_her),
        )
        check(
            "Each card's score is the formula for its own counts",
            all((None if c["score"] == "—" else int(c["score"])) == expected_score(c["onTime"], c["late"], c["overdue"]) for c in (hers, theirs)),
            (hers, theirs),
        )
        check(
            "Somebody who also answers for a department this account cannot see is marked as scored on part of their work",
            "Human Resources" in theirs["partial"] and hers["partial"] == "",
            (theirs["partial"], hers["partial"]),
        )
    page.unroute("**/api/users/directory")

    # ==================================================================
    # 10. The accounts cannot be read: everything else still stands
    # ==================================================================
    page.route("**/api/users/directory", lambda route: route.abort())
    page.reload()
    page.wait_for_timeout(3000)
    dismiss(page)
    close_assistant(page)
    if EARLY:
        select_period(page, FOCUS)
    unavailable = page.locator("[data-section='performance-people-unavailable']")
    check("When the accounts cannot be read, the people section says why", unavailable.count() == 1 and "could not be read" in unavailable.evaluate("el => el.textContent") and page.locator("[data-person]").count() == 0)
    offline_departments = table_rows(page, "performance-departments")
    check("...and the department, module and document tables still show", [r["key"] for r in offline_departments] == ["QC"] and (THIN or offline_departments[0]["due"] > 0) and len(table_rows(page, "performance-modules")) >= 1, offline_departments)
    page.unroute("**/api/users/directory")
    page.click("[data-action='performance-retry-directory']")
    page.wait_for_timeout(1500)
    check("Try again reads them once the server answers", page.locator(f"[data-person='{QC_PERSON}']").count() == 1 and unavailable.count() == 0)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe scorecard holds: the rule on its face, every line adding up, people scored on their own department, no address ever sent.")
