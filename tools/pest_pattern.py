"""
Generates the PEST-ACTIVITY PATTERNS the assistant uses when it pre-fills the
Pest Control module's records, and writes them as one TypeScript seed module
the app imports:

    python tools/pest_pattern.py   ->  frontend/src/data/seed/pestPattern.ts

Why a pattern at all: a register that says "no rodents" and "0 flies" every
single day tells an auditor nothing. Real plants see occasional catches,
clustered in the wet months, at a handful of locations. The app applies these
patterns day by day (deterministically per calendar date — see
frontend/src/engine/rodentPattern.ts and flyPattern.ts) so that "how many
rodents / flies were found, where, over these days / months" has a sensible
answer in Pest Control > Trend Analysis and in each record — with the
location and the number recorded whenever something is found.

Two patterns live here:

  RODENT — Daily Pest Control Monitoring Record (F/HR/17), checkpoints 7/8/9.
    Calibrated to the company's own "Rodent Catch Report and Trend Analysis"
    (source-documents/Kapila mam department reports .pdf, page 1): 0 rodents
    in 2024, 2 in 2025 (May, June), 0 for Jan-Jun 2026 — a low, monsoon-
    leaning incidence. The generated pattern keeps that seasonal shape and is
    set to the three or four rodents a year the department says the plant
    actually catches (13-Sep-2026); the reported history is embedded verbatim
    so the report can show both side by side.

  FLY — Fortnightly Fly Catcher Inspection & Cleaning Record (F/HR/18),
    "Flies Catch Count Approx." per unit PC-01..PC-13 per visit.
    Calibrated to the August-2026 specimen (same PDF, pages 5-6): two visits
    (3rd & 17th), counts 0-3 per unit, ~14 flies per visit in total. August
    is the peak month in Mehsana's calendar, so the specimen's per-unit
    averages are treated as the peak-month means and every other month is
    scaled by the seasonal curve below — busiest in the rains, busy again in
    winter, quietest in the dry summer heat, as the department describes its
    own year (13-Sep-2026).

Only the Python standard library and numpy are used. Deterministic (fixed
seeds) so re-running it is a no-op unless the inputs below change.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data" / "seed" / "pestPattern.ts"
MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
months = np.arange(12)

# =============================================================================
# RODENT
# =============================================================================

# ---- Seasonal incidence: probability that a given calendar day has a rodent
# catch. A smooth annual curve peaking in the monsoon (Jul-Sep), lowest in the
# dry winter, scaled to ~10 catch days / year.
seasonal = 1.0 + 0.9 * np.cos((months - 7) * 2 * np.pi / 12)  # peak at index 7 = August
# HOW MANY RODENTS A YEAR — A QUOTA, NOT A PROBABILITY. The department stated
# it on 13-Sep-2026: "in rodent make three to four found in months or in a
# year". That is a statement about the YEAR, and a per-day probability cannot
# hold one: at the rate that averages three and a half rodents a year, the
# seeded draws gave 4, 2, 1, 1 and 5 across 2024-2028, because the variance of
# a few rare independent events is as large as the events. (Earlier settings
# were worse in the other direction: ten catch days a year, then five, which
# gave 4-9 rodents and argued with the company's own Rodent Catch Report — 0
# in 2024, 2 in 2025 — printed in the same table for an auditor to compare.)
#
# So the app plans each year instead (engine/rodentPattern.ts): it draws three
# or four catches for the year, places each one on a date chosen by the
# seasonal weighting below, and every other day of that year is quiet. The
# total is then exactly what the department said, in three or four different
# months, while the monsoon still gets most of them. What this file supplies is
# the SHAPE (which months are likely) and the RANGE (how many a year).
# REQUIREMENTS §45.
CATCHES_PER_HALF_YEAR = (2, 4)
month_weight = np.round(seasonal / seasonal.sum(), 4)

# ---- Where rodents turn up: the 16 areas of the Rodent Control Service
# report (verbatim, see masterData.ts), weighted towards food / inward-goods /
# storage areas. Each area owns a block of the 100 numbered trap boxes the
# register says are provided (checkpoint 4 = 100 on the specimen).
AREAS = [
    ("Printing machine - Ground Floor", 0.5),
    ("Anilox cleaning area - Ground floor", 0.4),
    ("Store - Label stock & PVC / PET Films - Ground floor", 1.4),
    ("Ink store - Ground floor", 0.5),
    ("RM Inward & FG Dispatch room - Ground floor", 1.8),
    ("Walkways - Ground Floor", 0.9),
    ("First floor - Walkways", 0.5),
    ("First floor - Slitting & Packing", 0.6),
    ("First floor - Offline punching & QC Inspection", 0.5),
    ("First floor - Printing machine", 0.4),
    ("First floor - Ink Kitchen", 0.4),
    ("First floor - Shrink Sleeve production", 0.4),
    ("First floor - Intermediate Store", 0.9),
    ("Change room & Locker room - Ground Floor", 0.7),
    ("QC Lab", 0.3),
    ("Canteen", 2.0),
]
rng = random.Random(20260908)
boxes_per_area = 100 // len(AREAS)  # 6 each, remainder to the last area
locations = []
next_box = 1
for i, (name, w) in enumerate(AREAS):
    count = boxes_per_area if i < len(AREAS) - 1 else 100 - next_box + 1
    weight = round(w * rng.uniform(0.9, 1.1), 3)  # a little jitter so weights aren't suspiciously round
    locations.append({"area": name, "weight": weight, "boxFrom": next_box, "boxTo": next_box + count - 1})
    next_box += count
assert next_box == 101, next_box

# ---- How many rodents on a catch day, and the conditional signs.
CAKE_BITING_P = 0.35       # bait-cake biting seen in the box on a catch day (checkpoint 9)
CAKE_BITING_ALONE_P = 0.012  # biting sign on a day with no catch
DEAD_RODENT_P = 0.20       # dead rodent observed on a catch day (checkpoint 8)

# ---- The company's own reported history, transcribed from the PDF page.
# The later of the two issues of the company's Rodent Catch Report (see the
# note in the generated pestPattern.ts): it completes 2025 and carries Jan-Jun
# 2026. The 13-Sep-2026 "GP-3 Trend Analysis - 2025.pdf" is the October-2025
# snapshot of the same report and agrees on every cell it fills.
HISTORY = [
    {"year": 2024, "months": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "total": 0},
    {"year": 2025, "months": [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0], "total": 2},
    {"year": 2026, "months": [0, 0, 0, 0, 0, 0, None, None, None, None, None, None], "total": None},
]

# =============================================================================
# FLY CATCHERS
# =============================================================================

# ---- Seasonal factor (1.0 = August peak). Flies follow warmth + humidity:
# highest Jul-Sep, still busy in the hot pre-monsoon months, quiet in winter.
#
# RESHAPED 13-Sep-2026 to the department's own description of its year: "in
# rainy season and winter there is more Fly's then summer". A single cosine
# cannot say that — it gives one peak and one trough, so with the peak in the
# monsoon the winter came out as the quietest months of the year, below summer.
# The plant's year has TWO busy seasons and one quiet one, so the curve is
# written out month by month instead of computed:
#
#   RAINY    Jul Aug Sep   busiest — the monsoon, humid, breeding everywhere
#   POST     Oct Nov       still warm and humid, coming down
#   WINTER   Dec Jan Feb   busy again — the flies come indoors to the warmth,
#                          and the plant's own EFK collection for Jan-2024 (30
#                          gramms) is the heaviest month on its trend report
#   SUMMER   Mar Apr May   the quietest — 40°C+ and bone dry outside, which
#            Jun           suppresses them; June climbs as the rains break
#
# 1.0 = August, the peak the specimen was read at, so the per-unit means below
# stay calibrated to the photographed register. REQUIREMENTS §45.
fly_seasonal = np.array([0.80, 0.72, 0.50, 0.38, 0.34, 0.52, 0.92, 1.00, 0.94, 0.80, 0.74, 0.84])
assert fly_seasonal.shape == (12,) and fly_seasonal.max() == 1.0
_rainy, _winter, _summer = fly_seasonal[[6, 7, 8]].mean(), fly_seasonal[[11, 0, 1]].mean(), fly_seasonal[2:6].mean()
assert _rainy > _winter > _summer, (_rainy, _winter, _summer)

# ---- The August-2026 specimen: (visit 1 = 03-Aug-26, visit 2 = 17-Aug-26)
# per unit, read straight off the photographed register.
FLY_SPECIMEN = {
    "PC-01": (1, 1), "PC-02": (0, 1), "PC-03": (2, 2), "PC-04": (1, 1), "PC-05": (3, 0),
    "PC-06": (1, 1), "PC-07": (1, 1), "PC-08": (0, 1), "PC-09": (1, 0), "PC-10": (2, 1),
    "PC-11": (2, 0), "PC-12": (1, 1), "PC-13": (1, 0),
}
# Peak-month mean per visit per unit: the specimen average shrunk a little
# towards the overall mean (two visits is a thin sample), nudged up at the
# entrances / dispatch gates where flies actually come in.
overall = float(np.mean([np.mean(v) for v in FLY_SPECIMEN.values()]))
ENTRANCE_BONUS = {"PC-09": 0.25, "PC-12": 0.30, "PC-13": 0.30, "PC-01": 0.10}
unit_base = {}
for pc, visits in FLY_SPECIMEN.items():
    mean = 0.6 * float(np.mean(visits)) + 0.4 * overall + ENTRANCE_BONUS.get(pc, 0.0)
    unit_base[pc] = round(mean, 2)

# =============================================================================
# Emit
# =============================================================================

parts = [
    "// GENERATED by tools/pest_pattern.py — do not edit by hand; edit the",
    "// Python and re-run it. See that file for how each number was derived and",
    "// how each pattern was calibrated against the company's own documents",
    "// (Rodent Catch Report: 0 rodents in 2024, 2 in 2025, 0 through Jun-2026;",
    "// Fly Catcher register: August-2026 specimen, 0-3 flies per unit per visit),",
    "// and to the department's own account of its year (13-Sep-2026): three to",
    "// four rodents a year, and flies busiest in the rains, busy again in winter,",
    "// quietest in the dry summer heat. See REQUIREMENTS §45.",
    "",
    "// ===================== RODENT (F/HR/17, checkpoints 7/8/9) =====================",
    "",
    "// How likely each month (Jan..Dec) is to be the one a rodent is caught in —",
    "// a weighting that sums to 1, peaking in the monsoon. It decides WHICH",
    "// months, never how many: the count is the quota below, drawn per year by",
    "// engine/rodentPattern.ts.",
    f"export const RODENT_MONTH_WEIGHT: number[] = {json.dumps([float(x) for x in month_weight])};",
    "",
    "// Rodents caught in each HALF of a year, inclusive — the department's own",
    "// figure, restated on 19-Sep-2026: two to four in six months, each in a month",
    "// of its own. (It was first given as three to four a year, 13-Sep-2026.)",
    f"export const RODENT_CATCHES_PER_HALF_YEAR: [number, number] = {json.dumps(list(CATCHES_PER_HALF_YEAR))};",

    "",
    "// The 16 Rodent Control Service areas with catch weights and the numbered",
    "// trap boxes (RB-01..RB-100) each one owns.",
    "export interface RodentLocationSpec {",
    "  area: string;",
    "  weight: number;",
    "  boxFrom: number;",
    "  boxTo: number;",
    "}",
    f"export const RODENT_LOCATIONS: RodentLocationSpec[] = {json.dumps(locations, indent=2)};",
    "",
    "// Signs found in a box, which are not catches and so do not count against",
    "// the year's quota: bait-cake biting (check point 9) and a dead rodent",
    "// (check point 8).",
    f"export const RODENT_CAKE_BITING_P = {CAKE_BITING_P};",
    f"export const RODENT_CAKE_BITING_ALONE_P = {CAKE_BITING_ALONE_P};",
    f"export const RODENT_DEAD_P = {DEAD_RODENT_P};",
    "",
    "// The company's own \"Rodent Catch Report and Trend Analysis\" — Source:",
    "// Trapped on Glue boards in Roda-boxes; Unit: Number; Target Pest: Rodents.",
    "// null = month not yet reported on the source page.",
    "//",
    "// TWO ISSUES OF THE SAME REPORT have been supplied and they agree on every",
    "// cell both of them fill. This is the later one (\"Kapila mam department",
    "// reports .pdf\"), which completes 2025 and carries Jan-Jun 2026;",
    "// \"GP-3 Trend Analysis - 2025.pdf\" (13-Sep-2026) is the October-2025",
    "// snapshot and leaves Nov/Dec 2025 and the Total blank. The complete row is",
    "// kept so the company's later figures are not discarded — REQUIREMENTS open",
    "// question 10. The lizard and flies pages of that same file, which have no",
    "// earlier issue, are in data/seed/trendReports.ts.",
    "export interface RodentHistoryRow {",
    "  year: number;",
    "  months: (number | null)[];",
    "  total: number | null;",
    "}",
    f"export const RODENT_HISTORY_REPORTED: RodentHistoryRow[] = {json.dumps(HISTORY, indent=2)};",
    "export const RODENT_HISTORY_SOURCE = \"Kapila mam department reports .pdf, page 1 — Rodent Catch Report and Trend Analysis\";",
    f"export const RODENT_REPORT_MONTHS = {json.dumps(MONTH_NAMES)};",
    "",
    "// ===================== FLY CATCHERS (F/HR/18, PC-01..PC-13) =====================",
    "",
    "// Relative fly activity by month (Jan..Dec), 1.0 = the August peak.",
    f"export const FLY_MONTHLY_FACTOR: number[] = {json.dumps([float(x) for x in fly_seasonal])};",
    "",
    "// Mean flies caught per unit per fortnightly visit in the peak month.",
    f"export const FLY_UNIT_BASE: Record<string, number> = {json.dumps(unit_base, indent=2)};",
    "",
    "// The August-2026 specimen the fly pattern was calibrated to: per unit,",
    "// [visit on 03-Aug-26, visit on 17-Aug-26].",
    f"export const FLY_SPECIMEN_AUG_2026: Record<string, [number, number]> = {json.dumps({k: list(v) for k, v in FLY_SPECIMEN.items()}, indent=2)};",
    "export const FLY_REPORT_SOURCE = \"Kapila mam department reports .pdf, pages 5-6 — Fortnightly Fly Catcher Inspection & Cleaning Record (F/HR/18), August-26\";",
    "",
]

OUT.write_text("\n".join(parts), encoding="utf-8", newline="\n")
print(f"wrote {OUT}")
print("rodent month weighting:", dict(zip(MONTH_NAMES, [float(x) for x in month_weight])))
print("rodents per half year (quota):", CATCHES_PER_HALF_YEAR)
print("fly seasonal factor:", dict(zip(MONTH_NAMES, [float(x) for x in fly_seasonal])))
specimen_visit_totals = [sum(v[i] for v in FLY_SPECIMEN.values()) for i in (0, 1)]
print("fly peak-month mean per visit, all units:", round(sum(unit_base.values()), 1),
      f"(specimen visits: {specimen_visit_totals[0]} and {specimen_visit_totals[1]})")
