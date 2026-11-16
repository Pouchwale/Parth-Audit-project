// THE FLY CATCHER TREND ALONE ON TREND ANALYSIS; THE F/HR/18 REGISTER ON A PAGE OF ITS OWN (REQUIREMENTS §222; the owner,
// 16-Nov-2026: "keep this Seperate so in trend Anlaysis trend analysis of fly catcher only present"). Read from the source.
// Run: npm run test:unit -- flyCatcherTrendAlone
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { documentOpenRoute } from "../src/engine/documentRoutes";

ensureDocumentsSeeded();
const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (...p: string[]) => readFileSync(path.join(root, "frontend", "src", ...p), "utf8").replace(/\r\n/g, "\n");

test("Trend Analysis shows the fly catcher trend alone; F/HR/18's register and visit list are their own page, in the menu", () => {
  const pages = src("pages", "PestControlPages.tsx");
  const trend = pages.slice(pages.indexOf("export function FlyCatcherTrendPage"), pages.indexOf("export function FlyCatcherRegisterPage"));
  const register = pages.slice(pages.indexOf("export function FlyCatcherRegisterPage"));
  assert.match(trend, /<FlyCatcherTrendReport /);
  assert.doesNotMatch(trend, /FlyCatcherRegisterSheet|document-new-record|pill-tab|Visit list|visitListView/, "nothing but the trend");
  assert.match(register, /<FlyCatcherRegisterSheet /);
  assert.doesNotMatch(register.slice(0, register.indexOf("\n}\n")), /FlyCatcherTrendReport|data-view="trend"/, "no trend on the register's page");
  assert.equal(documentOpenRoute(documentRepository.getByIdUnscoped("fly-catcher")!), "/pest/fly-catcher", "F/HR/18 opens its register");
  const sidebar = src("components", "layout", "Sidebar.tsx");
  assert.match(sidebar, /\{ to: "\/pest\/fly-catcher", labelKey: "nav\.flyCatcherRegister"/);
  assert.match(sidebar, /\{ to: "\/pest\/trend\/fly-catcher", labelKey: "nav\.flyCatcherInfestation"/);
  assert.match(src("App.tsx"), /if \(rest\[0\] === "fly-catcher"\) return <FlyCatcherRegisterPage /);
});
