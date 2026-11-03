import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";
import { t } from "../../i18n";
import { formatDisplayDate } from "../../utils/date";

// ARE YOU SURE? (REQUIREMENTS §138; the owner, 28-Oct-2026: "whenever any user make any change in format then system
// will ask him that are you sure or not? so user will click yes i am sure and no if not sure"). Every change to what a
// form prints waits for "Yes, I am sure": the format itself (Edit format, the sheet's designer, its header typed over,
// restoring the issued format) and the printed words or the page number typed over on one record. "No" leaves
// everything as it was. The question has to be answered: no cross, and a click beside it does nothing.
//
// The question is drawn on the page's body, beside nothing: it is asked from inside a table cell or a printed line, and
// what it holds must not land in the sheet or its printout. Its clicks and keys stay its own.

// AND, FOR A FORMAT, WHICH REVISION (REQUIREMENTS §148; the owner, 30-Oct-2026: "when user change anything in format so
// system should ask whether to save it with changing revision number and date or without it if user select change with
// revision number and date so system will ask him what the number and date of revision"): the question then offers
// "Save it as a new revision" - its number and date in boxes, the next number and today to start with - or "Save it
// without changing the revision", and Yes saves it the way chosen.

/** How a format change is saved: as a new revision with its number and date, or keeping the one it has. */
export type RevisionChoice = { keepRevision: true } | { keepRevision?: false; revisionNo: string; revisionDate: string };
/** The revision the format has, and the one offered for a new revision. */
export interface RevisionOffer {
  current: { no: string; date: string };
  next: { no: string; date: string };
}

type Asked = { what: React.ReactNode; yes: (choice?: RevisionChoice) => void; no?: () => void; revision?: RevisionOffer };

const own = (e: React.SyntheticEvent) => e.stopPropagation();
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function useSureFirst(): {
  ask: (what: React.ReactNode, yes: (choice?: RevisionChoice) => void, no?: () => void, revision?: RevisionOffer) => void;
  dialog: React.ReactNode;
} {
  const [asked, setAsked] = useState<Asked | null>(null);
  const [kind, setKind] = useState<"new" | "keep">("new");
  const [revNo, setRevNo] = useState("");
  const [revDate, setRevDate] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const ask = useCallback((what: React.ReactNode, yes: (choice?: RevisionChoice) => void, no?: () => void, revision?: RevisionOffer) => {
    setAsked({ what, yes, no, revision });
    setKind("new");
    setRevNo(revision?.next.no ?? "");
    setRevDate(revision?.next.date ?? "");
    setProblem(null);
  }, []);
  const answer = (sure: boolean) => {
    if (sure && asked?.revision) {
      if (kind === "keep") {
        setAsked(null);
        asked.yes({ keepRevision: true });
        return;
      }
      if (!revNo.trim()) return setProblem(t("sure.revisionNoNeeded"));
      if (!ISO.test(revDate)) return setProblem(t("sure.revisionDateNeeded"));
      setAsked(null);
      asked.yes({ revisionNo: revNo.trim(), revisionDate: revDate });
      return;
    }
    setAsked(null);
    if (sure) asked?.yes();
    else asked?.no?.();
  };
  const dialog = asked
    ? createPortal(
        <div
          className="no-print sure-first"
          data-section="sure-first"
          role="alertdialog"
          aria-modal="true"
          aria-label={t("sure.title")}
          onClick={own}
          onMouseDown={own}
          onPointerDown={own}
          onFocus={own}
          onBlur={own}
          onKeyDown={(e) => {
            own(e);
            if (e.key === "Escape") answer(false);
          }}
        >
          <Modal
            title={t("sure.title")}
            onClose={() => answer(false)}
            dismissible={false}
            width={480}
            footer={
              <div className="flex justify-end gap-2" style={{ width: "100%" }}>
                <button type="button" className="btn btn-ghost btn-sm" data-action="sure-no" onClick={() => answer(false)} autoFocus>
                  {t("sure.no")}
                </button>
                <button type="button" className="btn btn-primary btn-sm" data-action="sure-yes" onClick={() => answer(true)}>
                  {t("sure.yes")}
                </button>
              </div>
            }
          >
            <div className="text-sm" data-section="sure-first-what">
              {asked.what}
            </div>
            {asked.revision && (
              <div className="text-sm mt-3" data-section="sure-first-revision">
                <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
                  <input type="radio" name="sure-revision" data-choice="revision-new" checked={kind === "new"} onChange={() => setKind("new")} />
                  <span>{t("sure.revisionNew")}</span>
                </label>
                {kind === "new" && (
                  <div className="flex gap-3 mt-1" style={{ paddingLeft: 26, flexWrap: "wrap" }}>
                    <label className="text-xs text-muted">
                      {t("sure.revisionNo")}
                      <input className="input input-sm notranslate" translate="no" data-field="revision-no" value={revNo} onChange={(e) => setRevNo(e.target.value)} style={{ width: 90, display: "block" }} />
                    </label>
                    <label className="text-xs text-muted">
                      {t("sure.revisionDate")}
                      <input type="date" className="input input-sm" data-field="revision-date" value={revDate} onChange={(e) => setRevDate(e.target.value)} style={{ display: "block" }} />
                    </label>
                  </div>
                )}
                <label className="flex items-center gap-2 mt-2" style={{ cursor: "pointer" }}>
                  <input type="radio" name="sure-revision" data-choice="revision-keep" checked={kind === "keep"} onChange={() => setKind("keep")} />
                  <span>{t("sure.revisionKeep", { rev: asked.revision.current.no || "—", date: asked.revision.current.date ? formatDisplayDate(asked.revision.current.date) : "—" })}</span>
                </label>
                {problem && (
                  <p className="text-xs mt-1" role="alert" data-section="sure-revision-problem" style={{ color: "var(--danger, #b91c1c)" }}>
                    {problem}
                  </p>
                )}
              </div>
            )}
          </Modal>
        </div>,
        document.body
      )
    : null;
  return { ask, dialog };
}
