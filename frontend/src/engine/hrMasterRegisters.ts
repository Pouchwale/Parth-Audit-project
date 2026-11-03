import type { HrMasterPerson, LogSheetData, LogSheetRow, RecordInstance } from "../types";
import { HR_MASTER_LINKS, nameKey, parseWrittenDate, personNamed, splitDepartmentDesignation, type DateStyle, type HrMasterLink, type HrMasterValues } from "./hrMaster";

// THE REGISTERS FEED THE SHEET (REQUIREMENTS §161; the owner, 2-Nov-2026): "the date of joining is present on
// F/HR/01, so take it from there into the master data according to the name; and if that name comes on any document,
// the other details required there should be filled."
//
// HR Master Data is the one sheet the HR formats fetch a person from (engine/hrMaster.ts, §53). The registers the
// plant has already filled — F/HR/01 above all, with every staff member's department, designation and date of
// joining — know things the sheet may still be blank on. So the registers feed the sheet, by name:
//
//   fills       a person ON the sheet whose joining date, department, designation or date of birth is blank takes it
//               from the first register line (or header) that names them and gives it. Nothing written on the sheet
//               is ever changed by a register — the sheet is HR's word; the registers only fill its blanks. Applied
//               on its own: when a linked record is saved (the F/HR/01 line just written reaches the sheet at once)
//               and when the sheet is opened.
//   newcomers   a name on F/HR/01, F/HR/03 or F/HR/06 that is nobody on the sheet. Those three are the plant's
//               lists of its people, so such a name is a person to add — but only when HR says so on the sheet
//               ("Add them from the registers"), never while a name is still being typed on a register.
//
// Then the fetch the formats already do (personFill, fillFromName) finds the date of joining on the sheet, and
// F/HR/05's Planned Date, F/HR/04's Date of Birth and the rest fill from it.

export type MasterFillKey = "joiningDate" | "department" | "subDepartment" | "designation" | "dateOfBirth";

export interface RegisterFill {
  personId: string;
  fullName: string;
  key: MasterFillKey;
  after: string;
  /** Where it came from: "F/HR/01 line 12". */
  source: string;
}

export interface RegisterNewcomer {
  fullName: string;
  values: Partial<HrMasterValues>;
  aliases: string[];
  sources: string[];
}

export interface RegisterTake {
  fills: RegisterFill[];
  newcomers: RegisterNewcomer[];
}

/** The registers whose lines may put a NEW person on the sheet: the staff list, the operators' skill matrix, the operators' induction register. */
export const NEWCOMER_REGISTERS: readonly string[] = ["hr-competence", "hr-skill-matrix", "hr-induction-operators"];

const slashOrderOf = (style: DateStyle): "mdy" | "dmy" => (style === "dotted" || style === "monthFirst" ? "mdy" : "dmy");

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/**
 * Two spellings on the registers that are one person (the rule data/seed/hrMasterSeed.ts grouped the registers'
 * lines by): the same words; or the same first name (or one the start of the other, four letters at least) and
 * the same surname, a slip of the pen apart at most. "Nilesh Rana" and "Nilesh M. Rana" are one.
 */
export function sameRegisterName(a: unknown, b: unknown): boolean {
  const x = nameKey(a).split(" ").filter(Boolean);
  const y = nameKey(b).split(" ").filter(Boolean);
  if (x.length === 0 || y.length === 0) return false;
  if (x.length === y.length && x.every((word, i) => word === y[i])) return true;
  if (x.length < 2 || y.length < 2) return false;
  const [fx, fy] = [x[0], y[0]];
  const firstNames = fx === fy || (Math.min(fx.length, fy.length) >= 4 && (fx.startsWith(fy) || fy.startsWith(fx)));
  if (!firstNames) return false;
  const [lx, ly] = [x[x.length - 1], y[y.length - 1]];
  return lx === ly || (Math.min(lx.length, ly.length) >= 4 && Math.abs(lx.length - ly.length) <= 1 && editDistance(lx, ly) <= 1);
}

/** What one line (or the header) of a linked format says about its person, in the sheet's own columns. */
export function valuesSaid(link: HrMasterLink, box: Record<string, unknown>): Partial<Record<MasterFillKey, string>> {
  const out: Partial<Record<MasterFillKey, string>> = {};
  const put = (key: MasterFillKey, value: string) => {
    if (value && !out[key]) out[key] = value;
  };
  for (const f of link.fields) {
    const raw = String(box[f.key] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) continue;
    if (f.from === "joiningDate" || f.from === "dateOfBirth") {
      const iso = parseWrittenDate(raw, slashOrderOf(f.style ?? "iso"));
      if (iso) put(f.from, iso);
    } else if (f.from === "department" || f.from === "designation") {
      put(f.from, raw);
    } else if (f.from === "subDepartmentThenDesignation") {
      // F/HR/03's process is the sheet's Sub Department (§169).
      put("subDepartment", raw);
    } else if (f.from === "departmentThenDesignation" || f.from === "designationThenDepartment") {
      const { department, designation } = splitDepartmentDesignation(raw);
      put("department", department);
      put("designation", designation);
    }
  }
  return out;
}

/** The boxes of a record that each name one person: its header, or each of its lines. */
function boxesOf(link: HrMasterLink, data: LogSheetData | undefined): { box: Record<string, unknown>; where: string }[] {
  if (!data) return [];
  if (link.where === "header") return [{ box: data.header ?? {}, where: "" }];
  return (data.rows ?? []).map((row: LogSheetRow, i) => ({ box: row, where: ` line ${i + 1}` }));
}

const BLANK = (v: unknown): boolean => !String(v ?? "").trim();

/**
 * The blanks of the sheet one record fills, by name: each person it names whose column is blank, with the value the
 * record gives. The sheet's own words are never touched.
 */
export function registerFills(link: HrMasterLink, data: LogSheetData | undefined, people: HrMasterPerson[], taken: Set<string> = new Set()): RegisterFill[] {
  const fills: RegisterFill[] = [];
  for (const { box, where } of boxesOf(link, data)) {
    const name = String(box[link.nameField] ?? "").trim();
    if (!name) continue;
    const person = personNamed(name, people);
    if (!person) continue;
    const said = valuesSaid(link, box);
    for (const key of ["joiningDate", "department", "designation", "dateOfBirth"] as const) {
      const value = said[key];
      if (!value || !BLANK(person[key])) continue;
      const id = `${person.id}|${key}`;
      if (taken.has(id)) continue;
      taken.add(id);
      fills.push({ personId: person.id, fullName: person.fullName, key, after: value, source: `${link.formatNo}${where}` });
    }
  }
  return fills;
}

/** The link of this document, when the registers feed the sheet from it. */
export const registerLinkFor = (documentId: string): HrMasterLink | undefined => HR_MASTER_LINKS.find((l) => l.docId === documentId);

/**
 * Everything the registers on file give the sheet: the blanks they fill, and the people on the plant's lists who
 * are not on the sheet at all. `records` is every record of the linked formats (Live ones, not the demo's); the
 * newest record of a format is read first, so a register reviewed again this year speaks before last year's.
 */
export function takeFromRegisters(people: HrMasterPerson[], records: readonly RecordInstance[]): RegisterTake {
  const fills: RegisterFill[] = [];
  const taken = new Set<string>();
  const groups = new Map<string, RegisterNewcomer>();
  for (const link of HR_MASTER_LINKS) {
    const own = records
      .filter((r) => r.documentId === link.docId)
      .sort((a, b) => (a.dueDate < b.dueDate ? 1 : a.dueDate > b.dueDate ? -1 : 0));
    for (const record of own) {
      const data = record.data as LogSheetData | undefined;
      fills.push(...registerFills(link, data, people, taken));
      if (!NEWCOMER_REGISTERS.includes(link.docId)) continue;
      for (const { box, where } of boxesOf(link, data)) {
        const name = String(box[link.nameField] ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (!name || people.some((p) => personNamed(name, [p]))) continue;
        if (!nameKey(name)) continue;
        const said = valuesSaid(link, box);
        // "Nilesh Rana" on one register and "Nilesh M. Rana" on another are one newcomer (sameRegisterName, the
        // rule the seed grouped the registers' lines by): the first group this name belongs to is theirs.
        const key = Array.from(groups.entries()).find(([, g]) => [g.fullName, ...g.aliases].some((n) => sameRegisterName(n, name)))?.[0] ?? nameKey(name);
        const group = groups.get(key) ?? { fullName: name, values: {}, aliases: [], sources: [] };
        // The longest spelling is the full name; the others are how the registers also write it.
        if (name.length > group.fullName.length) {
          if (!group.aliases.includes(group.fullName)) group.aliases.push(group.fullName);
          group.fullName = name;
        } else if (name !== group.fullName && !group.aliases.includes(name)) group.aliases.push(name);
        for (const [k, v] of Object.entries(said) as [MasterFillKey, string][]) if (v && !group.values[k]) group.values[k] = v;
        group.sources.push(`${link.formatNo}${where}`);
        groups.set(key, group);
      }
    }
  }
  return { fills, newcomers: Array.from(groups.values()) };
}

/** What the sheet gained, in words for the page and the activity log. */
export function takeWords(filled: number, added: number): string {
  const parts: string[] = [];
  if (filled) parts.push(`${filled} blank ${filled === 1 ? "box" : "boxes"} filled from the registers`);
  if (added) parts.push(`${added} ${added === 1 ? "person" : "people"} added from the registers`);
  return parts.length ? parts.join("; ") + "." : "The sheet already holds everything the registers give.";
}
