import React, { useMemo, useState } from "react";
import { FiChevronDown, FiChevronRight, FiDownload, FiFileText, FiFolder, FiHardDrive, FiPrinter } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { documentRepository } from "../data/repositories/documentRepository";
import { routeForRecord } from "../engine/reminders";
import { filesRoute, monthsInRange, normaliseRange, recordsInRange, resolveFileScope } from "../engine/fileScope";
import { moduleSlug } from "../utils/moduleSlug";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { toCSV, downloadCSV } from "../utils/csv";
import { useT } from "../i18n";
import { useProgressiveCount } from "../utils/useProgressive";
import { MONTH_NAMES, formatDisplayDate, todayISO } from "../utils/date";
import { printDocument } from "../utils/print";
import type { DailyPestMonitoringData, DocumentDefinition, RecordInstance } from "../types";

// DOCUMENT FILES — /files[/{scope}/{from}/{to}]
//
// The records laid out like a file system: a folder per module, a folder per
// document inside it, a folder per month, and one file per record — for
// exactly the dates chosen, never "the whole calendar of that month". This is
// where the assistant takes someone who asks for "all pest control documents
// from 1 to 19 January" or "lamination files from June to August"; the same
// view is in the sidebar for browsing by hand. Opening a file opens that
// record (engine/reminders.ts routeForRecord), so everything is still edited
// in one place. See engine/fileScope.ts.

// Above this many files, only the first month folder opens by itself — the
// rest open with a click, so a year of records doesn't paint thousands of rows.
const OPEN_ALL_UP_TO = 120;

type Selection = { kind: "module"; module: string } | { kind: "doc"; id: string } | null;

function MonthFolder({
  ym,
  records,
  docsById,
  defaultOpen,
  onOpen,
}: {
  ym: string;
  records: RecordInstance[];
  docsById: Map<string, DocumentDefinition>;
  defaultOpen: boolean;
  onOpen: (r: RecordInstance) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1;
  const empty = records.length === 0;
  const showOpen = open && !empty;
  // A month of hundreds of files shows its first lines at once and the rest a batch at a time.
  const rowsShown = useProgressiveCount(showOpen ? records.length : 0, 40, 80);
  return (
    <div className={`file-month ${empty ? "empty" : ""}`} data-month={ym}>
      <button type="button" className="file-month-head" onClick={() => setOpen((o) => !o)} aria-expanded={showOpen} disabled={empty}>
        {showOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
        <FiFolder size={15} />
        <span className="file-month-name">
          {MONTH_NAMES[m]} {y}
        </span>
        <span className="file-count">{empty ? t("files.folderEmpty") : t("files.count", { n: records.length })}</span>
      </button>
      {showOpen && (
        <div className="doc-table file-table-wrap">
          <table className="file-table">
            <tbody>
              {records.slice(0, rowsShown).map((r) => {
                const doc = docsById.get(r.documentId);
                const holiday = r.documentId === "daily-pest-monitoring" && (r.data as DailyPestMonitoringData)?.isHoliday;
                return (
                  <tr key={r.id} className="file-row" data-file-date={r.dueDate} data-doc={r.documentId} onClick={() => onOpen(r)} title={doc?.name}>
                    <td className="file-when">
                      <FiFileText size={14} className="file-icon" />
                      <span className="file-date">{formatDisplayDate(r.dueDate)}</span>
                    </td>
                    <td className="file-name">
                      <span className="file-doc">{doc?.name ?? r.documentId}</span>
                      {doc?.formatNo && doc.formatNo !== "TO BE CONFIRMED" && <span className="file-format">{doc.formatNo}</span>}
                    </td>
                    <td className="file-status">
                      {holiday ? <span className="badge badge-Scheduled">Holiday</span> : <StatusBadge status={r.status} />}
                      {r.isDemo && <DemoTag />}
                    </td>
                    <td className="file-by text-xs text-muted notranslate" translate="no">{r.verifiedBy ? `✓ ${r.verifiedBy}` : r.submittedBy ? r.submittedBy : "—"}</td>
                    <td className="file-open">
                      <button className="btn btn-ghost btn-sm">{t("common.open")}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FileBrowserPage({ scope, from, to }: { scope?: string; from?: string; to?: string }) {
  const { mode, version } = useAppStore();
  const { navigate } = useRouter();
  const t = useT();
  const isDemo = mode === "demo";
  const scopeKey = scope || "all";
  const range = normaliseRange(from, to);
  const resolved = resolveFileScope(scopeKey);
  const [selected, setSelected] = useState<Selection>(null);

  const docIds = resolved.docs.map((d) => d.id);
  const records = useMemo(
    () => recordsInRange(docIds, range.from, range.to, isDemo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey, range.from, range.to, isDemo, version]
  );
  const docsById = new Map(documentRepository.getAll().map((d) => [d.id, d]));
  const modulesInScope = Array.from(new Set(resolved.docs.map((d) => d.module)));
  const allModules = Array.from(new Set(documentRepository.getRecordable().map((d) => d.module)));
  // Every folder's count from one pass over the records, not a pass per folder.
  const counts = useMemo(() => {
    const byDoc = new Map<string, number>();
    const byModule = new Map<string, number>();
    for (const r of records) {
      byDoc.set(r.documentId, (byDoc.get(r.documentId) ?? 0) + 1);
      const mod = docsById.get(r.documentId)?.module;
      if (mod) byModule.set(mod, (byModule.get(mod) ?? 0) + 1);
    }
    return { byDoc, byModule };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const visible = records.filter((r) => {
    if (!selected) return true;
    if (selected.kind === "doc") return r.documentId === selected.id;
    return docsById.get(r.documentId)?.module === selected.module;
  });
  const months = monthsInRange(range.from, range.to);
  const byMonth = new Map<string, RecordInstance[]>(months.map((ym) => [ym, []]));
  for (const r of visible) byMonth.get(r.dueDate.slice(0, 7))?.push(r);
  const firstFull = months.find((ym) => (byMonth.get(ym)?.length ?? 0) > 0);
  const docsWithFiles = new Set(visible.map((r) => r.documentId)).size;

  const go = (nextScope: string, nextFrom: string, nextTo: string) => {
    setSelected(null);
    navigate(filesRoute(nextScope, nextFrom, nextTo));
  };
  const today = todayISO();
  const thisMonth = normaliseRange(undefined, undefined, today);
  const lastMonthEnd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
  const lastMonth = { from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd };
  const thisYear = { from: `${today.slice(0, 4)}-01-01`, to: today };

  const scopeLabel =
    resolved.kind === "all"
      ? t("files.allModules")
      : resolved.kind === "module" && resolved.module
        ? t(`module.${resolved.module}`)
        : resolved.docs.length === 1
          ? resolved.docs[0].name
          : resolved.docs.map((d) => d.name).join(", ");
  const selectionLabel = !selected ? null : selected.kind === "module" ? t(`module.${selected.module}`) : docsById.get(selected.id)?.name;

  const exportCSV = () => {
    const rows = visible.map((r) => {
      const d = docsById.get(r.documentId);
      return [r.dueDate, d?.module ?? "", d?.name ?? r.documentId, d?.formatNo ?? "", r.status, r.submittedBy ?? "", r.verifiedBy ?? ""];
    });
    downloadCSV(`files-${scopeKey}-${range.from}-to-${range.to}.csv`, toCSV(["Date", "Module", "Document", "Format No.", "Status", "Submitted by", "Verified by"], rows));
  };

  return (
    <div className={isDemo ? "demo-watermark" : ""} data-section="file-browser">
      <div className="flex items-center justify-between wrap gap-3 mb-1">
        <div>
          <h1 className="text-2xl mb-1">
            <FiHardDrive size={20} style={{ verticalAlign: -3 }} /> {t("files.title")}
          </h1>
          <p className="text-muted text-sm">{t("files.intro")}</p>
        </div>
        <div className="flex gap-2 no-print">
          <button className="btn btn-secondary btn-sm" onClick={exportCSV} disabled={visible.length === 0}>
            <FiDownload size={13} /> {t("common.exportCsv")}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => printDocument()}>
            <FiPrinter size={13} /> {t("common.print")}
          </button>
        </div>
      </div>

      <div className="file-controls card no-print">
        <div className="card-pad flex gap-3 wrap items-end">
          <div className="field" style={{ minWidth: 200 }}>
            <label>{t("files.scope")}</label>
            <select className="input input-sm" data-field="files-scope" value={scopeKey} onChange={(e) => go(e.target.value, range.from, range.to)}>
              <option value="all">{t("files.allModules")}</option>
              {allModules.map((m) => (
                <option key={m} value={moduleSlug(m)}>
                  {t(`module.${m}`)}
                </option>
              ))}
              {resolved.kind === "documents" && <option value={scopeKey}>{scopeLabel}</option>}
            </select>
          </div>
          <div className="field">
            <label>{t("files.from")}</label>
            <input type="date" className="input input-sm" data-field="files-from" value={range.from} onChange={(e) => e.target.value && go(scopeKey, e.target.value, range.to)} />
          </div>
          <div className="field">
            <label>{t("files.to")}</label>
            <input type="date" className="input input-sm" data-field="files-to" value={range.to} onChange={(e) => e.target.value && go(scopeKey, range.from, e.target.value)} />
          </div>
          <div className="flex gap-1 wrap">
            <button className="btn btn-ghost btn-sm" onClick={() => go(scopeKey, thisMonth.from, thisMonth.to)}>
              {t("files.thisMonth")}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => go(scopeKey, lastMonth.from, lastMonth.to)}>
              {t("files.lastMonth")}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => go(scopeKey, thisYear.from, thisYear.to)}>
              {t("files.thisYear")}
            </button>
          </div>
        </div>
      </div>

      <div className="file-breadcrumb" data-section="file-breadcrumb">
        <button type="button" className="crumb" onClick={() => setSelected(null)}>
          {t("files.allFiles")}
        </button>
        <span className="sep">›</span>
        <span className="crumb">{scopeLabel}</span>
        {selectionLabel && (
          <>
            <span className="sep">›</span>
            <span className="crumb">{selectionLabel}</span>
          </>
        )}
        <span className="sep">›</span>
        <span className="crumb range">
          {formatDisplayDate(range.from)} → {formatDisplayDate(range.to)}
        </span>
      </div>

      <div className="file-browser">
        <nav className="file-tree card no-print" data-section="file-tree" aria-label={t("files.title")}>
          <button type="button" className={`file-node root ${!selected ? "active" : ""}`} onClick={() => setSelected(null)}>
            <FiHardDrive size={14} /> <span className="file-node-name">{scopeLabel}</span>
            <span className="file-count">{records.length}</span>
          </button>
          {modulesInScope.map((mod) => {
            const docs = resolved.docs.filter((d) => d.module === mod);
            const moduleCount = counts.byModule.get(mod) ?? 0;
            return (
              <div key={mod} className="file-tree-module">
                {modulesInScope.length > 1 && (
                  <button
                    type="button"
                    className={`file-node module ${selected?.kind === "module" && selected.module === mod ? "active" : ""}`}
                    data-folder={`module:${moduleSlug(mod)}`}
                    onClick={() => setSelected({ kind: "module", module: mod })}
                  >
                    <FiFolder size={14} /> <span className="file-node-name">{t(`module.${mod}`)}</span>
                    <span className="file-count">{moduleCount}</span>
                  </button>
                )}
                {docs.map((d) => {
                  const n = counts.byDoc.get(d.id) ?? 0;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={`file-node doc ${modulesInScope.length > 1 ? "nested" : ""} ${selected?.kind === "doc" && selected.id === d.id ? "active" : ""} ${n === 0 ? "empty" : ""}`}
                      data-folder={`doc:${d.id}`}
                      onClick={() => setSelected({ kind: "doc", id: d.id })}
                      title={d.name}
                    >
                      <FiFolder size={13} /> <span className="file-node-name">{d.name}</span>
                      <span className="file-count">{n}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <section className="file-pane" data-print-doc>
          <div className="file-summary text-sm" data-section="file-summary">
            {t("files.summary", { files: visible.length, docs: docsWithFiles, from: formatDisplayDate(range.from), to: formatDisplayDate(range.to) })}
            {range.capped && <span className="text-muted"> — {t("files.capped")}</span>}
          </div>
          {visible.length === 0 ? (
            <div className="empty-state file-empty">
              <FiFolder size={28} />
              <div className="mt-2 font-semibold">{t("files.empty")}</div>
              {!isDemo && <div className="text-xs text-muted mt-1">{t("files.emptyHint")}</div>}
            </div>
          ) : (
            months.map((ym) => (
              <MonthFolder
                key={`${ym}|${selected ? JSON.stringify(selected) : ""}`}
                ym={ym}
                records={byMonth.get(ym) ?? []}
                docsById={docsById}
                defaultOpen={visible.length <= OPEN_ALL_UP_TO || ym === firstFull}
                onOpen={(r) => navigate(routeForRecord(docsById.get(r.documentId), r.id))}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
}
