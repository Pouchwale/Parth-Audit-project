"""The light and dark themes and the premium look (REQUIREMENTS s90), asked for on
3-Oct-2026: "add theme, dark and light, a premium look for the whole website from
start to end".

  * the switch: an icon in the top bar after the language control (the bar still
    begins connection, clock, language), a menu of three radios - Light, Dark and
    Same as my computer - by mouse and by keyboard;
  * light until somebody chooses; the choice kept with the person's settings (so a
    reload, another browser and signing in again all show it) and mirrored in this
    browser for the first paint; the sign-in screen keeps this computer's last look;
  * Same as my computer follows the computer's own light or dark, live;
  * no flash: the first frames after a navigation are already in the theme;
  * the paper stays a white sheet in its own ink in dark, and printing is the same
    picture in light and dark;
  * every route opens in dark with nothing left on a light surface outside the
    paper, and the page never grows wider than a phone at 390 px with the menu open.

Network-independent (Google Translate is blocked; the server has no model key).
Against the production build on :8842 (sign-up open).
"""
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []
LIGHT_BG = "rgb(250, 249, 245)"
DARK_BG = "rgb(38, 38, 36)"
RECORD_DOC = "qc-incoming-lamination-film"
PAPER = '[data-print-doc]:not([data-print-doc="ui"]), .doc-header, .register-page, .caf-page, .trend-head, .trend-chart, .designer-sheet'
# Light on purpose in either theme: a QR code is dark on white to scan, the launcher's
# count is a near-white disc, a switch's thumb is near-white, scans and photos sit on
# their white backing.
LIGHT_ON_PURPOSE = ".mitra-qr, .mitra-phone-code, .assistant-pill-count, .voice-switch-thumb, .register-original, .licence-scan, .sa-scan, .caf-photo, .intro-splash"
ROUTES = [
    "#/dashboard", "#/library", "#/files", "#/calendar", "#/day", "#/search", "#/assistant", "#/hr", "#/hr/master-data", "#/hr/skill-matrix",
    "#/qc", "#/document/qc-viscosity", "#/pest-control", "#/pest/daily", "#/pest/service/rodent", "#/pest/trend/rodent", "#/pest/trend/lizard",
    "#/pest/trend/fly-catcher", "#/gap", "#/gap/internal", "#/gap/external", "#/training", "#/performance", "#/insights", "#/reports", "#/users",
    "#/access", "#/activity", "#/master-data", "#/licence", "#/chemical-master", "#/soc", "#/demo",
]
PROPS = ["color", "backgroundColor", "borderTopColor", "borderBottomColor", "borderLeftColor", "borderRightColor", "fontSize", "fontWeight", "fontFamily",
         "letterSpacing", "lineHeight", "paddingTop", "paddingLeft", "boxShadow", "borderTopLeftRadius", "accentColor", "display", "visibility"]
PRINTED = """(props) => {
  const out = [];
  for (const d of document.querySelectorAll('[data-print-doc]')) {
    if (!d.getClientRects().length) continue;
    for (const el of [d, ...d.querySelectorAll('*')]) {
      if (!el.getClientRects().length) continue;
      const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      out.push([el.tagName, Math.round(r.width), Math.round(r.height), ...props.map((p) => s[p])].join('|'));
    }
  }
  return out;
}"""
LIGHT_SURFACES = """([paper, allowed]) => {
  const parse = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c || ''); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const light = (c) => !!c && c.a >= 0.6 && lum(c) > 0.5;
  const found = [];
  for (const el of document.querySelectorAll('body *')) {
    const tag = el.tagName.toLowerCase();
    if (['img', 'svg', 'path', 'canvas', 'iframe', 'video', 'image', 'option', 'script', 'style'].includes(tag)) continue;
    if (el.closest(paper) || el.closest(allowed)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 200) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) < 0.1) continue;
    const stops = (s.backgroundImage || '').includes('gradient') ? [...s.backgroundImage.matchAll(/rgba?\\([^)]+\\)/g)].map((m) => parse(m[0])) : [];
    if (light(parse(s.backgroundColor)) || stops.some(light)) {
      found.push(`${tag}.${(el.getAttribute('class') || '').trim().split(/\\s+/).slice(0, 3).join('.')} ${s.backgroundColor}${stops.length ? ' ' + s.backgroundImage.slice(0, 60) : ''}`);
      if (found.length >= 8) break;
    }
  }
  return found;
}"""


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


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
        for sel in ["button:has-text('Got it')", "[data-action='tour-skip']"]:
            g = page.locator(sel)
            try:
                if g.count() and g.first.is_visible():
                    g.first.click()
                    page.wait_for_timeout(200)
            except Exception:
                pass
    settle_briefing(page)
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        try:
            btn.first.click()
            page.wait_for_timeout(200)
        except Exception:
            pass


def intro_gone(page, timeout=12000):
    try:
        page.wait_for_selector("[data-section='intro-splash']", state="detached", timeout=timeout)
    except Exception:
        skip = page.locator("[data-action='intro-skip']")
        if skip.count():
            skip.first.click()
            page.wait_for_timeout(700)


def state(page):
    return page.evaluate(
        """() => ({ attr: document.documentElement.getAttribute('data-theme'), mirror: localStorage.getItem('dcrs:theme'),
                    stored: JSON.parse(localStorage.getItem('dcrs:v1:settings') || '{}').theme,
                    bg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme })"""
    )


def go(page, route, settle=1100):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)


def pick(page, choice, where=".app-topbar"):
    page.locator(f"{where} [data-action='theme-menu']").first.click()
    page.wait_for_selector(f"{where} .theme-menu [data-theme-choice='{choice}']", timeout=5000)
    page.locator(f"{where} .theme-menu [data-theme-choice='{choice}']").first.click()
    page.wait_for_timeout(300)


def printed(page, theme):
    page.evaluate("(t) => document.documentElement.setAttribute('data-theme', t)", theme)
    page.evaluate("() => window.dispatchEvent(new Event('beforeprint'))")
    page.emulate_media(media="print")
    page.wait_for_timeout(250)
    try:
        return page.evaluate(PRINTED, PROPS), page.screenshot(full_page=True)
    finally:
        page.emulate_media(media="screen")
        page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1366, "height": 768})
    page = context.new_page()
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    print("\n==== Light until somebody chooses ====")
    page.goto(f"{BASE}/index.html")
    intro_gone(page)
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    s = state(page)
    check("A computer that never chose paints light: no theme on <html>, no copy kept, the light canvas", s["attr"] is None and s["mirror"] is None and s["bg"] == LIGHT_BG and s["scheme"] == "light", s)
    check("The sign-in card has the theme switch at its foot, after the form", page.locator(".auth-card > .auth-theme:last-child [data-action='theme-menu']").count() == 1)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    email = f"theme-{int(time.time() * 1000)}@example.com"
    page.fill("#signup-name", "Theme QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    intro_gone(page, 8000)
    page.wait_for_timeout(1200)
    dismiss(page)
    s = state(page)
    check("Signed in, it is light: data-theme light on <html>, light body", s["attr"] == "light" and s["bg"] == LIGHT_BG, s)

    print("\n==== The switch in the top bar ====")
    order = page.evaluate(
        """() => Array.from(document.querySelector('.app-topbar-end').children).map((el) => el.matches('[data-connection]') ? 'connection' : el.matches('[data-clock]') ? 'clock'
                 : el.querySelector('.lang-select') ? 'language' : el.matches('[data-theme-switch]') ? 'theme' : (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20))"""
    )
    check("The bar begins connection, clock, language, then the theme switch", order[:4] == ["connection", "clock", "language", "theme"], order)
    button = page.locator(".app-topbar [data-action='theme-menu']").first
    attrs = button.evaluate("(b) => ({ label: b.getAttribute('aria-label'), popup: b.getAttribute('aria-haspopup'), expanded: b.getAttribute('aria-expanded'), words: b.innerText.trim(), cls: b.className })")
    check("It is an icon button named Theme, a menu button, with no word of its own", attrs == {"label": "Theme", "popup": "menu", "expanded": "false", "words": "", "cls": "btn btn-ghost btn-sm"}, attrs)
    check("The three choices are not on the page until it is opened", page.locator("[data-action='set-theme']").count() == 0)
    button.click()
    page.wait_for_timeout(250)
    items = page.evaluate("() => Array.from(document.querySelectorAll('.theme-menu [role=menuitemradio]')).map((b) => [b.dataset.themeChoice, b.dataset.action, b.getAttribute('aria-checked'), b.innerText.trim()])")
    check("Opened: a menu of three radios - Light (ticked), Dark, Same as my computer", items == [["light", "set-theme", "true", "Light"], ["dark", "set-theme", "false", "Dark"], ["system", "set-theme", "false", "Same as my computer"]], items)
    check("...the menu is named, and the button says it is open", page.locator(".theme-menu[role='menu'][aria-label='Theme']").count() == 1 and button.get_attribute("aria-expanded") == "true")
    page.evaluate("() => document.querySelector('.app-content').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))")
    page.wait_for_timeout(200)
    check("A click elsewhere closes it", page.locator(".theme-menu").count() == 0)

    print("\n==== Dark, chosen with the mouse, kept ====")
    pick(page, "dark")
    s = state(page)
    check("Dark: on <html>, kept with the person's settings, mirrored for the first paint, the dark canvas", s == {"attr": "dark", "mirror": "dark", "stored": "dark", "bg": DARK_BG, "scheme": "dark"}, s)
    badge = page.evaluate("() => { const b = document.querySelector('[data-connection]'); const s = getComputedStyle(b); return [s.backgroundColor, s.color]; }")
    check("The top bar's badge is in the dark theme's colours too", badge[0] != "rgb(227, 245, 232)", badge)
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1200)
    dismiss(page)
    s = state(page)
    check("After a reload: still dark", s["attr"] == "dark" and s["bg"] == DARK_BG, s)

    print("\n==== By keyboard ====")
    button = page.locator(".app-topbar [data-action='theme-menu']").first
    button.focus()
    page.keyboard.press("Enter")
    page.wait_for_timeout(250)
    focused = page.evaluate("() => document.activeElement && document.activeElement.getAttribute('data-theme-choice')")
    check("Enter opens the menu on the ticked choice", focused == "dark", focused)
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(100)
    focused = page.evaluate("() => document.activeElement && document.activeElement.getAttribute('data-theme-choice')")
    check("The arrows move among the choices", focused == "system", focused)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    back = page.evaluate("() => ({ open: !!document.querySelector('.theme-menu'), focus: document.activeElement && document.activeElement.getAttribute('data-action'), theme: document.documentElement.getAttribute('data-theme') })")
    check("Escape closes it without a change, and focus is back on the button", back == {"open": False, "focus": "theme-menu", "theme": "dark"}, back)
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(200)
    opened = page.evaluate("() => document.activeElement && document.activeElement.getAttribute('data-theme-choice')")
    check("The down arrow on the button opens the menu too, on the ticked choice", opened == "dark", opened)
    page.keyboard.press("ArrowUp")
    page.wait_for_timeout(100)
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    s = state(page)
    check("Enter chooses: Light, kept", s["attr"] == "light" and s["stored"] == "light" and s["bg"] == LIGHT_BG, s)

    print("\n==== Same as my computer ====")
    pick(page, "system")
    page.emulate_media(color_scheme="dark")
    page.wait_for_timeout(250)
    sd = state(page)
    page.emulate_media(color_scheme="light")
    page.wait_for_timeout(250)
    sl = state(page)
    check("It follows the computer, live: dark while the computer is dark, light when it is light", sd["attr"] == "system" and sd["bg"] == DARK_BG and sd["scheme"] == "dark" and sl["bg"] == LIGHT_BG, (sd, sl))
    pick(page, "dark")

    print("\n==== No flash of the wrong theme ====")
    probe = context.new_page()
    probe.add_init_script(
        """(() => { window.__frames = []; const tick = () => requestAnimationFrame(() => {
             const b = document.body; window.__frames.push({ theme: document.documentElement.getAttribute('data-theme'), bg: b ? getComputedStyle(b).backgroundColor : null });
             if (window.__frames.length < 6) tick(); }); tick(); })();"""
    )
    probe.goto(f"{BASE}/index.html#/library", wait_until="commit")
    probe.wait_for_timeout(1500)
    frames = probe.evaluate("() => window.__frames")
    check("The first frames after a navigation are already dark (the theme is set before the stylesheet is read)", bool(frames) and frames[0]["theme"] == "dark" and all(f["bg"] in (DARK_BG, None) for f in frames) and any(f["bg"] == DARK_BG for f in frames), frames)
    probe.close()

    print("\n==== The paper stays paper ====")
    go(page, "#/library")
    new = page.locator(f"[data-action='new-record'][data-document='{RECORD_DOC}']").first
    new.scroll_into_view_if_needed()
    new.click()
    page.wait_for_url("**#/record/**", timeout=20000)
    record = "#/" + page.url.split("#/")[1]
    page.wait_for_timeout(1300)
    dismiss(page)
    sheet = page.evaluate(
        """() => { const d = document.querySelector('[data-print-doc]'); const s = getComputedStyle(d); const i = d.querySelector('input.input');
                   const head = d.querySelector('.doc-header'); return { bg: s.backgroundColor, ink: s.color, scheme: s.colorScheme, input: i ? getComputedStyle(i).backgroundColor : null,
                   head: head ? getComputedStyle(head).borderTopColor : null }; }"""
    )
    check("In dark the record is a white sheet in its own ink, its boxes white, its rules today's", sheet == {"bg": "rgb(255, 255, 255)", "ink": "rgb(28, 39, 51)", "scheme": "light", "input": "rgb(255, 255, 255)", "head": "rgb(44, 62, 80)"}, sheet)

    print("\n==== Printing is the same in either theme ====")
    for label, route in (("a record", record), ("the monthly register", "#/pest/daily"), ("Document Files", "#/files")):
        go(page, route, 1500)
        dark_styles, dark_png = printed(page, "dark")
        light_styles, light_png = printed(page, "light")
        check(f"Printing {label}: every element the same in dark and light, and the same picture", len(dark_styles) > 0 and dark_styles == light_styles and dark_png == light_png, (len(dark_styles), len(light_styles), dark_png == light_png))
    page.evaluate("() => document.documentElement.setAttribute('data-theme', 'dark')")

    print("\n==== Every page in dark ====")
    for route in ROUTES:
        go(page, route, 1200)
        s = state(page)
        broken = page.locator("text=This screen couldn't be shown").count()
        found = page.evaluate(LIGHT_SURFACES, [PAPER, LIGHT_ON_PURPOSE])
        check(f"{route}: opens in dark, nothing on a light surface outside the paper", s["attr"] == "dark" and s["bg"] == DARK_BG and not broken and not found, (s["attr"], s["bg"], broken, found))

    print("\n==== Signing out keeps this computer's look; signing in again, the person's ====")
    page.locator(".app-topbar button[title='Log Out']").first.click()
    page.wait_for_timeout(500)
    page.locator("[data-action='logout-review-confirm']").first.click()
    page.wait_for_selector("#login-email", timeout=30000)
    intro_gone(page)
    page.wait_for_timeout(800)
    s = state(page)
    card = page.evaluate("() => getComputedStyle(document.querySelector('.auth-card')).backgroundColor")
    check("The sign-in screen is dark, as this computer was left", s["attr"] == "dark" and s["mirror"] == "dark" and s["bg"] == DARK_BG and card != "rgb(255, 255, 255)", (s, card))
    page.locator(".auth-theme [data-action='theme-menu']").click()
    page.wait_for_timeout(250)
    inside = page.evaluate("() => { const m = document.querySelector('.auth-theme .theme-menu').getBoundingClientRect(); const c = document.querySelector('.auth-card').getBoundingClientRect(); return m.top >= c.top && m.bottom <= c.bottom && m.left >= c.left && m.right <= c.right; }")
    check("The sign-in card's menu opens upward, inside the card", inside)
    page.keyboard.press("Escape")
    page.fill("#login-email", email)
    page.fill("#login-password", PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1200)
    dismiss(page)
    s = state(page)
    check("Signed in again: the person's dark", s["attr"] == "dark" and s["stored"] == "dark", s)

    print("\n==== Another browser, and a phone ====")
    phone = browser.new_context(viewport={"width": 390, "height": 844})
    phone.add_cookies(context.cookies())
    ph = phone.new_page()
    ph.route("**/translate_a/**", lambda route: route.abort())
    ph.on("pageerror", lambda e: errors.append("phone: " + str(e)))
    ph.goto(f"{BASE}/index.html#/dashboard")
    ph.wait_for_selector(".app-topbar", timeout=60000)
    intro_gone(ph, 8000)
    ph.wait_for_timeout(1500)
    dismiss(ph)
    s = state(ph)
    check("Another browser, nothing kept in it: the person's dark comes from the database", s["attr"] == "dark" and s["bg"] == DARK_BG, s)
    ph.locator(".app-topbar [data-action='theme-menu']").first.click()
    ph.wait_for_timeout(300)
    wide = ph.evaluate("() => { const m = document.querySelector('.theme-menu').getBoundingClientRect(); return { page: document.documentElement.scrollWidth, left: m.left, right: m.right }; }")
    check("At 390 px the open menu lies inside the window and the page does not grow wider", wide["page"] <= 390 and wide["left"] >= 0 and wide["right"] <= 390, wide)
    ph.keyboard.press("Escape")
    pick(ph, "light")
    ph.wait_for_timeout(2500)
    phone.close()
    try:
        page.wait_for_function("() => document.documentElement.getAttribute('data-theme') === 'light'", timeout=20000)
        followed = True
    except Exception:
        followed = False
    check("The browser still open follows within seconds: the change comes in from the database", followed, state(page))

    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    s = state(page)
    check("Chosen on the phone, light is this person's everywhere: the other browser shows it on its next load", s["attr"] == "light" and s["bg"] == LIGHT_BG, s)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nLight, dark or the same as the computer: kept for the person, painted before the first frame, the paper always paper.")
