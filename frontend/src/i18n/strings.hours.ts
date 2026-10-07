// The words of REQUIREMENTS §84's addendum of 6-Oct-2026, in English and Gujarati (hoursWord below).
// `gu` is typed against `en`: a missing Gujarati string is a compile error. Gujarati is used where the
// app's own Gujarati shows — ગુજરાતી chosen and Google's translator out of reach (i18n/googleTranslate.ts
// uiLanguageFor); with the translator on, the English is what Google turns into Gujarati, as everywhere.
//
// THE HOURS ARE THE STAFF'S: the warning before a session ends — for staff at the
// close of their working hours, for the super admin at the end of the day
// (midnight), since the hours never hold him (components/auth/SessionClock.tsx) —
// and the User access page's line under the hours (pages/AccessDashboardPage.tsx).
// The hours' own sentences are built in engine/workingHoursCore.ts, in both
// languages, from the same parts.
const en = {
  // The warning ten minutes before a session ends (components/auth/SessionClock.tsx); {time} is "6:20 pm".
  "hours.closing.staff": "Your working hours end at {time}",
  "hours.closing.staffRest": ", the close of today's staff hours. You will be signed out in {left} — finish what you are working on now. They start again on the next working day.",
  "hours.closing.admin": "Your session for today ends at {time}",
  "hours.closing.adminRest":
    ". You will be signed out in {left} — finish what you are typing; everything already saved is kept. Sign in again straight away to keep working: the staff's hours do not hold you.",
  "hours.closing.minute": "about a minute",
  "hours.closing.minutes": "{n} minutes",
  "hours.closing.ok": "OK",
  // Under the hours on the super admin's User access page (pages/AccessDashboardPage.tsx).
  "hours.access.held":
    "Outside them only the super admin can sign in or use DCRS, and every session but the super admin's ends at the close of staff hours. Times are the factory's ({zone}). The hours and the holidays are set in Master Data.",
  "hours.access.notHeld":
    "This server holds nobody to the hours: it was started with DCRS_WORKING_HOURS=off, as the test servers are. The hours and the holidays are set in Master Data.",
};

const gu: Record<keyof typeof en, string> = {
  "hours.closing.staff": "તમારા કામના કલાકો {time} વાગ્યે પૂરા થાય છે",
  "hours.closing.staffRest": ", આજના સ્ટાફના કલાકોનો અંત. {left}માં તમને સાઇન આઉટ કરવામાં આવશે — તમે જે કામ કરી રહ્યા છો તે હમણાં પૂરું કરો. તે ફરી આગલા કામકાજના દિવસે શરૂ થશે.",
  "hours.closing.admin": "આજનું તમારું સત્ર {time} વાગ્યે પૂરું થાય છે",
  "hours.closing.adminRest":
    ". {left}માં તમને સાઇન આઉટ કરવામાં આવશે — તમે જે લખી રહ્યા છો તે પૂરું કરો; જે સાચવેલું છે તે રહેશે. કામ ચાલુ રાખવા તરત ફરી સાઇન ઇન કરો: સ્ટાફના કલાકો તમને લાગુ પડતા નથી.",
  "hours.closing.minute": "લગભગ એક મિનિટ",
  "hours.closing.minutes": "{n} મિનિટ",
  "hours.closing.ok": "બરાબર",
  "hours.access.held":
    "તે સિવાય ફક્ત સુપર એડમિન જ સાઇન ઇન કરી શકે કે DCRS વાપરી શકે, અને સુપર એડમિન સિવાય દરેકનું સત્ર સ્ટાફના કલાકો પૂરા થતાં પૂરું થાય છે. સમય ફેક્ટરીનો છે ({zone}). કલાકો અને રજાઓ Master Data માં નક્કી થાય છે.",
  "hours.access.notHeld":
    "આ સર્વર કોઈને કલાકોમાં બાંધતું નથી: તે DCRS_WORKING_HOURS=off સાથે શરૂ થયું છે, જેમ ટેસ્ટ સર્વર થાય છે. કલાકો અને રજાઓ Master Data માં નક્કી થાય છે.",
};

export const HOURS_STRINGS = { en, gu };

export type HoursWordKey = keyof typeof en;

/**
 * One of these sentences in a language, with its {names} filled in. Its own
 * small table rather than i18n/strings.ts's, so that the warning can be said by
 * components/auth/SessionClock.tsx, which is drawn outside the app's store.
 */
export function hoursWord(lang: "en" | "gu", key: HoursWordKey, vars: Record<string, string | number> = {}): string {
  const template = (lang === "gu" ? gu : en)[key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
