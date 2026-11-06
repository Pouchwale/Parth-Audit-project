// THE SERVICE AGREEMENT ON F/PUR/01 AND ITS TWO MONTHS' WARNING (REQUIREMENTS §192): the record's VALID UPTO box, the card
// above the form for everyone who holds the list (uploading for whoever writes), the API by the same route a CV goes, and
// the server's reading of the date into the notification plan. The plan and the words are proved in notificationPlan and
// notificationText; the routes in backend/tests/supplierAgreements.test.ts. Run: npm run test:unit -- supplierAgreement
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { EXPIRY_WARNING_MONTHS, NOTIFICATION_KINDS, PLANNED_KINDS } from "../src/engine/notificationPlan";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");

test("F/PUR/01 has the VALID UPTO date box in the office's block, and the warning is two months", () => {
  const layout = getLogSheetLayout("pur-supplier-registration")!;
  const box = (layout.footerFields ?? []).find((f) => f.key === "agreementValidUpto");
  assert.deepEqual([box?.label, box?.type], ["SERVICE AGREEMENT / CERTIFICATE VALID UPTO :", "date"]);
  assert.equal(EXPIRY_WARNING_MONTHS, 2);
  assert.ok(NOTIFICATION_KINDS.includes("expiry") && PLANNED_KINDS.includes("expiry"));
});

test("the card stands on F/PUR/01 for everyone who holds the list; the file goes to the server as a CV does; the server reads the date into the plan", () => {
  const view = read("frontend", "src", "components", "records", "LogSheetRecordView.tsx");
  assert.match(view, /\{supLink && doc\.id === "pur-supplier-registration" && purchaseMasterHeld\(\) && <SupplierAgreementCard key=\{`agreement-\$\{record\.id\}`\} recordId=\{record\.id\} data=\{data\} editable=\{editable\} \/>\}/);
  const card = read("frontend", "src", "components", "records", "SupplierAgreementCard.tsx");
  for (const mark of ['data-action="agreement-upload"', 'data-action="agreement-open"', 'data-action="agreement-remove-sure"', 'data-state="agreement-validity"', "monthsBefore(validUpto, EXPIRY_WARNING_MONTHS)"]) assert.ok(card.includes(mark), mark);
  const client = read("frontend", "src", "api", "client.ts");
  assert.match(client, /upload: \(recordId: string, file: File, note: string\) =>\n\s+request<\{ file: SupplierAgreementFile \}>\(`\/purchase\/agreements\/\$\{encodeURIComponent\(recordId\)\}`, \{\n\s+method: "POST",\n\s+headers: \{ "Content-Type": "application\/octet-stream", "X-File-Name": encodeURIComponent\(file\.name\), "X-File-Note": encodeURIComponent\(note\) \},/);
  const host = read("frontend", "src", "engineHost", "entry.ts");
  assert.match(host, /\.\.\.\(r\.documentId === "pur-supplier-registration" \? agreementOf\(r\.data\) : \{\}\),/);
  assert.match(host, /const validUpto = String\(header\.agreementValidUpto \?\? ""\)\.trim\(\);/);
  const server = read("backend", "index.ts");
  assert.match(server, /registerAgreementRoutes\(app, \{\n\s+requireAuth,\n\s+logActivity,\n\s+store: createDatabaseAgreementStore\(\),\n\s+may: async \(user\) => \{\n\s+const view = await accessViewOf\(user\);\n\s+return \{ read: holdsPurchaseMaster\(view\), write: writesPurchaseMaster\(view\) \};/);
  // The push lists every kind in its order of urgency (backend/push.ts): the expiry among them.
  assert.match(read("backend", "push.ts"), /expiry: 8,/);
});
