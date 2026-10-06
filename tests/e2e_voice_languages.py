"""Mitra speaks and answers in English, Hindi and Gujarati, free (REQUIREMENTS s89), asked for on 2-3 Oct 2026:

  "make the voice accent more like a human, like a real person. If the user asks
  in Gujarati or Hindi then the bot should reply in that language: Gujarati
  asked, Gujarati answered; the same for Hindi and English."  And: "I will not
  use a single rupee for any voice."

So this suite checks, in a real browser, against the production build:

  * Master Data's voice card lists the voice for English, Hindi and Gujarati in
    this browser - with Microsoft Edge's voice list stood in: the natural
    Neerja, Swara (in Devanagari) and Dhwani (in Gujarati script) - and each
    "Hear Mitra" says one short sentence in its own language and voice; the
    Hindi sentence's verbs follow the female or male choice (Madhur for male);
  * with Google Chrome's list stood in (no Gujarati voice at all): the card
    says so and offers no Gujarati sample, Hindi is Google's;
  * on Ask Mitra, with no model on this server (the rules path, s72): a
    question in Hindi gets the app's answer with one short Hindi line in front,
    read aloud by the Hindi voice and then the Indian English one; a question in
    Gujarati gets a Gujarati answer, read by the Gujarati voice; in Chrome a
    Gujarati answer is shown and not said, and the hint "Mitra speaks Gujarati in
    Microsoft Edge" is given once a session;
  * the microphone, with the browser itself listening, names its one language;
  * no JavaScript errors.

Speech is never really heard: speechSynthesis is stood in for before the app
loads, with the voice list of the browser chosen (localStorage 'e2e:voices'),
recording what would be said and in which voice. Network-independent, against
the production build on :8842 (DCRS_BASE overrides it).
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8842").rstrip("/")
PASSWORD = "PlaywrightQA123"
# No word of the name is a button's label.
ACCOUNT = "Hemangi Desai"
FAILURES = []

HINDI_NOTE = "हिंदी में पूरा जवाब देने के लिए AI सेवा चाहिए, जो अभी उपलब्ध नहीं है।"
NEERJA = "Microsoft Neerja Online (Natural) - English (India)"
SWARA = "Microsoft स्वरा Online (Natural) - Hindi (India)"
MADHUR = "Microsoft मधुर Online (Natural) - Hindi (India)"
DHWANI = "Microsoft ધ્વની Online (Natural) - Gujarati (India)"

# The browser's voices, as Edge and Chrome on Windows list them, chosen by localStorage before the app loads. The
# utterance is a plain object, so the voice the app chose is recorded as given (a real one refuses a made-up voice).
VOICES = r"""
(() => {
  const V = (name, lang, local) => ({ name, lang, localService: local, default: false, voiceURI: name });
  const EDGE = [
    V('Microsoft Heera - English (India)', 'en-IN', true),
    V('Microsoft Ravi - English (India)', 'en-IN', true),
    V('Microsoft Neerja Online (Natural) - English (India)', 'en-IN', false),
    V('Microsoft Prabhat Online (Natural) - English (India)', 'en-IN', false),
    V('Microsoft स्वरा Online (Natural) - Hindi (India)', 'hi-IN', false),
    V('Microsoft मधुर Online (Natural) - Hindi (India)', 'hi-IN', false),
    V('Microsoft ધ્વની Online (Natural) - Gujarati (India)', 'gu-IN', false),
    V('Microsoft નિરંજન Online (Natural) - Gujarati (India)', 'gu-IN', false),
  ];
  const CHROME = [
    V('Microsoft David - English (United States)', 'en-US', true),
    V('Microsoft Heera - English (India)', 'en-IN', true),
    V('Microsoft Ravi - English (India)', 'en-IN', true),
    V('Google US English', 'en-US', false),
    V('Google UK English Female', 'en-GB', false),
    V('Google UK English Male', 'en-GB', false),
    V('Google हिन्दी', 'hi-IN', false),
  ];
  let which = 'edge';
  try { which = localStorage.getItem('e2e:voices') || 'edge'; } catch (err) {}
  const list = which === 'chrome' ? CHROME : EDGE;
  window.__utter = [];
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; this.lang = ''; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; this.onend = null; this.onerror = null; this.onstart = null; this.onboundary = null; }
  };
  try {
    const synth = window.speechSynthesis;
    synth.getVoices = () => list;
    synth.speak = function (u) {
      window.__utter.push({ text: u.text, lang: u.lang, voice: u.voice ? u.voice.name : '', rate: u.rate, at: Date.now() });
      setTimeout(() => { try { if (u.onstart) u.onstart(new Event('start')); } catch (err) {} }, 10);
      setTimeout(() => { try { if (u.onend) u.onend(new Event('end')); } catch (err) {} }, 60);
    };
    synth.cancel = function () {};
  } catch (err) {}
})();
"""


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
        got_it = page.locator("button:has-text('Got it')")
        if got_it.count():
            got_it.first.click()
            page.wait_for_timeout(200)
    settle_briefing(page)


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def wait_for(page, predicate_js, timeout_ms=6000, arg=None):
    try:
        page.wait_for_function(predicate_js, arg=arg, timeout=timeout_ms)
        return True
    except Exception:
        return False


def utter(page):
    return page.evaluate("() => window.__utter.slice()")


def clear_utter(page):
    page.evaluate("() => { window.__utter.length = 0; }")


def open_voice_card(page):
    page.goto(f"{BASE}/index.html#/master-data")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(800)
    dismiss(page)
    close_assistant(page)
    page.locator(".pill-tab", has_text="Working Hours & Briefing").first.click()
    page.wait_for_selector("[data-section='voice-languages'] [data-field='voice-in-use']", timeout=8000)
    return page.locator("[data-section='voice-settings']")


def open_ask_mitra(page):
    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_selector("textarea.assistant-input", timeout=30000)
    page.wait_for_timeout(500)
    dismiss(page)
    toggle = page.locator("button[data-action='speak-replies']")
    if toggle.count() and toggle.first.get_attribute("aria-pressed") != "true":
        toggle.first.click()
        page.wait_for_timeout(200)


def ask(page, words):
    """Sends a message on Ask Mitra and returns the newest answer's text once it is there."""
    answers = page.locator(".assistant-page .chat-msg.bot")
    before = answers.count()
    page.fill("textarea.assistant-input", words)
    page.click("button[data-action='send']")
    try:
        page.wait_for_function("(n) => document.querySelectorAll('.assistant-page .chat-msg.bot').length > n", arg=before, timeout=15000)
    except Exception:
        pass
    # The typing bubble goes before the answer is read (as e2e_assistant_and_logout.py waits).
    try:
        page.wait_for_function("() => !document.querySelector('.chat-typing')", timeout=20000)
    except Exception:
        pass
    page.wait_for_timeout(1200)
    return answers.last.inner_text() if answers.count() else ""


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1400, "height": 950})
    context.add_init_script(VOICES)
    page = context.new_page()
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.fill("#signup-name", ACCOUNT)
    page.fill("#signup-email", f"voice-lang-{int(time.time() * 1000)}@example.com")
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)

    # ==================================================================
    # 1. The voice card, with Edge's voices
    # ==================================================================
    print("\n==== The voice card in Microsoft Edge: a natural voice for each language ====")
    card = open_voice_card(page)
    en_row = card.locator("[data-field='voice-in-use']")
    hi_row = card.locator("[data-field='voice-hindi']")
    gu_row = card.locator("[data-field='voice-gujarati']")
    check(
        "English: Neerja, a natural voice",
        en_row.count() == 1 and en_row.get_attribute("data-source") == "natural" and "Neerja" in en_row.inner_text(),
        en_row.inner_text() if en_row.count() else "no row",
    )
    check("Hindi: Swara, a natural voice", hi_row.count() == 1 and hi_row.get_attribute("data-source") == "natural" and "स्वरा" in hi_row.inner_text(), hi_row.inner_text() if hi_row.count() else "no row")
    check("Gujarati: Dhwani, a natural voice", gu_row.count() == 1 and gu_row.get_attribute("data-source") == "natural" and "ધ્વની" in gu_row.inner_text(), gu_row.inner_text() if gu_row.count() else "no row")
    check(
        "Each language has its own Hear Mitra; the suites' English hook is still one",
        card.locator("[data-action='test-voice']").count() == 1 and card.locator("[data-action='test-voice-hi']").count() == 1 and card.locator("[data-action='test-voice-gu']").count() == 1,
    )
    check("The card names the one Mitra's six voices", "Neerja, Swara and Dhwani" in card.inner_text() and "Prabhat, Madhur and Niranjan" in card.inner_text())

    page.locator("[data-clock]").first.click()
    clear_utter(page)
    card.locator("[data-action='test-voice-hi']").click()
    said = wait_for(page, "(v) => window.__utter.some((u) => u.voice === v)", 6000, SWARA)
    hindi = [u for u in utter(page) if u.get("voice") == SWARA]
    check(
        "Hear Mitra in Hindi: Swara says a Hindi sentence, in the female voice's words",
        said and any("मित्र" in (u.get("text") or "") and "दिलाऊँगी" in (u.get("text") or "") for u in hindi),
        utter(page),
    )
    clear_utter(page)
    card.locator("[data-action='test-voice-gu']").click()
    said = wait_for(page, "(v) => window.__utter.some((u) => u.voice === v)", 6000, DHWANI)
    check("Hear Mitra in Gujarati: Dhwani says a Gujarati sentence", said and any("મિત્ર" in (u.get("text") or "") for u in utter(page)), utter(page))
    clear_utter(page)
    card.locator("[data-voice-kind='male']").click()
    page.wait_for_timeout(500)
    card.locator("[data-action='test-voice-hi']").click()
    said = wait_for(page, "(v) => window.__utter.some((u) => u.voice === v)", 6000, MADHUR)
    check(
        "The male voice chosen: Madhur, and the male verbs ('दिलाऊँगा')",
        said and any("दिलाऊँगा" in (u.get("text") or "") for u in utter(page) if u.get("voice") == MADHUR),
        utter(page),
    )
    check("...and English is Prabhat", "Prabhat" in card.locator("[data-field='voice-in-use']").inner_text(), card.locator("[data-field='voice-in-use']").inner_text())
    card.locator("[data-voice-kind='female']").click()
    page.wait_for_timeout(500)

    # ==================================================================
    # 2. Ask Mitra in Hindi and Gujarati, with Edge's voices (no model on this server: the app's own answers)
    # ==================================================================
    print("\n==== Asked in Hindi and in Gujarati, in Edge ====")
    open_ask_mitra(page)
    mic = page.locator("button[data-action='voice']")
    check(
        "The microphone, the browser itself listening, names its one language: the screens' (English)",
        mic.count() == 1 and "in English" in (mic.first.get_attribute("title") or ""),
        mic.first.get_attribute("title") if mic.count() else "no button",
    )
    clear_utter(page)
    answer = ask(page, "F/HR/05 क्या है?")
    check("A question in Hindi: the answer has one Hindi line, saying the full Hindi answer needs the AI service", HINDI_NOTE in answer, answer[:200])
    check("...in front of the answer the app can give", HINDI_NOTE in answer and "F/HR/05" in answer.split(HINDI_NOTE, 1)[-1] and "F/HR/05" not in answer.split(HINDI_NOTE, 1)[0], answer[:300])
    wait_for(page, "(v) => window.__utter.some((u) => u.voice === v)", 6000, NEERJA)
    spoken = utter(page)
    voices = [u.get("voice") for u in spoken]
    check(
        "...read aloud by the Hindi voice first, then the Indian English one",
        bool(spoken) and spoken[0].get("voice") == SWARA and spoken[0].get("lang") == "hi-IN" and HINDI_NOTE in (spoken[0].get("text") or "") and NEERJA in voices[1:],
        [(u.get("voice"), (u.get("text") or "")[:60]) for u in spoken],
    )
    check("...and no Hindi word given to the English voice", not any(("हिंदी" in (u.get("text") or "")) for u in spoken if u.get("voice") == NEERJA), spoken)
    clear_utter(page)
    answer = ask(page, "F/HR/05 શું છે?")
    check("A question in Gujarati, on English screens: the answer is in Gujarati", "એટલે" in answer, answer[:200])
    wait_for(page, "(v) => window.__utter.some((u) => u.voice === v)", 6000, DHWANI)
    page.wait_for_timeout(600)
    spoken = utter(page)
    check(
        "...read aloud by the Gujarati voice, all of it - the document's English name too, never by the English voice",
        bool(spoken) and all(u.get("voice") == DHWANI and u.get("lang") == "gu-IN" for u in spoken) and any("એટલે" in (u.get("text") or "") for u in spoken),
        [(u.get("voice"), (u.get("text") or "")[:60]) for u in spoken],
    )
    check("No hint about Edge here: every voice is there", page.locator(".assistant-voice-note").count() == 0)

    # ==================================================================
    # 3. The same in Google Chrome: no Gujarati voice at all
    # ==================================================================
    print("\n==== In Google Chrome: no Gujarati voice ====")
    # The stand-in voices are installed as the page loads: Chrome's list needs a fresh load, not a new address.
    page.evaluate("() => localStorage.setItem('e2e:voices', 'chrome')")
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(800)
    dismiss(page)
    close_assistant(page)
    check("The page now has Chrome's voices", page.evaluate("() => speechSynthesis.getVoices().some((v) => v.name === 'Google हिन्दी')"))
    card = open_voice_card(page)
    gu_row = card.locator("[data-field='voice-gujarati']")
    check(
        "The card: no Gujarati voice in this browser, use Microsoft Edge",
        gu_row.count() == 1 and gu_row.get_attribute("data-source") == "none" and "Microsoft Edge" in gu_row.inner_text(),
        gu_row.inner_text() if gu_row.count() else "no row",
    )
    check("...and no Gujarati sample offered", card.locator("[data-action='test-voice-gu']").is_disabled())
    hi_row = card.locator("[data-field='voice-hindi']")
    check("Hindi: Google's Hindi voice", hi_row.get_attribute("data-source") == "online" and "Google हिन्दी" in hi_row.inner_text(), hi_row.inner_text())
    check("English: Google UK English Female, with where a more human voice is", "Google UK English Female" in card.locator("[data-field='voice-in-use']").inner_text() and "Microsoft Edge" in card.locator("[data-field='voice-in-use']").inner_text())

    open_ask_mitra(page)
    page.locator("[data-clock]").first.click()
    clear_utter(page)
    answer = ask(page, "F/HR/05 શું છે?")
    check("A question in Gujarati in Chrome: still answered in Gujarati", "એટલે" in answer, answer[:200])
    page.wait_for_timeout(800)
    check("...but not said at all: no Gujarati voice here, and never an English voice for it", utter(page) == [], [(u.get("voice"), (u.get("text") or "")[:60]) for u in utter(page)])
    note = page.locator(".assistant-voice-note")
    check(
        "...and the hint, once: Mitra speaks Gujarati in Microsoft Edge",
        note.count() == 1 and "Mitra speaks Gujarati in Microsoft Edge. Open DCRS in Edge to hear it." in note.first.inner_text(),
        note.first.inner_text() if note.count() else "no note",
    )
    ask(page, "F/HR/05 શું છે?")
    page.wait_for_timeout(800)
    check("Asked again: no hint the second time this session", page.locator(".assistant-voice-note").count() == 0)
    clear_utter(page)
    answer = ask(page, "F/HR/05 क्या है?")
    wait_for(page, "() => window.__utter.length >= 2", 6000)
    spoken = utter(page)
    check(
        "In Chrome a Hindi answer's Hindi line is said by Google's Hindi voice, the rest by Google's English one",
        bool(spoken) and spoken[0].get("voice") == "Google हिन्दी" and any(u.get("voice") == "Google UK English Female" for u in spoken[1:]),
        [(u.get("voice"), (u.get("text") or "")[:50]) for u in spoken],
    )

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nMitra speaks and answers in English, Hindi and Gujarati, each in its own voice, and says where it cannot.")
