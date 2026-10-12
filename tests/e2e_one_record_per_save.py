"""One record per save, and a colleague's save brings only that record (REQUIREMENTS s108, its second half).

Until this change every save sent the whole records item to the server (up to the 25 MB body limit, which a few years
of the plant's records would pass), and every open computer downloaded the whole item again after anybody's save. Now
the records are still stored as one item in PostgreSQL, but only what changed travels (backend/changeJournal.ts,
frontend/src/data/serverSync.ts). Two people, each in a browser of their own, on the production build, prove that:

  * a save sends the one record that changed (PATCH /api/storage/records), never the whole item - its size measured
    beside what the whole item weighed on the wire before;
  * a colleague's save reaches the other browser as that record alone (the question says which records it holds, and
    the answer is the records changed since), and the saver is not handed its own save again;
  * two browsers saving different records at the same moment both keep theirs: one saving from a copy older than the
    other's save is not refused (no 409) - its record is laid over what is stored, and the other's comes back with the
    answer; and two saving at once, each starting a record, both end in the database;
  * a save conflicting on the same record still merges as two copies of a record always have: the later stands, in
    the database and in both browsers;
  * a deletion travels (the person has Edit): gone from the database, and from the other browser;
  * a records item larger than the old 25 MB body limit - which a whole save can no longer send (413) - still takes
    a save of one record, of a few hundred bytes.

Network-independent. Against the production build on :8842.
"""
import gzip
import json
import re
import sys
import time
from datetime import date, timedelta

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
A_EMAIL = "one-record-a@example.com"
B_EMAIL = "one-record-b@example.com"
# F/MNT/08 is filled as required: New starts a new record each time (REQUIREMENTS s93).
DOCUMENT = "mnt-new-equipment"
RECORD_ROUTE = re.compile(r"#/record/([^/?#]+)$")
OLD_BODY_LIMIT = 25 * 1024 * 1024
FAILURES = []

# The company's working calendar (as tests/e2e_editing.py has it): Thursday is the weekly off except on adjustment days.
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
    print(f"[{'PASS' if cond else 'FAIL'}] {label}", flush=True)
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:900], flush=True)
    return cond


def wait_for(fn, timeout=15.0, every=0.25):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        try:
            last = fn()
        except Exception as e:  # a page navigating while asked
            last = None
            err = e
        if last:
            return last
        time.sleep(every)
    return last


# ---------------------------------------------------------------------------
# the page


def settle_briefing(page):
    """Today's briefing slots marked shown, so the briefing cannot open part way through and take a click."""
    page.evaluate(
        """() => {
             const KEY = 'dcrs:v1:settings';
             const now = new Date();
             const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
             try {
               const s = JSON.parse(localStorage.getItem(KEY) || '{}');
               s.briefingShown = { date: today, slots: ['first', 'morning', 'evening'] };
               localStorage.setItem(KEY, JSON.stringify(s));
             } catch (e) { /* the briefing may show, and is closed below */ }
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


def app_open(page, timeout=120000):
    page.wait_for_selector(".app-sidebar", timeout=timeout)
    intro_gone(page)
    page.wait_for_timeout(1200)
    tidy(page)
    settle_briefing(page)


def sign_in(page, name, email):
    """The suite's own account: signed in, made the first time only (the server limits new accounts per network)."""
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    intro_gone(page)
    page.fill("#login-email", email)
    page.fill("#login-password", PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1800)
    if page.locator(".app-sidebar").count() == 0:
        page.click("text=Sign up")
        page.wait_for_selector("#signup-name", timeout=30000)
        page.fill("#signup-name", name)
        page.fill("#signup-email", email)
        page.fill("#signup-password", PASSWORD)
        page.fill("#signup-confirm", PASSWORD)
        page.click("button:has-text('Create Account')")
    app_open(page)


def go(page, route, settle=900):
    if page.evaluate("() => location.hash") == route:
        page.evaluate("() => { location.hash = '#/'; }")
        page.wait_for_timeout(200)
    page.evaluate("h => { location.hash = h; }", route)
    page.wait_for_timeout(settle)
    tidy(page)


def record_id(page):
    m = RECORD_ROUTE.search(page.url)
    return m.group(1) if m else None


def start_record(page):
    """New on F/MNT/08's own page: the record it opens, or None."""
    go(page, f"#/document/{DOCUMENT}", settle=1200)
    button = page.locator("[data-action='document-new-record']")
    wait_for(lambda: button.count() or None, timeout=20)
    if not button.count():
        return None
    before = page.url
    button.first.evaluate("el => el.click()")
    return wait_for(lambda: record_id(page) if page.url != before else None, timeout=15)


def look_again(page):
    """The window coming back into focus: the browser asks the database what has changed (data/serverSync.ts onFocus)."""
    page.evaluate("() => window.dispatchEvent(new Event('focus'))")


# What this origin's IndexedDB keeps under a name (data/browserRoom.ts), put together from its parts; never makes the database.
ROOM_VALUE = """async function roomValue(name) {
  const db = await new Promise((resolve) => {
    let req;
    try { req = indexedDB.open('dcrs-room'); } catch (e) { resolve(null); return; }
    req.onupgradeneeded = () => { try { req.transaction.abort(); } catch (e) { /* ending */ } };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  if (!db) return null;
  try {
    if (!db.objectStoreNames.contains('items')) return null;
    return await new Promise((resolve) => {
      const store = db.transaction('items', 'readonly').objectStore('items');
      const q = store.get(name);
      q.onerror = () => resolve(null);
      q.onsuccess = () => {
        const head = q.result;
        if (head && typeof head.v === 'string') { resolve(head.v); return; }
        if (!head || typeof head.parts !== 'number') { resolve(null); return; }
        const pieces = new Array(head.parts);
        let left = head.parts;
        for (let i = 0; i < head.parts; i++) {
          const p = store.get('@part:' + i + ':' + name);
          p.onerror = () => resolve(null);
          p.onsuccess = () => {
            pieces[i] = p.result;
            left -= 1;
            if (left === 0) resolve(pieces.every((x) => typeof x === 'string') ? pieces.join('') : null);
          };
        }
      };
    });
  } finally {
    db.close();
  }
}"""

# The browser's copy of one record (localStorage, or IndexedDB when it is kept there): null when it has none.
LOCAL_RECORD = (
    "async (rid) => {"
    + ROOM_VALUE
    + """
  const text = localStorage.getItem('dcrs:v1:records') ?? (await roomValue('dcrs:v1:records'));
  if (!text) return null;
  return JSON.parse(text).find((r) => r.id === rid) ?? null;
}"""
)

# The database's records (GET /api/storage as this person, the whole item), with its version and size.
SERVER = """async () => {
  const res = await fetch('/api/storage', { credentials: 'same-origin' });
  const body = await res.json();
  const item = (body.items || []).find((i) => i.key === 'records');
  return item ? { version: item.version, seq: item.seq, chars: item.value.length, records: JSON.parse(item.value) } : null;
}"""

# What the whole records item weighs on the wire as a save used to send it: compressed, as data/serverSync.ts packed it.
WHOLE_ON_THE_WIRE = """async () => {
  const res = await fetch('/api/storage', { credentials: 'same-origin' });
  const item = ((await res.json()).items || []).find((i) => i.key === 'records');
  const text = item ? item.value : '[]';
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const packed = await new Response(stream).arrayBuffer();
  return { chars: text.length, bytes: new TextEncoder().encode(text).length, gzipped: packed.byteLength };
}"""


# Whether the database's records hold this id - read in the page, so a very large item is not carried back here.
IN_DATABASE = """async (rid) => {
  const res = await fetch('/api/storage', { credentials: 'same-origin' });
  if (!res.ok) return false;
  const item = ((await res.json()).items || []).find((i) => i.key === 'records');
  return !!item && item.value.includes('"id":"' + rid + '"');
}"""


def server_record(page, rid):
    item = page.evaluate(SERVER)
    if not item:
        return None
    return next((r for r in item["records"] if r["id"] == rid), None)


# ---------------------------------------------------------------------------
# what each browser sends and is handed


class Wire:
    """Every /api/storage request a page makes: its method, address, answer and size on the wire."""

    def __init__(self, page):
        self.calls = []
        page.on("requestfinished", self._done)

    def _done(self, req):
        if "/api/storage" in req.url:
            self.calls.append(req)

    def mark(self):
        return len(self.calls)

    def since(self, mark, method=None, path=None):
        out = []
        for req in self.calls[mark:]:
            if method and req.method != method:
                continue
            if path and path not in req.url:
                continue
            out.append(req)
        return out


def status_of(req):
    resp = req.response()
    return resp.status if resp else None


def sent_bytes(req):
    try:
        return req.sizes()["requestBodySize"]
    except Exception:
        return len(req.post_data_buffer or b"")


def answered_bytes(req):
    try:
        return req.sizes()["responseBodySize"]
    except Exception:
        return None


def patch_body(req):
    raw = req.post_data_buffer or b""
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def records_answer(req):
    """How a GET's answer carried the records: 'changes', 'whole', or None (not at all)."""
    try:
        body = req.response().json()
    except Exception:
        return "unreadable"
    item = next((i for i in body.get("items", []) if i.get("key") == "records"), None)
    if item is None:
        return None
    return "changes" if "changes" in item and "value" not in item else "whole"


def handed_ids(req):
    """The record ids a GET's answer handed over as changed or removed (empty when it carried none, or the whole item)."""
    try:
        body = req.response().json()
    except Exception:
        return []
    item = next((i for i in body.get("items", []) if i.get("key") == "records"), None)
    changes = (item or {}).get("changes") or {}
    return [x.get("id") for x in changes.get("changed", [])] + list(changes.get("removed", []))


def records_saves(wire, mark):
    return [r for r in wire.since(mark) if r.method in ("PUT", "PATCH") and r.url.endswith("/api/storage/records")]


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    ctx_a = browser.new_context(viewport={"width": 1400, "height": 1000})
    ctx_b = browser.new_context(viewport={"width": 1400, "height": 1000})
    a = ctx_a.new_page()
    b = ctx_b.new_page()
    for page in (a, b):
        page.on("pageerror", lambda e: errors.append(str(e)))
    wire_a = Wire(a)
    wire_b = Wire(b)
    measured = {}

    sign_in(a, "One Record A", A_EMAIL)
    a.wait_for_timeout(2500)
    sign_in(b, "One Record B", B_EMAIL)
    b.wait_for_timeout(2500)

    # ==================================================================
    # 1. A save sends the one record that changed
    # ==================================================================
    print("\n==== 1. A save sends the one record that changed ====", flush=True)
    a.wait_for_timeout(1500)
    mark = wire_a.mark()
    ra1 = start_record(a)
    check("New on F/MNT/08 opens a record page", bool(ra1), a.url)
    check("...and the record reaches the database", bool(wait_for(lambda: server_record(a, ra1), timeout=20)))
    a.wait_for_timeout(1500)
    saves = records_saves(wire_a, mark)
    bodies = [patch_body(r) for r in saves if r.method == "PATCH"]
    check(
        "Every save of the records since is a PATCH of the records that changed, never the whole item (PUT)",
        bool(saves) and all(r.method == "PATCH" and status_of(r) == 200 for r in saves),
        [(r.method, status_of(r)) for r in saves],
    )
    named = sorted({x["id"] for body in bodies for x in body.get("changed", [])})
    check("...and they name the record started, and nothing else of the plant's", named == [ra1], named)
    whole = a.evaluate(WHOLE_ON_THE_WIRE)
    one = max((sent_bytes(r) for r in saves), default=None)
    measured["save"] = {"patch_bytes": one, "whole_chars": whole["chars"], "whole_gzipped_bytes": whole["gzipped"]}
    print(f"     bytes per save: {one} now, where the whole records item was {whole['gzipped']} compressed ({whole['chars']} characters)", flush=True)
    check("...each a few kilobytes, where the whole item on the wire was more", one is not None and one < 20000 and one < whole["gzipped"], measured["save"])

    # ==================================================================
    # 2. A colleague's save brings only that record; the saver is not handed its own save again
    # ==================================================================
    print("\n==== 2. A colleague's save brings only that record ====", flush=True)
    look_again(b)
    check("The other browser has the record started, without a reload", bool(wait_for(lambda: b.evaluate(LOCAL_RECORD, ra1), timeout=25)))
    b.wait_for_timeout(1500)
    # The colleague saves again, now that B is in step: what reaches B for it is watched from here.
    mark_b = wire_b.mark()
    ra1b = start_record(a)
    check("(A starts another record, and it reaches the database)", bool(ra1b) and bool(wait_for(lambda: server_record(a, ra1b), timeout=20)))
    look_again(b)
    check("...and the other browser has it too, without a reload", bool(wait_for(lambda: b.evaluate(LOCAL_RECORD, ra1b), timeout=25)))
    bringing = lambda: [r for r in wire_b.since(mark_b, method="GET") if "/api/storage?since=" in r.url and ra1b in handed_ids(r)]
    wait_for(lambda: bringing() or None, timeout=10)
    gets = [r for r in wire_b.since(mark_b, method="GET") if "/api/storage?since=" in r.url]
    carried = [(records_answer(r), answered_bytes(r), ra1b in handed_ids(r)) for r in gets]
    check(
        "...handed to it as the records changed since its copy (that record alone), never the whole item",
        any(c == "changes" and has for c, _, has in carried) and not any(c == "whole" for c, _, _ in carried),
        carried,
    )
    asked = [r for r in gets if r.headers.get("x-records-version")]
    check("...its question saying which records it holds", bool(asked) and len(asked) == len(gets), [r.headers.get("x-records-version") for r in gets])
    colleague = max((n or 0 for c, n, has in carried if c == "changes" and has), default=None)
    measured["colleague"] = {"answer_bytes": colleague}
    print(f"     a colleague's save of one record: {colleague} bytes handed over, where the whole item was {whole['gzipped']} compressed", flush=True)
    a.wait_for_timeout(1500)
    mark = wire_a.mark()
    look_again(a)
    a.wait_for_timeout(1500)
    own = [r for r in wire_a.since(mark, method="GET") if "/api/storage?since=" in r.url]
    check(
        "The saver is not handed its own save again",
        own and all(records_answer(r) != "whole" and ra1b not in handed_ids(r) for r in own),
        [(records_answer(r), handed_ids(r)[:5]) for r in own],
    )

    # ==================================================================
    # 3. Two browsers saving different records at the same moment both keep theirs
    # ==================================================================
    print("\n==== 3. Two browsers saving different records at the same moment ====", flush=True)
    # B stops hearing from the database, so its copy is older than A's next save when it saves its own.
    b.route("**/api/storage?since=*", lambda route: route.abort())
    ra2 = start_record(a)
    check("(A starts a record, and it reaches the database)", bool(ra2) and bool(wait_for(lambda: server_record(a, ra2), timeout=20)))
    check("(B's copy has not heard of it)", b.evaluate(LOCAL_RECORD, ra2) is None)
    mark_b = wire_b.mark()
    rb2 = start_record(b)
    check("B starts a record of its own from that older copy", bool(rb2))
    check("...and it reaches the database", bool(wait_for(lambda: server_record(b, rb2), timeout=20)))
    b.wait_for_timeout(1500)
    saves_b = records_saves(wire_b, mark_b)
    check("...without a 409: a save naming none of the records changed since is laid over what is stored", saves_b and all(status_of(r) == 200 for r in saves_b), [(r.method, status_of(r)) for r in saves_b])
    check("Both records are in the database", bool(server_record(a, ra2)) and bool(server_record(a, rb2)))
    check("...and A's came back to B with the answer to its save, B still hearing nothing else", bool(wait_for(lambda: b.evaluate(LOCAL_RECORD, ra2), timeout=10)))
    b.unroute("**/api/storage?since=*")
    # Both at once: each starts a record at the same moment.
    a.evaluate(f"() => {{ location.hash = '#/document/{DOCUMENT}'; }}")
    b.evaluate(f"() => {{ location.hash = '#/document/{DOCUMENT}'; }}")
    a.wait_for_timeout(1500)
    b.wait_for_timeout(300)
    for page in (a, b):
        wait_for(lambda: page.locator("[data-action='document-new-record']").count() or None, timeout=20)
    before_a, before_b = a.url, b.url
    a.locator("[data-action='document-new-record']").first.evaluate("el => el.click()")
    b.locator("[data-action='document-new-record']").first.evaluate("el => el.click()")
    ra3 = wait_for(lambda: record_id(a) if a.url != before_a else None, timeout=15)
    rb3 = wait_for(lambda: record_id(b) if b.url != before_b else None, timeout=15)
    check(
        "Two browsers starting a record at the same moment: both records end in the database",
        bool(ra3) and bool(rb3) and bool(wait_for(lambda: server_record(a, ra3) and server_record(a, rb3), timeout=25)),
        (ra3, rb3),
    )
    look_again(a)
    look_again(b)
    check(
        "...and each browser has both",
        bool(wait_for(lambda: a.evaluate(LOCAL_RECORD, rb3) and b.evaluate(LOCAL_RECORD, ra3), timeout=25)),
    )

    # ==================================================================
    # 4. A save conflicting on the same record still merges: the later stands
    # ==================================================================
    print("\n==== 4. The same record changed in both browsers ====", flush=True)
    day = next_working_day(date.today()).isoformat()
    find_daily = "(d) => (JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').find(r => r.documentId === 'daily-pest-monitoring' && !r.isDemo && r.dueDate === d) || {}).id"
    daily = wait_for(lambda: a.evaluate(find_daily, day), timeout=10)
    check("(the next working day's Daily Pest Control record, in both browsers)", bool(daily) and bool(wait_for(lambda: b.evaluate(LOCAL_RECORD, daily), timeout=15)), (day, daily))
    if daily:
        b.route("**/api/storage?since=*", lambda route: route.abort())
        go(a, f"#/record/{daily}", settle=1500)
        go(b, f"#/record/{daily}", settle=1500)
        a.fill("input[placeholder='Name of checker']", "Alpha")
        a.locator("input[placeholder='Name of checker']").blur()
        check("A writes the checker, and it is saved", bool(wait_for(lambda: ((server_record(a, daily) or {}).get("data") or {}).get("checker") == "Alpha", timeout=20)))
        a.wait_for_timeout(500)
        mark_b = wire_b.mark()
        b.fill("input[placeholder='Name of checker']", "Beta")
        b.locator("input[placeholder='Name of checker']").blur()
        check(
            "B, from a copy without A's change, writes the same record later: the later stands in the database",
            bool(wait_for(lambda: ((server_record(b, daily) or {}).get("data") or {}).get("checker") == "Beta", timeout=25)),
            ((server_record(b, daily) or {}).get("data") or {}).get("checker"),
        )
        b.wait_for_timeout(1000)
        statuses = [status_of(r) for r in records_saves(wire_b, mark_b)]
        check("...refused once as made from an older copy (409 with A's record), merged, and sent again (200)", 409 in statuses and statuses[-1] == 200, statuses)
        b.unroute("**/api/storage?since=*")
        go(a, "#/", settle=800)
        look_again(a)
        check(
            "...and A's browser has the later one too",
            bool(wait_for(lambda: (((a.evaluate(LOCAL_RECORD, daily) or {}).get("data") or {}).get("checker") == "Beta"), timeout=25)),
        )

    # ==================================================================
    # 5. A deletion travels
    # ==================================================================
    print("\n==== 5. A deletion travels ====", flush=True)
    if ra2:
        go(a, f"#/record/{ra2}", settle=1500)
        mark = wire_a.mark()
        delete = a.locator("button:has-text('Delete')")
        wait_for(lambda: delete.count() or None, timeout=15)
        delete.first.click()
        a.wait_for_timeout(400)
        a.fill("textarea[data-field='delete-reason']", "Started twice by mistake")
        a.wait_for_timeout(200)
        a.click("[data-action='confirm-delete']")
        check("A record deleted on its page is gone from the database", bool(wait_for(lambda: server_record(a, ra2) is None, timeout=20)))
        a.wait_for_timeout(1200)
        removals = [(status_of(r), patch_body(r)) for r in records_saves(wire_a, mark) if r.method == "PATCH"]
        check("...sent as its id alone, and taken", any(status == 200 and body.get("removed") == [ra2] for status, body in removals), removals)
        look_again(b)
        check("...and gone from the other browser", bool(wait_for(lambda: b.evaluate(LOCAL_RECORD, ra2) is None, timeout=25)))

    # ==================================================================
    # 6. A records item larger than the old 25 MB body limit still saves
    # ==================================================================
    print("\n==== 6. Past the old 25 MB body limit ====", flush=True)
    # B has done its part; closed, so it does not take in the megabytes below as they arrive.
    ctx_b.close()
    # The plant's records grown past the old limit by another client's saves, a megabyte at a time: copies of a blank
    # sheet dated before the system went live, which nobody has written on. Nothing is read or observed in them (s98).
    grown = a.evaluate(
        """async (target) => {
          const body = await (await fetch('/api/storage', { credentials: 'same-origin' })).json();
          const item = (body.items || []).find((i) => i.key === 'records');
          const records = JSON.parse(item.value);
          const blank = records.find((r) => !r.isDemo && (r.status === 'Due' || r.status === 'Scheduled') && r.createdAt === r.updatedAt);
          if (!blank) return { error: 'no blank sheet to copy' };
          let base = { version: item.version, seq: item.seq };
          let size = item.value.length;
          let i = 0;
          let saves = 0;
          const at = '2025-06-01T09:00:00.000Z';
          while (size < target) {
            const changed = [];
            let chunk = 0;
            while (chunk < 1000000 && size + chunk < target + 200000) {
              const month = String(1 + (Math.floor(i / 28) % 12)).padStart(2, '0');
              const day = String(1 + (i % 28)).padStart(2, '0');
              const id = 'one-record-e2e-' + i;
              const copy = { ...blank, id, dueDate: `2025-${month}-${day}`, periodKey: `${blank.documentId}:2025-${month}-${day}#${id}`, status: 'Due', createdAt: at, updatedAt: at, notes: 'x'.repeat(1500) };
              const text = JSON.stringify(copy);
              changed.push(text);
              chunk += text.length + 1;
              i += 1;
            }
            const res = await fetch('/api/storage/records', {
              method: 'PATCH', credentials: 'same-origin',
              headers: { 'Content-Type': 'text/plain;charset=utf-8', 'X-Base-Version': String(base.version), 'X-Base-Seq': String(base.seq) },
              body: `{"changed":[${changed.join(',')}],"removed":[]}`,
            });
            if (res.status !== 200) return { status: res.status, at: saves, size };
            const answer = await res.json();
            base = { version: answer.version, seq: answer.seq };
            size += chunk;
            saves += 1;
          }
          return { status: 200, saves, added: i, size };
        }""",
        OLD_BODY_LIMIT + 1_500_000,
    )
    check("(the records grown by saves of a megabyte each)", grown.get("status") == 200, grown)
    big = a.evaluate("async () => { const r = await fetch('/api/storage', { credentials: 'same-origin' }); const i = ((await r.json()).items || []).find((x) => x.key === 'records'); return i ? i.value.length : 0; }")
    check(f"The records item is past the old body limit: {big} characters", big > OLD_BODY_LIMIT, big)
    refused = a.evaluate(
        """async () => {
          const body = await (await fetch('/api/storage', { credentials: 'same-origin' })).json();
          const item = (body.items || []).find((i) => i.key === 'records');
          const res = await fetch('/api/storage/records', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'X-Base-Version': String(item.version) }, body: item.value });
          return res.status;
        }"""
    )
    check("...which a whole save can no longer send (413)", refused == 413, refused)
    a.reload()
    app_open(a, timeout=180000)
    mark = wire_a.mark()
    ra6 = start_record(a)
    check("Signed in again on it, New starts a record", bool(ra6), a.url)
    check("...which reaches the database", bool(wait_for(lambda: a.evaluate(IN_DATABASE, ra6), timeout=60, every=1.0)))
    a.wait_for_timeout(1500)
    saves = records_saves(wire_a, mark)
    biggest = max((sent_bytes(r) for r in saves), default=None)
    check("...each save a PATCH of a few kilobytes", saves and all(r.method == "PATCH" and status_of(r) == 200 for r in saves) and biggest is not None and biggest < 20000, [(r.method, status_of(r), sent_bytes(r)) for r in saves])
    after = a.evaluate("async () => { const r = await fetch('/api/storage', { credentials: 'same-origin' }); const i = ((await r.json()).items || []).find((x) => x.key === 'records'); return i ? i.value.length : 0; }")
    measured["past_limit"] = {"item_chars": after, "patch_bytes": biggest}
    print(f"     past the old limit: a save of {biggest} bytes onto a records item of {after} characters", flush=True)
    check("...and the item still holds everything, the new record with it", after > big, (big, after))

    check("No JavaScript errors", not errors, errors[:5])
    print("\nMEASURED " + json.dumps(measured), flush=True)
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nOne record per save: every check passed.")
