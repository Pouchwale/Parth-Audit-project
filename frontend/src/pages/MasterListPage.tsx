import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCheck, FiRefreshCw, FiUsers } from "react-icons/fi";
import { accessApi, ApiError, usersApi } from "../api/client";
import { useAccessDocs, useAccessRules } from "../components/access/AccessSection";
import { Modal } from "../components/common/Modal";
import { DEPARTMENTS } from "../data/seed/departments";
import { ACCESS_MODULES, defaultResponsible, type AccessLevel, type AccessRules } from "../engine/accessRules";
import { accountWord, masterLevelName, type AccountKey } from "../engine/accountWords";
import {
  NO_FILTER,
  cellOf,
  fillMany,
  filterRows,
  levelWithoutOwn,
  masterAccess,
  masterBosses,
  masterColumns,
  masterSections,
  nameOfEmail,
  setFillers,
  setLevels,
  type MasterFilter,
  type MasterRow,
} from "../engine/masterList";
import { useT } from "../i18n";
import { useAuth } from "../store/AuthContext";
import { useAppStore } from "../store/AppStore";
import { Link } from "../store/router";
import { useProgressiveCount } from "../utils/useProgressive";
import type { ManagedUser } from "../types/auth";

// THE MASTER LIST OF WHO DOES WHAT — /master-list, the super admin's own (REQUIREMENTS §110).
//
// The owner, 12-Oct-2026: "make sure give me options like separate master list format only for superadmin in which in
// every document present in that master list format so in that super will select user according to documents
// superadmin can select and also give options like read, write, and view".
//
// Every document in the order and columns of the Master List of Formats & Records (F/SYS/02): its module section, Sr.
// No., format number and name, frequency and method of recording; who fills it ("Filled by", the main person first);
// and each active person's level: No access, View (Read), Write, Edit, plain where the owner's table gives it and bold
// where the super admin set it. Filters (a module, a person, "Nobody fills this", words) and a change for many documents
// at once (tick rows, then give a person a level, or make them the one who fills them).
//
// ONE SOURCE OF TRUTH. It writes the same "access" item Users & Access writes, with the same server checks (the super
// admin's alone, the version it read or 409: backend/accessRulesRoutes.ts), so both pages always show the same thing.
// The rules themselves are engine/accessRules.ts's; the rows, the cells and each change are engine/masterList.ts's.
//
// FAST ON A LOW-END LAPTOP (§56): about 130 documents by about ten people is text, not 1,300 drop-downs. A cell is a
// small button with no handler of its own (one click handler on the table finds it); a click opens ONE small menu
// beside it; the rows are drawn a batch at a time (utils/useProgressive.ts).
//
// THE SCREEN IS NEVER THE LOCK: the server refuses anybody else whatever is sent.

type Menu = { kind: "level"; email: string; documentId: string; x: number; y: number } | { kind: "fill"; documentId: string; x: number; y: number };

type BulkAsk = { kind: "level"; email: string; level: AccessLevel | null } | { kind: "only" | "add"; email: string };

const LEVELS: readonly AccessLevel[] = ["none", "read", "write", "edit"];
const lower = (s: string): string => s.trim().toLowerCase();
const moduleName = (code: string): string => DEPARTMENTS.find((d) => d.code === code)?.name ?? code;
/** "F/QC/13 IPQC - Printing", or the name alone for a number not yet given. */
const calledBy = (r: Pick<MasterRow, "formatNo" | "name">): string => (r.formatNo ? `${r.formatNo} ${r.name}` : r.name);

export function MasterListPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin";
  const { uiLang, bump } = useAppStore();
  const t = useT();
  const w = useCallback((key: AccountKey, vars?: Record<string, string | number>) => accountWord(uiLang, key, vars), [uiLang]);
  const accessRules = useAccessRules(isAdmin);
  const { all, docs } = useAccessDocs();
  const [people, setPeople] = useState<ManagedUser[] | null>(null);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MasterFilter>(NO_FILTER);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<Menu | null>(null);
  const [ask, setAsk] = useState<BulkAsk | null>(null);
  const [bulkPerson, setBulkPerson] = useState("");
  const [bulkLevel, setBulkLevel] = useState<string>("read");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    usersApi
      .list()
      .then((res) => setPeople(res.users))
      .catch((err) => setPeopleError(err instanceof ApiError ? err.message : "The accounts could not be read."));
  }, [isAdmin]);

  const sections = useMemo(() => masterSections(all, (f) => t(`freq.${f}`)), [all, t]);
  const total = useMemo(() => sections.reduce((n, s) => n + s.rows.length, 0), [sections]);
  const rules: AccessRules | null = accessRules.loaded?.rules ?? null;
  const version = accessRules.loaded?.version ?? 0;
  const access = useMemo(() => (rules ? masterAccess(sections, rules) : null), [sections, rules]);
  const columns = useMemo(() => masterColumns(people ?? []), [people]);
  const bosses = useMemo(() => masterBosses(people ?? []), [people]);
  const nameOf = useMemo(() => nameOfEmail(people ?? []), [people]);
  const shown = useMemo(() => (access ? filterRows(sections, filter, access, columns) : []), [sections, filter, access, columns]);
  const shownCount = useMemo(() => shown.reduce((n, s) => n + s.rows.length, 0), [shown]);
  const shownColumns = useMemo(() => (filter.person ? columns.filter((p) => lower(p.email) === lower(filter.person)) : columns), [columns, filter.person]);
  const rowsById = useMemo(() => new Map(sections.flatMap((s) => s.rows.map((r) => [r.id, r] as const))), [sections]);
  // The sections and rows as one list, drawn a batch at a time.
  const lines = useMemo(() => shown.flatMap((s) => [{ section: s.module, count: s.rows.length } as const, ...s.rows.map((row) => ({ row }))]), [shown]);
  const drawn = useProgressiveCount(lines.length, 40, 60);

  // The menu closes on Escape, on a scroll of the page and on a click outside it.
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-cell],[data-fill]")) setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [menu]);

  if (!isAdmin) {
    return (
      <div className="empty-state" data-page="master-list" data-state="not-admin">
        <h2 className="text-xl mb-2">{w("ml.title")}</h2>
        <p className="text-muted">{w("ml.notAdmin")}</p>
      </div>
    );
  }

  const save = async (next: AccessRules, saved: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await accessApi.save(next, version);
      accessRules.saved(next, typeof res?.version === "number" ? res.version : version + 1);
      bump();
      setNote(saved);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setStale(true);
      else setError(w("ml.failed", { why: err instanceof ApiError ? err.message : String(err) }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const personName = (email: string): string => nameOf(lower(email));

  /** A click in the table: a level opens its menu, "Filled by" its list; one handler for every cell. */
  const onTableClick = (e: React.MouseEvent<HTMLTableElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-cell],[data-fill]");
    if (!target || busy) return;
    const box = target.getBoundingClientRect();
    const x = Math.max(8, Math.min(box.left, window.innerWidth - 270));
    const y = Math.min(box.bottom + 4, window.innerHeight - 320);
    const documentId = target.getAttribute("data-doc") ?? "";
    if (target.hasAttribute("data-cell")) setMenu({ kind: "level", email: target.getAttribute("data-email") ?? "", documentId, x, y: Math.max(8, y) });
    else setMenu({ kind: "fill", documentId, x, y: Math.max(8, y) });
  };

  const pickLevel = async (email: string, documentId: string, level: AccessLevel | null) => {
    if (!rules) return;
    setMenu(null);
    const row = rowsById.get(documentId);
    const after = setLevels(rules, docs, email, [documentId], level);
    // The level it has afterwards, as the rules then say: back to the module's or the table's when one was put back.
    const person = columns.find((p) => lower(p.email) === lower(email));
    const now = masterAccess(sections, after).level({ email: lower(email), role: person?.role ?? "staff", departments: person?.departments ?? [] }, documentId);
    await save(after, w("ml.savedLevel", { person: personName(email), level: masterLevelName(uiLang, now), doc: row ? calledBy(row) : documentId }));
  };

  const saveFillers = async (documentId: string, emails: string[]) => {
    if (!rules) return;
    setMenu(null);
    const row = rowsById.get(documentId);
    const doc = row?.doc;
    const after = setFillers(rules, docs, documentId, emails);
    const now = doc ? (after.responsibility[documentId] ?? defaultResponsible(doc)) : emails;
    const called = row ? calledBy(row) : documentId;
    await save(after, now.length ? w("ml.savedFill", { doc: called, names: now.map(personName).join(", ") }) : w("ml.savedNobody", { doc: called }));
  };

  const tickedIds = [...ticked].filter((id) => rowsById.has(id));
  const tickedTitles = tickedIds.map((id) => calledBy(rowsById.get(id)!));
  const titlesWords = tickedTitles.length > 6 ? `${tickedTitles.slice(0, 6).join("; ")}; ${w("ml.moreDocs", { n: tickedTitles.length - 6 })}` : tickedTitles.join("; ");

  const doBulk = async () => {
    if (!rules || !ask) return;
    const after =
      ask.kind === "level" ? setLevels(rules, docs, ask.email, tickedIds, ask.level) : fillMany(rules, docs, ask.email, tickedIds, ask.kind);
    const ok = await save(after, w("ml.savedBulk", { n: tickedIds.length }));
    setAsk(null);
    if (ok) setTicked(new Set());
  };

  const askWords = (a: BulkAsk): { title: string; body: string } => {
    const person = personName(a.email);
    const n = tickedIds.length;
    const title =
      a.kind === "level"
        ? a.level === null
          ? w("ml.ask.default", { person, n })
          : n === 1
            ? w("ml.ask.levelOne", { person, level: masterLevelName(uiLang, a.level), doc: tickedTitles[0] ?? "" })
            : w("ml.ask.level", { person, level: masterLevelName(uiLang, a.level), n })
        : a.kind === "only"
          ? w("ml.ask.only", { person, n })
          : w("ml.ask.add", { person, n });
    return { title, body: w("ml.ask.body", { docs: titlesWords, person }) };
  };

  const loading = !rules || !access || people === null;

  return (
    <div data-page="master-list" data-state={loading ? "loading" : "ready"}>
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <div>
          <h1 className="text-2xl mb-1">{w("ml.title")}</h1>
          <p className="text-muted text-sm" style={{ maxWidth: 900 }}>
            {w("ml.intro")}
          </p>
        </div>
        <Link to="/users" className="btn btn-secondary btn-sm">
          <FiUsers size={13} /> {t("nav.users")}
        </Link>
      </div>

      {(accessRules.error || peopleError) && <div className="auth-error mb-3">{accessRules.error ?? peopleError}</div>}
      {error && <div className="auth-error mb-3">{error}</div>}
      {stale && (
        <div className="card mb-3" role="alert" data-section="master-stale" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
          <div className="card-pad text-sm flex items-center justify-between gap-3 wrap">
            <span>{w("ml.stale")}</span>
            <button
              className="btn btn-secondary btn-sm"
              data-action="reload-master"
              onClick={() => {
                setStale(false);
                accessRules.reload();
              }}
            >
              <FiRefreshCw size={12} /> {w("ml.reload")}
            </button>
          </div>
        </div>
      )}
      {note && (
        <div className="card mb-3 no-print" role="status" data-section="master-note" style={{ borderColor: "var(--color-success)" }}>
          <div className="card-pad text-sm flex items-center justify-between gap-3">
            <span>{note}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setNote(null)}>
              {t("common.close")}
            </button>
          </div>
        </div>
      )}

      {/* THE LEVELS IN WORDS: "View" and "Read" are the same level (the owner's words); bold is the super admin's own. */}
      <div className="access-legend mb-3" data-section="master-legend">
        {LEVELS.map((l) => (
          <div key={l} data-level={l}>
            <div className="text-xs">{w(`ml.legend.${l}` as AccountKey)}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mb-3" data-section="master-marks">
        {w("ml.levelNote")} {w("ml.legend.marks")}
        {bosses.length > 0 && (
          <>
            {" "}
            <span translate="no">{w("ml.superAdmins", { names: bosses.map((b) => b.name).join(", ") })}</span>
          </>
        )}
      </p>

      {loading ? (
        <p className="text-muted text-sm">{w("ml.loading")}</p>
      ) : (
        <>
          {/* THE FILTERS: a module, a person, "Nobody fills this", words. */}
          <div className="ml-filters mb-3" data-section="master-filters">
            <label className="ml-filter">
              <span>{w("ml.filter.module")}</span>
              <select className="input" data-field="filter-module" value={filter.module} onChange={(e) => setFilter((f) => ({ ...f, module: e.target.value }))}>
                <option value="">{w("ml.filter.everyModule")}</option>
                {ACCESS_MODULES.map((m) => (
                  <option key={m} value={m}>
                    {m} · {moduleName(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="ml-filter">
              <span>{w("ml.filter.person")}</span>
              <select className="input" data-field="filter-person" value={filter.person} onChange={(e) => setFilter((f) => ({ ...f, person: e.target.value, every: false }))}>
                <option value="">{w("ml.filter.everybody")}</option>
                {columns.map((p) => (
                  <option key={p.id} value={lower(p.email)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {filter.person && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" data-field="filter-every" checked={filter.every} onChange={(e) => setFilter((f) => ({ ...f, every: e.target.checked }))} />
                {w("ml.filter.every")}
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" data-field="filter-nobody" checked={filter.nobody} onChange={(e) => setFilter((f) => ({ ...f, nobody: e.target.checked }))} />
              {w("ml.filter.nobody")}
            </label>
            <label className="ml-filter">
              <span>{w("ml.filter.find")}</span>
              <input className="input" data-field="filter-find" value={filter.find} onChange={(e) => setFilter((f) => ({ ...f, find: e.target.value }))} placeholder="F/QC/13" />
            </label>
            <span className="text-xs text-muted" data-field="master-count" data-count={shownCount}>
              {w("ml.count", { n: shownCount, all: total })}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-action="tick-shown"
              onClick={() => setTicked(new Set(shown.flatMap((s) => s.rows.map((r) => r.id))))}
              disabled={shownCount === 0}
            >
              {w("ml.bulk.tickShown")}
            </button>
          </div>

          {/* A CHANGE FOR MANY DOCUMENTS AT ONCE: tick rows, then give a person a level or make them the one who fills them. */}
          {tickedIds.length > 0 && (
            <div className="ml-bulk mb-3" data-section="master-bulk" data-count={tickedIds.length}>
              <strong className="text-sm">{w("ml.bulk.ticked", { n: tickedIds.length })}</strong>
              <select className="input" data-field="bulk-person" value={bulkPerson} onChange={(e) => setBulkPerson(e.target.value)} aria-label={w("ml.bulk.person")}>
                <option value="">{w("ml.bulk.person")}…</option>
                {columns.map((p) => (
                  <option key={p.id} value={lower(p.email)}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select className="input" data-field="bulk-level" value={bulkLevel} onChange={(e) => setBulkLevel(e.target.value)} aria-label={w("ml.bulk.level")}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l === "read" ? w("ml.menu.read") : masterLevelName(uiLang, l)}
                  </option>
                ))}
                <option value="">{w("ml.fill.back")}</option>
              </select>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-action="bulk-give"
                disabled={!bulkPerson || busy}
                onClick={() => setAsk({ kind: "level", email: bulkPerson, level: bulkLevel === "" ? null : (bulkLevel as AccessLevel) })}
              >
                {w("ml.bulk.give")}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" data-action="bulk-only" disabled={!bulkPerson || busy} onClick={() => setAsk({ kind: "only", email: bulkPerson })}>
                {w("ml.bulk.only")}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" data-action="bulk-add" disabled={!bulkPerson || busy} onClick={() => setAsk({ kind: "add", email: bulkPerson })}>
                {w("ml.bulk.add")}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" data-action="bulk-clear" onClick={() => setTicked(new Set())}>
                {w("ml.bulk.clear")}
              </button>
              {!bulkPerson && <span className="text-xs text-muted">{w("ml.bulk.pick")}</span>}
            </div>
          )}

          {shownCount === 0 ? (
            <p className="text-sm text-muted" data-section="master-none">
              {w("ml.none")}
            </p>
          ) : (
            <div className="doc-table compact ml-table-wrap" data-section="master-list">
              <table className="ml-table" data-table="master-list" onClick={onTableClick}>
                <thead>
                  <tr>
                    <th className="ml-tick">
                      <span className="sr-only">{w("ml.col.tick")}</span>
                    </th>
                    <th className="ml-sr">{w("ml.col.sr")}</th>
                    <th>{w("ml.col.format")}</th>
                    <th>{w("ml.col.name")}</th>
                    <th>{w("ml.col.frequency")}</th>
                    <th>{w("ml.col.filledBy")}</th>
                    {shownColumns.map((p) => (
                      <th key={p.id} className="ml-person" title={p.email} data-person={lower(p.email)} translate="no">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.slice(0, drawn).map((line) => {
                    if ("section" in line) {
                      return (
                        <tr key={`s-${line.section || "none"}`} className="doc-section-row" data-master-section={line.section || "none"}>
                          <td colSpan={6 + shownColumns.length}>{line.section ? `${line.section} · ${moduleName(line.section)} (${line.count})` : `— (${line.count})`}</td>
                        </tr>
                      );
                    }
                    const r = line.row;
                    const fillers = access!.responsible(r.id);
                    const isTicked = ticked.has(r.id);
                    return (
                      <tr key={r.id} data-master-document={r.id} className={isTicked ? "is-selected" : undefined}>
                        <td className="ml-tick">
                          <input
                            type="checkbox"
                            data-field="tick"
                            aria-label={calledBy(r)}
                            checked={isTicked}
                            onChange={(e) =>
                              setTicked((now) => {
                                const next = new Set(now);
                                if (e.target.checked) next.add(r.id);
                                else next.delete(r.id);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="ml-sr" data-field="sr">
                          {r.srNo ?? <span className="text-faint" title={w("ml.notOnList")}>—</span>}
                        </td>
                        <td className="ml-format" translate="no" data-field="format">
                          {r.formatNo || "—"}
                        </td>
                        <td className="ml-name" translate="no">
                          {r.name}
                        </td>
                        <td className="ml-frequency text-xs">
                          {r.frequency}
                          {r.recording && <span className="text-muted block">{r.recording}</span>}
                        </td>
                        <td className="ml-fill">
                          {r.reference ? (
                            <span className="text-muted text-xs">{w("ml.reference")}</span>
                          ) : (
                            <button type="button" className={`ml-fill-button${fillers.length === 0 ? " is-nobody" : ""}`} data-fill data-doc={r.id} translate="no" data-count={fillers.length}>
                              {fillers.length === 0 ? w("ml.nobody") : fillers.map((e, i) => (i === 0 && fillers.length > 1 ? `${nameOf(e)} (${w("ml.fill.main")})` : nameOf(e))).join(", ")}
                            </button>
                          )}
                        </td>
                        {shownColumns.map((p) => {
                          const cell = cellOf(rules!, access!, p, r);
                          return (
                            <td key={p.id} className="ml-cell">
                              <button
                                type="button"
                                className={`ml-level is-${cell.level}${cell.set ? " is-set" : ""}`}
                                data-cell
                                data-email={lower(p.email)}
                                data-doc={r.id}
                                data-level={cell.level}
                                data-set={cell.set ?? "table"}
                                title={cell.set === "document" ? w("ml.set.document") : cell.set === "module" ? w("ml.set.module", { module: moduleName(r.module) }) : w("ml.set.table")}
                              >
                                {masterLevelName(uiLang, cell.level)}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {menu && rules && access && menu.kind === "level" && (
        <LevelMenu
          refEl={menuRef}
          menu={menu}
          title={w("ml.menu.title", { person: personName(menu.email), doc: rowsById.get(menu.documentId) ? calledBy(rowsById.get(menu.documentId)!) : menu.documentId })}
          current={cellOf(rules, access, columns.find((p) => lower(p.email) === menu.email) ?? { email: menu.email, role: "staff", departments: [] }, rowsById.get(menu.documentId) ?? { id: menu.documentId, module: "" })}
          without={levelWithoutOwn(rules, docs, columns.find((p) => lower(p.email) === menu.email) ?? { email: menu.email, role: "staff", departments: [] }, menu.documentId)}
          word={w}
          levelName={(l) => (l === "read" ? w("ml.menu.read") : masterLevelName(uiLang, l))}
          onPick={(level) => void pickLevel(menu.email, menu.documentId, level)}
        />
      )}
      {menu && rules && access && menu.kind === "fill" && (
        <FillMenu
          key={menu.documentId}
          refEl={menuRef}
          menu={menu}
          title={w("ml.fill.title", { doc: rowsById.get(menu.documentId) ? calledBy(rowsById.get(menu.documentId)!) : menu.documentId })}
          current={access.responsible(menu.documentId)}
          table={rowsById.get(menu.documentId) ? defaultResponsible(rowsById.get(menu.documentId)!.doc) : []}
          people={columns.map((p) => ({ email: lower(p.email), name: p.name }))}
          nameOf={nameOf}
          word={w}
          busy={busy}
          onSave={(emails) => void saveFillers(menu.documentId, emails)}
          onClose={() => setMenu(null)}
        />
      )}

      {ask && (
        <Modal
          title={askWords(ask).title}
          onClose={() => setAsk(null)}
          width={560}
          footer={
            <div className="flex gap-2 justify-end" style={{ width: "100%" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAsk(null)}>
                {w("users.cancel")}
              </button>
              <button className="btn btn-primary btn-sm" data-action="confirm-bulk" disabled={busy} onClick={() => void doBulk()}>
                <FiCheck size={12} /> {busy ? "…" : w("ml.ask.confirm")}
              </button>
            </div>
          }
        >
          <p className="text-sm" data-section="confirm-bulk" translate="no">
            {askWords(ask).body}
          </p>
        </Modal>
      )}
    </div>
  );
}

/** The small menu of one cell: the four levels, and back to what the module or the table gives when one is set here. */
function LevelMenu({
  refEl,
  menu,
  title,
  current,
  without,
  word,
  levelName,
  onPick,
}: {
  refEl: React.MutableRefObject<HTMLDivElement | null>;
  menu: { x: number; y: number };
  title: string;
  current: { level: AccessLevel; set: "document" | "module" | null };
  without: AccessLevel;
  word: (key: AccountKey, vars?: Record<string, string | number>) => string;
  levelName: (l: AccessLevel) => string;
  onPick: (level: AccessLevel | null) => void;
}) {
  return (
    <div ref={refEl} className="designer-menu ml-menu" role="menu" aria-label={title} data-section="master-level-menu" style={{ left: menu.x, top: menu.y }}>
      <div className="text-xs text-muted ml-menu-title" translate="no">
        {title}
      </div>
      {(["read", "write", "edit", "none"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="menuitemradio"
          aria-checked={current.level === l && current.set === "document"}
          className={`designer-menu-item${current.level === l ? " is-current" : ""}`}
          data-action="set-level"
          data-level={l}
          onClick={() => onPick(l)}
        >
          {current.level === l ? <FiCheck size={12} /> : <span className="ml-menu-gap" />} {levelName(l)}
        </button>
      ))}
      {current.set === "document" && (
        <>
          <div className="designer-menu-rule" />
          <button type="button" role="menuitem" className="designer-menu-item" data-action="set-level" data-level="default" onClick={() => onPick(null)}>
            <span className="ml-menu-gap" /> {word("ml.menu.default", { level: levelName(without) })}
          </button>
        </>
      )}
    </div>
  );
}

/** Who fills one document: the plant's people ticked in order (the first is the main person), saved in one go. */
function FillMenu({
  refEl,
  menu,
  title,
  current,
  table,
  people,
  nameOf,
  word,
  busy,
  onSave,
  onClose,
}: {
  refEl: React.MutableRefObject<HTMLDivElement | null>;
  menu: { x: number; y: number };
  title: string;
  current: string[];
  table: string[];
  people: { email: string; name: string }[];
  nameOf: (email: string) => string;
  word: (key: AccountKey, vars?: Record<string, string | number>) => string;
  busy: boolean;
  onSave: (emails: string[]) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(current);
  // Whoever is named now, then the plant's people by name: nobody named is dropped by being left out of the list.
  const offered = useMemo(() => {
    const out = current.map((email) => ({ email, name: nameOf(email) }));
    for (const p of people) if (!out.some((o) => o.email === p.email)) out.push(p);
    return out;
  }, [current, people, nameOf]);
  const toggle = (email: string, on: boolean) => setChosen((now) => (on ? (now.includes(email) ? now : [...now, email]) : now.filter((e) => e !== email)));
  const makeMain = (email: string) => setChosen((now) => [email, ...now.filter((e) => e !== email)]);
  return (
    <div ref={refEl} className="designer-menu ml-menu ml-fill-menu" role="dialog" aria-label={title} data-section="master-fill-menu" style={{ left: menu.x, top: menu.y }}>
      <div className="text-xs text-muted ml-menu-title" translate="no">
        {title}
      </div>
      <p className="text-xs text-muted ml-menu-note">{word("ml.fill.note")}</p>
      <div className="ml-fill-list">
        {offered.map((p) => {
          const at = chosen.indexOf(p.email);
          return (
            <div key={p.email} className="ml-fill-line" data-fill-person={p.email}>
              <label className="designer-menu-check" translate="no">
                <input type="checkbox" data-field="fills" checked={at >= 0} onChange={(e) => toggle(p.email, e.target.checked)} /> {p.name}
              </label>
              {at === 0 && chosen.length > 1 && <span className="ml-main">{word("ml.fill.main")}</span>}
              {at > 0 && (
                <button type="button" className="access-cell-note" data-action="make-main" onClick={() => makeMain(p.email)}>
                  {word("ml.fill.makeMain")}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {chosen.length === 0 && <p className="text-xs ml-menu-note">{word("ml.fill.nobody")}</p>}
      <div className="designer-menu-rule" />
      <div className="flex gap-2 justify-end ml-menu-actions">
        <button type="button" className="btn btn-ghost btn-sm" data-action="fill-table" disabled={busy} onClick={() => setChosen(table)}>
          {word("ml.fill.back")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          {word("users.cancel")}
        </button>
        <button type="button" className="btn btn-primary btn-sm" data-action="save-fill" disabled={busy} onClick={() => onSave(chosen)}>
          {word("ml.fill.save")}
        </button>
      </div>
    </div>
  );
}
