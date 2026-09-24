"""Insights: what the plant's records show when they are read together
(REQUIREMENTS s75), asked for on 24-Sep-2026 - "my aim is that i want to make
superintelligent system not only basic audit project".

  * /insights is a page of its own, linked from the sidebar for every account;
  * every insight is worked out by fixed rules from records people wrote and
    names the records it was read from - here, from the company's own seeded
    papers: the 2025 lux round against the 2024 one (the QC Lab's colour-matching
    cabinet lost 45% of its light), and row M-68 of F/MNT/01, printed one column
    out of step;
  * the Dashboard shows the three that matter most, and links to the page;
  * an insight is RAISED AS A CAPA only on a click: the finding lands on this
    month's internal CAPA report, remembers the insight it came from, and the
    same insight is not offered again while it is open;
  * a department account reads only its own documents' insights.

Anchored on insight ids (data-insight), never on counts: other suites add their
own records, and "days ago" moves with the real clock.

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

LUX_CABINET = "m1|qc lab - colour matching cabinet|2025-08-12"
OUT_OF_STEP = "m2|out-of-step|M-68"
CARD = lambda iid: f"[data-section='insights-list'] [data-insight='{iid}']"


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


def open_insights(page):
    """Opens /insights and waits until the insights are worked out (they are
    worked out after the page paints, a slice at a time)."""
    open_page(page, "#/insights", settle=600)
    try:
        page.wait_for_selector("[data-section='insights-summary']", timeout=30000)
    except Exception:
        pass
    page.wait_for_timeout(400)


def shown_ids(page):
    return page.locator("[data-section='insights-list'] [data-insight]").evaluate_all("els => els.map((e) => e.getAttribute('data-insight'))")


def shown_modules(page):
    return sorted(set(page.locator("[data-section='insights-list'] [data-insight]").evaluate_all("els => els.map((e) => e.getAttribute('data-module'))")))


def all_cards(page):
    """Every card, not only the first batch the progressive list draws."""
    for _ in range(20):
        total = int(page.locator("[data-section='insights-list']").get_attribute("data-count") or 0) if page.locator("[data-section='insights-list']").count() else 0
        if len(shown_ids(page)) >= total:
            break
        page.wait_for_timeout(300)


def search(page, words):
    """Types into the one search box and waits for the records index."""
    open_page(page, "#/search", settle=800)
    page.fill("[data-field='search-query']", words)
    try:
        page.wait_for_selector("[data-search-record], .doc-table tbody tr:has-text('No matches.')", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(600)
    return page.locator("[data-search-record]").evaluate_all("els => els.map((e) => ({ id: e.getAttribute('data-search-record'), text: e.innerText }))")


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def logged_in(page):
    return page.locator(".app-sidebar").count() > 0


def sign_up(page, name, department):
    """A fresh account, with that department ('' = every department)."""
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(800)
    if logged_in(page):
        page.locator("button[title='Log Out']").first.click()
        # Every log-out asks about the day's work first (REQUIREMENTS s72).
        page.wait_for_timeout(500)
        ok = page.locator("[data-action='logout-review-confirm']")
        if ok.count():
            ok.first.click()
        page.wait_for_timeout(900)
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", name)
    page.fill("#signup-email", f"insights-{department or 'all'}-{int(time.time() * 1000)}@example.com".lower())
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    if department:
        page.select_option("#signup-department", department)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ==================================================================
    # 1. The page, for an account that sees every department
    # ==================================================================
    print("\n==== Insights, every department ====")
    sign_up(page, "Insights All QA", "")
    check("Insights is in the sidebar", page.locator(".app-sidebar a[href='#/insights']").count() == 1)
    page.locator(".app-sidebar a[href='#/insights']").first.click()
    page.wait_for_selector("[data-page='insights']", timeout=15000)
    check("The link opens the Insights page", page.locator("[data-page='insights'] h1").count() == 1, page.url)
    open_insights(page)
    summary = page.locator("[data-section='insights-summary']")
    check("The insights are worked out and counted by severity", summary.count() == 1 and int(summary.get_attribute("data-total") or 0) >= 2, summary.count())
    basis = page.locator("[data-section='insights-basis']")
    check("...and the page says how many written records they were read from", basis.count() == 1 and int(basis.get_attribute("data-records") or 0) > 0, basis.inner_text() if basis.count() else "")
    all_cards(page)
    ids = shown_ids(page)

    # ---- the lux round: worked out from the two seeded papers ----
    lux = page.locator(CARD(LUX_CABINET))
    check("The 2025 lux round read against the 2024 one: the QC Lab's colour-matching cabinet", lux.count() == 1, ids)
    if lux.count():
        text = lux.inner_text()
        check("...lost 45% of its light, 1863 to 1025 lux, and it is marked high", "45%" in text and "1863" in text and "1025" in text and lux.get_attribute("data-severity") == "high", text[:400])
        check("...in the Maintenance module, from rule M1", lux.get_attribute("data-module") == "Maintenance" and lux.get_attribute("data-rule") == "M1")
        evidence = lux.locator("[data-evidence]").evaluate_all("els => els.map((e) => e.getAttribute('data-evidence'))")
        check("...naming both rounds it was read from, each a link", "seed-mnt-lux-2025" in evidence and "seed-mnt-lux-2024" in evidence, evidence)

    step = page.locator(CARD(OUT_OF_STEP))
    check("F/MNT/01's row M-68, printed one column out of step, is pointed out", step.count() == 1 and step.get_attribute("data-severity") == "medium", ids)

    # ---- the filters ----
    page.locator("[data-filter='module'] [data-module='Maintenance']").first.click()
    page.wait_for_timeout(500)
    mods = shown_modules(page)
    check("Filtered to Maintenance, only Maintenance's insights are listed", mods == ["Maintenance"], mods)
    page.locator("[data-filter='severity'] [data-severity-filter='high']").first.click()
    page.wait_for_timeout(500)
    sev = sorted(set(page.locator("[data-section='insights-list'] [data-insight]").evaluate_all("els => els.map((e) => e.getAttribute('data-severity'))")))
    check("...and to high, only high ones", sev == ["high"], sev)
    page.locator("[data-filter='module'] [data-module='all']").first.click()
    page.locator("[data-filter='severity'] [data-severity-filter='all']").first.click()
    page.wait_for_timeout(500)

    # ---- "Where to look" ----
    if lux.count():
        lux.locator("[data-action='open-insight']").first.click()
        page.wait_for_timeout(1200)
        check('"Where to look" opens the lux document', "mnt-lux-level" in page.url or "seed-mnt-lux" in page.url, page.url)

    # ==================================================================
    # 2. The Dashboard shows the three that matter most
    # ==================================================================
    print("\n==== The Dashboard ====")
    open_page(page, "#/dashboard", settle=600)
    try:
        page.wait_for_selector("[data-section='dashboard-insights']", timeout=30000)
    except Exception:
        pass
    card = page.locator("[data-section='dashboard-insights']")
    check("The Dashboard has a card of what the records show", card.count() == 1)
    if card.count():
        rows = card.locator("[data-insight]").evaluate_all("els => els.map((e) => e.getAttribute('data-insight'))")
        check("...at most three, none of them low", 1 <= len(rows) <= 3 and not any(r.startswith(("m2|location", "m2|year", "m1|summary")) for r in rows), rows)
        check("...counting every insight by severity", int(card.get_attribute("data-high") or 0) >= 1, card.inner_text()[:300])
        card.locator("[data-action='open-insights']").first.click()
        page.wait_for_timeout(1000)
        check("...and its link opens the Insights page", page.locator("[data-page='insights']").count() == 1, page.url)

    # ==================================================================
    # 3. Raise CAPA, on a click, once
    # ==================================================================
    print("\n==== Raise CAPA ====")
    open_insights(page)
    all_cards(page)
    lux = page.locator(CARD(LUX_CABINET))
    before = [r for r in records(page) if r.get("documentId") == "gap-inspection"]
    raised_before = lux.locator("[data-state='capa-raised']").count() if lux.count() else 0
    check("Nothing is raised until someone asks: the card offers Raise CAPA", lux.count() == 1 and (lux.locator("[data-action='raise-capa']").count() == 1 or raised_before == 1))
    if lux.count() and raised_before == 0:
        lux.locator("summary").first.click()
        page.wait_for_timeout(300)
        suggested = lux.locator("[data-section='insight-suggested-capa']").inner_text()
        check("...and shows, before the click, what the CAPA finding will say", "Finding:" in suggested and "Corrective action:" in suggested, suggested[:300])
        lux.locator("[data-action='raise-capa']").first.click()
        page.wait_for_timeout(1800)
        dismiss(page)
        close_assistant(page)
        check("Raise CAPA opens the internal CAPA report", "#/gap/" in page.url, page.url)
    after = [r for r in records(page) if r.get("documentId") == "gap-inspection"]
    findings = [f for r in after for f in ((r.get("data") or {}).get("findings") or []) if f.get("insightKey") == LUX_CABINET]
    check("The finding is on the report, remembering the insight it was raised from", len(findings) == 1, [f.get("insightKey") for r in after for f in ((r.get("data") or {}).get("findings") or [])][:12])
    if findings:
        f = findings[0]
        check("...naming the lux rounds it was read from", "seed-mnt-lux-2025" in (f.get("sourceRecordIds") or []), f.get("sourceRecordIds"))
        check("...Open, internal, with a target date", f.get("status") == "Open" and f.get("source") == "Internal" and bool(f.get("targetDate")), f)
    check("No second CAPA report was started for it when one was already open this month", len(after) - len(before) <= 1, (len(before), len(after)))

    open_insights(page)
    all_cards(page)
    lux = page.locator(CARD(LUX_CABINET))
    check("Back on Insights, the card says the CAPA is raised", lux.count() == 1 and lux.locator("[data-state='capa-raised']").count() == 1)
    check("...and does not offer to raise it again", lux.count() == 1 and lux.locator("[data-action='raise-capa']").count() == 0)
    if lux.count() and lux.locator("[data-action='open-capa']").count():
        lux.locator("[data-action='open-capa']").first.click()
        page.wait_for_timeout(1200)
        check("...and opens the CAPA it was raised on", "#/gap/" in page.url, page.url)

    # ==================================================================
    # 4. One search over what every record says
    # ==================================================================
    print("\n==== Search ====")
    hits = search(page, "usimeca")
    master = [h for h in hits if h["id"] == "seed-mnt-equipment-list"]
    check("A word written inside a record finds it: \"usimeca\" finds the equipment master", len(master) == 1, hits[:5])
    check("...showing where it was written: M-68's Machine Name / Model No.", bool(master) and "M-68" in master[0]["text"] and "DCM Usimeca" in master[0]["text"], master[:1])
    hits = search(page, "m-13 lux")
    check("Every word must be there: \"m-13 lux\" finds no record", not any(h["id"] == "seed-mnt-equipment-list" for h in hits), hits[:5])

    # ==================================================================
    # 5. A department account reads only its own
    # ==================================================================
    print("\n==== Scope ====")
    sign_up(page, "Insights MNT QA", "MNT")
    open_insights(page)
    all_cards(page)
    ids = shown_ids(page)
    mods = shown_modules(page)
    check("A Maintenance account sees the lux and M-68 insights", LUX_CABINET in ids and OUT_OF_STEP in ids, ids)
    check("...and nothing of any other module", mods == ["Maintenance"], mods)
    # The internal CAPA report is Quality Assurance's (documentDepartments.ts):
    # an account that cannot open it is not offered to write on it.
    check("...and is not offered Raise CAPA on a report it cannot open", page.locator("[data-action='raise-capa']").count() == 0 and page.locator("[data-section='insight-suggested-capa']").count() == 0)
    sign_up(page, "Insights QC QA", "QC")
    open_insights(page)
    all_cards(page)
    ids = shown_ids(page)
    check("A Quality Control account sees none of Maintenance's", not any(i.startswith(("m1|", "m2|", "m3|", "m4|", "m5|", "m6|", "m7|")) for i in ids), ids)
    empty = page.locator("[data-section='insights-empty']").count()
    check("...and when it has none, the page says so honestly instead of showing a blank", len(ids) > 0 or empty == 1, (ids, empty))
    hits = search(page, "usimeca")
    check("...and its search does not reach into Maintenance's records", not hits and "No matches." in page.locator(".app-content").inner_text(), hits[:5])

    check("No page errors", not errors, errors[:5])
    browser.close()

print(f"\n{len(FAILURES)} failure(s)")
for f in FAILURES:
    print("  -", f)
sys.exit(1 if FAILURES else 0)
