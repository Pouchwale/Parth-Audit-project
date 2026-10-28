import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";
import { t } from "../../i18n";

// ARE YOU SURE? (REQUIREMENTS §138; the owner, 28-Oct-2026: "whenever any user make any change in format then system
// will ask him that are you sure or not? so user will click yes i am sure and no if not sure"). Every change to what a
// form prints waits for "Yes, I am sure": the format itself (Edit format, the sheet's designer, its header typed over,
// restoring the issued format) and the printed words or the page number typed over on one record. "No" leaves
// everything as it was. The question has to be answered: no cross, and a click beside it does nothing.
//
// The question is drawn on the page's body, beside nothing: it is asked from inside a table cell or a printed line, and
// what it holds must not land in the sheet or its printout. Its clicks and keys stay its own.

type Asked = { what: React.ReactNode; yes: () => void; no?: () => void };

const own = (e: React.SyntheticEvent) => e.stopPropagation();

export function useSureFirst(): { ask: (what: React.ReactNode, yes: () => void, no?: () => void) => void; dialog: React.ReactNode } {
  const [asked, setAsked] = useState<Asked | null>(null);
  const ask = useCallback((what: React.ReactNode, yes: () => void, no?: () => void) => setAsked({ what, yes, no }), []);
  const answer = (sure: boolean) => {
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
          </Modal>
        </div>,
        document.body
      )
    : null;
  return { ask, dialog };
}
