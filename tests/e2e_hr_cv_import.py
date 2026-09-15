"""A new joiner from a CV, onto Personal Competence Records and the HR formats that ask for the same details.

Asked for on 15-Sep-2026: "in Personal competence Records Whenever user upload
his Resume/CV and the detail will be automatically come in that excel sheet and
whereever the similar data required in HR document so it will be go there".
REQUIREMENTS s49. This suite checks that:

  * the server reads a PDF CV (made here by Chromium) and a Word .docx CV (made
    here as a zip) - name, sex, date of birth, the highest qualification and
    the experience, and the position applied for - and adds up the employment
    periods of a CV that states no total, education dates left out;
  * an old .doc, a photo and an oversized file are refused with a reason, and
    the details can still be entered by hand; the reader needs a session;
  * the review form comes up with what the CV states, the department and what
    the position requires taken from the plant's own competence register, and
    the gap worked out ("NA" when met);
  * Add puts a staff member on F/HR/01 and F/HR/08 (each reopened for
    correction, being verified / submitted) and starts their F/HR/05 induction
    and F/HR/04 declaration; an operator goes on F/HR/03, F/HR/06 and F/HR/08
    instead - each line in its own register's date style;
  * nobody is added twice.

Runs with CV_READ_WITH_ASSISTANT=0 (scripts/run-e2e.ts), so the CVs are read
by the text rules alone and the suite is network-independent, against the
production build on :8842.
"""
import os
import sys
import tempfile
import zipfile
from datetime import date
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
ACCOUNT = ("trend-qa@example.com", "Trend QA")
TODAY = date.today()
ISO_TODAY = TODAY.isoformat()

RIYA_HTML = """<html><body style='font-family:Arial'>
<h1>Riya Mehta</h1><p>Email: riya.mehta@example.com | Phone: +91 98765 43210</p>
<h2>Personal Details</h2><p>Date of Birth: 12/03/1998<br>Gender: Female</p>
<h2>Education</h2><ul><li>MBA (Finance), Gujarat University, 2021</li><li>B.Com, 2019</li></ul>
<h2>Experience</h2><p>Total Experience: 3 Years</p><p>Sales Executive, Shreeji Spices Pvt. Ltd. (June 2021 - Present)</p>
<p>Position Applied For: Sales Coordinator</p></body></html>"""

KAMLESH_LINES = [
    "CURRICULUM VITAE", "Name : Kamlesh Thakor", "Mobile: 98250 12345", "Date of Birth : 5th June 2004", "Sex: Male",
    "Educational Qualification", "ITI (Fitter), Govt. ITI Mehsana, 2023", "SSC, GSEB, 2020", "Experience", "Fresher",
    "Post Applied For: Operator - Pouching",
]

ANJALI_TEXT = """ANJALI R. SHARMA
B-12, Shanti Nagar, Mehsana, Gujarat
anjali.sharma88@gmail.com   +91-9909912345

PROFILE
Quality professional with a strong background in flexible packaging.

WORK EXPERIENCE
QC Executive - Uflex Packaging Ltd, Ahmedabad
Mar 2019 - Feb 2022
Senior QC Executive - Huhtamaki India, Vadodara
Mar 2022 - Present

EDUCATION
M.Sc. (Chemistry), Hemchandracharya North Gujarat University, 2018
B.Sc. Chemistry, June 2013 - May 2016
"""


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


def sign_in(page):
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(500)
    if page.locator(".app-sidebar").count() == 0:
        page.fill("#login-email", ACCOUNT[0])
        page.fill("#login-password", PASSWORD)
        page.click("button:has-text('Log In')")
        page.wait_for_timeout(1500)
        if page.locator(".app-sidebar").count() == 0:
            page.click("text=Sign up")
            page.wait_for_timeout(300)
            page.fill("#signup-name", ACCOUNT[1])
            page.fill("#signup-email", ACCOUNT[0])
            page.fill("#signup-password", PASSWORD)
            page.fill("#signup-confirm", PASSWORD)
            page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(1200)
    dismiss(page)


def records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


def record(page, rid):
    return next((r for r in records(page) if r["id"] == rid), None)


def live(page, doc_id):
    return [r for r in records(page) if r["documentId"] == doc_id and not r["isDemo"]]


def field(page, name):
    return page.locator(f"[data-section='cv-review'] [data-field='{name}']")


def target_box(page, doc_id):
    return page.locator(f"[data-section='cv-targets'] [data-target='{doc_id}'] input[type='checkbox']")


def open_importer(page):
    page.goto(f"{BASE}/index.html#/hr/competence")
    page.wait_for_timeout(1400)
    dismiss(page)
    close_assistant(page)
    page.locator("[data-action='cv-import']").click()
    page.wait_for_timeout(300)


def read_file(page, path):
    page.set_input_files("[data-field='cv-file']", path)
    page.locator("[data-action='cv-read']").click()
    page.wait_for_selector("[data-section='cv-review'], [data-state='cv-error']", timeout=30000)
    page.wait_for_timeout(300)


def months_between(y1, m1, y2, m2):
    return (y2 * 12 + m2) - (y1 * 12 + m1) + 1


tmp = tempfile.mkdtemp(prefix="cv-suite-")
docx_path = os.path.join(tmp, "Kamlesh Thakor CV.docx")
body = "".join(f'<w:p><w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:p>' for t in KAMLESH_LINES)
with zipfile.ZipFile(docx_path, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
    z.writestr("word/document.xml", f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>')
anjali_path = os.path.join(tmp, "anjali-cv.txt")
open(anjali_path, "w", encoding="utf-8").write(ANJALI_TEXT)
doc_path = os.path.join(tmp, "old-cv.doc")
open(doc_path, "wb").write(bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) + b"\x00" * 2048)
photo_path = os.path.join(tmp, "cv-photo.jpg")
open(photo_path, "wb").write(bytes([0xFF, 0xD8, 0xFF, 0xE0]) + b"\x00" * 2048)
big_path = os.path.join(tmp, "huge-cv.pdf")
open(big_path, "wb").write(b"%PDF-1.4\n" + b"0" * (6 * 1024 * 1024))

with sync_playwright() as p:
    browser = p.chromium.launch()
    maker = browser.new_page()
    maker.set_content(RIYA_HTML)
    pdf_path = os.path.join(tmp, "Riya_Mehta_Resume.pdf")
    maker.pdf(path=pdf_path)
    maker.close()

    page = browser.new_page(viewport={"width": 1400, "height": 1000})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    sign_in(page)

    # ==================================================================
    # 1. The reader itself
    # ==================================================================
    anon = p.request.new_context()
    res = anon.post(f"{BASE}/api/hr/cv/read", data=open(pdf_path, "rb").read(), headers={"Content-Type": "application/octet-stream"})
    check("Reading a CV needs a signed-in session", res.status == 401, res.status)
    anon.dispose()

    res = page.request.post(f"{BASE}/api/hr/cv/read", data=open(anjali_path, "rb").read(), headers={"Content-Type": "application/octet-stream", "X-File-Name": "anjali-cv.txt"})
    body = res.json() if res.ok else {}
    prof = body.get("profile", {})
    worked = months_between(2019, 3, 2022, 2) + months_between(2022, 3, TODAY.year, TODAY.month)
    years = round(worked / 6) / 2
    expected = f"{years:g} Year{'' if years == 1 else 's'}"
    check("A CV with no labels: the name off its heading, the M.Sc as the highest qualification, e-mail and phone",
          (prof.get("name"), prof.get("qualification"), prof.get("email"), prof.get("phone")) == ("Anjali R. Sharma", "M.Sc", "anjali.sharma88@gmail.com", "+91-9909912345"), body)
    check(f"...and its experience added up from the periods under WORK EXPERIENCE, education dates left out: {expected}", prof.get("experience") == expected, (prof.get("experience"), expected))
    check("...read by the text rules, saying what the CV doesn't state", body.get("readBy") == "rules" and "Date of Birth" in body.get("missing", []) and "Sex" in body.get("missing", []), body)

    # ==================================================================
    # 2. A staff member from a PDF CV
    # ==================================================================
    open_importer(page)
    check("Personal Competence Records offers Add from CV / Resume", page.locator("[data-section='cv-choose']").count() == 1)
    read_file(page, pdf_path)
    check("The PDF CV is read into the review form", page.locator("[data-section='cv-review']").count() == 1, page.locator("[data-state='cv-error']").all_inner_texts())
    check("...by the text rules in this run", page.locator("[data-read-by='rules']").count() == 1)
    got = {k: field(page, k).input_value() for k in ["joiner-name", "joiner-sex", "joiner-dob", "joiner-qualification", "joiner-experience", "joiner-designation", "joiner-doj", "joiner-category"]}
    check("Name, sex, date of birth, qualification and experience are what the CV states",
          (got["joiner-name"], got["joiner-sex"], got["joiner-dob"], got["joiner-qualification"], got["joiner-experience"]) == ("Riya Mehta", "Female", "1998-03-12", "MBA", "3 Years"), got)
    check("The designation is the position applied for, joining today, as staff",
          (got["joiner-designation"], got["joiner-doj"], got["joiner-category"]) == ("Sales Coordinator", ISO_TODAY, "staff"), got)
    chart = (field(page, "joiner-department").input_value(), field(page, "joiner-edu-required").input_value(), field(page, "joiner-exp-required").input_value())
    check("Department and what the position requires come from the plant's own F/HR/01 lines for Sales Coordinator: Sales & Marketing, Graduate, 1 Year",
          chart == ("Sales & Marketing", "Graduate", "1 Year"), chart)
    check("MBA and 3 years meet Graduate and 1 year, so the gap reads NA", field(page, "joiner-gap").input_value() == "NA" and "Meets" in page.locator("[data-state='gap']").inner_text())
    ticked = {d: target_box(page, d).is_checked() for d in ["hr-competence", "hr-training-needs", "hr-induction-staff", "hr-pre-employment-health", "hr-skill-matrix", "hr-induction-operators", "hr-mobile-authorization"]}
    check("For staff: F/HR/01, F/HR/08, the staff induction and the pre-employment declaration are ticked; the operators' formats and the mobile authorisation are not",
          ticked == {"hr-competence": True, "hr-training-needs": True, "hr-induction-staff": True, "hr-pre-employment-health": True, "hr-skill-matrix": False, "hr-induction-operators": False, "hr-mobile-authorization": False}, ticked)
    targets_text = page.locator("[data-section='cv-targets']").inner_text()
    check("The form says the verified F/HR/01 and the submitted F/HR/08 are reopened for correction to take the line",
          "Verified: reopened for correction" in page.locator("[data-target='hr-competence']").inner_text() and "Submitted: reopened for correction" in page.locator("[data-target='hr-training-needs']").inner_text(), targets_text)
    field(page, "joiner-designation").fill("Printing Technician")
    page.wait_for_timeout(150)
    check("A designation not on F/HR/01 clears the requirement rather than keeping the old one",
          field(page, "joiner-edu-required").input_value() == "" and "No line for this designation" in page.locator("[data-state='chart']").inner_text())
    field(page, "joiner-designation").fill("Sales Coordinator")
    page.wait_for_timeout(150)
    check("...and the Sales Coordinator requirement comes back", field(page, "joiner-edu-required").input_value() == "Graduate" and field(page, "joiner-gap").input_value() == "NA")
    page.locator("[data-action='cv-apply']").click()
    page.wait_for_selector("[data-section='cv-done']", timeout=10000)
    outcomes = page.eval_on_selector_all("[data-table='cv-outcomes'] tbody tr", "els => els.map((e) => [e.dataset.outcome, e.dataset.result])")
    check("Add reports each format: two lines added and two records started",
          sorted(outcomes) == sorted([["hr-competence", "added"], ["hr-training-needs", "added"], ["hr-induction-staff", "started"], ["hr-pre-employment-health", "started"]]), outcomes)

    comp = record(page, "hr-competence-2026-10-01")
    last = comp["data"]["rows"][-1] if comp else {}
    check("F/HR/01 now has 81 lines, the last one Riya Mehta's",
          comp and len(comp["data"]["rows"]) == 81 and last.get("name") == "Riya Mehta", (len(comp["data"]["rows"]) if comp else None, last))
    check("...with every column of the format: Sales & Marketing, Sales Coordinator, Graduate / MBA, 1 Year / 3 Years, NA, joined today in dd.mm.yyyy, no date of leaving",
          (last.get("department"), last.get("designation"), last.get("eduRequired"), last.get("eduAvailable"), last.get("expRequired"), last.get("expAvailable"), last.get("gapJustification"), last.get("dateOfJoining"), last.get("dateOfLeaving"))
          == ("Sales & Marketing", "Sales Coordinator", "Graduate", "MBA", "1 Year", "3 Years", "NA", TODAY.strftime("%d.%m.%Y"), ""), last)
    check("...reopened for correction from Verified, with the reason naming the CV and the person",
          comp["status"] == "In Progress" and comp.get("correction", {}).get("fromStatus") == "Verified" and "Riya_Mehta_Resume.pdf" in comp["correction"]["reason"] and "Riya Mehta" in comp["correction"]["reason"],
          (comp["status"], comp.get("correction")))
    tni = live(page, "hr-training-needs")[0]
    check("F/HR/08 has 155 employees, the last Riya Mehta - Sales Coordinator with no topic ticked, reopened from Submitted",
          len(tni["data"]["rows"]) == 155 and (tni["data"]["rows"][-1]["name"], tni["data"]["rows"][-1]["designation"]) == ("Riya Mehta", "Sales Coordinator")
          and not any(tni["data"]["rows"][-1].get(f"t{i:02d}") for i in range(1, 18)) and tni.get("correction", {}).get("fromStatus") == "Submitted",
          (len(tni["data"]["rows"]), tni["data"]["rows"][-1]))
    staff = live(page, "hr-induction-staff")
    h = staff[0]["data"]["header"] if staff else {}
    check("F/HR/05: a staff induction record is started for her - name, department / process, designation, date of joining, the five topics",
          len(staff) == 1 and (h.get("name"), h.get("deptProcess"), h.get("designation"), h.get("dateOfJoining")) == ("Riya Mehta", "Sales & Marketing", "Sales Coordinator", ISO_TODAY)
          and len(staff[0]["data"]["rows"]) == 5 and staff[0]["status"] == "In Progress", h)
    pre = live(page, "hr-pre-employment-health")
    h = pre[0]["data"]["header"] if pre else {}
    check("F/HR/04: her pre-employment declaration is started with name, department & designation, sex and date of birth - the questions left for her",
          len(pre) == 1 and (h.get("name"), h.get("deptDesignation"), h.get("sex"), h.get("dateOfBirth")) == ("Riya Mehta", "Sales & Marketing - Sales Coordinator", "Female", "1998-03-12")
          and not any(r.get("answer") for r in pre[0]["data"]["rows"]), h)
    skill = record(page, "hr-skill-matrix-2026-09-01")
    check("The operators' skill matrix is untouched and still Verified", len(skill["data"]["rows"]) == 58 and skill["status"] == "Verified")

    page.locator("[data-table='cv-outcomes'] tr[data-outcome='hr-competence'] button").click()
    page.wait_for_timeout(1500)
    close_assistant(page)
    banner = page.locator("[data-section='correction-banner']")
    check("Open on F/HR/01 shows the register reopened for correction, naming the new joiner",
          "#/record/hr-competence-2026-10-01" in page.url and banner.count() == 1 and "Riya Mehta" in banner.inner_text(), page.url)
    check("...with her line on the sheet", page.locator("table.log-sheet tbody tr").count() == 81)

    # Nobody twice
    open_importer(page)
    read_file(page, pdf_path)
    already = {d: page.locator(f"[data-target='{d}']").inner_text() for d in ["hr-competence", "hr-training-needs", "hr-induction-staff", "hr-pre-employment-health"]}
    check("Reading her CV again: every format she is already on says so and can't be ticked",
          all("already has Riya Mehta" in t for t in already.values()) and all(not target_box(page, d).is_enabled() for d in already), already)
    check("...so there is nothing to add", page.locator("[data-action='cv-apply']").is_disabled())
    page.locator(".modal-box button:has-text('Cancel')").click()
    page.wait_for_timeout(200)

    # ==================================================================
    # 3. An operator from a Word CV
    # ==================================================================
    open_importer(page)
    read_file(page, docx_path)
    got = {k: field(page, k).input_value() for k in ["joiner-name", "joiner-sex", "joiner-dob", "joiner-qualification", "joiner-experience", "joiner-designation", "joiner-category"]}
    check("The Word CV is read: Kamlesh Thakor, Male, 05-06-2004, ITI, Fresher, Operator - Pouching",
          got == {"joiner-name": "Kamlesh Thakor", "joiner-sex": "Male", "joiner-dob": "2004-06-05", "joiner-qualification": "ITI", "joiner-experience": "Fresher", "joiner-designation": "Operator - Pouching", "joiner-category": "operator"}, got)
    ticked = {d: target_box(page, d).is_checked() for d in ["hr-skill-matrix", "hr-induction-operators", "hr-training-needs", "hr-pre-employment-health", "hr-competence", "hr-induction-staff"]}
    check("For an operator: the skill matrix, the operators' induction, F/HR/08 and the declaration - not F/HR/01, which is for staff members only",
          ticked == {"hr-skill-matrix": True, "hr-induction-operators": True, "hr-training-needs": True, "hr-pre-employment-health": True, "hr-competence": False, "hr-induction-staff": False}, ticked)
    check("Add waits for the department", page.locator("[data-action='cv-apply']").is_disabled())
    field(page, "joiner-department").fill("Pouch")
    page.wait_for_timeout(150)
    page.locator("[data-action='cv-apply']").click()
    page.wait_for_selector("[data-section='cv-done']", timeout=10000)
    skill = record(page, "hr-skill-matrix-2026-09-01")
    last = skill["data"]["rows"][-1]
    check("F/HR/03 has 59 operators, the last Kamlesh Thakor - Operator - Pouching, joined today in m/d/yyyy, no points graded yet",
          len(skill["data"]["rows"]) == 59 and (last["name"], last["designation"], last["dateOfJoining"]) == ("Kamlesh Thakor", "Operator - Pouching", f"{TODAY.month}/{TODAY.day}/{TODAY.year}")
          and not any(last.get(k) for k in ["printing", "pasting", "pouchingMachine", "lamination"]) and skill.get("correction", {}).get("fromStatus") == "Verified", last)
    ind = live(page, "hr-induction-operators")[0]
    last = ind["data"]["rows"][-1]
    check("F/HR/06 has 29 inductions, the last his, with joining department & designation and today in dd/mm/yyyy",
          len(ind["data"]["rows"]) == 29 and (last["name"], last["joining"], last["dateOfJoiningInduction"]) == ("Kamlesh Thakor", "Operator - Pouching - Pouch", TODAY.strftime("%d/%m/%Y")), last)
    tni = live(page, "hr-training-needs")[0]
    check("F/HR/08 now has both new joiners - 156 employees", len(tni["data"]["rows"]) == 156 and tni["data"]["rows"][-1]["name"] == "Kamlesh Thakor")
    comp = record(page, "hr-competence-2026-10-01")
    check("F/HR/01 did not take the operator", len(comp["data"]["rows"]) == 81 and not any(r["name"] == "Kamlesh Thakor" for r in comp["data"]["rows"]))
    page.locator("[data-action='cv-close']").click()
    page.wait_for_timeout(200)

    # ==================================================================
    # 4. What can't be read, and entering by hand
    # ==================================================================
    for path, words, label in [
        (doc_path, "old Word (.doc)", "An old .doc CV is refused with a way forward"),
        (photo_path, "picture of the CV", "A photo of a CV is refused with a way forward"),
        (big_path, "larger than 5 MB", "A file over 5 MB is refused"),
    ]:
        open_importer(page)
        read_file(page, path)
        err = page.locator("[data-state='cv-error']")
        check(label, err.count() == 1 and words in err.inner_text(), err.all_inner_texts())
        page.locator(".modal-box button[aria-label='Close']").click()
        page.wait_for_timeout(200)
    open_importer(page)
    page.locator("[data-action='cv-manual']").click()
    page.wait_for_timeout(300)
    check("Enter details by hand opens the same form, empty, saying so",
          page.locator("[data-read-by='hand']").count() == 1 and field(page, "joiner-name").input_value() == "" and page.locator("[data-action='cv-apply']").is_disabled())
    field(page, "joiner-name").fill("Hand Entry Test")
    field(page, "joiner-designation").fill("Quality Executive")
    field(page, "joiner-department").fill("QC")
    page.wait_for_timeout(150)
    check("...and Add is offered once the name, department and designation are in", page.locator("[data-action='cv-apply']").is_enabled())
    check("...with the gap left for HR when the education and experience aren't known", field(page, "joiner-gap").input_value() == "")
    page.locator(".modal-box button:has-text('Cancel')").click()
    page.wait_for_timeout(200)
    check("Cancel adds nothing", not any(r.get("name") == "Hand Entry Test" for r in record(page, "hr-competence-2026-10-01")["data"]["rows"]))

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nA CV fills Personal Competence Records and every HR format that asks for the same details.")
