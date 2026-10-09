import React from "react";
import { useAppStore } from "../../store/AppStore";
import { refusalFor } from "../../engine/accessRefusal";
import type { DocumentAction } from "../../engine/accessRules";

// WHY A BUTTON IS NOT HERE (REQUIREMENTS §96): one muted line, in the screens' language, naming what the person has
// on the document and the level the step needs ("F/HR/05 ... is Read only for you. Starting a record needs Write
// access: ask the super admin for it."). Nothing at all when the person may do it.
export function AccessReason({ documentId, action, className }: { documentId: string | undefined; action: DocumentAction; className?: string }) {
  const { uiLang } = useAppStore();
  const words = refusalFor(documentId, action, uiLang);
  if (!words) return null;
  return (
    <p className={`text-sm text-muted no-print ${className ?? ""}`} data-section="access-reason" data-needs={action}>
      {words}
    </p>
  );
}
