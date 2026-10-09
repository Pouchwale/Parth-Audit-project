"""Who may do what, the bell and the Notifications page (REQUIREMENTS s96, s97), asked for on 7 and 8-Oct-2026.

  "qc is for Kapila Barad, HR is for Vinay Bhojak ... for all other documents give view access ... Kapila Barad has all
   access but she can only edit QC and SYS documents ..." (7-Oct-2026)
  "in our dashboard in the audit software I can give access from there only, and only the superadmin can do this: make
   an option for which user can access what, and give read, write and edit access accordingly ... the responsible person
   for that particular document will receive a notification in mobile as well as in our audit software." (8-Oct-2026)

This suite checks, against the product server (the super admin and the owner's twelve people, seeded):

  * EACH OF THE TWELVE signs in and sees exactly the modules the owner's table gives them (Kapila Barad every one), no
    document of another module, and the same number the super admin's User access page counts for them; a document
    they answer for offers New record, one they may only read offers none and says why ("Read only for you ... Write
    access"), and one of a module they do not see is refused by name;
  * A READ PERSON CANNOT START OR SUBMIT: Vinay Bhojak on Kapila Barad's F/HR/15 has no New record, Start, Edit format,
    Save or Submit, the reason in words, a sheet with nothing to type in, and the server refuses the submit (403
    access-level) in the same words;
  * USERS & ACCESS: the grid of people by the ten modules with the words of each level; a change asked in plain words
    ("Give Ankur Raval Edit in Production? They will be able to ..."), "No, leave it" changing nothing, saved with the
    stored version, in the activity log, and told to the person; a stale page told to reload and never overwriting; the
    drawer's level per document and "Answers for it"; "Who fills what"; Make super admin and Make staff, never the last
    super admin; Ankur Raval then sees Production at the next sign-in;
  * THE BELL AND THE NOTIFICATIONS PAGE: after the notify job (run by hand), the bell lists the person's own
    notifications under its escalations, unread marked; "See all" opens /notifications by day; an item opens its record
    and is read; "Mark all read" leaves none unread; in Gujarati the notifications are in Gujarati; the super admin's
    include the morning summary by module;
  * WHAT THE PEOPLE REVIEW OF 9-OCT-2026 FOUND, put right: the super admin's day card is the plant's day with no score of
    their own; Dharmik Mistry's day is F/PRD/10 alone; Chirag Parmar's sidebar is Purchase alone, the service agreement
    under it; a reader is offered no Upload changes and no "press Submit"; the bell's panel closes on Escape and on
    another page, speaks Gujarati in Gujarati and names who answers for each document by the owner's table; Mitra,
    asked to fill a record the person only reads, gives the access refusal; the super admin prepares today's records and
    sends the notifications from buttons on the Notifications page, which nobody else is shown;
  * no JavaScript errors.

Against the product server on :8843 (DCRS_BASE overrides it) with the plant's seeded accounts on SEED_ACCOUNT_PASSWORD
(DCRS_SEED_PASSWORD overrides it). The access rules and the roles are put back as they were at the end, whatever
happened, because the other product-server suites rely on them.
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
KAPILA = "kapila.barad@gpp.local"
VINAY = "vinay.bhojak@gpp.local"
ANKUR = "ankur.raval@gpp.local"
BHARAT = "bharat.ahir@gpp.local"
RAGHUNATH = "raghunath.mane@gpp.local"
FAILURES = []
ERRORS = []
NO_INTRO = "try { sessionStorage.setItem('dcrs:intro-seen', '1'); } catch (e) {}"
ALL = ["QC", "HR", "SYS", "MNT", "PRD", "PUR", "STR", "MKT", "DISP", "QA"]
CODE_RE = re.compile(r"^\s*F?\s*[-/ ]?\s*(SYS|MKT|PUR|STR|QC|QA|PRD|MNT|HR|DISP)\s*[-/ ]?\s*\d", re.I)

# THE OWNER'S TABLE (access-spec of 7-Oct-2026): the modules each person sees, a document each answers for, one each may
# only read (or None), and one of a module they do not see (or None: Kapila Barad sees every module).
PEOPLE = [
    ("Kapila Barad", KAPILA, ALL, "qc-bopp-film", "prd-alc-production", None),
    ("Vinay Bhojak", VINAY, ["HR"], "hr-competence", "hr-daily-cleaning", "qc-bopp-film"),
    ("Sandeep Parekh", "sandeep.parekh@gpp.local", ["HR"], "hr-competence", "daily-pest-monitoring", "qc-bopp-film"),
    ("Chirag Parmar", "chirag.parmar@gpp.local", ["PUR"], "pur-supplier-registration", None, "qc-bopp-film"),
    ("Bharat Ahir", BHARAT, ["STR"], "str-incoming-material-vehicle", None, "qc-bopp-film"),
    ("Ajay Sinh Vaghela", "ajaysinh.vaghela@gpp.local", ["PRD", "QC"], "prd-alc-production", "qc-bopp-film", "hr-competence"),
    ("Dharmik Mistry", "dharmik.mistry@gpp.local", ["PRD"], "prd-sharp-object-issue", "prd-alc-production", "qc-bopp-film"),
    ("Anil Ravad", "anil.ravad@gpp.local", ["PRD"], "prd-sharp-object-issue", "prd-alc-production", "qc-bopp-film"),
    ("Vishnu Jadhav", "vishnu.jadhav@gpp.local", ["PRD"], "prd-alc-production", "prd-sharp-object-issue", "qc-bopp-film"),
    ("Raghunath Mane", RAGHUNATH, ["MNT"], "mnt-pm-record", "mnt-glass-breakage", "qc-bopp-film"),
    ("Ajay Zala", "ajay.zala@gpp.local", ["QC", "MNT"], "qc-inprocess-printing", "qc-bopp-film", "hr-competence"),
    ("Ankur Raval", ANKUR, ["QC"], "qc-viscosity", "qc-bopp-film", "prd-alc-production"),
]


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


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
    # A pop-up a page opened by itself (the service agreement's reminder for whoever holds it) is closed first.
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
    # The sign-in page's own /api/auth/me answers 401 before anybody is signed in: not an error of the app.
    ERRORS[before:] = [e for e in ERRORS[before:] if "401" not in e]


def go(page, route, wait=None, ms=1500):
    page.goto(f"{BASE}/index.html#{route}")
    if wait:
        page.wait_for_selector(wait, timeout=30000)
    page.wait_for_timeout(ms)
    close_assistant(page)


def api(page, method, path, body=None, headers=None):
    """A request through the context's own API: it shares the page's cookies, and a refusal is not a console error."""
    req = page.context.request
    url = f"{BASE}{path}"
    if method == "GET":
        res = req.get(url)
    elif method == "PUT":
        res = req.put(url, data=body if isinstance(body, str) else json.dumps(body), headers={"Content-Type": "application/json", **(headers or {})})
    else:
        res = req.post(url, data=json.dumps(body if body is not None else {}), headers={"Content-Type": "application/json", **(headers or {})})
    text = res.text()
    try:
        payload = res.json()
    except Exception:
        payload = None
    return {"status": res.status, "body": payload, "text": text}


def open_mitra(page):
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(600)


def say(page, text, wait=2500):
    page.fill("textarea.input", text)
    page.click("button[aria-label='Send']")
    page.wait_for_timeout(wait)
    return page.locator(".chat-log .chat-msg.bot").last.inner_text()


def day_card(page):
    """The Dashboard's day card once it has worked the day out: (count, next-up words, element)."""
    go(page, "/dashboard", "[data-section='my-day']", 2000)
    page.wait_for_selector("[data-section='my-day']:not([data-state='loading'])", timeout=30000)
    count = page.locator("[data-section='my-day'] [data-field='my-day-count']").first.inner_text().strip()
    nxt = page.locator("[data-section='my-day'] .my-day-next-what")
    return count, (nxt.first.inner_text() if nxt.count() else ""), page.locator("[data-section='my-day']").first


def library_docs(page):
    """The documents the person's library lists: id and format number."""
    go(page, "/library", "[data-library-module]", 1200)
    return page.evaluate(
        """() => Array.from(document.querySelectorAll("[data-library-module] tbody tr")).map((tr) => {
             const open = tr.querySelector("[data-action='open-document']");
             return open ? { id: open.getAttribute('data-document'), formatNo: (tr.children[1] && tr.children[1].textContent || '').trim() } : null;
           }).filter(Boolean)"""
    )


def rules_now(page):
    r = api(page, "GET", "/api/access/rules")
    return (r.get("body") or {}).get("rules") or {}, (r.get("body") or {}).get("version")


def unread_of(page):
    r = api(page, "GET", "/api/notifications?state=all&limit=50&lang=en")
    return (r.get("body") or {}).get("unread"), (r.get("body") or {}).get("items") or []


with sync_playwright() as p:
    browser = p.chromium.launch()

    def new_page(ctx):
        pg = ctx.new_page()
        # Google Translate kept out, as in the other suites: with Gujarati chosen the screens then use DCRS's own
        # Gujarati words (i18n/googleTranslate.ts uiLanguageFor), which is what this suite checks.
        pg.route("**/translate_a/**", lambda route: route.abort())
        pg.on("pageerror", lambda e: ERRORS.append(f"pageerror: {e}"))
        # Google Translate's own messages, and its script this suite keeps out ("Failed to load resource"), are not the app's.
        pg.on("console", lambda m: ERRORS.append(f"console: {m.text}") if m.type == "error" and "translate" not in m.text.lower() and "translate" not in str((m.location or {}).get("url", "")) else None)
        return pg

    admin_ctx = browser.new_context(viewport={"width": 1366, "height": 900})
    admin_ctx.add_init_script(NO_INTRO)
    staff_ctx = browser.new_context(viewport={"width": 1366, "height": 900})
    staff_ctx.add_init_script(NO_INTRO)
    admin = new_page(admin_ctx)
    staff = new_page(staff_ctx)
    start_rules = None
    roles_to_restore = []

    try:
        sign_in(admin, ADMIN)
        start_rules, start_version = rules_now(admin)
        check("The stored rules are read by the super admin (GET /api/access/rules)", isinstance(start_rules, dict) and isinstance(start_version, int), (start_rules, start_version))
        if start_rules and (start_rules.get("people") or start_rules.get("responsibility")):
            # Left by an earlier run: the owner's table again, so this run starts from it, and the page reads it afresh.
            r = api(admin, "PUT", "/api/access/rules", {"rules": {"version": 1, "people": {}, "responsibility": {}}, "baseVersion": start_version})
            check("...put back to the owner's table before the run", r["status"] == 200, r)
            sign_in(admin, ADMIN)

        # The super admin's own count of each person's documents, on User access (REQUIREMENTS s84).
        go(admin, "/access", "[data-page='access'][data-state='ready']", 1200)
        boss_counts = admin.evaluate(
            """() => Object.fromEntries(Array.from(document.querySelectorAll("[data-table='access-modules'] tr[data-user]")).map((tr) => [tr.getAttribute('data-user'), {
                 count: Number((tr.querySelector("[data-field='documents-seen']") || {}).getAttribute ? tr.querySelector("[data-field='documents-seen']").getAttribute('data-count') : -1),
                 by: tr.getAttribute('data-by'), modules: tr.getAttribute('data-modules') }]))"""
        )
        check("User access shows each of the twelve by their levels, set on Users & Access", all((boss_counts.get(e) or {}).get("by") == "levels" for _, e, *_ in PEOPLE), boss_counts)
        all_docs = len(library_docs(admin))
        check("The super admin's library lists every document", all_docs > 100, all_docs)

        # ==============================================================
        # 1. Each of the twelve, as the owner's table says
        # ==============================================================
        print("\n==== Each of the twelve people ====")
        for name, email, views, own, read_only, unseen in PEOPLE:
            sign_in(staff, email)
            docs = library_docs(staff)
            ids = {d["id"] for d in docs}
            codes = {}
            for d in docs:
                m = CODE_RE.match(d["formatNo"] or "")
                if m:
                    codes.setdefault(m.group(1).upper(), []).append(d["formatNo"])
            outside = {c: v for c, v in codes.items() if c not in views}
            check(f"{name} sees only {', '.join(views) if views != ALL else 'every module'}", not outside, outside)
            if views == ALL:
                check(f"...{name} sees every document, as the super admin does", len(ids) == all_docs, (len(ids), all_docs))
            boss = boss_counts.get(email) or {}
            check(f"...as many documents as User access counts for {name}", boss.get("count") == len(ids), (boss.get("count"), len(ids)))
            check(f"...including {own}, which {name} answers for", own in ids)
            if unseen:
                check(f"...and not {unseen}", unseen not in ids)
            go(staff, f"/document/{own}", "[data-page='document-records']", 1200)
            check(f"{name} may start a record of {own} (New record)", staff.locator("[data-action='document-new-record']").count() == 1 and staff.locator("[data-section='access-reason']").count() == 0)
            if read_only:
                go(staff, f"/document/{read_only}", "[data-page='document-records']", 1200)
                reason = staff.locator("[data-section='access-reason']")
                words = reason.first.inner_text() if reason.count() else ""
                check(
                    f"...but only reads {read_only}: no New record, and why",
                    staff.locator("[data-action='document-new-record']").count() == 0 and staff.locator("[data-action='edit-format']").count() == 0 and "Read only for you" in words and "Write access" in words,
                    words,
                )
            if unseen:
                go(staff, f"/document/{unseen}", None, 1800)
                check(f"...and {unseen} is refused {name} by name", staff.locator("[data-state='not-your-department']").count() == 1 and staff.locator("[data-page='document-records']").count() == 0, staff.locator(".app-content").inner_text()[:200])
            sign_out(staff)

        # ==============================================================
        # 2. A Read person cannot start or submit
        # ==============================================================
        print("\n==== A Read person cannot start or submit ====")
        sign_in(staff, VINAY)
        go(staff, "/document/hr-daily-cleaning", "[data-page='document-records']", 1500)
        check(
            "Vinay Bhojak has no New record, Start this record or Edit format on Kapila Barad's F/HR/15",
            staff.locator("[data-action='document-new-record'], [data-action='start-from-blank'], [data-action='edit-format']").count() == 0,
        )
        check("...and is told why, naming the level it needs", staff.locator("[data-section='access-reason'][data-needs='start']").count() == 1)
        opened = staff.locator("[data-action='open-shown-record']")
        if opened.count() == 0:
            # Nothing on file yet: Kapila Barad's browser makes the sheets Kapila fills at each sign-in, as above.
            print("    (no F/HR/15 record on file to open)")
            check("An F/HR/15 record is on file to open", False)
        else:
            opened.first.click()
            staff.wait_for_selector("[data-print-doc]", timeout=30000)
            staff.wait_for_timeout(1200)
            close_assistant(staff)
            record_id = staff.url.split("#/record/")[-1].split("?")[0]
            check("The record opens for reading", "#/record/" in staff.url, staff.url)
            check("...with no Save, Submit, Verify or Reject", staff.locator("[data-action='save'], [data-action='submit'], [data-action='verify'], [data-action='reject']").count() == 0)
            reason = staff.locator("[data-section='access-reason']")
            check("...the reason under the bar", reason.count() == 1 and "Read only for you" in reason.inner_text(), reason.all_inner_texts())
            typable = staff.locator("[data-print-doc] input:not([disabled]):not([readonly]):not([type='hidden']), [data-print-doc] textarea:not([disabled]):not([readonly]), [data-print-doc] select:not([disabled])").count()
            check("...and nothing on the sheet to type in", typable == 0, typable)
            check("...and no Upload changes, which writes a file back into the records", staff.locator("[data-action='upload-document-changes']").count() == 0)
            banner = staff.locator(".prepared-banner")
            if banner.count():
                said_banner = banner.first.inner_text()
                check("...and a prepared banner that never tells a reader to enter or submit anything", "Enter what you saw" not in said_banner and "press Submit" not in said_banner, said_banner)
            # The screen is never the lock: the server refuses the same submit.
            stored = api(staff, "GET", "/api/storage")
            items = (stored.get("body") or {}).get("items") or []
            rec_item = next((i for i in items if i.get("key") == "records"), None)
            if rec_item:
                lines = json.loads(rec_item["value"])
                now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
                for line in lines:
                    if line.get("id") == record_id:
                        # Submitted as the app submits: the status, who and when, and a line in its history (a person's own act).
                        line["status"] = "Submitted"
                        line["submittedBy"] = "Vinay Bhojak"
                        line["submittedAt"] = now
                        line["updatedAt"] = now
                        line["history"] = (line.get("history") or []) + [{"id": f"hist-e2e-{int(time.time())}", "at": now, "by": "Vinay Bhojak", "action": "submitted"}]
                refused = api(staff, "PUT", "/api/storage/records", json.dumps(lines), {"Content-Type": "text/plain;charset=utf-8", "X-Base-Version": str(rec_item["version"])})
                said = (refused.get("body") or {})
                check("The server refuses Vinay Bhojak's submit of it (403 access-level)", refused["status"] == 403 and said.get("code") == "access-level", refused["text"][:300])
                check("...in the same words", "Read only for you" in (said.get("error") or ""), said.get("error"))
            else:
                check("Vinay Bhojak's copy holds the records", False, [i.get("key") for i in items])
        go(staff, "/document/hr-competence", "[data-page='document-records']", 1200)
        check("Vinay Bhojak may start F/HR/01, which Vinay answers for", staff.locator("[data-action='document-new-record']").count() == 1)
        sign_out(staff)

        # ==============================================================
        # 3. Users & Access: the grid, a change, the drawer
        # ==============================================================
        print("\n==== Users & Access ====")
        go(admin, "/users", "[data-section='access-grid']", 1200)
        grid = admin.locator("[data-table='access-grid']")
        check("The grid lists the twelve, each with a level for each of the ten modules", all(grid.locator(f"tr[data-access-person='{e}'] select[data-field='module-level']").count() == 10 for _, e, *_ in PEOPLE))
        legend = admin.locator("[data-section='access-legend']").inner_text()
        check("...with the words of each level beside it", all(w in legend for w in ("No access", "Read", "Write", "Edit", "print or download", "submit them and verify them", "delete records")), legend)
        check(
            "...Kapila Barad at Edit in Quality Control and Read in Production; Vinay Bhojak Read in HR, answering for 16",
            grid.locator(f"tr[data-access-person='{KAPILA}'] td[data-cell='QC']").get_attribute("data-level") == "edit"
            and grid.locator(f"tr[data-access-person='{KAPILA}'] td[data-cell='PRD']").get_attribute("data-level") == "read"
            and grid.locator(f"tr[data-access-person='{VINAY}'] td[data-cell='HR']").get_attribute("data-level") == "read"
            and "answers for 16" in grid.locator(f"tr[data-access-person='{VINAY}'] td[data-cell='HR']").inner_text(),
        )
        check("The super admin's line is everything, with nothing to set", grid.locator(f"tr[data-access-person='{ADMIN}'] select").count() == 0)
        flagged = admin.locator("[data-undescribed]")
        check("None of the twelve is flagged as undescribed", all(flagged.nth(i).get_attribute("data-undescribed") not in [e for _, e, *_ in PEOPLE] for i in range(flagged.count())))
        check("Every one of the twelve has an account, so nothing is missing", admin.locator("[data-action='create-missing']").count() == 0)

        cell = f"tr[data-access-person='{ANKUR}'] td[data-cell='PRD'] select[data-field='module-level']"
        admin.select_option(f"[data-table='access-grid'] {cell}", "edit")
        admin.wait_for_selector("[data-section='confirm-access']", timeout=10000)
        title = admin.locator(".modal-box h3").last.inner_text()
        body = admin.locator("[data-section='confirm-access']").inner_text()
        check("A change is asked first, naming the person and the level", title == "Give Ankur Raval Edit in Production?", title)
        check("...and what it lets them do, in plain words", body.startswith("They will be able to") and "delete records" in body and not re.search(r"\b(he|she|his|her|him)\b", body, re.I), body)
        admin.click(".modal-box button:has-text('No, leave it')")
        admin.wait_for_timeout(600)
        rules, version_before = rules_now(admin)
        check("'No, leave it' changes nothing", ((rules.get("people") or {}).get(ANKUR) or {}).get("modules", {}).get("PRD") is None, rules)
        admin.select_option(f"[data-table='access-grid'] {cell}", "edit")
        admin.wait_for_selector("[data-action='confirm-access']", timeout=10000)
        admin.click("[data-action='confirm-access']")
        admin.wait_for_selector("[data-section='access-note']", timeout=15000)
        note = admin.locator("[data-section='access-note']").inner_text()
        check("Saved, said in words", "Saved. Ankur Raval now has Edit in Production" in note, note)
        rules, version_after = rules_now(admin)
        check("...stored on the server with a new version", ((rules.get("people") or {}).get(ANKUR) or {}).get("modules", {}).get("PRD") == "edit" and version_after > version_before, (rules, version_before, version_after))
        check("...and the cell says it is set here", admin.locator(f"[data-table='access-grid'] tr[data-access-person='{ANKUR}'] td[data-cell='PRD']").get_attribute("data-set") == "yes")
        activity = api(admin, "GET", "/api/activity?limit=50").get("body") or {}
        lines = activity.get("lines") or []
        check("...and written in the activity log", any("Access" in (l.get("action") or "") and "Ankur" in json.dumps(l) for l in lines), [l.get("action") for l in lines[:8]])

        # A page left open while the rules changed elsewhere: told to reload, never overwriting.
        other = {"version": 1, "people": {**(rules.get("people") or {}), RAGHUNATH: {"modules": {"STR": "read"}}}, "responsibility": rules.get("responsibility") or {}}
        r = api(admin, "PUT", "/api/access/rules", {"rules": other, "baseVersion": version_after})
        check("(another tab saves a change of its own)", r["status"] == 200, r)
        admin.select_option(f"[data-table='access-grid'] tr[data-access-person='{BHARAT}'] td[data-cell='MNT'] select[data-field='module-level']", "read")
        admin.wait_for_selector("[data-action='confirm-access']", timeout=10000)
        admin.click("[data-action='confirm-access']")
        admin.wait_for_selector("[data-section='access-stale']", timeout=15000)
        stale = admin.locator("[data-section='access-stale']").inner_text()
        check("A save from a stale page is refused and says to reload", "Reload" in stale and "nothing was saved" in stale, stale)
        rules, _ = rules_now(admin)
        check("...nothing of the other change was overwritten, and Bharat Ahir's change was not made", ((rules.get("people") or {}).get(RAGHUNATH) or {}).get("modules", {}).get("STR") == "read" and BHARAT not in (rules.get("people") or {}), rules)
        admin.click("[data-action='reload-access']")
        admin.wait_for_timeout(1500)
        check("Reloaded, the grid shows the other change", admin.locator(f"[data-table='access-grid'] tr[data-access-person='{RAGHUNATH}'] td[data-cell='STR']").get_attribute("data-set") == "yes")

        # The drawer: a person's documents of a module.
        admin.locator(f"[data-table='access-grid'] tr[data-access-person='{ANKUR}'] td[data-cell='QC'] [data-action='open-person-module']").click()
        admin.wait_for_selector("[data-section='access-drawer']", timeout=10000)
        admin.wait_for_timeout(400)
        visc = admin.locator("[data-section='access-drawer'] [data-access-line='qc-viscosity']")
        check("The drawer lists Ankur Raval's Quality Control documents, F-QC-30 answered for", visc.count() == 1 and visc.locator("[data-field='answers-for']").is_checked() and visc.get_attribute("data-level") == "edit")
        bopp = admin.locator("[data-section='access-drawer'] [data-access-line='qc-bopp-film']")
        bopp.locator("select[data-field='document-level']").select_option("none")
        admin.wait_for_selector("[data-action='confirm-access']", timeout=10000)
        ask = admin.locator(".modal-box h3").last.inner_text()
        check("...a document's own level is asked first too", "Take away Ankur Raval's access on" in ask, ask)
        admin.click("[data-action='confirm-access']")
        admin.wait_for_selector("[data-section='access-note']", timeout=15000)
        admin.wait_for_timeout(500)
        rules, _ = rules_now(admin)
        check("...and stored for that document alone", ((rules.get("people") or {}).get(ANKUR) or {}).get("documents", {}).get("qc-bopp-film") == "none", rules)
        bopp.locator("[data-field='answers-for']").click()
        admin.wait_for_selector("[data-action='confirm-access']", timeout=10000)
        ask = admin.locator(".modal-box h3").last.inner_text()
        admin.click("[data-action='confirm-access']")
        admin.wait_for_timeout(1500)
        rules, _ = rules_now(admin)
        check("'Answers for it' is asked and stored as who answers for the document", ask.startswith("Make Ankur Raval answer for") and ANKUR in ((rules.get("responsibility") or {}).get("qc-bopp-film") or []), (ask, rules.get("responsibility")))
        admin.click("[data-action='close-drawer']")
        admin.wait_for_timeout(300)

        admin.click("[data-action='show-who-fills']")
        admin.wait_for_selector("[data-section='who-fills-what']", timeout=10000)
        zala = admin.locator("[data-who-document='qc-inprocess-printing'] [data-field='answers']").inner_text()
        both = admin.locator("[data-who-document='qc-bopp-film'] [data-field='answers']").inner_text()
        check("Who fills what: F/QC/13 is Ajay Zala's, F/QC/01 now Kapila Barad's and Ankur Raval's", "Ajay Zala" in zala and "Kapila Barad" in both and "Ankur Raval" in both, (zala, both))
        admin.click("[data-action='show-who-fills']")
        admin.wait_for_timeout(300)

        # Super admin or staff.
        me_row = admin.locator(f"[data-table='users'] tr[data-user='{ADMIN}']")
        check("The last super admin cannot be made staff", me_row.locator("[data-action='make-staff']").is_disabled())
        admin.locator(f"[data-table='users'] tr[data-user='{BHARAT}'] [data-action='make-admin']").click()
        admin.wait_for_selector("[data-action='confirm-ask']", timeout=10000)
        words = admin.locator("[data-section='confirm-user-action']").inner_text()
        check("Make super admin is asked in plain words", "Bharat Ahir" in words and "every module" in words and "any hour" in words, words)
        admin.click("[data-action='confirm-ask']")
        admin.wait_for_timeout(1500)
        roles_to_restore.append(BHARAT)
        users = (api(admin, "GET", "/api/users").get("body") or {}).get("users") or []
        bharat = next((u for u in users if u.get("email") == BHARAT), {})
        check("...and Bharat Ahir is a super admin", bharat.get("role") == "admin", bharat)
        admin.locator(f"[data-table='users'] tr[data-user='{BHARAT}'] [data-action='make-staff']").click()
        admin.wait_for_selector("[data-action='confirm-ask']", timeout=10000)
        admin.click("[data-action='confirm-ask']")
        admin.wait_for_timeout(1500)
        users = (api(admin, "GET", "/api/users").get("body") or {}).get("users") or []
        bharat = next((u for u in users if u.get("email") == BHARAT), {})
        check("Make staff puts Bharat Ahir back", bharat.get("role") == "staff", bharat)
        if bharat.get("role") == "staff":
            roles_to_restore.remove(BHARAT)

        # The change reaches the person: Ankur Raval sees Production at the next sign-in, and is told.
        sign_in(staff, ANKUR)
        ids = {d["id"] for d in library_docs(staff)}
        check("At the next sign-in Ankur Raval sees Production", "prd-alc-production" in ids, len(ids))
        check("...and no longer F/QC/01, taken away on its own", "qc-bopp-film" not in ids)
        go(staff, "/document/prd-alc-production", "[data-page='document-records']", 1200)
        check("...with Edit there: New record and Edit format", staff.locator("[data-action='document-new-record']").count() == 1 and staff.locator("[data-action='edit-format']").count() == 1)
        _, items = unread_of(staff)
        check("...and was told of the change (a notification)", any(i.get("kind") == "access_changed" for i in items), [i.get("kind") for i in items])
        sign_out(staff)

        # ==============================================================
        # 4. The bell and the Notifications page
        # ==============================================================
        print("\n==== The bell and the Notifications page ====")
        ran = api(admin, "POST", "/api/jobs/run", {"job": "notify"})
        check("The notify job runs by hand", ran["status"] == 200, ran["text"][:300])
        sign_in(staff, KAPILA)
        go(staff, "/dashboard", None, 2500)
        unread, items = unread_of(staff)
        check("Kapila Barad has notifications, unread", (unread or 0) > 0 and len(items) > 0, (unread, len(items)))
        bell = staff.locator("button[aria-label='Reminders']")
        staff.wait_for_function("() => { const b = document.querySelector(\"button[aria-label='Reminders']\"); return b && b.getAttribute('data-unread') !== null; }", timeout=20000)
        check("The bell knows how many are unread", int(bell.get_attribute("data-unread") or "-1") == unread, (bell.get_attribute("data-unread"), unread))
        bell.click()
        staff.wait_for_selector("[data-section='bell-notifications']", timeout=10000)
        staff.wait_for_timeout(500)
        in_bell = staff.locator("[data-section='bell-notifications'] [data-notification]")
        check("Opened, it lists them (at most 20), the unread marked", 0 < in_bell.count() <= 20 and staff.locator("[data-section='bell-notifications'] [data-unread='yes']").count() > 0, in_bell.count())
        staff.click("[data-action='bell-see-all']")
        staff.wait_for_selector("[data-section='notification-list']", timeout=20000)
        staff.wait_for_timeout(800)
        check("'See all' opens the Notifications page, by day", "#/notifications" in staff.url and staff.locator("[data-section='notification-list'] [data-day]").count() >= 1)
        first = staff.locator("[data-section='notification-list'] [data-notification][data-unread='yes']").first
        first_id = first.get_attribute("data-notification")
        first.click()
        staff.wait_for_timeout(2000)
        check("An item opens its record (or its document)", any(s in staff.url for s in ("#/record/", "#/document/", "#/gap/", "#/training/", "#/pest/")), staff.url)
        _, items = unread_of(staff)
        opened_item = next((i for i in items if str(i.get("id")) == first_id), {})
        check("...and is read now", opened_item.get("readAt") is not None, opened_item)
        go(staff, "/notifications", "[data-section='notification-list']", 1200)
        staff.click("[data-action='mark-all-read']")
        staff.wait_for_timeout(1500)
        unread, _ = unread_of(staff)
        check("'Mark all read' leaves none unread", unread == 0 and staff.locator("[data-section='notification-list'] [data-unread='yes']").count() == 0, unread)
        # In Gujarati, the notifications are worded in Gujarati by the server.
        lang = staff.locator(".app-topbar .lang-select")
        if lang.count():
            lang.first.select_option("gu")
            staff.wait_for_timeout(1500)
            go(staff, "/notifications", "[data-section='notification-list']", 1500)
            title = staff.locator("[data-section='notification-list'] .notif-title").first.inner_text()
            check("In Gujarati, the notifications are in Gujarati", re.search(r"[઀-૿]", title) is not None, title)
            staff.locator(".app-topbar .lang-select").first.select_option("en")
            staff.wait_for_timeout(1200)
        sign_out(staff)

        go(admin, "/notifications", "[data-page='notifications']", 2000)
        summary = admin.locator("[data-kind='boss_summary']")
        check("The super admin's include the summary by module", summary.count() >= 1 and admin.locator("[data-section='boss-summary-modules'] [data-summary-module]").count() >= 1)

        # ==============================================================
        # 5. What the people review of 9-Oct-2026 found
        # ==============================================================
        print("\n==== The people review of 9-Oct-2026 ====")
        count, nxt, card = day_card(admin)
        check(
            "The super admin's day card is the plant's day, with no score of the super admin's own",
            card.get_attribute("data-plant-day") == "yes" and admin.locator("[data-section='my-day'] [data-field='my-day-score']").count() == 0,
            card.inner_text()[:300],
        )

        sign_in(staff, "dharmik.mistry@gpp.local")
        count, nxt, card = day_card(staff)
        total = 0 if count in ("", "\u2713") else int(count.split("/")[-1])
        # At most F/PRD/10's own records up to today (one a working day; more only after other suites' days): the other
        # eight Production sheets, which Dharmik only reads, would add theirs.
        today = time.strftime("%Y-%m-%d")
        own_lines = [l for l in json.loads(next((i["value"] for i in (api(staff, "GET", "/api/storage").get("body") or {}).get("items") or [] if i.get("key") == "records"), "[]")) if l.get("documentId") == "prd-sharp-object-issue" and not l.get("isDemo") and (l.get("dueDate") or "9999") <= today]
        check("Dharmik Mistry's day is F/PRD/10 alone, never the Production sheets Dharmik only reads", total <= max(1, len(own_lines)) and (not nxt or "PRD/10" in nxt), (count, nxt, len(own_lines)))
        sign_out(staff)

        sign_in(staff, "chirag.parmar@gpp.local")
        modules = staff.evaluate("() => Array.from(document.querySelectorAll('.app-sidebar .nav-module[data-module]')).map((m) => m.getAttribute('data-module'))")
        check("Chirag Parmar's sidebar is Purchase alone: no Human Resources module for the service agreement", modules == ["Purchase"], modules)
        check("...with the pest control service agreement under Purchase", staff.locator(".app-sidebar .nav-module[data-module='Purchase'] a[href$='/licence/agreement']").count() == 1)
        go(staff, "/licence/agreement", "[data-section='agreement-only']", 1500)
        check("...which opens the agreement on its own page", staff.locator("[data-section='agreement-only']").count() == 1)
        sign_out(staff)

        sign_in(staff, VINAY)
        go(staff, "/dashboard", None, 2500)
        bell = staff.locator("button[aria-label='Reminders']")
        bell.click()
        staff.wait_for_selector("[data-section='reminders-panel']", timeout=10000)
        named = staff.locator("[data-section='reminders-panel'] [data-field='answered-by']").all_inner_texts()
        check("The bell names who answers for each document by the owner's table, never Master Data's roles", all(n.startswith("Answers for it:") or n.startswith("Nobody is named") for n in named) and not any("Assigned" in n for n in named), named)
        staff.keyboard.press("Escape")
        staff.wait_for_timeout(400)
        check("Escape closes the bell's panel", staff.locator("[data-section='reminders-panel']").count() == 0)
        bell.click()
        staff.wait_for_selector("[data-section='reminders-panel']", timeout=10000)
        staff.evaluate("() => { window.location.hash = '#/library'; }")
        staff.wait_for_timeout(1500)
        check("...and so does going to another page", staff.locator("[data-section='reminders-panel']").count() == 0)
        lang = staff.locator(".app-topbar .lang-select")
        if lang.count():
            lang.first.select_option("gu")
            staff.wait_for_timeout(1500)
            go(staff, "/dashboard", None, 2500)
            # The bell by its own attribute: with Gujarati chosen, a button labelled "Reminders" was not found (9-Oct-2026).
            staff.locator("button[data-escalations]").first.click()
            staff.wait_for_selector("[data-section='reminders-panel']", timeout=10000)
            heading = staff.locator("[data-section='reminders-panel'] strong").first.inner_text()
            check("In Gujarati (Google Translate out of reach), the bell's own words are DCRS's Gujarati", re.search(r"[\u0A80-\u0AFF]", heading) is not None, heading)
            staff.keyboard.press("Escape")
            staff.wait_for_timeout(300)
            nudge = staff.locator("[data-field='nudge-headline']")
            if nudge.count():
                check("...and so is the day's nudge", re.search(r"[\u0A80-\u0AFF]", nudge.first.inner_text()) is not None, nudge.first.inner_text())
            staff.locator(".app-topbar .lang-select").first.select_option("en")
            staff.wait_for_timeout(1200)
        go(staff, "/notifications", "[data-page='notifications']", 1500)
        check("Staff are not shown the super admin's job buttons", staff.locator("[data-section='server-jobs']").count() == 0)
        go(staff, "/document/hr-daily-cleaning", "[data-page='document-records']", 1500)
        open_mitra(staff)
        reply = say(staff, "fill F/HR/15 question by question")
        check("Mitra, asked by Vinay Bhojak to fill F/HR/15, gives the access refusal in words, never 'I'll reopen it'", "Read only for you" in reply and "Write access" in reply and "reopen it for you" not in reply, reply)
        close_assistant(staff)
        sign_out(staff)

        go(admin, "/notifications", "[data-section='server-jobs']", 1500)
        admin.click("[data-action='run-morning-prepare']")
        admin.wait_for_selector("[data-field='job-outcome'][data-job='morning-prepare']", timeout=180000)
        outcome = admin.locator("[data-field='job-outcome']").first
        said = outcome.inner_text()
        check("The super admin prepares today's records from a button, told in words", outcome.get_attribute("data-failed") == "no" and re.search(r"Prepared \d+ records?|Nothing was left to prepare", said) is not None, said)
        admin.click("[data-action='run-notify']")
        admin.wait_for_selector("[data-field='job-outcome'][data-job='notify']", timeout=180000)
        outcome = admin.locator("[data-field='job-outcome']").first
        said = outcome.inner_text()
        check("...and sends the notifications from a button, told in words", outcome.get_attribute("data-failed") == "no" and "notifications worked out" in said, said)

        # A 409 is the server saying "somebody saved first" (the stale page above, a records merge): the protocol, not a fault.
        check("No JavaScript errors", not [e for e in ERRORS if "status of 409" not in e], ERRORS[:5])
    finally:
        # Put back what the other suites rely on: the owner's table and the roles.
        try:
            _, version = rules_now(admin)
            if isinstance(version, int):
                api(admin, "PUT", "/api/access/rules", {"rules": {"version": 1, "people": {}, "responsibility": {}}, "baseVersion": version})
            users = (api(admin, "GET", "/api/users").get("body") or {}).get("users") or []
            for email in roles_to_restore:
                u = next((x for x in users if x.get("email") == email), None)
                if u:
                    api(admin, "POST", f"/api/users/{u['id']}/role", {"role": "staff"})
        except Exception as e:  # noqa: BLE001
            print("could not put the rules back:", e)
        browser.close()

print(f"\n{len(FAILURES)} failure(s)")
for f in FAILURES:
    print(" -", f)
sys.exit(1 if FAILURES else 0)
