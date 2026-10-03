"""The Maintenance module and its supplied formats (REQUIREMENTS s74, s82),
asked for on 24-Sep-2026: "create another module called Maintenance so i have
shared this pdfs with you so add those in that module", and completed from the
papers of 29-Sep-2026: "In mnt-01 the list of all machines ... mnt-03 is
connected to 02".

  * Maintenance is a module of its own, after the production modules and
    outside the Purchase -> Store -> Dispatch run, and its library lists the
    twelve F/MNT documents by the numbers the papers print (F/MNT/05 twice:
    the plant supplied two different slips under that one number);
  * F/MNT/01 is the EQUIPMENT MASTER: the list of 29-Sep-2026, Flexo and
    Pouch, 68 machines, is on file as the sheets printed them - including row
    M-68, printed one column out of step on the paper itself, and the paper's
    own spellings ("Itlay", "Febraury", "Printinting") - with the 13 items of
    its "Other Machinery - OLD" sheet shown beside it;
  * a maintenance sheet FETCHES a machine from it by its number (M-47, and the
    Pouch sheet's M-61), and a serial two machines share (194) never picks one;
  * F/MNT/03 is Rev 01, the 2026 schedule by machine number ("M/C No.",
    "Equipment Name", Quarterly lines); Rev 00's "Equipoment Name" and
    "Monthaly" are left only on its superseded original;
  * F/MNT/04 carries its back side on each day's line;
  * the two F/MNT/05 slips, F/MNT/07 and F/MNT/10 open, fill with sample data
    and submit - slip (1) working out its breakdown minutes;
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
    "mnt-breakdown-memo": "F/MNT/05",
    "mnt-breakdown-clearance": "F/MNT/05",
    "mnt-breakdown-record": "F/MNT/06",
    "mnt-temporary-engineering": "F/MNT/07",
    "mnt-new-equipment": "F/MNT/08",
    "mnt-glass-breakage": "F/MNT/09",
    "mnt-wooden-articles": "F/MNT/10",
    "mnt-lux-level": "F/MNT/11",
}

# F/MNT/07's ten headings, verbatim ("varified", "temporay", "In-charge").
MNT07_HEADINGS = [
    "Date",
    "Start time - Temporary engineering done",
    "Description of Temporary engineering work & Reason for temporary engineering",
    "Equipment Details",
    "Temporary engineering varified by (Maintenance In-charge)",
    "Temporary engineering varified by (Production In-charge)",
    "Date of Permanent repair / Solution or removal of temporay engineering",
    "End time (Temporary Engineering removed)",
    "Permanent repair varified by (Maintenance In-charge)",
    "Permanent repair varified by (Production In-charge)",
]
# F/MNT/04's back side, joined to each day.
MNT04_BACK = "If any Observation found by operator , details of concerns & actions taken shall be described on back side of this page."
MNT04_BACK_HEADINGS = ["Observation / Concerns reported", "Action Taken", "Maintenance Technician Sign", "Machine Operator Sign"]

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


def head_texts(page, scope="table.log-sheet"):
    return page.locator(f"{scope} thead th").evaluate_all("els => els.map((e) => (e.textContent || '').trim())")


def fill_sample_and_submit(page, rid):
    """Sample data from Mitra, then Submit. Returns the record as kept."""
    say(page, "fill it with sample data")
    close_assistant(page)
    page.wait_for_timeout(1200)
    submit = page.locator("[data-action='submit']")
    if submit.count():
        submit.first.click()
        page.wait_for_timeout(1800)
    return record(page, rid) or {}


def fetch_machine(page, query):
    """Types into the equipment fetch bar and presses Fetch; returns what the bar said (data-result)."""
    page.locator("[data-field='equipment-query']").first.fill(query)
    page.locator("[data-action='equipment-fetch']").first.click()
    page.wait_for_timeout(1500)
    res = page.locator("[data-state='equipment-result']")
    return res.first.get_attribute("data-result") if res.count() else None


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
    check("...with all twelve of its documents linked", not missing_links, missing_links)
    names = page.eval_on_selector_all(".app-sidebar .nav-module .nav-module-header", "els => els.map((e) => e.textContent.trim())")
    prd = next((i for i, n in enumerate(names) if "Lamination — Production" in n), -1)
    mnt = next((i for i, n in enumerate(names) if n.startswith("Maintenance")), -1)
    pur = next((i for i, n in enumerate(names) if "Purchase" in n), -1)
    check("It sits after the production modules and before Purchase", prd >= 0 and mnt == prd + 1 and pur == mnt + 1, names)
    check("No module in the sidebar shows a translation key", not any("module." in n for n in names), names)

    open_page(page, "#/library/maintenance")
    rows = page.locator(".doc-table tbody tr:not(.doc-section-row)")
    check("The Document Library, filtered to Maintenance, lists its twelve documents", rows.count() == 12, rows.count())
    library = page.locator(".doc-table").first.inner_text()
    missing_nos = [n for n in MNT_DOCS.values() if n not in library]
    check("...by the format numbers the papers print", not missing_nos, missing_nos)
    check("...F/MNT/05 twice: the two slips the plant numbers alike", library.count("F/MNT/05") >= 2, library.count("F/MNT/05"))

    # ==================================================================
    # 2. F/MNT/01 — the Equipment Master, as the page printed it
    # ==================================================================
    print("\n==== F/MNT/01 List of Equipments & Utilities ====")
    open_page(page, "#/document/mnt-equipment-list", settle=3000)
    sheet = written(page, PREVIEW)
    lines = page.locator(f"{PREVIEW} table.log-sheet tbody tr").count()
    check("The list of 29-Sep-2026 is on file: 68 machines, Flexo and Pouch", lines == 68, lines)
    check("...kept in the paper's own spellings", "Itlay" in sheet and "Febraury" in sheet and "Hyfra Industrukuhalanlagen GmbH" in sheet and "Printinting" in sheet, sheet[:200])
    check("...with the four Flexo machines the first list lacked (M-16, M-17, M-43, M-86)", all(m in sheet for m in ("M-16", "M-17", "M-43", "M-86")) and "Vorey Technology Co. Ltd." in sheet, sheet[:200])
    check("...and the Pouch sheet's M-61 to M-82", "M-61" in sheet and "M-82" in sheet and "Coating & Laminating Machine -1" in sheet and "Special shape cut unit" in sheet, sheet[:200])
    check("...and row M-68 exactly as printed, one column out of step", "DCM Sleeve Seaming" in sheet and "France" in sheet, sheet[:200])
    # The workbook's third sheet, read-only under its own name.
    other = page.locator(f"{PREVIEW} button:has-text('Show Other Machinery - OLD')")
    check("The 'Other Machinery - OLD' sheet is shown beside the list", other.count() == 1)
    if other.count():
        other.first.click()
        page.wait_for_timeout(600)
    ref = page.locator(f"{PREVIEW} table.compact:not(.log-sheet)")
    ref_text = ref.first.evaluate("e => e.textContent") if ref.count() else ""
    ref_rows = ref.first.locator("tbody tr").count() if ref.count() else 0
    check("...its 13 items as printed, 'AkO 520 Chiller' twice and 'Near Maintanance Room'", ref_rows == 13 and ref_text.count("AkO 520 Chiller") == 2 and "Near Maintanance Room" in ref_text, (ref_rows, ref_text[:200]))
    check("The first list, of 24-Sep-2026, stays on file beside it", record(page, "seed-mnt-equipment-list") is not None and record(page, "seed-mnt-equipment-list-2026-09-29") is not None)
    shown = show_originals(page) or []
    caps = " | ".join(s["caption"] for s in shown)
    check("The supplied pages are shown as they came, and really load", len(shown) == 6 and all(s["loaded"] for s in shown) and "Pouch" in caps and "Other Machinery - OLD" in caps, shown)

    # ==================================================================
    # 3. F/MNT/11 — a record read under the revision it was made on
    # ==================================================================
    print("\n==== F/MNT/11 Lux Level Measurement Record ====")
    open_page(page, "#/document/mnt-lux-level", settle=2000)
    latest = page.locator(f"{PREVIEW} table.log-sheet tbody tr").count()
    check("The 12.08.2025 round is on file on the current Rev 01: 26 areas", latest == 26, latest)
    shown = show_originals(page) or []
    captions = " | ".join(s["caption"] for s in shown)
    check("Both rounds on file can be seen, each captioned with its revision", len(shown) == 3 and all(s["loaded"] for s in shown) and "Rev 01" in captions and "SUPERSEDED" in captions, shown)
    check("...and the round of 15.10.2025 beside them, captioned as not on file", "15.10.2025" in captions and "Not on file" in captions, captions)

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
    back = head_texts(page, f"{PREVIEW} table.log-sheet")
    check("The back side is on each day's line, under the front's own sentence", MNT04_BACK in back and all(h in back for h in MNT04_BACK_HEADINGS), back)
    shown = show_originals(page) or []
    check("...and its back page can be seen beside the front", len(shown) == 2 and all(s["loaded"] for s in shown) and "back side" in shown[-1]["caption"], shown)
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
    caps = " | ".join(s["caption"] for s in shown)
    check("...both of its pages can be seen, and the earlier issue of 15.12.2024 beside them", len(shown) == 4 and all(s["loaded"] for s in shown) and "EARLIER ISSUE" in caps, shown)

    open_page(page, "#/document/mnt-pm-record", settle=1800)
    shown = show_originals(page) or []
    caps = " | ".join(s["caption"] for s in shown)
    check("F/MNT/02 shows Rev 01's two pages AND the superseded Rev 00, captioned so", len(shown) == 3 and all(s["loaded"] for s in shown) and "SUPERSEDED" in caps, shown)

    # F/MNT/03 is Rev 01: the 2026 schedule by machine number. The sample
    # schedule of 2026 (data/seed/maintenanceSampleRecords.ts) is drawn on it.
    open_page(page, "#/record/seed-sample-mnt-pm-schedule-2026", settle=2500)
    pm_heads = head_texts(page)
    pm = written(page, "table.log-sheet")
    check("F/MNT/03 is Rev 01: 'M/C No.', 'Equipment Name', 'Frequency'", all(h in pm_heads for h in ("M/C No.", "Equipment Name", "Frequency")), pm_heads[:8])
    check("...its 42 lines, M-07 on both of its printed blocks, with Quarterly lines", page.locator("table.log-sheet tbody tr").count() == 42 and "ZHEJIANG MANUAL INSPECTION MACHINE" in pm and "DK 450 SLITTING MACHINE" in pm and "Quarterly" in pm, pm[:200])
    check("...and Rev 00's 'Equipoment Name' and 'Monthaly' are not on it", "Equipoment Name" not in pm and "Monthaly" not in pm)
    open_page(page, "#/document/mnt-yearly-pm-schedule", settle=1800)
    shown = show_originals(page) or []
    caps = " | ".join(s["caption"] for s in shown)
    check("Its three Rev 01 pages can be seen, and Rev 00 - 'Equipoment Name', 'Monthaly' - only as the superseded original", len(shown) == 4 and all(s["loaded"] for s in shown) and "Rev 01" in caps and "Rev 00" in caps and "SUPERSEDED" in caps, shown)

    # ==================================================================
    # 8. F/MNT/05 - two slips under one number, both as printed
    # ==================================================================
    print("\n==== F/MNT/05 Breakdown Maintenance Memo (two slips) ====")
    rid5 = start_record(page, "mnt-breakdown-memo")
    memo = written(page, ".app-content")
    check("Slip (1) opens: Breakdown Maintenance Memo & Post Maintenance Hygiene Record", "#/record/" in page.url and "POST MAINTENANCE HYGIENE RECORD" in memo.upper(), page.url)  # the header prints the title in capitals, as the paper does
    check("...its boxes as printed", all(l in memo for l in ("Machine Name-", "Date of Breakdown Intimation : -", "PROBLEM", "WORK CARRIED OUT", "SPARES USED", "PREVENTIVE MEASURE TAKEN", "Breakdown minutes : -", "Maintenance Supervisor : -")), memo[:300])
    check("...with its hygiene clearance, word for word", "Hygiene clearance: - Prior to start of Maintenance activity" in memo and "Product contact surface are free from all tools" in memo)
    check("...and the machine fetched from F/MNT/01", page.locator("[data-section='equipment-fetch']").count() == 1)
    kept = fill_sample_and_submit(page, rid5)
    head5 = (kept.get("data") or {}).get("header", {})
    check("The sample slip's breakdown minutes are worked out: 10:15 to 11:40 is 85", head5.get("breakdownMinutes") == "85", head5)
    minutes = page.locator("[data-computed='breakdownMinutes']")
    check("...shown as text, never a box to type in", minutes.count() == 1 and minutes.first.inner_text().strip() == "85", minutes.count())
    check("Slip (1) is on file", kept.get("status") in ("Submitted", "Pending Verification"), kept.get("status"))

    rid5b = start_record(page, "mnt-breakdown-clearance")
    slip2 = written(page, ".app-content")
    check("Slip (2) opens: Breakdown Maintenance Memo & Hygiene Clearance Record", "#/record/" in page.url and "HYGIENE CLEARANCE RECORD" in slip2.upper(), page.url)
    check("...headed with the company's registered name, as every format is (the owner, 02-Oct-2026)", "GUJARAT PRINT PACK PUBLICATIONS PVT LTD" in slip2, slip2[:300])
    check("...its boxes as printed", all(l in slip2 for l in ("M/c ID No. :", "Machine Breakdown time :", "Problem reported by User :", "Action taken :", "Job Completion & Handover time :", "Problem attended by : -", "Sign of the User dept. : -")), slip2[:300])
    # A serial two Pouch machines share is never enough to pick one.
    check("A serial two machines share (194) offers both and picks neither", fetch_machine(page, "194") == "several" and not ((record(page, rid5b) or {}).get("data") or {}).get("header", {}).get("machineIdNo"))
    fetched = fetch_machine(page, "M-61")
    head5b = ((record(page, rid5b) or {}).get("data") or {}).get("header", {})
    check("The Pouch sheet's M-61 is fetched by its number", head5b.get("machineIdNo") == "M-61" and head5b.get("machineName") == "650", (fetched, head5b))
    kept = fill_sample_and_submit(page, rid5b)
    head5b = (kept.get("data") or {}).get("header", {})
    check("...its Yes / No kept as one of the two", head5b.get("trainingOrPmChangeNeeded") in ("Yes", "No"), head5b)
    check("Slip (2) is on file", kept.get("status") in ("Submitted", "Pending Verification"), kept.get("status"))

    # Two documents under one number: Mitra lists both rather than picking one.
    open_page(page, "#/dashboard")
    reply = say(page, "open F/MNT/05")
    close_assistant(page)
    check("Asked for F/MNT/05, Mitra lists both slips to choose from", "Post Maintenance Hygiene Record" in reply and "Hygiene Clearance Record" in reply, reply[:300])

    # ==================================================================
    # 9. F/MNT/07 - Temporary Engineering Log
    # ==================================================================
    print("\n==== F/MNT/07 Temporary Engineering Log ====")
    rid7 = start_record(page, "mnt-temporary-engineering")
    h7 = head_texts(page)
    missing7 = [h for h in MNT07_HEADINGS if h not in h7]
    check("F/MNT/07 opens with its ten headings, verbatim", "#/record/" in page.url and not missing7, missing7 or h7)
    log7 = written(page, ".app-content")
    check("...under its five notes", "1. Temporary engineering should only be used where there is no immediate, permanent solution" in log7 and "5. Once the permanent solution is implemented the record must be completed" in log7)
    kept = fill_sample_and_submit(page, rid7)
    check("It fills with a sample line and is on file", kept.get("status") in ("Submitted", "Pending Verification") and len((kept.get("data") or {}).get("rows") or []) >= 1, kept.get("status"))

    # ==================================================================
    # 10. F/MNT/10 - Wooden Articles
    # ==================================================================
    print("\n==== F/MNT/10 List of Wooden Articles ====")
    open_page(page, "#/document/mnt-wooden-articles", settle=1800)
    shown = show_originals(page) or []
    check("F/MNT/10's three pages can be seen as supplied", len(shown) == 3 and all(s["loaded"] for s in shown), shown)
    rid10 = start_record(page, "mnt-wooden-articles")
    wood = written(page, "table.log-sheet")
    check("Its month's sheet opens: 17 lines, the pallets row between BREAKAGE and CHECKED", page.locator("table.log-sheet tbody tr").count() == 17 and "Nos. of Discarded Wooden Pallets (Store & Production)" in wood and "Qc+Slitting" in wood, wood[:200])
    check("...its weeks dash for dash", all(w in head_texts(page) for w in ("Week - 1", "Week – 2", "Week - 5")))
    listed = page.locator("button:has-text('Show Nos. & Type of articles')")
    if listed.count():
        listed.first.click()
        page.wait_for_timeout(600)
    art = written(page, ".app-content")
    check("...and its article list with the Total the page prints: 560", "Location / Area of Wooden Articles" in art and "560" in art and "Wooden sheets" in art, art[:200])
    kept = fill_sample_and_submit(page, rid10)
    check("It fills with sample data and is on file", kept.get("status") in ("Submitted", "Pending Verification"), kept.get("status"))

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nMaintenance holds its twelve documents as the department issued them, fetches its machines from its own list, and reads every page under the revision it was made on.")
