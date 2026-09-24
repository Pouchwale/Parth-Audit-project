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
in `backend/` to be running for signup/login to work — see **Accounts / Authentication** below.
`npm start` is the simplest way to run both as a single process for a pilot.

**Languages: TypeScript and Python only.** The frontend, the backend (`backend/*.ts`) and every build /
dev / test-runner script (`scripts/*.ts`, `frontend/scripts/*.ts`) are TypeScript; the browser tests are
Python. There is no plain JavaScript in the repository. Node runs the backend and scripts straight from
the `.ts` sources (native type stripping — **Node 23.6 or newer** is required, or 22.18+; older
versions need `--experimental-strip-types`), so there is no compile step for the server — `npm run
typecheck` type-checks frontend, backend and scripts together (`tsconfig.node.json` covers the
Node side).

## Recommended pilot deployment (internal LAN, per section 44)

1. On the target machine (needs Node.js 23.6+ — nothing else): `npm install && npm start`. This builds
   `frontend/dist/` and starts one Express process on port 4000 that serves the built frontend *and* the
   auth API from the same origin (no CORS, no second process to manage).
2. Share the LAN URL (`http://<machine-ip>:4000`) with pilot users. The first person to sign up
   becomes the `admin` account; everyone else who signs up is `staff`.
3. Set `API_PORT` to change the port, and `JWT_SECRET` if you want to pin the session-signing key
   yourself (otherwise one is generated on first run and stored in `backend/data/jwt-secret.txt` —
   see below). **Still recommended not to expose this port to the public internet as-is** — this
   is a from-scratch email/password login meant for a trusted internal LAN, not a hardened
   internet-facing auth system (no email verification, no password reset, no 2FA, no HTTPS unless
   you put a reverse proxy in front of it).
4. Because routing is hash-based (`#/dashboard`, `#/calendar`, …), no server-side URL rewriting
   is required for the frontend routes themselves — only `/api/*` needs to reach the Express
   process, which `backend/index.ts` already handles when serving `frontend/dist/` itself.

If you specifically want the old zero-backend static-only deployment (no accounts, anyone with
the URL gets straight in), that's no longer how `main.tsx` is wired — the app now gates on
`AuthProvider`. Removing that gate is a small, isolated revert (see `frontend/src/main.tsx`), not
recommended for anything beyond a quick local demo.

## Accounts / Authentication

`backend/` is a small, separate Express service that owns real user accounts — this is the one
part of the app that is no longer purely client-side:

- **Storage**: the `users` table of the PostgreSQL database (see **Database** below): id, name,
  email (unique), bcrypt password hash, role, created_at, departments.
- **Sessions**: signup/login issue a JWT (`backend/auth.ts`) in an httpOnly, `SameSite=Lax` cookie
  (`dcrs_session`, 7-day expiry). The signing secret is generated once on first run and saved to
  `backend/data/jwt-secret.txt` (gitignored) so restarts keep existing sessions valid; set
  `JWT_SECRET` yourself to control it explicitly (e.g. if you ever run more than one instance).
- **Roles**: the very first account created in a fresh database becomes `admin`; every account
  after that is `staff`. Nothing in the UI is currently gated by role — it's issued and displayed
  (a badge in the top bar) but not yet enforced anywhere (see FUTURE_ROADMAP.md).
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
reminder digest log, and all of the app's own data — the records, the document definitions, master
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
| `digest_log` | the last date a reminder digest was emailed (one row) |
| `activity_log` | the Activity Log (REQUIREMENTS §62): one line per thing a person did — `at`, `user_id`, `user_name`, `action`, `target`, `detail`, `department`, `ip`. Indexed by time, by person and time, and by department and time; its search has a trigram index (`activity_log_search_trgm_idx`) when the database account may create the `pg_trgm` extension — without that right the server logs one warning and searches unindexed (REQUIREMENTS §75) |
| `app_storage` | the app's data, one row per stored item: `scope` (`company`, or a user's id), `key` (`records`, `documents`, `master`, `hrMasterData`, `referenceEdits`, `deletions`, `live-start` for the company; `settings`, `assistant-conversations`, `sidebar-open-modules`, `sidebar-visible` for a person — no other keys are accepted), `value` (the item as JSON text), `version`, `seq`, `updated_at`, `updated_by` |

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

**Capacity.** PostgreSQL holds the data, but each browser still keeps a working copy of the whole
company's items in its `localStorage`, which browsers limit to about 5 MB of text per site. When a copy
no longer fits, nothing is overwritten in the database: a save that does not fit says so on screen,
a change from the database that does not fit is asked for again, and signing in stops with "This
browser has no room for the company's records". Clearing Demo data frees the most room. A single
stored item may be up to 25 MB (`STORAGE_MAX_BYTES` in `backend/index.ts`).

## Backup instructions

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
apply and a session secret is generated for you on first run. The assistant widget (fill / navigate
/ reply — see README.md) needs `GROQ_API_KEY`; without it every other screen still works, the widget
just shows a clear "isn't configured yet" message instead of failing silently.

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `GROQ_API_KEY` | none (assistant disabled without it) | `backend/groq.ts` | Powers the assistant. Never reaches the browser. |
| `GROQ_DAILY_TOKEN_BUDGET` | `200000` | `backend/groq.ts` | The plant's daily allowance of model tokens (Groq's free tier is 200,000 a day for the whole plant). Every answer's tokens are counted per day on the plant's clock, in memory (a restart starts the count again); at 90% of it Mitra stops asking the model and answers from the records, saying why (REQUIREMENTS §75). |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | `backend/groq.ts` | Override the model. Check `GET https://api.groq.com/openai/v1/models` with your key first — not every model name in Groq's general docs is enabled per-account (see README.md's Configuration section). |
| `ALLOW_SIGNUP` | unset (`off`) | `backend/features.ts`, `backend/index.ts` | Nobody creates their own account (REQUIREMENTS §66): the administrator makes them on Users & Access, and `POST /api/auth/signup` answers 403. Set to `1` only for the Playwright suites (`scripts/run-e2e.ts` sets it) or for ONE start that makes a first administrator on an empty database with `SEED_ACCOUNTS=0`. |
| `DEMO_MODE` | unset (`off`) | `backend/features.ts`, sent to the browser with the signed-in account | Demo Mode is NOT part of the portal (REQUIREMENTS §65): without this there is no switch, no page and no `#/demo` route, and the demo records an earlier version left behind are removed at the next start-up. Set to `1` only to demonstrate the system or to run the Playwright suites (`scripts/run-e2e.ts` sets it for its own server). **Take a backup before the first start without it** — that start-up removes the demo records, and it is not undone. |
| `CV_READ_WITH_ASSISTANT` | on (when `GROQ_API_KEY` is set) | `backend/index.ts`, `backend/cvExtract.ts` | Set to `0` to read uploaded CVs with the text rules alone, so no CV text is sent to Groq. The test run sets it. |
| `PORT` | `5173` | `frontend/scripts/dev-server.ts` | Frontend dev server port |
| `API_PORT` | `4000` | `backend/index.ts`, dev proxy | Auth API port |
| `JWT_SECRET` | auto-generated, saved to `backend/data/jwt-secret.txt` | `backend/auth.ts` | Session-signing key |
| `FORCE_HTTPS` | unset (`off`) | `backend/index.ts` | Set to `1` to mark the session cookie `Secure` (only do this if actually served over HTTPS, e.g. behind a reverse proxy) |
| `PLANT_TIMEZONE` | `Asia/Kolkata` | `backend/db.ts` | The plant's own clock for "today", "this month" and a person's active days in the Activity Log, which PostgreSQL counts by casting a moment to a date in the connection's time zone. A hosted database usually runs in UTC, where everything done before 05:30 would count on the day before (REQUIREMENTS §75). Only a plain zone name is accepted. |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | none (digest disabled) | `backend/email.ts` | The mailbox the daily reminder digest is sent from. Recipients are the employees Master Data assigns to each due record; the server accepts only single, well-formed addresses (at most 50 per digest), so the endpoint can't be used to relay mail. |

In `backend/.env`, one `KEY=value` per line. A value may be wrapped in `"…"` or `'…'`, and an
unquoted value ends at a ` # comment` — so the commented layout README.md shows works as written.
A real environment variable always wins over the file.

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
