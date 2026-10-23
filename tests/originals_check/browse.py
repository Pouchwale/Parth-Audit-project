"""The browser half of the check: sign in to the private DCRS, open a NEW record of a document the way a person does, fill it with
Mitra's sample fill (plainly test data; the server is a test server, ALLOW_SAMPLE_FILL=1), read what the page shows (the same
documentBlocks the Download button reads, bundled by bundle_blocks.mjs), press Download and keep the file, and upload a file back
through the page's own "Upload changes" to see what the app's reader makes of it.

The patterns are tests/e2e_purchase_module.py's (start_record, say) and tests/qc_visual/capture.py's (sign_in, dismiss).
"""
import json
import os
import sys
import time

# The browser this tool launches makes no sound (tests/quiet/quiet_browsers.py, the owner, 23-Oct-2026).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "quiet"))
import quiet_browsers  # noqa: E402,F401

STUB_PRINT = "() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }"


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
    for label in ("Got it", "Skip", "Skip tour", "Not now"):
        b = page.locator(f"button:has-text('{label}')")
        if b.count() and b.first.is_visible():
            try:
                b.first.click(timeout=1500)
                page.wait_for_timeout(150)
            except Exception:
                pass
    settle_briefing(page)


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        try:
            btn.first.click(timeout=1000)
            page.wait_for_timeout(150)
        except Exception:
            pass


def sign_in(page, base, email, password):
    page.goto(f"{base}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    page.fill("#login-email", email)
    page.fill("#login-password", password)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(800)
    dismiss(page)
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(900)
    dismiss(page)
    close_assistant(page)
    page.evaluate(STUB_PRINT)


def open_page(page, base, route, settle=1300):
    page.goto(f"{base}/index.html{route}")
    page.wait_for_timeout(settle)
    dismiss(page)
    close_assistant(page)


def start_record(page, base, doc):
    """A new record of the document, from its own page; returns how it opened ('record' | 'statement' | 'page')."""
    if doc.get("kind") == "compliance-statement":
        open_page(page, base, f"#/soc/{doc['id']}")
        return "statement"
    open_page(page, base, f"#/document/{doc['id']}")
    btn = page.locator("[data-action='document-new-record']")
    if btn.count():
        btn.first.evaluate("el => el.click()")
        page.wait_for_timeout(1600)
        dismiss(page)
        close_assistant(page)
        if "#/record/" in page.url:
            return "record"
    return "page"


def composer(page):
    return page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea")


def say(page, text, wait=2500):
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        try:
            opener.first.click(timeout=3000)
            page.wait_for_timeout(300)
        except Exception:
            pass
    box = composer(page)
    if box.count() == 0:
        return ""
    box.fill(text)
    box.press("Enter")
    page.wait_for_timeout(wait)
    msgs = page.locator(".chat-msg.bot")
    reply = msgs.last.inner_text() if msgs.count() else ""
    close_assistant(page)
    return reply


def inject_blocks(page, bundle_path):
    if not page.evaluate("() => !!window.__origcheck"):
        page.add_script_tag(path=bundle_path)


def page_blocks(page, bundle_path):
    """The blocks the Download button reads (utils/documentExport.ts documentBlocks), as JSON."""
    inject_blocks(page, bundle_path)
    page.evaluate("() => window.dispatchEvent(new Event('dcrs:print-prepare'))")
    page.wait_for_timeout(200)
    return page.evaluate("() => ({ blocks: window.__origcheck.blocks(), recordIds: window.__origcheck.recordIds() })")


def download(page, out_dir, timeout=30000):
    """Presses the page's Download Excel / Word and keeps the file; returns its path and the kind the button said."""
    btn = page.locator("[data-action='download-document']")
    if btn.count() == 0:
        return None, None
    kind = btn.first.get_attribute("data-format")
    os.makedirs(out_dir, exist_ok=True)
    with page.expect_download(timeout=timeout) as info:
        btn.first.evaluate("el => el.click()")
    d = info.value
    # Kept under a short name (a Windows path is at most 260 characters); the name the browser offered is returned too.
    ext = os.path.splitext(d.suggested_filename)[1] or f".{kind}"
    path = os.path.join(out_dir, f"file{ext}")
    d.save_as(path)
    download.suggested = d.suggested_filename
    return path, kind


def upload_back(page, file_path, wait_ms=20000):
    """Uploads a file through the page's own Upload changes and reads what the dialog says: its phase, the count of changes it
    would apply, and its words. Closes the dialog without applying anything."""
    btn = page.locator("[data-action='upload-document-changes']")
    if btn.count() == 0:
        return {"phase": "no-button"}
    with page.expect_file_chooser(timeout=10000) as fc:
        btn.first.evaluate("el => el.click()")
    fc.value.set_files(file_path)
    started = time.time()
    phase = None
    while time.time() - started < wait_ms / 1000:
        phase = page.evaluate("() => (document.querySelector('.rt-dialog') || {}).dataset ? document.querySelector('.rt-dialog').dataset.phase : null")
        if phase and phase != "reading":
            break
        page.wait_for_timeout(250)
    out = {"phase": phase}
    out["words"] = page.evaluate("() => (document.querySelector('.rt-dialog') || {}).innerText || ''")[:3000]
    apply = page.locator("[data-action='apply-uploaded-changes']")
    out["applyCount"] = int(apply.first.get_attribute("data-count") or 0) if apply.count() else 0
    close = page.locator("[data-action='close-upload-changes']")
    if close.count():
        try:
            close.first.click(timeout=3000)
        except Exception:
            pass
    page.wait_for_timeout(300)
    return out


def stored_record(page, record_id):
    return page.evaluate("(id) => (JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')).find(r => r.id === id) || null", record_id)


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
