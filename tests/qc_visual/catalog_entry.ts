// The QC documents DCRS holds, written out through the same code the pages read (documentRepository's seed list,
// getLogSheetLayout, the compliance statements): id, number, kind, section, the layout's page and paper, and which
// reference-only statement it is. Bundled and run by catalog.mjs; prints one JSON document on stdout.
import { SEED_DOCUMENTS } from "../../frontend/src/data/seed/documentDefinitions";
import { QC_GROUPS, QC_OVERVIEW_DOCUMENT_IDS } from "../../frontend/src/data/seed/qcModule";
import { getLogSheetLayout } from "../../frontend/src/data/seed/logSheetLayouts";

const ids = new Set<string>(QC_OVERVIEW_DOCUMENT_IDS);
const groupOf = new Map<string, string>();
for (const g of QC_GROUPS) for (const id of g.documentIds) groupOf.set(id, g.title);

const out = SEED_DOCUMENTS.filter((d) => ids.has(d.id) || /^qc-|^soc-/.test(d.id)).map((d) => {
  const layout = getLogSheetLayout(d.id) as unknown as Record<string, unknown> | undefined;
  return {
    id: d.id,
    name: d.name,
    formatNo: d.formatNo,
    revisionNo: d.revisionNo,
    revisionDate: d.revisionDate,
    kind: d.kind,
    module: d.module,
    section: d.section ?? null,
    group: groupOf.get(d.id) ?? null,
    department: d.department,
    sourceFile: d.sourceFile,
    referenceOnly: !!d.isReferenceOnly,
    frequency: d.frequency,
    layout: layout
      ? {
          page: (layout as { page?: unknown }).page ?? null,
          paper: (layout as { paper?: unknown }).paper ?? null,
          rowMode: ((layout as { rowMode?: { kind?: string } }).rowMode ?? {}).kind ?? null,
          keys: Object.keys(layout),
        }
      : null,
  };
});
process.stdout.write(JSON.stringify(out, null, 1));
