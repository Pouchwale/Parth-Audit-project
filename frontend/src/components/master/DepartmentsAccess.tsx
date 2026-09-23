import React, { useEffect, useState } from "react";
import { FiLock, FiSave } from "react-icons/fi";
import { ApiError, usersApi } from "../../api/client";
import { useAuth } from "../../store/AuthContext";
import { documentRepository } from "../../data/repositories/documentRepository";
import { DEPARTMENTS } from "../../data/seed/departments";
import { departmentOfDocument } from "../../data/seed/departments";
import { departmentScopeLabel } from "../../engine/departmentScope";
import type { ManagedUser } from "../../types/auth";

// MASTER DATA -> DEPARTMENTS & ACCESS (REQUIREMENTS §40).
//
// Two things on one screen: the plant's departments exactly as its own
// "MASTER LIST OF FORMATS & RECORDS" (F/SYS/02) groups them, with the
// documents each one owns; and — for the administrator only — who may see
// which. An assignment is made by the administrator, not by the person
// themselves: a restriction somebody can lift for themselves is a preference,
// not a rule.

export function DepartmentsAccess() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  // What the administrator has picked but not yet saved, per user id.
  const [draft, setDraft] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    usersApi
      .list()
      .then((res) => {
        if (!cancelled) setUsers(res.users);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load the accounts.");
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // The documents each department owns, from the whole catalogue — this is the
  // plant's list, so it is shown unscoped even to a scoped viewer.
  const docs = documentRepository.getAllUnscoped();
  const documentsOf = (code: string) => docs.filter((d) => departmentOfDocument(d.id, d.formatNo) === code);
  const unassigned = docs.filter((d) => departmentOfDocument(d.id, d.formatNo) === null);

  const save = async (u: ManagedUser) => {
    const codes = draft[u.id] ?? u.departments;
    setSaving(u.id);
    setError(null);
    setSaved(null);
    try {
      const res = await usersApi.setDepartments(u.id, codes);
      setUsers((list) => (list ?? []).map((x) => (x.id === u.id ? { ...x, departments: res.user.departments } : x)));
      setDraft((d) => {
        const { [u.id]: _dropped, ...rest } = d;
        void _dropped;
        return rest;
      });
      setSaved(u.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that assignment.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div data-section="departments-access">
      <p className="text-muted text-sm mb-3">
        The plant's departments as its own <strong>Master List of Formats &amp; Records (F/SYS/02)</strong> groups them — the department is
        the middle segment of every format number it owns, so F-QC-30 is Quality Control's and F-HR-17 is HR's. A person sees the
        documents of the department they are in, and nothing else; your own account covers {departmentScopeLabel()}.
      </p>

      <div className="doc-table mb-5">
        <table className="compact" data-table="departments">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Code</th>
              <th>Department</th>
              <th style={{ width: 90 }}>Formats</th>
              <th style={{ width: 70 }}>Documents</th>
              <th>In this system</th>
            </tr>
          </thead>
          <tbody>
            {DEPARTMENTS.map((d) => {
              const owned = documentsOf(d.code);
              return (
                <tr key={d.code} data-department={d.code}>
                  <td className="font-semibold">{d.code}</td>
                  <td>{d.name}</td>
                  <td className="text-sm text-muted">{d.formatPrefix}-…</td>
                  <td className={owned.length ? "font-semibold" : "text-faint"} data-field="documents">{owned.length}</td>
                  <td className="text-sm">
                    {owned.length === 0 ? (
                      <span className="text-faint">Nothing digitised for this department yet</span>
                    ) : (
                      owned.map((o) => o.formatNo.startsWith("TO BE") ? o.name : `${o.formatNo} ${o.name}`).join(" · ")
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {unassigned.length > 0 && (
        <p className="text-xs text-muted mb-5">
          {unassigned.length} document{unassigned.length === 1 ? "" : "s"} belong to no department yet and are therefore shown to
          everyone: {unassigned.map((d) => d.name).join(", ")}.
        </p>
      )}

      <h3 className="text-lg mb-1">
        <FiLock size={14} style={{ verticalAlign: -2 }} /> Who sees which department
      </h3>
      {!isAdmin && (
        <p className="text-muted text-sm" data-state="not-admin">
          Only the system administrator (the first account created) can see the list of accounts and change an assignment. Your own
          account covers {departmentScopeLabel()} — ask them if you need another department.
        </p>
      )}
      {isAdmin && (
        <>
          <p className="text-muted text-sm mb-3">
            Leave an account with no department selected and it sees every department — which is what management, the MR and QA need.
            The administrator account always covers every department. Ctrl-click (or ⌘-click) to pick more than one.
          </p>
          {error && <div className="auth-error mb-3">{error}</div>}
          {users === null && <p className="text-muted text-sm">Loading accounts…</p>}
          {users !== null && (
            <div className="doc-table">
              <table className="compact" data-table="user-access">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th style={{ width: 80 }}>Role</th>
                    <th style={{ width: 220 }}>Departments</th>
                    <th style={{ width: 110 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const picked = draft[u.id] ?? u.departments;
                    const dirty = draft[u.id] !== undefined && draft[u.id].join(",") !== u.departments.join(",");
                    return (
                      <tr key={u.id} data-user={u.email}>
                        <td className="font-semibold">{u.name}</td>
                        <td className="text-sm">{u.email}</td>
                        <td>
                          <span className={`badge ${u.role === "admin" ? "badge-Verified" : "badge-Due"}`}>{u.role}</span>
                        </td>
                        <td>
                          {u.role === "admin" ? (
                            <span className="text-sm text-muted">Every department</span>
                          ) : (
                            <select
                              multiple
                              size={4}
                              className="input input-sm"
                              style={{ width: "100%", height: "auto" }}
                              data-field="departments"
                              value={picked}
                              onChange={(e) => {
                                const codes = Array.from(e.target.selectedOptions, (o) => o.value);
                                setDraft((d) => ({ ...d, [u.id]: codes }));
                                setSaved(null);
                              }}
                            >
                              {DEPARTMENTS.map((d) => (
                                <option key={d.code} value={d.code}>
                                  {d.code} — {d.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {u.role !== "admin" && (
                            <button
                              className="btn btn-primary btn-sm"
                              data-action="save-departments"
                              disabled={!dirty || saving === u.id}
                              onClick={() => void save(u)}
                            >
                              <FiSave size={12} /> {saving === u.id ? "Saving…" : "Save"}
                            </button>
                          )}
                          {saved === u.id && <div className="text-xs text-success mt-1">Saved</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted mt-2">
            A change takes effect the next time that person loads the app. Their own records are not touched — only what they are shown.
          </p>
        </>
      )}
    </div>
  );
}
