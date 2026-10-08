// A NOTIFICATION IN WORDS: ENGLISH, HINDI AND GUJARATI (REQUIREMENTS §97).
//
// The server keeps each notification as facts (engine/notificationPlan.ts NotificationData: the document, the date,
// the counts) and words it here whenever it is read: by the website's bell and Notifications page, by the phone's
// inbox (through the Mitra server) and by the push to a phone, each in the language asked. One file, so the three
// can never say different things, and a sentence is never stored: a person who switches language reads every
// notification in the new one.
//
// The owner's rules for the words (8-Oct-2026): short sentences in plain words; no gendered pronoun (the name, or
// "you"); never a record's values (a push passes through Expo's and Google's servers). No em dash, as the Hindi
// sentences of i18n/hindi.ts.
//
// WITH NO IMPORTS AT ALL, like engine/notificationPlan.ts: the server loads it with Node's type stripping.
// frontend/tests/notificationText.test.ts words every kind in every language and holds the module names to the plant's.

export type NotificationLanguage = "en" | "hi" | "gu";

export const NOTIFICATION_LANGUAGES: readonly NotificationLanguage[] = ["en", "hi", "gu"];

export const isNotificationLanguage = (v: unknown): v is NotificationLanguage => v === "en" || v === "hi" || v === "gu";

/** The facts a notification is worded from (engine/notificationPlan.ts NotificationData; any extra field is ignored). */
export interface WordsData {
  documentId?: string;
  formatNo?: string;
  documentName?: string;
  module?: string;
  recordId?: string;
  dueDate?: string;
  count?: number;
  daysLate?: number;
  reason?: string;
  modules?: { module: string; ready: number; needsInput: number; awaitingVerification: number; notSubmitted: number; overdue: number }[];
  subject?: string;
  late?: number;
  neverDone?: number;
  level?: string;
  by?: string;
  part?: string;
}

export interface NotificationWords {
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// the plant's modules and the levels, in the three languages

/** The ten modules' names (data/seed/documentDepartments.ts PLANT_DEPARTMENTS in English; the unit test holds them equal). */
export const MODULE_NAMES: Record<string, Record<NotificationLanguage, string>> = {
  SYS: { en: "System / Management", hi: "सिस्टम / प्रबंधन", gu: "સિસ્ટમ / મેનેજમેન્ટ" },
  MKT: { en: "Marketing", hi: "मार्केटिंग", gu: "માર્કેટિંગ" },
  PUR: { en: "Purchase", hi: "खरीद", gu: "ખરીદી" },
  STR: { en: "Store", hi: "स्टोर", gu: "સ્ટોર" },
  QC: { en: "Quality Control", hi: "गुणवत्ता नियंत्रण", gu: "ગુણવત્તા નિયંત્રણ" },
  QA: { en: "Quality Assurance", hi: "गुणवत्ता आश्वासन", gu: "ગુણવત્તા ખાતરી" },
  PRD: { en: "Production", hi: "उत्पादन", gu: "ઉત્પાદન" },
  MNT: { en: "Maintenance", hi: "रखरखाव", gu: "જાળવણી" },
  HR: { en: "Human Resources", hi: "मानव संसाधन", gu: "માનવ સંસાધન" },
  DISP: { en: "Dispatch", hi: "डिस्पैच", gu: "ડિસ્પેચ" },
};

const LEVEL_NAMES: Record<string, Record<NotificationLanguage, string>> = {
  none: { en: "no", hi: "कोई नहीं", gu: "કોઈ નહીં" },
  read: { en: "Read", hi: "Read (केवल देखना)", gu: "Read (ફક્ત જોવું)" },
  write: { en: "Write", hi: "Write (भरना और जमा करना)", gu: "Write (ભરવું અને સબમિટ કરવું)" },
  edit: { en: "Edit", hi: "Edit (सुधार भी)", gu: "Edit (સુધારો પણ)" },
};

/** A module's name in the language, or its code for one this file does not know. */
export function moduleName(code: string | undefined, lang: NotificationLanguage): string {
  if (!code) return "";
  return MODULE_NAMES[code.toUpperCase()]?.[lang] ?? code;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-09" as the app writes a date, "09-Oct-2026", in every language (utils/date.ts formatDisplayDate). */
export function displayDate(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return iso ?? "";
  return `${m[3]}-${MONTHS[Number(m[2]) - 1] ?? m[2]}-${m[1]}`;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
const clean = (v: unknown, max = 200): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The format number and name, or the name alone while the number is still to be confirmed. */
function called(d: WordsData): string {
  const name = clean(d.documentName) || clean(d.documentId) || "";
  const no = clean(d.formatNo);
  return no && !/^TO BE/i.test(no) ? (name ? `${no} ${name}` : no) : name;
}
const nameOf = (d: WordsData): string => clean(d.documentName) || clean(d.formatNo) || clean(d.documentId);

// ---------------------------------------------------------------------------
// one notification

type Words = (d: WordsData) => NotificationWords;

function summaryTotals(d: WordsData): { r: number; n: number; v: number; s: number; o: number; worst: { module: string; overdue: number } | null } {
  const list = Array.isArray(d.modules) ? d.modules : [];
  let r = 0, n = 0, v = 0, s = 0, o = 0;
  let worst: { module: string; overdue: number } | null = null;
  for (const m of list) {
    r += num(m.ready);
    n += num(m.needsInput);
    v += num(m.awaitingVerification);
    s += num(m.notSubmitted);
    o += num(m.overdue);
    if (num(m.overdue) > 0 && (!worst || num(m.overdue) > worst.overdue)) worst = { module: m.module, overdue: num(m.overdue) };
  }
  return { r, n, v, s, o, worst };
}

const EN: Record<string, Words> = {
  ready: (d) => ({ title: `Ready for you: ${nameOf(d)}`, body: `${called(d)} of ${displayDate(d.dueDate)} is ready. Review it, then submit.` }),
  needs_input: (d) => {
    const n = num(d.count);
    return n > 0
      ? { title: `${n} ${n === 1 ? "reading" : "readings"} to enter: ${nameOf(d)}`, body: `${called(d)} of ${displayDate(d.dueDate)} is ready for you: ${n} ${n === 1 ? "reading" : "readings"} to enter, then submit.` }
      : { title: `To fill in: ${nameOf(d)}`, body: `${called(d)} of ${displayDate(d.dueDate)} needs your entries before it can be submitted.` };
  },
  due: (d) => ({ title: `Due today: ${nameOf(d)}`, body: `${called(d)} of ${displayDate(d.dueDate)} is due and not started yet.` }),
  upcoming: (d) => ({ title: `Coming up: ${nameOf(d)}`, body: `${called(d)} is due on ${displayDate(d.dueDate)}.` }),
  overdue: (d) => {
    const n = num(d.daysLate);
    return { title: `Overdue: ${nameOf(d)}`, body: `${called(d)} of ${displayDate(d.dueDate)} is ${n} ${n === 1 ? "day" : "days"} late. Fill it in and submit it today.` };
  },
  verify: (d) => ({
    title: `To verify: ${nameOf(d)}`,
    body: d.by ? `${clean(d.by)} submitted ${called(d)} of ${displayDate(d.dueDate)}. It is waiting for your verification.` : `${called(d)} of ${displayDate(d.dueDate)} is waiting for your verification.`,
  }),
  sent_back: (d) => {
    const why = clean(d.reason, 300);
    const what = `${called(d)} of ${displayDate(d.dueDate)}`;
    const head = d.by ? `${clean(d.by)} sent back ${what}` : `${what} was sent back`;
    return { title: `Sent back: ${nameOf(d)}`, body: `${head}${why ? `: "${why}"` : ""}. Put it right and submit it again.` };
  },
  boss_summary: (d) => {
    const t = summaryTotals(d);
    const title = d.part === "evening" ? "This evening's summary" : "This morning's summary";
    if (t.r + t.n + t.v + t.s + t.o === 0) return { title, body: "Nothing is waiting in any module." };
    const worst = t.worst ? ` Most overdue: ${moduleName(t.worst.module, "en")} (${t.worst.overdue}).` : "";
    return { title, body: `Ready to submit: ${t.r}. Needing input: ${t.n}. Awaiting verification: ${t.v}. Not yet submitted today: ${t.s}. Overdue: ${t.o}.${worst}` };
  },
  escalation: (d) => {
    const who = clean(d.subject) || moduleName(d.module, "en") || "A department";
    const parts = [num(d.late) ? `${num(d.late)} late` : "", num(d.neverDone) ? `${num(d.neverDone)} never done` : ""].filter(Boolean);
    return { title: `Escalated: ${who}`, body: `${who}: ${parts.length ? parts.join(" and ") : "records behind"} in the last 30 days.` };
  },
  access_changed: (d) => {
    const what = clean(d.documentName) || moduleName(d.module, "en") || "DCRS";
    const by = d.by ? `${clean(d.by)} changed your access. ` : "";
    const level = (d.level ?? "").toLowerCase();
    const now = level === "none" ? `You no longer have access to ${what}.` : `You now have ${LEVEL_NAMES[level]?.en ?? level} access to ${what}.`;
    return { title: "Your access has changed", body: `${by}${now}` };
  },
};

const HI: Record<string, Words> = {
  ready: (d) => ({ title: `आपके लिए तैयार: ${nameOf(d)}`, body: `${called(d)} (${displayDate(d.dueDate)}) तैयार है। रिकॉर्ड जाँचें, फिर जमा करें।` }),
  needs_input: (d) => {
    const n = num(d.count);
    return n > 0
      ? { title: `${n} रीडिंग भरनी ${n === 1 ? "है" : "हैं"}: ${nameOf(d)}`, body: `${called(d)} (${displayDate(d.dueDate)}) आपके लिए तैयार है: ${n} रीडिंग भरें, फिर जमा करें।` }
      : { title: `भरना बाकी: ${nameOf(d)}`, body: `${called(d)} (${displayDate(d.dueDate)}) में आपकी जानकारी भरनी बाकी है, उसके बाद ही जमा होगा।` };
  },
  due: (d) => ({ title: `आज देय: ${nameOf(d)}`, body: `${called(d)} (${displayDate(d.dueDate)}) देय है और इस पर अभी काम शुरू नहीं हुआ है।` }),
  upcoming: (d) => ({ title: `जल्द देय: ${nameOf(d)}`, body: `${called(d)} ${displayDate(d.dueDate)} को देय है।` }),
  overdue: (d) => ({ title: `देर से: ${nameOf(d)}`, body: `${called(d)} (${displayDate(d.dueDate)}) ${num(d.daysLate)} दिन देर से है। आज ही भरकर जमा करें।` }),
  verify: (d) => ({
    title: `सत्यापन के लिए: ${nameOf(d)}`,
    body: d.by ? `${clean(d.by)} ने ${called(d)} (${displayDate(d.dueDate)}) जमा किया है। यह रिकॉर्ड आपके सत्यापन की प्रतीक्षा में है।` : `${called(d)} (${displayDate(d.dueDate)}) आपके सत्यापन की प्रतीक्षा में है।`,
  }),
  sent_back: (d) => {
    const why = clean(d.reason, 300);
    const what = `${called(d)} (${displayDate(d.dueDate)})`;
    const head = d.by ? `${clean(d.by)} ने ${what} वापस भेजा` : `${what} वापस भेजा गया`;
    return { title: `वापस भेजा गया: ${nameOf(d)}`, body: `${head}${why ? `: "${why}"` : ""}। इसे ठीक करके फिर से जमा करें।` };
  },
  boss_summary: (d) => {
    const t = summaryTotals(d);
    const title = d.part === "evening" ? "शाम का सारांश" : "सुबह का सारांश";
    if (t.r + t.n + t.v + t.s + t.o === 0) return { title, body: "किसी भी मॉड्यूल में कुछ बाकी नहीं है।" };
    const worst = t.worst ? ` सबसे ज़्यादा देर: ${moduleName(t.worst.module, "hi")} (${t.worst.overdue})।` : "";
    return { title, body: `जमा करने को तैयार: ${t.r}। भरना बाकी: ${t.n}। सत्यापन बाकी: ${t.v}। आज जमा होना बाकी: ${t.s}। देर से: ${t.o}।${worst}` };
  },
  escalation: (d) => {
    const who = clean(d.subject) || moduleName(d.module, "hi") || "एक विभाग";
    const parts = [num(d.late) ? `${num(d.late)} देर से जमा` : "", num(d.neverDone) ? `${num(d.neverDone)} कभी नहीं भरे गए` : ""].filter(Boolean);
    return { title: `एस्केलेशन: ${who}`, body: `${who}: पिछले 30 दिनों में ${parts.length ? parts.join(" और ") : "रिकॉर्ड पीछे"}।` };
  },
  access_changed: (d) => {
    const what = clean(d.documentName) || moduleName(d.module, "hi") || "DCRS";
    const by = d.by ? `${clean(d.by)} ने आपकी पहुँच बदली है। ` : "";
    const level = (d.level ?? "").toLowerCase();
    const now = level === "none" ? `अब ${what} में आपकी कोई पहुँच नहीं है।` : `अब ${what} में आपकी पहुँच: ${LEVEL_NAMES[level]?.hi ?? level}।`;
    return { title: "आपकी पहुँच बदली गई है", body: `${by}${now}` };
  },
};

const GU: Record<string, Words> = {
  ready: (d) => ({ title: `તમારા માટે તૈયાર: ${nameOf(d)}`, body: `${called(d)} (${displayDate(d.dueDate)}) તૈયાર છે. રેકોર્ડ તપાસો, પછી સબમિટ કરો.` }),
  needs_input: (d) => {
    const n = num(d.count);
    return n > 0
      ? { title: `${n} રીડિંગ ભરવાના બાકી: ${nameOf(d)}`, body: `${called(d)} (${displayDate(d.dueDate)}) તમારા માટે તૈયાર છે: ${n} રીડિંગ ભરો, પછી સબમિટ કરો.` }
      : { title: `ભરવાનું બાકી: ${nameOf(d)}`, body: `${called(d)} (${displayDate(d.dueDate)}) માં તમારે માહિતી ભરવાની બાકી છે, પછી જ સબમિટ થશે.` };
  },
  due: (d) => ({ title: `આજે ભરવાનું: ${nameOf(d)}`, body: `${called(d)} (${displayDate(d.dueDate)}) ભરવાનું છે અને હજી શરૂ થયું નથી.` }),
  upcoming: (d) => ({ title: `આવનારું: ${nameOf(d)}`, body: `${called(d)} ${displayDate(d.dueDate)} ના રોજ ભરવાનું છે.` }),
  overdue: (d) => ({ title: `મોડું: ${nameOf(d)}`, body: `${called(d)} (${displayDate(d.dueDate)}) ${num(d.daysLate)} દિવસ મોડું છે. આજે જ ભરીને સબમિટ કરો.` }),
  verify: (d) => ({
    title: `ચકાસણી માટે: ${nameOf(d)}`,
    body: d.by ? `${clean(d.by)} એ ${called(d)} (${displayDate(d.dueDate)}) સબમિટ કર્યું છે. આ રેકોર્ડ તમારી ચકાસણીની રાહ જુએ છે.` : `${called(d)} (${displayDate(d.dueDate)}) તમારી ચકાસણીની રાહ જુએ છે.`,
  }),
  sent_back: (d) => {
    const why = clean(d.reason, 300);
    const what = `${called(d)} (${displayDate(d.dueDate)})`;
    const head = d.by ? `${clean(d.by)} એ ${what} પાછું મોકલ્યું` : `${what} પાછું મોકલવામાં આવ્યું`;
    return { title: `પાછું મોકલ્યું: ${nameOf(d)}`, body: `${head}${why ? `: "${why}"` : ""}. સુધારીને ફરી સબમિટ કરો.` };
  },
  boss_summary: (d) => {
    const t = summaryTotals(d);
    const title = d.part === "evening" ? "સાંજનો સારાંશ" : "સવારનો સારાંશ";
    if (t.r + t.n + t.v + t.s + t.o === 0) return { title, body: "કોઈ પણ મોડ્યુલમાં કંઈ બાકી નથી." };
    const worst = t.worst ? ` સૌથી વધુ મોડું: ${moduleName(t.worst.module, "gu")} (${t.worst.overdue}).` : "";
    return { title, body: `સબમિટ માટે તૈયાર: ${t.r}. ભરવાનું બાકી: ${t.n}. ચકાસણી બાકી: ${t.v}. આજે સબમિટ બાકી: ${t.s}. મોડું: ${t.o}.${worst}` };
  },
  escalation: (d) => {
    const who = clean(d.subject) || moduleName(d.module, "gu") || "એક વિભાગ";
    const parts = [num(d.late) ? `${num(d.late)} મોડા સબમિટ` : "", num(d.neverDone) ? `${num(d.neverDone)} ક્યારેય ભરાયા નથી` : ""].filter(Boolean);
    return { title: `એસ્કેલેશન: ${who}`, body: `${who}: છેલ્લા 30 દિવસમાં ${parts.length ? parts.join(" અને ") : "રેકોર્ડ પાછળ"}.` };
  },
  access_changed: (d) => {
    const what = clean(d.documentName) || moduleName(d.module, "gu") || "DCRS";
    const by = d.by ? `${clean(d.by)} એ તમારી ઍક્સેસ બદલી છે. ` : "";
    const level = (d.level ?? "").toLowerCase();
    const now = level === "none" ? `હવે ${what} માં તમારી કોઈ ઍક્સેસ નથી.` : `હવે ${what} માં તમારી ઍક્સેસ: ${LEVEL_NAMES[level]?.gu ?? level}.`;
    return { title: "તમારી ઍક્સેસ બદલાઈ છે", body: `${by}${now}` };
  },
};

const WORDS: Record<NotificationLanguage, Record<string, Words>> = { en: EN, hi: HI, gu: GU };

const FALLBACK: Record<NotificationLanguage, NotificationWords> = {
  en: { title: "DCRS", body: "Something needs you in DCRS." },
  hi: { title: "DCRS", body: "DCRS में आपके लिए कुछ काम है।" },
  gu: { title: "DCRS", body: "DCRS માં તમારા માટે કંઈક કામ છે." },
};

/** One notification in words, in the language asked (English for one not known). */
export function notificationWords(kind: string, data: WordsData | null | undefined, lang: NotificationLanguage | string = "en"): NotificationWords {
  const language: NotificationLanguage = isNotificationLanguage(lang) ? lang : "en";
  const words = WORDS[language][kind];
  return words ? words(data ?? {}) : FALLBACK[language];
}

// ---------------------------------------------------------------------------
// several at once, and the test push

/** "3 records need you", with the top three document names: what one push says for several items. */
export function groupWords(items: readonly { kind: string; data: WordsData | null | undefined }[], lang: NotificationLanguage | string = "en"): NotificationWords {
  const language: NotificationLanguage = isNotificationLanguage(lang) ? lang : "en";
  const n = items.length;
  if (n === 1) return notificationWords(items[0].kind, items[0].data, language);
  const names: string[] = [];
  for (const i of items) {
    const name = i.kind === "boss_summary" ? notificationWords(i.kind, i.data, language).title : nameOf(i.data ?? {}) || clean(i.data?.subject);
    if (name && !names.includes(name)) names.push(name);
    if (names.length === 3) break;
  }
  const more = n - Math.min(3, names.length);
  const list = names.join(", ");
  switch (language) {
    case "hi":
      return { title: `${n} रिकॉर्ड आपकी प्रतीक्षा में हैं`, body: `${list}${more > 0 ? ` और ${more} अन्य` : ""}।` };
    case "gu":
      return { title: `${n} રેકોર્ડ તમારી રાહ જુએ છે`, body: `${list}${more > 0 ? ` અને બીજા ${more}` : ""}.` };
    default:
      return { title: `${n} records need you`, body: `${list}${more > 0 ? ` and ${more} more` : ""}.` };
  }
}

/** What "Send me a test notification" sends. */
export function testWords(lang: NotificationLanguage | string = "en"): NotificationWords {
  switch (isNotificationLanguage(lang) ? lang : "en") {
    case "hi":
      return { title: "परीक्षण सूचना", body: "यह DCRS की परीक्षण सूचना है। सूचनाएँ इस फ़ोन तक पहुँच रही हैं।" };
    case "gu":
      return { title: "પરીક્ષણ સૂચના", body: "આ DCRS ની પરીક્ષણ સૂચના છે. સૂચનાઓ આ ફોન સુધી પહોંચે છે." };
    default:
      return { title: "Test notification", body: "This is a test notification from DCRS. Notifications reach this phone." };
  }
}
