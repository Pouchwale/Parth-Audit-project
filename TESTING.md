# TESTING.md — Test Plan & Results

Per section 42 of the build brief, the application was actually built, run, and tested in a
real Chromium browser (Playwright) against the production build — not just reviewed as source.
Seven scripts live in `tests/`:

- `tests/e2e_smoke.py` — the core acceptance walkthrough (calendar → day → record →
  save/submit/verify → dashboard update → persistence → demo isolation → every module page
  loads → sidebar accordion → module-filtered library deep link), network-independent.
- `tests/e2e_backlog_regression.py` — injects a simulated pre-fix record backlog straight into
  `localStorage` before the first post-fix boot and proves the launch-date-floor fix actually holds
  (not silently promoted to "ready", cleanup banner accurate, a human-verified record with the same
  old due date survives untouched). Network-independent.
- `tests/e2e_voice.py` — proves the voice assistant waits for the *whole* spoken sentence. Headless
  Chromium has no speech engine, so a fake `SpeechRecognition` is installed before the app boots and
  driven by hand: speak a fragment, pause 1.2 s mid-sentence (nothing may be sent), speak the rest, go
  quiet — exactly one message must be sent, containing both halves — plus pressing "Done" mid-utterance
  sends what was said rather than discarding it. Network-independent and deterministic.
- `tests/e2e_realism.py` — reads a generated demo year the way an auditor would. Asserts that
  exceptions exist and stay exceptional (some readings outside the printed band, but under 5% and
  clustered on some days), that every exception carries its consequence (a remark beside an
  out-of-band reading, an action against a flagged check point, a reason beside a lot that isn't
  Accepted, a corrective action against every CAPA finding), that sign-off looks like sign-off
  (varied clock times, some rejections naming a reason and a rejector, verification not always
  same-day and never before submission), that nothing is filled in for a date that hasn't happened,
  and that a second browser reproduces the same day exactly. Network-independent.
- `tests/e2e_editing.py` — every record can be corrected, safely: a manual edit saves itself and is
  logged as before → after; a verified record is locked and offers "Correct this record", which needs
  a reason, reopens it and keeps what it said; the assistant changes a field from a plain sentence,
  lists the change and can undo it, refuses a value the form can't hold, and on a verified record asks
  before reopening; Master Data rows are corrected in place and deletes take two taps.
  Network-independent (common edits are understood locally).
- `tests/e2e_files.py` — Document Files: "all document of pest control module from June to August"
  opens `#/files/pest-control/…` for exactly 1 June – 31 August (one folder per month, every file a
  pest control document inside the span, the summary counting exactly what's shown); a day-to-day
  span holds only files between those days; "November to February" runs into next year; "all
  documents from 1 to 5 …" opens every module; a folder narrows the list, From changes the span and
  the address, a file opens its record; a broken `/files` address falls back to this month; "may I
  … marked …" isn't read as May or March. Network-independent.
- `tests/e2e_print_and_forms.py` — printing prints the document and nothing else (a record's Print,
  the F/HR/18 register's Print, the browser's own Print on the register and on Reports, the SOP's new
  Print; `window.print` is replaced by a counter and the printout inspected under print media); the
  service report's fixed material / method and one-quantity-per-material rule, on the form, through
  the assistant and for an older draft brought into line at start-up; and the F/HR/18 register's Add
  visit / Edit register for a chosen Month & Year (refusals, autosave into the visit's history, names
  carried forward, a submitted visit locked, an added visit left alone at restart). Network-independent.
- `tests/e2e_capa_formats.py` — the plant's codes on CAPA paperwork and the CAPA summary: a new
  complaint is numbered 26-27/001 (the next taking /002) and stays editable (a bare "7" becomes
  26-27/007); a Job Code typed loosely is tidied to FGSL3877, one that doesn't fit shows the format and
  a wrong PO No. blocks Submit; the assistant is held to the same formats both ways it can write one (a
  plain-words edit and the guided complaint walk-through) — tidying what it is told and refusing what
  doesn't fit with the reason; asking for a CAPA summary answers for both sides, or one when named;
  the language control is in the top bar only; External CAPA is mandatory section by section (no
  skipping an activity or a section, Submit refused while anything is blank and naming what is left);
  and the assistant asks for a review before it submits. Network-independent.
- `tests/e2e_agreement_and_cancel.py` — the two-yearly service provider agreement and Cancel edit:
  the Service Provider page asks for the agreement (none on file), offering both ways out — drafted on
  the provider's letterhead or the signed copy uploaded; "Remind me later" snoozes to a date and the
  card still says where it stands; the drafted agreement carries the provider's printed letterhead, a
  two-year term, the SOP's services and the licence number, and TO BE CONFIRMED where nobody has told
  the system; it saves itself, the assistant can fill it in, a signed copy uploads onto it, and once in
  force the page stops asking; both training records are headed with the provider's printed letterhead
  and it prints with the document; and Cancel edit puts a reopened record straight back — on a
  record-page document and on a Training record — asking first when something was changed, with the
  cancellation in the record's history. Signs IN to a fixed account (see the note below). Network-independent.
- `tests/e2e_crud.py` — Create / Read / Update / Delete on every document, by hand and by assistant:
  the Document Library offers New on every document that holds records (and not on the reference ones);
  the assistant starts one from words and a second for the same day opens the first; it can print,
  submit and verify from the chat; delete always asks first, a signed-off record takes a reason, and
  every deletion is listed in Document Library → Records deleted, from the page and from the chat
  alike. Signs IN to a fixed account. Network-independent.
- `tests/e2e_print_all_documents.py` — printing prints the document and nothing around it, on every
  document of every module: each record started from the library, every reference document, register,
  report and file list is inspected under print media. Signs IN to a fixed account. Network-independent.
- `tests/e2e_assistant_fill.py` — the assistant fills a WHOLE document, question by question or with
  sample data: a complaint checklist generated from words (in format, every activity answered with a
  date and a comment, prepared-by filled, approval left, the chat saying it is sample data) and passing
  every submit check; sample data on an open record, undone; a training record filled question by
  question, each answer in the history, handed back to be checked; "I want to fill …" said where nothing
  is open opens the document and asks there; the same from the full-page Assistant; an ambiguous name
  asked about; and every document that holds records started from the library, filled with sample data
  and submitted. Signs IN to a fixed account. Network-independent.
- `tests/e2e_trend_reports.py` - the company's three trend reports, cell for cell against the paper:
  every figure of "GP-3 Trend Analysis - 2025.pdf" is typed out in the suite, so the rodent, lizard
  and flies sheets must show that Source, that Unit, that Target Pest, those twelve months and that
  Total (blank where the page leaves it blank), with nothing tinted as computed on a transcribed row;
  each sheet's chart must be an inline SVG of thirteen bars carrying the drawn year's own figures, and
  picking 2024 must redraw it from the 2024 row. Also: all three are reachable from the module
  overview, the sidebar and Reports; the Training Record has no Attended column, no tick box and no
  `attended` field; and the SOP Reference is gone from the module, the sidebar, the library and this
  browser's document list, while the Service Agreement still carries all five services and their
  frequencies. Network-independent.
- `tests/e2e_hr_module.py` - the Human Resources module (REQUIREMENTS §46): the library holds forty
  documents and the module's twenty-six are shelved by section, HR's five groups then the pest control
  file's four, with every one of the sixteen F/HR formats under the right one; the sidebar has a Human
  Resources module and no Pest Control module, reading HR Records, then Pest Control and the file's
  groups; the eight filled registers are on file as LIVE records with the PDFs' own figures - row
  counts, first and last lines, named lines, the analysis sheet's percentages - and open read-only in
  their own layout; a new record of each blank format opens with the paper's printed rows; a Quality
  Control account sees nothing of it and a Human Resources account sees the module without CAPA.
  Since REQUIREMENTS s47 also: the sidebar's HR Overview and sixteen format pages in order, each format
  page showing its register in full, the eight job responsibility sheets read one after another, a
  blank format started from its page, HR Overview's groups, and Open Document clicked for all forty
  documents with none landing on the Record Calendar. With that change `npm run test:e2e` is green end to
  end at **845 checks across sixteen suites**. REQUIREMENTS s48 then added the Record Calendar's Back
  button, covered in `tests/e2e_smoke.py`, bringing the run to **850 checks**.
- `tests/e2e_hr_cv_import.py` - a new joiner from their CV (REQUIREMENTS s49): a PDF CV made by Chromium
  and a Word .docx made as a zip are read by the server field by field, and an unlabelled CV's employment
  periods are added up (education dates left out); the review form takes the department and what the
  position requires from the competence register and works out the gap; Add puts a staff member on F/HR/01
  and F/HR/08, each reopened for correction, and starts her F/HR/05 and F/HR/04, and puts an operator on
  F/HR/03, F/HR/06 and F/HR/08 instead, each line in its register's own date style; nobody is added twice;
  .doc, photo and oversized files are refused with a reason, entry by hand works, and the reader wants a
  session. The server runs with CV_READ_WITH_ASSISTANT=0 (scripts/run-e2e.ts), so this is the text rules;
  the assistant's part is checked live in `tests/e2e_assistant_chat.py`. Network-independent. With it
  `npm run test:e2e` is green at **892 checks across seventeen suites**.
- `tests/e2e_qc_calibration.py` - Quality Control's two internal calibration records (REQUIREMENTS
  s51), a transcription check of the two scanned pages: both documents on the QC shelf with their format
  numbers and revisions; every column of both grids in the form's own order, the Deviation % beside every
  weight and every plate; both supplied pages picked from the document's page and read cell for cell,
  header block included; the illegible cells left blank and marked TO BE CONFIRMED; a new weekly sheet
  starting from the page on file with the device carried forward; and the Deviation % cells still
  ordinary entry cells, since the calculation was deliberately left for later. Network-independent.
- `tests/e2e_qc_formats.py` - Quality Control's thirty-two formats as the department supplied them
  (REQUIREMENTS s57): the module holding all thirty-eight documents in the department's seven sections;
  every one of the thirty-two opening on a page of its own under its own format number; an incoming
  material inspection record printing its test parameters and specifications, taking the observation (or
  the three samples) beside each and offering the form's own four lot statuses, with what is typed stored;
  the offset ink's two drying tests kept against the one parameter; a line clearance register taking the
  twelve columns and the area's own checklist, a line written and another added; the two Gujarati
  checklists printing their processes and lines; the master list of calibration instruments taking its
  sixteen columns; the supplied pages on file cell for cell - thirteen obsolete artworks, the printing
  aids destroyed, the label and sleeve certificates with their colours, the PSL analysis, the nine Nivea
  utility tests and the Gangwal meeting's seven points; a certificate and the minutes downloading as Word
  while a register downloads as Excel; each format found by its format number (including the two numbered
  F/QC/21); and Mitra opening one asked for by name. Network-independent. (42 checks)
  With it `npm run test:e2e` is green at **940 checks across eighteen suites**.
  Extended on 19-Sep-2026 for REQUIREMENTS §58: QC Records at `/qc` showing the department's seven sections
  and then the two modules that keep its other formats, all forty-three of Quality Control's formats one row
  each, every row reading "format number - name of that document" (and by name alone, saying so, for the two
  forms that print no number), the row naming the department printed on the form (Quality Control's and
  Quality Assurance's both present), the three Gujarati formats saying they are being shown in English, a row
  opening that format's own page, the button opening the library on the module, and the sidebar reaching the
  page; then the three Gujarati formats read line for line in English - both clearance checklists' processes,
  materials and parameters, F/QC/13's procedure, boxes, six graded parameters and its grade chart - with
  nothing left in Gujarati on screen, while a record started on the clearance checklist still HOLDS the
  form's own Gujarati. (17 more checks, 59 in the suite)
- The low-end work of REQUIREMENTS §65 (23-Sep-2026) is covered by the suites that already exercise the paths it
  changed, run together after it: `e2e_smoke`, `e2e_editing`, `e2e_crud`, `e2e_files`, `e2e_hr_module`,
  `e2e_departments`, `e2e_trend_reports`, `e2e_qc_formats`, `e2e_no_demo_mode` and `e2e_login_only`. Two of
  those checks are what the work turns on. **"No JavaScript errors"** is what proves the shared, frozen copies
  of the documents list, the master data and the HR master sheet are never altered in place — altering one
  throws where it is made. And the record serialiser carries its own guard: every save re-reads one record for
  real, a different one each time, so a record altered in place prints a line naming it and the whole array is
  stored properly; a suite run that is silent is a run in which nothing was.
  The first full run of §66 also caught a defect of its own worth recording: signing out reset what the server
  had said it allows and nothing asked again, so a sign-in screen that came back after a sign-out offered no
  way to create an account even where sign-up is open. `e2e_departments.py`, which signs out and then signs a
  second account up, is what found it (701 checks in, no check having failed — it stopped on the missing link).
  The app now asks the public question again whenever that screen returns.
- `tests/e2e_login_only.py` - nobody creates their own account (REQUIREMENTS §66), a twenty-ninth suite, added
  23-Sep-2026. It runs against the same **product server on :8843** as the suite below - the portal as a plant
  installs it, which now also means the plant's named accounts are seeded there (on a password only the runner
  and the suite know) because with sign-up closed there has to be somebody to sign in as. It checks the screen
  with no way to register and the server's own 403 with it; `GET /api/auth/config` saying signup is false and
  carrying nothing about anybody; the administrator's Users & Access page, and a member of staff refused it by
  the page AND by the server; a person added with Quality Control ticked, the same address refused a second
  time, and an account asked for as an administrator made staff all the same; her forced first password - the
  pop-up that will not be waved away by Escape or a click beside it, `/api/storage` refused with
  `password-change-required` until she has chosen, and the password she was given refused as her own; then
  Quality Control's documents opening for her and Human Resources refused by name; a reset that stops her
  chosen password working and asks her to choose again; her account switched off, the plain reason at sign-in,
  and switched on again; and all of it in the activity log with no password anywhere in it. (45 checks)
- `tests/e2e_no_demo_mode.py` - Demo Mode is not part of the product (REQUIREMENTS §65), a twenty-eighth
  suite, added 23-Sep-2026 and the only one that runs against a **second server on :8843**: the same database
  and the same build, started WITHOUT the test flags - the product exactly as a plant installs it. The runner
  brings that server up for this suite alone and stops it again, and refuses a busy :8843 before it builds.
  It checks that the server says so with who is signed in (`features.demoMode` false); that the top bar has no
  Live / Demo switch and no mode band and the sidebar no Demo Mode link; that `#/demo` typed into the address
  bar is "Page not found"; that a "demo" left in somebody's settings from before is read as Live, with no
  banner and no watermark; that the Dashboard, the Calendar and the Performance Scorecard do not say the word
  anywhere; and that a demo record left in the database from before is removed when the app starts - in the
  working copy and in PostgreSQL - while every Live record stays. (25 checks)
  The rest of §65 is covered by the suites that already read the sidebar, the sign-in screen and a record being
  filled. Six of them were run together after the change - `e2e_smoke`, `e2e_editing`, `e2e_crud`,
  `e2e_hr_master_data`, `e2e_files` and this one - green at **331 checks, no JavaScript errors**, which is what
  proves the newly shared, frozen copies of the documents list, the master data and the HR master sheet are
  never changed in place: a change made to one would throw where it was made, and every suite fails on a
  JavaScript error. It now signs IN as the seeded super admin rather than signing itself up, because on that
  server nobody may register (§66).
- Three suites were added on 19-Sep-2026 for REQUIREMENTS §64, the twenty-fifth to the twenty-seventh. All
  three are network-independent and read no model.
  - `tests/e2e_sheet_designer.py` - a format designed on the sheet, on F/QC/03 (a form that prints its lines)
    and F/QC/16 (a register people write): Edit format turning the page into the designer; a column inserted
    from a heading's menu, named where it appears, renamed (Enter keeps, Escape leaves), duplicated, moved and
    deleted behind a pop-up that says what happens to records on file; a printed column's type locked; a key
    never handed out twice; every control kept off the paper; a box made a required Choice; printed lines
    inserted, reworded, duplicated, moved, deleted; undo and redo by button and by Ctrl+Z / Ctrl+Y, which stay
    a text box's own inside one; Save listing the changes, offering the next revision and refusing without a
    reason; the saved revision on the page, in `formatEdits` and on a record started afterwards; Discard; the
    toolbar still in view at the foot of the sheet; **a sidebar link, the browser's Back and Log out all asking
    before a sheet with changes is left** - a Back that is agreed to landing on the page before the sheet, and
    the next Back on the page before that; the Document Library's Edit format opening the sheet on the
    format's own page, with no New record beside it; a program-drawn form still opening the dialog; the
    activity log. It restores the issued formats on its way out. (140 checks)
  - `tests/e2e_mitra_format.py` - the same changes told to Mitra: asked first with the revision named, No
    leaving the format alone, Yes saving it with the person's words as the reason; a name that fits two things
    asked about, never guessed; "row" meaning the record wherever the form does not print its lines, with
    Undo; the change landing on an open designer's draft with no revision made; a program-drawn form refused
    honestly; an offer that lapses once the conversation moves on; and Mitra's reaction to a submit - on time,
    late, as-required, several at once - as a toast and in the chat. (54 checks)
  - `tests/e2e_performance.py` - the scorecard: the rule on its face; every line adding up and its score
    recomputed here from its own numbers, one document recounted from its records; the period changing what
    is counted; a line opening its format; CSV and print; `/api/users/directory` carrying no email or hash; an
    account with no departments listed unscored, a QC account scored on and shown QC only; a shared
    department's records counted for whoever submitted them. It makes two signups and is last in the run.
    (62 checks)
  `tests/e2e_portal_controls.py` reaches the §62 dialog through the designer's *More options…* (37 checks,
  unchanged). With them `npm run test:e2e` is green at **1591 checks across twenty-seven suites**, all on
  PostgreSQL, no JavaScript errors.
- `tests/e2e_portal_controls.py` gained seven checks on 19-Sep-2026 for REQUIREMENTS §63 (the eye beside a
  password box), listed in that section - 37 in the suite, **1335 across the twenty-four**.
- `tests/e2e_portal_controls.py` - the portal's own controls (REQUIREMENTS §62), a twenty-fourth suite: the
  briefing's review gate, a format changed and revised on record and restored, the activity log, the password
  change, the lizard year. Network-independent. (30 checks) The smoke suite's rodent check now holds the year
  to the two-to-four-per-six-months the department restated.
  With it `npm run test:e2e` is green at **1328 checks across twenty-four suites**, all on PostgreSQL. One
  check in `e2e_print_all_documents.py` now looks for the PAGE's Print button: the person's own name in the
  top bar became a button (it opens Change password), and that suite's account is called "Print QA".
- `tests/e2e_qc_calibration.py` was extended on 19-Sep-2026 for REQUIREMENTS §61 (the deviation worked out):
  nine checks, listed in that section, replacing the one that held the Deviation % cells to be ordinary entry
  cells.
- `tests/e2e_qc_formats.py` was extended again on 19-Sep-2026 for REQUIREMENTS §60 (Mitra opening with the
  document): six checks, listed in that section. Four clicks on the "Ask Mitra" pill in `e2e_editing.py`,
  `e2e_print_and_forms.py` and `e2e_qc_calibration.py` now happen only when the panel is not already open.
- `tests/e2e_print_and_forms.py` was extended on 19-Sep-2026 for REQUIREMENTS §59 (the paper carrying the
  document alone): the `@page` rule carries no margin at all, so a browser has nowhere to print the date,
  the time, the address or the page number; a printed document keeps that 12 mm for itself; and every page
  of the F/HR/18 register keeps it without the register adding a second one. (3 checks)
- `tests/e2e_format_numbers.py` - any document by its format number, and F/HR/05 as the form prints it
  (REQUIREMENTS s52): F/HR/05's seven lines (five topics numbered only by Sr. No., topic 2's points on their
  own lines, two blank lines that take a written topic); Search finding each document from F/HR/05, f-hr-05,
  F HR 05, FHR05, hr 5, F-QC-40.C, QA-CAF-00 and the rest, listing only that document's records, with Open
  document and New record; Mitra naming a format number and asking before it does anything, opening one
  when told to, saying when a number isn't in the system, treating a bare number as a question even on an
  open record, and taking numbers in its commands; the full-page Assistant alike; and a Quality Control
  account told only whose F/HR/05 is. Network-independent. With it `npm run test:e2e` is green at
  **981 checks across nineteen suites**.
  That run fell on a Thursday weekly off (17-Sep-2026), which showed three suites assuming today is a
  working day. `e2e_editing.py` and `e2e_translate.py` now open the next working day's daily record (from
  the leave calendar - Thursday weekly off, adjustment days, festival holidays - as `e2e_assistant_chat.py`
  already did), since a closed day's record is the holiday line with no checker to write in; on a closed
  day `e2e_editing.py` has Mitra fill it with sample data first. `e2e_smoke.py` submits nothing on a
  closed day, so its reload check there is that the sheet itself survives - its 24 lines, not
  submitted. They pass on any day of the week. The same run found `e2e_voice.py` dismissing the
  first-open briefing after a fixed 0.7-second pause: on a busy machine the briefing came up just after
  it, stayed over the Assistant page and swallowed the click on the voice button. It now waits for the
  app and then for the briefing before dismissing it. And `e2e_qc_calibration.py`, written on a
  Wednesday, took F/QC/12's New record to be the week's sheet already prepared from the page on file -
  true only on its scheduled Wednesday; any other day New record starts the sheet blank. On those days
  the suite now asks Mitra to fill it, the same carry-forward from the page on file, so the check holds
  whatever the day.
- `tests/e2e_postgres_storage.py` - the whole project's data in PostgreSQL (REQUIREMENTS s55): what the app
  sets up at sign-in stored in the database (the company's items once, a person's settings as their own)
  and the browser's working copy equal to it; a change on HR Master Data written to the database, seen by a
  second person signing in elsewhere, and their change reaching the first person's open screen without a
  reload; one person's language leaving the other's alone; two people changing the same sheet at once both
  keeping their change; a change the database cannot take said on screen, kept, and sent when it answers
  again; a change on its way when the page closed reaching the database at the next opening; signing out
  and in again in the same tab never writing the old copy back over a record someone added meanwhile;
  records a browser kept from before the database merged in at its first sign-in, nothing the database
  held lost; an account kept to Quality Control handed only its own department's records and not HR Master
  Data (which it cannot write either), and what it writes replacing only Quality Control's records; only
  the app's own items, and only JSON, stored; the date the system went live stored once, for the company;
  accounts signing in from the database; the stored data refused without a session. Every suite now runs
  against a PostgreSQL the runner starts for the run, emptied before each suite
  (`npm run test:e2e -- tests/e2e_postgres_storage.py` runs one suite). Network-independent. (34 checks)
  `npm run test:e2e` is green at **1260 checks across twenty-three suites**, all on PostgreSQL, no JavaScript errors.
  After REQUIREMENTS §58 (19-Sep-2026) the same twenty-three suites are green at **1282 checks**: seventeen
  more on `e2e_qc_formats.py` (QC Records, and the three Gujarati formats read in English) and five on
  `e2e_translate.py` (the documents translated with the page, a typed value still as typed, a Gujarati form
  untouched, the identifying marks as issued).
- `tests/e2e_downloads_and_print.py` - every document as its own kind of file, and a wide one printed whole
  (REQUIREMENTS s54): F/HR/01, F/HR/09, the GAP report and the daily pest control register downloaded and read
  back as Excel workbooks (header block, bold heading row, every line and every one of F/HR/09's 29 columns,
  landscape one-page-wide print setup); F/HR/05, a statement of compliance, the training record and a complaint
  checklist downloaded and read back as Word documents (title, header block, the grid as a table with a
  repeating heading row, a portrait page for a five-column form); no download for the scanned licence; printing
  F/HR/09 turning the page landscape and scaling it to the paper, the PDF coming out on landscape A4, the screen
  put back afterwards, and F/HR/05 staying portrait. Network-independent. With it and `e2e_hr_master_data.py`
  (81 checks) `npm run test:e2e` is green at **1083 checks across twenty-one suites**, no JavaScript errors.
- `tests/e2e_hr_master_data.py` - HR Master Data, the employee master sheet the HR formats fetch from
  (REQUIREMENTS s53): in the HR module's sidebar and on HR Overview, in exactly the six columns; set up with the
  115 current employees of F/HR/01, F/HR/03 and F/HR/06 (one line per person across registers, leavers left
  off, the notes to confirm, GP3 No. and Date of Birth blank); cells written in place, a GP3 No. given twice
  flagged, a line added, found, removed, the sheet sorted; Download Excel read back as a workbook (bold
  headings, text GP3 Nos., real date cells) and Upload of a workbook saved the Excel way (shared strings,
  compressed, a title line, other heading names, dates as dates and as text) and of a CSV, looked over before
  it is applied, with an old .xls refused; Fetch on F/HR/05 by GP3 No., a differing box listed and only
  replaced on Replace, a name typed on F/HR/04 filling the date of birth, candidates for part of a name on
  F/HR/11, Add line on F/HR/06 and on a reopened F/HR/01 in their own date styles, Fill blanks; Mitra listing a
  fetch and writing it only on yes, a GP3 No. answering its "Employee name?" question, opening the sheet, the
  full-page Assistant; the CV import's GP3 No., its fill from the sheet and the joiner put on it; Search by GP3
  No.; and a Quality Control account refused it all. Network-independent.
- REQUIREMENTS s50 (Mitra - the assistant's name, character and "where would you like to go?") is
  covered inside `tests/e2e_smoke.py`: the floating button calls it by name; the opening greets by the
  hour and by name and asks where to go with its answers as buttons; a document is reached by shelf ->
  part -> name and lands on that document's own page; a typed "hello" is answered by name with no
  network; "are you a real person?" is answered plainly. That brings the run to **902 checks across seventeen suites**.
  Signs in as the trend suite's account, the departments suite's QC account, and an HR account of its
  own. Network-independent.
- `tests/e2e_departments.py` - departments, whole-document printing and the trend graph: an unassigned
  account covers every department; the Daily Report's status list and a service report's visit register
  print with the company's header block and Format No., nothing around them, and no table left as a
  scroll container; the rodent trend chart is an inline SVG whose bars carry the table's own figures for
  the year it says it is drawing, redraws when the year changes, and never offers a year that hasn't
  happened; Master Data lists the plant's ten departments with the documents each owns; and a Quality
  Control account sees only its nine documents - the library, the sidebar's modules, the calendar,
  search, the assistant's CAPA summary and a record reached by its own address all refuse or leave out
  another department's paperwork, while a staff account cannot change its own assignment (403 from the
  API). Signs IN to two fixed accounts. Network-independent.
- `tests/visual_qa.py` — deeper per-module interaction checks (Fly Catcher, Service Report, CAPA
  creation, Training creation) plus full-page screenshots of every major screen for visual
  review, saved to `tests/shots/`, network-independent.
- `tests/e2e_assistant_chat.py` — the assistant "buddy" chat feature (`POST /api/assistant/chat`,
  Groq-backed): free-text navigation ("show me all reports of august" → `#/reports/2026/7`, "open
  CAPA" → `#/gap`), a plain conversational reply that does *not* navigate, and natural-language
  field filling on an already-open record. Makes real calls to Groq, so — like `visual_qa.py` —
  it's not wired into `npm run test:e2e` (network/quota-dependent); run it manually.

## How to re-run

```bash
npm run test:e2e     # builds, boots backend/index.ts on :8842, runs e2e_smoke.py THEN
                      # e2e_backlog_regression.py, e2e_voice.py, e2e_realism.py,
                      # e2e_editing.py, e2e_files.py, e2e_translate.py,
                      # e2e_print_and_forms.py, e2e_capa_formats.py,
                      # e2e_agreement_and_cancel.py, e2e_crud.py,
                      # e2e_print_all_documents.py, e2e_assistant_fill.py and
                      # e2e_departments.py, e2e_trend_reports.py, e2e_hr_module.py,
                      # e2e_hr_cv_import.py
                      # against it, tears down
                      # (see scripts/run-e2e.ts)
```

`visual_qa.py` and `e2e_assistant_chat.py` aren't wired into an npm script (slower / make real Groq
calls), so run them against a server you start yourself:

```bash
npm run build
API_PORT=8842 npm run server &     # Windows PowerShell: $env:API_PORT=8842; npm run server
python tests/e2e_smoke.py          # or python3, depending on platform
python tests/e2e_backlog_regression.py
python tests/e2e_voice.py
python tests/e2e_realism.py
python tests/e2e_editing.py
python tests/e2e_files.py
python tests/e2e_print_and_forms.py
python tests/e2e_capa_formats.py
python tests/e2e_agreement_and_cancel.py
python tests/e2e_crud.py
python tests/e2e_print_all_documents.py
python tests/e2e_assistant_fill.py
python tests/e2e_departments.py
python tests/e2e_trend_reports.py
python tests/e2e_hr_module.py
python tests/e2e_hr_cv_import.py  # start the server with CV_READ_WITH_ASSISTANT=0 for the text rules alone
python tests/visual_qa.py
python tests/e2e_assistant_chat.py # needs backend/.env's GROQ_API_KEY to actually resolve; edit
                                    # the BASE constant at the top if your server isn't on :8844
```

Most suites sign up a fresh, randomly-emailed account at the start of the run (the app gates
every page behind login — see `frontend/src/main.tsx`/`AuthProvider`) before exercising the rest of the app.
`e2e_agreement_and_cancel.py` instead signs **in** to a fixed account (creating it only if it isn't
there yet) and clears its browser storage: the server allows a limited number of new accounts per
network in ten minutes (`MAX_SIGNUPS_PER_IP`, `backend/index.ts` — deliberately, so free signups can't
multiply the assistant's per-account cap), and a run plus a few manual re-runs can reach it. If a suite
ever stops at the login screen, that throttle is the first thing to check — it clears when the server
restarts, or after ten minutes.

## Results (last full run - 13-Sep-2026, after the departments / printing / trend batch)

The run below is the production shape end to end: `frontend/scripts/build.ts` builds the bundle,
`backend/index.ts` (run directly by Node 23.6, no compile step) serves it plus the API, and every suite
runs against that. `npm run typecheck` is clean for the frontend and for the backend/scripts.

### The plant's own seasons and rodent figures (13-Sep-2026)

The department described its own year — "in rainy season and winter there is more Fly's then summer"
— and its own rodent figures: three to four a year. Neither matched what the app generated.

- **The fly curve had one peak, and the plant has two.** A single cosine peaking in the monsoon forces
  winter to be the year's quietest quarter; measured off the register, winter ran 15 flies a month
  against summer's 19 — backwards. The curve is now written out month by month, and the generator
  asserts rainy > winter > summer so the shape cannot be lost later. Measured back off the seeded
  register for 2025-27: rainy 26-34, winter 22-24, summer 11-16, in that order every year.
- **A per-day probability cannot hold a yearly total.** At the rate averaging three and a half rodents
  a year the seeded draws gave 4, 2, 1, 1, 5 — the variance of a few rare events is as large as the
  events. The year is now planned rather than rolled: three or four catches drawn from the year alone,
  placed by the seasonal weighting. Every year from 2024 to 2033 lands on three or four, in three or
  four months, checked against the draws themselves rather than against the intended probability.
- **Calibration was measured, not assumed.** Both patterns were checked by replicating the app's own
  seeded draws and summing whole years, before and after — which is how the backwards winter was found
  at all. The intended probability said "monsoon-leaning and seasonal", and it was; the realised
  numbers said winter was below summer.
- **Regenerating a generated file erases hand edits.** A provenance note added directly to
  `pestPattern.ts` disappeared the moment `tools/pest_pattern.py` ran. It now lives in the generator.

### The fly catcher tube lights (13-Sep-2026)

The department gave the two dates: installation 24-11-2025, replacement due 23-11-2026, fixed, every
unit. The app had been COMPUTING them from the service date on a rolling annual cycle it read off the
photographed specimen as December. Two constants replaced the function (REQUIREMENTS §44).

A four-angle adversarial sweep over that change — every producer of a tube-light date; carry-forward
and preservation; what the person and the paper see; stale statements, tests and the model's prompt —
found five further routes by which the old dates or blanks could still appear, and each is fixed. The
one that mattered most was not in the code at all: **records already stored in a browser** were
written by the old code, and because auto-fill carries the previous visit's dates forward, a single
stale record would have kept seeding the next one indefinitely. `src/engine/tubeLightMigration.ts`
corrects those at boot, touching only values the old code could have produced and only drafts, logged
in each record's own history.

The sweep also flagged the F/HR/18 register showing no tube-light dates, and the first reading of that
was wrong. A fortnightly visit not yet carried out IS a blank line on the paper register, and the
sheet reproduces that — but the tube in a unit was still fitted on 24-11-2025 and is still due on
23-11-2026 whether or not this fortnight's inspection has happened, so those two cells are not a
property of the visit. They now print on every line, dittoed on a unit's second line as the specimen
writes them. The department's complaint on being shown the first cut was exactly this: the dates were
on every record, and the register still looked empty. Worth remembering as a general lesson — a
faithful reproduction of "what the paper does" is still wrong if it hides a fact the paper states.

### The Human Resources module: sixteen F/HR formats, and the pest control file inside it (14-Sep-2026)

Sixteen F/HR PDFs arrived with "make HR module ... add those in HR Module only ... also added that Pest
Control module and everything in HR Module". The Pest Control module became one shelf of a new Human
Resources module (REQUIREMENTS s46); the sixteen formats are log-sheet layouts, and the eight
registers that arrived filled are LIVE records line for line. `tests/e2e_hr_module.py` (**118
checks**) is a transcription check like the trend suite - the row counts, first and last lines, named
lines and the survey analysis percentages are typed from the PDFs - plus the library shelving, the
sidebar, the read-only sheets, a new record of each blank format, and the QC / HR department views.

`npm run typecheck` clean and `npm run test:e2e` green end to end - **821 checks across sixteen
suites**, no JavaScript errors. The print-every-document and fill-every-document suites picked the
sixteen new formats up by themselves, so each was started from the library, filled with sample data,
submitted and printed. The live Groq suite `tests/e2e_assistant_chat.py` re-run on the same build: all
checks passed. The Document Library is 40 documents now, not 24.

What the work turned up:

- **A module rename is an address change.** The smoke suite asked the assistant for "pest control
  records" over a span and expected `#/files/pest-control/...`; with no Pest Control module the route
  would have become the Human Resources module - every HR register included - which is not what the
  words mean. So "pest" now names the pest control file (the module's shelf holding F/HR/17, F/HR/18,
  the service reports and the training record), `pest-control` stays a valid Document Files scope for
  exactly those documents, and old links keep working.
- **Section rows are set in small capitals by CSS**, so a test must read `textContent`, not
  `innerText`, to compare them with the seed - `innerText` reports the transformed text.
- **Question 06 of the pre-employment declaration is twelve tick boxes**, so the form is 21 lines, not
  the 22 first written down; the suite counts what the layout prints.

### Three trend reports, the SOP withdrawn, the Attended column withdrawn (13-Sep-2026)

The company's own trend file arrived with three pages, not two: RODENT, LIZARD and FLIES CATCH REPORT
AND TREND ANALYSIS. All three are now in the system with the company's header wording and its figures
to the cell, and `tests/e2e_trend_reports.py` (**102 checks**) is a transcription test rather than a
smoke test - every figure from the PDF is typed out again in the suite, so a single cell reading
differently fails the build. It also covers the two withdrawals that came with the same request.

`npm run typecheck` clean and `npm run test:e2e` green end to end — **642 checks across fifteen
suites**, no JavaScript errors. The live Groq suite `tests/e2e_assistant_chat.py` re-run on the
same build: **13/13**. The Document Library is 24 documents now, not 25.

What the work turned up:

- **The flies trend was measuring the wrong thing.** The company reports it by WEIGHT - gramms
  collected out of the electric fly killers each month - while this system was adding up the
  approximate per-board counts on the fortnightly F/HR/18 register and printing a source line it had
  invented. There is no factor to convert one into the other, so the sheet now carries each year in
  its own unit on its own row (Source / Unit / Target Pest are printed per row on the company's page,
  which is what makes that possible) and the board counts stay below it as the register's detail.
- **The Total was being computed where the paper leaves it blank.** All three of the company's pages
  print a year's Total only once the year is complete. The sheet now does the same; the running figure
  is in the text beside it, so nothing is lost on screen.
- **A year the calendar had reached but nobody had reported was getting a row of twelve blanks**, and
  the chart would then draw that empty row and caption it with that year - the §39 defect again, by a
  different route. A year is now on the sheet only if it was reported or the register holds a record
  for it, and the chart falls back past a row that is still all blank.
- **Removing a document is never just deleting it.** The SOP came out cleanly (retired through
  `RETIRED_DOCUMENT_IDS` so existing browsers drop it), but the Service Agreement was deriving its
  Scope of Services clause - five services and their frequencies - from that transcription. Those
  lines are the contract's own content, so they moved into the agreement rather than disappearing
  with the SOP, and the suite checks all five are still there with their frequencies.
- **Dropping the `attended` flag touched eleven files**, because a boolean nobody looks at is still a
  boolean six engines write. Each one was re-expressed in terms of who is on the sheet - notably
  "X absent" in the assistant, which now removes the name rather than unticking it.

### Departments, whole-document printing and the trend graph (13-Sep-2026)

Three requests in one batch. **Departments** (REQUIREMENTS §40): the ten departments of the company's own
F/SYS/02 master list are configured, every one of the 25 documents is assigned to the department that
owns its format, and a person sees only their own - enforced in the two repositories, so the library, the
sidebar, the calendar, the day view, the dashboard, the reports, the files browser, search, the reminders
and the assistant all follow without each having to remember. Another department's page or record address
answers with a refusal that names the owning department instead of opening, crashing or claiming a
missing definition. The administrator assigns departments in Master Data > Departments & access; a staff
account cannot change its own, and the API refuses it the list of accounts. Record GENERATION is
deliberately unscoped, so no department's obligations vanish because nobody from that department logged
in. **Printing** (§38): three printed lists gained the register's own header block, and four print
defects were fixed - the worst being that `.doc-table`'s scroll container silently clipped everything
past page one. **The trend graph** (§39): checked and already data-driven (an inline SVG of the table's
own row, not an image), with two real defects fixed - a year picker that offered a year the report drops,
and an empty chart drawn for a year with no row.

New suite `tests/e2e_departments.py` covers all three — 38 checks, using two fixed accounts (one left
unassigned, so it covers every department, and one assigned to Quality Control at signup).

`npm run typecheck` clean and `npm run test:e2e` green end to end — **541 checks across fourteen
suites**, no JavaScript errors. The live Groq suite `tests/e2e_assistant_chat.py` re-run on the same
build: **13/13**.

What the work turned up, beyond the three requests themselves:

- **A printed register was being silently truncated at the first page boundary**, on every screen with a
  long table. `.doc-table` is a horizontal scroll container on screen, and a scroll container cannot
  paginate — so "the whole document should print" turned out to be a literal defect, not a preference.
  Found by reading the print CSS against the complaint rather than by a failing test, because no test
  looked past page one; the new suite now asserts that no printed table is left as a scroll container.
- **The trend graph was already right.** The request asked us to check whether it was a static image;
  it is an inline SVG built from the same rows as the table, and the screenshot the department sent is
  the app's own screen (its tinted December-2025 cell is a figure the system added up from the
  register). Two genuine defects came out of checking: a year picker that offered a year the report
  itself drops, and an empty chart drawn for a year with no row.
- **A repository-level filter is the only way to scope this app honestly.** Fourteen screens and the
  assistant enumerate documents or records; filtering at each call site would have leaked at the first
  one anybody forgot. Putting it in `documentRepository` and `recordRepository` and then adding
  `*Unscoped` variants for the four generators is what keeps the plant's registers complete while
  still showing each person only their own — and made the page guards the only remaining work.
- **Scoping `getById` breaks non-null assertions.** Nine pages did `documentRepository.getById(X)!`, so
  the first version of the filter turned another department's page into the error boundary. Every one
  now renders a refusal that names the owning department; a record reached by its own address is found
  (its lookup stays unscoped) and then refused, so it can say "belongs to Human Resources" instead of
  "document definition missing".
- The signup cap went from 10 to 20 accounts per network per ten minutes: fourteen suites against one
  server process, nine of which create a fresh account, left no room for the two fixed accounts of the
  new suite on a first run.

## Results (13-Sep-2026, the one-at-a-time External CAPA batch)

### External CAPA answered one activity at a time (13-Sep-2026, last)

*"Make some questions mandatory … in external CAPA section wise make one by one mandatory … if any
question is incompleted then he will not able to answer to other questions without completing that."*
The checklist now waits on exactly one activity — the first blank one, A1 → E32 — and every activity
after it is locked until that one is answered: on the form the later rows are dimmed with their tick,
date and comment disabled, each later section says which section to finish first, and the row to answer
is highlighted. An answered activity stays open so a mistake can be corrected, and clearing an answer
closes what followed it again. "Not required" became answerable on the form too (a screen-only **N/R**
button) — otherwise the rule would have trapped an activity that genuinely does not apply. The
assistant is held to the same order, in its walk-through and in every change it proposes
(`engine/recordPatch.ts` puts back anything that leapfrogs and says so). One rule, one definition
(`engine/guidedChecklist.ts`), so the form, the chat and the submit check cannot disagree.

`npm run typecheck` clean and `npm run test:e2e` green end to end — **503 checks across thirteen
suites**, no JavaScript errors: `e2e_capa_formats.py` gained 21 checks (the form, and the assistant's
reply stubbed with a whole-sections change so both the applied in-order change and the refused leapfrog
are checked with no network call) and `e2e_smoke.py` two (an approved checklist is read-only, and not
merely "locked"). The live Groq suite `e2e_assistant_chat.py` gained a check — a real model call cannot
answer a later activity while an earlier one is blank — and passed 13/13.

What the runs caught:

- **The assistant had no working way to answer a checklist activity at all** — found by writing the
  test for the new rule rather than by the rule itself. The model is told to "return the COMPLETE
  sections array when changing any item", but `applyAssistantPatch` matched list objects by their `id`,
  and neither a section nor an activity has one; every section was therefore rebuilt from a blank
  template, dropping the values echoed back unchanged and rejecting the printed text it repeated. An
  id-less list is now matched by **position**, which also repairs the same latent fault for a service
  report's area lines, the fly catcher's units and the emergency contacts. Until the whole-document fill
  of §36 there had been no way to ask the assistant to fill a checklist — the walk-through writes the
  data directly — which is why it had gone unnoticed.
- **A verified checklist would have become writable again.** The first version of the rule kept an
  answered activity open so a mistake could be corrected, without also asking whether the record was
  still a draft. Caught in review before the run, and now checked in `e2e_smoke.py`.
- Two faults were in the new checks, not the app: they typed into the chat while the auto-started
  walk-through was still asking its header questions (so the message became the customer's name), and
  clicked "New Complaint" with the assistant panel open over it.

## Results (13-Sep-2026, the whole-document fill batch)

The run below is the production shape end to end: `frontend/scripts/build.ts` builds the bundle,
`backend/index.ts` (run directly by Node 23.6, no compile step) serves it plus the API, and every
suite runs against that. `npm run typecheck` is clean for the frontend and for the backend/scripts
(`tsconfig.node.json`).

### The assistant fills a whole document — question by question, or with sample data (13-Sep-2026)

*"If user tell to perform any action like fill xyz document then bot will open that document and ask
questions like what to fill where … or fill fake data and generate external CAPA for me … data which he
fills should seem to be real … applicable to each and every document."* Two new paths, on every document
that holds records: **"I want to fill the external CAPA" / "ask me question by question"** opens the
document (starting one if needed) and asks what to put where, one thing at a time, with the likely
answers as buttons, each answer checked like a typed value and saved with an assistant history line
(`engine/guidedRecord.ts` — the complaint checklist keeps its own A → E walk-through); **"fill it with
sample data" / "generate an external CAPA for me"** fills the whole form with realistic, made-up values —
the plant's own people, areas, customers and codes — and says plainly that it is sample data to be
checked (`engine/sampleFill.ts`). Both work from the record, from the library and from the full-page
Assistant, the request carrying over to the record once it opens (`engine/assistantHandoff.ts`). The
model's prompt gained the matching rule: invent values only when sample data is asked for, and say so.

`npm run typecheck` clean and `npm run test:e2e` green end to end — **482 checks across thirteen
suites, no JavaScript errors** (the twelve earlier suites unchanged in outcome, plus the two new ones:
`e2e_print_all_documents.py`, every document printing as the document alone, and
`e2e_assistant_fill.py`, **51/51**). The fill suite carries the strongest check of the sample data:
every one of the twenty documents, started from the library, filled with sample data and
**submitted**, so the sample values satisfy every submit rule on every format. The live Groq suite
(`e2e_assistant_chat.py`, real model calls) re-run on the new build: **12/12** — navigation, a
conversational reply, the out-of-scope refusal, a plain-words fill and the full-page answer from the
live-facts digest, with the key answering in about a second.

What the runs caught:

- **The library's New button returned an existing same-day record even for an as-required document.**
  `createRecordForDocument` looked for any record with the same due date before creating one — right
  for a scheduled register (one sheet per day), wrong for a complaint or an inspection report, where
  the afternoon's complaint would have been filed under the morning's. Only the CAPA page's own New
  button, which does not go through it, escaped this. Now only scheduled documents keep to one sheet per
  period (`engine/recordCrud.ts`).
- **The inspection findings report never handed submit, verify, print or delete to the assistant.**
  Its page registered only the fill / correct half of the assistant target, so "submit this record" on
  an internal CAPA answered "can't be submitted from here". It now registers the same full set as every
  other record page, its Submit / Verify return their outcome, Cancel edit is on its action bar, and
  its Delete leaves the same deletion trail as the rest (`pages/GapPage.tsx`).
- Two first-run failures were the harness's: the answer heuristic clicked the widget's own quick buttons
  ("Stop the questions") as if they were answers to the question, and in the every-document pass the
  open chat panel covered the library's New button. The training steps of the suite also collided with
  each other (a yearly document has one sheet per day, so the second New reopened the first, already
  submitted, record) — the question-by-question step now dates its record earlier in the month.
- `e2e_print_all_documents.py` navigated to `#/compliance`, a route the app does not have (the
  Statements of Compliance live at `#/soc`); corrected.

### External CAPA mandatory section by section, and review before submit (12-Sep-2026, last)

*"In CAPA for specially external CAPA make section mandatory each after each question … tell user to
review each and every time before user submit and if ai has done any mistake so user can do edit it
also."* Every activity of every section now has to be answered before the next section starts — the
walk-through offers no Skip on an activity or a section, loops back to anything left behind, and Submit
is refused while anything is blank, naming the section and the activities (from the form and from the
chat alike). The assistant ends every change by asking for it to be checked, and asking it to submit
produces a review step first, with "I've checked it — submit" the only way through.

`npm run typecheck` clean and `npm run test:e2e` green end to end — 364 checks across eleven suites,
no JavaScript errors.

What the runs caught:

- **A typed instruction was being swallowed by the walk-through.** Mid-questions, "submit this record"
  was treated as the answer to the activity on screen. It is obeyed now — but only when the message
  *begins* with the instruction, because an answer can easily contain one of those words ("Gujarat
  Printpack" must not read as "print").
- A Python escape in a patch script wrote a **backspace character into a regex** (the word-boundary
  escape became 0x08), which would have made that guard match nothing. Caught by inspecting the written
  line; repaired, and the file checked for stray control characters.
- The CRUD suite's submit check failed on the new review step — updated to go through it, which is the
  behaviour that was asked for.

### CRUD on every document, and the assistant able to do all of it (12-Sep-2026, earlier)

*"Make all documents this CRUD operation ... whatever user can do manually that can do with ai
assistant also ... even he can speak and work will be done."* **Create** is now on every document that
holds records — a **New** button in the Document Library and "create a new fly catcher record" in the
chat — building a record with the same starting data the schedule would have given it, and returning
the existing one rather than putting two sheets on one day. **Delete** works at any status: it always
asks first, a submitted or verified record takes a reason, and every deletion is recorded and listed in
**Document Library → Records deleted**, so removing a signed-off record leaves an explained hole rather
than a silent one. The **assistant now has the whole surface** — create, submit, verify, print, cancel
an edit and delete, on top of filling in and correcting — each parsed locally
(`engine/assistantCommands.ts`) and each confirmed before anything is signed off or destroyed; speech
needed no extra work, because voice input takes the same path as typing.

Also in this run: the Pest Control Training Record's heading is now the provider's letterhead and
nothing else — the title and the Format No. / Rev No. / Date row came off it, as asked — and the two
checks that asserted the old heading were flipped to assert the new one.

`npm run typecheck` clean and `npm run test:e2e` green end to end — smoke 145/145, backlog 8/8, voice
13/13, realism 22/22, editing 20/20, files 17/17, translate 18/18, print and forms 35/35, CAPA formats
18/18, agreement and Cancel edit 37/37 and the new `e2e_crud.py` 22/22 (355 checks, no JavaScript
errors). One first-run failure was the check's fault, not the app's: it expected exactly one new record
after pressing New, but opening a page also generates that day's scheduled shells — it now asserts the
thing that matters, that the register still holds only one sheet for the day.

### The training record on the provider's letterhead (12-Sep-2026, earlier)

*"I want to make both document of training record to change heading of document to same as I provided
letter head."* The Pest Control Training Record now carries Gurudev Pest Control's printed letterhead
("Letter head.pdf") where the plant's company name used to be — the GPC mark, both mobile numbers, the
name, the address, the email and the website — with the form's own title and Format No. / Rev No. /
Date row beneath it. Both records on file changed together (they share one page), and the letterhead
prints as part of the document. It is the same component the service agreement uses, so the provider's
details are transcribed once. Checked by six new checks in `e2e_agreement_and_cancel.py` (both records,
the heading, what is no longer there, the format row, and the printout) — the full run stayed green at
333 checks. One fault was in the check, not the app: it looked for "Format No." as typed, but the
meta labels render uppercased.

### The two-yearly service provider agreement, and Cancel edit (12-Sep-2026, later)

Two requests from the department. The **Service Provider page now asks for the service agreement**:
there is none on file (nothing was seeded — inventing a signed agreement is exactly what this system
must not do), so the pop-up asks straight away, offering to draft it on Gurudev Pest Control's own
letterhead ("Letter head.pdf") for the next two years, or to take the signed copy as a scan,
photographs or a PDF. What it drafts is filled in from what the system already holds — the parties,
the SOP's services and frequencies, the insecticide licence number, the obligations both parties
signed in the Responsibilities document — and everything else is left TO BE CONFIRMED. The agreement
is then a record like any other. **Cancel edit** is now on every document in every module: pressing
Edit and finding nothing to put right sends the record straight back to the status it came from,
asking first (and restoring what it said) if something was changed, with the cancellation in its
history.

`npm run typecheck` clean and `npm run test:e2e` green end to end — smoke 145/145, backlog 8/8, voice
13/13, realism 22/22, editing 20/20, files 17/17, translate 18/18, print and forms 35/35, CAPA formats
18/18 and the new `e2e_agreement_and_cancel.py` 37/37 (333 checks, no JavaScript errors). The smoke
suite's Document Library count moved from 24 to 25 with the new document.

What the runs caught:

- **A new suite tipped the run past the app's own signup throttle.** Every suite signs up a fresh
  account, and the server allows ten new accounts per network in ten minutes
  (`MAX_SIGNUPS_PER_IP`) — a deliberate control, so free signups can't multiply the assistant's
  per-account cap. Nine suites plus a few manual re-runs of the new one reached it, and the tenth
  suite sat on the login screen with every check failing for a reason that had nothing to do with
  what it was testing. Fixed in the harness, not the product: the new suite signs **in** to a fixed
  account (creating it only the first time) and clears its own browser storage.
- Two first-run failures were faults in the new checks rather than the app: they read the document's
  text for values that live in form fields (an input's value is not page text), and looked for
  `input[type='text']` on a page whose inputs carry no explicit type attribute.
- The pop-up and the card below it each rendered their own hidden file input, so there were two of
  them on the page at once; the component now renders one and both buttons open it.

### CAPA code formats, CAPA summaries, and one language control (12-Sep-2026, later)

The department's rule for the codes on CAPA paperwork now lives in one place
(`engine/documentFormats.ts`) and everything reads it from there: a new complaint is numbered
`26-27/001` by the app (the year part turning over on 1 January), a Job Code / FG code reads like
`FGSL3877` and a PO No. is eight digits. The field tidies what was typed when you leave it, says what
the format is while it doesn't fit, Submit is refused until it does, and the assistant is held to the
same formats both ways it can write one — a plain-words edit and the guided complaint walk-through.
Asking the assistant for a CAPA summary answers for both sides from the records themselves, with no
internet. The Dashboard's own language buttons are gone; the top bar's box is the one control, with a
word beside it when the built-in Gujarati is showing.

Checked with a full run, not a quick pass: `npm run typecheck` clean and `npm run test:e2e` green end
to end — smoke 145/145, backlog 8/8, voice 13/13, realism 22/22, editing 20/20, files 17/17, translate
18/18, print and forms 35/35, and the new `e2e_capa_formats.py` 18/18 (296 checks, no JavaScript
errors).

What the run caught, and what it cost:

- **The walk-through stopped starting itself.** A new complaint was no longer "fresh" once the app put
  a number on it, so the assistant never opened with "Which customer raised this complaint?". Freshness
  now means *nothing has been recorded* — a number nobody typed doesn't count (`pages/CapaPage.tsx`).
  The smoke suite caught this, and its complaint walk-through was rewritten around the new behaviour:
  the number is already on the sheet, so it goes customer → job name → job code → PO no. → date, and
  the job code is now typed as `fgsl 3877` to prove the assistant tidies it.
- **The guided walk-through wasn't checking the codes at all** — it stored what it was told verbatim.
  It now uses the same rules, so "ABC12" as a job code is refused with the format and asked again
  (`engine/guidedChecklist.ts`); its questions carry the format as an example.
- **Nothing said the built-in Gujarati was showing** once the Dashboard's buttons went: that note had
  lived under them, and the top bar's box only had it as a tooltip. `e2e_translate.py` caught it. The
  compact control now shows a short note beside the box ("Built-in Gujarati"), keeping the full
  sentence as its tooltip, and the unreachable pills variant of `LanguageSwitcher` was removed rather
  than left as dead code.
- Two first-run failures were faults in the new check, not the app: it clicked a "Close assistant"
  button on a page where the panel wasn't open, and it counted "Which customer" messages across the
  whole chat, which keeps earlier walk-throughs' questions.

### Responsibilities of Pest Control, and the assistant on every document (12-Sep-2026)

The three-page agreement ("responsibilities of pest control report .pdf") is now a record kind of its
own, seeded as the copy both parties signed on 01-Jan-2025, and the assistant has a field guide for
every document it can reach: the two new records, and the reference documents — the SOP, the Chemical
Master chart and the Statements of Compliance register themselves as "reference" targets, so a
correction can be dictated as well as typed. Only the service provider's licence stays untouchable, on
the owner's instruction. Checked quickly, as asked: `npm run typecheck` clean and a 15-check browser
pass — the document opens from Pest Control > Training & Reference in its letterhead layout with the
paper's 14 / 4 / 7 / 5 lines and both signatories; a signed copy is locked and offers Edit; any line
edits and saves itself; a point can be added and removed; "training note is …" typed to the assistant
changes it, is listed back and is marked as the assistant's change; Print gives the three pages alone
as text (`32_print_responsibilities.png`); the SOP, the Chemical Master and a Statement of Compliance
each offer the assistant their document; the Document Library lists 24 documents (the smoke suite's
count moved from 23 to 24); no JavaScript errors. The first run of that pass stopped on a fault in the
check itself, not the app — it read the assistant's placeholder without opening the panel.

### CAPA Internal: Complaint Acknowledgement Report, QA-CAF-00 (11-Sep-2026, later)

The new document ("Foram P. - FGSL3877.pdf" as the format reference) was checked quickly, as asked:
`npm run typecheck` clean, and a 13-check browser pass — Internal CAPA lists the reports with a New
button; a new report opens in the two-page QA-CAF-00 layout (title, subject, the six-column complaint
table, the acknowledgement, the footer on both pages); two photos upload and one is removed, the other
stored as a scaled-down JPEG; every field saves itself; it submits and verifies; a verified report reads
as the paper form and offers Edit, which reopens it with the change in its history; Print gives the two
pages alone, as text (`30_print_complaint_ack.png`, compared with the PDF page for page); the list shows
its customer and FG code; the Document Library lists 23 documents (the smoke suite's count moved from
22 to 23); no JavaScript errors.

### Edit on every document; the Chemical Master suggestion removed (11-Sep-2026, later)

On the department's instruction ("give edit option … applicable to each and every document … so even
AI do any mistake or user enter wrong anything, user can edit everywhere"): a record already signed off
shows **Edit** (was "Correct this record"; a rejected record's "Resume Editing" too), with "The assistant
filled it in wrong" as the first reason offered; the SOP, the Chemical Master and each Statement of
Compliance are editable in place (`data/repositories/referenceRepository.ts`,
`components/documents/ReferenceEditBar.tsx`); the Training list reads "Open / Edit"; and the service
report's Chemical Master suggestion box is gone. Checked quickly, as asked, instead of re-running every
suite: `npm run typecheck` clean; a 13-check browser pass over just these screens (no suggestion box; a
signed-off Training record → Edit → reason → every field editable and saved; the SOP edited, kept after
a reload and restored; a Statement of Compliance and the Chemical Master edited and kept), no JavaScript
errors; and `e2e_editing.py` 20/20 for the reopen-and-edit flow itself.

### Print only the document; fixed service material, method and quantity; F/HR/18 by Month & Year (11-Sep-2026)

Three requests from the department, each built and then checked in the browser:

- **"When user take print then it will only print document, not whole page."** `utils/print.ts`
  marks, for the length of a print, everything that is neither the document (`data-print-doc`), inside
  it, nor on the way down to it; the containers on the way down lose their padding, frame and grid /
  flex layout. Every Print button calls it, and a `beforeprint` listener gives the browser's own Print
  / Ctrl+P the same printout. Documents marked: every record form, the F/HR/17 and F/HR/18 registers,
  the catch report sheets, the open Reports tab, the licence's scans, a Statement of Compliance, the
  SOP and the Chemical Master (both gained a Print button) and the Document Files list. Screen-only
  hints inside forms are `no-print`, placeholders don't print, and the DEMO band prints in colour.
- **"Material name is fixed and method is also fixed, and quantity added in the first [line] will be
  same for all others."** `normalizeServiceLines` (`engine/serviceMaterials.ts`) is the one rule, used
  by the form, the assistant's change checker, the assistant's pre-fill, Demo Mode and a boot-time
  pass over drafts (`engine/serviceReportDrafts.ts`, logged by "System"; nothing submitted or verified
  is touched). The Rat / Mice bait area (Bromadiolone Cake, in grams) keeps its own quantity, as on the
  specimen.
- **"In Fly catcher infestation keep add / edit option according to Month and Year."** The F/HR/18
  register carries Add visit / Edit register / Print register for the Month & Year chosen
  (`engine/flyRegister.ts`, `components/records/FlyCatcherRegisterSheet.tsx`), on Fly Catcher
  Infestation and on the Fly Control service page.

How it was checked: `npm run typecheck` clean; `npm run test:e2e` — smoke 144/144, backlog 8/8, voice
13/13, realism 22/22, editing 20/20, files 17/17, translate 18/18 and the new `e2e_print_and_forms.py`
35/35 (table below), no JavaScript errors; the print-media screenshots `28_print_service_report.png`
and `29_print_fhr18_register.png` show the form and the register alone. What the first run caught:
the record page's own Print button had been left calling the browser directly (fixed), and the new
suite's first probe read an element's computed `display`, which stays "block" under a hidden parent —
it now asks whether the element has any box in the print layout. The screenshot then showed an empty
field printing its on-screen hint ("Customer representative name (required…"); placeholders no longer
print. After that, against the rebuilt app: `e2e_print_and_forms.py` 35/35 again and `visual_qa.py`
20/20, no JavaScript errors — its `05_servicereport.png` shows the form with material and method as
text and a quantity box only on the first Glue Board line (noted "Same on all 15 Glue Board lines")
and on the bait line, and `16_pest_fly_catcher_infestation.png` the register's "Month & Year:
SEPTEMBER-26" toolbar with Add visit / Edit register / Print register.

### Whole-project bug-fix pass (11-Sep-2026)

The whole codebase was reviewed read-only in four slices — backend + tooling, engine, data / store,
pages + components — and every finding was re-checked against the code before anything changed.
One was a false positive and was left alone: the correction banner's split marker looks like `""` in
an editor but is the invisible U+0001, so the sentence splits correctly. Everything else was fixed,
one commit per group:

- **Dev server file leak (security).** `frontend/scripts/dev-server.ts` joined the raw URL onto
  `public/`, so `/../../backend/.env` — or `backend/data/jwt-secret.txt`, enough to forge any session
  — was readable by anyone on the LAN. Checked live: `/../../backend/.env`, `..%2f` and `..%5c`
  all answer 404, public files still 200.
- **Server.** The reminder digest claims the day before sending (two browsers no longer both send),
  isn't used up by a browser with no recipient emails, is given back if every send fails, and only
  goes to single well-formed addresses, at most 50 (a comma list could relay mail from the company
  mailbox). The login throttle no longer stores made-up emails, and all three throttles sweep expired
  entries. Two racing first signups can't both become admin. Malformed JSON is 400 and an oversized
  body 413, not 500. `.env` values may be quoted or carry a trailing `# comment`.
- **Tooling.** `npm run test:e2e` refuses to start if something already answers on :8842 (it would
  have tested the old build); `npm run dev` reports a crashed child as a failure; the dev server
  survives a failed read or proxy request.
- **Storage full.** A failed save was logged and kept only in memory — shown as saved, lost on the
  next reload. The cache now follows what is stored and a banner says the change wasn't kept.
  Measured in Chromium: a fresh Live account 244,660 characters (5% of the ~5M quota); after Demo
  Mode fills the year, 4,208,499 (80%) — see DEPLOYMENT.md → Capacity.
- **Two tabs.** A save in one tab was overwritten by the other tab's stale copy; the storage event
  now drops it and redraws. Clean-ups that remove nothing no longer rewrite the records array.
- **Demo Mode.** Shells made for days still ahead stayed blank and overdue forever, and a month
  generated before it ended never got its CAPA record; both are filled on the next run. Demo
  sign-off times were stored as UTC (18:45 showed as 00:15 the next day in India).
- **Assistant and engine.** "check point 2 is ok" recorded a gap (OK always meant Yes — it now
  follows each point's finding polarity); new rows listed before existing ones were lost; "25
  December to 5 January" listed 5 Jan – 25 Dec of one year; 31/02 was accepted by the complaint
  walk-through and read as 3 March by the calendar questions; "Skip this section" went into the
  section; the viscosity note said "all within 20.0 ± 1.0" beside out-of-band readings.
- **Screens.** `#/day/abc` blanked the whole app, and any render error did the same — now a
  screen-level error boundary, real dates only, and a non-numeric year / month falls back instead of
  showing NaN. Gap and Training record pages kept the previous record when the address changed and
  saved the next edit into the new one. The log-sheet view called a hook after an early return.
- **CSV exports** carry a UTF-8 byte-order mark (Excel showed "Lamination â€” Quality Control") and
  neutralise cells that would run as formulas.
- **Keyboard.** Master Data / Reports / Pest Control tabs, Live / Demo, the language pills, calendar
  days and reminders were mouse-only; they now take focus, answer Enter / Space and show a focus ring.
- **Stale test.** `e2e_assistant_chat.py` looked for the model's "I've filled in"; a plain edit has
  been confirmed locally as "Done — saved. I changed: …" since the record-correction batch.

How it was checked: `npm run typecheck` clean; 25 unit checks of the engine fixes from a scratch
harness (check-point polarity, row order, impossible dates, section skip, the New-Year span, the CSV
guard); every suite re-run against the rebuilt app — `e2e_smoke.py` 144/144, backlog 8/8, voice
13/13, realism 22/22 (2,686 demo records), editing 20/20, files 17/17, translate 18/18,
`visual_qa.py` 20/20 and `e2e_assistant_chat.py` 12/12 against live Groq, the last two with no
JavaScript errors; `npm audit` reports 0 vulnerabilities.

Known limit, not changed here: operational data still lives in `localStorage`, so the capacity
figures above stand until the storage migration in DEPLOYMENT.md is done.

### What this batch changed, and how it was checked

- **Briefing / bell speed.** Both used to render every pending record as a row — with a large backlog
  that meant thousands of DOM nodes, seconds to paint, and a top-bar button that looked dead. The
  briefing now lists at most 12 rows per section ("…and N more"; "Submit all" still covers every
  prepared record) and the bell dropdown at most 20 ("…and N more — open today's briefing"). Records
  dated before the browser's launch date are excluded from both and from reminders entirely — they're
  counted once as "leftover records from before this system went live" with a one-click clean-up in
  the briefing (same purge as the Dashboard banner). The clean-up now also catches leftovers an
  older build had already auto-prepared: "In Progress" with a `prepared` stamp and no human save
  since (updatedAt within two minutes of prepared.at), never anything Submitted/Verified/Rejected.
- **Briefing schedule** (`engine/briefingSchedule.ts`): first-ever open → morning slot (first hour of
  the working day) → evening slot (last hour, only if something is still unsubmitted), each at most
  once per day per browser, re-checked every minute so an app left open gets the end-of-day nudge.
  The smoke suite's "briefing on login" checks exercise the first-ever-open path (fresh browser).
- **Sidebar theme**: light panel with a teal brand band and an accent rail on the active item —
  `tests/shots/01_dashboard.png`.
- **TypeScript-only**: `backend/*.mjs` → `*.ts` (typed Express handlers, typed SQLite rows, typed
  throttles), `scripts/*.mjs` and `frontend/scripts/*.mjs` → `*.ts`; `package.json` scripts run them
  with `node --no-warnings=ExperimentalWarning`. No `.mjs` remains.
- **Rodent catch pattern**: the Daily Pest Control Monitoring Record no longer answers checkpoint 7
  ("Any pest trapped in rodent trap box") the same way every day. `tools/pest_pattern.py`
  (Python + numpy) generates a seasonal catch pattern — monsoon-leaning daily probability, weighted
  Rodent Control Service locations, a per-catch count distribution — calibrated against the
  company's own reported history (0 rodents in 2024, 2 in 2025, 0 through Jun-2026, from "Kapila
  mam department reports .pdf"), written to `src/data/seed/pestPattern.ts`.
  `src/engine/rodentPattern.ts` applies it deterministically per calendar date so the assistant's
  pre-fill, Demo Mode, and a manual "Yes" on checkpoint 7 all agree on the same day's story
  (trap box, location, number of rodents — a new `rodentCatches` table on the record, required
  once checkpoint 7 is Yes). Reports > Rodent Trend was rebuilt as **Rodent Catch Report and Trend
  Analysis**, reproducing the company's Source / Unit / Target Pest / Year / Jan–Dec / Total table
  with the reported history alongside the digital total, plus where-found and which-box
  breakdowns; the Daily Monitoring Summary report gained a Rodents column; the Dashboard gained a
  "Rodents Trapped This Month" tile. Checked with four new smoke-suite assertions (#28–31 below)
  against a full demo year, and by dumping the deterministic pattern for 2025–2027 in a scratch
  script to confirm every year lands a handful of catches, none implausibly large, correctly
  seasonal (near-zero Jan–Apr, heaviest Jun–Oct).
- **Pest Control module restructure.** The module is now organised the way the department reads
  its paperwork — Daily Report / Service Reports (Rat / Mice, Ants & Cockroaches, Fly) / Trend
  Analysis (Rodent Catch, Fly Catcher Infestation) / Training & Reference — with an overview
  (`/pest-control`) and one page per group (`src/pages/PestControlPages.tsx`), sidebar sub-headings,
  and the assistant's route guide extended so "show me the rat reports" lands on the right page.
  The Lizard service-report variant (no specimen in the zip) was retired, with boot-time cleanup of
  its definition, reminder role and any stored records — the Document Library count check moved
  from 22 to 21. The Fly Catcher record's counts now follow a seasonal per-unit pattern
  (`tools/pest_pattern.py`, the same tool as the rodent pattern, calibrated to the August-26
  specimen), and Reports > Fly Catcher Infestation was rebuilt in the company's year layout, overall
  and per unit. Checked by eight new smoke assertions (sidebar groups, each new page, the Live
  per-unit register, the Demo-year fly total) and one new visual-QA check with two new screenshots.
  Two test selectors changed from `text=Reports` to `a[href='#/reports']` because the new
  "Service Reports" sub-heading also contains the word — a text selector now matches it first.
- **Working calendar (Thursday weekly off + leave calendar + adjustment days).** `engine/holidays.ts`
  is now the one rule for "is the plant open today?": the Thursday weekly off, the 13 festival
  holidays and the five adjustment (working) Thursdays transcribed from the Gujarat Print Pack Leave
  Calendar 2026 (REQUIREMENTS §16; the 20-11-2026 entry is printed as a Thursday but is a Friday —
  flagged TO BE CONFIRMED). The record generator and Demo Mode build records from
  `effectiveDueDatesInMonth`: Daily Monitoring is pre-marked on closed days, other daily registers
  are skipped, and fortnightly/monthly/… obligations move to the next working day instead of
  vanishing (June 2026's 4th and 18th are Thursdays — the demo Rat / Mice visits now fall on the 5th
  and 19th). The Calendar shows Weekly off / holiday / Working day chips, the Day View a banner, the
  Dashboard the day kind and the next entries on the calendar, and Master Data → Holidays gained the
  weekly-off selector and an Adjustment Days table. Checked by seven new smoke assertions (calendar
  chips for September and October 2026, the Day View banner, the pre-marked HOLIDAY row on the daily
  register, the Master Data editor, the shifted demo visits).
- **The Assistant page** (`/assistant`, ChatGPT-style, text only — no voice control) with
  conversations persisted in the browser, plus a client-side answer layer
  (`engine/assistantLocal.ts`) for calendar / workload / briefing / help questions and a live-facts
  `context` digest sent to Groq with every chat. Checked by six new smoke assertions (page opens from
  the sidebar with suggestions and a composer; no microphone control; "is 2026-09-10 a holiday?" →
  weekly off, "is 2026-10-22 a holiday?" → adjustment (working) day and "when is the next company
  holiday?" answered from the calendar without the network; the conversation survives a reload), one
  new visual-QA check with two screenshots, and one new live-Groq check in `e2e_assistant_chat.py`
  (a weekly-off question with no date reference is left to the model, which answers "Thursday" from
  the attached context; that suite's "plain reply" section now sends "hi there, how is your day
  going?" because "what can you do" is answered locally).
- **Adversarial review of this batch** (three review lenses, each finding re-checked by two
  skeptics; run as a workflow while the suites ran). Everything confirmed was fixed before the final
  run: bare "closed" / "adjustment" in the calendar regex hijacked complaint questions; "what's due
  tomorrow / this week" was answered with today's numbers; the widget answered "mark today as
  holiday" locally instead of filling the open record; "last Thursday" resolved forward; message
  timestamps mixed the UTC date with local hours; the typing bubble wasn't tied to its conversation;
  locally answered messages weren't length-capped; records an *earlier* build had created on a
  Thursday stayed stranded on a closed day (now `engine/calendarMigration.ts`, which also leaves a
  person's own draft alone); the launch-date floor compared the scheduled rather than the due date;
  a deleted seeded adjustment day came back at the next boot (`removedSeedIds`); two texts
  hard-coded "Thursday"; the holiday hint under the Daily Monitoring checkbox had its condition
  inverted; and several new checks were pinned to dates that would expire within days (now derived
  from the calendar at run time, so the suite also passes on a Thursday).
- **Groq rate limit.** The live chat suite's last check failed once with a 429 from Groq (this
  account's tokens-per-minute allowance, five calls in ~20 s each carrying the route guide + context).
  `backend/groq.ts` now retries a 429 once after the delay Groq asks for (bounded), and the suite
  pauses before its final model call.
- **Date-range document listing** (09-Sep-2026): "I want documents of daily pest control monitoring
  record from 1 to 19 January", "pest control records for this week", "fly catcher documents for
  September" are now answered locally (`engine/assistantLocal.ts`, `listDocumentsAnswer` +
  `parseDateRange` + `matchDocuments`) — enumerating exactly the records due in the span named (a
  bare month or "this/last/next month" lists the whole month; an explicit day-to-day span, including
  the shorthand "1 to 19 January" with the month stated once, lists only those days), scoped to the
  document(s) or module named (a 30+ alias table over every recordable document, falling back to the
  module when no single document is named — "pest", "lamination"). Generates records for just the
  touched months/documents on demand (`ensureRecordsGeneratedForMonth`/`ensureDemoRecordsGeneratedForYear`)
  so a query about a month nobody has browsed to yet still resolves correctly, while the launch-date
  floor still applies in Live mode. Deliberately requires BOTH a recognisable document/module AND a
  date reference before firing, so it never intercepts a plain navigation request — "show me all
  reports of august" and "open the rat and mice service reports" (no date) still reach the model and
  navigate exactly as before (`e2e_assistant_chat.py`'s existing "Navigated to Reports for August"
  check, unchanged, still passing, is the regression guard — it needs a real Groq round trip, which
  the network-independent smoke suite deliberately never makes). Checked with 2 new smoke assertions
  (a single-day range on a real record, a 7-day span scoped exactly to those 7 days) and a throwaway
  Playwright sanity pass over 13 phrasings (7 that must trigger the listing, 6 that must not) before
  committing to the smoke suite's two.
- **The Daily Pest Control Monitoring Record in its own F/HR/17 layout** (09-Sep-2026). The company
  supplied the blank format as a clean 3-page PDF; `components/records/DailyRegisterSheet.tsx` now
  reproduces it as printed — page 1 header + the two instruction lines (the second reads "Please
  mention the status as Yes / No against each check point except point no. 7", verbatim) + the ten
  check points; page 2 dates 1–19; page 3 dates 20–31 + SUMMARY OF ACTIONS TAKEN IF PEST OBSERVED —
  over the month's per-day records (Yes/No per check point, trap count in column 4, pests trapped in
  column 7, HOLIDAY across a closed day, time, checker; rows click through to the day). It is the
  default view of Pest Control > Daily Report (a "Status list" pill keeps the app-side table; "Show
  the original blank format" puts the three scanned pages next to it) and of Reports > Daily
  Monitoring Summary, and prints as three pages. Checked by four new smoke assertions (3 register
  pages / 10 check points / 31 date rows; the format's instruction wording; the summary table; the
  Reports tab) and a re-targeted one (the pre-marked HOLIDAY row is now found by `tr[data-day]`).
- **Two languages, English and ગુજરાતી** (09-Sep-2026). `src/i18n` holds one string table per
  language — `en` is `as const` and defines the key set, `gu` is typed against it, so a missing
  Gujarati string is a compile error, never a silent English fallback. The choice sits on the
  Dashboard (and in the top bar) in `AppSettings.language`, held in `AppStore` so setting it
  re-renders every screen at once: navigation, page titles, buttons, statuses, frequencies, module
  names, report tabs, the calendar / Day View, the Pest Control pages, and the assistant's chrome,
  briefing and canned replies. The backend is told the language too, so a Gujarati question gets a
  Gujarati answer. **Controlled document text is deliberately excluded** — format numbers, the
  verbatim check points, the licence, the SOCs — because translating a controlled record's wording
  would break source-to-digital traceability (REQUIREMENTS §24). Checked by eight new smoke
  assertions: both languages offered in the top bar (on the Dashboard until 12-Sep-2026, when the
  department asked for that copy of the buttons to go); Gujarati translates the Dashboard, the
  sidebar's module names and the mode banner; another page follows without a reload; **F/HR/17 and
  "Total number of rodent traps provided" are still on screen in Gujarati** (the traceability
  guard); the Calendar is translated; switching back restores English. Plus two visual-QA
  screenshots (`21_dashboard_gujarati.png`, `22_pest_control_gujarati.png`), reviewed on screen —
  the whole Dashboard reads correctly in Gujarati while the document titles stay as issued.
  **Since 11-Sep-2026 Gujarati is Google Translate** (below); these smoke / visual-QA checks now
  cover its offline fallback — both suites block `**/translate_a/**`, so the built-in tables show.
- **Gujarati through Google Translate** (11-Sep-2026). `tests/e2e_translate.py` (18 checks then,
  23 after §58 below,
  network-independent) serves a stand-in for Google's widget at the same address that behaves like
  it — hidden language box, toolbar pushed in, every English text node swapped for a `<font>` (both
  swap styles Google uses), text it has already handled never re-translated — and proves: English
  never loads Google; ગુજરાતી loads it and the whole page is translated from the English screens;
  Google's toolbar is hidden and the page not pushed down; the language names, the F/HR/17 register
  and an open record's form are left as issued; typing still saves; changed text ("All changes
  saved", a file count) shows its new value translated; seven pages open with no crash; a reload stays
  Gujarati; English reloads back to the original on the same screen, clears the cookie and doesn't
  load Google; offline, the built-in Gujarati shows with a note and English returns without a reload.
  Also checked by hand against the **real** Google Translate (network): the whole Dashboard and
  sidebar in Gujarati, the F/HR/17 register and record form untouched, no console errors across
  seven pages, the files count re-translated after it changed, "All changes saved" re-translated
  once scrolled into view (Google translates lazily), English restored by reload with the cookie
  gone. The only Gujarati left after switching back is the ગુજરાતી button and the F/QC/13 title,
  which is issued in Gujarati. That run also caught Google translating a person's name literally —
  names are now `translate="no"`.
  **Changed on 19-Sep-2026 (REQUIREMENTS §58), at the department's request:** the documents follow the
  chosen language too. The suite now proves the opposite of what it proved above for the documents —
  the F/HR/17 register and an open record's form are translated along with the page, while the marks
  that identify them (the format number, the revision, the date, the company's registered name) are
  left exactly as issued and never handed to Google. What is typed into a record is untouched either
  way, and the formats issued in Gujarati read in English while English is chosen
  (`tests/e2e_qc_formats.py`).
- **A voice assistant** (09-Sep-2026), reversing the earlier "text only, no voice" decision at the
  department's request. `src/utils/speech.ts` wraps the browser's Web Speech API: press-to-talk on
  the Assistant page and in the floating widget, one utterance per press, the transcript handed
  straight to the same `send()` a typed message uses (nothing extra leaves the browser), and the
  reply read back — always for a spoken question, and for typed ones via the speaker toggle
  (`AppSettings.speakReplies`). Both follow the chosen language (`en-IN` / `gu-IN`), and both stop
  listening/speaking when the page is left. Where a browser has no recognition (Firefox) the control
  explains itself instead of failing. Checked by two new smoke assertions (both controls present;
  pressing the microphone produces a listening/explanation state without breaking the page) and one
  visual-QA check with a screenshot; real speech can't be driven from headless Chromium, so that
  part was verified by hand.
- **The microphone now waits for the whole sentence** (09-Sep-2026, on the department's follow-up:
  *"once user start speaking then user will complete it then only it should run"*). The first cut used
  the browser default — `continuous = false`, which ends the utterance at the first pause — so thinking
  mid-sentence sent half a question. `listenOnce` was replaced by `listenForUtterance`: continuous
  recognition with interim results, the transcript rebuilt from the whole results list on every event
  and shown live in the composer, a 2.5 s silence timer re-armed on every speech event, and the message
  sent only when that timer elapses (restarting up to 3 times if Chrome ends the session with nothing
  said; `"aborted"` / `"no-speech"` ignored). Pressing the button again now reads **Done** and sends
  what was said rather than discarding it. **This one is no longer hand-verified**: `tests/e2e_voice.py`
  injects a fake `SpeechRecognition` before the app boots and drives the exact failure case — fragment,
  1.2 s pause, rest, silence — asserting nothing is sent at the pause and exactly one message carrying
  both halves is sent afterwards. It is deterministic and network-independent, so it runs in
  `npm run test:e2e` alongside the smoke and backlog suites.
- **The navigation panel can be closed, and reads better open** (09-Sep-2026). It had no way to get
  out of the way, and six modules of identical uppercase text scrolled past two screens. Now: a close
  (×) in the brand band and a button at the left of the top bar toggle the whole panel (remembered per
  browser; `store/sidebar.tsx`), each module carries its own icon so a shut panel is still scannable,
  one control collapses or expands all six, the module holding the current page stays marked with a
  dot even when shut, and below 1024 px the panel becomes an overlay drawer (backdrop, Escape, and
  picking a link all close it) instead of squeezing a record table. A closed panel is
  `visibility: hidden`, not merely zero-width, so its links leave the tab order too. Eight new smoke
  assertions (#74–81) and two new visual-QA screenshots (`24_sidebar_modules_collapsed.png`,
  `25_sidebar_closed.png`) cover it; the suites select on `data-action` hooks, since every label here
  translates.
- **The generated records now read like a real plant's** (09-Sep-2026, on the department's
  instruction that the data should look real to an auditor — *"not like every data is very good,
  only some are bad also which seem to be real if any auditor check it"*). Every record the system
  produced was perfect by construction: `readingInBand()` clamped every reading inside the printed
  band (so the Lamination QC report's out-of-band column was permanently zero), `lotStatus` was
  always "Accepted", the F/QC/13 grades were frozen at the specimen's B/A/A/–/A/B so no C or F ever
  appeared, all ten F/HR/17 check points were answered the clean way every day, every demo record
  was submitted at 10:00 and verified at 15:00 with one rejection reason in the whole system,
  training attendance was 100% every year, and a demo year contained no CAPA activity at all.
  `tools/plant_pattern.py` → `src/data/seed/plantPattern.ts` → `src/engine/plantSimulation.ts` now
  models how the plant actually behaves, calibrated against its own specimens and its Dec-2023 GAP
  report — see REQUIREMENTS §25 for the calibration of every rate. Verified by
  `tests/e2e_realism.py` (24 checks, below), by reading a generated year on screen (the August
  register's varied round times and checkers, three flagged check points with their Summary of
  Actions rows; the September Lamination QC report's per-day out-of-band column reading 0 on most
  days and 1–5 on others; the CAPA report's 20 findings, 15 closed and 5 overdue), and by dumping a
  year of the model in a scratch script before wiring it in.
- **Two bugs the model surfaced, both fixed.** (1) Jittering a *set-point* around the previous
  record's jittered value is a random walk: within weeks the adhesive/hardener/ethyl quantities had
  wandered to the band edges and 246 of 274 mixing sheets carried a spurious excursion remark. Set
  points and weighed quantities are now copied exactly, as the specimen shows them, and only
  readings with a printed nominal follow the model. (2) Demo records for *future* dates were being
  generated complete — 24 hourly readings already written down for next Tuesday — which would be a
  serious finding in a real register; a future record is now an empty shell, and a blank inspection
  form no longer arrives with its Lot Status box pre-set to "Accepted".
- **Every record can be corrected — by hand or through the assistant** (11-Sep-2026, REQUIREMENTS
  §27). A verified record could never be changed; resubmitting erased the rejection; unsaved edits were
  lost on leaving; the service report's verifier couldn't type the countersignature Verify requires;
  several fields (service material/method, four CAPA finding fields, new Master Data rows) could never
  be corrected; and the assistant merged the model's reply unchecked, with no change list and no undo.
  Now: drafts autosave; signed-off records are corrected through a reason-gated reopen and go through
  verification again; every record keeps an append-only history of each edit (before → after) and
  transition; every assistant change is checked and normalised first (`engine/recordPatch.ts`), saved,
  listed and undoable, and asks before reopening a signed-off record; common edits are parsed locally.
  Verified by 20 new browser checks (`tests/e2e_editing.py`, below), 28 unit checks of the edit
  parser/checker and 14 of the history engine run from a scratch harness, and screenshots of the
  correction banner, the history panel and the assistant's confirm-before-reopen. One defect found on
  the way: "check point 2 is maybe" fell through to the AI service instead of being refused locally —
  the local pattern now takes any answer and lets the checker refuse it, so the refusal needs no network.
- **Clean-up:** the survey for unneeded items found every tracked file, route, dependency and test in
  use. Removed: the never-called `resolveCurrentEmployee`; the Document Library's private copy of the
  Pest Control section order (it now uses `PEST_CONTROL_SECTIONS`); and eight stale sentences in the
  docs and comments (a "100% static" claim, the bundle size, a wrong tool name, the audit log listed as
  future work). About 80 translation strings that are unused are finished Gujarati translations never
  connected to their pages — left for connecting, not deleted.
- **F/HR/18 and the Rodent Catch Report, in the company's own formats** (11-Sep-2026, from "Fly
  catcher reports .pdf" and "trend analysis .pdf"). `FlyCatcherRegisterSheet.tsx` reproduces the
  two-page monthly register and `CatchTrendSheet.tsx` the trend report with its bar chart, both filled
  from the records — see REQUIREMENTS §26. Checked against the specimens on screen and in print
  emulation (PC-01 reads `3/08/26 · 01 · 24/11/25 · 23/11/26 · Vijay · Roshni`, then `17/08/26 · 03 ·
  " · "`; the Live rodent sheet shows 2024 all 0, 2025 May 1 + Jun 1 = 2, 2026 Jan–Jun as reported,
  Jul–Aug blank, September from the register). Eleven new smoke assertions: the sheet's title, year
  rows and 13-bar chart; the 2025 paper figures; register months tinted; future months blank; the fly
  trend in the same format; the register's two pages, legend, seven headings and header; its cells
  written as the specimen writes them, with the register's two fixed tube dates and ditto marks; and both sheets on
  their service pages. Two new visual-QA checks and screenshots. Three things this surfaced: (1) the
  register's VERIFIED BY column was clipped with the sidebar open — a generic `.doc-table th { nowrap }`
  rule later in the stylesheet was beating the register's wrapping headings; (2) §25 had staggered the
  tube-light dates across the year, which the specimen contradicts (all 13 installed and due on the
  same pair of dates — later confirmed by the department as 24/11/25 and 23/11/26, REQUIREMENTS §44)
  — restored, and check point 10 is no longer generated as a finding; (3) the rodent report
  counted blank future shells as "recorded days". The service page now also holds sheet tables, so its
  visit list got a `data-table="visits"` hook: the old `.doc-table tbody` selector hit four tables and
  crashed the smoke suite in strict mode on the first run.
- **Briefing dismissal is now a helper in the smoke suite** (`dismiss_briefing`). A reload inside the
  morning or evening briefing window pops that slot's briefing — a modal that swallows clicks — and
  the suite reloads in four places. This surfaced as a one-off timeout at 17:0x on `text=Record
  Calendar`, the same signature as the double-briefing bug fixed earlier; every reload now clears the
  overlay rather than only the first one.
- **Test selectors moved off translated text.** The Send / microphone / speaker buttons now carry
  `data-action` hooks, because their `aria-label`s are (correctly) translated and a suite that
  selects on user-visible English would break the moment someone switches language — which is
  exactly how this surfaced: `button[aria-label='Send message']` timed out on the first run.
- **The licence is held with no changes at all** (09-Sep-2026, on the department re-confirming it
  must stay exactly as supplied). The app previously showed only page *renderings* of the PDF; the
  supplied file itself is now served too, byte for byte — `frontend/public/source/gurudev-insecticide-licence.pdf`,
  320,370 bytes, SHA-256 `0a63f34c…c96f`, verified identical to the file as received, to the copy in
  `source-documents/`, and to the copy the build emits into `dist/`. The licence page opens it from an
  "Open the original PDF" button (and a link beside the scans), and says plainly that the pages shown
  are that same file page for page, with the transcription secondary. Checked by two new smoke
  assertions: the PDF is served with `application/pdf` at exactly 320,370 bytes, and the page links to
  it. Nothing about the document, its placement in Pest Control > Training & Reference, or the
  transcription changed.
- **Assistant scope — this software only** (09-Sep-2026). The assistant is a tool for operating this
  record system, not a general chatbot, so it now declines anything outside it (general knowledge,
  news, sport, weather, maths, jokes, poems and other creative writing, recipes, programming,
  medical / legal / financial advice) with one friendly sentence plus an example of what it *can* do —
  never answering partially, as a preface or as an example, and never navigating for it. Two layers:
  the authoritative `SCOPE` block in the model's system prompt (`backend/assistant.ts`) and a
  deliberately tiny client-side pattern list (`offTopicReply`, `engine/assistantLocal.ts`) for
  phrasings that could not conceivably be about the plant's paperwork — declined instantly, no
  network call, no tokens. Ambiguous words that also belong to the work ("treatment", "recipe",
  "translate" — F/QC/13 is Gujarati — and bare "weather", which drives pest activity) are left to the
  model on purpose: wrongly refusing real work is worse than one call spent declining. Placeholder,
  subtitle, welcome and footer wording updated to set the expectation. Checked with four new smoke
  assertions (a joke request declined; "write me a poem about rodents" declined even though it
  name-drops a pest word; no navigation; **and the very next in-scope question still answered — the
  over-blocking guard**) and three new live-Groq assertions ("explain how photosynthesis works" came
  back as *"I'm here to help with the plant's record-keeping system — e.g., I can open the CAPA screen
  or navigate to the pest-control daily register"*, carrying none of chlorophyll / sunlight / carbon
  dioxide / glucose).
- **Groq pacing and reply-waiting in the chat suite.** The longer scope prompt pushed each call to
  ~2.5k tokens, so six calls in quick succession exhausted the account's 8,000-tokens-per-minute
  allowance and the suite read empty reply bubbles — which then cascaded into unrelated check
  failures. Fixed properly rather than papered over: `backend/groq.ts` now retries a 429 up to twice
  (still honouring the delay Groq names, capped at 8 s), and `e2e_assistant_chat.py` paces
  model-bound messages ~22 s apart (`PACE_SECONDS`) and *waits for the reply bubble to actually carry
  text* (`wait_for_reply`, 45 s cap) instead of sleeping a fixed 3.5 s. The rerun needed zero retries.
  Debug prints of model output now go through `ascii_safe()` — a reply containing an emoji or a
  typographic quote crashed `print()` on the cp1252 Windows console mid-run.
- **The service provider's insecticide licence on file** (09-Sep-2026): Gurudev Pesticides'
  Government of Gujarat Form III licence ("Service licence GP3 kapila mam.pdf"), added to Pest
  Control > Training & Reference as `/licence` — the two scanned pages shown exactly as supplied
  (rendered from the PDF at 140 dpi into `frontend/public/source/`, copied to `dist/` by the build)
  with a verbatim transcription (registration / licence numbers, expert staff, the conditions with
  their printed Sr. Nos. 1–7, 9, 10, 13–15). Checked by four new smoke assertions (both scans
  present, the first actually loads from the served build, the transcription's key facts, 12 term
  rows) and one new visual-QA check with two screenshots; the Document Library count moved 21 → 22.
- **Bug found by running the suite at 17:10 — a double briefing.** A first-ever open inside a slot
  window (09:00–10:00 or 17:00–18:00) showed the "first" briefing and then, the instant it was
  dismissed, the slot's own briefing straight over the page — a modal overlay that swallowed every
  click (the suite timed out on `text=Record Calendar`, with Playwright reporting the widget's
  `<div class="no-print">` intercepting pointer events). `recordBriefingShown("first")` now also
  marks the current slot as shown (`engine/briefingSchedule.ts`), so the assistant interrupts once
  per slot as designed. Every earlier run had happened outside those windows, which is why it had
  never shown up.
- One label in the new checks used a "→" arrow, which the Windows cp1252 console cannot print —
  Python's `print` raised `UnicodeEncodeError` mid-run. Labels are ASCII-only now (em dashes are
  fine in cp1252; arrows are not).

### `e2e_smoke.py` — all 145 checks passed, 0 unexpected console errors

(11-Sep-2026: section 15b gained two checks — asking for a document's or a module's records over a
span now opens `#/files/{scope}/{from}/{to}` holding only files dated inside it; the chat reply is
read after going back. 12-Sep-2026: section 7b gained one — a new complaint arrives already numbered
26-27/001 — and its walk-through now types the job code as "fgsl 3877" to prove it is tidied to
FGSL3877. The numbered table below predates the new rows; the labels of the two rows whose meaning
changed are updated in place.)

(Two checks are date-conditional and are skipped on the days they can't apply: the "month that hasn't happened yet is blank" check in December, and the F/HR/18 fill checks in January, when last month's demo visits belong to the previous year.)

| # | Check | Result |
|---|---|---|
| 1 | Login screen renders (app gates on auth) | PASS |
| 2 | Assistant briefing popup greets the user on login | PASS |
| 3 | Briefing lists records the assistant filled in | PASS |
| 4 | Dashboard heading renders after signup | PASS |
| 5 | Top bar shows the signed-up user | PASS |
| 6 | Dashboard shows the assistant's briefing card | PASS |
| 7 | No unexpected console errors on initial load | PASS |
| 8 | Calendar grid renders | PASS |
| 9 | Today cell present | PASS |
| 10 | No pre-launch backlog banner after browsing old calendar months | PASS |
| 11 | Day view opens | PASS |
| 12 | Opened a Daily Pest Monitoring record from Day View | PASS |
| 13 | Record page shows checkpoint table | PASS |
| 14 | Daily record was pre-filled by the assistant | PASS |
| 15 | Record submitted (status Pending Verification) | PASS |
| 16 | Record verified | PASS |
| 17 | Opened the F-QC-30 viscosity log sheet from Day View | PASS |
| 18 | Log sheet shows the F-QC-30 header | PASS |
| 19 | Log sheet was pre-filled with 24 hourly rows | PASS |
| 20 | Prepared banner explains what was filled | PASS |
| 21 | Log sheet submitted (status Pending Verification) | PASS |
| 22 | Status persists after reload | PASS |
| 23 | Dashboard shows stat tiles | PASS |
| 24 | Demo data was generated on entering Demo Mode (not pre-empted by Live shells) | PASS |
| 25 | Explicit demo generation is idempotent and reports a count | PASS |
| 26 | Demo mode banner visible | PASS |
| 27 | Demo calendar shows completed (filled) records, not blank shells | PASS |
| 28 | Rodent report uses the company's layout (Source / Unit / Target Pest / Year / Total) | PASS |
| 29 | Rodent report is in the company's format: its title, one row per year from 2024, and the bar chart JAN-DEC + Total | PASS |
| 30 | Rodent report carries the company's reported 2025 figures (May 1, June 1, total 2) | PASS |
| 31 | This year's months held by the digital register are added up from it (tinted), not copied from paper | PASS |
| 32 | A month that hasn't happened yet is left blank, as on the paper report | PASS |
| 33 | Digital rodent total over the demo year is non-zero (pattern applied) | PASS |
| 34 | Rodent report breaks catches down by location | PASS |
| 35 | Fly Catcher Infestation trend has a non-zero yearly total in Demo Mode (seasonal fly pattern applied) | PASS |
| 36 | Fly Catcher Infestation trend lists all 13 units in the company's year layout | PASS |
| 37 | Fly trend uses the same company format (title and the JAN-DEC + Total chart) | PASS |
| 38 | F/HR/18 register is filled from the visit records, written as the specimen writes it (d/mm/yy, two-digit counts) | PASS |
| 39 | Tube-light dates follow the specimen's annual cycle (installed 24/12, due 23/12), with ditto marks on the line below | PASS |
| 40 | Fly Control service page carries the F/HR/18 register | PASS |
| 41 | Rat / Mice service page carries the Rodent Catch Report and Trend Analysis | PASS |
| 42 | Demo service visits never sit on the Thursday weekly off � a visit scheduled on a Thursday is dated the next working day | PASS |
| 43 | Live mode banner visible after switch | PASS |
| 44 | CAPA home offers exactly the two options, Internal and External | PASS |
| 45 | CAPA Internal list shows seeded Dec-2023 inspection | PASS |
| 46 | CAPA External list shows the F/MKT/05 checklist | PASS |
| 47 | New complaint auto-starts the assistant walk-through | PASS |
| 48 | Assistant asks for the customer first | PASS |
| 49 | Header details captured on the form, the job code in the plant's format | PASS |
| 50 | Assistant announces Section A | PASS |
| 51 | Section B is announced after A's five activities | PASS |
| 52 | Section C is announced next | PASS |
| 53 | Section D is announced next | PASS |
| 54 | Section E is announced next | PASS |
| 55 | After E the assistant asks for approval | PASS |
| 56 | Form shows all 31 activities done | PASS |
| 57 | Assistant confirms submission | PASS |
| 58 | Checklist status is Pending Verification (awaiting approval) | PASS |
| 59 | Prepared By was stamped with the logged-in user | PASS |
| 60 | Assistant offers to approve | PASS |
| 61 | Assistant confirms approval | PASS |
| 62 | Checklist status is Verified (approved) | PASS |
| 63 | Training list shows seeded record | PASS |
| 64 | Training list shows the Dec-2025 awareness programme | PASS |
| 65 | SOC list shows both statements | PASS |
| 66 | SOC detail renders the declaration | PASS |
| 67 | Chemical master shows pesticide chart | PASS |
| 68 | SOP reference shows Lizard quarterly frequency | PASS |
| 69 | Reports page renders tabs | PASS |
| 70 | Lamination QC report renders | PASS |
| 71 | Reports > Daily Monitoring Summary reproduces the F/HR/17 three-page register | PASS |
| 72 | Document Library lists all 22 documents | PASS |
| 73 | Document Library shows the lamination module | PASS |
| 74 | Document Library shows the QC inspection module | PASS |
| 75 | Document Library groups both CAPA documents under the CAPA module | PASS |
| 76 | Sidebar has a collapsible Pest Control module header | PASS |
| 77 | Sidebar has a CAPA module with Internal and External links | PASS |
| 78 | Pest Control module starts expanded (Training link visible) | PASS |
| 79 | Collapsing the module header hides its links | PASS |
| 80 | A collapsed module stays collapsed after navigating elsewhere | PASS |
| 81 | Expanding it again restores the links | PASS |
| 82 | Navigation panel is a column beside the content by default | PASS |
| 83 | Closing the panel gives the page the full window | PASS |
| 84 | A closed panel is hidden from keyboard and screen readers too, not just narrowed | PASS |
| 85 | The panel stays closed after a reload (the choice is remembered) | PASS |
| 86 | The top-bar button brings the panel back | PASS |
| 87 | Collapse-all closes every module at once | PASS |
| 88 | A collapsed module still marks the one holding the current page | PASS |
| 89 | Expand-all opens them again | PASS |
| 90 | Module link deep-links Document Library filtered to that module | PASS |
| 91 | Filtered library shows only that module's documents | PASS |
| 92 | Pest Control module lists its report groups in the sidebar | PASS |
| 93 | Rat / Mice service reports open on their own page | PASS |
| 94 | Service report list shows this month's fortnightly visit(s) | PASS |
| 95 | Daily Report page shows the month register with today's row | PASS |
| 96 | Daily Report is laid out as the F/HR/17 three-page register (10 check points, 31 date rows) | PASS |
| 97 | Register carries the format's own instruction wording (Yes / No, except point no. 7) | PASS |
| 98 | Register page 3 carries the Summary of Actions Taken if Pest Observed | PASS |
| 99 | Fly Catcher Infestation opens on the F/HR/18 register in the company's two-page format (Live) | PASS |
| 100 | Register carries the form's own seven column headings | PASS |
| 101 | Its trend view still lists every unit PC-01..PC-13 (Live) | PASS |
| 102 | Pest Control overview shows the four groups | PASS |
| 103 | Service Provider Licence page shows both scanned licence pages | PASS |
| 104 | Scanned licence pages are actually served by the app (first image loaded) | PASS |
| 105 | Licence transcription carries Form III, the licensee and the licence number | PASS |
| 106 | Licence terms are listed exactly as printed (12 numbered conditions) | PASS |
| 107 | The original licence PDF is served by the app exactly as supplied (byte-for-byte) | PASS |
| 108 | Licence page links to that original PDF | PASS |
| 109 | Opened the F/QC/37 pouching inspection from Day View | PASS |
| 110 | Inspection shows the 11 printed test parameters | PASS |
| 111 | Inspection observations were pre-filled from the specimen | PASS |
| 112 | Lot status pre-set to Accepted and inspector signed | PASS |
| 113 | Inspection record submitted | PASS |
| 114 | Search returns results for PC-01 | PASS |
| 115 | Search finds the lamination operator on the prepared log sheets | PASS |
| 116 | Calendar marks every Thursday of September 2026 as the weekly off | PASS |
| 117 | Calendar shows Janmashtami (04-Sep-2026) from the leave calendar | PASS |
| 118 | Adjustment day 22-Oct-2026 is a working Thursday (October: 4 weekly offs + 1 working day) | PASS |
| 119 | Day View explains a Thursday as the weekly off | PASS |
| 120 | Daily Report register pre-marks the next weekly-off Thursday as a HOLIDAY row | PASS |
| 121 | Master Data shows the weekly off (Thursday) and the leave calendar's five adjustment days | PASS |
| 122 | Assistant page opens from the sidebar with suggestions and a composer | PASS |
| 123 | Assistant page offers voice input (press-to-talk) and a read-aloud toggle | PASS |
| 124 | Pressing the microphone starts listening (or explains why it can't) | PASS |
| 125 | Assistant answers a weekly-off date from the working calendar (no network needed) | PASS |
| 126 | Assistant explains an adjustment day as a working Thursday | PASS |
| 127 | Assistant lists what's next on the leave calendar (or says the year's list is done) and names the weekly off | PASS |
| 128 | Assistant conversation persists across a reload | PASS |
| 129 | Assistant lists a document's records for an explicit single-day range, not the whole month | PASS |
| 130 | Assistant scopes a module's listing to the exact multi-day span asked for | PASS |
| 131 | Assistant declines a general (non-software) question | PASS |
| 132 | Declining a general question does not navigate away | PASS |
| 133 | A general request that mentions a pest-control word is still declined | PASS |
| 134 | An in-scope question straight after is still answered normally (scope guard does not over-block) | PASS |
| 135 | The top bar offers both languages | PASS |
| 136 | Choosing Gujarati translates the Dashboard | PASS |
| 137 | ...and the sidebar's module names | PASS |
| 138 | ...and the top bar / mode banner | PASS |
| 139 | Other pages follow the same language without a reload | PASS |
| 140 | Controlled document text (F/HR/17 and its check points) stays exactly as issued | PASS |
| 141 | The Record Calendar is translated too | PASS |
| 142 | Switching back to English restores it everywhere | PASS |

(One benign console entry — the pre-login `GET /api/auth/me` 401, expected on every fresh
session — is filtered out of the "unexpected console errors" check rather than counted as a
failure; it's logged by Chromium for any non-2xx fetch response and is not something the app
treats as an error.)

Two checks changed meaning in this run. The old "GAP / Corrective Action" sidebar label no longer
exists (the module was renamed CAPA earlier without the suite being re-run), and the old "Demo
generation created new records" check assumed the Dashboard did *not* pre-generate demo data —
it now deliberately fills the year so far on entering Demo Mode, so the check was rewritten to
assert what the original bug was actually about: demo data exists and is real data, not blank
shells.

### `e2e_voice.py` — 13/13 voice-timing checks passed

Headless Chromium has no speech engine, so the suite installs a fake `SpeechRecognition` before the
app boots (`page.add_init_script`) and drives it: emit a fragment, wait 1.2 s (a real mid-thought
pause, inside the 2.5 s silence window), emit the rest, then go quiet. This is what proves the
"finish your sentence first" behaviour rather than a screenshot of a microphone button.

| # | Check | Result |
|---|---|---|
| 1 | No messages before speaking | PASS |
| 2 | Recognition started in continuous mode with interim results | PASS |
| 3 | Listening state is shown | PASS |
| 4 | Nothing is sent during a mid-sentence pause | PASS |
| 5 | The sentence so far is shown in the composer | PASS |
| 6 | Still listening after the pause | PASS |
| 7 | Still nothing sent immediately after the last word | PASS |
| 8 | Sent exactly once after the speaker finished (sent: `is 2026-09-10 a holiday?`) | PASS |
| 9 | Sent the COMPLETE sentence, both halves | PASS |
| 10 | Listening stopped once it was sent | PASS |
| 11 | Composer was cleared | PASS |
| 12 | The assistant answered the spoken question | PASS |
| 13 | Pressing "Done" sends what was said instead of discarding it | PASS |

### `tests/e2e_crud.py` — 24/24 checks passed, 0 JS errors (12-Sep-2026)

| # | Check | Result |
|---|---|---|
| 1 | Every document that holds records offers New in the library | PASS |
| 2 | …and the reference documents don't (they are single documents, edited in place) | PASS |
| 3 | New starts a record and opens it | PASS |
| 4 | …as a draft, dated today, with the form's own starting data | PASS |
| 5 | …and there is still only one for that day, not two | PASS |
| 6 | The assistant starts a record from words | PASS |
| 7 | …of the document that was named | PASS |
| 8 | …and a second one for the same day opens the first, not a duplicate | PASS |
| 9 | The assistant prints the document | PASS |
| 10 | The assistant asks for the record to be checked before it submits | PASS |
| 11 | …offering to go ahead once it has been | PASS |
| 12 | …and then submits it (or says exactly what is missing) | PASS |
| 13 | Asking to delete asks first, never straight away | PASS |
| 14 | …offering Delete it / Keep it | PASS |
| 15 | The record is deleted | PASS |
| 16 | …and the deletion is on file: what it was, its status, who, when and why | PASS |
| 17 | Keeping it leaves the record alone | PASS |
| 18 | A verified record now offers Delete as well | PASS |
| 19 | …and asks for a reason before it will go | PASS |
| 20 | The record is gone | PASS |
| 21 | …with the reason on file | PASS |
| 22 | The Document Library lists what was deleted | PASS |
| 23 | …with the document, the status it was in, who removed it and why | PASS |
| 24 | No JavaScript errors | PASS |

### `tests/e2e_agreement_and_cancel.py` — 37/37 checks passed, 0 JS errors (12-Sep-2026)

| # | Check | Result |
|---|---|---|
| 1 | The Service Provider page asks for the agreement, and says the term is two years | PASS |
| 2 | …offering both ways: drafted for you, or the signed copy uploaded | PASS |
| 3 | 'Remind me later' snoozes it to a date, not for ever | PASS |
| 4 | …and it stays quiet on the next visit | PASS |
| 5 | …while the card on the page still says where the agreement stands | PASS |
| 6 | Drafting it opens the agreement on the provider's letterhead | PASS |
| 7 | …with the provider's address, phones and website exactly as printed | PASS |
| 8 | …for a two-year term | PASS |
| 9 | …with the services and the licence number taken from what the system holds | PASS |
| 10 | …and nothing invented: what nobody has told the system is TO BE CONFIRMED | PASS |
| 11 | A typed change saves itself | PASS |
| 12 | The assistant can fill it in too | PASS |
| 13 | The signed copy uploads onto the agreement | PASS |
| 14 | …and shows on the page | PASS |
| 15 | With an agreement in force the card says so and stops asking | PASS |
| 16 | With the term nearly up it asks again, saying when it runs out | PASS |
| 17 | …offering the renewal the same two ways | PASS |
| 18 | Once it has run out it says so, and keeps asking | PASS |
| 19 | The agreement submits and verifies | PASS |
| 20 | Edit reopens it, and offers Cancel edit | PASS |
| 21 | Cancel edit puts a record-page document straight back to Verified | PASS |
| 22 | The training list holds both records | PASS |
| 23 | Training record 1 is headed with the provider's letterhead, exactly as printed | PASS |
| 24 | Training record 1: the plant's company line is gone from the heading | PASS |
| 25 | Training record 1: the title and the Format No. / Rev No. / Date row are gone | PASS |
| 26 | Training record 2 is headed with the provider's letterhead, exactly as printed | PASS |
| 27 | Training record 2: the plant's company line is gone from the heading | PASS |
| 28 | Training record 2: the title and the Format No. / Rev No. / Date row are gone | PASS |
| 29 | The letterhead prints with the record | PASS |
| 30 | A signed-off training record is locked and offers Edit | PASS |
| 31 | Edit reopens it for correction | PASS |
| 32 | …and offers Cancel edit, in the banner at the top and beside Submit | PASS |
| 33 | Cancel edit puts it straight back, nothing changed | PASS |
| 34 | …and the history says the edit was cancelled | PASS |
| 35 | Cancelling after a change asks first | PASS |
| 36 | …and putting it back restores what the record said, at its old status | PASS |
| 37 | No JavaScript errors | PASS |

### `tests/e2e_capa_formats.py` — 25/25 checks passed, 0 JS errors (12-Sep-2026)

| # | Check | Result |
|---|---|---|
| 1 | The Dashboard has no language buttons of its own, and the top bar still offers both languages | PASS |
| 2 | A new complaint is numbered for this year | PASS |
| 3 | …and the next one takes the next number | PASS |
| 4 | A job code typed loosely is tidied to the plant's format | PASS |
| 5 | A job code that doesn't fit says what the format is | PASS |
| 6 | …and the message goes when it fits | PASS |
| 7 | A PO No. must be eight digits | PASS |
| 8 | …and eight digits is accepted | PASS |
| 9 | A bare number typed over the complaint number becomes this year's | PASS |
| 10 | Submit is refused while the PO No. doesn't fit, and says why | PASS |
| 11 | The assistant writes an FG code in the plant's format | PASS |
| 12 | …and refuses one that doesn't fit, with the reason, leaving the good one | PASS |
| 13 | The walk-through still starts itself on a complaint that is only numbered | PASS |
| 14 | The walk-through refuses a job code that doesn't fit, and asks again | PASS |
| 15 | …and writes a tidied one onto the sheet | PASS |
| 16 | Section A says every activity has to be answered before the next section | PASS |
| 17 | …and a section cannot be skipped any more | PASS |
| 18 | …nor an activity: only real answers are offered | PASS |
| 19 | Section A finished takes it to Section B by itself | PASS |
| 20 | The assistant asks for a review before it submits anything | PASS |
| 21 | …and only submits once it has been checked | PASS |
| 22 | Submit is refused while a section is unfinished, naming what is left | PASS |
| 23 | Asking for a CAPA summary answers for both sides | PASS |
| 24 | …and offers a way into each | PASS |
| 25 | …or just one side when it is named | PASS |

### `tests/e2e_print_and_forms.py` — 35/35 checks passed, 0 JS errors (11-Sep-2026)

| # | Check | Result |
|---|---|---|
| 1 | An older draft is brought into line at start-up: every Glue Board line carries the first line's quantity | PASS |
| 2 | ...the bait area keeps a quantity of its own (grams, not glue boards) | PASS |
| 3 | ...a material typed over is set back to the fixed one | PASS |
| 4 | ...and the change is in its history, by System, after the assistant's preparation | PASS |
| 5 | Material and method are fixed text on the form — there is no box to type them in | PASS |
| 6 | The quantity is typed on the first line of each material only (line 1 for the glue boards, the bait line for the cake) | PASS |
| 7 | Typing it on line 1 gives every Glue Board line the same quantity | PASS |
| 8 | ...and leaves the bait line's quantity alone | PASS |
| 9 | The last line shows that same quantity on screen | PASS |
| 10 | The assistant won't change a fixed material, and says why | PASS |
| 11 | "quantity is 6" sets it once — every Glue Board line reads 6 | PASS |
| 12 | Print on a record prints the form (the browser was asked to print once) | PASS |
| 13 | ...and nothing around it: the assistant's banner, the sidebar and the buttons stay off the paper | PASS |
| 14 | When printing ends the page is back as it was | PASS |
| 15 | The register shows the Month & Year chosen | PASS |
| 16 | It offers Add visit, Edit register and Print on the register | PASS |
| 17 | Add visit offers a date in that month (its first scheduled visit) | PASS |
| 18 | A date outside the register's month is refused, with the reason | PASS |
| 19 | The visit is on the register: a Live F/HR/18 draft for that date, noted in its history as added | PASS |
| 20 | ...and the register opens for editing: one count box per unit for that visit | PASS |
| 21 | What is typed into the register saves itself into that visit | PASS |
| 22 | ...with the change in the visit's history (before -> after) | PASS |
| 23 | The same date can't go on the register twice | PASS |
| 24 | The next visit carries the names forward from the one before it and leaves its counts to be entered | PASS |
| 25 | The first visit, filled in on the register, submits from its own page | PASS |
| 26 | Back on the register the visit reads as the paper does: its date and a two-digit count | PASS |
| 27 | In Edit register a submitted visit is locked — only the draft visit takes input | PASS |
| 28 | Print register prints the register alone — not the page title or its toolbar | PASS |
| 29 | ...and as the paper form: the edit boxes are gone from the printout | PASS |
| 30 | The browser's own Print (Ctrl+P) gives the same printout: the register, not the page's title or explanation | PASS |
| 31 | Printing Reports prints the open report — not the tabs or the title above it | PASS |
| 32 | The SOP has a Print of its own, which prints the SOP without the page's note | PASS |
| 33 | The Fly Control service page's register has the same Add visit / Edit register | PASS |
| 34 | After a restart the added draft visit is untouched: not filled in by the assistant, not moved | PASS |
| 35 | No JavaScript errors | PASS |

### `tests/e2e_files.py` — 17/17 checks passed, 0 JS errors (11-Sep-2026)

| # | Check | Result |
|---|---|---|
| 1 | Document Files opens on this month by itself | PASS |
| 2 | A `/files` address with an impossible date falls back to this month, without an error | PASS |
| 3 | "November to February" runs from 1 November to the end of February next year | PASS |
| 4 | …and every file in it is a fly catcher file inside that span | PASS |
| 5 | "all document of pest control module from June to August" opens exactly that span | PASS |
| 6 | One month folder per month asked for — no more, no fewer | PASS |
| 7 | The folders are the pest control documents only | PASS |
| 8 | Every file is a pest control document dated inside the span | PASS |
| 9 | The summary counts exactly the files shown | PASS |
| 10 | Opening the fly catcher folder shows its files only | PASS |
| 11 | The breadcrumb names the folder | PASS |
| 12 | Changing From narrows the span and the address follows | PASS |
| 13 | The chat keeps a written list with the span it covered | PASS |
| 14 | A day-to-day span holds only files between those two days | PASS |
| 15 | "All documents from 1 to 5 …" opens every module for those five days | PASS |
| 16 | Opening a file opens that record | PASS |
| 17 | "may I … marked …" is read as this week, not as May or March | PASS |

Also checked by screenshot: desktop (module → document → month → dated files, date in its own
column) and 420 px wide (the folder tree and file list fit; the page's remaining sideways scroll at
that width comes from the top bar and is the same on the Dashboard).

### `tests/e2e_editing.py` — 20/20 checks passed

| # | Check | Result |
|---|---|---|
| 1 | Today's Live daily record exists | PASS |
| 2 | The page says all changes are saved � no Save button to forget | PASS |
| 3 | The edit is stored without pressing Save | PASS |
| 4 | The record's history holds the edit as before -> after (Checker -> Vijay) | PASS |
| 5 | Submitted (Pending Verification) | PASS |
| 6 | Verified | PASS |
| 7 | A verified record is locked and offers 'Correct this record' instead of Save / Submit | PASS |
| 8 | Reopening needs a reason first | PASS |
| 9 | Reopened: In Progress, with the reason recorded | PASS |
| 10 | A banner says it is being corrected, by whom and why | PASS |
| 11 | The history keeps the verification, the reopening and the correction's before/after | PASS |
| 12 | The assistant changes a field from a plain sentence, saves it and lists the change | PASS |
| 13 | The history marks it as the assistant's change | PASS |
| 14 | Undo puts the old value back | PASS |
| 15 | A value the form can't hold is refused, with the reason | PASS |
| 16 | On a verified record the assistant asks before reopening it, and changes nothing yet | PASS |
| 17 | After 'Yes': reopened for correction, changed, and the user's words recorded as the reason | PASS |
| 18 | A Master Data row can be corrected in place, and it sticks | PASS |
| 19 | One tap on delete only asks | PASS |
| 20 | 'Keep' leaves the row | PASS |

### `tests/e2e_realism.py` — 22/22 checks passed

Run against a generated demo year (2687 demo records: {'Verified': 1806, 'Pending Verification': 272, 'In Progress': 72, 'Rejected': 86, 'Due': 451}).

| # | Check | Result |
|---|---|---|
| 1 | A demo year of records was generated | PASS |
| 2 | Some readings fall outside the printed band, as they do on the real specimen | PASS |
| 3 | ...but they stay exceptional (under 5% of all readings) | PASS |
| 4 | ...and they cluster on some days rather than every day | PASS |
| 5 | Every out-of-band reading on a form WITH a remark column has the remark filled in | PASS |
| 6 | Not every inspected lot is plain Accepted | PASS |
| 7 | ...but most are (over 85%) | PASS |
| 8 | Every lot that is not Accepted states its reason | PASS |
| 9 | In-process printing grades are not all A and B | PASS |
| 10 | ...and the F grade, which stops printing, stays rare | PASS |
| 11 | The daily pest register records findings, not a clean sheet every day | PASS |
| 12 | Every recorded finding says what was done about it | PASS |
| 13 | Findings observed in the registers are carried into CAPA records | PASS |
| 14 | Every CAPA finding carries a corrective action | PASS |
| 15 | Some corrective actions are closed and some are still overdue | PASS |
| 16 | Records are not all submitted at the same clock time | PASS |
| 17 | Some records were sent back | PASS |
| 18 | Every rejected record names the reason and who rejected it | PASS |
| 19 | Verification is not always same-day | PASS |
| 20 | ...and never before submission | PASS |
| 21 | No record for a future date has been filled in already | PASS |
| 22 | A second browser generates exactly the same readings, signatures and status for the same day | PASS |

Measured on that year: 121/8904 readings outside the printed band = 1.4%; lot status: {'Accepted': 584, 'Accepted on Deviation': 35, 'Segregation': 14, 'Reject / Scrap': 3}; printing grades: {'A': 661, 'B': 325, '-': 212, 'C': 68, 'F': 6}; 21 check-point findings recorded; 8 CAPA records, 20 findings: 15 closed, 5 overdue; 578 distinct submission clock times; 86 rejected records; 451 records dated in the future; same day on a second browser: 2026-01-02.

### `visual_qa.py` — 20/20 interaction checks passed (20 `check()` calls at run time), 0 JS errors

| # | Check | Result |
|---|---|---|
| 1 | Assistant briefing shown on login (captured as `00_briefing.png`) | PASS |
| 2 | Signed up and reached the dashboard | PASS |
| 3 | Opened a Fly Catcher record via Search, filled all 13 PCs, submitted | PASS |
| 4 | Opened a Service Report record via Search, filled technician sign, submitted | PASS |
| 5 | Process Parameter / ALC & Production / Adhesive Mixing log sheets open with the prepared banner | PASS |
| 6 | Created a new CAPA record, added a finding | PASS |
| 7 | Created a new Training record, added an attendee | PASS |
| 8 | Pest Control overview renders its four groups — Daily Report / Service Reports / Trend Analysis / Training & Reference (captured as `15_pest_control_overview.png`; the Fly Catcher Infestation page as `16_pest_fly_catcher_infestation.png`) | PASS |
| 9 | Fly Catcher Infestation opens on the two-page F/HR/18 register (captured as `16_pest_fly_catcher_infestation.png`; its trend view as `26_fly_catch_trend.png`) | PASS |
| 10 | Rodent Catch Report and Trend Analysis renders in the company format with its chart (captured as `27_rodent_catch_report.png`) | PASS |
| 11 | Assistant page renders its suggestions and composer (captured as `17_assistant_page.png`; the October-2026 Record Calendar with its Weekly off / Working day chips as `18_calendar_october_holidays.png`) | PASS |
| 12 | Licence page shows both scanned pages of the Form III licence (captured as `20_service_provider_licence.png`; the Daily Report in its F/HR/17 three-page register layout as `19_daily_register_fhr17.png`) | PASS |
| 13 | Dashboard switches to Gujarati — the whole interface (captured as `21_dashboard_gujarati.png`; Pest Control in Gujarati as `22_pest_control_gujarati.png`) | PASS |
| 14 | Assistant page shows voice input and a read-aloud toggle (captured as `23_assistant_voice.png`) | PASS |
| 15 | Every module collapses to one row, with the current one still marked (captured as `24_sidebar_modules_collapsed.png`) | PASS |
| 16 | Closing the panel gives the register the full window (captured as `25_sidebar_closed.png`) | PASS |
| 17 | SOC detail page renders | PASS |
| 18 | Print media emulation renders a clean original-style layout (no sidebar/topbar/buttons) | PASS |
| 19 | 29 full-page screenshots captured for visual review (`tests/shots/`) | PASS |
| 20 | No JS errors across the whole pass | PASS |

### `e2e_assistant_chat.py` — 12/12 checks passed, 0 JS errors (real Groq calls, paced ~22 s apart)

| # | Check | Result |
|---|---|---|
| 1 | Navigated to Reports for August via free text ("show me all reports of august" → `#/reports/2026/7`, correctly 0-indexed) | PASS |
| 2 | Assistant showed a confirmation reply alongside the navigation | PASS |
| 3 | Navigated to CAPA via free text ("open CAPA" → `#/gap`) | PASS |
| 4 | A conversational message ("hi there, how is your day going?") did not navigate anywhere | PASS |
| 5 | Assistant gave a reply message for it | PASS |
| 6 | Opened a Daily Pest Monitoring record for the fill test | PASS |
| 7 | Fill instruction ("checker is Buddy QA Tester") applied a field | PASS |
| 8 | Checker field actually updated in the form | PASS |
| 9 | Out-of-scope question ("explain how photosynthesis works", phrased so the client-side guard does *not* catch it) declined by the model instead of answered — no chlorophyll / sunlight / carbon dioxide / glucose in the reply | PASS |
| 10 | ...and the decline says what it does cover instead | PASS |
| 11 | ...and does not navigate anywhere | PASS |
| 12 | Assistant page: "which day of the week is our weekly off?" (no date reference, so not answered locally) — the model replied "Thursday" from the live-facts `context` attached to the call | PASS |

Also verified directly against the Groq API (`GET /openai/v1/models`) that this account's key has no
access to the commonly-documented `llama-3.3-70b-versatile` default (404s) — the model this app
actually uses, `openai/gpt-oss-120b`, was found by listing what the key *does* have access to, and
correctly handled relative-date reasoning ("the 15th of last month" against a today of 2026-09-08 →
`/day/2026-08-15`) and module-slug navigation ("lamination quality control documents" →
`/library/lamination-quality-control`) in ad-hoc testing beyond the scripted checks above.

### Bug fix: unbounded record-backlog generation ("3484 records ready")

A real user reported the login briefing showing thousands of prepared records instead of the
handful actually due. Root cause: `engine/recordGenerator.ts`'s `ensureRecordsGeneratedForMonth` —
called by Calendar, Reports, Day View, Dashboard and the reminder engine for whatever month is being
*viewed* — had no lower bound, so browsing the Calendar back through old months (including months
before the system existed) silently created a "Due" shell for every recurring document on every day
of that month; the assistant then dutifully auto-filled and surfaced all of it as "ready for your
OK". Fixed with a per-browser `liveStartDate` floor (`settingsRepository.ts`, set once on first
boot, never generating a Live record before it) plus a narrowly-scoped, human-in-the-loop cleanup
for backlog a pre-fix session already created (`engine/backlogCleanup.ts` — only ever removes
records that are still blank/untouched, dueDate before the floor, isDemo:false, never a seeded
historical specimen; a Dashboard banner surfaces the count and a "Clean up N" button, dismissible
without deleting anything). Verified via `e2e_smoke.py` check #47 (browsing 2019/2020 calendar
months, then confirming the Dashboard shows no cleanup banner) and manually via the
`purgePreLaunchNoise()`/`findPreLaunchNoise()` pair.

A related visual bug from the same root cause — the Dashboard's "Records Due Today" table
truncating document names with a page-level horizontal scrollbar instead of wrapping/scrolling
internally — was a separate CSS issue (`.doc-table` used `overflow: hidden`, clipping instead of
scrolling; the two side-by-side flex cards lacked `min-width: 0`, so a wide table forced the whole
row wider than the viewport) fixed alongside it and confirmed visually in `tests/shots/01_dashboard.png`.

**A second, more serious bug in the fix itself** was caught by an adversarial review before this
shipped: `prepareDueRecords()` (which auto-fills due records — see the assistant section above) had
no floor of its own, only `ensureRecordsGeneratedForMonth` did. On the very next app load after the
fix, it would have silently promoted the *entire* pre-existing backlog to "In Progress" + prepared —
before the Dashboard's cleanup banner was ever seen — because its query only checked `dueDate <=
today`, never `dueDate >= liveStartDate`. Compounding that, `findPreLaunchNoise()`'s "In Progress +
prepared, untouched" check (`prepared.at === updatedAt`) could never actually hold, since
`prepared.at` was stamped once for a whole batch while `upsertMany()` independently re-stamped a
fresh `updatedAt` per record — two unrelated `new Date().toISOString()` calls that are essentially
never bit-for-bit equal. Both under-inclusive (never deleted anything real), but together they would
have made the cleanup banner report near-zero while thousands of ghost "In Progress" records kept
populating Reports/Calendar/reminders/the login briefing, unreachable by cleanup. Fixed by (1)
flooring `prepareDueRecords()` the same way as the generator, so pre-launch backlog stays plain
"Due" and is never auto-filled/surfaced as "ready", and (2) `upsertMany()` no longer re-stamps
`updatedAt` (every current caller already sets it explicitly), with `assistantPrepare.ts` now
setting `updatedAt` to the exact same value as `prepared.at`. Directly proven end-to-end by
`tests/e2e_backlog_regression.py`, which injects a simulated 50-record pre-fix backlog plus one
human-verified record sharing its oldest due date straight into `localStorage` before the first
post-fix boot, then asserts the backlog stays "Due" (not silently promoted), the briefing doesn't
claim it's "ready", the cleanup banner reports it accurately, and the verified record survives
cleanup untouched.

**Other review findings acted on:** `isValidAppRoute` (`src/store/router.tsx`) rejected valid
`/gap/<id>` and `/training/<id>` deep links despite the router fully supporting them — fixed. The
sidebar's auto-expand-active-module effect would silently re-open a module the instant you
navigated to any other page inside it, undoing an explicit collapse — simplified to a
persisted-choice-always-wins model (no more path-based override) so closing a module actually
sticks. A stale/unknown `/library/{slug}` deep link showed the *entire* unfiltered library under a
misleading "Filtered to: {slug}" badge instead of an empty result — fixed to show nothing. Reports
and Calendar could paint one stale frame (Reports) or stay stuck entirely (Calendar — it had no
props-resync logic at all) when the assistant navigated to a new month while already mounted on that
page — fixed by keying both on their route params in `App.tsx` so a genuine route change forces a
clean remount. On the security side: the assistant endpoint's raw error text (which could include
a vendor error body from Groq) is no longer forwarded to the client, `currentData` now has an
explicit size cap, and — since signup was completely unthrottled while the assistant's 20-calls/
10-min cap is per-account — added a per-IP signup throttle so that cap can't be trivially bypassed
by scripting fresh accounts.

### CAPA Internal / External + the guided complaint checklist — what the suites prove

- `e2e_smoke.py` drives the whole External flow through the chat widget, with NO network: New
  Complaint auto-opens the assistant → it asks for the customer and complaint number (typed) → job
  name / job code / PO skipped by chip → received date "Today" by chip → Section A "Let's go" then
  five "Done today" taps → Sections B–E via "All N done today" → "Shall I submit it for approval now?"
  → "Submit for approval" → status Pending Verification with Prepared By stamped as the logged-in
  user → "Review & approve" → "Approve" → status Verified. It also asserts the form shows 31 / 31
  (the printed Sr. No. runs 1–32 but skips 6), that `/gap` offers exactly Internal and External,
  that the sidebar's CAPA module has both links, and that a collapsed sidebar module now stays
  collapsed after navigating elsewhere.
- `e2e_assistant_chat.py` re-verifies the redesigned chat widget against live Groq (navigate, reply,
  fill), using `.chat-msg.bot` bubbles and the icon-only `button[aria-label='Send']`.
- `visual_qa.py` captures `06_capa_home.png` (the two-door chooser) and
  `07b_complaint_walkthrough.png` (a new complaint with the assistant's first question already asked).
- Found and fixed while writing these: the widget rendered its quick chips from a stale target ref,
  so "Review & approve" never appeared after Submit (fixed with a reactive `targetSignature` on the
  assistant context); and the redesigned panel was a fixed 640px tall, covering the Day View's "Open"
  buttons bottom-right (now sized to content, capped, scrolling inside).

### QC inspection records (F/QC/13, /34, /35, /37) — checked by hand against the screenshots

- Fixed parameter rows render with the printed specification as read-only text; only the
  observation / grade / pass / defect-count cells are inputs. No add/remove row buttons.
- Lot status defaults to Accepted; the reason field is validated only when the lot is not Accepted;
  "Approved by (QA Manager)" is not an input — the record's Verify step stamps the verifier.
- F/QC/13 renders the Gujarati procedure, grading rules and the collapsible A/B/C/F grade chart;
  grades pre-filled from the 6-9-26 specimen (B/A/A/–/A/B, defect counts +2/–/–/–/–/+2).
- CAPA: the Source dropdown (not on the paper form) was removed from the grid; findings on a
  submitted report can now be closed individually or with "Close all open findings" without
  rejecting the report first.

### Assistant / auto-fill checks done by hand against the screenshots

- Login briefing: greeting uses the logged-in name and time of day; each prepared record shows
  its Format No., due date and the two "what I filled" notes; "Submit all N" submitted every
  passing record and the popup re-rendered as "Waiting for a verifier" (see
  `13_briefing_after_submit_all` in the scratch run) — nothing was submitted that failed validation.
- F-QC-30: 24 fixed hourly rows, readings all within 19.0–21.0, day tester "Jeni" 09:00–17:00 and
  08:00, night tester "Singh" 18:00–07:00 — matches the specimen's split exactly.
- F-QC-32: three batch rows, quantities exactly 15 / 1.65 / 19.5 kg (weighed set quantities),
  only the viscosity varies; checked-by follows the shift of the batch time.
- Process Parameter Record: machine set-points copied verbatim from the specimen (3.00 / 2.00 /
  45 / 3.00 / 42 / 52 / 81–65 / 52 / 40 / 15% / 6.00), header (operator, machine, ratio, adhesive
  / hardener make-code-batch) carried forward. An earlier draft randomised these and was corrected —
  set-points are settings, not readings.
- Temperature: six readings 44–47 °C inside the 43–47 band, Sign resolved to the QC Tester.
- Values are deterministic per (document, date): reloading a prepared record shows the same
  numbers (seeded PRNG in `src/utils/random.ts`).
- localStorage after one full month of Live + demo data: ~206 KB — well inside the browser limit.

## Manual coverage mapped to the section‑42 checklist

- **Calendar: Month → Day → Record.** Verified — clicking any date navigates to Day View;
  clicking a record opens the correct typed renderer for its document kind.
- **Daily Monitoring: Open → fill → save → submit → verify.** Verified end-to-end in
  `e2e_smoke.py`; validation was also confirmed to *block* submit when checkpoints are left
  blank (see "Validation" below).
- **Fly Catcher: PC selection → data → save → report.** Verified — PC locations are read-only
  master data auto-populated per row; Fly Catcher Trend report reflects entered catch counts.
- **Rodent: Station → inspection → save → report.** No dedicated Rodent Inspection form exists
  in the source material (see REQUIREMENTS.md §6/§8) — rodent-relevant data is captured via
  Daily Monitoring checkpoints 4-9 and the Rodent Control Service Report, both of which were
  tested; Rodent Trend report was confirmed to compute from checkpoint 7 data.
- **Service Report: Service → area → chemical → quantity → save.** Verified — the Chemical
  Master suggestion banner appears for the matching service type; area lines are editable and
  addable.
- **GAP: Finding → action → target date → close → verify.** Verified — adding a finding, setting
  a target date, and clicking "Close" (which stamps `actualDateOfAction`) all work; verifying the
  whole inspection is correctly blocked while any finding remains Open/Overdue (see Validation).
- **Training: Training → employees → attendance → save.** Verified — attendees can be added with
  a name/department/attended checkbox; submit requires at least one attendee marked attended.
- **Demo Mode: Generate month → open records → edit → dashboard update.** Verified — generating a
  demo month populates the calendar with a DEMO watermark everywhere, editing a demo record works
  identically to a live one, and Dashboard/Reports figures update immediately (shared `version`
  bump mechanism, see DATA_MODEL.md).
- **Persistence: Refresh browser → data remains.** Verified — `localStorage` under the
  `dcrs:v1:` namespace; confirmed via full page reload mid-test.
- **Validation: Invalid/missing data → proper error.** Verified for three cases:
  1. Submitting a Daily Monitoring record with unanswered checkpoints shows a red error banner
     listing exactly which checkpoints are missing, and does *not* change status.
  2. Verifying a Service Report without a customer signature is blocked with an explicit error.
  3. Verifying a GAP inspection with any Open/Overdue finding is blocked with an explicit error
     naming how many findings are unresolved.
- **Printing: Record → Print → readable document.** Verified via `page.emulate_media("print")` —
  sidebar, topbar, mode banner and action buttons are hidden; form fields render as plain text
  (borders/pickers suppressed in print CSS) so the printout reads like a filled paper record, not
  a screenshot of a web form.

## Content/data-fidelity pass (second source review)

Re-checked `Kapila mam department reports .pdf` directly against the digitized Daily Pest
Monitoring form and Service Report, prompted by the company confirming the actual response
vocabulary and Service Report field behavior. Two content fixes and one functional bug came out
of it:

- **Daily Monitoring response vocabulary**: changed from a mixed OK/Not-OK + Yes/No control to
  Yes/No throughout (matching the filled specimen exactly), with per-checkpoint "which answer is a
  finding" polarity now explicit (`DailyCheckpointDef.flagWhen`, `engine/checkpoints.ts`) instead
  of a hardcoded `"NOT OK" || "Yes"` check — verified interactively that checkpoint 1 (finding on
  "No") and checkpoint 2 (finding on "Yes") each flag correctly, and that the demo generator's
  ~8-92% split lands on the *correct* side for every checkpoint (previously it would have made
  "pest proofing not working" the *common* case after a naive vocabulary swap — checked by
  inspecting generated `localStorage` data directly, not just the UI).
- **Service Report Material Name / Method of Application**: now fixed, read-only values pre-filled
  per area (`engine/serviceMaterials.ts`) instead of free-text inputs — Quantity Used and Remarks
  remain manually entered. Verified visually: all 16 Rodent Control areas show "Glue Board /
  Trouble gum placement" except "First floor - Offline punching & QC Inspection", which correctly
  shows the documented exception "Bromadiolone Cake / Baiting".
- **Bug found and fixed**: Demo Mode's "Generate Demo Records" could silently create nothing (or
  silently create blank, data-less records) depending on which page you'd viewed first — see
  DATA_MODEL.md's Demo/Live integrity section for the root cause and fix. Caught by generating demo
  data for the *current* month (the first thing anyone would try) and finding the reported "38
  created" didn't match reality; `tests/e2e_smoke.py` now has a check that specifically reproduces
  the page-visit ordering that triggered it.

## Authentication testing

Both scripts above now start every run at the login screen and go through real signup before
touching the rest of the app, which exercises:
- The auth gate itself (unauthenticated → login screen, not the app).
- Signup → session cookie → dashboard, with the real account name shown in the top bar.
- Every lifecycle action recording the signed-up identity (`submittedBy`/`verifiedBy`), asserted
  directly in the manual pass (see RecordPage's audit-trail line: "Submitted … by <name>").

Manually verified in addition (not yet scripted): wrong-password rejection (`Invalid email or
password.` shown, no session issued), duplicate-email signup rejection (`An account with that
email already exists.`), first-account-becomes-admin / later accounts become `staff`, session
persists across a full page reload and across an app restart (same `backend/data/app.db` +
`jwt-secret.txt`), and logout returning to the login screen.

## Known Phase‑1 limitations (by design, not oversight)

- Accounts are real (signup/login/logout, hashed passwords, signed sessions — see DEPLOYMENT.md's
  Accounts / Authentication section) but there is no LDAP/SSO and no role-based access control yet
  — `role` is issued and displayed, nothing is gated by it (flagged in FUTURE_ROADMAP.md).
- No multi-user concurrency for *operational data* — `localStorage` is per-browser; two people
  editing the same record on two different devices will not see each other's changes (last write
  wins within one device). This is intentional for the current single-shared-device deployment
  model (see DEPLOYMENT.md); the storage abstraction is what needs to change next for true
  multi-device sync, and accounts already exist for it.
- TypeScript type-checking (`npm run typecheck`) now passes cleanly — `@types/react` /
  `@types/react-dom` are installed (this project no longer builds in the original network-locked
  sandbox described in DEPLOYMENT.md's toolchain note) and `tsconfig.json`'s `lib`/`target` were
  bumped to ES2022 to match the `Array.prototype.at()` calls already in the codebase.
