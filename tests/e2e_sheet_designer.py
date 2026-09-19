"""A format is designed ON THE SHEET ITSELF, the way a spreadsheet is edited
(REQUIREMENTS s64), asked for on 19-Sep-2026:

  * "Edit format" on a format's own page turns the page into the format's
    designer - the sheet as it prints, in place of the records and the preview -
    for every format whose grid is drawn from a layout; a form the program
    draws by hand still opens the Edit format dialog;
  * on the sheet: a column inserted beside another from the heading's own menu,
    named where it appears (it arrives with its placeholder name selected),
    renamed in place (Enter keeps, Escape leaves it), duplicated, moved, and
    deleted - the delete asking first, in a pop-up that says what happens to the
    records on file; a printed column's type and Required locked, the column
    itself still copied, moved and deleted; a key never handed out twice, even
    to a column added after another was deleted; every control on the sheet
    kept off the paper; a box added above the grid, made a Choice and required;
    on a form that prints lines down its side, a line inserted, reworded,
    duplicated, moved and deleted; the name and the instructions typed in place;
  * undo and redo, by button and by Ctrl+Z / Ctrl+Y - which stay a text box's
    own while the cursor is in one;
  * Save is a pop-up that lists what changed in words, offers the next revision
    and refuses without a reason; saved, the revision is raised and dated, the
    sheet on the page carries the change, formatEdits holds who / what / why,
    and a record started afterwards has the new column, box and line;
  * Discard with changes on the sheet asks first; with none it just leaves;
  * "More options..." opens the dialog - offered only while the sheet holds no
    unsaved change - and the issued format is restored through it, so the suite
    leaves the library as issued.

Run on F/QC/03 (Inspection Record - Label Stock, which prints ten lines down its
side) and on F/QC/16 (Register of Obsolete Artwork, whose lines people write).

Network-independent, against the production build on :8842.
"""
import json
import sys
import time
from datetime import date

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
# No word of this name is a button's label anywhere in the app.
ACCOUNT = "Nirali Dave"
FAILURES = []

RECORDS_SENTENCE = "Records already on file keep what was written in this column; it is simply no longer drawn."


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:600])


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
    # Mitra opens by itself beside a document or a record; the sheet is what is under test here.
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def open_page(page, route, settle=1300):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def stored(page, key):
    return page.evaluate("(k) => JSON.parse(localStorage.getItem('dcrs:v1:' + k) || 'null')", key)


def squash(text):
    return " ".join((text or "").split())


# ---- reading the designer -------------------------------------------------
# Headings are printed in capitals by the stylesheet, so they are read as
# textContent, never inner_text. A required item carries " *" after its name.

DESIGNER = "[data-section='sheet-designer']"


def headings(page):
    return page.locator(f"{DESIGNER} thead [data-action='rename-column']").evaluate_all(r"els => els.map((e) => e.textContent.replace(/\s*\*$/, '').trim())")


def column_keys(page):
    return page.locator(f"{DESIGNER} thead th[data-designer-item='column']").evaluate_all("els => els.map((e) => e.getAttribute('data-key'))")


def boxes(page, area):
    return page.locator(f"{DESIGNER} [data-designer-item='box'][data-area='{area}']").evaluate_all(
        r"els => els.map((e) => ({ key: e.getAttribute('data-key'), label: (e.querySelector('[data-action=\"rename-box\"]') || e).textContent.trim(), sample: e.querySelector('.designer-sample').textContent.trim() }))"
    )


def change_count(page):
    return int(page.locator("[data-section='designer-count']").get_attribute("data-count") or "-1")


def menu_open(page):
    return page.locator("[data-section='designer-menu']").count() == 1


def focused_and_selected(page, field):
    """Whether the cursor is in the box `field` with everything in it selected - so typing replaces it."""
    return page.evaluate(
        "(f) => { const el = document.activeElement; return !!el && el.getAttribute('data-field') === f && el.value.length > 0 && el.selectionStart === 0 && el.selectionEnd === el.value.length; }",
        field,
    )


def sheet_headings(page, within="[data-section='document-preview'] "):
    return page.locator(f"{within}table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")


def sheet_rev(page):
    """The Rev No. cell of the sheet on the page. (Its Date cell is the RECORD's date, not the revision's.)"""
    return (page.locator("[data-section='document-preview'] .doc-header .meta-cell .v").nth(1).text_content() or "").strip()


def start_designing(page, route):
    open_page(page, route)
    page.click("[data-action='edit-format']")
    page.wait_for_timeout(500)


def design_and_save(page, doc_id, format_no, anchor, issued_rev, next_rev, fixed):
    route = f"#/document/{doc_id}"
    reason = f"Customer audit asked for the batch number ({doc_id} {int(time.time())})"
    print(f"\n==== {format_no} ({doc_id}) - {'a form that prints its lines' if fixed else 'a register whose lines people write'} ====")

    # ------------------------------------------------------------------
    # Design mode, in place of the records and the preview
    # ------------------------------------------------------------------
    open_page(page, route)
    issued_headings = sheet_headings(page)
    page.click("[data-action='edit-format']")
    page.wait_for_timeout(500)
    check(
        f"{format_no}: Edit format turns the page into the designer - the sheet, not the dialog",
        page.locator(DESIGNER).count() == 1 and page.locator("[data-section='format-editor']").count() == 0,
    )
    check(
        "...in place of the records table and the preview, under the page's own header",
        page.locator("[data-table='document-records']").count() == 0 and page.locator("[data-section='document-preview']").count() == 0 and page.locator("[data-page='document-records'] h1").count() == 1,
    )
    check(
        "The design surface looks like the sheet: the header block, and the grid drawn with the log sheet's own classes",
        page.locator(f"{DESIGNER} .doc-header").count() == 1 and page.locator(f"{DESIGNER} .doc-table table.compact.log-sheet").count() == 1 and format_no in page.locator(f"{DESIGNER} .doc-header").inner_text(),
    )
    check("...with the columns it was issued with", headings(page) == issued_headings[1:], (headings(page), issued_headings))
    toolbar = page.locator("[data-section='designer-toolbar']")
    check("The toolbar is a control, so it never prints", "no-print" in (toolbar.get_attribute("class") or ""))
    printable_controls = page.evaluate(
        """() => Array.from(document.querySelectorAll("[data-section='sheet-designer'] [data-action$='-menu'], [data-section='sheet-designer'] .designer-type, [data-section='sheet-designer'] .designer-sample > span, [data-section='designer-name']"))
                 .filter((e) => !e.closest('.no-print')).length"""
    )
    check("...and neither does an arrow, a type hint or the name box: the sheet prints as the document alone", printable_controls == 0, printable_controls)
    check(
        "Nothing is changed yet: 0 changes, nothing to save, and More options is on offer",
        change_count(page) == 0 and page.locator("[data-action='designer-save']").is_disabled() and page.locator("[data-action='designer-more']").is_enabled(),
    )
    check("The save button names the revision the format would become", f"Rev {next_rev}" in squash(page.locator("[data-action='designer-save']").text_content()))
    if fixed:
        check("A form that prints lines down its side offers + Line, and a menu on every line", page.locator("[data-action='designer-add-line']").count() == 1 and page.locator("[data-action='line-menu']").count() >= 2)
    else:
        check(
            "A sheet whose lines people write shows two sample lines and says there is nothing of the format's to design there",
            page.locator("[data-action='designer-add-line']").count() == 0
            and page.locator("[data-action='line-menu']").count() == 0
            and page.locator(f"{DESIGNER} tr.designer-sample-line").count() == 2
            and "written on each record" in page.locator("[data-section='designer-lines-note']").inner_text(),
        )

    # ------------------------------------------------------------------
    # A column: inserted beside another, named, renamed, duplicated, moved, deleted
    # ------------------------------------------------------------------
    page.click(f"[data-action='column-menu'][data-column='{anchor}']")
    page.wait_for_timeout(250)
    check("The arrow on a heading opens that column's menu", menu_open(page) and page.locator("[data-section='designer-menu'] [data-action='insert-column-right']").count() == 1)
    page.click("[data-action='insert-column-right']")
    page.wait_for_timeout(300)
    box = page.locator("[data-field='rename-column']")
    check(
        "Insert column to the right: the column arrives named New column, already selected for renaming",
        box.count() == 1 and box.input_value() == "New column" and focused_and_selected(page, "rename-column") and not menu_open(page),
        box.input_value() if box.count() else None,
    )
    page.keyboard.type("Batch No.")
    page.keyboard.press("Enter")
    page.wait_for_timeout(250)
    keys = column_keys(page)
    labels = headings(page)
    at = keys.index(anchor) if anchor in keys else -1
    check("...so the person just types its name, and Enter keeps it - to the right of the column it was inserted beside", at >= 0 and len(labels) > at + 1 and labels[at + 1] == "Batch No.", labels)
    new_key = keys[at + 1] if at >= 0 and len(keys) > at + 1 else ""
    check("...under a key nothing else on the sheet has", bool(new_key) and keys.count(new_key) == 1 and new_key != anchor, keys)

    page.click(f"[data-action='rename-column'][data-column='{new_key}']")
    page.wait_for_timeout(200)
    page.locator("[data-field='rename-column']").fill("Something else entirely")
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    check("A heading is renamed in place: Escape leaves it as it was", "Batch No." in headings(page) and "Something else entirely" not in headings(page), headings(page))
    page.click(f"[data-action='rename-column'][data-column='{new_key}']")
    page.wait_for_timeout(200)
    page.locator("[data-field='rename-column']").fill("Batch Number")
    page.keyboard.press("Enter")
    page.wait_for_timeout(200)
    check("...and Enter keeps the new name, under the same key", headings(page)[at + 1] == "Batch Number" and column_keys(page)[at + 1] == new_key, headings(page))

    page.click(f"[data-action='column-menu'][data-column='{new_key}']")
    page.wait_for_timeout(200)
    page.click("[data-action='duplicate-column']")
    page.wait_for_timeout(300)
    copy_name = page.locator("[data-field='rename-column']").input_value() if page.locator("[data-field='rename-column']").count() else ""
    page.keyboard.press("Enter")
    page.wait_for_timeout(200)
    keys = column_keys(page)
    copy_key = keys[at + 2] if len(keys) > at + 2 else ""
    check("Duplicate column: a copy beside it, named apart from it, under a key of its own", copy_name == "Batch Number (2)" and headings(page)[at + 2] == "Batch Number (2)" and copy_key not in ("", new_key), (copy_name, keys))

    page.click(f"[data-action='column-menu'][data-column='{copy_key}']")
    page.wait_for_timeout(200)
    page.click("[data-action='move-column-left']")
    page.wait_for_timeout(250)
    keys = column_keys(page)
    check("Move left: the copy is now before the column it was copied from", keys.index(copy_key) == at + 1 and keys.index(new_key) == at + 2, keys)
    check("...and its menu has followed it, to move it again", menu_open(page) and page.locator(f"[data-action='column-menu'][data-column='{copy_key}']").get_attribute("aria-expanded") == "true")
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    check("Escape closes the menu", not menu_open(page))

    page.click(f"[data-action='column-menu'][data-column='{copy_key}']")
    page.wait_for_timeout(200)
    page.click("[data-action='delete-column']")
    page.wait_for_timeout(300)
    confirm = page.locator("[data-section='designer-confirm']")
    said = squash(confirm.text_content()) if confirm.count() else ""
    check("Delete column asks first, in a pop-up that names the column", confirm.count() == 1 and "Batch Number (2)" in said, said)
    check("...and tells the plain truth about the records on file", RECORDS_SENTENCE in said, said)
    page.click("[data-action='cancel-delete']")
    page.wait_for_timeout(250)
    check("Cancelled, the column is still on the sheet", copy_key in column_keys(page) and page.locator("[data-section='designer-confirm']").count() == 0, column_keys(page))
    page.click(f"[data-action='column-menu'][data-column='{copy_key}']")
    page.wait_for_timeout(200)
    page.click("[data-action='delete-column']")
    page.wait_for_timeout(250)
    page.click("[data-action='confirm-delete']")
    page.wait_for_timeout(300)
    check("Confirmed, it is gone - and the column beside it is untouched", copy_key not in column_keys(page) and "Batch Number" in headings(page), headings(page))

    # ------------------------------------------------------------------
    # A box above the grid: added, named, made a required Choice from its menu
    # ------------------------------------------------------------------
    boxes_before = len(boxes(page, "header"))
    page.click("[data-action='designer-add-box-above']")
    page.wait_for_timeout(300)
    check("+ Box above: the box arrives named New box, already selected for renaming", page.locator("[data-field='rename-box']").count() == 1 and focused_and_selected(page, "rename-box"))
    page.keyboard.type("Lot No.")
    page.keyboard.press("Enter")
    page.wait_for_timeout(250)
    above = boxes(page, "header")
    lot = next((b for b in above if b["label"] == "Lot No."), None)
    check("...and is on the sheet above the grid under the name typed", len(above) == boxes_before + 1 and lot is not None, above)
    box_key = lot["key"] if lot else ""
    page.click(f"[data-action='box-menu'][data-box='{box_key}']")
    page.wait_for_timeout(200)
    check("A box has the same menu, for the area it is in", menu_open(page) and page.locator(f"[data-action='box-menu'][data-box='{box_key}']").get_attribute("data-area") == "header" and page.locator("[data-action='insert-box-before']").count() == 1)
    page.select_option("[data-section='designer-menu'] [data-field='item-type']", "select")
    page.wait_for_timeout(200)
    page.fill("[data-field='item-choices']", "Trial lot, Regular lot")
    page.keyboard.press("Enter")
    page.check("[data-section='designer-menu'] [data-field='item-required']")
    page.wait_for_timeout(200)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    lot = next((b for b in boxes(page, "header") if b["key"] == box_key), None)
    check("Its type is set from the menu - a Choice, with its choices - and it is marked required", lot is not None and lot["sample"] == "Choice: Trial lot / Regular lot" and lot["label"].endswith("*"), lot)

    # ------------------------------------------------------------------
    # The lines a form prints down its side
    # ------------------------------------------------------------------
    issued_lines = page.locator(f"{DESIGNER} [data-designer-item='line']").count()
    if fixed:
        first_printed = page.locator("[data-field='printed-cell'][data-line='0']").first.get_attribute("data-column")
        second_printed = page.locator("[data-field='printed-cell'][data-line='0']").nth(1).get_attribute("data-column")
        # A column the form prints is always text and never asked for; it is still renamed, copied, moved and deleted.
        page.click(f"[data-action='column-menu'][data-column='{first_printed}']")
        page.wait_for_timeout(250)
        menu = page.locator("[data-section='designer-menu']")
        check(
            "A printed column's type and Required are locked, saying why - while it can still be duplicated, moved and deleted",
            menu.count() == 1
            and menu.locator("[data-field='item-type']").is_disabled()
            and menu.locator("[data-field='item-required']").is_disabled()
            and "Printed on the form" in menu.inner_text()
            and menu.locator("[data-action='duplicate-column']").is_enabled()
            and menu.locator("[data-action='move-column-right']").is_enabled()
            and menu.locator("[data-action='delete-column']").is_enabled(),
        )
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        page.click("[data-action='line-menu'][data-line='0']")
        page.wait_for_timeout(200)
        page.click("[data-action='insert-line-below']")
        page.wait_for_timeout(300)
        where = page.evaluate("() => { const el = document.activeElement; return el ? [el.getAttribute('data-field'), el.getAttribute('data-line'), el.value] : null; }")
        check("Insert line below: a printed line under the first, its first cell selected for typing", where == ["printed-cell", "1", "New line"] and focused_and_selected(page, "printed-cell"), where)
        page.keyboard.type("COLOUR SHADE")
        page.keyboard.press("Tab")
        page.wait_for_timeout(250)
        cell = page.locator(f"[data-field='printed-cell'][data-line='1'][data-column='{first_printed}']")
        check("...which now prints what was typed", page.locator(f"{DESIGNER} [data-designer-item='line']").count() == issued_lines + 1 and cell.input_value() == "COLOUR SHADE", cell.input_value())

        spec = page.locator(f"[data-field='printed-cell'][data-line='0'][data-column='{second_printed}']")
        spec.fill("As per P.O., checked against the delivery note")
        page.keyboard.press("Tab")
        page.wait_for_timeout(250)
        check("A printed cell is reworded where it stands", page.locator(f"[data-field='printed-cell'][data-line='0'][data-column='{second_printed}']").input_value() == "As per P.O., checked against the delivery note")

        page.click("[data-action='line-menu'][data-line='1']")
        page.wait_for_timeout(200)
        page.click("[data-action='move-line-down']")
        page.wait_for_timeout(250)
        moved = page.locator(f"[data-field='printed-cell'][data-line='2'][data-column='{first_printed}']").input_value()
        check("Move down: the line is one lower, and its menu went with it", moved == "COLOUR SHADE" and page.locator("[data-action='line-menu'][data-line='2']").get_attribute("aria-expanded") == "true", moved)
        page.click("[data-action='move-line-up']")
        page.wait_for_timeout(250)
        page.click("[data-action='duplicate-line']")
        page.wait_for_timeout(300)
        check(
            "Move up puts it back; Duplicate line prints it twice",
            page.locator(f"[data-field='printed-cell'][data-line='1'][data-column='{first_printed}']").input_value() == "COLOUR SHADE"
            and page.locator(f"[data-field='printed-cell'][data-line='2'][data-column='{first_printed}']").input_value() == "COLOUR SHADE"
            and page.locator(f"{DESIGNER} [data-designer-item='line']").count() == issued_lines + 2,
        )
        page.click("[data-action='line-menu'][data-line='2']")
        page.wait_for_timeout(200)
        page.click("[data-action='delete-line']")
        page.wait_for_timeout(300)
        said = squash(page.locator("[data-section='designer-confirm']").text_content()) if page.locator("[data-section='designer-confirm']").count() else ""
        check("Delete line asks first too, and says the records on file keep the lines they were started with", "Line 3" in said and "COLOUR SHADE" in said and "keep the lines they were started with" in said, said)
        page.click("[data-action='confirm-delete']")
        page.wait_for_timeout(300)
        check("...and takes the one line off", page.locator(f"{DESIGNER} [data-designer-item='line']").count() == issued_lines + 1)
    else:
        # The name and the printed instructions are typed in place as well.
        page.click("[data-action='rename-name']")
        page.wait_for_timeout(200)
        check("The format's name is typed in place at the top", focused_and_selected(page, "designer-name"))
        page.keyboard.type("Register of Obsolete Artwork and Shade Cards")
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)
        title = page.locator(f"{DESIGNER} .doc-header .doc-title").text_content() or ""
        check("...and the sheet's header block carries it at once", "REGISTER OF OBSOLETE ARTWORK AND SHADE CARDS" in title, title)
        page.click("[data-action='rename-instructions']")
        page.wait_for_timeout(200)
        page.locator("[data-field='designer-instructions']").fill("Enter every artwork the day it is withdrawn.\nThe shade card is destroyed with it.")
        page.keyboard.press("Control+Enter")
        page.wait_for_timeout(250)
        printed = squash(page.locator("[data-action='rename-instructions']").text_content())
        check("The printed instructions are typed in place, one per line", "Enter every artwork the day it is withdrawn." in printed and "The shade card is destroyed with it." in printed, printed)

    # ------------------------------------------------------------------
    # Undo and redo
    # ------------------------------------------------------------------
    page.click("[data-action='designer-add-column']")
    page.wait_for_timeout(300)
    page.keyboard.type("Checked by QA")
    page.keyboard.press("Enter")
    page.wait_for_timeout(250)
    full = change_count(page)
    check("+ Column adds one at the end of the grid", headings(page)[-1] == "Checked by QA", headings(page))
    page.click("[data-action='designer-undo']")
    page.wait_for_timeout(250)
    check("Undo takes back the last step - the name typed - and no more", headings(page)[-1] == "New column" and change_count(page) == full, headings(page))
    page.click("[data-action='designer-undo']")
    page.wait_for_timeout(250)
    check("Undo again takes the column itself back, and the count of changes with it", "New column" not in headings(page) and "Batch Number" in headings(page) and change_count(page) == full - 1, (headings(page), change_count(page)))
    page.click("[data-action='designer-redo']")
    page.click("[data-action='designer-redo']")
    page.wait_for_timeout(250)
    check("Redo twice puts both back, and there is nothing further to redo", headings(page)[-1] == "Checked by QA" and change_count(page) == full and page.locator("[data-action='designer-redo']").is_disabled(), headings(page))
    page.evaluate("() => document.activeElement && document.activeElement.blur()")
    page.keyboard.press("Control+z")
    page.wait_for_timeout(250)
    by_key = headings(page)[-1]
    page.keyboard.press("Control+y")
    page.wait_for_timeout(250)
    check("Ctrl+Z and Ctrl+Y do the same from the keyboard", by_key == "New column" and headings(page)[-1] == "Checked by QA", (by_key, headings(page)[-1]))
    page.click(f"[data-action='rename-column'][data-column='{new_key}']")
    page.wait_for_timeout(200)
    page.keyboard.press("Control+z")
    page.wait_for_timeout(200)
    still = page.locator("[data-action='designer-redo']").is_disabled()
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    check("...but inside a text box Ctrl+Z is the box's own: the sheet does not step back", still and headings(page)[-1] == "Checked by QA", headings(page))

    # ------------------------------------------------------------------
    # With changes on the sheet
    # ------------------------------------------------------------------
    check("More options is withheld while the sheet holds unsaved changes - the dialog starts from the stored format", page.locator("[data-action='designer-more']").is_disabled())
    guarded = page.evaluate("() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }")
    check("Closing or reloading the page with unsaved changes is guarded", guarded is True)

    # ------------------------------------------------------------------
    # Save: what changed, the revision, the reason
    # ------------------------------------------------------------------
    page.click("[data-action='designer-save']")
    page.wait_for_timeout(400)
    dialog = page.locator("[data-section='designer-save-dialog']")
    listed = dialog.locator("[data-section='designer-change-list'] li").evaluate_all("els => els.map((e) => e.textContent.trim())") if dialog.count() else []
    check(
        "Save opens a pop-up listing what changed, in words",
        any("added column" in c and "Batch Number" in c for c in listed) and any("added column" in c and "Checked by QA" in c for c in listed) and any("added box" in c and "Lot No." in c for c in listed) and len(listed) == full,
        listed,
    )
    check("...with no word of the column that was added and deleted again", not any("(2)" in c for c in listed), listed)
    if fixed:
        check("...the printed lines among them", any("printed lines" in c and f"{issued_lines} → {issued_lines + 1}" in c for c in listed), listed)
    else:
        check("...the new name and the instructions among them", any("renamed the format" in c for c in listed) and any("instructions" in c for c in listed), listed)
    check("...offering the next revision", page.locator("[data-field='designer-revision']").input_value() == next_rev, page.locator("[data-field='designer-revision']").input_value())
    page.click("[data-action='designer-confirm-save']")
    page.wait_for_timeout(300)
    refused = page.locator("[data-section='designer-save-error']")
    check(
        "Without a reason it is refused, saying so, and nothing is stored",
        refused.count() == 1 and "why the format is changing" in refused.inner_text() and not (stored(page, "formatEdits") or {}).get(doc_id),
        refused.inner_text() if refused.count() else None,
    )
    page.fill("[data-field='designer-reason']", reason)
    page.click("[data-action='designer-confirm-save']")
    page.wait_for_timeout(1200)
    saved = page.locator("[data-section='designer-saved']")
    said = squash(saved.text_content()) if saved.count() else ""
    check(
        "Saved: a pop-up says which revision, dated today, by whom, with what changed and why",
        f"Rev {next_rev}" in said and date.today().strftime("%d-%b-%Y") in said and ACCOUNT in said and "added column" in said and reason in said,
        said,
    )
    page.click("[data-action='designer-saved-close']")
    page.wait_for_timeout(1000)
    close_assistant(page)
    check("Its one button leaves design mode: the records and the preview are back", page.locator(DESIGNER).count() == 0 and page.locator("[data-table='document-records']").count() == 1 and page.locator("[data-section='document-preview']").count() == 1)
    shown = sheet_headings(page)
    check("The sheet on the page carries the new columns, where they were put", "Batch Number" in shown and shown.index("Batch Number") == at + 2 and shown[-1] == "Checked by QA" and "Batch Number (2)" not in shown, shown)
    check(f"...and the format is at Rev {next_rev}", sheet_rev(page) == next_rev, sheet_rev(page))
    edit = (stored(page, "formatEdits") or {}).get(doc_id) or {}
    rev = (edit.get("revisions") or [{}])[0]
    check(
        "The change is on record in formatEdits: the revision, dated today, with who, what and why",
        edit.get("revisionNo") == next_rev
        and edit.get("revisionDate") == date.today().isoformat()
        and rev.get("revisionNo") == next_rev
        and rev.get("by") == ACCOUNT
        and "added column" in rev.get("summary", "")
        and "Batch Number" in rev.get("summary", "")
        and rev.get("reason") == reason,
        rev,
    )
    kept = [c["key"] for c in (edit.get("layout") or {}).get("columns", [])]
    check("...with the issued columns' keys untouched and the copy's key not among them", anchor in kept and new_key in kept and copy_key not in kept, kept)

    # ------------------------------------------------------------------
    # A record started afterwards is on the changed format
    # ------------------------------------------------------------------
    on_file_before = [r for r in (stored(page, "records") or []) if r["documentId"] == doc_id]
    page.locator("[data-action='document-new-record']").first.click()
    page.wait_for_timeout(1500)
    close_assistant(page)
    rid = page.url.split("#/record/")[-1]
    rec = next((r for r in (stored(page, "records") or []) if r["id"] == rid), None)
    on_sheet = sheet_headings(page, within="")
    check("A record started afterwards has the column on its sheet, and a place for it on every line", "Batch Number" in on_sheet and rec is not None and all(new_key in row for row in rec["data"]["rows"]), on_sheet)
    check("...and the new box above the grid", rec is not None and box_key in rec["data"]["header"], list(rec["data"]["header"].keys()) if rec else None)
    if fixed:
        rows = rec["data"]["rows"] if rec else []
        check("...and is printed with the new line, and the reworded cell", len(rows) == issued_lines + 1 and "COLOUR SHADE" in json.dumps(rows[1]) and "checked against the delivery note" in json.dumps(rows[0]), rows[:2])
    after = {r["id"]: r for r in (stored(page, "records") or []) if r["documentId"] == doc_id}
    check("The records that were already on file are exactly as they were", all(json.dumps(after.get(r["id"]), sort_keys=True) == json.dumps(r, sort_keys=True) for r in on_file_before), len(on_file_before))

    # ------------------------------------------------------------------
    # More options, and back to the format as issued
    # ------------------------------------------------------------------
    start_designing(page, route)
    check("Opened again, the designer starts from the saved format with nothing to save", change_count(page) == 0 and "Batch Number" in headings(page) and page.locator("[data-action='designer-more']").is_enabled(), headings(page))
    page.click("[data-action='designer-more']")
    page.wait_for_timeout(500)
    editor = page.locator("[data-section='format-editor']")
    history = squash(page.locator("[data-table='format-history']").text_content()) if editor.count() else ""
    check("More options opens the Edit format dialog, whose change history holds what the sheet saved", editor.count() == 1 and reason in history and "added column" in history, history[:300])
    page.click("[data-action='restore-format']")
    page.wait_for_timeout(1200)
    close_assistant(page)
    shown = sheet_headings(page)
    check(
        "Restore the issued format, from there, leaves design mode with the paper's own transcription back at its own revision",
        page.locator(DESIGNER).count() == 0 and shown == issued_headings and sheet_rev(page) == issued_rev and not (stored(page, "formatEdits") or {}).get(doc_id),
        (shown, sheet_rev(page)),
    )
    return reason


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    email = f"designer-{int(time.time() * 1000)}@example.com"
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
    # 1. A form that prints its lines, and 2. a register whose lines are written
    # ==================================================================
    label_stock_reason = design_and_save(page, "qc-label-stock", "F/QC/03", anchor="observation", issued_rev="01", next_rev="02", fixed=True)
    design_and_save(page, "qc-obsolete-artwork", "F/QC/16", anchor="customerName", issued_rev="00", next_rev="01", fixed=False)

    # ==================================================================
    # 3. Discard
    # ==================================================================
    print("\n==== Discard ====")
    start_designing(page, "#/document/qc-label-stock")
    check("With nothing changed the button reads Leave design mode", "Leave design mode" in squash(page.locator("[data-action='designer-discard']").text_content()))
    page.click("[data-action='designer-discard']")
    page.wait_for_timeout(500)
    check("...and leaves at once, asking nothing", page.locator(DESIGNER).count() == 0 and page.locator("[data-section='designer-discard-dialog']").count() == 0 and page.locator("[data-section='document-preview']").count() == 1)
    page.click("[data-action='edit-format']")
    page.wait_for_timeout(500)
    page.click("[data-action='designer-add-column']")
    page.wait_for_timeout(300)
    page.keyboard.type("Not to be kept")
    page.keyboard.press("Enter")
    page.wait_for_timeout(250)
    check("With a change on the sheet the button reads Discard", change_count(page) == 1 and "Discard" in squash(page.locator("[data-action='designer-discard']").text_content()))
    page.click("[data-action='designer-discard']")
    page.wait_for_timeout(300)
    asked = page.locator("[data-section='designer-discard-dialog']")
    check("Discard with changes asks first, listing what would be lost", asked.count() == 1 and "Not to be kept" in squash(asked.text_content()), squash(asked.text_content()) if asked.count() else None)
    page.click("[data-action='cancel-discard']")
    page.wait_for_timeout(250)
    check("Keep designing: the sheet and its change are still there", page.locator(DESIGNER).count() == 1 and headings(page)[-1] == "Not to be kept" and change_count(page) == 1)

    # A key is never handed out twice (REQUIREMENTS s62) - not even to a column added after
    # another was taken off: what older records hold under the first must never turn up
    # beneath the second. Every column the sheet adds starts from the same placeholder name.
    first_key = column_keys(page)[-1]
    page.click(f"[data-action='column-menu'][data-column='{first_key}']")
    page.wait_for_timeout(200)
    page.click("[data-action='delete-column']")
    page.wait_for_timeout(250)
    page.click("[data-action='confirm-delete']")
    page.wait_for_timeout(300)
    page.click("[data-action='designer-add-column']")
    page.wait_for_timeout(300)
    page.keyboard.type("Nor this one")
    page.keyboard.press("Enter")
    page.wait_for_timeout(250)
    second_key = column_keys(page)[-1]
    check(
        "A column added after another was deleted gets a key of its own, never the deleted one's",
        headings(page)[-1] == "Nor this one" and bool(first_key) and bool(second_key) and second_key != first_key and change_count(page) == 1,
        (first_key, second_key),
    )
    page.click("[data-action='designer-discard']")
    page.wait_for_timeout(250)
    page.click("[data-action='confirm-discard']")
    page.wait_for_timeout(900)
    close_assistant(page)
    check(
        "Confirmed: design mode is left, nothing was stored, and the sheet on the page is the issued one",
        page.locator(DESIGNER).count() == 0 and not (stored(page, "formatEdits") or {}).get("qc-label-stock") and "Nor this one" not in sheet_headings(page) and "Not to be kept" not in sheet_headings(page),
        sheet_headings(page),
    )
    unguarded = page.evaluate("() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }")
    check("...and the page is no longer guarded", unguarded is False)

    # Going somewhere else IN the app with changes on the sheet asks first too - the sidebar, the
    # browser's own Back - and the draft is there until the person says to throw it away.
    print("\n==== Leaving a sheet that holds changes ====")
    # Somewhere else first, so the browser's Back has a different page of the app to go to.
    open_page(page, "#/calendar")
    start_designing(page, "#/document/qc-label-stock")
    page.click("[data-action='designer-add-column']")
    page.wait_for_timeout(300)
    page.keyboard.type("Half designed")
    page.keyboard.press("Enter")
    page.wait_for_timeout(250)
    close_assistant(page)
    # The toolbar follows the person down the sheet, under the app's own top bar and never beneath it.
    bar = page.evaluate(
        """() => {
             document.querySelector("[data-section='sheet-designer']").scrollIntoView({ block: 'end' });
             const t = document.querySelector("[data-section='designer-toolbar']").getBoundingClientRect();
             const top = document.querySelector('.app-topbar').getBoundingClientRect();
             return { top: t.top, bottom: t.bottom, under: top.bottom, height: window.innerHeight, scrolled: window.scrollY };
           }"""
    )
    check("At the foot of the sheet the toolbar is still in view, under the top bar", bar["top"] >= bar["under"] - 1 and bar["bottom"] <= bar["height"], bar)
    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(200)
    page.locator("a[href='#/library']").first.click()
    page.wait_for_timeout(400)
    asked = page.locator("[data-section='designer-discard-dialog']")
    check(
        "A sidebar link with changes on the sheet asks first, and the page has not moved",
        asked.count() == 1 and "Half designed" in squash(asked.text_content()) and page.evaluate("() => location.hash") == "#/document/qc-label-stock",
        page.evaluate("() => location.hash"),
    )
    page.click("[data-action='cancel-discard']")
    page.wait_for_timeout(250)
    check("Keep designing: still on the sheet, the change still on it", page.locator(DESIGNER).count() == 1 and headings(page)[-1] == "Half designed" and change_count(page) == 1)
    page.evaluate("() => history.back()")
    page.wait_for_timeout(500)
    check(
        "The browser's own Back asks as well, and the address is put back",
        page.locator("[data-section='designer-discard-dialog']").count() == 1 and page.evaluate("() => location.hash") == "#/document/qc-label-stock" and page.locator(DESIGNER).count() == 1,
        page.evaluate("() => location.hash"),
    )
    page.click("[data-action='cancel-discard']")
    page.wait_for_timeout(250)
    page.locator("a[href='#/library']").first.click()
    page.wait_for_timeout(400)
    page.click("[data-action='confirm-discard']")
    page.wait_for_timeout(900)
    check(
        "Throw the changes away: the person arrives where they were going, and nothing was stored",
        page.evaluate("() => location.hash") == "#/library" and page.locator(DESIGNER).count() == 0 and not (stored(page, "formatEdits") or {}).get("qc-label-stock"),
        page.evaluate("() => location.hash"),
    )
    page.locator("a[href='#/dashboard']").first.click()
    page.wait_for_timeout(500)
    check("...and with no sheet open a link just goes", page.evaluate("() => location.hash") == "#/dashboard" and page.locator("[data-section='designer-discard-dialog']").count() == 0)

    # The browser's Back, agreed to, stays a Back: the person lands on the page before the
    # sheet, and the NEXT Back goes to the page before that - never to the sheet just left.
    open_page(page, "#/calendar")
    page.locator("a[href='#/library']").first.click()
    page.wait_for_timeout(500)
    page.locator("[data-action='edit-format'][data-document='qc-label-stock']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1300)
    close_assistant(page)
    check(
        "Edit format in the Document Library opens the sheet to be designed, on the format's own page",
        page.evaluate("() => location.hash") == "#/document/qc-label-stock" and page.locator(DESIGNER).count() == 1 and page.locator("[data-section='format-editor']").count() == 0,
        page.evaluate("() => location.hash"),
    )
    check("While a sheet is being designed the page offers no New record beside it", page.locator("[data-action='document-new-record']").count() == 0)
    page.click("[data-action='designer-add-column']")
    page.wait_for_timeout(300)
    page.keyboard.type("Backed out of")
    page.keyboard.press("Enter")
    page.wait_for_timeout(250)
    page.evaluate("() => history.back()")
    page.wait_for_timeout(600)
    page.click("[data-action='confirm-discard']")
    page.wait_for_timeout(900)
    check("Back, agreed to, lands on the page before the sheet", page.evaluate("() => location.hash") == "#/library" and page.locator(DESIGNER).count() == 0, page.evaluate("() => location.hash"))
    page.evaluate("() => history.back()")
    page.wait_for_timeout(700)
    check("...and the next Back goes to the page before that, not to the sheet just left", page.evaluate("() => location.hash") == "#/calendar", page.evaluate("() => location.hash"))

    # Logging out takes the screen away without changing the address: it asks as well.
    start_designing(page, "#/document/qc-label-stock")
    page.click("[data-action='designer-add-column']")
    page.wait_for_timeout(300)
    page.keyboard.type("Logged out on")
    page.keyboard.press("Enter")
    page.wait_for_timeout(250)
    close_assistant(page)
    page.locator(".app-topbar button[title='Log Out']").first.click()
    page.wait_for_timeout(400)
    asked = page.locator("[data-section='designer-discard-dialog']")
    check("Log out with changes on the sheet asks first", asked.count() == 1 and "Logged out on" in squash(asked.text_content()) and page.locator(DESIGNER).count() == 1)
    page.click("[data-action='cancel-discard']")
    page.wait_for_timeout(250)
    check("Keep designing: still signed in, the change still on the sheet", page.locator(DESIGNER).count() == 1 and change_count(page) == 1)
    page.click("[data-action='designer-discard']")
    page.wait_for_timeout(250)
    page.click("[data-action='confirm-discard']")
    page.wait_for_timeout(700)

    # ==================================================================
    # 4. A form the program draws still opens the dialog
    # ==================================================================
    print("\n==== A form drawn by the program ====")
    open_page(page, "#/library")
    page.locator("[data-action='edit-format'][data-document='daily-pest-monitoring']").first.evaluate("el => el.click()")
    page.wait_for_timeout(500)
    check(
        "A form drawn by the program has no sheet to design: Edit format opens the dialog, as before",
        page.locator("[data-section='format-editor']").count() == 1 and page.locator(DESIGNER).count() == 0 and "drawn by the program" in page.locator("[data-section='format-editor']").inner_text(),
    )
    page.locator(".modal-box button:has-text('Cancel')").click()
    page.wait_for_timeout(300)

    # ==================================================================
    # 5. Designed on the sheet, logged like any other format change
    # ==================================================================
    open_page(page, "#/activity", settle=2600)
    page.fill("[data-field='activity-search']", "F/QC/03")
    page.keyboard.press("Enter")
    page.wait_for_timeout(1200)
    lines = page.locator("[data-table='activity-log'] tbody tr").evaluate_all("els => els.map((e) => Array.from(e.querySelectorAll('td')).map((c) => c.textContent.trim()).join(' | '))")
    check("The activity log holds the change made on the sheet, with its revisions and its reason", any("Format changed" in l and "F/QC/03" in l and "Rev 01 → 02" in l and label_stock_reason in l for l in lines), lines[:4])
    check("...and the restoring of the issued format", any("Format restored" in l and "F/QC/03" in l for l in lines), lines[:4])

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nA format is designed on the sheet: columns, boxes and printed lines changed where they stand, saved as the next revision on record.")
