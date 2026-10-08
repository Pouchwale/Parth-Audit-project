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
    midnight and no staff warning comes even when a fake says the day is closing;
  * the words are the STAFF's hours (the owner, 6-Oct-2026: "this statement is
    not valid for superadmin because superadmin can login at any time"): the
    sign-in page's main words say "Staff working hours ... The super admin can
    sign in at any time.", never "DCRS is open" or "it opens again"; signed in,
    the super admin is told they are the staff's hours and that he can keep
    working; staff are told when their hours start again;
  * the super admin's own end of the day (faked): a warning ten minutes before,
    then a clean sign-out with the reason, "Signed out" - "At the end of the
    day (midnight)" in the log, and a sign-in again straight away;
  * a second tab whose clock runs late (held here with the DevTools debugger,
    as Chrome holds a hidden tab's timers and a sleeping laptop holds every
    tab's) never ends the session he has just started again in the first: it
    takes that session up; the server leaves a newer session alone when a tab
    names an older one it is ending (review of 8-Oct-2026);
  * a sign-out's reason is written only where it fits the account: the end of
    the day (midnight) for the super admin, the close of the hours for staff;
  * nobody else's wrong passwords keep the super admin out: eight from another
    computer hold back only that computer (audit M-22), and he signs in at once
    from his own - this PC's two loopback addresses stand in for the two
    computers, and this runs last, as its hold lasts ten minutes;
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
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD", "SeedQA@2026")
ADMIN = os.environ.get("DCRS_ADMIN_EMAIL", "admin@gpp.local")
STAFF = os.environ.get("DCRS_QC_EMAIL", "kapila.barad@gpp.local")  # kept to Quality Control
IST = timezone(timedelta(hours=5, minutes=30))
# Staff refused on Thursday 1 October 2026: their hours, then when they start again (the owner's words of 6-Oct-2026).
OWNER_SENTENCE = "Staff working hours: 8:40 am to 6:20 pm on working days. Today is Thursday, the weekly off; staff hours start again on Friday 2 October at 8:40 am."
# The sign-in page, before anybody is known: whose hours they are, and who they do not hold.
HOURS_SENTENCE = "Staff working hours: 8:40 am to 6:20 pm on working days. The super admin can sign in at any time."
SUPER_ADMIN_ANY_TIME = " The super admin can sign in at any time."
SUPER_ADMIN_LINE = "You are the super admin: these are the staff's hours, and you can keep working at any time."
# Words the owner ruled out on 6-Oct-2026: DCRS itself never closes.
CLOSED_WORDS = ("DCRS is open", "opens again", "DCRS is closed", "DCRS closes", "not open yet", "open now")
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


def super_admin_day_end(moment):
    """Where the super admin's session ends: the factory's next midnight, or the one after for a sign-in in the day's last ten minutes."""
    end = next_midnight_ist(moment)
    return end + timedelta(days=1) if (end - moment.astimezone(IST)).total_seconds() <= 600 else end


def says_closed(text):
    return [w for w in CLOSED_WORDS if w in (text or "")]


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
            "hoursText": HOURS_SENTENCE,
            "todayText": "Today is Thursday, the weekly off; staff hours start again on Friday 2 October at 8:40 am.",
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
        check("...in the factory's time zone, with today and the words for both", hours.get("timeZone") == "Asia/Kolkata" and hours.get("today", {}).get("date") and hours.get("hoursText", "").startswith("Staff working hours: ") and hours.get("todayText"), hours)
        check("...the STAFF's hours, saying the super admin can sign in at any time, and never that DCRS is open or opens again", hours.get("hoursText", "").endswith(SUPER_ADMIN_ANY_TIME) and not says_closed(hours.get("hoursText")) and not says_closed(hours.get("todayText")), hours)
        check("...and nothing about anybody", not any(k in json.dumps(cfg) for k in ("@gpp.local", "email", "userId", "password")), cfg)
        note(f"This server {'HOLDS' if enforced else 'does NOT hold'} the plant to its hours (DCRS_WORKING_HOURS {'unset' if enforced else '=off'}); today: {hours.get('todayText')}")

        # ==================================================================
        print("\n==== The super admin's day ====")
        now = datetime.now(timezone.utc)
        session = (admin_login or {}).get("session") or {}
        ends = parse_iso(session["endsAt"]) if session.get("endsAt") else None
        check("The super admin's session ends at the factory's midnight (the one after, for a sign-in in the day's last ten minutes)", ends is not None and ends == super_admin_day_end(now), (session, super_admin_day_end(now).isoformat()))
        his = (admin_login or {}).get("hours") or {}
        check("...and his answer tells him the hours are the staff's and that he can keep working", his.get("forYou") == SUPER_ADMIN_LINE and his.get("heldToHours") is False and not says_closed(his.get("hoursText")) and not says_closed(his.get("todayText")), his)
        check("...and the browser is not told to sign them out by itself", session.get("signOutAtEnd") is False, session)
        cookie = admin_headers.get("set-cookie", "")
        max_age = next((int(part.split("=")[1]) for part in cookie.split(";") if part.strip().lower().startswith("max-age=")), None)
        check("...and the cookie closes with the day (Max-Age to midnight)", max_age is not None and ends is not None and abs(max_age - (ends - now).total_seconds()) < 30, (max_age, cookie[:40]))

        staff_ctx = new_context(browser)
        s_status, staff_login, s_headers = api_login(staff_ctx, STAFF)
        staff_id = ((staff_login or {}).get("user") or {}).get("id")
        if enforced and not hours.get("openNow"):
            check("Outside the hours, a member of staff is refused with 403 outside-working-hours", s_status == 403 and (staff_login or {}).get("code") == "outside-working-hours", (s_status, staff_login))
            check("...told their hours and when they start again, with the next opening", (staff_login or {}).get("error") == f"{hours.get('hoursText', '').replace(SUPER_ADMIN_ANY_TIME, '')} {hours.get('todayText')}" and (staff_login or {}).get("opensAt") == hours.get("opensAt"), staff_login)
        else:
            check("A member of staff signs in", s_status == 200, (s_status, staff_login))
            st = (staff_login or {}).get("session") or {}
            st_end = parse_iso(st["endsAt"]) if st.get("endsAt") else None
            if enforced:
                closes = parse_iso(hours["closesAt"]) if hours.get("closesAt") else None
                check("...their session ends at the close of today's working hours", st_end is not None and closes is not None and st_end == closes, (st, hours.get("closesAt")))
                check("...and the browser is told to sign them out then", st.get("signOutAtEnd") is True, st)
                check("...and their answer has no line of the super admin's", ((staff_login or {}).get("hours") or {}).get("forYou") is None and ((staff_login or {}).get("hours") or {}).get("heldToHours") is True, (staff_login or {}).get("hours"))
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
        check("On the weekly off the sign-in page's main words say: Staff working hours: 8:40 am to 6:20 pm on working days. The super admin can sign in at any time.", panel.locator("[data-field='hours-text']").inner_text() == HOURS_SENTENCE, panel.inner_text())
        check("...Today is Thursday, the weekly off; staff hours start again on Friday 2 October at 8:40 am.", panel.locator("[data-field='today-text']").inner_text() == "Today is Thursday, the weekly off; staff hours start again on Friday 2 October at 8:40 am.", panel.inner_text())
        check("...that each session ends with the day; nowhere that DCRS is open, closed or opens again", "sign in each day" in panel.inner_text() and not says_closed(panel.inner_text()), panel.inner_text())
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
                offs and all(("weekly off" in t.inner_text() and t.get_attribute("data-open") == "false") or ("adjustment day, worked" in t.inner_text() and t.get_attribute("data-open") == "true") or (t.get_attribute("data-date") in festivals and t.get_attribute("data-open") == "false") for t in offs),
                [t.inner_text() for t in offs],
            )
            check("...said as the staff's hours, with the super admin's own line, and nothing saying DCRS is open or closed", "Staff working hours:" in card.locator("[data-field='plant-hours-now']").inner_text() and card.locator("[data-field='plant-hours-for-you']").inner_text() == SUPER_ADMIN_LINE and not says_closed(card.inner_text()), card.inner_text()[:600])
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
            check("The new hours are saved, and said as the staff's", said.get_attribute("data-ok") == "true" and "staff working hours are now 9:10 am to 5:50 pm" in said.inner_text(), said.inner_text())
            stored = page.evaluate("() => (JSON.parse(localStorage.getItem('dcrs:v1:master') || '{}').workingHours || null)")
            check("...into the master data", stored == {"start": "09:10", "end": "17:50"}, stored)
            ok, h = wait_for_hours(admin_ctx, "09:10", "17:50")
            check("...and the server holds the plant to them within seconds", ok and (h or {}).get("hoursText") == "Staff working hours: 9:10 am to 5:50 pm on working days. The super admin can sign in at any time.", h)
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
                check("A warning ten minutes before the close: Your working hours end at <time>", f"Your working hours end at {close_words}" in text and not says_closed(text), text)
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
            check("...no warning comes, and nothing signs them out", page.locator("[data-section='closing-warning']").count() == 0 and page.locator("[data-section='day-end-warning']").count() == 0 and page.locator(".app-sidebar").count() == 1 and page.locator("#login-email").count() == 0)
        finally:
            ctx.close()

        # ==================================================================
        print("\n==== The super admin's own end of the day (his session's midnight, faked) ====")
        super_admin_day_end_checks(browser, admin_ctx, (admin_login.get("user") or {}).get("id"))

        # ==================================================================
        print("\n==== A second tab whose clock runs late leaves the session he started again alone ====")
        super_admin_second_tab_checks(browser, admin_ctx, (admin_login.get("user") or {}).get("id"))
        session_id_checks(browser, admin_ctx, (admin_login.get("user") or {}).get("id"))

        # ==================================================================
        print("\n==== A sign-out says why only where the reason fits the account ====")
        sign_out_reason_checks(browser, admin_ctx, (admin_login.get("user") or {}).get("id"), can_staff)

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

        # ==================================================================
        # Last: its hold on the stranger's address lasts ten minutes.
        print("\n==== Wrong passwords typed for his address on another computer do not keep the super admin out ====")
        throttle_checks(browser)

        check("No JavaScript errors on any page", not PAGE_ERRORS, PAGE_ERRORS[:3])
        browser.close()


def super_admin_day_end_checks(browser, admin_ctx, admin_id):
    """The super admin's session ends with its day (the factory's midnight). Faked to end in minutes: warned in his own
    words, then signed out cleanly with the reason, and in again at once (the hours never hold him)."""
    ctx = new_context(browser)
    page = new_page(ctx)
    try:
        ending = {"in": 9 * 60}

        def fake_day_end(route):
            response = route.fetch()
            body = response.json()
            if response.status == 200 and isinstance(body, dict):
                body["session"] = {"endsAt": (datetime.now(timezone.utc) + timedelta(seconds=ending["in"])).isoformat(timespec="milliseconds").replace("+00:00", "Z"), "signOutAtEnd": False, "now": iso_now()}
                ending["endsAt"] = body["session"]["endsAt"]
            route.fulfill(response=response, json=body)

        page.route("**/api/auth/login", fake_day_end)
        check("The super admin signs in with his day's session ending in nine minutes (faked)", sign_in(page, ADMIN))
        page.wait_for_selector("[data-section='day-end-warning']", timeout=15000)
        warn = page.locator("[data-section='day-end-warning']")
        text = warn.inner_text()
        end_words = words(parse_iso(ending["endsAt"]))
        check("He is warned in his own words: Your session for today ends at <time>", f"Your session for today ends at {end_words}" in text and "You will be signed out in 9 minutes" in text and warn.get_attribute("data-minutes-left") == "9", text)
        check("...told to sign in again straight away to keep working, the staff's hours not holding him; never that DCRS closes", "Sign in again straight away to keep working" in text and "do not hold you" in text and not says_closed(text), text)
        check("...with no staff warning beside it", page.locator("[data-section='closing-warning']").count() == 0)
        warn.locator("[data-action='day-end-warning-ok']").click()
        page.wait_for_timeout(300)
        check("OK puts it aside", page.locator("[data-section='day-end-warning']").count() == 0)
        sign_out(page)

        ending["in"] = 60
        check("Signed in again with the session ending in a minute (faked)", sign_in(page, ADMIN))
        page.wait_for_selector("#login-email", timeout=70000)
        page.wait_for_selector("[data-section='signed-out-notice']", timeout=10000)
        notice = page.locator("[data-section='signed-out-notice']").inner_text()
        end_words = words(parse_iso(ending["endsAt"]))
        check("At the end the browser signs him out by itself, and the sign-in page says why and that he can sign in again", notice == f"Your session for today ended at {end_words}, the end of the day. Sign in again to keep working — the super admin can sign in at any time.", notice)
        found, lines = wait_for_line(admin_ctx, admin_id, "Signed out", "At the end of the day (midnight)")
        check('...and the log says "Signed out" - "At the end of the day (midnight)"', found, lines)
        page.unroute("**/api/auth/login")
        check("He signs in again at once and carries on", sign_in(page, ADMIN))
    finally:
        ctx.close()


def faked_end(ending):
    """A route handler that keeps the server's answer, its session's own id included, but moves the session's end to
    ending["at"] (ISO) - while that is set."""

    def fake(route):
        response = route.fetch()
        try:
            body = response.json()
        except Exception:
            body = None
        if ending.get("at") and response.status == 200 and isinstance(body, dict) and isinstance(body.get("session"), dict):
            body["session"] = dict(body["session"], endsAt=ending["at"], signOutAtEnd=False, now=iso_now())
            route.fulfill(response=response, json=body)
        else:
            route.fulfill(response=response)

    return fake


def sign_lines(admin_ctx, person_id):
    """The person's "Signed in" and "Signed out" lines, newest first."""
    return [l for l in activity(admin_ctx, person_id) if l.get("action") in ("Signed in", "Signed out")]


def newest_sign_out_since(admin_ctx, person_id, since, seconds=8):
    """The person's newest "Signed out" line written at or after `since` (ISO), waited for; None when none comes."""
    deadline = time.time() + seconds
    while time.time() < deadline:
        for l in activity(admin_ctx, person_id):
            if l.get("action") == "Signed out" and (l.get("at") or "") >= since:
                return l
        time.sleep(0.5)
    return None


def super_admin_second_tab_checks(browser, admin_ctx, admin_id):
    """Two tabs of one browser share its session. Tab B's JavaScript is held (CDP Debugger.pause), as Chrome holds a tab
    hidden for five minutes to one tick a minute and a sleeping laptop holds every tab, while tab A reaches the end of his
    day, signs him out by itself, and he signs in again at once. Released, B finds the end it was told has passed: it must
    take up the new session, never end it (review of 8-Oct-2026: before, B's own sign-out ended it, with a false line)."""
    ctx = new_context(browser)
    try:
        ending = {"at": (datetime.now(timezone.utc) + timedelta(seconds=80)).isoformat(timespec="milliseconds").replace("+00:00", "Z")}
        fake = faked_end(ending)
        ctx.route("**/api/auth/login", fake)
        ctx.route("**/api/auth/me", fake)
        a = new_page(ctx)
        check("Tab A: the super admin signs in, his day's session ending in about a minute (faked)", sign_in(a, ADMIN))
        first = page_fetch(a, "/api/auth/me")
        first_id = ((first.get("body") or {}).get("session") or {}).get("id")
        b = new_page(ctx)
        b.goto(f"{BASE}/index.html#/dashboard")
        b.wait_for_selector(".app-sidebar", timeout=60000)
        b.wait_for_timeout(800)
        dismiss(b)
        close_assistant(b)
        cdp = ctx.new_cdp_session(b)
        cdp.send("Debugger.enable")
        cdp.send("Debugger.pause")
        a.wait_for_selector("[data-section='signed-out-notice']", timeout=90000)
        check("Tab A signs him out by itself at the end of his day, while tab B's clock is held", a.locator("#login-email").count() == 1)
        # From here on, the server's own answers: the new session runs to the factory's midnight.
        ending["at"] = None
        ctx.unroute("**/api/auth/login")
        ctx.unroute("**/api/auth/me")
        type_sign_in(a, ADMIN)
        a.wait_for_selector(".app-sidebar", timeout=60000)
        a.wait_for_timeout(800)
        dismiss(a)
        close_assistant(a)
        again = page_fetch(a, "/api/auth/me")
        new_id = ((again.get("body") or {}).get("session") or {}).get("id")
        check("...and he signs in again at once in tab A", again["status"] == 200, again["status"])
        cdp.send("Debugger.resume")
        cdp.detach()
        # B's clock runs again: its overdue tick finds the end it was told has passed.
        b.wait_for_timeout(8000)
        a.wait_for_timeout(3000)
        still = page_fetch(a, "/api/auth/me")
        still_id = ((still.get("body") or {}).get("session") or {}).get("id")
        check("Released, tab B leaves the session he has just started alone: it is still open", still["status"] == 200 and still_id == new_id, (still["status"], new_id, still_id))
        check("...tab A stays in the app", a.locator(".app-sidebar").count() == 1 and a.locator("#login-email").count() == 0)
        check("...and tab B takes the new session up and carries on, rather than showing the sign-in page", b.locator(".app-sidebar").count() == 1 and b.locator("#login-email").count() == 0)
        lines = sign_lines(admin_ctx, admin_id)
        check('...and no "Signed out" line is written for his new session', bool(lines) and lines[0].get("action") == "Signed in", [(l.get("at"), l.get("action"), l.get("detail")) for l in lines[:4]])
        check("(the two sessions are told apart by their ids)", bool(first_id) and bool(new_id) and first_id != new_id, (first_id, new_id))
    finally:
        ctx.close()


def session_id_checks(browser, admin_ctx, admin_id):
    """The server's side of it: a sign-out that names the session it ends leaves another session of the browser alone."""
    c = new_context(browser)
    try:
        status, body, _ = api_login(c, ADMIN)
        sid = ((body or {}).get("session") or {}).get("id")
        check("A session's answer names the session (an id of its own), for a tab to name when it ends it by itself", status == 200 and isinstance(sid, str) and len(sid) >= 16, (status, (body or {}).get("session")))
        since = iso_now()
        r = c.request.post(f"{BASE}/api/auth/logout", data={"reason": "end-of-day", "sessionId": "an-older-session-of-this-browser"})
        me = c.request.get(f"{BASE}/api/auth/me")
        check("A tab ending an older session by its id leaves the browser's newer one open", r.status == 204 and me.status == 200, (r.status, me.status))
        check("...and writes no line for it", newest_sign_out_since(admin_ctx, admin_id, since, seconds=3) is None)
        r = c.request.post(f"{BASE}/api/auth/logout", data={"reason": "end-of-day", "sessionId": sid or "no-id"})
        me = c.request.get(f"{BASE}/api/auth/me")
        check("...while a tab ending this very session ends it", r.status == 204 and me.status == 401, (r.status, me.status))
        line = newest_sign_out_since(admin_ctx, admin_id, since)
        check('...with its line: "Signed out" - "At the end of the day (midnight)"', line is not None and line.get("detail") == "At the end of the day (midnight)", line)
    finally:
        c.close()


def sign_out_reason_checks(browser, admin_ctx, admin_id, can_staff):
    """A sign-out's reason is written only where it fits the account (review of 8-Oct-2026): the end of the day (midnight)
    is the super admin's, the close of the working hours staff's; anything else is a plain "Signed out"."""
    c = new_context(browser)
    try:
        if api_login(c, ADMIN)[0] == 200:
            since = iso_now()
            c.request.post(f"{BASE}/api/auth/logout", data={"reason": "end-of-working-hours"})
            line = newest_sign_out_since(admin_ctx, admin_id, since)
            check('The super admin, whom the hours never hold, signing out "at the close of working hours" gets a plain "Signed out"', line is not None and line.get("detail") == "", line)
        else:
            check("The super admin signs in, to sign out with staff's reason", False)
    finally:
        c.close()
    if not can_staff:
        note("Staff cannot be signed in on this server now: a member of staff signing out with the super admin's reason was not tried.")
        return
    s = new_context(browser)
    try:
        st, body, _ = api_login(s, STAFF)
        person = ((body or {}).get("user") or {}).get("id")
        if st == 200 and person:
            since = iso_now()
            s.request.post(f"{BASE}/api/auth/logout", data={"reason": "end-of-day"})
            line = newest_sign_out_since(admin_ctx, person, since)
            check('A member of staff signing out "at the end of the day (midnight)", the super admin\'s reason alone, gets a plain "Signed out"', line is not None and line.get("detail") == "", line)
        else:
            check("A member of staff signs in, to sign out with the super admin's reason", False, (st, body))
    finally:
        s.close()


def throttle_checks(browser):
    """Eight wrong passwords for the super admin's address from one computer hold back only that computer (review of
    8-Oct-2026; audit M-22): he signs in at once from his own, through the API and the sign-in page. This PC's IPv4
    loopback stands in for the stranger's computer, its IPv6 loopback for his: the server sees two addresses."""
    parts = urlsplit(BASE)
    if parts.hostname not in ("localhost", "127.0.0.1", "::1"):
        note(f"{BASE} is another computer: the check needs this computer's two loopback addresses, and was not run.")
        return
    port = parts.port or (443 if parts.scheme == "https" else 80)
    stranger_base = f"{parts.scheme}://127.0.0.1:{port}"
    his_base = f"{parts.scheme}://[::1]:{port}"
    probe = browser.new_context()
    try:
        try:
            reachable = probe.request.get(f"{his_base}/api/health").status == 200
        except Exception:
            reachable = False
    finally:
        probe.close()
    if not reachable:
        note("The server does not answer on this computer's IPv6 loopback, so two computers cannot be told apart here: not run.")
        return
    stranger = browser.new_context()
    try:
        statuses = [stranger.request.post(f"{stranger_base}/api/auth/login", data={"email": ADMIN, "password": f"a-wrong-guess-{n}"}).status for n in range(8)]
        check("Eight wrong passwords for the super admin's address from another computer are refused", statuses == [401] * 8, statuses)
        held = stranger.request.post(f"{stranger_base}/api/auth/login", data={"email": ADMIN, "password": SEED_PASSWORD})
        check("...and that computer is then held back, even with the right password (the guard against guessing stays)", held.status == 429, held.status)
    finally:
        stranger.close()
    his = browser.new_context()
    try:
        r = his.request.post(f"{his_base}/api/auth/login", data={"email": ADMIN, "password": SEED_PASSWORD})
        check("...but the super admin signs in from his own computer at once", r.status == 200, (r.status, r.text()[:200]))
    finally:
        his.close()
    ctx = new_context(browser)
    page = new_page(ctx)
    try:
        page.goto(f"{his_base}/index.html")
        page.wait_for_selector("#login-email", timeout=60000)
        page.wait_for_timeout(400)
        type_sign_in(page, ADMIN)
        try:
            page.wait_for_selector(".app-sidebar", timeout=30000)
            opened = True
        except Exception:
            opened = False
        said = page.locator(".auth-error").inner_text() if page.locator(".auth-error").count() else None
        check("...and through the sign-in page too", opened, said)
    finally:
        ctx.close()


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
            check("...and no line of the super admin's", card.locator("[data-field='plant-hours-for-you']").count() == 0)
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
            closes.append(("the day's hours are over", dict(opened, workingHours={"start": "00:00", "end": f"{(minute - 1) // 60:02d}:{(minute - 1) % 60:02d}"}), "Today's staff hours ended at"))
        if minute <= 23 * 60 + 50:
            closes.append(("the day has not opened yet", dict(opened, workingHours={"start": f"{(minute + 5) // 60:02d}:{(minute + 5) % 60:02d}", "end": "23:59"}), "Staff hours start today at"))
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
            a_status, a_body, _ = api_login(admin_try, ADMIN)
            check("...and the super admin is let in", a_status == 200)
            his = (a_body or {}).get("hours") or {}
            check("...told the hours are the staff's and that he can keep working, never that DCRS is closed", his.get("forYou") == SUPER_ADMIN_LINE and not says_closed(his.get("hoursText")) and not says_closed(his.get("todayText")), his)
            t_res = admin_try.request.get(f"{BASE}/api/v1/today")
            t_hours = (t_res.json() or {}).get("workingHours") or {} if t_res.status == 200 else {}
            check("...and what Mitra on the phone is given about today says the same", t_res.status == 200 and t_hours.get("forYou") == SUPER_ADMIN_LINE and t_hours.get("heldToHours") is False and not says_closed(t_hours.get("todayText")), (t_res.status, t_hours))

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
