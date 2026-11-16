import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FiChevronRight,
  FiEdit2,
  FiExternalLink,
  FiFile,
  FiFileText,
  FiFolder,
  FiFolderPlus,
  FiGrid,
  FiImage,
  FiList,
  FiMove,
  FiSearch,
  FiTrash2,
  FiUpload,
  FiUsers,
} from "react-icons/fi";
import {
  driveApi,
  type SupplierDriveFile,
  type SupplierDriveFolder,
  type SupplierDriveType,
} from "../api/client";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { Modal } from "../components/common/Modal";
import { allSuppliers } from "../engine/purchaseMasterLinks";
import { applyDriveUpload, DRIVE_TYPE_LABELS } from "../engine/supplierDrive";
import {
  childFolders,
  DRIVE_ROOT,
  folderChoices,
  nameOf,
  supplierOf,
  trail,
  type DriveNode,
} from "../engine/driveTree";
import { PURCHASE_DOCUMENT_IDS } from "../engine/purchaseMaster";
import { isBossSignedIn, mayDo } from "../engine/departmentScope";
import { formatDisplayDate, formatDisplayDateTime } from "../utils/date";

// THE PURCHASE DRIVE - Purchase Master Data's own page, laid out as Google Drive is (REQUIREMENTS §231; the owner,
// 16-Nov-2026: "create Seperate page for it in master data only and also user can create any folder Customly instead of
// predefined suppliers like it should be like google drive replica type").
//
// The folder's way down from the drive's root (the breadcrumbs), its folders then its files, as tiles or a list; a folder
// made anywhere, renamed, moved, deleted when empty; files uploaded by the button or dropped onto the page, opened,
// renamed, moved, deleted; the whole drive searched by name. Inside a supplier's folder (or a folder made in it) a file is
// uploaded as the kind of document it is, read on the server and written into Purchase Master Data and the supplier's
// F/PUR/01, F/PUR/02 and F/PUR/03 (engine/supplierDrive.ts, §230) - what was written said under the toolbar.

const TYPES = Object.keys(DRIVE_TYPE_LABELS) as SupplierDriveType[];
const ACTOR = "Purchase";

type Dialog =
  | { kind: "new" }
  | { kind: "rename-folder"; node: DriveNode }
  | { kind: "rename-file"; file: SupplierDriveFile }
  | { kind: "move-folder"; node: DriveNode }
  | { kind: "move-file"; file: SupplierDriveFile };

const fileIcon = (f: SupplierDriveFile) =>
  f.mime.startsWith("image/") ? (
    <FiImage size={28} />
  ) : f.mime === "application/pdf" ? (
    <FiFileText size={28} />
  ) : (
    <FiFile size={28} />
  );

export function PurchaseDrivePage({
  folderId: routeFolder,
}: {
  folderId?: string;
}) {
  const { currentUser, bump } = useAppStore();
  const { navigate } = useRouter();
  const canEdit =
    isBossSignedIn() || PURCHASE_DOCUMENT_IDS.some((id) => mayDo(id, "fill"));
  const suppliers = useMemo(
    () =>
      allSuppliers().map((s) => ({ id: s.id, supplierName: s.supplierName })),
    [],
  );
  const folderId = routeFolder ?? DRIVE_ROOT;
  const [folders, setFolders] = useState<SupplierDriveFolder[]>([]);
  const [files, setFiles] = useState<SupplierDriveFile[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<SupplierDriveFile[] | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [docType, setDocType] = useState<SupplierDriveType>("srf");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [words, setWords] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const supplier = supplierOf(folderId, folders, suppliers);
  const fail = (err: unknown, fallback: string) =>
    setError(err instanceof Error ? err.message : fallback);

  const load = useCallback(async () => {
    try {
      const [f, inHere] = await Promise.all([
        driveApi.folders(),
        driveApi.inFolder(folderId),
      ]);
      setFolders(f.folders);
      setFiles(inHere.files);
      setError(null);
    } catch (err) {
      fail(err, "The drive could not be read.");
    }
  }, [folderId]);
  useEffect(() => {
    setSaid([]);
    void load();
  }, [load]);

  // The whole drive searched by name (and by the supplier a file is for), a moment after the typing stops.
  useEffect(() => {
    const q = query.trim();
    if (!q) return setFound(null);
    const t = setTimeout(() => {
      driveApi.search(q).then(
        (r) => setFound(r.files),
        (err) => fail(err, "The drive could not be searched."),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const open = (id: string) => {
    setQuery("");
    navigate(
      id ? `/purchase/drive/${encodeURIComponent(id)}` : "/purchase/drive",
    );
  };

  const upload = async (list: FileList | File[] | null | undefined) => {
    const chosen = Array.from(list ?? []);
    if (!chosen.length || !canEdit) return;
    setBusy(true);
    setError(null);
    const lines: string[] = [];
    const kind: SupplierDriveType = supplier ? docType : "other";
    for (const file of chosen) {
      try {
        const { read } = await driveApi.uploadTo({
          folderId,
          supplierId: supplier?.id ?? "",
          supplierName: supplier?.supplierName ?? "",
          docType: kind,
          file,
        });
        lines.push(
          `${file.name} uploaded to ${nameOf(folderId, folders, suppliers)}${supplier ? ` as ${DRIVE_TYPE_LABELS[kind]}` : ""}.`,
        );
        if (read.validUpto)
          lines.push(`Valid upto ${formatDisplayDate(read.validUpto)}.`);
        if (supplier && kind !== "other")
          lines.push(
            ...applyDriveUpload(
              supplier.id,
              kind,
              read,
              currentUser || ACTOR,
              file.name,
            ),
          );
      } catch (err) {
        lines.push(
          `${file.name}: ${err instanceof Error ? err.message : "could not be uploaded."}`,
        );
      }
    }
    setSaid(lines);
    bump();
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    await load();
  };

  const startDialog = (d: Dialog) => {
    setError(null);
    setDialog(d);
    setWords(
      d.kind === "rename-folder"
        ? d.node.name
        : d.kind === "rename-file"
          ? d.file.name
          : "",
    );
    setMoveTo(
      d.kind === "move-file"
        ? d.file.folderId
        : d.kind === "move-folder"
          ? (d.node.folder?.parentId ?? DRIVE_ROOT)
          : "",
    );
  };

  const finishDialog = async () => {
    if (!dialog) return;
    try {
      if (dialog.kind === "new")
        await driveApi.createFolder(words.trim(), folderId);
      else if (dialog.kind === "rename-folder")
        await driveApi.updateFolder(dialog.node.id, { name: words.trim() });
      else if (dialog.kind === "rename-file")
        await driveApi.updateFile(dialog.file.id, { name: words.trim() });
      else if (dialog.kind === "move-folder")
        await driveApi.updateFolder(dialog.node.id, { parentId: moveTo });
      else if (dialog.kind === "move-file") {
        const to = supplierOf(moveTo, folders, suppliers);
        await driveApi.updateFile(dialog.file.id, {
          folderId: moveTo,
          supplierId: to?.id ?? "",
          supplierName: to?.supplierName ?? "",
        });
      }
      setDialog(null);
      await load();
      if (found) setFound((await driveApi.search(query.trim())).files);
    } catch (err) {
      fail(err, "That could not be done.");
    }
  };

  const removeFolder = async (node: DriveNode) => {
    if (
      !window.confirm(
        `Delete the folder "${node.name}"? Only an empty folder can be deleted.`,
      )
    )
      return;
    try {
      await driveApi.removeFolder(node.id);
      await load();
    } catch (err) {
      fail(err, "The folder could not be deleted.");
    }
  };
  const removeFile = async (f: SupplierDriveFile) => {
    if (
      !window.confirm(
        `Delete ${f.name} from the drive? What it wrote into the records stays.`,
      )
    )
      return;
    try {
      await driveApi.remove(f.id);
      await load();
      if (found) setFound(found.filter((x) => x.id !== f.id));
    } catch (err) {
      fail(err, "The file could not be deleted.");
    }
  };

  const crumbs = trail(folderId, folders, suppliers);
  const subfolders = childFolders(folderId, folders, suppliers);
  const shownFiles = found ?? files;

  const folderActions = (n: DriveNode) =>
    canEdit && n.kind === "folder" ? (
      <span className="drive-actions">
        <button
          className="btn btn-ghost btn-sm"
          title="Rename"
          aria-label={`Rename ${n.name}`}
          data-action="drive-folder-rename"
          onClick={(e) => {
            e.stopPropagation();
            startDialog({ kind: "rename-folder", node: n });
          }}
        >
          <FiEdit2 size={12} />
        </button>
        <button
          className="btn btn-ghost btn-sm"
          title="Move"
          aria-label={`Move ${n.name}`}
          data-action="drive-folder-move"
          onClick={(e) => {
            e.stopPropagation();
            startDialog({ kind: "move-folder", node: n });
          }}
        >
          <FiMove size={12} />
        </button>
        <button
          className="btn btn-ghost btn-sm"
          title="Delete"
          aria-label={`Delete ${n.name}`}
          data-action="drive-folder-delete"
          onClick={(e) => {
            e.stopPropagation();
            void removeFolder(n);
          }}
        >
          <FiTrash2 size={12} />
        </button>
      </span>
    ) : null;

  const fileActions = (f: SupplierDriveFile) => (
    <span className="drive-actions">
      <a
        className="btn btn-ghost btn-sm"
        title="Open"
        href={driveApi.fileUrl(f.id)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${f.name}`}
      >
        <FiExternalLink size={12} />
      </a>
      {canEdit && (
        <>
          <button
            className="btn btn-ghost btn-sm"
            title="Rename"
            aria-label={`Rename ${f.name}`}
            data-action="drive-file-rename"
            onClick={() => startDialog({ kind: "rename-file", file: f })}
          >
            <FiEdit2 size={12} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            title="Move"
            aria-label={`Move ${f.name}`}
            data-action="drive-file-move"
            onClick={() => startDialog({ kind: "move-file", file: f })}
          >
            <FiMove size={12} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            title="Delete"
            aria-label={`Delete ${f.name}`}
            data-action="drive-file-delete"
            onClick={() => void removeFile(f)}
          >
            <FiTrash2 size={12} />
          </button>
        </>
      )}
    </span>
  );

  const fileFacts = (f: SupplierDriveFile) => (
    <>
      {f.docType !== "other" && <span>{DRIVE_TYPE_LABELS[f.docType]}</span>}
      {f.validUpto && <span>valid upto {formatDisplayDate(f.validUpto)}</span>}
      <span>{Math.max(1, Math.round(f.size / 1024))} KB</span>
      <span translate="no">{f.uploadedBy}</span>
      <span>{formatDisplayDateTime(f.uploadedAt)}</span>
      {found && <span>in {nameOf(f.folderId, folders, suppliers)}</span>}
    </>
  );

  return (
    <div
      data-page="purchase-drive"
      className={dragging ? "drive-dragging" : undefined}
      onDragOver={(e) => {
        if (!canEdit || found) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!canEdit || found) return;
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <div>
          <div className="text-xs text-muted mb-1" data-crumb>
            Purchase · Master Data
          </div>
          <h1 className="text-2xl mb-1">Purchase Drive</h1>
        </div>
        <div className="flex gap-2 wrap">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate("/purchase/master-data")}
          >
            Purchase Master Data
          </button>
        </div>
      </div>

      <div className="drive-toolbar flex items-center gap-2 wrap mb-3">
        {canEdit && (
          <>
            <button
              className="btn btn-secondary btn-sm"
              data-action="drive-new-folder"
              onClick={() => startDialog({ kind: "new" })}
              disabled={!!found}
            >
              <FiFolderPlus size={13} /> New folder
            </button>
            {supplier && (
              <select
                className="input input-sm"
                style={{ width: 230 }}
                data-field="drive-type"
                aria-label="Kind of document"
                value={docType}
                onChange={(e) =>
                  setDocType(e.target.value as SupplierDriveType)
                }
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DRIVE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            )}
            <button
              className="btn btn-primary btn-sm"
              data-action="drive-upload"
              disabled={busy || !!found}
              onClick={() => fileRef.current?.click()}
            >
              <FiUpload size={13} /> {busy ? "Uploading…" : "Upload files"}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              data-field="drive-file"
              style={{ display: "none" }}
              onChange={(e) => void upload(e.target.files)}
              accept=".pdf,.doc,.docx,.xlsx,.jpg,.jpeg,.png"
            />
          </>
        )}
        <span className="drive-search">
          <FiSearch size={13} />
          <input
            className="input input-sm"
            data-field="drive-search"
            placeholder="Search the drive"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 240 }}
          />
        </span>
        <span className="pill-tabs" style={{ marginLeft: "auto" }}>
          <span
            className={`pill-tab ${view === "grid" ? "active" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="Tiles"
            onClick={() => setView("grid")}
          >
            <FiGrid size={13} />
          </span>
          <span
            className={`pill-tab ${view === "list" ? "active" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="List"
            onClick={() => setView("list")}
          >
            <FiList size={13} />
          </span>
        </span>
      </div>

      {!found && (
        <nav
          className="drive-crumbs flex items-center gap-1 wrap mb-3"
          aria-label="Where you are"
          data-section="drive-crumbs"
        >
          {crumbs.map((c, i) => (
            <React.Fragment key={c.id || "root"}>
              {i > 0 && <FiChevronRight size={13} className="text-muted" />}
              {i < crumbs.length - 1 ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => open(c.id)}
                >
                  {c.name}
                </button>
              ) : (
                <strong className="text-sm" style={{ padding: "0 6px" }}>
                  {c.name}
                </strong>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      {found && (
        <div className="text-sm text-muted mb-3">
          {found.length} file{found.length === 1 ? "" : "s"} found for "
          {query.trim()}" across the drive.
        </div>
      )}

      {supplier && !found && canEdit && (
        <div className="text-xs text-muted mb-2">
          {supplier.supplierName}'s folder: a file uploaded here is read as the
          kind chosen above and written into Purchase Master Data and their
          F/PUR/01, F/PUR/02 and F/PUR/03.
        </div>
      )}
      {error && (
        <div
          className="text-sm mb-2"
          role="alert"
          style={{ color: "var(--color-danger)" }}
        >
          {error}
        </div>
      )}
      {said.length > 0 && (
        <ul className="text-sm mb-3" data-list="drive-written">
          {said.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

      {!found && subfolders.length > 0 && (
        <>
          <h2 className="text-sm text-muted mb-2">Folders</h2>
          <div
            className={view === "grid" ? "drive-grid mb-4" : "drive-list mb-4"}
            data-section="drive-folders"
          >
            {subfolders.map((n) => (
              <div
                key={n.id}
                className="drive-item drive-folder"
                role="button"
                tabIndex={0}
                data-drive-folder={n.id}
                onClick={() => open(n.id)}
                onKeyDown={(e) => e.key === "Enter" && open(n.id)}
              >
                <span className="drive-icon">
                  {n.kind === "suppliers" ? (
                    <FiUsers size={view === "grid" ? 24 : 16} />
                  ) : (
                    <FiFolder size={view === "grid" ? 24 : 16} />
                  )}
                </span>
                <span className="drive-name" translate="no">
                  {n.name}
                </span>
                {folderActions(n)}
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="text-sm text-muted mb-2">Files</h2>
      {shownFiles.length === 0 ? (
        <div
          className={`drive-empty${dragging ? " is-over" : ""}`}
          data-state="drive-empty"
        >
          {found
            ? "No file of that name."
            : canEdit
              ? "Nothing here yet. Drop files here, or press Upload files."
              : "Nothing here yet."}
        </div>
      ) : (
        <div
          className={view === "grid" ? "drive-grid" : "drive-list"}
          data-section="drive-files"
        >
          {shownFiles.map((f) => (
            <div
              key={f.id}
              className="drive-item drive-file"
              data-drive-file={f.id}
            >
              <span className="drive-icon">
                {view === "grid" ? fileIcon(f) : <FiFile size={16} />}
              </span>
              <a
                className="drive-name"
                href={driveApi.fileUrl(f.id)}
                target="_blank"
                rel="noreferrer"
                translate="no"
              >
                {f.name}
              </a>
              <span className="drive-facts text-xs text-muted">
                {fileFacts(f)}
              </span>
              {fileActions(f)}
            </div>
          ))}
        </div>
      )}
      {dragging && (
        <div className="drive-drop-hint no-print">
          Drop to upload to {nameOf(folderId, folders, suppliers)}
        </div>
      )}

      {dialog && (
        <Modal
          title={
            dialog.kind === "new"
              ? "New folder"
              : dialog.kind.startsWith("rename")
                ? "Rename"
                : "Move to"
          }
          onClose={() => setDialog(null)}
          width={460}
          footer={
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                data-action="drive-dialog-ok"
                disabled={
                  dialog.kind.startsWith("move") ? false : !words.trim()
                }
                onClick={() => void finishDialog()}
              >
                {dialog.kind === "new"
                  ? "Make the folder"
                  : dialog.kind.startsWith("rename")
                    ? "Rename"
                    : "Move"}
              </button>
            </>
          }
        >
          {/* (what went wrong said here, where the person is looking: "There is already a folder named ...") */}
          {error && (
            <div
              className="text-sm mb-2"
              role="alert"
              data-state="drive-dialog-error"
              style={{ color: "var(--color-danger)" }}
            >
              {error}
            </div>
          )}
          {dialog.kind.startsWith("move") ? (
            <select
              className="input"
              data-field="drive-move-to"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              style={{ width: "100%" }}
            >
              {folderChoices(
                folders,
                suppliers,
                dialog.kind === "move-folder" ? dialog.node.id : undefined,
              ).map((c) => (
                <option key={c.id || "root"} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              data-field="drive-name"
              autoFocus
              value={words}
              placeholder={dialog.kind === "new" ? "Folder name" : "Name"}
              onChange={(e) => setWords(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && words.trim() && void finishDialog()
              }
              style={{ width: "100%" }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
