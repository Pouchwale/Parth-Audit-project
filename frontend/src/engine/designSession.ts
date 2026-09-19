import type { FormatDraft } from "./formatOps";

// THE FORMAT BEING DESIGNED ON SCREEN RIGHT NOW, IF ANY (REQUIREMENTS §64).
//
// A format can be changed two ways at once: by hand on the sheet
// (components/documents/SheetDesigner.tsx) and by telling Mitra
// (engine/formatCommands.ts). While a designer is open it holds a DRAFT nobody
// has saved yet, and a change Mitra saved straight to the stored format would
// be made behind that draft's back — the designer would then save over it, or
// show a sheet that is no longer the one on file.
//
// So an open designer registers itself here, and Mitra asks first: with a
// session open for the document, what it is told is applied TO THE DRAFT, on
// the sheet, in front of the person, and saved with everything else when they
// press Save — one revision, not two. With no session, Mitra saves the change
// itself as the next revision.
//
// One designer at a time: there is one screen.

export interface DesignSession {
  documentId: string;
  /** The draft as it stands on the sheet. */
  getDraft: () => FormatDraft;
  /** Puts `next` on the sheet as one undoable step; `what` says what it did, for the designer's own notice. */
  apply: (next: FormatDraft, what: string) => void;
}

let session: DesignSession | null = null;

export function openDesignSession(next: DesignSession): void {
  session = next;
}

/** Closes the session for `documentId` — a no-op when another document's designer has opened since. */
export function closeDesignSession(documentId: string): void {
  if (session?.documentId === documentId) session = null;
}

// EDIT FORMAT PRESSED SOMEWHERE ELSE — the Document Library's pencil. The sheet
// is designed on the format's own page, so the Library asks for that and goes
// there; the page takes the request as it opens. Memory only: it is an
// intention of this minute, not data.
let wanted: string | null = null;

export function requestDesign(documentId: string): void {
  wanted = documentId;
}

/** True once, for the document that was asked for. */
export function takeDesignRequest(documentId: string): boolean {
  if (wanted !== documentId) return false;
  wanted = null;
  return true;
}

export function designSessionFor(documentId: string | null | undefined): DesignSession | null {
  return documentId && session?.documentId === documentId ? session : null;
}
