"""The opening in motion graphics, engaging fonts, and a site that is pleasant to
use (REQUIREMENTS s81, s84). 27-Sep-2026: "make starting of this system like
introduction of project name in 3d and also make use of good engaging fonts";
30-Sep-2026: "the starting animation: use motion graphics there too, and it
should take its time and only then open - make it really awesome for the user,
and make the whole site enjoyable to use".

  * the first time the sign-in screen opens in a browser session, a 4.8 s
    motion-graphics sequence plays over it, OPAQUE (the sign-in card is not seen
    through it): the company's mark, "DCRS", the system's name and the company's
    name "Gujarat Print Pack Publication" assembling in CSS 3D, the twelve
    modules' marks, light, particles and a progress line - and then the veil
    opens on the page. It takes its time (still there after 4 s) and it goes by
    itself (gone within 6 s, the hard stop);
  * it is a layer that catches nothing: the email and password boxes take typing
    and Log In can be pressed while it plays; the first click or key lifts it at
    once; a lost timer still ends at the 6 s hard stop, and its stylesheet has
    already left it transparent;
  * it plays once a session, at the system's opening: on the sign-in screen, or
    over the app when a signed-in browser session opens it; never right after
    signing in, never on a reload; somebody whose system asks for less motion
    gets a short plain fade, nothing moving;
  * at 6x CPU throttle (a low-end laptop) it still ends in time and no task of
    the page runs longer than 100 ms while it plays;
  * the sign-in title is a 3D wordmark in the display face, whose one entrance
    lasts no more than 0.6 s and moves nothing else;
  * across the app (delight.css): a page fades and rises in on a new address
    within 200 ms and is left exactly where it was; a button gives when pressed;
    a tile lifts under the pointer; the sidebar's active item glides in - none of
    it on paper or under reduced motion;
  * the app's text is in Plus Jakarta Sans and its titles in Baloo Bhai 2, the
    font files served by the site itself with 200 - Gujarati ones only once
    Gujarati is on the screen;
  * the printed forms keep the stack they always had, on screen and on paper.

Network-independent (Google Translate is blocked; the server has no model key).
Against the production build on :8842 (DCRS_BASE overrides it).
"""
import base64
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8842").rstrip("/")
PASSWORD = "PlaywrightQA123"
ACCOUNT = "intro-fonts-suite@example.com"
FAILURES = []
INTRO = "[data-section='intro-splash']"
# IntroSplash.tsx: the sequence, the hard stop, the plain fade under reduced motion.
INTRO_S = 4.8
HARD_STOP_S = 6.0
PLAIN_S = 0.9
# When the introduction was put on the page and taken off it, by the page's own clock.
WATCH_INTRO = """(() => {
  window.__introAt = null; window.__introGoneAt = null; window.__introPE = null; window.__introKind = null;
  new MutationObserver(() => {
    const el = document.querySelector("[data-section='intro-splash']");
    if (el && window.__introAt === null) { window.__introAt = performance.now(); window.__introPE = getComputedStyle(el).pointerEvents; window.__introKind = el.getAttribute('data-kind'); }
    if (!el && window.__introAt !== null && window.__introGoneAt === null) window.__introGoneAt = performance.now();
  }).observe(document, { childList: true, subtree: true });
})()"""
# The page's long tasks (over 50 ms), each with when it started and how long it ran.
WATCH_LONG_TASKS = """(() => {
  window.__longTasks = [];
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__longTasks.push([e.startTime, e.duration]); })
      .observe({ type: 'longtask', buffered: true });
  } catch (e) { window.__longTasks = null; }
})()"""
INTRO_TIMES = "() => ({ at: window.__introAt, gone: window.__introGoneAt, pe: window.__introPE, kind: window.__introKind })"
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


def pixels(page, points):
    """The colours on the screen itself at a few points (a screenshot read back in the page: no image library needed)."""
    shot = base64.b64encode(page.screenshot()).decode()
    return page.evaluate(
        """async ([b64, pts]) => {
             const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
             const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
             const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
             return pts.map(([x, y]) => Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)));
           }""",
        [shot, points],
    )


def card_margins(page):
    """Four points in the sign-in card's white margin, beside the form."""
    r = page.evaluate("() => { const r = document.querySelector('.auth-card').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }")
    return [(r["l"] + 9, r["t"] + 60), (r["r"] - 9, r["t"] + 60), (r["l"] + 9, r["b"] - 60), (r["r"] - 9, r["b"] - 60)]


def white(rgb):
    return min(rgb) >= 225


def wait_gone(page, limit_ms):
    """Waits for the introduction to leave the page (or the limit); True when it has."""
    try:
        page.wait_for_selector(INTRO, state="detached", timeout=limit_ms)
    except Exception:
        pass
    return page.locator(INTRO).count() == 0


def played_for(page):
    """How long the introduction was on the page, in seconds, by the page's own clock (None if it did not play or has not gone)."""
    t = page.evaluate(INTRO_TIMES)
    return None if t["at"] is None or t["gone"] is None else round((t["gone"] - t["at"]) / 1000, 2)


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
    kind: el.getAttribute('data-kind'),
    opacity: getComputedStyle(el).opacity,
    doors: [...el.querySelectorAll('.intro-door')].map((d) => getComputedStyle(d).opacity),
    veil: (() => { const d = [...el.querySelectorAll('.intro-door')].map((x) => x.getBoundingClientRect());
                   return d.length === 2 && d.every((b) => b.left <= 0 && b.right >= innerWidth) && d[0].top <= 0 && d[1].bottom >= innerHeight && d[0].bottom >= d[1].top; })(),
    marks: el.querySelectorAll('.intro-mod svg').length,
    letters: el.querySelectorAll('.intro-company .intro-ch').length,
    particles: el.querySelectorAll('.intro-p').length,
    progress: !!el.querySelector('.intro-progress-fill'),
    onlyTransformsAndOpacity: [...document.getAnimations()].filter((a) => a.effect && a.effect.target && el.contains(a.effect.target))
      .every((a) => a.effect.getKeyframes().every((k) => Object.keys(k).every((p) => ['offset', 'computedOffset', 'easing', 'composite', 'transform', 'opacity'].includes(p)))),
    moving: [...document.getAnimations()].filter((a) => a.effect && a.effect.target && a.effect.target !== el && el.contains(a.effect.target)).length,
    hardStop: getComputedStyle(el).animationName,
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
    page.add_init_script(WATCH_INTRO)
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    now = page.evaluate(INTRO_NOW)
    check("The first time the sign-in screen opens, the introduction plays over it", now["present"], now)
    if now["present"]:
        check("...the full motion-graphics sequence (not the plain fade)", now["kind"] == "motion", now["kind"])
        check("...a layer that catches nothing: pointer-events none, itself and everything in it", now["catching"] == [], now["catching"])
        check("...fixed over the page, clipped to it, hidden from screen readers and from print", now["position"] == "fixed" and now["overflow"] == "hidden" and now["ariaHidden"] == "true" and now["noPrint"], now)
        check("...the sign-in form is there under it from the first frame", now["formThere"])
        check("...a click on the email box lands in the box, and one on Log In on the button", now["emailHit"] and now["buttonHit"], now)
        check(
            "...opaque: fully opaque itself, its veil's two halves covering the whole window",
            now["opacity"] == "1" and now["doors"] == ["1", "1"] and now["veil"] is True,
            (now["opacity"], now["doors"], now["veil"]),
        )
        check("...CSS 3D: perspective, preserve-3d and turning pieces, one small canvas at most", now["perspective"] and now["preserve3d"] and now["turning"] >= 3 and now["canvas"] <= 1, now)
        check(
            "...the company's mark, DCRS, the system's name and the company's name",
            now["logo"] and "DCRS" in now["text"] and "Digital Controlled Record System" in now["text"] and "Gujarat Print Pack Publication" in now["text"],
            now["text"],
        )
        check(
            "...the company's name assembling letter by letter, the twelve modules' marks, particles and a progress line",
            now["letters"] == len("GujaratPrintPackPublication") and now["marks"] == 12 and now["particles"] >= 20 and now["progress"],
            {k: now[k] for k in ("letters", "marks", "particles", "progress")},
        )
        check("...every piece moving on transforms and opacity alone", now["moving"] >= 40 and now["onlyTransformsAndOpacity"], (now["moving"], now["onlyTransformsAndOpacity"]))
        check("...with no words the sign-in checks look for ('sign up', 'demo', 'log in')", not re.search(r"sign\s*up|demo|log\s*in", now["text"], re.I), now["text"])
        check("...and nothing wider than the window", now["right"] <= now["inner"] + 1 and now["scroll"] <= now["inner"], now)
    page.fill("#login-email", "somebody@example.com")
    page.fill("#login-password", "typed-while-it-plays")
    typed = page.input_value("#login-email") == "somebody@example.com" and page.input_value("#login-password") == "typed-while-it-plays"
    check("The email and password boxes take typing while it plays", typed)
    # (Nothing is pressed or clicked here until it has gone: emptying a box presses Delete, Playwright's click
    # sends a pointerdown even on a trial, and a key or a click lifts the veil. Pressing Log In while it plays
    # is checked on the phone, below.)
    # Opaque while it plays: two seconds in, the sign-in card's white margin is not seen through it.
    t = page.evaluate(INTRO_TIMES)
    page.wait_for_timeout(max(0, int(2000 - (page.evaluate("() => performance.now()") - (t["at"] or 0)))))
    margins = card_margins(page)
    during = pixels(page, margins) if page.locator(INTRO).count() else []
    check("Two seconds in, the sign-in card is hidden behind it (its white margin is dark on the screen)", len(during) == 4 and sum(1 for c in during if not white(c)) >= 3, during)
    page.wait_for_timeout(max(0, int(3800 - (page.evaluate("() => performance.now()") - (t["at"] or 0)))))
    check("It takes its time: still over the page nearly four seconds in", page.locator(INTRO).count() == 1)
    gone = wait_gone(page, 4000)
    lasted = played_for(page)
    check(f"...and then it opens and leaves the page by itself, before the {HARD_STOP_S:.0f} s hard stop", gone and lasted is not None and INTRO_S - 0.5 <= lasted <= HARD_STOP_S, lasted)
    print(f"     (on the page for {lasted} s)")
    check("...and it said so for this browser session", page.evaluate("() => sessionStorage.getItem('dcrs:intro-seen')") == "1")
    after = pixels(page, margins)
    check("The page is there right after: the card's white margin is seen", all(white(c) for c in after), after)
    page.fill("#login-email", "")
    page.fill("#login-password", "")
    page.fill("#login-email", "somebody@example.com")
    usable = page.input_value("#login-email") == "somebody@example.com"
    page.fill("#login-email", "")
    check("...and the form takes typing, the boxes empty again", usable and page.input_value("#login-password") == "")

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

    def fresh_session(options=None, init=None, throttle=None):
        """A browser session of its own (a new context), with the introduction watched from the first frame."""
        ctx = browser.new_context(**{"viewport": {"width": 1280, "height": 800}, **(options or {})})
        o = ctx.new_page()
        o_errors = []
        o.on("pageerror", lambda e: o_errors.append(str(e)))
        o.add_init_script(WATCH_INTRO)
        o.add_init_script(WATCH_LONG_TASKS)
        if init:
            o.add_init_script(init)
        if throttle:
            cdp = ctx.new_cdp_session(o)
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": throttle})
        o.goto(f"{BASE}/index.html")
        o.wait_for_selector("#login-email", timeout=60000)
        return ctx, o, o_errors

    print("\n==== Less motion: a short plain fade ====")
    other, o, o_errors = fresh_session({"reduced_motion": "reduce"})
    seen = o.evaluate(INTRO_NOW)
    check("A browser that asks for less motion gets the plain kind, opaque at first", seen["present"] and seen["kind"] == "plain" and seen["opacity"] == "1", seen if not seen["present"] else (seen["kind"], seen["opacity"]))
    if seen["present"]:
        check("...nothing in it moves (only the whole fades)", seen["moving"] == 0 and seen["hardStop"] == "intro-plain", (seen["moving"], seen["hardStop"]))
        check("...no particles, no progress line", seen["particles"] == 0 and not seen["progress"], seen)
    gone = wait_gone(o, 3000)
    lasted = played_for(o)
    check(f"...and it is gone within {PLAIN_S + 0.6:.1f} s", gone and lasted is not None and lasted <= PLAIN_S + 0.6, lasted)
    still = o.evaluate("() => getComputedStyle(document.querySelector('.auth-brand .title')).animationName")
    check("...and the sign-in title does not move either", still == "none", still)
    check("...with no JavaScript errors", not o_errors, o_errors[:3])
    other.close()

    print("\n==== On a phone ====")
    other, o, o_errors = fresh_session({"viewport": {"width": 390, "height": 844}})
    seen = o.evaluate(INTRO_NOW)
    check("On a phone (390 px) it plays within the screen and the email box is still the box", seen["present"] and seen["scroll"] <= 390 and seen["right"] <= 391 and seen["emailHit"], seen)
    rows = o.evaluate("() => new Set([...document.querySelectorAll('.intro-mod')].map((m) => m.offsetTop)).size")
    check("...the modules' marks in two rows", rows == 2, rows)
    try:
        o.locator("form button[type='submit']").first.click(trial=True, timeout=3000)
        clickable = True
    except Exception as e:  # noqa: BLE001 - reported as the check's detail
        clickable = str(e)
    check("...and Log In can be pressed while it plays (nothing covers it)", seen["present"] and o.evaluate(INTRO_TIMES)["gone"] is None and clickable is True, clickable)
    check("...with no JavaScript errors", not o_errors, o_errors[:3])
    other.close()

    print("\n==== A click or a key lifts it at once ====")
    for how in ("click", "key"):
        other, o, o_errors = fresh_session()
        o.wait_for_timeout(1000)
        pressed_at = o.evaluate("() => performance.now()")
        if how == "click":
            o.mouse.click(8, 8)
        else:
            o.keyboard.press("Shift")
        phase = o.evaluate("() => { const el = document.querySelector(\"[data-section='intro-splash']\"); return el ? el.getAttribute('data-phase') : null; }")
        gone = wait_gone(o, 1500)
        after_press = o.evaluate("(t) => window.__introGoneAt === null ? null : Math.round(window.__introGoneAt - t) / 1000", pressed_at)
        check(f"A {how} while it plays lifts the veil at once (fading out, gone within 0.8 s)", phase in ("leaving", None) and gone and after_press is not None and after_press <= 0.8, (phase, after_press, played_for(o)))
        check("...with no JavaScript errors", not o_errors, o_errors[:3])
        other.close()

    print("\n==== Never stuck: the 6 s hard stop ====")
    # Its own timer is lost (a setTimeout of exactly the sequence's length never fires): the stylesheet has
    # made it transparent by the end of the sequence, and the second timer takes it off the page at 6 s.
    lose_timer = """(() => { const orig = window.setTimeout; window.setTimeout = function (fn, ms, ...rest) { if (ms === %d) return 0; return orig.call(this, fn, ms, ...rest); }; })()""" % int(INTRO_S * 1000)
    other, o, o_errors = fresh_session(init=lose_timer)
    t = o.evaluate(INTRO_TIMES)
    o.wait_for_timeout(max(0, int(5300 - (o.evaluate("() => performance.now()") - (t["at"] or 0)))))
    late = o.evaluate("() => { const el = document.querySelector(\"[data-section='intro-splash']\"); return el ? getComputedStyle(el).opacity : null; }")
    check("With its timer lost, at 5.3 s it is still on the page but transparent (its stylesheet ended it)", late == "0", late)
    gone = wait_gone(o, 2500)
    lasted = played_for(o)
    check(f"...and the hard stop takes it off the page at {HARD_STOP_S:.0f} s", gone and lasted is not None and HARD_STOP_S - 0.1 <= lasted <= HARD_STOP_S + 0.6, lasted)
    check("...with no JavaScript errors", not o_errors, o_errors[:3])
    other.close()

    print("\n==== A low-end laptop: 6x CPU throttle ====")
    other, o, o_errors = fresh_session(throttle=6)
    gone = wait_gone(o, 9000)
    lasted = played_for(o)
    check(f"At 6x CPU throttle it still plays and ends in time (by the {HARD_STOP_S:.0f} s hard stop)", o.evaluate(INTRO_TIMES)["at"] is not None and gone and lasted is not None and lasted <= HARD_STOP_S + 0.3, lasted)
    tasks = o.evaluate("() => { const at = window.__introAt, gone = window.__introGoneAt; return (window.__longTasks || []).filter(([s]) => s >= at && s <= gone).map(([s, d]) => [Math.round(s - at), Math.round(d)]); }")
    worst = max([d for _, d in tasks], default=0)
    check("...and no task of the page runs longer than 100 ms while it plays", worst <= 100, tasks)
    print(f"     (on the page for {lasted} s; long tasks while it played, [ms after it appeared, ms]: {tasks})")
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

    # THE OPENING OF A SIGNED-IN SESSION (27-Sep-2026): a session lasts seven days, so most mornings the system
    # opens straight into the app. A new tab is a browser session of its own - the system's opening - and plays
    # the introduction over the app, catching nothing; a reload of that tab does not play it again.
    fresh = context.new_page()
    fresh.add_init_script(
        """(() => { window.__introSeen = false; window.__introPE = null;
                   new MutationObserver(() => { const el = document.querySelector("[data-section='intro-splash']");
                     if (el && !window.__introSeen) { window.__introSeen = true; window.__introPE = getComputedStyle(el).pointerEvents; } })
                   .observe(document, { childList: true, subtree: true }); })()"""
    )
    fresh_errors = []
    fresh.on("pageerror", lambda e: fresh_errors.append(str(e)))
    fresh.add_init_script(WATCH_INTRO)
    fresh.goto(f"{BASE}/index.html")
    fresh.wait_for_selector(".app-sidebar", timeout=60000)
    # The app is there under it and takes clicks while it plays (the suites act on it at once).
    try:
        fresh.locator(".app-sidebar a[href='#/library']").first.click(trial=True, timeout=3000)
        under = True
    except Exception as e:  # noqa: BLE001 - reported as the check's detail
        under = str(e)
    playing_then = fresh.locator(INTRO).count()
    gone = wait_gone(fresh, 7000)
    opened = fresh.evaluate("() => ({ seen: window.__introSeen, pe: window.__introPE })")
    lasted = played_for(fresh)
    check("A signed-in page opened in a new tab (the opening of a session) plays the introduction", opened["seen"] is True, opened)
    check("...catching nothing while it plays: the sidebar under it can be clicked", opened["pe"] == "none" and under is True, (opened, under, playing_then))
    check(f"...and it goes by itself, before the {HARD_STOP_S:.0f} s hard stop", gone and lasted is not None and lasted <= HARD_STOP_S, lasted)
    fresh.reload()
    fresh.wait_for_selector(".app-sidebar", timeout=60000)
    fresh.wait_for_timeout(1800)
    check(
        "Reloaded, the same tab does not play it again",
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

    print("\n==== Movement across the app (delight.css) ====")
    served = page.evaluate("async () => (await fetch('styles/delight.css')).status")
    linked = page.evaluate("() => [...document.styleSheets].some((s) => (s.href || '').endsWith('styles/delight.css'))")
    check("delight.css is linked and served by the site (200)", served == 200 and linked, (served, linked))
    # A page arriving: it fades and rises in, within 200 ms, and is left exactly where it was.
    page.evaluate(
        """() => { window.__arrivals = [];
                   document.addEventListener('animationstart', (e) => { if (e.animationName === 'dcrs-page-in') window.__arrivals.push(e.target.tagName); }, true); }"""
    )
    page.locator(".app-sidebar a[href='#/library']").first.click()
    shown_at_once = page.locator(".app-content h1").first.is_visible()
    page.wait_for_timeout(450)
    arrived = page.evaluate(
        """() => { const kids = [...document.querySelectorAll('.app-content > *')];
                   const s = getComputedStyle(kids[kids.length - 1]);
                   return { arrivals: window.__arrivals.length, name: s.animationName, duration: parseFloat(s.animationDuration), fill: s.animationFillMode,
                            settled: kids.every((k) => getComputedStyle(k).opacity === '1' && getComputedStyle(k).transform === 'none'),
                            running: document.getAnimations().filter((a) => a.animationName === 'dcrs-page-in' && a.playState === 'running').length }; }"""
    )
    check("A new address: the page fades and rises in, within 200 ms", arrived["arrivals"] >= 1 and arrived["name"] == "dcrs-page-in" and 0 < arrived["duration"] <= 0.2, arrived)
    check("...readable from its first frame, and left exactly where it was (no transform, full opacity)", shown_at_once and arrived["settled"] and arrived["running"] == 0 and arrived["fill"] == "backwards", (shown_at_once, arrived))
    rail = page.evaluate("() => { const a = document.querySelector('.app-sidebar a.active'); return a ? getComputedStyle(a, '::before').animationName : null; }")
    check("The sidebar's active item glides in (its rail)", rail == "dcrs-rail-in", rail)
    # A press: the button gives while held (the pointer is let go elsewhere, so nothing is clicked).
    btn = page.locator(".app-content .btn:not(:disabled)").first
    box = btn.bounding_box() if btn.count() else None
    pressed = None
    if box:
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.down()
        page.wait_for_timeout(160)
        pressed = btn.evaluate("(el) => getComputedStyle(el).transform")
        page.mouse.move(4, 700)
        page.mouse.up()
        page.wait_for_timeout(300)
    released = btn.evaluate("(el) => getComputedStyle(el).transform") if box else None
    check("A button gives a little while pressed, and springs back", bool(pressed) and pressed.startswith("matrix(0.96") and released == "none", (pressed, released))
    # A tile lifts under the pointer.
    page.locator(".app-sidebar a[href='#/dashboard']").first.click()
    page.wait_for_selector(".stat-tile", timeout=15000)
    dismiss(page)
    # (The Dashboard may still move as its cards fill in, taking the tile from under the pointer: pointed at again then.)
    lifts = []
    for _ in range(3):
        page.locator(".stat-tile").first.hover()
        page.wait_for_timeout(350)
        lifted = page.locator(".stat-tile").first.evaluate(
            """(el) => { const r = el.getBoundingClientRect(); const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                         return { transform: getComputedStyle(el).transform, hovered: el.matches(':hover'), at: at ? at.tagName + '.' + at.className : null, top: Math.round(r.top) }; }"""
        )
        lifts.append(lifted)
        if lifted["hovered"]:
            break
    check("A tile lifts a little under the pointer", lifts[-1]["hovered"] and lifts[-1]["transform"] == "matrix(1, 0, 0, 1, 0, -2)", lifts)
    page.mouse.move(4, 700)
    # None of it for somebody who asks for less motion, and none of it on paper.
    page.emulate_media(reduced_motion="reduce")
    page.locator(".stat-tile").first.hover()
    page.wait_for_timeout(250)
    reduced = page.evaluate(
        """() => ({ page: getComputedStyle(document.querySelector('.app-content > :last-child')).animationName,
                    press: getComputedStyle(document.querySelector('.btn')).transitionDuration,
                    tile: getComputedStyle(document.querySelector('.stat-tile')).transform })"""
    )
    page.mouse.move(4, 700)
    page.emulate_media(reduced_motion="no-preference", media="print")
    printed = page.evaluate("() => getComputedStyle(document.querySelector('.app-content > :last-child')).animationName")
    page.emulate_media(media="screen")
    check("Less motion: no page arriving, no press, no lift", reduced == {"page": "none", "press": "0s", "tile": "none"}, reduced)
    check("...and on paper nothing of it", printed == "none", printed)

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
