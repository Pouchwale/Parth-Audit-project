// THE REVIEW SCREEN'S WORDS for changing a record's lines (DCRS's REQUIREMENTS §113), in English, Hindi and Gujarati:
// the language is the one Mitra replies in (NotificationLanguage, as the alerts are worded). Plain functions with no
// imports, so the server's tests can check them (server/test/phone-app.test.ts). What a line is called and what DCRS
// would do come from DCRS itself, in that language (X-Language); these are the words around them.
import type { NotificationLanguage } from '@shared/api';

export interface ReviewWords {
  /** "Add a line", "Add a rodent catch": the noun comes from DCRS. */
  addLine(noun: string): string;
  deleteLine: string;
  clearBox: string;
  /** The sheet's title for each operation. */
  addTitle(noun: string): string;
  deleteTitle: string;
  clearTitle: string;
  /** The buttons. */
  add: string;
  delete: string;
  clear: string;
  cancel: string;
  undo: string;
  /** "Checking with DCRS…" while the dry run runs. */
  checking: string;
  /** Above the lines a dry run says it would take off or clear. */
  willDelete: string;
  willClear: string;
  willAdd: string;
  /** The record is signed off: the reason box's label and hint. */
  reopens(status: string): string;
  reasonLabel: string;
  reasonHint: string;
  /** After an add: the line's words, and that Undo is offered for a minute. */
  added(words: string): string;
  undoFor: string;
  undone: string;
  deleted(words: string): string;
  cleared(words: string): string;
  /** A box of a new line that is empty is left blank: DCRS writes only what the person says. */
  leaveBlank: string;
  /** How many lines can go on at once. */
  atMost(n: number): string;
  nothingWouldChange: string;
}

const WORDS: Record<NotificationLanguage, ReviewWords> = {
  en: {
    addLine: (noun) => `Add a ${noun}`,
    deleteLine: 'Delete this line',
    clearBox: 'Clear',
    addTitle: (noun) => `Add a ${noun}`,
    deleteTitle: 'Delete this line?',
    clearTitle: 'Clear this box?',
    add: 'Add',
    delete: 'Delete',
    clear: 'Clear',
    cancel: 'Cancel',
    undo: 'Undo',
    checking: 'Checking with DCRS…',
    willDelete: 'DCRS will delete:',
    willClear: 'DCRS will clear:',
    willAdd: 'DCRS will add:',
    reopens: (status) => `This record is ${status}. The change reopens it for correction, and it will need submitting and verifying again.`,
    reasonLabel: 'Why it is corrected',
    reasonHint: 'Written on the record’s history.',
    added: (words) => `Added: ${words}`,
    undoFor: 'Undo takes it off again (for a minute).',
    undone: 'Taken off again.',
    deleted: (words) => `Deleted: ${words}`,
    cleared: (words) => `Cleared: ${words}`,
    leaveBlank: 'Leave empty what you did not see: nothing is written for you.',
    atMost: (n) => `Up to ${n} at once.`,
    nothingWouldChange: 'Nothing on the form would change.',
  },
  hi: {
    addLine: (noun) => `${noun} जोड़ें`,
    deleteLine: 'यह लाइन हटाएँ',
    clearBox: 'खाली करें',
    addTitle: (noun) => `${noun} जोड़ें`,
    deleteTitle: 'यह लाइन हटाएँ?',
    clearTitle: 'यह बॉक्स खाली करें?',
    add: 'जोड़ें',
    delete: 'हटाएँ',
    clear: 'खाली करें',
    cancel: 'रद्द करें',
    undo: 'वापस लें',
    checking: 'DCRS से जाँच हो रही है…',
    willDelete: 'DCRS यह हटाएगा:',
    willClear: 'DCRS यह खाली करेगा:',
    willAdd: 'DCRS यह जोड़ेगा:',
    reopens: (status) => `यह रिकॉर्ड ${status} है। बदलाव इसे सुधार के लिए फिर खोलेगा, और इसे फिर से सबमिट और वेरिफ़ाई करना होगा।`,
    reasonLabel: 'सुधार का कारण',
    reasonHint: 'रिकॉर्ड के इतिहास में लिखा जाएगा।',
    added: (words) => `जोड़ा: ${words}`,
    undoFor: '“वापस लें” इसे फिर हटा देता है (एक मिनट तक)।',
    undone: 'फिर हटा दिया।',
    deleted: (words) => `हटाया: ${words}`,
    cleared: (words) => `खाली किया: ${words}`,
    leaveBlank: 'जो नहीं देखा उसे खाली छोड़ें: आपके लिए कुछ नहीं लिखा जाता।',
    atMost: (n) => `एक बार में ${n} तक।`,
    nothingWouldChange: 'फ़ॉर्म में कुछ नहीं बदलेगा।',
  },
  gu: {
    addLine: (noun) => `${noun} ઉમેરો`,
    deleteLine: 'આ લાઇન કાઢી નાખો',
    clearBox: 'ખાલી કરો',
    addTitle: (noun) => `${noun} ઉમેરો`,
    deleteTitle: 'આ લાઇન કાઢી નાખું?',
    clearTitle: 'આ બૉક્સ ખાલી કરું?',
    add: 'ઉમેરો',
    delete: 'કાઢી નાખો',
    clear: 'ખાલી કરો',
    cancel: 'રદ કરો',
    undo: 'પાછું લો',
    checking: 'DCRS સાથે તપાસ થાય છે…',
    willDelete: 'DCRS આ કાઢી નાખશે:',
    willClear: 'DCRS આ ખાલી કરશે:',
    willAdd: 'DCRS આ ઉમેરશે:',
    reopens: (status) => `આ રેકોર્ડ ${status} છે. ફેરફાર તેને સુધારા માટે ફરી ખોલશે, અને તેને ફરીથી સબમિટ અને વેરિફાય કરવો પડશે.`,
    reasonLabel: 'સુધારાનું કારણ',
    reasonHint: 'રેકોર્ડના ઇતિહાસમાં લખાશે.',
    added: (words) => `ઉમેર્યું: ${words}`,
    undoFor: '“પાછું લો” તેને ફરી કાઢી નાખે છે (એક મિનિટ સુધી).',
    undone: 'ફરી કાઢી નાખ્યું.',
    deleted: (words) => `કાઢી નાખ્યું: ${words}`,
    cleared: (words) => `ખાલી કર્યું: ${words}`,
    leaveBlank: 'જે જોયું નથી તે ખાલી રાખો: તમારા વતી કંઈ લખાતું નથી.',
    atMost: (n) => `એક સાથે વધુમાં વધુ ${n}.`,
    nothingWouldChange: 'ફોર્મમાં કંઈ બદલાશે નહીં.',
  },
};

/** The Review screen's words for the record's lines, in the language the app is read in. */
export function reviewWords(language: NotificationLanguage | undefined): ReviewWords {
  return WORDS[language ?? 'en'] ?? WORDS.en;
}
