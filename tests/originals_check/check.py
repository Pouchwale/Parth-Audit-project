"""THE ORIGINALS CHECK (REQUIREMENTS section 119; tests/originals_check/README.md): every document's download held against the
owner's own file it is meant to be.

For each document it opens a NEW record on a private DCRS, fills it with Mitra's sample fill (plainly test data), reads what
the page shows (the blocks the Download button reads), presses Download and keeps the file, then checks the file:
  (a) read back (openpyxl / the Word XML): every DCRS value is in it, beside its label or in its column; nothing of the
      owner's own example entries is left; the round-trip map is whole;
  (b) Word / Excel export the download to PDF, held page by page against the original's own PDF
      (source-documents/originals-pdf/<id>.pdf): pages, orientation, rules, word positions; a side-by-side picture and a score;
  (c) the download uploaded back through the page's own Upload changes: the app's reader must say nothing changed.
It writes report.md, report.json and gallery.html into the output folder.

    python -I tests/originals_check/check.py --docs qc-bopp-film,hr-competence      # some documents
    python -I tests/originals_check/check.py --all                                  # every document with a template
    python -I tests/originals_check/check.py --docs a,b --no-build --no-pdf          # quicker: no build, no PDF comparison
    python -I tests/originals_check/check.py --compare-only                         # (a)+(b) again on the files already kept

Options: --port N (default 4300), --out DIR (default: this session's scratchpad originals-check), --no-fill (a blank record).
"""
import json
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

import browse  # noqa: E402

DEFAULT_OUT = "C:/Users/parth/AppData/Local/Temp/claude/C--Users-parth-Desktop-Audit-project/5e4fa497-273b-4740-9cf3-9b5fe252f310/scratchpad/originals-check"


def arg(argv, name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


def load_catalog(out):
    path = os.path.join(out, "catalog.json")
    import subprocess

    subprocess.run(["node", os.path.join(HERE, "catalog.mjs"), path], cwd=ROOT, check=True, capture_output=True)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def bundle(out):
    import subprocess

    path = os.path.join(out, "blocks_bundle.js")
    subprocess.run(["node", os.path.join(HERE, "bundle_blocks.mjs"), path], cwd=ROOT, check=True, capture_output=True)
    return path


def capture(srv, docs, out, fill=True, headless=True):
    """The browser part: per document a new record, the sample fill, the blocks, the download, the upload back."""
    from playwright.sync_api import sync_playwright

    bundle_path = bundle(out)
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        try:
            context = browser.new_context(viewport={"width": 1500, "height": 1000}, accept_downloads=True)
            page = context.new_page()
            page.route("**/translate_a/**", lambda route: route.abort())
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            browse.sign_in(page, srv.url, srv.email, srv.password)
            for i, doc in enumerate(docs, 1):
                d = os.path.join(out, "docs", doc["id"])
                os.makedirs(d, exist_ok=True)
                info = {"id": doc["id"], "formatNo": doc["formatNo"], "template": doc.get("template"), "ok": False}
                started = time.time()
                errors.clear()
                try:
                    info["opened"] = browse.start_record(page, srv.url, doc)
                    info["url"] = page.url.split("#", 1)[-1]
                    if fill and info["opened"] == "record":
                        info["fillReply"] = browse.say(page, "fill it with sample data", wait=3500)[:400]
                        page.wait_for_timeout(600)
                    shown = browse.page_blocks(page, bundle_path)
                    browse.write_json(os.path.join(d, "blocks.json"), shown)
                    path, kind = browse.download(page, os.path.join(d, "download"))
                    info["download"] = os.path.basename(path) if path else None
                    info["suggestedName"] = getattr(browse.download, "suggested", None)
                    info["downloadKind"] = kind
                    if path:
                        info["upload"] = browse.upload_back(page, path)
                    rid = (shown.get("recordIds") or [None])[0]
                    info["recordId"] = rid
                    if rid:
                        browse.write_json(os.path.join(d, "record.json"), browse.stored_record(page, rid))
                    info["ok"] = bool(path)
                except Exception as e:  # one document failing must not stop the run
                    info["error"] = f"{type(e).__name__}: {str(e)[:400]}"
                    try:
                        page.screenshot(path=os.path.join(d, "failed.png"))
                    except Exception:
                        pass
                info["pageErrors"] = list(errors)[:5]
                info["seconds"] = round(time.time() - started, 1)
                browse.write_json(os.path.join(d, "capture.json"), info)
                results[doc["id"]] = info
                print(f"[{i}/{len(docs)}] {doc['id']}: {'ok' if info['ok'] else 'FAIL'} {info.get('downloadKind') or ''} {info.get('download') or ''} {info.get('error', '')}", flush=True)
        finally:
            browser.close()
    return results


def main(argv):
    out = arg(argv, "--out", DEFAULT_OUT)
    os.makedirs(out, exist_ok=True)
    catalog = load_catalog(out)
    only = arg(argv, "--docs")
    if only:
        want = only.split(",")
        docs = [c for c in catalog if c["id"] in want]
        docs.sort(key=lambda c: want.index(c["id"]))
    elif "--all" in argv:
        docs = [c for c in catalog if c.get("template")]
    else:
        raise SystemExit("Name --docs a,b or --all.")
    if "--compare-only" not in argv:
        from private_server import PrivateServer

        with PrivateServer(port=int(arg(argv, "--port", 4300)), build="--no-build" not in argv) as srv:
            capture(srv, docs, out, fill="--no-fill" not in argv)
    import judge

    judge.judge_all(docs, out, pdf="--no-pdf" not in argv)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        sys.exit(1)
