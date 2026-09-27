// THE FILES A PERSON ATTACHED (REQUIREMENTS §80, components/mitra).
//
// One chip per file, in the composer before the message is sent and under
// the person's message afterwards: a picture for the kind of file (a small
// thumbnail for a photo), its name, and what became of it — still being read
// on the server, read ("1,240 characters"), or not readable, with the server's
// plain-words note ("This picture has no readable text"). In the composer
// every chip has a × to take the file off again.
//
// The same chip serves both places, so it takes the least it needs: a stored
// message keeps only {id, name, kind, characters} of each attachment
// (pages/AssistantPage.tsx), the composer the whole MitraAttachment.
import { FiFile, FiFileText, FiGrid, FiImage, FiLoader } from "react-icons/fi";
import type { AttachmentKind } from "../../engine/mitraTypes";
import { useT } from "../../i18n";

export interface AttachmentChipData {
  id: string;
  name: string;
  kind: AttachmentKind;
  characters: number;
  size?: number;
  /** Absent on a stored message: the file was read before it was sent. */
  status?: "reading" | "ready" | "failed";
  note?: string;
  /** A small picture of a photo (images only). */
  dataUrl?: string;
}

type Icon = typeof FiFile;

/** The picture for a kind of file. */
export function attachmentIcon(kind: AttachmentKind): Icon {
  switch (kind) {
    case "pdf":
    case "docx":
      return FiFileText;
    case "xlsx":
    case "csv":
      return FiGrid;
    case "image":
      return FiImage;
    default:
      return FiFile;
  }
}

/** "812 B", "14 KB", "2.3 MB" — the way a file manager writes a size. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MitraAttachmentChips({
  attachments,
  onRemove,
  compact,
}: {
  attachments: AttachmentChipData[];
  /** Present in the composer: every chip gets its ×. */
  onRemove?: (id: string) => void;
  compact?: boolean;
}) {
  const t = useT();
  if (attachments.length === 0) return null;
  return (
    <div className={`mitra-attachments${compact ? " is-compact" : ""}`}>
      {attachments.map((a) => {
        const status = a.status ?? "ready";
        const Icon = attachmentIcon(a.kind);
        const meta =
          status === "reading"
            ? t("ai.reading")
            : status === "failed"
              ? a.note
                ? `${t("ai.readFailed")} — ${a.note}`
                : t("ai.readFailed")
              : a.characters > 0
                ? t("ai.readChars", { n: a.characters.toLocaleString("en-IN") })
                : (a.note ?? (a.size !== undefined ? formatBytes(a.size) : ""));
        return (
          <div key={a.id} className="mitra-attachment" data-status={status} data-kind={a.kind} title={a.note ? `${a.name} — ${a.note}` : a.name}>
            {a.dataUrl ? <img className="mitra-attachment-thumb" src={a.dataUrl} alt="" /> : <Icon size={14} className="mitra-attachment-icon" aria-hidden="true" />}
            <span className="mitra-attachment-text">
              <span className="mitra-attachment-name" translate="no">
                {a.name}
              </span>
              <span className="mitra-attachment-meta">
                {status === "reading" && <FiLoader size={10} className="mitra-spin" aria-hidden="true" />}
                {meta}
              </span>
            </span>
            {onRemove && (
              <button
                type="button"
                className="mitra-attachment-remove"
                data-action="remove-attachment"
                aria-label={`${t("ai.remove")}: ${a.name}`}
                title={t("ai.remove")}
                onClick={() => onRemove(a.id)}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
