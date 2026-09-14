import type { LogSheetData, LogSheetRow, RecordInstance } from "../../types";
import { CALENDAR_TOPICS, calendarRow, PSC_ATTRIBUTES } from "./hrLayouts";

// THE HUMAN RESOURCES REGISTERS AS SUPPLIED — the filled registers among the
// sixteen F/HR/… PDFs of 14-Sep-2026, transcribed line for line and seeded as
// LIVE records (isDemo: false), the way the Dec-2023 GAP report and the two
// training records are. They are the plant's own current rosters and plans,
// so they are on file here exactly as the department keeps them on paper:
//
//   F/HR/01  Personal Competence Records — 80 staff, reviewed as on 01.10.2026
//   F/HR/03  Skill Matrix – Operator      — 58 operators, status as on 01.09.2026
//   F/HR/06  Induction Training Record    — 28 operators / workers inducted Jun-2025 .. Jan-2026
//   F/HR/07  Job Responsibility & Authority — eight positions (one sheet each)
//   F/HR/08  Training Need Identification — 154 employees for 01.04.2026 ~ 31.03.2027
//   F/HR/09  Training Plan Calender       — nineteen topics for 01.04.2026 ~ 31.03.2027
//   F/HR/13  Authorization for Mobile usage — 37 employees
//   F/HR/21  Product Safety Culture Survey analysis — January 2026
//
// Names, designations and dates are as written, spelling and date style
// included. Two things are deliberately NOT transcribed, and say so on the
// record: the topic ticks of F/HR/08 (the X marks did not survive the PDF's
// text layer unambiguously — the 154 names and designations are in, the
// ticks are for HR to confirm, so that record is seeded Submitted rather than
// Verified), and the 01.02.2025 issue of the skill matrix that follows the
// current one in the same PDF (superseded by the 01.09.2026 status). The two
// near-identical Executive-Lab sheets of F/HR/07 are one position and seeded
// once. REQUIREMENTS §46.

const SEEDED_AT = "2026-09-14T00:00:00.000Z";
const ON_FILE = "HR & Admin (register as supplied, 14-Sep-2026)";

type Cells = Record<string, string | number | null>;

function rowsOf(prefix: string, values: Cells[]): LogSheetRow[] {
  return values.map((v, i) => ({ id: `${prefix}-${i + 1}`, ...v }));
}

function seeded(
  id: string,
  documentId: string,
  dueDate: string,
  data: LogSheetData,
  status: "Verified" | "Submitted" = "Verified",
): RecordInstance<LogSheetData> {
  const base: RecordInstance<LogSheetData> = {
    id,
    documentId,
    periodKey: `${documentId}:${dueDate}`,
    dueDate,
    status,
    isDemo: false,
    data,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    submittedBy: ON_FILE,
    submittedAt: SEEDED_AT,
  };
  return status === "Verified" ? { ...base, verifiedBy: ON_FILE, verifiedAt: SEEDED_AT } : base;
}

// ---------------------------------------------------------------------------
// F/HR/01 — PERSONAL COMPETENCE RECORDS (STAFF MEMBERS ONLY), reviewed as on 01.10.2026
// [name, department, designation, eduRequired, eduAvailable, expRequired, expAvailable, gap, joined, left]

const COMPETENCE: string[][] = [
  ["Shail Patel", "Top management", "CEO", "Graduate", "BE", "NA", "7 Years", "NA", "01.04.2014", ""],
  ["Swarup Rajgor", "Sales & Marketing", "Director", "Graduate", "B.A.", "5 Years", "5 Years", "NA", "04.03.2017", ""],
  ["Virat Rajgor", "Operations", "Director", "Graduate", "B.com", "5 Years", "1 Year", "NA", "01.03.2022", ""],
  ["Vinay Bhojak", "HR & Admin", "Sr.Manager", "Graduate", "B.E , M.B.A", "5 Years", "9 Years", "NA", "01.02.2024", ""],
  ["Jay Vyas", "Sales & Marketing", "Sales Executive", "Graduate", "B.com", "Fresher", "11 Years", "NA", "01.03.2011", "4/30/2025"],
  ["Navin Prajapati", "Design & Development", "Graphic Designer", "A.T.D /B.A", "Graphic Designer", "3 Years", "7 Years", "NA", "08.05.2017", ""],
  ["Chandrakant Barot", "Design & Development", "Graphic Designer", "Fine Art", "Graphic Designer", "3 Years", "12 Years", "NA", "19.12.2021", ""],
  ["Bhavesh Nagarkar", "Design & Development", "Graphic Designer", "Fine Art", "Graphic Designer", "3 Years", "3 Years", "NA", "01.03.2024", ""],
  ["Samir Mansuri", "Design & Development", "Graphic Designer", "Fine Art", "BCA", "3 Years", "4 Years", "NA", "16.04.2023", ""],
  ["Dipak Parmar", "Purchase", "Manager -Purchase", "Graduate", "Mechinical Engineering", "5 Years", "8 Years", "NA", "01.07.2018", "4/30/2025"],
  ["Keyur Sathavara", "PPC", "Manager", "Graduate", "Mechinical Engineering", "1 Year", "2 Years", "NA", "30.02.2020", ""],
  ["Niki Patel", "Sales & Marketing", "Team Leader", "Graduate", "MBA Finance", "1 Year", "3 Year", "NA", "01.04.2022", ""],
  ["Chirag Parmar", "Purchase", "Purchase Manager", "Graduate", "B.Com/ C.S Pursuing", "1 Year", "1 Year", "NA", "13.07.2022", ""],
  ["Janvi Prajapati", "Sales & Marketing", "Sales Coordinator", "Graduate", "ITI - COPA", "1 Year", "3 Years", "NA", "24.02.2020", "5/12/2025"],
  ["Ved Raval", "Sales & Marketing", "Sales Coordinator", "Graduate", "B.Tech", "1 Year", "2.5 Years", "NA", "01.03.2024", "5/10/2025"],
  ["Jyoti Bind", "Pouch", "Supervisor", "Graduate", "M. Com", "1 Year", "3 Years", "NA", "03.06.2024", ""],
  ["Parth Chauhan", "Dispatch", "Manager - Dispatch", "Graduate", "B.A.", "1 Year", "1 Year", "NA", "14.04.2023", ""],
  ["Akash Patel", "Flexo", "Manager - Production", "Diploma", "B.SC.", "5 Years", "5Years", "NA", "01.10.2022", ""],
  ["Nalin Darji", "Paper Stores", "Manager", "12 pass", "12 Pass", "5 Years", "13 years", "NA", "01.02.2015", ""],
  ["Nikul Parmar", "Carton", "Manager", "Graduate", "B.A.", "3 Year", "5 Year", "NA", "2/2/2019", ""],
  ["Hasmukhbhai Raval", "Corrugation", "Manager", "Graduate", "B.A.", "3 Year", "22 Year", "NA", "21/07/2010", ""],
  ["Dinesh Patel", "Corrugation", "HOD", "12 pass", "12 Pass", "5 Years", "13 years", "NA", "27/04/2005", ""],
  ["Bhaveshbhai Prajapati", "Corrugation", "Supervisor", "12 pass", "12 Pass", "5 Years", "18 years", "NA", "9/4/1994", ""],
  ["Vikram Thakor", "Corrugation", "Team Leader", "Graduate", "B.Com", "3 Year", "3 Year", "NA", "7/18/2003", ""],
  ["Kamlesh Prajapati", "Corrugation", "Team Leader", "Graduate", "B.A.", "3 Year", "3 Year", "NA", "5/2/2004", ""],
  ["Hemantbhai Nayak", "General Stores", "Manager", "12 Pass", "10 Pass", "5 Years", "19 Years", "NA", "01.01.2004", ""],
  ["Anil Raval", "Accountant", "Accountant", "B.Com", "B.C.A", "2Yrs", "2 Years", "NA", "14.04.2023", "1/2/2025"],
  ["Mukesh Patel", "Maintainance", "Manager - Mentainance", "Diploma", "10 Pass", "5 Years", "26 Years", "NA", "06.04.1996", ""],
  ["Kapila Barad", "QC", "Manager - QA", "Diploma", "Diploma - Plastic", "5 Years", "9 Years", "NA", "05.10.2020", ""],
  ["Karan Prajapati", "Lab", "Lab Executive - Trainee", "B.SC.", "B.SC.", "Fresher", "8 Months", "NA", "09.05.2021", "9/5/2024"],
  ["Priti Solanki", "Lab", "Lab Executive", "B.SC.", "B.Tech", "2 Years", "2 Years", "NA", "10.03.2023", "10/12/2023"],
  ["Anil Raval", "Lab", "Lab Executive", "B.SC.", "12 Pass", "2 Years", "10 Years", "NA", "15.02.2010", ""],
  ["Upendra Zala", "Flexo-Packing", "Supervisor", "12 Pass", "10 Pass", "3 Years", "22 Years", "NA", "01.01.2001", "10/8/2025"],
  ["Ajay Vaghela", "Flexo-QC", "Supervisor", "12 Pass", "10 Pass", "3 Years", "3 Years", "NA", "27.01.2019", ""],
  ["Rahul Patel", "Maintainance", "Supervisor", "ITI", "ITI", "3 Years", "9 Years", "NA", "19.12.2014", ""],
  ["Vaishnavi Patel", "Reception", "Receptionist", "Graduate", "B.Com", "Fresher", "2 Years", "NA", "10.12.2024", "1/1/2025"],
  ["Jagdish Prajapati", "Discipline", "Manager", "Graduate", "M.Com", "2 Years", "2 Years", "NA", "01.04.2022", ""],
  ["Sandeep Parekh", "HR & Admin", "Manager", "Graduate", "B.com", "5 Years", "7 Years", "NA", "05.07.2024", ""],
  ["Vishnubhai Panchal", "Pouch", "Supervisor", "Graduate", "Diploma", "5 Years", "8 Years", "NA", "13.12.2024", ""],
  ["Mangru Sharma", "Pouch", "Manager", "Graduate", "Diploma", "5 Years", "12 Years", "NA", "14.12.2024", "8/14/2025"],
  ["Pragati Patel", "Sales & Marketing", "Sales Coordinator", "Graduate", "MBA", "1 Year", "1 Year", "NA", "01.01.2025", ""],
  ["Vishva vyas", "Sales & Marketing", "Sales Coordinator", "Graduate", "MBA", "1 Year", "1 Year", "NA", "01.01.2025", ""],
  ["Divya Vasava", "Sales & Marketing", "Sales Coordinator", "Graduate", "MBA", "1 Year", "1 Year", "NA", "01.01.2025", "8/1/2025"],
  ["Suryansh Raval", "Sales & Marketing", "Sales Coordinator", "Graduate", "MBA", "1 Year", "1 Year", "NA", "01.01.2025", "8/17/2025"],
  ["Noman Pawar", "Sales & Marketing", "Sales Coordinator", "Graduate", "MBA", "1 Year", "1 Year", "NA", "01.01.2025", "8/10/2025"],
  ["Zinal Patel", "Sales & Marketing", "Sales Coordinator", "Graduate", "MBA", "1 Year", "1 Year", "NA", "01.01.2025", "8/22/2025"],
  ["Kunjal Zala", "Lab", "Lab Executive", "B.SC.", "M.SC.", "Fresher", "6 Months", "NA", "02.01.2025", "7/18/2025"],
  ["Roshni Senma", "Lab", "Lab Executive", "B.SC.", "M.SC.", "Fresher", "6 Months", "NA", "17.05.2023", ""],
  ["Yatin Nayi", "Account", "Assistant", "Graduate", "M.Com", "2 Years", "2 Years", "NA", "17.01.2025", ""],
  ["Kaushal Dave", "Account", "Assistant", "Graduate", "M.Com", "2 Years", "2 Years", "NA", "17.01.2025", "10/18/2025"],
  ["Divya Parmar", "Pouch", "Supervisor", "Graduate", "M.Com", "1 Years", "23Years", "NA", "01.02.2025", ""],
  ["Ayushi Pravinbhai Patel", "PPC", "Sales Coordinator", "Graduate", "MBA", "1 Year", "1 Year", "NA", "3/8/2025", "9/22/2025"],
  ["Chirag Devanand Kalwani", "IT", "Manager", "Graduate", "B-Tech", "1 Year", "1 Year", "NA", "3/10/2025", ""],
  ["Tushar Ambalal Patel", "General Stores", "Manager", "Graduate", "Graduate", "1 Year", "4Year", "NA", "3/15/2025", "5/30/2025"],
  ["Nikita Hasmukhbhai Nayi", "PPC", "Sales Coordinator", "Graduate", "MBA", "1 Year", "1 Year", "NA", "3/25/2025", "5/30/2025"],
  ["Sandip Ishwarbhai Srimali", "PPC", "Sales Coordinator", "Graduate", "MBA", "1 Year", "1 Year", "NA", "4/1/2025", "5/30/2025"],
  ["Devyani Chandrasingh Vaghela", "PPC", "Sales Coordinator", "Graduate", "MBA", "1 Year", "1 Year", "NA", "4/1/2025", ""],
  ["Jigar Navinbhai Makwana", "General Stores", "Assistant", "Graduate", "Graduate", "1 Year", "1 Year", "NA", "4/8/2025", "8/10/2025"],
  ["Shivam Rajivkumar Trivedi", "PPC", "Production Planning", "Graduate", "MBA", "1 Year", "1 Year", "NA", "4/14/2025", ""],
  ["Azaz Bhaach", "Pouch", "Manager-Pouch", "Graduate", "MBA", "5 Year", "12 Year", "NA", "6/23/2025", ""],
  ["Dhruvil Thakor", "Pouch", "Process Engineer", "Graduate", "BBA", "2 Year", "2 Year", "NA", "7/20/2025", "9/30/2025"],
  ["Pooja Prajapati", "Lab", "Assistant", "Graduate", "Graduate", "1 Year", "1 Year", "NA", "7/10/2025", "1/10/2026"],
  ["Krina Shah", "Sales & Marketing", "Sales Coordinator", "Graduate", "Graduate", "1 Year", "1 Year", "NA", "7/14/2025", ""],
  ["Shveta Makwana", "Sales & Marketing", "Sales Coordinator", "Graduate", "BBA", "1 Year", "1 Year", "NA", "7/21/2025", ""],
  ["Chetana Makwana", "Sales & Marketing", "Executive Assistance", "Graduate", "MBA", "2 Year", "2 Year", "NA", "8/14/2025", ""],
  ["Fena Modi", "HR & Admin", "Assistant", "Graduate", "MBA", "2 Year", "2 Year", "NA", "8/18/2025", "11/20/2026"],
  ["Vishnubhai Jadav", "Flexo", "Plant Head", "Graduate", "Graduate", "10 Year", "15 Year", "NA", "12/1/2025", ""],
  ["Krupa Harshadbhai Patel", "Sales & Marketing", "Sales Coordinator", "Graduate", "MBA", "Fresher", "Fresher", "NA", "1/10/2026", ""],
  ["Jainam Bhaveshkumar Modi", "IT", "Executive", "Graduate", "MBA", "Fresher", "Fresher", "NA", "1/10/2026", ""],
  ["Neelkumar Vimalbhai Bhavsar", "MIS", "Executive", "Graduate", "MBA", "Fresher", "Fresher", "NA", "1/10/2026", ""],
  ["Umang Pramodbhai Shah", "MIS", "Executive", "Graduate", "MBA", "Fresher", "Fresher", "NA", "1/10/2026", ""],
  ["Muskan Prem Chaouhan", "PPC", "Executive", "Graduate", "MBA", "Fresher", "Fresher", "NA", "1/17/2026", ""],
  ["Patel Poojan Vishnubhai", "Lab", "Executive", "Graduate", "Graduate", "Fresher", "Fresher", "NA", "3/28/2026", ""],
  ["Disha Acharya", "Sales & Marketing", "Sales Coordinator", "Graduate", "MBA", "Fresher", "Fresher", "NA", "4/10/2026", ""],
  ["Chaudhary Dhruv Sagrambhai", "Lab", "Executive", "Graduate", "Graduate", "Fresher", "Fresher", "NA", "4/6/2026", "6/10/2026"],
  ["Pareshbhai Patel", "Dispatch", "Manager", "Graduate", "Graduate", "2 Year", "4 Years", "NA", "4/6/2026", ""],
  ["Dharmik Suthar", "INK", "Manager", "Graduate", "Graduate", "Fresher", "Fresher", "NA", "4/13/2026", ""],
  ["Kirti Jhagirdar", "HR & Admin", "Executive", "Graduate", "MBA", "2 Year", "5 Years", "NA", "5/1/2026", ""],
  ["Riya Patel", "MIS", "Executive", "Graduate", "MBA", "Fresher", "Fresher", "NA", "5/26/2026", ""],
  ["Disha Chaudhary", "Sales & Marketing", "Sales Coordinator", "Graduate", "MBA", "Fresher", "Fresher", "NA", "6/1/2026", ""],
];

export const SEED_HR_COMPETENCE: RecordInstance<LogSheetData> = seeded("hr-competence-2026-10-01", "hr-competence", "2026-10-01", {
  header: { reviewedOn: "01.10.2026" },
  rows: rowsOf(
    "hrc",
    COMPETENCE.map(([name, department, designation, eduRequired, eduAvailable, expRequired, expAvailable, gapJustification, dateOfJoining, dateOfLeaving]) => ({
      name, department, designation, eduRequired, eduAvailable, expRequired, expAvailable, gapJustification, dateOfJoining, dateOfLeaving,
    })),
  ),
});

// ---------------------------------------------------------------------------
// F/HR/03 — SKILL MATRIX - OPERATOR, status as on 01.09.2026
// [name, designation, joined, {operation: points}, remarks]

type Skill = [string, string, string, Record<string, string>, string?];

const SKILLS: Skill[] = [
  ["Karan Kalusinh Bariya", "Printing", "5/13/2008", { printing: "5" }],
  ["Natvar Natubhai Nayak", "Printing", "1/5/2007", { printing: "5" }],
  ["Pankaj Popatji Thakor", "Printing", "3/10/2008", { printing: "5" }],
  ["Rayji Jalamsinh Rathore", "Printing", "8/13/2008", { printing: "5" }],
  ["Gita Jayntibhai Nayi", "QC", "6/6/2014", { qcManual: "5" }],
  ["Bhikhu Nanubha Solanki", "Printing", "1/1/2016", { printing: "5" }],
  ["Baldev Bhikhabhai Nayak", "Slitting", "5/5/2007", { slitting: "5", sleeveGluing: "5" }],
  ["Satish Narayanbhai Solanki", "Post Press", "9/23/2018", { qcMachine: "5" }],
  ["Sanjay Ramaji Thakor", "Post Press", "8/22/2024", { qcManual: "5" }],
  ["Karan Ajitsinh Zala", "Printing", "6/5/2020", { printing: "5" }],
  ["Nishan Jitendrabhai Patel", "Post Press", "11/17/2019", {}],
  ["Laxman Kamasibhai Rabari", "Slitting", "1/15/2017", { qcMachine: "5" }],
  ["Dhruv Prandharbhai Shrimali", "Printing", "1/24/2020", { printing: "5" }],
  ["Prakash Mahendraji Thakor", "Post Press", "12/1/2022", { qcMachine: "5" }],
  ["Rohit Bhagabhai Raval", "Sleeve Gluing", "7/16/2022", { sleeveGluing: "5" }],
  ["Ashok Bhikhabhai Chavada", "Reel to Sheet", "5/2/2001", { sheetCutting: "5" }],
  ["Mahendra Nathabhai Raval", "Cutting", "6/13/2002", { sheetCutting: "5" }],
  ["Mohmmad Siddikbhai Vora", "Sheet Cutting", "9/16/1993", { sheetCutting: "5" }],
  ["Dinesh Dayabhai Barot", "Varnish", "7/27/2007", { slitting: "5" }, "Left"],
  ["Devilal Harirambhai Rabari", "Printing", "12/19/2019", { printing: "5" }],
  ["Suresh Prajapati", "Printing", "1/11/2023", { printing: "5" }],
  ["Chandrakant Parmar", "Punching", "7/15/1998", { punching: "5" }],
  ["Kantilal Solanki", "Corrugation", "1/5/2001", { pasting: "5" }],
  ["Manhar Thakor", "Punching", "8/14/2004", { punching: "5" }],
  ["Raman Revabhai Rana", "Corrugation", "7/10/1999", { pasting: "5" }],
  ["Ratilal Dialal Senma", "Corrugation", "1/3/1997", { pasting: "5" }],
  ["Vasant Atmarambhai Raval", "Reel to Sheet", "11/25/2004", { sheetCutting: "5" }],
  ["Chirag Popatlal Gauswami", "Corrugation", "7/1/2012", { bundling: "5" }],
  ["Bharat Kantilal Thakor", "Corrugation", "6/3/2005", { punching: "5" }],
  ["Mukesh Zala", "Corrugation", "4/1/2006", { punching: "5" }],
  ["Vijaysinh Zala", "Operator - Printing Machine Operator", "15.03.2019", { printing: "5" }, "Left"],
  ["Ankit Parihar", "Operator - Printing Machine Operator", "01.12.2021", { printing: "5" }, "Left"],
  ["Sunil Das", "Operator - Printing Machine Operator", "17.10.2021", { printing: "5" }, "Left"],
  ["Virendra Sajubhaa Zala", "Corrugation", "43893", { bundling: "5" }],
  ["Harpal Sinh", "Operator- Shrink Sleeve Cutting machine", "24.11.2020", { sleeveCutting: "5" }, "Left"],
  ["Neetu Mali", "Operator - Offline QC Insection", "01.01.2022", { qcManual: "5" }, "Left"],
  ["Kajal Parmar", "Operator - Offline QC Insection", "24.12.2021", { qcManual: "5" }, "Left"],
  ["Divya Thakor", "Operator - Offline QC Insection", "01.01.2022", { qcManual: "5" }, "Left"],
  ["Rambha Vinubhai Zala", "Pasting", "45439", { pasting: "5" }],
  ["Ankur Kiritbhai Raval", "Lamination", "5/20/2024", { lamination: "5" }],
  ["Anilji Govindji Thakor", "Post Press", "9/7/2024", { qcManual: "5" }],
  ["Kiran Parbatji Thakor", "Pasting", "1/1/2025", { pasting: "5" }],
  ["Azad Popatlal Patel", "Pouching", "7/1/2025", { pouchingMachine: "5" }],
  ["Sunny Mahesh Singh", "Pouching", "7/20/2025", { pouchingMachine: "5" }],
  ["Manish Meghnath Singh", "Pouching", "7/20/2025", { pouchingMachine: "5" }],
  ["Farhan Abdulmajid Nagori", "Pouching", "7/16/2025", { pouchingMachine: "5" }],
  ["Jaypalsinh Chavada", "Pouching", "8/12/2025", { slitting: "5" }],
  ["Deepak kumar Yadav", "Pouching", "8/24/2025", { pouchingMachine: "5" }],
  ["Rajuji Bakaji Chavada", "Lamination", "8/22/2025", { lamination: "3" }],
  ["Mukeshsinh Chavada", "Printing", "9/8/2025", { slitting: "5" }],
  ["Dineshji Baldevji Thakor", "Lamination", "11/8/2025", { lamination: "3" }],
  ["Nitikesh Vijay Sharma", "Pouching", "11/9/2025", { lamination: "3" }],
  ["Mohan Ishwardeen Sharma", "Pouching", "11/11/2025", { pouchingMachine: "3" }],
  ["Sunil Kumar Yadav", "Pouching", "11/26/2025", { pouchingMachine: "3" }],
  ["Sushil Jay Prakash Singh", "Pouching", "12/19/2025", { pouchingMachine: "5" }],
  ["AnkitKumar Raval", "Pouching", "12/12/2025", { pouchingMachine: "5" }],
  ["Sureshbhai Thakor", "Pouching", "1/7/2026", { pouchingMachine: "5" }],
  ["Subham Sahu", "Pouching", "4/15/2026", { pouchingMachine: "5" }],
];

export const SEED_HR_SKILL_MATRIX: RecordInstance<LogSheetData> = seeded("hr-skill-matrix-2026-09-01", "hr-skill-matrix", "2026-09-01", {
  header: { statusAsOn: "01.09.2026" },
  rows: rowsOf(
    "hrs",
    SKILLS.map(([name, designation, dateOfJoining, marks, remarks]) => ({ name, designation, dateOfJoining, ...marks, remarks: remarks ?? "" })),
  ),
});

// ---------------------------------------------------------------------------
// F/HR/06 — INDUCTION TRAINING RECORD (operators / workers), Jun-2025 .. Jan-2026

const INDUCTIONS: string[][] = [
  ["Azaz Bharach", "POUCH-Manager", "01/06/2025"],
  ["Azad Popatlal Patel", "OPERATOR- POUCH", "01/07/2025"],
  ["Sunny Singh", "OPERATOR- POUCH", "20/07/2025"],
  ["Manish Singh", "OPERATOR- POUCH", "20/07/2025"],
  ["Pooja Prajapati", "Lab-executive", "10/07/2025"],
  ["Hasnaben D Prajapti", "Pouch-Helper", "16/07/2025"],
  ["Kokilaben Thakor", "Pouch-Helper", "14/08/2025"],
  ["Deepak Yadav", "OPERATOR- POUCH", "24/08/2025"],
  ["Rajuji Chavada", "OPERATOR- PRINTING", "22/08/2025"],
  ["Nisarg Dave", "LABEL-ASSI.", "01/08/2025"],
  ["Bharat Ahir", "Store-Assi", "25/08/2025"],
  ["Mukesh Chavada", "OPERATOR- PRINTING", "08/09/2025"],
  ["Divyang Solanki", "Sales-Assi", "27/10/2025"],
  ["Vishnubhai Jadhav", "Pouch-HOD", "01/11/2025"],
  ["Dineshji Thakor", "OPERATOR- PRINTING", "08/11/2025"],
  ["Nitikesh Sharma", "OPERATOR- POUCH", "09/11/2025"],
  ["Mohan Sharma", "OPERATOR- POUCH", "11/11/2025"],
  ["Amitbhai Vaghri", "OPERATOR- POUCH", "26/11/2025"],
  ["Sunil Kumar Yadav", "OPERATOR- POUCH", "26/11/2025"],
  ["Sushil Singh", "OPERATOR- POUCH", "19/12/2025"],
  ["Dipikaben Patel", "PPC-EXUCUTIVE", "01/12/2025"],
  ["Sureshbhai Thakor", "OPERATOR- POUCH", "07/01/2026"],
  ["Jainam Modi", "IT - ASSISTANT", "10/01/2026"],
  ["Helsi Patel", "BDE-TELE CALLER", "10/01/2026"],
  ["Diya Chawla", "Sales-EXUCUTIVE", "10/01/2026"],
  ["Neel Bhavsar", "Sales-EXUCUTIVE", "10/01/2026"],
  ["Umang Shah", "Sales-EXUCUTIVE", "10/01/2026"],
  ["Muskan Chauhan", "PPC-Executive", "17/01/2026"],
];

export const SEED_HR_INDUCTION_OPERATORS: RecordInstance<LogSheetData> = seeded("hr-induction-operators-2026-01-17", "hr-induction-operators", "2026-01-17", {
  header: {},
  rows: rowsOf(
    "hri",
    INDUCTIONS.map(([name, joining, dateOfJoiningInduction]) => ({ name, joining, dateOfJoiningInduction, signHod: "", signHeadHr: "", signOperator: "" })),
  ),
});

// ---------------------------------------------------------------------------
// F/HR/07 — JOB RESPONSIBILITY & AUTHORITY — one record per position

interface Position {
  slug: string;
  position: string;
  reportsTo: string;
  duties: string[];
  authorities: string;
  responsibilities: string;
}

const POSITIONS: Position[] = [
  {
    slug: "executive-lab", position: "Executive-Lab", reportsTo: "Manager-QA",
    duties: [
      "Responsible for carrying out inspection & testing of (RM, PM & Finish products) as per Quality Plan",
      "Responsible for identification & calibration of inspection, measuring & testing equipment's.",
      "Retention of lot samples for all lots dispatched as per defined period",
      "Preparation of Shade card",
    ],
    authorities: "Manager QA", responsibilities: "Quality Supervisior",
  },
  {
    slug: "executive-hr", position: "Executive-Hr", reportsTo: "Manager-Hr",
    duties: [
      "Source candidates through job portals, social media, and recruitment agencies.",
      "Screen resumes and conduct initial interviews.",
      "Coordinate interviews with department heads.",
      "Maintain daily attendance and leave records.",
      "Verify biometric attendance data.",
      "Coordinate monthly payroll inputs.",
      "Maintain overtime and shift records.",
      "Resolve attendance and payroll-related queries.",
    ],
    authorities: "Manager-HR", responsibilities: "Manager-HR",
  },
  {
    slug: "manager-dispatch-logistics", position: "Manager Dispatch & Logistics", reportsTo: "Manager-Hr",
    duties: [
      "Plan, coordinate, and monitor daily dispatch and transportation activities.",
      "Ensure timely delivery of finished goods to customers across India.",
      "Optimize vehicle utilization and route planning to reduce transportation costs.",
      "Coordinate with transporters for vehicle availability and on-time dispatches.",
      "Monitor freight costs and negotiate transportation rates.",
      "Track shipments and ensure timely resolution of delivery issues.",
      "Plan, coordinate, and monitor daily dispatch and transportation activities.",
      "Ensure timely delivery of finished goods to customers across India.",
      "Coordinate with procurement, production, planning, and sales teams.",
      "Ensure uninterrupted movement of raw materials and finished goods.",
      "Improve logistics processes through continuous improvement initiatives.",
      "Develop contingency plans for transportation disruptions.",
      "Lead and supervise dispatch, warehouse, and logistics staff.",
      "Allocate work and monitor team productivity.",
      "Conduct regular training on safety, documentation, and process improvements.",
      "Foster a culture of accountability, discipline, and continuous improvement.",
    ],
    authorities: "Manager-Dispatch", responsibilities: "Manager-Dispatch",
  },
  {
    slug: "executive", position: "Executive", reportsTo: "HR Manager",
    duties: [
      "managing budgets/resources (supplies, equipment), ensuring accurate results through strict QC, training personnel, troubleshooting technical issues, and supporting business growth by liaising with clients",
      "Troubleshoot technical problems, ensure accuracy of tests, maintain equipment, manage calibration programs, and provide technical guidance to staff and clients.",
      "Oversee budgeting, order supplies, manage inventory, and ensure efficient allocation of resources (manpower, materials, machines).",
      "Support business development, identify new opportunities, manage client relationships, and help achieve lab goals and KPIs (like TAT/PCD).",
      "blend management, technical oversight, and quality assurance, focusing on supervising staff, maintaining safety & compliance",
    ],
    authorities: "HR Manager", responsibilities: "HR Department",
  },
  {
    slug: "pouching-manager", position: "Pouching Manager", reportsTo: "CEO",
    duties: [
      "Overall responsibility for production of safe & legal products as per customer requirements & specification",
      "Overall responsible for production planning based on the Production order issued from planning department",
      "Responsible for assisting in Product recall & Mock recall, Customer complaints, TACCP & VACCP, Product safety incident team member, Forward & Backward Traceability",
      "Coordinating with purchase department regarding technical/ Commercial Matters",
      "Responsible for PSMS implementation in Production departments",
      "Responsible for the Product Safety of Semi-finished & Finished products,",
      "To ensure customer satisfaction",
      "* To Act and perform the responsibility of the Product Safety Team Leader in their absence",
      "Monitoring & implementation of Polices",
      "Responsible for taking appropriate action in case of product recall",
      "Overall Plant head & overall responsible for the implementation of PSMS system across the organization",
    ],
    authorities: "CEO", responsibilities: "Pouching Department",
  },
  {
    slug: "sales-coordination", position: "Sales Coordination", reportsTo: "Team leader(Sales)",
    duties: [
      "Preparation of Sales order issued in SAP based on the customer order received",
      "Overall responsible for production planning based on the customer order received",
      "Coordinate with customer & internal team of Graphic designer, Production & Purchase",
    ],
    authorities: "Team Leader", responsibilities: "Coordination Department",
  },
  {
    slug: "pouch-manager", position: "Pouch-Manager", reportsTo: "CEO",
    duties: [
      "Overall responsible for production planning based on the Production order issued from planning department",
      "Overall responsibility for production of safe & legal products as per customer requirements & specification",
      "Responsible for assisting in Product recall & Mock recall, Customer complaints, TACCP & VACCP Product safety incident team member, Forward & Backward Traceability & ISO 9001-2015",
      "Coordinating with purchase department regarding technical/ Commercial Matters Responsible for PSMS implementation in Production departments",
      "Responsible for the Product Safety of Semi-finished & Finished products",
      "To Act and perform the responsibility of the Product Safety Team Leader in their absence",
      "Monitoring & implementation of Polices. Responsible for taking appropriate action in case of product recall",
      "Overall Plant head & overall responsible for the implementation of PSMS system across the organization",
      "Responsible for implementation of TACCP, VACCP & Food defense plan",
    ],
    authorities: "Ceo", responsibilities: "Production Manager",
  },
  {
    slug: "quality-executive", position: "Quality Executive", reportsTo: "Manager-QA",
    duties: ["In-Process inspection & Testing of Label & Shrink Sleeve"],
    authorities: "Manager QA", responsibilities: "Lab Executive",
  },
];

export const SEED_HR_JOB_RESPONSIBILITIES: RecordInstance<LogSheetData>[] = POSITIONS.map((p) =>
  seeded(`hr-job-responsibility-${p.slug}`, "hr-job-responsibility", "2021-12-01", {
    header: {
      position: p.position,
      reportsTo: p.reportsTo,
      delegationAuthorities: p.authorities,
      delegationResponsibilities: p.responsibilities,
      minQualification: "As Per Employees Competence Chart",
      employeeSignature: "",
      signDate: "",
    },
    rows: rowsOf(`hrj-${p.slug}`, p.duties.map((responsibility) => ({ responsibility }))),
  }),
);

// ---------------------------------------------------------------------------
// F/HR/08 — EMPLOYEE WISE TRAINING NEED IDENTIFICATION RECORD (01.04.2026 ~ 31.03.2027)
// The 154 employees; the topic ticks are for HR to confirm (see the file header).

const TNI: string[][] = [
  ["Shail Patel", "CEO"], ["Vinay Bhojak", "Manager - HR"], ["Vishnubhai Jadav", "HOD"], ["Azazbhai Bharach", "Manager-Pouch"],
  ["Ajay Vaghela", "Manager - Production (Flexo)"], ["Milan Rajput", "Plate Chacking"], ["Nalin Darji", "Manager - Paper Store"],
  ["Hemantbhai Nayak", "Manager - Store"], ["Mukesh Patel", "Manager - Mentainance"], ["Kapila Barad", "Manager - Lab"],
  ["Harsh Parmar", "Lab Executive"], ["Roshni Senma", "Lab Executive"], ["Chirag Parmar", "Manager -Purchase"], ["Meet Patel", "Lab Executive"],
  ["Tushar Raval", "Supervisor - Flexo"], ["Raj Pratap", "Supervisor - Flexo"], ["Rahul Patel", "Supervisor - Mentainance"],
  ["Ajayshinh P Zala", "LAB-IPQC"], ["Ajay P. Thakor", "LAB-IPQC"], ["Kishan Thakor", "LAB-IPQC"], ["Ajay Thakor", "Store - Assistant"],
  ["Raju bhai Rathore", "Printing Machine Operator"], ["Raghunath Mane", "Printing Machine Operator"], ["Vinu bhai Raval", "Printing Machine Operator"],
  ["Ravirajsinh Zala", "Printing Machine Operator"], ["Vikas Parihar", "Printing Machine Operator"], ["Kisan Parmar", "Operator - Shrink Sleeve machine"],
  ["Natubhai Nayak", "Operator - Shrink Sleeve Supervisor"], ["Vijay Rawal", "Operator - Store"], ["Mahesh Rawal", "Operator - Store"],
  ["Sandeep Parekh", "Manager-HR"], ["Sathish Solanki", "Operator - Punching"], ["Karan Baria", "Operator - Punching"], ["Vikassinh Parmar", "Operator - Punching"],
  ["Nishant Patel", "Operator - Online QC Insection"], ["Sumeet Raval", "Operator - Online QC Insection"], ["Sanjay Thakor", "Operator - Online QC Insection"],
  ["Shailesh Raval", "Operator - Online QC Insection"], ["Geetaben Nai", "Operator - Offline QC Insection"], ["Varsha Shimali", "Operator - Offline QC Insection"],
  ["Baldev Nayak", "Operator - Slitting Machine"], ["Laxman Rabari", "Operator - Slitting Machine"], ["Prakash Thakor", "Operator - Slitting Machine"],
  ["Vikram Zala", "Packing"], ["Sonal Senma", "Packing"], ["Vishal Thakor", "Packing"], ["Allarkhiben Shaikh", "Packing"], ["rajdeep zala", "Packing"],
  ["kamlaben chamar", "Packing"], ["Anukumari", "Packing"], ["Hasmukh Solanki", "Loading"], ["Dilip Parmar", "Loading"], ["Hitesh B. Nayak", "Loading"],
  ["Rakeshbhai Raval", "Loading"], ["Antiben Thakor", "Swipper"], ["Mumtaj Shekh", "Swipper"], ["Pragati Patel", "Sales Coordinator"],
  ["Vishva Vyas", "Sales Coordinator"], ["Divya Vasava", "Sales Coordinator"], ["Yatin Nayi", "Accountant"], ["Kaushal Dave", "Accountant"],
  ["Ramesh Luhariya", "Accountant"], ["Chirag Prajapati", "Accountant"], ["Shivam Trivedi", "PPC"], ["Krina Shah", "Sales Coordinator"],
  ["Shveta makwana", "Sales Coordinator"], ["Chetna Makwana", "Exucutive Assistant"], ["Fena modi", "Hr Exucutive"], ["Pooja Prajapati", "Lab Assistant"],
  ["Bharat Ahir", "Lab Assistant"], ["Azad Popatlal Patel", "Store Assistant"], ["Sunny Mahesh Singh", "Operator - Pouching"],
  ["Manish Meghnath Singh", "Operator - Pouching"], ["Farhan Nagori", "Operator - Pouching"], ["Jaypalsinh Chavada", "Operator - Pouching"],
  ["Deepak kumar Yadav", "Operator - Pouching"], ["Rajuji Bakaji Chavada", "Operator - Pouching"], ["Mukeshsinh Chavada", "Operator - Pouching"],
  ["Dineshji Baldevji Thakor", "Operator - Pouching"], ["Nitikesh Vijay Sharma", "Operator - Pouching"], ["Mohan Ishwardeen Sharma", "Operator - Pouching"],
  ["Sunil Kumar Yadav", "Operator - Pouching"], ["Sushil Jay Prakash Singh", "Operator - Pouching"], ["AnkitKumar Raval", "Operator - Pouching"],
  ["Sureshbhai Thakor", "Operator - Pouching"], ["Suresh Thakor", "Operator - Pouching"], ["Dipikaben", "Assi.Operator - Pouching"], ["Subham Sahu", "PPC"],
  ["Kirti Jahagirdar", "Operator - Pouching"], ["Patel Poojan", "Hr Executive"], ["Muskan Chaouhan", "Lab Executive"], ["Dharmik Suthar", "PPC"],
  ["Paresh Patel", "Manager-INK"], ["Dhruv Chaudhary", "Manager-Dispatch"], ["Nikul Parmar", "Manager-Carton"], ["Bhavesh Prajapati", "Manager-Corrugation"],
  ["Hasmukhbhai Raval", "HOD-Corrugation"], ["Dinesh Patel", "Supervisor"], ["Kamlesh Kantilal Prajapat", "Team Leader"], ["Vikram Ravaji Thakor", "Team Leader"],
  ["Kanu Chandulal Nayi", "Helper"], ["Mahendra Raval", "Operator"], ["Mohmmad Vora", "Operator"], ["Dharmesh Goswami", "Assi. Operator"],
  ["Satish Raval", "Assi. Operator"], ["Harishankar Sharma", "Helper"], ["Devilal Rabari", "Operator"], ["Suresh Prajapati", "Operator"],
  ["Chandrakant Mafatlal Parmar", "Operator"], ["Girish Bhavsar", "Helper"], ["Jawahar Marwadi", "Operator"], ["Raman Rana", "Operator"],
  ["Kantilal Kuberbhai Solanki", "Operator"], ["Kanu Khodabhai Raval", "Operator"], ["Manhar Thakor", "Operator"], ["Chirag Gauswami", "Operator"],
  ["Dashrath Chaudhary", "Operator"], ["Kalumiya Pathan", "Helper"], ["Bharat Kantilal Thakor", "Operator"], ["Mukesh Zala", "Operator"],
  ["Virendra Sajubhaa Zala", "Operator"], ["Rajdip Zala", "Operator"], ["Nitin Barot", "Helper"], ["Rekha Vasava", "Helper"], ["Nayan Vasava", "Assi. Operator"],
  ["Payal Jitubhai Zala", "Helper"], ["Manubhai Prajapati", "Assi. Operator"], ["Rambha Vinubhai Zala", "Operator"], ["Jayeshji Thakor", "Helper"],
  ["Shailesh Sathwara", "Helper"], ["Dilipji Thakor", "Assi. Operator"], ["Hitesh Babuji Thakor", "Helper"], ["Kailashben Suthar", "Helper"],
  ["Kiran Parbatji Thakor", "Operator"], ["Visvas Pawar", "Helper"], ["Ramesh Thakor", "Operator"], ["Bharatbhai Bagul", "Helper"], ["Pravinji Thakor", "Helper"],
  ["Vishal Kalaji Thakor", "Helper"], ["Siddhrajsinh Zala", "Helper"], ["Kalaji Babaji Thakor", "Helper"], ["Prabhatsinh Thakor", "Helper"],
  ["Samirhusen Sindhi", "Helper"], ["Piyushbhai Prabhudas Kadiya", "Helper"], ["Dhanabhai Ganeshbhai Rabari", "Helper"],
  ["Babubhai Devjibhai Chaudhary", "Helper"], ["Shahrukhkhan Sahebajkhan Sipai", "Helper"], ["Yuvrajsinh Parmar", "Helper"], ["Amrutsinh Parmar", "Helper"],
  ["Shivaji Pawar", "Helper"], ["Lalsang Darbar", "Helper"], ["Aruna Rana", "Helper"], ["Rohitsing Vaghela", "Helper"], ["Dhavalkumar lSathvara", "Helper"],
];

export const TNI_NOTE =
  "Topic ticks TO BE CONFIRMED by HR: the 154 names and designations are transcribed from the supplied register, but its X marks did not survive the PDF's text layer unambiguously and have not been guessed. Tick the topics from the paper copy, then verify.";

export const SEED_HR_TRAINING_NEEDS: RecordInstance<LogSheetData> = seeded(
  "hr-training-needs-2026-27",
  "hr-training-needs",
  "2026-04-01",
  {
    header: { period: "01.04.2026 ~ 31.03.2027" },
    rows: rowsOf("hrt", TNI.map(([name, designation]) => ({ name, designation }))),
  },
  "Submitted",
);

// ---------------------------------------------------------------------------
// F/HR/09 — Training Plan Calender (01.04.2026 ~ 31.03.2027)

export const SEED_HR_TRAINING_CALENDAR: RecordInstance<LogSheetData> = seeded("hr-training-calendar-2026-27", "hr-training-calendar", "2026-04-01", {
  header: { period: "01.04.2026 ~ 31.03.2027" },
  rows: rowsOf("hrk", CALENDAR_TOPICS.map(calendarRow)),
});

// ---------------------------------------------------------------------------
// F/HR/13 — Authorization for Mobile usage in Plant area

const MOBILE: string[][] = [
  ["Shail Patel", "CEO", "01/12/2021"], ["Virat Rajgor", "Director - Operation", "01/12/2021"], ["Swarup Rajgor", "Director - Sales & Marketing", "01/12/2021"],
  ["Vinay Bhojak", "Manager - HR", "01/12/2021"], ["Navin Prajapati", "Sr. Graphic Designer", "01/12/2021"], ["Chandrakant Barot", "Graphic Designer", "01/12/2021"],
  ["Jay Vyas", "Sales executive", "01/12/2021"], ["Kapila Barad", "Manager - Lab", "01/12/2021"], ["Sameer Mansuri", "Graphic Designer", "01/12/2021"],
  ["Dipak Parmar", "Manager -Purchase", "01/12/2021"], ["Keyur Sathavara", "PPC", "01/12/2021"], ["Niki Patel", "Sales Coordinator", "01/12/2021"],
  ["Chirag Parmar", "Sales Coordinator", "01/12/2021"], ["Janvi Prajapati", "PPC", "01/12/2021"], ["Hemantbhai Nayak", "Manager - Store", "01/12/2021"],
  ["Mukesh Patel", "Manager - Mentainance", "01/12/2021"], ["Akash Patel", "Manager - Production (Flexo)", "01/12/2021"], ["Milan Rajput", "Plate Chacking", "01/12/2021"],
  ["Nalin Darji", "Manager - Paper Store", "01/12/2021"], ["Anil Raval", "Supervisor", "01/12/2023"], ["Parth Chauhan", "Manager - Dispatch", "01/12/2023"],
  ["Bhavesh Nagarkar", "Graphic Designer", "01/04/2024"], ["Kundan Asodiya", "Graphic Designer", "01/04/2024"], ["Ved Raval", "Sales Coordinator", "01/04/2024"],
  ["Sandeep Parekh", "Hr Manager", "10/07/2024"], ["Jyoti Bind", "Sales Coordinator", "10/07/2024"], ["Mangru Sharma", "Manager-Pouch", "16/12/2024"],
  ["Vishnubhai Panchal", "Pouch Supervisior", "16/12/2024"], ["Pragati Patel", "Sales Coordinator", "16/12/2024"], ["Vishva Vyas", "Sales Coordinator", "05/01/2025"],
  ["Divya Vasava", "Sales Coordinator", "05/01/2025"], ["Suryansh Raval", "Director Support", "05/01/2025"], ["Noman Pawar", "Director Support", "05/01/2025"],
  ["Zinal Patel", "Sales Coordinator", "05/01/2025"], ["Raj Pratap", "Supervisor", "17/01/2025"], ["Tushar Raval", "Supervisor", "17/01/2025"],
  ["Divya Parmar", "Supervisor", "10/02/2025"],
];

export const SEED_HR_MOBILE_AUTHORIZATION: RecordInstance<LogSheetData> = seeded("hr-mobile-authorization-2021-12-01", "hr-mobile-authorization", "2021-12-01", {
  header: {},
  rows: rowsOf("hrm", MOBILE.map(([name, deptDesignation, dateOfAllowance]) => ({ name, deptDesignation, signature: "", dateOfAllowance, authorizedBy: "" }))),
});

// ---------------------------------------------------------------------------
// F/HR/21 — PRODUCT SAFETY CULTURE SURVEY analysis (JANUARY 2026), as printed
// [sa7, ma6, a5, n4, d3, md2, sd1, actual, ideal, achieved]

const PSC_JAN_2026: [number | null, number | null, number | null, number | null, number | null, number | null, number | null, number, number, string][] = [
  [48, 15, null, null, null, null, null, 426, 455, "93.63%"],
  [42, 21, null, null, null, null, null, 420, 442, "95.02%"],
  [39, 24, null, null, null, null, null, 417, 439, "94.99%"],
  [41, 22, null, null, null, null, null, 419, 441, "95.01%"],
  [38, 25, null, null, null, null, null, 416, 438, "94.98%"],
  [32, 31, null, null, null, null, null, 410, 432, "94.91%"],
  [32, 31, null, null, null, null, null, 410, 432, "94.91%"],
  [null, null, null, null, null, null, 63, 63, 58, "92.06%"],
  [36, 27, null, null, null, null, null, 414, 443, "93.45%"],
  [38, 25, null, null, null, null, null, 416, 445, "93.48%"],
  [42, 21, null, null, null, null, null, 420, 449, "93.54%"],
  [35, 28, null, null, null, null, null, 413, 442, "93.44%"],
  [36, 27, null, null, null, null, null, 414, 443, "93.45%"],
  [35, 28, null, null, null, null, null, 413, 442, "93.44%"],
  [39, 24, null, null, null, null, null, 417, 446, "93.50%"],
];

export const SEED_HR_PSC_ANALYSIS: RecordInstance<LogSheetData> = seeded("hr-psc-survey-analysis-2026-01", "hr-psc-survey-analysis", "2026-01-31", {
  header: { surveyPeriod: "JANUARY 2026", overallAchieved: "93.99%" },
  rows: rowsOf(
    "hrp",
    PSC_JAN_2026.map(([sa7, ma6, a5, n4, d3, md2, sd1, actual, ideal, achieved], i) => ({
      parameter: `${i + 1}. ${PSC_ATTRIBUTES[i]}`, sa7, ma6, a5, n4, d3, md2, sd1, actual, ideal, achieved,
    })),
  ),
});

export const SEED_HR_RECORDS: RecordInstance[] = [
  SEED_HR_COMPETENCE as RecordInstance,
  SEED_HR_SKILL_MATRIX as RecordInstance,
  SEED_HR_INDUCTION_OPERATORS as RecordInstance,
  ...(SEED_HR_JOB_RESPONSIBILITIES as RecordInstance[]),
  SEED_HR_TRAINING_NEEDS as RecordInstance,
  SEED_HR_TRAINING_CALENDAR as RecordInstance,
  SEED_HR_MOBILE_AUTHORIZATION as RecordInstance,
  SEED_HR_PSC_ANALYSIS as RecordInstance,
];
