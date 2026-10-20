// The documents the check walks: every document of the library with the kind of file it downloads as and its template, read
// through the same code the pages read (data/seed/documentDefinitions.ts, data/seed/originalFiles.ts).
//   node tests/originals_check/catalog.mjs <out.json>
import * as esbuild from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const out = process.argv[2];
if (!out) throw new Error("usage: node catalog.mjs <out.json>");
const dir = mkdtempSync(path.join(os.tmpdir(), "dcrs-origcheck-cat-"));
const entry = path.join(dir, "entry.ts");
writeFileSync(
  entry,
  `import { SEED_DOCUMENTS, RETIRED_DOCUMENT_IDS } from ${JSON.stringify(path.join(root, "frontend/src/data/seed/documentDefinitions.ts").replace(/\\/g, "/"))};
import { ORIGINAL_FILES } from ${JSON.stringify(path.join(root, "frontend/src/data/seed/originalFiles.ts").replace(/\\/g, "/"))};
import { documentFileKind } from ${JSON.stringify(path.join(root, "frontend/src/utils/documentExport.ts").replace(/\\/g, "/"))};
export const catalog = SEED_DOCUMENTS.filter((d) => !RETIRED_DOCUMENT_IDS.includes(d.id)).map((d) => ({ id: d.id, formatNo: d.formatNo, name: d.name, kind: d.kind, section: d.section ?? "", sourceFile: d.sourceFile ?? "", download: documentFileKind(d), template: ORIGINAL_FILES[d.id] ?? null }));
`
);
try {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(dir, "entry.mjs"),
    jsx: "automatic",
    loader: { ".tsx": "tsx", ".ts": "ts", ".css": "empty" },
    inject: [path.join(root, "frontend/tests/support/browserGlobals.ts")],
    logLevel: "error",
  });
  const mod = await import(pathToFileURL(path.join(dir, "entry.mjs")).href);
  writeFileSync(out, JSON.stringify(mod.catalog, null, 1));
  console.log(`${mod.catalog.length} documents -> ${out}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
