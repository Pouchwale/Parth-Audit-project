import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiClock, FiDownload, FiRefreshCw, FiShield, FiUsers } from "react-icons/fi";
import { ApiError } from "../api/client";
import {
  accessApi,
  historyQueryString,
  type AccessHistory,
  type AccessHistoryQuery,
  type AccessHistoryRow,
  type AccessHistoryWhich,
  type AccessNow,
  type AccessOverview,
  type AccessPerson,
  type AccessSessionEnd,
} from "../api/accessApi";
import { hoursWordsIn, superAdminHoursLine, type PublicHours } from "../engine/workingHoursCore";
import { hoursWord } from "../i18n/strings.hours";
import { useAppStore } from "../store/AppStore";
import { useAuth } from "../store/AuthContext";
import { Link } from "../store/router";
import { documentRepository } from "../data/repositories/documentRepository";
import { DEPARTMENTS, departmentOfDocument } from "../data/seed/departments";
import { Modal } from "../components/common/Modal";
import { downloadBlob } from "../utils/csv";
import { formatDisplayDate } from "../utils/date";
import { useProgressiveCount } from "../utils/useProgressive";
import type { DocumentDefinition } from "../types";

// USER ACCESS — /access, the super admin's own (REQUIREMENTS §84).
//
// "Make sure the super admin has every kind of detail: which user can see
// what, and when each logs in and logs out. ... The super admin has access to
// every module, and can remove or add any user from any module, from a
// dedicated dashboard for it."
//
// On one page:
//   * the plant's working hours and today's calendar state, at the top;
//   * today: who is signed in now, and each person's first sign-in and last
//     sign-out — and what "now" rests on, in words;
//   * who may use which module: every account against the ten modules of the
//     plant's master list, each a switch the super admin turns on or off (the
//     existing departments route; removing asks first); "Every module" where
//     none is set; and how many documents each person can see, the list on
//     opening them;
//   * the refused and failed sign-ins of today;
//   * each person's sign-ins and sign-outs over any span of days, paired into
//     sessions, the archived lines included, with a CSV file.
//
// THE SCREEN IS NEVER THE LOCK: every route behind it answers 403 to anybody
// but the super admin (backend/accessRoutes.ts, backend/index.ts requireAdmin).
//
// LIGHT ON A LOW-END LAPTOP: the server pairs and counts; the page draws the
// rows it is handed as plain text, a hundred at a time. Which documents a
// module holds is worked out once, when the page opens, from the catalogue the
// browser already has — the same rule the server keeps records to a
// department's accounts by (departmentOfDocument) — and each person's count is
// then a sum of at most ten numbers.

const HISTORY_PAGE = 100;

const NOW_WORDS: Record<AccessNow, string> = {
  "signed-in": "Signed in now",
  quiet: "Signed in, quiet",
  "signed-out": "Signed out",
  "not-today": "Not signed in today",
  "switched-off": "Switched off",
  "day-closed": "Session ended with the working day",
};

const NOW_BADGE: Record<AccessNow, string> = {
  "signed-in": "badge badge-Verified",
  quiet: "badge badge-InProgress",
  "signed-out": "badge badge-Scheduled",
  "not-today": "text-sm text-faint",
  "switched-off": "badge badge-Rejected",
  "day-closed": "badge badge-Scheduled",
};

const ENDED_WORDS: Record<AccessSessionEnd, string> = {
  "signed-out": "Signed out",
  "close-of-hours": "Signed out at the close of working hours",
  "not-signed-out": "No sign-out that day",
  open: "No sign-out yet",
};

const WHICH: { id: AccessHistoryWhich; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "sessions", label: "Sign-ins and sign-outs" },
  { id: "attempts", label: "Refused and failed" },
];

const messageOf = (err: unknown, fallback: string): string => (err instanceof ApiError || err instanceof Error ? err.message || fallback : fallback);

/** The day `days` after (or before) a day, YYYY-MM-DD. */
function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 7 h 40 min, 12 min. */
function duration(minutes: number): string {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Times on the plant's clock, whatever the computer's own zone. Made once per zone. */
function useClock(timeZone: string): (iso: string | null) => string {
  return useMemo(() => {
    let f: Intl.DateTimeFormat;
    try {
      f = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    } catch {
      f = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    }
    return (iso: string | null) => (iso ? f.format(new Date(iso)) : "");
  }, [timeZone]);
}

const moduleName = (code: string): string => DEPARTMENTS.find((d) => d.code === code)?.name ?? code;
const everyModule = (p: Pick<AccessPerson, "role" | "departments">): boolean => p.role === "admin" || p.departments.length === 0;
const modulesInWords = (p: Pick<AccessPerson, "role" | "departments">): string => (everyModule(p) ? "Every module" : p.departments.map(moduleName).join(", "));
const docLabel = (d: DocumentDefinition): string => (!d.formatNo || /^TO BE/i.test(d.formatNo) ? d.name : `${d.formatNo} ${d.name}`);

/** The plant's catalogue by module, worked out once. */
interface Catalogue {
  byModule: Map<string, DocumentDefinition[]>;
  /** Documents no module owns — everybody sees them (engine/departmentScope.ts). */
  unassigned: DocumentDefinition[];
  total: number;
}

function buildCatalogue(): Catalogue {
  const byModule = new Map<string, DocumentDefinition[]>();
  const unassigned: DocumentDefinition[] = [];
  const docs = documentRepository.getAllUnscoped();
  for (const d of docs) {
    const code = departmentOfDocument(d.id, d.formatNo);
    if (!code) unassigned.push(d);
    else {
      const list = byModule.get(code);
      if (list) list.push(d);
      else byModule.set(code, [d]);
    }
  }
  return { byModule, unassigned, total: docs.length };
}

/** How many documents a person can see: every one, or their modules' and the ones no module owns. */
function documentsSeen(p: Pick<AccessPerson, "role" | "departments">, cat: Catalogue): number {
  if (everyModule(p)) return cat.total;
  let n = cat.unassigned.length;
  for (const code of p.departments) n += cat.byModule.get(code)?.length ?? 0;
  return n;
}

/** A change of modules waiting for the super admin's word. */
type Ask =
  | { kind: "remove"; person: AccessPerson; code: string }
  | { kind: "narrow"; person: AccessPerson; keep: string[] };

export function AccessDashboardPage() {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return (
      <div className="empty-state" data-page="access" data-state="not-admin">
        <h2 className="text-xl mb-2">Only the super admin can open this</h2>
        <p className="text-muted">Who may use which module, and when each person signed in and out, are the super admin's to see. Ask them if you need access to another module.</p>
      </div>
    );
  }
  return <AccessDashboard myId={user.id} />;
}

function AccessDashboard({ myId }: { myId: string }) {
  const [overview, setOverview] = useState<AccessOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [opened, setOpened] = useState<AccessPerson | null>(null);
  const reading = useRef(0);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const [historyPerson, setHistoryPerson] = useState<{ id: string; at: number } | null>(null);

  const catalogue = useMemo(buildCatalogue, []);

  const load = useCallback((first = false) => {
    const mine = ++reading.current;
    setLoading(true);
    accessApi
      .overview(first)
      .then((o) => {
        if (mine !== reading.current) return;
        setOverview(o);
        setError(null);
      })
      .catch((err) => {
        if (mine === reading.current) setError(messageOf(err, "Who signed in could not be read."));
      })
      .finally(() => {
        if (mine === reading.current) setLoading(false);
      });
  }, []);

  useEffect(() => load(true), [load]);

  const clock = useClock(overview?.timeZone ?? "Asia/Kolkata");
  const people = overview?.people ?? [];

  // The figures at the top, counted once per reading.
  const figures = useMemo(() => {
    let active = 0;
    let now = 0;
    let today = 0;
    for (const p of people) {
      if (p.active) active += 1;
      if (p.now === "signed-in") now += 1;
      if (p.today.signIns > 0) today += 1;
    }
    return { active, now, today, attempts: overview?.attempts.length ?? 0 };
  }, [people, overview]);

  // Stable, so a switch pressed on one line draws that line again and not the other forty.
  const setModules = useCallback(async (person: AccessPerson, codes: string[], said: string) => {
    setSaving(person.id);
    setError(null);
    try {
      const res = await accessApi.setModules(person.id, codes);
      const departments = Array.isArray(res?.user?.departments) ? res.user.departments : codes;
      setOverview((o) => (o ? { ...o, people: o.people.map((p) => (p.id === person.id ? { ...p, departments } : p)) } : o));
      setNote(`${said} It applies from ${person.name}'s next request to the server; a page they already have open shows the change when they next load the app.`);
      setAsk(null);
    } catch (err) {
      setError(messageOf(err, "That change could not be saved."));
    } finally {
      setSaving(null);
    }
  }, []);

  const toggleModule = useCallback((person: AccessPerson, code: string) => {
    if (person.role === "admin") return;
    const every = person.departments.length === 0;
    const has = every || person.departments.includes(code);
    if (has) {
      setAsk({ kind: "remove", person, code });
      return;
    }
    const next = DEPARTMENTS.map((d) => d.code).filter((c) => c === code || person.departments.includes(c));
    void setModules(person, next, `${person.name} now has ${moduleName(code)} (${next.map(moduleName).join(", ")}).`);
  }, [setModules]);

  const toggleEvery = useCallback((person: AccessPerson) => {
    if (person.role === "admin") return;
    if (person.departments.length === 0) {
      setAsk({ kind: "narrow", person, keep: [] });
      return;
    }
    void setModules(person, [], `${person.name} now has every module.`);
  }, [setModules]);

  const confirmAsk = () => {
    if (!ask) return;
    if (ask.kind === "remove") {
      const from = ask.person.departments.length === 0 ? DEPARTMENTS.map((d) => d.code) : ask.person.departments;
      const next = from.filter((c) => c !== ask.code);
      void setModules(ask.person, next, `${ask.person.name} no longer has ${moduleName(ask.code)}.`);
    } else if (ask.keep.length > 0) {
      const next = DEPARTMENTS.map((d) => d.code).filter((c) => ask.keep.includes(c));
      void setModules(ask.person, next, `${ask.person.name} now has ${next.map(moduleName).join(", ")} only.`);
    }
  };

  const showHistoryOf = (id: string) => {
    setOpened(null);
    setHistoryPerson({ id, at: Date.now() });
    window.setTimeout(() => historyRef.current?.scrollIntoView({ block: "start" }), 50);
  };

  return (
    <div data-page="access" data-state={overview ? "ready" : error ? "failed" : "loading"}>
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <div>
          <h1 className="text-2xl mb-1">User access</h1>
          <p className="text-muted">
            Who may use which module, and when each person signed in and out. Only the super admin sees this page — the server refuses it to everybody else.
          </p>
        </div>
        <div className="flex gap-2 wrap items-center">
          {overview && (
            <span className="text-xs text-muted" data-field="access-as-of">
              As of {clock(overview.now)} (factory time)
            </span>
          )}
          <button className="btn btn-secondary btn-sm" data-action="access-refresh" onClick={() => load()} disabled={loading}>
            <FiRefreshCw size={13} /> Refresh
          </button>
          <Link to="/users" className="btn btn-ghost btn-sm">
            <FiUsers size={13} /> Users &amp; Access
          </Link>
        </div>
      </div>

      {overview && <WorkingHoursStrip hours={overview.hours} />}

      {error && (
        <div className="auth-error mb-3" data-section="access-error">
          {error}
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

      {!overview ? (
        <p className="text-muted text-sm">{loading ? "Reading the accounts and today's sign-ins…" : ""}</p>
      ) : (
        <>
          <div className="flex gap-3 wrap mb-3" data-section="access-figures">
            <Figure field="accounts" value={figures.active} label={`accounts switched on (${people.length} in all)`} />
            <Figure field="signed-in-now" value={figures.now} label="signed in now" />
            <Figure field="signed-in-today" value={figures.today} label="signed in today" />
            <Figure field="attempts-today" value={figures.attempts} label="refused or failed sign-ins today" />
          </div>
          <p className="text-xs text-muted mb-4" data-field="now-rests-on">
            <strong>“Signed in now”</strong> means: signed in today ({formatDisplayDate(overview.today)}), not signed out since, and something in the activity log in their
            name in the last {overview.activeMinutes} minutes — the log is written when a person opens a document or a record, saves, submits, prints or downloads. The
            server keeps no other record of a browser's requests, so somebody reading one page for longer, and somebody who closed the browser without signing out, both
            show as “signed in, quiet”. Times are the factory's clock.
          </p>

          <TodayTable people={people} clock={clock} onOpen={setOpened} />

          <ModulesTable
            people={people}
            catalogue={catalogue}
            saving={saving}
            myId={myId}
            onToggle={toggleModule}
            onEvery={toggleEvery}
            onOpen={setOpened}
          />

          <AttemptsToday overview={overview} clock={clock} />

          <div ref={historyRef}>
            <History overview={overview} clock={clock} person={historyPerson} />
          </div>
        </>
      )}

      {ask && (
        <Modal
          title={ask.kind === "remove" ? `Remove ${ask.person.name} from ${moduleName(ask.code)}?` : `Keep ${ask.person.name} to some modules only?`}
          onClose={() => (saving ? undefined : setAsk(null))}
          dismissible={!saving}
          width={520}
          footer={
            <div className="flex gap-2 justify-end" style={{ width: "100%" }}>
              <button className="btn btn-ghost btn-sm" data-action="cancel-module-change" disabled={!!saving} onClick={() => setAsk(null)}>
                No, leave it
              </button>
              <button
                className="btn btn-danger btn-sm"
                data-action="confirm-module-change"
                disabled={!!saving || (ask.kind === "narrow" && ask.keep.length === 0)}
                onClick={confirmAsk}
              >
                {saving ? "Saving…" : ask.kind === "remove" ? `Remove from ${moduleName(ask.code)}` : "Keep only these"}
              </button>
            </div>
          }
        >
          <div data-section="confirm-module-change">
            {ask.kind === "remove" ? (
              <>
                <p className="text-sm mb-2">
                  <strong className="notranslate" translate="no">
                    {ask.person.name}
                  </strong>{" "}
                  will no longer see {moduleName(ask.code)}'s {catalogue.byModule.get(ask.code)?.length ?? 0} documents or their records
                  {ask.person.departments.length === 0 ? ", and will keep the other nine modules" : ""}.
                </p>
                <p className="text-sm text-muted">
                  The server stops handing them over at their next request. Nothing is deleted: the records stay, with their names on them, and you can switch the
                  module on again at any time. The change is written in the activity log.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm mb-2">
                  <strong className="notranslate" translate="no">
                    {ask.person.name}
                  </strong>{" "}
                  has every module now. Tick the modules they keep; they will no longer see the others' documents or records.
                </p>
                <div className="flex flex-col gap-1">
                  {DEPARTMENTS.map((d) => (
                    <label key={d.code} className="flex items-center gap-2 text-sm" data-department={d.code}>
                      <input
                        type="checkbox"
                        data-field="keep-module"
                        value={d.code}
                        checked={ask.keep.includes(d.code)}
                        onChange={(e) =>
                          setAsk((a) => (a && a.kind === "narrow" ? { ...a, keep: e.target.checked ? [...a.keep, d.code] : a.keep.filter((c) => c !== d.code) } : a))
                        }
                      />
                      {d.code} — {d.name}
                      <span className="text-xs text-muted">{catalogue.byModule.get(d.code)?.length ?? 0} documents</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {opened && <PersonDocuments person={people.find((p) => p.id === opened.id) ?? opened} catalogue={catalogue} onClose={() => setOpened(null)} onHistory={showHistoryOf} />}
    </div>
  );
}

function Figure({ field, value, label }: { field: string; value: number; label: string }) {
  return (
    <div className="stat-tile" data-field={field} data-value={value}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/**
 * THE STAFF'S HOURS AND TODAY'S CALENDAR STATE (REQUIREMENTS §84 C1), as the
 * server's own gate reads them from the master data (backend/workingHours.ts,
 * on the one rule the server and the browser share, engine/workingHoursCore.ts)
 * — the very answer that lets staff in or keeps them out. Nothing is shown
 * when the server could not read them, rather than a guess.
 *
 * Said to the super admin, the one person they never hold (§84 addendum,
 * 6-Oct-2026): the staff's hours and where today stands for them, then his own
 * line — "You are the super admin: these are the staff's hours, and you can
 * keep working at any time." — never that DCRS is closed or opens later. In
 * the app's own Gujarati where it shows, from the same parts.
 */
function WorkingHoursStrip({ hours }: { hours: PublicHours | null }) {
  const { uiLang } = useAppStore();
  if (!hours) return null;
  const words = hoursWordsIn(hours, uiLang);
  return (
    <div className="card mb-3" data-section="access-hours" data-phase={hours.phase} data-enforced={hours.enforced ? "yes" : "no"} data-day-kind={hours.today.kind}>
      <div className="card-pad text-sm flex items-start gap-2">
        <FiClock size={15} style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <strong data-field="hours-text">{words.hoursText}</strong> <span data-field="today-text">{words.todayText}</span>
          <div className="mt-1" data-field="hours-for-you" style={{ fontWeight: 600 }}>
            {superAdminHoursLine(uiLang)}
          </div>
          <div className="text-xs text-muted mt-1" data-field="hours-rule">
            {hours.enforced ? hoursWord(uiLang, "hours.access.held", { zone: hours.timeZone }) : hoursWord(uiLang, "hours.access.notHeld")}
          </div>
        </div>
      </div>
    </div>
  );
}

function TodayTable({ people, clock, onOpen }: { people: AccessPerson[]; clock: (iso: string | null) => string; onOpen: (p: AccessPerson) => void }) {
  // A plant's accounts are drawn a batch at a time, so a slow computer shows the first at once.
  const count = useProgressiveCount(people.length, 20, 30);
  return (
    <div className="card mb-4" data-section="access-today">
      <div className="card-pad" style={{ paddingBottom: 8 }}>
        <h2 className="text-lg">Today</h2>
        <p className="text-xs text-muted">Each person's first sign-in and last sign-out today, and whether they are signed in now.</p>
      </div>
      <div className="doc-table" style={{ overflowX: "auto" }}>
        <table className="compact" data-table="access-today">
          <thead>
            <tr>
              <th>Person</th>
              <th style={{ width: 190 }}>Now</th>
              <th style={{ width: 110 }}>First sign-in</th>
              <th style={{ width: 150 }}>Last sign-out</th>
              <th style={{ width: 80 }}>Sign-ins</th>
              <th style={{ width: 120 }}>Refused / failed</th>
              <th style={{ width: 110 }}>Last in the log</th>
            </tr>
          </thead>
          <tbody>
            {people.slice(0, count).map((p) => (
              <TodayRow key={p.id} p={p} clock={clock} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TodayRow = React.memo(function TodayRow({ p, clock, onOpen }: { p: AccessPerson; clock: (iso: string | null) => string; onOpen: (p: AccessPerson) => void }) {
  return (
    <tr data-user={p.email} data-now={p.now}>
      <td className="notranslate" translate="no">
        <button className="link-button font-semibold" data-action="open-person" onClick={() => onOpen(p)}>
          {p.name}
        </button>
        <div className="text-xs text-muted">{p.email}</div>
      </td>
      <td data-field="now">
        <span className={NOW_BADGE[p.now]}>{p.now === "quiet" && p.quietMinutes !== null ? `Signed in, quiet for ${duration(p.quietMinutes)}` : NOW_WORDS[p.now]}</span>
      </td>
      <td className="text-sm" data-field="first-sign-in" data-at={p.today.firstSignIn ?? ""}>
        {p.today.firstSignIn ? clock(p.today.firstSignIn) : <span className="text-faint">—</span>}
      </td>
      <td className="text-sm" data-field="last-sign-out" data-at={p.today.lastSignOut ?? ""}>
        {p.today.lastSignOut ? (
          <>
            {clock(p.today.lastSignOut)}
            {p.today.lastSignOutAtClose && <div className="text-xs text-muted">at the close of working hours</div>}
          </>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="text-sm" data-field="sign-ins">
        {p.today.signIns}
      </td>
      <td className="text-sm" data-field="attempts">
        {p.today.failed + p.today.refused === 0 ? (
          <span className="text-faint">0</span>
        ) : (
          <span className="text-danger">
            {p.today.failed ? `${p.today.failed} failed` : ""}
            {p.today.failed && p.today.refused ? ", " : ""}
            {p.today.refused ? `${p.today.refused} refused` : ""}
          </span>
        )}
      </td>
      <td className="text-sm text-muted" data-field="last-seen">
        {p.today.lastSeen ? clock(p.today.lastSeen) : "—"}
      </td>
    </tr>
  );
});

function ModulesTable({
  people,
  catalogue,
  saving,
  myId,
  onToggle,
  onEvery,
  onOpen,
}: {
  people: AccessPerson[];
  catalogue: Catalogue;
  saving: string | null;
  myId: string;
  onToggle: (p: AccessPerson, code: string) => void;
  onEvery: (p: AccessPerson) => void;
  onOpen: (p: AccessPerson) => void;
}) {
  const count = useProgressiveCount(people.length, 15, 20);
  return (
    <div className="card mb-4" data-section="access-modules">
      <div className="card-pad" style={{ paddingBottom: 8 }}>
        <h2 className="text-lg">
          <FiShield size={15} style={{ verticalAlign: -2 }} /> Who may use which module
        </h2>
        <p className="text-xs text-muted">
          A switch per module of the plant's Master List of Formats (F/SYS/02), with the number of documents it holds. Switching one on gives the person that module at
          once; switching one off asks first. A person with no module set has every module. {catalogue.unassigned.length} document
          {catalogue.unassigned.length === 1 ? "" : "s"} belong to no module and are seen by everybody. Click a name for the documents that person can see.
        </p>
      </div>
      <div className="doc-table" style={{ overflowX: "auto" }}>
        <table className="compact" data-table="access-modules">
          <thead>
            <tr>
              <th style={{ minWidth: 170 }}>Person</th>
              <th style={{ width: 90 }} title="No module set: they see every module">
                Every module
              </th>
              {DEPARTMENTS.map((d) => (
                <th key={d.code} style={{ width: 58, textAlign: "center" }} title={`${d.name} — ${catalogue.byModule.get(d.code)?.length ?? 0} documents`} data-module={d.code}>
                  {d.code}
                  <div className="text-xs text-faint" style={{ fontWeight: 400 }}>
                    {catalogue.byModule.get(d.code)?.length ?? 0}
                  </div>
                </th>
              ))}
              <th style={{ width: 110 }}>Sees</th>
            </tr>
          </thead>
          <tbody>
            {people.slice(0, count).map((p) => (
              <ModulesRow key={p.id} p={p} catalogue={catalogue} busy={saving === p.id} isMe={p.id === myId} onToggle={onToggle} onEvery={onEvery} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One person's line of switches — drawn again only when that person, or whether their change is being saved, changes. */
const ModulesRow = React.memo(function ModulesRow({
  p,
  catalogue,
  busy,
  isMe,
  onToggle,
  onEvery,
  onOpen,
}: {
  p: AccessPerson;
  catalogue: Catalogue;
  busy: boolean;
  isMe: boolean;
  onToggle: (p: AccessPerson, code: string) => void;
  onEvery: (p: AccessPerson) => void;
  onOpen: (p: AccessPerson) => void;
}) {
  const every = everyModule(p);
  const admin = p.role === "admin";
  const seen = documentsSeen(p, catalogue);
  return (
    <tr data-user={p.email} data-modules={every ? "every" : p.departments.join(",")} data-active={p.active ? "yes" : "no"}>
      <td className="notranslate" translate="no">
        <button className="link-button font-semibold" data-action="open-person" onClick={() => onOpen(p)}>
          {p.name}
        </button>
        <div className="text-xs text-muted">
          {admin ? "super admin" : "staff"}
          {!p.active ? " · switched off" : p.mustChangePassword ? " · first password" : ""}
          {isMe ? " · you" : ""}
        </div>
      </td>
      <td>
        <Switch
          on={every}
          action="toggle-every-module"
          label={`Every module for ${p.name}`}
          disabled={admin || busy}
          title={admin ? "The super admin covers every module" : every ? "Keep them to some modules only…" : "Give them every module"}
          onClick={() => onEvery(p)}
        />
      </td>
      {DEPARTMENTS.map((d) => {
        const on = every || p.departments.includes(d.code);
        // The last module cannot be switched off here: none would mean every module.
        const last = !every && on && p.departments.length === 1;
        return (
          <td key={d.code} style={{ textAlign: "center" }}>
            <Switch
              on={on}
              dim={every}
              module={d.code}
              action="toggle-module"
              label={`${d.name} for ${p.name}`}
              disabled={admin || busy || last}
              title={
                admin
                  ? "The super admin covers every module"
                  : last
                    ? `${p.name}'s only module. None would mean every module — to stop somebody signing in, switch the account off on Users & Access.`
                    : on
                      ? `Remove ${p.name} from ${d.name}…`
                      : `Give ${p.name} ${d.name}`
              }
              onClick={() => onToggle(p, d.code)}
            />
          </td>
        );
      })}
      <td className="text-sm" data-field="documents-seen" data-count={seen}>
        <button className="link-button" data-action="open-person-documents" onClick={() => onOpen(p)}>
          {seen} document{seen === 1 ? "" : "s"}
        </button>
      </td>
    </tr>
  );
});

/** A switch: a button that says it is one (role="switch"), drawn with the Master Data page's own switch. */
function Switch({
  on,
  dim,
  module,
  action,
  label,
  title,
  disabled,
  onClick,
}: {
  on: boolean;
  dim?: boolean;
  module?: string;
  action: string;
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      data-action={action}
      data-module={module}
      className={`voice-switch ${on ? "is-on" : ""}`}
      style={{ padding: 3, border: "none", background: "transparent", opacity: disabled && !dim ? 0.5 : dim ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="voice-switch-track">
        <span className="voice-switch-thumb" />
      </span>
    </button>
  );
}

function AttemptsToday({ overview, clock }: { overview: AccessOverview; clock: (iso: string | null) => string }) {
  const list = overview.attempts;
  return (
    <div className="card mb-4" data-section="access-attempts" data-count={list.length}>
      <div className="card-pad" style={{ paddingBottom: list.length ? 8 : undefined }}>
        <h2 className="text-lg">Refused and failed sign-ins today</h2>
        <p className="text-xs text-muted">
          {list.length === 0
            ? "None today."
            : "A failed sign-in is a wrong password, or an address with no account; a refused one had the right password but was turned away, and says why. The newest hundred."}
        </p>
      </div>
      {list.length > 0 && (
        <div className="doc-table" style={{ overflowX: "auto" }}>
          <table className="compact" data-table="access-attempts">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Time</th>
                <th>Address typed</th>
                <th>Account</th>
                <th style={{ width: 130 }}>What</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} data-attempt={a.action} data-address={a.address}>
                  <td className="text-sm">{clock(a.at)}</td>
                  <td className="text-sm notranslate" translate="no">
                    {a.address}
                  </td>
                  <td className="text-sm notranslate" translate="no">
                    {a.userName || <span className="text-faint">No such account</span>}
                  </td>
                  <td className="text-sm font-semibold">{a.action}</td>
                  <td className="text-sm text-muted">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Each person's sign-ins and sign-outs over a span, paired on the server, a hundred at a time. */
function History({ overview, clock, person }: { overview: AccessOverview; clock: (iso: string | null) => string; person: { id: string; at: number } | null }) {
  const [from, setFrom] = useState(() => addDays(overview.today, -6));
  const [to, setTo] = useState(overview.today);
  const [who, setWho] = useState("");
  const [which, setWhich] = useState<AccessHistoryWhich>("all");
  const [page, setPage] = useState<AccessHistory | null>(null);
  const [rows, setRows] = useState<AccessHistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loads, setLoads] = useState(0);
  // The query of the rows on the screen, as words for a check to wait on (data-shown).
  const [shownWords, setShownWords] = useState("");
  const reading = useRef(0);
  // The query the rows on the screen were read with: "Show more" and the CSV go on with it.
  const shown = useRef<AccessHistoryQuery | null>(null);

  // A person opened elsewhere on the page: their history.
  useEffect(() => {
    if (person) setWho(person.id);
  }, [person]);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const query: AccessHistoryQuery = useMemo(() => ({ from, to, person: who || undefined, kind: which }), [from, to, who, which]);

  useEffect(() => {
    if (!valid) return;
    const mine = ++reading.current;
    setBusy(true);
    setError(null);
    accessApi
      .history(query, 0, HISTORY_PAGE)
      .then((res) => {
        if (mine !== reading.current) return;
        shown.current = query;
        setShownWords(historyQueryString(query));
        setPage(res);
        setRows(res.rows);
        setLoads((n) => n + 1);
      })
      .catch((err) => {
        if (mine === reading.current) setError(messageOf(err, "The sign-ins could not be read."));
      })
      .finally(() => {
        if (mine === reading.current) setBusy(false);
      });
  }, [query, valid, overview.now]);

  const more = () => {
    const q = shown.current;
    if (!q) return;
    const mine = reading.current;
    setBusy(true);
    accessApi
      .history(q, rows.length, HISTORY_PAGE)
      .then((res) => {
        if (mine !== reading.current) return;
        setPage(res);
        setRows((list) => [...list, ...res.rows]);
        setLoads((n) => n + 1);
      })
      .catch((err) => {
        if (mine === reading.current) setError(messageOf(err, "The sign-ins could not be read."));
      })
      .finally(() => {
        if (mine === reading.current) setBusy(false);
      });
  };

  const csv = async () => {
    const q = shown.current;
    if (!q) return;
    setError(null);
    try {
      const { blob, filename } = await accessApi.historyCsv(q);
      downloadBlob(filename, blob);
    } catch (err) {
      setError(messageOf(err, "The CSV file could not be made."));
    }
  };

  const personName = (id: string) => overview.people.find((p) => p.id === id)?.name ?? "This person";
  const shownRows = useProgressiveCount(rows.length, 40, 60);

  return (
    <div className="card mb-4" data-section="access-history" data-state={busy ? "loading" : page ? "ready" : "empty"} data-loads={loads} data-shown={shownWords}>
      <div className="card-pad">
        <h2 className="text-lg">Sign-ins and sign-outs</h2>
        <p className="text-xs text-muted mb-3">
          Every sign-in paired with the sign-out that ended it, and the refused and failed sign-ins, for any span of days — lines moved to the activity log's archive
          included. A day's session ends with the day: a sign-in with no sign-out reads “no sign-out that day”.
        </p>
        <div className="flex gap-2 wrap items-center mb-2">
          <label className="text-sm flex items-center gap-2">
            From
            <input className="input input-sm" type="date" data-field="history-from" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm flex items-center gap-2">
            to
            <input className="input input-sm" type="date" data-field="history-to" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <select className="input input-sm" style={{ width: 200 }} data-field="history-person" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose">
            <option value="">Everybody</option>
            {overview.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="pill-tabs" data-field="history-kind" style={{ flexWrap: "wrap" }}>
            {WHICH.map((w) => (
              <div
                key={w.id}
                className={`pill-tab ${which === w.id ? "active" : ""}`}
                data-kind={w.id}
                role="button"
                tabIndex={0}
                aria-pressed={which === w.id}
                onClick={() => setWhich(w.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? setWhich(w.id) : undefined)}
              >
                {w.label}
              </div>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" data-action="access-history-csv" disabled={!page || busy} onClick={() => void csv()}>
            <FiDownload size={13} /> Download CSV
          </button>
        </div>
        {!valid && <div className="text-sm text-danger">Choose a first day on or before the last.</div>}
        {error && <div className="text-sm text-danger">{error}</div>}
        {page && (
          <div className="text-xs text-muted" data-field="history-summary" data-total={page.total}>
            {page.total === 0
              ? `Nothing ${who ? `for ${personName(who)} ` : ""}from ${formatDisplayDate(page.from)} to ${formatDisplayDate(page.to)}.`
              : `${page.total} row${page.total === 1 ? "" : "s"}${who ? ` for ${personName(who)}` : ""}, ${formatDisplayDate(page.from)} to ${formatDisplayDate(page.to)}, newest first — showing ${rows.length}.`}
            {page.truncated && ` This span holds more than ${page.maxLines.toLocaleString("en-IN")} lines; only the newest were read — choose a shorter span to see the rest.`}
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <div className="doc-table" style={{ overflowX: "auto" }}>
          <table className="compact" data-table="access-history">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Day</th>
                <th>Person</th>
                <th style={{ width: 100 }}>Signed in</th>
                <th style={{ width: 100 }}>Signed out</th>
                <th style={{ width: 110 }}>For</th>
                <th>How it ended</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shownRows).map((r, n) => (
                <HistoryLine key={`${r.at}-${n}`} row={r} clock={clock} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page?.more && (
        <div className="card-pad" style={{ paddingTop: 8 }}>
          <button className="btn btn-secondary btn-sm" data-action="access-history-more" disabled={busy} onClick={more}>
            Show more
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryLine({ row, clock }: { row: AccessHistoryRow; clock: (iso: string | null) => string }) {
  const attempt = row.kind === "failed" || row.kind === "refused";
  return (
    <tr data-kind={row.kind} data-user={row.userEmail} data-at={row.at} data-signed-out-at={row.signedOutAt ?? ""} data-archived={row.archived ? "1" : undefined}>
      <td className="text-sm">{formatDisplayDate(row.day)}</td>
      <td className="text-sm notranslate" translate="no">
        {row.userName || <span className="text-faint">No such account</span>}
        <div className="text-xs text-muted">{row.userEmail}</div>
      </td>
      {attempt ? (
        <>
          <td className="text-sm" data-field="signed-in">
            {clock(row.at)}
          </td>
          <td className="text-sm text-faint">—</td>
          <td className="text-sm text-faint">—</td>
          <td className="text-sm">
            <span className="text-danger font-semibold">{row.kind === "failed" ? "Sign-in failed" : "Sign-in refused"}</span>
            {row.detail ? <span className="text-muted"> — {row.detail}</span> : null}
          </td>
        </>
      ) : row.kind === "sign-out-alone" ? (
        <>
          <td className="text-sm text-faint" data-field="signed-in">
            —
          </td>
          <td className="text-sm" data-field="signed-out">
            {clock(row.signedOutAt)}
          </td>
          <td className="text-sm text-faint">—</td>
          <td className="text-sm text-muted">Signed out, with no sign-in that day{row.ended === "close-of-hours" ? " (at the close of working hours)" : ""}</td>
        </>
      ) : (
        <>
          <td className="text-sm" data-field="signed-in">
            {clock(row.at)}
          </td>
          <td className="text-sm" data-field="signed-out">
            {row.signedOutAt ? clock(row.signedOutAt) : <span className="text-faint">—</span>}
          </td>
          <td className="text-sm">{row.minutes === null ? <span className="text-faint">—</span> : duration(row.minutes)}</td>
          <td className="text-sm" data-field="ended">
            {row.ended ? ENDED_WORDS[row.ended] : ""}
            {row.archived && (
              <>
                {" "}
                <span className="badge badge-Scheduled" title="Read from the activity log's archive">
                  Archived
                </span>
              </>
            )}
          </td>
        </>
      )}
    </tr>
  );
}

/** The documents one person can see, by module, and the way to their sign-ins. */
function PersonDocuments({
  person,
  catalogue,
  onClose,
  onHistory,
}: {
  person: AccessPerson;
  catalogue: Catalogue;
  onClose: () => void;
  onHistory: (id: string) => void;
}) {
  const every = everyModule(person);
  // One flat list of headings and documents, so a long one is drawn a batch at a time.
  const lines = useMemo(() => {
    const out: ({ heading: string; code: string; n: number } | { doc: DocumentDefinition })[] = [];
    const codes = every ? DEPARTMENTS.map((d) => d.code) : DEPARTMENTS.map((d) => d.code).filter((c) => person.departments.includes(c));
    for (const code of codes) {
      const docs = catalogue.byModule.get(code) ?? [];
      out.push({ heading: moduleName(code), code, n: docs.length });
      for (const doc of docs) out.push({ doc });
    }
    if (catalogue.unassigned.length > 0) {
      out.push({ heading: "Belonging to no module — everybody sees these", code: "", n: catalogue.unassigned.length });
      for (const doc of catalogue.unassigned) out.push({ doc });
    }
    return out;
  }, [every, person.departments, catalogue]);
  const shownCount = useProgressiveCount(lines.length, 60, 80);
  const seen = documentsSeen(person, catalogue);

  return (
    <Modal
      title={person.name}
      onClose={onClose}
      width={640}
      footer={
        <div className="flex gap-2 justify-end" style={{ width: "100%" }}>
          <button className="btn btn-secondary btn-sm" data-action="person-history" onClick={() => onHistory(person.id)}>
            Their sign-ins and sign-outs
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div data-section="access-person" data-user={person.email} data-count={seen}>
        <p className="text-sm mb-1 notranslate" translate="no">
          {person.email} · {person.role === "admin" ? "super admin" : "staff"}
          {!person.active ? " · switched off" : ""}
        </p>
        <p className="text-sm mb-3">
          <strong>{modulesInWords(person)}</strong> — sees {seen} document{seen === 1 ? "" : "s"}.
        </p>
        <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
          {lines.slice(0, shownCount).map((l, n) =>
            "heading" in l ? (
              <h3 key={`h-${l.code}-${n}`} className="text-sm uppercase text-muted mt-1 mb-1" data-module={l.code || "none"} style={{ marginTop: n ? 12 : 0 }}>
                {l.heading} · {l.n}
              </h3>
            ) : (
              <div key={l.doc.id} className="text-sm" data-document={l.doc.id} style={{ padding: "2px 0" }}>
                <Link to={`/document/${l.doc.id}`}>{docLabel(l.doc)}</Link>
              </div>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}
