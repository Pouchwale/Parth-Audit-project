"""Mitra celebrates work done - in every module - and never gets in the way
(REQUIREMENTS s81), asked for on 27-Sep-2026:

  "if user complete all the task the bot will enthusiasm them ... show reactions
  when user complete the task in given time frame and this is applicable to
  each and every module; also make sure to motivate them not only for score."

So this suite checks, as a person of one department (Production, whose two
daily log sheets make "the last one due today" something a real submit can
reach):

  * a record due today handed in on time: the reaction toast exactly as before
    (its emoji, its sentence, within 900 ms), and under it Mitra's cheer line;
    a small burst of confetti that takes no clicks, and the "success" sound
    asked for (or, before 11:00, the early-bird badge and its "celebrate");
  * a record handed in after its day: the toast says how late, the cheer line
    is gentle, the "late" sound is asked for - and there is no confetti;
  * the Dashboard's day card: the ring of today's work, the streak, and the
    next thing to do as a button that goes to it - and its headline, today's
    score counted from what is missing (the plant, 27-Sep-2026: "10 tasks, 8
    completed: his score will not be 80, it will be -20"), equal to
    round(done / total * 100) - 100 from the card's own count, with a line
    saying how to reach 0;
  * the LAST record due today: the toast's "last one due today", confetti
    falling, the "celebrate" sound, Mitra saying so aloud (once a day, key
    all-done:<date>) with the person's first name, and the all-done card under
    the top bar with the first name, the streak and "Today's score: 0 -
    nothing missing" - naming no document and no module;
  * the celebration never blocks a click: a button beneath the card is
    pressed while it shows; its own close button puts it away;
  * with reduced motion asked for, no confetti at all;
  * no JavaScript errors.

The sounds and the voice are asked for as window events ("dcrs:cue",
"dcrs:say", engine/engageBus.ts); an init script records them, and records
every confetti layer the moment it appears, so nothing here depends on audio.

On a closed day (the Thursday weekly off, a festival holiday) nothing is due
today, so the parts that need a record due today are driven by the same
reaction events the app announces, and say so.

Network-independent, against the production build on :8842.
"""
import math
import re
import sys
import time
from datetime import date, timedelta

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
# No word of the name is a button's label.
ACCOUNT = "Heena Joshi"
FIRST_NAME = "Heena"
DEPARTMENT = "PRD"
PRD_DOCS = ["prd-process-parameter", "prd-alc-production"]
OPEN = ("Scheduled", "Due", "In Progress")
FAILURES = []

# The company's working calendar (tests/e2e_editing.py): Thursday is the weekly
# off except on adjustment days, plus the festival holidays - used when the
# master data is not in the browser yet.
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
  window.addEventListener('dcrs:cue', (e) => window.__cues.push((e.detail || {}).cue));
  window.addEventListener('dcrs:say', (e) => window.__says.push(e.detail || {}));
  const seen = new WeakSet();
  const look = () => {
    document.querySelectorAll("[data-section='mitra-confetti']").forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const cs = getComputedStyle(el);
      window.__confetti.push({
        kind: el.getAttribute('data-kind'),
        pieces: el.children.length,
        pointerEvents: cs.pointerEvents,
        position: cs.position,
        overflow: cs.overflow,
        noPrint: el.classList.contains('no-print'),
        wider: document.documentElement.scrollWidth > window.innerWidth,
      });
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


def open_page(page, route, settle=1400):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)


def stored(page, key):
    return page.evaluate("(k) => JSON.parse(localStorage.getItem('dcrs:v1:' + k) || 'null')", key)


def record(page, rid):
    return next((r for r in (stored(page, "records") or []) if r["id"] == rid), None)


def ensure_mitra(page):
    if page.locator("[data-assistant='docked']").count() == 0:
        page.locator("[data-assistant='closed'] button").first.click()
        page.wait_for_timeout(400)


def say(page, text, wait=1500):
    ensure_mitra(page)
    box = page.locator("[data-assistant='docked'] textarea")
    box.fill(text)
    box.press("Enter")
    page.wait_for_timeout(wait)
    msgs = page.locator(".chat-log .chat-msg.bot")
    return (msgs.last.text_content() or "") if msgs.count() else ""


def events(page):
    return page.evaluate("() => ({ cues: window.__cues.slice(), says: window.__says.slice(), confetti: window.__confetti.slice() })")


def toast(page):
    return page.locator("[data-section='mitra-reaction']")


def dismiss_toast(page):
    t = toast(page)
    if t.count():
        t.first.click()
        page.wait_for_timeout(300)


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
    page.wait_for_timeout(1500)
    dismiss(page)


def me(page):
    return page.evaluate("() => fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json())")


def log_out(page):
    page.locator("button[title='Log Out']").first.click()
    # Every log-out asks about the day's work first (REQUIREMENTS s72).
    page.wait_for_timeout(500)
    ok = page.locator("[data-action='logout-review-confirm']")
    if ok.count():
        ok.first.click()
    page.wait_for_selector("text=Sign up", timeout=30000)
    page.wait_for_timeout(600)


def previous_working_day(iso, master):
    d = date.fromisoformat(iso) - timedelta(days=1)
    while closed_day(d.isoformat(), master):
        d -= timedelta(days=1)
    return d.isoformat()


def dispatch(page, detail):
    page.evaluate("(d) => window.dispatchEvent(new CustomEvent('dcrs:reaction', { detail: d }))", detail)


MINUS = "−"


def expected_gap(count_text):
    """engine/motivation.ts dayGapScore, from the ring's own count ("done/total"; a tick when nothing is due):
    round(done / total * 100) - 100 - rounded as JavaScript's Math.round does, not Python's banker's round -
    between -100 and 0, and below 0 while anything is missing. Returns (score, done, total)."""
    if "/" not in count_text:
        return 0, None, None
    done, total = (int(x) for x in count_text.split("/", 1))
    if total <= 0:
        return 0, done, total
    score = math.floor(done / total * 100 + 0.5) - 100
    if done < total:
        score = min(score, -1)
    return max(-100, min(0, score)), done, total


def tone_of(score):
    return "perfect" if score >= 0 else "close" if score >= -20 else "behind" if score >= -50 else "far"


def check_day_score(card, where):
    """The day card's headline: today's score, counted from what is missing, from the card's own count."""
    count_text = (card.locator("[data-field='my-day-count']").text_content() or "").strip()
    num = card.locator("[data-field='my-day-score']")
    raw = num.get_attribute("data-score") if num.count() == 1 else None
    shown = (num.text_content() or "").strip() if num.count() == 1 else ""
    want, done, total = expected_gap(count_text)
    whole = raw is not None and re.fullmatch(r"-?\d+", raw) is not None
    check(
        f"{where}: the headline is today's score, counted from what is missing - round(done/total*100) - 100 of the card's own count",
        whole and int(raw) <= 0 and int(raw) == want,
        (count_text, raw, want),
    )
    looks = "0" if want == 0 else f"{MINUS}{-want}"
    check(
        f"...shown as {looks} (a true minus sign) in an element of its own that is never translated, toned '{tone_of(want)}'",
        num.count() == 1
        and shown == looks
        and num.get_attribute("translate") == "no"
        and f"tone-{tone_of(want)}" in (num.get_attribute("class") or ""),
        (shown, num.get_attribute("translate") if num.count() else None, num.get_attribute("class") if num.count() else None),
    )
    label = (card.locator(".my-day-score-label").text_content() or "").strip() if card.locator(".my-day-score-label").count() else ""
    line = (card.locator("[data-field='my-day-score-line']").text_content() or "").strip() if card.locator("[data-field='my-day-score-line']").count() else ""
    if want < 0 and done is not None:
        says = f"{done} of {total} done" in line and f"finish {total - done} more to reach 0" in line
    else:
        says = "nothing missing" in line
    check("...labelled 'Today's score', and under it what it means and how to reach 0", label == "Today's score" and says, (label, line))
    return want


def fill_and_submit(page, rid):
    """Open the record, have Mitra fill it with sample data, and press Submit. Returns the ms from the press to the toast."""
    open_page(page, f"#/record/{rid}", settle=1500)
    say(page, "fill it with sample data", wait=1800)
    close_assistant(page)
    # A toast still up from before would be mistaken for this one's.
    dismiss_toast(page)
    page.wait_for_timeout(200)
    before = len(events(page)["cues"])
    started = time.time()
    page.locator("[data-action='submit']").first.click()
    try:
        page.wait_for_selector("[data-section='mitra-reaction']", timeout=3000)
        took = (time.time() - started) * 1000
    except Exception:
        took = 99999.0
    return took, before


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
    sign_up(page, f"celebrate-{int(time.time() * 1000)}@example.com")
    # The first account a server ever has becomes its administrator, whatever
    # department it asked for, and sees every department's work. Run on a fresh
    # server, that is this one: then a second account is made, kept to Production.
    if ((me(page) or {}).get("user") or {}).get("role") == "admin":
        print("    (the first account on this server is its administrator; signing up a Production account)")
        log_out(page)
        sign_up(page, f"celebrate-prd-{int(time.time() * 1000)}@example.com")
    who = (me(page) or {}).get("user") or {}
    check("Signed in as a person of Production alone", who.get("role") != "admin" and who.get("departments") == [DEPARTMENT], who)
    open_page(page, "#/dashboard", settle=1800)

    today = date.today().isoformat()
    master = stored(page, "master")
    working = not closed_day(today, master)
    first_of_month = date.fromisoformat(today).replace(day=1)
    closed_this_month = [
        (first_of_month + timedelta(days=i)).isoformat()
        for i in range((date.fromisoformat(today) - first_of_month).days)
        if closed_day((first_of_month + timedelta(days=i)).isoformat(), master)
    ]

    # ==================================================================
    # 0. The Production account's day, made knowable
    # ==================================================================
    # Other suites of the run may already have handed in today's Production
    # sheets. So today's two are set back to waiting (the run's database is
    # thrown away afterwards), anything else of Production's still open from
    # the go-live date to yesterday is handed in on its day, and one earlier
    # sheet is kept open to be handed in late.
    live_start = (stored(page, "live-start") or {}).get("date") or today
    plan = page.evaluate(
        """({ docs, today, liveStart, open, closed, earlier }) => {
             const KEY = 'dcrs:v1:records';
             const rs = JSON.parse(localStorage.getItem(KEY) || '[]');
             const mine = rs.filter((r) => docs.includes(r.documentId) && !r.isDemo);
             let late = mine
               .filter((r) => r.dueDate < today && open.includes(r.status) && !closed.includes(r.dueDate))
               .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))[0] || null;
             // Nothing before the go-live date is made by the schedule, so on the first
             // day of a run there is no earlier sheet: one is written for the last working
             // day, as a person who forgot it yesterday would find it.
             const model = mine.find((r) => r.documentId === docs[0] && r.dueDate === today);
             if (!late && model) {
               late = { ...JSON.parse(JSON.stringify(model)), id: 'e2e-late-' + Date.now(), dueDate: earlier, periodKey: earlier, status: 'Due', history: [] };
               for (const k of ['submittedAt', 'submittedBy', 'verifiedAt', 'verifiedBy', 'prepared', 'correction']) delete late[k];
               rs.push(late);
             }
             for (const r of mine) {
               if (r.dueDate === today) {
                 r.status = 'Due';
                 for (const k of ['submittedAt', 'submittedBy', 'verifiedAt', 'verifiedBy', 'rejectedAt', 'rejectedBy', 'rejectionReason', 'correction']) delete r[k];
                 r.history = [];
               } else if (r.dueDate < today && r.dueDate >= liveStart && (open.includes(r.status) || r.status === 'Rejected') && (!late || r.id !== late.id)) {
                 const at = new Date(r.dueDate + 'T12:00:00').toISOString();
                 r.status = 'Verified';
                 r.submittedAt = at; r.submittedBy = 'Heena Joshi'; r.verifiedAt = at; r.verifiedBy = 'QA';
                 r.history = [...(r.history || []), { id: 'e2e-' + r.id, at, by: 'Heena Joshi', action: 'submitted' }];
               }
             }
             localStorage.setItem(KEY, JSON.stringify(rs));
             const byDoc = (d) => mine.find((r) => r.documentId === d && r.dueDate === today) || null;
             const ahead = mine.filter((r) => r.dueDate > today && open.includes(r.status)).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0] || null;
             const s = JSON.parse(localStorage.getItem('dcrs:v1:settings') || '{}');
             s.celebratedToday = { date: '', keys: [] };
             s.spokenToday = { date: '', keys: [] };
             localStorage.setItem('dcrs:v1:settings', JSON.stringify(s));
             return {
               first: (byDoc(docs[0]) || {}).id || null,
               last: (byDoc(docs[1]) || {}).id || null,
               late: late ? { id: late.id, dueDate: late.dueDate } : null,
               ahead: ahead ? ahead.id : null,
             };
           }""",
        {"docs": PRD_DOCS, "today": today, "liveStart": live_start, "open": list(OPEN), "closed": closed_this_month, "earlier": previous_working_day(today, master)},
    )
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    print(f"    today {today} ({'a working day' if working else 'a closed day'}); go-live {live_start}; plan {plan}")

    # ==================================================================
    # 1. On time: the toast as before, the cheer line, a burst, a bright sound
    # ==================================================================
    print("\n==== On time ====")
    first_id = plan["first"] if working else plan["ahead"]
    if first_id:
        took, before = fill_and_submit(page, first_id)
        rec = record(page, first_id) or {}
        check("The record due today is handed in", rec.get("status") in ("Submitted", "Pending Verification"), rec.get("status"))
        check("Mitra's reaction toast shows within 900 ms of Submit, as before", took <= 900, f"{took:.0f} ms")
        t = toast(page)
        emoji = (t.locator("[data-field='reaction-emoji']").text_content() or "").strip() if t.count() else ""
        said = (t.locator("[data-field='reaction-text']").text_content() or "").strip() if t.count() else ""
        check("...one toast, its one emoji 🎉 and its sentence ending 'submitted on time.'", t.count() == 1 and emoji == "🎉" and said.endswith("submitted on time."), (emoji, said))
        page.wait_for_timeout(700)
        cheer = t.locator("[data-field='reaction-cheer']") if t.count() else None
        cheer_text = (cheer.text_content() or "").strip() if cheer is not None and cheer.count() else ""
        check("...and under it, a line of Mitra's own about the day (reaction-cheer)", len(cheer_text) > 10, cheer_text)
        check("...which names no score alone: it is about the day, the team, the customer or why it matters", "%" not in cheer_text, cheer_text)
        ev = events(page)
        burst = [c for c in ev["confetti"] if c["kind"] == "burst"]
        check("A small burst of confetti goes up from the toast's corner", len(burst) >= 1 and burst[-1]["pieces"] >= 12, ev["confetti"])
        if burst:
            b = burst[-1]
            check("...in a fixed, clipped layer that takes no clicks, never prints and never widens the page", b["pointerEvents"] == "none" and b["position"] == "fixed" and b["overflow"] == "hidden" and b["noPrint"] and not b["wider"], b)
        new_cues = ev["cues"][before:]
        pop = page.locator("[data-section='mitra-achievement']")
        if pop.count():
            # Before 11:00 the first record of the day is also an early bird: a badge of its own.
            badges = pop.locator(".cheer-badge").all_text_contents()
            check("A badge earned today (before 11:00, the early bird) is shown with the 'celebrate' sound", "celebrate" in new_cues and len(badges) >= 1, (new_cues, badges))
            check("...the badge card takes no clicks either", pop.evaluate("el => getComputedStyle(el).pointerEvents") == "none")
        else:
            check("The 'success' sound is asked for, after the toast", "success" in new_cues, new_cues)
        check("Nothing is spoken for an everyday record", not any((s.get("key") or "").startswith("all-done") for s in ev["says"][:]), ev["says"])
        dismiss_toast(page)
    else:
        print("[INFO] No Production sheet to hand in on time today; the reaction is announced as the app announces it.")
        before = len(events(page)["cues"])
        dispatch(page, {"kind": "submitted", "what": "F/PRD Test sheet", "dueDate": today, "on": today, "asRequired": False, "documentId": PRD_DOCS[0]})
        page.wait_for_timeout(700)
        ev = events(page)
        check("On time: a burst of confetti and the 'success' sound", any(c["kind"] == "burst" for c in ev["confetti"]) and ev["cues"][before:][-1:] in (["success"], ["celebrate"]), ev)
        dismiss_toast(page)

    # ==================================================================
    # 2. Late: told gently, a soft sound, no confetti
    # ==================================================================
    print("\n==== Late ====")
    confetti_before = len(events(page)["confetti"])
    if plan["late"]:
        took, before = fill_and_submit(page, plan["late"]["id"])
        days = (date.fromisoformat(today) - date.fromisoformat(plan["late"]["dueDate"])).days
        t = toast(page)
        said = (t.locator("[data-field='reaction-text']").text_content() or "").strip() if t.count() else ""
        check(f"A sheet handed in {days} day(s) after its day: ⏰ and how late", t.count() == 1 and said.endswith(f"submitted {days} day{'' if days == 1 else 's'} late."), said)
        page.wait_for_timeout(700)
        cheer = (t.locator("[data-field='reaction-cheer']").text_content() or "").strip() if t.count() and t.locator("[data-field='reaction-cheer']").count() else ""
        check("...the cheer line is gentle, never a scolding: 'Done — … late this time'", cheer.startswith("💪 Done — ") and "late this time" in cheer, cheer)
        new_cues = events(page)["cues"][before:]
        check("...the soft 'late' sound", "late" in new_cues and "success" not in new_cues, new_cues)
        dismiss_toast(page)
    else:
        print("[INFO] No earlier Production sheet is open this month; the late reaction is announced as the app announces it.")
        before = len(events(page)["cues"])
        three_ago = (date.fromisoformat(today) - timedelta(days=3)).isoformat()
        dispatch(page, {"kind": "submitted", "what": "F/PRD Test sheet", "dueDate": three_ago, "on": today, "asRequired": False, "documentId": PRD_DOCS[0]})
        page.wait_for_timeout(700)
        check("Late: the soft 'late' sound", "late" in events(page)["cues"][before:], events(page)["cues"][before:])
        dismiss_toast(page)
    check("...and no confetti for a late one", len(events(page)["confetti"]) == confetti_before, events(page)["confetti"][confetti_before:])

    # ==================================================================
    # 3. The Dashboard's day card
    # ==================================================================
    print("\n==== The day card ====")
    open_page(page, "#/dashboard", settle=1200)
    close_assistant(page)
    try:
        page.wait_for_selector("[data-section='my-day']:not([data-state='loading'])", timeout=8000)
    except Exception:
        pass
    card = page.locator("[data-section='my-day']")
    check("The Dashboard opens with the person's own day at the top", card.count() == 1 and card.get_attribute("data-state") != "loading", card.count())
    if card.count():
        text = card.inner_text()
        check("...greeting them by their first name", FIRST_NAME in text, text[:200])
        check("...with a ring of today's work (an SVG) and its count", card.locator(".my-day-ring svg circle").count() == 2 and card.locator("[data-field='my-day-count']").count() == 1, card.locator("[data-field='my-day-count']").all_text_contents())
        check("...the streak 🔥 and the month's on-time share, each in an element of its own", "🔥" in (card.locator("[data-field='my-day-streak']").text_content() or "") and card.locator("[data-field='my-day-ontime']").count() == 1)
        check("...and why it matters, not only the score (a purpose line)", len((card.locator("[data-field='my-day-purpose']").text_content() or "").strip()) > 20)
        check("...never printed, and never wider than the page", "no-print" in (card.get_attribute("class") or "") and page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
        check_day_score(card, "The day card")
        nxt = card.locator("[data-action='my-day-next']")
        if working and plan["last"]:
            check("...the next thing to do is offered as a button: 'Go to the next one'", nxt.count() == 1 and "Go to the next one" in (nxt.text_content() or ""), card.inner_text()[:300])
            if nxt.count():
                nxt.click()
                page.wait_for_timeout(1200)
                check("...which goes to it: the last Production sheet due today", page.url.endswith(f"#/record/{plan['last']}"), page.url)
        else:
            print("[INFO] Nothing is left due today, so the card offers no next record.")

    # ==================================================================
    # 4. The last one due today: the big celebration
    # ==================================================================
    print("\n==== All done ====")
    ev0 = events(page)
    cues_before, says_before, confetti_before = len(ev0["cues"]), len(ev0["says"]), len(ev0["confetti"])
    if working and plan["last"]:
        took, _ = fill_and_submit(page, plan["last"])
        t = toast(page)
        bonus = (t.locator("[data-field='reaction-bonus']").text_content() or "") if t.count() and t.locator("[data-field='reaction-bonus']").count() else ""
        check("The last sheet due today: the toast says so, 🌟 'last one due today', as before", "🌟" in bonus and "last one due today" in bonus, bonus)
    else:
        print("[INFO] A closed day: the last-one-due reaction is announced as the app announces it.")
        dispatch(page, {"kind": "submitted", "what": "F/PRD Test sheet", "dueDate": today, "on": today, "asRequired": False, "lastOneDue": True, "documentId": PRD_DOCS[1]})
    try:
        page.wait_for_selector("[data-section='mitra-celebration']", timeout=3000)
    except Exception:
        pass
    done = page.locator("[data-section='mitra-celebration']")
    check("The all-done card appears under the top bar", done.count() == 1)
    if done.count():
        title = done.locator("[data-field='celebration-title']").text_content() or ""
        check("...'🌟 All done for today' with the person's first name", "All done for today" in title and FIRST_NAME in title, title)
        streak = done.locator("[data-field='celebration-streak']")
        check("...the streak 🔥 in an element of its own", streak.count() == 1 and "🔥" in (streak.text_content() or ""), streak.all_text_contents())
        score = done.locator("[data-field='celebration-score']")
        score_text = (score.text_content() or "").strip() if score.count() else ""
        check(
            "...today's score at its best, in an element of its own: 'Today's score: 0 — nothing missing' (data-score 0)",
            score.count() == 1 and score.get_attribute("data-score") == "0" and score_text.startswith("Today's score: 0") and "nothing missing" in score_text,
            score_text,
        )
        body = done.inner_text()
        check("...naming no document and no module", not any(w in body for w in ("F/PRD", "Process Parameter", "ALC", "Production", "Lamination")), body)
        box = done.bounding_box() or {}
        check(
            "...a status, not a dialog: no-print, takes no clicks, inside the viewport, outside the page's content",
            done.get_attribute("role") == "status"
            and "no-print" in (done.get_attribute("class") or "")
            and done.evaluate("el => getComputedStyle(el).pointerEvents") == "none"
            and done.evaluate("el => !el.closest('.app-content') && !el.closest('.modal-box')")
            and box.get("x", -1) >= 0
            and box.get("x", 0) + box.get("width", 9999) <= 1500,
            box,
        )
        check("...only its own close button takes a click", done.locator("[data-action='close-celebration']").evaluate("el => getComputedStyle(el).pointerEvents") == "auto")
    ev = events(page)
    check("The 'celebrate' sound is asked for", "celebrate" in ev["cues"][cues_before:], ev["cues"][cues_before:])
    spoken = [s for s in ev["says"][says_before:] if (s.get("key") or "") == f"all-done:{today}"]
    check("Mitra says so aloud, once a day (key all-done:<date>), with the first name", len(spoken) == 1 and FIRST_NAME in (spoken[0].get("text") or "") and (spoken[0].get("en") or ""), ev["says"][says_before:])
    rain = [c for c in ev["confetti"][confetti_before:] if c["kind"] == "rain"]
    check("Confetti falls across the screen - in a layer that takes no clicks", len(rain) == 1 and rain[0]["pointerEvents"] == "none" and not rain[0]["wider"], ev["confetti"][confetti_before:])
    settings = stored(page, "settings") or {}
    check("Today's celebration is remembered for the person, so it is not repeated", (settings.get("celebratedToday") or {}).get("date") == today, settings.get("celebratedToday"))
    dismiss_toast(page)

    # ==================================================================
    # 5. It never blocks a click; its close button puts it away
    # ==================================================================
    print("\n==== Never in the way ====")
    page.set_viewport_size({"width": 390, "height": 844})
    open_page(page, "#/dashboard", settle=1400)
    close_assistant(page)
    try:
        page.wait_for_selector("[data-section='my-day']:not([data-state='loading'])", timeout=8000)
    except Exception:
        pass
    phone_card = page.locator("[data-section='my-day']")
    if phone_card.count():
        # The day handed in above: the score now counts nothing missing (0) when the ring says all done.
        check_day_score(phone_card, "On a phone, after the day's work")
        sbox = phone_card.locator(".my-day-score").bounding_box() or {}
        check("...the score fits a phone's screen", sbox.get("x", -1) >= 0 and sbox.get("x", 0) + sbox.get("width", 9999) <= 390, sbox)
    dispatch(page, {"kind": "submitted", "what": "F/PRD Test sheet", "dueDate": today, "on": today, "asRequired": False, "lastOneDue": True})
    try:
        page.wait_for_selector("[data-section='mitra-celebration']", timeout=3000)
    except Exception:
        pass
    done = page.locator("[data-section='mitra-celebration']")
    check("On a phone the card fits the screen, and the page does not scroll sideways", done.count() == 1 and page.evaluate("document.documentElement.scrollWidth <= 390"), page.evaluate("document.documentElement.scrollWidth"))
    if done.count():
        box = done.bounding_box()
        # A button of the page itself that the card is drawn over.
        target = page.evaluate(
            """(b) => {
                 const hit = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > b.y + 4 && r.top < b.y + b.height - 4 && r.right > b.x + 4 && r.left < b.x + b.width - 44; };
                 const el = Array.from(document.querySelectorAll('.app-content button, .app-content a[href]')).find(hit);
                 if (!el) return null;
                 el.setAttribute('data-e2e-beneath', '1');
                 const r = el.getBoundingClientRect();
                 const x = Math.max(r.left, b.x + 4) + 2, y = Math.max(r.top, b.y + 4) + 2;
                 const top = document.elementFromPoint(x, y);
                 return { text: (el.textContent || '').trim().slice(0, 40), hitsCard: !!(top && top.closest("[data-section='mitra-celebration']")) };
               }""",
            box,
        )
        if target:
            check(f"A click on the page beneath the card goes through to it ('{target['text']}')", not target["hitsCard"], target)
            url_before = page.url
            clicked = True
            try:
                page.locator("[data-e2e-beneath='1']").first.click(timeout=4000)
            except Exception as e:
                clicked = False
                print("    ", str(e)[:300])
            page.wait_for_timeout(600)
            check("...and Playwright can press it while the card shows", clicked, (url_before, page.url))
        else:
            centre = page.evaluate(
                """(b) => { const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!(el && el.closest("[data-section='mitra-celebration']")); }""",
                box,
            )
            check("The card's middle lets a click through to what is beneath it", centre is False)
    # Left alone, it goes by itself.
    open_page(page, "#/dashboard", settle=900)
    dispatch(page, {"kind": "submitted", "what": "F/PRD Test sheet", "dueDate": today, "on": today, "asRequired": False, "lastOneDue": True})
    page.wait_for_timeout(1000)
    shown = page.locator("[data-section='mitra-celebration']").count()
    page.wait_for_timeout(8800)
    check("Left alone, the card goes by itself within nine seconds, the confetti with it", shown == 1 and page.locator("[data-section='mitra-celebration'], [data-section='mitra-confetti']").count() == 0, shown)
    # Its own close button.
    dismiss_toast(page)
    dispatch(page, {"kind": "submitted", "what": "F/PRD Test sheet", "dueDate": today, "on": today, "asRequired": False, "lastOneDue": True})
    try:
        page.wait_for_selector("[data-action='close-celebration']", timeout=3000)
        page.click("[data-action='close-celebration']")
        page.wait_for_timeout(300)
    except Exception as e:
        print("    ", str(e)[:300])
    check("Its close button puts the card away at once", page.locator("[data-section='mitra-celebration']").count() == 0)
    page.set_viewport_size({"width": 1500, "height": 1000})

    # ==================================================================
    # 6. Reduced motion: no confetti at all
    # ==================================================================
    print("\n==== Reduced motion ====")
    page.emulate_media(reduced_motion="reduce")
    open_page(page, "#/dashboard", settle=900)
    ev0 = events(page)
    dispatch(page, {"kind": "submitted", "what": "F/PRD Test sheet", "dueDate": today, "on": today, "asRequired": False})
    page.wait_for_timeout(800)
    ev = events(page)
    check("With reduced motion asked for there is no confetti, and the sound is still asked for", len(ev["confetti"]) == len(ev0["confetti"]) and len(ev["cues"]) > len(ev0["cues"]), (ev["confetti"][len(ev0["confetti"]):], ev["cues"][len(ev0["cues"]):]))
    page.emulate_media(reduced_motion="no-preference")
    dismiss_toast(page)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nMitra cheers work done on time, is gentle about work done late, celebrates the whole day done - and never gets in the way.")
