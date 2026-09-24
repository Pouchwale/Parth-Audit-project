"""Nobody creates their own account: the administrator makes them
(REQUIREMENTS s66), asked for on 23-Sep-2026.

  "keep login portal only for now for superadmin and everyone else also and in
   superadmin keep one access like for example i will access to all QC
   documents to kapila barad like wise i will only give access to anyone from
   superadmin according so they will login and continue there work."

Run against the PRODUCT server on :8843 - the same build and database as every
other suite, started without the test flags, so it is the portal exactly as a
plant installs it: no Demo Mode (s65) and no way to register. The runner seeds
the plant's named accounts there on a password this suite knows.

  * the sign-in screen offers no way to create an account - no tab, no link -
    and says who to ask instead;
  * POST /api/auth/signup is refused with 403 and that same plain sentence,
    whatever is sent, and GET /api/auth/config says signup is false;
  * the super admin signs in and has Users & Access; a member of staff has
    neither the link, nor the page, nor the accounts from the server;
  * the administrator adds "Meena Joshi" with Quality Control ticked, and the
    same address a second time is refused;
  * she signs in on the password she was given, is made to choose her own
    before anything opens - the pop-up cannot be dismissed, and the server
    refuses her the records until she has - and then sees QC's documents and is
    refused another department's by name;
  * her password is reset: the one she chose stops working, the new one lets her
    in and asks her to choose again;
  * her account is switched off: she cannot sign in and is told why, not that
    her password is wrong; switched on again, she can;
  * every one of those is a line in the activity log, and not one of them holds
    a password.

Network-independent, against the production build on :8843.
"""
import sys
import time
import uuid

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8843"
# What scripts/run-e2e.ts gives the product server as SEED_ACCOUNT_PASSWORD.
SEED_PASSWORD = "SeedQA@2026"
ADMIN = "admin@gpp.local"
# The person the administrator adds during the run. A fresh address every run:
# the accounts outlive a suite (the runner only empties the app's own store).
STAMP = int(time.time())
MEENA = f"meena.joshi.{STAMP}@gpp.local"
MEENA_FIRST = "Given@qc41"
MEENA_OWN = "MeenaOwn@2026"
MEENA_RESET = "Reset@qc77"
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


def sign_in(page, email, password, expect_password_change=False):
    """Signs in from wherever the browser is. Returns True when the app opened."""
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(600)
    # Somebody is still signed in: the app, or the pop-up of somebody who has not
    # chosen their own password yet - which is all that screen offers besides it.
    forced = page.locator("[data-action='sign-out-instead']")
    if forced.count():
        forced.first.click()
        page.wait_for_timeout(800)
    elif page.locator(".app-sidebar").count():
        sign_out(page)
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(400)
    page.fill("#login-email", email)
    page.fill("#login-password", password)
    page.click("button:has-text('Log In')")
    if expect_password_change:
        page.wait_for_selector("[data-section='password-required']", timeout=30000)
        return False
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(800)
    dismiss(page)
    close_assistant(page)
    return True


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


def post(page, path, body):
    """A request made from the page, so it carries the session cookie."""
    return page.evaluate(
        """async ([path, body]) => {
             const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
             let payload = null;
             try { payload = await res.json(); } catch { payload = null; }
             return { status: res.status, body: payload };
           }""",
        [path, body],
    )


def get_as(browser, email, password, path):
    """The status of a GET made by another account's own session."""
    ctx = browser.new_context()
    try:
        if ctx.request.post(f"{BASE}/api/auth/login", data={"email": email, "password": password}).status != 200:
            return None
        return ctx.request.get(f"{BASE}{path}").status
    finally:
        ctx.close()


def get(page, path):
    return page.evaluate(
        """async (path) => {
             const res = await fetch(path, { credentials: 'same-origin' });
             let payload = null;
             try { payload = await res.json(); } catch { payload = null; }
             return { status: res.status, body: payload };
           }""",
        path,
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ==================================================================
    # 1. The sign-in screen is the only door
    # ==================================================================
    print("\n==== The way in ====")
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(500)
    check("The sign-in screen offers no way to create an account", page.locator("text=Sign up").count() == 0 and page.locator("#signup-name").count() == 0)
    check(
        "...and says who to ask instead",
        page.locator("[data-section='accounts-by-administrator']").count() == 1
        and "administrator" in (page.locator("[data-section='accounts-by-administrator']").text_content() or "").lower(),
    )
    cfg = get(page, "/api/auth/config")
    check("The server says so before anybody signs in: signup is false", cfg["status"] == 200 and (cfg["body"] or {}).get("features", {}).get("signup") is False, cfg)
    check("...and that answer carries nothing about anybody", cfg["status"] == 200 and set((cfg["body"] or {}).keys()) == {"features"}, cfg)

    refused = post(page, "/api/auth/signup", {"name": "Walk In", "email": f"walkin.{STAMP}@example.com", "password": "Walkin@2026"})
    check("Registering is refused by the server, not merely hidden", refused["status"] == 403, refused)
    check("...with the sentence a person can act on", "administrator" in ((refused["body"] or {}).get("error") or "").lower(), refused["body"])

    # ==================================================================
    # 2. The administrator, and the page that is theirs
    # ==================================================================
    print("\n==== Users & Access ====")
    sign_in(page, ADMIN, SEED_PASSWORD)
    check("The super admin signs in", page.locator(".app-sidebar").count() == 1)
    check("Users & Access is in the sidebar", page.locator(".app-sidebar a[href='#/users']").count() == 1)
    page.click(".app-sidebar a[href='#/users']")
    page.wait_for_selector("[data-page='users']", timeout=30000)
    page.wait_for_timeout(600)
    close_assistant(page)
    rows = page.locator("[data-table='users'] tbody tr")
    check("...and lists the plant's accounts", rows.count() >= 4, rows.count())
    check(
        "The administrator's own line says it covers every module",
        (page.locator(f"[data-user='{ADMIN}'] [data-field='access']").text_content() or "").strip() == "Every module",
    )
    check("Nothing of anybody's password is sent to the screen", "password_hash" not in page.content())

    # ---- add Meena Joshi, Quality Control only ----
    page.click("[data-action='add-user']")
    page.wait_for_selector("[data-section='add-user']", timeout=15000)
    page.fill("[data-field='name']", "Meena Joshi")
    page.fill("[data-field='email']", MEENA)
    page.fill("#new-user-password", MEENA_FIRST)
    page.check("[data-section='department-ticks'] [data-department='QC'] [data-field='department']")
    page.click("[data-action='save-user']")
    page.wait_for_timeout(1500)
    added = page.locator(f"[data-user='{MEENA}']")
    check("A person is added with one tick for all of Quality Control", added.count() == 1)
    check(
        "...her line says what she sees, and that she is on a first password",
        added.count() == 1
        and "Quality Control" in (added.locator("[data-field='access']").text_content() or "")
        and "First password" in (added.locator("[data-field='status']").text_content() or ""),
        added.first.text_content() if added.count() else None,
    )
    same = post(page, "/api/users", {"name": "Meena Joshi Again", "email": MEENA.upper(), "password": "Another@2026", "departments": ["QC"]})
    check("The same sign-in address a second time is refused, in any case", same["status"] == 409, same)
    made_admin = post(page, "/api/users", {"name": "Sneaky", "email": f"sneaky.{STAMP}@gpp.local", "password": "Sneaky@2026", "departments": [], "role": "admin"})
    check(
        "An account asked for as an administrator is made staff all the same",
        made_admin["status"] == 201 and (made_admin["body"] or {}).get("user", {}).get("role") == "staff",
        made_admin["body"],
    )
    sign_out(page)

    # ==================================================================
    # 3. Her first sign-in: she must choose her own password
    # ==================================================================
    print("\n==== The first password is hers to choose ====")
    sign_in(page, MEENA, MEENA_FIRST, expect_password_change=True)
    check("She is asked for a password of her own before anything opens", page.locator("[data-section='password-required']").count() == 1)
    check("...and the app is not behind it: no sidebar, nothing loaded", page.locator(".app-sidebar").count() == 0)
    page.click(".modal-overlay")
    page.wait_for_timeout(300)
    check("The pop-up cannot be waved away", page.locator("[data-section='password-required']").count() == 1)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    check("...nor closed with Escape", page.locator("[data-section='password-required']").count() == 1)
    refused_data = get(page, "/api/storage")
    check(
        "The server refuses her the records until she has, and says why",
        refused_data["status"] == 403 and (refused_data["body"] or {}).get("code") == "password-change-required",
        refused_data,
    )
    check("Signing out is the only other way on", page.locator("[data-action='sign-out-instead']").count() == 1)

    # The one she was given will not do a second time.
    page.fill("[data-field='current-password']", MEENA_FIRST)
    page.fill("[data-field='new-password']", MEENA_FIRST)
    page.fill("[data-field='new-password-again']", MEENA_FIRST)
    page.click("[data-action='save-password']")
    page.wait_for_timeout(900)
    check("The password she was given will not do as her own", page.locator("[data-section='password-required']").count() == 1)

    page.fill("[data-field='current-password']", MEENA_FIRST)
    page.fill("[data-field='new-password']", MEENA_OWN)
    page.fill("[data-field='new-password-again']", MEENA_OWN)
    page.click("[data-action='save-password']")
    page.wait_for_selector("[data-action='password-done']", timeout=15000)
    page.click("[data-action='password-done']")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1200)
    dismiss(page)
    close_assistant(page)
    check("With her own password chosen, the app opens", page.locator(".app-sidebar").count() == 1)

    # ==================================================================
    # 4. She sees Quality Control, and nothing else
    # ==================================================================
    print("\n==== What she sees ====")
    check("Users & Access is not hers", page.locator(".app-sidebar a[href='#/users']").count() == 0)
    page.goto(f"{BASE}/index.html#/users")
    page.wait_for_timeout(1200)
    check("...and the page itself refuses her", page.locator("[data-state='not-admin']").count() == 1)
    listed = get(page, "/api/users")
    check("...as does the server, whatever the screen shows", listed["status"] == 403, listed)
    page.goto(f"{BASE}/index.html#/document/qc-bopp-film")
    page.wait_for_timeout(1500)
    close_assistant(page)
    check("A Quality Control document opens for her", page.locator("[data-page='document-records']").count() == 1)
    page.goto(f"{BASE}/index.html#/hr")
    page.wait_for_timeout(1200)
    body = page.locator(".app-content").inner_text().lower()
    check("Human Resources is refused by name, not shown empty", "human resources" in body and ("not" in body or "ask" in body), body[:300])
    sign_out(page)

    # ==================================================================
    # 5. A password reset, and an account switched off
    # ==================================================================
    print("\n==== Reset, and switched off ====")
    sign_in(page, ADMIN, SEED_PASSWORD)
    page.goto(f"{BASE}/index.html#/users")
    page.wait_for_selector("[data-page='users']", timeout=30000)
    page.wait_for_timeout(600)
    close_assistant(page)
    page.click(f"[data-user='{MEENA}'] [data-action='reset-password']")
    page.wait_for_selector("[data-section='confirm-user-action']", timeout=15000)
    page.fill("#reset-password", MEENA_RESET)
    page.click("[data-action='confirm-ask']")
    page.wait_for_timeout(1200)
    check("A reset says what to hand over next", page.locator("[data-section='users-note']").count() == 1)
    sign_out(page)

    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=30000)
    page.fill("#login-email", MEENA)
    page.fill("#login-password", MEENA_OWN)
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    check("The password she chose no longer works", page.locator("#login-email").count() == 1 and page.locator(".app-sidebar").count() == 0)
    sign_in(page, MEENA, MEENA_RESET, expect_password_change=True)
    check("The one the administrator set does, and asks her to choose again", page.locator("[data-section='password-required']").count() == 1)

    sign_in(page, ADMIN, SEED_PASSWORD)
    page.goto(f"{BASE}/index.html#/users")
    page.wait_for_selector("[data-page='users']", timeout=30000)
    page.wait_for_timeout(600)
    close_assistant(page)
    check("The administrator cannot switch off the account they are signed in with", page.locator(f"[data-user='{ADMIN}'] [data-action='switch-off']").count() == 0)
    page.click(f"[data-user='{MEENA}'] [data-action='switch-off']")
    page.wait_for_selector("[data-section='confirm-user-action']", timeout=15000)
    asked = page.locator("[data-section='confirm-user-action']").inner_text().lower()
    check("Switching off says plainly that nothing is deleted", "nothing is deleted" in asked, asked[:200])
    page.click("[data-action='confirm-ask']")
    page.wait_for_timeout(1200)
    check("...and her line says so", (page.locator(f"[data-user='{MEENA}'] [data-field='status']").text_content() or "").strip() == "Switched off")
    sign_out(page)

    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=30000)
    page.fill("#login-email", MEENA)
    page.fill("#login-password", MEENA_RESET)
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    told = page.locator(".auth-error").inner_text().lower() if page.locator(".auth-error").count() else ""
    check("She cannot sign in, and is told why rather than that her password is wrong", "switched off" in told, told or "(no message)")

    sign_in(page, ADMIN, SEED_PASSWORD)
    page.goto(f"{BASE}/index.html#/users")
    page.wait_for_selector("[data-page='users']", timeout=30000)
    page.wait_for_timeout(600)
    close_assistant(page)
    page.click(f"[data-user='{MEENA}'] [data-action='switch-on']")
    page.wait_for_selector("[data-section='confirm-user-action']", timeout=15000)
    page.click("[data-action='confirm-ask']")
    page.wait_for_timeout(1200)
    check("Switched on again, her account is active", (page.locator(f"[data-user='{MEENA}'] [data-field='status']").text_content() or "").strip() != "Switched off")

    # ==================================================================
    # 6. The activity log holds all of it, and no password
    # ==================================================================
    print("\n==== The activity log ====")
    page.goto(f"{BASE}/index.html#/activity")
    page.wait_for_selector("[data-table='activity-log']", timeout=30000)
    page.wait_for_timeout(1200)
    lines = page.locator("[data-table='activity-log'] tbody tr").evaluate_all("els => els.map((e) => e.textContent)")
    joined = " | ".join(lines)
    check("The account being created is a line in it", any("Account created by the administrator" in l and "Meena Joshi" in l for l in lines), joined[:400])
    check("...the password reset as well", any("Password reset by the administrator" in l for l in lines), joined[:400])
    check("...and the account being switched off and on", any("switched off" in l.lower() for l in lines) and any("switched on" in l.lower() for l in lines), joined[:400])
    check("...the sign-up somebody tried is recorded too", any("Sign-up refused" in l for l in lines), joined[:400])
    for secret in (MEENA_FIRST, MEENA_OWN, MEENA_RESET, SEED_PASSWORD):
        check(f"No password is anywhere in the log ({secret[:4]}…)", secret not in joined)

    # ---- kept for ever; archived only on purpose (REQUIREMENTS s75) ----
    print("\n==== The archive ====")
    try:
        page.wait_for_selector("[data-section='activity-archive'][data-count]", timeout=15000)
    except Exception:
        pass
    panel = page.locator("[data-section='activity-archive']")
    check("The super admin sees the archive panel, and on a fresh log nothing is old enough", panel.count() == 1 and panel.get_attribute("data-count") == "0", panel.get_attribute("data-count") if panel.count() else None)
    check("...so the Archive button is off", page.locator("[data-action='activity-archive']").count() == 1 and page.locator("[data-action='activity-archive']").is_disabled())
    check("...the archive is empty, and the preview says why", "The archive is empty." in page.inner_text("[data-field='archive-held']") and "nothing to archive" in page.inner_text("[data-field='archive-preview']"))
    preview = get(page, "/api/activity/archive/preview")
    pv = preview.get("body") or {}
    check("The preview: nothing older than three years by default", preview.get("status") == 200 and pv.get("count") == 0 and pv.get("years") == 3 and len(str(pv.get("cutoff") or "")) == 10, preview)
    moved = post(page, "/api/activity/archive", {"years": 3, "cutoff": pv.get("cutoff")})
    check("Archiving a fresh log moves nothing", moved.get("status") == 200 and (moved.get("body") or {}).get("moved") == 0, moved)
    stale = post(page, "/api/activity/archive", {"years": 3, "cutoff": "2001-01-01"})
    check("...and a cutoff that is not today's is refused", stale.get("status") == 409, stale.get("status"))
    page.goto(f"{BASE}/index.html#/activity")
    page.wait_for_selector("[data-table='activity-log']", timeout=30000)
    page.wait_for_timeout(1200)
    close_assistant(page)
    after = page.locator("[data-table='activity-log'] tbody tr").evaluate_all("els => els.map((e) => e.textContent)")
    check("...writing no 'Activity log archived' line when nothing moved", not any("Activity log archived" in l for l in after))
    shown = page.locator("[data-table='activity-log'] tbody tr").count()
    page.check("[data-field='include-archived']")
    page.wait_for_timeout(1500)
    check("With nothing archived, 'Include archived lines' shows the same lines", page.locator("[data-table='activity-log'] tbody tr").count() == shown and page.locator("tr[data-archived='1']").count() == 0)
    page.uncheck("[data-field='include-archived']")
    page.wait_for_timeout(800)
    check("A department account may not read the archive", get_as(browser, "kapila.barad@gpp.local", SEED_PASSWORD, "/api/activity/with-archive") == 403)

    # ---- a line sent again is written once (REQUIREMENTS s75) ----
    # The browser resends a batch whose answer it never heard; the lines carry
    # the ids they were given when queued, and the log keeps each one once.
    probe = f"resend-probe-{STAMP}"
    batch = {"events": [{"action": "Record opened", "target": probe, "detail": "", "clientId": str(uuid.uuid4())}]}
    first = post(page, "/api/activity", batch)
    again = post(page, "/api/activity", batch)
    found = get(page, f"/api/activity?q={probe}&limit=50")
    written = [l for l in ((found.get("body") or {}).get("lines") or []) if l.get("target") == probe]
    check("A line sent twice, its answer lost the first time, is written once", first.get("status") == 204 and again.get("status") == 204 and len(written) == 1, (first.get("status"), again.get("status"), len(written)))
    bare = {"events": [{"action": "Record opened", "target": probe + "-bare", "detail": ""}]}
    post(page, "/api/activity", bare)
    post(page, "/api/activity", bare)
    found = get(page, f"/api/activity?q={probe}-bare&limit=50")
    check("...while a line with no id is written each time it is sent, as before", len([l for l in ((found.get("body") or {}).get("lines") or []) if l.get("target") == probe + "-bare"]) == 2)

    # ---- on a phone (REQUIREMENTS s75) ----
    page.set_viewport_size({"width": 390, "height": 844})
    for route in ("#/activity", "#/dashboard"):
        page.goto(f"{BASE}/index.html{route}")
        page.wait_for_timeout(1500)
        dismiss(page)
        close_assistant(page)
        width = page.evaluate("() => document.documentElement.scrollWidth")
        check(f"At phone width {route} does not scroll sideways", width <= 390, width)
    check("...and every control of the top bar is still there to press", all(page.locator(sel).first.is_visible() for sel in ("[data-action='logout']", "button[aria-label='Reminders']", ".app-topbar .lang-select")))
    page.set_viewport_size({"width": 1500, "height": 1000})

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe portal is login-only: the administrator makes every account, says what it sees, and each person chooses their own password.")
