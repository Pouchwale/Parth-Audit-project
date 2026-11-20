// F/HR/20 answered by the assistant, F/HR/21 worked out from it, above 90% every year (REQUIREMENTS §267).
// Run: npm run test:unit -- pscScores
import test from "node:test";
import assert from "node:assert/strict";
import { achievedOf, answerOf, pscAnalysis, pscRoundAnswers, PSC_FLOOR, scoreOf } from "../src/engine/pscScores";
import { PSC_SCALE } from "../src/data/seed/hrLayouts";
import { SEED_HR_PSC_ANALYSIS } from "../src/data/seed/hrRecords";

const pct = (s: string) => Number(s.replace("%", ""));

test("the answers are the survey's own dropdown words", () => {
  for (let s = 1; s <= 7; s++) assert.ok(PSC_SCALE.includes(answerOf(s)), answerOf(s));
  assert.equal(scoreOf("6 — Moderately Agree"), 6);
  assert.equal(scoreOf(""), null);
});

test("the company's January-2026 figures come out as its workbook works them out (attribute 2, 95.02%; attribute 8, 92.06% reversed)", () => {
  const c = Array(8).fill(0);
  c[7] = 42;
  c[6] = 21;
  assert.equal((achievedOf(c, false)! / 100).toFixed(4), (420 / 441).toFixed(4));
  const r = Array(8).fill(0);
  r[1] = 58;
  r[2] = 5;
  assert.equal(achievedOf(r, true)!.toFixed(2), (100 * 63 / 68).toFixed(2));
});

test("every year: 7 or 6 (1 or 2 on attribute 8), each attribute over 90%, the overall between 91% and 97%, and it changes year to year", () => {
  const overalls = new Set<string>();
  for (let year = 2027; year < 2067; year++) {
    for (const n of [200, 199, 63, 12, 3, 1]) {
      const forms = pscRoundAnswers(year, n);
      assert.equal(forms.length, n);
      for (const f of forms)
        f.forEach((a, i) => assert.ok(i === 7 ? ["1", "2"].includes(a[0]) : ["7", "6"].includes(a[0]), `${year} ${n} attribute ${i + 1}: ${a}`));
      const { rows, overall, respondents } = pscAnalysis(forms);
      assert.equal(respondents, n);
      for (const r of rows) assert.ok(pct(r.achieved) >= PSC_FLOOR, `${year} ${n}: ${r.achieved}`);
      if (n === 200) {
        assert.ok(pct(overall) >= 90.9 && pct(overall) <= 97.6, `${year}: ${overall}`);
        overalls.add(overall.slice(0, 2));
      }
    }
    // the same every run
    assert.deepEqual(pscRoundAnswers(year, 200), pscRoundAnswers(year, 200));
  }
  assert.ok(overalls.size >= 4, `the overall moves year to year: ${[...overalls]}`);
});

test("people do not all answer alike: forms differ from each other", () => {
  const forms = pscRoundAnswers(2027, 200);
  assert.ok(new Set(forms.map((f) => f.join("|"))).size > 150);
});

test("the analysis counts and figures, blank where none answered", () => {
  const forms = [Array(15).fill(answerOf(7)), Array(15).fill(answerOf(6))];
  forms[0][7] = answerOf(1);
  forms[1][7] = answerOf(2);
  const { rows, overall } = pscAnalysis(forms);
  assert.deepEqual(
    { ...rows[0] },
    { sa7: 1, ma6: 1, a5: null, n4: null, d3: null, md2: null, sd1: null, actual: 13, ideal: 14, achieved: "92.86%" },
  );
  assert.deepEqual([rows[7].sd1, rows[7].md2, rows[7].actual, rows[7].ideal, rows[7].achieved], [1, 1, 3, 2, "66.67%"]);
  assert.ok(overall.endsWith("%"));
  assert.equal(pscAnalysis([]).overall, "");
  // the seeded January-2026 analysis is the paper's, untouched by this
  assert.equal(SEED_HR_PSC_ANALYSIS.data.header.overallAchieved, "93.99%");
});
