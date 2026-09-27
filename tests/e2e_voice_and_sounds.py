"""Mitra's sounds and voice (REQUIREMENTS s81), asked for on 27-Sep-2026:

  "Add some noise in notification and with that our bot will also remind with
  voice like in today briefing it seem to be real voice so if user heard it
  look like some one is telling them to complete task fast for good score"

So this suite checks, as a person of one department (Production):

  * nothing is played or said before the page's first click - a sound or a line
    asked for then is dropped (the sound) or waits (the line), and the line is
    said at the first click;
  * the briefing that opens by itself at sign-in (or from the top bar) chimes and
    is said aloud, naming the person; its header's speaker button says it again;
    the day's notification chimes and asks for its headline to be said;
  * the bell's "What should I do next?" says a reminder about a document that is
    due today or late - naming it - with a small card at the bottom left that
    takes no clicks but its own buttons, and goes by itself;
  * the top bar's speaker button mutes every sound and line, and brings them back;
    it sits after the language control and fits a phone's width;
  * the settings in Master Data - sounds, voice, the voice's kind, how often a
    spoken reminder may come - stick (in the person's settings) and Hear Mitra /
    Play a sound work;
  * no JavaScript errors.

Audio is never really heard: an init script records every "dcrs:cue" and
"dcrs:say" event (engine/engageBus.ts), counts the AudioContexts made and the
notes started, stubs speechSynthesis.speak (recording what would be said, in
which voice) and HTMLMediaElement.play. The server has no Groq key here, so every
line goes to the browser's own voice.

Network-independent, against the production build on :8842.
"""
import sys
import time
from datetime import date

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
# No word of the name is a button's label.
ACCOUNT = "Kavya Trivedi"
FIRST_NAME = "Kavya"
DEPARTMENT = "PRD"
PRD_DOCS = ["prd-process-parameter", "prd-alc-production"]
OPEN = ("Scheduled", "Due", "In Progress", "Rejected")
FAILURES = []

ADJUSTMENT_DAYS_2026 = {"2026-01-22", "2026-08-06", "2026-10-22", "2026-11-05", "2026-11-20"}
FESTIVAL_HOLIDAYS_2026 = {
    "2026-01-14", "2026-01-26", "2026-03-04", "2026-08-15", "2026-08-28", "2026-09-04", "2026-10-19", "2026-10-20",
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
}

RECORDER = r"""
(() => {
  window.__cues = [];
  window.__says = [];
  window.__spoken = [];
  window.__audio = { made: 0, starts: 0, plays: 0 };
  window.addEventListener('dcrs:cue', (e) => window.__cues.push({ cue: (e.detail || {}).cue, at: Date.now() }));
  window.addEventListener('dcrs:say', (e) => window.__says.push(Object.assign({ at: Date.now() }, e.detail || {})));
  // What the browser would say, and in which voice - never out loud.
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function (u) {
        window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice ? u.voice.name : '', at: Date.now() });
        setTimeout(() => { try { if (u.onend) u.onend(new Event('end')); } catch (err) {} }, 30);
      };
    }
  } catch (err) {}
  // Every AudioContext made, and every note started on one.
  try {
    const Real = window.AudioContext || window.webkitAudioContext;
    if (Real) {
      class Counting extends Real {
        constructor(...args) { super(...args); window.__audio.made += 1; }
        createOscillator() {
          const osc = super.createOscillator();
          const start = osc.start.bind(osc);
          osc.start = (...args) => { window.__audio.starts += 1; return start(...args); };
          return osc;
        }
      }
      window.AudioContext = Counting;
    }
  } catch (err) {}
  // A clip from the server's voice would be played here (there is no key in this run).
  HTMLMediaElement.prototype.play = function () {
    window.__audio.plays += 1;
    const el = this;
    setTimeout(() => el.dispatchEvent(new Event('ended')), 30);
    return Promise.resolve();
  };
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
        g = page.locator("button:has-text('Got it')")
        if g.count():
            g.first.click()
            page.wait_for_timeout(200)
    settle_briefing(page)


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def stored(page, key):
    return page.evaluate("(k) => JSON.parse(localStorage.getItem('dcrs:v1:' + k) || 'null')", key)


def recorded(page):
    return page.evaluate(
        "() => ({ cues: window.__cues.slice(), says: window.__says.slice(), spoken: window.__spoken.slice(), audio: Object.assign({}, window.__audio) })"
    )


def wait_for(page, predicate_js, timeout_ms=5000, arg=None):
    """Polls a JS predicate (a function of `arg`) until it is true or the time is up."""
    try:
        page.wait_for_function(predicate_js, arg=arg, timeout=timeout_ms)
        return True
    except Exception:
        return False


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


def sign_up(page, email):
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", ACCOUNT)
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.select_option("#signup-department", DEPARTMENT)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)


def me(page):
    return page.evaluate("() => fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json())")


def log_out(page):
    dismiss(page)
    page.locator("button[title='Log Out']").first.click()
    page.wait_for_timeout(500)
    ok = page.locator("[data-action='logout-review-confirm']")
    if ok.count():
        ok.first.click()
    page.wait_for_selector("text=Sign up", timeout=30000)
    page.wait_for_timeout(600)


def settings(page):
    return stored(page, "settings") or {}


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1500, "height": 1000})
    context.add_init_script(RECORDER)
    page = context.new_page()
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    console_errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    sign_up(page, f"voice-{int(time.time() * 1000)}@example.com")
    page.wait_for_timeout(1500)
    # The first account a server ever has becomes its administrator and sees every
    # department; a second, kept to Production, is what this suite is about.
    if ((me(page) or {}).get("user") or {}).get("role") == "admin":
        print("    (the first account on this server is its administrator; signing up a Production account)")
        log_out(page)
        page.evaluate("() => { window.__cues.length = 0; window.__says.length = 0; window.__spoken.length = 0; }")
        sign_up(page, f"voice-prd-{int(time.time() * 1000)}@example.com")
        page.wait_for_timeout(1500)
    who = (me(page) or {}).get("user") or {}
    check("Signed in as a person of Production", who.get("role") != "admin" and who.get("departments") == [DEPARTMENT], who)
    today = date.today().isoformat()

    # ==================================================================
    # 1. At sign-in: the briefing chimes and is said aloud, with the person's name
    # ==================================================================
    print("\n==== The briefing, heard ====")
    if page.locator(".briefing").count() == 0:
        # A browser's first open always gets it; if a slot already had it, it is opened from the top bar.
        page.locator("button[aria-label=\"Today's briefing\"]").first.click()
    page.wait_for_selector(".briefing", timeout=15000)
    heard = wait_for(
        page,
        "(name) => window.__says.some((s) => (s.text || '').includes(name)) && window.__spoken.some((s) => (s.text || '').includes(name))",
        6000,
        FIRST_NAME,
    )
    rec = recorded(page)
    # The day's notification also greets by name (key nudge:<date>): the briefing's line is the other one.
    briefing_says = [s for s in rec["says"] if FIRST_NAME in (s.get("text") or "") and not (s.get("key") or "").startswith("nudge:")]
    check("The briefing asked for its chime", any(c.get("cue") == "chime" for c in rec["cues"]), rec["cues"])
    check("...and to be said aloud, greeting the person by first name", len(briefing_says) >= 1, rec["says"])
    check(
        "...and it WAS said - the sign-in click counts as the first gesture",
        heard and any(FIRST_NAME in (s.get("text") or "") for s in rec["spoken"]),
        rec["spoken"],
    )
    if briefing_says:
        first = briefing_says[0]
        check("...in the interface's language, with the English line given too", first.get("lang") == "en" and bool(first.get("en")), first)
        check(
            "...once a day for the automatic showing (key briefing:<slot>:<date>), or keyless when opened by hand",
            (first.get("key") or "").startswith("briefing:") and (first.get("key") or "").endswith(today) or not first.get("key"),
            first.get("key"),
        )
    check("A note was started on an AudioContext for the chime", rec["audio"]["starts"] > 0 and rec["audio"]["made"] == 1, rec["audio"])

    voice_btn = page.locator(".briefing [data-action='briefing-voice']")
    check("The briefing's header has a speaker button, with aria-pressed", voice_btn.count() == 1 and voice_btn.get_attribute("aria-pressed") in ("true", "false"))
    spoken_before = len(rec["spoken"])
    page.wait_for_timeout(400)
    voice_btn.first.click()
    # The browser's voice says a long line a sentence at a time: the greeting is one of the pieces said since the press.
    again = wait_for(page, "([n, name]) => window.__spoken.slice(n).some((s) => (s.text || '').includes(name))", 6000, [spoken_before, FIRST_NAME])
    rec = recorded(page)
    check("...which says the briefing again", again, rec["spoken"][spoken_before:][-4:])

    # The day's notification (first screen of the day) chimes and asks for its headline.
    nudge_says = [s for s in rec["says"] if (s.get("key") or "").startswith("nudge:")]
    if page.locator("[data-section='daily-nudge']").count():
        check("The day's notification asked for its headline to be said (key nudge:<date>, giving way to the briefing)", len(nudge_says) == 1 and nudge_says[0].get("priority") == "low", nudge_says)
    else:
        print("    (the day's notification was not shown to this account)")
    dismiss(page)
    close_assistant(page)

    # ==================================================================
    # 2. Before the first click nothing is played or said
    # ==================================================================
    print("\n==== Nothing before the first click ====")
    # The briefing's slots marked shown - and SAVED: settle_briefing writes the
    # browser's copy only, so a setting is changed through the app (the speaker,
    # off and on), which stores the whole settings item, slots and all. Otherwise
    # a reload in the first or last working hour would open the briefing over
    # the clock this part clicks.
    settle_briefing(page)
    page.locator("[data-action='toggle-sound']").first.click()
    page.wait_for_timeout(150)
    page.locator("[data-action='toggle-sound']").first.click()
    page.wait_for_timeout(1500)  # the settings reach the database before the new tab reads them
    # A NEW TAB, not a reload: Chrome carries a page's "has been clicked" (navigator.userActivation) over a
    # reload, and then the browser allows sound and the app rightly plays it. A tab nobody has clicked is the
    # case the rule is for.
    main_page = page
    page = context.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    # Playwright's Chromium reports every page as already clicked (navigator.userActivation.hasBeenActive is
    # true even in a new tab), which a person's browser never does on a fresh load. So this tab is told the
    # truth a person's browser would tell: nobody has clicked it yet — and the app's own first-click gate is
    # what is tested.
    page.add_init_script(
        """(() => {
             try {
               Object.defineProperty(Navigator.prototype, 'userActivation', {
                 configurable: true,
                 get() { return { hasBeenActive: false, isActive: false }; },
               });
             } catch (e) {}
           })();"""
    )
    page.goto(main_page.url)
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    activated = page.evaluate("() => !!(navigator.userActivation && navigator.userActivation.hasBeenActive)")
    check("In a new tab the browser reports no click yet", not activated, activated)
    check("After opening it nothing covers the page (no briefing)", page.locator(".briefing").count() == 0)
    page.evaluate(
        """() => {
             window.dispatchEvent(new CustomEvent('dcrs:cue', { detail: { cue: 'chime' } }));
             window.dispatchEvent(new CustomEvent('dcrs:say', { detail: { text: 'A line asked for before any click.', lang: 'en' } }));
           }"""
    )
    page.wait_for_timeout(2200)
    rec = recorded(page)
    check("No AudioContext is made and no note played before the first click", rec["audio"]["made"] == 0 and rec["audio"]["starts"] == 0, rec["audio"])
    check("...and nothing is said", not any("before any click" in (s.get("text") or "") for s in rec["spoken"]), rec["spoken"])
    page.locator("[data-clock]").first.click()
    said_after = wait_for(page, "() => window.__spoken.some((s) => (s.text || '').includes('before any click'))", 5000)
    check("At the first click the waiting line is said", said_after, recorded(page)["spoken"])
    page.evaluate("() => window.dispatchEvent(new CustomEvent('dcrs:cue', { detail: { cue: 'success' } }))")
    page.wait_for_timeout(400)
    rec = recorded(page)
    check("...and from then on a cue plays (one AudioContext, notes started)", rec["audio"]["made"] == 1 and rec["audio"]["starts"] > 0, rec["audio"])
    page.close()
    page = main_page

    # ==================================================================
    # 3. The bell: "What should I do next?"
    # ==================================================================
    print("\n==== The bell asks Mitra what is next ====")
    master = stored(page, "master")
    working = not closed_day(today, master)
    if working:
        # Other suites of the run may have handed today's Production sheets in: one is set back to waiting.
        page.evaluate(
            """({ docs, today }) => {
                 const KEY = 'dcrs:v1:records';
                 const rs = JSON.parse(localStorage.getItem(KEY) || '[]');
                 const r = rs.find((x) => docs.includes(x.documentId) && !x.isDemo && x.dueDate === today);
                 if (!r) return false;
                 if (!['Scheduled', 'Due', 'In Progress'].includes(r.status)) {
                   r.status = 'Due';
                   for (const k of ['submittedAt', 'submittedBy', 'verifiedAt', 'verifiedBy', 'rejectedAt', 'rejectedBy', 'rejectionReason', 'correction']) delete r[k];
                 }
                 localStorage.setItem(KEY, JSON.stringify(rs));
                 return true;
               }""",
            {"docs": PRD_DOCS, "today": today},
        )
    else:
        print("    (today is a closed day: nothing of Production's is due today)")
    before = recorded(page)
    page.locator("button[aria-label='Reminders']").first.click()
    page.wait_for_timeout(600)
    ask = page.locator("[data-action='voice-remind-now']")
    check("The bell's list has 'What should I do next?'", ask.count() == 1 and "What should I do next" in ask.first.inner_text(), ask.count())
    ask.first.click()
    toast = page.locator("[data-section='mitra-voice-reminder']")
    try:
        toast.first.wait_for(timeout=4000)
    except Exception:
        pass
    check("A spoken reminder's card shows", toast.count() == 1)
    wait_for(page, "(n) => window.__spoken.length > n", 5000, len(before["spoken"]))
    rec = recorded(page)
    new_says = rec["says"][len(before["says"]):]
    new_spoken = rec["spoken"][len(before["spoken"]):]
    line = (new_says[-1].get("text") if new_says else "") or ""
    rid = toast.first.get_attribute("data-record-id") if toast.count() else ""
    if rid:
        records = stored(page, "records") or []
        docs = stored(page, "documents") or []
        r = next((x for x in records if x.get("id") == rid), None)
        doc = next((d for d in docs if d.get("id") == (r or {}).get("documentId")), None)
        check("It is about a record due today or late, and still waiting", bool(r) and r.get("dueDate", "9999") <= today and r.get("status") in OPEN, r and (r.get("dueDate"), r.get("status")))
        check("The line names the document", bool(doc) and doc.get("name", "@@") in line, (doc and doc.get("name"), line))
        check("...and the person, and when it was due", line.startswith(FIRST_NAME + ",") and ("due today" in line or "late" in line), line)
        check("The reminder's three notes were asked for first", any(c.get("cue") == "reminder" for c in rec["cues"][len(before["cues"]):]), rec["cues"][-3:])
        check("...and the line was said", any(line and line == (s.get("text") or "") for s in new_spoken), new_spoken)
    else:
        check("Nothing is due: Mitra says so", "Nothing is due" in line and any("Nothing is due" in (s.get("text") or "") for s in new_spoken), (line, new_spoken))
        if working:
            check("...which can only be when Production's work of today is all in", False, "a working day, yet nothing due was found")
    if toast.count():
        style = toast.first.evaluate(
            "el => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { pe: cs.pointerEvents, pos: cs.position, noPrint: el.classList.contains('no-print'), left: r.left, right: r.right, bottom: r.bottom, top: r.top, inContent: !!el.closest('.app-content') }; }"
        )
        check(
            "The card takes no clicks, is fixed, bottom left, within the window, not in the page, and not printed",
            style["pe"] == "none" and style["pos"] == "fixed" and style["noPrint"] and style["left"] >= 0 and style["right"] <= 1500 and style["bottom"] <= 1000 and style["left"] < 400 and not style["inContent"],
            style,
        )
        beneath = page.evaluate(
            "() => { const el = document.querySelector(\"[data-section='mitra-voice-reminder'] [data-field='voice-reminder-text']\"); const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 10, r.top + 5); return !!hit && !hit.closest(\"[data-section='mitra-voice-reminder']\"); }"
        )
        check("...a click on its words goes to the page beneath", beneath)
        check("...only its own buttons take clicks", toast.first.locator("[data-action='voice-reminder-mute']").evaluate("el => getComputedStyle(el).pointerEvents") == "auto")
        if rid:
            check("It offers to go to the record, or later", toast.first.locator("[data-action='voice-reminder-go']").count() == 1 and toast.first.locator("[data-action='voice-reminder-later']").count() == 1)
        started = time.time()
        gone = wait_for(page, "() => !document.querySelector(\"[data-section='mitra-voice-reminder']\")", 15000)
        check("The card goes by itself (12 s)", gone and time.time() - started < 14.5, round(time.time() - started, 1))

    # "Later" puts it away at once.
    page.locator("button[aria-label='Reminders']").first.click()
    page.wait_for_timeout(500)
    page.locator("[data-action='voice-remind-now']").first.click()
    try:
        toast.first.wait_for(timeout=4000)
    except Exception:
        pass
    if toast.count() and toast.first.locator("[data-action='voice-reminder-later']").count():
        toast.first.locator("[data-action='voice-reminder-later']").click()
        page.wait_for_timeout(300)
        check("'Later' puts the card away at once", toast.count() == 0)
    page.wait_for_timeout(600)

    # ==================================================================
    # 4. The top bar's speaker mutes everything, and brings it back
    # ==================================================================
    print("\n==== The top bar's speaker ====")
    order = page.evaluate(
        """() => { const end = document.querySelector('.app-topbar-end'); if (!end) return []; return Array.from(end.children).map((el) => el.matches('[data-connection]') ? 'connection' : el.matches('[data-clock]') ? 'clock' : el.matches('.lang-select, .lang-select *') || el.querySelector('.lang-select') ? 'language' : el.matches("[data-action='toggle-sound']") ? 'sound' : (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)); }"""
    )
    check("The speaker sits after the connection, the clock and the language", order[:4] == ["connection", "clock", "language", "sound"], order)
    toggle = page.locator("[data-action='toggle-sound']")
    check("It is on, and says what pressing it does", toggle.get_attribute("aria-pressed") == "true" and "Mute" in (toggle.get_attribute("title") or ""), toggle.get_attribute("title"))
    toggle.click()
    page.wait_for_timeout(500)
    s = settings(page)
    check("Pressed: muted - sounds and voice both off, in the person's settings", toggle.get_attribute("aria-pressed") == "false" and s.get("soundsOn") is False and s.get("voiceOn") is False, (s.get("soundsOn"), s.get("voiceOn")))
    before = recorded(page)
    page.evaluate(
        """() => {
             window.dispatchEvent(new CustomEvent('dcrs:cue', { detail: { cue: 'celebrate' } }));
             window.dispatchEvent(new CustomEvent('dcrs:say', { detail: { text: 'A line while muted.', lang: 'en' } }));
           }"""
    )
    page.locator("button[aria-label='Reminders']").first.click()
    page.wait_for_timeout(400)
    page.locator("[data-action='voice-remind-now']").first.click()
    page.wait_for_timeout(2500)
    rec = recorded(page)
    check("...no note is played", rec["audio"]["starts"] == before["audio"]["starts"], (before["audio"], rec["audio"]))
    check("...and nothing is said - not even the bell's reminder", len(rec["spoken"]) == len(before["spoken"]), rec["spoken"][len(before["spoken"]):])
    check("...though the reminder's card still shows the words", page.locator("[data-section='mitra-voice-reminder']").count() == 1)
    toggle.click()
    page.wait_for_timeout(500)
    s = settings(page)
    check("Pressed again: both back on", toggle.get_attribute("aria-pressed") == "true" and s.get("soundsOn") is True and s.get("voiceOn") is True)
    before = recorded(page)
    page.evaluate("() => window.dispatchEvent(new CustomEvent('dcrs:cue', { detail: { cue: 'success' } }))")
    page.evaluate("() => window.dispatchEvent(new CustomEvent('dcrs:say', { detail: { text: 'Back again.', lang: 'en' } }))")
    wait_for(page, "() => window.__spoken.some((s) => s.text === 'Back again.')", 5000)
    rec = recorded(page)
    check("...a cue plays and a line is said again", rec["audio"]["starts"] > before["audio"]["starts"] and any(x.get("text") == "Back again." for x in rec["spoken"]))

    # ==================================================================
    # 5. The settings in Master Data
    # ==================================================================
    print("\n==== Master Data: sounds and Mitra's voice ====")
    page.goto(f"{BASE}/index.html#/master-data")
    page.wait_for_timeout(1200)
    dismiss(page)
    page.locator(".pill-tab", has_text="Working Hours & Briefing").first.click()
    page.wait_for_timeout(600)
    card = page.locator("[data-section='voice-settings']")
    check("The Working Hours tab has the sounds and voice card", card.count() == 1)
    check("...its switches are buttons, not checkboxes", card.locator("input[type='checkbox']").count() == 0 and card.locator("button[role='switch']").count() == 2)
    sw_voice = card.locator("[data-field='voice-on']")
    sw_sounds = card.locator("[data-field='sounds-on']")
    sw_voice.click()
    page.wait_for_timeout(300)
    check("The voice switch turns the voice off (sounds stay on)", sw_voice.get_attribute("aria-checked") == "false" and settings(page).get("voiceOn") is False and settings(page).get("soundsOn") is True)
    check("...and the top bar's speaker still shows on, for the sounds", page.locator("[data-action='toggle-sound']").get_attribute("aria-pressed") == "true")
    sw_voice.click()
    sw_sounds.click()
    page.wait_for_timeout(300)
    check("The sounds switch turns the sounds off", sw_sounds.get_attribute("aria-checked") == "false" and settings(page).get("soundsOn") is False and settings(page).get("voiceOn") is True)
    sw_sounds.click()
    card.locator("[data-voice-kind='male']").click()
    card.locator("[data-remind-every='60']").click()
    page.wait_for_timeout(300)
    s = settings(page)
    check("A male voice and a reminder every 60 minutes, chosen", s.get("voiceKind") == "male" and s.get("remindEveryMin") == 60, (s.get("voiceKind"), s.get("remindEveryMin")))
    check("...and shown as chosen", card.locator("[data-voice-kind='male']").get_attribute("aria-pressed") == "true" and card.locator("[data-remind-every='60']").get_attribute("aria-pressed") == "true")
    before = recorded(page)
    card.locator("[data-action='test-voice']").click()
    heard = wait_for(page, "([n, name]) => window.__spoken.slice(n).some((s) => (s.text || '').includes(name) && (s.text || '').includes('Mitra'))", 5000, [len(before["spoken"]), FIRST_NAME])
    check("Hear Mitra says hello, by name", heard, recorded(page)["spoken"][-2:])
    card.locator("[data-action='test-sound']").click()
    page.wait_for_timeout(400)
    rec = recorded(page)
    check("Play a sound plays one, and says which", rec["audio"]["starts"] > before["audio"]["starts"] and card.locator("[data-field='test-sound-played']").count() == 1)
    check("It says which voice is in use here", card.locator("[data-field='voice-in-use']").count() == 1, card.inner_text()[:400])
    page.wait_for_timeout(1500)  # the settings reach the database
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    page.locator(".pill-tab", has_text="Working Hours & Briefing").first.click()
    page.wait_for_timeout(600)
    card = page.locator("[data-section='voice-settings']")
    check(
        "After a reload the choices are still there",
        card.locator("[data-voice-kind='male']").get_attribute("aria-pressed") == "true"
        and card.locator("[data-remind-every='60']").get_attribute("aria-pressed") == "true"
        and card.locator("[data-field='voice-on']").get_attribute("aria-checked") == "true"
        and card.locator("[data-field='sounds-on']").get_attribute("aria-checked") == "true",
        settings(page),
    )

    # ==================================================================
    # 6. On a phone
    # ==================================================================
    print("\n==== On a phone ====")
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(f"{BASE}/index.html#/dashboard")
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    width = page.evaluate("() => document.documentElement.scrollWidth")
    check("At 390 px the page does not scroll sideways", width <= 390, width)
    check("...and the speaker is there to press, an icon alone", page.locator("[data-action='toggle-sound']").first.is_visible() and not page.locator("[data-action='toggle-sound'] .sound-toggle-label").first.is_visible())
    page.set_viewport_size({"width": 1500, "height": 1000})

    # Only this feature's own: nothing about audio, speech or the voice route may be logged as an error.
    ours = [m for m in console_errors if any(w in m.lower() for w in ("audiocontext", "speech", "/speak", "voice", "play()"))]
    check("No console errors from sounds or the voice", not ours, ours[:5])
    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nAll voice and sound checks passed.")
