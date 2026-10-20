# Originals check

A manual tool (like `tests/qc_visual`; not part of `npm run test:e2e`) that holds every document's **download** against the
owner's own Word or Excel file it is meant to be (REQUIREMENTS section 119; the owner, 20-Oct-2026: *"when user click on
print button or download the any particular document then it should download the same document which i have uploaded /
Supplied to you and this is applicable to all modules"*).

The templates are the owner's originals converted by Word and Excel themselves (`scripts/originals/convert.py`):
`frontend/public/originals/<document-id>.docx|xlsx`, with each original's own PDF in `source-documents/originals-pdf/` and the
manifest `frontend/src/data/seed/originalFiles.ts`. The filler is `frontend/src/utils/originalFill/`.

## What it does

1. Starts its **own private DCRS** (`server.ts`, `private_server.py`): a temporary embedded PostgreSQL, port 4300, this
   worktree's code (built first), the seeded super admin on a **random password made per run in memory** (never written,
   printed or committed), sign-up off, working hours off, `JOBS=0`, no AI key of any name, no push. Demo Mode is on and
   `ALLOW_SAMPLE_FILL=1`, as on the e2e suites' server, so Mitra's sample fill works on a new record (plainly test data, never a
   Live record in the plant - REQUIREMENTS section 98). The server and its database are removed when the run ends.
2. Per document (`check.py` -> `browse.py`): opens a **new record** from the document's page, asks Mitra
   `fill it with sample data`, saves what the page shows (`blocks.json`: the blocks the Download button reads, through
   `blocks_entry.ts` bundled by `bundle_blocks.mjs`), presses **Download** and keeps the file, then uploads that file back
   through the page's own **Upload changes** and keeps what the dialog says.
3. Judges each file (`judge.py`):
   - **(a)** read back without the app (openpyxl / the Word XML): every value DCRS showed is in the file; the owner's own
     words that DCRS does not show and that are still in the file are listed, those that look like an entry (a date, a
     number, a code) flagged; the round-trip map is whole (the very hidden `_dcrs` sheet and its names, or the custom XML
     part and the `dcrs:<i>` controls);
   - **(b)** Word / Excel export the download to PDF (hidden, quit at the end, only their own processes ended), held against
     the original's PDF: pages, orientation, the original's words found at their place (within 6 pt), its rules found at
     their place (within 3 pt); a side-by-side picture of the first pages and a score (15 pages, 10 orientation, 35 words,
     40 rules);
   - **(c)** the Upload changes dialog said "Nothing in this file is different from the record - there is nothing to apply".
4. Writes `report.md`, `report.json` and `gallery.html` into the output folder.

## Commands (from the worktree root; `python -I`)

```
python -I tests/originals_check/check.py --docs qc-bopp-film,hr-competence      # some documents
python -I tests/originals_check/check.py --all                                  # every document with a template
python -I tests/originals_check/check.py --docs a,b --no-build --no-pdf          # no build, no PDF comparison
python -I tests/originals_check/check.py --docs a,b --compare-only               # (a)+(b) again on the files kept
node tests/originals_check/fill_offline.mjs <id> <blocks.json> <out> [<report>]  # the filler alone, on a saved page
```

Options: `--port N` (default 4300; never 3000, 4000, 4100, 4200-4202, 8081, 8090, 8842, 8843, 8851, 5432, 5433), `--out DIR`
(default: this session's scratchpad `originals-check`; never committed), `--no-fill` (a blank record).

Needs Windows with Microsoft Word and Excel 16 (pywin32) for (b); Python with openpyxl, lxml, pdfplumber, pypdfium2,
Pillow, playwright (Chromium); Node 24 and the worktree's `node_modules`.

## Reading the numbers

- A **filled specimen** template (F/QC/16's thirteen lines, F/HR/01's eighty people, the line-clearance sheets) loses its
  example entries in the download: they show as the original's words "not at their place" in (b), by design.
- The **owner's overrides** show as differences too: no DATE cell in the header block (section 117), DCRS's company name
  (section 95), DCRS's format number where his paper printed another (F/QC/12's foot reads F/QC/13 on his file).
- Values DCRS shows that the paper has no place for are listed as "not placed" in the filler's report and as missing in (a).
