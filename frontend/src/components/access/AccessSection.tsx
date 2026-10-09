import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiCheck, FiRefreshCw, FiUserPlus, FiUsers } from "react-icons/fi";
import { accessApi, ApiError, type AccessRulesAnswer } from "../../api/client";
import { documentRepository } from "../../data/repositories/documentRepository";
import { DEPARTMENTS } from "../../data/seed/departments";
import { accessDocOf, setAccessRules } from "../../engine/departmentScope";
import { ACCESS_LEVELS, ACCESS_MODULES, LEVEL_WORDS, buildAccess, normalizeAccessRules, type Access, type AccessDoc, type AccessLevel, type AccessRules } from "../../engine/accessRules";
import {
  LEVEL_LEGEND,
  STALE_RULES_WORDS,
  accountOf,
  applyAccessChange,
  changeQuestion,
  changeSaved,
  documentDefaults,
  keepsWhatItHad,
  missingPeople,
  moduleDefaults,
  undescribedAccounts,
  type AccessChange,
} from "../../engine/accessEditing";
import { useAppStore } from "../../store/AppStore";
import { Modal } from "../common/Modal";
import { PasswordInput } from "../common/PasswordInput";
import type { ManagedUser } from "../../types/auth";

// WHO MAY DO WHAT, SET BY THE SUPER ADMIN (REQUIREMENTS §96), on Users & Access.
//
// The owner, 8-Oct-2026: "in our dashboard in the audit software I can give access from there only, and only the
// superadmin can do this: make an option for which user can access what, and give read, write and edit access
// accordingly." Three parts, all reading one copy of the stored rules (GET /api/access/rules):
//   * THE GRID: the people by the ten modules, each cell the person's level in that module (No access, Read, Write,
//     Edit, or the owner's table's own answer), with the words of each level beside the grid. A cell opens the
//     documents of that module for that person: a level per document and "answers for it".
//   * WHO FILLS WHAT: every document, who answers for it; a document opens the people for it.
//   * THE ACCOUNTS NOBODY HAS DESCRIBED, flagged, and the owner's people who have no account yet, with one button to
//     create them on one first password.
// Every change is asked in plain words first ("Give Ankur Raval Edit in Quality Control? They will be able to ..."),
// saved with the version the page read (a change made meanwhile by somebody else is never overwritten: the page says
// to reload), and the server writes it in the activity log and tells the person (backend/, REQUIREMENTS §96).
// The pure part is engine/accessEditing.ts.

const moduleName = (code: string): string => DEPARTMENTS.find((d) => d.code === code)?.name ?? code;

/** The stored rules and their version, as this page last read them; `reload` reads them again. */
export function useAccessRules(enabled: boolean): {
  loaded: AccessRulesAnswer | null;
  error: string | null;
  reload: () => void;
  saved: (rules: AccessRules, version: number) => void;
} {
  const [loaded, setLoaded] = useState<AccessRulesAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    accessApi
      .rules()
      .then((res) => {
        const rules = normalizeAccessRules(res?.rules);
        setLoaded({ ...res, rules, version: typeof res?.version === "number" ? res.version : 0 });
        setAccessRules(rules);
      })
      .catch((err) => {
        // A server from before the levels: the owner's table, version 0, so the first save says whether it can be kept.
        if (err instanceof ApiError && err.status === 404) setLoaded({ rules: normalizeAccessRules(null), version: 0 });
        else setError(err instanceof ApiError ? err.message : "The access rules could not be read.");
      });
  }, []);
  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);
  const saved = useCallback((rules: AccessRules, version: number) => {
    setLoaded((was) => ({ ...(was ?? {}), rules, version }));
    setAccessRules(rules);
  }, []);
  return { loaded, error, reload, saved };
}

/** The catalogue as the rules read it, once per page. */
export function useAccessDocs(): { all: ReturnType<typeof documentRepository.getAllUnscoped>; docs: AccessDoc[] } {
  return useMemo(() => {
    const all = documentRepository.getAllUnscoped();
    return { all, docs: all.map(accessDocOf) };
  }, []);
}

/** "F/QC/30 Lamination Adhesive Viscosity Record", or the name alone for a number not yet given. */
const calledBy = (d: { formatNo: string; name: string }): string => (d.formatNo && !d.formatNo.toUpperCase().startsWith("TO BE") ? `${d.formatNo} ${d.name}` : d.name);

interface Ask {
  change: AccessChange;
  person: string;
  place: string;
  defaultLevel: AccessLevel;
}

type Drawer = { kind: "person"; userId: string; module: string } | { kind: "document"; documentId: string };

export function AccessSection({
  users,
  rules,
  version,
  onSaved,
  onReload,
  onUsersChanged,
}: {
  users: ManagedUser[];
  rules: AccessRules;
  version: number;
  onSaved: (rules: AccessRules, version: number) => void;
  onReload: () => void;
  onUsersChanged: () => void;
}) {
  const { bump } = useAppStore();
  const { all, docs } = useAccessDocs();
  const access: Access = useMemo(() => buildAccess(docs, rules), [docs, rules]);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [creating, setCreating] = useState(false);
  const [firstPassword, setFirstPassword] = useState("");
  const [showWho, setShowWho] = useState(false);

  const staff = useMemo(() => users.filter((u) => u.role !== "admin"), [users]);
  const bosses = useMemo(() => users.filter((u) => u.role === "admin"), [users]);
  const flagged = useMemo(() => undescribedAccounts(users, rules, docs, access), [users, rules, docs, access]);
  const missing = useMemo(() => missingPeople(users), [users]);
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) map.set(u.email.toLowerCase(), u.name);
    return (email: string) => map.get(email) ?? email.split("@")[0].replace(/[._]/g, " ");
  }, [users]);
  // The grid's default per cell, one build per person (twelve or so), only when the rules or the people change.
  const defaults = useMemo(() => new Map(staff.map((u) => [u.id, moduleDefaults(rules, docs, u)] as const)), [staff, rules, docs]);
  // How many documents of each module each person answers for, for the cell's second line.
  const answering = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of docs) {
      if (!d.department) continue;
      for (const e of access.responsible(d.id)) map.set(`${e}|${d.department}`, (map.get(`${e}|${d.department}`) ?? 0) + 1);
    }
    return map;
  }, [docs, access]);

  const save = async (a: Ask) => {
    setBusy(true);
    setError(null);
    const next = applyAccessChange(rules, a.change, docs);
    try {
      const res = await accessApi.save(next, version);
      onSaved(next, typeof res?.version === "number" ? res.version : version + 1);
      bump();
      setNote(changeSaved(a.change, a.person, a.place, a.defaultLevel));
      setAsk(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setStale(true);
        setAsk(null);
      } else setError(err instanceof ApiError ? err.message : "The change could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const createMissing = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await accessApi.createMissing(firstPassword);
      const made = res?.created ?? [];
      setNote(
        made.length === 0
          ? "Every one of the plant's people already has an account."
          : `Created ${made.length} account${made.length === 1 ? "" : "s"}: ${made.map((m) => `${m.name} (${m.email})`).join(", ")}. Give each the first password you typed; each chooses their own at the first sign-in.`
      );
      setCreating(false);
      setFirstPassword("");
      onUsersChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The accounts could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const askModule = (u: ManagedUser, module: string, value: string) => {
    const level = value === "" ? null : (value as AccessLevel);
    setAsk({ change: { kind: "module", email: u.email, module, level }, person: u.name, place: moduleName(module), defaultLevel: defaults.get(u.id)?.[module] ?? "none" });
  };

  return (
    <div data-section="access-levels" className="mt-6">
      <div className="flex items-center justify-between wrap gap-3 mb-2">
        <div>
          <h2 className="text-xl mb-1">Who may do what</h2>
          <p className="text-muted text-sm">
            Each person's level in each module. A module's documents follow it, unless a document has its own setting. Only the super admin changes this, and
            every change is written in the activity log and told to the person.
          </p>
        </div>
        <div className="flex gap-2 wrap">
          {missing.length > 0 && (
            <button className="btn btn-primary btn-sm" data-action="create-missing" onClick={() => setCreating(true)}>
              <FiUserPlus size={13} /> Create the missing accounts ({missing.length})
            </button>
          )}
          <button className="btn btn-secondary btn-sm" data-action="show-who-fills" aria-pressed={showWho} onClick={() => setShowWho((v) => !v)}>
            <FiUsers size={13} /> {showWho ? "Back to the grid" : "Who fills what"}
          </button>
        </div>
      </div>

      {error && <div className="auth-error mb-3">{error}</div>}
      {stale && (
        <div className="card mb-3" role="alert" data-section="access-stale" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
          <div className="card-pad text-sm flex items-center justify-between gap-3 wrap">
            <span>{STALE_RULES_WORDS}</span>
            <button
              className="btn btn-secondary btn-sm"
              data-action="reload-access"
              onClick={() => {
                setStale(false);
                onReload();
              }}
            >
              <FiRefreshCw size={12} /> Reload
            </button>
          </div>
        </div>
      )}
      {note && (
        <div className="card mb-3 no-print" role="status" data-section="access-note" style={{ borderColor: "var(--color-success)" }}>
          <div className="card-pad text-sm flex items-center justify-between gap-3">
            <span>{note}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setNote(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <p className="text-sm text-muted mb-3" data-section="access-missing" data-count={missing.length}>
          {missing.length} of the plant's people have no account yet: <span translate="no">{missing.map((m) => m.name).join(", ")}</span>.
        </p>
      )}

      {flagged.length > 0 && (
        <div className="card mb-3" data-section="access-undescribed" data-count={flagged.length} style={{ borderColor: "var(--color-warning)" }}>
          <div className="card-pad text-sm">
            <div className="font-semibold mb-1 flex items-center gap-2">
              <FiAlertTriangle size={13} /> Nobody has said what {flagged.length === 1 ? "this account" : `these ${flagged.length} accounts`} may do
            </div>
            <p className="text-muted mb-2">Until you choose, each keeps what it had. Choose a level for each module in the grid below.</p>
            <ul className="mb-0" style={{ paddingLeft: 18 }}>
              {flagged.map((u) => (
                <li key={u.id} data-undescribed={u.email}>
                  <span className="font-semibold" translate="no">
                    {u.name}
                  </span>{" "}
                  <span className="text-muted" translate="no">
                    ({u.email})
                  </span>
                  : {keepsWhatItHad(u, moduleName)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* THE WORDS OF EACH LEVEL, beside the grid (the owner: "give read, write and edit access accordingly"). */}
      <div className="access-legend mb-3" data-section="access-legend">
        {LEVEL_LEGEND.map((l) => (
          <div key={l.level} data-level={l.level}>
            <div className="font-semibold text-sm">{l.name}</div>
            <div className="text-xs text-muted">{l.can.charAt(0).toUpperCase() + l.can.slice(1)}.</div>
          </div>
        ))}
      </div>

      {!showWho ? (
        <div className="doc-table compact access-grid" data-section="access-grid">
          <table data-table="access-grid">
            <thead>
              <tr>
                <th>Person</th>
                {ACCESS_MODULES.map((m) => (
                  <th key={m} title={moduleName(m)}>
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bosses.map((u) => (
                <tr key={u.id} data-access-person={u.email} data-boss="yes">
                  <td className="access-name">
                    <span className="font-semibold" translate="no">
                      {u.name}
                    </span>
                    <span className="text-xs text-muted block">Super admin</span>
                  </td>
                  <td colSpan={ACCESS_MODULES.length} className="text-sm text-muted">
                    Everything, in every module: sees and does all of it, and alone changes this table.
                  </td>
                </tr>
              ))}
              {staff.map((u) => {
                const email = u.email.toLowerCase();
                const stored = rules.people[email]?.modules ?? {};
                const def = defaults.get(u.id) ?? {};
                const off = u.active === false;
                return (
                  <tr key={u.id} data-access-person={u.email} data-active={off ? "no" : "yes"} data-undescribed={flagged.some((f) => f.id === u.id) ? "yes" : "no"}>
                    <td className="access-name">
                      <span className="font-semibold" translate="no">
                        {u.name}
                      </span>
                      {off && <span className="text-xs text-muted block">Switched off</span>}
                    </td>
                    {ACCESS_MODULES.map((m) => {
                      const own = stored[m];
                      const level = own ?? def[m] ?? "none";
                      const answers = answering.get(`${email}|${m}`) ?? 0;
                      return (
                        <td key={m} data-cell={m} data-level={level} data-set={own ? "yes" : "no"}>
                          <select
                            className="input access-select"
                            data-field="module-level"
                            aria-label={`${u.name} in ${moduleName(m)}`}
                            value={own ?? ""}
                            disabled={busy}
                            onChange={(e) => askModule(u, m, e.target.value)}
                          >
                            <LevelOptions tableLevel={def[m] ?? "none"} tableWords="As the owner's table" />
                          </select>
                          <span className="access-cell-meta">{own ? "Set here" : "As the table"}</span>
                          <button
                            type="button"
                            className="access-cell-note"
                            data-action="open-person-module"
                            onClick={() => setDrawer({ kind: "person", userId: u.id, module: m })}
                            title={`Each ${moduleName(m)} document for ${u.name}`}
                          >
                            {answers > 0 ? `answers for ${answers}` : "documents"}
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
      ) : (
        <WhoFillsWhat all={all} access={access} nameOf={nameOf} onOpen={(documentId) => setDrawer({ kind: "document", documentId })} />
      )}

      {drawer && (
        <AccessDrawer
          drawer={drawer}
          users={staff}
          all={all}
          docs={docs}
          rules={rules}
          access={access}
          busy={busy}
          onClose={() => setDrawer(null)}
          onAsk={setAsk}
        />
      )}

      {ask && (
        <Modal
          title={changeQuestion(ask.change, ask.person, ask.place, ask.defaultLevel).title}
          onClose={() => setAsk(null)}
          width={520}
          footer={
            <div className="flex gap-2 justify-end" style={{ width: "100%" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAsk(null)}>
                No, leave it
              </button>
              <button className="btn btn-primary btn-sm" data-action="confirm-access" disabled={busy} onClick={() => void save(ask)}>
                <FiCheck size={12} /> {busy ? "Saving…" : changeQuestion(ask.change, ask.person, ask.place, ask.defaultLevel).confirm}
              </button>
            </div>
          }
        >
          <p className="text-sm" data-section="confirm-access">
            {changeQuestion(ask.change, ask.person, ask.place, ask.defaultLevel).body}
          </p>
        </Modal>
      )}

      {creating && (
        <Modal
          title="Create the missing accounts"
          onClose={() => {
            setCreating(false);
            setFirstPassword("");
          }}
          width={540}
          footer={
            <div className="flex gap-2 justify-end" style={{ width: "100%" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setCreating(false);
                  setFirstPassword("");
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" data-action="confirm-create-missing" disabled={busy || firstPassword.length < 8} onClick={() => void createMissing()}>
                <FiUserPlus size={12} /> {busy ? "Creating…" : `Create ${missing.length} account${missing.length === 1 ? "" : "s"}`}
              </button>
            </div>
          }
        >
          <div data-section="create-missing">
            <p className="text-sm mb-2">
              Each of these people gets an account that signs in with name.surname@gpp.local and the first password you type here. Each is asked to choose their
              own password at the first sign-in. What each may do is the owner's table until you change it.
            </p>
            <ul className="text-sm mb-3" style={{ paddingLeft: 18 }} translate="no">
              {missing.map((m) => (
                <li key={m.email}>
                  {m.name} <span className="text-muted">({m.email})</span>
                </li>
              ))}
            </ul>
            <div className="field">
              <label htmlFor="first-password">One first password for all of them</label>
              <PasswordInput id="first-password" name="first-password" value={firstPassword} onChange={(e) => setFirstPassword(e.target.value)} autoComplete="new-password" />
              <p className="text-xs text-muted mt-1">At least 8 characters. It is never shown again and never written in the activity log.</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * A level's choices: what the table (or the module) gives, then the four levels set for this person. Grouped, so the
 * closed box shows the level's name alone and the open list says which is which.
 */
function LevelOptions({ tableLevel, tableWords }: { tableLevel: AccessLevel; tableWords: string }) {
  return (
    <>
      <optgroup label={tableWords}>
        <option value="">{LEVEL_WORDS[tableLevel].name}</option>
      </optgroup>
      <optgroup label="Set for this person">
        {ACCESS_LEVELS.map((l) => (
          <option key={l} value={l}>
            {LEVEL_WORDS[l].name}
          </option>
        ))}
      </optgroup>
    </>
  );
}

/** Every document and who answers for it, by module; a document opens its people. Drawn only when asked for. */
function WhoFillsWhat({ all, access, nameOf, onOpen }: { all: ReturnType<typeof documentRepository.getAllUnscoped>; access: Access; nameOf: (email: string) => string; onOpen: (documentId: string) => void }) {
  const rows = useMemo(() => {
    const byModule = new Map<string, { id: string; called: string; reference: boolean; who: string[] }[]>();
    for (const d of all) {
      const a = accessDocOf(d);
      const code = a.department ?? "";
      const list = byModule.get(code) ?? [];
      list.push({ id: d.id, called: calledBy(d), reference: !!a.reference, who: access.responsible(d.id).map(nameOf) });
      byModule.set(code, list);
    }
    return [...ACCESS_MODULES, ""].filter((m) => byModule.has(m)).map((m) => ({ module: m, docs: byModule.get(m)!.sort((x, y) => x.called.localeCompare(y.called)) }));
  }, [all, access, nameOf]);
  return (
    <div className="doc-table compact" data-section="who-fills-what">
      <table data-table="who-fills-what">
        <thead>
          <tr>
            <th>Document</th>
            <th>Answers for it</th>
            <th style={{ width: 90 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <React.Fragment key={g.module || "none"}>
              <tr className="doc-section-row">
                <td colSpan={3}>{g.module ? `${g.module} · ${moduleName(g.module)}` : "No module"}</td>
              </tr>
              {g.docs.map((d) => (
                <tr key={d.id} data-who-document={d.id}>
                  <td translate="no">{d.called}</td>
                  <td className="text-sm" data-field="answers" translate="no">
                    {d.reference ? <span className="text-muted">Kept as issued: nobody fills it</span> : d.who.length ? d.who.join(", ") : <span className="text-muted">Nobody named: the super admin</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost btn-sm" data-action="open-document-access" onClick={() => onOpen(d.id)}>
                      Change
                    </button>
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One person's documents of one module, or one document's people: a level per line and "answers for it". */
function AccessDrawer({
  drawer,
  users,
  all,
  docs,
  rules,
  access,
  busy,
  onClose,
  onAsk,
}: {
  drawer: Drawer;
  users: ManagedUser[];
  all: ReturnType<typeof documentRepository.getAllUnscoped>;
  docs: AccessDoc[];
  rules: AccessRules;
  access: Access;
  busy: boolean;
  onClose: () => void;
  onAsk: (a: Ask) => void;
}) {
  const person = drawer.kind === "person" ? users.find((u) => u.id === drawer.userId) : undefined;
  const lines = useMemo(() => {
    if (drawer.kind === "person") {
      if (!person) return [];
      const without = documentDefaults(rules, docs, person);
      const account = accountOf(person);
      return all
        .filter((d) => accessDocOf(d).department === drawer.module)
        .map((d) => ({
          key: d.id,
          label: calledBy(d),
          user: person,
          documentId: d.id,
          own: rules.people[person.email.toLowerCase()]?.documents?.[d.id],
          level: access.level(account, d.id),
          asModule: without.level(account, d.id),
          answers: access.responsible(d.id).includes(person.email.toLowerCase()),
          reference: !!accessDocOf(d).reference,
        }));
    }
    const d = all.find((x) => x.id === drawer.documentId);
    if (!d) return [];
    return users.map((u) => {
      const account = accountOf(u);
      return {
        key: u.id,
        label: u.name,
        user: u,
        documentId: d.id,
        own: rules.people[u.email.toLowerCase()]?.documents?.[d.id],
        level: access.level(account, d.id),
        asModule: documentDefaults(rules, docs, u).level(account, d.id),
        answers: access.responsible(d.id).includes(u.email.toLowerCase()),
        reference: !!accessDocOf(d).reference,
      };
    });
  }, [drawer, person, all, docs, rules, access, users]);

  const doc = drawer.kind === "document" ? all.find((x) => x.id === drawer.documentId) : undefined;
  const title = drawer.kind === "person" ? `${person?.name ?? "This person"} in ${moduleName(drawer.module)}` : doc ? calledBy(doc) : "This document";

  return (
    <div className="modal-overlay access-drawer-overlay" onClick={onClose}>
      <aside className="modal-box access-drawer" role="dialog" aria-label={title} data-section="access-drawer" data-drawer={drawer.kind} onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="text-lg" translate="no">
            {title}
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close" data-action="close-drawer">
            Close
          </button>
        </div>
        <div className="card-pad">
          <p className="text-xs text-muted mb-3">
            {drawer.kind === "person"
              ? "A document follows the module unless it has its own level here. Whoever answers for a document is told when it falls due, and it counts in their score."
              : "Each person's level on this document, and who answers for it."}
          </p>
          {lines.length === 0 ? (
            <p className="text-sm text-muted">Nothing to show.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {lines.map((l) => {
                const place = drawer.kind === "person" ? l.label : doc ? calledBy(doc) : l.label;
                return (
                  <div key={l.key} className="access-line" data-access-line={l.documentId} data-person={l.user.email} data-level={l.level}>
                    <div className="access-line-name" translate="no">
                      {l.label}
                    </div>
                    <select
                      className="input access-select"
                      data-field="document-level"
                      aria-label={`${l.user.name} on ${place}`}
                      value={l.own ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        onAsk({
                          change: { kind: "document", email: l.user.email, documentId: l.documentId, level: e.target.value === "" ? null : (e.target.value as AccessLevel) },
                          person: l.user.name,
                          place,
                          defaultLevel: l.asModule,
                        })
                      }
                    >
                      <LevelOptions tableLevel={l.asModule} tableWords={drawer.kind === "person" ? "As the module" : "As the person's module"} />
                    </select>
                    {!l.reference && (
                      <label className="flex items-center gap-1 text-xs access-answers">
                        <input
                          type="checkbox"
                          data-field="answers-for"
                          checked={l.answers}
                          disabled={busy}
                          onChange={(e) =>
                            onAsk({ change: { kind: "answers", email: l.user.email, documentId: l.documentId, answers: e.target.checked }, person: l.user.name, place, defaultLevel: l.asModule })
                          }
                        />
                        Answers for it
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
