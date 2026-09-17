"""Gujarati through Google Translate — switched on and off by the language buttons.

Network-independent: Google's website translator is replaced by a stand-in
served at the same address (translate.google.com/translate_a/element.js) that
behaves the way Google's does — a hidden language box, a toolbar pushed in at
the top, and every English text node on the page swapped for a <font> holding
the "translation" (here: the text prefixed with ગુ:), including text that
appears later. That swap is exactly what trips React up, so this proves:

  * choosing ગુજરાતી loads Google Translate and the WHOLE page is translated
    (from the English screens, not the built-in Gujarati), with Google's
    toolbar hidden and the page not pushed down;
  * issued documents (forms, registers, headers) are left exactly as issued;
  * every page still works with the page translated — no crash — and text
    that changes afterwards (a count, "All changes saved") shows its NEW value,
    translated again (like Google, the stand-in never re-translates a node it
    has already handled, so this needs the guard's fresh-node refresh);
  * the choice survives a reload; choosing English reloads the page back to
    the original English, forgets Google's cookie and doesn't load Google;
  * without Google (offline), Gujarati falls back to the built-in text and says so.
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

# The labels below contain Gujarati; a Windows console defaults to cp1252.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
FAILURES = []
MARK = "ગુ:"
REQUESTS = []

FAKE_GOOGLE = r"""
(function () {
  var cb = document.currentScript && new URL(document.currentScript.src).searchParams.get('cb');
  var on = false, flip = 0, seen = new WeakSet();
  function skipped(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (/^(SCRIPT|STYLE|FONT|TEXTAREA)$/.test(n.nodeName)) return true;
      if (n.getAttribute('translate') === 'no') return true;
      if (n.classList && (n.classList.contains('notranslate') || n.classList.contains('skiptranslate'))) return true;
    }
    return false;
  }
  function tr(node) {
    var v = node.nodeValue, p = node.parentNode;
    if (!on || !v || !v.trim() || v.indexOf('ગુ:') === 0 || !p || skipped(p) || seen.has(node)) return;
    // Like Google: a text node is translated once; changing it later is not noticed.
    seen.add(node);
    var outer = document.createElement('font'), inner = document.createElement('font');
    inner.textContent = 'ગુ:' + v;
    outer.appendChild(inner);
    // Both ways Google's code has been seen to swap a node.
    if ((flip++) % 2) p.replaceChild(outer, node); else { p.insertBefore(outer, node); p.removeChild(node); }
  }
  function walk(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
    while (w.nextNode()) list.push(w.currentNode);
    list.forEach(tr);
  }
  new MutationObserver(function (recs) {
    if (!on) return;
    recs.forEach(function (r) {
      r.addedNodes.forEach(function (n) {
        if (n.nodeType === 3) tr(n); else if (n.nodeType === 1 && n.nodeName !== 'FONT') walk(n);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
  function TranslateElement(opts, id) {
    var box = document.getElementById(id), gadget = document.createElement('div'), sel = document.createElement('select');
    gadget.className = 'skiptranslate goog-te-gadget';
    sel.className = 'goog-te-combo';
    ['', 'gu'].forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v || 'Select Language'; sel.appendChild(o); });
    gadget.appendChild(sel); box.appendChild(gadget);
    sel.addEventListener('change', function () {
      if (sel.value !== 'gu' || on) return;
      on = true;
      var bar = document.createElement('div');
      bar.className = 'skiptranslate';
      bar.innerHTML = '<iframe class="skiptranslate" style="height:39px;width:100%;border:0"></iframe>';
      document.body.insertBefore(bar, document.body.firstChild);
      document.body.style.position = 'relative';
      document.body.style.top = '40px';
      document.documentElement.classList.add('translated-ltr');
      walk(document.body);
    });
  }
  TranslateElement.InlineLayout = { SIMPLE: 0 };
  window.google = { translate: { TranslateElement: TranslateElement } };
  if (cb && window[cb]) window[cb]();
})();
"""


# The company's working calendar (the Gujarat Print Pack Leave Calendar 2026,
# as tests/e2e_smoke.py has it): Thursday is the weekly off except on
# adjustment days, plus the festival holidays.
ADJUSTMENT_DAYS_2026 = {"2026-01-22", "2026-08-06", "2026-10-22", "2026-11-05", "2026-11-20"}
FESTIVAL_HOLIDAYS_2026 = {
    "2026-01-14", "2026-01-26", "2026-03-04", "2026-08-15", "2026-08-28", "2026-09-04", "2026-10-19", "2026-10-20",
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
}


def next_working_day(d):
    while d.isoformat() in FESTIVAL_HOLIDAYS_2026 or (d.weekday() == 3 and d.isoformat() not in ADJUSTMENT_DAYS_2026):
        d += timedelta(days=1)
    return d


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


def serve_fake(route):
    REQUESTS.append(route.request.url)
    route.fulfill(status=200, content_type="text/javascript", body=FAKE_GOOGLE)


def protected_text(page):
    return page.evaluate("Array.from(document.querySelectorAll('[translate=no]')).map(e => e.innerText).join('\\n')")


def plain(s):
    return s.replace(MARK, "")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950})
    page.on("pageerror", lambda e: FAILURES.append(f"page error: {e}"))
    page.on(
        "console",
        lambda m: FAILURES.append(f"console error: {m.text}")
        if m.type == "error" and any(k in m.text for k in ("removeChild", "insertBefore", "NotFoundError", "React error"))
        else None,
    )
    page.route("**/translate_a/**", serve_fake)
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    page.click("text=Sign up")
    page.fill("#signup-name", "Translate QA")
    page.fill("#signup-email", f"translate-{int(time.time()*1000)}@example.com")
    page.fill("#signup-password", "PlaywrightQA123")
    page.fill("#signup-confirm", "PlaywrightQA123")
    page.click("button:has-text('Create Account')")
    page.wait_for_timeout(1200)
    dismiss(page)
    page.goto(f"{BASE}/index.html#/dashboard")
    page.wait_for_timeout(600)
    dismiss(page)
    check("English: Google Translate is not loaded at all", len(REQUESTS) == 0, REQUESTS)

    # ---- choose Gujarati ----
    page.select_option(".lang-select", "gu")
    page.wait_for_timeout(1200)
    sidebar = page.locator(".app-sidebar").inner_text()
    check("Choosing ગુજરાતી loads Google Translate", len(REQUESTS) == 1 and "translate.google.com/translate_a/element.js" in REQUESTS[0], REQUESTS)
    check(
        "The whole page is translated by Google, from the English screens",
        page.evaluate("document.documentElement.classList.contains('translated-ltr')")
        and f"{MARK}Dashboard" in sidebar
        and MARK in page.locator(".app-content").inner_text()
        and "ડેશબોર્ડ" not in sidebar,
        sidebar[:300],
    )
    check(
        "Google's toolbar is hidden and the page isn't pushed down",
        page.evaluate("getComputedStyle(document.body).top") == "0px" and not page.locator("iframe.skiptranslate").first.is_visible(),
        page.evaluate("getComputedStyle(document.body).top"),
    )
    check(
        "The language buttons keep their own names",
        "ગુજરાતી" in page.locator(".lang-select").inner_text() and MARK not in page.locator(".lang-select").inner_text(),
    )

    # ---- issued documents stay as issued ----
    page.goto(f"{BASE}/index.html#/pest/daily")
    page.wait_for_timeout(900)
    kept = protected_text(page)
    check(
        "The F/HR/17 register is left exactly as issued (its check points are not translated)",
        "Total number of rodent traps provided" in kept and MARK not in kept,
        kept[:300],
    )
    check("…while the page around it is translated", MARK in page.locator(".app-content").inner_text())

    today = date.today().isoformat()
    # The next WORKING day's daily record: on a closed day (the Thursday weekly
    # off, a festival holiday) today's is the holiday line, with no checker.
    rid = page.evaluate(
        "(d) => (JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').find(r => r.documentId === 'daily-pest-monitoring' && !r.isDemo && r.dueDate === d) || {}).id",
        next_working_day(date.today()).isoformat(),
    )
    page.goto(f"{BASE}/index.html#/record/{rid}")
    page.wait_for_timeout(900)
    dismiss(page)
    kept = protected_text(page)
    check("An open record's form is left exactly as issued", "F/HR/17" in kept and MARK not in kept, kept[:200])
    page.fill("input[placeholder='Name of checker']", "Vijay")
    page.wait_for_timeout(1500)
    saved = page.locator("[data-save-state='saved']")
    check(
        'Text that changes after translation shows its new value, translated ("All changes saved")',
        saved.count() == 1 and f"{MARK}All changes saved" in saved.inner_text(),
        saved.all_inner_texts() if saved.count() else page.locator("[data-save-state]").all_inner_texts(),
    )
    stored = page.evaluate("(id) => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').find(r => r.id === id).data.checker", rid)
    check("Typing into a form still saves with the page translated", stored == "Vijay", stored)

    # A count that changes when a folder is picked.
    first = date.today().replace(day=1).isoformat()
    page.goto(f"{BASE}/index.html#/files/all/{first}/{today}")
    page.wait_for_timeout(900)
    total = int(plain(page.locator("[data-section='file-summary']").inner_text()).split(" ")[0])
    folder = page.locator("[data-folder='doc:daily-pest-monitoring']")
    k = int(plain(folder.locator(".file-count").inner_text()).strip())
    folder.click()
    page.wait_for_timeout(700)
    summary = plain(page.locator("[data-section='file-summary']").inner_text())
    check(
        f"A count that changes after translation shows the new number ({total} → {k} files)",
        k != total and summary.startswith(f"{k} files") and page.locator("[data-section='file-summary']").inner_text().startswith(f"{MARK}{k} files"),
        page.locator("[data-section='file-summary']").inner_text(),
    )

    # Every page still works with Google's text in place.
    for route in ["#/calendar", "#/reports", "#/pest-control", "#/library", "#/master-data", "#/assistant", "#/dashboard"]:
        page.goto(f"{BASE}/index.html{route}")
        page.wait_for_timeout(600)
    check(
        "Every page still works with the page translated (no crash from Google's rewritten text)",
        not [f for f in FAILURES if f.startswith(("page error", "console error"))] and MARK in page.locator(".app-content").inner_text(),
        [f for f in FAILURES if f.startswith(("page error", "console error"))],
    )

    # ---- the choice is remembered ----
    page.reload()
    page.wait_for_timeout(1500)
    dismiss(page)
    check(
        "After a reload the page comes back in Gujarati",
        page.evaluate("document.documentElement.classList.contains('translated-ltr')") and f"{MARK}Dashboard" in page.locator(".app-sidebar").inner_text(),
    )

    # ---- back to English ----
    page.evaluate("window.__stillHere = true")
    n_before = len(REQUESTS)
    with page.expect_navigation():
        page.select_option(".lang-select", "en")
    page.wait_for_timeout(1200)
    dismiss(page)
    body = page.locator("body").inner_text()
    cookie = [c for c in page.context.cookies() if c["name"] == "googtrans" and c["value"]]
    check(
        "Choosing English brings back the original page (reloaded, nothing translated)",
        page.evaluate("window.__stillHere") is None
        and MARK not in body
        and not page.evaluate("document.documentElement.classList.contains('translated-ltr')")
        and "Dashboard" in page.locator(".app-sidebar").inner_text(),
    )
    check("…on the same screen", page.url.endswith("#/dashboard"), page.url)
    check("…and Google's cookie is gone and Google isn't loaded again", not cookie and len(REQUESTS) == n_before, (cookie, REQUESTS))

    # ---- no Google available ----
    page.unroute("**/translate_a/**")
    page.route("**/translate_a/**", lambda route: route.abort())
    page.evaluate("window.__stillHere = true")
    page.select_option(".lang-select", "gu")
    page.wait_for_timeout(1000)
    check(
        "Without Google, Gujarati falls back to the built-in text",
        "ડેશબોર્ડ" in page.locator(".app-sidebar").inner_text() and page.locator(".lang-note[data-translation='failed']").count() == 1,
        page.locator(".app-sidebar").inner_text()[:200],
    )
    page.select_option(".lang-select", "en")
    page.wait_for_timeout(600)
    check(
        "…and English comes straight back, without a reload",
        page.evaluate("window.__stillHere") is True and "Dashboard" in page.locator(".app-sidebar").inner_text(),
    )

    browser.close()

print(f"\n{'ALL PASS' if not FAILURES else f'{len(FAILURES)} FAILED'}")
for f in FAILURES:
    print("  -", f)
sys.exit(1 if FAILURES else 0)
