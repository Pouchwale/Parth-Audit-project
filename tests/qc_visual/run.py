"""THE ORCHESTRATING COMMAND of the QC visual-parity kit: renders the references, starts the kit's private DCRS, captures every QC document
(a blank new record, printed as the app prints), compares each with its paper, writes report.md and report.json, and stops the server.

    python -I tests/qc_visual/run.py [--docs a,b,c] [--port N] [--out DIR] [--skip-reference] [--no-build]
                                      [--compare-only] [--with-guard] [--guard] [--make-baseline]

  --docs a,b,c      only these DCRS document ids (e.g. qc-bopp-film,qc-coa-label)
  --port N          the private server's port (default: a free one; never 3000, 4000, 4100, 5432, 5433, 8081, 8090, 8842, 8843)
  --out DIR         where images, JSON and reports go (never committed); default is this session's scratchpad folder qc-visual
  --skip-reference  reuse the reference renders already in DIR/reference
  --no-build        reuse frontend/dist (otherwise the worktree's frontend is built first; it takes seconds)
  --guard           ONLY the regression guard: re-render every non-QC document and report any whose geometry digest changed (exit 1 if any)
  --make-baseline   ONLY the guard's baseline: render every non-QC document and keep its digest (do this on the code before a change)
  --compare-only    no server: compare the captures already in DIR/dcrs again (re-renders the references too)
  --with-guard      also run the guard after the comparison (and write the baseline first if there is none)
"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import capture  # noqa: E402
import common  # noqa: E402
import compare  # noqa: E402
import guard  # noqa: E402
import reference_render  # noqa: E402
import refs  # noqa: E402
from private_server import PrivateServer  # noqa: E402

SEED = "frontend/src/data/seed/"


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def git(*a):
    try:
        return subprocess.run(["git", *a], cwd=common.ROOT, capture_output=True, text=True, encoding="utf-8").stdout.strip()
    except Exception:
        return ""


def view_component(doc):
    if doc["kind"] == "compliance-statement":
        return "frontend/src/pages/CompliancePage.tsx: ComplianceDetailPage"
    extra = refs.GRID_RENDERER.get(doc["id"])
    return "frontend/src/components/records/LogSheetRecordView.tsx: LogSheetRecordView (in pages/RecordPage.tsx)" + (f" + {extra}" if extra else "")


def layout_source(doc):
    return SEED + refs.LAYOUT_SOURCE.get(doc["id"], "?")


def write_reports(out_root, docs, results, captures, started, guard_changes=None):
    rows = []
    for doc in docs:
        cap = captures.get(doc["id"], {})
        entries = results.get(doc["id"], [])
        refs_of = refs.reference_for_doc(doc["id"])
        base = {
            "docId": doc["id"], "formatNo": doc["formatNo"], "name": doc["name"], "kind": doc["kind"],
            "references": [r["file"] for r in refs_of],
            "viewComponent": view_component(doc), "layoutSource": layout_source(doc),
            "captured": bool(cap.get("ok")), "captureError": cap.get("error"),
            "dcrsPages": cap.get("pageCount"), "dcrsOrientation": cap.get("orientation"),
        }
        if not entries:
            rows.append({**base, "refPages": None, "orientationMatch": None, "score": None, "mismatches": ["No reference paper in the owner's folder: not compared."]})
            continue
        # the first reference is the document's (a second only where a paper has two PDFs); every entry is kept
        e = entries[0]
        rows.append({
            **base, "refPages": e.get("refPages"), "orientationMatch": e.get("orientationMatch"), "score": e.get("score"),
            "scoreParts": e.get("scoreParts"), "mismatches": e.get("mismatches") or ([e["error"]] if e.get("error") else []),
            "referenceKind": e.get("kind"), "compareDir": e.get("compareDir"),
            "details": e.get("perPage"),
        })
    commit = git("rev-parse", "--short", "HEAD")
    dirty = bool(git("status", "--porcelain", "--untracked-files=no"))
    report = {"generated": time.strftime("%Y-%m-%d %H:%M:%S"), "commit": commit + ("+uncommitted" if dirty else ""), "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
              "outDir": out_root, "seconds": round(time.time() - started), "documents": rows}
    if guard_changes is not None:
        report["guard"] = {"changed": guard_changes}
    common.write_json(os.path.join(out_root, "report.json"), report)

    L = []
    w = L.append
    scored = [r for r in rows if isinstance(r["score"], (int, float)) and r["score"] >= 0]
    w("# QC visual parity report")
    w("")
    w(f"Generated {report['generated']} on `{report['branch']}` at {report['commit']}; {len(rows)} QC documents captured as a blank new record printed on A4 by the app's own print path; "
      f"{len(scored)} held against a PDF paper (score 0-100, 100 = identical), {sum(1 for r in rows if r.get('referenceKind') == 'photo')} against a photograph (looked at: score -1), "
      f"{sum(1 for r in rows if not r['references'])} with no paper in the owner's folder.")
    if scored:
        w("")
        w(f"Mean score {sum(r['score'] for r in scored) / len(scored):.1f}; lowest {min(r['score'] for r in scored):.1f}; highest {max(r['score'] for r in scored):.1f}.")
    w("")
    w("| Document | Format | Paper pages | DCRS pages | Orientation | Score | Main mismatches |")
    w("| --- | --- | --- | --- | --- | --- | --- |")
    for r in sorted(rows, key=lambda r: (r["score"] is None, r["score"] if isinstance(r["score"], (int, float)) else 0)):
        sc = "-" if r["score"] is None else ("photo (-1)" if r["score"] == -1 else f"{r['score']:.1f}")
        om = {True: "same", False: "DIFFERENT", None: "-"}[r["orientationMatch"]]
        first = " / ".join(m.replace("|", "/")[:130] for m in (r["mismatches"] or [])[:2])
        w(f"| `{r['docId']}` | {r['formatNo']} | {r['refPages'] if r['refPages'] is not None else '-'} | {r['dcrsPages'] if r['dcrsPages'] is not None else 'FAILED'} | {om} | {sc} | {first} |")
    w("")
    for r in sorted(rows, key=lambda r: (r["score"] is None, r["score"] if isinstance(r["score"], (int, float)) else 0)):
        w(f"## {r['docId']} ({r['formatNo']}) - {r['name']}")
        w("")
        w(f"- Paper: {', '.join(r['references']) or 'none'}")
        w(f"- Component: {r['viewComponent']}; layout: `{r['layoutSource']}`")
        w(f"- Pages: paper {r['refPages']}, DCRS {r['dcrsPages']}; score {r['score']} {r.get('scoreParts') or ''}")
        if r.get("compareDir"):
            w(f"- Images: `{r['compareDir']}`")
        for m in r["mismatches"] or ["(no mismatch found)"]:
            w(f"  - {m}")
        w("")
    if guard_changes is not None:
        w("## Regression guard (non-QC documents)")
        w("")
        w("None changed." if not guard_changes else "\n".join(f"- `{c['doc']}`: {c['change']}" for c in guard_changes))
        w("")
    open(os.path.join(out_root, "report.md"), "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    return report


def main():
    started = time.time()
    out_root = arg("--out", common.DEFAULT_OUT)
    port = int(arg("--port")) if arg("--port") else None
    os.makedirs(out_root, exist_ok=True)
    only = arg("--docs").split(",") if arg("--docs") else None
    catalog = common.load_catalog(out_root, refresh=True)
    all_qc_ids = {c["id"] for c in catalog}
    docs = [c for c in catalog if (not only or c["id"] in only)]
    if only and len(docs) != len(only):
        raise SystemExit(f"Unknown document id(s): {sorted(set(only) - {d['id'] for d in docs})}")
    commit = git("rev-parse", "--short", "HEAD")

    if "--guard" in sys.argv or "--make-baseline" in sys.argv:
        with PrivateServer(port=port, build="--no-build" not in sys.argv) as srv:
            results = guard.render_all(srv, out_root, all_qc_ids)
        if "--make-baseline" in sys.argv:
            slim = guard.write_baseline(results, out_root, commit)
            bad = [k for k, v in slim.items() if "error" in v]
            common.say(f"[guard] baseline written for {len(slim)} non-QC documents ({len(bad)} with an error: {bad[:5]})")
            return 0
        changed = guard.compare_to_baseline(results, out_root)
        common.write_json(os.path.join(out_root, "guard", "last-run.json"), {"commit": commit, "changed": changed})
        if changed:
            common.say(f"[guard] {len(changed)} non-QC document(s) CHANGED:")
            for c in changed:
                common.say(f"   {c['doc']}: {c['change']}")
            return 1
        common.say("[guard] no non-QC document changed.")
        return 0

    if "--compare-only" in sys.argv:
        # no server: the captures already in DIR/dcrs are compared again (after the references or the comparison changed)
        common.say("[compare-only] re-rendering the references and comparing the captures already in DIR/dcrs")
        for ref in refs.all_references():
            if ref["role"] == "not-reference" or (only and not (set(only) & set(ref["docs"]))):
                continue
            reference_render.render_reference(ref, out_root)
        captures = {}
        for d in docs:
            cp = os.path.join(out_root, "dcrs", d["id"], "capture.json")
            captures[d["id"]] = common.read_json(cp) if os.path.exists(cp) else {"ok": False, "error": "not captured"}
        results = compare.compare_all(docs, out_root)
        report = write_reports(out_root, docs, results, captures, started, None)
        common.say(f"done: {os.path.join(out_root, 'report.md')}")
        return 0

    if "--skip-reference" not in sys.argv:
        common.say("[1/4] rendering the references (110 dpi, words, rules)...")
        for ref in refs.all_references():
            if ref["role"] == "not-reference" or (only and not (set(only) & set(ref["docs"]))):
                continue
            info = reference_render.render_reference(ref, out_root)
            common.say(f"   {info['key']}: {info['pageCount']} page(s) {info['orientation']}")
    else:
        common.say("[1/4] reusing the reference renders")

    common.say("[2/4] starting the private DCRS and capturing...")
    guard_results = None
    with PrivateServer(port=port, build="--no-build" not in sys.argv) as srv:
        captures = capture.capture_all(srv, docs, out_root)
        if "--with-guard" in sys.argv:
            guard_results = guard.render_all(srv, out_root, all_qc_ids)
    common.say("[3/4] comparing...")
    results = compare.compare_all(docs, out_root)
    guard_changes = None
    if guard_results is not None:
        if not os.path.exists(os.path.join(out_root, "guard", "baseline.json")):
            guard.write_baseline(guard_results, out_root, commit)
            guard_changes = []
        else:
            guard_changes = guard.compare_to_baseline(guard_results, out_root)
    common.say("[4/4] writing report.md and report.json...")
    report = write_reports(out_root, docs, results, captures, started, guard_changes)
    common.say(f"done in {report['seconds']} s: {os.path.join(out_root, 'report.md')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
