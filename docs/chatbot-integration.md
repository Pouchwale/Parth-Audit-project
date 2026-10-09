# Connecting the Mitra mobile app (the Audit Assistant) to DCRS

## Notification contract changes

The notification routes below are the shared contract of 8 October 2026 (the build brief, section 5.3), exactly as given, with these additions. Each is optional and additive: an app written to the brief's shapes keeps working.

1. **`data` carries six more optional facts**, so that every kind can be worded in English, Hindi and Gujarati from facts rather than stored sentences:
   - `subject`, `late`, `neverDone` for `escalation` (who, and the counts of the last 30 days);
   - `level` for `access_changed` (`none`, `read`, `write` or `edit`: the level the person now has);
   - `by` for `verify` (who submitted it), `sent_back` (who sent it back) and `access_changed` (who changed it);
   - `part` for `boss_summary` (`morning` or `evening`).
2. **`POST /api/v1/notifications/test` may also answer `reason`**, a sentence saying why nothing was sent (push switched off on the server, or no phone registered), for the Settings screen's "state of push".
3. **The push itself is described here** (it is not an HTTP route of DCRS, so the brief's contract has no shape for it): see [What a push carries](#what-a-push-carries).
4. **Two refusals are added**: `409 needs-review` (a prepared record submitted without `"reviewed": true`) and `429 too-many` (a second test push within 20 seconds).

This is the hand-off for the Audit Assistant's developer. It says how the assistant signs people in with their DCRS accounts, which DCRS calls it may make, and what must change on the assistant's side so both applications can share one PostgreSQL database. Everything here was checked against a working DCRS and a throwaway copy of its database on 29–30 September 2026.

DCRS is the Digital Controlled Record System in this repository. The Audit Assistant is the chat and voice app at `github.com/Pouchwale/Parth-Audit-chatbot`. On 30 September 2026 its owner renamed the app and its server **Mitra**, the Mitra mobile app, after DCRS's own assistant. The parts written before then still say "the assistant".

The mobile app can now do what Mitra does in DCRS: find documents, say what is due today, open today's record, fill it, submit it, verify it, and print it. Since 2 October 2026 it can also look a machine up on the equipment list (F/MNT/01), say what stands out in the records, and give the super admin the escalations. That part is [What Mitra does, from the mobile app](#what-mitra-does-from-the-mobile-app) (REQUIREMENTS §85).

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
X-Client-Name: Mitra mobile app
```

DCRS writes that name into its own audit trail next to the person. A change made through the API appears in the record's history as "Through Mitra mobile app: <the note>", and in DCRS's activity log with the same words. (Before the app was renamed it sent `Audit Assistant`, so changes made through it before 30 September 2026 read "Through Audit Assistant: …".) Without the header, DCRS writes "Through DCRS API". The name is cut to 40 printable characters.

The full description of every route is in [docs/api/dcrs-api.openapi.json](api/dcrs-api.openapi.json) (OpenAPI 3.1). A running DCRS also serves it, without sign-in, at `GET /api/v1/openapi.json`.

## Signing in

People sign in to the assistant with their DCRS email address and password. The assistant checks them with DCRS's own sign-in route:

```http
POST /api/auth/login
Content-Type: application/json
X-Client-Name: Mitra mobile app

{"email": "kajal.shah@gpp.local", "password": "..."}
```

A correct email and password answer `200`, with the account in the body and the session token in a cookie:

```http
HTTP/1.1 200 OK
Set-Cookie: dcrs_session=eyJhbGciOiJIUzI1NiIs...; Max-Age=30600; Path=/; HttpOnly; SameSite=Lax
Content-Type: application/json

{
  "user": { "id": "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f", "name": "Kajal Shah", "email": "kajal.shah@gpp.local", "role": "staff", "departments": ["QA"] },
  "features": { "demoMode": false, "signup": false, "assistant": true },
  "mustChangePassword": false,
  "session": { "endsAt": "2026-09-30T12:50:00.000Z", "signOutAtEnd": true, "now": "2026-09-30T04:20:00.000Z" }
}
```

- **The token** is the value of the `dcrs_session` cookie. In Node, read it with `response.headers.getSetCookie()`.
- **It lasts until the close of the day it was started** (REQUIREMENTS §84). For everybody but the super admin that is the end of the staff's working hours, 6:20 pm factory time unless the super admin changes it; for the super admin it is midnight, factory time (the midnight after, for a sign-in in the day's last ten minutes). Take `expiresAt` from `session.endsAt` in the answer. The cookie's `Max-Age` runs to the same moment. So every day starts with signing in again.
- **The staff's working hours.** Staff may use DCRS from 8:40 am to 6:20 pm on a working day of the plant's calendar: not on the weekly off (Thursday), unless it is an adjustment day, and not on a festival holiday. The super admin may sign in and work at any hour of any day. Outside those hours anybody but the super admin is refused, at sign-in and on every `/api/v1` call, with `403` and the code `outside-working-hours`. The answer's `error` says why in words the person can read ("Staff working hours: … Today's staff hours ended at 6:20 pm; they start again on …"), and `opensAt` says when their hours start again. DCRS's words never say DCRS itself is open or closed (the owner, 6-Oct-2026): pass them on as they are.
- **Send it on every `/api/v1` call** as `Authorization: Bearer <token>`. DCRS also accepts it as the `dcrs_session` cookie.
- **DCRS reads the account again on every call.** An account switched off by the administrator stops working at its very next call.

Map DCRS's answers onto the connector's errors like this:

| DCRS answer | Meaning | Connector error |
|---|---|---|
| `200` with `mustChangePassword: true` | The account still has the password the administrator gave it. Every `/api/v1` call would answer `403`. | `forbidden`, with "Sign in to DCRS in a browser and choose your own password first." |
| `400` | Email or password missing | `invalid_credentials` |
| `401` | Wrong email or password | `invalid_credentials` |
| `403` | The account is switched off | `forbidden`, with DCRS's message |
| `403` with `code: "outside-working-hours"` | Outside the staff's working hours. Only the super admin may sign in then. | `forbidden`, with DCRS's message, for example "Staff working hours: 8:40 am to 6:20 pm on working days. Today is Thursday, the weekly off; staff hours start again on Friday 2 October at 8:40 am." |
| `429` | Eight wrong passwords for that email in ten minutes | `forbidden`, with DCRS's message "Too many failed attempts. Try again in a few minutes." |
| Anything else, or no answer | DCRS is not reachable | `unavailable` |

Map `429` to `forbidden` so the person sees DCRS's own words. As `unavailable`, the assistant would wrongly say DCRS could not be reached.

**The person's stable id, name and role** come from `GET /api/v1/me`. Put `id` into the assistant's `users.external_id`, with `provider = 'dcrs'`. The id is a UUID that never changes. The email can change, so never key anything on it.

```http
GET /api/v1/me
Authorization: Bearer <token>
X-Client-Name: Mitra mobile app
```

```json
{ "id": "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f", "name": "Kajal Shah", "email": "kajal.shah@gpp.local", "role": "staff", "departments": ["QA"] }
```

`role` is `admin` (DCRS's super admin) or `staff`. `departments` holds department codes such as `QA` and `HR`. An empty list means every department. The super admin also sees every department.

**Signing out.** `POST /api/auth/logout` with the token as the `dcrs_session` cookie writes "Signed out" in DCRS's activity log. That route reads the cookie only, not the Bearer header. DCRS sessions are signed tokens, not stored sessions, so signing out does not cancel the token before the close of its day. When the assistant's own session ends, it must delete its stored copy of the token. The body is optional, and the assistant need not send one. DCRS's own pages send `{"reason": "end-of-working-hours"}` when they sign a member of staff out by themselves at the close of the working day, and `{"reason": "end-of-day"}` for the super admin at midnight; a reason is written in the log only where it fits the account. They also name the session they are ending (`sessionId`, the `session.id` of the sign-in answer), so that a tab whose clock ran late never ends a newer session of the same browser.

**When a stored token stops working**, any `/api/v1` call answers `401 {"code": "not-signed-in"}`. That happens every day at the close of the session's day. Throw `unauthorized`, and the assistant ends that session as `upstream_signed_out`.

**Outside the plant's working hours** a session can still be open, for example when the super admin declares today a holiday during the day. Then any `/api/v1` call for anybody but the super admin answers `403 {"code": "outside-working-hours"}`, with the reason in `error` and the next opening in `opensAt`. Throw `forbidden` with DCRS's message. Do not retry before `opensAt`.

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

The calls for what Mitra does are listed in [What Mitra does, from the mobile app](#what-mitra-does-from-the-mobile-app). They find and read documents and records, and open, change and act on records.

### Errors

Every refusal has the same shape: a sentence that is safe to show the person, and a code for the program.

```json
{ "error": "The CAPA findings belong to Quality Assurance, and this account is not kept to it.", "code": "not-your-department" }
```

| Status | Codes | Connector error |
|---|---|---|
| 400 | `bad-request`, `bad-note`, `bad-date` | `invalid_request` |
| 401 | `not-signed-in` | `unauthorized` |
| 403 | `outside-working-hours`, `password-change-required`, `not-your-department` | `forbidden` |
| 404 | `not-found`, `no-report`, `no-such-route` | `not_found` |
| 409 | `already-closed`, `report-verified`, `report-sent-back`, `report-locked`, `busy` | `conflict` |
| 503, 504 | `pdf-unavailable`, `pdf-timeout`, or the database unavailable | `unavailable` |

The calls for what Mitra does add a few codes of their own. They are listed in [The new refusals](#the-new-refusals).

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
X-Client-Name: Mitra mobile app
Content-Type: application/json

{"note": "Rodent box numbers painted on the walls as per the layout."}
```

The note is required, 1 to 1,000 characters, and says how the finding was resolved. DCRS makes exactly the change its own Close button makes:
- The finding becomes **Closed**, and its date of action becomes today in the factory's time zone.
- A report that was Due or Scheduled becomes In Progress. Any other report keeps its status.
- The report's history gains an entry in the person's name with the note "Through Mitra mobile app: <note>".
- DCRS's activity log gains the line "Record edited", in the person's name, with the same words.
- It is saved with the version it was read at. If someone else saved in between, DCRS reads again and retries, up to three times.

```json
{
  "finding": { "id": "CAPA-2023-12-13-2", "status": "Closed", "actionDate": "2026-09-29", "...": "the rest of the finding" },
  "record": { "id": "gap-2023-12-13", "status": "Submitted" },
  "history": { "at": "2026-09-29T12:17:07.380Z", "by": "Kajal Shah", "note": "Through Mitra mobile app: Rodent box numbers painted on the walls as per the layout." }
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

The actions for what Mitra does are listed in [Mitra's tools and the routes](#mitras-tools-and-the-routes).

A few points on how the actions behave:
- **Ids.** Put a finding's `ref` in `id` when the assistant has it, from an earlier list or get. Otherwise put the readable id the person said.
- **Describing a close.** `describe()` for `close_finding` should read like "Close CAPA finding CAPA-2023-12-13-2 with the note: ...".
- **Dates.** "Yesterday" and "today" mean the factory's day. DCRS's factory time zone is `Asia/Kolkata`, and the assistant's `REPORT_TIME_ZONE` should match it.

A sketch of the connector, for orientation. It is not code from DCRS.

```ts
const client = 'Mitra mobile app';

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
  const body = (await res.json().catch(() => ({}))) as { error?: string; mustChangePassword?: boolean; session?: { endsAt?: string } };
  if (res.status === 400 || res.status === 401) throw new ConnectorError('invalid_credentials', 'Wrong email or password.');
  if (res.status === 403 || res.status === 429) throw new ConnectorError('forbidden', body.error ?? 'DCRS refused the sign-in.');
  if (!res.ok) throw new ConnectorError('unavailable', 'DCRS could not be reached.');
  if (body.mustChangePassword) throw new ConnectorError('forbidden', 'Sign in to DCRS in a browser and choose your own password first.');
  const token = res.headers.getSetCookie().map((c) => /^dcrs_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
  if (!token) throw new ConnectorError('unavailable', 'DCRS did not start a session.');
  const me = (await (await call(baseUrl, token, '/api/v1/me')).json()) as { id: string; name: string; email: string };
  // The session ends at the close of its day (6:20 pm for staff, midnight for the super admin), not after a fixed span.
  const endsAt = body.session?.endsAt ? new Date(body.session.endsAt) : null;
  return { externalId: me.id, username: me.email, displayName: me.name, credentials: { token }, expiresAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : new Date(Date.now() + 8 * 60 * 60 * 1000) };
}
```

## What Mitra does, from the mobile app

On 30 September 2026 the owner asked that whatever Mitra, DCRS's assistant, can do in the browser can also be done from the mobile app (REQUIREMENTS §85). The routes below make that possible. Each one is one of Mitra's own tools, so the mobile app can offer the same things.

**DCRS's own engine answers them.** Everything Mitra does in the browser is done by DCRS's engine: the checks on every value, the validation before a submit, the record's history and the activity log. The DCRS server runs that same code for these routes; it is not a second copy of the rules. So a change made from the phone is exactly the change DCRS's own page would make. It is checked the same way, refused for the same reasons, and saved with the version it was read at. If someone else saved in between, DCRS works the change out again on what is stored now, up to three times.

**The same checks as every `/api/v1` call.** The session, the account, the plant's working hours and the forced password change all apply. The person's departments decide what they see, exactly as DCRS decides what their browser holds. Another department's document or record is refused with `403 not-your-department`, and the refusal says whose it is.

**Every change says where it came from.** The mobile app sends `X-Client-Name: Mitra mobile app`. Each change then shows up in two places:
- **The record's history.** A new entry is written in the person's name with the note "Through Mitra mobile app: \<the person's note, or the action\>". For example: "Through Mitra mobile app: 10 o'clock reading from the floor", or "Through Mitra mobile app: submitted for verification".
- **The activity log.** DCRS writes the same line its browser writes for that change, so the Performance Scorecard counts it. For example: "Record edited through Mitra", "Record submitted for verification" or "Record verified". The line's detail starts with "Through Mitra mobile app".

Two changes in a row each keep their own history entry. In the browser, two edits by one person within a quarter of an hour are folded into one entry; changes from the app are not.

**Ask the person first.** Every CHANGE call below writes to DCRS. The mobile app must ask the person to confirm each one, as Mitra does.

### Mitra's tools and the routes

| Mitra's tool (browser) | Mobile app action | Kind | Call |
|---|---|---|---|
| `find_documents` | `find_documents` `{ q, limit? }` | read | `GET /api/v1/documents?q=&limit=` |
| (the document's own page) | `get_document` `{ id }` | read | `GET /api/v1/documents/{id}` |
| `todays_facts` | `todays_facts` `{}` | read | `GET /api/v1/today` |
| `list_records` | `list_records` `{ documentId?, from?, to?, status? }` | read | `GET /api/v1/records?documentId=&from=&to=&status=&limit=` |
| `search_records` | `search_records` `{ q, documentId?, from?, to? }` | read | `GET /api/v1/records/search?q=&documentId=&from=&to=&limit=` |
| `get_record`, `get_open_record` | `get_record` `{ recordId }` | read | `GET /api/v1/records/{id}` |
| `record_action` print | `record_pdf` `{ recordId }` | read | `GET /api/v1/records/{id}/pdf` |
| `history_figures` | `history_figures` `{ question, documentId?, from?, to? }` | read | `GET /api/v1/figures?question=&documentId=&from=&to=` |
| `hr_master_lookup` | `hr_master_lookup` `{ q }` | read | `GET /api/v1/people?q=` |
| (her answers about a machine, F/MNT/01) | `equipment_lookup` `{ q? }` | read | `GET /api/v1/equipment?q=&limit=` |
| (the insights headline in her live facts) | `insights` `{}` | read | `GET /api/v1/insights?limit=` |
| (the escalations line in her live facts, super admin only) | `escalations` `{ status? }` | read | `GET /api/v1/escalations?open=` |
| `open_document` with create | `open_record` `{ documentId, date? }` | change | `POST /api/v1/records` |
| `edit_open_record` | `edit_record` `{ recordId, patch, note? }` | change | `POST /api/v1/records/{id}/changes` |
| `record_action` | `record_action` `{ recordId, action, reason? }` | change | `POST /api/v1/records/{id}/actions` |
| `add_photo_to_open_record` | `add_photo_to_record` `{ recordId, … }` | change | `POST /api/v1/records/{id}/photos` |
| `fill_open_record_with_sample_data` | `fill_record_with_sample_data` `{ recordId }` | change | `POST /api/v1/records/{id}/sample-fill` |

Name a record `recordId` and a date `date` in the actions' inputs. The Database overview reads those names back (`overview.assistant_action_targets`).

Mitra works on the record open on the screen. The mobile app has no screen, so it names the record by its id: `open_record` gives the id, and `get_record` gives the field keys a patch names.

**Not offered, and why:**

| Mitra's tool | Why the mobile app does not have it |
|---|---|
| `navigate` | It opens a page of DCRS in the browser. The app has no DCRS pages. Every answer carries a `link` that opens the record or document in DCRS. |
| `start_guided_fill` | It is the chat widget's question-by-question walk through a form in the browser. The app asks its own questions and sends the answers with `edit_record`. |
| `ask_user` | It is Mitra's way of asking the person a question in the browser's chat. The app has its own chat. |
| `read_attachment` | It reads a file attached in the browser's chat. The app reads its own files. |
| `change_format` | Changing a format (a column, a box, the header) makes a new revision of a controlled form. That is a desktop design task, done in DCRS by the people who own the form. |

### Documents

**Find.** `GET /api/v1/documents?q=viscosity` looks for any word of a document's name, in any case. It also takes a format number however it is written (F/QC/30, F-QC-30, fqc30), a module, a department, or a word the plant uses for the document. Without `q`, it lists every document of the person's.

```json
{
  "query": "viscosity",
  "documents": [
    {
      "id": "qc-viscosity", "formatNo": "F-QC-30", "name": "Lamination Adhesive Viscosity Record",
      "module": "Lamination — Quality Control", "section": null, "kind": "log-sheet",
      "schedule": { "frequency": "Daily", "rule": "Every day" },
      "department": { "code": "QC", "name": "Quality Control" },
      "revisionNo": "00", "referenceOnly": false,
      "route": "/document/qc-viscosity", "link": "http://dcrs-host:4000/index.html#/document/qc-viscosity"
    }
  ],
  "total": 1,
  "kept": [],
  "notInDcrs": []
}
```

- **`kept`**: another department's documents that match. They are found but never opened (REQUIREMENTS §84). For a QC account, `q=F/HR/17` answers `"kept": [{ "id": "daily-pest-monitoring", "formatNo": "F/HR/17", "department": "Human Resources", "note": "Kept by Human Resources — ask the super admin for access" }]`.
- **`notInDcrs`**: formats on the plant's Master List of Formats (F/SYS/02) that DCRS does not hold yet.

**One document.** `GET /api/v1/documents/qc-viscosity`. The id can also be the format number (`F-QC-30`), or words that name exactly one of the person's documents. The answer says:
- what the document is (`what`), who fills it (`who`, from Master Data), when (`when`) and how (`how`);
- its `layout`, which lists the keys a patch names;
- `patchShape`, how a change to this kind of form is written;
- its latest records.

```json
{
  "id": "qc-viscosity", "formatNo": "F-QC-30", "name": "Lamination Adhesive Viscosity Record", "kind": "log-sheet",
  "what": "Hourly viscosity check of the lamination adhesive mix (specification 20.0 ± 1.0 Sec.), round the clock — 24 readings per day, each signed by the tester.",
  "who": { "label": "Jeni, Singh", "people": [{ "name": "Jeni", "role": "QC Tester — day shift (Lamination QC)" }] },
  "when": "Daily — Every day",
  "how": "Format F-QC-30 (Rev 00) — filled digitally in the app, then Submitted and Verified through the approval workflow.",
  "layout": {
    "kind": "log-sheet", "header": [], "footer": [],
    "columns": [
      { "key": "time", "label": "Date/Time", "type": "time", "printed": true },
      { "key": "viscosity", "label": "Viscosity (20.0 ± 1.0 Sec.)", "type": "number", "required": true, "unit": "Sec.", "min": 19, "max": 21 },
      { "key": "testedBy", "label": "Tested By", "type": "text", "required": true }
    ],
    "rows": { "mode": "timeSlots", "slotKey": "time", "slots": ["09:00", "10:00", "…", "08:00"] }
  },
  "patchShape": "A box: {\"header\": {\"<box key>\": value}}. One line: {\"itemEdits\": [{\"collection\": \"rows\", \"match\": {\"<slot key>\": \"10:00\"} or {\"row\": 2}, \"set\": {\"<column key>\": value}}]}. Printed and computed columns cannot be written.",
  "records": { "count": 2, "latest": [{ "recordId": "rec-munyt2ti-14-azkgv0", "dueDate": "2026-09-30", "status": "Verified", "started": true }] }
}
```

It can be refused in three ways:
- another department's document is `403 not-your-department`, and the refusal says whose it is;
- a format on the Master List that DCRS does not hold is `404 not-in-dcrs`;
- words that name several documents are `400 ambiguous`, with the `candidates`.

### Today

`GET /api/v1/today` answers what Mitra's `todays_facts` gives, for the person's departments:
- whether today and tomorrow are working days, the weekly off, and the next holidays and adjustment days;
- the staff's working hours (`workingHours`), worded for the person asking: `hoursText` and `todayText` say the staff's hours and where today stands for them, and for the super admin `forYou` says "You are the super admin: these are the staff's hours, and you can keep working at any time." (null for staff). Give the model all three, so it never tells the super admin that DCRS is closed;
- what is overdue, due today, and due in the next three days;
- what is ready to submit, what needs input, and what is awaiting verification;
- the same facts in words (`facts`).

```json
{
  "date": "2026-09-30",
  "day": { "date": "2026-09-30", "weekday": "Wednesday", "kind": "working", "closed": false, "label": "Working day" },
  "tomorrow": { "date": "2026-10-01", "weekday": "Thursday", "kind": "weekly-off", "closed": true, "label": "Thursday — weekly off" },
  "nextHolidays": [{ "date": "2026-10-19", "weekday": "Monday", "kind": "holiday", "closed": true, "name": "Navratri Atham", "label": "Navratri Atham — company holiday" }],
  "overdue": [],
  "due": [{ "documentId": "qc-adhesive-mixing", "formatNo": "F-QC-32", "document": "Adhesive Mixing Ratio Record", "dueDate": "2026-09-30", "status": "In Progress", "recordId": "rec-munyt9an-14-7g7ku2", "started": true, "route": "/record/rec-munyt9an-14-7g7ku2", "link": "http://dcrs-host:4000/index.html#/record/rec-munyt9an-14-7g7ku2" }],
  "upcoming": [{ "documentId": "qc-viscosity", "formatNo": "F-QC-30", "document": "Lamination Adhesive Viscosity Record", "dueDate": "2026-10-02", "status": null, "recordId": null, "started": false }],
  "readyToSubmit": [], "needsInput": [], "awaitingVerification": [],
  "facts": "Today: Wednesday, 30-Sep-2026 — Working day.\n…\nRecords due today: 9 (1 submitted or verified, 8 still open). …",
  "workingHours": { "enforced": true, "start": "08:40", "end": "18:20", "openNow": true, "hoursText": "Staff working hours: 8:40 am to 6:20 pm on working days. The super admin can sign in at any time.", "todayText": "Today is a working day — staff hours run until 6:20 pm.", "heldToHours": true, "forYou": null }
}
```

Each item also says its `module`, and whether the person may submit or verify it now (`canSubmit`, `canVerify`); see [Today, by person](#today-by-person).

**`recordId: null` with `started: false`** means DCRS's calendar has the sheet but no one has opened it yet, so it has no id. Start it with `open_record` (`POST /api/v1/records` with `documentId` and `date`).

### Records

**List.** `GET /api/v1/records?documentId=F-QC-30&from=2026-09-28&to=2026-09-30` lists records newest first. Without `from` and `to`, it lists the last 31 days. Without `documentId`, it lists every document of the person's.

```json
{
  "document": { "id": "qc-viscosity", "formatNo": "F-QC-30", "name": "Lamination Adhesive Viscosity Record", "…": "…" },
  "from": "2026-09-28", "to": "2026-09-30", "total": 2,
  "records": [
    { "recordId": "rec-munyt2ti-14-azkgv0", "started": true, "documentId": "qc-viscosity", "formatNo": "F-QC-30", "document": "Lamination Adhesive Viscosity Record", "dueDate": "2026-09-30", "status": "Verified", "submittedBy": "Kapila Barad", "verifiedBy": "Super Admin", "updatedAt": "2026-09-30T10:31:06.137Z", "route": "/record/rec-munyt2ti-14-azkgv0", "link": "http://dcrs-host:4000/index.html#/record/rec-munyt2ti-14-azkgv0" }
  ]
}
```

**Search.** `GET /api/v1/records/search?q=floor` finds every word of `q` in what people wrote on records. Results come newest first, each with a snippet. It is DCRS's own Search.
- A format number together with words keeps the search to that document.
- A format number alone lists that document's latest records.
- Blank and prepared sheets are not searched. List them with `GET /api/v1/records` instead.

```json
{ "query": "floor", "kind": "words", "total": 1, "complete": true,
  "hits": [{ "recordId": "rec-munyy41g-97-e22nuo", "documentId": "qc-viscosity", "formatNo": "F-QC-30", "dueDate": "2026-09-29", "status": "In Progress", "snippet": "Note: Through Mitra mobile app: 10 o'clock reading from the floor", "link": "…" }] }
```

**One record.** `GET /api/v1/records/rec-munyy41g-97-e22nuo` answers everything Mitra reads about a record:
- its status, and whether it can be changed now (`editable`);
- what can be done to it now (`actions`);
- its `layout` and `patchShape`;
- its data in words (`inWords`) and exactly as stored (`data`);
- its `history`.

```json
{
  "recordId": "rec-munyy41g-97-e22nuo", "documentId": "qc-viscosity",
  "document": { "id": "qc-viscosity", "formatNo": "F-QC-30", "name": "Lamination Adhesive Viscosity Record", "kind": "log-sheet" },
  "date": "2026-09-29", "status": "In Progress", "editable": true, "canReopen": false, "actions": ["submit", "delete"],
  "correction": null, "prepared": null, "photos": null,
  "layout": { "kind": "log-sheet", "columns": ["… as in the document …"], "rows": { "mode": "timeSlots", "slotKey": "time", "count": 24 } },
  "inWords": [{ "where": "10:00", "label": "Viscosity (20.0 ± 1.0 Sec.)", "value": "20.4 Sec." }, { "where": "10:00", "label": "Tested By", "value": "Jeni" }],
  "data": { "header": {}, "rows": [{ "id": "row-…", "time": "10:00", "viscosity": 20.4, "testedBy": "Jeni" }] },
  "history": [{ "at": "2026-09-30T10:35:00.815Z", "by": "Kapila Barad", "action": "assistant-edit", "note": "Through Mitra mobile app: 10 o'clock reading from the floor", "changes": [{ "label": "Row 2 (10:00) · Viscosity (20.0 ± 1.0 Sec.)", "before": "", "after": "20.4" }] }],
  "historyTotal": 1, "route": "/record/rec-munyy41g-97-e22nuo", "link": "http://dcrs-host:4000/index.html#/record/rec-munyy41g-97-e22nuo"
}
```

**As a PDF (Mitra's "print").** `GET /api/v1/records/{id}/pdf` answers the record's own page as a PDF. The file is named like `F-QC-32 Adhesive Mixing Ratio Record 2026-09-30.pdf`.
- **How it prints.** DCRS prints it exactly as its Print button does, signed in as the person, with the page allowed to write nothing. It takes about 4 to 6 seconds.
- **It is logged.** The activity log gets "Document downloaded as PDF", through the app.
- **Handing it over.** Hand it to the person with `withFiles(...)`.
- **Records it does not print.** A CAPA inspection report, a training record and a complaint checklist print from their own pages in DCRS. This route refuses them with `409 pdf-not-offered`.
- **When it cannot print.** The other refusals are the pest control report's: `503 pdf-unavailable` and `504 pdf-timeout`.

### History's figures

`GET /api/v1/figures?question=which machine broke down most this year?` answers the evidence DCRS itself works out for a question about what the records say over time:
- the period (`period`, `from`, `to`) and the topics (`topics`);
- one fact per line in `evidence`, with its records tagged `[rec:<id>]`;
- the same facts grouped under headings in `sections`.

The mobile app's model answers from `evidence`, as Mitra's does. `documentId`, `from` and `to` narrow the question. A question that is not about history is refused with `400 not-history`.

### HR Master Data

`GET /api/v1/people?q=Roshni` answers up to five people:

```json
{ "query": "Roshni", "people": [{ "gp3": "", "name": "Roshni Senma", "department": "Lab", "designation": "Lab Executive", "joiningDate": "2023-05-17" }] }
```

It answers only Human Resources, the super admin, and an account with no departments. DCRS gives HR Master Data to nobody else, so anybody else is refused with `403 not-your-department`.

### The equipment list (F/MNT/01)

In DCRS, Mitra answers "which machine is M-47?", "where is the Delta 330", "machines in QC" and "how many machines" from the equipment list, F/MNT/01, without asking the model. `GET /api/v1/equipment?q=M-47` gives the app the same:
- `answer`: Mitra's own reply to the words, as she gives it in DCRS. It is null when the words are not a question she answers there.
- `machines`: the machines the words name by number, or the one a serial only it has names (`exact`). When Mitra has no answer of her own, they are the machines DCRS's search finds for the words. A model name never picks one machine, because the list gives the same model to several (Brison 370 is M-13 and M-14).
- `list`: the list itself — how many machines, their numbers and the numbers it skips. Without `q` the answer is the list and its first machines.

Each machine has every column of the list. "NA" and "-" come back as null, and the one line the list prints one column out of step (M-68) is read back in step and says so in `note`.

```json
{
  "query": "which machine is M-47?",
  "list": { "formatNo": "F/MNT/01", "name": "List of Equipments & Utilities", "status": "Verified", "machines": 68, "numbered": { "first": "M-01", "last": "M-86", "count": 68 }, "gaps": ["M-05", "M-22 to M-32", "M-37 to M-42"], "…": "…" },
  "answer": "M-47, as F/MNT/01 (List of Equipments & Utilities) writes it:\n• Machine Description: UV Flexo Printing Machine\n• Machine Name / Model No.: Delta 330\n…",
  "exact": "M-47", "total": 1,
  "machines": [{ "machineNo": "M-47", "description": "UV Flexo Printing Machine", "model": "Delta 330", "manufacturer": "Lombardi", "location": "Lombardi Printing", "section": "Flexo", "size": "330 mm", "month": "November", "year": "2021", "serialNo": "88562", "countryOfOrigin": "Itlay", "summary": "M-47 · UV Flexo Printing Machine · Delta 330 · Lombardi Printing" }]
}
```

The list is Maintenance's. Anybody else is refused with `403 not-your-department`, as Mitra refuses them.

### What stands out (the insights)

With every message, DCRS gives Mitra one line of what stands out in the records the person can see: the counts by severity and the most severe titles. These are the same insights the Insights page and the Dashboard show, worked out over the person's departments only. `GET /api/v1/insights` gives the app that line as `headline`, and the insights behind it (`insights`, 10 unless `limit` says otherwise, at most 50), most severe first. Each insight has its title, what it means, a few of the records it was read from, and the CAPA DCRS suggests, where it suggests one.

```json
{ "date": "2026-10-02",
  "headline": "Insights (2 high, 0 medium, 0 low): [high] Device 1-54, 2-55, 3-56, 4-57 (F/QC/11): calibration expired on 22-Sep-2025, 375 days ago; [high] Device QC-76 (F/QC/12): calibration expired on 27-Aug-2024, 766 days ago;",
  "counts": { "high": 2, "medium": 0, "low": 0 }, "total": 2,
  "insights": [{ "rule": "C3", "severity": "high", "module": "Quality Control — Inspection Records", "documentId": "qc-weight-scale-calibration", "formatNo": "F/QC/12",
    "title": "Device QC-76 (F/QC/12): calibration expired on 27-Aug-2024, 766 days ago",
    "detail": "The latest F/QC/12 sheet for QC-76 (27-Mar-2024) gives Calibration Expiry 27-Aug-2024. …",
    "metric": { "label": "Expired", "value": "766 days ago" },
    "evidence": [{ "recordId": "qc-weight-scale-calibration-2024-03", "documentId": "qc-weight-scale-calibration", "dueDate": "2024-03-27", "field": "calibrationExpiry", "value": "27-Aug-2024" }], "evidenceTotal": 1 }] }
```

A record the insight was read from that DCRS's calendar has not stored yet has `recordId` null, as in the lists.

### The super admin's escalations

Every working day DCRS's server works out who keeps handing records in late or leaving them undone over the last 30 days (3 late, or 2 never done), names the person or, where several share the work, the department, and raises it with the super admin (the bell in DCRS). Mitra adds a line about the ones not yet acknowledged to what she knows when the super admin asks her something. `GET /api/v1/escalations` gives the app that line as `summary`, in the same words, and each escalation: who, the counts in a sentence, the documents with the most misses and up to ten of the records behind them. `open=0` gives every escalation of the last 30 days, the acknowledged ones too.

```json
{ "open": true, "today": "2026-10-02", "week": "2026-W40",
  "summary": "Escalated to the super admin, not yet acknowledged: Kapila Barad (3 late).",
  "waiting": 1, "total": 1,
  "escalations": [{ "kind": "person", "subjectName": "Kapila Barad", "departmentName": "Quality Control", "late": 3, "neverDone": 0, "sentence": "3 late in the 30 days to 02-Oct-2026 — F-QC-30: 3 late", "acknowledged": false, "records": [{ "what": "F-QC-30", "dueDate": "2026-09-28", "outcome": "late", "daysLate": 2 }] }] }
```

Escalations name people, so only the super admin gets them. Anybody else is refused with `403 super-admin-only`. Reading them changes nothing. An escalation is acknowledged in DCRS itself.

### Starting a record (CHANGE)

`POST /api/v1/records` with `{"documentId": "F-QC-30", "date": "2026-09-29"}` answers the document's record for that date. Leave out `date` for today.
- **A record already on file** is answered with `200` and `"created": false`. A scheduled document has one record per period.
- **Otherwise it is started**, and answered with `201` and `"created": true`. If the date is today or earlier, the record comes back prepared, exactly as DCRS's start-up prepares one: values are carried forward, and `prepared.notes` says what to check.
- **An as-required document** (a complaint, an inspection report) starts a new record every time.
- **The activity log** says "Record opened", through the app.

The answer is the record, in the shape of `GET /api/v1/records/{id}`.

### Changing a record (CHANGE)

```http
POST /api/v1/records/rec-munyy41g-97-e22nuo/changes
Authorization: Bearer <token>
X-Client-Name: Mitra mobile app
Content-Type: application/json

{"patch": {"itemEdits": [{"collection": "rows", "match": {"time": "10:00"}, "set": {"viscosity": "20.4", "testedBy": "Jeni"}}]},
 "note": "10 o'clock reading from the floor"}
```

The patch is Mitra's own shape. DCRS applies it exactly as Mitra does:

| Form | Patch |
|---|---|
| Any form | `{"<field key>": value}` |
| A log sheet | a box: `{"header": {"<box key>": value}}`; one line: `{"itemEdits": [{"collection": "rows", "match": {"<slot key>": "10:00"}, "set": {"<column key>": value}}]}` (or `"match": {"row": 2}`); or `"rows"` given in full, each row with its `id` |
| F/HR/17 | `{"checkpoints": {"1": "Yes", "4": 100, "8": {"value": "Yes", "note": "near the store"}}, "checker": "Roshni", "timeOfChecking": "09:30"}` |
| A list of any other form | `{"itemEdits": [{"collection": "<list key>", "match": {"<key>": value}, "set": {"<key>": value}}]}` |

`GET /api/v1/records/{id}` gives each record's keys (`layout`) and its patch shape (`patchShape`).

**Values are read as the form stores them.**
- "yes" becomes Yes, "9.15 am" becomes 09:15, and "20.4" becomes the number 20.4.
- A select takes its option in any case.

**What cannot be written is left out.** DCRS leaves out, and says in `problems`:
- a field the form does not have;
- a printed or computed column;
- a value the box cannot hold;
- a line the match does not name exactly.

```json
{
  "recordId": "rec-munyy41g-97-e22nuo", "status": "In Progress", "editable": true, "actions": ["submit", "delete"],
  "history": [{ "at": "2026-09-30T10:35:00.815Z", "by": "Kapila Barad", "action": "assistant-edit", "note": "Through Mitra mobile app: 10 o'clock reading from the floor", "changes": [{ "label": "Row 2 (10:00) · Viscosity (20.0 ± 1.0 Sec.)", "before": "", "after": "20.4" }, { "label": "Row 2 (10:00) · Tested By", "before": "", "after": "Jeni" }] }],
  "changes": [{ "label": "Row 2 (10:00) · Viscosity (20.0 ± 1.0 Sec.)", "before": "", "after": "20.4" }, { "label": "Row 2 (10:00) · Tested By", "before": "", "after": "Jeni" }],
  "problems": [],
  "link": "http://dcrs-host:4000/index.html#/record/rec-munyy41g-97-e22nuo"
}
```

**When nothing changes.** A patch that changes nothing is `400 nothing-changed`, with the reasons:

```json
{ "error": "Nothing on the form changed.", "code": "nothing-changed", "problems": ["\"remarks\" isn't a field on this form, so I left it out."] }
```

**A record not open for writing.** A submitted, verified or sent-back record is `409 needs-reopen`. Mitra asks the person before she reopens a record, and so must the app. Reopen it with a reason first (the `reopen` action below), then change it.

```json
{ "error": "the Adhesive Mixing Ratio Record of 30-Sep-2026 is Pending Verification and cannot be changed as it stands. Reopen it for correction first, with a reason (action \"reopen\"); it will then need submitting and verifying again.", "code": "needs-reopen", "status": "Pending Verification", "canReopen": true }
```

### Acting on a record (CHANGE)

`POST /api/v1/records/{id}/actions` with `{"action": "submit"}` does what the record page's buttons do, through DCRS's own lifecycle and validation:

| action | When | What DCRS does | The activity log says |
|---|---|---|---|
| `submit` | Scheduled, Due or In Progress | Checks the record as its Submit button does; `409 invalid` with the `problems` when something is missing | Record submitted for verification |
| `verify` (or `approve`) | Submitted or Pending Verification | Verifies it (a complaint checklist's approval stamps Approved By with the person and today) | Record verified |
| `send_back` + `reason` | Submitted or Pending Verification | Sends it back with the reason | Record sent back |
| `resume` | Rejected (sent back) | Back to In Progress | Record resumed |
| `reopen` + `reason` | Submitted, Pending Verification, Verified or Rejected | Reopens it for correction; it must be submitted and verified again | Record reopened for correction |
| `cancel_correction` | While reopened for correction | Puts it back exactly as it was, at the status it was reopened from | Correction cancelled |
| `delete` + `reason` | Any | Deletes it; the deletion, with "Through Mitra mobile app: \<reason\>", stays on the deletions log | Record deleted |

```json
{ "done": "verify", "did": "Verified", "recordId": "rec-munyt9an-14-7g7ku2", "status": "Verified", "editable": false, "actions": ["reopen", "delete"],
  "history": [{ "at": "2026-09-30T10:32:13.959Z", "by": "Super Admin", "action": "verified", "note": "Through Mitra mobile app: verified", "fromStatus": "Pending Verification" }] }
```

A record the assistant prepared is submitted only with `"reviewed": true`, after the person ticked "Reviewed and correct" (`409 needs-review` otherwise); see [Submitting a prepared record](#submitting-a-prepared-record-reviewed-first).

An action that does not apply to the record as it stands is refused with `409 wrong-status`. The refusal's `actions` list says what does apply. A missing reason is `400 needs-reason`.

```json
{ "error": "Submitting it cannot be done yet: 09:00: Viscosity (20.0 ± 1.0 Sec.) is required. 09:00: Tested By is required.", "code": "invalid", "problems": ["09:00: Viscosity (20.0 ± 1.0 Sec.) is required.", "09:00: Tested By is required."] }
```

### Adding a photo (CHANGE)

`POST /api/v1/records/{id}/photos` with `{"fileName": "seal.jpg", "mimeType": "image/jpeg", "dataBase64": "<the bytes, base64>", "note": "optional"}` adds a picture to a record's picture list. The record must have one: the complaint acknowledgement has photos, the service agreement has scans. The picture is added as Mitra adds one, with the history note "Through Mitra mobile app: photo seal.jpg added".

The picture's rules:
- **Kinds.** JPEG, PNG or WebP only. Its bytes must be what `mimeType` says.
- **Size.** At most 512 KB — a 1024 px JPEG at 70% is about 60–150 KB. Every picture is kept inside the records
  item, which must fit in each browser's storage, so a larger one is refused rather than kept.
- **Scale it first.** DCRS keeps photos scaled to at most 1024 pixels on the longer side, as JPEG at 70%. The browser does that scaling, but the server cannot (it has no canvas), so the app must scale the picture before it sends it.

The refusals:

| Answer | When |
|---|---|
| `413 too-large` | The picture is over 512 KB |
| `415 bad-picture` | The kind is wrong, or the bytes are not what `mimeType` says |
| `409 no-photo-list` | The record has no picture list |

### Sample data (CHANGE)

`POST /api/v1/records/{id}/sample-fill` fills the whole record with realistic but made-up values, exactly as Mitra does.
- **It stays a draft.** Nothing is submitted.
- **It is marked as made up.** The history says "Through Mitra mobile app: Filled with sample data by the assistant, on request — realistic, but made up". The answer says `"madeUp": true`, and `summary` says what to check.
- **Tell the person.** The app must tell the person that every value is made up.

A form kept as issued has no sample data, and is refused with `409 no-sample`.

### The new refusals

These are added to the table in [Errors](#errors). Each is shown to the person in DCRS's own words, from `error`.

| Status | Codes | Connector error |
|---|---|---|
| 400 | `bad-patch`, `nothing-changed`, `needs-reason`, `bad-action`, `not-history`, `ambiguous`, `bad-picture` | `invalid_request` |
| 403 | `not-your-department` (a document, a record, HR Master Data, the equipment list); `super-admin-only` (the escalations) | `forbidden` |
| 404 | `not-found`, `not-in-dcrs` | `not_found` |
| 409 | `needs-reopen`, `wrong-status`, `invalid`, `reference-only`, `no-photo-list`, `no-sample`, `pdf-not-offered`, `busy` | `conflict` |
| 413, 415 | `too-large`, `bad-picture` | `invalid_request` |
| 500, 503 | `engine-failed`, `engine-unavailable`; `database-unavailable` (the escalations could not be read) | `unavailable` |

### Limits

- **The first question after an update is slower.** The DCRS server bundles its engine when it is first asked, if DCRS's code has changed since the last time. That takes a few seconds, and the first answer waits for it. After that the engine stays ready.
- **"Today" is the DCRS server's day.** DCRS's engine counts the day by the server's clock, as the browser counts it by the plant computer's. The plant's server runs on factory time. A server anywhere else must be started with `TZ=Asia/Kolkata`, and warns in its log if it is not.
- **Pictures are not scaled on the server** (see [Adding a photo](#adding-a-photo-change)).
- **Some records have no PDF here.** CAPA inspection reports, training records and complaint checklists print from their own pages in DCRS, which the PDF printer does not open. Their `link` opens the page, which has its own Print button.
- **Sheets not opened yet have no id.** A sheet DCRS's calendar has made but not stored has `recordId: null` (see [Today](#today)). Start it with `open_record`.
- **The format is not changed from the app** (see `change_format` in [Not offered](#mitras-tools-and-the-routes)).

## Notifications and the phone

REQUIREMENTS §97. Every morning DCRS prepares the day's records on its own server, then tells each person what they answer for: in the website (the bell and the Notifications page) and on the phone (the inbox, Tasks and a push that arrives with the app closed). DCRS keeps the notifications in PostgreSQL and words them on every read in the language asked. The phone app talks only to the Mitra server, which relays these routes as the signed-in person; it holds no notification logic of its own.

### Who is told what, and when

| `kind` | Who | `data` | Ends when |
|---|---|---|---|
| `ready` | The people who answer for the document (with Write or more on it); nobody named: the super admin | `documentId`, `formatNo`, `documentName`, `module`, `recordId`, `dueDate` | The record leaves In Progress |
| `needs_input` | As `ready` | as `ready`, and `count`: the things still stopping a submit (the readings to enter) | The record leaves In Progress, or passes the checks (it becomes `ready`) |
| `due` | As `ready` | `documentId`, `formatNo`, `documentName`, `module`, `dueDate`, `recordId` when the sheet exists | The record is started or submitted, or the day ends (it becomes `overdue`) |
| `upcoming` | As `ready` | as `due` | The due date arrives, or the record is submitted |
| `overdue` | As `ready` | as `ready`, and `daysLate` (updated daily) | The record is submitted |
| `verify` | Everyone with Write on the document other than the submitter; nobody: the super admin | as `ready`, and `by` (the submitter) | The record is verified or sent back |
| `sent_back` | The person who submitted it | as `ready`, and `reason` and `by` (who sent it back) | The record is submitted again |
| `boss_summary` | Every active super admin, morning and evening | `modules` (counts by module), `part`, `dueDate` (the day) | The next day |
| `escalation` | Every active super admin | `subject`, `module`, `late`, `neverDone` | It is acknowledged |
| `access_changed` | The person whose access changed | `module` or `documentName`, `level`, `by` | It is read |

Frequency decides timing. Daily documents are prepared in the morning and nagged the same day. Weekly and fortnightly documents get a heads-up (`upcoming`) on the working day before. Monthly, quarterly and yearly documents get one three days ahead. As-required documents are told only when started, or when their two-day allowance runs out. Nothing is due on a closed day (the weekly off, a festival holiday).

A record's values are never in a notification: ids, document names and counts only.

### The routes

| Route | What it does |
|---|---|
| `GET /api/v1/notifications?state=open\|all&limit=50&before=<id>&lang=en\|hi\|gu` | The person's own notifications, newest first: `{ items, unread, open }`. `state=open` (the default) is what still needs the person; `all` is everything of the last 60 days. `before` pages back. Nobody reads another person's items. |
| `POST /api/v1/notifications/read` | `{ "ids": [412, 409] }` or `{ "all": true }`: marks the person's own items read. Answers `{ "unread": 0 }`. |
| `POST /api/v1/devices` | `{ "token": "ExponentPushToken[...]", "platform": "android", "language": "gu", "appVersion": "1.1.0", "deviceName": "Galaxy A14" }`: keeps this phone's Expo push token for the person, with the language its pushes are worded in. Send it again when the token or the language changes. A token another account had moves to this one. Answers `{ "ok": true }`. |
| `DELETE /api/v1/devices` | `{ "token": "..." }`: forgets the phone (at sign-out). Answers `{ "ok": true }`. |
| `GET /api/v1/notification-preferences` | `{ "kinds": { "ready": true, ... every kind }, "reminders": false }`. A kind is pushed unless switched off. `reminders` (the phone's own 08:50 and 17:30 reminders) is absent until the person chooses. |
| `PUT /api/v1/notification-preferences` | The same shape; kinds left out keep their setting. A kind switched off is not pushed, and still reaches the inbox. Answers as GET. |
| `POST /api/v1/notifications/test` | Sends a test push to the caller's own phones, in each phone's language. Answers `{ "sent": 1 }`, or `{ "sent": 0, "reason": "..." }` when push is off on the server or no phone is registered. One test per 20 seconds. |

The website reads the same through its session cookie: `GET /api/notifications` and `POST /api/notifications/read`.

```json
{
  "items": [
    {
      "id": 412, "kind": "needs_input", "priority": "high",
      "title": "12 readings to enter: Daily Pest Control Monitoring Record",
      "body": "F/HR/17 Daily Pest Control Monitoring Record of 09-Oct-2026 is ready for you: 12 readings to enter, then submit.",
      "data": { "documentId": "daily-pest-monitoring", "formatNo": "F/HR/17", "documentName": "Daily Pest Control Monitoring Record", "module": "HR", "recordId": "rec-mgj2k1-7-abcd12", "dueDate": "2026-10-09", "count": 12 },
      "createdAt": "2026-10-09T03:00:12.000Z", "readAt": null, "resolvedAt": null
    }
  ],
  "unread": 1,
  "open": 1
}
```

`title` and `body` are worded on every read in the language asked (`lang`, English when left out). Show them as they come; open `data.recordId` with `GET /api/v1/records/{id}` (the Review screen), or the Tasks list when there is none.

### What a push carries

DCRS sends the pushes itself, through Expo's push service, to the tokens registered with `POST /api/v1/devices`. At most one push per person each time the server looks (every 5 minutes), worded in the phone's language:

```json
{
  "to": "ExponentPushToken[...]",
  "title": "Ready for you: Lamination Adhesive Viscosity Record",
  "body": "F-QC-30 Lamination Adhesive Viscosity Record of 09-Oct-2026 is ready. Review it, then submit.",
  "data": { "url": "mitra://task/rec-mgj2k1-7-abcd12", "kind": "ready", "notificationId": 413, "recordId": "rec-mgj2k1-7-abcd12", "count": 1 },
  "channelId": "tasks",
  "priority": "high",
  "sound": "default",
  "badge": 3
}
```

- **`data.url`** is the deep link: `mitra://task/<recordId>` for one record, `mitra://inbox` for several ("3 records need you: ...", the top three document names in the body) or for an item with no record.
- **`data.kind`** is the item's kind, or `group` for several, or `test` for the test push; `data.notificationId` is the item's id when there is one item; `data.count` is how many items the push stands for.
- **`channelId`** is the Android channel: `tasks` (high importance) for the person's work, `summary` (default importance) for the super admin's summaries and the heads-ups.
- **`badge`** is the person's open items.
- **When.** The staff are pushed only inside the plant's working hours on working days (08:40 to 18:20 unless the super admin changes them): their tasks (`ready`, `needs_input`, `due`) at most once in each of three slots: first after the morning prepare (08:30, `PREPARE_AT`), a "still open" reminder at 15:30 (title "Still open: ...") and a last call at 17:45 ("Last call: ..."); a task that comes up after a slot's push waits for the next slot. An overdue reminder once a day from 09:30; a heads-up once, the working day before its due date; `verify`, `sent_back`, `access_changed`, `boss_summary` and `escalation` at once. Anything that comes up outside the hours waits for the next window. The super admin can be pushed at any hour. A kind the person switched off is not pushed (it is still in the inbox).
- **Never a record's values.** A push carries ids, document names and counts only; a send-back's reason stays in the inbox.
- **Android needs Firebase Cloud Messaging** for pushes to arrive (see DEPLOYMENT.md, "Push notifications"). Until the owner's Firebase project is set up, registration fails on the phone and the app still has its inbox, Tasks and its own reminders. Expo Go on Android cannot receive remote pushes (Expo SDK 53 and later): use the 1.1.0 build. iPhones get the inbox and the app's own reminders; remote pushes need a paid Apple developer account.

### Today, by person

`GET /api/v1/today` (see [Today](#today)) now answers, for a person, what they answer for (REQUIREMENTS §96) and the records they may verify; for an account nobody has described yet, every document it may fill. Every item gains:
- `module`: the module's code (QC, HR, SYS, MNT, PRD, PUR, STR, MKT, DISP or QA);
- `canSubmit`: the person's level on the document is Write or more and the record is being filled in;
- `canVerify`: Write or more and the record is submitted.

The super admin gets everything, and `byModule`: the lists counted by module.

### Submitting a prepared record: reviewed first

A record the assistant prepared carries its `prepared` stamp (`GET /api/v1/records/{id}`). It is submitted only after the person has checked every value and ticked "Reviewed and correct" on the review screen (REQUIREMENTS §62): send

```json
{ "action": "submit", "reviewed": true }
```

Without `reviewed`, DCRS refuses it with `409 needs-review`. With it, the record's history says "Through Mitra mobile app: Submitted from the phone after review". Mitra's own submit tool puts the record's values on its confirmation card and sends `reviewed: true` only after the person confirms.

### The refusals of these routes

| Status | Codes | Connector error |
|---|---|---|
| 400 | `bad-request` (a value the route does not accept: `lang`, `ids`, `token`, `kinds`) | `invalid_request` |
| 409 | `needs-review` (a prepared record submitted without `"reviewed": true`) | `conflict` |
| 429 | `too-many` (a second test push within 20 seconds) | `rate_limited` |

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
   SUPER_ADMINS=<the DCRS super admin's email, lower case (the Mitra mobile app also counts DCRS's own super admin without it)>
   ```

8. **Optionally, comment the tables.** `database/sql/optional/chatbot-table-comments.sql` in this repository describes every table and column of the assistant in plain English. Add it as a migration of the assistant's own, after `0000_init.sql`, so the assistant's tables explain themselves in the database viewer and the data dictionary. A DBA may instead run it once after the assistant has made its tables.

9. **Run the assistant's own tests** (`npm test`). They use an in-memory PGlite, which creates the schema the same way.

Once the new migration files exist, send them to the DCRS side. The overview views over the assistant's tables (`database/sql/03-overview-chatbot.sql`) are written and tested against the copy's tables. They are applied to the real database only when checked against the real files.

Once those views exist, a later migration of the assistant that changes or drops a column one of them reads would be refused by PostgreSQL. Before such a migration, the DBA runs `npm run db:shared -- setup --rebuild-views`, which sets the views over the assistant's tables aside. The assistant then migrates, and `npm run db:shared -- setup --with-chatbot` puts the views back ([docs/database/README.md](database/README.md), section 4). Adding a table or a column needs none of this.

## Checking it works

- **The assistant starts on an empty schema.** Start it against the shared database with `DATABASE_URL` as above. It creates its tables in `chatbot`, and stopping and starting it again changes nothing.
- **The assistant cannot read DCRS's data.** `npm run db:shared -- test` in this repository runs the database checks against a copy. Among them: the assistant's role is refused every DCRS table, and the viewer can read only the overview.
- **A change shows at once.** Close a finding through the assistant. Then:
  - DCRS's page for that report shows it Closed, with the history entry "Through Mitra mobile app: ...".
  - DCRS's Activity Log shows "Record edited" by that person.
  - The Database overview (DCRS, admin area) lists it under "What changed in DCRS through the Audit Assistant?".

## Test account

A test account exists in the development data, with the departments the calls above need: Quality Assurance, Human Resources and Marketing. Its email and password were given in the chat that set this up, and are never written in the repository.

## Known limits

- **Stale open pages.** A DCRS page that shows a CAPA report and stays open while the assistant closes one of its findings keeps its own copy of the report. If the person then edits that open page, the edit can put the finding back to Open. This is how DCRS's CAPA page behaves today, and it is the same between two people's browsers. The fix belongs to DCRS; until it is made, the person should reload the page.
- **No other closes.** The API closes internal CAPA findings only. Complaints are closed by the QA Head's approval, and internal-audit non-conformances (F/SYS/10, F/SYS/11) are not offered.
- **The PDF needs Chrome or Edge.** It needs Google Chrome or Microsoft Edge on the DCRS server, and the DCRS app built. Set `DCRS_PDF_BROWSER` to the browser's path if it is installed somewhere unusual.
