"""The browser's room: what does not fit in localStorage is kept in IndexedDB, and nothing is lost (REQUIREMENTS s108).

The owner, 9-Oct-2026, with a picture of the banner "This browser's copy is full - your record WAS saved ... Make room
in this browser before you close or reload the page", which he saw again and again: "fix it also without any loss".
Until s108 a value that did not fit in the browser's localStorage was held in the page's memory alone (s93, s101), so
every reload found the browser full again. Now it is kept in IndexedDB (frontend/src/data/browserRoom.ts):

  * with this origin's localStorage filled to the last few hundred characters (a stand-in item outside the app's
    names), records started past the room each open on their page, reach PostgreSQL, are kept in IndexedDB, and no
    banner says the copy is full; the old copy of the records in localStorage is removed, to free the room;
  * after a reload, the browser still full, every record is still there - the browser's copy (IndexedDB) and
    PostgreSQL hold the same records, the ones started the same - each started record opens, and no banner;
  * the plant's records grown past the whole room (about 7 MB, as the owner's browser held: blank sheets from before
    the system went live and the plant's own) - the app opens on every one, kept in IndexedDB, none in localStorage,
    no banner; and the start-up read of that copy is timed at 6x CPU throttle, with its longest task;
  * with IndexedDB made to refuse (its put throws QuotaExceededError, as on a full disk): a record started still
    opens and reaches PostgreSQL, and the banner says, in its own words, that the browser's copy is full, that
    IndexedDB has no room either, and then that the record WAS saved and to free space on the disk; IndexedDB has none
    of it; with the disk's room back, the record opens after a reload and IndexedDB has it.

Network-independent. Against the production build on :8842.
"""
import re
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
EMAIL = "room-indexeddb@example.com"
PASSWORD = "PlaywrightQA123"
# F/MNT/08 is filled as required: the library's New starts a new record each time (REQUIREMENTS s93).
DOCUMENT = "mnt-new-equipment"
BANNERS = "[data-section='storage-held'], [data-section='storage-full'], [data-section='storage-nearly-full']"
RECORD_ROUTE = re.compile(r"#/record/([^/?#]+)$")
SEVEN_MB = 7_000_000
FAILURES = []


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}", flush=True)
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:900], flush=True)
    return cond


def wait_for(fn, timeout=10.0, every=0.25):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        last = fn()
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


def app_open(page, timeout=120000):
    page.wait_for_selector(".app-sidebar", timeout=timeout)
    intro_gone(page)
    page.wait_for_timeout(1200)
    tidy(page)


def sign_in(page):
    """The suite's own account: signed in, made the first time only (the server limits new accounts per network)."""
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    intro_gone(page)
    page.fill("#login-email", EMAIL)
    page.fill("#login-password", PASSWORD)
    page.click("button:has-text('Log In')")
    page.wait_for_timeout(1800)
    if page.locator(".app-sidebar").count() == 0:
        page.click("text=Sign up")
        page.wait_for_selector("#signup-name", timeout=30000)
        page.fill("#signup-name", "Room QA")
        page.fill("#signup-email", EMAIL)
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
    """The library's New on F/MNT/08: the record page it opens, or None."""
    go(page, "#/library", settle=1000)
    button = page.locator(f"tr[data-library-document='{DOCUMENT}'] [data-action='new-record']")
    wait_for(lambda: button.count() or None, timeout=20)
    if not button.count():
        return None
    before = page.url
    button.first.evaluate("el => el.click()")
    return wait_for(lambda: record_id(page) if page.url != before else None, timeout=15)


def form_drawn(page, rid):
    return bool(wait_for(lambda: page.locator(f"[data-bind-record='{rid}']").count() or None, timeout=15))


def banners(page):
    return page.locator(BANNERS).count()


# A stand-in item outside the app's own names fills what is left of localStorage, to the last few hundred characters.
FILL = """() => {
  let lo = 0, hi = 12000000;
  while (hi - lo > 200) {
    const mid = Math.floor((lo + hi) / 2);
    try { localStorage.setItem('zz-e2e-filler', 'x'.repeat(mid)); lo = mid; } catch (e) { hi = mid; }
  }
  try { localStorage.setItem('zz-e2e-filler', 'x'.repeat(lo)); } catch (e) { /* as full as it goes */ }
  return lo;
}"""

# What this origin's IndexedDB keeps under a name, as data/browserRoom.ts keeps it - the value itself, or a value over
# PART_CHARS put together from its parts, all read in one transaction; never makes the database.
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

# The records as PostgreSQL holds them (GET /api/storage, as this person) beside the browser's copy in IndexedDB.
COMPARE = (
    "async (started) => {"
    + ROOM_VALUE
    + """
  const res = await fetch('/api/storage', { credentials: 'same-origin' });
  const body = res.ok ? await res.json() : { items: [] };
  const item = (body.items || []).find((i) => i.key === 'records');
  const db = item ? JSON.parse(item.value) : [];
  const text = await roomValue('dcrs:v1:records');
  const kept = text ? JSON.parse(text) : [];
  const local = localStorage.getItem('dcrs:v1:records');
  const byId = (list) => new Map(list.map((r) => [r.id, JSON.stringify(r)]));
  const dbBy = byId(db), keptBy = byId(kept);
  return {
    status: res.status,
    db: db.length,
    kept: kept.length,
    dbChars: item ? item.value.length : 0,
    keptChars: text ? text.length : 0,
    sameText: !!text && !!item && text === item.value,
    missingHere: [...dbBy.keys()].filter((id) => !keptBy.has(id)).slice(0, 5),
    missingThere: [...keptBy.keys()].filter((id) => !dbBy.has(id)).slice(0, 5),
    started: started.map((id) => ({ id, db: dbBy.has(id), kept: keptBy.has(id), same: dbBy.get(id) === keptBy.get(id) })),
    inLocal: local === null ? null : local.length,
  };
}"""
)

IN_DATABASE = """async (rid) => {
  const res = await fetch('/api/storage', { credentials: 'same-origin' });
  if (!res.ok) return false;
  const item = ((await res.json()).items || []).find((i) => i.key === 'records');
  return !!item && item.value.includes('"id":"' + rid + '"');
}"""

IN_ROOM = "async (rid) => {" + ROOM_VALUE + "\n  const text = await roomValue('dcrs:v1:records');\n  return !!text && text.includes('\"id\":\"' + rid + '\"');\n}"

# The plant's records grown past the whole room, by another client (as colleagues' work reaches the database): copies
# of a blank sheet dated before the system went live, which nobody has written on - the 3457 blank sheets of the
# owner's picture - each with an id and a period of its own. Nothing is read or observed in them (REQUIREMENTS s98).
GROW = """async (target) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const body = await (await fetch('/api/storage', { credentials: 'same-origin' })).json();
    const item = (body.items || []).find((i) => i.key === 'records');
    if (!item) return { error: 'no records item' };
    const records = JSON.parse(item.value);
    const blank = records.find((r) => !r.isDemo && (r.status === 'Due' || r.status === 'Scheduled') && r.createdAt === r.updatedAt);
    if (!blank) return { error: 'no blank sheet to copy' };
    const at = '2025-06-01T09:00:00.000Z';
    let size = item.value.length;
    let i = 0;
    while (size < target) {
      const month = String(1 + (Math.floor(i / 28) % 12)).padStart(2, '0');
      const day = String(1 + (i % 28)).padStart(2, '0');
      const id = 'room-e2e-' + i;
      const copy = { ...blank, id, dueDate: `2025-${month}-${day}`, periodKey: `${blank.documentId}:2025-${month}-${day}#${id}`, status: 'Due', createdAt: at, updatedAt: at };
      records.push(copy);
      size += JSON.stringify(copy).length + 1;
      i += 1;
    }
    const text = JSON.stringify(records);
    const put = await fetch('/api/storage/records', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'X-Base-Version': String(item.version) }, body: text });
    if (put.status !== 409) return { status: put.status, added: i, chars: text.length };
  }
  return { status: 409 };
}"""

# The start-up's long tasks, from the first moment of the page (a PerformanceObserver set before the app's script).
LONG_TASKS = """(() => {
  window.__dcrsLongTasks = [];
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__dcrsLongTasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  } catch (e) { /* no long-task timing here */ }
})();"""

# The room is begun by main.tsx at the end of the app's own script, so the task it begins in is the script's evaluation
# (there before s108); what the room adds is every task after that one, until it is open (data/browserRoom.ts measures
# "dcrs:room-open").
START_UP = """() => {
  const open = performance.getEntriesByName('dcrs:room-open')[0];
  const tasks = window.__dcrsLongTasks || [];
  if (!open) return null;
  const end = open.startTime + open.duration;
  const script = tasks.filter(([s, d]) => s <= open.startTime && s + d >= open.startTime);
  const room = tasks.filter(([s]) => s > open.startTime && s < end);
  const longest = (list) => Math.round(Math.max(0, ...list.map(([, d]) => d)));
  return {
    openMs: Math.round(open.duration),
    openAt: Math.round(open.startTime),
    longestInRoom: longest(room),
    tasksInRoom: room.length,
    scriptTask: longest(script),
    longestAll: longest(tasks),
    tasksAll: tasks.length,
  };
}"""

# What one save adds on the page (data/browserRoom.ts flush), done here the same way under a name of the suite's own,
# removed after: the stamp read back alone, then the 7 MB records put in parts of a million characters, each by a call
# of its own when the last is taken, the head and the stamp last. Timed by the long tasks it makes and around each put,
# which serialises its part in the call.
BENCH = (
    "async () => {"
    + ROOM_VALUE
    + """
  const value = await roomValue('dcrs:v1:records');
  if (!value) return null;
  const db = await new Promise((resolve) => { const r = indexedDB.open('dcrs-room'); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null); });
  if (!db) return null;
  const PART = 1000000;
  const name = 'zz-e2e-bench';
  const parts = Math.ceil(value.length / PART);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const before = (window.__dcrsLongTasks || []).length;
  const began = performance.now();
  let longestCall = 0;
  const timed = (work) => { const t0 = performance.now(); const out = work(); longestCall = Math.max(longestCall, performance.now() - t0); return out; };
  await new Promise((resolve) => {
    const tx = db.transaction('items', 'readwrite');
    const store = tx.objectStore('items');
    const there = store.get('@stamp:' + name);
    there.onsuccess = () => {
      let i = 0;
      const finish = () => timed(() => { store.put({ parts, c: 1, t: 'bench' }, name); store.put({ c: 1, t: 'bench', parts }, '@stamp:' + name); });
      const putNext = () => {
        const put = timed(() => store.put(value.slice(i * PART, (i + 1) * PART), '@part:' + i + ':' + name));
        i += 1;
        put.onsuccess = i < parts ? putNext : finish;
      };
      putNext();
    };
    tx.oncomplete = tx.onabort = tx.onerror = () => resolve();
  });
  const stored = performance.now();
  await new Promise((resolve) => {
    const tx = db.transaction('items', 'readwrite');
    const s = tx.objectStore('items');
    s.delete(name);
    s.delete('@stamp:' + name);
    for (let i = 0; i < parts; i++) s.delete('@part:' + i + ':' + name);
    tx.oncomplete = tx.onabort = () => resolve();
  });
  db.close();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const tasks = (window.__dcrsLongTasks || []).slice(before).filter(([s]) => s >= began && s <= stored);
  return {
    chars: value.length,
    parts,
    longestCallMs: Math.round(longestCall),
    storedMs: Math.round(stored - began),
    longest: Math.round(Math.max(0, ...tasks.map(([, d]) => d))),
    tasks: tasks.length,
  };
}"""
)

# IndexedDB refusing, as on a full disk: every put throws QuotaExceededError (data/browserRoom.ts treats it as a refusal).
REFUSE = """(() => {
  IDBObjectStore.prototype.put = function () {
    throw new DOMException('The disk is full (tests/e2e_browser_room.py).', 'QuotaExceededError');
  };
})();"""

# Every distinct text of the banner, as it changes ("sending", then "saved"): read after, in order.
BANNER_TEXTS = """(() => {
  window.__dcrsBanner = [];
  const seen = () => {
    const b = document.querySelector("[data-section='storage-held']");
    if (!b) return;
    const entry = (b.getAttribute('data-state') || '') + '|' + b.innerText;
    if (window.__dcrsBanner[window.__dcrsBanner.length - 1] !== entry) window.__dcrsBanner.push(entry);
  };
  new MutationObserver(seen).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
})();"""


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1366, "height": 860})
    errors = []

    def new_page(*init_scripts):
        page = context.new_page()
        page.route("**/translate_a/**", lambda route: route.abort())
        page.on("pageerror", lambda e: errors.append(str(e)))
        # A page left while a change is still on its way asks first (s93, s108); a stuck dialog must not hang the suite.
        page.on("dialog", lambda d: d.accept())
        for script in init_scripts:
            page.add_init_script(script)
        return page

    page = new_page()
    sign_in(page)
    settle_briefing(page)

    # ==================================================================
    # 1. localStorage nearly full: records started past the room
    # ==================================================================
    print("\n==== localStorage nearly full: records started past the room ====", flush=True)
    first = wait_for(lambda: (lambda c: c if c["db"] > 0 else None)(page.evaluate(COMPARE, [])), timeout=30) or page.evaluate(COMPARE, [])
    check(
        "A browser with room: the records are in localStorage, as they always were, and IndexedDB keeps none of them",
        first["inLocal"] is not None and first["keptChars"] == 0 and first["db"] > 0,
        first,
    )
    started = []
    for n in range(1, 4):
        room = page.evaluate(FILL)
        rid = start_record(page)
        ok = check(f"Record {n}, started with localStorage filled ({room:,} characters of stand-in), opens on its page", bool(rid) and form_drawn(page, rid), page.url)
        if not ok:
            continue
        started.append(rid)
        check(f"...record {n} reaches PostgreSQL", bool(wait_for(lambda: page.evaluate(IN_DATABASE, rid), timeout=30)), rid)
        check(f"...and the browser's copy in IndexedDB", bool(wait_for(lambda: page.evaluate(IN_ROOM, rid), timeout=15)), rid)
        check(f"...and no banner says the browser's copy is full", banners(page) == 0, page.locator(BANNERS).first.inner_text() if banners(page) else None)
    gone = wait_for(lambda: page.evaluate("() => localStorage.getItem('dcrs:v1:records') === null"), timeout=15)
    check("The old copy of the records in localStorage is removed, to free the room for the small values", bool(gone), page.evaluate("() => (localStorage.getItem('dcrs:v1:records') || '').length"))

    # ==================================================================
    # 2. A reload, the browser still full
    # ==================================================================
    print("\n==== A reload, the browser still full ====", flush=True)
    page.reload()
    app_open(page)
    same = wait_for(lambda: (lambda c: c if (not c["missingHere"] and not c["missingThere"] and all(s["same"] for s in c["started"])) else None)(page.evaluate(COMPARE, started)), timeout=30) or page.evaluate(COMPARE, started)
    check(
        f"After the reload every record is still there: the browser's copy and PostgreSQL hold the same {same['db']} records",
        same["db"] > 0 and same["kept"] == same["db"] and not same["missingHere"] and not same["missingThere"],
        same,
    )
    check("...the records started past the room among them, each the same in both", len(started) == 3 and all(s["db"] and s["kept"] and s["same"] for s in same["started"]), same["started"])
    for n, rid in enumerate(started, 1):
        go(page, f"#/record/{rid}", settle=900)
        check(f"...record {n} opens on its page after the reload", form_drawn(page, rid), page.url)
    check("...and no banner says the browser's copy is full", banners(page) == 0, page.locator(BANNERS).first.inner_text() if banners(page) else None)
    page.evaluate("() => localStorage.removeItem('zz-e2e-filler')")

    # ==================================================================
    # 3. The plant's records past the whole room, and the start-up's speed
    # ==================================================================
    print("\n==== The plant's records past the whole room (about 7 MB) ====", flush=True)
    grown = page.evaluate(GROW, SEVEN_MB)
    check(f"The plant's records in PostgreSQL are grown past the browser's whole room (another client's save of {grown.get('added')} blank pre-launch sheets)", grown.get("status") == 200 and grown.get("chars", 0) >= SEVEN_MB, grown)
    page.reload()
    app_open(page)
    big = wait_for(lambda: (lambda c: c if (c["sameText"] and c["inLocal"] is None) else None)(page.evaluate(COMPARE, started)), timeout=60) or page.evaluate(COMPARE, started)
    check(
        f"The app opens on every one of the {big['db']} records ({big['dbChars']:,} characters), kept in IndexedDB exactly as PostgreSQL has them",
        big["sameText"] and big["kept"] == big["db"] and big["keptChars"] >= SEVEN_MB,
        {k: v for k, v in big.items() if k != "started"},
    )
    check("...none of them in localStorage, which keeps its room for the small values", big["inLocal"] is None, big["inLocal"])
    check("...and no banner says the browser's copy is full", banners(page) == 0, page.locator(BANNERS).first.inner_text() if banners(page) else None)
    go(page, f"#/record/{started[0]}" if started else "#/", settle=900)
    check("...a record started earlier still opens", bool(started) and form_drawn(page, started[0]), page.url)
    page.close()

    # Speed (REQUIREMENTS s56, s108): the same reload at 6x CPU throttle, the start-up read of the 7 MB copy timed.
    page = new_page(LONG_TASKS)
    cdp = context.new_cdp_session(page)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 6})
    t0 = time.time()
    page.goto(f"{BASE}/index.html#/dashboard")
    app_open(page, timeout=180000)
    to_app = time.time() - t0
    timing = page.evaluate(START_UP)
    bench = page.evaluate(BENCH)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
    if timing:
        print(
            f"    [INFO] at 6x CPU: the room's start-up read of the 7 MB copy took {timing['openMs']} ms, with {timing['tasksInRoom']} long task(s) of its own "
            f"(the longest {timing['longestInRoom']} ms); the app's own script, which begins it, ran {timing['scriptTask']} ms as before s108; "
            f"the app was open in {to_app:.1f} s, the longest task of the whole start-up {timing['longestAll']} ms",
            flush=True,
        )
    if bench:
        print(
            f"    [INFO] at 6x CPU, one save's IndexedDB work on the {bench['chars']:,}-character copy, in {bench['parts']} parts: the longest put's call "
            f"{bench['longestCallMs']} ms, stored {bench['storedMs']} ms after it began; {bench['tasks']} long task(s), the longest {bench['longest']} ms",
            flush=True,
        )
    check(
        "At 6x CPU throttle the start-up read of the 7 MB copy runs no task over 200 ms",
        bool(timing) and timing["longestInRoom"] <= 200,
        timing,
    )
    check(
        "...and one save's IndexedDB work on it no task over 200 ms (the stamp alone read back, the value put in parts)",
        bool(bench) and bench["longest"] <= 200,
        bench,
    )
    big_parts = page.evaluate(
        "async () => { const r = await new Promise((resolve) => { const q = indexedDB.open('dcrs-room'); q.onsuccess = () => resolve(q.result); q.onerror = () => resolve(null); }); if (!r) return null;"
        " const head = await new Promise((resolve) => { const g = r.transaction('items').objectStore('items').get('dcrs:v1:records'); g.onsuccess = () => resolve(g.result); g.onerror = () => resolve(null); }); r.close(); return head ? head.parts || 0 : null; }"
    )
    check("...the 7 MB copy is kept in parts of a million characters, each read and written in a task of its own", (big_parts or 0) >= 7, big_parts)
    page.close()

    # ==================================================================
    # 4. IndexedDB refusing, as on a full disk
    # ==================================================================
    print("\n==== IndexedDB refusing, as on a full disk ====", flush=True)
    page = new_page(REFUSE, BANNER_TEXTS)
    page.goto(f"{BASE}/index.html#/dashboard")
    app_open(page)
    rid = start_record(page)
    check("With IndexedDB refusing, a record started still opens on its page", bool(rid) and form_drawn(page, rid), page.url)
    if rid:
        held = page.locator("[data-section='storage-held']")
        check("...the banner says this browser's copy is full", bool(wait_for(lambda: held.count() or None, timeout=15)) and "This browser's copy is full" in held.first.inner_text(), held.first.inner_text() if held.count() else None)
        saved = wait_for(lambda: page.evaluate("() => { const b = document.querySelector(\"[data-section='storage-held'][data-state='saved']\"); return b ? b.innerText : null; }"), timeout=40)
        texts = page.evaluate("() => window.__dcrsBanner || []")
        sending = next((t for t in texts if t.startswith("sending|")), "")
        check(
            "...first, while it is on its way, that neither the storage nor IndexedDB has room and the change is being sent to PostgreSQL",
            "This browser's copy is full." in sending and "larger store (IndexedDB) has room" in sending and "being sent to the database (PostgreSQL)" in sending,
            texts,
        )
        check(
            "...then that the record WAS saved, that it is in PostgreSQL, that IndexedDB did not take it either, and to free space on the disk",
            bool(saved)
            and "This browser's copy is full — your record WAS saved." in saved
            and "It is in the database (PostgreSQL), so nothing is lost" in saved
            and "IndexedDB) did not take it either" in saved
            and "Free some space on the disk" in saved,
            saved or texts,
        )
        check("...the record is in PostgreSQL", bool(wait_for(lambda: page.evaluate(IN_DATABASE, rid), timeout=30)), rid)
        check("...and IndexedDB has none of it", not page.evaluate(IN_ROOM, rid), rid)
        page.close()

        page = new_page()
        page.goto(f"{BASE}/index.html#/record/{rid}")
        app_open(page)
        go(page, f"#/record/{rid}", settle=900)
        check("With the disk's room back, the record opens after a reload", form_drawn(page, rid), page.url)
        check("...IndexedDB has it now", bool(wait_for(lambda: page.evaluate(IN_ROOM, rid), timeout=30)), rid)
        check("...and no banner", banners(page) == 0, page.locator(BANNERS).first.inner_text() if banners(page) else None)

    page.evaluate("() => localStorage.removeItem('zz-e2e-filler')")
    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nThe browser's room: what does not fit in localStorage is kept in IndexedDB, and nothing is lost.")
