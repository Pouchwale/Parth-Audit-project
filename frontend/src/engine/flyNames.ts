import type { FlyCatcherEntry } from "../types";

// F/HR/18: PC-01'S NAMES ARE THE VISIT'S (REQUIREMENTS §237; the owner, 16-Nov-2026, with the register's PC-01 lines -
// 03-10-2026 Roshni / Vijay, 17-10-2026 Vijay / Roshni: "if user fill first row which is PC-01 then all other PC's also
// with same name for both dates"; asked: always over what the other units hold). One person cleans the catchers on a
// visit and one verifies it, so the Cleaning Done By and the Verified By written on the first unit's line of a visit are
// written on every unit's line of that visit, over what they held; a name written on another unit's line is that line's.

const NAME_KEYS = ["cleaningDoneBy", "verifiedBy"] as const;

/**
 * The visit's lines with the names `patch` writes on `pcId` written on every unit's line too, when `pcId` is the first unit
 * (`unitIds[0]`, PC-01); a unit the visit has no line for gets one (`blank`). The same lines otherwise.
 */
export function withFirstUnitNames(
  entries: FlyCatcherEntry[],
  pcId: string,
  patch: Partial<Omit<FlyCatcherEntry, "pcId">>,
  unitIds: readonly string[],
  blank: (pcId: string) => FlyCatcherEntry
): FlyCatcherEntry[] {
  if (unitIds.length === 0 || pcId !== unitIds[0]) return entries;
  const names: Partial<FlyCatcherEntry> = {};
  for (const k of NAME_KEYS) if (k in patch) names[k] = String(patch[k] ?? "");
  if (Object.keys(names).length === 0) return entries;
  const held = new Set(entries.map((e) => e.pcId));
  return [...entries, ...unitIds.filter((id) => !held.has(id)).map(blank)].map((e) => (e.pcId === pcId ? e : { ...e, ...names }));
}
