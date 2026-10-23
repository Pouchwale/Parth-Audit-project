"""THE MICROPHONE ON THE COMPANY NETWORK (the owner, 23-Oct-2026: "when i deployed it locally microphone is unable to
start but when it run it on my system it running perfectly here so browser is blocking the microphone so fix it any how").

A browser lends a page the microphone only on https or on http://localhost. DCRS now also answers on a secure address
of its own (backend/secureAddress.ts: the http port + 443, on a certificate it makes and signs with the plant's own
authority). This suite opens DCRS the way another computer on the network does - at this PC's own network address - and
checks:
- the secure address answers with the same DCRS over TLS, trusted through the plant's authority, which
  GET /dcrs-certificate.crt hands out (never a key), and GET /api/secure-address names its port;
- over http at the network address the page has no microphone, and Mitra's note names the same page on the secure
  address with a button that opens it;
- on the secure address (the browser's one warning passed, as a person does once) the page is a secure context and the
  browser lends the microphone (Chromium's fake one); the button from the http page lands there.
No sound is made (tests/quiet). The password is made for this run and written nowhere.
"""
import json
import secrets
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright

HTTP_PORT = 8842
SECURE_PORT = HTTP_PORT + 443
BASE = f"http://localhost:{HTTP_PORT}"
FAILURES = []
FAKE_MIC = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]


def check(label, cond):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)


def lan_ip():
    """This PC's address on its network (the one another computer would open), or None when it has none."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # (no packet is sent: it only picks the address the route would use)
        ip = s.getsockname()[0]
    except OSError:
        ip = None
    finally:
        s.close()
    return ip if ip and not ip.startswith("127.") and not ip.startswith("169.254.") else None


def fetch(url, context=None):
    try:
        with urllib.request.urlopen(url, context=context, timeout=15) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), e.read().decode("utf-8", "replace")


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


def close_briefing(page):
    try:
        page.wait_for_selector("button:has-text('Got it')", timeout=8000)
    except PlaywrightTimeoutError:
        pass
    got_it = page.locator("button:has-text('Got it')")
    if got_it.count():
        got_it.first.click()
        page.wait_for_timeout(200)
    settle_briefing(page)


def sign_up(page, base, email, password):
    page.goto(f"{base}/index.html")
    page.wait_for_timeout(400)
    page.click("text=Sign up")
    page.fill("#signup-name", "Secure Address QA")
    page.fill("#signup-email", email)
    page.fill("#signup-password", password)
    page.fill("#signup-confirm", password)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    close_briefing(page)


def sign_in(page, base, email, password):
    page.goto(f"{base}/index.html")
    page.wait_for_timeout(400)
    if page.locator(".app-sidebar").count():
        return
    page.wait_for_selector("#login-email", timeout=30000)
    page.fill("#login-email", email)
    page.fill("#login-password", password)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    close_briefing(page)


# ---- the secure address, without a browser ------------------------------------------------------------------------
status, ctype, body = fetch(f"{BASE}/api/secure-address")
where = json.loads(body) if status == 200 else {}
check(f"GET /api/secure-address names the secure port ({SECURE_PORT}) and the certificate", where == {"port": SECURE_PORT, "certificate": "/dcrs-certificate.crt"})
status, ctype, authority = fetch(f"{BASE}/dcrs-certificate.crt")
check("GET /dcrs-certificate.crt hands out the plant's certificate authority", status == 200 and "x-x509-ca-cert" in ctype and authority.startswith("-----BEGIN CERTIFICATE-----"))
check("...and never a key", "PRIVATE KEY" not in authority)
trust = ssl.create_default_context(cadata=authority) if authority.startswith("-----BEGIN CERTIFICATE-----") else None
if trust:
    status, _, body = fetch(f"https://localhost:{SECURE_PORT}/api/secure-address", trust)
    check("https://localhost answers with the same DCRS, trusted through the plant's authority alone", status == 200 and json.loads(body).get("port") == SECURE_PORT)
    try:
        fetch(f"https://localhost:{SECURE_PORT}/api/secure-address", ssl.create_default_context())
        check("...and a browser that has not installed it is warned (not trusted by the world's authorities)", False)
    except (ssl.SSLError, urllib.error.URLError):
        check("...and a browser that has not installed it is warned (not trusted by the world's authorities)", True)

IP = lan_ip()
if not IP:
    print("(this PC has no network address: the checks over the network are left out)")
else:
    print(f"(this PC's network address: {IP})")
    if trust:
        status, _, _ = fetch(f"https://{IP}:{SECURE_PORT}/api/secure-address", trust)
        check(f"https://{IP}:{SECURE_PORT}: the certificate names this PC's network address", status == 200)

email = f"secure-{int(time.time() * 1000)}@example.com"
password = f"Mic{secrets.token_hex(6)}A1"

with sync_playwright() as p:
    browser = p.chromium.launch(args=FAKE_MIC)
    errors = []

    if IP:
        # ---- another computer, at the http address ------------------------------------------------------------------
        lan = browser.new_context()
        page = lan.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        sign_up(page, f"http://{IP}:{HTTP_PORT}", email, password)
        page.goto(f"http://{IP}:{HTTP_PORT}/index.html#/assistant")
        page.wait_for_timeout(800)
        check("At http://<network address> the page is not a secure context: the browser has no microphone to lend",
              page.evaluate("() => window.isSecureContext === false && !navigator.mediaDevices"))
        mic = page.locator("button[data-action='voice']")
        check("Mitra's microphone button is there", mic.count() >= 1)
        if mic.count():
            mic.first.click()
            secure_url = f"https://{IP}:{SECURE_PORT}/#/assistant"
            try:
                page.wait_for_function(f"() => (document.body.innerText || '').includes({json.dumps(secure_url)})", timeout=15000)
            except PlaywrightTimeoutError:
                pass
            note = page.locator(".assistant-voice-note")
            said = note.first.inner_text() if note.count() else ""
            print(f"    (the note: {said[:220]!r})")
            check("Mitra's note names the same page on the secure address", secure_url in said)
            check("...and never says the permission was blocked", "blocked" not in said.lower())
            button = page.locator("a[data-action='open-secure-address']")
            check("...with a button that opens it", button.count() == 1 and button.first.get_attribute("href") == secure_url)
        lan.close()

    # ---- the secure address, its warning passed once ----------------------------------------------------------------
    secure_base = f"https://{IP or 'localhost'}:{SECURE_PORT}"
    safe = browser.new_context(ignore_https_errors=True)
    page = safe.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    if IP:
        sign_in(page, secure_base, email, password)
    else:
        sign_up(page, secure_base, email, password)
    page.goto(f"{secure_base}/index.html#/assistant")
    page.wait_for_timeout(800)
    check("On the secure address the page is a secure context, with the browser's microphone",
          page.evaluate("() => window.isSecureContext === true && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'"))
    tracks = page.evaluate(
        """async () => {
             try {
               const s = await navigator.mediaDevices.getUserMedia({ audio: true });
               const n = s.getAudioTracks().filter((t) => t.readyState === 'live').length;
               s.getTracks().forEach((t) => t.stop());
               return n;
             } catch (e) { return 'refused: ' + e.name; }
           }"""
    )
    check(f"...and the browser lends it: the microphone starts (live audio tracks: {tracks})", tracks == 1)
    check("No microphone note about the secure address there", "secure address" not in (page.locator("body").inner_text() or ""))

    if IP:
        # The button on the http page lands on the secure address, the same page, signed in.
        page.goto(f"http://{IP}:{HTTP_PORT}/index.html#/assistant")
        page.wait_for_timeout(800)
        mic = page.locator("button[data-action='voice']")
        if mic.count():
            mic.first.click()
            try:
                page.wait_for_selector("a[data-action='open-secure-address']", timeout=15000)
                page.click("a[data-action='open-secure-address']")
                page.wait_for_url(f"https://{IP}:{SECURE_PORT}/**", timeout=20000)
                page.wait_for_timeout(1500)
                landed = page.url
            except PlaywrightTimeoutError:
                landed = page.url
            check(f"The button opens the same page on the secure address ({landed})", landed.startswith(f"https://{IP}:{SECURE_PORT}/") and landed.endswith("#/assistant"))
            check("...a secure context, where the microphone works", page.evaluate("() => window.isSecureContext === true && !!navigator.mediaDevices"))
    safe.close()
    check("No JavaScript errors", not errors)
    for e in errors[:5]:
        print("    PAGEERROR", e)
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for failure in FAILURES:
        print(" -", failure)
    sys.exit(1)
print("\nAll secure-address checks passed.")
