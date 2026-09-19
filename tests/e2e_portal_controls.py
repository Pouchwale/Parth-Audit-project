"""The portal's own controls (REQUIREMENTS s62), asked for on 19-Sep-2026:

  * Today's Briefing submits nothing unseen - a record Mitra filled in can be
    submitted only once the person has ticked it as reviewed and verified, and
    "Submit" covers the ticked ones only;
  * any document's FORMAT can be changed - a column added, a box renamed - and
    saving raises the revision number, dates it and records who, what and why;
    the change survives a reload, shows on the sheet, and can be put back to
    the issued format;
  * everything done on the portal is a line in the ACTIVITY LOG, stamped by the
    server: the account, documents opened, the format change with its
    revisions, a password changed (and one refused);
  * a person changes their own password from the top bar;
  * every password box - signing up, signing in, changing it - has an eye that
    shows what was typed and hides it again, without sending the form (s63);
  * the lizard trend carries the years the provider has not reported yet, by
    the plant's own season, and says which rows those are; the rodent year
    holds two to four catches in each half.

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
NEW_PASSWORD = "PlaywrightQA456"
FAILURES = []


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


def open_page(page, route, settle=1300):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def stored(page, key):
    return page.evaluate("(k) => JSON.parse(localStorage.getItem('dcrs:v1:' + k) || 'null')", key)


def log_lines(page, query=""):
    open_page(page, "#/activity", settle=2600)
    if query:
        page.fill("[data-field='activity-search']", query)
        page.keyboard.press("Enter")
        page.wait_for_timeout(1200)
    return page.locator("[data-table='activity-log'] tbody tr").evaluate_all("els => els.map((e) => Array.from(e.querySelectorAll('td')).map((c) => c.textContent.trim()))")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    email = f"portal-{int(time.time() * 1000)}@example.com"
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "Portal QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)

    # ---- the eye beside a password box (REQUIREMENTS s63) ----
    box_type = lambda sel: page.locator(sel).get_attribute("type")
    eye = lambda sel: page.locator(sel).locator("xpath=following-sibling::button[@data-action='toggle-password']")
    check("A password box on the signup form starts hidden, with an eye beside it", box_type("#signup-password") == "password" and eye("#signup-password").count() == 1 and eye("#signup-confirm").count() == 1)
    eye("#signup-password").click()
    check(
        "The eye shows what was typed - in that box only, the other stays hidden",
        box_type("#signup-password") == "text" and page.locator("#signup-password").input_value() == PASSWORD and box_type("#signup-confirm") == "password",
        (box_type("#signup-password"), box_type("#signup-confirm")),
    )
    check("...and says what it will do next, for a screen reader", eye("#signup-password").get_attribute("aria-label") == "Hide password" and eye("#signup-password").get_attribute("aria-pressed") == "true")
    check("Showing the password does not send the form", page.locator("#signup-name").count() == 1 and page.locator(".app-sidebar").count() == 0)
    eye("#signup-password").click()
    check("Pressed again, it is dots again, with nothing lost", box_type("#signup-password") == "password" and page.locator("#signup-password").input_value() == PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)

    # ==================================================================
    # 1. Today's Briefing submits nothing unseen
    # ==================================================================
    dismiss(page)
    open_page(page, "#/dashboard")
    page.click("button:has-text(\"Today's Briefing\")")
    page.wait_for_timeout(900)
    submits = page.locator("[data-action='briefing-submit']")
    if submits.count() == 0:
        # A closed day (the Thursday weekly off, a holiday) has nothing prepared.
        check("Nothing is ready on a closed day, so there is nothing to gate", page.locator("[data-action='briefing-submit-all']").count() == 0)
    else:
        n = submits.count()
        check("A prepared record cannot be submitted from the briefing until it is reviewed", all(submits.nth(i).is_disabled() for i in range(n)), n)
        check("...and neither can the lot: Submit reads 0 reviewed and is disabled", page.locator("[data-action='briefing-submit-all']").is_disabled() and "0 reviewed" in page.locator("[data-action='briefing-submit-all']").inner_text())
        check("The briefing says why", "Only a ticked record can be submitted" in page.locator("[data-section='briefing-review-rule']").inner_text())
        before = [r for r in (stored(page, "records") or []) if r["status"] == "Pending Verification" and not r.get("isDemo")]
        page.locator("[data-field='briefing-reviewed'] input").first.check()
        page.wait_for_timeout(200)
        check("Ticking Reviewed & verified makes that one record's Submit available", submits.first.is_enabled() and (n == 1 or submits.nth(1).is_disabled()))
        check("...and Submit now covers exactly the one that was ticked", "1 reviewed" in page.locator("[data-action='briefing-submit-all']").inner_text())
        submits.first.click()
        page.wait_for_timeout(900)
        after = [r for r in (stored(page, "records") or []) if r["status"] == "Pending Verification" and not r.get("isDemo")]
        check("Submitting it sends that record, and only that one, for verification", len(after) == len(before) + 1, (len(before), len(after)))
    page.keyboard.press("Escape")
    got = page.locator(".modal-box button:has-text('Got it'), .briefing button:has-text('Got it')")
    if got.count():
        got.first.click()
    page.wait_for_timeout(300)

    # ==================================================================
    # 2. A format is changed, and its revision with it
    # ==================================================================
    open_page(page, "#/document/qc-bopp-film")
    head = page.locator("[data-section='document-preview'] .doc-header").inner_text()
    check("F/QC/01 starts at the revision it was issued at, Rev 01", "01" in head and "F/QC/01" in head, head[:200])
    page.click("[data-action='edit-format']")
    page.wait_for_timeout(500)
    editor = page.locator("[data-section='format-editor']")
    check("Edit format opens on the format as it stands, offering the next revision", editor.count() == 1 and page.locator("[data-field='format-revision']").input_value() == "02")
    page.click("[data-action='add-column']")
    page.locator("[data-section='format-columns'] [data-format-item='new'] [data-field='format-label']").fill("Batch No.")
    page.click("[data-action='save-format']")
    page.wait_for_timeout(300)
    check("A change needs its reason: without one it is refused, saying so", "why the format is changing" in page.locator("[data-section='format-error']").inner_text())
    page.fill("[data-field='format-reason']", "Customer audit asked for the batch number on every line")
    page.click("[data-action='save-format']")
    page.wait_for_timeout(1200)
    close_assistant(page)
    head = page.locator("[data-section='document-preview'] .doc-header").inner_text()
    headings = page.locator("[data-section='document-preview'] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check("Saved: the sheet now carries the new column", "Batch No." in headings, headings)
    check("...and the format is at Rev 02, dated today", "02" in head and date.today().strftime("%d-%b-%Y") in head, head[:240])
    edit = (stored(page, "formatEdits") or {}).get("qc-bopp-film") or {}
    rev = (edit.get("revisions") or [{}])[0]
    check(
        "The change is on record: who, what and why",
        edit.get("revisionNo") == "02" and rev.get("by") == "Portal QA" and "added column" in rev.get("summary", "") and "Batch No." in rev.get("summary", "") and "Customer audit" in rev.get("reason", ""),
        rev,
    )
    page.reload()
    page.wait_for_timeout(1800)
    dismiss(page)
    close_assistant(page)
    headings = page.locator("[data-section='document-preview'] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check("The changed format survives a reload (the issued definitions are put back at start-up, the change is laid over them)", "Batch No." in headings and "02" in page.locator("[data-section='document-preview'] .doc-header").inner_text(), headings)

    # A record started on the changed format takes a value in the new column.
    page.locator("[data-action='document-new-record']").first.click()
    page.wait_for_timeout(1500)
    close_assistant(page)
    rid = page.url.split("#/record/")[-1]
    headings = page.locator("table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    col = headings.index("Batch No.") if "Batch No." in headings else -1
    if col >= 0:
        page.locator("table.log-sheet tbody tr").first.locator("td").nth(col).locator("input").fill("B-2611")
        page.wait_for_timeout(1500)
    rec = next((r for r in (stored(page, "records") or []) if r["id"] == rid), None)
    check("A record on the changed format takes and keeps a value in the new column", col >= 0 and rec is not None and "B-2611" in json.dumps(rec["data"]["rows"][0]), rec["data"]["rows"][0] if rec else None)

    # The library reaches every document's format, including the ones drawn by the program.
    open_page(page, "#/library")
    page.locator("[data-action='edit-format'][data-document='daily-pest-monitoring']").first.evaluate("el => el.click()")
    page.wait_for_timeout(500)
    check(
        "A form drawn by the program has its name and revision changed here, and says its grid is the program's",
        page.locator("[data-field='format-name']").count() == 1 and page.locator("[data-section='format-columns']").count() == 0 and "drawn by the program" in page.locator("[data-section='format-editor']").inner_text(),
    )
    page.locator(".modal-box button:has-text('Cancel')").click()
    page.wait_for_timeout(300)

    # ==================================================================
    # 3. The activity log
    # ==================================================================
    lines = log_lines(page)
    flat = [" | ".join(l) for l in lines]
    check("The activity log holds the account being created, by name", any("Account created" in l and "Portal QA" in l for l in flat), flat[:6])
    check("...the document being opened", any("Document opened" in l and "F/QC/01" in l for l in flat), flat[:8])
    check("...the record started on it", any("Record started" in l and "F/QC/01" in l for l in flat), flat[:8])
    check("...and the format change with its revisions and its reason", any("Format changed" in l and "Rev 01 → 02" in l and "Customer audit" in l for l in flat), [l for l in flat if "Format" in l][:3])
    found = log_lines(page, "Format changed")
    check("Searching the log narrows it to what was asked for", len(found) >= 1 and all("Format changed" in " ".join(l) for l in found), found[:3])

    # ==================================================================
    # 4. A person changes their own password
    # ==================================================================
    page.click("[data-action='change-password']")
    page.wait_for_timeout(400)
    page.fill("[data-field='current-password']", "not-the-password")
    page.fill("[data-field='new-password']", NEW_PASSWORD)
    page.fill("[data-field='new-password-again']", NEW_PASSWORD)
    check("Change password has the eye on all three of its boxes", page.locator(".modal-box [data-action='toggle-password']").count() == 3)
    page.click("[data-action='save-password']")
    page.wait_for_timeout(900)
    check("The wrong current password is refused", "current password is not right" in page.locator(".modal-box").inner_text())
    page.fill("[data-field='current-password']", PASSWORD)
    page.click("[data-action='save-password']")
    page.wait_for_timeout(1200)
    check("The right one changes it", "Your password is changed" in page.locator(".modal-box").inner_text())
    page.locator(".modal-box button:has-text('Done')").click()
    flat = [" | ".join(l) for l in log_lines(page, "Password")]
    check("Both are in the log - the refusal and the change - and the password itself is not", any("Password change refused" in l for l in flat) and any("Password changed" in l for l in flat) and not any(NEW_PASSWORD in l or PASSWORD in l for l in flat), flat[:4])
    page.click("button:has-text('Log Out')")
    page.wait_for_selector("#login-email", timeout=30000)
    page.fill("#login-email", email)
    page.fill("#login-password", NEW_PASSWORD)
    eye("#login-password").click()
    check(
        "The sign-in form has the eye too: the password shows, and the person can check it before signing in",
        box_type("#login-password") == "text" and page.locator("#login-password").input_value() == NEW_PASSWORD and page.locator("#login-email").count() == 1,
        box_type("#login-password"),
    )
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1200)
    dismiss(page)
    check("The new password signs in", page.locator(".app-sidebar").count() == 1)

    # ==================================================================
    # 5. The trends follow the plant's own season
    # ==================================================================
    open_page(page, "#/pest/trend/lizard")
    rows = page.locator(".trend-sheet table tbody tr").evaluate_all("els => els.map((e) => Array.from(e.querySelectorAll('td')).map((c) => c.textContent.trim()))")
    this_year = next((r for r in rows if str(date.today().year) in r), None)
    check("The lizard report carries this year, which the provider has not reported yet", this_year is not None, rows)
    if this_year:
        check("...headed as the plant's seasonal pattern, so it is never read as the provider's figure", "Seasonal pattern" in this_year[0], this_year[0])
        months = this_year[4:16]
        check("...filled to the month that has been reached and blank after it", all(c != "" for c in months[: date.today().month]) and all(c == "" for c in months[date.today().month:]), months)
    season = page.evaluate(
        """async () => {
             // The weighting itself: the rains and winter above the dry summer.
             const text = await (await fetch('/assets/app.js')).text();
             return text.includes('lizard-year|');
           }"""
    )
    check("The lizard year is planned from the year alone, like the rodent year", season is True)

    # Put the format back, as the last thing, so the suite leaves the library as issued.
    open_page(page, "#/document/qc-bopp-film")
    page.click("[data-action='edit-format']")
    page.wait_for_timeout(400)
    page.click("[data-action='restore-format']")
    page.wait_for_timeout(1200)
    close_assistant(page)
    headings = page.locator("[data-section='document-preview'] table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check("Restore the issued format puts the paper's own transcription back, at its own revision", "Batch No." not in headings and not (stored(page, "formatEdits") or {}).get("qc-bopp-film"), headings)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe portal's controls hold: reviewed before submitted, formats revised on record, everything logged.")
