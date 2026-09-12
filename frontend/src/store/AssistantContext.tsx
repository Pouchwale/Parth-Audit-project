import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ComplaintChecklistData, RecordStatus } from "../types";

// Lets whichever document page is currently on screen hand its live record to
// the single, globally-mounted assistant widget (see DocumentAssistant.tsx,
// mounted once in App.tsx). Pages that aren't a record simply never register
// a target, so the widget stays visible everywhere but explains itself
// instead of trying to change anything.
//
// A record registers whatever its status. The widget decides what an edit
// needs: a draft is changed straight away; a submitted or verified record is
// only changed after the user confirms reopening it for correction (the page
// provides `reopen`), so an assistant edit can never slip past verification.
export interface AssistantTarget {
  // The server's field-guide kind ("daily-pest-monitoring", "log-sheet",
  // "gap", "training", "complaint-checklist", ...).
  documentKind: string;
  // The specific DocumentDefinition.id — distinct from documentKind, since
  // one kind (e.g. "service-report") covers several formats (Rodent/
  // General/Fly Control).
  documentId: string;
  recordId: string;
  status: RecordStatus;
  /** Can the data be changed right now, without reopening the record? */
  editable: boolean;
  /** What the model is shown (a log sheet adds its `_layout`). */
  currentData: unknown;
  /** The record's live data, exactly as stored. */
  getData: () => unknown;
  /** Printed labels (log-sheet columns) for readable change lists. */
  labels?: Record<string, string>;
  /** Saves a checked change now, with an "assistant" entry in the record's history. */
  commit: (next: unknown, note: string) => void;
  /** Reopens a submitted/verified record for correction; absent when that isn't possible. */
  reopen?: (reason: string) => void;
  // The rest of the record's life, so the assistant can do anything the
  // buttons can (engine/assistantCommands.ts). Each is absent when the page
  // can't do it right now — a draft has no Verify, a locked record no Submit.
  /** What to call this record when talking about it. */
  title?: string;
  /** Send it for verification. */
  submit?: () => { ok: boolean; errors: string[] };
  /** Verify it. */
  verify?: () => { ok: boolean; errors: string[] };
  /** Put a reopened record back exactly as it was. */
  cancelCorrection?: () => void;
  /** Delete it for good, with the reason recorded (engine/recordCrud.ts). */
  remove?: (reason: string) => void;
  /** Print the document alone. */
  print?: () => void;
  // Present only on a Customer Complaint Handling Checklist page: lets the
  // widget run its guided A→E walk-through against the live record and
  // drive the submit/approve steps (see engine/guidedChecklist.ts).
  checklist?: ChecklistBinding;
}

export interface ChecklistBinding {
  recordId: string;
  title: string; // e.g. "Complaint CC-07 · Gulab Oil And Food"
  getData: () => ComplaintChecklistData;
  setData: (data: ComplaintChecklistData) => void;
  editable: boolean;
  canApprove: boolean;
  submit: () => { ok: boolean; errors: string[] };
  approve: () => { ok: boolean; errors: string[] };
  sendBack: (reason: string) => void;
  // A brand-new / still-empty checklist asks the widget to open itself and
  // start the walk-through without the user having to find the button.
  autoStart: boolean;
}

interface AssistantContextValue {
  // The live target lives in a ref, not state: its data and callbacks change
  // on every keystroke, and re-rendering the whole app on every keystroke
  // (via context state) would re-render the registering page too, which
  // would hand back a new target object and re-trigger the same update —
  // an infinite loop. A ref lets reads always be fresh without ever
  // triggering a render.
  ref: React.MutableRefObject<AssistantTarget | null>;
  // Coarse, reactive signals for the widget to redraw on — only change when
  // the active target's kind/id/status actually changes, not on every
  // keystroke.
  targetKind: string | null;
  targetDocumentId: string | null;
  // Changes whenever something the widget renders from changes — the record,
  // its status or editability, or the checklist binding's flags — so the
  // widget's chips and greeting are right straight after a Submit or a
  // correction. Set from the registering page's effect, i.e. AFTER the ref
  // has been refreshed, so anything keyed on it reads a fresh ref.
  targetSignature: string;
  setTargetKind: (kind: string | null) => void;
  setTargetDocumentId: (id: string | null) => void;
  setTargetSignature: (s: string) => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<AssistantTarget | null>(null);
  const [targetKind, setTargetKind] = useState<string | null>(null);
  const [targetDocumentId, setTargetDocumentId] = useState<string | null>(null);
  const [targetSignature, setTargetSignature] = useState("");
  return (
    <AssistantContext.Provider value={{ ref, targetKind, targetDocumentId, targetSignature, setTargetKind, setTargetDocumentId, setTargetSignature }}>
      {children}
    </AssistantContext.Provider>
  );
}

function useAssistantInternal(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("Assistant hooks must be used within AssistantProvider");
  return ctx;
}

// Called from a document page's render with its current target (or null
// when it isn't a record page). Keeps the ref fresh on every render (cheap,
// no re-render triggered) and only flips the reactive signals when they
// actually change, so navigating away — or a record changing status —
// correctly updates the widget without looping.
export function useSetAssistantTarget(target: AssistantTarget | null) {
  const { ref, setTargetKind, setTargetDocumentId, setTargetSignature } = useAssistantInternal();

  useEffect(() => {
    ref.current = target;
    return () => {
      ref.current = null;
    };
  });

  const kind = target?.documentKind ?? null;
  const documentId = target?.documentId ?? null;
  const c = target?.checklist;
  const signature = [
    kind,
    documentId,
    target?.recordId ?? "",
    target?.status ?? "",
    target?.editable ? "e" : "",
    c?.editable ? "ce" : "",
    c?.canApprove ? "a" : "",
    c?.autoStart ? "s" : "",
  ].join("|");
  useEffect(() => {
    setTargetKind(kind);
    setTargetDocumentId(documentId);
    setTargetSignature(signature);
    return () => {
      setTargetKind(null);
      setTargetDocumentId(null);
      setTargetSignature("");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, documentId, signature]);
}

// Used by the globally-mounted widget: `hasTarget`/`targetKind`/
// `targetDocumentId`/`targetSignature` are safe to use in render/deps (they
// only change on navigation or a lifecycle change), `getTarget()` reads the
// always-fresh ref at the moment the user actually sends a message.
export function useAssistantTarget(): {
  hasTarget: boolean;
  targetKind: string | null;
  targetDocumentId: string | null;
  targetSignature: string;
  getTarget: () => AssistantTarget | null;
} {
  const { ref, targetKind, targetDocumentId, targetSignature } = useAssistantInternal();
  return { hasTarget: targetKind !== null, targetKind, targetDocumentId, targetSignature, getTarget: () => ref.current };
}
