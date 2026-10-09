// The words of the notifications in the website (REQUIREMENTS §97): the bell's list and the Notifications page
// (components/layout/NotificationBell.tsx, pages/NotificationsPage.tsx). Spread into i18n/strings.ts (en and gu);
// `gu` is typed against `en`, so a missing Gujarati string is a compile error.
//
// The notifications' own titles and bodies are NOT here: the server words them, in the language the page asks for, from
// the facts the ledger keeps (frontend/src/engine/notificationText.ts, one module for the phone, the bell and the page).
// These are the page's own words around them. No pronoun names a person: the name, or "you".
const en = {
  "notif.title": "Notifications",
  "notif.intro": "What is waiting for you, by day: records ready for your OK, readings to enter, records due, late or waiting for verification. Open one to go to it.",
  "notif.introBoss": "What is waiting across the plant, by day, with the morning and evening summaries by module and the escalations.",
  "notif.unread": "{n} unread",
  "notif.unreadOne": "1 unread",
  "notif.allRead": "All read",
  "notif.markAllRead": "Mark all read",
  "notif.seeAll": "See all notifications",
  "notif.showMore": "Show older",
  "notif.loading": "Loading the notifications…",
  "notif.error": "The notifications could not be read just now. Try again in a moment.",
  "notif.retry": "Try again",
  "notif.empty": "Nothing here yet. When a record of yours is ready, due, late or waiting for you, it shows here and in the bell.",
  "notif.emptyOpen": "Nothing open: every notification is done or read.",
  "notif.today": "Today",
  "notif.yesterday": "Yesterday",
  "notif.filterAll": "All",
  "notif.filterOpen": "Still open",
  "notif.done": "Done",
  "notif.open": "Open",
  "notif.bell.heading": "Notifications",
  "notif.bell.none": "No new notifications.",
  "notif.summary.module": "Module",
  "notif.summary.ready": "Ready",
  "notif.summary.needsInput": "Readings to enter",
  "notif.summary.awaiting": "Waiting for verification",
  "notif.summary.notSubmitted": "Not yet submitted",
  "notif.summary.overdue": "Late",
};

const gu: Record<keyof typeof en, string> = {
  "notif.title": "સૂચનાઓ",
  "notif.intro": "દિવસ પ્રમાણે તમારા માટે શું બાકી છે: તમારી મંજૂરી માટે તૈયાર રેકોર્ડ, ભરવાના રીડિંગ, બાકી, મોડા અથવા ચકાસણીની રાહ જોતા રેકોર્ડ. ત્યાં જવા માટે કોઈ એક ખોલો.",
  "notif.introBoss": "દિવસ પ્રમાણે આખા પ્લાન્ટમાં શું બાકી છે, સવાર અને સાંજના મોડ્યુલ પ્રમાણેના સારાંશ અને એસ્કેલેશન સાથે.",
  "notif.unread": "{n} વાંચ્યા નથી",
  "notif.unreadOne": "1 વાંચી નથી",
  "notif.allRead": "બધી વાંચી લીધી",
  "notif.markAllRead": "બધી વાંચી લીધી તરીકે નોંધો",
  "notif.seeAll": "બધી સૂચનાઓ જુઓ",
  "notif.showMore": "જૂની બતાવો",
  "notif.loading": "સૂચનાઓ લાવી રહ્યા છીએ…",
  "notif.error": "સૂચનાઓ અત્યારે વાંચી શકાઈ નથી. થોડી વારમાં ફરી પ્રયાસ કરો.",
  "notif.retry": "ફરી પ્રયાસ કરો",
  "notif.empty": "અહીં હજુ કંઈ નથી. તમારો કોઈ રેકોર્ડ તૈયાર, બાકી, મોડો અથવા તમારી રાહ જોતો હશે ત્યારે તે અહીં અને ઘંટડીમાં દેખાશે.",
  "notif.emptyOpen": "કંઈ ખુલ્લું નથી: દરેક સૂચના પૂરી થઈ ગઈ છે અથવા વાંચી લીધી છે.",
  "notif.today": "આજે",
  "notif.yesterday": "ગઈકાલે",
  "notif.filterAll": "બધી",
  "notif.filterOpen": "હજુ ખુલ્લી",
  "notif.done": "પૂરું",
  "notif.open": "ખોલો",
  "notif.bell.heading": "સૂચનાઓ",
  "notif.bell.none": "કોઈ નવી સૂચના નથી.",
  "notif.summary.module": "મોડ્યુલ",
  "notif.summary.ready": "તૈયાર",
  "notif.summary.needsInput": "ભરવાના રીડિંગ",
  "notif.summary.awaiting": "ચકાસણીની રાહ",
  "notif.summary.notSubmitted": "હજુ જમા નથી",
  "notif.summary.overdue": "મોડા",
};

export const NOTIFICATION_STRINGS = { en, gu };
