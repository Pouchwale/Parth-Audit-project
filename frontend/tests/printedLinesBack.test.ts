// PRINTED LINES REMOVED BY MISTAKE, BROUGHT BACK (REQUIREMENTS §225; the owner, 16-Nov-2026, of the plant's F/QC/11 sheet
// of 10-11-2026 left with Pass/Fail alone). The plant's own history: line 2 removed by Kapila Barad, 3, 4 and Sign. by the
// Super Admin, with what they held; Tasted-1's removal is not in the history read here, so it comes back as printed.
// Run: npm run test:unit -- printedLinesBack
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetRow } from "../src/types";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { missingPrintedLines, withPrintedLinesBack } from "../src/engine/recordLines";

const layout = getLogSheetLayout("qc-gsm-plate-calibration")!;
const plates = (v: string, d: string) => ({ p54: v, p54dev: d, p55: v, p55dev: d, p56: v, p56dev: d, p57: v, p57dev: d });

test("F/QC/11 left with Pass/Fail alone: Tasted-1, 2, 3, 4 and Sign. come back in their places, with what they held", () => {
  const passFail = { id: "pf", parameter: "Pass/Fail", ...plates("Pass", "") } as LogSheetRow;
  assert.deepEqual(missingPrintedLines(layout, [passFail]), [0, 1, 2, 3, 5], "Tasted-1, 2, 3, 4, Sign.");
  const removed = (n: number, name: string, words: string) => ({ changes: [{ label: `Row ${n} (${name})`, before: words, after: "(row removed)" }] });
  const history = [
    removed(1, "2", "2, 20 x 21cm, 5%, 10 x 10cm, 0%, 5 x 5cm, 0%, 2.5 x 2.5cm, 0%"),
    { changes: [{ label: "Row 5", before: "(no row)", after: "(blank)" }] },
    removed(1, "3", "3, 20 x 20cm, 0%, 10 x 10cm, 0%, 5 x 5cm, 0%, 2.5 x 2.5cm, 0%"),
    removed(2, "4", "4, 20 x 20cm, 0%, 10 x 10cm, 0%, 5 x 4.8cm, -4%, 2.5 x 2.5cm, 0%"),
    removed(2, "Sign.", "Sign., Kapila Barad, Kapila Barad, Kapila Barad, Kapila Barad"),
  ];
  let n = 0;
  const rows = withPrintedLinesBack(layout, [passFail], history, () => `new-${++n}`);
  assert.deepEqual(rows.map((r) => r.parameter), ["Tasted-1", "2", "3", "4", "Pass/Fail", "Sign."], "in their printed places");
  assert.equal(rows[4].id, "pf", "the line that was there is the same line");
  assert.deepEqual([rows[1].p54, rows[1].p54dev], ["20 x 21cm", "5%"], "line 2 as it was");
  assert.equal(rows[3].p56, "5 x 4.8cm");
  assert.deepEqual([rows[5].p54, rows[5].p57, rows[5].p54dev], ["Kapila Barad", "Kapila Barad", ""], "the Sign. line's names, its Deviation blank");
  assert.deepEqual([rows[0].p54, rows[0].p57], ["", ""], "Tasted-1: no words in the history, as printed");
  assert.deepEqual(missingPrintedLines(layout, rows), [], "nothing missing now");
  assert.equal(withPrintedLinesBack(layout, rows, history), rows, "nothing to do a second time");
});

test("a line a person added stays, after the printed ones", () => {
  const extra = { id: "x", parameter: "", ...plates("21 x 21cm", "") } as LogSheetRow;
  const rows = withPrintedLinesBack(layout, [extra], [], () => "n");
  assert.equal(rows.length, 7);
  assert.equal(rows[6].id, "x");
});
