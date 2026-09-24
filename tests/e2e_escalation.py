"""Escalation to the super admin, and the weekly digest (REQUIREMENTS s75),
asked for on 24-Sep-2026 among the changes that make the system "super
intelligent": "escalate to superadmin on repeated lateness, daily/weekly digest".

  * the rule is worked out ON THE SERVER, from the records in PostgreSQL, with
    the Performance Scorecard's own lateness rule (engine/latenessCore.ts):
    3 or more late submissions in 30 days escalate a person by name; 2 or more
    records never done escalate a department several people share, named with
    its people;
  * it is raised once per person or department per week, and every new one is a
    line in the activity log;
  * the super admin sees it in the bell, counted in its badge, and acknowledges
    it; in the day's notification; and as a badge on the Performance page, where
    last week's digest is shown too;
  * nobody else can read it or run the jobs.

The scheduled runs are off in the test servers (JOBS=0: the suites run on the
real clock), so the jobs are run by hand with POST /api/jobs/run, as the super
admin can. Network-independent, against the product server on :8843 with the
plant's seeded accounts.
"""
import datetime
import json
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8843"
# What scripts/run-e2e.ts gives the product server as SEED_ACCOUNT_PASSWORD.
SEED_PASSWORD = "SeedQA@2026"
ADMIN = "admin@gpp.local"
KAPILA = "kapila.barad@gpp.local"
HR_DEPARTMENT = "Human Resources (Vinay Bhojak, Sandeep Parekh)"
FAILURES = []


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


def sign_out(page):
    btn = page.locator(".app-topbar button[title='Log Out']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(500)
        ok = page.locator("[data-action='logout-review-confirm']")
        if ok.count():
            ok.first.click()
        page.wait_for_selector("#login-email", timeout=30000)


def api_session(browser, email):
    """A signed-in session used through the API alone."""
    ctx = browser.new_context()
    r = ctx.request.post(f"{BASE}/api/auth/login", data={"email": email, "password": SEED_PASSWORD})
    return ctx, r.status


def working_days(today, holidays, first, last, n):
    """n past working days between today-first and today-last (Thursday is the weekly off)."""
    out = []
    for back in range(first, last - 1, -1):
        d = today - datetime.timedelta(days=back)
        if d.weekday() == 3 or d.isoformat() in holidays:
            continue
        out.append(d)
        if len(out) == n:
            break
    return out


def activity_lines(ctx, action, today):
    q = action.replace(" ", "%20")
    lines = ctx.request.get(f"{BASE}/api/activity?q={q}&from={today}&to={today}&limit=500").json().get("lines") or []
    return [l for l in lines if l.get("action") == action]


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    today = datetime.date.today()
    last_week_day = today - datetime.timedelta(days=7)
    last_week = f"{last_week_day.isocalendar()[0]}-W{last_week_day.isocalendar()[1]:02d}"

    # ==================================================================
    # 1. The plant's store, as a person's first sign-in makes it
    # ==================================================================
    print("\n==== The records ====")
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    page.on("pageerror", lambda e: errors.append(str(e)))
    sign_in(page, KAPILA)
    sign_out(page)

    admin, status = api_session(browser, ADMIN)
    check("The super admin signs in (through the API)", status == 200, status)
    items = {i["key"]: i for i in admin.request.get(f"{BASE}/api/storage").json()["items"]}
    check("The store holds the records, the formats and the go-live date", all(k in items for k in ("records", "master", "live-start")), sorted(items))
    master = json.loads(items["master"]["value"])
    holidays = {h.get("date") if isinstance(h, dict) else str(h) for h in master.get("holidays") or []}

    # Records older than the go-live date never count, so it is moved back.
    r = admin.request.put(
        f"{BASE}/api/storage/live-start",
        data=json.dumps({"date": (today - datetime.timedelta(days=40)).isoformat()}),
        headers={"Content-Type": "text/plain", "X-Base-Version": str(items["live-start"]["version"])},
    )
    check("(the go-live date moved back 40 days)", r.status in (200, 204), r.status)

    days = working_days(today, holidays, 25, 8, 5)
    check("(five past working days to put records on)", len(days) == 5, days)
    records = json.loads(items["records"]["value"])
    for i, d in enumerate(days[:3]):
        iso = d.isoformat()
        submitted = (d + datetime.timedelta(days=2)).isoformat()
        records.append({
            "id": f"esc-late-{i}", "documentId": "qc-viscosity", "periodKey": f"qc-viscosity:{iso}", "dueDate": iso,
            "status": "Verified", "isDemo": False, "data": {"header": {}, "rows": []},
            "createdAt": f"{iso}T03:00:00.000Z", "updatedAt": f"{submitted}T06:00:00.000Z",
            "submittedAt": f"{submitted}T06:00:00.000Z", "submittedBy": "Kapila Barad",
        })
    for i, d in enumerate(days[3:]):
        iso = d.isoformat()
        records.append({
            "id": f"esc-hr-{i}", "documentId": "daily-pest-monitoring", "periodKey": f"daily-pest-monitoring:{iso}", "dueDate": iso,
            "status": "Due", "isDemo": False,
            "data": {"isHoliday": False, "checkpoints": {}, "timeOfChecking": "", "checker": "", "summaryActions": []},
            "createdAt": f"{iso}T03:00:00.000Z", "updatedAt": f"{iso}T03:00:00.000Z",
        })
    r = admin.request.put(
        f"{BASE}/api/storage/records",
        data=json.dumps(records),
        headers={"Content-Type": "text/plain", "X-Base-Version": str(items["records"]["version"])},
    )
    check("(three late QC sheets by Kapila Barad and two HR rounds never done, on file)", r.status in (200, 204), r.status)

    # ==================================================================
    # 2. The escalation, worked out on the server
    # ==================================================================
    print("\n==== The escalation ====")
    r = admin.request.post(f"{BASE}/api/jobs/run", data={"job": "escalation"})
    body = r.json() if r.status == 200 else {}
    raised = (body.get("result") or {}).get("raised") or []
    names = sorted(e.get("subjectName") for e in raised)
    check("Run now, the escalation raises exactly two", r.status == 200 and len(raised) == 2, (r.status, names))
    kapila = next((e for e in raised if e.get("subjectName") == "Kapila Barad"), {})
    check("Kapila Barad, by name: 3 late, in QC", kapila.get("kind") == "person" and kapila.get("late") == 3 and kapila.get("department") == "QC", kapila)
    hr = next((e for e in raised if e.get("subjectName") == HR_DEPARTMENT), {})
    check("Human Resources as a department, named with its two people: 2 never done", hr.get("kind") == "department" and hr.get("neverDone") == 2, names)
    lines = activity_lines(admin, "Escalated to the super admin", today.isoformat())
    check("Each is a line in the activity log, under its department", len(lines) == 2 and sorted(l.get("department") for l in lines) == ["HR", "QC"], lines)

    r = admin.request.post(f"{BASE}/api/jobs/run", data={"job": "escalation"})
    again = (r.json().get("result") or {}) if r.status == 200 else {}
    check("Run again the same week: nothing new, the two brought up to date", again.get("raised") == [] and again.get("updated") == 2, again)
    check("...and no second line in the log", len(activity_lines(admin, "Escalated to the super admin", today.isoformat())) == 2)
    check("A job that does not exist is refused", admin.request.post(f"{BASE}/api/jobs/run", data={"job": "nightly"}).status == 400)
    check("...and so is a day that is not a date", admin.request.post(f"{BASE}/api/jobs/run", data={"job": "escalation", "today": "2026-13-45"}).status == 400)

    staff, status = api_session(browser, KAPILA)
    check("Nobody but the super admin reads the escalations", staff.request.get(f"{BASE}/api/escalations").status == 403)
    check("...or runs a job", staff.request.post(f"{BASE}/api/jobs/run", data={"job": "escalation"}).status == 403)
    staff.close()

    # ---- the weekly digest ----
    r = admin.request.post(f"{BASE}/api/jobs/run", data={"job": "weekly-digest"})
    check("The weekly digest is worked out when asked", r.status == 200, r.status)
    digest = (admin.request.get(f"{BASE}/api/digests/latest").json() or {}).get("digest") or {}
    check(f"...for last week, {last_week}", digest.get("period") == last_week, digest.get("period"))
    admin.close()

    # ==================================================================
    # 3. What the super admin sees
    # ==================================================================
    print("\n==== What the super admin sees ====")
    sign_in(page, ADMIN)
    try:
        page.wait_for_selector("[data-section='nudge-escalations']", timeout=20000)
    except Exception:
        pass
    nudge = page.locator("[data-section='nudge-escalations']")
    text = nudge.inner_text() if nudge.count() else ""
    check("The day's notification says who was escalated", "1 person was late repeatedly this week" in text and "1 escalated for records never done" in text, text)
    check("...with a way to the scorecard", page.locator("[data-action='nudge-escalations-review']").count() == 1)

    bell = page.locator("button[aria-label='Reminders']")
    check("The bell counts both in its badge", bell.get_attribute("data-escalations") == "2", bell.get_attribute("data-escalations"))
    bell.click()
    page.wait_for_timeout(800)
    group = page.locator("[data-section='escalations']")
    check("...and lists them as 'Escalated to you'", group.count() == 1 and group.get_attribute("data-count") == "2" and group.locator("[data-escalation]").count() == 2)
    first_priority = page.locator("[data-priority]").first
    if group.count() and first_priority.count():
        check("...above the reminders", group.bounding_box()["y"] < first_priority.bounding_box()["y"])
    group.locator("[data-escalation]:has-text('Kapila Barad') [data-action='ack-escalation']").first.click()
    page.wait_for_timeout(1200)
    check("Acknowledged, it leaves the list and the badge", page.locator("[data-section='escalations']").get_attribute("data-count") == "1" and bell.get_attribute("data-escalations") == "1")
    admin, _ = api_session(browser, ADMIN)
    open_now = (admin.request.get(f"{BASE}/api/escalations?open=1").json() or {}).get("escalations") or []
    check("...and the server holds it acknowledged", [e.get("subjectName") for e in open_now] == [HR_DEPARTMENT], open_now)
    check("...with a line in the log", len(activity_lines(admin, "Escalation acknowledged", today.isoformat())) == 1)
    admin.close()

    page.keyboard.press("Escape")
    page.goto(f"{BASE}/index.html#/performance")
    page.wait_for_timeout(2500)
    dismiss(page)
    close_assistant(page)
    card = page.locator(".score-card[data-person='Kapila Barad'][data-escalated='true'] .badge[data-escalated='true']")
    check("On the Performance page, Kapila Barad carries the Escalated badge (seen)", card.count() >= 1 and "seen" in card.first.inner_text().lower(), card.first.inner_text() if card.count() else "")
    check("...and so does the Human Resources row", page.locator("table[data-table='performance-departments'] tr[data-row='HR'][data-escalated='true']").count() == 1)
    check("Last week's digest is shown there too", page.locator(f"[data-section='weekly-digest'][data-period='{last_week}']").count() == 1)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nLateness is escalated to the super admin by the server itself, once a week per person or department, and seen, acknowledged and summed up in the app.")
