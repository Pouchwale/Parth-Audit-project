// Master data seeded strictly from the uploaded source documents.
// Provenance of every row is documented in REQUIREMENTS.md.
import type { MasterData } from "../../types";

export const SEED_MASTER_DATA: MasterData = {
  // Observed in the filled Daily Monitoring / Fly Catcher specimens (handwritten;
  // exact spelling TO BE CONFIRMED) plus named individuals from the Training
  // Certificate, GAP report and Service Reports.
  employees: [
    { id: "emp-checker-1", name: "Roshni", role: "Checker / Verifier — spelling TO BE CONFIRMED (handwritten source)", department: "Production / HR", active: true },
    { id: "emp-vijay", name: "Vijay", role: "Fly Catcher Cleaning", department: "Housekeeping", active: true },
    { id: "emp-yogesh", name: "Yogesh Rathod", role: "Technician (Gurudev Pest Control)", department: "Pest Control Service Provider", active: true },
    { id: "emp-rohit", name: "Rohit Patel", role: "Signatory, Gurudev Pest Control", department: "Pest Control Service Provider", active: true },
    // PSTL (Product Safety Team Leader) and Manager - QA on the F/HR formats of
    // 14-Sep-2026: she signs the mobile authorisations, leads the HARA team's
    // GMP inspection and runs the product safety culture survey.
    { id: "emp-kapila", name: "Ms. Kapila Barad", role: "Client Contact Person / Training Coordinator / PSTL (Manager - QA)", department: "Gujarat Printpack Publication Pvt. Ltd.", active: true },
    // Human Resources — named on the F/HR formats (F/HR/01 competence register:
    // HR & Admin, Manager, joined 05.07.2024; F/HR/13: Hr Manager, 10/07/2024).
    { id: "emp-sandeep", name: "Sandeep Parekh", role: "Manager – HR & Admin (Head – HR & Admin; signs the induction, competence and hygiene registers)", department: "HR & Admin", active: true },
    // Lamination QC / Production — names read off the photographed F-QC-30,
    // F-QC-32, Process Parameter and F-PRD-18 registers (Sept-2026).
    { id: "emp-gaurav", name: "Gaurav Singh", role: "Lamination Operator (Lamination-1)", department: "Production", active: true },
    { id: "emp-jeni", name: "Jeni", role: "QC Tester — day shift (Lamination QC) — spelling TO BE CONFIRMED (handwritten)", department: "Quality Control", active: true },
    { id: "emp-singh", name: "Singh", role: "QC Tester — night shift (Lamination QC) — full name TO BE CONFIRMED (handwritten)", department: "Quality Control", active: true },
    // QC inspection registers (F/QC/13, /34, /35, /37) — signatures read off
    // the photographs; full names TO BE CONFIRMED.
    { id: "emp-pooja", name: "Pooja P", role: "QA Inspector (slitting / inspection records) — full name TO BE CONFIRMED", department: "Quality Assurance", active: true },
    { id: "emp-svm", name: "S.V.M.", role: "QA Inspector (printed film) — initials only, TO BE CONFIRMED", department: "Quality Assurance", active: true },
    { id: "emp-hnp", name: "HNP", role: "QA Person (in-process printing QC) — initials only, TO BE CONFIRMED", department: "Quality Assurance", active: true },
    // The two QA people who sign the internal calibration records supplied on
    // 16-Sep-2026 (F/QC/11, F/QC/12) — handwritten, so the spelling is TO BE CONFIRMED.
    { id: "emp-rashmi", name: "Rashmi", role: "QA — Internal Calibration (Lab) — spelling TO BE CONFIRMED (handwritten)", department: "Quality Control", active: true },
    { id: "emp-anjali", name: "Anjali", role: "QA — Internal Calibration (Lab) — spelling TO BE CONFIRMED (handwritten)", department: "Quality Control", active: true },
    { id: "emp-pankaj", name: "Pankajbhai", role: "Printing Operator (Lombardi)", department: "Production", active: true },
    // Statement of Compliance signatory.
    { id: "emp-shail", name: "Shail Patel", role: "CEO — SOC Signatory", department: "Management", active: true },
    // Attendees of the 24-Dec-2025 pest control awareness training (Training - Yrl (1).doc).
    { id: "emp-akash", name: "Akash Patel", role: "Staff — pest control awareness trainee", department: "TO BE CONFIRMED", active: true },
    { id: "emp-ajay", name: "Ajay Vaghela", role: "Staff — pest control awareness trainee", department: "TO BE CONFIRMED", active: true },
    { id: "emp-meet", name: "Meet Patel", role: "Staff — pest control awareness trainee", department: "TO BE CONFIRMED", active: true },
    { id: "emp-harsh", name: "Harsh Parmar", role: "Staff — pest control awareness trainee", department: "TO BE CONFIRMED", active: true },
    // WHO ANSWERS FOR THE PURCHASE FORMATS (REQUIREMENTS §68). Not a new
    // person: this line was written from the Dec-2025 training certificate,
    // which says only that he attended, and the company's own papers already
    // on file say what he does — F/HR/01 puts "Chirag Parmar" in Purchase as
    // Purchase Manager (joined 13.07.2022, no leaving date), F/HR/13 writes it
    // "Manager -Purchase", and the pest control agreement and the
    // responsibilities document are both signed "Chirag Parmar (Manager,
    // Purchase)". So the line is completed from them rather than left TO BE
    // CONFIRMED, and the five F/PUR formats have their own manager to name.
    { id: "emp-chirag", name: "Chirag Parmar", role: "Manager – Purchase (Purchase Manager on F/HR/01; also a pest control awareness trainee, Dec-2025)", department: "Purchase", active: true },
    // WHO ANSWERS FOR THE MAINTENANCE FORMATS (REQUIREMENTS §74). Written from
    // the Dec-2025 training certificate at first, which says only that he
    // attended; the company's own papers say what he does — F/HR/01 has "Mukesh
    // Patel", Maintainance, "Manager - Mentainance", joined 06.04.1996 with no
    // leaving date, and F/HR/13 writes him "Manager - Mentainance" as of
    // 01.12.2021. The paper's spelling is kept in brackets; the role says
    // "Maintenance" so the maintenance formats find him (engine/documentInfo.ts
    // matches the role by that word). An install that already holds the old
    // line is corrected by masterRepository.ensureSeeded's SEED_CORRECTIONS.
    { id: "emp-mukesh", name: "Mukesh Patel", role: "Manager – Maintenance (\"Manager - Mentainance\" on F/HR/01 and F/HR/13; also a pest control awareness trainee, Dec-2025)", department: "Maintenance", active: true },
    // His supervisor, the same way: F/HR/01 has "Rahul Patel", Maintainance,
    // Supervisor, joined 19.12.2014; F/HR/13 writes "Supervisor - Mentainance".
    { id: "emp-rahul-patel", name: "Rahul Patel", role: "Supervisor – Maintenance (\"Supervisor - Mentainance\" on F/HR/13)", department: "Maintenance", active: true },
    // WHO ANSWERS FOR THE STORE FORMATS (REQUIREMENTS §71). Like Chirag
    // Parmar above, not a new person and not a guess: the company's own
    // personnel records already say who runs the store. F/HR/01 has
    // "Hemantbhai Nayak", General Stores, Manager, joined 01.01.2004 with no
    // leaving date, and F/HR/13 writes the same man "Manager - Store" as of
    // 01.12.2021. F/STR/02 names a "Store In-charge" and prints a STORE
    // KEEPER SIGN column, and F/STR/01 is stamped and signed by the store, so
    // both formats have their own manager to name rather than an empty
    // signature box.
    { id: "emp-hemant", name: "Hemantbhai Nayak", role: "Manager – Store (General Stores Manager on F/HR/01, joined 01.01.2004; \"Manager - Store\" on F/HR/13)", department: "Store", active: true },
    // And the Dispatch In charge the container check is authorised by
    // (REQUIREMENTS §70). F/STR's neighbour format named a role with nobody
    // behind it: "disp-container-stuffing" resolves to a role containing
    // "Dispatch", and until now no employee had one, so the paper's own
    // product-release authorisation box filled with nothing. F/HR/13 has
    // "Parth Chauhan", "Manager - Dispatch", as of 01.12.2023.
    { id: "emp-parth-chauhan", name: "Parth Chauhan", role: "Manager – Dispatch (on F/HR/13 as of 01.12.2023)", department: "Dispatch", active: true },
  ],

  // Areas are kept separate per source document, exactly as filed on paper
  // (the three Service Report variants and Daily Monitoring do not share one
  // area list in the source material).
  areas: [
    // Rodent Control Service Report (16 areas)
    { id: "area-rcs-1", name: "Printing machine - Ground Floor", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-2", name: "Anilox cleaning area - Ground floor", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-3", name: "Store - Label stock & PVC / PET Films - Ground floor", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-4", name: "Ink store - Ground floor", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-5", name: "RM Inward & FG Dispatch room - Ground floor", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-6", name: "Walkways - Ground Floor", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-7", name: "First floor - Walkways", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-8", name: "First floor - Slitting & Packing", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-9", name: "First floor - Offline punching & QC Inspection", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-10", name: "First floor - Printing machine", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-11", name: "First floor - Ink Kitchen", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-12", name: "First floor - Shrink Sleeve production", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-13", name: "First floor - Intermediate Store", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-14", name: "Change room & Locker room - Ground Floor", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-15", name: "QC Lab", context: "service-report:Rodent Control Service" },
    { id: "area-rcs-16", name: "Canteen", context: "service-report:Rodent Control Service" },
    // General Pest Control Services / Fly Control Services (shared 9-area list in source)
    { id: "area-gp-1", name: "Ground Floor - Change room (outer periphery)", context: "service-report:General Pest Control Services" },
    { id: "area-gp-2", name: "Ground Floor - RM Inward & FG Outward area (outer periphery)", context: "service-report:General Pest Control Services" },
    { id: "area-gp-3", name: "1st floor - Stair case", context: "service-report:General Pest Control Services" },
    { id: "area-gp-4", name: "Ground floor - Mono carton area", context: "service-report:General Pest Control Services" },
    { id: "area-gp-5", name: "Ground floor - Paper storage area", context: "service-report:General Pest Control Services" },
    { id: "area-gp-6", name: "First floor - Printing plate storage area", context: "service-report:General Pest Control Services" },
    { id: "area-gp-7", name: "First floor - Utility area", context: "service-report:General Pest Control Services" },
    { id: "area-gp-8", name: "QC Lab - Ground Floor", context: "service-report:General Pest Control Services" },
    { id: "area-gp-9", name: "Canteen", context: "service-report:General Pest Control Services" },
    { id: "area-fc-1", name: "Ground Floor - Change room (outer periphery)", context: "service-report:Fly Control Services" },
    { id: "area-fc-2", name: "Ground Floor - RM Inward & FG Outward area (outer periphery)", context: "service-report:Fly Control Services" },
    { id: "area-fc-3", name: "1st floor - Stair case", context: "service-report:Fly Control Services" },
    { id: "area-fc-4", name: "Ground floor - Mono carton area", context: "service-report:Fly Control Services" },
    { id: "area-fc-5", name: "Ground floor - Paper storage area", context: "service-report:Fly Control Services" },
    { id: "area-fc-6", name: "First floor - Printing plate storage area", context: "service-report:Fly Control Services" },
    { id: "area-fc-7", name: "First floor - Utility area", context: "service-report:Fly Control Services" },
    { id: "area-fc-8", name: "QC Lab - Ground Floor", context: "service-report:Fly Control Services" },
    { id: "area-fc-9", name: "Canteen", context: "service-report:Fly Control Services" },
  ],

  // Fly Catcher (fly killer machine) locations PC-01 .. PC-13, verbatim from
  // the Fortnightly Fly Catcher Inspection & Cleaning Record (F/HR/18).
  pcLocations: [
    { id: "PC-01", location: "Near Wash room", floor: "GF" },
    { id: "PC-02", location: "Near Ink room", floor: "GF" },
    { id: "PC-03", location: "Gallus machine room", floor: "GF" },
    { id: "PC-04", location: "Pouching area", floor: "GF" },
    { id: "PC-05", location: "Pouching area", floor: "GF" },
    { id: "PC-06", location: "Pouching area", floor: "GF" },
    { id: "PC-07", location: "Near Lombardi m/c", floor: "FF" },
    { id: "PC-08", location: "Ink Kitchen", floor: "FF" },
    { id: "PC-09", location: "Warehouse entrance", floor: "GF" },
    { id: "PC-10", location: "Warehouse office wall", floor: "TO BE CONFIRMED" },
    { id: "PC-11", location: "Change room", floor: "GF" },
    { id: "PC-12", location: "Dispatch gate", floor: "GF" },
    { id: "PC-13", location: "Dispatch gate entrance", floor: "GF" },
  ],

  // Chemicals referenced across the SOP, Pesticide Application Chart and
  // Service Reports.
  chemicals: [
    { id: "chem-bromadiolone", name: "Bromadiolone Wax Block 0.005% a.i.", formulation: "Ready-to-use wax block / cake" },
    { id: "chem-glue-board", name: "Non-Chemical Glue Trap / Glue Board", formulation: "Physical trap (non-chemical)" },
    { id: "chem-bait-trap", name: "Bait Traps / Bait Trays", formulation: "Tamper Proof Bait Station" },
    { id: "chem-kothrine", name: "Kothrine (Deltamethrin 2.5% SC)", activeIngredient: "Deltamethrin 2.5%", formulation: "SC (Suspension Concentrate)" },
    { id: "chem-responsar", name: "Responsar (Beta-Cyfluthrin 2.45% SC)", activeIngredient: "Beta-Cyfluthrin 2.45%", formulation: "SC (Suspension Concentrate)" },
    { id: "chem-maxforce", name: "Maxforce Gel", formulation: "Ready-to-use (RTU) gel" },
  ],

  // Pesticide Application Chart (Chemical Chart new.docx) — Service Type -> Pest -> Chemical -> Dilution.
  serviceTypeChemicals: [
    {
      id: "stc-rodent",
      serviceName: "Rodent Control Service",
      pestCovered: "Rat, Mice & Bandicoots",
      chemicals: [
        "Tamper Proof Bait Stations",
        "Bromadiolone Wax Block 0.005%",
        "Non-Chemical Glue trap",
        "Bait Traps",
      ],
      dilutionRatio: "Ready to Use",
    },
    {
      id: "stc-fly-mosquito",
      serviceName: "Fly Control Service & Mosquito Control Services",
      pestCovered: "House Fly",
      chemicals: [
        "Kothrine (Deltamethrin 2.5% SC)",
        "Responsar (Beta-Cyfluthrin 2.45% SC)",
      ],
      dilutionRatio: "25 ml/Sq.Mt (Kothrine) | 20 ml / 1 litre of water (Responsar)",
    },
    {
      id: "stc-general",
      serviceName: "General Pest control",
      pestCovered: "Cockroaches, Red & Black Ants",
      chemicals: [
        "Maxforce gel",
        "Kothrine (Deltamethrin 2.5% SC)",
        "Responsar (Beta-Cyfluthrin 2.45% SC)",
      ],
      dilutionRatio: "Ready to Use (gel) | 25 ml/Sq.Mt (Kothrine) | 20 ml / 1 litre of water (Responsar)",
    },
  ],

  // No explicit Rodent Bait Station ID master list was present in the uploaded
  // source files (the GAP report flags that station numbering was *missing*
  // at the time of the Dec-2023 inspection). Left empty by design — populate
  // from the Master Data screen once the company's RBS layout/numbering is
  // confirmed. TO BE CONFIRMED.
  rodentStations: [],

  // Daily Pest Control Monitoring Record (F/HR/17) — 10 checkpoints, verbatim
  // from the blank format ("Daily pest control monitoring record .pdf", page
  // 1), whose instruction reads "Please mention the status as Yes / No
  // against each check point except point no. 7". Yes/No throughout, except
  // checkpoint 4 (a count) and checkpoint 7, whose register cell carries the
  // number of pests trapped (see components/records/DailyRegisterSheet.tsx).
  // `flagWhen` is the answer that represents a finding — polarity varies per
  // question.
  checkpoints: [
    { no: 1, text: "Pest proofing of external door (self-closer / PVC Strip curtain) working properly", responseType: "yesno", flagWhen: "No" },
    { no: 2, text: "Any gaps in Doors, shutters, Cable entry or other areas, which pose threat for entry of pests inside the plant?", responseType: "yesno", flagWhen: "Yes" },
    { no: 3, text: "Fly catchers are working properly (all lights working) & serially numbered", responseType: "yesno", flagWhen: "No" },
    { no: 4, text: "Total number of rodent traps provided", responseType: "number" },
    { no: 5, text: "Are rodent traps numbered?", responseType: "yesno", flagWhen: "No" },
    { no: 6, text: "Are rodent traps, placed in the recorded place?", responseType: "yesno", flagWhen: "No" },
    { no: 7, text: "Any pest trapped in rodent trap box", responseType: "yesno", flagWhen: "Yes" },
    { no: 8, text: "Any dead rodent observed? If yes, mention the location", responseType: "yesno-note", notePrompt: "Mention the location", flagWhen: "Yes" },
    { no: 9, text: "Any sign of Rodent cake biting in Rodent box? If yes, mention the Rodent box number", responseType: "yesno-note", notePrompt: "Mention the Rodent box number", flagWhen: "Yes" },
    { no: 10, text: "Are Fly catcher tube lights having validity of usage?", responseType: "yesno", flagWhen: "No" },
  ],

  // Best-effort default mapping from each recordable document to a role
  // keyword — matched case-insensitively against Employee.role above (e.g.
  // "Checker" matches Roshni's "Checker / Verifier — ..."). Admins can
  // correct these in Master Data as real responsibilities are confirmed;
  // "training-record" is left unassigned rather than guessed, since no
  // employee role here obviously covers training coordination.
  documentRoleKeywords: {
    "daily-pest-monitoring": "Checker",
    "fly-catcher": "Fly Catcher Cleaning",
    "service-report-rodent": "Technician",
    "service-report-general": "Technician",
    "service-report-fly": "Technician",
    "gap-inspection": "Signatory",
    "capa-customer-complaint": "QA",
    "training-record": "Training Coordinator",
    "qc-viscosity": "QC Tester",
    "qc-adhesive-mixing": "QC Tester",
    "qc-temperature": "QC Tester",
    "prd-process-parameter": "Lamination Operator",
    "prd-alc-production": "Lamination Operator",
    "qc-inspection-pouching": "QA Inspector",
    "qc-inspection-slitting": "QA Inspector",
    "qc-inspection-printed-film": "QA Inspector",
    "qc-inprocess-printing": "QA Person",
    "qc-weight-scale-calibration": "Internal Calibration",
    "qc-gsm-plate-calibration": "Internal Calibration",
    // Quality Control's formats supplied on 18-Sep-2026 (REQUIREMENTS §57): the
    // incoming material inspections and the line clearances are the QA
    // inspector's, the instrument list is the internal calibration's, and the
    // registers, the tolerance card and the minutes are QA's own.
    "qc-bopp-film": "QA Inspector",
    "qc-corrugated-box": "QA Inspector",
    "qc-label-stock": "QA Inspector",
    "qc-paper-core": "QA Inspector",
    "qc-pvc-pet-film": "QA Inspector",
    "qc-offset-ink": "QA Inspector",
    "qc-duplex-board": "QA Inspector",
    "qc-kraft-paper": "QA Inspector",
    "qc-flexo-ink": "QA Inspector",
    "qc-lamination-adhesive-inspection": "QA Inspector",
    "qc-side-pasting-adhesive": "QA Inspector",
    "qc-starch-powder": "QA Inspector",
    "qc-sheet-pasting-powder": "QA Inspector",
    "qc-line-clearance-printing": "QA Inspector",
    "qc-line-clearance-qc-machine": "QA Inspector",
    "qc-line-clearance-qc-manual": "QA Inspector",
    "qc-line-clearance-slitting": "QA Inspector",
    "qc-line-clearance-sleeve-gluing": "QA Inspector",
    "qc-line-clearance-sleeve-cutting": "QA Inspector",
    "qc-line-clearance-materials": "QA Inspector",
    "qc-line-clearance-quality": "QA Inspector",
    "qc-calibration-master-list": "Internal Calibration",
    "qc-coa-label": "QA Inspector",
    "qc-coa-sleeve": "QA Inspector",
    "qc-coa-corrugated": "QA Inspector",
    "qc-obsolete-artwork": "QA",
    "qc-printing-aids-destruction": "QA Inspector",
    "qc-camera-challenge-test": "QA Inspector",
    "qc-tolerance-card-nivea": "QA",
    "qc-analysis-report": "QA Inspector",
    "qc-utility-test-report": "QA Inspector",
    "qc-minutes-of-meetings": "QA",
    // Human Resources — the sixteen F/HR formats (REQUIREMENTS §46): the
    // registers HR & Admin keeps, the training records the Training
    // Coordinator keeps, and the PSTL's own — mobile authorisation, the HARA
    // team's GMP inspection and the product safety culture survey.
    "hr-competence": "HR & Admin",
    "hr-skill-matrix": "HR & Admin",
    "hr-pre-employment-health": "HR & Admin",
    "hr-induction-staff": "HR & Admin",
    "hr-induction-operators": "HR & Admin",
    "hr-job-responsibility": "HR & Admin",
    "hr-training-needs": "Training Coordinator",
    "hr-training-calendar": "Training Coordinator",
    "hr-training-effectiveness": "Training Coordinator",
    "hr-training-feedback": "Training Coordinator",
    "hr-mobile-authorization": "PSTL",
    "hr-visitor-health": "HR & Admin",
    "hr-gmp-checklist": "PSTL",
    "hr-psc-survey": "PSTL",
    "hr-psc-survey-analysis": "PSTL",
    "hr-hygiene-report": "HR & Admin",
    // Purchase — the five F/PUR formats supplied on 23-Sep-2026 (REQUIREMENTS
    // §68). All five are the buyer's: it is Purchase that sends the
    // registration form out, goes on the audit visit, keeps the approved
    // supplier list and marks the suppliers and service providers half-yearly.
    // "Purchase" matches the Manager – Purchase in the employee list above,
    // who is the only person on it whose role names the department.
    "pur-supplier-registration": "Purchase",
    "pur-supplier-audit-report": "Purchase",
    "pur-approved-suppliers": "Purchase",
    "pur-supplier-performance": "Purchase",
    "pur-service-provider-performance": "Purchase",
    // Dispatch (REQUIREMENTS §70). The container check is the Dispatch In
    // charge's — the paper's own product-release authorisation says so — and
    // the transporter agreement is signed by Purchase, as the company's own
    // signed copy shows ("Chirag Parmar, Purchase Manager").
    "disp-container-stuffing": "Dispatch",
    "disp-safe-transporter-agreement": "Purchase",
    // Store — the two F/STR formats (REQUIREMENTS §71). Both are the store's
    // own: the incoming material check is stamped and signed by whoever takes
    // the load in, and the sharp tool register is the Store In-charge's, which
    // the format's own first paragraph says in as many words. "Store" matches
    // the Manager – Store in the employee list above.
    "str-incoming-material-vehicle": "Store",
    "str-sharp-metal-objects": "Store",
    // Maintenance (REQUIREMENTS §74). Every F/MNT format is the maintenance
    // department's, signed by its manager or supervisor — except the daily
    // health sheet, which the MACHINE OPERATOR ticks every shift (its own
    // columns say "Operator").
    "mnt-equipment-list": "Maintenance",
    "mnt-new-equipment": "Maintenance",
    "mnt-pm-record": "Maintenance",
    "mnt-yearly-pm-schedule": "Maintenance",
    "mnt-daily-health": "Operator",
    "mnt-breakdown-record": "Maintenance",
    "mnt-glass-breakage": "Maintenance",
    "mnt-lux-level": "Maintenance",
  },

  // "Gujarat Print Pack Leave Calendar 2026" (WhatsApp Image 2026-08-11 at
  // 12.29.42 PM.jpeg — two printed copies of the notice on the board). The
  // TOP copy is the one for staff whose weekly off is THURSDAY: 13 festival
  // holidays and five "Adjustment Date … Thursday" entries. (The bottom copy
  // is the same calendar for a Sunday-off roster — it adds Thursday
  // 15-01-2026 Uttarayan, which is simply the weekly off here, and puts the
  // adjustment days on Sundays.) Transcribed verbatim; see REQUIREMENTS.md §16.
  holidays: [
    { id: "hol-2026-01-14", date: "2026-01-14", name: "Uttarayan" },
    { id: "hol-2026-01-26", date: "2026-01-26", name: "Republic Day" },
    { id: "hol-2026-03-04", date: "2026-03-04", name: "Dhuleti" },
    { id: "hol-2026-08-15", date: "2026-08-15", name: "Independence Day" },
    { id: "hol-2026-08-28", date: "2026-08-28", name: "Rakshabandhan" },
    { id: "hol-2026-09-04", date: "2026-09-04", name: "Janmashtami" },
    { id: "hol-2026-10-19", date: "2026-10-19", name: "Navratri Atham" },
    { id: "hol-2026-10-20", date: "2026-10-20", name: "Navratri Navam" },
    { id: "hol-2026-11-09", date: "2026-11-09", name: "New Year" },
    { id: "hol-2026-11-10", date: "2026-11-10", name: "Bhai Dooj" },
    { id: "hol-2026-11-11", date: "2026-11-11", name: "Padtar Diwas" },
    { id: "hol-2026-11-12", date: "2026-11-12", name: "Padtar Diwas" },
    { id: "hol-2026-11-13", date: "2026-11-13", name: "Padtar Diwas" },
  ],

  // Thursday is the weekly off (0 = Sunday … 6 = Saturday).
  weeklyOffDay: 4,

  // "Everyone must report to the company on adjustment Day is written next to
  // this holiday" — the Thursdays the plant WORKS, exactly as printed on the
  // Thursday copy of the notice, each with the holiday it sits next to.
  // 20-11-2026 is printed as "Thursday" but is actually a Friday (the
  // Thursdays are the 19th / 26th) — kept as printed, TO BE CONFIRMED with HR;
  // editable in Master Data → Holidays.
  adjustmentDays: [
    { id: "adj-2026-01-22", date: "2026-01-22", forHoliday: "Republic Day (26-01-2026)" },
    { id: "adj-2026-08-06", date: "2026-08-06", forHoliday: "Independence Day (15-08-2026)" },
    { id: "adj-2026-10-22", date: "2026-10-22", forHoliday: "Navratri Navam (20-10-2026)" },
    { id: "adj-2026-11-05", date: "2026-11-05", forHoliday: "Padtar Diwas (11-11-2026)" },
    { id: "adj-2026-11-20", date: "2026-11-20", forHoliday: "Padtar Diwas (13-11-2026)", note: "Printed as Thursday on the notice, but 20-11-2026 is a Friday — TO BE CONFIRMED (19th or 26th?)" },
  ],
};

export const COMPANY = {
  name: "GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED",
  shortName: "Gujarat Print Pack Publications Pvt. Ltd.",
  address: "308/9, GIDC, Dediyasan, Mehsana, Gujarat, India – 384002",
  serviceProvider: "Gurudev Pest Control",
};
