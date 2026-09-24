"""The Maintenance module and its eight supplied formats (REQUIREMENTS s74),
asked for on 24-Sep-2026: "create another module called Maintenance so i have
shared this pdfs with you so add those in that module".

  * Maintenance is a module of its own, after the production modules and
    outside the Purchase -> Store -> Dispatch run, and its library lists the
    eight F/MNT formats by the numbers the papers print;
  * F/MNT/01 is the EQUIPMENT MASTER: its 43 machines are on file as the page
    printed them - including row M-68, printed one column out of step on the
    paper itself, and the paper's own spellings ("Itlay", "Febraury");
  * a maintenance sheet FETCHES a machine from it by its number (M-47);
  * Mitra says which machine M-47 is;
  * F/MNT/04 prints its check parameters in HINDI and GUJARATI side by side:
    with Gujarati chosen it reads as issued, with English chosen it reads in
    English and nothing of it is left in either script;
  * F/MNT/06's TOTAL BREAKDOWN MINUTES is worked out, never typed;
  * F/MNT/11's 2024 page, filled on the SUPERSEDED Rev 00 with Day and Night
    columns, is still drawn and headed as Rev 00 - it is read under the
    revision it was made on - while the 2025 page reads on Rev 01;
  * every supplied page can be seen as it came, with a caption that says which
    revision it is.

Network-independent (Google Translate is blocked; the server has no model key).
Against the production build on :8842.
"""
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []
PREVIEW = "[data-section='document-preview']"
ORIGINAL = "[data-section='supplied-original']"

MNT_DOCS = {
    "mnt-equipment-list": "F/MNT/01",
    "mnt-pm-record": "F/MNT/02",
    "mnt-yearly-pm-schedule": "F/MNT/03",
    "mnt-daily-health": "F/MNT/04",
    "mnt-breakdown-record": "F/MNT/06",
    "mnt-new-equipment": "F/MNT/08",
    "mnt-glass-breakage": "F/MNT/09",
    "mnt-lux-level": "F/MNT/11",
}

# F/MNT/04's check parameters: two of the Hindi and Gujarati lines as issued,
# and the plant's own English of them.
MNT04_ISSUED = ["मशीन को साफ करे", "મશીન સાફ કરવું", "इलेक्ट्रिक पैनलों की जाँच करे", "ઇલેક્ટ્રિક પેનલ્સ તપાસો"]
MNT04_ENGLISH = ["Clean the machine.", "Check the electrical panels.", "Is the machine making any unusual sound?"]


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


def open_page(page, route, settle=1500):
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


def say(page, text, wait=2500):
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(300)
    composer(page).fill(text)
    composer(page).press("Enter")
    # Every question now asks the model first and falls back to the app's own
    # answer (REQUIREMENTS s72), so wait for the typing bubble to go rather than
    # reading it as the reply.
    try:
        page.wait_for_function("() => !document.querySelector('.chat-typing')", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(wait)
    msgs = page.locator(".chat-msg.bot")
    return msgs.last.inner_text() if msgs.count() else ""


def start_record(page, doc_id):
    """Starts a record from that document's own page and lands on it (a record is known by its route)."""
    open_page(page, f"#/document/{doc_id}")
    page.locator("[data-action='document-new-record']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1800)
    dismiss(page)
    close_assistant(page)
    return page.url.split("#/record/")[-1]


def set_language(page, lang):
    page.select_option(".app-topbar select", lang)
    page.wait_for_timeout(1200)


def show_originals(page):
    """Opens the supplied-original panel and returns what each picture is: loaded, its size, its caption."""
    show = page.locator("[data-action='show-supplied-original']")
    if not show.count():
        return None
    show.first.click()
    page.wait_for_timeout(1500)
    return page.locator(f"{ORIGINAL} img").evaluate_all(
        """els => els.map((el) => ({
             loaded: el.complete && el.naturalWidth > 0,
             src: el.currentSrc,
             caption: ((el.closest('figure') || {}).textContent || '').trim(),
           }))"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    email = f"mnt-{int(time.time() * 1000)}@example.com"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "Mnt Desk QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)

    # ==================================================================
    # 1. The module, where the master list puts it
    # ==================================================================
    print("\n==== The Maintenance module ====")
    check("Maintenance is a module in the sidebar", page.locator(".app-sidebar a[href='#/library/maintenance']").count() == 1)
    missing_links = [d for d in MNT_DOCS if page.locator(f".app-sidebar a[href='#/document/{d}']").count() != 1]
    check("...with all eight of its formats linked", not missing_links, missing_links)
    names = page.eval_on_selector_all(".app-sidebar .nav-module .nav-module-header", "els => els.map((e) => e.textContent.trim())")
    prd = next((i for i, n in enumerate(names) if "Lamination — Production" in n), -1)
    mnt = next((i for i, n in enumerate(names) if n.startswith("Maintenance")), -1)
    pur = next((i for i, n in enumerate(names) if "Purchase" in n), -1)
    check("It sits after the production modules and before Purchase", prd >= 0 and mnt == prd + 1 and pur == mnt + 1, names)
    check("No module in the sidebar shows a translation key", not any("module." in n for n in names), names)

    open_page(page, "#/library/maintenance")
    rows = page.locator(".doc-table tbody tr:not(.doc-section-row)")
    check("The Document Library, filtered to Maintenance, lists its eight documents", rows.count() == 8, rows.count())
    library = page.locator(".doc-table").first.inner_text()
    missing_nos = [n for n in MNT_DOCS.values() if n not in library]
    check("...by the format numbers the papers print", not missing_nos, missing_nos)

    # ==================================================================
    # 2. F/MNT/01 — the Equipment Master, as the page printed it
    # ==================================================================
    print("\n==== F/MNT/01 List of Equipments & Utilities ====")
    open_page(page, "#/document/mnt-equipment-list", settle=2500)
    sheet = written(page, PREVIEW)
    lines = page.locator(f"{PREVIEW} table.log-sheet tbody tr").count()
    check("The supplied list is on file: 43 machines", lines == 43, lines)
    check("...kept in the paper's own spellings", "Itlay" in sheet and "Febraury" in sheet and "Hyfra Industrukuhalanlagen GmbH" in sheet, sheet[:200])
    check("...and row M-68 exactly as printed, one column out of step", "DCM Sleeve Seaming" in sheet and "France" in sheet, sheet[:200])
    shown = show_originals(page) or []
    check("The supplied page is shown as it came, and really loads", len(shown) == 1 and shown[0]["loaded"], shown)

    # ==================================================================
    # 3. F/MNT/11 — a record read under the revision it was made on
    # ==================================================================
    print("\n==== F/MNT/11 Lux Level Measurement Record ====")
    open_page(page, "#/document/mnt-lux-level", settle=2000)
    latest = page.locator(f"{PREVIEW} table.log-sheet tbody tr").count()
    check("The 12.08.2025 round is on file on the current Rev 01: 26 areas", latest == 26, latest)
    shown = show_originals(page) or []
    captions = " | ".join(s["caption"] for s in shown)
    check("Both supplied rounds can be seen, each captioned with its revision", len(shown) == 2 and all(s["loaded"] for s in shown) and "Rev 01" in captions and "SUPERSEDED" in captions, shown)

    open_page(page, "#/record/seed-mnt-lux-2024", settle=2000)
    heads = page.locator("table.log-sheet thead th").evaluate_all("els => els.map((e) => (e.textContent || '').trim())")
    check("The 11.05.2024 page is drawn on Rev 00: Day AND Night columns", "Lux Level (Day)" in heads and "Lux Level (Night)" in heads, heads)
    check("...its 19 areas, none of them blank lines", page.locator("table.log-sheet tbody tr").count() == 19, page.locator("table.log-sheet tbody tr").count())
    check("...and it is headed Rev 00, not the Rev 01 that replaced it", page.locator("[data-revision='00']").count() >= 1)
    check("...with the date Rev 00 was issued beside it", page.locator("[data-meta='revision-date']").count() >= 1)
    check("...and says it was filled on the superseded revision", page.locator("[data-superseded-revision='00']").count() == 1)
    # Correcting it would mean writing on a layout it was never written on.
    check("It is not offered for correction on the current revision", page.locator("[data-action='correct']").count() == 0)
    old = record(page, "seed-mnt-lux-2024") or {}
    check("It keeps its readings: QC Lab colour-matching cabinet 1863 by day", any(r.get("luxDay") == 1863 for r in (old.get("data") or {}).get("rows", [])), (old.get("data") or {}).get("rows", [])[:2])

    # ==================================================================
    # 4. F/MNT/04 — Hindi and Gujarati, read either way
    # ==================================================================
    print("\n==== F/MNT/04 Daily Equipment Health Status & Cleaning Record ====")
    open_page(page, "#/document/mnt-daily-health", settle=1800)
    eng = written(page, PREVIEW)
    missing_en = [l for l in MNT04_ENGLISH if l not in eng]
    check("With English chosen the check parameters read in English, with no network", not missing_en, missing_en)
    left = [l for l in MNT04_ISSUED if l in eng]
    check("...and nothing of them is left in Hindi or Gujarati", not left, left)
    check("A day is a line: 31 of them, with DAY SHIFT and NIGHT SHIFT marks", page.locator(f"{PREVIEW} table.log-sheet tbody tr").count() == 31 and "DAY SHIFT" in eng and "NIGHT SHIFT" in eng)
    set_language(page, "gu")
    dismiss(page)
    close_assistant(page)
    guj = written(page, PREVIEW)
    missing_issued = [l for l in MNT04_ISSUED if l not in guj]
    check("With Gujarati chosen the form reads as issued, Hindi and Gujarati side by side", not missing_issued, missing_issued)
    check("...kept away from the translator", page.locator(f"{PREVIEW} .notranslate, {PREVIEW} [translate='no']").count() > 0)
    set_language(page, "en")
    dismiss(page)
    close_assistant(page)

    # ---- a machine fetched from the Equipment Master ----
    rid = start_record(page, "mnt-daily-health")
    check("A daily health sheet opens", "#/record/" in page.url, page.url)
    fetch = page.locator("[data-section='equipment-fetch']")
    check("It offers to fetch the machine from F/MNT/01", fetch.count() == 1)
    if fetch.count():
        page.locator("[data-field='equipment-query']").first.fill("M-47")
        page.locator("[data-action='equipment-fetch']").first.click()
        page.wait_for_timeout(1800)
    header = ((record(page, rid) or {}).get("data") or {}).get("header", {})
    check(
        "Fetching M-47 fills its number and its description from the list",
        header.get("machineNo") == "M-47" and header.get("machineDescription") == "UV Flexo Printing Machine",
        header,
    )

    # ==================================================================
    # 5. F/MNT/06 — breakdown minutes worked out, never typed
    # ==================================================================
    print("\n==== F/MNT/06 Equipments Breakdown Maintenance Record ====")
    rid6 = start_record(page, "mnt-breakdown-record")
    groups = page.locator("table.log-sheet thead th.col-group").evaluate_all("els => els.map((e) => (e.textContent || '').trim())")
    check("Its three spanning headings are the paper's", groups == ["BREAKDOWN HISTORY", "USED MATERIALS", "BREAKDOWN HISTORY & SUMMARY"], groups)
    say(page, "fill it with sample data")
    close_assistant(page)
    page.wait_for_timeout(1200)
    first = (((record(page, rid6) or {}).get("data") or {}).get("rows") or [{}])[0]
    check("The sample breakdown's minutes are worked out: 10:15 to 11:40 is 85", first.get("totalBreakdownMinutes") == "85", first)
    # The one cell of the first line that SHOWS 85 as text is the worked-out
    # minutes: the production-loss box also holds 85, but as an input, whose
    # value is not text. So that cell must be text with no box to type in.
    cells = page.locator("table.log-sheet tbody tr").first.locator("td").evaluate_all(
        "tds => tds.map((td) => ({ text: (td.textContent || '').trim(), boxes: td.querySelectorAll('input, select, textarea').length }))"
    )
    shown = [c for c in cells if c["text"] == "85"]
    check("...shown as text, with no box to type the minutes into", len(shown) == 1 and shown[0]["boxes"] == 0, cells)
    submit = page.locator("[data-action='submit']")
    if submit.count():
        submit.first.click()
        page.wait_for_timeout(1800)
    kept = record(page, rid6) or {}
    check("The register is on file", kept.get("status") in ("Submitted", "Pending Verification"), kept.get("status"))

    # ==================================================================
    # 6. Mitra knows the machines
    # ==================================================================
    print("\n==== Mitra ====")
    open_page(page, "#/dashboard")
    reply = say(page, "which machine is M-47?")
    check("Asked which machine M-47 is, Mitra says: the Lombardi Delta 330", "Delta 330" in reply, reply[:300])
    close_assistant(page)

    # ==================================================================
    # 7. The other formats, verbatim, each with its supplied pages
    # ==================================================================
    print("\n==== Verbatim, with the pages as supplied ====")
    open_page(page, "#/document/mnt-glass-breakage", settle=1800)
    glass = written(page, PREVIEW)
    check("F/MNT/09 is headed as printed: GLASS BREKAGE, VARIFIED BY", "Brekage" in glass or "BREKAGE" in glass, glass[:200])
    check("...its weeks dash for dash: Week - 1, Week – 2", "Week - 1" in glass and "Week – 2" in glass and "VARIFIED BY – HOD MAINTENANCE" in glass, glass[:300])
    shown = show_originals(page) or []
    check("...both of its pages can be seen", len(shown) == 2 and all(s["loaded"] for s in shown), shown)

    open_page(page, "#/document/mnt-pm-record", settle=1800)
    shown = show_originals(page) or []
    caps = " | ".join(s["caption"] for s in shown)
    check("F/MNT/02 shows Rev 01's two pages AND the superseded Rev 00, captioned so", len(shown) == 3 and all(s["loaded"] for s in shown) and "SUPERSEDED" in caps, shown)

    open_page(page, "#/document/mnt-yearly-pm-schedule", settle=1800)
    pm = written(page, PREVIEW)
    check("F/MNT/03 keeps the paper's 'Equipoment Name' and 'Monthaly'", "Equipoment Name" in pm and "Monthaly" in pm, pm[:200])

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nMaintenance holds its eight formats as the department issued them, fetches its machines from its own list, and reads every page under the revision it was made on.")
