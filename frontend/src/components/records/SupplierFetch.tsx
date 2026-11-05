import React, { useState } from "react";
import { FiCheckCircle, FiDatabase, FiInfo, FiList, FiPlus } from "react-icons/fi";
import type { LogSheetData, LogSheetLayout } from "../../types";
import { useRouter } from "../../store/router";
import { applyFills, type FieldFill } from "../../engine/hrMaster";
import {
  addAllSuppliers,
  allSuppliers,
  describeSupplier,
  fillBlanksFromSuppliers,
  isBlankLine,
  lineForSupplier,
  searchSuppliers,
  supplierFill,
  suppliersForRegister,
  type SupplierLink,
} from "../../engine/purchaseMasterLinks";
import type { ApprovedSupplier } from "../../types";
import { blankLogRow } from "./HrMasterFetch";

// FETCH A SUPPLIER FROM PURCHASE MASTER DATA ON A RECORD (REQUIREMENTS §186). The bar above a format that names a supplier,
// shown while the record can be written in — Maintenance's machine bar (EquipmentFetch.tsx, §74) with the list of
// approved suppliers in place of the equipment list:
//
//   a form about one supplier (F/PUR/01, F/PUR/02, QC incoming)   name or Vendor Code → Fetch
//   a register (F/PUR/03, F/PUR/05, F/PUR/06)                      name or Vendor Code → Add line; or the whole list at once
//   either                                                         Fill blanks from Purchase Master Data
//
// Blank boxes are filled straight away. A box that already holds something else is listed beside what the list has, and
// replaced only on "Replace", worked out again against the form as it is by then.

export const SUPPLIER_NAMES_LIST = "purchase-master-suppliers";
const MASTER = "Purchase Master Data";
const ROUTE = "/purchase/master-data";

type Result = "filled" | "added" | "conflict" | "not-found" | "several" | "nothing";

interface Pending {
  supplier: ApprovedSupplier;
  conflicts: FieldFill[];
}

export function SupplierFetch({
  link,
  layout,
  data,
  onChange,
  newRowId,
  canOpenList,
}: {
  link: SupplierLink;
  layout: LogSheetLayout;
  data: LogSheetData;
  onChange: (data: LogSheetData) => void;
  newRowId: () => string;
  /** Whether the person may open the list itself (they see Purchase); otherwise they only fetch from it. */
  canOpenList: boolean;
}) {
  const { navigate } = useRouter();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ApprovedSupplier[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [outcome, setOutcome] = useState<{ result: Result; text: string } | null>(null);
  const perHeader = link.where === "header";

  // A label as it reads inside a sentence: "SUPPLIER'S NAME" rather than the form's "SUPPLIER'S NAME :".
  const labelOf = (key: string) =>
    ([...layout.headerFields, ...(layout.footerFields ?? []), ...layout.columns].find((f) => f.key === key)?.label ?? key).replace(/[\s:–-]+$/, "");
  const listed = (fills: FieldFill[]) => fills.map((f) => labelOf(f.key)).join(", ");
  const say = (result: Result, text: string) => setOutcome({ result, text });

  // Only the boxes this format still has: the Sheet Designer can remove one the map names.
  const present = (): SupplierLink => {
    const keys = new Set((perHeader ? [...layout.headerFields, ...(layout.footerFields ?? [])] : layout.columns).map((f) => f.key));
    return { ...link, fields: link.fields.filter((f) => keys.has(f.key)) };
  };
  const newLine = () => ({ ...blankLogRow(layout), id: newRowId() });

  const write = (supplier: ApprovedSupplier, fills: FieldFill[]) => {
    onChange({ ...data, header: applyFills(data.header ?? {}, fills) });
    say("filled", `Filled from ${MASTER} for ${describeSupplier(supplier)}: ${listed(fills)}.`);
  };

  const take = (supplier: ApprovedSupplier) => {
    setCandidates([]);
    setPending(null);
    const usable = present();
    if (!perHeader) {
      // On the register's first blank line, else a new one.
      const at = data.rows.findIndex((r) => isBlankLine(usable, r));
      const rows = [...data.rows];
      if (at >= 0) rows[at] = lineForSupplier(usable, supplier, rows[at]);
      else rows.push(lineForSupplier(usable, supplier, newLine()));
      onChange({ ...data, rows });
      say("added", `Line ${at >= 0 ? at + 1 : rows.length} written for ${describeSupplier(supplier)}.`);
      return;
    }
    const { fills, conflicts } = supplierFill(usable, supplier, data.header ?? {});
    if (conflicts.length > 0) {
      setPending({ supplier, conflicts });
      say("conflict", `The form already has something else in ${listed(conflicts)}. Replace it with what ${MASTER} has for ${supplier.supplierName}?`);
    } else if (fills.length > 0) write(supplier, fills);
    else say("nothing", `The form already has ${supplier.supplierName}'s details, so there is nothing to fetch.`);
  };

  const find = () => {
    setPending(null);
    const suppliers = allSuppliers();
    const q = query.trim();
    if (suppliers.length === 0) {
      setCandidates([]);
      say("not-found", `There is no supplier on ${MASTER} to fetch from.`);
      return;
    }
    const { exact, candidates: found } = searchSuppliers(q, suppliers);
    if (exact) {
      take(exact);
      setQuery("");
    } else if (found.length > 0) {
      setCandidates(found);
      say("several", found.length === 1 ? "Is this the supplier you mean?" : `${found.length} lines of ${MASTER} match "${q}". Which one?`);
    } else {
      setCandidates([]);
      say("not-found", `No supplier on ${MASTER} has the name or Vendor Code "${q}".`);
    }
  };

  const fillBlanks = () => {
    setPending(null);
    setCandidates([]);
    const { data: next, filled, notOnList } = fillBlanksFromSuppliers(present(), data);
    const missing =
      notOnList.length > 0
        ? ` ${notOnList.length === 1 ? "This is" : "These are"} not one supplier on ${MASTER}: ${notOnList.slice(0, 5).join(", ")}${notOnList.length > 5 ? "…" : ""}.`
        : "";
    if (filled.length === 0) {
      const idBlank = perHeader && !String(data.header?.[link.idField] ?? "").trim();
      say(
        "nothing",
        idBlank
          ? `Type the supplier's name in “${labelOf(link.idField)}” first, or fetch it above.`
          : `Nothing to fill. ${perHeader ? "The form's supplier has no blank box the list can fill." : "No line whose supplier is on the list has a blank box it can fill."}${missing}`
      );
      return;
    }
    onChange(next);
    const boxes = filled.reduce((n, f) => n + f.fills.length, 0);
    say(
      "filled",
      perHeader
        ? `Filled from ${MASTER} for ${filled[0].name}: ${listed(filled[0].fills)}.${missing}`
        : `Filled ${boxes} blank box${boxes === 1 ? "" : "es"} on ${filled.length} line${filled.length === 1 ? "" : "s"} from ${MASTER}.${missing}`
    );
  };

  const addAll = () => {
    setPending(null);
    setCandidates([]);
    const { data: next, added, already } = addAllSuppliers(present(), data, newLine);
    if (added === 0) {
      say("nothing", already > 0 ? `Every supplier ${MASTER} lists for this register is on it already (${already}).` : `${MASTER} has no supplier for this register.`);
      return;
    }
    onChange(next);
    say("added", `${added} supplier line${added === 1 ? "" : "s"} written from ${MASTER}${already > 0 ? `; ${already} already on the register` : ""}.`);
  };

  // Worked out again against the form as it is now: only what was shown is replaced.
  const resolve = (replace: boolean) => {
    if (!pending) return;
    const { supplier } = pending;
    setPending(null);
    const { fills, conflicts } = supplierFill(present(), supplier, data.header ?? {});
    const shown = (c: FieldFill) => pending.conflicts.some((p) => p.key === c.key && p.before === c.before && p.after === c.after);
    if (replace && !conflicts.every(shown)) {
      setPending({ supplier, conflicts });
      say("conflict", `The form has changed since, and now ${listed(conflicts)} would be replaced. Replace it with what ${MASTER} has for ${supplier.supplierName}?`);
      return;
    }
    const writing = replace ? [...fills, ...conflicts] : fills;
    if (writing.length === 0) say("nothing", "Left as it was. There was nothing to fill.");
    else write(supplier, writing);
  };

  const registerCount = link.all ? suppliersForRegister(link).length : 0;
  const registerWords = link.all === "materials" ? "material suppliers" : link.all === "services" ? "service providers" : "suppliers";

  return (
    <div className="card mt-4 no-print" data-section="supplier-fetch" style={{ borderStyle: "dashed" }}>
      <div className="card-pad">
        <div className="flex items-center gap-2 wrap">
          <span className="text-sm font-semibold">
            <FiDatabase size={13} style={{ verticalAlign: -2 }} /> Fetch from {MASTER}, the list of approved suppliers
          </span>
          <input
            className="input input-sm"
            style={{ maxWidth: 300 }}
            data-field="supplier-query"
            list={SUPPLIER_NAMES_LIST}
            placeholder="Supplier name or Vendor Code (S0137)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) find();
            }}
          />
          <button className="btn btn-primary btn-sm" data-action={perHeader ? "supplier-fetch" : "supplier-add-line"} disabled={!query.trim()} onClick={find}>
            {perHeader ? (
              "Fetch"
            ) : (
              <>
                <FiPlus size={12} /> Add line
              </>
            )}
          </button>
          {link.all && (
            <button className="btn btn-secondary btn-sm" data-action="supplier-add-all" disabled={registerCount === 0} onClick={addAll}>
              <FiList size={12} /> Add all {registerCount} {registerWords}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" data-action="supplier-fill-blanks" onClick={fillBlanks}>
            Fill blanks from {MASTER}
          </button>
          {canOpenList && (
            <button className="btn btn-ghost btn-sm" data-action="open-purchase-master" onClick={() => navigate(ROUTE)}>
              Open {MASTER}
            </button>
          )}
        </div>
        <div className="text-xs text-muted mt-1">
          {perHeader
            ? "Type or pick the supplier's name, or its Vendor Code. Blank boxes are filled from the list, and anything already written only if you say so."
            : `Type or pick a supplier to write its line, or add every one of the list's ${registerWords} at once — a supplier already on the register is not added again. Or fill the blank boxes of every line whose supplier is on the list.`}
        </div>

        {outcome && (
          <div className="text-sm mt-2" data-state="supplier-result" data-result={outcome.result}>
            {outcome.result === "filled" || outcome.result === "added" ? <FiCheckCircle size={13} style={{ verticalAlign: -2, color: "var(--color-success)" }} /> : <FiInfo size={13} style={{ verticalAlign: -2 }} />}{" "}
            {outcome.text}
          </div>
        )}

        {candidates.length > 0 && (
          <div className="flex gap-2 wrap mt-2" data-list="supplier-candidates">
            {candidates.map((s) => (
              <button key={s.id} className="btn btn-secondary btn-sm" data-candidate={s.id} onClick={() => take(s)}>
                {describeSupplier(s)}
              </button>
            ))}
          </div>
        )}

        {pending && (
          <div className="mt-2" data-section="supplier-conflicts">
            <ul className="text-sm mb-2">
              {pending.conflicts.map((c) => (
                <li key={c.key}>
                  {labelOf(c.key)}: “{c.before}” → “{c.after}”
                </li>
              ))}
            </ul>
            <div className="flex gap-2 wrap">
              <button className="btn btn-primary btn-sm" data-action="supplier-replace" onClick={() => resolve(true)}>
                Replace
              </button>
              <button className="btn btn-secondary btn-sm" data-action="supplier-blanks-only" onClick={() => resolve(false)}>
                Fill only the blank boxes
              </button>
              <button
                className="btn btn-ghost btn-sm"
                data-action="supplier-cancel"
                onClick={() => {
                  setPending(null);
                  say("nothing", "Left as it was. Nothing was fetched.");
                }}
              >
                Leave it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The list's suppliers, for the supplier boxes' suggestion list: the name to type, and what the line is beside it. */
export function SupplierNameList() {
  const suppliers = allSuppliers();
  return (
    <datalist id={SUPPLIER_NAMES_LIST}>
      {suppliers.map((s) => (
        <option key={s.id} value={s.supplierName} label={describeSupplier(s)} />
      ))}
    </datalist>
  );
}
