import type { HrMasterPerson } from "../types";
import { SKILL_OPERATIONS } from "../data/seed/hrLayouts";

// WHICH COLUMN OF F/HR/03 IS A PERSON'S (REQUIREMENTS §290; the owner, 22-Nov-2026: "by default for all operator the score is 5
// and editable so for any new comes in master data then automatically it should come in this according to his department").
// The company's matrix gives each operator one 5, under the process they work, so a new person's 5 goes under theirs: read from
// HR Master Data's Sub Department, Department and Machine. A 5 says "can operate individually", so a person whose work has no
// column of the matrix (security, stores, dispatch, housekeeping...) or whose process cannot be told is given none.

export type SkillFacts = Pick<HrMasterPerson, "department" | "subDepartment" | "machine" | "designation">;

const NOT_ON_THE_MATRIX = /security|guard|housekeeping|sweeper|dispatch|loading|loding|driver|store|purchase|machinery|electrician|reception|peon|design|cctv|docket|\bink\b|sales|\blab\b|quality assurance|supervis|data entry|back office/;

const BY_SECTION: [RegExp, string][] = [
  [/sleeve\s*gluing/, "sleeveGluing"],
  [/sleeve\s*cutting/, "sleeveCutting"],
  [/printing/, "printing"],
  [/laminat/, "lamination"],
  [/slitting|trimming/, "slitting"],
  [/sheet\s*cutting|reel\s*to\s*sheet/, "sheetCutting"],
  [/off-?\s*line\s*punching/, "offlinePunching"],
  [/punching|die\s*cutting/, "punching"],
  [/pasting/, "pasting"],
  [/packing|bundling/, "bundling"],
  [/pouch/, "pouchingMachine"],
  [/quality\s*control|^qc\b/, "qcManual"],
];

/** Sections that run several of the matrix's operations: the Machine says which. */
const BY_MACHINE: [RegExp, string][] = [
  [/punch/, "punching"],
  [/slit/, "slitting"],
  [/packing|striping/, "bundling"],
  [/past|finger|stich|fruit/, "pasting"],
  [/cutting/, "sheetCutting"],
];

const said = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** The key of the person's own operation on F/HR/03, or undefined when nothing on the sheet says which it is. */
export function skillOperationFor(person: SkillFacts): string | undefined {
  const machine = said(person.machine);
  const section = said(person.subDepartment) || said(person.department) || said(person.designation);
  if (!section && !machine) return undefined;
  if ([section, machine, said(person.designation)].some((word) => NOT_ON_THE_MATRIX.test(word))) return undefined;
  // Inspection is named by the machine, whichever section the person sits in.
  if (/ipqc/.test(machine)) return "ipqc";
  if (/inspection|\bd\.?\s?k\b/.test(machine)) return "qcMachine";
  if (/\bq\.?c\b|sorting|shorting|manaual/.test(machine)) return "qcManual";
  if (/post\s*press|corrugation|carton|label/.test(section)) return BY_MACHINE.find(([word]) => word.test(machine))?.[1];
  return BY_SECTION.find(([word]) => word.test(section))?.[1];
}

/** The matrix's boxes for a person whose operation is known: 5 under it, the others left for HR. */
export function skillPointsFor(person: SkillFacts): Record<string, string> {
  const own = skillOperationFor(person);
  return Object.fromEntries(SKILL_OPERATIONS.map(({ key }) => [key, key === own ? "5" : ""]));
}

export const skillOperationLabel = (key: string | undefined): string => SKILL_OPERATIONS.find((o) => o.key === key)?.label ?? "";
