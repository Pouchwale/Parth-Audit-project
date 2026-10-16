"""The accounts the plant keeps, and the master list of who does what (REQUIREMENTS s110), asked for on 12-Oct-2026.

  "So now make sure change username kapilabarad01@gmail.com change to kapila barad only and also remove all others
   except kapila, superadmin, admin, vinay, sandeep and bharat, chirag, ankur, dharmik, and make sure give me options
   like separate master list format only for superadmin in which in every document present in that master list format
   so in that super will select user according to documents superadmin can select and also give options like read,
   write, and view so do work on it perfectly."

This suite checks, against the product server (the plant's seeded accounts on SEED_ACCOUNT_PASSWORD), with accounts it
makes for itself so that nothing of the plant's own is renamed or removed:

  * RENAME WITH "REPLACE IT": an account on a gmail address (as Kapila Barad's is) renamed on Users & Access to the
    sign-in of an account nobody has used, typed as its short name: the page names the unused account and offers
    "Replace it"; done in one step, the unused account is under "Show removed accounts" with its sign-in given to the
    renamed one, the renamed account's own setting and the document it filled moved to the new sign-in, its open
    session ended with the words of why, the activity log saying old and new; a sign-in an account that has been used
    holds is refused;
  * THE SHORT SIGN-IN: "holder qa..." and "holder.qa..." sign in to holder.qa...@gpp.local; the gmail account's own
    local part does not;
  * REMOVE AND BRING BACK: an account that filled a document alone is removed (asked first): gone from Users & Access,
    User access, the directory of people and the master list's columns, the document showing "Nobody fills this", its
    session ended, its sign-in refused in words, its lines in the activity log still there; the super admin's own
    account offers no Remove; "Show removed accounts" and "Bring back" put it back, signing in and filling the document
    again;
  * "KEEP ONLY THESE": every account ticked but two, the two listed before the confirm and removed in one step, a line
    in the activity log;
  * THE MASTER LIST: the super admin's alone (no sidebar entry and the page refused for staff); every document in
    F/SYS/02's order with the list's Sr. No.; a level set from a cell's small menu (bold where set), who fills a
    document chosen with its main person, and a level for two documents at once; Users & Access's per-person screen
    then shows the same levels and "Answers for it", and its "Who fills what" the same people;
  * NOTHING OF ANY RECORD LOST: every record in the database before is there after, with the same history;
  * no JavaScript errors.

Against the product server on :8843 (DCRS_BASE overrides it) with the plant's seeded accounts on SEED_ACCOUNT_PASSWORD
(DCRS_SEED_PASSWORD overrides it). The access rules are put back as they were at the end; the suite's own accounts
stay as the suite leaves them (it runs last of the product server's suites in scripts/run-e2e.ts).
"""
import json
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD", "SeedQA@2026")
ADMIN = "admin@gpp.local"
VINAY = "vinay.bhojak@gpp.local"
SANDEEP = "sandeep.parekh@gpp.local"
STAMP = str(int(time.time()))[-6:]
PASSWORD = "AcctQA@2026"
OWNER = f"ownerqa{STAMP}@gmail.com"  # a gmail account, as Kapila Barad's is
HOLDER = f"holder.qa{STAMP}@gpp.local"  # a seeded-like account nobody has used
LEAVER = f"leaver.qa{STAMP}@gpp.local"
TEMP1 = f"temp1.qa{STAMP}@gpp.local"
TEMP2 = f"temp2.qa{STAMP}@gpp.local"
RENAMED_NAME = f"Owner QA {STAMP}"
FAILURES = []
ERRORS = []
NO_INTRO = "try { sessionStorage.setItem('dcrs:intro-seen', '1'); } catch (e) {}"


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
    ERRORS[before:] = [e for e in ERRORS[before:] if "401" not in e]


def sign_in(page, email, password=SEED_PASSWORD):
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
    page.wait_for_selector(".app-sidebar", timeout=90000)
    page.wait_for_timeout(1200)
    dismiss(page)
    close_assistant(page)
    ERRORS[before:] = [e for e in ERRORS[before:] if "401" not in e]


def try_sign_in(page, email, password):
    """A sign-in expected to be refused: the words the form shows and their code."""
    before = len(ERRORS)
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(600)
    if page.locator(".app-sidebar").count():
        sign_out(page)
    page.wait_for_selector("#login-email", timeout=60000)
    page.fill("#login-email", email)
    page.fill("#login-password", password)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".auth-error[data-code], .auth-error", timeout=30000)
    page.wait_for_timeout(500)
    err = page.locator("form .auth-error").last
    words = err.inner_text() if err.count() else ""
    code = err.get_attribute("data-code") if err.count() else None
    # A refused sign-in answers 401 or 403: the browser says so in its console; that is the refusal, not an error of the app.
    ERRORS[before:] = [e for e in ERRORS[before:] if "401" not in e and "403" not in e]
    return words, code


def go(page, route, wait=None, ms=1200):
    page.goto(f"{BASE}/index.html#{route}")
    if wait:
        page.wait_for_selector(wait, timeout=30000)
    page.wait_for_timeout(ms)
    close_assistant(page)


def api(page, method, path, body=None):
    """A request through the context's own API: it shares the page's cookies, and a refusal is not a console error."""
    req = page.context.request
    url = f"{BASE}{path}"
    if method == "GET":
        res = req.get(url)
    elif method == "PUT":
        res = req.put(url, data=json.dumps(body), headers={"Content-Type": "application/json"})
    else:
        res = req.post(url, data=json.dumps(body if body is not None else {}), headers={"Content-Type": "application/json"})
    try:
        payload = res.json()
    except Exception:
        payload = None
    return {"status": res.status, "body": payload}


def rules_now(page):
    r = api(page, "GET", "/api/access/rules")
    return (r.get("body") or {}).get("rules") or {}, (r.get("body") or {}).get("version")


def accounts(page):
    return {u["email"]: u for u in (api(page, "GET", "/api/users")["body"] or {}).get("users", [])}


def records_now(page):
    """Every record in the database, by id: the records item whole (the super admin reads every record)."""
    body = api(page, "GET", "/api/storage")["body"] or {}
    for item in body.get("items", []):
        if item.get("key") == "records" and item.get("scope") == "company" and isinstance(item.get("value"), str):
            return {r["id"]: r for r in json.loads(item["value"]) if isinstance(r, dict) and "id" in r}
    return {}


def history_of(record):
    return [(h.get("action"), h.get("by")) for h in (record.get("history") or []) if isinstance(h, dict)]


def users_row(page, email):
    return page.locator(f"[data-table='users'] tr[data-user='{email}']")


with sync_playwright() as p:
    browser = p.chromium.launch()

    def new_page(ctx):
        pg = ctx.new_page()
        pg.route("**/translate_a/**", lambda route: route.abort())
        pg.on("pageerror", lambda e: ERRORS.append(f"pageerror: {e}"))
        pg.on("console", lambda m: ERRORS.append(f"console: {m.text}") if m.type == "error" and "translate" not in m.text.lower() else None)
        return pg

    admin_ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    admin_ctx.add_init_script(NO_INTRO)
    staff_ctx = browser.new_context(viewport={"width": 1366, "height": 900})
    staff_ctx.add_init_script(NO_INTRO)
    admin = new_page(admin_ctx)
    staff = new_page(staff_ctx)
    start_rules = None

    try:
        # ==============================================================================================================
        # 0. The plant as it is: the records in the database, the access rules, and the suite's own accounts
        # ==============================================================================================================
        print("\n==== 0. The plant as it is ====")
        sign_in(admin, ADMIN)
        start_rules, start_version = rules_now(admin)
        check("The access rules are read (GET /api/access/rules)", isinstance(start_rules, dict) and isinstance(start_version, int), (start_rules, start_version))
        records_before = {}
        for _ in range(30):
            records_before = records_now(admin)
            if records_before:
                break
            admin.wait_for_timeout(1000)
        check("The records are in the database to begin with", len(records_before) > 0, len(records_before))
        for name, email in [(f"Owner QA {STAMP}", OWNER), (f"Holder QA {STAMP}", HOLDER), (f"Leaver QA {STAMP}", LEAVER), (f"Temp One {STAMP}", TEMP1), (f"Temp Two {STAMP}", TEMP2)]:
            r = api(admin, "POST", "/api/users", {"name": name, "email": email, "password": PASSWORD, "departments": ["QC"]})
            check(f"The super admin makes {email}", r["status"] == 201, r)
        # What the super admin set for the gmail account, and a document it was made to fill (with Vinay Bhojak).
        rules, version = rules_now(admin)
        rules = {**rules, "people": {**(rules.get("people") or {}), OWNER: {"documents": {"qc-viscosity": "write"}}}, "responsibility": {**(rules.get("responsibility") or {}), "hr-competence": [VINAY, OWNER]}}
        r = api(admin, "PUT", "/api/access/rules", {"rules": rules, "baseVersion": version})
        check("Its own setting and a document it fills are saved", r["status"] == 200, r)
        # The gmail account signs in once (it is used); the holder never does.
        sign_in(staff, OWNER, PASSWORD)
        check("The gmail account signs in", staff.locator(".app-sidebar").count() == 1)

        # ==============================================================================================================
        # 1. Rename with "Replace it"
        # ==============================================================================================================
        print("\n==== 1. Rename, and Replace it ====")
        go(admin, "/users", "[data-page='users'] [data-table='users']", 1500)
        used = api(admin, "POST", f"/api/users/{accounts(admin)[OWNER]['id']}/rename", {"name": "Anybody", "email": ADMIN})
        check(
            "A sign-in an account that has been used holds is refused, naming it (409 sign-in-used)",
            used["status"] == 409 and (used["body"] or {}).get("code") == "sign-in-used" and ((used["body"] or {}).get("holder") or {}).get("email") == ADMIN,
            used,
        )
        users_row(admin, OWNER).locator("[data-action='rename-user']").click()
        admin.wait_for_selector("[data-section='rename-user']", timeout=15000)
        admin.fill("[data-field='rename-name']", RENAMED_NAME)
        admin.fill("[data-field='rename-email']", f"holder.qa{STAMP}")
        hint = admin.locator("[data-section='rename-user']").inner_text()
        check("The short name is said as a sign-in of the plant's own", f"holder.qa{STAMP}" in hint, hint)
        admin.click("[data-action='save-rename']")
        admin.wait_for_selector("[data-section='rename-held'][data-code='sign-in-unused']", timeout=15000)
        held = admin.locator("[data-section='rename-held']").inner_text()
        check(
            "The sign-in of an account nobody has used is named, and 'Replace it' offered",
            f"Holder QA {STAMP}" in held and "never been used" in held and admin.locator("[data-action='replace-it']").count() == 1,
            held,
        )
        check("...nothing changed yet", HOLDER in accounts(admin) and OWNER in accounts(admin) and not accounts(admin)[HOLDER].get("removedAt"))
        admin.click("[data-action='replace-it']")
        admin.wait_for_selector("[data-section='users-note']", timeout=15000)
        note = admin.locator("[data-section='users-note']").inner_text()
        check("Done in one step, said in words", f"{RENAMED_NAME} now signs in with {HOLDER}" in note and "nobody had used, is removed" in note, note)
        now = accounts(admin)
        check("The renamed account signs in with the holder's sign-in, its old one kept as a former one", now.get(HOLDER, {}).get("name") == RENAMED_NAME and OWNER in (now.get(HOLDER, {}).get("formerSignIns") or []), now.get(HOLDER))
        check("The gmail sign-in is nobody's now", OWNER not in now)
        replaced = [u for u in now.values() if u.get("signInGivenUp") == HOLDER]
        check("The unused account is removed, its sign-in given up, nothing deleted", len(replaced) == 1 and replaced[0].get("removedAt") and replaced[0].get("active") is False, replaced)
        check("Users & Access lists the renamed account, and not the one replaced", users_row(admin, HOLDER).count() == 1 and users_row(admin, OWNER).count() == 0)
        check("...its row says the short name it signs in with", f"holder.qa{STAMP}" in users_row(admin, HOLDER).inner_text())
        admin.check("[data-action='show-removed']")
        admin.wait_for_timeout(400)
        removed_row = admin.locator(f"[data-table='removed-users'] tr[data-removed-user='{HOLDER}']")
        check(
            "'Show removed accounts' lists the replaced account, its sign-in gone to the renamed one, with 'Bring back'",
            removed_row.count() == 1 and RENAMED_NAME in removed_row.inner_text() and removed_row.locator("[data-action='bring-back']").count() == 1,
            removed_row.inner_text() if removed_row.count() else None,
        )
        rules, _ = rules_now(admin)
        check(
            "Its own setting and its place in who fills what moved to the new sign-in",
            (rules.get("people") or {}).get(HOLDER) == {"documents": {"qc-viscosity": "write"}}
            and OWNER not in (rules.get("people") or {})
            and (rules.get("responsibility") or {}).get("hr-competence") == [VINAY, HOLDER],
            rules,
        )
        lines = (api(admin, "GET", f"/api/activity?q={HOLDER}")["body"] or {}).get("lines", [])
        renamed_line = next((l for l in lines if l.get("action") == "Account renamed"), None)
        check(
            "The activity log says old and new",
            renamed_line is not None and OWNER in renamed_line.get("detail", "") and HOLDER in renamed_line.get("detail", "") and renamed_line.get("userEmail") == ADMIN,
            renamed_line or lines[:3],
        )
        # The gmail account's open session was ended: its next look is the sign-in page, saying why.
        staff.goto(f"{BASE}/index.html")
        staff.wait_for_selector("#login-email", timeout=60000)
        staff.wait_for_timeout(800)
        notice = staff.locator("[data-section='signed-out-notice']")
        check(
            "Its open session ended, and the sign-in page says the super admin changed the sign-in",
            notice.count() == 1 and "changed this account's sign-in" in notice.inner_text(),
            notice.inner_text() if notice.count() else staff.locator(".auth-card").inner_text()[:300],
        )
        # A 409 is the sync's own conflict path (frontend/src/data/serverSync.ts: merged with the database's copy and sent
        # again) while the super admin changes accounts under it: the browser logs the status, the app recovers.
        ERRORS[:] = [e for e in ERRORS if "401" not in e and "status of 409" not in e]

        # ==============================================================================================================
        # 2. The short sign-in name
        # ==============================================================================================================
        print("\n==== 2. The short sign-in name ====")
        sign_in(staff, f"Holder QA{STAMP}".replace("QA", "qa"), PASSWORD)
        check("'holder qa…' (spaces, capitals) signs in to holder.qa…@gpp.local", staff.locator(".app-sidebar").count() == 1)
        me = api(staff, "GET", "/api/auth/me")["body"] or {}
        check("...as the renamed account", (me.get("user") or {}).get("email") == HOLDER, me)
        sign_out(staff)
        sign_in(staff, f"holder.qa{STAMP}", PASSWORD)
        check("'holder.qa…' signs in too", staff.locator(".app-sidebar").count() == 1)
        sign_out(staff)
        words, code = try_sign_in(staff, f"ownerqa{STAMP}", PASSWORD)
        check("A gmail account's own name is no short name: refused", "Invalid email or password" in words, (words, code))

        # ==============================================================================================================
        # 3. Remove and bring back
        # ==============================================================================================================
        print("\n==== 3. Remove, and Bring back ====")
        leaver_id = accounts(admin)[LEAVER]["id"]
        rules, version = rules_now(admin)
        r = api(admin, "PUT", "/api/access/rules", {"rules": {**rules, "responsibility": {**(rules.get("responsibility") or {}), "qc-inprocess-printing": [LEAVER]}}, "baseVersion": version})
        check("The leaver is made the only one who fills F/QC/13", r["status"] == 200, r)
        sign_in(staff, LEAVER, PASSWORD)
        check("The leaver signs in (lines of their own in the log)", staff.locator(".app-sidebar").count() == 1)
        go(admin, "/users", "[data-page='users'] [data-table='users']", 1500)
        check("The super admin's own account offers no Remove", users_row(admin, ADMIN).locator("[data-action='remove-user']").count() == 0)
        users_row(admin, LEAVER).locator("[data-action='remove-user']").click()
        admin.wait_for_selector("[data-section='confirm-remove']", timeout=15000)
        asked = admin.locator("[data-section='confirm-remove']").inner_text()
        check("Removing is asked first, in plain words", "Nothing is deleted" in asked and "Nobody fills this" in asked, asked)
        admin.click("[data-action='confirm-ask']")
        admin.wait_for_selector("[data-section='users-note']", timeout=15000)
        check(
            "Removed: off Users & Access",
            users_row(admin, LEAVER).count() == 0,
            {"row": users_row(admin, LEAVER).first.inner_text()[:200] if users_row(admin, LEAVER).count() else None, "note": admin.locator("[data-section='users-note']").inner_text()[:200]},
        )
        gone = accounts(admin).get(LEAVER) or {}
        check("...stamped removed and switched off, by the super admin", gone.get("removedAt") and gone.get("active") is False and gone.get("removedBy") == "Super Admin", gone)
        people = (api(admin, "GET", "/api/users/directory")["body"] or {}).get("people", [])
        check("...off the directory every list of people reads", not any(x.get("id") == leaver_id for x in people))
        go(admin, "/access", "[data-page='access'][data-state='ready']", 1200)
        # The page keeps the overview it read before while it reads again: the leaver's line goes when the new reading lands.
        # The day's sign-in history (REQUIREMENTS §84) keeps the leaver's line, as the activity log keeps theirs: only the
        # tables of people (who may use what, who is signed in now) must be without them.
        people_rows = f"tr[data-user='{LEAVER}']:not([data-table='access-history'] tr)"
        try:
            admin.wait_for_selector(people_rows, state="detached", timeout=15000)
        except Exception:
            pass
        check(
            "...off User access (the day's sign-in history keeps their line, as the log does)",
            admin.locator(people_rows).count() == 0,
            admin.locator(f"tr[data-user='{LEAVER}']").evaluate_all("els => els.map((e) => [(e.closest('[data-table]') || {}).getAttribute ? e.closest('[data-table]').getAttribute('data-table') : (e.closest('section') || {}).className, e.innerText.slice(0, 120)])"),
        )
        staff.reload()
        staff.wait_for_selector("#login-email", timeout=60000)
        check("...its open session ended", staff.locator(".app-sidebar").count() == 0)
        # A 409 is the sync's own conflict path (frontend/src/data/serverSync.ts: merged with the database's copy and sent
        # again) while the super admin changes accounts under it: the browser logs the status, the app recovers.
        ERRORS[:] = [e for e in ERRORS if "401" not in e and "status of 409" not in e]
        words, code = try_sign_in(staff, LEAVER, PASSWORD)
        check("...and its sign-in refused in words", code == "account-removed" and "removed" in words, (words, code))
        log = (api(admin, "GET", f"/api/activity?person={leaver_id}")["body"] or {}).get("lines", [])
        check("...its own lines in the activity log are all still there", any(l.get("action") == "Signed in" for l in log), log[:3])
        go(admin, "/master-list", "[data-page='master-list'][data-state='ready']", 1500)
        admin.wait_for_selector("tr[data-master-document='qc-inprocess-printing']", timeout=30000)
        fill = admin.locator("tr[data-master-document='qc-inprocess-printing'] [data-fill]")
        check("The document only they filled shows 'Nobody fills this' on the master list", fill.count() == 1 and "Nobody fills this" in fill.inner_text(), fill.inner_text() if fill.count() else None)
        check("...and they are no column of it", admin.locator(f"th[data-person='{LEAVER}']").count() == 0)
        go(admin, "/users", "[data-page='users'] [data-table='users']", 1200)
        admin.check("[data-action='show-removed']")
        admin.wait_for_timeout(400)
        admin.locator(f"[data-table='removed-users'] tr[data-removed-user='{LEAVER}'] [data-action='bring-back']").click()
        admin.wait_for_selector("[data-section='users-note']", timeout=15000)
        check("Brought back: on Users & Access again", users_row(admin, LEAVER).count() == 1, admin.locator("[data-section='users-note']").inner_text())
        back = accounts(admin).get(LEAVER) or {}
        check("...switched on, as it was", not back.get("removedAt") and back.get("active") is True, back)
        sign_in(staff, LEAVER, PASSWORD)
        check("...and signs in again", staff.locator(".app-sidebar").count() == 1)
        go(admin, "/master-list", "[data-page='master-list'][data-state='ready']", 1500)
        admin.wait_for_selector("tr[data-master-document='qc-inprocess-printing']", timeout=30000)
        check("...and fills F/QC/13 again", f"Leaver QA {STAMP}" in admin.locator("tr[data-master-document='qc-inprocess-printing'] [data-fill]").inner_text())
        sign_out(staff)

        # ==============================================================================================================
        # 4. Keep only these
        # ==============================================================================================================
        print("\n==== 4. Keep only these ====")
        go(admin, "/users", "[data-page='users'] [data-table='users']", 1200)
        admin.click("[data-action='keep-only']")
        admin.wait_for_selector("[data-section='keep-only'][data-step='pick']", timeout=15000)
        check("Every account is listed with a tick, the super admin's own ticked for good", admin.locator(f"input[data-keep='{ADMIN}']").is_checked() and admin.locator(f"input[data-keep='{ADMIN}']").is_disabled())
        admin.click("[data-action='keep-all']")
        admin.uncheck(f"input[data-keep='{TEMP1}']")
        admin.uncheck(f"input[data-keep='{TEMP2}']")
        admin.click("[data-action='keep-next']")
        admin.wait_for_selector("[data-section='keep-only'][data-step='confirm']", timeout=15000)
        goes = sorted(admin.locator("[data-section='keep-goes'] li").evaluate_all("els => els.map(e => e.getAttribute('data-goes'))"))
        check("What will be removed is listed before the confirm: the two not ticked, and nobody else", goes == sorted([TEMP1, TEMP2]), goes)
        admin.click("[data-action='keep-confirm']")
        admin.wait_for_selector("[data-section='users-note']", timeout=15000)
        note = admin.locator("[data-section='users-note']").inner_text()
        check("Removed in one step", "2 accounts removed in one step" in note, note)
        now = accounts(admin)
        check("...both, and nobody else", now[TEMP1].get("removedAt") and now[TEMP2].get("removedAt") and not now[ADMIN].get("removedAt") and not now[HOLDER].get("removedAt") and not now[VINAY].get("removedAt"))
        lines = (api(admin, "GET", "/api/activity?q=Only%20these%20accounts%20kept")["body"] or {}).get("lines", [])
        check("...one line for the step in the activity log", any(l.get("action") == "Only these accounts kept" and "2 accounts removed" in l.get("target", "") for l in lines), lines[:2])

        # ==============================================================================================================
        # 5. The master list of who does what
        # ==============================================================================================================
        print("\n==== 5. The master list ====")
        sign_in(staff, HOLDER, PASSWORD)
        check("Staff have no master list in the sidebar", staff.locator(".app-sidebar a[href='#/master-list']").count() == 0)
        go(staff, "/master-list", "[data-page='master-list']", 800)
        check("...and the page is refused them", staff.locator("[data-page='master-list'][data-state='not-admin']").count() == 1)
        refused = api(staff, "PUT", "/api/access/rules", {"rules": {"version": 1, "people": {}, "responsibility": {}}, "baseVersion": 0})
        check("...as the server refuses them the access rules", refused["status"] == 403, refused)
        sign_out(staff)
        go(admin, "/dashboard", ".app-sidebar", 600)
        check("The super admin has it in the sidebar, beside Users & Access", admin.locator(".app-sidebar a[href='#/master-list']").count() == 1)
        admin.click(".app-sidebar a[href='#/master-list']")
        admin.wait_for_selector("[data-page='master-list'][data-state='ready']", timeout=30000)
        admin.wait_for_timeout(1500)
        first = admin.locator("tr[data-master-section]").first.get_attribute("data-master-section")
        check("The module sections in F/SYS/02's order: SYS first", first == "SYS", first)
        check("F/SYS/02 is Sr. No. 2 of itself", admin.locator("tr[data-master-document='sys-format-list'] [data-field='sr']").inner_text().strip() == "2")
        check("F/QC/13 is Sr. No. 43", admin.locator("tr[data-master-document='qc-inprocess-printing'] [data-field='sr']").inner_text().strip() == "43")
        count = admin.locator("[data-field='master-count']").get_attribute("data-count")
        check("Every document is on it", count is not None and int(count) >= 120, count)
        legend = admin.locator("[data-section='master-marks']").inner_text()
        check("It says View and Read are the same level, and what bold means", "View and Read are the same level" in legend and "Bold" in legend, legend)
        # A level from a cell's small menu.
        cell = f"button[data-cell][data-email='{HOLDER}'][data-doc='qc-bopp-film']"
        admin.wait_for_selector(cell, timeout=30000)
        before_level = admin.locator(cell).get_attribute("data-level")
        admin.locator(cell).click()
        admin.wait_for_selector("[data-section='master-level-menu']", timeout=10000)
        check("A cell opens a small menu of the four levels", admin.locator("[data-section='master-level-menu'] [data-action='set-level']").count() >= 4)
        admin.click("[data-section='master-level-menu'] [data-action='set-level'][data-level='write']")
        admin.wait_for_selector("[data-section='master-note']", timeout=15000)
        admin.wait_for_timeout(600)
        check(
            "A level set on the master list: Write, shown bold (set by the super admin)",
            admin.locator(cell).get_attribute("data-level") == "write" and admin.locator(cell).get_attribute("data-set") == "document" and "is-set" in (admin.locator(cell).get_attribute("class") or ""),
            (before_level, admin.locator(cell).get_attribute("data-level"), admin.locator(cell).get_attribute("data-set")),
        )
        # Who fills a document, the main person first.
        admin.locator("tr[data-master-document='hr-skill-matrix'] [data-fill]").click()
        admin.wait_for_selector("[data-section='master-fill-menu']", timeout=10000)
        admin.check(f"[data-section='master-fill-menu'] [data-fill-person='{HOLDER}'] input[data-field='fills']")
        admin.click(f"[data-section='master-fill-menu'] [data-fill-person='{HOLDER}'] [data-action='make-main']")
        admin.click("[data-section='master-fill-menu'] [data-action='save-fill']")
        admin.wait_for_timeout(1200)
        filled = admin.locator("tr[data-master-document='hr-skill-matrix'] [data-fill]").inner_text()
        check("'Filled by' set on the master list, the main person first", filled.startswith(f"{RENAMED_NAME} (main)") and "Vinay Bhojak" in filled, filled)
        # A level for two documents at once.
        for doc in ("qc-viscosity", "mnt-pm-record"):
            admin.check(f"tr[data-master-document='{doc}'] input[data-field='tick']")
        admin.wait_for_selector("[data-section='master-bulk'][data-count='2']", timeout=10000)
        admin.select_option("[data-field='bulk-person']", HOLDER)
        admin.select_option("[data-field='bulk-level']", "read")
        admin.click("[data-action='bulk-give']")
        admin.wait_for_selector("[data-section='confirm-bulk']", timeout=10000)
        check("A change of many documents is asked first, naming them", "F-QC-30" in admin.locator("[data-section='confirm-bulk']").inner_text())
        admin.click("[data-action='confirm-bulk']")
        admin.wait_for_timeout(1500)
        both = [admin.locator(f"button[data-cell][data-email='{HOLDER}'][data-doc='{d}']").get_attribute("data-level") for d in ("qc-viscosity", "mnt-pm-record")]
        check("Two documents at once: View on both", both == ["read", "read"], both)
        # The filters.
        admin.select_option("[data-field='filter-module']", "QC")
        admin.wait_for_timeout(500)
        check("A module filter keeps that module's documents", admin.locator("tr[data-master-section]").count() == 1 and admin.locator("tr[data-master-section='QC']").count() == 1)
        admin.select_option("[data-field='filter-module']", "")
        admin.check("[data-field='filter-nobody']")
        admin.wait_for_timeout(500)
        nobody_rows = admin.locator("tr[data-master-document]").count()
        nobody_fill = admin.locator("tr[data-master-document] .ml-fill-button.is-nobody").count()
        check("'Nobody fills this' keeps only those", nobody_rows == nobody_fill, (nobody_rows, nobody_fill))
        admin.uncheck("[data-field='filter-nobody']")
        # Users & Access shows the same: the per-person screen's levels and "Answers for it", and "Who fills what".
        go(admin, "/users", "[data-section='access-grid']", 1500)
        admin.locator(f"tr[data-access-person='{HOLDER}'] td[data-cell='QC'] [data-action='open-person-module']").click()
        admin.wait_for_selector("[data-section='access-drawer']", timeout=10000)
        drawer_levels = {d: admin.locator(f"[data-section='access-drawer'] [data-access-line='{d}']").get_attribute("data-level") for d in ("qc-bopp-film", "qc-viscosity")}
        check("Users & Access's per-person screen shows the levels set on the master list", drawer_levels == {"qc-bopp-film": "write", "qc-viscosity": "read"}, drawer_levels)
        admin.click("[data-action='close-drawer']")
        admin.locator(f"tr[data-access-person='{HOLDER}'] td[data-cell='HR'] [data-action='open-person-module']").click()
        admin.wait_for_selector("[data-section='access-drawer']", timeout=10000)
        answers = admin.locator("[data-section='access-drawer'] [data-access-line='hr-skill-matrix'] input[data-field='answers-for']")
        check("...and 'Answers for it' where the master list made them fill it", answers.count() == 1 and answers.is_checked())
        admin.click("[data-action='close-drawer']")
        admin.click("[data-action='show-who-fills']")
        admin.wait_for_selector("[data-section='who-fills-what']", timeout=10000)
        who = admin.locator("tr[data-who-document='hr-skill-matrix'] [data-field='answers']").inner_text()
        check("...and its 'Who fills what' the same people, the main person first", who.startswith(RENAMED_NAME), who)

        # ==============================================================================================================
        # 6. Nothing of any record lost
        # ==============================================================================================================
        print("\n==== 6. Nothing of any record lost ====")
        records_after = records_now(admin)
        missing = [rid for rid in records_before if rid not in records_after]
        check("Every record in the database before is there after", not missing, missing[:5])
        changed = [rid for rid, rec in records_before.items() if rid in records_after and history_of(records_after[rid])[: len(history_of(rec))] != history_of(rec)]
        check("...with its history as it was (names written on records stay as written)", not changed, changed[:5])
    except Exception as exc:  # noqa: BLE001 - a crash is reported as a failure with where it happened
        import traceback

        traceback.print_exc()
        FAILURES.append(f"crashed: {exc}")
    finally:
        # The access rules as they were (the removed accounts are the server's to keep, whatever is sent).
        try:
            if start_rules is not None:
                _, version = rules_now(admin)
                api(admin, "PUT", "/api/access/rules", {"rules": start_rules, "baseVersion": version})
        except Exception as exc:  # noqa: BLE001
            print("could not put the rules back:", exc)
        browser.close()

real_errors = [e for e in ERRORS if "401" not in e]
check("No JavaScript errors", not real_errors, real_errors[:5])
print(f"\n{'ALL PASSED' if not FAILURES else f'{len(FAILURES)} FAILED'}")
for f in FAILURES:
    print(" -", f)
sys.exit(1 if FAILURES else 0)
