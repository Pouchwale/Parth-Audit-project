import type { HrMasterPerson, LogSheetData } from "../types";
import { DRAFT_JOB_ROLES, type JobRole } from "../data/seed/hrJobRoles";
import { WRITTEN_JOB_POSITIONS } from "../data/seed/hrRecords";
import { generateId } from "../utils/id";

// F/HR/07: A POSITION CHOSEN FILLS ITS SHEET (REQUIREMENTS §307; the owner, 23-Nov-2026: "according to roles the Job description is
// written ... for all type of roles and designation it should also filled automatically by system"). The eight positions the company's
// files describe are taken word for word; every other role has a draft for HR to check (data/seed/hrJobRoles.ts).

export const WRITTEN_JOB_ROLES: JobRole[] = WRITTEN_JOB_POSITIONS.map((p) => ({
  key: p.slug,
  title: p.position,
  reportsTo: p.reportsTo,
  duties: p.duties,
  authorities: p.authorities,
  responsibilities: p.responsibilities,
}));

export const JOB_ROLES: JobRole[] = [...WRITTEN_JOB_ROLES, ...DRAFT_JOB_ROLES];

const said = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();
const keyOf = (v: unknown): string => said(v).toLowerCase().replace(/[^a-z0-9]/g, "");
const BY_TITLE = new Map(JOB_ROLES.map((r) => [keyOf(r.title), r]));

export const jobRoleNamed = (title: unknown): JobRole | undefined => BY_TITLE.get(keyOf(title));

type Group = "top" | "hr" | "lab" | "sales" | "accounts" | "stores" | "maintenance" | "dispatch" | "security" | "design" | "production";

function groupOf(department: string): Group {
  const d = department.toLowerCase();
  if (/top management/.test(d)) return "top";
  if (/\bhr\b/.test(d)) return "hr";
  if (/\blab\b|quality/.test(d)) return "lab";
  if (/sales|marketing|\bbde\b/.test(d)) return "sales";
  if (/account/.test(d)) return "accounts";
  if (/store|purchase/.test(d)) return "stores";
  if (/machinery|maintenance/.test(d)) return "maintenance";
  if (/dispatch|loading|logistic/.test(d)) return "dispatch";
  if (/security/.test(d)) return "security";
  if (/pre ?press|design/.test(d)) return "design";
  return "production";
}

const BY_GROUP: Record<string, Partial<Record<Group, string>> & { other: string }> = {
  manager: { hr: "Manager-HR", lab: "Manager-QA", sales: "Manager-Sales & Marketing", accounts: "Manager-Accounts", stores: "Manager-Stores & Purchase", maintenance: "Manager-Maintenance", security: "Manager-Security", dispatch: "Manager Dispatch & Logistics", other: "Manager-Production" },
  hod: { maintenance: "HOD-Maintenance", dispatch: "HOD-Dispatch", other: "HOD-Production" },
  teamleader: { sales: "Team Leader-Sales", other: "Team Leader-Production" },
  supervisor: { stores: "Supervisor-Stores", lab: "Supervisor-Quality", other: "Supervisor-Production" },
  executive: { lab: "Executive-Lab", hr: "Executive-Hr", sales: "Executive-Sales & Marketing", stores: "Executive-Stores & Purchase", maintenance: "Executive-Maintenance", design: "Executive-Pre Press", accounts: "Executive-Accounts", other: "Executive-Production" },
  coordinator: { sales: "Sales Coordination", design: "Coordinator-Pre Press", other: "Coordinator-Production" },
  assistant: { stores: "Assistant-Stores", accounts: "Assistant-Accounts", lab: "Assistant-Lab", maintenance: "Assistant-Maintenance", design: "Assistant-Pre Press", sales: "Assistant-Sales", hr: "Assistant-HR", security: "Assistant-Security", other: "Assistant-Production" },
};

const ALONE: Record<string, string> = {
  ceo: "CEO",
  processengineer: "Process Engineer",
  designer: "Designer",
  srdesigner: "Sr.Designer",
  sraccountant: "Sr.Accountant",
  cashier: "Cashier",
  receptionist: "Receptionist",
  telecaller: "Tele Caller",
  operator: "Operator",
  helper: "Helper",
  guard: "Guard",
  driver: "Driver",
  sweeper: "Sweeper",
  peon: "Peon",
  electrician: "Electrician",
  managerpouch: "Pouch-Manager",
  regionalmanager: "Regional Manager-Sales",
  // (the two process names the sheet writes as a designation are operators, as on F/HR/03)
  slitting: "Operator",
  pouching: "Operator",
};

/** The role of a person on HR Master Data, by their Designation and Department. */
export function jobRoleOfPerson(person: Pick<HrMasterPerson, "designation" | "department">): JobRole | undefined {
  const designation = keyOf(person.designation).replace("exucutive", "executive");
  if (ALONE[designation]) return jobRoleNamed(ALONE[designation]);
  const group = groupOf(said(person.department));
  if (designation === "director") return jobRoleNamed(/operation/i.test(person.department) ? "Director-Operations" : "Director-Sales");
  if (designation === "manager" && /pouch/i.test(person.department)) return jobRoleNamed("Pouching Manager");
  const table = BY_GROUP[designation];
  return table ? jobRoleNamed(table[group] ?? table.other) : undefined;
}

// What a role writes in each box: a box holding any of these (or nothing) has not been written by a person.
const known = (pick: (r: JobRole) => string): Set<string> => new Set(JOB_ROLES.map((r) => keyOf(pick(r))));
const BOXES: { box: string; of: (r: JobRole) => string; held: Set<string> }[] = [
  { box: "reportsTo", of: (r) => r.reportsTo, held: known((r) => r.reportsTo) },
  { box: "delegationAuthorities", of: (r) => r.authorities, held: known((r) => r.authorities) },
  { box: "delegationResponsibilities", of: (r) => r.responsibilities, held: known((r) => r.responsibilities) },
];
const DUTY_LISTS = new Set(JOB_ROLES.map((r) => r.duties.map(keyOf).join("|")));
const QUALIFICATION = "As Per Employees Competence Chart";

/**
 * The sheet with the role its Position box names: the Reports to, the delegation and every responsibility line. A box or a list of lines a
 * person wrote is theirs and is left alone; one still blank, or still holding a role's own words, takes the new role's.
 */
export function withJobRole(before: LogSheetData | undefined, next: LogSheetData): LogSheetData {
  const role = jobRoleNamed(next.header?.position);
  if (!role || keyOf(before?.header?.position) === keyOf(next.header?.position)) return next;
  const header = { ...next.header };
  for (const { box, of, held } of BOXES) {
    const now = keyOf(header[box]);
    if (now === "" || held.has(now)) header[box] = of(role);
  }
  if (!said(header.minQualification)) header.minQualification = QUALIFICATION;
  const lines = (next.rows ?? []).map((r) => said(r.responsibility));
  const written = lines.filter(Boolean);
  const theirs = written.length > 0 && !DUTY_LISTS.has(written.map(keyOf).join("|"));
  if (theirs) return { ...next, header };
  const rows = role.duties.map((responsibility, i) => ({ ...(next.rows?.[i] ?? { id: generateId("row") }), responsibility }));
  return { ...next, header, rows };
}

/** Two ways of writing one role ("Manager-HR", "Manager - Hr"). */
export const sameJobRole = (a: unknown, b: unknown): boolean => !!keyOf(a) && keyOf(a) === keyOf(b);

/** A new sheet of this role: every box and line the role writes, the person's signature and its date left for them. */
export function jobSheetOfRole(role: JobRole, data: LogSheetData): LogSheetData {
  return {
    ...data,
    header: {
      ...data.header,
      position: role.title,
      reportsTo: role.reportsTo,
      delegationAuthorities: role.authorities,
      delegationResponsibilities: role.responsibilities,
      minQualification: QUALIFICATION,
      employeeSignature: "",
      signDate: "",
    },
    rows: role.duties.map((responsibility, i) => ({ ...(data.rows?.[i] ?? { id: generateId("row") }), responsibility })),
  };
}

/** This sheet shows a role's draft: not a company file's words, and HR has still to check it. */
export const isDraftJobRole = (position: unknown): boolean => !!jobRoleNamed(position)?.draft;
