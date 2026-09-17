// Production build script.
// Bundles the React/TypeScript app with esbuild and copies static assets to dist/.
// (No Vite/Tailwind toolchain is available in this build sandbox — esbuild is used
// directly. See DEPLOYMENT.md for details. The output is static, but the app needs the
// backend's API for login and the assistant — `npm start` serves both from one process.)
import * as esbuild from "esbuild";
import { promises as fs } from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

async function main(): Promise<void> {
  // Overwrite files in place rather than rm-ing the whole dist/ tree first:
  // deleting and recreating the directory is prone to a persistent EBUSY on
  // Windows (search indexer / antivirus / an open Explorer window holding a
  // handle on the folder) since the output file set is fixed and stable,
  // in-place overwrite is equally correct and avoids that class of failure.
  await fs.mkdir(path.join(dist, "assets"), { recursive: true });

  const result = await esbuild.build({
    entryPoints: [path.join(root, "src", "main.tsx")],
    bundle: true,
    outfile: path.join(dist, "assets", "app.js"),
    format: "iife",
    jsx: "automatic",
    target: "es2020",
    sourcemap: true,
    minify: true,
    loader: { ".tsx": "tsx", ".ts": "ts", ".css": "css" },
    define: { "process.env.NODE_ENV": '"production"' },
    metafile: true,
    logLevel: "info",
  });

  await fs.writeFile(path.join(dist, "meta.json"), JSON.stringify(result.metafile, null, 2));

  // Copy static assets (index.html, styles.css, public/*)
  await fs.copyFile(path.join(root, "src", "styles.css"), path.join(dist, "assets", "styles.css"));
  await fs.copyFile(path.join(root, "index.html"), path.join(dist, "index.html"));

  // Compressed copies for the server to send to browsers that accept them
  // (backend/index.ts): the script is a quarter of the size over the network.
  for (const name of ["app.js", "styles.css"]) {
    const file = path.join(dist, "assets", name);
    const raw = await fs.readFile(file);
    await fs.writeFile(`${file}.br`, zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }));
    await fs.writeFile(`${file}.gz`, zlib.gzipSync(raw, { level: 9 }));
  }

  const publicDir = path.join(root, "public");
  try {
    await copyDir(publicDir, dist);
  } catch {
    /* public dir optional */
  }

  console.log("\nBuild complete -> " + dist);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
