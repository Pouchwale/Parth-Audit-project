"""What Mitra does, from the Mitra mobile app, through the DCRS API (REQUIREMENTS s85).

The Mitra mobile app (the Audit Assistant's app, renamed by its owner on
30-Sep-2026) signs a person in with their DCRS account and does on the phone
what Mitra does in DCRS. Its server calls DCRS's /api/v1 routes AS THAT PERSON,
with "X-Client-Name: Mitra mobile app", and every answer and every change comes
from DCRS's own engine run on the server (backend/engineHost.ts). This suite
plays the app's server, with the plant's seeded accounts:

  * today's facts (GET /api/v1/today) and the documents (GET /api/v1/documents);
  * the Quality Control account starts today's record of a QC log sheet
    (POST /api/v1/records), reads its layout (GET /api/v1/records/{id}), fills
    every required box with ONE patch (POST .../changes, Mitra's patch shape)
    and submits it (POST .../actions submit); a change to the submitted record
    is refused until it is reopened (409 needs-reopen);
  * the super admin verifies it (POST .../actions verify);
  * the record's history names each person and says "Through Mitra mobile app"
    on every entry the app made, and DCRS's activity log has the browser's own
    words for each change ("Record edited through Mitra", "Record submitted for
    verification", "Record verified") with the detail "Through Mitra mobile
    app: ..."; DCRS's own record page shows the same history;
  * a record found by what was written on it (GET /api/v1/records/search);
  * the record's page as a real PDF (GET /api/v1/records/{id}/pdf);
  * history's figures (GET /api/v1/figures);
  * department refusals: Human Resources may not read the QC record, Quality
    Control may not open F/HR/17, and HR Master Data (GET /api/v1/people) is
    refused to Quality Control and answered for Human Resources.

Against the product server on :8843 (DCRS_BASE overrides it), with the plant's
seeded accounts (SEED_ACCOUNTS=1, SEED_ACCOUNT_PASSWORD).
"""
import datetime
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD", "SeedQA@2026")
ADMIN = os.environ.get("DCRS_ADMIN_EMAIL", "admin@gpp.local")
QC = os.environ.get("DCRS_QC_EMAIL", "kapila.barad@gpp.local")  # kept to Quality Control
HR = os.environ.get("DCRS_HR_EMAIL", "vinay.bhojak@gpp.local")  # kept to Human Resources
CLIENT = "Mitra mobile app"
THROUGH = f"Through {CLIENT}"
FAILURES = []


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:900])


def call(method, path, token=None, body=None, cookie=None):
    """One HTTP call as the app's server makes it. Returns (status, headers, body bytes)."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    h = {"X-Client-Name": CLIENT}
    if data is not None:
        h["Content-Type"] = "application/json"
    if token:
        h["Authorization"] = f"Bearer {token}"
    if cookie:
        h["Cookie"] = f"dcrs_session={cookie}"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return res.status, dict(res.headers), res.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def as_json(raw):
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def api(method, path, token, body=None):
    status, _, raw = call(method, path, token=token, body=body)
    return status, as_json(raw)


def sign_in(email):
    status, headers, raw = call("POST", "/api/auth/login", body={"email": email, "password": SEED_PASSWORD})
    cookie = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
    m = re.search(r"dcrs_session=([^;]+)", cookie)
    return status, (m.group(1) if m else None)


def q(value):
    return urllib.parse.quote(str(value), safe="")


def value_for(field, today, word):
    """A value a person could write in this box, by its type (the layout GET /records/{id} gives)."""
    kind = field.get("type")
    options = field.get("options") or []
    if kind == "select" and options:
        accepted = [o for o in options if o.strip().lower() == "accepted"]
        return accepted[0] if accepted else options[0]
    if kind == "number":
        lo, hi = field.get("min"), field.get("max")
        if isinstance(lo, (int, float)) and isinstance(hi, (int, float)):
            return round((lo + hi) / 2, 2)
        return 1
    if kind == "yesno":
        return "Yes"
    if kind == "date":
        return today
    if kind == "time":
        return "10:00"
    return word


def patch_for(record, today, word):
    """ONE patch, in Mitra's shape, that fills every required box and cell still blank, and writes `word` on the sheet."""
    layout = record.get("layout") or {}
    data = record.get("data") or {}
    header = data.get("header") or {}
    patch = {}
    head = {}
    for f in (layout.get("header") or []) + (layout.get("footer") or []):
        if f.get("computed"):
            continue
        blank = str(header.get(f["key"], "") or "").strip() == ""
        if f.get("required") and blank:
            head[f["key"]] = value_for(f, today, word)
    rows = []
    wrote_word = False
    for row in data.get("rows") or []:
        edit = {"id": row["id"]}
        for c in layout.get("columns") or []:
            if c.get("printed") or c.get("computed") or c.get("readFrom"):
                continue
            blank = row.get(c["key"]) in (None, "")
            if c.get("type") == "text" and not wrote_word:
                edit[c["key"]] = word
                wrote_word = True
            elif c.get("required") and blank:
                edit[c["key"]] = value_for(c, today, word)
        rows.append(edit)
    if head:
        patch["header"] = head
    if rows:
        patch["rows"] = rows
    if not wrote_word:
        texts = [f for f in (layout.get("header") or []) + (layout.get("footer") or []) if f.get("type") in ("text", "paragraph") and not f.get("computed")]
        if texts:
            patch.setdefault("header", {})[texts[0]["key"]] = word
    return patch


with sync_playwright() as p:
    # ------------------------------------------------------------------
    # signing in, as the app's server does
    s_qc, qc = sign_in(QC)
    s_hr, hr = sign_in(HR)
    s_ad, admin = sign_in(ADMIN)
    check("the QC, HR and super admin accounts sign in with DCRS's own sign-in", s_qc == 200 and s_hr == 200 and s_ad == 200 and qc and hr and admin, (s_qc, s_hr, s_ad))
    if not (qc and hr and admin):
        print("Cannot go on without the three sessions.")
        sys.exit(1)

    # ------------------------------------------------------------------
    # today's facts
    status, today_facts = api("GET", "/api/v1/today", qc)
    check("GET /api/v1/today answers the day, the next holidays and what is due", status == 200 and today_facts and today_facts.get("day") and isinstance(today_facts.get("due"), list) and isinstance(today_facts.get("nextHolidays"), list), (status, today_facts))
    today = (today_facts or {}).get("date") or datetime.date.today().isoformat()
    check("today's facts carry the plant's hours and Mitra's facts in words", bool((today_facts or {}).get("workingHours")) and "Today:" in str((today_facts or {}).get("facts", "")), today_facts)

    # ------------------------------------------------------------------
    # the documents
    status, found = api("GET", "/api/v1/documents?q=" + q("F/HR/17"), qc)
    check("GET /api/v1/documents: F/HR/17 is found, kept by Human Resources, for the QC account", status == 200 and any(k.get("id") == "daily-pest-monitoring" and "Human Resources" in k.get("note", "") for k in (found or {}).get("kept", [])), found)
    status, mine = api("GET", "/api/v1/documents?limit=200", qc)
    docs = (mine or {}).get("documents", [])
    check("GET /api/v1/documents without q: the QC account's own documents", status == 200 and len(docs) > 3 and all((d.get("department") or {}).get("code") in (None, "QC") for d in docs), [d.get("id") for d in docs][:20])
    daily_sheets = [d for d in docs if d.get("kind") == "log-sheet" and (d.get("schedule") or {}).get("frequency") == "Daily" and not d.get("referenceOnly")]
    check("the QC account has daily log sheets", len(daily_sheets) > 0, docs[:5])

    # A QC daily log sheet whose record for today is not yet signed off (another suite may have used one).
    chosen = None
    for d in daily_sheets:
        s, listed = api("GET", f"/api/v1/records?documentId={q(d['id'])}&from={today}&to={today}", qc)
        rows = (listed or {}).get("records", [])
        if s == 200 and not any(r.get("started") and r.get("status") not in ("Scheduled", "Due", "In Progress") for r in rows):
            chosen = d
            break
    date = today
    if chosen is None and daily_sheets:
        chosen = daily_sheets[0]
        date = f"2031-0{random.randint(1, 9)}-1{random.randint(0, 9)}"
        print(f"    (every QC daily sheet of today is signed off already: using {date})")
    doc_id = chosen["id"] if chosen else ""
    print(f"    the sheet: {chosen and chosen.get('formatNo')} {chosen and chosen.get('name')} ({doc_id}) for {date}")

    status, doc = api("GET", f"/api/v1/documents/{q(doc_id)}", qc)
    check("GET /api/v1/documents/{id}: what it is, who fills it, when and how, its fields", status == 200 and doc and doc.get("layout") and doc.get("when") and doc.get("how") and doc.get("who"), doc)

    # ------------------------------------------------------------------
    # the QC account starts today's record, fills it with one patch, submits it
    status, opened = api("POST", "/api/v1/records", qc, {"documentId": doc_id, "date": date})
    record = (opened or {}).get("record") or {}
    record_id = record.get("recordId")
    check("POST /api/v1/records starts (or opens) the day's record, editable", status in (200, 201) and record_id and record.get("editable") is True, (status, str(opened)[:600]))
    status, record = api("GET", f"/api/v1/records/{q(record_id)}", qc)
    check("GET /api/v1/records/{id}: its layout, its data in words and as stored, its history", status == 200 and record.get("layout") and isinstance(record.get("inWords"), list) and isinstance(record.get("data"), dict), (status, str(record)[:600]))

    word = f"MitraPhone{random.randint(10000, 99999)}"
    patch = patch_for(record or {}, date, word)
    status, changed = api("POST", f"/api/v1/records/{q(record_id)}/changes", qc, {"patch": patch, "note": "Readings given on the phone"})
    check("POST .../changes: the patch is applied by DCRS's engine and what changed is answered", status == 200 and len((changed or {}).get("changes", [])) > 0, (status, str(changed)[:900]))
    entry = ((changed or {}).get("history") or [{}])[-1]
    check("the change is in the record's history in the person's name, 'Through Mitra mobile app: <note>'", entry.get("note") == f"{THROUGH}: Readings given on the phone" and entry.get("action") == "assistant-edit", entry)

    status, submitted = api("POST", f"/api/v1/records/{q(record_id)}/actions", qc, {"action": "submit"})
    check("POST .../actions submit: DCRS's validation passes and the record waits for verification", status == 200 and (submitted or {}).get("status") == "Pending Verification", (status, submitted))
    status, locked = api("POST", f"/api/v1/records/{q(record_id)}/changes", qc, {"patch": patch})
    check("a change to the submitted record is refused until it is reopened (409 needs-reopen)", status == 409 and (locked or {}).get("code") == "needs-reopen", (status, locked))

    # ------------------------------------------------------------------
    # the super admin verifies it
    status, verified = api("POST", f"/api/v1/records/{q(record_id)}/actions", admin, {"action": "verify"})
    check("POST .../actions verify: the super admin verifies it", status == 200 and (verified or {}).get("status") == "Verified", (status, verified))

    status, final = api("GET", f"/api/v1/records/{q(record_id)}", admin)
    history = (final or {}).get("history", [])
    by_action = {h.get("action"): h for h in history}
    check("the history: the edit and the submit by the QC person, the verification by the super admin", (by_action.get("assistant-edit") or {}).get("by") == "Kapila Barad" and (by_action.get("submitted") or {}).get("by") == "Kapila Barad" and (by_action.get("verified") or {}).get("by") not in (None, "Kapila Barad"), history)
    check("every entry the app made says 'Through Mitra mobile app'", all(str((by_action.get(a) or {}).get("note", "")).startswith(THROUGH) for a in ("assistant-edit", "submitted", "verified")), history)

    # The activity log, as the super admin reads it.
    status, _, raw = call("GET", "/api/activity?limit=200&q=" + q(THROUGH), cookie=admin)
    lines = (as_json(raw) or {}).get("lines", [])
    def line_of(action, who):
        return [l for l in lines if l.get("action") == action and str(l.get("detail", "")).startswith(THROUGH) and (who is None or l.get("userEmail") == who)]
    check("activity log: 'Record edited through Mitra' by the QC person, through the app", status == 200 and len(line_of("Record edited through Mitra", QC)) > 0, lines[:6])
    check("activity log: 'Record submitted for verification' by the QC person, through the app", len(line_of("Record submitted for verification", QC)) > 0, lines[:6])
    check("activity log: 'Record verified' by the super admin, through the app", len(line_of("Record verified", ADMIN)) > 0, lines[:6])
    check("activity log: the lines are filed under Quality Control", all(l.get("department") == "QC" for l in line_of("Record verified", ADMIN)), line_of("Record verified", ADMIN)[:2])

    # ------------------------------------------------------------------
    # refusals by department
    status, other = api("GET", f"/api/v1/records/{q(record_id)}", hr)
    check("Human Resources may not read the QC record (403 not-your-department)", status == 403 and (other or {}).get("code") == "not-your-department", (status, other))
    status, other = api("GET", "/api/v1/documents/daily-pest-monitoring", qc)
    check("Quality Control may not open F/HR/17 (403, kept by Human Resources)", status == 403 and "Human Resources" in (other or {}).get("error", ""), (status, other))
    status, people = api("GET", "/api/v1/people?q=" + q("a"), qc)
    check("HR Master Data is refused to Quality Control", status == 403 and (people or {}).get("code") == "not-your-department", (status, people))
    status, people = api("GET", "/api/v1/people?q=" + q("a"), hr)
    check("HR Master Data answers Human Resources", status == 200 and isinstance((people or {}).get("people"), list), (status, people))

    # ------------------------------------------------------------------
    # search, figures, the PDF
    status, hits = api("GET", "/api/v1/records/search?q=" + q(word), qc)
    check("GET /api/v1/records/search finds the record by the word written on it", status == 200 and any(h.get("recordId") == record_id for h in (hits or {}).get("hits", [])), (status, str(hits)[:600]))
    status, listed = api("GET", f"/api/v1/records?documentId={q(doc_id)}&from={date}&to={date}", qc)
    check("GET /api/v1/records lists it as Verified", status == 200 and any(r.get("recordId") == record_id and r.get("status") == "Verified" for r in (listed or {}).get("records", [])), (status, listed))
    status, figures = api("GET", "/api/v1/figures?question=" + q("which machine broke down most this year?"), admin)
    check("GET /api/v1/figures: evidence lines for a question about history", status == 200 and isinstance((figures or {}).get("evidence"), list) and (figures or {}).get("period"), (status, figures))

    status, headers, pdf = call("GET", f"/api/v1/records/{q(record_id)}/pdf", token=qc)
    ctype = headers.get("Content-Type") or headers.get("content-type") or ""
    check("GET /api/v1/records/{id}/pdf: the record's own page as a PDF", status == 200 and ctype.startswith("application/pdf") and pdf[:5] == b"%PDF-" and len(pdf) > 5000, (status, ctype, len(pdf), pdf[:200]))
    # The activity line is written as the file goes out (backend/index.ts logActivity does not hold the answer
    # back for it), so it can land a moment after the PDF: looked for for up to five seconds.
    logged, raw = False, b""
    for _ in range(25):
        status, _, raw = call("GET", "/api/activity?limit=50&q=" + q("Document downloaded as PDF"), cookie=admin)
        logged = any(l.get("action") == "Document downloaded as PDF" and str(l.get("detail", "")).startswith(THROUGH) for l in (as_json(raw) or {}).get("lines", []))
        if logged:
            break
        time.sleep(0.2)
    check("the download is logged, through the app", logged, raw[:400])

    # ------------------------------------------------------------------
    # DCRS's own record page shows the same history
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1400, "height": 900})
    context.add_cookies([{"name": "dcrs_session", "value": admin, "url": BASE + "/"}])
    page = context.new_page()
    page.route("**/translate_a/**", lambda route: route.abort())
    page.goto(f"{BASE}/index.html#/record/{record_id}")
    try:
        page.wait_for_selector(f"[data-bind-record='{record_id}']", timeout=45000)
        # The history is a closed <details>: its notes are read as text, not as what is drawn.
        page.wait_for_function(
            "(t) => [...document.querySelectorAll(\"[data-section='record-history'] .history-note\")].some((n) => (n.textContent || '').startsWith(t))",
            arg=THROUGH,
            timeout=20000,
        )
        shown = True
    except Exception as e:  # noqa: BLE001
        shown = False
        print("    ", e)
    check("DCRS's record page shows the history 'Through Mitra mobile app'", shown, page.url)
    browser.close()

    # ------------------------------------------------------------------
    # the description and the fallthrough
    status, _, raw = call("GET", "/api/v1/openapi.json")
    paths = (as_json(raw) or {}).get("paths", {})
    check("the OpenAPI description lists every new route", status == 200 and all(k in paths for k in ["/api/v1/documents", "/api/v1/documents/{id}", "/api/v1/today", "/api/v1/records", "/api/v1/records/search", "/api/v1/records/{id}", "/api/v1/records/{id}/pdf", "/api/v1/figures", "/api/v1/people", "/api/v1/records/{id}/changes", "/api/v1/records/{id}/actions", "/api/v1/records/{id}/photos", "/api/v1/records/{id}/sample-fill"]), list(paths))

print()
print(f"{'ALL PASSED' if not FAILURES else f'{len(FAILURES)} FAILED'}")
for f in FAILURES:
    print(" -", f)
sys.exit(1 if FAILURES else 0)
