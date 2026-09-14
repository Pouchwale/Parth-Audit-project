# Presentation prompt — Pest Control module

Paste everything below the line into whichever tool is making the deck (Claude,
Gamma, ChatGPT, Copilot). It is self-contained: every fact the deck needs is in
the prompt, so the tool does not need the codebase and has nothing to invent.

Scope is the **Pest Control module only** — the other modules (CAPA, Lamination
QC, Lamination Production, Quality Control Inspection, Quality Compliance) are
deliberately left out.

Two knobs worth setting before you send it: the **audience** line and the
**slide count**. The prompt as written targets the plant's own management and an
auditor; swap that line if you are presenting to the service provider or to a
customer.

---

You are preparing a presentation about **one module of a digital controlled-record
system** built for **Gujarat Printpack Publication Pvt. Ltd.** (flexible packaging
and label printing, 308/9 GIDC, Dediyasan, Mehsana, Gujarat).

## The brief

Produce a **12–14 slide presentation** on the **Pest Control module** of that
system, for an audience of **the plant's own management and a visiting auditor**.
Tone: factual, specific, quietly confident. No marketing adjectives, no
"revolutionary", no stock-photo language. This is a compliance system being
shown to people who know the paperwork better than you do, so the persuasive
force must come from the detail being right.

Every figure, format number and document name below is real. **Use only these
facts. Do not invent a statistic, a screenshot description, a benefit, a
customer name, a percentage or a date that is not here.** If a slide would be
stronger with a number you have not been given, leave the claim qualitative
instead.

## What the module is

The plant keeps its pest control records on paper, in the formats on its own
**Master List of Formats & Records (F/SYS/02)**. This module is a digital
reproduction of those exact formats — not a generic document manager. Every
screen is built from the company's own uploaded documents, so a digital record
looks and behaves like the paper one it replaces, and prints like it too.

Pest control is carried out under contract by **Gurudev Pest Control**, whose
Government of Gujarat insecticide licence (Form III, MEH/FP1230000675/2023-2024)
is held on file in the system exactly as issued. On the plant's own master list
these records belong to **Human Resources** (their format numbers are F-HR-…),
which is who the system shows them to.

## The ten documents in the module

Group them on the slides the way the department itself reads them — that
grouping is the module's navigation:

**1. Daily Report**
- **F/HR/17 — Daily Pest Control Monitoring Record** (daily). Ten check points
  walked every day: pest proofing of external doors, gaps in doors/shutters/cable
  entries, fly catchers working and serially numbered, number of rodent trap
  boxes provided (100), and whether anything was trapped — with the trap box
  number, the location and how many. A three-page printed format, reproduced
  page for page.

**2. Service Reports** — Gurudev's fortnightly visit reports, one format per
service, each signed by the technician and the site contact:
- **Rat / Mice (Rodent Control Service)** — 16 named areas of the plant, glue
  boards and Bromadiolone bait
- **Ants & Cockroaches (General Pest Control Services)**
- **Fly Control Services**

**3. Trend Analysis** — the company's own three trend pages, each one table of a
year per row over a bar chart of one year, with a "Report prepared by" signature
line:
- **Rodent Catch Report and Trend Analysis** — trapped on glue boards in
  Roda-boxes, counted in numbers
- **Lizard Catch Report and Trend Analysis** — the house lizards off the same
  glue boards
- **Flies Catch Report and Trend Analysis** — collected in the electric fly
  killers (EFKs) and reported by **weight, in gramms**, which is a different
  measurement from the board counts on the fortnightly register
- Alongside them, **F/HR/18 — Fortnightly Fly Catcher Inspection & Cleaning
  Record** (fortnightly, day 3 and day 17): the thirteen fly catcher units
  PC-01 to PC-13, each line carrying the approximate flies caught, the tube
  light installation date (24-11-2025) and its replacement due date
  (23-11-2026), who cleaned it and who verified. A two-page printed format.

**4. Training & Reference**
- **Pest Control Training Record** (yearly) — the session, its topics and the
  attendance sheet
- **Pesticide Application Chart (Chemical Master)** — the chemicals, their
  dilution and which service each belongs to
- **Responsibilities of Pest Control — Site & Service Provider**, signed by both
- **Pest Control Service Agreement — Site & Service Provider**, renewed every
  two years, with the five contracted services and their frequencies
- **Insecticide Licence — Gurudev Pesticides (Form III)**, reproduced as issued

## What the system does with them — the points worth a slide each

- **The record is ready before the operator arrives.** Every record that falls
  due is pre-filled from the plant's last confirmed record of that document, or
  from the filled specimen in the source file when there is no history. It never
  signs, submits or verifies anything — a person does that, and the record stays
  "In Progress" until they do.
- **The records read like a real plant's.** A year in which every check point
  says Yes is the first thing an auditor disbelieves. The readings follow a
  behaviour model measured from the company's own filled specimens, and the
  seasons are the plant's own: **flies busiest in the monsoon, busy again in
  winter, quietest in the dry summer heat**; **three to four rodents caught in a
  year, in three or four different months**, which is what the plant actually
  catches. Anything the model flags is put in the first line of the record's
  notes for a person to confirm — never quietly signed off.
- **Every figure on a trend report comes from one place only**, never both: the
  digital register where it holds that month, otherwise the company's own
  transcribed paper report, otherwise blank — including every month that has not
  happened yet. On screen, a figure the system added up is tinted and a figure it
  transcribed is not, with a one-line key, so an auditor can always tell which is
  which. The tint does not print.
- **Corrections are corrections, not rewrites.** A draft saves itself as it is
  typed. Once submitted or verified it locks, and reopening it needs a reason;
  the record then carries a full history — every edit field by field, before and
  after, every submit, verification, rejection and correction, and who did it.
- **The assistant is a chat on every screen.** Plain speech opens a document,
  walks a record question by question, or fills a field: "PC-05 count is 3",
  "checker is Ramesh", "show me all reports of August". Every proposed change is
  validated before it is saved — a word cannot go into a number, a printed time
  slot cannot be moved — then listed back and can be undone.
- **Printing produces the document, not the screen.** A print gives the
  register's own sheet with the company name, the title and the Format No. /
  Rev No. block, and nothing else — no navigation, no buttons, no page heading.
- **People see their own department's records.** Assignments follow the format
  numbers on F/SYS/02, so the pest control file is Human Resources'. Somebody
  outside it who reaches one of these documents is told whose register it is
  rather than shown it.

## Structure to follow

1. Title — the plant, the module, one line on what it replaces
2. The paperwork today: the ten documents, grouped as above (a table reads best)
3. F/HR/17, the daily round — the ten check points, page for page
4. The three fortnightly service reports and what each covers
5. F/HR/18 and the thirteen fly catcher units
6. The three trend reports — and why flies are reported by weight
7. The seasons the data follows, and the rodent figures
8. Records ready before the operator arrives, and what the system will not do
9. Corrections and the audit trail
10. The assistant, in the operator's own words
11. Printing and what reaches the auditor's hand
12. Who sees what, by department
13. What is still TO BE CONFIRMED (below) — put this in, do not hide it
14. Close: what an audit of this file looks like now

## Put this on the "still to be confirmed" slide

Being straight about the gaps is the point of the slide, and an auditor will
respect it more than a clean one:

- Several of these formats carry no Format No. or Revision on the source copy,
  and are marked **TO BE CONFIRMED** in the system rather than being given a
  number nobody issued: the three service reports, the training record, the
  chemical chart, the responsibilities document and the service agreement.
- The frequency of each contracted service is stated as TO BE CONFIRMED in the
  service provider's own procedure; the fortnightly cadence is what the visit
  reports show, not what the procedure says.
- Two items from the March-2026 service report need the department's word: how
  many of the sixteen Rat / Mice areas are baited rather than glue-boarded, and
  which floor the Ink store is on.

## Format

Markdown, one `##` heading per slide, 3–6 short bullets each, and a one-line
speaker note under each slide in italics saying what to say out loud. No images
— describe in a bracket what a screenshot would show if one belongs there.
