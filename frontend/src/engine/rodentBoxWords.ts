// THE WORDS OF THE RODENT BOX PICKER, IN ENGLISH, GUJARATI AND HINDI (REQUIREMENTS §104).
//
// The picker on F/HR/17's check points 8 and 9 (components/records/RodentBoxPicker.tsx), Master Data → Rodent
// Stations (components/master/RodentStations.tsx), and the line the engine host gives the phone with the list
// (engineHost/entry.ts layoutOf: noteChoicesSaid, in the language the app is read in). The website shows English or
// Gujarati (its uiLang); Hindi is for the phone, which reads it in Hindi. Box numbers, area names and "Master Data →
// Rodent Stations" stay as they are in every language: they are what is painted on the box and written on the screen.
// Plain, everyday words; never an em dash.
import { formatDisplayDate } from "../utils/date";
import type { BoxList } from "./rodentBoxes";

export type BoxWordsLanguage = "en" | "gu" | "hi";

interface PickerWords {
  /** Check point 9's picker: what it picks. */
  boxLabel: string;
  /** Check point 8's picker: a box, or a place. */
  placeLabel: string;
  typeNumber: string;
  nonePicked: string;
  /** {box}: a picked box Master Data's list does not have. */
  notOnList: string;
  /** {box} */
  remove: string;
  /** {n} */
  showAll: string;
  /** {q} */
  noMatch: string;
  otherPlace: string;
  otherPlaceHint: string;
  /** {n}: the list is Master Data's. */
  fromStations: string;
  /** {first}, {last}: worked out from today's check point 4. */
  fromToday: string;
  /** {first}, {last}, {date}: worked out from the last confirmed record's check point 4. */
  fromLast: string;
  /** No list yet. */
  fromNone: string;
}

interface StationWords {
  lead: string;
  noneYet: string;
  /** {n}, {active} */
  count: string;
  colId: string;
  colLocation: string;
  colType: string;
  colStatus: string;
  addRow: string;
  bulkTitle: string;
  bulkLead: string;
  prefix: string;
  from: string;
  to: string;
  location: string;
  type: string;
  later: string;
  /** {first}, {last} */
  bulkButton: string;
  /** {n} */
  added: string;
  /** {n} */
  kept: string;
  badPrefix: string;
  badRange: string;
  /** {n} */
  tooMany: string;
  /** {id} */
  idTaken: string;
  idEmpty: string;
  /** {n} */
  showMore: string;
  removeAsk: string;
  removeYes: string;
  removeNo: string;
}

export const RODENT_BOX_WORDS: Record<BoxWordsLanguage, PickerWords & { stations: StationWords }> = {
  en: {
    boxLabel: "Rodent box no.",
    placeLabel: "Location",
    typeNumber: "Type the box number",
    nonePicked: "No box picked yet",
    notOnList: "{box} is not on the rodent box list (Master Data → Rodent Stations)",
    remove: "Take {box} off",
    showAll: "Show all {n}",
    noMatch: "No box {q} on the list",
    otherPlace: "Other location",
    otherPlaceHint: "An area, or your own words",
    fromStations: "{n} boxes from Master Data → Rodent Stations.",
    fromToday: "Box numbers {first} to {last} from today's trap count (check point 4); Master Data → Rodent Stations holds the plant's own list.",
    fromLast: "Box numbers {first} to {last} from the trap count of {date} (check point 4); Master Data → Rodent Stations holds the plant's own list.",
    fromNone: "No box list yet: give check point 4 (the number of traps), or enter the plant's boxes in Master Data → Rodent Stations. Until then, write the box number.",
    stations: {
      lead: "The boxes F/HR/17 offers on check points 8 and 9 when they are answered Yes, the Active ones only. The Station ID is the number painted on the box.",
      noneYet:
        "No Rodent Bait Station list was in the papers supplied (the Dec-2023 GAP report says the numbering was missing). Until the boxes are entered here, check points 8 and 9 offer RC-1 to RC-<check point 4's count>.",
      count: "{n} boxes, {active} of them Active.",
      colId: "Station ID",
      colLocation: "Location",
      colType: "Type",
      colStatus: "Status",
      addRow: "Add Row",
      bulkTitle: "Add RC-1 to RC-N",
      bulkLead: "Adds the boxes in one go, Active. A box already on the list is left as it is.",
      prefix: "Prefix",
      from: "From",
      to: "To",
      location: "Location",
      type: "Type",
      later: "Not yet known",
      bulkButton: "Add {first} to {last}",
      added: "{n} boxes added.",
      kept: "{n} already on the list were left as they are.",
      badPrefix: "The prefix is letters only, such as RC.",
      badRange: "From and To are whole numbers from 1, From not after To.",
      tooMany: "At most {n} boxes at a time.",
      idTaken: "{id} is already on the list: each box has its own Station ID.",
      idEmpty: "A Station ID cannot be empty.",
      showMore: "Show {n} more",
      removeAsk: "Delete this row",
      removeYes: "Delete",
      removeNo: "Keep",
    },
  },
  gu: {
    boxLabel: "ઉંદર બોક્સ નં.",
    placeLabel: "સ્થળ",
    typeNumber: "બોક્સ નંબર લખો",
    nonePicked: "હજુ કોઈ બોક્સ પસંદ કર્યું નથી",
    notOnList: "{box} ઉંદર બોક્સની યાદીમાં નથી (Master Data → Rodent Stations)",
    remove: "{box} કાઢો",
    showAll: "બધાં {n} બતાવો",
    noMatch: "યાદીમાં {q} નંબરનું બોક્સ નથી",
    otherPlace: "બીજું સ્થળ",
    otherPlaceHint: "કોઈ વિસ્તાર, અથવા તમારા શબ્દોમાં",
    fromStations: "Master Data → Rodent Stations માંથી {n} બોક્સ.",
    fromToday: "બોક્સ નંબર {first} થી {last}, આજની ટ્રેપની સંખ્યા (ચેક પોઇન્ટ 4) પરથી; પ્લાન્ટની પોતાની યાદી Master Data → Rodent Stations માં રહે છે.",
    fromLast: "બોક્સ નંબર {first} થી {last}, {date} ની ટ્રેપની સંખ્યા (ચેક પોઇન્ટ 4) પરથી; પ્લાન્ટની પોતાની યાદી Master Data → Rodent Stations માં રહે છે.",
    fromNone: "હજુ બોક્સની યાદી નથી: ચેક પોઇન્ટ 4 (ટ્રેપની સંખ્યા) ભરો, અથવા Master Data → Rodent Stations માં પ્લાન્ટનાં બોક્સ ઉમેરો. ત્યાં સુધી બોક્સ નંબર લખો.",
    stations: {
      lead: "ચેક પોઇન્ટ 8 અને 9 નો જવાબ હા હોય ત્યારે F/HR/17 આ બોક્સ બતાવે છે, ફક્ત Active હોય તે. Station ID એ બોક્સ પર લખેલો નંબર છે.",
      noneYet:
        "મળેલા કાગળોમાં Rodent Bait Station ની યાદી નહોતી (Dec-2023 ના GAP રિપોર્ટ મુજબ નંબર લખેલા નહોતા). બોક્સ અહીં ઉમેરાય ત્યાં સુધી ચેક પોઇન્ટ 8 અને 9 RC-1 થી RC-<ચેક પોઇન્ટ 4 ની સંખ્યા> બતાવે છે.",
      count: "{n} બોક્સ, તેમાંથી {active} Active.",
      colId: "Station ID",
      colLocation: "સ્થળ",
      colType: "પ્રકાર",
      colStatus: "સ્થિતિ",
      addRow: "લાઇન ઉમેરો",
      bulkTitle: "RC-1 થી RC-N ઉમેરો",
      bulkLead: "બધાં બોક્સ એકસાથે, Active તરીકે ઉમેરે છે. યાદીમાં પહેલેથી હોય તે બોક્સ જેમ છે તેમ રહે છે.",
      prefix: "શરૂઆતના અક્ષર",
      from: "થી",
      to: "સુધી",
      location: "સ્થળ",
      type: "પ્રકાર",
      later: "હજુ ખબર નથી",
      bulkButton: "{first} થી {last} ઉમેરો",
      added: "{n} બોક્સ ઉમેર્યાં.",
      kept: "યાદીમાં પહેલેથી હતાં તે {n} જેમ હતાં તેમ રાખ્યાં.",
      badPrefix: "શરૂઆતમાં ફક્ત અક્ષર, જેમ કે RC.",
      badRange: "થી અને સુધી 1 કે તેથી વધુ પૂર્ણ સંખ્યા છે, અને થી એ સુધી પછી નહીં.",
      tooMany: "એક વખતે વધુમાં વધુ {n} બોક્સ.",
      idTaken: "{id} યાદીમાં પહેલેથી છે: દરેક બોક્સનો Station ID અલગ હોય છે.",
      idEmpty: "Station ID ખાલી ન રાખી શકાય.",
      showMore: "વધુ {n} બતાવો",
      removeAsk: "આ લાઇન કાઢો",
      removeYes: "કાઢો",
      removeNo: "રાખો",
    },
  },
  hi: {
    boxLabel: "चूहा बॉक्स नं.",
    placeLabel: "जगह",
    typeNumber: "बॉक्स नंबर लिखें",
    nonePicked: "अभी कोई बॉक्स नहीं चुना",
    notOnList: "{box} चूहा बॉक्स की सूची में नहीं है (Master Data → Rodent Stations)",
    remove: "{box} हटाएँ",
    showAll: "सभी {n} दिखाएँ",
    noMatch: "सूची में {q} नंबर का बॉक्स नहीं है",
    otherPlace: "दूसरी जगह",
    otherPlaceHint: "कोई एरिया, या अपने शब्दों में",
    fromStations: "Master Data → Rodent Stations से {n} बॉक्स।",
    fromToday: "बॉक्स नंबर {first} से {last}, आज की ट्रैप गिनती (चेक पॉइंट 4) से; प्लांट की अपनी सूची Master Data → Rodent Stations में रहती है।",
    fromLast: "बॉक्स नंबर {first} से {last}, {date} की ट्रैप गिनती (चेक पॉइंट 4) से; प्लांट की अपनी सूची Master Data → Rodent Stations में रहती है।",
    fromNone: "अभी बॉक्स की सूची नहीं है: चेक पॉइंट 4 (ट्रैप की गिनती) भरें, या Master Data → Rodent Stations में प्लांट के बॉक्स जोड़ें। तब तक बॉक्स नंबर लिखें।",
    stations: {
      lead: "चेक पॉइंट 8 और 9 का जवाब हाँ होने पर F/HR/17 ये बॉक्स दिखाता है, केवल Active वाले। Station ID बॉक्स पर लिखा नंबर है।",
      noneYet:
        "मिले कागज़ों में Rodent Bait Station की सूची नहीं थी (Dec-2023 की GAP रिपोर्ट के अनुसार नंबर लिखे नहीं थे)। जब तक बॉक्स यहाँ नहीं जुड़ते, चेक पॉइंट 8 और 9 RC-1 से RC-<चेक पॉइंट 4 की गिनती> दिखाते हैं।",
      count: "{n} बॉक्स, उनमें से {active} Active.",
      colId: "Station ID",
      colLocation: "जगह",
      colType: "प्रकार",
      colStatus: "स्थिति",
      addRow: "लाइन जोड़ें",
      bulkTitle: "RC-1 से RC-N जोड़ें",
      bulkLead: "सभी बॉक्स एक साथ, Active के रूप में जोड़ता है। सूची में पहले से जो बॉक्स है, वह जैसा है वैसा रहता है।",
      prefix: "शुरू के अक्षर",
      from: "से",
      to: "तक",
      location: "जगह",
      type: "प्रकार",
      later: "अभी पता नहीं",
      bulkButton: "{first} से {last} जोड़ें",
      added: "{n} बॉक्स जोड़े गए।",
      kept: "सूची में पहले से थे वे {n} जैसे थे वैसे रखे गए।",
      badPrefix: "शुरू में केवल अक्षर, जैसे RC.",
      badRange: "से और तक 1 या उससे बड़ी पूरी संख्या हैं, और से, तक के बाद नहीं।",
      tooMany: "एक बार में ज़्यादा से ज़्यादा {n} बॉक्स।",
      idTaken: "{id} सूची में पहले से है: हर बॉक्स का Station ID अलग होता है।",
      idEmpty: "Station ID खाली नहीं रह सकता।",
      showMore: "और {n} दिखाएँ",
      removeAsk: "यह लाइन हटाएँ",
      removeYes: "हटाएँ",
      removeNo: "रखें",
    },
  },
};

/** A sentence of the table above with its {names} filled in. */
export function boxWords(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** Where the list came from, in small words: shown under the picker, and given to the phone with the list. */
export function boxListSentence(list: BoxList, lang: BoxWordsLanguage): string {
  const w = RODENT_BOX_WORDS[lang] ?? RODENT_BOX_WORDS.en;
  const first = list.choices[0]?.id ?? "";
  const last = list.choices[list.choices.length - 1]?.id ?? "";
  switch (list.source) {
    case "stations":
      return boxWords(w.fromStations, { n: list.choices.length });
    case "today":
      return boxWords(w.fromToday, { first, last });
    case "last":
      return boxWords(w.fromLast, { first, last, date: list.date ? formatDisplayDate(list.date) : "" });
    default:
      return w.fromNone;
  }
}
