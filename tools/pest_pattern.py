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
    leaning incidence. The generated pattern keeps that seasonal shape but
    is deliberately a little richer (roughly 8-12 catch days a year) so the
    trend is visible in a demo year; the reported history is embedded
    verbatim so the report can show both side by side.

  FLY — Fortnightly Fly Catcher Inspection & Cleaning Record (F/HR/18),
    "Flies Catch Count Approx." per unit PC-01..PC-13 per visit.
    Calibrated to the August-2026 specimen (same PDF, pages 5-6): two visits
    (3rd & 17th), counts 0-3 per unit, ~14 flies per visit in total. August
    is the peak month in Mehsana's calendar, so the specimen's per-unit
    averages are treated as the peak-month means and every other month is
    scaled down by a seasonal factor (February ≈ a third of August).

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
# Reconciled downwards (09-Sep-2026) from 10 to 5. The company's own Rodent
# Catch Report — which the app prints alongside the digital total, so the two
# sit in the same table for an auditor to compare — reports 0 rodents in 2024,
# 2 in 2025 and 0 through Jun-2026. A digital column showing eleven catch days
# a year next to a reported column showing two contradicts the very document
# it is printed beside. Five catch days keeps the seasonal shape visible
# without arguing with the plant's own history.
TARGET_CATCH_DAYS_PER_YEAR = 5.0
daily_rate = seasonal / seasonal.sum() * TARGET_CATCH_DAYS_PER_YEAR / 30.4
daily_rate = np.round(daily_rate, 4)

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
COUNT_DIST = [{"count": 1, "p": 0.72}, {"count": 2, "p": 0.22}, {"count": 3, "p": 0.06}]
SECOND_LOCATION_P = 0.15   # a second area catches on the same day
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
fly_seasonal = 0.35 + 0.65 * (1 + np.cos((months - 7) * 2 * np.pi / 12)) / 2
fly_seasonal = np.round(fly_seasonal, 3)

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
    "// Fly Catcher register: August-2026 specimen, 0-3 flies per unit per visit).",
    "",
    "// ===================== RODENT (F/HR/17, checkpoints 7/8/9) =====================",
    "",
    "// Probability that a given calendar day has a rodent catch, by month",
    f"// (Jan..Dec). Seasonal — peaks in the monsoon, ~{TARGET_CATCH_DAYS_PER_YEAR:.0f} catch days a year.",
    f"export const RODENT_MONTHLY_RATE: number[] = {json.dumps([float(x) for x in daily_rate])};",
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
    "// Rodents per catch day.",
    f"export const RODENT_COUNT_DIST: {{ count: number; p: number }}[] = {json.dumps(COUNT_DIST)};",
    f"export const RODENT_SECOND_LOCATION_P = {SECOND_LOCATION_P};",
    f"export const RODENT_CAKE_BITING_P = {CAKE_BITING_P};",
    f"export const RODENT_CAKE_BITING_ALONE_P = {CAKE_BITING_ALONE_P};",
    f"export const RODENT_DEAD_P = {DEAD_RODENT_P};",
    "",
    "// The company's own \"Rodent Catch Report and Trend Analysis\" — Source:",
    "// Trapped on Glue boards in Roda-boxes; Unit: Number; Target Pest: Rodents.",
    "// null = month not yet reported on the source page.",
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
print("rodent daily rate by month:", dict(zip(MONTH_NAMES, [float(x) for x in daily_rate])))
print("expected rodent catch days / year:", round(float((daily_rate * 30.4).sum()), 1))
print("fly seasonal factor:", dict(zip(MONTH_NAMES, [float(x) for x in fly_seasonal])))
specimen_visit_totals = [sum(v[i] for v in FLY_SPECIMEN.values()) for i in (0, 1)]
print("fly peak-month mean per visit, all units:", round(sum(unit_base.values()), 1),
      f"(specimen visits: {specimen_visit_totals[0]} and {specimen_visit_totals[1]})")
