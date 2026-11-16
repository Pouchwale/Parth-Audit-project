// THE PURCHASE DRIVE'S FOLDERS (REQUIREMENTS §231; engine/driveTree.ts): the root's Suppliers and the folders people made;
// Suppliers' folder for every supplier; folders made anywhere, a supplier's included; the way down; whose a folder is.
// Run: npm run test:unit -- driveTree
import test from "node:test";
import assert from "node:assert/strict";
import type { SupplierDriveFolder } from "../src/api/client";
import { childFolders, folderChoices, nameOf, parentOf, supplierOf, trail } from "../src/engine/driveTree";

const suppliers = [
  { id: "pms-2", supplierName: "Shree Labels" },
  { id: "pms-1", supplierName: "Garware Hi-Tech Films Limited" },
];
const f = (id: string, parentId: string, name: string): SupplierDriveFolder => ({ id, parentId, name, createdBy: "Chirag Parmar", createdAt: "2026-11-16T07:00:00Z" });
const folders = [f("fld-cert", "", "Certificates 2026"), f("fld-iso", "fld-cert", "ISO"), f("fld-audits", "supplier:pms-1", "Audits"), f("fld-oct", "fld-audits", "October")];

test("the root: Suppliers first, then the folders people made; Suppliers: every supplier by name", () => {
  assert.deepEqual(childFolders("", folders, suppliers).map((n) => [n.name, n.kind]), [["Suppliers", "suppliers"], ["Certificates 2026", "folder"]]);
  assert.deepEqual(childFolders("suppliers", folders, suppliers).map((n) => n.name), ["Garware Hi-Tech Films Limited", "Shree Labels"]);
  assert.deepEqual(childFolders("supplier:pms-1", folders, suppliers).map((n) => n.name), ["Audits"], "a folder made inside a supplier's");
});

test("the way down, its names, and whose a folder is however deep", () => {
  assert.deepEqual(trail("fld-oct", folders, suppliers).map((s) => s.name), ["Purchase Drive", "Suppliers", "Garware Hi-Tech Films Limited", "Audits", "October"]);
  assert.equal(parentOf("supplier:pms-1", folders), "suppliers");
  assert.equal(nameOf("fld-iso", folders, suppliers), "ISO");
  assert.equal(supplierOf("fld-oct", folders, suppliers)?.id, "pms-1", "a folder inside a supplier's is that supplier's");
  assert.equal(supplierOf("fld-iso", folders, suppliers), null, "a folder of the root is nobody's");
});

test("every folder to move to, by its path; never a folder into itself", () => {
  const all = folderChoices(folders, suppliers);
  assert.ok(all.some((c) => c.label === "Purchase Drive / Suppliers / Garware Hi-Tech Films Limited / Audits / October"));
  const forCert = folderChoices(folders, suppliers, "fld-cert").map((c) => c.id);
  assert.ok(!forCert.includes("fld-cert") && !forCert.includes("fld-iso"), "not itself, not what is inside it");
});
