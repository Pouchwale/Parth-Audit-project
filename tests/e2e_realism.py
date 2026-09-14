"""Checks the generated records the way an auditor reads them.

A register in which every reading sits on nominal, every check point says
Yes, every lot is Accepted and every record was verified the same afternoon
is an obviously synthetic one. This suite asserts the opposite shape — that
exceptions exist, that they are rare, and above all that each one carries its
consequence: a remark beside the reading, an action against the check point, a
reason beside the lot status, a corrective action against the finding.

It also pins the two properties that make the data safe to audit at all:
nothing is recorded for a day that has not happened yet, and regenerating the
same month reproduces exactly the same values.
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

# One pass over every demo record, summarised in the browser.
STATS = """
() => {
  const demo = JSON.parse(localStorage.getItem('dcrs:v1:records') || '[]').filter(r => r.isDemo);
  const today = new Date().toISOString().slice(0, 10);
  const s = {
    total: demo.length, status: {}, lots: {}, grades: {},
    readings: 0, outOfBand: 0, daysWithOutOfBand: 0,
    excursionsWithRemark: 0, excursionsWithoutRemark: 0,
    checkpointFindings: 0, findingsWithAction: 0,
    lotsNotAcceptedWithReason: 0, lotsNotAcceptedWithoutReason: 0,
    capaRecords: 0, capaFindings: 0, capaClosed: 0, capaOverdue: 0, capaWithAction: 0,
    rejected: 0, rejectedWithReasonAndBy: 0,
    submitClockTimes: {}, verifyLags: [],
    futureWithData: 0, futureRecords: 0,
  };
  for (const r of demo) {
    s.status[r.status] = (s.status[r.status] || 0) + 1;
    const d = r.data || {};
    if (r.dueDate > today) {
      s.futureRecords++;
      // "Filled in" means an OBSERVED value — a measurement, an answered
      // check point, a catch count, a lot decision. The printed scaffolding
      // a blank shell carries (time slots, parameter names, PC ids) is not.
      const filled =
        (Array.isArray(d.rows) && d.rows.some(row => Object.entries(row).some(([k, v]) => typeof v === 'number' && k !== 'slNo')))
        || (d.checkpoints && Object.values(d.checkpoints).some(c => c && c.value !== null && c.value !== ''))
        || (Array.isArray(d.entries) && d.entries.some(e => e.catchCountApprox !== null))
        || (d.header && (d.header.lotStatus || '').trim() !== '');
      if (filled) s.futureWithData++;
    }
    if (r.status === 'Rejected') {
      s.rejected++;
      if ((r.rejectionReason || '').trim() && (r.rejectedBy || '').trim()) s.rejectedWithReasonAndBy++;
    }
    if (r.submittedAt) s.submitClockTimes[r.submittedAt.slice(11, 16)] = 1;
    if (r.submittedAt && r.verifiedAt) {
      s.verifyLags.push(Math.round((Date.parse(r.verifiedAt) - Date.parse(r.submittedAt)) / 86400000));
    }
    // Log sheets: readings against their printed band, and the remark beside
    // any that went out.
    if (Array.isArray(d.rows)) {
      let dayHadOut = false;
      for (const row of d.rows) {
        if (row.grade) s.grades[row.grade] = (s.grades[row.grade] || 0) + 1;
        for (const [k, v] of Object.entries(row)) {
          if (typeof v !== 'number') continue;
          const band = window.__BANDS[r.documentId] && window.__BANDS[r.documentId][k];
          if (!band) continue;
          s.readings++;
          if (v < band[0] || v > band[1]) {
            s.outOfBand++;
            dayHadOut = true;
            if (window.__HAS_REMARK.includes(r.documentId)) {
              if ((row.remark || '').trim()) s.excursionsWithRemark++;
              else s.excursionsWithoutRemark++;
            }
          }
        }
      }
      if (dayHadOut) s.daysWithOutOfBand++;
    }
    if (d.header && d.header.lotStatus) {
      s.lots[d.header.lotStatus] = (s.lots[d.header.lotStatus] || 0) + 1;
      if (d.header.lotStatus !== 'Accepted') {
        if ((d.header.deviationReason || '').trim()) s.lotsNotAcceptedWithReason++;
        else s.lotsNotAcceptedWithoutReason++;
      }
    }
    if (Array.isArray(d.summaryActions)) {
      for (const a of d.summaryActions) {
        s.checkpointFindings++;
        if ((a.actionTaken || '').trim()) s.findingsWithAction++;
      }
    }
    if (Array.isArray(d.findings)) {
      s.capaRecords++;
      for (const f of d.findings) {
        s.capaFindings++;
        if (f.status === 'Closed') s.capaClosed++;
        if (f.status === 'Overdue') s.capaOverdue++;
        if ((f.correctiveActionClient || '').trim() || (f.correctiveActionContractor || '').trim()) s.capaWithAction++;
      }
    }
  }
  s.submitClockTimes = Object.keys(s.submitClockTimes).length;
  return s;
}
"""

# The printed acceptance bands (data/seed/logSheetLayouts.ts), so the suite
# judges a reading against the same limits the form does.
BANDS = """
window.__BANDS = {
  'qc-viscosity': { viscosity: [19.0, 21.0] },
  'qc-adhesive-mixing': { adhesive: [14.5, 15.5], hardener: [1.6, 1.7], ethyl: [19.0, 20.0], viscosity: [19.0, 21.0] },
  'qc-temperature': { t0830: [43, 47], t1230: [43, 47], t1630: [43, 47], t2030: [43, 47], t0030: [43, 47], t0430: [43, 47] },
};
window.__HAS_REMARK = ['qc-adhesive-mixing'];
"""


def check(label, cond):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        FAILURES.append(label)


def signup(page):
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(400)
    page.click("text=Sign up")
    page.fill("#signup-name", "Realism QA")
    page.fill("#signup-email", f"realism-{int(time.time()*1000)}@example.com")
    page.fill("#signup-password", "PlaywrightQA123")
    page.fill("#signup-confirm", "PlaywrightQA123")
    page.click("button:has-text('Create Account')")
    page.wait_for_timeout(1200)
    for _ in range(3):
        got = page.locator("button:has-text('Got it')")
        if got.count():
            got.first.click()
            page.wait_for_timeout(200)
        settle_briefing(page)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.on("pageerror", lambda e: print("PAGEERROR", e))
    page.add_init_script(BANDS)
    signup(page)

    # Demo Mode fills the year so far on entering; the Demo page's own button
    # covers anything left.
    page.click(".pill-tab:has-text('Demo Mode')")
    page.wait_for_timeout(3000)
    page.goto(f"{BASE}/index.html#/demo")
    page.wait_for_timeout(1500)
    gen = page.locator("button:has-text('Generate')")
    if gen.count():
        gen.first.click()
        page.wait_for_timeout(4000)

    s = page.evaluate(STATS)
    print(f"    ({s['total']} demo records: {s['status']})")

    check("A demo year of records was generated", s["total"] > 500)

    # ---- readings: exceptions exist, and they are exceptions ----
    out_pct = 100 * s["outOfBand"] / max(1, s["readings"])
    print(f"    ({s['outOfBand']}/{s['readings']} readings outside the printed band = {out_pct:.1f}%)")
    check("Some readings fall outside the printed band, as they do on the real specimen", s["outOfBand"] > 0)
    check("...but they stay exceptional (under 5% of all readings)", out_pct < 5.0)
    check("...and they cluster on some days rather than every day", 0 < s["daysWithOutOfBand"] < s["total"])
    check(
        "Every out-of-band reading on a form WITH a remark column has the remark filled in",
        s["excursionsWithoutRemark"] == 0 and s["excursionsWithRemark"] > 0,
    )

    # ---- lot dispositions ----
    accepted = s["lots"].get("Accepted", 0)
    not_accepted = sum(v for k, v in s["lots"].items() if k != "Accepted")
    print(f"    (lot status: {s['lots']})")
    check("Not every inspected lot is plain Accepted", not_accepted > 0)
    check("...but most are (over 85%)", accepted / max(1, accepted + not_accepted) > 0.85)
    check("Every lot that is not Accepted states its reason", s["lotsNotAcceptedWithoutReason"] == 0)

    # ---- F/QC/13 grades ----
    print(f"    (printing grades: {s['grades']})")
    check("In-process printing grades are not all A and B", (s["grades"].get("C", 0) + s["grades"].get("F", 0)) > 0)
    check("...and the F grade, which stops printing, stays rare", s["grades"].get("F", 0) < s["grades"].get("A", 1))

    # ---- check points and their actions ----
    print(f"    ({s['checkpointFindings']} check-point findings recorded)")
    check("The daily pest register records findings, not a clean sheet every day", s["checkpointFindings"] > 0)
    check("Every recorded finding says what was done about it", s["findingsWithAction"] == s["checkpointFindings"])

    # ---- the CAPA chain ----
    print(f"    ({s['capaRecords']} CAPA records, {s['capaFindings']} findings: {s['capaClosed']} closed, {s['capaOverdue']} overdue)")
    check("Findings observed in the registers are carried into CAPA records", s["capaRecords"] > 0 and s["capaFindings"] > 0)
    check("Every CAPA finding carries a corrective action", s["capaWithAction"] == s["capaFindings"])
    check("Some corrective actions are closed and some are still overdue", s["capaClosed"] > 0 and s["capaOverdue"] > 0)

    # ---- how work was signed off ----
    print(f"    ({s['submitClockTimes']} distinct submission clock times; {s['rejected']} rejected records)")
    check("Records are not all submitted at the same clock time", s["submitClockTimes"] > 20)
    check("Some records were sent back", s["rejected"] > 0)
    check("Every rejected record names the reason and who rejected it", s["rejectedWithReasonAndBy"] == s["rejected"])
    check("Verification is not always same-day", any(l > 0 for l in s["verifyLags"]))
    check("...and never before submission", all(l >= 0 for l in s["verifyLags"]))

    # ---- nothing recorded before it happened ----
    print(f"    ({s['futureRecords']} records dated in the future)")
    check("No record for a future date has been filled in already", s["futureWithData"] == 0)

    # ---- deterministic: the same day reads the same way on another machine ----
    # An auditor who comes back to 14-Aug must find the 14-Aug they saw. The
    # old generator drew from Math.random(), so two browsers disagreed and a
    # regeneration rewrote history. A second, completely fresh browser context
    # is the strongest form of that check.
    SAMPLE = (
        "() => { const r = JSON.parse(localStorage.getItem('dcrs:v1:records')||'[]')"
        ".filter(x => x.isDemo && x.documentId === 'qc-viscosity').sort((a,b)=>a.dueDate<b.dueDate?-1:1)[0];"
        " return r ? {date: r.dueDate, values: r.data.rows.map(x => x.viscosity), checker: r.submittedBy, status: r.status} : null; }"
    )
    sample_before = page.evaluate(SAMPLE)

    second = browser.new_page(viewport={"width": 1400, "height": 900})
    second.add_init_script(BANDS)
    signup(second)
    second.click(".pill-tab:has-text('Demo Mode')")
    second.wait_for_timeout(3000)
    second.goto(f"{BASE}/index.html#/demo")
    second.wait_for_timeout(1500)
    gen = second.locator("button:has-text('Generate')")
    if gen.count():
        gen.first.click()
        second.wait_for_timeout(4000)
    sample_after = second.evaluate(SAMPLE)
    print(f"    (same day on a second browser: {sample_before['date'] if sample_before else '—'})")
    check(
        "A second browser generates exactly the same readings, signatures and status for the same day",
        sample_before is not None and sample_after is not None and sample_before == sample_after,
    )

    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} CHECK(S) FAILED:")
    for failure in FAILURES:
        print(" -", failure)
    sys.exit(1)
print("\nAll realism checks passed.")
