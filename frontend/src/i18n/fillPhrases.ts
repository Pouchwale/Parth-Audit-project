// WHAT MITRA SAYS ABOUT A FILL, in English, Hindi and Gujarati (REQUIREMENTS §94).
//
// The owner, 7-Oct-2026: "chatbot is open documents but it is not filling
// record ... make sure i want my results and output without any mistake". A
// fill is now worked out by DCRS's own engine (engine/fillRequest.ts,
// engine/fillPlan.ts), not by the model, and what Mitra says about it is said
// here: fixed sentences, in the language and script of the person's latest
// message, the same on the website and on the phone (the phone's server takes
// DCRS's `say` as its reply). No model call is made to word a reply, so the
// words can never claim a fill that did not happen.
//
// Labels, format numbers and stored values are put in exactly as DCRS prints
// them ({doc}, {label}, {value}); only the sentence around them is translated.
// Plain words for factory staff, no em dashes, no emoji.

export type FillLanguage = "en" | "hi" | "gu";

type Phrase = Record<FillLanguage, string>;

const PHRASES = {
  confirmWrite: {
    en: "Shall I write these {n} on {doc} of {date}?",
    hi: "क्या मैं {doc} ({date}) में ये {n} भर दूँ?",
    gu: "શું હું {doc} ({date}) માં આ {n} ભરી દઉં?",
  },
  wrote: {
    en: "Done. I wrote {n} on {doc} of {date}:",
    hi: "हो गया। {doc} ({date}) में {n} भरे:",
    gu: "થઈ ગયું. {doc} ({date}) માં {n} ભર્યા:",
  },
  boxes: {
    en: "{n} boxes",
    hi: "{n} खाने",
    gu: "{n} ખાના",
  },
  oneBox: {
    en: "1 box",
    hi: "1 खाना",
    gu: "1 ખાનું",
  },
  started: {
    en: "I started a new {doc} for {date}.",
    hi: "{date} के लिए नया {doc} शुरू किया।",
    gu: "{date} માટે નવું {doc} શરૂ કર્યું.",
  },
  nothingChanged: {
    en: "Nothing changed: {doc} of {date} already shows these values.",
    hi: "कुछ नहीं बदला: {doc} ({date}) में ये विवरण पहले से हैं।",
    gu: "કંઈ બદલાયું નહીં: {doc} ({date}) માં આ વિગતો પહેલેથી છે.",
  },
  alreadyFilled: {
    en: "{doc} of {date} is already filled (prepared {time}): nothing changed.",
    hi: "{doc} ({date}) पहले से भरा है (ऐप ने {time} पर तैयार किया): कुछ नहीं बदला।",
    gu: "{doc} ({date}) પહેલેથી ભરેલું છે (ઍપે {time} વાગ્યે તૈયાર કર્યું): કંઈ બદલાયું નહીં.",
  },
  alreadyComplete: {
    en: "{doc} of {date} is already filled in: nothing changed.",
    hi: "{doc} ({date}) पहले से भरा है: कुछ नहीं बदला।",
    gu: "{doc} ({date}) પહેલેથી ભરેલું છે: કંઈ બદલાયું નહીં.",
  },
  estimatesLeft: {
    en: "The other boxes still hold the app's estimates (prepared {time}). Check them before you submit.",
    hi: "बाकी खानों में अभी भी ऐप के अनुमान हैं ({time} पर तैयार)। जमा करने से पहले जाँच लें।",
    gu: "બાકીના ખાનામાં હજી ઍપના અંદાજ છે ({time} વાગ્યે તૈયાર). જમા કરતાં પહેલાં તપાસી લો.",
  },
  preparedOffer: {
    en: "{doc} of {date} already holds the app's estimates (prepared {time}). They are not checked yet. Shall we go through them, or will you tell me the right values?",
    hi: "{doc} ({date}) में पहले से ऐप के अनुमान हैं ({time} पर तैयार)। ये अभी जाँचे नहीं गए। क्या हम इन्हें एक एक करके देखें, या आप सही विवरण बताएँगे?",
    gu: "{doc} ({date}) માં પહેલેથી ઍપના અંદાજ છે ({time} વાગ્યે તૈયાર). હજી તપાસ્યા નથી. શું આપણે એક એક કરીને જોઈએ, કે તમે સાચી વિગતો કહેશો?",
  },
  blankOffer: {
    en: "{doc} of {date} is blank. How shall I fill it?",
    hi: "{doc} ({date}) खाली है। इसे कैसे भरूँ?",
    gu: "{doc} ({date}) ખાલી છે. એને કેવી રીતે ભરું?",
  },
  partOffer: {
    en: "{doc} of {date} is partly filled. How shall I fill the rest?",
    hi: "{doc} ({date}) थोड़ा भरा है। बाकी कैसे भरूँ?",
    gu: "{doc} ({date}) થોડું ભરેલું છે. બાકીનું કેવી રીતે ભરું?",
  },
  chipAsk: { en: "Ask me each box", hi: "हर खाना पूछो", gu: "દરેક ખાનું પૂછો" },
  chipCheckEstimates: { en: "Check the estimates with me", hi: "अनुमान मेरे साथ जाँचो", gu: "અંદાજ મારી સાથે તપાસો" },
  chipTellValues: { en: "I will tell you the values", hi: "मैं विवरण बताऊँगा", gu: "હું વિગતો કહીશ" },
  chipCopy: { en: "Copy from {date}", hi: "{date} से कॉपी करो", gu: "{date} માંથી નકલ કરો" },
  chipSample: { en: "Sample data (made up)", hi: "नमूना डेटा (बनावटी)", gu: "નમૂનાની વિગતો (બનાવટી)" },
  chipOpen: { en: "Open the record", hi: "रिकॉर्ड खोलो", gu: "રેકોર્ડ ખોલો" },
  tellValues: {
    en: "Tell me the values, for example: {example}",
    hi: "विवरण बताइए, जैसे: {example}",
    gu: "વિગતો કહો, જેમ કે: {example}",
  },
  allowance: {
    en: "I can't read those values just now: Mitra's allowance for today is used up. Nothing was opened or changed. Say them like {example}, or tap Ask me each box.",
    hi: "अभी मैं ये विवरण नहीं पढ़ सकता: Mitra की आज की सीमा खत्म हो गई है। कुछ खोला या बदला नहीं गया। इन्हें ऐसे बोलिए: {example}, या हर खाना पूछो दबाइए।",
    gu: "હમણાં હું આ વિગતો વાંચી શકતો નથી: Mitra ની આજની મર્યાદા પૂરી થઈ ગઈ છે. કંઈ ખોલ્યું કે બદલ્યું નથી. આ રીતે કહો: {example}, અથવા દરેક ખાનું પૂછો દબાવો.",
  },
  busy: {
    en: "Mitra is busy for about a minute. Nothing was opened or changed. Try again in a minute.",
    hi: "Mitra लगभग एक मिनट के लिए व्यस्त है। कुछ खोला या बदला नहीं गया। एक मिनट बाद फिर कोशिश कीजिए।",
    gu: "Mitra લગભગ એક મિનિટ માટે વ્યસ્ત છે. કંઈ ખોલ્યું કે બદલ્યું નથી. એક મિનિટ પછી ફરી પ્રયત્ન કરો.",
  },
  waiting: {
    en: "Waiting for Mitra... {s} s",
    hi: "Mitra का इंतज़ार... {s} सेकंड",
    gu: "Mitra ની રાહ... {s} સેકન્ડ",
  },
  needsModel: {
    en: "Reading these values needs Mitra's model, which can't be reached here just now. Nothing was opened or changed. Say them like {example}, or tap Ask me each box.",
    hi: "इन विवरणों को पढ़ने के लिए Mitra का मॉडल चाहिए, जो अभी यहाँ नहीं मिल रहा। कुछ खोला या बदला नहीं गया। इन्हें ऐसे बोलिए: {example}, या हर खाना पूछो दबाइए।",
    gu: "આ વિગતો વાંચવા Mitra નું મૉડલ જોઈએ, જે હમણાં અહીં મળતું નથી. કંઈ ખોલ્યું કે બદલ્યું નથી. આ રીતે કહો: {example}, અથવા દરેક ખાનું પૂછો દબાવો.",
  },
  noValues: {
    en: "I couldn't find a value to write in that. Nothing was changed. Say it like {example}.",
    hi: "इसमें मुझे लिखने लायक कोई विवरण नहीं मिला। कुछ नहीं बदला। ऐसे बोलिए: {example}।",
    gu: "આમાં મને લખવા જેવી કોઈ વિગત મળી નહીં. કંઈ બદલાયું નથી. આ રીતે કહો: {example}.",
  },
  leftOutUnsaid: {
    en: "I left {label} out: you didn't say it.",
    hi: "{label} नहीं भरा: आपने यह नहीं बताया।",
    gu: "{label} ભર્યું નથી: તમે એ કહ્યું નથી.",
  },
  leftAsFine: {
    en: "{label} left as fine: you said everything is fine.",
    hi: "{label} ठीक माना: आपने कहा सब ठीक है।",
    gu: "{label} બરાબર રાખ્યું: તમે કહ્યું બધું બરાબર છે.",
  },
  notWritten: {
    en: "Not written:",
    hi: "नहीं भरा:",
    gu: "ભર્યું નથી:",
  },
  stillBlank: {
    en: "Still blank: {list}.",
    hi: "अभी खाली: {list}।",
    gu: "હજી ખાલી: {list}.",
  },
  findingsQuestion: {
    en: "{n} of these will be recorded as a finding or out of limits:\n{lines}\nShall I write them?",
    hi: "इनमें से {n} कमी या सीमा से बाहर के रूप में दर्ज होंगे:\n{lines}\nक्या मैं इन्हें भर दूँ?",
    gu: "આમાંથી {n} ખામી અથવા મર્યાદા બહાર તરીકે નોંધાશે:\n{lines}\nશું હું એ ભરી દઉં?",
  },
  chipYesWrite: { en: "Yes, write them", hi: "हाँ, भर दो", gu: "હા, ભરી દો" },
  chipNo: { en: "No", hi: "नहीं", gu: "ના" },
  declined: {
    en: "Okay, I wrote nothing. {doc} of {date} is as it was.",
    hi: "ठीक है, मैंने कुछ नहीं भरा। {doc} ({date}) जैसा था वैसा है।",
    gu: "બરાબર, મેં કંઈ ભર્યું નથી. {doc} ({date}) જેવું હતું એવું જ છે.",
  },
  locked: {
    en: "{doc} of {date} is {status}, so I changed nothing. To correct it, reopen it for correction first (Edit on the record, with a reason), then tell me the values again.",
    hi: "{doc} ({date}) {status} है, इसलिए मैंने कुछ नहीं बदला। सुधारने के लिए पहले इसे सुधार के लिए खोलिए (रिकॉर्ड पर Edit, कारण के साथ), फिर विवरण दोबारा बताइए।",
    gu: "{doc} ({date}) {status} છે, એટલે મેં કંઈ બદલ્યું નથી. સુધારવા માટે પહેલાં એને સુધારા માટે ખોલો (રેકોર્ડ પર Edit, કારણ સાથે), પછી વિગતો ફરી કહો.",
  },
  whichRecord: {
    en: "There are {n} records of {doc} for {date}. Which one?",
    hi: "{date} के लिए {doc} के {n} रिकॉर्ड हैं। कौन सा?",
    gu: "{date} માટે {doc} ના {n} રેકોર્ડ છે. કયો?",
  },
  whichDocument: {
    en: "Which form do you mean?",
    hi: "आप कौन सा फॉर्म कह रहे हैं?",
    gu: "તમે કયું ફોર્મ કહો છો?",
  },
  noDocument: {
    en: "I couldn't tell which form to fill. Name it, for example {example}.",
    hi: "मैं समझ नहीं पाया कि कौन सा फॉर्म भरना है। उसका नाम बताइए, जैसे {example}।",
    gu: "કયું ફોર્મ ભરવું એ હું સમજી શક્યો નહીં. એનું નામ કહો, જેમ કે {example}.",
  },
  whichDay: {
    en: "\"{word}\" can mean yesterday or tomorrow. Which day?",
    hi: "\"{word}\" का मतलब बीता कल या आने वाला कल हो सकता है। कौन सा दिन?",
    gu: "\"{word}\" નો અર્થ ગઈકાલે કે આવતીકાલે બંને થાય. કયો દિવસ?",
  },
  chipYesterday: { en: "Yesterday ({date})", hi: "बीता कल ({date})", gu: "ગઈકાલે ({date})" },
  chipTomorrow: { en: "Tomorrow ({date})", hi: "आने वाला कल ({date})", gu: "આવતીકાલે ({date})" },
  sampleDone: {
    en: "Filled {doc} of {date} with sample data ({n}): realistic, but made up. Check every value before you submit. Nothing was submitted.",
    hi: "{doc} ({date}) नमूना डेटा से भरा ({n}): असली जैसा, पर बनावटी। जमा करने से पहले हर विवरण जाँच लें। कुछ जमा नहीं किया।",
    gu: "{doc} ({date}) નમૂનાની વિગતોથી ભર્યું ({n}): સાચા જેવું, પણ બનાવટી. જમા કરતાં પહેલાં દરેક વિગત તપાસો. કંઈ જમા કર્યું નથી.",
  },
  noSample: {
    en: "{doc} is kept as issued, so there is no sample data for it.",
    hi: "{doc} जैसा जारी हुआ वैसा रखा जाता है, इसलिए इसके लिए नमूना डेटा नहीं है।",
    gu: "{doc} જેવું બહાર પડ્યું એવું જ રખાય છે, એટલે એના માટે નમૂનાની વિગતો નથી.",
  },
  copied: {
    en: "Copied {n} from the record of {from} onto {doc} of {date}. Check every value before you submit. Nothing was submitted.",
    hi: "{from} के रिकॉर्ड से {doc} ({date}) में {n} कॉपी किए। जमा करने से पहले हर विवरण जाँच लें। कुछ जमा नहीं किया।",
    gu: "{from} ના રેકોર્ડમાંથી {doc} ({date}) માં {n} નકલ કર્યા. જમા કરતાં પહેલાં દરેક વિગત તપાસો. કંઈ જમા કર્યું નથી.",
  },
  noCopySource: {
    en: "There is no checked earlier record of {doc} to copy from.",
    hi: "{doc} का कोई जाँचा हुआ पुराना रिकॉर्ड नहीं है जिससे कॉपी करूँ।",
    gu: "{doc} નો કોઈ તપાસેલો જૂનો રેકોર્ડ નથી જેમાંથી નકલ કરું.",
  },
  walkThrough: {
    en: "Let's fill {doc} of {date} together. I'll ask one box at a time.",
    hi: "चलिए {doc} ({date}) साथ में भरते हैं। मैं एक बार में एक खाना पूछूँगा।",
    gu: "ચાલો {doc} ({date}) સાથે ભરીએ. હું એક વખતે એક ખાનું પૂછીશ.",
  },
  submitted: {
    en: "Submitted for verification, as you asked.",
    hi: "आपके कहने पर सत्यापन के लिए जमा किया।",
    gu: "તમે કહ્યું એ પ્રમાણે ચકાસણી માટે જમા કર્યું.",
  },
  submitBlocked: {
    en: "I didn't submit it yet: {why}",
    hi: "अभी जमा नहीं किया: {why}",
    gu: "હજી જમા કર્યું નથી: {why}",
  },
  notSubmitted: {
    en: "Nothing was submitted.",
    hi: "कुछ जमा नहीं किया।",
    gu: "કંઈ જમા કર્યું નથી.",
  },
  outOfLimits: {
    en: "out of limits",
    hi: "सीमा से बाहर",
    gu: "મર્યાદા બહાર",
  },
  finding: {
    en: "finding",
    hi: "कमी",
    gu: "ખામી",
  },
  estimate: {
    en: "estimate",
    hi: "अनुमान",
    gu: "અંદાજ",
  },
  noRecordYet: {
    en: "There is no {doc} for {date} yet; it will be started.",
    hi: "{date} के लिए अभी {doc} नहीं है; नया शुरू होगा।",
    gu: "{date} માટે હજી {doc} નથી; નવું શરૂ થશે.",
  },
};

export type FillPhraseKey = keyof typeof PHRASES;
export const FILL_PHRASES: Record<FillPhraseKey, Phrase> = PHRASES;

/** A phrase in the person's language, with {name} filled in. A missing name is left as written. */
export function fillSay(lang: FillLanguage, key: FillPhraseKey, vars: Record<string, string | number> = {}): string {
  const phrase: Phrase = FILL_PHRASES[key];
  const text = phrase[lang] ?? phrase.en;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** "3 boxes" / "1 box", in the person's language. */
export function boxesSay(lang: FillLanguage, n: number): string {
  return n === 1 ? fillSay(lang, "oneBox") : fillSay(lang, "boxes", { n });
}
