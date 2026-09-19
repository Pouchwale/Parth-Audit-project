"""Every record can be corrected — safely — by hand or by asking the assistant.

Drives the real UI, network-independent (the assistant's plain-words edits
are understood locally, engine/recordPatch.ts):

  * a manual edit is saved on its own (no Save button to forget) and
    written into the record's history as before -> after;
  * a verified record is locked, and offers "Correct this record", which
    needs a reason, reopens it, shows who/why, and keeps what it said before;
  * the assistant changes a field from a plain sentence, saves it, lists the
    change and can undo it;
  * on a verified record the assistant asks before reopening it, and changes
    nothing until the user says yes;
  * a Master Data row can be corrected in place, and deleting one takes two taps.
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

BASE = "http://localhost:8842"
FAILURES = []


# The company's working calendar (the Gujarat Print Pack Leave Calendar 2026,
# as tests/e2e_smoke.py has it): Thursday is the weekly off except on
# adjustment days, plus the festival holidays.
ADJUSTMENT_DAYS_2026 = {"2026-01-22", "2026-08-06", "2026-10-22", "2026-11-05", "2026-11-20"}
FESTIVAL_HOLIDAYS_2026 = {
    "2026-01-14", "2026-01-26", "2026-03-04", "2026-08-15", "2026-08-28", "2026-09-04", "2026-10-19", "2026-10-20",
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
}


def next_working_day(d):
    while d.isoformat() in FESTIVAL_HOLIDAYS_2026 or (d.weekday() == 3 and d.isoformat() not in ADJUSTMENT_DAYS_2026):
        d += timedelta(days=1)
    return d


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


def stored(page, rid):
    return page.evaluate("(id) => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').find(r => r.id === id)", rid)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950})
    page.on("pageerror", lambda e: FAILURES.append(f"page error: {e}"))
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    page.click("text=Sign up")
    page.fill("#signup-name", "Editing QA")
    page.fill("#signup-email", f"editing-{int(time.time()*1000)}@example.com")
    page.fill("#signup-password", "PlaywrightQA123")
    page.fill("#signup-confirm", "PlaywrightQA123")
    page.click("button:has-text('Create Account')")
    page.wait_for_timeout(1200)
    dismiss(page)

    # The next WORKING day's Live daily record. On a closed day - the Thursday
    # weekly off, a festival holiday - today's record is the holiday line, with
    # no checker to write, so the suite would fail on those days only.
    today = next_working_day(date.today()).isoformat()
    rid = page.evaluate(
        "(d) => (JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').find(r => r.documentId === 'daily-pest-monitoring' && !r.isDemo && r.dueDate === d) || {}).id",
        today,
    )
    check("The next working day's Live daily record exists", bool(rid))
    page.goto(f"{BASE}/index.html#/record/{rid}")
    page.wait_for_timeout(900)
    dismiss(page)

    # On a closed day the next working day's record isn't prepared yet (the
    # assistant prepares what is due today or earlier), so it is filled with the
    # assistant's sample data first - the state a prepared record is in, and one
    # that can be submitted and verified below.
    if today != date.today().isoformat():
        # Mitra opens by itself when a record is opened (s60); the pill exists only while closed.
        if page.locator("button:has-text('Ask Mitra')").count():
            page.click("button:has-text('Ask Mitra')")
        page.wait_for_timeout(400)
        mitra_box = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
        mitra_box.fill("fill it with sample data")
        mitra_box.press("Enter")
        page.wait_for_timeout(1500)
        page.click("button[aria-label='Close assistant']")
        page.wait_for_timeout(300)

    # ---- a manual edit saves itself, and is logged ----
    page.fill("input[placeholder='Name of checker']", "Vijay")
    page.wait_for_timeout(1400)
    check("The page says all changes are saved — no Save button to forget", page.locator("[data-save-state='saved']").count() == 1)
    r = stored(page, rid)
    check("The edit is stored without pressing Save", r["data"]["checker"] == "Vijay", r["data"].get("checker"))
    check(
        "The record's history holds the edit as before -> after (Checker -> Vijay)",
        any(h["action"] == "edited" and any(c["label"] == "Checker" and c["after"] == "Vijay" for c in h.get("changes", [])) for h in r.get("history") or []),
        r.get("history"),
    )

    # ---- submit, verify: locked ----
    page.click("button[data-action='submit']")
    page.wait_for_timeout(700)
    check("Submitted (Pending Verification)", stored(page, rid)["status"] == "Pending Verification", page.locator(".error-list").all_inner_texts())
    page.click("button[data-action='verify']")
    page.wait_for_timeout(700)
    check("Verified", stored(page, rid)["status"] == "Verified")
    check(
        "A verified record is locked and offers 'Correct this record' instead of Save / Submit",
        page.locator("button[data-action='submit']").count() == 0
        and page.locator("button[data-action='correct']").count() == 1
        and page.locator("input[placeholder='Name of checker']").is_disabled(),
    )

    # ---- correcting it ----
    page.click("button[data-action='correct']")
    page.wait_for_timeout(300)
    check("Reopening needs a reason first", page.locator("button[data-action='confirm-correct']").is_disabled())
    page.locator(".modal-box .chat-chip").first.click()
    page.wait_for_timeout(150)
    page.click("button[data-action='confirm-correct']")
    page.wait_for_timeout(700)
    r = stored(page, rid)
    check("Reopened: In Progress, with the reason recorded", r["status"] == "In Progress" and bool((r.get("correction") or {}).get("reason")), r.get("correction"))
    check("A banner says it is being corrected, by whom and why", page.locator("[data-section='correction-banner']").count() == 1)
    page.fill("input[placeholder='Name of checker']", "Roshni")
    page.wait_for_timeout(1400)
    page.click("[data-section='record-history'] summary")
    page.wait_for_timeout(300)
    history_text = page.locator("[data-section='record-history']").inner_text()
    check(
        "The history keeps the verification, the reopening and the correction's before/after",
        "Reopened for correction" in history_text and "Verified" in history_text and "Vijay" in history_text and "Roshni" in history_text,
        history_text[:500],
    )

    # ---- the assistant: a plain sentence, saved, listed, undoable ----
    # Mitra opens by itself when a record is opened (s60); the pill exists only while closed.
    if page.locator("button:has-text('Ask Mitra')").count():
        page.click("button:has-text('Ask Mitra')")
    page.wait_for_timeout(400)
    box = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
    before_time = stored(page, rid)["data"]["timeOfChecking"]
    # A time the pre-fill did not already write for today. The assistant's
    # pre-filled time of checking is seeded from the date (engine/autoFill.ts),
    # so a fixed one here fails on whichever day it happens to land on - and
    # "nothing on the form changed" would then look like a broken assistant.
    target, spoken = ("10:55", "10.55 am") if before_time != "10:55" else ("11:20", "11.20 am")
    box.fill(f"time of checking is {spoken}")
    box.press("Enter")
    page.wait_for_timeout(900)
    reply = page.locator(".chat-msg.bot").last.inner_text()
    r = stored(page, rid)
    check("The assistant changes a field from a plain sentence, saves it and lists the change", r["data"]["timeOfChecking"] == target and "Done" in reply and target in reply, reply)
    check("The history marks it as the assistant's change", any(h["action"] == "assistant-edit" for h in r.get("history") or []))
    page.locator(".chat-chip:has-text('Undo')").last.click()
    page.wait_for_timeout(700)
    check("Undo puts the old value back", stored(page, rid)["data"]["timeOfChecking"] == before_time)

    box.fill("check point 2 is maybe")
    box.press("Enter")
    page.wait_for_timeout(900)
    reply = page.locator(".chat-msg.bot").last.inner_text()
    check("A value the form can't hold is refused, with the reason", "Yes or No" in reply, reply)

    # ---- the assistant on a verified record asks first ----
    page.click("button[data-action='submit']")
    page.wait_for_timeout(600)
    page.click("button[data-action='verify']")
    page.wait_for_timeout(700)
    box.fill("checker is Vijay")
    box.press("Enter")
    page.wait_for_timeout(900)
    reply = page.locator(".chat-msg.bot").last.inner_text()
    check(
        "On a verified record the assistant asks before reopening it, and changes nothing yet",
        "reopen" in reply.lower() and page.locator(".chat-chip:has-text('Yes, correct it')").count() == 1 and stored(page, rid)["data"]["checker"] == "Roshni",
        reply,
    )
    page.locator(".chat-chip:has-text('Yes, correct it')").click()
    page.wait_for_timeout(900)
    r = stored(page, rid)
    check(
        "After 'Yes': reopened for correction, changed, and the user's words recorded as the reason",
        r["status"] == "In Progress" and r["data"]["checker"] == "Vijay" and (r.get("correction") or {}).get("reason") == "checker is Vijay",
        {"status": r["status"], "checker": r["data"]["checker"], "correction": r.get("correction")},
    )

    # ---- master data ----
    page.goto(f"{BASE}/index.html#/master-data")
    page.wait_for_timeout(600)
    page.locator(".pill-tab:has-text('Chemical')").first.click()
    page.wait_for_timeout(300)
    first = page.locator(".doc-table tbody tr").first.locator("input").first
    old_name = first.input_value()
    first.fill(old_name + " (corrected)")
    page.wait_for_timeout(300)
    page.reload()
    page.wait_for_timeout(700)
    dismiss(page)
    page.locator(".pill-tab:has-text('Chemical')").first.click()
    page.wait_for_timeout(300)
    check("A Master Data row can be corrected in place, and it sticks", page.locator(".doc-table tbody tr").first.locator("input").first.input_value() == old_name + " (corrected)")
    rows_before = page.locator(".doc-table tbody tr").count()
    page.locator(".doc-table tbody tr").first.locator("button[title='Delete this row']").click()
    page.wait_for_timeout(200)
    check("One tap on delete only asks", page.locator(".doc-table tbody tr").count() == rows_before and page.locator("button[data-action='confirm-delete']").count() == 1)
    page.click("button:has-text('Keep')")
    page.wait_for_timeout(200)
    check("'Keep' leaves the row", page.locator(".doc-table tbody tr").count() == rows_before)
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nAll editing checks passed.")
