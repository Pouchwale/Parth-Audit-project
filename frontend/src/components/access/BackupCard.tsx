import React, { useCallback, useEffect, useState } from "react";
import { FiAlertTriangle, FiArchive, FiCheckCircle, FiDatabase, FiDownload, FiLoader } from "react-icons/fi";
import { ApiError, backupApi, type BackupFile, type BackupKind, type BackupStatus } from "../../api/client";
import { downloadBlob } from "../../utils/csv";
import { formatDisplayDateTime } from "../../utils/date";

// BACKUPS — the super admin's two buttons on Users & Access (the owner, 2-Nov-2026: "give two options like backup
// database, and backup with code and database"). The server does the work (backend/backupRoutes.ts): the database
// through the same script as `npm run db:backup`, the code as one zip of the repository with the database's files
// inside it. This card starts a run, follows it while it runs, says how it ended, and lists every backup file in the
// server's backup folder with a download button for each.

const KIND_WORDS: Record<BackupFile["kind"], string> = {
  database: "Database",
  roles: "Database roles",
  mitra: "Mitra's database",
  "code-and-database": "Code and database",
  other: "Other",
};

export function formatFileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function BackupCard() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await backupApi.status());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The backups could not be read.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While a backup runs the card asks the server every two seconds how it is going.
  const running = !!status?.running;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [running, load]);

  const start = async (kind: BackupKind) => {
    setStarting(true);
    setError(null);
    try {
      setStatus(await backupApi.start(kind));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The backup could not be started.");
    } finally {
      setStarting(false);
    }
  };

  const download = async (name: string) => {
    setDownloading(name);
    setError(null);
    try {
      downloadBlob(name, await backupApi.download(name));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `${name} could not be downloaded.`);
    } finally {
      setDownloading(null);
    }
  };

  const last = status?.last ?? null;
  const busy = starting || running || !status;
  return (
    <div className="card mb-4" data-section="backup" data-state={status ? (running ? "running" : "idle") : "loading"}>
      <div className="card-header">
        <h3 className="text-base font-semibold">
          <FiArchive size={14} style={{ verticalAlign: -2 }} /> Backups
        </h3>
        {status?.running && (
          <span className="badge badge-InProgress" data-state="backup-badge">
            <FiLoader size={11} style={{ verticalAlign: -1 }} /> Backing up {status.running.kind === "database" ? "the database" : "the code and the database"}…
          </span>
        )}
      </div>
      <div className="card-pad text-sm">
        <p className="text-muted mb-2">
          <strong>Database</strong>: every record, account, setting and activity line, as a PostgreSQL dump with the server&apos;s roles beside it.{" "}
          <strong>Code and database</strong>: the same, plus one zip of the whole application — its source, built website, documents and git history — with the
          database files inside, ready to set up again on another computer. The keys in backend/.env are left out of the zip on purpose; copy that file by hand.
        </p>
        <div className="flex gap-2 wrap">
          <button className="btn btn-primary btn-sm" data-action="backup-database" disabled={busy} onClick={() => void start("database")}>
            <FiDatabase size={12} /> Back up the database
          </button>
          <button className="btn btn-secondary btn-sm" data-action="backup-code-and-database" disabled={busy} onClick={() => void start("code-and-database")}>
            <FiArchive size={12} /> Back up the code and the database
          </button>
        </div>
        {status?.running && (
          <p className="text-sm mt-2 text-muted" data-state="backup-running">
            Started by {status.running.by} at {formatDisplayDateTime(status.running.startedAt)}. This page follows it; the code zip can take a few minutes.
          </p>
        )}
        {last && !running && (
          <p className="text-sm mt-2" data-state={last.ok ? "backup-done" : "backup-failed"}>
            {last.ok ? (
              <FiCheckCircle size={13} style={{ verticalAlign: -2, color: "var(--color-success)" }} />
            ) : (
              <FiAlertTriangle size={13} style={{ verticalAlign: -2, color: "var(--color-danger)" }} />
            )}{" "}
            {last.message} {last.finishedAt ? `(${formatDisplayDateTime(last.finishedAt)}, by ${last.by})` : ""}
          </p>
        )}
        {error && (
          <p className="auth-error mt-2" data-state="backup-error">
            {error}
          </p>
        )}
        {status && (
          <div className="mt-3">
            <div className="text-xs text-muted mb-1">
              Backup files on the server, in <code>{status.dir}</code>. Database files older than fourteen days and all but the three newest code zips are removed by the
              next backup.
            </div>
            {status.files.length === 0 ? (
              <div className="text-sm text-muted" data-state="backup-empty">
                No backup yet.
              </div>
            ) : (
              <table className="compact" data-section="backup-files">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>What</th>
                    <th>Size</th>
                    <th>Written</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {status.files.map((f) => (
                    <tr key={f.name} data-file={f.name} data-kind={f.kind}>
                      <td className="notranslate" translate="no">
                        {f.name}
                      </td>
                      <td>{KIND_WORDS[f.kind]}</td>
                      <td>{formatFileSize(f.size)}</td>
                      <td>{formatDisplayDateTime(f.at)}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" data-action="backup-download" disabled={downloading === f.name} onClick={() => void download(f.name)} title={`Download ${f.name}`}>
                          <FiDownload size={12} /> Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
