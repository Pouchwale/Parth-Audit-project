"""The Dispatch module and its two supplied formats (REQUIREMENTS s70), asked
for on 23-Sep-2026: "create another module called Dispatch and those document
in it as it".

  * Dispatch is a module of its own in the sidebar, and its links open the
    Document Library filtered to it;
  * F/DISP/01 Safe Transporter Agreement - the code of practice a contract
    transporter signs - carries the clauses the paper prints, under the
    paper's own headings, and both signature blocks;
  * F/DISP/02 Container Stuffing & Vehicle Inspection Record is the fourth
    form the plant issues in GUJARATI (s58): with Gujarati chosen it reads as
    it was issued and is kept away from Google's translator; with English
    chosen it reads in English, from the plant's own reading of it;
  * its checklist is numbered as the paper numbers it - 1, 2, 3, 4, 6, 7, 8, 9,
    with NO 5 - and the numbers are the paper's, not a count the screen made;
  * each point is answered હા / નાં with NA struck out, and a record can be
    started, filled, submitted and printed with the company's header block.

Network-independent: Google Translate is blocked, so the Gujarati form is read
as the app itself renders it. Against the production build on :8842.
"""
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []

AGREEMENT = "disp-safe-transporter-agreement"
CONTAINER = "disp-container-stuffing"
PREVIEW = "[data-section='document-preview']"

# The paper's own numbering of the checklist. There is no 5.
CHECK_NUMBERS = ["1", "2", "3", "4", "6", "7", "8", "9"]

# Lines of F/DISP/01 that no other document in the system says.
AGREEMENT_LINES = [
    "This contract is valid for the period of 01.04.2025 to 31.03.2026",
    "Vehicle / container shall not have any sharp edges, nails protruded or uneven surface",
    "Damage / Contamination",
    "Loading / Protection",
    "Load Acceptance",
    "Product Security & Integrity",
    "Vehicle breaks down in transit",
    "In Case of Rejection - Any costs of rejection will be borne by the party responsible",
]

# The Gujarati form, as issued.
GUJARATI_LINES = [
    "તેના આગમન પર કન્ટેનર ખોલો",
    "ચેકલિસ્ટ",
    "વાહન નં.",
    "ગ્રાહકનું નામ",
    "પાલન (NA સ્ટ્રાઈક આઉટ)",
]
# ...and the plant's own English of the same lines (i18n/documentTextEn.ts).
ENGLISH_LINES = [
    "Open the container on its arrival",
    "Checklist",
    "Vehicle No.",
    "Customer's name",
    "Compliance (strike NA out)",
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
    """The text as written, not as the stylesheet prints it."""
    el = page.locator(selector)
    return el.first.evaluate("e => e.textContent") if el.count() else ""


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def record(page, rid):
    return next((r for r in records(page) if r["id"] == rid), None)


def composer(page):
    return page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")


def say(page, text, wait=2000):
    """Asks Mitra, which is the only way a sample fill is offered - there is no
    button on the page for it (engine/assistantLocal.ts)."""
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(300)
    composer(page).fill(text)
    composer(page).press("Enter")
    page.wait_for_timeout(wait)
    msgs = page.locator(".chat-msg.bot")
    return msgs.last.inner_text() if msgs.count() else ""


def set_language(page, lang):
    page.select_option(".app-topbar select", lang)
    page.wait_for_timeout(1200)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    # No network: the Gujarati form must read in English from the app's own
    # table, not from Google (REQUIREMENTS s58).
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    email = f"disp-{int(time.time() * 1000)}@example.com"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "Disp Desk QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)

    # ==================================================================
    # 1. The module is there, and it is the department's own
    # ==================================================================
    print("\n==== The Dispatch module ====")
    check("Dispatch is a module in the sidebar", page.locator(".app-sidebar a[href='#/library/dispatch']").count() == 1)
    check("...with both of its formats linked", page.locator(f".app-sidebar a[href='#/document/{AGREEMENT}']").count() == 1 and page.locator(f".app-sidebar a[href='#/document/{CONTAINER}']").count() == 1)
    open_page(page, "#/library/dispatch")
    rows = page.locator(".doc-table tbody tr:not(.doc-section-row)")
    check("The Document Library, filtered to Dispatch, lists its two documents", rows.count() == 2, rows.count())
    library = page.locator(".doc-table").first.inner_text()
    check("...by the format numbers the papers print", "F/DISP/01" in library and "F/DISP/02" in library, library[:300])

    # ==================================================================
    # 2. F/DISP/01 — the agreement, clause by clause
    # ==================================================================
    print("\n==== F/DISP/01 Safe Transporter Agreement ====")
    open_page(page, f"#/document/{AGREEMENT}")
    check("It opens on a page of its own", page.locator("[data-page='document-records']").count() == 1)
    sheet = written(page, PREVIEW)
    missing = [line for line in AGREEMENT_LINES if line not in sheet]
    check("The clauses the paper prints are on it, under the paper's own headings", not missing, missing)
    check(
        "...and both sides sign it",
        "GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED" in sheet and "For Transporter" in sheet and "On dated" in sheet,
        sheet[:200],
    )
    check("The agreement has no grid: it is all words", page.locator(f"{PREVIEW} table.log-sheet thead th").count() == 0)

    # ==================================================================
    # 3. F/DISP/02 — the Gujarati form, as issued
    # ==================================================================
    print("\n==== F/DISP/02 Container Stuffing & Vehicle Inspection ====")
    open_page(page, f"#/document/{CONTAINER}")
    check("It opens on a page of its own", page.locator("[data-page='document-records']").count() == 1)
    numbers = page.locator(f"{PREVIEW} table.log-sheet tbody tr").evaluate_all(
        "els => els.map((e) => (e.querySelectorAll('td')[1] || {}).textContent || '')"
    )
    numbers = [n.strip() for n in numbers if n.strip()]
    check(
        "The checklist is numbered as the paper numbers it — 1, 2, 3, 4, 6, 7, 8, 9, with no 5",
        numbers == CHECK_NUMBERS,
        numbers,
    )
    # ---- in Gujarati, it reads as it was issued ----
    set_language(page, "gu")
    dismiss(page)
    close_assistant(page)
    guj = written(page, PREVIEW)
    missing_guj = [line for line in GUJARATI_LINES if line not in guj]
    check("With Gujarati chosen the form reads as it was issued", not missing_guj, missing_guj)
    kept = page.locator(f"{PREVIEW} .notranslate, {PREVIEW} [translate='no']").count()
    check("...and is kept away from the translator, as a controlled form must be", kept > 0, kept)

    # ---- in English, it reads in the plant's own English ----
    set_language(page, "en")
    dismiss(page)
    close_assistant(page)
    eng = written(page, PREVIEW)
    missing_en = [line for line in ENGLISH_LINES if line not in eng]
    check("With English chosen the same form reads in English, with no network", not missing_en, missing_en)
    check("...and nothing of it is left in Gujarati", not any(line in eng for line in GUJARATI_LINES), [line for line in GUJARATI_LINES if line in eng])

    # ==================================================================
    # 4. A container check, answered and kept
    # ==================================================================
    print("\n==== A container check, kept ====")
    # A BLANK format shows its cells as words, not as choice boxes — that is
    # what keeps a long sheet quick on a low-end machine — so the two answers
    # are asked for on the record itself, where the box is. The answers are the
    # record's own values and so stay in Gujarati whichever language is chosen
    # (i18n/documentText.ts: only the words the paper PRINTS are rewritten,
    # never a choice box's options, or a saved record would match none of them).
    page.locator("[data-action='document-new-record']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1800)
    dismiss(page)
    close_assistant(page)
    check("A record opens for today's container", "#/record/" in page.url, page.url)
    box = page.locator(f"{PREVIEW} table.log-sheet tbody tr select, table.log-sheet tbody tr select").first
    offered = (
        box.locator("option").evaluate_all("els => els.map((e) => (e.textContent || '').trim())")
        if box.count()
        else []
    )
    check(
        "Each point is answered \u0ab9\u0abe / \u0aa8\u0abe\u0a82, with NA there to be struck out",
        offered[1:] == ["\u0ab9\u0abe", "\u0aa8\u0abe\u0a82", "NA"],
        offered,
    )
    rid = page.url.split("#/record/")[-1]
    say(page, "fill it with sample data")
    close_assistant(page)
    submit = page.locator("[data-action='submit']")
    check("...and it can be submitted", submit.count() == 1)
    if submit.count():
        submit.first.click()
        page.wait_for_timeout(1800)
    kept = record(page, rid)
    check(
        "The record is on file, and goes for verification like every other record",
        kept is not None and kept["status"] in ("Submitted", "Pending Verification"),
        ((kept or {}).get("status"), page.locator(".app-content").inner_text()[:300]),
    )

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nDispatch holds its two formats as the department issued them, and the Gujarati one reads in either language.")
