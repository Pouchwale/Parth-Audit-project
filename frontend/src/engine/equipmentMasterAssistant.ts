import type { Chip } from "./guidedChecklist";
// Type only: assistantLocal.ts calls this file, so a value import back would be a cycle.
import type { LocalAnswer } from "./assistantLocal";
import {
  allMachines,
  currentEquipmentList,
  describeMachine,
  EQUIPMENT_LIST_FORMAT_NO,
  EQUIPMENT_LIST_NAME,
  EQUIPMENT_LIST_ROUTE,
  equipmentMasterVisible,
  isPlaceholder,
  machineAsRead,
  machineByNumber,
  machineKey,
  machineNumbersIn,
  machinesByName,
  machinesWithSerial,
  numberingGaps,
  readsOutOfStep,
  withoutMachineNumbers,
  type Machine,
} from "./equipmentMaster";

// MITRA AND THE EQUIPMENT LIST, F/MNT/01 (REQUIREMENTS §74).
//
//   "which machine is M-47?", "M-47", "serial no. 88562"   → that machine, every column
//   "where is the Delta 330", "find the Brison 370"         → the machines it could be
//   "machines in QC", "machines in Lombardi Printing"       → what stands there
//   "how many machines"                                     → the count, and the gaps
//   "open the equipment list", "open F/MNT/01"              → the list itself
//
// All of it is worked out here from the list's current record, with no network.
// These are QUESTIONS, so (REQUIREMENTS §72) the model answers them when it can
// be reached, and this is the app's own answer, given and labelled as such
// when it cannot. equipmentFactsForModel() below hands the model the same
// facts so its answer is not a guess. Only "open …" stays here, because
// opening a screen is a command, not a reply.
//
// A machine is named by its NUMBER. A model name only ever suggests machines,
// because the list repeats them (engine/equipmentMaster.ts). The list is
// Maintenance's (REQUIREMENTS §40): an account outside Maintenance is told so
// and is told nothing about any machine.

const openListChip = (): Chip => ({ label: `Open ${EQUIPMENT_LIST_FORMAT_NO}`, action: { type: "navigate", route: EQUIPMENT_LIST_ROUTE } });

const LIST_REF = `${EQUIPMENT_LIST_FORMAT_NO} (${EQUIPMENT_LIST_NAME})`;

// ---------------------------------------------------------------------------
// reading the message

const OPEN_VERB = /^\s*(?:please\s+|pls\s+|kindly\s+|can\s+you\s+|could\s+you\s+)?(?:open|show|view|see|display|go\s+to|take\s+me\s+to|bring\s+up|pull\s+up)\b/i;
// "the equipment list", "machine master", "list of equipments & utilities", "F/MNT/01", "MNT 1".
const LIST_NAME_SOURCE =
  /(?:\b(?:equipments?|machines?|machinery)\s+(?:master(?:\s+(?:list|data|sheet))?|list|register|sheet)\b|\b(?:master\s+)?list\s+of\s+(?:all\s+)?(?:the\s+)?(?:equipments?|machines?)(?:\s*(?:&|and)\s*utilities)?\b|\b(?:F\s*[-/ ]?\s*)?MNT\s*[-/ ]?\s*0?1(?!\d))/.source;
const LIST_NAME = new RegExp(LIST_NAME_SOURCE, "i");
const LIST_NAME_ALL = new RegExp(LIST_NAME_SOURCE, "gi");
const OPEN_FILLER = /\b(?:please|pls|kindly|can|could|you|me|the|a|an|our|all|full|whole|for|to|up|now|here|of|it|page|format|document|record)\b/gi;

// What a question about ONE machine may say around its number. Anything else
// ("M-47 breakdowns last month", "is M-47 due for PM") is a question about the
// machine's records, not about its line on the list, so it is left alone.
const DESCRIBE_WORDS = new Set(
  (
    "which what whats is are was the a an this that it its machine machines equipment equipments tell me us about describe details detail info information " +
    "on in of where located location kept placed installed stands stand show find look up lookup check give please pls kindly list who made make makes maker " +
    "model name number no serial and for do does you know can i see hey mitra our plant has have having with say says"
  ).split(" ")
);

// What a question about a place or a count may say before "machines".
const PREFIX_WORDS = new Set(
  "which what whats list show me give tell all the a an are there any do we have our please pls kindly name see display of how many number count total".split(" ")
);

// A message about the machines' RECORDS: breakdowns, PM, health, lux, glass,
// losses. That is for the maintenance records (REQUIREMENTS §75) or the
// model, not for the list.
const ACTIVITY =
  /\b(?:breakdowns?|broke(?:n)?|fail(?:ure|ures|ed|s)?|downtime|repair(?:s|ed)?|pm|preventive|preventative|schedule[ds]?|health|clean(?:ing|ed)?|lux|glass|breakage|mtbf|mttr|loss(?:es)?|installation|commission(?:ing|ed)?|due|overdue|history|records?|trend|stopp(?:ed|age)|working|running|status)\b/i;

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);

const onlyWords = (text: string, allowed: Set<string>) => wordsOf(text).every((w) => allowed.has(w));

const PLACE_NOISE = new Set(["the", "room", "area", "section", "department", "dept", "side", "hall", "zone"]);
const placeKey = (text: string) =>
  wordsOf(text)
    .filter((w) => !PLACE_NOISE.has(w))
    .join(" ");
const containsWords = (outer: string, inner: string) => !!inner && ` ${outer} `.includes(` ${inner} `);

// Where a question's place ends: "machines in QC on the list", "… do we have".
const TRAILING = /(?:^|\s+)(?:on\s+(?:the\s+)?(?:list|equipment\s+list|f\s*[-/]\s*mnt\s*[-/]\s*0?1)|in\s+(?:the\s+)?(?:plant|factory|company)|do\s+we\s+have|are\s+there|we\s+have|in\s+total|now|please|pls)\s*$/i;
function trimTrailing(text: string): string {
  let s = text.trim().replace(/[?.!]+$/, "").trim();
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(TRAILING, "").trim();
  }
  return s;
}

// ---------------------------------------------------------------------------
// saying it

const shown = (value: string) => (value.trim() ? value.trim() : "blank on the list");

function outOfStepText(m: Machine): string {
  if (!readsOutOfStep(m)) return "";
  const read = machineAsRead(m);
  const reading = [
    read.description,
    read.model && `model ${read.model}`,
    read.manufacturer && `by ${read.manufacturer}`,
    read.countryOfOrigin && `made in ${read.countryOfOrigin}`,
    [read.month, read.year].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    `\nNote: ${EQUIPMENT_LIST_FORMAT_NO} prints ${m.machineNo}'s line one column out of step, so its size (“${m.size}”), country of origin (“${m.countryOfOrigin}”) and year (“${m.year}”) read oddly. ` +
    `Read one column to the left it would be: ${reading}. Maintenance should confirm it against the machine's own plate.`
  );
}

/** Every column of the machine's line, as the list writes it: "NA", "Itlay" and "Febraury" included. */
function fullDescription(m: Machine): string {
  const made = [m.month, m.year].map((v) => v.trim()).filter(Boolean).join(" ");
  return [
    `${m.machineNo}, as ${LIST_REF} writes it:`,
    `• Machine Description: ${shown(m.description)}`,
    `• Machine Name / Model No.: ${shown(m.model)}`,
    `• Manufacturer: ${shown(m.manufacturer)}`,
    `• Location / Room: ${shown(m.location)}`,
    `• Section (the list's “Department” column): ${shown(m.department)}`,
    `• Size / Capacity: ${shown(m.size)}`,
    `• Month & Year of manufacture: ${shown(made)}`,
    `• Serial No.: ${shown(m.serialNo)}`,
    `• Country of Origin: ${shown(m.countryOfOrigin)}`,
  ].join("\n") + outOfStepText(m);
}

/** "the UV Flexo Printing Machine, Delta 330 by Lombardi": what the machine is, in a sentence. */
function whatItIs(m: Machine): string {
  const read = machineAsRead(m);
  const [description, model, maker] = [read.description, read.model, read.manufacturer].map((v) => (isPlaceholder(v) ? "" : v.trim()));
  const named = [description && `the ${description}`, model].filter(Boolean).join(", ");
  return [named, maker && `by ${maker}`].filter(Boolean).join(" ");
}

function whereItStands(m: Machine): string {
  const read = machineAsRead(m);
  const section = isPlaceholder(read.department) ? "" : ` (${read.department} section)`;
  return isPlaceholder(read.location) ? "The list does not say where it stands." : `It stands in ${read.location}${section}.`;
}

/** "M-01 to M-85": the first and last numbers on the list. */
function numberSpan(machines: Machine[]): { first: string; last: string; count: number } {
  const numbers = machines
    .map((m) => machineKey(m.machineNo))
    .filter(Boolean)
    .map((k) => Number(k.slice(2)))
    .sort((a, b) => a - b);
  const label = (n: number | undefined) => (n === undefined ? "" : `M-${String(n).padStart(2, "0")}`);
  return { first: label(numbers[0]), last: label(numbers[numbers.length - 1]), count: numbers.length };
}

/** A note that the list being read is not the Verified one, when it is not. */
function listStatusNote(): string {
  const record = currentEquipmentList();
  return record && record.status !== "Verified" ? `\n(This is the list as it stands now. It is ${record.status}, not Verified.)` : "";
}

const refusal = (): LocalAnswer => ({
  kind: "reply",
  reply: `${EQUIPMENT_LIST_FORMAT_NO}, the ${EQUIPMENT_LIST_NAME}, is Maintenance's list, which isn't one of your departments. Ask the system administrator if you need it.`,
  chips: [],
});

const noList = (): LocalAnswer => ({
  kind: "reply",
  reply: `There is no ${EQUIPMENT_LIST_NAME} (${EQUIPMENT_LIST_FORMAT_NO}) on file yet, so there is no machine to look up.`,
  chips: [openListChip()],
});

// ---------------------------------------------------------------------------
// the answers

function openAnswer(text: string): LocalAnswer | "no" {
  if (!LIST_NAME.test(text)) return "no";
  const rest = text.replace(LIST_NAME_ALL, " ").replace(OPEN_VERB, " ").replace(OPEN_FILLER, " ").replace(/[^\p{L}\p{N}]+/gu, "");
  if (rest !== "") return "no";
  if (!equipmentMasterVisible()) return refusal();
  const machines = allMachines();
  const { first, last, count } = numberSpan(machines);
  const what = count > 0 ? `: ${count} machine${count === 1 ? "" : "s"}, numbered ${first} to ${last}` : "";
  return {
    reply: `Opening ${EQUIPMENT_LIST_FORMAT_NO}, the ${EQUIPMENT_LIST_NAME}${what}. The Maintenance formats fetch machines from it by Machine No.`,
    chips: [openListChip()],
    navigate: EQUIPMENT_LIST_ROUTE,
  };
}

function numberAnswer(numbers: string[], machines: Machine[]): LocalAnswer {
  const found = numbers.map((n) => machineByNumber(n, machines)).filter((m): m is Machine => !!m);
  const missing = numbers.filter((n) => !machineByNumber(n, machines));
  const { first, last, count } = numberSpan(machines);
  const notOn = (keys: string[]) => {
    if (keys.length === 0) return "";
    const within = keys.every((k) => {
      const n = Number(k.slice(2));
      return first && n > Number(first.slice(2)) && n < Number(last.slice(2));
    });
    const which = keys.length === 1 ? `${keys[0]} is` : `${keys.join(", ").replace(/, ([^,]*)$/, " and $1")} are`;
    return `${which} not on ${LIST_REF}. Its ${count} machines are numbered ${first} to ${last}${within ? " with gaps, and the list skips " + (keys.length === 1 ? "that number" : "those numbers") : ""}.`;
  };
  if (found.length === 1 && missing.length === 0) {
    return { kind: "reply", reply: fullDescription(found[0]) + listStatusNote(), chips: [openListChip()] };
  }
  if (found.length === 0) return { kind: "reply", reply: notOn(missing), chips: [openListChip()] };
  const lines = found.map((m) => `• ${describeMachine(m)}`);
  const shifted = found.find(readsOutOfStep);
  return {
    kind: "reply",
    reply: [`On ${LIST_REF}:`, ...lines, missing.length > 0 ? notOn(missing) : ""].filter(Boolean).join("\n") + (shifted ? outOfStepText(shifted) : "") + listStatusNote(),
    chips: [openListChip()],
  };
}

const SERIAL_Q = /\bserial\s*(?:no\.?|number|#)?\s*[:#.-]?\s*([A-Za-z0-9][A-Za-z0-9/-]*)/i;

function serialAnswer(text: string, machines: Machine[]): LocalAnswer | null {
  const m = SERIAL_Q.exec(text);
  if (!m || !/\d/.test(m[1])) return null;
  if (!onlyWords(text.replace(m[0], " "), DESCRIBE_WORDS)) return null;
  const found = machinesWithSerial(m[1], machines);
  if (found.length === 1) return { kind: "reply", reply: fullDescription(found[0]) + listStatusNote(), chips: [openListChip()] };
  if (found.length > 1) {
    return {
      kind: "reply",
      reply: [`${found.length} machines on ${LIST_REF} carry Serial No. ${m[1]}:`, ...found.map((x) => `• ${describeMachine(x)}`)].join("\n"),
      chips: [openListChip()],
    };
  }
  return { kind: "reply", reply: `No machine on ${LIST_REF} has Serial No. ${m[1]}.`, chips: [openListChip()] };
}

/** The machines at a place the person named: a section of the list's "Department" column ("Flexo", "Common"), else a Location / Room. */
function machinesAt(place: string, machines: Machine[]): { label: string; machines: Machine[] } | null {
  const pk = placeKey(place);
  if (!pk) return null;
  const inSection = machines.filter((m) => !isPlaceholder(m.department) && placeKey(m.department) === pk);
  if (inSection.length > 0) return { label: `the ${inSection[0].department} section`, machines: inSection };
  const here = machines.filter((m) => {
    const lk = placeKey(machineAsRead(m).location);
    return !!lk && (lk === pk || containsWords(lk, pk) || containsWords(pk, lk));
  });
  if (here.length === 0) return { label: place, machines: [] };
  const names = Array.from(new Set(here.map((m) => machineAsRead(m).location.trim())));
  return { label: names.join(" / "), machines: here };
}

function knownLocations(machines: Machine[]): string {
  const names = Array.from(new Set(machines.map((m) => machineAsRead(m).location.trim()).filter((l) => l && !isPlaceholder(l))));
  return names.join(", ");
}

const MACHINE_WORD = /\b(?:machines?|equipments?|machinery)\b/i;
const COUNT_RE = /\b(?:how\s+many|number\s+of|count\s+of|count\s+(?:the\s+)?|total(?:\s+number\s+of)?)\s*(?:the\s+)?(?:machines?|equipments?|equipment|machinery)\b/i;
const PLACE_RE = /\b(?:in|at|inside|within|on|of|for|from)\s+(?:the\s+)?(.+)$/i;
const LOCATION_Q = /^(.*?)\b(?:machines?|equipments?|equipment|machinery)\b((?:\s+(?:are|is|kept|installed|located|placed|there|listed|list|standing|stand|we\s+have|do\s+we\s+have))*)\s+(?:in|at|inside|within|on|of|for|from)\s+(?:the\s+)?(.+)$/i;

/** "machines in QC", "which machines are at the Sleeve": a question, with nothing before "machines" but asking words. */
function asksWhereMachinesAre(text: string): boolean {
  const m = LOCATION_Q.exec(trimTrailing(text));
  return !!m && onlyWords(m[1], PREFIX_WORDS);
}

function countAnswer(text: string, machines: Machine[]): LocalAnswer | null {
  const m = COUNT_RE.exec(text);
  if (!m) return null;
  const after = trimTrailing(text.slice(m.index + m[0].length).replace(/^\s*(?:are|is|kept|installed|located|placed|there|listed|standing|do\s+we\s+have|we\s+have)\b/i, ""));
  const placeMatch = PLACE_RE.exec(after);
  const { first, last, count } = numberSpan(machines);
  if (placeMatch) {
    const place = trimTrailing(placeMatch[1]);
    if (wordsOf(place).length > 6) return null;
    const at = machinesAt(place, machines);
    if (!at) return null;
    if (at.machines.length === 0) {
      return { kind: "reply", reply: `No machine on ${LIST_REF} is in “${place}”. The locations it names are: ${knownLocations(machines)}.`, chips: [openListChip()] };
    }
    const n = at.machines.length;
    return {
      kind: "reply",
      reply: `${n} of the ${count} machines on ${LIST_REF} ${n === 1 ? "is" : "are"} in ${at.label}: ${at.machines.map((x) => x.machineNo).join(", ")}.`,
      chips: [openListChip()],
    };
  }
  if (after && !onlyWords(after, PREFIX_WORDS)) return null;
  const gaps = numberingGaps(machines);
  const unnumbered = machines.length - count;
  return {
    kind: "reply",
    reply:
      `${LIST_REF} lists ${count} machine${count === 1 ? "" : "s"}, numbered ${first} to ${last}.` +
      (gaps.length > 0 ? ` The numbering has gaps (${gaps.join(", ")} are not on it), so the highest number is not the count.` : "") +
      (unnumbered > 0 ? ` ${unnumbered} more line${unnumbered === 1 ? " has" : "s have"} no Machine No.` : "") +
      listStatusNote(),
    chips: [openListChip()],
  };
}

function locationAnswer(text: string, machines: Machine[]): LocalAnswer | null {
  const m = LOCATION_Q.exec(trimTrailing(text));
  if (!m || !asksWhereMachinesAre(text)) return null;
  const place = trimTrailing(m[3]);
  if (!place || wordsOf(place).length > 6) return null;
  const at = machinesAt(place, machines);
  if (!at) return null;
  if (at.machines.length === 0) {
    return { kind: "reply", reply: `No machine on ${LIST_REF} is in “${place}”. The locations it names are: ${knownLocations(machines)}.`, chips: [openListChip()] };
  }
  const n = at.machines.length;
  // A whole section is most of the list: its numbers, not a line each.
  const lines = n > 12 ? [at.machines.map((x) => x.machineNo).join(", ")] : at.machines.map((x) => `• ${describeMachine(x)}`);
  return {
    kind: "reply",
    reply: [`${n} machine${n === 1 ? "" : "s"} on ${LIST_REF} ${n === 1 ? "is" : "are"} in ${at.label}:`, ...lines].join("\n"),
    chips: [openListChip()],
  };
}

const SEARCH_LEAD =
  /^\s*(?:please\s+|pls\s+|kindly\s+|hey\s+mitra\s*,?\s*)?(where\s+(?:is|are)|where's|wheres|which\s+machines?\s+(?:is|are)|which\s+one\s+is|find|locate|look\s+up|search\s+for|what\s+is|what's|whats|tell\s+me\s+about|details\s+of|describe)\s+(?:the\s+|our\s+|a\s+|an\s+)?(.+)$/i;
const SEARCH_TAIL = /\s+(?:machines?|kept|located|installed|placed|standing|now|on\s+(?:the\s+)?(?:list|f\s*[-/]\s*mnt\s*[-/]\s*0?1)|in\s+(?:the\s+)?(?:plant|factory|company))\s*$/i;

function searchAnswer(text: string, machines: Machine[]): LocalAnswer | null {
  const m = SEARCH_LEAD.exec(text.trim().replace(/[?.!]+$/, ""));
  if (!m) return null;
  let query = m[2].trim();
  for (let prev = ""; prev !== query; ) {
    prev = query;
    query = query.replace(SEARCH_TAIL, "").replace(/^(?:machine|machines)\s+(?:called\s+|named\s+)?/i, "").trim();
  }
  if (!query || wordsOf(query).length > 6) return null;
  const strong = /^(?:where|which|find|locate|look|search)/i.test(m[1]);
  let found = machinesByName(query, machines, 8);
  // "what is the chiller" is a question about the list only when it names
  // something on it exactly. Otherwise it is a question for the model.
  if (!strong) {
    const key = wordsOf(query).join(" ");
    found = found.filter((x) => {
      const read = machineAsRead(x);
      return [read.model, read.description, read.manufacturer].some((v) => wordsOf(v).join(" ") === key);
    });
  }
  if (found.length === 0) return null;
  if (found.length === 1) {
    const one = found[0];
    return {
      kind: "reply",
      reply: `“${query}” on ${LIST_REF} is ${one.machineNo}${whatItIs(one) ? `, ${whatItIs(one)}` : ""}. ${whereItStands(one)}${outOfStepText(one)}`,
      chips: [openListChip()],
    };
  }
  return {
    kind: "reply",
    reply: [
      `${found.length} machines on ${LIST_REF} match “${query}”:`,
      ...found.map((x) => `• ${describeMachine(x)}`),
      "The list gives more than one machine the same model or description, so it is the Machine No. that tells them apart.",
    ].join("\n"),
    chips: [openListChip()],
  };
}

/**
 * Mitra's answer to a question about F/MNT/01, or null when the message is
 * not about it. Placed in assistantLocal.localAnswer beside HR Master Data's.
 */
export function equipmentChatAnswer(text: string): LocalAnswer | null {
  const s = String(text ?? "").trim();
  if (!s) return null;

  // "open the equipment list", "open F/MNT/01", "equipment master".
  const numbers = machineNumbersIn(s);
  if (numbers.length === 0) {
    const open = openAnswer(s);
    if (open !== "no") return open;
  }

  // "which machine is M-47?": a number, with nothing around it but a question.
  const describing = numbers.length > 0 && onlyWords(withoutMachineNumbers(s).replace(LIST_NAME_ALL, " "), DESCRIBE_WORDS);
  const bySerial = numbers.length === 0 && SERIAL_Q.test(s);
  const aboutMachines = MACHINE_WORD.test(s) && !ACTIVITY.test(s) && (COUNT_RE.test(s) || asksWhereMachinesAre(s));
  if (describing || bySerial || aboutMachines) {
    if (!equipmentMasterVisible()) {
      // A serial question is only this list's when the person can see it; to
      // anyone else it could be about anything.
      if (bySerial && !describing && !aboutMachines) return null;
      return refusal();
    }
    const machines = allMachines();
    if (machines.length === 0) return noList();
    if (describing) return numberAnswer(numbers, machines);
    if (bySerial) {
      const serial = serialAnswer(s, machines);
      if (serial) return serial;
    }
    if (aboutMachines) return countAnswer(s, machines) ?? locationAnswer(s, machines);
    return null;
  }

  // "where is the Delta 330": only for someone who can see the list, because
  // otherwise there is no telling whether it names a machine at all.
  if (numbers.length > 0 || ACTIVITY.test(s) || !equipmentMasterVisible()) return null;
  const machines = allMachines();
  return machines.length > 0 ? searchAnswer(s, machines) : null;
}

/** The most the facts below add to the model's live facts. The server refuses a context over 4000 characters (backend/index.ts). */
export const EQUIPMENT_FACTS_MAX = 1200;

/**
 * The same facts for the model (REQUIREMENTS §72), for buildAssistantContext.
 * The model answers these questions when it is reachable, and without this it
 * would have to guess what M-47 is. "" when the message is not about the list.
 * For an account outside Maintenance it says only that the list is not theirs.
 */
export function equipmentFactsForModel(text: string): string {
  const answer = equipmentChatAnswer(text);
  if (!answer || answer.navigate) return "";
  return `From ${LIST_REF}, the app's own equipment list: ${answer.reply}`.slice(0, EQUIPMENT_FACTS_MAX);
}
