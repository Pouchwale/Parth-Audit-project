// THE SYSTEM SECTION IS THE SUPER ADMIN'S (REQUIREMENTS §116).
//
// The owner, 15-Oct-2026: "remove last part of System where report, master data, activity, performance and other is
// store from all id accept Superadmin". The sidebar's System group — Reports, Master Data, the Activity Log, the
// Performance Scorecard, Insights, Demo Mode where the server has it, and the super admin's own Users & Access, Master
// list, User access and Database overview — is shown to the super admin (role admin) only, and each page refuses
// anybody else who reaches it by its address (components/common/SuperAdminOnly.tsx), in the screens' language. Mitra
// refuses to open one for a staff account in the same words (engine/mitraTools.ts navigate), in the language asked.
//
// What staff keep: their own Dashboard with their own score card (§92), their modules and documents, Search, Mitra,
// the notifications and their profile.
//
// WITH NO IMPORTS (not even a type), like engine/accountWords.ts: the server loads this file with Node's type stripping
// (backend/engineHost.ts). Plain words; in Hindi and Gujarati never an em dash.

export type SystemLanguage = "en" | "gu" | "hi";

/** The pages of the System section, by the first segment of their address. */
export type SystemPage = "reports" | "master-data" | "activity" | "performance" | "insights" | "demo" | "users" | "master-list" | "access" | "database-overview";

const PAGES: readonly SystemPage[] = ["reports", "master-data", "activity", "performance", "insights", "demo", "users", "master-list", "access", "database-overview"];

/** The System page an address opens ("/reports/2026/9/summary" is Reports), or null for any other page. */
export function superAdminPageOf(route: string): SystemPage | null {
  const root = String(route ?? "").replace(/^#/, "").split("/").filter(Boolean)[0] ?? "";
  return (PAGES as readonly string[]).includes(root) ? (root as SystemPage) : null;
}

/** Whether this role may open the System section's pages: the super admin alone. */
export const maySeeSystemSection = (role: string | null | undefined): boolean => role === "admin";

const EN = {
  title: `Only the super admin can open this`,
  // The page's own line: what it is, and what the person keeps.
  page: `{page} is the super admin's. Ask the super admin if you need something from it; your own Dashboard, documents and records are still yours.`,
  // Mitra's one line, instead of opening the page.
  mitra: `Only the super admin can open {page}.`,
  "name.reports": `Reports`,
  "name.master-data": `Master Data`,
  "name.activity": `The Activity Log`,
  "name.performance": `The Performance Scorecard`,
  "name.insights": `Insights`,
  "name.demo": `Demo Mode`,
  "name.users": `Users & Access`,
  "name.master-list": `The master list of who does what`,
  "name.access": `User access`,
  "name.database-overview": `The Database overview`,
};

type SystemKey = keyof typeof EN;

const GU: Record<SystemKey, string> = {
  title: `આ ફક્ત સુપર એડમિન ખોલી શકે છે`,
  page: `{page} ફક્ત સુપર એડમિનનું છે. તેમાંથી કંઈ જોઈએ તો સુપર એડમિનને કહો; તમારું ડેશબોર્ડ, દસ્તાવેજો અને રેકોર્ડ તમારા જ રહે છે.`,
  mitra: `{page} ફક્ત સુપર એડમિન ખોલી શકે છે.`,
  "name.reports": `રિપોર્ટ`,
  "name.master-data": `માસ્ટર ડેટા`,
  "name.activity": `ગતિવિધિ લૉગ`,
  "name.performance": `પર્ફોર્મન્સ સ્કોરકાર્ડ`,
  "name.insights": `ઇનસાઇટ્સ`,
  "name.demo": `ડેમો મોડ`,
  "name.users": `વપરાશકર્તા અને ઍક્સેસ`,
  "name.master-list": `કોણ શું કરે છે તેની માસ્ટર લિસ્ટ`,
  "name.access": `વપરાશકર્તા ઍક્સેસ`,
  "name.database-overview": `ડેટાબેઝ ઓવરવ્યૂ`,
};

const HI: Record<SystemKey, string> = {
  title: `इसे केवल सुपर एडमिन खोल सकता है`,
  page: `{page} केवल सुपर एडमिन का है। उसमें से कुछ चाहिए तो सुपर एडमिन से कहें; आपका डैशबोर्ड, दस्तावेज़ और रिकॉर्ड आपके ही रहते हैं।`,
  mitra: `{page} केवल सुपर एडमिन खोल सकता है।`,
  "name.reports": `रिपोर्ट`,
  "name.master-data": `मास्टर डेटा`,
  "name.activity": `गतिविधि लॉग`,
  "name.performance": `परफ़ॉर्मेंस स्कोरकार्ड`,
  "name.insights": `इनसाइट्स`,
  "name.demo": `डेमो मोड`,
  "name.users": `उपयोगकर्ता और ऐक्सेस`,
  "name.master-list": `कौन क्या करता है की मास्टर लिस्ट`,
  "name.access": `उपयोगकर्ता ऐक्सेस`,
  "name.database-overview": `डेटाबेस ओवरव्यू`,
};

const WORDS: Record<SystemLanguage, Record<SystemKey, string>> = { en: EN, gu: GU, hi: HI };

/** Every sentence, by language, for a test to hold the three to one another. */
export const SYSTEM_WORDS: Readonly<Record<SystemLanguage, Readonly<Record<SystemKey, string>>>> = WORDS;

const word = (lang: SystemLanguage, key: SystemKey): string => (WORDS[lang] ?? EN)[key] ?? EN[key];

/** The page's name in the language: "Reports", "The Activity Log". */
export const systemPageName = (lang: SystemLanguage, page: SystemPage): string => word(lang, `name.${page}` as SystemKey);

/** The refusal's heading. */
export const systemRefusalTitle = (lang: SystemLanguage): string => word(lang, "title");

/** The refusal's line under the heading, on the page itself. */
export const systemRefusalLine = (lang: SystemLanguage, page: SystemPage): string => word(lang, "page").replace("{page}", systemPageName(lang, page));

/** Mitra's one line to a staff account asked to open the page: "Only the super admin can open the Activity Log." */
export function systemRefusalMitra(lang: SystemLanguage, page: SystemPage): string {
  const name = systemPageName(lang, page);
  // English lower-cases the article mid-sentence ("open the Activity Log"); Hindi and Gujarati have none.
  return word(lang, "mitra").replace("{page}", lang === "en" ? name.replace(/^The /, "the ") : name);
}
