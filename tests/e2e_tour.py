"""The guided tour of the whole software (REQUIREMENTS s85). 30-Sep-2026: "whenever
a user comes to the dashboard, including the super admin, the software gives a
tour of the whole software, and the user can skip it too."

  * it starts BY ITSELF on the first Dashboard visit of the day, for a staff account
    and for the super admin - after the day's briefing, never over it - and not
    again that day;
  * every step spotlights the real part of the screen as that person sees it (the
    spotlight holds the part's centre; the staff account's modules step lists that
    account's own sidebar modules), with a "Step n of N" counter, the card inside
    the window and the keyboard on Next; the super admin's tour adds Users & Access,
    User access, Database overview, Master Data and the Activity Log;
  * Next, Back, the arrow keys, Skip tour, Escape and Finish; while it runs the page
    under it takes no click; when it is not running nothing of it is on the page
    and a click reaches the page;
  * "Don't show this again" is the person's own: ticked, the tour does not start by
    itself the next day, in another browser either (the setting comes from the
    database), where the box shows ticked; taken back, it starts again the next day;
  * "Take the tour" runs it any time - under automation too;
  * NEVER BY ITSELF UNDER AUTOMATION (navigator.webdriver): the other suites never
    meet it. This suite overrides navigator.webdriver to false (how a person's
    browser reads) to test the real start, and checks the automated browser too;
  * less motion: no card entrance, no pulse; a phone: the menu's steps point at the
    menu button; at 6x CPU throttle each step is drawn quickly.

"The next day" is the person's own stored flags set to yesterday through the app's
own storage API (the item the browser syncs), not a faked clock. Against the product
server on :8843 (DCRS_BASE overrides it) with the plant's seeded accounts on
SEED_ACCOUNT_PASSWORD (DCRS_SEED_PASSWORD overrides it). Network-independent.
"""
import datetime
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD", "SeedQA@2026")
ADMIN = "admin@gpp.local"
STAFF = "kapila.barad@gpp.local"
FAILURES = []
TOUR = "[data-section='tour']"
# How a person's browser reads: navigator.webdriver false (Playwright's is true).
PERSON = "(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }); })()"
WATCH_LONG_TASKS = """(() => { window.__longTasks = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {} })()"""
# Each step's own part of the screen (components/tour/tourSteps.ts), to check the spotlight holds it.
TARGETS = {
    "sidebar": "#app-sidebar .app-nav",
    "modules": "#app-sidebar .nav-module-header",
    "day": "[data-section='my-day'], [data-tour='today-tiles']",
    "search": "#app-sidebar a[href='#/search']",
    "calendar": "#app-sidebar a[href='#/calendar']",
    "library": "#app-sidebar a[href='#/library']",
    "records": "[data-tour='records-due']",
    "mitra": ".assistant-pill, .assistant-dock-card",
    "bell": ".app-topbar button[aria-label='Reminders']",
    "sound": ".app-topbar [data-action='toggle-sound']",
    "reports": "#app-sidebar a[href='#/reports']",
    "users": "#app-sidebar a[href='#/users']",
    "access": "#app-sidebar a[href='#/access']",
    "database": "#app-sidebar a[href='#/database-overview']",
    "master": "#app-sidebar a[href='#/master-data']",
    "activity": "#app-sidebar a[href='#/activity']",
    "finish": "[data-action='take-tour']",
}
STAFF_STEPS = ["welcome", "sidebar", "modules", "day", "search", "calendar", "library", "records", "mitra", "bell", "sound", "reports", "finish"]
ADMIN_STEPS = STAFF_STEPS[:-1] + ["users", "access", "database", "master", "activity", "finish"]

TOUR_NOW = """(targets) => {
  const t = document.querySelector("[data-section='tour']");
  if (!t) return { running: false, leftovers: document.querySelectorAll('.tour-layer, .tour-card, .tour-spot, .tour-block').length };
  const spot = document.querySelector('.tour-spot');
  const card = document.querySelector('.tour-card');
  const r = spot ? spot.getBoundingClientRect() : null;
  const c = card.getBoundingClientRect();
  const step = t.dataset.step;
  const sel = targets[step];
  let targetBox = null, spotHoldsTarget = null;
  if (sel) {
    const els = [...document.querySelectorAll(sel)].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; });
    if (els[0]) {
      const b = els[0].getBoundingClientRect();
      targetBox = [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
      const cx = b.left + b.width / 2, cy = Math.max(5, Math.min(b.top + b.height / 2, innerHeight - 5));
      spotHoldsTarget = !!r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    }
  }
  const a = document.activeElement;
  return {
    running: true, step, index: Number(t.dataset.index), count: Number(t.dataset.count), found: t.dataset.found,
    counter: (document.querySelector("[data-field='tour-count']") || {}).textContent || '',
    title: (document.querySelector('#tour-title') || {}).textContent || '', text: (document.querySelector('#tour-text') || {}).textContent || '',
    spot: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    card: [Math.round(c.left), Math.round(c.top), Math.round(c.width), Math.round(c.height)],
    cardInside: c.left >= 0 && c.top >= 0 && c.right <= innerWidth + 0.5 && c.bottom <= innerHeight + 0.5,
    focus: a ? a.getAttribute('data-action') : null, dontShow: !!(document.querySelector("[data-field='tour-dont-show']") || {}).checked,
    dialog: card.getAttribute('role'), modal: card.getAttribute('aria-modal'),
    targetBox, spotHoldsTarget, hash: location.hash,
    cardAnimation: getComputedStyle(card).animationName, ringAnimation: spot ? getComputedStyle(spot, '::after').animationName : null,
  };
}"""


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


def today_iso():
    return datetime.date.today().isoformat()


def yesterday_iso():
    return (datetime.date.today() - datetime.timedelta(days=1)).isoformat()


class Account:
    """The person's own stored settings, through the app's own storage API (a session of its own)."""

    def __init__(self, pw, email):
        self.rc = pw.request.new_context(base_url=BASE)
        res = self.rc.post("/api/auth/login", data={"email": email, "password": SEED_PASSWORD})
        if not res.ok:
            raise SystemExit(f"Could not sign {email} in through the API: {res.status} {res.text()[:200]}")
        self.id = self.rc.get("/api/auth/me").json()["user"]["id"]

    def settings(self):
        body = self.rc.get("/api/storage").json()
        for item in body.get("items", []):
            if item["key"] == "settings":
                return json.loads(item["value"]), item["version"]
        return {}, None

    def flags(self, wait_for=None, limit_s=6.0):
        """The person's tour flags as stored; with `wait_for`, polled until they satisfy it (the browser sends a change 0.4 s after it)."""
        deadline = time.time() + limit_s
        while True:
            s, _ = self.settings()
            flags = (s.get("tour") or {}).get(self.id) or {}
            if wait_for is None or wait_for(flags) or time.time() >= deadline:
                return flags
            time.sleep(0.4)

    def set_flags(self, flags):
        for _ in range(4):
            s, version = self.settings()
            s["tour"] = {self.id: flags} if flags else {}
            res = self.rc.put("/api/storage/settings", data=json.dumps(s), headers={"Content-Type": "text/plain", "X-Base-Version": "*" if version is None else str(version)})
            if res.ok:
                return
        raise SystemExit(f"Could not store the tour flags: {res.status} {res.text()[:200]}")

    def close(self):
        self.rc.dispose()


def new_page(browser, person=True, **options):
    ctx = browser.new_context(**{"viewport": {"width": 1366, "height": 768}, **options})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "401" not in m.text else None)
    if person:
        page.add_init_script(PERSON)
    page.add_init_script(WATCH_LONG_TASKS)
    return ctx, page, errors


def sign_in(page, email):
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    # A person skips the opening (it holds the form until then); under automation typing lifts it.
    page.keyboard.press("Escape")
    try:
        page.wait_for_selector("[data-section='intro-splash']", state="detached", timeout=3000)
    except Exception:
        pass
    page.fill("#login-email", email)
    page.fill("#login-password", SEED_PASSWORD)
    page.click("button:has-text('Log In')")
    # Attached, not visible: on a phone the menu is a drawer, closed.
    page.wait_for_selector(".app-sidebar", state="attached", timeout=60000)
    page.wait_for_selector(".app-content h1", timeout=60000)


def settle(page, expect_tour, limit_ms=9000):
    """Waits for the tour to start by itself (or not). A briefing that pops up first is checked to be alone on the
    screen for a moment, then closed; returns (tour started, a briefing came first and the tour waited for it)."""
    waited = None
    end = limit_ms
    step = 250
    t = 0
    while t < end:
        if page.locator(TOUR).count():
            return True, waited
        if page.locator(".briefing").count():
            page.wait_for_timeout(2500)
            waited = page.locator(TOUR).count() == 0
            page.locator("button:has-text('Got it')").first.click()
        page.wait_for_timeout(step)
        t += step
    return page.locator(TOUR).count() > 0, waited


def walk(page, expected_ids, label):
    """Every step, with Next, checked; returns the steps seen."""
    seen = []
    info = page.evaluate(TOUR_NOW, TARGETS)
    count = info.get("count")
    check(f"{label}: the tour has {len(expected_ids)} steps", count == len(expected_ids), info)
    for i in range(count or 0):
        page.wait_for_timeout(120)
        info = page.evaluate(TOUR_NOW, TARGETS)
        seen.append(info)
        where = "centre" if info["step"] == "welcome" else "target"
        ok = (
            info["running"]
            and info["index"] == i
            and info["counter"] == f"Step {i + 1} of {count}"
            and info["found"] == where
            and (info["step"] == "welcome" or info["spotHoldsTarget"] is True)
            and info["cardInside"]
            and info["focus"] == "tour-next"
            and info["title"].strip() != ""
            and 0 < len(info["text"]) <= 200
            and info["dialog"] == "dialog" and info["modal"] == "true"
        )
        check(f"{label}: step {i + 1}, {info['step']} - {info['title']!r}: its part found and lit, the card in the window, the keyboard on Next", ok, info)
        if i < count - 1:
            page.click("[data-action='tour-next']")
    return seen


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    staff_api = Account(pw, STAFF)
    admin_api = Account(pw, ADMIN)
    # A clean start on a database a run has used before: no flags for either person.
    staff_api.set_flags(None)
    admin_api.set_flags(None)

    # ==================================================================
    print("\n==== A staff account: the tour starts by itself on the first Dashboard visit ====")
    # ==================================================================
    ctx, page, errors = new_page(browser)
    sign_in(page, STAFF)
    check("A person's browser (navigator.webdriver false)", page.evaluate("() => navigator.webdriver") is False)
    started, waited = settle(page, True)
    check("The tour starts by itself on the Dashboard", started)
    if waited is not None:
        check("...after the day's briefing, never over it", waited, waited)
    modules = page.evaluate("() => [...document.querySelectorAll('#app-sidebar .nav-module-name')].map((e) => e.textContent.trim())")
    first = page.evaluate(TOUR_NOW, TARGETS)
    check("...opening with a welcome that names the person, in the middle of the screen", first.get("step") == "welcome" and "Kapila" in first.get("title", "") and first.get("found") == "centre", first)
    marked = staff_api.flags(lambda f: f.get("startedOn") == today_iso())
    check("...and the day is marked as started for this person, in the database", marked.get("startedOn") == today_iso(), marked)
    seen = walk(page, STAFF_STEPS, "Staff")
    by = {s["step"]: s for s in seen}
    check("The staff tour covers the whole software, in order, without the super admin's pages", [s["step"] for s in seen] == STAFF_STEPS, [s["step"] for s in seen])
    if "modules" in by:
        m = by["modules"]
        check(
            "...its modules step names this account's own sidebar modules",
            m["title"] == (f"Your {len(modules)} modules" if len(modules) != 1 else "Your module") and m["text"].startswith(modules[0]),
            (modules, m["title"], m["text"]),
        )
    # Back, the arrow keys, and the page taking no click while it runs.
    page.keyboard.press("ArrowLeft")
    page.wait_for_timeout(150)
    back = page.evaluate(TOUR_NOW, TARGETS)
    check("Back (the left arrow) goes a step back", back.get("index") == len(STAFF_STEPS) - 2, back.get("index"))
    page.click("[data-action='tour-back']")
    page.wait_for_timeout(150)
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(150)
    check("...the Back button too, and the right arrow forward", page.evaluate(TOUR_NOW, TARGETS).get("index") == len(STAFF_STEPS) - 2)
    link = page.locator("#app-sidebar a[href='#/library']").first.bounding_box()
    hash_before = page.evaluate("() => location.hash")
    if link:
        page.mouse.click(link["x"] + link["width"] / 2, link["y"] + link["height"] / 2)
    page.wait_for_timeout(400)
    check("While it runs the page under it takes no click (a sidebar link stays where it is)", page.evaluate("() => location.hash") == hash_before and page.locator(TOUR).count() == 1, (hash_before, page.evaluate("() => location.hash")))
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    gone = page.evaluate(TOUR_NOW, TARGETS)
    check("Escape ends it, and nothing of it is left on the page", not gone["running"] and gone["leftovers"] == 0, gone)
    check("...the keyboard handed back (to the page, or the Take the tour button)", page.evaluate("() => !document.activeElement || !document.activeElement.closest('.tour-layer')"))
    hit = page.evaluate("() => { const b = document.querySelector(\"[data-tour='open-calendar']\").getBoundingClientRect(); const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!at && !!at.closest(\"[data-tour='open-calendar']\"); }")
    check("Not running, it covers no click: the Open Calendar button is the one under the pointer", hit)
    # "Take the tour" any time; Skip tour.
    page.click("[data-action='take-tour']")
    page.wait_for_selector(TOUR, timeout=5000)
    again = page.evaluate(TOUR_NOW, TARGETS)
    check("\"Take the tour\" runs it again, from its first step", again.get("index") == 0 and again.get("step") == "welcome", again)
    page.click("[data-action='tour-next']")
    page.click("[data-action='tour-skip']")
    page.wait_for_timeout(300)
    check("Skip tour ends it", page.locator(TOUR).count() == 0)
    page.reload()
    page.wait_for_selector(".app-sidebar", state="attached", timeout=60000)
    started, _ = settle(page, False, 5000)
    check("The same day, the Dashboard again: it does not start by itself a second time", not started)
    if started:
        page.keyboard.press("Escape")
    # Finish on the last step.
    page.click("[data-action='take-tour']")
    page.wait_for_selector(TOUR, timeout=5000)
    for _ in range(len(STAFF_STEPS) - 1):
        page.click("[data-action='tour-next']")
    last = page.evaluate(TOUR_NOW, TARGETS)
    check("The last step points at Take the tour and offers Finish", last.get("step") == "finish" and page.locator("[data-action='tour-next']").inner_text().strip() == "Finish", last)
    page.click("[data-action='tour-next']")
    page.wait_for_timeout(300)
    check("...Finish ends it, and the keyboard is on Take the tour", page.locator(TOUR).count() == 0 and page.evaluate("() => document.activeElement && document.activeElement.getAttribute('data-action')") == "take-tour")
    # Don't show this again.
    page.click("[data-action='take-tour']")
    page.wait_for_selector(TOUR, timeout=5000)
    check("The box starts unticked", page.evaluate(TOUR_NOW, TARGETS).get("dontShow") is False)
    page.check("[data-field='tour-dont-show']")
    page.click("[data-action='tour-skip']")
    page.wait_for_timeout(2500)
    kept = staff_api.flags(lambda f: f.get("off") is True)
    check("\"Don't show this again\", ticked, is kept in the person's settings in the database", kept.get("off") is True, kept)
    check("...with no JavaScript errors", not errors, errors[:5])
    ctx.close()

    print("\n==== The next day, another browser: it stays off ====")
    staff_api.set_flags({"off": True, "startedOn": yesterday_iso()})
    ctx, page, errors = new_page(browser)
    sign_in(page, STAFF)
    started, _ = settle(page, False, 6000)
    check("The next day, in another browser, the tour does not start by itself (Don't show this again)", not started)
    if started:
        page.keyboard.press("Escape")
    page.click("[data-action='take-tour']")
    page.wait_for_selector(TOUR, timeout=5000)
    check("...Take the tour still runs it there, and its box shows ticked (it came from the database)", page.evaluate(TOUR_NOW, TARGETS).get("dontShow") is True)
    page.uncheck("[data-field='tour-dont-show']")
    page.keyboard.press("Escape")
    page.wait_for_timeout(2500)
    taken = staff_api.flags(lambda f: f.get("off") is not True)
    check("Unticked, the setting is taken back", taken.get("off") is not True, taken)
    staff_api.set_flags({"startedOn": yesterday_iso()})
    page.reload()
    page.wait_for_selector(".app-sidebar", state="attached", timeout=60000)
    started, _ = settle(page, True)
    check("...and on the next day's first Dashboard visit it starts by itself again", started)
    marked = staff_api.flags(lambda f: f.get("startedOn") == today_iso())
    check("...marking that day as started", marked.get("startedOn") == today_iso(), marked)
    if started:
        page.click("[data-action='tour-skip']")
    check("...with no JavaScript errors", not errors, errors[:5])
    ctx.close()

    print("\n==== Under automation it never starts by itself; Take the tour still runs it ====")
    staff_api.set_flags({"startedOn": yesterday_iso()})
    ctx, page, errors = new_page(browser, person=False)
    sign_in(page, STAFF)
    check("This browser is driven by a script (navigator.webdriver)", page.evaluate("() => navigator.webdriver") is True)
    started, _ = settle(page, False, 6000)
    check("A new day, under automation: the tour does not start by itself (the other suites never meet it)", not started)
    page.wait_for_timeout(1000)
    check("...and nothing is marked as started", staff_api.flags().get("startedOn") == yesterday_iso(), staff_api.flags())
    page.click("[data-action='take-tour']")
    page.wait_for_selector(TOUR, timeout=5000)
    check("...while Take the tour runs it", page.locator(TOUR).count() == 1)
    page.keyboard.press("Escape")
    check("...with no JavaScript errors", not errors, errors[:5])
    ctx.close()

    print("\n==== Less motion; and a phone ====")
    # "Take the tour" here: the day has started already, so it does not start by itself over these checks.
    staff_api.set_flags({"startedOn": today_iso()})
    ctx, page, errors = new_page(browser, reduced_motion="reduce")
    sign_in(page, STAFF)
    settle(page, False, 3000)
    page.click("[data-action='take-tour']")
    page.wait_for_selector(TOUR, timeout=5000)
    page.click("[data-action='tour-next']")
    page.wait_for_timeout(200)
    calm = page.evaluate(TOUR_NOW, TARGETS)
    check("Less motion: no card entrance and no pulse round the lit part", calm.get("cardAnimation") == "none" and calm.get("ringAnimation") in ("none", None), calm)
    page.keyboard.press("Escape")
    ctx.close()
    ctx, page, errors = new_page(browser, viewport={"width": 390, "height": 844})
    sign_in(page, STAFF)
    settle(page, False, 3000)
    page.locator("[data-action='take-tour']").first.evaluate("(el) => el.click()")
    page.wait_for_selector(TOUR, timeout=5000)
    phone = []
    count = page.evaluate(TOUR_NOW, TARGETS).get("count") or 0
    for i in range(count):
        page.wait_for_timeout(120)
        phone.append(page.evaluate(TOUR_NOW, TARGETS))
        if i < count - 1:
            page.click("[data-action='tour-next']")
    page.keyboard.press("Escape")
    check("On a phone every step finds its part or the menu button, the card inside the screen", phone and all(s["found"] in ("target", "fallback", "centre") and s["cardInside"] for s in phone), [(s["step"], s["found"], s["card"]) for s in phone])
    check("...the menu's steps point at the menu button, with words that say where to find them", any(s["found"] == "fallback" and "menu" in s["text"] for s in phone), [(s["step"], s["found"], s["text"][:60]) for s in phone if s["found"] == "fallback"])
    check("...with no JavaScript errors", not errors, errors[:5])
    ctx.close()

    # ==================================================================
    print("\n==== The super admin: the tour starts by itself, with their own pages ====")
    # ==================================================================
    ctx, page, errors = new_page(browser)
    sign_in(page, ADMIN)
    started, waited = settle(page, True)
    check("The tour starts by itself for the super admin too", started)
    if waited is not None:
        check("...after the day's briefing, never over it", waited, waited)
    seen = walk(page, ADMIN_STEPS, "Super admin")
    check(
        "The super admin's tour covers Users & Access, User access, Database overview, Master Data and the Activity Log",
        [s["step"] for s in seen] == ADMIN_STEPS,
        [s["step"] for s in seen],
    )
    page.click("[data-action='tour-next']")
    page.wait_for_timeout(300)
    check("...Finish ends it", page.locator(TOUR).count() == 0)
    check("...with no JavaScript errors", not errors, errors[:5])

    print("\n==== A low-end laptop: 6x CPU throttle ====")
    cdp = ctx.new_cdp_session(page)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 6})
    page.wait_for_timeout(500)
    timing = page.evaluate(
        """async (n) => {
             const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
             const out = { start: 0, steps: [] };
             const t0 = performance.now();
             const before = window.__longTasks.length;
             document.querySelector("[data-action='take-tour']").click();
             await frame();
             out.start = Math.round(performance.now() - t0);
             for (let i = 1; i < n; i++) {
               const t = performance.now();
               document.querySelector("[data-action='tour-next']").click();
               await frame();
               out.steps.push(Math.round(performance.now() - t));
             }
             out.shown = !!document.querySelector("[data-section='tour']");
             out.long = window.__longTasks.slice(before).filter(([s]) => s >= t0).map(([, d]) => d);
             document.querySelector("[data-action='tour-skip']").click();
             return out;
           }""",
        len(ADMIN_STEPS),
    )
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
    worst = max(timing["steps"] or [0])
    median = sorted(timing["steps"])[len(timing["steps"]) // 2] if timing["steps"] else 0
    print(f"     (6x: the tour drawn {timing['start']} ms after Take the tour; each step drawn in {timing['steps']} ms; long tasks meanwhile {timing['long']} ms)")
    check("At 6x CPU throttle the tour is on the screen within 400 ms of Take the tour", timing["shown"] and timing["start"] <= 400, timing)
    check("...and each step is drawn within 250 ms (median), none over 500 ms", median <= 250 and worst <= 500, timing["steps"])
    ctx.close()

    # Left as found: no tour flags for either person.
    staff_api.set_flags(None)
    admin_api.set_flags(None)
    staff_api.close()
    admin_api.close()
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe guided tour: by itself once a day for everybody, the super admin included, every step on the real screen; skipped, finished or switched off per person; never by itself for a script.")
