import { useEffect, useMemo, useRef, useState } from "react";
import { FiExternalLink, FiFolder, FiTrash2, FiUpload } from "react-icons/fi";
import { driveApi, type SupplierDriveFile, type SupplierDriveType } from "../../api/client";
import { allSuppliers } from "../../engine/purchaseMasterLinks";
import { applyDriveUpload, DRIVE_TYPE_LABELS } from "../../engine/supplierDrive";
import { formatDisplayDate, formatDisplayDateTime } from "../../utils/date";

// THE SUPPLIERS' DRIVE (REQUIREMENTS §230): a folder per supplier of Purchase Master Data; a file uploaded with the kind of
// document it is, read on the server (backend/supplierDrive.ts), and what it says written into the master and the
// supplier's F/PUR/01, F/PUR/02 and F/PUR/03 (engine/supplierDrive.ts) - said under the upload.

const TYPES = Object.keys(DRIVE_TYPE_LABELS) as SupplierDriveType[];

export function SupplierDrive({ canEdit, actor, onChanged }: { canEdit: boolean; actor: string; onChanged: () => void }) {
  const suppliers = useMemo(() => allSuppliers().slice().sort((a, b) => a.supplierName.localeCompare(b.supplierName)), []);
  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id ?? "");
  const [docType, setDocType] = useState<SupplierDriveType>("srf");
  const [files, setFiles] = useState<SupplierDriveFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supplier = suppliers.find((s) => s.id === supplierId);

  const load = async (id: string) => {
    if (!id) return setFiles([]);
    try {
      setFiles((await driveApi.list(id)).files);
      setError(null);
    } catch (err) {
      setFiles([]);
      setError(err instanceof Error ? err.message : "The drive could not be read.");
    }
  };
  useEffect(() => {
    setSaid([]);
    void load(supplierId);
  }, [supplierId]);

  const upload = async (file: File | undefined) => {
    if (!file || !supplier) return;
    setBusy(true);
    setError(null);
    setSaid([]);
    try {
      const { read } = await driveApi.upload(supplier.id, supplier.supplierName, docType, file);
      const lines = applyDriveUpload(supplier.id, docType, read, actor, file.name);
      setSaid([`${file.name} kept in ${supplier.supplierName}'s folder as ${DRIVE_TYPE_LABELS[docType]}.`, ...(read.validUpto ? [`Valid upto ${formatDisplayDate(read.validUpto)}.`] : []), ...lines]);
      onChanged();
      await load(supplier.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be uploaded.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (f: SupplierDriveFile) => {
    if (!window.confirm(`Remove ${f.name} from ${f.supplierName || "the supplier"}'s folder? What it wrote into the records stays.`)) return;
    try {
      await driveApi.remove(f.id);
      await load(supplierId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be removed.");
    }
  };

  return (
    <div className="card mb-4" data-section="supplier-drive">
      <div className="card-pad">
        <div className="flex items-center justify-between wrap gap-2 mb-2">
          <h2 className="text-lg">
            <FiFolder size={15} style={{ verticalAlign: -2 }} /> Suppliers' drive
          </h2>
          <span className="text-xs text-muted">A folder per supplier: the SRF, TDS, MSDS, certificates, agreements and audit reports, read into the Purchase records.</span>
        </div>
        <div className="flex items-center gap-2 wrap mb-3">
          <label className="text-sm text-muted" htmlFor="drive-supplier">
            Supplier
          </label>
          <select id="drive-supplier" className="input input-sm" style={{ width: 340, maxWidth: "100%" }} data-field="drive-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.supplierName}
              </option>
            ))}
          </select>
          {canEdit && (
            <>
              <select className="input input-sm" style={{ width: 240, maxWidth: "100%" }} data-field="drive-type" aria-label="Kind of document" value={docType} onChange={(e) => setDocType(e.target.value as SupplierDriveType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DRIVE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm" data-action="drive-upload" disabled={busy || !supplier} onClick={() => fileRef.current?.click()}>
                <FiUpload size={12} /> {busy ? "Uploading…" : "Upload to the folder"}
              </button>
              <input
                ref={fileRef}
                type="file"
                data-field="drive-file"
                accept=".pdf,.doc,.docx,.xlsx,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                style={{ display: "none" }}
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </>
          )}
        </div>
        {error && (
          <div className="text-sm mb-2" role="alert" style={{ color: "var(--color-danger)" }}>
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
        <div className="doc-table">
          <table className="compact" data-table="drive-files">
            <thead>
              <tr>
                <th>Document</th>
                <th>File</th>
                <th>Valid upto</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted text-center" style={{ padding: 16 }}>
                    Nothing in {supplier ? `${supplier.supplierName}'s` : "this"} folder yet{canEdit ? " - choose the kind of document and upload it." : "."}
                  </td>
                </tr>
              )}
              {files.map((f) => (
                <tr key={f.id} data-drive-file={f.id}>
                  <td className="text-sm">{DRIVE_TYPE_LABELS[f.docType] ?? f.docType}</td>
                  <td className="text-sm" translate="no">
                    {f.name} <span className="text-faint">({Math.max(1, Math.round(f.size / 1024))} KB)</span>
                  </td>
                  <td className="text-sm">{f.validUpto ? formatDisplayDate(f.validUpto) : <span className="text-faint">—</span>}</td>
                  <td className="text-sm">
                    <span translate="no">{f.uploadedBy}</span>, {formatDisplayDateTime(f.uploadedAt)}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <a className="btn btn-ghost btn-sm" href={driveApi.fileUrl(f.id)} target="_blank" rel="noreferrer">
                      <FiExternalLink size={12} /> Open
                    </a>
                    {canEdit && (
                      <button className="btn btn-ghost btn-sm" data-action="drive-remove" aria-label={`Remove ${f.name}`} onClick={() => void remove(f)}>
                        <FiTrash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
