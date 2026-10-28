// MASTER DATA IS THE SUPER ADMIN'S (the owner, 28-Oct-2026, with a picture of Master Data's rodent stations and the System
// menu: "from kapila barad id and other except superadmin id's no one can see in there id so remove them from all other id's
// and but make sure there are lots of testing id which you have created for testing so that id should access of those
// all"). The page, its link and its changes are the super admin's - and the testing accounts', every one of which signs up
// at example.com, the domain kept for testing: the test runs' own, and those the early runs left in the plant's database
// ("Playwright QA", e2e-...@example.com). Everybody else - Kapila Barad and the plant's other people - reads the lists
// through the forms that draw on them, as before, and the Chemical Master (a pest-control document of its own) keeps its
// own list. Import-free: the server runs this same file (backend/storageRoutes.ts), so the screen is never the lock.

/** An account a test run made: its address is at example.com. */
export function isTestAccount(email: string | null | undefined): boolean {
  return /@example\.com$/i.test(String(email ?? "").trim());
}

/** Who may open Master Data and change it: the super admin, and the testing accounts. */
export function mayOpenMasterData(account: { role?: string | null; email?: string | null } | null | undefined): boolean {
  return !!account && (account.role === "admin" || isTestAccount(account.email));
}
