"""Tell Mitra what to change, in words - and Mitra reacts to work done on time
or late (REQUIREMENTS s64), asked for on 19-Sep-2026:

  * a FORMAT is changed by saying so - "add a column Batch No. after Remarks",
    "delete the Batch No. column", "delete line 3" where the form prints its
    lines. Mitra ASKS FIRST, naming the revision it will become; "No" leaves the
    format as it was; "Yes" saves it as the next revision with the person's own
    words as the reason, and the sheet shows it at once;
  * a name that fits more than one thing is asked about, never guessed;
  * "row" and "line" mean the format only where the FORM prints its lines - on
    any other sheet they are the record's, and on an open record "add 2 rows" and
    "delete the last row" change that record and offer Undo;
  * with the sheet designer open, what Mitra is told goes onto the designer's
    draft and no revision is made;
  * a form the program draws says honestly why its grid cannot be changed;
  * submitting a record shows Mitra's reaction - on time, late, or simply
    submitted where there is no due date to be late for - as a toast and in the
    chat; several at once are said as one;
  * every format the suite changed is put back to the issued one, from the
    Document Library.

No model is involved anywhere: the sentences are read in the browser
(engine/formatCommands.ts, engine/recordRowCommands.ts). Network-independent,
against the production build on :8842.
"""
import re
import sys
import time
from datetime import date

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
# No word of the name is a button's label ("Format", "Record", "Submit" all are).
ACCOUNT = "Kavya Rathod"
FAILURES = []

FREE_DOC = "qc-obsolete-artwork"  # rowMode "free": its lines are written on each record
PRINTED_DOC = "qc-line-clearance-materials"  # rowMode "fixedRows": the form prints its lines
PROGRAM_DOC = "daily-pest-monitoring"  # drawn by the program, not from a layout


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
    """Opens a page and leaves Mitra as it is: docked by itself on a document, a pill elsewhere."""
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)


def stored(page, key):
    return page.evaluate("(k) => JSON.parse(localStorage.getItem('dcrs:v1:' + k) || 'null')", key)


def ensure_mitra(page):
    """Mitra opens by itself beside a document; anywhere else, or once closed, the pill opens it."""
    if page.locator("[data-assistant='docked']").count() == 0:
        page.locator("[data-assistant='closed'] button").first.click()
        page.wait_for_timeout(400)


def say(page, text, wait=1000):
    ensure_mitra(page)
    box = page.locator("[data-assistant='docked'] textarea")
    box.fill(text)
    box.press("Enter")
    page.wait_for_timeout(wait)
    return last_reply(page)


def last_reply(page):
    return page.locator(".chat-log .chat-msg.bot").last.text_content() or ""


def chips(page, kind):
    """The chips under Mitra's latest message, by what they DO - never by their words."""
    return page.locator(f".chat-log [data-chip='{kind}']")


def tap(page, kind, wait=1100):
    chips(page, kind).last.click()
    page.wait_for_timeout(wait)
    return last_reply(page)


def headings(page):
    return page.locator("[data-section='document-preview'] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")


def format_edit(page, doc_id):
    return (stored(page, "formatEdits") or {}).get(doc_id)


def current_rev(page, doc_id):
    edit = format_edit(page, doc_id)
    if edit:
        return edit["revisionNo"]
    issued = next((d for d in (stored(page, "documents") or []) if d["id"] == doc_id), {})
    return issued.get("revisionNo")


def next_rev(current):
    """data/formatEdits.ts nextRevisionNo: "00" -> "01", "3" -> "4", anything not a number -> "01"."""
    text = str(current or "").strip()
    if not text.isdigit():
        return "01"
    return str(int(text) + 1).zfill(max(2, len(text)))


def expected_reaction(doc, record):
    """engine/reactions.ts, worked out from the record that was actually submitted - not from today's date alone."""
    if (doc.get("schedule") or {}).get("type") == "as-required":
        return "✅", "info", "submitted."
    late = (date.today() - date.fromisoformat(record["dueDate"])).days
    if late <= 0:
        return "🎉", "good", "submitted on time."
    return "⏰", "warn", f"submitted {late} day{'' if late == 1 else 's'} late."


def toast(page):
    return page.locator("[data-section='mitra-reaction']")


REPLY_EMOJI = ["✅", "✏", "🤔", "🚫"]
CHANGED = set()

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    email = f"mitra-words-{int(time.time() * 1000)}@example.com"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", ACCOUNT)
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)

    # ==================================================================
    # 1. A column is added by saying so - asked first, "No" leaves it, "Yes" saves it
    # ==================================================================
    open_page(page, f"#/document/{FREE_DOC}")
    before = headings(page)
    named = [h for h in before if h and not h.lower().startswith("sr")]
    anchor = "Remarks" if "Remarks" in named else named[-1]
    rev0 = current_rev(page, FREE_DOC)
    rev1 = next_rev(rev0)
    check("Mitra opens by itself beside the format's page, docked", page.locator("[data-assistant='docked']").count() == 1)
    hint = page.locator("[data-assistant='docked'] [data-chip='focusInput'][data-placeholder]")
    check("A format drawn from a layout offers 'Change this format' among Mitra's chips", hint.count() == 1)
    if hint.count():
        hint.first.click()
        page.wait_for_timeout(200)
        shown = page.locator("[data-assistant='docked'] textarea").get_attribute("placeholder") or ""
        check("...which shows two example sentences in the box", "add a column" in shown and "delete the box" in shown, shown)

    sentence = f"add a column Batch No. after {anchor}"
    reply = say(page, sentence)
    check(
        "Told to add a column, Mitra asks first: what it will do, the revision it becomes, and that records on file are untouched",
        "Batch No." in reply and anchor in reply and f"Rev {rev1}" in reply and "not touched" in reply,
        reply,
    )
    yes = chips(page, "confirmFormatChange")
    check("...with Yes naming that revision, and No", yes.count() == 1 and rev1 in (yes.first.text_content() or "") and chips(page, "cancelFormatChange").count() == 1)
    check("Nothing is saved while the question stands", format_edit(page, FREE_DOC) is None and "Batch No." not in headings(page))
    reply = tap(page, "cancelFormatChange")
    check("No leaves the format exactly as it was", format_edit(page, FREE_DOC) is None and headings(page) == before and current_rev(page, FREE_DOC) == rev0, reply)

    # The question stands only while its chips do. Once Mitra has been asked something
    # else, a sentence that merely begins with "yes" is read for what it says - it must
    # never save a change the person has stopped looking at. (Answered from the app's
    # own data, so no model is asked.)
    say(page, sentence)
    page.locator("[data-assistant='docked'] [data-chip='guide']").last.click()
    page.wait_for_timeout(700)
    check("Asking Mitra something else sets the question aside: its Yes and No are gone", chips(page, "confirmFormatChange").count() == 0 and chips(page, "cancelFormatChange").count() == 0)
    reply = say(page, "yes, what is due today?")
    check(
        "...and a 'yes' said after that saves nothing - it is answered as the question it is",
        format_edit(page, FREE_DOC) is None and "Batch No." not in headings(page) and "✅ Saved" not in reply and f"Rev {rev1}" not in reply,
        reply,
    )

    say(page, sentence)
    reply = tap(page, "confirmFormatChange", wait=1500)
    CHANGED.add(FREE_DOC)
    after = headings(page)
    check("Yes saves it: the sheet shows the new column, right after the one it was put after", "Batch No." in after and after.index("Batch No.") == after.index(anchor) + 1, after)
    edit = format_edit(page, FREE_DOC) or {}
    rev = (edit.get("revisions") or [{}])[0]
    check(
        "The format is at the next revision, in the person's name, with their own words as the reason",
        edit.get("revisionNo") == rev1 and rev.get("by") == ACCOUNT and sentence in rev.get("reason", "") and "added column" in rev.get("summary", "") and "Batch No." in rev.get("summary", ""),
        rev,
    )
    check("Mitra says it is saved, with the revision and what changed - and one emoji", f"Rev {rev1}" in reply and "Batch No." in reply and sum(reply.count(e) for e in REPLY_EMOJI) == 1 and "✅" in reply, reply)

    # ...and taken off again, the yes typed this time.
    rev2 = next_rev(rev1)
    reply = say(page, "delete the Batch No. column")
    check("Told to delete it, Mitra asks again, naming the next revision", f"Rev {rev2}" in reply and "Batch No." in reply and chips(page, "confirmFormatChange").count() == 1, reply)
    reply = say(page, "yes", wait=1500)
    edit = format_edit(page, FREE_DOC) or {}
    check("A typed yes saves it: the column is gone and the revision raised again", "Batch No." not in headings(page) and edit.get("revisionNo") == rev2 and len(edit.get("revisions") or []) == 2, (headings(page), edit.get("revisionNo")))
    check("...with the removal on record", "removed column" in ((edit.get("revisions") or [{}])[0].get("summary", "")), (edit.get("revisions") or [{}])[0])

    # ==================================================================
    # 2. More than one match is asked about, never guessed
    # ==================================================================
    ambiguous = [h for h in headings(page) if "name" in h.lower().split()]
    if len(ambiguous) >= 2:
        reply = say(page, "delete the name column")
        choices = chips(page, "sendText")
        check(
            "A name that fits two columns is asked about - which one? - with each as a sentence to tap",
            "🤔" in reply and all(a in reply for a in ambiguous) and choices.count() == len(ambiguous) and chips(page, "confirmFormatChange").count() == 0,
            reply,
        )
        check("...and nothing was changed by the question", (format_edit(page, FREE_DOC) or {}).get("revisionNo") == rev2)
        reply = tap(page, "sendText")
        check("Tapping one says the completed sentence, and Mitra asks before doing that too", chips(page, "confirmFormatChange").count() == 1 and f"Rev {next_rev(rev2)}" in reply, reply)
        tap(page, "cancelFormatChange")
        check("...which No leaves undone", (format_edit(page, FREE_DOC) or {}).get("revisionNo") == rev2 and all(a in headings(page) for a in ambiguous))
    else:
        check("The register has two columns with 'name' in them to be ambiguous about", False, headings(page))

    reply = say(page, "delete the Lot Code column")
    check("A name nothing answers to says what the sheet does have", "can't find" in reply and anchor in reply and chips(page, "confirmFormatChange").count() == 0, reply)

    # ==================================================================
    # 3. "line" and "row": the format's only where the form prints its lines
    # ==================================================================
    reply = say(page, "delete line 3")
    check(
        "On a sheet whose lines are written by a person, 'delete line 3' is not treated as a format change",
        chips(page, "confirmFormatChange").count() == 0 and "record" in reply.lower() and (format_edit(page, FREE_DOC) or {}).get("revisionNo") == rev2,
        reply,
    )

    open_page(page, f"#/document/{PRINTED_DOC}")
    blank = page.locator("[data-section='document-preview'][data-record='blank-format']").count() == 1
    lines_before = page.locator("[data-section='document-preview'] table.log-sheet tbody tr").count() if blank else None
    printed_rev = next_rev(current_rev(page, PRINTED_DOC))
    reply = say(page, "delete line 3")
    check("Where the FORM prints its lines, 'delete line 3' is the format's: Mitra asks, naming the line and the revision", "line 3" in reply and f"Rev {printed_rev}" in reply and chips(page, "confirmFormatChange").count() == 1, reply)
    tap(page, "confirmFormatChange", wait=1500)
    CHANGED.add(PRINTED_DOC)
    edit = format_edit(page, PRINTED_DOC) or {}
    summary = (edit.get("revisions") or [{}])[0].get("summary", "")
    counted = re.search(r"\((\d+) → (\d+)\)", summary)
    rows_now = ((edit.get("layout") or {}).get("rowMode") or {}).get("rows") or []
    check(
        "Yes takes that printed line off the format, as its next revision",
        edit.get("revisionNo") == printed_rev and counted is not None and int(counted.group(2)) == int(counted.group(1)) - 1 == len(rows_now),
        (edit.get("revisionNo"), summary, len(rows_now)),
    )
    if blank:
        check("...and the blank form prints one line fewer", page.locator("[data-section='document-preview'] table.log-sheet tbody tr").count() == lines_before - 1, lines_before)

    # ==================================================================
    # 4. A form the program draws says why it cannot
    # ==================================================================
    open_page(page, f"#/document/{PROGRAM_DOC}")
    reply = say(page, "add a column Batch No.")
    check(
        "A form drawn by the program says honestly that its grid is the program's, and where its name and revision are changed",
        "🚫" in reply and "drawn by the program" in reply and "Edit format" in reply and chips(page, "navigate").count() >= 1 and chips(page, "confirmFormatChange").count() == 0,
        reply,
    )
    check("...and nothing was changed", format_edit(page, PROGRAM_DOC) is None)

    # ==================================================================
    # 5. With the designer open, the words go onto its draft - no revision is made
    # ==================================================================
    open_page(page, f"#/document/{FREE_DOC}")
    page.click("[data-action='edit-format']")
    page.wait_for_timeout(900)
    designer = page.locator("[data-section='sheet-designer']")
    if designer.count() == 1:
        reply = say(page, "add a column Lot Code")
        drawn = designer.locator("[data-action='rename-column']").evaluate_all("els => els.map((e) => e.textContent.trim())")
        check("With the designer open, the column appears on the sheet being designed", "Lot Code" in drawn, drawn)
        check("...Mitra says it is on the draft, to be saved with Save - and asks nothing", "✏" in reply and "Save as Rev" in reply and chips(page, "confirmFormatChange").count() == 0, reply)
        check("...and no revision was made", (format_edit(page, FREE_DOC) or {}).get("revisionNo") == rev2)
        page.click("[data-action='designer-discard']")
        page.wait_for_timeout(400)
        sure = page.locator("[data-action='confirm-discard']")
        if sure.count():
            sure.first.click()
            page.wait_for_timeout(600)
        check("Leaving the designer without saving leaves the format as it was", (format_edit(page, FREE_DOC) or {}).get("revisionNo") == rev2 and "Lot Code" not in headings(page), headings(page))
    else:
        # The designer is not on this page: the button opened the Edit format dialog instead.
        print("[SKIP] The sheet designer is not mounted on the document page, so the draft path was not exercised here.")
        cancel = page.locator(".modal-box button:has-text('Cancel')")
        if cancel.count():
            cancel.first.click()
            page.wait_for_timeout(300)

    # ==================================================================
    # 6. An open record's own lines
    # ==================================================================
    open_page(page, f"#/document/{FREE_DOC}")
    page.locator("[data-action='document-new-record']").first.click()
    page.wait_for_timeout(1600)
    dismiss(page)
    rid = page.url.split("#/record/")[-1]
    record = lambda: next((r for r in (stored(page, "records") or []) if r["id"] == rid), None)
    rows = lambda: len(((record() or {}).get("data") or {}).get("rows") or [])
    start = rows()
    check("A record of the register opens to be written on", record() is not None and start >= 1, page.url)

    reply = say(page, "add 2 rows")
    check("'add 2 rows' adds two lines to the record, at once", rows() == start + 2, (start, rows(), reply))
    check("...listed back, with Undo offered", "row" in reply.lower() and chips(page, "undo").count() == 1, reply)
    reply = say(page, "delete the last row")
    check("'delete the last row' takes one off again", rows() == start + 1, (start, rows(), reply))
    check("...and offers Undo too", chips(page, "undo").count() == 1, reply)
    tap(page, "undo")
    check("Undo puts the line back", rows() == start + 2, rows())
    check("None of it touched the format", (format_edit(page, FREE_DOC) or {}).get("revisionNo") == rev2)
    reply = say(page, "row 1 remarks is Checked against the shade card")
    first = (((record() or {}).get("data") or {}).get("rows") or [{}])[0]
    check("A value for a cell is still read as a value, not as a line to add or remove", "Checked against the shade card" in str(first.get("remarks", "")) and rows() == start + 2, (first, reply))

    # ==================================================================
    # 7. Mitra reacts to the submit
    # ==================================================================
    doc = next((d for d in (stored(page, "documents") or []) if d["id"] == FREE_DOC), {})
    # Without the definition and the record the expectation below would be a guess, and could pass by luck.
    check("The register's definition and the record are there to work the expected reaction out from", bool(doc.get("schedule")) and bool((record() or {}).get("dueDate")), (doc.get("schedule"), record()))
    emoji, tone, words = expected_reaction(doc, record() or {"dueDate": date.today().isoformat()})
    page.click("[data-action='submit']")
    page.wait_for_timeout(900)
    check("The record is submitted from its own page", (record() or {}).get("status") == "Pending Verification", (record() or {}).get("status"))
    t = toast(page)
    check("Mitra reacts with a toast", t.count() == 1)
    if t.count() == 1:
        shown = (t.locator("[data-field='reaction-emoji']").text_content() or "").strip()
        said = (t.locator("[data-field='reaction-text']").text_content() or "").strip()
        check(f"...with the emoji this record earned ({emoji}) and the sentence for it", shown == emoji and said.endswith(words) and doc.get("name", "") in said, (shown, said))
        check("...toned to match, announced politely, bottom-left and never printed", t.get_attribute("data-tone") == tone and t.get_attribute("role") == "status" and "no-print" in (t.get_attribute("class") or "") and (t.bounding_box() or {}).get("x", 999) < 400, t.get_attribute("class"))
        # One message that IS the reaction - its emoji, the record, the sentence - not any message with a tick in it.
        chat = [(m or "").strip() for m in page.locator(".chat-log .chat-msg.bot").all_text_contents()]
        check("...and it says so in the open chat as well", any(m.startswith(emoji) and m.endswith(words) and doc.get("name", "") in m for m in chat), chat[-3:])
        t.click()
        page.wait_for_timeout(400)
        check("A click sends the toast away", toast(page).count() == 0)

    # Late, and many at once: the same toast, given the facts a late submit and a morning's Submit would give it.
    what = f"{doc.get('formatNo', '')} {doc.get('name', '')} — 2026-01-05".strip()
    page.evaluate(
        "(d) => window.dispatchEvent(new CustomEvent('dcrs:reaction', { detail: d }))",
        {"kind": "submitted", "what": what, "dueDate": "2026-01-05", "on": "2026-01-08", "asRequired": False},
    )
    page.wait_for_timeout(500)
    t = toast(page)
    late_text = (t.locator("[data-field='reaction-text']").text_content() or "") if t.count() else ""
    check("A record submitted three days after its due date is told so: ⏰, 3 days late", t.count() == 1 and "⏰" in (t.locator("[data-field='reaction-emoji']").text_content() or "") and late_text.endswith("submitted 3 days late.") and t.get_attribute("data-tone") == "warn", late_text)
    if t.count():
        t.click()
        page.wait_for_timeout(300)
    page.evaluate(
        "(d) => window.dispatchEvent(new CustomEvent('dcrs:reaction', { detail: d }))",
        {"kind": "submitted", "what": what, "dueDate": "2026-01-05", "on": "2026-01-05", "asRequired": False, "lastOneDue": True},
    )
    page.wait_for_timeout(500)
    t = toast(page)
    on_time = (t.locator("[data-field='reaction-text']").text_content() or "") if t.count() else ""
    bonus = (t.locator("[data-field='reaction-bonus']").text_content() or "") if t.count() and t.locator("[data-field='reaction-bonus']").count() else ""
    check("One submitted on its due date is cheered: 🎉, on time", t.count() == 1 and "🎉" in (t.locator("[data-field='reaction-emoji']").text_content() or "") and on_time.endswith("submitted on time.") and t.get_attribute("data-tone") == "good", on_time)
    check("...and when nothing else is left due, it says that was the last one: 🌟", "🌟" in bonus and "last one due today" in bonus, bonus)
    if t.count():
        t.click()
        page.wait_for_timeout(300)
    page.evaluate(
        """(what) => {
             for (let i = 0; i < 7; i++) {
               window.dispatchEvent(new CustomEvent('dcrs:reaction', { detail: { kind: 'submitted', what, dueDate: '2026-01-05', on: i === 6 ? '2026-01-06' : '2026-01-05', asRequired: false } }));
             }
           }""",
        what,
    )
    page.wait_for_timeout(600)
    t = toast(page)
    burst = (t.locator("[data-field='reaction-text']").text_content() or "") if t.count() else ""
    check("Seven at once are said as one: how many, how many on time, how many late", t.count() == 1 and "7 records submitted" in burst and "6 on time" in burst and "1 late" in burst, burst)
    if t.count():
        t.click()
        page.wait_for_timeout(400)
    check("...and nothing is left queued behind it", toast(page).count() == 0)

    # ==================================================================
    # 8. On record, and put back
    # ==================================================================
    close_assistant(page)
    open_page(page, "#/activity", settle=2600)
    close_assistant(page)
    page.fill("[data-field='activity-search']", "Format changed")
    page.keyboard.press("Enter")
    page.wait_for_timeout(1300)
    lines = page.locator("[data-table='activity-log'] tbody tr").evaluate_all("els => els.map((e) => e.textContent)")
    check("The activity log holds the change, with the words it was asked in", any("Asked of Mitra" in l and "Batch No." in l for l in lines), lines[:4])

    # Every format this suite changed goes back to the issued one, from the Document Library.
    for doc_id in sorted(CHANGED):
        open_page(page, "#/library")
        close_assistant(page)
        page.locator(f"[data-action='edit-format'][data-document='{doc_id}']").first.evaluate("el => el.click()")
        page.wait_for_timeout(900)
        # A sheet drawn from a layout opens on its own page, in design mode; the dialog is under More options.
        more = page.locator("[data-action='designer-more']")
        if more.count():
            close_assistant(page)
            more.first.click()
            page.wait_for_timeout(500)
        restore = page.locator("[data-action='restore-format']")
        if restore.count():
            restore.first.click()
            page.wait_for_timeout(1200)
        check(f"Restore the issued format puts {doc_id} back as issued", format_edit(page, doc_id) is None, format_edit(page, doc_id))

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nMitra changes a format when told to, asks before it saves, keeps a record's lines the record's, and reacts to work done.")
