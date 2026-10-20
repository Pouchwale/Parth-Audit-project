"""HEADER AND FOOT SCORE of the QC visual-parity kit: how near the PAGE FRAME of a document is to its paper - the header band (logo or
company line, title, the Format / Rev / Page cells, the borders), the page frame, and the foot lines at the bottom of the page.

    python -I tests/qc_visual/header_score.py BEFORE_DIR AFTER_DIR [docId ...]

Each DIR is a kit output folder (it holds dcrs/<docId>/pages.json and reference/<key>/pages.json; the references of BEFORE_DIR may be
a copy). Page 1 only. Positions are ABSOLUTE millimetres from the page's corner (a frame is anchored to the page, not to the ink).
The zones: the head is the top 40 mm; the foot is below 262 mm (a landscape page: the top 32 mm and below the page's height - 28 mm).

SCORE (0-100) = words 40 + rules 40 + size 20 over the words and rules of the two zones:
  words  40 x match share (2 x matched / (paper words + DCRS words)) x position quality (1 within 1.5 mm, 0 at 10 mm off)
  rules  40 x 2 x (ok + 0.5 x near) / (paper rules + DCRS rules); ok = within 1 mm, near = within 6 mm (compare.match_rules)
  size   20 x the median size ratio's quality (1 at the same size, 0 at 25 % off) of the matched words
"""
import json
import math
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import compare  # noqa: E402
import refs  # noqa: E402

MM = common.PT_TO_MM
ORIGIN = {"x0": 0.0, "top": 0.0}


def zone(page):
    h_mm = page["height"] * MM
    head_mm, foot_from = (40.0, 262.0) if page["orientation"] == "portrait" else (32.0, h_mm - 28.0)
    words = [w for w in page["words"] if w["top"] * MM < head_mm or w["top"] * MM > foot_from]
    rules = [
        r for r in page["rules"]
        if (r["top"] * MM < head_mm) or (r["orient"] == "h" and r["top"] * MM > foot_from) or (r["orient"] == "v" and r["top"] * MM > foot_from - 6)
    ]
    return words, rules


def score(ref_page, dc_page):
    rw, rr = zone(ref_page)
    dw, dr = zone(dc_page)
    pairs, ua, ub = compare.match_words(rw, dw, ORIGIN, ORIGIN)
    pos_q, sizes = [], []
    for i, j in pairs:
        dx = (dw[j]["x0"] - rw[i]["x0"]) * MM
        dy = (dw[j]["top"] - rw[i]["top"]) * MM
        d = math.hypot(dx, dy)
        pos_q.append(1.0 if d <= 1.5 else max(0.0, 1 - (d - 1.5) / 8.5))
        if rw[i]["size"] > 0 and dw[j]["size"] > 0:
            sizes.append(dw[j]["size"] / rw[i]["size"])
    share = (2 * len(pairs) / (len(rw) + len(dw))) if (len(rw) + len(dw)) else 1.0
    pq = statistics.mean(pos_q) if pos_q else 0.0
    s_words = 40.0 * share * pq
    ok, shifted, _, _, _ = compare.match_rules(rr, dr, ORIGIN, ORIGIN)
    s_rules = 40.0 * (2 * (ok + 0.5 * shifted) / (len(rr) + len(dr))) if (len(rr) + len(dr)) else 40.0
    sr = statistics.median(sizes) if sizes else 0.0
    s_size = 20.0 * (max(0.0, 1 - abs(math.log(sr)) / 0.25) if sr > 0 else 0.0)
    return {
        "score": round(s_words + s_rules + s_size, 1), "words": round(s_words, 1), "rules": round(s_rules, 1), "size": round(s_size, 1),
        "wordsPaper": len(rw), "wordsDcrs": len(dw), "wordsMatched": len(pairs), "rulesPaper": len(rr), "rulesDcrs": len(dr), "rulesOk": ok, "rulesNear": shifted,
        "medianSizeRatio": round(sr, 2) if sr else None,
        "missingWords": [rw[i]["text"] for i in range(len(rw)) if i not in ua][:8],
        "extraWords": [dw[j]["text"] for j in range(len(dw)) if j not in ub][:8],
    }


def of(out_dir, doc_id):
    ref = refs.reference_for_doc(doc_id)
    if not ref or ref[0]["kind"] == "photo":
        return None
    rp = os.path.join(out_dir, "reference", refs.ref_key(ref[0]), "pages.json")
    dp = os.path.join(out_dir, "dcrs", doc_id, "pages.json")
    if not (os.path.exists(rp) and os.path.exists(dp)):
        return None
    return score(common.read_json(rp)[0], common.read_json(dp)[0])


def main():
    before, after = sys.argv[1], sys.argv[2]
    ids = sys.argv[3:] or sorted(os.listdir(os.path.join(after, "dcrs")))
    rows = []
    for i in ids:
        b, a = of(before, i), of(after, i)
        if b and a:
            rows.append({"doc": i, "before": b, "after": a})
    print(f"{'document':36} {'before':>7} {'after':>7}   words/rules/size after")
    for r in sorted(rows, key=lambda r: r["after"]["score"] - r["before"]["score"]):
        b, a = r["before"], r["after"]
        print(f"{r['doc']:36} {b['score']:7.1f} {a['score']:7.1f}   {a['words']:.0f}/{a['rules']:.0f}/{a['size']:.0f}")
    if rows:
        print(f"{'MEAN':36} {statistics.mean(r['before']['score'] for r in rows):7.1f} {statistics.mean(r['after']['score'] for r in rows):7.1f}")
    json.dump(rows, open(os.path.join(after, "header-score.json"), "w", encoding="utf-8"), indent=1)


if __name__ == "__main__":
    main()
