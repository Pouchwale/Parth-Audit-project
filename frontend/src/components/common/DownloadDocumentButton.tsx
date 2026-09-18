import React from "react";
import { FiDownload } from "react-icons/fi";
import type { DocumentDefinition } from "../../types";
import { documentFileKind, downloadDocumentFile } from "../../utils/documentExport";
import { documentsOnScreen } from "../../utils/print";
import { documentTextIn } from "../../i18n/documentText";
import { useAppStore } from "../../store/AppStore";
import { useT } from "../../i18n";

// "Download Excel" / "Download Word" beside Print (REQUIREMENTS §54): the
// document on screen, as the kind of file it is (utils/documentExport.ts). A
// document that is only ever a PDF has no button — Print makes that.
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
  const download = () => {
    const holder = target?.();
    const roots = !holder ? documentsOnScreen() : holder.matches("[data-print-doc]") ? [holder] : documentsOnScreen(holder).length > 0 ? documentsOnScreen(holder) : [holder];
    downloadDocumentFile({ ...doc, name: documentTextIn(doc.name, lang) }, roots, dateISO);
  };
  return (
    <button className={`btn btn-secondary${small ? " btn-sm" : ""}`} data-action="download-document" data-format={kind} onClick={download} title={kind === "xlsx" ? "Download as an Excel workbook" : "Download as a Word document"}>
      <FiDownload size={13} /> {t(kind === "xlsx" ? "common.downloadExcel" : "common.downloadWord")}
    </button>
  );
}
