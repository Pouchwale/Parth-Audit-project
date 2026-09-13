import { readJSON, writeJSON } from "../storageAdapter";
import { COMPLIANCE_STATEMENTS, type ComplianceStatement } from "../seed/complianceStatements";

// CORRECTIONS TO THE REFERENCE DOCUMENTS. The Statements of Compliance were
// transcribed from the company's files; where a word came out
// wrong, a person can correct it on the page. The transcription stays in the
// code as the source; a correction is stored beside it with who made it and
// when, and "Restore the original" drops it again. (The service provider's
// licence is not here: it is kept exactly as issued, on the owner's
// instruction. The Chemical Master's rows are master data and are corrected
// there, in masterRepository.)

const KEY = "referenceEdits";

export interface ReferenceEdit<T> {
  data: T;
  editedBy: string;
  editedAt: string;
}

type Store = Record<string, ReferenceEdit<unknown>>;

const load = (): Store => readJSON<Store>(KEY, {});

export const referenceRepository = {
  get<T>(docId: string): ReferenceEdit<T> | undefined {
    return load()[docId] as ReferenceEdit<T> | undefined;
  },
  save<T>(docId: string, data: T, by: string): boolean {
    return writeJSON(KEY, { ...load(), [docId]: { data, editedBy: by, editedAt: new Date().toISOString() } });
  },
  reset(docId: string): boolean {
    const store = load();
    delete store[docId];
    return writeJSON(KEY, store);
  },
};

/** A Statement of Compliance as it reads now — corrected where someone corrected it. */
export function complianceStatement(documentId: string): ComplianceStatement | undefined {
  const issued = COMPLIANCE_STATEMENTS[documentId];
  if (!issued) return undefined;
  const corrected = referenceRepository.get<ComplianceStatement>(documentId)?.data;
  return corrected ? { ...issued, ...corrected, documentId } : issued;
}

export function allComplianceStatements(): ComplianceStatement[] {
  return Object.keys(COMPLIANCE_STATEMENTS).map((id) => complianceStatement(id)!);
}
