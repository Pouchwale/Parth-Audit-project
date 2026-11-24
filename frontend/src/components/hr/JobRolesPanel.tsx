import React, { useMemo, useState } from "react";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../../types";
import { hrMasterRepository } from "../../data/repositories/hrMasterRepository";
import { recordRepository } from "../../data/repositories/recordRepository";
import { mayDo } from "../../engine/departmentScope";
import { JOB_ROLES, jobRoleOfPerson, jobSheetOfRole, sameJobRole } from "../../engine/jobRoles";
import { createRecordForDocument } from "../../engine/recordCrud";
import { saveDraft } from "../../engine/recordLifecycle";
import { fieldLabels } from "../../engine/recordPatch";
import { routeForRecord } from "../../engine/reminders";
import { useAppStore } from "../../store/AppStore";
import { useRouter } from "../../store/router";

// F/HR/07: EVERY ROLE, ITS DESCRIPTION ONE CLICK AWAY (REQUIREMENTS §307). A role's sheet is made when HR opens it, filled, and is never
// made before: fifty-one open sheets nobody asked for yet would stand in everybody's reminders and briefing.
export function JobRolesPanel({ doc }: { doc: DocumentDefinition }) {
  const { mode, version, bump, currentUser } = useAppStore();
  const { navigate } = useRouter();
  const [query, setQuery] = useState("");
  const isDemo = mode === "demo";
  const sheets = useMemo(
    () => recordRepository.query({ documentId: doc.id, isDemo }) as RecordInstance<LogSheetData>[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.id, isDemo, version]
  );
  const people = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of hrMasterRepository.all()) {
      const role = jobRoleOfPerson(p);
      if (role) count.set(role.key, (count.get(role.key) ?? 0) + 1);
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  const words = query.trim().toLowerCase();
  const shown = JOB_ROLES.filter((r) => !words || r.title.toLowerCase().includes(words) || r.reportsTo.toLowerCase().includes(words));
  const mayStart = mayDo(doc.id, "start");
  const sheetOf = (title: string) => sheets.find((s) => sameJobRole(s.data?.header?.position, title));

  const open = (title: string) => {
    const role = JOB_ROLES.find((r) => r.title === title);
    if (!role) return;
    const held = sheetOf(title);
    if (held) {
      navigate(routeForRecord(doc, held.id));
      return;
    }
    const { record } = createRecordForDocument(doc, { isDemo });
    const made = record as RecordInstance<LogSheetData>;
    const saved = saveDraft(made, jobSheetOfRole(role, made.data), currentUser, {
      action: "edited",
      note: role.draft ? `Filled with the draft job description of ${role.title}, for HR to check` : `Filled with the job description of ${role.title} from the company's F/HR/07`,
      labels: fieldLabels(doc.kind, doc.id),
    });
    bump();
    navigate(routeForRecord(doc, saved.id));
  };

  return (
    <div className="card mb-4 no-print" data-section="job-roles">
      <div className="card-pad">
        <div className="flex items-center justify-between gap-3 wrap mb-3">
          <div>
            <div className="font-semibold">Job description by role</div>
            <div className="text-xs text-muted">
              {JOB_ROLES.length} roles. Open a role to get its sheet filled. "Draft" roles are not in the company's files, so HR checks them before signing.
            </div>
          </div>
          <input className="input input-sm" style={{ maxWidth: 260 }} data-field="job-role-search" aria-label="Search roles" placeholder="Search role" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div style={{ maxHeight: 340, overflow: "auto" }}>
          <table className="records-list" data-table="job-roles" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Role</th>
                <th style={{ textAlign: "left" }}>Reports to</th>
                <th>People</th>
                <th>Source</th>
                <th>Sheet</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const held = sheetOf(r.title);
                return (
                  <tr key={r.key} data-role={r.key}>
                    <td className="font-semibold">{r.title}</td>
                    <td>{r.reportsTo}</td>
                    <td style={{ textAlign: "center" }}>{people.get(r.key) ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{r.draft ? "Draft" : "Company file"}</td>
                    <td style={{ textAlign: "center" }}>{held ? held.status : "Not started"}</td>
                    <td style={{ textAlign: "right" }}>
                      {(held || mayStart) && (
                        <button className="btn btn-secondary btn-sm" data-action="open-job-role" onClick={() => open(r.title)}>
                          Open
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted">
                    No role has those words.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
