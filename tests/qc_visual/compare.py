"""(d) COMPARE, per document and page: page count, orientation, content box; a side-by-side image (reference | DCRS | difference
overlay); words matched by text and reading order -> median dx, dy and size ratio after aligning the content boxes, and the words more
than 1.5 mm off; rule segments -> missing, extra, shifted by more than 1 mm; the header block's cell boundaries; fonts (family and
size); the number of grid lines and rows; a score 0-100 (100 = identical) and a list of concrete mismatches in plain words.
A photograph reference is compared by eye only (the side-by-side image): its score is -1.

THE SCORE (100) = pages 15 + orientation 10 + content box 10 + words 35 + rules 30.
  pages        15, less 7 for each page of difference
  orientation  10 when every page both sides have is turned the same way
  content box  10, falling to 0 as the box's width and height ratios drift 30 % from 1 (the ink: words and rules)
  words        35 x match share (2 x matched / (paper words + DCRS words)) x (0.8 position + 0.2 size), the position quality of a
               word falling from 1 at no offset to 0 at 10 mm; the size quality from 1 at the same size to 0 at 25 % off
  rules        30 x 2 x (matched + 0.5 shifted) / (paper rules + DCRS rules), a rule matched when it is the same way, overlaps
               and lies within 1 mm (shifted: within 6 mm)
Positions are in millimetres from the top-left of each page's content box (the box round every word and rule), so a page printed
with a different margin is not charged for the margin; the absolute offset of the box is reported beside it.
"""
import difflib
import math
import os
import re
import statistics
import sys
import unicodedata

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import refs  # noqa: E402

MM = common.PT_TO_MM
OFF_MM = 1.5
RULE_OK_MM = 1.0
RULE_NEAR_MM = 6.0


def norm(t):
    t = unicodedata.normalize("NFKC", t).lower().strip()
    return t.replace("–", "-").replace("—", "-").replace("’", "'").replace("‘", "'")


def ink_box(page):
    xs0, xs1, ys0, ys1 = [], [], [], []
    for w in page["words"]:
        xs0.append(w["x0"]); xs1.append(w["x1"]); ys0.append(w["top"]); ys1.append(w["bottom"])
    for r in page["rules"]:
        xs0.append(r["x0"]); xs1.append(r["x1"]); ys0.append(r["top"]); ys1.append(r["bottom"])
    if not xs0:
        return None
    return {"x0": min(xs0), "x1": max(xs1), "top": min(ys0), "bottom": max(ys1)}


def font_family(name):
    n = name.split("+", 1)[-1]
    base = re.split(r"[-,]", n)[0]
    base = re.sub(r"(?i)(mt|ps|psmt)$", "", base)
    return base.lower() or "?"


def font_profile(page):
    fam, sizes = {}, []
    for w in page["words"]:
        weight = max(1, len(w["text"]))
        key = (font_family(w["font"]), round(w["size"] * 2) / 2)
        fam[key] = fam.get(key, 0) + weight
        sizes.extend([w["size"]] * weight)
    return fam, sizes


def match_words(ref, dc, rbox, dbox):
    """Pairs of word indexes: in reading order by text first, then the rest by the same text nearest in place."""
    a = [norm(w["text"]) for w in ref]
    b = [norm(w["text"]) for w in dc]
    pairs = []
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ua, ub = set(), set()
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for i, j in zip(range(i1, i2), range(j1, j2)):
                pairs.append((i, j))
                ua.add(i); ub.add(j)
    by_text = {}
    for j, t in enumerate(b):
        if j not in ub:
            by_text.setdefault(t, []).append(j)
    for i, t in enumerate(a):
        if i in ua or t not in by_text or not by_text[t]:
            continue
        rx, ry = (ref[i]["x0"] - rbox["x0"]) * MM, (ref[i]["top"] - rbox["top"]) * MM
        best, bd = None, 1e9
        for j in by_text[t]:
            d = math.hypot((dc[j]["x0"] - dbox["x0"]) * MM - rx, (dc[j]["top"] - dbox["top"]) * MM - ry)
            if d < bd:
                best, bd = j, d
        if best is not None:  # the same word anywhere on the page is the same word, in another place (a large dx/dy says where)
            pairs.append((i, best))
            ua.add(i); ub.add(best); by_text[t].remove(best)
    return pairs, ua, ub


def runs(words, idxs, limit=10):
    """Missing / extra words as phrases: consecutive words (in reading order) joined."""
    out, cur, last = [], [], None
    for i in sorted(idxs):
        if last is not None and i != last + 1:
            out.append(" ".join(cur)); cur = []
        cur.append(words[i]["text"]); last = i
    if cur:
        out.append(" ".join(cur))
    more = max(0, len(out) - limit)
    return [o[:70] for o in out[:limit]], more


def match_rules(ref, dc, rbox, dbox):
    """Rule segments matched by orientation, overlap and place (mm from the content box); returns ok, shifted, missing, extra."""
    def rel(r, box):
        return {"orient": r["orient"], "a": (r["x0"] - box["x0"]) * MM if r["orient"] == "h" else (r["top"] - box["top"]) * MM,
                "b": (r["x1"] - box["x0"]) * MM if r["orient"] == "h" else (r["bottom"] - box["top"]) * MM,
                "pos": (r["top"] - box["top"]) * MM if r["orient"] == "h" else (r["x0"] - box["x0"]) * MM,
                "width": r["width"]}
    R = [rel(r, rbox) for r in ref]
    D = [rel(r, dbox) for r in dc]
    used = set()
    ok, shifted, missing, deltas, ratios = 0, 0, [], [], []
    for r in sorted(R, key=lambda r: -(r["b"] - r["a"])):
        best, bd = None, 1e9
        for k, d in enumerate(D):
            if k in used or d["orient"] != r["orient"]:
                continue
            lo, hi = max(r["a"], d["a"]), min(r["b"], d["b"])
            shorter = min(r["b"] - r["a"], d["b"] - d["a"])
            if hi - lo < max(0.3 * shorter, 0.5):
                continue
            dist = abs(d["pos"] - r["pos"])
            if dist < bd:
                best, bd = k, dist
        if best is not None and bd <= RULE_NEAR_MM:
            used.add(best)
            deltas.append(bd)
            if r["width"] > 0 and D[best]["width"] > 0:
                ratios.append(D[best]["width"] / r["width"])
            if bd <= RULE_OK_MM:
                ok += 1
            else:
                shifted += 1
                missing.append(("shifted", r, D[best], bd))
        else:
            missing.append(("missing", r, None, None))
    extra = [D[k] for k in range(len(D)) if k not in used]
    return ok, shifted, [m for m in missing], extra, ratios


def header_xs(rules, box, depth_mm=45):
    xs = sorted({round((r["x0"] - box["x0"]) * MM, 1) for r in rules if r["orient"] == "v" and (r["top"] - box["top"]) * MM <= depth_mm})
    merged = []
    for x in xs:
        if not merged or x - merged[-1] > 0.8:
            merged.append(x)
    return merged


def grid_stats(page, box):
    width = (box["x1"] - box["x0"]) * MM if box else 0
    hs = [r for r in page["rules"] if r["orient"] == "h"]
    vs = [r for r in page["rules"] if r["orient"] == "v"]
    long_ys = sorted({round(r["top"] / 1.0) for r in hs if (r["x1"] - r["x0"]) * MM >= 0.4 * width})
    return {"horizontal": len(hs), "vertical": len(vs), "rowLines": len(long_ys)}


def overlay_image(ref_img, dc_img, rbox, dbox, scale):
    """Red = on the paper only, cyan = in DCRS only, black = both; the DCRS page moved so the two content boxes' top-left corners meet."""
    ra = np.array(ref_img.convert("L"))
    da = np.array(dc_img.convert("L"))
    dx = int(round((rbox["x0"] - dbox["x0"]) * scale)) if rbox and dbox else 0
    dy = int(round((rbox["top"] - dbox["top"]) * scale)) if rbox and dbox else 0
    H = max(ra.shape[0], da.shape[0] + max(dy, 0)) + 4
    W = max(ra.shape[1], da.shape[1] + max(dx, 0)) + 4
    R = np.full((H, W), 255, np.uint8)
    D = np.full((H, W), 255, np.uint8)
    R[: ra.shape[0], : ra.shape[1]] = ra
    ys, xs = max(dy, 0), max(dx, 0)
    sy, sx = max(-dy, 0), max(-dx, 0)
    h = min(da.shape[0] - sy, H - ys)
    w = min(da.shape[1] - sx, W - xs)
    if h > 0 and w > 0:
        D[ys : ys + h, xs : xs + w] = da[sy : sy + h, sx : sx + w]
    out = np.stack([D, R, R], axis=-1)
    return Image.fromarray(out, "RGB")


def labelled(img, text, height=22):
    canvas = Image.new("RGB", (img.width, img.height + height), (255, 255, 255))
    canvas.paste(img, (0, height))
    ImageDraw.Draw(canvas).text((6, 5), text, fill=(0, 0, 0))
    return canvas


def hstack(images, gap=10):
    h = max(i.height for i in images)
    w = sum(i.width for i in images) + gap * (len(images) - 1)
    canvas = Image.new("RGB", (w, h), (170, 170, 170))
    x = 0
    for i in images:
        canvas.paste(i, (x, 0))
        x += i.width + gap
    return canvas


def compare_pages(rp, dp):
    """The measures of one pair of pages."""
    rbox, dbox = ink_box(rp), ink_box(dp)
    res = {"refBoxMm": None, "dcrsBoxMm": None}
    if rbox:
        res["refBoxMm"] = [round(rbox["x0"] * MM, 1), round(rbox["top"] * MM, 1), round((rbox["x1"] - rbox["x0"]) * MM, 1), round((rbox["bottom"] - rbox["top"]) * MM, 1)]
    if dbox:
        res["dcrsBoxMm"] = [round(dbox["x0"] * MM, 1), round(dbox["top"] * MM, 1), round((dbox["x1"] - dbox["x0"]) * MM, 1), round((dbox["bottom"] - dbox["top"]) * MM, 1)]
    res["_rbox"], res["_dbox"] = rbox, dbox
    if not (rbox and dbox):
        return res
    pairs, ua, ub = match_words(rp["words"], dp["words"], rbox, dbox)
    dxs, dys, sizes, off = [], [], [], []
    for i, j in pairs:
        r, d = rp["words"][i], dp["words"][j]
        dx = (d["x0"] - dbox["x0"] - (r["x0"] - rbox["x0"])) * MM
        dy = (d["top"] - dbox["top"] - (r["top"] - rbox["top"])) * MM
        dxs.append(dx); dys.append(dy)
        if r["size"] > 0 and d["size"] > 0:
            sizes.append(d["size"] / r["size"])
        if abs(dx) > OFF_MM or abs(dy) > OFF_MM:
            off.append((max(abs(dx), abs(dy)), r["text"], round(dx, 1), round(dy, 1)))
    case_diff = [(rp["words"][i]["text"], dp["words"][j]["text"]) for i, j in pairs if rp["words"][i]["text"] != dp["words"][j]["text"]]
    res.update(
        wordsRef=len(rp["words"]), wordsDcrs=len(dp["words"]), wordsMatched=len(pairs),
        medianDxMm=round(statistics.median(dxs), 2) if dxs else None,
        medianDyMm=round(statistics.median(dys), 2) if dys else None,
        medianSizeRatio=round(statistics.median(sizes), 3) if sizes else None,
        wordsOff=len(off), worstOff=[(t, dx, dy) for _, t, dx, dy in sorted(off, reverse=True)[:12]],
        caseDiffs=case_diff[:8], caseDiffCount=len(case_diff),
    )
    res["missing"], res["missingMore"] = runs(rp["words"], set(range(len(rp["words"]))) - ua)
    res["extra"], res["extraMore"] = runs(dp["words"], set(range(len(dp["words"]))) - ub)
    res["missingCount"] = len(rp["words"]) - len(ua)
    res["extraCount"] = len(dp["words"]) - len(ub)
    pos_q = [max(0.0, 1 - max(abs(dx), abs(dy)) / 10.0) for dx, dy in zip(dxs, dys)]
    size_q = [max(0.0, 1 - abs(math.log(s)) / 0.25) for s in sizes]
    res["_posQ"] = statistics.mean(pos_q) if pos_q else 0.0
    res["_sizeQ"] = statistics.mean(size_q) if size_q else 0.0
    ok, shifted, issues, extra, ratios = match_rules(rp["rules"], dp["rules"], rbox, dbox)
    res.update(rulesRef=len(rp["rules"]), rulesDcrs=len(dp["rules"]), rulesOk=ok, rulesShifted=shifted, rulesMissing=sum(1 for m in issues if m[0] == "missing"), rulesExtra=len(extra))
    res["medianRuleWidthRatio"] = round(statistics.median(ratios), 2) if ratios else None
    res["shiftedRules"] = [(m[1]["orient"], round(m[1]["pos"], 1), round(m[2]["pos"], 1)) for m in issues if m[0] == "shifted"][:8]
    res["missingRules"] = [(m[1]["orient"], round(m[1]["pos"], 1), round(m[1]["b"] - m[1]["a"], 1)) for m in issues if m[0] == "missing"][:8]
    res["headerRef"] = header_xs(rp["rules"], rbox)
    res["headerDcrs"] = header_xs(dp["rules"], dbox)
    res["gridRef"] = grid_stats(rp, rbox)
    res["gridDcrs"] = grid_stats(dp, dbox)
    rf, rs = font_profile(rp)
    df, ds = font_profile(dp)
    res["fontsRef"] = [f"{k[0]} {k[1]:g}pt" for k, _ in sorted(rf.items(), key=lambda kv: -kv[1])[:3]]
    res["fontsDcrs"] = [f"{k[0]} {k[1]:g}pt" for k, _ in sorted(df.items(), key=lambda kv: -kv[1])[:3]]
    res["medianFontPtRef"] = round(statistics.median(rs), 1) if rs else None
    res["medianFontPtDcrs"] = round(statistics.median(ds), 1) if ds else None
    return res


def pdf_score(ref_pages, dc_pages, per_page):
    n_r, n_d = len(ref_pages), len(dc_pages)
    s_pages = max(0.0, 15 - 7 * abs(n_r - n_d))
    both = min(n_r, n_d)
    orient_ok = all(ref_pages[i]["orientation"] == dc_pages[i]["orientation"] for i in range(both)) if both else False
    s_orient = 10.0 if orient_ok else 0.0
    cb = []
    for pp in per_page:
        if pp.get("refBoxMm") and pp.get("dcrsBoxMm"):
            wr = pp["dcrsBoxMm"][2] / max(pp["refBoxMm"][2], 1e-6)
            hr = pp["dcrsBoxMm"][3] / max(pp["refBoxMm"][3], 1e-6)
            cb.append(max(0.0, 1 - (abs(wr - 1) + abs(hr - 1)) / 0.3))
    s_box = 10.0 * (statistics.mean(cb) if cb else 0.0)
    total_r = sum(len(p["words"]) for p in ref_pages)
    total_d = sum(len(p["words"]) for p in dc_pages)
    matched = sum(pp.get("wordsMatched", 0) for pp in per_page)
    share = (2 * matched / (total_r + total_d)) if (total_r + total_d) else 0.0
    wp = [(pp["_posQ"], pp["_sizeQ"], pp["wordsMatched"]) for pp in per_page if "_posQ" in pp and pp.get("wordsMatched")]
    if wp:
        tw = sum(m for _, _, m in wp)
        pos_q = sum(p * m for p, _, m in wp) / tw
        size_q = sum(s * m for _, s, m in wp) / tw
    else:
        pos_q = size_q = 0.0
    s_words = 35.0 * share * (0.8 * pos_q + 0.2 * size_q)
    rr = sum(len(p["rules"]) for p in ref_pages)
    rd = sum(len(p["rules"]) for p in dc_pages)
    ok = sum(pp.get("rulesOk", 0) for pp in per_page)
    sh = sum(pp.get("rulesShifted", 0) for pp in per_page)
    s_rules = 30.0 * (2 * (ok + 0.5 * sh) / (rr + rd)) if (rr + rd) else 30.0
    parts = {"pages": round(s_pages, 1), "orientation": round(s_orient, 1), "contentBox": round(s_box, 1), "words": round(s_words, 1), "rules": round(s_rules, 1)}
    return round(sum(parts.values()), 1), parts


def plain_words(doc_id, ref_pages, dc_pages, per_page):
    """The concrete mismatches, one plain sentence each."""
    m = []
    n_r, n_d = len(ref_pages), len(dc_pages)
    if n_r != n_d:
        m.append(f"Page count: the paper is {n_r} page(s), DCRS prints {n_d}.")
    for i in range(min(n_r, n_d)):
        if ref_pages[i]["orientation"] != dc_pages[i]["orientation"]:
            m.append(f"Page {i + 1} orientation: the paper is {ref_pages[i]['orientation']}, DCRS prints {dc_pages[i]['orientation']}.")
    for i, pp in enumerate(per_page, 1):
        tag = f"p{i}: " if len(per_page) > 1 else ""
        if pp.get("refBoxMm") and pp.get("dcrsBoxMm"):
            rw, rh = pp["refBoxMm"][2], pp["refBoxMm"][3]
            dw, dh = pp["dcrsBoxMm"][2], pp["dcrsBoxMm"][3]
            if abs(dw / rw - 1) > 0.03 or abs(dh / rh - 1) > 0.05:
                m.append(f"{tag}Content box: the paper is {rw} x {rh} mm, DCRS {dw} x {dh} mm (starting {pp['dcrsBoxMm'][0]} / {pp['dcrsBoxMm'][1]} mm from the page's edge, the paper {pp['refBoxMm'][0]} / {pp['refBoxMm'][1]}).")
        if "wordsRef" not in pp:
            continue
        if pp["missingCount"]:
            more = f" (+{pp['missingMore']} more)" if pp["missingMore"] else ""
            m.append(f"{tag}{pp['missingCount']} word(s) of the paper not in DCRS: " + "; ".join(f'"{t}"' for t in pp["missing"][:6]) + more + ".")
        if pp["extraCount"]:
            more = f" (+{pp['extraMore']} more)" if pp["extraMore"] else ""
            m.append(f"{tag}{pp['extraCount']} word(s) in DCRS not on the paper: " + "; ".join(f'"{t}"' for t in pp["extra"][:6]) + more + ".")
        if pp["caseDiffCount"]:
            m.append(f"{tag}{pp['caseDiffCount']} word(s) in other letters (paper -> DCRS): " + "; ".join(f'"{a}" -> "{b}"' for a, b in pp["caseDiffs"][:4]) + ".")
        if pp["wordsOff"]:
            worst = pp["worstOff"][0]
            m.append(f"{tag}{pp['wordsOff']} of {pp['wordsMatched']} matched words are more than {OFF_MM} mm off (median dx {pp['medianDxMm']} mm, dy {pp['medianDyMm']} mm; worst \"{worst[0]}\" dx {worst[1]} dy {worst[2]} mm).")
        sr = pp["medianSizeRatio"]
        if sr and abs(sr - 1) > 0.05:
            m.append(f"{tag}Text size: DCRS is {sr:.2f} x the paper's (median {pp['medianFontPtDcrs']} pt against {pp['medianFontPtRef']} pt).")
        fr = {f.rsplit(" ", 1)[0] for f in pp["fontsRef"][:1]}
        fd = {f.rsplit(" ", 1)[0] for f in pp["fontsDcrs"][:1]}
        if fr != fd:
            m.append(f"{tag}Font: the paper is mostly {pp['fontsRef'][0] if pp['fontsRef'] else '?'}, DCRS {pp['fontsDcrs'][0] if pp['fontsDcrs'] else '?'}.")
        if pp["rulesMissing"] or pp["rulesExtra"] or pp["rulesShifted"]:
            m.append(f"{tag}Rules: the paper draws {pp['rulesRef']}, DCRS {pp['rulesDcrs']}; {pp['rulesOk']} agree, {pp['rulesShifted']} are shifted more than {RULE_OK_MM:g} mm, {pp['rulesMissing']} of the paper's have no match, {pp['rulesExtra']} of DCRS's are not on the paper.")
        g_r, g_d = pp["gridRef"], pp["gridDcrs"]
        if (g_r["rowLines"], g_r["vertical"]) != (g_d["rowLines"], g_d["vertical"]):
            m.append(f"{tag}Grid: the paper has {g_r['horizontal']} horizontal / {g_r['vertical']} vertical lines ({g_r['rowLines']} full-width row lines), DCRS {g_d['horizontal']} / {g_d['vertical']} ({g_d['rowLines']}).")
        hr_, hd_ = pp["headerRef"], pp["headerDcrs"]
        if len(hr_) != len(hd_) or any(abs(a - b) > 1.5 for a, b in zip(hr_, hd_)):
            m.append(f"{tag}Header block cell boundaries (mm from the left of the content, top 45 mm): the paper {hr_}, DCRS {hd_}.")
    return m


def compare_pdf_pair(doc, ref_info, ref_dir, dcrs_dir, out_dir):
    ref_pages = common.read_json(os.path.join(ref_dir, "pages.json"))
    dc_pages = common.read_json(os.path.join(dcrs_dir, "pages.json"))
    os.makedirs(out_dir, exist_ok=True)
    per_page = []
    scale = common.DPI / 72.0
    for i in range(max(len(ref_pages), len(dc_pages))):
        rp = ref_pages[i] if i < len(ref_pages) else None
        dp = dc_pages[i] if i < len(dc_pages) else None
        rimg = Image.open(os.path.join(ref_dir, f"page-{i + 1}.png")) if rp else None
        dimg = Image.open(os.path.join(dcrs_dir, f"page-{i + 1}.png")) if dp else None
        if rp and dp:
            pp = compare_pages(rp, dp)
            ov = overlay_image(rimg, dimg, pp["_rbox"], pp["_dbox"], scale) if pp["_rbox"] and pp["_dbox"] else Image.new("RGB", (10, 10), "white")
            panels = [labelled(rimg.convert("RGB"), f"PAPER  p{i + 1}  ({rp['orientation']})"), labelled(dimg.convert("RGB"), f"DCRS  p{i + 1}  ({dp['orientation']})"), labelled(ov, "OVERLAY  red = paper only, cyan = DCRS only")]
            pp["page"] = i + 1
            per_page.append(pp)
        else:
            panels = [labelled((rimg or Image.new("RGB", (400, 400), "white")).convert("RGB"), f"PAPER  p{i + 1}" + ("" if rp else "  (none)")), labelled((dimg or Image.new("RGB", (400, 400), "white")).convert("RGB"), f"DCRS  p{i + 1}" + ("" if dp else "  (none)"))]
        hstack(panels).save(os.path.join(out_dir, f"page-{i + 1}-side-by-side.png"))
    score, parts = pdf_score(ref_pages, dc_pages, per_page)
    clean = [{k: v for k, v in pp.items() if not k.startswith("_")} for pp in per_page]
    return {
        "refPages": len(ref_pages), "dcrsPages": len(dc_pages),
        "refOrientation": [p["orientation"] for p in ref_pages], "dcrsOrientation": [p["orientation"] for p in dc_pages],
        "orientationMatch": bool(ref_pages and dc_pages and all(ref_pages[i]["orientation"] == dc_pages[i]["orientation"] for i in range(min(len(ref_pages), len(dc_pages))))),
        "score": score, "scoreParts": parts, "perPage": clean, "mismatches": plain_words(doc["id"], ref_pages, dc_pages, per_page),
    }


def compare_photo_pair(doc, ref_info, ref_dir, dcrs_dir, out_dir):
    """A photograph: looked at, never measured. The photo beside every DCRS page, the photo scaled to the page's height."""
    os.makedirs(out_dir, exist_ok=True)
    dc_pages = common.read_json(os.path.join(dcrs_dir, "pages.json"))
    photo = Image.open(os.path.join(ref_dir, ref_info["pages"][0])).convert("RGB")
    dimgs = [Image.open(os.path.join(dcrs_dir, f"page-{i + 1}.png")).convert("RGB") for i in range(len(dc_pages))]
    h = max([d.height for d in dimgs] or [900])
    photo = photo.resize((max(1, int(photo.width * h / photo.height)), h))
    panels = [labelled(photo, f"PAPER (photograph, {ref_info['fmt']})")] + [labelled(d, f"DCRS  p{i + 1}  ({dc_pages[i]['orientation']})") for i, d in enumerate(dimgs)]
    hstack(panels).save(os.path.join(out_dir, "photo-side-by-side.png"))
    return {
        "refPages": 1, "dcrsPages": len(dc_pages), "refOrientation": ["landscape" if photo.width > photo.height else "portrait"], "dcrsOrientation": [p["orientation"] for p in dc_pages],
        "orientationMatch": None, "score": -1, "scoreParts": {}, "perPage": [],
        "mismatches": ["Photograph: visual comparison only - see photo-side-by-side.png (the paper's words are not machine-readable)."],
    }


def compare_all(docs, out_root):
    """docs: catalogue dicts. Returns {docId: [one result per reference]}."""
    results = {}
    for doc in docs:
        refs_of = refs.reference_for_doc(doc["id"])
        dcrs_dir = os.path.join(out_root, "dcrs", doc["id"])
        cap = os.path.join(dcrs_dir, "capture.json")
        entries = []
        for ref in refs_of:
            key = refs.ref_key(ref)
            ref_dir = os.path.join(out_root, "reference", key)
            entry = {"reference": ref["file"], "referenceKey": key, "fmt": ref["fmt"], "kind": ref["kind"]}
            if not (os.path.exists(cap) and common.read_json(cap).get("ok")):
                entry.update(error="DCRS capture failed: " + (common.read_json(cap).get("error", "no capture") if os.path.exists(cap) else "no capture"), score=None, mismatches=[])
            elif not os.path.exists(os.path.join(ref_dir, "pages.json")):
                entry.update(error="reference not rendered", score=None, mismatches=[])
            else:
                info = {"fmt": ref["fmt"], "pages": sorted(f for f in os.listdir(ref_dir) if f.startswith("page-") and f.endswith(".png"))}
                out_dir = os.path.join(out_root, "compare", doc["id"] + ("" if len(refs_of) == 1 else "__" + key))
                fn = compare_photo_pair if ref["kind"] == "photo" else compare_pdf_pair
                entry.update(fn(doc, info, ref_dir, dcrs_dir, out_dir))
                entry["compareDir"] = out_dir
                common.write_json(os.path.join(out_dir, "compare.json"), entry)
            entries.append(entry)
        results[doc["id"]] = entries
    return results
