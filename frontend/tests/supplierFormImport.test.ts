// F/PUR/01 FILLED FROM THE SUPPLIER'S OWN COPY OF THE FORM (REQUIREMENTS §191; engine/supplierFormImport.ts,
// components/records/SupplierFormImport.tsx): what the file gives fills the blank boxes at once and a written box only
// on Replace; a box the file can never fill (the office's) is left alone; the card stands on F/PUR/01 alone, above the
// form, and goes to the server by the same route a CV does. Run: npm run test:unit -- supplierFormImport
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SUPPLIER_FORM_KEYS, supplierFormFills } from "../src/engine/supplierFormImport";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");

test("the file's boxes fill the blank ones at once and the written ones only on Replace; the same words are nothing to do", () => {
  const fields = { supplierName: "Shree Ambica Packaging Pvt. Ltd.", contactPerson: "Mr. Hiren Patel", emailAddress: "sales@ambicapack.in", yearOfCommencement: "2009", statusOfSupplier: "Established" };
  const { fills, conflicts } = supplierFormFills(fields, { supplierName: "Shree Ambica Packaging Pvt Ltd", contactPerson: "Someone Else", emailAddress: "" });
  assert.deepEqual(fills, [
    { key: "emailAddress", before: "", after: "sales@ambicapack.in" },
    { key: "yearOfCommencement", before: "", after: "2009" },
  ]);
  assert.deepEqual(conflicts, [{ key: "contactPerson", before: "Someone Else", after: "Mr. Hiren Patel" }]);
  // A supplier's name differing in spacing alone is the same name; the office's box is never the file's to fill.
  assert.ok(!fills.some((f) => f.key === "supplierName") && !conflicts.some((f) => f.key === "supplierName"));
  assert.ok(!fills.some((f) => f.key === "statusOfSupplier"));
  // Only the boxes the format still has.
  assert.deepEqual(supplierFormFills(fields, {}, ["contactPerson"]).fills, [{ key: "contactPerson", before: "", after: "Mr. Hiren Patel" }]);
});

test("every box the file can fill is a box of F/PUR/01's supplier part, above the grid", () => {
  const layout = getLogSheetLayout("pur-supplier-registration")!;
  const keys = new Set(layout.headerFields.map((f) => f.key));
  for (const k of SUPPLIER_FORM_KEYS) assert.ok(keys.has(k), k);
  for (const f of layout.footerFields ?? []) assert.ok(!(SUPPLIER_FORM_KEYS as readonly string[]).includes(f.key), `${f.key} is the office's`);
});

test("the card stands on F/PUR/01 alone, above the form, and the file goes to the server as a CV does", () => {
  const view = read("frontend", "src", "components", "records", "LogSheetRecordView.tsx");
  assert.match(view, /\{supFetching && doc\.id === "pur-supplier-registration" && <SupplierFormImport key=\{`form-\$\{record\.id\}`\} layout=\{layout\} data=\{data\} onChange=\{save\} \/>\}/);
  const card = read("frontend", "src", "components", "records", "SupplierFormImport.tsx");
  assert.match(card, /data-action="supplier-form-read"/);
  assert.match(card, /data-action="supplier-form-replace"/);
  assert.match(card, /className="card mb-4 no-print" data-section="supplier-form-import"/);
  const client = read("frontend", "src", "api", "client.ts");
  assert.match(client, /readSupplierForm: \(file: File\) =>\n\s+request<SupplierFormReadResult>\("\/purchase\/supplier-form\/read", \{\n\s+method: "POST",\n\s+headers: \{ "Content-Type": "application\/octet-stream", "X-File-Name": encodeURIComponent\(file\.name\) \},/);
  const server = read("backend", "index.ts");
  assert.match(server, /app\.post\(\n\s+"\/api\/purchase\/supplier-form\/read",\n\s+requireAuth,\n\s+express\.raw\(\{ type: "application\/octet-stream", limit: SUPPLIER_FORM_MAX_BYTES \}\),/);
});
