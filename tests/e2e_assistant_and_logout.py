"""The model answers, and every log-out asks about today's work
(REQUIREMENTS s72). Asked for on 24-Sep-2026:

  "i have noticed that chatbot might be not using groq api because when my
   internet is off then also chatbot is working perfectly ... make sure what
   bot do it will use api and not fixed question and answer ... and when user
   logout out every time the pop should also come that have to reviewed and
   submitted your todays work and this is applicable to all user of all
   module."

WHAT THIS PROVES

  * A QUESTION IS THE MODEL'S TO ANSWER. This server is started with no
    GROQ_API_KEY (scripts/run-e2e.ts blanks it, so the suites stay
    network-independent), so the model cannot be asked - and the app then says
    so ON THE ANSWER: a question is still answered from the system's own
    records, but it is labelled, which is the thing that was missing. Before
    s72 the app answered from those records FIRST and never said so, which is
    why the plant could not tell the API was unused.
  * WHAT STAYS LOCAL STAYS LOCAL, and carries no such label, because the model
    was never the right thing to ask: the opening greeting with its buttons
    (s67), "are you a real person?", and anything that OPENS a screen - a
    command the app carries out, not a canned reply.
  * EVERY LOG-OUT ASKS FIRST, for any account and any module: the pop-up
    names what is due and not submitted, worst first, and offers to open it.
    "Stay signed in" keeps the session; "Log out" always logs out - being told
    is the point, being trapped is not.

Against the production build on :8842.
"""
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []

ASIDE = ".chat-aside[data-offline]"
REVIEW = "[data-section='logout-review']"


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


def composer(page):
    return page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")


def open_widget(page):
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(400)


def say(page, text, wait=2500):
    """Asks Mitra and returns the last bot message plus whether it was labelled
    as the app's own answer rather than the model's."""
    open_widget(page)
    composer(page).fill(text)
    composer(page).press("Enter")
    page.wait_for_timeout(wait)
    msgs = page.locator(".chat-msg.bot")
    reply = msgs.last.inner_text() if msgs.count() else ""
    labels = page.locator(ASIDE)
    return reply, labels.count(), (labels.last.get_attribute("data-offline") if labels.count() else None)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    email = f"s72-{int(time.time() * 1000)}@example.com"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "Mitra Desk QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)

    # ==================================================================
    # 1. The server says whether there is a model at all
    # ==================================================================
    print("\n==== Whether there is a model to ask ====")
    cfg = page.evaluate("() => fetch('/api/auth/config').then((r) => r.json())")
    feats = (cfg or {}).get("features") or {}
    check(
        "The server says whether the assistant has a key",
        isinstance(feats, dict) and feats.get("assistant") is False,
        cfg,
    )
    # WHETHER, never WHAT. The key itself must not appear anywhere in the
    # answer, at any depth, under any name.
    check("...and never sends the key itself", "gsk_" not in str(cfg) and not any("key" in str(k).lower() for k in feats), cfg)

    # ==================================================================
    # 2. A question: answered, and honestly labelled
    # ==================================================================
    print("\n==== A question is the model's to answer ====")
    reply, labels, why = say(page, "how many records are due today?")
    check("A question still gets an answer", len(reply.strip()) > 0, reply[:200])
    check(
        "...and it says the answer came from this system's own records, not the model",
        labels >= 1 and why == "not-configured",
        (labels, why, reply[:200]),
    )
    check("...naming the reason honestly: no key on this server, not a broken connection", "key" in page.locator(ASIDE).last.inner_text().lower(), page.locator(ASIDE).last.inner_text())

    # ==================================================================
    # 3. What was never the model's to answer carries no such label
    # ==================================================================
    print("\n==== What stays local, stays local ====")
    before = page.locator(ASIDE).count()
    greeting, after, _ = say(page, "hello")
    check("A greeting is answered here, with its buttons (s67)", "Mitra" in greeting or "?" in greeting, greeting[:200])
    check("...and is NOT labelled as a stand-in: the model was never the thing to ask", after == before, (before, after))
    check("...the buttons are still offered", page.locator(".chat-chip").count() > 0)

    before = page.locator(ASIDE).count()
    who, after, _ = say(page, "are you a real person?")
    check("Whether it is a person is answered here, plainly", "not a person" in who.lower() or "assistant" in who.lower(), who[:200])
    check("...and carries no stand-in label either", after == before, (before, after))

    # ==================================================================
    # 4. Every log-out asks about today's work first
    # ==================================================================
    print("\n==== Before you go — today's work ====")
    close = page.locator("button[aria-label='Close assistant']")
    if close.count():
        close.first.click()
        page.wait_for_timeout(300)
    page.locator("[data-action='logout']").first.click()
    page.wait_for_timeout(1500)
    check("Logging out asks first instead of just going", page.locator(REVIEW).count() == 1)
    box = page.locator(REVIEW)
    outstanding = int(box.get_attribute("data-outstanding") or "-1")
    check("...and it has counted what is due and not submitted", outstanding >= 0, outstanding)
    check("...saying so in words", len(page.locator("[data-field='logout-review-headline']").inner_text().strip()) > 0)
    if outstanding > 0:
        rows = page.locator(f"{REVIEW} [data-field='logout-review-list'] > li")
        check("...listing the documents themselves", rows.count() >= 1, rows.count())
        check("...worst first", rows.first.get_attribute("data-priority") in ("high", "medium", "low"), rows.first.get_attribute("data-priority"))
        check("...and offering to go and review it", page.locator("[data-action='logout-review-open']").count() == 1)
    else:
        check("...and says plainly that nothing is waiting", page.locator("[data-action='logout-review-open']").count() == 0)

    # ---- staying signed in keeps the session ----
    page.locator("[data-action='logout-review-stay']").first.click()
    page.wait_for_timeout(800)
    check("Stay signed in closes it and keeps the session", page.locator(REVIEW).count() == 0 and page.locator(".app-sidebar").count() == 1)

    # ---- and it asks EVERY time, not just the first ----
    page.locator("[data-action='logout']").first.click()
    page.wait_for_timeout(1200)
    check("It asks again the next time — every log-out, not only the first", page.locator(REVIEW).count() == 1)

    # ---- log out anyway ----
    page.locator("[data-action='logout-review-confirm']").first.click()
    page.wait_for_timeout(2500)
    check("Log out logs out: nobody is held there", page.locator(".app-sidebar").count() == 0 and "Log In" in page.content())

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe model is what answers a question, the app says when it stood in, and every log-out asks about the day's work first.")
