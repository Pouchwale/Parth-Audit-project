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

- **Storage**: `backend/data/app.db`, a SQLite database via Node's built-in `node:sqlite` module
  (no native compilation, no extra dependency; Node 23.6+ as above). One `users` table: id, name,
  email (unique), bcrypt password hash, role, created_at.
- **Sessions**: signup/login issue a JWT (`backend/auth.ts`) in an httpOnly, `SameSite=Lax` cookie
  (`dcrs_session`, 7-day expiry). The signing secret is generated once on first run and saved to
  `backend/data/jwt-secret.txt` (gitignored) so restarts keep existing sessions valid; set
  `JWT_SECRET` yourself to control it explicitly (e.g. if you ever run more than one instance).
- **Roles**: the very first account created on a fresh `app.db` becomes `admin`; every account
  after that is `staff`. Nothing in the UI is currently gated by role — it's issued and displayed
  (a badge in the top bar) but not yet enforced anywhere (see FUTURE_ROADMAP.md).
- **Brute-force throttling**: a simple in-memory counter blocks an email after 8 failed logins for
  10 minutes. Resets on server restart — adequate for an internal pilot, not a substitute for a
  real WAF/rate-limiter if this is ever exposed more broadly.
- Routes: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`. In dev, `frontend/scripts/dev-server.ts` proxies `/api/*` to `backend/index.ts` so
  the frontend (5173) and API (4000) share one origin and cookies work without CORS games; in
  production, `backend/index.ts` serves `frontend/dist/` itself, so there's only one origin regardless.

**What auth does *not* cover**: the app's operational data (documents/records/master/settings)
still lives in the browser's `localStorage`, not in `app.db` — see below for why, and what
changes when that also moves server-side.

## Storage / database

This prototype stores all data in the browser's `localStorage`, namespaced under `dcrs:v1:*`
(see `frontend/src/data/storageAdapter.ts`). This was a deliberate Phase‑1 choice explicitly sanctioned by
the brief ("If database setup threatens the delivery deadline, use LocalStorage for the
prototype but structure the data service so a real database can be added later") — **and the
data service is structured exactly that way**: every read/write goes through
`frontend/src/data/repositories/*.ts`, which talk only to `IStorageAdapter`. To move to SQLite/Postgres:

1. Implement `IStorageAdapter` (4 methods: `getItem/setItem/removeItem/keys`) against your chosen
   backend, or — better, for true multi-user support — replace the *bodies* of the repository
   functions (`documentRepository`, `masterRepository`, `recordRepository`, `settingsRepository`)
   with calls to a REST/GraphQL API, keeping their exported function signatures identical.
2. Nothing in `engine/`, `components/`, or `pages/` needs to change — they only call repository
   functions.
3. FUTURE_ROADMAP.md (carried over from the uploaded roadmap) already recommends Postgres +
   LDAP/SSO + RBAC for the production rollout across the remaining ~141 formats — this prototype's
   storage abstraction is the seam where that migration happens.

**Important caveat for the pilot**: because storage is per-browser (per-origin, to be precise),
two people filling records in two different browsers/machines do **not** share data — even though
they now log into separate, real accounts (see Accounts above), those accounts are just *identity*
for the audit trail (who submitted/verified what); the records themselves aren't centralized.
This matches the intended deployment model: **one shared device** (e.g. one tablet at the pest
control checkpoint) that multiple staff log into and out of over the course of a shift, each
signing their own submissions/verifications — not one account per person on their own device
expecting to see everyone else's records. That second model is exactly what the storage migration
above (repositories → REST API) unlocks — accounts already exist for it; only the operational data
needs to move.

**Capacity.** A browser gives each site about 5 million characters of `localStorage`, and every
record of both modes shares it. Measured in Chromium (11-Sep-2026): a fresh Live account uses
244,660 characters (5%); once Demo Mode has filled the year so far — 2,875 records, five daily
lamination log sheets of 24 hourly rows among them — 4,208,499 (80%), growing with every demo month
generated. When a save no longer fits, the change is **not** kept, and the app now says so on screen
("Your last change could not be saved…", `components/common/StorageFullBanner.tsx`) instead of
showing it as saved and losing it on the next reload. The quickest relief is Demo Mode → **Clear
All Demo Data**; the lasting fix is the storage migration above, which removes the limit altogether.
For a pilot that will run for months, keep Demo Mode for demonstrations on a separate browser
profile rather than on the shared device that holds the real records.

## Backup instructions

Since data lives in `localStorage`, back it up from the browser console:

```js
// Export everything (paste in the browser console on the app's origin):
copy(JSON.stringify(Object.fromEntries(
  Object.keys(localStorage).filter(k => k.startsWith('dcrs:v1:'))
    .map(k => [k, localStorage.getItem(k)])
)));
// Clipboard now has a JSON backup — save it to a file.
```

```js
// Restore (paste the JSON backup object as `backup`):
Object.entries(backup).forEach(([k, v]) => localStorage.setItem(k, v));
location.reload();
```

A "real" backup/export button (JSON download) is a natural Phase‑2 addition once the app moves
off pure `localStorage` — see FUTURE_ROADMAP.md.

## Reset-demo instructions

- **In-app** (preferred): Demo Mode page → "Clear All Demo Data" button. This deletes every
  record with `isDemo: true` and leaves Live data untouched (see DATA_MODEL.md's Demo/Live
  integrity guarantee).
- **Full reset** (wipes Live data too — used for a clean pilot start): in the browser console,
  `Object.keys(localStorage).filter(k => k.startsWith('dcrs:v1:')).forEach(k =>
  localStorage.removeItem(k)); location.reload();`. The app reseeds master/document/historical
  data automatically on next load (`frontend/src/data/bootstrap.ts`).

## Environment configuration

Everything except the assistant works with no environment variables at all — sensible defaults
apply and a session secret is generated for you on first run. The assistant widget (fill / navigate
/ reply — see README.md) needs `GROQ_API_KEY`; without it every other screen still works, the widget
just shows a clear "isn't configured yet" message instead of failing silently.

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `GROQ_API_KEY` | none (assistant disabled without it) | `backend/groq.ts` | Powers the assistant. Never reaches the browser. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | `backend/groq.ts` | Override the model. Check `GET https://api.groq.com/openai/v1/models` with your key first — not every model name in Groq's general docs is enabled per-account (see README.md's Configuration section). |
| `CV_READ_WITH_ASSISTANT` | on (when `GROQ_API_KEY` is set) | `backend/index.ts`, `backend/cvExtract.ts` | Set to `0` to read uploaded CVs with the text rules alone, so no CV text is sent to Groq. The test run sets it. |
| `PORT` | `5173` | `frontend/scripts/dev-server.ts` | Frontend dev server port |
| `API_PORT` | `4000` | `backend/index.ts`, dev proxy | Auth API port |
| `JWT_SECRET` | auto-generated, saved to `backend/data/jwt-secret.txt` | `backend/auth.ts` | Session-signing key |
| `FORCE_HTTPS` | unset (`off`) | `backend/index.ts` | Set to `1` to mark the session cookie `Secure` (only do this if actually served over HTTPS, e.g. behind a reverse proxy) |
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
