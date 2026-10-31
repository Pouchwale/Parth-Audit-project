import React from "react";
import { FiDownload } from "react-icons/fi";
import type { DocumentDefinition } from "../../types";
import { documentFileKinds, downloadDocumentFile, type DocumentFileKind } from "../../utils/documentExport";
import { documentsOnScreen } from "../../utils/print";
import { documentTextIn } from "../../i18n/documentText";
import { useAppStore } from "../../store/AppStore";
import { useT } from "../../i18n";
import { logActivity } from "../../utils/activityLog";
import { isDocumentVisible, mayDo } from "../../engine/departmentScope";
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
  // Word and Excel both on a QC format (REQUIREMENTS §153), the document's one kind elsewhere.
  const kinds = documentFileKinds(doc);
  if (!doc || kinds.length === 0) return null;
  const roots = (): Element[] => {
    const holder = target?.();
    return !holder ? documentsOnScreen() : holder.matches("[data-print-doc]") ? [holder] : documentsOnScreen(holder).length > 0 ? documentsOnScreen(holder) : [holder];
  };
  const download = (kind: DocumentFileKind) => {
    // Asynchronous now: every line of a long sheet is drawn before the file is
    // made (utils/documentExport.ts). It never rejects.
    void downloadDocumentFile({ ...doc, name: documentTextIn(doc.name, lang) }, roots(), dateISO, kind);
    logActivity(kind === "xlsx" ? "Document downloaded as Excel" : "Document downloaded as Word", `${doc.formatNo.startsWith("TO BE") ? "" : `${doc.formatNo} `}${doc.name}`, dateISO ?? "", doc.id);
  };
  return (
    <>
      {kinds.map((kind) => (
        <button key={kind} className={`btn btn-secondary${small ? " btn-sm" : ""}`} data-action="download-document" data-format={kind} onClick={() => download(kind)} title={kind === "xlsx" ? "Download as an Excel workbook" : "Download as a Word document"}>
          <FiDownload size={13} /> {t(kind === "xlsx" ? "common.downloadExcel" : "common.downloadWord")}
        </button>
      ))}
      {/* Writing a file back into the records needs Write on the document (REQUIREMENTS §96): never offered to a person who reads it. */}
      {isDocumentVisible(doc) && mayDo(doc.id, "fill") && <UploadChangesButton doc={doc} roots={roots} small={small} />}
    </>
  );
}
