"""Every document of every module: Download Excel, Download Word, Print Original-Style Record (REQUIREMENTS §183).

Against the local run (npm run dev:local, http://localhost:5173, its scratch database; admin@gpp.local / Local@12345).
For each document of the Document Library - one that holds records started with New, any other opened:
  * words typed into up to eight of its boxes (ZQ marks), so the files and the printout can be held to what was typed;
  * every download pressed, each file saved and read back: zip and XML sound, every part typed, every relationship's target
    there, openpyxl / python-docx open it, it has content, it carries the format number and the typed words, its name is a
    proper file name;
  * "Print Original-Style Record" pressed with the browser's print stubbed: it asks to print once; on the print layout the
    document alone, its grids within A4, an empty box printing empty, no month-named date, the format number and the typed
    words on it; the browser's PDF saved, its pages counted, a blank page, words at the edge, or content within 3.5 mm of the
    paper's top or bottom named; after printing the page is back as it was.
Results: <OUT_DIR>/results-<shard>.jsonl, the files in xlsx/ and docx/, the printouts in print/. Then open the files in the
real Excel and Word with tests/office_open_check.ps1.

Run:  python -I tests/check_all_documents.py            (all documents; LIST=1 only lists them)
      SHARD=0/3 ... SHARD=2/3                            (three side by side)
      python -I tests/check_all_documents.py hr-competence qc-viscosity   (only these)
Needs Python 3.12 with playwright, openpyxl, python-docx and pymupdf. OUT_DIR is made beside this file unless absolute.
"""
import json
import os
import re
import sys
import time
import traceback
import zipfile
import xml.etree.ElementTree as ET

import openpyxl
import docx as pydocx  # noqa: F401  (opened to prove python-docx reads the file)
import pymupdf
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, os.environ.get("OUT_DIR", "alldocs"))
EMAIL, PASSWORD = "admin@gpp.local", "Local@12345"
SHARD_I, SHARD_N = (int(x) for x in os.environ.get("SHARD", "0/1").split("/"))
ONLY = sys.argv[1:]
MARKS_PER_DOC = 8

MONTH_NAMED_DATE = re.compile(r"\b\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2,4}\b")
STUB_PRINT = "() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }"
BEFORE_PRINT = "() => window.dispatchEvent(new Event('beforeprint'))"
END_PRINT = "() => window.dispatchEvent(new Event('afterprint'))"
PRINTED = r"""
  () => {
    const shown = (el) => !!el && el.getClientRects().length > 0;
    const docs = Array.from(document.querySelectorAll('[data-print-doc]')).filter(shown);
    const inDoc = (el) => docs.some((d) => d.contains(el));
    const outside = (sel) => Array.from(document.querySelectorAll(sel)).filter((el) => shown(el) && !inDoc(el));
    const desc = (el) => (el.getAttribute('data-action') || el.className || el.tagName) + ':' + (el.textContent || '').trim().slice(0, 30);
    return {
      documents: docs.length,
      sidebar: shown(document.querySelector('.app-sidebar')),
      topbar: shown(document.querySelector('.app-topbar')),
      buttons: outside('button').map(desc).slice(0, 8),
      headings: outside('h1, h2').map(desc).slice(0, 5),
      history: outside('.record-history').length,
      assistant: outside('.assistant-widget, .assistant-panel, [data-section="assistant"]').length,
      banners: outside('.correction-banner, .prepared-banner, .agreement-card').map(desc).slice(0, 5),
      emptyShown: Array.from(document.querySelectorAll('[data-print-doc] input[type="date"], [data-print-doc] input[type="time"], [data-print-doc] select'))
        .filter((el) => shown(el) && el.value === '' && !['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(el).webkitTextFillColor))
        .map((el) => el.getAttribute('data-bind') || el.getAttribute('data-field') || el.outerHTML.slice(0, 80)),
      framed: docs.length > 0 && docs.every((d) => d.matches('[data-frame]') || d.querySelector('[data-frame]') !== null),
      paperLeft: (() => { const el = document.querySelector('[data-print-doc] [data-paper-left]'); return el ? Number(el.getAttribute('data-paper-left')) : null; })(),
      page: document.documentElement.dataset.printPage || 'portrait',
      paper: (() => { const el = document.querySelector('[data-print-doc][data-paper], [data-print-doc] [data-paper]'); return el ? el.getAttribute('data-paper') : null; })(),
      zoom: docs.map((d) => d.style.zoom || ''),
      widestTable: Math.max(0, ...Array.from(document.querySelectorAll('[data-print-doc] table')).filter(shown).map((t) => { const w = t.style.width; t.style.width = 'min-content'; const r = t.getBoundingClientRect().width; t.style.width = w; return r; })),
      parts: docs.filter((d) => d.querySelector('.paper-sheet')).map((d) => [!!d.querySelector('.paper-head .doc-header'), !!d.querySelector('.paper-body table'), !!d.querySelector('.paper-foot')]),
      shownText: docs.map((d) => d.innerText).join('\n'),
      values: Array.from(document.querySelectorAll('[data-print-doc] input, [data-print-doc] textarea, [data-print-doc] select')).filter(shown).map((e) => e.value).filter((v) => v),
    };
  }
"""
PRINTABLE = {"portrait": (210 - 24) * 96 / 25.4, "landscape": (297 - 24) * 96 / 25.4}
PRINTABLE_FRAMED = {"portrait": (210 - 2 * 8.446) * 96 / 25.4, "landscape": (297 - 2 * 8.446) * 96 / 25.4}

LIST_JS = r"""
  () => Array.from(document.querySelectorAll('tr[data-library-document]')).map((tr) => ({
    id: tr.getAttribute('data-library-document'),
    module: (tr.closest('[data-library-module]') || {getAttribute: () => ''}).getAttribute('data-library-module'),
    name: (tr.querySelector('td .font-semibold') || {textContent: ''}).textContent.trim(),
    formatNo: tr.children[1].textContent.trim().replace(/\s*\(Rev [^)]*\)\s*$/, ''),
    recordable: !!tr.querySelector("[data-action='new-record']"),
  }))
"""


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
            try:
                g.first.click(timeout=1500)
            except Exception:
                pass
            page.wait_for_timeout(200)
    for sel in ("button[aria-label='Close assistant']",):
        b = page.locator(sel)
        if b.count():
            try:
                b.first.click(timeout=1000)
                page.wait_for_timeout(150)
            except Exception:
                pass
    settle_briefing(page)


def sign_in(page):
    page.goto(f"{BASE}/")
    page.wait_for_timeout(800)
    if page.locator(".app-sidebar").count() == 0:
        page.fill("#login-email", EMAIL)
        page.fill("#login-password", PASSWORD)
        page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1500)
    dismiss(page)


def goto(page, route, wait=1500):
    page.goto(f"{BASE}/{route}")
    page.wait_for_timeout(wait)
    dismiss(page)


def list_documents(page):
    goto(page, "#/library", 2500)
    docs = page.evaluate(LIST_JS)
    return docs


# ---------------------------------------------------------------------------------------------- the files


def parts_ok(path):
    problems = []
    with zipfile.ZipFile(path) as z:
        bad = z.testzip()
        if bad:
            problems.append(f"corrupt zip member {bad}")
        names = z.namelist()
        try:
            ct = ET.fromstring(z.read("[Content_Types].xml"))
        except Exception as e:  # noqa: BLE001
            return [f"[Content_Types].xml unreadable: {e}"]
        ns = "{http://schemas.openxmlformats.org/package/2006/content-types}"
        defaults = {d.get("Extension").lower() for d in ct.iter(f"{ns}Default")}
        overrides = {o.get("PartName") for o in ct.iter(f"{ns}Override")}
        for n in names:
            if n == "[Content_Types].xml" or n.endswith("/"):
                continue
            ext = n.rsplit(".", 1)[-1].lower() if "." in n else ""
            if f"/{n}" not in overrides and ext not in defaults:
                problems.append(f"no content type for part {n}")
            if n.endswith(".xml") or n.endswith(".rels"):
                try:
                    ET.fromstring(z.read(n))
                except Exception as e:  # noqa: BLE001
                    problems.append(f"part {n} is not well-formed XML: {str(e)[:120]}")
        for o in overrides:
            if o.lstrip("/") not in names:
                problems.append(f"content type for a missing part {o}")
        for n in names:
            if not n.endswith(".rels"):
                continue
            base = n.replace("_rels/", "").replace(".rels", "")
            folder = base.rsplit("/", 1)[0] + "/" if "/" in base else ""
            for rel in ET.fromstring(z.read(n)).iter("{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"):
                if rel.get("TargetMode") == "External":
                    continue
                target = rel.get("Target")
                full = target.lstrip("/") if target.startswith("/") else os.path.normpath(folder + target).replace("\\", "/")
                if full not in names:
                    problems.append(f"{n}: relationship to a missing part {target}")
    return problems


W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def docx_texts(path):
    """Every paragraph's words in the body, headers, footers, text boxes and nested tables (python-docx proves it opens)."""
    pydocx.Document(path)
    texts = []
    with zipfile.ZipFile(path) as z:
        for n in z.namelist():
            if not re.match(r"word/(document|header\d*|footer\d*)\.xml$", n):
                continue
            root = ET.fromstring(z.read(n))
            for p in root.iter(f"{W}p"):
                t = "".join(x.text or "" for x in p.iter(f"{W}t"))
                if t.strip():
                    texts.append(t)
    return texts


def xlsx_texts(path):
    wb = openpyxl.load_workbook(path)
    visible = [ws for ws in wb.worksheets if ws.sheet_state == "visible"]
    texts = []
    setup = []
    for ws in visible:
        for row in ws.iter_rows(values_only=True):
            for v in row:
                if v is not None and str(v).strip():
                    texts.append(str(v))
        ps = ws.page_setup
        fit = ws.sheet_properties.pageSetUpPr.fitToPage if ws.sheet_properties.pageSetUpPr is not None else None
        setup.append({
            "sheet": ws.title, "orientation": ps.orientation, "paper": ps.paperSize, "fitToPage": fit,
            "fitW": ps.fitToWidth, "fitH": ps.fitToHeight, "scale": ps.scale, "maxCol": ws.max_column, "maxRow": ws.max_row,
            "printArea": ws.print_area if hasattr(ws, "print_area") else None,
        })
    return texts, [ws.title for ws in visible], setup


def fmt_pattern(fmt_no):
    return re.compile(re.escape(fmt_no).replace("/", "[/-]").replace("\\/", "[/-]").replace("\\-", "[/-]").replace(r"\ ", r"\s*"), re.I)


DATEISH = re.compile(r"^\s*\d{1,4}[-./]\d{1,2}[-./]\d{2,4}\s*$|^\s*\d{1,2}:\d{2}\s*$")


def norm(t):
    return re.sub(r"\s+", " ", str(t)).strip().lower()


def check_file(kind, path, suggested, fmt_no, marks, screen_cells=()):
    issues = []
    info = {}
    try:
        issues += parts_ok(path)
    except zipfile.BadZipFile as e:
        return [f"not a zip file: {e}"], info
    try:
        if kind == "xlsx":
            texts, visible, setup = xlsx_texts(path)
            info["sheets"] = visible
            info["setup"] = setup
            if not visible:
                issues.append("no visible sheet")
        else:
            texts = docx_texts(path)
        if len(texts) < 3:
            issues.append(f"nearly empty ({len(texts)} texts)")
    except Exception as e:  # noqa: BLE001
        issues.append(f"{'openpyxl' if kind == 'xlsx' else 'python-docx'} cannot open it: {type(e).__name__}: {str(e)[:160]}")
        texts = []
    joined = "\n".join(texts)
    info["chars"] = len(joined)
    if fmt_no and not fmt_no.upper().startswith("TO BE") and not fmt_pattern(fmt_no).search(joined):
        issues.append(f"format number {fmt_no} not in the file")
    missing = [m for m in marks if m not in joined]
    if missing:
        issues.append(f"typed words missing from the file: {len(missing)} of {len(marks)} ({', '.join(missing[:4])})")
    info["marksFound"] = len(marks) - len(missing)
    sample = [c for c in dict.fromkeys(norm(c) for c in screen_cells) if len(c) >= 3 and not DATEISH.match(c) and not re.fullmatch(r"[\d.,%\s-]+", c)][:200]
    if sample:
        hay = norm(joined)
        lost = [c for c in sample if c not in hay]
        info["coverage"] = round(1 - len(lost) / len(sample), 3)
        info["lostCells"] = lost[:12]
    if not suggested.lower().endswith("." + kind):
        issues.append(f"file named {suggested!r}, not .{kind}")
    if "TO BE CONFIRMED" in suggested or re.search(r'[<>:"|?*\\/]', suggested) or "undefined" in suggested or "null" in suggested.lower().split(".")[0].split():
        issues.append(f"bad file name {suggested!r}")
    if os.path.getsize(path) < 1500:
        issues.append(f"tiny file ({os.path.getsize(path)} bytes)")
    return issues, info


# ---------------------------------------------------------------------------------------------- the record page


def fill_marks(page, idx):
    """Unique words into up to MARKS_PER_DOC typing boxes of the document, spread over it; the ones that stayed are returned."""
    handles = page.query_selector_all(
        "[data-print-doc] input[type='text'], [data-print-doc] input:not([type]), [data-print-doc] textarea"
    )
    usable = []
    for h in handles:
        try:
            ok = h.evaluate(
                """(e) => {
                     if (e.disabled || e.readOnly) return false;
                     if (e.closest('.doc-header, [data-section="doc-header"], .paper-head, [data-no-mark]')) return false;
                     if (e.getAttribute('list') || e.getAttribute('role') === 'combobox') return false;
                     const r = e.getBoundingClientRect();
                     if (r.width < 8 || r.height < 6) return false;
                     const s = getComputedStyle(e);
                     if (s.visibility === 'hidden' || s.display === 'none') return false;
                     if ((e.value || '').trim()) return false;
                     return true;
                   }"""
            )
        except Exception:
            ok = False
        if ok:
            usable.append(h)
    if not usable:
        return []
    step = max(1, len(usable) // MARKS_PER_DOC)
    chosen = usable[::step][:MARKS_PER_DOC]
    marks = []
    for k, h in enumerate(chosen):
        mark = f"ZQ{idx:03d}{k:02d}"
        try:
            h.scroll_into_view_if_needed(timeout=2000)
            h.fill(mark, timeout=3000)
            h.evaluate("(e) => e.blur()")
            marks.append((h, mark))
        except Exception:
            pass
    page.wait_for_timeout(1300)
    kept = []
    for h, mark in marks:
        try:
            if mark in (h.input_value() or ""):
                kept.append(mark)
        except Exception:
            pass
    # The page may have drawn the box anew: the words are where the document shows them.
    if len(kept) < len(marks):
        shown = page.evaluate("() => Array.from(document.querySelectorAll('[data-print-doc] input, [data-print-doc] textarea')).map(e => e.value).join(' ') + ' ' + Array.from(document.querySelectorAll('[data-print-doc]')).map(d => d.innerText).join(' ')")
        kept = [m for _, m in marks if m in shown]
    return kept


def download_buttons(page):
    return page.locator("[data-action='download-document'], [data-action='download-document-word'], [data-action='download-document-excel']")


def print_button(page, on_record):
    b = page.locator("button:has-text('Print Original-Style Record')")
    if b.count():
        return b.first, "Print Original-Style Record"
    b = page.locator(".app-content button:has-text('Print')")
    if b.count():
        return b.first, (b.first.text_content() or "").strip()
    return None, None


def pdf_report(path):
    d = pymupdf.open(path)
    pages = []
    for pg in d:
        w, h = pg.rect.width, pg.rect.height
        words = pg.get_text("words")
        drawings = len(pg.get_drawings())
        cut = [x[4] for x in words if x[2] > w - 4 or x[3] > h - 4 or x[0] < 2]
        # Ruled lines only (a thin stroke or a thin filled bar): a box's background or a page section's white is not ink.
        rules = [r["rect"] for r in pg.get_drawings() if (r["rect"].height < 3 or r["rect"].width < 3) and not (r.get("fill") in ((1.0, 1.0, 1.0),) and r.get("color") is None)]
        ys0 = [x[1] for x in words] + [r.y0 for r in rules]
        ys1 = [x[3] for x in words] + [r.y1 for r in rules]
        top = (min(ys0) * 25.4 / 72) if ys0 else None
        bottom = ((h - max(ys1)) * 25.4 / 72) if ys1 else None
        pages.append({"orient": "landscape" if w > h else "portrait", "words": len(words), "drawings": drawings, "cut": cut[:5], "top": top, "bottom": bottom})
    return pages


def check_print(page, doc, slug, marks, on_record):
    issues = []
    info = {}
    btn, label = print_button(page, on_record)
    info["button"] = label
    if btn is None:
        return ["no Print button on the page"], info
    if on_record and label != "Print Original-Style Record":
        issues.append(f"the record page's print button reads {label!r}")
    page.evaluate(STUB_PRINT)
    btn.scroll_into_view_if_needed(timeout=3000)
    btn.click(timeout=5000)
    page.wait_for_timeout(500)
    printed = page.evaluate("() => window.__printed")
    if printed != 1:
        issues.append(f"Print asked the browser to print {printed} times")
    page.evaluate(BEFORE_PRINT)
    page.emulate_media(media="print")
    try:
        seen = page.evaluate(PRINTED)
        pdf_path = os.path.join(OUT, "print", f"{slug}.pdf")
        page.pdf(path=pdf_path, prefer_css_page_size=True, print_background=True)
    finally:
        page.emulate_media(media="screen")
        page.evaluate(END_PRINT)
    page.wait_for_timeout(300)
    if seen["documents"] < 1:
        issues.append("no document on the printout")
    around = {k: seen[k] for k in ("sidebar", "topbar", "buttons", "headings", "history", "assistant", "banners") if seen[k]}
    if around:
        issues.append(f"printed around the document: {around}")
    if seen["emptyShown"]:
        issues.append(f"empty boxes print the browser's words: {seen['emptyShown'][:4]}")
    kind = seen["page"]
    limit = (PRINTABLE_FRAMED if seen.get("framed") else PRINTABLE)[kind]
    if seen.get("paperLeft") is not None:
        limit = ((297 if kind == "landscape" else 210) - seen["paperLeft"] - 2) * 96 / 25.4
    if doc["id"] == "fly-catcher" or doc.get("formatNo") == "F/HR/18":
        limit = 794 - 38.3 - 20
    info["page"] = kind
    info["paper"] = seen["paper"]
    info["widest"] = round(seen["widestTable"])
    info["limit"] = round(limit)
    info["zoom"] = seen["zoom"][:2]
    if seen["widestTable"] > limit + 2:
        issues.append(f"a grid is wider than A4 {kind}: {round(seen['widestTable'])} px > {round(limit)} px")
    if seen["paper"] and seen["paper"] != kind:
        issues.append(f"printed {kind}, the paper is {seen['paper']}")
    if seen["parts"] and not all(p[0] and p[2] for p in seen["parts"]):
        issues.append(f"sheet parts (head, body, foot): {seen['parts']}")
    words = seen["shownText"] + " " + " ".join(seen["values"])
    named = sorted({m.group(0) for m in MONTH_NAMED_DATE.finditer(words)})
    if named:
        issues.append(f"month-named dates on the paper: {named[:4]}")
    fmt = doc.get("formatNo") or ""
    if fmt and not fmt.upper().startswith("TO BE") and not fmt_pattern(fmt).search(words):
        issues.append(f"format number {fmt} not on the printout")
    missing = [m for m in marks if m not in words]
    if missing:
        issues.append(f"typed words missing from the printout: {missing[:4]}")
    if "undefined" in seen["shownText"] or "NaN" in re.findall(r"\bNaN\b", seen["shownText"]) or "[object Object]" in seen["shownText"]:
        issues.append("'undefined' / 'NaN' / '[object Object]' on the paper")
    back = page.evaluate("() => document.querySelectorAll('.print-scope-hidden, .print-scope-ancestor').length") == 0 and page.locator(".app-sidebar").is_visible()
    if not back:
        issues.append("after printing the page is not back as it was")
    try:
        pages = pdf_report(pdf_path)
        info["pdfPages"] = [f"{p['orient'][0]}{p['words']}" for p in pages]
        blank = [i + 1 for i, p in enumerate(pages) if p["words"] == 0 and p["drawings"] < 3]
        if blank:
            issues.append(f"blank page(s) in the printout: {blank} of {len(pages)}")
        edge = [(i + 1, round(p["top"], 1), round(p["bottom"], 1)) for i, p in enumerate(pages) if p["top"] is not None and (p["top"] < 3.5 or p["bottom"] < 3.5)]
        if edge:
            issues.append(f"content within 3.5 mm of the paper's edge (page, top mm, bottom mm): {edge[:4]}")
        info["margins"] = [f"{round(p['top'] or 0)}/{round(p['bottom'] or 0)}" for p in pages]
        cut = [(i + 1, p["cut"]) for i, p in enumerate(pages) if p["cut"]]
        if cut:
            issues.append(f"words at the page's edge (cut?): {cut[:3]}")
        orients = {p["orient"] for p in pages}
        if len(orients) == 1 and kind not in orients:
            issues.append(f"the PDF is {orients}, the page chosen was {kind}")
    except Exception as e:  # noqa: BLE001
        issues.append(f"PDF unreadable: {e}")
    return issues, info


def slug_of(doc):
    return re.sub(r"[^A-Za-z0-9_-]+", "_", doc["id"])


def run_doc(page, doc, idx, errors):
    row = {"id": doc["id"], "module": doc["module"], "name": doc["name"], "formatNo": doc["formatNo"], "route": None, "files": [], "print": None, "issues": []}
    slug = slug_of(doc)
    on_record = False
    if doc["recordable"]:
        goto(page, "#/library", 1200)
        btn = page.locator(f"[data-action='new-record'][data-document='{doc['id']}']")
        if btn.count() == 0:
            row["issues"].append("New is not offered in the library")
            return row
        btn.first.evaluate("el => el.click()")
        page.wait_for_timeout(1800)
        dismiss(page)
        on_record = "#/record/" in page.url
        if not on_record:
            row["issues"].append(f"New did not open a record page (at {page.url.split('#', 1)[-1]})")
    else:
        goto(page, "#/library", 1200)
        btn = page.locator(f"[data-action='open-document'][data-document='{doc['id']}']")
        if btn.count() == 0:
            row["issues"].append("Open Document is not offered in the library")
            return row
        btn.first.evaluate("el => el.click()")
        page.wait_for_timeout(1800)
        dismiss(page)
    row["route"] = page.url.split("#", 1)[-1]
    page.wait_for_selector("[data-print-doc]", timeout=15000, state="attached")
    # long sheets are drawn bit by bit: let them finish
    page.wait_for_timeout(600)
    marks = []
    if on_record:
        try:
            marks = fill_marks(page, idx)
        except Exception as e:  # noqa: BLE001
            row["issues"].append(f"typing into the record failed: {e}")
    row["marks"] = marks
    screen_cells = page.evaluate("() => Array.from(document.querySelectorAll('[data-print-doc] td, [data-print-doc] th')).filter(e => e.getClientRects().length && !e.querySelector('td, th')).map(e => e.innerText).filter(t => t && t.trim()).slice(0, 2000)")
    # the downloads
    n = download_buttons(page).count()
    kinds = []
    for i in range(n):
        b = download_buttons(page).nth(i)
        kind = b.get_attribute("data-format")
        kinds.append(kind)
        try:
            with page.expect_download(timeout=120000) as dl:
                b.scroll_into_view_if_needed(timeout=3000)
                b.click(timeout=5000)
            d = dl.value
            suggested = d.suggested_filename
            path = os.path.join(OUT, kind, f"{slug}.{kind}")
            d.save_as(path)
            issues, info = check_file(kind, path, suggested, doc["formatNo"], marks, screen_cells)
            row["files"].append({"kind": kind, "name": suggested, "bytes": os.path.getsize(path), "issues": issues, **info})
        except Exception as e:  # noqa: BLE001
            row["files"].append({"kind": kind, "name": None, "bytes": 0, "issues": [f"no download: {type(e).__name__}: {str(e)[:200]}"]})
        page.wait_for_timeout(300)
    row["kinds"] = kinds
    if sorted(set(kinds)) != ["docx", "xlsx"]:
        row["issues"].append(f"download buttons offer {kinds or 'nothing'}, not Excel and Word both")
    # the print
    try:
        issues, info = check_print(page, doc, slug, marks, on_record)
        row["print"] = {"issues": issues, **info}
    except Exception as e:  # noqa: BLE001
        row["print"] = {"issues": [f"print check failed: {type(e).__name__}: {str(e)[:300]}"]}
    return row


def main():
    for sub in ("xlsx", "docx", "print"):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        page = ctx.new_page()
        page.route("**/translate_a/**", lambda route: route.abort())
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.on("console", lambda m: errors.append("console.error: " + m.text[:300]) if m.type == "error" and "favicon" not in m.text and "net::ERR" not in m.text else None)
        page.on("dialog", lambda d: d.dismiss())
        sign_in(page)
        list_path = os.path.join(OUT, "documents.json")
        if os.environ.get("LIST") == "1" or not os.path.exists(list_path):
            docs = list_documents(page)
            with open(list_path, "w", encoding="utf-8") as f:
                json.dump(docs, f, indent=1)
            by = {}
            for d in docs:
                by.setdefault(d["module"], []).append(d)
            print(f"{len(docs)} documents: " + ", ".join(f"{m} {len(v)}" for m, v in by.items()))
            print(f"  holding records: {sum(1 for d in docs if d['recordable'])}")
            if os.environ.get("LIST") == "1":
                return
        with open(list_path, encoding="utf-8") as f:
            docs = json.load(f)
        out_path = os.path.join(OUT, f"results-{SHARD_I}.jsonl")
        done = set()
        if os.path.exists(out_path) and not ONLY:
            with open(out_path, encoding="utf-8") as f:
                for line in f:
                    try:
                        done.add(json.loads(line)["id"])
                    except Exception:
                        pass
        for idx, doc in enumerate(docs):
            if ONLY and doc["id"] not in ONLY:
                continue
            if not ONLY and idx % SHARD_N != SHARD_I:
                continue
            if doc["id"] in done:
                continue
            errors.clear()
            t0 = time.time()
            try:
                row = run_doc(page, doc, idx, errors)
            except Exception:  # noqa: BLE001
                row = {"id": doc["id"], "module": doc["module"], "name": doc["name"], "formatNo": doc["formatNo"], "files": [], "print": None,
                       "issues": ["script error: " + traceback.format_exc()[-700:]]}
            if errors:
                row["issues"].append("page errors: " + " | ".join(dict.fromkeys(errors))[:900])
            row["seconds"] = round(time.time() - t0, 1)
            bad = row["issues"] or any(f["issues"] for f in row["files"]) or (row["print"] and row["print"]["issues"])
            print(f"[{'FAIL' if bad else 'PASS'}] {doc['module']} | {doc['formatNo']} | {doc['id']} ({row['seconds']}s) " +
                  ", ".join(f"{f['kind']} {f['bytes']}B" for f in row["files"]) +
                  (f" | print {row['print'].get('page')} {row['print'].get('pdfPages')}" if row["print"] else "") + f" | marks {len(row.get('marks', []))}", flush=True)
            for f in row["files"]:
                for i in f["issues"]:
                    print(f"       {f['kind']}: {i}", flush=True)
            if row["print"]:
                for i in row["print"]["issues"]:
                    print(f"       print: {i}", flush=True)
            for i in row["issues"]:
                print(f"       {i}", flush=True)
            mode = "a"
            with open(out_path, mode, encoding="utf-8") as f:
                f.write(json.dumps(row) + "\n")
        browser.close()


if __name__ == "__main__":
    main()
