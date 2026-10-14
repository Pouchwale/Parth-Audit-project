"""The blank sheets from before the system went live are moved, never deleted
(REQUIREMENTS s115), asked for on 13-Oct-2026 when the banner "Found 3457
blank records generated for dates before 08-Sep-2026 ... Safe to remove"
stood on every profile: "make sure do fix it anyhow without any loss of any
records or any modules".

  * blank sheets dated before go-live, planted in the database as a browser
    once made them, are moved by the server into its archive (run here by the
    super admin's POST /api/archive/blanks/run, which is the start-up step):
    out of the records, in the archive, nothing else touched;
  * no banner and no "Clean up" / "Remove them" on the Dashboard, in the
    briefing or on the storage banner, for the super admin or for staff;
  * a browser holding the old copy cannot bring them back: a PUT of the old
    records keeps everything but those, and says how many it kept out;
  * only the super admin, under Master Data -> Working Hours & Briefing, sees
    "Blank sheets from before go-live, kept in the archive: N" and "Bring
    them back", which restores exactly those (never a duplicate) and reaches
    the browser through the sync; staff see no card;
  * each move and each restore is a line of the activity log.

Network-independent. Against the test server on :8842 (sign-up open: the
first account is the super admin, later ones staff).
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []
STAMP = int(time.time() * 1000)
PREFIX = f"archive-qa-{STAMP}-"
PLANTED = 12


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:600])


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
            try:
                g.first.click(timeout=3000)
            except Exception:
                pass
            page.wait_for_timeout(200)
    settle_briefing(page)
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        try:
            btn.first.click(timeout=3000)
        except Exception:
            pass
        page.wait_for_timeout(200)


def logged_in(page):
    return page.locator(".app-sidebar").count() > 0


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


def sign_in(page, email, name):
    """Signs in, creating the account the first time (the first account of the server is the super admin)."""
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(600)
    if logged_in(page):
        sign_out(page)
    page.wait_for_selector("#login-email", timeout=60000)
    page.fill("#login-email", email)
    page.fill("#login-password", PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    if not logged_in(page):
        page.click("text=Sign up")
        page.wait_for_timeout(300)
        page.fill("#signup-name", name)
        page.fill("#signup-email", email)
        page.fill("#signup-password", PASSWORD)
        page.fill("#signup-confirm", PASSWORD)
        page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)


# The browser's own calls to the server, with its session cookie. X-Account is the account's id (the app sends it on every storage call).
def api(page, method, path, body=None, headers=None):
    return page.evaluate(
        """async ([method, path, body, headers]) => {
             const me = await fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json());
             const h = { 'X-Account': me.user ? me.user.id : '', ...(headers || {}) };
             if (body !== null) h['Content-Type'] = 'application/json';
             const res = await fetch(path, { method, credentials: 'same-origin', headers: h, body: body === null ? undefined : body });
             let json = null;
             try { json = await res.json(); } catch (e) { json = null; }
             return { status: res.status, json };
           }""",
        [method, path, body, headers],
    )


def stored_records(page):
    """The records item as the database holds it (a super admin reads everything)."""
    out = api(page, "GET", "/api/storage?since=0")
    for item in out["json"]["items"]:
        if item["key"] == "records":
            return json.loads(item["value"]), item["version"]
    return [], 0


def live_start(page):
    out = api(page, "GET", "/api/storage?since=0")
    for item in out["json"]["items"]:
        if item["key"] == "live-start":
            return json.loads(item["value"]).get("date")
    return None


def shell(i, due):
    return {
        "id": f"{PREFIX}{i}",
        "documentId": "daily-pest-monitoring",
        "periodKey": f"daily-pest-monitoring:{due}:{PREFIX}{i}",
        "dueDate": due,
        "status": "Scheduled" if i % 3 == 0 else "Due",
        "isDemo": False,
        "data": {"checkpoints": {}, "summaryActions": [], "rodentCatches": []},
        "createdAt": f"{due}T03:00:00.000Z",
        "updatedAt": f"{due}T03:00:00.000Z",
    }


def planted_in(records):
    return sorted(r["id"] for r in records if str(r.get("id", "")).startswith(PREFIX))


def activity_lines(page, action):
    out = api(page, "GET", "/api/activity?limit=100")
    lines = (out["json"] or {}).get("lines") or (out["json"] if isinstance(out["json"], list) else [])
    return [l for l in lines if l.get("action") == action]


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    print("\n==== The super admin, and the sheets planted as a browser once made them ====")
    sign_in(page, f"archive-admin-{STAMP}@example.com", "Archive Admin QA")
    me = api(page, "GET", "/api/auth/me")["json"]
    check("The first account is the super admin", me.get("user", {}).get("role") == "admin", me)
    go_live = live_start(page)
    check("The system has a go-live day", bool(go_live), go_live)
    records, version = stored_records(page)
    before_ids = {r["id"] for r in records}
    # A dozen blank sheets for the twelve days before go-live, as the old calendar made them, plus one a person
    # wrote on (In Progress, no preparation) which must never move.
    y, m, d = (int(x) for x in go_live.split("-"))
    import datetime

    first = datetime.date(y, m, d)
    planted = [shell(i, (first - datetime.timedelta(days=i + 1)).isoformat()) for i in range(PLANTED)]
    written = dict(shell(99, (first - datetime.timedelta(days=30)).isoformat()), status="In Progress", updatedAt=f"{(first - datetime.timedelta(days=30)).isoformat()}T09:00:00.000Z")
    put = api(page, "PUT", "/api/storage/records", json.dumps(records + planted + [written]), {"X-Base-Version": str(version)})
    check("The planted sheets are stored", put["status"] == 200, put)
    stored, _ = stored_records(page)
    check("The database holds them all", len(planted_in(stored)) == PLANTED + 1, planted_in(stored))

    print("\n==== The move: into the archive, out of the records, nothing else touched ====")
    run = api(page, "POST", "/api/archive/blanks/run")
    check("The super admin runs the move (the server's own start-up step)", run["status"] == 200 and run["json"].get("moved", 0) >= PLANTED, run)
    stored, _ = stored_records(page)
    check("The blank sheets are out of the records", planted_in(stored) == [f"{PREFIX}99"], planted_in(stored))
    check("The sheet a person wrote on stays", any(r["id"] == f"{PREFIX}99" and r["status"] == "In Progress" for r in stored))
    check("Every record from before is still there", before_ids <= {r["id"] for r in stored}, len(before_ids & {r["id"] for r in stored}))
    count = api(page, "GET", "/api/archive/blanks")["json"]
    check("The archive keeps them", count.get("count", 0) >= PLANTED, count)
    check("A line of the activity log says they were archived", len(activity_lines(page, "Blank sheets archived")) >= 1)

    print("\n==== No banner, no clean-up, anywhere ====")
    page.goto(f"{BASE}/index.html#/")
    page.wait_for_timeout(2500)
    dismiss(page)
    body = page.locator("body").inner_text()
    check("The Dashboard shows no 'Found N blank records' banner", "blank record" not in body and "Clean up" not in body, body[:300])
    opener = page.locator("button:has-text('Open briefing')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(800)
    popup = page.locator(".briefing")
    if popup.count():
        text = popup.first.inner_text()
        check("The briefing offers no clean-up", "Clean up" not in text and "leftover records" not in text, text[:300])
        close = page.locator("button[aria-label='Close briefing']")
        if close.count():
            close.first.click()
    check("No 'Remove them' button exists on any screen", page.locator("[data-action='purge-leftovers']").count() == 0)

    print("\n==== A browser holding the old copy cannot bring them back ====")
    stored, version = stored_records(page)
    put = api(page, "PUT", "/api/storage/records", json.dumps(stored + planted), {"X-Base-Version": str(version)})
    check("The old copy is written without the archived sheets, and says how many it kept out", put["status"] == 200 and put["json"].get("keptOut") == PLANTED, put)
    stored, _ = stored_records(page)
    check("The records still do not hold them", planted_in(stored) == [f"{PREFIX}99"], planted_in(stored))
    check("The archive still keeps them", api(page, "GET", "/api/archive/blanks")["json"].get("count", 0) >= PLANTED)

    print("\n==== Master Data: the super admin's card, and 'Bring them back' ====")
    page.goto(f"{BASE}/index.html#/master-data")
    page.wait_for_timeout(1500)
    dismiss(page)
    page.locator(".pill-tab", has_text="Working Hours & Briefing").first.click()
    page.wait_for_selector("[data-section='archived-blanks']", timeout=15000)
    card = page.locator("[data-section='archived-blanks']")
    shown = int(card.get_attribute("data-count") or "0")
    check("The card says how many the archive keeps", shown >= PLANTED and "kept in the archive" in card.inner_text(), card.inner_text()[:200])
    page.locator("[data-action='restore-archived-blanks']").click()
    page.wait_for_selector("[data-section='archived-blanks-said']", timeout=15000)
    said = page.locator("[data-section='archived-blanks-said']").inner_text()
    check("Brought back, in words", "Brought back" in said, said)
    page.wait_for_timeout(1500)
    stored, _ = stored_records(page)
    check("The records hold every planted sheet again, exactly once", planted_in(stored) == sorted([f"{PREFIX}{i}" for i in range(PLANTED)] + [f"{PREFIX}99"]), planted_in(stored))
    back = {r["id"]: r for r in stored}
    check("Exactly as they were", all(back[s["id"]] == s for s in planted), [k for s in planted for k in s if back.get(s["id"], {}).get(k) != s[k]][:5])
    check("The archive keeps none of them now", int(page.locator("[data-section='archived-blanks']").get_attribute("data-count") or "-1") == 0)
    page.wait_for_timeout(6000)  # the sync's pull
    local = page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').map((r) => r.id)")
    check("This browser received them through the sync", all(s["id"] in local for s in planted), len([s for s in planted if s["id"] in local]))
    check("A line of the activity log says they were brought back", len(activity_lines(page, "Blank sheets brought back")) >= 1)
    run = api(page, "POST", "/api/archive/blanks/run")
    check("Run again, the server never moves what the super admin brought back", run["status"] == 200 and run["json"].get("moved") == 0, run)

    print("\n==== Staff: nothing of it ====")
    sign_in(page, f"archive-staff-{STAMP}@example.com", "Archive Staff QA")
    me = api(page, "GET", "/api/auth/me")["json"]
    check("A later account is staff", me.get("user", {}).get("role") == "staff", me)
    page.goto(f"{BASE}/index.html#/")
    page.wait_for_timeout(2000)
    dismiss(page)
    body = page.locator("body").inner_text()
    check("Staff see no banner and no clean-up", "blank record" not in body and "Clean up" not in body, body[:300])
    page.goto(f"{BASE}/index.html#/master-data")
    page.wait_for_timeout(1500)
    dismiss(page)
    tab = page.locator(".pill-tab", has_text="Working Hours & Briefing")
    if tab.count():
        tab.first.click()
        page.wait_for_timeout(800)
    check("Staff see no archive card", page.locator("[data-section='archived-blanks']").count() == 0)
    refused = api(page, "GET", "/api/archive/blanks")
    check("The archive's routes are the super admin's alone", refused["status"] == 403, refused)

    print("\n==== Tidy up: the planted sheets taken out again ====")
    sign_in(page, f"archive-admin-{STAMP}@example.com", "Archive Admin QA")
    stored, version = stored_records(page)
    put = api(page, "PUT", "/api/storage/records", json.dumps([r for r in stored if not str(r.get("id", "")).startswith(PREFIX)]), {"X-Base-Version": str(version)})
    check("The planted sheets are removed from the test server", put["status"] == 200, put)

    check("No JS page errors", not [e for e in errors if "401" not in e], errors)
    browser.close()

print(f"\n{'ALL PASSED' if not FAILURES else str(len(FAILURES)) + ' FAILED: ' + '; '.join(FAILURES)}")
sys.exit(1 if FAILURES else 0)
