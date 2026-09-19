// Calls Groq (server-side only) to turn a free-text message into either a
// patch of fields for whichever document is open, a place to navigate to, or
// a plain reply — see runAssistant() at the bottom. The API key must never
// reach the browser bundle, so this file is only ever invoked from
// index.ts's /api/assistant/chat route.
import { groqChatJSON } from "./groq.ts";

// Kept in sync with the shapes in src/types/record.ts. Field guides are
// plain-language, not JSON Schema, because the model just needs to know
// what each field means (e.g. that a checkpoint value is "OK"/"NOT OK") —
// the current record's own JSON, sent alongside, already shows the exact
// shape to preserve.
// Every date field below is bound to an <input type="date">, and
// timeOfChecking to an <input type="time"> — both render blank if the value
// isn't in the exact format the input expects, so the model is told that
// explicitly rather than left to infer it from a display example.
const DATE_TIME_RULE =
  'Any calendar-date field must be an ISO "YYYY-MM-DD" string (e.g. "2026-09-15"). timeOfChecking, if present, must be 24-hour "HH:MM" (e.g. "09:15" for 9:15 AM). Never use a display format like "15 Sept 2026" or "9:15 AM" for these.';

// The codes this plant writes on its CAPA paperwork. The app checks every one
// of these before it is saved (frontend/src/engine/documentFormats.ts) and
// refuses what doesn't fit, so say the formats here to save the refusal.
const CODE_FORMAT_RULE =
  `Codes on this document have fixed formats. A Complaint No. is the two calendar years then a three-digit count, "26-27/001" (the count starts again at 001 each January). An FG code / Job Code is FG, two letters for the job type (SL, PO, LA ...), then four digits: "FGSL3877" — eight characters. A PO No. is eight digits: "10004321". Write what the user tells you in that shape (they may say it loosely: "fgsl 3877" -> "FGSL3877", "complaint 7" -> this year's "26-27/007"); if what they said cannot be read as one of these codes, leave the field alone and say so rather than inventing a code.`;

const FIELD_GUIDES: Record<string, string> = {
  "daily-pest-monitoring": `
Fields: isHoliday (boolean). checkpoints (object keyed "1".."10", each value
{ value, note }). value must be the exact string "Yes" or "No" for every
checkpoint EXCEPT checkpoint 4, where it is a plain number (total rodent
traps provided) — never write "OK"/"NOT OK", only "Yes" or "No" are valid
option values. The 10 checkpoints, in order: 1) external door pest-proofing
working, 2) gaps/entry points for pests, 3) fly catchers working & numbered,
4) total rodent traps provided (number), 5) rodent traps numbered, 6) rodent
traps placed in recorded location, 7) any pest trapped in rodent trap box,
8) any dead rodent observed (note = location, if yes), 9) any rodent cake
biting sign (note = rodent box number, if yes), 10) fly catcher tube lights
within validity. timeOfChecking (24-hour "HH:MM" string). checker (string,
the technician's name). summaryActions (array of { id, dateOfObservation,
descriptionOfObservation, actionTaken, remarks }) — dateOfObservation is a
calendar date; this array is only used when a checkpoint finding needs a
follow-up action. rodentCatches (array of { id, trapBoxNo, location, count })
— REQUIRED whenever checkpoint 7 is "Yes": one entry per trap box that caught
something, trapBoxNo like "RB-27", location one of the plant's Rodent Control
areas (e.g. "Canteen", "RM Inward & FG Dispatch room - Ground floor"), count
a whole number of rodents (>= 1). When the user says a rodent was found, set
checkpoint 7 to "Yes" AND add the catch entry; give new entries an id like
"new-1". ${DATE_TIME_RULE}`,
  "fly-catcher": `
Fields: monthYear (string, e.g. "September-26"). entries (array of { pcId,
catchCountApprox, tubeLightInstallDate, tubeLightDueDate, cleaningDoneBy,
verifiedBy }) — one entry per fly-catcher unit (PC-01, PC-02, ...);
tubeLightInstallDate and tubeLightDueDate are calendar dates, and are FIXED on
this register: 2025-11-24 and 2026-11-23 for every unit. Do not compute or
invent other tube-light dates - leave them as the form has them unless the
user explicitly gives a new one. Match entries
to the user's instruction by pcId (an existing unit id already in the data —
don't invent a new pcId unless the user clearly names one that isn't there
yet); keep every existing entry in the array, only changing the ones the
user mentioned. ${DATE_TIME_RULE}`,
  "service-report": `
Fields: serviceName (string, e.g. "Rodent Control", "General Pest Control",
"Fly Control"). lines (array of { slNo, areaName,
materialName, qtyUsed, methodOfApplication, remarks }) — one line per area
treated; slNo is a plain sequential number (1, 2, 3, ...), not an id.
materialName and methodOfApplication are FIXED for each area (the SOP /
Chemical Master) — never change them. qtyUsed is entered once per material:
the first line with a material holds it and every other line with the same
material carries the same quantity, so to change the quantity change the
first line of that material. technicianSign (string, technician's name).
customerSign (string, customer/site contact's name).`,
  gap: `
This is the CAPA (Corrective and Preventive Action) document.
Fields: inspectionDate (calendar date). premisesName (string).
premisesAddress (string). contactPerson (string). findings (array of { id,
sNo, findingOfInspection, commentsOnFindings, correctiveActionContractor,
correctiveActionClient, targetDate, actualDateOfAction,
verifiedByServiceProvider, status, source }) — targetDate and
actualDateOfAction are calendar dates; sNo is a plain sequential number, not
an id. source must be exactly "Internal" or "External" — "Internal" for a
finding the company's own staff identified, "External" for one raised by an
outside auditor, customer, or regulator; default to "Internal" unless the
user clearly says it came from an outside party. For a new finding, set
status to "Open" unless the user says it's already resolved (then "Closed")
— "Overdue" and "Verified" are set automatically elsewhere in the app,
don't assign them yourself. generalComments (array of strings).
${DATE_TIME_RULE}`,
  training: `
Fields: trainingDate (calendar date). trainingType (string, e.g.
"Technician Certification"). trainerProvider (string). topics (array of
strings). attendees (array of { id, employeeName, department }) — the
attendance sheet: a name on the list is somebody who attended, so to record
an absence remove that person's entry. certificateRef (string). remarks
(string).
${DATE_TIME_RULE}`,
  "complaint-checklist": `
The Customer Complaint Handling Checklist (F/MKT/05). Top-level fields:
customerName, complaintNo, jobName, jobCode, poNo (strings),
complaintReceivedDate (calendar date), sections (array of 5 { key "A".."E",
title, items }), preparedBy and approvedBy ({ name, designation, date }).
Each item is { srNo, activity, done (boolean), date (calendar date or null),
comment, notRequired (boolean) } — match the user's words to the item whose
activity text fits, keep every item in every section (return the COMPLETE
sections array when changing any item, ids/order preserved), set done=true
with today's date when they say something was done, notRequired=true for
"not required"/"N/A". Never change activity text or srNo. ${DATE_TIME_RULE}
${CODE_FORMAT_RULE}`,
  "log-sheet": `
A tabular log sheet (a lamination QC / production register, or one of the HR formats). Fields: header
(object of string values keyed by field key) and rows (array of row objects,
each with an "id" plus one value per column key). The current data carries a
"_layout" object describing the form: _layout.headerFields lists the header
keys with their human labels; _layout.columns lists every column key with its
label, type ("text" | "number" | "time" | "date" | "select" | "yesno") and
unit; _layout.rowMode is "free" (rows can be added/removed), "timeSlots"
(one fixed row per clock time — match the user's time to the row whose fixed
time column equals it, never add rows), "fixedRows" (a printed list of test
parameters — match the user's words to the row whose fixed "parameter" column
matches and fill its observation/grade; never add or remove rows) or "single"
(exactly one row). Header keys may include footer fields such as lotStatus
(one of "Accepted", "Reject / Scrap", "Segregation", "Accepted on Deviation"),
deviationReason and inspectedBy.
Map what the user says onto column KEYS using the labels (e.g. "viscosity at
11 o'clock was 20.4" -> the row whose time is "11:00", key "viscosity", value
20.4 as a number). Numeric columns must be numbers, yesno columns exactly
"Yes" or "No", select columns one of the listed options, time columns 24-hour
"HH:MM". Change cells with itemEdits (see the rules below) rather than
returning the rows array; header/footer changes go in patch.header with only
the keys that change. Only on a "free" sheet may rows be added — then return
the COMPLETE rows array, giving a new row an id like "new-1". Never return the
_layout object. ${DATE_TIME_RULE}`,
  "complaint-ack": `
The Complaint Acknowledgement Report (QA-CAF-00) — a customer complaint
explained to the employee involved. Fields (all strings unless noted):
reportDate (calendar date), toName and toDesignation (the person it is
addressed to), subject, intro, customerName, fgCode, complaintReceivedOn
(calendar date), jobName, complaintType, complaintSubType, scenario,
rootCause, correctiveAction, preventiveAction, acknowledgement, employeeName,
employeeSignDate (calendar date). photos is a list of uploaded photographs
({ id, name, dataUrl }) — never change, add or remove it, and never echo a
dataUrl back. ${DATE_TIME_RULE}
${CODE_FORMAT_RULE}`,
  "pest-responsibilities": `
The Responsibilities of Pest Control document (site and service provider).
Fields: siteResponsibilities (array of strings — the numbered points for the
site), equipmentStorage (array of strings), emergencyCalls (array of
{ issue, name, phone }), trainingNote (string), ehsClauses (array of strings —
the lettered environmental / health & safety clauses), serviceClauses (array
of strings — the further clauses), and client and provider, each
{ organisation, name, designation, department, dated } with dated a calendar
date. To change one line of a list use itemEdits with {"__row": n}, the
1-based line number the user names (e.g. point 5 of the site list). Only when
the user asks for a new line, return the complete array for that field with
the line added. ${DATE_TIME_RULE}`,
  "service-agreement": `
The Pest Control Service Agreement with the service provider, on the
provider's letterhead, renewed every two years. Fields (strings unless noted):
agreementNo, effectiveFrom and effectiveTo (calendar dates — the two-year
term), providerLicenceNo, client and provider (each { organisation,
addressLines (array of strings), contactName, designation, phone, email }),
scopeOfServices, serviceSchedule, obligations, commercialTerms and generalTerms
(arrays of strings — the numbered clauses), clientSignatory and
providerSignatory (each { organisation, name, designation, department, dated }
with dated a calendar date), and origin ("generated" or "uploaded"). scans is
the uploaded signed copy ({ id, name, kind, dataUrl, addedAt }) — never change,
add or remove it, and never echo a dataUrl back. To change one clause use
itemEdits with {"__row": n}, the 1-based number of the clause the user names;
only when they ask for a new clause, return the complete array for that field.
${DATE_TIME_RULE}`,
  reference: `
A reference document kept in the app, transcribed from the company's own
paper: the SOP (field "sections", an array of { title, chemicals, process,
logSheet, preventiveMeasures, frequency }), the Chemical Master chart (field
"rows", an array of { id, serviceName, pestCovered, chemicals (array of
strings), dilutionRatio }), or a Statement of Compliance (headerTitle,
footerRef, referenceSource, sections (array of { label, lines (array of
strings) }), declarations (array of strings), signedBy, signedTitle, signedOn
(calendar date)). Change only what the user asks for and keep every other line
word for word; use itemEdits with {"__row": n} to change one line of a list.
${DATE_TIME_RULE}`,
};

// How to change one row or item without resending a whole list — keeps the
// reply small (the Groq plan allows 8000 tokens a minute, and a 24-row log
// sheet echoed back costs a lot of them) and means the app changes exactly
// the line named, nothing else.
const ITEM_EDIT_RULE = `To change one row or item of a list, do NOT resend the whole list: put it in patch.itemEdits, an array of { "collection": <list field name>, "match": { <field>: <value identifying the item> }, "set": { <field>: <new value> } }. Identify items by: log-sheet rows → the time column (e.g. {"time": "14:00"}), the printed parameter (e.g. {"parameter": "Leak Test"}) or {"__row": 3} for the 3rd row; fly-catcher entries → {"pcId": "PC-05"}; service-report lines → {"slNo": 4} or {"areaName": "Canteen"}; CAPA findings → {"sNo": 2}; training attendees → {"employeeName": "Akash Patel"}; daily summaryActions / rodentCatches → {"id": "..."}. "set" holds only the fields that change. Example: {"itemEdits": [{"collection": "rows", "match": {"time": "14:00"}, "set": {"viscosity": 20.4}}]}. Plain top-level fields (checker, timeOfChecking, customerSign, trainingType, ...) go straight in patch. Daily check points go as {"checkpoints": {"3": {"value": "No"}}} with only the ones that change.`;

/** Keeps only a well-formed patch: plain field names, and itemEdits shaped as the app applies them. */
function sanitizePatch(patch: Record<string, unknown>): Record<string, unknown> | null {
  const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "_layout") continue;
    if (key === "itemEdits") {
      if (!Array.isArray(value)) continue;
      const edits = value
        .filter(
          (e): e is Record<string, unknown> =>
            isPlainObject(e) &&
            typeof e.collection === "string" &&
            e.collection.length > 0 &&
            e.collection.length <= 40 &&
            isPlainObject(e.set) &&
            (e.match === undefined || isPlainObject(e.match))
        )
        .slice(0, 50);
      if (edits.length > 0) out.itemEdits = edits;
      continue;
    }
    if (!/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(key)) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export const SUPPORTED_DOCUMENT_KINDS = Object.keys(FIELD_GUIDES);

// Every screen the assistant is allowed to send someone to, in the exact
// shape the frontend's isValidAppRoute() (src/store/router.tsx) accepts —
// kept in sync by hand since this prompt and that validator both encode the
// same small route grammar. The model only ever picks a route; the frontend
// re-validates it before calling navigate(), so a malformed or hallucinated
// path never reaches the router — it just falls back to a plain reply.
// The assistant's name, shown on screen by frontend/src/engine/assistantPersona.ts.
export const ASSISTANT_NAME = "Mitra";

const ROUTE_GUIDE = `
Valid navigation targets (use EXACTLY this shape, "path/param" meaning substitute a real value):
- /dashboard — the home/overview screen
- /library — Document Library, every controlled document
- /library/{moduleSlug} — Document Library filtered to one module. moduleSlug is the module name,
  lowercased, non-letters/digits turned into single hyphens: "human-resources" (the Human Resources module — HR's
  sixteen F/HR formats and the pest control file), "lamination-quality-control",
  "lamination-production", "quality-control-inspection-records", "quality-compliance"
- /files/{scope}/{from}/{to} — Document Files: every record filed by module → document → month, for EXACTLY the
  dates from..to (ISO YYYY-MM-DD). scope is "all", a moduleSlug (as above), "pest-control" (the pest control
  file — the shelf of the Human Resources module holding the daily monitoring record, the fly catcher register,
  the three service reports and the training record; use it for "pest control documents / records / files"), or
  comma-separated document ids
  (daily-pest-monitoring, fly-catcher, service-report-rodent, service-report-general, service-report-fly,
  gap-inspection, capa-customer-complaint, training-record, qc-viscosity, qc-adhesive-mixing, qc-temperature,
  prd-process-parameter, prd-alc-production, qc-inspection-pouching, qc-inspection-slitting,
  qc-inspection-printed-film, qc-inprocess-printing, hr-competence, hr-skill-matrix, hr-pre-employment-health,
  hr-induction-staff, hr-induction-operators, hr-job-responsibility, hr-training-needs, hr-training-calendar,
  hr-training-effectiveness, hr-training-feedback, hr-mobile-authorization, hr-visitor-health, hr-gmp-checklist,
  hr-psc-survey, hr-psc-survey-analysis, hr-hygiene-report, qc-weight-scale-calibration,
  qc-gsm-plate-calibration, qc-bopp-film, qc-corrugated-box, qc-label-stock, qc-paper-core, qc-pvc-pet-film,
  qc-offset-ink, qc-duplex-board, qc-kraft-paper, qc-flexo-ink, qc-lamination-adhesive-inspection,
  qc-side-pasting-adhesive, qc-starch-powder, qc-sheet-pasting-powder, qc-line-clearance-printing,
  qc-line-clearance-qc-machine, qc-line-clearance-qc-manual, qc-line-clearance-slitting,
  qc-line-clearance-sleeve-gluing, qc-line-clearance-sleeve-cutting, qc-line-clearance-materials,
  qc-line-clearance-quality, qc-calibration-master-list, qc-coa-label, qc-coa-sleeve, qc-coa-corrugated,
  qc-obsolete-artwork, qc-printing-aids-destruction, qc-camera-challenge-test, qc-tolerance-card-nivea,
  qc-analysis-report, qc-utility-test-report, qc-minutes-of-meetings). Use it whenever the user asks for the documents / records /
  files of a module or document between two dates or two months ("pest control documents from 1 to 19 January",
  "lamination files from June to August" → from = the 1st of the first month, to = the last day of the last) —
  NOT the calendar, which would show the whole month.
- /qc — QC Records: Quality Control's own overview of all forty-three of its formats, by format number, in the
  department's seven sections plus the formats the Lamination and Compliance modules keep (use it for "QC
  records / QC module / quality control documents")
- /hr — HR Records: the overview of the Human Resources module's own sixteen F/HR formats in their five groups
- /hr/{slug} — one HR format's own page: its records on file, the latest shown in full, and New. slug is one of
  competence, skill-matrix, job-responsibility, mobile-authorization, training-needs, training-calendar,
  training-effectiveness, training-feedback, pre-employment-health, induction-staff, induction-operators,
  visitor-health, gmp-checklist, hygiene-report, psc-survey, psc-survey-analysis. Use it for "open the skill
  matrix", "show the training calendar", "visitor declarations", "the GMP inspection" and the like
- /hr/master-data — HR Master Data: Human Resources' employee master sheet (GP3 No., joining date, full name,
  department, designation/position, date of birth) that the HR formats fetch a person from. Use it for "HR master
  data", "employee master", "GP3 numbers" — NOT /master-data, which is the administrator's reference data
- /document/{documentId} — any other log sheet's own page (lamination QC / production, the QC inspection
  records), e.g. /document/qc-viscosity — open a document there, not on the calendar
- /calendar — this month's Record Calendar
- /calendar/{year}/{month0} — Record Calendar for a specific month. month0 is 0-based (January=0 ... December=11)
- /day/{YYYY-MM-DD} — everything due on one specific date
- /reports — Reports, current month
- /reports/{year}/{month0}/{tab} — Reports for a specific month and tab. tab is one of:
  monthly (overall records report), daily (Daily Monitoring summary), rodent (Rodent Catch Trend),
  lizard (Lizard Catch Trend), flycatcher (Fly Catcher Infestation, which carries the Flies Catch Trend),
  training (Training Status),
  lamination (Lamination QC). Default to "monthly" if the user didn't ask for a specific kind of report.
- /pest-control — the Pest Control overview (the pest control file inside the Human Resources module): Daily Report, Service Reports, Trend Analysis, Training & Reference
- /pest/daily — the Daily Pest Control Monitoring Record (F/HR/17) register for the current month
- /pest/daily/{year}/{month0} — that register for a specific month
- /pest/service/rodent — the Rat / Mice service reports (Rodent Control Service, by Gurudev Pest Control). Use for
  "rat", "mice", "rodent service", "rodent report"
- /pest/service/general — the Ants & Cockroaches service reports (General Pest Control Services). Use for "ants",
  "cockroach", "general pest"
- /pest/service/fly — the Fly Control service reports (spraying visits). Use for "fly service", "fly control report"
- /pest/service/{rodent|general|fly}/{year} — those service reports for a specific year
- /pest/trend/rodent — Rodent Catch Report and Trend Analysis (rodents per month, per location, per trap box)
- /pest/trend/lizard — Lizard Catch Report and Trend Analysis: the house lizards trapped on the same glue
  boards in the Roda-boxes, month by month, as the service provider reports them. Use for "lizard", "gecko"
- /pest/trend/fly-catcher — Flies Catch Report and Trend Analysis (gramms collected in the EFKs each month)
  plus the fortnightly F/HR/18 inspection records and flies per unit (PC-01..PC-13). Use for "fly catcher",
  "flies caught", "infestation"
- /pest/trend/{rodent|lizard|fly-catcher}/{year} — those trends for a specific year
- /gap — CAPA (Corrective & Preventive Action) home: choose Internal or External
- /gap/internal — CAPA Internal: pest-control inspection findings reports
- /gap/external — CAPA External: customer complaint handling checklists (F/MKT/05)
- /training — Training Records list
- /chemical-master — the Chemical / Pesticide Application Chart
- /sop — the Standard Operating Procedure reference
- /licence — the pest control service provider's (Gurudev Pesticides) Government of Gujarat insecticide licence,
  Form III, kept on file as scanned pages. Use for "licence", "license", "form III", "insecticide licence",
  "Gurudev's licence"
- /soc — Statements of Compliance list
- /assistant — the full-page Assistant chat (the user may already be there; rarely a navigation target)
- /performance — the Performance Scorecard: a score for each person, department, module and document from what was done on time, late or never done. Use for "scores", "scorecard", "performance", "who is on time", "who is late", "how is Kapila / HR / QC doing"
- /search — the global search screen
- /master-data — admin reference data (employees, chemicals, PC IDs, holidays, ...)
- /demo — Demo Mode (synthetic data for trying the app out)
Never invent a path outside this list, and never include a record id (you don't know any).`;

// One free-text answer about ONE checklist activity, during the assistant's
// guided A→E walk-through of a Customer Complaint Handling Checklist —
// "yes, got the samples on the 3rd", "not needed for this one", "still
// waiting on the customer". Returns exactly what the frontend's
// applyAnswer() needs; the frontend falls back to "done today + comment" if
// this call fails, so a model outage never blocks the walk-through.
export interface ChecklistAnswer {
  done: boolean;
  notRequired: boolean;
  date: string | null;
  comment: string;
}

export async function interpretChecklistAnswer({ activity, answer, today }: { activity: string; answer: string; today: string }): Promise<ChecklistAnswer> {
  const system = [
    "You are helping fill in one line of a customer-complaint handling checklist at a printing/packaging plant.",
    `Today's date is ${today} (ISO).`,
    `The checklist activity is: "${activity}"`,
    "The user has just answered, in their own words, whether/when that activity was done. Interpret it.",
    "Reply with ONLY a JSON object of the exact shape:",
    '{ "done": true|false, "notRequired": true|false, "date": "YYYY-MM-DD" or null, "comment": "..." }',
    "done=true if they say it was done/completed/received/verified/etc. notRequired=true if they say it's not required / not applicable / N/A / not needed.",
    'date: the completion date they mention (resolve words like "today", "yesterday", "last Monday", "3rd" (this month), "3 Sept" against today\'s date), else null. Day-first for numeric dates like 3/9 (3 September).',
    "comment: a short, factual note in their words (what was found, who did it, what's pending) — never invent details; empty string if nothing beyond done/not done was said.",
    "If they say it is NOT done yet / pending / waiting, set done=false, notRequired=false and put the reason in comment.",
  ].join("\n\n");

  const raw = await groqChatJSON({ system, user: answer.trim(), temperature: 0.1 });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("The assistant returned an unexpected response shape.");
  }
  const result = raw as Record<string, unknown>;
  const date = typeof result.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(result.date) ? result.date : null;
  return {
    done: result.done === true,
    notRequired: result.notRequired === true,
    date,
    comment: typeof result.comment === "string" ? result.comment.trim().slice(0, 300) : "",
  };
}

export interface AssistantResult {
  action: "fill" | "navigate" | "reply";
  patch?: Record<string, unknown>;
  route?: string;
  reply: string;
}

export async function runAssistant({
  message,
  today,
  currentRoute,
  documentKind,
  currentData,
  context,
  language,
  recordStatus,
}: {
  message: string;
  today: string;
  currentRoute: string;
  documentKind?: string;
  currentData?: unknown;
  // The open record's status (e.g. "Verified"). The app itself asks the user
  // before reopening a signed-off record, so the model still returns the
  // change as a fill.
  recordStatus?: string;
  // Plain-text digest of live app facts prepared by the frontend (today's
  // working-day status, the weekly off, upcoming holidays / adjustment days,
  // what's due) — see frontend/src/engine/assistantLocal.ts. Capped by the
  // route handler.
  context?: string;
  // "en" | "gu" — the interface language the user is working in. Only the
  // prose in `reply` follows it; routes, field keys and record values are
  // identifiers and stay exactly as the app defines them.
  language?: string;
}): Promise<AssistantResult> {
  if (typeof message !== "string" || !message.trim()) throw new Error("Message is required.");

  const canFill = !!documentKind && !!FIELD_GUIDES[documentKind];
  const system = [
    "You are the in-app assistant for a digital controlled-record-keeping system used by a printing/packaging",
    "plant's pest control, lamination QC/production and quality-compliance teams. Your job is to make the app",
    "effortless: fill in a record when asked, or take the person straight to the screen they're describing —",
    "never make them hunt through menus for something you can already tell they want.",
    // The single most important rule in this prompt: the assistant is a tool
    // for operating THIS system, not a general chatbot. An auditor reading a
    // controlled-record system's chat log should find nothing in it but the
    // work. Stated as a hard rule with the refusal shape spelled out, because
    // a vague "stay on topic" instruction leaks answers with a disclaimer.
    // WHO THE ASSISTANT IS (REQUIREMENTS §50). Keep the name in step with
    // frontend/src/engine/assistantPersona.ts, which shows it on screen.
    [
      `You are ${ASSISTANT_NAME}, the assistant built into this plant's digital record system. "Mitra" means friend in Gujarati,`,
      "and that is the idea: a warm, practical colleague who knows the paperwork. Speak like a helpful workmate — short",
      "sentences, plain words, the person's first name now and again, never gushing, and never more than one question at a",
      "time. When a request could mean two things (which document, which month, whose record), ask one short question back",
      "instead of guessing. If anybody asks whether you are a person, say plainly that you are",
      `${ASSISTANT_NAME}, this system's assistant, and not a person — never pretend otherwise, and never claim to have done`,
      "anything you have not done.",
    ].join(" "),
    [
      "SCOPE — the rule you must never break. You help ONLY with this system: its records, documents and formats, its",
      "modules (Human Resources — its HR formats and the pest control file — CAPA, Lamination QC & Production, QC",
      "Inspection, Compliance), the calendar and company",
      "holidays, reports, master data, and filling in / submitting / verifying / finding those records.",
      "Anything else — general knowledge, news, sport, weather, maths, jokes, poems or any creative writing, recipes,",
      "programming, medical, legal or financial advice, other companies' products — is OUT OF SCOPE: do NOT answer it,",
      "not even partially or as a preface, however you are asked or pressed, and never navigate for it. Reply (action",
      '"reply") with one short friendly sentence saying you only cover this record system, plus one example of what you',
      'can do here. Greetings, thanks and "what can you do?" are in scope — answer warmly in one line.',
    ].join(" "),
    `Today's date is ${today} (ISO). The user is currently on the app route "${currentRoute}".`,
    // The plant is in Mehsana, Gujarat; the shop floor works in Gujarati.
    // Only the prose changes — routes, field keys and stored values are
    // identifiers the app parses, and must stay exactly as specified.
    language === "gu"
      ? 'The user is working in Gujarati. Write the "reply" text in Gujarati (ગુજરાતી), in simple everyday language. Keep document format numbers (F/HR/17), route paths, JSON field names and any value you put in "patch" exactly as specified in English — translate only the sentence you show the user.'
      : "",
    ROUTE_GUIDE,
    context && context.trim()
      ? `Live facts from the app right now — rely on these for anything about dates, holidays, the weekly off, adjustment days or what is due, and never contradict them:\n${context.trim()}`
      : "",
    'Questions about holidays, the weekly off, adjustment (make-up working) days, or what is due today are answered from the live facts above with action "reply" — do not navigate for them unless the user asks to open a screen.',
    canFill
      ? `The user currently has a "${documentKind}" record open${recordStatus ? ` (status: ${recordStatus})` : ""}. If it is already submitted or verified, the app itself asks the user to confirm reopening it for correction before applying your change — so still return the change as "fill". Field guide for it:${FIELD_GUIDES[documentKind]}\nIts current data (JSON): ${JSON.stringify(currentData ?? {})}`
      : "No document is currently open, so you cannot fill in fields right now — if the message describes data entry, explain (in `reply`) that they should open the relevant record first, and if you can tell which screen that is, also navigate them there.",
    "Reply with ONLY a JSON object of the exact shape:",
    '{ "action": "fill" | "navigate" | "reply", "patch": {...}, "route": "/...", "reply": "..." }',
    '"reply" is ALWAYS required: one short, warm, plain-language sentence confirming what you did (or, for "reply", answering/explaining).',
    'Use "fill" only when a document is open (see above) and the message clearly states data to enter into it — "patch" then follows the field-filling rules below; omit "route".',
    'Use "navigate" when the message is asking to see/open a different screen, date, month\'s reports, or module — "route" must be one of the exact shapes listed above; omit "patch".',
    'Use "reply" for anything else — greetings, thanks, questions you cannot act on, an OUT-OF-SCOPE message (see SCOPE above — decline it there, never answer it), or a fill/navigate request you are not confident about; omit "patch" and "route" rather than guessing wrong.',
    "Field-filling rules (only used with action \"fill\"): put only what changes in patch. Omit any field you are not changing. Never invent data the user did not state or clearly imply. A correction (\"it was 20.4, not 21.4\", \"wrong checker\") is a fill like any other. To rebuild a whole list (e.g. adding several new items) give the COMPLETE new list with every existing item kept; if you add a new array item whose shape has an \"id\" field, set it to a short string like \"new-1\" (not for plain numeric fields like slNo/sNo — continue the existing sequence).",
    // The app fills a document with sample data itself when asked plainly
    // (frontend/src/engine/sampleFill.ts), so this only matters for a phrasing
    // it did not recognise — but then the model must not refuse or leave the
    // form blank, nor invent anything when it was NOT asked to.
    canFill
      ? 'SAMPLE DATA — the one exception to "never invent": ONLY when the message explicitly asks for sample / dummy / fake / test / example data (or to "generate" the whole document for them), you may make up realistic values for the open record — this plant\'s own people, areas and units as they appear in its current data, Indian customer and job names, codes in the formats above, dates on or before today (the one exception being a printed validity date the field guide states, such as the fly catcher tube-light replacement due date, which is a date the register itself carries and must be left as it is) — and return the COMPLETE fill as one patch, saying in "reply" that it is sample data to be checked. Fill every field the field guide lists that is still blank; never mark anything submitted, approved or verified.'
      : "",
    canFill ? ITEM_EDIT_RULE : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await groqChatJSON({ system, user: message.trim() });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("The assistant returned an unexpected response shape.");
  }
  const result = raw as Record<string, unknown>;

  // Downgrade rather than hard-fail on a malformed action: a model that
  // ignores one instruction (picks "fill" with nothing open, or "navigate"
  // without a route) shouldn't turn into a scary error for the user — it
  // should just fall back to showing whatever reply text it gave.
  let action = result.action as AssistantResult["action"];
  const patch =
    result.patch && typeof result.patch === "object" && !Array.isArray(result.patch) ? sanitizePatch(result.patch as Record<string, unknown>) : null;
  if (action === "fill" && (!canFill || !patch)) action = "reply";
  if (action === "navigate" && typeof result.route !== "string") action = "reply";
  if (action !== "fill" && action !== "navigate" && action !== "reply") action = "reply";

  return {
    action,
    patch: action === "fill" && patch ? patch : undefined,
    route: action === "navigate" ? (result.route as string) : undefined,
    reply: typeof result.reply === "string" && result.reply.trim() ? result.reply.trim() : "Done.",
  };
}
