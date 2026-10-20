"""(a) REFERENCE RENDER. Every page of each reference PDF as PNG at 110 dpi; its words (text, x0, x1, top, bottom, font size, font name),
rule segments (lines and rects, with widths) and page boxes as JSON; the two photographs kept as images and wrapped into one-page PDFs.

    python -I tests/qc_visual/reference_render.py [--out DIR] [--docs a,b]

Output: DIR/reference/<key>/page-N.png, pages.json (and photo.jpg + photo.pdf for a photograph), DIR/reference/index.json.
"""
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import refs  # noqa: E402


def render_reference(ref, out_root):
    key = refs.ref_key(ref)
    src = os.path.join(common.SOURCE_DOCUMENTS, ref["repo"])
    if not os.path.exists(src):
        raise FileNotFoundError(src)
    out = os.path.join(out_root, "reference", key)
    os.makedirs(out, exist_ok=True)
    info = {"key": key, "file": ref["file"], "repo": ref["repo"], "fmt": ref["fmt"], "docs": ref["docs"], "kind": ref["kind"], "role": ref["role"], "note": ref["note"]}
    if ref["kind"] == "photo":
        ext = os.path.splitext(src)[1].lower()
        photo = os.path.join(out, "photo" + ext)
        shutil.copyfile(src, photo)
        pdf = os.path.join(out, "photo.pdf")
        size = common.photo_to_pdf(src, pdf)
        names = common.render_pages(pdf, out)
        info.update(photoPixels=list(size), pages=names, pdf="photo.pdf", photo="photo" + ext)
        # a photograph has no text layer; its pages.json holds the boxes only
        pages = common.extract_pdf(pdf)
    else:
        pdf = src
        names = common.render_pages(pdf, out)
        pages = common.extract_pdf(pdf)
        info.update(pages=names, pdf=src)
    common.write_json(os.path.join(out, "pages.json"), pages)
    info["pageCount"] = len(pages)
    info["orientation"] = [p["orientation"] for p in pages]
    info["wordCount"] = sum(len(p["words"]) for p in pages)
    return info


def main():
    out_root = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else common.DEFAULT_OUT
    only = set(sys.argv[sys.argv.index("--docs") + 1].split(",")) if "--docs" in sys.argv else None
    index = []
    for ref in refs.all_references():
        if ref["role"] == "not-reference":
            continue
        if only and not (only & set(ref["docs"])):
            continue
        info = render_reference(ref, out_root)
        index.append(info)
        common.say(f"reference {info['key']}: {info['pageCount']} page(s) {info['orientation']}, {info['wordCount']} words")
    if not only:
        common.write_json(os.path.join(out_root, "reference", "index.json"), index)
    return index


if __name__ == "__main__":
    main()
