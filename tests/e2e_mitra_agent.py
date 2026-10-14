"""Ask Mitra as an agent (REQUIREMENTS s80): the model decides, the browser does.

Asked for on 26-Sep-2026: Mitra should work like a chat assistant that can be
told anything - with files, folders and pictures attached, in English,
Gujarati or a mix - and DO it through the API rather than through the fixed
keyword rules, asking when an instruction is unclear.

Network-independent: the model is mocked at the browser's network edge
(POST /api/assistant/agent answers with canned tool calls and final words, in
OpenAI's function-calling shapes, the way ChatGPT answers through
backend/mitraAgent.ts and backend/ai.ts since REQUIREMENTS s109; the server's
own request to api.openai.com is stood in for by backend/tests/ai.test.ts), and
the server's "assistant configured" flag is switched on in the auth answers, so
the agent path runs without a key. Checked against the production build on :8842:

  * an instruction becomes a tool call the browser carries out - "open insights"
    navigates, shows the step as done, and the final words are rendered (bold);
  * an unclear instruction comes back as a question with options (ask_user);
    tapping one sends it as the next message;
  * a file attached to the composer is read on the server (POST /api/assistant/
    extract) and its text travels inside the user's message;
  * Gujarati in, Gujarati out - the words reach the model untouched, and the
    answer's script is shown as it came;
  * when the model fails, the app still answers (the local path, s72);
  * on an open record the agent's edit_open_record tool changes the sheet
    exactly as a person's words would, with the step shown;
  * every request the browser sent is in OpenAI's chat shapes (s109): the
    server hands its tools and messages to ChatGPT as they are;
  * Mitra adds, changes and deletes anything in any record (s113): on a free
    sheet a line is added at once and listed back with Undo (which takes off
    exactly that line), a deletion is asked first in the line's own words
    (No keeps it, Yes takes it off), a clear of a written value is asked
    first too; F/HR/17 gets a rodent catch; a CAPA finding and a training
    attendee are added through the same tool after open_document opened the
    record;
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

BASE = "http://localhost:8842"
PASSWORD = "PlaywrightQA123"
FAILURES = []
REQUESTS = []  # every body POSTed to /api/assistant/agent, in order


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
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(200)


def tool_call(call_id, name, args):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


GUJARATI = re.compile(r"[઀-૿]")
FAIL_MODE = {"on": False}


def agent_route(route):
    """The model, canned: tool calls for an instruction, words once the tool answered."""
    body = route.request.post_data_json or {}
    REQUESTS.append(body)
    if FAIL_MODE["on"]:
        route.fulfill(status=502, json={"error": "The assistant is having trouble right now — try again in a moment."})
        return
    msgs = body.get("messages", [])
    last = msgs[-1] if msgs else {}
    if last.get("role") == "tool":
        # Which tool was it? The assistant message before the tool results names it.
        asked = next((m for m in reversed(msgs) if m.get("role") == "assistant" and m.get("tool_calls")), {})
        name = (asked.get("tool_calls") or [{}])[0].get("function", {}).get("name", "")
        result = {}
        try:
            result = json.loads(last.get("content") or "{}")
        except Exception:
            pass
        if name == "navigate":
            route.fulfill(json={"kind": "final", "text": "Opened **Insights** for you — what stands out is at the top."})
        elif name == "edit_open_record":
            route.fulfill(json={"kind": "final", "text": f"Done — viscosity at 14:00 is now 20.4. Tool said ok={result.get('ok')}."})
        else:
            route.fulfill(json={"kind": "final", "text": "Done."})
        return
    text = (last.get("content") or "") if last.get("role") == "user" else ""
    low = text.lower()
    if "insights" in low:
        route.fulfill(json={"kind": "tools", "text": None, "calls": [tool_call("c1", "navigate", {"route": "/insights"})]})
    elif "register" in low and "[attachment" not in low:
        route.fulfill(
            json={
                "kind": "tools",
                "text": None,
                "calls": [tool_call("c2", "ask_user", {"question": "Which register do you mean?", "options": ["Daily Pest Monitoring (F/HR/17)", "Fly Catcher (F/HR/18)"]})],
            }
        )
    elif "[attachment" in low:
        m = re.search(r"\[attachment 1: ([^\]]+)\]", text, re.I)
        route.fulfill(json={"kind": "final", "text": f"I read {m.group(1) if m else 'the file'}: the sheet lists viscosity readings 20.1, 20.4 and 20.9."})
    elif GUJARATI.search(text):
        route.fulfill(json={"kind": "final", "text": "હા, આજનું Daily Pest Control Monitoring Record (F/HR/17) ખોલું છું."})
    # REQUIREMENTS s113: the four operations on a record's lines, in the patch shapes the schema gives the model.
    elif "add a line" in low:
        route.fulfill(json={"kind": "tools", "text": None, "calls": [tool_call("c4", "edit_open_record", {"patch": {"addItems": {"rows": [{"time": "10:30", "viscosity": 20.4, "checkedBy": "Jeni"}]}}})]})
    elif "delete line 4" in low:
        route.fulfill(json={"kind": "tools", "text": None, "calls": [tool_call("c5", "edit_open_record", {"patch": {"removeItems": {"rows": [4]}}})]})
    elif "clear line 4" in low:
        route.fulfill(json={"kind": "tools", "text": None, "calls": [tool_call("c6", "edit_open_record", {"patch": {"clearItems": {"rows": [{"row": 4, "keys": ["viscosity"]}]}}})]})
    elif "rodent" in low:
        route.fulfill(json={"kind": "tools", "text": None, "calls": [tool_call("c7", "edit_open_record", {"patch": {"addItems": {"rodentCatches": [{"trapBoxNo": "RB-27", "location": "Canteen", "count": 1}]}}})]})
    elif "open a new internal capa" in low:
        route.fulfill(json={"kind": "tools", "text": None, "calls": [tool_call("c8", "open_document", {"documentId": "gap-inspection", "create": True})]})
    elif "add a finding" in low:
        route.fulfill(json={"kind": "tools", "text": None, "calls": [tool_call("c9", "edit_open_record", {"patch": {"addItems": {"findings": [{"findingOfInspection": "Gap under the store door"}]}}})]})
    elif "open a new training record" in low:
        route.fulfill(json={"kind": "tools", "text": None, "calls": [tool_call("c10", "open_document", {"documentId": "training-record", "create": True})]})
    elif "attended" in low:
        route.fulfill(json={"kind": "tools", "text": None, "calls": [tool_call("c11", "edit_open_record", {"patch": {"addItems": {"attendees": [{"employeeName": "Rahul Patel"}]}}})]})
    elif "viscosity" in low:
        route.fulfill(
            json={
                "kind": "tools",
                "text": None,
                "calls": [tool_call("c3", "edit_open_record", {"patch": {"itemEdits": [{"collection": "rows", "match": {"time": "14:00"}, "set": {"viscosity": 20.4}}]}})],
            }
        )
    else:
        route.fulfill(json={"kind": "final", "text": f"You said: {text[:80]}"})


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


def last_user_content(body):
    for m in reversed(body.get("messages", [])):
        if m.get("role") == "user":
            return m.get("content") or ""
    return ""


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.route("**/translate_a/**", lambda route: route.abort())
    page.route("**/api/auth/**", auth_route)
    page.route("**/api/assistant/agent", agent_route)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector("text=Sign up", timeout=60000)
    page.wait_for_timeout(800)
    page.click("text=Sign up")
    page.wait_for_selector("#signup-name", timeout=30000)
    page.fill("#signup-name", "Agent QA")
    page.fill("#signup-email", f"agent-{int(time.time() * 1000)}@example.com")
    page.fill("#signup-password", PASSWORD)
    page.fill("#signup-confirm", PASSWORD)
    page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)

    print("\n==== The full-page Ask Mitra: an instruction becomes a tool call ====")
    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_selector(".assistant-page", timeout=30000)
    page.wait_for_timeout(600)
    dismiss(page)
    composer = page.locator(".assistant-page textarea.assistant-input")
    check("The new interface is there: composer, attach button, microphone, send", composer.count() == 1 and page.locator(".assistant-page [data-action='attach']").count() == 1 and page.locator(".assistant-page [data-action='voice']").count() == 1 and page.locator(".assistant-page [data-action='send']").count() == 1)
    composer.fill("open insights")
    page.locator(".assistant-page [data-action='send']").click()
    # The navigate tool leaves the page itself, so the step is looked for on the
    # conversation once back on it (below); here, that the person was taken there.
    try:
        page.wait_for_function("() => location.hash === '#/insights'", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(1500)
    check("The model's navigate call is carried out: the person is on Insights", page.url.endswith("#/insights"), page.url)
    check("The request carried the tools and the words", len(REQUESTS) >= 2 and isinstance(REQUESTS[0].get("tools"), list) and len(REQUESTS[0]["tools"]) >= 8 and "open insights" in last_user_content(REQUESTS[0]), (len(REQUESTS), len(REQUESTS[0].get("tools", [])) if REQUESTS else None))
    check("...and the tool's result went back to the model", any(m.get("role") == "tool" for m in REQUESTS[1].get("messages", [])) if len(REQUESTS) >= 2 else False)

    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_selector(".assistant-page textarea.assistant-input", timeout=30000)
    page.wait_for_timeout(500)
    dismiss(page)
    check("...and the step is kept on the conversation, shown as finished, after the page it left", page.locator(".mitra-step[data-tool='navigate'][data-status='done']").count() >= 1, page.locator(".mitra-step").all_inner_texts())
    final = page.locator(".assistant-page .chat-msg.bot", has_text="Insights")
    check("The final words are rendered, bold and all", final.count() >= 1 and final.last.locator("strong").count() >= 1, final.last.inner_text() if final.count() else None)

    print("\n==== An unclear instruction is asked about, not guessed ====")
    before = len(REQUESTS)
    page.locator(".assistant-page textarea.assistant-input").fill("fill the register")
    page.locator(".assistant-page [data-action='send']").click()
    try:
        page.wait_for_selector(".mitra-options .chat-chip[data-option]", timeout=15000)
    except Exception:
        pass
    options = page.locator(".mitra-options .chat-chip[data-option]")
    check("Mitra asks which register, with the two as options", options.count() == 2 and "Which register" in page.locator(".assistant-page .chat-msg.bot").last.inner_text(), (options.count(), page.locator(".assistant-page .chat-msg.bot").last.inner_text()[:120]))
    if options.count():
        options.first.click()
        page.wait_for_timeout(1200)
    sent = [b for b in REQUESTS[before:] if "Daily Pest Monitoring (F/HR/17)" in last_user_content(b)]
    check("Tapping an option sends it as the next message, with the question in the history", len(sent) >= 1 and any(m.get("role") == "assistant" for m in sent[0].get("messages", [])), [last_user_content(b)[:60] for b in REQUESTS[before:]])

    print("\n==== A file attached is read and travels with the words ====")
    fd, csv_path = tempfile.mkstemp(suffix=".csv", prefix="viscosity-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("time,viscosity\n10:00,20.1\n11:00,20.4\n12:00,20.9\n")
    before = len(REQUESTS)
    page.set_input_files("input[data-input='files']", csv_path)
    try:
        page.wait_for_selector(".mitra-attachment[data-status='ready']", timeout=20000)
    except Exception:
        pass
    att = page.locator(".mitra-attachment")
    check("The CSV shows as an attachment, read on the server", att.count() == 1 and att.first.get_attribute("data-status") == "ready", (att.count(), att.first.get_attribute("data-status") if att.count() else None, att.first.inner_text() if att.count() else None))
    page.locator(".assistant-page textarea.assistant-input").fill("what does this sheet say")
    page.locator(".assistant-page [data-action='send']").click()
    page.wait_for_timeout(1500)
    with_file = [b for b in REQUESTS[before:] if "[Attachment 1:" in last_user_content(b)]
    check("The file's text is inside the user's message to the model", len(with_file) == 1 and "20.4" in last_user_content(with_file[0]) and "viscosity" in last_user_content(with_file[0]).lower(), last_user_content(with_file[0])[:300] if with_file else [last_user_content(b)[:80] for b in REQUESTS[before:]])
    check("...and the composer is clear of it afterwards", page.locator(".mitra-composer .mitra-attachment").count() == 0)
    check("...the answer names the file", page.locator(".assistant-page .chat-msg.bot", has_text="I read").count() >= 1)
    os.remove(csv_path)

    print("\n==== Gujarati in, Gujarati out ====")
    before = len(REQUESTS)
    page.locator(".assistant-page textarea.assistant-input").fill("આજનું daily record ખોલો")
    page.locator(".assistant-page [data-action='send']").click()
    page.wait_for_timeout(1500)
    gu = [b for b in REQUESTS[before:] if GUJARATI.search(last_user_content(b))]
    check("The Gujarati words reach the model as typed", len(gu) >= 1 and "daily record" in last_user_content(gu[0]), [last_user_content(b)[:60] for b in REQUESTS[before:]])
    check("...and the answer is shown in Gujarati script", GUJARATI.search(page.locator(".assistant-page .chat-msg.bot").last.inner_text()) is not None, page.locator(".assistant-page .chat-msg.bot").last.inner_text()[:120])

    print("\n==== When the model fails, the app still answers ====")
    FAIL_MODE["on"] = True
    n_bot = page.locator(".assistant-page .chat-msg.bot").count()
    page.locator(".assistant-page textarea.assistant-input").fill("hello there")
    page.locator(".assistant-page [data-action='send']").click()
    page.wait_for_timeout(2500)
    check("A failing model still gets the person an answer (the app's own, s72)", page.locator(".assistant-page .chat-msg.bot").count() > n_bot, page.locator(".assistant-page .chat-msg.bot").last.inner_text()[:120])
    FAIL_MODE["on"] = False

    print("\n==== On an open record, the agent changes the sheet ====")
    page.goto(f"{BASE}/index.html#/document/qc-viscosity")
    page.wait_for_selector("[data-action='document-new-record']", timeout=30000)
    page.wait_for_timeout(500)
    dismiss(page)
    page.locator("[data-action='document-new-record']").first.click()
    page.wait_for_timeout(1500)
    dismiss(page)
    pill = page.locator(".assistant-pill")
    if pill.count():
        pill.first.click()
        page.wait_for_selector("[data-assistant='docked']", timeout=10000)
    page.wait_for_timeout(500)
    before = len(REQUESTS)
    dock_input = page.locator(".assistant-dock textarea.input")
    check("The dock has the same composer (attach, voice, send)", dock_input.count() == 1 and page.locator(".assistant-dock [data-action='attach']").count() == 1 and page.locator(".assistant-dock button[aria-label='Send']").count() == 1)
    dock_input.fill("14:00 viscosity is 20.4")
    page.locator(".assistant-dock button[aria-label='Send']").click()
    try:
        page.wait_for_selector(".assistant-dock .mitra-step[data-tool='edit_open_record'][data-status='done']", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(800)
    check("The edit tool ran on the open record and is shown as done", page.locator(".assistant-dock .mitra-step[data-tool='edit_open_record'][data-status='done']").count() == 1, page.locator(".assistant-dock .mitra-step").all_inner_texts())
    check("The request told the model a record was open", len(REQUESTS) > before and "qc-viscosity" in (REQUESTS[before].get("context") or ""), (REQUESTS[before].get("context") or "")[:200] if len(REQUESTS) > before else None)
    stored = page.evaluate(
        """() => { const rs = JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').filter((r) => r.documentId === 'qc-viscosity' && !r.isDemo);
             rs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)); const r = rs[0]; if (!r) return null;
             const row = (r.data.rows || []).find((x) => x.time === '14:00'); return { viscosity: row ? row.viscosity : null, history: (r.historyEntries || []).length }; }"""
    )
    check("...and the sheet now reads 20.4 at 14:00", stored is not None and stored["viscosity"] == 20.4, stored)
    check("...and the final words are shown in the dock", page.locator(".assistant-dock .chat-msg.bot", has_text="20.4").count() >= 1)

    # ---- REQUIREMENTS s113: Mitra adds, changes and deletes anything in any record ------------------------------
    def open_dock():
        pill = page.locator(".assistant-pill")
        if pill.count():
            pill.first.click()
            page.wait_for_selector("[data-assistant='docked']", timeout=10000)
        page.wait_for_timeout(400)

    def dock_say(words, wait_for=None):
        page.locator(".assistant-dock textarea.input").fill(words)
        page.locator(".assistant-dock button[aria-label='Send']").click()
        if wait_for:
            try:
                page.wait_for_selector(wait_for, timeout=15000)
            except Exception:
                pass
        page.wait_for_timeout(800)

    def stored_record(document_id):
        return page.evaluate(
            """(documentId) => { const rs = JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').filter((r) => r.documentId === documentId && !r.isDemo);
                 rs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)); return rs[0] ? { id: rs[0].id, data: rs[0].data, history: (rs[0].historyEntries || rs[0].history || []).length } : null; }""",
            document_id,
        )

    def dock_chip(label):
        return page.locator(".assistant-dock .chat-chip", has_text=label)

    print("\n==== A free sheet: add a line (Undo), delete a line after its confirmation, clear a value ====")
    page.goto(f"{BASE}/index.html#/document/qc-adhesive-mixing")
    page.wait_for_selector("[data-action='document-new-record']", timeout=30000)
    page.wait_for_timeout(500)
    dismiss(page)
    page.locator("[data-action='document-new-record']").first.click()
    page.wait_for_timeout(1500)
    dismiss(page)
    open_dock()
    before_rows = len((stored_record("qc-adhesive-mixing") or {"data": {"rows": []}})["data"]["rows"])
    dock_say("add a line 10:30 viscosity 20.4 Jeni", ".assistant-dock .mitra-step[data-tool='edit_open_record'][data-status='done']")
    rec = stored_record("qc-adhesive-mixing")
    rows = rec["data"]["rows"] if rec else []
    check("The line is added at once, holding only what was said", len(rows) == before_rows + 1 and rows[-1]["time"] == "10:30" and rows[-1]["viscosity"] == 20.4 and rows[-1]["checkedBy"] == "Jeni" and not rows[-1].get("remark"), rows[-1] if rows else rec)
    added_id = rows[-1]["id"] if rows else None
    check("...and is listed back with an Undo chip", page.locator(".assistant-dock .chat-msg.bot", has_text="10:30").count() >= 1 and page.locator(".assistant-dock .chat-chip[data-chip='undoLines']").count() == 1, page.locator(".assistant-dock .chat-msg.bot").last.inner_text()[:160])
    check("No question was asked for an added line", dock_chip("Yes, delete it").count() == 0 and dock_chip("Yes, clear it").count() == 0)
    page.locator(".assistant-dock .chat-chip[data-chip='undoLines']").first.click()
    page.wait_for_timeout(800)
    rows = (stored_record("qc-adhesive-mixing") or {"data": {"rows": []}})["data"]["rows"]
    check("Undo takes off exactly that line, by id", len(rows) == before_rows and all(r["id"] != added_id for r in rows), [r.get("id") for r in rows])

    dock_say("add a line 10:30 viscosity 20.4 Jeni", ".assistant-dock .mitra-step[data-tool='edit_open_record'][data-status='done']")
    rows = (stored_record("qc-adhesive-mixing") or {"data": {"rows": []}})["data"]["rows"]
    check("Added again for the deletion", len(rows) == before_rows + 1, len(rows))
    line_no = len(rows)
    dock_say(f"delete line {line_no}", ".assistant-dock .chat-chip")
    question = page.locator(".assistant-dock .chat-msg.bot").last.inner_text()
    check("A deletion is asked first, in the line's own words, as chips", dock_chip("Yes, delete it").count() == 1 and dock_chip("No, keep it").count() == 1 and re.search(rf"Delete line {line_no} \(.*10:30.*20\.4.*Jeni\) from", question) is not None, question[:200])
    dock_chip("No, keep it").first.click()
    page.wait_for_timeout(1200)
    rows = (stored_record("qc-adhesive-mixing") or {"data": {"rows": []}})["data"]["rows"]
    check("No: the line stays", len(rows) == line_no, len(rows))
    dock_say(f"delete line {line_no}", ".assistant-dock .chat-chip")
    if dock_chip("Yes, delete it").count():
        dock_chip("Yes, delete it").first.click()
        page.wait_for_timeout(1500)
    rec = stored_record("qc-adhesive-mixing")
    rows = rec["data"]["rows"] if rec else []
    check("Yes: the line is gone, and nothing else", len(rows) == before_rows and all(r.get("time") != "10:30" for r in rows), [r.get("time") for r in rows])

    dock_say("add a line 10:30 viscosity 20.4 Jeni", ".assistant-dock .mitra-step[data-tool='edit_open_record'][data-status='done']")
    rows = (stored_record("qc-adhesive-mixing") or {"data": {"rows": []}})["data"]["rows"]
    line_no = len(rows)
    dock_say(f"clear line {line_no}", ".assistant-dock .chat-chip")
    question = page.locator(".assistant-dock .chat-msg.bot").last.inner_text()
    check("A clear of a written value is asked first, naming the value and the line", dock_chip("Yes, clear it").count() == 1 and dock_chip("No, leave it").count() == 1 and re.search(rf"Clear 20\.4 from line {line_no} \(10:30\) on", question) is not None, question[:200])
    dock_chip("Yes, clear it").first.click()
    page.wait_for_timeout(1500)
    rows = (stored_record("qc-adhesive-mixing") or {"data": {"rows": []}})["data"]["rows"]
    check("Yes: the value is blank, the line stays", len(rows) == line_no and rows[-1]["viscosity"] is None and rows[-1]["time"] == "10:30", rows[-1] if rows else None)

    print("\n==== F/HR/17: a rodent catch added ====")
    page.goto(f"{BASE}/index.html#/document/daily-pest-monitoring")
    page.wait_for_selector("[data-action='document-new-record']", timeout=30000)
    page.wait_for_timeout(500)
    dismiss(page)
    page.locator("[data-action='document-new-record']").first.click()
    page.wait_for_timeout(1500)
    dismiss(page)
    open_dock()
    dock_say("a rodent was caught in RB-27 at the canteen", ".assistant-dock .mitra-step[data-tool='edit_open_record'][data-status='done']")
    rec = stored_record("daily-pest-monitoring")
    catches = (rec or {"data": {}})["data"].get("rodentCatches") or []
    check("The catch is on F/HR/17: trap box, location and count as said", len(catches) == 1 and catches[0]["trapBoxNo"] == "RB-27" and catches[0]["location"] == "Canteen" and catches[0]["count"] == 1, catches)
    check("...listed back with Undo", page.locator(".assistant-dock .chat-chip[data-chip='undoLines']").count() == 1)

    print("\n==== A CAPA finding and a training attendee, through the same tool ====")
    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_selector(".assistant-page textarea.assistant-input", timeout=30000)
    page.wait_for_timeout(500)
    dismiss(page)
    page.locator(".assistant-page textarea.assistant-input").fill("open a new internal capa")
    page.locator(".assistant-page [data-action='send']").click()
    try:
        page.wait_for_function("() => /#\\/gap\\/rec/.test(location.hash)", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(1200)
    check("open_document with create opens a new inspection findings report", re.search(r"#/gap/rec", page.url) is not None, page.url)
    dismiss(page)
    open_dock()
    before_findings = len(((stored_record("gap-inspection") or {"data": {}})["data"].get("findings") or []))
    dock_say("add a finding: gap under the store door", ".assistant-dock .mitra-step[data-tool='edit_open_record'][data-status='done']")
    findings = ((stored_record("gap-inspection") or {"data": {}})["data"].get("findings") or [])
    check("The finding is added with the next number and only what was said", len(findings) == before_findings + 1 and findings[-1]["findingOfInspection"] == "Gap under the store door" and int(findings[-1].get("sNo") or 0) >= 1, findings[-1] if findings else None)

    page.goto(f"{BASE}/index.html#/assistant")
    page.wait_for_selector(".assistant-page textarea.assistant-input", timeout=30000)
    page.wait_for_timeout(500)
    dismiss(page)
    page.locator(".assistant-page textarea.assistant-input").fill("open a new training record")
    page.locator(".assistant-page [data-action='send']").click()
    try:
        page.wait_for_function("() => /#\\/training\\/rec/.test(location.hash)", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(1200)
    check("open_document with create opens a new training record", re.search(r"#/training/rec", page.url) is not None, page.url)
    dismiss(page)
    open_dock()
    dock_say("Rahul Patel attended", ".assistant-dock .mitra-step[data-tool='edit_open_record'][data-status='done']")
    attendees = ((stored_record("training-record") or {"data": {}})["data"].get("attendees") or [])
    check("The attendee is added with the name only (s98: no department nobody gave)", len(attendees) >= 1 and attendees[-1]["employeeName"] == "Rahul Patel" and not attendees[-1].get("department"), attendees[-1] if attendees else None)

    def openai_shapes(body):
        """What is not in OpenAI's chat shapes in one request (s109: the server hands these to ChatGPT as they are)."""
        wrong = []
        for t in body.get("tools") or []:
            fn = t.get("function") or {}
            if t.get("type") != "function" or not isinstance(fn.get("name"), str) or not isinstance(fn.get("description"), str) or not isinstance(fn.get("parameters"), dict):
                wrong.append(("tool", t))
        for m in body.get("messages") or []:
            role = m.get("role")
            if role == "user" and isinstance(m.get("content"), str):
                continue
            if role == "tool" and isinstance(m.get("tool_call_id"), str) and isinstance(m.get("content"), str):
                continue
            if role == "assistant" and (m.get("content") is None or isinstance(m.get("content"), str)):
                calls = m.get("tool_calls") or []
                if all(isinstance(c.get("id"), str) and c.get("type") == "function" and isinstance((c.get("function") or {}).get("name"), str) and isinstance((c.get("function") or {}).get("arguments"), str) for c in calls):
                    continue
            wrong.append(("message", m))
        return wrong

    misshapen = [w for b in REQUESTS for w in openai_shapes(b)]
    check(f"Every request the browser sent ({len(REQUESTS)}) is in OpenAI's chat shapes: function tools, user / assistant / tool messages, calls with string arguments", len(REQUESTS) >= 6 and not misshapen, misshapen[:3])

    check("No JavaScript errors", not errors, errors[:5])
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nMitra works as an agent: the model decides, the browser does, and the person is asked when it is unclear.")
