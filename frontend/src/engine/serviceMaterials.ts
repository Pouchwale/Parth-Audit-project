import type { ServiceReportAreaLine } from "../types";

// Fixed material/method-of-application defaults per Service Report variant
// (see REQUIREMENTS.md §5 for provenance — the two real April-2026 service
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

// One documented exception: the Dec-2023/April-2026 specimens show this
// specific Rodent Control area baited with Bromadiolone Cake rather than the
// glue boards used everywhere else on the same visit.
const AREA_OVERRIDES: Record<string, FixedMaterial> = {
  "First floor - Offline punching & QC Inspection": { materialName: "Bromadiolone Cake", methodOfApplication: "Baiting" },
};

export function fixedMaterialForServiceArea(variantKey: string | undefined, areaName: string): FixedMaterial {
  const override = AREA_OVERRIDES[areaName];
  if (override) return override;
  return variantKey && VARIANT_DEFAULTS[variantKey] ? VARIANT_DEFAULTS[variantKey] : { materialName: "", methodOfApplication: "" };
}

// THE QUANTITY IS ENTERED ONCE. Both April-2026 specimens write material,
// quantity and method on the first area row only, standing for every area
// treated with it (REQUIREMENTS §5). So on the form the quantity is typed on
// the first line of each material, and every other line with that material
// carries the same quantity. On the Rat / Mice report the one bait area
// (Bromadiolone Cake, weighed in grams) is the first line of its own material
// and keeps a quantity of its own; every Glue Board line shares the first one's.

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
