"""Demo Mode is not part of the product (REQUIREMENTS s65), asked for on 19-Sep-2026.

The portal is in real use, so nobody using it may see - or reach - a screen of
synthetic records. Demo Mode is a switch the SERVER owns: off unless it is
started with DEMO_MODE=1, which only scripts/run-e2e.ts does, for the suites
that stand on a year of demo records. This suite is the other half: the runner
starts a SECOND server for it, on :8843, on the same database and the same
build but WITHOUT Demo Mode - the product as it is installed - and checks that:

  * the server says so, with who is signed in (features.demoMode is false);
  * the top bar has no Live / Demo switch and no mode band, the sidebar no
    Demo Mode link;
  * "#/demo" typed into the address bar is "Page not found", like any other
    address that does not exist;
  * a "demo" left in somebody's settings from before is read as Live: no
    banner, no watermark;
  * the Dashboard, the Calendar and the Performance Scorecard do not say the
    word anywhere;
  * a demo record left in the database from before is removed when the app
    starts, there and in the working copy, and every Live record stays.

Mitra has no command of her own that switches to Demo Mode (the model is the
only way she navigates there, and the suites make no network calls), so that
is not exercised here: the route is refused by store/router.tsx
isValidAppRoute, and the model is not told the page exists (backend/assistant.ts).

Network-independent, against the production build on :8843.
"""
import re
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8843"
# The product server creates no account for a stranger (REQUIREMENTS s66): the
# runner seeds the plant's named accounts on this password and this suite signs
# in as the super admin, like anybody in the plant.
PASSWORD = "SeedQA@2026"
ACCOUNT_EMAIL = "admin@gpp.local"
FAILURES = []


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
            g.first.click()
            page.wait_for_timeout(200)
    settle_briefing(page)


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def open_page(page, route, settle=1300):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def reload_app(page):
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)


def stored(page, key):
    return page.evaluate("(k) => JSON.parse(localStorage.getItem('dcrs:v1:' + k) || 'null')", key)


def database_records(page):
    """The records as PostgreSQL holds them now, with the version they are at."""
    return page.evaluate(
        """async () => {
             const res = await fetch('/api/storage', { credentials: 'same-origin' });
             const item = ((await res.json()).items || []).find((i) => i.key === 'records');
             return item ? { version: item.version, records: JSON.parse(item.value) } : { version: 0, records: [] };
           }"""
    )


def says_demo(page):
    """The first place the screen says "demo", with the words around it - or None."""
    text = page.evaluate("() => document.body.innerText")
    found = re.search(r"demo", text, re.I)
    return None if not found else text[max(0, found.start() - 80) : found.end() + 80]


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    # Signed in, because on this server that is the only way in (REQUIREMENTS s66).
    email = ACCOUNT_EMAIL
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(500)
    page.fill("#login-email", email)
    page.fill("#login-password", PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)

    # ==================================================================
    # 1. The server says it has no Demo Mode
    # ==================================================================
    me = page.evaluate("async () => (await fetch('/api/auth/me', { credentials: 'same-origin' })).json()")
    check("GET /api/auth/me still says who is signed in", (me.get("user") or {}).get("email") == email, me)
    check("...and that this server has no Demo Mode: features.demoMode is false", (me.get("features") or {}).get("demoMode") is False, me.get("features"))
    signed_in = page.evaluate(
        """async ([email, password]) => (await fetch('/api/auth/login', {
             method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
           })).json()""",
        [email, PASSWORD],
    )
    check("Signing in is told the same", (signed_in.get("features") or {}).get("demoMode") is False and (signed_in.get("user") or {}).get("email") == email, signed_in)

    # ==================================================================
    # 2. No switch, no band, no link
    # ==================================================================
    open_page(page, "#/dashboard")
    check("The top bar is there, with no Live / Demo switch in it", page.locator(".app-topbar").count() == 1 and page.locator(".app-topbar .pill-tab").count() == 0, page.locator(".app-topbar").inner_text()[:300])
    check("No mode band under it: the product has one mode, so there is nothing to tell apart", page.locator(".mode-banner").count() == 0)
    check(
        "The sidebar's System group has its links, and none to Demo Mode",
        page.locator(".app-sidebar a[href='#/performance']").count() == 1 and page.locator(".app-sidebar a[href='#/demo']").count() == 0,
        page.locator(".app-sidebar a").evaluate_all("els => els.map((e) => e.getAttribute('href')).slice(-8)"),
    )

    # ==================================================================
    # 3. The address typed in is a page that does not exist
    # ==================================================================
    open_page(page, "#/demo")
    content = page.locator(".app-content").inner_text()
    check('"#/demo" typed into the address bar shows "Page not found"', "Page not found" in content, content[:300])
    check("...and nothing of the Demo Mode page", "Generate Demo Records" not in content and "Clear All Demo Data" not in content and page.locator(".demo-tag").count() == 0, content[:300])

    # ==================================================================
    # 4. A "demo" left in the settings from before is read as Live
    # ==================================================================
    open_page(page, "#/dashboard")
    page.evaluate(
        """() => {
             const KEY = 'dcrs:v1:settings';
             const s = JSON.parse(localStorage.getItem(KEY) || '{}');
             s.mode = 'demo';
             localStorage.setItem(KEY, JSON.stringify(s));
           }"""
    )
    check("(the settings were forced to demo)", (stored(page, "settings") or {}).get("mode") == "demo")
    reload_app(page)
    body = page.evaluate("() => document.body.innerText")
    check('With "demo" forced into the stored settings and the page reloaded, there is no DEMO MODE banner', "DEMO MODE" not in body and page.locator(".mode-banner").count() == 0, says_demo(page))
    check("...no watermark and no DEMO tag anywhere on the Dashboard", page.locator(".demo-watermark").count() == 0 and page.locator(".demo-tag").count() == 0)
    check("...and still no switch to go there", page.locator(".app-topbar .pill-tab").count() == 0)

    # ==================================================================
    # 5. The screens do not say the word
    # ==================================================================
    for route, name, marker in [
        ("#/dashboard", "The Dashboard", ".app-content h1"),
        ("#/calendar", "The Calendar", ".app-content .calendar-cell"),
        ("#/performance", "The Performance Scorecard", "[data-page='performance']"),
    ]:
        open_page(page, route, settle=2200)
        check(f"{name} is drawn", page.locator(marker).count() >= 1, page.locator(".app-content").inner_text()[:200])
        check(f'{name} says "demo" nowhere on the screen', says_demo(page) is None, says_demo(page))

    # ==================================================================
    # 6. A demo record left in the database from before goes; the Live ones stay
    # ==================================================================
    # Planted in PostgreSQL itself, the way an earlier version's Demo Mode left
    # them, at the version the database is at - so it is exactly what the next
    # start of the app loads.
    planted = None
    for _ in range(4):
        page.wait_for_timeout(1500)  # whatever the app still had to send has gone
        planted = page.evaluate(
            """async () => {
                 const load = await (await fetch('/api/storage', { credentials: 'same-origin' })).json();
                 const item = (load.items || []).find((i) => i.key === 'records');
                 if (!item) return { ok: false, why: 'no records stored yet' };
                 const records = JSON.parse(item.value);
                 const live = records.find((r) => r.isDemo === false);
                 if (!live) return { ok: false, why: 'no live record to copy' };
                 const now = new Date().toISOString();
                 const left = { ...live, id: 'left-behind-by-an-earlier-version', periodKey: `${live.periodKey}:left-behind`, isDemo: true, createdAt: now, updatedAt: now };
                 const res = await fetch('/api/storage/records', {
                   method: 'PUT', credentials: 'same-origin',
                   headers: { 'Content-Type': 'text/plain;charset=utf-8', 'X-Base-Version': String(item.version) },
                   body: JSON.stringify([...records, left]),
                 });
                 return { ok: res.ok, why: res.status, liveId: live.id, liveCount: records.filter((r) => r.isDemo === false).length };
               }"""
        )
        if planted.get("ok"):
            break
    in_database = database_records(page)["records"]
    check("(a demo record was planted in the database, beside the Live ones)", bool(planted and planted.get("ok")) and any(r.get("isDemo") for r in in_database), planted)

    reload_app(page)
    working = stored(page, "records") or []
    check("Started again, the app's working copy holds no demo record", len(working) > 0 and not any(r.get("isDemo") for r in working), [r["id"] for r in working if r.get("isDemo")][:5])
    live_now = [r for r in working if r.get("isDemo") is False]
    check(
        "...and every Live record is still there, the one beside it included",
        any(r["id"] == planted.get("liveId") for r in live_now) and len(live_now) >= (planted.get("liveCount") or 0),
        (planted, len(live_now)),
    )
    gone = False
    in_database = []
    for _ in range(30):
        in_database = database_records(page)["records"]
        if in_database and not any(r.get("isDemo") for r in in_database):
            gone = True
            break
        page.wait_for_timeout(500)
    check("The removal reaches PostgreSQL: the database holds no demo record either", gone, [r["id"] for r in in_database if r.get("isDemo")][:5])
    check("...and the Live record beside it is still in the database", any(r["id"] == planted.get("liveId") for r in in_database), planted)
    reload_app(page)
    check("Started once more, nothing has brought it back", not any(r.get("isDemo") for r in (stored(page, "records") or [])) and not any(r.get("isDemo") for r in database_records(page)["records"]))

    # ==================================================================
    # 7. Mitra
    # ==================================================================
    print("[SKIP] Mitra has no local command that switches to Demo Mode - only the model could send her to /demo, and this suite makes no network calls. The route is refused by isValidAppRoute and left out of the model's route guide.")

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe product has no Demo Mode: no switch, no page, no banner, no watermark - and no demo record left behind.")
