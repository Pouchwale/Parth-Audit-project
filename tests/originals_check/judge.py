"""(a), (b), (c) of the originals check, and the report (tests/originals_check/README.md).

(a) the download read back without the app: every value DCRS showed is in it (a cell of the sheet, a content control of the
    Word file); the owner's own words that DCRS does not show and that are still in the file are listed, those that look like
    an entry (a date, a number, a code) flagged - the template came filled with his examples (REQUIREMENTS section 98); the
    round-trip map is whole (the "_dcrs" sheet and its names, or the custom XML part and the controls).
(b) Word or Excel export the download to PDF; it is held against the original's own PDF (source-documents/originals-pdf):
    pages, orientation, the original's words found at their place (within 6 pt), its rules found at their place (within 3 pt);
    a side-by-side picture of each page and a score.
(c) the page's own Upload changes read the download back (browse.upload_back, at capture time): "nothing to apply".
"""
import html
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ORIGINALS_PDF = os.path.join(ROOT, "source-documents", "originals-pdf")
TEMPLATES = os.path.join(ROOT, "frontend", "public", "originals")
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def norm(s):
    return re.sub(r"[^\w]+", " ", (s or "").lower()).strip()


# ---------------------------------------------------------------------------------------------------------------------
# reading a file's words

def xlsx_texts(path):
    """Every cell's words of the visible sheets (values as Excel shows them, cached formula results left out)."""
    import openpyxl

    wb = openpyxl.load_workbook(path, data_only=True)
    out = []
    for ws in wb.worksheets:
        if ws.sheet_state != "visible":
            continue
        for row in ws.iter_rows():
            for c in row:
                if c.value not in (None, ""):
                    v = c.value
                    if hasattr(v, "strftime"):
                        v = v.strftime("%d-%m-%y")
                    elif isinstance(v, float) and v.is_integer():
                        v = int(v)
                    out.append(str(v))
    return out


def shown_parts(z):
    """The Word file's body and the headers and footers its sections show (a spare one left in the file is not read)."""
    doc = z.read("word/document.xml").decode("utf-8", "replace")
    rels = z.read("word/_rels/document.xml.rels").decode("utf-8", "replace") if "word/_rels/document.xml.rels" in z.namelist() else ""
    targets = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels)) | {k: v for v, k in re.findall(r'Target="([^"]+)"[^>]*Id="([^"]+)"', rels)}
    used = set(re.findall(r'<w:(?:header|footer)Reference[^>]*r:id="([^"]+)"', doc))
    return ["word/document.xml"] + ["word/" + targets[r].lstrip("/").replace("word/", "") for r in used if r in targets]


def docx_parts_text(path):
    """Every paragraph's words of the body and the headers and footers it shows; and the content controls' words by tag."""
    from lxml import etree

    z = zipfile.ZipFile(path)
    paras, controls = [], {}
    for name in shown_parts(z):
        if name not in z.namelist():
            continue
        root = etree.fromstring(z.read(name))
        for p in root.iter(W + "p"):
            t = "".join((x.text or "") if x.tag == W + "t" else "\t" if x.tag == W + "tab" else "" for x in p.iter())
            if t.strip():
                paras.append(t)
        for sdt in root.iter(W + "sdt"):
            tag = sdt.find(f"{W}sdtPr/{W}tag")
            if tag is None:
                continue
            content = sdt.find(W + "sdtContent")
            text = "".join(x.text or "" for x in content.iter(W + "t")) if content is not None else ""
            controls[tag.get(W + "val")] = text
    return paras, controls


def bound_values(blocks):
    """Every bound value DCRS showed, with its label."""
    out = []

    def from_parts(parts):
        for p in parts or []:
            b = p.get("bind")
            if b:
                out.append({"text": b.get("text", ""), "label": b.get("label") or b.get("path", "")})

    for b in blocks:
        k = b["kind"]
        if k == "text":
            from_parts(b.get("parts"))
        elif k == "fields":
            for _, c in b["pairs"]:
                from_parts(c.get("parts"))
        elif k == "table":
            for r in b["rows"]:
                for c in r:
                    from_parts(c.get("parts"))
        elif k == "sheet":
            for c in b["cells"]:
                from_parts(c.get("parts"))
        elif k == "paper":
            for r in b["rows"]:
                for c in r["cells"]:
                    from_parts(c.get("parts"))
    return out


def page_words(blocks):
    """Every word DCRS's page shows (fixed words and values)."""
    words = []

    def add(t):
        if t:
            words.append(t)

    for b in blocks:
        k = b["kind"]
        if k == "text":
            add(b["text"])
        elif k == "fields":
            for l, c in b["pairs"]:
                add(l)
                add(c.get("text"))
        elif k == "table":
            for r in b["rows"]:
                for c in r:
                    add(c.get("text"))
        elif k == "sheet":
            for c in b["cells"]:
                add(c.get("text"))
        elif k == "paper":
            for r in b["rows"]:
                for c in r["cells"]:
                    add(c.get("text"))
    return words


BAND_WORDS = re.compile(r"F\s*[/-]\s*(QC|HR|SYS|MNT|PRD|PUR|MKT|DISP|STR)\s*[/-]\s*\d|^\s*(format|rev(ision)?\.?\s*no|effective date|issue date|date\s*:|page)", re.I)

ENTRY_LIKE = re.compile(r"(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})|(\b[A-Z]{2,}\d{3,}\b)|(\b\d{3,}\b)")


def check_a(doc_id, kind, download, blocks):
    out = {"kind": kind}
    template = os.path.join(TEMPLATES, f"{doc_id}.{kind}")
    if kind == "xlsx":
        texts = xlsx_texts(download)
        tpl_texts = xlsx_texts(template) if os.path.exists(template) else []
        z = zipfile.ZipFile(download)
        wb = z.read("xl/workbook.xml").decode("utf-8", "replace")
        names = len(re.findall(r'<definedName name="_dcrs_\d+"', wb))
        out["map"] = {"sheet": 'name="_dcrs"' in wb and 'state="veryHidden"' in wb, "names": names, "custom": "docProps/custom.xml" in z.namelist()}
        corpus = "\n".join(texts)
    else:
        paras, controls = docx_parts_text(download)
        tpl_paras, _ = docx_parts_text(template) if os.path.exists(template) else ([], {})
        texts, tpl_texts = paras, tpl_paras
        z = zipfile.ZipFile(download)
        maps = [n for n in z.namelist() if re.match(r"customXml/item\d+\.xml$", n) and b"dcrsMap" in z.read(n)]
        out["map"] = {"part": bool(maps), "controls": len([k for k in controls if k and k.startswith("dcrs:")]), "custom": "docProps/custom.xml" in z.namelist()}
        corpus = "\n".join(paras)
    values = [v for v in bound_values(blocks) if v["text"].strip()]
    ncorpus = norm(corpus)
    missing = [v for v in values if norm(v["text"]) and norm(v["text"]) not in ncorpus]
    out["values"] = len(values)
    out["valuesMissing"] = [f"{m['label']}: {m['text'][:40]}" for m in missing][:20]
    # The owner's own words still in the file that DCRS does not show anywhere.
    shown = norm("\n".join(page_words(blocks)))
    left = []
    for t in dict.fromkeys(tpl_texts):
        n = norm(t)
        if not n or n in shown or n not in ncorpus:
            continue
        # The band's own words (a format number with its revision, the revision's date) are the format's, never an entry.
        if BAND_WORDS.search(t):
            continue
        left.append(t.strip()[:60])
    out["leftover"] = left[:40]
    out["leftoverEntryLike"] = [t for t in left if ENTRY_LIKE.search(t)][:20]
    return out


# ---------------------------------------------------------------------------------------------------------------------
# (b) the download as PDF against the original's PDF

def export_pdfs(items, workdir):
    """[(download, kind, out_pdf)] exported by Word / Excel (hidden, quit at the end; only their own processes ended)."""
    sys.path.insert(0, os.path.join(ROOT, "scripts", "originals"))
    from convert import Office  # noqa: E402

    office = Office()
    done = {}
    try:
        for download, kind, out_pdf in items:
            tmp = os.path.join(workdir, f"dl-{len(done)}.{kind}")
            shutil.copyfile(download, tmp)
            try:
                if kind == "docx":
                    office.word_convert(tmp, None, out_pdf)
                else:
                    excel = office.get_excel()
                    wb = excel.Workbooks.Open(tmp, UpdateLinks=0, ReadOnly=True, AddToMru=False)
                    try:
                        wb.ExportAsFixedFormat(0, out_pdf)
                    finally:
                        wb.Close(False)
                done[download] = True
            except Exception as e:
                done[download] = f"{type(e).__name__}: {e}"
    finally:
        office.close()
    return done


def pdf_pages(path):
    import pdfplumber

    pages = []
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages:
            words = [{"t": w["text"], "x": w["x0"], "y": w["top"]} for w in pg.extract_words(keep_blank_chars=False, use_text_flow=True)]
            rules = []
            for ln in pg.lines + pg.rects:
                x0, x1, top, bottom = ln["x0"], ln["x1"], ln["top"], ln["bottom"]
                if abs(x1 - x0) >= 8 and abs(bottom - top) <= 3:
                    rules.append(("h", round(top, 1), round(x0, 1), round(x1, 1)))
                elif abs(bottom - top) >= 8 and abs(x1 - x0) <= 3:
                    rules.append(("v", round(x0, 1), round(top, 1), round(bottom, 1)))
                elif ln.get("object_type") == "rect" and abs(x1 - x0) >= 8 and abs(bottom - top) >= 8:
                    rules += [("h", round(top, 1), round(x0, 1), round(x1, 1)), ("h", round(bottom, 1), round(x0, 1), round(x1, 1)), ("v", round(x0, 1), round(top, 1), round(bottom, 1)), ("v", round(x1, 1), round(top, 1), round(bottom, 1))]
            pages.append({"w": float(pg.width), "h": float(pg.height), "words": words, "rules": rules})
    return pages


def compare_pdfs(orig, down):
    a, b = pdf_pages(orig), pdf_pages(down)
    out = {"pagesOriginal": len(a), "pagesDownload": len(b)}
    out["orientation"] = ["landscape" if p["w"] > p["h"] else "portrait" for p in a][:3], ["landscape" if p["w"] > p["h"] else "portrait" for p in b][:3]
    found_w = total_w = found_r = total_r = 0
    for i, pa in enumerate(a):
        pb = b[i] if i < len(b) else {"words": [], "rules": []}
        by_text = {}
        for w in pb["words"]:
            by_text.setdefault(w["t"], []).append(w)
        for w in pa["words"]:
            total_w += 1
            if any(abs(x["x"] - w["x"]) <= 6 and abs(x["y"] - w["y"]) <= 6 for x in by_text.get(w["t"], [])):
                found_w += 1
        for r in pa["rules"]:
            total_r += 1
            if any(r[0] == s[0] and abs(r[1] - s[1]) <= 3 and abs(r[2] - s[2]) <= 3 and abs(r[3] - s[3]) <= 3 for s in pb["rules"]):
                found_r += 1
    out["wordsAtPlace"] = round(found_w / total_w, 3) if total_w else 1.0
    out["rulesAtPlace"] = round(found_r / total_r, 3) if total_r else 1.0
    same_pages = 1.0 if len(a) == len(b) else 0.0
    same_orient = 1.0 if out["orientation"][0] == out["orientation"][1] else 0.0
    out["score"] = round(100 * (0.15 * same_pages + 0.1 * same_orient + 0.35 * out["wordsAtPlace"] + 0.4 * out["rulesAtPlace"]))
    return out


def side_by_side(orig, down, out_png, dpi=60, max_pages=2):
    import pypdfium2 as pdfium
    from PIL import Image, ImageDraw

    def render(path):
        pdf = pdfium.PdfDocument(path)
        try:
            return [pdf[i].render(scale=dpi / 72.0).to_pil().convert("RGB") for i in range(min(len(pdf), max_pages))]
        finally:
            pdf.close()

    left, right = render(orig), render(down)
    rows = max(len(left), len(right))
    if rows == 0:
        return False
    w = max([im.width for im in left + right] + [10])
    h = sum(max(left[i].height if i < len(left) else 0, right[i].height if i < len(right) else 0) for i in range(rows))
    sheet = Image.new("RGB", (w * 2 + 30, h + 30 * rows), "white")
    draw = ImageDraw.Draw(sheet)
    y = 0
    for i in range(rows):
        draw.text((5, y + 5), "ORIGINAL", fill="black")
        draw.text((w + 25, y + 5), "DOWNLOAD", fill="black")
        y += 20
        hh = 0
        if i < len(left):
            sheet.paste(left[i], (0, y))
            hh = left[i].height
        if i < len(right):
            sheet.paste(right[i], (w + 30, y))
            hh = max(hh, right[i].height)
        y += hh + 10
    sheet.save(out_png)
    return True


# ---------------------------------------------------------------------------------------------------------------------

def judge_all(docs, out, pdf=True):
    rows = []
    exports = []
    work = tempfile.mkdtemp(prefix="dcrs-origcheck-pdf-")
    for doc in docs:
        d = os.path.join(out, "docs", doc["id"])
        cap_path = os.path.join(d, "capture.json")
        if not os.path.exists(cap_path):
            continue
        cap = json.load(open(cap_path, encoding="utf-8"))
        row = {"id": doc["id"], "formatNo": doc.get("formatNo", ""), "template": (doc.get("template") or {}).get("original", ""), "downloadKind": cap.get("downloadKind"), "error": cap.get("error")}
        dl = os.path.join(d, "download", cap["download"]) if cap.get("download") else None
        row["download"] = cap.get("download")
        up = cap.get("upload") or {}
        row["c"] = "pass" if up.get("phase") == "preview" and up.get("applyCount", 0) == 0 and "nothing to apply" in (up.get("words") or "") else f"FAIL ({up.get('phase')}, {up.get('applyCount')}: {(up.get('words') or '')[:120]})"
        if dl and os.path.exists(dl):
            try:
                blocks = json.load(open(os.path.join(d, "blocks.json"), encoding="utf-8"))["blocks"]
                kind = "xlsx" if dl.lower().endswith(".xlsx") else "docx"
                row["isTemplate"] = is_template_file(dl, kind)
                row["a"] = check_a(doc["id"], kind, dl, blocks)
            except Exception as e:
                row["a"] = {"error": f"{type(e).__name__}: {e}"}
            orig_pdf = os.path.join(ORIGINALS_PDF, f"{doc['id']}.pdf")
            if pdf and os.path.exists(orig_pdf):
                down_pdf = os.path.join(d, "download.pdf")
                exports.append((dl, "xlsx" if dl.lower().endswith(".xlsx") else "docx", down_pdf, orig_pdf, row, d))
        rows.append(row)
    if exports:
        done = export_pdfs([(e[0], e[1], e[2]) for e in exports], work)
        for dl, kind, down_pdf, orig_pdf, row, d in exports:
            if done.get(dl) is True and os.path.exists(down_pdf):
                try:
                    row["b"] = compare_pdfs(orig_pdf, down_pdf)
                    side_by_side(orig_pdf, down_pdf, os.path.join(d, "side-by-side.png"))
                except Exception as e:
                    row["b"] = {"error": f"{type(e).__name__}: {e}"}
            else:
                row["b"] = {"error": str(done.get(dl))}
    shutil.rmtree(work, ignore_errors=True)
    write_json(os.path.join(out, "report.json"), rows)
    write_report(rows, out)
    print(f"{len(rows)} documents judged -> {os.path.join(out, 'report.md')}")
    return rows


def is_template_file(path, kind):
    """Whether the download is the owner's file (it carries his parts: a theme, his styles), not the generic one."""
    z = zipfile.ZipFile(path)
    names = z.namelist()
    if kind == "docx":
        return "word/theme/theme1.xml" in names or "word/settings.xml" in names
    return "xl/theme/theme1.xml" in names or any(n.startswith("xl/printerSettings") for n in names) or "docProps/app.xml" in names


def write_report(rows, out):
    lines = ["# Originals check", "", "Every download held against the owner's own file (REQUIREMENTS section 119). (a) the file read back; (b) its PDF against the original's PDF; (c) Upload changes on the page.", ""]
    lines.append("| Document | Format | Kind | Own file | (a) values | (a) leftovers (entry-like) | (a) map | (b) pages | (b) words / rules at place | Score | (c) |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in rows:
        a = r.get("a") or {}
        b = r.get("b") or {}
        m = a.get("map") or {}
        mp = ("ok" if m.get("sheet") and m.get("names") else "MISSING") if a.get("kind") == "xlsx" else ("ok" if m.get("part") and m.get("controls") else "MISSING") if a else "-"
        vals = f"{a.get('values', 0) - len(a.get('valuesMissing', []))}/{a.get('values', 0)}" if "values" in a else a.get("error", "-")
        left = f"{len(a.get('leftover', []))} ({len(a.get('leftoverEntryLike', []))})" if "leftover" in a else "-"
        pages = f"{b.get('pagesDownload', '-')}/{b.get('pagesOriginal', '-')}" if "pagesOriginal" in b else b.get("error", "-")[:40] if b else "-"
        wr = f"{b.get('wordsAtPlace', '-')} / {b.get('rulesAtPlace', '-')}" if "wordsAtPlace" in b else "-"
        lines.append(f"| {r['id']} | {r.get('formatNo', '')} | {r.get('downloadKind') or '-'} | {'yes' if r.get('isTemplate') else 'NO'} | {vals} | {left} | {mp} | {pages} | {wr} | {b.get('score', '-')} | {r.get('c')} |")
    lines.append("")
    for r in rows:
        a = r.get("a") or {}
        if a.get("valuesMissing") or a.get("leftoverEntryLike") or r.get("error"):
            lines.append(f"## {r['id']}")
            if r.get("error"):
                lines.append(f"- capture error: {r['error']}")
            if a.get("valuesMissing"):
                lines.append(f"- values not found in the file: {'; '.join(a['valuesMissing'])}")
            if a.get("leftoverEntryLike"):
                lines.append(f"- the owner's words left that look like entries: {'; '.join(a['leftoverEntryLike'])}")
            lines.append("")
    with open(os.path.join(out, "report.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    cards = []
    for r in rows:
        img = f"docs/{r['id']}/side-by-side.png"
        exists = os.path.exists(os.path.join(out, img))
        b = r.get("b") or {}
        cards.append(
            f"<section><h2>{html.escape(r['id'])} <small>{html.escape(r.get('formatNo') or '')} &middot; score {b.get('score', '-')} &middot; (c) {html.escape(str(r.get('c'))[:40])}</small></h2>"
            + (f'<img src="{img}" loading="lazy">' if exists else "<p>no picture</p>")
            + "</section>"
        )
    page = (
        "<!doctype html><html><head><meta charset='utf-8'><title>Originals check</title><style>body{font-family:system-ui,sans-serif;margin:16px;background:#fff;color:#111}"
        "section{margin:0 0 28px}img{max-width:100%;border:1px solid #ccc}h2{font-size:16px}small{color:#555;font-weight:normal}</style></head><body>"
        "<h1>Originals check: original | download</h1>" + "".join(cards) + "</body></html>"
    )
    with open(os.path.join(out, "gallery.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(page)
