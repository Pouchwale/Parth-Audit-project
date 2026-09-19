"""Printing prints the document; a service report's material, method and
quantity follow the service's fixed rules; the F/HR/18 register is added to
and edited by Month & Year.

Drives the real UI against the production build on :8842, network-independent
(the assistant's plain-words edits are understood locally):

  * The paper carries the document and nothing the browser adds (s59): the page
    takes no margin, so a browser has nowhere to print the date, the time, the
    address or the page number, and each document keeps that 12 mm for itself -
    on every page of a register, which is built of page sections.
  * Print -- a record's Print button prints the form and nothing around it
    (the assistant's banner, the sidebar, the buttons); the register's own
    Print prints the register alone, as the paper form; the browser's own
    Print (Ctrl+P) does the same on the register and on Reports; the Chemical Master has a
    Print of its own. The marks come off when printing ends.
  * Service report -- material and method are fixed text, never inputs; the
    quantity is typed once on the first line of each material and every other
    line with that material follows it; a draft written before that rule is
    brought into line at start-up and says so in its history; the assistant
    can't change a material, and "quantity is 6" sets every line of it.
  * F/HR/18 -- "Add visit" puts a visit on the chosen Month & Year's register
    (not a date outside it, not twice on one date); "Edit register" turns its
    cells into inputs that save themselves into the visit's history; the next
    visit carries the names forward; a submitted visit is locked; an added
    visit is left alone by the start-up clean-ups.

window.print is replaced by a counter, so no dialog opens; the printout is
inspected with print media emulated, and 'afterprint' is sent by hand.
"""
import sys
import time
from datetime import date, timedelta
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
TODAY = date.today()
LAST_MONTH = TODAY.replace(day=1) - timedelta(days=1)

STUB_PRINT = "() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }"
END_PRINT = "() => window.dispatchEvent(new Event('afterprint'))"
START_BROWSER_PRINT = "() => window.dispatchEvent(new Event('beforeprint'))"
# Whether an element is on the printout: a box in the (print) layout. An element's own
# computed `display` stays "block" when a parent is hidden, so it can't answer that.
SHOWN = "const shown = (s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; };"
PC01_CELLS = (
    "() => Array.from(document.querySelectorAll('tbody.fhr18-unit[data-pc=\"PC-01\"] tr'))"
    ".map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()))"
)


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


def stored(page, rid):
    return page.evaluate("(id) => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').find(r => r.id === id)", rid)


def fly_visit(page, iso):
    return page.evaluate(
        "(d) => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').find(r => r.documentId === 'fly-catcher' && !r.isDemo && r.dueDate === d)",
        iso,
    )


def printed_view(page, body):
    """Evaluates `body` (JS returning an object; `shown(selector)` is defined) with print media emulated."""
    page.emulate_media(media="print")
    try:
        return page.evaluate(f"() => {{ {SHOWN} return ({body}); }}")
    finally:
        page.emulate_media(media="screen")


def open_register_for_last_month(page):
    page.goto(f"{BASE}/index.html#/pest/trend/fly-catcher")
    page.wait_for_timeout(600)
    dismiss(page)
    selects = page.locator(".app-content select")
    selects.nth(0).select_option(str(LAST_MONTH.year))
    selects.nth(1).select_option(str(LAST_MONTH.month - 1))
    page.wait_for_timeout(400)


def paper(iso):
    """2026-08-03 -> 3/08/26, as the F/HR/18 specimen writes a date."""
    return f"{int(iso[8:])}/{iso[5:7]}/{iso[2:4]}"


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    page.click("text=Sign up")
    page.fill("#signup-name", "Print QA")
    page.fill("#signup-email", f"print-{int(time.time() * 1000)}@example.com")
    page.fill("#signup-password", "PlaywrightQA123")
    page.fill("#signup-confirm", "PlaywrightQA123")
    page.click("button:has-text('Create Account')")
    page.wait_for_timeout(1200)
    dismiss(page)

    # ---- 1. A service-report draft an older build left behind ----
    # A different quantity on every area, and one material typed over by hand;
    # then the app starts again.
    rid = "rec-legacy-rodent-draft"
    page.evaluate(
        """([rid, today]) => {
          const master = JSON.parse(localStorage.getItem('dcrs:v1:master'));
          const areas = master.areas.filter(a => a.context === 'service-report:Rodent Control Service');
          const lines = areas.map((a, i) => {
            const bait = a.name === 'First floor - Offline punching & QC Inspection';
            return {
              slNo: i + 1,
              areaName: a.name,
              materialName: bait ? 'Bromadiolone Cake' : 'Glue Board',
              qtyUsed: bait ? '35 grams' : String(2 + (i % 3)),
              methodOfApplication: bait ? 'Baiting' : 'Trouble gum placement',
              remarks: 'No Rodent Trapped',
            };
          });
          lines[3].materialName = 'Rat poison';
          const now = new Date().toISOString();
          const records = JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]');
          records.push({
            id: rid, documentId: 'service-report-rodent', periodKey: 'service-report-rodent:legacy-test', dueDate: today,
            status: 'In Progress', isDemo: false,
            data: { serviceName: 'Rodent Control Service', lines, technicianSign: 'Yogesh Rathod', customerSign: '' },
            createdAt: now, updatedAt: now,
            prepared: { at: now, by: 'assistant', notes: ['Prepared by an older build.'], basedOn: 'test' },
          });
          localStorage.setItem('dcrs:v1:records', JSON.stringify(records));
        }""",
        [rid, TODAY.isoformat()],
    )
    page.reload()
    page.wait_for_timeout(900)
    dismiss(page)
    r = stored(page, rid)
    lines = r["data"]["lines"]
    glue = [l for l in lines if l["materialName"] == "Glue Board"]
    bait = [l for l in lines if l["materialName"] == "Bromadiolone Cake"]
    check(
        "An older draft is brought into line at start-up: every Glue Board line carries the first line's quantity",
        len(lines) == 16 and len(glue) == 15 and all(l["qtyUsed"] == "2" for l in glue),
        [l["qtyUsed"] for l in lines],
    )
    check("...the bait area keeps a quantity of its own (grams, not glue boards)", len(bait) == 1 and bait[0]["qtyUsed"] == "35 grams", bait)
    check("...a material typed over is set back to the fixed one", lines[3]["materialName"] == "Glue Board" and lines[3]["methodOfApplication"] == "Trouble gum placement", lines[3])
    history = r.get("history") or []
    check(
        "...and the change is in its history, by System, after the assistant's preparation",
        [h["action"] for h in history] == ["prepared", "edited"] and history[-1]["by"] == "System" and len(history[-1].get("changes") or []) > 0,
        history,
    )

    # ---- 2. The service report form ----
    page.goto(f"{BASE}/index.html#/record/{rid}")
    page.wait_for_timeout(900)
    dismiss(page)
    table = "table[data-table='service-lines']"
    check(
        "Material and method are fixed text on the form — there is no box to type them in",
        page.locator(f"{table} tbody tr").count() == 16
        and page.locator(f"{table} td[data-cell='material'] input, {table} td[data-cell='method'] input").count() == 0
        and page.locator(f"{table} tr[data-line='16'] td[data-cell='material']").inner_text().strip() == "Glue Board",
    )
    check(
        "The quantity is typed on the first line of each material only (line 1 for the glue boards, the bait line for the cake)",
        page.locator(f"{table} td[data-cell='qty'] input:not([disabled])").count() == 2,
        page.locator(f"{table} td[data-cell='qty'] input:not([disabled])").count(),
    )
    page.locator(f"{table} tr[data-line='1'] input[data-field='qty']").fill("5")
    page.wait_for_timeout(1400)
    lines = stored(page, rid)["data"]["lines"]
    check("Typing it on line 1 gives every Glue Board line the same quantity", all(l["qtyUsed"] == "5" for l in lines if l["materialName"] == "Glue Board"), [l["qtyUsed"] for l in lines])
    check("...and leaves the bait line's quantity alone", next(l for l in lines if l["materialName"] == "Bromadiolone Cake")["qtyUsed"] == "35 grams")
    shown = page.locator(f"{table} tr[data-line='16'] td[data-cell='qty'] input").input_value()
    check("The last line shows that same quantity on screen", shown == "5", shown)

    # Mitra opens by itself when a record is opened (s60); the pill exists only while closed.
    if page.locator("button:has-text('Ask Mitra')").count():
        page.click("button:has-text('Ask Mitra')")
    page.wait_for_timeout(400)
    box = page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")
    box.fill("material of canteen is Deltamethrin")
    box.press("Enter")
    page.wait_for_timeout(900)
    reply = page.locator(".chat-msg.bot").last.inner_text()
    lines = stored(page, rid)["data"]["lines"]
    check("The assistant won't change a fixed material, and says why", "fixed" in reply and lines[15]["materialName"] == "Glue Board", reply)
    box.fill("quantity is 6")
    box.press("Enter")
    page.wait_for_timeout(900)
    lines = stored(page, rid)["data"]["lines"]
    check("'quantity is 6' sets it once — every Glue Board line reads 6", all(l["qtyUsed"] == "6" for l in lines if l["materialName"] == "Glue Board"), [l["qtyUsed"] for l in lines])
    page.click("button[aria-label='Close assistant']")
    page.wait_for_timeout(200)

    # ---- 3. Printing a record prints the form and nothing else ----
    page.evaluate(STUB_PRINT)
    page.click("button:has-text('Print Original-Style Record')")
    page.wait_for_timeout(200)
    seen = printed_view(
        page,
        """{
          printed: window.__printed,
          scoped: document.documentElement.classList.contains('print-scoped'),
          form: shown('[data-print-doc]'),
          rows: document.querySelectorAll('[data-print-doc] table[data-table="service-lines"] tbody tr').length,
          banner: shown('.prepared-banner'),
          sidebar: shown('.app-sidebar'),
          submit: shown('button[data-action="submit"]'),
        }""",
    )
    page.emulate_media(media="print")
    page.screenshot(path="tests/shots/28_print_service_report.png", full_page=True)
    page.emulate_media(media="screen")
    check("Print on a record prints the form (the browser was asked to print once)", seen["printed"] == 1 and seen["scoped"] and seen["form"] and seen["rows"] == 16, seen)
    check("...and nothing around it: the assistant's banner, the sidebar and the buttons stay off the paper", not seen["banner"] and not seen["sidebar"] and not seen["submit"], seen)

    # ---- nothing the browser adds goes on the paper (REQUIREMENTS s59) ----
    # A browser prints its header and footer IN THE PAGE'S MARGIN - the date and
    # time top left, the address and "1/3" at the foot. With no page margin
    # there is nowhere for them, and the document carries its own margin.
    margins = page.evaluate(
        """() => {
             const out = [];
             for (const sheet of Array.from(document.styleSheets)) {
               let rules;
               try { rules = Array.from(sheet.cssRules); } catch (e) { continue; }
               for (const r of rules) if (r.cssText && r.cssText.startsWith('@page')) out.push(r.style.margin || r.cssText);
             }
             return out;
           }"""
    )
    check(
        "The printed page takes no margin, so a browser cannot print the date and time on it",
        len(margins) > 0 and all(m in ("0px", "0", "0px 0px 0px 0px") for m in margins),
        margins,
    )
    kept = printed_view(
        page,
        """{
          doc: getComputedStyle(document.querySelector('[data-print-doc]')).padding,
        }""",
    )
    # 12 mm at 96 dpi is 45.35 px.
    check(
        "…and the document keeps that margin for itself, so it does not print against the paper's edge",
        kept["doc"].startswith("45.3"),
        kept,
    )
    page.evaluate(END_PRINT)
    check(
        "When printing ends the page is back as it was",
        page.evaluate("() => !document.documentElement.classList.contains('print-scoped') && !document.querySelector('.print-scope-hidden')"),
    )

    # ---- 4. F/HR/18: Add visit / Edit register for the chosen Month & Year ----
    open_register_for_last_month(page)
    month_year = page.locator(".fhr18-sheet .fhr18-month .v").first.inner_text().strip()
    pages = printed_view(
        page,
        """{
          wrapper: getComputedStyle(document.querySelector('[data-print-doc]')).padding,
          sheet: getComputedStyle(document.querySelector('.register-page')).padding,
          sheets: document.querySelectorAll('.register-page').length,
        }""",
    )
    check(
        "Every page of a register keeps the margin, and the register does not add a second one",
        pages["sheets"] >= 2 and pages["sheet"].startswith("45.3") and pages["wrapper"] == "0px",
        pages,
    )
    check("The register shows the Month & Year chosen", month_year == f"{LAST_MONTH.strftime('%B').upper()}-{LAST_MONTH.strftime('%y')}", month_year)
    check("It offers Add visit, Edit register and Print on the register", all(page.locator(f"[data-action='{a}']").count() == 1 for a in ["fhr18-add", "fhr18-edit", "fhr18-print"]))

    page.click("[data-action='fhr18-add']")
    page.wait_for_timeout(200)
    first = page.locator("input[data-field='fhr18-add-date']").input_value()
    check("Add visit offers a date in that month (its first scheduled visit)", first.startswith(LAST_MONTH.strftime("%Y-%m-")), first)
    page.fill("input[data-field='fhr18-add-date']", TODAY.isoformat())
    page.click("[data-action='fhr18-add-confirm']")
    page.wait_for_timeout(200)
    problem = page.locator("[data-section='fhr18-add-problem']")
    check("A date outside the register's month is refused, with the reason", problem.count() == 1 and "has to be in" in problem.inner_text())
    page.fill("input[data-field='fhr18-add-date']", first)
    page.click("[data-action='fhr18-add-confirm']")
    page.wait_for_timeout(500)
    visit1 = fly_visit(page, first)
    notes = [h.get("note") or "" for h in (visit1 or {}).get("history") or []]
    check(
        "The visit is on the register: a Live F/HR/18 draft for that date, noted in its history as added",
        bool(visit1) and visit1["status"] == "In Progress" and not visit1.get("prepared") and any("Visit added" in n for n in notes),
        visit1 and {"status": visit1["status"], "notes": notes},
    )
    counts = page.locator(".fhr18-sheet input[data-field='count']")
    check("...and the register opens for editing: one count box per unit for that visit", counts.count() == 13, counts.count())

    units = page.locator("tbody.fhr18-unit")
    for i in range(units.count()):
        u = units.nth(i)
        u.locator("input[data-field='count']").first.fill(str(i % 5))
        u.locator("input[data-field='cleaning']").first.fill("Vijay")
        u.locator("input[data-field='verified']").first.fill("Roshni")
    page.locator("tbody.fhr18-unit[data-pc='PC-01'] input[data-field='count']").first.fill("7")
    page.wait_for_timeout(1500)
    v1 = stored(page, visit1["id"])
    pc01 = next(e for e in v1["data"]["entries"] if e["pcId"] == "PC-01")
    check("What is typed into the register saves itself into that visit", pc01["catchCountApprox"] == 7 and pc01["cleaningDoneBy"] == "Vijay" and pc01["verifiedBy"] == "Roshni", pc01)
    check(
        "...with the change in the visit's history (before -> after)",
        any(c["label"].endswith("Flies catch count") and c["after"] == "7" for h in v1.get("history") or [] for c in h.get("changes") or []),
        v1.get("history"),
    )

    page.click("[data-action='fhr18-add']")
    page.wait_for_timeout(200)
    second = page.locator("input[data-field='fhr18-add-date']").input_value() or LAST_MONTH.replace(day=25).isoformat()
    page.fill("input[data-field='fhr18-add-date']", first)
    page.click("[data-action='fhr18-add-confirm']")
    page.wait_for_timeout(200)
    check("The same date can't go on the register twice", "already a visit" in page.locator("[data-section='fhr18-add-problem']").inner_text())
    page.fill("input[data-field='fhr18-add-date']", second)
    page.click("[data-action='fhr18-add-confirm']")
    page.wait_for_timeout(500)
    visit2 = fly_visit(page, second)
    pc01b = next((e for e in (visit2 or {}).get("data", {}).get("entries", []) if e["pcId"] == "PC-01"), {})
    check(
        "The next visit carries the names forward from the one before it and leaves its counts to be entered",
        pc01b.get("cleaningDoneBy") == "Vijay" and pc01b.get("verifiedBy") == "Roshni" and pc01b.get("catchCountApprox") is None,
        pc01b,
    )

    page.click(f"[data-visit-open='{first}']")
    page.wait_for_timeout(800)
    page.click("button[data-action='submit']")
    page.wait_for_timeout(600)
    check("The first visit, filled in on the register, submits from its own page", stored(page, visit1["id"])["status"] == "Pending Verification", page.locator(".error-list").all_inner_texts())

    open_register_for_last_month(page)
    cells = page.evaluate(PC01_CELLS)
    row = cells[0] if cells else []
    check(
        "Back on the register the visit reads as the paper does: its date and a two-digit count",
        len(row) == 7 and row[1] == paper(first) and row[2] == "07" and row[5] == "Vijay",
        cells,
    )
    page.click("[data-action='fhr18-edit']")
    page.wait_for_timeout(300)
    check(
        "In Edit register a submitted visit is locked — only the draft visit takes input",
        page.locator(f".fhr18-sheet tr.locked[data-visit='{first}']").count() == 13 and page.locator(".fhr18-sheet input[data-field='count']").count() == 13,
        [page.locator(f".fhr18-sheet tr.locked[data-visit='{first}']").count(), page.locator(".fhr18-sheet input[data-field='count']").count()],
    )

    # ---- 5. The register's Print, and the browser's own Print ----
    page.evaluate(STUB_PRINT)
    page.click("[data-action='fhr18-print']")
    page.wait_for_timeout(300)
    seen = printed_view(
        page,
        """{
          printed: window.__printed,
          sheet: shown('.fhr18-sheet'),
          title: shown('.app-content h1'),
          toolbar: shown('[data-section="fhr18-toolbar"]'),
          inputs: document.querySelectorAll('.fhr18-sheet input').length,
        }""",
    )
    page.emulate_media(media="print")
    page.screenshot(path="tests/shots/29_print_fhr18_register.png", full_page=True)
    page.emulate_media(media="screen")
    page.evaluate(END_PRINT)
    check("Print register prints the register alone — not the page title or its toolbar", seen["printed"] == 1 and seen["sheet"] and not seen["title"] and not seen["toolbar"], seen)
    check("...and as the paper form: the edit boxes are gone from the printout", seen["inputs"] == 0, seen)

    page.evaluate(START_BROWSER_PRINT)
    seen = printed_view(page, "{ sheet: shown('.fhr18-sheet'), intro: shown('.app-content p.text-muted'), title: shown('.app-content h1') }")
    page.evaluate(END_PRINT)
    check("The browser's own Print (Ctrl+P) gives the same printout: the register, not the page's title or explanation", seen["sheet"] and not seen["intro"] and not seen["title"], seen)

    page.goto(f"{BASE}/index.html#/reports")
    page.wait_for_timeout(500)
    page.evaluate(START_BROWSER_PRINT)
    seen = printed_view(page, "{ report: shown('[data-print-doc]'), tabs: shown('.app-content .pill-tabs'), title: shown('.app-content h1') }")
    page.evaluate(END_PRINT)
    check("Printing Reports prints the open report — not the tabs or the title above it", seen["report"] and not seen["tabs"] and not seen["title"], seen)

    page.goto(f"{BASE}/index.html#/chemical-master")
    page.wait_for_timeout(400)
    page.evaluate(STUB_PRINT)
    page.click(".app-content button:has-text('Print')")
    page.wait_for_timeout(200)
    seen = printed_view(page, "{ printed: window.__printed, header: shown('[data-print-doc] .doc-header'), note: shown('[data-print-doc] > p') }")
    page.evaluate(END_PRINT)
    check("The Chemical Master has a Print of its own, which prints the chart without the page's note", seen["printed"] == 1 and seen["header"] and not seen["note"], seen)

    page.goto(f"{BASE}/index.html#/pest/service/fly")
    page.wait_for_timeout(500)
    check(
        "The Fly Control service page's register has the same Add visit / Edit register",
        page.locator("[data-section='fhr18'] [data-action='fhr18-add']").count() == 1 and page.locator("[data-section='fhr18'] [data-action='fhr18-edit']").count() == 1,
    )

    # ---- 6. An added visit is the person's: the start-up clean-ups leave it alone ----
    page.reload()
    page.wait_for_timeout(900)
    dismiss(page)
    v2 = stored(page, visit2["id"]) if visit2 else None
    check(
        "After a restart the added draft visit is untouched: not filled in by the assistant, not moved",
        bool(v2) and v2["status"] == "In Progress" and not v2.get("prepared") and v2["dueDate"] == second,
        v2 and {k: v2.get(k) for k in ("status", "dueDate", "prepared")},
    )

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nAll print and form checks passed.")
