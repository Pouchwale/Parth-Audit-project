"""
Exercises the assistant "buddy" chat endpoint (/api/assistant/chat, backed by
Groq — see backend/groq.ts / backend/assistant.ts) through the actual UI:
natural-language navigation ("show me August's reports", "open CAPA"),
natural-language field filling on an already-open record, and a plain
conversational reply. Makes real network calls to Groq, so this is NOT wired
into `npm run test:e2e` (network/quota-dependent, like visual_qa.py) — run it
manually against a server you start yourself:

    npm run build
    API_PORT=8844 npm run server &     # Windows PowerShell: $env:API_PORT=8844; npm run server
    python tests/e2e_assistant_chat.py
"""
import sys
import time
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
def settle_briefing(page):
    """Mark today's briefing slots as already shown, so it cannot re-open part
    way through the run and intercept a click. The briefing shows itself once in
    the first hour of the working day and once in the last
    (engine/briefingSchedule.ts); a suite that crosses one of those boundaries
    while running would otherwise fail on whatever it was clicking at the time.
    Reopening it deliberately from the top bar still works, which is how the
    suites that test the briefing itself get at it."""
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

BASE = "http://localhost:8844"
FAILURES = []

# The company's working calendar (Thursday weekly off, festival holidays,
# adjustment days — Master Data → Holidays, REQUIREMENTS.md §16): the fill
# test needs a day with a real, non-holiday Daily Monitoring record.
ADJUSTMENT_DAYS_2026 = {"2026-01-22", "2026-08-06", "2026-10-22", "2026-11-05", "2026-11-20"}
FESTIVAL_HOLIDAYS_2026 = {
    "2026-01-14", "2026-01-26", "2026-03-04", "2026-08-15", "2026-08-28", "2026-09-04", "2026-10-19", "2026-10-20",
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
}


def next_working_day(d):
    while d.isoformat() in FESTIVAL_HOLIDAYS_2026 or (d.weekday() == 3 and d.isoformat() not in ADJUSTMENT_DAYS_2026):
        d += timedelta(days=1)
    return d


WORK_DAY = next_working_day(date.today()).isoformat()
TEST_EMAIL = f"e2e-buddy-{int(time.time() * 1000)}@example.com"
TEST_PASSWORD = "PlaywrightQA123"


def check(label, condition):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}")
    if not condition:
        FAILURES.append(label)


def open_widget(page):
    # The floating "Ask the assistant" button only exists while the panel is
    # CLOSED (it's replaced by the panel itself once open) — a previous ask()
    # on this page may have left it open, so only click if it's actually
    # showing, rather than assuming a fresh collapsed state every time.
    toggle = page.locator("button:has-text('Ask the assistant')")
    if toggle.count() > 0:
        toggle.click()
        page.wait_for_timeout(200)


# This account's Groq tier allows 8000 tokens per minute and each call carries
# the route guide, the scope rule and the live-facts context (~2.5k tokens), so
# the suite paces its model-bound messages rather than firing them back to back
# — otherwise later calls 429 (backend/groq.ts retries, but the whole minute's
# budget can already be gone). See TESTING.md.
PACE_SECONDS = 22
_last_model_call = [0.0]


def pace(page):
    wait = PACE_SECONDS - (time.time() - _last_model_call[0])
    if _last_model_call[0] and wait > 0:
        page.wait_for_timeout(int(wait * 1000))
    _last_model_call[0] = time.time()


def wait_for_reply(page, locator, before, timeout_ms=45000):
    """Wait for a new bot bubble carrying actual text. A fixed sleep is not
    enough: a real Groq round trip plus a rate-limit retry can take tens of
    seconds. The typing indicator is also a .chat-msg.bot but has no text, so
    requiring non-empty text skips it."""
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        if locator.count() > before and locator.last.inner_text().strip():
            return True
        page.wait_for_timeout(250)
    return False


def ask(page, text):
    open_widget(page)
    pace(page)
    before = bot_messages(page).count()
    box = page.locator("textarea.input")
    box.fill(text)
    page.click("button[aria-label='Send']")
    wait_for_reply(page, bot_messages(page), before)


def bot_messages(page):
    return page.locator(".chat-msg.bot")


def ascii_safe(text):
    """The Windows console is cp1252; a model reply can carry an emoji or a
    character it cannot encode, which would crash print() mid-run."""
    return text.encode("ascii", "replace").decode("ascii")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(f"{BASE}/index.html")
        page.wait_for_timeout(300)
        page.click("text=Sign up")
        page.fill("#signup-name", "Buddy QA")
        page.fill("#signup-email", TEST_EMAIL)
        page.fill("#signup-password", TEST_PASSWORD)
        page.fill("#signup-confirm", TEST_PASSWORD)
        page.click("button:has-text('Create Account')")
        page.wait_for_timeout(600)
        got_it = page.locator("button:has-text('Got it')")
        if got_it.count():
            got_it.first.click()
            page.wait_for_timeout(200)
        settle_briefing(page)

        # ---- 1. Navigation: "reports for August" ----
        before = bot_messages(page).count()
        ask(page, "show me all reports of august")
        check("Navigated to Reports for August via free text", "#/reports/2026/7" in page.url)
        check("Assistant showed a confirmation reply", bot_messages(page).count() > before)

        # ---- 2. Navigation: "open CAPA" ----
        ask(page, "open CAPA")
        check("Navigated to CAPA via free text", "#/gap" in page.url)

        # ---- 3. Plain conversational reply (no navigation, no fill) ----
        # A phrase the client-side answer layer (engine/assistantLocal.ts)
        # does NOT catch — "what can you do" is answered locally now — so this
        # still round-trips through Groq.
        url_before = page.url
        before = bot_messages(page).count()
        ask(page, "hi there, how is your day going?")
        check("A conversational message did not navigate anywhere", page.url == url_before)
        check("Assistant gave a reply message", bot_messages(page).count() > before)

        # ---- 3b. Out of scope: the model declines instead of answering ----
        # Deliberately phrased so the client-side scope guard does NOT catch it
        # (engine/assistantLocal.ts keeps its pattern list tiny), so this
        # exercises the SCOPE block in backend/assistant.ts. If the model had
        # answered the question, the reply would carry its giveaway words.
        url_before = page.url
        ask(page, "explain how photosynthesis works")
        reply = bot_messages(page).last.inner_text().lower()
        print(f"    (out-of-scope reply: {ascii_safe(reply[:160])!r})")
        check("Model declines an out-of-scope question instead of answering it", not any(w in reply for w in ["chlorophyll", "sunlight", "carbon dioxide", "glucose"]))
        check("Declining an out-of-scope question says what it does cover", any(w in reply for w in ["record", "system", "document", "pest"]))
        check("Declining an out-of-scope question does not navigate", page.url == url_before)

        # ---- 4. Natural-language fill on an already-open record ----
        # Close the panel first: it sits bottom-right, over the Day View's
        # "Open" buttons, same as a real user would tuck it away to click.
        page.click("button[aria-label='Close assistant']")
        page.wait_for_timeout(150)
        page.goto(f"{BASE}/index.html#/day/{WORK_DAY}")
        page.wait_for_timeout(300)
        rows = page.locator(".doc-table tbody tr")
        opened = False
        for i in range(rows.count()):
            if "Daily Pest Control Monitoring" in rows.nth(i).inner_text():
                rows.nth(i).locator("button", has_text="Open").click()
                opened = True
                break
        check("Opened a Daily Pest Monitoring record for the fill test", opened)
        if opened:
            ask(page, "checker is Buddy QA Tester")
            # A plain "<field> is <value>" is now understood without the model
            # and confirmed as "Done — saved. I changed: ..."; a fill the model
            # made still says "I've filled in". Either one means it applied.
            applied = bot_messages(page).filter(has_text="I changed").count() + bot_messages(page).filter(has_text="I've filled in").count()
            check("Fill instruction applied a field", applied > 0)
            checker_input = page.locator("input[placeholder='Name of checker']")
            check("Checker field actually updated", checker_input.count() > 0 and checker_input.input_value() == "Buddy QA Tester")

        # ---- 4b. One activity at a time: the assistant cannot jump ahead ----
        # External CAPA is answered in order (REQUIREMENTS §37): the checklist
        # waits on the first blank activity and nothing after it can be
        # answered — on the form (checked network-independently in
        # e2e_capa_formats.py) or by the assistant, which is what this checks:
        # whatever the model proposes, engine/recordPatch.ts puts back anything
        # that leapfrogs, so a brand-new checklist still has nothing answered.
        # The panel is still open from the fill test and sits over the list's
        # "New Complaint" button, so close it first — and press the button
        # directly, since the top bar is sticky over a scrolled row.
        close = page.locator("button[aria-label='Close assistant']")
        if close.count():
            close.first.click()
            page.wait_for_timeout(150)
        page.goto(f"{BASE}/index.html#/gap/external")
        page.wait_for_timeout(500)
        page.locator("button:has-text('New Complaint')").first.evaluate("el => el.click()")
        page.wait_for_timeout(1400)
        complaint_id = page.url.split("/complaint/")[-1]
        stop = page.locator(".chat-chip", has_text="Stop the walk-through")
        if stop.count():
            stop.last.click()
            page.wait_for_timeout(300)
        ask(page, "mark activity 31, complaint closure approved by QA Head, as done today")
        print(f"    (leapfrog reply: {ascii_safe(bot_messages(page).last.inner_text()[:200])!r})")
        answered = page.evaluate(
            """(id) => {
                 const r = JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').find((x) => x.id === id);
                 if (!r) return -1;
                 return r.data.sections.flatMap((s) => s.items).filter((it) => it.done || it.notRequired || it.comment.trim()).length;
               }""",
            complaint_id,
        )
        check("The assistant cannot answer a later activity while an earlier one is blank", answered == 0)

        # ---- 5. Full-page Assistant: the model answers from the live app context ----
        # No date/weekday in the question, so it is NOT answered locally
        # (engine/assistantLocal.ts) — it goes to Groq with the context digest
        # attached, which states the weekly off is Thursday.
        page.goto(f"{BASE}/index.html#/assistant")
        page.wait_for_timeout(400)
        page_bubbles = page.locator(".assistant-page .chat-msg.bot")
        pace(page)
        before = page_bubbles.count()
        page.fill("textarea.assistant-input", "which day of the week is our weekly off? answer in one line")
        page.click("button[data-action='send']")
        wait_for_reply(page, page_bubbles, before)
        page_reply = page_bubbles.last.inner_text()
        print(f"    (assistant page replied: {ascii_safe(page_reply[:160])!r}; url now {page.url})")
        check("Assistant page answers from the live app context (weekly off = Thursday)", "thursday" in page_reply.lower())

        browser.close()
        print("\nJS errors:", errors[:10])
        if FAILURES:
            print(f"\n{len(FAILURES)} FAILURE(S):")
            for f in FAILURES:
                print(" -", f)
            sys.exit(1)
        print("\nAll assistant-chat checks passed.")


if __name__ == "__main__":
    main()
