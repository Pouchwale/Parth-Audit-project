"""
Simulates the EXACT scenario a real user hit: a browser that already has a
large pre-existing backlog of blank "Due" record shells from before the
liveStartDate floor existed (e.g. from browsing old calendar months on a
pre-fix build) -- injected directly into localStorage before the app's
bootstrap() runs -- then reloaded, checking that:
  1. The login briefing does NOT show the old backlog as "ready for your OK".
  2. The Dashboard cleanup banner reports the correct count.
  3. Clicking "Clean up" actually removes it.
  4. A record predating the injected backlog that a human already verified
     is never touched, however the cleanup scopes its match.

This is the direct proof for a bug an adversarial review caught in the
backlog fix itself: prepareDueRecords() originally had no launch-date floor
of its own (only recordGenerator.ts did), so on the very next app load after
the fix shipped, it would have silently promoted the *entire* pre-existing
backlog to "In Progress" + prepared -- before the user ever saw the cleanup
banner -- defeating the fix for exactly the reported scenario. Fixed by
flooring prepareDueRecords() too, and by making prepared.at/updatedAt
actually equal for a freshly-prepared record (see recordRepository.ts's
upsertMany + engine/assistantPrepare.ts).

Network-independent (no Groq calls) -- run alongside e2e_smoke.py:
    npm run test:e2e          # runs this automatically, see scripts/run-e2e.ts
or manually against a server you start yourself:
    npm run build
    API_PORT=8842 npm run server &
    python tests/e2e_backlog_regression.py
"""
import sys
import time
from playwright.sync_api import sync_playwright
def settle_briefing(page):
    """Mark today's briefing slots as already shown, so it cannot re-open part
    way through the run and intercept a click. The briefing shows itself once in
    the first hour of the working day and once in the last
    (engine/briefingSchedule.ts); a suite that crosses one of those boundaries
    while running would otherwise fail on whatever it was clicking at the time.
    Reopening it deliberately from the top bar still works, which is how the
    suites that test the briefing itself get at it."""
    page.evaluate(
        """() => {
             const KEY = 'dcrs:v1:settings';
             const now = new Date();
             const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
             const s = JSON.parse(localStorage.getItem(KEY) || '{}');
             s.briefingShown = { date: today, slots: ['first', 'morning', 'evening'] };
             localStorage.setItem(KEY, JSON.stringify(s));
           }"""
    )

BASE = "http://localhost:8842"
FAILURES = []
TEST_EMAIL = f"e2e-backlog-{int(time.time() * 1000)}@example.com"
TEST_PASSWORD = "PlaywrightQA123"


def check(label, condition):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}")
    if not condition:
        FAILURES.append(label)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Sign up normally first, so bootstrap() runs once and sets a real
        # liveStartDate (today) via ensureLiveStartDate(), and the real
        # localStorage namespace exists to inject into.
        page.goto(f"{BASE}/index.html")
        page.wait_for_timeout(300)
        page.click("text=Sign up")
        page.fill("#signup-name", "Backlog QA")
        page.fill("#signup-email", TEST_EMAIL)
        page.fill("#signup-password", TEST_PASSWORD)
        page.fill("#signup-confirm", TEST_PASSWORD)
        page.click("button:has-text('Create Account')")
        page.wait_for_timeout(600)
        got_it = page.locator("button:has-text('Got it')")
        if got_it.count():
            got_it.first.click()
        page.wait_for_timeout(200)
        settle_briefing(page)

        # Inject a simulated pre-fix backlog directly into localStorage: 50
        # blank "Due" daily-pest-monitoring shells dated well before today --
        # exactly the shape the old unbounded generator produced -- plus one
        # record a human already verified, with an equally old due date, to
        # prove the cleanup never touches anything real.
        injected = page.evaluate(
            """() => {
              const NS = "dcrs:v1:";
              const raw = localStorage.getItem(NS + "records");
              const records = raw ? JSON.parse(raw) : [];
              const now = new Date().toISOString();
              let n = 0;
              for (let i = 1; i <= 50; i++) {
                const d = `2020-01-${String((i % 28) + 1).padStart(2, "0")}`;
                records.push({
                  id: `backlog-${n}`,
                  documentId: "daily-pest-monitoring",
                  periodKey: `daily-pest-monitoring:${d}#${n}`,
                  dueDate: d,
                  status: "Due",
                  isDemo: false,
                  data: { isHoliday: false, checkpoints: {}, timeOfChecking: "", checker: "", summaryActions: [] },
                  createdAt: now,
                  updatedAt: now,
                });
                n++;
              }
              records.push({
                id: "human-verified-old",
                documentId: "daily-pest-monitoring",
                periodKey: "daily-pest-monitoring:2020-01-01#verified",
                dueDate: "2020-01-01",
                status: "Verified",
                isDemo: false,
                data: { isHoliday: false, checkpoints: {}, timeOfChecking: "09:00", checker: "Real Person", summaryActions: [] },
                createdAt: now,
                updatedAt: now,
                submittedBy: "Real Person",
                submittedAt: now,
                verifiedBy: "Real Verifier",
                verifiedAt: now,
              });
              localStorage.setItem(NS + "records", JSON.stringify(records));
              return n;
            }"""
        )
        check("Injected simulated pre-fix backlog (50 records)", injected == 50)

        # Reload: this is the FIRST bootstrap() run to see the injected
        # backlog -- exactly the "next load after the fix ships" scenario.
        page.reload()
        page.wait_for_timeout(700)

        verified_intact_before = page.evaluate(
            """() => {
              const records = JSON.parse(localStorage.getItem("dcrs:v1:records") || "[]");
              const r = records.find(r => r.id === "human-verified-old");
              return r && r.status === "Verified" && r.verifiedBy === "Real Verifier";
            }"""
        )
        backlog_after_reload = page.evaluate(
            """() => {
              const records = JSON.parse(localStorage.getItem("dcrs:v1:records") || "[]");
              const backlog = records.filter(r => r.id.startsWith("backlog-"));
              return { count: backlog.length, statuses: [...new Set(backlog.map(r => r.status))] };
            }"""
        )
        check(
            "Backlog was NOT silently promoted to In Progress on this load (stayed Due)",
            backlog_after_reload["count"] == 50 and backlog_after_reload["statuses"] == ["Due"],
        )
        check("Human-verified old record intact after reload", verified_intact_before)

        got_it = page.locator("button:has-text('Got it')")
        if got_it.count():
            got_it.first.click()
        page.wait_for_timeout(300)

        banner_text = page.locator(".card:has-text('Clean up')").inner_text() if page.locator(".card:has-text('Clean up')").count() else ""
        check("Dashboard banner appears for the injected backlog", "Clean up" in page.content())
        check("Dashboard banner reports the correct count (50)", "50" in banner_text)

        cleanup_btn = page.locator("button:has-text('Clean up')")
        if cleanup_btn.count() > 0:
            cleanup_btn.click()
            page.wait_for_timeout(300)
            check("Cleanup confirmation shows 50 removed", "Removed 50" in page.content())

            remaining = page.evaluate(
                """() => {
                  const records = JSON.parse(localStorage.getItem("dcrs:v1:records") || "[]");
                  return {
                    backlogLeft: records.filter(r => r.id.startsWith("backlog-")).length,
                    verifiedStillThere: records.some(r => r.id === "human-verified-old" && r.status === "Verified"),
                  };
                }"""
            )
            check("All 50 injected backlog records actually removed", remaining["backlogLeft"] == 0)
            check("Human-verified old record survived the cleanup untouched", remaining["verifiedStillThere"])
        else:
            check("Cleanup button was reachable", False)

        browser.close()
        if FAILURES:
            print(f"\n{len(FAILURES)} FAILURE(S):")
            for f in FAILURES:
                print(" -", f)
            sys.exit(1)
        print("\nAll backlog-regression checks passed.")


if __name__ == "__main__":
    main()
