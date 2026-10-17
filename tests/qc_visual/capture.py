"""(c) DCRS CAPTURE. Signs in to the kit's private DCRS with Playwright, opens each document the way a person does (a NEW BLANK RECORD
from the Document Library, or the statement's own page for a reference-only statement), then produces the PRINT as the app does -
the pattern of tests/e2e_print_all_documents.py: the `beforeprint` event (the app's own print preparation: scoping to the document,
fitToPage, the @page orientation, data-paper), print media, the browser's PDF at the CSS page size, `window.print` stubbed.

Per document it saves DIR/dcrs/<docId>/print.pdf, page-N.png (110 dpi), pages.json (words, rules, page boxes) and capture.json.
"""
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

STUB_PRINT = "() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }"
START_BROWSER_PRINT = "() => window.dispatchEvent(new Event('beforeprint'))"
END_PRINT = "() => window.dispatchEvent(new Event('afterprint'))"

# What the page says about its print layout, read while the print preparation is on.
PRINT_FACTS = """
() => {
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const docs = Array.from(document.querySelectorAll('[data-print-doc]')).filter(shown);
  const paperEl = document.querySelector('[data-print-doc][data-paper], [data-print-doc] [data-paper]');
  return {
    documents: docs.length,
    page: document.documentElement.dataset.printPage || 'portrait',
    paper: paperEl ? paperEl.getAttribute('data-paper') : null,
    zoom: docs.map((d) => d.style.zoom || ''),
    tables: docs.reduce((n, d) => n + d.querySelectorAll('table').length, 0),
    sheets: docs.reduce((n, d) => n + d.querySelectorAll('.paper-sheet').length, 0),
    title: (document.querySelector('[data-print-doc] .doc-title') || {}).textContent || '',
  };
}
"""


def settle_briefing(page):
    """Today's briefing slots marked as already shown, so it cannot open part way through the run (as the e2e suites do)."""
    page.evaluate(
        """() => {
             const KEY = 'dcrs:v1:settings';
             const now = new Date();
             const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
             const s = JSON.parse(localStorage.getItem(KEY) || '{}');
             s.briefingShown = { date: today, slots: ['first', 'morning', 'evening'] };
             s.tourSeen = true;
             localStorage.setItem(KEY, JSON.stringify(s));
           }"""
    )


def dismiss(page):
    for label in ("Got it", "Skip", "Skip tour", "Close", "Not now"):
        for _ in range(2):
            b = page.locator(f"button:has-text('{label}')")
            if b.count() and b.first.is_visible():
                try:
                    b.first.click(timeout=1500)
                    page.wait_for_timeout(150)
                except Exception:
                    pass
    settle_briefing(page)
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        try:
            btn.first.click(timeout=1000)
        except Exception:
            pass


def sign_in(page, base, email, password):
    page.goto(f"{base}/index.html")
    page.wait_for_selector("#login-email", timeout=30000)
    page.fill("#login-email", email)
    page.fill("#login-password", password)
    page.click("button:has-text('Log In')")
    try:
        page.wait_for_selector(".app-sidebar", timeout=30000)
    except Exception:
        shot = os.path.join(common.DEFAULT_OUT, "sign-in-failed.png")
        page.screenshot(path=shot)
        raise SystemExit(f"Could not sign in to the private DCRS (screenshot: {shot}).")
    page.wait_for_timeout(600)
    dismiss(page)
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(900)
    dismiss(page)
    page.evaluate(STUB_PRINT)


def library_new_record_ids(page, base):
    page.goto(f"{base}/index.html#/library")
    page.wait_for_timeout(1200)
    dismiss(page)
    return page.eval_on_selector_all("[data-action='new-record']", "els => els.map(e => e.getAttribute('data-document'))")


def open_document(page, base, doc, pages=("#/record/",)):
    """Opens the document as a person does; returns how ('new-record' | 'statement' | 'document-page') or raises."""
    if doc["kind"] == "compliance-statement":
        page.goto(f"{base}/index.html#/soc/{doc['id']}")
        page.wait_for_timeout(1100)
        dismiss(page)
        page.evaluate(STUB_PRINT)
        return "statement"
    page.goto(f"{base}/index.html#/library")
    page.wait_for_timeout(900)
    dismiss(page)
    button = page.locator(f"[data-action='new-record'][data-document='{doc['id']}']")
    if button.count() == 0:
        # the document's own page, where "Open Document" lands, offers New too
        page.goto(f"{base}/index.html#/document/{doc['id']}")
        page.wait_for_timeout(1000)
        dismiss(page)
        alt = page.locator("[data-action='new-record'], button:has-text('New')")
        if alt.count() == 0:
            raise RuntimeError("no New record button on the library or on the document's page")
        alt.first.click()
        how = "document-page"
    else:
        button.first.click()
        how = "new-record"
    page.wait_for_timeout(1400)
    dismiss(page)
    page.evaluate(STUB_PRINT)
    if not any(p in page.url for p in pages):
        # a refusal or a notice instead of a sheet
        raise RuntimeError(f"the record did not open (at {page.url.split('#', 1)[-1]})")
    return how


def print_pdf(page, pdf_path):
    """The browser's PDF of what the app prints (print media after `beforeprint`), at the CSS page size the app chose."""
    page.evaluate(START_BROWSER_PRINT)
    try:
        page.emulate_media(media="print")
        page.wait_for_timeout(350)
        facts = page.evaluate(PRINT_FACTS)
        page.pdf(path=pdf_path, prefer_css_page_size=True, print_background=True, format="A4")
    finally:
        page.emulate_media(media="screen")
        page.evaluate(END_PRINT)
    return facts


def capture_document(page, base, doc, out_root, keep_png=True):
    """Opens, prints and extracts one document. Returns its capture.json (also written)."""
    d = os.path.join(out_root, "dcrs", doc["id"])
    os.makedirs(d, exist_ok=True)
    info = {"docId": doc["id"], "formatNo": doc["formatNo"], "kind": doc["kind"], "ok": False}
    started = time.time()
    try:
        info["opened"] = open_document(page, base, doc)
        info["url"] = page.url.split("#", 1)[-1]
        pdf = os.path.join(d, "print.pdf")
        facts = print_pdf(page, pdf)
        info["facts"] = facts
        pages = common.extract_pdf(pdf)
        common.write_json(os.path.join(d, "pages.json"), pages)
        if keep_png:
            info["pages"] = common.render_pages(pdf, d)
        info["pageCount"] = len(pages)
        info["orientation"] = [p["orientation"] for p in pages]
        info["wordCount"] = sum(len(p["words"]) for p in pages)
        info["ok"] = facts.get("documents", 0) >= 1 and info["wordCount"] > 0
        if not info["ok"]:
            info["error"] = "nothing of the document is on the print" if info["wordCount"] == 0 else "no [data-print-doc] on the page"
    except Exception as e:  # one document failing must not stop the run
        info["error"] = f"{type(e).__name__}: {str(e)[:300]}"
        try:
            page.screenshot(path=os.path.join(d, "failed.png"))
        except Exception:
            pass
    info["seconds"] = round(time.time() - started, 1)
    common.write_json(os.path.join(d, "capture.json"), info)
    return info


def capture_all(srv, docs, out_root, headless=True):
    """Signs in once and captures each document of `docs` (catalogue dicts)."""
    from playwright.sync_api import sync_playwright

    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        try:
            page = browser.new_page(viewport={"width": 1400, "height": 950})
            page.route("**/translate_a/**", lambda route: route.abort())
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            sign_in(page, srv.url, srv.email, srv.password)
            for i, doc in enumerate(docs, 1):
                info = capture_document(page, srv.url, doc, out_root)
                results[doc["id"]] = info
                flag = "ok " if info["ok"] else "FAIL"
                common.say(f"[{i}/{len(docs)}] capture {flag} {doc['id']}: {info.get('pageCount', '-')} page(s) {info.get('orientation', '')} {info.get('error', '')}")
            if errors:
                common.say(f"(page errors: {errors[:3]})")
        finally:
            browser.close()
    return results


if __name__ == "__main__":
    # python -I tests/qc_visual/capture.py [--docs a,b] [--out DIR] [--port N] [--no-build]
    from private_server import PrivateServer

    argv = sys.argv
    out = argv[argv.index("--out") + 1] if "--out" in argv else common.DEFAULT_OUT
    port = int(argv[argv.index("--port") + 1]) if "--port" in argv else None
    only = argv[argv.index("--docs") + 1].split(",") if "--docs" in argv else None
    cat = [c for c in common.load_catalog(out) if (not only or c["id"] in only)]
    with PrivateServer(port=port, build="--no-build" not in argv) as srv:
        capture_all(srv, cat, out)
