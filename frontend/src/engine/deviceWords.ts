// WHERE EACH PERSON IS SIGNED IN, IN WORDS: ENGLISH, GUJARATI AND HINDI (REQUIREMENTS §106).
//
// The owner, 9-Oct-2026: "Superadmin can also see that where devices has logged in like one can login up to 2
// devices and that Superadmin can see easily like where the ids are logged in like with device name and category like
// it is a laptop/computer or mobile."
//
// The words the server answers with when a sign-in is refused because the account is already signed in on as many
// devices as it may be (403 `device-limit`), and when a device's session was ended (401 `session-ended`: the super
// admin signed it out, it was signed out, or it signed in again), in the language the request asks for (X-Language:
// the Mitra phone app sends the person's); and the names of a device's category and of where it is signed in, which
// the super admin's User access page shows (pages/AccessDashboardPage.tsx). The rules are backend/deviceSessions.ts.
//
// WITH NO IMPORTS, like engine/accessWords.ts: the server loads this file with Node's type stripping, so backend/ words
// its answers from it too. A device's own name ("Windows computer - Chrome", "iPhone - Safari", the phone's model) is
// a name, kept as it was made; only the two sentences a server writes in its place are said in the other languages.

export type DeviceLanguage = "en" | "gu" | "hi";

/** What kind of device a session is on: what the super admin reads first, with its icon. */
export type DeviceCategory = "computer" | "mobile" | "tablet";

/** Where a session was signed in: DCRS's website in a browser, the Mitra phone app, or another program through the DCRS API. */
export type SessionPlace = "website" | "phone-app" | "api";

/** Why a session ended: signed out by the person, by the super admin ("Sign out this device"), signed in again on the same device, or the account switched off. */
export type SessionEndReason = "signed-out" | "super-admin" | "replaced" | "account-off";

/** The code of a sign-in refused because the account is signed in on as many devices as it may be (403). */
export const DEVICE_LIMIT_CODE = "device-limit";

/** The code of a request whose session has been ended (401): the words say how and when. */
export const SESSION_ENDED_CODE = "session-ended";

/** The language a request asks its words in (X-Language: en, hi or gu), English otherwise. */
export function deviceLanguageOf(header: unknown): DeviceLanguage {
  return header === "hi" || header === "gu" ? header : "en";
}

export const CATEGORY_WORDS: Record<DeviceLanguage, Record<DeviceCategory, string>> = {
  en: { computer: "Computer", mobile: "Mobile phone", tablet: "Tablet" },
  gu: { computer: "કમ્પ્યુટર", mobile: "મોબાઇલ ફોન", tablet: "ટેબ્લેટ" },
  hi: { computer: "कंप्यूटर", mobile: "मोबाइल फ़ोन", tablet: "टैबलेट" },
};

export const PLACE_WORDS: Record<DeviceLanguage, Record<SessionPlace, string>> = {
  en: { website: "Website", "phone-app": "Mitra phone app", api: "Another program (the DCRS API)" },
  gu: { website: "વેબસાઇટ", "phone-app": "મિત્ર ફોન એપ", api: "બીજો પ્રોગ્રામ (DCRS API)" },
  hi: { website: "वेबसाइट", "phone-app": "मित्र फ़ोन ऐप", api: "दूसरा प्रोग्राम (DCRS API)" },
};

/** The name of a device whose session was started before devices were recorded (taken in once, at its first request after the change). */
export const BEFORE_DEVICES_NAME = "Signed in before devices were recorded";

/**
 * The name of a phone's session when the Mitra server could not say which phone: MITRA_SERVER_KEY is not set, or not
 * the same, on both servers. It is still listed as a mobile phone on the Mitra phone app (review of 12-Oct-2026).
 */
export const MITRA_UNNAMED_NAME = "A phone - its name is not known (set the same MITRA_SERVER_KEY on both servers)";

const SPECIAL_NAMES: Record<string, Record<DeviceLanguage, string>> = {
  [BEFORE_DEVICES_NAME]: {
    en: BEFORE_DEVICES_NAME,
    gu: "ઉપકરણોની નોંધ શરૂ થઈ તે પહેલાં સાઇન ઇન થયેલું",
    hi: "डिवाइस दर्ज होना शुरू होने से पहले साइन इन किया गया",
  },
  [MITRA_UNNAMED_NAME]: {
    en: MITRA_UNNAMED_NAME,
    gu: "એક ફોન - તેનું નામ ખબર નથી (બંને સર્વર પર એક જ MITRA_SERVER_KEY રાખો)",
    hi: "एक फ़ोन - उसका नाम पता नहीं (दोनों सर्वर पर एक ही MITRA_SERVER_KEY रखें)",
  },
};

/** A device's name in a language: its own name as it was made, or the server's sentence in that language. */
export function deviceNameIn(lang: DeviceLanguage, name: string): string {
  const special = SPECIAL_NAMES[name];
  return special ? special[lang] : name || (lang === "gu" ? "અજાણ્યું ઉપકરણ" : lang === "hi" ? "अनजान डिवाइस" : "An unknown device");
}

/** One device a refusal names: its name, where it is signed in, and since when ("09:02", or "08-Oct 17:40" for an earlier day). */
export interface NamedDevice {
  name: string;
  place: SessionPlace;
  since: string;
}

/** "A and B", "A, B and C", in the language's own word for "and". */
function listed(lang: DeviceLanguage, items: string[]): string {
  const and = lang === "gu" ? " અને " : lang === "hi" ? " और " : " and ";
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}${and}${items[items.length - 1]}`;
}

function oneDevice(lang: DeviceLanguage, d: NamedDevice): string {
  const name = deviceNameIn(lang, d.name);
  const place = PLACE_WORDS[lang][d.place] ?? PLACE_WORDS[lang].website;
  if (lang === "gu") return `${name} (${place}, ${d.since} થી)`;
  if (lang === "hi") return `${name} (${place}, ${d.since} से)`;
  return `${name} (${place}, since ${d.since})`;
}

/**
 * THE REFUSAL OF A SIGN-IN ON ONE DEVICE TOO MANY, naming the devices that hold the account's places and since when,
 * and what to do:
 *   "This account is already signed in on 2 devices: Windows computer - Chrome (Website, since 09:02) and Android
 *    phone - Chrome (Website, since 10:15). Sign out on one of them, or ask the super admin to sign one out."
 */
export function deviceLimitRefusal(lang: DeviceLanguage, devices: readonly NamedDevice[]): string {
  const n = devices.length;
  const list = listed(lang, devices.map((d) => oneDevice(lang, d)));
  if (lang === "gu") return `આ ખાતું પહેલેથી ${n} ઉપકરણો પર સાઇન ઇન છે: ${list}. તેમાંથી એક પર સાઇન આઉટ કરો, અથવા સુપર એડમિનને એક સાઇન આઉટ કરવા કહો.`;
  if (lang === "hi") return `यह खाता पहले से ${n} डिवाइस पर साइन इन है: ${list}। उनमें से एक पर साइन आउट करें, या सुपर एडमिन से एक को साइन आउट करने को कहें।`;
  return `This account is already signed in on ${n} device${n === 1 ? "" : "s"}: ${list}. Sign out on one of them, or ask the super admin to sign one out.`;
}

/**
 * WHY A DEVICE'S SESSION IS OVER, said to that device at its next request (401 `session-ended`), with the time it was
 * ended on the factory's clock ("14:05"). The website and the phone show it on the sign-in screen.
 */
export function sessionEndedWords(lang: DeviceLanguage, why: SessionEndReason | string | null, at: string): string {
  if (lang === "gu") {
    if (why === "super-admin") return `સુપર એડમિને ${at} વાગ્યે આ ઉપકરણને સાઇન આઉટ કર્યું. ચાલુ રાખવા ફરી સાઇન ઇન કરો.`;
    if (why === "replaced") return `આ ઉપકરણ પર ${at} વાગ્યે ફરી સાઇન ઇન થયું, એટલે આ જૂનું સાઇન ઇન પૂરું થયું. ફરી સાઇન ઇન કરો.`;
    if (why === "account-off") return `${at} વાગ્યે ખાતું બંધ થયું ત્યારે આ ઉપકરણ સાઇન આઉટ થયું. ખાતું ફરી ચાલુ હોય તો સાઇન ઇન કરો; નહીં તો સુપર એડમિનને પૂછો.`;
    return `આ સાઇન ઇન ${at} વાગ્યે સાઇન આઉટ થયું. ફરી સાઇન ઇન કરો.`;
  }
  if (lang === "hi") {
    if (why === "super-admin") return `सुपर एडमिन ने ${at} बजे इस डिवाइस को साइन आउट किया। जारी रखने के लिए फिर से साइन इन करें।`;
    if (why === "replaced") return `इस डिवाइस पर ${at} बजे फिर से साइन इन हुआ, इसलिए यह पुराना साइन इन खत्म हुआ। फिर से साइन इन करें।`;
    if (why === "account-off") return `${at} बजे खाता बंद हुआ तब यह डिवाइस साइन आउट हुआ। खाता फिर से चालू हो तो साइन इन करें; नहीं तो सुपर एडमिन से पूछें।`;
    return `यह साइन इन ${at} बजे साइन आउट हुआ। फिर से साइन इन करें।`;
  }
  if (why === "super-admin") return `The super admin signed this device out at ${at}. Sign in again to carry on.`;
  if (why === "replaced") return `This device signed in again at ${at}, so this older sign-in was ended. Sign in again.`;
  if (why === "account-off") return `This device was signed out at ${at}, when the account was switched off. If it is on again, sign in again; if not, ask the super admin.`;
  return `This sign-in was signed out at ${at}. Sign in again.`;
}

/** A 401 `session-ended` answer as the server sends it (backend/deviceSessions.ts SessionEndedBody), read loosely. */
interface EndedAnswer {
  error?: unknown;
  why?: unknown;
  endedAtText?: unknown;
}

/**
 * The words of an ended session in a language, from the server's answer: rebuilt from `why` and the time, so the
 * website says them in the language its screens are in; the server's own words when the answer is not one of ours.
 */
export function sessionEndedWordsOf(lang: DeviceLanguage, body: unknown): string | null {
  const b = (body && typeof body === "object" ? body : {}) as EndedAnswer;
  if (typeof b.why === "string" && typeof b.endedAtText === "string") return sessionEndedWords(lang, b.why, b.endedAtText);
  return typeof b.error === "string" && b.error ? b.error : null;
}

/** A 403 `device-limit` answer (backend/deviceSessions.ts DeviceLimitBody), read loosely. */
interface LimitAnswer {
  error?: unknown;
  devices?: unknown;
}

/** The words of a sign-in refused on one device too many, in a language, from the server's answer (as sessionEndedWordsOf). */
export function deviceLimitWordsOf(lang: DeviceLanguage, body: unknown): string | null {
  const b = (body && typeof body === "object" ? body : {}) as LimitAnswer;
  const list = Array.isArray(b.devices) ? (b.devices as { name?: unknown; place?: unknown; sinceText?: unknown }[]) : null;
  if (list && list.length > 0 && list.every((d) => d && typeof d.name === "string" && typeof d.sinceText === "string")) {
    return deviceLimitRefusal(
      lang,
      list.map((d) => ({ name: String(d.name), place: (d.place === "phone-app" || d.place === "api" ? d.place : "website") as SessionPlace, since: String(d.sinceText) }))
    );
  }
  return typeof b.error === "string" && b.error ? b.error : null;
}

// ---------------------------------------------------------------------------
// the super admin's view: "Signed in on" (pages/AccessDashboardPage.tsx)

const VIEW_EN = {
  heading: "Signed in on",
  intro: "Every device each account is signed in on now: the website in a browser, or the Mitra phone app. A device that signs in again takes its own place, never a second one.",
  limit: "An account may be signed in on at most {limit} devices at once; one more is refused, naming the devices, until one is signed out. The super admin is not held to it.",
  noLimit: "This server sets no limit on the devices an account is signed in on (DCRS_MAX_DEVICES=off).",
  phonesNotNamed:
    "MITRA_SERVER_KEY is not set on this server, so a phone signed in through the Mitra phone app is listed as a mobile phone, but not by its own name, model or address: the address shown is the Mitra server's. Set the same key on both servers.",
  none: "Nobody is signed in on any device now.",
  unknown: "The devices could not be read just now. Refresh to try again.",
  colPerson: "Person",
  colDevice: "Device",
  colWhere: "Where",
  colSince: "Signed in",
  colLastUsed: "Last used",
  since: "since {time}",
  lastUsed: "last used {time}",
  from: "from {address}",
  signOut: "Sign out this device",
  thisDevice: "This device: yours",
  confirmTitle: "Sign out {name}'s device?",
  confirmBody:
    "{device} ({place}) is signed out at once. Its next request goes back to the sign-in screen, saying the super admin signed it out. Nothing is deleted: everything saved stays. It is written in the activity log.",
  confirm: "Sign out this device",
  cancel: "No, leave it",
  done: "{name}'s device {device} is signed out.",
  devices: "{n} devices",
  device: "1 device",
};

type ViewKey = keyof typeof VIEW_EN;

const VIEW_WORDS: Record<DeviceLanguage, Record<ViewKey, string>> = {
  en: VIEW_EN,
  gu: {
    heading: "આ ઉપકરણો પર સાઇન ઇન",
    intro: "દરેક ખાતું અત્યારે જે જે ઉપકરણ પર સાઇન ઇન છે તે: બ્રાઉઝરમાં વેબસાઇટ, કે મિત્ર ફોન એપ. ફરી સાઇન ઇન કરતું ઉપકરણ પોતાની જ જગ્યા લે છે, બીજી નહીં.",
    limit: "એક ખાતું એકસાથે વધુમાં વધુ {limit} ઉપકરણો પર સાઇન ઇન રહી શકે; એક વધુ ઉપકરણ, ઉપકરણોના નામ સાથે, ના પાડવામાં આવે છે, જ્યાં સુધી એક સાઇન આઉટ ન થાય. સુપર એડમિનને આ લાગુ પડતું નથી.",
    noLimit: "આ સર્વર ખાતા દીઠ ઉપકરણોની કોઈ મર્યાદા રાખતું નથી (DCRS_MAX_DEVICES=off).",
    phonesNotNamed:
      "આ સર્વર પર MITRA_SERVER_KEY નથી, એટલે મિત્ર ફોન એપથી સાઇન ઇન થયેલો ફોન મોબાઇલ ફોન તરીકે દેખાય છે, પણ તેના પોતાના નામ, મોડેલ કે સરનામાથી નહીં: દેખાતું સરનામું મિત્ર સર્વરનું છે. બંને સર્વર પર એક જ કી રાખો.",
    none: "અત્યારે કોઈ પણ ઉપકરણ પર કોઈ સાઇન ઇન નથી.",
    unknown: "ઉપકરણો અત્યારે વાંચી શકાયા નથી. ફરી પ્રયાસ કરવા રિફ્રેશ કરો.",
    colPerson: "વ્યક્તિ",
    colDevice: "ઉપકરણ",
    colWhere: "ક્યાં",
    colSince: "સાઇન ઇન",
    colLastUsed: "છેલ્લે વપરાયું",
    since: "{time} થી",
    lastUsed: "છેલ્લે વપરાયું {time}",
    from: "{address} પરથી",
    signOut: "આ ઉપકરણ સાઇન આઉટ કરો",
    thisDevice: "આ ઉપકરણ: તમારું",
    confirmTitle: "{name} નું ઉપકરણ સાઇન આઉટ કરવું છે?",
    confirmBody:
      "{device} ({place}) તરત સાઇન આઉટ થશે. તેની આગલી વિનંતી સાઇન ઇન સ્ક્રીન પર જશે અને કહેશે કે સુપર એડમિને સાઇન આઉટ કર્યું. કશું ડિલીટ થતું નથી: સાચવેલું બધું રહે છે. તે પ્રવૃત્તિ લોગમાં લખાય છે.",
    confirm: "આ ઉપકરણ સાઇન આઉટ કરો",
    cancel: "ના, રહેવા દો",
    done: "{name} નું ઉપકરણ {device} સાઇન આઉટ થયું.",
    devices: "{n} ઉપકરણો",
    device: "1 ઉપકરણ",
  },
  hi: {
    heading: "इन डिवाइस पर साइन इन",
    intro: "हर खाता अभी जिन जिन डिवाइस पर साइन इन है: ब्राउज़र में वेबसाइट, या मित्र फ़ोन ऐप। फिर से साइन इन करने वाला डिवाइस अपनी ही जगह लेता है, दूसरी नहीं।",
    limit: "एक खाता एक साथ ज़्यादा से ज़्यादा {limit} डिवाइस पर साइन इन रह सकता है; एक और डिवाइस, डिवाइस के नाम के साथ, मना किया जाता है, जब तक एक साइन आउट न हो। सुपर एडमिन पर यह लागू नहीं होता।",
    noLimit: "यह सर्वर खाते के डिवाइस की कोई सीमा नहीं रखता (DCRS_MAX_DEVICES=off)।",
    phonesNotNamed:
      "इस सर्वर पर MITRA_SERVER_KEY नहीं है, इसलिए मित्र फ़ोन ऐप से साइन इन हुआ फ़ोन मोबाइल फ़ोन के रूप में दिखता है, पर अपने नाम, मॉडल या पते से नहीं: दिखने वाला पता मित्र सर्वर का है। दोनों सर्वर पर एक ही की रखें।",
    none: "अभी किसी भी डिवाइस पर कोई साइन इन नहीं है।",
    unknown: "डिवाइस अभी पढ़े नहीं जा सके। फिर से कोशिश करने के लिए रिफ़्रेश करें।",
    colPerson: "व्यक्ति",
    colDevice: "डिवाइस",
    colWhere: "कहाँ",
    colSince: "साइन इन",
    colLastUsed: "आख़िरी बार",
    since: "{time} से",
    lastUsed: "आख़िरी बार {time}",
    from: "{address} से",
    signOut: "यह डिवाइस साइन आउट करें",
    thisDevice: "यह डिवाइस: आपका",
    confirmTitle: "{name} का डिवाइस साइन आउट करें?",
    confirmBody:
      "{device} ({place}) तुरंत साइन आउट होगा। उसका अगला अनुरोध साइन इन स्क्रीन पर जाएगा और बताएगा कि सुपर एडमिन ने साइन आउट किया। कुछ भी डिलीट नहीं होता: सहेजा हुआ सब रहता है। यह गतिविधि लॉग में लिखा जाता है।",
    confirm: "यह डिवाइस साइन आउट करें",
    cancel: "नहीं, रहने दें",
    done: "{name} का डिवाइस {device} साइन आउट हुआ।",
    devices: "{n} डिवाइस",
    device: "1 डिवाइस",
  },
};

/** One of the super admin's view's sentences in a language, with its {names} filled in. */
export function deviceViewWord(lang: DeviceLanguage, key: ViewKey, vars: Record<string, string | number> = {}): string {
  return (VIEW_WORDS[lang] ?? VIEW_EN)[key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
