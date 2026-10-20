// The filler run outside the browser on what a page showed (a blocks.json the check saved): the template filled exactly as
// the Download button fills it (utils/originalFill fillTemplate, with the map), written to a file, with the filler's report.
// For working on the filler without a server, and for the check's --refill.
//   node tests/originals_check/fill_offline.mjs <document-id> <blocks.json> <out-file> [<report.json>]
import * as esbuild from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const [docId, blocksPath, outFile, reportPath] = process.argv.slice(2);
if (!outFile) throw new Error("usage: node fill_offline.mjs <document-id> <blocks.json> <out-file> [<report.json>]");
const dir = mkdtempSync(path.join(os.tmpdir(), "dcrs-origcheck-fill-"));
const p = (rel) => JSON.stringify(path.join(root, rel).replace(/\\/g, "/"));
writeFileSync(
  path.join(dir, "entry.ts"),
  `import { fillTemplate } from ${p("frontend/src/utils/originalFill/index.ts")};
import { originalFileOf } from ${p("frontend/src/data/seed/originalFiles.ts")};
import { envelopeFor } from ${p("frontend/src/utils/documentExport.ts")};
import { SEED_DOCUMENTS } from ${p("frontend/src/data/seed/documentDefinitions.ts")};
export async function run(docId: string, shown: { blocks: any[]; recordIds: string[] }, template: ArrayBuffer) {
  const file = originalFileOf(docId);
  if (!file) throw new Error("no template for " + docId);
  const doc = SEED_DOCUMENTS.find((d) => d.id === docId)!;
  const envelope = envelopeFor(file.kind, doc, shown.blocks, shown.recordIds ?? []);
  const out = await fillTemplate(file, template, shown.blocks, envelope, docId);
  return { bytes: out.bytes, report: out.report, kind: file.kind };
}
`
);
try {
  await esbuild.build({
    entryPoints: [path.join(dir, "entry.ts")],
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
  const shown = JSON.parse(readFileSync(blocksPath, "utf-8"));
  const kindGuess = ["docx", "xlsx"].find((k) => {
    try {
      readFileSync(path.join(root, "frontend/public/originals", `${docId}.${k}`));
      return true;
    } catch {
      return false;
    }
  });
  const buf = readFileSync(path.join(root, "frontend/public/originals", `${docId}.${kindGuess}`));
  const template = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  try {
    const out = await mod.run(docId, shown, template);
    writeFileSync(outFile, out.bytes);
    if (reportPath) writeFileSync(reportPath, JSON.stringify({ ok: true, ...out.report }, null, 1));
    console.log(JSON.stringify({ ok: true, kind: out.kind, placed: out.report.placed, notPlaced: out.report.notPlaced.length, cleared: out.report.cleared, grids: out.report.grids }));
  } catch (e) {
    if (reportPath) writeFileSync(reportPath, JSON.stringify({ ok: false, error: String(e && e.stack ? e.stack : e) }, null, 1));
    console.log(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
    process.exitCode = 2;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
