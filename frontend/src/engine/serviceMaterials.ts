import type { ServiceReportAreaLine } from "../types";

// Fixed material/method-of-application defaults per Service Report variant
// (see docs/REQUIREMENTS.md §5 for provenance — the two real April-2026 service
// report specimens and the SOP's chemical charts). The chemical used and how
// it's applied don't change visit to visit; only quantity and remarks do —
// so these are treated as fixed reference values pre-filled onto every line,
// not something the technician retypes (or can retype) each visit.
export interface FixedMaterial {
  materialName: string;
  methodOfApplication: string;
}

const VARIANT_DEFAULTS: Record<string, FixedMaterial> = {
  "Rodent Control Service": { materialName: "Glue Board", methodOfApplication: "Trouble gum placement" },
  "General Pest Control Services": { materialName: "Deltamethrin 2.5% SC", methodOfApplication: "Spraying" },
  "Fly Control Services": { materialName: "Beta-Cyfluthrin 2.45% SC", methodOfApplication: "Spraying" },
};

// THE RODENT REPORT'S STANDARD LAYOUT (the owner, 17-Oct-2026, from the contractor's March-2026 report): the
// first eight areas carry the glue boards and the last eight the bait. The two groups are two merged blocks on the
// paper, each with its own material, quantity and method. (The April-2026 file the report was first built from
// merges the same two blocks of eight; one of its lines being typed in the bait block was read as "one bait area".)
// Keyed by the service and the area, because the same area name is also on the other two services ("Canteen").
const RODENT_BAIT_AREAS = [
  "First floor - Offline punching & QC Inspection",
  "First floor - Printing machine",
  "First floor - Ink Kitchen",
  "First floor - Shrink Sleeve production",
  "First floor - Intermediate Store",
  "Change room & Locker room - Ground Floor",
  "QC Lab",
  "Canteen",
];
const BAIT: FixedMaterial = { materialName: "Bromadiolone Cake", methodOfApplication: "Baiting" };
const AREA_OVERRIDES: Record<string, Record<string, FixedMaterial>> = {
  "Rodent Control Service": Object.fromEntries(RODENT_BAIT_AREAS.map((a) => [a, BAIT])),
};

export function fixedMaterialForServiceArea(variantKey: string | undefined, areaName: string): FixedMaterial {
  const override = variantKey ? AREA_OVERRIDES[variantKey]?.[areaName] : undefined;
  if (override) return override;
  return variantKey && VARIANT_DEFAULTS[variantKey] ? VARIANT_DEFAULTS[variantKey] : { materialName: "", methodOfApplication: "" };
}

// A MATERIAL USED IN THE SAME QUANTITY EVERY VISIT (the owner, 31-Oct-2026, with the general pest control report:
// "150 ml is fixed in quantity"; REQUIREMENTS §154): its quantity is written when a person opens a report where it is
// blank (serviceQtyFillOnOpen, in their name), and stays theirs to change. The glue boards' and the bait's quantities are
// what the technician used on the visit, written by a person.
export const FIXED_SERVICE_QTY: Record<string, string> = {
  "Deltamethrin 2.5% SC": "150 ml",
};

export const SERVICE_QTY_FILL_NOTE = "The fixed quantity written on opening (Deltamethrin 2.5% SC: 150 ml), yours to change.";

/** The report with each fixed-quantity material's blank quantity written (on the first line of its material, as a person writes it), or null when nothing is to fill. */
export function serviceQtyFillOnOpen<T extends { lines: ServiceReportAreaLine[] }>(variantKey: string | undefined, data: T | null | undefined): T | null {
  if (!data || !Array.isArray(data.lines) || data.lines.length === 0) return null;
  let changed = false;
  const lines = data.lines.map((l) => {
    const fixed = FIXED_SERVICE_QTY[l.materialName];
    if (!fixed || qtyOf(l).trim()) return l;
    changed = true;
    return { ...l, qtyUsed: fixed };
  });
  return changed ? { ...data, lines: normalizeServiceLines(variantKey, lines) } : null;
}

// THE QUANTITY IS ENTERED ONCE. Both April-2026 specimens write material,
// quantity and method on the first area row only, standing for every area
// treated with it (REQUIREMENTS §5). So on the form the quantity is typed on
// the first line of each material, and every other line with that material
// carries the same quantity. On the Rat / Mice report the bait block
// (Bromadiolone Cake, weighed in grams) starts at its own first line and keeps a
// quantity of its own; every Glue Board line shares the first one's.

const qtyOf = (l: ServiceReportAreaLine): string => String(l.qtyUsed ?? "");

/**
 * A service report's lines as the form holds them: material and method fixed
 * per area, and each line's quantity the one entered on the first line with the
 * same material. A line that already reads that way is returned as the same
 * object, so a caller can tell nothing changed. `fillBlankLead` (for bringing
 * old drafts into line) lets a blank first line take the first quantity
 * written further down, so nothing already written is lost.
 */
export function normalizeServiceLines(
  variantKey: string | undefined,
  lines: ServiceReportAreaLine[],
  opts: { fillBlankLead?: boolean } = {}
): ServiceReportAreaLine[] {
  const fixedLines = lines.map((l) => {
    const fixed = fixedMaterialForServiceArea(variantKey, l.areaName);
    return {
      ...l,
      materialName: fixed.materialName || l.materialName,
      methodOfApplication: fixed.methodOfApplication || l.methodOfApplication,
    };
  });
  const qty = new Map<string, string>();
  for (const l of fixedLines) {
    const held = qty.get(l.materialName);
    if (held === undefined) qty.set(l.materialName, qtyOf(l));
    else if (opts.fillBlankLead && !held.trim() && qtyOf(l).trim()) qty.set(l.materialName, qtyOf(l));
  }
  return fixedLines.map((l, i) => {
    const was = lines[i];
    const qtyUsed = qty.get(l.materialName) ?? qtyOf(l);
    if (l.materialName === was.materialName && l.methodOfApplication === was.methodOfApplication && qtyUsed === was.qtyUsed) return was;
    return { ...l, qtyUsed };
  });
}

/** Whether the quantity is entered on line `index` — the first line with its material. */
export function isQuantityLine(lines: ServiceReportAreaLine[], index: number): boolean {
  const material = lines[index]?.materialName;
  return lines.findIndex((l) => l.materialName === material) === index;
}

/** A run of neighbouring lines with the same material: the paper draws its material, quantity and method as ONE merged cell. */
export interface ServiceGroup {
  /** Index of the run's first line in the report's lines. */
  first: number;
  /** How many lines the run covers. */
  size: number;
  materialName: string;
  methodOfApplication: string;
}

/** The report's lines as the paper's merged blocks, in order (contiguous lines with one material, as the contractor's sheet merges them). */
export function serviceGroups(lines: ServiceReportAreaLine[]): ServiceGroup[] {
  const groups: ServiceGroup[] = [];
  lines.forEach((l, i) => {
    const last = groups[groups.length - 1];
    if (last && last.materialName === l.materialName && last.methodOfApplication === l.methodOfApplication) last.size += 1;
    else groups.push({ first: i, size: 1, materialName: l.materialName, methodOfApplication: l.methodOfApplication });
  });
  return groups;
}
