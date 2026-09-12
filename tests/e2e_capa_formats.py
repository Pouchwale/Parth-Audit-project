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
  * the assistant asks for a review before it submits anything.

All of it is the department's rule of 12-Sep-2026 — engine/documentFormats.ts.
"""
import re
import sys
import time
from datetime import date
from playwright.sync_api import sync_playwright

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
    opener = page.locator("button:has-text('Ask the assistant')")
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
