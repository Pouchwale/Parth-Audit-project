// Bundles tests/originals_check/blocks_entry.ts into one script the check puts into the page (an IIFE; nothing exported).
//   node tests/originals_check/bundle_blocks.mjs <out.js>
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) throw new Error("usage: node bundle_blocks.mjs <out.js>");
await esbuild.build({
  entryPoints: [path.join(here, "blocks_entry.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  outfile: out,
  jsx: "automatic",
  loader: { ".tsx": "tsx", ".ts": "ts", ".css": "empty" },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
console.log(`bundled ${out}`);
