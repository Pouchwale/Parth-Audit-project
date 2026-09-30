# Documentation

Everything about the Digital Controlled Record System (DCRS) apart from the code itself. Start with the [project README](../README.md) for what the system does and how to run it.

| Document | What it covers | Read it when |
|---|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Every requirement, section by section (§1 onwards): the plant's paper forms, the decisions taken, and what is still to be confirmed | You need to know why something works the way it does |
| [DATA_MODEL.md](DATA_MODEL.md) | How records, documents and their states are stored | You change how data is kept |
| [TESTING.md](TESTING.md) | What is tested, how, and how to run the unit and browser suites | You change anything, before you commit |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Running DCRS on a server, PostgreSQL, configuration, backups and restores | You install, move or back up DCRS |
| [FUTURE_ROADMAP.md](FUTURE_ROADMAP.md) | How the system extends to the remaining controlled formats | You plan the next forms |
| [database/README.md](database/README.md) | The database DCRS shares with the Audit Assistant: its schemas, roles, the overview views, the set-up and its tests | You work on the shared database or the Database overview page |
| [database/data-dictionary.md](database/data-dictionary.md) | Every table, view and column in plain English, generated from the database's own comments | You look for where something is kept |
| [chatbot-integration.md](chatbot-integration.md) | The hand-off to the Audit Assistant's developer: sign-in, the DCRS API, the shared database, what the assistant must change | You build or change the assistant's DCRS connector |
| [api/dcrs-api.openapi.json](api/dcrs-api.openapi.json) | The DCRS API for other servers, as an OpenAPI 3.1 description (also served at `/api/v1/openapi.json`) | You call DCRS from another program |

## Where things are in the repository

| Folder | What it holds |
|---|---|
| `frontend/` | The browser app: React and TypeScript, built with esbuild |
| `backend/` | The server: Express on Node, the API, PostgreSQL access, scheduled jobs |
| `database/sql/` | The SQL that sets up the shared database: numbered parts applied in order, and optional extras in `database/sql/optional/` |
| `database/tests/` | The shared database's own tests, run against a copy |
| `scripts/` | Running, testing and building: `dev-all.ts`, `run-e2e.ts`, `unit-tests.ts`, `db-stop.ts` |
| `scripts/database/` | Setting up, testing, copying and backing up the shared database, and generating its data dictionary |
| `tests/` | The browser suites (Python and Playwright) that the e2e runner runs |
| `tools/` | One-off helpers for reading the plant's paper forms |
| `source-documents/` | The plant's forms exactly as they were supplied |
| `docs/` | This documentation |
