# Connecting the Audit Assistant to DCRS

This is the hand-off for the Audit Assistant's developer. It says how the assistant signs people in with their DCRS accounts, which DCRS calls it may make, and what must change on the assistant's side so both applications can share one PostgreSQL database. Everything here was checked against a working DCRS and a throwaway copy of its database on 29–30 September 2026.

DCRS is the Digital Controlled Record System in this repository. The Audit Assistant is the chat and voice app at `github.com/Pouchwale/Parth-Audit-chatbot`.

## The rules both applications keep

1. DCRS is the only writer of DCRS data. Its records are the source of truth.
2. The assistant changes DCRS data only through the DCRS API below, as the signed-in person. So DCRS's validation, department permissions, record history and activity log all apply. The assistant never reads or writes DCRS's tables.
3. Each application owns its own schema. DCRS's tables stay in `public`. The assistant's tables live in `chatbot`. Neither migrates the other's tables.
4. Nothing that already exists in DCRS was changed to make this work. Everything is new: the `/api/v1` routes, the `chatbot` and `overview` schemas and three new database roles.
5. The assistant's code is not edited from the DCRS side. What it must change is listed in [What the assistant must change](#what-the-assistant-must-change).

## Reaching DCRS

The DCRS server serves the app and its API from one port.

| Setting | Value |
|---|---|
| Base URL, production | `http://<dcrs-host>:4000` |
| Base URL, development | `http://localhost:4000` |
| Port setting | `API_PORT` in DCRS's `backend/.env` (4000 when unset) |
| Assistant setting | `DCRS_BASE_URL` in the assistant's `server/.env` |

The assistant's server calls DCRS directly. Use the DCRS server's address on the factory network, not the development page server on port 5173.

Every call the assistant makes must carry this header:

```http
X-Client-Name: Audit Assistant
```

DCRS writes that name into its own audit trail next to the person. A change made through the API appears in the record's history as "Through Audit Assistant: <the note>", and in DCRS's activity log with the same words. Without the header, DCRS writes "Through DCRS API". The name is cut to 40 printable characters.

The full description of every route is in [docs/api/dcrs-api.openapi.json](api/dcrs-api.openapi.json) (OpenAPI 3.1). A running DCRS also serves it, without sign-in, at `GET /api/v1/openapi.json`.

## Signing in

People sign in to the assistant with their DCRS email address and password. The assistant checks them with DCRS's own sign-in route, which is unchanged:

```http
POST /api/auth/login
Content-Type: application/json
X-Client-Name: Audit Assistant

{"email": "kajal.shah@gpp.local", "password": "..."}
```

A correct email and password answer `200`, with the account in the body and the session token in a cookie:

```http
HTTP/1.1 200 OK
Set-Cookie: dcrs_session=eyJhbGciOiJIUzI1NiIs...; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax
Content-Type: application/json

{
  "user": { "id": "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f", "name": "Kajal Shah", "email": "kajal.shah@gpp.local", "role": "staff", "departments": ["QA"] },
  "features": { "demoMode": false, "signup": false, "assistant": true },
  "mustChangePassword": false
}
```

- **The token** is the value of the `dcrs_session` cookie. In Node, read it with `response.headers.getSetCookie()`.
- **It lasts 7 days.** Take `expiresAt` as the time of sign-in plus 7 days.
- **Send it on every `/api/v1` call** as `Authorization: Bearer <token>`. DCRS also accepts it as the `dcrs_session` cookie.
- **DCRS reads the account again on every call.** An account switched off by the administrator stops working at its very next call.

Map DCRS's answers onto the connector's errors like this:

| DCRS answer | Meaning | Connector error |
|---|---|---|
| `200` with `mustChangePassword: true` | The account still has the password the administrator gave it. Every `/api/v1` call would answer `403`. | `forbidden`, with "Sign in to DCRS in a browser and choose your own password first." |
| `400` | Email or password missing | `invalid_credentials` |
| `401` | Wrong email or password | `invalid_credentials` |
| `403` | The account is switched off | `forbidden`, with DCRS's message |
| `429` | Eight wrong passwords for that email in ten minutes | `forbidden`, with DCRS's message "Too many failed attempts. Try again in a few minutes." |
| Anything else, or no answer | DCRS is not reachable | `unavailable` |

Map `429` to `forbidden` so the person sees DCRS's own words. As `unavailable`, the assistant would wrongly say DCRS could not be reached.

**The person's stable id, name and role** come from `GET /api/v1/me`. Put `id` into the assistant's `users.external_id`, with `provider = 'dcrs'`. The id is a UUID that never changes. The email can change, so never key anything on it.

```http
GET /api/v1/me
Authorization: Bearer <token>
X-Client-Name: Audit Assistant
```

```json
{ "id": "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f", "name": "Kajal Shah", "email": "kajal.shah@gpp.local", "role": "staff", "departments": ["QA"] }
```

`role` is `admin` (DCRS's super admin) or `staff`. `departments` holds department codes such as `QA` and `HR`. An empty list means every department. The super admin also sees every department.

**Signing out.** `POST /api/auth/logout` with the token as the `dcrs_session` cookie writes "Signed out" in DCRS's activity log. That route reads the cookie only, not the Bearer header. DCRS sessions are signed tokens, not stored sessions, so signing out does not cancel the token. When the assistant's own session ends, it must delete its stored copy of the token.

**When a stored token stops working**, any `/api/v1` call answers `401 {"code": "not-signed-in"}`. Throw `unauthorized`, and the assistant ends that session as `upstream_signed_out`.

## The calls

Every call below answers JSON unless it says otherwise. READ calls change nothing. The CHANGE call writes to DCRS, so the assistant must always ask the person to confirm it first.

| Kind | Call | What it does |
|---|---|---|
| READ | `GET /api/v1/me` | Who is signed in |
| READ | `GET /api/v1/findings` | List and search CAPA findings |
| READ | `GET /api/v1/findings/{id}` | One CAPA finding |
| CHANGE | `POST /api/v1/findings/{id}/close` | Close a CAPA finding with a note |
| READ | `GET /api/v1/complaints` | List and search customer complaints |
| READ | `GET /api/v1/pest-control/daily-report?date=` | The daily pest control report as a PDF |
| READ | `GET /api/v1/pest-control/daily-report/summary?date=` | The same report as data |

### Errors

Every refusal has the same shape: a sentence that is safe to show the person, and a code for the program.

```json
{ "error": "The CAPA findings belong to Quality Assurance, and this account is not kept to it.", "code": "not-your-department" }
```

| Status | Codes | Connector error |
|---|---|---|
| 400 | `bad-request`, `bad-note`, `bad-date` | `invalid_request` |
| 401 | `not-signed-in` | `unauthorized` |
| 403 | `password-change-required`, `not-your-department` | `forbidden` |
| 404 | `not-found`, `no-report`, `no-such-route` | `not_found` |
| 409 | `already-closed`, `report-verified`, `report-sent-back`, `report-locked`, `busy` | `conflict` |
| 503, 504 | `pdf-unavailable`, `pdf-timeout`, or the database unavailable | `unavailable` |

### CAPA findings

The findings are the internal CAPA findings: the lines of the "CAPA — Internal: Pest Control Inspection Findings Report". They belong to Quality Assurance. Only an account kept to QA, one with no departments, or the super admin may see them.

**Their ids.** DCRS gives each finding a readable id made from its report's date and its number on the report, for example `CAPA-2023-12-13-2`.
- When two reports share a date, the second report's findings read `CAPA-2023-12-13b-1`.
- When two findings of one report share a number, the second reads `CAPA-2023-12-13-3.2`.
- Letters and spaces around the id do not matter.
- Each finding also has a `ref` that never changes, `<record id>:<finding id>`.

Keep and send `ref` when you can. Every route accepts either.

**List and search.** `GET /api/v1/findings?status=open&q=rodent&from=2026-01-01&to=2026-12-31&limit=50&offset=0`

| Parameter | Meaning |
|---|---|
| `status` | `open` (Open or Overdue; the default), `closed` (Closed or Verified) or `all` |
| `q` | Words to look for in the finding, its comments, actions, id, status or date, ignoring case |
| `from`, `to` | Report dates, `YYYY-MM-DD` |
| `limit`, `offset` | Paging: 50 by default, 200 at most |

Newest reports come first. `total` counts every match before paging.

```json
{
  "findings": [
    {
      "id": "CAPA-2023-12-13-2",
      "ref": "gap-2023-12-13:finding-mu5el1mw-2-wjv91h",
      "recordId": "gap-2023-12-13",
      "number": 2,
      "reportDate": "2023-12-13",
      "inspectionDate": "2023-12-13",
      "finding": "Rodent box numbering was missing at few locations inside the plant but Rodent box was already placed",
      "comments": "Pest may enter if location misplaced",
      "correctiveActionByContractor": "NA",
      "correctiveActionByPlant": "Numbering to be done on walls for RBS number as per Pest control Layout",
      "targetDate": "2023-12-31",
      "actionDate": null,
      "verifiedByServiceProvider": "",
      "status": "Overdue",
      "source": "External",
      "reportStatus": "Submitted",
      "department": "Quality Assurance",
      "link": "http://dcrs-host:4000/index.html#/gap/gap-2023-12-13"
    }
  ],
  "total": 1
}
```

`status` is DCRS's own rule. A finding stored as Closed or Verified shows that. Otherwise it is **Overdue** when its target date has passed in the factory's time zone and no date of action is filled in, and **Open** when not. `link` opens the report in DCRS.

**One finding.** `GET /api/v1/findings/CAPA-2023-12-13-2` answers one finding in the same shape.

**Close a finding (CHANGE).**

```http
POST /api/v1/findings/CAPA-2023-12-13-2/close
Authorization: Bearer <token>
X-Client-Name: Audit Assistant
Content-Type: application/json

{"note": "Rodent box numbers painted on the walls as per the layout."}
```

The note is required, 1 to 1,000 characters, and says how the finding was resolved. DCRS makes exactly the change its own Close button makes:
- The finding becomes **Closed**, and its date of action becomes today in the factory's time zone.
- A report that was Due or Scheduled becomes In Progress. Any other report keeps its status.
- The report's history gains an entry in the person's name with the note "Through Audit Assistant: <note>".
- DCRS's activity log gains the line "Record edited", in the person's name, with the same words.
- It is saved with the version it was read at. If someone else saved in between, DCRS reads again and retries, up to three times.

```json
{
  "finding": { "id": "CAPA-2023-12-13-2", "status": "Closed", "actionDate": "2026-09-29", "...": "the rest of the finding" },
  "record": { "id": "gap-2023-12-13", "status": "Submitted" },
  "history": { "at": "2026-09-29T12:17:07.380Z", "by": "Kajal Shah", "note": "Through Audit Assistant: Rodent box numbers painted on the walls as per the layout." }
}
```

DCRS refuses what its own page would refuse, each as `409`:

| Code | When | What the person must do |
|---|---|---|
| `already-closed` | The finding is already Closed or Verified | Nothing: treat it as done |
| `report-verified` | The report is verified | In DCRS, open the report and use Edit to reopen it for correction |
| `report-sent-back` | The report was sent back | In DCRS, open the report and use Resume |
| `report-locked` | The report is in any other state that cannot be changed | Open it in DCRS |
| `busy` | Others kept saving in between | Try again in a moment |

### Customer complaints

`GET /api/v1/complaints?status=open&q=26-27/001` lists the CAPA external customer complaints (F/MKT/05). They belong to Marketing. `status` is `open` (the default), `closed` or `all`. `q` searches the complaint number, customer, job and status.

```json
{
  "complaints": [
    {
      "recordId": "rec-mu9x1k2p-4-ab12cd",
      "complaintNumber": "26-27/001",
      "customerName": "Shree Foods",
      "jobName": "Masala pouch 200 g",
      "jobCode": "SF-200",
      "receivedDate": "2026-09-20",
      "activitiesAnswered": 12,
      "activitiesTotal": 31,
      "status": "Open",
      "recordStatus": "In Progress",
      "approvedBy": null,
      "approvedDate": null,
      "link": "http://dcrs-host:4000/index.html#/gap/complaint/rec-mu9x1k2p-4-ab12cd"
    }
  ]
}
```

A complaint's `status` reads as follows:
- **Closed** once the QA Head has approved it in DCRS.
- **Awaiting approval** while it waits for that approval.
- **Open** otherwise.

A complaint is closed only by that approval in DCRS, so the API offers no call to close one.

### The daily pest control report

**As a PDF.** `GET /api/v1/pest-control/daily-report?date=2026-09-28` answers DCRS's own daily pest control record (F/HR/17) for that date. It belongs to Human Resources.

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="F-HR-17 Daily Pest Control Monitoring Record 2026-09-28.pdf"
```

- **What prints.** DCRS prints its own page with a headless Google Chrome or Microsoft Edge on the DCRS server, exactly as the page's Print button prints it, signed in as the person.
- **Nothing changes.** The page is not allowed to write anything while it prints.
- **It is logged.** DCRS logs "Document downloaded as PDF" in the person's name, through the assistant.
- **Time.** About 4 to 5 seconds. At most two reports print at once; a third waits its turn, so allow up to about 20 seconds when several are asked for together.
- **Handing it over.** Hand it to the person with `withFiles(...)`, as an `application/pdf` file with that file name.

| Answer | When |
|---|---|
| `404 no-report` | DCRS has no daily pest control record for that date |
| `400 bad-date` | The date is not a real `YYYY-MM-DD` date |
| `503 pdf-unavailable` | The DCRS server has neither Chrome nor Edge, or the app is not built (`npm run build`) |
| `504 pdf-timeout` | Printing took more than a minute |

**As data.** `GET /api/v1/pest-control/daily-report/summary?date=2026-09-28` answers the same record as data. Use it when the person asks a question about the report rather than for the file.

```json
{
  "date": "2026-09-28",
  "recordId": "rec-mtnvtbes-y-vb9085",
  "status": "Pending Verification",
  "holiday": false,
  "checkedBy": "Roshni",
  "timeOfChecking": "09:38",
  "checkpoints": [
    { "number": 1, "question": "Pest proofing of external door (self-closer / PVC Strip curtain) working properly", "answer": "Yes", "note": null },
    { "number": 4, "question": "Total number of rodent traps provided", "answer": 100, "note": null }
  ],
  "rodentsCaught": 0,
  "observations": [{ "date": "2026-09-28", "description": "Gap under the store door", "actionTaken": "Door sweep fitted", "remarks": "" }],
  "submittedBy": "Roshni",
  "verifiedBy": null,
  "link": "http://dcrs-host:4000/index.html#/record/rec-mtnvtbes-y-vb9085"
}
```

## The connector actions to offer

Use these names and inputs. The shared database's overview reads them back through `overview.assistant_action_targets`, to show which DCRS record each action was about.

| Action | Kind | Input | Calls |
|---|---|---|---|
| `list_findings` | read | `{ status?: "open" \| "closed" \| "all", q?: string, from?: string, to?: string }` | `GET /api/v1/findings` |
| `get_finding` | read | `{ id: string }` | `GET /api/v1/findings/{id}` |
| `close_finding` | write | `{ id: string, note: string }` | `POST /api/v1/findings/{id}/close` |
| `list_complaints` | read | `{ status?: "open" \| "closed" \| "all", q?: string }` | `GET /api/v1/complaints` |
| `get_pest_control_report` | read | `{ date: string }` (`YYYY-MM-DD`) | `GET /api/v1/pest-control/daily-report`, handed over as a file |
| `get_pest_control_report_summary` | read | `{ date: string }` | `GET /api/v1/pest-control/daily-report/summary` |

A few points on how the actions behave:
- **Ids.** Put a finding's `ref` in `id` when the assistant has it, from an earlier list or get. Otherwise put the readable id the person said.
- **Describing a close.** `describe()` for `close_finding` should read like "Close CAPA finding CAPA-2023-12-13-2 with the note: ...".
- **Dates.** "Yesterday" and "today" mean the factory's day. DCRS's factory time zone is `Asia/Kolkata`, and the assistant's `REPORT_TIME_ZONE` should match it.

A sketch of the connector, for orientation. It is not code from DCRS.

```ts
const client = 'Audit Assistant';

async function call(baseUrl: string, token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'X-Client-Name': client, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (res.ok) return res;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  const message = body.error ?? `DCRS answered ${res.status}.`;
  const kind = res.status === 400 ? 'invalid_request' : res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden'
    : res.status === 404 ? 'not_found' : res.status === 409 ? 'conflict' : 'unavailable';
  throw new ConnectorError(kind, message);
}

async authenticate(username, password) {
  const res = await fetch(new URL('/api/auth/login', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Name': client },
    body: JSON.stringify({ email: username, password }),
  }).catch(() => null);
  if (!res) throw new ConnectorError('unavailable', 'DCRS could not be reached.');
  const body = (await res.json().catch(() => ({}))) as { error?: string; mustChangePassword?: boolean };
  if (res.status === 400 || res.status === 401) throw new ConnectorError('invalid_credentials', 'Wrong email or password.');
  if (res.status === 403 || res.status === 429) throw new ConnectorError('forbidden', body.error ?? 'DCRS refused the sign-in.');
  if (!res.ok) throw new ConnectorError('unavailable', 'DCRS could not be reached.');
  if (body.mustChangePassword) throw new ConnectorError('forbidden', 'Sign in to DCRS in a browser and choose your own password first.');
  const token = res.headers.getSetCookie().map((c) => /^dcrs_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
  if (!token) throw new ConnectorError('unavailable', 'DCRS did not start a session.');
  const me = (await (await call(baseUrl, token, '/api/v1/me')).json()) as { id: string; name: string; email: string };
  return { externalId: me.id, username: me.email, displayName: me.name, credentials: { token }, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
}
```

## The shared database

| Item | Value |
|---|---|
| PostgreSQL | 18.4 on the DCRS server. The assistant needs 13 or newer and no extensions. |
| Database | DCRS's own database. It is called `dcrs` in development, on port 5433. |
| The assistant's schema | `chatbot`, owned by the role `audit_assistant` |
| The assistant's role | `audit_assistant` |
| `DATABASE_URL` format | `postgresql://audit_assistant:<password>@<dcrs-db-host>:<port>/<dcrs database>` |
| Development example | `postgresql://audit_assistant:<password>@127.0.0.1:5433/dcrs` |

The password is given separately, never written here. The URL needs no `options` and no `search_path`: the role carries its own settings, listed below.

The database set-up is `database/sql/01-schemas-and-roles.sql` in this repository. It gives `audit_assistant` the following:

| Privilege or setting | Why |
|---|---|
| `LOGIN`, and nothing else: not a superuser, and cannot make roles or databases | It is one application's login |
| Owner of the schema `chatbot` | The assistant creates and changes its own tables there |
| `CONNECT` and `CREATE` on the database | The migration tool runs `CREATE SCHEMA IF NOT EXISTS "chatbot"` at every start. PostgreSQL checks `CREATE` on the database before it notices the schema exists, and without it that line fails with "permission denied for database". This was tested on a copy. It lets the role make new empty schemas; it gives no access to anything of DCRS. |
| `CONNECTION LIMIT 20` | The pool holds 10. Twenty lets an old and a new server overlap during a restart. |
| `statement_timeout = 30s` | No statement of the assistant's can hold DCRS up for longer |
| `idle_in_transaction_session_timeout = 60s` | No transaction left open can hold locks |
| `search_path = chatbot` | An unqualified name means the assistant's table, never DCRS's `public.users` |

It is granted nothing on DCRS's tables in `public`, nor on the `overview` schema. A test proves that it cannot read or write any DCRS table: `npm run db:shared -- test`, in [docs/database/README.md](database/README.md).

The `overview` schema holds read-only views over both applications for people to browse. Its views over the assistant's tables are owned by the role `overview_owner`, which may read only the harmless columns of those tables. It never reads connector credentials, session token hashes, chat text, file bytes, exported content or the person's words in `actions.request`. They are listed in [docs/database/README.md](database/README.md).

## What the assistant must change

These are the changes to the assistant's repository, `server/`, so that everything it has sits in `chatbot`. They were made on a throwaway copy of its server on 29 September 2026. Against a copy of DCRS's database, it then started on the empty `chatbot` schema, created its ten tables and its migration ledger there, created no `drizzle` schema, and restarted cleanly.

1. **`src/db/schema.ts`**: declare the schema, and put every table in it.

   ```ts
   import { boolean, date, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

   /** Every table lives in its own schema, never in the database's public schema (DCRS's). */
   export const chatbot = pgSchema('chatbot');
   ```

   Change all ten `pgTable(` calls to `chatbot.table(`.

2. **`drizzle.config.ts`**: generate for that schema only, and keep the ledger in it.

   ```ts
   export default defineConfig({
     dialect: 'postgresql',
     schema: './src/db/schema.ts',
     out: './src/db/migrations',
     schemaFilter: ['chatbot'],
     migrations: { schema: 'chatbot' },
   });
   ```

3. **`src/db/index.ts`**: pass the ledger's schema to both migrate calls.

   ```ts
   await migratePg(db, { migrationsFolder, migrationsSchema: 'chatbot' });
   // and
   await migratePglite(db, { migrationsFolder, migrationsSchema: 'chatbot' });
   ```

4. **Regenerate the migrations; do not append to them.** Delete `src/db/migrations/` and the development database `server/.data/pglite`. Then run:

   ```sh
   npx drizzle-kit generate --name init
   ```

   The old `0000_init.sql` creates an unqualified `users` table. In DCRS's database that collides with DCRS's own `public.users`, and its 15 foreign keys name `"public"`. Nothing has been deployed, so regenerating loses nothing.

5. **Edit the first line of the new `0000_init.sql`.** drizzle-kit writes:

   ```sql
   CREATE SCHEMA "chatbot";
   ```

   Change it to:

   ```sql
   CREATE SCHEMA IF NOT EXISTS "chatbot";
   ```

   drizzle's migrator creates the ledger's schema before it runs any migration. The schema also already exists, created for the assistant's role by the DBA. Without this edit, the first start fails with `schema "chatbot" already exists`; this was seen on the copy. drizzle does not check a migration's hash, so the edit is safe.

6. **Implement the DCRS connector** in `src/connectors/dcrs/index.ts` as described above.

7. **Set the environment** in `server/.env`:

   ```env
   DATABASE_URL=postgresql://audit_assistant:<password>@<dcrs-db-host>:<port>/<dcrs database>
   DCRS_BASE_URL=http://<dcrs-host>:4000
   REPORT_TIME_ZONE=Asia/Kolkata
   SUPER_ADMINS=<the DCRS super admin's email, lower case>
   ```

8. **Optionally, comment the tables.** `database/sql/optional/chatbot-table-comments.sql` in this repository describes every table and column of the assistant in plain English. Add it as a migration of the assistant's own, after `0000_init.sql`, so the assistant's tables explain themselves in the database viewer and the data dictionary. A DBA may instead run it once after the assistant has made its tables.

9. **Run the assistant's own tests** (`npm test`). They use an in-memory PGlite, which creates the schema the same way.

Once the new migration files exist, send them to the DCRS side. The overview views over the assistant's tables (`database/sql/03-overview-chatbot.sql`) are written and tested against the copy's tables. They are applied to the real database only when checked against the real files.

Once those views exist, a later migration of the assistant that changes or drops a column one of them reads would be refused by PostgreSQL. Before such a migration, the DBA runs `npm run db:shared -- setup --rebuild-views`, which sets the views over the assistant's tables aside. The assistant then migrates, and `npm run db:shared -- setup --with-chatbot` puts the views back ([docs/database/README.md](database/README.md), section 4). Adding a table or a column needs none of this.

## Checking it works

- **The assistant starts on an empty schema.** Start it against the shared database with `DATABASE_URL` as above. It creates its tables in `chatbot`, and stopping and starting it again changes nothing.
- **The assistant cannot read DCRS's data.** `npm run db:shared -- test` in this repository runs the database checks against a copy. Among them: the assistant's role is refused every DCRS table, and the viewer can read only the overview.
- **A change shows at once.** Close a finding through the assistant. Then:
  - DCRS's page for that report shows it Closed, with the history entry "Through Audit Assistant: ...".
  - DCRS's Activity Log shows "Record edited" by that person.
  - The Database overview (DCRS, admin area) lists it under "What changed in DCRS through the Audit Assistant?".

## Test account

A test account exists in the development data, with the departments the calls above need: Quality Assurance, Human Resources and Marketing. Its email and password were given in the chat that set this up, and are never written in the repository.

## Known limits

- **Stale open pages.** A DCRS page that shows a CAPA report and stays open while the assistant closes one of its findings keeps its own copy of the report. If the person then edits that open page, the edit can put the finding back to Open. This is how DCRS's CAPA page behaves today, and it is the same between two people's browsers. The fix belongs to DCRS; until it is made, the person should reload the page.
- **No other closes.** The API closes internal CAPA findings only. Complaints are closed by the QA Head's approval, and internal-audit non-conformances (F/SYS/10, F/SYS/11) are not offered.
- **The PDF needs Chrome or Edge.** It needs Google Chrome or Microsoft Edge on the DCRS server, and the DCRS app built. Set `DCRS_PDF_BROWSER` to the browser's path if it is installed somewhere unusual.
