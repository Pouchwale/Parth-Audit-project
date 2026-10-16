"""The browser nearly full: what is taking the room is named and cleared in
one click, and Demo Mode stops short of filling it (REQUIREMENTS s79), asked
for on 26-Sep-2026 when the "nearly as full as it is allowed to be" warning
came back on the dashboard.

  * a fresh browser shows no warning;
  * opening Demo Mode generates the light records of the whole demo year and
    the daily log sheets of the month in hand and the three before it ONLY (a
    fixed window, the same in every browser; fewer months back only when the
    browser has no room for them all, which the page then says) - the working
    copy stays under the warning mark, no warning appears, and the Demo Mode
    page says how many earlier months' daily sheets were left out (worked out
    from the real clock: none in January);
  * pushed past the mark, the dashboard's warning says how much is used, how
    much of it is demo data, how many records, and offers to clear it;
  * one click clears the demo data - the live records untouched - and the
    warning goes by itself.

Since REQUIREMENTS s108 what does not fit in localStorage is kept in the
browser's IndexedDB (frontend/src/data/browserRoom.ts), so a browser that has
it is never near a wall and is not warned; tests/e2e_browser_room.py proves
that. The warning is for a browser without IndexedDB, so the part past the
mark takes IndexedDB away from the page (an init script) and loads it again.

Network-independent. Against the production build on :8842.
"""
import os
import re
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _super_admin import become_super_admin  # noqa: E402  (the run's super admin, REQUIREMENTS s116)

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
FAILURES = []
BANNER = "[data-section='storage-nearly-full']"
MARK = 4_000_000


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
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


# How many values the app keeps in this origin's IndexedDB (frontend/src/data/browserRoom.ts); never makes the database.
KEPT_IN_INDEXEDDB = """async () => {
  const db = await new Promise((resolve) => {
    const req = indexedDB.open('dcrs-room');
    req.onupgradeneeded = () => { try { req.transaction.abort(); } catch (e) { /* ending */ } };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  if (!db) return 0;
  try {
    if (!db.objectStoreNames.contains('items')) return 0;
    const all = await new Promise((resolve) => {
      const q = db.transaction('items', 'readonly').objectStore('items').getAll();
      q.onsuccess = () => resolve(q.result || []);
      q.onerror = () => resolve([]);
    });
    // A value, or the head of one kept in parts; its parts and its stamp are not counted again.
    return all.filter((e) => e && typeof e === 'object' && (typeof e.v === 'string' || typeof e.parts === 'number')).length;
  } finally {
    db.close();
  }
}"""


def used_chars(page):
    return page.evaluate("() => { let t = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); t += k.length + (localStorage.getItem(k) || '').length; } return t; }")


def counts(page):
    return page.evaluate(
        """() => { const rs = JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]'); const m = new Date(); const ym = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
             return { demo: rs.filter((r) => r.isDemo).length, live: rs.filter((r) => !r.isDemo).length, demoThisMonth: rs.filter((r) => r.isDemo && r.dueDate.startsWith(ym)).length }; }"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    # The Demo Mode page, whose note on the daily sheets' window is read below, is the super admin's
    # (REQUIREMENTS s116): the run's super admin (tests/_super_admin.py). The Demo pill in the top bar is everybody's.
    role = become_super_admin(page, BASE)
    check("Signed in as the run's super admin", role == "admin", role)
    page.wait_for_timeout(800)
    dismiss(page)

    print("\n==== A fresh browser ====")
    fresh = used_chars(page)
    live_before = counts(page)["live"]
    check("A fresh browser holds well under the mark and shows no warning", fresh < MARK and page.locator(BANNER).count() == 0, (fresh, page.locator(BANNER).count()))

    print("\n==== Demo Mode stops short of the wall ====")
    page.click(".pill-tab:has-text('Demo Mode')")
    page.wait_for_timeout(300)
    page.click("text=Dashboard")
    try:
        page.wait_for_function("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').some((r) => r.isDemo)", timeout=60000)
    except Exception:
        pass
    page.wait_for_timeout(2500)
    dismiss(page)
    after_demo = used_chars(page)
    c = counts(page)
    check("Opening Demo Mode generates the demo year, the month in hand first", c["demo"] > 300 and c["demoThisMonth"] > 0, c)
    check("...and stops before the working copy passes the warning mark", after_demo <= MARK, after_demo)
    check("...so no warning appears", page.locator(BANNER).count() == 0)
    page.goto(f"{BASE}/index.html#/demo")
    page.wait_for_timeout(800)
    dismiss(page)
    # The daily sheets' window, worked out from the real clock as the generator does: the month in hand (0-11) and
    # the three before it, plus the month ahead's blank shells. FEWER months back only when the browser, nearly as
    # full as it is allowed to be, has no room for them all (data/demoGenerator.ts, shortOfRoom): from October 2026
    # a fresh test browser holds that much of the year's light records, so the window starts a month later, and the
    # page says why. Then the window is the page's, starting after the fixed one and no later than the month in hand.
    cur = datetime.now().month - 1
    first = max(0, cur - 3)
    room_note = page.locator("[data-section='demo-room']")
    note_text = room_note.inner_text() if room_note.count() else ""
    short_of_room = "has room for" in note_text
    window_ok = True
    if short_of_room:
        months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
        drawn = re.search(r"Demo Mode draws them for (\w+) to (\w+) only", note_text)
        drawn_from = months.index(drawn.group(1)) if drawn and drawn.group(1) in months else -1
        window_ok = first < drawn_from <= cur
        first = drawn_from if window_ok else first
    left_out = first
    heavy_months = cur - first + 1
    if left_out > 0:
        check(
            f"The Demo Mode page says the daily sheets of {left_out} earlier months were left out, and which months have them"
            + (" (fewer months back than three: this browser had no room for more, and the page says so)" if short_of_room else ""),
            window_ok and room_note.count() == 1 and re.search(rf"daily log sheets of {left_out} earlier months? of the demo year", note_text) is not None and "not the whole year" in note_text,
            note_text[:300],
        )
    else:
        check("In January no month was left out, so the Demo Mode page says nothing about it", room_note.count() == 0)
    yr = page.evaluate(
        """() => { const rs = JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').filter((r) => r.isDemo); const y = String(new Date().getFullYear());
             const months = (id) => new Set(rs.filter((r) => r.documentId === id && r.dueDate.startsWith(y)).map((r) => r.dueDate.slice(5, 7))).size;
             return { pest: months('daily-pest-monitoring'), visits: months('service-report-rodent'), viscosity: months('qc-viscosity') }; }"""
    )
    check(
        "Every month of the year so far has its pest register and its service visits; the heavy daily sheets exactly the recent months",
        yr["pest"] >= cur + 1 and yr["visits"] >= cur + 1 and yr["viscosity"] in (heavy_months, heavy_months + 1) and (left_out == 0 or yr["viscosity"] < yr["pest"]),
        (yr, {"cur": cur, "first": first, "heavy_months": heavy_months}),
    )

    print("\n==== Past the mark: named, and cleared in one click ====")
    filler = MARK + 150_000 - after_demo
    page.evaluate("(n) => localStorage.setItem('dcrs:v1:room-filler', 'x'.repeat(n))", filler)
    # A browser without IndexedDB (s108). Everything above fitted in localStorage, so nothing was kept there to lose.
    kept = page.evaluate(KEPT_IN_INDEXEDDB)
    check("Under the mark nothing was kept in IndexedDB", kept == 0, kept)
    page.add_init_script("Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });")
    page.goto(f"{BASE}/index.html#/dashboard")
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    banner = page.locator(BANNER)
    check("Over the mark, the dashboard warns", banner.count() == 1)
    try:
        page.wait_for_selector(f"{BANNER} [data-room='demo']", timeout=8000)
    except Exception:
        pass
    text = banner.inner_text() if banner.count() else ""
    check("...saying how much is used of the browser's room", re.search(r"takes \d\.\d MB of the 5\.0 MB", text) is not None, text[:300])
    check("...that most of it is demo data, with how many records and how much", "demo data" in text and re.search(r"\d\.\d MB", text) is not None and str(c["demo"]) in text, text[:400])
    clear = page.locator("[data-action='clear-demo-data']")
    check("...and offers to clear it", clear.count() == 1)
    if clear.count():
        clear.first.click()
    try:
        page.wait_for_function("() => !document.querySelector(\"[data-section='storage-nearly-full']\")", timeout=8000)
    except Exception:
        pass
    after = counts(page)
    check("One click clears every demo record and touches no live one", after["demo"] == 0 and after["live"] == live_before, (after, live_before))
    check("...and the warning goes by itself, the working copy back under the mark", page.locator(BANNER).count() == 0 and used_chars(page) < MARK, (page.locator(BANNER).count(), used_chars(page)))
    # Pressed in Demo Mode, the click also returns the app to Live Mode: the dashboard fills the demo year again
    # the moment it redraws in Demo Mode, which undid the clearing at once in the first cut.
    done_note = page.locator("[data-section='storage-room-done']")
    done_text = done_note.inner_text() if done_note.count() else ""
    check("...leaving a line saying what was freed and that the app is in Live Mode now", done_note.count() == 1 and "freed" in done_text and "Live Mode" in done_text, done_text[:300])
    page.wait_for_timeout(1500)
    check("...and the demo year is NOT filled again by the dashboard", counts(page)["demo"] == 0 and page.locator(".pill-tab.active:has-text('Live Mode')").count() == 1, (counts(page), page.locator(".pill-tab.active").inner_text() if page.locator(".pill-tab.active").count() else None))

    page.evaluate("() => localStorage.removeItem('dcrs:v1:room-filler')")
    page.click("text=Live Mode")
    page.wait_for_timeout(300)
    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe browser's room is named and cleared in a click; Demo Mode stops short of filling it.")
