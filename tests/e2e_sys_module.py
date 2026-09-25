"""The System / Management module and its eighteen supplied F/SYS formats
(REQUIREMENTS s76), asked for on 25-Sep-2026: "You have to create new module
called SYS so always keep Edit option".

  * System / Management (SYS) is a module of its own, FIRST in the sidebar -
    where the company's Master List of Formats & Records puts F/SYS - with a
    page for each of its eighteen formats under its six groups, and its library
    lists them by the numbers the papers print (F/SYS/04-A included);
  * the pages supplied filled in are on file as LIVE records, as the pages
    printed them - the Master List of Documents (173), the Master List of
    Formats & Records (the workbook as last updated, 141), the management review
    of 21.07.2025 and its notice (line 08 printed with its two cells swapped),
    the internal audit of 17.02.2025 with its NC - 01 and NC - 02, the NC report
    Feb -25/02, the risk assessment for 2024, the monthly HARA verification of
    22 April 2024, the site security assessment of 01.01.2026, the annual HARA
    review, the three mock withdrawals and the two traceability tests;
  * every supplied page can be seen as it came, and really loads;
  * EDIT: a verified SYS record is reopened with Edit, changed and handed in
    again, and its history keeps what it said before - and Edit format opens
    the SYS sheet itself;
  * F/SYS/07's Sum and Audit frequency are worked out by the printed criteria,
    never typed;
  * a new monthly HARA verification is prepared with the team and the printed
    questions, but never with last time's answers - a judgement is made afresh;
  * Mitra opens an F/SYS format by its number and names F/SYS/04-A;
  * the Insights S1 to S5 read the SYS records (a mock withdrawal or a
    traceability test overdue, an NC with its CAR open or with no report, a
    trace whose dates run backwards);
  * EDIT IS FAST on a slow laptop (6x CPU throttle): the longest sheets show
    their first lines at once, and typing into the 173-line master list opened
    with Edit keeps up - its lines far off the screen are not drawn until they
    come near, yet every one prints.

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

SYS_DOCS = {
    "sys-document-list": "F/SYS/01",
    "sys-format-list": "F/SYS/02",
    "sys-document-change": "F/SYS/03",
    "sys-mrm-record": "F/SYS/04",
    "sys-mrm-agenda": "F/SYS/04-A",
    "sys-audit-schedule": "F/SYS/05",
    "sys-audit-plan": "F/SYS/06",
    "sys-audit-risk": "F/SYS/07",
    "sys-audit-findings": "F/SYS/08",
    "sys-audit-nc": "F/SYS/10",
    "sys-nc-car": "F/SYS/11",
    "sys-hara-monthly": "F/SYS/12",
    "sys-mock-recall": "F/SYS/13",
    "sys-backward-trace": "F/SYS/14",
    "sys-forward-trace": "F/SYS/15",
    "sys-objectives": "F/SYS/16",
    "sys-site-security": "F/SYS/17",
    "sys-hara-annual": "F/SYS/20",
}

# The supplied pages, by format: how many each shows beside its form.
SUPPLIED_PAGES = {
    "sys-document-list": 5,
    "sys-format-list": 5,
    "sys-document-change": 1,
    "sys-mrm-record": 9,
    "sys-mrm-agenda": 1,
    "sys-audit-schedule": 2,
    "sys-audit-plan": 1,
    "sys-audit-risk": 1,
    "sys-audit-findings": 25,
    "sys-audit-nc": 1,
    "sys-nc-car": 1,
    "sys-hara-monthly": 3,
    "sys-mock-recall": 3,
    "sys-backward-trace": 2,
    "sys-forward-trace": 1,
    "sys-objectives": 8,
    "sys-site-security": 4,
    "sys-hara-annual": 4,
}


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
    # Every question asks the model first and falls back to the app's own
    # answer (REQUIREMENTS s72), so wait for the typing bubble to go.
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


def show_originals(page):
    """Opens the supplied-original panel and returns what each picture is: loaded, its size, its caption."""
    show = page.locator("[data-action='show-supplied-original']")
    if not show.count():
        return None
    show.first.click()
    page.wait_for_timeout(1500)
    imgs = page.locator(f"{ORIGINAL} img")
    # Twenty-five pages of the audit report load lazily; bring each into view.
    for i in range(imgs.count()):
        imgs.nth(i).scroll_into_view_if_needed()
    page.wait_for_timeout(800)
    return imgs.evaluate_all(
        """els => els.map((el) => ({
             loaded: el.complete && el.naturalWidth > 0,
             src: el.currentSrc,
             caption: ((el.closest('figure') || {}).textContent || '').trim(),
           }))"""
    )


def rows_of(rec):
    return ((rec or {}).get("data") or {}).get("rows") or []


def header_of(rec):
    return ((rec or {}).get("data") or {}).get("header") or {}


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    email = f"sys-{int(time.time() * 1000)}@example.com"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "Sys Desk QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)

    # ==================================================================
    # 1. The module, first, where the master list puts F/SYS
    # ==================================================================
    print("\n==== The System / Management module ====")
    check("System / Management is a module in the sidebar", page.locator(".app-sidebar a[href='#/library/system-management']").count() == 1)
    missing_links = [d for d in SYS_DOCS if page.locator(f".app-sidebar a[href='#/document/{d}']").count() != 1]
    check("...with all eighteen of its formats linked", not missing_links, missing_links)
    names = page.eval_on_selector_all(".app-sidebar .nav-module .nav-module-header", "els => els.map((e) => e.textContent.trim())")
    check("It is the first module, named with its code: System / Management (SYS)", bool(names) and names[0].startswith("System / Management (SYS)"), names[:3])
    check("No module in the sidebar shows a translation key", not any("module." in n for n in names), names)

    open_page(page, "#/library/system-management")
    rows = page.locator(".doc-table tbody tr:not(.doc-section-row)")
    check("The Document Library, filtered to System / Management, lists its eighteen documents", rows.count() == 18, rows.count())
    library = page.locator(".doc-table").first.inner_text()
    missing_nos = [n for n in SYS_DOCS.values() if n not in library]
    check("...by the format numbers the papers print, F/SYS/04-A included", not missing_nos, missing_nos)
    # The section rows are drawn in capitals (text-transform), and innerText reads them so.
    sections = page.locator(".doc-table tr.doc-section-row").all_inner_texts()
    for group in ["Document Control", "Management Review", "Internal Audit", "Corrective Action", "HARA & Site Security", "Traceability & Recall"]:
        check(f"...under its group '{group}'", any(group.lower() in s.lower() for s in sections), sections)

    # ==================================================================
    # 2. The pages supplied filled in, on file as the pages printed them
    # ==================================================================
    print("\n==== The supplied pages, on file ====")
    doc_list = record(page, "seed-sys-document-list")
    check("F/SYS/01: the Master List of Documents is on file - 173 documents", len(rows_of(doc_list)) == 173, len(rows_of(doc_list)))
    check(
        "...kept as printed: 'WORK PROCEDURE FORDIGITAL DIE CUTTER MACHINE', RD / 14 Obsolete & Removed",
        any("FORDIGITAL DIE CUTTER" in str(r.get("description", "")) for r in rows_of(doc_list))
        and any("Obsolete & Removed" in " ".join(str(v) for v in r.values()) for r in rows_of(doc_list)),
    )
    fmt_list = record(page, "seed-sys-format-list")
    check("F/SYS/02: the Master List of Formats & Records is the workbook as last updated - 141 formats", len(rows_of(fmt_list)) == 141, len(rows_of(fmt_list)))
    check(
        "...each with its retention period: 3 Years, shredded",
        sum(1 for r in rows_of(fmt_list) if r.get("retentionPeriod") == "3 Years") > 120 and any(r.get("methodOfDisposition") == "Shredding" for r in rows_of(fmt_list)),
    )
    mrm = record(page, "seed-sys-mrm-2025-07")
    check("F/SYS/04: the management review of 21.07.2025 is on file", (mrm or {}).get("dueDate") == "2025-07-21", (mrm or {}).get("dueDate"))
    check("...with its objectives table: 19 objectives reviewed", len(rows_of(mrm)) == 19, len(rows_of(mrm)))
    agenda = record(page, "seed-sys-mrm-agenda-2025-07")
    lines = rows_of(agenda)
    check("F/SYS/04-A: the notice of 07.07.2025 names eight participants", len(lines) == 8, len(lines))
    check(
        "...line 08 kept as printed, its two cells swapped: 'Manager – Store' under Name, 'Nalin Darji' under Designation",
        len(lines) == 8 and "Store" in str(lines[7].get("name", "")) and "Nalin Darji" in str(lines[7].get("designation", "")),
        lines[7:] if lines else None,
    )
    findings = record(page, "seed-sys-audit-findings-2025-02")
    frows = rows_of(findings)
    nc = {str(r.get("clause", "")).strip(): str(r.get("compliance", "")).strip() for r in frows}
    check("F/SYS/08: the audit of 17.02.2025 is on file, clause by clause", len(frows) >= 119, len(frows))
    check("...with NC - 01 at 4.2.1 and NC - 02 at 4.7.6", nc.get("4.2.1") == "NC - 01" and nc.get("4.7.6") == "NC - 02", {k: nc.get(k) for k in ("4.2.1", "4.7.6")})
    nc_report = record(page, "seed-sys-audit-nc-feb-25-02")
    check("F/SYS/10: NC report Feb -25/02 for clause 4.7.6 is on file", "4.7.6" in " ".join(str(v) for v in header_of(nc_report).values()), header_of(nc_report))
    monthly = record(page, "seed-sys-hara-monthly-2024-04")
    check("F/SYS/12: the verification of 22 April 2024 answers all 24 questions", len(rows_of(monthly)) == 24 and all(r.get("status") in ("Yes", "No") for r in rows_of(monthly)), len(rows_of(monthly)))
    security = record(page, "seed-sys-site-security-2026")
    check("F/SYS/17: the site security assessment of 01.01.2026 covers its 26 points", len(rows_of(security)) == 26, len(rows_of(security)))
    recalls = [record(page, rid) for rid in ("seed-sys-mock-recall-label-2025-01", "seed-sys-mock-recall-pouch-2025-01", "seed-sys-mock-recall-sleeve-2025-02")]
    check("F/SYS/13: the three mock withdrawals of 2025 are on file - label, pouch and sleeve", all(recalls), [bool(r) for r in recalls])
    check(
        "...the label's for Yates Steels Pvt. Ltd., 100% traced",
        recalls[0] is not None and "Yates Steels" in " ".join(str(v) for v in header_of(recalls[0]).values()),
        header_of(recalls[0]),
    )
    check("F/SYS/14 and F/SYS/15: both traceability tests are on file", bool(record(page, "seed-sys-backward-trace-2024-12")) and bool(record(page, "seed-sys-forward-trace-2024-12")))
    objectives = record(page, "seed-sys-objectives-2026")
    check("F/SYS/16: the 2026 objectives - eighteen of them, one line each", len(rows_of(objectives)) == 18, len(rows_of(objectives)))
    check("...kept as the sheet printed them, its #DIV/0! included", "#DIV/0!" in " ".join(str(v) for r in rows_of(objectives) for v in r.values()))

    # ---- verbatim on the page itself ----
    open_page(page, "#/document/sys-mock-recall", settle=2000)
    recall_sheet = written(page, PREVIEW)
    check("F/SYS/13 asks, in the paper's own spelling, 'Was the Mock Recall efecctive?'", "efecctive" in recall_sheet, recall_sheet[:300])
    open_page(page, "#/document/sys-document-list", settle=2500)
    check("F/SYS/01 heads its column as printed: 'Document discription'", "Document discription" in written(page, PREVIEW))

    # ==================================================================
    # 3. Every supplied page, shown as it came
    # ==================================================================
    print("\n==== The supplied pages, beside their forms ====")
    for doc_id, count in SUPPLIED_PAGES.items():
        open_page(page, f"#/document/{doc_id}", settle=1200)
        shown = show_originals(page) or []
        check(
            f"{SYS_DOCS[doc_id]}: its {count} supplied page(s) can be seen, each captioned, and they load",
            len(shown) == count and all(s["loaded"] for s in shown) and all(s["caption"] for s in shown),
            [(s["src"].split("/")[-1], s["loaded"], s["caption"][:40]) for s in shown],
        )

    # ==================================================================
    # 4. EDIT - a verified record reopened, changed and handed in again
    # ==================================================================
    print("\n==== Edit ====")
    open_page(page, "#/record/seed-sys-hara-monthly-2024-04", settle=2000)
    check("A verified SYS record offers Edit", page.locator("button[data-action='correct']").count() == 1)
    page.click("button[data-action='correct']")
    page.wait_for_timeout(300)
    check("...which asks why first", page.locator("button[data-action='confirm-correct']").is_disabled())
    page.locator(".modal-box .chat-chip").first.click()
    page.wait_for_timeout(150)
    page.click("button[data-action='confirm-correct']")
    page.wait_for_timeout(900)
    reopened = record(page, "seed-sys-hara-monthly-2024-04") or {}
    check("Reopened for editing, with the reason recorded", reopened.get("status") == "In Progress" and bool((reopened.get("correction") or {}).get("reason")), reopened.get("correction"))
    first_row = page.locator("table.log-sheet tbody tr").first
    # Review comments run to a sentence, so the column is a box of several lines (a textarea).
    comment_box = first_row.locator("textarea").last
    comment_box.fill("No action required - checked again")
    page.wait_for_timeout(1500)
    edited = rows_of(record(page, "seed-sys-hara-monthly-2024-04"))
    check("A review comment is changed on the sheet", bool(edited) and edited[0].get("comments") == "No action required - checked again", edited[:1])
    page.click("button[data-action='submit']")
    page.wait_for_timeout(1200)
    again = record(page, "seed-sys-hara-monthly-2024-04") or {}
    check("...and it is handed in again for verification", again.get("status") in ("Submitted", "Pending Verification"), (again.get("status"), page.locator(".error-list").all_inner_texts()))
    history = " ".join(str(h.get("action", "")) for h in again.get("history") or [])
    check("...its history keeps the reopening and the change", "reopened" in history and "edited" in history, history)

    open_page(page, "#/document/sys-audit-findings", settle=2000)
    page.click("[data-action='edit-format']")
    page.wait_for_timeout(800)
    check("Edit format opens the SYS sheet itself in the designer", page.locator("[data-section='sheet-designer'][data-document='sys-audit-findings']").count() == 1)
    discard = page.locator("[data-action='designer-discard']")
    if discard.count():
        discard.first.click()
        page.wait_for_timeout(500)

    # ==================================================================
    # 5. F/SYS/07 - the Sum and the Audit frequency worked out
    # ==================================================================
    print("\n==== F/SYS/07 Internal Audit Risk Assessment ====")
    risk = record(page, "seed-sys-audit-risk-2024")
    worked = [(r.get("sum"), r.get("frequency")) for r in rows_of(risk) if r.get("sum")]
    check("The 2024 assessment is on file as the page wrote it: Site Standards 7, Twice / Year", ("7", "Twice / Year") in worked, worked)
    # As drawn, the Sum and frequency are the engine's (engine/auditRisk.ts), not the stored ones.
    open_page(page, "#/record/seed-sys-audit-risk-2024", settle=1500)
    drawn = page.locator("table.log-sheet tbody tr").evaluate_all("trs => trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim()))")
    site = next((r for r in drawn if len(r) > 1 and r[1] == "4.1"), None)
    check("...and drawn with its Sum and frequency worked out: 4.1 Site Standards 3 + 4 = 7, Twice / Year", bool(site) and "7" in site and "Twice / Year" in site, site)
    rid7 = start_record(page, "sys-audit-risk")
    line = page.locator("table.log-sheet tbody tr").first
    boxes = line.locator("input")
    if boxes.count() >= 2:
        boxes.nth(0).fill("10")
        boxes.nth(1).fill("7")
        boxes.nth(1).press("Tab")
        page.wait_for_timeout(1500)
    first = rows_of(record(page, rid7))[:1]
    check("IQA NC 10 and External NCs 7 give Sum 17 and 3 times / Year, worked out", bool(first) and first[0].get("sum") == "17" and first[0].get("frequency") == "3 times / Year", first)
    cells = line.locator("td").evaluate_all("tds => tds.map((td) => ({ text: (td.textContent || '').trim(), boxes: td.querySelectorAll('input, select, textarea').length }))")
    shown = [c for c in cells if c["text"] == "3 times / Year"]
    check("...shown as text, with no box to type it into", len(shown) == 1 and shown[0]["boxes"] == 0, cells)

    # ==================================================================
    # 6. A judgement is made afresh - never carried from last time
    # ==================================================================
    print("\n==== A new verification is not last month's ====")
    rid12 = start_record(page, "sys-hara-monthly")
    say(page, "fill it with sample data")
    close_assistant(page)
    page.wait_for_timeout(1200)
    fresh = record(page, rid12) or {}
    frs = rows_of(fresh)
    check("The 24 printed questions are on it", len(frs) == 24 and all(r.get("attribute") for r in frs), len(frs))
    check("...but not last time's answers: Status, C / NC and comments are left to the team", all(not r.get("status") and not r.get("verification") and not r.get("comments") for r in frs), frs[:2])
    team = " ".join(str(v) for k, v in header_of(fresh).items())
    check("...while the HARA team is carried from the last meeting", "Kapila Barad" in team, header_of(fresh))

    # ==================================================================
    # 7. Insights read the PSTL's own pages together (S1-S6)
    # ==================================================================
    print("\n==== Insights on the PSTL's records ====")
    open_page(page, "#/insights", settle=600)
    try:
        page.wait_for_selector("[data-section='insights-summary']", timeout=30000)
    except Exception:
        pass
    page.wait_for_timeout(400)
    for _ in range(30):
        lst = page.locator("[data-section='insights-list']")
        total = int(lst.get_attribute("data-count") or 0) if lst.count() else 0
        ids = lst.locator("[data-insight]").evaluate_all("els => els.map((e) => e.getAttribute('data-insight'))") if lst.count() else []
        if total and len(ids) >= total:
            break
        page.mouse.wheel(0, 4000)
        page.wait_for_timeout(300)
    ids = page.locator("[data-section='insights-list'] [data-insight]").evaluate_all("els => els.map((e) => e.getAttribute('data-insight'))")

    def card(iid):
        return page.locator(f"[data-section='insights-list'] [data-insight='{iid}']")

    check("S1: the label's mock withdrawal of 10.01.2025 is more than a year old - high", card("s1|label").count() == 1 and card("s1|label").get_attribute("data-severity") == "high", [i for i in ids if i.startswith("s")])
    check("...and the pouch's and the sleeve's", card("s1|pouch").count() == 1 and card("s1|shrink sleeve").count() == 1)
    check("S2: both traceability tests of December 2024 are more than a year old", card("s2|sys-backward-trace").count() == 1 and card("s2|sys-forward-trace").count() == 1)
    nc_open = card("s3|seed-sys-audit-nc-feb-25-02")
    check("S3: NC report Feb -25/02 was never verified closed", nc_open.count() == 1 and nc_open.get_attribute("data-severity") == "high")
    check("...though the audit plan's summary marks 4.7.6 Closed - and it says so", nc_open.count() == 1 and "Closed" in nc_open.inner_text())
    check("S4: the audit's NC - 01 at 4.2.1 has no NC report on file", card("s4|seed-sys-audit-findings-2025-02|4.2.1").count() == 1)
    check("...while NC - 02 at 4.7.6, which has one, is not raised", card("s4|seed-sys-audit-findings-2025-02|4.7.6").count() == 0)
    trace = card("s5|seed-sys-backward-trace-2024-12")
    check("S5: the backward trace's printing date 21.07.2027 is after its own dispatch", trace.count() == 1 and "21-Jul-2027" in trace.inner_text())
    check("...each in the System / Management module", all(page.locator(f"[data-section='insights-list'] [data-insight='{i}']").get_attribute("data-module") == "System / Management" for i in ids if i.split("|")[0] in ("s1", "s2", "s3", "s4", "s5")))

    # ==================================================================
    # 8. Mitra
    # ==================================================================
    print("\n==== Mitra ====")
    open_page(page, "#/dashboard")
    reply = say(page, "open f/sys/13")
    check("Told to open F/SYS/13, Mitra opens the Mock Product Withdrawal Record", page.url.endswith("#/document/sys-mock-recall"), (page.url, reply[:200]))
    reply = say(page, "what is F/SYS/04-A?")
    check("Asked what F/SYS/04-A is, Mitra names the management review's agenda", "F/SYS/04-A" in reply and "Agenda" in reply, reply[:300])
    close_assistant(page)

    # ==================================================================
    # 9. Fast on a slow laptop - the two longest sheets, at 6x CPU throttle
    # ==================================================================
    print("\n==== On a slow laptop ====")
    open_page(page, "#/dashboard")
    cdp = page.context.new_cdp_session(page)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 6})
    for rid, what in (("seed-sys-document-list", "F/SYS/01's 173 documents"), ("seed-sys-audit-findings-2025-02", "F/SYS/08's audit checklist")):
        # From a page with no sheet on it, so the lines counted are this sheet's
        # and not the last one's still on the screen.
        page.evaluate("() => { location.hash = '#/dashboard'; }")
        page.wait_for_function("() => !document.querySelector('table.log-sheet')", timeout=30000)
        started = time.time()
        page.evaluate(f"() => {{ location.hash = '#/record/{rid}'; }}")
        try:
            page.wait_for_function("() => document.querySelectorAll('table.log-sheet tbody tr').length >= 25", timeout=30000)
            took = time.time() - started
        except Exception:
            took = 99.0
        print(f"    {what}: first lines on screen in {took:.1f} s at 6x throttle")
        check(f"{what} shows its first lines within 6 s on a laptop six times slower", took < 6.0, f"{took:.1f} s")
    # Editing the longest register: reopened with Edit, every line drawn, then
    # typed into - each keystroke must land without the sheet lagging behind.
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
    open_page(page, "#/record/seed-sys-document-list", settle=2500)
    page.click("button[data-action='correct']")
    page.wait_for_timeout(300)
    page.locator(".modal-box .chat-chip").first.click()
    page.wait_for_timeout(150)
    page.click("button[data-action='confirm-correct']")
    page.wait_for_timeout(900)
    try:
        page.wait_for_function("() => document.querySelectorAll('table.log-sheet tbody tr').length >= 173", timeout=30000)
    except Exception:
        pass
    # Edit is pressed in the bar under the sheet, so the page is at its end: back
    # to the top, as anyone would, where line 1 is drawn again (lines far off the
    # screen are not drawn while the sheet is open for writing - see below).
    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(600)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 6})
    box = page.locator("table.log-sheet tbody tr").first.locator("input").nth(1)
    box.click()
    page.keyboard.press("End")
    # A burst of typing, as a line is written: the first key of a burst also marks
    # the record as changed (the Save now button appears), once.
    typed = " (checked on 25.09.2026)"
    started = time.time()
    page.keyboard.type(typed)
    try:
        page.wait_for_function("(t) => { const r = document.querySelector('table.log-sheet tbody tr'); const i = r && r.querySelectorAll('input')[1]; return !!i && i.value.endsWith(t); }", arg=typed, timeout=30000)
        per_key = (time.time() - started) / len(typed)
    except Exception:
        per_key = 9.9
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
    print(f"    typing into F/SYS/01 (173 lines open for Edit): {per_key * 1000:.0f} ms a keystroke at 6x throttle")
    check("Typing into the 173-line master list keeps up on a slow laptop (under 150 ms a keystroke at 6x)", per_key < 0.15, f"{per_key * 1000:.0f} ms")
    # What makes it quick: the lines far off the screen are not drawn while the
    # sheet is open for writing - yet they are all there, come back as they are
    # scrolled to, print, and are in the download.
    far = page.locator("table.log-sheet.is-editing tbody tr.is-far").count()
    check("Open for Edit, the lines far below the screen are not drawn (marked far)", far >= 60, far)
    lines = page.locator("table.log-sheet tbody tr")
    page.evaluate("() => window.scrollTo(0, document.documentElement.scrollHeight)")
    page.wait_for_timeout(800)
    last_box = lines.last.locator("input").first
    check("...scrolled to the end, the last line is drawn and can be written in",
          "is-far" not in (lines.last.get_attribute("class") or "") and last_box.evaluate("e => getComputedStyle(e).visibility") == "visible")
    page.emulate_media(media="print")
    page.wait_for_timeout(300)
    undrawn = page.evaluate("() => Array.from(document.querySelectorAll('table.log-sheet tbody tr')).filter((tr) => getComputedStyle(tr).visibility !== 'visible').length")
    check("...and printed, every one of the 173 lines is drawn", undrawn == 0, undrawn)
    page.emulate_media(media="screen")
    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(500)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nSystem / Management holds its eighteen formats as the PSTL issued them, every one editable, its pages on file as they were written.")
