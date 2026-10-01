"""The DCRS API the Audit Assistant calls, end to end (REQUIREMENTS s83).

The Audit Assistant is a separate chat and voice app. A person signs in to it
with their DCRS account, and its server calls DCRS's /api/v1 routes AS THAT
PERSON, so DCRS's own rules apply to everything it does. This suite plays the
assistant's server:

  * it signs in with DCRS's own POST /api/auth/login and carries the session
    token as "Authorization: Bearer" (a server keeps no cookies);
  * it lists, searches and reads the internal CAPA findings, and closes one with
    a note and "X-Client-Name: Audit Assistant" - and the change is exactly
    DCRS's own Close: the finding Closed with the factory's date, a history
    entry in the person's name saying "Through Audit Assistant: <note>", the
    activity line "Record edited" by that person with the same words, and the
    page in an open browser following it within one pull;
  * a second close is refused (409 already-closed), a note is required (400), a
    staff account kept to another department is refused (403), and a signed-out
    caller gets 401;
  * the day's pest control report comes back as a real PDF of DCRS's own page
    (printed by a headless Chrome/Edge), and as data; a day with no report is a
    404; the download is logged as "Document downloaded as PDF";
  * the OpenAPI description is served without sign-in, and an unknown route
    answers JSON, never the app's page.

The report-verified and busy refusals are proved in backend/tests/apiV1.test.ts.
Against the product server on :8843 (DCRS_BASE overrides it), with the plant's
seeded accounts.
"""
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD", "SeedQA@2026")
ADMIN = os.environ.get("DCRS_ADMIN_EMAIL", "admin@gpp.local")
OTHER_DEPARTMENT = os.environ.get("DCRS_QC_EMAIL", "kapila.barad@gpp.local")  # kept to Quality Control, not QA or HR
CLIENT = "Audit Assistant"
FACTORY = datetime.timezone(datetime.timedelta(hours=5, minutes=30))  # Asia/Kolkata, which has no daylight saving
FAILURES = []


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:600])


def call(method, path, token=None, body=None, headers=None, cookie=None):
    """One HTTP call as the assistant's server makes it. Returns (status, headers, body bytes)."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    h = {"X-Client-Name": CLIENT}
    if data is not None:
        h["Content-Type"] = "application/json"
    if token:
        h["Authorization"] = f"Bearer {token}"
    if cookie:
        h["Cookie"] = f"dcrs_session={cookie}"
    h.update(headers or {})
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.status, dict(res.headers), res.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def as_json(raw):
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def sign_in_api(email):
    """DCRS's own sign-in; the session token is the dcrs_session cookie it sets."""
    status, headers, raw = call("POST", "/api/auth/login", body={"email": email, "password": SEED_PASSWORD})
    cookie = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
    m = re.search(r"dcrs_session=([^;]+)", cookie)
    return status, (m.group(1) if m else None), as_json(raw)


def dismiss(page):
    for _ in range(3):
        g = page.locator("button:has-text('Got it')")
        if g.count():
            g.first.click()
            page.wait_for_timeout(200)


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def browser_records(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" and "translate" not in m.text.lower() else None)

    # ------------------------------------------------------------------
    # The plant opens DCRS once, so its records are seeded and stored.
    # ------------------------------------------------------------------
    print("\n==== DCRS opened in a browser (the records are stored on the server) ====")
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(400)
    page.fill("#login-email", ADMIN)
    page.fill("#login-password", SEED_PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)
    close_assistant(page)
    errors.clear()  # the sign-in page's /api/auth/me answers 401 before the account signs in; what counts starts here

    # ------------------------------------------------------------------
    # Signing in as the assistant's server does
    # ------------------------------------------------------------------
    print("\n==== Sign-in ====")
    status, token, login = sign_in_api(ADMIN)
    check("DCRS's own sign-in answers 200 with the account", status == 200 and (login or {}).get("user", {}).get("email") == ADMIN, (status, login))
    check("...and the session token is the dcrs_session cookie", bool(token))

    status, _, raw = call("GET", "/api/v1/me", token=token)
    me = as_json(raw) or {}
    check("/api/v1/me with the Bearer token names the person", status == 200 and me.get("email") == ADMIN and me.get("role") == "admin" and me.get("id") == (login or {}).get("user", {}).get("id"), (status, me))
    status, _, raw = call("GET", "/api/v1/me", cookie=token)
    check("...and the same token works as the cookie", status == 200 and (as_json(raw) or {}).get("email") == ADMIN, status)
    status, _, raw = call("GET", "/api/v1/me")
    check("Without a token: 401 not-signed-in", status == 401 and (as_json(raw) or {}).get("code") == "not-signed-in", (status, raw[:200]))
    status, _, raw = call("GET", "/api/v1/me", token="not-a-real-token")
    check("A forged token: 401", status == 401, status)

    # The browser's records reach the server a moment after it opens.
    listing = {}
    for _ in range(60):
        status, _, raw = call("GET", "/api/v1/findings?status=all&limit=200", token=token)
        listing = as_json(raw) or {}
        if status == 200 and listing.get("total", 0) > 0:
            break
        time.sleep(1)

    # ------------------------------------------------------------------
    # The CAPA findings
    # ------------------------------------------------------------------
    print("\n==== CAPA findings ====")
    findings = listing.get("findings", [])
    check("Findings are listed, each with a readable id and a stable ref", len(findings) > 0 and all(re.match(r"^CAPA-\d{4}-\d{2}-\d{2}[a-z]?(-\d+)?-\d+(\.\d+)?$", f["id"]) and f.get("ref") for f in findings), findings[:2])
    check("...with DCRS's own statuses", all(f["status"] in ("Open", "Overdue", "Closed", "Verified") for f in findings), sorted({f["status"] for f in findings}))
    status, _, raw = call("GET", "/api/v1/findings", token=token)
    open_list = (as_json(raw) or {}).get("findings", [])
    check("By default only the open ones (Open or Overdue)", status == 200 and len(open_list) > 0 and all(f["status"] in ("Open", "Overdue") for f in open_list), (status, [f["status"] for f in open_list]))

    target = next((f for f in open_list if f["recordId"] == "gap-2023-12-13"), open_list[0] if open_list else None)
    words = (target or {}).get("finding", "").split()
    needle = max(words, key=len) if words else "rodent"
    status, _, raw = call("GET", f"/api/v1/findings?status=all&q={urllib.request.quote(needle.upper())}", token=token)
    found = (as_json(raw) or {}).get("findings", [])
    check(f"Search finds it whatever the case ('{needle.upper()}')", status == 200 and any(f["id"] == (target or {}).get("id") for f in found), (status, [f["id"] for f in found][:5]))

    status, _, raw = call("GET", f"/api/v1/findings/{urllib.request.quote((target or {}).get('id', 'x').lower())}", token=token)
    one = as_json(raw) or {}
    check("One finding by its readable id (in any case)", status == 200 and one.get("ref") == (target or {}).get("ref"), (status, one))
    status, _, raw = call("GET", f"/api/v1/findings/{urllib.request.quote((target or {}).get('ref', 'x'), safe='')}", token=token)
    check("...and by its stable ref", status == 200 and (as_json(raw) or {}).get("id") == (target or {}).get("id"), status)
    status, _, raw = call("GET", "/api/v1/findings/CAPA-1999-01-01-1", token=token)
    check("An unknown finding: 404 not-found", status == 404 and (as_json(raw) or {}).get("code") == "not-found", status)

    # ------------------------------------------------------------------
    # Closing a finding through the API is DCRS's own Close
    # ------------------------------------------------------------------
    print("\n==== Closing a finding ====")
    note = "Rodent box numbers painted on the walls as per the layout."
    status, _, raw = call("POST", f"/api/v1/findings/{target['id']}/close", token=token, body={"note": "   "})
    check("A close without a note: 400 bad-note", status == 400 and (as_json(raw) or {}).get("code") == "bad-note", status)

    today = datetime.datetime.now(FACTORY).date().isoformat()
    status, _, raw = call("POST", f"/api/v1/findings/{target['id']}/close", token=token, body={"note": note})
    closed = as_json(raw) or {}
    f = closed.get("finding", {})
    check("Closing it answers 200: Closed, with the factory's date of action", status == 200 and f.get("status") == "Closed" and f.get("actionDate") == today, (status, closed))
    check("...and a history entry in the person's name, through the assistant", closed.get("history", {}).get("by") == "Super Admin" and closed.get("history", {}).get("note") == f"Through {CLIENT}: {note}", closed.get("history"))

    status, _, raw = call("POST", f"/api/v1/findings/{target['id']}/close", token=token, body={"note": note})
    check("Closing it again: 409 already-closed", status == 409 and (as_json(raw) or {}).get("code") == "already-closed", (status, raw[:200]))

    # DCRS's activity log names the person AND the assistant.
    status, _, raw = call("GET", "/api/activity?limit=50&q=" + urllib.request.quote(f"Through {CLIENT}"), cookie=token)
    lines = (as_json(raw) or {}).get("lines", [])
    line = next((l for l in lines if l.get("action") == "Record edited" and note in l.get("detail", "")), None)
    check("The activity log: 'Record edited' by the person, 'Through Audit Assistant: ...'", bool(line) and line.get("userName") == "Super Admin" and line.get("detail", "").startswith(f"Through {CLIENT}: {note}"), lines[:3])
    check("...on the CAPA report, in Quality Assurance's department", bool(line) and "CAPA" in line.get("target", "") and line.get("department") == "QA", line)

    # The open browser follows the change on its next pull.
    followed = None
    for _ in range(30):
        rec = next((r for r in browser_records(page) if r.get("id") == target["recordId"]), None)
        fnd = next((x for x in ((rec or {}).get("data") or {}).get("findings", []) if f"{rec['id']}:{x.get('id')}" == target["ref"]), None) if rec else None
        if fnd and fnd.get("status") == "Closed":
            followed = (rec, fnd)
            break
        page.wait_for_timeout(1000)
    check("An open DCRS page takes the change on its next pull", bool(followed), target["ref"])
    if followed:
        rec, fnd = followed
        last = (rec.get("history") or [{}])[-1]
        check("...the finding Closed with today's date of action", fnd.get("actualDateOfAction") == today, fnd)
        check("...and the report's history: an 'edited' entry by the person with the note", last.get("action") == "edited" and last.get("by") == "Super Admin" and last.get("note") == f"Through {CLIENT}: {note}", last)
        labels = [c.get("label", "") for c in last.get("changes") or []]
        check("...listing the two fields a Close changes", any(l.endswith("· Status") for l in labels) and any(l.endswith("· Actual date of action") for l in labels), labels)

    status, _, raw = call("GET", f"/api/v1/findings/{target['id']}", token=token)
    check("Read back through the API: Closed", status == 200 and (as_json(raw) or {}).get("status") == "Closed", status)

    # ------------------------------------------------------------------
    # Departments
    # ------------------------------------------------------------------
    print("\n==== Departments ====")
    status, qc_token, _ = sign_in_api(OTHER_DEPARTMENT)
    check("A Quality Control account signs in", status == 200 and bool(qc_token), status)
    status, _, raw = call("GET", "/api/v1/findings", token=qc_token)
    check("...and is refused the CAPA findings (403 not-your-department)", status == 403 and (as_json(raw) or {}).get("code") == "not-your-department", (status, raw[:200]))
    status, _, raw = call("POST", f"/api/v1/findings/{target['id']}/close", token=qc_token, body={"note": "no"})
    check("...and cannot close one", status == 403, status)
    status, _, raw = call("GET", f"/api/v1/pest-control/daily-report/summary?date={today}", token=qc_token)
    check("...nor read Human Resources' pest control report", status == 403, status)

    # ------------------------------------------------------------------
    # The daily pest control report
    # ------------------------------------------------------------------
    print("\n==== The daily pest control report ====")
    days = sorted({r.get("dueDate") for r in browser_records(page) if r.get("documentId") == "daily-pest-monitoring" and r.get("isDemo") is False and r.get("dueDate")})
    day = today if today in days else (days[-1] if days else None)
    check("A day with a live F/HR/17 record is on file", bool(day), days[-3:])
    if day:
        status, _, raw = call("GET", f"/api/v1/pest-control/daily-report/summary?date={day}", token=token)
        summary = as_json(raw) or {}
        check("The report as data: the day's record, its ten check points", status == 200 and summary.get("date") == day and len(summary.get("checkpoints", [])) >= 10, (status, summary))

        before = len((as_json(call("GET", "/api/activity?limit=200&q=" + urllib.request.quote("Document downloaded as PDF"), cookie=token)[2]) or {}).get("lines", []))
        t0 = time.time()
        status, headers, pdf = call("GET", f"/api/v1/pest-control/daily-report?date={day}", token=token)
        took = time.time() - t0
        ctype = headers.get("Content-Type") or headers.get("content-type") or ""
        disposition = headers.get("Content-Disposition") or headers.get("content-disposition") or ""
        check(f"The report as a PDF: 200 application/pdf in {took:.1f} s", status == 200 and ctype.startswith("application/pdf"), (status, ctype, pdf[:200]))
        check("...a real PDF", pdf[:5] == b"%PDF-" and b"%%EOF" in pdf[-1024:], pdf[:20])
        boxes = re.findall(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]", pdf)
        a4 = [(float(w), float(h)) for w, h in boxes]
        check("...of one A4 page or more", len(a4) >= 1 and all(abs(min(w, h) - 595.3) < 2 and abs(max(w, h) - 841.9) < 2 for w, h in a4), a4[:3])
        check("...named for the form and the day", f"F-HR-17 Daily Pest Control Monitoring Record {day}.pdf" in disposition, disposition)
        # Written as the file goes out (logActivity does not hold the answer back), so looked for for up to five seconds.
        for _ in range(25):
            after_lines = (as_json(call("GET", "/api/activity?limit=200&q=" + urllib.request.quote("Document downloaded as PDF"), cookie=token)[2]) or {}).get("lines", [])
            if len(after_lines) > before:
                break
            time.sleep(0.2)
        check("...and logged: 'Document downloaded as PDF', through the assistant", len(after_lines) == before + 1 and after_lines[0].get("detail", "").startswith(f"Through {CLIENT}"), after_lines[:2])

    status, _, raw = call("GET", "/api/v1/pest-control/daily-report?date=2001-01-01", token=token)
    check("A day with no report: 404 no-report", status == 404 and (as_json(raw) or {}).get("code") == "no-report", status)
    status, _, raw = call("GET", "/api/v1/pest-control/daily-report?date=2026-02-31", token=token)
    check("A date that does not exist: 400 bad-date", status == 400 and (as_json(raw) or {}).get("code") == "bad-date", status)

    # ------------------------------------------------------------------
    # The description, and what is not there
    # ------------------------------------------------------------------
    print("\n==== The API's description ====")
    status, _, raw = call("GET", "/api/v1/openapi.json")
    spec = as_json(raw) or {}
    check("The OpenAPI 3.1 description is served without sign-in", status == 200 and str(spec.get("openapi", "")).startswith("3.1") and "/api/v1/findings/{id}/close" in spec.get("paths", {}), status)
    status, headers, raw = call("GET", "/api/v1/no-such-thing", token=token)
    check("An unknown route answers JSON 404, not the app's page", status == 404 and (as_json(raw) or {}).get("code") == "no-such-route", (status, raw[:120]))

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

print(f"\n{len(FAILURES)} failure(s)")
for f in FAILURES:
    print(" -", f)
sys.exit(1 if FAILURES else 0)
