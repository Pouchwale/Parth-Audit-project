import React, { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { FiAlertTriangle, FiCheckCircle, FiUpload } from "react-icons/fi";
import type { DocumentDefinition } from "../../types";
import { Modal } from "./Modal";
import { useT } from "../../i18n";
import { documentTextIn } from "../../i18n/documentText";
import { useAppStore } from "../../store/AppStore";
import { useAssistantTarget } from "../../store/AssistantContext";
import { recordRepository } from "../../data/repositories/recordRepository";
import { documentRepository } from "../../data/repositories/documentRepository";
import { assistantConfigured } from "../../engine/features";
import { READ_MESSAGES, readUploadedFile, type ReadResult } from "../../engine/roundTrip/readFile";
import { planImport, type ImportPlan } from "../../engine/roundTrip/plan";
import {
  applyImport,
  fileAgainstScreen,
  howToChange,
  recordsWithWork,
  reopenReason,
  uploadPlanContext,
  workFor,
  type ApplyResult,
  type AppliedRecord,
  type RecordWay,
} from "../../engine/roundTrip/applyImport";
import { recordIdsIn } from "../../utils/documentExport";
import { formatDisplayDate, todayISO } from "../../utils/date";

// UPLOAD AN EDITED WORD/EXCEL FILE BACK INTO ITS RECORD (REQUIREMENTS §81).
//
// "Add options for the user in each and every document of every module so he
// can upload the Word or Excel with whatever changes the user has done in that
// document." Beside every Download Excel / Download Word
// (components/common/DownloadDocumentButton.tsx) there is now Upload changes.
// The person picks the file they downloaded and edited; it is read in the
// browser (engine/roundTrip/readFile.ts), compared with what was downloaded and
// with the record as it stands (engine/roundTrip/plan.ts), and the changes are
// SHOWN — box by box, was and now, new lines, what could not be read — before
// anything is saved. Apply writes exactly those (engine/roundTrip/applyImport.ts):
// through the open page when the record is on screen, else into the stored
// record, each with an "imported" line in its history; a signed-off record is
// reopened for correction first, with the reason recorded.
//
// Three pieces:
//   UploadChangesButton  the button itself. It makes a file input only when
//                        clicked (attached to <body> for the moment it is open,
//                        never kept in the page — suites fill the page's inputs
//                        by position) and hands the chosen file on.
//   UploadChangesHost    where the dialog is drawn: mounted once, after the app
//                        shell (App.tsx), so it outlives the button — a record
//                        reopened for correction redraws its action bar.
//   the dialog           the preview and the apply, in a Modal: the person opened
//                        it deliberately.
// Until the host is mounted, the first button on screen draws the dialog itself,
// so the feature never depends on it.

export interface UploadRequest {
  id: number;
  file: File;
  /** The document on screen (the button's). */
  doc: Pick<DocumentDefinition, "id" | "name" | "formatNo">;
  /** The records whose documents were on screen when the file was chosen. */
  screenRecordIds: string[];
}

// ---------------------------------------------------------------------------
// the open request, held outside React so the dialog outlives the button

let current: UploadRequest | null = null;
/**
 * What the open dialog shows, held here beside its request: a dialog drawn again
 * in another outlet (the button's action bar redrawn when a record is reopened)
 * carries on where it was — it never reads the file twice, and never loses an
 * apply that is under way or its result.
 */
let currentPhase: Phase = { phase: "reading" };
/** The request whose file has been handed to the reader. */
let readingFor = 0;
let requestSeq = 0;
let outletSeq = 0;
let stamp = 0;
/** Changes are being written: the dialog stays until they are, whatever else happens. */
let applying = false;
const listeners = new Set<() => void>();
const outlets: { id: number; host: boolean }[] = [];

function changed(): void {
  stamp++;
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* one outlet's trouble is not the others' */
    }
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => stamp;

/** Opens the upload dialog for a chosen file. */
export function openUploadChanges(req: Omit<UploadRequest, "id">): void {
  current = { ...req, id: ++requestSeq };
  currentPhase = { phase: "reading" };
  changed();
}

/** Closes it. */
export function closeUploadChanges(): void {
  if (!current) return;
  current = null;
  currentPhase = { phase: "reading" };
  changed();
}

/** Moves the dialog of request `id` on — ignored once that request is closed or replaced. */
function setPhaseFor(id: number, next: Phase): void {
  if (!current || current.id !== id) return;
  currentPhase = next;
  changed();
}

/** The request this outlet should draw, or null: the host when one is mounted, else the first button's outlet. */
function useOutlet(host: boolean): UploadRequest | null {
  const id = useRef(0);
  if (id.current === 0) id.current = ++outletSeq;
  useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    const entry = { id: id.current, host };
    outlets.push(entry);
    // Nothing to redraw unless a dialog is open: which outlet draws it may have changed.
    if (current) changed();
    return () => {
      const at = outlets.indexOf(entry);
      if (at >= 0) outlets.splice(at, 1);
      if (current) changed();
    };
  }, [host]);
  const active = outlets.find((o) => o.host) ?? outlets[0];
  return active && active.id === id.current ? current : null;
}

function Outlet({ host }: { host: boolean }) {
  const request = useOutlet(host);
  // Going to another page puts the preview away: it was of what that page showed.
  useEffect(() => {
    if (!request) return;
    const away = () => {
      if (!applying) closeUploadChanges();
    };
    window.addEventListener("hashchange", away);
    return () => window.removeEventListener("hashchange", away);
  }, [request]);
  if (!request || typeof document === "undefined") return null;
  return createPortal(
    <div className="no-print rt-layer" data-section="upload-changes-dialog">
      <UploadChangesDialog key={request.id} request={request} />
    </div>,
    document.body
  );
}

/**
 * Global: draws the upload dialog outside the page, so it survives the page
 * redrawing under it. Mount once inside AssistantProvider, after .app-shell
 * (beside MitraReaction in App.tsx).
 */
export function UploadChangesHost() {
  return <Outlet host />;
}

// ---------------------------------------------------------------------------
// the button

const ACCEPT = ".xlsx,.docx";

/** A file input made for this one choice: attached to <body> while the chooser is open, removed as soon as it answers. */
function chooseFile(onFile: (file: File) => void): void {
  if (typeof document === "undefined") return;
  try {
    for (const old of Array.from(document.querySelectorAll("input[data-input='upload-changes']"))) old.remove();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.setAttribute("data-input", "upload-changes");
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
    input.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    const done = () => {
      try {
        input.remove();
      } catch {
        /* already gone */
      }
    };
    input.addEventListener(
      "change",
      () => {
        const file = input.files && input.files[0];
        done();
        if (file) onFile(file);
      },
      { once: true }
    );
    input.addEventListener("cancel", done, { once: true });
    document.body.appendChild(input);
    input.click();
  } catch {
    /* no chooser here: nothing to upload */
  }
}

/**
 * "Upload changes", beside Download Excel / Download Word. `roots` gives the
 * documents the download would write — the records on screen, so a file of
 * another record of the same document can be told apart.
 */
export function UploadChangesButton({ doc, roots, small = true }: { doc: DocumentDefinition; roots: () => Element[]; small?: boolean }) {
  const t = useT();
  const { getTarget } = useAssistantTarget();
  const pick = () =>
    chooseFile((file) => {
      let screenRecordIds: string[] = [];
      try {
        screenRecordIds = recordIdsIn(roots());
      } catch {
        screenRecordIds = [];
      }
      try {
        const target = getTarget();
        if (target && target.documentId === doc.id && !screenRecordIds.includes(target.recordId)) screenRecordIds.push(target.recordId);
      } catch {
        /* no page target: the records on screen are all there is */
      }
      openUploadChanges({ file, doc: { id: doc.id, name: doc.name, formatNo: doc.formatNo }, screenRecordIds });
    });
  return (
    <>
      <button type="button" className={`btn btn-secondary${small ? " btn-sm" : ""} no-print`} data-action="upload-document-changes" onClick={pick} title={t("rt.uploadTitle")}>
        <FiUpload size={13} /> {t("rt.upload")}
      </button>
      <Outlet host={false} />
    </>
  );
}

// ---------------------------------------------------------------------------
// the dialog

type Phase =
  | { phase: "reading" }
  | { phase: "error"; key: string; noMap: boolean }
  | { phase: "other-document"; fileDoc: string; screenDoc: string }
  | { phase: "preview" | "applying"; plan: ImportPlan; other: boolean }
  | { phase: "applied"; plan: ImportPlan; other: boolean; result: ApplyResult };

const ERROR_KEYS: Record<Extract<ReadResult, { ok: false }>["reason"], string> = {
  "too-big": "rt.err.tooBig",
  "legacy-format": "rt.err.legacy",
  "not-office": "rt.err.notOffice",
  "no-map": "rt.err.noMap",
  damaged: "rt.err.damaged",
};

const SKIP_KEYS: Record<NonNullable<AppliedRecord["skipped"]>, string> = {
  gone: "rt.skip.gone",
  locked: "rt.skip.locked",
  "not-reopened": "rt.skip.notReopened",
  "not-saved": "rt.skip.notSaved",
};

const known = (formatNo: string | undefined) => (formatNo && !formatNo.startsWith("TO BE") ? formatNo : "");

function UploadChangesDialog({ request }: { request: UploadRequest }) {
  const t = useT();
  const { lang, currentUser, bump } = useAppStore();
  const { getTarget } = useAssistantTarget();
  // The phase lives beside the request (above), not in this component: see currentPhase.
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const phase: Phase = current && current.id === request.id ? currentPhase : { phase: "reading" };
  const setPhase = (next: Phase) => setPhaseFor(request.id, next);
  const fileName = request.file.name;

  // Read the file, then work out what it changes — against the record as it stands NOW.
  // Once per request, whichever outlet draws the dialog (and however often React runs the effect).
  useEffect(() => {
    if (readingFor === request.id) return;
    readingFor = request.id;
    const settle = (next: Phase) => setPhaseFor(request.id, next);
    readUploadedFile(request.file, fileName)
      .then((read) => {
        if (!read.ok) {
          const key = read.reason === "no-map" && read.message === READ_MESSAGES["map-stripped"] ? "rt.err.mapStripped" : ERROR_KEYS[read.reason] ?? "rt.err.damaged";
          settle({ phase: "error", key, noMap: read.reason === "no-map" });
          return;
        }
        const verdict = fileAgainstScreen(read.envelope, { documentId: request.doc.id, recordIds: request.screenRecordIds });
        if (verdict === "other-document") {
          const other = documentRepository.getById(read.envelope.documentId);
          const fileDoc = [known(other?.formatNo ?? read.envelope.formatNo), other ? documentTextIn(other.name, lang) : ""].filter(Boolean).join(" ") || read.envelope.documentId;
          const screenDoc = [known(request.doc.formatNo), documentTextIn(request.doc.name, lang)].filter(Boolean).join(" ");
          settle({ phase: "other-document", fileDoc, screenDoc });
          return;
        }
        // A file of this system that holds no box it can read back (a record
        // downloaded before anything was bound on it): said plainly, never
        // passed off as "nothing is different".
        if (read.entries.length === 0 && read.tables.length === 0) {
          settle({ phase: "error", key: "rt.err.nothingBound", noMap: true });
          return;
        }
        const plan = planImport(read, fileName, uploadPlanContext(getTarget, todayISO()));
        settle({ phase: "preview", plan, other: verdict === "other-record" });
      })
      .catch(() => settle({ phase: "error", key: "rt.err.damaged", noMap: false }));
    // The request is the dialog's whole reason to be: read once per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const plan = phase.phase === "preview" || phase.phase === "applying" || phase.phase === "applied" ? phase.plan : null;
  const otherRecord = (phase.phase === "preview" || phase.phase === "applying") && phase.other;
  // How each record can be changed, worked out once for the preview.
  const ways = useMemo(() => {
    const out = new Map<string, RecordWay>();
    if (!plan) return out;
    for (const id of recordsWithWork(plan)) out.set(id, howToChange(id, getTarget));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);
  const applicable = plan ? recordsWithWork(plan).filter((id) => ["edit", "reopen"].includes(ways.get(id)?.way ?? "")) : [];
  const count = plan ? applicable.reduce((n, id) => n + workFor(plan, id), 0) : 0;
  const busy = phase.phase === "applying";

  const close = () => {
    if (!busy) closeUploadChanges();
  };

  const apply = async () => {
    if (phase.phase !== "preview" || count === 0 || applying) return;
    const { plan: p, other } = phase;
    setPhase({ phase: "applying", plan: p, other });
    let result: ApplyResult;
    applying = true;
    try {
      result = await applyImport(p, { actor: currentUser, fileName, getTarget, onStored: bump });
    } catch {
      result = { applied: 0, failed: [], records: [] };
    } finally {
      applying = false;
    }
    setPhase({ phase: "applied", plan: p, other, result });
  };

  const toMitra = () => {
    try {
      window.dispatchEvent(new CustomEvent("dcrs:mitra-attach", { detail: { files: [request.file], text: "Apply the changes in this file to the open record." } }));
    } catch {
      /* the dock is not listening: nothing lost, the file is still on the person's computer */
    }
    closeUploadChanges();
  };

  /** "F/QC/01 · BOPP Film Inspection · 03-Oct-2026" for a record in the file. */
  const recordTitle = (recordId: string): string => {
    const stored = recordRepository.getById(recordId);
    const doc = documentRepository.getById(stored?.documentId ?? plan?.envelope.documentId ?? request.doc.id);
    const name = doc ? documentTextIn(doc.name, lang) : documentTextIn(request.doc.name, lang);
    return [known(doc?.formatNo ?? request.doc.formatNo), name, stored?.dueDate ? formatDisplayDate(stored.dueDate) : ""].filter(Boolean).join(" · ");
  };

  const otherWhich = (): string => {
    if (!plan) return "";
    const onScreen = new Set(request.screenRecordIds);
    return recordsWithWork(plan)
      .filter((id) => !onScreen.has(id))
      .map((id) => {
        const r = recordRepository.getById(id);
        return r?.dueDate ? formatDisplayDate(r.dueDate) : recordTitle(id);
      })
      .join(", ");
  };

  const statusWord = (s: string) => t(`status.${s}`);

  const footer = (
    <div className="flex items-center justify-end gap-2 wrap rt-footer">
      {phase.phase === "error" && phase.noMap && assistantConfigured() && (
        <button type="button" className="btn btn-secondary btn-sm" data-action="upload-to-mitra" onClick={toMitra} title={t("rt.letMitraHint")}>
          {t("rt.letMitra")}
        </button>
      )}
      <button type="button" className="btn btn-secondary btn-sm" data-action="close-upload-changes" onClick={close} disabled={busy}>
        {t("rt.close")}
      </button>
      {(phase.phase === "preview" || phase.phase === "applying") && count > 0 && (
        <button type="button" className="btn btn-primary btn-sm" data-action="apply-uploaded-changes" data-count={count} onClick={() => void apply()} disabled={busy}>
          {busy ? t("rt.applying") : count === 1 ? t("rt.applyOne") : t("rt.applyMany", { n: count })}
        </button>
      )}
    </div>
  );

  return (
    <Modal title={t("rt.dialogTitle", { file: fileName })} onClose={close} footer={footer} width={780}>
      <div className="rt-dialog" data-phase={phase.phase}>
        {phase.phase === "reading" && (
          <p className="text-muted" data-section="upload-reading">
            {t("rt.reading")}
          </p>
        )}

        {phase.phase === "error" && (
          <div className="rt-note rt-danger" data-section="upload-error" role="alert">
            <FiAlertTriangle size={15} aria-hidden="true" />
            <div>
              <p>{t(phase.key)}</p>
              {phase.noMap && assistantConfigured() && <p className="text-muted rt-small">{t("rt.letMitraHint")}</p>}
            </div>
          </div>
        )}

        {phase.phase === "other-document" && (
          <div className="rt-note rt-danger" data-section="upload-other-document" role="alert">
            <FiAlertTriangle size={15} aria-hidden="true" />
            <p>{t("rt.otherDocument", { fileDoc: phase.fileDoc, screenDoc: phase.screenDoc })}</p>
          </div>
        )}

        {plan && (
          <>
            {otherRecord && (
              <div className="rt-note rt-warn" data-section="upload-other-record">
                <FiAlertTriangle size={15} aria-hidden="true" />
                <p>{t("rt.otherRecord", { which: otherWhich() })}</p>
              </div>
            )}

            {phase.phase === "applied" ? (
              <AppliedSummary result={phase.result} recordTitle={recordTitle} />
            ) : (
              <>
                {plan.changes.length === 0 && plan.appends.length === 0 && plan.rejected.length === 0 && (
                  <p className="rt-note rt-info" data-section="upload-nothing">
                    {t("rt.nothing")}
                  </p>
                )}
                {recordsWithWork(plan).map((recordId) => {
                  const way = ways.get(recordId) ?? ({ way: "gone" } as RecordWay);
                  const changes = plan.changes.filter((c) => c.recordId === recordId);
                  const appends = plan.appends.filter((a) => a.recordId === recordId);
                  return (
                    <section key={recordId} className="rt-record" data-section="upload-record" data-record-id={recordId} data-way={way.way}>
                      <h4 className="rt-record-title">
                        <span translate="no">{recordTitle(recordId)}</span>
                        {way.way !== "gone" && <span className="rt-status">{statusWord(way.status)}</span>}
                      </h4>
                      {way.way === "reopen" && (
                        <p className="rt-note rt-warn" data-section="upload-reopen">
                          {t("rt.reopenNote", { status: statusWord(way.status), reason: reopenReason(fileName) })}
                        </p>
                      )}
                      {way.way === "locked" && (
                        <p className="rt-note rt-danger" data-section="upload-locked">
                          {way.why === "superseded"
                            ? t("rt.locked.superseded")
                            : way.why === "page"
                              ? t("rt.locked.page")
                              : way.why === "level"
                                ? t("rt.locked.level")
                                : t("rt.locked.status", { status: statusWord(way.status) })}
                        </p>
                      )}
                      {way.way === "gone" && (
                        <p className="rt-note rt-danger" data-section="upload-gone">
                          {t("rt.recordGone")}
                        </p>
                      )}
                      {changes.length > 0 && (
                        <div className="rt-table-wrap">
                          <table className="rt-table" data-section="upload-changes">
                            <thead>
                              <tr>
                                <th>{t("rt.col.box")}</th>
                                <th>{t("rt.col.was")}</th>
                                <th>{t("rt.col.now")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {changes.map((c) => (
                                <tr key={c.path} data-change-path={c.path} data-record-id={c.recordId} data-conflict={c.conflict ? "1" : undefined} data-moved={c.moved ? "1" : undefined}>
                                  <td className="rt-label">
                                    <span translate="no">{c.label}</span>
                                    {c.conflict && <span className="rt-conflict">{t("rt.conflict")}</span>}
                                    {c.moved && <span className="rt-conflict">{t("rt.moved")}</span>}
                                  </td>
                                  <td className="rt-was" translate="no">
                                    {c.before ? c.before : <span className="rt-empty">{t("rt.empty")}</span>}
                                  </td>
                                  <td className="rt-now" translate="no">
                                    {c.after ? c.after : <span className="rt-empty">{t("rt.empty")}</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {appends.length > 0 && (
                        <div className="rt-new-lines">
                          <div className="rt-subhead">{t("rt.newLines")}</div>
                          <ul data-section="upload-new-lines">
                            {appends.map((a, i) => (
                              <li key={i} data-append-list={a.listPath} data-record-id={a.recordId} translate="no">
                                {a.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </section>
                  );
                })}

                {plan.rejected.length > 0 && (
                  <div className="rt-rejected">
                    <div className="rt-subhead">{t("rt.rejected")}</div>
                    <ul data-section="upload-rejected">
                      {plan.rejected.map((r, i) => (
                        <li key={i} data-record-id={r.recordId}>
                          <strong translate="no">{r.label}</strong>
                          {r.text ? (
                            <>
                              {" — "}
                              <span translate="no">“{r.text}”</span>
                            </>
                          ) : null}
                          {": "}
                          <span>{r.whyKey ? t(r.whyKey, r.whyParams) : r.why}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(plan.unchanged > 0 || plan.missing > 0) && (
                  <p className="text-muted rt-small" data-section="upload-counts">
                    {plan.unchanged > 0 && <span data-count="unchanged">{plan.unchanged === 1 ? t("rt.countUnchangedOne") : t("rt.countUnchanged", { n: plan.unchanged })}</span>}
                    {plan.unchanged > 0 && plan.missing > 0 && <span> · </span>}
                    {plan.missing > 0 && <span data-count="missing">{t("rt.countMissing", { n: plan.missing })}</span>}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function AppliedSummary({ result, recordTitle }: { result: ApplyResult; recordTitle: (id: string) => string }) {
  const t = useT();
  const skipped = result.records.filter((r) => r.skipped);
  // Changes the record's page would not make (a checklist activity out of turn), with why.
  const refused = result.records.flatMap((r) => (r.refused ?? []).map((f) => ({ ...f, recordId: r.recordId })));
  const reopened = result.records.some((r) => r.reopened && r.applied > 0);
  return (
    <>
      <div className={`rt-note ${result.applied > 0 ? "rt-ok" : "rt-warn"}`} data-section="upload-applied" data-applied={result.applied} role="status">
        {result.applied > 0 ? <FiCheckCircle size={15} aria-hidden="true" /> : <FiAlertTriangle size={15} aria-hidden="true" />}
        <div>
          <p>{result.applied === 0 ? t("rt.appliedNone") : result.applied === 1 ? t("rt.appliedOne") : t("rt.appliedMany", { n: result.applied })}</p>
          {reopened && <p className="rt-small">{t("rt.reopened")}</p>}
        </div>
      </div>
      {(skipped.length > 0 || result.failed.length > 0 || refused.length > 0) && (
        <div className="rt-rejected">
          <div className="rt-subhead">{t("rt.notApplied")}</div>
          <ul data-section="upload-failed">
            {skipped.map((r) => (
              <li key={r.recordId} data-record-id={r.recordId}>
                <strong translate="no">{recordTitle(r.recordId)}</strong>: {t(SKIP_KEYS[r.skipped!])}
              </li>
            ))}
            {refused.map((f, i) => (
              <li key={`r${i}`} data-record-id={f.recordId}>
                <strong translate="no">{f.label}</strong>: <span>{f.whyKey ? t(f.whyKey, f.whyParams) : f.why}</span>
              </li>
            ))}
            {result.failed.map((label, i) => (
              <li key={`f${i}`} translate="no">
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
