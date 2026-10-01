"""Copy and Edit in Mitra's chat, the same as Claude (REQUIREMENTS s85).

Asked for on 30-Sep-2026: "add two features in the assistant: copy, and the
prompt - edit it - the same as Claude." Checked on the full-page Ask Mitra and
in the dock, on the rules path (no model key - the server as the suites run it)
and on the agent path (the model mocked at the browser's network edge and the
server's assistant flag switched on in the auth answers, as e2e_mitra_agent.py
does), against the demo server (:8842, sign-up; DCRS_BASE overrides it):

  * every message with words - Mitra's and the person's - has Copy; it puts the
    words as written on the clipboard (a reply's markdown kept as text), shows a
    tick "Copied" for a moment, and works without the async clipboard too;
  * every one of the person's own messages has Edit, and only theirs; the buttons
    have aria-labels and no visible words, and work from the keyboard;
  * Edit opens the message in place with Save and Cancel; Escape cancels (the
    focus back on Edit), Enter saves; Save sends the edited words as that turn
    again and everything after it is replaced by the new answer; the stored
    conversation (assistant-conversations) holds the edited thread;
  * the model is asked with the edited words and only the conversation BEFORE
    the edited message; the files of that turn go again (their words too);
  * a turn being answered cannot be edited: Edit and Save wait, Stop stands
    where Send was; Stop ends the wait at once ("Stopped."), and an answer or a
    tool call arriving after it is never shown or carried out;
  * no JavaScript errors.
"""
import json
import os
import re
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DCRS_BASE", "http://localhost:8842").rstrip("/")
PASSWORD = "PlaywrightQA123"
FAILURES = []
REQUESTS = []  # every body POSTed to /api/assistant/agent, in order
HELD = []  # requests held open to stand for a model (or a server) still thinking
PAGE = ".assistant-page"
DOCK = ".assistant-dock"
STORE = "dcrs:v1:assistant-conversations"


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:700])


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


def dismiss(page):
    for _ in range(3):
        g = page.locator("button:has-text('Got it')")
        if g.count():
            g.first.click()
            page.wait_for_timeout(200)
    settle_briefing(page)


def close_dock(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def tool_call(call_id, name, args):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


def last_user_content(body):
    for m in reversed(body.get("messages", [])):
        if m.get("role") == "user":
            return m.get("content") or ""
    return ""


def agent_route(route):
    """The model, canned: words that repeat the question; a file read back; 'slowly' held open."""
    body = route.request.post_data_json or {}
    REQUESTS.append(body)
    msgs = body.get("messages", [])
    last = msgs[-1] if msgs else {}
    if last.get("role") == "tool":
        route.fulfill(json={"kind": "final", "text": "Done."})
        return
    text = (last.get("content") or "") if last.get("role") == "user" else ""
    if "slowly" in text.lower():
        HELD.append(route)
        return
    if "[attachment 1:" in text.lower():
        m = re.search(r"\[Attachment 1: ([^\]]+?) \(", text)
        route.fulfill(json={"kind": "final", "text": f"I read **{m.group(1) if m else 'the file'}** for: {text.splitlines()[0][:60]}"})
        return
    route.fulfill(json={"kind": "final", "text": f"You said: **{text.splitlines()[0][:80] if text else ''}**"})


def chat_hold_route(route):
    """/api/assistant/chat held open: the rules path waiting on the server."""
    HELD.append(route)


def auth_route(route):
    """The server's auth answers, with the assistant flag switched on so the agent path runs without a key."""
    response = route.fetch()
    try:
        body = response.json()
    except Exception:
        route.fulfill(response=response)
        return
    if isinstance(body, dict) and isinstance(body.get("features"), dict):
        body["features"]["assistant"] = True
    route.fulfill(response=response, json=body)


def texts(page, sel):
    return [t.strip() for t in page.locator(sel).all_inner_texts()]


def wait_count(page, sel, n, timeout=15000):
    try:
        page.wait_for_function("([s, n]) => document.querySelectorAll(s).length >= n", arg=[sel, n], timeout=timeout)
    except Exception:
        pass


def wait_gone(page, sel, timeout=15000):
    try:
        page.wait_for_function("(s) => document.querySelectorAll(s).length === 0", arg=sel, timeout=timeout)
    except Exception:
        pass


def send(page, scope, words):
    box = page.locator(f"{scope} textarea.input")
    box.fill(words)
    page.locator(f"{scope} button[aria-label='Send']").click()


def stored_active(page):
    return page.evaluate(
        """(key) => { const s = JSON.parse(localStorage.getItem(key) || '{}');
             const c = (s.conversations || []).find((x) => x.id === s.activeId); return c || null; }""",
        STORE,
    )


def new_chat(page):
    page.locator(".assistant-side-head button").first.click()
    page.wait_for_timeout(300)


def user_turn(page, scope, words):
    """The person's turn whose message reads exactly `words`."""
    return page.locator(f"{scope} .mitra-turn.user").filter(has=page.locator(".chat-msg.user", has_text=re.compile(rf"^\s*{re.escape(words)}\s*$")))


def csv_file():
    fd, path = tempfile.mkstemp(suffix=".csv", prefix="viscosity-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("time,viscosity\n10:00,20.1\n11:00,20.4\n12:00,20.9\n")
    return path


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1400, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
    page = context.new_page()
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    console_errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "Copyedit QA")
    email = f"copyedit-{int(time.time() * 1000)}@example.com"
    page.fill("#signup-email", email)
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    console_errors.clear()  # the sign-in page's /api/auth/me probe answers 401 before the account exists
    dismiss(page)
    close_dock(page)

    # ------------------------------------------------------------------
    print("\n==== The full page, rules path (no model): Copy and Edit on every message ====")
    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_selector(f"{PAGE} textarea.assistant-input", timeout=30000)
    page.wait_for_timeout(500)
    dismiss(page)
    check("The server has no model: the status says so (the rules path)", page.locator(".mitra-status[data-state='offline']").count() == 1)
    send(page, PAGE, "hello")
    wait_count(page, f"{PAGE} .chat-msg.bot", 1)
    send(page, PAGE, "what is due today?")
    wait_count(page, f"{PAGE} .chat-msg.bot", 2)
    wait_gone(page, f"{PAGE} .chat-typing")
    page.wait_for_timeout(300)
    n_msgs = page.locator(f"{PAGE} .chat-msg").count()
    copies = page.locator(f"{PAGE} [data-action='copy-message']")
    edits = page.locator(f"{PAGE} [data-action='edit-message']")
    check("Four messages, each with Copy", n_msgs == 4 and copies.count() == 4, (n_msgs, copies.count()))
    check("Edit on the person's two messages only", edits.count() == 2 and page.locator(f"{PAGE} .mitra-turn.bot [data-action='edit-message']").count() == 0, edits.count())
    labels = [b.get_attribute("aria-label") for b in copies.all()] + [b.get_attribute("aria-label") for b in edits.all()]
    check("Every button is named for a screen reader (aria-label)", all(labels) and set(labels) == {"Copy message", "Edit message"}, labels)
    check("...and carries no visible words (nothing for a has-text('Edit') to meet)", all(not b.inner_text().strip() for b in copies.all() + edits.all()))
    check("...and sits outside the message's own words", page.locator(f"{PAGE} .chat-msg [data-action='copy-message']").count() == 0)

    print("\n==== Copy ====")
    stored = stored_active(page)
    reply = next((m for m in reversed(stored["messages"]) if m["role"] == "bot"), None) if stored else None
    page.locator(f"{PAGE} .mitra-turn.bot").last.locator("[data-action='copy-message']").click()
    page.wait_for_timeout(250)
    clip = page.evaluate("() => navigator.clipboard.readText()")
    check("Copy puts Mitra's reply on the clipboard, the words as written", reply is not None and clip == reply["text"], (clip[:120], reply["text"][:120] if reply else None))
    ticked = page.locator(f"{PAGE} [data-action='copy-message'][data-copied='yes']")
    check("...with a tick 'Copied' for a moment", ticked.count() == 1 and "Copied" in ticked.inner_text() and ticked.get_attribute("aria-label") == "Copied", ticked.count())
    page.wait_for_timeout(1900)
    check("...which goes again", page.locator(f"{PAGE} [data-action='copy-message'][data-copied]").count() == 0)
    user_turn(page, PAGE, "what is due today?").locator("[data-action='copy-message']").click()
    page.wait_for_timeout(250)
    check("Copy on the person's own message copies their words", page.evaluate("() => navigator.clipboard.readText()") == "what is due today?")

    print("\n==== Edit: the keyboard, Escape cancels ====")
    second = user_turn(page, PAGE, "what is due today?")
    second.locator("[data-action='edit-message']").focus()
    page.keyboard.press("Enter")
    page.wait_for_timeout(200)
    box = page.locator(f"{PAGE} .mitra-edit textarea.mitra-edit-input")
    check("Enter on Edit opens the message in place, with its words", box.count() == 1 and box.input_value() == "what is due today?", box.count())
    check("...the box has the focus", page.evaluate("() => document.activeElement && document.activeElement.classList.contains('mitra-edit-input')"))
    check("...with Save and Cancel", page.locator(f"{PAGE} .mitra-edit [data-action='save-edit']").count() == 1 and page.locator(f"{PAGE} .mitra-edit [data-action='cancel-edit']").count() == 1)
    check("...and the composer is untouched (still one textarea.input)", page.locator(f"{PAGE} textarea.input").count() == 1)
    page.keyboard.type(" and tomorrow")
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    check("Escape cancels: the box goes, the message is as it was", page.locator(f"{PAGE} .mitra-edit").count() == 0 and user_turn(page, PAGE, "what is due today?").count() == 1, texts(page, f"{PAGE} .chat-msg.user"))
    check("...and the focus is back on its Edit button", page.evaluate("() => document.activeElement && document.activeElement.getAttribute('data-action') === 'edit-message'"))
    check("...nothing was sent", page.locator(f"{PAGE} .chat-msg").count() == 4)

    print("\n==== Edit: Enter saves, and the rest of the thread is replaced ====")
    user_turn(page, PAGE, "hello").locator("[data-action='edit-message']").click()
    box = page.locator(f"{PAGE} .mitra-edit textarea.mitra-edit-input")
    box.fill("who are you?")
    box.press("Enter")
    wait_count(page, f"{PAGE} .chat-msg.bot", 1)
    page.wait_for_timeout(600)
    check("The edited message stands in place of the first", texts(page, f"{PAGE} .chat-msg.user") == ["who are you?"], texts(page, f"{PAGE} .chat-msg.user"))
    check("...answered anew, and everything after it is gone", page.locator(f"{PAGE} .chat-msg.bot").count() == 1 and "what is due today?" not in page.locator(f"{PAGE} .mitra-thread").inner_text(), texts(page, f"{PAGE} .chat-msg"))
    stored = stored_active(page)
    check(
        "The stored conversation holds the edited thread",
        stored is not None and [m["text"] for m in stored["messages"] if m["role"] == "user"] == ["who are you?"] and len(stored["messages"]) == 2,
        [(m["role"], m["text"][:40]) for m in stored["messages"]] if stored else None,
    )
    check("...and is named after the edited first message", stored is not None and stored["title"] == "who are you?", stored["title"] if stored else None)
    check("The focus is back in the composer", page.evaluate("() => document.activeElement && document.activeElement.classList.contains('assistant-input')"))

    print("\n==== Edit keeps the files of that turn (rules path) ====")
    csv_path = csv_file()
    page.set_input_files(f"{PAGE} input[data-input='files']", csv_path)
    wait_count(page, f"{PAGE} .mitra-composer .mitra-attachment[data-status='ready']", 1, 20000)
    send(page, PAGE, "what does this sheet say")
    wait_count(page, f"{PAGE} .chat-msg.bot", 2)
    wait_gone(page, f"{PAGE} .chat-typing")
    page.wait_for_timeout(500)
    name = os.path.basename(csv_path)
    sheet = user_turn(page, PAGE, "what does this sheet say")
    check("The message went with the file", sheet.locator(".mitra-attachment", has_text=name).count() == 1, sheet.count())
    sheet.locator("[data-action='edit-message']").click()
    check("The edit box shows the file it carries", page.locator(f"{PAGE} .mitra-edit .mitra-attachment", has_text=name).count() == 1)
    page.locator(f"{PAGE} .mitra-edit textarea.mitra-edit-input").fill("what does this sheet say about 11:00")
    page.locator(f"{PAGE} .mitra-edit [data-action='save-edit']").click()
    page.wait_for_timeout(1200)
    again = user_turn(page, PAGE, "what does this sheet say about 11:00")
    check("Save (clicked) sends it again, with the same file", again.count() == 1 and again.locator(".mitra-attachment", has_text=name).count() == 1 and user_turn(page, PAGE, "what does this sheet say").count() == 0, texts(page, f"{PAGE} .chat-msg.user"))
    stored = stored_active(page)
    kept = [m for m in (stored or {}).get("messages", []) if m["role"] == "user" and m["text"] == "what does this sheet say about 11:00"]
    check("...and the stored message keeps the file's name", len(kept) == 1 and [a["name"] for a in kept[0].get("attachments", [])] == [name], kept)

    print("\n==== A turn being answered cannot be edited; Stop (rules path) ====")
    page.route("**/api/assistant/chat", chat_hold_route)
    n_bot = page.locator(f"{PAGE} .chat-msg.bot").count()
    send(page, PAGE, "what is overdue?")
    try:
        page.wait_for_selector(f"{PAGE} [data-action='stop']", timeout=10000)
    except Exception:
        pass
    stop = page.locator(f"{PAGE} [data-action='stop']")
    check("While the answer is on its way, Stop stands where Send was", stop.count() == 1 and stop.is_visible() and not page.locator(f"{PAGE} button[aria-label='Send']").is_visible(), stop.count())
    check("...Stop is named for a screen reader", stop.get_attribute("aria-label") == "Stop the answer" if stop.count() else False)
    locked = page.locator(f"{PAGE} [data-action='edit-message']")
    check("...and every Edit waits", locked.count() >= 1 and all(b.is_disabled() for b in locked.all()), [b.is_disabled() for b in locked.all()])
    stop.click()
    page.wait_for_timeout(300)
    check("Stop ends the wait at once: 'Stopped.'", page.locator(f"{PAGE} .chat-msg.bot").last.inner_text().strip() == "Stopped." and page.locator(f"{PAGE} [data-action='stop']").count() == 0, page.locator(f"{PAGE} .chat-msg.bot").last.inner_text()[:80])
    check("...Send is back, and Edit is ready again", page.locator(f"{PAGE} button[aria-label='Send']").is_visible() and not any(b.is_disabled() for b in page.locator(f"{PAGE} [data-action='edit-message']").all()))
    n_after_stop = page.locator(f"{PAGE} .chat-msg.bot").count()
    check("...the server's answer was still on its way when Stop was pressed", len(HELD) == 1, len(HELD))
    for held in HELD:
        held.fulfill(status=200, json={"reply": "LATE ANSWER from the server", "action": "reply"})
    HELD.clear()
    page.unroute("**/api/assistant/chat")
    page.wait_for_timeout(1500)
    check("The answer that arrives after Stop is never shown", page.locator(f"{PAGE} .chat-msg", has_text="LATE ANSWER").count() == 0 and page.locator(f"{PAGE} .chat-msg.bot").count() == n_after_stop == n_bot + 1, (n_bot, n_after_stop, page.locator(f"{PAGE} .chat-msg.bot").count()))

    # ------------------------------------------------------------------
    print("\n==== The full page, agent path (model mocked) ====")
    page.route("**/api/auth/**", auth_route)
    page.route("**/api/assistant/agent", agent_route)
    page.reload()
    page.wait_for_selector(f"{PAGE} textarea.assistant-input", timeout=30000)
    page.wait_for_timeout(600)
    dismiss(page)
    check("The model is there (the agent path)", page.locator(".mitra-status[data-state='ready']").count() == 1)
    new_chat(page)
    send(page, PAGE, "first question")
    wait_count(page, f"{PAGE} .chat-msg.bot", 1)
    send(page, PAGE, "second question")
    wait_count(page, f"{PAGE} .chat-msg.bot", 2)
    page.wait_for_timeout(300)
    check("Two answers from the model", texts(page, f"{PAGE} .chat-msg.bot") == ["You said: first question", "You said: second question"], texts(page, f"{PAGE} .chat-msg.bot"))
    page.locator(f"{PAGE} .mitra-turn.bot").first.locator("[data-action='copy-message']").click()
    page.wait_for_timeout(250)
    check("Copy keeps a reply's markdown as text", page.evaluate("() => navigator.clipboard.readText()") == "You said: **first question**")
    before = len(REQUESTS)
    user_turn(page, PAGE, "first question").locator("[data-action='edit-message']").click()
    box = page.locator(f"{PAGE} .mitra-edit textarea.mitra-edit-input")
    box.fill("edited question")
    box.press("Enter")
    wait_count(page, f"{PAGE} .chat-msg.bot", 1)
    page.wait_for_timeout(800)
    check("The thread is the edited turn and its new answer", texts(page, f"{PAGE} .chat-msg.user") == ["edited question"] and texts(page, f"{PAGE} .chat-msg.bot") == ["You said: edited question"], texts(page, f"{PAGE} .chat-msg"))
    asked = REQUESTS[before:]
    check("The model is asked with the edited words", len(asked) == 1 and last_user_content(asked[0]) == "edited question", [last_user_content(b)[:60] for b in asked])
    history = json.dumps(asked[0].get("messages", [])) if asked else ""
    check("...and only the conversation before it (nothing from the replaced turns)", asked and "first question" not in history and "second question" not in history, history[:300])
    stored = stored_active(page)
    check("The stored conversation holds the edited thread", stored is not None and [(m["role"], m["text"]) for m in stored["messages"]] == [("user", "edited question"), ("bot", "You said: **edited question**")], [(m["role"], m["text"][:40]) for m in stored["messages"]] if stored else None)

    print("\n==== Save waits while a turn is answered; Stop (agent path) ====")
    user_turn(page, PAGE, "edited question").locator("[data-action='edit-message']").click()
    page.locator(f"{PAGE} .mitra-edit textarea.mitra-edit-input").fill("final question")
    before = len(REQUESTS)
    send(page, PAGE, "slowly, open the insights")
    try:
        page.wait_for_selector(f"{PAGE} [data-action='stop']", timeout=10000)
    except Exception:
        pass
    page.wait_for_timeout(300)
    save = page.locator(f"{PAGE} .mitra-edit [data-action='save-edit']")
    check("While the model is thinking, Save waits and says why", save.count() == 1 and save.is_disabled() and page.locator(f"{PAGE} .mitra-edit", has_text="Mitra is still answering").count() == 1, save.count())
    page.locator(f"{PAGE} .mitra-edit textarea.mitra-edit-input").press("Enter")
    page.wait_for_timeout(300)
    check("...Enter in the box does nothing yet", page.locator(f"{PAGE} .mitra-edit").count() == 1 and user_turn(page, PAGE, "slowly, open the insights").count() == 1)
    check("...the answer is pending, Stop is offered", page.locator(f"{PAGE} .mitra-thinking").count() == 1 and page.locator(f"{PAGE} [data-action='stop']").count() == 1)
    page.locator(f"{PAGE} [data-action='stop']").click()
    page.wait_for_timeout(300)
    check("Stop: the pending answer reads 'Stopped.'", page.locator(f"{PAGE} .mitra-thinking").count() == 0 and page.locator(f"{PAGE} .chat-msg.bot").last.inner_text().strip() == "Stopped.", page.locator(f"{PAGE} .chat-msg.bot").last.inner_text()[:80])
    check("...and Save is ready", not page.locator(f"{PAGE} .mitra-edit [data-action='save-edit']").is_disabled())
    n_requests = len(REQUESTS)
    check("...the model's answer was still on its way when Stop was pressed", len(HELD) == 1, len(HELD))
    for held in HELD:
        held.fulfill(json={"kind": "tools", "text": None, "calls": [tool_call("late1", "navigate", {"route": "/insights"})]})
    HELD.clear()
    page.wait_for_timeout(1500)
    check("The model's tool call, arriving after Stop, is never carried out", page.url.endswith("#/assistant") and len(REQUESTS) == n_requests, (page.url, len(REQUESTS), n_requests))
    stored = stored_active(page)
    stopped = [m for m in (stored or {}).get("messages", []) if m["role"] == "bot" and m["text"] == "Stopped."]
    check("...and the stored answer stays 'Stopped.', not pending", len(stopped) == 1 and not stopped[0].get("pending"), stopped)
    page.locator(f"{PAGE} .mitra-edit textarea.mitra-edit-input").press("Enter")
    wait_count(page, f"{PAGE} .chat-msg.bot", 1)
    page.wait_for_timeout(800)
    check("Now Enter saves: the edited turn replaces the rest, the stopped turn included", texts(page, f"{PAGE} .chat-msg.user") == ["final question"] and texts(page, f"{PAGE} .chat-msg.bot") == ["You said: final question"], texts(page, f"{PAGE} .chat-msg"))

    print("\n==== Edit keeps the files of that turn, their words too (agent path) ====")
    page.set_input_files(f"{PAGE} input[data-input='files']", csv_path)
    wait_count(page, f"{PAGE} .mitra-composer .mitra-attachment[data-status='ready']", 1, 20000)
    send(page, PAGE, "what does this sheet say")
    wait_count(page, f"{PAGE} .chat-msg.bot", 2)
    page.wait_for_timeout(500)
    before = len(REQUESTS)
    user_turn(page, PAGE, "what does this sheet say").locator("[data-action='edit-message']").click()
    page.locator(f"{PAGE} .mitra-edit textarea.mitra-edit-input").fill("what does this sheet say at 11:00")
    page.locator(f"{PAGE} .mitra-edit [data-action='save-edit']").click()
    wait_count(page, f"{PAGE} .chat-msg.bot", 2)
    page.wait_for_timeout(800)
    asked = REQUESTS[before:]
    content = last_user_content(asked[0]) if asked else ""
    check("The edited words go to the model with the file's words again", len(asked) == 1 and content.startswith("what does this sheet say at 11:00") and f"[Attachment 1: {name}" in content and "20.4" in content, content[:300])
    again = user_turn(page, PAGE, "what does this sheet say at 11:00")
    check("...the message shows the file", again.count() == 1 and again.locator(".mitra-attachment", has_text=name).count() == 1)
    check("...and the answer names it", page.locator(f"{PAGE} .chat-msg.bot").last.inner_text().startswith(f"I read {name}"), page.locator(f"{PAGE} .chat-msg.bot").last.inner_text()[:100])
    check("The composer was never touched by the edit", page.locator(f"{PAGE} .mitra-composer .mitra-attachment").count() == 0 and page.locator(f"{PAGE} textarea.assistant-input").input_value() == "")

    # ------------------------------------------------------------------
    print("\n==== The dock, agent path ====")
    page.goto(f"{BASE}/index.html#/dashboard")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(800)
    dismiss(page)
    if page.locator("[data-assistant='docked']").count() == 0:
        page.locator(".assistant-pill").first.click()
    page.wait_for_selector("[data-assistant='docked']", timeout=10000)
    page.wait_for_timeout(500)
    send(page, DOCK, "dock one")
    wait_count(page, f"{DOCK} .chat-msg.bot", 2)
    send(page, DOCK, "dock two")
    wait_count(page, f"{DOCK} .chat-msg.bot", 3)
    page.wait_for_timeout(400)
    dock_msgs = page.locator(f"{DOCK} .chat-msg").count()
    check("In the dock, every message has Copy", page.locator(f"{DOCK} [data-action='copy-message']").count() == dock_msgs, (dock_msgs, page.locator(f"{DOCK} [data-action='copy-message']").count()))
    check("...and the person's own have Edit", page.locator(f"{DOCK} [data-action='edit-message']").count() == 2)
    user_turn(page, DOCK, "dock two").locator("[data-action='edit-message']").click()
    page.locator(f"{DOCK} .mitra-edit textarea.mitra-edit-input").press("Escape")
    page.wait_for_timeout(200)
    check("Escape cancels in the dock, and leaves the dock open", page.locator(f"{DOCK} .mitra-edit").count() == 0 and page.locator("[data-assistant='docked']").count() == 1)
    before = len(REQUESTS)
    user_turn(page, DOCK, "dock one").locator("[data-action='edit-message']").click()
    box = page.locator(f"{DOCK} .mitra-edit textarea.mitra-edit-input")
    box.fill("dock edited")
    box.press("Enter")
    page.wait_for_timeout(1200)
    check("The dock's thread is cut back and answered anew", texts(page, f"{DOCK} .chat-msg.user") == ["dock edited"] and "You said: dock edited" in texts(page, f"{DOCK} .chat-msg.bot") and not any("dock two" in t or "dock one" in t for t in texts(page, f"{DOCK} .chat-msg")), texts(page, f"{DOCK} .chat-msg"))
    asked = REQUESTS[before:]
    check("...the model asked once, with the edited words and none of the replaced ones", len(asked) == 1 and last_user_content(asked[0]) == "dock edited" and "dock two" not in json.dumps(asked[0].get("messages", [])), [last_user_content(b)[:40] for b in asked])
    send(page, DOCK, "slowly please")
    try:
        page.wait_for_selector(f"{DOCK} [data-action='stop']", timeout=10000)
    except Exception:
        pass
    check("In the dock too, Edit waits while Mitra works, and Stop is offered", page.locator(f"{DOCK} [data-action='stop']").count() == 1 and all(b.is_disabled() for b in page.locator(f"{DOCK} [data-action='edit-message']").all()))
    page.locator(f"{DOCK} [data-action='stop']").click()
    page.wait_for_timeout(300)
    check("...Stop says so and frees the dock", page.locator(f"{DOCK} .chat-msg.bot").last.inner_text().strip() == "Stopped." and page.locator(f"{DOCK} [data-action='stop']").count() == 0 and not any(b.is_disabled() for b in page.locator(f"{DOCK} [data-action='edit-message']").all()), page.locator(f"{DOCK} .chat-msg.bot").last.inner_text()[:80])
    n_requests = len(REQUESTS)
    check("...the model's answer was still on its way when Stop was pressed", len(HELD) == 1, len(HELD))
    for held in HELD:
        held.fulfill(json={"kind": "tools", "text": None, "calls": [tool_call("late2", "navigate", {"route": "/insights"})]})
    HELD.clear()
    page.wait_for_timeout(1500)
    check("...and a tool call arriving after it is never carried out", "#/dashboard" in page.url and len(REQUESTS) == n_requests, page.url)

    # ------------------------------------------------------------------
    print("\n==== The dock, rules path (no model) ====")
    page.unroute("**/api/auth/**")
    page.unroute("**/api/assistant/agent")
    page.reload()
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(800)
    dismiss(page)
    if page.locator("[data-assistant='docked']").count() == 0:
        page.locator(".assistant-pill").first.click()
    page.wait_for_selector("[data-assistant='docked']", timeout=10000)
    page.wait_for_timeout(500)
    n_bot = page.locator(f"{DOCK} .chat-msg.bot").count()
    send(page, DOCK, "who are you?")
    wait_count(page, f"{DOCK} .chat-msg.bot", n_bot + 1)
    send(page, DOCK, "what can you do?")
    wait_count(page, f"{DOCK} .chat-msg.bot", n_bot + 2)
    page.wait_for_timeout(400)
    user_turn(page, DOCK, "who are you?").locator("[data-action='edit-message']").click()
    box = page.locator(f"{DOCK} .mitra-edit textarea.mitra-edit-input")
    box.fill("hello")
    box.press("Enter")
    page.wait_for_timeout(800)
    check("Without a model the dock's edit works the same: cut back and answered", texts(page, f"{DOCK} .chat-msg.user") == ["hello"] and page.locator(f"{DOCK} .chat-msg.bot").count() == n_bot + 1, texts(page, f"{DOCK} .chat-msg"))
    close_dock(page)

    # ------------------------------------------------------------------
    print("\n==== Copy without the async clipboard (the plant's plain-http address) ====")
    plain = context.new_page()
    plain.on("pageerror", lambda e: errors.append(str(e)))
    plain.add_init_script(
        """(() => {
             Object.defineProperty(Clipboard.prototype, 'writeText', { value: undefined, configurable: true });
             const select = HTMLTextAreaElement.prototype.select;
             HTMLTextAreaElement.prototype.select = function () { window.__selectedForCopy = this.value; return select.apply(this, arguments); };
             const exec = Document.prototype.execCommand;
             Document.prototype.execCommand = function (cmd) { const ok = exec.apply(this, arguments); if (cmd === 'copy') window.__execCopy = ok; return ok; };
           })();"""
    )
    plain.goto(f"{BASE}/index.html#/assistant")
    plain.wait_for_selector(f"{PAGE} textarea.assistant-input", timeout=30000)
    plain.wait_for_timeout(600)
    dismiss(plain)
    stored = stored_active(plain)
    reply = next((m for m in reversed((stored or {}).get("messages", [])) if m["role"] == "bot"), None)
    check("The page offers no async clipboard here", plain.evaluate("() => typeof navigator.clipboard.writeText") == "undefined")
    plain.locator(f"{PAGE} .mitra-turn.bot").last.locator("[data-action='copy-message']").click()
    plain.wait_for_timeout(300)
    check("Copy still copies: the reply's words selected and copied the old way", reply is not None and plain.evaluate("() => window.__selectedForCopy") == reply["text"] and plain.evaluate("() => window.__execCopy") is True, (plain.evaluate("() => window.__execCopy"), (plain.evaluate("() => window.__selectedForCopy") or "")[:80]))
    check("...with the tick", plain.locator(f"{PAGE} [data-action='copy-message'][data-copied='yes']").count() == 1)
    check("...and the hidden box is gone again", plain.evaluate("() => document.querySelectorAll('body > textarea').length") == 0)
    plain.close()

    os.remove(csv_path)
    unexpected = [e for e in console_errors if "Failed to load resource" not in e and "Stopped by the person" not in e]
    check("No JavaScript errors", not errors, errors[:5])
    check("No console errors besides the resources the rules path expects to fail", not unexpected, unexpected[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nCopy and Edit work in Mitra's chat as in Claude: on the page and in the dock, with and without the model.")
