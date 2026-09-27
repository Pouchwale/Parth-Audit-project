"""The system's name introduced in 3D, and engaging fonts (REQUIREMENTS s81),
asked for on 27-Sep-2026: "make starting of this system like introduction of
project name in 3d and also make use of good engaging fonts".

  * the first time the sign-in screen opens in a browser session, the company's
    mark and "DCRS" fly in over it in CSS 3D, with the system's and the
    company's names beneath - a layer that catches nothing: the email and
    password boxes take typing and Log In can be pressed while it plays, and
    it has left the page within 2.5 s;
  * it plays once a session, never after signing in, never when a signed-in
    page is opened, and never for somebody whose system asks for less motion;
  * the sign-in title is a 3D wordmark in the display face, whose one entrance
    lasts no more than 0.6 s and moves nothing else;
  * the app's text is in Plus Jakarta Sans and its titles in Baloo Bhai 2, the
    font files served by the site itself with 200 - Gujarati ones only once
    Gujarati is on the screen;
  * the printed forms keep the stack they always had, on screen and on paper.

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
ACCOUNT = "intro-fonts-suite@example.com"
FAILURES = []
INTRO = "[data-section='intro-splash']"
# styles.css --font-sans before REQUIREMENTS s81 — the printed forms' face.
OLD_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
GUJARATI = re.compile(r"[\u0A80-\u0AFF]")


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


def stack(value):
    """A computed font-family, quoted and spaced one way."""
    return re.sub(r"\s*,\s*", ", ", (value or "").replace("'", '"')).strip()


def font_of(page, selector):
    return page.evaluate("(s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).fontFamily : null; }", selector)


# Everything about the layer at one instant, so "while it plays" is certain.
INTRO_NOW = """() => {
  const el = document.querySelector("[data-section='intro-splash']");
  const hitsItself = (sel) => {
    const t = document.querySelector(sel);
    if (!t) return false;
    const r = t.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!at && (at === t || t.contains(at));
  };
  if (!el) return { present: false, emailHit: hitsItself('#login-email'), buttonHit: hitsItself("form button[type='submit']") };
  const all = [el, ...el.querySelectorAll('*')];
  const r = el.getBoundingClientRect();
  return {
    present: true,
    catching: all.filter((e) => getComputedStyle(e).pointerEvents !== 'none').map((e) => e.className || e.tagName),
    position: getComputedStyle(el).position,
    overflow: getComputedStyle(el).overflow,
    ariaHidden: el.getAttribute('aria-hidden'),
    noPrint: el.classList.contains('no-print'),
    text: el.textContent || '',
    right: r.right,
    inner: innerWidth,
    scroll: document.documentElement.scrollWidth,
    preserve3d: all.some((e) => getComputedStyle(e).transformStyle === 'preserve-3d'),
    perspective: all.some((e) => getComputedStyle(e).perspective !== 'none'),
    turning: all.filter((e) => /rotate|matrix3d/.test(getComputedStyle(e).transform) || getComputedStyle(e).animationName.includes('intro')).length,
    canvas: el.querySelectorAll('canvas').length,
    logo: !!el.querySelector("img[src*='logo-192']"),
    emailHit: hitsItself('#login-email'),
    buttonHit: hitsItself("form button[type='submit']"),
    formThere: !!document.querySelector('#login-email') && getComputedStyle(document.querySelector('.auth-card')).display !== 'none',
  };
}"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1280, "height": 800})
    page = context.new_page()
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    console_errors = []
    font_responses = []
    font_failures = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("response", lambda r: font_responses.append((r.url, r.status)) if "/fonts/" in r.url else None)
    page.on("requestfailed", lambda r: font_failures.append(r.url) if "/fonts/" in r.url else None)

    # ==================================================================
    print("\n==== The introduction, on the first visit ====")
    # ==================================================================
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    seen_at = time.time()
    now = page.evaluate(INTRO_NOW)
    check("The first time the sign-in screen opens, the introduction plays over it", now["present"], now)
    if now["present"]:
        check("...a layer that catches nothing: pointer-events none, itself and everything in it", now["catching"] == [], now["catching"])
        check("...fixed over the page, clipped to it, hidden from screen readers and from print", now["position"] == "fixed" and now["overflow"] == "hidden" and now["ariaHidden"] == "true" and now["noPrint"], now)
        check("...the sign-in form is there under it from the first frame", now["formThere"])
        check("...a click on the email box lands in the box, and one on Log In on the button", now["emailHit"] and now["buttonHit"], now)
        check("...CSS 3D: perspective, preserve-3d and turning pieces, no canvas", now["perspective"] and now["preserve3d"] and now["turning"] >= 3 and now["canvas"] == 0, now)
        check(
            "...the company's mark, DCRS, the system's name and the company's name",
            now["logo"] and "DCRS" in now["text"] and "Digital Controlled Record System" in now["text"] and "Gujarat Printpack Publication" in now["text"],
            now["text"],
        )
        check("...with no words the sign-in checks look for ('sign up', 'demo')", not re.search(r"sign\s*up|demo", now["text"], re.I), now["text"])
        check("...and nothing wider than the window", now["right"] <= now["inner"] + 1 and now["scroll"] <= now["inner"], now)
    page.fill("#login-email", "somebody@example.com")
    page.fill("#login-password", "typed-while-it-plays")
    typed = page.input_value("#login-email") == "somebody@example.com" and page.input_value("#login-password") == "typed-while-it-plays"
    check("The email and password boxes take typing while it plays", typed)
    try:
        page.locator("form button[type='submit']").first.click(trial=True, timeout=3000)
        clickable = True
    except Exception as e:  # noqa: BLE001 - reported as the check's detail
        clickable = str(e)
    check("...and Log In can be pressed (nothing covers it)", clickable is True, clickable)
    page.fill("#login-email", "")
    page.fill("#login-password", "")
    try:
        page.wait_for_selector(INTRO, state="detached", timeout=2500)
    except Exception:
        pass
    gone_after = time.time() - seen_at
    check("It has left the page within 2.5 s", page.locator(INTRO).count() == 0 and gone_after <= 2.5, round(gone_after, 2))
    check("...and it said so for this browser session", page.evaluate("() => sessionStorage.getItem('dcrs:intro-seen')") == "1")

    print("\n==== The sign-in title, a 3D wordmark ====")
    title = page.evaluate(
        """() => { const t = document.querySelector('.auth-brand .title'); const s = getComputedStyle(t);
                   const card = getComputedStyle(document.querySelector('.auth-card')); const box = getComputedStyle(document.querySelector('#login-email'));
                   return { text: t.textContent.trim(), font: s.fontFamily, filter: s.filter, clip: s.webkitBackgroundClip || s.backgroundClip, image: s.backgroundImage,
                            duration: parseFloat(s.animationDuration) || 0, iterations: s.animationIterationCount, name: s.animationName,
                            cardMoves: card.animationName !== 'none' || card.transform !== 'none', boxMoves: box.animationName !== 'none' || box.transform !== 'none' }; }"""
    )
    check("The title still reads Digital Controlled Record System", title["text"] == "Digital Controlled Record System", title["text"])
    check("...in the display face, Baloo Bhai 2", stack(title["font"]).startswith('"Baloo Bhai 2"'), title["font"])
    check("...a gradient face over steps of depth (layered shadows)", "gradient" in title["image"] and title["clip"] == "text" and title["filter"].count("drop-shadow") >= 3, title)
    check("...its one entrance lasts no more than 0.6 s and never repeats", title["name"] != "none" and 0 < title["duration"] <= 0.6 and title["iterations"] == "1", title)
    check("...and the card and the boxes never move", not title["cardMoves"] and not title["boxMoves"], title)

    print("\n==== The fonts on the sign-in screen ====")
    page.evaluate("() => document.fonts.ready")
    fonts = page.evaluate(
        """() => ({ check: document.fonts.check('16px "Baloo Bhai 2"'),
                    loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')),
                    body: getComputedStyle(document.body).fontFamily })"""
    )
    check("document.fonts.check('16px \"Baloo Bhai 2\"') is true, and the face is loaded", fonts["check"] and "Baloo Bhai 2" in fonts["loaded"], fonts)
    check("The body's text is in Plus Jakarta Sans", stack(fonts["body"]).startswith('"Plus Jakarta Sans"'), fonts["body"])
    check("The font files come from the site itself, each with 200", len(font_responses) >= 2 and all(s == 200 for _, s in font_responses) and not font_failures, (font_responses, font_failures))
    check("No Gujarati font file is fetched for an English screen", not any("gujarati" in u for u, _ in font_responses), font_responses)

    print("\n==== Once a session ====")
    page.reload()
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(400)
    check("Opened again in the same session, the sign-in screen shows no introduction", page.locator(INTRO).count() == 0)

    for label, options in (
        ("A browser that asks for less motion sees no introduction", {"reduced_motion": "reduce"}),
        ("On a phone (390 px) it plays within the screen and the email box is still the box", {"viewport": {"width": 390, "height": 844}}),
    ):
        other = browser.new_context(**{"viewport": {"width": 1280, "height": 800}, **options})
        o = other.new_page()
        o_errors = []
        o.on("pageerror", lambda e: o_errors.append(str(e)))
        o.goto(f"{BASE}/index.html")
        o.wait_for_selector("#login-email", timeout=60000)
        seen = o.evaluate(INTRO_NOW)
        if "reduced_motion" in options:
            o.wait_for_timeout(300)
            still = o.evaluate("() => getComputedStyle(document.querySelector('.auth-brand .title')).animationName")
            check(label, not seen["present"] and o.locator(INTRO).count() == 0 and still == "none", (seen, still))
        else:
            check(label, seen["present"] and seen["scroll"] <= 390 and seen["right"] <= 391 and seen["emailHit"], seen)
        check("...with no JavaScript errors", not o_errors, o_errors[:3])
        other.close()

    # The sign-in screen's own: its question to /api/auth/me is answered 401, as always.
    signin_console = [e for e in console_errors if "auth/me" not in e and "401" not in e]
    check("No console errors on the sign-in screen (a font file that failed would be one)", not signin_console, signin_console[:5])

    # ==================================================================
    print("\n==== After signing in ====")
    # ==================================================================
    # A fixed account, created only the first time (the server limits new
    # accounts per network — MAX_SIGNUPS_PER_IP, backend/index.ts).
    page.fill("#login-email", ACCOUNT)
    page.fill("#login-password", PASSWORD)
    page.click("button:has-text('Log In')")
    try:
        page.wait_for_selector(".app-sidebar", timeout=2500)
    except Exception:
        page.click("text=Sign up")
        page.wait_for_selector("#signup-name", timeout=30000)
        page.fill("#signup-name", "Intro Fonts QA")
        page.fill("#signup-email", ACCOUNT)
        page.fill("#signup-password", PASSWORD)
        page.fill("#signup-confirm", PASSWORD)
        page.click("button:has-text('Create Account')")
        page.wait_for_selector(".app-sidebar", timeout=60000)
    after = [page.locator(INTRO).count()]
    page.wait_for_timeout(1200)
    after.append(page.locator(INTRO).count())
    dismiss(page)
    check("Signed in, there is no introduction", after == [0, 0], after)
    # A run that stopped half way may have left this account in Gujarati.
    lang = page.locator(".lang-select")
    if lang.count() and lang.first.input_value() != "en":
        page.select_option(".lang-select", "en")
        page.wait_for_timeout(1000)
        page.wait_for_selector(".app-sidebar", timeout=60000)
        dismiss(page)

    fresh = context.new_page()
    fresh.add_init_script(
        """(() => { window.__introSeen = false; new MutationObserver(() => { if (document.querySelector("[data-section='intro-splash']")) window.__introSeen = true; })
                   .observe(document, { childList: true, subtree: true }); })()"""
    )
    fresh_errors = []
    fresh.on("pageerror", lambda e: fresh_errors.append(str(e)))
    fresh.goto(f"{BASE}/index.html")
    fresh.wait_for_selector(".app-sidebar", timeout=60000)
    fresh.wait_for_timeout(1800)
    check(
        "A signed-in page opened in a new tab (a session of its own) never shows it either",
        fresh.evaluate("() => window.__introSeen") is False and fresh.locator(INTRO).count() == 0,
    )
    check("...with no JavaScript errors", not fresh_errors, fresh_errors[:3])
    fresh.close()

    print("\n==== The fonts in the app ====")
    page.evaluate("() => document.fonts.ready")
    app = page.evaluate(
        """() => ({ check: document.fonts.check('16px "Baloo Bhai 2"'), body: getComputedStyle(document.body).fontFamily,
                    h1: document.querySelector('h1') ? getComputedStyle(document.querySelector('h1')).fontFamily : null,
                    brand: document.querySelector('.app-sidebar-brand .title') ? getComputedStyle(document.querySelector('.app-sidebar-brand .title')).fontFamily : null })"""
    )
    check("document.fonts.check('16px \"Baloo Bhai 2\"') is true in the app", app["check"], app)
    check("The body's text is in Plus Jakarta Sans", stack(app["body"]).startswith('"Plus Jakarta Sans"'), app["body"])
    check("The page title and the brand are in Baloo Bhai 2", stack(app["h1"]).startswith('"Baloo Bhai 2"') and stack(app["brand"]).startswith('"Baloo Bhai 2"'), app)

    print("\n==== The printed forms keep their face ====")
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(1000)
    dismiss(page)
    new = page.locator("[data-action='new-record']")
    check("The library offers a record to start", new.count() > 0)
    if new.count():
        doc_id = new.first.get_attribute("data-document")
        new.first.click()
        page.wait_for_selector("[data-print-doc]", timeout=30000)
        page.wait_for_timeout(800)
        dismiss(page)
        forms = page.evaluate(
            """() => [...document.querySelectorAll('[data-print-doc], [data-print-doc] table.log-sheet, [data-print-doc] .doc-header, [data-print-doc] h1, [data-print-doc] h2, [data-print-doc] h3, [data-print-doc] td')]
                       .slice(0, 40).map((el) => [el.tagName + '.' + (el.className || ''), getComputedStyle(el).fontFamily])"""
        )
        odd = [f for f in forms if stack(f[1]) != OLD_STACK]
        check(f"{doc_id}: the record's [data-print-doc] is in the old stack, exactly", bool(forms) and stack(forms[0][1]) == OLD_STACK, forms[:1])
        check("...and so is everything in it that is looked at (header, headings, the grid)", not odd, odd[:5])
        page.emulate_media(media="print")
        printed = page.evaluate(
            """() => ({ body: getComputedStyle(document.body).fontFamily, doc: getComputedStyle(document.querySelector('[data-print-doc]')).fontFamily })"""
        )
        page.emulate_media(media="screen")
        check("On paper the page is in the old stack too", stack(printed["body"]) == OLD_STACK and stack(printed["doc"]) == OLD_STACK, printed)
        check("...and no introduction on this page", page.locator(INTRO).count() == 0)
    page.goto(f"{BASE}/index.html#/chemical-master")
    page.wait_for_timeout(1100)
    dismiss(page)
    ref = font_of(page, "[data-print-doc]")
    check("A reference document (the Chemical Master) keeps the old stack", ref is not None and stack(ref) == OLD_STACK, ref)

    print("\n==== Gujarati, fetched when it is on the screen ====")
    page.goto(f"{BASE}/index.html#/dashboard")
    page.wait_for_timeout(900)
    dismiss(page)
    page.select_option(".lang-select", "gu")
    try:
        page.wait_for_function("() => /[\\u0A80-\\u0AFF]/.test(document.querySelector('h1') ? document.querySelector('h1').textContent : '')", timeout=15000)
        shown = True
    except Exception:
        shown = False
    page.evaluate("() => document.fonts.ready")
    page.wait_for_timeout(300)
    gu = page.evaluate(
        """() => ({ title: document.querySelector('h1') ? document.querySelector('h1').textContent : '',
                    display: document.fonts.check('600 24px "Baloo Bhai 2"', 'ગુજરાતી'), text: document.fonts.check('14px "Noto Sans Gujarati"', 'ગુજરાતી') })"""
    )
    gu_files = [(u, s) for u, s in font_responses if "gujarati" in u]
    check("With Gujarati chosen the title is in Gujarati", shown and GUJARATI.search(gu["title"]) is not None, gu["title"])
    check("...and the Gujarati faces are fetched and ready, each with 200", gu["display"] and gu["text"] and len(gu_files) >= 2 and all(s == 200 for _, s in gu_files), (gu, gu_files))
    page.select_option(".lang-select", "en")
    page.wait_for_timeout(600)

    check("Every font file answered 200 (or 304 when the browser asked again)", all(s in (200, 304) for _, s in font_responses) and not font_failures, (font_responses, font_failures))
    check("No console errors about fonts", not [e for e in console_errors if "font" in e.lower() or "/fonts/" in e], console_errors[:5])
    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

total = sum(1 for _ in font_responses)
if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print(f"\nThe system's name in 3D once a session, never in the way; the app in its new faces ({total} font files served by the site), the forms in theirs.")
