# Indexing module

The **Indexing** page (sidebar → Indexing, `#/indexing`) lists every format and document of the plant in one place. Only the super admin can see it or change it.

## What it shows

| Tab | Contents |
|---|---|
| **Formats** | Every format DCRS holds plus every line of the Master List of Formats (F/SYS/02). Each line shows: format no., name, department, revision no. and date, frequency, responsible role (and who that is), method of recording, retention period, disposal method, hard-copy file location, status, automatic or manual, formulas, and records (filled, open, first and last date). |
| **Documents (F/SYS/01)** | The 173 manuals, SOPs and procedures: document no., description, document control, latest revision, retention, file location, status, remarks. |
| **Formulas, ranges & automation** | **Ranges & limits:** every range a format judges readings by, with its paper default, the range in force and its history. For example F/QC/30 Viscosity 19–21 Sec., F/QC/40.C Hot room 43–47 °C, F/PRD/19 nip pressure 2.5–3.5, the COA tolerances ± 2 mm, F/SYS/07 audit frequency 0–4 / 5–15 / 16 and above, F/PUR/05 grade, and the F/MKT/04 Pareto cutoff 80 %. Ranges written on each sheet or line, such as the Acceptable Tolerance box or the Specification column, are shown but not changed. **Formulas:** all 19 worked-out cells with the formula in force, the default formula, the figures each one uses, a calculator to try it, and its history. **Automation:** which formats are **Automatic**, **Manual start**, **Reference only** or **Not in DCRS**. |
| **Versions** | Every saved version (who, when, why, what changed). Any two versions can be compared, any one can be restored, and the whole index can be reset to its defaults. |

## How changes work

1. Press **Edit index** and change values, formulas, or add lines. These edits are a draft and nothing changes yet.
2. Press **Review & save as version N**. This lists every change as before → after, and you must give a reason.
3. The save becomes version N:
   - **A format's own details** are written into the format itself:
     - format no., name, company name, revision no. and date go into the format edits, with a line in its change history;
     - frequency goes into Master Data's frequencies;
     - responsible role goes into Master Data's role keywords.

     The form header, calendar and reminders follow them. These fields are marked ● on the screen.
   - **Index-only details** (retention, disposal, recording method, file location, status, remarks, the F/SYS/01 lines, added lines) are kept in the index.
   - **A changed range** applies from the moment it is saved:
     - the red out-of-range highlight and count;
     - the printed heading, so "Viscosity (20.0 ± 1.0 Sec.)" becomes "(20.0 ± 2.0 Sec.)";
     - Mitra's pre-fill and the Insights warnings.

     A **submitted or verified record keeps the range it was signed with**. Score bands (audit frequency, supplier grade) are edited as a table of bands and saved as their formula.
   - **A changed formula** applies from the moment it is saved, to every open record (they are recalculated at once) and every new one. A **submitted or verified record keeps the formula it was signed with**. If it is reopened for correction, it takes the formula in force then. The old formula stays in the formula's history.
4. **Edit the format itself:** on each format line, and in its Details, the **Format** / **Edit the format's design** button opens the format in its designer (columns, boxes, headings, printed lines, saved as a new revision with a reason). A form that is not a grid opens on its page, where **Edit format** is.
5. **Restore** and **Reset to default** are saves too: they create a new version, so nothing is ever lost.

Formulas are written like Excel:
- figures named on each card (e.g. `W`, `T`, `SUM`)
- `+ - * / %` and brackets
- comparisons: `< <= > >= = <>`
- `IF(c, a, b)`, `AND(…)`, `OR(…)`, `NOT(…)`
- `ABS`, `ROUND(x, n)`, `MIN`, `MAX`, `FLOOR`, `CEIL`, `SQRT`, `POWER`

A formula is parsed, never run as code. A formula that can't be read, or that names an unknown figure, is refused before saving.

## Files

| File | What it is |
|---|---|
| `IndexingPage.tsx` | The screen |
| `indexRows.ts` | Builds the lines (defaults, current values, automation, record counts) |
| `indexActions.ts` | Save as a version, push to the formats, restore, reset, compare, recalculate open records |
| `indexState.ts` | What is stored: the company item `indexing` (current values, versions, formula timelines) |
| `formulas.ts` | The 19 editable formulas and the built-in rules |
| `formulaLanguage.ts` | The safe formula reader |
| `formulaRuntime.ts` | Which formula a record is calculated with |
| `ranges.ts` | Every range and limit: its default from the paper, how it reads, score bands ⇄ formula |
| `rangeRuntime.ts`, `rangeIds.ts` | Lays the changed ranges over the formats (limits, heading wording, Mitra's fill value), pinned for signed records |
| `RangesSection.tsx` | The Ranges & limits section of the screen |
| `tests/` | Run with every `npm run test:unit` (or `npm run test:unit -- indexing`), or alone with `node --no-warnings=ExperimentalWarning indexing/tests/run.ts` |

## Small hooks in the existing app (everything else is in this folder)

- `frontend/src/App.tsx`: the `/indexing` route.
- `frontend/src/components/layout/Sidebar.tsx`: the Indexing menu item, shown to the super admin only.
- `frontend/src/i18n/strings.ts`: the menu label (English and Gujarati).
- `backend/storageRoutes.ts`, `frontend/src/data/serverSync.ts`, `backend/engineHost.ts`, `frontend/src/engineHost/entry.ts`: the stored item `indexing`, which **only the super admin may write**. The server refuses anyone else.
- `frontend/src/engine/calibration.ts`, `purchaseRatings.ts`, `auditRisk.ts`, `maintenanceCalc.ts`, `marketingCalc.ts`: each formula cell first asks the index whether its formula was changed. If it wasn't, the original code runs exactly as before.
- `frontend/src/data/seed/logSheetLayouts.ts`: every layout passes through `withIndexRanges`, and a record's layout uses the ranges in force when it was submitted. `frontend/src/engine/marketingCalc.ts` `paretoCutoff`: the default cutoff from the index.
- `frontend/src/engine/computedCells.ts` and `frontend/src/components/records/LogSheetRecordView.tsx`: a signed record is calculated with the formula in force when it was submitted.


## Text & layout — every format fully editable, its words movable

Indexing → Formats → **Text** (or **Text & layout** in a format's details) opens the format's own sheet with a panel
over it (super admin only). Click any printed word on the sheet, then:

- type new words, or hide them;
- bold, bigger / smaller, line up left / centre / right;
- drag the word to move it, or nudge it with the arrows (Shift = 10px).

Changes show at once; **Save as an Indexing version** keeps them as the next version (compare / restore / reset in
the Versions tab). They show on screen, in print and in the downloads, for every kind of format. A signed record keeps
the words it was signed with. What is typed into a record is never offered and never changed.

Files: `textLayout.ts` (what is stored), `paperTextLayer.ts` (lays the changes over every sheet marked
`data-format-id`), `TextDesigner.tsx` (the panel), `tests/textLayout.test.ts`.
