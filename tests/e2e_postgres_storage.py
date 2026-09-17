"""The whole project's data is in PostgreSQL.

Asked for on 17-Sep-2026: "make sure i want my whole project database will be in
postgres only not any other else". REQUIREMENTS s55. The runner gives this suite
(like every suite) a PostgreSQL of its own. This suite checks that:

  * signing in loads the app from the database, and what the app sets up - the
    documents, the records, master data, HR Master Data - is stored there, the
    company's once and a person's settings as their own;
  * a change made by one person is in the database and reaches another person
    signed in elsewhere, on their open screen, without a reload;
  * a person's own settings (the language) stay theirs;
  * two people changing the same register at once both keep their change
    (the second write is refused as out of date, merged and written again);
  * a change the database could not take is said so on screen, kept on the
    computer, and goes as soon as the database answers again;
  * a change still on its way when the page was closed reaches the database at
    the next sign-in;
  * signing out and in again in the same tab never writes the old copy back
    over what others did in between;
  * records a browser kept from before the database existed are merged in at
    its first sign-in, not thrown away;
  * an account kept to a department is handed only that department's records,
    not HR Master Data, and what it writes leaves everyone else's records alone;
  * the date the system went live is the company's, not a person's;
  * the server's accounts are in PostgreSQL: signing in works, a wrong password
    does not.

Network-independent, against the production build on :8842.
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


def signup(page, name, email):
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(500)
    page.click("text=Sign up")
    page.fill("#signup-name", name)
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    try:
        page.wait_for_selector("button:has-text('Got it')", timeout=8000)
        page.locator("button:has-text('Got it')").first.click()
    except Exception:
        pass
    page.wait_for_timeout(400)


def stored(page):
    """What the database holds for the person signed in on this page: {key: (scope, version, value)}."""
    return page.evaluate(
        "async () => { const r = await fetch('/api/storage'); const j = await r.json(); return Object.fromEntries(j.items.map(i => [i.key, [i.scope, i.version, i.value]])); }"
    )


def person_on_server(page, pid):
    import json

    item = stored(page).get("hrMasterData")
    if not item:
        return None
    return next((p for p in json.loads(item[2])["people"] if p["id"] == pid), None)


def gp3_box(page, pid):
    return page.locator(f"[data-table='hr-master'] tr[data-person='{pid}'] input[data-field='gp3No']")


def set_gp3(page, pid, value):
    box = gp3_box(page, pid)
    box.fill(value)
    box.blur()


def records_on_server(page):
    import json

    item = stored(page).get("records")
    return json.loads(item[2]) if item else []


def put_records(page, change):
    """Changes the stored records the way another client would: read, change, write with the version read."""
    return page.evaluate(
        """async (change) => {
          for (let attempt = 0; attempt < 5; attempt++) {
            const j = await (await fetch('/api/storage')).json();
            const item = j.items.find((i) => i.key === 'records');
            const records = JSON.parse(item.value);
            const now = new Date().toISOString();
            records.push({ id: change.id, documentId: change.documentId, periodKey: change.documentId + ':2020-02-02#' + change.id, dueDate: '2020-02-02', status: 'Verified', isDemo: false, data: {}, createdAt: now, updatedAt: now });
            const res = await fetch('/api/storage/records', { method: 'PUT', headers: { 'Content-Type': 'text/plain', 'X-Base-Version': String(item.version) }, body: JSON.stringify(records) });
            if (res.status !== 409) return res.status;
          }
          return 409;
        }""",
        change,
    )


def wait_until(fn, timeout_s=15, step_ms=300, page=None):
    end = time.time() + timeout_s
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:
            pass
        page.wait_for_timeout(step_ms)
    return False


with sync_playwright() as p:
    browser = p.chromium.launch()
    stamp = int(time.time() * 1000)
    alpha_ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    beta_ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    a = alpha_ctx.new_page()
    b = beta_ctx.new_page()
    errors = []
    for page in (a, b):
        page.on("pageerror", lambda e: errors.append(str(e)))

    # ==================================================================
    # 1. Signing in loads the app from the database, and what it sets up is stored there
    # ==================================================================
    signup(a, "Database Alpha", f"db-alpha-{stamp}@example.com")
    a.wait_for_timeout(2500)
    items = stored(a)
    check("Signing in starts the app, and what it sets up is stored in the database", all(k in items for k in ["documents", "records", "master", "hrMasterData", "settings"]), sorted(items))
    check("...the plant's documents, records, master data and HR Master Data once, for the company", all(items[k][0] == "company" for k in ["documents", "records", "master", "hrMasterData"]))
    check("...and the person's settings as their own", items["settings"][0] == "user")
    local_records = a.evaluate("() => localStorage.getItem('dcrs:v1:records')")
    check("The browser's working copy is the database's", local_records == items["records"][2])

    # ==================================================================
    # 2. One person's change reaches another
    # ==================================================================
    a.goto(f"{BASE}/index.html#/hr/master-data")
    a.wait_for_timeout(1200)
    set_gp3(a, "hrm-hrc-38", "3001")
    check("A change on the HR Master Data sheet is written to the database within moments",
          wait_until(lambda: (person_on_server(a, "hrm-hrc-38") or {}).get("gp3No") == "3001", page=a), person_on_server(a, "hrm-hrc-38"))

    signup(b, "Database Beta", f"db-beta-{stamp}@example.com")
    b.goto(f"{BASE}/index.html#/hr/master-data")
    b.wait_for_timeout(1200)
    check("Another person signing in elsewhere sees it", gp3_box(b, "hrm-hrc-38").input_value() == "3001", gp3_box(b, "hrm-hrc-38").input_value())
    set_gp3(b, "hrm-hrc-1", "3002")
    check("...and their own change reaches the first person's open screen, without a reload",
          wait_until(lambda: gp3_box(a, "hrm-hrc-1").input_value() == "3002", timeout_s=20, page=a), gp3_box(a, "hrm-hrc-1").input_value())

    # ==================================================================
    # 3. A person's own settings stay theirs
    # ==================================================================
    b.select_option("select:has(option[value='gu'])", "gu")
    b.wait_for_timeout(1500)
    a.reload()
    a.wait_for_selector(".app-sidebar", timeout=60000)
    a.wait_for_timeout(1200)
    import json

    a_settings = json.loads(stored(a)["settings"][2])
    check("One person switching to Gujarati leaves the other's language as it was", a_settings.get("language", "en") == "en" and a.locator("select:has(option[value='gu'])").first.input_value() == "en", a_settings.get("language"))
    b.select_option("select:has(option[value='gu'])", "en")
    b.wait_for_timeout(2500)

    # ==================================================================
    # 4. Two people changing the same register at once both keep their change
    # ==================================================================
    a.goto(f"{BASE}/index.html#/hr/master-data")
    b.goto(f"{BASE}/index.html#/hr/master-data")
    a.wait_for_timeout(1500)
    b.wait_for_timeout(1500)
    # B stops hearing from the database for a moment, so its copy is out of date when it writes.
    b.route("**/api/storage?since=*", lambda route: route.abort())
    set_gp3(a, "hrm-hrc-2", "3003")
    wait_until(lambda: (person_on_server(a, "hrm-hrc-2") or {}).get("gp3No") == "3003", page=a)
    set_gp3(b, "hrm-hrc-3", "3004")
    both = wait_until(
        lambda: (person_on_server(a, "hrm-hrc-2") or {}).get("gp3No") == "3003" and (person_on_server(a, "hrm-hrc-3") or {}).get("gp3No") == "3004",
        timeout_s=20,
        page=a,
    )
    check("Two people changing the same sheet at the same time both keep their change", both, (person_on_server(a, "hrm-hrc-2"), person_on_server(a, "hrm-hrc-3")))
    b.unroute("**/api/storage?since=*")
    check("...and the one who wrote second sees the other's change too", wait_until(lambda: gp3_box(b, "hrm-hrc-2").input_value() == "3003", timeout_s=20, page=b), gp3_box(b, "hrm-hrc-2").input_value())

    # ==================================================================
    # 5. The database not answering: said, kept, sent again
    # ==================================================================
    a.route("**/api/storage/hrMasterData", lambda route: route.abort())
    set_gp3(a, "hrm-hrc-4", "3005")
    check("A change the database cannot take is said so on screen",
          wait_until(lambda: a.locator("[data-state='database-sync-failing']").count() == 1, timeout_s=15, page=a))
    check("...kept on the computer", gp3_box(a, "hrm-hrc-4").input_value() == "3005" and "3005" in (a.evaluate("() => localStorage.getItem('dcrs:v1:hrMasterData')") or ""))
    a.unroute("**/api/storage/hrMasterData")
    check("...and sent as soon as the database answers again, the message going",
          wait_until(lambda: (person_on_server(a, "hrm-hrc-4") or {}).get("gp3No") == "3005" and a.locator("[data-state='database-sync-failing']").count() == 0, timeout_s=25, page=a),
          person_on_server(a, "hrm-hrc-4"))

    # ==================================================================
    # 6. A change still on its way when the page closed goes at the next sign-in
    # ==================================================================
    a.route("**/api/storage/hrMasterData", lambda route: route.abort())
    set_gp3(a, "hrm-hrc-6", "3006")
    a.wait_for_timeout(700)
    check("(the change has not reached the database)", (person_on_server(a, "hrm-hrc-6") or {}).get("gp3No") != "3006")
    a.unroute("**/api/storage/hrMasterData")
    a.close()
    a = alpha_ctx.new_page()
    a.on("pageerror", lambda e: errors.append(str(e)))
    a.goto(f"{BASE}/index.html#/hr/master-data")
    a.wait_for_selector(".app-sidebar", timeout=60000)
    check("A change still on its way when the page was closed reaches the database when the app is next opened",
          wait_until(lambda: (person_on_server(a, "hrm-hrc-6") or {}).get("gp3No") == "3006", timeout_s=15, page=a), person_on_server(a, "hrm-hrc-6"))
    check("...and nobody's other changes were lost on the way", (person_on_server(a, "hrm-hrc-1") or {}).get("gp3No") == "3002" and (person_on_server(a, "hrm-hrc-3") or {}).get("gp3No") == "3004")

    # ==================================================================
    # 7. Signing out and in again in the same tab keeps what others did meanwhile
    # ==================================================================
    import json

    a.goto(f"{BASE}/index.html#/calendar")
    a.wait_for_timeout(1500)
    a.locator("button[title='Log Out']").first.click()
    a.wait_for_selector("#login-email", timeout=20000)
    other_id = f"pg-meanwhile-{stamp}"
    check("(meanwhile, someone else adds a record)", put_records(b, {"id": other_id, "documentId": "daily-pest-monitoring"}) == 200)
    a.fill("#login-email", f"db-alpha-{stamp}@example.com")
    a.fill("#login-password", PASSWORD)
    a.click("button:has-text('Log In')")
    a.wait_for_selector(".app-sidebar", timeout=60000)
    a.wait_for_timeout(1200)
    # A month nobody has opened: the app makes its records, so the records are written.
    a.goto(f"{BASE}/index.html#/calendar/2027/3")
    wrote = wait_until(lambda: any(str(r.get("dueDate", "")).startswith("2027-04") for r in records_on_server(a)), timeout_s=20, page=a)
    check("Signing in again in the same tab and working on writes the records", wrote)
    check("...without writing the old copy back over the record someone added meanwhile", any(r["id"] == other_id for r in records_on_server(a)))

    # ==================================================================
    # 8. Records kept in a browser from before the database are merged in
    # ==================================================================
    gamma_ctx = browser.new_context(viewport={"width": 1400, "height": 1000})
    g = gamma_ctx.new_page()
    g.on("pageerror", lambda e: errors.append(str(e)))
    legacy_id = f"pg-legacy-{stamp}"
    g.goto(f"{BASE}/index.html")
    g.wait_for_timeout(500)
    g.evaluate(
        """(id) => {
          const now = '2026-03-01T10:00:00.000Z';
          localStorage.setItem('dcrs:v1:records', JSON.stringify([{ id, documentId: 'qc-viscosity', periodKey: 'qc-viscosity:2026-03-01#' + id, dueDate: '2026-03-01', status: 'Verified', isDemo: false, data: {}, createdAt: now, updatedAt: '2026-03-01T11:00:00.000Z' }]));
        }""",
        legacy_id,
    )
    signup(g, "Database Gamma", f"db-gamma-{stamp}@example.com")
    check(
        "A record this browser kept from before the database reaches it at the first sign-in",
        wait_until(lambda: any(r["id"] == legacy_id for r in records_on_server(g)), timeout_s=20, page=g),
    )
    check("...and nothing the database already held is lost to it", any(r["id"] == other_id for r in records_on_server(g)))
    gamma_ctx.close()

    # ==================================================================
    # 9. A department's account gets its department's records
    # ==================================================================
    qc = p.request.new_context(base_url=BASE)
    made = qc.post("/api/auth/signup", data={"name": "Database QC", "email": f"db-qc-{stamp}@example.com", "password": PASSWORD, "departments": ["QC"]})
    check("(an account kept to Quality Control)", made.status in (200, 201), made.status)
    given = qc.get("/api/storage").json()
    given_items = {i["key"]: i for i in given["items"]}
    qc_records = json.loads(given_items["records"]["value"]) if "records" in given_items else []
    hr_like = lambda r: r.get("documentId") in ("daily-pest-monitoring", "fly-catcher", "training-record") or str(r.get("documentId", "")).startswith("hr-")
    check(
        "An account kept to Quality Control is handed its own records and no Human Resources ones",
        any(r.get("documentId") == "qc-viscosity" for r in qc_records) and not any(hr_like(r) for r in qc_records),
        sorted({r.get("documentId") for r in qc_records})[:12],
    )
    check("...and not the HR Master Data sheet", "hrMasterData" not in given_items and "hrMasterData" in given.get("denied", []), given.get("denied"))
    refused = qc.put("/api/storage/hrMasterData", data='{"people":[],"removedSeedIds":[]}', headers={"Content-Type": "text/plain", "X-Base-Version": "*"})
    check("...which it cannot write either", refused.status == 403, refused.status)
    kept = [r for r in qc_records if r["id"] != legacy_id]
    written = qc.put("/api/storage/records", data=json.dumps(kept), headers={"Content-Type": "text/plain", "X-Base-Version": str(given_items["records"]["version"])})
    check("What it writes to the records is stored", written.status == 200, written.status)
    after = records_on_server(b)
    check(
        "...replacing only Quality Control's records: everyone else's stay as they were",
        not any(r["id"] == legacy_id for r in after) and any(r["id"] == other_id for r in after) and any(hr_like(r) for r in after),
    )
    junk = qc.put("/api/storage/anything-else", data="{}", headers={"Content-Type": "text/plain"})
    not_json = qc.put("/api/storage/settings", data="not json", headers={"Content-Type": "text/plain"})
    check("Only the app's own items are stored, and only as JSON", junk.status == 400 and not_json.status == 400, (junk.status, not_json.status))

    # ==================================================================
    # 10. The date the system went live is the company's
    # ==================================================================
    live = stored(b).get("live-start")
    check("The date the system went live is stored once, for the company", bool(live) and live[0] == "company" and json.loads(live[2]).get("date"), live)

    # ==================================================================
    # 11. The accounts are in the database
    # ==================================================================
    api = p.request.new_context(base_url=BASE)
    ok = api.post("/api/auth/login", data={"email": f"db-beta-{stamp}@example.com", "password": PASSWORD})
    bad = api.post("/api/auth/login", data={"email": f"db-beta-{stamp}@example.com", "password": "not the password"})
    check("An account signs in from the database, and a wrong password does not", ok.status == 200 and bad.status == 401, (ok.status, bad.status))
    anon = p.request.new_context(base_url=BASE)
    check("The stored data is only for somebody signed in", anon.get("/api/storage").status == 401)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe whole project's data is in PostgreSQL.")
