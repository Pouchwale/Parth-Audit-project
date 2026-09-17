import type { HrMasterPerson, LogSheetData, LogSheetRow, RecordInstance } from "../../types";
import { SEED_HR_COMPETENCE, SEED_HR_INDUCTION_OPERATORS, SEED_HR_SKILL_MATRIX } from "./hrRecords";
import { nameKey, parseWrittenDate, splitDepartmentDesignation } from "../../engine/hrMaster";

// THE HR MASTER SHEET AS FIRST SET UP (REQUIREMENTS §53).
//
// No supplied document is an employee master, so the sheet is put together
// from the three registers on file that record when a person joined, and
// nothing else:
//
//   F/HR/01  Personal Competence Records — staff: name, department, designation, date of joining
//   F/HR/03  Skill Matrix – Operator      — operators: name, designation (their process), date of joining
//   F/HR/06  Induction Training Record    — operators / workers: name, joining department & designation, date
//
// Only people still employed are on it: a line on F/HR/01 with a Date of
// Leaving on or before the register's own "reviewed as on" date, or a line on
// F/HR/03 marked Left, leaves that person off — and off the sheet from every
// register. F/HR/08 (training needs) and F/HR/13 (mobile authorisation) are not
// used: neither records a joining, and F/HR/08's designations run one line out
// of step for a stretch of the PDF (REQUIREMENTS §46).
//
// One person on two registers is one line. Lines on DIFFERENT registers are
// the same person when their names match — or when the first names match (one
// may be the start of the other: "Neel" / "Neelkumar") and the surnames match
// or differ by one letter ("Bhaach" / "Bharach"), as the registers' own
// spellings do; if a line could be two people it joins neither. Then:
//
//   Full Name    the fullest spelling (more words, then more letters)
//   Department   F/HR/01's, else F/HR/06's department part
//   Designation  F/HR/01's, else F/HR/06's designation part, else F/HR/03's process
//   Joining Date F/HR/01's, else F/HR/03's, else F/HR/06's — each read in its
//                register's own style (F/HR/01 and F/HR/03 write slashed dates
//                month first, F/HR/06 day first; dotted dates are day first)
//
// Every disagreement — another spelling, two different joining dates, a date
// that is not a date (F/HR/01's 30.02.2020), a leaving date still to come — is
// kept as a note on the line for HR to confirm. GP3 No. and Date of Birth are
// on no supplied document, so they are blank for HR to enter or upload.

type Register = "F/HR/01" | "F/HR/03" | "F/HR/06";

interface RegisterLine {
  register: Register;
  line: number;
  rowId: string;
  name: string;
  department: string;
  designation: string;
  joinedAsWritten: string;
  joined: string | null;
  left: boolean;
  note?: string;
}

const SEEDED_AT = "2026-09-17T00:00:00.000Z";
export const HR_MASTER_SEEDED_BY = "HR Master Data — set up from F/HR/01, F/HR/03 and F/HR/06 as on file";

const text = (row: LogSheetRow, key: string) => String(row[key] ?? "").trim();
const rowsOf = (record: RecordInstance<LogSheetData>) => record.data.rows;

function competenceLines(): RegisterLine[] {
  const reviewedOn = parseWrittenDate(SEED_HR_COMPETENCE.data.header.reviewedOn, "mdy") ?? SEED_HR_COMPETENCE.dueDate;
  return rowsOf(SEED_HR_COMPETENCE).map((row, i) => {
    const leaving = text(row, "dateOfLeaving");
    const leavingIso = leaving ? parseWrittenDate(leaving, "mdy") : null;
    const left = !!leaving && (!leavingIso || leavingIso <= reviewedOn);
    return {
      register: "F/HR/01",
      line: i + 1,
      rowId: row.id,
      name: text(row, "name"),
      department: text(row, "department"),
      designation: text(row, "designation"),
      joinedAsWritten: text(row, "dateOfJoining"),
      joined: parseWrittenDate(text(row, "dateOfJoining"), "mdy"),
      left,
      note: leaving && !left ? `F/HR/01 line ${i + 1} gives a Date of Leaving of ${leaving}.` : undefined,
    };
  });
}

function skillLines(): RegisterLine[] {
  return rowsOf(SEED_HR_SKILL_MATRIX).map((row, i) => ({
    register: "F/HR/03",
    line: i + 1,
    rowId: row.id,
    name: text(row, "name"),
    department: "",
    designation: text(row, "designation"),
    joinedAsWritten: text(row, "dateOfJoining"),
    joined: parseWrittenDate(text(row, "dateOfJoining"), "mdy"),
    left: /\bleft\b/i.test(text(row, "remarks")),
  }));
}

function inductionLines(): RegisterLine[] {
  return rowsOf(SEED_HR_INDUCTION_OPERATORS).map((row, i) => {
    const { department, designation } = splitDepartmentDesignation(text(row, "joining"));
    return {
      register: "F/HR/06",
      line: i + 1,
      rowId: row.id,
      name: text(row, "name"),
      department,
      designation,
      joinedAsWritten: text(row, "dateOfJoiningInduction"),
      joined: parseWrittenDate(text(row, "dateOfJoiningInduction"), "dmy"),
      left: false,
    };
  });
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

function samePerson(a: RegisterLine, b: RegisterLine): boolean {
  const x = nameKey(a.name).split(" ").filter(Boolean);
  const y = nameKey(b.name).split(" ").filter(Boolean);
  if (x.length === 0 || y.length === 0) return false;
  if (x.join(" ") === y.join(" ")) return true;
  if (x.length < 2 || y.length < 2) return false;
  const [fx, fy] = [x[0], y[0]];
  const firstNames = fx === fy || (Math.min(fx.length, fy.length) >= 4 && (fx.startsWith(fy) || fy.startsWith(fx)));
  const [lx, ly] = [x[x.length - 1], y[y.length - 1]];
  const surnames = lx === ly || (Math.min(lx.length, ly.length) >= 4 && editDistance(lx, ly) <= 1);
  return firstNames && surnames;
}

function toPerson(group: RegisterLine[]): HrMasterPerson {
  const on = (register: Register) => group.find((l) => l.register === register);
  const [l01, l03, l06] = [on("F/HR/01"), on("F/HR/03"), on("F/HR/06")];
  const words = (l: RegisterLine) => nameKey(l.name).split(" ").length;
  const fullName = [...group].sort((a, b) => words(b) - words(a) || b.name.length - a.name.length)[0].name;
  const notes: string[] = [];
  for (const l of group) if (l.name !== fullName) notes.push(`Written "${l.name}" on ${l.register} line ${l.line}.`);
  const dated = group.filter((l) => l.joinedAsWritten);
  for (const l of dated) if (!l.joined) notes.push(`${l.register} line ${l.line} gives the date of joining as ${l.joinedAsWritten}, which is not a date — to be confirmed.`);
  if (new Set(dated.filter((l) => l.joined).map((l) => l.joined)).size > 1) {
    notes.push(`The registers disagree on the date of joining — ${dated.map((l) => `${l.register}: ${l.joinedAsWritten}`).join("; ")} — to be confirmed.`);
  }
  for (const l of group) if (l.note) notes.push(l.note);
  return {
    id: `hrm-${group[0].rowId}`,
    gp3No: "",
    joiningDate: l01?.joined ?? l03?.joined ?? l06?.joined ?? "",
    fullName,
    department: l01?.department || l06?.department || "",
    designation: l01?.designation || l06?.designation || l03?.designation || "",
    dateOfBirth: "",
    aliases: Array.from(new Set(group.map((l) => l.name).filter((n) => n !== fullName))),
    sources: group.map((l) => `${l.register} line ${l.line}`),
    notes: notes.length > 0 ? notes : undefined,
    updatedAt: SEEDED_AT,
    updatedBy: HR_MASTER_SEEDED_BY,
  };
}

function buildSeed(): HrMasterPerson[] {
  const groups: RegisterLine[][] = [];
  for (const line of [...competenceLines(), ...skillLines(), ...inductionLines()]) {
    if (!line.name) continue;
    const matches = groups.filter((g) => !g.some((l) => l.register === line.register) && g.some((l) => samePerson(l, line)));
    if (matches.length === 1) matches[0].push(line);
    else groups.push([line]);
  }
  return groups.filter((g) => !g.some((l) => l.left)).map(toPerson);
}

export const HR_MASTER_SEED: HrMasterPerson[] = buildSeed();
