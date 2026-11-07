// A REGISTER'S HEADINGS CENTRED OVER THEIR COLUMNS (REQUIREMENTS §198; the owner, 7-Nov-2026, of F/HR/17's heading band:
// "make this is in center like the all align towards left which is looking bad"). The shared ".doc-table th" rule set them
// left after ".register-grid th" had centred them; the rule that wins now stands after it. Read from the source; the
// register itself is looked at in a browser, printed and downloaded.
// Run: npm run test:unit -- registerHeadings
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");

test("a register's headings are centred by a rule that stands after the shared heading rule", () => {
  const css = read("frontend", "src", "styles.css");
  const shared = css.indexOf("\n.doc-table th {");
  const centred = css.indexOf("\n.doc-table .register-grid th { white-space: normal; text-align: center; }");
  assert.ok(shared > 0, "the shared .doc-table th rule");
  assert.ok(centred > shared, "the register's centre stands after the shared rule, at a specificity above it");
  assert.match(css, /\n\.doc-table \.register-summary th \{ text-align: left; \}/, "F/HR/17's SUMMARY headings keep the paper's left");
  assert.ok(css.indexOf("\n.doc-table .register-summary th {") > centred, "...by a rule after the centre");
  // F/HR/18 printed keeps its Word original's headings (its own print rules, after both).
  const fhr18 = css.indexOf(".fhr18-sheet table.fhr18-grid thead th, .fhr18-record table.fhr18-grid thead th {");
  assert.ok(fhr18 > centred);
  assert.match(css.slice(fhr18, fhr18 + 400), /text-align: left;/);
});

test("the register carries no notes line under page 3 and no asterisk in a cell (the owner, 7-Nov-2026: 'remove this line also')", () => {
  const sheet = read("frontend", "src", "components", "records", "DailyRegisterSheet.tsx");
  assert.doesNotMatch(sheet, /register-notes|Notes \(check points|"\*"|interface Note\b/);
  assert.match(sheet, /return \{ text, title: ans\?\.note \|\| undefined, flagged: isCheckpointFinding\(cp, raw \?\? null\) \};/, "a note stays the cell's tooltip");
  const css = read("frontend", "src", "styles.css");
  assert.doesNotMatch(css, /\.register-notes/);
  const paper = read("frontend", "src", "utils", "dailyPestRegister.ts");
  assert.doesNotMatch(paper, /startsWith\("\*"\)/, "nothing starting with * is expected on the page any more");
});

test("in Word and in Excel the CHECK POINTS heading is centred over the ten, as the other three", () => {
  const src = read("frontend", "src", "utils", "dailyPestRegister.ts");
  assert.match(src, /cell\(\{ text: text\(head\[1\]\)\.toUpperCase\(\) \}, 14, true, "center", "center", \{ \.\.\.shaded, colSpan: 10 \}\)/);
  assert.doesNotMatch(src, /text\(head\[\d+\]\)\.toUpperCase\(\) \}, 14, true, "left"/, "no heading of the grid at the left");
});
