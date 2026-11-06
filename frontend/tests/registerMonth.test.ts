// THE DAILY REGISTER'S MONTH CHANGED FROM ITS TITLE (REQUIREMENTS §197; the owner, 6-Nov-2026, of "DAILY PEST CONTROL
// MONITORING RECORD — November 2026": "i cannot be able to edit month so do make that editable"). The words after the title
// take a click like the header's cells; the month and the year are chosen in their place; the page follows. Read from the
// source; the register itself is clicked through in a browser.
// Run: npm run test:unit -- registerMonth
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");

test("the header draws the words after its title as their own click, and the box in their place while they are changed", () => {
  const header = read("frontend", "src", "components", "documents", "DocumentHeader.tsx");
  assert.match(header, /extraTitleEdit\?: \{ editing: boolean; onEdit: \(\) => void; box: React\.ReactNode; action: string \};/);
  assert.match(header, /\{extraTitle && !extraTitleEdit \? ` — \$\{extraTitle\}` : ""\}\n {8}<\/Cell>\n {8}\{suffix\}/, "outside the title's own cell, so a click on the month is not a click on the title");
  assert.match(header, /className="designer-head"\n {12}data-action=\{extraTitleEdit\.action\}/, "clickable as the header's cells are");
  assert.match(header, /extraTitleEdit\.editing \? \(\n {10}extraTitleEdit\.box/);
});

test("the daily register offers its month and year in the title's place, and the page follows", () => {
  const sheet = read("frontend", "src", "components", "records", "DailyRegisterSheet.tsx");
  assert.match(sheet, /onMonthChange\?: \(year: number, month: number\) => void;/);
  assert.match(sheet, /headerEditable && onMonthChange\n {6}\? \{/, "only on the register's own page, never on a report");
  assert.match(sheet, /action: "change-register-month",/);
  assert.match(sheet, /data-field="register-month"[^>]*value=\{month\} onChange=\{\(e\) => onMonthChange\(year, Number\(e\.target\.value\)\)\}/);
  assert.match(sheet, /data-field="register-year"[^>]*value=\{year\} onChange=\{\(e\) => onMonthChange\(Number\(e\.target\.value\), month\)\}/);
  assert.match(sheet, /className="register-month-box no-print"/, "the screen's only: never printed");
  assert.match(sheet, /<DocumentHeader doc=\{doc\} extraTitle=\{monthLabel\} extraTitleEdit=\{monthEdit\} pageLabel="1 Of 3" edit=\{headerEdit\} \/>/, "the first page's header takes the click; the other two repeat the month");
  const pest = read("frontend", "src", "pages", "PestControlPages.tsx");
  assert.match(pest, /onMonthChange=\{\(y, m\) => \{\n {12}setYear\(y\);\n {12}setMonth\(m\);\n {10}\}\}/, "the page's own year and month, which its pickers show too");
});
