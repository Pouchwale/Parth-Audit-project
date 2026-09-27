// WHY THE WORK MATTERS — NOT ONLY FOR THE SCORE (REQUIREMENTS §81).
//
// "Motivate them not only for score." A person who hears only "your score is
// 92%" learns to chase a number. Each module's records exist for a reason a
// person can be proud of — a customer's pack sealed right, a colleague kept
// safe, an audit passed without a scramble — and Mitra says so: in a spoken
// reminder, under a celebration, on the dashboard's day card. A few lines per
// module, in English and Gujarati, chosen by a seed (the day, the record) so
// the same moment always reads the same way and the next one reads differently.
//
// Plain words, no document names: a celebration is shown on any screen, and it
// must not name a document of a department the viewer does not belong to.

import type { Language } from "../i18n/strings";

type Lines = { en: string[]; gu: string[] };

const BY_MODULE: Record<string, Lines> = {
  "Quality Control — Inspection Records": {
    en: [
      "Every check you record is a customer who never receives a faulty pack.",
      "Good inspection records mean a complaint can be answered in minutes, not days.",
      "Your readings are the proof that what leaves this plant is right.",
    ],
    gu: [
      "તમે નોંધેલી દરેક તપાસનો અર્થ છે — કોઈ ગ્રાહકને ખામીવાળું પેક નહીં મળે.",
      "સારા તપાસ રેકોર્ડથી ફરિયાદનો જવાબ દિવસોમાં નહીં, મિનિટોમાં મળે છે.",
      "તમારી નોંધો સાબિતી છે કે આ પ્લાન્ટમાંથી જે જાય છે તે બરાબર છે.",
    ],
  },
  "Lamination — Quality Control": {
    en: [
      "Each reading on the line keeps a laminate bonded and a pouch sealed.",
      "Catching a drift in viscosity today saves a whole batch tomorrow.",
    ],
    gu: [
      "લાઇન પરની દરેક નોંધ લેમિનેટને મજબૂત અને પાઉચને સીલ રાખે છે.",
      "આજે વિસ્કોસિટીમાં ફેરફાર પકડશો તો કાલે આખી બેચ બચી જશે.",
    ],
  },
  "Lamination — Production": {
    en: ["The process you record today is the batch we can trace tomorrow.", "Right settings, written down, mean the next shift starts right."],
    gu: ["આજે નોંધેલી પ્રક્રિયા એ જ બેચ છે જેને આપણે કાલે શોધી શકીશું.", "સાચા સેટિંગ નોંધાયેલા હોય તો આગલી શિફ્ટ પણ સાચી શરૂ થાય છે."],
  },
  "Human Resources": {
    en: [
      "Records like these keep every colleague trained, fit and safe.",
      "A trained team is a safe team — and this record proves it.",
      "Your care here keeps the plant hygienic and pest-free for everyone.",
    ],
    gu: [
      "આવા રેકોર્ડ દરેક સાથીને તાલીમબદ્ધ, સ્વસ્થ અને સુરક્ષિત રાખે છે.",
      "તાલીમ પામેલી ટીમ એટલે સુરક્ષિત ટીમ — અને આ રેકોર્ડ તેની સાબિતી છે.",
      "અહીં તમારી કાળજી પ્લાન્ટને સૌ માટે સ્વચ્છ અને જીવાત-મુક્ત રાખે છે.",
    ],
  },
  Maintenance: {
    en: ["A machine checked today is a breakdown that never happens.", "Every clean, checked machine keeps the line running and people safe."],
    gu: ["આજે તપાસેલું મશીન એટલે ક્યારેય ન થનારું બ્રેકડાઉન.", "દરેક સ્વચ્છ, તપાસેલું મશીન લાઇન ચાલુ અને લોકોને સુરક્ષિત રાખે છે."],
  },
  Purchase: {
    en: ["Good suppliers make good packs — and this record keeps them good.", "Every supplier checked is one less surprise at the gate."],
    gu: ["સારા સપ્લાયર એટલે સારા પેક — અને આ રેકોર્ડ તેમને સારા રાખે છે.", "તપાસેલો દરેક સપ્લાયર એટલે ગેટ પર એક આશ્ચર્ય ઓછું."],
  },
  Store: {
    en: ["The right material in, checked and counted, is where every good job starts."],
    gu: ["સાચો માલ, તપાસીને અને ગણીને અંદર — દરેક સારા કામની શરૂઆત અહીંથી થાય છે."],
  },
  Dispatch: {
    en: ["A clean, checked load is the last promise we keep to the customer."],
    gu: ["સ્વચ્છ, તપાસેલો લોડ એ ગ્રાહકને આપેલું છેલ્લું વચન છે જે આપણે પાળીએ છીએ."],
  },
  Marketing: {
    en: ["Every customer's word, heard and answered, is a customer who stays."],
    gu: ["દરેક ગ્રાહકની વાત સાંભળીને જવાબ આપીએ, તો ગ્રાહક આપણી સાથે રહે છે."],
  },
  "System / Management": {
    en: ["This is the record that keeps every other record honest — an audit's first question, answered."],
    gu: ["આ એ રેકોર્ડ છે જે બાકીના દરેક રેકોર્ડને સાચા રાખે છે — ઓડિટના પહેલા પ્રશ્નનો જવાબ."],
  },
  "CAPA (Corrective & Preventive Action)": {
    en: ["Every action closed is a problem that will not come back.", "Fixing the cause, not just the complaint — that is what this record shows."],
    gu: ["બંધ થયેલી દરેક કાર્યવાહી એટલે પાછી નહીં આવનારી સમસ્યા.", "ફક્ત ફરિયાદ નહીં, કારણ જ સુધારવું — આ રેકોર્ડ એ જ બતાવે છે."],
  },
  "Quality — Compliance": {
    en: ["Being ready for an audit every day means never having to rush for one."],
    gu: ["દરરોજ ઓડિટ માટે તૈયાર રહીએ, તો ક્યારેય દોડાદોડી કરવી ન પડે."],
  },
};

/** For a moment that is not about one module (a whole day done, a streak). */
const GENERAL: Lines = {
  en: [
    "Complete records are what an auditor trusts — and what a customer never has to question.",
    "Work done on time is work nobody has to chase — including you.",
    "Every record finished today is one less worry for the whole team tomorrow.",
    "This is how a plant earns its customers' trust: one honest record at a time.",
  ],
  gu: [
    "પૂરા રેકોર્ડ પર ઓડિટર વિશ્વાસ કરે છે — અને ગ્રાહકને ક્યારેય શંકા કરવી પડતી નથી.",
    "સમયસર થયેલું કામ કોઈએ પાછળ પડીને કરાવવું પડતું નથી — તમારે પણ નહીં.",
    "આજે પૂરો થયેલો દરેક રેકોર્ડ આખી ટીમ માટે કાલની એક ચિંતા ઓછી કરે છે.",
    "પ્લાન્ટ ગ્રાહકોનો વિશ્વાસ આમ જ જીતે છે: એક સાચો રેકોર્ડ, એક સમયે.",
  ],
};

/** A small, stable hash of a seed string, so the same moment always picks the same line. */
function pick(lines: string[], seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return lines[(h >>> 0) % lines.length];
}

/** Why this module's records matter, in the person's language — one line, chosen by `seed` (e.g. the day and the record id). */
export function purposeLine(module: string | undefined, lang: Language, seed = ""): string {
  const lines = (module && BY_MODULE[module]) || GENERAL;
  return pick(lines[lang] ?? lines.en, `${module ?? ""}|${seed}`);
}

/** A line for a whole day or a streak — not about any one module. */
export function generalPurposeLine(lang: Language, seed = ""): string {
  return pick(GENERAL[lang] ?? GENERAL.en, `general|${seed}`);
}

/** The modules that have lines of their own (a test checks every module of the catalogue is here). */
export const PURPOSE_MODULES: readonly string[] = Object.keys(BY_MODULE);
