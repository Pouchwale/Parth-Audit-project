import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiAlertTriangle, FiArrowLeft, FiCheckCircle, FiDownload, FiInfo, FiLock, FiPlus, FiPrinter, FiTrash2, FiUpload } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { purchaseMasterRepository } from "../data/repositories/purchaseMasterRepository";
import { COMPANY } from "../data/seed/masterData";
import { isBossSignedIn, isDocumentIdVisible, mayDo } from "../engine/departmentScope";
import {
  APPLICABLE_PRODUCTS,
  DOCUMENT_ANSWERS,
  GRADES,
  WORKED_BANDS,
  WORKED_KEYS,
  DOCUMENT_KEYS,
  LIST_COLUMNS,
  PURCHASE_DOCUMENT_IDS,
  PURCHASE_MASTER_SHEET_NAME,
  RATING_BANDS,
  RATING_COLUMNS,
  SERVICE_APPROVALS,
  SUPPLIER_CATEGORIES,
  WORKED_COLUMNS,
  checkRating,
  checkWorked,
  dateOrWords,
  isServiceProvider,
  planSupplierImport,
  ratingOf,
  reapprovalDue,
  shownDate,
  supplierColumnLabel,
  supplierProblems,
  supplierRating,
  supplierSheet,
  typedWorked,
  type RatingKey,
  type SupplierImportPlan,
  type SupplierRating,
  type WorkedKey,
} from "../engine/purchaseMaster";
import { OVERALL_GRADES } from "../engine/purchaseRatings";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { Modal } from "../components/common/Modal";
import { buildXlsx, readFirstSheet, sniffSpreadsheet, SpreadsheetReadError } from "../utils/xlsx";
import { downloadBlob, parseCSV } from "../utils/csv";
import { printDocument } from "../utils/print";
import { logActivity } from "../utils/activityLog";
import { formatDisplayDate, todayISO } from "../utils/date";
import type { ApprovedSupplier, SupplierKey, SupplierValues } from "../types";
import { useT } from "../i18n";
import { useProgressiveCount } from "../utils/useProgressive";

// PURCHASE MASTER DATA (REQUIREMENTS §186) — /purchase/master-data.
//
// Purchase's List of Approved Suppliers (F/PUR/03), laid out as the list is kept — its own columns, Vendor Code to File
// No — with each supplier's rating beside it: the Product Safety, Quality and Delivery Ratings (100 unless changed; the
// Quality Rating 97 to 100) and what they are worth at F/PUR/05's weights, 50% / 40% / 10%, their sum the Overall Rating
// and its Grade. Every cell is written in place and saved as it is left, by whoever has Write on a Purchase document; the
// rest read it. The sheet goes out as an Excel workbook and comes back in from one (or a CSV), shown line by line first.

type SortKey = SupplierKey | WorkedKey | null;

interface PendingImport {
  fileName: string;
  plan: SupplierImportPlan;
}

const NUMERIC_SORT = new Set<string>(["productSafetyRating", "qualityRating", "deliveryRating", "productSafetyWeightage", "qualityWeightage", "deliveryWeightage", "overallRating"]);
const ACTOR = "Purchase Master Data";
const GRADE_COLOUR: Record<string, string> = { A: "var(--color-success)", B: "var(--color-warning)", C: "var(--color-danger)" };
/** A figure typed over a worked-out one is marked, so it is never taken for the arithmetic. */
const TYPED_STYLE: React.CSSProperties = { fontWeight: 700, borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" };
const TYPED_TIP = "Typed over the worked-out figure. Empty the cell to have it worked out again.";
const WORKED_TIP = "Worked out from the ratings (auto). Type a figure, or choose a grade, to put your own in its place.";

async function gridOf(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const kind = sniffSpreadsheet(buffer);
  if (kind === "xls") throw new SpreadsheetReadError("This is an old-style .xls workbook (or a password-protected one). Save it from Excel as .xlsx, or as CSV UTF-8, and upload that.");
  if (kind === "xlsx") return (await readFirstSheet(buffer)).rows;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("windows-1252").decode(buffer);
  }
  return parseCSV(text);
}

const enterLeaves = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
};

export function PurchaseMasterDataPage() {
  const { version, bump, currentUser } = useAppStore();
  const { navigate } = useRouter();
  const t = useT();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: null, dir: 1 });
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [notesOpen, setNotesOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ApprovedSupplier | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const suppliers = useMemo(() => purchaseMasterRepository.all(), [version]);
  const visible = PURCHASE_DOCUMENT_IDS.some((id) => isDocumentIdVisible(id));
  // "make sure it should be editable every time who has given access" (the owner, 5-Nov-2026): Write on a Purchase
  // document, as the server checks it (backend/accessLevels.ts writesPurchaseMaster); the super admin always.
  const canEdit = isBossSignedIn() || PURCHASE_DOCUMENT_IDS.some((id) => mayDo(id, "fill"));
  const today = todayISO();

  const ratings = useMemo(() => new Map<string, SupplierRating>(suppliers.map((s) => [s.id, supplierRating(s)])), [suppliers]);
  const problems = useMemo(() => new Map(suppliers.map((s) => [s.id, supplierProblems(s, today)])), [suppliers, today]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = suppliers.map((supplier, index) => ({ supplier, index }));
    const filtered = q
      ? rows.filter(({ supplier }) =>
          [...LIST_COLUMNS.map((c) => (c.kind === "date" ? shownDate(supplier[c.key]) : supplier[c.key])), supplier.serviceApproval, ratings.get(supplier.id)?.grade ?? ""].some((v) =>
            String(v ?? "").toLowerCase().includes(q)
          )
        )
      : rows;
    if (!sort.key) return filtered;
    const key = sort.key;
    const worked = (WORKED_KEYS as string[]).includes(key);
    const valueOf = (s: ApprovedSupplier): string => (worked ? String(ratings.get(s.id)?.[key as WorkedKey] ?? "") : String(s[key as SupplierKey] ?? ""));
    return [...filtered].sort((a, b) => {
      const x = valueOf(a.supplier);
      const y = valueOf(b.supplier);
      if (!x && y) return 1;
      if (x && !y) return -1;
      if (NUMERIC_SORT.has(key)) return (Number(ratingOf(x)) - Number(ratingOf(y))) * sort.dir;
      return x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }) * sort.dir;
    });
  }, [suppliers, ratings, query, sort]);

  // A long list shows its first lines at once and the rest a batch at a time (utils/useProgressive.ts).
  const rowsShown = useProgressiveCount(shown.length, 30, 40);

  // A line just added gets the cursor in its SUPPLIER NAME, once it is drawn.
  useEffect(() => {
    if (!focusId) return;
    const box = document.querySelector(`[data-table='purchase-master'] tr[data-supplier='${focusId}'] input[data-field='supplierName']`);
    if (box instanceof HTMLInputElement) {
      box.focus();
      box.scrollIntoView({ block: "center" });
      setFocusId(null);
    }
  }, [focusId, suppliers, rowsShown]);

  if (!visible) return <NotYourDepartment documentId="pur-approved-suppliers" formatNo="F/PUR/03" what="list" />;

  const names = new Set(suppliers.map((s) => s.supplierName.trim().toLowerCase()).filter(Boolean));
  const serviceProviders = suppliers.filter(isServiceProvider).length;
  const gradeA = suppliers.filter((s) => ratings.get(s.id)?.grade === "A").length;
  const belowA = suppliers.length - gradeA;
  const overdue = suppliers.filter((s) => (problems.get(s.id) ?? []).some((p) => p.field === "reapprovalDueDate")).length;
  const toConfirm = suppliers.filter((s) => s.notes?.length).length;

  const save = (s: ApprovedSupplier, changes: Partial<SupplierValues>) => {
    purchaseMasterRepository.update(s.id, changes, currentUser || ACTOR);
    // A refusal said earlier is not left standing over a change that was saved.
    setMessage(null);
    bump();
  };

  const edit = (s: ApprovedSupplier, key: SupplierKey, raw: string) => {
    if (!canEdit) return;
    const value = key === "approvalDate" || key === "reapprovalDueDate" ? dateOrWords(raw) : raw.replace(/\s+/g, " ").trim();
    if (value === s[key]) return;
    const changes: Partial<SupplierValues> = { [key]: value };
    // The re-approval due date the list writes beside an approval date, when the line has none yet (engine/purchaseMaster.ts reapprovalDue).
    if (key === "approvalDate" && !s.reapprovalDueDate.trim()) {
      const due = reapprovalDue(value, isServiceProvider(s));
      if (due) changes.reapprovalDueDate = due;
    }
    save(s, changes);
  };

  const editRating = (s: ApprovedSupplier, key: RatingKey, box: HTMLInputElement) => {
    if (!canEdit) return;
    const before = ratingOf(s[key]);
    const checked = checkRating(key, box.value);
    if ("error" in checked) {
      box.value = before;
      setMessage({ tone: "warn", text: `${s.supplierName || "This line"}: ${checked.error}` });
      return;
    }
    if (checked.value === s[key]) {
      box.value = checked.value;
      return;
    }
    save(s, { [key]: checked.value });
    logActivity("Purchase Master Data: rating changed", s.supplierName || "A supplier line", `${supplierColumnLabel(key)}: ${before} → ${checked.value}`);
  };

  // A worked-out figure typed over (the owner, 5-Nov-2026: "make sure it should completely editable"). The figure the
  // arithmetic gives is not kept as typed; an emptied cell is worked out again.
  const editWorked = (s: ApprovedSupplier, key: Exclude<WorkedKey, "grade">, box: HTMLInputElement) => {
    if (!canEdit) return;
    const shown = (ratings.get(s.id) ?? supplierRating(s))[key];
    const raw = box.value.trim();
    if (!raw) {
      if (s[key]) {
        save(s, { [key]: "" });
        logActivity("Purchase Master Data: rating changed", s.supplierName || "A supplier line", `${supplierColumnLabel(key)}: ${shown} → worked out`);
      } else box.value = shown;
      return;
    }
    const checked = checkWorked(key, raw);
    if ("error" in checked) {
      box.value = shown;
      setMessage({ tone: "warn", text: `${s.supplierName || "This line"}: ${checked.error}` });
      return;
    }
    const auto = supplierRating({ ...s, [key]: "" })[key];
    const next = checked.value === auto ? "" : checked.value;
    if (next === s[key]) {
      box.value = shown;
      return;
    }
    save(s, { [key]: next });
    logActivity("Purchase Master Data: rating changed", s.supplierName || "A supplier line", `${supplierColumnLabel(key)}: ${shown} → ${checked.value}`);
  };

  const editGrade = (s: ApprovedSupplier, value: string) => {
    if (!canEdit || value === s.grade) return;
    const before = (ratings.get(s.id) ?? supplierRating(s)).grade;
    save(s, { grade: value });
    logActivity("Purchase Master Data: rating changed", s.supplierName || "A supplier line", `Grade: ${before} → ${value || "worked out"}`);
  };

  const addLine = () => {
    const s = purchaseMasterRepository.add({}, currentUser || ACTOR);
    setQuery("");
    setSort({ key: null, dir: 1 });
    setFocusId(s.id);
    setMessage(null);
    bump();
  };

  const exportSheet = () => {
    // F/PUR/03's own columns, SR. NO. first; then the rating; a service provider's six document cells drawn as one, as the list draws them.
    const { columns, rows, merges } = supplierSheet(suppliers);
    const bytes = buildXlsx(PURCHASE_MASTER_SHEET_NAME, columns, rows, merges);
    downloadBlob(`Purchase Master Data - ${PURCHASE_MASTER_SHEET_NAME} ${formatDisplayDate(todayISO())}.xlsx`, new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    setMessage({ tone: "ok", text: `Downloaded the list as an Excel workbook — ${suppliers.length} line${suppliers.length === 1 ? "" : "s"}.` });
  };

  const chooseFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setMessage(null);
    try {
      const plan = planSupplierImport(await gridOf(file), purchaseMasterRepository.all());
      if ("error" in plan) setMessage({ tone: "warn", text: `${file.name}: ${plan.error}` });
      else setPending({ fileName: file.name, plan });
    } catch (e) {
      setMessage({ tone: "warn", text: `${file.name}: ${e instanceof SpreadsheetReadError ? e.message : "the file could not be read as an Excel workbook or a CSV."}` });
    }
  };

  const applyImport = () => {
    if (!pending) return;
    const { added, updated } = purchaseMasterRepository.applyImport(pending.plan, currentUser || ACTOR);
    logActivity("Purchase Master Data uploaded", pending.fileName, `${added} added, ${updated} updated`);
    setPending(null);
    setMessage({ tone: "ok", text: `Uploaded ${pending.fileName}: ${added} line${added === 1 ? "" : "s"} added, ${updated} updated.` });
    bump();
  };

  const toggleSort = (key: SupplierKey | WorkedKey) => setSort((s) => (s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }));

  const heading = (key: SupplierKey | WorkedKey, label: string, width: number, title?: string) => (
    <th key={key} style={{ minWidth: width }} title={title}>
      <button className="btn btn-ghost btn-sm" style={{ padding: "0 2px", fontWeight: 600, whiteSpace: "normal", textAlign: "left" }} data-sort={key} onClick={() => toggleSort(key)} title="Sort by this column">
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
      </button>
      <span className="print-only">{label}</span>
    </th>
  );

  const textCell = (s: ApprovedSupplier, key: SupplierKey, list?: string, extra?: { className?: string; title?: string; colSpan?: number }) => {
    const date = key === "approvalDate" || key === "reapprovalDueDate";
    const shownValue = date ? shownDate(s[key]) : s[key];
    return (
      <td key={key} className={extra?.className} title={extra?.title} colSpan={extra?.colSpan}>
        <input
          // Keyed by what is saved, so an upload shows in the cell; a cell being typed in keeps its place.
          key={`${key}:${s[key]}`}
          className="input input-sm"
          data-field={key}
          defaultValue={shownValue}
          readOnly={!canEdit}
          list={list}
          placeholder={date && canEdit ? "dd-mm-yyyy" : undefined}
          aria-label={`${supplierColumnLabel(key)}${s.supplierName ? ` — ${s.supplierName}` : ""}`}
          onBlur={(e) => edit(s, key, e.target.value)}
          onKeyDown={enterLeaves}
        />
      </td>
    );
  };

  const listCells = (s: ApprovedSupplier) => {
    const issues = problems.get(s.id) ?? [];
    const flag = (key: SupplierKey) => {
      const issue = issues.find((i) => i.field === key);
      return issue ? { className: "cell-out-of-band", title: issue.message } : undefined;
    };
    const cells: React.ReactNode[] = [];
    for (const c of LIST_COLUMNS) {
      if (c.kind === "document") {
        // A service provider's six document cells are one, as the list draws them: SERVICE AGREEMENT, ISO 17025 ACCREDITATION.
        if (isServiceProvider(s)) {
          if (c.key === DOCUMENT_KEYS[0]) cells.push(textCell(s, "serviceApproval", "pm-service-approvals", { colSpan: DOCUMENT_KEYS.length }));
          continue;
        }
        cells.push(textCell(s, c.key, "pm-document-answers"));
        continue;
      }
      if (c.kind === "category") {
        const known = (SUPPLIER_CATEGORIES as readonly string[]).includes(s.category);
        cells.push(
          <td key={c.key}>
            <select
              className="input input-sm"
              data-field="category"
              value={s.category}
              disabled={!canEdit}
              aria-label={`${supplierColumnLabel("category")}${s.supplierName ? ` — ${s.supplierName}` : ""}`}
              onChange={(e) => edit(s, "category", e.target.value)}
            >
              <option value=""></option>
              {SUPPLIER_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {s.category && !known && <option value={s.category}>{s.category}</option>}
            </select>
          </td>
        );
        continue;
      }
      cells.push(textCell(s, c.key, c.key === "applicableProduct" ? "pm-applicable-products" : undefined, flag(c.key)));
    }
    return cells;
  };

  const ratingCells = (s: ApprovedSupplier) => {
    const issues = problems.get(s.id) ?? [];
    const r = ratings.get(s.id) ?? supplierRating(s);
    const typedKeys = typedWorked(s);
    return (
      <>
        {RATING_COLUMNS.map((c) => {
          const key = c.key as RatingKey;
          const band = RATING_BANDS[key];
          const issue = issues.find((i) => i.field === key);
          return (
            <td key={key} className={issue ? "cell-out-of-band" : undefined} title={issue?.message ?? `${band.min} to ${band.max}`}>
              <input
                key={`${key}:${s[key]}`}
                className="input input-sm"
                style={{ textAlign: "right" }}
                data-field={key}
                type="number"
                step="any"
                min={band.min}
                max={band.max}
                defaultValue={ratingOf(s[key])}
                readOnly={!canEdit}
                aria-label={`${c.label}${s.supplierName ? ` — ${s.supplierName}` : ""}`}
                onBlur={(e) => editRating(s, key, e.target)}
                onKeyDown={enterLeaves}
              />
            </td>
          );
        })}
        {WORKED_COLUMNS.map((c) => {
          const typed = typedKeys.includes(c.key);
          if (c.key === "grade") {
            const auto = supplierRating({ ...s, grade: "" }).grade;
            return (
              <td key={c.key} data-worked={c.key} data-typed={typed || undefined} title={typed ? TYPED_TIP : WORKED_TIP} style={{ textAlign: "center" }}>
                <select
                  className="input input-sm no-print"
                  data-field="grade"
                  value={s.grade}
                  disabled={!canEdit}
                  style={{ fontWeight: 700, color: GRADE_COLOUR[r.grade], ...(typed ? TYPED_STYLE : {}) }}
                  aria-label={`Grade${s.supplierName ? ` — ${s.supplierName}` : ""}`}
                  onChange={(e) => editGrade(s, e.target.value)}
                >
                  {/* Worked out from the Overall Rating: the letter, "(auto)" beside it; a letter chosen below stands as typed. */}
                  <option value="">{auto ? `${auto} (auto)` : "(auto)"}</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <span className="print-only" style={{ fontWeight: 700 }}>
                  {r.grade}
                </span>
              </td>
            );
          }
          const band = WORKED_BANDS[c.key];
          return (
            <td key={c.key} data-worked={c.key} data-typed={typed || undefined} title={typed ? TYPED_TIP : WORKED_TIP}>
              <input
                key={`${c.key}:${s[c.key]}:${r[c.key]}`}
                className="input input-sm"
                style={{ textAlign: "right", fontWeight: c.key === "overallRating" ? 700 : undefined, ...(typed ? TYPED_STYLE : {}) }}
                data-field={c.key}
                type="number"
                step="any"
                min={band.min}
                max={band.max}
                defaultValue={r[c.key]}
                readOnly={!canEdit}
                aria-label={`${c.label}${s.supplierName ? ` — ${s.supplierName}` : ""}`}
                onBlur={(e) => editWorked(s, c.key as Exclude<WorkedKey, "grade">, e.target)}
                onKeyDown={enterLeaves}
              />
            </td>
          );
        })}
      </>
    );
  };

  const columnCount = 1 + LIST_COLUMNS.length + RATING_COLUMNS.length + WORKED_COLUMNS.length;

  return (
    <div data-page="purchase-master-data">
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <div>
          <div className="text-xs text-muted mb-1" data-crumb>
            Purchase · Master Data
          </div>
          <h1 className="text-2xl mb-1">{t("nav.purchaseMasterData")}</h1>
          <div className="text-sm text-muted">List of Approved Suppliers (RM, PM, Service Provider) — F/PUR/03, with each supplier's rating as F/PUR/05 works it out</div>
        </div>
        <div className="flex gap-2 wrap">
          {canEdit && (
            <button className="btn btn-primary btn-sm" data-action="purchase-master-add" onClick={addLine}>
              <FiPlus size={12} /> Add supplier
            </button>
          )}
          <button className="btn btn-secondary btn-sm" data-action="purchase-master-export" onClick={exportSheet}>
            <FiDownload size={12} /> Download Excel
          </button>
          {canEdit && (
            <button className="btn btn-secondary btn-sm" data-action="purchase-master-import" onClick={() => fileRef.current?.click()}>
              <FiUpload size={12} /> Upload Excel / CSV
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            data-field="purchase-master-file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            style={{ display: "none" }}
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
          <button className="btn btn-secondary btn-sm" data-action="purchase-master-print" onClick={() => printDocument(sheetRef.current)}>
            <FiPrinter size={12} /> Print
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/library/purchase")}>
            <FiArrowLeft size={12} /> All Purchase documents
          </button>
        </div>
      </div>
      <p className="text-muted mb-4 mt-2">
        Purchase's master list of approved suppliers: the List of Approved Suppliers' own columns, then each supplier's rating. The Product Safety, Quality and
        Delivery Ratings are <strong>100</strong> unless changed — the Quality Rating is kept between <strong>97 and 100</strong> — and what they are worth is worked
        out: Product Safety × 50%, Quality × 40%, Delivery × 10%, the Overall Rating their sum. So a supplier reads 50 + 40 + 10 ={" "}
        <strong>100, Grade A</strong>, until a rating is changed. Every cell can be written in — the weightages, the Overall Rating and the Grade too: a figure
        typed there stands (marked) until the cell is emptied. A cell is saved when you leave it.
      </p>

      {!canEdit && (
        <div className="card mb-3" data-state="purchase-master-read-only" style={{ borderColor: "var(--color-border)" }}>
          <div className="card-pad text-sm">
            <FiLock size={13} style={{ verticalAlign: -2 }} /> You can read this list. Changing it — the ratings included — needs Write access to a Purchase document;
            the super admin gives it on Users &amp; Access.
          </div>
        </div>
      )}

      <div className="flex gap-3 wrap mb-4">
        <div className="stat-tile">
          <div className="stat-value" data-stat="suppliers">
            {names.size}
          </div>
          <div className="stat-label">Approved suppliers</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" data-stat="service-providers">
            {serviceProviders}
          </div>
          <div className="stat-label">Service providers</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" data-stat="grade-a" style={{ color: "var(--color-success)" }}>
            {gradeA}
          </div>
          <div className="stat-label">Lines at Grade A</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" data-stat="below-a" style={belowA ? { color: "var(--color-danger)" } : undefined}>
            {belowA}
          </div>
          <div className="stat-label">Lines below Grade A</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" data-stat="reapproval-overdue" style={overdue ? { color: "var(--color-warning)" } : undefined}>
            {overdue}
          </div>
          <div className="stat-label">Re-approval date passed</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" data-stat="to-confirm">
            {toConfirm}
          </div>
          <div className="stat-label">Lines with a note to confirm</div>
        </div>
      </div>

      {message && (
        <div
          className="card mb-3"
          data-state={message.tone === "ok" ? "purchase-master-done" : "purchase-master-error"}
          style={message.tone === "ok" ? { borderColor: "var(--color-success)", background: "var(--color-success-bg)" } : { borderColor: "var(--color-danger)", background: "var(--color-danger-bg)" }}
        >
          <div className="card-pad text-sm flex items-center justify-between gap-2">
            <span>
              {message.tone === "ok" ? <FiCheckCircle size={13} style={{ verticalAlign: -2 }} /> : <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} />} {message.text}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setMessage(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 wrap mb-2">
        <input
          className="input input-sm"
          style={{ maxWidth: 360 }}
          data-field="purchase-master-search"
          placeholder="Search by supplier, vendor code, product, category, grade…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="text-sm text-muted" data-state="purchase-master-count">
          {shown.length === suppliers.length ? `${suppliers.length} lines` : `${shown.length} of ${suppliers.length} lines`}
        </span>
      </div>

      <datalist id="pm-applicable-products">
        {APPLICABLE_PRODUCTS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="pm-document-answers">
        {DOCUMENT_ANSWERS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="pm-service-approvals">
        {SERVICE_APPROVALS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      <div ref={sheetRef} data-print-doc data-paper="landscape">
        <div className="print-only" style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>{COMPANY.name}</div>
          <div style={{ fontWeight: 700 }}>LIST OF APPROVED SUPPLIERS (RM, PM, SERVICE PROVIDER) — F/PUR/03</div>
          <div>Purchase Master Data, with each supplier's rating (F/PUR/05) · as on {formatDisplayDate(today)}</div>
        </div>
        <div className="doc-table" style={{ overflowX: "auto" }}>
          <table className="compact" data-table="purchase-master">
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: 44 }}>
                  SR. NO.
                </th>
                <th colSpan={LIST_COLUMNS.length} style={{ textAlign: "center" }}>
                  LIST OF APPROVED SUPPLIERS (RM, PM, SERVICE PROVIDER) — F/PUR/03
                </th>
                <th colSpan={RATING_COLUMNS.length + WORKED_COLUMNS.length} style={{ textAlign: "center" }} data-group="rating">
                  RATING — F/PUR/05: X × 50% + Y × 40% + Z × 10%
                </th>
                <th rowSpan={2} className="no-print" style={{ width: 70 }}></th>
              </tr>
              <tr>
                {LIST_COLUMNS.map((c) => heading(c.key, c.label, c.width))}
                {RATING_COLUMNS.map((c) => heading(c.key, c.label, c.width, `${RATING_BANDS[c.key as RatingKey].min} to ${RATING_BANDS[c.key as RatingKey].max}; 100 unless changed`))}
                {WORKED_COLUMNS.map((c) => heading(c.key, c.label, c.width, "Worked out from the ratings — never typed"))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={columnCount + 1} className="text-muted text-center" style={{ padding: 16 }}>
                    {suppliers.length === 0 ? "No supplier on the list yet — add one, or upload the list from Excel." : "No line matches the search."}
                  </td>
                </tr>
              )}
              {shown.slice(0, rowsShown).map(({ supplier: s, index }) => {
                const issues = (problems.get(s.id) ?? []).filter((p) => p.tone === "danger");
                return (
                  <React.Fragment key={s.id}>
                    <tr data-supplier={s.id} data-grade={ratings.get(s.id)?.grade} data-problems={issues.length}>
                      <td className="text-muted">{index + 1}</td>
                      {listCells(s)}
                      {ratingCells(s)}
                      <td className="no-print" style={{ whiteSpace: "nowrap" }}>
                        {(s.notes?.length || s.sources?.length) && (
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            data-action="purchase-master-notes"
                            title={s.notes?.length ? "Notes to confirm" : "Where this line came from"}
                            style={s.notes?.length ? { color: "var(--color-warning)" } : undefined}
                            onClick={() => setNotesOpen((open) => (open === s.id ? null : s.id))}
                          >
                            {s.notes?.length ? <FiAlertTriangle size={13} /> : <FiInfo size={13} />}
                          </button>
                        )}
                        {canEdit && (
                          <button className="btn btn-ghost btn-sm btn-icon" data-action="purchase-master-delete" title="Remove from the list" onClick={() => setRemoving(s)}>
                            <FiTrash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {(notesOpen === s.id || issues.length > 0) && (
                      <tr className="no-print" data-notes-for={s.id}>
                        <td></td>
                        <td colSpan={columnCount} className="text-xs" style={{ whiteSpace: "normal" }}>
                          {issues.map((i) => (
                            <div key={`${i.field}:${i.message}`} style={{ color: "var(--color-danger)" }}>
                              <FiAlertTriangle size={11} style={{ verticalAlign: -1 }} /> {i.message}
                            </div>
                          ))}
                          {notesOpen === s.id && (
                            <>
                              {s.notes?.map((n) => (
                                <div key={n} className="tbc">
                                  {n}
                                </div>
                              ))}
                              {s.sources?.length ? <div className="text-muted">Put on the sheet from {s.sources.join(" and ")}.</div> : null}
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-4" data-section="purchase-master-rating">
        <div className="card-header">
          <h3 className="text-base font-semibold">How the rating is worked out</h3>
        </div>
        <div className="card-pad text-sm">
          <ul className="mb-2" style={{ paddingLeft: 18 }}>
            <li>
              Product Safety Rating (X), Quality Rating (Y) and Delivery Rating (Z): <strong>100</strong> for every supplier unless changed. Quality is kept between{" "}
              <strong>97 and 100</strong>; Product Safety and Delivery between 0 and 100. An emptied cell goes back to 100.
            </li>
            <li>
              Product safety Weightage = X × 50% (50.00 at 100) · Quality Weightage = Y × 40% (40.00) · Delivery Weightage = Z × 10% (10.00) — the same arithmetic
              as the F/PUR/05 register.
            </li>
            <li>Overall Rating = the three weightages added: 100.00 when all three ratings are 100.</li>
            <li>
              Any of the five worked-out figures can be typed over — a weightage up to its weight (50, 40, 10), the Overall Rating 0 to 100, the Grade A, B or C. A
              typed figure is marked, counts in what follows it (a typed weightage in the Overall Rating, a typed Overall Rating in the Grade), and stays until its
              cell is emptied; then it is worked out again.
            </li>
            <li>
              Grade, as F/PUR/05's Overall Rating table prints it:{" "}
              {OVERALL_GRADES.map((g, i) => (
                <span key={g.grade}>
                  {i > 0 ? " · " : ""}
                  <strong style={{ color: GRADE_COLOUR[g.grade] }}>{g.grade}</strong> {g.grade === "A" ? "at 90 and above" : g.grade === "B" ? "from 80 to below 90" : "below 80"} ({g.action})
                </span>
              ))}
              .
            </li>
            <li>
              Writing an APPROVAL DATE on a line without a Re-approval Due date writes that too, as the list does: three years less a day for a material supplier, a
              year less a day for a service provider — yours to change.
            </li>
          </ul>
          <p className="text-muted">
            Changing a cell needs Write access to a Purchase document (or the super admin); everyone else who sees Purchase reads the list. Every rating change is
            written in the activity log.
          </p>
        </div>
      </div>

      {removing && (
        <Modal
          title="Remove from Purchase Master Data"
          onClose={() => setRemoving(null)}
          footer={
            <div className="flex justify-end gap-2" style={{ width: "100%" }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setRemoving(null)}>
                Keep
              </button>
              <button
                className="btn btn-danger btn-sm"
                data-action="purchase-master-confirm-delete"
                onClick={() => {
                  purchaseMasterRepository.remove(removing.id);
                  logActivity("Purchase Master Data: supplier line removed", removing.supplierName || "A supplier line", [removing.vendorCode, removing.productService].filter(Boolean).join(" · "));
                  setMessage({ tone: "ok", text: `${removing.supplierName || "The line"} was removed from the list.` });
                  setRemoving(null);
                  bump();
                }}
              >
                Remove
              </button>
            </div>
          }
        >
          <p className="text-sm">
            Remove <strong>{removing.supplierName || "this line"}</strong>
            {removing.productService ? ` (${removing.productService})` : ""}
            {removing.vendorCode ? `, Vendor Code ${removing.vendorCode},` : ""} from the List of Approved Suppliers?
          </p>
        </Modal>
      )}

      {pending && <ImportPreview pending={pending} onCancel={() => setPending(null)} onApply={applyImport} />}
    </div>
  );
}

function ImportPreview({ pending, onCancel, onApply }: { pending: PendingImport; onCancel: () => void; onApply: () => void }) {
  const { plan } = pending;
  const nothing = plan.additions.length === 0 && plan.updates.length === 0;
  const shownValue = (key: SupplierKey, value: string) => (key === "approvalDate" || key === "reapprovalDueDate" ? shownDate(value) : value);
  return (
    <Modal
      title={`Upload ${pending.fileName}`}
      onClose={onCancel}
      width={860}
      footer={
        <div className="flex justify-end gap-2" style={{ width: "100%" }}>
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" data-action="purchase-master-apply-import" disabled={nothing} onClick={onApply}>
            {nothing ? "Nothing to change" : `Add ${plan.additions.length}, update ${plan.updates.length}`}
          </button>
        </div>
      }
    >
      <div data-section="purchase-master-import-preview">
        <p className="text-sm mb-2" data-state="import-summary">
          Headings found on line {plan.headerLine}. <strong data-count="additions">{plan.additions.length}</strong> to add,{" "}
          <strong data-count="updates">{plan.updates.length}</strong> to update, <strong data-count="unchanged">{plan.unchanged}</strong> already the same,{" "}
          <strong data-count="skipped">{plan.skipped.length}</strong> left out. Nothing changes until you press the button below.
        </p>
        <p className="text-xs text-muted mb-3">
          A line is matched to the list by its Vendor Code (or, without one, its SUPPLIER NAME) and its PRODUCT / SERVICE; a blank cell in the file leaves what the
          list has. A new line's ratings are 100 unless the file gives them.
        </p>
        {plan.updates.length > 0 && (
          <>
            <h4 className="text-sm font-semibold mb-1">To update</h4>
            <div className="doc-table mb-3">
              <table className="compact" data-table="import-updates">
                <tbody>
                  {plan.updates.map((u) => (
                    <tr key={u.supplierId}>
                      <td className="text-muted">Line {u.line}</td>
                      <td className="font-semibold">{u.supplierName}</td>
                      <td className="text-xs" style={{ whiteSpace: "normal" }}>
                        {u.changes.map((c) => (
                          <div key={c.key}>
                            {supplierColumnLabel(c.key)}: {c.before ? `“${shownValue(c.key, c.before)}”` : "blank"} → “{shownValue(c.key, c.after)}”
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {plan.additions.length > 0 && (
          <>
            <h4 className="text-sm font-semibold mb-1">To add</h4>
            <div className="doc-table mb-3" style={{ overflowX: "auto" }}>
              <table className="compact" data-table="import-additions">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Vendor Code</th>
                    <th>SUPPLIER NAME</th>
                    <th>PRODUCT / SERVICE</th>
                    <th>CATEGORY</th>
                    <th>X / Y / Z</th>
                    <th>Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.additions.map((a) => {
                    const r = supplierRating(a.values);
                    return (
                      <tr key={a.line}>
                        <td className="text-muted">{a.line}</td>
                        <td>{a.values.vendorCode}</td>
                        <td>{a.values.supplierName}</td>
                        <td>{a.values.productService}</td>
                        <td>{a.values.category}</td>
                        <td>
                          {ratingOf(a.values.productSafetyRating)} / {ratingOf(a.values.qualityRating)} / {ratingOf(a.values.deliveryRating)}
                        </td>
                        <td>
                          {r.overallRating} {r.grade}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {(plan.skipped.length > 0 || plan.warnings.length > 0) && (
          <>
            <h4 className="text-sm font-semibold mb-1">Left out</h4>
            <ul className="text-sm" data-list="import-left-out">
              {plan.skipped.map((s) => (
                <li key={`s${s.line}`}>
                  Line {s.line}: {s.reason}
                </li>
              ))}
              {plan.warnings.map((w, i) => (
                <li key={`w${w.line}-${i}`}>
                  Line {w.line}: {w.message}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
