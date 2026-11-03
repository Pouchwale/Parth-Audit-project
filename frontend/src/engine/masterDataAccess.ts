// MASTER DATA IS THE SUPER ADMIN'S, AND KAPILA BARAD'S (the owner, 28-Oct-2026, with a picture of Master Data's rodent
// stations and the System menu: "from kapila barad id and other except superadmin id's no one can see in there id so
// remove them from all other id's and but make sure there are lots of testing id which you have created for testing so
// that id should access of those all"; and 3-Nov-2026, with a picture of the System menu's Master Data: "for kapila barad
// ID just give this access only for master data in system, nothing more or less than that", REQUIREMENTS §134, §172).
// The page, its link and its changes are the super admin's, Kapila Barad's (her account, by its sign-in - and by the
// sign-in it had before §110 renamed it), and the testing accounts', every one of which signs up at example.com, the
// domain kept for testing: the test runs' own, and those the early runs left in the plant's database ("Playwright QA",
// e2e-...@example.com). Kapila gets Master Data and nothing else of the System menu's admin pages: the plant's hours on it
// stay the super admin's (§84), and Users & Access, the master list and the rest stay the administrator's (§66). Everybody
// else - the plant's other people - reads the lists through the forms that draw on them, as before, and the Chemical
// Master (a pest-control document of its own) keeps its own list. Import-free: the server runs this same file
// (backend/storageRoutes.ts), so the screen is never the lock.

/**
 * The plant's people who open Master Data besides the super admin (§172, §178): Kapila Barad, by her sign-in and the one
 * it was, and Vinay Bhojak (the owner, 3-Nov-2026: "give same as to vinay bhojak also"), by his.
 */
export const MASTER_DATA_PEOPLE: readonly string[] = ["kapila.barad@gpp.local", "kapilabarad01@gmail.com", "vinay.bhojak@gpp.local"];

/** ...and by the name the account carries, whatever its sign-in ("Kapila Barad", "Kapila B Barad", "Vinay Bhojak"): every one of these words in it. */
export const MASTER_DATA_PEOPLE_NAMES: readonly string[][] = [["kapila", "barad"], ["vinay", "bhojak"]];

/** The words of a name, in small letters, letters only. */
function nameWords(name: string | null | undefined): string[] {
  return String(name ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

/**
 * Kapila Barad's or Vinay Bhojak's account: by its sign-in, or by its name (the owner, 3-Nov-2026, with a picture of Kapila's System
 * menu still without Master Data at the plant - her account there signs in by whatever address the super admin gave it,
 * so the name is what settles it). A sign-in alone is still accepted, as before.
 */
export function isMasterDataPerson(account: { email?: string | null; name?: string | null } | string | null | undefined): boolean {
  const email = String((typeof account === "string" ? account : account?.email) ?? "").trim().toLowerCase();
  if (email && MASTER_DATA_PEOPLE.includes(email)) return true;
  const words = typeof account === "string" ? [] : nameWords(account?.name);
  return words.length > 0 && MASTER_DATA_PEOPLE_NAMES.some((wanted) => wanted.every((w) => words.includes(w)));
}

/** An account a test run made: its address is at example.com. */
export function isTestAccount(email: string | null | undefined): boolean {
  return /@example\.com$/i.test(String(email ?? "").trim());
}

/** The System menu's other pages, by their addresses: the ones Kapila Barad's ID does not have (§173). */
export const SYSTEM_ROUTES: readonly string[] = ["/reports", "/activity", "/performance", "/insights", "/demo"];

/**
 * Whether an account may open the System menu's pages besides Master Data - Reports, the Activity Log, the Performance
 * Scorecard, Insights (and Demo Mode where a server has it): everybody but Kapila Barad's ID, whose System menu is
 * Master Data alone (the owner, 3-Nov-2026, with a picture of the menu: "remove all the thing from this system for
 * kapila barad id except Master data", REQUIREMENTS §173). The super admin always may.
 */
export function mayOpenSystemPages(account: { role?: string | null; email?: string | null; name?: string | null } | null | undefined): boolean {
  return !!account && (account.role === "admin" || !isMasterDataPerson(account));
}

/**
 * Whether Master Data's "Departments & access" tab is shown (the owner, 3-Nov-2026, with a picture of the tab: "remove this
 * also from master data in kapila barad id", REQUIREMENTS §178): the administrator's, whose page it works for (§66), and the
 * testing accounts'; not the plant's people's.
 */
export function mayOpenDepartmentsAccess(account: { role?: string | null; email?: string | null; name?: string | null } | null | undefined): boolean {
  return !!account && (account.role === "admin" || isTestAccount(account.email));
}

/** Vinay Bhojak's account alone: his Master Data opens without the Employees tab (the owner, 3-Nov-2026, REQUIREMENTS §179). */
export function isVinayBhojak(account: { email?: string | null; name?: string | null } | null | undefined): boolean {
  const email = String(account?.email ?? "").trim().toLowerCase();
  if (email === "vinay.bhojak@gpp.local") return true;
  const words = nameWords(account?.name);
  return words.includes("vinay") && words.includes("bhojak");
}

/** Whether Master Data's Employees tab is shown: to everybody who opens Master Data but Vinay Bhojak (§179). */
export function mayOpenEmployeesTab(account: { role?: string | null; email?: string | null; name?: string | null } | null | undefined): boolean {
  return !!account && (account.role === "admin" || !isVinayBhojak(account));
}

/** Whether an account may be taken to an address: one of the System menu's other pages only by mayOpenSystemPages; any other address, yes. */
export function mayOpenRoute(account: { role?: string | null; email?: string | null; name?: string | null } | null | undefined, route: string): boolean {
  const r = String(route ?? "").trim();
  return !SYSTEM_ROUTES.some((s) => r === s || r.startsWith(`${s}/`)) || mayOpenSystemPages(account);
}

/** Who may open Master Data and change it: the super admin, Kapila Barad (§172), and the testing accounts. */
export function mayOpenMasterData(account: { role?: string | null; email?: string | null; name?: string | null } | null | undefined): boolean {
  return !!account && (account.role === "admin" || isMasterDataPerson(account) || isTestAccount(account.email));
}
