// EVERY LOG-SHEET LAYOUT IS WELL FORMED.
//
// A layout is pure configuration (types/logSheet.ts), transcribed by hand from
// a photographed form, and nothing checks it until a person opens the sheet:
// two columns with one key silently share one value, a header box and a footer
// box with one key overwrite each other (both live in LogSheetData.header), a
// group heading split by another column draws twice, and a picture of the
// supplied original that is not on disk shows a broken image beside the form
// (REQUIREMENTS §71, §74). These run over every layout, the revisions a format
// replaced included, so each format wired in is checked on arrival.
import test from "node:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { LOG_SHEET_LAYOUTS } from "../src/data/seed/logSheetLayouts";
import { everyLayout, noProblems } from "./support/catalogue";

// scripts/unit-tests.ts says where the project is: the bundle this file
// becomes runs from the system's temp folder.
const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();
const publicDir = path.join(repoRoot, "frontend", "public");

function duplicates(keys: string[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const k of keys) (seen.has(k) ? twice : seen).add(k);
  return Array.from(twice);
}

test("every log-sheet document has a layout, filed under its own id", () => {
  // Without one, the record page has no grid to draw and the submit checks
  // have nothing to check (engine/validation.ts passes it through untouched).
  const problems: string[] = [];
  for (const d of SEED_DOCUMENTS) if (d.kind === "log-sheet" && !LOG_SHEET_LAYOUTS[d.id]) problems.push(`${d.id} (${d.formatNo}) has no layout`);
  for (const [id, layout] of Object.entries(LOG_SHEET_LAYOUTS)) if (layout.documentId !== id) problems.push(`the layout filed under "${id}" says it is "${layout.documentId}"`);
  noProblems("Log-sheet documents and layouts that do not match", problems);
});

test("every layout's columns have unique keys", () => {
  const problems: string[] = [];
  for (const { name, layout } of everyLayout()) {
    for (const key of duplicates(layout.columns.map((c) => c.key))) problems.push(`${name}: column key "${key}"`);
  }
  noProblems("Columns sharing a key", problems);
});

test("every header and footer box has a key of its own", () => {
  // The boxes above and below the grid are stored side by side in one object,
  // so a key used both above and below the grid is one box, not two.
  const problems: string[] = [];
  for (const { name, layout } of everyLayout()) {
    const keys = [...layout.headerFields, ...(layout.footerFields ?? [])].map((f) => f.key);
    for (const key of duplicates(keys)) problems.push(`${name}: box key "${key}"`);
  }
  noProblems("Header and footer boxes sharing a key", problems);
});

test("a column group spans neighbouring columns only", () => {
  // The grid draws one heading across a group's columns (types/logSheet.ts
  // LogColumn.group); a group interrupted by another column would be drawn as
  // two headings of the same name.
  const problems: string[] = [];
  for (const { name, layout } of everyLayout()) {
    const closed = new Set<string>();
    let current: string | undefined;
    for (const col of layout.columns) {
      if (col.group !== current) {
        if (current !== undefined) closed.add(current);
        if (col.group !== undefined && closed.has(col.group)) problems.push(`${name}: group "${col.group}" resumes at column "${col.key}"`);
        current = col.group;
      }
    }
  }
  noProblems("Column groups split by other columns", problems);
});

test("every picture of a supplied original is on disk", () => {
  // Paths are as the page asks for them ("/source/x.jpg"), served from
  // frontend/public; a page may be a bare path or a { src, caption } pair.
  const problems: string[] = [];
  for (const { name, layout } of everyLayout()) {
    for (const page of layout.originalPages ?? []) {
      const src = typeof page === "string" ? page : page.src;
      const file = path.join(publicDir, ...src.replace(/^\/+/, "").split("/"));
      if (!existsSync(file)) problems.push(`${name}: ${src} (looked for ${file})`);
    }
  }
  noProblems("Original pages missing from frontend/public", problems);
});
