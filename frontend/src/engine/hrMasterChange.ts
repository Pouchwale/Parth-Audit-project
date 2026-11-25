import type { HrMasterColumnKey, HrMasterPerson } from "../types";
import { HR_MASTER_TAG, hrMasterColumnLabel, nameKey, parseWrittenDate, personNamed, sameGp3, slashOrderOf, type HrMasterLink, type LinkedField } from "./hrMaster";

// A PERSON'S DETAIL CHANGED ON AN HR RECORD, ASKED OF HR MASTER DATA (REQUIREMENTS §334; the owner, 25-Nov-2026: "if the
// data which is came from master data and user tried to change anything of his details like date of joining, date of
// birth, Designation, department ... system will ask him whether to update ... if user select yes then it should ask are
// you sure"). A box of an HR format filled from the sheet (hrMaster.ts HR_MASTER_LINKS), typed over with something the
// sheet does not say for the person the record names, is asked of the sheet when the box is left: update HR Master Data
// for this person, then "are you sure", the sheet's value beside the one typed. A blank on the sheet is simply filled
// (as the registers have always fed it, §161). The name box, the sex read from the name, F/HR/06's induction date and
// F/HR/04's signature date are never asked: they are not the person's details on the sheet.

export interface MasterChange {
  key: HrMasterColumnKey;
  label: string;
  /** What HR Master Data has ("" = blank there). */
  from: string;
  /** What the record now says. */
  to: string;
}

/** The person a header or a line names: by the sheet's mark, else by the name box (one person only). */
export function personOfBox(link: HrMasterLink, box: Record<string, unknown>, people: readonly HrMasterPerson[]): HrMasterPerson | null {
  const tag = String(box[HR_MASTER_TAG] ?? "").trim();
  if (tag) {
    const marked = people.find((p) => sameGp3(p.gp3No, tag));
    if (marked) return marked;
  }
  const name = String(box[link.nameField] ?? "").trim();
  return name ? personNamed(name, people as HrMasterPerson[]) : null;
}

/** The linked field whose change is asked of the sheet; undefined for every other box. */
export function askedOfMaster(link: HrMasterLink, key: string): LinkedField | undefined {
  const f = link.fields.find((x) => x.key === key);
  if (!f || key === link.nameField || f.from === "sexFromName" || f.from === "fullName" || f.from === "gp3No" || f.induction || key === "signDate") return undefined;
  return f;
}

function twoParts(text: string): [string, string] | null {
  for (const sep of [/\s+[-–]\s+/, /\s*[-–]\s*/]) {
    const parts = text.split(sep).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) return [parts[0], parts[1]];
  }
  return null;
}

/** The sheet's columns the box, as written, says for the person; null when it cannot be read (a date half typed). */
function columnsSaid(f: LinkedField, written: string, person: HrMasterPerson): Partial<Record<HrMasterColumnKey, string>> | null {
  const text = written.replace(/\s+/g, " ").trim();
  if (!text) return null;
  switch (f.from) {
    case "joiningDate":
    case "dateOfBirth": {
      const iso = parseWrittenDate(text, slashOrderOf(f.style ?? "iso"));
      return iso ? { [f.from]: iso } : null;
    }
    case "departmentThenDesignation":
    case "designationThenDepartment": {
      const parts = twoParts(text);
      if (!parts) return null;
      return f.from === "departmentThenDesignation" ? { department: parts[0], designation: parts[1] } : { designation: parts[0], department: parts[1] };
    }
    case "subDepartmentThenDesignation":
      return { [String(person.subDepartment ?? "").trim() ? "subDepartment" : "designation"]: text };
    case "sexFromName":
    case "fullName":
    case "gp3No":
      return null;
    default:
      return { [f.from]: text };
  }
}

/** What HR Master Data would change for the person, the box as written: only what differs from the sheet. */
export function masterChanges(f: LinkedField, written: string, person: HrMasterPerson): MasterChange[] {
  const said = columnsSaid(f, written, person);
  if (!said) return [];
  const out: MasterChange[] = [];
  for (const [k, to] of Object.entries(said) as [HrMasterColumnKey, string][]) {
    const from = String(person[k] ?? "").trim();
    const date = k === "joiningDate" || k === "dateOfBirth";
    if (date ? from === to : nameKey(from) === nameKey(to)) continue;
    out.push({ key: k, label: hrMasterColumnLabel(k), from, to });
  }
  return out;
}
