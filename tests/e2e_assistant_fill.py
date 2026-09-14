"""The assistant fills a WHOLE document — question by question, or with sample data.

The department's request (13-Sep-2026): the assistant should act on the request,
not only answer it. "I want to fill the external CAPA" opens the document and
asks what to put where, one question at a time; "generate an external CAPA for
me with sample data" starts it and fills every field with realistic, made-up
values — and both work on every document, from the record itself, from the
library, or from the full-page Assistant.

Checked here, against the production build on :8842, with no network
(engine/assistantCommands.ts, engine/sampleFill.ts, engine/guidedRecord.ts):

  * a complaint checklist generated from words — in format, every activity
    answered with a date and a comment, prepared-by filled, approval left for
    the QA Head, the chat saying plainly that it is sample data — and it
    passes every submit check;
  * sample data on an open record, undoable;
  * a training record filled question by question, each answer saved with the
    assistant's history line, then handed back to be checked;
  * "I want to fill …" said where no record is open: the document opens and
    the first question is asked there;
  * the same from the full-page Assistant;
  * an ambiguous document name ("a CAPA record") is asked about, not guessed;
  * and every document that holds records, started from the library, filled
    with sample data and submitted — so the sample data is complete for each.
"""
import re
import sys
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
COMPLAINT_NO = re.compile(r"^\d{2}-\d{2}/\d{3}$")
FG_CODE = re.compile(r"^FG[A-Z]{2}\d{4}$")
PO_NO = re.compile(r"^\d{8}$")
HHMM = re.compile(r"^\d{2}:\d{2}$")


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


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def record_by_id(page, rid):
    return next((r for r in records(page) if r["id"] == rid), None)


def composer(page):
    return page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")


def last_bot(page):
    bots = page.locator(".chat-msg.bot")
    return bots.last.inner_text() if bots.count() else ""


def say(page, text, wait=1300):
    """Type an instruction to the floating assistant and return its latest reply."""
    opener = page.locator("button:has-text('Ask the assistant')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(300)
    composer(page).fill(text)
    composer(page).press("Enter")
    page.wait_for_timeout(wait)
    return last_bot(page)


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def open_record_id(page):
    return page.url.rstrip("/").split("/")[-1]


def submit_via_assistant(page, rid):
    """Ask the assistant to submit, go through its review step, and say whether it went."""
    reply = say(page, "submit this record")
    go = page.locator(".chat-chip", has_text="I've checked it")
    if go.count() == 0:
        return False, reply
    go.last.click()
    page.wait_for_timeout(900)
    rec = record_by_id(page, rid)
    return (rec is not None and rec["status"] in ("Pending Verification", "Submitted")), last_bot(page)


def answer_heuristically(page, question):
    """Answer the assistant's question the way a person would — a quick answer if one is offered, else a typed one."""
    q = question.lower()
    # Only the answers offered under the question itself — the widget's own
    # quick buttons below the log ("Stop the questions", "Today's briefing" …)
    # are not answers.
    rows = page.locator(".chat-log .chat-chips")
    chips = rows.last.locator(".chat-chip") if rows.count() else page.locator(".chat-log .chat-chip")
    labels = [chips.nth(i).inner_text() for i in range(chips.count())]
    answers = [l for l in labels if l not in ("Skip", "Stop for now")]
    if "who attended" in q:
        say(page, "Akash Patel, Meet Patel, Harsh Parmar")
    elif answers:
        chips.nth(labels.index(answers[0])).click()
        page.wait_for_timeout(700)
    elif "when" in q or "date" in q or "dated" in q:
        say(page, "today")
    elif "how many" in q or "number" in q:
        say(page, "3")
    elif "time" in q:
        say(page, "09:15")
    else:
        say(page, "Sample answer given by the test")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    # A fixed account, created only the first time (the server limits new
    # accounts per network — MAX_SIGNUPS_PER_IP, backend/index.ts).
    page.fill("#login-email", "fill-suite@example.com")
    page.fill("#login-password", "PlaywrightQA123")
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    if page.locator(".app-sidebar").count() == 0:
        page.click("text=Sign up")
        page.wait_for_timeout(200)
        page.fill("#signup-name", "Fill QA")
        page.fill("#signup-email", "fill-suite@example.com")
        page.fill("#signup-password", "PlaywrightQA123")
        page.fill("#signup-confirm", "PlaywrightQA123")
        page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(800)
    dismiss(page)
    page.evaluate(
        "() => { for (const k of ['dcrs:v1:records', 'dcrs:v1:deletions', 'dcrs:v1:settings', 'dcrs:v1:assistant-conversations']) localStorage.removeItem(k); }"
    )
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(1200)
    dismiss(page)

    # ---- 1. "generate an external CAPA for me" — from the library, where nothing is open ----
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(900)
    dismiss(page)
    reply = say(page, "generate an external CAPA for me with sample data", wait=2000)
    check("Asking for an external CAPA with sample data starts a complaint checklist and opens it", "/gap/complaint/" in page.url, (page.url, reply))
    cid = open_record_id(page)
    rec = record_by_id(page, cid)
    d = rec["data"] if rec else {}
    check("...numbered in the plant's format (26-27/001 …)", bool(rec) and COMPLAINT_NO.match(d.get("complaintNo", "") or ""), d.get("complaintNo"))
    check(
        "...with a customer, a job, a job code and a PO No., each in format",
        bool(rec) and d.get("customerName") and d.get("jobName") and FG_CODE.match(d.get("jobCode", "")) and PO_NO.match(d.get("poNo", "")),
        {k: d.get(k) for k in ("customerName", "jobName", "jobCode", "poNo")},
    )
    items = [it for s in d.get("sections", []) for it in s["items"]]
    check(
        "...every activity in every section answered — done on a date, or not required — with a comment",
        len(items) == 31 and all(((it["done"] and it["date"]) or it["notRequired"]) and it["comment"] for it in items),
        [(it["srNo"], it["done"], it["notRequired"], it["date"]) for it in items if not (((it["done"] and it["date"]) or it["notRequired"]) and it["comment"])],
    )
    today = page.evaluate("() => new Date().toISOString().slice(0, 10)")
    dates = [it["date"] for it in items if it["date"]]
    received = d.get("complaintReceivedDate")
    check(
        "...the dates run from the day the complaint was received and none is in the future",
        bool(received) and all(received <= x <= today for x in dates),
        (received, min(dates) if dates else None, max(dates) if dates else None, today),
    )
    check("...prepared-by is filled in and approval is left for the QA Head", bool(rec) and d.get("preparedBy", {}).get("name") and not d.get("approvedBy", {}).get("name"), d.get("preparedBy"))
    check("The chat says plainly that it is sample data, to be checked", "sample data" in reply.lower() and "check" in reply.lower(), reply)
    check("...and the record's history holds the assistant's fill", bool(rec) and any(h.get("action") == "assistant-edit" for h in rec.get("history", [])), [h.get("action") for h in rec.get("history", [])] if rec else None)
    ok, reply = submit_via_assistant(page, cid)
    check("The generated complaint passes every submit check", ok, reply)

    # ---- 2. Sample data on an open record, and Undo ----
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(700)
    dismiss(page)
    # A day before this browser's launch date: a shell the assistant never
    # prepared, so it is genuinely blank before the fill.
    reply = say(page, "create a new daily pest control monitoring record for 1 September", wait=1500)
    check("A record is started for the date named", "/record/" in page.url, (page.url, reply))
    did = open_record_id(page)
    before = record_by_id(page, did)["data"]
    reply = say(page, "fill it with sample data", wait=1500)
    d = record_by_id(page, did)["data"]
    filled = d.get("isHoliday") or (
        d.get("checker") and HHMM.match(d.get("timeOfChecking", "")) and all(str((d.get("checkpoints", {}).get(str(n)) or {}).get("value", "")) not in ("", "None") for n in range(1, 11))
    )
    check("On an open record, 'fill it with sample data' fills the whole form", bool(filled), (d.get("checker"), d.get("timeOfChecking"), d.get("checkpoints")))
    check("...and says so — sample data, to be checked, with Undo offered", "sample data" in reply.lower() and page.locator(".chat-chip", has_text=re.compile(r"^Undo$")).count() >= 1, reply)
    page.locator(".chat-chip", has_text=re.compile(r"^Undo$")).last.click()
    page.wait_for_timeout(800)
    check("Undo puts the form back exactly as it was", record_by_id(page, did)["data"] == before, record_by_id(page, did)["data"].get("checker"))

    # ---- 3. Question by question, on a training record ----
    # Dated earlier in the month, so the yearly document's sheet for today is
    # still free for the every-document pass below.
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(700)
    dismiss(page)
    reply = say(page, "create a new training record for 5 September", wait=1500)
    check("A new training record opens in the Training module", "/training/" in page.url, (page.url, reply))
    tid = open_record_id(page)
    reply = say(page, "ask me question by question")
    check("Asking to be taken through it starts the questions", reply.rstrip().endswith("?"), reply)
    check("...with quick answers and a way to stop", page.locator(".chat-chip", has_text="Stop for now").count() >= 1)
    asked = 0
    for _ in range(16):
        text = last_bot(page)
        if "That's everything" in text:
            break
        asked += 1
        answer_heuristically(page, text)
    text = last_bot(page)
    check("The questions come to an end", "That's everything" in text, (asked, text))
    rec = record_by_id(page, tid)
    d = rec["data"]
    check(
        "The answers are on the form — trainer, topics and who attended",
        # A name on the attendance sheet IS somebody who attended: the Attended
        # tick was withdrawn on 13-Sep-2026 (REQUIREMENTS §43).
        d.get("trainerProvider") and d.get("topics") and len(d.get("attendees", [])) > 0
        and all("attended" not in a for a in d.get("attendees", [])),
        {k: d.get(k) for k in ("trainingType", "trainerProvider")} | {"topics": len(d.get("topics", [])), "attendees": d.get("attendees", [])},
    )
    check("...each saved with the assistant's history line", any(h.get("action") == "assistant-edit" for h in rec.get("history", [])), [h.get("action") for h in rec.get("history", [])])
    check(
        "...and the record is handed back to be checked, with Submit offered",
        "check it on the form" in text.lower() and page.locator(".chat-chip", has_text="Submit this record").count() >= 1,
        text,
    )
    ok, reply = submit_via_assistant(page, tid)
    check("The record filled by questions passes every submit check", ok, reply)

    # ---- 4. "I want to fill …" where no record is open: opened, then asked there ----
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(700)
    dismiss(page)
    reply = say(page, "I want to fill the fly catcher record", wait=2000)
    text = last_bot(page)
    check("'I want to fill …' opens the document and starts asking there", "/record/" in page.url and text.rstrip().endswith("?"), (page.url, text))
    check("...beginning with the first unit on the form", "PC-01" in text, text)
    reply = say(page, "stop")
    check("'stop' ends the questions and keeps what was answered", "Stopped" in reply, reply)

    # ---- 5. From the full-page Assistant ----
    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_timeout(900)
    dismiss(page)
    page.fill("textarea.assistant-input", "generate a rat and mice service report with dummy data")
    page.click("[data-action='send']")
    page.wait_for_timeout(2000)
    check("The full-page Assistant starts and fills a record from words, then opens it", "/record/" in page.url, page.url)
    sid = open_record_id(page)
    rec = record_by_id(page, sid)
    d = rec["data"] if rec else {}
    check(
        "...the rodent service report is filled: a quantity per material, remarks, the technician",
        bool(rec) and rec["documentId"] == "service-report-rodent" and d.get("technicianSign") and d.get("lines") and all(l["remarks"] for l in d["lines"]) and any(l["qtyUsed"] for l in d["lines"]),
        (rec["documentId"] if rec else None, d.get("technicianSign"), [(l["materialName"], l["qtyUsed"], l["remarks"]) for l in d.get("lines", [])][:3]),
    )
    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_timeout(700)
    check("...and the conversation there says it is sample data", "sample data" in last_bot(page).lower(), last_bot(page))

    # ---- 6. An ambiguous name is asked about, not guessed ----
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(700)
    dismiss(page)
    reply = say(page, "fill a CAPA record with sample data")
    check("An ambiguous document name is asked about rather than guessed", "Which document" in reply and page.locator(".chat-chip").count() >= 2, reply)
    page.locator(".chat-chip", has_text="Customer Complaint").last.click()
    page.wait_for_timeout(2000)
    check("...and picking one starts and fills that document", "/gap/complaint/" in page.url and (record_by_id(page, open_record_id(page)) or {}).get("data", {}).get("customerName"), page.url)

    # ---- 7. Every document that holds records: New → sample data → Submit ----
    page.goto(f"{BASE}/index.html#/library")
    page.wait_for_timeout(900)
    dismiss(page)
    doc_ids = page.eval_on_selector_all("[data-action='new-record']", "els => els.map(e => e.getAttribute('data-document'))")
    check("The library offers a record of every document that holds one", len(doc_ids) >= 10, doc_ids)
    for doc_id in doc_ids:
        page.goto(f"{BASE}/index.html#/library")
        page.wait_for_timeout(700)
        dismiss(page)
        # The open chat panel sits over the table's right-hand column, and a
        # row scrolled to the top sits under the sticky top bar — so the
        # button is pressed directly rather than through a pointer.
        close_assistant(page)
        page.locator(f"[data-action='new-record'][data-document='{doc_id}']").first.evaluate("el => el.click()")
        page.wait_for_timeout(1300)
        rid = open_record_id(page)
        reply = say(page, "fill it with sample data", wait=1500)
        said = "sample data" in reply.lower() or "already filled" in reply.lower()
        ok, outcome = submit_via_assistant(page, rid)
        check(f"{doc_id}: filled with sample data and passes every submit check", said and ok, (reply[:200], outcome[:300]))

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe assistant fills every document — by questions, or with sample data.")
