// The words of the minus score (REQUIREMENTS §92), spread into i18n/strings.ts (en and gu).
// `gu` is typed against `en`: a missing Gujarati string is a compile error.
//
// THE MINUS SCORE ON THE PERFORMANCE DASHBOARD (pages/PerformancePage.tsx), and
// every person's on the administrator's dashboard (components/common/TeamScoreCard.tsx):
// the share of the records due that were never done, as an FMS sheet counts it
// (8 of 10 done is −20%), beside the score out of 100. The figure itself is never
// in these words: it is written by engine/performance.ts formatMinus, with a true
// minus sign, and kept out of translation.
//
// THE GUJARATI HERE IS WHAT THE PAGE SHOWS IN GUJARATI, ALWAYS. These words are
// never handed to Google Translate: Google made "takes 10 off" into "10 runs"
// (a cricket score) and "each takes a 10 discount" (the review of 8-Oct-2026).
// With Gujarati chosen the page reads them from this table and marks them
// translate="no" (PerformancePage.tsx useMinusWords), whether Google is
// translating the rest of the page or could not be reached.
const en = {
  "perf.minus.label": "Minus score",
  "perf.minus.rule":
    "the share of the records due that were never done, as an FMS sheet counts it: 10 due and 8 done is −20%, and so is 20 due and 16 done. A record submitted late still counts as done, a record not due yet takes nothing off, and nothing missed is 0%. It sits beside the score out of 100 and changes nothing in it.",
  "perf.minus.missed": "{done} of {due} done, {n} never done",
  "perf.minus.missedOne": "{done} of {due} done, 1 never done",
  "perf.minus.none": "Nothing missed",
  "perf.minus.openToday.one": "1 record is still open today: if it is not submitted today, it counts as never done.",
  "perf.minus.openToday.many": "{n} records are still open today: each one not submitted today counts as never done.",
  "perf.minus.openTodayShort": "{n} still open today",
  // Every person's minus score on the administrator's and the super admin's dashboard (9-Oct-2026).
  "perf.team.title": "Minus score of every person",
  "perf.team.rule": "As an FMS sheet counts it: 8 of 10 records done is −20%, and 0% means nothing was missed. Counted from the records, by the Performance Scorecard's own rules.",
  "perf.team.plant": "The whole plant",
  "perf.team.done": "{done} of {due} done",
  "perf.team.nothingDue": "No record fell due",
  "perf.team.notScored": "Answers for no document, so there is no score",
  "perf.team.open": "Open the Performance dashboard",
  "perf.team.loading": "Counting every person's records…",
  "perf.team.unreadable": "The list of people could not be read just now ({why}). The Performance dashboard shows the same scores.",
};

const gu: Record<keyof typeof en, string> = {
  "perf.minus.label": "માઇનસ સ્કોર",
  "perf.minus.rule":
    "ભરવાના રેકોર્ડમાંથી કેટલા ટકા ક્યારેય ન થયા, એફએમએસ શીટની રીતે: 10 માંથી 8 થયા હોય તો −20%, અને 20 માંથી 16 થયા હોય તો પણ −20%. મોડો જમા થયેલો રેકોર્ડ પણ થયેલો ગણાય, જેની તારીખ હજી આવી નથી એવો રેકોર્ડ કંઈ ઘટાડતો નથી, અને કંઈ ન છૂટ્યું હોય તો 0%. તે 100 માંથી મળતા સ્કોરની બાજુમાં છે અને તેમાં કંઈ બદલતો નથી.",
  "perf.minus.missed": "{due} માંથી {done} થયા, {n} ક્યારેય ન થયા",
  "perf.minus.missedOne": "{due} માંથી {done} થયા, 1 ક્યારેય ન થયો",
  "perf.minus.none": "કંઈ છૂટ્યું નથી",
  "perf.minus.openToday.one": "1 રેકોર્ડ આજે હજુ ખુલ્લો છે: આજે જમા ન થાય તો તે ક્યારેય ન થયેલો ગણાશે.",
  "perf.minus.openToday.many": "{n} રેકોર્ડ આજે હજુ ખુલ્લા છે: આજે જમા ન થાય એ દરેક ક્યારેય ન થયેલો ગણાશે.",
  "perf.minus.openTodayShort": "{n} આજે હજુ ખુલ્લા",
  "perf.team.title": "દરેક વ્યક્તિનો માઇનસ સ્કોર",
  "perf.team.rule": "એફએમએસ શીટની રીતે: 10 માંથી 8 રેકોર્ડ થયા હોય તો −20%, અને 0% એટલે કંઈ છૂટ્યું નથી. રેકોર્ડ પરથી, પરફોર્મન્સ સ્કોરકાર્ડના પોતાના નિયમો પ્રમાણે ગણેલું.",
  "perf.team.plant": "આખો પ્લાન્ટ",
  "perf.team.done": "{due} માંથી {done} થયા",
  "perf.team.nothingDue": "કોઈ રેકોર્ડ ભરવાનો નહોતો",
  "perf.team.notScored": "કોઈ દસ્તાવેજની જવાબદારી નથી, એટલે સ્કોર નથી",
  "perf.team.open": "પરફોર્મન્સ ડેશબોર્ડ ખોલો",
  "perf.team.loading": "દરેક વ્યક્તિના રેકોર્ડ ગણાય છે…",
  "perf.team.unreadable": "લોકોની યાદી અત્યારે વાંચી શકાઈ નથી ({why}). પરફોર્મન્સ ડેશબોર્ડ પર એ જ સ્કોર દેખાય છે.",
};

export const SCORE_STRINGS = { en, gu };
