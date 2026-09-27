import React from "react";
import { FiDownload } from "react-icons/fi";
import type { DocumentDefinition } from "../../types";
import { documentFileKind, downloadDocumentFile } from "../../utils/documentExport";
import { documentsOnScreen } from "../../utils/print";
import { documentTextIn } from "../../i18n/documentText";
import { useAppStore } from "../../store/AppStore";
import { useT } from "../../i18n";
import { logActivity } from "../../utils/activityLog";
import { isDocumentVisible } from "../../engine/departmentScope";
import { UploadChangesButton } from "./UploadChanges";

// "Download Excel" / "Download Word" beside Print (REQUIREMENTS §54): the
// document on screen, as the kind of file it is (utils/documentExport.ts). A
// document that is only ever a PDF has no button — Print makes that.
//
// And beside it, "Upload changes" (REQUIREMENTS §81): the same file, edited in
// Excel or Word, read back into the record after the person has seen what it
// changes (components/common/UploadChanges.tsx). Only where the download is —
// a PDF-only document has neither — and only for a document of the viewer's own
// departments (engine/departmentScope.ts), the same rule every page opens a
// document by.
export function DownloadDocumentButton({
  doc,
  dateISO,
  target,
  small = true,
}: {
  doc: DocumentDefinition | null | undefined;
  dateISO?: string;
  /** What to download: the document itself, or something holding it. Every document on screen when not given. */
  target?: () => Element | null | undefined;
  small?: boolean;
}) {
  const t = useT();
  // The file arrives named as the form READS: a Gujarati format downloaded
  // while English is chosen is English inside, so its name is too
  // (REQUIREMENTS §58). Its format number is untouched either way.
  const { lang } = useAppStore();
  const kind = documentFileKind(doc);
  if (!doc || kind === "pdf") return null;
  const roots = (): Element[] => {
    const holder = target?.();
    return !holder ? documentsOnScreen() : holder.matches("[data-print-doc]") ? [holder] : documentsOnScreen(holder).length > 0 ? documentsOnScreen(holder) : [holder];
  };
  const download = () => {
    // Asynchronous now: every line of a long sheet is drawn before the file is
    // made (utils/documentExport.ts). It never rejects.
    void downloadDocumentFile({ ...doc, name: documentTextIn(doc.name, lang) }, roots(), dateISO);
    logActivity(kind === "xlsx" ? "Document downloaded as Excel" : "Document downloaded as Word", `${doc.formatNo.startsWith("TO BE") ? "" : `${doc.formatNo} `}${doc.name}`, dateISO ?? "", doc.id);
  };
  return (
    <>
      <button className={`btn btn-secondary${small ? " btn-sm" : ""}`} data-action="download-document" data-format={kind} onClick={download} title={kind === "xlsx" ? "Download as an Excel workbook" : "Download as a Word document"}>
        <FiDownload size={13} /> {t(kind === "xlsx" ? "common.downloadExcel" : "common.downloadWord")}
      </button>
      {isDocumentVisible(doc) && <UploadChangesButton doc={doc} roots={roots} small={small} />}
    </>
  );
}
