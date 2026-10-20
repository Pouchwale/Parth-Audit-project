"""Shared helpers of the QC visual-parity kit: render a PDF to PNG pages, extract its words and rule segments, wrap a photograph
into a one-page PDF, and the paths the kit reads and writes.

Units: pdfplumber's points (1/72 in) are kept in the JSON files ("pt"); the comparison converts to millimetres.
"""
import hashlib
import json
import os
import re
import sys

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SOURCE_DOCUMENTS = os.path.join(ROOT, "source-documents")
DPI = 110
PT_TO_MM = 25.4 / 72.0
DEFAULT_OUT = "C:/Users/parth/AppData/Local/Temp/claude/C--Users-parth-Desktop-Audit-project/5e4fa497-273b-4740-9cf3-9b5fe252f310/scratchpad/qc-visual"
# Ports the kit never uses: the owner's phone test, the e2e suites, the usual dev servers.
FORBIDDEN_PORTS = {3000, 4000, 4100, 8081, 8090, 8842, 8843, 5432, 5433}


def say(*a):
    print(*a, flush=True)


def safe(name):
    s = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")
    return s or "x"


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def render_pages(pdf_path, out_dir, prefix="page", dpi=DPI):
    """Every page of a PDF as PNG at `dpi`; returns the file names."""
    os.makedirs(out_dir, exist_ok=True)
    pdf = pdfium.PdfDocument(pdf_path)
    names = []
    try:
        for i in range(len(pdf)):
            img = pdf[i].render(scale=dpi / 72.0).to_pil().convert("RGB")
            name = f"{prefix}-{i + 1}.png"
            img.save(os.path.join(out_dir, name))
            names.append(name)
    finally:
        pdf.close()
    return names


def _merge_segments(segs, tol=0.35):
    """Collinear, touching or overlapping segments of one orientation become one: a table drawn cell by cell is one rule."""
    out = []
    for orient in ("h", "v"):
        group = [s for s in segs if s["orient"] == orient]
        key = (lambda s: (round(s["top"] / tol), s["x0"])) if orient == "h" else (lambda s: (round(s["x0"] / tol), s["top"]))
        group.sort(key=key)
        cur = None
        for s in group:
            if cur is not None and cur["orient"] == orient:
                same = abs(cur["top"] - s["top"]) <= tol if orient == "h" else abs(cur["x0"] - s["x0"]) <= tol
                if orient == "h":
                    touching = same and s["x0"] <= cur["x1"] + 1.0
                else:
                    touching = same and s["top"] <= cur["bottom"] + 1.0
                if touching:
                    cur["x1"] = max(cur["x1"], s["x1"])
                    cur["bottom"] = max(cur["bottom"], s["bottom"])
                    cur["width"] = max(cur["width"], s["width"])
                    continue
            if cur is not None:
                out.append(cur)
            cur = dict(s)
        if cur is not None:
            out.append(cur)
    return out


def page_rules(page):
    """Rule segments of a pdfplumber page: lines, and the edges of stroked rectangles; a rectangle thinner than 1.6 pt is a rule itself."""
    segs = []
    thin = 1.6

    def add(orient, x0, x1, top, bottom, width):
        segs.append({"orient": orient, "x0": round(x0, 2), "x1": round(x1, 2), "top": round(top, 2), "bottom": round(bottom, 2), "width": round(width, 2)})

    for ln in page.lines:
        x0, x1, top, bottom = ln["x0"], ln["x1"], ln["top"], ln["bottom"]
        w = ln.get("linewidth") or 0.5
        if abs(top - bottom) < 0.6 and abs(x1 - x0) >= 0.6:
            add("h", x0, x1, (top + bottom) / 2, (top + bottom) / 2, w)
        elif abs(x1 - x0) < 0.6 and abs(bottom - top) >= 0.6:
            add("v", (x0 + x1) / 2, (x0 + x1) / 2, top, bottom, w)
    for r in page.rects:
        x0, x1, top, bottom = r["x0"], r["x1"], r["top"], r["bottom"]
        w, h = x1 - x0, bottom - top
        if w < 0.5 and h < 0.5:
            continue
        if h <= thin and w > h:  # a drawn horizontal rule
            add("h", x0, x1, (top + bottom) / 2, (top + bottom) / 2, max(h, 0.25))
        elif w <= thin and h > w:  # a drawn vertical rule
            add("v", (x0 + x1) / 2, (x0 + x1) / 2, top, bottom, max(w, 0.25))
        elif r.get("stroke"):  # a stroked box: its four edges
            lw = r.get("linewidth") or 0.5
            add("h", x0, x1, top, top, lw)
            add("h", x0, x1, bottom, bottom, lw)
            add("v", x0, x0, top, bottom, lw)
            add("v", x1, x1, top, bottom, lw)
    return _merge_segments(segs)


def extract_pdf(pdf_path):
    """Words (text, x0, x1, top, bottom, size, font), rule segments and page boxes of every page, in points."""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for p in pdf.pages:
            words = []
            for w in p.extract_words(keep_blank_chars=False, use_text_flow=False, extra_attrs=["fontname", "size"], x_tolerance=1.5, y_tolerance=2):
                words.append(
                    {
                        "text": w["text"],
                        "x0": round(w["x0"], 2),
                        "x1": round(w["x1"], 2),
                        "top": round(w["top"], 2),
                        "bottom": round(w["bottom"], 2),
                        "size": round(float(w.get("size") or 0), 2),
                        "font": str(w.get("fontname") or ""),
                    }
                )
            mb = p.mediabox
            pages.append(
                {
                    "width": round(float(p.width), 2),
                    "height": round(float(p.height), 2),
                    "mediabox": [round(float(v), 2) for v in mb],
                    "cropbox": [round(float(v), 2) for v in p.cropbox],
                    "rotation": int(p.rotation or 0),
                    "orientation": "landscape" if p.width > p.height else "portrait",
                    "words": words,
                    "rules": page_rules(p),
                }
            )
    return pages


def photo_to_pdf(photo_path, pdf_path, dpi=150):
    """The owner: 'convert them to PDFs if not already' - a photograph becomes a one-page PDF (the picture, at its own pixel size)."""
    img = Image.open(photo_path)
    try:
        from PIL import ImageOps

        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    img = img.convert("RGB")
    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
    img.save(pdf_path, "PDF", resolution=float(dpi))
    return img.size


def digest_geometry(pages, mask_dates=True):
    """A digest of a document's words and rules geometry, stable from one day to the next (a date's text is masked and only its
    place counts): the regression guard compares these."""
    date_like = re.compile(r"^(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{1,2}[-/.][A-Za-z]{3}[-/.]\d{2,4}|\d{1,2}:\d{2}(:\d{2})?)$")
    h = hashlib.sha256()
    for pg in pages:
        h.update(f"P{pg['width']:.0f}x{pg['height']:.0f}".encode())
        for w in pg["words"]:
            masked = mask_dates and bool(date_like.match(w["text"]))
            t = "<d>" if masked else w["text"]
            x1 = "" if masked else f"{round(w['x1'] * 2) / 2}"
            h.update(f"|{t}|{round(w['x0'] * 2) / 2}|{x1}|{round(w['top'] * 2) / 2}|{round(w['size'], 1)}".encode())
        for r in sorted(pg["rules"], key=lambda r: (r["orient"], r["top"], r["x0"], r["x1"], r["bottom"])):
            h.update(f"|{r['orient']}|{round(r['x0'] * 2) / 2}|{round(r['x1'] * 2) / 2}|{round(r['top'] * 2) / 2}|{round(r['bottom'] * 2) / 2}|{round(r['width'], 1)}".encode())
    return h.hexdigest()


def load_catalog(out_root=None, refresh=False):
    """The QC documents DCRS holds (catalog.mjs), cached as DIR/catalog.json; a list of dicts."""
    import subprocess

    cache = os.path.join(out_root or DEFAULT_OUT, "catalog.json")
    if refresh or not os.path.exists(cache):
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        subprocess.run(["node", "--no-warnings=ExperimentalWarning", os.path.join(HERE, "catalog.mjs"), "--out", cache], cwd=ROOT, check=True)
    return read_json(cache)
