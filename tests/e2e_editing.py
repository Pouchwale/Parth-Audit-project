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
import re
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

    # The record holds only its known parts (REQUIREMENTS s98: the assistant
    # prepares the record, its date and the printed check points, never an
    # answer), and on a closed day the next working day's record is not even
    # prepared yet. So it is filled with Mitra's sample data first - this suite
    # is about editing, not about the readings, and the test server allows sample
    # data in a Live record (ALLOW_SAMPLE_FILL=1) - a state that can be submitted
    # and verified below.
    if True:
        # Mitra waits to be asked on a record (s123, amending s60): the pill opens it, unless it is open already.
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
    # Mitra waits to be asked on a record (s123, amending s60): the pill opens it, unless it is open already.
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

    # THE RODENT STATION'S ID IS THE PLANT'S OWN TO WRITE (REQUIREMENTS s134, the owner, 28-Oct-2026: "make rodent Station
    # id editable"): a new station is numbered RBS-01, RBS-02 ..., not a made-up code, and its ID is a box to type into.
    page.locator(".pill-tab:has-text('Rodent Stations')").first.click()
    page.wait_for_timeout(300)
    stations = page.locator(".doc-table tbody tr")
    before_add = stations.count()
    page.click("button:has-text('Add Row')")
    page.wait_for_timeout(400)
    station_id = page.locator(".doc-table tbody tr").last.locator("input").first
    added = station_id.input_value() if station_id.count() else None
    check(
        "A new rodent station is numbered as a plant numbers its stations (RBS-01, RBS-02 ...), in a box to type into",
        page.locator(".doc-table tbody tr").count() == before_add + 1 and added is not None and re.fullmatch(r"RBS-\d{2,}", added) is not None,
        added,
    )
    station_id.fill("RBS-07")
    page.wait_for_timeout(400)
    page.reload()
    page.wait_for_timeout(800)
    dismiss(page)
    page.locator(".pill-tab:has-text('Rodent Stations')").first.click()
    page.wait_for_timeout(300)
    check("...and its Station ID, typed over, sticks", page.locator(".doc-table tbody tr").last.locator("input").first.input_value() == "RBS-07")

    # EVERY PRINTED WORD OF AN HR OR QC SHEET IS THE PERSON'S TO TYPE OVER ON THE RECORD (REQUIREMENTS s135, the owner,
    # 28-Oct-2026: "each and every document of HR and QC in that each and every single part make sure it is always
    # editable"): a line's printed words and the paper's text below the grid, the record's own once typed over; the
    # printout draws them as before; a verified record is locked as before.
    def new_record(doc):
        page.goto(f"{BASE}/index.html#/library")
        page.wait_for_timeout(900)
        dismiss(page)
        page.locator(f"[data-action='new-record'][data-document='{doc}']").first.evaluate("el => el.click()")
        page.wait_for_timeout(1600)
        dismiss(page)
        return page.url.split("#/record/")[-1]

    def type_over(locator, words):
        locator.click()
        page.keyboard.press("Control+A")
        page.keyboard.type(words)
        page.locator("h1, .page-title").first.click(force=True) if page.locator("h1, .page-title").count() else page.mouse.click(5, 5)
        page.wait_for_timeout(900)

    qc_id = new_record("qc-bopp-film")
    printed = page.locator("[data-print-doc] table tbody [data-editable-words]")
    check("F/QC/01 (a paper drawn in millimetres): its lines' printed words are there to type over on a new record", printed.count() >= 3, printed.count())
    if printed.count():
        cell = printed.first
        was = cell.inner_text().strip()
        type_over(cell, "Thickness as we test it")
        rows = (stored(page, qc_id) or {}).get("data", {}).get("rows", [])
        check(
            "...a line's printed words typed over are this record's own words for the line",
            any("Thickness as we test it" in str(v) for r in rows for v in r.values()),
            (was, [list(r.values())[:3] for r in rows[:2]]),
        )
        page.reload()
        page.wait_for_timeout(1500)
        dismiss(page)
        check("...and they stay after a reload", page.locator("[data-print-doc] table tbody [data-editable-words]", has_text="Thickness as we test it").count() == 1)
        page.evaluate("() => { window.print = () => {}; window.dispatchEvent(new Event('beforeprint')); }")
        page.emulate_media(media="print")
        outline = page.locator("[data-print-doc] [data-editable-words]").first.evaluate("(e) => getComputedStyle(e).outlineStyle")
        body = page.locator("[data-print-doc]").first.inner_text()
        page.emulate_media(media="screen")
        page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
        check("...printed as the paper's words, with no line or ring of the screen's", outline == "none" and "Thickness as we test it" in body, outline)

    # THE RECORD'S OWN DATE (REQUIREMENTS s136, the owner, 28-Oct-2026: "each and every document when i click then that date
    # is also editable"): typed over beside the status; the record moves to that day, with a line in its history.
    date_box = page.locator("[data-field='record-date'] input[type='date']")
    check("F/QC/01: the record's date is a box beside its status", date_box.count() == 1 and date_box.input_value() != "", date_box.count())
    if date_box.count():
        was = date_box.input_value()
        date_box.fill("2026-10-05")
        page.wait_for_timeout(900)
        moved = stored(page, qc_id) or {}
        check("...typed over, the record is dated that day, its place in the schedule with it, and its history says so",
              moved.get("dueDate") == "2026-10-05" and str(moved.get("periodKey", "")).endswith("2026-10-05")
              and any(any(c.get("field") == "dueDate" for c in (e.get("changes") or [])) for e in (moved.get("history") or [])),
              (was, moved.get("dueDate"), moved.get("periodKey")))

    # A CALIBRATION SHEET IS FILLED AS THE PLANT'S PAGES ARE THE MOMENT A PERSON OPENS IT (REQUIREMENTS s136): F/QC/17 read as
    # the master's at every point, in the opener's name, with a line in its history; the Difference and the Status follow.
    ruler_id = new_record("qc-ruler-verification")
    page.wait_for_timeout(800)
    opened = stored(page, ruler_id) or {}
    rows = opened.get("data", {}).get("rows", [])
    check(
        "F/QC/17 (600 mm), opened: Observed = the master's at every point, Difference 0.0, Status Pass, performed by the person who opened it",
        [r.get("observed") for r in rows] == [100, 200, 300, 400, 500, 490] and all(str(r.get("difference")) == "0.0" for r in rows)
        and rows[0].get("status") == "Pass" and rows[0].get("performedBy") == "Editing QA",
        [(r.get("observed"), r.get("difference"), r.get("status"), r.get("performedBy")) for r in rows],
    )
    check("...with a line in its history, in that person's name", any("on opening" in str(e.get("note", "")) and e.get("by") == "Editing QA" for e in (opened.get("history") or [])), [e.get("note") for e in (opened.get("history") or [])][-2:])
    first = page.locator("[data-print-doc] input[type='number']").first
    check("...every reading still a box to change", first.count() == 1 and first.is_editable(), first.count())
    check("...and no press to do it: it is done on opening", page.locator("[data-action='fill-nominal']").count() == 0)
    first.fill("101")
    page.wait_for_timeout(900)
    page.reload()
    page.wait_for_timeout(1500)
    dismiss(page)
    again = (stored(page, ruler_id) or {}).get("data", {}).get("rows", [])
    check("...a reading changed is kept when the sheet is opened again, not filled over", [r.get("observed") for r in again][:2] == [101, 200], [r.get("observed") for r in again])

    scale_id = new_record("qc-weight-scale-calibration")
    procedure = page.locator("[data-print-doc] [data-section='notes-below'] [data-editable-words]")
    check("F/QC/12: the PROCEDURE below its grid is there to type over too", procedure.count() >= 1, procedure.count())
    if procedure.count():
        type_over(procedure.first, "PROCEDURE: as our lab does it this week.")
        words = ((stored(page, scale_id) or {}).get("data", {}).get("words") or {}).get("notesBelow") or []
        check("...kept as this record's own text below the grid, the format's untouched", words[:1] == ["PROCEDURE: as our lab does it this week."], words)

    page.goto(f"{BASE}/index.html#/record/qc-gsm-plate-calibration-2024-12")
    page.wait_for_timeout(1500)
    dismiss(page)
    check(
        "A verified record (F/QC/11's page of 31.12.2024) is locked as before: no printed word to type over, its date read-only",
        page.locator("[data-print-doc]").count() >= 1 and page.locator("[data-print-doc] [data-editable-words]").count() == 0
        and page.locator("[data-field='record-date'] input").count() == 0,
    )
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nAll editing checks passed.")
