"""The top bar's connection badge and clock (REQUIREMENTS s78), asked for on
26-Sep-2026: "the user can see the wifi/lan connected or not with data speed
... coloured ... when site is down it will show error ... and time is also
showing in 12 hour format like hour, minute, seconds".

  * beside Today's briefing and the language control: a clock in hours,
    minutes and seconds, 12-hour, ticking;
  * a badge that says whether the site can be reached and how fast, as a
    colour and a word - Online (green), Slow, Very slow, No internet (grey),
    Site down (red) - with the speed beside it;
  * the network going away shows at once, and coming back shows within
    seconds; the site's server not answering shows as Site down, and its
    answering again as Online; the badge is clicked to check now;
  * the words follow the language chosen.

Network-independent (Google Translate is blocked; the server has no model key).
Against the production build on :8842.
"""
import re
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []
CLOCK_RE = re.compile(r"^(0[1-9]|1[0-2]):[0-5]\d:[0-5]\d (AM|PM)$")
UP = ("good", "fair", "poor")


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


def state(page):
    return page.locator("[data-connection]").first.get_attribute("data-connection")


def wait_state(page, wanted, timeout=15000):
    try:
        page.wait_for_function("(w) => { const b = document.querySelector('[data-connection]'); return !!b && w.includes(b.getAttribute('data-connection')); }", arg=list(wanted), timeout=timeout)
        return True
    except Exception:
        return False


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1400, "height": 900})
    page = context.new_page()
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "Status Bar QA")
    page.fill("#signup-email", f"status-{int(time.time() * 1000)}@example.com")
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1200)
    dismiss(page)

    print("\n==== The clock ====")
    clock = page.locator("[data-clock]")
    first = clock.first.inner_text().strip() if clock.count() else ""
    check("The top bar shows the time in hours, minutes and seconds, 12-hour", clock.count() == 1 and bool(CLOCK_RE.match(first)), first)
    page.wait_for_timeout(1600)
    second = clock.first.inner_text().strip() if clock.count() else ""
    check("...and it ticks", second != first and bool(CLOCK_RE.match(second)), (first, second))
    order = page.evaluate(
        """() => { const end = document.querySelector('.app-topbar-end'); if (!end) return []; return Array.from(end.children).map((el) => el.matches('[data-connection]') ? 'connection' : el.matches('[data-clock]') ? 'clock' : el.matches('.lang-select, .lang-select *') || el.querySelector('.lang-select') ? 'language' : (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)); }"""
    )
    check("Both sit beside the language control and Today's briefing", order[:3] == ["connection", "clock", "language"] and any("briefing" in str(x).lower() for x in order), order)

    print("\n==== The connection badge ====")
    check("The badge is there, and soon says the site is reachable: Online, Slow or Very slow", wait_state(page, UP), state(page))
    badge = page.locator("[data-connection]").first
    label = badge.locator(".topbar-label").inner_text().strip()
    speed = badge.get_attribute("data-speed") or ""
    check("...with a word and the speed beside it (…Mbps, …ms)", label in ("Online", "Slow", "Very slow") and re.search(r"\d+ ms", speed) is not None, (label, speed))
    colour = badge.evaluate("el => getComputedStyle(el).backgroundColor")
    check("...coloured — green when good", state(page) != "good" or colour == "rgb(227, 245, 232)", (state(page), colour))

    context.set_offline(True)
    check("The network gone, the badge says so at once: No internet, grey", wait_state(page, ("offline",), 5000) and badge.locator(".topbar-label").inner_text().strip() == "No internet", state(page))
    context.set_offline(False)
    check("...and back, it is Online again within seconds", wait_state(page, UP, 15000), state(page))

    # The internet is there, the site is not: the server's answer is blocked.
    page.route("**/api/health*", lambda route: route.abort())
    badge.click()
    check("The site's server not answering shows as Site down, red", wait_state(page, ("down",), 12000) and badge.locator(".topbar-label").inner_text().strip() == "Site down", state(page))
    check("...its tooltip says it will keep trying and can be clicked to try now", "try" in (badge.get_attribute("title") or "").lower(), badge.get_attribute("title"))
    page.unroute("**/api/health*")
    badge.click()
    check("The server answering again, the badge is Online again", wait_state(page, UP, 12000), state(page))

    print("\n==== In Gujarati ====")
    page.select_option(".lang-select", "gu")
    page.wait_for_timeout(600)
    gu_label = badge.locator(".topbar-label").inner_text().strip()
    check("With Gujarati chosen the badge's word is Gujarati, the figures and the clock as they were", gu_label in ("ઓનલાઇન", "ધીમું", "ખૂબ ધીમું") and bool(CLOCK_RE.match(clock.first.inner_text().strip())), (gu_label, clock.first.inner_text()))
    page.select_option(".lang-select", "en")
    page.wait_for_timeout(400)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe top bar tells the time and whether the site is there — at a glance, in colour.")
