# DATA_MODEL.md — Architecture & Data Model

## Layered architecture

```
components/ pages/          UI — reads repositories directly (cheap, localStorage-scale),
                              writes go through engine/ functions, never touch storage directly.
        │
engine/                     Frequency engine, recurring-record generator, validation,
                              lifecycle transitions. Pure functions over the types below.
        │
data/repositories/          One repository per collection: documentRepository, masterRepository,
                              recordRepository, settingsRepository. This is the ONLY layer that
                              knows the storage key names.
        │
data/storageAdapter.ts      IStorageAdapter interface + LocalStorageAdapter (+ MemoryStorageAdapter
                              fallback). readJSON/writeJSON helpers.
        │
        ▼
   localStorage (namespaced "dcrs:v1:*")
```

**Why this shape, and how to swap storage later** (section 39's explicit requirement): every
repository method is storage-agnostic — `documentRepository.getAll()`, `recordRepository.query(filter)`,
etc. To move to a real database, replace `LocalStorageAdapter` with e.g. a `RestApiAdapter` or a
`SqliteAdapter` implementing the same 4-method `IStorageAdapter` interface (`getItem/setItem/
removeItem/keys`), or — for a proper multi-user backend — replace the repository internals with
`fetch()` calls against a REST/GraphQL API using the exact same method signatures. **Nothing above
the repository layer needs to change.** No component, page or engine function imports
`storageAdapter.ts` directly.

## Document-template architecture (section 40)

Rather than one JSON-schema-driven universal renderer (over-engineering for 6 concrete formats
in a 1-week prototype) or six fully independent hardcoded pages (which would not scale to 141
formats), this prototype uses a **middle-ground, metadata-driven registry**:

- `DocumentDefinition` (`src/types/document.ts`) is master/config data — Format No., Revision,
  Frequency, `ScheduleConfig` — one row per controlled format. Adding the next of the ~141
  formats starts here.
- `DocumentKind` (`src/types/common.ts`) maps a definition to **one renderer component** — new
  structures (e.g. a Quality lab test report) get a new `kind` + one new `*RecordView.tsx`
  component + one new payload type in `src/types/record.ts`; structures that are shape-compatible
  with an existing kind (e.g. a 4th or 5th Service Report variant) need **zero new code** — just
  another `DocumentDefinition` row with a different `variantKey`.
- Every renderer shares the same building blocks: `DocumentHeader` (company/title/Format/Rev/Date
  block), `StatusBadge`, `DemoTag`, `RecordActionBar` (Save/Submit/Verify/Reject/Print), and the
  `.doc-table` / `.doc-header` CSS primitives — so a new document type is visually consistent
  "for free."
- The **frequency engine** (`engine/frequencyEngine.ts`), **record generator**
  (`engine/recordGenerator.ts`), **validation** (`engine/validation.ts`) and **lifecycle**
  (`engine/recordLifecycle.ts`) are all generic over `DocumentDefinition` + `RecordInstance` —
  they do not special-case individual documents except where a document's *validation rules*
  genuinely differ (e.g. Service Report requires a customer signature to verify; GAP requires
  every finding closed).

See FUTURE_ROADMAP.md for how this scales concretely to Phase 2/3 (~95 more formats).

### The generic `log-sheet` kind (second batch of documents)

The five lamination registers from "Audit documents.zip" are all "header fields + a grid" forms, so
instead of five renderers there is one: `DocumentKind "log-sheet"` renders through
`LogSheetRecordView.tsx` using a **`LogSheetLayout`** looked up by `DocumentDefinition.id` in
`src/data/seed/logSheetLayouts.ts`. A layout declares the header fields, the columns (type, unit,
acceptance band `min/max/nominal`, required, fixed), how rows are created (`free` / `timeSlots` /
`single`), the specimen rows from the source photo, and per-column **auto-fill behaviour** (sign,
carry-forward, jitter, default). Payload is `LogSheetData { header, rows[] }`. Validation
(`validation.ts`) and the assistant (`autoFill.ts`, and the field guide in `backend/assistant.ts`,
run through Groq) are generic over the layout, so a sixth register is one layout entry +
one DocumentDefinition row. The sixteen Human Resources formats (REQUIREMENTS §46) are exactly that:
`src/data/seed/hrLayouts.ts` holds their layouts (`HR_LAYOUTS`, merged into `LOG_SHEET_LAYOUTS`), and
`src/data/seed/hrRecords.ts` the filled registers among them as seeded LIVE `RecordInstance<LogSheetData>`
(`SEED_HR_RECORDS`, spread into `SEED_HISTORICAL_RECORDS`) — one record per register, or per position
for the Job Responsibility & Authority sheets, with `periodKey` = `{documentId}:{dueDate}`.
`src/data/seed/hrModule.ts` (`HR_RECORD_PAGES`) gives each of the sixteen its page slug, group and
sidebar label: `/hr` is the HR Records overview (`pages/HrPages.tsx`) and `/hr/{slug}` a format's own page
(`pages/DocumentRecordsPage.tsx`, also served at `/document/{id}` for every other log sheet), reading the
same `recordRepository`. `engine/documentRoutes.ts` (`documentOpenRoute`) is where the Document Library's
Open Document goes for every kind.
A new joiner from a CV (REQUIREMENTS §49) adds no stored type: `POST /api/hr/cv/read` (raw file body,
`backend/cvExtract.ts`) answers a `CvReadResult { profile: CvProfile, fileKind, readBy, missing }` and keeps
nothing; `engine/hrJoiner.ts` turns the checked `NewJoiner` into ordinary `LogSheetData` changes — a row
appended to the register on file (the newest issue with lines in it) or a new record started — through
`reopenForCorrection` and `saveDraft`, so each change carries the usual correction and history entries. `compliance-statement` is a second new kind: reference-only, content in
`complianceStatements.ts`, with a validity date the briefing tracks.

## The assistant: auto-fill + briefing

```
bootstrap() / Dashboard mount / login popup
        │
        ▼
engine/assistantPrepare.ts  prepareDueRecords()
        │  for every Live record due ≤ today still in Scheduled/Due (never In Progress —
        │  that's a person's partial work) and not yet `prepared`:
        ▼
engine/autoFill.ts          autoFillRecord(doc, dueDate, master, previousConfirmedRecord)
        │  carry forward → else specimen; readings, check-point findings, lot decisions,
        │  grades and the day's job list come from engine/plantSimulation.ts (the plant
        │  behaviour model, DATA_MODEL "The plant behaviour model" below); every value from
        │  a seeded PRNG so it is stable across reloads and devices; returns
        │  { data, notes[], basedOn } with anything the model flagged first in notes
        ▼
RecordInstance.prepared = { at, by: "assistant", notes, basedOn }, status "In Progress"
        │
        ▼
engine/assistantBriefing.ts computeBriefing(): ready (passes validateForSubmit) / needsInput /
                            overdue (unpreparable kinds, e.g. CAPA) / awaitingVerification /
                            upcoming / compliance renewals; submitPreparedRecords() re-validates
                            each record before submitting.
        ▼
AssistantBriefingPopup (once per session, reopenable via a window event from the top bar,
dashboard card and assistant widget) · PreparedBanner on each record · "Prepared" chips.
```

`prepared` is kept after submission so the audit trail reads "prepared by assistant, submitted by
<user>". Demo Mode reuses `autoFillRecord` for log sheets and training, so demo data looks the same
as prepared Live data (still `isDemo: true`).

Two further fills happen only when a person asks for them in the chat (REQUIREMENTS §36), and both
write nothing new to the model — each is an ordinary `history` entry of action `"assistant-edit"`:

- **Question by question** (`engine/guidedRecord.ts`): one entry per answer, note `"Q&A — <field>"`
  (consecutive ones by the same person fold into one, as any edit does).
- **Sample data** (`engine/sampleFill.ts`): one entry, note `"Filled with sample data by the
  assistant, on request — realistic, but made up"`. The record is deliberately not stamped
  `prepared` and carries no watermark — it is meant to read like a real one — so that history line
  is the only, and sufficient, record of where the values came from. The routine registers reuse
  `autoFillRecord`; the CAPA paperwork, training and the agreements have their own generators there.

## The plant behaviour model

`tools/plant_pattern.py` → `src/data/seed/plantPattern.ts` (generated) → `engine/plantSimulation.ts`
(applied). It decides the things a record can only get from watching the plant: how far a reading
moves and how often it leaves the printed band, which check points get flagged and in what words,
how a lot is dispositioned, what grade a printed sheet gets, which jobs ran, who signed and when,
and when a finding was closed. REQUIREMENTS §25 documents the calibration; the shape of the API:

```ts
readingFor(documentId, dateISO, col, rowIndex, rowCount) → { value, outOfBand }
excursionRemarkFor(documentId, dateISO, columnKey)       → { remark, action } | null
checkpointFindingsFor(dateISO)                           → { no, description, action, remarks }[]
lotOutcomeFor(documentId, dateISO)                       → { status, reason }
jobsFor(dateISO)                                         → JobRun[]   (PO, times, set-points)
serviceRemarkFor(variantKey, areaName, dateISO)          → { remark, finding? }
lifecycleFor(doc, dueDate, submitter, verifier, today)   → status + submitted/verified/rejected stamps
findingScheduleFor(seed, observedOn, today)              → { targetDate, actualDateOfAction, status }
```

Two rules make it safe to build records on. **Deterministic**: every value comes from a seeded PRNG
whose seed names exactly what it decides (`reading|qc-viscosity|viscosity|2026-08-14|11`), so the
same date reads the same way on every device and after every regeneration. **Independent streams**:
each concern draws from its own seed rather than one shared sequence per record, so adding a value
in one place cannot silently re-roll every other value — which the single shared stream in
`autoFill.ts` would otherwise do.

Readings drift in *episodes* rather than isolated spikes, because that is what the specimen shows
(F-QC-30's four highest readings are consecutive, 11:00–14:00). `episodeFor` decides once per
(document, column, date) whether the day drifts and over which rows; the per-row value is then
normal noise around nominal plus that day's shift. A reading that lands outside the band is
recorded as-is, `outOfBand` is returned, and the caller must deal with it — `explainExcursions`
writes the operator's remark where the printed form has a Remark column, and `describeExcursions`
puts a "Check this before you submit…" line at the top of the record's notes.

What is *not* modelled as a reading: machine set-points and weighed set quantities. The specimen
repeats the same 3.00 / 2.00 / 45 and the same 15 / 1.65 / 19.5 row after row because they are
settings, so they are copied exactly and what differs between records is the job that ran. Jittering
them was also a random walk — each day centred on yesterday's jittered value — which wandered into
the band edges within a few weeks and put a spurious excursion remark on most sheets.

## Correcting a record: history, reopening, and checked edits

```
edit (form or assistant) ──► saveDraft(record, data, actor, {action, note, labels})
                               └─ withEditHistory: diffRecordData(before, after) → FieldChange[]
                                  appendHistory (folds quick edits by the same person)
submit / verify / reject / resume ──► the same functions as before, each appending an entry
Submitted | Pending Verification | Verified | Rejected
        ──► reopenForCorrection(record, actor, reason)  → In Progress + record.correction
                                                           (.correction.dataBefore = the data as it was)
        ──► (edit) ──► submitRecord clears .correction, stamps a "resubmitted after correction" entry
        ──► cancelCorrection(record, actor, labels) → back to .correction.fromStatus, data restored,
                                                       .correction cleared, "correction-cancelled" entry
```

`RecordInstance.history: HistoryEntry[]` is append-only — `{ id, at, by, action, note?, changes?,
moreChanges?, fromStatus? }` with `action` one of prepared / edited / assistant-edit / submitted /
verified / rejected / resumed / reopened / correction-cancelled. `FieldChange { field, label, before, after }`: `field` is a
stable path whose array elements are keyed by their own `id` (so inserting a row doesn't mark every
row below it as changed); `label` is what a person reads. `historyOf(record)` returns the history, or
a timeline reconstructed from the envelope's stamps for records saved before the field existed.
`RecordInstance.correction { reason, by, at, fromStatus, dataBefore? }` is set while a signed-off
record is being corrected; `dataBefore` is what the record said when Edit reopened it, which is what
**Cancel edit** (`cancelCorrection`) puts back — status and data together — for the common case of
reopening a record and finding nothing to correct. Submit and Cancel both clear the whole correction,
so the copy is only held while one is open.

Every change the assistant makes — whether from the model or from a plain-words sentence
(`parseLocalEdit`) — goes through `applyAssistantPatch(kind, documentId, current, patch)` in
`engine/recordPatch.ts`, which returns `{ data, problems }` and never mutates its input. A patch holds
top-level fields (objects such as `header` and `checkpoints` are merged key by key) and/or
`itemEdits: [{ collection, match, set }]`, which change exactly one matching item (or refuse, if none
or several match; `__row` matches by position). Log-sheet values are typed by the layout column
(number / yesno / select / time / date); other fields by what they hold. The page's `AssistantTarget`
then decides: `editable` → `commit(next, note)`; otherwise, with the user's go-ahead, `reopen(reason)`
first.

## Company-format sheets are views, never copies

The printed formats that span many records are rendered over those records, not stored:

- `components/records/DailyRegisterSheet.tsx` — F/HR/17, a month of daily records.
- `components/records/FlyCatcherRegisterSheet.tsx` — F/HR/18, a month of fortnightly visit records
  (one line per unit per visit; each visit record holds all 13 units' entries for its date).
- `components/reports/CatchTrendSheet.tsx` — the Rodent Catch Report and Trend Analysis layout, fed
  `TrendRow`s by `data/selectors.ts`:
  - `rodentTrendRows(isDemo)` takes each month from exactly one source — the digital F/HR/17
    register when it holds that month's days (a day counts once it is actually filled in), else the
    paper figures in `RODENT_HISTORY_REPORTED`, else null (blank; every future month is blank).
    `fromRegister[]` records which, and drives a screen-only tint so a computed figure is always
    distinguishable from a transcribed one.
  - `flyTrendRows(isDemo)` adds up the F/HR/18 visits (there is no paper history for flies).

A sheet line opens its record, where it is edited. The F/HR/18 register can also be filled in where
it stands (Add visit / Edit register): `engine/flyRegister.ts` adds a visit record for a date in the
chosen month — keyed by the schedule slot it fulfils when it falls on one, so the generator never makes
a second — and the register's inputs write through the visit's own `saveDraft`, so each change is in
that visit's history. It is still one record per visit, never a stored copy of the sheet. The
tube-light dates are two fixed constants — installed 24-11-2025, due 23-11-2026, every unit together
(`TUBE_LIGHT_INSTALLED` / `TUBE_LIGHT_DUE`, `engine/flyPattern.ts`) — pre-filled on a new sheet and
never computed from a service date. REQUIREMENTS §44.

### The three trend reports

`data/seed/trendReports.ts` holds the company's own transcription of all three pages of its trend
file - the rodent, lizard and flies reports - together with each page's header wording (title, Source,
Unit, Target Pest, axis titles). `data/selectors.ts` turns each into year rows, and one component,
`components/reports/CatchTrendSheet.tsx`, draws all three:

```
                    rodentTrendRows      lizardTrendRows        flyTrendRows
                    F/HR/17 cp.7   +     transcribed only       reported gramms  +
                    transcribed                                 F/HR/18 counts
                         |                     |                      |
                         +---------------------+----------------------+
                                               v
                              CatchTrendSheet  (one row per year,
                              Source / Unit / Target Pest PER ROW,
                              a chart of one year, a signature line)
```

Source / Unit / Target Pest are per row, not per report, because the flies report needs it: the years
the provider weighed the catch out of the EFKs are in "Gramms" and a year added up from the
fortnightly board counts is in "Number", and there is no factor to convert between them. A row that
carries no wording of its own takes the report's (`withReportHeader`, ReportsPage). `rowTotal` returns
null unless all twelve months are filled, which is how the company prints it. REQUIREMENTS §41.

## Departments: who sees which document

```
backend: users.departments  ("QC,PRD" | "" = every department)
        |  /api/auth/me, /auth/login, /auth/signup return it on the user
        v
store/AuthContext.tsx  applyScope(user)  ->  engine/departmentScope.ts
        |    (role "admin" or an empty assignment => null = every department)
        v
setDepartmentScope(codes)      module-level, so non-React code asks the same question
        |
        +--> data/repositories/documentRepository.ts   getAll / getById / getRecordable   SCOPED
        |         getAllUnscoped / getByIdUnscoped / getRecordableUnscoped                UNSCOPED
        +--> data/repositories/recordRepository.ts     query / monthStats                 SCOPED
                  queryUnscoped, getAll, getById, periodKeys, upsertMany, remove*         UNSCOPED
```

Which department owns which document is `DOCUMENT_DEPARTMENTS` in `src/data/seed/departments.ts`,
taken from the company's own MASTER LIST OF FORMATS & RECORDS (F/SYS/02): the department is the middle
segment of the format number, so F-QC-30 is Quality Control's and F-HR-17 is HR's. A document no
department owns is shown to everyone — a missing assignment must never make a controlled document
disappear.

Only two files apply the filter, which is what keeps it honest: every screen that reads through the
repositories is scoped without having to remember. The `*Unscoped` variants exist for the record
generator, the demo generator, the boot migrations and the assistant's preparation — the plant's
registers must be complete whoever is logged in, and this browser's localStorage is the only copy of
them, so scoping generation would make another department's obligations vanish for everybody.

`recordRepository.getById` is deliberately unscoped so a record reached by its own address is still
found, and the page can then refuse it by name (`components/common/NotYourDepartment.tsx`) rather than
claim the record does not exist. No field of the record is rendered on that path.

This decides what a person is SHOWN. It is not an authorisation boundary while the records live in the
browser (see "Storage keys" below); when they move to the server, `users.departments` is what the API
must enforce. REQUIREMENTS §40.

## Printing

`utils/print.ts`: every screen marks its document with `data-print-doc`. A Print button calls
`printDocument(target?)`, and the browser's own Print fires `beforeprint`; either way every element
that is neither a document, inside one, nor an ancestor of one is marked `print-scope-hidden` for the
length of the print (`afterprint` removes the marks), and the ancestors drop their padding, frame and
grid / flex layout (styles.css → Print). A screen with no marked document prints as it always did.

## Seed synchronisation (existing installs pick up new documents)

Each repository's `ensureSeeded()` now merges rather than only seeding an empty store:
`documentRepository` re-syncs the seed list by id on every boot (definitions are configuration,
nothing in the UI edits them); `masterRepository` adds missing employees / holidays / chemicals /
areas / role keywords by id without touching admin edits; `recordRepository` adds missing historical
records by id. `recordRepository` also keeps an in-memory copy of the parsed records array
(refreshed on every write) — with 24-row hourly log sheets the JSON is large enough that re-parsing
localStorage on every read visibly froze the Demo generator.

## Core types (`src/types/`)

```ts
DocumentDefinition {
  id, kind, name, formatNo, revisionNo, revisionDate, department, module, frequency,
  status, description, sourceFile, schedule: ScheduleConfig, variantKey?, isReferenceOnly?
}

RecordInstance<TData> {
  id, documentId, periodKey, dueDate, status: RecordStatus, isDemo,
  data: TData, createdAt, updatedAt,
  submittedBy?, submittedAt?, verifiedBy?, verifiedAt?, rejectedBy?, rejectedAt?, rejectionReason?,
  prepared?: { at, by: "assistant", notes: string[], basedOn: string }
}
```

Per-document `TData` payloads: `DailyPestMonitoringData`, `FlyCatcherData`, `ServiceReportData`,
`GapInspectionData`, `TrainingRecordData`, `LogSheetData` (all in `src/types/record.ts`); layout
types for log sheets in `src/types/logSheet.ts`.

`DailyPestMonitoringData.rodentCatches?: RodentCatch[]` (`{ id, trapBoxNo, location, count }`) holds
the catch details behind checkpoint 7 — one row per trap box that caught something. It is optional
only so records saved before the field existed still load; validation requires at least one row
(with a location and a count ≥ 1) whenever checkpoint 7 is "Yes". `data/selectors.ts`
(`rodentStatsForYear`, `rodentsInMonth`) adds these up for Reports > Rodent Catch Report and the
Dashboard tile. The values the assistant / Demo Mode put there come from `engine/rodentPattern.ts`
(`rodentEventFor(dateISO)`, seeded per calendar date) using the parameters in
`data/seed/pestPattern.ts`, which is **generated** by `tools/pest_pattern.py` — edit the Python
and re-run it rather than the `.ts`. The same generated module carries the fly-catcher pattern
(`FLY_MONTHLY_FACTOR`, `FLY_UNIT_BASE`) that `engine/flyPattern.ts` (`flyCatchFor(pcId, dateISO)`)
turns into `FlyCatcherEntry.catchCountApprox`; `data/selectors.ts` (`flyStatsForYear`, `fliesInMonth`)
adds those up per unit / per month for the Fly Catcher Infestation trend.

`DocumentDefinition.section?: string` is an optional sub-grouping inside a module. The Human
Resources module uses nine: its own "Personnel & Competence" / "Training" / "Induction & Health" /
"Hygiene & GMP" / "Product Safety Culture" (`HR_SECTIONS`) for the sixteen F/HR formats, and the pest
control file's "Daily Report" / "Service Reports" / "Trend Analysis" / "Training & Reference"
(`PEST_CONTROL_SECTIONS`); `MODULE_SECTIONS` is the display order (`data/seed/documentDefinitions.ts`).
The Document Library sorts a module's rows by it and prints each section's name on a row of its own
(`tr.doc-section-row`); the Pest Control pages (`pages/PestControlPages.tsx`, routes `/pest-control`,
`/pest/daily[/{y}/{m0}]`, `/pest/service/{rodent|general|fly}[/{y}]`, `/pest/trend/{rodent|fly-catcher}[/{y}]`,
validated in `store/router.tsx`) are the module's own front door — they read the same
`recordRepository` and never copy data. `RETIRED_DOCUMENT_IDS` (same seed file) lists withdrawn
document ids: `documentRepository.ensureSeeded` drops the definition, `masterRepository.ensureSeeded`
its reminder-role entry, and `bootstrap()` any records still stored for it.

**The working calendar.** `MasterData.weeklyOffDay` (0–6, Thursday = 4), `holidays[]` (festival
holidays) and `adjustmentDays[]` (`{ id, date, forHoliday, note }` — weekly-off days the plant works)
are read only through `engine/holidays.ts`: `dayInfo(dateISO, master)` → `{ kind: "working" |
"weekly-off" | "holiday" | "adjustment", isHoliday, label, short }`, `isCompanyHoliday`,
`nextWorkingDay`, `upcomingHolidays`, and `effectiveDueDatesInMonth(doc, y, m, master)` → `{ scheduled,
due, shifted, holiday }[]`. The record generator and Demo Mode build every record from the latter: the
`periodKey` uses `scheduled` (idempotent), the record's `dueDate` uses `due` (moved to the next
working day for non-daily cadences), and daily registers other than Daily Monitoring are skipped
when `holiday` is set. `recordDefaults`, `autoFill`, `reminders` and `assistantBriefing` all ask
`isCompanyHoliday` rather than looking at the holiday list directly. `engine/calendarMigration.ts`
(`alignRecordsToWorkingCalendar`, run by `bootstrap()` every start, idempotent) brings records an
earlier build or an earlier version of the calendar left on a closed day into line — only records no
person has worked on (open status, never submitted, not edited since the assistant prepared them):
non-daily ones move to the next working day, daily registers other than Daily Monitoring are removed,
Daily Monitoring is re-marked as a holiday. `MasterData.removedSeedIds` records seeded holiday /
adjustment rows an admin deleted so the additive seed merge never resurrects them.

**The assistant's local layer.** `engine/assistantLocal.ts` answers a few intents on the client
(holiday / weekly-off / adjustment questions with a date reference, "next holiday", "what's due
today", "briefing", a date-range document listing (below), "help") and builds
`buildAssistantContext()` — a ≤ 3.8 KB plain-text digest of live facts that both the widget and the
full-page `pages/AssistantPage.tsx` send as `context` with every `/api/assistant/chat` call (the
backend caps it at 4 KB and folds it into the system prompt). The page persists conversations under
the `assistant-conversations` storage key (30 conversations × 200 messages max).

**Gujarati through Google Translate (11-Sep-2026).** No new stored fields — `AppSettings.language`
still records the choice; Google's widget keeps its own `googtrans=/en/gu` cookie while Gujarati is
on (cleared on switching back). `src/i18n/googleTranslate.ts` holds a status (`off | loading | on |
failed`, subscribed to by `AppStore` via `useSyncExternalStore`) and `uiLanguageFor(lang, status)`:
the screens are written in English (`AppStore.uiLang = "en"`) while Google translates them, and in
the built-in `gu` table only when Google failed to load. `lang` itself still drives the assistant's
reply language and the voice. `src/i18n/translateGuard.ts` patches `Node.prototype` insert / remove /
replace and the text setters, only once Gujarati is first chosen, keeping a `WeakMap` from each
React text node to whatever Google put in its place. Parts that must never be translated carry
`translate="no"` (+ `notranslate` class): record views and register sheets, `DocumentHeader`, the
SOP / licence / SOC bodies, record-history values and names, master-data rows, and people's names.

**Interface language (i18n).** `src/i18n/strings.ts` holds one table per language; `en` is declared
`as const` and is the source of truth for the key set, and `gu` is typed `Record<StringKey, string>`
so a missing Gujarati string is a compile error rather than a silent English fallback. `src/i18n`
exposes `tr(lang, key, vars)`, a module-level `t(key, vars)` for code outside React (engines, the
assistant's canned replies — it reads the stored language at call time) and `useT()` for components,
which resolves through `AppStore` so changing the language re-renders every screen at once. The
choice lives in `AppSettings.language` (Dashboard → Language, and the top-bar picker), and
`setLang` also stamps `document.documentElement.lang`. `{name}` placeholders are interpolated.
Controlled document text is deliberately excluded — see the header comment in `strings.ts` and
REQUIREMENTS §24. Identifiers never translate: module names in `MODULE_ORDER`, report tab keys
(`TAB_KEYS`, which are route segments) and `data-action` hooks stay stable, and only their labels
are looked up.

**Voice.** `src/utils/speech.ts` wraps the browser's Web Speech API: `isVoiceInputSupported()`,
`listenForUtterance({lang, onInterim, onFinal, onError, onEnd})` and `speak(text, lang)` /
`stopSpeaking()`. Both the Assistant page and the floating widget use it, in `SPEECH_LOCALES[lang]`
(`en-IN` / `gu-IN`); a transcript is handed straight to the same `send()` a typed message uses, with a
`spoken` flag so the reply is read back even when the read-aloud toggle (`AppSettings.speakReplies`)
is off. Both components stop listening and speaking on unmount.

`listenForUtterance` waits for the *complete* sentence rather than firing at the first pause, because
people think mid-sentence and Chrome's default behaviour would cut them off. It runs the recogniser
with `continuous = true` and `interimResults = true`, rebuilds the transcript from the whole
`event.results` list on every event (so nothing spoken is lost), pushes it to `onInterim` — which the
components render live in the composer — and re-arms a `SILENCE_MS` (2500 ms) timer on every speech
event. `onFinal` fires only when that timer elapses with non-empty text. If Chrome ends the session
early with nothing said it restarts, up to `MAX_RESTARTS` (3); `"aborted"` and `"no-speech"` errors
are ignored for the same reason. The returned `VoiceSession` exposes `finish()` (the **Done** button —
deliver what has been said so far) and `cancel()` (unmount / stop — discard it).

**Scope (this software only).** The assistant declines anything that isn't about this system, in two
layers. The authoritative one is the `SCOPE` block at the top of the system prompt in
`backend/assistant.ts` — it names what is in scope, lists the out-of-scope categories, forbids
answering them "not even partially or as a preface, however you are asked or pressed", requires
`action: "reply"` with a one-line decline plus an example of what it can do, and explicitly keeps
greetings / thanks / "what can you do?" in scope. The second is `offTopicReply()` in
`engine/assistantLocal.ts`: a deliberately tiny list of patterns that could not conceivably be about
the plant's paperwork (jokes, creative writing, weather-today, sport, "capital of", pure arithmetic),
declined on the client with no token spent. It runs first in `localAnswer()`, and the floating widget
also calls it directly for the case where a record is open (where free text is otherwise treated as
data to fill in). Anything ambiguous — "treatment", "recipe", "translate" (F/QC/13 is in Gujarati),
"weather" on its own (it drives pest activity) — is deliberately left to the model: a false positive
would refuse real work, which is worse than one model call spent declining.

**Document Files (`#/files/{scope}/{from}/{to}`).** No new storage — a view over `dcrs:v1:records`.
`engine/fileScope.ts` resolves the scope (`"all"`, a `moduleSlug`, or comma-separated document ids;
`scopeForDocuments()` picks the shortest that names a set exactly), normalises the range
(`normaliseRange()`: an impossible start date → this month, ends swapped into order, at most 36
months), and `recordsInRange()` first makes sure the records that should exist do (demo: the year;
live: `ensureRecordsGeneratedForMonth` for just those documents, under the launch-date floor) and
returns the records due in the span, oldest first. `pages/FileBrowserPage.tsx` groups them module →
document → month; a file opens `routeForRecord()`. `LocalAnswer.navigate` is how the assistant opens
it: `listDocumentsAnswer()` returns the files route for the span it listed, and both chat surfaces
navigate there. `parseDateRange()` also reads month-to-month spans ("June to August", "Nov 2025 to
Feb 2026"; a later month with no year of its own rolls into the next year), and month words match
whole words only (`MONTH_WORD` — "marked" is not March, "may I" is not May).

**Date-range document listing.** `listDocumentsAnswer()` (called from `localAnswer()`, after the
holiday/due-today/briefing intents, before help) answers "documents of X from date to date" entirely
on the client: `matchDocuments(lower)` maps free text to document ids via a static alias table
(`DOC_KEYWORDS`), falling back to every recordable document in a named module (`MODULE_KEYWORDS`)
when no single document is named — returns `[]` (and the function bails to `null`, letting the
message reach the model) when nothing is recognised. `parseDateRange(text, today)` resolves what span
was named — `extractExplicitDates()` pulls every ISO / dd-mm-yyyy / "D Month[ Year]" date out of the
message (including the shorthand "D to D Month" where the month is stated once) and takes the
min/max; failing that, "this/last/next week", "this/last/next month", or a bare month name resolve to
that whole span; failing that, `parseDateRef()` (the same single-date parser the holiday intent uses)
covers today/tomorrow/yesterday/a weekday. Both a document/module match AND a date match are required
to fire — that's what keeps "show me all reports of august" (no document named) going to the model
unchanged. Once both resolve, it calls `ensureRecordsGeneratedForMonth({documentIds: docIds})` (Live)
or `ensureDemoRecordsGeneratedForYear()` (Demo) for just the touched months before querying
`recordRepository`, so a span nobody has browsed to yet still resolves correctly (Live still respects
the launch-date floor). The reply lists every matching record (capped at `MAX_LISTED_RECORDS = 40` —
a safety bound, not a normal truncation, since the span is one the user themselves named) with a
"Holiday" status override for a pre-marked Daily Monitoring row; chips open each record directly when
six or fewer are shown, else a single "Open Calendar" chip.

**The F/HR/17 register view.** `components/records/DailyRegisterSheet.tsx` renders a month of
`daily-pest-monitoring` records in the company's own three-page layout (page 1 instructions + the ten
check points; page 2 dates 1–19; page 3 dates 20–31 + Summary of Actions) — a pure view over
`recordRepository` (nothing stored twice): each `<tr data-day>` is that day's record, cells derive
from `checkpoints[n].value` (column 7 shows the rodent count from `rodentCatches`, `isHoliday` rows
render one HOLIDAY cell across the ten columns), `summaryActions` of every day are pooled into the
page-3 table, and `yesno-note` notes are footnoted. The per-day `DailyPestMonitoringRecordView` stays
the editing surface (lifecycle, validation, assistant fill) and links to the register; the register
links back per row. `FHR17_INSTRUCTION_1/2` are the format's verbatim instruction lines, shared by
both views. The blank pages of the format are served from `frontend/public/source/` (copied to
`dist/` by the build).

**Reference documents kept as supplied.** `kind: "licence"` (`DocumentKind`) is a reference-only
document whose supplied file is the record of truth. `data/seed/serviceLicence.ts` holds
`originalPdf` (the file served byte for byte from `frontend/public/source/`, with its expected
`originalBytes` recorded so a smoke check can prove it is untouched), the page-image paths rendered
from that same file for display and print, and the verbatim transcription (printed numbering gaps
preserved). `pages/LicencePage.tsx` (`/licence`) offers the original PDF, shows the pages, then the
transcription. A renewed licence means dropping in the new PDF + page images and updating the seed
values — nothing else.

## Record lifecycle (state diagram)

```
 Scheduled ──▶ Due ──▶ In Progress ──[Submit, validated]──▶ Pending Verification
                                                                  │        │
                                                       [Verify, validated] │ [Reject + reason]
                                                                  ▼        ▼
                                                              Verified   Rejected
                                                                             │
                                                                  [Resume Editing]
                                                                             ▼
                                                                       In Progress
```

- The recurring-record generator (`ensureRecordsGeneratedForMonth`) creates every new instance
  directly in status **Due** (section 28 requirement) — never pre-completed.
- `saveDraft()` moves Due/Scheduled → In Progress on first edit; further saves keep the record in
  In Progress.
- `submitRecord()` runs `validateForSubmit()` (per-document-kind field completeness rules) and,
  only if valid, moves the record straight to **Pending Verification** and stamps
  `submittedBy`/`submittedAt`. ("Submitted" is a state the type system supports — used in Demo
  Mode's synthetic status distribution — but Live Mode's one Submit action folds it into Pending
  Verification immediately, matching the simple 2-click workflow the master prompt asks for in
  section 36.)
- `verifyRecord()` runs `validateForVerify()` (e.g. Service Report needs `customerSign`; GAP
  needs every finding Closed/Verified) and only then moves to **Verified**. *A record can never
  reach Verified without passing this check* — the explicit requirement in section 16.
- `rejectRecord()` / `resumeAfterRejection()` implement the Rejected → Correct → Resubmit loop.
- `reopenForCorrection()` takes a signed-off record back to **In Progress** with a reason;
  `cancelCorrection()` is the way back out of that without a round trip through verification — it
  restores the status it was reopened from and the data as it stood, and records the cancellation.

## Demo vs. Live data integrity (section 38)

Every `RecordInstance` carries `isDemo: boolean`. `recordRepository.query()` and every page take an
`isDemo` filter derived from the app-wide Live/Demo toggle (`useAppStore().mode`), so:

- Demo-mode records are **never** returned by a Live-mode query and vice versa.
- The UI wraps any demo content in a `.demo-watermark` div, whose CSS `::before` injects the
  literal banner *"DEMO / SYNTHETIC DATA — NOT AUDIT EVIDENCE"* — this cannot be suppressed by a
  component forgetting a prop, because it is a CSS pseudo-element on the wrapper class, not a
  conditionally-rendered React node.
- `clearAllDemoData()` deletes only `isDemo: true` rows — Live data is structurally unreachable
  from that call (it filters, never touches the rest of the array before writing back).
- **Fixed bug** (historical — the per-period existence check has since become
  `recordRepository.periodKeys(isDemo)`, one Set per generation call instead of a scan per date):
  the check used to look at only `documentId`+`periodKey`, not `isDemo` — so a Live record occupying a period (e.g. every date in
  the current month, auto-generated by `bootstrap()`) silently blocked a Demo record from *ever*
  being generated for that same period, and separately, Dashboard/Calendar/DayView/Reports each
  called the generic `ensureRecordsGeneratedForMonth(..., { isDemo })` on mount using whatever mode
  you were viewing in — meaning simply *browsing* those pages in Demo mode pre-filled every date
  with blank shell records ahead of time, which then made Demo Mode's own "Generate Demo Records"
  button (`generateDemoRecordsForMonth`) report success while creating nothing, because the slots
  were already "taken" by data-less stubs. Fixed by (1) adding `isDemo` to the period-uniqueness
  check, and (2) making those four pages always pass `isDemo: false` to the generic
  generator — Demo data is now only ever created by the explicit button, never as a side effect of
  navigation. See `tests/e2e_smoke.py`'s "Demo generation actually created new records" check,
  which specifically reproduces the page-visit ordering that used to trigger this.

## Storage keys (namespace `dcrs:v1:`)

| Key | Shape | Repository |
|---|---|---|
| `documents` | `DocumentDefinition[]` | `documentRepository` |
| `master` | `MasterData` (single object) | `masterRepository` |
| `records` | `RecordInstance[]` | `recordRepository` |
| `settings` | `AppSettings` (mode, liveStartDate) | `settingsRepository` |

All are seeded once (`ensureSeeded()`) on first run from `src/data/seed/*` — see
`src/data/bootstrap.ts`, called once from `main.tsx`.

## The CAPA module: Internal vs External, and the guided walk-through

`/gap` is a chooser with exactly two doors. **Internal** (`kind: "gap-inspection"`, `GapPage.tsx`) is
the pest-control inspection-findings report that has been there since Phase 1. **External** (`kind:
"complaint-checklist"`, `CapaPage.tsx`) is the Customer Complaint Handling Checklist F/MKT/05:
`ComplaintChecklistData` = six header fields + `sections[5].items[]` (each `{ srNo, activity, done,
date, comment, notRequired }`, verbatim from `src/data/seed/complaintChecklist.ts`) + `preparedBy` /
`approvedBy` sign-offs. Both documents share the module "CAPA (Corrective & Preventive Action)".

The assistant fills a complaint checklist *conversationally* — that is the reason the widget became
a chat. `src/engine/guidedChecklist.ts` is a pure state machine: `firstStep(data)` → the first blank
required header detail, else Section A; `promptFor(step)` → the question plus quick-reply chips
("Done today", "Done on a date…", "Not required", "Skip"; per section "Let's go" / "All N done today"
/ "Skip this section"; at the end "Submit for approval" / "Not yet"); `applyAnswer(data, step,
answer)` → new data + a one-line acknowledgement; `stepAfter(data, step)` → header → A → B → C → D →
E → approval. Chip answers never touch the network. A typed answer about an activity ("got the
samples on the 3rd") goes to `POST /api/assistant/checklist-answer` (Groq) and comes back as
`{ done, notRequired, date, comment }`; if that call fails the text is kept as the comment and the
activity marked done, so a model outage never blocks the walk-through. The page registers a
`ChecklistBinding` on the assistant context (`getData/setData/submit/approve/sendBack`, plus
`autoStart` for a brand-new checklist so the widget opens itself). Submit stamps Prepared By with
the logged-in user; approval is the Verify step and stamps Approved By (designation defaulting to
"QA Head", per activity 31).

## Dead code removed (Sept-2026 cleanup)

Un-exported/deleted because nothing referenced them: `AuditEvent`, `FREQUENCIES`, `RECORD_STATUSES`,
`recordNumber()`, `settingsRepository.nextSequence()` and its `sequenceCounters` /
`lastGeneratedThrough` fields (stored copies keep any stale keys harmlessly — `get()` spreads over
defaults), `recordRepository.existsForPeriod()` / `todayStats()`, `ensureRecordsGeneratedForRange()`,
`selectors.isDemoModeFilter()`, `DemoWatermarkBar`, and the unused date helpers `formatMonthYear` /
`addMonths` / `isPast` / `weekdayOf`. `tests/screenshot_final.png` (a generated artifact) is gone and
no longer written.

## Why re-render works without a state-management library

No Redux/Zustand/MobX was available offline (see DEPLOYMENT.md), so `AppStoreProvider`
(`src/store/AppStore.tsx`) exposes a single `version: number` + `bump()`. Any component that
mutates a repository calls `bump()` afterwards; components read repositories directly during
render (cheap at this data scale) and are simply re-rendered when `version` changes via React
context. This is intentionally the simplest thing that works for a localStorage-scale prototype —
see FUTURE_ROADMAP.md for the production recommendation (React Query / SWR style cache once a
real network API exists).
