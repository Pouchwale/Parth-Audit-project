# Digital Controlled Record System — Pest Control · Lamination QC & Production · Compliance

**Phase 1 prototype.** A digital reproduction of Gujarat Printpack Publication Pvt. Ltd.'s
existing paper-based controlled records — not a generic document manager. Every screen is built
from the company's actual uploaded documents (Format numbers, checkpoint wording, PC locations,
chemical charts, GAP findings, training certificates, photographed lamination registers) so the
digital record looks and behaves like the paper one it replaces. The uploaded sources are kept in
`source-documents/`.

See **REQUIREMENTS.md** for the full source-document inventory and traceability, **DATA_MODEL.md**
for architecture, **TESTING.md** for what was tested, **DEPLOYMENT.md** for how to run/deploy it,
and **FUTURE_ROADMAP.md** for how to extend this to the remaining ~141 controlled formats.

## The assistant: records are ready before you arrive

The app behaves like a personal assistant rather than a blank form:

- **Every record that falls due is pre-filled** (`src/engine/autoFill.ts`) from the user's last real
  record of that document, or from the filled specimen in the source file when there is no history —
  operators, machines, batch numbers, job lists, hourly readings, checkers, trap counts. It never
  signs, submits or verifies anything: a person does that.
- **The records read like a real plant's, not like a demo.** A year in which every reading sits on
  nominal, every check point says Yes and every lot is Accepted is the first thing an auditor
  disbelieves — what they look for is the exceptions and what was done about each. So the readings
  follow a behaviour model measured from the company's own filled specimens
  (`tools/plant_pattern.py` → `src/data/seed/plantPattern.ts`, applied by
  `src/engine/plantSimulation.ts`): mostly in control, with the occasional drift episode that takes
  a reading out of the printed band — and every one of those carries its consequence, whether that's
  the operator's remark beside it, the Summary of Actions row against a flagged check point, the
  reason beside a lot held on deviation, or a corrective action with a target date. The wording of
  the pest-control findings is the company's own, from its Dec-2023 GAP report. Anything the model
  flags is put in the first line of the record's notes — "Check this before you submit…" — so it is
  confirmed by a person, never quietly signed off. Every value is deterministic per date, so an
  auditor who comes back to 14-Aug finds exactly the record they saw. See REQUIREMENTS §25.
- **Every record can be corrected — by hand or by asking the assistant — and nothing is lost.**
  - *While a record is a draft* every field is editable and **saves itself** a moment after you type
    ("All changes saved" beside the buttons), so there's no Save button to forget and leaving the page
    loses nothing.
  - *Once it's submitted or verified* it's locked, and offers **Correct this record**: pick or type a
    reason, and the record reopens — a banner says who reopened it and why — you make the change, and
    it goes through Submit and verification again. A verified record is never changed quietly.
  - *Every change is recorded*: each record has a **Record history** listing every edit field by field
    (before → after), every submit, verification, rejection and correction, and who did it. That is
    what makes a correction a correction and not a rewrite.
  - *The assistant can make the change for you*: say or type it — "14:00 viscosity is 20.4",
    "check point 3 is no", "PC-05 count is 3", "customer sign is Kapila Barad", "Akash Patel attended".
    Common changes are understood instantly with no network; anything else goes to the AI. Every
    change is checked first (a word can't go into a number, "OK" can't go into a Yes/No, a printed
    time slot can't be moved), saved, listed back to you, and can be **undone**. On a signed-off
    record it asks before reopening it, and records your words as the reason.
  - *Master Data* rows (chemicals, fly catcher locations, rodent stations, employees) are corrected in
    place, and deleting one takes two taps. The service provider's licence and the Statements of
    Compliance stay read-only: they are issued documents, reproduced exactly. See REQUIREMENTS §27.
- **On login the assistant greets the user with a briefing**: what it filled in and why, what still
  needs a detail only a person knows, what is waiting for a verifier, what is coming up, and any
  compliance statement due for re-issue. Each prepared record can be viewed or submitted in one
  click ("Submit all" for the lot); each record page shows a "Your assistant has filled this in"
  banner with the exact notes. The briefing can be reopened from the top bar at any time.
- Prepared records stay **In Progress** — nothing is recorded as a person's until they press Submit,
  and verification is still a separate human step. See REQUIREMENTS.md "How the assistant pre-fills
  records" for the full rules.
- **When the briefing shows itself** (working day 09:00–18:00 by default, Master Data → Working Hours
  & Briefing): the very first time a browser opens the app; once in the **first hour** of the day
  ("here's what I've prepared"); and once in the **last hour** — only if something is still
  unsubmitted ("before you go"). Otherwise it's a click away in the top bar. Each section lists the
  first dozen items and says "…and N more" — "Submit all" still covers everything — so it opens
  instantly however big the backlog is. Records dated before the browser's launch date are treated as
  generator leftovers: never listed, never reminded about, offered as a one-click clean-up instead.
- **The assistant is a chat, present on every screen.** Message bubbles, quick-reply buttons and a
  text box — no wall of status text. Free text like *"show me all reports of August"*, *"open CAPA"*,
  *"what happened on the 15th"* or *"take me to the lamination QC documents"* navigates you straight
  there; on an open record, *"checker is Ramesh, time 9:15"* fills it in. Quick buttons always offer
  today's briefing, what's due today, this month's reports and CAPA. One endpoint,
  `POST /api/assistant/chat` (`backend/assistant.ts`, calling Groq — see **Configuration** below),
  classifies each message as `fill` / `navigate` / `reply`; a route the model proposes is re-validated
  against a strict allowlist (`isValidAppRoute`, `src/store/router.tsx`) before the app ever
  navigates to it, so a bad or hallucinated destination just falls back to a plain reply.
- **CAPA has two doors — Internal and External — and the assistant walks you through External.**
  Internal is the pest-control inspection-findings report (the Dec-2023 GAP report lives there).
  External is the Customer Complaint Handling Checklist (F/MKT/05, from "Updated Checklist.doc").
  Opening a new complaint starts the assistant automatically: it asks for the customer and complaint
  details, then goes through Section A → B → C → D → E one activity at a time ("Done today", "Done on
  a date…", "Not required", "Skip", or just type what happened — "got the samples on the 3rd" is
  understood), and finally asks *"Shall I submit it for approval?"*. Prepared By is stamped with the
  logged-in user; the approver then sees it and can approve (Verify) from the same chat, which stamps
  Approved By. Quick-reply answers never need the network; typed answers go through Groq and fall
  back gracefully. See `src/engine/guidedChecklist.ts`.
- **The sidebar is organized module-by-module, collapsible, and can be closed altogether** — Pest
  Control, CAPA, Lamination — Quality Control, Lamination — Production, Quality Control — Inspection
  Records, and Quality — Compliance each carry their own icon and expand/collapse independently; a
  module you close stays closed until you open it again (remembered per browser), and one control
  collapses or expands all six at once. The module holding the page you're on stays marked with a dot
  even while shut. The whole panel closes from the **×** in its header or the button at the left of
  the top bar — useful when a wide register wants the full window — and comes back from that same
  button; that choice is remembered too. On a narrow window or tablet it becomes an overlay drawer
  instead, dismissed by the backdrop, Escape, or picking a link. Modules without their own list page
  link into Document Library pre-filtered to just that module (`/library/{module-slug}`).
- **The Pest Control module is laid out the way the department reads its paperwork** (`/pest-control`
  overview, `src/pages/PestControlPages.tsx`): **Daily Report** — the Daily Pest Control Monitoring
  Record as a month register (`/pest/daily`); **Service Reports** — Gurudev Pest Control's three
  fortnightly visit reports, Rat / Mice (Rodent Control Service), Ants & Cockroaches (General Pest
  Control Services) and Fly Control (`/pest/service/{rodent|general|fly}`), each with last visit,
  next due, materials and areas; **Trend Analysis** — the Rodent Catch Report and Trend Analysis and
  the Fly Catcher Infestation trend (`/pest/trend/{rodent|fly-catcher}`). Both are reproduced in the
  company's own printed formats, filled from the records: the **Rodent Catch Report and Trend
  Analysis** exactly as on "trend analysis .pdf" (two-line header, one row per year — Source / Unit /
  Target Pest / YEAR / JAN–DEC / Total — and the "Number or Quantity Trapped" bar chart), each month
  added up from the Daily Pest Control Monitoring Records where the register holds it and taken from
  the paper report before that; and the **Fortnightly Fly Catcher Inspection & Cleaning Record
  (F/HR/18)** as its two-page monthly register exactly as on "Fly catcher reports .pdf" (Month &
  Year, the PC location legend, PC-01–08 on page 1 and PC-09–13 on page 2, one line per unit per
  visit, dates written d/mm/yy and tube-light dates dittoed down). The same two sheets also sit
  beside the services they belong to, on the Fly Control and Rat / Mice service pages; **Training & Reference** — Training
  Records, Chemical Master, SOP. The assistant navigates there from plain speech ("show me the rat
  reports", "fly catcher infestation for this year").
- **The F/HR/18 register can be filled in for any Month & Year, where it stands.** Pick the month and
  year above the register (Pest Control > Trend Analysis > Fly Catcher Infestation, or the Fly Control
  service page): **Add visit** puts a visit on that month's register for the date it was carried out —
  a paper register from before go-live copied in, or an extra inspection — carrying the tube-light
  dates and names forward from the visit before it; **Edit register** turns every draft visit's cells
  into inputs that save themselves a moment later, each change going into that visit's history. A date
  outside the month, a date still to come or a second visit on one date is refused with the reason; a
  visit already submitted or verified stays locked (grey) and is corrected from its own page
  (`src/engine/flyRegister.ts`, `src/components/records/FlyCatcherRegisterSheet.tsx`).
- **Service reports: material and method are fixed, the quantity is entered once.** On the Rat / Mice,
  Ants & Cockroaches and Fly Control reports, Material Name and Method of Application are fixed text for
  each area (the SOP / Chemical Master values). The quantity is typed on the first line and every other
  line with the same material carries it — the April-2026 specimens write it once, on the first row. The
  one bait area on the Rat / Mice report (Bromadiolone Cake, in grams) is the first line of its own
  material and keeps its own quantity. The assistant follows the same rule (it won't change a material;
  "quantity is 4" sets every line), and drafts written before the rule are brought into line at
  start-up, with the change logged (`src/engine/serviceMaterials.ts`).
- **Printing prints the document, nothing else.** Every Print button — a record's "Print Original-Style
  Record", the registers, the report sheets, the licence, a Statement of Compliance, Document Files, and
  new Print buttons on the SOP and the Chemical Master — and the browser's own Print / Ctrl+P print only
  the document on the screen: no page title, explanations, stat tiles, banners, tabs, history or
  buttons. A register being edited prints as the paper form; a demo printout keeps its DEMO band
  (`src/utils/print.ts`; each document is marked `data-print-doc`).
- **Every document has an Edit button — for a mistake by the assistant or by a person.** A draft is
  edited directly (it saves itself). A record already submitted or verified shows **Edit**: pick a
  reason (the first one offered is "The assistant filled it in wrong"), change anything on it, Submit —
  it goes for verification again, and its history keeps what it said before. A rejected record's
  button is **Edit** too. The reference documents are editable in place as well: the **SOP**, the
  **Chemical Master** and each **Statement of Compliance** have Edit / Save / Cancel, and a corrected SOP
  or statement keeps a "Restore the original" button and says who edited it and when
  (`src/data/repositories/referenceRepository.ts`). The service provider's licence stays exactly as
  issued, on the owner's instruction. The service report no longer shows the Chemical Master suggestion
  box.
- **Two languages — English and ગુજરાતી — chosen on the Dashboard.** Choosing ગુજરાતી switches
  **Google Translate** on automatically for the whole website: every page, menu, list, message and the
  assistant's chat turns Gujarati as it appears, including text that changes afterwards. Choosing
  English switches it off — the page reloads in the original English, on the same screen, with
  nothing lost (records save themselves). Remembered per browser (a reload stays Gujarati) and also
  reachable from the top bar. Nothing is sent to Google while English is chosen. If Google can't be
  reached (no internet), Gujarati falls back to the app's own built-in Gujarati and says so. What
  deliberately does **not** translate is the controlled documents' own text — every form and
  register, format numbers (F/HR/17), the printed check points transcribed verbatim from the paper
  form, the SOP, the licence and its terms, the Statements of Compliance — and people's and
  master-data names, because translating a controlled record's wording would break the traceability
  the system exists to provide (those parts are marked `translate="no"`, so they aren't sent to
  Google either). (The Gujarati F/QC/13 in-process sheet stays Gujarati either way.) Ask the
  assistant something in Gujarati and it answers in Gujarati.
- **The assistant listens and talks.** Press the microphone on the Assistant page (or in the floating
  widget) and speak — the browser's own speech recognition turns it into text, which then follows
  exactly the same path as anything typed, so nothing is sent anywhere extra. **It waits until you
  have finished the whole sentence**: your words appear in the composer as you speak, a pause to think
  mid-sentence does not send anything, and the question goes only after you have actually stopped
  talking (2.5 s of silence) — or the moment you press **Done**, which sends what you have said rather
  than throwing it away. A question asked out loud is answered out loud; the speaker button turns that
  on for typed questions too. Both follow the chosen language (Indian English or Gujarati). Chrome and
  Edge support it; where a browser doesn't (Firefox), the button says so instead of failing silently.
  Listening is always press-to-talk — the microphone is never left open, and it is released when you
  leave the page.
- **The assistant only answers about this software.** It is a tool for operating this record system,
  not a general chatbot: ask it something outside the system — general knowledge, news, weather, a
  joke, a poem, coding or medical/legal advice — and it politely declines and offers what it can do
  here instead, without answering the question even partially. That rule is enforced twice: a hard
  SCOPE block in the model's system prompt (`backend/assistant.ts`), plus a small client-side list of
  unmistakably-general phrasings declined instantly with no network call
  (`offTopicReply`, `src/engine/assistantLocal.ts`). Greetings and "what can you do?" are still
  answered warmly — and questions about the plant's own work are, of course, in scope.
- **Document Files — every record filed like a file system, for exactly the dates you ask for.**
  Ask the assistant "i want all documents of pest control module from June to August" (or "from 3
  June to 17 July", "November to February", "all documents from 1 to 5 August") and it opens
  `#/files/{module}/{from}/{to}`: a folder per module, a folder per document, a folder per month,
  and one dated file per record — only inside that span, never the whole calendar of the month.
  Month to month means the 1st of the first month to the last day of the last; "November to
  February" runs into the next year. Folders narrow the list, From/To boxes change the span, a file
  opens its record (to view or correct it), and the list exports to CSV or prints. Also in the
  sidebar as **Document Files** (`src/pages/FileBrowserPage.tsx`, `src/engine/fileScope.ts`).
- **The assistant lists a document's records for exactly the date span you name** — "I want documents
  of daily pest control monitoring record from 1 to 19 January", "pest control records for this
  week", "fly catcher documents for September". Answered locally (`src/engine/assistantLocal.ts`), so
  it's instant: an explicit day-to-day span (even shorthand like "1 to 19 January", month stated once)
  lists only those days, never a whole month unless that's what was asked (a bare month name, or
  "this/last/next month", does list the whole month); the document or module you name (over 30
  recognised aliases, falling back to the whole module — "pest", "lamination" — when you don't name
  one document) scopes which records show. Only fires when both a document/module and a date are
  named, so plain navigation phrasing ("show me all reports of august") is untouched and still goes
  to the model.
- **The assistant also has a screen of its own** — **Assistant** in the sidebar (`/assistant`,
  `src/pages/AssistantPage.tsx`): a ChatGPT-style page with your conversations on the left, the thread
  in the middle, suggested questions when a chat is empty and a composer at the bottom (typed or
  spoken — see the voice bullet above). Conversations are kept in the browser, so a chat
  survives the assistant taking you to another screen. Calendar and workload questions ("is Thursday a
  holiday?", "next company holiday?", "adjustment days?", "what's due today?", "my briefing") are
  answered instantly on the client from the app's own data (`src/engine/assistantLocal.ts`); everything
  else goes to Groq with a short digest of live facts attached (today's working-day status, the weekly
  off, upcoming holidays, what's due), so the model answers from real data.
- **The company's working calendar is built in** (`src/engine/holidays.ts`, Master Data → Holidays):
  **Thursday is the weekly off**, the 13 festival holidays and the five adjustment (working)
  Thursdays come straight from the Gujarat Print Pack Leave Calendar 2026 in the zip. On a closed day
  the Daily Pest Control Monitoring Record is pre-marked as a holiday, no lamination log sheet is
  expected, no reminder fires, and a fortnightly / monthly / quarterly / yearly record that lands on it
  is due the next working day instead of disappearing. The Record Calendar, Day View and Dashboard
  all say which kind of day it is. Records an earlier build left on a closed day are brought into line
  at start-up (moved to the next working day, re-marked as a holiday, or dropped — only ones nobody
  has worked on), and a seeded holiday or adjustment day you delete in Master Data stays deleted.
- **The Daily Pest Control Monitoring Record is shown in its own F/HR/17 layout** — the company's
  three-page monthly register exactly as the blank format in the zip prints it
  (`src/components/records/DailyRegisterSheet.tsx`): page 1 the header, the two instruction lines and
  the ten check points; page 2 dates 1–19; page 3 dates 20–31 and the Summary of Actions Taken if
  Pest Observed. Each row is that day's record (Yes / No per check point, the trap count in column 4,
  the number of pests trapped in column 7, HOLIDAY written across a closed day, time of checking,
  checker); click a row to open the day. It is the default view of Pest Control > Daily Report, the
  Reports > Daily Monitoring Summary tab, and prints as three pages; the original blank pages can be
  shown alongside for comparison.
- **The service provider's insecticide licence is on file, unchanged** — Gurudev Pesticides'
  Government of Gujarat Form III licence (`/licence`, Pest Control > Training & Reference). The
  supplied PDF is held byte for byte and opens from the page ("Open the original PDF"); the two pages
  shown on screen are that same file page for page, with a verbatim transcription (registration and
  licence numbers, expert staff, the terms and conditions as printed) beneath them for reading and
  search only.

## What's implemented

**Documents (22 configured):**

- Pest Control (9), in the module's four groups — *Daily Report*: Daily Pest Control Monitoring
  Record (F/HR/17). *Service Reports*: Rat / Mice (Rodent Control Service), Ants & Cockroaches
  (General Pest Control Services), Fly Control Services — the three reports in the April-2026
  service-report workbook. *Trend Analysis*: Fortnightly Fly Catcher Inspection & Cleaning Record
  (F/HR/18), which feeds the Fly Catcher Infestation trend (the Rodent Catch trend is computed from
  the daily record). *Training & Reference*: Training Record (**Yearly**, with both the Dec-2025
  technician certificate and the 24-Dec-2025 awareness programme loaded as history), Chemical
  Master, SOP, and Gurudev Pesticides' Government of Gujarat insecticide licence (Form III, kept as
  the scanned pages, unaltered, plus a transcription). (A Lizard Control service-report variant that existed earlier was retired — no
  specimen for it exists in the uploaded files; the SOP's lizard section is still in SOP Reference.)
- CAPA (Corrective & Preventive Action) (2): **Internal** — Pest Control Inspection Findings Report
  (the Dec-2023 GAP report as history); **External** — Customer Complaint Handling Checklist
  (F/MKT/05, Rev 00 / 21.07.2026): 31 activities in five sections A–E plus Prepared-by / Approved-by,
  filled conversationally by the assistant.
- Lamination — Quality Control (3, from the photographed registers in "Audit documents.zip"):
  Lamination Adhesive Viscosity Record (F-QC-30, 24 hourly readings), Adhesive Mixing Ratio Record
  (F-QC-32), Temperature Monitoring Record — Hot Room (F-QC-40.C).
- Lamination — Production (2): Solvent Base Lamination Process Parameter Record, ALC & Production
  Report (F-PRD-18).
- Quality Control — Inspection Records (4): Pouching Process (F/QC/37), Slitting - Lamination Grade
  Film (F/QC/35), Lamination Grade Printed Film (F/QC/34) and the Gujarati In Process Quality Control
  sheet for printing (F/QC/13). Fixed printed test parameters with read-only specifications; the
  assistant carries observations, grades, lot status and the inspector's sign forward; "Approved by /
  QA Manager" is the Verify step, not a box to type in.
- Quality — Compliance (2): Statements of Compliance for Pressure Labels (F/QC-09) and Flexible
  Packaging (F/QC-38), with validity tracking (two years from publication).

All grid-shaped registers share one generic **log-sheet** renderer driven by a layout registry
(`src/data/seed/logSheetLayouts.ts`) — a new register is a layout entry plus a DocumentDefinition
row, no new component.

**Previously delivered (unchanged):**

- **Document → Frequency → Date → Record** core model, driving Dashboard, Document Library,
  Calendar (month view) and Day View.
- **Six digitized document types**, each reproducing its source format's header, fields and
  tables rather than a generic form:
  1. Daily Pest Control Monitoring Record (F/HR/17) — 10 checkpoints, daily.
  2. Fortnightly Fly Catcher Inspection & Cleaning Record (F/HR/18) — PC‑01…PC‑13.
  3. Pest Control Service Report — Rat / Mice (Rodent), Ants & Cockroaches (General Pest) and Fly
     Control variants.
  4. GAP / Corrective Action report (with the real Dec‑2023 findings loaded as history).
  5. Training Record (with the real Dec‑2025 technician certificate loaded as history).
  6. Chemical Master (Pesticide Application Chart) + SOP reference.
- **Frequency engine** (Daily / Weekly / Fortnightly / Monthly / Quarterly / Yearly / As Required)
  that generates due record shells automatically and idempotently.
- **Record lifecycle**: Scheduled → Due → In Progress → Submitted → Pending Verification →
  Verified, with Rejected → Resume → Resubmit, and validation that blocks Verified without the
  required sign-off.
- **Demo Mode**: one-click synthetic month generation, always watermarked
  "DEMO / SYNTHETIC DATA — NOT AUDIT EVIDENCE", fully isolated from Live data (`isDemo` flag).
- **Reports**: Monthly summary, Daily Monitoring register view (with a Rodents column — count, box,
  location per day), **Rodent Catch Report and Trend Analysis** in the company's own Source / Unit
  / Target Pest / Year / Jan–Dec / Total layout (their reported 2024–2026 history alongside the
  digital total, a bar chart, and where-found / which-box breakdowns), Fly Catcher Trend, Chemical
  Usage, CAPA Status, Training Status, **Lamination QC** — all computed from stored data, with CSV
  export and original-style print.
- **Pest patterns**: the Daily Pest Control Monitoring Record's pre-fill (and Demo Mode) follows a
  generated seasonal rodent-catch pattern — mostly quiet days, a few catches a year clustered in the
  monsoon, each with trap box, location and number of rodents — and the Fly Catcher record's counts
  follow a seasonal per-unit fly pattern (busy entrances and dispatch gates in the monsoon, near-empty
  boards in winter). Both are produced by `tools/pest_pattern.py` (Python + numpy; rodents calibrated
  against the company's reported 0 / 2 / 0 rodents for 2024 / 2025 / Jan–Jun 2026, flies against the
  August-2026 F/HR/18 specimen) into `src/data/seed/pestPattern.ts`, and applied deterministically per
  date by `src/engine/rodentPattern.ts` / `flyPattern.ts`. Answering Yes to checkpoint 7 by hand opens
  the same catch-details table.
- **Master Data** screen (Employees, Chemicals, PC IDs, Rodent Stations, Areas, Checkpoints,
  Documents) seeded from source, editable for the fields safe to edit in a prototype.
- **Global search** across records, dates, PC IDs, employees, status.
- Local persistence (see **DEPLOYMENT.md** for why LocalStorage and how to move to a server DB).
- **Accounts**: real signup/login (`backend/`, a small Express + SQLite service) gates the app —
  no more free-text "Acting as" dropdown. Passwords are bcrypt-hashed, sessions are a signed JWT
  in an httpOnly cookie, and every submit/verify/reject action now records the actual logged-in
  user. The first account created on a fresh install becomes `admin`; every later signup is
  `staff`. See DEPLOYMENT.md for how this is deployed alongside the static frontend.

## Quick start

Needs **Node.js 23.6+** (the backend and scripts are TypeScript run directly by Node — no compile
step) and Python 3 with Playwright for the browser tests. The whole repository is TypeScript + Python;
there is no plain JavaScript.

```bash
npm install
npm run dev       # frontend (http://localhost:5173) + auth API (http://localhost:4000) together
```

Open `http://localhost:5173` and sign up — the first account becomes an administrator. For a
single-process production build:

```bash
npm start         # builds frontend/dist/ then serves it + the API from one Express process
```

See DEPLOYMENT.md for LAN pilot instructions and what still lives in the browser (`localStorage`)
vs. the server (accounts).

## Configuration

`backend/.env` — one required key:

```
GROQ_API_KEY=...          # powers the assistant (fill / navigate / reply) — see backend/groq.ts
GROQ_MODEL=...             # optional override; defaults to a model this key actually has access to
                            # (check with GET https://api.groq.com/openai/v1/models if you swap keys —
                            # not every model name commonly seen in Groq docs is enabled per-account)
```

Without `GROQ_API_KEY` set, every screen still works — only the assistant widget's replies fail
(with a clear "isn't configured yet" message), never silently.

## A note on the build toolchain

This prototype was built in a sandboxed environment with **no access to the npm/PyPI package
registries or any CDN** (an infrastructure constraint of the build environment, discovered at
the start of this build — see DEPLOYMENT.md for the full explanation). React, TypeScript and
Playwright were available locally; Vite, Tailwind CLI and react-router-dom were not and could
not be installed. The app is therefore built with **esbuild** (already present on disk) instead
of Vite, and styled with a small hand-written CSS design system instead of Tailwind, with a
minimal hand-rolled router instead of react-router-dom. None of this affects the architecture
the master prompt asked for — component structure, the data layer, and the document-template
approach are unchanged — and every substitution is a mechanical, later swap (documented in
DEPLOYMENT.md) once this project is built somewhere with normal registry access.
