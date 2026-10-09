import React from "react";
import { FiLock } from "react-icons/fi";
import { useRouter } from "../../store/router";
import { accessAccount, departmentScopeLabel, documentDepartmentLabel } from "../../engine/departmentScope";

// WHAT A PERSON SEES WHEN THEY REACH ANOTHER DEPARTMENT'S DOCUMENT — by an
// old bookmark, a link somebody sent them, or a record address typed by hand
// (REQUIREMENTS §40).
//
// It says whose document it is and what to do about it. What it must never do
// is show the document's contents, or read like a fault in the system: a
// screen saying "document definition missing" would send somebody looking for
// a bug that isn't there.
export function NotYourDepartment({
  documentId,
  formatNo,
  what = "document",
}: {
  documentId: string;
  formatNo?: string;
  /** "record", "register", "report" — what they were trying to open. */
  what?: string;
}) {
  const { navigate } = useRouter();
  const owner = documentDepartmentLabel(documentId, formatNo);
  return (
    <div className="empty-state" data-state="not-your-department" data-department={owner}>
      <h2 className="text-xl mb-2">
        <FiLock size={16} style={{ verticalAlign: -2 }} /> This {what} belongs to {owner}
      </h2>
      {/* By the access levels (REQUIREMENTS §96): No access on this document; the super admin gives Read, Write or Edit on Users & Access. */}
      {accessAccount() ? (
        <p className="text-muted mb-3" style={{ maxWidth: 560, margin: "0 auto 14px" }} data-section="no-access">
          You do not have access to this {what}. You see {departmentScopeLabel()}. If you need it, ask the super admin to give you Read, Write or Edit
          on it — Users &amp; Access.
        </p>
      ) : (
        <p className="text-muted mb-3" style={{ maxWidth: 560, margin: "0 auto 14px" }}>
          Your account covers {departmentScopeLabel()}, so this {what} isn't yours to open. Every document belongs to the department that
          owns its format on the company's Master List of Formats &amp; Records (F/SYS/02). If you need it, ask the system administrator to
          add {owner} to your account — Master Data → Departments &amp; access.
        </p>
      )}
      <button className="btn btn-secondary" onClick={() => navigate("/dashboard")}>
        Back to the Dashboard
      </button>
    </div>
  );
}
