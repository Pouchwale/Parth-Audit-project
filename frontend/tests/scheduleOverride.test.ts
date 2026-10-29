// THE FREQUENCY THE SUPER ADMIN SET (REQUIREMENTS §143, the owner, 29-Oct-2026): laid over the issued schedule for every
// reader of the catalogue, from the day it was set; dropped, the issued one stands again. Without a browser.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { dueDatesInMonth, scheduleLabel } from "../src/engine/frequencyEngine";

ensureDocumentsSeeded();
ensureMasterSeeded();
const root = process.env.DCRS_REPO_ROOT ?? process.cwd();

test("a frequency set in Master Data is the document's for every reader, from its day; As issued puts the seed's back", () => {
  const id = "qc-weight-scale-calibration";
  const issued = documentRepository.getByIdUnscoped(id)!;
  assert.equal(issued.schedule.type, "weekly");
  masterRepository.update({ scheduleOverrides: { [id]: { schedule: { type: "monthly", dayOfMonth: 5 }, frequency: "Monthly", since: "2026-10-29", by: "Super Admin" } } });
  const now = documentRepository.getByIdUnscoped(id)!;
  assert.deepEqual(now.schedule, { type: "monthly", dayOfMonth: 5 });
  assert.equal(now.frequency, "Monthly");
  assert.equal(now.scheduleSince, "2026-10-29", "the old schedule's sheets stand; the new one starts from this day");
  assert.deepEqual(dueDatesInMonth(now, 2026, 10), ["2026-11-05"], "the calendar and the generator read the same definition");
  assert.equal(scheduleLabel(now), "Day 5 of each month");
  assert.equal(documentRepository.getAllUnscoped().find((d) => d.id === id)!.frequency, "Monthly");
  masterRepository.update({ scheduleOverrides: {} });
  const back = documentRepository.getByIdUnscoped(id)!;
  assert.equal(back.schedule.type, "weekly");
  assert.equal(back.scheduleSince, issued.scheduleSince);
});

test("a reference document (a licence, a chart) takes no frequency; the picker and the column are the super admin's page's", () => {
  const ref = documentRepository.getAllUnscoped().find((d) => d.isReferenceOnly)!;
  masterRepository.update({ scheduleOverrides: { [ref.id]: { schedule: { type: "daily" }, frequency: "Daily", since: "2026-10-29", by: "x" } } });
  assert.deepEqual(documentRepository.getByIdUnscoped(ref.id)!.schedule, ref.schedule);
  masterRepository.update({ scheduleOverrides: {} });
  const page = readFileSync(path.join(root, "frontend", "src", "pages", "MasterDataPage.tsx"), "utf8");
  assert.match(page, /<FrequencyPicker/);
  assert.match(page, /if \(!mayOpenMasterData\(user\)\)/, "the page itself is the super admin's (§134)");
  const picker = readFileSync(path.join(root, "frontend", "src", "components", "master", "FrequencyPicker.tsx"), "utf8");
  assert.match(picker, /sure\.ask\(/, "asked first (§138)");
});
