"""The two-yearly service provider agreement, and Cancel edit on any document.

Drives the real UI against the production build on :8842, network-independent
(the assistant's plain-words edits are understood locally):

  * the Service Provider page asks for the agreement — there isn't one on file,
    so the pop-up offers the two ways out of it: drafted on the provider's own
    letterhead, or the signed copy uploaded. "Remind me later" is a week, not
    for ever, and the card on the page still says where the agreement stands;
  * drafting it opens the agreement on Gurudev Pest Control's letterhead as
    "Letter head.pdf" prints it, for a two-year term, with the services, their
    SOP frequencies and the licence number filled in from what the system
    already holds — and everything nobody has told the system left as
    TO BE CONFIRMED, not invented;
  * it is a record like any other: typed changes save themselves, the assistant
    can fill it in, the signed copy uploads onto it, and once it is in force the
    page stops asking;
  * both Pest Control Training Records carry the service provider's printed
    letterhead ("Letter head.pdf") as their whole heading — the training is
    Gurudev's, so the record is issued on their paper — with the title and the
    Format No. / Rev No. / Date row taken off it, and it prints that way;
  * Cancel edit — pressing Edit and finding nothing to put right puts the record
    straight back at the status it came from, with a note in its history; after
    an actual change it asks first, then restores exactly what the record said.
    Checked on a Training record (its own page) and on a record page document.
"""
import sys
import time
from playwright.sync_api import sync_playwright
def settle_briefing(page):
    """Mark today's briefing slots as already shown, so it cannot re-open part
    way through the run and intercept a click. The briefing shows itself once in
    the first hour of the working day and once in the last
    (engine/briefingSchedule.ts); a suite that crosses one of those boundaries
    while running would otherwise fail on whatever it was clicking at the time.
    Reopening it deliberately from the top bar still works, which is how the
    suites that test the briefing itself get at it."""
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

BASE = "http://localhost:8842"
FAILURES = []
# A 1x1 PNG, standing in for a photographed page of the signed agreement.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0305fe02fdfc8c34ae0000000049454e44ae426082"
)


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:500])


def dismiss(page):
    for _ in range(3):
        g = page.locator("button:has-text('Got it')")
        if g.count():
            g.first.click()
            page.wait_for_timeout(200)
    settle_briefing(page)


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def stored(page, rid):
    return next(r for r in records(page) if r["id"] == rid)


def reopen_for_edit(page):
    """Edit → a reason → reopened."""
    page.click("[data-action='correct']")
    page.wait_for_timeout(400)
    page.click(".chat-chip:has-text('Typing mistake')")
    page.click("[data-action='confirm-correct']")
    page.wait_for_timeout(800)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    # Sign IN to a fixed account, and only sign up the first time it is needed.
    # The server allows a limited number of new accounts per network in ten
    # minutes (backend/index.ts, MAX_SIGNUPS_PER_IP) — deliberately, so free
    # signups can't multiply the assistant's per-account cap — and a suite that
    # burns one on every run eats into that budget for no reason.
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    page.fill("#login-email", "agreement-suite@example.com")
    page.fill("#login-password", "PlaywrightQA123")
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    if page.locator(".app-sidebar").count() == 0:
        page.click("text=Sign up")
        page.wait_for_timeout(200)
        page.fill("#signup-name", "Agreement QA")
        page.fill("#signup-email", "agreement-suite@example.com")
        page.fill("#signup-password", "PlaywrightQA123")
        page.fill("#signup-confirm", "PlaywrightQA123")
        page.click("button:has-text('Create Account')")
    # Wait for the app itself, not a fixed pause: on a busy machine this can
    # take longer than any guess, and every check below needs to be signed in.
    try:
        page.wait_for_selector(".app-sidebar", timeout=30000)
    except Exception:
        print("    could not get into the app:", page.locator("body").inner_text()[:300])
        raise
    page.wait_for_timeout(800)
    dismiss(page)
    # A fixed account keeps whatever an earlier run left behind; these checks
    # start from nothing on file.
    page.evaluate("() => { localStorage.removeItem('dcrs:v1:records'); localStorage.removeItem('dcrs:v1:settings'); }")
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(800)
    dismiss(page)

    # ---- the page asks for the agreement ----
    page.goto(f"{BASE}/index.html#/licence")
    page.wait_for_selector("[data-section='agreement-status']", timeout=30000)
    page.wait_for_timeout(400)
    dismiss(page)
    def why_no_reminder():
        """Everything the reminder's own decision is made from (engine/serviceAgreement.ts)."""
        return page.evaluate(
            "() => ({ settings: JSON.parse(localStorage.getItem('dcrs:v1:settings') || '{}'),"
            "  agreements: JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').filter(r => r.documentId === 'service-agreement').map(r => [r.id, r.isDemo, r.data.effectiveTo]),"
            "  modal: !!document.querySelector('.modal, [role=dialog]'), gotIt: !!document.querySelector('button') && document.body.innerText.includes('Got it') })"
        )

    check(
        "The Service Provider page asks for the agreement, and says the term is two years",
        page.locator("[data-section='agreement-reminder']").count() == 1 and "2 years" in page.locator("[data-section='agreement-reminder']").inner_text(),
        why_no_reminder(),
    )
    check(
        "...offering both ways: drafted for you, or the signed copy uploaded",
        page.locator("[data-action='generate-agreement']").count() == 1 and page.locator("[data-action='upload-agreement-now']").count() == 1,
    )

    # ---- "Remind me later" is a week, not for ever ----
    page.click("[data-action='agreement-later']")
    page.wait_for_timeout(500)
    snoozed = page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:settings') || '{}').agreementReminderSnoozedUntil")
    check("'Remind me later' snoozes it to a date, not for ever", bool(snoozed), snoozed)
    page.reload()
    page.wait_for_timeout(900)
    dismiss(page)
    check("...and it stays quiet on the next visit", page.locator("[data-section='agreement-reminder']").count() == 0)
    check("...while the card on the page still says where the agreement stands", page.locator("[data-section='agreement-status']").count() == 1)

    # ---- drafted on the provider's letterhead ----
    page.click("[data-action='generate-agreement-card']")
    page.wait_for_timeout(1200)
    agreement_id = page.url.split("/record/")[-1]
    rec = stored(page, agreement_id)
    body = page.locator("[data-doc='service-agreement']").inner_text()
    check("Drafting it opens the agreement on the provider's letterhead", "GURUDEV PEST CONTROL" in body and "PEST CONTROL SERVICE AGREEMENT" in body, body[:200])
    check("...with the provider's address, phones and website exactly as printed", "Golden Square Complex" in body and "98244 09997" in body and "Gurudevpestcontrol.com" in body)
    check(
        "...for a two-year term",
        rec["data"]["effectiveTo"][:4] == str(int(rec["data"]["effectiveFrom"][:4]) + 2),
        (rec["data"]["effectiveFrom"], rec["data"]["effectiveTo"]),
    )
    # The clauses sit in form fields, so they are read from the record itself.
    written = " | ".join(rec["data"]["scopeOfServices"] + rec["data"]["obligations"] + rec["data"]["commercialTerms"])
    check("...with the services and the licence number taken from what the system holds", "Lizard Control" in written and "MEH/FP1230000675" in written, written[:300])
    check(
        "...and nothing invented: what nobody has told the system is TO BE CONFIRMED",
        "TO BE CONFIRMED" in written and rec["data"]["agreementNo"] == "TO BE CONFIRMED",
        rec["data"]["commercialTerms"],
    )

    # ---- a record like any other ----
    page.fill("input[data-field='agreementNo']", "GPC/2026/14")
    page.wait_for_timeout(1200)
    check("A typed change saves itself", stored(page, agreement_id)["data"]["agreementNo"] == "GPC/2026/14")
    opener = page.locator("button:has-text('Ask the assistant')")
    if opener.count():
        opener.first.click()
        page.wait_for_timeout(300)
    composer = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
    composer.fill("agreement number is GPC/2026/22")
    composer.press("Enter")
    page.wait_for_timeout(1200)
    check(
        "The assistant can fill it in too",
        stored(page, agreement_id)["data"]["agreementNo"] == "GPC/2026/22",
        page.locator(".chat-msg.bot").last.inner_text(),
    )
    close = page.locator("button[aria-label='Close assistant']")
    if close.count():
        close.first.click()
        page.wait_for_timeout(200)

    # ---- the signed copy goes on file ----
    page.set_input_files("input[data-field='agreement-upload']", {"name": "signed-agreement.png", "mimeType": "image/png", "buffer": PNG})
    page.wait_for_timeout(1500)
    rec = stored(page, agreement_id)
    check("The signed copy uploads onto the agreement", len(rec["data"]["scans"]) == 1 and rec["data"]["origin"] == "uploaded", rec["data"]["scans"])
    check("...and shows on the page", page.locator("[data-section='agreement-scans'] img").count() == 1)

    # ---- with one in force the page stops asking ----
    page.goto(f"{BASE}/index.html#/licence")
    page.wait_for_timeout(900)
    dismiss(page)
    card = page.locator("[data-section='agreement-status']").inner_text()
    check("With an agreement in force the card says so and stops asking", "in force to" in card and page.locator("[data-section='agreement-reminder']").count() == 0, card[:200])

    # ---- and asks again when the two years are nearly up, then once they are ----
    def set_term_end(days_from_today):
        page.evaluate(
            """(days) => {
              const end = new Date(); end.setDate(end.getDate() + days);
              const iso = end.toISOString().slice(0, 10);
              const rs = JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]');
              for (const r of rs) if (r.documentId === 'service-agreement') r.data.effectiveTo = iso;
              localStorage.setItem('dcrs:v1:records', JSON.stringify(rs));
              const st = JSON.parse(localStorage.getItem('dcrs:v1:settings') || '{}');
              st.agreementReminderSnoozedUntil = null;           // the week's snooze is spent
              localStorage.setItem('dcrs:v1:settings', JSON.stringify(st));
            }""",
            days_from_today,
        )
        page.reload()
        page.wait_for_selector("[data-section='agreement-status']", timeout=30000)
        page.wait_for_timeout(500)
        dismiss(page)

    set_term_end(30)  # a month left — inside the sixty days
    said = page.locator("[data-section='agreement-reminder']")
    check("With the term nearly up it asks again, saying when it runs out", said.count() == 1 and "runs out on" in said.inner_text(), said.all_inner_texts())
    check("...offering the renewal the same two ways", page.locator("[data-action='generate-agreement']").count() == 1 and page.locator("[data-action='upload-agreement-now']").count() == 1)
    page.click("[data-action='agreement-later']")
    page.wait_for_timeout(400)

    set_term_end(-5)  # the term has run out
    said = page.locator("[data-section='agreement-reminder']")
    check("Once it has run out it says so, and keeps asking", said.count() == 1 and "ran out on" in said.inner_text(), said.all_inner_texts())
    page.click("[data-action='agreement-later']")
    page.wait_for_timeout(400)
    set_term_end(400)  # back in force for the checks below

    # ---- Cancel edit, on a record page document (the agreement itself) ----
    page.goto(f"{BASE}/index.html#/record/{agreement_id}")
    page.wait_for_timeout(900)
    page.click("[data-action='submit']")
    page.wait_for_timeout(800)
    page.click("[data-action='verify']")
    page.wait_for_timeout(800)
    check("The agreement submits and verifies", stored(page, agreement_id)["status"] == "Verified", stored(page, agreement_id)["status"])
    reopen_for_edit(page)
    check("Edit reopens it, and offers Cancel edit", stored(page, agreement_id)["status"] == "In Progress" and page.locator("[data-action='cancel-correction']").count() == 1)
    page.click("[data-action='cancel-correction']")
    page.wait_for_timeout(900)
    back = stored(page, agreement_id)
    check("Cancel edit puts a record-page document straight back to Verified", back["status"] == "Verified" and back.get("correction") is None, back["status"])

    # ---- both training records are headed with the provider's letterhead ----
    page.goto(f"{BASE}/index.html#/training")
    page.wait_for_timeout(800)
    check("The training list holds both records", page.locator("a:has-text('Open'), button:has-text('Open')").count() >= 2)
    for i in range(2):
        page.goto(f"{BASE}/index.html#/training")
        page.wait_for_timeout(700)
        page.locator("a:has-text('Open'), button:has-text('Open')").nth(i).click()
        page.wait_for_timeout(900)
        head = page.locator(".doc-header").inner_text()
        which = f"Training record {i + 1}"
        check(
            f"{which} is headed with the provider's letterhead, exactly as printed",
            "GURUDEV PEST CONTROL" in head and "Golden Square Complex" in head and "Mahesana-384002" in head
            and "98244 09997" in head and "98989 68969" in head and "info@gurudevpestcontrol.com" in head and "www.Gurudevpestcontrol.com" in head,
            head,
        )
        check(f"{which}: the plant's company line is gone from the heading", "GUJARAT PRINTPACK" not in head.upper(), head[:200])
        # The department asked for the title and the Format No. / Rev No. /
        # Date row to come off this document (12-Sep-2026): the letterhead is
        # the whole heading now.
        check(
            f"{which}: the title and the Format No. / Rev No. / Date row are gone",
            "PEST CONTROL TRAINING RECORD" not in head.upper() and "FORMAT NO." not in head.upper() and "REV NO." not in head.upper(),
            head,
        )
    page.emulate_media(media="print")
    page.wait_for_timeout(200)
    check("The letterhead prints with the record", page.locator(".doc-header .pl-name").evaluate("el => el.getClientRects().length > 0"))
    page.emulate_media(media="screen")
    page.wait_for_timeout(200)

    # ---- Cancel edit, on a Training record (its own page) ----
    page.goto(f"{BASE}/index.html#/training")
    page.wait_for_timeout(800)
    page.locator("a:has-text('Open'), button:has-text('Open')").first.click()
    page.wait_for_timeout(900)
    training_id = page.url.split("/")[-1]
    before = stored(page, training_id)
    check("A signed-off training record is locked and offers Edit", page.locator("[data-action='correct']").count() == 1, before["status"])
    reopen_for_edit(page)
    check("Edit reopens it for correction", stored(page, training_id)["status"] == "In Progress")
    check(
        "...and offers Cancel edit, in the banner at the top and beside Submit",
        page.locator("[data-action='cancel-correction']").count() == 1 and page.locator("[data-action='cancel-correction-banner']").count() == 1,
    )
    page.click("[data-action='cancel-correction']")
    page.wait_for_timeout(800)
    after = stored(page, training_id)
    check("Cancel edit puts it straight back, nothing changed", after["status"] == before["status"] and after.get("correction") is None, after["status"])
    check(
        "...and the history says the edit was cancelled",
        any(h["action"] == "correction-cancelled" for h in after.get("history") or []),
        [h["action"] for h in after.get("history") or []],
    )

    # ---- after an actual change it asks first, then puts the change back ----
    reopen_for_edit(page)
    field = page.locator(".app-content input:not([type='date']):not([type='checkbox'])").first
    original = field.input_value()
    field.fill("Something typed by mistake")
    page.wait_for_timeout(1400)
    page.click("[data-action='cancel-correction']")
    page.wait_for_timeout(400)
    check("Cancelling after a change asks first", page.locator("[data-action='confirm-cancel-correction']").count() == 1)
    page.click("[data-action='confirm-cancel-correction']")
    page.wait_for_timeout(900)
    check(
        "...and putting it back restores what the record said, at its old status",
        field.input_value() == original and stored(page, training_id)["status"] == before["status"],
        (field.input_value(), original),
    )

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nAll service agreement and Cancel-edit checks passed.")
