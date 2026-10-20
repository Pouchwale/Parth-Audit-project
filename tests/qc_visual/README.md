# QC visual-parity kit

A manual tool (like `tests/visual_qa.py`; not part of `npm run test:e2e`) that holds every QC document of DCRS against the owner's
original paper, page by page, and says in numbers and pictures where they differ. The owner, 17-Oct-2026: *"reproduce the same layout,
not a redesign. Look at each page carefully, implement, compare, fix mismatches, then verify."* The map of papers to components is
`docs/QC-VISUAL-MAP-2026-10-17.md`.

**The truth rule.** The paper is the truth for layout, words, order, widths, borders, fonts, row counts and orientation. The owner's
explicit overrides stay (`docs/REQUIREMENTS.md` section 111 and 117): no DATE cell in the header block, every fillable box editable,
F/QC/12 standard weights, carry-forward from the previous record, one F/QC/12 record per week, the system-generated footer lines. They
show up in the report as differences from the paper; judge them against those sections. A record never gets invented data (section 98).
What is compared is a **blank new record** printed on A4 by the app's own print path (the same component draws the screen, the preview,
the print and the downloads). A new record carries what the layout fills by itself (a date, carry-forward, F/QC/12's standard weights).

## Needs

Python with `pypdfium2`, `pdfplumber`, `Pillow`, `numpy`, `playwright` (Chromium installed); Node 24 (the repo's). No poppler, no
LibreOffice. `node_modules` of the worktree (a junction to `dcrs-room-wt/node_modules`; never `npm install`).

## Commands (from the worktree root; `python -I` so no stray module is imported)

```
# everything: references -> private server -> capture -> compare -> report.md / report.json -> server stopped
python -I tests/qc_visual/run.py

# only some documents (their DCRS ids), on a given port, into a given folder
python -I tests/qc_visual/run.py --docs qc-bopp-film,qc-coa-label --port PORT --out DIR

# reuse the reference renders / the built frontend
python -I tests/qc_visual/run.py --docs qc-bopp-film --skip-reference --no-build

# no server: compare the captures already in DIR/dcrs again (after the comparison or the references changed)
python -I tests/qc_visual/run.py --compare-only

# REGRESSION GUARD: a digest of every non-QC document's words and rules geometry
python -I tests/qc_visual/run.py --make-baseline      # on the code BEFORE a change (writes DIR/guard/baseline.json)
python -I tests/qc_visual/run.py --guard              # after: lists every non-QC document whose digest changed; exit 1 if any
python -I tests/qc_visual/run.py --with-guard         # the comparison, then the guard (writes the baseline first if there is none)
```

Options: `--docs a,b,c`, `--compare-only`, `--port N` (default a free one; never 3000, 4000, 4100, 5432, 5433, 8081, 8090, 8842, 8843), `--out DIR`
(default: this session's scratchpad `qc-visual`; the output is never committed), `--skip-reference`, `--no-build`.

The pieces, each also runnable alone:

| File | What it does |
| --- | --- |
| `refs.py` | the references: owner file -> repo copy -> format number -> DCRS document ids; the layout source of each document |
| `catalog.mjs` | writes the QC documents DCRS holds (id, number, kind, section, layout) as JSON, through the same code the pages read |
| `make_map.py` | writes `docs/QC-VISUAL-MAP-2026-10-17.md` from `refs.py` and the catalogue |
| `reference_render.py` | (a) each reference PDF to PNG at 110 dpi, its words (text, x0, x1, top, bottom, size, font), rule segments (lines and rects, with widths) and page boxes as JSON; a photograph kept as an image and wrapped into a one-page PDF |
| `server.ts`, `private_server.py` | (b) the kit's own DCRS: a temporary embedded PostgreSQL, a free port, the CURRENT worktree's code, the seeded super admin on a RANDOM password made per run in memory (never written, printed or committed), sign-up off, working hours off, `JOBS=0`, no AI key of any name, no push; stopped and removed when the run ends (or when the parent dies) |
| `capture.py` | (c) Playwright: signs in, opens each QC document the way a person does (a new blank record from the Document Library, or the statement's own page), then the print as `tests/e2e_print_all_documents.py` does it: `beforeprint` (the app's fit to the page, the `@page` orientation, `data-paper`), print media, the browser's PDF at the CSS page size, `window.print` stubbed |
| `compare.py` | (d) per document and page: page count, orientation, content box; words matched by text and reading order; rules; header-block cell boundaries; fonts; grid lines; score; the mismatches in words; the side-by-side image |
| `guard.py` | (e) the regression guard |
| `run.py` | the orchestrating command |

## Reading the numbers

* Several papers are **filled specimens** (the line-clearance sheets, F/QC/16's thirteen lines, the COAs, F-QC-14): what is written on them is
  reported as words "not in DCRS", because the DCRS record compared is blank. Judge those by the printed frame (headings, columns, rules).
* A blank new record carries what its layout fills by itself (the date of the day, carry-forward, F/QC/12's standard weights): reported
  as words "in DCRS not on the paper".
* A word found at another place counts as matched with a large dx/dy (it is in the wrong place), not as missing.
* A 4-page paper held against a 1-page print (F-QC-19's tolerance card) scores low on the page count first: look at the pictures.

## Output (DIR)

```
reference/<key>/page-N.png, pages.json            the paper (photo.jpg + photo.pdf for a photograph)
dcrs/<docId>/print.pdf, page-N.png, pages.json, capture.json
compare/<docId>/page-N-side-by-side.png           PAPER | DCRS | OVERLAY (red = on the paper only, cyan = in DCRS only, black = both)
compare/<docId>/compare.json                      every measure of the pair
report.md, report.json                            the table, the score and the mismatches of each document
guard/baseline.json, guard/geometry/<id>.json     the guard's digests
```

## What is measured, and the score

Positions are in millimetres from the top-left corner of each page's **content box** (the box round every word and rule), so a page
printed with another margin is not charged for the margin; the absolute place of the box is reported beside it.

* **Page count and orientation** of every page the two have.
* **Content box**: width and height of the ink on each page.
* **Words**: matched by text in reading order (difflib), then the same word anywhere on the page, nearest first. Per matched word: dx, dy
  (mm after aligning the boxes) and the size ratio; the report gives the medians, the number of words more than 1.5 mm off and the worst.
  Words only on the paper, or only in DCRS, are listed as phrases; a word in other letters (`Format` against `FORMAT`) is listed.
* **Rules** (lines and the edges of rectangles; a rectangle thinner than 1.6 pt is a line; collinear pieces merged): missing, extra,
  shifted by more than 1 mm; the median width ratio.
* **Header block**: the x positions of the vertical rules in the top 45 mm, paper against DCRS.
* **Fonts**: family and size, by the characters set in them.
* **Grid**: horizontal and vertical line counts, and the number of full-width row lines.
* **Score (100 = identical)** = pages 15 + orientation 10 + content box 10 + words 35 + rules 30; the arithmetic is at the head of `compare.py`.
  A **photograph** reference (F/QC/13, the Gujarati F/QC/15, F-QC-32) is compared by eye only (`photo-side-by-side.png`): its score is -1.

LOOK at the side-by-side pictures: the numbers say where to look, the pictures say whether it is right.

## The guard

`--make-baseline` renders every non-QC document the Document Library starts a record of (HR, Maintenance, System, Purchase, Store,
Dispatch, Production, Marketing, ...) and the Chemical Master and the Licence, once, as a blank record under print media, and keeps a
digest of the words' and rules' geometry (a date or time is masked: only its place counts, so the digest is the same tomorrow).
`--guard` renders them again against a fresh private server and lists any document whose digest changed. A change to a shared
component (the header block, the sheet's CSS, the print preparation) must leave HR's and every other module's output as it was.

## Not covered

F-QC-14 (Excel), F-QC-30's and F-QC-40.C's photographs, F/QC/34, 35, 37 and the camera challenge test have no paper in the owner's
folder: they are captured but not compared (the map lists them). A Word or Excel original is compared through the PDF the owner made
from it; where he sent none, through the PDF Word or Excel makes of his original on this PC (Office 16 is installed; round 2 of
20-Oct-2026): F/QC-09's is kept in source-documents/qc-office-exports-2026-10-20/ and named in refs.py.
