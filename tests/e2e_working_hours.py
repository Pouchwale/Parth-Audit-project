"""The plant's working hours and a day's session (REQUIREMENTS s84), asked for
on 30-Sep-2026:

  "Every day a user must first log in, and only then can he or she use the
   software. ... Daily working hours: after them nobody but the admin can use
   this software. The time runs from 8:40 am to 6:20 pm. Mostly Thursday is the
   holiday - check the company's calendar properly, because there are
   adjustment days too, and sometimes a Thursday counts as a working day, so the
   software must run on that day as well."

Run against the PRODUCT server (:8843, the plant's seeded accounts on
SeedQA@2026). The runner starts it with DCRS_WORKING_HOURS=off, so the suites
can run at any hour; what the browser does with the server's answers is proved
here by FAKING those answers with Playwright routes, which works whatever the
clock says. Where the server itself holds the hours (DCRS_BASE pointing at a
server started without the switch), the real gate is proved as well, on the
real clock, by changing the plant's calendar and hours through the super
admin's own master data and putting them back:

  * GET /api/auth/config states the hours and today in words, and nothing about
    anybody; the sign-in page states them (a closed Thursday, faked);
  * a sign-in refused outside the hours says so in the server's plain words, and
    the app does not open (faked; and real, where the gate is on);
  * a session still open when the server refuses it (faked /api/auth/me) is
    signed out to the reason, and the sign-out is logged "Outside working hours";
  * ten minutes before the close a member of staff is warned, and at the close
    signed out by the browser itself - the sign-in page says why, the server's
    session is over, and the log says "At the close of working hours";
  * Master Data: the super admin edits the plant's hours and saves them, the
    server follows, a wrong pair is refused in words; a member of staff sees
    them and cannot change them, and cannot change them through the API either;
  * the super admin is never held to them: their session runs to the factory's
    midnight and no warning comes even when a fake says the day is closing;
  * where the gate is on: staff refused and the super admin let in after the
    close, on the weekly off and on a festival, and let in on an adjustment day;
    an open session refused on every route (403), a write to the records 401.

Network-independent.
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD", "SeedQA@2026")
ADMIN = os.environ.get("DCRS_ADMIN_EMAIL", "admin@gpp.local")
STAFF = os.environ.get("DCRS_QC_EMAIL", "kapila.barad@gpp.local")  # kept to Quality Control
IST = timezone(timedelta(hours=5, minutes=30))
OWNER_SENTENCE = "DCRS is open 8:40 am to 6:20 pm on working days. Today is Thursday, the weekly off — it opens again on Friday 2 October at 8:40 am."
FAILURES = []
PAGE_ERRORS = []


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


def note(text):
    print(f"[NOTE] {text}")


def iso_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def words(moment):
    """A moment as the factory's time of day in words, as the app says it: 6:20 pm."""
    t = moment.astimezone(IST)
    h12 = 12 if t.hour % 12 == 0 else t.hour % 12
    return f"{h12}:{t.minute:02d} {'am' if t.hour < 12 else 'pm'}"


def next_midnight_ist(moment):
    t = moment.astimezone(IST)
    return datetime(t.year, t.month, t.day, tzinfo=IST) + timedelta(days=1)


# ---------------------------------------------------------------------------
# the browser

NO_INTRO = "(() => { try { sessionStorage.setItem('dcrs:intro-seen', '1'); } catch (e) {} })()"


def new_context(browser):
    ctx = browser.new_context(reduced_motion="reduce", viewport={"width": 1366, "height": 860})
    ctx.add_init_script(NO_INTRO)
    return ctx


def new_page(ctx):
    page = ctx.new_page()
    page.on("pageerror", lambda e: PAGE_ERRORS.append(str(e)))
    return page


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


def open_sign_in(page):
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(400)


def type_sign_in(page, email):
    page.fill("#login-email", email)
    page.fill("#login-password", SEED_PASSWORD)
    page.click("button:has-text('Log In')")


def sign_in(page, email):
    """Signs in from the sign-in page. True when the app opened."""
    open_sign_in(page)
    type_sign_in(page, email)
    try:
        page.wait_for_selector(".app-sidebar", timeout=60000)
    except Exception:
        return False
    page.wait_for_timeout(800)
    dismiss(page)
    close_assistant(page)
    return True


def sign_out(page):
    btn = page.locator(".app-topbar button[title='Log Out']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(500)
        ok = page.locator("[data-action='logout-review-confirm']")
        if ok.count():
            ok.first.click()
        page.wait_for_selector("#login-email", timeout=30000)
        page.wait_for_timeout(300)


def page_fetch(page, path, method="GET", body=None):
    return page.evaluate(
        """async ([path, method, body]) => {
             const res = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body === null ? undefined : JSON.stringify(body) });
             let payload = null;
             try { payload = await res.json(); } catch { payload = null; }
             return { status: res.status, body: payload };
           }""",
        [path, method, body],
    )


# ---------------------------------------------------------------------------
# the server, as a program talks to it

def api_login(ctx, email):
    res = ctx.request.post(f"{BASE}/api/auth/login", data={"email": email, "password": SEED_PASSWORD})
    try:
        body = res.json()
    except Exception:
        body = None
    return res.status, body, res.headers


def config(ctx):
    return ctx.request.get(f"{BASE}/api/auth/config").json()


def activity(admin_ctx, person_id, limit=60):
    res = admin_ctx.request.get(f"{BASE}/api/activity?person={person_id}&limit={limit}")
    return res.json().get("lines", []) if res.ok else []


def wait_for_line(admin_ctx, person_id, action, detail, seconds=10):
    deadline = time.time() + seconds
    lines = []
    while time.time() < deadline:
        lines = activity(admin_ctx, person_id)
        if any(l.get("action") == action and l.get("detail") == detail for l in lines):
            return True, lines
        time.sleep(0.5)
    return False, [(l.get("action"), l.get("detail")) for l in lines[:8]]


def stored_master(ctx):
    res = ctx.request.get(f"{BASE}/api/storage")
    for item in res.json().get("items", []):
        if item.get("key") == "master" and item.get("scope") == "company":
            return item.get("value"), item.get("version")
    return None, 0


def put_master(ctx, value_text, version):
    res = ctx.request.put(
        f"{BASE}/api/storage/master",
        data=value_text,
        headers={"Content-Type": "text/plain;charset=utf-8", "X-Base-Version": str(version)},
    )
    return res.status, (res.json() if res.status in (200, 409) else None)


def write_master(admin_ctx, master):
    """Writes the whole master item as the super admin, from the version stored now: a dict, or the stored text as it was."""
    _, version = stored_master(admin_ctx)
    status, body = put_master(admin_ctx, master if isinstance(master, str) else json.dumps(master), version)
    return status == 200, body


def wait_for_hours(ctx, start, end, seconds=25):
    deadline = time.time() + seconds
    cfg = {}
    while time.time() < deadline:
        cfg = config(ctx)
        h = cfg.get("hours") or {}
        if h.get("start") == start and h.get("end") == end:
            return True, h
        time.sleep(0.6)
    return False, cfg.get("hours")


# ---------------------------------------------------------------------------

def faked_hours(real_features):
    """The public answer the server would give on Thursday 1 October 2026 at 10:00 in the factory."""
    return {
        "features": real_features,
        "hours": {
            "enforced": True,
            "start": "08:40",
            "end": "18:20",
            "timeZone": "Asia/Kolkata",
            "now": "2026-10-01T04:30:00.000Z",
            "today": {"date": "2026-10-01", "weekday": "Thursday", "kind": "weekly-off", "name": None},
            "phase": "closed-day",
            "openNow": False,
            "opensAt": "2026-10-02T03:10:00.000Z",
            "closesAt": None,
            "hoursText": "DCRS is open 8:40 am to 6:20 pm on working days.",
            "todayText": "Today is Thursday, the weekly off — it opens again on Friday 2 October at 8:40 am.",
        },
    }


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        admin_ctx = new_context(browser)
        status, admin_login, admin_headers = api_login(admin_ctx, ADMIN)
        check("The super admin signs in", status == 200, (status, admin_login))
        if status != 200:
            browser.close()
            return

        # ==================================================================
        print("\n==== What the server says before anybody signs in ====")
        cfg = config(admin_ctx)
        hours = cfg.get("hours") or {}
        enforced = hours.get("enforced") is True
        check("GET /api/auth/config carries the plant's hours beside the features", "features" in cfg and hours.get("start") and hours.get("end"), cfg)
        check("...in the factory's time zone, with today and the words for both", hours.get("timeZone") == "Asia/Kolkata" and hours.get("today", {}).get("date") and hours.get("hoursText", "").startswith("DCRS is open ") and hours.get("todayText"), hours)
        check("...and nothing about anybody", not any(k in json.dumps(cfg) for k in ("@gpp.local", "email", "userId", "password")), cfg)
        note(f"This server {'HOLDS' if enforced else 'does NOT hold'} the plant to its hours (DCRS_WORKING_HOURS {'unset' if enforced else '=off'}); today: {hours.get('todayText')}")

        # ==================================================================
        print("\n==== The super admin's day ====")
        now = datetime.now(timezone.utc)
        session = (admin_login or {}).get("session") or {}
        ends = parse_iso(session["endsAt"]) if session.get("endsAt") else None
        check("The super admin's session ends at the factory's midnight", ends is not None and ends == next_midnight_ist(now), (session, next_midnight_ist(now).isoformat()))
        check("...and the browser is not told to sign them out by itself", session.get("signOutAtEnd") is False, session)
        cookie = admin_headers.get("set-cookie", "")
        max_age = next((int(part.split("=")[1]) for part in cookie.split(";") if part.strip().lower().startswith("max-age=")), None)
        check("...and the cookie closes with the day (Max-Age to midnight)", max_age is not None and ends is not None and abs(max_age - (ends - now).total_seconds()) < 30, (max_age, cookie[:40]))

        staff_ctx = new_context(browser)
        s_status, staff_login, s_headers = api_login(staff_ctx, STAFF)
        staff_id = ((staff_login or {}).get("user") or {}).get("id")
        if enforced and not hours.get("openNow"):
            check("Outside the hours, a member of staff is refused with 403 outside-working-hours", s_status == 403 and (staff_login or {}).get("code") == "outside-working-hours", (s_status, staff_login))
            check("...in the words the sign-in page states, with the next opening", (staff_login or {}).get("error") == f"{hours.get('hoursText')} {hours.get('todayText')}" and (staff_login or {}).get("opensAt") == hours.get("opensAt"), staff_login)
        else:
            check("A member of staff signs in", s_status == 200, (s_status, staff_login))
            st = (staff_login or {}).get("session") or {}
            st_end = parse_iso(st["endsAt"]) if st.get("endsAt") else None
            if enforced:
                closes = parse_iso(hours["closesAt"]) if hours.get("closesAt") else None
                check("...their session ends at the close of today's working hours", st_end is not None and closes is not None and st_end == closes, (st, hours.get("closesAt")))
                check("...and the browser is told to sign them out then", st.get("signOutAtEnd") is True, st)
            else:
                check("...with the hours not held on this server, their session runs to the factory's midnight", st_end == next_midnight_ist(now), st)
                check("...and nothing signs them out early", st.get("signOutAtEnd") is False, st)

        # ==================================================================
        print("\n==== The sign-in page states the hours ====")
        ctx = new_context(browser)
        page = new_page(ctx)
        open_sign_in(page)
        panel = page.locator("[data-section='working-hours']")
        if enforced:
            check("The sign-in page states the hours and today, as the server says them", panel.count() == 1 and panel.locator("[data-field='hours-text']").inner_text() == hours.get("hoursText") and panel.locator("[data-field='today-text']").inner_text() == hours.get("todayText"), panel.inner_text() if panel.count() else None)
        else:
            check("A server that does not hold the hours adds nothing to the sign-in page (as before)", panel.count() == 0)
        ctx.close()

        ctx = new_context(browser)
        page = new_page(ctx)
        real_features = cfg.get("features")
        page.route("**/api/auth/config", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps(faked_hours(real_features))))
        open_sign_in(page)
        page.wait_for_selector("[data-section='working-hours']", timeout=10000)
        panel = page.locator("[data-section='working-hours']")
        check("On the weekly off the sign-in page says: DCRS is open 8:40 am to 6:20 pm on working days.", panel.locator("[data-field='hours-text']").inner_text() == "DCRS is open 8:40 am to 6:20 pm on working days.", panel.inner_text())
        check("...Today is Thursday, the weekly off - it opens again on Friday 2 October at 8:40 am.", panel.locator("[data-field='today-text']").inner_text() == "Today is Thursday, the weekly off — it opens again on Friday 2 October at 8:40 am.", panel.inner_text())
        check("...that each session ends with the day, and that the super admin is not held to it", "sign in each morning" in panel.inner_text() and "The super admin may sign in at any time" in panel.inner_text(), panel.inner_text())
        check("...drawn as closed", panel.get_attribute("data-phase") == "closed-day" and panel.get_attribute("data-open") == "false")

        # ==================================================================
        print("\n==== A sign-in refused outside the hours ====")
        refusal = {"error": OWNER_SENTENCE, "code": "outside-working-hours", "opensAt": "2026-10-02T03:10:00.000Z"}
        page.route("**/api/auth/login", lambda route: route.fulfill(status=403, content_type="application/json", body=json.dumps(refusal)))
        type_sign_in(page, STAFF)
        page.wait_for_selector(".auth-error[data-code='outside-working-hours']", timeout=15000)
        said = page.locator(".auth-error[data-code='outside-working-hours']").inner_text()
        check("The refusal is said in plain words, with the next opening", said == OWNER_SENTENCE, said)
        page.wait_for_timeout(600)
        check("...and the app does not open", page.locator(".app-sidebar").count() == 0 and page.locator("#login-email").count() == 1)
        ctx.close()

        # ==================================================================
        print("\n==== Master Data: the plant's hours, the super admin's to change ====")
        original_master, _ = stored_master(admin_ctx)
        ctx = new_context(browser)
        page = new_page(ctx)
        restored = True
        try:
            check("The super admin signs in to the app", sign_in(page, ADMIN))
            page.goto(f"{BASE}/index.html#/master-data")
            page.wait_for_timeout(1200)
            dismiss(page)
            page.locator(".pill-tab", has_text="Working Hours & Briefing").first.click()
            page.wait_for_selector("[data-section='plant-hours']", timeout=10000)
            card = page.locator("[data-section='plant-hours']")
            start_box = card.locator("#plant-hours-start")
            end_box = card.locator("#plant-hours-end")
            was = (start_box.input_value(), end_box.input_value())
            check("The Working Hours tab has the plant's hours, in two boxes the super admin can change", start_box.count() == 1 and end_box.count() == 1 and was[0] and was[1], was)
            check("...stated in words, with where today stands", "on working days" in card.locator("[data-field='plant-hours-now']").inner_text() and "Today, " in card.locator("[data-field='plant-hours-now']").inner_text(), card.locator("[data-field='plant-hours-now']").inner_text())
            rule = card.locator("[data-field='plant-calendar-rule']").inner_text()
            local = page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:master') || '{}')")
            off_day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][local.get("weeklyOffDay", 4) if isinstance(local.get("weeklyOffDay"), int) else 4]
            check(
                "...beside the calendar as the rule reads it: the weekly off, the festivals, the adjustment days",
                f"Weekly off: {off_day}" in rule and f"Festival holidays: {len(local.get('holidays') or [])}" in rule and f"Adjustment days: {len(local.get('adjustmentDays') or [])}" in rule,
                (off_day, rule),
            )
            chips = card.locator("[data-field='plant-next-days'] [data-date]")
            first_chip = chips.first.get_attribute("data-date") if chips.count() else None
            check("...and the next fourteen days, each open or closed", chips.count() == 14 and first_chip == hours.get("today", {}).get("date"), (chips.count(), first_chip))
            offs = [chips.nth(i) for i in range(chips.count()) if chips.nth(i).inner_text().startswith(off_day[:3] + " ")]
            festivals = {h.get("date") for h in (local.get("holidays") or [])}
            check(
                f"...the weekly off among them ({off_day}) drawn as closed (or as an adjustment day, open)",
                offs and all(("weekly off" in t.inner_text() and t.get_attribute("data-open") == "false") or ("adjustment day, open" in t.inner_text() and t.get_attribute("data-open") == "true") or (t.get_attribute("data-date") in festivals and t.get_attribute("data-open") == "false") for t in offs),
                [t.inner_text() for t in offs],
            )
            save = card.locator("[data-action='save-plant-hours']")
            check("Save waits until something is changed", save.is_disabled())

            start_box.fill("18:00")
            end_box.fill("09:00")
            save.click()
            page.wait_for_timeout(300)
            said = card.locator("[data-field='plant-hours-said']")
            check("A close before the opening is refused in words, and nothing is saved", said.count() == 1 and said.get_attribute("data-ok") == "false" and "close after it opens" in said.inner_text(), said.inner_text() if said.count() else None)

            start_box.fill("09:10")
            end_box.fill("17:50")
            save.click()
            page.wait_for_timeout(400)
            check("The new hours are saved, and said", said.get_attribute("data-ok") == "true" and "9:10 am to 5:50 pm" in said.inner_text(), said.inner_text())
            stored = page.evaluate("() => (JSON.parse(localStorage.getItem('dcrs:v1:master') || '{}').workingHours || null)")
            check("...into the master data", stored == {"start": "09:10", "end": "17:50"}, stored)
            ok, h = wait_for_hours(admin_ctx, "09:10", "17:50")
            check("...and the server holds the plant to them within seconds", ok and (h or {}).get("hoursText") == "DCRS is open 9:10 am to 5:50 pm on working days.", h)
            found, lines = wait_for_line(admin_ctx, (admin_login.get("user") or {}).get("id"), "Working hours changed", f"{words_from_hhmm(was[0])} to {words_from_hhmm(was[1])} → 9:10 am to 5:50 pm")
            check("...and the change is a line in the activity log", found, lines)

            page.reload()
            page.wait_for_selector(".app-sidebar", timeout=60000)
            page.wait_for_timeout(1200)
            dismiss(page)
            page.locator(".pill-tab", has_text="Working Hours & Briefing").first.click()
            page.wait_for_selector("[data-section='plant-hours']", timeout=10000)
            card = page.locator("[data-section='plant-hours']")
            check("After a reload the boxes hold the saved hours", (card.locator("#plant-hours-start").input_value(), card.locator("#plant-hours-end").input_value()) == ("09:10", "17:50"))

            card.locator("#plant-hours-start").fill(was[0])
            card.locator("#plant-hours-end").fill(was[1])
            card.locator("[data-action='save-plant-hours']").click()
            ok, h = wait_for_hours(admin_ctx, was[0], was[1])
            check("Put back as they were, and the server follows", ok, h)
            restored = ok
            sign_out(page)
        finally:
            ctx.close()

        # ==================================================================
        print("\n==== A session refused while it is open ====")
        opened_for_test = False
        master_now, _ = stored_master(admin_ctx)
        if enforced and not hours.get("openNow"):
            # Open the plant for the test, from the super admin's own master data: all day, today a working day.
            opened_for_test = open_today(admin_ctx, master_now)
            check("(the super admin opens today for the test through the master data)", opened_for_test)
        can_staff = (not enforced) or hours.get("openNow") or opened_for_test

        if can_staff:
            staff_master_view(browser, admin_ctx)
            ctx = new_context(browser)
            page = new_page(ctx)
            try:
                check("A member of staff is signed in", sign_in(page, STAFF))
                sid = page.evaluate("() => fetch('/api/auth/me').then((r) => r.json()).then((b) => b.user && b.user.id)")
                page.route("**/api/auth/me", lambda route: route.fulfill(status=403, content_type="application/json", body=json.dumps(refusal)))
                page.reload()
                page.wait_for_selector("#login-email", timeout=30000)
                page.wait_for_selector("[data-section='signed-out-notice']", timeout=15000)
                notice = page.locator("[data-section='signed-out-notice']").inner_text()
                check("A session refused outside the hours is signed out, and the sign-in page says why", notice == OWNER_SENTENCE, notice)
                page.unroute("**/api/auth/me")
                me = page_fetch(page, "/api/auth/me")
                check("...the server's session is over (the sign-out went to the server)", me["status"] == 401, me)
                found, lines = wait_for_line(admin_ctx, sid, "Signed out", "Outside working hours")
                check('...and the log says "Signed out" - "Outside working hours"', found, lines)
            finally:
                ctx.close()

            # ==============================================================
            print("\n==== Ten minutes before the close, and the close ====")
            ctx = new_context(browser)
            page = new_page(ctx)
            try:
                closing = {"in": 9 * 60}

                def fake_session(route):
                    response = route.fetch()
                    body = response.json()
                    if response.status == 200 and isinstance(body, dict):
                        server_now = datetime.now(timezone.utc)
                        body["session"] = {"endsAt": (server_now + timedelta(seconds=closing["in"])).isoformat(timespec="milliseconds").replace("+00:00", "Z"), "signOutAtEnd": True, "now": iso_now()}
                        closing["endsAt"] = body["session"]["endsAt"]
                    route.fulfill(response=response, json=body)

                page.route("**/api/auth/login", fake_session)
                check("Signed in with the day closing in nine minutes (the server's answer faked)", sign_in(page, STAFF))
                page.wait_for_selector("[data-section='closing-warning']", timeout=15000)
                warn = page.locator("[data-section='closing-warning']")
                text = warn.inner_text()
                close_words = words(parse_iso(closing["endsAt"]))
                check("A warning ten minutes before the close: DCRS closes at <time>", f"DCRS closes at {close_words}" in text, text)
                check("...you will be signed out in 9 minutes", "You will be signed out in 9 minutes" in text and warn.get_attribute("data-minutes-left") == "9", text)
                check("...and the app still works beneath it", page.locator(".app-sidebar").count() == 1)
                warn.locator("[data-action='closing-warning-ok']").click()
                page.wait_for_timeout(300)
                check("OK puts it aside", page.locator("[data-section='closing-warning']").count() == 0)
                sign_out(page)

                closing["in"] = 60
                check("Signed in again with the day closing in a minute", sign_in(page, STAFF))
                sid = page.evaluate("() => fetch('/api/auth/me').then((r) => r.json()).then((b) => b.user && b.user.id)")
                check("...the warning says about a minute", page.locator("[data-section='closing-warning']").count() == 1 and "about a minute" in page.locator("[data-section='closing-warning']").inner_text())
                page.wait_for_selector("#login-email", timeout=70000)
                page.wait_for_selector("[data-section='signed-out-notice']", timeout=10000)
                notice = page.locator("[data-section='signed-out-notice']").inner_text()
                check("At the close the browser signs the person out by itself, and says why", notice == f"You were signed out at the close of working hours, {words(parse_iso(closing['endsAt']))}.", notice)
                me = page_fetch(page, "/api/auth/me")
                check("...the server's session is over", me["status"] == 401, me)
                found, lines = wait_for_line(admin_ctx, sid, "Signed out", "At the close of working hours")
                check('...and the log says "Signed out" - "At the close of working hours"', found, lines)
            finally:
                ctx.close()
        else:
            note("Staff cannot be signed in on this server now, and the calendar could not be opened: the session checks were not run.")

        # ==================================================================
        print("\n==== The super admin is not held to it ====")
        ctx = new_context(browser)
        page = new_page(ctx)
        try:
            def fake_admin(route):
                response = route.fetch()
                body = response.json()
                if response.status == 200 and isinstance(body, dict):
                    body["session"] = {"endsAt": (datetime.now(timezone.utc) + timedelta(seconds=35)).isoformat(timespec="milliseconds").replace("+00:00", "Z"), "signOutAtEnd": True, "now": iso_now()}
                route.fulfill(response=response, json=body)

            page.route("**/api/auth/login", fake_admin)
            check("The super admin signs in even when a fake says their day closes in 35 seconds", sign_in(page, ADMIN))
            page.wait_for_timeout(12000)
            check("...no warning comes, and nothing signs them out", page.locator("[data-section='closing-warning']").count() == 0 and page.locator(".app-sidebar").count() == 1 and page.locator("#login-email").count() == 0)
        finally:
            ctx.close()

        # ==================================================================
        if enforced:
            print("\n==== The real gate, on the real clock ====")
            real_gate(browser, admin_ctx, staff_id)
        else:
            note("The real gate is proved against a server started without DCRS_WORKING_HOURS=off (DCRS_BASE), and by backend/tests/workingHours.test.ts.")

        # Back as it was.
        if original_master is not None:
            ok, _ = write_master(admin_ctx, original_master)
            check("The master data is put back exactly as it was", ok and stored_master(admin_ctx)[0] == original_master)
        elif not restored:
            check("The hours are put back", False)

        check("No JavaScript errors on any page", not PAGE_ERRORS, PAGE_ERRORS[:3])
        browser.close()


def staff_master_view(browser, admin_ctx):
    """A member of staff reads the plant's hours and cannot change them - not on the page, not through the API."""
    ctx = new_context(browser)
    page = new_page(ctx)
    try:
        if sign_in(page, STAFF):
            page.goto(f"{BASE}/index.html#/master-data")
            page.wait_for_timeout(1200)
            dismiss(page)
            page.locator(".pill-tab", has_text="Working Hours & Briefing").first.click()
            page.wait_for_selector("[data-section='plant-hours']", timeout=10000)
            card = page.locator("[data-section='plant-hours']")
            check("A member of staff reads the plant's hours, with no box to change them", card.locator("#plant-hours-start").count() == 0 and card.locator("[data-field='plant-hours-admin-only']").count() == 1, card.inner_text()[:300])
            sign_out(page)
        else:
            check("A member of staff signs in to the app", False)
    finally:
        ctx.close()
    staff_ctx = new_context(browser)
    try:
        if api_login(staff_ctx, STAFF)[0] != 200:
            check("A member of staff signs in, to write the master data", False)
            return
        value, version = stored_master(staff_ctx)
        if not value:
            note("No master data is stored yet: the forged write was not tried.")
            return
        forged = json.loads(value)
        before_hours = forged.get("workingHours")
        forged["workingHours"] = {"start": "06:00", "end": "06:30"}
        status, _ = put_master(staff_ctx, json.dumps(forged), version)
        after_hours = json.loads(stored_master(admin_ctx)[0] or "{}").get("workingHours")
        check("A member of staff writing the master data through the API cannot change the hours: they stay as stored", status == 200 and after_hours == before_hours, (status, before_hours, after_hours))
    finally:
        staff_ctx.close()


def words_from_hhmm(text):
    h, m = (int(x) for x in text.split(":"))
    h12 = 12 if h % 12 == 0 else h % 12
    return f"{h12}:{m:02d} {'am' if h < 12 else 'pm'}"


def today_ist():
    return datetime.now(IST)


def open_today(admin_ctx, master_text):
    """Today a working day, open all day - through the super admin's own master data."""
    if master_text is None:
        return False
    m = json.loads(master_text)
    today = today_ist()
    iso = today.strftime("%Y-%m-%d")
    js_dow = (today.weekday() + 1) % 7  # JavaScript's getDay: 0 = Sunday
    m["workingHours"] = {"start": "00:00", "end": "23:59"}
    if m.get("weeklyOffDay", 4) == js_dow:
        m["weeklyOffDay"] = (js_dow + 3) % 7
    m["holidays"] = [h for h in m.get("holidays", []) if h.get("date") != iso]
    ok, _ = write_master(admin_ctx, m)
    if not ok:
        return False
    return wait_for_hours(admin_ctx, "00:00", "23:59")[0]


def real_gate(browser, admin_ctx, staff_id):
    """Where the server holds the hours: the gate itself, on the real clock, by changing the calendar and putting it back."""
    original, _ = stored_master(admin_ctx)
    if original is None:
        check("(the master data is stored, to change for the test)", False)
        return
    base = json.loads(original)
    today = today_ist()
    iso = today.strftime("%Y-%m-%d")
    js_dow = (today.weekday() + 1) % 7
    weekday = today.strftime("%A")
    minute = today.hour * 60 + today.minute
    try:
        # Open all day, today a working day: a member of staff signs in and keeps a session.
        opened = dict(base, workingHours={"start": "00:00", "end": "23:59"}, weeklyOffDay=(js_dow + 3) % 7, holidays=[h for h in base.get("holidays", []) if h.get("date") != iso], adjustmentDays=[a for a in base.get("adjustmentDays", []) if a.get("date") != iso])
        write_master(admin_ctx, opened)
        wait_for_hours(admin_ctx, "00:00", "23:59")
        staff_ctx = new_context(browser)
        status, body, headers = api_login(staff_ctx, STAFF)
        check("Open all day: a member of staff signs in", status == 200, (status, body))
        st = (body or {}).get("session") or {}
        today_2359 = datetime(today.year, today.month, today.day, 23, 59, tzinfo=IST)
        check("...and the session ends at today's close (23:59 here)", st.get("endsAt") and parse_iso(st["endsAt"]) == today_2359 and st.get("signOutAtEnd") is True, st)
        token = next((c["value"] for c in staff_ctx.cookies() if c["name"] == "dcrs_session"), None)
        staff_id = ((body or {}).get("user") or {}).get("id") or staff_id
        bearer_ctx = browser.new_context()
        admin_try = browser.new_context()

        def staff_get(path, bearer=False):
            if bearer:
                r = bearer_ctx.request.get(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"})
            else:
                r = staff_ctx.request.get(f"{BASE}{path}")
            try:
                return r.status, r.json()
            except Exception:
                return r.status, None

        check("...its session is served within the hours", staff_get("/api/auth/me")[0] == 200 and staff_get("/api/v1/me", bearer=True)[0] == 200)

        # The same session, now outside the hours in each of the ways the calendar closes a day.
        closes = []
        if minute >= 2:
            closes.append(("the day's hours are over", dict(opened, workingHours={"start": "00:00", "end": f"{(minute - 1) // 60:02d}:{(minute - 1) % 60:02d}"}), "Today's working hours ended at"))
        if minute <= 23 * 60 + 50:
            closes.append(("the day has not opened yet", dict(opened, workingHours={"start": f"{(minute + 5) // 60:02d}:{(minute + 5) % 60:02d}", "end": "23:59"}), "It is not open yet"))
        closes.append((f"today is the weekly off ({weekday})", dict(opened, weeklyOffDay=js_dow), f"Today is {weekday}, the weekly off"))
        closes.append(("today is a festival", dict(opened, holidays=opened["holidays"] + [{"id": "hol-e2e", "date": iso, "name": "E2E Festival"}]), "Today is E2E Festival, a company holiday"))
        for label, master, words_expected in closes:
            write_master(admin_ctx, master)
            wh = master["workingHours"]
            wait_for_hours(admin_ctx, wh["start"], wh["end"])
            time.sleep(0.3)
            s1, me = staff_get("/api/auth/me")
            check(f"When {label}: the open session is refused, 403 outside-working-hours, in words", s1 == 403 and (me or {}).get("code") == "outside-working-hours" and words_expected in (me or {}).get("error", ""), (s1, me))
            s2, v1 = staff_get("/api/v1/me", bearer=True)
            s3, _ = staff_get("/api/storage")
            check("...on the Audit Assistant's API too, and on the records", s2 == 403 and (v1 or {}).get("code") == "outside-working-hours" and s3 == 403, (s2, v1, s3))
            put = staff_ctx.request.put(f"{BASE}/api/storage/settings", data="{}", headers={"Content-Type": "text/plain;charset=utf-8", "X-Base-Version": "*"})
            check("...a write to the records is answered 401, so the browser keeps it for the next sign-in", put.status == 401 and (put.json() or {}).get("code") == "outside-working-hours", put.status)
            fresh = new_context(browser)
            s4, refused, _ = api_login(fresh, STAFF)
            check("...a new sign-in is refused with the same words and the next opening", s4 == 403 and (refused or {}).get("code") == "outside-working-hours" and (refused or {}).get("error") == (me or {}).get("error") and (refused or {}).get("opensAt"), (s4, refused))
            fresh.close()
            check("...and the super admin is let in", api_login(admin_try, ADMIN)[0] == 200)

        found, lines = wait_for_line(admin_ctx, staff_id, "Sign-in refused", "Outside working hours")
        check('A refused sign-in is a line in the log: "Sign-in refused" - "Outside working hours"', found, lines)

        # An adjustment day: today the weekly off, and listed as a day the plant works.
        adjusted = dict(opened, weeklyOffDay=js_dow, adjustmentDays=opened["adjustmentDays"] + [{"id": "adj-e2e", "date": iso, "forHoliday": "E2E Festival"}])
        write_master(admin_ctx, adjusted)
        wait_for_hours(admin_ctx, "00:00", "23:59")
        deadline = time.time() + 10
        s5 = 0
        while time.time() < deadline:
            s5 = staff_get("/api/auth/me")[0]
            if s5 == 200:
                break
            time.sleep(0.5)
        check(f"On an adjustment day (today, a {weekday} made the weekly off) the plant works: the session is served", s5 == 200, s5)
        today_text = (config(admin_ctx).get("hours") or {}).get("todayText", "")
        check("...and the sign-in page's words say so", today_text.startswith(f"Today is {weekday}, an adjustment day for E2E Festival, so the plant works"), today_text)
        staff_ctx.close()
    finally:
        write_master(admin_ctx, original)


if __name__ == "__main__":
    main()
    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED:")
        for f in FAILURES:
            print(" -", f)
        sys.exit(1)
    print("All checks passed.")
