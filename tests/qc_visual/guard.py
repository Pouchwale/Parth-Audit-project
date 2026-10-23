"""(e) REGRESSION GUARD. Every NON-QC document that prints (the documents of HR, Maintenance, System, Purchase, Store, Dispatch, Production,
Marketing and the rest that the Document Library starts a record of, and the reference pages the e2e print suite also prints) is rendered
once, as a blank new record under print media, and a digest of its words' and rules' geometry is kept in DIR/guard/baseline.json.
`--guard` renders them again and reports any whose digest changed: a shared component (the header block, the sheet's CSS, the print
preparation) must not change HR or any other non-QC output.

A date or time in a blank record is masked in the digest (only its place counts), so the digest is the same from one day to the next.
"""
import os
import re
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# The browser this tool launches makes no sound (tests/quiet/quiet_browsers.py, the owner, 23-Oct-2026).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "quiet"))
import quiet_browsers  # noqa: E402,F401
import capture  # noqa: E402
import common  # noqa: E402

EXTRA_PAGES = [("chemical-master", "#/chemical-master"), ("licence", "#/licence")]


def guard_targets(page, base, qc_ids):
    ids = [i for i in capture.library_new_record_ids(page, base) if i not in qc_ids]
    # a library lists a document once per module it is shown under: keep the first
    seen, out = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def render_target(page, base, kind, ident, route=None):
    """Prints one non-QC document; returns {pages, digest, words, rules} or {error}."""
    try:
        if route:
            page.goto(f"{base}/index.html{route}")
            page.wait_for_timeout(1100)
            capture.dismiss(page)
            page.evaluate(capture.STUB_PRINT)
        else:
            capture.open_document(page, base, {"id": ident, "kind": "log-sheet"}, pages=("#/record/", "#/gap/", "#/training/"))
        pdf = os.path.join(tempfile.gettempdir(), "dcrs-qcvis-guard.pdf")
        capture.print_pdf(page, pdf)
        pages = common.extract_pdf(pdf)
        return {"pages": len(pages), "words": sum(len(p["words"]) for p in pages), "rules": sum(len(p["rules"]) for p in pages), "digest": common.digest_geometry(pages), "geometry": pages}
    except Exception as e:
        # a record id in the text would differ from one run to the next
        return {"error": re.sub(r"rec-[\w-]+", "rec-ID", f"{type(e).__name__}: {str(e)[:200]}")}


def render_all(srv, out_root, qc_ids):
    from playwright.sync_api import sync_playwright

    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": 1400, "height": 950})
            page.route("**/translate_a/**", lambda route: route.abort())
            capture.sign_in(page, srv.url, srv.email, srv.password)
            ids = guard_targets(page, srv.url, qc_ids)
            common.say(f"[guard] {len(ids)} non-QC documents of the library + {len(EXTRA_PAGES)} reference pages")
            t0 = time.time()
            for n, ident in enumerate(ids, 1):
                results[ident] = render_target(page, srv.url, "record", ident)
                if n % 10 == 0:
                    common.say(f"[guard] {n}/{len(ids)} ({time.time() - t0:.0f}s)")
            for ident, route in EXTRA_PAGES:
                results[ident] = render_target(page, srv.url, "page", ident, route=route)
        finally:
            browser.close()
    return results


def write_baseline(results, out_root, commit):
    d = os.path.join(out_root, "guard")
    slim = {k: {kk: vv for kk, vv in v.items() if kk != "geometry"} for k, v in results.items()}
    for k, v in results.items():
        if "geometry" in v:
            common.write_json(os.path.join(d, "geometry", f"{k}.json"), v["geometry"])
    common.write_json(os.path.join(d, "baseline.json"), {"commit": commit, "documents": slim})
    return slim


def compare_to_baseline(results, out_root):
    """Returns the list of changes: documents whose digest, page count or an error differs from the baseline, or that are new or gone."""
    base_path = os.path.join(out_root, "guard", "baseline.json")
    if not os.path.exists(base_path):
        raise SystemExit(f"No guard baseline at {base_path}: run `run.py --make-baseline` on the code before the change first.")
    base = common.read_json(base_path)["documents"]
    changed = []
    for k, v in sorted(results.items()):
        b = base.get(k)
        if b is None:
            changed.append({"doc": k, "change": "new document (no baseline)"})
        elif "error" in v or "error" in b:
            if v.get("error") != b.get("error"):
                changed.append({"doc": k, "change": f"error changed: was {b.get('error', 'ok')}, now {v.get('error', 'ok')}"})
        elif v["digest"] != b["digest"]:
            changed.append({"doc": k, "change": f"geometry changed: pages {b['pages']} -> {v['pages']}, words {b['words']} -> {v['words']}, rules {b['rules']} -> {v['rules']}"})
    for k in sorted(set(base) - set(results)):
        changed.append({"doc": k, "change": "no longer offered by the library"})
    return changed
