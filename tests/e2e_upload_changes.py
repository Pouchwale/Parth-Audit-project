"""Upload changes: an edited Excel/Word file read back into its record (REQUIREMENTS s81).

The plant asked (27-Sep-2026): "add options for user in each and every document
of every module so he can upload the Word or Excel with whatever changes user
has done in that document." Beside every Download Excel / Download Word there is
now Upload changes (components/common/UploadChanges.tsx): the file is read in
the browser (engine/roundTrip/readFile.ts), compared with what was downloaded
(engine/roundTrip/plan.ts), the changes are shown box by box, and Apply writes
exactly those (engine/roundTrip/applyImport.ts), each with an "imported" line in
the record's history; a signed-off record is reopened for correction first.

Checked here, against the production build on :8842, with no network:

  * EVERY document the library can start a record of, whose record page offers
    a Word or Excel download: started (or today's opened), filled with sample
    data through Mitra's words, downloaded, edited in Python the way Excel or
    Word saves an edit (Excel: one bound cell's text typed over, found through
    the hidden _dcrs map sheet - and on some documents every inline string moved
    into a shared-strings table, as Excel does on save; Word: the text of one
    "dcrs:" content control typed over, split into two runs, as Word does),
    uploaded through the file chooser - the preview lists exactly that one box,
    Apply writes it, and the stored record holds the new value at the map's
    path with an "imported" history line naming the file;
  * a date typed into Excel as a serial number is stored as the date;
  * a line typed under a free-row log sheet's grid becomes a new row;
  * a verified record: the preview says it will be reopened for correction,
    Apply reopens it (the reason recorded) and changes it;
  * a file of another document is refused, nothing changed;
  * an Excel file this system never wrote (no map) is refused with the plain
    message, and so is a zip that is not an Office file;
  * no JavaScript errors.

A document whose record page offers no Word/Excel download, or whose sample
fill is not offered, is skipped and listed - not failed. The every-document pass
stops starting new documents after LOOP_BUDGET_S so the suite stays near 12
minutes; anything not reached is listed.
"""
import json
import os
import re
import sys
import tempfile
import time
import zipfile
from datetime import date, timedelta
from urllib.parse import unquote
from xml.sax.saxutils import escape
import xml.etree.ElementTree as ET

from playwright.sync_api import sync_playwright

# A failure detail can carry the plant's own Gujarati or a typographic dash,
# which a Windows console's default code page cannot encode.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
EMAIL = "upload-suite@example.com"
NAME = "Upload QA"
PASSWORD = "PlaywrightQA123"
FAILURES = []
TMP = tempfile.mkdtemp(prefix="upload-changes-")
# The every-document pass starts no new document after this many seconds.
LOOP_BUDGET_S = 560
EDITABLE = ("Scheduled", "Due", "In Progress")
MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
SSML = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
SHARED_STRINGS_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"
SHARED_STRINGS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings"
DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
MISSING = object()
# A box whose words a person would retype: tried first.
REMARK_LIKE = re.compile(r"remark|comment|note|observ|descr|detail|reason|finding|action|summary", re.I)


def check(label, cond, detail=None):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:900])
    return bool(cond)


def settle_briefing(page):
    """Today's briefing slots marked as shown, so it cannot open part way through and take a click."""
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
            try:
                g.first.click(timeout=2000)
            except Exception:
                pass
            page.wait_for_timeout(200)
    settle_briefing(page)


def close_assistant(page):
    btn = page.locator("button[aria-label='Close assistant']")
    if btn.count():
        try:
            btn.first.click(timeout=2000)
        except Exception:
            pass
        page.wait_for_timeout(150)


def sign_in(page):
    """A fixed account, made the first time only (the server caps new accounts per network)."""
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(500)
    if page.locator(".app-sidebar").count() == 0:
        page.fill("#login-email", EMAIL)
        page.fill("#login-password", PASSWORD)
        page.click("button:has-text('Log In')")
        page.wait_for_timeout(1500)
        if page.locator(".app-sidebar").count() == 0:
            page.click("text=Sign up")
            page.wait_for_timeout(300)
            page.fill("#signup-name", NAME)
            page.fill("#signup-email", EMAIL)
            page.fill("#signup-password", PASSWORD)
            page.fill("#signup-confirm", PASSWORD)
            page.click("button:has-text('Create Account')")
    page.wait_for_selector(".app-sidebar", timeout=30000)
    page.wait_for_timeout(1200)
    dismiss(page)


def go(page, route):
    """Moves within the app by its hash - no reload."""
    page.evaluate("(r) => { if (location.hash !== r) location.hash = r; }", route)


def current_hash(page):
    return page.evaluate("() => location.hash")


def stored_record(page, rid):
    """One record from the browser's working copy (never the whole list: a year of records is megabytes)."""
    return page.evaluate(
        "(id) => (JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]')).find((r) => r.id === id) || null",
        rid,
    )


def composer(page):
    dock = page.locator(".assistant-dock textarea")
    if dock.count():
        return dock.first
    return page.locator("button[aria-label='Send']").locator("xpath=preceding-sibling::textarea").first


def say(page, text, timeout_ms=8000):
    """Type an instruction to Mitra and return the reply (waits for a new bot message, not a fixed time)."""
    opener = page.locator("button:has-text('Ask Mitra')")
    if opener.count():
        try:
            opener.first.click(timeout=3000)
        except Exception:
            pass
        page.wait_for_timeout(250)
    before = page.locator(".chat-msg.bot").count()
    box = composer(page)
    box.fill(text)
    box.press("Enter")
    try:
        page.wait_for_function("(n) => document.querySelectorAll('.chat-msg.bot').length > n", arg=before, timeout=timeout_ms)
    except Exception:
        pass
    page.wait_for_timeout(350)
    bots = page.locator(".chat-msg.bot")
    return bots.last.inner_text() if bots.count() else ""


# ---------------------------------------------------------------------------
# paths (engine/roundTrip/bindPath.ts's grammar)


def js_str(v):
    """String(v) as JavaScript writes it - how an @key=value segment matches an item."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def get_at_path(data, path):
    at = data
    for raw in path.split("/"):
        if raw == "":
            return MISSING
        if raw.startswith("@"):
            body = raw[1:]
            if "=" in body:
                k, v = body.split("=", 1)
                key, value = unquote(k), unquote(v)
            else:
                key, value = "id", unquote(body)
            if not isinstance(at, list):
                return MISSING
            found = MISSING
            for item in at:
                if isinstance(item, dict) and item.get(key) is not None and js_str(item[key]) == value:
                    found = item
                    break
            if found is MISSING:
                return MISSING
            at = found
        elif re.fullmatch(r"[0-9]+", raw):
            n = int(raw)
            if not isinstance(at, list) or n >= len(at):
                return MISSING
            at = at[n]
        else:
            key = unquote(raw)
            if not isinstance(at, dict) or key not in at:
                return MISSING
            at = at[key]
    return at


def value_matches(actual, expected):
    if actual is MISSING or actual is None:
        return False
    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
        try:
            return abs(float(actual) - float(expected)) < 1e-6
        except (TypeError, ValueError):
            return False
    return isinstance(actual, str) and actual.strip() == expected


# ---------------------------------------------------------------------------
# the file as a zip of parts


def read_parts(path):
    parts = {}
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            parts[info.filename] = z.read(info.filename)
    return parts


def write_parts(path, parts):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # Saved compressed, as Excel and Word save.
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in parts.items():
            z.writestr(name, data)


def text_of(parts, name):
    return parts[name].decode("utf-8")


# ---------------------------------------------------------------------------
# Excel: the visible sheet, the hidden map sheet


def col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def col_name(index):
    s = ""
    n = index + 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def shared_strings(parts):
    name = next((n for n in parts if n.lower() == "xl/sharedstrings.xml"), None)
    if not name:
        return []
    root = ET.fromstring(parts[name])
    return ["".join(t.text or "" for t in si.iter(f"{MAIN}t")) for si in root.findall(f"{MAIN}si")]


def sheet_rows(xml_bytes, shared):
    """A worksheet as a list of rows, each a list of cell texts (inline, shared or plain values)."""
    root = ET.fromstring(xml_bytes)
    rows = {}
    for row in root.iter(f"{MAIN}row"):
        r = int(row.get("r"))
        cells = {}
        for c in row.findall(f"{MAIN}c"):
            m = re.match(r"([A-Z]+)", c.get("r") or "")
            if not m:
                continue
            t = c.get("t")
            if t == "inlineStr":
                is_el = c.find(f"{MAIN}is")
                text = "".join(x.text or "" for x in is_el.iter(f"{MAIN}t")) if is_el is not None else ""
            elif t == "s":
                v = c.find(f"{MAIN}v")
                text = shared[int(v.text)] if v is not None and v.text else ""
            else:
                v = c.find(f"{MAIN}v")
                text = (v.text or "") if v is not None else ""
            cells[col_index(m.group(1))] = text
        rows[r] = cells
    out = []
    last = max(rows) if rows else 0
    for r in range(1, last + 1):
        cells = rows.get(r, {})
        width = (max(cells) + 1) if cells else 0
        out.append([cells.get(i, "") for i in range(width)])
    return out


def cell_of(row, header, name):
    if name not in header:
        return ""
    at = header.index(name)
    return row[at] if at < len(row) else ""


def int_or_none(s):
    s = (s or "").strip()
    return int(s) if re.fullmatch(r"-?[0-9]+", s) else None


def parse_map_rows(rows):
    """The hidden sheet's rows as engine/roundTrip/exportMap.ts parseMapSheetRows reads them."""
    start = next((k for k, r in enumerate(rows) if r and r[0].strip() == "dcrs-map"), None)
    if start is None:
        return None
    env = {}
    k = start + 1
    while k < len(rows):
        key = (rows[k][0] if rows[k] else "").strip()
        if key in ("#entries", "#tables"):
            break
        if key:
            env[key] = rows[k][1] if len(rows[k]) > 1 else ""
        k += 1
    entries, tables = [], {}
    section, header = None, []
    while k < len(rows):
        row = rows[k]
        first = (row[0] if row else "").strip()
        if first in ("#entries", "#tables"):
            section = first[1:]
            header = [h.strip() for h in (rows[k + 1] if k + 1 < len(rows) else [])]
            k += 2
            continue
        if section and any(row):
            if section == "entries":
                entries.append(
                    {
                        "i": int_or_none(cell_of(row, header, "i")),
                        "ref": cell_of(row, header, "ref").replace("$", "").upper(),
                        "recordId": cell_of(row, header, "recordId"),
                        "path": cell_of(row, header, "path"),
                        "type": cell_of(row, header, "type").strip(),
                        "label": cell_of(row, header, "label"),
                        "text": cell_of(row, header, "text"),
                        "pre": cell_of(row, header, "pre"),
                        "post": cell_of(row, header, "post"),
                    }
                )
            else:
                t = int_or_none(cell_of(row, header, "t"))
                if t is not None:
                    table = tables.setdefault(
                        t,
                        {
                            "t": t,
                            "recordId": cell_of(row, header, "recordId"),
                            "listPath": cell_of(row, header, "listPath"),
                            "headerRow": int_or_none(cell_of(row, header, "headerRow")),
                            "lastRow": int_or_none(cell_of(row, header, "lastRow")),
                            "nextRow": int_or_none(cell_of(row, header, "nextRow")),
                            "columns": [],
                        },
                    )
                    table["columns"].append(
                        {
                            "key": cell_of(row, header, "key"),
                            "type": cell_of(row, header, "type").strip(),
                            "col": int_or_none(cell_of(row, header, "col")),
                            "options": cell_of(row, header, "options"),
                        }
                    )
        k += 1
    try:
        record_ids = json.loads(env.get("recordIds") or "[]")
    except ValueError:
        record_ids = []
    envelope = {"documentId": env.get("documentId", ""), "kind": env.get("kind", ""), "recordIds": record_ids}
    return {"envelope": envelope, "entries": [e for e in entries if e["i"] is not None], "tables": list(tables.values())}


def rel_target(rels_xml, rid, base_dir):
    for m in re.finditer(r"<Relationship\b[^>]*>", rels_xml):
        tag = m.group(0)
        if re.search(r'\bId="%s"' % re.escape(rid), tag):
            target = re.search(r'\bTarget="([^"]+)"', tag).group(1)
            return target.lstrip("/") if target.startswith("/") else base_dir + target
    return None


def sheet_parts(parts):
    """(visible sheet part, every worksheet part) - found by the workbook's order and r:id, never by name."""
    wb = text_of(parts, "xl/workbook.xml")
    rels = text_of(parts, "xl/_rels/workbook.xml.rels")
    visible = None
    for m in re.finditer(r"<sheet\b[^>]*>", wb):
        tag = m.group(0)
        rid = re.search(r'r:id="([^"]+)"', tag)
        if not rid:
            continue
        target = rel_target(rels, rid.group(1), "xl/")
        if visible is None and "hidden" not in (re.search(r'\bstate="([^"]*)"', tag) or [None, ""])[1].lower():
            visible = target
    worksheets = [n for n in parts if n.startswith("xl/worksheets/") and n.endswith(".xml")]
    return visible, worksheets


def xlsx_map(parts):
    shared = shared_strings(parts)
    for name in parts:
        if not (name.startswith("xl/worksheets/") and name.endswith(".xml")):
            continue
        rows = sheet_rows(parts[name], shared)
        if rows and rows[0] and rows[0][0].strip() == "dcrs-map":
            return parse_map_rows(rows)
    return None


def cell_match(sheet, ref):
    return re.search(r'<c r="%s"(?P<attrs>[^>]*?)(?:/>|>(?P<body>.*?)</c>)' % re.escape(ref), sheet, re.S)


def style_attr(attrs):
    m = re.search(r'\ss="(\d+)"', attrs or "")
    return f' s="{m.group(1)}"' if m else ""


def xlsx_set_text(sheet, ref, text):
    m = cell_match(sheet, ref)
    if not m:
        return None
    new = f'<c r="{ref}"{style_attr(m.group("attrs"))} t="inlineStr"><is><t xml:space="preserve">{escape(text)}</t></is></c>'
    return sheet[: m.start()] + new + sheet[m.end() :]


def xlsx_set_number(sheet, ref, number, keep_style=True):
    m = cell_match(sheet, ref)
    if not m:
        return None
    style = style_attr(m.group("attrs")) if keep_style else ""
    new = f'<c r="{ref}"{style}><v>{number}</v></c>'
    return sheet[: m.start()] + new + sheet[m.end() :]


INLINE_CELL = re.compile(r'<c\b([^>]*?)\st="inlineStr"([^>]*)>\s*<is>(.*?)</is>\s*</c>', re.S)


def to_shared_strings(parts):
    """What Excel does on save: every inline string of every sheet moved into one shared-strings table."""
    table, index, count = [], {}, [0]

    def sub(m):
        attrs = (m.group(1) + m.group(2)).rstrip()
        content = m.group(3)
        if content not in index:
            index[content] = len(table)
            table.append(content)
        count[0] += 1
        return f'<c{attrs} t="s"><v>{index[content]}</v></c>'

    for name in list(parts):
        if name.startswith("xl/worksheets/") and name.endswith(".xml"):
            parts[name] = INLINE_CELL.sub(sub, text_of(parts, name)).encode("utf-8")
    parts["xl/sharedStrings.xml"] = (
        DECL + f'<sst xmlns="{SSML}" count="{count[0]}" uniqueCount="{len(table)}">' + "".join(f"<si>{c}</si>" for c in table) + "</sst>"
    ).encode("utf-8")
    types = text_of(parts, "[Content_Types].xml")
    if "sharedStrings.xml" not in types:
        types = types.replace("</Types>", f'<Override PartName="/xl/sharedStrings.xml" ContentType="{SHARED_STRINGS_TYPE}"/></Types>')
        parts["[Content_Types].xml"] = types.encode("utf-8")
    rels = text_of(parts, "xl/_rels/workbook.xml.rels")
    if "sharedStrings" not in rels:
        rels = rels.replace("</Relationships>", f'<Relationship Id="rIdSst9" Type="{SHARED_STRINGS_REL}" Target="sharedStrings.xml"/></Relationships>')
        parts["xl/_rels/workbook.xml.rels"] = rels.encode("utf-8")
    return count[0]


def row_is_free(sheet, row_no):
    m = re.search(r'<row r="%d"(?P<attrs>[^>]*?)(?:/>|>(?P<body>.*?)</row>)' % row_no, sheet, re.S)
    return not m or "<c " not in (m.group("body") or "")


def xlsx_append_row(sheet, row_no, cells_xml):
    body = "".join(cells_xml)
    m = re.search(r'<row r="%d"(?P<attrs>[^>]*?)(?:/>|>(?P<body>.*?)</row>)' % row_no, sheet, re.S)
    if m:
        if "<c " in (m.group("body") or ""):
            return None
        return sheet[: m.start()] + f'<row r="{row_no}"{m.group("attrs")}>{body}</row>' + sheet[m.end() :]
    for mm in re.finditer(r'<row r="(\d+)"', sheet):
        if int(mm.group(1)) > row_no:
            return sheet[: mm.start()] + f'<row r="{row_no}">{body}</row>' + sheet[mm.start() :]
    at = sheet.find("</sheetData>")
    if at < 0:
        return None
    return sheet[:at] + f'<row r="{row_no}">{body}</row>' + sheet[at:]


# ---------------------------------------------------------------------------
# Word: the map part, the content controls


def docx_map(parts):
    for name in parts:
        if re.search(r"(^|/)customXml/item\d*\.xml$", name, re.I):
            raw = text_of(parts, name)
            if "dcrsMap" not in raw:
                continue
            root = ET.fromstring(parts[name])
            try:
                m = json.loads(root.text or "")
            except ValueError:
                return None
            env = m.get("envelope") or {}
            entries = [
                {
                    "i": e.get("i"),
                    "ref": "",
                    "recordId": e.get("recordId", ""),
                    "path": e.get("path", ""),
                    "type": e.get("type", ""),
                    "label": e.get("label", ""),
                    "text": e.get("text", ""),
                    "pre": e.get("pre", ""),
                    "post": e.get("post", ""),
                }
                for e in m.get("entries") or []
                if isinstance(e.get("i"), int)
            ]
            return {"envelope": {"documentId": env.get("documentId", ""), "kind": env.get("kind", ""), "recordIds": env.get("recordIds") or []}, "entries": entries, "tables": m.get("tables") or []}
    return None


def sdt_span(doc_xml, i):
    """(start of the w:sdt, start of its w:sdtContent, end of its content) for the control tagged dcrs:<i>."""
    tag = f'<w:tag w:val="dcrs:{i}"/>'
    at = doc_xml.find(tag)
    if at < 0:
        return None
    start = doc_xml.rfind("<w:sdt>", 0, at)
    cs = doc_xml.find("<w:sdtContent>", at)
    ce = doc_xml.find("</w:sdtContent>", cs)
    if start < 0 or cs < 0 or ce < 0:
        return None
    return start, cs, ce


def docx_editable(doc_xml, i):
    span = sdt_span(doc_xml, i)
    if not span:
        return False
    content = doc_xml[span[1] + len("<w:sdtContent>") : span[2]]
    return "<w:p" not in content and "<w:tc" not in content


def docx_set_text(doc_xml, i, text):
    """The control's text typed over in Word: two runs (Word splits a typed edit), the placeholder flag dropped."""
    span = sdt_span(doc_xml, i)
    if not span:
        return None
    start, cs, ce = span
    content = doc_xml[cs + len("<w:sdtContent>") : ce]
    rpr_m = re.search(r"<w:rPr>.*?</w:rPr>", content, re.S)
    rpr = rpr_m.group(0) if rpr_m else ""
    half = max(1, len(text) // 2)
    runs = (
        f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text[:half])}</w:t></w:r>'
        f'<w:r w:rsidR="00A1B2C3">{rpr}<w:t xml:space="preserve">{escape(text[half:])}</w:t></w:r>'
    )
    head = doc_xml[start:cs].replace("<w:showingPlcHdr/>", "")
    return doc_xml[:start] + head + "<w:sdtContent>" + runs + doc_xml[ce:]


# ---------------------------------------------------------------------------
# choosing the box to change


def pick_entry(kind, m, sheet_xml, doc_xml, types, primary, avoid=()):
    record_ids = set(m["envelope"]["recordIds"]) or {e["recordId"] for e in m["entries"]}
    ref_count = {}
    for e in m["entries"]:
        if e["ref"]:
            ref_count[e["ref"]] = ref_count.get(e["ref"], 0) + 1
    best, best_key = None, None
    for e in m["entries"]:
        if e["type"] not in types or e["recordId"] not in record_ids or e["path"] in avoid:
            continue
        if e.get("pre") or e.get("post"):
            continue
        if kind == "xlsx":
            if not e["ref"] or ref_count.get(e["ref"]) != 1 or not cell_match(sheet_xml, e["ref"]):
                continue
        elif not docx_editable(doc_xml, e["i"]):
            continue
        last = e["path"].split("/")[-1]
        key = (
            0 if e["recordId"] == primary else 1,
            0 if (e["text"] or "").strip() else 1,
            0 if REMARK_LIKE.search(last) else 1,
            e["i"],
        )
        if best_key is None or key < best_key:
            best, best_key = e, key
    return best


def number_for(entry):
    try:
        n = float((entry["text"] or "").replace(",", "").strip())
        return int(n) + 3 if n.is_integer() else round(n + 3, 2)
    except ValueError:
        return 7


def edit_one_box(kind, parts, m, primary, marker, avoid=()):
    """Changes one bound text box (else a number box) the way the program would. (entry, expected value) or (None, why)."""
    sheet_name = sheet_parts(parts)[0] if kind == "xlsx" else "word/document.xml"
    if not sheet_name or sheet_name not in parts:
        return None, f"no {'visible sheet' if kind == 'xlsx' else 'word/document.xml'} in the file"
    xml = text_of(parts, sheet_name)
    for types, is_text in ((("text", "paragraph"), True), (("number",), False)):
        e = pick_entry(kind, m, xml if kind == "xlsx" else "", xml if kind == "docx" else "", types, primary, avoid)
        if not e:
            continue
        value = marker if is_text else number_for(e)
        if kind == "xlsx":
            new = xlsx_set_text(xml, e["ref"], value) if is_text else xlsx_set_number(xml, e["ref"], value)
        else:
            new = docx_set_text(xml, e["i"], str(value))
        if new is None:
            continue
        parts[sheet_name] = new.encode("utf-8")
        return e, value
    return None, "no text or number box of the record in the file"


# ---------------------------------------------------------------------------
# the page: download, upload, preview, apply


def download(page, folder):
    btn = page.locator("[data-action='download-document']").first
    fmt = btn.get_attribute("data-format")
    with page.expect_download(timeout=30000) as dl:
        btn.click(timeout=8000)
    d = dl.value
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "downloaded-" + d.suggested_filename)
    d.save_as(path)
    return fmt, d.suggested_filename, path


PREVIEW_JS = """() => {
  const d = document.querySelector('.rt-dialog');
  const q = (s) => Array.from(document.querySelectorAll(s));
  const text = (s) => q(s).map((e) => e.innerText).join(' | ');
  return {
    phase: d ? d.getAttribute('data-phase') : null,
    changes: q('.rt-dialog tr[data-change-path]').map((tr) => ({ path: tr.getAttribute('data-change-path'), record: tr.getAttribute('data-record-id'), text: tr.innerText })),
    newLines: q(".rt-dialog [data-section='upload-new-lines'] li").map((li) => li.innerText),
    rejected: q(".rt-dialog [data-section='upload-rejected'] li").map((li) => li.innerText),
    reopen: text(".rt-dialog [data-section='upload-reopen']"),
    error: text(".rt-dialog [data-section='upload-error']"),
    otherDocument: text(".rt-dialog [data-section='upload-other-document']"),
    otherRecord: text(".rt-dialog [data-section='upload-other-record']"),
    locked: text(".rt-dialog [data-section='upload-locked'], .rt-dialog [data-section='upload-gone']"),
    nothing: q(".rt-dialog [data-section='upload-nothing']").length > 0,
    counts: text(".rt-dialog [data-section='upload-counts']"),
    apply: q("[data-action='apply-uploaded-changes']").length,
    applyLabel: q("[data-action='apply-uploaded-changes']").map((b) => b.innerText).join(''),
    mitra: q("[data-action='upload-to-mitra']").length,
  };
}"""


def upload(page, path):
    """Upload changes -> the file chooser -> the file; waits until the dialog has read it. The preview's contents."""
    btn = page.locator("[data-action='upload-document-changes']").first
    with page.expect_file_chooser(timeout=8000) as fc:
        btn.click(timeout=8000)
    fc.value.set_files(path)
    page.wait_for_function(
        "() => { const d = document.querySelector('.rt-dialog'); const p = d && d.getAttribute('data-phase'); return !!p && p !== 'reading'; }",
        timeout=20000,
    )
    return page.evaluate(PREVIEW_JS)


def apply_changes(page):
    page.locator("[data-action='apply-uploaded-changes']").first.click(timeout=5000)
    page.wait_for_selector(".rt-dialog [data-section='upload-applied']", timeout=10000)
    el = page.locator(".rt-dialog [data-section='upload-applied']").first
    return int(el.get_attribute("data-applied") or "0"), el.inner_text()


def close_dialog(page):
    btn = page.locator("[data-action='close-upload-changes']")
    if btn.count():
        try:
            btn.first.click(timeout=3000)
        except Exception:
            pass
    try:
        page.wait_for_selector(".rt-dialog", state="detached", timeout=3000)
    except Exception:
        pass


def imported_entry(rec, file_name):
    return next((h for h in reversed((rec or {}).get("history") or []) if h.get("action") == "imported" and file_name in (h.get("note") or "")), None)


def poll_record(page, rid, ok, ms=3000):
    end = time.time() + ms / 1000
    rec = stored_record(page, rid)
    while not ok(rec) and time.time() < end:
        page.wait_for_timeout(150)
        rec = stored_record(page, rid)
    return rec


def wait_record_page(page, timeout=9000):
    page.wait_for_selector("[data-print-doc]", timeout=timeout)
    page.wait_for_timeout(300)
    dismiss(page)


def open_route(page, route):
    go(page, "#/library")
    page.wait_for_timeout(200)
    go(page, route)
    wait_record_page(page)
    close_assistant(page)


def minimal_xlsx(path):
    """A workbook this system never wrote: no map, no envelope."""
    parts = {
        "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": f'<workbook xmlns="{SSML}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/worksheets/sheet1.xml": f'<worksheet xmlns="{SSML}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Viscosity</t></is></c><c r="B1"><v>20.4</v></c></row></sheetData></worksheet>',
    }
    write_parts(path, {k: (DECL + v).encode("utf-8") for k, v in parts.items()})


def plain_zip(path):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("notes.txt", "Just some notes, not a spreadsheet.")


# ---------------------------------------------------------------------------

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 950}, accept_downloads=True)
    page.set_default_timeout(10000)
    page.route("**/translate_a/**", lambda route: route.abort())
    errors = []
    console_errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    suite_start = time.time()
    sign_in(page)

    go(page, "#/library")
    page.wait_for_selector("[data-action='new-record']", state="attached", timeout=15000)
    page.wait_for_timeout(500)
    dismiss(page)
    doc_ids = []
    for d in page.eval_on_selector_all("[data-action='new-record']", "els => els.map(e => e.getAttribute('data-document'))"):
        if d and d not in doc_ids:
            doc_ids.append(d)
    check("The library offers a record of every document that holds one", len(doc_ids) >= 10, doc_ids)

    passed, failed, skipped, not_reached = [], [], [], []
    by_kind = {"xlsx": 0, "docx": 0}
    shared_docs, reopened_docs = [], []
    edited_files = []  # (doc_id, path of an edited file)
    pages = {}  # doc_id -> (route, kind, record id)
    date_candidate = None  # (doc_id, route, record id)
    free_row_candidate = None  # (doc_id, route, record id, table)
    xlsx_seen = 0
    loop_start = time.time()

    print("\n==== Every document: download, edit in Excel/Word, upload, apply ====")
    for n, doc_id in enumerate(doc_ids):
        if time.time() - loop_start > LOOP_BUDGET_S:
            not_reached.append(doc_id)
            continue
        folder = os.path.join(TMP, re.sub(r"[^A-Za-z0-9_-]", "_", doc_id))
        stage = "starting its record"
        try:
            go(page, "#/library")
            sel = f"[data-action='new-record'][data-document='{doc_id}']"
            page.wait_for_selector(sel, state="attached", timeout=10000)
            page.locator(sel).first.evaluate("el => el.click()")
            page.wait_for_function("() => location.hash.length > 3 && !location.hash.startsWith('#/library')", timeout=8000)
            try:
                wait_record_page(page)
            except Exception:
                skipped.append((doc_id, f"no record page drawn at {current_hash(page)}"))
                print(f"[SKIP] {doc_id}: no record page drawn at {current_hash(page)}")
                continue
            route = current_hash(page)
            rid = route.rstrip("/").split("/")[-1]
            rec = stored_record(page, rid)
            dl = page.locator("[data-action='download-document']")
            fmt = dl.first.get_attribute("data-format") if dl.count() else None
            if fmt not in ("xlsx", "docx"):
                skipped.append((doc_id, "no Word/Excel download on its record page"))
                print(f"[SKIP] {doc_id}: no Word/Excel download on its record page ({fmt})")
                continue
            if not check(f"{doc_id}: Upload changes sits beside Download", page.locator("[data-action='upload-document-changes']").count() >= 1, route):
                failed.append(doc_id)
                continue

            stage = "filling it with sample data"
            signed_off = bool(rec) and rec.get("status") not in EDITABLE
            if not signed_off:
                reply = say(page, "fill it with sample data")
                if not ("sample data" in reply.lower() or "already filled" in reply.lower()):
                    skipped.append((doc_id, f"sample fill not offered: {reply[:120]!r}"))
                    print(f"[SKIP] {doc_id}: sample fill not offered - Mitra said {reply[:160]!r}")
                    close_assistant(page)
                    continue
            close_assistant(page)

            stage = "downloading it"
            kind, file_name, path = download(page, folder)
            parts = read_parts(path)
            m = xlsx_map(parts) if kind == "xlsx" else docx_map(parts)
            if not check(f"{doc_id}: the {kind} download carries its map (hidden _dcrs sheet / custom XML part)", m is not None and m["envelope"]["documentId"] == doc_id, (file_name, sorted(parts)[:12], m and m["envelope"])):
                failed.append(doc_id)
                continue
            primary = rid if rid in m["envelope"]["recordIds"] else (m["envelope"]["recordIds"] or [rid])[0]

            stage = "editing the file"
            marker = f"Upload check {n + 1:03d} edited in {'Excel' if kind == 'xlsx' else 'Word'}"
            entry, value = edit_one_box(kind, parts, m, primary, marker)
            if entry is None:
                skipped.append((doc_id, value))
                print(f"[SKIP] {doc_id}: {value} ({len(m['entries'])} boxes in the map)")
                continue
            if kind == "xlsx":
                xlsx_seen += 1
                if xlsx_seen % 4 == 2:
                    moved = to_shared_strings(parts)
                    shared_docs.append(doc_id)
                    print(f"      {doc_id}: {moved} inline strings moved into a shared-strings table, as Excel saves")
                visible, _ = sheet_parts(parts)
                sheet_xml = text_of(parts, visible)
                if date_candidate is None and pick_entry("xlsx", m, sheet_xml, "", ("date",), primary, avoid=(entry["path"],)):
                    date_candidate = (doc_id, route, primary)
                for t in m["tables"]:
                    last = t.get("lastRow")
                    if (
                        free_row_candidate is None
                        and t.get("listPath") == "rows"
                        and t.get("recordId") == primary
                        and last
                        and (t.get("nextRow") is None or t["nextRow"] > last + 1)
                        and row_is_free(sheet_xml, last + 1)
                        and any(c["type"] in ("text", "paragraph", "number") and c["col"] is not None for c in t["columns"])
                    ):
                        free_row_candidate = (doc_id, route, primary, t)
            edited = os.path.join(folder, "edited", file_name)
            write_parts(edited, parts)

            stage = "uploading it"
            pv = upload(page, edited)
            paths = [c["path"] for c in pv["changes"]]
            ok = check(
                f"{doc_id} ({kind}): the preview lists exactly the one box changed - {entry['label'] or entry['path']}",
                pv["phase"] == "preview" and paths == [entry["path"]] and pv["apply"] == 1,
                {"phase": pv["phase"], "expected": entry["path"], "listed": pv["changes"], "rejected": pv["rejected"], "error": pv["error"], "other": pv["otherDocument"] or pv["otherRecord"], "locked": pv["locked"], "counts": pv["counts"]},
            )
            if signed_off:
                check(f"{doc_id}: signed off ({rec.get('status')}) - the preview says it will be reopened for correction", "reopened for correction" in pv["reopen"], pv["reopen"] or pv)
            if not ok:
                close_dialog(page)
                failed.append(doc_id)
                continue

            stage = "applying it"
            applied, said = apply_changes(page)
            rec_id = entry["recordId"]
            after = poll_record(page, rec_id, lambda r: bool(r) and value_matches(get_at_path(r.get("data"), entry["path"]), value) and imported_entry(r, file_name) is not None)
            got = get_at_path((after or {}).get("data"), entry["path"])
            ok = check(
                f"{doc_id}: applied - the stored record holds the new value at {entry['path']}, with an 'imported' history line",
                applied >= 1 and value_matches(got, value) and imported_entry(after, file_name) is not None,
                {"applied": applied, "said": said, "stored": None if got is MISSING else got, "expected": value, "history": [(h.get("action"), h.get("note")) for h in ((after or {}).get("history") or [])[-3:]]},
            )
            close_dialog(page)
            if ok:
                passed.append(doc_id)
                by_kind[kind] += 1
                if signed_off:
                    reopened_docs.append(doc_id)
                edited_files.append((doc_id, edited))
                pages[doc_id] = (route, kind, rec_id)
            else:
                failed.append(doc_id)
        except Exception as ex:  # a timeout on one document is that document's failure, not the suite's end
            check(f"{doc_id}: round trip ({stage})", False, f"{type(ex).__name__}: {str(ex)[:600]} at {current_hash(page)}")
            failed.append(doc_id)
            close_dialog(page)
            close_assistant(page)

    print(f"\n(the every-document pass took {time.time() - loop_start:.0f} s)")

    # ---- a date typed into Excel as a serial number ----
    print("\n==== A date typed as an Excel serial number ====")
    if date_candidate:
        doc_id, route, primary = date_candidate
        try:
            open_route(page, route)
            kind, file_name, path = download(page, os.path.join(TMP, "date-serial"))
            parts = read_parts(path)
            m = xlsx_map(parts)
            visible, _ = sheet_parts(parts)
            sheet_xml = text_of(parts, visible)
            e = pick_entry("xlsx", m, sheet_xml, "", ("date",), primary)
            if e is None:
                raise RuntimeError(f"the date box found earlier is not in this download of {doc_id}")
            target = date.today() - timedelta(days=2)
            if target.strftime("%d-%b-%Y") == (e["text"] or "").strip() or target.isoformat() == (e["text"] or "").strip():
                target = date.today() - timedelta(days=3)
            serial = (target - date(1899, 12, 30)).days
            # Typed into the date cell: Excel keeps the cell's date format and stores the day's serial number.
            m_cell = cell_match(sheet_xml, e["ref"])
            keep = 't="inlineStr"' not in (m_cell.group("attrs") or "")
            parts[visible] = xlsx_set_number(sheet_xml, e["ref"], serial, keep_style=keep).encode("utf-8")
            edited = os.path.join(TMP, "date-serial", "edited", file_name)
            write_parts(edited, parts)
            pv = upload(page, edited)
            check(
                f"{doc_id}: a date typed as the serial {serial} is listed as the one change ({e['label'] or e['path']})",
                pv["phase"] == "preview" and [c["path"] for c in pv["changes"]] == [e["path"]],
                {"listed": pv["changes"], "rejected": pv["rejected"], "error": pv["error"]},
            )
            if pv["apply"]:
                applied, said = apply_changes(page)
                after = poll_record(page, e["recordId"], lambda r: bool(r) and get_at_path(r.get("data"), e["path"]) == target.isoformat())
                got = get_at_path((after or {}).get("data"), e["path"])
                check(f"...and is stored as the date {target.isoformat()}", got == target.isoformat(), {"stored": None if got is MISSING else got, "applied": applied, "said": said})
            close_dialog(page)
        except Exception as ex:
            check("A date typed as an Excel serial number is stored as the date", False, f"{type(ex).__name__}: {str(ex)[:600]}")
            close_dialog(page)
    else:
        check("An Excel document with a date box of its own was found for the serial-number check", False, "no xlsx document with a whole-cell date box passed the every-document pass")

    # ---- a line typed under a free-row log sheet's grid ----
    print("\n==== A line added under a free-row log sheet's grid ====")
    if free_row_candidate:
        doc_id, route, primary, _t = free_row_candidate
        try:
            open_route(page, route)
            before = stored_record(page, primary)
            rows_before = len(((before or {}).get("data") or {}).get("rows") or [])
            kind, file_name, path = download(page, os.path.join(TMP, "append"))
            parts = read_parts(path)
            m = xlsx_map(parts)
            table = next(t for t in m["tables"] if t["listPath"] == "rows" and t["recordId"] == primary)
            visible, _ = sheet_parts(parts)
            sheet_xml = text_of(parts, visible)
            row_no = table["lastRow"] + 1
            col = next((c for c in table["columns"] if c["type"] in ("text", "paragraph") and c["col"] is not None), None)
            marker = "Line added in Excel by the upload check"
            if col:
                cell = f'<c r="{col_name(col["col"])}{row_no}" t="inlineStr"><is><t xml:space="preserve">{escape(marker)}</t></is></c>'
                expected = marker
            else:
                col = next(c for c in table["columns"] if c["type"] == "number" and c["col"] is not None)
                cell = f'<c r="{col_name(col["col"])}{row_no}"><v>4321</v></c>'
                expected = 4321
            new_sheet = xlsx_append_row(sheet_xml, row_no, [cell])
            parts[visible] = new_sheet.encode("utf-8")
            edited = os.path.join(TMP, "append", "edited", file_name)
            write_parts(edited, parts)
            pv = upload(page, edited)
            check(
                f"{doc_id}: the line typed under the grid (row {row_no}, column {col['key']}) is listed as one new line",
                pv["phase"] == "preview" and len(pv["newLines"]) == 1 and not pv["changes"],
                {"newLines": pv["newLines"], "changes": pv["changes"], "rejected": pv["rejected"], "error": pv["error"]},
            )
            if pv["apply"]:
                applied, said = apply_changes(page)
                key = col["key"]
                after = poll_record(page, primary, lambda r: bool(r) and len(((r.get("data") or {}).get("rows") or [])) > rows_before)
                rows_after = ((after or {}).get("data") or {}).get("rows") or []
                check(
                    "...and becomes a new row of the record, holding what was typed",
                    len(rows_after) == rows_before + 1 and any(value_matches(r.get(key), expected) for r in rows_after if isinstance(r, dict)),
                    {"rows before": rows_before, "rows after": len(rows_after), "last row": rows_after[-1] if rows_after else None, "applied": applied, "said": said},
                )
                check("...with an 'imported' history line", imported_entry(after, file_name) is not None, [(h.get("action"), h.get("note")) for h in ((after or {}).get("history") or [])[-3:]])
            close_dialog(page)
        except Exception as ex:
            check("A line added under a free-row log sheet's grid becomes a new row", False, f"{type(ex).__name__}: {str(ex)[:600]}")
            close_dialog(page)
    else:
        check("A free-row log sheet (a grid lines can be added to) was found for the new-line check", False, "no xlsx document with an appendable 'rows' grid passed the every-document pass")

    # ---- a verified record: reopened for correction, then changed ----
    print("\n==== A verified record ====")
    verified_page = None
    candidates = [d for d in passed if pages[d][0].startswith("#/record/")][:4]
    for doc_id in candidates:
        route, kind, rid = pages[doc_id]
        try:
            open_route(page, route)
            rec = stored_record(page, rid)
            if rec and rec.get("status") in EDITABLE:
                page.locator("button[data-action='submit']").first.click(timeout=5000)
                rec = poll_record(page, rid, lambda r: bool(r) and r.get("status") in ("Submitted", "Pending Verification"))
            if rec and rec.get("status") in ("Submitted", "Pending Verification"):
                page.wait_for_timeout(400)
                page.locator("button[data-action='verify']").first.click(timeout=5000)
                rec = poll_record(page, rid, lambda r: bool(r) and r.get("status") == "Verified")
            if rec and rec.get("status") == "Verified":
                verified_page = (doc_id, route, kind, rid)
                break
            print(f"      {doc_id}: could not be submitted and verified here (status {rec and rec.get('status')}) - trying another")
        except Exception as ex:
            print(f"      {doc_id}: submit/verify did not go through ({type(ex).__name__}) - trying another")
    if check("A record was submitted and verified for the reopen check", verified_page is not None, candidates):
        doc_id, route, kind, rid = verified_page
        try:
            page.wait_for_timeout(500)
            close_assistant(page)
            kind, file_name, path = download(page, os.path.join(TMP, "verified"))
            parts = read_parts(path)
            m = xlsx_map(parts) if kind == "xlsx" else docx_map(parts)
            marker = f"Corrected in {'Excel' if kind == 'xlsx' else 'Word'} after verification"
            entry, value = edit_one_box(kind, parts, m, rid, marker)
            if check(f"{doc_id}: a box of the verified record was found in the file", entry is not None, value):
                edited = os.path.join(TMP, "verified", "edited", file_name)
                write_parts(edited, parts)
                pv = upload(page, edited)
                check(
                    "The preview lists the change and warns that the verified record will be reopened for correction",
                    [c["path"] for c in pv["changes"]] == [entry["path"]] and "reopened for correction" in pv["reopen"] and "Changes uploaded from" in pv["reopen"],
                    {"listed": pv["changes"], "reopen": pv["reopen"], "locked": pv["locked"]},
                )
                if pv["apply"]:
                    applied, said = apply_changes(page)
                    after = poll_record(page, entry["recordId"], lambda r: bool(r) and r.get("status") in EDITABLE and value_matches(get_at_path(r.get("data"), entry["path"]), value))
                    actions = [h.get("action") for h in ((after or {}).get("history") or [])]
                    last_reopen = max((k for k, a in enumerate(actions) if a == "reopened"), default=-1)
                    got = get_at_path((after or {}).get("data"), entry["path"])
                    check(
                        "Apply reopens it (In Progress, the reason recorded) and changes it",
                        bool(after)
                        and after.get("status") in EDITABLE
                        and "Changes uploaded from" in ((after.get("correction") or {}).get("reason") or "")
                        and value_matches(got, value),
                        {"status": (after or {}).get("status"), "correction": (after or {}).get("correction"), "stored": None if got is MISSING else got, "said": said},
                    )
                    check(
                        "...and its history reads reopened, then imported",
                        bool(actions) and actions[-1] == "imported" and 0 <= last_reopen < len(actions) - 1,
                        actions[-5:],
                    )
                close_dialog(page)
        except Exception as ex:
            check("A verified record is reopened for correction and changed", False, f"{type(ex).__name__}: {str(ex)[:600]}")
            close_dialog(page)

    # ---- files that are refused ----
    print("\n==== Files that are refused ====")
    here = verified_page[0] if verified_page else (passed[0] if passed else None)
    if here:
        try:
            if not verified_page:
                open_route(page, pages[here][0])
            other = next(((d, f) for d, f in edited_files if d != here), None)
            if check("A file of another document is at hand for the refusal check", other is not None, [d for d, _ in edited_files]):
                pv = upload(page, other[1])
                check(
                    f"A file of another document ({other[0]}) uploaded on {here} is refused, nothing to apply",
                    pv["phase"] == "other-document" and "different document" in pv["otherDocument"] and pv["apply"] == 0,
                    {"phase": pv["phase"], "said": pv["otherDocument"], "apply": pv["apply"]},
                )
                close_dialog(page)
            no_map = os.path.join(TMP, "refused", "Viscosity readings.xlsx")
            minimal_xlsx(no_map)
            pv = upload(page, no_map)
            check(
                "An Excel file this system never wrote is refused with the plain message",
                pv["phase"] == "error" and "was not downloaded from this system" in pv["error"] and pv["apply"] == 0,
                {"phase": pv["phase"], "said": pv["error"], "apply": pv["apply"]},
            )
            print(f"      (Let Mitra read it offered: {pv['mitra'] > 0} - it is only when the assistant is configured)")
            close_dialog(page)
            not_office = os.path.join(TMP, "refused", "notes.xlsx")
            plain_zip(not_office)
            pv = upload(page, not_office)
            check(
                "A zip that is not an Excel or Word file is refused, in plain words",
                pv["phase"] == "error" and "not an Excel" in pv["error"] and pv["apply"] == 0,
                {"phase": pv["phase"], "said": pv["error"]},
            )
            close_dialog(page)
        except Exception as ex:
            check("Files of another document, with no map, or not Office at all are refused", False, f"{type(ex).__name__}: {str(ex)[:600]}")
            close_dialog(page)
    else:
        check("A document page was at hand for the refusal checks", False, "no document passed the every-document pass")

    # ---- the whole ----
    tried = len(passed) + len(failed)
    print("\n==== Coverage ====")
    print(f"Documents the library can start: {len(doc_ids)}")
    print(f"Tried (a Word/Excel download on the record page): {tried}")
    print(f"Passed: {len(passed)} ({by_kind['xlsx']} Excel, {by_kind['docx']} Word; {len(shared_docs)} saved with a shared-strings table; {len(reopened_docs)} signed off and reopened by the upload)")
    if failed:
        print(f"Failed: {len(failed)} - {', '.join(failed)}")
    if skipped:
        print(f"Skipped: {len(skipped)}")
        for d, why in skipped:
            print(f"   - {d}: {why}")
    if not_reached:
        print(f"Not reached within the time budget ({LOOP_BUDGET_S} s): {len(not_reached)} - {', '.join(not_reached)}")
    check("The round trip was tried on at least ten documents", tried >= 10, {"tried": tried, "skipped": len(skipped), "not reached": len(not_reached)})
    check("No JavaScript errors", not errors, errors[:5])
    if console_errors:
        print(f"      (console errors seen, not counted: {console_errors[:5]})")
    print(f"(the suite took {time.time() - suite_start:.0f} s)")
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1)
print("\nAn edited Word or Excel file is read back into its record - every document tried.")
