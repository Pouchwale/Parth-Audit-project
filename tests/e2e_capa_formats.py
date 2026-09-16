"""The codes this plant writes on its CAPA paperwork, and the CAPA summary.

Drives the real UI against the production build on :8842, network-independent
(the assistant's plain-words edits are understood locally):

  * the complaint number is the plant's own — the two calendar years and a
    three-digit count (26-27/001) — put on a new complaint by the app itself,
    the next complaint taking the next number, and still editable: a bare "7"
    typed over it becomes 26-27/007;
  * a Job Code / FG code reads like FGSL3877 and a PO No. is eight digits:
    typed loosely they are tidied, typed wrongly the form says what the format
    is (and blocks Submit, engine/validation.ts);
  * the assistant is held to the same formats, whether asked in plain words or
    walking a new complaint through — it tidies what it is told, and refuses
    what doesn't fit with the reason instead of writing it;
  * asking the assistant for a CAPA summary answers for both sides — internal
    findings and customer complaints — or for one side when named;
  * the language control lives in the top bar only (it is no longer beside the
    Dashboard's Open Calendar);
  * External CAPA is mandatory section by section: the walk-through offers no
    way to skip an activity or a section, finishes one before starting the next,
    and Submit is refused while anything is blank, naming what is left;
  * and it is answered ONE ACTIVITY AT A TIME (13-Sep-2026): the checklist waits
    on the first blank activity and everything after it is locked on the form —
    tick, date, comment and N/R all — until that one is answered; an answered
    activity stays open so a mistake can be put right, and clearing one closes
    what followed it again. A change the assistant proposes is held to the same
    order: the model's reply is stubbed here (no network) so the refusal itself
    can be checked, not just its outcome;
  * the assistant asks for a review before it submits anything.

All of it is the department's rule of 12-Sep-2026 — engine/documentFormats.ts.
"""
import copy
import re
import sys
import time
from datetime import date
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

BASE = "http://localhost:8842"
FAILURES = []
# "26-27" through 2026; it changes on 1 January.
YY = date.today().year % 100
YEAR_PART = f"{YY:02d}-{(YY + 1) % 100:02d}"


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:600])


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


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def stored(page, rid):
    return next(r for r in records(page) if r["id"] == rid)["data"]


def composer(page):
    return page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")


def say(page, text):
    """Type a sentence to the assistant and return its reply."""
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(300)
    composer(page).fill(text)
    composer(page).press("Enter")
    page.wait_for_timeout(900)
    return page.locator(".chat-msg.bot").last.inner_text()


def new_complaint(page):
    page.goto(f"{BASE}/index.html#/gap/external")
    page.wait_for_timeout(600)
    page.click("button:has-text('New Complaint')")
    page.wait_for_timeout(1100)
    return page.url.split("/complaint/")[-1]


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950})
    # Offline: Gujarati must never reach for Google here.
    page.route("**/translate_a/**", lambda route: route.abort())
    page.on("pageerror", lambda e: FAILURES.append(f"page error: {e}"))
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    page.click("text=Sign up")
    page.fill("#signup-name", "Format QA")
    page.fill("#signup-email", f"formats-{int(time.time()*1000)}@example.com")
    page.fill("#signup-password", "PlaywrightQA123")
    page.fill("#signup-confirm", "PlaywrightQA123")
    page.click("button:has-text('Create Account')")
    page.wait_for_timeout(1200)
    dismiss(page)

    # ---- one language control, in the top bar ----
    check(
        "The Dashboard has no language buttons of its own, and the top bar still offers both languages",
        page.locator(".dash-language").count() == 0 and page.locator(".lang-select option").count() == 2,
    )

    # ---- the app numbers a new complaint itself ----
    first = new_complaint(page)
    check("A new complaint is numbered for this year", stored(page, first)["complaintNo"] == f"{YEAR_PART}/001", stored(page, first)["complaintNo"])
    second = new_complaint(page)
    check("...and the next one takes the next number", stored(page, second)["complaintNo"] == f"{YEAR_PART}/002", stored(page, second)["complaintNo"])
    close_assistant(page)

    # ---- the coded fields are tidied, and say what the format is ----
    page.fill("input[data-field='jobCode']", "fgsl 3877")
    page.locator("input[data-field='customerName']").click()  # blur tidies it
    page.wait_for_timeout(900)
    check("A job code typed loosely is tidied to the plant's format", stored(page, second)["jobCode"] == "FGSL3877", stored(page, second)["jobCode"])
    page.fill("input[data-field='jobCode']", "ABC12")
    page.wait_for_timeout(500)
    check(
        "A job code that doesn't fit says what the format is",
        page.locator("[data-problem='jobCode']").count() == 1 and "FGSL3877" in page.locator("[data-problem='jobCode']").inner_text(),
        page.locator("[data-problem='jobCode']").all_inner_texts(),
    )
    page.fill("input[data-field='jobCode']", "FGPO1234")
    page.wait_for_timeout(500)
    check("...and the message goes when it fits", page.locator("[data-problem='jobCode']").count() == 0)
    page.fill("input[data-field='poNo']", "123")
    page.wait_for_timeout(500)
    check("A PO No. must be eight digits", page.locator("[data-problem='poNo']").count() == 1)
    page.fill("input[data-field='poNo']", "10004321")
    page.wait_for_timeout(500)
    check("...and eight digits is accepted", page.locator("[data-problem='poNo']").count() == 0)
    page.fill("input[data-field='complaintNo']", "7")
    page.locator("input[data-field='customerName']").click()
    page.wait_for_timeout(900)
    check(
        "A bare number typed over the complaint number becomes this year's",
        stored(page, second)["complaintNo"] == f"{YEAR_PART}/007",
        stored(page, second)["complaintNo"],
    )

    # ---- Submit is blocked while a code doesn't fit ----
    page.fill("input[data-field='poNo']", "123")
    page.wait_for_timeout(900)
    submit = page.locator("button:has-text('Submit')")
    if submit.count():
        submit.first.click()
        page.wait_for_timeout(700)
        body = page.locator(".app-content").inner_text()
        check("Submit is refused while the PO No. doesn't fit, and says why", "eight digits" in body, body[:300])
    page.fill("input[data-field='poNo']", "")
    page.wait_for_timeout(800)

    # ---- the assistant writes them the same way ----
    page.goto(f"{BASE}/index.html#/gap/internal")
    page.wait_for_timeout(600)
    page.click("[data-action='new-complaint-ack']")
    page.wait_for_timeout(900)
    caf = page.url.split("/record/")[-1]
    reply = say(page, "fg code is fgsl3877")
    check("The assistant writes an FG code in the plant's format", stored(page, caf)["fgCode"] == "FGSL3877", reply)
    reply = say(page, "fg code is ABC12")
    check(
        "...and refuses one that doesn't fit, with the reason, leaving the good one",
        stored(page, caf)["fgCode"] == "FGSL3877" and "FGSL3877" in reply,
        reply,
    )
    close_assistant(page)

    # ---- the walk-through holds them to the format too ----
    third = new_complaint(page)
    check(
        "The walk-through still starts itself on a complaint that is only numbered",
        "Which customer" in page.locator(".chat-msg.bot").last.inner_text(),
        page.locator(".chat-msg.bot").last.inner_text(),
    )
    say(page, "Gulab Oil And Food")
    page.locator(".chat-chip", has_text="Skip").last.click()  # job name (optional)
    page.wait_for_timeout(400)
    reply = say(page, "ABC12")
    check("The walk-through refuses a job code that doesn't fit, and asks again", "FGSL3877" in reply, reply)
    reply = say(page, "fgpo 1234")
    check("...and writes a tidied one onto the sheet", stored(page, third)["jobCode"] == "FGPO1234", reply)
    close_assistant(page)

    # ---- every section mandatory, activity by activity ----
    new_complaint(page)
    say(page, "Krishna Packaging")
    page.locator(".chat-chip", has_text=re.compile(r"^Skip$")).last.click()   # job name
    page.wait_for_timeout(400)
    page.locator(".chat-chip", has_text=re.compile(r"^Skip$")).last.click()   # job code
    page.wait_for_timeout(400)
    page.locator(".chat-chip", has_text=re.compile(r"^Skip$")).last.click()   # PO no.
    page.wait_for_timeout(400)
    page.locator(".chat-chip", has_text=re.compile(r"^Today$")).last.click()  # received date
    page.wait_for_timeout(700)
    intro = page.locator(".chat-msg.bot").last.inner_text()
    check("Section A says every activity has to be answered before the next section", "Every one has to be answered before the next section" in intro, intro)
    check("...and a section cannot be skipped any more", page.locator(".chat-chip", has_text="Skip this section").count() == 0)
    page.locator(".chat-chip", has_text=re.compile(r"^Let's go$")).last.click()
    page.wait_for_timeout(500)
    check(
        "...nor an activity: only real answers are offered",
        page.locator(".chat-chip", has_text=re.compile(r"^Skip$")).count() == 0,
        page.locator(".chat-chip").all_inner_texts(),
    )
    for _ in range(12):
        if "Section B" in page.locator(".chat-msg.bot").last.inner_text():
            break
        chips = page.locator(".chat-chip", has_text=re.compile(r"^Done today$"))
        if chips.count() == 0:
            page.wait_for_timeout(500)
            continue
        chips.last.click()
        page.wait_for_timeout(600)
    check("Section A finished takes it to Section B by itself", "Section B" in page.locator(".chat-msg.bot").last.inner_text())
    reply = say(page, "submit this record")
    check("The assistant asks for a review before it submits anything", "look over the form" in reply.lower(), reply)
    check("...and only submits once it has been checked", page.locator(".chat-chip", has_text=re.compile(r"I've checked it")).count() == 1)
    close_assistant(page)
    page.click("button:has-text('Submit')")
    page.wait_for_timeout(800)
    body = page.locator(".app-content").inner_text()
    check("Submit is refused while a section is unfinished, naming what is left", "is not finished" in body and "Section B" in body, body[:300])

    # ---- one activity at a time, on the form (13-Sep-2026) ----
    # The checklist waits on the first blank activity, reading A1 → E32, and
    # nothing after it can be answered until that one is.
    fourth = new_complaint(page)
    # A new complaint auto-starts the walk-through, which would read anything
    # typed below as the answer to the question on screen — this block fills the
    # form by hand instead, so stop it first.
    page.locator(".chat-chip", has_text="Stop the walk-through").last.click()
    page.wait_for_timeout(300)
    close_assistant(page)
    page.wait_for_timeout(300)
    check(
        "The form says which activity the checklist is waiting on",
        page.locator("[data-waiting-on='A1']").count() == 1,
        page.locator("[data-waiting-on]").all_inner_texts(),
    )
    check("A1 is open — it is the one to answer", page.locator("tr[data-activity='A1']").get_attribute("data-locked") is None)
    check(
        "...and every activity after it is locked, through to the last one in Section E",
        page.locator("tr[data-activity='A2'][data-locked='1']").count() == 1 and page.locator("tr[data-activity='E32'][data-locked='1']").count() == 1,
    )
    check(
        "...a locked activity cannot be answered any of the three ways",
        page.locator("tr[data-activity='A2'] input[data-field='done']").is_disabled()
        and page.locator("tr[data-activity='A2'] [data-field='not-required']").is_disabled()
        and page.locator("tr[data-activity='A2'] input[type='date']").is_disabled(),
    )
    check("...and the later sections say what has to be finished first", page.locator("[data-section-locked='B']").count() == 1)

    page.locator("tr[data-activity='A1'] input[data-field='done']").check()
    page.wait_for_timeout(800)
    check("Answering A1 opens A2", page.locator("tr[data-activity='A2']").get_attribute("data-locked") is None)
    check("...and only A2 — A3 is still locked", page.locator("tr[data-activity='A3'][data-locked='1']").count() == 1)
    check("...while A1 stays open, so a mistake can be put right", page.locator("tr[data-activity='A1'] input[data-field='done']").is_enabled())
    a1 = stored(page, fourth)["sections"][0]["items"][0]
    check("...and the answer carries its date", bool(a1["done"] and a1["date"]), a1)

    page.locator("tr[data-activity='A2'] [data-field='not-required']").click()
    page.wait_for_timeout(800)
    a2 = stored(page, fourth)["sections"][0]["items"][1]
    check("N/R answers an activity that doesn't apply, with a note on it", bool(a2["notRequired"] and not a2["done"] and a2["comment"]), a2)
    check("...and that opens the next one", page.locator("tr[data-activity='A3']").get_attribute("data-locked") is None)
    # Pressed again it takes its own note back, so the activity is blank again
    # rather than answered on a comment nobody typed.
    page.locator("tr[data-activity='A2'] [data-field='not-required']").click()
    page.wait_for_timeout(800)
    a2 = stored(page, fourth)["sections"][0]["items"][1]
    check("Pressing N/R again clears it, note and all", not a2["notRequired"] and not a2["comment"].strip(), a2)
    check("...so A3 is locked again", page.locator("tr[data-activity='A3'][data-locked='1']").count() == 1)
    page.locator("tr[data-activity='A2'] [data-field='not-required']").click()
    page.wait_for_timeout(800)

    page.locator("tr[data-activity='A1'] input[data-field='done']").uncheck()
    page.wait_for_timeout(800)
    check("Clearing A1's answer makes the checklist wait on it again", page.locator("[data-waiting-on='A1']").count() == 1)
    check("...and closes the activities after it", page.locator("tr[data-activity='A3'][data-locked='1']").count() == 1)

    # ---- the assistant is held to the same order ----
    # A change it proposes goes through engine/recordPatch.ts, which puts back
    # any activity answered while an earlier one is blank. The model's reply is
    # stubbed with exactly such a change, so what is checked is the app's own
    # refusal — deterministically, and with no network call.
    today_iso = page.evaluate("() => new Date().toISOString().slice(0, 10)")

    def with_model_reply(sections, text, message):
        """Stub the model's reply with a whole-sections change, then send `message`."""
        page.route(
            "**/api/assistant/chat",
            lambda route: route.fulfill(status=200, json={"action": "fill", "patch": {"sections": sections}, "reply": text}),
        )
        try:
            return say(page, message)
        finally:
            page.unroute("**/api/assistant/chat")

    # In order — the activity the checklist is actually waiting on (A1) — is
    # applied, which is also what proves a whole-sections reply survives the
    # check at all (engine/recordPatch.ts matches id-less lists by position).
    ordered = copy.deepcopy(stored(page, fourth)["sections"])
    ordered[0]["items"][0].update({"done": True, "date": today_iso, "comment": "Details came with the complaint"})
    reply = with_model_reply(ordered, "Marked A1 as done today.", "mark the first activity as done today")
    a1 = stored(page, fourth)["sections"][0]["items"][0]
    check("The assistant can answer the activity the checklist is waiting on", bool(a1["done"] and a1["comment"].strip()), (reply, a1))
    check("...and the rest of the checklist is left as it was", stored(page, fourth)["sections"][0]["items"][0]["activity"].startswith("Complaint details requested"), stored(page, fourth)["sections"][0]["items"][0])

    # Out of order — the last activity in Section E, with A3 still blank — is
    # put back, and the reason said.
    jump = copy.deepcopy(stored(page, fourth)["sections"])
    jump[-1]["items"][-1].update({"done": True, "date": today_iso, "comment": "Closed in system"})
    reply = with_model_reply(jump, "Marked the last activity as done today.", "mark the last activity as done today")
    check("A change that jumps ahead is refused, with the reason", "one activity at a time" in reply, reply)
    e32 = stored(page, fourth)["sections"][-1]["items"][-1]
    check("...and that activity is left exactly as it was", not e32["done"] and not e32["comment"].strip(), e32)

    # ---- the CAPA summary, when the user asks for it ----
    page.goto(f"{BASE}/index.html#/dashboard")
    page.wait_for_timeout(600)
    dismiss(page)
    reply = say(page, "give me the CAPA summary")
    check(
        "Asking for a CAPA summary answers for both sides",
        "Internal —" in reply and "External —" in reply and "complaint" in reply.lower(),
        reply,
    )
    check("...and offers a way into each", page.locator(".chat-chip", has_text="Open External CAPA").count() >= 1)
    reply = say(page, "external capa summary")
    check("...or just one side when it is named", "External —" in reply and "Internal —" not in reply, reply)

    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nAll CAPA format checks passed.")
