// The words of the minus score (REQUIREMENTS §92), spread into i18n/strings.ts (en and gu).
// `gu` is typed against `en`: a missing Gujarati string is a compile error.
//
// THE MINUS SCORE ON THE PERFORMANCE DASHBOARD (pages/PerformancePage.tsx):
// 10 off for each record never done, beside the score out of 100. The figure
// itself is never in these words: it is written by engine/performance.ts
// formatMinus, with a true minus sign, and kept out of translation.
const en = {
  "perf.minus.label": "Minus score",
  "perf.minus.rule":
    "every record never done takes 10 off, so 10 records due and 8 done is −20. A record submitted late still counts as done, a record not due yet takes nothing off, and nothing missed is 0. It sits beside the score out of 100 and changes nothing in it.",
  "perf.minus.missed": "{n} never done, 10 off each",
  "perf.minus.missedOne": "1 never done, 10 off",
  "perf.minus.none": "Nothing missed",
  "perf.minus.openToday.one": "1 record is still open today: it takes 10 off if it is not submitted today.",
  "perf.minus.openToday.many": "{n} records are still open today: each takes 10 off if it is not submitted today.",
  "perf.minus.openTodayShort": "{n} still open today",
};

const gu: Record<keyof typeof en, string> = {
  "perf.minus.label": "માઇનસ સ્કોર",
  "perf.minus.rule":
    "ક્યારેય ન થયેલો દરેક રેકોર્ડ 10 ઘટાડે છે, એટલે 10 રેકોર્ડમાંથી 8 થયા હોય તો −20. મોડો જમા થયેલો રેકોર્ડ પણ થયેલો ગણાય, જેની તારીખ હજી આવી નથી એવો રેકોર્ડ કંઈ ઘટાડતો નથી, અને કંઈ ન છૂટ્યું હોય તો 0. તે 100 માંથી મળતા સ્કોરની બાજુમાં છે અને તેમાં કંઈ બદલતો નથી.",
  "perf.minus.missed": "{n} ક્યારેય ન થયા, દરેકના 10 ઓછા",
  "perf.minus.missedOne": "1 ક્યારેય ન થયો, 10 ઓછા",
  "perf.minus.none": "કંઈ છૂટ્યું નથી",
  "perf.minus.openToday.one": "1 રેકોર્ડ આજે હજુ ખુલ્લો છે: આજે જમા ન થાય તો 10 ઘટશે.",
  "perf.minus.openToday.many": "{n} રેકોર્ડ આજે હજુ ખુલ્લા છે: આજે જમા ન થાય તો દરેકના 10 ઘટશે.",
  "perf.minus.openTodayShort": "{n} આજે હજુ ખુલ્લા",
};

export const SCORE_STRINGS = { en, gu };
