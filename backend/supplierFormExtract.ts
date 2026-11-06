// A SUPPLIER'S FILLED-IN REGISTRATION FORM, READ INTO F/PUR/01 (REQUIREMENTS §191; the owner, 6-Nov-2026: "in pur-01 give
// upload document option so in that when user upload the pdf then system will fetch data from it and fill the pur-01 from
// it"). The supplier sends the form back filled in - as a PDF with text, a Word (.docx) file or plain text, up to 5 MB.
// Its text is taken as a CV's is (cvExtract.ts: unpdf for a PDF, the .docx's XML, the text itself), then read by rules
// that know the paper's own labels, in the order the paper prints them: what follows a label on its line, and on the lines
// under it until the next label, is that box's value - an address or a list of products running over several lines, a
// one-line box's value on the line below when the supplier wrote it there. The paper's notes ("Please attach a separate
// sheet if required") are dropped; the office's own block (INTERNAL OFFICE USE ONLY) and the paper's instructions are never
// read as the supplier's words. The form prints DESIGNATION twice (the contact's, and the person who furnished the
// information): the first is the contact's, and NAME / DESIGNATION / DATE / PLACE after the certification question are
// the furnisher's. A choice box takes the paper's own choices (TYPE OF CONCERN from "Pvt. Ltd.", COMPANY ACTIVITIES from
// "Manufacturer of..."), the certification question Yes or No, the date a date. When Groq is configured the assistant then
// fills only what the rules could not, told to return nothing the form doesn't state; anything it returns that is not in
// the form's own text is dropped. Nothing is stored here - the answer goes back to the record, whose blank boxes it fills.

import { aiChatJSON } from "./ai.ts";
import { CvReadError, cvText, parseCvDate, type CvFileKind } from "./cvExtract.ts";

export const SUPPLIER_FORM_KEYS = [
  "supplierName",
  "typeOfConcern",
  "addressOffice",
  "addressWorks",
  "contactPerson",
  "contactDesignation",
  "telephoneNos",
  "emailAddress",
  "weeklyOffWorkingHours",
  "companyActivities",
  "employeesTechnical",
  "employeesNonTechnical",
  "yearOfCommencement",
  "rangeOfProducts",
  "majorCustomers",
  "plantMachinery",
  "qualityControlDept",
  "holdsCertification",
  "furnishedName",
  "furnishedDesignation",
  "furnishedDate",
  "furnishedPlace",
] as const;
export type SupplierFormKey = (typeof SUPPLIER_FORM_KEYS)[number];
export type SupplierFormFields = Partial<Record<SupplierFormKey, string>>;

export interface SupplierFormReadResult {
  fields: SupplierFormFields;
  fileKind: CvFileKind;
  readBy: "assistant" | "rules";
  /** The boxes the file did not give, by the paper's label. */
  missing: string[];
  characters: number;
}

export const SUPPLIER_FORM_MAX_BYTES = 5 * 1024 * 1024;
const ASSISTANT_TEXT = 12000;

const TYPES_OF_CONCERN = ["Proprietary", "Partnership", "Private Limited", "Limited"];
const ACTIVITIES = ["Trading", "Manufacturing", "Services"];

/** The paper's label for each box, for the "not found" list. */
export const SUPPLIER_FORM_LABELS: Record<SupplierFormKey, string> = {
  supplierName: "SUPPLIER'S NAME",
  typeOfConcern: "TYPE OF CONCERN",
  addressOffice: "ADDRESS (OFFICE)",
  addressWorks: "ADDRESS (WORKS)",
  contactPerson: "CONTACT PERSON",
  contactDesignation: "DESIGNATION",
  telephoneNos: "TELEPHONE NOS",
  emailAddress: "E-MAIL ADDRESS",
  weeklyOffWorkingHours: "WEEKLY OFF / WORKING HOURS",
  companyActivities: "COMPANY ACTIVITIES",
  employeesTechnical: "NO. OF EMPLOYEES : Technical",
  employeesNonTechnical: "NO. OF EMPLOYEES : Non-Technical",
  yearOfCommencement: "YEAR OF COMMENCEMENT",
  rangeOfProducts: "RANGE OF PRODUCTS / SERVICES OFFERED",
  majorCustomers: "LIST OF MAJOR CUSTOMERS",
  plantMachinery: "PARTICULARS OF PLANT MACHINERY & OTHER INFRASTRUCTURE",
  qualityControlDept: "DETAILS OF QUALITY CONTROL DEPARTMENT",
  holdsCertification: "ISO 9001 / ISO 22000 / HACCP / FSSC / BRCGS CERTIFICATION",
  furnishedName: "INFORMATION FURNISHED BY — NAME",
  furnishedDesignation: "INFORMATION FURNISHED BY — DESIGNATION",
  furnishedDate: "INFORMATION FURNISHED BY — DATE",
  furnishedPlace: "INFORMATION FURNISHED BY — PLACE",
};

// ---------------------------------------------------------------------------
// the text → the boxes, by the paper's labels

type LabelKey = SupplierFormKey | "employees" | "designation" | "name" | "date" | "place" | "furnished" | "stop";
interface Label {
  key: LabelKey;
  re: RegExp;
  /** A prose box: every line under the label is its, until the next label. */
  block?: boolean;
}

// Matched at the start of a line (a number, bullet or dash before it ignored), in this order: the first that matches wins.
const LABELS: Label[] = [
  { key: "supplierName", re: /^supplier['’`]?\s*s?\s*name\b/i },
  { key: "typeOfConcern", re: /^type\s*of\s*(?:concern|company|firm|organi[sz]ation)\b/i },
  { key: "addressOffice", re: /^(?:address\s*\(?\s*office\s*\)?|office\s*address|registered\s*(?:office\s*)?address)/i, block: true },
  { key: "addressWorks", re: /^(?:address\s*\(?\s*(?:works?|factory|plant)\s*\)?|(?:works?|factory|plant)\s*address)/i, block: true },
  { key: "contactPerson", re: /^contact\s*person\b/i },
  { key: "designation", re: /^designation\b/i },
  { key: "telephoneNos", re: /^(?:telephone|phone|tel\.?|mobile|contact)\s*(?:nos?\.?|numbers?|no\.?)?(?=\s*[:：\-–]|\s*$|\s+\+?\d)/i },
  { key: "emailAddress", re: /^e-?\s*mail(?:\s*(?:address|id))?\b/i },
  { key: "weeklyOffWorkingHours", re: /^weekly\s*off(?:\s*\/?\s*working\s*hours)?\b/i },
  { key: "companyActivities", re: /^company\s*activit(?:y|ies)\b/i },
  { key: "employees", re: /^(?:no\.?|number)\s*of\s*employees\b/i },
  { key: "yearOfCommencement", re: /^year\s*of\s*(?:commencement|establishment|incorporation)\b/i },
  { key: "rangeOfProducts", re: /^range\s*of\s*products(?:\s*\/?\s*services)?(?:\s*offered)?\b/i, block: true },
  { key: "majorCustomers", re: /^(?:list\s*of\s*)?major\s*customers\b/i, block: true },
  { key: "plantMachinery", re: /^particulars\s*of\s*plant(?:\s*machinery)?(?:\s*&\s*other\s*infrastructure)?\b/i, block: true },
  { key: "qualityControlDept", re: /^details\s*of\s*quality\s*control(?:\s*dep(?:artmen)?t\.?)?\b/i, block: true },
  { key: "holdsCertification", re: /^do\s*you\s*hold\b[^:]*(?:certification\s*:?|:)?/i },
  { key: "furnished", re: /^information\s*furnished\s*by\b/i },
  { key: "name", re: /^name\b/i },
  { key: "date", re: /^date\b/i },
  { key: "place", re: /^place\b/i },
  // The paper's own lines and the office's block: nothing of the supplier's is read under them.
  {
    key: "stop",
    re: /^(?:signature\s*with|please\s*provide\s*following|internal\s*office|status\s*of\s*supplier|if\s*new\s*supplier|products?\s*\/\s*services\s*for\s*which|assessment\s*status|signature\s*&|general\s*details|gujarat\s*print\s*pack|supplier\s*registration\s*form|format\s*no\.?\s*[-–:]|page\s*\d+\s*of\s*\d+|\d+\.\s*(?:technical\s*data\s*sheet|msds|food\s*grade\s*declaration|traceability\s*protocol|copy\s*of\s*management))/i,
  },
];

/** The paper's notes beside a label, never a value. */
const NOTES = /\((?:please\s*)?attach[^)]*\)|\(provide\s*details[^)]*\)|\(not\s*applicable[^)]*\)|\(please\s*attach[^)]*\)/gi;
const LEAD = /^[\s\-–•*·]*(?:\(?\d{1,2}[.)]\s*)?/;
const SEP = /^[\s:：\-–]+/;

function labelOf(line: string): { label: Label; rest: string } | null {
  const clean = line.replace(LEAD, "");
  for (const label of LABELS) {
    const m = label.re.exec(clean);
    if (!m) continue;
    const rest = clean.slice(m[0].length).replace(NOTES, "").replace(SEP, "").trim();
    return { label, rest };
  }
  return null;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function typeOfConcern(raw: string, supplierName = ""): string {
  const t = `${raw} ${raw ? "" : supplierName}`.toLowerCase();
  if (/\b(?:pvt|private)\b/.test(t) || /\(p\)\s*ltd/.test(t)) return "Private Limited";
  if (/\bllp\b|partnership|partners?\b/.test(t)) return "Partnership";
  if (/proprietor|proprietary|sole\b/.test(t)) return "Proprietary";
  if (/\b(?:ltd|limited)\b/.test(t)) return "Limited";
  return TYPES_OF_CONCERN.find((o) => o.toLowerCase() === raw.trim().toLowerCase()) ?? "";
}

function activity(raw: string): string {
  const t = raw.toLowerCase();
  if (/manufactur|producer|maker|mill|press|printer/.test(t)) return "Manufacturing";
  if (/trad|dealer|distribut|stockist|supplier|wholesal|import/.test(t)) return "Trading";
  if (/service|contractor|agency|laborator|calibration|transport|pest/.test(t)) return "Services";
  return ACTIVITIES.find((o) => o.toLowerCase() === raw.trim().toLowerCase()) ?? "";
}

function yesNo(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return "";
  if (/^(?:no\b|n\b|nil|none|not\b|-)/.test(t)) return "No";
  if (/^(?:yes\b|y\b|iso|fssc|brc|haccp|certified|holding|have)/.test(t) || /\biso\s*\d|fssc|brcgs?|haccp/.test(t)) return "Yes";
  return "";
}

function employees(raw: string): { technical: string; nonTechnical: string } {
  const t = raw.replace(/[,]/g, "");
  const non = /non[\s-]*technical\s*[:\-–]?\s*(\d+)/i.exec(t);
  const tech = /(?<!non[\s-]*)technical\s*[:\-–]?\s*(\d+)/i.exec(t);
  if (tech || non) return { technical: tech?.[1] ?? "", nonTechnical: non?.[1] ?? "" };
  const figures = t.match(/\d+/g) ?? [];
  return { technical: figures[0] ?? "", nonTechnical: figures[1] ?? "" };
}

function phone(raw: string): string {
  const t = oneLine(raw);
  return /\d{6,}/.test(t.replace(/[\s\-()]/g, "")) ? t : "";
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** The boxes the form's text gives, by the paper's labels. */
export function readSupplierFormByRules(text: string): SupplierFormFields {
  const out: SupplierFormFields = {};
  const raw: Partial<Record<LabelKey, string[]>> = {};
  let current: { key: LabelKey; block: boolean } | null = null;
  let afterCertification = false;
  let furnished = false;
  for (const line of text.split("\n")) {
    const found = labelOf(line);
    if (found) {
      const { label, rest } = found;
      let key: LabelKey = label.key;
      if (key === "stop") {
        current = null;
        continue;
      }
      if (key === "furnished") {
        furnished = true;
        current = null;
        continue;
      }
      const atFoot = furnished || afterCertification;
      if (key === "designation") key = atFoot ? "furnishedDesignation" : "contactDesignation";
      else if (key === "name") key = atFoot ? "furnishedName" : "stop";
      else if (key === "date") key = atFoot ? "furnishedDate" : "stop";
      else if (key === "place") key = atFoot ? "furnishedPlace" : "stop";
      if (key === "stop") {
        current = null;
        continue;
      }
      if (key === "holdsCertification") afterCertification = true;
      (raw[key] ??= []).push(rest);
      current = { key, block: !!label.block };
      continue;
    }
    if (!current) continue;
    const lines = raw[current.key]!;
    // A prose box takes every line under its label; a one-line box the line below, when its own line was left empty.
    if (current.block || (lines.length === 1 && !lines[0].trim()) || (lines.length <= 2 && !lines.slice(0, -1).some(Boolean) && lines.length < 2)) lines.push(line);
    else if (!lines.some((l) => l.trim())) lines.push(line);
  }
  const joined = (key: LabelKey, sep = " "): string =>
    (raw[key] ?? [])
      .map((l) => l.trim())
      .filter(Boolean)
      .join(sep)
      .trim();

  const put = (key: SupplierFormKey, value: string) => {
    if (value) out[key] = value;
  };
  put("supplierName", oneLine(joined("supplierName")));
  put("typeOfConcern", typeOfConcern(joined("typeOfConcern"), out.supplierName));
  put("addressOffice", joined("addressOffice", "\n"));
  put("addressWorks", joined("addressWorks", "\n"));
  put("contactPerson", oneLine(joined("contactPerson")));
  put("contactDesignation", oneLine(joined("contactDesignation")));
  put("telephoneNos", phone(joined("telephoneNos")));
  put("emailAddress", EMAIL.exec(joined("emailAddress"))?.[0] ?? EMAIL.exec(text)?.[0] ?? "");
  put("weeklyOffWorkingHours", oneLine(joined("weeklyOffWorkingHours")));
  put("companyActivities", activity(joined("companyActivities")));
  const staff = employees(joined("employees"));
  put("employeesTechnical", staff.technical);
  put("employeesNonTechnical", staff.nonTechnical);
  put("yearOfCommencement", /\b(?:18|19|20)\d{2}\b/.exec(joined("yearOfCommencement"))?.[0] ?? "");
  put("rangeOfProducts", joined("rangeOfProducts", "\n"));
  put("majorCustomers", joined("majorCustomers", "\n"));
  put("plantMachinery", joined("plantMachinery", "\n"));
  put("qualityControlDept", joined("qualityControlDept", "\n"));
  put("holdsCertification", yesNo(joined("holdsCertification")));
  put("furnishedName", oneLine(joined("furnishedName")));
  put("furnishedDesignation", oneLine(joined("furnishedDesignation")));
  put("furnishedDate", parseCvDate(oneLine(joined("furnishedDate"))));
  put("furnishedPlace", oneLine(joined("furnishedPlace")));
  return out;
}

// ---------------------------------------------------------------------------
// the assistant, for what the rules could not find

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A value the form itself states: short values whole; a block when most of its words are the form's. */
function statedIn(text: string, value: unknown, block = false): string {
  if (typeof value !== "string") return "";
  const v = value.replace(/\s+/g, " ").trim();
  if (!v || v.length > (block ? 600 : 160)) return "";
  const haystack = squash(text);
  if (haystack.includes(squash(v))) return v;
  if (!block) return "";
  const words = v.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  if (words.length < 3) return "";
  const stated = words.filter((w) => haystack.includes(w)).length;
  return stated / words.length >= 0.7 ? v : "";
}

async function readSupplierFormWithAssistant(text: string): Promise<SupplierFormFields> {
  const system = [
    "You read one supplier's filled-in SUPPLIER REGISTRATION FORM (format F/PUR/01) for a purchase department and return ONLY the facts the form itself states, as a JSON object with exactly these keys:",
    '{ "supplierName": string|null, "typeOfConcern": "Proprietary"|"Partnership"|"Private Limited"|"Limited"|null, "addressOffice": string|null, "addressWorks": string|null,',
    '  "contactPerson": string|null, "contactDesignation": string|null, "telephoneNos": string|null, "emailAddress": string|null, "weeklyOffWorkingHours": string|null,',
    '  "companyActivities": "Trading"|"Manufacturing"|"Services"|null, "employeesTechnical": number|null, "employeesNonTechnical": number|null, "yearOfCommencement": string|null,',
    '  "rangeOfProducts": string|null, "majorCustomers": string|null, "plantMachinery": string|null, "qualityControlDept": string|null, "holdsCertification": "Yes"|"No"|null,',
    '  "furnishedName": string|null, "furnishedDesignation": string|null, "furnishedDate": "YYYY-MM-DD"|null, "furnishedPlace": string|null }',
    "Rules: never guess and never infer - null when the form does not say it. Copy names, addresses and lists exactly as written.",
    "contactDesignation is the contact person's designation; furnishedName / furnishedDesignation / furnishedDate / furnishedPlace are from the INFORMATION FURNISHED BY block at the end. Dates on Indian forms are day first.",
    "The INTERNAL OFFICE USE ONLY block (status of supplier, assessment, approved products, authorised person) is the office's own: never read it.",
  ].join("\n");
  const raw = (await aiChatJSON({ system, user: text.slice(0, ASSISTANT_TEXT), temperature: 0 })) as Record<string, unknown>;
  const out: SupplierFormFields = {};
  const take = (key: SupplierFormKey, value: string) => {
    if (value) out[key] = value;
  };
  for (const key of ["supplierName", "contactPerson", "contactDesignation", "weeklyOffWorkingHours", "furnishedName", "furnishedDesignation", "furnishedPlace"] as const) take(key, statedIn(text, raw[key]));
  for (const key of ["addressOffice", "addressWorks", "rangeOfProducts", "majorCustomers", "plantMachinery", "qualityControlDept"] as const) take(key, statedIn(text, raw[key], true));
  take("typeOfConcern", typeof raw.typeOfConcern === "string" ? typeOfConcern(raw.typeOfConcern) : "");
  take("companyActivities", typeof raw.companyActivities === "string" ? activity(raw.companyActivities) : "");
  take("holdsCertification", raw.holdsCertification === "Yes" || raw.holdsCertification === "No" ? raw.holdsCertification : "");
  for (const key of ["employeesTechnical", "employeesNonTechnical"] as const) {
    const n = typeof raw[key] === "number" ? raw[key] : Number(raw[key]);
    if (Number.isInteger(n) && n >= 0 && n < 100000 && text.includes(String(n))) take(key, String(n));
  }
  const year = typeof raw.yearOfCommencement === "string" || typeof raw.yearOfCommencement === "number" ? /\b(?:18|19|20)\d{2}\b/.exec(String(raw.yearOfCommencement))?.[0] ?? "" : "";
  if (year && text.includes(year)) take("yearOfCommencement", year);
  const digits = typeof raw.telephoneNos === "string" ? raw.telephoneNos.replace(/\D/g, "") : "";
  if (digits.length >= 6 && text.replace(/\D/g, "").includes(digits.slice(-8))) take("telephoneNos", oneLine(String(raw.telephoneNos)));
  const mail = typeof raw.emailAddress === "string" ? EMAIL.exec(raw.emailAddress)?.[0] ?? "" : "";
  if (mail && squash(text).includes(mail.toLowerCase())) take("emailAddress", mail);
  take("furnishedDate", typeof raw.furnishedDate === "string" ? parseCvDate(raw.furnishedDate) : "");
  return out;
}

// ---------------------------------------------------------------------------

/** The CV reader's words about a file, said of the form instead. */
const aboutTheForm = (message: string): string =>
  message.replace(/\bthe CV\b/g, "the form").replace(/\bthis CV\b/g, "this form").replace(/\bas a CV\b/g, "as a supplier's form").replace(/\bCV file\b/g, "file");

export async function readSupplierForm(buf: Buffer, fileName: string, opts: { useAssistant: boolean }): Promise<SupplierFormReadResult> {
  if (buf.length > SUPPLIER_FORM_MAX_BYTES) throw new CvReadError("The file is larger than 5 MB.");
  let text: string;
  let fileKind: CvFileKind;
  try {
    ({ text, fileKind } = await cvText(buf, fileName));
  } catch (err) {
    if (err instanceof CvReadError) throw new CvReadError(aboutTheForm(err.message));
    throw err;
  }
  const fields: SupplierFormFields = readSupplierFormByRules(text);
  let readBy: SupplierFormReadResult["readBy"] = "rules";
  if (opts.useAssistant) {
    try {
      const a = await readSupplierFormWithAssistant(text);
      readBy = "assistant";
      for (const key of SUPPLIER_FORM_KEYS) if (!fields[key] && a[key]) fields[key] = a[key];
    } catch (err) {
      // The rules have already read the form; an assistant outage only means fewer gaps get filled.
      console.error("Supplier form read: assistant unavailable —", err instanceof Error ? err.message : err);
    }
  }
  const missing = SUPPLIER_FORM_KEYS.filter((k) => !fields[k]).map((k) => SUPPLIER_FORM_LABELS[k]);
  return { fields, fileKind, readBy, missing, characters: text.length };
}
