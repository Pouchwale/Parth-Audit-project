// THROWAWAY PROBE (deleted before commit): how the fill reader and the legacy command parser read the suites' phrases.
import test from "node:test";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { readFillRequest } from "../src/engine/fillRequest";
import { parseAssistantCommand } from "../src/engine/assistantCommands";
import { todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

test("probe", () => {
  const phrases = [
    "generate an external CAPA for me with sample data",
    "fill a CAPA record with sample data",
    "fill F/HR/14 with sample data",
    "generate a rat and mice service report with dummy data",
    "Open today's F-QC-30 and fill it with sample data",
    "fill it with sample data",
    "I want to fill the fly catcher record",
    "ask me question by question",
    "create a new daily pest control monitoring record for 1 September",
    "fill the register",
    "Fill today's daily pest control record",
    "fill it",
    "agreement number is GPC/2026/22",
    "fg code is fgsl3877",
    "row 1 remarks is Checked against the shade card",
    "row 1 tested value 4 is 200.06 gm",
    "14:00 viscosity is 20.4",
    "checker is Ramesh",
    "help me fill the daily pest control record",
  ];
  for (const p of phrases) {
    const r = readFillRequest(p, { today: todayISO(), isDemo: false });
    const c = parseAssistantCommand(p, false);
    const cOpen = parseAssistantCommand(p, true);
    console.log(
      JSON.stringify({
        p,
        fill: r.kind === "fill" ? { doc: r.doc?.id ?? null, cand: r.candidates.map((d) => d.id).slice(0, 5), mode: r.mode, rec: r.recordRef } : "not",
        legacy: c ? { kind: c.kind, doc: (c as { documentId?: string }).documentId ?? null, cand: (c as { candidates?: string[] }).candidates ?? null } : null,
        legacyOpen: cOpen ? cOpen.kind : null,
      })
    );
  }
});
