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

/** The materials a service uses - its default and each area override's - each once. */
export function serviceMaterialsOf(variantKey: string | undefined): FixedMaterial[] {
  const out: FixedMaterial[] = [];
  for (const m of [VARIANT_DEFAULTS[variantKey ?? ""], ...Object.values(AREA_OVERRIDES[variantKey ?? ""] ?? {})]) {
    if (m && !out.some((o) => o.materialName === m.materialName)) out.push(m);
  }
  return out;
}

export function fixedMaterialForServiceArea(variantKey: string | undefined, areaName: string, area?: { material?: string; method?: string }): FixedMaterial {
  // A line added on the report carries its block's material and method (REQUIREMENTS §154 item 6): its Master Data area says them.
  if (area?.material) {
    const known = serviceMaterialsOf(variantKey).find((m) => m.materialName === area.material);
    return { materialName: area.material, methodOfApplication: area.method || known?.methodOfApplication || "" };
  }
  const override = variantKey ? AREA_OVERRIDES[variantKey]?.[areaName] : undefined;
  if (override) return override;
  return variantKey && VARIANT_DEFAULTS[variantKey] ? VARIANT_DEFAULTS[variantKey] : { materialName: "", methodOfApplication: "" };
}

// A MATERIAL USED IN THE SAME QUANTITY EVERY VISIT (the owner, 31-Oct-2026, with the general pest control report:
// "150 ml is fixed in quantity"; and later that day with the fly report: "quantity is fix which 100"; REQUIREMENTS §154):
// its quantity is written when a person opens a report where it is blank (serviceQtyFillOnOpen, in their name), and
// stays theirs to change. The glue boards' and the bait's quantities are what the technician used on the visit, written
// by a person.
export const FIXED_SERVICE_QTY: Record<string, string> = {
  "Deltamethrin 2.5% SC": "150 ml",
  "Beta-Cyfluthrin 2.45% SC": "100 ml",
};

/**
 * THE QUANTITIES A MATERIAL IS WRITTEN WITH, AND NOTHING ELSE (the owner, 1-Nov-2026, with a rodent report reading "36
 * grams": the bait "should take the value like 30 or 40 or 50 nothing else"; the glue boards "between 3 to 5", 31-Oct-2026;
 * REQUIREMENTS §154 item 10). The bait is laid in 10 gram cakes, three to five; the glue boards are counted three to five.
 * The quantity box is a choice of these, a quantity written otherwise is refused at Submit, and whatever the system writes
 * (the last visit's, Mitra's, Demo Mode's) is one of them.
 */
export const SERVICE_QTY_CHOICES: Record<string, readonly string[]> = {
  "Glue Board": ["3", "4", "5"],
  "Bromadiolone Cake": ["30 grams", "40 grams", "50 grams"],
};

/** How each is written by a person or a file: "4", "4 nos"; "40", "40 gm", "40g", "40 grams", "40 gramms". */
const QTY_WRITTEN: Record<string, RegExp> = {
  "Glue Board": /^\s*(\d+)\s*(?:nos?|pcs?|boards?)?\.?\s*$/i,
  "Bromadiolone Cake": /^\s*(\d+(?:\.\d+)?)\s*(?:g|gm|gms|grm|grms|gram|grams|gramm|gramms)?\.?\s*$/i,
};

export const serviceQtyChoices = (materialName: string): readonly string[] | undefined => SERVICE_QTY_CHOICES[materialName];

/** The choices in words: "3, 4 or 5", "30, 40 or 50 grams". */
export function serviceQtyChoiceWords(materialName: string): string {
  const choices = SERVICE_QTY_CHOICES[materialName] ?? [];
  const numbers = choices.map((c) => String(parseFloat(c)));
  const unit = (choices[choices.length - 1] ?? "").replace(/^[\d.]+\s*/, "");
  const listed = numbers.length > 1 ? `${numbers.slice(0, -1).join(", ")} or ${numbers[numbers.length - 1]}` : (numbers[0] ?? "");
  return unit ? `${listed} ${unit}` : listed;
}

/** The choice a written quantity is ("40 gm" is "40 grams"), or null where it is none of them (or the material has no choices). */
export function serviceQtyChoiceOf(materialName: string, value: string | null | undefined): string | null {
  const choices = SERVICE_QTY_CHOICES[materialName];
  const written = QTY_WRITTEN[materialName];
  if (!choices || !written) return null;
  const m = written.exec(String(value ?? ""));
  if (!m) return null;
  const n = Number(m[1]);
  return choices.find((c) => parseFloat(c) === n) ?? null;
}

/** The choice nearest a written quantity (36 grams -> 40 grams, 2 -> 3; a half way up), for Demo Mode's simulated reports only. */
export function nearestServiceQty(materialName: string, value: string | null | undefined): string | null {
  const choices = SERVICE_QTY_CHOICES[materialName];
  const m = /(\d+(?:\.\d+)?)/.exec(String(value ?? ""));
  if (!choices || !m) return null;
  const n = Number(m[1]);
  let best = choices[0];
  for (const c of choices) if (Math.abs(parseFloat(c) - n) <= Math.abs(parseFloat(best) - n)) best = c;
  return best;
}

/** A quantity written that is not one of its material's choices: what Submit refuses, in words, a line for each. */
export function serviceQtyProblems(lines: readonly ServiceReportAreaLine[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of lines ?? []) {
    if (seen.has(l.materialName)) continue;
    seen.add(l.materialName);
    const value = qtyOf(l).trim();
    if (!value || !SERVICE_QTY_CHOICES[l.materialName] || serviceQtyChoiceOf(l.materialName, value)) continue;
    out.push(`${l.materialName}: the quantity is ${serviceQtyChoiceWords(l.materialName)} - "${value}" is not one of them.`);
  }
  return out;
}

/**
 * THE QUANTITIES A REPORT OPENS WITH (REQUIREMENTS §154 items 2 and 9): a material's fixed quantity where the owner named
 * one (FIXED_SERVICE_QTY); otherwise THE LAST VISIT'S - the quantity the technician reported on the latest report of the
 * same service handed in before this one (`previous`), as F/QC/12's new sheets start with the last sheet's readings
 * (§117). Written on the first line of its material when a person opens a report where it is blank, in their name with a
 * line in the history saying which it was, and theirs to change. Never a made-up or varying number (§136).
 */
export function serviceQtyFillOnOpen<T extends { lines: ServiceReportAreaLine[] }>(
  variantKey: string | undefined,
  data: T | null | undefined,
  previous?: readonly ServiceReportAreaLine[] | null
): { data: T; note: string } | null {
  if (!data || !Array.isArray(data.lines) || data.lines.length === 0) return null;
  const last = new Map<string, string>();
  for (const l of previous ?? []) {
    const value = qtyOf(l).trim();
    if (!value || last.has(l.materialName)) continue;
    // Only one of the material's choices is carried (§154 item 10): "36 grams" on the last visit is not.
    const carried = SERVICE_QTY_CHOICES[l.materialName] ? serviceQtyChoiceOf(l.materialName, value) : value;
    if (carried) last.set(l.materialName, carried);
  }
  const wrote: string[] = [];
  const lines = data.lines.map((l) => {
    if (qtyOf(l).trim()) return l;
    const fixed = FIXED_SERVICE_QTY[l.materialName];
    const value = fixed ?? last.get(l.materialName);
    if (!value) return l;
    const said = `${l.materialName} ${value}${fixed ? " (fixed)" : " (the last visit's)"}`;
    if (!wrote.includes(said)) wrote.push(said);
    return { ...l, qtyUsed: value };
  });
  if (wrote.length === 0) return null;
  return { data: { ...data, lines: normalizeServiceLines(variantKey, lines) }, note: `Quantities written on opening, yours to change: ${wrote.join("; ")}.` };
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
    // The area's own where the paper fixes it; else the line's own, where it is one of the service's materials (a line
    // added on the report inside a block, REQUIREMENTS §154 item 6); else the service's default.
    const override = variantKey ? AREA_OVERRIDES[variantKey]?.[l.areaName] : undefined;
    const fixed = override ?? serviceMaterialsOf(variantKey).find((m) => m.materialName === l.materialName) ?? fixedMaterialForServiceArea(variantKey, l.areaName);
    return {
      ...l,
      materialName: fixed.materialName || l.materialName,
      methodOfApplication: fixed.methodOfApplication || l.methodOfApplication,
    };
  });
  // A quantity written as one of its material's choices is said as the choice says it ("40 gm" is "40 grams", §154 item 10).
  const said = (m: string, v: string): string => serviceQtyChoiceOf(m, v) ?? v;
  const qty = new Map<string, string>();
  for (const l of fixedLines) {
    const held = qty.get(l.materialName);
    if (held === undefined) qty.set(l.materialName, said(l.materialName, qtyOf(l)));
    else if (opts.fillBlankLead && !held.trim() && qtyOf(l).trim()) qty.set(l.materialName, said(l.materialName, qtyOf(l)));
  }
  const out = fixedLines.map((l, i) => {
    const was = lines[i];
    const qtyUsed = qty.get(l.materialName) ?? qtyOf(l);
    if (l.materialName === was.materialName && l.methodOfApplication === was.methodOfApplication && qtyUsed === was.qtyUsed) return was;
    return { ...l, qtyUsed };
  });
  return foldServiceRemarks(out);
}

const sameWords = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * THE VISIT'S ONE REMARK (the owner, 1-Nov-2026, with a report listing "2. No Rodent Trapped" ... "16. No Rodent Trapped"
 * under an empty remark; REQUIREMENTS §154 item 10). The paper's Remarks is one merged cell for the visit, written on the
 * first line. A remark written alike on two or more other lines (Demo Mode, Mitra, an old file) is the visit's remark when
 * the first line has none; a copy of the visit's remark on another line is said already, and goes. A different note on a
 * line stays, shown under the visit's remark with its line's number. Lines already so are returned as they are.
 */
export function foldServiceRemarks(lines: ServiceReportAreaLine[]): ServiceReportAreaLine[] {
  if (lines.length < 2) return lines;
  const words = (l: ServiceReportAreaLine): string => String(l.remarks ?? "").trim();
  let lead = words(lines[0]);
  let promoted: string | null = null;
  if (!lead) {
    const counts = new Map<string, { text: string; n: number }>();
    for (const l of lines.slice(1)) {
      const w = words(l);
      if (!w) continue;
      const c = counts.get(w.toLowerCase());
      if (c) c.n += 1;
      else counts.set(w.toLowerCase(), { text: w, n: 1 });
    }
    let best: { text: string; n: number } | null = null;
    for (const c of counts.values()) if (c.n >= 2 && (!best || c.n > best.n)) best = c;
    if (best) lead = promoted = best.text;
  }
  if (!lead) return lines;
  let changed = false;
  const out = lines.map((l, i) => {
    if (i === 0) {
      if (promoted === null) return l;
      changed = true;
      return { ...l, remarks: promoted };
    }
    if (words(l) && sameWords(words(l), lead)) {
      changed = true;
      return { ...l, remarks: "" };
    }
    return l;
  });
  return changed ? out : lines;
}

/** The notes written on lines other than the first, each once with its lines' numbers: "3, 7-9. Bait consumed - replaced". */
export function otherServiceRemarks(lines: readonly ServiceReportAreaLine[]): string[] {
  const lead = String(lines[0]?.remarks ?? "").trim();
  const groups = new Map<string, { text: string; nos: number[] }>();
  for (const l of lines.slice(1)) {
    const w = String(l.remarks ?? "").trim();
    if (!w || (lead && sameWords(w, lead))) continue;
    const g = groups.get(w.toLowerCase());
    if (g) g.nos.push(l.slNo);
    else groups.set(w.toLowerCase(), { text: w, nos: [l.slNo] });
  }
  const ranges = (nos: number[]): string => {
    const out: string[] = [];
    for (let i = 0; i < nos.length; ) {
      let j = i;
      while (j + 1 < nos.length && nos[j + 1] === nos[j] + 1) j++;
      out.push(j - i >= 2 ? `${nos[i]}-${nos[j]}` : nos.slice(i, j + 1).join(", "));
      i = j + 1;
    }
    return out.join(", ");
  };
  return Array.from(groups.values()).map((g) => `${ranges(g.nos)}. ${g.text}`);
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
