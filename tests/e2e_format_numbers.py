"""Any document by its format number - in Search and with Mitra - and F/HR/05 as the form prints it.

Asked for on 17-Sep-2026 with "F-HR-05_Induction Training programme-Staff.pdf":
"this document in HR module and make sure in search option and in our ai
assistant if user name enter Format number also of any document of any module
then it should repond on that also and work on it with user permission".
REQUIREMENTS s52. This suite checks that:

  * F/HR/05 reads as the form: the topics numbered only by the Sr. No. column,
    topic 2's points on their own lines, the responsibilities in order, and the
    two blank lines under topic 5 that can be written in;
  * Search finds a document by its format number however it is written
    (F/HR/05, f-hr-05, F HR 05, FHR05, hr 5, F-QC-40.C, QA-CAF-00 ...), in every
    module, with Open document and New record, and lists that document's records;
  * Mitra answers a format number with what the document is and asks what to do
    - Open it / Start a new one / Fill it question by question / Fill it with
    sample data - doing nothing until one is chosen; opens it when told to open
    it; says so when the number isn't in the system; treats a bare format
    number as a question even with a record open; and takes the number in its
    usual commands ("fill F/HR/05 with sample data");
  * the full-page Assistant answers the same way;
  * a Quality Control account is told whose F/HR/05 is, and Search shows it
    nothing.

Network-independent, against the production build on :8842.
"""
import sys
from playwright.sync_api import sync_playwright


def settle_briefing(page):
    """Mark today's briefing slots as already shown (engine/briefingSchedule.ts)."""
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
PASSWORD = "PlaywrightQA123"
UNSCOPED = ("trend-qa@example.com", "Trend QA", "")
QC_USER = ("dept-qc@example.com", "Dept QC QA", "QC")

TOPICS = [
    "Briefing on Company profile – Plant, Products, Production process etc.",
    "Good Manufacturing Practice\n- Pest Control\n- Waste Management\n- Personal hygiene",
    "Quality & Product safety related all policies",
    "Basic HARA Principal awareness (Self-study) & CCP monitoring – if HACCP team members",
    "Fire safety precautions",
    "",
    "",
]
RESPONSIBILITIES = ["Manager - QC", "Manager - QC", "PSTL", "PSTL", "Manager – HR & admin", "", ""]


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:600])


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


def logged_in(page):
    return page.locator(".app-sidebar").count() > 0


def sign_in(page, email, name, department):
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(500)
    if logged_in(page):
        page.locator("button[title='Log Out']").first.click()
        page.wait_for_timeout(900)
    page.fill("#login-email", email)
    page.fill("#login-password", PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1500)
    if not logged_in(page):
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


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def goto(page, route):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_timeout(1200)
    dismiss(page)


def search(page, query):
    page.fill("[data-field='search-query']", query)
    page.wait_for_timeout(350)
    return page.eval_on_selector_all("[data-search-document]", "els => els.map((e) => e.dataset.searchDocument)")


def open_mitra(page):
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        opener.click()
        page.wait_for_timeout(500)


def say(page, text, wait=900):
    page.fill("textarea.input", text)
    page.click("button[aria-label='Send']")
    page.wait_for_timeout(wait)
    return page.locator(".chat-log .chat-msg.bot").last.inner_text()


def last_chips(page):
    return page.locator(".chat-log .chat-chip").all_inner_texts()


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    sign_in(page, *UNSCOPED)

    # ==================================================================
    # 1. F/HR/05 as the form prints it
    # ==================================================================
    goto(page, "#/library")
    close_assistant(page)
    page.locator("[data-action='new-record'][data-document='hr-induction-staff']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1400)
    close_assistant(page)
    rid = page.url.split("#/record/")[-1]
    body = page.locator(".app-content").inner_text()
    rows = page.locator("table.log-sheet tbody tr")
    check("A new F/HR/05 opens with the form's seven lines: five topics and its two blank ones", rows.count() == 7, rows.count())
    check("...headed F/HR/05, with the form's own caption", "F/HR/05" in body and "Induction programme;" in body)
    headings = page.locator("table.log-sheet thead th").evaluate_all("els => els.map((e) => e.textContent.trim())")
    check("...and its columns: Training Topics, Responsibility, Planned Date, Actual date & Initial sign", headings == ["Sr. No.", "Training Topics", "Responsibility", "Planned Date", "Actual date & Initial sign"], headings)
    stored = next((r for r in records(page) if r["id"] == rid), None)
    got_topics = [r.get("parameter") for r in stored["data"]["rows"]] if stored else []
    got_resp = [r.get("responsibility") for r in stored["data"]["rows"]] if stored else []
    check("The topics are the form's words, numbered only by the Sr. No. column", got_topics == TOPICS, got_topics)
    check("...each with the responsibility the form gives it", got_resp == RESPONSIBILITIES, got_resp)
    check("Topic 2's points sit on their own lines, as printed", rows.nth(1).locator("td").nth(1).inner_text() == TOPICS[1], rows.nth(1).locator("td").nth(1).inner_text())
    labels = page.locator(".field label").all_inner_texts()
    check("The header asks for Name, Department / Process, Designation and Date of Joining", all(any(x in l for l in labels) for x in ["Name", "Department / Process", "Designation", "Date of Joining"]), labels)
    check("...and the foot for the Manager – HR and Admin and the Employee Sign", any("Manager – HR and Admin" in l for l in labels) and any("Employee Sign" in l for l in labels), labels)
    blank_topic = rows.nth(5).locator("td").nth(1).locator("input")
    check("The first blank line's topic can be written in", blank_topic.count() == 1)
    check("...while a printed topic cannot", rows.nth(0).locator("td").nth(1).locator("input").count() == 0)
    blank_topic.fill("Machine safety induction")
    page.wait_for_timeout(1200)
    stored = next((r for r in records(page) if r["id"] == rid), None)
    check("...and what is written there is saved on the record", stored and stored["data"]["rows"][5].get("parameter") == "Machine safety induction", stored["data"]["rows"][5] if stored else None)

    # ==================================================================
    # 2. Search by format number, however it is written
    # ==================================================================
    goto(page, "#/search")
    for q in ["F/HR/05", "f-hr-05", "F HR 05", "FHR05", "hr 5", "HR/05"]:
        check(f"Search '{q}' finds F/HR/05", search(page, q) == ["hr-induction-staff"], search(page, q))
    for q, doc in [
        ("F-QC-40.C", "qc-temperature"),
        ("f/qc/40c", "qc-temperature"),
        ("QA-CAF-00", "capa-complaint-ack"),
        ("F/MKT/05", "capa-customer-complaint"),
        ("f-prd-18", "prd-alc-production"),
        ("F/HR/17", "daily-pest-monitoring"),
        ("F/QC/12", "qc-weight-scale-calibration"),
    ]:
        check(f"Search '{q}' finds its document in its own module ({doc})", search(page, q) == [doc], search(page, q))
    search(page, "F/HR/01")
    rec_rows = page.locator("[data-section='search-records'] tbody tr")
    texts = rec_rows.all_inner_texts()
    check("A format number lists that document's records, and only its", rec_rows.count() >= 1 and all("Personal Competence Records" in x for x in texts), texts[:3])
    check("A number the system doesn't hold finds no document", search(page, "F/HR/10") == [] and "No matches." in page.locator("[data-section='search-records']").inner_text())
    search(page, "F/HR/05")
    page.locator("[data-search-document='hr-induction-staff'] [data-action='search-open-document']").click()
    page.wait_for_timeout(900)
    check("Open document goes to the document's own page", page.url.endswith("#/hr/induction-staff"), page.url)
    goto(page, "#/search")
    search(page, "F/QC/11")
    before = len([r for r in records(page) if r["documentId"] == "qc-gsm-plate-calibration"])
    page.locator("[data-search-document='qc-gsm-plate-calibration'] [data-action='search-new-record']").click()
    page.wait_for_timeout(1200)
    after = [r for r in records(page) if r["documentId"] == "qc-gsm-plate-calibration"]
    check("New record starts one for that document, only when pressed, and opens it", "#/record/" in page.url and len(after) == before + 1, (page.url, before, len(after)))

    # ==================================================================
    # 3. Mitra and a format number
    # ==================================================================
    goto(page, "#/dashboard")
    open_mitra(page)
    count_before = len(records(page))
    reply = say(page, "F/HR/05")
    check("Mitra answers a bare F/HR/05 with what the document is", "F/HR/05 is Induction Training Record" in reply and "Induction & Health" in reply, reply)
    check("...and asks what to do with it", "What would you like to do with it?" in reply)
    chips = last_chips(page)
    check("...offering Open it, Start a new one, Fill it question by question and Fill it with sample data", all(c in chips for c in ["Open it", "Start a new one", "Fill it question by question", "Fill it with sample data"]), chips[-6:])
    check("...and doing nothing until one is chosen", page.url.endswith("#/dashboard") and len(records(page)) == count_before)
    page.locator(".chat-log .chat-chip", has_text="Open it").last.click()
    page.wait_for_timeout(900)
    check("Open it goes to the document's own page", page.url.endswith("#/hr/induction-staff"), page.url)
    reply = say(page, "open f-qc-12")
    # It says it is opening it, and - the document now being open - what it can
    # do with it (REQUIREMENTS s60), which is the message left on screen.
    said = page.locator(".chat-log .chat-msg.bot").all_inner_texts()
    check(
        "Told to open a format number, Mitra opens it, says so, and offers the task",
        page.url.endswith("#/document/qc-weight-scale-calibration") and any("Opening F/QC/12" in m for m in said) and "F/QC/12" in reply and "is open" in reply,
        (page.url, said[-2:]),
    )
    reply = say(page, "what is F-QC-40.C?")
    check("Asked what a format number is, Mitra names it", "F-QC-40.C is Temperature Monitoring Record" in reply, reply)
    reply = say(page, "F/HR/10")
    check("A number the system doesn't hold is said to be not here yet", "no F/HR/10 in this system yet" in reply, reply)
    reply = say(page, "F/HR/05 and F/QC/11")
    check("Several numbers at once are each named, with an Open for each", "F/HR/05 — Induction Training Record" in reply and "F/QC/11 — Monthly Internal Calibration Records" in reply and "Open it: F/QC/11" in last_chips(page), reply)

    goto(page, "#/record/hr-competence-2026-10-01")
    open_mitra(page)
    reply = say(page, "F/HR/05")
    check("With a record open, a bare format number is still a question about that document, not data for the record", "F/HR/05 is Induction Training Record" in reply and "Nothing on the form changed" not in reply, reply)
    page.locator(".chat-log .chat-chip", has_text="Start a new one").last.click()
    page.wait_for_timeout(1400)
    new_id = page.url.split("#/record/")[-1]
    new = next((r for r in records(page) if r["id"] == new_id), None)
    check("Start a new one starts an F/HR/05 record and opens it", "#/record/" in page.url and new is not None and new["documentId"] == "hr-induction-staff", page.url)

    goto(page, "#/dashboard")
    open_mitra(page)
    say(page, "fill F/HR/14 with sample data", wait=1800)
    filled = next((r for r in records(page) if r["id"] == page.url.split("#/record/")[-1]), None)
    check(
        "The format number works in Mitra's commands too: 'fill F/HR/14 with sample data' starts and fills a visitor declaration",
        "#/record/" in page.url and filled is not None and filled["documentId"] == "hr-visitor-health" and bool(filled["data"]["header"].get("name")),
        (page.url, filled["data"]["header"] if filled else None),
    )

    # ==================================================================
    # 4. The full-page Assistant
    # ==================================================================
    goto(page, "#/assistant")
    page.fill("textarea.assistant-input", "what is F/HR/13?")
    page.click("button[data-action='send']")
    page.wait_for_timeout(900)
    reply = page.locator(".assistant-page .chat-msg.bot").last.inner_text()
    check("The full-page Assistant answers a format number the same way", "F/HR/13 is Authorization for Mobile Usage in Plant Area" in reply and page.locator(".assistant-page .chat-chip", has_text="Open it").count() >= 1, reply)

    # ==================================================================
    # 5. Another department's number
    # ==================================================================
    sign_in(page, *QC_USER)
    goto(page, "#/search")
    check("Search shows a Quality Control account no F/HR/05", search(page, "F/HR/05") == [])
    check("...but finds its own F/QC/12", search(page, "F/QC/12") == ["qc-weight-scale-calibration"])
    goto(page, "#/dashboard")
    open_mitra(page)
    reply = say(page, "F/HR/05")
    check("Mitra tells a Quality Control account F/HR/05 is Human Resources', without naming or opening it", "belongs to Human Resources" in reply and "isn't one of your departments" in reply and "Induction" not in reply, reply)

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nEvery document answers to its format number, and F/HR/05 reads as the form.")
