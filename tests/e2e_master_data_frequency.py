"""The super admin sets every document's frequency (REQUIREMENTS s143, the owner, 29-Oct-2026).

Checks, against the production build on :8842:
  * Master Data's Documents / Formats tab shows a Frequency picker beside each document, none beside a reference one;
  * a change asks "Are you sure?" first (s138); No leaves the frequency as issued;
  * Yes saves it: the row says the new frequency, the Day View and the schedule follow it, a line in the activity log;
  * the sheets made before stand, and a shell for a day the new frequency does not name is gone;
  * As issued puts the paper's own frequency back.
"""
import sys
import time
from datetime import date, timedelta

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8842"
FAILURES = []
PASSWORD = "PlaywrightQA123"
ACCOUNT = (f"freq-{int(time.time() * 1000)}@example.com", "Frequency QA", "")
DOC = "qc-gsm-plate-calibration"  # F/QC/11, every Tuesday as issued (s130; F/QC/12 a sheet a month since s145)


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


def settle_briefing(page):
    for _ in range(20):
        if page.locator("button:has-text('Got it')").count():
            page.locator("button:has-text('Got it')").first.click()
            page.wait_for_timeout(200)
            return
        page.wait_for_timeout(100)


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


def sign_in(page, email, name, department):
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(500)
    page.fill("#login-email", email)
    page.fill("#login-password", PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    if not page.locator(".app-sidebar").count():
        page.click("text=Sign up")
        page.wait_for_timeout(300)
        page.fill("#signup-name", name)
        page.fill("#signup-email", email)
        page.fill("#signup-password", PASSWORD)
        page.fill("#signup-confirm", PASSWORD)
        if department:
            page.select_option("#signup-department", department)
        page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(1300)
    dismiss(page)


def goto(page, route, settle=1200):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def sure(page, yes=True, timeout=4000):
    button = f"[data-action='{'sure-yes' if yes else 'sure-no'}']"
    try:
        page.wait_for_selector(button, state="visible", timeout=timeout)
    except Exception:
        return None
    said = page.locator("[data-section='sure-first']").inner_text()
    page.click(button)
    page.wait_for_timeout(500)
    return said


def master(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:master') || '{}')")


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def open_documents_tab(page):
    goto(page, "#/master-data")
    page.locator(".pill-tab", has_text="Documents / Formats").first.click()
    page.wait_for_timeout(600)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    sign_in(page, *ACCOUNT)

    # The shells the schedule makes for this month (the generator runs on the calendar / day view).
    goto(page, "#/calendar")
    before = [r for r in records(page) if r["documentId"] == DOC and not r.get("isDemo")]
    weekly_shells = sorted(r["dueDate"] for r in before if r["status"] in ("Due", "Scheduled"))

    open_documents_tab(page)
    cell = page.locator(f"[data-cell='frequency'][data-document='{DOC}']")
    check("Master Data's Documents tab shows a Frequency picker beside F/QC/11", cell.count() == 1 and cell.locator("[data-field='frequency-kind']").count() == 1)
    check("...its choice as issued: every week", cell.locator("[data-field='frequency-kind']").input_value() == "weekly", cell.locator("[data-field='frequency-kind']").input_value() if cell.count() else None)
    ref_cells = page.locator("[data-cell='frequency']:not(:has([data-field='frequency-kind']))")
    check("...and none beside a reference document (a licence, a chart)", ref_cells.count() >= 1, ref_cells.count())

    # A change asks first; No leaves it.
    cell.locator("[data-field='frequency-kind']").select_option("monthly")
    page.wait_for_timeout(300)
    cell.locator("[data-field='frequency-day']").fill("5")
    cell.locator("[data-action='frequency-save']").click()
    asked = sure(page, yes=False)
    # (the sentence reads "falls due day 5 of each month": the label's first letter lowered mid-sentence)
    check("Set asks first: Are you sure? - saying the new frequency and that the sheets already made stand", bool(asked) and "day 5 of each month" in asked.lower() and "stand as they are" in asked, asked)
    check("...No: nothing is saved", not (master(page).get("scheduleOverrides") or {}).get(DOC), master(page).get("scheduleOverrides"))

    # Yes saves it.
    cell.locator("[data-action='frequency-save']").click()
    check("...asked again, Yes, I am sure", bool(sure(page)))
    page.wait_for_timeout(800)
    saved = (master(page).get("scheduleOverrides") or {}).get(DOC) or {}
    check(
        "Saved as Master Data's scheduleOverrides: monthly on the 5th, from today, by the super admin",
        saved.get("schedule") == {"type": "monthly", "dayOfMonth": 5} and saved.get("frequency") == "Monthly" and saved.get("since") == date.today().isoformat() and saved.get("by") == "Frequency QA",
        saved,
    )
    page.reload()
    page.wait_for_timeout(1500)
    dismiss(page)
    page.locator(".pill-tab", has_text="Documents / Formats").first.click()
    page.wait_for_timeout(600)
    cell = page.locator(f"[data-cell='frequency'][data-document='{DOC}']")
    check("...and read again, the row shows it (every reader of the catalogue follows the override)", cell.locator("[data-field='frequency-kind']").input_value() == "monthly" and cell.locator("[data-action='frequency-issued']").count() == 1)

    # The schedule follows: the calendar's shells for the old Tuesdays are gone, a sheet for the 5th is made.
    goto(page, "#/calendar")
    page.wait_for_timeout(800)
    after = [r for r in records(page) if r["documentId"] == DOC and not r.get("isDemo")]
    today = date.today()
    future_old = [d for d in weekly_shells if d > today.isoformat()]
    still_old = sorted(r["dueDate"] for r in after if r["status"] in ("Due", "Scheduled") and r["dueDate"] in future_old)
    check("The schedule's blank shells for the coming Tuesdays are gone (s130 removeOffScheduleShells)", not still_old, (future_old, still_old))
    # The sheets already made (written on, or past) stand: nothing before today was removed.
    before_ids = {r["id"] for r in before if r["dueDate"] <= today.isoformat()}
    after_ids = {r["id"] for r in after}
    check("...and the sheets of days already past stand as they were", before_ids <= after_ids, before_ids - after_ids)

    # The activity log has a line.
    goto(page, "#/activity")
    body = page.locator(".app-content").inner_text()
    check("The activity log says the frequency changed, to what and from when", "Frequency changed" in body and "Day 5 of each month" in body, body[:400])

    # As issued puts the paper's own back.
    open_documents_tab(page)
    cell = page.locator(f"[data-cell='frequency'][data-document='{DOC}']")
    cell.locator("[data-action='frequency-issued']").click()
    asked = sure(page)
    check("As issued asks first too, naming the issued frequency", bool(asked) and "Every Tue" in asked, asked)
    page.wait_for_timeout(600)
    check("...and the override is dropped", not (master(page).get("scheduleOverrides") or {}).get(DOC), master(page).get("scheduleOverrides"))

    check("No page error", not errors, errors[:3])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe super admin sets every document's frequency, and the schedule follows.")
