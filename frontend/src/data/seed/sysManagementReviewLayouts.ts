import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";

// SYSTEM / MANAGEMENT — THE MANAGEMENT REVIEW AND ITS OBJECTIVES (REQUIREMENTS
// §76). Three of the Product Safety Team Leader's formats, all three supplied
// FILLED on 25-Sep-2026 as PDFs (source-documents/F-SYS-*.pdf, every page
// rendered unaltered to frontend/public/source/fsys*.jpg so it can be shown
// beside its form). The filled pages are records of their own in
// sysManagementReviewRecords.ts.
//
//   sys-mrm-record  F/SYS/04 (Rev No: 01, Date: 01.04.2025)
//     MANAGEMENT REVIEW MEETING RECORD – BRCGS PACKAGING (ISSUE 7)
//     — "F-SYS-04-Management review meeting agenda & Record_July 2025.pdf",
//       9 pages, the meeting of 21.07.2025 reviewing Jan 2025 to June 2025
//   sys-mrm-agenda  F/SYS/04-A (Rev No: 01, Date: 01.04.2025)
//     AGENDA FOR BRCGS PACKAGING (ISSUE 7) MANAGEMENT REVIEW MEETING RECORD
//     — "F-SYS-04A-BRCGS MRM Notification Record_July2025.pdf", 1 page, the
//       notice of 07.07.2025 for that meeting
//   sys-objectives  F/SYS/16 (00/01.12.2021)
//     QUALITY & PRODUCT SAFETY OBJECTIVES ( Year 2026 )
//     — "F-SYS-16-Quality & Product Safety objectives 2024-25.pdf", an Excel
//       print of 81 pages of which only 1–4 (January to May) and 28–31 (June,
//       Total, % Achieved) carry anything; the other 73 are blank and not shown
//
// VERBATIM MEANS VERBATIM. Every label, heading, printed line and seeded value
// below is the page's own wording, spelling, capitals, dashes and spacing:
// "Pant Head", "PTSL" (twice, beside "PSTL" everywhere else), "coursed",
// "complain", "Polices", "questioner", "BRCGS participate", "1 updated
// published", "deliberated dilution", "Test equipments", "found effective .
// Sleeve", "Director– Sales" (no space before the dash), "Head  – HR" and
// "actioned effectively.  All NCs" (the double spaces the pages really hold),
// "New customer addition -Pouch", the en dash of "Wastage – Pouches" beside the
// hyphen of "Wastage - Labels", the curly ’ of "Jan’25" and "Site’s", and the
// notice's "Date of Notification : -" with the dash it prints after the colon.
// The superscripts of "1st", "2nd" and "3rd" are written on the line. Where the
// text layer and the picture disagree the picture was followed: F/SYS/16's text
// layer repeats a merged cell's words ("3", "15", "10", "95", "To be collected
// in December 2024") on the June pages, where the page shows only the Total;
// F/SYS/04's interleaves the lines of wrapped cells ("PSTL / Manager – QA").
// A line wrapped by its cell is joined with one space, whatever spaces the wrap
// hides; otherwise only spaces a reader cannot see at the start or end of a
// cell are gone.
//
// WHAT HAD TO BE REPRESENTED DIFFERENTLY FROM THE PAPER, AND WHY
//   * F/SYS/04 IS ONE LONG WORD DOCUMENT OF ELEVEN AGENDA ITEMS. A layout has
//     one grid, and the only table the items share a shape with is item 8's
//     objectives table — so that is the grid (its "Sr. no." 1.–19. is the
//     grid's own), everything before it (the meeting, the attendance, items 1
//     to 7 and the first three lines of item 8) is boxes above it, and
//     everything after it (item 8's result, items 9 to 11 and the New Action
//     Item Detail table) is boxes below it.
//   * Each item's lines are boxes whose label starts with the item's printed
//     number and its whole printed heading — "2. Results of Internal, second –
//     Party & Third – party Audits performed during the time period (Internal,
//     External, Customer, Compliance etc.) — Items/records to be reviewed:" —
//     because the boxes are read one at a time (in the change history, in the
//     walk-through) and must say which item they belong to. The item's own
//     wording for each line is kept: "Items/records to be reviewed" (1, 2),
//     "Items/records reviewed" (3 to 9), "Documented information reviewed" (10,
//     11), "Reporting Responsibility / Process Owner" (1 to 6, 8, 9),
//     "Reporting Responsibility" (10, 11).
//   * The paper prints no label over an item's discussion points: in items 2
//     to 9 they simply follow the Items/records line. Their box is called
//     "Discussion" — the app's word — with the points one per line, "• " and
//     all. Items 10 and 11 head their points "□ Discussion Results:" and then
//     print "□ Discussion Results:" AGAIN before the result; the first is
//     their Discussion box, so no two boxes share a label.
//   * The result is a choice of the three results the pages print — "No action
//     required", "Action required", "Effective – No action required". Every □
//     on the pages is printed EMPTY, the result typed beside it; neither the
//     boxes nor the bold and underlining are reproduced. Item 2's result line
//     is printed as a fifth bullet ("• Discussion Results: □ No action
//     required"); the bullet is not kept.
//   * "Reporting Responsibility" and "Items/records reviewed" (and "Documented
//     information reviewed") are PARAGRAPH boxes, not one-line boxes: they hold
//     lists up to 170 characters long
//     (item 4's "HACCP Plan, CCP monitoring records, PRP records (Plant
//     hygiene, …)"), and a one-line box shows about 30 characters and cuts the
//     rest off on a record that is read, not written.
//   * ITEM 7 PRINTS NO "Reporting Responsibility" LINE. Its heading runs the
//     process owner into its own parenthesis — "Resources requirements
//     (Resource such as – manpower, CEO (Shail Patel)" — so that whole line is
//     its heading, as printed, and it has no Reporting box. It prints no
//     discussion points either; its Discussion box is there, and empty.
//   * Item 1 has the previous meeting's action items where the other items
//     have their points, so it has no Discussion box: two lines of four boxes
//     ("Line N — Action item:", "Status :", "When:", "Who:"), the When a date,
//     between its Items/records line and its result. The New Action Item Detail
//     table on page 9 is two lines of four boxes the same way. The "1." and
//     "2." printed down its "Agenda Item Ref.#" column are its line numbers, so
//     the Ref.# box is left for the item's number; the table is blank on the
//     page.
//   * The attendance table prints two sets of Name / Designation / Sign side by
//     side over four rows. It is eight lines of boxes, down the left half
//     (Shail Patel, Swarup Rajgor, Kapila Barad, Virat Rajgor) and then down
//     the right (Ajay Vaghela, Chirag Parmar, Parth Chauhan, Nalin Darji). The
//     Sign column is for a handwritten signature and is empty on the page, so
//     it is not a box: the record's own signature is its Submit and Verify.
//   * The page heads its company line with the period "(Jan 2025 to June
//     2025)" and writes the time "( 1.30 PM to 3.00 PM)" beside the Meeting
//     Date. Neither has a label on the paper, so their boxes are named in the
//     app's words ("Period under review" is item 3's own phrase for it). The
//     title's "– 21.07.2025" is the Meeting Date box, not a box of its own.
//   * F/SYS/04-A's "Agenda Points for MRM meeting" and its eleven points are
//     printed on the form BELOW the participants; a layout's printed lines are
//     drawn above all its boxes, so they stand at the top. Its "Sr.No." 01–08
//     is the grid's own. The Signature column is a column to write in (fresh),
//     empty on the page.
//   * F/SYS/16 PRINTS TWO LINES PER OBJECTIVE — Plan and Actual (objective 8 a
//     third, "Actual - meters") — with the months across. The strip is TURNED,
//     as F/MNT/04's is: ONE LINE PER OBJECTIVE, so the grid's Sr. No. is the
//     paper's 1–18, with Plan and Actual side by side under each month, Total
//     and % Achieved, and objective 8's third line as its own "Actual - meters"
//     heading at the end (January to June and Total) — only objective 8 writes
//     there. The "% Achieved" cell the paper gives that third line of its own is
//     not repeated.
//   * F/SYS/16 WRITES SOME VALUES ONCE ACROSS SEVERAL MONTHS — MERGED CELLS
//     spanning January to June: the plans "3" (objectives 9, 10), "15" (13),
//     "10" (14) and "95" (16), the actual "To be collected in December 2024"
//     (16), and the Plan and Actual lines of objectives 4 to 6 (Customer
//     feedback) and the Plan of 11, which are merged and empty. Excel keeps a
//     merged cell's value in its first cell, and so does the record: in
//     January, with February to June blank. Every figure is text, as the
//     sheet's are ("#DIV/0!", "0.15", "8.0"). The sheet's yellow — the Actual
//     lines of objectives 1 to 6, and the Total Actual of 3 to 6 — is not
//     reproduced. The title's year is a box of its own.
//   * On F/SYS/04 the yellow highlighting of item 8 (three of its bullets and
//     the objectives table) and of the New Action Item Detail is not
//     reproduced either.
//   * Every page's own format line ("Format No.: F/SYS/04  Rev No: 01  Date:
//     01.04.2025  Page No.: 1 Of 9", "F/SYS/16 (00/01.12.2021)") is the
//     document header the app prints on every record, so it is not a field.
//
// WHAT THE PAGES SAY THAT DOES NOT ADD UP (each kept exactly as written)
//   F/SYS/04  Item 1's Discussion Results is left empty — the □ unmarked and no
//             result written. Item 7's result is "Action required", yet the New
//             Action Item Detail table is blank: the action is recorded nowhere.
//             Item 2 counts "06 NCs" in the internal audits of Jan’25 to
//             March’25, but the supplied audit papers show one audit in that
//             quarter — F/SYS/05 for 2025 marks only 17.02 — and its F/SYS/06
//             summary (Audit Sr. No. 01/2025) and F/SYS/08 report raise two
//             NCs, 4.2.1 and 4.7.6. Item 2's bullet for Apr’25 to June’25 is
//             the same sentence with the period and the Issue changed, "06
//             NCs" included; no Issue 7 audit is among the supplied papers.
//             Item 3 counts "1 customer complaint for Labels" in Jan–June 2025;
//             the objectives table's "Customer complaints Product Quality -
//             Labels" has 2 achieved for the same period. Item 5 (legislation)
//             reviews "Customer feedback & Customer complaint data" — item 3's
//             line, word for word. Item 6 writes nothing after "Items/records
//             reviewed:" and item 11 nothing after "Documented information
//             reviewed:" (both left blank). Item 6 says the Sleeve and Pouch
//             mock recalls and forward traceability are "planned before
//             15.02.2025" — in a meeting held on 21.07.2025; the F/SYS/13 pages
//             show the Pouch withdrawal done on 28.01.2025 and the SHRINK SLEEVE
//             on 05.02.2025. Item 8 counts 19 objectives established and 19
//             achieved above 90%, while objective 3 is "NA" and objective 12 "0
//             / NA" (both "New objective added"). The table heads the next
//             period "(June ~ Dec)" after a review period of "(Jan to June)".
//             Objectives 8 (Wastage - Labels) and 9 (Wastage – Pouches) both
//             read 9.82%. Objective 16 gives no Justification. Item 9 names
//             "PSTL (Mr. Vivek)" — every other line names the PSTL as Kapila
//             Barad — and "Mr. Vipul" (Sr. Manager – HR & admin), who is not on
//             the attendance list. Item 10 reviews the "BRCGS – Packaging Issue
//             06 manual" at an Issue 7 review. Nobody has signed the attendance.
//             Ajay Vaghela is "Manager – Production" here and "Manager –
//             Production & Maintenance" on F/SYS/04-A.
//   F/SYS/04-A  Line 08 is printed with its two cells SWAPPED — "Manager –
//             Store" under Name of Participants and "Nalin Darji" under
//             Designation — and is kept exactly so. No participant has signed.
//             Point 2 opens three brackets and closes two ("(Internal, 2nd Party
//             (Customers) & 3rd Party (Certification body)"); point 6 begins
//             lower-case ("any product safety incidents"). The eleven points are
//             not worded as the record's eleven items (point 4 "Effectiveness of
//             HARA system (…)", item 4 "Review of Hazard & Risk management (HARA)
//             system (…)"); each page keeps its own words.
//   F/SYS/16  The file is named "2024-25", the sheet "( Year 2026 )", and
//             Supplier rating's Actual reads "To be collected in December 2024"
//             — beside a Total Actual of 100. Labels' Total Plan adds up
//             (1927800 a month, 11566800); these do not: Breakdown 175 a month,
//             Total 700 (four months' worth, not six); Wastage 7.5 a month,
//             Total 8.0 (neither the sum nor the average); Store 0.15 a month,
//             Total 0.25; Training programmes Plan 15 but Total Plan 0; GMP
//             non-compliances Plan 10 but Total Plan 0. Wastage - Labels'
//             Actual is "#DIV/0!" in every month and the Total (its "Actual -
//             meters" line is empty), and Labels' Total Actual is 0 with no
//             month written — as are the Total Actuals of objectives 13, 14,
//             15, 17 and 18. New customer addition writes January's Actual (0
//             for Labels, 1 for Sleeve) and leaves the Total blank. The
//             parameter "Breakdown hours" is measured in "Minutes". No %
//             Achieved is written; objectives 1 to 6 and 11 have no plan.
//             Objective 15's cell holds two spaces after "Customer Complaints -",
//             exactly where it wraps, so no reader can see the second; one is
//             kept, as F/SYS/04 prints the same objective.

/** A supplied page, shown unaltered beside the form (REQUIREMENTS §71). */
const page = (file: string, caption: string) => ({ src: `/source/${file}`, caption });

// The datalist of employee names every log sheet draws, for a box or column
// that IS one of the plant's people but whose label does not say "name".
const EMPLOYEES = "log-sheet-employees";

// ===========================================================================
// F/SYS/04 — MANAGEMENT REVIEW MEETING RECORD – BRCGS PACKAGING (ISSUE 7)
// ===========================================================================

/** The results the record's pages print after "Discussion Results:" — the only answers it gives. */
const DISCUSSION_RESULTS = ["No action required", "Action required", "Effective – No action required"];

interface AgendaItem {
  no: number;
  /** The item's whole printed heading, its bracketed description included. */
  heading: string;
  /** The item's own label for who reports it; item 7 prints none. */
  responsibility?: string;
  /** The item's own label for what was reviewed. */
  reviewed: string;
  /** Item 1 has the previous meeting's action items where the others have their points. */
  discussion: boolean;
}

const RESPONSIBILITY_OWNER = "Reporting Responsibility / Process Owner:";
const RESPONSIBILITY = "Reporting Responsibility:";

const MRM_ITEMS: AgendaItem[] = [
  { no: 1, heading: "Follow up action items from previous management review meeting", responsibility: RESPONSIBILITY_OWNER, reviewed: "Items/records to be reviewed:", discussion: false },
  {
    no: 2,
    heading: "Results of Internal, second – Party & Third – party Audits performed during the time period (Internal, External, Customer, Compliance etc.)",
    responsibility: RESPONSIBILITY_OWNER,
    reviewed: "Items/records to be reviewed:",
    discussion: true,
  },
  {
    no: 3,
    heading: "Customer performance indicator, complaints & feedback (surveys, concerns, complaints, positives, customer visits)",
    responsibility: RESPONSIBILITY_OWNER,
    reviewed: "Items/records reviewed:",
    discussion: true,
  },
  {
    no: 4,
    heading: "Review of Hazard & Risk management (HARA) system (Review of HACCP Plan, CCP monitoring, CCP deviation, Pre-requisite status)",
    responsibility: RESPONSIBILITY_OWNER,
    reviewed: "Items/records reviewed:",
    discussion: true,
  },
  { no: 5, heading: "Impact of any applicable legislative & certification scheme changes", responsibility: RESPONSIBILITY_OWNER, reviewed: "Items/records reviewed:", discussion: true },
  {
    no: 6,
    heading:
      "Incidents, corrective actions, out of specification results & non-conforming products (Review of Product safety incidents, corrective actions for process non-conformity, OOS & NC products identified as Incoming inspection stage & In-process stage, Product recall, Product Withdrawal, effectiveness of Mock recall etc.)",
    responsibility: RESPONSIBILITY_OWNER,
    reviewed: "Items/records reviewed:",
    discussion: true,
  },
  { no: 7, heading: "Resources requirements (Resource such as – manpower, CEO (Shail Patel)", reviewed: "Items/records reviewed:", discussion: true },
  {
    no: 8,
    heading: "Site’s performance against the standard & objectives set (Review of Quality & Product safety objectives and targets)",
    responsibility: RESPONSIBILITY_OWNER,
    reviewed: "Items/records reviewed:",
    discussion: true,
  },
  {
    no: 9,
    heading: "Effectiveness of Product defense (TACCP), Product fraud prevention plans (VACCP), Product safety and Quality culture plans",
    responsibility: RESPONSIBILITY_OWNER,
    reviewed: "Items/records reviewed:",
    discussion: true,
  },
  {
    no: 10,
    heading: "Adequacy and awareness of Various Policies (Quality & Product Safety Policy, PRP Polices etc.), Product safety culture",
    responsibility: RESPONSIBILITY,
    reviewed: "Documented information reviewed:",
    discussion: true,
  },
  {
    no: 11,
    heading: "Usage & compliance of BRCGS Logo (V-card, Website, Letterhead, Email signature, Product packaging etc.)",
    responsibility: RESPONSIBILITY,
    reviewed: "Documented information reviewed:",
    discussion: true,
  },
];

const itemLabel = (item: AgendaItem, line: string) => `${item.no}. ${item.heading} — ${line}`;
const mrmItem = (no: number): AgendaItem => MRM_ITEMS[no - 1];

// Who reports an item and what it reviews DESCRIBE the item and repeat from
// meeting to meeting; the discussion and its result are this meeting's own and
// are never carried (a box without autoFill starts blank).
const itemOpening = (item: AgendaItem): LogHeaderField[] => [
  ...(item.responsibility
    ? [{ key: `item${item.no}Responsibility`, label: itemLabel(item, item.responsibility), type: "paragraph" as const, autoFill: { carryForward: true } }]
    : []),
  { key: `item${item.no}Reviewed`, label: itemLabel(item, item.reviewed), type: "paragraph", autoFill: { carryForward: true } },
];
const itemDiscussion = (item: AgendaItem): LogHeaderField[] => (item.discussion ? [{ key: `item${item.no}Discussion`, label: itemLabel(item, "Discussion"), type: "paragraph" }] : []);
const itemResult = (item: AgendaItem): LogHeaderField => ({ key: `item${item.no}Result`, label: itemLabel(item, "Discussion Results:"), type: "select", options: DISCUSSION_RESULTS });
const wholeItem = (item: AgendaItem): LogHeaderField[] => [...itemOpening(item), ...itemDiscussion(item), itemResult(item)];

const ATTENDANCE_LINES = 8;
const ACTION_LINES = 2;

const attendanceFields: LogHeaderField[] = Array.from({ length: ATTENDANCE_LINES }, (_, i) => i + 1).flatMap((n): LogHeaderField[] => [
  { key: `attendance${n}Name`, label: `Attendance ${n} — Name`, type: "text", autoFill: { carryForward: true } },
  { key: `attendance${n}Designation`, label: `Attendance ${n} — Designation`, type: "text", autoFill: { carryForward: true } },
]);

// Item 1's table: the last meeting's action items and how they stand now. Not
// carried from the last record — its item 1 lists the actions of the meeting
// BEFORE it; this meeting follows up the last one's New Action Item Detail.
const followUpFields: LogHeaderField[] = Array.from({ length: ACTION_LINES }, (_, i) => i + 1).flatMap((n): LogHeaderField[] => {
  const line = (label: string) => itemLabel(mrmItem(1), `Line ${n} — ${label}`);
  return [
    { key: `item1Line${n}Action`, label: line("Action item:"), type: "paragraph" },
    { key: `item1Line${n}Status`, label: line("Status :"), type: "text" },
    { key: `item1Line${n}When`, label: line("When:"), type: "date" },
    { key: `item1Line${n}Who`, label: line("Who:"), type: "text", list: EMPLOYEES },
  ];
});

const NEW_ACTION = "New Action Item Detail";
const newActionFields: LogHeaderField[] = Array.from({ length: ACTION_LINES }, (_, i) => i + 1).flatMap((n): LogHeaderField[] => [
  { key: `newAction${n}Ref`, label: `${NEW_ACTION} — Line ${n} — Agenda Item Ref.#`, type: "text" },
  { key: `newAction${n}Item`, label: `${NEW_ACTION} — Line ${n} — Action item:`, type: "paragraph" },
  { key: `newAction${n}When`, label: `${NEW_ACTION} — Line ${n} — When:`, type: "date" },
  { key: `newAction${n}Who`, label: `${NEW_ACTION} — Line ${n} — Who:`, type: "text", list: EMPLOYEES },
]);

/** The discussion points of an item, one per line, as the page bullets them. */
const points = (...lines: string[]) => lines.map((l) => `• ${l}`).join("\n");

/**
 * THE MEETING OF 21.07.2025, box by box, as its nine pages print it — the
 * record's header and footer (sysManagementReviewRecords.ts). The boxes that
 * describe the meeting are also the format's specimen.
 */
export const MRM_2025_07_VALUES: Record<string, string> = {
  reviewPeriod: "(Jan 2025 to June 2025)",
  meetingDate: "2025-07-21",
  meetingTime: "( 1.30 PM to 3.00 PM)",
  meetingTitle: "MRM – BRCGS Packaging (Issue 7)",
  purpose:
    "To ensure that the product safety and quality management system based on requirements of BRCGS – Packaging (Issue 7) is effectively implemented and opportunities for improvement are identified",
  requiredAttendance: "Director, Pant Head, All HODs are required to attend all review meetings. Record attendance below.",
  // Down the left half of the table, then down the right.
  attendance1Name: "Shail Patel",
  attendance1Designation: "CEO",
  attendance2Name: "Swarup Rajgor",
  attendance2Designation: "Director – Sales",
  attendance3Name: "Kapila Barad",
  attendance3Designation: "PSTL / Manager – QA",
  attendance4Name: "Virat Rajgor",
  attendance4Designation: "Director – Operations",
  attendance5Name: "Ajay Vaghela",
  attendance5Designation: "Manager – Production",
  attendance6Name: "Chirag Parmar",
  attendance6Designation: "Manager – Purchase",
  attendance7Name: "Parth Chauhan",
  attendance7Designation: "Manager – Dispatch",
  attendance8Name: "Nalin Darji",
  attendance8Designation: "Manager – Store",

  item1Responsibility: "PTSL – Kapila Barad",
  item1Reviewed: "Status of each action points of previous MRM",
  item1Line1Action: "Existing BRCGS documented management system to be migrated to new version of Issue 7",
  item1Line1Status: "Completed",
  item1Line1When: "2025-04-01",
  item1Line1Who: "Virat Rajgor (Director – Operations)",
  item1Line2Action: "PSTL to be trained for BRCGS – Packaging (Issue 7) LA training coursed",
  item1Line2Status: "Completed",
  item1Line2When: "2025-03-31",
  item1Line2Who: "Virat Rajgor (Director – Operations)",
  // "Discussion Results: □" and nothing after it.
  item1Result: "",

  item2Responsibility: "PTSL – Kapila Barad",
  item2Reviewed: "Internal audit records, Customer audit / visit reports, Certification body audit report",
  item2Discussion: points(
    "Internal audits conducted by trained internal auditor along with external expert for the period between Jan’25 to March’25 as per IQA schedule based on risk assessment, to evaluate the effectiveness & determine improvement opportunities for recently implemented Quality & Product safety management system as per BRCGS Packaging - Issue 6 requirements & there were 06 NCs were observed which had been actioned effectively.  All NCs were categorized in BRCGS Packaging (Issue 6) clauses only. Effectiveness of the corrective action found adequate till date",
    "Internal audits conducted by trained internal auditor along with external expert for the period between Apr’25 to June’25 as per IQA schedule based on risk assessment, to evaluate the effectiveness & determine improvement opportunities for recently implemented Quality & Product safety management system as per BRCGS Packaging - Issue 7 requirements & there were 06 NCs were observed which had been actioned effectively.  All NCs were categorized in BRCGS Packaging (Issue 7) clauses only. Effectiveness of the corrective action found adequate till date",
    "Effectiveness of corrective actions for 8 NCs raised during previous BRCGS Packaging - Issue 6 audits conducted by external certification body (M/s SGS) in October’2024 were also reviewed & found effective",
    "Few customer visits has been carried out but no formal or informal audit has been carried out by the customers"
  ),
  item2Result: "No action required",

  item3Responsibility: "Director Sales & Marketing / Sales team & Manager – QA (Kapila Barad)",
  item3Reviewed: "Customer feedback & Customer complaint data",
  item3Discussion: points(
    "Customer feedbacks are being taken once / year. Customer feedback found 94% for Sleeve, Label 90% & Pouch 93%",
    "Continual orders from existing customers as well as introduction of new customers are overall indicator of improved customer satisfaction & market reputation.",
    "1 customer complaint for Labels, 1 customer complain for Sleeves have been received for the period under review (Jan 2025 to June 2025). RCA & CA are being done & effectiveness of actions in process"
  ),
  item3Result: "No action required",

  item4Responsibility: "PTSL (Kapila Barad)",
  item4Reviewed:
    "HACCP Plan, CCP monitoring records, PRP records (Plant hygiene, Personal hygiene, Pest control, Preventive maintenance, cleaning record, HACCP review records)",
  item4Discussion: points(
    "HARA plan has been recently modified dated 01.04.2025 as per requirements of BRCGS - Packaging, Issue 7. There has been no change in process flow chart",
    "Monthly HARA review being carried out for HARA team, indicates overall HARA system effective. Last review carried out in June 2025",
    "CCM monitoring records (Camera check defect identification & Solvent viscosity) found filled up, verified & no deviation in monitoring as well as implementation found",
    "CCM validation found effective & no formal / informal complaints received from any of the customer, indicating failure of CCM monitoring",
    "PRP records (Personal hygiene, Pest control, Supplier evaluation, Training, Plant hygiene, Housekeeping etc.) found filled up & verified at periodic intervals by PSTL / Head  – HR & admin",
    "Overall, HARA system effective implementation has been found effective",
    "Onsite Process flow diagram verified on 01.04.2025 as per yearly frequency of on-site verification"
  ),
  item4Result: "No action required",

  item5Responsibility: "Director– Sales & Marketing / PSTL & Manager – QA (Kapila Barad)",
  item5Reviewed: "Customer feedback & Customer complaint data",
  item5Discussion: points(
    "There has been no changes or updates in applicable legal requirements such as EC 10/2011 referring to www.ec.europa website",
    "No additional legislation related to Product safety in line with our products so far found. All the Raw material being used meets all applicable legal requirements for Indian, EU & USFDA legislations. RD/05 found updated for all current legislation related to Product safety of IS, USFDA & EC regulations based on TDS received from each RM supplier.",
    "FSSAI regulation updated for usage of recycle % in PET which is not applicable to our site.",
    "Migration test as per EC 10/2011 has been carried out as per yearly frequency",
    "Product safety & quality culture questioner & plan was being implemented & monitored at regular frequency."
  ),
  item5Result: "No action required",

  item6Responsibility: "Respective Production process HOD / Head - QC",
  // "Items/records reviewed:" and nothing after it; the six points follow.
  item6Reviewed: "",
  item6Discussion: points(
    "Product safety incidents (Actual or potential for product contamination) due to documented scenario such as glass breakage, metal contamination etc., Corrective actions report for product & process NCs, Inspection & testing results at Incoming, In-process & customer returned if any",
    "Internal monitoring records of Glass breakage, Blade & cutter integrity indicates foreign matter contamination control",
    "Internal rejections (Process waste, set up waste, product rejection etc.) are found well within norms & set objectives",
    "Mock recall frequency is yearly & recent mock recall conducted on 10.01.2025 for Label & found effective . Sleeve & Pouch recall is planned before 15.02.2025",
    "Frequency of Traceability is defined as intermittently every 12 month & last F/W traceability was carried out on 18.12.2024 for Label & found effective. Backward traceability for Sleeve was carried out on 01-12-2024 & Label was carried out on 12-12-2024 & found effective. F/W traceability for Sleeve & Pouching is planned before 15.02.2025",
    "Actual product recall or withdrawal has not been done since the inception of the organization"
  ),
  item6Result: "No action required",

  item7Reviewed: "Competency mapping records, Job descriptions, Training related records",
  // Item 7 prints no discussion points.
  item7Discussion: "",
  item7Result: "Action required",

  item8Responsibility: "PSTL (Kapila Barad) / Respective process HODs",
  item8Reviewed: "Quality & Product safety objectives",
  item8Discussion: points(
    "Target for current review period: 01.01.2025 to 30.06.2025",
    "Total nos of Objectives established: - 19",
    "Nos of Objectives achieved >90% of the planned target: - 19",
    "Nos of Objectives achieved <90% of the planned target: - 0",
    "Few objectives revised based on planned improvement",
    "GALLUS printing machine required to be opened for replacement of bearing, which resulted for the 1st time & due to that, this higher breakdown hours reported",
    "Details of Objectives to be revised based on past performance, current & near future trend, technological limitations & resources allocation"
  ),
  item8Result: "No action required",

  item9Responsibility: "Sr. Manager – HR & admin (Mr. Vipul) / PSTL (Mr. Vivek)",
  item9Reviewed: "Internal product NCR records, Customer complaint records, audit NC records",
  item9Discussion: points(
    "TACCP & VACCP found effective so far.",
    "During internal analysis as well as for external analysis carried out, no evidence of product fraud noticed. No such inputs received from market research or feedback also.",
    "During review of site security measures carried out, no evidence of product contamination or intentional contamination or any such events of breach reported.",
    "No incidents of any theft or intentional contamination or deliberated dilution etc. reported so far.",
    "Product safety and Quality culture plan has been established as per requirements of BRCGS – Packaging (issue 7) & it’s been recently established, so far effectiveness of action plan / activities being monitored & reviewed as per time frame & found achieving"
  ),
  item9Result: "Effective – No action required",

  item10Responsibility: "PSTL (Kapila Barad)",
  item10Reviewed: "Annexure A to G (BRCGS – Packaging Issue 06 manual)",
  item10Discussion: points(
    "CEO reviewed the adequacy & effectiveness of all the policies & decided not to modify any existing policy",
    "All Product safety policies were reviewed during this MRM as per requirements of BRCGS Packaging - Issue 7 & no changes in any of the policy suggested by CEO.",
    "All Product safety Policies awareness was found effective & effectively communicated through display of all policy in local language. Frequent training & awareness programme have been conducted"
  ),
  item10Result: "No action required",

  item11Responsibility: "Mr. Shail Patel (CEO) / Mr. Swarup Rajgor (Director – Sales & Marketing)",
  // "□ Documented information reviewed:" and nothing after it.
  item11Reviewed: "",
  item11Discussion: points(
    "BRCGS logo is not used on V-card, Website, Letterhead, Email signature, Product packaging etc.",
    "Referring to the BRCGS participate, there has been 1 updated published on 15.08.2024 as per P618 requirements. Although, for current scenario, not relevant to our organization"
  ),
  item11Result: "No action required",

  // The New Action Item Detail table is blank on page 9.
  newAction1Ref: "",
  newAction1Item: "",
  newAction1When: "",
  newAction1Who: "",
  newAction2Ref: "",
  newAction2Item: "",
  newAction2When: "",
  newAction2Who: "",
};

/**
 * Item 8's table, pages 6 and 7: Objective description, Achieved for the
 * review period (Jan to June), Revised target (June ~ Dec) and the
 * Justification — cell for cell. Objective 16's Justification is blank.
 */
export const MRM_2025_07_OBJECTIVES: [objective: string, achieved: string, revisedTarget: string, justification: string][] = [
  ["New customer addition - Labels", "7", "6", "Realistic target"],
  ["New customer addition - Sleeve", "25", "18", "Realistic target"],
  ["New customer addition - Pouches", "NA", "6", "New objective added for Laminated pouches"],
  ["Customer feedback - Labels", "90", "90", "NA"],
  ["Customer feedback - Sleeve", "94", "90", "NA"],
  ["Customer feedback - Pouch", "93", "90", "NA"],
  ["Wastage - Sleeve", "10.89%", "< 10%", "Realistic target"],
  ["Wastage - Labels", "9.82%", "< 9.0%", "Based on past data & improvement planned"],
  ["Wastage – Pouches", "9.82%", "< 9.0%", "Based on past data & improvement planned"],
  ["Customer complaints Product Quality - Labels", "2", "2", "Realistic target"],
  ["Customer complaints Product Quality - Sleeve", "1", "2", "Realistic target"],
  [
    "Customer complaints Product Quality – Pouches",
    "0 / NA",
    "3",
    "Realistic target based on volume in next half year. New objective added for Laminated packaging materials",
  ],
  ["Breakdown minutes ( 6 months )", "935 min", "900 min", "Realistic target"],
  ["Training programmes", "21", "21", "NA"],
  ["GMP non-compliances ( 6 months )", "30", "24", "Based on past data & improvement planned"],
  ["Customer Complaints - (Transportation damages / Pest infestation etc.)", "0", "0", ""],
  ["Supplier rating performance", "100", "95", "Practical target"],
  ["RM / PM receipt - infested / vehicle condition improper", "0", "0 (Same)", "NA"],
  ["Material waste due to improper storage condition or expired shelf life", "0", "0 (Same)", "NA"],
];

const MRM_HEADER_FIELDS: LogHeaderField[] = [
  { key: "reviewPeriod", label: "Period under review (written in the page heading)", type: "text" },
  { key: "meetingDate", label: "Meeting Date:", type: "date", required: true, autoFill: { dueDate: true } },
  { key: "meetingTime", label: "Meeting time (written beside the Meeting Date)", type: "text" },
  { key: "meetingTitle", label: "Meeting Title:", type: "text", autoFill: { carryForward: true } },
  { key: "purpose", label: "Purpose:", type: "paragraph", autoFill: { carryForward: true } },
  { key: "requiredAttendance", label: "Required Attendance:", type: "paragraph", autoFill: { carryForward: true } },
  ...attendanceFields,
  ...itemOpening(mrmItem(1)),
  ...followUpFields,
  itemResult(mrmItem(1)),
  ...[2, 3, 4, 5, 6, 7].flatMap((no) => wholeItem(mrmItem(no))),
  // Item 8 up to its table; its result follows the table.
  ...itemOpening(mrmItem(8)),
  ...itemDiscussion(mrmItem(8)),
];

const MRM_FOOTER_FIELDS: LogHeaderField[] = [itemResult(mrmItem(8)), ...[9, 10, 11].flatMap((no) => wholeItem(mrmItem(no))), ...newActionFields];

/** The boxes that carry forward, with the meeting's values: what a new meeting starts from. */
const carriedFrom = (fields: LogHeaderField[], values: Record<string, string>): Record<string, string> =>
  Object.fromEntries(fields.filter((f) => f.autoFill?.carryForward && values[f.key]).map((f) => [f.key, values[f.key]]));

const MRM_RECORD: LogSheetLayout = {
  documentId: "sys-mrm-record",
  headerFields: MRM_HEADER_FIELDS,
  // Item 8's objectives table. The objective describes and repeats; what was
  // achieved, the revised target and why are this review's own.
  columns: [
    { key: "objective", label: "Objective description", type: "text", width: 340, autoFill: { carryForward: true } },
    { key: "achieved", label: "Achieved for current review period (Jan to June)", type: "text", width: 150, autoFill: { fresh: true } },
    { key: "revisedTarget", label: "Revised target for next period of review (June ~ Dec)", type: "text", width: 150, autoFill: { fresh: true } },
    // Prose, up to two sentences (objective 12's), so it is written in a box that grows.
    { key: "justification", label: "Justification for revision of Target value of objective", type: "text", width: 300, multiline: true, autoFill: { fresh: true } },
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: 25 },
  footerFields: MRM_FOOTER_FIELDS,
  // The meeting of 21.07.2025 is the specimen: what it says about the meeting,
  // who attends, who reports each item and what it reviews, and the objectives
  // it reviewed. Its discussions and results are never offered to a new one.
  specimenHeader: carriedFrom([...MRM_HEADER_FIELDS, ...MRM_FOOTER_FIELDS], MRM_2025_07_VALUES),
  specimenRows: MRM_2025_07_OBJECTIVES.map(([objective]) => ({ objective })),
  originalPages: [
    page("fsys04-mrm-record-2025-07-p1.jpg", "F/SYS/04 — the management review of 21.07.2025, page 1 of 9: the meeting, its attendance and item 1 (last meeting's action items), as supplied"),
    page("fsys04-mrm-record-2025-07-p2.jpg", "F/SYS/04 — page 2 of 9: items 2 (audits) and 3 (customer feedback & complaints), as supplied"),
    page("fsys04-mrm-record-2025-07-p3.jpg", "F/SYS/04 — page 3 of 9: item 4 (the HARA system), as supplied"),
    page("fsys04-mrm-record-2025-07-p4.jpg", "F/SYS/04 — page 4 of 9: item 5 (legislative & certification scheme changes), as supplied"),
    page("fsys04-mrm-record-2025-07-p5.jpg", "F/SYS/04 — page 5 of 9: items 6 (incidents & non-conforming products) and 7 (resources), as supplied"),
    page("fsys04-mrm-record-2025-07-p6.jpg", "F/SYS/04 — page 6 of 9: item 8 (the objectives), objectives 1 to 7, as supplied"),
    page("fsys04-mrm-record-2025-07-p7.jpg", "F/SYS/04 — page 7 of 9: item 8, objectives 8 to 19 and the result, as supplied"),
    page("fsys04-mrm-record-2025-07-p8.jpg", "F/SYS/04 — page 8 of 9: items 9 (TACCP, VACCP & culture) and 10 (policies), as supplied"),
    page("fsys04-mrm-record-2025-07-p9.jpg", "F/SYS/04 — page 9 of 9: item 11 (the BRCGS logo) and the New Action Item Detail (blank), as supplied"),
  ],
  specimenSource:
    "F-SYS-04-Management review meeting agenda & Record_July 2025.pdf — F/SYS/04 (Rev No: 01, Date: 01.04.2025), the meeting of 21.07.2025 reviewing Jan 2025 to June 2025, 9 pages; the plant's own entries",
};

// ===========================================================================
// F/SYS/04-A — AGENDA FOR BRCGS PACKAGING (ISSUE 7) MANAGEMENT REVIEW MEETING RECORD
// ===========================================================================

/** The eleven agenda points, printed on the form under the participants, with their numbers. */
const MRM_AGENDA_POINTS = [
  "1. Follow up action items from previous management review meeting",
  "2. Results of Audits performed during the time period (Internal, 2nd Party (Customers) & 3rd Party (Certification body)",
  "3. Customer performance Indicators (Formal customer feedback results, complaints, informal/formal feedback if any)",
  "4. Effectiveness of HARA system (HARA Review summary, On-site verification of PFC, Review of HACCP Plan, CCP monitoring, CCP deviation, Pre-requisite status)",
  "5. Impact of any applicable legislative and certification scheme changes (BRCGS Participate review, Legal requirement updates & its implication for implementation)",
  "6. any product safety incidents, corrective actions, out-of-specification results and non-conforming materials (Any incidents of glass breakage or sharp implements contamination or product contamination, OOS results where investigation done to determine the error in testing method or test results, NC products at Incoming/WIP & FG stage)",
  "7. Resource requirements (Manpower, Machinery, Test equipments, Infrastructure modifications, Financial etc.)",
  "8. Status of monitoring of Quality & Product safety objectives (if not met, reasons, action plan & need for revision)",
  "9. Effectiveness of Product defense (TACCP) and product fraud prevention plans (VACCP), Review of Product safety culture Plan",
  "10. Adequacy and awareness of Various Policies (Quality & Product Safety Policy, PRP Polices etc.)",
  "11. Usage & compliance of BRCGS Logo (V-card, Website, Letterhead, Email signature, Product packaging etc.)",
];

/** The notice of 07.07.2025, its three boxes. */
export const MRM_AGENDA_2025_07_VALUES: Record<string, string> = {
  dateOfNotification: "2025-07-07",
  plannedDate: "2025-07-21",
  locationTiming: "Conference room , 1.30 PM to 3.00 PM",
};

/**
 * The eight participants, 01 to 08, as printed. LINE 08 IS PRINTED WITH ITS
 * TWO CELLS SWAPPED — "Manager – Store" under Name of Participants, "Nalin
 * Darji" under Designation — and is kept exactly so.
 */
export const MRM_AGENDA_2025_07_PARTICIPANTS: [name: string, designation: string][] = [
  ["Shail Patel", "CEO"],
  ["Swarup Rajgor", "Director – Sales"],
  ["Virat Rajgor", "Director – Operations"],
  ["Kapila Barad", "PSTL / Manager – QA"],
  ["Ajay Vaghela", "Manager – Production & Maintenance"],
  ["Chirag Parmar", "Manager – Purchase"],
  ["Parth Chauhan", "Manager – Dispatch"],
  ["Manager – Store", "Nalin Darji"],
];

const MRM_AGENDA: LogSheetLayout = {
  documentId: "sys-mrm-agenda",
  instructions: ["Agenda Points for MRM meeting", ...MRM_AGENDA_POINTS],
  headerFields: [
    { key: "dateOfNotification", label: "Date of Notification : -", type: "date", required: true, autoFill: { dueDate: true } },
    { key: "plannedDate", label: "Planned date of Management review meeting:", type: "date" },
    { key: "locationTiming", label: "Location & Timing –", type: "text", autoFill: { carryForward: true } },
  ],
  // Who is called carries to the next notice; each one signs it afresh.
  columns: [
    { key: "name", label: "Name of Participants", type: "text", width: 220, list: EMPLOYEES, autoFill: { carryForward: true } },
    { key: "designation", label: "Designation", type: "text", width: 290, autoFill: { carryForward: true } },
    { key: "signature", label: "Signature", type: "text", width: 180, autoFill: { fresh: true } },
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: 8 },
  specimenHeader: { locationTiming: MRM_AGENDA_2025_07_VALUES.locationTiming },
  specimenRows: MRM_AGENDA_2025_07_PARTICIPANTS.map(([name, designation]) => ({ name, designation })),
  originalPages: [page("fsys04a-mrm-agenda-2025-07-p1.jpg", "F/SYS/04-A — the notice of 07.07.2025 calling the management review of 21.07.2025, as supplied (line 08 printed with its two cells swapped)")],
  specimenSource:
    "F-SYS-04A-BRCGS MRM Notification Record_July2025.pdf — F/SYS/04-A (Rev No: 01, Date: 01.04.2025), the notice of 07.07.2025; the plant's own entries, line 08 printed with its Name and Designation swapped",
};

// ===========================================================================
// F/SYS/16 — QUALITY & PRODUCT SAFETY OBJECTIVES ( Year … )
// ===========================================================================

// The months the sheet prints, January to June.
const OBJECTIVE_MONTHS: { key: string; label: string }[] = [
  { key: "jan", label: "January" },
  { key: "feb", label: "February" },
  { key: "mar", label: "March" },
  { key: "apr", label: "April" },
  { key: "may", label: "May" },
  { key: "jun", label: "June" },
];

/** The Plan / Actual / Actual - meters column key for a month, e.g. janPlan, janActualMeters. */
export const objectiveKey = (month: string, which: "Plan" | "Actual" | "ActualMeters") => `${month}${which}`;
export const OBJECTIVE_MONTH_KEYS = OBJECTIVE_MONTHS.map((m) => m.key);

const METERS = "Actual - meters";

/** One objective as the sheet writes it: its six plans and six actuals, January to June, and its two Totals. */
const objective = (
  department: string,
  parameter: string,
  unit: string,
  plans: string[],
  actuals: string[],
  totalPlan: string,
  totalActual: string
): Record<string, string> => ({
  department,
  parameter,
  unit,
  ...Object.fromEntries(
    OBJECTIVE_MONTHS.flatMap((m, i) => [
      [objectiveKey(m.key, "Plan"), plans[i] ?? ""],
      [objectiveKey(m.key, "Actual"), actuals[i] ?? ""],
    ])
  ),
  totalPlan,
  totalActual,
  achieved: "",
  ...Object.fromEntries(OBJECTIVE_MONTHS.map((m) => [objectiveKey(m.key, "ActualMeters"), ""])),
  totalActualMeters: "",
});

const every = (value: string) => OBJECTIVE_MONTHS.map(() => value);
// A value written once across January to June (a merged cell) is held in January.
const merged = (value: string) => [value];
const none: string[] = [];

/**
 * THE 2026 SHEET, objective by objective, pages 1–4 and 28–31 read together —
 * every cell exactly as printed, the Totals that do not add up included.
 */
export const OBJECTIVES_2026_ROWS: Record<string, string>[] = [
  objective("Sales", "New customer addition - Labels", "Nos", none, ["0"], "", ""),
  objective("Sales", "New customer addition - Sleeve", "Nos", none, ["1"], "", ""),
  objective("Sales", "New customer addition -Pouch", "Nos", none, none, "", ""),
  objective("Sales", "Customer feedback - Labels", "%", none, none, "", ""),
  objective("Sales", "Customer feedback - Sleeve", "%", none, none, "", ""),
  objective("Sales", "Customer feedback - Pouch", "%", none, none, "", ""),
  objective("Production", "Labels", "meters", every("1927800"), none, "11566800", "0"),
  objective("Production", "Wastage - Labels", "%", every("7.5"), every("#DIV/0!"), "8.0", "#DIV/0!"),
  objective("QC", "Customer complaints Product Quality - Labels", "Nos.", merged("3"), none, "3", ""),
  objective("QC", "Customer complaints Product Quality - Sleeve", "Nos.", merged("3"), none, "3", ""),
  objective("QC", "Customer complaints Product Quality - Pouch", "Nos.", none, none, "", ""),
  objective("Maintenance", "Breakdown hours", "Minutes", every("175"), none, "700", ""),
  objective("HR & admin", "Training programmes", "Nos.", merged("15"), none, "0", "0"),
  objective("HR & admin", "GMP non-compliances", "Nos. (maximum)", merged("10"), none, "0", "0"),
  objective("Dispatch", "Customer Complaints - (Transportation damages / Pest infestation etc.)", "Nos. (maximum)", every("0"), none, "0", "0"),
  objective("Purchase", "Supplier rating performance", "% (minimum)", merged("95"), merged("To be collected in December 2024"), "95", "100"),
  objective("Purchase", "RM / PM receipt - infested / vehicle condition improper", "Nos.", every("0"), none, "0", "0"),
  objective("Store", "Material waste due to improper storage condition or expired shelf life", "% (Maximum)", every("0.15"), none, "0.25", "0"),
];

/** The year in the sheet's title. */
export const OBJECTIVES_2026_VALUES: Record<string, string> = { year: "2026" };

// What an objective IS and what is planned for it carries to the next sheet;
// every actual, the Totals' actual and % Achieved are the period's own.
const OBJECTIVE_CARRIED = ["department", "parameter", "unit", ...OBJECTIVE_MONTHS.map((m) => objectiveKey(m.key, "Plan")), "totalPlan"];

const OBJECTIVES: LogSheetLayout = {
  documentId: "sys-objectives",
  // The title carries the year: "Quality & Product Safety Objectives ( Year 2026 )".
  // Not carried forward — a new sheet is a new year.
  headerFields: [{ key: "year", label: "Quality & Product Safety Objectives ( Year … )", type: "text" }],
  columns: [
    { key: "department", label: "Department / Processes", type: "text", width: 120, autoFill: { carryForward: true } },
    { key: "parameter", label: "Parameter / Attribute", type: "text", width: 230, autoFill: { carryForward: true } },
    { key: "unit", label: "Unit", type: "text", width: 110, autoFill: { carryForward: true } },
    ...OBJECTIVE_MONTHS.flatMap((m): LogColumn[] => [
      { key: objectiveKey(m.key, "Plan"), label: "Plan", type: "text", width: 86, group: m.label, autoFill: { carryForward: true } },
      { key: objectiveKey(m.key, "Actual"), label: "Actual", type: "text", width: 86, group: m.label, autoFill: { fresh: true } },
    ]),
    { key: "totalPlan", label: "Plan", type: "text", width: 90, group: "Total", autoFill: { carryForward: true } },
    { key: "totalActual", label: "Actual", type: "text", width: 90, group: "Total", autoFill: { fresh: true } },
    { key: "achieved", label: "% Achieved", type: "text", width: 100, autoFill: { fresh: true } },
    // Objective 8's third line, turned with the rest.
    ...OBJECTIVE_MONTHS.map((m): LogColumn => ({ key: objectiveKey(m.key, "ActualMeters"), label: m.label, type: "text", width: 86, group: METERS, autoFill: { fresh: true } })),
    { key: "totalActualMeters", label: "Total", type: "text", width: 90, group: METERS, autoFill: { fresh: true } },
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: 30 },
  specimenRows: OBJECTIVES_2026_ROWS.map((row) => Object.fromEntries(OBJECTIVE_CARRIED.map((k) => [k, row[k] ?? ""]))),
  originalPages: [
    page("fsys16-objectives-2026-p1.jpg", "F/SYS/16 — the 2026 objectives, PDF page 1: objectives 1 to 5, January to May, as supplied"),
    page("fsys16-objectives-2026-p2.jpg", "F/SYS/16 — PDF page 2: objectives 5 to 11, January to May, as supplied"),
    page("fsys16-objectives-2026-p3.jpg", "F/SYS/16 — PDF page 3: objectives 11 to 17, January to May, as supplied"),
    page("fsys16-objectives-2026-p4.jpg", "F/SYS/16 — PDF page 4: objective 18, January to May, as supplied"),
    page("fsys16-objectives-2026-p28.jpg", "F/SYS/16 — PDF page 28: June, Total and % Achieved for objectives 1 to 5, as supplied"),
    page("fsys16-objectives-2026-p29.jpg", "F/SYS/16 — PDF page 29: June, Total and % Achieved for objectives 5 to 11, as supplied"),
    page("fsys16-objectives-2026-p30.jpg", "F/SYS/16 — PDF page 30: June, Total and % Achieved for objectives 11 to 17, as supplied"),
    page("fsys16-objectives-2026-p31.jpg", "F/SYS/16 — PDF page 31: June, Total and % Achieved for objective 18, as supplied (pages 5–27 and 32–81 are blank)"),
  ],
  specimenSource:
    "F-SYS-16-Quality & Product Safety objectives 2024-25.pdf — F/SYS/16 (00/01.12.2021), the sheet for Year 2026 (PDF pages 1–4 and 28–31 of 81; the rest are blank); the plant's own entries",
};

export const SYS_MANAGEMENT_REVIEW_LAYOUTS: Record<string, LogSheetLayout> = {
  [MRM_RECORD.documentId]: MRM_RECORD,
  [MRM_AGENDA.documentId]: MRM_AGENDA,
  [OBJECTIVES.documentId]: OBJECTIVES,
};
