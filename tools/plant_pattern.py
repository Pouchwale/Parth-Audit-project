"""
Generates the PLANT BEHAVIOUR MODEL the app uses when it fills records, and
writes it as one TypeScript seed module the app imports:

    python tools/plant_pattern.py   ->  frontend/src/data/seed/plantPattern.ts

WHY THIS EXISTS
---------------
A year of records in which every reading sits on nominal, every check point
says Yes, every lot is Accepted and every record was verified the same
afternoon is not a good record system — it is an obviously synthetic one. The
first thing an auditor does is look for the exceptions: the reading that went
out of band, what was written in the Remark column, whether a Corrective
Action was raised, and how long it took to close. A register with no
exceptions at all tells them the register isn't being used.

So this file models how the plant actually behaves — mostly in control, with
occasional real excursions — and every excursion it produces is carried
through to its consequence (a remark, a summary-of-action row, a lot status
with a reason, a CAPA finding with a target date). The application applies the
model deterministically per calendar date (see
frontend/src/engine/plantSimulation.ts), so the same day always reads the same
way: an auditor can come back to 14-Aug and find the same 21.4 Sec. reading
and the same action against it.

Nothing here is invented out of thin air. Every rate and every wording is
either measured from the company's own specimens in source-documents/ or
taken verbatim from its own GAP Analysis Report. The provenance of each is
written above it, and repeated in REQUIREMENTS.md.

Only the Python standard library and numpy are used, with fixed seeds, so
re-running this is a no-op unless the inputs below change.
"""
from __future__ import annotations

import json
from pathlib import Path
from statistics import mean, pstdev

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data" / "seed" / "plantPattern.ts"

# =============================================================================
# 1. PROCESS READINGS — how much a reading moves, and how often it breaches
# =============================================================================
# Measured from the filled specimens themselves. Each list below is the actual
# column of numbers transcribed from the photographed register (the same
# transcription that seeds logSheetLayouts.ts), so the spread the app
# generates is the spread the plant actually writes down.

# F-QC-30 Lamination Adhesive Viscosity Record — 24 hourly readings,
# 6/9/26-7/9/26. Specification 20.0 +/- 1.0 Sec.
VISCOSITY_SPECIMEN = [
    19.93, 20.19, 21.08, 20.96, 21.00, 20.89, 19.73, 19.92, 19.20, 20.12, 20.52, 20.54,
    20.16, 19.78, 20.15, 20.89, 20.58, 19.76, 19.87, 19.52, 19.78, 19.16, 19.76, 19.59,
]
# F-QC-40.C Temperature Monitoring Record — hot room, 45 +/- 2 C, three days
# of six readings.
HOTROOM_SPECIMEN = [45, 45, 46, 44, 45, 46, 44, 44, 45, 46, 44, 45, 46, 44, 46, 45, 45, 44]
# F-QC-32 Adhesive Mixing Ratio Record — batch viscosity, five batches.
MIX_VISCOSITY_SPECIMEN = [19.90, 19.76, 19.89, 20.15, 20.12]


def spread(values: list[float]) -> float:
    """Population sd of a specimen column, rounded the way we emit it."""
    return round(pstdev(values), 3)


def breach_rate(values: list[float], lo: float, hi: float) -> float:
    """How often the specimen itself sat outside the printed band.

    Counting the band edge as a breach: 21.00 against a 21.0 limit is the
    reading an operator has to justify, and the app should treat it the same.
    """
    out = sum(1 for v in values if v <= lo or v >= hi)
    return round(out / len(values), 4)


# HOW A READING ACTUALLY MISBEHAVES. The viscosity specimen is the giveaway:
# its four highest readings (20.96, 21.00, 20.89 and the out-of-band 21.08)
# are CONSECUTIVE, 11:00 to 14:00. That is not random noise — that is the
# process drifting for a few hours and then being brought back. Modelling it
# as independent random spikes would produce a register no process engineer
# would believe, so the model has two parts:
#
#   * quiet noise around nominal, hour to hour;
#   * an occasional DRIFT EPISODE — the mean walks off for a few readings,
#     usually taking one or two of them outside the printed band, and then
#     recovers. That is what gets a line in the Remark column.
#
# Splitting the specimen's own spread (sd 0.553 over the whole day) into
# quiet noise plus one episode gives a quiet sd of roughly 0.3.
VISCOSITY_SPECIMEN_RATE = breach_rate(VISCOSITY_SPECIMEN, 19.0, 21.0)


def episode(rate: float, length: tuple[int, int], shift: tuple[float, float]) -> dict:
    """One drift episode: how often, how long, how far off (in half-bands)."""
    return {"episodeRate": rate, "minLength": length[0], "maxLength": length[1],
            "minShift": shift[0], "maxShift": shift[1]}


READING_MODELS = {
    # documentId.columnKey -> quiet noise + how the process drifts.
    # 24 readings a day; an episode roughly one day in five, 2-5 hours long,
    # is what reproduces the specimen day without making every day a bad day.
    "qc-viscosity.viscosity": {"sigma": 0.30, **episode(0.20, (2, 5), (0.75, 1.35)),
                               "source": "F-QC-30 specimen: sd 0.553 over the day, one 11:00-14:00 high run, 2 of 24 at/over the 21.0 limit"},
    # Hot room: a set-point with a door that gets left open. Six readings a
    # day, an episode about once a fortnight.
    "qc-temperature.*": {"sigma": 0.62, **episode(0.07, (1, 2), (0.6, 1.2)),
                         "source": "F-QC-40.C specimen: 18 readings, sd 0.78, none outside 45 +/- 2"},
    # Mixing station: three batches a day, tightly controlled (specimen sd
    # 0.148), so an off batch is uncommon and usually a fresh drum.
    "qc-adhesive-mixing.viscosity": {"sigma": 0.16, **episode(0.05, (1, 1), (0.9, 1.5)),
                                     "source": "F-QC-32 specimen: 5 batches, sd 0.148"},
}

# Anything without its own entry (machine set-points on the lamination
# sheets): dialled in per job, so they move a little job to job and very
# rarely drift out.
DEFAULT_READING_MODEL = {"sigmaFraction": 0.22, **episode(0.02, (1, 1), (0.5, 1.0))}

# What the operator writes in the Remark column when a reading goes out, and
# what was done about it — an out-of-band number with no explanation beside it
# is the single thing an auditor is most certain to raise.
EXCURSION_REMARKS = {
    "qc-viscosity": [
        {"remark": "Viscosity high — ethyl acetate added and re-circulated; re-checked after 15 min.",
         "action": "Solvent topped up; reading back within 20.0 +/- 1.0 at the next hour."},
        {"remark": "Viscosity low — fresh adhesive added to the pot; re-checked.",
         "action": "Mix corrected; next hourly reading in band."},
        {"remark": "Reading taken while the pot was being topped up — re-checked and in band.",
         "action": "Re-checked after mixing; within specification."},
    ],
    "qc-temperature": [
        {"remark": "Hot room door found open by material movement; closed and re-checked.",
         "action": "Door closed; temperature recovered at the next reading."},
        {"remark": "Heater cut-out tripped; reset by maintenance.",
         "action": "Reset and monitored for the rest of the shift."},
    ],
    "qc-adhesive-mixing": [
        {"remark": "Fresh adhesive drum opened — viscosity adjusted before use.",
         "action": "Batch re-mixed and re-checked before release to the machine."},
        {"remark": "Ethyl acetate quantity corrected after weighing check.",
         "action": "Batch re-mixed; second reading in band."},
    ],
}

# =============================================================================
# 2. DAILY PEST CONTROL MONITORING (F/HR/17) — the check points that fail
# =============================================================================
# Wording taken from the company's own GAP Analysis Report (Dec-2023,
# source-documents/GAP Analysis Report -Pest control Dec 2023.xlsx): those are
# the five things this plant was actually found doing wrong, in the words its
# own pest-control contractor used. A daily register that never once repeats
# one of them would be less believable than one that does.
#
# Rate: the contractor's inspection found 5 open items. A daily self-check
# that catches a housekeeping issue roughly once a fortnight (per check point
# rates below sum to ~0.075/day => ~1.6 findings a month) matches a plant
# that is in control but not perfect.
CHECKPOINT_ISSUES = {
    1: {
        "rate": 0.012,
        "issues": [
            {
                "description": "Self-closer of the RM inward door not closing fully; door standing open.",
                "action": "Door closer adjusted by maintenance and re-checked at the end of the shift.",
                "remarks": "Verified closing properly.",
            },
            {
                "description": "PVC strip curtain at the dispatch shutter torn — three strips missing.",
                "action": "Damaged strips replaced from stock the same day.",
                "remarks": "Ref. GAP finding: no PVC strip curtain at RM inward shutter.",
            },
        ],
    },
    2: {
        "rate": 0.010,
        "issues": [
            {
                "description": "Gap observed at the utility area opening (birds / flying insects can enter).",
                "action": "Maintenance informed; opening closed with net / screen.",
                "remarks": "Ref. GAP finding 1 (Dec-2023).",
            },
            {
                "description": "Cable entry point above the ink store not sealed.",
                "action": "Sealed with cement mortar; re-checked next day.",
                "remarks": "",
            },
        ],
    },
    3: {
        "rate": 0.014,
        "issues": [
            {
                "description": "Fly killer machine PC-04 found switched off at the time of checking.",
                "action": "Machine switched on; shift in-charge briefed to keep it on round the clock.",
                "remarks": "Ref. GAP finding: fly killer machine turned off at inspection.",
            },
            {
                "description": "One tube light of PC-07 not glowing.",
                "action": "Tube replaced the same day; unit re-checked and working.",
                "remarks": "",
            },
        ],
    },
    5: {
        "rate": 0.008,
        "issues": [
            {
                "description": "RBS numbering not legible on two rodent boxes near the canteen.",
                "action": "Numbering re-painted on the wall as per the pest control layout.",
                "remarks": "Ref. GAP finding 2 (Dec-2023).",
            },
        ],
    },
    6: {
        "rate": 0.010,
        "issues": [
            {
                "description": "Rodent box displaced during floor cleaning — found away from its marked position.",
                "action": "Box repositioned as per the pest control layout; housekeeping briefed.",
                "remarks": "",
            },
            {
                "description": "Material stacked against the wall in the store, blocking two rodent boxes.",
                "action": "Material re-stacked away from the wall; boxes accessible again.",
                "remarks": "Ref. GAP finding 3 (Dec-2023) — materials stored haphazardly.",
            },
        ],
    },
    # Check point 10 ("Are Fly catcher tube lights having validity of
    # usage?") is deliberately NOT here. The F/HR/18 register carries two
    # FIXED dates for every one of the thirteen units — installed 24-11-2025,
    # replacement due 23-11-2026, as the department states them (REQUIREMENTS
    # §44) — so a tube flagged as past its validity would contradict the fly
    # catcher register printed beside it. Once that due date passes, the
    # assistant's own F/HR/18 note is what raises it, off the register's own
    # dates rather than off a generated pattern. A tube that simply fails is
    # check point 3 above ("One tube light of PC-07 not glowing").
}

# =============================================================================
# 3. QC INSPECTION RECORDS — how lots are dispositioned
# =============================================================================
# Lot status options are the printed ones (F/QC/34, /35, /37):
# Accepted | Reject / Scrap | Segregation | Accepted on Deviation.
# A packaging converter running well accepts the great majority of lots and
# takes a handful on deviation; outright scrap is rare and memorable. The
# reasons are written in the vocabulary of the printed test parameters on each
# format, so the reason always matches a parameter the sheet actually has.
LOT_DECISIONS = [
    {"status": "Accepted", "weight": 0.930, "reason": ""},
    {"status": "Accepted on Deviation", "weight": 0.045, "reason": "DEVIATION"},
    {"status": "Segregation", "weight": 0.018, "reason": "SEGREGATION"},
    {"status": "Reject / Scrap", "weight": 0.007, "reason": "REJECT"},
]

LOT_REASONS = {
    "qc-inspection-pouching": {
        "DEVIATION": [
            "Centre seal width 8 mm against 10 mm specified — accepted on deviation with customer's verbal approval; seal strength checked OK.",
            "Pouch height 178 mm against 181 mm specified (-3 mm) — within customer's agreed tolerance, accepted on deviation.",
        ],
        "SEGREGATION": [
            "Leak test failed on 4 pouches of the first 50 — lot segregated, 100% leak testing done before dispatch.",
            "Zipper position varying from top on part of the lot — segregated for re-inspection.",
        ],
        "REJECT": [
            "Repeated leak at the bottom gusset seal; sealing jaw temperature found low. Lot rejected / scrapped and job re-run after jaw correction.",
        ],
    },
    "qc-inspection-slitting": {
        "DEVIATION": [
            "Bond strength 0.240 kg against 0.300 kg specified — accepted on deviation for a non-retort application after QA review.",
            "Slitted roll width 258 mm against 260 mm as per job card — accepted on deviation, within customer tolerance.",
        ],
        "SEGREGATION": [
            "Abnormal odour noticed on two rolls — segregated and kept for 48 h airing, re-tested before dispatch.",
        ],
        "REJECT": [
            "Bond strength failure across the mother roll (delamination on peel). Lot rejected / scrapped; adhesive batch quarantined.",
        ],
    },
    "qc-inspection-printed-film": {
        "DEVIATION": [
            "Colour shade marginally off against the approved draw-down on one deck — accepted on deviation with customer's approval on shade card.",
            "Print registration variation of 0.3 mm on the repeat — accepted on deviation, legibility unaffected.",
        ],
        "SEGREGATION": [
            "Ink smudging observed in part of the reel — segregated for re-inspection and partial rewinding.",
        ],
        "REJECT": [
            "Misregistration beyond limit and text overlap on the barcode panel; lot rejected / scrapped and reprinted.",
        ],
    },
}

# How much a measured observation moves between two lots of the same job —
# pouch height, seal width, GSM, roll width. Small: these are set-up
# dimensions checked with a scale, not a drifting process reading.
MEASUREMENT_VARIATION = 0.015  # +/- 1.5%

# F/QC/13 In Process Quality Control — the grade the QA person writes against
# each of the six printing parameters. The form's own rule (printed on it, in
# Gujarati): more than one C grade and printing stops for a QA Manager
# decision; an F grade and printing stops immediately. So C is uncommon and F
# is rare and memorable — but a register with only A and B grades in it for a
# whole year, which is what the app produced before, means nobody is grading.
GRADE_MIX = [
    {"value": "A", "weight": 0.60},
    {"value": "B", "weight": 0.32},
    {"value": "C", "weight": 0.074},
    {"value": "F", "weight": 0.006},
]
# The defect count that goes with a grade (printed rule: <11% of total ups =
# A, <21% = B, <25% = C, >25% = F).
GRADE_DEFECTS = {"A": ["-", "-", "+1"], "B": ["+2", "+2", "+3"], "C": ["+4", "+5"], "F": ["+8", "+11"]}
# What the QA person writes in the Remarks box when the rule is triggered.
GRADE_ACTIONS = {
    "C": "More than one C grade — printing stopped and QA Manager decided how to proceed; job restarted after correction.",
    "F": "F grade — printing stopped immediately as per the grading rule; QA Manager and supervisor informed.",
}

# =============================================================================
# 4. THE JOBS THAT RUN — so two days never look identical
# =============================================================================
# Job names, FG codes and PO numbers are the ones transcribed from the
# photographed lamination sheets (07-09-26) and the QC inspection registers.
# Nothing invented: the plant's real customers and products, rotated the way a
# real machine schedule rotates, with PO numbers advancing over time the way a
# real PO series does.
JOB_POOL = [
    {"fgCode": "7204", "jobName": "VP Bedekar Fenugreek Powder", "customer": "VP Bedekar",
     "layer1Type": "PET", "layer2Type": "MetPET", "layer1Kg": 12.0, "layer2Kg": 51.5, "rollWeight": 69.1,
     "okMeters": 1950, "lineSpeed": 81, "nipTemp": 65, "runMinutes": 50},
    {"fgCode": "7205", "jobName": "VP Bedekar Cumin Powder", "customer": "VP Bedekar",
     "layer1Type": "PET", "layer2Type": "MetPET", "layer1Kg": 12.5, "layer2Kg": 51.1, "rollWeight": 70.2,
     "okMeters": 1950, "lineSpeed": 81, "nipTemp": 70, "runMinutes": 55},
    {"fgCode": "7206", "jobName": "VP Bedekar Jeshthamadh Powder", "customer": "VP Bedekar",
     "layer1Type": "PET", "layer2Type": "MetPET", "layer1Kg": 18.0, "layer2Kg": 51.5, "rollWeight": 70.0,
     "okMeters": 1950, "lineSpeed": 65, "nipTemp": 70, "runMinutes": 75},
    {"fgCode": "7202", "jobName": "VP Bedekar Dry Ginger Powder", "customer": "VP Bedekar",
     "layer1Type": "PET", "layer2Type": "MetPET", "layer1Kg": 18.0, "layer2Kg": 51.0, "rollWeight": 70.0,
     "okMeters": 1950, "lineSpeed": 65, "nipTemp": 70, "runMinutes": 90},
    {"fgCode": "6766", "jobName": "Sweet Karam Gusset", "customer": "Sweet Karam",
     "layer1Type": "BOPP", "layer2Type": "MetPET", "layer1Kg": 14.0, "layer2Kg": 48.0, "rollWeight": 62.0,
     "okMeters": 1800, "lineSpeed": 130, "nipTemp": 60, "runMinutes": 60},
    {"fgCode": "5420", "jobName": "California Almonds and Whole Cashews", "customer": "Gulab Oil And Food",
     "layer1Type": "BOPP", "layer2Type": "MetPET", "layer1Kg": 16.0, "layer2Kg": 52.0, "rollWeight": 72.5,
     "okMeters": 2100, "lineSpeed": 95, "nipTemp": 68, "runMinutes": 70},
    {"fgCode": "5703", "jobName": "Gulab Oil Pouch Film", "customer": "Gulab Oil And Food",
     "layer1Type": "PET", "layer2Type": "LDPE", "layer1Kg": 15.0, "layer2Kg": 49.5, "rollWeight": 68.0,
     "okMeters": 2000, "lineSpeed": 88, "nipTemp": 66, "runMinutes": 65},
]

# The PO series seen on the specimens (88823-88903 on 07-09-26). Real PO
# numbers climb steadily; the app derives a job's PO from this base plus the
# days elapsed, so a September sheet and a March sheet never share a PO.
PO_SERIES = {"base": 88823, "onDate": "2026-09-07", "perDay": 6}

# How many jobs a lamination shift actually gets through: the specimen sheet
# has five rows, of which the last was still running (blank end time).
JOBS_PER_SHIFT = [{"value": 3, "weight": 0.22}, {"value": 4, "weight": 0.4}, {"value": 5, "weight": 0.3}, {"value": 6, "weight": 0.08}]

# =============================================================================
# 5. HOW WORK ACTUALLY GETS SIGNED OFF
# =============================================================================
# A record system where every record was submitted at 10:00 and verified at
# 15:00 on the same day is the clearest possible tell that the data is
# generated. Real sign-off lags: most same day, some the next working day, the
# occasional one that sat over a weekly off. Rejections are uncommon but they
# happen, and they happen for boring, believable reasons.
SUBMIT_LAG_DAYS = [{"value": 0, "weight": 0.82}, {"value": 1, "weight": 0.14}, {"value": 2, "weight": 0.04}]
VERIFY_LAG_DAYS = [{"value": 0, "weight": 0.46}, {"value": 1, "weight": 0.3}, {"value": 2, "weight": 0.14},
                   {"value": 3, "weight": 0.06}, {"value": 5, "weight": 0.03}, {"value": 8, "weight": 0.01}]

# Of the records that are past their due date: most are verified, a few are
# still waiting for the verifier, a couple were sent back.
OUTCOME_MIX = [
    {"value": "Verified", "weight": 0.80},
    {"value": "Pending Verification", "weight": 0.13},
    {"value": "Rejected", "weight": 0.04},   # sent back and still being corrected
    {"value": "In Progress", "weight": 0.03},  # started, never finished — an auditor's favourite find
]

REJECTION_REASONS = {
    "daily-pest-monitoring": [
        "Time of checking left blank — please complete before re-submitting.",
        "Check point 8 answered Yes but the location was not written in.",
        "Checker name does not match the person who did the round.",
    ],
    "fly-catcher": [
        "Catch count for PC-05 does not match the board photographed at cleaning.",
        "Catch counts entered for 11 of 13 units only.",
    ],
    "service-report": [
        "Customer's countersignature missing on the visit report.",
        "Quantity used not recorded against three areas.",
    ],
    "log-sheet": [
        "Out-of-band reading not explained in the Remark column.",
        "Shift and operator name do not match the production plan.",
        "Batch number of the adhesive drum not updated after the change-over.",
    ],
    "training-record": [
        "Attendance sheet reference not attached.",
    ],
}

# The people who sign. Taken from the specimens: Jeni and Singh sign the QC
# registers by shift, Gaurav Singh runs Lamination-1, Roshni checks the pest
# register, Kapila Barad verifies.
SHIFT_ROSTER = {
    "qc": {"day": "Jeni", "night": "Singh"},
    "lamination": ["Gaurav Singh", "Mahesh Patel", "Suresh Chauhan"],
    "pestChecker": ["Roshni", "Vijay"],
    "verifier": ["Kapila Barad"],
}

# =============================================================================
# 6. SERVICE REPORT REMARKS — what a technician actually writes
# =============================================================================
# The April-2026 service reports carry "No Rodent Trapped" and "-" almost
# everywhere. A visit where the technician noticed nothing at all in any of 16
# areas, every fortnight, all year, is not how the visits read.
# The rate is per AREA per visit, and a visit covers 16 areas on the rodent
# report — so 0.015 is about one thing worth writing up every fourth visit,
# roughly six a year from the contractor. That sits alongside the ~30 the
# daily register raises, against the five the contractor's own Dec-2023
# inspection found: enough for the CAPA log to have a real life, not so many
# that the plant reads as out of control. Wording stays area-agnostic, since
# these attach to whichever of the sixteen areas the model picks.
SERVICE_REMARKS = {
    "rodent": {
        "routine": ["No Rodent Trapped", "No Rodent Trapped", "No Rodent Trapped", "Bait consumed - replaced", "Glue board replaced"],
        "finding": [
            {"remark": "Rodent trapped - removed", "raisesFinding": False},
            {"remark": "Bait cake biting observed - box re-baited", "raisesFinding": False},
            {"remark": "Box found displaced - repositioned", "raisesFinding": True,
             "finding": "Rodent bait station found displaced from its marked position during the fortnightly service.",
             "correctiveAction": "Station repositioned as per the pest control layout; housekeeping team briefed."},
            {"remark": "Entry gap observed - reported", "raisesFinding": True,
             "finding": "Gap that could allow pest entry noticed by the service technician during treatment.",
             "correctiveAction": "Gap to be closed by maintenance; verified at the next fortnightly visit."},
        ],
        "findingRate": 0.015,
    },
    "general": {
        "routine": ["-", "-", "-", "Sprayed as per schedule", "Cockroach activity nil"],
        "finding": [
            {"remark": "Cockroach activity seen - gel applied", "raisesFinding": False},
            {"remark": "Ant trail seen - treated", "raisesFinding": False},
            {"remark": "Open drain point - reported", "raisesFinding": True,
             "finding": "Open drain point found in the area during pest control service.",
             "correctiveAction": "Drain covered; area supervisor briefed to keep drain points covered."},
        ],
        "findingRate": 0.015,
    },
    "fly": {
        "routine": ["-", "-", "-", "Fogging done", "Nil activity"],
        "finding": [
            {"remark": "Fly activity high - extra fogging done", "raisesFinding": False},
            {"remark": "Fly catcher found switched off", "raisesFinding": True,
             "finding": "Fly killer unit found switched off during the fortnightly fly control service.",
             "correctiveAction": "Unit switched on; shift in-charge briefed to keep all units energised round the clock."},
        ],
        "findingRate": 0.015,
    },
}

# =============================================================================
# 7. HOW A DEVIATION BECOMES A CORRECTIVE ACTION
# =============================================================================
# The point of the whole system: an auditor follows a deviation to the action
# raised against it and to its closure. These are the target/closure lags the
# app applies to a finding it raises from an observed deviation.
CAPA_MODEL = {
    # Days from the observation to the target date on the finding.
    "targetDays": [{"value": 7, "weight": 0.35}, {"value": 15, "weight": 0.45}, {"value": 30, "weight": 0.20}],
    # Of findings whose target date has passed: closed on time, closed late,
    # or still open past target (which is what the Dashboard counts as an
    # open corrective action).
    "closure": [
        {"value": "on-time", "weight": 0.62},
        {"value": "late", "weight": 0.24},
        {"value": "open", "weight": 0.14},
    ],
    "lateDays": [{"value": 3, "weight": 0.5}, {"value": 6, "weight": 0.3}, {"value": 11, "weight": 0.2}],
}


# =============================================================================
# emit
# =============================================================================
def ts(value: object, indent: int = 0) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False).replace("\n", "\n" + " " * indent)


HEADER = """// GENERATED by tools/plant_pattern.py — do not edit by hand; edit the Python
// and re-run it. That file documents where every number and every line of
// wording came from.
//
// THE PLANT BEHAVIOUR MODEL. A year of records in which every reading sits on
// nominal, every check point says Yes and every lot is Accepted is an
// obviously synthetic one — the first thing an auditor looks for is the
// exceptions and what was done about them. This model says how often the real
// plant departs from nominal, in what way, and what happens next; the app
// applies it deterministically per calendar date (engine/plantSimulation.ts),
// so the same day always reads the same way on every device.
//
// Calibrated against the company's own documents:
//   * F-QC-30 / F-QC-32 / F-QC-40.C filled specimens (the spread of the
//     readings, and how often they touched the printed limit)
//   * GAP Analysis Report, Dec-2023 (the check-point findings, verbatim)
//   * the photographed lamination sheets of 07-09-26 (jobs, PO series)
//   * Service Report April-2026 (the remarks a technician writes)
"""


def main() -> None:
    parts: list[str] = [HEADER]

    parts.append(f"""
// ---------------------------------------------------------------------------
// 1. Process readings

export interface ReadingModel {{
  /** Quiet-period sd, in the column's own unit... */
  sigma?: number;
  /** ...or, with no specimen to measure, as a fraction of the half-band. */
  sigmaFraction?: number;
  /** Probability that a day has a drift episode on this reading. */
  episodeRate: number;
  /** How many consecutive readings an episode lasts. */
  minLength: number;
  maxLength: number;
  /** How far the mean walks off during it, in half-bands (>1 goes out of band). */
  minShift: number;
  maxShift: number;
}}

/** Keyed "documentId.columnKey"; "documentId.*" applies to every numeric column. */
export const READING_MODELS: Record<string, ReadingModel> = {ts({k: {kk: vv for kk, vv in v.items() if kk != 'source'} for k, v in READING_MODELS.items()})};

export const DEFAULT_READING_MODEL: ReadingModel = {ts(DEFAULT_READING_MODEL)};

export interface ExcursionRemark {{ remark: string; action: string; }}

/** What gets written in the Remark column when a reading goes out, per document. */
export const EXCURSION_REMARKS: Record<string, ExcursionRemark[]> = {ts(EXCURSION_REMARKS)};
""")

    parts.append(f"""
// ---------------------------------------------------------------------------
// 2. Daily Pest Control Monitoring (F/HR/17) — the check points that fail.
// Wording is the company's own, from the Dec-2023 GAP Analysis Report.

export interface CheckpointIssue {{
  description: string;
  action: string;
  remarks: string;
}}

export interface CheckpointIssueModel {{
  /** Probability that this check point is flagged on a given working day. */
  rate: number;
  issues: CheckpointIssue[];
}}

export const CHECKPOINT_ISSUES: Record<number, CheckpointIssueModel> = {ts(CHECKPOINT_ISSUES)};
""")

    parts.append(f"""
// ---------------------------------------------------------------------------
// 3. QC inspection records — how lots are dispositioned.

export interface Weighted<T> {{ value: T; weight: number; }}

export interface LotDecisionSpec {{ status: string; weight: number; reason: string; }}

export const LOT_DECISIONS: LotDecisionSpec[] = {ts(LOT_DECISIONS)};

/** documentId -> reason kind -> the wording, in that format's own vocabulary. */
export const LOT_REASONS: Record<string, Record<string, string[]>> = {ts(LOT_REASONS)};

/** How much a measured observation moves between two lots of the same job. */
export const MEASUREMENT_VARIATION = {MEASUREMENT_VARIATION};

/** F/QC/13 printing grades, and what the form's own rule says to do about them. */
export const GRADE_MIX: Weighted<string>[] = {ts(GRADE_MIX)};
export const GRADE_DEFECTS: Record<string, string[]> = {ts(GRADE_DEFECTS)};
export const GRADE_ACTIONS: Record<string, string> = {ts(GRADE_ACTIONS)};
""")

    parts.append(f"""
// ---------------------------------------------------------------------------
// 4. The jobs that run, so two days never look identical.

export interface JobSpec {{
  fgCode: string;
  jobName: string;
  customer: string;
  layer1Type: string;
  layer2Type: string;
  layer1Kg: number;
  layer2Kg: number;
  rollWeight: number;
  okMeters: number;
  lineSpeed: number;
  nipTemp: number;
  runMinutes: number;
}}

export const JOB_POOL: JobSpec[] = {ts(JOB_POOL)};

/** PO numbers climb with the calendar, as a real PO series does. */
export const PO_SERIES = {ts(PO_SERIES)};

export const JOBS_PER_SHIFT: Weighted<number>[] = {ts(JOBS_PER_SHIFT)};
""")

    parts.append(f"""
// ---------------------------------------------------------------------------
// 5. How work actually gets signed off.

export const SUBMIT_LAG_DAYS: Weighted<number>[] = {ts(SUBMIT_LAG_DAYS)};
export const VERIFY_LAG_DAYS: Weighted<number>[] = {ts(VERIFY_LAG_DAYS)};
export const OUTCOME_MIX: Weighted<string>[] = {ts(OUTCOME_MIX)};
export const REJECTION_REASONS: Record<string, string[]> = {ts(REJECTION_REASONS)};
export const SHIFT_ROSTER = {ts(SHIFT_ROSTER)};
""")

    parts.append(f"""
// ---------------------------------------------------------------------------
// 6. Service report remarks — what a technician actually writes.

export interface ServiceFinding {{
  remark: string;
  raisesFinding: boolean;
  finding?: string;
  correctiveAction?: string;
}}

export interface ServiceRemarkModel {{
  routine: string[];
  finding: ServiceFinding[];
  findingRate: number;
}}

export const SERVICE_REMARKS: Record<string, ServiceRemarkModel> = {ts(SERVICE_REMARKS)};
""")

    parts.append(f"""
// ---------------------------------------------------------------------------
// 7. How a deviation becomes a corrective action, and when it closes.

export const CAPA_MODEL = {ts(CAPA_MODEL)};
""")

    OUT.write_text("".join(parts), encoding="utf-8")
    print(f"wrote {OUT}")
    print(f"  viscosity  specimen sd={spread(VISCOSITY_SPECIMEN)}, {VISCOSITY_SPECIMEN_RATE:.1%} of its readings at/over the limit")
    print(f"             -> quiet sd {READING_MODELS['qc-viscosity.viscosity']['sigma']}, drift episode {READING_MODELS['qc-viscosity.viscosity']['episodeRate']:.0%} of days")
    print(f"  hot room   specimen sd={spread(HOTROOM_SPECIMEN)} -> quiet sd {READING_MODELS['qc-temperature.*']['sigma']}, episode {READING_MODELS['qc-temperature.*']['episodeRate']:.0%} of days")
    print(f"  mixing     specimen sd={spread(MIX_VISCOSITY_SPECIMEN)} -> quiet sd {READING_MODELS['qc-adhesive-mixing.viscosity']['sigma']}, episode {READING_MODELS['qc-adhesive-mixing.viscosity']['episodeRate']:.0%} of days")
    daily = sum(v["rate"] for v in CHECKPOINT_ISSUES.values())
    print(f"  F/HR/17    {daily:.3f} findings per working day  (~{daily * 26:.1f} a month)")
    print(f"  lots       {1 - LOT_DECISIONS[0]['weight']:.1%} of inspections not plain Accepted")


if __name__ == "__main__":
    main()
