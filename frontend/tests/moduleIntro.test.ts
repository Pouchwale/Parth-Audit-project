// NO INFORMATION AT THE START OF A MODULE PAGE, AND THE SIGN-IN SCREEN'S WELCOME (REQUIREMENTS §204; the owner, 7-Nov-2026:
// "in every module there is no info i want in starting of any module ... make login page very interesting and make it more
// engaging like something is very important opening after only"). Read from the source; both looked at in a browser.
// Run: npm run test:unit -- moduleIntro
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const page = (name: string) => read("frontend", "src", "pages", name);

test("no module page draws the format line or an opening paragraph under its title any more", () => {
  for (const name of ["PestControlPages.tsx", "DocumentRecordsPage.tsx"]) assert.doesNotMatch(page(name), /<DocMeta /, `${name}: no format line`);
  const pest = page("PestControlPages.tsx");
  assert.doesNotMatch(pest, /One record per day/);
  assert.doesNotMatch(pest, /Every fortnight the 13 fly catcher units/);
  assert.doesNotMatch(pest, /The Daily Report, Gurudev Pest Control's service reports/);
  assert.doesNotMatch(pest, /<p className="text-muted mb-4">\{doc\.description\}<\/p>/, "the service report's description");
  assert.doesNotMatch(page("HrPages.tsx"), /Human Resources' own formats/);
  assert.doesNotMatch(page("QcPages.tsx"), /formats in \{groups\.length\} groups/);
  assert.doesNotMatch(page("GapPage.tsx"), /<p className="text-muted">\{doc\.description\}<\/p>|a customer complaint explained to the employee/);
  assert.doesNotMatch(page("TrainingPage.tsx"), /<p className="text-muted">\{doc\.description\}<\/p>/);
  assert.doesNotMatch(page("CapaPage.tsx"), /\{doc\.name\.replace\(\/\^CAPA — External: \/, ""\)\} · \{doc\.formatNo\}/);
  assert.doesNotMatch(page("CompliancePage.tsx"), /Declarations of Compliance issued to customers/);
  assert.doesNotMatch(page("LicencePage.tsx"), /\{agreement\.description\}|The Government of Gujarat licence held by/);
  const chemical = page("ChemicalMasterPage.tsx");
  assert.doesNotMatch(chemical, /Source: Pesticide Application Chart/);
  assert.match(chemical, /\{editing && <p className="text-muted mt-3 mb-4 no-print">Editing/, "the editor's hint stays, while editing");
});

test("the sign-in screen's welcome stands beside the card with its words, its doors and the day; the card and the form are as they were", () => {
  const layout = read("frontend", "src", "components", "auth", "AuthLayout.tsx");
  assert.match(layout, /<aside className="auth-welcome" data-section="auth-welcome"/);
  assert.match(layout, /Everything the plant records, kept right\./);
  assert.match(layout, /Authorised people only/);
  assert.match(layout, /title: "Today's briefing"/);
  assert.match(layout, /title: "Every register and report"/);
  assert.match(layout, /title: "Mitra"/);
  assert.match(layout, /toLocaleDateString\("en-IN", \{ weekday: "long", day: "numeric", month: "long", year: "numeric" \}\)/);
  assert.match(layout, /<div className="auth-stage" aria-hidden="true" \/>/);
  assert.match(layout, /\{welcome && <AuthWelcome \/>\}\n\s+<div className="auth-card">/, "the card right after the welcome, unchanged inside");
  assert.match(layout, /<div className="title">Digital Controlled Record System<\/div>/, "the wordmark as before");
  const screen = read("frontend", "src", "components", "auth", "AuthScreen.tsx");
  assert.match(screen, /<AuthLayout\n\s+afterIntro\n\s+welcome\n/, "the sign-in screen asks for it");
  const main = read("frontend", "src", "main.tsx");
  assert.doesNotMatch(main, /<AuthLayout[^>]*welcome/, "the choose-your-password card stays bare");
  const form = read("frontend", "src", "components", "auth", "LoginForm.tsx");
  assert.match(form, /id="login-email"/);
  assert.match(form, /id="login-password"/);
  assert.match(form, /"Log In"/);
  const css = read("frontend", "src", "styles.css");
  assert.match(css, /\n\.auth-welcome \{ flex: 1 1 380px; max-width: 480px;/);
  assert.match(css, /\n\.auth-stage \{\n\s+position: absolute; inset: 0; pointer-events: none;/);
  assert.doesNotMatch(css.slice(css.indexOf(".auth-stage {"), css.indexOf(".auth-welcome-day")), /animation/, "nothing moves on the welcome");
  assert.match(css, /@media \(max-width: 959px\) \{\n\s+\.auth-frame \{ flex-direction: column;/, "above the card on a phone");
});
