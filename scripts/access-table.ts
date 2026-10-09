// THE OWNER'S TABLE OF WHO FILLS WHAT, WRITTEN OUT FROM THE RULES THEMSELVES (REQUIREMENTS §96).
//
// docs/REQUIREMENTS.md §96 lists, for every document of the catalogue, who answers for it (Edit; told when it falls
// due, and counted against when it is late) and who only views it (Read), and for each of the plant's people the
// modules they see. It is not typed by hand: this prints it from frontend/src/engine/accessRules.ts over the issued
// catalogue (frontend/src/data/seed/documentDefinitions.ts), so the two cannot disagree.
//
//   node --no-warnings=ExperimentalWarning scripts/access-table.ts > table.md
//
// The app's modules use extensionless imports, which Node's type stripping cannot follow, so a small entry is bundled
// with esbuild (as scripts/unit-tests.ts bundles the unit tests, the browser's globals injected) and run.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (p: string) => path.join(root, "frontend", "src", p).split(path.sep).join("/");

const ENTRY = `
import { documentRepository, ensureSeeded } from "${src("data/repositories/documentRepository")}";
import { departmentOfDocument, departmentName } from "${src("data/seed/departments")}";
import { buildAccess, DEFAULT_PEOPLE, ACCESS_MODULES } from "${src("engine/accessRules")}";

ensureSeeded();
const REFERENCE_KINDS = new Set(["chemical-master", "licence", "compliance-statement"]);
const defs = documentRepository.getAllUnscoped();
const docs = defs.map((d) => ({ id: d.id, formatNo: d.formatNo, department: departmentOfDocument(d.id, d.formatNo), reference: !!d.isReferenceOnly || REFERENCE_KINDS.has(d.kind) }));
const access = buildAccess(docs, null);
const nameOf = new Map(DEFAULT_PEOPLE.map((p) => [p.email, p.name]));
const account = (email) => ({ email, role: "staff", departments: [] });
const cell = (s) => String(s).replace(/\\|/g, "/").replace(/\\s+/g, " ").trim();
const order = new Map(ACCESS_MODULES.map((m, i) => [m, i]));
const rows = defs
  .map((d) => ({ d, module: departmentOfDocument(d.id, d.formatNo) ?? "" }))
  .sort((a, b) => (order.get(a.module) ?? 99) - (order.get(b.module) ?? 99) || a.d.formatNo.localeCompare(b.d.formatNo, "en", { numeric: true }) || a.d.name.localeCompare(b.d.name));
const out = [];
out.push("| Module | Format No. | Document | Answers for it (Edit; told when it falls due) | Only views it (Read) |");
out.push("|---|---|---|---|---|");
for (const { d, module } of rows) {
  const answers = access.responsible(d.id);
  const ref = docs.find((x) => x.id === d.id).reference;
  const readers = DEFAULT_PEOPLE.filter((p) => !answers.includes(p.email) && access.level(account(p.email), d.id) === "read").map((p) => p.name);
  const editors = DEFAULT_PEOPLE.filter((p) => !answers.includes(p.email) && access.level(account(p.email), d.id) === "edit").map((p) => p.name + " (Edit)");
  const who = ref ? "Nobody: kept as issued (the super admin)" : answers.length ? answers.map((e) => nameOf.get(e) ?? e).join(", ") : "Nobody named: the super admin";
  out.push("| " + [module ? departmentName(module) + " (" + module + ")" : "None", cell(d.formatNo), cell(d.name), who, [...editors, ...readers].join(", ") || "-"].join(" | ") + " |");
}
out.push("");
out.push("| Person | Sign-in address | Sees (modules) | Answers for (documents) |");
out.push("|---|---|---|---|");
for (const p of DEFAULT_PEOPLE) {
  const seen = access.modules(account(p.email)).map((m) => m.module + (m.level === "edit" && p.email === "kapila.barad@gpp.local" && (m.module === "QC" || m.module === "SYS") ? " (Edit)" : ""));
  const mine = access.answersFor(account(p.email));
  out.push("| " + [p.name, p.email, seen.length === ACCESS_MODULES.length ? "Every module" : seen.join(", "), String(mine.length)].join(" | ") + " |");
}
out.push("| Super admin | admin@gpp.local | Every module, every document at Edit | None of their own: everything nobody is named for |");
console.log(out.join("\\n"));
`;

const dir = mkdtempSync(path.join(os.tmpdir(), "dcrs-access-table-"));
try {
  const entry = path.join(dir, "entry.ts");
  writeFileSync(entry, ENTRY);
  const outfile = path.join(dir, "table.mjs");
  await esbuild.build({
    entryPoints: [entry],
    absWorkingDir: root,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile,
    inject: [path.join(root, "frontend", "tests", "support", "browserGlobals.ts")],
    jsx: "automatic",
    logLevel: "warning",
  });
  const run = spawnSync(process.execPath, [outfile], { cwd: root, encoding: "utf-8" });
  process.stdout.write(run.stdout);
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    process.exitCode = run.status ?? 1;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
