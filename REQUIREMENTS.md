# REQUIREMENTS.md — Source-to-Digital Traceability

This document records, for every uploaded source file, what was found, how it was digitized,
and every place the source was unclear (marked **TO BE CONFIRMED**). Nothing below was invented;
where the source did not say, this document says so explicitly.

Company: **Gujarat Printpack Publication Private Limited**, 308/9, GIDC, Dediyasan, Mehsana,
Gujarat, India – 384002. Pest control service provider: **Gurudev Pest Control**.

---

## 1. Daily Pest Control Monitoring Record

```
SOURCE DOCUMENT      "Daily pest control monitoring record .pdf" — the blank F/HR/17 format itself,
                      3 pages (received 09-Sep-2026); Kapila mam department reports.pdf, pages 2-4
                      (a filled month, photographed)
DOCUMENT STRUCTURE   Page 1 of 3: header (company/title/Format No./Rev No./Date/Page No.) + two
                      instruction lines + the 10 numbered check points. Page 2 of 3: grid, dates
                      1-19 — "Check points numbers as per above guidelines" 1..10 | Time of checking
                      | Checker. Page 3 of 3: dates 20-31 + "SUMMARY OF ACTIONS TAKEN IF PEST
                      OBSERVED" (Date of observation | Description of Observation | Action Taken |
                      Remarks)
DIGITAL TEMPLATE     kind: "daily-pest-monitoring" — one record per date, edited in
                      src/components/records/DailyPestMonitoringRecordView.tsx; the month shown in
                      the format's own 3-page layout by src/components/records/DailyRegisterSheet.tsx
                      (Pest Control > Daily Report, Reports > Daily Monitoring Summary, print)
DATABASE FIELDS      DailyPestMonitoringData (src/types/record.ts): isHoliday, checkpoints
                      (Record<1-10, {value, note?}>), timeOfChecking, checker, summaryActions[]
WORKFLOW             Frequency: Daily. One record instance per calendar date.
REPORT               Reports > Daily Monitoring Summary (reproduces the monthly register);
                      Reports > Rodent Trend (derived from checkpoint 7)
```

- Format No. **F/HR/17**, Rev No. **00**, Date **01.12.2021** — read directly off the header.
- Instruction text (verbatim): *"Please check the following points on a Daily basis for
  monitoring of Rodent / Pest infestation & report to Production supervisor / Pest control
  agency for further investigation & necessary actions. Please mention the status as OK / Not
  OK against each check point except point no. 7."*
- The 10 checkpoints, verbatim:
  1. Pest proofing of external door (self-closer / PVC Strip curtain) working properly
  2. Any gaps in Doors, shutters, Cable entry or other areas, which pose threat for entry of pests inside the plant?
  3. Fly catchers are working properly (all lights working) & serially numbered
  4. Total number of rodent traps provided
  5. Are rodent traps numbered?
  6. Are rodent traps, placed in the recorded place?
  7. Any pest trapped in rodent trap box
  8. Any dead rodent observed? If yes, mention the location
  9. Any sign of Rodent cake biting in Rodent box? If yes, mention the Rodent box number
  10. Are Fly catcher tube lights having validity of usage?
- **The blank format (09-Sep-2026).** The company supplied the F/HR/17 format itself as a clean
  3-page PDF. Its header reads Format No. F/HR/17 · Rev No. 00 · Date 01.12.2021 · Page No. 1/2/3
  Of 3; its second instruction line reads, verbatim, **"Please mention the status as Yes / No
  against each check point except point no. 7"** — so the Yes/No vocabulary below is what the
  format prints, not only what the filled specimen shows (the earlier photographed copy's "OK / Not
  OK" reading is superseded). The ten check points are word-for-word identical to the seed
  (`src/data/seed/masterData.ts`). The app now reproduces the format as printed
  (`DailyRegisterSheet.tsx`): page 1 with the instructions and check points, page 2 with dates 1–19,
  page 3 with dates 20–31 and the summary table; each date row is that day's record — Yes / No per
  check point, the trap count in column 4, the number of pests trapped in column 7 (the "except
  point no. 7" exception; the box and location sit in the catch details / summary), "HOLIDAY"
  written across a closed day like the "H O L I D A Y" rows on the specimen, time of checking,
  checker. The three blank pages are kept in `frontend/public/source/` and can be shown next to the
  register for comparison.
- **Response vocabulary — RESOLVED.** The printed instruction says every checkpoint except #7 is
  answered OK/Not OK, but the filled specimen actually uses **Yes/No** answers throughout
  (checkpoints 1, 2, 3, 5, 6, 7, 10), checkpoint 4 is a number (observed value: 100), and
  checkpoints 8/9 need a free-text note ("if yes, mention…") when flagged. Originally digitized
  with an OK/NOT OK control for 1, 2, 3, 5, 6, 10 as a judgment call reconciling the printed
  instructions with actual practice; confirmed against the source photograph a second time and
  changed to Yes/No throughout (matching the specimen exactly) — see `src/data/seed/masterData.ts`
  checkpoints and `src/engine/checkpoints.ts` for the per-checkpoint "which answer is a finding"
  polarity this required (e.g. checkpoint 1 is a finding when answered "No"; checkpoint 2 is a
  finding when answered "Yes" — the printed instruction text itself is otherwise unchanged,
  verbatim, per the header/instructions page).
- **Holiday rows.** The filled specimen shows some daily rows containing "H O L I D A Y" spelled
  vertically down the checkpoint columns instead of data (rows observed at roughly rows 6, 13,
  15, 20, 27, 28 of the August‑26 specimen — not a strict weekly pattern). Modeled as a per-record
  `isHoliday` flag rather than assumed Sundays, since the observed pattern did not consistently
  land on Sundays. **TO BE CONFIRMED**: the company's actual holiday calendar.
- **Checker name.** Handwritten, reads approximately "Roshni" — **TO BE CONFIRMED** exact spelling.
  Used only as sample master data (Master Data > Employees), clearly flagged.
- Summary-of-actions table columns (verbatim): Date of observation | Description of Observation |
  Action Taken | Remarks.

## 2. Fortnightly — Fly Catcher Inspection & Cleaning Record

```
SOURCE DOCUMENT      Kapila mam department reports.pdf, pages 5-6
DOCUMENT STRUCTURE   Header + Month&Year + PC location legend (PC-01..PC-13) + data table
DIGITAL TEMPLATE     kind: "fly-catcher" — src/components/records/FlyCatcherRecordView.tsx
DATABASE FIELDS      FlyCatcherData: monthYear, entries[13] { pcId, catchCountApprox,
                      tubeLightInstallDate, tubeLightDueDate, cleaningDoneBy, verifiedBy }
WORKFLOW             Frequency: Fortnightly (schedule anchor: day 3 & 17 of each month, matching
                      the two dated service rows observed in the specimen — 03‑Aug‑26 & 17‑Aug‑26)
REPORT               Reports > Fly Catcher Trend
```

- Format No. **F/HR/18**, Rev No. **02**, Date **15.12.2024**.
- PC location legend, verbatim: PC‑01 Near Wash room (GF); PC‑02 Near Ink room (GF); PC‑03 Gallus
  machine room (GF); PC‑04 Pouching area (GF); PC‑05 Pouching area (GF); PC‑06 Pouching area (GF);
  PC‑07 Near Lombardi m/c (FF); PC‑08 Ink Kitchen (FF); PC‑09 Warehouse entrance (GF); PC‑10
  Warehouse office wall; PC‑11 Change room (GF); PC‑12 Dispatch gate (GF); PC‑13 Dispatch gate
  entrance (GF). (GF/FF read as Ground Floor / First Floor by pattern — **TO BE CONFIRMED**.)
  PC‑10's floor was not legible/labelled with GF or FF in the source — kept as **TO BE CONFIRMED**.
- Table columns, verbatim: PC ID No. | Date of Service | Flies Catch Count Approx. | Date of Tube
  Light Installation | Due Date for Tube Light Replacement | Cleaning Done By | Verified By.
- Tube light install/due dates repeat via ditto marks within a PC's two rows in the specimen, and
  are the same on every unit — two fixed dates, pre-filled on every sheet (§44). They remain
  editable per PC per visit rather than hard-locked, since a replacement can happen between visits.
- Sample names observed: Cleaning Done By = "Vijay"; Verified By reads like "Roshni" — **TO BE
  CONFIRMED** exact spelling (same caveat as above).
- **Specimen counts (August-26, transcribed):** visit 03/08/26 then 17/08/26 — PC-01 1, 1; PC-02 0, 1;
  PC-03 2, 2; PC-04 1, 1; PC-05 3, 0; PC-06 1, 1; PC-07 1, 1; PC-08 0, 1; PC-09 1, 0; PC-10 2, 1;
  PC-11 2, 0; PC-12 1, 1; PC-13 1, 0. Tube light installed **24/11/25**, replacement due
  **23/11/26** on every unit (ditto marks on the second row) — the department confirmed both dates
  on 13-Sep-2026 and they are fixed, not an annual cycle; the month had been read as December from
  the photographed specimen. See §44.
- **Fly Catcher Infestation trend + fly pattern.** This record is the data behind **Pest Control >
  Trend Analysis > Fly Catcher Infestation** (`/pest/trend/fly-catcher`, also Reports > Fly Catcher
  Infestation): the per-unit counts are added up per month in the same Source / Unit / Target Pest /
  Year / Jan–Dec / Total layout as the company's Rodent Catch Report, overall and per unit PC-01…PC-13
  with its location. The assistant's pre-fill (and Demo Mode) fills "Flies Catch Count Approx." from a
  generated seasonal per-unit pattern in `tools/pest_pattern.py` → `src/data/seed/pestPattern.ts`,
  applied by `src/engine/flyPattern.ts`: the August-26 specimen above is taken as the peak-month mean
  per unit (August is the monsoon peak), other months scaled down by a seasonal factor (February ≈ a
  third), entrances / dispatch gates weighted up, Poisson-distributed per unit per visit and seeded
  by unit + date so the same inspection always shows the same counts.

## 3. Pesticide Application Chart (Chemical Master)

```
SOURCE DOCUMENT      Chemical Cahrt new.docx
DOCUMENT STRUCTURE   Single table: Sr. No | Services Name | Pest Covered | Chemicals to be use | Dilution Ratio
DIGITAL TEMPLATE     kind: "chemical-master" (reference only) — src/pages/ChemicalMasterPage.tsx
DATABASE FIELDS      ServiceTypeChemical[] (src/types/master.ts)
WORKFLOW             As Required / reference. Consumed by Service Report's chemical suggestion.
REPORT               Reports > Chemical Usage
```

- No Format No. / Revision No. printed on this chart — **TO BE CONFIRMED**.
- Rows, verbatim:
  1. Rodent Control Service — (Rat, Mice & Bandicoots) — Tamper Proof Bait Stations, Bromadiolone
     Wax Block 0.005%, Non‑Chemical Glue trap, Bait Traps — Ready to Use.
  2. Fly Control Service & Mosquito Control Services — House Fly — Kothrine (Deltamethrin 2.5%
     SC) / Responsar (Beta‑Cyfluthrin 2.45% SC) — 25 ml/Sq.Mt (Kothrine) / 20 ml per 1 litre
     water (Responsar).
  3. General Pest control — Cockroaches, Red & Black Ants — Maxforce gel / Kothrine (Deltamethrin
     2.5% SC) / Responsar (Beta‑Cyfluthrin 2.45% SC) — Ready to Use (gel) / 25 ml per Sq.Mt
     (Kothrine) / 20 ml per litre (Responsar).

## 4. Standard Operating Procedure for Pest Control Services — WITHDRAWN 13-Sep-2026

> **This document is no longer in the system.** It was withdrawn on the owner's instruction
> ("remove whole SOP Reference from pest control module"): it is the service provider's own
> procedure, not one of the company's controlled formats — it appears nowhere on the Master List
> of Formats & Records, which is why its Format No. and Revision were both TO BE CONFIRMED below.
> See §42 for what came out and what the Service Agreement kept. The section is left here because
> it records what the source file said and what was built from it; the paths it names are gone.

```
SOURCE DOCUMENT      Standard Operating Procedure for Pest Control Services..docx
DOCUMENT STRUCTURE   5 sections (General Pest Control, Rodent Control, Fly Control, Mosquito
                      Control, Lizard Control), each with Chemicals / Process / Log Sheet note /
                      Preventive Measures
DIGITAL TEMPLATE     kind: "sop-reference" (reference only) — src/pages/SopReferencePage.tsx,
                      content in src/data/seed/sopContent.ts — BOTH DELETED 13-Sep-2026 (§42).
                      Its Scope of Services lines live on in src/data/seed/serviceAgreement.ts.
DATABASE FIELDS      n/a (static reference content)
WORKFLOW             As Required / reference. Used to configure checkpoints and chemicals (its
                      Lizard-control cadence is noted in §5 — no service-report document exists
                      for it in the uploaded files).
REPORT               n/a
```

- No Format No. / Revision No. printed — **TO BE CONFIRMED**.
- **Frequency**: only the Lizard Control section states an explicit cadence — *"The Frequency
  recommended is quarterly however it may depend upon the local situation and may vary from
  place to place."* This is the only frequency the SOP itself specifies; General/Rodent/Fly/
  Mosquito control cadence in this system comes from the dated Service Report specimens
  (fortnightly), not from the SOP text itself.
- **Mosquito Control** has no dedicated Service Report specimen in the uploaded files (the
  Chemical Chart groups it with Fly Control). No standalone Mosquito Control Service Report
  document was created for this reason — **TO BE CONFIRMED** whether the company wants one.

## 5. Pest Control Service Report (Gurudev Pest Control)

```
SOURCE DOCUMENT      Service ReportApril 2026.xls (6 sheets: 1st/2nd Service x Rodent/General/Fly)
DOCUMENT STRUCTURE   Header (provider/unit/service name/date) + Sl.No/Area/Material/Qty/Method/
                      Remarks table (fixed area list per service type) + technician/customer signatures
DIGITAL TEMPLATE     kind: "service-report" — src/components/records/ServiceReportRecordView.tsx
                      (3 DocumentDefinition variants: Rat / Mice (Rodent), Ants & Cockroaches
                      (General), Fly — each listed on its own page under Pest Control > Service
                      Reports, /pest/service/{rodent|general|fly})
DATABASE FIELDS      ServiceReportData: serviceName, lines[] {slNo, areaName, materialName,
                      qtyUsed, methodOfApplication, remarks}, technicianSign, customerSign
WORKFLOW             Frequency: Fortnightly (anchor day 4 & 18 — matches 04.04.2026 & 18.04.2026
                      specimens exactly).
REPORT               Pest Control > Service Reports (last visit / next due / materials / areas per
                      service), Reports > Monthly Records Report, Reports > Chemical Usage
```

- No Format No. / Revision No. on this contractor-supplied template — **TO BE CONFIRMED**.
- Fixed area checklists, verbatim from source, per service type:
  - **Rodent Control Service** (16 areas): Printing machine GF; Anilox cleaning area GF; Store —
    Label stock & PVC/PET Films GF; Ink store GF; RM Inward & FG Dispatch room GF; Walkways GF;
    FF Walkways; FF Slitting & Packing; FF Offline punching & QC Inspection; FF Printing machine;
    FF Ink Kitchen; FF Shrink Sleeve production; FF Intermediate Store; Change room & Locker room
    GF; QC Lab; Canteen.
  - **General Pest Control Services / Fly Control Services** (shared 9-area list): GF Change room
    (outer periphery); GF RM Inward & FG Outward area (outer periphery); 1st floor Stair case; GF
    Mono carton area; GF Paper storage area; FF Printing plate storage area; FF Utility area; QC
    Lab GF; Canteen.
- Materials observed: Glue Board (Rodent, qty 3‑4, method "Trouble gum placement" [sic, kept as
  written], remarks "No Rodent Trapped"); Bromadiolone Cake (Rodent, at Offline punching & QC
  Inspection, 30‑40 grams, "Baiting"); Deltamethrin 2.5% SC (General, 150 ml, "Spraying");
  Beta‑Cyfluthrin 2.45% SC (Fly, 100‑150 ml, "Spraying").
- **Per-area material/method logging — RESOLVED.** In both specimens, material/qty/method/remarks
  were filled only on the *first* area row of each visit, not per area. Confirmed: Material Name
  and Method of Application don't vary visit to visit for a given area (they follow the SOP /
  Chemical Master for that service type), so both are now **fixed, read-only values pre-filled
  per area line** — Glue Board / "Trouble gum placement" for Rodent Control areas generally,
  Bromadiolone Cake / "Baiting" specifically at First Floor Offline Punching & QC Inspection
  (the one area the source specimens show treated differently), Deltamethrin 2.5% SC / "Spraying"
  for General Pest Control, Beta-Cyfluthrin 2.45% SC / "Spraying" for Fly Control (see
  `src/engine/serviceMaterials.ts`). Remarks remain free text per area per visit. **Quantity Used is
  entered once per material** (11-Sep-2026, on the department's instruction — "when quantity is added
  in the first [line] it will be same for all others"): typed on the first line, it is carried by
  every other line with the same material, which is what the specimens' single first-row entry means.
  The Rat / Mice report's bait area (Bromadiolone Cake, 30–40 grams) is the first line of its own
  material and keeps its own quantity. Material and method can't be typed over — not on the form, not
  through the assistant — and service-report drafts written before this rule are brought into line at
  start-up, logged in their history by "System" (`src/engine/serviceReportDrafts.ts`); submitted and
  verified reports are left exactly as signed.
- **Lizard / Mosquito — no service-report document.** (The lizards trapped in the Roda-boxes are
  reported on the company's own Lizard Catch Report and Trend Analysis — §41.) The provider's
  procedure describes Lizard Control (quarterly)
  and Mosquito Control services, but the uploaded files contain no service-report specimen for
  either — the April-2026 workbook has Rodent / General / Fly sheets only. A "Lizard Control
  Services" variant that had been created from the SOP text alone was **retired on 08-Sep-2026**
  when the module was reorganised around the three reports the department actually receives
  (`RETIRED_DOCUMENT_IDS` in `src/data/seed/documentDefinitions.ts`; any records a browser still
  held for it are removed at boot). **TO BE CONFIRMED**: whether Gurudev Pest Control issues a
  separate report for lizard / mosquito visits — if so it is one more variant, no new component.

## 6. GAP Analysis Report (Pest Control), December 2023

```
SOURCE DOCUMENT      GAP Analysis Report Pest control Dec 2023.xlsx
DOCUMENT STRUCTURE   Header (date/premises/contact) + findings table + general comments
DIGITAL TEMPLATE     kind: "gap-inspection" — src/pages/GapPage.tsx
DATABASE FIELDS      GapInspectionData: inspectionDate, premisesName, premisesAddress,
                      contactPerson, findings[] {findingOfInspection, commentsOnFindings,
                      correctiveActionContractor, correctiveActionClient, targetDate,
                      actualDateOfAction, verifiedByServiceProvider, status}, generalComments[]
WORKFLOW             Frequency: As Required (created manually per inspection). The real
                      13‑Dec‑2023 inspection is loaded as historical LIVE data (isDemo: false).
REPORT               Reports > GAP Status
```

- No Format No. / Revision No. — **TO BE CONFIRMED**. Date of Inspection **13.12.2023**.
  Premises: Gujarat Print Pack Publications Pvt. Ltd., Dediyasan GIDC, Mehsana. Contact Person:
  Ms. Kapila Barad.
- All 5 findings and both general comments were transcribed verbatim (see the seeded record in
  `src/data/seed/historicalRecords.ts`) — not summarized or reworded.
- The source left "Actual date of action taken" and "Verified by Service provider" blank for
  every finding; these stay blank/null in the digital record. Because the 31‑Dec‑2023 target
  date has long since passed with no completion recorded, the system correctly (and
  automatically) computes these findings as **Overdue** today — this is the frequency/overdue
  engine working as designed, not invented data.

## 7. Training Certificate (Technician)

```
SOURCE DOCUMENT      Tr. Certi.docx
DOCUMENT STRUCTURE   Letterhead + subject line + narrative certifying a named technician + 5 topics + signatory
DIGITAL TEMPLATE     kind: "training-record" — src/pages/TrainingPage.tsx
DATABASE FIELDS      TrainingRecordData: trainingDate, trainingType, trainerProvider, topics[],
                      attendees[] {employeeName, department} — the attendance sheet itself; the
                      `attended` tick was withdrawn 13-Sep-2026 (§43) — certificateRef, remarks
WORKFLOW             Frequency: As Required. The real 02‑Dec‑2025 certificate is loaded as
                      historical LIVE data (isDemo: false), status Verified (a signed
                      certificate is treated as the verification evidence).
REPORT               Reports > Training Status
```

- Date **02/12/2025**. Technician: **Mr. Yogesh Rathod**, trained by **Gurudev Pest Control
  Services**, certified to carry out pest control operations. Issued **for Gurudev Pest Control**
  by **Rohit Patel**.
- Topics, verbatim: (1) Safety, Health Environment, Zero tolerance Policy, MSDS, SOP. (2)
  Cockroach — Facts, Source of Breeding, Damages and Diseases. (3) Rodent — Facts, Signs of
  Infestation, Damages and Diseases. (4) Flies and Mosquitoes — Facts, Source of Breeding,
  Damages and Diseases. (5) Importance of Housekeeping/Sanitation.
- **TO BE CONFIRMED**: no source document states a recurrence/cadence for this kind of training
  (the master prompt's introduction mentions "annual pest-control awareness training" as a
  category, but no uploaded document specifies that cadence). Frequency left as **As Required**
  rather than assuming annual.

## 8. Rodent Catch Report and Trend Analysis (existing company report)

```
SOURCE DOCUMENT      Kapila mam department reports.pdf, page 1 (photographed)
DOCUMENT STRUCTURE   Table: Source | Unit | Target Pest | Year | Jan..Dec | Total, + bar chart
DIGITAL TEMPLATE     n/a — this is evidence the company already produces a rodent trend report
DATABASE FIELDS      n/a
WORKFLOW             n/a
REPORT               Reports > Rodent Trend (see note below)
```

- This is not a fillable form — it is an existing computed report (Source: "Trapped on Glue
  boards in Roda-boxes", Unit: Number, Target Pest: Rodents, by Year/Month). It confirms the
  company already tracks this metric and expects a digital equivalent (section 32/33 of the
  master prompt).
- **Reported figures (transcribed from the page):** 2024 — 0 every month, total 0. 2025 — MAY 1,
  JUN 1, all other months 0, total 2. 2026 — 0 for JAN–JUN, later months not yet reported. The bar
  chart on the page shows the same (May 1, Jun 1, Total 2). These rows are embedded verbatim
  (`src/data/seed/pestPattern.ts`, `RODENT_HISTORY_REPORTED`) and shown "(as reported)" in
  **Reports > Rodent Catch Report and Trend Analysis**, above the digital row.
- **The catch count is now captured on the daily record.** Answering Yes to checkpoint 7 opens a
  "Rodent catch details" table — trap box no. (RB-01…RB-100), location (one of the 16 Rodent
  Control Service areas) and number of rodents — and Submit requires it. That is the structured
  count the company's report needs; the report adds it up per month, per location and per box, in
  the company's own Source / Unit / Target Pest / Year / Jan–Dec / Total layout.
- **Rodent activity pattern (pre-fill and Demo Mode).** A register that says "no rodents" every
  day tells an auditor nothing, so the assistant's pre-fill and Demo Mode follow a generated
  seasonal pattern: `tools/pest_pattern.py` (Python, numpy) produces the parameters — a monsoon-
  peaking daily catch probability (~10 catch days a year), location weights favouring the canteen,
  inward-goods and storage areas, a per-day count distribution (mostly 1, sometimes 2–3), and the
  conditional signs for checkpoints 8 (dead rodent, with location) and 9 (bait-cake biting, with
  box no.) — written to `src/data/seed/pestPattern.ts`. `src/engine/rodentPattern.ts` applies it
  deterministically per calendar date, so the same day always shows the same event and a month
  reads as one consistent story. Calibrated against the reported history above (low, monsoon-
  leaning incidence) but deliberately a little richer so the trend is visible in a demo year.
  **TO BE CONFIRMED**: the real trap-box numbering (the Dec-2023 GAP report flagged it as missing;
  RB-01…RB-100 is an assumption matching "100 traps provided" on the specimen).

---

# Second batch — "Audit documents.zip" (received 07-Sep-2026)

The zip (extracted to `source-documents/` in this repo for traceability) contains the pest-control
files above plus the new material below. Everything new is digitized through the generic
**log-sheet** kind (`src/data/seed/logSheetLayouts.ts` + `LogSheetRecordView.tsx`) or the
**compliance-statement** kind — see DATA_MODEL.md.

## 9. Lamination Adhesive Viscosity Record

```
SOURCE DOCUMENT      WhatsApp Image 2026-09-07 at 2.15.18 PM.jpeg (photographed register, filled 6/9/26–7/9/26)
DOCUMENT STRUCTURE   Header (logo / title / Format No. / Rev / Date) + two side-by-side grids:
                      Sr. No. | Date/Time | Viscosity (20.0 ± 1.0 Sec.) | Tested By
DIGITAL TEMPLATE     kind: "log-sheet", layout "qc-viscosity" — 24 fixed hourly rows (09:00 … 08:00)
DATABASE FIELDS      LogSheetData.rows[] { time (fixed), viscosity (number), testedBy }
WORKFLOW             Frequency: Daily (one sheet-day = one record; readings hourly round the clock)
REPORT               Reports > Lamination QC (daily average, out-of-band count)
```

- Format No. **F-QC-30**, Rev **00**, Date **15.12.2024** — read off the header.
- Specification printed in the column heading: **20.0 ± 1.0 Sec.** Modeled as `nominal 20 / min 19 /
  max 21`; readings outside the band are highlighted (not blocked — the paper has no gate either).
- Specimen shows a day tester (handwritten, reads "Jeni") for 09:00–17:00 and a night tester
  ("Singh") from 18:00; the digital sheet pre-fills the same day/night split. **TO BE CONFIRMED**:
  full names / spelling of both testers.
- Observed specimen values 19.16–21.08 Sec. were transcribed as the layout's specimen rows.

## 10. Adhesive Mixing Ratio Record

```
SOURCE DOCUMENT      WhatsApp Image 2026-09-07 at 2.15.17 PM.jpeg (photographed register)
DOCUMENT STRUCTURE   Header + grid: Sr. No. | Date | Time | Adhesive (kg) | Hardener (kg) | Ethyl (kg) |
                      Viscosity (Sec.) | Remark | Checked by | Verified by
DIGITAL TEMPLATE     kind: "log-sheet", layout "qc-adhesive-mixing" — free rows (one per batch)
DATABASE FIELDS      rows[] { time, adhesive, hardener, ethyl, viscosity, remark, checkedBy, verifiedBy }
WORKFLOW             Frequency: Daily (the paper sheet spans days; the digital record is per day, Date implied)
REPORT               Reports > Lamination QC (batches per day)
```

- Format No. **F-QC-32**, Rev **00**, Date **15.12.2024**.
- Every specimen batch is **15 kg adhesive / 1.65 kg hardener / 19.5 kg ethyl** with mix viscosity
  19.76–20.15 Sec.; those set quantities are carried forward exactly by the assistant, only the
  viscosity varies.
- "Verified by" carries signatures on the specimen (reads "Jeni" / "Singh") — left blank in the
  prepared draft for the verifier to fill.

## 11. Temperature Monitoring Record (Hot Room)

```
SOURCE DOCUMENT      WhatsApp Image 2026-09-07 at 2.15.19 PM (1).jpeg (photographed register, 21-08-26 … 5-9-26)
DOCUMENT STRUCTURE   Header + "RECOMMENDED TEMPERATURE : HOT ROOM 45°C ± 2°C" + 50-row grid:
                      SR NO | DATE | 08:30 | 12:30 | 16:30 | 20:30 | 12:30am | 04:30 HRS TEMP. + SIGN
DIGITAL TEMPLATE     kind: "log-sheet", layout "qc-temperature" — single row per day, six reading columns + Sign
DATABASE FIELDS      rows[0] { t0830, t1230, t1630, t2030, t0030, t0430, sign }
WORKFLOW             Frequency: Daily
REPORT               Reports > Lamination QC (daily min–max)
```

- Format block reads **F-QC-40.C (00/28.02.25)** → Format No. F-QC-40.C, Rev 00, Date 28.02.2025.
- Band **43–47 °C** from the printed recommendation. Observed values 44–46 °C.
- The specimen skips 28-08-26 (Rakshabandhan), Thursday 03-09-26 (the weekly off) and 04-09-26
  (Janmashtami) — consistent with the working calendar in §16, which is why no lamination log sheet
  is generated for a closed day.

## 12. Solvent Base Lamination — Process Parameter Record

```
SOURCE DOCUMENT      WhatsApp Image 2026-09-07 at 2.15.19 PM.jpeg (photographed sheet, 07-09-26)
DOCUMENT STRUCTURE   Header fields (Operator, Machine, Date & Shift, Mixing Ratio, Adhesive make/code/batch,
                      Hardener make/code/batch) + grid: Internal PO No. | FG Code | Job Name | Coating Nip
                      Pressure | Doctor Blade Pressure | Primary U/W Tension | Lay On Roll Pressure | Hood A
                      Temp. | Hood B Temp. | Line Speed | Rewinder Tension | Secondary U/W Tension | Tapper
                      Tension | Laminator Nip Pressure | Lamination Nip Temp.
DIGITAL TEMPLATE     kind: "log-sheet", layout "prd-process-parameter" — free rows (one per job)
WORKFLOW             Frequency: Daily, with a Shift (A/B/C) header field (paper is one sheet per shift)
REPORT               n/a (searchable by PO / FG / job / batch)
```

- **Format No. is hidden under the clip in the photograph** — only "(00/15.12.2024)" is visible.
  Format No. left **TO BE CONFIRMED**; Rev 00, Date 15.12.2024.
- Header values transcribed: Operator Gaurav Singh, Machine Lamination-1, ratio "10 : 1.1 : 9.5",
  Adhesive DOW 545S, Hardener DOW F-854. Batch numbers are best-effort reads of handwriting
  (`B35007107`, `44000N0301`) — **TO BE CONFIRMED**.
- Jobs and settings transcribed verbatim (five VP Bedekar / Sweet Karam jobs, settings 3.00 / 2.00 /
  45 / 3.00 / 42 / 52 / 81–130 / 52–32 / 40–28 / 15% / 6.00 / 60–90). Machine set-points are carried
  forward exactly by the assistant (they are settings, not readings).

## 13. Solvent Base Lamination — ALC & Production Report

```
SOURCE DOCUMENT      WhatsApp Image 2026-09-07 at 2.15.20 PM.jpeg (photographed sheet, 07-09-26, Shift A)
DOCUMENT STRUCTURE   Header (Operator, Machine, Date & Shift) + ALC PROTOCOL text (5 points) + grid: FG Code |
                      Internal PO No. | Job Name | Layer 1 Type | Layer 1 - Kgs. | Layer 2 Type | Layer 2 - Kgs. |
                      ALC Done As Per Above (Yes/No) | Operator Sign | Start Time | End Time | Laminated Roll
                      Weight - Kgs. | OK Meters | In Time (Hotroom)
DIGITAL TEMPLATE     kind: "log-sheet", layout "prd-alc-production" — free rows (one per job)
WORKFLOW             Frequency: Daily, Shift header field
```

- Format block reads **F-PRD-18 (01/25.06.2025)** → Rev 01, Date 25.06.2025.
- ALC protocol text transcribed verbatim into the layout's instructions.
- Layer 2 type reads "MetPET" plus an illegible suffix ("N-1d"?) — kept as **MetPET**, TO BE CONFIRMED.

## 14. Statements of Compliance (F/QC-09 Labels, F/QC-38 Flexible Packaging)

```
SOURCE DOCUMENT      F-QC-09_Statement of Compliance (SOC) - Label.docx (two identical copies in the zip);
                      F-QC-38_Statement of Compliance (SOC) - Flexible packaging Pouch & Film.docx
DOCUMENT STRUCTURE   Two-column table (Manufacturer … Post-consumer recycling) + declaration paragraphs + signature
DIGITAL TEMPLATE     kind: "compliance-statement" (reference only) — src/pages/CompliancePage.tsx,
                      content in src/data/seed/complianceStatements.ts (verbatim)
WORKFLOW             As Required. Each declaration "is valid for two years from the date of Publication":
                      F/QC-09 signed 1st April 2025 → re-issue due 01-Apr-2027; F/QC-38 signed 24 FEB 2025 →
                      due 24-Feb-2027. The assistant's briefing flags a re-issue 90 days ahead.
```

- Format/Rev from the Word footers: **F/QC- 09 (Rev – 00 / 01.12.2021)** and **F/QC- 38 (Rev – 00 /
  24.02.2025)**. Signatory **Shail Patel (CEO)**.

## 15. Pest Control Awareness Training Programme (24-Dec-2025)

```
SOURCE DOCUMENT      Training - Yrl (1).doc (Word 97-2003)
DOCUMENT STRUCTURE   Letterhead, Date 24.12.2025, Subject, 8 training topics, list of 7 attendees, signed Rohit Patel
DIGITAL TEMPLATE     Existing kind "training-record" — loaded as historical LIVE data (record id training-2025-12-24)
WORKFLOW             Training Record frequency changed from "As Required" to **Yearly (24 Dec)**
```

- Topics and attendees transcribed verbatim (Akash Patel, Ajay Vaghela, Kapila Barad, Meet Patel,
  Harsh Parmar, Chirag Parmar, Mukesh Patel). Attendees added to Master Data > Employees with
  department **TO BE CONFIRMED**.
- **Cadence resolved (previously TBC #8)**: the file is titled "Training - Yrl", i.e. yearly, and the
  master prompt describes annual awareness training — so the document is now Yearly. The frequency
  engine creates the Dec-2026 shell and the assistant pre-fills it from the 2025 programme.

## 17. QC Inspection Records — Pouching (F/QC/37), Slitting (F/QC/35), Printed Film (F/QC/34)

```
SOURCE DOCUMENT      Three photographed registers (WhatsApp, 07-Sep-2026): F/QC/37 filled 06/03/26 (Gulab Oil And
                      Food, "California Almonds and Whole Cashews", FG 5420, PO 81509); F/QC/35 filled 1-3-26 (FG 5703,
                      PO 81857, mother roll 1); F/QC/34 filled 18/8/26 (FG FGP0698Z, PO 88083, Lombardi)
DOCUMENT STRUCTURE   Job header (FG code, PO, date/shift, substrate, +customer/job name / mother roll / printed roll /
                      machine) + fixed table Sr. No. | Test Parameters | Specification | Observation + LOT STATUS
                      (Accepted / Reject-Scrap / Segregation / Accepted on Deviation) + Reason for deviation +
                      Inspected By (QA Inspector) / Approved By (QA Manager)
DIGITAL TEMPLATE     kind: "log-sheet", rowMode "fixedRows" (layouts qc-inspection-pouching / -slitting / -printed-film)
WORKFLOW             Frequency: Daily (one inspection per production day; paper is per lot — see TBC #14)
```

- All three carry footer "Format number: F/QC/xx (00 / 15.12.2024)" → Rev 00, Date 15.12.2024.
- Test parameters and specifications transcribed verbatim (11 / 3 / 8 rows). The **Specification column is
  read-only** — it is printed text, never something the inspector types.
- **Removed from the digital form on purpose**: the "Approved By — QA Manager" box (that is the app's
  Verify action, stamped with the verifier's name and time), the page number, and the four separate
  lot-status tick boxes (one select instead, defaulting to Accepted; a reason is required only when
  the lot is not Accepted).
- Handwritten inspector signatures read "Harsh" (F/QC/37), "Pooja P" (F/QC/35) and "S.V.M." (F/QC/34) — added
  to Master Data as QA Inspectors, spelling **TO BE CONFIRMED**.

## 18. In Process Quality Control — F/QC/13 (Gujarati, printing)

```
SOURCE DOCUMENT      Two photographed pages (WhatsApp, 07-Sep-2026), filled 6-9-26: item FGLA 19377, PO 89480,
                      machine Lombardi, operator Pankajbhai, QA person HNP, 1 sample sheet, 7 ups
DOCUMENT STRUCTURE   Page 1: Gujarati procedure + grading rule + A/B/C/F grade chart for 6 parameters + job header +
                      test-chart table (parameter | test chart | grade | pass?). Page 2: %-defective grading rule, defect
                      count per parameter + remarks, ML description, override reason, sign-off name, remarks, QA sign
DIGITAL TEMPLATE     kind: "log-sheet", layout qc-inprocess-printing — 6 fixed rows (grade / pass / defect count),
                      grade chart kept as a collapsible reference table, procedure text as instructions
WORKFLOW             Frequency: Daily (sampled every 6000 m on printing days)
```

- Doc. No. **F/QC/13**; no revision block visible — Rev **TO BE CONFIRMED**.
- Gujarati text (procedure, grading rules, grade chart, test chart) is a **best-effort transcription from
  the photograph**, with English glosses added in brackets for the parameter names only. Please proof-read
  against the original before audit use.
- Specimen grades: Registration B (pass), Shade A, Coating A, Punching –, Print Pressure A, Print
  Deformities B; defect counts +2 / – / – / – / – / +2; remarks "Adjust by Pankajbhai".

## 19. CAPA — External: Customer Complaint Handling Checklist (F/MKT/05)

```
SOURCE DOCUMENT      Updated Checklist.doc (Word 97-2003; converted to text with Word to read the table
                      structure — kept in source-documents/)
DOCUMENT STRUCTURE   Header: Customer Name | Complaint No. | Job Name | Job Code | Complaint Received Date |
                      PO No. Five sections, each a table Sr. No. | Activity | Date | Comments:
                      A. COMPLAINT RECEIPT & REGISTRATION (1–5), B. INVESTIGATION (7–15),
                      C. CORRECTIVE & PREVENTIVE ACTION (CAPA) (16–22), D. CUSTOMER COMMUNICATION (23–28),
                      E. EFFECTIVENESS & CLOSURE (29–32). APPROVAL block: Prepared By / Approved By, each
                      with Designation and Sign & Date. Closing note about the QMS.
DIGITAL TEMPLATE     kind: "complaint-checklist" — src/pages/CapaPage.tsx (ComplaintChecklistPage);
                      verbatim template in src/data/seed/complaintChecklist.ts
DATABASE FIELDS      ComplaintChecklistData: 6 header fields, sections[5].items[] { srNo, activity, done,
                      date, comment, notRequired }, preparedBy / approvedBy { name, designation, date }
WORKFLOW             As Required — one checklist per complaint, created from CAPA → External. The
                      assistant walks the user through it (header → A → B → C → D → E → "submit for
                      approval"); Approved By is stamped by the Verify (approval) step.
REPORT               Reports > CAPA Status (complaints table)
```

- Format number **F/MKT/05 (00 / 21.07.2026)** — read from the document footer. Rev 00, date 21-Jul-2026.
- The printed **Sr. No. sequence skips 6** (A ends at 5, B starts at 7). Kept verbatim rather than
  renumbered, so the digital line numbers match the paper.
- The 31 activities (Sr. No. 1–32 minus the skipped 6) and five section titles are verbatim. Activities marked "(If required)" / "(If
  not received)" are conditional — the assistant offers "Not required" for them first (any activity
  can still be marked not applicable).
- **CAPA module structure.** The module now has exactly two doors: **Internal** (the existing pest
  control inspection-findings report, §6, e.g. the Dec-2023 GAP report) and **External** (this
  checklist — complaints come from customers). Both share the "CAPA (Corrective & Preventive Action)"
  module in the Document Library and sidebar.
- **Removed from the digital form on purpose:** the "Sign & Date" boxes are the app's Submit (Prepared
  By is stamped with the logged-in user and today's date if left blank) and Verify (Approved By is
  stamped with the approver, designation defaulting to "QA Head" per activity 31) steps — nobody types
  a signature. Page numbers are dropped.
- The `.doc` file also carries a stale trailing footer from another template ("SPECIFICATION: PAPER
  CORE — QA/ICM/SPEC/14, Rev 04") — not part of this checklist, ignored.

## 16. Leave Calendar 2026 — the company's working calendar

```
SOURCE DOCUMENT      WhatsApp Image 2026-08-11 at 12.29.42 PM.jpeg — TWO printed copies of the
                      "Gujarat Print Pack Leave Calendar 2026" notice, pinned one above the other
DIGITAL TEMPLATE     Master Data > Holidays: weekly off day + festival holidays + adjustment days;
                      src/engine/holidays.ts is the single rule every screen and engine uses
DATABASE FIELDS      MasterData.weeklyOffDay (0-6), holidays[] {id, date, name},
                      adjustmentDays[] {id, date, forHoliday, note}
WORKFLOW             Closed day (weekly off / festival): Daily Pest Control Monitoring Record
                      pre-marked "holiday"; no lamination log sheet; no reminder; any fortnightly /
                      monthly / quarterly / yearly record that lands on it is due the NEXT WORKING DAY.
                      Adjustment day: a normal working day.
REPORT               Record Calendar (weekly off / holiday / working-day chips), Day View banner,
                      Dashboard header ("next on the leave calendar"), the assistant ("is Thursday a
                      holiday?", "next holiday?", "adjustment days?")
```

- **Resolves TBC #3** (holiday calendar) fully. **The weekly off is Thursday** (confirmed by the user
  on 08-Sep-2026, and by the notice itself — its adjustment days are all Thursdays; the F-QC-40.C
  temperature register in §11 likewise has no row for Thursday 03-09-26).
- **Two copies of the notice, transcribed.** The **top copy** is for the Thursday-off roster and is
  the one loaded — 13 festival holidays: 14-01 Wed Uttarayan; 26-01 Mon Republic Day; 04-03 Wed
  Dhuleti; 15-08 Sat Independence Day; 28-08 Fri Rakshabandhan; 04-09 Fri Janmashtami; 19-10 Mon
  Navratri Atham; 20-10 Tue Navratri Navam; 09-11 Mon New Year; 10-11 Tue Bhai Dooj; 11-11 Wed,
  12-11 Thu, 13-11 Fri Padtar Diwas. Its "Adjustment Date / Adjustment Day" column lists five
  Thursdays the plant works: **22-01-2026** (next to Republic Day), **06-08-2026** (Independence Day),
  **22-10-2026** (Navratri Navam), **05-11-2026** (Padtar Diwas 11-11) and **20-11-2026** (Padtar Diwas
  13-11). Footer, verbatim: *"Everyone must report to the company on adjustment Day is written next
  to this holiday, which everyone is requested to take note of."* The **bottom copy** is the same
  calendar for a Sunday-off roster: 14 rows (it adds Thursday 15-01-2026 Uttarayan, which for the
  Thursday roster is simply the weekly off) with adjustment days on Sundays (11-01, 25-01, 09-08,
  11-10, 01-11, 15-11). Not loaded; recorded here so nothing on the board is lost.
- **TO BE CONFIRMED (HR):** the notice prints "20-11-2026 — Thursday", but 20-Nov-2026 is a Friday
  (the Thursdays are the 19th and 26th). Loaded exactly as printed, flagged in Master Data → Holidays,
  editable there. Also: whether any staff actually follow the Sunday-off copy.
- **Scheduling rule (engine/holidays.ts, used by the record generator, Demo Mode and the Pest Control
  pages' "next due"):** a date is closed if it is a festival holiday, or the weekly-off weekday and
  not an adjustment day. The Daily Pest Control Monitoring Record still gets a record on a closed day,
  pre-marked as a holiday (the paper register's "H O L I D A Y" rows); the other daily registers have
  no sheet; every other cadence moves to the next working day — a Gurudev visit scheduled for
  Thursday the 4th happens on Friday the 5th (June 2026: both the 4th and 18th are Thursdays; the
  fly-catcher inspections of 03/17-Sep and 03/17-Dec likewise). The record's `periodKey` is derived
  from the *scheduled* date, so generation stays idempotent whether or not the due date moved.
- Everything the earlier version stated still holds: adjustment (make-up) days are working days and
  are never treated as holidays.

---

## 20. Pest Control module structure (08-Sep-2026)

```
SOURCE DOCUMENTS     The pest-control files in "Audit documents.zip": Kapila mam department reports
                      .pdf (p.1 Rodent Catch Report & Trend, pp.2-4 Daily Pest Control Monitoring
                      Record, pp.5-6 Fortnightly Fly Catcher Inspection & Cleaning Record), Service
                      Report-April 2026.xls (Rodent / General / Fly, 1st & 2nd service), Standard
                      Operating Procedure…docx, Chemical Cahrt new.docx, Training - Yrl (1).doc
DIGITAL TEMPLATE     src/pages/PestControlPages.tsx (overview + one page per group); sidebar group
                      with sub-headings (src/components/layout/Sidebar.tsx); DocumentDefinition.section
WORKFLOW             Unchanged — the frequency engine still generates the records; these pages are
                      the department's way in
```

The module is now organised the way the department reads its paperwork, in four groups
(`DocumentDefinition.section`), each with its own page:

| Group | Documents | Page |
|---|---|---|
| **Daily Report** | Daily Pest Control Monitoring Record (F/HR/17), daily | `/pest/daily[/{year}/{month0}]` — the month register: date, status, findings, rodents (box · location), checker, time; "Open today's record" |
| **Service Reports** | Rat / Mice (Rodent Control Service); Ants & Cockroaches (General Pest Control Services); Fly Control Services — Gurudev Pest Control, fortnightly (4th & 18th) | `/pest/service/{rodent|general|fly}[/{year}]` — next visit due, last visit, visits completed, material / fixed areas / pests covered, then the year's visits |
| **Trend Analysis** | Rodent Catch Report and Trend Analysis (computed from the daily record's checkpoint 7 — §8); Fly Catcher Infestation (from the Fortnightly Fly Catcher Inspection & Cleaning Record, F/HR/18 — §2) | `/pest/trend/rodent[/{year}]`, `/pest/trend/fly-catcher[/{year}]` — both in the company's Source / Unit / Target Pest / Year / Jan–Dec / Total layout |
| **Training & Reference** | Training Record (yearly, §7 / §15); Pesticide Application Chart (§3) | `/training`, `/chemical-master` |

`/pest-control` is the module overview: today's daily record and its status, this month's days
recorded / awaiting submit / findings / rodents, each service's last visit and next due, this
year's rodent and fly totals, the last training. Everything the earlier flat "Pest Control" list
held is still here — nothing from the zip was dropped; the one document removed is the Lizard
service-report variant that had no source specimen (§5). The assistant's route guide
(`backend/assistant.ts`) knows every page, so "show me the rat reports" / "fly catcher infestation
for this year" navigate straight there.

## 21. Assistant: date-range document listing (09-Sep-2026)

```
DIGITAL TEMPLATE     src/engine/assistantLocal.ts — listDocumentsAnswer(), parseDateRange(),
                      matchDocuments(); wired into localAnswer() (widget + /assistant page)
```

The department's own request: to ask the assistant for a document's records over a specific span —
"I want documents of daily pest control monitoring record from 1 to 19 January", "pest control
records for this week", "fly catcher documents for September" — and get back exactly that span, not
a whole month unless a whole month is what was asked for. Answered entirely on the client, instantly:

- **Which document(s)**: a ~30-entry alias table matches a specific document by name/format-no
  ("daily pest control monitoring", "rat and mice", "f/hr/18", "pouching"), falling back to every
  recordable document in a named module ("pest", "pest control", "lamination") only when no single
  document is named, so a precise request is never diluted across an entire module.
- **Which span**: an explicit day-to-day range (including the shorthand "1 to 19 January", where the
  month is only stated once), a single explicit date, "this/last/next week", a bare month name (with
  or without a year) or "this/last/next month" for a whole month, or today/tomorrow/yesterday/a
  weekday (reusing the same single-date parser the holiday questions use).
- **Deliberately requires both** — a message naming a document/module with no date, or a date with no
  document/module, falls straight through to the model exactly as before. This is what keeps existing
  plain-navigation phrasing ("show me all reports of august", "open the rat and mice service reports")
  routed to the model and its `/reports/{y}/{m}/{tab}` navigation unchanged — confirmed by rerunning
  `tests/e2e_assistant_chat.py` (all 9 checks, including "Navigated to Reports for August") after
  adding this.
- Generates records for just the touched months/document(s) on demand before answering, so a span
  nobody has browsed to yet (Live) or that predates the current year's demo generation (Demo) still
  resolves correctly; the Live launch-date floor still applies (a pre-launch span correctly comes back
  "No … records").

## 22. Insecticide Licence — Gurudev Pesticides (Form III, Government of Gujarat)

```
SOURCE DOCUMENT      Service licence GP3 kapila mam.pdf (2 pages, scanned; received 09-Sep-2026)
DOCUMENT STRUCTURE   Page 1: Government of Gujarat FORM III "LICENSE TO SELL, STOCK OR EXHIBIT FOR
                      SALE OR DISTRIBUTE INSECTICIDES [See sub-rules (4) of rule 10]" — registration /
                      licence numbers, date of issue, validity, the grant, the expert staff, seal and
                      signatory. Page 2: "TERMS AND CONDITIONS OF THIS LICENSE" — numbered conditions.
DIGITAL TEMPLATE     kind: "licence" (reference-only) — src/pages/LicencePage.tsx (/licence), data in
                      src/data/seed/serviceLicence.ts; scanned pages served from
                      frontend/public/source/gurudev-licence-page-{1,2}.jpg
WORKFLOW             On file. No records, no due dates. Renewal status TO BE CONFIRMED (below).
```

- Kept **exactly as supplied — nothing in the document changed** (re-confirmed by the department
  09-Sep-2026). The supplied PDF itself is served byte for byte from
  `frontend/public/source/gurudev-insecticide-licence.pdf` (320,370 bytes, SHA-256
  `0a63f34c3d689bcbc75c5fde4391400ba70f0badbe4ec45798794aae08c6c96f` — identical to the file as
  received, to `source-documents/Service licence GP3 kapila mam.pdf`, and to the copy the build emits
  into `dist/`), and opens from the page's "Open the original PDF" button. The two page images shown
  on screen are renderings of that same file (no cropping, no overlays), used so the licence displays
  and prints reliably; the transcription is secondary and labelled so.
- Transcribed, verbatim: Registration No **FP1230000675**; License No **MEH/FP1230000675/2023-2024**;
  Date of issue **12/04/2023**; Valid upto **As per prevailing norms**. Granted to **GURUDEV
  PESTICIDES** for the premises at SHOP NO- F-54, GOLDEN SQUARE, RADHANPUR ROAD, PANCHOT, MEHSANA,
  under the direction and supervision of **PATEL KAUSHAL JAYANTIBHAI**, TECHNICAL PERSON, BSc in
  Chemistry. Seal: Licensing Authority & Dy Director (Extn.) MAHESANA; signed (S. S. PATEL), Deputy
  Director of Agriculture (Extension) Mehsana; footer "Agriculture, Farmers Welfare & Cooperation
  Department, Govt of Gujarat — Print : 12-Apr-2023 12:51:18 PM". Page 2 lists the conditions with
  Sr. Nos. **1, 2, 3, 4, 5, 6, 7, 9, 10, 13, 14, 15** — 8, 11 and 12 are not printed on the page;
  the transcription keeps the numbering exactly as printed rather than renumbering.
- Gurudev Pesticides is the service provider (Gurudev Pest Control) whose technicians file the Rat /
  Mice, Ants & Cockroaches and Fly Control service reports (§5); the licence sits with the SOP and the
  chemical chart under Pest Control > Training & Reference.
- **TO BE CONFIRMED:** the current renewal — the licence number carries 2023-2024, validity is "as
  per prevailing norms", and condition 6 makes renewal an application under rule 10(3A) of the
  Insecticides Rules, 1971. When the renewed licence arrives, replace the scan in `source-documents/`
  and the numbers in `serviceLicence.ts`.

## 23. Assistant scope — this software only (09-Sep-2026)

```
DIGITAL TEMPLATE     backend/assistant.ts (the SCOPE block in runAssistant's system prompt) and
                      src/engine/assistantLocal.ts (offTopicReply)
```

The department's requirement: *"in chat bot make sure always the bot will give me only solution of
this audit software, no general query."* The assistant is a tool for operating this controlled-record
system, not a general chatbot — an auditor reading its chat log should find nothing in it but the
work.

- **In scope:** the records, documents and formats; the modules (Pest Control, CAPA, Lamination QC &
  Production, QC Inspection Records, Compliance); the calendar, company holidays and the working
  calendar; reports and trends; master data; and filling in, submitting, verifying, finding and
  explaining those records. Greetings, thanks and "what can you do?" are answered warmly in a line.
- **Out of scope, declined:** general knowledge, news, sport, weather, maths, jokes, poems or any
  creative writing, recipes, programming, medical / legal / financial advice, other companies'
  products. The decline is one friendly sentence plus one example of what the assistant *can* do; it
  never answers the question partially, as a preface or as an example, never navigates for it, and
  holds even if the user insists or tells it to ignore the instruction.
- **Two layers.** The model's system prompt carries the rule for everything (it is what catches the
  general run of off-topic messages). A deliberately tiny client-side list handles phrasings that
  could not conceivably be about the plant's work (jokes, "write me a poem…", weather today, sport,
  "capital of", pure arithmetic) — instant, no network call, no tokens. Ambiguous words that also
  belong to the work — "treatment", "recipe", "translate" (F/QC/13 is Gujarati), "weather" on its own
  — are deliberately left to the model, because wrongly refusing real work is worse than spending one
  call to decline a general question.
- Verified both ways: locally (`tests/e2e_smoke.py`, network-independent — a joke request and a
  "write me a poem about rodents" are declined, and the very next in-scope question is still answered,
  proving no over-blocking) and against the real model (`tests/e2e_assistant_chat.py` — "explain how
  photosynthesis works" comes back as *"I'm here to help with the plant's record-keeping system — e.g.
  I can open the CAPA screen or navigate to the pest-control daily register"*, with none of the
  answer's giveaway words).

## 24. Two languages (English / ગુજરાતી) and a voice assistant (09-Sep-2026)

```
DIGITAL TEMPLATE     src/i18n/strings.ts (the two string tables), src/i18n/index.ts (t / useT),
                      src/components/common/LanguageSwitcher.tsx, src/utils/speech.ts
DATABASE FIELDS      AppSettings.language ("en" | "gu"), AppSettings.speakReplies (boolean)
```

The plant is in Mehsana and the shop floor works in Gujarati, so the department asked for the whole
application in either language, chosen in the top bar, plus an assistant that can be spoken to.

- **Language.** Picked in the top bar, so it is in the same place on every screen (the Dashboard's
  own copy of the buttons was removed 12-Sep-2026 at the department's request); the entire interface
  changes at once — navigation, page titles, buttons, statuses, frequencies, module names, report
  tabs, the calendar and Day View, the Pest Control pages, and the assistant's own wording, briefing
  and canned replies. Remembered per browser. Asking the assistant something in Gujarati gets a
  Gujarati answer (the backend is told the language; routes, field names and stored values stay as
  the app defines them).
- **What is NOT translated, deliberately.** The controlled documents' own text: format numbers
  (F/HR/17, F/QC/13, F/MKT/05 …), the printed instruction lines and the ten check points transcribed
  verbatim from the paper form, the licence and its terms and conditions, the Statements of
  Compliance, and employee / area / holiday names held as master data. Translating a controlled
  record's wording would break the source-to-digital traceability this whole document exists to
  record — the digital record must read as the same document the auditor holds on paper. The Gujarati
  F/QC/13 in-process sheet (§18) stays in Gujarati in both languages, for the same reason. The smoke
  suite asserts this: with Gujarati selected, "F/HR/17" and "Total number of rodent traps provided"
  are still on screen.
- **Voice.** Press-to-talk on the Assistant page and in the floating widget: the browser's own Web
  Speech API turns speech into text, which then takes exactly the same path as a typed message (no
  extra service, nothing else sent). A question asked aloud is answered aloud; a speaker toggle
  extends that to typed questions. Recognition and playback follow the chosen language (`en-IN` /
  `gu-IN`). Chrome and Edge support recognition; Firefox does not, and the button explains that
  rather than failing. The microphone is never left listening — one utterance per press, and it is
  released when the page is left.
- **It waits for the speaker to finish** (requested 09-Sep-2026: *"once user start speaking then user
  will complete it then only it should run"*). The browser's default is to end the utterance at the
  first pause, which cuts an operator off mid-thought. Instead the recogniser runs continuously, the
  words appear in the composer as they are spoken, and the question is only sent after 2.5 s of actual
  silence — a pause to think sends nothing. Pressing the button again ("Done") sends what has been said
  so far rather than discarding it; leaving the page discards it. `tests/e2e_voice.py` proves this by
  driving a fake recogniser: speak a fragment, pause 1.2 s (nothing sent), speak the rest, go quiet —
  exactly one message, containing both halves.
- **TO BE CONFIRMED:** whether the plant wants the ten F/HR/17 check points shown with a Gujarati
  reading aid *beside* the controlled English wording (not replacing it) for operators who fill the
  register — deliberately not added unilaterally, since it puts new text next to controlled content.
- **Gujarati through Google Translate (11-Sep-2026).** The department found the hand-written
  translation left too much of the site in English and asked: *"when user will click on Gujarati
  language then google translate will automatically detect english language and change it to
  gujarati on whole website and same applies for switching back to english."* Now:
  - Choosing ગુજરાતી loads Google's website translator (`src/i18n/googleTranslate.ts`) and selects
    Gujarati in it automatically; the screens are written in English for it and the whole site turns
    Gujarati — every page, list, message, the assistant's chat — including text that appears or
    changes later. Google's toolbar and hover pop-ups are hidden; the page is never pushed down.
  - Choosing English clears Google's `googtrans` cookie and reloads the page on the same screen —
    the only way to get Google's rewritten text back to the original exactly. Nothing is lost:
    records save themselves and flush on unload. With English chosen Google is never loaded.
  - The choice is remembered: a reload in Gujarati translates again.
  - No internet / Google blocked → the built-in Gujarati tables (§ above) are used, and a word beside
    the language box says so ("Built-in Gujarati", with the whole sentence as its tooltip). So the
    choice always does something.
  - Still never translated (marked `translate="no"`, so not sent to Google either): every record form
    and register, document headers, the SOP, licence and SOC text, record history values, people's
    names (the top bar, "submitted / verified / rejected by", the files and Day View columns) and
    master-data rows. Google converts numbers and dates *outside* those areas to Gujarati digits
    (૧૦, ૦૧-સપ્ટેમ્બર-૨૦૨૬) — the forms keep the figures exactly as recorded.
  - Google rewrites text behind React's back, which normally crashes React apps or leaves stale
    text. `src/i18n/translateGuard.ts` (installed only while Google is in use) keeps them in step —
    removals and inserts find Google's stand-in, and changed text is shown as a fresh node so Google
    translates the new value. Google translates text lazily as it scrolls into view.
  - Spoken replies: a reply with no Gujarati letters is read with the English voice even in Gujarati
    (`src/utils/speech.ts`), since the app's own replies are written in English for Google.

## 25. Records that read like a real plant's (09-Sep-2026)

```
DIGITAL TEMPLATE     tools/plant_pattern.py (the model and its calibration) ->
                      src/data/seed/plantPattern.ts (generated), applied by
                      src/engine/plantSimulation.ts; consumed by src/engine/autoFill.ts
                      (Live pre-fill) and src/data/demoGenerator.ts (Demo Mode)
SOURCE               The company's own filled specimens (F-QC-30, F-QC-32, F-QC-40.C, the
                      lamination sheets of 07-09-26) and its GAP Analysis Report of Dec-2023
```

**The problem.** Every generated record was, by construction, perfect. `readingInBand()` clamped
every reading inside the printed band, so the Lamination QC report's "Out-of-band" column read zero
for every day the system would ever hold. `lotStatus` defaulted to "Accepted" on all three
inspection formats and was never anything else. The F/QC/13 grades were frozen at the specimen's
B, A, A, –, A, B, so no C and no F ever appeared, though the form's own printed rule explains what
to do when they do. All ten F/HR/17 check points were answered the clean way every day. Every demo
record was submitted at 10:00 and verified at 15:00 the same afternoon, with one rejection reason
in the whole system. Training attendance was 100%, every year. And a demo year contained no CAPA
activity at all, because no generator could produce a finding.

Individually each was defensible; together they produced a year of records that an auditor would
disbelieve on sight — the exceptions, and what was done about each, are the first thing they look
for, and a register with none is a register nobody is filling in.

**The model.** `tools/plant_pattern.py` states how the plant actually behaves and writes it as one
generated seed module. Every rate and every line of wording is measured or quoted, not invented:

- **Readings drift in episodes, not spikes.** The F-QC-30 specimen's four highest readings
  (20.96, 21.00, 20.89 and the out-of-band 21.08) are *consecutive*, 11:00 to 14:00 — a process
  drifting for a few hours and then being brought back. So the model is quiet noise (sd 0.30
  against the specimen's whole-day sd of 0.553) plus a drift episode on about one day in five,
  2–5 readings long, which usually takes one or two of them out of band. The hot room and the
  mixing station, whose specimens never breached, get episodes of 7% and 5% of days.
- **An excursion always carries its explanation.** Where the printed form has a Remark column
  (F-QC-32), the operator's wording goes in it — "Viscosity high — ethyl acetate added and
  re-circulated; re-checked after 15 min." Where the form has none (F-QC-30 has no remark column
  and it is a controlled format, so none was added), the flag goes in the assistant's notes.
- **Check-point findings are the plant's own.** The wording for check points 1, 2, 3, 5 and 6
  is taken from the Dec-2023 GAP Analysis Report (check point 10 is not modelled — see §26): the utility-area opening, the fly killer machine
  found switched off, the missing RBS numbering, material stacked against the wall, the torn PVC
  strip curtain. About 1.7 a month, each with its Summary of Actions row, as the form asks.
- **Lots are dispositioned.** 93% Accepted, 4.5% Accepted on Deviation, 1.8% Segregation, 0.7%
  Reject / Scrap, each with a reason written in that format's own vocabulary — and a pass/fail
  observation flips to FAIL only when the lot was actually held for that reason, so the two can
  never contradict.
- **Jobs rotate.** The lamination sheets carry the jobs that ran that day, with PO numbers climbing
  with the calendar, instead of the same four jobs and the same five PO numbers for ever.
- **Work gets signed off like work.** Submission lags 0–2 days, verification 0–8, about 4% of
  records sent back with a reason a verifier would actually give ("Out-of-band reading not
  explained in the Remark column"), and ~3% started and never finished.
- **A finding becomes a corrective action.** In Demo Mode the month's observations — from the daily
  register and from the contractor's fortnightly visits — are carried into that month's internal
  CAPA record with target dates, actual closure dates, and Closed / Overdue statuses. This is the
  chain an auditor follows, and it did not exist before.

**Determinism is what makes it auditable.** Every value comes from a seeded PRNG whose seed names
what it decides (`reading|qc-viscosity|viscosity|2026-08-14|11`), on independent streams per
concern. The same date reads the same way on every device and after every regeneration — an auditor
who comes back to 14-Aug finds the same 21.4 Sec. reading and the same remark. The demo generator
previously used `Math.random()`, so two browsers disagreed and regenerating rewrote history;
`tests/e2e_realism.py` now proves a second browser reproduces a day exactly.

**Reconciled while doing this:** the rodent catch pattern was generating ~11 catch days a year
while the company's own Rodent Catch Report — printed in the same table for comparison — reports
0 in 2024, 2 in 2025 and 0 through Jun-2026. Lowered to 5 catch days a year
(`TARGET_CATCH_DAYS_PER_YEAR`, tools/pest_pattern.py), so the digital column no longer argues with
the document beside it.

**What the model does NOT do:** it never signs, submits or verifies; it never ticks an attendance;
it never fabricates a CAPA finding in Live mode. Demo records remain `isDemo: true` and are
watermarked "DEMO / SYNTHETIC DATA — NOT AUDIT EVIDENCE" on every screen.

## 26. Fly Catcher register (F/HR/18) and the Rodent Catch Report, in the company's own formats (11-Sep-2026)

```
SOURCE DOCUMENT      "Fly catcher reports .pdf" (F/HR/18 Rev 02, 15.12.2024, August-26, 2 pages) and
                      "trend analysis .pdf" (Rodent Catch Report and Trend Analysis) — received
                      11-Sep-2026; the same pages as "Kapila mam department reports .pdf" pp. 5-6 and 1
DIGITAL TEMPLATE     src/components/records/FlyCatcherRegisterSheet.tsx,
                      src/components/reports/CatchTrendSheet.tsx; data from
                      data/selectors.ts rodentTrendRows / flyTrendRows
SHOWN ON             Pest Control > Trend Analysis > Fly Catcher Infestation (register is the default
                      view) and > Rodent Catch Trend; Reports > Rodent Catch Trend / Fly Catcher
                      Infestation; and beside the services — Fly Control and Rat / Mice service pages
```

**F/HR/18, as printed.** Both pages carry the header (company as *this* form spells it —
"GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", two words — then "FORTNIGHTLY – FLY CATCHER
INSPECTION & CLEANING RECORD", Format No. F/HR/18, Rev No. 02, Date 15.12.2024, Page 1 of 2 / 2 of
2), the Month & Year box, and the location legend in the printed two-column order (PC-01..04 beside
PC-05..08, then 09/10, 11/12, 13 — PC-10 printed as plain "Warehouse office wall", with no floor).
Page 1 holds PC-01 to PC-08, page 2 PC-09 to PC-13, one line per unit per fortnightly visit under
the form's seven headings. Cells are written the way the specimen writes them: dates d/mm/yy
("3/08/26"), counts in two digits ("01"), tube-light dates on a unit's first line and a ditto mark
(") below while unchanged. Each visit is still its own record (the 13 units' counts for that date);
the register is a view over them, so nothing is stored twice and a line opens its visit.

**Rodent Catch Report and Trend Analysis, as printed.** A two-line header box (company, title — this
report has no Format No. row, so none was added), one row per year — Source "Trapped on Glue boards
in Roda-boxes" | Unit "Number" | Target Pest "Rodents" | YEAR | JAN–DEC | Total — and beneath it the
bar chart of one year, JAN–DEC plus Total, y axis "Number or Quantity Trapped" (0–5 in halves, as
printed, widening only when the numbers need it), x axis "Months". The Fly Catcher Infestation trend
uses the same layout ("FLY CATCH REPORT AND TREND ANALYSIS", Target Pest "Flies"), because that is the
format the department already reads trends in; the sheet says so in its screen-only key.

**How each figure is filled — from exactly one place.** For rodents, a month is added up from the
Daily Pest Control Monitoring Records (check point 7's catch details) when the digital register holds
that month's days; otherwise it is the company's own paper figure (2024, 2025, Jan–Jun 2026,
transcribed verbatim); otherwise blank — including every month that hasn't happened yet, exactly as
the paper leaves Jul–Dec 2026 empty. Never both, so nothing is counted twice. In Live mode the
register starts at go-live, so the paper figures stand for everything before it. On screen only, the
cells the system added up are tinted, with a key, so an auditor can always tell a computed figure
from a transcribed one; the tint does not print. Flies have no paper history, so every fly figure is
added up from the F/HR/18 visits.

**A correction this required.** The specimen shows all thirteen tube lights installed and due on the
same two dates — the tubes are changed together. §25's first cut had staggered the dates across the
year on the assumption that thirteen identical dates was a data-entry artefact; the company's
register shows it is simply how they do it. Restored here as a single annual cycle, and then
corrected again on 13-Sep-2026 to the two fixed dates the department gave — 24-11-2025 and
23-11-2026, computed from nothing (§44). Cleaning by Vijay / verification by Roshni on every line as
on the specimen (an invented second cleaner was removed). For the same reason check point 10
on F/HR/17 ("tube lights having validity of usage?") is no longer generated as a finding — a tube past
its validity mid-year would contradict the register printed beside it; a tube that simply fails is
check point 3.

**Also fixed:** the rodent report's "recorded days" counted the blank shells for days still to come
(a fresh install read "from 18 recorded days" with nothing recorded); only days actually filled in
count now.

**Filled in by Month & Year, where it stands (11-Sep-2026).** On the department's request ("in Fly
catcher infestation make sure keep add edit option according to month and Year"), the register for the
Month & Year chosen above it — on Fly Catcher Infestation and on the Fly Control service page — carries
**Add visit**, **Edit register** and **Print register**. Add visit puts a visit on that month's register
for the date it was carried out (`engine/flyRegister.ts`): a date outside the month, a date still to
come, or a second visit on one date is refused with the reason; a visit added on the day a scheduled one
is due takes the schedule's key, so the generator never makes a second; the tube-light dates and the two
names are carried forward from the visit before it, as the paper dittoes them, and the counts are left
to be entered. It is a person's draft ("In Progress", never prepared), so the assistant never fills it
and the start-up clean-ups leave it where it is. Edit register turns every draft visit's cells into
inputs, saved a moment after the last keystroke through the visit's own `saveDraft` — each change in
that visit's history; a submitted or verified visit stays locked (grey) and is corrected from its own
page, with a reason. Printing while editing prints the paper form, not the input boxes.

## 27. Correcting records — by hand or through the assistant (11-Sep-2026)

```
DIGITAL TEMPLATE     engine/recordLifecycle.ts (reopenForCorrection), engine/recordHistory.ts
                      (the change history), engine/recordPatch.ts (checking every change, and
                      plain-words edits), components/records/RecordHistoryPanel.tsx,
                      RecordActionBar.tsx; the four record pages; DocumentAssistant.tsx;
                      backend/assistant.ts (itemEdits, patch-shape checks)
DATABASE FIELDS      RecordInstance.history (append-only), RecordInstance.correction
```

**The requirement:** any wrong data on any document can be put right — by the user directly, or by
telling the assistant — and the system must be easy enough that nobody can get it wrong.

**What was wrong before.** A verified record could never be changed at all; a submitted one only by
rejecting and resubmitting it, which also erased the rejection. Draft edits on the main record page
were lost by leaving without pressing Save. The service report's verifier could not type the
customer's countersignature that Verify requires. Material and method on a service report, several
CAPA finding fields and new Master Data rows could not be corrected at all. The assistant could only
touch drafts, merged whatever the model returned without checking it (so "OK" could land in a Yes/No
check point and silently defeat every rule testing for "Yes"), gave no list of what it changed and no
undo — and on the complaint checklist it could change a *verified* record with no trace.

**How it works now.**

- **Drafts save themselves** (0.7 s after the last change, and on leaving the page). Save is still
  there as "Save now" while a change is pending.
- **Signed-off records are corrected, not edited.** Submitted / Pending Verification / Verified records
  are locked and offer *Correct this record*. It asks for a reason (four one-tap reasons — wrong value,
  typing mistake, information received late, something left out — or any typed one), reopens the
  record to In Progress with a banner saying who reopened it, when, from what state and why, and the
  record then has to be submitted and verified again. Rejected records keep *Resume editing*.
- **Nothing is overwritten without a trace.** Every record carries an append-only history: each edit
  as field-by-field before → after (readable labels: "Row 3 (11:00) · Viscosity", "Check point 7"),
  and every submit, verify, reject, resume and correction, with who and when. Quick successive edits
  by one person fold into one entry; a field changed and changed back drops out. Records created before
  this existed show a history reconstructed from their sign-off stamps, marked as such.
- **The assistant can make any correction.** It is registered on every record page whatever the
  status. Every proposed change passes `applyAssistantPatch` first: unknown fields are left out, values
  are normalised to what the form stores (Yes/No, numbers, 24-hour times, ISO dates, the exact select
  option) or refused with the reason, printed columns and fixed rows can't be changed, and a change to
  one row must name exactly one row. It is then saved at once, listed back field by field, logged as
  the assistant's change, and can be undone. On a signed-off record it shows the change and asks
  *"Go ahead?"* before reopening — nothing changes until the user says yes, and their own words become
  the recorded reason.
- **Common changes need no network.** `parseLocalEdit` understands plain sentences — a reading at a
  time of day, a check point, a PC unit's count, a service area's remark, a finding's target date, a
  header field by its printed label, "X attended" — so the most frequent corrections are instant and
  work even when the AI service is unreachable. Anything else goes to the model, which now changes
  single rows with `itemEdits` instead of sending back whole tables (the 8,000-token-a-minute limit),
  and whose reply the server shape-checks before the app ever sees it.
- **Smaller fixes that were traps:** the service report's customer countersignature stays writable
  while the report awaits verification; material and method were made editable (superseded the same
  day: they are fixed per area again and the quantity is entered once per material — see §5); CAPA findings expose
  address, contractor's action, source and the service provider's verification; the complaint, CAPA
  and training pages no longer show a Save button that is always disabled ("All changes saved"
  instead); errors scroll into view and say whether they block submitting or verifying; *Fill again*
  asks before replacing the form; Master Data chemicals, fly catcher locations and rodent stations
  are editable in place, deletes take two taps, and a new PC ID can no longer reuse a deleted one's
  number.

**Deliberately not editable:** the service provider's licence (the owner's instruction: "not a single
change") and a fly catcher's PC ID, which every fly catcher record refers to (its location and floor are
editable). *Changed later on 11-Sep-2026*, on the department's instruction that every document can be
corrected wherever the assistant or a person got it wrong: the Statements of Compliance and the
Chemical Master chart are now editable in place — Edit / Save / Cancel on the page, the transcription kept
as the source with "Restore the original", and who edited it and when shown beside it
(`src/data/repositories/referenceRepository.ts`; the chart's rows are saved to master data). On records,
"Correct this record" is now labelled **Edit** (a rejected record's "Resume Editing" too), with "The
assistant filled it in wrong" as the first reason offered; the service report's Chemical Master
suggestion box was removed.

### Cancel edit (12-Sep-2026)

The department asked for the way out of an Edit nobody needed: *"in training record make sure give
cancel option so if user click on edit button and not edit anything in document so it will be click
on cancel button there and this applies to all document of all modules."* Every document that can be
reopened now offers **Cancel edit** — beside Submit, and in the banner at the top of the record —
while the correction is open:

- It puts the record back at the status it was reopened from (Verified stays Verified), so a record
  nobody actually changed doesn't have to go through Submit and verification again.
- It also puts back **what the record said**: `reopenForCorrection` keeps a copy of the data at the
  moment Edit reopened it (`CorrectionInfo.dataBefore`), which Submit and Cancel both clear.
- Nothing had changed → it just goes back. Something had → it says how many changes and asks first
  ("Put it back" / "Keep editing").
- The cancellation is written into the record's history (`correction-cancelled`, with whatever it put
  back), because the reopening is in there too and the trail has to make sense to an auditor.
- It is in the shared record components (`components/records/RecordActionBar.tsx` and the correction
  banner in `RecordHistoryPanel.tsx`), so every record kind in every module has it — the record page's
  documents, Training records and the CAPA complaint checklist alike. The reference documents (the
  Chemical Master, Statements of Compliance) already had Cancel on their own edit bar, and Master Data
  rows are edited in place with no Edit step to cancel.

## 28. Document Files — any span, opened like a file system (11-Sep-2026)

```
DIGITAL TEMPLATE     src/pages/FileBrowserPage.tsx (#/files/{scope}/{from}/{to}, sidebar
                      "Document Files"), src/engine/fileScope.ts; opened by the assistant through
                      listDocumentsAnswer() → LocalAnswer.navigate (src/engine/assistantLocal.ts)
```

The department's request: "if user search in chat bot like for example i want all document of pest
control module from any date to any date or any month to month then it will open like that only, not
whole calendar of that particular month — like file system."

- **What opens**: the Document Files view for exactly the span asked for — a folder per module, a
  folder per document inside it, a folder per month, one dated file per record (status, who
  submitted/verified). Nothing dated outside the span is shown, and no other module's documents.
- **Spans understood**: day to day ("from 3 June to 17 July", "1 to 19 January", ISO or dd-mm-yyyy
  dates), month to month ("June to August" = 1 June – 31 August; "Nov 2025 to Feb 2026";
  "November to February" with no year runs into the next year), a single month, this/last/next
  week or month, and a single day. Month words are matched as whole words, so "marked" is not March
  and "may I" is not May.
- **Scope**: a named document, a named module (all of its documents), or "all documents / records /
  files" for every module. "All reports of August" still goes to the monthly Reports page.
- **In the view**: the folder tree narrows the list (breadcrumb shows where you are), From/To and
  the folder picker change the span (the address follows, so it can be bookmarked), This month /
  Last month / This year shortcuts, CSV export and print. A file opens its record, where it can be
  read or corrected (§27). A year of records paints only the first month's files until the other
  month folders are opened.
- **Safety**: a view covers at most 36 months; a broken address falls back to this month; Live
  records are never created before the system went live (§ launch-date floor), so browsing old
  months never invents a backlog.

## 29. Printing prints the document (11-Sep-2026)

On the department's instruction ("when user take print then it will only print document not whole
page of that open site"), every printout is the document alone. Each screen marks its document with
`data-print-doc` — a record's form (every kind), the F/HR/17 and F/HR/18 registers, the Rodent / Fly
catch report sheets, the open Reports tab, the licence's scanned pages, a Statement of Compliance, the
the Chemical Master and the Document Files list. A Print button, or the browser's own Print /
Ctrl+P, then leaves everything else off the paper (`src/utils/print.ts`): page titles and
explanations, stat tiles, banners (the assistant's, a correction, a rejection), tabs and filters, the
record history, the buttons, the sidebar and the assistant. Screen-only hints inside a form (the
Chemical Master suggestion, "Specimen source", the working-calendar note, the approval hint) are
marked `no-print`. A register being edited prints as the paper form, and a demo printout keeps its
"DEMO / SYNTHETIC DATA — NOT AUDIT EVIDENCE" band, printed in colour. The SOP and the Chemical Master
gained Print buttons of their own. A screen with no document on it prints as it always did.

## 30. CAPA — Internal: Complaint Acknowledgement Report, QA-CAF-00 (11-Sep-2026)

```
SOURCE DOCUMENT      "Foram P. - FGSL3877.pdf" — a filled report (Krishna Packaging, FGSL 3877,
                      10.07.2026), supplied as the FORMAT reference only: its complaint is not
                      loaded as data
DOCUMENT STRUCTURE   Page 1: logo, "Complaint Acknowledgement Report", Date, To (name and
                      designation), Subject, the intro line, a table — Customer Name | FG code |
                      Complaint received on | Job name | Com. Type | Comp. sub type — Scenario,
                      photographs, Root Cause. Page 2: Corrective Action, Preventive Action, the
                      Acknowledgement statement, Employee Signature line, Name, Date. Footer on both
                      pages "QA-CAF-00 (22.03.26)" and the page number
DIGITAL TEMPLATE     kind: "complaint-ack" — src/components/records/ComplaintAckRecordView.tsx, on
                      the shared RecordPage (autosave, Submit / Verify / Edit, history, print)
DATABASE FIELDS      ComplaintAckData (types/record.ts): reportDate, toName, toDesignation, subject,
                      intro, customerName, fgCode, complaintReceivedOn, jobName, complaintType,
                      complaintSubType, scenario, photos[] {id, name, dataUrl}, rootCause,
                      correctiveAction, preventiveAction, acknowledgement, employeeName,
                      employeeSignDate
WORKFLOW             As Required — started from CAPA → Internal → New Complaint Acknowledgement
```

- The form's own wording (subject, intro line, acknowledgement statement) is filled in verbatim on a
  new report (`src/data/seed/complaintAck.ts`) and, like every other value, can be edited on it.
- Com. Type and Comp. sub type are free text with suggestions: the specimen's "Process related" /
  "Deviation from specification", then whatever earlier reports used — no list was invented.
- Photographs are uploaded from the computer or phone, up to four per report, each scaled down to at
  most 1024 px and saved as a JPEG inside the record (`src/utils/image.ts`) — operational data still
  lives in the browser's storage (DEPLOYMENT.md → Capacity), so size is kept small.
- Submit needs the complaint details, the scenario, root cause, both actions and the employee's name;
  once submitted or verified the report is locked and **Edit** reopens it, as on every record.
- On screen a draft shows input boxes; the printout and a locked report show each value as plain text
  (dates as dd.mm.yyyy, as on the form), so nothing is cut off, over two pages.
- **TO BE CONFIRMED:** the revision number (the footer gives "QA-CAF-00 (22.03.26)" only) and the
  company logo artwork (drawn as the name in the red box, not the scanned emblem).

## 31. Responsibilities of Pest Control — Site & Service Provider (11-Sep-2026)

```
SOURCE DOCUMENT      "responsibilities of pest control report .pdf" — three pages on the company's
                      letterhead, signed 01.01.2025 by Chirag Parmar (Manager, Purchase) for Gujarat
                      Print Pack Publications and Rohit Patel (Owner) for Gurudev Pest Control Services
DOCUMENT STRUCTURE   Page 1: Responsibilities of Site — fourteen numbered points. Page 2:
                      Responsibilities of Pest control service provider — Equipment & Storage
                      Specifications (four points), the Emergency call procedures table (Service
                      related issues / Critical Hazards issues, with name and number), the yearly
                      awareness training note, and the Environmental, Health & Safety Clauses a) to
                      g). Page 3: the further clauses h. to l. and the two signatories (organisation,
                      Name, Designation, Department, Dated, Sign & Stamp)
DIGITAL TEMPLATE     kind: "pest-responsibilities" —
                      src/components/records/PestResponsibilitiesRecordView.tsx on the shared
                      RecordPage; the wording in src/data/seed/pestResponsibilities.ts
DATABASE FIELDS      PestResponsibilitiesData: siteResponsibilities[], equipmentStorage[],
                      emergencyCalls[] { issue, name, phone }, trainingNote, ehsClauses[],
                      serviceClauses[], client and provider { organisation, name, designation,
                      department, dated }
WORKFLOW             As Required — Pest Control > Training & Reference > Responsibilities (Site &
                      Provider). The signed 01-Jan-2025 copy is seeded as a verified record
```

- Transcribed verbatim, including the **blank "Critical Hazards issues" contact**, which is empty on
  the paper. Nothing here is generated: the assistant never pre-fills this document.
- Every line can be corrected — by hand or by asking the assistant — and a point can be added or
  removed; the signed copy is corrected through **Edit**, like any record, so what it said before
  stays in its history.
- **TO BE CONFIRMED:** its format and revision number (none is printed on the pages), and the
  certification logos in the page footer (not reproduced).

## 32. The codes on CAPA paperwork, and a CAPA summary on request (12-Sep-2026)

```
REQUESTED            "in CAPA report complain number is like 26-27/001 so in this 26-27 is year and 001
                      is complain number which is can be change so whenever user open then it should
                      according to year format and complain number which can be change and what every
                      document you open or user tell you to edit it then it should be according to
                      decided format only same applies to FG Code also … PO number should also of 8
                      digit and Same applies for JOB Code also it also Like start with FG only with
                      that user will also want CAPA Summaries for both"
DIGITAL TEMPLATE     src/engine/documentFormats.ts (the one place the formats live);
                      src/components/records/FormField.tsx (tidy on blur + the format message);
                      src/engine/validation.ts (the check at Submit); src/engine/recordPatch.ts and
                      src/engine/guidedChecklist.ts (the assistant held to the same formats);
                      src/engine/assistantLocal.ts (the summary)
DATABASE FIELDS      ComplaintChecklistData.complaintNo / jobCode / poNo, ComplaintAckData.fgCode —
                      unchanged in shape; what changed is how they are written and checked
```

- **Complaint No. — `26-27/001`.** The two calendar years, then a three-digit count. The year part
  changes on **1 January** (the department's answer, 12-Sep-2026), and the count starts again at 001.
  A new complaint is numbered by the app the moment it is opened — the next free number for this year
  — and stays editable: typing `7` over it gives `26-27/007`, `26/27/7` gives `26-27/007`.
- **FG code / Job Code — `FGSL3877`.** FG, two letters for the job type (SL, PO, LA …), then four
  digits: eight characters in all (confirmed by the department against the source report
  "Foram P. - FGSL3877.pdf"). **PO No. — eight digits**, `10004321`.
- **One rule, three places.** Everything reads the formats from `engine/documentFormats.ts`, so a
  person typing, the assistant filling in, and the check that runs at Submit can never disagree: the
  field tidies what was typed when you leave it (`fgsl 3877` → `FGSL3877`), says what the format is
  underneath while it doesn't fit, and Submit is refused until it does.
- **The assistant is held to the same formats** — both ways it can write one: a plain-words edit
  (`engine/recordPatch.ts`) and the guided complaint walk-through (`engine/guidedChecklist.ts`) each
  tidy what they are told and refuse what doesn't fit, with the reason, rather than writing a wrong
  code onto a controlled record. The walk-through no longer asks for the complaint number (it is
  already on the sheet) and its questions now carry the format as an example.
- **Deliberately not applied to the lamination and QC log sheets.** Their FG / PO columns hold the
  short codes the company's own specimens use ("7204", "88825"), so enforcing the eight-character form
  there would block the plant's own records; an entry on those sheets is only checked if it is typed
  as an FG code (`softFgCodeProblem`).
- **CAPA summaries — in the assistant, when asked** (the department's choice: *"in bot when user will
  ask for it"*). "CAPA summary", "how many complaints are open", "where does internal CAPA stand" are
  answered from the records themselves, with no internet: **Internal** — reports, findings, open,
  overdue, closed/verified, the last inspection, the oldest overdue finding, acknowledgement reports
  signed off; **External** — complaints being worked on / awaiting approval / approved, checklist
  activities done, and the latest complaint's number and customer. Naming one side answers for that
  side only, with a chip straight into it.
- Covered by `tests/e2e_capa_formats.py` (18 checks).

## 33. Pest Control Service Agreement — asked for every two years (12-Sep-2026)

```
REQUESTED            "in service provider there should be pop up for every two year for service
                      provider agreement and in that keep upload option or the system will
                      automatically generate the same format or user can upload it so it can be more
                      easy for the user to use it"
SOURCE DOCUMENT      "Letter head.pdf" — the service provider's printed letterhead: the GPC mark, the
                      two mobile numbers, GURUDEV PEST CONTROL, "F/54 , Golden Square Complex, Nr.
                      Goodluck Party plot, Radhanapur Road, Mahesana-384002", info@gurudevpestcontrol.com
                      and www.Gurudevpestcontrol.com. The page carries no agreement text — only the
                      letterhead, which is the FORMAT the agreement is written on. Transcribed once, in
                      src/components/documents/ProviderLetterhead.tsx, and used by every document the
                      provider issues (see the training record below)
DOCUMENT STRUCTURE   The letterhead, the title, Agreement No., the two-year term, the provider's
                      insecticide licence, the two parties, then the clauses: 1. Scope of services,
                      2. Schedule and reporting, 3. Obligations of the parties, 4. Commercial terms,
                      5. General — and the two signatures (organisation, name, designation, dated,
                      sign & stamp)
DIGITAL TEMPLATE     kind: "service-agreement" —
                      src/components/records/ServiceAgreementRecordView.tsx on the shared RecordPage;
                      the format and the wording in src/data/seed/serviceAgreement.ts; the two-year
                      cycle and the reminder in src/engine/serviceAgreement.ts and
                      src/components/documents/ServiceAgreementReminder.tsx
DATABASE FIELDS      ServiceAgreementData: agreementNo, effectiveFrom, effectiveTo, client and
                      provider ({ organisation, addressLines, contactName, designation, phone,
                      email }), providerLicenceNo, scopeOfServices[], serviceSchedule[],
                      obligations[], commercialTerms[], generalTerms[], clientSignatory and
                      providerSignatory, scans[] ({ id, name, kind, dataUrl, addedAt }), origin
                      ("generated" | "uploaded"); AppSettings.agreementReminderSnoozedUntil
WORKFLOW             As Required — Pest Control > Service Provider (and Training & Reference >
                      Service Agreement). The term itself drives the two-year cycle
```

- **The pop-up.** The Service Provider page asks sixty days before the agreement's term ends
  (`SA_REMIND_BEFORE_DAYS`), keeps asking once it has run out, and asks from the start while there is
  none on file — which is the state the plant is in today, so nothing is seeded: **no agreement is
  invented to look complete**. "Remind me later" snoozes for a week and never switches the asking off.
  A card on the page says where the agreement stands whether or not the pop-up is showing.
- **Two ways out of it, both the user's choice.** *Draft it for me* writes the agreement on the
  provider's letterhead for the next two years. *Upload the signed agreement* takes the scan, the
  photographed pages or the PDF (images are scaled down as elsewhere; a PDF is held as it is, up to
  2.5 MB, because the whole system lives in about 5 MB of browser storage) and puts it on file as the
  agreement itself — shown above the typed format, the way the licence page shows the scan first.
- **What the drafted agreement contains, and where each line comes from.** The parties (the company's
  letterhead and the provider's), the provider's insecticide licence number (§ licence), the services
  and their frequencies **as the SOP writes them** — including the SOP's own "TO BE CONFIRMED"
  frequencies, unchanged — the monthly report by the 7th and the 6-monthly meetings (from the signed
  Responsibilities document, §31, cross-referenced rather than restated). **Nothing else is invented:**
  the charges, the payment terms, the GSTIN, the notice period and the indemnity are written
  TO BE CONFIRMED for the two parties to complete.
- **It is a record like any other**: every line editable by hand or by asking the assistant, submitted
  and verified by people, printed as the document alone, with its own history and Edit / Cancel edit.
  Submit requires the term, and either the signed copy on file or both signatories' names.
- **TO BE CONFIRMED:** the agreement's own format and revision number (the letterhead carries none),
  the GPC logo artwork (the mark is reproduced as lettering), and whether the plant wants the term to
  start on the day it is drafted or on a fixed anniversary.
- Covered by `tests/e2e_agreement_and_cancel.py` (37 checks, with the letterhead ones below).

### The training record is on the provider's letterhead too (12-Sep-2026)

The department asked for it directly: *"i want to make both document of training record to change
heading of document to same as i provided letter head"*. The Pest Control Training Record's heading is
now Gurudev Pest Control's printed letterhead instead of the plant's company line — which is what the
paper is: the training is run and certified by the service provider, and its trainer field already
said so. Both training records on file (the technician certification and the Dec-2025 awareness
programme) render through the same page, so both changed together.

- `DocumentHeader` takes an optional `letterhead` node that stands in for the company-name line; the
  form's own title and the Format No. / Rev No. / Date row are untouched beneath it, and it prints with
  the document.
- The letterhead is one component (`components/documents/ProviderLetterhead.tsx`), shared with the
  service agreement (§33), so the provider's details are transcribed in exactly one place.
- The GPC mark is reproduced as its lettering on the printed green badge; the artwork itself is
  **TO BE CONFIRMED**, as noted in §33.

## 34. CRUD on every document, and the assistant able to do all of it (12-Sep-2026)

```
REQUESTED            "make all documents this CRUD operation which is CREATE, READ, UPDATE DELETE ...
                      and whatever user can do manually that can do with ai assistant also and
                      whatever he want that should be can be made available for them whatever his
                      requirement even he can speak and work will be done"
DIGITAL TEMPLATE     src/engine/recordCrud.ts (create a record for any document; delete any record,
                      with the deletion recorded), src/engine/assistantCommands.ts (the same actions
                      asked for in words), src/components/records/RecordActionBar.tsx (Delete on every
                      status, with a reason where it matters), src/pages/DocumentLibraryPage.tsx
                      (New per document, and "Records deleted")
DATABASE FIELDS      dcrs:v1:deletions — DeletionEntry { recordId, documentId, documentName, dueDate,
                      status, isDemo, deletedBy, deletedAt, reason, historyEntries }, newest first,
                      the last 200 kept
```

- **Create.** `createRecordForDocument(doc, { dateISO, isDemo })` builds a record with the same
  starting data the generator would have given it, so a one-off sheet reads like a scheduled one. A
  record already covering that period is returned instead of a second one — two sheets for one day is
  precisely what a controlled register must not have. Reachable from the Document Library's **New**
  button and from the assistant ("create a new fly catcher record").
- **Read / Update** were already in place (§27) — every field editable, saved as typed, changed by the
  assistant, every change in the record's history.
- **Delete.** Any record can be removed now, at any status — the department asked for it plainly. The
  concern with deleting a *verified* record is that it is part of the audit trail, so rather than
  refuse: it is confirmed first, a signed-off record takes a **reason**, and the deletion itself is
  recorded and shown in Document Library → **Records deleted** (what it was, its status, who, when,
  why, and how many history entries it carried). A hole in the trail is now an explained hole.
- **The assistant has the whole surface.** `parseAssistantCommand` reads create / delete / submit /
  verify / cancel edit / print with no network call, and the record pages hand the assistant the very
  same functions their buttons call (`AssistantTarget.submit/verify/remove/cancelCorrection/print`),
  so there is nothing a person can do on a record that cannot be asked for. Destructive or signing
  steps always ask first. **Speech needs nothing extra**: voice input becomes text and takes this same
  path (§24), so "delete this record" spoken behaves exactly as typed.
- Covered by `tests/e2e_crud.py` (22 checks).

## 35. External CAPA — every section mandatory, and the assistant hands work back to be checked (12-Sep-2026)

```
REQUESTED            "in CAPA for specially external CAPA make section mandatory each after each
                      question ... tell user to review each and every time before user submit and if
                      ai has done any mistake so user can do edit it also"
DIGITAL TEMPLATE     src/engine/guidedChecklist.ts (the walk-through), src/engine/validation.ts (the
                      check at Submit), src/components/common/DocumentAssistant.tsx (the review line
                      and the review step before a submit)
```

- **Mandatory, activity by activity.** Every activity of every section (A to E) has to be answered —
  done, done on a date, or **not required** — before the next section starts. The walk-through no
  longer offers "Skip" on an activity or "Skip this section"; if an activity is passed over some other
  way, the section loops back to it before moving on, and approval is only reached when every section
  is complete. Nothing here forces WORK to be done: "Not required" is a real answer, and it is what the
  printed form's "(If required)" / "(If not received)" activities expect.
- **The same rule at Submit** (`validateForSubmit`): a checklist with anything blank is refused, and
  the message names the section and the activities still open (e.g. "Section B — INVESTIGATION is not
  finished: 3 activities still blank (B7, B10, B12)"). So the rule holds whether the checklist is
  filled in through the chat or straight on the form.
- **The assistant hands the work back.** Every change it saves ends with the same line — check it on
  the form before submitting; Undo, a correction, or Edit puts anything right — and asking it to submit
  produces a review step first ("look over the form … once it goes for verification, changing it means
  reopening it with a reason") with **"I've checked it — submit"** as the only way through. This is the
  department's standing instruction that the assistant may prepare, but a person confirms.
- An explicit instruction still works mid-walk-through ("submit this record", "print it", "delete
  this") — but only when the message *begins* with it, because an answer to a question can easily
  contain one of those words ("Gujarat Printpack" is not a print instruction).
- Covered by `tests/e2e_capa_formats.py` (9 further checks) and `tests/e2e_crud.py`.

## 36. The assistant fills a whole document — question by question, or with sample data (13-Sep-2026)

```
REQUESTED            "if user tell to perform any action like fill xyz document then bot will open that
                      document and ask questions like what to fill where … like an agent who perform
                      task on one click/query … fill fake data and generate external CAPA for me …
                      data which he fills should seem to be real not fake … applicable to each and
                      every document"
DIGITAL TEMPLATE     src/engine/guidedRecord.ts (the questions, per document), src/engine/sampleFill.ts
                      (the sample data, per document), src/engine/assistantCommands.ts (the two new
                      intents: fill / guide), src/engine/assistantHandoff.ts (a request that outlives
                      the navigation), src/components/common/DocumentAssistant.tsx and
                      src/pages/AssistantPage.tsx (the chat on both screens), backend/assistant.ts
                      (the model's matching rule)
DATABASE FIELDS      none new — every fill is an ordinary "assistant-edit" history entry on the record
                      (note "Q&A — <field>" per answer, or "Filled with sample data by the assistant,
                      on request — realistic, but made up")
```

- **Question by question.** "I want to fill the external CAPA", "help me fill this", "walk me through
  the daily record", "ask me question by question", "start assigning it". The document is opened —
  started if there isn't one for the day (`createRecordForDocument`) — and the assistant asks what to
  put where, one thing at a time, offering the likely answers as buttons: the ten check points, then the
  time and the checker on F/HR/17 (a Yes to check point 7 asks for the box, the place and the count; a
  flagged point asks for the action taken); each unit's catch on F/HR/18, then who cleaned and verified;
  the quantity per material, any remarks by area, the technician and the countersignature on a service
  report; the header fields, then the readings on a log sheet ("fill typical readings for me" is
  offered, or "11:00 20.4, 12:00 20.6" typed); the inspection details, then each finding with its
  comments, corrective action, target date and source, "another finding?", the general comments; the
  session, topics and attendance on a training record ("everyone" or names); every line of a complaint
  acknowledgement report; the two signatures on the Responsibilities document; the agreement number,
  term, the commercial terms the format leaves TO BE CONFIRMED and the two signatures on the service
  agreement. The customer complaint checklist keeps its A → E walk-through (§35).
- **Every answer is checked the way a typed value is** — dates day-first (and "in 7 days"), 24-hour
  times ("now"), numbers, Yes / No (with "OK" read by the check point's polarity), the exact select
  option, the code formats of §33 — and an answer that cannot be read is asked again rather than
  written wrong. Each is saved at once with an assistant history line; "skip" and "stop" work, so does
  an outright "submit this record" / "print it" (only when the message *begins* with it, as in §35),
  and at the end the record is handed back to be checked with Submit offered — never pressed.
- **Sample data.** "Fill it with sample data", "generate an external CAPA for me", "create a complaint
  checklist with dummy data", or just "fill it" on an open record with nothing else said. The whole
  form is filled with **realistic, made-up** values: the plant's own people, areas and units from Master
  Data, the customers and jobs on its own specimens plus plausible ones, codes in the department's
  formats, dates on or before today. A generated complaint checklist has every one of the 31 activities
  answered on a date from receipt to closure with a comment against each (the "(If required)" ones
  marked not required where the case didn't need them), prepared-by filled and approval left for the
  QA Head; an inspection report has three to five findings in the plant's own inspection wording, some
  already closed; an acknowledgement report a scenario, root cause and actions that belong together; the
  routine registers reuse the calibrated auto-fill (§"How the assistant pre-fills records"). **The chat
  says every time that it is sample data, to be checked**; the record itself is not stamped, because the
  department asked for it to read like a real one — the history line is the honest record of where it
  came from. It is a draft like any other assistant change: undoable, and never submitted by the
  assistant. Nothing that identifies a real outside company beyond what the source documents already
  carry is invented.
- **Said where nothing is open** — the library, the dashboard, the full-page Assistant — the document
  is started or found first and the request carried over to it once it opens
  (`queueAfterOpen` / `takeHandoff`); an ambiguous name ("a CAPA record" could be three documents) is
  asked about with the choices as buttons, never guessed; "complaint acknowledgement report" is the
  acknowledgement, not also the complaint checklist (the longer phrase wins).
- **The model has the matching rule** (`backend/assistant.ts`): it may invent values only when the
  message explicitly asks for sample / dummy / test data, must then fill everything blank and say it is
  sample data, and otherwise never invents — the app handles the plain phrasings itself, so the model
  sees only what those miss.
- **Two defects found on the way, fixed:** an as-required document (complaint, inspection report,
  acknowledgement) started from the library or by the assistant returned the same day's existing
  record instead of a new one (§34's one-sheet-per-period rule applied to documents it should never
  have), and the inspection findings report's page did not hand submit / verify / print / delete to the
  assistant (§34) — it does now, with the same deletion trail as every other record.
- Covered by `tests/e2e_assistant_fill.py` (51 checks), including every document that holds records
  filled with sample data and submitted.

## 37. External CAPA — one activity at a time, and nothing after it until it is answered (13-Sep-2026)

```
REQUESTED            "i want to make some questions mandatory for example in external CAPA section
                      wise make one by one mandetory so user fill that or tell bot than he can do
                      according if any question is incompleted then he will not able to answer to
                      other questions without completing that"
DIGITAL TEMPLATE     src/engine/guidedChecklist.ts (currentActivity / isItemOpen — the rule itself),
                      src/pages/CapaPage.tsx (the form locks the later rows, and gained the N/R
                      answer), src/engine/recordPatch.ts (keepChecklistOrder — the same rule for a
                      change the assistant proposes), src/styles.css (how a locked row reads)
DATABASE FIELDS      none new — the rule is derived from the data (an activity is answered when it is
                      done, marked not required, or carries a comment, exactly as at Submit, §35)
```

- **The checklist is always waiting on exactly one activity** — the first one still blank, reading
  A1 → E32 across the five sections in order. `currentActivity()` names it; `isItemOpen()` says whether
  a given activity may be answered right now: only that one, plus any activity **already** answered, so
  a mistake can always be put right. Clearing an answer makes the checklist wait on it again and closes
  everything after it.
- **On the form** the row being waited on is highlighted and labelled "Answer this one next"; every row
  after it is dimmed, its tick, date and comment all disabled, and hovering says which activity to
  answer first. Each later section carries a "Locked — finish Section B first" badge, and the progress
  card states the rule in words with the activity's own text. None of this prints: the paper form is
  unchanged.
- **"Not required" is answerable on the form now.** It is one of the three valid answers (the
  "(If required)" / "(If not received)" activities on the printed form expect it) and was previously
  only offered in the chat — which, with this rule, would have trapped anyone who reached an activity
  that genuinely does not apply. A small screen-only **N/R** button beside the tick sets it, writes
  "Not required" as the comment if nothing else is written, and the printed badge beside the activity is
  what appears on paper.
- **The assistant is held to the same order.** Its walk-through already asks in this order; and every
  change it proposes now passes `keepChecklistOrder()`, which puts back any activity that was answered
  while an earlier one is blank and says so ("This checklist is answered one activity at a time — A1 has
  to be answered first, so I left E31 as it was."). So asking it to jump ahead is refused with the
  reason rather than quietly writing an answer the person could not have written themselves. A change
  that fills **everything** — the sample-data fill of §36 — leaves nothing blank, so nothing is out of
  order and nothing is refused.
- **What counts as answered is unchanged** (§35): done, not required, or a comment — the same test
  Submit applies, so the form, the chat and the submit check cannot disagree. A comment is a real answer
  for an activity that is genuinely in progress ("waiting on the customer"), and the printed form has a
  Comments column for exactly that.
- **A signed-off checklist answers nothing more.** Keeping an answered activity open is what lets a
  mistake be corrected *while the sheet is a draft*; once it is submitted or approved every row is
  read-only again, as it always was. (Caught in review: the first version of the rule looked only at
  whether an activity was answered, which would have made a verified checklist writable again.)
- **Two defects this rule uncovered, both fixed:**
  - **The assistant had no working way to answer a checklist activity at all.** The model is told to
    "return the COMPLETE sections array when changing any item", but `applyAssistantPatch` matched the
    objects in a list by their `id` — and neither a section nor an activity has one. So every section
    was rebuilt from a blank template: the values echoed back unchanged were dropped and the printed
    text repeated verbatim came back as "isn't a field on this form". A list whose items carry no id is
    now matched by **position**, the way the printed form identifies them, which also repairs the same
    latent fault for a service report's area lines, the fly catcher's units and the emergency contacts
    (`engine/recordPatch.ts`, `normArray`).
  - The walk-through's own free-text path was never affected (it writes the data directly), which is why
    this had gone unnoticed: until §36 there was no other way to ask the assistant to fill a checklist.
- Covered by 21 further checks in `tests/e2e_capa_formats.py` — the form (what is open, what is locked,
  all three ways of answering refused on a locked row, the section badges, answering A1 opening only A2,
  A1 staying open, N/R and un-N/R, clearing an answer closing what followed) and the assistant (its
  reply stubbed with a whole-sections change, so both the applied in-order change and the refused
  leapfrog are checked without a network call) — two in `tests/e2e_smoke.py` (an approved checklist is
  read-only, and not merely "locked") and one in `tests/e2e_assistant_chat.py` (a real model call cannot
  answer a later activity).

## 38. Printing prints the whole document, and it reads like the real thing (13-Sep-2026)

```
REQUESTED            "when user click on print button then whole document should will be print and not
                      different section. So when user will download or take print of it then it seem to
                      be more real not fake"
DIGITAL TEMPLATE     src/pages/PestControlPages.tsx (three printed lists now carry the document's own
                      header block), src/pages/ReportsPage.tsx (a print-only heading on every report
                      tab), src/styles.css (the four print defects below)
```

- **A printed list is a document, so it now has a document's head.** Three screens printed a bare grid
  with no company name, no title and no Format No. - the Daily Report's status list, a service report's
  visit register and the fly catcher inspection list. Each is now wrapped as a sheet carrying the
  register's own `DocumentHeader` (company name, title, Format No. / Rev No., and the month or year it
  covers), and the "Open" button column is left off the paper. A report tab that brings no sheet of its
  own gets a print-only heading with the company name and the month, so a printed Chemical Usage or CAPA
  Status report says whose it is and what it covers.
- **Four CSS defects made even a complete document print wrong**, all in the print block of
  `src/styles.css`:
  - **Everything past the first page was being cut off.** `.doc-table` is a horizontal scroll container
    on screen, so a wide grid scrolls inside its card instead of stretching the page. A scroll container
    cannot paginate: a 31-row register printed its first page and the rest was simply clipped. Under
    print media those containers are now `overflow: visible`, `thead` repeats on every page as a
    `table-header-group`, and a row is never split (`tr { break-inside: avoid }`). This is the literal
    answer to "the whole document should print".
  - **The grey header bands printed blank.** The company's own grids band their heading row in #d9d9d9,
    and a browser drops a background unless asked; `print-color-adjust: exact` is now set for
    `.register-grid th`, `.register-summary-title`, `.doc-table th`, `.trend-table th` and `.badge`.
  - **Every tick box printed empty.** A blanket `input { border: none; background: transparent;
    -webkit-appearance: none }` was meant to make a filled field read like handwriting on paper, and it
    also erased the checkboxes that *are* the record. Checkboxes and radios are now excluded from that
    reset and print as a bordered box, colour-exact.
  - **A card refused to break.** `.card { break-inside: avoid }` is right for a stat tile and wrong for
    a month of records; only the small blocks that must not be split keep it, and
    `@page { size: A4; margin: 12mm }` gives the sheet a margin it never had.
- Covered by `tests/e2e_departments.py` (the header block and Format No. on the paper, nothing around
  it, and no table left as a scroll container under print media) on top of
  `tests/e2e_print_all_documents.py`, which still requires that only the document prints.

## 39. The trend graph is drawn from the data, not a picture of it (13-Sep-2026)

```
REQUESTED            "i have shared a image with you so it will automatically update according to year
                      and check whether the graph is proper according to data not static image which is
                      might be there right now"
DIGITAL TEMPLATE     src/components/reports/CatchTrendSheet.tsx, src/pages/PestControlPages.tsx
                      (YearSelect)
```

- **Checked, and it is already data-driven** - no image, no chart library. `CatchTrendChart` is an
  inline SVG built from the very row the table shows: thirteen bars (JAN..DEC and Total), each labelled
  with its own figure, a month with no figure drawing no bar at all, axes titled "Months" and "Number or
  Quantity Trapped". The table above it is one row per year, and every month comes from one place only -
  the digital register where it holds that month, otherwise the company's transcribed paper report,
  otherwise blank, including every month that has not happened yet (`rodentTrendRows` / `flyTrendRows`,
  `src/data/selectors.ts`). The screenshot the department sent is the app's own screen, and its tinted
  December-2025 cell is the proof: a tinted figure is one the system added up from the register itself.
- **Two real defects found while checking it, both fixed.** The year picker offered next year, which the
  trend reports drop (they keep years up to this one), so choosing it drew a chart of an entirely empty
  year captioned "the chart shows 2027": a year that has not happened is no longer offered. And when no
  row matched the year asked for, the sheet drew twelve nulls; it now falls back to the most recent year
  it has figures for, and the caption names the year it actually drew, so the bars and the caption can
  never disagree.
- The sheet carries `data-chart-year`, so a test can assert that the bars are the table's own figures
  for that year and that changing the year redraws them - which is what proves it is a chart of the data
  rather than a picture. Covered by `tests/e2e_departments.py`.

## 40. Departments, from the company's own master list of formats (13-Sep-2026)

```
REQUESTED            "i have shared a pdf with you so keep that in so now make departments in and assign
                      id's according that and if QC has those document like wise that only that
                      department will be able to see so do this also"
SOURCE               "F-SYS-02-Master List of Formats. (R-2025).xlsx" - MASTER LIST OF FORMATS &
                      RECORDS, F/SYS/02 (00/01.12.2021), 141 formats
DIGITAL TEMPLATE     src/data/seed/departments.ts (the ten departments and which owns which document),
                      src/engine/departmentScope.ts (the rule), the two repositories (where it is
                      applied), src/components/common/NotYourDepartment.tsx (the refusal),
                      src/components/master/DepartmentsAccess.tsx (Master Data > Departments & access),
                      backend/db.ts + backend/index.ts (the assignment, and who may change it)
DATABASE FIELDS      users.departments - comma-separated department codes, "" = every department; added
                      to an existing app.db by ALTER TABLE on start-up
```

- **The departments are the plant's own.** Every format number on the master list carries its department
  in the middle segment, so the list is already written down: SYS (System / Management), MKT, PUR, STR,
  QC, QA, PRD, MNT, HR and DISP, each with the `F-...` prefix it owns. All ten are configured, not only
  the six that own a document today - a Store or Maintenance user is told nothing has been digitised for
  them yet rather than left out of the system.
- **Which department owns which document follows the format number**, and is listed in one auditable
  place (`DOCUMENT_DEPARTMENTS`). QC gets the nine F-QC formats (the three lamination QC registers, the
  four inspection records, F/QC/13 and the two Statements of Compliance); Production the two F-PRD
  registers; Marketing F/MKT/05 and the Complaint Acknowledgement form (F-MKT-06 on the list); HR the
  ten documents of the pest control file, because that is where the list files them (F-HR-17 and F-HR-18
  sit beside the cleaning records F-HR-15/16); QA the internal inspection findings report; Purchase the
  service agreement. The nine whose format number is still TO BE CONFIRMED are assigned to the
  department that owns the process, each with its reason in the file and each flagged TBC for the MR to
  confirm.
- **A person sees their own department's documents and nothing else.** The rule lives in
  `engine/departmentScope.ts` and is applied in exactly two places - `documentRepository`'s
  `getAll` / `getById` / `getRecordable`, and `recordRepository`'s `query` / `monthStats` - so every
  screen that reads through them is answered for the right scope without having to remember: the
  library, the sidebar's modules and links, the calendar, the day view, the dashboard, the reports, the
  files browser, search, the reminders, the briefing and the assistant's answers.
- **What is deliberately NOT scoped**: the record generator, the demo generator, the boot migrations and
  the assistant's preparation all use the `...Unscoped` variants. The plant's registers have to be
  complete whoever happens to be logged in - and since this browser's localStorage is the only copy of
  them, scoping generation would make another department's obligations vanish for everyone, not just for
  the person looking. The briefing that *shows* prepared records is scoped, so each person still only
  sees their own.
- **Reaching another department's document says so.** Every page that is about one document, and every
  record address, now renders `NotYourDepartment`: "This record belongs to Human Resources. Your account
  covers Quality Control... ask the system administrator." It names the owning department, never shows a
  field of the record, and never reads as a fault - the old "Document definition missing for this
  record" message is now kept only for a document that genuinely has been withdrawn.
- **Who assigns it.** A new joiner picks their department on the signup form; the administrator (the
  first account created) can change anyone's in **Master Data > Departments & access**, which also lists
  the ten departments and the documents each owns. A staff account cannot change its own - a restriction
  somebody can lift for themselves is a preference, not a rule - and the API refuses them the list of
  accounts (403). An empty assignment means every department, which is what management, the MR and QA
  need, and what the administrator and any unassigned account get, so a fresh installation is never
  locked.
- **What this is and is not.** It decides what a person is shown and what they can open. It is not a
  server-side authorisation boundary: the records still live in each browser's own localStorage
  (DATA_MODEL.md), so it keeps departments out of each other's paperwork in the plant's shared,
  logged-in app but cannot defend a browser's storage against its own owner. When the records move to
  the server (FUTURE_ROADMAP.md) this same assignment is what the API must enforce. Said plainly here so
  it is never described to the customer as security.
- Covered by `tests/e2e_departments.py`.

## 41. Three trend analyses, exactly as the company reports them (13-Sep-2026)

```
REQUESTED            "So add this three different trends analysis and make sure that what i provided
                      you i want exactly"
SOURCE               "GP-3 Trend Analysis - 2025.pdf" - three pages, one per target pest
DIGITAL TEMPLATE     src/data/seed/trendReports.ts (the transcription and each page's header
                      wording), src/data/selectors.ts (lizardTrendRows, flyTrendRows,
                      rodentTrendRows), src/components/reports/CatchTrendSheet.tsx (the page),
                      src/pages/ReportsPage.tsx (LizardTrendReport + the two existing ones),
                      src/pages/PestControlPages.tsx (LizardTrendPage)
```

The company keeps **three** trend reports on one page format, not the two this system had:

| Page | Report | Source | Unit | Target Pest |
|---|---|---|---|---|
| 1 | RODENT CATCH REPORT AND TREND ANALYSIS | Trapped on Glue boards in Roda-boxes | Number | Rodents |
| 2 | LIZARD CATCH REPORT AND TREND ANALYSIS | Trapped on Glue boards in Roda-boxes | Number | Lizard |
| 3 | FLIES CATCH REPORT AND TREND ANALYSIS | Collected in EFKs | Gramms | Flies |

- **The figures are the company's, to the cell.** 2024 rodents 0 (total 0); 2024 lizards
  0,0,1,0,1,0,0,0,0,1,0,0 (total 3); 2024 flies 30,22,22,16,15,17,15,13,22,24,22,17 gramms (total
  235). The lizard row is reported to November and the flies row to October, with the later months
  and the year Total left blank exactly as the page leaves them. "Gramms" is the company's
  spelling and is kept. `tests/e2e_trend_reports.py` types every one of those figures out again and
  fails the build if a single cell reads differently.
- **One cell is deliberately not the supplied snapshot**, and it is the only one. The supplied file
  reports 2025 rodents to October and leaves Nov/Dec blank; the earlier-transcribed
  "Kapila mam department reports .pdf" is a later issue of the same report and gives the complete
  2025 — Nov 0, Dec 0, Total 2 — plus Jan–Jun 2026. The complete row is kept, because it agrees
  with the supplied file on every cell the supplied file fills and discarding it would lose the
  company's own later figures. Open question 10 records this, to be reverted to the October
  snapshot on a word from the MR.
- **The Total is printed only when the year is complete**, which is the convention on all three
  pages: every 2024 row carries one, every part-reported 2025 row leaves it blank. The running figure
  for the year in progress is not lost - it is in the text beside the sheet on each report page.
- **The lizard report is new, and is transcription only.** The house lizards come off the same glue
  boards in the same Roda-boxes as the rodents, but F/HR/17 has no column for them - its check point
  7 records the rodent catch alone - so there is nothing in the digital register to add up. Nothing on
  that sheet is tinted and its footnote says so, which is the difference between a figure this system
  computed and one it copied. It lives at `/pest/trend/lizard`, in Reports as its own tab, in the
  sidebar under Trend Analysis and on the module overview, and it belongs to F/HR/17 for the purposes
  of who may see it (§40).
- **The flies report is reported by WEIGHT, and that changed what the fly sheet says.** The company
  weighs what it collects out of the electric fly killers each month, in grammes. That is not the same
  measurement as the approximate per-board counts written on the fortnightly F/HR/18 register, and
  there is no factor to convert between them - so a year the provider reported is the reported
  gramms, and a year only the digital register covers carries its own Source ("Caught on Glue boards
  of Fly catchers (PC-01 to PC-13)") and its own Unit ("Number") on its own row. Source / Unit /
  Target Pest are printed per ROW on the company's page, which is exactly what makes that honest. The
  per-unit PC-01..PC-13 breakdown stays below the sheet as the register's own detail. The sheet was
  previously titled "FLY CATCH REPORT AND TREND ANALYSIS" with a source line this system had made up;
  both are now the company's.
- **Each page gets its "Report prepared by" signature line**, ruled and left blank: the system does
  not sign a report for anybody.
- **A row of twelve empty cells is never added.** A year is on the sheet because the provider
  reported it or because the register holds a record for it - never because the calendar reached it.
  And if the year asked for has a row whose cells are all still blank, the chart falls back to the
  most recent year that has figures and the caption names the year it drew (the §39 rule, extended).

## 42. The SOP Reference comes out of the Pest Control module (13-Sep-2026)

```
REQUESTED            "also remove whole SOP Reference from pest control module"
```

- Gurudev Pest Control's Standard Operating Procedure was reproduced in this system as a
  reference-only document. It is withdrawn: the document, its page, its `/sop` route, its sidebar
  entry, the two buttons that opened it, its transcribed content and its `DocumentKind` are all gone.
- **Why it is right to remove it and keep the chemical chart**: the SOP is the service *provider's*
  own procedure, not one of the company's controlled formats. It appears nowhere on the Master List of
  Formats & Records (F/SYS/02), and its Format No. and Revision were both TO BE CONFIRMED for exactly
  that reason. The Pesticide Application Chart is the company's, so that one stays.
- Retired through `RETIRED_DOCUMENT_IDS`, so a browser that already holds the document, its
  reminder-role entry or any records for it drops them on the next load rather than keeping an orphan.
- **One thing the removal had to carry with it.** The Service Agreement's Scope of Services clause -
  the five services and their frequencies - was being derived from that transcription. Those lines are
  the contract's own content, so they moved into `src/data/seed/trendReports.ts`'s neighbour
  `src/data/seed/serviceAgreement.ts` as `SCOPE_OF_SERVICES`, word for word, TO BE CONFIRMED
  frequencies included. The agreement's schedule clause no longer sends the reader to a page that
  does not exist; it says the provider's procedure is held on site by Purchase.

## 43. The Training Record's Attended tick box is withdrawn (13-Sep-2026)

```
REQUESTED            "in training record remove that attendance checkbox whole column also"
DIGITAL TEMPLATE     src/pages/TrainingPage.tsx, src/types/record.ts (TrainingAttendee)
```

- The attendee list **is** the attendance sheet now, the way the paper sheet reads it: a name on the
  list is somebody who was there. The Attended column, its tick box and the `attended` flag behind it
  are all gone.
- Everything that used to read or write that flag is re-expressed in terms of who is on the list, so
  nothing silently lost its meaning:
  - **auto-fill** carries last year's names forward as a starting point and says so in its note
    ("take off anyone who did not attend, add anyone new") instead of copying them in unticked;
  - **the assistant's "Who attended?"** question builds the list - the names given are the sheet, so
    anybody carried forward who is not named comes off it;
  - **"Ajay Vaghela absent"** takes that name off the sheet and **"... attended"** puts one on, which
    is what a person does to the paper sheet;
  - **validation** asks for at least one name rather than at least one tick;
  - **sample data** signs off a realistic sheet - most of last year's invitees, one or two missing;
  - **the Training Status report** counts the names on the sheet.
- The model's field guide (`backend/assistant.ts`) no longer offers the field, and is told that
  recording an absence means removing that person's entry.

## 44. The fly catcher tube lights: two fixed dates (13-Sep-2026)

```
REQUESTED            "So in fly catcher date of the tube light intsallation date is fix which is
                      24-11-25 and due date for tube light replacement 23-11-26 so do that in
                      FORTNIGHTLY - fly catcher inspection & cleaning record"
DIGITAL TEMPLATE     src/engine/flyPattern.ts (TUBE_LIGHT_INSTALLED / TUBE_LIGHT_DUE),
                      src/engine/recordDefaults.ts, src/engine/autoFill.ts,
                      src/data/demoGenerator.ts, src/engine/guidedRecord.ts,
                      backend/assistant.ts
```

- **DATE OF TUBE LIGHT INSTALLATION is 24-11-2025 and DUE DATE FOR TUBE LIGHT REPLACEMENT is
  23-11-2026**, on every one of the thirteen units, on every line of F/HR/18 — the department's own
  statement. Two constants, `TUBE_LIGHT_INSTALLED` and `TUBE_LIGHT_DUE`, and nothing derives a third
  date from them.
- **The app used to compute them, and that was the defect.** `tubeLightCycleFor(serviceDateISO)` read
  the specimen's month as December and rolled the pair forward from whatever the service date was, so
  a record dated 2027 would have claimed an install date nobody had stated. An earlier cut had been
  worse still: it staggered thirteen different dates across the year, on the assumption that thirteen
  identical dates in the specimen was a data-entry artefact. Both invented a fact only the plant
  knows. The function is deleted.
- **A sheet started by hand now opens with the two dates already on it** (`recordDefaults.ts`) rather
  than two blanks somebody has to look up, which is what "is fix" means in practice; the assistant's
  pre-fill and Demo Mode use the same two constants. Both fields stay editable, as on paper, and a
  date a person types is carried forward to the next visit and never overwritten (`autoFill.ts` takes
  `prev?.tubeLightInstallDate ?? TUBE_LIGHT_INSTALLED`).
- **When the tubes are next changed**, a person types the new dates on the register, or these two
  lines are updated — the only honest way for the system to learn a date only the plant can know. A
  record dated after the due date still flags that unit as overdue in the assistant's notes, which is
  exactly the prompt to enter the new pair. (Today is 13-Sep-2026, so 23-11-2026 has not yet passed.)
- **Every other route to a tube-light date had to follow.** Fixing the two constants alone would have
  left five ways for the old dates, or blanks, to come back, and a four-angle sweep over the change
  found each of them:
  - **Records already stored in a browser** were filled in by the old code and carry a December pair.
    Because auto-fill carries the previous visit's dates forward, one stale record would keep seeding
    the next for as long as the register runs. `src/engine/tubeLightMigration.ts` corrects them at
    every boot (idempotent), and only where the old code could have produced the value — an install
    date on a 24 December, a due date on a 23 December. A date somebody typed is left alone, and so is
    a submitted, verified or rejected sheet: that is signed paperwork and changes only through a
    correction. Each change goes into the record's own history, by "System".
  - **"Add visit"** copied the previous visit's dates unconditionally, so an older record holding
    blanks would have written two empty cells onto a sheet whose dates the department has stated. It
    now falls back to the register's own pair.
  - **A unit missing from an older record** got its row built in the register grid with two nulls;
    it now gets the fixed pair.
  - **The guided interview** derived the due date as install + 364 days. The register's own install
    date now gives the register's own due date exactly; any other date a person gives is a tube
    changed since and still carries a year's validity from that day — which is the same rule the
    register's pair follows. Its "already answered" test also required only the install date, so a
    sheet with a blank due date was never asked about.
  - **The assistant's own note** still told the reader the dates came from an annual December cycle
    while writing November ones, and the pattern generator still justified leaving check point 10
    unflagged with the December pair. Both now say what the register says.
- The assistant's field guide now states both dates and tells the model not to compute or invent a
  tube-light date, and its sample-data rule no longer pulls a printed future validity date back to
  today. Covered by `tests/e2e_smoke.py` (the F/HR/18 two-page sheet reads `24/11/25 · 23/11/26`
  with ditto marks on the unit's second line, in Demo Mode where the visits have been carried out)
  and by `tests/e2e_trend_reports.py` (a sheet started from the library carries both dates on all
  thirteen units, and no stored record carries any other pair).
- **The two columns print on EVERY line of the register**, which is the point of their being fixed.
  A fortnightly visit not yet carried out is otherwise a blank line on the paper — no date of
  service, no count, no names — and the digital sheet reproduces that; but the tube in a unit was
  still fitted on 24-11-2025 and is still due on 23-11-2026 whether or not this fortnight's
  inspection has happened, so those two cells are not a property of the visit and are not left
  blank with it. Every unit's first line prints both dates and its second line dittoes them, as the
  specimen writes them (`FlyCatcherRegisterSheet.tsx`). This was the department's actual complaint
  on being shown the first cut: the dates were on every record but the register still looked empty.

## 45. The plant's own seasons, and its own rodent figures (13-Sep-2026)

```
REQUESTED            "in Fly catcher report the trend report will increase like according to season
                      wise for example in rainy season and winter there is more Fly's then summer so
                      data should be according to that and in rodent make three to four found in
                      months or in a year"
DIGITAL TEMPLATE     tools/pest_pattern.py (the calibration, regenerating
                      src/data/seed/pestPattern.ts), src/engine/rodentPattern.ts (the year plan)
```

**THE FLY SEASON HAD ONE PEAK AND THE PLANT HAS TWO.** The seasonal curve was a single cosine peaking
in the monsoon, which forced winter to be the quietest quarter of the year — measured over the
register, winter averaged 15 flies a month against summer's 19. The department's year is not shaped
like that: the rains are busiest, **winter is busy again** as the flies come indoors, and the dry
summer heat is the quiet season. A cosine cannot say that, so the curve is now written out month by
month (1.0 = August, keeping the photographed specimen's per-unit means calibrated):

| | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factor | 0.80 | 0.72 | 0.50 | 0.38 | 0.34 | 0.52 | 0.92 | **1.00** | 0.94 | 0.80 | 0.74 | 0.84 |

Measured back off the seeded register for 2025-27, the monthly means now run **rainy 26-34 > winter
22-24 > summer 11-16**, in that order every year. The generator asserts the ordering, so the shape
cannot be lost by a later tweak. It also matches the plant's own trend report, where January-2024 is
the heaviest month on the page at 30 gramms.

**THREE TO FOUR RODENTS A YEAR IS A STATEMENT ABOUT THE YEAR**, and a per-day probability cannot hold
one. At the rate that averages three and a half a year, the seeded draws gave 4, 2, 1, 1 and 5 across
2024-28 — the variance of a few rare independent events is as large as the events. Earlier settings
were worse the other way: ten catch days a year, then five, giving 4-9 rodents and arguing with the
company's own Rodent Catch Report (0 in 2024, 2 in 2025) printed in the same table.

So `engine/rodentPattern.ts` now **plans each year instead of rolling it day by day**: it draws three
or four catches from the year alone, places each on a date chosen by the monsoon-leaning month
weighting, and every other day of that year is quiet. Checked against the seeded draws themselves,
every year from 2024 to 2033 lands on three or four rodents in three or four different months. The
answer for any one date is still a pure function of that date, so the assistant's pre-fill, Demo Mode
and a re-run "Fill again" still agree.

- **What changed in the seed**: `RODENT_MONTHLY_RATE` (a per-day probability) became
  `RODENT_MONTH_WEIGHT` (which months, summing to 1) plus `RODENT_CATCHES_PER_YEAR` (how many, `[3,
  4]`). `RODENT_COUNT_DIST` and `RODENT_SECOND_LOCATION_P` are gone: both added rodents to a day and
  so could not coexist with a yearly total. Bait-cake biting and a dead rodent observed are still
  independent per-day draws — they are signs, not catches, and do not count against the year.
- **A lesson about generated files.** The provenance note on the two issues of the Rodent Catch Report
  had been hand-added to `pestPattern.ts`, which `tools/pest_pattern.py` overwrites — regenerating
  silently erased it. It now lives in the generator's own emit list, where re-running preserves it.
- Covered by `tests/e2e_smoke.py`, in Demo Mode: the demo year's rodent catches are within three to
  four and spread across separate months, and the fly figures are higher in the rains than in summer.

## 46. The Human Resources module — sixteen F/HR formats, and the pest control file inside it (14-Sep-2026)

```
REQUESTED            "make HR module So for that i am uploading mutiple files so add those in HR Module
                      only ... also added that Pest Control module and everything in HR Module"
SOURCE               Sixteen PDFs supplied 14-Sep-2026: F-HR-01 Personal Competence record (R-2023),
                      F-HR-03 Operator skill matrix (2023), F-HR-04 Pre Employment Health declaration,
                      F-HR-05 / F-HR-06 Induction Training programme (Staff / Operators), F-HR-07 Job
                      responsibility & authorities (two files), F-HR-08 Employee wise Training need
                      identification Record, F-HR-09 Training Calender (2026-27), F-HR-11 Training
                      Evaluation sheet, F-HR-12 Training Feedback & Evaluation Record, F-HR-13
                      Authorization for Mobile inside Plant, F-HR-14 Visitor health declaration record,
                      F-HR-19 Monthly GMP Inspection record, F-HR-20 Product safety culture survey,
                      F-HR-21 Product Safety Culture Survey analysis record, F-HR-22 Daily Employee
                      Sanitation & Hygiene record
DIGITAL TEMPLATE     src/data/seed/hrLayouts.ts (the sixteen log-sheet layouts), src/data/seed/hrRecords.ts
                      (the filled registers, seeded LIVE), src/data/seed/documentDefinitions.ts (the
                      definitions, the module and its sections), src/components/layout/Sidebar.tsx,
                      src/pages/DocumentLibraryPage.tsx (section rows), src/engine/assistantLocal.ts
                      (the documents by name), src/data/seed/departments.ts (all sixteen are HR's)
```

**ONE MODULE, TWO SHELVES.** The Pest Control module is gone as a module and has become one shelf of a
new **Human Resources** module, exactly as asked: the module holds HR's own sixteen formats and, beside
them, the whole pest control file — the ten documents that were the Pest Control module, unchanged,
with their own pages, their four groups and their trend analyses. That is also what the company's own
Master List of Formats says (§40): F/HR/17 and F/HR/18 are Human Resources' formats, filed with
F/HR/15 to F/HR/19. In the sidebar the module reads **HR Records** (the sixteen formats, opening in the
Document Library filtered to the module) and then **Pest Control** with the file's Overview and its
Daily Report / Service Reports / Trend Analysis / Training & Reference groups. The Document Library
shelves the module's twenty-six documents by section, each section named on a row of its own, HR's
five groups first and then the pest control file's four (`HR_SECTIONS`, `PEST_CONTROL_SECTIONS`,
`MODULE_SECTIONS`). `/library/human-resources` is the module's address; `/pest-control` stays the
file's front door. Every one of the sixteen is Human Resources' in `departments.ts`, so a Quality
Control account sees none of them and the refusal names the department.

**THE SIXTEEN FORMATS.** All are grids, so all render through the generic `log-sheet` kind (§9), one
layout each, with the paper's own wording — spelling included ("Calender", "Insection",
"callibration", "Quality Supervisior" are the company's). Where the paper prints a table the system
never fills (the skill grades, the induction topics, the mobile-usage designation matrix, the
evaluation criteria, the Form-22 monthly problem counts) it is carried as a reference table; where it
prints a list the system always fills (health questions, GMP points, survey attributes, days of the
month) the rows are fixed. Nothing was added to a format.

| Format | Document | Section | Records | On file |
|---|---|---|---|---|
| F/HR/01 | Personal Competence Records (Staff Members Only) | Personnel & Competence | Yearly, 1 Oct | **80 staff**, reviewed as on 01.10.2026 — Verified |
| F/HR/03 | Skill Matrix - Operator | Personnel & Competence | Yearly, 1 Sep | **58 operators**, status as on 01.09.2026 — Verified |
| F/HR/07 | Job Responsibility & Authority | Personnel & Competence | As required, one sheet per position | **8 positions** (Executive-Lab, Executive-Hr, Manager Dispatch & Logistics, Executive, Pouching Manager, Sales Coordination, Pouch-Manager, Quality Executive) — Verified |
| F/HR/13 | Authorization for Mobile Usage in Plant Area | Personnel & Competence | As required | **37 authorisations** — Verified |
| F/HR/08 | Employee Wise Training Need Identification Record | Training | Yearly, 1 Apr | **154 employees** for 01.04.2026 ~ 31.03.2027 — Submitted (ticks TBC, below) |
| F/HR/09 | Training Plan Calender (Rev. 00 / 07.03.2022) | Training | Yearly, 1 Apr | **19 topics**, both pages — Verified |
| F/HR/11 | Training Effectiveness Evaluation Record | Training | As required | blank format |
| F/HR/12 | Training Feedback & Evaluation Record | Training | As required | blank format |
| F/HR/04 | Pre-Employment Medical Health Declaration | Induction & Health | As required | blank format (10 questions, 06 as twelve lines — 21 rows) |
| F/HR/05 | Induction Training Record — Staff (Supervisor & above) | Induction & Health | As required | blank format (5 topics with their responsibility) |
| F/HR/06 | Induction Training Record — Operators / Workers | Induction & Health | As required | **28 inductions**, Jun-2025 to Jan-2026 — Verified |
| F/HR/14 | Visitor Health Status Declaration Record | Induction & Health | As required | blank format (9 questions incl. body temperature) |
| F/HR/19 | Monthly PRP Check List (GMP Inspection Record) | Hygiene & GMP | Monthly, 1st | blank format (55 points, 12 locations) |
| F/HR/22 | Daily Personal Sanitation & Hygiene Inspection Report | Hygiene & GMP | Monthly, due at month end | blank month sheet (31 day lines × 9 checks) |
| F/HR/20 | Product Safety Culture Survey | Product Safety Culture | As required, one form per employee | blank format (15 attributes, 7-point scale) |
| F/HR/21 | Product Safety Culture Survey — Analysis | Product Safety Culture | Yearly, 31 Jan | **January 2026**, fifteen attributes, 63 respondents, 93.99% overall — Verified |

**THE FILLED REGISTERS ARE LIVE RECORDS, LINE FOR LINE.** The eight registers that arrived filled are
seeded the way the Dec-2023 GAP report and the two training records are (`hrRecords.ts`, merged by id
into `SEED_HISTORICAL_RECORDS`): Verified, `isDemo: false`, submitted and verified "HR & Admin
(register as supplied, 14-Sep-2026)". Names, designations and dates are as written, spelling and
date style included — the competence register mixes `01.04.2014` with `4/30/2025`, and two operators'
joining dates survive only as spreadsheet serials (`43893`, `45439`); all kept as printed, because a
transcription that "tidies" is no longer a transcription. The analysis sheet's figures are as printed
and nothing is recomputed (attribute 8 reads 63 actual against 58 ideal, 92.06%, as the sheet does).
A yearly register's next issue starts from the whole previous register, not from two typical lines
(`typicalRows: ROSTER` in the layouts).

Three things are deliberately **not** transcribed, and the records say so:

- **F/HR/08's topic ticks.** The 154 names and designations are in; the X marks did not survive the
  PDF's text layer unambiguously enough to place against seventeen columns, so none is guessed. The
  record is seeded *Submitted*, not Verified, with the note `TNI_NOTE` — HR ticks the topics from the
  paper copy and verifies.
- **F/HR/03's earlier issue.** The same PDF carries the 01.02.2025 skill matrix after the current one;
  the 01.09.2026 status supersedes it and only that one is seeded.
- **F/HR/07's duplicate.** The Executive-Lab sheet appears twice, near-identically, across the two
  PDFs; it is one position and is seeded once (eight positions, not nine).

**WHAT THE ASSISTANT DOES WITH THEM.** Each of the sixteen is named in the assistant's alias table
("skill matrix", "training calendar", "gmp inspection", "visitor", "mobile", "hygiene", the format
numbers…); "hr" and "human resources" name the module, and "pest" / "pest control" name the pest control
file inside it — F/HR/17, F/HR/18, the service reports and the training record — so "pest control records
from 1 to 19 January" opens exactly those, at the Document Files scope `pest-control`, which old links
still resolve to (`engine/fileScope.ts`). The sample fill keeps to the
plant's own people: a per-person form (pre-employment declaration, staff induction, trainer's
evaluation, culture survey) is filled in the name of the person who answers for that document — the
Manager – HR & Admin or the PSTL / Training Coordinator, via `documentRoleKeywords` — and the visitor
declaration in the name of the plant's most regular visitor, Gurudev's technician. No applicant,
visitor or respondent is invented. The two new master-data facts come from the registers themselves:
Sandeep Parekh (Manager – HR & Admin, joined 05.07.2024) is added to Employees, and Ms. Kapila Barad's
role gains "PSTL (Manager - QA)", which is how F/HR/13, F/HR/19 and F/HR/20 name her.

**SCHEDULES ARE THIS SYSTEM'S, NOT THE PAPER'S.** None of the sixteen states a recurrence, so the
cadence in the table above is assumed from what the register is: the competence review on 1 October
and the skill matrix on 1 September (the dates the current issues are "as on"), the training need
identification and calendar on 1 April (the training year), the GMP walk monthly, the hygiene sheet a
monthly record filled day by day and due at the month's end (dayOfMonth 31 clamps to the month),
the survey analysis each January (the round on file), and everything else as required. All are one
line each in `documentDefinitions.ts` and are listed in the TO BE CONFIRMED list below.

- Covered by `tests/e2e_hr_module.py` (**118 checks**): the forty-document library and the module's
  twenty-six shelved by section, the sidebar, every seeded register's row count and its first, last
  and named lines against the PDFs, the analysis sheet's figures, the sheets opening in their own
  layout read-only, a new record of each blank format with the paper's printed rows, and the two
  department views (QC sees nothing of it; HR sees the module and the pest control file, not CAPA).
  `tests/e2e_print_all_documents.py` and `tests/e2e_assistant_fill.py` pick the sixteen up
  automatically — each is started from the library, filled with sample data, submitted and printed.

## 47. HR Records get pages of their own, and Open Document opens the document (15-Sep-2026)

```
REQUESTED            "you have already created Pest Control module in HR like wise do for other records of
                      HR also now make and when user click on open document it will open it and not
                      calendar"
DIGITAL TEMPLATE     src/pages/HrPages.tsx (the HR Records overview), src/pages/DocumentRecordsPage.tsx (one
                      document's page), src/data/seed/hrModule.ts (the sixteen pages, their slugs and groups),
                      src/engine/documentRoutes.ts (where Open Document goes), src/components/layout/Sidebar.tsx
```

**HR RECORDS ARE LAID OUT LIKE THE PEST CONTROL FILE.** The pest control file inside the Human
Resources module had an overview and a page per report; HR's own sixteen formats had one link into the
library. They now have the same shape. In the sidebar, **HR Records** reads *HR Overview* and then the
five groups — Personnel & Competence, Training, Induction & Health, Hygiene & GMP, Product Safety
Culture — with a link per format under each, exactly as **Pest Control** reads *Overview* and then
Daily Report, Service Reports, Trend Analysis and Training & Reference. The two shelf names are set a
little heavier than the group headings under them, so the module reads as two shelves. Only the most
specific link is lit: on the competence page that is the competence link, not the overview too.

- **/hr — HR Overview.** A card per group; each format on it with its format number, frequency, how
  many records are on file, the latest one's date and status, and the next due date (or "As
  required"). A format opens on its own page.
- **/hr/{slug} — one format's page.** The records on file (dated, what tells them apart — the position,
  the period, the trainee, the review date — lines filled, status, submitted and verified by), and the
  latest record **shown in full below, exactly as the form prints**, so opening the competence register
  opens the 80-line register. Clicking a line shows that record instead (the eight position sheets of
  F/HR/07 are read one after another this way); *Open record* takes it to its own page to fill in,
  submit or verify; *New record* starts one. A format with nothing on file yet shows its blank form,
  with *Start this record*. The sheet shown is the printable document of the page.

**OPEN DOCUMENT OPENS THE DOCUMENT.** "Open Document" in the Document Library sent every log sheet to
the Record Calendar — a month of every department's due dates with the document nowhere on it. Now
(`documentOpenRoute`) an HR format opens its HR page, and every other log sheet — the lamination QC and
production registers, the QC inspection records — opens the same kind of page at `/document/{id}`.
Nothing in the library opens the calendar any more. Both pages refuse another department's document by
name, as every page does (§40), and the assistant can navigate to them (`/hr`, `/hr/{slug}`,
`/document/{id}` in the route guide and `isValidAppRoute`).

- Covered by `tests/e2e_hr_module.py` (now **138 checks**): the sidebar's overview and sixteen format
  links in order, a format link opening its register with only that link lit; every one of the forty
  documents' Open Document clicked and none landing on the calendar, each HR format on its own page and
  a lamination log sheet on its document page; the competence page's 80-line register, the eight
  position sheets shown one after another, the TNI still Submitted, the visitor declaration's blank
  form and Start; HR Overview's five groups and sixteen formats; and the QC account refused at `/hr`
  and at a format's page. `tests/e2e_print_all_documents.py` prints an HR format's page and a log
  sheet's document page with nothing around the sheet.

## 48. A Back button on the Record Calendar (15-Sep-2026)

```
REQUESTED            "Add Back option in Record calendar"
DIGITAL TEMPLATE     src/pages/CalendarPage.tsx (the button), src/store/router.tsx (where you came from),
                      src/pages/DayViewPage.tsx (Back to Calendar)
```

The Record Calendar had no way back to the page it was opened from. It now has a **Back** button above
its title, in the same place and style as the record page's, translated with the rest of the screen.

- **Back returns to the page you came from.** The router keeps the app's own trail of addresses
  (`back()` in `store/router.tsx`): a move made in the app is a step forward, the browser's Back and
  Forward are steps back and forward, and Back goes back through the browser so its history stays in
  step.
- **Opened straight from its address** — a bookmark, a new tab, a link somebody sent, a reload — there
  is no page of the app behind the calendar, and the browser's Back would leave the app. Back goes to
  the **Dashboard** instead.
- **A day and back.** The Day View's *Back to Calendar* used to open the calendar afresh, which would
  have made the calendar's Back return to the day just left. When the day was opened from the calendar
  it is now a real step back (`backTo("/calendar")`) — to the same month — so the calendar's Back
  still leads to where you were before the calendar. Opened any other way, it opens the calendar as
  before.
- Covered by `tests/e2e_smoke.py`: the button is there, returns to the page the calendar was opened
  from, still does after a day and *Back to Calendar*, and goes to the Dashboard when the calendar was
  loaded from its own address.

## 49. A new joiner from their CV, onto Personal Competence Records and every HR format that asks for the same details (15-Sep-2026)

```
REQUESTED            "in Personal competence Records Whenever user upload his Resume/CV and the detail will be
                      automatically come in that excel sheet and whereever the similar data required in HR
                      document so it will be go there which is similar or correaltion"
DIGITAL TEMPLATE     backend/cvExtract.ts (reading the CV), POST /api/hr/cv/read (backend/index.ts),
                      frontend/src/engine/hrJoiner.ts (where the details go), frontend/src/components/hr/
                      CvImportDialog.tsx (the review form), Personal Competence Records' page (/hr/competence)
```

**ADD FROM CV / RESUME.** Personal Competence Records (F/HR/01) has a button that takes the candidate's CV
— PDF, Word (.docx) or plain text, up to 5 MB — and reads it on the server. What the CV states comes up in
a form for HR to check against the CV: name, sex and date of birth where written, the highest
qualification in the short form the register uses (MBA, B.Com, Diploma, ITI, 12 Pass…) with the CV's own
line for it, and the experience ("3 Years", "Fresher"). The position applied for becomes the designation.
Nothing is written anywhere until HR presses Add.

- **How the CV is read.** Text rules always run: labelled lines (Name, Date of Birth — day first, as
  Indian CVs write it — Gender), the e-mail and phone patterns, the qualification ladder from 10th to
  Ph.D, an experience total the CV states, or else the employment periods listed under its experience
  heading added up with overlaps counted once and education dates left out. When Groq is configured the
  assistant then fills only what the rules could not find, told to return nothing the CV doesn't state;
  a name, e-mail, employer or position it returns that is not in the CV's own text is dropped, and sex is
  never inferred from a name. Setting `CV_READ_WITH_ASSISTANT=0` keeps CVs to the rules alone (the
  network-independent test run does). The server stores neither the file nor its text.
- **What only HR knows, and what the plant's own register says.** Department, designation and date of
  joining are HR's. What the position requires — education and experience — is taken from F/HR/01 itself:
  the most common entries on the register's lines for the same designation, which also suggest the
  department (Sales Coordinator: Sales & Marketing, Graduate, 1 Year, from seventeen lines). A designation
  with no line on the register leaves the requirement for HR to write. The gap is worked out from the two:
  "NA" when the person meets both, otherwise left blank with the gap named, because a justification is
  HR's to write, not the system's.
- **Where the person goes — the correlation.** Each format gets exactly the columns it prints, in the date
  style its own register already uses:

| Format | Staff (default) | Operator / worker (default) | What it gets |
|---|---|---|---|
| F/HR/01 Personal Competence Records | yes | — (the format is for staff members only) | a line: name, department, designation, education and experience required / available, gap, date of joining (dd.mm.yyyy) |
| F/HR/03 Skill Matrix - Operator | — | yes | a line: name, designation, date of joining (m/d/yyyy); the skill points are graded later |
| F/HR/08 Training Need Identification | yes | yes | a line: name, designation; topics ticked later |
| F/HR/06 Induction — Operators / Workers | — | yes | a line: name, joining department & designation, date of joining & induction (dd/mm/yyyy) |
| F/HR/05 Induction — Staff | yes | — | a record of their own: name, department / process, designation, date of joining |
| F/HR/04 Pre-Employment Health Declaration | yes | yes | a record of their own: name, department & designation, sex, date of birth — the questions are theirs to answer |
| F/HR/13 Mobile Usage Authorization | never ticked by default | never | a line: name, department & designation, date of allowance; the form notes when the designation is on the matrix, but allowing a phone is the PSTL's decision |

  The category comes from the designation (operator, helper, worker, packing, loading…) and every tick
  can be changed.
- **A controlled register is never changed quietly.** A register that is submitted or verified — F/HR/01
  and F/HR/03 are verified, F/HR/08 submitted — is reopened for correction with the reason written ("New
  joiner from the CV "Riya_Mehta_Resume.pdf": Riya Mehta (Sales Coordinator, Sales & Marketing)"), the
  line is added, and the register goes back to be submitted and verified again; *Cancel correction* on the
  record puts it back as it was. The form says so beside each such format before Add. Every change is in
  the record's history.
- **Nobody twice.** A format that already lists the person (or already holds their F/HR/04 / F/HR/05
  record) says so and cannot be ticked.
- **What cannot be read** is refused with the way forward: an old Word .doc, a photo of a CV, a scanned PDF
  with no text, a damaged or password-protected PDF, a file over 5 MB. *Enter details by hand* opens the
  same form empty, and it files the person the same way.
- Covered by `tests/e2e_hr_cv_import.py` (**42 checks**, text rules): a PDF CV made by Chromium and a .docx
  made as a zip read field by field; the periods of an unlabelled CV added up; the form's requirement,
  department and gap from the register; the staff member onto F/HR/01 and F/HR/08 (reopened from Verified
  and Submitted) with her F/HR/05 and F/HR/04 started; the operator onto F/HR/03, F/HR/06 and F/HR/08, not
  F/HR/01; each register's date style; nobody twice; .doc, photo and oversized files refused; entry by hand;
  the reader refusing a request without a session. The assistant path is checked live in
  `tests/e2e_assistant_chat.py`: a CV with no name line gets its name from the assistant, as written, with
  nothing invented.

## 50. Mitra — the assistant gets a name, a character, and asks where you want to go (16-Sep-2026)

```
REQUESTED            "i want to make bot like a real buddy engaging and give any character and name like
                      which seem to be helpful to the interface in which it will look like and ask who to
                      do where you want to go like real person asking question"
DIGITAL TEMPLATE     src/engine/assistantPersona.ts (the name, the character, the questions),
                      src/components/common/DocumentAssistant.tsx (the widget), src/pages/AssistantPage.tsx,
                      src/engine/assistantLocal.ts (hello, thanks, "who are you"),
                      src/components/common/AssistantBriefingPopup.tsx, backend/assistant.ts (the model's prompt)
```

**THE ASSISTANT IS CALLED MITRA** — *mitra* is "friend" in Gujarati, so the name says what it is meant
to be: the plant's record-keeping buddy. It is one constant, `ASSISTANT_NAME` in
`src/engine/assistantPersona.ts`; change it there and the floating button, the panel, the full-page
Assistant, the login briefing and the model's own prompt all follow (`backend/assistant.ts` keeps a
copy in step, beside a comment saying so). The name is the same in both languages — a name is not
translated — while what it calls itself, *your records buddy*, is.

- **What it looks like.** The floating button reads **Ask Mitra**; the panel and the briefing carry a
  round avatar with its initial where a person's photo would be; the sidebar's entry reads *Ask Mitra*.
- **How it speaks.** The model is told who it is before it is told anything else: a warm, practical
  colleague, short sentences, plain words, the person's first name now and again, never gushing, never
  more than one question at a time, and **one short question back** rather than a guess when a request
  could mean two things. It is also told to say plainly that it is Mitra, this system's assistant and
  not a person, if anybody asks — the character is a manner, not a disguise.

**"WHERE WOULD YOU LIKE TO GO?"** Mitra opens with a greeting by the hour and by name, and then that
question, with its answers as buttons — and each answer asks the next question instead of showing a
menu of everything:

| Step | What Mitra asks | The answers |
|---|---|---|
| opening | "Good morning, Parth — Mitra here, your records buddy. Where would you like to go?" | Today's work · Open a document · See a report · Find a record · Today's briefing · What can you do? |
| a document | "Which shelf shall I open?" | the modules the person's own departments hold, then the whole Library |
| a full shelf | "Which part of Human Resources (HR)?" | the module's own groups (a shelf of twenty-six is asked about by section first) |
| a group | "Which one in Personnel & Competence?" | the documents, by their short names — each opens that document's own page |
| a report | "Which report shall I open?" | this month's Monthly, Daily Monitoring, Rodent, Fly Catcher, Training, Lamination QC |
| finding something | "Tell me what you remember — a name, PC-01, a job, a format number, a month…" | Open Search · Open Document Files |

Every step is plain data, so the widget and the full-page Assistant ask the same questions, the steps
never need the network, and they only ever offer what the person's departments may see (they are built
from the scoped repository — §40). Each step carries a **Back**, and after opening something Mitra says
what it opened and offers *Somewhere else*.

- **Small talk, answered on the spot** (`engine/assistantLocal.ts`, no network, no tokens): a bare
  "hi" or "namaste" gets the greeting and the same question; "thanks" gets a short, warm line; "what
  can you do?" gets the honest list; and "are you a real person?" / "who are you?" gets *I'm Mitra, the
  assistant built into this system — not a person*. The patterns are deliberately narrow so a real
  question about the work still goes where it belongs.
- **What did not change**: the scope rule (this record system only), the review-before-submit rule, the
  refusal to invent data, and every existing quick action. Mitra is a manner and a way in, not new
  powers.
- Covered by `tests/e2e_smoke.py`: the button calls it by name; the opening greets by the hour and by
  name and asks where to go, with the answers as buttons; a document is reached by shelf → part → name
  and lands on that document's own page; a typed "hello" is answered by name without the network; and
  "are you a real person?" is answered plainly.

## 51. Quality Control's two internal calibration records (16-Sep-2026)

```
REQUESTED            "add this in QC module with same format which i gave and make sure there is two page
                      in it with different names so check it and add it firstly so here bot need to
                      perform some calulation for the data present in it so don't do it first just for
                      now add and make sure there is no single error"
SOURCE               "weekly and monthly internal calibration records.pdf" — two scanned pages:
                      F/QC/12 (01 / 01.01.2022) WEEKLY INTERNAL CALIBRATION RECORDS - WEIGHT SCALE and
                      F/QC/11 (01 / 01.01.2022) MONTHLY INTERNAL CALIBRATION RECORDS – GSM CUTTING PLATE
DIGITAL TEMPLATE     src/data/seed/qcCalibrationLayouts.ts (the two formats),
                      src/data/seed/qcCalibrationRecords.ts (the two pages as supplied),
                      src/data/seed/documentDefinitions.ts, departments.ts, masterData.ts
```

**TWO PAGES, TWO DOCUMENTS, EACH BY ITS OWN NAME**, both on the Quality Control — Inspection Records
shelf (the module the plant calls QC), and both Quality Control's own on the Master List of Formats
(F-QC-11 *GSM cutting plate internal calibration record*, F-QC-12 *Weighing balance internal
calibration record*, each Rev. 01 of 01.01.22 — the revision the scanned forms print):

| Format | Document | Records | On file |
|---|---|---|---|
| F/QC/12 | Weekly Internal Calibration Records - Weight Scale | Weekly | four calibrations of scale QC-76, 25.02.2024 to 27.03.2024 — Verified |
| F/QC/11 | Monthly Internal Calibration Records – GSM Cutting Plate | Monthly | the 31.12.2024 calibration of plates No. 54 to No. 57 — Verified |

- **F/QC/12** carries the device block as written — Device ID QC-76, Laboratory, LAB, Force Strain
  Sensors, Serial No 06, calibration expiry 27.08.2024, minimum reading capacity 0.1 gm, maximum 600 gm,
  acceptable tolerance 0.05 % — then a line per weekly calibration: five test weights, the value the
  scale showed for each, the deviation beside it, Pass / Fail, the tester's sign and the next due date.
  On file: 0.050mg and the 50 / 100 / 200 / 400 gm weights, every tested value equal to its weight,
  every deviation 0%, all Pass; tested by Rashmi twice and then by Anjali twice.
- **F/QC/11** carries Device ID 1-54, 2-55, 3-56, 4-57, LAB, Global Eng. Co. (GEC), calibration expiry
  22.09.2025 and the calibration date, then the grid the paper prints: four measurements of each plate
  with the deviation beside each, and a Pass/Fail and a Sign line per plate. On file: each plate
  measured at its own size (20 x 20cm, 10 x 10cm, 5 x 5cm, 2.5 x 2.5cm) four times, 0% deviation, all
  Pass, signed Rashmi.
- **One difference in shape, and it is the paper's own doing.** The weight scale sheet writes each
  entry's Deviation % on a second line beneath it, which a grid cannot hold, so every weight carries
  its own Deviation % column on the same line. Nothing else differs: the headings, the wording, the
  "Tasted-1" spelling of F/QC/11 and the printed procedure note are the forms' own.
- **THE DEVIATION IS NOT CALCULATED YET**, as asked ("don't do it first just for now add"). The
  Deviation % and Pass / Fail cells are ordinary entry cells holding what the sheet says. When the
  arithmetic is added it is one place — (tested value − weight) ÷ weight × 100, judged against
  Acceptable Tolerance — and the layouts already have the columns for it.
- **Master data.** Rashmi and Anjali join Employees as QA — Internal Calibration (Lab); both spellings
  are TO BE CONFIRMED, being handwritten. Both documents answer to them.
- Covered by `tests/e2e_qc_calibration.py` (**32 checks**): both documents on the QC shelf with their
  format numbers and revisions; every column of both grids in the form's order; both supplied pages
  picked from the document's own page and read cell for cell, header block included; the illegible
  cells left blank and marked; a new weekly sheet starting from the page on file with the device
  carried forward; and the Deviation % cells still ordinary entry cells.

### What the scans could not settle

1. **F/QC/12's last Next Due Date** (after 27.03.2024) is not legible — left blank.
2. **F/QC/11's Serial No** is a scribble — held as TO BE CONFIRMED.
3. **F/QC/11's Due Date** beside "Calibration Date: 31.12.2024" is not legible — left blank.
4. **F/QC/12's first test weight** is written "0.050mg" on a scale whose minimum reading capacity is
   0.1 gm; transcribed exactly as written, to be confirmed with the lab.

## 52. Any document by its format number — in Search and with Mitra — and F/HR/05 as the form prints it (17-Sep-2026)

```
REQUESTED            "this document in HR module and make sure in search option and in our ai assistant if
                      user name enter Format number also of any document of any module then it should
                      repond on that also and work on it with user permission"
SOURCE               "F-HR-05_Induction Training  programme-Staff.pdf" — F/HR/05 Rev 00 / 01.12.2021
DIGITAL TEMPLATE     src/engine/formatNumbers.ts (reading a format number however it is written),
                      src/pages/SearchPage.tsx, src/engine/assistantLocal.ts, src/components/common/
                      DocumentAssistant.tsx, src/data/seed/hrLayouts.ts, src/components/records/LogSheetRecordView.tsx
```

**F/HR/05 WAS ALREADY IN THE HR MODULE** (§46, Induction & Health). Held up against the PDF it differed in
three details, now put right:

- **The topics were numbered twice** — "1. Briefing…" in the topic beside the grid's own Sr. No. column. The
  form numbers them in the Sr. No. column only, so the topic text no longer repeats it.
- **Topic 2's points ran into one line.** "Good Manufacturing Practice", "- Pest Control", "- Waste
  Management", "- Personal hygiene" are on lines of their own, as printed (a printed item now keeps its own
  line breaks on every log sheet).
- **The form's two blank lines under topic 5 were missing.** They are there now, and — the form leaving them
  blank for a further topic — their topic and responsibility are written in like any cell (on any log sheet,
  a line the form prints blank is writable).

The header (Name, Department / Process, Designation, Date of Joining), the caption *Induction programme;*,
the responsibilities and the sign-off for the Manager – HR and Admin and the Employee are the form's own.

**A FORMAT NUMBER FINDS ITS DOCUMENT, HOWEVER IT IS WRITTEN, IN EVERY MODULE.** The plant writes the same
number many ways — F/HR/05, F-HR-05, F HR 05, FHR05, HR/05, hr 5; F-QC-40.C or f/qc/40c — so every one is
read to one key (`formatKey`: "HR-5", "QC-40C"). Numbers of their own shape — the complaint
acknowledgement's QA-CAF-00, the provider's licence number — are matched as written, punctuation aside.
Only the person's own departments' documents are ever found (§40).

- **Search** lists the matching **documents** first — format number, name, module and section — each with
  *Open document* (its own page) and *New record* (started only when pressed); then that document's
  **records**. A number typed any of those ways lists exactly that document's records; anything else is
  matched as typed, as before. A number the system doesn't hold finds nothing.
- **Mitra** answers a format number the way a colleague would, and does nothing without the person's
  say-so:

| Message | Mitra |
|---|---|
| `F/HR/05` · `what is F-QC-40.C?` | says what it is — name, module, section, how often — and asks *What would you like to do with it?*: **Open it** · **Start a new one** · **Fill it question by question** · **Fill it with sample data** |
| `open f-qc-12` · `show me hr 5` | opens it, and says what it opened (asked for, so no second question) |
| `F/HR/05 and F/QC/11` | names each, with an *Open* for each |
| `F/HR/10` | "There's no F/HR/10 in this system yet" — with the Document Library and Search |
| another department's number | "F/HR/05 belongs to Human Resources, which isn't one of your departments" — the department, never the document |
| `fill F/HR/14 with sample data` · `create a new F-QC-30 record` · `F/HR/17 records from 1 to 15 September` | the usual commands, the document named by its number |

  A bare format number is a question even when a record is open, so it is never taken as data for that
  record. The widget and the full-page Assistant answer alike, with no network.
- Covered by `tests/e2e_format_numbers.py` (**45 checks**).

## Master data provenance summary

| Master list | Source | Notes |
|---|---|---|
| Employees | Handwritten specimens + certificate/report signatories | "Roshni" spelling TO BE CONFIRMED |
| PC Locations (fly catchers) | F/HR/18 specimen | PC‑10 floor TO BE CONFIRMED |
| Areas (per Service Report variant) | Service ReportApril 2026.xls | Kept separate per variant, as in source |
| Chemicals | Chemical Chart + SOP + Service Report | |
| Rodent Stations | — | **None supplied.** The Dec‑2023 GAP report explicitly flags that RBS numbering was *missing* at the time of inspection — left empty by design, not populated with invented IDs |
| Checkpoints (Daily Monitoring) | F/HR/17 specimen | Response-type reconciliation noted above |
| Lamination staff (Gaurav Singh, "Jeni", "Singh") | Photographed QC / production registers | Tester names handwritten — TO BE CONFIRMED |
| Training attendees (6 names) + Shail Patel (CEO) | Training - Yrl (1).doc; SOC signature | Departments TO BE CONFIRMED |
| Log-sheet layouts (columns, bands, specimen rows) | Photographed registers §9–§13 | Code-driven registry, not stored data |

## Full "TO BE CONFIRMED" list (single reference)

1. Exact spelling of the checker/verifier name ("Roshni").
2. ~~Response vocabulary for Daily Monitoring checkpoints (OK/NOT OK header text vs. Yes/No
   actual usage)~~ — **RESOLVED**: Yes/No throughout, confirmed against the source a second time
   (see §1 above).
3. ~~Daily Monitoring holiday calendar (which dates are non-working days).~~ — **RESOLVED**: the
   Gujarat Print Pack Leave Calendar 2026 is loaded (see §16).
4. PC‑10's floor designation.
5. Format No. / Revision No. for: Service Report (all variants), GAP report, Chemical Chart,
   Training Certificate, SOP, and the **Process Parameter Record** (hidden under the clip in the
   photograph — see §12).
6. Whether Mosquito Control needs its own standalone Service Report document.
7. ~~Whether Service Report material/qty/method is meant to be logged once per visit or per
   area.~~ — **RESOLVED**: Material/Method are fixed per area (pre-filled, not re-entered); Qty is
   entered once per material — on the first line, carried by every line with that material — and
   Remarks per area per visit (see §5 above).
8. ~~Training cadence (no source-stated recurrence).~~ — **RESOLVED** as Yearly (see §15).
9. Rodent Bait Station master list / numbering scheme (explicitly missing per the GAP report).
10. ~~Exact source of the company's existing "Rodent Catch Report" numbers (see section 8
    above).~~ — **RESOLVED** 13-Sep-2026: "GP-3 Trend Analysis - 2025.pdf", which also supplied
    the lizard and flies pages. Transcribed in `src/data/seed/trendReports.ts` (§41). One cell
    to confirm: that file reports 2025 to October and leaves Nov/Dec blank, while the earlier
    "Kapila mam department reports .pdf" gives the complete 2025 (Nov 0, Dec 0, Total 2) and
    Jan–Jun 2026. The complete transcription is kept, since it agrees with the new file on
    every cell the new file fills — say so if the Oct-2025 snapshot is wanted verbatim instead.
11. Full names / spelling of the lamination QC testers ("Jeni" day shift, "Singh" night shift) and
    the departments of the six training attendees.
12. Adhesive / hardener batch numbers on the Process Parameter specimen (best-effort handwriting
    reads `B35007107` / `44000N0301`) and the Layer 2 film type suffix on F-PRD-18 ("MetPET …").
13. Whether the Process Parameter and ALC reports should be one record per **shift** (as on paper)
    rather than one per day with a Shift field — trivially changed to three daily variants
    (`variantKey` A/B/C) if so.
14. Whether the QC inspection records (F/QC/34, /35, /37) and F/QC/13 should be one record per
    **lot / job** rather than one per production day (currently Daily so they are prepared in advance;
    a second lot on the same day is added from the Day View). Also the Rev/date of F/QC/13, and
    proof-reading of its Gujarati transcription.
15. Full names of the QA inspectors signing as "Harsh", "Pooja P", "S.V.M." and "HNP".
16. Who approves customer complaint checklists (F/MKT/05) — activity 31 says "QA Head", so the app
    defaults the Approved By designation to that; the actual person's name is whoever verifies.
17. **How much of the Rat / Mice round is baited rather than glue-boarded.** The Dec-2023 and
    April-2026 specimens bait ONE area (First floor - Offline punching & QC Inspection) with
    Bromadiolone Cake and glue-board the other fifteen, which is what the app pre-fills
    (`src/engine/serviceMaterials.ts`, AREA_OVERRIDES). The March-2026 specimen supplied on
    13-Sep-2026 ("Service Report- March 2026.xls — 1st Service-Rcs") baits EIGHT: rows 9–16,
    Offline punching & QC Inspection through Canteen, at 50 gramms, with rows 1–8 on Glue Board
    at 3. Left as it is rather than changed on one specimen — the field is editable per area and
    per visit — but if rows 9–16 are the standing arrangement, that is a one-line change.
18. **Which floor the Ink store is on.** The master list of Rodent Control areas has "Ink store -
    Ground floor" as row 4; the March-2026 specimen prints "First floor - Ink store" in that
    position. Master data, corrected in Master Data → Service Areas once confirmed.
19. **F/HR/08's topic ticks** (§46). The 154 names and designations of the 01.04.2026 ~ 31.03.2027
    Training Need Identification Record are on file; the X marks against the seventeen topics did
    not survive the PDF's text layer unambiguously and are not guessed. The record is seeded
    Submitted with a note to that effect — tick from the paper copy, then verify.
20. **F/HR/09, topic 10's training duration** ("Quality & Product safety Policy + PRP Policies") is
    not legible on the supplied copy — marked TO BE CONFIRMED on the calendar.
21. **F/HR/07's Executive-Lab sheet appears twice** across the two PDFs, near-identically; seeded once.
    Say so if the second is a different position. Also: F/HR/01 is "Reviewed as on 01.10.2026", a
    date after the copy was supplied (14-Sep-2026) — kept as printed; and F/HR/22 prints "Rev. 00"
    without a revision date.
22. **The cadence of the sixteen HR formats** (§46) is this system's assumption — competence review
    1 Oct, skill matrix 1 Sep, TNI and calendar 1 Apr, GMP walk monthly on the 1st, hygiene sheet
    monthly (due month end), survey analysis 31 Jan, the rest as required — since none of the formats
    states one. Each is one line in `documentDefinitions.ts`.
23. **Two HR titles differ between the Master List of Formats and the forms themselves.** F/SYS/02
    (re-supplied 15-Sep-2026) lists F-HR-11 as "Training Evaluation Record" and F-HR-12 as "TRAINING
    EFFECTIVENESS EVALUATION RECORD"; the forms supplied on 14-Sep-2026 print F/HR/11 as "TRAINING
    EFFECTIVENESS EVALUATION RECORD" and F/HR/12 as "TRAINING FEEDBACK & EVALUATION RECORD". The system
    follows the forms, which are the controlled copies. The list also names formats not supplied yet:
    F-HR-02 Personnel competence criteria, F-HR-10 Training Imparted Record, F-HR-15 / F-HR-16 the
    cleaning records.

## How the assistant pre-fills records (and what it never does)

Every record that falls due is prepared by the in-app assistant before the user sees it
(`src/engine/autoFill.ts`, run by `prepareDueRecords()` at app start / on the dashboard / on
login). The rules that keep this honest:

- Values are **carried forward from the user's most recent submitted or verified record** of the
  same document (operator, machine, batch numbers, job list, trap counts, tube-light dates,
  checker names). With no history yet, the **filled specimen** from the source file is used.
- Measured readings (viscosity, hot-room temperature, mix viscosity) follow the plant behaviour
  model in §25 — mostly in control, with the occasional drift episode that takes a reading outside
  the printed band and is flagged for the person to confirm. Machine set-points and weighed set
  quantities are **copied exactly**: the specimen shows the same 3.00 / 2.00 / 45 and the same
  15 / 1.65 / 19.5 row after row, because they are settings, not measurements.
- The assistant **never signs, submits, verifies, or ticks an attendance**. It proposes what the
  plant's own pattern says the day looked like; a person confirms it. Anything the model says went
  wrong is put in the first line of the record's notes ("Check this before you submit…") rather
  than left to be discovered, and CAPA records are still never auto-filled in Live mode — a
  corrective action is a decision, not a routine entry.
- A **blank form never carries a decision**. The Lot Status box on an inspection that has not
  happened yet is empty, not "Accepted" (`isDecisionField`, `src/engine/recordDefaults.ts`).
- Prepared records stay **In Progress** with a visible "Your assistant has filled this in" banner
  listing exactly what was filled and what it was based on. Nothing is Submitted or Verified until
  a logged-in person does it; the login briefing offers one-click "Submit" only after the record
  passes the same validation a manual submit would.

None of these block the Phase‑1 prototype — each is either handled with a clearly-labeled
default/fallback in the UI, or left as an empty, addable Master Data list.
