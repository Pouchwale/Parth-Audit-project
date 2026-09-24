"""The Store module and its two formats (REQUIREMENTS s71), asked for on
23-Sep-2026: "add this in New module called Store. And make the image which i
give us should be visible as it is".

  * Store is a module of its own in the sidebar, between Purchase and
    Dispatch, and its links open the Document Library filtered to it;
  * F/STR/01 Incoming Material Vehicle & Condition Monitoring Record was
    supplied as a PHOTOGRAPH OF THE RUBBER STAMP, so the stamp is shown
    beside the form, unaltered, and it really loads - a broken path would
    otherwise pass a test that only looked for an <img> tag;
  * its seven points read exactly as they are cut into the stamp, including
    the two spellings the stamp has - "Foreign matter contaminaiton" and
    "Oil Sport on Floor" - because a controlled format is reproduced, not
    corrected;
  * each point is a Yes / No CHOICE, not a text box (the defect this format
    found in F/PUR/01);
  * F/STR/02 Sharp Metal Objects Issuance (New) & Return (Old) Record carries
    both printed paragraphs and its nine headings verbatim, and a line with
    NOTHING RETURNED can be filed - the format's own second paragraph allows
    an issue against no return, so RETURN QTY. is the one column that may be
    left empty;
  * a record of each can be started, filled and submitted.

Network-independent. Against the production build on :8842.
"""
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []

STAMP = "str-incoming-material-vehicle"
SHARP = "str-sharp-metal-objects"
PREVIEW = "[data-section='document-preview']"
ORIGINAL = "[data-section='supplied-original']"

# The seven points, as the stamp prints them. The two misspellings are the
# stamp's own and are the whole point of the check.
STAMP_POINTS = [
    "Vehicle covered",
    "Foreign matter contaminaiton",
    "Objectionable Odour",
    "Are Floor & Sides Clean",
    "Oil Sport on Floor",
    "Sign of pest or dropping",
    "Packaging integrity",
]
STAMP_BOXES = ["Received date", "Checked by"]

# The nine headings F/STR/02 prints, in its own words and punctuation.
SHARP_HEADINGS = [
    "DATE",
    "SHARP TOOL DESCRIPTION",
    "QTY. ISSUED",
    "ISSUED TO (NAME)",
    "DEPARTMENT",
    "RECEIVERS SIGNATURE",
    "RETURN QTY.",
    "STORE KEEPER SIGN",
    "REMARKS",
]

# Both paragraphs above the grid, verbatim. The second ends with no full stop.
SHARP_RULES = [
    "Store In-charge is overall responsible for issuance of new sharp metal object & receipt as well as safe disposal of broken or worn-out sharp metal object.",
    "In night shift, when Store in-charge may not be present, respective departmental supervisor shall",
    "Store in-charge shall do the reconciliation of issued & returned sharp tool quantity as per records updated.",
    "New sharp metal object also may be issued to new employee or addition of new machine or new requirements, without receipt of new sharp metal object",
]


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
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def open_page(page, route, settle=1400):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def written(page, selector):
    """The text as written, not as the stylesheet prints it in capitals."""
    el = page.locator(selector)
    return el.first.evaluate("e => e.textContent") if el.count() else ""


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def record(page, rid):
    return next((r for r in records(page) if r["id"] == rid), None)


def composer(page):
    return page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")


def say(page, text, wait=2000):
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(300)
    composer(page).fill(text)
    composer(page).press("Enter")
    page.wait_for_timeout(wait)
    msgs = page.locator(".chat-msg.bot")
    return msgs.last.inner_text() if msgs.count() else ""


def start_record(page, doc_id):
    """Starts a record from that document's own page and lands on it. A record
    is known by its ROUTE - there is no data-page for one."""
    open_page(page, f"#/document/{doc_id}")
    page.locator("[data-action='document-new-record']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1800)
    dismiss(page)
    close_assistant(page)
    return page.url.split("#/record/")[-1]


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    # The name carries no word this suite presses a button by.
    email = f"str-{int(time.time() * 1000)}@example.com"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "Str Desk QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)

    # ==================================================================
    # 1. The module is there, where the material is
    # ==================================================================
    print("\n==== The Store module ====")
    check("Store is a module in the sidebar", page.locator(".app-sidebar a[href='#/library/store']").count() == 1)
    check(
        "...with both of its formats linked",
        page.locator(f".app-sidebar a[href='#/document/{STAMP}']").count() == 1 and page.locator(f".app-sidebar a[href='#/document/{SHARP}']").count() == 1,
    )
    headers = page.eval_on_selector_all(".app-sidebar .nav-module .nav-module-header", "els => els.map((e) => e.textContent.trim())")
    names = [h for h in headers]
    # The order the material moves in, and the order the company's own Master
    # List of Formats & Records puts the departments in.
    pur = next((i for i, n in enumerate(names) if "Purchase" in n), -1)
    sto = next((i for i, n in enumerate(names) if n.startswith("Store")), -1)
    dis = next((i for i, n in enumerate(names) if "Dispatch" in n), -1)
    check("It is named Store, between Purchase and Dispatch", pur >= 0 and sto == pur + 1 and dis == sto + 1, names)
    # A module with no name of its own used to fall back to the tail of its own
    # translation key; Dispatch did exactly that until this module was added.
    check("Every module in the sidebar has a name, not a translation key", not any("module." in n for n in names), names)

    open_page(page, "#/library/store")
    rows = page.locator(".doc-table tbody tr:not(.doc-section-row)")
    check("The Document Library, filtered to Store, lists its two documents", rows.count() == 2, rows.count())
    library = page.locator(".doc-table").first.inner_text()
    check("...by the format numbers the company's own master list gives them", "F/STR/01" in library and "F/STR/02" in library, library[:300])

    # ==================================================================
    # 2. F/STR/01 — the stamp, and the stamp itself
    # ==================================================================
    print("\n==== F/STR/01 Incoming Material Vehicle & Condition Monitoring ====")
    open_page(page, f"#/document/{STAMP}")
    check("It opens on a page of its own", page.locator("[data-page='document-records']").count() == 1)
    sheet = written(page, PREVIEW)
    missing = [line for line in STAMP_POINTS if line not in sheet]
    check("The seven points read exactly as they are cut into the stamp", not missing, missing)
    check("...including the two spellings the stamp has, kept rather than corrected", "Foreign matter contaminaiton" in sheet and "Oil Sport on Floor" in sheet)
    check("...and it is not silently corrected anywhere on the page", "contamination" not in sheet.lower().replace("contaminaiton", "") and "Oil Spot" not in sheet, sheet[:200])
    check("The date it came in and who checked it are both asked for", all(b in sheet for b in STAMP_BOXES), sheet[:200])
    check("The stamp draws no grid: it is a form of boxes", page.locator(f"{PREVIEW} table.log-sheet thead th").count() == 0)

    # ---- THE SUPPLIED IMAGE, VISIBLE AS IT IS ----
    check("The picture is not fetched until it is asked for", page.locator(ORIGINAL).count() == 0)
    show = page.locator("[data-action='show-supplied-original']")
    check("The supplied original is offered on this format", show.count() == 1)
    show.first.click()
    page.wait_for_timeout(1200)
    check("...and opens", page.locator(ORIGINAL).count() == 1)
    shot = page.locator(f"{ORIGINAL} img")
    check("...showing one picture: the stamp as supplied", shot.count() == 1, shot.count())
    # Loaded, not merely present: a wrong path renders an <img> too.
    loaded = (
        shot.first.evaluate("el => ({ done: el.complete, w: el.naturalWidth, h: el.naturalHeight, src: el.currentSrc })")
        if shot.count()
        else {}
    )
    check(
        "...and the image really loads, at the size it was supplied",
        bool(loaded.get("done")) and loaded.get("w") == 1280 and loaded.get("h") == 720,
        loaded,
    )
    check("...from the file the plant supplied", "fstr01-incoming-material-stamp.jpg" in str(loaded.get("src", "")), loaded.get("src"))
    check("...and it says where it came from, unaltered", "rubber stamp" in written(page, ORIGINAL), written(page, ORIGINAL)[:200])
    show.first.click()
    page.wait_for_timeout(500)
    check("It closes again", page.locator(ORIGINAL).count() == 0)
    # Only where a format has one: no other document page gains a button.
    open_page(page, f"#/document/{SHARP}")
    check("A format with no supplied picture offers no such button", page.locator("[data-action='show-supplied-original']").count() == 0)

    # ==================================================================
    # 3. The seven points are a choice, not a text box
    # ==================================================================
    print("\n==== Yes or No, asked as a choice ====")
    rid = start_record(page, STAMP)
    check("A record opens for today's consignment", "#/record/" in page.url, page.url)
    boxes = page.locator(".field select")
    check("Each of the seven points is answered from a choice box", boxes.count() == 7, boxes.count())
    if boxes.count():
        offered = boxes.first.locator("option").evaluate_all("els => els.map((e) => (e.textContent || '').trim())")
        check("...offering Yes and No", offered[1:] == ["Yes", "No"], offered)
    say(page, "fill it with sample data")
    close_assistant(page)
    filled = record(page, rid)
    header = (filled or {}).get("data", {}).get("header", {})
    # The answers a load that PASSES gets. A stamp answered "Yes" all the way
    # down would record a load that was contaminated, smelt, had pest droppings
    # on it — and was taken in anyway.
    check(
        "A sample fill answers it as a load that passes, not Yes all the way down",
        header.get("vehicleCovered") == "Yes"
        and header.get("foreignMatterContaminaiton") == "No"
        and header.get("objectionableOdour") == "No"
        and header.get("areFloorAndSidesClean") == "Yes"
        and header.get("oilSportOnFloor") == "No"
        and header.get("signOfPestOrDropping") == "No"
        and header.get("packagingIntegrity") == "Yes",
        header,
    )
    check("...and it is signed by the store's own manager, from the company's personnel records", header.get("checkedBy") == "Hemantbhai Nayak", header.get("checkedBy"))
    submit = page.locator("[data-action='submit']")
    if submit.count():
        submit.first.click()
        page.wait_for_timeout(1800)
    kept = record(page, rid)
    check("The check is on file", kept is not None and kept["status"] in ("Submitted", "Pending Verification"), (kept or {}).get("status"))

    # ==================================================================
    # 4. F/STR/02 — the register, and the line with nothing returned
    # ==================================================================
    print("\n==== F/STR/02 Sharp Metal Objects Issuance & Return ====")
    open_page(page, f"#/document/{SHARP}")
    sheet = written(page, PREVIEW)
    missing_rules = [r for r in SHARP_RULES if r not in sheet]
    check("Both paragraphs the format prints above the grid are on it, verbatim", not missing_rules, missing_rules)
    heads = page.locator(f"{PREVIEW} table.log-sheet thead th").evaluate_all("els => els.map((e) => (e.textContent || '').trim())")
    paper = [h for h in heads if h and h.upper() != "SR. NO."]
    check("Its nine headings are the paper's own, punctuation and all", paper == SHARP_HEADINGS, paper)

    rid2 = start_record(page, SHARP)
    check("A register line can be started", "#/record/" in page.url, page.url)
    say(page, "fill it with sample data")
    close_assistant(page)
    filled2 = record(page, rid2)
    rows2 = (filled2 or {}).get("data", {}).get("rows", [])
    check("The register fills with sample lines to be checked", len(rows2) >= 3, len(rows2))
    blank_return = [r for r in rows2 if r.get("returnQty") in (None, "")]
    check(
        "...one of them with NOTHING RETURNED, which the format's own second paragraph allows",
        len(blank_return) >= 1,
        [(r.get("sharpToolDescription"), r.get("returnQty")) for r in rows2],
    )
    check("...and every line is signed by the store keeper", all(str(r.get("storeKeeperSign") or "").strip() for r in rows2), [r.get("storeKeeperSign") for r in rows2])
    submit = page.locator("[data-action='submit']")
    check("It can be submitted", submit.count() == 1)
    if submit.count():
        submit.first.click()
        page.wait_for_timeout(1800)
    kept2 = record(page, rid2)
    check(
        "The register is on file WITH the empty return column: a line with nothing returned is the format working as written",
        kept2 is not None and kept2["status"] in ("Submitted", "Pending Verification"),
        ((kept2 or {}).get("status"), page.locator(".app-content").inner_text()[:300]),
    )

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nStore holds its two formats as the department keeps them, and the stamp is shown exactly as it was supplied.")
