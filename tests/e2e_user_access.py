"""The super admin's User access dashboard (REQUIREMENTS s84), asked for on 30-Sep-2026.

  "Make sure the super admin has every kind of detail: which user can see what,
   and when each logs in and logs out. ... The super admin has access to every
   module, and can remove or add any user from any module, from a dedicated
   dashboard for it."

This suite checks, against the product server:

  * the page is the super admin's alone: a member of staff has no sidebar entry,
    is told the page is not theirs, and the server refuses them every route
    (403); nobody signed in gets 401;
  * the super admin reaches it from the sidebar and from Users & Access; the
    plant's working hours and where today stands are at the top, exactly as the
    server's gate says them; and it says what "signed in now" rests on;
  * every account with its modules as switches: the super admin's own cannot be
    changed, a person's last module cannot be switched off, and the documents a
    person can see are counted and listed on opening them;
  * a module switched ON for Kapila Barad (Quality Control) - Human Resources -
    is hers at her next sign-in; switched OFF again (asked first; "No, leave it"
    changes nothing) it is refused her by name at the sign-in after;
  * each of her sign-ins and sign-outs is on the page with its time: today's
    first sign-in and last sign-out beside her name, and every session in the
    history with the times the activity log holds; the super admin shows as
    signed in now, Kapila as signed out;
  * a failed sign-in (a wrong password, and an address with no account) is
    listed with the address typed and why;
  * the history downloads as a CSV file holding the same sessions and attempts,
    and the download is a line in the activity log, as is every change of
    modules;
  * no JavaScript errors.

Against the product server on :8843 (DCRS_BASE overrides it) with the plant's
seeded accounts on SEED_ACCOUNT_PASSWORD (DCRS_SEED_PASSWORD overrides it).
Kapila's modules are put back to Quality Control alone at the end, whatever
happened, because the other product-server suites rely on them.
"""
import csv
import datetime
import io
import os
import re
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD", "SeedQA@2026")
ADMIN = "admin@gpp.local"
KAPILA = "kapila.barad@gpp.local"  # kept to Quality Control
SANDEEP = "sandeep.parekh@gpp.local"  # kept to Human Resources
STAMP = int(time.time())
# Kapila's sessions of THIS run: the product server's other suites sign her in too, some without signing out.
STARTED = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=2)
NOBODY = f"nobody.{STAMP}@gpp.local"
FACTORY = datetime.timezone(datetime.timedelta(hours=5, minutes=30))  # Asia/Kolkata, which has no daylight saving
FAILURES = []
ERRORS = []
ROUTES = ["/api/access/overview", "/api/access/overview?opened=1", "/api/access/history", "/api/access/history.csv"]
CSV_HEADINGS = ["Day", "Time", "Person", "Sign-in address", "What", "Signed out at", "How it ended", "Minutes signed in", "Detail", "Archived"]
# The introduction is its own suite's (tests/e2e_intro_and_fonts.py): here it is marked as seen, so it never covers a click.
NO_INTRO = "try { sessionStorage.setItem('dcrs:intro-seen', '1'); } catch (e) {}"


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


def factory_hm(iso):
    """An ISO moment as the page shows it: HH:MM on the factory's clock."""
    if not iso:
        return ""
    return datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(FACTORY).strftime("%H:%M")


def since_start(iso):
    return bool(iso) and datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")) >= STARTED


def factory_hms(iso):
    if not iso:
        return ""
    return datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(FACTORY).strftime("%H:%M:%S")


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
    btn = page.locator(".app-topbar button[title='Log Out']")
    if btn.count():
        btn.first.click()
        # Every log-out asks about the day's work first (REQUIREMENTS s72).
        page.wait_for_timeout(500)
        ok = page.locator("[data-action='logout-review-confirm']")
        if ok.count():
            ok.first.click()
        page.wait_for_selector("#login-email", timeout=30000)
        page.wait_for_timeout(300)


def sign_in(page, email, password=SEED_PASSWORD):
    """Signs in from wherever the browser is; True when the app opened."""
    before = len(ERRORS)
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(600)
    if page.locator(".app-sidebar").count():
        sign_out(page)
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(300)
    page.fill("#login-email", email)
    page.fill("#login-password", password)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(800)
    dismiss(page)
    close_assistant(page)
    # The sign-in page's own /api/auth/me answers 401 before anybody is signed in: not an error of the app.
    ERRORS[before:] = [e for e in ERRORS[before:] if "401" not in e]
    return True


def try_sign_in(page, email, password):
    """A sign-in that is expected to fail: the words the screen shows."""
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(300)
    page.fill("#login-email", email)
    page.fill("#login-password", password)
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    return page.locator(".auth-error").inner_text() if page.locator(".auth-error").count() else ""


def get(page, path):
    """A GET through the context's own request API: it shares the page's cookies, and a refusal is not a console error."""
    res = page.context.request.get(f"{BASE}{path}")
    text = res.text()
    try:
        body = res.json()
    except Exception:
        body = None
    return {"status": res.status, "body": body, "text": text}


def post(page, path, body):
    return page.evaluate(
        """async ([path, body]) => {
             const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
             let payload = null;
             try { payload = await res.json(); } catch { payload = null; }
             return { status: res.status, body: payload };
           }""",
        [path, body],
    )


def open_access(page):
    page.goto(f"{BASE}/index.html#/access")
    page.wait_for_selector("[data-page='access'][data-state='ready']", timeout=30000)
    page.wait_for_selector("[data-section='access-history'][data-state='ready']", timeout=30000)
    page.wait_for_timeout(300)
    close_assistant(page)


def refresh(page):
    loads = page.get_attribute("[data-section='access-history']", "data-loads")
    page.click("[data-action='access-refresh']")
    page.wait_for_function(
        "n => { const s = document.querySelector(\"[data-section='access-history']\"); return s && s.getAttribute('data-state') === 'ready' && s.getAttribute('data-loads') !== n; }",
        arg=loads,
        timeout=30000,
    )
    page.wait_for_timeout(300)


def wait_shown(page, kind, person=None):
    """Until the history on the screen was read for this kind and person (the section's data-shown)."""
    page.wait_for_function(
        """([kind, person]) => {
             const s = document.querySelector("[data-section='access-history']");
             if (!s || s.getAttribute('data-state') !== 'ready') return false;
             const q = new URLSearchParams(s.getAttribute('data-shown') || '');
             return q.get('kind') === kind && (q.get('person') || '') === person;
           }""",
        arg=[kind, person or ""],
        timeout=30000,
    )
    page.wait_for_timeout(300)


def switch(page, email, code):
    return page.locator(f"[data-table='access-modules'] tr[data-user='{email}'] [data-action='toggle-module'][data-module='{code}']")


def modules_of(page, email):
    users = get(page, "/api/users")
    for u in (users.get("body") or {}).get("users") or []:
        if u.get("email") == email:
            return u.get("departments"), u.get("id")
    return None, None


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = ERRORS

    def new_page(ctx):
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" and "translate" not in m.text.lower() else None)
        return pg

    admin_ctx = browser.new_context(accept_downloads=True)
    admin_ctx.add_init_script(NO_INTRO)
    staff_ctx = browser.new_context()
    staff_ctx.add_init_script(NO_INTRO)
    admin = new_page(admin_ctx)
    staff = new_page(staff_ctx)
    kapila_id = None

    try:
        # ==============================================================
        # 1. The door
        # ==============================================================
        print("\n==== The page is the super admin's alone ====")
        anon = browser.new_context()
        try:
            statuses = [anon.request.get(f"{BASE}{r}").status for r in ROUTES]
        finally:
            anon.close()
        check("Nobody signed in is refused every route (401)", all(s == 401 for s in statuses), statuses)

        sign_in(staff, KAPILA)
        check("A member of staff has no User access in the sidebar", staff.locator(".app-sidebar a[href='#/access']").count() == 0)
        staff.goto(f"{BASE}/index.html#/access")
        staff.wait_for_timeout(1200)
        check("...and the page itself tells her it is the super admin's", staff.locator("[data-page='access'][data-state='not-admin']").count() == 1)
        refused = [get(staff, r) for r in ROUTES]
        check("...as does the server, on every route (403)", all(r["status"] == 403 for r in refused), [r["status"] for r in refused])
        check("...saying whose it is", all("super admin" in ((r.get("body") or {}).get("error") or "") for r in refused), refused[0])
        check("...and nothing of the page's is in what she was sent", all("people" not in (r.get("body") or {}) for r in refused))
        staff.goto(f"{BASE}/index.html#/hr")
        staff.wait_for_timeout(1500)
        close_assistant(staff)
        check("Before any change, Human Resources is refused her by name", staff.locator("[data-state='not-your-department']").count() >= 1, staff.locator(".app-content").inner_text()[:300])
        sign_out(staff)

        # ==============================================================
        # 2. The super admin's page
        # ==============================================================
        print("\n==== The super admin's page ====")
        sign_in(admin, ADMIN)
        check("The super admin has User access in the sidebar", admin.locator(".app-sidebar a[href='#/access']").count() == 1)
        admin.goto(f"{BASE}/index.html#/users")
        admin.wait_for_selector("[data-page='users']", timeout=30000)
        admin.wait_for_timeout(500)
        check("...and a way to it from Users & Access", admin.locator("[data-page='users'] a[href='#/access']").count() == 1)
        admin.click("[data-page='users'] a[href='#/access']")
        admin.wait_for_selector("[data-page='access'][data-state='ready']", timeout=30000)
        admin.wait_for_selector("[data-section='access-history'][data-state='ready']", timeout=30000)
        admin.wait_for_timeout(400)
        close_assistant(admin)
        check("It opens", admin.locator("[data-page='access'][data-state='ready']").count() == 1)
        public = get(admin, "/api/auth/config").get("body") or {}
        plant = public.get("hours") or {}
        strip = admin.locator("[data-section='access-hours']")
        strip_text = strip.inner_text() if strip.count() else ""
        check(
            "The working hours and where today stands are at the top, as the server's gate says them",
            strip.count() == 1 and bool(plant.get("hoursText")) and plant.get("hoursText") in strip_text and strip.get_attribute("data-day-kind") == (plant.get("today") or {}).get("kind"),
            (strip_text, plant.get("hoursText"), plant.get("todayText")),
        )
        check(
            "...said as the staff's hours, with the super admin's own line that he can keep working, never that DCRS is open, closed or opens again",
            strip.count() == 1
            and admin.locator("[data-section='access-hours'] [data-field='hours-for-you']").inner_text() == "You are the super admin: these are the staff's hours, and you can keep working at any time."
            and not any(w in strip_text for w in ("DCRS is open", "opens again", "DCRS is closed", "not open yet")),
            strip_text,
        )
        check(
            "...and whether this server holds anybody to them",
            strip.count() == 1 and strip.get_attribute("data-enforced") == ("yes" if plant.get("enforced") else "no") and (("DCRS_WORKING_HOURS=off" in strip_text) != bool(plant.get("enforced"))),
            (strip.get_attribute("data-enforced") if strip.count() else None, plant.get("enforced")),
        )
        rests = admin.locator("[data-field='now-rests-on']").inner_text() if admin.locator("[data-field='now-rests-on']").count() else ""
        check("It says what 'signed in now' rests on", "30 minutes" in rests and "activity log" in rests and "not signed out since" in rests, rests)

        overview = get(admin, "/api/access/overview")
        ov = overview.get("body") or {}
        emails = [p_.get("email") for p_ in ov.get("people") or []]
        check("The server hands the super admin every account", overview["status"] == 200 and all(e in emails for e in (ADMIN, KAPILA, SANDEEP, "vinay.bhojak@gpp.local")), emails)
        # The admins first, by name — and on this run's database the demo server's first sign-up is an admin too
        # (insertUser makes the first account one), so "Playwright QA" may stand before "Super Admin".
        roles = [p_.get("role") for p_ in ov.get("people") or []]
        admins = roles.count("admin")
        check("...the super admin first, with any other admin", ADMIN in emails[:admins] and "admin" not in roles[admins:], list(zip(emails, roles)))
        check(
            "...and nothing of anybody's password: no hash, no password",
            "password_hash" not in overview["text"] and "$2a$" not in overview["text"] and "$2b$" not in overview["text"] and SEED_PASSWORD not in overview["text"],
        )
        me = next((p_ for p_ in ov.get("people") or [] if p_.get("email") == ADMIN), {})
        check("The super admin shows as signed in now", me.get("now") == "signed-in" and admin.locator(f"[data-table='access-today'] tr[data-user='{ADMIN}'][data-now='signed-in']").count() == 1, me.get("now"))

        # ---- the modules ----
        kap_row = admin.locator(f"[data-table='access-modules'] tr[data-user='{KAPILA}']")
        check("Kapila's line holds a switch per module (ten) and one for every module", kap_row.locator("[data-action='toggle-module']").count() == 10 and kap_row.locator("[data-action='toggle-every-module']").count() == 1)
        check("...Quality Control on, Human Resources off", switch(admin, KAPILA, "QC").get_attribute("aria-checked") == "true" and switch(admin, KAPILA, "HR").get_attribute("aria-checked") == "false")
        check("...and her only module cannot be switched off (none would mean every module)", switch(admin, KAPILA, "QC").is_disabled())
        admin_row = admin.locator(f"[data-table='access-modules'] tr[data-user='{ADMIN}']")
        check(
            "The super admin's own line is every module, and cannot be changed",
            admin_row.get_attribute("data-modules") == "every"
            and admin_row.locator("[data-action='toggle-every-module']").get_attribute("aria-checked") == "true"
            and all(admin_row.locator("[role='switch']").nth(i).is_disabled() for i in range(admin_row.locator("[role='switch']").count())),
        )
        seen_before = int(kap_row.locator("[data-field='documents-seen']").get_attribute("data-count") or "0")
        all_docs = int(admin_row.locator("[data-field='documents-seen']").get_attribute("data-count") or "0")
        check("She sees fewer documents than the super admin, who sees them all", 0 < seen_before < all_docs, (seen_before, all_docs))
        kap_row.locator("[data-action='open-person-documents']").click()
        admin.wait_for_selector("[data-section='access-person']", timeout=10000)
        admin.wait_for_timeout(500)
        person = admin.locator("[data-section='access-person']")
        check("Opening her lists the documents she can see", person.get_attribute("data-count") == str(seen_before) and person.locator("[data-document='qc-bopp-film']").count() == 1, person.get_attribute("data-count"))
        check("...by module, Quality Control's and none of Human Resources'", person.locator("[data-module='QC']").count() == 1 and person.locator("[data-module='HR']").count() == 0 and person.locator("[data-document='daily-pest-monitoring']").count() == 0)
        admin.click(".modal-box button:has-text('Close')")
        admin.wait_for_timeout(300)

        # ==============================================================
        # 3. A module switched on
        # ==============================================================
        print("\n==== A module switched on ====")
        switch(admin, KAPILA, "HR").click()
        admin.wait_for_selector("[data-section='access-note']", timeout=15000)
        admin.wait_for_timeout(400)
        deps, kapila_id = modules_of(admin, KAPILA)
        check("Switching Human Resources on for Kapila needs no question, and the server has it", sorted(deps or []) == ["HR", "QC"], deps)
        check("...the switch says so", switch(admin, KAPILA, "HR").get_attribute("aria-checked") == "true")
        check("...Quality Control can be switched off again now that it is not her only one", not switch(admin, KAPILA, "QC").is_disabled())
        seen_with = int(kap_row.locator("[data-field='documents-seen']").get_attribute("data-count") or "0")
        check("...and she now sees more documents", seen_with > seen_before, (seen_before, seen_with))

        sign_in(staff, KAPILA)
        staff.goto(f"{BASE}/index.html#/hr")
        staff.wait_for_timeout(1800)
        close_assistant(staff)
        check("At her next sign-in, Human Resources opens for her", staff.locator("[data-page='hr-overview']").count() == 1 and staff.locator("[data-state='not-your-department']").count() == 0, staff.locator(".app-content").inner_text()[:300])
        staff.goto(f"{BASE}/index.html#/document/daily-pest-monitoring")
        staff.wait_for_timeout(1800)
        close_assistant(staff)
        check("...and an HR document with it", staff.locator("[data-page='document-records']").count() == 1, staff.locator(".app-content").inner_text()[:300])
        sign_out(staff)

        # ==============================================================
        # 4. The module switched off - asked first
        # ==============================================================
        print("\n==== The module switched off ====")
        open_access(admin)
        switch(admin, KAPILA, "HR").click()
        admin.wait_for_selector("[data-section='confirm-module-change']", timeout=10000)
        asked = admin.locator("[data-section='confirm-module-change']").inner_text()
        check("Switching a module off asks first, naming the person and the module", "Kapila Barad" in asked and "Human Resources" in asked and "Nothing is deleted" in asked, asked)
        admin.click("[data-action='cancel-module-change']")
        admin.wait_for_timeout(500)
        deps, _ = modules_of(admin, KAPILA)
        check("'No, leave it' changes nothing", sorted(deps or []) == ["HR", "QC"] and switch(admin, KAPILA, "HR").get_attribute("aria-checked") == "true", deps)
        switch(admin, KAPILA, "HR").click()
        admin.wait_for_selector("[data-action='confirm-module-change']", timeout=10000)
        admin.click("[data-action='confirm-module-change']")
        admin.wait_for_selector("[data-section='access-note']", timeout=15000)
        admin.wait_for_timeout(500)
        deps, _ = modules_of(admin, KAPILA)
        check("Confirmed, she is Quality Control's alone again", deps == ["QC"], deps)
        check("...the switch says so, and her last module is locked again", switch(admin, KAPILA, "HR").get_attribute("aria-checked") == "false" and switch(admin, KAPILA, "QC").is_disabled())

        sign_in(staff, KAPILA)
        staff.goto(f"{BASE}/index.html#/hr")
        staff.wait_for_timeout(1800)
        close_assistant(staff)
        check("At her next sign-in Human Resources is refused her by name again", staff.locator("[data-state='not-your-department']").count() >= 1 and staff.locator("[data-page='hr-overview']").count() == 0, staff.locator(".app-content").inner_text()[:300])
        staff.goto(f"{BASE}/index.html#/document/qc-bopp-film")
        staff.wait_for_timeout(1800)
        close_assistant(staff)
        check("...while Quality Control's documents still open", staff.locator("[data-page='document-records']").count() == 1)
        sign_out(staff)

        # ==============================================================
        # 5. Failed sign-ins
        # ==============================================================
        print("\n==== Failed sign-ins ====")
        said = try_sign_in(staff, SANDEEP, "NotHisPassword1")
        check("A wrong password is refused at the door", "invalid" in said.lower(), said)
        said = try_sign_in(staff, NOBODY, "Whatever@2026")
        check("...and so is an address with no account", "invalid" in said.lower(), said)
        # The failed sign-ins' own 401s are the point of this step, not errors.
        errors[:] = [e for e in errors if "401" not in e]

        # ==============================================================
        # 6. Today, on the page
        # ==============================================================
        print("\n==== Today ====")
        open_access(admin)
        refresh(admin)
        ov = get(admin, "/api/access/overview").get("body") or {}
        kap = next((p_ for p_ in ov.get("people") or [] if p_.get("email") == KAPILA), {})
        today = kap.get("today") or {}
        check("The server counts her three sign-ins and three sign-outs today", today.get("signIns", 0) >= 3 and today.get("signOuts", 0) >= 3, today)
        check("...and says she is signed out now", kap.get("now") == "signed-out", kap.get("now"))
        row = admin.locator(f"[data-table='access-today'] tr[data-user='{KAPILA}']")
        first_cell = row.locator("[data-field='first-sign-in']")
        last_cell = row.locator("[data-field='last-sign-out']")
        check(
            "Her line shows today's first sign-in with its time",
            first_cell.get_attribute("data-at") == today.get("firstSignIn") and first_cell.inner_text().strip() == factory_hm(today.get("firstSignIn")),
            (first_cell.get_attribute("data-at"), first_cell.inner_text(), today.get("firstSignIn")),
        )
        check(
            "...and her last sign-out with its time",
            last_cell.get_attribute("data-at") == today.get("lastSignOut") and last_cell.inner_text().strip().startswith(factory_hm(today.get("lastSignOut"))),
            (last_cell.get_attribute("data-at"), last_cell.inner_text(), today.get("lastSignOut")),
        )
        check("...and that she is signed out", row.get_attribute("data-now") == "signed-out" and "Signed out" in row.locator("[data-field='now']").inner_text())
        sandeep_row = admin.locator(f"[data-table='access-today'] tr[data-user='{SANDEEP}']")
        failed_words = sandeep_row.locator("[data-field='attempts']").inner_text()
        check(
            "Sandeep's line shows his failed sign-ins of today",
            re.search(r"\b(\d+) failed\b", failed_words) is not None and int(re.search(r"(\d+) failed", failed_words).group(1)) == (next((p_ for p_ in ov.get("people") or [] if p_.get("email") == SANDEEP), {}).get("today") or {}).get("failed"),
            (failed_words, sandeep_row.inner_text()),
        )
        attempts = admin.locator("[data-table='access-attempts'] tbody tr")
        texts = attempts.evaluate_all("els => els.map((e) => e.textContent)")
        check("Today's failed sign-ins are listed with the address typed and why", any(SANDEEP in t and "Wrong password" in t for t in texts) and any(NOBODY in t and "No such account" in t for t in texts), texts[:5])
        nobody_row = admin.locator(f"[data-table='access-attempts'] tr[data-address='{NOBODY}']")
        check("...an address with no account says so", nobody_row.count() == 1 and "No such account" in nobody_row.inner_text())
        signed_now = admin.locator("[data-field='signed-in-now']").get_attribute("data-value")
        check("The figures at the top count who is signed in now", signed_now is not None and int(signed_now) >= 1, signed_now)

        # ==============================================================
        # 7. Her sign-ins and sign-outs over a span
        # ==============================================================
        print("\n==== The history ====")
        activity = get(admin, f"/api/activity?person={kapila_id}&limit=200").get("body") or {}
        ins = sorted(l["at"] for l in activity.get("lines") or [] if l.get("action") == "Signed in" and since_start(l["at"]))
        outs = sorted(l["at"] for l in activity.get("lines") or [] if l.get("action") == "Signed out" and since_start(l["at"]))
        admin.select_option("[data-field='history-person']", kapila_id)
        wait_shown(admin, "all", kapila_id)
        rows = admin.locator("[data-table='access-history'] tbody tr[data-kind='session']")
        every_row = rows.evaluate_all("els => els.map((e) => [e.getAttribute('data-user'), e.getAttribute('data-at'), e.getAttribute('data-signed-out-at'), e.querySelector(\"[data-field='signed-in']\").textContent.trim(), e.querySelector(\"[data-field='signed-out']\").textContent.trim(), e.querySelector(\"[data-field='ended']\").textContent.trim()])")
        check("Choosing Kapila lists her sessions only", len(every_row) >= 3 and all(s[0] == KAPILA for s in every_row), every_row[:4])
        shown = [s for s in every_row if since_start(s[1])]
        check("...one for every sign-in the activity log holds", sorted(s[1] for s in shown) == ins, (sorted(s[1] for s in shown), ins))
        check("...each paired with its sign-out", sorted(s[2] for s in shown) == outs and all(s[5] == "Signed out" for s in shown), (sorted(s[2] for s in shown), outs))
        check("...with the times shown on the factory's clock", all(s[3] == factory_hm(s[1]) and s[4] == factory_hm(s[2]) for s in shown), shown[:3])
        check("...newest first", [s[1] for s in shown] == sorted((s[1] for s in shown), reverse=True))

        admin.select_option("[data-field='history-person']", "")
        admin.click("[data-field='history-kind'] [data-kind='attempts']")
        wait_shown(admin, "attempts")
        kinds = admin.locator("[data-table='access-history'] tbody tr").evaluate_all("els => els.map((e) => [e.getAttribute('data-kind'), e.getAttribute('data-user'), e.textContent])")
        check("'Refused and failed' lists the failed sign-ins, for everybody", any(k[0] == "failed" and k[1] == SANDEEP and "Wrong password" in k[2] for k in kinds) and any(k[0] == "failed" and k[1] == NOBODY and "No such account" in k[2] for k in kinds), kinds[:5])
        check("...and nothing else", all(k[0] in ("failed", "refused") for k in kinds), [k[0] for k in kinds])

        # ==============================================================
        # 8. The CSV file
        # ==============================================================
        print("\n==== The CSV file ====")
        admin.click("[data-field='history-kind'] [data-kind='all']")
        wait_shown(admin, "all")
        with admin.expect_download(timeout=30000) as dl:
            admin.click("[data-action='access-history-csv']")
        download = dl.value
        path = download.path()
        raw = open(path, "rb").read()
        text = raw.decode("utf-8-sig")
        table = list(csv.reader(io.StringIO(text)))
        check("The history downloads as a CSV file Excel reads (a byte-order mark first)", raw[:3] == b"\xef\xbb\xbf" and download.suggested_filename.endswith(".csv"), download.suggested_filename)
        check("...headed in plain words", table and table[0] == CSV_HEADINGS, table[0] if table else None)
        body = table[1:]
        this_run = {factory_hms(i) for i in ins}
        kap_sessions = [r for r in body if len(r) == 10 and r[3] == KAPILA and r[4] == "Signed in" and r[1] in this_run]
        check(
            "...holding each of Kapila's sessions with its sign-in and sign-out times",
            sorted(r[1] for r in kap_sessions) == sorted(factory_hms(i) for i in ins) and sorted(r[5] for r in kap_sessions) == sorted(factory_hms(o) for o in outs) and all(r[6] == "Signed out" for r in kap_sessions),
            (kap_sessions[:3], [factory_hms(i) for i in ins]),
        )
        check("...and the failed sign-ins, with why", any(r[3] == SANDEEP and r[4] == "Sign-in failed" and r[8] == "Wrong password" for r in body) and any(r[3] == NOBODY and r[2] == "No such account" for r in body))
        today_words = datetime.datetime.now(FACTORY).strftime("%d-%b-%Y")
        check("...each row dated as the app writes a date", all(r[0] for r in body) and any(r[0] == today_words for r in body), (today_words, body[:1]))

        # ==============================================================
        # 9. The activity log
        # ==============================================================
        print("\n==== The activity log ====")
        mine = get(admin, "/api/activity?q=User%20access&limit=50").get("body") or {}
        actions = [l.get("action") for l in mine.get("lines") or []]
        check("Opening the page is a line in the activity log", "User access opened" in actions, actions[:6])
        check("...and so is the CSV taken away", "User access exported" in actions, actions[:6])
        changed = get(admin, "/api/activity?q=Department%20access%20changed&limit=50").get("body") or {}
        kap_changes = [l for l in changed.get("lines") or [] if l.get("action") == "Department access changed" and "Kapila Barad" in (l.get("target") or "")]
        check("Each change of her modules is a line, saying from what to what", len(kap_changes) >= 2 and any("QC, HR" in (l.get("detail") or "") for l in kap_changes), [l.get("detail") for l in kap_changes][:3])

        # ==============================================================
        # 10. On a phone, and the errors
        # ==============================================================
        print("\n==== On a phone ====")
        admin.set_viewport_size({"width": 390, "height": 844})
        admin.reload()
        admin.wait_for_selector("[data-page='access'][data-state='ready']", timeout=30000)
        admin.wait_for_timeout(800)
        close_assistant(admin)
        # What of this page reaches past the screen, other than inside a box that scrolls on its own.
        wide = admin.evaluate(
            """() => {
                 const found = [];
                 for (const el of document.querySelectorAll("[data-page='access'], [data-page='access'] *")) {
                   const r = el.getBoundingClientRect();
                   if (r.width === 0 || r.right <= window.innerWidth + 2) continue;
                   let boxed = false;
                   for (let a = el.parentElement; a; a = a.parentElement) {
                     const o = getComputedStyle(a).overflowX;
                     if ((o === 'auto' || o === 'scroll' || o === 'hidden') && a.getBoundingClientRect().right <= window.innerWidth + 2) { boxed = true; break; }
                   }
                   if (!boxed) found.push(`${el.tagName}.${el.className} ${Math.round(r.right)}`);
                 }
                 return found;
               }"""
        )
        check("At 390 px nothing on the page reaches past the screen (the tables scroll in their own boxes)", not wide, wide[:5])
        admin.set_viewport_size({"width": 1280, "height": 800})

        check("No JavaScript errors", len(errors) == 0, errors[:5])
    finally:
        # Kapila is Quality Control's alone, as the other product-server suites expect.
        try:
            if kapila_id is None:
                _, kapila_id = modules_of(admin, KAPILA)
            if kapila_id:
                put_back = post(admin, f"/api/users/{urllib.parse.quote(kapila_id)}/departments", {"departments": ["QC"]})
                if put_back.get("status") != 200:
                    print("    could not put Kapila back to QC:", put_back)
        except Exception as exc:  # the admin page may be signed out after a failure
            print("    could not put Kapila back to QC:", exc)
        browser.close()

print(f"\n{'ALL PASSED' if not FAILURES else f'{len(FAILURES)} FAILED'}")
sys.exit(1 if FAILURES else 0)
