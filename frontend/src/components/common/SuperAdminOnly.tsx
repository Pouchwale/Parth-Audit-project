import React from "react";
import { useAppStore } from "../../store/AppStore";
import { systemRefusalLine, systemRefusalTitle, type SystemPage } from "../../engine/systemSection";

/**
 * THE SYSTEM SECTION'S REFUSAL (REQUIREMENTS §116): what a page of the System section shows anybody but the super
 * admin who reaches it by its address — Reports, Master Data, the Activity Log, the Performance Scorecard, Insights,
 * Demo Mode. The same shape as Users & Access's and the User access dashboard's refusals (`empty-state`,
 * `data-state="not-admin"`), with the words in the screens' language (engine/systemSection.ts), so the words live once.
 */
export function SuperAdminOnly({ page }: { page: SystemPage }) {
  const { uiLang } = useAppStore();
  return (
    <div className="empty-state" data-page={page} data-state="not-admin" data-section="super-admin-only">
      <h2 className="text-xl mb-2">{systemRefusalTitle(uiLang)}</h2>
      <p className="text-muted">{systemRefusalLine(uiLang, page)}</p>
    </div>
  );
}
