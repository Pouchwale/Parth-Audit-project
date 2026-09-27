// ATTACHMENTS FOR MITRA (REQUIREMENTS §80, engine/mitraAttachments.ts): which
// files may be attached, what a folder pick keeps, and how a file is read on
// the server — the states a chip shows (reading → ready / failed), the headers
// the request carries, and the plain note when the server cannot be reached.
import test from "node:test";
import assert from "node:assert/strict";
import { acceptFile, kindOf, MAX_ATTACHMENTS, MAX_FILE_BYTES, pickFromFolder, readAttachment } from "../src/engine/mitraAttachments";

const file = (name: string, bytes = 8, type = ""): File => new File([new Uint8Array(bytes)], name, type ? { type } : undefined);

test("acceptFile: a 20 MB file and an .exe are refused, hidden and system files are skipped, readable kinds are accepted", () => {
  const big = file("scan.pdf");
  Object.defineProperty(big, "size", { value: 20 * 1024 * 1024 });
  const tooBig = acceptFile(big);
  assert.equal(tooBig.ok, false);
  assert.match(!tooBig.ok ? tooBig.why : "", /15 MB/);
  assert.equal(acceptFile(file("just-under.pdf", 8)).ok, true);
  assert.ok(MAX_FILE_BYTES === 15 * 1024 * 1024);

  const exe = acceptFile(file("setup.exe"));
  assert.equal(exe.ok, false);
  assert.match(!exe.ok ? exe.why : "", /setup\.exe .*can read/, "named, with the kinds that can be");
  assert.equal(acceptFile(file(".DS_Store")).ok, false);
  assert.equal(acceptFile(file("Thumbs.db")).ok, false);
  assert.equal(acceptFile(file("~$report.docx")).ok, false);
  assert.equal(acceptFile(file("empty.pdf", 0)).ok, false);

  for (const name of ["report.pdf", "photo.jpg", "sheet.xlsx", "notes.csv", "readme.md", "letter.docx", "data.json", "scan.PNG"]) assert.equal(acceptFile(file(name)).ok, true, name);
  assert.equal(kindOf(file("photo.jpg")), "image");
  assert.equal(kindOf(file("sheet.xlsx")), "xlsx");
  assert.equal(kindOf(file("noext", 8, "image/png")), "image", "the mime type says what an extensionless file is");
  assert.equal(kindOf(file("noext", 8, "application/pdf")), "pdf");
  assert.equal(kindOf(file("noext")), "unknown");
});

test("pickFromFolder keeps the first ten readable files and says how many were left out", () => {
  const files = [...Array.from({ length: 11 }, (_, i) => file(`page-${i + 1}.pdf`)), file(".DS_Store"), file("Thumbs.db"), file("virus.exe")];
  const pick = pickFromFolder(files);
  assert.equal(pick.files.length, MAX_ATTACHMENTS);
  assert.equal(pick.files[0].name, "page-1.pdf");
  assert.equal(pick.files[9].name, "page-10.pdf");
  assert.equal(pick.skipped, 4, "the eleventh page, two system files and the .exe");
  assert.ok(pick.reasons.some((r) => /virus\.exe/.test(r)), "an unreadable file is named");
  assert.ok(pick.reasons.some((r) => /\b10\b/.test(r) && /\b1\b/.test(r)), `the cut is said — one left out, ten at most: ${pick.reasons.join(" | ")}`);
  assert.ok(!pick.reasons.some((r) => /DS_Store/.test(r)), "a hidden file needs no line");
  const few = pickFromFolder([file("a.pdf"), file("b.txt")]);
  assert.equal(few.files.length, 2);
  assert.equal(few.skipped, 0);
  assert.deepEqual(few.reasons, []);
});

test("readAttachment: reading → ready with the server's text and the right headers; a network failure → failed with a plain note", async () => {
  const real = globalThis.fetch;
  const seen: { url: string; headers: Record<string, string>; bodyBytes: number }[] = [];
  let mode: "ok" | "down" | "server-note" = "ok";
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body as Blob;
    seen.push({ url: String(url), headers, bodyBytes: body?.size ?? 0 });
    if (mode === "down") throw new TypeError("Failed to fetch");
    if (mode === "server-note") return new Response(JSON.stringify({ error: "Old .doc files cannot be read; save as .docx or PDF" }), { status: 415, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ name: "my report.pdf", kind: "pdf", text: "hello", characters: 5, truncated: false, pages: 1, readBy: "text" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const states: string[] = [];
    const a = await readAttachment(file("my report.pdf", 12, "application/pdf"), (x) => states.push(x.status));
    assert.deepEqual(states, ["reading", "ready"]);
    assert.equal(a.status, "ready");
    assert.equal(a.text, "hello");
    assert.equal(a.characters, 5);
    assert.equal(a.kind, "pdf");
    assert.equal(a.readBy, "text");
    assert.equal(a.name, "my report.pdf");
    assert.ok(a.id);
    assert.equal(seen[0].url, "/api/assistant/extract");
    assert.equal(seen[0].headers["x-file-name"], "my%20report.pdf");
    assert.equal(seen[0].headers["x-file-type"], "application/pdf");
    assert.equal(seen[0].bodyBytes, 12, "the raw bytes go as the body");

    mode = "down";
    const down: string[] = [];
    const b = await readAttachment(file("notes.txt", 4, "text/plain"), (x) => down.push(x.status));
    assert.deepEqual(down, ["reading", "failed"]);
    assert.equal(b.status, "failed");
    assert.ok(b.note && b.note.length > 0, "a plain note says why");

    mode = "server-note";
    const c = await readAttachment(file("old.doc", 4), () => {});
    assert.equal(c.status, "failed");
    assert.match(c.note ?? "", /save as \.docx or PDF/, "the server's own words are shown");

    mode = "ok";
    const states2: string[] = [];
    const img = await readAttachment(file("photo.png", 16, "image/png"), (x) => states2.push(x.status));
    assert.ok(img.dataUrl?.startsWith("data:image/png;base64,"), "a small picture keeps a preview");
    assert.equal(states2[0], "reading");
    assert.equal(img.status, "ready");
  } finally {
    globalThis.fetch = real;
  }
});
