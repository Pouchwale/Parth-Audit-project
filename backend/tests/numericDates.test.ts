// THE SERVER WRITES A DATE AS THE SCREENS DO: IN NUMBERS, DAY-MONTH-YEAR, 24-10-26 (the owner, 24-Oct-2026;
// REQUIREMENTS §124). The server has its own writers (it cannot import the frontend's utils/date.ts), so each is held
// to the same rule here: backend/escalation.ts displayDate, and backend/accessRoutes.ts displayDay. The notification
// lines that carry them (push.test.ts, notificationJobs.test.ts) and the archive notes (recordsArchive.test.ts,
// activityRoutes.test.ts) check the sentences; this file checks the writers, every day of 2000 to 2099.
// Run: npm run test:unit -- numericDates
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayDate, escalationSentence } from "../escalation.ts";
import { addDays, displayDay } from "../accessRoutes.ts";

const WRITERS: [string, (iso: string) => string][] = [
  ["escalation displayDate", displayDate],
  ["access displayDay", displayDay],
];

describe("a date the server writes is numbers, day-month-year, two figures for the year", () => {
  for (const [name, write] of WRITERS) {
    it(`${name}: 24-10-26`, () => {
      assert.equal(write("2026-10-24"), "24-10-26");
      assert.equal(write("2026-01-01"), "01-01-26");
      assert.equal(write("2026-12-31"), "31-12-26");
      assert.equal(write("2026-09-03"), "03-09-26", "a day and a month under ten keep their nought");
      assert.equal(write("2000-01-01"), "01-01-00");
      assert.equal(write("2028-02-29"), "29-02-28");
      assert.equal(write("2099-12-31"), "31-12-99");
    });

    it(`${name}: every day of the hundred years reads back as the day it was`, () => {
      let day = "2000-01-01";
      let count = 0;
      while (day <= "2099-12-31") {
        const written = write(day);
        const m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(written);
        assert.ok(m, `${day} -> ${written}`);
        assert.equal(`20${m[3]}-${m[2]}-${m[1]}`, day, `${day} -> ${written}`);
        day = addDays(day, 1);
        count++;
      }
      assert.equal(count, 36525);
    });
  }

  it("the two writers say the same thing", () => {
    for (const day of ["2026-10-24", "2026-02-28", "2027-03-01", "2099-12-31"]) assert.equal(displayDate(day), displayDay(day));
  });
});

describe("the sentences that carry the server's dates", () => {
  it("an escalation says the day its window ends in numbers", () => {
    const sentence = escalationSentence({
      late: 3,
      neverDone: 2,
      evidence: {
        window: { from: "2026-08-26", to: "2026-09-24" },
        rule: { late: 3, neverDone: 2, windowDays: 30 },
        worst: [{ documentId: "qc-weighing-balance", what: "F/QC/12", late: 2, neverDone: 0 }],
        records: [],
      },
    });
    assert.equal(sentence, "3 late and 2 never done in the 30 days to 24-09-26 — F/QC/12: 2 late");
    assert.ok(!/[A-Z][a-z]{2}-\d{4}/.test(sentence), "no month name, no four-figure year");
  });
});
