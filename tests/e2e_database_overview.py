"""The super admin's Database overview (REQUIREMENTS s83).

DCRS and the Audit Assistant share one PostgreSQL database, and its schema
"overview" holds plain-English views over both. The owner asked for one viewer
"that non-technical staff can open without writing SQL", and: "I can open the
viewer and answer who downloaded what last week without writing SQL". It is a
page in DCRS's admin area, read through the role overview_viewer, which can read
the views and nothing else. This suite checks that:

  * the super admin has "Database overview" in the sidebar, next to Users &
    Access, and the page opens set up (scripts/run-e2e.ts applies
    database/sql/01 and 02 to the run's database and gives both servers the
    viewer's address);
  * the ready-made questions come first, as big buttons: something downloaded
    in DCRS a moment ago is in "Who downloaded or printed what - this week",
    under this week's Monday to Sunday by the factory's calendar, and not in last
    week's; the answer downloads as CSV;
  * "Which CAPA findings are open?" lists exactly the findings the DCRS API
    calls open;
  * "Browse everything": the findings view with its comment, headings in plain
    words with each column's comment as the tooltip, a search, a date filter,
    a CSV of exactly the rows shown, and "Show more" on a view of more than a
    hundred rows;
  * opening the page and each CSV are lines in the activity log;
  * a member of staff has no sidebar entry, is told the page is the super
    admin's, and the server refuses them every route (403); nobody signed in
    gets 401;
  * no JavaScript errors.

Against the product server on :8843 (DCRS_BASE overrides it) with the plant's
seeded accounts (DCRS_ADMIN_EMAIL, DCRS_QC_EMAIL and DCRS_SEED_PASSWORD override
them, for a server of one's own).
"""
import csv
import datetime
import io
import os
import sys
import tempfile
import urllib.parse

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD", "SeedQA@2026")
ADMIN = os.environ.get("DCRS_ADMIN_EMAIL", "admin@gpp.local")
STAFF = os.environ.get("DCRS_QC_EMAIL", "kapila.barad@gpp.local")  # kept to Quality Control
FACTORY = datetime.timezone(datetime.timedelta(hours=5, minutes=30))  # Asia/Kolkata, which has no daylight saving
TMP = tempfile.mkdtemp(prefix="database-overview-")
FAILURES = []
ROUTES = [
    "/api/overview/status",
    "/api/overview/views",
    "/api/overview/views/findings",
    "/api/overview/views/findings.csv",
    "/api/overview/questions",
    "/api/overview/questions/downloads?week=this",
    "/api/overview/questions/open-findings.csv",
]


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


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


def watch(page, errors):
    page.route("**/translate_a/**", lambda route: route.abort())
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" and "translate" not in m.text.lower() else None)


def sign_in(page, email):
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(400)
    page.fill("#login-email", email)
    page.fill("#login-password", SEED_PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)


def goto(page, route):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(1300)
    dismiss(page)
    close_assistant(page)


def api(ctx, path):
    """A GET through the context's own request API (it shares the page's cookies, and a refusal is not a console error)."""
    r = ctx.request.get(f"{BASE}{path}")
    try:
        body = r.json()
    except Exception:
        body = None
    return r.status, body, r


def rows_of(page, table):
    return page.locator(f"[data-table='{table}'] tbody tr").evaluate_all("trs => trs.map((tr) => [...tr.cells].map((td) => td.textContent))")


def headings_of(page, table):
    return page.locator(f"[data-table='{table}'] thead th").evaluate_all("ths => ths.map((th) => ({ column: th.dataset.column, text: th.textContent, title: th.getAttribute('title') }))")


def loads(page, section):
    return int(page.locator(f"[data-section='{section}']").get_attribute("data-loads") or "0")


def wait_for_next(page, section, before, timeout=30000):
    """Waits until the section has a page more than `before` and is not reading."""
    page.wait_for_function(
        """([section, before]) => {
             const el = document.querySelector(`[data-section='${section}']`);
             return !!el && Number(el.dataset.loads) > before && el.dataset.state === 'ready';
           }""",
        arg=[section, before],
        timeout=timeout,
    )


def read_csv(path):
    """The file's bytes, and its cells as Excel shows them: the ' DCRS puts before a formula-like value taken off again (utils/csv.ts parseCSV)."""
    raw = open(path, "rb").read()
    text = raw.decode("utf-8")
    table = list(csv.reader(io.StringIO(text.lstrip(chr(0xFEFF)))))
    return raw, [[c[1:] if len(c) > 1 and c[0] == "'" and c[1] in "=+-@" else c for c in row] for row in table]


def activity_lines(ctx, action, today):
    q = urllib.parse.quote(action)
    _, body, _ = api(ctx, f"/api/activity?q={q}&from={today}&to={today}&limit=200")
    return [l for l in (body or {}).get("lines", []) if l.get("action") == action]


with sync_playwright() as p:
    browser = p.chromium.launch()
    today_date = datetime.datetime.now(FACTORY).date()
    today = today_date.isoformat()
    monday = today_date - datetime.timedelta(days=today_date.weekday())
    this_week = (monday.isoformat(), (monday + datetime.timedelta(days=6)).isoformat())
    last_week = ((monday - datetime.timedelta(days=7)).isoformat(), (monday - datetime.timedelta(days=1)).isoformat())

    # ==================================================================
    # 1. The super admin signs in; the plant's records are stored
    # ==================================================================
    print("\n==== The super admin ====")
    admin_ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
    page = admin_ctx.new_page()
    errors = []
    watch(page, errors)
    sign_in(page, ADMIN)
    errors.clear()  # the sign-in page's /api/auth/me answers 401 before the account signs in; what counts starts here
    _, me, _ = api(admin_ctx, "/api/auth/me")
    admin_name = ((me or {}).get("user") or {}).get("name") or ""
    check("The super admin signs in", ((me or {}).get("user") or {}).get("role") == "admin", me)

    status, overview, _ = api(admin_ctx, "/api/overview/status")
    check("The overview is set up on this server, read as overview_viewer, read-only", status == 200 and (overview or {}).get("role") == "overview_viewer" and (overview or {}).get("readOnly") is True, (status, overview))
    views = set((overview or {}).get("views") or [])
    check("...with DCRS's seven views", {"dcrs_accounts", "records", "findings", "customer_complaints", "pest_control_reports_by_day", "dcrs_activity", "dcrs_downloads"} <= views, sorted(views))
    with_assistant = "people" in views

    # The browser's first sign-in stores the plant's records; the views read them from there.
    finding_rows = []
    for _ in range(60):
        status, body, _ = api(admin_ctx, "/api/overview/views/findings?limit=500")
        finding_rows = (body or {}).get("rows") or []
        if status == 200 and finding_rows:
            break
        page.wait_for_timeout(1000)
    check("The CAPA findings stored by DCRS are in the findings view", len(finding_rows) > 0, (status, body))

    # ==================================================================
    # 2. Something downloaded in DCRS
    # ==================================================================
    print("\n==== A download in DCRS ====")
    goto(page, "#/hr/competence")
    button = page.locator("[data-action='download-document']").first
    downloaded_name = ""
    if button.count():
        with page.expect_download() as dl:
            button.click()
        d = dl.value
        downloaded_name = d.suggested_filename
        d.save_as(os.path.join(TMP, downloaded_name))
    check("F/HR/01 Personal Competence Records downloads as Excel", downloaded_name.startswith("F-HR-01") and downloaded_name.endswith(".xlsx"), downloaded_name)
    line = None
    for _ in range(30):
        page.wait_for_timeout(1000)
        line = next((l for l in activity_lines(admin_ctx, "Document downloaded as Excel", today) if "Personal Competence Records" in (l.get("target") or "") and l.get("userEmail") == ADMIN), None)
        if line:
            break
    check("...and DCRS's activity log has the line", line is not None)

    # ==================================================================
    # 3. The page, from the sidebar
    # ==================================================================
    print("\n==== The page ====")
    goto(page, "#/dashboard")
    link = page.locator(".app-sidebar a[href='#/database-overview']")
    check("Database overview is in the sidebar, next to Users & Access", link.count() == 1 and page.locator(".app-sidebar a[href='#/users']").count() == 1)
    # The super admin's own entries run Users & Access, User access (REQUIREMENTS s84), Database overview.
    check(
        "...right after it and User access",
        page.locator(".app-sidebar a").evaluate_all(
            "els => { const h = els.map((e) => e.getAttribute('href')); const u = h.indexOf('#/users');"
            " return u >= 0 && h[u + 1] === '#/access' && h[u + 2] === '#/database-overview'; }"
        ),
    )
    link.first.evaluate("el => el.click()")
    page.wait_for_selector("[data-page='database-overview']", timeout=30000)
    page.wait_for_selector("[data-page='database-overview'][data-state='ready'], [data-page='database-overview'][data-state='not-set-up'], [data-page='database-overview'][data-state='failed']", timeout=30000)
    state = page.locator("[data-page='database-overview']").get_attribute("data-state")
    check("The page opens, set up", state == "ready", page.locator("[data-page='database-overview']").inner_text()[:600])
    close_assistant(page)
    check("...and says which database it reads, and that it is read-only", "overview_viewer" in (page.locator("[data-field='connection']").text_content() or "") and "read-only" in (page.locator("[data-field='connection']").text_content() or ""))

    keys = page.locator("[data-section='questions'] [data-question]").evaluate_all("els => els.map((e) => e.dataset.question)")
    check(
        "The ready-made questions come first, as big buttons",
        keys[:4] == ["downloads", "open-findings", "missing-pest-control-reports", "changes-through-assistant"]
        and page.locator("[data-section='questions']").evaluate("el => el.compareDocumentPosition(document.querySelector(\"[data-section='browse']\")) & Node.DOCUMENT_POSITION_FOLLOWING") != 0,
        keys,
    )
    check(
        "...the Audit Assistant's own questions only when its views are there",
        ("assistant-actions" in keys and "assistant-devices" in keys) == with_assistant,
        (keys, with_assistant),
    )
    check("...each a plain question", (page.locator("[data-question='downloads']").text_content() or "").startswith("Who downloaded or printed what last week?"))

    # ==================================================================
    # 4. Who downloaded or printed what: last week, then this week
    # ==================================================================
    print("\n==== Who downloaded or printed what ====")
    page.click("[data-question='downloads']")
    page.wait_for_selector("[data-section='answer'][data-question='downloads'][data-state='ready']", timeout=30000)
    rng = page.locator("[data-section='answer'] [data-field='range']")
    check(
        "Asked of last week by default: Monday to Sunday of the week before this one, the dates in words",
        (rng.get_attribute("data-from"), rng.get_attribute("data-to")) == last_week and (rng.text_content() or "").startswith("Monday") and " to Sunday " in (rng.text_content() or ""),
        (rng.get_attribute("data-from"), rng.get_attribute("data-to"), rng.text_content(), last_week),
    )
    check("...titled for last week", "last week" in (page.locator("[data-field='answer-title']").text_content() or ""))
    last_rows = rows_of(page, "overview-answer")
    check("Last week's list does not hold today's download", not any(r and (r[0] or "").startswith(today) for r in last_rows), last_rows[:3])

    before = loads(page, "answer")
    page.click("[data-section='answer'] [data-week='this']")
    wait_for_next(page, "answer", before)
    check(
        "This week: Monday to Sunday of this week",
        (rng.get_attribute("data-from"), rng.get_attribute("data-to")) == this_week and "this week" in (page.locator("[data-field='answer-title']").text_content() or ""),
        (rng.get_attribute("data-from"), rng.get_attribute("data-to"), this_week),
    )
    this_rows = rows_of(page, "overview-answer")
    mine = [r for r in this_rows if (r[0] or "").startswith(today) and admin_name in r and "Downloaded as Excel" in r and any("Personal Competence Records" in (c or "") for c in r)]
    check("...lists the download made a moment ago: who, what happened, which document, when", len(mine) >= 1 and admin_name != "", (admin_name, this_rows[:3]))
    heads = headings_of(page, "overview-answer")
    check(
        "The headings are plain words, each with the view's comment on it as the tooltip",
        heads and heads[0]["text"] == "Happened (factory time)" and all(h["title"] for h in heads) and any(h["text"] == "What happened" for h in heads),
        heads,
    )

    with page.expect_download() as dl:
        page.click("[data-action='answer-csv']")
    d = dl.value
    path = os.path.join(TMP, d.suggested_filename)
    d.save_as(path)
    raw, table = read_csv(path)
    check("The answer downloads as a CSV file for Excel, named for the week", d.suggested_filename == f"downloads {this_week[0]} to {this_week[1]}.csv" and raw[:3] == b"\xef\xbb\xbf", d.suggested_filename)
    check("...its headings the page's, its rows the answer's", table and table[0] == [h["text"] for h in heads] and any("Personal Competence Records" in " ".join(r) for r in table[1:]), table[:2])

    # ==================================================================
    # 5. The open CAPA findings, as the DCRS API gives them
    # ==================================================================
    print("\n==== Which CAPA findings are open? ====")
    page.click("[data-question='open-findings']")
    page.wait_for_selector("[data-section='answer'][data-question='open-findings'][data-state='ready']", timeout=30000)
    open_rows = rows_of(page, "overview-answer")
    shown_ids = [r[0] for r in open_rows if r and (r[0] or "").startswith("CAPA-")]
    status, listing, _ = api(admin_ctx, "/api/v1/findings?status=open&limit=200")
    api_ids = sorted(f["id"] for f in (listing or {}).get("findings", []))
    check("The open findings are listed, each by its readable id", len(shown_ids) > 0 and all(c in ("Open", "Overdue") for c in (r[1] for r in open_rows)), open_rows[:3])
    check("...exactly the ones the DCRS API calls open", status == 200 and sorted(shown_ids) == api_ids, (sorted(shown_ids), api_ids))

    # ==================================================================
    # 6. Browse everything: the findings view
    # ==================================================================
    print("\n==== Browse everything ====")
    _, catalog, _ = api(admin_ctx, "/api/overview/views")
    described = {v["name"]: v for v in (catalog or {}).get("views", [])}
    before = loads(page, "browse")
    page.select_option("[data-field='view']", "findings")
    wait_for_next(page, "browse", before)
    comment = page.locator("[data-field='view-comment']").text_content() or ""
    check("Picking the findings view shows what it holds, in the view's own words", comment == (described.get("findings") or {}).get("comment") and len(comment) > 20, comment)
    heads = headings_of(page, "overview-browse")
    by_column = {c["name"]: c for c in (described.get("findings") or {}).get("columns", [])}
    check(
        "Every column is headed in plain words, its comment the tooltip",
        heads and heads[0]["column"] == "finding_id" and heads[0]["text"] == "Finding ID" and all(h["title"] == (by_column.get(h["column"]) or {}).get("comment") for h in heads),
        heads[:3],
    )
    all_rows = rows_of(page, "overview-browse")
    check("...and its rows are there, a hundred at most", 0 < len(all_rows) <= 100 and len(all_rows) == min(len(finding_rows), 100), (len(all_rows), len(finding_rows)))

    first_id = all_rows[0][0] if all_rows else ""
    before = loads(page, "browse")
    page.fill("[data-field='search']", first_id)
    page.click("[data-action='browse-show']")
    wait_for_next(page, "browse", before)
    found = rows_of(page, "overview-browse")
    check("A search keeps only the rows that hold it", 0 < len(found) <= len(all_rows) and all(first_id in " ".join(c or "" for c in r) for r in found), (first_id, len(found)))

    report_col = next((i for i, h in enumerate(heads) if h["column"] == "report_date"), None)
    day = all_rows[0][report_col] if all_rows and report_col is not None else ""
    before = loads(page, "browse")
    page.fill("[data-field='search']", "")
    page.fill("[data-field='from']", day)
    page.fill("[data-field='to']", day)
    page.click("[data-action='browse-show']")
    wait_for_next(page, "browse", before)
    dated = rows_of(page, "overview-browse")
    check("From and to dates keep the rows of those days", len(dated) > 0 and all(r[report_col] == day for r in dated), (day, [r[report_col] for r in dated][:5]))

    with page.expect_download() as dl:
        page.click("[data-action='browse-csv']")
    d = dl.value
    path = os.path.join(TMP, d.suggested_filename)
    d.save_as(path)
    raw, table = read_csv(path)
    check("The rows shown download as CSV, named for the view and its dates", d.suggested_filename == f"findings {day} to {day}.csv" and raw[:3] == b"\xef\xbb\xbf", d.suggested_filename)
    check("...exactly those rows under the same headings", table and table[0] == [h["text"] for h in heads] and [r for r in table[1:]] == [[c or "" for c in r] for r in dated], (table[:2], dated[:1]))

    # ==================================================================
    # 7. A hundred rows at a time
    # ==================================================================
    print("\n==== Show more ====")
    long_view = None
    # Views that stand still while this runs first: the activity log grows with every page opened.
    for name in ("records", "pest_control_reports_by_day", "dcrs_accounts", "dcrs_activity"):
        status, body, _ = api(admin_ctx, f"/api/overview/views/{name}?limit=100")
        if status == 200 and (body or {}).get("more"):
            long_view = name
            break
    if long_view is None:
        check("(no view holds more than a hundred rows here, so Show more is not offered)", page.locator("[data-action='browse-more']").count() == 0)
    else:
        page.fill("[data-field='from']", "")
        page.fill("[data-field='to']", "")
        before = loads(page, "browse")
        page.select_option("[data-field='view']", long_view)
        wait_for_next(page, "browse", before)
        first_page = rows_of(page, "overview-browse")
        check(f"{long_view}: the first hundred rows, and Show more", len(first_page) == 100 and page.locator("[data-action='browse-more']").count() == 1, len(first_page))
        before = loads(page, "browse")
        page.click("[data-action='browse-more']")
        wait_for_next(page, "browse", before)
        both = rows_of(page, "overview-browse")
        _, next_page, _ = api(admin_ctx, f"/api/overview/views/{long_view}?limit=100&offset=100")
        expected = [[c or "" for c in r] for r in (next_page or {}).get("rows", [])]
        check(
            "...Show more adds the next hundred under them, the first ones unchanged",
            len(both) == 100 + len(expected) and both[:100] == first_page and [[c or "" for c in r] for r in both[100:]] == expected,
            (len(both), len(expected)),
        )

    # ==================================================================
    # 8. The activity log
    # ==================================================================
    print("\n==== The activity log ====")
    page.wait_for_timeout(500)
    opened = [l for l in activity_lines(admin_ctx, "Database overview opened", today) if l.get("userEmail") == ADMIN]
    exported = [l for l in activity_lines(admin_ctx, "Database overview exported", today) if l.get("userEmail") == ADMIN]
    check("Opening the page is a line in the activity log", len(opened) >= 1, opened[:2])
    check("...and so is each CSV taken away: the view, how many rows, the dates", any(l.get("target") == "overview.findings" and f"Report date from {day} to {day}" in (l.get("detail") or "") for l in exported), exported[:3])
    check("...and the question's", any((l.get("target") or "").startswith("Who downloaded or printed what this week") for l in exported), exported[:3])

    check("No JavaScript errors on the super admin's pages", not errors, errors[:5])
    admin_ctx.close()

    # ==================================================================
    # 9. Nobody else
    # ==================================================================
    print("\n==== Nobody else ====")
    staff_ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
    staff = staff_ctx.new_page()
    staff_errors = []
    watch(staff, staff_errors)
    overview_calls = []
    staff.on("request", lambda r: overview_calls.append(r.url) if "/api/overview" in r.url else None)
    sign_in(staff, STAFF)
    staff_errors.clear()  # the sign-in page's 401, as above
    check("A member of staff has the Activity Log but no Database overview in the sidebar", staff.locator(".app-sidebar a[href='#/activity']").count() == 1 and staff.locator(".app-sidebar a[href='#/database-overview']").count() == 0)
    goto(staff, "#/database-overview")
    check("...and the address typed in says the page is the super admin's", staff.locator("[data-page='database-overview'][data-state='not-admin']").count() == 1, staff.locator(".app-content").inner_text()[:300])
    check("...without asking the server for any of it", not overview_calls, overview_calls[:3])
    refused = {path: api(staff_ctx, path)[:2] for path in ROUTES}
    check("The server refuses them every route: 403 not-admin", all(s == 403 and (b or {}).get("code") == "not-admin" for s, b in refused.values()), refused)
    check("No JavaScript errors on the staff page", not staff_errors, staff_errors[:5])
    staff_ctx.close()

    nobody = browser.new_context()
    unsigned = {path: api(nobody, path)[0] for path in ROUTES}
    check("Nobody signed in: 401 on every route", all(s == 401 for s in unsigned.values()), unsigned)
    nobody.close()

    browser.close()

print(f"\n{len(FAILURES)} failure(s)")
for f in FAILURES:
    print("  -", f)
sys.exit(1 if FAILURES else 0)
