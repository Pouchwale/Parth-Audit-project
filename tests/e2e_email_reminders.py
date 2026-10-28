"""The reminder emails, asked for by the owner on 25-Oct-2026:

  "i want a system that will email the users automatically for the updates on their given email id's for the free of
   cost so the system will update the user that you have to complete this records and those are the records remaining
   till now to filled or submit/verify according to there before the due date and system will remind the user again and
   again until he or she complete his tasks."

This suite checks, against the product server (the super admin and the owner's twelve people, seeded):

  * USERS & ACCESS: the super admin gives Dharmik Mistry a reminder email in the person's row: a sign-in at gpp.local is
    refused in words, on the page and by the server; a plain address is kept, with its language (Gujarati) and on;
  * THE SWITCH: the reminder emails are off until the super admin switches them on (Notifications, The server's jobs),
    and the page says the server is in capture mode (EMAIL_TRANSPORT=capture: nothing leaves the PC);
  * THE EMAIL: a record of F/PRD/10, the one document Dharmik Mistry answers for, due on a working day; the notify job,
    run by hand at 10:00 of that day, captures ONE email for Dharmik Mistry naming it (in Gujarati, the date as dd-mm-yy);
    run again in the same slot, nothing more for anybody; the record submitted, the 15:35 run sends nothing for it;
  * "Send me a test email" works in capture mode, once in 20 seconds, and the email log has it;
  * A MEMBER OF STAFF cannot read or set a reminder email, switch them, send a test or read the log (403); the directory
    carries no address; the run's line in the activity log is the super admin's alone and names no address;
  * the browser's old digest is retired: POST /api/reminders/send-digest answers 410;
  * no JavaScript errors.

Against the product server on :8843 (DCRS_BASE overrides it) with the plant's seeded accounts on the password the runner
gives them (DCRS_SEED_PASSWORD, which scripts/run-e2e.ts sets: no password is written here). The addresses are at
example.com, a domain reserved for examples: nobody's mailbox, and the server captures every email anyway. What the suite
set is put back at the end, whatever happened: the reminder emails switched off and both reminder emails removed, so no
later suite's notify run captures an email.
"""
import datetime
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD", "")
ADMIN = "admin@gpp.local"
DHARMIK = "dharmik.mistry@gpp.local"
KAPILA = "kapila.barad@gpp.local"
# Reserved for examples (RFC 2606): nobody's mailbox.
DHARMIK_MAIL = "dharmik.mistry.reminders@example.com"
ADMIN_MAIL = "dcrs.super.admin.reminders@example.com"
# F/PRD/10, the one document Dharmik Mistry answers for and may fill (the owner's table, REQUIREMENTS §96).
DOC = "prd-sharp-object-issue"
FAILURES = []
ERRORS = []
NO_INTRO = "try { sessionStorage.setItem('dcrs:intro-seen', '1'); } catch (e) {}"
PLANT_ZONE = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

if not SEED_PASSWORD:
    print("DCRS_SEED_PASSWORD is not set: run this suite with npm run test:e2e, which starts the product server on it.")
    sys.exit(1)


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


def sign_out(page):
    before = len(ERRORS)
    for _ in range(3):
        cross = page.locator(".modal-overlay .modal-box button[aria-label='Close']")
        if not cross.count():
            break
        try:
            cross.first.click(timeout=3000)
        except Exception:
            break
        page.wait_for_timeout(300)
    btn = page.locator(".app-topbar button[title='Log Out']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(500)
        ok = page.locator("[data-action='logout-review-confirm']")
        if ok.count():
            ok.first.click()
        page.wait_for_selector("#login-email", timeout=30000)
        page.wait_for_timeout(300)
    # A request still on its way when the session ended is answered 401: the end of the session, not an error of the app.
    ERRORS[before:] = [e for e in ERRORS[before:] if "401" not in e]


def sign_in(page, email):
    before = len(ERRORS)
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(600)
    if page.locator(".app-sidebar").count():
        sign_out(page)
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(300)
    page.fill("#login-email", email)
    page.fill("#login-password", SEED_PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=90000)
    page.wait_for_timeout(1200)
    dismiss(page)
    close_assistant(page)
    # The sign-in page's own /api/auth/me answers 401 before anybody is signed in: not an error of the app.
    ERRORS[before:] = [e for e in ERRORS[before:] if "401" not in e]


def go(page, route, wait=None, ms=1500):
    page.goto(f"{BASE}/index.html#{route}")
    if wait:
        page.wait_for_selector(wait, timeout=30000)
    page.wait_for_timeout(ms)
    close_assistant(page)


def api(ctx, method, path, body=None, headers=None):
    """A request through a context's own API: it shares the context's cookies, and a refusal is not a console error."""
    req = ctx.request
    url = f"{BASE}{path}"
    h = {"Content-Type": "application/json", **(headers or {})}
    if method == "GET":
        res = req.get(url)
    elif method == "PUT":
        res = req.put(url, data=body if isinstance(body, str) else json.dumps(body), headers=h)
    elif method == "DELETE":
        res = req.delete(url)
    else:
        res = req.post(url, data=json.dumps(body if body is not None else {}), headers=h)
    text = res.text()
    try:
        payload = res.json()
    except Exception:
        payload = None
    return {"status": res.status, "body": payload, "text": text}


def api_session(browser, email):
    """A signed-in context used through the API alone."""
    ctx = browser.new_context()
    r = ctx.request.post(f"{BASE}/api/auth/login", data={"email": email, "password": SEED_PASSWORD})
    return ctx, r.status


def store_items(ctx):
    return {i["key"]: i for i in (api(ctx, "GET", "/api/storage").get("body") or {}).get("items") or []}


def put_records(ctx, records, version):
    return api(ctx, "PUT", "/api/storage/records", json.dumps(records), {"Content-Type": "text/plain", "X-Base-Version": str(version)})


def plant_today():
    return datetime.datetime.now(PLANT_ZONE).date()


def working_day(master, start):
    """The first working day of the plant's calendar from `start`: the weekly off and the festival holidays closed,
    the adjustment days worked (engine/latenessCore.ts plantClosedDays)."""
    holidays = {h.get("date") if isinstance(h, dict) else str(h) for h in master.get("holidays") or []}
    adjusted = {a.get("date") if isinstance(a, dict) else str(a) for a in master.get("adjustmentDays") or []}
    off = master.get("weeklyOffDay", 4)
    d = start
    for _ in range(30):
        iso = d.isoformat()
        js_weekday = (d.weekday() + 1) % 7  # 0 = Sunday, as the master data counts
        if iso in adjusted or (iso not in holidays and js_weekday != off):
            return d
        d += datetime.timedelta(days=1)
    return start


def shown(iso):
    """A date as the app writes it: 24-10-26."""
    return f"{iso[8:10]}-{iso[5:7]}-{iso[2:4]}"


def email_log(ctx, limit=100):
    return (api(ctx, "GET", f"/api/email/log?limit={limit}").get("body") or {}).get("rows") or []


def activity_lines(ctx, action, day):
    q = action.replace(" ", "%20")
    lines = (api(ctx, "GET", f"/api/activity?q={q}&from={day}&to={day}&limit=500").get("body") or {}).get("lines") or []
    return [l for l in lines if l.get("action") == action]


with sync_playwright() as p:
    browser = p.chromium.launch()

    def new_page(ctx):
        pg = ctx.new_page()
        pg.route("**/translate_a/**", lambda route: route.abort())
        pg.on("pageerror", lambda e: ERRORS.append(f"pageerror: {e}"))
        pg.on("console", lambda m: ERRORS.append(f"console: {m.text}") if m.type == "error" and "translate" not in m.text.lower() else None)
        return pg

    admin_ctx = browser.new_context(viewport={"width": 1500, "height": 950})
    admin_ctx.add_init_script(NO_INTRO)
    admin = new_page(admin_ctx)
    contacts_set = []
    try:
        # ==============================================================
        # 1. The plant's store, a record of Dharmik Mistry's due on a working day
        # ==============================================================
        print("\n==== The record ====")
        sign_in(admin, ADMIN)
        sign_out(admin)
        api_ctx, status = api_session(browser, ADMIN)
        check("The super admin signs in (through the API)", status == 200, status)
        items = store_items(api_ctx)
        check("The store holds the records and the master data", all(k in items for k in ("records", "master")), sorted(items))
        master = json.loads(items["master"]["value"])
        day = working_day(master, plant_today()).isoformat()
        print(f"     (the working day used: {day})")
        records = json.loads(items["records"]["value"])
        mine = next((r for r in records if r.get("documentId") == DOC and r.get("dueDate") == day and not r.get("isDemo")), None)
        if mine is None:
            stamp = f"{plant_today().isoformat()}T03:00:00.000Z"
            mine = {
                "id": f"email-reminder-{day}", "documentId": DOC, "periodKey": f"{DOC}:{day}", "dueDate": day,
                "status": "Due", "isDemo": False, "data": {"header": {}, "rows": []}, "createdAt": stamp, "updatedAt": stamp,
            }
            records.append(mine)
            r = put_records(api_ctx, records, items["records"]["version"])
            check("(F/PRD/10 due on the working day, on file)", r["status"] in (200, 204), r["text"][:300])
        else:
            check("(F/PRD/10 of the working day is on file already)", mine.get("status") in ("Scheduled", "Due", "In Progress"), mine.get("status"))
        record_id = mine["id"]
        users = (api(api_ctx, "GET", "/api/users").get("body") or {}).get("users") or []
        ids = {u.get("email"): u.get("id") for u in users}
        check("Dharmik Mistry, Kapila Barad and the super admin have accounts", all(ids.get(e) for e in (ADMIN, DHARMIK, KAPILA)), sorted(ids))

        # ==============================================================
        # 2. Users & Access: Dharmik Mistry's reminder email
        # ==============================================================
        print("\n==== Users & Access ====")
        sign_in(admin, ADMIN)
        go(admin, "/users", "[data-page='users'] [data-table='users']", 1500)
        row = admin.locator(f"[data-table='users'] tr[data-user='{DHARMIK}']")
        check("Users & Access has a Reminder email column", admin.locator("[data-table='users'] th:has-text('Reminder email')").count() == 1)
        cell = row.locator("[data-field='reminder-email']")
        check("...and Dharmik Mistry has none yet", cell.count() == 1 and cell.get_attribute("data-state") == "none", cell.inner_text() if cell.count() else "")
        hint = admin.locator("[data-field='reminder-hint']").inner_text() or ""
        check("The page says the reminders go to a mailbox of the person's own, never the sign-in", "Never the sign-in" in hint, hint)
        row.locator("[data-action='edit-reminder-email']").click()
        admin.wait_for_selector(f"[data-table='users'] tr[data-user='{DHARMIK}'] [data-section='reminder-edit']", timeout=10000)
        row.locator("[data-field='reminder-address']").fill(DHARMIK)
        row.locator("[data-action='save-reminder-email']").click()
        admin.wait_for_timeout(500)
        error = row.locator("[data-field='reminder-error']")
        check("A sign-in at gpp.local is refused on the page, in words", error.count() == 1 and "sign-in, not a mailbox" in error.inner_text(), error.inner_text() if error.count() else "")
        refused = api(api_ctx, "PUT", f"/api/email/contacts/{ids.get(DHARMIK)}", {"address": DHARMIK, "language": "gu"})
        check("...and by the server: 400 bad-address, sign-in", refused["status"] == 400 and (refused["body"] or {}).get("problem") == "sign-in", refused["text"][:300])
        listing = api(api_ctx, "GET", "/api/email/contacts")
        check("...and nothing is kept", listing["status"] == 200 and (listing["body"] or {}).get("contacts") == [], listing["text"][:300])
        row.locator("[data-field='reminder-address']").fill(f"  {DHARMIK_MAIL.upper()} ")
        row.locator("[data-field='reminder-language']").select_option("gu")
        row.locator("[data-action='save-reminder-email']").click()
        admin.wait_for_selector(f"[data-table='users'] tr[data-user='{DHARMIK}'] [data-field='reminder-address-shown']", timeout=15000)
        contacts_set.append(ids.get(DHARMIK))
        shown_cell = row.locator("[data-field='reminder-email']")
        check(
            "A plain address is kept, in small letters, with its language and on",
            shown_cell.get_attribute("data-state") == "on" and DHARMIK_MAIL in shown_cell.inner_text() and "ગુજરાતી" in shown_cell.inner_text(),
            shown_cell.inner_text(),
        )
        stored = next((c for c in (api(api_ctx, "GET", "/api/email/contacts").get("body") or {}).get("contacts") or [] if c.get("userId") == ids.get(DHARMIK)), {})
        check("...and the server has it so", stored.get("address") == DHARMIK_MAIL and stored.get("language") == "gu" and stored.get("enabled") is True, stored)
        # SEND TEST IN THE PERSON'S ROW (the owner, 28-Oct-2026: "when user provide it email address than on Reminder email
        # then it system so really send email on that provided email"): his test email, to the address just entered.
        status_line = admin.locator("[data-section='email-status']")
        check(
            "Over the accounts, while the reminder emails are switched off, a line says nothing is sent until they are",
            status_line.count() == 1 and status_line.get_attribute("data-enabled") == "no" and "switched off" in status_line.inner_text(),
            status_line.inner_text() if status_line.count() else None,
        )
        row.locator("[data-action='test-reminder-email']").click()
        admin.wait_for_selector(f"[data-table='users'] tr[data-user='{DHARMIK}'] [data-field='reminder-test-result']", timeout=30000)
        result_line = row.locator("[data-field='reminder-test-result']")
        check(
            "Send test in Dharmik Mistry's row sends his test email to his address - kept on this server, as a test server keeps every email",
            result_line.get_attribute("data-outcome") == "captured" and "EMAIL_TRANSPORT=capture" in result_line.inner_text(),
            result_line.inner_text(),
        )
        his_tests = [r for r in email_log(api_ctx) if r.get("userId") == ids.get(DHARMIK) and str(r.get("slot") or "").startswith("test-")]
        check("...the email log has it, as his", len(his_tests) == 1 and his_tests[0].get("state") == "captured", his_tests)
        staff_probe, _ = api_session(browser, KAPILA)
        check("...and a member of staff cannot send anybody's test", api(staff_probe, "POST", "/api/email/test", {"userId": ids.get(DHARMIK)})["status"] == 403)
        staff_probe.close()

        # ==============================================================
        # 3. The switch, on the Notifications page
        # ==============================================================
        print("\n==== The switch ====")
        go(admin, "/notifications", "[data-section='server-jobs'] [data-section='reminder-emails']", 1500)
        section = admin.locator("[data-section='reminder-emails']")
        switch = section.locator("[data-action='email-switch']")
        admin.wait_for_selector("[data-section='reminder-emails'] [data-field='email-setup']", timeout=15000)
        check("The reminder emails are off until the super admin switches them on", switch.get_attribute("aria-checked") == "false" and section.get_attribute("data-enabled") == "no")
        check("The page says the server keeps them on the PC (capture mode)", "EMAIL_TRANSPORT=capture" in section.locator("[data-field='email-setup']").inner_text(), section.locator("[data-field='email-setup']").inner_text())
        switch.click()
        admin.wait_for_selector("[data-section='reminder-emails'][data-enabled='yes']", timeout=15000)
        settings = api(api_ctx, "GET", "/api/email/settings").get("body") or {}
        check("Switched on, the server has it on, and who did it", settings.get("enabled") is True and settings.get("setBy") == "Super Admin", settings)

        # ==============================================================
        # 4. The notify job, by hand: one email for Dharmik Mistry
        # ==============================================================
        print("\n==== The email ====")
        ran = api(api_ctx, "POST", "/api/jobs/run", {"job": "notify", "today": day, "time": "10:00"})
        result = (ran.get("body") or {}).get("result") or {}
        check("The notify job runs by hand at 10:00 of the working day", ran["status"] == 200, ran["text"][:400])
        check("...and its line says the emails were captured", str(result.get("email") or "").startswith("captured"), result.get("email"))
        log = email_log(api_ctx)
        # His reminders of the day (his test email of a moment ago is not one).
        dharmik_rows = [r for r in log if r.get("userId") == ids.get(DHARMIK) and r.get("day") == day and not str(r.get("slot") or "").startswith("test-")]
        check("The email log has ONE email for Dharmik Mistry, the morning one, captured", len(dharmik_rows) == 1 and dharmik_rows[0].get("slot") == "morning" and dharmik_rows[0].get("state") == "captured", dharmik_rows)
        body = (dharmik_rows[0].get("body") or "") if dharmik_rows else ""
        check("...naming the record: F/PRD/10 of the day, as dd-mm-yy", "F/PRD/10" in body and shown(day) in body, body[:900])
        check("...in Gujarati, to Dharmik Mistry by name", "નમસ્તે Dharmik Mistry" in body and re.search(r"[઀-૿]", dharmik_rows[0].get("subject") or "") is not None, (dharmik_rows[0].get("subject") if dharmik_rows else None, body[:200]))
        check("...and the log names no address", DHARMIK_MAIL not in json.dumps(log) and ADMIN_MAIL not in json.dumps(log))
        morning_rows = len([r for r in log if r.get("day") == day and r.get("slot") == "morning"])
        again = api(api_ctx, "POST", "/api/jobs/run", {"job": "notify", "today": day, "time": "10:05"})
        log2 = email_log(api_ctx)
        check(
            "Run again in the same slot: nothing more, for anybody",
            again["status"] == 200 and len([r for r in log2 if r.get("day") == day and r.get("slot") == "morning"]) == morning_rows and len([r for r in log2 if r.get("userId") == ids.get(DHARMIK) and r.get("day") == day and not str(r.get("slot") or "").startswith("test-")]) == 1,
            ((again.get("body") or {}).get("result") or {}).get("email"),
        )

        # ==============================================================
        # 5. "Send me a test email", captured
        # ==============================================================
        print("\n==== The test email ====")
        put = api(api_ctx, "PUT", f"/api/email/contacts/{ids.get(ADMIN)}", {"address": ADMIN_MAIL, "language": "en", "enabled": True})
        check("(the super admin's own reminder email set)", put["status"] == 200, put["text"][:300])
        contacts_set.append(ids.get(ADMIN))
        go(admin, "/notifications", "[data-section='reminder-emails'][data-enabled='yes']", 1200)
        admin.locator("[data-section='reminder-emails'] [data-action='email-test']").click()
        admin.wait_for_selector("[data-field='email-test-outcome']", timeout=30000)
        outcome = admin.locator("[data-field='email-test-outcome']")
        check("'Send me a test email' works, captured on this server", outcome.get_attribute("data-outcome") == "captured" and "Captured on this server" in outcome.inner_text(), outcome.inner_text())
        tests = [r for r in email_log(api_ctx) if r.get("userId") == ids.get(ADMIN) and str(r.get("slot") or "").startswith("test-")]
        check("...the email log has it", len(tests) == 1 and tests[0].get("state") == "captured" and "test email from DCRS" in (tests[0].get("body") or ""), tests)
        admin.wait_for_timeout(800)
        check("...and the page lists the latest emails", admin.locator("[data-section='email-log'] [data-email-log]").count() >= 2, admin.locator("[data-section='email-log']").inner_text())
        check("A second test at once is held back (one in 20 seconds)", api(api_ctx, "POST", "/api/email/test")["status"] == 429)
        sign_out(admin)

        # ==============================================================
        # 6. The record submitted: the next slot sends nothing for it
        # ==============================================================
        print("\n==== The record done ====")
        items = store_items(api_ctx)
        records = json.loads(items["records"]["value"])
        now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
        # Every sheet of F/PRD/10 for the day (a browser's morning prepare may have stored its own beside ours).
        for r in records:
            if r.get("id") == record_id or (r.get("documentId") == DOC and r.get("dueDate") == day and not r.get("isDemo")):
                r.update({"status": "Submitted", "submittedBy": "Dharmik Mistry", "submittedAt": now, "updatedAt": now})
        r = put_records(api_ctx, records, items["records"]["version"])
        check("(Dharmik Mistry's F/PRD/10 of the day submitted)", r["status"] in (200, 204), r["text"][:300])
        late = api(api_ctx, "POST", "/api/jobs/run", {"job": "notify", "today": day, "time": "15:35"})
        check("The 15:35 run goes", late["status"] == 200, late["text"][:300])
        afternoon = [x for x in email_log(api_ctx) if x.get("userId") == ids.get(DHARMIK) and x.get("day") == day and x.get("slot") == "reminder"]
        names_it = [x for x in afternoon if "F/PRD/10" in (x.get("body") or "") and shown(day) in (x.get("body") or "")]
        check("...and sends nothing for the record done", names_it == [], afternoon)
        # What is still open for Dharmik Mistry, as the bell has it: with nothing an email carries, no email at all.
        dharmik_ctx, status = api_session(browser, DHARMIK)
        still = [i for i in (api(dharmik_ctx, "GET", "/api/notifications?state=open&limit=100").get("body") or {}).get("items") or [] if i.get("kind") in ("overdue", "sent_back", "due", "needs_input", "ready", "verify")]
        dharmik_ctx.close()
        check("Dharmik Mistry has nothing else open, so the 15:35 run sent no email at all: the reminders stop when the work is done", status == 200 and still == [] and afternoon == [], (status, [(i.get("kind"), i.get("title")) for i in still], afternoon))

        # ==============================================================
        # 7. Nobody else: staff refused, the directory and the activity log
        # ==============================================================
        print("\n==== Nobody else ====")
        staff, status = api_session(browser, KAPILA)
        check("Kapila Barad signs in (through the API)", status == 200, status)
        for method, path, body in [
            ("GET", "/api/email/contacts", None),
            ("PUT", f"/api/email/contacts/{ids.get(KAPILA)}", {"address": "kapila.reminders@example.com"}),
            ("DELETE", f"/api/email/contacts/{ids.get(DHARMIK)}", None),
            ("PUT", "/api/email/settings", {"enabled": False}),
            ("POST", "/api/email/test", None),
            ("GET", "/api/email/log", None),
        ]:
            r = api(staff, method, path, body)
            check(f"A member of staff is refused {method} {path}: 403", r["status"] == 403 and (r["body"] or {}).get("code") == "super-admin-only", r["text"][:200])
        directory = api(staff, "GET", "/api/users/directory")
        check("The directory carries no reminder email", directory["status"] == 200 and "example.com" not in directory["text"] and '"address"' not in directory["text"], directory["text"][:300])
        today = plant_today().isoformat()
        boss_lines = activity_lines(api_ctx, "Reminder emails sent", today)
        check(
            "The activity log has the run's line in the System's name, naming Dharmik Mistry, never an address",
            any(l.get("userName") == "System" and re.search(r"Dharmik Mistry \(\d+ records?\)", l.get("detail") or "") for l in boss_lines) and "@" not in json.dumps(boss_lines),
            boss_lines[:3],
        )
        set_lines = activity_lines(api_ctx, "Reminder email set", today)
        check("...and the reminder email set, with no address in it", any(l.get("target") == "Dharmik Mistry" for l in set_lines) and "example.com" not in json.dumps(set_lines), set_lines[:3])
        check("...and a member of staff reads none of them", activity_lines(staff, "Reminder emails sent", today) == [] and activity_lines(staff, "Reminder email set", today) == [])
        retired = api(staff, "POST", "/api/reminders/send-digest", {"reminders": []})
        check("The browser's old digest is retired: 410, in words", retired["status"] == 410 and (retired["body"] or {}).get("code") == "retired", retired["text"][:200])
        staff.close()

        check("No JavaScript errors", not ERRORS, ERRORS[:5])
    finally:
        # Put back what the later suites rely on: no reminder emails switched on, no reminder email kept.
        try:
            cleanup, _ = api_session(browser, ADMIN)
            api(cleanup, "PUT", "/api/email/settings", {"enabled": False})
            for uid in contacts_set:
                if uid:
                    api(cleanup, "DELETE", f"/api/email/contacts/{uid}")
            left = (api(cleanup, "GET", "/api/email/contacts").get("body") or {}).get("contacts")
            if left:
                print("could not remove every reminder email:", [c.get("userId") for c in left])
            cleanup.close()
        except Exception as e:  # noqa: BLE001
            print("could not put the reminder emails back:", e)
        browser.close()

print(f"\n{len(FAILURES)} failure(s)")
for f in FAILURES:
    print(" -", f)
sys.exit(1 if FAILURES else 0)
