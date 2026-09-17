"""Proves the assistant waits for the WHOLE spoken sentence.

Headless Chromium has no real speech recognition, so a fake SpeechRecognition
is installed before the app boots and driven by hand: speak a fragment, pause
(shorter than the silence window), speak the rest, then go quiet. The
assistant must send exactly once, with the complete sentence — never at the
mid-sentence pause.
"""
import sys
import time
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright
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

BASE = "http://localhost:8842"
FAILURES = []

INIT = """
window.__voice = { started: 0, aborted: 0, instance: null };
class FakeRecognition {
  constructor() {
    window.__voice.instance = this;
    this.continuous = false; this.interimResults = false; this.lang = ''; this.maxAlternatives = 1;
    this.onresult = null; this.onerror = null; this.onend = null;
  }
  start() { window.__voice.started++; }
  stop() { if (this.onend) this.onend(); }
  abort() { window.__voice.aborted++; }
}
window.SpeechRecognition = FakeRecognition;
// segments: [{text, final}]
window.__emit = function (segments) {
  const inst = window.__voice.instance;
  if (!inst || !inst.onresult) return false;
  const results = segments.map((s) => ({ isFinal: !!s.final, length: 1, 0: { transcript: s.text } }));
  inst.onresult({ results });
  return true;
};
"""


def check(label, cond):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.add_init_script(INIT)
    page.on("pageerror", lambda e: print("PAGEERROR", e))

    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    page.click("text=Sign up")
    page.fill("#signup-name", "Voice QA")
    page.fill("#signup-email", f"voice-{int(time.time()*1000)}@example.com")
    page.fill("#signup-password", "PlaywrightQA123")
    page.fill("#signup-confirm", "PlaywrightQA123")
    page.click("button:has-text('Create Account')")
    # A browser's first open always gets the briefing (engine/briefingSchedule.ts),
    # but only once the account exists and the app has drawn - on a busy machine
    # later than any fixed pause, and a briefing left up swallows every click
    # (moving to the Assistant page is a hash change, which doesn't close it).
    page.wait_for_selector(".app-sidebar", timeout=30000)
    try:
        page.wait_for_selector("button:has-text('Got it')", timeout=10000)
    except PlaywrightTimeoutError:
        pass
    got_it = page.locator("button:has-text('Got it')")
    if got_it.count():
        got_it.first.click()
        page.wait_for_timeout(200)
    settle_briefing(page)

    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_timeout(500)

    user_msgs = page.locator(".assistant-page .chat-msg.user")
    check("No messages before speaking", user_msgs.count() == 0)

    page.click("button[data-action='voice']")
    page.wait_for_timeout(300)
    check("Recognition started in continuous mode with interim results",
          page.evaluate("window.__voice.instance.continuous === true && window.__voice.instance.interimResults === true"))
    check("Listening state is shown", page.locator(".assistant-voice-note.listening").count() == 1)

    # --- speak the first half, then pause mid-sentence ---
    page.evaluate("window.__emit([{text: 'is 2026-09-10', final: true}])")
    page.wait_for_timeout(1200)  # a real mid-thought pause, under the 2.5s window
    check("Nothing is sent during a mid-sentence pause", user_msgs.count() == 0)
    check("The sentence so far is shown in the composer", "is 2026-09-10" in page.locator("textarea.assistant-input").input_value())
    check("Still listening after the pause", page.locator(".assistant-voice-note.listening").count() == 1)

    # --- finish the sentence, then go quiet ---
    page.evaluate("window.__emit([{text: 'is 2026-09-10', final: true}, {text: ' a holiday?', final: true}])")
    page.wait_for_timeout(1200)
    check("Still nothing sent immediately after the last word", user_msgs.count() == 0)

    page.wait_for_timeout(2200)  # silence window elapses
    check("Sent exactly once after the speaker finished", user_msgs.count() == 1)
    if user_msgs.count() >= 1:
        said = user_msgs.last.inner_text()
        print(f"    (sent: {said!r})")
        check("Sent the COMPLETE sentence, both halves", "is 2026-09-10" in said and "a holiday" in said)
    check("Listening stopped once it was sent", page.locator(".assistant-voice-note.listening").count() == 0)
    check("Composer was cleared", page.locator("textarea.assistant-input").input_value() == "")
    reply = page.locator(".assistant-page .chat-msg.bot").last.inner_text().lower()
    check("The assistant answered the spoken question", "weekly off" in reply)

    # --- pressing the button while listening finishes early, keeping the text ---
    page.click("button[data-action='voice']")
    page.wait_for_timeout(300)
    page.evaluate("window.__emit([{text: 'what is due today', final: true}])")
    page.wait_for_timeout(400)  # well inside the silence window
    before = user_msgs.count()
    page.click("button[data-action='voice']")  # "Done"
    page.wait_for_timeout(800)
    check("Pressing Done sends what was said instead of discarding it", user_msgs.count() == before + 1)

    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for failure in FAILURES:
        print(" -", failure)
    sys.exit(1)
print("\nAll voice-timing checks passed.")
