import React, { useMemo, useState } from "react";
import { FiSearch } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { formatDisplayDate } from "../utils/date";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { routeForRecord } from "../engine/reminders";
import { useT } from "../i18n";
import type {
  ComplaintChecklistData,
  DailyPestMonitoringData,
  FlyCatcherData,
  GapInspectionData,
  LogSheetData,
  RecordStatus,
  ServiceReportData,
  TrainingRecordData,
} from "../types";

interface SearchRow {
  id: string;
  route: string;
  documentName: string;
  dueDate: string;
  status: RecordStatus;
  isDemo: boolean;
  matchText: string;
  snippet: string;
}

function buildIndex(isDemo: boolean): SearchRow[] {
  const records = recordRepository.query({ isDemo });
  const docs = documentRepository.getAll();
  const rows: SearchRow[] = [];

  for (const r of records) {
    const doc = docs.find((d) => d.id === r.documentId);
    if (!doc) continue;
    const base = { id: r.id, dueDate: r.dueDate, status: r.status, isDemo: r.isDemo, documentName: doc.name };

    if (doc.kind === "daily-pest-monitoring") {
      const d = r.data as DailyPestMonitoringData;
      const catches = d.rodentCatches ?? [];
      const rodents = catches.reduce((s, c) => s + (Number(c.count) || 0), 0);
      rows.push({
        ...base,
        route: `/record/${r.id}`,
        matchText: [doc.name, r.dueDate, r.status, d.checker, r.id, rodents ? "rodent rodents" : "", ...catches.map((c) => `${c.trapBoxNo} ${c.location}`)].join(" ").toLowerCase(),
        snippet: rodents ? `${rodents} rodent${rodents === 1 ? "" : "s"} — ${catches.map((c) => `${c.trapBoxNo} ${c.location}`).join("; ")}` : `Checker: ${d.checker || "—"}`,
      });
    } else if (doc.kind === "fly-catcher") {
      const d = r.data as FlyCatcherData;
      rows.push({
        ...base,
        route: `/record/${r.id}`,
        matchText: [doc.name, r.dueDate, r.status, r.id, ...d.entries.map((e) => `${e.pcId} ${e.cleaningDoneBy} ${e.verifiedBy}`)].join(" ").toLowerCase(),
        snippet: `PC-01..PC-${String(d.entries.length).padStart(2, "0")}`,
      });
    } else if (doc.kind === "service-report") {
      const d = r.data as ServiceReportData;
      rows.push({
        ...base,
        route: `/record/${r.id}`,
        matchText: [doc.name, r.dueDate, r.status, r.id, d.serviceName, ...d.lines.map((l) => `${l.areaName} ${l.materialName}`)].join(" ").toLowerCase(),
        snippet: d.serviceName,
      });
    } else if (doc.kind === "gap-inspection") {
      const d = r.data as GapInspectionData;
      rows.push({
        ...base,
        route: `/gap/${r.id}`,
        matchText: [doc.name, r.dueDate, r.status, r.id, d.contactPerson, ...d.findings.map((f) => f.findingOfInspection)].join(" ").toLowerCase(),
        snippet: `${d.findings.length} finding(s)`,
      });
    } else if (doc.kind === "complaint-checklist") {
      const d = r.data as ComplaintChecklistData;
      const answered = d.sections.reduce((n, s) => n + s.items.filter((it) => it.done || it.notRequired).length, 0);
      const total = d.sections.reduce((n, s) => n + s.items.length, 0);
      rows.push({
        ...base,
        route: routeForRecord(doc, r.id),
        matchText: [doc.name, doc.formatNo, r.dueDate, r.status, r.id, d.customerName, d.complaintNo, d.jobName, d.jobCode, d.poNo, ...d.sections.flatMap((s) => s.items.map((it) => it.comment))].join(" ").toLowerCase(),
        snippet: `${d.complaintNo || "(no number)"} · ${d.customerName || "—"} · ${answered}/${total}`,
      });
    } else if (doc.kind === "complaint-ack") {
      const d = r.data as import("../types").ComplaintAckData;
      rows.push({
        ...base,
        route: routeForRecord(doc, r.id),
        matchText: [doc.name, doc.formatNo, r.dueDate, r.status, r.id, d.customerName, d.fgCode, d.jobName, d.toName, d.employeeName, d.complaintType, d.complaintSubType].join(" ").toLowerCase(),
        snippet: `${d.fgCode || "—"} · ${d.customerName || "—"} · ${d.jobName || "—"}`,
      });
    } else if (doc.kind === "pest-responsibilities") {
      const d = r.data as import("../types").PestResponsibilitiesData;
      rows.push({
        ...base,
        route: routeForRecord(doc, r.id),
        matchText: [doc.name, r.dueDate, r.status, r.id, d.client.name, d.provider.name, d.provider.organisation, ...d.siteResponsibilities].join(" ").toLowerCase(),
        snippet: `${d.client.name || "—"} / ${d.provider.name || "—"}`,
      });
    } else if (doc.kind === "training-record") {
      const d = r.data as TrainingRecordData;
      rows.push({
        ...base,
        route: `/training/${r.id}`,
        matchText: [doc.name, r.dueDate, r.status, r.id, d.trainerProvider, ...d.attendees.map((a) => a.employeeName)].join(" ").toLowerCase(),
        snippet: d.trainerProvider,
      });
    } else if (doc.kind === "log-sheet") {
      const d = r.data as LogSheetData;
      const headerVals = Object.values(d.header ?? {});
      const cellVals = (d.rows ?? []).flatMap((row) => Object.entries(row).filter(([k]) => k !== "id").map(([, v]) => `${v ?? ""}`));
      const jobs = (d.rows ?? []).map((row) => row.jobName).filter(Boolean);
      rows.push({
        ...base,
        route: `/record/${r.id}`,
        matchText: [doc.name, doc.formatNo, r.dueDate, r.status, r.id, ...headerVals, ...cellVals].join(" ").toLowerCase(),
        snippet: jobs.length ? `${jobs.length} job(s): ${jobs.slice(0, 2).join(", ")}${jobs.length > 2 ? "…" : ""}` : `${(d.rows ?? []).length} row(s)${headerVals[0] ? ` · ${headerVals[0]}` : ""}`,
      });
    }
  }
  return rows;
}

export function SearchPage() {
  const t = useT();
  const { mode } = useAppStore();
  const { navigate } = useRouter();
  const [q, setQ] = useState("");
  const isDemo = mode === "demo";

  const index = useMemo(() => buildIndex(isDemo), [isDemo]);
  const results = q.trim() ? index.filter((r) => r.matchText.includes(q.trim().toLowerCase())) : [];

  return (
    <div>
      <h1 className="text-2xl mb-1">{t("search.title")}</h1>
      <p className="text-muted mb-4">
        Search by record ID, document, format no., date, area, employee, checker, PC ID, job name, PO number, batch number or status.
      </p>
      <div className="field mb-4" style={{ maxWidth: 480 }}>
        <div className="input flex items-center gap-2" style={{ padding: "4px 10px" }}>
          <FiSearch size={15} className="text-faint" />
          <input
            autoFocus
            style={{ border: "none", outline: "none", flex: 1, fontSize: 13.5 }}
            placeholder="e.g. PC-04, Roshni, 2026-09, Rejected…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {q.trim() && (
        <div className="doc-table">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Detail</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted text-center" style={{ padding: 24 }}>
                    No matches.
                  </td>
                </tr>
              )}
              {results.map((r) => (
                <tr key={r.id} className="card-clickable" onClick={() => navigate(r.route)}>
                  <td>
                    {r.documentName} {r.isDemo && <DemoTag />}
                  </td>
                  <td>{formatDisplayDate(r.dueDate)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="text-sm text-muted">{r.snippet}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost btn-sm">Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
