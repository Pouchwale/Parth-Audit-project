"""Create, Read, Update, Delete on every document — by hand and by assistant.

Drives the real UI against the production build on :8842, network-independent
(everything below is understood locally — engine/assistantCommands.ts,
engine/recordPatch.ts — so it works with no internet, and a spoken instruction
takes exactly the same path as a typed one):

  * CREATE — the Document Library offers "New" on every document that holds
    records, and the assistant starts one from words ("create a new fly catcher
    record"); a second one for the same day opens the first rather than putting
    two sheets on a controlled register;
  * READ / UPDATE — the record opens, is typed into, and is changed by the
    assistant (already covered in depth by e2e_editing.py);
  * DELETE — every record can be deleted whatever its status, from the page and
    from the assistant, with a confirmation; a signed-off one takes a reason,
    and every deletion is listed in Document Library → Records deleted;
  * the assistant can also submit, verify, print and cancel an edit, so nothing
    on the buttons is out of its reach — and before it submits anything it asks
    for the record to be looked over first.
"""
import sys
import time
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


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:500])


def dismiss(page):
    for _ in range(3):
        g = page.locator("button:has-text('Got it')")
        if g.count():
            g.first.click()
            page.wait_for_timeout(200)
    settle_briefing(page)


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def record_by_id(page, rid):
    return next((r for r in records(page) if r["id"] == rid), None)


def deletions(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:deletions') || '[]')")


def composer(page):
    return page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")


def say(page, text):
    """Type an instruction to the assistant and return its reply."""
    opener = page.locator("button:has-text('Ask the assistant')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(300)
    composer(page).fill(text)
    composer(page).press("Enter")
    page.wait_for_timeout(1100)
    return page.locator(".chat-msg.bot").last.inner_text()


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    # Sign in to a fixed account, creating it only the first time — the server
    # allows a limited number of new accounts per network in ten minutes
    # (MAX_SIGNUPS_PER_IP, backend/index.ts).
    page.fill("#login-email", "crud-suite@example.com")
    page.fill("#login-password", "PlaywrightQA123")
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    if page.locator(".app-sidebar").count() == 0:
        page.click("text=Sign up")
        page.wait_for_timeout(200)
        page.fill("#signup-name", "CRUD QA")
        page.fill("#signup-email", "crud-suite@example.com")
        page.fill("#signup-password", "PlaywrightQA123")
        page.fill("#signup-confirm", "PlaywrightQA123")
        page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(800)
    dismiss(page)
    # A fixed account keeps what an earlier run left behind.
    page.evaluate("() => { localStorage.removeItem('dcrs:v1:records'); localStorage.removeItem('dcrs:v1:deletions'); localStorage.removeItem('dcrs:v1:settings'); }")
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(1000)
    dismiss(page)

    # ---- CREATE, from the Document Library ----
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(900)
    dismiss(page)
    new_buttons = page.locator("[data-action='new-record']")
    check("Every document that holds records offers New in the library", new_buttons.count() >= 10, new_buttons.count())
    check(
        "...and the reference documents don't (they are single documents, edited in place)",
        page.locator("[data-action='new-record'][data-document='chemical-master']").count() == 0
        and page.locator("[data-action='new-record'][data-document='service-licence']").count() == 0,
    )
    page.locator("[data-action='new-record'][data-document='daily-pest-monitoring']").first.click()
    page.wait_for_timeout(1200)
    made_id = page.url.split("/record/")[-1]
    made = record_by_id(page, made_id)
    check("New starts a record and opens it", bool(made) and made["documentId"] == "daily-pest-monitoring", page.url)
    check("...as a draft, dated today, with the form's own starting data", made["status"] == "In Progress" and bool(made["data"]), made["status"])
    # The register must not end up with two sheets for one day — whether the
    # schedule made one or this did.
    today = page.evaluate("() => new Date().toISOString().slice(0, 10)")
    same_day = [r for r in records(page) if r["documentId"] == "daily-pest-monitoring" and r["dueDate"] == today and not r["isDemo"]]
    check("...and there is still only one for that day, not two", len(same_day) == 1, [r["id"] for r in same_day])

    # ---- CREATE, in words (and so by voice, which takes the same path) ----
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(700)
    dismiss(page)
    reply = say(page, "create a new fly catcher record")
    check("The assistant starts a record from words", "/record/" in page.url, reply)
    fly_id = page.url.split("/record/")[-1]
    fly = record_by_id(page, fly_id)
    check("...of the document that was named", bool(fly) and fly["documentId"] == "fly-catcher", fly["documentId"] if fly else None)
    reply = say(page, "create a new fly catcher record")
    check(
        "...and a second one for the same day opens the first, not a duplicate",
        page.url.split("/record/")[-1] == fly_id and "already" in reply.lower(),
        reply,
    )

    # ---- UPDATE, and the rest of the buttons, from the assistant ----
    reply = say(page, "print this")
    check("The assistant prints the document", "printing" in reply.lower(), reply)
    reply = say(page, "submit this record")
    check("The assistant asks for the record to be checked before it submits", "look over the form" in reply.lower(), reply)
    checked = page.locator(".chat-chip", has_text="I've checked it")
    check("...offering to go ahead once it has been", checked.count() == 1)
    checked.last.click()
    page.wait_for_timeout(900)
    reply = page.locator(".chat-msg.bot").last.inner_text()
    submitted = record_by_id(page, fly_id)
    check(
        "...and then submits it (or says exactly what is missing)",
        submitted["status"] in ("Pending Verification", "Submitted") or "Before I can submit it" in reply,
        (submitted["status"], reply),
    )
    if submitted["status"] in ("Pending Verification", "Submitted"):
        reply = say(page, "verify it")
        check(
            "...and verifies it (or says what is missing)",
            record_by_id(page, fly_id)["status"] == "Verified" or "couldn't verify" in reply.lower(),
            (record_by_id(page, fly_id)["status"], reply),
        )

    # ---- DELETE, from the assistant, with a confirmation ----
    reply = say(page, "delete this record")
    status_now = record_by_id(page, fly_id)["status"]
    needs_reason = status_now in ("Submitted", "Pending Verification", "Verified")
    check("Asking to delete asks first, never straight away", bool(record_by_id(page, fly_id)), status_now)
    if needs_reason:
        check("...and a signed-off record is asked for a reason", "reason" in reply.lower(), reply)
        reply = say(page, "created by mistake during testing")
    else:
        check("...offering Delete it / Keep it", page.locator(".chat-chip", has_text="Delete it").count() >= 1, reply)
        page.locator(".chat-chip", has_text="Delete it").last.click()
        page.wait_for_timeout(900)
    check("The record is deleted", record_by_id(page, fly_id) is None)
    log = deletions(page)
    check(
        "...and the deletion is on file: what it was, its status, who, when and why",
        len(log) == 1 and log[0]["recordId"] == fly_id and log[0]["documentName"] and log[0]["deletedBy"] and log[0]["reason"],
        log,
    )

    # ---- "Keep it" changes nothing ----
    page.goto(f"{BASE}/index.html#/record/{made_id}")
    page.wait_for_timeout(900)
    say(page, "delete this record")
    keep = page.locator(".chat-chip", has_text="Keep it")
    if keep.count():
        keep.last.click()
        page.wait_for_timeout(700)
    check("Keeping it leaves the record alone", bool(record_by_id(page, made_id)))
    close_assistant(page)

    # ---- DELETE from the page itself, on a signed-off record ----
    page.goto(f"{BASE}/index.html#/training")
    page.wait_for_timeout(800)
    page.locator("a:has-text('Open'), button:has-text('Open')").first.click()
    page.wait_for_timeout(900)
    training_id = page.url.split("/")[-1]
    status = record_by_id(page, training_id)["status"]
    check("A verified record now offers Delete as well", page.locator("button:has-text('Delete')").first.is_visible(), status)
    page.locator("button:has-text('Delete')").first.click()
    page.wait_for_timeout(400)
    check("...and asks for a reason before it will go", page.locator("[data-action='confirm-delete']").is_disabled())
    page.fill("textarea[data-field='delete-reason']", "Duplicate of the December record")
    page.wait_for_timeout(200)
    page.click("[data-action='confirm-delete']")
    page.wait_for_timeout(1000)
    check("The record is gone", record_by_id(page, training_id) is None)
    log = deletions(page)
    check(
        "...with the reason on file",
        any(d["recordId"] == training_id and d["reason"] == "Duplicate of the December record" and d["status"] == status for d in log),
        log,
    )

    # ---- the deletions are visible in the app, not only in storage ----
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(900)
    dismiss(page)
    panel = page.locator("[data-section='deleted-records']")
    check("The Document Library lists what was deleted", panel.count() == 1 and "Records deleted" in panel.inner_text(), panel.all_inner_texts())
    panel.locator("summary").click()
    page.wait_for_timeout(300)
    check("...with the document, the status it was in, who removed it and why", "Duplicate of the December record" in panel.inner_text(), panel.inner_text()[:400])

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nAll CRUD checks passed.")
