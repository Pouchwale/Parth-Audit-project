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
- **What is NOT translated, deliberately.** The marks that identify a document and everything written
  into it: format numbers (F/HR/17, F/QC/13, F/MKT/05 …), revision numbers, the company's registered
  name, employee / area / holiday names held as master data, and a record's own contents — the names
  signed, the readings typed, the dates and the remarks. They read exactly as issued in either
  language, and none of them is sent to a translation service.
  **Changed on 19-Sep-2026 (§58):** the documents' own printed WORDS — the instruction lines, the check
  points, the box labels and column headings, the licence's terms, the Statements of Compliance — now
  follow the chosen language, because the department asked for the whole record to be readable in
  Gujarati; and the three formats issued in Gujarati read in English when English is chosen. The
  traceability that matters is kept by the rule above: what a record HOLDS is never rewritten, only the
  words the paper prints.
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
- Covered by `tests/e2e_qc_calibration.py` (**34 checks**): both documents on the QC shelf with their
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

## 53. HR Master Data — the employee master sheet the HR formats fetch from (17-Sep-2026)

```
REQUESTED            "there are many document in HR module ... there is one master excel sheet which you have
                      to create by yourself and in that there are 6 columns which is GP3 No., Joining Date,
                      Full Name, Department, Designation/Position, Date of birth so this sheet will help all
                      other required documents of HR to fill it through fetch ... So basically many document
                      is connected to Master data report so that various document will fetch that data and
                      fill in them and make sure add this in HR Module only"
SOURCE               No supplied document is an employee master. The sheet is set up from the three registers
                      on file that record a joining — F/HR/01, F/HR/03, F/HR/06 (§46).
DIGITAL TEMPLATE     /hr/master-data — src/pages/HrMasterDataPage.tsx; src/engine/hrMaster.ts (the fetch map and
                      its rules); src/data/seed/hrMasterSeed.ts; src/data/repositories/hrMasterRepository.ts;
                      src/utils/xlsx.ts; src/components/records/HrMasterFetch.tsx; src/engine/hrMasterAssistant.ts
```

**THE SHEET, IN THE HR MODULE ONLY.** *HR Master Data* sits in the sidebar under HR Records, straight after
HR Overview, and HR Overview has a button to it. It is laid out as the spreadsheet HR keeps, in exactly the six
columns asked for, in that order: **GP3 No. · Joining Date · Full Name · Department · Designation/Position ·
Date of Birth** (GP3 No. being the employee's number at GP-3).

- Every cell is typed in place and saved as it is left. *Add employee* puts a new line at the end; *Remove*
  takes one off (a line set up from the registers stays off). The sheet searches across all six columns and
  sorts by any of them.
- Counts at the top: employees; without a GP3 No.; without a Date of Birth; lines with a note to confirm; lines
  needing a correction. A line needs a correction when it has no Full Name, a GP3 No. given to someone else too,
  a date that is not a date, or a Date of Birth in the future or not before the Joining Date — flagged on the
  line, with the reason under it.
- It is master data, not a record: the same sheet in Live and Demo mode. It is Human Resources' own — any other
  department's account is refused it by name, has no link to it, and Mitra and Search tell it nothing about the
  people on it (§40).

**HOW IT WAS SET UP.** From F/HR/01 (staff), F/HR/03 (operators) and F/HR/06 (operators / workers inducted),
nothing else:

| Rule | As applied |
|---|---|
| Current employees only | A line on F/HR/01 with a Date of Leaving on or before the register's *reviewed as on* date (01.10.2026), or on F/HR/03 marked *Left*, leaves that person off — from every register (Pooja Prajapati, left per F/HR/01, is not taken from F/HR/06 either). A leaving date still to come keeps the person on, with a note (Fena Modi). |
| One person, one line | Lines on different registers are one person when the names match — or the first names match (one may begin the other: Neel / Neelkumar) and the surnames match or differ by one letter (Bhaach / Bharach). A line that could be two people joins neither. |
| Full Name | The fullest spelling (Sunny Mahesh Singh, not Sunny Singh). |
| Department / Designation | F/HR/01's; else F/HR/06's *joining department & designation*, split at the dash (the part naming a role is the designation: OPERATOR- POUCH → POUCH / OPERATOR); else F/HR/03's process. |
| Joining Date | F/HR/01's, else F/HR/03's, else F/HR/06's — each read in its register's own style (F/HR/01 and F/HR/03 write slashed dates month first, F/HR/06 day first, dotted dates are day first; F/HR/03's two Excel serials read as dates). |
| GP3 No., Date of Birth | Blank: no supplied document has them. |

That gives **115 employees** — 18 of them on two registers — and **17 lines with a note for HR to confirm**:
another spelling of the name on the other register, the registers disagreeing on the date of joining (Azaz
Bharach 6/23/2025 v. 01/06/2025; Vishnubhai Jadhav 12/1/2025 v. 01/11/2025), F/HR/01's 30.02.2020 for Keyur
Sathavara (not a date, so his Joining Date is blank), Fena Modi's leaving date to come. Each line keeps where it
came from ("F/HR/01 line 60 and F/HR/06 line 1"), shown under it with the notes. F/HR/08 and F/HR/13 are not
used: neither records a joining, and F/HR/08's designations run a line out of step for part of the PDF. The other spellings of a merged person are
kept on the line too, so a register that writes "Sunny Singh" is recognised as Sunny Mahesh Singh's line when
fetching.

**EXCEL — OUT AND BACK IN, WITH NO LIBRARY.**

- *Download Excel* gives a real .xlsx workbook, *HR Master Data*: the heading row bold, frozen and filtered;
  GP3 No. held as text (a 0101 keeps its zero); Joining Date and Date of Birth as Excel dates shown
  dd-mmm-yyyy, which read the same whatever Windows' regional setting. It opens in Excel without a repair
  prompt.
- *Upload Excel / CSV* takes the sheet back — as HR saved it from Excel (shared strings, compressed, a title
  line above the headings, any column order), or as a CSV (UTF-8 or Excel's own, comma or semicolon). The
  headings are found by name in the first 30 lines: GP3 No. / Emp No / Employee Code / Token No; Joining Date /
  Date of Joining / DOJ; Full Name / Name / Employee Name; Department / Dept; Designation / Position /
  Designation/Position; Date of Birth / DOB. A date is an Excel date or text (15/08/2026, 01.02.1999,
  01-Apr-2014 — day first).
- Nothing changes until the upload is looked over: what will be added, what updated (each cell's before and
  after), what is already the same, and what is left out and why. A line is matched by its GP3 No., or — when
  it has none, or the number is new and the name is on the sheet without one — by its Full Name. A blank cell in
  the file leaves what the sheet has. A GP3 No. repeated in the file, a name shared by two people on the sheet
  with no number to tell them apart, a line with neither name nor number, are left out with the reason; a date
  that is not a date is named and left out of its line. An old .xls (or a password-protected workbook) is
  refused with how to save it instead.
- A file that writes a GP3 No. without its leading zero (202 for 0202 — a number-formatted Excel column) matches
  that line and leaves the stored number as it is. Slashed dates are read in **one order for the whole file**:
  day first, unless a date in it can only be month first (5/13/1990), and the look-over says which order was
  used; a file that writes them both ways leaves out the dates that could be either.

**TEN HR FORMATS FETCH FROM IT.** Written out once, per format (`HR_MASTER_LINKS`), in each format's own boxes
and style:

| Format | A person is | Filled from the sheet |
|---|---|---|
| F/HR/01 Personal Competence Records | a line | Name of person · Department · Designation · Date of Joining (dd.mm.yyyy) |
| F/HR/03 Skill Matrix – Operator | a line | Name · Designation (Operator) · Date of Joining (m/d/yyyy) |
| F/HR/04 Pre-Employment Medical Health Declaration | the form | Name · Department & Designation ("Department - Designation") · Date of Birth |
| F/HR/05 Induction Training Record — Staff | the form | Name · Department / Process · Designation · Date of Joining |
| F/HR/06 Induction Training Record — Operators | a line | Name of the Operator / EMP · Joining department & designation ("Designation - Department") · Date of Joining & Induction (dd/mm/yyyy) |
| F/HR/08 Training Need Identification | a line | Employee Name · Designation |
| F/HR/11 Training Effectiveness Evaluation | the form | Trainee's Name · Department · Designation |
| F/HR/12 Training Feedback & Evaluation | a line | Name of the Employee |
| F/HR/13 Authorization for Mobile Usage | a line | Employee Name · Department & Designation ("Designation - Department") |
| F/HR/20 Product Safety Culture Survey | the form | Employee name · Department · Designation |

F/HR/06's and F/HR/13's combined box is written designation first, as the CV import has always written it and
as F/HR/13's own lines read ("Manager - HR"); F/HR/04's department first, as its specimen reads. Not fetched:
F/HR/07 (a position, not a person), F/HR/09, 21 and 22 (no one named), F/HR/14 (visitors, who are not
employees), F/HR/19 (only an inspection team). The sheet lists the ten, each with what it fills.

**ON A RECORD.** While an HR record of those ten can be written in, a *Fetch from HR Master Data* bar sits
above its grid (it does not print):

- **A GP3 No. or a name** → *Fetch* on a one-person form, *Add line* on a register. Part of a name offers the
  people it could be; a number or name not on the sheet is said so.
- **Blank boxes are filled straight away. A box that already says something else is never replaced without
  asking**: it is listed with what the sheet has ("Designation: “Supervisor” → “Manager”"), with *Replace*,
  *Fill only the blank boxes* and *Leave it*. A GP3 No. typed where the name goes becomes the name; the same
  name written another way stays as the register wrote it; the same date in another style is the same date.
- **A name box left holding a name (or GP3 No.) on the sheet** fills that person's blank boxes as it is left.
- *Add line* does not give a person a second line; *Fill blanks from the sheet* fills the blank boxes of every
  line (or the form's person) that is on the sheet, and names the names that are not.
- A register line is a person's by their name — only when no one else on the sheet has that name — or by a GP3
  No. in its name box. Of two lines with the name (F/HR/01 has two Anil Ravals), a line with a Date of Leaving is
  passed over; if it is still not clear which line is theirs, nothing is fetched and the lines are named.
- *Replace* works the change out again against the form as it is by then: a box typed into, or a line added or
  removed, after the list was shown is never overwritten by the old list.
- A fetch copies: the record keeps what was fetched if the sheet changes later, as paper would. A submitted or
  verified register shows no bar until *Edit* reopens it for correction — whose *Cancel* puts it back.

**MITRA — ASKS BEFORE IT WRITES.**

| Message | Mitra |
|---|---|
| `open HR master data` · `show the employee master` | opens the sheet |
| `fetch GP3 1024` · `GP3 No. 1024` · `fill from HR master data for Sandeep Parekh` · `add Sandeep Parekh from the employee master` (an HR record open) | lists what would go where, box by box — "Designation: Manager → Assistant" — and asks *Fill these in?*: **Yes, fill it** · **Only the blank boxes** (when something would be replaced) · **No, leave it**. Nothing is written before yes; on a submitted / verified record it says it will reopen it for correction first. Written with a history line ("Fetched from HR Master Data — …") and Undo. |
| part of a name · a name on the sheet twice | the people it could be, one button each |
| a number or name not on the sheet | says so, with the sheet |
| *Fetch from HR Master Data* (quick chip on those records) | asks whose details |
| asked "Employee name?" / "Name?" by its question-by-question fill | a GP3 No. or a name on the sheet answers it and fills the person's other boxes, which are then not asked |
| a fetch with no HR record open (widget or full-page Assistant) | which formats take one, and whether that person is on the sheet; "fill F/HR/05 for GP3 1024" offers to start or open F/HR/05 |
| another department's account | the sheet isn't one of its departments — nothing about the people on it |

A typed "yes", "only the blanks" or "no" answers the question as the buttons do, and "Yes" works the change
out again first — if the record has been edited, submitted or verified since, the new list is shown instead.
"fetch Sandeep Parekh" needs no mention of the sheet on those records, and after *Whose details?* the next
message is the person. A GP3 No. given to the "Employee name?" question that is nobody's on the sheet is asked
again, never written as the name. "open master data" still means the administrator's Master Data. All of it is worked out with no network; the
model's route guide knows /hr/master-data from /master-data.

**THE CV IMPORT (§49) AND SEARCH.** The CV import's form has a *GP3 No.*; a person already on the sheet (by the
name read from the CV, the name typed, or the GP3 No. typed) has the form filled from it, and *Add* puts the new
joiner on the sheet — or brings their line up to date — saying which. The sheet is looked up when the GP3 No. or
Name box is left, never on a half-typed number; a person found later replaces what an earlier one filled in, and
nobody found takes it back out. A GP3 No. that is somebody else's on the sheet is pointed out and Add waits for it
to be corrected — a line on the sheet is never written over under another person's name. Search lists **People — HR Master Data**
by GP3 No. or name, each with *Show on the sheet*; "hr master" offers the sheet.

- Covered by `tests/e2e_hr_master_data.py` (**81 checks**).

### What HR is asked to confirm

1. **GP3 No. and Date of Birth** for every employee — on no supplied document.
2. **The 17 notes** on the sheet — spellings, two joining dates, F/HR/01's 30.02.2020.
3. **The order of F/HR/06's and F/HR/13's combined box.** The printed labels read department first; the
   registers mostly write designation first, and so does the fetch. Say if the labels should win.

## 54. Every document downloads as its own kind of file, and a wide one prints whole (17-Sep-2026)

```
REQUESTED            "there will be like excel and word file also so make sure user will get his own excel and
                      word file which user if download then it will become pdf and that is not applicable to
                      excel sheet and also i want that to make sure when user take print then if there are many
                      columns then it will be also download not only shown in preview"
DIGITAL TEMPLATE     src/utils/documentExport.ts (which kind, and the document on screen as a file),
                      src/utils/docx.ts (Word), src/utils/xlsx.ts (Excel), src/components/common/
                      DownloadDocumentButton.tsx, src/utils/print.ts (fitting to the paper)
```

**DOWNLOAD, IN THE DOCUMENT'S OWN FORMAT.** Until now a document left the app only by Print, whose "Save as PDF"
suits a scanned letter but not a register kept in Excel or a form kept in Word. Every document screen now has a
**Download Excel** or **Download Word** button beside Print — the record page, a format's own page, the CAPA
complaint checklist, the GAP report, the training record, the chemical chart, a statement of compliance, the
daily pest control register and the fly catcher register:

| Downloads as | Documents |
|---|---|
| **Excel (.xlsx)** | what was supplied as a workbook — the GAP report, the three service reports — and every register or log sheet: F/HR/01, 03, 06, 08, 09, 12, 13, 19, 21, 22, the QC and production sheets, the calibration records, the daily pest control register, the fly catcher register |
| **Word (.docx)** | what was supplied as a Word file — the complaint checklist, both statements of compliance, the chemical chart, the training record — and the forms about one person or one position (F/HR/04, 05, 07, 11, 14, 20), the complaint acknowledgement, the service agreement, the responsibilities |
| **PDF (Print)** | the service licence, held as the provider's own scanned PDF — no download button; Print as before |

- The file is the document as it is on screen, filled in as it is: the header block (company, title, Format No.,
  Rev No., Date, Page No.), the form's boxes as label / value pairs, its grid as a table with a heading row, the
  ticks as ☑ / ☐. Buttons, hints and anything that does not print are left out.
- **Excel**: headings bold and shaded, cells bordered and wrapped, dates as real Excel dates, readings as numbers,
  columns sized to what is in them; a sheet of more than six columns is set to print landscape, one page wide.
- **Word**: the title centred, the boxes as a two-column table, the grid as a bordered table whose heading row
  repeats on every page; a grid of more than six columns (or any table of more than eight) turns the page to
  landscape, and a very wide grid uses a smaller type.
- Named for the document: "F-HR-01 Personal Competence Records (Staff Members Only) 17-Sep-2026.xlsx". Made in
  the browser with no library and no network, like the HR Master Data workbook (§53).

**PRINT FITS THE PAPER.** A grid wider than the page ran off the right-hand edge of A4: the print preview scrolled
and the saved PDF was cut, losing every column past the edge (F/HR/09's 29 columns, F/HR/01's ten). Now, before
anything prints — from a Print button or Ctrl+P — the narrowest each document's tables can be laid out is
measured:

| The document needs | It prints |
|---|---|
| no more than a portrait page | portrait, as it is |
| up to a fifth more than a portrait page (F/HR/05, F/HR/04) | portrait, scaled to fit — never below 80% |
| more than that (F/HR/01, F/HR/09, the QC sheets) | **landscape**, scaled to fit if it still needs to be |

Every column is on the paper and in the PDF; the screen is put back when printing ends.

- Covered by `tests/e2e_downloads_and_print.py` (**21 checks**).

## 55. The whole project's data in PostgreSQL, and nowhere else (17-Sep-2026)

```
REQUESTED            "make sure i want my whole project database will be in postgres only not any other else"
BEFORE               accounts and the digest log in SQLite (backend/data/app.db); everything else — records,
                      documents, master data, HR Master Data, settings — in each browser's localStorage
DIGITAL TEMPLATE     backend/db.ts (PostgreSQL: schema, accounts, digest log, stored items, the local server,
                      the SQLite import), backend/index.ts (/api/storage), frontend/src/data/serverSync.ts,
                      frontend/src/data/storageAdapter.ts, frontend/src/main.tsx, store/AuthContext.tsx,
                      data/repositories/settingsRepository.ts, data/seed/documentDepartments.ts,
                      scripts/run-e2e.ts, scripts/db-stop.ts
```

**ONE DATABASE.** Everything the system keeps is in PostgreSQL:

| Table | What |
|---|---|
| `users` | the accounts (moved from SQLite) |
| `digest_log` | the last date a reminder digest went out (moved from SQLite) |
| `app_storage` | all of the app's data, one row per stored item — the company's: `records`, `documents`, `master`, `hrMasterData`, `referenceEdits`, `deletions`, `live-start` (the date the system went live); each person's own: `settings`, `assistant-conversations`, `sidebar-open-modules`, `sidebar-visible`. No other items, and only JSON, are accepted |

SQLite is gone from the server; the browser's storage is no longer where anything is kept. The only
thing left in a browser alone is where the assistant bubble was dragged to on that screen.

**HOW THE APP USES IT.** Every screen reads and writes as it did (the repositories are unchanged), on a
working copy that is kept in step with the database:

- **Signing in** loads the person's data — the company's items and their own — from the database, and
  only then does the app start. If the database cannot be reached the app says so, with *Try again*,
  instead of opening on a copy that may be out of date (and instead of the sign-in screen, when it is
  the server that does not answer). Signing out and in again in the same tab starts from the
  database's copy — never from what the page held before, which would write it back over what others
  did in between. A browser that kept records from before the database merges them in at its first
  sign-in; they are never thrown away.
- **A change** shows at once and is written to the database a moment later.
- **Other people's work** arrives every five seconds (and when the window comes back into focus) and the
  screen redraws — somebody editing HR Master Data sees a colleague's line change without reloading.
- **Two people at once**: a write made from an out-of-date copy is refused by the database and merged
  against the copy both started from — what only one side changed is kept, a line deleted on one side
  and untouched on the other stays deleted, a line both changed keeps the later version — then written
  again. Records and HR Master Data lines go by id; master data, document definitions, reference edits
  and settings field by field; a save made while the request was out is part of the merge. Two browsers
  opening a new month at once do not list its blank records twice. Neither person loses their change.
- **A change the database could not take** stays on the computer, is sent again every few seconds, and
  a banner says so until it has gone. One still on its way when the page was closed is sent at the next
  sign-in.
- **Settings are a person's own**: one person switching to Gujarati or to Demo Mode no longer switches
  anyone else. A person's own change left unsent on a shared computer is kept aside for them — never
  sent as the next person's.
- **The date the system went live is the company's** (`live-start`): the records are shared, so the
  floor that decides which of them are real obligations is the same for everyone, and the earliest date
  anyone knows of stands. A person signing in for the first time can no longer make the plant's real
  overdue work look like pre-launch noise to be cleaned up.
- **A department's account gets its department's records** (§40, now enforced by the server): only
  the records and deletions-log lines of its departments' documents, and HR Master Data only with Human
  Resources; what it writes replaces only its own departments' lines. When the administrator changes an
  account's departments, a copy made for the old ones is refused and merged first — a department just
  added is never wiped — and the account's open page loads again for its new departments. A change
  somebody else left unsent is kept for whoever may send it. An automatic preparation by the assistant
  never overwrites a person's change to the same record. A tab left open for one account after the
  browser signed in as another stops writing as the first.
- **A session that ran out** goes back to the sign-in screen instead of a banner that never clears.
- **A database reset or restored from a backup** is noticed by the pages left open (their copy is newer
  than the database's), which load again from it instead of writing their old copy back.
- **The browser's room**: the working copy still lives in the browser's storage, which is limited. When
  it no longer fits, the database is never overwritten from an incomplete copy — the save says so, and
  signing in says "no room" instead of starting on part of the data.

**WHERE THE DATABASE IS.** `DATABASE_URL` names it (a deployment's own PostgreSQL). Without one, the
server starts a PostgreSQL of its own on the machine (the `embedded-postgres` package: real PostgreSQL
18 binaries, no installation), data in `backend/data/postgres` — so `npm start` still needs nothing but
Node.js. That PostgreSQL is started with `pg_ctl` as a process of its own, in the background and **with no
window of its own** (19-Sep-2026: on Windows a black console window used to open beside `npm run dev` and had
to be left open — closing it killed the database; one terminal is now everything): it keeps running when the
server stops (a second server may be using it), is reused by the next start only if it is this app's
own, and `npm run db:stop` shuts it down cleanly. A failed start quotes PostgreSQL's own log. The
database must be UTF8 (the records hold Gujarati and dashes); the server refuses any other. An install with the old SQLite file has its accounts copied in on first start (the file is then
renamed `app.db.imported`); records in a browser's storage go up the first time somebody signs in there.

**TESTS.** The runner starts a PostgreSQL of its own for each run (a temporary cluster, thrown away
after, stopped with a clean shutdown even when a suite fails or the run is interrupted), and empties
`app_storage` before each suite — as each suite used to start from a fresh browser.
`npm run test:e2e -- tests/<suite>.py` runs chosen suites only.

- Covered by `tests/e2e_postgres_storage.py` (**34 checks**), and by every other suite, which now
  runs against PostgreSQL.

## 56. Fast and smooth on a low-end computer (17-Sep-2026)

```
REQUESTED            "make whole project thing very good ui and response like that very smooth and fast functioning
                      of everything so even if someone is using on low ending laptop or computer so this project run
                      in their computer very fast and smoothly without any error or taking load for any page"
                      — and: remove "Answers cover this record system only — not general questions. Conversations
                      are saved in this browser." from the assistant
DIGITAL TEMPLATE     utils/useProgressive.ts, components/records/LogSheetRecordView.tsx, pages/HrMasterDataPage.tsx,
                      pages/FileBrowserPage.tsx, pages/SearchPage.tsx, data/repositories/recordRepository.ts,
                      data/serverSync.ts, data/demoGenerator.ts, data/seed/hrMasterSeed.ts, backend/index.ts,
                      frontend/scripts/build.ts
```

**MEASURED, NOT GUESSED.** Every page was timed in Chromium with the processor slowed six times — about a
low-end office laptop — with the plant's data, and again with a full year of demo records (4.5 million
characters of records). What made pages slow was found by profiling, and fixed at the cause:

| Page / action (6× slower processor) | Before | After |
|---|---|---|
| HR · Skill Matrix | 3.9 s | 0.2–0.7 s |
| HR · Training Calendar | 1.7 s | 0.4–0.5 s |
| HR · Master Data | 2.5 s | 0.4–1.0 s |
| HR · Competence (year of data) | 1.4 s | 0.25 s |
| Document Files (year of data) | 2.6 s | 0.8 s |
| Generating a demo year | 8.5 s | 1.0 s |
| Opening the app to the sign-in screen | 2.1 s | 1.1–1.5 s |

- **A read-only sheet is text.** A register that cannot be written on (the preview under every HR format, a
  submitted or verified record) showed each value in a greyed-out box, and each choice box carried all of its
  options: the Skill Matrix alone built 21,000 page elements. It now shows the same values as text.
- **Long lists appear at once.** A long sheet, the HR Master Data sheet and a month of files show their first
  lines immediately and add the rest a batch at a time at low priority, so the page can be read and used while
  it fills, and typing is never held up. A line added afterwards shows at once; printing always has every line.
- **No repeated work.** One document's records are looked up directly instead of scanning every record for each
  question; folder counts, duplicate GP3 checks and the demo year are worked out in one pass; the search index is
  kept while the records are unchanged; the HR Master Data starting sheet is built when first needed, not while
  the app loads; the calendar redraws the app only when it actually made new records.
- **Syncing never freezes the screen.** A large stored item is fingerprinted from its length and samples instead
  of reading every character on each sync; while a page is open, changes are told by comparing with the copy in
  memory.
- **Less over the network.** The app's script is sent compressed (1.2 MB → 276 KB), and the stored data travels
  compressed both ways (the records shrink about tenfold) — a save over the office network is a fraction of the
  upload.

**THE ASSISTANT'S FOOTER** now reads only "The assistant never submits or verifies anything by itself." — the
line about general questions, and the one saying conversations are saved in the browser (they are in the
database, §55), are gone, in English and Gujarati.

## 57. Quality Control's own formats, as the department supplied them (18-Sep-2026)

```
REQUESTED            "from now onwards i will give you all documents which you have put in QC Module and make
                      sure each and every document will be editable and bot will perform task according to user
                      query. SO do this make sure add each and every document which i have shared with you
                      properly without any error."
SOURCE DOCUMENTS     31 PDFs and 2 photographed Gujarati forms, supplied 18-Sep-2026 (listed below)
DIGITAL TEMPLATE     data/seed/documentDefinitions.ts (the thirty-two definitions and QC_SECTIONS),
                      data/seed/qcIncomingLayouts.ts, qcLineClearanceLayouts.ts,
                      qcGujaratiLineClearanceLayouts.ts, qcRegisterLayouts.ts, qcCoaLayouts.ts,
                      qcReportLayouts.ts, and the supplied pages in qcRegisterRecords.ts, qcCoaRecords.ts,
                      qcReportRecords.ts
```

**THIRTY-TWO FORMATS, ALL IN THE QUALITY CONTROL MODULE.** The module now holds thirty-eight documents,
shelved in the department's own seven sections. Every one of them is a full record: it opens on a page of
its own, it can be filled in, corrected and printed, it downloads as the kind of file it reads as, the
assistant can fill it or be asked for it by name or by format number, and it is scoped to Quality Control.

| Section | Formats |
|---|---|
| In-Process & Inspection | F/QC/13 (Gujarati in-process control), F/QC/34, F/QC/35, F/QC/37 — already on file |
| Incoming Material Inspection | F/QC/01 BOPP film · F/QC/02 corrugated box · F/QC/03 label stock · F/QC/04 paper core · F/QC/05 PVC / PET film · F/QC/18 offset ink · F/QC/19 duplex board · F/QC/20 kraft paper & white top liner · F/QC/21 flexo ink · F/QC/21 lamination film adhesive · F/QC/22 side pasting adhesive · F/QC/23 corrugation starch powder · F/QC/24 sheet pasting powder |
| Line Clearance | F/QC/15-A printing · F/QC/15-C QC machine inspection · F/QC/15-D QC manual inspection · F/QC/15-E slitting · F/QC/15-F shrink sleeve gluing · F/QC/15-G shrink sleeve cutting · the two Gujarati clearance checklists (materials and quality) |
| Calibration | F/QC/08 master list of calibration instruments (new) · F/QC/11 and F/QC/12 — already on file (§51) |
| Certificates of Analysis | F/QC/06 label · F/QC/07 shrink sleeves · F/QC/25 corrugated boxes |
| Registers & Records | F/QC/16 register of obsolete artwork · F/QC/20 printing aids destruction record · F: QA/PRO/FL/CCT/01 camera challenge test · F-QC-19 Beiersdorf tolerance card |
| Analysis & Meetings | F/QC/29 analysis report · F/QC/29 utility test report · F/QC/30 minutes of meetings |

**HOW EACH SHAPE IS REPRODUCED.** Every label, specification and printed word is the paper's own, including
its spellings ("RELEAE LINER THICKNES", "APPERANCE.", "BRUSTING", "COADING", "Shrinkage Ration").

- **An incoming material inspection record** prints the four-line header box (supplier, product, GRN quantity,
  report number, batch number, GRN number, date of inspection), then its test parameters with their
  specifications printed and the observation typed beside each — three sample columns instead of one on the
  corrugated box and the paper core — and the footer's four lot statuses (accepted, reject and send back to
  the supplier or scrap, segregation, accepted on deviation), the reason for a deviation, and the QA
  inspector's and QA manager's signatures.
- **A line clearance report** is a register: one line per job change, with the twelve columns the form prints
  and, above them, the area's own clearance checklist (the printing one's numbering jumps from (5) to (7) —
  kept as printed).
- **The two Gujarati checklists** print their processes — printing, punching, quality checking, label
  slitting — with the material or the parameter on each line and the operator's sign, QA's tick and QA's
  sign beside it. The paper merges the process cell down its lines; a grid repeats it on each.
- **A certificate of analysis** is a certificate of blocks, not a grid: the client and the order, what was
  specified and what was tested, the printing colours as the grid's lines, the coating, the finishing and the
  retest date, with the printed tolerance block kept as reference. It downloads as Word, as do the analysis
  report, the minutes of a meeting and the tolerance card.
- **The tolerance card** reproduces the card's panels and their approval boxes; the sample labels mounted on
  the physical card are not reproducible.

**THE PAGES THAT CAME FILLED IN ARE ON FILE** as real records, read cell for cell: the thirteen obsolete
artworks of January and February 2022; the printing aids destroyed on 01-Jun-2022; the label certificate of
04-Jan-2022 (Weener Empire, Dr. fixit 301, order 33858, six colours); the shrink sleeve certificate (The
Unjha Pharmacy, Narogi Churana, order 33814); the PSL analysis of 07-Jan-2022; the nine Nivea utility tests
of 02-Dec-2022; and the Gangwal Healthcare meeting of 07-Jun-2022 with its seven points.

**TO BE CONFIRMED with the MR** (added to the list below):

1. **Five format numbers are each carried by two formats.** F/QC/19 — duplex board inspection and the
   Beiersdorf tolerance card. F/QC/20 — kraft paper inspection and the printing aids destruction record.
   F/QC/21 — lamination film adhesive (Rev 01, 16.02.2022) and flexo ink (Rev 00, 01.04.2023). F/QC/29 —
   the analysis report and the Nivea utility test report (the latter typed on the Minutes of Meetings form).
   F/QC/30 — the minutes of meetings, while the company's master list gives F-QC-30 to the Lamination
   Adhesive Viscosity Record already on file. Both of each pair are held as supplied.
2. **F/QC/15-B was not supplied** — the area line clearance series here runs A, C, D, E, F and G.
3. **The two Gujarati clearance checklists print no format number** and no revision.
4. **The three certificates of analysis print no revision number**; the corrugated one carries an older
   document number instead, QA-IP-TRFCBA-011-00-01-09-18 (2009 edition).
5. **The camera challenge test is numbered as a QA procedure**, F: QA/PRO/FL/CCT/01, not as an F/QC format.
6. **The utility test report's date reads "02/12/20222"** — five digits; filed under 02-Dec-2022.
7. **The shrink sleeve certificate carries no COA date and no retest date**, and a loose "White" appears
   beside its five printed colours.
8. **The obsolete artwork register's own Sr. No. runs 1–7, then 9, then 8, then 10–13** — the lines are held
   in the order the page prints them.
9. **Two things on the scans cannot be reproduced**: the photograph of the label roll under the PSL analysis,
   and the sample labels mounted on the tolerance card.
10. **F/QC/13's grade chart repeats two cells.** On the Coating row, the C and F cells read word for word the
    same as the Shade row's C and F ("small variations are seen in the logo and the process colours", "moderate
    variations in the logo colour and major variations in the other colours") — they describe colour, not
    coating. Transcribed as the photograph reads; worth checking against the paper, and if the paper prints
    different Coating wording, that wording needs its own two lines here and in `i18n/documentTextEn.ts`
    (found on 19-Sep-2026 while rendering the form's English, §58).

- Covered by `tests/e2e_qc_formats.py` (**42 checks**), and by every suite that walks the whole
  library: each new format is started, filled by the assistant and print-checked with the rest.

## 58. QC Records, and the language every document reads in (19-Sep-2026)

```
REQUESTED            "i dedicated QC module in all types of documents of all different department are
                      there present same as HR overview which you have created i want document according
                      to Format number - Name of that document also there are many document which are
                      Gujarati so i need that what the user select from language option in side of today's
                      breifing button so if selected english then every in that should be tarnslate in
                      English and if selected Gujarati then everything with all document should be
                      Gujarati which google translate will do"
DIGITAL TEMPLATE     src/pages/QcPages.tsx and src/data/seed/qcModule.ts (QC Records at /qc),
                      src/i18n/documentText.ts and src/i18n/documentTextEn.ts (the documents' language),
                      src/components/documents/DocumentHeader.tsx (what is never translated)
```

**QC RECORDS — /qc.** Quality Control's collection is the largest in the app, and until now the only way
into it was the Document Library filtered to the module. It now has its own page, laid out exactly the way
HR Records is (§47): one card per section of the department's paperwork, and in it every format the way the
department asks for it — **its format number, then its name** — with what is on file, what is next due, and
a click straight onto that format's own page. A format the paper carries no number for is listed by name
alone, saying underneath that no format number is printed on it, rather than heading the row with a
placeholder.

| The page holds | |
|---|---|
| The department's seven sections | In-Process & Inspection · Incoming Material Inspection · Line Clearance · Calibration · Certificates of Analysis · Registers & Records · Analysis & Meetings |
| Its two departments | Of the forty-three rows, thirty-three are headed Quality Control and ten Quality Assurance — the module's own eight (the four in-process and inspection records, the three certificates of analysis and the camera challenge test) and the two Statements of Compliance — and each row says which |
| Forty-three formats | the module's thirty-eight, and the five of Quality Control's that other modules keep, listed last under the module that keeps them so nothing of the department's is missing: F-QC-30 viscosity, F-QC-32 adhesive mixing and F-QC-40.C hot room in the Lamination module, and the two Statements of Compliance, F/QC-09 for pressure labels and F/QC-38 for flexible packaging, in the Compliance module |
| Each row | `F/QC/01 - Inspection Record - BOPP Film`, with the department, the frequency, and — for the three formats issued in Gujarati — that they are Gujarati forms |

What each card holds is read from the document definitions themselves (`data/seed/qcModule.ts`), so a format
added to the module appears here the same day, in its section, with no page to edit. The sidebar reaches it
above the library link, and it is offered only to somebody who can see at least one of the formats (§40).
The assistant opens it by name — "QC records", "the QC module", "quality control documents".

Two notes on what the page says. The department beside each format is the one **printed on the form**, which
is why ten of them read Quality Assurance; who may open them is decided by their F/QC numbers, and those
put all forty-three in Quality Control's hands (`data/seed/documentDepartments.ts`), so somebody kept to
Quality Assurance alone is refused this page by name like any other outsider (§40). And the whole page is
read from the definitions: the nine cards are the department's seven sections plus the two modules that
keep its other formats, and a format shelved in the module without one of the seven would get a tenth card
of its own, Other Quality Control Records, rather than disappearing.

**THE LANGUAGE BOX NOW DECIDES THE DOCUMENTS TOO.** The box beside Today's Briefing used to change the
screens and deliberately leave every controlled document exactly as issued (§24). The department asked for
the opposite, and this is what it now does:

- **ગુજરાતી chosen** — the whole page goes to Google's website translator, the forms and registers
  included: printed instructions, box labels, column headings, the parameter and material lines a form
  prints down its side, the licence's terms, the Statements of Compliance. A form already printed in
  Gujarati is already in the chosen language.
- **English chosen** — Google is not loaded at all, so the three formats the department issues **in
  Gujarati** would otherwise sit in Gujarati on an English screen. Their English is written down
  (`i18n/documentTextEn.ts`) rather than fetched: F/QC/13's three instruction paragraphs, its labels, its
  six parameters with the test chart beside each and its whole grade chart, and both line clearance
  checklists — every printed line, rendered once and checked line by line against the paper.

**WHAT IS STILL NEVER TRANSLATED, IN EITHER LANGUAGE.** The marks that identify a document and everything
written into it: the format number, the revision number, the company's registered name, and a record's own
contents — the names signed, the readings typed, the dates, the remarks. They carry `translate="no"` where
they are shown, so an auditor reads exactly what was written and none of it is sent to a translation
service. The same holds for master data (employees, chemicals, machines, areas) and the audit trail (who
submitted, verified or corrected a record). Boxes being typed into are never touched either — a browser
does not translate what is inside an input — so the protection is needed exactly where a written value is
shown as TEXT, and that is where it is:

- a read-only cell on any log sheet (`components/records/LogSheetRecordView.tsx`);
- the written values on the complaint acknowledgement, the service agreement and the responsibilities
  sheet (`components/records/FormField.tsx`), which takes a `translatable` flag for the two blocks that
  are the paper's own printed wording rather than somebody's answer — the letter's opening and its
  acknowledgement, the printed responsibilities and clauses;
- the complaint report's printed mark, its format reference and the person it is addressed to;
- the checker, the time of checking, the typed notes and the observation lines of the daily pest control
  register (`components/records/DailyRegisterSheet.tsx`), and the names that signed the fly catcher
  register with the catcher numbers and the areas they hang in;
- a service report's chemical and method of application, which are the Chemical Master's own words, and
  the provider / plant / address block it is headed with;
- the insecticide licence's registration and licence numbers, its dates, its seal, the officer who signed
  it and the issuing office's stamp (`pages/LicencePage.tsx`), while its terms and conditions translate;
- the Statement of Compliance's format and revision line, and the company's registered name above it;
- the trend sheets' company name and the Source / Unit / Target Pest cells transcribed from the
  provider's own report;
- the format number, the revision and the people responsible, under every document's name
  (`DocMeta` in `pages/PestControlPages.tsx`).

**A RECORD IS NOT CHANGED BY BEING READ IN ANOTHER LANGUAGE.** Only the words the paper prints are
swapped, and only on screen: the field KEYS a record is stored under never change, so a line typed on the
Gujarati clearance checklist stays exactly as typed and reads the same on the paper it prints on. Printing
and downloading follow the screen, so a sheet printed while English is chosen prints in English and one
printed in Gujarati prints in Gujarati. The AUDIT TRAIL is deliberately left in the issued words: a
correction recorded on a Gujarati form names the box the way the form was issued, whichever language it
happened to be read in, so two people correcting the same box in different languages leave the same entry
in the record's history. The assistant, on the other hand, asks its questions in the language the form is
being read in — those questions are screen text, not record content.

- Covered by `tests/e2e_qc_formats.py` (QC Records and the Gujarati formats in English) and
  `tests/e2e_translate.py` (the documents translated with the page, the marks that identify them left as
  issued).

## 59. The paper carries the document, not the browser's date and time (19-Sep-2026)

```
REQUESTED            "i need to remove the time and date when user take print of any document"
DIGITAL TEMPLATE     src/styles.css (@page and the print block), src/utils/print.ts
```

A browser prints its own header and footer around whatever it is given: Chrome and Edge put the **date and
the time** in the top left, the screen's title top right, the address at the foot and "1 / 3" beside it.
On a controlled record every one of those is wrong — a printed F/HR/17 is the register itself, and the date
in its corner is the day somebody pressed Print, not the day the register records. An auditor holding the
sheet has no way to tell the two apart.

**THE PAGE NOW TAKES NO MARGIN.** There is no way to switch a browser's header off from the page; what
decides whether it prints is whether there is a margin to print it in. So `@page` asks for A4 with
`margin: 0`, and the 12 mm the paper used to keep is moved onto the documents themselves. A register and a
complaint report are built of page sections, one printed page each, so the margin goes on those and every
page of them keeps it; every other document takes it on itself. The printout is the same size on the paper
as it was before — what has gone is the line of browser text above and below it.

This also covers the address of the screen it was printed from (`localhost:8842/index.html#/record/…`),
which had no business on a controlled record either.

- Covered by `tests/e2e_print_and_forms.py`: the page rule carries no margin, a printed document keeps the
  12 mm for itself, and every page of a register keeps it without the register adding a second one.

## 60. Mitra opens with the document, beside it, and offers the task (19-Sep-2026)

```
REQUESTED            "whenever user tell or open any document then bot will open in sidebar and perform the task"
DIGITAL TEMPLATE     src/components/common/DocumentAssistant.tsx, src/styles.css (".assistant-dock")
```

**IT OPENS BY ITSELF.** Whenever a document is opened — a record, a format's own page, a statement of
compliance, the chemical master — by a click, a link, or because Mitra was told to open it, the assistant
opens with it. A record page hands over its live record; a format's own page (`/document/{id}`,
`/hr/{slug}`) is known from the address. The one page it waits to be asked on is the Service Provider
Licence: a scan with nothing to fill, which opens with a question of its own — the agreement reminder (§33)
— that Mitra should not talk over.

**IN A SIDE PANEL, NOT OVER THE PAGE.** Open, Mitra is docked down the right-hand side and the page gives up
that width, so the document and the chat about it sit side by side and nothing on the form is covered (the
floating card used to sit exactly where most tables keep their Open buttons). Closed, it is the same pill as
before, draggable anywhere. On a narrow screen there is no width to give, so the panel lies over the page. It
never prints.

**AND SAYS WHAT IT CAN DO, WITH THE FIRST STEP AS A BUTTON.**

| What was opened | What Mitra says and offers |
|---|---|
| A blank record | that it is open and still blank — *Fill it in with me* (one question at a time, each answer saved), *Fill it with sample data*, *Tell me what to fill…* |
| A record part done | how many answers are on it — *Carry on filling it with me* |
| A record fully answered | to check it over — *Submit this record* |
| A submitted or verified record | that nothing is left to fill — *Correct this record…* (reopens with the reason), *Verify*, *Print* |
| A format's own page | what is on file and the latest — *Start today's record and fill it with me* (starts it, opens it and asks the first question), *Start today's with sample data*, *Open the latest* |
| A reference document | what it is, who keeps it and when |

A task already asked for — "I want to fill the fly catcher record" said in the library, a fresh complaint
checklist's walk-through — is simply carried on with; nothing is added to it. Nothing is ever submitted
without being asked.

**ONCE PER DOCUMENT, AND IT GOES AS IT CAME.** Mitra comes forward once for each document in a sitting, so
closing the panel on a record is respected until a different document is opened. A panel that opened itself
and was never spoken to closes again when the document is left — the dashboard, the calendar and the lists
are not covered by a chat nobody asked for. Say or tap anything and it stays.

- Covered by `tests/e2e_qc_formats.py`: the panel opening by itself, docked, with the page making room;
  naming the document and offering today's record; one tap starting the record and asking the first
  question; a record opened directly offering the fill; the pill back on the dashboard when it was left
  untouched; and a record already greeted not being interrupted twice. (6 checks)

## 61. The calibration records work their deviation out (19-Sep-2026)

```
REQUESTED            "when user enter weights for example 200.04 gm ... deviation will come there automatically by
                      calculating weights and tested value ... many time in mg and sometimes in gm ... don't put
                      deviation value to only 0 percent ... whenever user enter or even tell bot to do so ...
                      likewise in MONTHLY INTERNAL CALIBRATION RECORDS – GSM CUTTING PLATE ... there is no
                      acceptable tolerance ... index present for example 20 x 20 and deviation come automatically"
DIGITAL TEMPLATE     src/engine/calibration.ts, the `computed` Deviation % columns of
                      src/data/seed/qcCalibrationLayouts.ts, applied in src/pages/RecordPage.tsx
```

§51 added the two formats and left the arithmetic for later, as asked then. This is the arithmetic.

**F/QC/12 — WEIGHT SCALE.** For each of the five weights, Deviation % = (tested value − weight) ÷ weight × 100.
The figures are read in the unit they are written in — `0.050mg`, `200.04 gm`, `0.2 kg` — so a weight in gm
against a tested value in mg is compared properly, and a figure written bare takes the unit of the one beside
it. 200.000gm tested at 200.04 gm is **0.02%**; nothing is forced to 0%. **Pass / Fail follows the sheet's own
Acceptable Tolerance**: every deviation within it is Pass, any one over it turns the line Fail by itself, and
back again when the figure is corrected.

**F/QC/11 — GSM CUTTING PLATE.** The form has no tolerance; it has the plate's size at the head of each column
— 20 x 20cm, 10 x 10cm, 5 x 5cm, 2.5 x 2.5cm. The deviation is the measured plate against that size **by area**,
because area is what a GSM plate is for: No. 54 measured 20.1 x 20cm is **0.5%**. A single figure is read as
the side of a square plate. The Pass/Fail and Sign lines have nothing to work out and stay the tester's.

**WHOEVER WRITES THE FIGURE.** It is done on the record's data, not in the grid, so it is the same for a
person typing into the sheet, for Mitra told "row 1 tested value 4 is 200.06 gm", and for sample data. The
Deviation % columns are marked `computed`: they show as text, cannot be typed into, are not asked about in
Mitra's question-by-question fill, and anything sent for them is dropped. A figure that cannot be read as a
number leaves its deviation blank rather than guessing.

- Covered by `tests/e2e_qc_calibration.py`: the cells not typable; 200.04 gm giving 0.02% on the sheet and in
  the record, Pass; 200400 mg read in its own unit as 0.2%, Fail by itself; the same told to Mitra (0.03%,
  Pass again); the GSM plate's 0.5% by area and 0% at its own size, with nothing on its Pass/Fail and Sign lines.

## 62. Reviewed before submitted, formats that can be revised, named accounts, the activity log, the season (19-Sep-2026)

```
REQUESTED            "in today's briefing add validation if user has review and verified and only user can submit it
                      ... in rodent and fly and lizard trend analysis ... 4 or 2 in 6 months ... according to climate
                      ... in rainy and winter season there is more flies and lizards than summer ... each and every
                      document must be editable like if i want to add any column or cell or if format change so
                      likewise rev number will also change ... ids ... Kapila Barad for QC module and for HR Module
                      Vinay Bhojak and Sandeep Parekh ... super admin will have all module access ... i want log
                      for all activity happening on this portal"
DIGITAL TEMPLATE     components/common/AssistantBriefingPopup.tsx; engine/rodentPattern.ts, engine/lizardPattern.ts;
                      data/formatEdits.ts, components/documents/FormatEditor.tsx; backend/index.ts (the named
                      accounts, /api/activity, /api/auth/change-password), backend/db.ts (activity_log);
                      utils/activityLog.ts, pages/ActivityLogPage.tsx
```

**1. TODAY'S BRIEFING SUBMITS NOTHING UNSEEN.** The records under "Filled in and ready for your OK" are ones
Mitra filled in. Each now carries a tick, **Reviewed & verified**, and its Submit is disabled until the person
ticks it; the button over the list reads "Submit N reviewed", covers the ticked records only, and is disabled at
none. View opens the record to look at it. The tick is for the sitting: a record prepared again tomorrow is
looked at again.

**2. THE TRENDS FOLLOW THE PLANT'S OWN SEASON.**
- *Rodents.* The department's figure is restated as **two to four in six months** (it was three to four a year,
  §45). Each half of the year now has its own quota of two to four, each catch in a month of its own, chosen by
  the monsoon-leaning weighting — so a year holds four to eight, never clustered.
- *Flies.* Already as described: busiest in the rains, busy again in winter, quietest in the dry summer
  (`FLY_MONTHLY_FACTOR`, August 1.0 · January 0.8 · May 0.34). A stale comment that said "near-empty boards in
  winter" is corrected.
- *Lizards.* The report held only the two years the provider reported (three in 2024, three to November 2025),
  so the current year had no row. A year the provider has not reported is now planned the way the rodent year
  is — three to six, placed by a weighting that puts the rains first, winter next and the dry summer last — to
  the month that has been reached and no further. Its row is headed **"Seasonal pattern — not yet reported by the
  service provider"** and the sheet's footnote says so, so it is never read as the provider's count; the
  provider's figures, once entered, take its place.

**3. ANY FORMAT CAN BE CHANGED, AND ITS REVISION CHANGES WITH IT.** *Edit format* is on every format's own
page and on every line of the Document Library. On a log sheet it renames the format; adds, renames, retypes,
reorders or removes the boxes above and below the grid and the grid's columns; rewords the printed
instructions; and adds, rewords or removes the lines a form prints down its side. **Saving raises the revision
number (01 → 02), dates it today, and records who changed what and why** — a reason is required — and that
list is the format's change history, shown with the issued revision at its foot. *Restore the issued format*
puts the paper's own transcription back.
- The issued formats stay in the code and are put back at every start-up (which is how a newly digitized form
  reaches a browser that already used the app), so a change is kept **beside** them under its own key,
  `formatEdits`, in PostgreSQL like everything else, and laid over the definition and the layout wherever they
  are read. It therefore survives a re-seed, a reload and another person's browser.
- **Records already on file are untouched.** A record keeps every value under the key it was written with: a
  column taken off the format is simply not drawn, one added is blank on older records. Keys are never renamed
  or reused — a new box gets a new key (one that carries the moment it was made, §64), and renaming a box
  changes only its label.
- The forms the program draws by hand — the daily pest register, the fly catcher register, the service
  reports, the complaint forms, the licence — have their **name and revision** changed here; their grid is
  code, so a change to it is a change to the program, and the editor says so.

**4. THE PLANT'S NAMED ACCOUNTS**, added once at start-up if they are not there, never touched if they are:

| Account | Signs in as | Sees |
|---|---|---|
| Super Admin | `admin@gpp.local` | every module; assigns everybody else's departments; reads the whole activity log |
| Kapila Barad | `kapila.barad@gpp.local` | Quality Control's documents only |
| Vinay Bhojak | `vinay.bhojak@gpp.local` | Human Resources' documents only |
| Sandeep Parekh | `sandeep.parekh@gpp.local` | Human Resources' documents only |

They start on one password (`SEED_ACCOUNT_PASSWORD`, otherwise `Gpp@12345` — and on the built-in one the
system now *requires* the change before the account can be used, §66), so each person's first act is
**Change password** — their own name in the top bar. The addresses are sign-in names on a domain that does not
exist, so no mail is ever sent to them. The department rule is the one already in force (§40), enforced by the
server as well as the screen: a QC account is handed only QC's records, and another department's page refuses
by name. `SEED_ACCOUNTS=0` leaves them out, which the test runner does because its first signup has to be the
administrator.

**5. THE ACTIVITY LOG.** Everything done on the portal is one line in a PostgreSQL table, `activity_log`, that
is only ever added to: signing in and out and a sign-in that failed, an account created, a password changed or
refused, department access changed (written by the server, where they happen); and a document or record
opened, a record started, edited, edited through Mitra, submitted, verified, sent back, reopened, deleted, a
document printed or downloaded, a format changed or restored (sent by the app as they happen). **Who and when
are stamped by the server from the session**, never taken from the browser, so nobody can write a line in
another name. Demo data and what the system does by itself at start-up are not logged — nobody did them — and an
autosave folded into the edit before it is one line, not thirty. The Activity Log page shows it newest first,
searchable, with a CSV export: the super admin reads every line, an account kept to departments reads its own
and its departments'.

- Covered by `tests/e2e_portal_controls.py` (**30 checks**): the briefing gate; a format changed with its
  revision, reason, reload and restore, a record taking a value in the new column, a program-drawn form
  offering name and revision only; the log holding the account, the opening, the record, the format change and
  the password change without the password; the password change itself; the lizard year and how it is headed.
  The named accounts are checked against the real database at start-up rather than in the suite, which runs
  with them off.

## 63. An eye beside every password box (19-Sep-2026)

```
REQUESTED            "in password for both signup and login add eye button so user can see what he is entering"
DIGITAL TEMPLATE     src/components/common/PasswordInput.tsx, used by components/auth/LoginForm.tsx,
                      components/auth/SignupForm.tsx and components/common/ChangePasswordDialog.tsx
```

Every password box — signing in, both boxes when signing up, and the three of Change password (§62) — has an
eye at its right-hand end. Pressed, the box shows what has been typed, so a person can check it before signing
in rather than find out from "Invalid email or password"; pressed again it is dots again, with nothing lost.
Each box has its own eye and starts hidden, so showing the password does not also show its confirmation.

- The eye is a plain button, never a submit: showing a password cannot send the form, and Enter in the box
  still signs in.
- The box keeps its own id, name and autocomplete, so its label, the browser's password manager and everything
  that finds it by id are unchanged. The box leaves room for the eye, so a long password never runs under it,
  and Edge's built-in eye is switched off so there are not two.
- It says what it will do next — "Show password" / "Hide password" — for a screen reader and as its tooltip.

- Covered by `tests/e2e_portal_controls.py`: a box starting hidden with its eye; the eye showing that box only;
  what it announces; the form not being sent; hiding again with nothing lost; the eye on all three boxes of
  Change password; and the sign-in form. (7 checks)

## 64. A format designed on the sheet, changed by telling Mitra, reacted to with emojis, and scored (19-Sep-2026)

```
REQUESTED            "each and every document has various option in which user can create similar column, row and
                      whatever in whole document he want to edit ... make sure to show pop up also and make system
                      very super intelligent which does whatever task the user need to do manually ... my user can
                      write what he want to do, create anything, add anything in any document or delete anything
                      which might be any row, column, cells ... when user click on edit button then he should like
                      word file in ms word or ms excel ... without opening anything in his system ... bot will give
                      reactions on timely activity is complete or not through emojis ... separate dashboard which
                      give score to Kapila, HR's and module wise who is responsible for their document and decision
                      will be taken on basis of what assigned task is done on time or not"
DIGITAL TEMPLATE     engine/formatOps.ts (the operations, and the one way a change is saved), engine/designSession.ts,
                      components/documents/SheetDesigner.tsx, pages/DocumentRecordsPage.tsx; engine/formatCommands.ts,
                      engine/recordRowCommands.ts, components/common/DocumentAssistant.tsx; engine/reactions.ts,
                      components/common/MitraReaction.tsx, engine/recordLifecycle.ts; engine/performance.ts,
                      pages/PerformancePage.tsx, backend/index.ts (GET /api/users/directory); store/router.tsx
                      (setLeaveGuard)
```

**1. EDIT FORMAT OPENS THE SHEET ITSELF, AND THE SHEET IS EDITED LIKE A SPREADSHEET.** On every log sheet —
every format whose grid is drawn from a layout — *Edit format* no longer opens a dialog of lists, whether it
is pressed on the format's own page or on its line of the Document Library (which goes to that page). The page
turns into the sheet as it prints: header block, printed instructions, the boxes above the grid, the grid, the
boxes below. Everything on it is changed where it stands:
- **A name is clicked and typed over** — the format's name, the instructions, a box, a column heading. A
  printed cell of a form that prints its lines is a text box in its place.
- **Every column heading, every box and every printed line has a small menu**: insert to the left / right
  (above / below for a line), **duplicate** — "create a similar column" is one click, with a printed column's
  words copied down its lines — move, delete; and for a column or a box, what it takes (Text, Number, Date,
  Time, Yes / No, Choice with its choices) and whether it is required. A printed line has no type to set; a
  column the form prints, or one the sheet works out, has its type and Required locked; the last column cannot
  be deleted. A copy of a printed column on a sheet that does not print its lines is an ordinary column, so it
  can be written in.
- **A toolbar that stays in view**: + Column, + Box above, + Box below, + Line (only on a form that prints its
  lines), **Undo** and **Redo**
  (also Ctrl+Z / Ctrl+Y, a hundred steps), how many changes the sheet holds, Save, Discard, and *More
  options…*, which is the §62 dialog (revision number typed by hand, the change history, Restore the issued
  format) — offered only while the sheet holds no unsaved change, so the two never save over each other.
- **Pop-ups say what is about to happen.** Deleting asks first and says, in plain words, that records already
  on file keep what was written. **Save** lists every change in words, shows the revision it will become
  (02 → 03) and requires a reason; then a second pop-up confirms "Saved as Rev 03, dated …, by …". Discard
  lists what would be thrown away.
- **Leaving with unsaved changes asks first** — closing the tab, and equally the sidebar, a Back button, the
  browser's own Back or Forward, Mitra opening another page, and **Log out** (`setLeaveGuard` / `confirmLeave`
  in store/router.tsx). A browser Back that is agreed to stays a Back: nothing is added to the tab's history,
  so the next Back goes where it always would have. While a sheet is being designed the page offers no *New
  record* beside it, and Mitra starts no record until the leave is agreed. The one thing that cannot ask is a
  session the server has ended.
- Nothing reaches the stored format or any record until Save, and Save is the same one road as §62
  (`commitFormatChange`): next revision, dated today, who / what / why, one line in the activity log, kept in
  PostgreSQL under `formatEdits`.
- **A key is never reused — not across revisions, not after a restore.** A new box or column's key carries the
  moment it was made (`remarks_mfk2p9c0`), so taking "Remarks" off in Rev 02 and adding a "Remarks" in Rev 03
  cannot make old values reappear under the new heading. The label is all anybody sees.
- Two people designing the same format at the same moment: what each changed is merged item by item the way
  all shared data is (data/serverSync.ts), and every entry of the change history carries an id so both
  entries — each with its who / what / why — stay in it. Saved within the same few seconds they can carry the
  same revision number; the history shows both.
- The forms the program draws by hand (§62.3) keep the dialog: their name and revision are what can change.
- The designer draws its own sheet rather than threading design controls through the view every record is read
  with, so no record page pays for it (§56); the names on it read as stored in either language (§58), because
  the value shown is the very value being typed over.

**2. OR THE PERSON JUST SAYS IT TO MITRA.** Typed or spoken, read with no network and no model:

| Said | Done |
|---|---|
| "add a column Batch No. after Remarks" · "insert a number column Weight before Result" | column added, where asked, of the type asked |
| "add a box Shift above the grid" · "add a field Checked by below the grid" | box added above / below |
| "duplicate the Remarks column" · "add another column like Result" | copy beside it, "Remarks (2)" |
| "rename Remarks to Remarks / Action" · "rename this format to …" | label only — the key stays |
| "make Result a choice of Pass, Fail" · "make Batch No. required" | type changed; Required for a COLUMN (a box's is set on the sheet) |
| "move Batch No. to the left" · "move Shift to the end" | reordered |
| "delete the box Serial No" · "remove the last column" | removed from the format |
| "add a line Printing / Special ink" · "delete line 3" · "change line 2 to …" · "rename the line Special ink to Special inks" | the lines a form PRINTS — only on a form that prints them; rewording is of the line's name |
| "add 3 rows" · "delete the last row" · "duplicate row 2" · "clear row 4" · "clear the Remarks of row 2" | the OPEN RECORD's own lines, on a sheet whose lines a person writes |

- **It asks first, in the chat**: "I will add a column Batch No. after Remarks on F/QC/12 …. That makes it Rev
  03, dated today, in your name, with your words as the reason. Records already on file are not touched …
  Shall I save it?" — with *Yes, save as Rev 03* and *No, leave it* beside it. A bare "yes" / "ok" typed or
  spoken does the same; "ok, but put it before Remarks" is a new instruction and sets the question aside. Yes
  saves through the same one road, the sentence as its reason. The offer lapses the moment the conversation moves on, so a stale Yes can never save
  a change nobody is looking at.
- **With the designer open it does not ask and does not save**: the change lands on the sheet in front of the
  person as one more undoable step — a delete too, Undo being the way back — and is saved with everything
  else: one revision, not two (engine/designSession.ts).
- Not while Mitra is asking question by question or walking through a checklist: what is typed then is the
  answer to the question on screen. Say "stop" first.
- **It never guesses.** A thing is found by the words printed on the form, whatever the case or punctuation,
  and by the English reading of a Gujarati form. More than one match and it asks which, with the completed
  sentences to tap; no match and it says what the sheet does have. "Row" means the format only where the form
  prints its lines; everywhere else it is the record's. A value — "row 2 line speed is 90" — is still §57's.
- A row command changes the open record at once and offers **Undo**; on a submitted record it goes through the
  existing "Yes, correct it" reopen; the lines a form prints (`minRows`) are kept; a printed or worked-out cell
  is never cleared.
- Mitra's chips on a format's page offer **Change this format…**, which puts two example sentences in the box.

**3. MITRA REACTS, WITH AN EMOJI, TO WORK DONE ON TIME OR LATE.** Whenever a record is submitted, verified or
sent back — by hand, from the briefing or through Mitra — a toast appears bottom-left for six seconds, on the
screen of the person who did it, and the open chat says the same (when Mitra did the submitting itself the
chat keeps Mitra's own words and only the toast is added):

| What happened | Reaction |
|---|---|
| submitted on or before its due date | 🎉 "… submitted on time." |
| submitted N days after it | ⏰ "… submitted N days late." |
| an as-required record (no due date to be late for) | ✅ "… submitted." |
| submitted again after a correction | ✅ "… submitted again, put right." — it is judged by its FIRST submission, here and on the scorecard |
| verified | ✅ "… verified." |
| sent back | ↩️ "… sent back — *the reason*" |
| …and nothing else of theirs is due or overdue | 🌟 "That was the last one due today." as a second line |

The words come from one pure function (`reactionFor`), so the toast and the chat cannot disagree; the format
number, the date and a typed reason are shown as written (§58). The reaction is worked out after the record is
stored and can never stop a submit. More than five submitted at once from Today's Briefing are said as one;
up to five are shown one after another.
Demo records and what the system does by itself get no reaction — nobody did them.

**4. THE PERFORMANCE SCORECARD — `/performance`, in the sidebar under Activity Log.** One question is asked of
every record that fell due in the period — *was it handed in on time?* — and added up four ways: **by person**
(cards: Kapila Barad, Vinay Bhojak, Sandeep Parekh and every other account), **by department**, **by module**
and **by document**, worst first. Because people are judged by it, the rule is one line and is printed on the
page:

> on time counts 1, late counts ½, never done counts 0 —
> score = 100 × (on time + ½ × late) ÷ (on time + late + never done)

| Score | Grade |
|---|---|
| 90 – 100 | 🌟 Excellent |
| 75 – 89 | ✅ On track |
| 50 – 74 | ⚠️ Needs attention |
| below 50 | 🔴 Falling behind |
| nothing due | ➖ Nothing was due |

- **The decision is a sentence built from the numbers**, naming the record it turns on: "28 of 46 on time, 8
  late, 10 never done — needs attention; the oldest never done is F/QC/12 of 09-Sep." (score 70). The grade is
  the score and nothing else: a record never done lowers it, it does not cap it. A person's card also lists up
  to three of their documents with something late or never done.
- **What would make it unfair is left out**: a weekly off or festival holiday, the daily register's
  H O L I D A Y line, reference documents, a record not due yet (shown as "still to come", never counted), and
  the blank shells from before the system went live. An **as-required** record has no schedule, so it gets
  **two days** from the date it is for — and the last of them is never a day the plant was closed: the
  allowance runs on to the next open day. (A record dated back to last week is therefore late: the event was
  last week.)
- **On time is judged by the FIRST submission** in the record's history, so a record put right later is not
  turned into a late one; the count of days is the same one Mitra's "N days late" uses.
- **Who answers for a record**: the accounts kept to the department that owns its document. Where a department
  has two accounts (HR), a record handed in counts for whoever handed it in, and one nobody handed in — or one
  handed in by somebody outside the department — counts for both, because it was each one's to do. An account
  with no departments (the administrator, management) is listed without a score.
- A document's line opens that format's own page; the scorecard **exports as CSV** and **prints alone**.
- **Four periods**: this month, last month, the last 3 months, this year. Demo Mode scores the demo records,
  Live the live ones, like every other page.
- **Who sees what**: the names come from `GET /api/users/directory`, which returns id, name, role and
  departments — never an email or a hash. The administrator and an account with no departments see everybody; a
  department account sees the accounts that share a department with it, and only its own documents' scores —
  so a colleague who also answers for another department is scored there from part of their work, and the
  card and the CSV say so ("Also answers for …, outside your departments").
- The page reads and never writes. Live records exist only for the months somebody has opened (the app creates
  a month's shells on first visit), so a month nobody has looked at has nothing due rather than everything
  missed; the Dashboard and Calendar open the current month for everyone daily, which is what keeps it honest.
- One pass over the records builds all four scorecards, worked out once per change, and the long tables are
  drawn progressively (the low-end standard of §57).
- Mitra knows the page through the assistant's model — "open the scorecard", "who is late", "how is Kapila
  doing" (backend/assistant.ts ROUTE_GUIDE); unlike the sentences of part 2 this needs the network.

**Also put right on the way.** In Demo Mode a department's account took every other department's demo record
for missing and wrote it again on each visit (data/demoGenerator.ts read the stored demo records through the
department filter); it now reads them unscoped, like the documents beside it.

- Covered by `tests/e2e_sheet_designer.py`, `tests/e2e_mitra_format.py` and `tests/e2e_performance.py`, and by
  `tests/e2e_portal_controls.py`, which now reaches the §62 dialog through *More options…*.

## 65. The company's own mark, no Demo Mode in the portal, and a colleague's work never saved over (23-Sep-2026)

```
REQUESTED            "remove demo mode also and also remove :- Human Resources & Pest Control · Lamination QC &
                      Production · Compliance from sidebar in below of Gujarat print pack publications pvt ltd ...
                      i have shared logo with you so attach that logo in project so it will look like professional
                      ... also remove process flow in below of ask mitra and also remove uncessary file which
                      project are not using and make whole applcation archiecture very optimistic and can run in
                      low ending devices also without any lags or wrong data anywhere also remove this line from
                      dashboard:- Gujarat Printpack Publication Pvt. Ltd. — Pest Control · Lamination QC &
                      Production · Compliance"
DIGITAL TEMPLATE     frontend/public/brand/* (the mark the company sent), frontend/index.html,
                      components/layout/Sidebar.tsx, components/auth/AuthLayout.tsx, pages/DashboardPage.tsx;
                      backend/features.ts + frontend/src/engine/features.ts (what this server has switched on),
                      store/AuthContext.tsx, components/layout/Topbar.tsx, data/bootstrap.ts;
                      pages/RecordPage.tsx (a colleague's work is never saved over),
                      data/storageAdapter.ts (readJSONCached, measureWorkingCopy), utils/useEnsureMonth.ts
```

**1. THE COMPANY'S OWN MARK, AND ONLY THE COMPANY'S NAME UNDER IT.** The mark the company sent is in the
sidebar as a 40 px tile beside the title, above the title on the sign-in and sign-up screens at 72 px, and in
the browser's tab, its bookmarks and a phone's home screen (`frontend/public/brand/`, four files: the icon
itself and the three sizes the screens draw). The sidebar's second line is now **the company's name alone** —
the list of modules that used to follow it said what the sidebar itself already shows — and the Dashboard's
date line ends at the day, its own copy of that list gone. The sign-in screen names the company and says in
one plain line what the system is for. The tab reads "Digital Controlled Record System — Gujarat Printpack
Publication".
- **No mark on the paper.** Nothing about a printed record changed: the shell is `no-print` and printing is
  scoped to the document (§35), so a record still prints as the company's own form and nothing else.
- The name reads as written in either language (§58); the tile is drawn at twice its size so it is sharp on a
  good screen, with its width and height given so no line moves as it loads.

**2. PROCESS FLOW IS GONE** — the sidebar entry under Ask Mitra, the page, the route, its strings. An old
bookmark to it lands on "Page not found", and Mitra cannot navigate there (`isValidAppRoute`).

**3. DEMO MODE IS NOT PART OF THE PORTAL.** The portal is going into real use, so nobody using it can reach a
screen of made-up records: no switch in the top bar, no sidebar entry, no page, no banner, no watermark, and
`#/demo` typed into the address bar is not a route. Mitra is never told the page exists.
- **What decides is the server, not the browser.** `DEMO_MODE=1` on the server that is started switches it on;
  anything else leaves it off (`backend/features.ts`). The answer the app already waits for before it draws
  anything — who is signed in — carries `features: { demoMode }`, and every screen reads it synchronously
  (`frontend/src/engine/features.ts`). Nothing a person does in a browser can turn it on: a stored setting
  that says "demo" is read as Live, and `setMode("demo")` does nothing.
- **Only the switch went.** A record's `isDemo` field, the pages' filters and the behaviour model the demo
  generator shares with the Live pre-fill (`engine/plantSimulation.ts`, the rodent, fly and lizard patterns of
  §62) are exactly as they were: that model is what makes a real record read like a real plant's.
- **Why it stays at all:** the year of synthetic records is what five of the Playwright suites stand on
  (`e2e_smoke`, `e2e_realism`, `e2e_files`, `e2e_performance`, `e2e_trend_reports`), so `scripts/run-e2e.ts`
  gives its server `DEMO_MODE=1` and those suites are unchanged.
- **The demo records an earlier version left behind go.** No screen lists them any more, and a year of them is
  most of what a slow computer parses and sends. So once the server has *said* this installation has no Demo
  Mode, start-up makes the same one call the Demo Mode page's "Clear All Demo Data" made: it matches
  `isDemo === true` and nothing else, so a Live record is never touched, and the merge keeps a line removed
  here and untouched elsewhere removed (§55). **Take a backup before the first start without `DEMO_MODE=1`** —
  the removal happens on that first sign-in and is not undone.
- Every sentence that named Demo Mode — the Files empty hint, the HR master sheet's note, the "no room"
  screen, the storage banner's advice — names it only where it exists.

**4. A COLLEAGUE'S WORK IS NEVER SAVED OVER.** A record's page held the copy it opened with and saved that
copy back. So if a record sat open and idle on one computer while somebody else filled a cell in it, submitted
it or verified it, the next keystroke here wrote the old copy over their work — in this browser and, through
the merge, in the database, with no 409 and no warning. (The other three record pages already re-read before
saving; this one did not.)
- **Every save now starts from the record as it is stored**, carrying only what is being typed here, so the
  other person's history line, status and stamps survive and the change is recorded with a name on it.
- **Every button acts on the record as stored.** Submitted, verified, reopened or deleted elsewhere in the
  meantime, the press does nothing to it: the page shows the record as it now stands and says so in a plain
  banner. A record deleted elsewhere is never brought back by a save.
- **What arrives while nothing is being typed is simply shown.** While something typed is still waiting for the
  autosave nothing is taken away; the save a moment later decides.
- Honestly: where two people change **different cells of the same sheet in the same moment**, the later save
  still wins the sheet. There is no cell-by-cell merge of two people's typing, and the record's history shows
  what happened.

**5. THE LOW-END STANDARD, MEASURED AND MENDED** (§56, §57 — pages are measured at 6× CPU throttle).
- **The documents list, the master data and the HR master sheet are parsed once per stored value**, not once
  per lookup (`readJSONCached`, in the manner of `data/formatEdits.ts`). They were asked for dozens of times a
  screen — the Chemical tab of Reports did it once per record of the month, 297 parses of 53 KB — and each was
  a full parse. The copy is remembered against the **raw stored string**, so anything that replaces the item —
  a save, another tab, a colleague's work arriving, a different person signing in — is parsed afresh; it can
  never answer with anything but what is stored. Every reader is handed the same object, so it is frozen all
  the way down: a change made to it throws where it is made instead of quietly showing every later reader
  something that was never stored. Whoever means to change what it read takes a copy of its own.
- **Typing no longer waits for the whole year to be written out again.** Saving a record meant turning EVERY
  record into text — 4.7 million characters with a year on file, 38 ms here and nearer a quarter of a second
  on a low-end laptop — and it happened at every pause in typing, while the person was still typing. Yet one
  record had changed. Each record's own text is now remembered against that record's identity and the pieces
  joined: 38 ms becomes 4 ms, and what is stored is character-for-character what it was before, which it must
  be — the version markers, the merge and the database all read it. It is only right while no record is ever
  altered in place, so **every save re-reads one record for real**, a different one each time: a record altered
  in place is found within a few saves, the whole array is written properly, and the terminal says which record
  it was. (One record is about 1.5 KB — nothing beside the 4.7 MB it saves.)
- **A daily format's page no longer draws a year of lines at once.** F/QC/13 and F/QC/34 were the two that
  were noticed, at about 2.9 s against a second elsewhere, but every daily format was the same: a table line
  per record on file — 255 by September, some 5,200 elements, each measured again by the browser to size the
  columns. The lines are now drawn forty at once and sixty a frame, like every other long list; every COUNT on
  the page still comes from the whole list, so nothing shown is ever short. **Mitra's panel now opens within
  the first layout** rather than after it, so the page is laid out once instead of twice and no longer jumps as
  it settles.
- **Today's Briefing works itself out when it is shown**, not on every change of anything while it is closed —
  which is nearly always. It walks every format's records, validates every prepared one and then works out
  every reminder: 19 ms with a month on file, 0.1 s on a slow laptop, none of it drawn. The one thing the
  closed popup needs is whether anything is still pending, and only in the evening slot, so it asks at the
  minute it fires.
- **A month of Document Files is drawn progressively when its folder is opened.** A folder that starts closed
  used to build all of its lines in one go — nearly three hundred on a busy month — because the list was
  handed to the progressive count as empty and it rightly settled as "everything is shown".
- **A hidden tab asks the database for nothing.** A pull that finds a colleague's work parses the whole records
  item, about half a second on a low-end laptop, and a tab nobody was looking at did that every time anybody
  saved anything. It catches up the moment it is looked at again, and it still SENDS what it has of its own.
  Only one pull ever runs at a time, and one asked for while another is in flight follows it rather than being
  dropped.
- **A month's due sheets are made in an effect, not while the page draws** (`utils/useEnsureMonth.ts`). The
  pages used to run the generator from inside a render on every change of anything: a generator pass per
  keystroke saved anywhere in the app, a write to storage from a render React may throw away, and nothing
  redrawn afterwards, so the bell and the briefing stayed a step behind the records they had just made. The
  Chemical tab of Reports likewise asked the documents list once per record of the month; it asks once.
- **The browser says it is filling up before it is full.** A browser gives the app about five million
  characters, and a year of records comes close; past it a save does not fit and the working copy cannot be
  loaded at all. The size is added up once at start-up — no timer — and above four million the banner says so
  plainly, months before the wall, while there is still time to archive. (Measured on this installation on
  19-Sep-2026: 3,741 records, 4.84 million characters, of which about 4 MB are blank "Due" sheets from before
  the go-live date that Today's Briefing offers to clear in one click.)

**6. NOTHING UNUSED IS KEPT.** Every one of the 213 source files is reached from an entry point, every
dependency is imported by something, and every `npm run` target exists — checked by building the import graph
from `main.tsx`, `backend/index.ts` and the scripts, then grepping each basename for a reference by string.
What went: `frontend/src/components/calendar/` (an empty folder), and two sizes of the mark that nothing
draws. What stays, and why: `tools/pest_pattern.py` and `tools/plant_pattern.py` generate the seeded behaviour
model; `tests/visual_qa.py` and `tests/e2e_assistant_chat.py` are run by hand; `source-documents/` is the
company's own originals.

- Covered by `tests/e2e_no_demo_mode.py` (a suite of its own, against a **second server on :8843** started
  without the test flags — the product as a plant gets it): no switch in the top bar, no sidebar entry, `#/demo`
  not a route, a stored setting of "demo" read as Live, `features.demoMode` false, and no screen with the word
  anywhere on it. The branding and the record-page fix are covered by the suites that already read the sidebar,
  the sign-in screen and a record being filled.

## 66. A login-only portal: the administrator makes every account (23-Sep-2026)

```
REQUESTED            "keep login portal only for now for superadmin and everyone else also and in superadmin keep
                      one access like for example i will access to all QC documents to kapila barad like wise i
                      will only give access to anyone from superadmin according so they will login and continue
                      there work."
DIGITAL TEMPLATE     backend/features.ts (ALLOW_SIGNUP), backend/index.ts (GET /api/auth/config, POST /api/users,
                      /api/users/:id/password, /api/users/:id/active, the password gate in requireAuth),
                      backend/db.ts (must_change_password, active, last_sign_in); pages/UsersPage.tsx,
                      components/auth/AuthScreen.tsx + LoginForm.tsx, components/common/ChangePasswordDialog.tsx,
                      store/AuthContext.tsx, main.tsx
```

**1. THERE IS NO WAY IN BUT SIGNING IN.** The sign-in screen has no *Create account* tab, no link and no route:
it says, where the link used to be, that **accounts are created by the administrator**. The server refuses
registration as well — `POST /api/auth/signup` answers 403 whatever is sent, and the attempt is a line in the
activity log — so the screen is a courtesy and the rule is the server's. An empty database is refused too: a
closed portal can never hand the first caller an administrator's account.
- The sign-in screen has to know this before anybody is signed in, so there is one public question,
  `GET /api/auth/config`, which answers what the server has switched on **and nothing about anybody** — no
  account, no name, not even how many there are.
- `ALLOW_SIGNUP=1` opens it again: `scripts/run-e2e.ts` sets it (all 28 suites begin by signing themselves up),
  and it is how a first administrator is made on an empty database if the seeded accounts were left out. A
  server with no account, no seeded accounts and no sign-up says so loudly at start-up, with the two ways to
  put it right, rather than leaving somebody at a screen that refuses everything.

**2. USERS & ACCESS — `/users`, in the sidebar for the administrator alone.** On one screen:
- **Add a person**: their name, the address they sign in with, a first password (with the eye of §63, and
  *Suggest one* for a password that can be read down a telephone), and **what they see** — *Every module*, or a
  tick per department with the number of documents each owns beside it, so "all of Quality Control to Kapila
  Barad" is one tick. The account is always **staff**: there is one super admin, and the role is not read from
  the request at all, so asking for an administrator's account gets an ordinary one.
- **The accounts**, each with their name, sign-in address, role, what they see in words, when they last signed
  in, and whether they are active, still on their first password, or switched off.
- **Reset password**: the administrator types or suggests another temporary one. The old one stops working at
  once and the person chooses their own at the next sign-in.
- **Switch off** somebody who has left: they cannot sign in — told plainly why, not that their password is
  wrong — and whatever they have open stops working at its next request, because every request reads the
  account afresh rather than trusting the session. **Nothing is ever deleted**: their name stays on every
  record they signed, and the account can be switched on again. The administrator cannot switch off the
  account they are signed in with.
- Each of those asks first, in a pop-up that says what will happen. **A password is typed here and never seen
  again**: not read back, not returned by any endpoint, and not in the activity log — what the log says is
  that a password was set, and by whom.
- **The screen is never the lock.** Every one of these endpoints is refused by the server for anybody who is
  not the administrator, so a member of staff who types `/users` is refused by the page *and* by the server.
- Which departments an existing account sees is still changed in **Master Data → Departments & access** (§40).

**3. THE FIRST PASSWORD IS THEIRS TO CHOOSE.** An account made by the administrator — and a seeded account
still on the **built-in** password, which is written in this documentation — must be given a password of its
own before it can be used. At that sign-in the app shows nothing but the dialog: it cannot be dismissed by the
cross, by Escape or by clicking beside it, it says why, and signing out is the only other way on. **The server
holds the door, not the dialog**: that session is refused every data endpoint with
`password-change-required` until the password is changed, while `/api/auth/*` stays open so it *can* be
changed. The new password must differ from the one they were given.
- A seeded account on a password the administrator chose themselves (`SEED_ACCOUNT_PASSWORD`) is left alone —
  it was never published. **The four accounts already in use are not affected**: the two columns were added to
  a table in use with defaults that leave every existing row exactly as it was.

- Covered by `tests/e2e_login_only.py` (**45 checks**), against the same product server on :8843 as §65: the
  screen with no way to register and the server's 403; the administrator's page and a member of staff refused
  it by the page and by the server; a person added with Quality Control ticked, and the same address refused a
  second time; her forced first password — the pop-up that will not be waved away, the records refused until
  she has chosen, the one she was given refused as her own; then Quality Control's documents open to her and
  Human Resources refused by name; a reset that stops her chosen password working; her account switched off,
  the plain reason, and switched on again; and every one of those in the activity log with no password
  anywhere in it.

## 67. Mitra asks first, about work that is yours, and the chat comes alive (23-Sep-2026)

```
REQUESTED            "now brought some animations when user click on ask mistra which is our chatbot it should be
                      first ask and make whole interface interactive like when user come on it and open it then bot
                      will first ask what user want to and make whole chatbot very interactive like user can feel it
                      happy to use bot will also make sure about pop ups of various documents according to concern
                      person so i want happy chatbot and happy user."
DIGITAL TEMPLATE     engine/assistantPersona.ts (openingMessage, WaitingDocument),
                      components/common/DocumentAssistant.tsx (the greeting on every open, waitingForMe, the pill's
                      count), i18n/strings.ts, styles.css (the movement, and switching it off)
```

**1. MITRA ASKS FIRST — EVERY TIME IT IS OPENED.** It always had a question to open with (§50), but only while
the chat was still empty: a person who had said anything at all was met by silence ever after, opened the panel
and had to work out for themselves what to do next. The question now comes **every time the panel is opened**,
and it is the same one a colleague would ask — *Where would you like to go?* — with the answers as buttons.
- It never talks over anything. A walk-through or a question-by-question fill in progress, a format change
  waiting for its Yes, or a document's own arrival greeting (§60) all mean Mitra has already said the useful
  thing, and it stays quiet.
- Asked once per opening, not once per render: closing the panel is what arms the question again.

**2. AND IT ASKS ABOUT WORK THAT IS THEIRS.** The opening now names what is waiting for **that person** — the
documents their department keeps *and* Master Data names them on, as the checker, the verifier or the
technician — with the **three that have waited longest** offered as one-tap buttons:

> Good afternoon, Kapila — Mitra here, your records buddy.
> 3 of your documents are waiting, 1 of them overdue.
> Where would you like to go?
> [ Open F/QC/01 Line Clearance Check… ] [ Open F-QC-30 Lamination Adhesive… ] …

- **Somebody nobody is named on answers for the plant**, not for a list of their own — the administrator, the
  MR, QA — so Mitra says "The plant has 176 documents waiting" rather than calling it theirs. Accurate instead
  of accusing.
- **Nothing waiting is worth saying too**: "Nothing of yours is waiting — the file is clean. 🌿"
- **The closed pill carries the figure** — *Ask Mitra · 3* — so it can be seen without opening anything. A
  number, not a red dot: "3" says something, a dot only nags.
- Worked out **when the panel opens**, and for the pill when it closes or the day turns — never while drawing.
  Mitra is mounted on every screen, and working out the reminders walks every format's records (§65).

**3. THE CHAT MOVES LIKE SOMETHING ALIVE.** All of it in the stylesheet, all of it short:
- the **panel slides in** from its own edge as it opens, rather than appearing;
- each **message rises into place** as it is said — Mitra's from its side, the person's from theirs;
- **answers lift** under the pointer and press back down when used;
- **Mitra's face pulses** while it is thinking, so being busy can be seen without reading;
- the **pill lifts** under the pointer, and **waves two or three times** when work is waiting — then stops,
  because a thing that never stops moving is a thing people learn to ignore.

**WHAT IS DELIBERATELY NOT ANIMATED: the page's own width.** The page makes room for the panel in one step. To
slide that margin instead would re-measure every line of a long table on every frame — the exact cost §65 was
written to remove. Every movement here is opacity and transform, which a browser hands to the graphics card,
and each is 120–200 ms.

**ANYBODY WHO HAS ASKED FOR LESS MOVEMENT GETS NONE OF IT** (`prefers-reduced-motion`), and Mitra still says
every word it would have said. That block sits at the **end** of the stylesheet on purpose: a media query adds
no specificity, so it has to come after the rules it switches off. Written further up — which is where it
started — the cascade ignored it entirely, and only reading the browser's own computed style caught that.

**THE ANSWERS INVITE; THE SENTENCE INFORMS.** What is overdue is said in words, and the document buttons stay
the ordinary inviting blue. Three red buttons on opening make a person feel told off rather than helped, and
this is a screen they open many times a day.

- Covered by the suites that already read Mitra's own words and buttons — `e2e_smoke` holds the opening to
  naming itself, greeting by the hour and asking where to go, with its answers as buttons. Checked in the real
  app as well, on this installation's own data: the question asked again on a second opening, the figure on the
  pill, and every movement confirmed from the browser's computed style — present normally, and gone for
  somebody who has asked for less movement.

## 68. The Purchase module, and the words a form prints edited on the sheet (23-Sep-2026)

```
REQUESTED            "So i am giving you some pdf so you have create new module Called Purchase and add those
                      document accoriding into it and make sure make each and every document editable also and when
                      user click to edit the if it like normal document then user has the option edit like word file
                      ... and if it is excel then same applies for it also ... and this thing is applies for each and
                      every documents for every modules."
SUPPLIED             F-PUR-01_Supplier registration form.pdf, F-PUR-02_Supplier audit report.pdf,
                      F-PUR-03_List of Approved suppliers.pdf, F-PUR-05_RM & PM Supplier Performance Monitoring.pdf,
                      F-PUR-06_Service provider monitoring.pdf — all in source-documents/
DIGITAL TEMPLATE     data/seed/purchaseLayouts.ts, engine/purchaseRatings.ts, types/logSheet.ts (the "paragraph"
                      field and LogColumn.group), components/records/LogSheetRecordView.tsx;
                      components/documents/SheetDesigner.tsx + engine/formatOps.ts + engine/formatCommands.ts
```

**1. PURCHASE IS A MODULE OF ITS OWN**, seventh in the sidebar, holding the five formats the department supplied,
in the two parts its own paperwork falls into — **Supplier Approval** (F/PUR/01, F/PUR/02, F/PUR/03) and
**Supplier Monitoring** (F/PUR/05, F/PUR/06). Every one is reproduced from the company's paper: every heading,
column, printed instruction and rating rule verbatim, including the company's own numbering gaps in the audit
report (**4.5 → 4.10** and **6.2 → 6.5**), the double space in "> 15  days delay", "house keeping" as two words,
"yours internal Traceability record", and the curly apostrophe the forms were typed with in "SUPPLIER’S NAME"
and "SIGNATURE WITH COMPANY’S SEAL". The format numbers resolve to the **PUR** department by their prefix, so a
QC account never sees them (§40).
- **F/PUR/04 was not supplied and nothing stands in for it.** The company's own original exists
  (`F-PUR-04_Purchase order.xlsx`), and the Purchase suite asserts exactly the five that were sent, so an
  invented one would fail the run.

**2. THE TWO REGISTERS WORK THEIR OWN ARITHMETIC OUT** (the way §61 did for calibration — a worked-out cell is
never typed and never asked for):
- **F/PUR/05**: Product safety × 50%, Quality × 40%, Delivery × 10%, the Overall Rating their sum to two
  decimals, and the Grade from the paper's own boundaries — **A at 90 or more, B below 90 down to 80, C below
  80** — with the legend's Action beside it. The four criteria tables print as the form's own reference tables.
  An **unrated line has no grade**: the blank form prints four 0.00 cells and nothing in the Grade column, and a
  "C" beside a supplier nobody has rated would say they had failed.
- **F/PUR/06**: Overall Rating = the delivery rating plus the quality & product safety rating, each out of 50.
- The Overall Rating adds the **rounded** weightages, so the figure on the sheet is always the sum of the three
  columns printed beside it and an auditor's own arithmetic agrees.

**3. TWO NEW THINGS A LAYOUT CAN SAY**, both because the paper says them:
- a **"paragraph"** box, for the prose blocks — F/PUR/01's "RANGE OF PRODUCTS / SERVICES OFFERED", F/PUR/02's
  COMMENTS and its eight summary prompts. A paragraph is a header or footer box, never a grid column: a cell is
  one line, and the paper draws a prose block the width of the page.
- a **spanning heading** over a run of columns (`group`), for F/PUR/03's **METHOD OF APPROVAL**, which the form
  draws over five columns including GFSI scheme certification.

**4. THE WORDS A FORM PRINTS ARE NOW EDITED ON THE SHEET** — the "like a Word file" half of the request, done
inside the §64 machinery rather than beside it. Each line of a format's printed prose is its own control in the
designer: click it and type, Enter keeps, Escape leaves, with a menu to insert a line above or below, duplicate,
move it or take it off, and a "+ Instruction" button on the toolbar. Each is **one step to undo** and each is
named for itself in the save pop-up ("line 3 of the printed instructions"), so the change history says what
changed rather than "the instructions were replaced". A prose box can be added, renamed and retyped like any
other box; a spanning heading is typed over where it is printed and comes off the whole run when it is rubbed
out. Mitra takes the same instructions in words, through the ask-first confirmation that already exists.
- On a form that prints its own lines down the side, "the printed line 3" still means a line of the **grid** —
  that is what it has always meant there, and what the suites depend on. Mitra's own sentences say
  "instruction" for the prose, so a chip means the same thing when it is tapped as when it was offered.
- **What is still not editable from the screen, honestly:** a form the PROGRAM draws by hand has no sheet to
  design — the daily pest register, the fly catcher register, the service reports, the complaint forms and the
  licence. Their name and revision change in the dialog (§62); their grid is code. The reference tables printed
  beside a form (F/PUR/05's criteria, F/QC/13's grade chart) stay as issued, and a computed column's arithmetic
  is engine code, not a setting.

- Covered by `tests/e2e_purchase_module.py` (a thirtieth suite): the module in the sidebar, all five formats in
  the Document Library with their numbers as printed, each on a page of its own, the registers' columns
  verbatim including the spanning heading, F/PUR/05's weightages and grades appearing without being typed at
  two different grades, F/PUR/06's thirteen lines and its sum, the audit report's numbering gaps, and a record
  started, filled, submitted and printed. The hard-coded document counts moved from **74 to 79** and the
  sidebar from six modules to seven.

## 69. The day's own notification, by priority — and a quieter Dashboard (23-Sep-2026)

```
REQUESTED            "you need to remove some things on dashboard :- Next on the leave calendar: Navratri Atham
                      19-Oct-2026 (Mon) · Navratri Navam 20-Oct-2026 (Tue) · weekly off every Thursday. Also you
                      need to make a dedicated notification system which comes daily to encourage the user to finish
                      there work and lead in that score dashboard ... according to frequency and due date system will
                      notify the user and this applies to all modules. So that will like highest prority, medium, low
                      like wise according to frequency of that document."
DIGITAL TEMPLATE     engine/notifications.ts, components/common/DailyNudge.tsx,
                      components/layout/NotificationBell.tsx, data/repositories/settingsRepository.ts,
                      pages/DashboardPage.tsx
```

**1. THE DASHBOARD IS QUIETER.** "Next on the leave calendar: Navratri Atham 19-Oct-2026 (Mon) · Navratri Navam
20-Oct-2026 (Tue) · weekly off every Thursday" is gone from under the date. Two festivals a month away and a
weekly off that never changes sat above the work, every day. The **badge beside today's date stays**, because
when TODAY is a holiday or the weekly off that changes what is due; the leave calendar itself is one tap away
on the Record Calendar.

**2. HIGH, MEDIUM OR LOW — FROM THE DOCUMENT'S OWN FREQUENCY AND ITS DUE DATE**, which are not the same thing.
A daily sheet not filled today leaves a hole in the file that tomorrow's sheet cannot fill; a yearly review due
today can be done tomorrow and lose nothing:

| Priority | When |
|---|---|
| **High** | Late already — whatever it is; or due **today** on a document whose period is a week or less (daily, weekly) |
| **Medium** | Due today on anything longer (fortnightly, monthly, yearly); or due **tomorrow** on a daily or weekly one |
| **Low** | Due later than that |

An **as-required** document has no period to be short of, so being due at all is a medium ask (§64 gives it two
days). The rule is one small function, `priorityOf`, and every screen that shows a priority asks it — so the
bell, the day's notification and anything after them can never disagree.

**3. THE DAY'S NOTIFICATION, ONCE A DAY.** On the first screen of the day a person is told, in one line, what is
waiting **for them** — their department's documents and the ones Master Data names them on, the same rule Mitra
uses (§67) — how much of it is high priority, which modules it falls in, and where that leaves them on the
Performance Scorecard (§64), which is what they are measured by:

> **Kapila, 4 documents are waiting, 2 of them high priority.**
> You are at 92% on the scorecard — Excellent. Finishing these on time is what holds it there.
> *2 high priority · 1 medium · 1 low · Quality Control — Inspection Records*
> [ Start with F/QC/01 ] [ Today's briefing ] [ Scorecard ] [ ✕ ]

- **Once a day, then it goes.** The day it was last shown is kept with the person's own settings, so a reload
  never repeats it: a notice that comes back every time is a notice people learn to close without reading.
- **Nothing waiting is worth saying too** — "Nothing is waiting for you today, Kapila — every one of your
  documents is in."
- **Nobody is accused of the plant's work.** An account nobody is named on — the administrator, the MR, QA —
  is told "The plant has N documents waiting", not that they are theirs.
- **It is worked out once, when it is shown**, never while drawing: both questions behind it walk every
  format's records (§65). The scorecard half is wrapped so that a failure there can never stop the
  notification.

**4. THE BELL SORTS BY PRIORITY TOO.** The reminder list is grouped **High priority / Medium / Low** with a
count on each, and the badge turns red only when something is high priority — amber otherwise. No extra work:
these are the same reminders the bell already had, asked the one new question.

- Covered by the suites that already read the Dashboard and the bell. The rule itself is a pure function with
  no storage behind it, and the day's notification carries `data-section="daily-nudge"` with its counts, so a
  suite can read what it decided rather than how it looks.

## 70. The Dispatch module — and the fourth form the plant issues in Gujarati (23-Sep-2026)

```
REQUESTED            "So now you need to create another module called Dispatch and those document in it as it and
                      make commit and push also always whatever you do it should go in my github also every single
                      commit and push."
SUPPLIED             F-DISP-01_Safe Transportation agreement (Finish product).pdf,
                      F-DISP-02_Container stuffing & Vehicle Inspection record.pdf — both in source-documents/
DIGITAL TEMPLATE     data/seed/dispatchLayouts.ts, the two definitions in data/seed/documentDefinitions.ts,
                      i18n/documentTextEn.ts + i18n/documentText.ts (GUJARATI_DOCUMENT_IDS),
                      components/layout/Sidebar.tsx, tests/e2e_dispatch_module.py
```

**1. DISPATCH IS A MODULE OF ITS OWN**, eighth in the sidebar, holding the two formats the department supplied,
in the two parts its paperwork falls into — **Transporter Agreement** and **Dispatch Inspection**. Their format
numbers resolve to the **DISP** department by their prefix, so only Dispatch (and an account that covers every
department) sees them.

**2. F/DISP/01 — SAFE TRANSPORTER AGREEMENT.** The code of practice a contract transporter agrees to before it
carries the plant's finished product: the standards for the vehicle and its driver, what may never be carried
with the product, how a load is protected and secured, what happens when a vehicle breaks down or a seal is
tampered with, and the inspection and rejection rights on arrival. Every clause is on the sheet under the
paper's own headings — *Damage / Contamination*, *Loading / Protection*, *Load Acceptance*, *Product Security &
Integrity*, *Vehicle breaks down in transit* — and both sides sign it.
- **It is all words: there is no grid on it at all**, and the sheet draws none (the guard added with §68).
- **The paper prints no revision**, only the period it is valid for (01.04.2025 to 31.03.2026), so the revision
  is **TO BE CONFIRMED** for the MR rather than invented. The format number is the company's own.
- The company's signed copy is the specimen: M/s V-Trans (India) Ltd., **Chirag Parmar, Purchase Manager** for
  the plant and Bhavsar Bhai, Logistic In charge for the transporter — which is the same signature that
  settled who answers for Purchase's formats in §68.

**3. F/DISP/02 — CONTAINER STUFFING & VEHICLE INSPECTION RECORD**, the check made before the plant's product is
loaded: the **seven things to do when a container arrives**, the consignment's own boxes (the customer, the
invoice, both purchase order numbers, the driver, the transporter and the vehicle), and the checklist — each
point answered **હા** or **નાં** with **NA** struck out, and any other observation written beside it. It is
authorised for product release by the **Dispatch In charge** and checked and approved by **QC**, as the paper's
own two blocks say.
- **The checklist is numbered as the paper numbers it: 1, 2, 3, 4, 6, 7, 8, 9 — there is no 5.** Those numbers
  are printed values of the format, not a count the screen makes, or the gap would close itself.

**4. IT IS THE FOURTH FORM THE PLANT ISSUES IN GUJARATI**, after the three Quality Control ones of §58, and it
is treated the same way. Every printed line of it — its name, the seven instructions, the eight boxes, the four
column headings, the two answers, all nine checklist points and both authorisations — is written down once in
the plant's own English (`i18n/documentTextEn.ts`). So:
- with **Gujarati** chosen the form reads exactly as it was issued and is kept away from Google's translator,
  because a controlled form reads as it was issued;
- with **English** chosen it reads in English **with no network at all** — Google is not loaded on an English
  screen, and without this the form would simply sit there in Gujarati.
- What a person TYPED is never translated either way, and the field keys a record is stored under are the same
  in both languages (§58).

- Covered by `tests/e2e_dispatch_module.py` (a thirty-first suite), which blocks the translator outright so the
  form is judged as the app itself renders it: the module and its links; the agreement's clauses and its two
  signature blocks, and that it draws no grid; the checklist numbered 1, 2, 3, 4, 6, 7, 8, 9; હા / નાં / NA on
  each point; the form read in Gujarati as issued and then in English with nothing left in Gujarati; and a
  container check started, filled, submitted and on file. The document total moved from **79 to 81** and the
  sidebar from seven modules to eight.

- **Still to come from the department:** F/PUR/04 (Purchase order) was never supplied, and the company's own
  master list of formats — `F-SYS-02-Master List of Formats. (R-2025)..xlsx`, which sits beside these PDFs in
  the plant's own folders — would say which of its formats are still only on paper.

## 71. The Store module — and the form supplied as a rubber stamp (23-Sep-2026)

```
REQUESTED            "also you need to add this in New module called Store. And make the image which i give us
                      should be visible as it is so this task perfectly and without any error."
SUPPLIED             F-STR-02_Sharp metal objects issuance & replacement record.pdf,
                      F-STR-01_Incoming material vehicle & condition monitoring record (rubber stamp).jpg
                      — both in source-documents/, the picture also in frontend/public/source/
DIGITAL TEMPLATE     data/seed/storeLayouts.ts, the two definitions in data/seed/documentDefinitions.ts,
                      components/layout/Sidebar.tsx, pages/DocumentRecordsPage.tsx (the supplied original),
                      types/logSheet.ts (originalPages), tests/e2e_store_module.py
```

**1. STORE IS A MODULE OF ITS OWN**, and it sits **between Purchase and Dispatch** — the order the material
moves in (bought on the F/PUR formats, taken in and kept on the F/STR ones, then inspected, made and sent out)
and the order the company's own **Master List of Formats & Records (F/SYS/02)** puts the departments in:
F/SYS, F/MKT, F/PUR, **F/STR**, F/QC. Its two parts are **Incoming Material** and **Sharp Tool Control**. The
format numbers resolve to the **STR** department by their prefix, so only Store (and an account that covers
every department) sees them.

That master list is also what settled **which** two formats these are: it holds exactly two F/STR entries, both
issued 01.12.21 — F-STR-01 *Incoming Material & Vehicle inspection Record* and F-STR-02 *Sharp metal objects
issuance & replacement record* — and the plant supplied one of each.

**2. F/STR/01 — INCOMING MATERIAL VEHICLE & CONDITION MONITORING RECORD.** This one was not supplied as a
document at all: it was supplied as a **photograph of the rubber stamp**, which is what the store actually puts
on the receiving paperwork. So it is built as the stamp is: a date, seven points each answered **Yes or No**,
and who checked it. There is no grid, because a stamp has none.

- **THE STAMP IS SHOWN AS IT IS.** *"make the image which i give us should be visible as it is."* A new
  `originalPages` on a layout names the pictures a format was supplied as, and the document page then offers
  **Show the supplied original** — the photograph, unaltered, with the file it came from named beneath it. It is
  closed until it is asked for, so nothing is fetched by a page that is only being read (§65), and a format with
  no supplied picture shows no such button at all, so every other document page is exactly as it was.
- **The stamp's own spellings are kept**: *"Foreign matter contaminaiton"* and *"Oil Sport on Floor"* are what
  is cut into the stamp, and a controlled format is reproduced, not corrected. The `e2e` suite asserts both
  misspellings are present **and** that neither has been quietly fixed.
- **The number is the company's, the revision is not invented.** The stamp prints neither. The number comes from
  the master list above; the revision is written nowhere the plant supplied, so it reads **TO BE CONFIRMED** for
  the MR rather than being assumed to be 00 like its neighbour.
- **A sample fill answers it as a load that passes** — covered *Yes*, foreign matter *No*, odour *No*, floor and
  sides clean *Yes*, oil spot *No*, pest or dropping *No*, packaging *Yes*. Answering "Yes" down the list, which
  is what a mechanical fill would do, would record a load that arrived contaminated, smelt, had pest droppings
  on it, and was taken in anyway.

**3. F/STR/02 — SHARP METAL OBJECTS ISSUANCE (NEW) & RETURN (OLD) RECORD.** The register of every razor blade,
scissor, cutter blade and surgical blade the store issues, and of what comes back against it: both printed
paragraphs above the grid, verbatim — the second ends without a full stop on the paper and so does it here —
and the nine headings in the paper's own words and punctuation, *QTY. ISSUED* and *RETURN QTY.* keeping their
full stops and *RECEIVERS SIGNATURE* its missing apostrophe.
- **RETURN QTY. is the one column that may be left empty**, and that is the format's own rule, not a relaxation:
  its second paragraph says a new tool may be issued *"without receipt of new sharp metal object"* — to a new
  employee, a new machine or a new requirement. A line with nothing returned files successfully; every other
  column is required.

**4. WHO SIGNS THEM.** F/STR/02 names a *Store In-charge* and prints a *STORE KEEPER SIGN* column. Rather than
invent a person, the company's own personnel records were read: F/HR/01 has **Hemantbhai Nayak**, General
Stores, Manager, joined 01.01.2004 with no leaving date, and F/HR/13 writes the same man *"Manager - Store"* as
of 01.12.2021. Both formats are his. The same reading also filled a gap left by §70 — **Parth Chauhan**,
*"Manager - Dispatch"* on F/HR/13 — because `disp-container-stuffing` resolves its signature to a role
containing "Dispatch" and no employee had one, so the paper's own product-release authorisation box was
filling with nothing.

**5. TWO DEFECTS THIS FORMAT FOUND IN WORK ALREADY SHIPPED.**
- **A `yesno` box above the grid was a free text box.** The grid understood `yesno`; the header and footer boxes
  did not, and fell through to a plain text input. The stamp is seven such questions, which is how it surfaced —
  but the format it was already wrong on is **F/PUR/01** (§68), whose *"DO YOU HOLD ISO 9001 / ISO 22000 /
  HACCP / FSSC / BRCGS CERTIFICATION:"* asked a yes-or-no question and offered somewhere to type. `yesno` now
  means the same thing wherever it appears.
- **The Dispatch module had no name of its own.** `module.Dispatch` was never written into `i18n/strings.ts`
  with §70. A missing key falls back to the tail of the key itself, so English read "Dispatch" by luck and
  Gujarati read "Dispatch" too — the only module in the sidebar with no Gujarati name. Both it and
  `module.Store` are written down now, and the suite asserts no sidebar module shows a translation key.

- Covered by `tests/e2e_store_module.py` (a thirty-second suite): the module and where it sits in the order; the
  library filtered to it; the stamp's seven points and both of its spellings; the supplied photograph shown
  unaltered and **actually loading at the size it was supplied** — a wrong path renders an `<img>` too, so the
  check reads `naturalWidth`; the seven points offered as choices rather than text boxes; the sample fill
  answering as a load that passes; both printed paragraphs and the nine headings verbatim; and a line with
  nothing returned filed successfully. The document total moved from **81 to 83** and the sidebar from eight
  modules to nine.

## 72. Mitra really asks the model, and every log-out asks about the day (24-Sep-2026)

```
REQUESTED            "i have noticed that chatbot might be not using groq api because when my internet is off then
                      also chatbot is working perfectly without any error so make sure what bot do it will use api
                      and not fixed question and answer which you have intregrated ... and sometime if any user is
                      working and suddenly internet has gone or his by mistakely logout then system should save his
                      work automatically ... and when user logout out every time the pop should also come that have
                      to reviewed and submitted your todays work and this is applicable to all user of all module."
BUILT                engine/assistantReach.ts, components/common/LogoutReview.tsx, engine/assistantLocal.ts
                      (LocalAnswer.kind + answerStaysLocal), pages/AssistantPage.tsx,
                      components/common/DocumentAssistant.tsx, backend/features.ts, engine/features.ts,
                      components/common/DatabaseSyncBanner.tsx, pages/RecordPage.tsx,
                      components/layout/Topbar.tsx, tests/e2e_assistant_and_logout.py
```

**1. THE PLANT WAS RIGHT, AND THE CAUSE WAS NOT A MISSING KEY.** `GROQ_API_KEY` was set in `backend/.env` all along.
The app never got that far: `engine/assistantLocal.ts` is a 918-line answerer with some fifty intents, and it was asked
FIRST — the model was reached only for what it could not handle. Everything a person normally types was handled, so the
assistant went on working with the internet off and nothing on screen ever said which of the two had replied.

**THE MODEL ANSWERS NOW.** Four things stay local, and each for a reason rather than for convenience:
- **out-of-scope** messages, declined here and never sent anywhere;
- **"are you a real person?"** — the honest answer is never the model's to improvise;
- **the opening greeting** with its buttons (§67) — a round trip to say hello makes an assistant feel slower, not cleverer;
- **anything that OPENS a screen** — the app carrying out a command is not a canned reply.

Everything else is a question, and a question is what the model is for. `LocalAnswer.kind` says which of these an answer is,
and `answerStaysLocal()` is the one place that decides.

**2. AND WHEN THE MODEL CANNOT BE REACHED, THE ANSWER SAYS SO.** This is the part that was actually wrong: not that the
app could answer offline — that is worth having — but that it passed its own answer off as the model's. A reply given
without the model now carries a line under it naming the reason, and the three reasons are different and are not run
together: **no internet on this machine**, **Mitra did not answer**, and **no key on this server**. Blaming a person's
connection for a missing key would be a lie.

`engine/assistantReach.ts` decides whether to ask. `navigator.onLine` is treated as a HINT — it says the machine has a
network, not that Groq is reachable — so it is used only to skip a request certain to fail, never as proof one will
succeed. A failure is remembered for twenty seconds so the next few messages are not each made to wait out the same
timeout, and it is forgotten the moment the browser says it is back online: a network that returns must not need a reload.

**3. WHAT WAS ALREADY THERE, AND WAS NOT BUILT AGAIN.** The plant asked for work to be saved when the internet goes or
somebody logs out by mistake. That already worked, and it is worth saying plainly rather than claiming credit for it:
`pages/RecordPage.tsx` autosaves 700ms after the last keystroke, flushes when the page is left and when the tab closes,
and `data/serverSync.ts` keeps a queue to PostgreSQL that retries. Three real gaps were closed:
- **`beforeunload` alone is not enough.** It is the event browsers are least willing to fire — a tab discarded under
  memory pressure, a phone putting the app to sleep. It now also saves on `pagehide`, on the tab being hidden, and on
  the `offline` event itself.
- **Losing the connection said nothing** until the NEXT save failed — the very moment a person most wants telling that
  their work is safe. The banner now appears as soon as the machine goes offline, and says to keep working.
- **The log-out pop-up names what has not reached the database yet**, and says plainly that logging out then loses
  nothing.

**4. EVERY LOG-OUT ASKS ABOUT TODAY'S WORK.** Every time, for every account, in every module. A day's paperwork filled in
but never submitted is, to an auditor, a day with no record — and the one moment worth mentioning it is while the person
is still there to fix it. It lists what is DUE, today or already late, worst first, by the same rule the daily
notification uses (§69): their department's documents and the ones Master Data names them on. Something due next week is
not today's work and saying so would cry wolf every evening until people stopped reading it.
- **Nobody is held there.** "Log out" always logs out. Being told is the point; being trapped is not.
- The sheet designer's own question about an unsaved format still follows it (`confirmLeave`), because the two ask
  different things: one about the day's records, the other about a draft on this screen.

**5. THE SUITES KEEP THEIR WORD.** `TESTING.md` calls these suites network-independent, and they were — but only by
accident: the local answerer caught everything, so Groq was never called. With the model asked first they WOULD have
called it, on the real key, which reaches the test server through `process.env`. `scripts/run-e2e.ts` now blanks
`GROQ_API_KEY` for them, exactly as it already did `CV_READ_WITH_ASSISTANT`, so every scripted message is answered from
the app's own tables and labelled as such. The real API is exercised by `tests/e2e_assistant_chat.py`, run on its own.

- Covered by `tests/e2e_assistant_and_logout.py` (a thirty-third suite): the server saying WHETHER it has a key and
  never what it is; a question answered and labelled with the honest reason; a greeting and "are you a real person?"
  answered locally and NOT labelled, with their buttons intact; and the log-out pop-up counting what is due, listing it
  worst first, keeping the session on "Stay signed in", asking again the next time, and logging out when told to.

## 73. Every person's work over a day, a month or a year — and the score beside it (24-Sep-2026)

```
REQUESTED            "as i told told you that what ever user do in system the superadmin can see his logs anything
                      whatever the work that user has done in whole day, month, year and according to that logs also
                      score will decide."
BUILT                backend/db.ts (activitySummary, ActivityFilter), backend/index.ts (/api/activity/summary),
                      engine/activityWork.ts, pages/ActivityLogPage.tsx, pages/PerformancePage.tsx
```

**1. A DAY, A MONTH, A YEAR — OR EVERYTHING.** The Activity Log already held every line in PostgreSQL, only ever added
to, with the super admin reading all of them (§62). It gains the spans a person actually asks for, and a filter to ONE
person: both go to the server as plain dates and an account id, and both ends of a span are included, which is what
somebody means by "this month". The scoping rule is untouched — `person` narrows what an account may already read and
can never widen it.

**2. THE TALLY IS COUNTED IN THE DATABASE**, not by walking every line in the browser: a year of a busy plant is far
more lines than a page should hold, and the counts are all that is being asked for. Per person: filled in, submitted,
approved, **days active**, and every action. Days active is counted per person in its own query, because the same day
appears under each action and adding them would say somebody worked thirty days in a week.

**3. WHAT COUNTS AS WORK** is taken from the log's own words (`engine/recordHistory.ts`, `ACTIVITY_WORDS`) rather than
guessed at: "Record edited", not "Record saved"; "Record submitted for verification", not "Record submitted". Getting
this wrong breaks nothing and shows a column of zeros, which is worse, so `engine/activityWork.ts` holds the strings
once and says why. Filling a record in through Mitra is still filling it in. Opening, printing and downloading are in
"all actions" but are not what a day is judged on.

**4. THE SCORE IS READ BESIDE THE LOG, NOT REPLACED BY IT.** "according to that logs **also** score will decide" — so
the Performance Scorecard keeps the arithmetic §64 defined (what fell due, what was submitted on time) and gains a panel
showing what the log says each person actually did over the same period. The two answer different questions and a plant
needs both: **a department can be perfectly up to date because one person did all of it, and the score alone would never
say so.** The panel is an extra — if the log cannot be read the scorecard stands on its own and the panel does not
appear.

## 74. The Maintenance module — the equipment master, and a record read under the revision it was made on (24-Sep-2026)

```
REQUESTED            "So now you have to create another module called Maintenance so i have shared this pdfs with you so
                      add those in that module ... my aim is that i want to make superintelligent system not only basic
                      audit project"
SUPPLIED             ten PDFs in source-documents/F-MNT-*.pdf: F/MNT/01, 02 (two revisions), 03, 04, 06, 08, 09 and 11 (two
                      rounds, two revisions); every page rendered unaltered to frontend/public/source/fmnt*.jpg
DIGITAL TEMPLATE     data/seed/maintenanceLayouts.ts, data/seed/maintenanceRecords.ts, the eight definitions in
                      data/seed/documentDefinitions.ts, engine/equipmentMaster.ts, components/records/EquipmentFetch.tsx,
                      engine/equipmentMasterAssistant.ts, engine/maintenanceCalc.ts, engine/computedCells.ts,
                      components/layout/Sidebar.tsx, tests/e2e_maintenance_module.py
```

**1. MAINTENANCE IS A MODULE OF ITS OWN**, placed after the production modules because that is where the company's
own Master List of Formats & Records (F/SYS/02) puts F/MNT — and outside the Purchase → Store → Dispatch run the
material moves through. Its parts are **Equipment**, **Preventive Maintenance**, **Equipment Health & Breakdowns**
and **Glass & Lighting**. The format numbers resolve to the **MNT** department.

The master list holds **eleven** F/MNT formats. Eight were supplied and are built; **F/MNT/05 Breakdown intimation
Slip, F/MNT/07 Temporary engineering record and F/MNT/10 Weekly Wooden article condition monitoring record were not
supplied, and nothing stands in for them.**

**2. F/MNT/01 IS THE EQUIPMENT MASTER.** The List of Equipments & Utilities is kept as an ordinary format with the
supplied page on file as a Verified record — **43 machines**, M-01 to M-85 with gaps (the file is named "Flexo &
Pouch" but carries the Flexo list and one Common forklift). Making the format itself the master means no second
copy of the list, no new storage key, and scoping to Maintenance for free. The preventive maintenance record, the
daily health sheet and the breakdown register **fetch a machine from it by its Machine No.** (engine/equipmentMaster.ts,
components/records/EquipmentFetch.tsx), on the HR Master Data pattern of §53: a blank box fills at once, a box
already written is changed only when the person says so. A machine is identified **only** by its number, or by a
serial number that is not a placeholder — model names repeat (Brison 370 twice; UltraFlex Video Plate Mounter three
times) and "NA" / "-" stand for unknown. The breakdown register's "Add line" always adds a line: one machine has
many breakdowns, and HR's one-line-per-person rule is never copied. Mitra answers "which machine is M-47?" from the
list, on the device.

- **Row M-68 is printed one column out of step on the paper itself** — its manufacturer box is empty and every value
  after it sits one box to the right, so the page reads Country of Origin "DCM Sleeve Seaming", Size "France", Year
  "December", Serial No. "2023". It is **kept exactly as printed** and reported for the department to confirm, never
  quietly straightened. M-85's Location / Room is blank on the page. The paper's own spellings are kept: "Itlay",
  "Febraury", "Hyfra Industrukuhalanlagen GmbH", "Konika Minolta".
- The "Department" column of F/MNT/01 holds a plant **section** (Flexo / Common), never a system department code.

**3. THE OTHER SEVEN, VERBATIM.** Every label is the paper's: "Equipoment Name", "Monthaly", "Machine discription",
"BREKAGE", "VARIFIED", "Articals", "Trail Production date", "Accessible & ease to clean", "Poucing" — and the
dashes: F/MNT/09 heads weeks 1 and 5 with a hyphen and weeks 2 to 4 with an en dash, and so do these.
- **F/MNT/02 Preventive Maintenance Schedule & Record**, one sheet per machine, at **Rev 01** — the higher of the two
  revisions supplied. Its page 2 table of abnormal findings and actions is joined to the PM visit it describes, so a
  finding can never drift from its visit. **The Rev 00 "Check List & Record" page is shown beside it as the
  superseded original.** Both revisions print the date 01.12.2021 — for the MR to confirm.
- **F/MNT/03 Yearly Preventive Maintenance Schedule** — Plan and Actual side by side under each month (the F/HR/09
  shape), so a slipped PM shows on its own line. Its only marks — printing planned 10.01 and done 28.01, slitting
  planned 12.01 — carry no year, so they are the format's **specimen, not a record** of a year.
- **F/MNT/04 Daily Equipment Health Status & Cleaning Record** prints its seven check parameters **in Hindi and
  Gujarati side by side**. The PDF's text layer for both scripts is mis-encoded ("मर्ीन" for "मशीन", "બલકેગે" for
  "લિકેગે"), so **every line was read from the rendered page** and the paper's own spellings kept ("अनावस्यक",
  "તાપસ"). It is kept as issued with Gujarati chosen and reads in the plant's own English with English chosen, with
  no network (§58). The paper lays the month out as two half-month strips of a tick and an operator per shift; here
  each **day is a line** with its day-shift and night-shift marks side by side, the words all the paper's.
- **F/MNT/06 Equipments Breakdown Maintenance Record** — its three spanning headings as printed, and **TOTAL
  BREAKDOWN MINUTES worked out from the failure and repair dates and times, never typed** (engine/maintenanceCalc.ts).
- **F/MNT/08 New Equipment Installation Report** — ten requirements assessed with the paper's own "Y" / "N", and the
  hand-over signed by the Maintenance, Production and QC heads. A new machine is written up, not fetched: it is not
  on the equipment list until it has been installed.
- **F/MNT/09 Glass Articles & Weekly Glass Breakage Monitoring** at Rev 02 (01.09.2025): the list of 3,980 glass and
  brittle-plastic articles in twelve areas (every row and column total checked by hand, the grand total left blank
  as on the paper) and its revision history, as the format's printed tables; the month's grid of areas by week as
  printed. Page 2's area names differ from page 1's and both are kept.
- **F/MNT/11 Lux Level Measurement Record** at **Rev 01** (26 areas, one Lux Level), with the meter printed in its
  header (Kusam-Meco KM-LUX-99, Sr.No. S1135510).

**4. A RECORD IS READ UNDER THE REVISION IT WAS MADE ON.** Two lux rounds were supplied: 12.08.2025 on Rev 01, and
**11.05.2024 on the superseded Rev 00, which measured 19 areas by day AND by night**. Redrawn on Rev 01, the 2024 page
would lose its night readings, show six blank lines and head itself "Rev 01" — a false record. So a record can now
be **pinned** to a revision (`RecordInstance.formatRevision`), and a layout lists the revisions it replaced with the
layout each was printed with (`LogSheetLayout.supersededRevisions`). A pinned record is drawn, headed, checked and
patched with its own revision's layout; it is never a source to carry values forward from, and it is not offered
for correction on a layout it was never written on. Records without a pin behave exactly as before.

**5. EVERY WORKED-OUT CELL IS WORKED OUT IN ONE PLACE.** Until now the purchase ratings (§68) were worked out on
screen and the calibration deviations (§61) only while a person typed — neither in a sample fill, the assistant's
preparation or the demo year, so stored values could disagree with the screen. engine/computedCells.ts is the one
pass, applied wherever a record is drawn, saved or filled, and a computed column is never required.

**6. EVERY SUPPLIED PAGE CAN BE SEEN AS IT CAME**, now with a caption of its own (§71's originals extended): F/MNT/02
shows both revisions, F/MNT/11 both rounds, and a superseded page says that it is superseded.

**7. WHO SIGNS THEM — from the company's own papers, not invented.** F/HR/01 and F/HR/13 have **Mukesh Patel**,
"Manager - Mentainance" (joined 06.04.1996), and **Rahul Patel**, "Supervisor - Mentainance" (joined 19.12.2014).
Mukesh Patel's line in the seed read "Staff — pest control awareness trainee"; the seed now says what his papers say,
and an install that already holds the old line is corrected by `SEED_CORRECTIONS` in masterRepository.ensureSeeded —
**only while the stored line still reads exactly as the old seed wrote it**, so an administrator's own edit is never
overwritten. The same fix reaches Chirag Parmar's §68 correction, which had never reached an existing install. The
daily health sheet is ticked by the machine operator, as its columns say.

**8. GAPS FOUND ON THE WAY, CLOSED:** Store and Dispatch had no entry in the sidebar's link-visibility map, Mitra's
module keywords, or the model's list of modules in scope — so the model was told they were out of scope. Every
Purchase, Store and Dispatch line of the activity log was filed under no department (§75 covers the server side).
The employee-name suggestions appeared in "Machine Name" boxes. The QC-only footer note printed on every form with a
footer. The downloaded workbook shifted grouped headings left.

**Still to confirm with the department:** F/MNT/01 row M-68 and M-85's location; F/MNT/02 Rev 01 and Rev 00 carrying
the same date; the year of F/MNT/03's January marks; how often F/MNT/11 is measured (the two supplied rounds are 15
months apart); and F/MNT/05, 07 and 10, which were not supplied.

## 75. A system that reads its own records — Insights, and what they lead to (24-Sep-2026)

```
REQUESTED            "my aim is that i want to make superintelligent system not only basic audit project which is right
                      now at present moment" — with the changes proposed on 24-Sep-2026: a smarter Mitra, smarter
                      compliance, one search over every record, smarter notifications, and scale
DIGITAL TEMPLATE     engine/insights.ts, engine/insightRules.ts, engine/insightsInput.ts, engine/raiseCapa.ts,
                      pages/InsightsPage.tsx, components/insights/DashboardInsights.tsx,
                      components/charts/ReadingChart.tsx, tests/e2e_insights.py
```

Until now every record was read on its own: a sheet was checked against its own printed band, a finding against its
own target date. Nothing read the records **together** — so a cabinet losing half its light between two lux rounds,
the same lot deviation written on four lots, or a CAPA closed and the same finding back a month later, was visible
only to someone who happened to lay the papers side by side. This section is the system doing that, and what follows
from it.

**1. INSIGHTS — /insights, in the System group of the sidebar, for every account.** Each insight is worked out by a
**fixed rule** from the plant's own records — plain arithmetic, no model, nothing estimated — and each one **names
the records it was read from**, every one a link. The rules, and why each carries its severity, are written at the top
of engine/insightRules.ts:

| Rule | What it finds |
|---|---|
| A1 | readings outside the band the form itself prints (F-QC-30 and F-QC-32 viscosity, F-QC-40.C's six temperatures), per sheet and day, with the run length and a chart |
| A2 | a process that has shifted, caught **before** a reading leaves the band (Western Electric rule 2, on the hourly series) — decided sheet by sheet, σ from every hourly sheet with 12 or more readings, so one short sheet today does not switch the warning off |
| A4 | out-of-band readings on a sheet that was verified with no remark and no CAPA naming it |
| B1 | the same lot deviation written on three or more lots in 90 days (F/QC/37, /35, /34) |
| B2 | the same observation on the daily pest control register three or more times in 90 days |
| B3 | a CAPA whose action date has passed, and the same finding back afterwards — **the CAPA did not hold** |
| B4 | CAPA findings past their target date |
| B5 | printing stopped twice or more in a month on F/QC/13 |
| C1 | **a record that passes and fails the same test**: a lot marked Accepted on F/QC/37, /35 or /34 while one of its pass/fail tests reads its failing word (FAIL, Fail, NOT OK, Leak — which lines are pass/fail tests is taken from the form's own filled specimen), or an F/QC/13 parameter graded F and marked Pass? "Yes"; high, with a suggested CAPA — find out whether the lot went out with a failed test |
| C2 | **a lot's reason that states a figure** ("Pouch height 178 mm against 181 mm specified") while the observation of that parameter on the same record reads a different figure; medium — the record is corrected |
| C3 | an instrument whose calibration has expired (and, low, one expiring within 30 days) |
| SUP | a supplier graded C on F/PUR/05, quoting the action the form prints — graded only from a line with all three ratings written (a blank rating is not a 0): each supplier on the sheet last handed in, from its newest fully rated line. The Management Summary and Mitra grade exactly the same way (insightRules.supplierStandings) |
| M1 | light lost per area between the two latest lux rounds (a fall of 25% is medium, 40% high) |
| M2 | the equipment list's own inconsistencies — M-68 printed out of step, a missing location, a year that is not a year |
| M3 | one machine breaking down three or more times in 90 days, with its repair time and time between failures |
| M4 | glass breakage marked YES, or an area written as cracked or broken |
| M5 | unticked day or night checks on the daily health sheet, closed days skipped |
| M6 | preventive maintenance done more than 7 days after its plan, or not done 7 days after it |
| M7 | a breakdown naming a machine that is not on F/MNT/01 |

- **Only what people wrote is read**: submitted, pending, verified and sent-back records, and drafts a person has
  edited. A blank sheet the calendar made, or a draft only the assistant filled, is never evidence of anything. A
  draft counts only for an entry a person made after the assistant last filled it: "Fill again" replaces every value,
  and entries by a start-up migration ("System") or by the assistant are not a person's. Mitra's edits and her sample
  fill are saved under the person's own name and count as theirs. The search reads "written by a person" the same way.
- **A record that contradicts itself** (C1, C2) is read only once it is handed in, and for 90 days. A generated demo
  year gives neither rule anything, so whatever they find was written that way by a person.
- **One unreadable record never stops the insights.** A cell holding something its column never expected (a date
  written 12.09.2026 after the Format Editor made the column Text) is shown as written, or that record is left out of
  the one rule that could not read it; every other insight is still worked out.
- **Two runs at once both finish**: the Insights page, the Dashboard card, Mitra and the Management Summary each keep
  their own place while taking the records a slice at a time.
- **No limit is invented.** The plant has not given a lux standard, so M1 reports the fall between two rounds and
  never "below standard"; a rule whose band is not printed on the form does not exist.
- **Rules that were tried and left out**, because on a full year of the plant's records they raised more false alarms
  than true ones: the other three Western Electric rules, EWMA, and a straight-line "will reach the limit on" forecast.
- **Scoped** (§40): the records and documents are the scoped ones, so a Maintenance account reads Maintenance's
  insights and a Quality Control account reads Quality Control's. An account that cannot open the internal CAPA report
  is told nothing about what that report holds: A4 does not say "no CAPA finding names the sheet", and B2 does not say
  that a corrective action is needed.
- **Fast on a slow laptop** (§56): the page paints first and the insights are worked out after it, in slices of about
  8 ms with the browser free in between; a record already read is remembered, so the next run reads only what changed.

**2. THE DASHBOARD SHOWS THE THREE THAT MATTER MOST** — high first, then medium, with how many there are of each and a
link to the page. Low ones (a summary, a missing location) are counted but not put on the Dashboard, and with nothing
high or medium the card is not drawn at all: the Dashboard is for what needs doing.

**3. AN INSIGHT BECOMES A CAPA ONLY ON A CLICK.** Beside an insight that calls for one, "What the CAPA finding will
say" shows the finding, comment and corrective action before anything is written; **Raise CAPA** then adds it as an
**Open** finding to this month's internal CAPA report (starting the report if there is none), target date 15 days
out, remembering the insight it came from (`GapFinding.insightKey`) and every record behind it, not only those its card
lists (`GapFinding.sourceRecordIds`). The same insight is **not offered again while its finding is open**; if it is found
again after the finding was closed, that is rule B3. The internal CAPA report is Quality Assurance's, so an account
that cannot open it is not offered to write on it.

**4. ONE SEARCH OVER WHAT EVERY RECORD SAYS** (pages/SearchPage.tsx, engine/recordText.ts, engine/recordSearch.ts).
The search box found documents, people and a format number's register; a word written *inside* a record — a machine
model, a supplier, a finding — found nothing. Now anything else typed is looked for in what the records say, **every
word must be there**, and each result shows the value that matched with its heading and row, e.g. "M-68 · Machine
Name / Model No.: DCM Usimeca".
- A record is read through its own layout — a Rev 00 record under Rev 00's headings (§74) — and a heading printed
  twice is named with its group ("January Plan", "DAY SHIFT Operator"). Pictures, scans, ids, change diffs and the
  cells the form prints or works out are not searched, nor are notes the system or the assistant left in a record's
  history: only what people wrote.
- **A format number with other words** — "F/HR/17 RB-27", "QC-30 Gaurav", "hr 5 roshni" — looks for those words in
  that document's records only, and the count says "… in F/HR/17". Only a query that is nothing but a format number,
  however it is written, or a request to open one ("open F/HR/05"), lists the register. A number none of the person's
  documents carries finds nothing, and says so.
- **Dates are found as they are shown and written**: a date stored as 2026-08-14 is found as 14-Aug-2026, 14/08/2026,
  14.08.2026 and 14-08-2026 too, and a result shows it as 14-Aug-2026; a date written by hand as 12.09.2026 is found
  as 2026-09-12 and 12-Sep-2026 too. A slashed date written on a record is left as written (the HR sheets carry
  month-first dates), and an impossible date or one inside a sentence is never converted.
- With Gujarati chosen, a result's heading may be translated; its line and value — what people wrote — carry
  `translate="no"` (§58).
- **What people wrote is searched by default**: blank calendar sheets and sheets only the assistant prepared are left
  out unless "Also look in blank sheets and sheets only the assistant has prepared" is ticked. A format number still
  lists that document's whole register, blank sheets included, now newest first.
- **Scoped** (§40): a Quality Control account searching a Maintenance machine finds nothing.
- **Fast on a slow laptop**: the index is built in idle 8 ms slices outside the page, re-reads only a record whose
  `updatedAt` or status changed, pauses while the tab is hidden, and at most 200 result lines are drawn before "Show
  all N records". Content search starts at two letters. A record is re-read when its `updatedAt`, status, due date,
  history length or data shape changes, and a draft also when its data's written length does (the start-up migrations
  keep `updatedAt`); the index is kept per signed-in account, since a sign-out does not reload the tab.

**5. THE ACTIVITY LOG, CORRECT AND FAST AT ANY SIZE** (backend/db.ts, the /api/activity routes).
- **A live bug fixed: the log was not newest first.** It was ordered by the text copy of the line number, so line 99
  came before line 158 and "Show older" could skip or repeat lines. It is now ordered by the number, reading the
  primary-key index backwards.
- **Indexes** by person and time and by department and time — at a million lines one person's month went from 29 ms to
  3 ms, and a small department's lines from 252 ms to 0.3 ms — and a **trigram index for the search box** (2.2 s to
  under 1 ms for a search that finds nothing), made only when the database account may create the `pg_trgm`
  extension; without that right the server starts, logs one line, and searches unindexed.
- **The search means what it says**: `%`, `_` and `\` are escaped, so "F_QC" no longer finds "F/QC" and "100%" no
  longer finds "1000". The per-person tally beside the lines honours the search too.
- **A batch of lines is written all or nothing**, in the order given — **and once only**: every line the browser
  queues carries an id of its own (a UUID, made from `crypto.getRandomValues` where the page is plain http), kept
  through every retry, and the log keeps a line whose id it already has no second time. A batch whose answer was lost
  after it was written — the connection dropped just after COMMIT — used to be written twice when it was sent again.
  Lines with no id (the server's own, an older browser's) are written as before.
- **Every line carries its department, worked out by the server** from the document's id with the same rule the
  line's visibility uses — the browser's claim is used only when the server's rule places nothing. Purchase, Store,
  Dispatch and Maintenance lines had been filed under no department (§74).
- **The plant's own clock** (`PLANT_TIMEZONE`, default Asia/Kolkata) for "today", "this month" and active days: a
  hosted PostgreSQL usually runs in UTC, where everything done before 05:30 was counted on the day before. It is set on
  each new connection as it is made: set in the connection's start-up options, a `DATABASE_URL` carrying its own
  `?options=` silently replaced it, and it replaced a `PGOPTIONS` the host had set.
- **"Show older" goes on with the list on the screen**: the next page is read with the filter the list was loaded
  with, not with a search typed into the box but not yet sent, which used to add another search's lines under it.
- Two servers starting on one database no longer race on creating the tables (an advisory lock).

**6. THE PRE-FILL AND THE DEMO YEAR READ TRUE** (engine/autoFill.ts, engine/plantSimulation.ts, data/demoGenerator.ts,
tools/plant_pattern.py). Reading the records together (part 1) is only as good as the records, and four faults in what
the assistant pre-fills and the demo year generates would have made the insights report the generator, not the plant:
- **A FAIL carried onto accepted lots.** Each sheet copied the last one's observations, so one failing Leak Test or
  Odour Test stayed on every later sheet — 127 of 224 pouching and 192 of 224 slitting sheets read FAIL beside an
  Accepted lot. Each observation is now worked out fresh for its own record: the passing word, or the failing word only
  when that day's lot decision is a rejection, segregation or deviation whose reason names that test. F/QC/13's Pass?
  follows the day's grade.
- **Measured figures that walked.** Pouch height went from 182 to 218 mm over the year, repeat length from 203 to 258.
  A figure now varies around the job's own figure (the specimen's) by less than half the smallest gap the format's own
  lot reasons call a deviation, and a deviation reason that states a figure ("178 mm against 181 mm specified") has
  that figure beside it. On another job's sheet (Live), the person's own last figures are kept as they were.
- **Rejection reasons that contradicted the record.** 91 of 104 rejected records gave a reason their own content
  disproved (a batch number said to be missing that was written). Every reason now names what the record must show for
  it, and a record that shows none of them gets a generic reason instead. The same 104 records are still rejected.
- **Specimen dates that went stale.** F/QC/12's lines and F/QC/11's Calibration Date now take the record's own day (and
  the daily camera-challenge register its date). A calibration expiry is a fact about the instrument, so it is still
  carried as written — in Live the pre-fill now opens with "Check this before you submit" when it has passed; only the
  demo renews its certificate, a year at a time.
The demo year is still generated the same way on every run (one fingerprint), and no stored record is rewritten: a demo
year already in the database keeps its old data until it is cleared and generated again.

**7. MITRA ANSWERS FROM ALL HISTORY** (engine/historyDigest.ts, engine/scopedInsights.ts, the analyst prompt in
backend/assistant.ts, backend/groq.ts). Mitra saw only today's facts, so "which machine breaks down most?", "how did QC
do last quarter?", "who is late?", "what stands out in the records?" — and a follow-up, "and the month before?" — could
not be answered. Now:
- **The app recognises such a question and works the figures out itself**, from the records this account may see and
  with the engines the screens use: F/MNT/06's minutes, MTTR and calendar-day time between breakdowns per machine; the
  two latest lux rounds area by area; F/PUR/05's own grade table; lots not accepted and readings outside the printed
  band; CAPA findings open, past target and closed, and complaints received; rodents and flies; the Performance
  Scorecard; and the Insights for the topic. Only records people wrote are read (lateness is the Scorecard's own
  question). A command, a screen to open, today's work, a machine looked up by its number, the calendar and small talk
  keep their own answers. "Last quarter" is the previous calendar quarter; with no period named, the last 90 days.
- **The figures go to the model as evidence**, at most 6,000 characters (1,500 per topic, five lines per list, ten
  records), under a shorter prompt that drops the full list of screens and says: the only source for numbers; quote
  them exactly; if the answer is not in it, say so and suggest the screen. Anything a person wrote is quoted and cut to
  80 characters. An answer names up to five records it was read from, each an Open link; the server keeps only records
  the evidence named.
- **The conversation so far goes with every question** (six turns, 800 characters each, 3,000 in all), so a follow-up
  is understood.
- **With no model** — no key, no network, or the day's allowance used up — the same figures, said plainly, are the
  answer, labelled with the reason (§72).
- **The plant's daily allowance**: every answer's tokens are counted per day on the plant's clock; at 90% of
  `GROQ_DAILY_TOKEN_BUDGET` (default 200,000, Groq's free tier) the chat stops asking the model and says so, instead of
  failing on the provider's limit by midday. A call to the model gives up after 30 seconds.
- Mitra's live facts gain one line of what stands out (the Insights headline) and, when a machine is named by its
  number, what F/MNT/01 says about it.
- **Fast on a slow laptop**: nothing is worked out while drawing; it is worked out on send, in 8 ms slices, and kept
  until the records change — or the plant's calendar does (a holiday added changes what was late).
- **Hardened by review** (the second adversarial review of §75): nothing a person wrote reaches the model except
  quoted — a machine's written ID or name, a typed lot status, a date typed into a text box, and an insight's title
  (quoted in pieces of at most 80 characters) — and the server keeps a cited record only from a real `[rec:id]` tag
  at the end of an evidence line, never from text that merely contains one. A question about the sheet that is open
  ("what's the average viscosity on this sheet?") keeps the record's own prompt; only a named period, a follow-up or
  "what stands out" goes to the analyst. The period asked about wins: "September so far" is September to today, not
  everything on file; "last December", "in October" (asked in September) and "in 2025" are the past months and year
  they mean; "may" the verb is not May; "and before that?" steps back by the period's own unit; a follow-up chain is
  kept on the messages, not re-read against today. A question naming documents gets the Scorecard's figures for those
  documents only, said so, never presented as a department's or the plant's score; lateness is scored for at most the
  last 12 months, the Performance page's longest period, and a person is scored among everyone who shares their
  department, as the Performance page does.

**8. THE MONTHLY MANAGEMENT SUMMARY — Reports › Management Summary, `/reports/{year}/{month0}/summary`**
(engine/monthlySummary.ts, components/reports/MonthlySummaryReport.tsx). A month of the plant's records in plain
English for management, with the month picker every report has, and printable like them. It is **worked out by code,
not written by a model**: every sentence is a fixed template filled with numbers counted from the records, so it works
with no network and the same records always give the same words. Three to five sentences come first, then a part each:

| Part | What it reports |
|---|---|
| Record-keeping | Due, on time, late and never done, with the score by department and by module, the three documents most behind and the three people most often late — the Performance Scorecard's own rule, which can now score any range of dates |
| CAPA | Findings raised and closed in the month, open and past target at its end (the oldest named); customer complaints received, approved and open |
| Quality | Lots not simply accepted per inspection record; readings outside the band the form prints; instruments out of calibration or expiring within 30 days |
| Maintenance | Breakdowns, minutes down, MTTR, production lost and the machines that broke down most; PM planned against done (late = more than 7 days after the plan); weeks with glass breakage; lux rounds and the areas that lost 25% of their light |
| Purchase | The latest F/PUR/05's suppliers graded A, B and C, each C named with the form's "Replace / improve" |
| Pest control | Days recorded, rodents caught as the Rodent Trend counts them, check point findings, flies counted |
| What the records show | The ten most severe insights |

- **As of the month's end**: a state (CAPA past target, calibration, grades, insights) is read as it stood on the
  month's last day, over the records dated up to then; for the month still running, as it stands today. A month not
  begun says so.
- **Only what people wrote**, except record-keeping, where a sheet nobody handed in is exactly what "never done" counts.
- **A part with nothing to report says so in one line** rather than disappearing.
- **Scoped** (§40): a part about documents the account may not see is left out, and the headline says which
  departments it covers.
- **Fast on a slow laptop** (§56): the page paints first; the summary is worked out after it in slices of about 8 ms,
  again two seconds after a save, and kept for the next visit while nothing has changed — kept per signed-in account,
  so the next person signing in on the same tab never sees the last one's summary.
- A preventive maintenance job is "not done" only past the same 7 days' grace insight M6 gives it; a complaint's
  approval counts on the plant's date, not the UTC one (an approval before 05:30 was counted on the day before).
- **The day's notification** gives a person's own score as the Performance Scorecard does — among everyone who shares
  their department — and leaves the score out rather than show a different one when the list of accounts cannot be read.

**9. ESCALATION TO THE SUPER ADMIN, AND A WEEKLY DIGEST — worked out on the server** (backend/escalation.ts,
backend/jobs.ts, backend/escalationRoutes.ts, engine/latenessCore.ts). Lateness was worked out only in a browser, so
it reached the super admin only if somebody happened to open the Performance page.
- **One rule.** On time, late, never done and whom a record counts against now live in one file with no imports
  (engine/latenessCore.ts): the Performance Scorecard adds it up in the browser, the server adds up the same answers
  from PostgreSQL, and a unit test holds the two to identical results — over 17,000 judgements and 126 whole
  scorecards against a frozen copy of the old code.
- **Every working day at 10:00 plant time** (`ESCALATION_AT`), over the last 30 days: a person with 3 or more late
  submissions, or 2 or more records never done in a department they answer for alone, is escalated by name; a
  department with 2 or more never done that several accounts share (or none answers for) is escalated as the
  department, named with its people — the scorecard counts such a record against every one of them. Only Live
  records count, and nothing dated before the system went live. One line per person or department per week, holding
  the day's figures and every record behind them; acknowledged, it opens again only when a record is behind it that
  was not there when it was acknowledged — not when a figure merely moves. The line in the activity log, "Escalated to
  the super admin", is written in the same transaction as the escalation, so a failed run leaves neither and its retry
  writes both; and it is **the super admin's alone** — filed under no department and saying no figures (they are with
  the escalation), so no department account reads another department's numbers in the log, nor anyone but the super
  admin that there was an escalation at all.
- **The super admin sees it in the app**: an "Escalated to you" group at the top of the bell, counted in its badge,
  each with Acknowledge (who and when are kept; it opens again if it grows); a line in the day's notification with a
  way to the scorecard; an "Escalated" badge beside the person or department on the Performance page; and Mitra knows
  who is escalated. It is emailed too only when the server has a mailbox (`ESCALATION_EMAIL`, or the active
  administrators) — the seeded super admin's address receives no mail.
- **On the first working day of each week at 09:00** (`DIGEST_AT`), a digest of the week before is stored and shown on
  the Performance page: records due, on time, late and never done by department, CAPA open and past target, the
  escalations raised, and the documents most behind. Worked out by code, no model.
- **The schedule runs on the plant's clock**, once per day or week however many servers share the database (each run
  is claimed in PostgreSQL; a failed run is recorded and tried again), and catches up after a server was down.
  `JOBS=0` switches it off — the test runner does, because the suites run on the real clock. The super admin can run
  either job at once (`POST /api/jobs/run`), and that is itself a line in the log; run for the plant's today it IS that
  period's run, so the schedule does not repeat it (a hand-run digest used to be prepared, logged and emailed twice).
- **A shared plant computer**: several people sign in on one browser, one after another, and a person's settings
  (language, working hours) are handed on to the next who has none of their own. What was shown or put off for the
  first — the day's notification, the briefing, a snoozed reminder — no longer is: the second person's first sign-in
  used to take on "already shown today", so they never saw theirs (found by `tests/e2e_escalation.py`).
- **On a phone** the top bar keeps every control and gives up only room — the words beside an icon go (the button
  keeps its name for a screen reader and its tooltip), a long name is cut short, and the controls wrap rather than
  widen the page — so at 390 px the app no longer scrolls sideways; the bell's list spans the window there.

**10. THE ACTIVITY LOG IS KEPT FOR EVER; ARCHIVED ONLY ON PURPOSE** (backend/activityArchive.ts,
backend/archiveRoutes.ts, the Activity Log page). Nothing removes a line by itself — no purge, no timer — and the
database itself refuses a change or a removal: a trigger on the log and on its archive refuses UPDATE, DELETE and
TRUNCATE. When the log has grown long, the super admin may, on purpose, move the lines older than N years (1–10; 3
unless `ACTIVITY_ARCHIVE_AFTER_YEARS` says otherwise) into `activity_log_archive` in the same database, after seeing how
many lines that is and the days they run from and to. The move is one transaction, the lines keep their ids, and the
move is itself a line: "Activity log archived", with the count, the cutoff and who did it. "Include archived lines"
reads the log and its archive together, with the same filters, paging and search — for the super admin only. The
per-person tally reads a day-by-day copy of the log (`activity_daily`) for closed days and the lines themselves for the
last two: at a million lines "Everything" went from 1.7 s to 0.13 s, with identical counts, and the copy is checked
against the lines before each day is added.

## 76. The System / Management module — the PSTL's own formats, every one editable, and read together (25-Sep-2026)

```
REQUESTED            "You have to create new module called SYS so always keep Edit option fast, perfectly without any
                      error" — with twenty-one PDFs of the F/SYS formats attached
SUPPLIED             source-documents/F-SYS-*.pdf (and "Copy of F-SYS-07…"): F/SYS/01, 02, 03, 04, 04-A, 05 (2024 and
                      2025), 06, 07, 08, 10, 11, 12, 13 (label, sleeve, pouch), 14, 15, 16, 17 and 20 — and the company's
                      own workbooks of the two master lists, F-SYS-01 and F-SYS-02 (R-2025).xlsx; every page that carries
                      anything rendered unaltered to frontend/public/source/fsys*.jpg (77 pages)
DIGITAL TEMPLATE     data/seed/sysDocumentControlLayouts.ts, sysManagementReviewLayouts.ts, sysInternalAuditLayouts.ts,
                      sysHaraTraceabilityLayouts.ts and their sys*Records.ts; the eighteen definitions in
                      data/seed/documentDefinitions.ts (SYS_SECTIONS); engine/auditRisk.ts; engine/computedCells.ts;
                      engine/autoFill.ts (autoFill.fresh); engine/insightRules.ts (S1–S6); components/layout/Sidebar.tsx;
                      tests/e2e_sys_module.py, frontend/tests/sysModule.test.ts
```

**1. SYSTEM / MANAGEMENT (SYS) IS A MODULE OF ITS OWN, FIRST IN THE SIDEBAR** — where the company's own Master List of
Formats & Records puts F/SYS, and because it is the system every other module is controlled and audited through: the
master lists that say which formats exist, the management review, the internal audit, HARA, traceability. They are the
Product Safety Team Leader's (PSTL, Ms. Kapila Barad, Manager – QA) — "Reviewed & approved by : PSTL", the master lists
say — so every one names her role for its signature. The format numbers resolve to the **SYS** department; a Quality
Control or Maintenance account sees none of them. Its six groups, each format on a page of its own:

| Group | Formats |
|---|---|
| Document Control | F/SYS/01 Master List of Documents · F/SYS/02 Master List of Formats & Records · F/SYS/03 Document Change Request & Approval Note |
| Management Review | F/SYS/04-A the review's Agenda (its notice) · F/SYS/04 Management Review Meeting Record · F/SYS/16 Quality & Product Safety Objectives |
| Internal Audit | F/SYS/05 Yearly Internal Audit Schedule · F/SYS/06 Internal Audit Schedule & Plan · F/SYS/07 Internal Audit Risk Assessment · F/SYS/08 Internal Audit Findings / Observation Report · F/SYS/10 Internal Audit NC Report |
| Corrective Action | F/SYS/11 Non-Conformance & Corrective Action Report (CAR) |
| HARA & Site Security | F/SYS/12 Monthly Review & HARA Verification · F/SYS/20 Annual HARA Review & Verification · F/SYS/17 Site Security Risk Assessment |
| Traceability & Recall | F/SYS/14 Backward Traceability · F/SYS/15 Forward Traceability · F/SYS/13 Mock Product Withdrawal Record |

F/SYS/09 is not on the master list and was not supplied. F/SYS/04-A and F/SYS/20 print numbers of their own that the
master list does not hold yet. F/SYS/03 and F/SYS/11 print an empty "Format No.:" box — their numbers are the master
list's. How often: F/SYS/05, 07, 17 and 20 once a year (1 January — F/SYS/20 prints "Next scheduled review: 1st January
2027"), F/SYS/12 monthly on the 22nd (the supplied meeting's day; the paper prints none — for the MR to confirm), and the
rest when they are needed.

**2. EVERY ONE IS EDITABLE — "always keep Edit option".** Each F/SYS format is a log sheet, so each has both Edits the
portal offers: **Edit** on a record (a verified one is reopened with a reason, changed and handed in again, and its
history keeps what it said before — §27), and **Edit format** on the format itself, which turns the page into the sheet
and lets its words, boxes, columns and lines be changed like a spreadsheet (§64). The pages supplied filled in are on
file as Verified live records, so they open read-only and are corrected with Edit, never typed over. The big sheets
stay quick on a slow laptop: a verified sheet is drawn as text, not disabled boxes, and a long one — the 173 documents
of F/SYS/01, the checklist of F/SYS/08 — shows its first lines at once and the rest a batch at a time (§56).

**EDIT IS FAST — "always keep Edit option fast".** Typing into F/SYS/01 reopened with Edit (173 lines of nine boxes,
some 1,560 boxes) took **900 ms a keystroke** at 6× CPU throttle; it now takes **about 80–110 ms**, near the 63–81 ms
of a small form, and nothing on the sheet looks or prints any differently. Measured, then mended, one cause at a time:
- **Only the line typed in is drawn again** (`components/records/LogSheetRecordView.tsx`): each line and each box above
  and below the grid is a memoised component with the same handlers on every render, the master data is read once per
  sheet, and the worked-out cells (`engine/computedCells.ts`, `purchaseRatings`, `calibration`, `maintenanceCalc`,
  `auditRisk`) hand back a line that did not change as the same line — so a keystroke redraws one line, not 173.
  Counting the changes Cancel edit would throw away is done when Cancel edit is pressed, not on every key.
- **Only the line typed in is painted again**: each line of a sheet open for writing is a paint layer of its own
  (`position: relative` on the line, `styles.css`), where the whole sheet was repainted on every key.
- **Only the lines near the screen are drawn**: on a sheet of more than 60 lines open for writing, a line more than
  about thirty lines off the screen is not drawn (`visibility: hidden`, set by an IntersectionObserver) — every box the
  browser draws was work on every keystroke, wherever it was. The line keeps its place, its boxes and what they hold,
  so nothing moves when it comes back before it scrolls into sight; printing draws every line, and the Excel and Word
  downloads (`utils/documentExport.ts`) take every line.
- **The writing stays as sharp as before**: the sidebar is painted above the page's content (`z-index: 1`); without
  it a sheet wide enough to scroll sideways had all its lines lifted onto a layer of their own and drawn fainter.
- **Mitra's pill waves without repainting the page**: the ring fades in and out (opacity, on the graphics card),
  where an animated shadow repainted the whole page every frame for the first five seconds of every page.
- **A box of prose sizes itself** (`field-sizing: content`) instead of each one being measured in turn: F/SYS/04's 37
  such boxes opened for Edit after 37 layouts. Browsers without it are measured as before.

**3. VERBATIM, TO THE LAST MISSPELLING** — "Document discription", "Format  discription", "Obsolate", "Was the Mock
Recall efecctive?", "satisafactory", "Hardner", "ingridents", "PTSL", "Pant Head", "coursed", "Minuts", "Offier" — and
nothing invented: a value the page does not hold is blank. F/SYS/03 and F/SYS/11 were supplied blank, and their samples
are plainly made up and say so.

**4. WHERE THE DIGITAL FORM DIFFERS FROM THE PAPER, AND WHY** — one grid per format, the rest boxes above and below it:
- **F/SYS/16 and F/SYS/05 are turned**: the paper prints two lines per objective or area (Plan / Actual); here each
  objective or area is ONE line with Plan and Actual side by side under each month, so the grid's own Sr. No. is the
  paper's, a plan is carried to the next sheet and an actual never is. F/SYS/16's third line for objective 8,
  "Actual - meters", is a group of its own. A value the sheet writes once across several months (a merged cell) is held
  in its first month, as Excel itself keeps a merged cell.
- **F/SYS/06's plan and its AUDIT SUMMARY** are one line per audited function each, so they are one grid, the summary
  under its own spanning heading.
- **F/SYS/07's merged section figures** sit on each section's first line, as Excel keeps them.
- **F/SYS/08's checklist** is a register whose lines the auditor may change — a later audit covers other clauses — carried
  forward from the last audit without its findings.
- **F/SYS/15's "1st Issue"** block is one issue: issues are the grid's lines.
- **F/SYS/04's objectives table** (agenda item 8) is its grid; the eleven agenda items, the attendance and the action
  items are boxes. F/SYS/14's Description / Observation table is label and value, so each Description is a box.
- The handwritten Sign columns of attendance and team tables are not typed; the portal's own sign-off is the Verify step.

**5. F/SYS/02 IS THE LIST AS LAST UPDATED.** The PDF supplied is an earlier print of the master list (135 formats). The
company's own workbook of it (R-2025, updated to 01.09.2026) holds 141: it adds F-MKT-05 and F-MKT-06 — which this system
already holds — F-PRD-27 to 30 and a third revision of F-QC-40. A. The record on file is the workbook, "Maintain as
updated"; the print is shown beside it. It settles one question left open in §75: **every format the plant keeps is
retained three years and then shredded** — which is the activity log archive's default of three years.

**6. F/SYS/07 WORKS OUT ITS OWN SUM AND AUDIT FREQUENCY** (engine/auditRisk.ts, in the one computed-cells pass of §74):
IQA NC + External NCs, and the frequency the printed criteria give — up to 4 Once / Year, 5 to 15 Twice / Year, 16 or more
3 times / Year. On the 2024 page it gives back exactly what the page printed, section by section.

**7. A JUDGEMENT IS MADE AFRESH — `autoFill.fresh`.** Until now the assistant copied every cell of a printed checklist from
the last sheet, so a new audit would have been prepared with the last audit's findings. A column can now be marked
fresh: an audit's Compliance / NC and comments, a verification's Yes / No and C / NC, an assessment's observation, a
month's actual. Mitra prepares the printed points, the team and the plans, and leaves every judgement to the person.

**8. THE INSIGHTS READ THE PSTL'S RECORDS TOGETHER — S1 to S6** (engine/insightRules.ts, §75's engine). Every limit is the
standard's own, printed on the plant's audit checklist (F/SYS/08): the withdrawal procedure tested at least annually
(3.13.7), traceability tested at least annually (3.11.4), an audit's non-conformities reported with their root cause and
corrective action (3.5.4).

| Rule | What it finds | On the supplied pages |
|---|---|---|
| S1 | a product's mock withdrawal more than a year old (due again on the same date a year on, a leap day between or not; a date still to come is no test done), or none on file for it (high) | LABEL (10.01.2025), Pouch (28.01.2025) and SHRINK SLEEVE (05.02.2025) all overdue |
| S2 | a backward or forward traceability test more than a year old, counted as S1 (high) | both, of December 2024 |
| S3 | an internal audit NC report not verified closed past its planned date, or a month after it with none (high after 90 days), saying so when the audit plan's summary marks the clause Closed | Feb -25/02 (4.7.6): its closing verification is empty, while F/SYS/06 marks 4.7.6 Closed |
| S4 | an NC on the audit checklist — "NC - 01", or in the column's own words, "Non compliance" — with no NC report for its clause | NC - 01 at 4.2.1 (wall painting peeling) has no F/SYS/10 |
| S5 | a traceability test dated out of its own order: on F/SYS/14 printed, inspected, slit and packed, dispatched, then tested; on F/SYS/15 received, issued, dispatched, then tested | F/SYS/14's printing production date 21.07.2027 — after its dispatch of 23.07.2024 |
| S6 | an NC at the monthly HARA verification (high) | none — April 2024 answered every question C |

The boxes are found by the words the form prints, so a box renamed with Edit format is still read.

**9. MITRA KNOWS THEM** — by number (F/SYS/04-A included) and by the words the team uses ("mock recall", "backward
traceability", "management review", "internal audit report" — which, being longer, wins over the supplier audit's
"audit report"), and the model's route guide lists them.

**Still to confirm with the PSTL / MR:** F/SYS/10's revision date (the paper prints 01.05.2013, the master list
01.03.23); F/SYS/03's revision (the paper Rev 01, the master list only revision 0); the Rev 01 of F/SYS/14 and 15 dated
01.04.2025 on the master list, which was not supplied; F/SYS/04-A and F/SYS/20 to be added to the master list; the day
of the month for F/SYS/12; the note "Not added in project" printed beside F-HR-11 Training Evaluation Record on the print
of F/SYS/02 — the HR module holds F/HR/11 as the Training Effectiveness Evaluation Record, the number its own paper
prints; and every discrepancy on the pages listed below.

**10. WHAT THE PAGES THEMSELVES SAY, KEPT AS WRITTEN AND REPORTED** — found while every value was compared with its page:
- **The internal audit of February 2025 is not closed out on paper.** F/SYS/06's summary marks both minor NCs, 4.2.1 and
  4.7.6, "Closed"; the only NC report supplied, Feb -25/02 for 4.7.6, has an empty closing verification (no date,
  verifier, Satisfactory/Unsatisfactory or Closed/Not Closed) and no planned closing date; there is no report at all for
  NC - 01 at 4.2.1. Neither F/SYS/05 schedule is dated or approved; F/SYS/06's Acknowledge and Verified By are blank.
  (S3 and S4 say so on the Insights page.)
- **F/SYS/14 prints a printing production date of 21.07.2027** — after the QC inspection it precedes (21.07.2024) and the
  dispatch (23.07.2024); and a sales order dated 12.07.2023, a year before its own customer order. Both are kept as
  printed (S5 flags the first). Its quantities add up: 12000 − 11100 = 900, 11100 − 10330 = 770, and 11 boxes × 10,500 +
  10,000 + 9,500 = 135,000 in 13 boxes, matching the order and the box number. F/SYS/15's 1970 − 986 = 984 holds too.
- **F/SYS/13's Pouch page reuses the Sleeve page's response**: its scenario is "smudged printing on the product name",
  but its Response from Customer describes "missing print on the EAN code in some of the sleeves" — for a pouch roll
  job. On all three pages **neither Yes nor No is ticked** for "Was the Mock Recall efecctive?" (left blank), and the
  Signature column is empty. Each Total time agrees with its start and end (1.02 hours, 1 hour 12 minutes, 12 minutes).
- **F/SYS/20's conclusion** says "Action items noted are minor and already being addressed" while the record notes none
  (every corrective action "Not required", "No other recommendations"); its new Plant Head and Pouching In charge are not
  on the review team. It writes the company "PUBLICATIONS" where every other page writes "PUBLICATION", and "GUAJRAT".
- **F/SYS/17's point 8** is clipped on the page; its full text is taken from the PDF's text layer. Every point is checked
  on the same day, 01.01.2026.
- **F/SYS/07's section 4** prints no auditee where 3, 5 and 6 print "Not applicable"; its title says YEAR 2024 while the
  NC table is headed (2023). Its totals are right (6 internal, 6 external), and the worked-out frequencies are the page's.
- **F/SYS/08** marks 3.4.4 "Compliance" beside "Not Applicable…"; gives 4.10.5 and 4.10.6 the same unfinished comment
  ("Such material is shredded & then given to concerned"); and answers 4.11.5 (pest proofing) with "Trend analysis records
  verified". Its clause shading and bold NC lines are not reproduced.
- **F/SYS/12's** team table prints 7 lines, **F/SYS/20's** 6; both teams' Sign cells are empty (8 lines are offered).
- **The management review of 21.07.2025 (F/SYS/04)**: item 7 (resources) is marked "Action required" with no discussion,
  and the New Action Item Detail is blank, so the action is recorded nowhere; item 1's result is unmarked; item 3 counts 1
  label complaint for January–June while objective 10 shows 2; item 6 says the sleeve and pouch mock recalls are "planned
  before 15.02.2025" in a July meeting, though F/SYS/13 shows both done (28.01 and 05.02.2025); item 8 counts 19 of 19
  objectives achieved above 90% although two are "NA" (new); item 9 names "PSTL (Mr. Vivek)" where every other line names
  Kapila Barad; item 10 reviews the Issue 6 manual at an Issue 7 review; nobody signed the attendance. Every □ on its nine
  pages is printed empty, with the result typed beside it.
- **F/SYS/04-A** prints line 08 with its two cells swapped ("Manager – Store" under Name, "Nalin Darji" under
  Designation) — kept so; no participant signed; Ajay Vaghela is "Manager – Production & Maintenance" there and
  "Manager – Production" on F/SYS/04.
- **F/SYS/16 (2026)**: its own totals do not add up — Breakdown 175 a month but Total 700 (four months), Wastage 7.5 a month
  but 8.0, Store 0.15 but 0.25, Training 15 and GMP 10 with a Total Plan of 0 — and it prints #DIV/0! for every month of
  label wastage; the supplier rating's actual still reads "To be collected in December 2024"; only January carries
  actuals. The file is named 2024-25, the sheet Year 2026. All kept as printed.
- **F/SYS/01** agrees with its workbook in every cell of all 173 rows. It writes GPPPL/PSMS/M/01 (three Ps) beside
  GPPL/PSMS/M/02; gives two different documents the number GPPL/PSMS/M/02 - SECTION G; lists "WORK PROCEDURE FOR DCMF
  MACHINE" twice (WP/18 and WP/20); dates POUCH/SOP/01 15.12.2025 beside its 2024 siblings (for the PSTL to confirm);
  and holds no date of its own — its latest revision is 15.07.2026, so it is filed under the day it was supplied.
- **F/SYS/02 — the print against the workbook**, line by line in data/seed/sysDocumentControlLayouts.ts: besides the six
  formats the print lacks, the workbook has later revisions for F-SYS-14 and 15 (01.04.2025), F-PRD-06 and 07
  (01.09.2026), F-PRD-26 (23.07.2025), F-QC-40. A (01.07.2026) and F-MNT-11 (15.12.2024); F-PRD-09 and F-PRD-13 swap
  names between the two; F-HR-20 is "Product Safety Culture Survey" in the workbook and "HARA pri" on the print; F-QC-15 A
  to G are 16.02.22 in one and 01.12.21 in the other; and F-MNT-09's revisions agree with its own page (Rev 02,
  01.09.2025) only in the workbook. Both list F-SYS-03, F-SYS-04 and F-MNT-02 at revision 0 while their pages print Rev 01.

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
24. **F/SYS format numbers and revisions** (§76). F/SYS/04-A and F/SYS/20 print numbers the Master List of
    Formats does not hold yet; F/SYS/03 and F/SYS/11 print an empty "Format No.:" box; F/SYS/03, F/SYS/04 and
    F-MNT-02 print Rev 01 where the list has revision 0 only; F/SYS/10 prints its revision date as 01.05.2013 where
    the list gives 01.03.23; the list gives F/SYS/14 and 15 a revision 1 of 01.04.2025, which was not supplied (the
    pages supplied are on Rev 00).
25. **Which master list of formats is current** (§76). The PDF of F/SYS/02 supplied on 25-Sep-2026 is an earlier
    print (135 formats) than the company's own workbook (141, to 01.09.2026). The record on file is the workbook;
    every difference is listed line by line in `sysDocumentControlLayouts.ts`. The print also carries the note "Not
    added in project" beside F-HR-11 (see item 23).
26. **How often the SYS formats fall due** (§76): F/SYS/12 monthly on the 22nd (the supplied meeting's day — the
    paper prints none); F/SYS/05, 07, 17 and 20 on 1 January; the management review, its notice and the objectives
    sheet when the PSTL calls them; each product's mock withdrawal and both traceability tests at least yearly (the
    Insights S1 and S2 watch the twelve months).
27. **The open points on the SYS pages** (§76 part 10): NC - 01 (4.2.1) and Feb -25/02's closing; F/SYS/14's printing
    date 21.07.2027 and sales order date 12.07.2023; the Pouch mock withdrawal's response text; the unticked
    "effective?" boxes; the MRM's item 7 action and item 3 complaint count; F/SYS/16's totals and #DIV/0!;
    POUCH/SOP/01's date of 15.12.2025.

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
