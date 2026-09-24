// EVERY DOCUMENT CAN BE FILLED WITH SAMPLE DATA AND SUBMITTED.
//
// This is tests/e2e_assistant_fill.py's every-document pass without the
// browser: for each document that holds records, start one (the shell the
// record page starts from, engine/recordDefaults.ts), ask for "fill it with
// sample data" (engine/sampleFill.ts, the very function Mitra's chat command
// calls) and put it through the submit checks (engine/validation.ts, the gate
// both the Submit button and Mitra's "submit this record" go through). A
// required box that nothing fills — a header field with no autoFill, a
// required column with no specimen, band or default — fails here in a tenth of
// a second instead of forty minutes into the Playwright run, and the failure
// names the document and what it was missing.
//
// It walks whatever the catalogue holds, so each format wired in later
// (REQUIREMENTS §74's Maintenance formats included) is covered the moment it is
// registered, with nothing to add here.
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { LocalStorageAdapter, storage } from "../src/data/storageAdapter";
import { seesEveryDepartment } from "../src/engine/departmentScope";
import { nextWorkingDay } from "../src/engine/holidays";
import { createDefaultData } from "../src/engine/recordDefaults";
import { canSampleFill, sampleFillRecord } from "../src/engine/sampleFill";
import { validateForSubmit } from "../src/engine/validation";
import { todayISO } from "../src/utils/date";
import { noProblems } from "./support/catalogue";

// What the app does first on every start (data/bootstrap.ts): the issued
// catalogue, the master data and the HR master sheet the formats fetch names
// from. The plant's historical records are added later, by the second pass.
ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();

// Nobody is signed in, so no department scope is set and the scoped
// repository answers with the whole catalogue — every department's documents,
// which is what the suite's administrator account sees too (REQUIREMENTS §40).
const recordable = documentRepository.getRecordable();
const master: MasterData = masterRepository.get();

// The Playwright suite starts each record TODAY, so today is always checked.
// On a closed day — the Thursday weekly off, a festival — the pest register
// arrives marked as a holiday and asks for nothing, so the next working day is
// checked as well; otherwise a Thursday run would never look at its checkpoints.
const today = todayISO();
const dates = Array.from(new Set([today, nextWorkingDay(today, master)]));

// A few records per document and date, not one: the sample fill draws its
// values from a generator seeded by the record's id, and the suite's records
// get a fresh id every run. A value that only goes wrong for some seeds would
// otherwise pass here and fail there.
const SEEDS = ["a", "b", "c"];

function describeDoc(doc: DocumentDefinition): string {
  return `${doc.id} (${doc.formatNo} — ${doc.name})`;
}

function fillAndSubmitProblems(): string[] {
  const problems: string[] = [];
  for (const doc of recordable) {
    if (!canSampleFill(doc.kind)) continue; // reported by its own test below
    for (const dueDate of dates) {
      for (const seed of SEEDS) {
        const shell: RecordInstance = {
          id: `unit-${seed}-${doc.id}-${dueDate}`,
          documentId: doc.id,
          periodKey: dueDate,
          dueDate,
          status: "In Progress",
          isDemo: false,
          data: createDefaultData(doc, dueDate, master),
          createdAt: `${dueDate}T09:00:00.000Z`,
          updatedAt: `${dueDate}T09:00:00.000Z`,
        };
        let where = "sample fill";
        try {
          const filled = sampleFillRecord(doc, shell, master, "Unit QA");
          if (!filled) {
            problems.push(`${describeDoc(doc)} on ${dueDate}: the sample fill returned nothing ("I couldn't put together sample data for this one")`);
            break;
          }
          where = "submit checks";
          const verdict = validateForSubmit(doc, { ...shell, data: filled.data });
          if (!verdict.valid) {
            const shown = verdict.errors.slice(0, 5).join(" | ");
            const more = verdict.errors.length > 5 ? ` | …and ${verdict.errors.length - 5} more` : "";
            problems.push(`${describeDoc(doc)} on ${dueDate} (seed ${seed}): ${shown}${more}`);
            break; // one seed's errors say it; the others would repeat them
          }
        } catch (err) {
          problems.push(`${describeDoc(doc)} on ${dueDate}: the ${where} threw ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
          break;
        }
      }
    }
  }
  return problems;
}

test("the whole catalogue is in view, on the browser's own storage class", () => {
  // scripts/unit-tests.ts stands a window and a localStorage up before the app
  // loads (tests/support/browserGlobals.ts); had it come too late, the adapter
  // would have fallen back to its in-memory stand-in and these tests would be
  // exercising a class nobody in the plant runs.
  assert.ok(storage instanceof LocalStorageAdapter, "data/storageAdapter.ts fell back to in-memory storage: the browser globals were installed too late");
  assert.ok(seesEveryDepartment(), "a department scope is set, so some documents would go unchecked");
  assert.ok(recordable.length > 0, "no recordable documents were seeded");
  console.log(`  ${recordable.length} recordable documents, checked for ${dates.join(" and ")}`);
});

test("every document that holds records can be filled with sample data", () => {
  // The Document Library offers New on every one of these, and the suite then
  // asks Mitra to fill it; a kind the sample fill does not know answers
  // "nothing to fill" and the suite fails on it.
  noProblems(
    "Documents whose kind the sample fill does not support",
    recordable.filter((d) => !canSampleFill(d.kind)).map((d) => `${describeDoc(d)}: kind "${d.kind}"`)
  );
});

test("sample data passes the submit checks — a fresh browser, filled from the specimens", () => {
  noProblems("Filled with sample data but refused on submit", fillAndSubmitProblems());
});

test("sample data passes the submit checks — with the plant's historical records on file", () => {
  // As the suite's server has them: the transcribed specimens (Verified, Live)
  // are what the fill now carries forward from, instead of the layouts' own
  // specimen rows — a second, different path through engine/autoFill.ts.
  ensureRecordsSeeded();
  noProblems("Filled with sample data but refused on submit", fillAndSubmitProblems());
});
