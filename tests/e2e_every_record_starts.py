"""Every record starts, and stays (REQUIREMENTS s93).

The owner, 07-Oct-2026: "when i click on start record in many document ... no
record found go back this message is coming" - he wants every record a person
starts to start and stay, on every document of every module. Against the
product as a plant installs it, on a system live since the first of last month
(as the owner's has been for weeks):

  * THE SUPER ADMIN starts a record of every document that holds records, from
    the document's OWN page (the library's Open Document, then the page's own
    Start): the record page opens on a record that exists (never "Record not
    found", never a refusal), the form is drawn, and the record reaches the
    database; the library's New then opens the SAME sheet on a scheduled
    document - the day's, or the week's, fortnight's, month's or year's (H-7 of
    the audit of 07-Oct-2026: never a second sheet for a period that has one) -
    and a NEW one on an as-required document; after signing out and in, every
    record started is still in the database and opens;
  * EACH DEPARTMENT'S OWN ACCOUNT starts every one of its documents from its own
    page - Marketing its Complaint Acknowledgement (QA-CAF-00), Purchase the
    service provider agreement, Human Resources the pest service reports and
    F/HR/18 - and every document is started by the department that owns it;
  * a document's page shows the record just started, not the blank sheet made
    ahead for the 31st;
  * WITH THE BROWSER'S STORAGE FULL, Start still opens the record (held in the
    page's memory), the page says this browser's copy is full and then that the
    record WAS saved, and the record is in the database;
  * every record started by hand is in the activity log as "Record started" -
    the pages that build their own record (the CAPA registers, the complaint
    and its acknowledgement, the training record, the service agreement) wrote
    nothing before s93.

Against the PRODUCT server on :8843 (DCRS_BASE overrides it), with the plant's
seeded accounts on SEED_ACCOUNT_PASSWORD SeedQA@2026; the super admin adds the
departments' accounts the server does not seed. E2E_ONLY=id1,id2 runs some
documents only. Network-independent.
"""
import calendar
import json
import os
import re
import sys
import time
from datetime import date, timedelta

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8843").rstrip("/")
SEED_PASSWORD = os.environ.get("DCRS_SEED_PASSWORD", "SeedQA@2026")
ADMIN = os.environ.get("DCRS_ADMIN_EMAIL", "admin@gpp.local")
FIRST_PASSWORD = "StartFirst@2026"
OWN_PASSWORD = "StartOwn@2026"
ONLY = [x for x in os.environ.get("E2E_ONLY", "").split(",") if x]
FAILURES = []

# Each department's account. Quality Control's is the server's seeded Kapila Barad, who edits every QC document by the
# owner's table (REQUIREMENTS §96); the super admin adds the others (POST /api/users, a first password each changes at
# once), accounts the access rules never name, so each has its department at Edit as before. Human Resources' is one
# of those since 9-Oct-2026: Vinay Bhojak answers for F/HR/01-14 and 19-22 only (F/HR/15-18 and the pest control
# documents are Kapila Barad's), so he can no longer start every HR document. Their names carry no word a button of
# this suite is pressed by.
DEPARTMENTS = {
    "QC": ("kapila.barad@gpp.local", None),
    "HR": ("isha.rao.starts@gpp.local", "Isha Rao"),
    "STR": ("asha.patel.starts@gpp.local", "Asha Patel"),
    "MNT": ("bhavin.shah.starts@gpp.local", "Bhavin Shah"),
    "PRD": ("chirag.mehta.starts@gpp.local", "Chirag Mehta"),
    "DISP": ("dipak.rana.starts@gpp.local", "Dipak Rana"),
    "PUR": ("ela.desai.starts@gpp.local", "Ela Desai"),
    "MKT": ("farah.khan.starts@gpp.local", "Farah Khan"),
    "SYS": ("gopal.iyer.starts@gpp.local", "Gopal Iyer"),
    "QA": ("hema.joshi.starts@gpp.local", "Hema Joshi"),
}

# What starts a record on the page a document's Open Document lands on, by kind, in the order tried. A log sheet
# with nothing on file shows "Start this record" under its blank form; with something on file, "New record".
START = {
    "log-sheet": ["[data-action='start-from-blank']", "[data-action='document-new-record']"],
    "service-report": ["[data-action='document-new-record']"],
    "fly-catcher": ["[data-action='document-new-record']"],
    "daily-pest-monitoring": ["button:has-text(\"Open today's record\")"],
    "gap-inspection": ["button:has-text('New Internal CAPA Record')"],
    "complaint-checklist": ["xpath=//button[normalize-space(.)='New Complaint']"],
    "complaint-ack": ["[data-action='new-complaint-ack']"],
    "training-record": ["button:has-text('New Training Record')"],
    "pest-responsibilities": ["[data-action='open-responsibilities']"],
    "service-agreement": ["[data-action='generate-agreement-card']", "[data-action='open-agreement']"],
}
# The internal findings report's Open Document is CAPA's chooser; its own register is the Internal card's page.
HOP = {"gap-inspection": ".capa-option:not(.external)"}
RECORD_ROUTE = re.compile(r"#/(record|training|gap/complaint|gap)/([^/?#]+)$")


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}", flush=True)
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:900], flush=True)
    return cond


# ---------------------------------------------------------------------------
# the schedule's periods, as engine/frequencyEngine.ts schedulePeriodOf works them out (REQUIREMENTS s93)


def period_of(schedule, day, doc_id):
    """The stretch of its schedule a day falls in: Monday to Sunday, half a month split at the second visit, the
    month, the quarter, the year. A daily or as-required document, and the training record (one per training
    held), have only the day."""
    t = (schedule or {}).get("type")
    if doc_id == "training-record" or t not in ("weekly", "fortnightly", "monthly", "quarterly", "yearly"):
        return day, day
    if t == "weekly":
        start = day - timedelta(days=day.weekday())
        return start, start + timedelta(days=6)
    dim = calendar.monthrange(day.year, day.month)[1]
    if t == "fortnightly":
        second = schedule["anchorDayOfMonth"] + 14
        if second <= dim and day.day >= second:
            return day.replace(day=second), day.replace(day=dim)
        return day.replace(day=1), day.replace(day=second - 1 if second <= dim else dim)
    if t == "monthly":
        return day.replace(day=1), day.replace(day=dim)
    if t == "quarterly":
        sm, sy = day.month - 1 - (day.month - 1 - schedule["anchorMonth"]) % 3, day.year
        if sm < 0:
            sm, sy = sm + 12, sy - 1
        em, ey = sm + 2, sy
        if em > 11:
            em, ey = em - 12, ey + 1
        return date(sy, sm + 1, 1), date(ey, em + 1, calendar.monthrange(ey, em + 1)[1])
    return date(day.year, 1, 1), date(day.year, 12, 31)


def filed_for(rec):
    """The date a record was filed for: its period key's date (the schedule's own), else its due date."""
    m = re.match(r"^(?:[^:]*:)?(\d{4}-\d{2}-\d{2})", str(rec.get("periodKey", "")))
    try:
        return date.fromisoformat(m.group(1) if m else str(rec.get("dueDate", "")))
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# the browser


def settle_briefing(page):
    page.evaluate(
        """() => {
             const KEY = 'dcrs:v1:settings';
             const now = new Date();
             const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
             try {
               const s = JSON.parse(localStorage.getItem(KEY) || '{}');
               s.briefingShown = { date: today, slots: ['first', 'morning', 'evening'] };
               localStorage.setItem(KEY, JSON.stringify(s));
             } catch (e) { /* a full browser: the briefing may show, and is closed below */ }
           }"""
    )


def tidy(page):
    """What a person closes as soon as it appears: the briefing, the agreement's reminder, Mitra's panel."""
    for _ in range(2):
        got = page.locator("button:has-text('Got it')")
        if got.count():
            got.first.evaluate("el => el.click()")
            page.wait_for_timeout(150)
    later = page.locator("[data-action='agreement-later']")
    if later.count():
        later.first.evaluate("el => el.click()")
        page.wait_for_timeout(150)
    close = page.locator("button[aria-label='Close assistant']")
    if close.count():
        close.first.evaluate("el => el.click()")
        page.wait_for_timeout(120)


def intro_gone(page):
    try:
        page.wait_for_function("() => !document.querySelector(\"[data-section='intro-splash']\")", timeout=15000)
    except Exception:
        pass


def sign_in(page, email, password):
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    intro_gone(page)
    page.wait_for_timeout(300)
    page.fill("#login-email", email)
    page.fill("#login-password", password)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=90000)
    intro_gone(page)
    page.wait_for_timeout(1500)
    settle_briefing(page)
    tidy(page)


def sign_out(page):
    btn = page.locator(".app-topbar button[title='Log Out']")
    if btn.count():
        btn.first.evaluate("el => el.click()")
        page.wait_for_timeout(600)
        ok = page.locator("[data-action='logout-review-confirm']")
        if ok.count():
            ok.first.evaluate("el => el.click()")
        page.wait_for_selector("#login-email", timeout=30000)
        page.wait_for_timeout(300)


def go(page, route, settle=900):
    if page.evaluate("() => location.hash") == route:
        page.evaluate("() => { location.hash = '#/'; }")
        page.wait_for_timeout(200)
    page.evaluate("h => { location.hash = h; }", route)
    page.wait_for_timeout(settle)
    tidy(page)


def record_id(page):
    m = RECORD_ROUTE.search(page.url)
    if not m or (m.group(1) == "gap" and m.group(2) in ("internal", "external", "complaint")):
        return None
    return m.group(2)


def wait_for(fn, timeout=10.0, every=0.15):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        last = fn()
        if last:
            return last
        time.sleep(every)
    return last


def press(page, selector):
    """A real click, as a person makes it; when something lies over the button, said, and pressed directly."""
    loc = page.locator(selector).first
    try:
        loc.click(timeout=5000)
        return None
    except Exception as e:  # noqa: BLE001 - reported, then pressed directly
        blocked = next((l.strip() for l in str(e).split("\n") if "intercepts pointer events" in l), str(e).split("\n")[0])
        loc.evaluate("el => el.click()")
        return f"a real click did not land ({blocked[:200]})"


SCREEN = """(rid) => {
  const content = document.querySelector('.app-content') || document.body;
  const empties = Array.from(content.querySelectorAll('.empty-state')).map((e) => e.innerText.trim().slice(0, 160));
  return {
    form: !!(rid && content.querySelector('[data-bind-record="' + rid + '"]')),
    refused: !!content.querySelector("[data-state='not-your-department']"),
    notFound: empties.some((t) => /record not found/i.test(t)),
    empties,
  };
}"""

STORED = """async ([rid, docId]) => {
  const res = await fetch('/api/storage', { credentials: 'same-origin' });
  if (!res.ok) return { status: res.status, found: false, ofDoc: [] };
  const body = await res.json();
  const item = (body.items || []).find((i) => i.key === 'records');
  const lines = item ? JSON.parse(item.value) : [];
  return {
    status: res.status,
    found: !!rid && lines.some((l) => l && l.id === rid),
    ofDoc: docId ? lines.filter((l) => l && l.documentId === docId && !l.isDemo).map((l) => ({ id: l.id, dueDate: l.dueDate, periodKey: l.periodKey, status: l.status })) : [],
  };
}"""

SERVER_IDS = """async () => {
  const res = await fetch('/api/storage', { credentials: 'same-origin' });
  const body = res.ok ? await res.json() : { items: [] };
  const item = (body.items || []).find((i) => i.key === 'records');
  return item ? JSON.parse(item.value).map((l) => l.id) : [];
}"""


def stored(page, rid, doc_id, timeout=20.0):
    """Waits for the record to be in the database, read back through the app's own API as this person."""
    last = {}
    end = time.time() + timeout
    while time.time() < end:
        last = page.evaluate(STORED, [rid, doc_id])
        if last.get("found"):
            return last
        page.wait_for_timeout(700)
    return last


ROW_COUNT = "() => document.querySelectorAll('tr[data-library-document]').length"


def library(page):
    go(page, "#/library", settle=1200)
    page.wait_for_selector("tr[data-library-document]", timeout=60000)
    # Read once the list has stopped growing.
    last = -1
    for _ in range(20):
        now = page.evaluate(ROW_COUNT)
        if now == last:
            break
        last = now
        page.wait_for_timeout(300)
    rows = last
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('tr[data-library-document]')).map((tr) => ({ id: tr.dataset.libraryDocument, hasNew: !!tr.querySelector("[data-action='new-record']") }))"""
    ), rows


def definitions(page):
    return page.evaluate(
        "() => Object.fromEntries(JSON.parse(localStorage.getItem('dcrs:v1:documents') || '[]').map((d) => [d.id, { kind: d.kind, schedule: d.schedule, formatNo: d.formatNo, name: d.name }]))"
    )


def open_document(page, doc_id):
    """The library's Open Document for this document: the page a person reaches it by."""
    go(page, "#/library", settle=700)
    row = page.locator(f"tr[data-library-document='{doc_id}']")
    wait_for(lambda: row.count() or None, timeout=10)
    if not row.count():
        return None
    row.locator("[data-action='open-document']").first.evaluate("el => el.click()")
    page.wait_for_timeout(1100)
    tidy(page)
    return page.evaluate("() => location.hash")


def start_on_own_page(page, doc_id, kind):
    """Opens the document's own page and presses its Start. Returns (record id, problems, the page it started on)."""
    problems = []
    landed = open_document(page, doc_id)
    if landed is None:
        return None, ["not in this account's Document Library"], None
    if page.locator("[data-state='not-your-department']").count():
        return None, [f"Open Document lands on a refusal ({landed}): {page.locator('.app-content').inner_text()[:160]}"], landed
    hop = HOP.get(kind)
    if hop and page.locator(hop).count():
        page.locator(hop).first.evaluate("el => el.click()")
        page.wait_for_timeout(900)
        tidy(page)
    chosen = next((s for s in START.get(kind, START["log-sheet"]) if page.locator(s).count()), None)
    if not chosen:
        return None, [f"no Start on its own page ({page.evaluate('() => location.hash')})"], landed
    before = page.url
    blocked = press(page, chosen)
    if blocked:
        problems.append(blocked)
    rid = wait_for(lambda: record_id(page) if page.url != before else None, timeout=10)
    if not rid:
        return None, problems + [f"no record page opened: the address is {page.url}"], landed
    return rid, problems, landed


def shown_ok(page, rid):
    """The record page shows the record: its form drawn, no 'Record not found', no refusal."""
    s = wait_for(lambda: (lambda x: x if (x["form"] or x["notFound"] or x["refused"]) else None)(page.evaluate(SCREEN, rid)), timeout=10) or page.evaluate(SCREEN, rid)
    problems = []
    if s["notFound"]:
        problems.append("the page says 'Record not found'")
    if s["refused"]:
        problems.append("the record page refuses it")
    if not s["form"]:
        problems.append(f"no form drawn for it ({'; '.join(s['empties'])[:160]})")
    return problems


def start_every_document(page, docs, defs, label, again=False):
    """Starts each document on its own page (and, with `again`, through the library's New). Returns {doc: [ids]}."""
    started = {}
    today = date.today()
    for n, doc_id in enumerate(docs, 1):
        d = defs.get(doc_id, {})
        kind = d.get("kind", "log-sheet")
        as_required = (d.get("schedule") or {}).get("type") == "as-required"
        t0 = time.time()
        rid, problems, landed = start_on_own_page(page, doc_id, kind)
        if rid:
            close = page.locator("button[aria-label='Close assistant']")
            if close.count():
                close.first.evaluate("el => el.click()")
            problems += shown_ok(page, rid)
            st = stored(page, rid, doc_id)
            if not st.get("found"):
                problems.append(f"NOT STORED in the database (API {st.get('status')})")
            started.setdefault(doc_id, []).append(rid)
            if again:
                # The library's New: the same sheet on a scheduled document, a new one on an as-required one.
                go(page, "#/library", settle=600)
                row = page.locator(f"tr[data-library-document='{doc_id}'] [data-action='new-record']")
                if row.count():
                    before = page.url
                    row.first.evaluate("el => el.click()")
                    rid2 = wait_for(lambda: record_id(page) if page.url != before else None, timeout=10)
                    if not rid2:
                        problems.append(f"the library's New opened no record ({page.url})")
                    else:
                        problems += [f"[library New] {p}" for p in shown_ok(page, rid2)]
                        if as_required and kind != "pest-responsibilities" and rid2 == rid:
                            problems.append("the library's New on an as-required document reopened the record instead of starting another")
                        if not as_required and rid2 != rid:
                            problems.append(f"the library's New started a SECOND record ({rid2}) beside the one Start opened ({rid})")
                        st2 = stored(page, rid2, doc_id)
                        if not st2.get("found"):
                            problems.append(f"the library's New record is NOT STORED ({st2.get('status')})")
                        else:
                            st = st2
                        if rid2 != rid:
                            started[doc_id].append(rid2)
                if not as_required:
                    frm, to = period_of(d.get("schedule"), today, doc_id)
                    mine = [r for r in st.get("ofDoc", []) if (lambda f: f is not None and frm <= f <= to)(filed_for(r))]
                    if len(mine) != 1 or mine[0]["id"] != rid:
                        problems.append(f"{len(mine)} sheet(s) on file for {frm}..{to}, where one - the one Start opened - is the rule: {[(r['id'], r['periodKey'], r['status']) for r in mine][:4]}")
        check(f"[{label}] {d.get('formatNo', '')} {doc_id}: starts on its own page and is stored", rid is not None and not problems, (landed, rid, problems))
        print(f"    {n}/{len(docs)} {doc_id} in {time.time() - t0:.1f}s", flush=True)
    return started


def stays(page, started, label):
    """After signing out and in: every record started is in the database and opens."""
    ids = page.evaluate(SERVER_IDS)
    have = set(ids)
    missing = [(d, r) for d, rs in started.items() for r in rs if r not in have]
    check(f"[{label}] after signing out and in, every record started is still in the database ({sum(len(v) for v in started.values())})", not missing, missing[:10])
    bad = []
    for doc_id, rids in started.items():
        for rid in rids[:1]:
            kind = DEFS.get(doc_id, {}).get("kind")
            route = f"#/training/{rid}" if kind == "training-record" else f"#/gap/complaint/{rid}" if kind == "complaint-checklist" else f"#/gap/{rid}" if kind == "gap-inspection" else f"#/record/{rid}"
            go(page, route, settle=500)
            p = shown_ok(page, rid)
            if p:
                bad.append((doc_id, rid, p))
    check(f"[{label}] ...and each opens on its page", not bad, bad[:6])


# The activity log's "Record started" lines, newest first, as the super admin reads them (GET /api/activity).
STARTED_LINES = """async () => {
  const res = await fetch('/api/activity?q=' + encodeURIComponent('Record started') + '&limit=500', { credentials: 'same-origin' });
  if (!res.ok) return null;
  return (await res.json()).lines.filter((l) => l.action === 'Record started').map((l) => l.target || '');
}"""


def activity_label(doc_id):
    """How engine/recordHistory.ts recordLabel names a document's record in the log, up to its date."""
    d = DEFS.get(doc_id, {})
    number = d.get("formatNo") or ""
    return (f"{number} " if number and not number.startswith("TO BE") else "") + (d.get("name") or doc_id) + " — "


FILL = """() => {
  // A stand-in item outside the app's own names fills what is left, leaving less room than one record needs.
  let lo = 0, hi = 12000000;
  while (hi - lo > 200) {
    const mid = Math.floor((lo + hi) / 2);
    try { localStorage.setItem('zz-e2e-filler', 'x'.repeat(mid)); lo = mid; } catch (e) { hi = mid; }
  }
  try { localStorage.setItem('zz-e2e-filler', 'x'.repeat(lo)); } catch (e) { /* as full as it goes */ }
  return lo;
}"""


DEFS = {}

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    def new_page():
        ctx = browser.new_context(viewport={"width": 1366, "height": 800})
        page = ctx.new_page()
        page.route("**/translate_a/**", lambda route: route.abort())
        page.on("pageerror", lambda e: errors.append(str(e)))
        # A page left while a change is still on its way asks first (s93); a stuck dialog must not hang the suite.
        page.on("dialog", lambda d: d.accept())
        return ctx, page

    # ==================================================================
    # 0. An established system, and the departments' accounts
    # ==================================================================
    print("\n==== Setting up: live since the first of last month, and the departments' accounts ====", flush=True)
    first_of_last = (date.today().replace(day=1) - timedelta(days=1)).replace(day=1).isoformat()
    api = browser.new_context()
    rq = api.request
    check("The super admin signs in", rq.post(f"{BASE}/api/auth/login", data={"email": ADMIN, "password": SEED_PASSWORD}).status == 200)
    res = rq.put(f"{BASE}/api/storage/live-start", data=json.dumps({"date": first_of_last}), headers={"Content-Type": "text/plain;charset=utf-8"})
    check(f"The plant went live on {first_of_last} (the schedule's sheets of this month and its periods are on file)", res.status == 200, res.status)
    made = {}
    for code, (email, name) in DEPARTMENTS.items():
        if name is None:
            continue
        r = rq.post(f"{BASE}/api/users", data={"name": name, "email": email, "password": FIRST_PASSWORD, "departments": [code]})
        made[code] = r.status
    rq.post(f"{BASE}/api/auth/logout", data={})
    api.close()
    for code, status in made.items():
        email = DEPARTMENTS[code][0]
        if status == 201:
            c = browser.new_context()
            ok = c.request.post(f"{BASE}/api/auth/login", data={"email": email, "password": FIRST_PASSWORD}).status == 200
            changed = c.request.post(f"{BASE}/api/auth/change-password", data={"currentPassword": FIRST_PASSWORD, "newPassword": OWN_PASSWORD}).status
            c.close()
            check(f"{code}'s account is added and its first password changed", ok and changed in (200, 204), changed)
        else:
            check(f"{code}'s account is there (already added: {status})", status == 409, status)
    password_of = {code: (SEED_PASSWORD if name is None else OWN_PASSWORD) for code, (_, name) in DEPARTMENTS.items()}

    # ==================================================================
    # 1. The super admin starts every document on its own page
    # ==================================================================
    print("\n==== The super admin: every document, from its own page ====", flush=True)
    ctx, page = new_page()
    sign_in(page, ADMIN, SEED_PASSWORD)
    rows, count = library(page)
    DEFS.update(definitions(page))
    recordable = [r["id"] for r in rows if r["hasNew"]]
    reference = [r["id"] for r in rows if not r["hasNew"]]
    check("The library lists every document, and New on every one that holds records", len(rows) >= 129 and len(recordable) >= 125, (len(rows), len(recordable), reference))
    todo = [d for d in recordable if not ONLY or d in ONLY]
    admin_started = start_every_document(page, todo, DEFS, "super admin", again=True)

    # A document's page shows the record just started - not the blank sheet made ahead for the 31st (s93).
    for doc_id in [d for d in ("qc-viscosity", "mnt-glass-breakage") if d in admin_started]:
        go(page, f"#/document/{doc_id}", settle=1500)
        shown = page.locator("[data-section='document-preview']")
        check(f"{doc_id}'s page shows the record Start opened", shown.count() == 1 and shown.get_attribute("data-record") == admin_started[doc_id][0], (shown.get_attribute("data-record") if shown.count() else None, admin_started[doc_id][0]))

    # ==================================================================
    # 2. With the browser's storage full, Start still starts - and the record is saved
    # ==================================================================
    if not ONLY or "mnt-new-equipment" in ONLY:
        print("\n==== The browser's storage full ====", flush=True)
        go(page, "#/document/mnt-new-equipment", settle=1500)
        room = page.evaluate(FILL)
        check("The browser's storage is filled to the last few characters (a stand-in item)", room > 0, room)
        before = page.url
        press(page, "[data-action='document-new-record']")
        rid = wait_for(lambda: record_id(page) if page.url != before else None, timeout=10)
        check("Start opens a record page", bool(rid), page.url)
        if rid:
            problems = shown_ok(page, rid)
            check("...on the record: its form is drawn, never 'Record not found'", not problems, problems)
            banner = page.locator("[data-section='storage-held']")
            check("...and the page says this browser's copy is full", wait_for(lambda: banner.count() or None, timeout=8) is not None and "This browser's copy is full" in banner.first.inner_text(), banner.first.inner_text() if banner.count() else None)
            # Read in the same moment it says so: another held change (Mitra's chat, a setting) can put it back to "sending".
            saved = wait_for(lambda: page.evaluate("() => { const b = document.querySelector(\"[data-section='storage-held'][data-state='saved']\"); return b ? b.innerText : null; }"), timeout=30)
            check("...then that the record WAS saved", bool(saved) and "WAS saved" in saved, saved or (page.locator("[data-section='storage-held']").first.inner_text() if banner.count() else None))
            st = stored(page, rid, "mnt-new-equipment")
            check("...and it is in the database", st.get("found"), st.get("status"))
            check("...while nothing new was written into the browser's full storage", rid not in (page.evaluate("() => localStorage.getItem('dcrs:v1:records') || ''")))
            page.evaluate("() => localStorage.removeItem('zz-e2e-filler')")
            page.reload()
            page.wait_for_selector(".app-sidebar", timeout=90000)
            page.wait_for_timeout(1500)
            tidy(page)
            check("With room again, the record opens after a reload, from the database", not shown_ok(page, rid), page.url)
            admin_started.setdefault("mnt-new-equipment", []).append(rid)
        page.evaluate("() => localStorage.removeItem('zz-e2e-filler')")

    sign_out(page)
    sign_in(page, ADMIN, SEED_PASSWORD)
    stays(page, admin_started, "super admin")

    # Every Start above that made a NEW record - an as-required document's, the training record's - wrote "Record
    # started" (s62, s93). The pest responsibilities' button opens the signed copy on file, so it is left out.
    targets = page.evaluate(STARTED_LINES)
    made_new = [
        d
        for d in admin_started
        if d != "pest-responsibilities" and (d == "training-record" or (DEFS.get(d, {}).get("schedule") or {}).get("type") == "as-required")
    ]
    unlogged = [d for d in made_new if not any(x.startswith(activity_label(d)) for x in (targets or []))]
    check(f"Every record started by hand is in the activity log as 'Record started' ({len(made_new)} documents)", targets is not None and not unlogged, (targets is None, unlogged[:12]))
    ctx.close()

    # ==================================================================
    # 3. Each department starts its own documents, on their own pages
    # ==================================================================
    print("\n==== Each department, its own documents ====", flush=True)
    by_department = {}
    for code, (email, _) in DEPARTMENTS.items():
        ctx, page = new_page()
        sign_in(page, email, password_of[code])
        rows, _ = library(page)
        own = [r["id"] for r in rows if r["hasNew"] and (not ONLY or r["id"] in ONLY)]
        by_department[code] = own
        print(f"\n---- {code} ({email}): {len(own)} document(s) ----", flush=True)
        started = start_every_document(page, own, DEFS, code)
        if started:
            sign_out(page)
            sign_in(page, email, password_of[code])
            stays(page, started, code)
        ctx.close()

    owners = {}
    for code, docs in by_department.items():
        for d in docs:
            owners.setdefault(d, []).append(code)
    unowned = [d for d in todo if d not in owners]
    check("Every document that holds records is started by the department that owns it", not unowned, unowned)
    check("...Marketing its Complaint Acknowledgement, Purchase the service agreement", "capa-complaint-ack" in by_department.get("MKT", []) and "service-agreement" in by_department.get("PUR", []) or bool(ONLY), (by_department.get("MKT"), by_department.get("PUR")))

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nEvery record starts on its own page, for the super admin and for its own department, and stays.")
