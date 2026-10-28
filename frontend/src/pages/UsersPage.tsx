import React, { useEffect, useMemo, useState } from "react";
import { FiCheck, FiEdit2, FiKey, FiList, FiMail, FiPlus, FiRefreshCw, FiRotateCcw, FiShield, FiSlash, FiStar, FiTrash2, FiUser, FiUserPlus, FiUsers } from "react-icons/fi";
import { accessApi, ApiError, emailApi, usersApi, type EmailSettingsAnswer, type ReminderContact } from "../api/client";
import { AccessSection, useAccessDocs, useAccessRules } from "../components/access/AccessSection";
import { ACCESS_MODULES, buildAccess } from "../engine/accessRules";
import { accountOf, lastSuperAdmin } from "../engine/accessEditing";
import { shortSignIn, signInAddress } from "../engine/accountNames";
import { accountWord, type AccountKey } from "../engine/accountWords";
import { reminderAddress, REMINDER_LANGUAGE_NAMES, REMINDER_LANGUAGES, type ReminderLanguage } from "../engine/reminderEmail";
import { useAuth } from "../store/AuthContext";
import { useAppStore } from "../store/AppStore";
import { Link } from "../store/router";
import { documentRepository } from "../data/repositories/documentRepository";
import { DEPARTMENTS, departmentOfDocument } from "../data/seed/departments";
import { Modal } from "../components/common/Modal";
import { Pager, usePaged } from "../components/common/Pager";
import { PasswordInput } from "../components/common/PasswordInput";
import { formatDisplayDate, formatDisplayDateTime } from "../utils/date";
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
//
// WHO MAY DO WHAT (REQUIREMENTS §96): below the accounts, the super admin's grid of
// people by module (Read, Write or Edit), who answers for each document, the accounts
// nobody has described, and the plant's people who have no account yet
// (components/access/AccessSection.tsx). Each account can be made a super admin, or
// staff again, here too; the server refuses a change that would leave no super admin.
//
// THE ACCOUNTS THE PLANT KEEPS (REQUIREMENTS §110, backend/accountRoutes.ts). The owner, 12-Oct-2026: "change username
// kapilabarad01@gmail.com change to kapila barad only and also remove all others except kapila, superadmin, admin,
// vinay, sandeep and bharat, chirag, ankur, dharmik". Each account can be RENAMED (its name and its sign-in; a sign-in
// held by an account nobody has used can be taken over with "Replace it") and REMOVED (stamped removed and switched
// off, signed out everywhere, gone from every list of people; nothing deleted). "Show removed accounts" lists them, each
// with "Bring back"; "Keep only these" removes every account not ticked in one step, after showing the list of what
// goes. Never the super admin's own account, never the last super admin. Their words are in English, Gujarati and Hindi
// (engine/accountWords.ts).
//
// EACH PERSON'S REMINDER EMAIL (the owner, 25-Oct-2026: "email the users automatically ... on their given email id's").
// A sign-in is a name, not a mailbox, and receives no mail; so each row has a "Reminder email" of the person's own, set
// here by the super admin alone, with the language its emails are written in (English, ગુજરાતી, हिन्दी) and on or off
// (backend/emailRoutes.ts keeps it; backend/emailReminders.ts emails what is still open for the person, three times on
// a working day, until it is done). Checked here and again on the server by one rule (engine/reminderEmail.ts): one
// plain address, never a sign-in, never a name that receives no mail. It can be given in "Add a person" too.
// SEND TEST beside each address (the owner, 28-Oct-2026: "when user provide it email address than on Reminder email then
// it system so really send email on that provided email"): the person's test email, to that address, there and then,
// with what happened in words; and over the accounts a line saying plainly when the reminder emails cannot go out -
// no Gmail mailbox on this server, switched off on it, or not switched on yet (backend/emailRoutes.ts).
//
// A PAGE OF ACCOUNTS AT A TIME (the owner, 25-Oct-2026: "use pagination in user access because there are many id's we
// have created currently and so low ending devices take time to load that page"). The accounts, the removed accounts and
// the grid of Who may do what each draw PAGE_SIZE people (25), with the count, the pages and "Find a person" over them
// all (components/common/Pager.tsx); a list that fits one page is drawn as before.

const MIN_PASSWORD = 8;

/** No accounts yet: the same empty list each time, so the page of them is not worked out again while they load. */
const NO_USERS: ManagedUser[] = [];

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
type Ask =
  | { kind: "reset"; user: ManagedUser }
  | { kind: "off"; user: ManagedUser }
  | { kind: "on"; user: ManagedUser }
  | { kind: "admin"; user: ManagedUser }
  | { kind: "staff"; user: ManagedUser }
  | { kind: "remove"; user: ManagedUser };

/** The account being renamed, as the form stands, and a sign-in another account holds (the server's 409). */
interface Renaming {
  user: ManagedUser;
  name: string;
  email: string;
  held: { code: string; holder: { id: string; name: string; email: string; unused: boolean; removed: boolean }; message: string } | null;
}

/** The account holding a sign-in, as the server's 409 names it. */
type Holder = NonNullable<Renaming["held"]>["holder"];

/** "Keep only these": the ticks, then the list of what goes, shown before the confirm. */
interface Keeping {
  keep: Set<string>;
  step: "pick" | "confirm";
}

/** A reminder email being set in its row, as the box stands, and why it was refused. */
interface ReminderEdit {
  userId: string;
  name: string;
  address: string;
  language: ReminderLanguage;
  enabled: boolean;
  error: string | null;
}

export function UsersPage() {
  const { user: me } = useAuth();
  const { uiLang } = useAppStore();
  const w = (key: AccountKey, vars?: Record<string, string | number>) => accountWord(uiLang, key, vars);
  const isAdmin = me?.role === "admin";
  /** Every account, the removed ones too (§110): the page shows those only under "Show removed accounts". */
  const [everyone, setEveryone] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  const [keeping, setKeeping] = useState<Keeping | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  // Each account's reminder email, by account (the super admin's alone: GET /api/email/contacts), and the one being set.
  const [contacts, setContacts] = useState<Map<string, ReminderContact> | null>(null);
  const [reminder, setReminder] = useState<ReminderEdit | null>(null);
  // How the reminder emails go on this server (the line over the accounts), the person being sent a test, and each answer.
  const [mail, setMail] = useState<EmailSettingsAnswer | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [tested, setTested] = useState<Record<string, { text: string; outcome: "sent" | "captured" | "failed" }>>({});

  // The new person, as the form stands.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newReminder, setNewReminder] = useState("");
  const [newReminderLanguage, setNewReminderLanguage] = useState<ReminderLanguage>("en");
  const [newReminderOn, setNewReminderOn] = useState(true);
  const [everyModule, setEveryModule] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // The password the administrator is about to give somebody, for a reset.
  const [resetTo, setResetTo] = useState("");

  /** The accounts on the plant's list: everyone but the removed. */
  const users = useMemo(() => (everyone === null ? null : everyone.filter((u) => !u.removedAt)), [everyone]);
  const removedAccounts = useMemo(() => (everyone ?? []).filter((u) => !!u.removedAt), [everyone]);
  // Each list a page at a time, Find a person through all of it (the owner, 25-Oct-2026).
  const usersPaged = usePaged(users ?? NO_USERS);
  const removedPaged = usePaged(removedAccounts);
  const setUsers = (change: (list: ManagedUser[]) => ManagedUser[]) => setEveryone((list) => change(list ?? []));
  /** One account as the server now has it, put in its place (or added). */
  const putUser = (u: ManagedUser) => setUsers((list) => (list.some((x) => x.id === u.id) ? list.map((x) => (x.id === u.id ? { ...x, ...u } : x)) : [...list, u]));

  // The super admin's stored access rules, and the catalogue they are read against (REQUIREMENTS §96).
  const accessRules = useAccessRules(isAdmin);
  const { docs: accessDocs } = useAccessDocs();
  const access = useMemo(() => (accessRules.loaded ? buildAccess(accessDocs, accessRules.loaded.rules) : null), [accessDocs, accessRules.loaded]);
  /** What an account sees, in words: by its levels once the rules are read, else by its departments. */
  const seesWords = (u: ManagedUser): string => {
    if (!access || u.role === "admin") return accessWords(u);
    const seen = access.modules(accountOf(u)).map((m) => m.module);
    if (seen.length === ACCESS_MODULES.length) return "Every module";
    if (seen.length === 0) return "Nothing yet";
    return seen.map((c) => DEPARTMENTS.find((d) => d.code === c)?.name ?? c).join(", ");
  };

  const load = () => {
    usersApi
      .list()
      .then((res) => setEveryone(res.users))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the accounts."));
    emailApi
      .contacts()
      .then((res) => setContacts(new Map((res?.contacts ?? []).map((c) => [c.userId, c] as const))))
      .catch(() => setContacts(new Map()));
    emailApi
      .settings()
      .then(setMail)
      .catch(() => setMail(null));
  };

  /** The person's test email, to the reminder email in their row: what happened, in words, under it. */
  const testReminder = (u: ManagedUser) => {
    setTesting(u.id);
    const said = (text: string, outcome: "sent" | "captured" | "failed") => setTested((m) => ({ ...m, [u.id]: { text, outcome } }));
    emailApi
      .test(u.id)
      .then((res) => {
        if (res.sent && res.captured) said(w("users.reminder.testCaptured"), "captured");
        else if (res.sent) said(w("users.reminder.testSent", { address: contacts?.get(u.id)?.address ?? "" }), "sent");
        else said(w("users.reminder.testNotSent", { why: res.reason ?? "" }), "failed");
        // A failure is noted in the person's row (the address's last failure): read the addresses again.
        emailApi
          .contacts()
          .then((c) => setContacts(new Map((c?.contacts ?? []).map((x) => [x.userId, x] as const))))
          .catch(() => undefined);
      })
      .catch((err) => said(w("users.reminder.testNotSent", { why: err instanceof ApiError ? err.message : "" }), "failed"))
      .finally(() => setTesting(null));
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

  const newReminderCheck = newReminder.trim() ? reminderAddress(newReminder) : null;
  const readyToAdd =
    name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    password.length >= MIN_PASSWORD &&
    (everyModule || picked.length > 0) &&
    (newReminderCheck === null || newReminderCheck.ok);

  const closeAdd = () => {
    setAdding(false);
    setName("");
    setEmail("");
    setPassword("");
    setNewReminder("");
    setNewReminderLanguage("en");
    setNewReminderOn(true);
    setPicked([]);
    setEveryModule(false);
  };

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await usersApi.create({ name: name.trim(), email: email.trim(), password, departments: everyModule ? [] : picked });
      setUsers((list) => [...list, res.user]);
      setNote(`${res.user.name} can sign in with ${res.user.email}. Give them the password you typed: it is the one they sign in with, and only you can change it.`);
      // The reminder email given with the account, set once the account is there; refused, the account stays made.
      if (newReminderCheck?.ok) {
        try {
          const set = await emailApi.setContact(res.user.id, { address: newReminderCheck.address, language: newReminderLanguage, enabled: newReminderOn });
          setContacts((m) => new Map(m ?? []).set(set.contact.userId, set.contact));
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "The reminder email could not be set: set it in the person's row.");
        }
      }
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
        setNote(`${ask.user.name}'s password is reset. Give them the new one: it is the one they sign in with from now on.`);
      } else if (ask.kind === "admin" || ask.kind === "staff") {
        const res = await accessApi.setRole(ask.user.id, ask.kind === "admin" ? "admin" : "staff");
        if (res?.user) setUsers((list) => list.map((u) => (u.id === res.user.id ? { ...u, ...res.user } : u)));
        else load();
        setNote(
          ask.kind === "admin"
            ? `${ask.user.name} is a super admin now: sees and does everything, and may sign in at any hour.`
            : `${ask.user.name} is staff now, and may see and do what Who may do what gives.`
        );
      } else if (ask.kind === "remove") {
        // REMOVED (§110): off the list at once; the access rules are read again, since nobody answers for anything through it.
        const res = await usersApi.remove(ask.user.id);
        putUser(res.user);
        accessRules.reload();
        setNote(w("users.removedDone", { name: ask.user.name }));
      } else {
        const on = ask.kind === "on";
        const res = await usersApi.setActive(ask.user.id, on);
        setUsers((list) => list.map((u) => (u.id === res.user.id ? { ...u, ...res.user } : u)));
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

  // RENAME (§110): the name and the sign-in; a sign-in held by an account nobody has used is offered with "Replace it".
  const doRename = async (replace: boolean) => {
    if (!renaming) return;
    setBusy(true);
    setError(null);
    const target = renaming.user;
    try {
      const res = await usersApi.rename(target.id, renaming.name.trim(), renaming.email.trim(), replace);
      putUser(res.user);
      if (res.replaced) putUser(res.replaced);
      accessRules.reload();
      setRenaming(null);
      const said = w("users.renamed", { name: res.user.name, email: res.user.email });
      setNote(res.replaced ? `${said} ${w("users.renamedReplaced", { holder: res.replaced.name, name: res.user.name })}` : said);
      // Renamed his own sign-in: this session has ended with the others; the sign-in screen says why.
      if (target.id === me?.id && res.user.email !== target.email) window.location.reload();
    } catch (err) {
      const data = err instanceof ApiError ? (err.data as { holder?: Holder } | undefined) : undefined;
      if (err instanceof ApiError && err.status === 409 && (err.code === "sign-in-unused" || err.code === "sign-in-used") && data?.holder) {
        setRenaming((r) => (r ? { ...r, held: { code: err.code ?? "", holder: data.holder!, message: err.message } } : r));
      } else setError(err instanceof ApiError ? err.message : "That could not be done.");
    } finally {
      setBusy(false);
    }
  };

  // BRING BACK (§110): on the list again, switched on or off as it was.
  const bringBack = async (u: ManagedUser) => {
    setBusy(true);
    setError(null);
    try {
      const res = await usersApi.bringBack(u.id);
      putUser(res.user);
      accessRules.reload();
      setNote(
        res.signIn === "taken" && res.holder
          ? w("users.broughtBackNoSignIn", { name: res.user.name, email: u.signInGivenUp ?? u.email, holder: res.holder.name })
          : res.signIn === "restored"
            ? w("users.broughtBackSignIn", { name: res.user.name, email: res.user.email })
            : res.user.active === false
              ? w("users.broughtBackOff", { name: res.user.name })
              : w("users.broughtBack", { name: res.user.name })
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That could not be done.");
    } finally {
      setBusy(false);
    }
  };

  // KEEP ONLY THESE (§110): every account not ticked, removed in one step, the list shown first.
  const listed = users ?? [];
  const going = keeping ? listed.filter((u) => !keeping.keep.has(u.id) && u.id !== me?.id) : [];
  const doKeep = async () => {
    if (!keeping) return;
    setBusy(true);
    setError(null);
    try {
      const keep = listed.filter((u) => keeping.keep.has(u.id) || u.id === me?.id).map((u) => u.id);
      const res = await usersApi.keepOnly(keep, going.map((u) => u.id));
      for (const u of res.removed) putUser(u);
      accessRules.reload();
      setKeeping(null);
      setNote(w("users.keptDone", { n: res.removed.length }));
    } catch (err) {
      if (err instanceof ApiError && err.code === "list-changed") {
        // Somebody changed the accounts meanwhile: the list is read again and shown again before anything goes.
        load();
        setKeeping((k) => (k ? { ...k, step: "pick" } : k));
      }
      setError(err instanceof ApiError ? err.message : "That could not be done.");
    } finally {
      setBusy(false);
    }
  };

  const renameShort = renaming ? shortSignIn(signInAddress(renaming.email)) : null;

  // EACH PERSON'S REMINDER EMAIL: checked here by the server's own rule, then stored by the server (which checks again).
  const editReminder = (u: ManagedUser, c: ReminderContact | null) =>
    setReminder({ userId: u.id, name: u.name, address: c?.address ?? "", language: c?.language ?? "en", enabled: c ? c.enabled : true, error: null });
  const saveReminder = async () => {
    if (!reminder) return;
    const checked = reminderAddress(reminder.address);
    if (!checked.ok) {
      setReminder((r) => (r ? { ...r, error: w(`err.email.${checked.problem}` as AccountKey) } : r));
      return;
    }
    setBusy(true);
    try {
      const res = await emailApi.setContact(reminder.userId, { address: checked.address, language: reminder.language, enabled: reminder.enabled });
      setContacts((m) => new Map(m ?? []).set(res.contact.userId, res.contact));
      setNote(res.contact.enabled ? w("users.reminder.saved", { name: reminder.name, address: res.contact.address }) : w("users.reminder.savedOff", { name: reminder.name }));
      setReminder(null);
    } catch (err) {
      const problem = err instanceof ApiError && typeof err.data?.problem === "string" ? err.data.problem : null;
      setReminder((r) => (r ? { ...r, error: problem ? w(`err.email.${problem}` as AccountKey) : err instanceof ApiError ? err.message : "That could not be done." } : r));
    } finally {
      setBusy(false);
    }
  };
  const removeReminder = async () => {
    if (!reminder) return;
    setBusy(true);
    try {
      await emailApi.removeContact(reminder.userId);
      setContacts((m) => {
        const next = new Map(m ?? []);
        next.delete(reminder.userId);
        return next;
      });
      setNote(w("users.reminder.removedDone", { name: reminder.name }));
      setReminder(null);
    } catch (err) {
      setReminder((r) => (r ? { ...r, error: err instanceof ApiError ? err.message : "That could not be done." } : r));
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
            Everybody who may sign in, and what each may see and do. Accounts are made here — nobody can create their own.
          </p>
        </div>
        <div className="flex gap-2 wrap">
          {/* WHO MAY USE WHICH MODULE, AND WHEN EACH PERSON SIGNED IN AND OUT (REQUIREMENTS §84): the super admin's own page. */}
          <Link to="/access" className="btn btn-secondary btn-sm" title="Every account's modules as switches, and today's and past sign-ins and sign-outs">
            <FiShield size={13} /> User access — modules and sign-ins
          </Link>
          {/* THE MASTER LIST OF WHO DOES WHAT (§110): every document in F/SYS/02's order, its people and their levels. */}
          <Link to="/master-list" className="btn btn-secondary btn-sm" data-action="open-master-list">
            <FiList size={13} /> {w("users.masterLink")}
          </Link>
          <button
            className="btn btn-secondary btn-sm"
            data-action="keep-only"
            disabled={users === null}
            onClick={() => setKeeping({ keep: new Set(me?.id ? [me.id] : []), step: "pick" })}
          >
            <FiUsers size={13} /> {w("users.keepOnly")}
          </button>
          <button className="btn btn-primary btn-sm" data-action="add-user" onClick={() => setAdding(true)}>
            <FiUserPlus size={13} /> Add a person
          </button>
        </div>
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

      {/* WHEN THE REMINDER EMAILS CANNOT GO OUT, SAID OVER THE ADDRESSES (28-Oct-2026). Nothing when they can. */}
      {mail && (!mail.setup.serverOn || mail.setup.mode === "off" || !mail.enabled) && (
        <div
          className="card mb-3"
          role="status"
          data-section="email-status"
          data-mode={mail.setup.mode}
          data-enabled={mail.enabled ? "yes" : "no"}
          style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}
        >
          <div className="card-pad text-sm flex items-center gap-2">
            <FiMail size={14} aria-hidden="true" />
            <span>{!mail.setup.serverOn ? w("users.email.serverOff") : mail.setup.mode === "off" ? w("users.email.notSetUp") : w("users.email.switchedOff")}</span>
          </div>
        </div>
      )}

      {users === null ? (
        <p className="text-muted text-sm">Loading the accounts…</p>
      ) : (
        <>
        <Pager paged={usersPaged} list="users" noun="accounts" />
        <div className="doc-table">
          <table className="compact" data-table="users">
            <thead>
              <tr>
                <th>Name</th>
                <th>Signs in with</th>
                <th style={{ width: 230 }}>{w("users.reminder.col")}</th>
                <th style={{ width: 120 }}>Role</th>
                <th style={{ width: 200 }}>Sees</th>
                <th style={{ width: 110 }}>Last sign-in</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 330 }}></th>
              </tr>
            </thead>
            <tbody>
              {usersPaged.shown.map((u) => {
                const off = u.active === false;
                const mine = u.id === me?.id;
                const short = shortSignIn(u.email);
                return (
                  <tr key={u.id} data-user={u.email} data-active={off ? "no" : "yes"}>
                    <td className="font-semibold notranslate" translate="no">
                      {u.name}
                      {/* RENAME (§110): its name and its sign-in. */}
                      <button
                        type="button"
                        className="access-cell-note"
                        style={{ display: "block", fontWeight: 400 }}
                        data-action="rename-user"
                        onClick={() => setRenaming({ user: u, name: u.name, email: u.email, held: null })}
                      >
                        <FiEdit2 size={10} /> {w("users.rename")}
                      </button>
                    </td>
                    <td className="text-sm notranslate" translate="no">
                      {u.email}
                      {short && <span className="text-xs text-muted block">{short}</span>}
                    </td>
                    <ReminderCell
                      user={u}
                      contact={contacts?.get(u.id) ?? null}
                      loaded={contacts !== null}
                      edit={reminder && reminder.userId === u.id ? reminder : null}
                      busy={busy}
                      w={w}
                      onEdit={(c) => editReminder(u, c)}
                      onChange={(change) => setReminder((r) => (r ? { ...r, ...change, error: null } : r))}
                      onSave={() => void saveReminder()}
                      onCancel={() => setReminder(null)}
                      onRemove={() => void removeReminder()}
                      testing={testing === u.id}
                      tested={tested[u.id] ?? null}
                      onTest={() => testReminder(u)}
                    />
                    <td>
                      <span className={`badge ${u.role === "admin" ? "badge-Verified" : "badge-Due"}`}>{u.role === "admin" ? "admin" : "staff"}</span>
                      {/* SUPER ADMIN OR STAFF (REQUIREMENTS §96): asked in plain words first; never the last super admin. */}
                      {u.role === "admin" ? (
                        <button
                          type="button"
                          className="access-cell-note"
                          style={{ display: "block" }}
                          data-action="make-staff"
                          disabled={lastSuperAdmin(users, u.id)}
                          title={lastSuperAdmin(users, u.id) ? "There must always be a super admin who can sign in" : "Make this account staff again"}
                          onClick={() => setAsk({ kind: "staff", user: u })}
                        >
                          Make staff
                        </button>
                      ) : (
                        !off && (
                          <button type="button" className="access-cell-note" style={{ display: "block" }} data-action="make-admin" onClick={() => setAsk({ kind: "admin", user: u })}>
                            Make super admin
                          </button>
                        )
                      )}
                    </td>
                    <td className="text-sm" data-field="access">
                      {seesWords(u)}
                    </td>
                    <td className="text-sm text-muted">{u.lastSignIn ? formatDisplayDate(u.lastSignIn.slice(0, 10)) : "Never"}</td>
                    <td className="text-sm">
                      {off ? (
                        <span className="badge badge-Rejected" data-field="status">
                          Switched off
                        </span>
                      ) : u.noPasswordYet ? (
                        <span className="badge badge-Rejected" data-field="status" title="Nobody can sign in to it until you give it a password with Reset password">
                          No password yet
                        </span>
                      ) : u.mustChangePassword ? (
                        <span className="badge badge-Scheduled" data-field="status" title="On the built-in first password: chosen anew at the next sign-in">
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
                        {!mine && (
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
                        {/* REMOVE (§110): never his own account, never the last super admin. */}
                        {!mine && (
                          <button
                            className="btn btn-ghost btn-sm"
                            data-action="remove-user"
                            disabled={u.role === "admin" && lastSuperAdmin(users, u.id)}
                            title={u.role === "admin" && lastSuperAdmin(users, u.id) ? "There must always be a super admin who can sign in" : undefined}
                            onClick={() => setAsk({ kind: "remove", user: u })}
                          >
                            <FiTrash2 size={12} /> {w("users.remove")}
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
        <Pager paged={usersPaged} list="users" noun="accounts" foot />
        </>
      )}

      <p className="text-xs text-muted mt-3">
        What each account may see and do is set below, in <strong>Who may do what</strong>. A change takes effect the next time that person loads the app, and
        they are told. Switching an account off deletes nothing: their name stays on every record they signed.
      </p>
      <p className="text-xs text-muted mt-1" data-field="reminder-hint">
        {w("users.reminder.col")}: {w("users.reminder.hint")}
      </p>

      {/* THE REMOVED ACCOUNTS (§110): only when asked for, each with "Bring back". */}
      {everyone !== null && (
        <div className="mt-3" data-section="removed-accounts" data-count={removedAccounts.length}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" data-action="show-removed" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
            {showRemoved ? w("users.hideRemoved") : w("users.showRemoved", { n: removedAccounts.length })}
          </label>
          {showRemoved && (
            <div className="mt-2">
              <h2 className="text-lg mb-1">{w("users.removedHeading")}</h2>
              <p className="text-xs text-muted mb-2">{w("users.removedIntro")}</p>
              {removedAccounts.length === 0 ? (
                <p className="text-sm text-muted">{w("users.removedNone")}</p>
              ) : (
                <>
                <Pager paged={removedPaged} list="removed-users" noun="removed accounts" />
                <div className="doc-table">
                  <table className="compact users-removed" data-table="removed-users">
                    <thead>
                      <tr>
                        <th>{w("users.colName")}</th>
                        <th>{w("users.colSignIn")}</th>
                        <th>{w("users.colRemoved")}</th>
                        <th style={{ width: 140 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {removedPaged.shown.map((u) => {
                        const gaveUp = u.signInGivenUp ?? null;
                        const holder = gaveUp ? (users ?? []).find((x) => x.email === gaveUp) : undefined;
                        return (
                          <tr key={u.id} data-removed-user={gaveUp ?? u.email}>
                            <td className="font-semibold" translate="no">
                              {u.name}
                            </td>
                            <td className="text-sm" translate="no">
                              {gaveUp ?? u.email}
                              {gaveUp && holder && <span className="text-xs block">{w("users.givenTo", { email: gaveUp, to: holder.name })}</span>}
                            </td>
                            <td className="text-sm">
                              {w("users.removedOn", { when: u.removedAt ? formatDisplayDate(u.removedAt.slice(0, 10)) : "", by: u.removedBy ?? "—" })}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button className="btn btn-secondary btn-sm" data-action="bring-back" disabled={busy} onClick={() => void bringBack(u)}>
                                <FiRotateCcw size={12} /> {w("users.bringBack")}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {accessRules.error && <div className="auth-error mt-4">{accessRules.error}</div>}
      {users !== null && accessRules.loaded && (
        <AccessSection
          users={users}
          everyone={everyone ?? users}
          rules={accessRules.loaded.rules}
          version={accessRules.loaded.version}
          onSaved={accessRules.saved}
          onReload={accessRules.reload}
          onUsersChanged={load}
        />
      )}

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
              <p className="text-xs text-muted mt-1">{w("users.signInNote")}</p>
            </div>
            <div className="field">
              <label htmlFor="new-user-reminder">{w("users.reminder.address")}</label>
              <div className="flex gap-2">
                <input
                  id="new-user-reminder"
                  className="input"
                  type="email"
                  data-field="new-reminder-address"
                  value={newReminder}
                  onChange={(e) => setNewReminder(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="off"
                  spellCheck={false}
                />
                <select
                  className="input"
                  data-field="new-reminder-language"
                  aria-label={w("users.reminder.language")}
                  value={newReminderLanguage}
                  onChange={(e) => setNewReminderLanguage(e.target.value as ReminderLanguage)}
                  style={{ maxWidth: 140 }}
                >
                  {REMINDER_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {REMINDER_LANGUAGE_NAMES[l]}
                    </option>
                  ))}
                </select>
              </div>
              {newReminder.trim() && (
                <label className="flex items-center gap-2 text-xs mt-1">
                  <input type="checkbox" data-field="new-reminder-enabled" checked={newReminderOn} onChange={(e) => setNewReminderOn(e.target.checked)} /> {w("users.reminder.enabled")}
                </label>
              )}
              {newReminderCheck && !newReminderCheck.ok ? (
                <p className="text-xs mt-1" role="alert" data-field="new-reminder-error" style={{ color: "var(--color-danger)" }}>
                  {w(`err.email.${newReminderCheck.problem}` as AccountKey)}
                </p>
              ) : (
                <p className="text-xs text-muted mt-1">{w("users.reminder.formHint")}</p>
              )}
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
                At least {MIN_PASSWORD} characters. Tell it to them once: it is the password they sign in with, only you can change it, and it is never shown
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

      {renaming && (
        <Modal
          title={w("users.renameTitle", { name: renaming.user.name })}
          onClose={() => setRenaming(null)}
          width={560}
          footer={
            <div className="flex gap-2 justify-end wrap" style={{ width: "100%" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>
                {w("users.cancel")}
              </button>
              {renaming.held?.code === "sign-in-unused" && (
                <button className="btn btn-danger btn-sm" data-action="replace-it" disabled={busy} onClick={() => void doRename(true)}>
                  <FiCheck size={12} /> {w("users.replaceIt")}
                </button>
              )}
              <button
                className="btn btn-primary btn-sm"
                data-action="save-rename"
                disabled={busy || !renaming.name.trim() || !renaming.email.trim() || renaming.held !== null}
                onClick={() => void doRename(false)}
              >
                <FiEdit2 size={12} /> {w("users.renameSave")}
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-3" data-section="rename-user">
            <div className="field">
              <label htmlFor="rename-name">{w("users.renameName")}</label>
              <input
                id="rename-name"
                className="input"
                data-field="rename-name"
                value={renaming.name}
                onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value, held: null } : r))}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="rename-email">{w("users.renameSignIn")}</label>
              <input
                id="rename-email"
                className="input"
                data-field="rename-email"
                value={renaming.email}
                onChange={(e) => setRenaming((r) => (r ? { ...r, email: e.target.value, held: null } : r))}
                autoComplete="off"
                spellCheck={false}
              />
              {renameShort && <p className="text-xs text-muted mt-1">{w("users.renameShort", { short: renameShort })}</p>}
            </div>
            <p className="text-xs text-muted">{w("users.renameNote")}</p>
            {renaming.user.id === me?.id && <p className="text-xs">{w("users.renameOwn")}</p>}
            {renaming.held && (
              <div className="auth-error" data-section="rename-held" data-code={renaming.held.code} style={renaming.held.code === "sign-in-unused" ? { background: "var(--color-warning-bg)", color: "var(--color-text)" } : undefined}>
                {renaming.held.code === "sign-in-unused"
                  ? w("users.replaceBody", { holder: renaming.held.holder.name, email: renaming.held.holder.email, name: renaming.name.trim() })
                  : w("err.signInUsed", { email: renaming.held.holder.email, holder: renaming.held.holder.name })}
              </div>
            )}
          </div>
        </Modal>
      )}

      {keeping && (
        <Modal
          title={w("users.keepTitle")}
          onClose={() => setKeeping(null)}
          width={600}
          footer={
            <div className="flex gap-2 justify-end wrap" style={{ width: "100%" }}>
              {keeping.step === "pick" ? (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => setKeeping(null)}>
                    {w("users.cancel")}
                  </button>
                  <button className="btn btn-primary btn-sm" data-action="keep-next" disabled={going.length === 0} onClick={() => setKeeping((k) => (k ? { ...k, step: "confirm" } : k))}>
                    {w("users.keepNext")}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-ghost btn-sm" data-action="keep-back" onClick={() => setKeeping((k) => (k ? { ...k, step: "pick" } : k))}>
                    {w("users.keepBack")}
                  </button>
                  <button className="btn btn-danger btn-sm" data-action="keep-confirm" disabled={busy || going.length === 0} onClick={() => void doKeep()}>
                    <FiTrash2 size={12} /> {w("users.keepConfirm", { n: going.length })}
                  </button>
                </>
              )}
            </div>
          }
        >
          <div data-section="keep-only" data-step={keeping.step}>
            {keeping.step === "pick" ? (
              <>
                <p className="text-sm mb-2">{w("users.keepIntro")}</p>
                <div className="flex gap-2 mb-2">
                  <button className="btn btn-secondary btn-sm" data-action="keep-all" onClick={() => setKeeping((k) => (k ? { ...k, keep: new Set(listed.map((u) => u.id)) } : k))}>
                    {w("users.keepAll")}
                  </button>
                  <button className="btn btn-secondary btn-sm" data-action="keep-none" onClick={() => setKeeping((k) => (k ? { ...k, keep: new Set(me?.id ? [me.id] : []) } : k))}>
                    {w("users.keepNone")}
                  </button>
                </div>
                <div className="keep-list">
                  {listed.map((u) => {
                    const mine = u.id === me?.id;
                    return (
                      <label key={u.id} className="keep-line" translate="no">
                        <input
                          type="checkbox"
                          data-keep={u.email}
                          checked={mine || keeping.keep.has(u.id)}
                          disabled={mine}
                          onChange={(e) =>
                            setKeeping((k) => {
                              if (!k) return k;
                              const keep = new Set(k.keep);
                              if (e.target.checked) keep.add(u.id);
                              else keep.delete(u.id);
                              return { ...k, keep };
                            })
                          }
                        />
                        <span className="font-semibold">{u.name}</span>
                        <span className="text-xs text-muted">
                          {u.email}
                          {mine ? ` (${w("users.you")})` : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {going.length === 0 && <p className="text-xs text-muted mt-2">{w("users.keepNothing")}</p>}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold mb-2">{going.length === 1 ? w("users.keepGoesOne") : w("users.keepGoes", { n: going.length })}</p>
                <ul className="text-sm mb-3" style={{ paddingLeft: 18 }} data-section="keep-goes" data-count={going.length} translate="no">
                  {going.map((u) => (
                    <li key={u.id} data-goes={u.email}>
                      {u.name} <span className="text-muted">({u.email})</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted">{w("users.keepBody")}</p>
              </>
            )}
          </div>
        </Modal>
      )}

      {ask && (
        <Modal
          title={
            ask.kind === "reset"
              ? "Reset this password?"
              : ask.kind === "off"
                ? "Switch this account off?"
                : ask.kind === "admin"
                  ? `Make ${ask.user.name} a super admin?`
                  : ask.kind === "staff"
                    ? `Make ${ask.user.name} staff?`
                    : ask.kind === "remove"
                      ? w("users.removeTitle", { name: ask.user.name })
                      : "Switch this account on?"
          }
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
                className={ask.kind === "off" || ask.kind === "remove" ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"}
                data-action="confirm-ask"
                disabled={busy || (ask.kind === "reset" && resetTo.length < MIN_PASSWORD)}
                onClick={() => void doAsk()}
              >
                {ask.kind === "reset" ? (
                  <>
                    <FiKey size={12} /> Reset it
                  </>
                ) : ask.kind === "admin" ? (
                  <>
                    <FiStar size={12} /> Yes, make super admin
                  </>
                ) : ask.kind === "staff" ? (
                  <>
                    <FiUser size={12} /> Yes, make staff
                  </>
                ) : ask.kind === "remove" ? (
                  <>
                    <FiTrash2 size={12} /> {w("users.removeConfirm")}
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
                  will sign in with the password you type here, and only you can change it. Their old password stops working at once.
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
            {ask.kind === "remove" && (
              <p className="text-sm" data-section="confirm-remove">
                {w("users.removeBody", { name: ask.user.name })}
              </p>
            )}
            {ask.kind === "admin" && (
              <p className="text-sm">
                <strong className="notranslate" translate="no">
                  {ask.user.name}
                </strong>{" "}
                will see and do everything in every module, change who may do what, make and switch off accounts, and may sign in at any hour. The change is
                written in the activity log.
              </p>
            )}
            {ask.kind === "staff" && (
              <p className="text-sm">
                <strong className="notranslate" translate="no">
                  {ask.user.name}
                </strong>{" "}
                will no longer be a super admin: from the next sign-in, only what <strong>Who may do what</strong> gives, and only within the plant's working
                hours. The change is written in the activity log.
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

/**
 * ONE PERSON'S REMINDER EMAIL, IN THE ROW: the address with its language and on or off (and the last failure, when the
 * last email did not go), "Change" or "Add"; or, while it is being set, the box, the language, "Send the reminders",
 * Save, Cancel and Remove.
 */
function ReminderCell({
  user,
  contact,
  loaded,
  edit,
  busy,
  w,
  onEdit,
  onChange,
  onSave,
  onCancel,
  onRemove,
  testing,
  tested,
  onTest,
}: {
  user: ManagedUser;
  contact: ReminderContact | null;
  loaded: boolean;
  edit: ReminderEdit | null;
  busy: boolean;
  w: (key: AccountKey, vars?: Record<string, string | number>) => string;
  onEdit: (c: ReminderContact | null) => void;
  onChange: (change: Partial<Pick<ReminderEdit, "address" | "language" | "enabled">>) => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove: () => void;
  /** A test email to this address is on its way. */
  testing: boolean;
  /** What the last test of this address came to, in words. */
  tested: { text: string; outcome: "sent" | "captured" | "failed" } | null;
  onTest: () => void;
}) {
  const state = contact ? (contact.enabled ? "on" : "off") : "none";
  if (edit) {
    return (
      <td className="text-sm" data-field="reminder-email" data-state={state}>
        <div className="flex flex-col gap-1" data-section="reminder-edit" style={{ minWidth: 210 }}>
          <input
            className="input"
            type="email"
            data-field="reminder-address"
            aria-label={`${w("users.reminder.address")}: ${user.name}`}
            value={edit.address}
            onChange={(e) => onChange({ address: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
            }}
            placeholder="name@example.com"
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <div className="flex gap-2 items-center wrap">
            <select className="input" data-field="reminder-language" aria-label={w("users.reminder.language")} value={edit.language} onChange={(e) => onChange({ language: e.target.value as ReminderLanguage })} style={{ maxWidth: 120 }}>
              {REMINDER_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {REMINDER_LANGUAGE_NAMES[l]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" data-field="reminder-enabled" checked={edit.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} /> {w("users.reminder.enabled")}
            </label>
          </div>
          {edit.error && (
            <div className="text-xs" role="alert" data-field="reminder-error" style={{ color: "var(--color-danger)" }}>
              {edit.error}
            </div>
          )}
          <div className="flex gap-1 wrap">
            <button type="button" className="btn btn-primary btn-sm" data-action="save-reminder-email" disabled={busy} onClick={onSave}>
              <FiCheck size={12} aria-hidden="true" /> {w("users.reminder.save")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" data-action="cancel-reminder-email" onClick={onCancel}>
              {w("users.reminder.cancel")}
            </button>
            {contact && (
              <button type="button" className="btn btn-ghost btn-sm" data-action="remove-reminder-email" disabled={busy} onClick={onRemove}>
                <FiTrash2 size={12} aria-hidden="true" /> {w("users.reminder.remove")}
              </button>
            )}
          </div>
        </div>
      </td>
    );
  }
  return (
    <td className="text-sm" data-field="reminder-email" data-state={state}>
      {contact ? (
        <>
          <span className="notranslate" translate="no" data-field="reminder-address-shown">
            {contact.address}
          </span>
          <span className="text-xs text-muted block">
            {REMINDER_LANGUAGE_NAMES[contact.language]}, {contact.enabled ? w("users.reminder.on") : w("users.reminder.off")}
          </span>
          {contact.lastFailure && (
            <span className="text-xs block" data-field="reminder-failure" style={{ color: "var(--color-danger)" }}>
              {w("users.reminder.failed", { when: formatDisplayDateTime(contact.lastFailureAt), why: contact.lastFailure })}
            </span>
          )}
        </>
      ) : (
        <span className="text-muted">{loaded ? w("users.reminder.none") : ""}</span>
      )}
      {loaded && (
        <span className="flex gap-3 wrap">
          <button type="button" className="access-cell-note" data-action="edit-reminder-email" onClick={() => onEdit(contact)}>
            <FiMail size={10} aria-hidden="true" /> {contact ? w("users.reminder.change") : w("users.reminder.add")}
          </button>
          {/* The person's test email, to this very address (28-Oct-2026). */}
          {contact && (
            <button type="button" className="access-cell-note" data-action="test-reminder-email" disabled={testing} onClick={onTest}>
              {testing ? w("users.reminder.testing") : w("users.reminder.test")}
            </button>
          )}
        </span>
      )}
      {tested && (
        <span
          className="text-xs block"
          role="status"
          data-field="reminder-test-result"
          data-outcome={tested.outcome}
          style={{ color: tested.outcome === "failed" ? "var(--color-danger)" : "var(--color-success)", maxWidth: 260 }}
        >
          {tested.text}
        </span>
      )}
    </td>
  );
}
