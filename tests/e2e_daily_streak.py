"""The daily streak: 🔥 in the top bar on every screen, the day card's fourteen days beside today's score (the
owner, 25-Oct-2026):

  "Also add streak for user can atleast login daily for once and complete it work which is help to improve there
  score so there improved like snapchat"

A KEPT day is a working day on which the person signed in (the website or the phone) and nothing of theirs that
fell due ended late or never done; a working day with nothing of theirs due is kept by the sign-in alone
(frontend/src/engine/streakCore.ts). This suite checks, against the production build on :8842:

  * the super admin (when this suite's first account is the server's first) has no streak of his own: no counter
    in the top bar, no streak on the day card (the plant's day);
  * a Store account (its two documents are as-required: nothing of theirs falls due by itself): the counter comes
    right after the sound button; GET /api/me/sign-in-days answers the person's own sign-in days - today's sign-up
    among them - and the first on record, refuses anybody signed out, never reads an account named in the address,
    holds the window to 200 days and refuses a date that is not one;
  * signing in on a working day with nothing of theirs due keeps today: 🔥 1 in the top bar with "today is kept"
    in its tooltip and the flame lit, the kept day celebrated once - the streak badge card, a burst that takes no
    clicks, the "celebrate" sound, Mitra's line with the first name, settings celebratedToday - and not again after
    a reload; the day card shows the streak beside the score, never inside it, with fourteen squares, today's kept
    and each in words; a press on the counter from another page opens the day card;
  * a Production account on the next working day at 16:05 (the browser's clock moved by Playwright, and the
    sign-in days answered as if it had signed in on the working day before), its records due that day open: the
    hourglass, ⌛ 1, "at risk" with the count in words, the card's tone and line; with all but one handed in,
    "1 record still to do today"; the last one handed in through the page (Mitra's sample data, Submit): the
    all-done card is today's celebration and there is no second one for the streak, and the counter turns 🔥 2
    with the flame lit;
  * reduced motion stills the flame; on a phone the counter is the sign and the number alone, and the page never
    grows wider than the screen;
  * no JavaScript errors.

The suites run on the real clock (Thursday is the weekly off, festivals are closed): on a closed day the Store's
part moves the browser's clock to the next working day, which the rule treats like any other. The days before
the system went live (today, for the run's fresh store) are stepped over.

Network-independent, against the production build on :8842.
"""
import secrets
import sys
import time
from datetime import date, datetime, timedelta

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
# A password made for this run alone, never written anywhere.
PASSWORD = secrets.token_hex(12)
# No word of either name is a button's label.
STORE_NAME = "Sunil Streak"
STORE_FIRST = "Sunil"
PROD_NAME = "Prem Streak"
PROD_FIRST = "Prem"
PRD_LAST = "prd-process-parameter"
OPEN = ("Scheduled", "Due", "In Progress")
FAILURES = []

# The company's working calendar (tests/e2e_editing.py), for when the master data is not in the browser yet.
ADJUSTMENT_DAYS_2026 = {"2026-01-22", "2026-08-06", "2026-10-22", "2026-11-05", "2026-11-20"}
FESTIVAL_HOLIDAYS_2026 = {
    "2026-01-14", "2026-01-26", "2026-03-04", "2026-08-15", "2026-08-28", "2026-09-04", "2026-10-19", "2026-10-20",
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
}

RECORDER = r"""
(() => {
  window.__cues = [];
  window.__says = [];
  window.__confetti = [];
  // Every badge card the moment it appears: one lasts five seconds, a check may come later.
  window.__pops = [];
  window.addEventListener('dcrs:cue', (e) => window.__cues.push((e.detail || {}).cue));
  window.addEventListener('dcrs:say', (e) => window.__says.push(e.detail || {}));
  const seen = new WeakSet();
  const look = () => {
    document.querySelectorAll("[data-section='mitra-confetti']").forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const cs = getComputedStyle(el);
      window.__confetti.push({ kind: el.getAttribute('data-kind'), pieces: el.children.length, pointerEvents: cs.pointerEvents });
    });
    document.querySelectorAll("[data-section='mitra-achievement']").forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      window.__pops.push({ kind: el.getAttribute('data-kind'), text: el.innerText, pointerEvents: getComputedStyle(el).pointerEvents, noPrint: el.classList.contains('no-print') });
    });
  };
  const start = () => new MutationObserver(look).observe(document.body, { childList: true, subtree: true });
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
"""


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


def settle_briefing(page):
    """The briefing and the day's notification marked shown for the browser's own today (its clock may be moved)."""
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


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def open_page(page, route, settle=1500):
    page.goto(f"{BASE}/index.html{route}")
    # The top bar, not the side panel: on a phone the panel is a closed drawer.
    page.wait_for_selector(".app-topbar", timeout=60000)
    page.wait_for_timeout(settle)
    dismiss(page)


def stored(page, key):
    return page.evaluate("(k) => JSON.parse(localStorage.getItem('dcrs:v1:' + k) || 'null')", key)


def me(page):
    return page.evaluate("() => fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json())")


def sign_up(page, name, email, department):
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", name)
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.select_option("#signup-department", department)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)


def log_out(page):
    page.locator("button[title='Log Out']").first.click()
    page.wait_for_timeout(500)
    ok = page.locator("[data-action='logout-review-confirm']")
    if ok.count():
        ok.first.click()
    page.wait_for_selector("text=Sign up", timeout=30000)
    page.wait_for_timeout(600)


def closed_day(iso, master):
    """engine/holidays.ts: a festival holiday, else an adjustment day (open), else the weekly off."""
    if master:
        if any(h.get("date") == iso for h in master.get("holidays") or []):
            return True
        if any(a.get("date") == iso for a in master.get("adjustmentDays") or []):
            return False
        weekly_off = master.get("weeklyOffDay")
        weekly_off = 4 if weekly_off is None else weekly_off
        return (date.fromisoformat(iso).weekday() + 1) % 7 == weekly_off
    return iso in FESTIVAL_HOLIDAYS_2026 or (date.fromisoformat(iso).weekday() == 3 and iso not in ADJUSTMENT_DAYS_2026)


def next_working_day(iso, master):
    """The first working day after `iso`."""
    d = date.fromisoformat(iso) + timedelta(days=1)
    while closed_day(d.isoformat(), master):
        d += timedelta(days=1)
    return d.isoformat()


def shown_date(iso):
    """utils/date.ts formatDisplayDate: 24-10-26."""
    d = date.fromisoformat(iso)
    return f"{d.day:02d}-{d.month:02d}-{d.year % 100:02d}"


def events(page):
    return page.evaluate("() => ({ cues: window.__cues.slice(), says: window.__says.slice(), confetti: window.__confetti.slice(), pops: window.__pops.slice() })")


def topbar_order(page):
    return page.evaluate(
        """() => { const end = document.querySelector('.app-topbar-end'); if (!end) return [];
             return Array.from(end.children).map((el) => el.matches('[data-connection]') ? 'connection' : el.matches('[data-clock]') ? 'clock'
               : (el.matches('.lang-select, .lang-select *') || el.querySelector('.lang-select')) ? 'language' : el.matches('[data-theme-switch]') ? 'theme'
               : el.matches("[data-action='toggle-sound']") ? 'sound' : el.matches("[data-field='topbar-streak']") ? 'streak'
               : (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)); }"""
    )


def counter(page):
    c = page.locator("[data-field='topbar-streak']")
    if c.count() != 1:
        return {"count": c.count()}
    return c.evaluate(
        """(el) => ({ count: 1, state: el.getAttribute('data-state'), days: el.getAttribute('data-days'), title: el.getAttribute('title') || '',
             aria: el.getAttribute('aria-label') || '', icon: (el.querySelector('.streak-counter-icon') || {}).textContent || '',
             num: (el.querySelector('.streak-counter-num') || {}).textContent || '', label: (el.querySelector('.streak-counter-label') || {}).textContent || '',
             lit: !!el.querySelector('.streak-counter-icon.is-lit'),
             animation: el.querySelector('.streak-counter-icon') ? getComputedStyle(el.querySelector('.streak-counter-icon')).animationName : '' })"""
    )


def wait_counter(page, states, timeout=10000):
    """Waits for the counter to be worked out (its first look is a moment after the page paints)."""
    try:
        page.wait_for_function(
            "(states) => { const el = document.querySelector(\"[data-field='topbar-streak']\"); return !!el && states.includes(el.getAttribute('data-state')); }",
            arg=list(states),
            timeout=timeout,
        )
    except Exception:
        pass
    return counter(page)


BAR_WIDTHS = (1280, 1366, 1440, 1600, 1920)


def check_bar_fits(page, who):
    """The top bar fits the plant's laptops and a wide screen: no sideways scroll, one row, nothing on two lines (no item taller
    than one line), nothing past the edge."""
    size = page.viewport_size
    for width in BAR_WIDTHS:
        page.set_viewport_size({"width": width, "height": 900})
        page.wait_for_timeout(450)
        m = page.evaluate(
            """() => { const bar = document.querySelector('.app-topbar').getBoundingClientRect();
                 const items = Array.from(document.querySelectorAll('.app-topbar-start > *, .app-topbar-end > *')).filter((el) => el.getBoundingClientRect().width > 0);
                 const label = document.querySelector('.streak-counter-label');
                 return { page: document.documentElement.scrollWidth, inner: window.innerWidth, height: Math.round(bar.height),
                          right: Math.max(...items.map((el) => el.getBoundingClientRect().right)),
                          tallest: Math.round(Math.max(...items.map((el) => el.getBoundingClientRect().height))),
                          spread: (() => { const c = items.map((el) => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; }); return Math.round(Math.max(...c) - Math.min(...c)); })(),
                          word: label ? getComputedStyle(label).display : null }; }"""
        )
        check(
            f"{who}: at {width} px the top bar fits - no sideways scroll, one row of 58 px, nothing on two lines, nothing past the edge",
            m["page"] <= m["inner"] and m["height"] == 58 and m["right"] <= m["inner"] and m["spread"] < 12 and m["tallest"] <= 42,
            m,
        )
        if m["word"] is not None:
            check(f"...the streak's word {'beside its number' if width >= 1800 else 'left out, the sign and the number kept'} at {width} px", (m["word"] != "none") == (width >= 1800), m["word"])
    page.set_viewport_size(size)
    page.wait_for_timeout(300)


def wait_card(page):
    try:
        page.wait_for_selector("[data-section='my-day']:not([data-state='loading'])", timeout=10000)
    except Exception:
        pass
    return page.locator("[data-section='my-day']")


def kept_pops(page, timeout=8000):
    """The kept day's badge cards this page has shown (recorded as each appeared), waiting a while for the first."""
    try:
        page.wait_for_function("() => window.__pops.some((p) => p.kind === 'streak-kept')", timeout=timeout)
    except Exception:
        pass
    return [x for x in events(page)["pops"] if x.get("kind") == "streak-kept"]


def ensure_mitra(page):
    if page.locator("[data-assistant='docked']").count() == 0:
        page.locator("[data-assistant='closed'] button").first.click()
        page.wait_for_timeout(400)


def say(page, text, wait=1800):
    ensure_mitra(page)
    box = page.locator("[data-assistant='docked'] textarea")
    box.fill(text)
    box.press("Enter")
    page.wait_for_timeout(wait)


def moved_context(browser, cookies, when, viewport=None, sign_ins=None):
    """A browser whose clock reads `when`, signed in as the person whose cookies these are. `sign_ins`: the sign-in days
    the server is to answer with (the browser cannot move the server's clock)."""
    ctx = browser.new_context(viewport=viewport or {"width": 1500, "height": 1000})
    ctx.add_init_script(RECORDER)
    ctx.clock.install(time=when)
    ctx.add_cookies(cookies)
    page = ctx.new_page()
    page.route("**/translate_a/**", lambda route: route.abort())
    if sign_ins is not None:
        days, first = sign_ins

        def answer(route):
            route.fulfill(status=200, content_type="application/json", headers={"Cache-Control": "no-store"}, json={"days": days, "firstDay": first, "from": days[0] if days else first, "to": when.date().isoformat()})

        page.route("**/api/me/sign-in-days**", answer)
    return ctx, page


def check_kept_celebration(page, day, first_name, where):
    pops = kept_pops(page)
    text = pops[0]["text"] if pops else ""
    check(f"{where}: today is kept, and celebrated once - the streak badge card ('Streak kept today', 🔥 1-day streak)", len(pops) == 1 and "Streak kept today" in text and "🔥 1-day streak" in text, pops)
    if pops:
        check("...a card that takes no clicks and is never printed", pops[0]["pointerEvents"] == "none" and pops[0]["noPrint"], pops[0])
    page.wait_for_timeout(600)
    ev = events(page)
    check("...with the 'celebrate' sound", "celebrate" in ev["cues"], ev["cues"])
    check("...and a burst of confetti that takes no clicks", any(c["kind"] == "burst" and c["pointerEvents"] == "none" for c in ev["confetti"]), ev["confetti"])
    said = [s for s in ev["says"] if (s.get("key") or "") == f"streak-kept:{day}"]
    check("...and Mitra says it aloud, once, with the person's first name", len(said) == 1 and first_name in (said[0].get("text") or "") and bool(said[0].get("en")), ev["says"])
    s = stored(page, "settings") or {}
    kept = s.get("celebratedToday") or {}
    check("...remembered for the person, today, so it is not repeated (settings celebratedToday)", kept.get("date") == day and "streak-kept" in (kept.get("keys") or []), kept)


def check_day_card(page, day, days, where, tone="lit"):
    card = wait_card(page)
    box = card.locator("[data-field='my-day-streak']")
    check(f"{where}: the day card shows the streak, once", card.count() == 1 and box.count() == 1, card.count())
    if box.count() != 1:
        return
    num = box.locator("[data-field='my-day-streak-days']")
    check(f"...the big 🔥 and {days}, the number in an element of its own that is never translated", "🔥" in (box.text_content() or "") and num.count() == 1 and (num.text_content() or "").strip() == str(days) and num.get_attribute("translate") == "no", box.text_content())
    check(f"...in the tone '{tone}'", box.get_attribute("data-tone") == tone, box.get_attribute("data-tone"))
    geo = page.evaluate(
        """() => { const s = document.querySelector('.my-day-score').getBoundingClientRect(); const b = document.querySelector("[data-field='my-day-streak']").getBoundingClientRect();
             return { s: [s.left, s.top, s.right, s.bottom], b: [b.left, b.top, b.right, b.bottom], inside: !!document.querySelector("[data-field='my-day-streak']").closest('.my-day-score') }; }"""
    )
    s, b = geo["s"], geo["b"]
    check("...beside today's score, never inside it: on its row, just to its right", not geo["inside"] and b[0] >= s[2] - 1 and b[1] < s[3] and b[3] > s[1], geo)
    squares = box.locator(".streak-strip li")
    last = squares.nth(13) if squares.count() == 14 else None
    check("...the last fourteen days as small squares, today the last", squares.count() == 14 and last is not None and last.get_attribute("data-date") == day, squares.count())
    if last is not None:
        state = last.get_attribute("data-state")
        words = (last.text_content() or "").strip()
        check(f"...each in words for a screen reader and as its tooltip ('{shown_date(day)}: ...')", words.startswith(f"{shown_date(day)}: ") and last.get_attribute("title") == words, (state, words))
    strip_label = box.locator(".streak-strip").get_attribute("aria-label") or ""
    check("...the strip says itself whole: 'The last 14 days: N kept, M missed.'", strip_label.startswith("The last 14 days: ") and "kept" in strip_label, strip_label)
    rule = card.locator("[data-field='my-day-streak-rule']")
    words = (rule.text_content() or "").strip() if rule.count() == 1 else ""
    check("...and the rule in one short line on the card: a kept day is a day with nothing missed - what keeps the score at 0", words.startswith("🔥") and "nothing of yours missed" in words and "score at 0" in words, words)
    one_row = page.evaluate(
        """() => { const tops = ['.my-day-score', "[data-field='my-day-streak']", '.my-day-ring', '.my-day-main'].map((s) => document.querySelector(s)).filter(Boolean).map((el) => el.getBoundingClientRect().top);
             return Math.max(...tops) - Math.min(...tops) < 80; }"""
    )
    check("...the score, the streak, the ring and the day's words on one row at 1500 px", one_row)


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1500, "height": 1000})
    context.add_init_script(RECORDER)
    page = context.new_page()
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    stamp = int(time.time() * 1000)
    sign_up(page, STORE_NAME, f"streak-store-{stamp}@example.com", "STR")
    page.wait_for_timeout(1500)
    dismiss(page)

    # ==================================================================
    # 0. The super admin has no streak of his own
    # ==================================================================
    who = (me(page) or {}).get("user") or {}
    if who.get("role") == "admin":
        print("\n==== The super admin ====")
        print("    (the first account on this server is its administrator; a Store account is signed up next)")
        open_page(page, "#/dashboard", settle=2500)
        check("The super admin has no streak counter in the top bar", page.locator("[data-field='topbar-streak']").count() == 0, topbar_order(page))
        check_bar_fits(page, "The super admin's bar")
        card = wait_card(page)
        check("...and his day card - the plant's day - shows no streak of his own", card.count() == 1 and card.get_attribute("data-plant-day") == "yes" and card.locator("[data-field='my-day-streak']").count() == 0)
        log_out(page)
        page.evaluate("() => { window.__cues.length = 0; window.__says.length = 0; window.__confetti.length = 0; window.__pops.length = 0; }")
        sign_up(page, STORE_NAME, f"streak-store-b-{stamp}@example.com", "STR")
        page.wait_for_timeout(1500)
        dismiss(page)
        who = (me(page) or {}).get("user") or {}
    else:
        print("    (this server's administrator was made by an earlier suite)")
    check("Signed in as a person of the Store alone", who.get("role") != "admin" and who.get("departments") == ["STR"], who)
    errors.clear()

    today = date.today().isoformat()
    master = stored(page, "master")
    working = not closed_day(today, master)
    w1 = today if working else next_working_day(today, master)
    d2 = next_working_day(w1, master)
    print(f"    today {today} ({'a working day' if working else 'a closed day'}); the Store's kept day {w1}; the Production day at risk {d2}")

    # ==================================================================
    # 1. The counter in the top bar, and the person's own sign-in days
    # ==================================================================
    print("\n==== The top bar and the sign-in days ====")
    order = topbar_order(page)
    check("The top bar begins connection, clock, language, theme, sound - and the streak comes right after the sound button", order[:6] == ["connection", "clock", "language", "theme", "sound", "streak"], order)
    check("...still with Today's briefing after it", any("briefing" in str(x).lower() for x in order[6:]), order)
    check_bar_fits(page, "A staff account's bar, with the streak in it")

    thirty = (date.fromisoformat(today) - timedelta(days=30)).isoformat()
    ask = """async ([q, how]) => { const r = await fetch('/api/me/sign-in-days' + q, { credentials: how }); let body = null; try { body = await r.json(); } catch {} return { status: r.status, cache: r.headers.get('cache-control'), body }; }"""
    own = page.evaluate(ask, [f"?from={thirty}", "include"])
    body = own.get("body") or {}
    check(
        "GET /api/me/sign-in-days: the person's own sign-in days - today's sign-up among them - the first on record, to today, never cached",
        own["status"] == 200 and today in (body.get("days") or []) and body.get("firstDay") == today and body.get("to") == today and body.get("from") == thirty and own.get("cache") == "no-store",
        own,
    )
    named = page.evaluate(ask, [f"?from={thirty}&userId=u-somebody-else&user=admin", "include"])
    check("...an account named in the address is never read: the answer is the caller's own", named["status"] == 200 and named.get("body") == body, named)
    out = page.evaluate(ask, [f"?from={thirty}", "omit"])
    check("...and nobody signed out reads anything (401)", out["status"] == 401, out)
    wide = page.evaluate(ask, ["?from=2020-01-01", "include"])
    check("...the window is 200 days at most: an older from is read as its first day", wide["status"] == 200 and (wide.get("body") or {}).get("from") == (date.fromisoformat(today) - timedelta(days=200)).isoformat(), wide)
    bad = page.evaluate(ask, ["?from=yesterday", "include"])
    check("...and a from that is not a date is refused in words", bad["status"] == 400 and "YYYY-MM-DD" in ((bad.get("body") or {}).get("error") or ""), bad)

    # ==================================================================
    # 2. Signing in on a working day with nothing due keeps today
    # ==================================================================
    print("\n==== A working day with nothing due, kept by the sign-in ====")
    store_cookies = context.cookies()
    kept_page = page
    moved = None
    if working:
        where = "Signed in today, nothing of theirs due"
    else:
        where = f"On {w1}, the next working day (the browser's clock moved there), nothing of theirs due"
        moved, kept_page = moved_context(browser, store_cookies, datetime.fromisoformat(f"{w1}T10:30:00"))
        kept_page.on("pageerror", lambda e: errors.append("moved: " + str(e)))
        open_page(kept_page, "#/dashboard", settle=1200)
    check_kept_celebration(kept_page, w1, STORE_FIRST, where)
    c = wait_counter(kept_page, ["kept"])
    check(
        "The top bar says 🔥 1 - today is kept - and what keeps it going",
        c.get("state") == "kept" and c.get("days") == "1" and c.get("icon") == "🔥" and c.get("num") == "1" and "today is kept" in c.get("title", "") and "to keep it going" in c.get("title", "") and c.get("aria") == c.get("title"),
        c,
    )
    check("...'Sign in tomorrow', or the day the next working day is", ("Sign in tomorrow" in c.get("title", "")) == (next_working_day(w1, master) == (date.fromisoformat(w1) + timedelta(days=1)).isoformat()), c.get("title"))
    check("...and its word, 'day', for where the bar has room", c.get("label") == "day", c)
    check("...and the flame lit once, today becoming kept (a short scale)", c.get("lit") and c.get("animation") == "streak-flame-lit", c)
    open_page(kept_page, "#/dashboard", settle=1500)
    check_day_card(kept_page, w1, 1, "The Dashboard")
    last_state = kept_page.locator("[data-field='my-day-streak'] .streak-strip li").nth(13).get_attribute("data-state") if kept_page.locator("[data-field='my-day-streak'] .streak-strip li").count() == 14 else None
    check("...today's square is kept", last_state == "kept", last_state)
    score = kept_page.locator("[data-field='my-day-score']")
    check("...and today's score is the score, untouched: 0, nothing missing", score.count() == 1 and score.get_attribute("data-score") == "0", score.get_attribute("data-score") if score.count() else None)
    # Reloaded: no second celebration today.
    kept_page.reload()
    kept_page.wait_for_selector(".app-sidebar", timeout=60000)
    kept_page.wait_for_timeout(4000)
    dismiss(kept_page)
    again = events(kept_page)
    check("Opened again the same day: no second celebration, no second sound", not any(x.get("kind") == "streak-kept" for x in again["pops"]) and "celebrate" not in again["cues"], again)
    # A press on the counter from another page opens the day card.
    open_page(kept_page, "#/library", settle=1200)
    kept_page.locator("[data-field='topbar-streak']").first.click()
    try:
        kept_page.wait_for_function("() => location.hash.startsWith('#/dashboard') && document.activeElement && document.activeElement.id === 'my-day'", timeout=6000)
        opened = True
    except Exception:
        opened = False
    check("A press on the counter from another page opens the Dashboard's day card, which takes the focus", opened, kept_page.evaluate("() => [location.hash, document.activeElement && document.activeElement.id]"))
    if moved is not None:
        moved.close()

    # ==================================================================
    # 3. A Production account's day at risk, at 16:05
    # ==================================================================
    print("\n==== A day at risk ====")
    log_out(page)
    sign_up(page, PROD_NAME, f"streak-prd-{stamp}@example.com", "PRD")
    page.wait_for_timeout(2500)
    dismiss(page)
    who = (me(page) or {}).get("user") or {}
    check("Signed in as a person of Production alone", who.get("role") != "admin" and who.get("departments") == ["PRD"], who)
    errors.clear()
    live_start = (stored(page, "live-start") or {}).get("date") or today
    # What this browser holds goes to the database before the next browser opens.
    page.wait_for_timeout(2500)
    prd_cookies = context.cookies()
    at = datetime.fromisoformat(f"{d2}T16:05:00")
    risk_ctx, rp = moved_context(browser, prd_cookies, at, sign_ins=([w1], w1))
    rp.on("pageerror", lambda e: errors.append("at risk: " + str(e)))
    open_page(rp, "#/dashboard", settle=2500)
    clock_now = rp.evaluate("() => { const n = new Date(); return [n.getFullYear(), n.getMonth() + 1, n.getDate(), n.getHours()]; }")
    check(f"The browser's clock reads {d2}, 16:05", clock_now[:3] == [at.year, at.month, at.day] and clock_now[3] == 16, clock_now)

    def hand_in(page, keep_open):
        """Every Production record due from the go-live date to the day before handed in on its day; of the day's,
        all but `keep_open` (ids of documents) handed in at noon; the rest set back to waiting."""
        return page.evaluate(
            """({ today, liveStart, keepOpen, open }) => {
                 const KEY = 'dcrs:v1:records';
                 const rs = JSON.parse(localStorage.getItem(KEY) || '[]');
                 const mine = rs.filter((r) => r.documentId.startsWith('prd-') && !r.isDemo && r.dueDate >= liveStart && r.dueDate <= today);
                 const hand = (r, day) => {
                   const at = new Date(day + 'T12:00:00').toISOString();
                   r.status = 'Verified';
                   r.submittedAt = at; r.submittedBy = 'Prem Streak'; r.verifiedAt = at; r.verifiedBy = 'QA';
                   r.history = [...(r.history || []).filter((h) => h.action !== 'submitted'), { id: 'e2e-' + r.id, at, by: 'Prem Streak', action: 'submitted' }];
                 };
                 const left = [];
                 for (const r of mine) {
                   if (r.dueDate < today) { hand(r, r.dueDate); continue; }
                   if (keepOpen.includes(r.documentId)) {
                     r.status = 'Due';
                     for (const k of ['submittedAt', 'submittedBy', 'verifiedAt', 'verifiedBy', 'rejectedAt', 'rejectedBy', 'rejectionReason', 'correction']) delete r[k];
                     r.history = [];
                     left.push(r.id);
                   } else hand(r, today);
                 }
                 localStorage.setItem(KEY, JSON.stringify(rs));
                 const s = JSON.parse(localStorage.getItem('dcrs:v1:settings') || '{}');
                 s.celebratedToday = { date: '', keys: [] };
                 localStorage.setItem('dcrs:v1:settings', JSON.stringify(s));
                 return { left, today: mine.filter((r) => r.dueDate === today).map((r) => r.documentId) };
               }""",
            {"today": d2, "liveStart": live_start, "keepOpen": keep_open, "open": list(OPEN)},
        )

    every = rp.evaluate("(today) => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').filter((r) => r.documentId.startsWith('prd-') && !r.isDemo && r.dueDate === today).map((r) => r.documentId)", d2)
    plan = hand_in(rp, every)
    print(f"    Production's records due {d2}: {len(plan['today'])}; go-live {live_start}")
    rp.reload()
    rp.wait_for_selector(".app-sidebar", timeout=60000)
    rp.wait_for_timeout(2500)
    dismiss(rp)
    close_assistant(rp)
    n_open = len(plan["left"])
    c = wait_counter(rp, ["risk"])
    check(
        f"At 16:05 with {n_open} records of the day still to do, the streak is at risk: ⌛ 1 'at risk'",
        n_open >= 2 and c.get("state") == "risk" and c.get("icon") == "⌛" and c.get("days") == "1" and c.get("label") == "at risk",
        c,
    )
    check("...and its tooltip says why, in words", c.get("title") == f"⌛ Your 1-day streak is at risk: {n_open} records still to do today.", c.get("title"))
    card = wait_card(rp)
    box = card.locator("[data-field='my-day-streak']")
    today_line = (box.locator("[data-field='my-day-streak-today']").text_content() or "").strip() if box.count() else ""
    check("The day card's streak is in the at-risk tone, and says how many are still to do", box.count() == 1 and box.get_attribute("data-tone") == "risk" and today_line == f"At risk: {n_open} still to do", (box.get_attribute("data-tone") if box.count() else None, today_line))
    squares = box.locator(".streak-strip li")
    states = {squares.nth(i).get_attribute("data-date"): squares.nth(i).get_attribute("data-state") for i in range(squares.count())}
    check(f"...the working day before kept ({w1}), today still open", states.get(w1) == "kept" and states.get(d2) == "today", states)

    # All but one handed in.
    plan = hand_in(rp, [PRD_LAST])
    rp.reload()
    rp.wait_for_selector(".app-sidebar", timeout=60000)
    rp.wait_for_timeout(2500)
    dismiss(rp)
    close_assistant(rp)
    c = wait_counter(rp, ["risk"])
    check("With all but one handed in: '1 record still to do today'", c.get("state") == "risk" and c.get("title") == "⌛ Your 1-day streak is at risk: 1 record still to do today.", c)

    # The last one, through the page: Mitra's sample data, then Submit.
    last = plan["left"][0] if plan["left"] else None
    check("The day's last record is the one left open", last is not None, plan)
    if last:
        open_page(rp, f"#/record/{last}", settle=1500)
        say(rp, "fill it with sample data", wait=1800)
        close_assistant(rp)
        before = events(rp)
        rp.locator("[data-action='submit']").first.click()
        try:
            rp.wait_for_selector("[data-section='mitra-celebration']", timeout=4000)
        except Exception:
            pass
        check("The last record of the day handed in: the all-done card - today's celebration", rp.locator("[data-section='mitra-celebration']").count() == 1)
        c = wait_counter(rp, ["kept"])
        rp.wait_for_timeout(1500)
        c = counter(rp)
        check("...the counter turns 🔥 2, today kept", c.get("state") == "kept" and c.get("days") == "2" and c.get("icon") == "🔥", c)
        check("...with the flame lit (a short scale, once)", c.get("lit") and c.get("animation") == "streak-flame-lit", c)
        rp.wait_for_timeout(2500)
        after = events(rp)
        check(
            "...and no second celebration for the streak: the all-done card counts as today's",
            not any(x.get("kind") == "streak-kept" for x in after["pops"]) and not any((s.get("key") or "").startswith("streak-kept:") for s in after["says"]),
            (after["pops"], after["says"][len(before["says"]):]),
        )
        kept = (stored(rp, "settings") or {}).get("celebratedToday") or {}
        check("...remembered as celebrated today", kept.get("date") == d2 and "streak-kept" in (kept.get("keys") or []), kept)
        status = next((r.get("status") for r in (stored(rp, "records") or []) if r.get("id") == last), None)
        check("...the record itself handed in", status in ("Submitted", "Pending Verification"), status)

        # ==================================================================
        # 4. Reduced motion stills the flame
        # ==================================================================
        print("\n==== Reduced motion ====")
        rp.emulate_media(reduced_motion="reduce")
        rp.wait_for_timeout(300)
        c = counter(rp)
        check("With reduced motion asked for, the lit flame does not move (animation: none)", c.get("lit") and c.get("animation") == "none", c)
        rp.emulate_media(reduced_motion="no-preference")
        rp.wait_for_timeout(300)
        check("...and moves again when it is not", counter(rp).get("animation") == "streak-flame-lit", counter(rp))
    # What this browser handed in goes to the database before the next one opens.
    rp.wait_for_timeout(2500)
    risk_ctx.close()

    # ==================================================================
    # 5. On a phone: the sign and the number alone
    # ==================================================================
    print("\n==== On a phone ====")
    phone_ctx, ph = moved_context(browser, prd_cookies, at, viewport={"width": 390, "height": 844}, sign_ins=([w1], w1))
    ph.on("pageerror", lambda e: errors.append("phone: " + str(e)))
    open_page(ph, "#/dashboard", settle=2500)
    c = wait_counter(ph, ["kept", "risk", "open"])
    shown = ph.evaluate(
        """() => { const el = document.querySelector("[data-field='topbar-streak']"); if (!el) return null; const label = el.querySelector('.streak-counter-label');
             const r = el.getBoundingClientRect(); return { label: label ? getComputedStyle(label).display : 'none', text: el.innerText.trim(), left: r.left, right: r.right, page: document.documentElement.scrollWidth }; }"""
    )
    check(
        "On a phone the counter is the sign and the number alone",
        shown is not None and shown["label"] == "none" and c.get("count") == 1 and shown["text"].replace("\n", "").replace(" ", "") == f"{c.get('icon')}{c.get('days')}",
        (shown, c),
    )
    check("...inside the screen, and the page never grows wider than it", shown is not None and shown["left"] >= 0 and shown["right"] <= 390 and shown["page"] <= 390, shown)
    phone_ctx.close()

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe daily streak: kept by signing in and missing nothing, 🔥 on every screen, ⌛ when today is at risk, celebrated once a day.")
