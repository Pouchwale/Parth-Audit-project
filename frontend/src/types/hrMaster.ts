// HR MASTER DATA (REQUIREMENTS §53) — the Human Resources employee master sheet:
// one line per employee, in exactly the six columns HR keeps it in. The HR
// formats that name a person fetch that person's details from here
// (engine/hrMaster.ts).

export type HrMasterColumnKey = "gp3No" | "joiningDate" | "fullName" | "department" | "designation" | "dateOfBirth";

export interface HrMasterPerson {
  id: string;
  /** The employee's number at GP-3, as HR writes it. */
  gp3No: string;
  /** YYYY-MM-DD, or "" when not known. */
  joiningDate: string;
  fullName: string;
  department: string;
  designation: string;
  /** YYYY-MM-DD, or "" when not known. */
  dateOfBirth: string;
  /** The other spellings the registers use for this person ("Sunny Singh" on F/HR/06) — so their lines are recognised. Not a column. */
  aliases?: string[];
  /** Where a line put on the sheet from the registers came from — "F/HR/01 line 60". Not a column of the sheet. */
  sources?: string[];
  /** What HR is asked to confirm about the line (spellings or dates the registers disagree on). Not a column of the sheet. */
  notes?: string[];
  updatedAt: string;
  updatedBy: string;
}
