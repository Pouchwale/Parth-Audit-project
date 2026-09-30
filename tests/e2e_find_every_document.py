"""Every document findable, and the whole list openable (REQUIREMENTS s84).

The owner, 30-Sep-2026: "If any user searches for any document, or if the super
admin searches for any document, he should find it - it should be present ...
If a user wants to list all documents, he can list them out, open one and work
on it."

  * THE SUPER ADMIN finds any document in Search by its format number however
    it is written (F/HR/17, F-HR-17, fhr17, HR 17), by a word of its name in any
    case, by its module, and by a word people use for it; opens it from there;
  * A FORMAT ON THE MASTER LIST OF FORMATS (F/SYS/02) THAT DCRS DOES NOT HAVE
    YET is found too, and said to be "On the Master List of Formats (F/SYS/02) -
    not in DCRS yet"; one DCRS files under another number (F-PRD-19) finds that
    document;
  * THE DOCUMENT LIBRARY lists every document, grouped by module, each with
    Open Document, and one opens to its records and a new record is started
    there; its filter box finds as Search does; a switch lists the master-list
    formats DCRS does not have yet;
  * A STAFF ACCOUNT KEPT TO QUALITY CONTROL finds another department's document
    as "Kept by Human Resources - ask the super admin for access": no button, a
    click on it goes nowhere, none of its records is listed, and nothing about it
    is asked of the server. Its library lists its own documents and,
    on asking, the ones other departments keep.

Against the PRODUCT server on :8843 (DCRS_BASE overrides it), with the plant's
seeded accounts: admin@gpp.local (the super admin) and kapila.barad@gpp.local
(Quality Control), on SEED_ACCOUNT_PASSWORD SeedQA@2026. Network-independent.
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD", "SeedQA@2026")
ADMIN = os.environ.get("DCRS_ADMIN_EMAIL", "admin@gpp.local")
STAFF = os.environ.get("DCRS_QC_EMAIL", "kapila.barad@gpp.local")  # kept to Quality Control
KEPT_BY_HR = "Kept by Human Resources — ask the super admin for access"
NOT_IN_DCRS_YET = "On the Master List of Formats (F/SYS/02) — not in DCRS yet"
FAILURES = []


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


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


def intro_gone(page):
    """The opening sequence plays once per browser session over the page; wait until it has handed over."""
    try:
        page.wait_for_function("() => !document.querySelector(\"[data-section='intro-splash']\")", timeout=15000)
    except Exception:
        pass


def watch(page, errors):
    page.route("**/translate_a/**", lambda route: route.abort())
    page.on("pageerror", lambda e: errors.append(str(e)))


def sign_in(page, email):
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    intro_gone(page)
    page.wait_for_timeout(300)
    page.fill("#login-email", email)
    page.fill("#login-password", SEED_PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    intro_gone(page)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)


def goto(page, route):
    page.goto(f"{BASE}/index.html{route}")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    intro_gone(page)
    page.wait_for_timeout(1100)
    dismiss(page)
    close_assistant(page)


FOUND = """() => ({
  yours: [...document.querySelectorAll('[data-search-document]')].map((e) => e.dataset.searchDocument),
  kept: [...document.querySelectorAll('[data-search-kept]')].map((e) => e.dataset.searchKept),
  master: [...document.querySelectorAll('[data-search-master-format]')].map((e) => e.dataset.searchMasterFormat),
})"""


def search(page, query):
    page.fill("[data-field='search-query']", query)
    page.wait_for_timeout(450)
    return page.evaluate(FOUND)


def records_text(page):
    return page.locator("[data-section='search-records']").inner_text()


LIBRARY = """() => ({
  documents: [...document.querySelectorAll('tr[data-library-document]')].map((e) => e.dataset.libraryDocument),
  modules: [...document.querySelectorAll('[data-library-module]')].map((e) => [e.dataset.libraryModule, [...e.querySelectorAll('tr[data-library-document]')].map((r) => r.dataset.libraryDocument)]),
  opens: [...document.querySelectorAll("[data-action='open-document']")].map((e) => e.dataset.document),
  master: [...document.querySelectorAll('[data-section="library-master-list"] tr[data-master-format]')].map((e) => [e.dataset.masterFormat, e.innerText]),
  kept: [...document.querySelectorAll('[data-section="library-kept"] tr[data-kept-document]')].map((e) => [e.dataset.keptDocument, e.innerText]),
})"""


def library(page):
    return page.evaluate(LIBRARY)


def filter_library(page, query):
    page.fill("[data-field='library-filter']", query)
    page.wait_for_timeout(400)
    return library(page)


def stored(page, key):
    return page.evaluate(f"() => JSON.parse(localStorage.getItem('dcrs:v1:{key}') || '[]')")


def label_count(page, field):
    """The number a switch's label ends with: '(52)'."""
    text = page.locator(f"label:has([data-field='{field}'])").inner_text()
    m = re.search(r"\((\d+)\)\s*$", text.strip())
    return int(m.group(1)) if m else -1, text


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    # ==================================================================
    # 1. The super admin: any document, however it is asked for
    # ==================================================================
    print("\n==== The super admin searches ====")
    admin = browser.new_context(viewport={"width": 1500, "height": 1000})
    page = admin.new_page()
    watch(page, errors)
    sign_in(page, ADMIN)
    goto(page, "#/search")

    for q in ["F/HR/17", "F-HR-17", "fhr17", "HR 17", "f hr 17"]:
        got = search(page, q)
        check(f"'{q}' finds the Daily Pest Control Monitoring Record, and only it", got["yours"] == ["daily-pest-monitoring"] and not got["kept"], got)
    for q, doc in [("f-qc-40.c", "qc-temperature"), ("QC 12", "qc-weight-scale-calibration"), ("fmnt11", "mnt-lux-level"), ("F/SYS/04-A", "sys-mrm-agenda"), ("QA-CAF-00", "capa-complaint-ack")]:
        got = search(page, q)
        check(f"'{q}' finds {doc}", got["yours"] == [doc], got)

    for q, doc in [("daily pest", "daily-pest-monitoring"), ("WEIGHT SCALE", "qc-weight-scale-calibration"), ("lux", "mnt-lux-level"), ("container stuffing", "disp-container-stuffing"), ("Approved Suppliers", "pur-approved-suppliers")]:
        got = search(page, q)
        check(f"a word of the name, any case - '{q}' - finds {doc}", doc in got["yours"], got)
    for q, doc in [("rat", "service-report-rodent"), ("gap report", "gap-inspection"), ("weighing balance", "qc-weight-scale-calibration")]:
        got = search(page, q)
        check(f"a word people use - '{q}' - finds {doc}", doc in got["yours"], got)
    check("...and the super admin is never told a document is kept by another department", not search(page, "pest")["kept"])

    maintenance = search(page, "Maintenance")["yours"]
    check("The module's name, 'Maintenance', finds the Maintenance documents", len(maintenance) >= 10 and all(d.startswith("mnt-") for d in maintenance), maintenance)
    hr_by_department = search(page, "human resources")["yours"]
    check("...and a department's, 'human resources', finds Human Resources' documents", "hr-induction-staff" in hr_by_department and "daily-pest-monitoring" in hr_by_department, hr_by_department)

    # A master-list format DCRS does not hold yet.
    got = search(page, "F/HR/10")
    check("F/HR/10 - on the master list, not in DCRS - is found as a master-list line", got["master"] == ["F-HR-10"] and not got["yours"] and not got["kept"], got)
    row = page.locator("[data-search-master-format='F-HR-10']")
    check("...named as the list names it, and said to be not in DCRS yet", row.count() == 1 and "Training Imparted Record" in row.inner_text() and NOT_IN_DCRS_YET in row.inner_text(), row.inner_text() if row.count() else None)
    check("...with nothing to open or start", row.locator("button").count() == 0)
    check("...and its register says there are no records, as before", "No matches." in records_text(page), records_text(page)[:200])
    got = search(page, "purchase order")
    check("'purchase order' finds F-PUR-04 on the master list", "F-PUR-04" in got["master"], got)
    got = search(page, "F-PRD-19")
    check("F-PRD-19 - DCRS's process parameter record, whose own number is still to be confirmed - finds that record", got["yours"] == ["prd-process-parameter"] and not got["master"], got)
    check("...saying that is how the master list numbers it", "F-PRD-19 on the Master List of Formats" in page.locator("[data-search-document='prd-process-parameter']").inner_text())

    search(page, "fhr17")
    page.locator("[data-search-document='daily-pest-monitoring'] [data-action='search-open-document']").click()
    page.wait_for_timeout(1000)
    check("Open document goes to the document's own page", page.url.endswith("#/pest/daily"), page.url)

    # ==================================================================
    # 2. The super admin's Document Library: every document, by module, each openable
    # ==================================================================
    print("\n==== The Document Library ====")
    goto(page, "#/library")
    lib = library(page)
    catalogue = [d["id"] for d in stored(page, "documents")]
    check("The library lists every document in DCRS", sorted(lib["documents"]) == sorted(catalogue) and len(catalogue) >= 100, (len(lib["documents"]), len(catalogue), sorted(set(catalogue) - set(lib["documents"]))[:10]))
    modules = {d["module"] for d in stored(page, "documents")}
    check("...grouped by module, every module a group", {m for m, _ in lib["modules"]} == modules and len(lib["modules"]) == len(modules), [m for m, _ in lib["modules"]])
    by_module = {m: ids for m, ids in lib["modules"]}
    wrong = [d["id"] for d in stored(page, "documents") if d["id"] not in by_module.get(d["module"], [])]
    check("...each document in its own module's group", not wrong, wrong[:10])
    check("...each with Open Document", sorted(lib["opens"]) == sorted(catalogue), len(lib["opens"]))
    check("The Maintenance group is what Search finds for 'Maintenance'", sorted(by_module.get("Maintenance", [])) == sorted(maintenance), (by_module.get("Maintenance"), maintenance))
    check("The list of master-list formats is not shown until asked for", not lib["master"] and page.locator("[data-section='library-master-list']").count() == 0)

    for q, expect in [("fhr17", ["daily-pest-monitoring"]), ("F-QC-40.C", ["qc-temperature"]), ("lux", ["mnt-lux-level"])]:
        got = filter_library(page, q)["documents"]
        check(f"The filter box finds as Search does: '{q}'", got == expect, got)
    got = filter_library(page, "maintenance")["documents"]
    check("...'maintenance' leaves the Maintenance documents", sorted(got) == sorted(maintenance), got)
    filter_library(page, "")

    page.check("[data-field='library-show-master']")
    page.wait_for_timeout(500)
    lib = library(page)
    shown = [f for f, _ in lib["master"]]
    stated, label = label_count(page, "library-show-master")
    check("Asked, it lists the master-list formats DCRS does not have yet", len(shown) > 0 and "F-HR-10" in shown and "F-PUR-04" in shown, shown[:12])
    check("...as many as the switch says", len(shown) == stated, (len(shown), label))
    check("...none DCRS has", not any(f in shown for f in ["F-HR-05", "F-HR-17", "F-QC-40. C", "F-SYS-02", "F-MKT-06", "F-PRD-19"]), shown)
    check("...each said to be not in DCRS yet", all(NOT_IN_DCRS_YET in t for _, t in lib["master"]), [t for _, t in lib["master"] if NOT_IN_DCRS_YET not in t][:3])
    got = filter_library(page, "F-HR-10")
    check("The filter box finds a master-list format too", [f for f, _ in got["master"]] == ["F-HR-10"] and not got["documents"], got)
    filter_library(page, "")
    page.uncheck("[data-field='library-show-master']")

    # One opens, and is worked on.
    page.locator("[data-action='open-document'][data-document='qc-viscosity']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1300)
    close_assistant(page)
    check("A document opens from the library on its own page, with its records", page.url.endswith("#/document/qc-viscosity") and page.locator("[data-page='document-records'][data-document='qc-viscosity']").count() == 1, page.url)
    goto(page, "#/library")
    before = len([r for r in stored(page, "records") if r["documentId"] == "qc-gsm-plate-calibration"])
    page.locator("[data-action='new-record'][data-document='qc-gsm-plate-calibration']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1400)
    after = len([r for r in stored(page, "records") if r["documentId"] == "qc-gsm-plate-calibration"])
    check("...and New starts a record of it, opened to work on", "#/record/" in page.url and after >= before and after >= 1, (page.url, before, after))
    admin_count = len(catalogue)
    admin.close()

    # ==================================================================
    # 3. A staff account kept to Quality Control
    # ==================================================================
    print("\n==== A Quality Control account ====")
    qc = browser.new_context(viewport={"width": 1500, "height": 1000})
    page = qc.new_page()
    watch(page, errors)
    sign_in(page, STAFF)
    goto(page, "#/search")
    requests = []
    page.on("request", lambda r: requests.append((r.method, r.url, r.post_data or "")))

    got = search(page, "F/HR/17")
    check("F/HR/17 is found by a Quality Control account", got["kept"] == ["daily-pest-monitoring"], got)
    check("...not as a document of its own", not got["yours"], got)
    row = page.locator("[data-search-kept='daily-pest-monitoring']")
    check("...but kept by Human Resources, with whom to ask", row.count() == 1 and KEPT_BY_HR in row.inner_text() and "Daily Pest Control Monitoring Record" in row.inner_text(), row.inner_text() if row.count() else None)
    check("...with nothing to open or start", row.locator("button, a").count() == 0)
    check("...and no register of its records", "No matches." in records_text(page) and page.locator("[data-search-record]").count() == 0, records_text(page)[:200])
    row.click()
    page.wait_for_timeout(600)
    check("A click on it goes nowhere", page.url.endswith("#/search"), page.url)
    got = search(page, "pest")
    check("'pest' finds Human Resources' pest control file for it too, kept by them", "daily-pest-monitoring" in got["kept"] and "service-report-rodent" in got["kept"] and not got["yours"], got)
    got = search(page, "human resources")
    check("...and the department's name finds its documents, kept by it", "hr-induction-staff" in got["kept"] and not got["yours"], got)
    asked = [r for r in requests if "daily-pest-monitoring" in r[1] or "daily-pest-monitoring" in r[2] or "/records" in r[1]]
    check("None of those documents' records was asked of the server", not asked, asked[:5])
    got = search(page, "F/QC/12")
    check("Its own F/QC/12 is its own to open", got["yours"] == ["qc-weight-scale-calibration"] and not got["kept"], got)
    got = search(page, "F/HR/10")
    check("A master-list format DCRS does not have is found by a staff account too", got["master"] == ["F-HR-10"], got)

    goto(page, "#/library")
    lib = library(page)
    check("Its library lists its own documents", 0 < len(lib["documents"]) < admin_count and not any(d.startswith("hr-") or d == "daily-pest-monitoring" for d in lib["documents"]), len(lib["documents"]))
    check("...each with Open Document", sorted(lib["opens"]) == sorted(lib["documents"]))
    check("...and not the other departments' until asked", not lib["kept"] and "F/HR/" not in page.locator(".app-content").inner_text())
    page.check("[data-field='library-show-kept']")
    page.wait_for_timeout(500)
    lib = library(page)
    kept_ids = [d for d, _ in lib["kept"]]
    stated, label = label_count(page, "library-show-kept")
    check("Asked, it lists every document other departments keep", len(kept_ids) == admin_count - len(lib["documents"]) == stated, (len(kept_ids), admin_count, len(lib["documents"]), label))
    pest_row = next((t for d, t in lib["kept"] if d == "daily-pest-monitoring"), "")
    check("...each kept by its department, with whom to ask", KEPT_BY_HR in pest_row, pest_row)
    check("...and nothing to open", page.locator("[data-section='library-kept'] button, [data-section='library-kept'] a").count() == 0)
    got = filter_library(page, "fhr17")
    check("The filter box finds another department's document for it, kept by them", [d for d, _ in got["kept"]] == ["daily-pest-monitoring"] and not got["documents"], got)
    filter_library(page, "")
    page.locator("[data-action='open-document'][data-document='qc-weight-scale-calibration']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1300)
    close_assistant(page)
    check("One of its own opens from the library, with its records", page.url.endswith("#/document/qc-weight-scale-calibration") and page.locator("[data-page='document-records']").count() == 1, page.url)
    qc.close()

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nEvery document is found by anybody, and the whole list opens.")
