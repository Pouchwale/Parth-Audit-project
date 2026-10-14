// The words of the Activity Log's chips (pages/ActivityLogPage.tsx; the owner,
// 14-Oct-2026: "i want logs in superadmin panel like which user what does and
// in which modules and documents"), spread into i18n/strings.ts (en and gu).
// `gu` and `hi` are typed against `en`: a missing string is a compile error.
//
// The Hindi is kept here beside the other two for the day the screens are
// offered in Hindi (REQUIREMENTS §89: today's screens are English or Gujarati;
// Mitra answers in Hindi through the model). Plain, everyday words; never an
// em dash in the Hindi.
const en = {
  "activity.chips.lead": "Press a chip to keep the log to one person, one module, one document or one action. The chips combine, and “Show older” and the CSV keep to them.",
  "activity.chips.person": "Who",
  "activity.chips.everybody": "Everybody",
  "activity.chips.module": "Module",
  "activity.chips.allModules": "All modules",
  "activity.chips.action": "What",
  "activity.chips.allActions": "All actions",
  "activity.chips.document": "Document",
  "activity.chips.documentPlaceholder": "A format number, F/QC/01…",
  "activity.chips.documentKept": "Kept to",
  "activity.chips.clear": "Clear the chips",
  "activity.chips.count": "{n} lines match",
  "activity.chips.countOne": "1 line matches",
  "activity.chips.countNone": "No line matches",
  "activity.chips.counting": "Counting…",
};

const gu: Record<keyof typeof en, string> = {
  "activity.chips.lead": "લોગને એક વ્યક્તિ, એક મોડ્યુલ, એક દસ્તાવેજ કે એક કામ પૂરતો રાખવા ચિપ દબાવો. ચિપો સાથે લાગે છે, અને “જૂનું બતાવો” તથા CSV તેને જ અનુસરે છે.",
  "activity.chips.person": "કોણ",
  "activity.chips.everybody": "બધા",
  "activity.chips.module": "મોડ્યુલ",
  "activity.chips.allModules": "બધા મોડ્યુલ",
  "activity.chips.action": "શું",
  "activity.chips.allActions": "બધાં કામ",
  "activity.chips.document": "દસ્તાવેજ",
  "activity.chips.documentPlaceholder": "ફોર્મેટ નંબર, F/QC/01…",
  "activity.chips.documentKept": "પૂરતું",
  "activity.chips.clear": "ચિપો હટાવો",
  "activity.chips.count": "{n} લાઇન મળી",
  "activity.chips.countOne": "1 લાઇન મળી",
  "activity.chips.countNone": "કોઈ લાઇન મળી નહીં",
  "activity.chips.counting": "ગણાય છે…",
};

const hi: Record<keyof typeof en, string> = {
  "activity.chips.lead": "लॉग को एक व्यक्ति, एक मॉड्यूल, एक दस्तावेज़ या एक काम तक रखने के लिए चिप दबाएँ। चिप साथ में लगती हैं, और \"पुराना दिखाएँ\" और CSV उन्हीं पर रहते हैं।",
  "activity.chips.person": "कौन",
  "activity.chips.everybody": "सब",
  "activity.chips.module": "मॉड्यूल",
  "activity.chips.allModules": "सभी मॉड्यूल",
  "activity.chips.action": "क्या",
  "activity.chips.allActions": "सभी काम",
  "activity.chips.document": "दस्तावेज़",
  "activity.chips.documentPlaceholder": "फ़ॉर्मेट नंबर, F/QC/01…",
  "activity.chips.documentKept": "तक",
  "activity.chips.clear": "चिप हटाएँ",
  "activity.chips.count": "{n} लाइनें मिलीं",
  "activity.chips.countOne": "1 लाइन मिली",
  "activity.chips.countNone": "कोई लाइन नहीं मिली",
  "activity.chips.counting": "गिनती हो रही है…",
};

export const ACTIVITY_STRINGS = { en, gu, hi };

export type ActivityWordKey = keyof typeof en;
