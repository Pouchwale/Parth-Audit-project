import type { SupplierDriveFolder } from "../api/client";

// THE PURCHASE DRIVE'S FOLDERS (REQUIREMENTS §231; the owner, 16-Nov-2026: "user can create any folder Customly instead of
// predefined suppliers like it should be like google drive replica type"). The drive's root ("") holds "Suppliers" - a
// folder for each supplier of Purchase Master Data ("supplier:<id>"), made from the master as it stands - and the folders
// people made (backend/supplierDrive.ts), which may be made anywhere, a supplier's folder included, as deep as people like.
// A file belongs to the supplier whose folder it is in, however deep: that is what lets the drive read it into the
// Purchase records (engine/supplierDrive.ts).

export const DRIVE_ROOT = "";
export const SUPPLIERS_FOLDER = "suppliers";
export const supplierFolderId = (supplierId: string): string => `supplier:${supplierId}`;
export const supplierIdOfFolder = (folderId: string): string | null => /^supplier:(.+)$/.exec(folderId)?.[1] ?? null;

export interface DriveSupplier {
  id: string;
  supplierName: string;
}

/** One folder as the drive draws it. */
export interface DriveNode {
  id: string;
  name: string;
  /** The root, "Suppliers", a supplier's own, or one people made (the only kind renamed, moved and deleted). */
  kind: "root" | "suppliers" | "supplier" | "folder";
  folder?: SupplierDriveFolder;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
const made = (f: SupplierDriveFolder): DriveNode => ({ id: f.id, name: f.name, kind: "folder", folder: f });

/** The folders inside a folder: its own made folders by name - the root's "Suppliers" first, "Suppliers"' every supplier. */
export function childFolders(folderId: string, folders: SupplierDriveFolder[], suppliers: DriveSupplier[]): DriveNode[] {
  const own = folders.filter((f) => f.parentId === folderId).map(made).sort(byName);
  if (folderId === DRIVE_ROOT) return [{ id: SUPPLIERS_FOLDER, name: "Suppliers", kind: "suppliers" }, ...own];
  if (folderId === SUPPLIERS_FOLDER) {
    const each = suppliers.filter((s) => s.supplierName.trim()).map((s): DriveNode => ({ id: supplierFolderId(s.id), name: s.supplierName, kind: "supplier" })).sort(byName);
    return [...own, ...each];
  }
  return own;
}

/** The folder a folder is in: null for the root. */
export function parentOf(folderId: string, folders: SupplierDriveFolder[]): string | null {
  if (folderId === DRIVE_ROOT) return null;
  if (folderId === SUPPLIERS_FOLDER) return DRIVE_ROOT;
  if (supplierIdOfFolder(folderId)) return SUPPLIERS_FOLDER;
  return folders.find((f) => f.id === folderId)?.parentId ?? DRIVE_ROOT;
}

/** A folder's name as the drive says it. */
export function nameOf(folderId: string, folders: SupplierDriveFolder[], suppliers: DriveSupplier[]): string {
  if (folderId === DRIVE_ROOT) return "Purchase Drive";
  if (folderId === SUPPLIERS_FOLDER) return "Suppliers";
  const sid = supplierIdOfFolder(folderId);
  if (sid) return suppliers.find((s) => s.id === sid)?.supplierName || "A supplier no longer on the list";
  return folders.find((f) => f.id === folderId)?.name ?? "A folder no longer there";
}

/** The way down to a folder from the drive's root, the root first (the breadcrumbs). */
export function trail(folderId: string, folders: SupplierDriveFolder[], suppliers: DriveSupplier[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  let at: string | null = folderId;
  while (at !== null && !seen.has(at)) {
    seen.add(at);
    out.unshift({ id: at, name: nameOf(at, folders, suppliers) });
    at = parentOf(at, folders);
  }
  return out;
}

/** The supplier a folder belongs to - its own, or the supplier whose folder it is inside - else null. */
export function supplierOf(folderId: string, folders: SupplierDriveFolder[], suppliers: DriveSupplier[]): DriveSupplier | null {
  for (const step of trail(folderId, folders, suppliers)) {
    const sid = supplierIdOfFolder(step.id);
    if (sid) return suppliers.find((s) => s.id === sid) ?? { id: sid, supplierName: "" };
  }
  return null;
}

/** Every folder a file or a folder can be moved to, each with its path ("Suppliers / Garware / Audits"). */
export function folderChoices(folders: SupplierDriveFolder[], suppliers: DriveSupplier[], except?: string): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (id: string, path: string[]) => {
    if (except && id === except) return;
    out.push({ id, label: path.join(" / ") });
    for (const c of childFolders(id, folders, suppliers)) walk(c.id, [...path, c.name]);
  };
  walk(DRIVE_ROOT, ["Purchase Drive"]);
  return out;
}
