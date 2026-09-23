import React, { useEffect, useMemo, useState } from "react";
import { FiCheck, FiKey, FiPlus, FiRefreshCw, FiSlash, FiUserPlus } from "react-icons/fi";
import { ApiError, usersApi } from "../api/client";
import { useAuth } from "../store/AuthContext";
import { documentRepository } from "../data/repositories/documentRepository";
import { DEPARTMENTS, departmentOfDocument } from "../data/seed/departments";
import { Modal } from "../components/common/Modal";
import { PasswordInput } from "../components/common/PasswordInput";
import { formatDisplayDate } from "../utils/date";
import type { ManagedUser } from "../types/auth";

// USERS & ACCESS — /users (REQUIREMENTS §66).
//
// The portal is login-only: nobody creates their own account. The
// administrator makes each person's account here, gives it a first password and
// says which departments it may see — "all of Quality Control to Kapila Barad"
// is one tick — and the person signs in, chooses a password of their own and
// gets on with their work.
//
// THE SCREEN IS NEVER THE LOCK. Every one of these is refused by the server for
// anybody who is not the administrator (backend/index.ts requireAdmin), so
// hiding the page is a courtesy, not the rule. Nothing here is ever deleted:
// somebody who has left is switched off, because their name is on the records
// they signed.
//
// A password is typed here and sent to be stored. It is never shown again, never
// read back, and never written to the activity log — what the log says is that a
// password was set, and by whom.

const MIN_PASSWORD = 8;

/** A first password that can be read down a telephone and typed once: no letter that looks like a digit. */
function suggestPassword(): string {
  const words = ["Plant", "Press", "Batch", "Film", "Label", "Shift", "Ink", "Roll", "Pouch", "Reel"];
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const word = words[Math.floor(Math.random() * words.length)];
  const tail = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  return `${word}@${tail}${Math.floor(Math.random() * 90 + 10)}`;
}

const accessWords = (u: Pick<ManagedUser, "role" | "departments">): string => {
  if (u.role === "admin") return "Every module";
  if (u.departments.length === 0) return "Every module";
  return u.departments.map((c) => DEPARTMENTS.find((d) => d.code === c)?.name ?? c).join(", ");
};

/** What is being asked about before it is done. */
type Ask = { kind: "reset"; user: ManagedUser } | { kind: "off"; user: ManagedUser } | { kind: "on"; user: ManagedUser };

export function UsersPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin";
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);

  // The new person, as the form stands.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [everyModule, setEveryModule] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // The password the administrator is about to give somebody, for a reset.
  const [resetTo, setResetTo] = useState("");

  const load = () => {
    usersApi
      .list()
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the accounts."));
  };
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  // How many documents each department owns, so a tick says what it is worth.
  const counts = useMemo(() => {
    const docs = documentRepository.getAllUnscoped();
    const map = new Map<string, number>();
    for (const d of docs) {
      const code = departmentOfDocument(d.id, d.formatNo);
      if (code) map.set(code, (map.get(code) ?? 0) + 1);
    }
    return map;
  }, []);

  if (!isAdmin) {
    return (
      <div className="empty-state" data-state="not-admin">
        <h2 className="text-xl mb-2">Only the administrator can open this</h2>
        <p className="text-muted">Accounts and who may see what are the administrator's to set. Ask them if you need access to another department.</p>
      </div>
    );
  }

  const readyToAdd = name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length >= MIN_PASSWORD && (everyModule || picked.length > 0);

  const closeAdd = () => {
    setAdding(false);
    setName("");
    setEmail("");
    setPassword("");
    setPicked([]);
    setEveryModule(false);
  };

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await usersApi.create({ name: name.trim(), email: email.trim(), password, departments: everyModule ? [] : picked });
      setUsers((list) => [...(list ?? []), res.user]);
      setNote(`${res.user.name} can sign in with ${res.user.email}. Give them the first password you typed — they will be asked to choose their own.`);
      closeAdd();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The account could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const doAsk = async () => {
    if (!ask) return;
    setBusy(true);
    setError(null);
    try {
      if (ask.kind === "reset") {
        await usersApi.resetPassword(ask.user.id, resetTo);
        setNote(`${ask.user.name}'s password is reset. Give them the new one — they will be asked to choose their own at the next sign-in.`);
      } else {
        const on = ask.kind === "on";
        const res = await usersApi.setActive(ask.user.id, on);
        setUsers((list) => (list ?? []).map((u) => (u.id === res.user.id ? res.user : u)));
        setNote(on ? `${ask.user.name} can sign in again.` : `${ask.user.name} can no longer sign in. Nothing of theirs has been deleted.`);
      }
      setAsk(null);
      setResetTo("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That could not be done.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-page="users">
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <div>
          <h1 className="text-2xl mb-1">Users &amp; Access</h1>
          <p className="text-muted">
            Everybody who may sign in, and which departments' documents each of them sees. Accounts are made here — nobody can create their own.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" data-action="add-user" onClick={() => setAdding(true)}>
          <FiUserPlus size={13} /> Add a person
        </button>
      </div>

      {error && <div className="auth-error mb-3">{error}</div>}
      {note && (
        <div className="card mb-4 no-print" role="status" data-section="users-note" style={{ borderColor: "var(--color-success)" }}>
          <div className="card-pad text-sm flex items-center justify-between gap-3">
            <span>{note}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setNote(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {users === null ? (
        <p className="text-muted text-sm">Loading the accounts…</p>
      ) : (
        <div className="doc-table">
          <table className="compact" data-table="users">
            <thead>
              <tr>
                <th>Name</th>
                <th>Signs in with</th>
                <th style={{ width: 80 }}>Role</th>
                <th style={{ width: 200 }}>Sees</th>
                <th style={{ width: 110 }}>Last sign-in</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 250 }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const off = u.active === false;
                return (
                  <tr key={u.id} data-user={u.email} data-active={off ? "no" : "yes"}>
                    <td className="font-semibold notranslate" translate="no">
                      {u.name}
                    </td>
                    <td className="text-sm notranslate" translate="no">
                      {u.email}
                    </td>
                    <td>
                      <span className={`badge ${u.role === "admin" ? "badge-Verified" : "badge-Due"}`}>{u.role === "admin" ? "admin" : "staff"}</span>
                    </td>
                    <td className="text-sm" data-field="access">
                      {accessWords(u)}
                    </td>
                    <td className="text-sm text-muted">{u.lastSignIn ? formatDisplayDate(u.lastSignIn.slice(0, 10)) : "Never"}</td>
                    <td className="text-sm">
                      {off ? (
                        <span className="badge badge-Rejected" data-field="status">
                          Switched off
                        </span>
                      ) : u.mustChangePassword ? (
                        <span className="badge badge-Scheduled" data-field="status" title="They will choose their own password at their next sign-in">
                          First password
                        </span>
                      ) : (
                        <span className="badge badge-Verified" data-field="status">
                          Active
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="flex gap-2 justify-end wrap">
                        <button
                          className="btn btn-secondary btn-sm"
                          data-action="reset-password"
                          onClick={() => {
                            setResetTo(suggestPassword());
                            setAsk({ kind: "reset", user: u });
                          }}
                        >
                          <FiKey size={12} /> Reset password
                        </button>
                        {u.id !== me?.id && (
                          <button
                            className={off ? "btn btn-secondary btn-sm" : "btn btn-danger btn-sm"}
                            data-action={off ? "switch-on" : "switch-off"}
                            onClick={() => setAsk({ kind: off ? "on" : "off", user: u })}
                          >
                            {off ? (
                              <>
                                <FiRefreshCw size={12} /> Switch on
                              </>
                            ) : (
                              <>
                                <FiSlash size={12} /> Switch off
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted mt-3">
        Which departments an account sees is changed in <strong>Master Data → Departments &amp; access</strong>. A change takes effect the next time that person
        loads the app. Switching an account off deletes nothing: their name stays on every record they signed.
      </p>

      {adding && (
        <Modal
          title="Add a person"
          onClose={closeAdd}
          width={560}
          footer={
            <div className="flex gap-2 justify-end" style={{ width: "100%" }}>
              <button className="btn btn-ghost btn-sm" onClick={closeAdd}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" data-action="save-user" disabled={!readyToAdd || busy} onClick={() => void add()}>
                <FiPlus size={12} /> {busy ? "Adding…" : "Add the account"}
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-3" data-section="add-user">
            <div className="field">
              <label htmlFor="new-user-name">Full name</label>
              <input id="new-user-name" className="input" data-field="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kapila Barad" />
            </div>
            <div className="field">
              <label htmlFor="new-user-email">Signs in with</label>
              <input
                id="new-user-email"
                className="input"
                data-field="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kapila.barad@gpp.local"
                autoComplete="off"
              />
              <p className="text-xs text-muted mt-1">A sign-in name, not a mailbox — the system never sends mail to it.</p>
            </div>
            <div className="field">
              <label htmlFor="new-user-password">First password</label>
              <div className="flex gap-2">
                <PasswordInput id="new-user-password" name="new-user-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <button className="btn btn-secondary btn-sm" type="button" data-action="suggest-password" onClick={() => setPassword(suggestPassword())}>
                  Suggest one
                </button>
              </div>
              <p className="text-xs text-muted mt-1">
                At least {MIN_PASSWORD} characters. Tell it to them once: they are asked to choose their own the first time they sign in, and it is never shown
                again.
              </p>
            </div>
            <div className="field">
              <label>What they see</label>
              <label className="flex items-center gap-2 text-sm mb-2">
                <input type="checkbox" data-field="every-module" checked={everyModule} onChange={(e) => setEveryModule(e.target.checked)} /> Every module — for
                management, the MR and QA
              </label>
              {!everyModule && (
                <div className="flex flex-col gap-1" data-section="department-ticks">
                  {DEPARTMENTS.map((d) => {
                    const owned = counts.get(d.code) ?? 0;
                    return (
                      <label key={d.code} className="flex items-center gap-2 text-sm" data-department={d.code}>
                        <input
                          type="checkbox"
                          data-field="department"
                          value={d.code}
                          checked={picked.includes(d.code)}
                          onChange={(e) => setPicked((list) => (e.target.checked ? [...list, d.code] : list.filter((c) => c !== d.code)))}
                        />
                        <span>
                          {d.code} — {d.name}
                        </span>
                        <span className={owned ? "text-xs text-muted" : "text-xs text-faint"}>
                          {owned === 0 ? "nothing digitised yet" : `${owned} document${owned === 1 ? "" : "s"}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {ask && (
        <Modal
          title={ask.kind === "reset" ? "Reset this password?" : ask.kind === "off" ? "Switch this account off?" : "Switch this account on?"}
          onClose={() => {
            setAsk(null);
            setResetTo("");
          }}
          width={480}
          footer={
            <div className="flex gap-2 justify-end" style={{ width: "100%" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setAsk(null);
                  setResetTo("");
                }}
              >
                No, leave it
              </button>
              <button
                className={ask.kind === "off" ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"}
                data-action="confirm-ask"
                disabled={busy || (ask.kind === "reset" && resetTo.length < MIN_PASSWORD)}
                onClick={() => void doAsk()}
              >
                {ask.kind === "reset" ? (
                  <>
                    <FiKey size={12} /> Reset it
                  </>
                ) : ask.kind === "off" ? (
                  <>
                    <FiSlash size={12} /> Switch it off
                  </>
                ) : (
                  <>
                    <FiCheck size={12} /> Switch it on
                  </>
                )}
              </button>
            </div>
          }
        >
          <div data-section="confirm-user-action">
            {ask.kind === "reset" && (
              <>
                <p className="text-sm mb-3">
                  <strong className="notranslate" translate="no">
                    {ask.user.name}
                  </strong>{" "}
                  will sign in with the password you type here, and will be asked to choose their own straight away. Their old password stops working at once.
                </p>
                <div className="field">
                  <label htmlFor="reset-password">The new password</label>
                  <div className="flex gap-2">
                    <PasswordInput id="reset-password" name="reset-password" value={resetTo} onChange={(e) => setResetTo(e.target.value)} autoComplete="new-password" />
                    <button className="btn btn-secondary btn-sm" type="button" data-action="suggest-password" onClick={() => setResetTo(suggestPassword())}>
                      Suggest one
                    </button>
                  </div>
                </div>
              </>
            )}
            {ask.kind === "off" && (
              <p className="text-sm">
                <strong className="notranslate" translate="no">
                  {ask.user.name}
                </strong>{" "}
                will not be able to sign in, and whatever they have open stops working at its next action. <strong>Nothing is deleted</strong> — their name
                stays on every record they signed, and you can switch the account on again.
              </p>
            )}
            {ask.kind === "on" && (
              <p className="text-sm">
                <strong className="notranslate" translate="no">
                  {ask.user.name}
                </strong>{" "}
                will be able to sign in again, with the password they had.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
