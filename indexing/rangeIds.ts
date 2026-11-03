// How a range is named, shared by the list of ranges (ranges.ts) and the overlay on the formats (rangeRuntime.ts),
// which must not import the formats' layouts (they import it).

/** "08:30 HRS TEMP. + SIGN" → "TEMP. + SIGN": the readings of one kind taken at different times share a range. */
export const stemOf = (label: string): string =>
  label
    .replace(/^\s*\d{1,2}[:.]\d{2}\s*(am|pm)?\s*(hrs\.?)?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

/** The id of the range a column's band is. */
export const bandRangeId = (documentId: string, label: string): string => `band:${documentId}:${slug(stemOf(label))}`;
/**
 * THE SINGLE LIMITS LAID OVER A FORMAT'S LAYOUT (indexing/rangeRuntime.ts), by the document they belong to: F/QC/12's
 * Acceptable Tolerance that every new sheet starts with, and its days between checks (the owner, 30-Oct-2026).
 */
export const LAYOUT_VALUES: Record<string, string> = {
  "value:qc12.tolerance": "qc-weight-scale-calibration",
  "value:qc12.days": "qc-weight-scale-calibration",
};

/** The id of the range a box's tolerance is. */
export const withinRangeId = (documentId: string, fieldKey: string): string => `within:${documentId}:${fieldKey}`;
