# DCRS — Digital Controlled Record System

Gujarat Print Pack Publications' controlled records on one website: the plant's formats (HR, QC, Production,
Maintenance, Purchase, Store, Dispatch, Marketing, System, Compliance) filled, verified and filed on time, with the
assistant Mitra, reminders, reports and the month registers. Every decision taken with the owner is written in
[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), section by section; the long form of this page is kept in
[docs/README-full-2026-11-04.md](docs/README-full-2026-11-04.md).

## Run it

Needs Node.js 23.6+ (TypeScript runs directly, no compile step) and, for the browser suites, Python 3.12 with
Playwright.

```bash
npm install
npm run dev:local   # the website on http://localhost:5173 with a scratch database - the owner's rule: every change is clicked through here first
npm run dev         # website (5173) + API (4000) against the configured database
npm run build       # frontend/dist, what the plant serves
npm start           # one Express process: the website and the API
```

Sign in as one of the plant's named accounts; the local run seeds `admin@gpp.local` / `Local@12345` and the staff
accounts (`kapila.barad@`, `vinay.bhojak@`, `sandeep.parekh@gpp.local`). Nobody signs up on the plant.

## The plant

The server PC runs DCRS on port 4100, the Mitra server on 3000 and Mitra for Expo Go on 8081 from the live copy,
watched by `scripts\windows\start-plant-servers.ps1` (`-Stop` stops the three; `Start-Process ... -WindowStyle
Hidden -File scripts\windows\start-plant-servers.ps1` starts them again). Deploy = `npm run build` in the live
copy, then that restart when the server side changed. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) has the LAN setup,
backups and resets; [docs/phone-app-setup.md](docs/phone-app-setup.md) the phones.

## Check it

```bash
npm run typecheck
npm run test:unit                 # every unit suite: frontend, backend, indexing
npm run test:unit -- dailyPest    # the suites whose file name contains a word
```

The Playwright suites are in `tests/` (`scripts/run-e2e.ts` runs them against a build);
[docs/TESTING.md](docs/TESTING.md) says what each one proves.

## Configuration

`backend/.env` (never committed): `DATABASE_URL` for the plant's PostgreSQL (unset = a local one of its own),
`CHATGPT_API_KEY` for Mitra (every AI setting is named in `backend/.env.example`; without a key every screen still
works and Mitra answers from the records), `DAYLIGHT_THEME=1` for the theme that follows the sun.

## Where things are

- `frontend/src` — the website: `pages/`, `components/`, the engines in `engine/` (import-free ones also run on the
  server through `engineHost/`), the formats and seeds in `data/seed/`.
- `backend/` — the Express API, the database (`db.ts`), the jobs (reminders, escalation, the morning prepare).
- `indexing/` — the index of every format and document.
- `docs/` — REQUIREMENTS.md (every decision, §1-§181), TESTING.md, DEPLOYMENT.md, the data model and the API notes.
