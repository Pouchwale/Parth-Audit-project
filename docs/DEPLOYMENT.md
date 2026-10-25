# DEPLOYMENT.md

## Build & start commands

```bash
npm install
npm run dev         # frontend dev server (5173) + auth API (4000) together, live rebuild
npm run dev:frontend # frontend only (assumes something else is serving /api)
npm run server       # auth API only, http://localhost:4000
npm run build        # -> frontend/dist/ (static frontend bundle, ~0.7 MB JS + CSS)
npm start            # build + serve frontend/dist/ AND the API from one Express process (production)
npm run typecheck    # tsc --noEmit (see "TypeScript checking" note below)
```

The frontend (`frontend/dist/`) is still a static bundle, but the app now also needs the small auth API
in `backend/` to be running for sign-in to work — see **Accounts / Authentication** below.
`npm start` is the simplest way to run both as a single process for a pilot.

**Languages: TypeScript and Python only.** The frontend, the backend (`backend/*.ts`) and every build /
dev / test-runner script (`scripts/*.ts`, `frontend/scripts/*.ts`) are TypeScript; the browser tests are
Python. There is no plain JavaScript in the repository. Node runs the backend and scripts straight from
the `.ts` sources (native type stripping — **Node 23.6 or newer** is required, or 22.18+; older
versions need `--experimental-strip-types`), so there is no compile step for the server — `npm run
typecheck` type-checks frontend, backend and scripts together (`tsconfig.node.json` covers the
Node side).

## Recommended pilot deployment (internal LAN, per section 44)

**The whole application on one server PC** — DCRS, the Mitra server and Mitra for the staff's phones in Expo Go,
started together and again after a power cut — is set up step by step in [phone-app-setup.md](phone-app-setup.md).

1. On the target machine (needs Node.js 23.6+ — nothing else): `npm install && npm start`. This builds
   `frontend/dist/` and starts one Express process on port 4000 that serves the built frontend *and* the
   auth API from the same origin (no CORS, no second process to manage).
2. Share the LAN URL (`http://<machine-ip>:4000`) with pilot users; DCRS prints it when it starts ("On the
   company network: http://<address>:4000"). Nobody signs up: at its first start DCRS adds the plant's named
   accounts (the super admin `admin@gpp.local`, and Quality Control's and Human Resources' accounts) on the first
   password `SEED_ACCOUNT_PASSWORD` names, or the built-in one, which each person must change at their first
   sign-in; the super admin makes everybody else's account on Users & Access (REQUIREMENTS §62, §66).
3. Set `API_PORT` to change the port, and `JWT_SECRET` if you want to pin the session-signing key
   yourself (otherwise one is generated on first run and stored in `backend/data/jwt-secret.txt` —
   see below). **Still recommended not to expose this port to the public internet as-is** — this
   is a from-scratch email/password login meant for a trusted internal LAN, not a hardened
   internet-facing auth system (no email verification, no password reset, no 2FA; its HTTPS is the
   secure address on DCRS's own certificate below, meant for the company network, not the internet).
4. **Mitra's microphone needs the secure address** (REQUIREMENTS §120): a browser lends the microphone only on
   `https` or on `http://localhost`, so from another computer open `https://<machine-ip>:4443` (DCRS prints it
   when it starts; see **The secure address** below). The plain `http://<machine-ip>:4000` keeps working for
   everything else, and the phones' Mitra app keeps using it.
5. Because routing is hash-based (`#/dashboard`, `#/calendar`, …), no server-side URL rewriting
   is required for the frontend routes themselves — only `/api/*` needs to reach the Express
   process, which `backend/index.ts` already handles when serving `frontend/dist/` itself.

If you specifically want the old zero-backend static-only deployment (no accounts, anyone with
the URL gets straight in), that's no longer how `main.tsx` is wired — the app now gates on
`AuthProvider`. Removing that gate is a small, isolated revert (see `frontend/src/main.tsx`), not
recommended for anything beyond a quick local demo.

## The secure address (Mitra's microphone on the company network, REQUIREMENTS §120)

DCRS answers at `https://<machine-ip>:4443` beside `http://<machine-ip>:4000` - the same pages, the same API, the
same sign-in. A browser lends a page the microphone only on `https` or on `http://localhost`, so on every computer
but the DCRS computer itself Mitra hears only at the secure address. On the http address the microphone button
says so and offers **Open the secure address**.

- **Nothing to install on the server.** DCRS makes its own certificates at its first start, in `backend/data/tls`
  (never committed): the plant's certificate authority (ten years) and a server certificate it signs for
  `localhost`, the computer's name and each of its network addresses. When the computer's address changes, the
  next start makes the server certificate again; the authority stays, so nothing needs installing again.
- **The firewall:** run `scripts\windows\open-firewall.ps1` again as an administrator once - it adds TCP 4443
  beside 4000 (docs/phone-app-setup.md, step 4).
- **Each computer, once - either way works:**
  - *Quick:* open `https://<machine-ip>:4443`; the browser warns "Your connection is not private"; choose
    **Advanced**, then **Continue to <machine-ip> (unsafe)**. The microphone works from then on (Chrome and Edge
    may ask again after they restart).
  - *No warning ever:* open `http://<machine-ip>:4000/dcrs-certificate.crt`, open the downloaded
    `DCRS-certificate.crt`, **Install Certificate...** > **Current User** (or Local Machine) > **Place all
    certificates in the following store** > **Trusted Root Certification Authorities** > Finish, and answer
    Yes. Restart the browser. The file is only the plant's certificate authority - its key never leaves the
    DCRS computer.
- **Settings** (`backend/.env`): `HTTPS_PORT` (default: DCRS's port + 443), `DCRS_HTTPS=off` (no secure address),
  `HTTPS_CERT_FILE` and `HTTPS_KEY_FILE` (the company's own certificate and key, PEM, instead of DCRS's).

## Mitra's free natural voice (REQUIREMENTS §121)

In **Microsoft Edge** Mitra already speaks English, Hindi and Gujarati in natural voices, free, with nothing to set up.
In Chrome (no Gujarati voice, robotic English) a line is said by the server's natural voice instead. To make that
voice free:

1. Open https://aistudio.google.com with the company's Google account, choose **Get API key** → **Create API key**.
   No billing and no card are needed for the free tier.
2. Put it in `backend/.env` on the DCRS computer as `GEMINI_API_KEY=<the key>`, and restart DCRS.
3. Master Data → Working Hours & Briefing names the voice in use ("Google's Gemini voice").

The free tier's limits (requests a minute and a day) are shown in AI Studio; DCRS keeps every clip it made and asks
as little as it can. When Gemini cannot speak, the browser's own voice does: the PAID ChatGPT voice never speaks
unless `AI_TTS_PAID=1` is set beside the key (REQUIREMENTS §122 — the owner keeps the voice to free ones). Google may use the words sent on its free tier (the reminders name people, documents and
scores) to improve its products.

## Accounts / Authentication

`backend/` is a small, separate Express service that owns real user accounts — this is the one
part of the app that is no longer purely client-side:

- **Storage**: the `users` table of the PostgreSQL database (see **Database** below): id, name,
  email (unique), bcrypt password hash, role, created_at, departments.
- **Sessions**: signup/login issue a JWT (`backend/auth.ts`) in an httpOnly, `SameSite=Lax` cookie
  (`dcrs_session`), which ends at the close of the day it began: at the end of the working hours for staff,
  at midnight for the super admin (REQUIREMENTS §84). The signing secret is generated once on first run and saved to
  `backend/data/jwt-secret.txt` (gitignored) so restarts keep existing sessions valid; set
  `JWT_SECRET` yourself to control it explicitly (e.g. if you ever run more than one instance).
- **Where each person is signed in** (REQUIREMENTS §106): every session is also a row of `user_sessions`, read on
  every request, so signing out ends it and the super admin can sign one device out from User access ("Signed in
  on"). An account may be signed in on at most `DCRS_MAX_DEVICES` devices (2 unless set); the super admin is never
  held to it. The Mitra server names the phones only with `MITRA_SERVER_KEY` set the same on both servers.
- **Roles**: `admin` (the super admin) and `staff`. The super admin is the seeded `admin@gpp.local`; every
  account the super admin makes on Users & Access is `staff`, kept to the departments it is given. Signing up is
  refused (`POST /api/auth/signup` answers 403) unless `ALLOW_SIGNUP=1`; with it (the test runner, or ONE start
  with `SEED_ACCOUNTS=0` to make a first administrator on an empty database) the first account on an empty
  database becomes `admin` and every later one `staff`. The server enforces the role: only the super admin
  reaches Users & Access, the Database overview and the escalations, reads the whole Activity Log, and may use
  DCRS outside the working hours (REQUIREMENTS §66, §84).
- **Brute-force throttling**: a simple in-memory counter blocks an email after 8 failed logins for
  10 minutes. Resets on server restart — adequate for an internal pilot, not a substitute for a
  real WAF/rate-limiter if this is ever exposed more broadly.
- Routes: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`. In dev, `frontend/scripts/dev-server.ts` proxies `/api/*` to `backend/index.ts` so
  the frontend (5173) and API (4000) share one origin and cookies work without CORS games; in
  production, `backend/index.ts` serves `frontend/dist/` itself, so there's only one origin regardless.

The app's operational data is in the same PostgreSQL database — see below.

## Database — PostgreSQL only (REQUIREMENTS §55)

**Every piece of data the system keeps is in PostgreSQL** (`backend/db.ts`): the user accounts, the
reminder emails' tables, and all of the app's own data — the records, the document definitions, master
data, the HR Master Data sheet, reference edits, the deletions log and the date the system went live
(shared by the whole company),
and each person's settings, assistant conversations and sidebar layout (their own). Nothing is kept
in SQLite or in files any more. The browser holds only a **working copy**: loaded from the database
when a person signs in, written back a moment after every change, and refreshed from the database
every five seconds (and when the window regains focus), so everyone signed in sees everyone else's
work. Only the assistant bubble's position on the screen stays in the browser.

Tables:

| Table | Holds |
|---|---|
| `users` | accounts: id, name, email, bcrypt hash, role, created_at, departments |
| `user_sessions` | where each person is signed in (REQUIREMENTS §106): one row per session, keyed by the id its token carries — the account, the device's own id, its name in words, its category (computer, mobile or tablet), the website, the Mitra phone app or the API, the browser or app, the system, the address, signed in at, last used (written at most once a minute), ends at, and when, why and by whom it was ended. Read on every request, so a sign-out and the super admin's "Sign out this device" end a session at once. Nothing deletes a row |
| `digest_log` | the last date the browser's reminder digest was emailed (one row). Retired on 25-Oct-2026: nothing writes it since the server sends the reminder emails itself (`email_log` below); kept, as every table is |
| `activity_log` | the Activity Log (REQUIREMENTS §62): one line per thing a person did — `at`, `user_id`, `user_name`, `action`, `target`, `detail`, `department`, `ip`. Indexed by time, by person and time, and by department and time; its search has a trigram index (`activity_log_search_trgm_idx`) when the database account may create the `pg_trgm` extension — without that right the server logs one warning and searches unindexed (REQUIREMENTS §75). **Append-only in the database itself**: a trigger refuses UPDATE, DELETE and TRUNCATE on the log and its archive; the one DELETE allowed is the archive step's, in its own transaction. Created with CREATE OR REPLACE TRIGGER at every start, so PostgreSQL 14 or later is needed. `client_id` holds the browser's own id for a line (a UUID), unique where present, so a batch sent again is written once |
| `activity_log_archive` | lines of the Activity Log the super admin moved out of it on purpose: the log's columns with the same ids, plus `archived_at` and `archived_by`; indexed like the log. Read with the log on the Activity Log page ("Include archived lines"). Refuses UPDATE, DELETE and TRUNCATE |
| `activity_daily`, `activity_daily_state` | the Activity Log counted day by day (one row per day, person, department and action; archived or not), which the per-person tally reads for closed days. A copy made from the log, never instead of it: checked against the lines before each day is added, counted again whenever they differ or `PLANT_TIMEZONE` changes. `DELETE FROM activity_daily_state;` makes it recount |
| `job_runs` | one row per scheduled run a server claimed: `job`, `period` (a day or an ISO week), `claimed_at`, `finished_at`, `outcome`; the primary key (job, period) is the claim. A failed or abandoned run is kept under "`<period>` failed/abandoned `<when>`" and the period freed for a retry. A hand run (`POST /api/jobs/run`) for the plant's today claims its period, with the outcome "by hand (`<name>`): …"; a run whose outcome could not be written is written a minute later, not failed |
| `escalations` | the super admin's escalations: `kind` (person/department), `subject_key` (account id or `dept:HR`), `subject_name`, `department`, `period` (ISO week), `late`, `never_done`, `evidence` (window, rule, worst documents, up to 10 records), `acknowledged_by`/`_at`, `record_ids` (every record behind the day's figures) and `seen_ids` (those behind it when it was acknowledged — it opens again only for a record not among them); one per subject per week |
| `weekly_digests` | `period` (ISO week), `created_at`, `body` — the weekly digest shown on the Performance page |
| `notifications` | each person's notifications (REQUIREMENTS §97): `user_id`, `kind`, `key` (unique per person: `ready\|<record>`, `due\|<document>\|<date>` …), `priority`, `data` (the facts, JSON: never a sentence, never a reading; worded on every read in the language asked), `created_at`, `updated_at`, `read_at`, `resolved_at`, `pushed_at`, `push_attempts`. Written by the notify job (upsert by person and key; an item the plan no longer has is resolved); deleted 60 days after it is resolved |
| `push_devices` | one row per phone registered for pushes (`POST /api/v1/devices`): `token` (the Expo push token, the key), `user_id`, `platform`, `language`, `app_version`, `device_name`, `created_at`, `last_seen_at`, `session_id` (the `user_sessions` row it was registered under). A token Expo says is no longer registered is deleted, and so is a phone whose session was ended on purpose (signed out, by the super admin, the account switched off: REQUIREMENTS §106); a sign-in again on the same phone moves it to the new session |
| `notification_prefs` | one row per person: `kinds` (JSON, the kinds switched off for pushing) and `reminders` (the phone's own reminders) |
| `push_tickets` | the tickets Expo's push service answered with (`id`, `token`, `created_at`), until their receipts are read about 15 minutes later; deleted after a day |
| `email_contacts` | each account's REMINDER EMAIL (the owner, 25-Oct-2026; `backend/emailContacts.ts`), one row per account the super admin gave one: `user_id` (users.id, deleted with the account), `address` (a mailbox of the person's own, never the sign-in), `language` (`en`, `gu` or `hi`: the emails' words), `enabled`, `set_by`, `set_at`, `last_failure` and `last_failure_at` (the last send that failed, its words masked; cleared by the next that goes). Read and written by the super admin alone (`/api/email/*`); never in `/api/users/directory`, a log line or the activity log |
| `email_settings` | one row: `enabled` (the super admin's switch for the reminder emails, on the Notifications page: off until switched on), `set_by`, `set_at` |
| `email_log` | one row per person, plant day and slot (`morning`, `reminder`, `lastCall`; a test email `test-<time>`): `items` (how many open records it listed), `state` (`claimed`, `sent`, `captured`, `failed`), `attempts`, `message_id`, `error` (masked: never an address), `subject`, `body` (the plain text, kept only for an email captured with `EMAIL_TRANSPORT=capture`), `claimed_at`, `sent_at`. UNIQUE (`user_id`, `day`, `slot`): each email is claimed here before it is sent, so a restart, a second server or a run by hand never sends a slot's email twice. Deleted after 60 days |
| `app_storage` | the app's data, one row per stored item: `scope` (`company`, or a user's id), `key` (`records`, `documents`, `master`, `hrMasterData`, `referenceEdits`, `deletions`, `live-start` for the company; `settings`, `assistant-conversations`, `sidebar-open-modules`, `sidebar-visible` for a person — no other keys are accepted), `value` (the item as JSON text), `version`, `seq`, `updated_at`, `updated_by` |

The four notification tables and the three email tables are DCRS's own: no role of the Audit Assistant is granted them (REQUIREMENTS §83; the shared database's scripts grant nothing in `public`).

**Where the database is.**

- **`DATABASE_URL` set** — the server uses that PostgreSQL, e.g.
  `DATABASE_URL=postgres://dcrs:secret@db-host:5432/dcrs` in `backend/.env`. This is how a real
  deployment should run (a managed or on-site PostgreSQL with its own backups). Create the database in
  **UTF8** (`CREATE DATABASE dcrs ENCODING 'UTF8' TEMPLATE template0;`) — the records hold Gujarati
  and typographic dashes, and the server refuses to start on a database in any other encoding. The
  tables are created on first start.
- **`DATABASE_URL` not set** — the server starts **a PostgreSQL of its own** on this machine, from the
  `embedded-postgres` npm package (real PostgreSQL 18 binaries, no installation, no admin rights),
  listening on `127.0.0.1:5433` (`EMBEDDED_PG_PORT` to change it), data in `backend/data/postgres`,
  password generated once into `backend/data/postgres-password`, its log in
  `backend/data/postgres.log`. So `npm install && npm start` still needs nothing but Node.js. The first
  start takes ~15 seconds to set the cluster up. It is started with `pg_ctl` as a process of its own,
  **in the background with no window** — `npm run dev` (or `npm start`) in one terminal is everything, and
  the terminal says "Local PostgreSQL started in the background on port 5433". (Until 19-Sep-2026 a black
  console window opened beside the terminal on Windows and had to be left open: `pg_ctl` was spawned
  `detached`, which on Windows gives it no console, so the `postgres.exe` it launched opened a visible one
  of its own. It is now spawned with a hidden console instead, which the database inherits — measured both
  ways on a throwaway cluster.) It
  **keeps running when the server stops** — a second server on the same machine (the live assistant
  suite's, say) may be using it, and the next start simply uses it again. `npm run db:stop` shuts it
  down cleanly (a fast shutdown, with a checkpoint). A server only reuses a PostgreSQL on that port if
  it is this app's own (same data directory); another PostgreSQL there — the Windows installer often
  puts a second one on 5433 — stops the start with a message naming the port and `EMBEDDED_PG_PORT`.
  A start that fails quotes the last lines of the PostgreSQL log.

**Coming from the SQLite version.** An install that has `backend/data/app.db` has its accounts and
digest log copied into PostgreSQL automatically the first time the server starts against an empty
database; the file is then renamed `app.db.imported` and never read again. The records that lived in
a browser's `localStorage` go up the first time somebody signs in on that browser: they are **merged**
with what the database already holds (records, HR Master Data lines and deletions by id; other items
field by field, the database's value kept where both have one), never thrown away.

**Two people at once.** Each write says which version of the item it was made from. A write made from
an out-of-date copy is refused (`409`) and comes back with what is stored now, and the browser merges
the two **against the copy both started from** (the last one it had in step with the database): what
only one side changed is kept; a line deleted on one side and untouched on the other stays deleted; a
line both changed keeps the version changed last. This holds for every item — records and HR Master
Data lines by id, master data, document definitions, reference edits and settings field by field — and
for a save made while the request was on its way. Two browsers opening a new month at the same moment
do not list its blank records twice. The date the system went live keeps the earliest date either
side knows of. Writes take their sequence number one at a time, in commit order, so a browser asking
"what changed since" never misses one. A change that cannot reach the database is kept on the computer
and sent again, with a banner saying so; one still on its way when the page was closed is sent at the
next sign-in (the copy it was made from is kept with it, so it merges properly). Signing out and in
again in the same tab starts from the database's copy, never from what the page held before.

**Departments.** An account kept to departments (not the administrator, and with departments
assigned) is handed only the records and deletions-log lines of documents its departments own (or no
department owns), and the HR Master Data sheet only with Human Resources (`403` otherwise). What such
an account writes to the records replaces only its own departments' lines; everyone else's stay as
stored. A browser says which departments its copy was made for (`X-Scope`); after the administrator
changes an account's departments, a write from a copy made for the old ones is refused and merged with
what the account sees now, so a department just added is never wiped, and an open page loads again for
the new departments. An account with no department assigned still sees every department (REQUIREMENTS
§40), so the administrator should assign departments to new accounts.

**Session and outages.** A session that has run out (or was ended in another tab) sends the page back
to the sign-in screen; what was unsent goes at the next sign-in. A tab left open for one account after
the browser signed in as another (`X-Account`) is refused, and opens for the account now signed in. When the server or its database does
not answer, the app says so with *Try again* (the API answers `503`) instead of showing the sign-in
screen.

**API** (all need a signed-in session): `GET /api/storage` (everything for the person: the company's
items and their own, with every item's `versions` and the items the account may not hold, `denied`),
`GET /api/storage?since=<seq>` (what changed), `PUT /api/storage/<key>` (body: the value as JSON;
header `X-Base-Version`), `DELETE /api/storage/<key>` (the company's items: administrator only).

**Capacity.** PostgreSQL holds the data, and each browser keeps a working copy of the company's items:
in its `localStorage`, which browsers limit to about 5 MB of text per site, and, for what does not fit
there (a year of the plant's records is larger), in the browser's IndexedDB, which the browser sizes by
the computer's disk (REQUIREMENTS §108). So a full `localStorage` no longer stops a sign-in or a save,
and nothing has to be cleared to make room. Only when IndexedDB too refuses (the computer's disk nearly
full) does a banner say "This browser's copy is full": the change is still sent to the database from
the page, nothing is lost, and freeing space on the disk ends it. **After an update, reload every tab
of DCRS left open from before** (or close the browser and open it again): a tab still running the
older version reads only `localStorage`. A single stored item may be up to 25 MB
(`STORAGE_MAX_BYTES` in `backend/index.ts`).

## Both applications on one PostgreSQL server (REQUIREMENTS §107)

For the plant's deployment, DCRS and the Mitra server keep their data on ONE PostgreSQL server (the PostgreSQL 18
installed as a Windows service, port 5432), each in a database of its own. Until now DCRS used the PostgreSQL it starts
by itself (port 5433, `backend\data\postgres`) and the Mitra server its embedded folder (`server\.data\pglite`). The
steps below move both, and lose nothing: each copy is checked row by row, and the old copies are kept until the new
ones are checked.

| | DCRS | Mitra |
|---|---|---|
| Database | `dcrs` | `mitra` |
| Its own role, which owns the database and every table in it | `dcrs` | `mitra` |
| Its address | `DATABASE_URL` in DCRS's `backend\.env` | `DATABASE_URL` in `Audit project chatbot-mobile\server\.env`, with `NODE_ENV=production` |

Neither role is a superuser, and neither can read the other's tables: each application's tables are its own role's,
granted to nobody else. In production the Mitra server refuses to start on anything but a `postgres://` address, and
says so (REQUIREMENTS §107), so it can never fall back to a folder on one disk by mistake. Every command below runs in
PowerShell on the server PC, `psql`, `pg_dump` and `pg_restore` from `C:\Program Files\PostgreSQL\18\bin`. A password
is never written on a command line or in a chat: `\password` in psql asks for it, and `$env:PGPASSWORD` holds it for
the window's own commands only.

**1. The two roles and the two databases** (once, as the server's superuser `postgres`):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres
```

```sql
CREATE ROLE dcrs LOGIN;
\password dcrs
CREATE DATABASE dcrs OWNER dcrs ENCODING 'UTF8' TEMPLATE template0;
CREATE ROLE mitra LOGIN;
\password mitra
CREATE DATABASE mitra OWNER mitra ENCODING 'UTF8' TEMPLATE template0;
\q
```

Use passwords of letters and digits (16 or more): they go into addresses, where other characters must be
percent-encoded.

**2. DCRS's records, when DCRS already holds real work** in the PostgreSQL it started by itself. Stop DCRS (and the
Mitra server); the database on 5433 keeps running (start DCRS once if it is not, then stop it). Take DCRS's own tables,
without the overview (DCRS makes it again in step 4), and put them into the new database as `dcrs`, which then owns
them:

```powershell
cd C:\DCRS
$env:PGPASSWORD = Get-Content backend\data\postgres-password
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" --format=custom --exclude-schema=overview --exclude-schema=chatbot --file=dcrs-move.dump "postgres://postgres@127.0.0.1:5433/dcrs"
$env:PGPASSWORD = Read-Host "DCRS's new password"
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --no-owner --no-privileges --exit-on-error --single-transaction --dbname="postgres://dcrs@127.0.0.1:5432/dcrs" dcrs-move.dump
Remove-Item Env:PGPASSWORD
```

The restore is one transaction: it finishes whole or leaves the new database empty. Check that both hold the same: in
psql on each (`-p 5433 -U postgres -d dcrs`, then `-p 5432 -U dcrs -d dcrs`), `SELECT count(*) FROM app_storage;
SELECT count(*) FROM activity_log; SELECT count(*) FROM users;` must give the same numbers. Keep `dcrs-move.dump` and
`backend\data\postgres` as they are until DCRS has run on the new database for a while. (A plant with nothing in DCRS
yet leaves this step out: DCRS makes its tables at its first start.)

**3. DCRS on the new database.** In `backend\.env`:

```text
DATABASE_URL=postgres://dcrs:<DCRS's password>@127.0.0.1:5432/dcrs
```

Start DCRS. It makes any table it lacks (on an empty database, all of them) and says in its window that the Database
overview waits for one step: its role may not set it up by itself.

**4. The Database overview, once** (as `postgres`, in the DCRS folder):

```powershell
$env:SUPERUSER_DATABASE_URL = "postgres://postgres@127.0.0.1:5432/dcrs"
$env:PGPASSWORD = Read-Host "The postgres password"
npm run db:shared -- setup
Remove-Item Env:PGPASSWORD
```

It adds the overview's views and lets the role `dcrs` read them as `overview_viewer` (docs/database/README.md). Open
the Database overview: it reads at once, with no restart, and `OVERVIEW_DATABASE_URL` stays unset. (When DCRS signs in
as a superuser, as on the PostgreSQL it starts by itself, DCRS does this step itself at start-up.)

**5. Mitra's data.** Stop the Mitra server. In `Audit project chatbot-mobile\server\.env`:

```text
DATABASE_URL=postgres://mitra:<Mitra's password>@127.0.0.1:5432/mitra
NODE_ENV=production
```

When the Mitra server has run before on its own folder, bring that over first, from the `Audit project chatbot-mobile`
folder (`--to` is the `DATABASE_URL` just written when left out):

```powershell
npm --prefix server run db:copy -- --from .data/pglite
```

It copies every table into the empty database in one transaction, checks every table's rows against the folder before
it commits, prints the counts, and refuses a database that already holds Mitra's data; the folder is only read
(server/src/db/copy.ts). Then start the Mitra server: it opens the database with its own migrations. Keep
`server\.data\pglite` until the app has been checked on the phones.

**6. Backups of both.** One role that may read everything and change nothing, for the backups only (as `postgres`, in
psql on 5432): `CREATE ROLE dcrs_backup LOGIN; \password dcrs_backup; GRANT pg_read_all_data TO dcrs_backup;`. Then in
DCRS's `backend\.env`:

```text
BACKUP_DATABASE_URL=postgres://dcrs_backup:<its password>@127.0.0.1:5432/dcrs
MITRA_DATABASE_URL=postgres://dcrs_backup:<its password>@127.0.0.1:5432/mitra
```

`npm run db:backup` (every evening by itself once `scripts\database\schedule-backup.ps1` is registered) then writes
`dcrs-<date>-<time>.dump`, `mitra-<date>-<time>.dump` and the server's roles file together, and keeps them 14 days
(below, "Backups of the shared database").

**7. The restore test of both**, once now and after any change to the set-up:

```powershell
$env:RESTORE_TEST_SERVER_URL = "postgres://postgres@127.0.0.1:5432/postgres"
$env:PGPASSWORD = Read-Host "The postgres password"
$env:SOURCE_DATABASE_URL = "postgres://postgres@127.0.0.1:5432/dcrs"
npm run db:restore-test
$env:SOURCE_DATABASE_URL = "postgres://postgres@127.0.0.1:5432/mitra"
npm run db:restore-test -- --mitra
Remove-Item Env:PGPASSWORD
```

Each restores its newest backup into a throwaway database of its own, checks every table's rows against the database
it came from, and drops it again; each ends with `RESULT: PASSED`.

The whole path was rehearsed on 10-Oct-2026 on two throwaway PostgreSQL 18 servers standing for 5433 and 5432
(steps 1 to 7, with real rows in both applications' databases): every table's rows the same after each move, the
Database overview reading as `overview_viewer` after step 4, both backups written and both restore tests passed.

## Backup instructions

> **Once DCRS shares its database with the Audit Assistant** (REQUIREMENTS §83), back up and restore with
> [Backups of the shared database](#backups-of-the-shared-database) below instead: a plain `pg_restore` into a new database
> leaves out the database's own grants and the roles, and the assistant could not start on the result.

Back up the PostgreSQL database with PostgreSQL's own tools:

```bash
pg_dump --format=custom --file=dcrs-$(date +%F).dump "$DATABASE_URL"
# restore into an empty database:
pg_restore --clean --if-exists --dbname="$DATABASE_URL" dcrs-2026-09-17.dump
```

For the built-in local database, the same tools (from any PostgreSQL 18 client installation — the
embedded package ships only the server) work against
`postgres://postgres:<backend/data/postgres-password>@127.0.0.1:5433/dcrs`; or run `npm run db:stop`
and copy `backend/data/postgres/` as a whole.

Pages left open during a restore notice that the database went back (their copy is newer than it) and
load the app again from the restored data; nothing they held is written over it.

## Reset-demo instructions

- **In-app** (preferred): Demo Mode page → "Clear All Demo Data" button. This deletes every
  record with `isDemo: true` and leaves Live data untouched (see DATA_MODEL.md's Demo/Live
  integrity guarantee).
- **Full reset** (wipes Live data too — used for a clean pilot start): in PostgreSQL,
  `TRUNCATE app_storage;` (accounts stay). The app reseeds master/document/historical data the next
  time somebody signs in (`frontend/src/data/bootstrap.ts`). Pages left open notice within a few
  seconds and load again from the emptied database; none of them writes its old copy back.

## Environment configuration

Everything except the assistant works with no environment variables at all — sensible defaults
apply and a session secret is generated for you on first run. The assistant (Mitra: fill / navigate /
reply, its agent and tools, the microphone and its voice — see README.md) needs an AI key: since
REQUIREMENTS §109 the owner's ChatGPT (OpenAI) key, `CHATGPT_API_KEY`, the one AI setting in
`backend/.env`, which serves both apps (the Mitra server takes the AI settings from that file through
its `DCRS_ENV_FILE` when its own environment has no OpenAI key). Without a key every other screen still
works, and Mitra answers from the system's own records and says so (§72). `backend/.env.example` names
every AI setting; no one prints, logs or commits `backend/.env` itself — programs load it.

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `CHATGPT_API_KEY` (or `OPENAI_API_KEY`) | none (no model without a key) | `backend/ai.ts` | The owner's ChatGPT (OpenAI) key (REQUIREMENTS §109); `CHATGPT_API_KEY` is read first. When set, every AI call goes to api.openai.com — the chat, Mitra's agent and its tools, the checklist, the CV reader, pictures, the microphone and the voice — and nothing calls Groq. Never reaches the browser, an answer or a log line (a service's error that echoes it is cleaned first). `scripts/run-e2e.ts` and `scripts/unit-tests.ts` blank both names, and `GROQ_API_KEY`, so no test makes a paid call. |
| `AI_CHAT_MODEL` | `gpt-5.4-mini` | `backend/ai.ts` | The chat, the answers about history (§75) and the CV reader. A gpt-5.4 (or later) model is sent `reasoning_effort: "none"` — with any other effort it refuses tools on chat completions (measured 12-Oct-2026) — gpt-5, -mini and -nano `"minimal"`, gpt-4.1 and gpt-4o nothing; always `max_completion_tokens`, never `max_tokens`. |
| `AI_AGENT_MODEL` | `AI_CHAT_MODEL` | `backend/ai.ts`, `backend/mitraAgent.ts` | Mitra's agent: the tool-calling loop behind `POST /api/assistant/agent` (§80). |
| `AI_SHORT_MODEL` | `gpt-5.4-nano` | `backend/ai.ts` | Short jobs: a checklist answer read into its four fields. |
| `AI_VISION_MODEL` | `gpt-5.4-mini` | `backend/ai.ts`, `backend/attachments.ts` | The words in a picture attached to Mitra, sent as an `image_url` data URL (a PNG, JPEG, WEBP or GIF of up to 10 MB); any other picture, or one the model cannot read, goes to OCR. |
| `AI_FALLBACK_MODEL` | `gpt-4.1-mini` | `backend/ai.ts` | Asked once when the first model cannot answer: it refused the request (400), is not on the account (403, 404: then skipped for ten minutes) or failed on OpenAI's side (5xx). Not for a wrong key (401), an account out of credit (429 `insufficient_quota`) or no answer at all. `none`: no second model. A parameter a model refuses by name (`temperature`) is learnt once and left out of its later requests. |
| `AI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | `backend/ai.ts` | The microphone (`POST /api/assistant/transcribe`): English, Hindi and Gujarati, the plant's words as its hint. A `whisper-*` model is asked for `verbose_json`. |
| `AI_TTS_MODEL` | `gpt-4o-mini-tts` | `backend/ai.ts`, `backend/tts.ts` | Mitra's natural voice (§81, §85) through `POST /api/assistant/speak`: the whole line in one call, as a WAV, told the line's language by its script (English with an Indian accent, Hindi, Gujarati). The browser still speaks first where it has a natural Indian voice (§89). A model the key's project cannot use: `GET /api/assistant/speak` says so (asked once, remembered for 10 minutes), no line is sent, and the browser speaks with its own most human voice. |
| `AI_TTS_VOICE_FEMALE` / `AI_TTS_VOICE_MALE` | `coral` / `ash` | `backend/ai.ts` | The two voices a person chooses between (Master Data → Working Hours & Briefing). OpenAI's voices include alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer and verse. |
| `GEMINI_API_KEY` | none | `backend/geminiSpeech.ts` | Mitra's FREE natural voice (REQUIREMENTS §121): a Google AI Studio key (aistudio.google.com → Get API key; a Google account, no card). Set, Mitra's spoken lines in English, Hindi and Gujarati are made by Google's Gemini voice first, the paid ChatGPT voice only when Gemini cannot (its free allowance used, no internet). Google may use the words sent on its free tier to improve its products: the owner's decision. `scripts/run-e2e.ts` and `scripts/unit-tests.ts` blank it. |
| `GEMINI_TTS_MODEL` | `gemini-3.8-flash-tts` | `backend/geminiSpeech.ts` | Gemini's speech model. |
| `GEMINI_TTS_VOICE_FEMALE` / `GEMINI_TTS_VOICE_MALE` | `Sulafat` / `Achird` | `backend/geminiSpeech.ts` | Mitra's two Gemini voices ("warm", "friendly" in Google's list of its 30 voices). |
| `AI_TTS_PAID` | off | `backend/ai.ts` | REQUIREMENTS §122: the PAID ChatGPT voice (gpt-4o-mini-tts, billed by the minute) may speak only when this is `1`/`on`/`true`/`yes`. Off — the default — Mitra speaks with free voices alone: the browser's natural ones (Edge), Google's free Gemini voice (`GEMINI_API_KEY`) or Groq's free English one; with only a ChatGPT key, `GET /api/assistant/speak` says what to set. |
| `AI_DAILY_TOKEN_BUDGET` | `3000000` (on Groq `GROQ_DAILY_TOKEN_BUDGET`, else `200000`) | `backend/ai.ts`, `backend/index.ts` | THE COST GUARD (OpenAI is paid by the token): the plant's AI tokens a day, counted on this server per day on the plant's clock, in memory (a restart starts the count again) — what each answer and transcription reports, and an estimate for speech. At 90% the chat and the agent stop asking the model and answer from the records, saying why (REQUIREMENTS §75); at 100% no call is made until the next day. The server's log says each once, in plain words; the super admin reads the day's count at `GET /api/assistant/usage`. The Mitra server counts its own calls. |
| `ALLOW_SIGNUP` | unset (`off`) | `backend/features.ts`, `backend/index.ts` | Nobody creates their own account (REQUIREMENTS §66): the administrator makes them on Users & Access, and `POST /api/auth/signup` answers 403. Set to `1` only for the Playwright suites (`scripts/run-e2e.ts` sets it) or for ONE start that makes a first administrator on an empty database with `SEED_ACCOUNTS=0`. |
| `DEMO_MODE` | unset (`off`) | `backend/features.ts`, sent to the browser with the signed-in account | Demo Mode is NOT part of the portal (REQUIREMENTS §65): without this there is no switch, no page and no `#/demo` route, and the demo records an earlier version left behind are removed at the next start-up. Set to `1` only to demonstrate the system or to run the Playwright suites (`scripts/run-e2e.ts` sets it for its own server). **Take a backup before the first start without it** — that start-up removes the demo records, and it is not undone. |
| `CV_READ_WITH_ASSISTANT` | on (when an AI key is set) | `backend/index.ts`, `backend/cvExtract.ts` | Set to `0` to read uploaded CVs with the text rules alone, so no CV text is sent to the AI service. The test run sets it. |
| `PICTURES_READ_WITH_ASSISTANT` | on (with the ChatGPT key) | `backend/attachments.ts`, `backend/index.ts` | Set to `0` to read a picture attached to Mitra by OCR alone, so no picture is sent to OpenAI. A person over the assistant's throttle has theirs read by OCR. The test run sets it. |
| `MITRA_OCR` | on | `backend/attachments.ts` | Set to `0` to switch off reading the words in an attached picture by OCR (tesseract.js, English + Gujarati): the way a picture is read with no ChatGPT key, and whenever the model cannot read one. The unit-test run sets it. |
| `MITRA_OCR_LANG_PATH` | jsDelivr (downloaded once) | `backend/attachments.ts` | The first picture read downloads the `eng` and `guj` language data (about 15 MB) into `backend/data/ocr` and keeps it. An offline plant points this at a folder or URL holding `eng.traineddata.gz` and `guj.traineddata.gz` instead. |
| `GROQ_API_KEY` | none | `backend/ai.ts` | An older setup with no OpenAI key, ignored whenever one is set: Groq answers as before §109, with its own settings — `GROQ_MODEL` (`openai/gpt-oss-120b`; check `GET https://api.groq.com/openai/v1/models` with the key first, not every model in Groq's docs is enabled per account), `GROQ_AGENT_MODEL` (`GROQ_MODEL`), Whisper `whisper-large-v3` for the microphone, `GROQ_TTS_MODEL` (`canopylabs/orpheus-v1-english`, English only, its terms accepted once by the Groq organisation's admin at console.groq.com), `GROQ_TTS_VOICE_FEMALE` / `_MALE` (`hannah` / `daniel`) and `GROQ_DAILY_TOKEN_BUDGET` (`200000`, its free tier, with 8,000 tokens a minute). Pictures are read by OCR. |
| `PORT` | `5173` | `frontend/scripts/dev-server.ts` | Frontend dev server port |
| `API_PORT` | `4000` | `backend/index.ts`, dev proxy | Auth API port |
| `JWT_SECRET` | auto-generated, saved to `backend/data/jwt-secret.txt` | `backend/auth.ts` | Session-signing key |
| `FORCE_HTTPS` | unset (`off`) | `backend/index.ts` | Set to `1` to mark the session cookie `Secure` (only do this if actually served over HTTPS, e.g. behind a reverse proxy) |
| `PLANT_TIMEZONE` | `Asia/Kolkata` | `backend/db.ts` | The plant's own clock for "today", "this month" and a person's active days in the Activity Log, which PostgreSQL counts by casting a moment to a date in the connection's time zone. A hosted database usually runs in UTC, where everything done before 05:30 would count on the day before (REQUIREMENTS §75). Only a plain zone name is accepted. |
| `JOBS` | on | `backend/jobs.ts` | The server's own schedule (REQUIREMENTS §75, §97): the daily escalation to the super admin, the weekly digest, the morning prepare and the notify job, on the plant's clock (`PLANT_TIMEZONE`). Set to `0` to switch them all off; `scripts/run-e2e.ts` does, because the suites run on the real clock. Each run of the first three is claimed in `job_runs`, so several servers on one database run it once; notify takes a lock instead (one server at a time). The super admin runs any of them at once with `POST /api/jobs/run`. |
| `ESCALATION_AT` | `10:00` | `backend/jobs.ts` | Plant time of the daily escalation, working days only (the master data's weekly off and holidays). A server started later catches up the same day. |
| `DIGEST_AT` | `09:00` | `backend/jobs.ts` | Plant time of the weekly digest on the first working day of each ISO week, covering the week before; a later working day of the same week catches it up. |
| `PREPARE_AT` | `08:30` | `backend/notificationJobs.ts`, `backend/jobs.ts` | Plant time of the morning prepare (REQUIREMENTS §97) on each working day: the day's records made and prepared on the server (the known parts only, never a reading), whether or not anybody opens the website; a server started later does it at once. Also the first push slot of the day and the super admin's morning summary. |
| `NOTIFY_EVERY_MS` | `300000` (5 minutes) | `backend/notificationJobs.ts`, `backend/jobs.ts` | How often the notify job runs, from `PREPARE_AT` to the close of the plant's hours on working days: each person's notifications brought up to date and pushed. At least 10 seconds; the jobs' clock looks once a minute. |
| `PUSH_ENABLED` | on | `backend/push.ts` | Set to `0` to send no pushes to the phones (the notifications still reach the bell and the phone's inbox). With no phone registered nothing is sent anyway. |
| `EXPO_ACCESS_TOKEN` | none | `backend/push.ts` | Only when "Enhanced Security for Push Notifications" is switched on for the Mitra project at expo.dev: an access token of the Expo account, sent with every push. Never written in a log. |
| `PUSH_SERVICE_URL` | `https://exp.host/--/api/v2/push` | `backend/push.ts` | Where the pushes are sent. Leave it unset; a test points it at a stand-in of its own. |
| `ESCALATION_EMAIL` | none (the active administrators) | `backend/escalation.ts` | Where escalations and the weekly digest are emailed, when `GMAIL_USER`/`GMAIL_APP_PASSWORD` are set: one address or several separated by commas. `.local` addresses are skipped — the seeded super admin's is one, so the app (bell, day's notification, Performance page) is the channel. |
| `ACTIVITY_ARCHIVE_AFTER_YEARS` | `3` | `backend/activityArchive.ts` | How old (whole years, 1–10) a line of the Activity Log must be before the page OFFERS to archive it. Nothing is ever archived by itself: the super admin picks 1–10 years, sees how many lines and from when to when, and confirms (REQUIREMENTS §75). Three years is the plant's own: the Master List of Formats & Records (F/SYS/02) retains its records three years — 133 of its 141 formats are then shredded, the master lists maintained as updated (§76). |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | none (no email is sent) | `backend/email.ts` | The plant's own Gmail account and its App Password (16 letters, made in the Google account with 2-Step Verification on; see "Reminder emails" below): the FREE way DCRS sends the reminder emails, and the escalations and the weekly digest to `ESCALATION_EMAIL`. Both are needed; without them nothing is sent and the Notifications page says so. Sent through nodemailer's pooled connection to Gmail, one connection, at most one message a second, from "Gujarat Print Pack Publications Pvt Ltd - DCRS" <`GMAIL_USER`> (the company's name from the seed), with a text and an HTML part and no attachment. Never printed, logged or committed. `scripts/run-e2e.ts` and `scripts/unit-tests.ts` blank both. |
| `EMAIL_ENABLED` | on | `backend/emailReminders.ts` | Set to `0` (or `off`) to send no reminder email from this server, whatever the super admin's switch on the Notifications page says. The test email is held back too. |
| `EMAIL_DAILY_CAP` | `150` | `backend/emailReminders.ts` | The most reminder emails (test emails included) the plant sends in one day, a whole number from 1 to 2000: well inside a free Gmail account's own limit of about 500 a day. Past it the rest wait for the next slot, said in the notify job's line. Each person gets at most three a day whatever it says. |
| `EMAIL_TRANSPORT` | unset (Gmail) | `backend/email.ts` | `capture`: no email leaves this PC. Each is kept in the email log instead (state `captured`, its text with it), for a look at what would be sent before it is; the Notifications page says the server is in capture mode. `scripts/run-e2e.ts` sets it for every test server. |
| `DCRS_WORKING_HOURS` | on | `backend/workingHours.ts` | The plant's working hours (REQUIREMENTS §84): every account but the super admin may use DCRS only on a working day of the company calendar, between the two times in Master Data → Working Hours (8:40 am to 6:20 pm unless changed), and every session ends at the close of its day. Set to `off` to switch the rule off — the e2e runner's test servers do, and so can a developer who must work as a member of staff at night. |
| `DCRS_MAX_DEVICES` | `2` | `backend/deviceSessions.ts` | The most devices an account may be signed in on at once (REQUIREMENTS §106): a whole number from 1 to 50, or `off` (or `0`) for no limit. A device that signs in again takes its own place; one more device is refused with the devices named and since when, until one is signed out (by the person, or by the super admin on User access). The super admin is never held to it. The e2e runner's test servers set `off`. |
| `MITRA_SERVER_KEY` | none | `backend/deviceSessions.ts` | The secret the Mitra server proves itself with (REQUIREMENTS §106): set the SAME value in the Mitra server's `server\.env`. At least 16 characters (make one with `node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"`). With it, a phone's sign-in through Mitra is listed on User access by the phone's own name, model and address; without it, as a mobile phone on the Mitra phone app that is not named ("A phone - its name is not known"), at the Mitra server's address. Compared in constant time; never logged, never in an answer. Keep it private like `JWT_SECRET`. |
| `OVERVIEW_DATABASE_URL` | none: DCRS's own connection, as `overview_viewer` | `backend/overviewRoutes.ts`, `backend/overviewSetup.ts` | The super admin's read-only **Database overview** (REQUIREMENTS §83, §107). Not needed: without it DCRS reads the overview through its own connection, each read in a read-only transaction that becomes the role `overview_viewer` first, and at start-up sets the overview up itself when its database role may (a superuser, or CREATEROLE with CREATE on the database); when it may not, the page says the one step (`npm run db:shared -- setup` once, as a superuser). Set it only to read through a login of the viewer's own instead, e.g. `postgres://overview_viewer:<password>@127.0.0.1:5433/dcrs`, as before. See docs/database/README.md. |
| `DCRS_APP_URL` | the request's own address | `backend/apiV1.ts`, `backend/emailReminders.ts` | The app's address as people reach it, for the links the DCRS API hands the Audit Assistant (e.g. `http://dcrs-host:4000`), and for the one link in each reminder email (`<DCRS_APP_URL>/#/notifications`). Unset, the emails carry no link and say to open DCRS and its bell instead. |
| `MITRA_EXPO_PORT` | `8081` | `backend/phoneApp.ts` | Where Expo's server for Expo Go listens on this PC: the port in the QR code of "Mitra on your phone" on the Ask Mitra page (`GET /api/phone-app`, which also says whether it is running). See [phone-app-setup.md](phone-app-setup.md). |
| `MITRA_SERVER_PORT` | `3000` | `backend/phoneApp.ts` | Where the Mitra server listens on this PC, for the same card. The app on the phones looks for it on 3000. |
| `DCRS_PDF_BROWSER` | Chrome, then Edge, in their usual places | `backend/pdfReport.ts` | The browser that prints the daily pest control report as a PDF for the Audit Assistant (`GET /api/v1/pest-control/daily-report`). Set it only when Chrome or Edge is installed somewhere unusual. The app must be built (`npm run build`). |
| `BACKUP_DATABASE_URL` | `DATABASE_URL`, else the built-in local database | `scripts/database/backup.ts` | The database `npm run db:backup` saves. When DCRS signs in with a role of its own that is not a superuser, point this at a separate backup role (see "Backups of the shared database"). |
| `MITRA_DATABASE_URL` | none (Mitra's database is not backed up here) | `scripts/database/backup.ts` | Mitra's own database (REQUIREMENTS §107), for example `postgres://dcrs_backup:<password>@127.0.0.1:5432/mitra`: `npm run db:backup` then writes `mitra-<date>-<time>.dump` beside DCRS's, kept the same 14 days, and `npm run db:restore-test -- --mitra` tests it. See "Both applications on one PostgreSQL server". |
| `BACKUP_DIR` | `backend/data/backups` | `scripts/database/backup.ts` | Where the backups go; best on another disk or a network share. |
| `PG_BIN` | on `PATH`, then `C:\Program Files\PostgreSQL\<newest>\bin` | `scripts/database/*.ts` | Where PostgreSQL's own tools (`pg_dump`, `pg_restore`, `pg_dumpall`) are. |

In `backend/.env`, one `KEY=value` per line. A value may be wrapped in `"…"` or `'…'`, and an
unquoted value ends at a ` # comment` — so the commented layout README.md shows works as written.
A real environment variable always wins over the file.

## Push notifications (REQUIREMENTS §97)

**What runs by itself.** On each working day DCRS prepares the day's records at `PREPARE_AT` (08:30) and then, every five
minutes until the close of the plant's hours, works out what each person should be told and pushes it to their phones.
Nothing needs to be switched on: `JOBS` and `PUSH_ENABLED` are on unless set to `0`. The super admin can run either job at
once from the website: Notifications (the bell's "See all"), "The server's jobs", **Prepare today's records now** or
**Send the notifications now**; the page says what was done. (Behind the buttons: `POST /api/jobs/run` with
`{"job": "morning-prepare"}` or `{"job": "notify"}`, the super admin's alone.) The jobs' lines are in
the activity log ("Records prepared by the assistant", in the system's name) and in the server's own output (`[jobs]`,
`[push]`: counts only, never a phone's token).

**What the phones need.** Pushes reach a phone that runs the Mitra app build 1.1.0 or later (not Expo Go: it cannot
receive pushes on Android), whose person allowed notifications. Android phones need Google's Firebase Cloud Messaging,
which is free. Until the steps below are done, Mitra still works on the phone: its inbox, its Tasks and its own daily
reminders; only the alerts that arrive with the app closed wait. iPhones need a paid Apple developer account for those
alerts, which the plant does not have: they get the inbox and the app's own reminders.

**The owner's steps, once (about 15 minutes, in a browser):**
1. Open https://console.firebase.google.com and sign in with the company's Google account. Choose **Create a project**,
   name it **Mitra**, and leave Google Analytics off. It is free (the Spark plan).
2. In the new project, choose **Add app**, then the **Android** icon. For **Android package name** type exactly
   `com.pouchwale.mitra`; the nickname can be **Mitra**. Choose **Register app**, then **Download google-services.json**.
   Send that file to the developer: it goes beside the phone app's code, and the next build of the app uses it. It is a
   setting, not a password.
3. Still in Firebase: the gear icon, **Project settings**, then the **Service accounts** tab, then **Generate new private
   key**, and confirm. A file ending in `.json` downloads. **This one IS a key: do not email it, do not put it in a chat
   or in the code.**
4. Open https://expo.dev, sign in with the account that owns the Mitra project (`parth2005s-team`), open the project
   **mitra**, then **Credentials** in the project's menu, then **Android**, then `com.pouchwale.mitra`. Under
   **FCM V1 service account key** choose **Add a service account key** and upload the file from step 3. Then delete that
   file from the computer's Downloads folder.
5. Tell the developer it is done. The Android app 1.1.0 is built with the file from step 2 and installed on the phones.
   On each phone: open Mitra, sign in, allow notifications when asked, then **Settings, Notifications, Send me a test
   notification**. "Test notification" should appear within a few seconds, even with Mitra closed.

**If a phone gets nothing.** In Mitra, Settings, Notifications says whether push is on for that phone and why not. "Send
me a test notification" says in words what went wrong ("The push credentials are not set up yet" means step 4; "This
phone is no longer registered" means open Mitra on it again). A phone that was reset or had Mitra removed is forgotten
by DCRS by itself and registers again when Mitra is opened.

## Reminder emails (the owner, 25-Oct-2026)

The owner: "i want a system that will email the users automatically for the updates on their given email id's for the free
of cost ... and system will remind the user again and again until he or she complete his tasks."

**What runs by itself.** The notify job (every five minutes on a working day, `backend/notificationJobs.ts`) ends by
emailing each person who has a reminder email what is still open for them: one email in each of the day's three slots,
the morning (the first run after the plant opens, 08:40), the "Still open" one at 15:30 and the "Last call" at 17:45, never
on the weekly off or a holiday and never outside the plant's hours. The email lists, in the person's language (English,
Gujarati or Hindi), what is overdue, sent back, to fill and submit, to verify and, in the morning, coming up: one line per
record, with the format number, the name and the date (24-10-26). Nothing open, no email: that is how the reminders stop
when the work is done. Never a record's readings or a send-back's reason (the mail passes through Gmail), and never the
sign-in address (name.surname@gpp.local receives no mail). A server started late sends only the slot that has begun, not
the ones it missed. Each email is claimed in `email_log` before it is sent, so nobody gets one twice; one that fails is
tried again at most twice in the same slot. The job's line, the activity log ("Reminder emails sent", in the System's name,
for the super admin's eyes only) and the Notifications page say what went, to whom by name, never to which address.

**The owner's steps, once (free of cost, about 15 minutes):**
1. Make a Gmail account for the plant (for example the plant's own name at gmail.com): DCRS sends from it, and the
   people see it as "Gujarat Print Pack Publications Pvt Ltd - DCRS". A personal Gmail account works too, but a plant
   account keeps the reminders apart from anybody's own mail.
2. Sign in to it at https://myaccount.google.com, choose **Security**, and switch on **2-Step Verification** (Google asks
   for a phone number once). An App Password needs it.
3. Still in **Security** (or at https://myaccount.google.com/apppasswords), make an **App Password**: name it `DCRS`,
   choose **Create**, and copy the 16 letters it shows. **It is a password: do not email it, chat it or put it in any
   file but `backend/.env`.** It opens the plant's mailbox to whoever holds it (DCRS uses it only to send); it can be
   removed on the same page at any time, which stops DCRS sending until a new one is set.
4. On the DCRS computer, open `backend/.env` in Notepad and add two lines (the 16 letters without spaces):
   `GMAIL_USER=<the plant's Gmail address>` and `GMAIL_APP_PASSWORD=<the 16 letters>`. Add
   `DCRS_APP_URL=http://<this PC's address>:4000` too (the address the laptops open, "On the company network" in the
   server's first lines), so each email carries a link straight to the person's notifications. Save.
5. Restart DCRS (close it and start it again: `npm start`, or the plant's start script).
6. Sign in as the super admin, open **Users & Access**, and in each person's row under **Reminder email** choose
   **Add**: type the person's own email address (the one they read on their phone), choose the language of the emails,
   and **Save**. A DCRS sign-in (name.surname@gpp.local) is refused: it receives no mail. Do your own row too.
7. Open **Notifications** (the bell's "See all"): under **The server's jobs**, **Reminder emails** says how mail goes on
   this server. Press **Send me a test email**: it goes to your own reminder email and should arrive within a minute
   (look in Spam the first time, and mark it "Not spam"). Then switch **Reminder emails** on.

**If an email does not arrive.** "Send me a test email" says in words what went wrong: "Gmail did not accept the sign-in"
means step 3 or 4 (the App Password copied wrong, or 2-Step Verification switched off, which removes App Passwords);
"Gmail could not be reached" means the PC has no internet just then. A person whose emails fail shows "The last email
failed" in their row on Users & Access. `EMAIL_ENABLED=0` in `backend/.env` stops every reminder email at once; the switch
on the Notifications page does the same without a restart.

## A note on the build toolchain (why esbuild, not Vite)

This prototype was built inside a sandboxed cloud environment whose network egress was locked
down to Anthropic's own infrastructure — `registry.npmjs.org`, `pypi.org`, and every CDN
(unpkg, jsdelivr, cdnjs, esm.sh) all returned `403` at the network layer. `npm create vite`,
`npm install tailwindcss`, `npm install react-router-dom`, and `pip install xlrd` were all
attempted and all blocked; this is recorded here for transparency, not as an excuse — the
resulting app is fully functional and was thoroughly tested (see TESTING.md).

What *was* available locally (pre-installed, not fetched): React 19.2.6, ReactDOM 19.2.6,
react-icons, TypeScript 6.0.3, and — nested inside the `tsx` package — esbuild 0.27.7. The build
was assembled from those:

| Master-brief preference | What was used instead | Why | How to switch back |
|---|---|---|---|
| Vite | esbuild (`frontend/scripts/build.ts`, `frontend/scripts/dev-server.ts`) | Vite's installer needed the npm registry | `npm create vite@latest` in a networked environment, then move `frontend/src/` in; esbuild output is already Vite-shaped (single JS + CSS bundle) |
| Tailwind CSS | Hand-written CSS design system (`frontend/src/styles.css`) | Tailwind CLI/PostCSS packages weren't installed and couldn't be fetched | `npm install -D tailwindcss postcss autoprefixer`, run `npx tailwindcss init`, then progressively replace the `.btn`/`.card`/`.badge` utility classes in `styles.css` with Tailwind `@apply` rules — the class *names* used throughout the components can stay as-is if you define them as Tailwind component classes |
| react-router-dom | A ~70-line hash router (`frontend/src/store/router.tsx`) | Not installed / not fetchable | `npm install react-router-dom`, swap `RouterProvider`/`useRouter`/`Link` for the real ones (same three exports, similar API) |
| Zustand / Redux | React Context + a `version`/`bump()` counter (`frontend/src/store/AppStore.tsx`) | Not installed / not fetchable | Optional — the current approach works fine at this data scale; swap in Zustand only if the app grows enough that whole-tree re-renders become a measurable problem |
| date-fns | Hand-written date helpers (`frontend/src/utils/date.ts`) | Not installed / not fetchable | Optional swap, mechanical |

None of these substitutions touch the architecture the brief asked for (component structure, the
document-template registry, the data/engine layering) — they are all "install a package and
replace one small module" swaps, each isolated to the single file named above.

## TypeScript checking

This no longer needs a workaround: `@types/react` and `@types/react-dom` are installed
(`npm install` — this project isn't built in the original network-locked sandbox described above
any more), and `npm run typecheck` passes with zero errors. `tsconfig.json`'s `target`/`lib` were
bumped from `ES2020` to `ES2022` to match `Array.prototype.at()` calls already present in
`ServiceReportRecordView.tsx` and `GapPage.tsx` (harmless at runtime under the old setting since
`.at()` is a method call esbuild doesn't need to transpile, but `tsc` correctly flagged it as
missing from the declared `lib`).

## Backups of the shared database

(REQUIREMENTS §83.) DCRS and the Audit Assistant keep their data in one PostgreSQL database: DCRS's
tables in the schema `public`, the Audit Assistant's in `chatbot`, and the readable views in
`overview` (see docs/database/README.md). One backup holds all three. With `MITRA_DATABASE_URL` set, the same run
also backs up the Mitra server's own database (REQUIREMENTS §107): see "Mitra's database" below.

**What a backup is.** `npm run db:backup` (`scripts/database/backup.ts`) writes two files. The two
together are one backup:

- `dcrs-<date>-<time>.dump`, for example `dcrs-2026-09-30-2030.dump`: the whole database, made with
  `pg_dump --format=custom`. Every schema, table, row and view of both applications, who owns each,
  and who may read what. It also holds the database's own grants, such as the Audit Assistant's right
  to create its schema.
- `roles-<date>-<time>.sql`: the server's roles (its sign-ins and groups) with their settings:
  `audit_assistant`, `overview_viewer`, `overview_owner`, the one DCRS signs in with, and any others.
  It is made with `pg_dumpall --roles-only --no-role-passwords`. A dump holds no roles, but its owners
  and grants name them, so on a new server the roles must be made first. This file holds **no
  passwords**.

The dump holds everything, including the accounts' password hashes, people's chats with the Audit
Assistant and the files it handed out. Keep backups as private as the database itself.

**Which database.** The backup takes, in this order: `BACKUP_DATABASE_URL`; else `DATABASE_URL` (the
database DCRS uses); else this computer's own local database (port 5433, found the way DCRS finds
it). Each may be set in `backend/.env`. The role it signs in with must be able to read both
applications' tables. A superuser can; the local database's `postgres` is one. DCRS's own role
cannot, when DCRS signs in with a role of its own: it has no access to the Audit Assistant's tables,
and the backup stops with "permission denied for schema chatbot". Then make a role for backups only,
and set `BACKUP_DATABASE_URL` to it:

```sql
CREATE ROLE dcrs_backup LOGIN PASSWORD '<a new password>';
GRANT pg_read_all_data TO dcrs_backup;   -- may read everything, may change nothing
```

Do not give `pg_read_all_data` to DCRS's own role: DCRS could then read the Audit Assistant's chats.

**The tools.** PostgreSQL's own `pg_dump`, `pg_dumpall` and `pg_restore`, version 18 (never older than
the server). The backup takes them from the folder `PG_BIN` names, else from `PATH`, else from
`C:\Program Files\PostgreSQL\<version>\bin`, the newest version first. The database DCRS starts by
itself does not include them: on a computer without them, install PostgreSQL 18's "Command Line
Tools" (a part of the PostgreSQL installer for Windows). The password goes to the tools in
`PGPASSWORD`, never on their command line, and is never printed.

**Where, and for how long.** In `backend/data/backups`, or the folder `BACKUP_DIR` names. Every
backup that works deletes its own files older than 14 days. It deletes only files named like the two
above: nothing else in the folder, and nothing at all when the backup failed. Every run adds a line
to `backup-log.txt` in the same folder: when, what, how big, and whether it worked. A backup on the
same disk as the database is lost with that disk: set `BACKUP_DIR` to another disk or a network
folder, or copy the folder somewhere else every week.

**Every evening, by itself.** On Windows, `scripts/database/schedule-backup.ps1` registers a
Scheduled Task that runs the backup every day at 20:30. Run it in the DCRS folder, as the Windows
user the backup should run as:

```powershell
# see what it would register; registers nothing
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\database\schedule-backup.ps1 -WhatIf
# register it (run it again to change it; add -At 21:00 for another time)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\database\schedule-backup.ps1
```

The task runs whether or not anyone is signed in to Windows, without storing a password and without
opening a window. It runs on battery too, and if the computer was off at 20:30 it runs as soon as the
computer is on again. It reads its settings from `backend/.env`. If Windows refuses to register it
("access is denied"), run PowerShell as an administrator, or add `-OnlyWhenSignedIn`. Look at
`backup-log.txt` now and then. To remove the task: `Unregister-ScheduledTask -TaskName "DCRS database
backup"`.

**Restoring**, on a new server or after the database was lost. Each step as a superuser (add
`-h <server>` when the server is another computer):

1. Stop DCRS and the Audit Assistant.
2. The roles first: `psql -U postgres -d postgres -f roles-2026-09-30-2030.sql`. For a role the
   server already has, psql says so ("role "postgres" already exists") and sets its options back to
   what they were at the backup. That is expected.
3. Then the database: `pg_restore -U postgres --create --dbname=postgres dcrs-2026-09-30-2030.dump`.
   `--create` makes the database with its original name AND its own grants. Without `--create`, the
   Audit Assistant loses its right to create its schema and does not start ("permission denied for
   database"; tried on a copy on 30-Sep-2026). A database of that name must not exist yet. If the old
   one is still there, rename it out of the way first (`ALTER DATABASE dcrs RENAME TO
   dcrs_before_restore;`), and drop it once all is well.
4. Set the passwords again. The roles file carries none, so the login roles it made cannot sign in
   yet:
   ```sql
   ALTER ROLE audit_assistant PASSWORD '<its password>';
   ALTER ROLE overview_viewer PASSWORD '<its password>';
   ```
   (or `\password audit_assistant` in psql). If DCRS signs in with a role of its own, or backups with
   `dcrs_backup`, and the roles file made those, set their passwords too.
5. Start DCRS, then the Audit Assistant.

On the same server, with the roles still there, step 2 may be left out. The "Backup instructions"
further up are for a database without the Audit Assistant; with its schema in the database, restore
as described here.

**Mitra's database** (REQUIREMENTS §107). When `MITRA_DATABASE_URL` names it ("Both applications on one PostgreSQL
server", step 6), each backup is three files: the two above and `mitra-<date>-<time>.dump`, Mitra's whole database
made with `pg_dump --format=custom`, kept the same 14 days. The roles file is the server's, so it holds Mitra's role
too. If Mitra's dump fails, the run fails, keeps DCRS's two files and deletes nothing older. To restore it on a new
server: the roles file first (as above), then `pg_restore -U postgres --create --dbname=postgres
mitra-2026-10-10-2030.dump`, then `ALTER ROLE mitra PASSWORD '<its password>';` (or `\password mitra`), and start
the Mitra server. `npm run db:restore-test -- --mitra` tests the newest one, as below.

**Testing a restore.** `npm run db:restore-test` restores the newest backup (or
`npm run db:restore-test -- <dump file>`), checks it, and removes it again. It needs:

- `RESTORE_TEST_SERVER_URL`: a superuser's address on the server to restore into, for example
  `postgres://postgres:<password>@127.0.0.1:5432/postgres`. It may be the live server. The test makes
  a database of its own there, named `restore_test_<date>_<time>_<four characters>`, drops it at the
  end, and never touches any other database.
- `SOURCE_DATABASE_URL` (may be left out): the database the backup came from, to compare the number
  of rows in every table. Run the test straight after a backup: later, people will have added rows,
  and the numbers will differ.

Before it restores, the test makes the roles the server lacks from the roles file beside the dump,
and drops them again at the end. A role the server already has is left exactly as it is. The test
gives its database the dump's own grants, as `--create` would. It then checks, and says OK or FAILED
for each:

- the restore ran without an error;
- the schemas `public`, `chatbot` and `overview` are there;
- every table is there, with as many rows as in the source;
- every overview view answers when read as `overview_viewer`;
- `audit_assistant` still cannot read any of DCRS's tables, nor the overview views;
- `audit_assistant` can still create its schema, as the Audit Assistant does at every start.

It ends with `RESULT: PASSED` or `RESULT: FAILED`. Run it once when the backups are set up, and again
after any change to the database's setup. (On 30-Sep-2026 it passed on throwaway copies: restoring
into the same server, and into a new server that had none of the three shared-database roles.)
