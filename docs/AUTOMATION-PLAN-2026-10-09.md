# Less work for every user: what DCRS can do by itself (9-Oct-2026)

The owner, 9-Oct-2026: "there are many records like planning calendar and training records so system will
automatically planned the date and fill the actual date and that will notify to the user so user will review it and
verify then submit it so like wise see all the other modules document and suggest me what automation we can bring for
our user so that user can review, verify it and submit so his work his minimal".

This is the proposal. The planning calendars and training records come first, as asked; everything else is a list to
pick from. Nothing here is built yet. It goes on top of the access and notifications build (REQUIREMENTS §96 to §98),
which lands today.

## The one rule

DCRS may fill in, by itself:

- **plans and due dates**: the months a training or an audit is planned for, the next calibration date, the next review,
  worked out from the last one and its frequency;
- **what is already known**: the date, the machine, the instrument, the topic, the trainer, the list of people, the
  fixed lines of the form (REQUIREMENTS §98, the "known parts");
- **figures worked out from records people entered**: totals, percentages, trends, ratings;
- **an actual date taken from the record that proves it happened**: the training record's date fills the calendar's
  Actual; the PM record's date fills the PM schedule's Actual (already so, §82).

DCRS never fills in, by itself: a reading, a count, a pass or fail, a finding, a signature, the name of whoever checked,
or an actual date with no record behind it. A plan is not proof that something happened; the training record is.

Then the person: **reviews** what is ready (website or phone), **enters only what they saw**, and **submits**; the
verifier **verifies**. Notifications tell each of them when (§97: coming up, due, ready, needs input, overdue, to verify).

## Already working (so it is not suggested again)

- Every morning the server prepares the day's records with their known parts and tells the responsible person on the
  website and the phone (§97, §98). Reviews and verifications can be done from the phone.
- F/MNT/03, the yearly PM schedule, reads its Actual dates from the F/MNT/02 PM records (§82).
- Due dates, reminders, overdue escalation to the super admin, the weekly digest, the scorecard and the minus score.

## Build first: planning calendars and training records

**How it works, in one line:** a plan makes the records, the records tell the people, and the records fill the plan's
Actual.

### Training: F/HR/08, F/HR/09, F/HR/12 (and F/HR/10), F/HR/11

| Step | What DCRS does by itself | What the person does |
|---|---|---|
| 1. Training needs, yearly (F/HR/08) | Lists every employee from HR Master Data with the gaps it already knows: education and experience required vs available (F/HR/01), skill levels below the line's need (F/HR/03), new joiners not yet inducted. | HR confirms or adds the needs, submits. |
| 2. The calendar, yearly (F/HR/09) | Prepares next year's calendar: every topic of this year with its planned months, the needs from step 1 added. | HR adjusts the months, submits; the plant head verifies. |
| 3. Each planned month | Starts the training record (F/HR/12) for the trainer: topic, trainer, duration, method and evaluation from the calendar; the planned date proposed; the attendee list from HR Master Data for the topic's departments. Tells the trainer three days ahead, on the day, and when overdue (§97). | The trainer holds the training, ticks who attended, rates each person, submits. |
| 4. The calendar's Actual | Fills the month's Actual with the date of the submitted training record, marked "not yet verified" until HR verifies that record. A date typed on the calendar is kept as typed. | HR verifies the training record; the calendar is then complete with no typing. |
| 5. Effectiveness (F/HR/11) | Starts one evaluation per attendee after the period HR sets (for example 30 days), with trainee, topic, date and trainer filled; tells the evaluation officer. | The officer evaluates, submits. |
| 6. A planned month with no training | Says so on the calendar and to HR and the super admin: "GMP Principles was planned for April; no training record." Never fills an Actual. | HR holds it or moves the plan. |

F/HR/10, the Training Imparted Record, is not in DCRS yet. It is on the hard-copy list (docs/document-coverage.md). With
its paper, step 3 can use it instead of, or beside, F/HR/12. Induction (F/HR/05, F/HR/06): when a new employee is added
to HR Master Data, their induction record starts with a planned date for every topic from the joining date; the trainer
marks each topic done, which writes today's date and their name.

### The other planning calendars, the same way

| Calendar | Plan made from | Actual taken from | Reminders to |
|---|---|---|---|
| F/SYS/05 Yearly Internal Audit Schedule | F/SYS/07 risk assessment: how often each clause by its risk, at least twice a year | F/SYS/06 audit plan and F/SYS/08 findings report of that clause | the auditor, the auditee, the super admin |
| F/SYS/10 and F/SYS/11 NC reports | Planned closing date on each NC | the closing entry | the NC owner; escalated when overdue |
| F/MNT/03 Yearly PM Schedule | next year's plan drafted from this year's, for the maintenance head to change and approve (a plan stays a decision, §82) | F/MNT/02 (already linked) | the maintenance person |
| F/QC/08 Calibration master list | Last calibration date and frequency: next due date worked out | F/QC/11, F/QC/12 and the external certificates | the QC person, a week before |
| F/SYS/04-A and F/SYS/04 Management review | Planned date on the agenda | the meeting record | the MR and every process owner, with the items to bring |
| F/SYS/12 Monthly HARA verification | Monthly | the meeting record | the HARA team, with the month's figures ready (below) |
| F/SYS/20 Annual HARA review | Next scheduled review = last one + 1 year | the review record | the HARA team leader |

## Suggestions for every other module (pick the ones you want)

### Human Resources
- **F/HR/21 survey analysis worked out from the F/HR/20 forms**: the counts on each point of the scale, actual vs
  ideal and the % achieved, ready for HR to verify. No typing.
- **F/HR/01 competence and F/HR/03 skill matrix kept in step with HR Master Data**: joiners added, leavers marked; the
  gaps flagged for the training needs.
- **F/HR/04 pre-employment medical and F/HR/14 visitor health declaration filled by the person** on a phone or a tablet
  at the gate (a QR code), HR only reviews.
- **F/HR/13 mobile authorisation**: renewal reminders.
- **F/HR/15, 16 and 22 cleaning and hygiene**: the day's sheet ready with the areas and the people on duty; "all done
  as listed" in one tap with the exceptions typed (the ticks stay the person's).

### Quality Control and Lamination QC
- **Incoming inspection started from the store's entry**: when F/STR/01 records a vehicle, the right F/QC inspection
  record (BOPP, label stock, ink...) starts with the supplier, material, lot and quantity; the tests stay the inspector's.
- **COA compiled from the job's own inspection records**: the values measured on F/QC/13 and F/QC/34 to 37 for that job,
  ready to check and sign (only measured values, nothing estimated).
- **Line clearance (F/QC/15) started at each job change** with its checklist; the answers stay the person's.
- **Hot room and other temperatures read from a data logger**, if the plant has one, instead of typed.

### Production
- **Once the job cards (F-PRD-14) are in DCRS**, every production and QC sheet of a job takes the job number,
  customer and specification by itself.
- **Blade and sharp object ledgers** (F/PRD/10, 22 to 24 and F/STR/02): opening stock from the last closing stock
  (already), and the store register kept in step with the issues and returns.

### Maintenance
- **One breakdown entry, two records**: the F/MNT/05 memo fills the F/MNT/06 breakdown register's line.
- **F/MNT/09 and F/MNT/10 glass and wooden articles**: the week's check ready from the register; the person marks
  only what is broken or missing.
- **F/MNT/11 lux**: the next measurement date and the areas ready.

### Purchase
- **F/PUR/06 supplier performance worked out**: lots received and rejected per supplier from the incoming inspection
  records, the quality rating and the grade calculated, ready to review.
- **F/PUR/03 approved supplier list kept up to date** from registrations (F/PUR/01), audits (F/PUR/02) and ratings.
- **Supplier audits due by the supplier's risk**, with reminders; registration (F/PUR/01) sent to a new supplier as a link.

### Marketing and CAPA
- **F/MKT/02 feedback analysis worked out from the F/MKT/01 forms**, and the yearly feedback request sent to each
  customer as a link.
- **F/MKT/04 complaint trend worked out every month** from the complaint records, by category.
- **CAPA steps with their own due dates**, each owner reminded.

### System / Management
- **F/SYS/01 and F/SYS/02 master lists kept in step with DCRS**: a format edited in DCRS gets its new revision date on
  the list by itself, and **F/SYS/03 change request drafted** for approval at the same time.
- **F/SYS/16 objectives**: the monthly Actual filled for every figure DCRS already knows (complaints, feedback %,
  supplier ratings, trainings held vs planned, audit NCs closed); sales figures stay typed.
- **F/SYS/12 and F/SYS/04 meeting packs**: the month's figures (CCP deviations, complaints, NCs, pest trends, overdue
  records) gathered into the agenda before the meeting.
- **Traceability in one click** (F/SYS/14, 15, F-QA-01, mock withdrawal F/SYS/13): from a lot or a job, every incoming,
  production, QC and dispatch record that carries it. Needs the job and lot numbers on the records, so it comes after
  the job cards.

### Store and Dispatch
- **F/STR/01 incoming vehicle starts the inspection** (above).
- **F/DISP/01 transporter agreement**: renewal reminders a month ahead; **F/DISP/02 container inspection** ready per
  dispatch with the vehicle and transporter.

## Never automated

Readings, counts, results, pass or fail, findings, signatures, the name of whoever checked, and an actual date with no
record behind it. These stay the person's, entered quickly on the phone or the website. This is what keeps the records
true for an auditor (REQUIREMENTS §98).

## Order and size

1. **Training chain and the other planning calendars** (asked for): about 3 to 4 working days with tests.
2. Worked-out analyses (F/HR/21, F/MKT/02, F/MKT/04, F/PUR/06, F/SYS/16 actuals): about 2 days.
3. Records that start other records (store entry → inspection, breakdown memo → register, format edit → change
   request and master list): about 2 days.
4. Self-fill links for visitors, applicants, suppliers and customers: about 2 days.
5. Traceability in one click: after the job cards are in DCRS.

## What is needed from the owner

- Which suggestions to build, beyond the first.
- The F-HR-10 Training Imparted Record paper (and the other hard copies in docs/document-coverage.md).
- For the calendars' Actual: read from the training record, as the PM schedule does (recommended: always right, never
  typed twice), or written into the calendar when the training record is verified.
