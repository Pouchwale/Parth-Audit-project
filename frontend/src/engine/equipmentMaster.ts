import type { LogSheetData, LogSheetRow, RecordInstance } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { isDocumentIdVisible } from "./departmentScope";
import { applyFills, type FieldFill } from "./hrMaster";

// THE EQUIPMENT MASTER — F/MNT/01, THE LIST THE MAINTENANCE FORMATS FETCH A
// MACHINE FROM (REQUIREMENTS §74, modelled on HR Master Data in §53).
//
// Maintenance already keeps one list of its machines: F/MNT/01, "List of
// Equipments & Utilities", eleven columns from Machine No. to Serial No. So the
// list IS the master. It is an ordinary log-sheet document with one live,
// Verified record, and everything here reads that record's lines. There is no
// second copy to drift from it, no storage key of its own, and nothing new to
// sync: the record reaches PostgreSQL the way every record does, and it is
// kept to Maintenance by the department scope every record already has
// (REQUIREMENTS §40). That is also why the list is only ever read through the
// SCOPED recordRepository.query. The seed is merged into every browser at
// start-up, whatever the account, so an unscoped read would let a QC
// account's Mitra describe M-47.
//
// A MACHINE IS ITS NUMBER. The list gives the same model to more than one
// machine ("Brison 370" is M-13 and M-14; "UltraFlex Video Plate Mounter" is
// M-02, M-48 and M-84), and it writes "NA" or "-" where nobody knew the value.
// So a machine is found by its Machine No., or by a Serial No. that only one
// machine has and that is not a placeholder, and NEVER by its model name
// alone. A name can suggest a machine for someone to choose, but it never
// picks one.
//
// A fetch COPIES, as HR's does. A maintenance record keeps what was fetched even
// if the list changes later, as the paper would. Blank boxes are filled
// straight away, and a box already holding something different is replaced
// only when the person says so.

export const EQUIPMENT_LIST_DOC_ID = "mnt-equipment-list";
export const EQUIPMENT_LIST_FORMAT_NO = "F/MNT/01";
export const EQUIPMENT_LIST_NAME = "List of Equipments & Utilities";
export const EQUIPMENT_LIST_ROUTE = `/document/${EQUIPMENT_LIST_DOC_ID}`;

/** One line of F/MNT/01, as written. `department` is the list's own column: a plant SECTION (Flexo, Common), never a system department. */
export interface Machine {
  rowId: string;
  machineNo: string;
  department: string;
  location: string;
  manufacturer: string;
  model: string;
  description: string;
  countryOfOrigin: string;
  size: string;
  month: string;
  year: string;
  serialNo: string;
}

export type MachineColumnKey = keyof Omit<Machine, "rowId">;

/** The columns in the order F/MNT/01 prints them, with its own headings. */
export const MACHINE_COLUMNS: { key: MachineColumnKey; label: string }[] = [
  { key: "machineNo", label: "Machine No." },
  { key: "department", label: "Department" },
  { key: "location", label: "Location / Room" },
  { key: "manufacturer", label: "Machine Manufacturer Name" },
  { key: "model", label: "Machine Name / Model No." },
  { key: "description", label: "Machine Description" },
  { key: "countryOfOrigin", label: "Country of Origin" },
  { key: "size", label: "Machine Size / Capacity" },
  { key: "month", label: "Month of manufacture" },
  { key: "year", label: "Year of Manufacture" },
  { key: "serialNo", label: "Serial No." },
];

const COLUMN_KEYS = MACHINE_COLUMNS.map((c) => c.key);

// ---------------------------------------------------------------------------
// numbers, placeholders and words

const pad2 = (n: number) => String(n).padStart(2, "0");

// "M-47", "m47", "M 47", "M-047", "M.47", "Machine No. M-47", "machine no. 47".
const WHOLE_M = /^\s*(?:machine\s*(?:no\.?|number|#)?\s*[:#.-]?\s*)?m\s*[-.]?\s*0*(\d{1,3})\s*$/i;
const WHOLE_MACHINE_NO = /^\s*machine\s*(?:no\.?|number|#)?\s*[:#.-]?\s*0*(\d{1,3})\s*$/i;

/** A Machine No. as compared: "m47", "M 47", "M-047", "machine no. 47" are all "M-47". "" when the value is not a machine number. */
export function machineKey(value: unknown): string {
  const s = String(value ?? "");
  const m = WHOLE_M.exec(s) ?? WHOLE_MACHINE_NO.exec(s);
  return m ? `M-${pad2(Number(m[1]))}` : "";
}

export const sameMachineNo = (a: unknown, b: unknown): boolean => {
  const key = machineKey(a);
  return !!key && key === machineKey(b);
};

// A box that exists only to hold the machine's number ("Machine No. :",
// "Machine Identification No", "EQUIPMENT ID NO.") means M-47 when someone
// types "47" in it. Anywhere else a bare number means nothing in particular.
function idBoxKey(value: unknown): string {
  const key = machineKey(value);
  if (key) return key;
  const m = /^\s*0*(\d{1,3})\s*$/.exec(String(value ?? ""));
  return m ? `M-${pad2(Number(m[1]))}` : "";
}

// Every machine number written anywhere in a piece of text, in order. The
// letter must stand on its own, so "330 mm", "PM 10", "F/MNT/01" and a serial
// such as "1435461-M" are not machine numbers.
const TOKEN_M = /(?:^|[^\p{L}\p{N}])m\s*[-.]?\s*0*(\d{1,3})(?!\d)/giu;
const TOKEN_MACHINE_NO = /\bmachine\s*(?:no\.?|number|#)?\s*[:#.-]?\s*0*(\d{1,3})(?!\d)/gi;

/** The machine numbers a piece of text names ("which machine is M-47?", "Lombardi / Delta 330 / M-47"), as keys. */
export function machineNumbersIn(text: unknown): string[] {
  const s = String(text ?? "");
  const out: string[] = [];
  for (const re of [TOKEN_M, TOKEN_MACHINE_NO]) {
    re.lastIndex = 0;
    for (const m of s.matchAll(re)) {
      const key = `M-${pad2(Number(m[1]))}`;
      if (!out.includes(key)) out.push(key);
    }
  }
  return out;
}

/** The text with every machine number taken out, to see what else a message says around one. */
export function withoutMachineNumbers(text: unknown): string {
  return String(text ?? "")
    .replace(new RegExp(TOKEN_M.source, "giu"), " ")
    .replace(new RegExp(TOKEN_MACHINE_NO.source, "gi"), " ");
}

const PLACEHOLDER = /^(?:|na|n\/a|n\.a\.?|nil|none|-+|–|—)$/i;

/** "NA", "-", "" and their kin: the list's way of saying nobody knew. Never a value to match on or to copy. */
export const isPlaceholder = (value: unknown): boolean => PLACEHOLDER.test(String(value ?? "").trim());

/** A value as copied onto a record: "" for a placeholder. */
const usable = (value: unknown): string => (isPlaceholder(value) ? "" : String(value ?? "").trim());

/** Words as compared: no case, no punctuation. */
const textKey = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const serialKey = (value: unknown): string => (isPlaceholder(value) ? "" : String(value ?? "").trim().replace(/\s+/g, "").toUpperCase());

// ---------------------------------------------------------------------------
// the line F/MNT/01 prints one column out of step

const MONTH_WORD = /^(?:jan(?:uary)?|feb(?:ruary|raury)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?$/i;

/**
 * Whether a line reads one column to the right of where it belongs. F/MNT/01
 * prints M-68 that way on the paper itself: no manufacturer, "DCM Usimeca" under
 * Model, a model number under Description, "France" under Size, "December"
 * under Year and "2023" under Serial No. The line is transcribed as printed
 * and stays that way until Maintenance confirms it. The test is the shape, not
 * the number, so a corrected line stops matching by itself.
 */
export function readsOutOfStep(m: Machine): boolean {
  return !m.manufacturer.trim() && MONTH_WORD.test(m.year.trim()) && /^(?:19|20)\d{2}$/.test(m.serialNo.trim()) && !!m.size.trim() && !/\d/.test(m.size);
}

const asRead = new WeakMap<Machine, Machine>();

/**
 * The line as it reads once put back in step, and the line itself otherwise.
 * This is what a fetch copies and what finds a machine by serial. Copying the
 * printed M-68 onto F/MNT/04 would give "1102-31203-SL3" as its description,
 * and its "serial" 2023 would match a search for the year.
 */
export function machineAsRead(m: Machine): Machine {
  if (!readsOutOfStep(m)) return m;
  let read = asRead.get(m);
  if (!read) {
    read = {
      ...m,
      manufacturer: m.model,
      model: m.description,
      description: m.countryOfOrigin,
      countryOfOrigin: m.size,
      size: m.month,
      month: m.year,
      year: m.serialNo,
      serialNo: "",
    };
    asRead.set(m, read);
  }
  return read;
}

/** Said wherever such a line is used: what was done with it, and that it is still to be confirmed. */
export function outOfStepNote(m: Machine): string {
  if (!readsOutOfStep(m)) return "";
  return ` F/MNT/01 prints ${m.machineNo}'s line one column out of step, so it was read one column to the left. Confirm these details against the machine's own plate.`;
}

// ---------------------------------------------------------------------------
// the list itself

/**
 * The F/MNT/01 record the machines are read from. It is the latest Verified live
 * record, or, if none is Verified yet (the list reopened for a correction, say),
 * the latest one written to. Demo records never count: the list is the same in
 * both modes, as HR Master Data is. It is read through the SCOPED query, so an
 * account outside Maintenance has no list at all.
 */
export function currentEquipmentList(): RecordInstance<LogSheetData> | undefined {
  const records = recordRepository.query({ documentId: EQUIPMENT_LIST_DOC_ID, isDemo: false });
  if (records.length === 0) return undefined;
  const verified = records.filter((r) => r.status === "Verified");
  const pool = verified.length > 0 ? verified : records;
  let best = pool[0];
  for (const r of pool) if (r.updatedAt > best.updatedAt || (r.updatedAt === best.updatedAt && r.dueDate > best.dueDate)) best = r;
  return best as RecordInstance<LogSheetData>;
}

function machineOf(row: LogSheetRow): Machine {
  const m = { rowId: String(row.id ?? "") } as Machine;
  for (const key of COLUMN_KEYS) m[key] = String(row[key] ?? "").trim();
  return m;
}

const NONE: Machine[] = [];
let memo: { key: string; machines: Machine[] } | null = null;

/** Every line of the current list, in its order. Built once per version of the record (its id and when it was last written). */
export function allMachines(): Machine[] {
  const record = currentEquipmentList();
  if (!record) return NONE;
  const key = `${record.id}|${record.updatedAt}`;
  if (!memo || memo.key !== key) {
    const rows = record.data?.rows ?? [];
    memo = { key, machines: rows.map(machineOf).filter((m) => COLUMN_KEYS.some((k) => m[k])) };
  }
  return memo.machines;
}

/** May this account see F/MNT/01? It is Maintenance's list (REQUIREMENTS §40). */
export const equipmentMasterVisible = (): boolean => isDocumentIdVisible(EQUIPMENT_LIST_DOC_ID, EQUIPMENT_LIST_FORMAT_NO);

// Looked up by number and by serial through an index built once per list.
const indexes = new WeakMap<Machine[], { byNo: Map<string, Machine>; bySerial: Map<string, Machine[]> }>();
function indexOf(machines: Machine[]) {
  let index = indexes.get(machines);
  if (!index) {
    const byNo = new Map<string, Machine>();
    const bySerial = new Map<string, Machine[]>();
    for (const m of machines) {
      const no = machineKey(m.machineNo);
      if (no && !byNo.has(no)) byNo.set(no, m);
      const serial = serialKey(machineAsRead(m).serialNo);
      if (serial) bySerial.set(serial, [...(bySerial.get(serial) ?? []), m]);
    }
    index = { byNo, bySerial };
    indexes.set(machines, index);
  }
  return index;
}

/** The machine with this Machine No., however it is written. */
export function machineByNumber(value: unknown, machines: Machine[] = allMachines()): Machine | null {
  const key = machineKey(value);
  return key ? indexOf(machines).byNo.get(key) ?? null : null;
}

/** Every machine with this Serial No. ("Serial No. 88562" or "88562"). None for a placeholder: "NA" is not a serial. */
export function machinesWithSerial(value: unknown, machines: Machine[] = allMachines()): Machine[] {
  const key = serialKey(String(value ?? "").replace(/^\s*serial\s*(?:no\.?|number|#)?\s*[:#.-]?\s*/i, ""));
  return (key ? indexOf(machines).bySerial.get(key) : undefined) ?? [];
}

/** The one machine with this Serial No. It is null for a placeholder, or for a serial the list gives to several machines. */
function machineBySerial(value: unknown, machines: Machine[]): Machine | null {
  const found = machinesWithSerial(value, machines);
  return found.length === 1 ? found[0] : null;
}

/**
 * The one machine a piece of text names. A machine number anywhere in it names
 * that machine: "M-47", or "Lombardi / Delta 330 / M-47", where F/MNT/02 Rev 00
 * writes make, model and number in one box. It is null when that number is not
 * on the list, or when the text names several. Failing a number, the whole
 * text as a Serial No. that one machine has and that is not a placeholder.
 * NEVER a model name alone.
 */
export function machineNamed(value: unknown, machines: Machine[] = allMachines()): Machine | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const numbers = machineNumbersIn(s);
  if (numbers.length > 0) return numbers.length === 1 ? machineByNumber(numbers[0], machines) : null;
  return machineBySerial(s, machines);
}

/** What a box made to hold the machine's number names. A bare "47" there means M-47. */
function machineInIdBox(value: unknown, machines: Machine[]): Machine | null {
  const key = idBoxKey(value);
  return key ? machineByNumber(key, machines) : machineNamed(value, machines);
}

export interface MachineSearch {
  /** The one machine the words name without doubt: its Machine No., or a serial only it has. */
  exact: Machine | null;
  /** Every machine they could mean (the exact one included). */
  candidates: Machine[];
}

const QUIET_WORDS = new Set(["the", "a", "an", "of", "machine", "machines", "no", "number", "equipment"]);

const queryTokens = (q: string): string[] => {
  const all = textKey(q).split(" ").filter(Boolean);
  const kept = all.filter((w) => !QUIET_WORDS.has(w));
  return kept.length > 0 ? kept : all;
};

const nameWords = new WeakMap<Machine, string[]>();
const placeWords = new WeakMap<Machine, string[]>();
function wordsOf(m: Machine, cache: WeakMap<Machine, string[]>, keys: MachineColumnKey[]): string[] {
  let words = cache.get(m);
  if (!words) {
    const read = machineAsRead(m);
    words = textKey(keys.map((k) => usable(read[k])).join(" ")).split(" ").filter(Boolean);
    cache.set(m, words);
  }
  return words;
}
const covers = (tokens: string[], words: string[]) => tokens.every((t) => words.some((w) => w.startsWith(t)));

/** Machines whose name, model, description or maker holds every word of the query. Never the location, and never enough to pick one. */
export function machinesByName(query: unknown, machines: Machine[] = allMachines(), limit = 8): Machine[] {
  const tokens = queryTokens(String(query ?? ""));
  if (tokens.length === 0) return [];
  return machines.filter((m) => covers(tokens, wordsOf(m, nameWords, ["model", "description", "manufacturer"]))).slice(0, limit);
}

/**
 * Machines for what someone typed. A machine number names exactly that machine
 * ("M-47", or a bare "47"). A serial that only one machine has does the same.
 * Anything else is words, matched against model, description, maker, location
 * and serial, and gives candidates to choose from, never an exact match: the
 * list repeats its model names.
 */
export function searchMachines(query: unknown, machines: Machine[] = allMachines(), limit = 8): MachineSearch {
  const q = String(query ?? "").trim();
  if (!q) return { exact: null, candidates: [] };
  const index = indexOf(machines);

  const numbers = machineNumbersIn(q);
  if (numbers.length > 0) {
    const found = numbers.map((n) => index.byNo.get(n)).filter((m): m is Machine => !!m);
    return { exact: numbers.length === 1 && found.length === 1 ? found[0] : null, candidates: found.slice(0, limit) };
  }

  // A bare number is the machine of that number. A serial that happens to be
  // the same digits is offered too, but it is not taken without asking.
  if (/^0*\d{1,3}$/.test(q)) {
    const byNo = index.byNo.get(idBoxKey(q)) ?? null;
    const bySerial = index.bySerial.get(serialKey(q)) ?? [];
    const candidates = [...(byNo ? [byNo] : []), ...bySerial.filter((m) => m !== byNo)];
    return { exact: byNo, candidates: candidates.slice(0, limit) };
  }

  const serial = index.bySerial.get(serialKey(q.replace(/^\s*serial\s*(?:no\.?|number|#)?\s*[:#.-]?\s*/i, "")));
  if (serial && serial.length > 0) return { exact: serial.length === 1 ? serial[0] : null, candidates: serial.slice(0, limit) };

  const tokens = queryTokens(q);
  if (tokens.length === 0) return { exact: null, candidates: [] };
  // What the machine IS comes before where it stands: "Brison" should list the
  // Brison machines before a machine that only happens to stand near one.
  const byName: Machine[] = [];
  const byPlace: Machine[] = [];
  for (const m of machines) {
    if (covers(tokens, wordsOf(m, nameWords, ["model", "description", "manufacturer"]))) byName.push(m);
    else if (covers(tokens, wordsOf(m, placeWords, ["model", "description", "manufacturer", "location", "serialNo"]))) byPlace.push(m);
  }
  return { exact: null, candidates: [...byName, ...byPlace].slice(0, limit) };
}

/** "M-47 · UV Flexo Printing Machine · Delta 330 · Lombardi Printing": number, what it is, model, where it stands. Placeholders left out. */
export function describeMachine(m: Machine): string {
  const read = machineAsRead(m);
  const parts: string[] = [];
  for (const v of [read.machineNo || "(no Machine No.)", read.description, read.model, read.location].map(usable)) {
    if (v && !parts.some((p) => p.toLowerCase() === v.toLowerCase())) parts.push(v);
  }
  return parts.join(" · ");
}

/** The machine numbers the list skips: "M-05", "M-16 to M-17", … Its numbering has gaps, so the highest number is not the count. */
export function numberingGaps(machines: Machine[] = allMachines()): string[] {
  const numbers = new Set<number>();
  for (const m of machines) {
    const key = machineKey(m.machineNo);
    if (key) numbers.add(Number(key.slice(2)));
  }
  if (numbers.size === 0) return [];
  const max = Math.max(...numbers);
  const gaps: string[] = [];
  let start = 0;
  for (let n = 1; n <= max + 1; n++) {
    const missing = n <= max && !numbers.has(n);
    if (missing && start === 0) start = n;
    if (!missing && start !== 0) {
      gaps.push(start === n - 1 ? `M-${pad2(start)}` : `M-${pad2(start)} to M-${pad2(n - 1)}`);
      start = 0;
    }
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// which box of which format takes which column

export interface EquipmentLink {
  docId: string;
  formatNo: string;
  /** One machine per record, in the header, or one machine per line of a register. */
  where: "header" | "rows";
  /** The box that holds the machine's number, which is what identifies it. */
  idField: string;
  fields: { key: string; from: MachineColumnKey }[];
}

// A box the form calls a machine's NAME takes F/MNT/01's "Machine Name / Model
// No."; a box it calls a DESCRIPTION (or "discription", as F/MNT/04 prints it)
// takes "Machine Description". F/MNT/06 is a register of breakdowns and one
// machine breaks down many times, so, unlike HR's registers of people, it has
// no rule that a machine has one line. Every fetch there adds a line. The
// formats not here name machine classes rather than machines (F/MNT/03's
// "PRINTING MACHINE"), areas (F/MNT/09, 11), or a machine not yet on the list
// (F/MNT/08, the installation report that comes before it is listed).
export const EQUIPMENT_LINKS: EquipmentLink[] = [
  {
    docId: "mnt-pm-record",
    formatNo: "F/MNT/02",
    where: "header",
    idField: "machineIdNo",
    fields: [
      { key: "machineIdNo", from: "machineNo" },
      { key: "machineName", from: "model" },
    ],
  },
  {
    docId: "mnt-daily-health",
    formatNo: "F/MNT/04",
    where: "header",
    idField: "machineNo",
    fields: [
      { key: "machineNo", from: "machineNo" },
      { key: "machineDescription", from: "description" },
    ],
  },
  {
    docId: "mnt-breakdown-record",
    formatNo: "F/MNT/06",
    where: "rows",
    idField: "equipmentIdNo",
    fields: [
      { key: "equipmentIdNo", from: "machineNo" },
      { key: "equipmentName", from: "model" },
    ],
  },
];

export const equipmentLinkFor = (docId: string | undefined): EquipmentLink | undefined =>
  docId && docId !== EQUIPMENT_LIST_DOC_ID ? EQUIPMENT_LINKS.find((l) => l.docId === docId) : undefined;

/** What a box of the format gets for this machine: "" when the list has nothing for it, or only "NA". */
export const machineValue = (m: Machine, from: MachineColumnKey): string => usable(machineAsRead(m)[from]);

export interface MachineFill {
  /** Boxes that are blank, or hold this machine's own number written another way. They are filled without asking. */
  fills: FieldFill[];
  /** Boxes that already hold something else. They are replaced only when the person says so. */
  conflicts: FieldFill[];
}

/** What fetching this machine onto a header, or onto one line of a register, would write. A value that is the same once case and punctuation are set aside is left as written. */
export function machineFill(link: EquipmentLink, machine: Machine, current: Record<string, unknown>): MachineFill {
  const fills: FieldFill[] = [];
  const conflicts: FieldFill[] = [];
  for (const f of link.fields) {
    const after = machineValue(machine, f.from);
    if (!after) continue;
    const before = String(current[f.key] ?? "").trim();
    if (before === after) continue;
    if (!before) {
      fills.push({ key: f.key, before, after });
      continue;
    }
    if (f.key === link.idField) {
      // "m47" or "47" in the number box is this machine, and becomes "M-47". So
      // does the machine's own serial typed where its number goes.
      const key = idBoxKey(before);
      if (key && key === machineKey(machine.machineNo)) {
        fills.push({ key: f.key, before, after });
        continue;
      }
      const serial = serialKey(machineAsRead(machine).serialNo);
      if (!key && serial && serialKey(before) === serial) {
        fills.push({ key: f.key, before, after });
        continue;
      }
    } else if (textKey(before) === textKey(after)) continue;
    conflicts.push({ key: f.key, before, after });
  }
  return { fills, conflicts };
}

/** A new line for this machine on a register, starting from the register's blank line. */
export function lineForMachine(link: EquipmentLink, machine: Machine, blank: LogSheetRow): LogSheetRow {
  const line: LogSheetRow = { ...blank };
  for (const f of link.fields) {
    const value = machineValue(machine, f.from);
    if (value) line[f.key] = value;
  }
  return line;
}

/**
 * The blank boxes a number box fills when it is left, for the record page's
 * onBlur. `current` is the header or line as it stands, and `value` is what the
 * number box now holds. Nothing already written is in the answer. Write it with
 * applyFills({ ...current, [link.idField]: value }, fills).
 */
export function machineBlankFills(link: EquipmentLink, current: Record<string, unknown>, value: unknown, machines: Machine[] = allMachines()): FieldFill[] {
  const machine = machineInIdBox(value, machines);
  if (!machine) return [];
  return machineFill(link, machine, { ...current, [link.idField]: value }).fills;
}

export interface EquipmentBlankFill {
  data: LogSheetData;
  /** Each machine something was filled for: the line (null for the header) and the boxes. */
  filled: { index: number | null; machineNo: string; fills: FieldFill[]; outOfStep: boolean }[];
  /** Machine numbers written on the form that are not on F/MNT/01. */
  notOnList: string[];
}

/**
 * "Fill blanks from F/MNT/01": every header or line whose number box names a
 * machine on the list gets its blank boxes filled. Nothing written is changed,
 * and each line stands on its own. Ten breakdown lines for M-47 are ten lines
 * about M-47, not one line and nine mistakes.
 */
export function fillBlanksFromEquipment(link: EquipmentLink, data: LogSheetData, machines: Machine[] = allMachines()): EquipmentBlankFill {
  const filled: EquipmentBlankFill["filled"] = [];
  const notOnList: string[] = [];
  const fillOne = (current: Record<string, unknown>, index: number | null): FieldFill[] => {
    const written = String(current[link.idField] ?? "").trim();
    if (!written) return [];
    const machine = machineInIdBox(written, machines);
    if (!machine) {
      if (!notOnList.includes(written)) notOnList.push(written);
      return [];
    }
    const { fills } = machineFill(link, machine, current);
    if (fills.length > 0) filled.push({ index, machineNo: machine.machineNo, fills, outOfStep: readsOutOfStep(machine) });
    return fills;
  };
  let header = data.header ?? {};
  let rows = data.rows ?? [];
  if (link.where === "header") {
    const fills = fillOne(header, null);
    if (fills.length > 0) header = applyFills(header, fills);
  } else {
    rows = rows.map((row, index) => {
      const fills = fillOne(row, index);
      return fills.length > 0 ? applyFills(row, fills) : row;
    });
  }
  return { data: filled.length > 0 ? { ...data, header, rows } : data, filled, notOnList };
}
