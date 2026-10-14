// The DCRS connector inside the real server: signing in through /auth/login, a lookup, a change that waits for the
// person's confirmation, and a DCRS sign-in that has ended. DCRS is the stand-in; the model is scripted.
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { AssistantReply, LoginResponse } from '@shared/api.ts';
import { buildApp } from '../src/app.ts';
import { createDcrsConnector } from '../src/connectors/dcrs/index.ts';
import { createRegistry } from '../src/connectors/registry.ts';
import { openDatabase, type Database } from '../src/db/index.ts';
import { actions, connectorCredentials, loginEvents, sessions } from '../src/db/schema.ts';
import { BASE, json, RECORD, refusal, signedIn, standInDcrs, TOKEN, type Route } from './dcrs-standin.ts';
import { callsTool, says, scriptedModel, testConfig } from './helpers.ts';

let database: Database;
beforeAll(async () => {
  database = await openDatabase('memory://');
});
afterAll(async () => {
  await database.close();
});

// The server each test starts, closed after it.
let running: Awaited<ReturnType<typeof buildApp>> | undefined;
beforeEach(async () => {
  await database.db.execute(sql`truncate users, sessions, connector_credentials, login_events, conversations, actions, message_events, files, conversation_exports, weekly_reports cascade`);
});
afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function start(routes: Record<string, Route> = {}) {
  const dcrs = standInDcrs(routes);
  // The real connector, on the stand-in DCRS but on the real clock, so the sign-in it makes has not already ended.
  const connector = createDcrsConnector({ baseUrl: BASE, fetch: dcrs.fetch });
  const model = scriptedModel();
  const app = await buildApp(
    {
      config: testConfig({ dcrsBaseUrl: BASE, superAdmins: new Set(['admin@gpp.local']) }),
      db: database.db,
      registry: createRegistry([connector], 'dcrs'),
      model: model.model,
      transcriber: async () => '',
      imageReader: async () => '',
    },
    { logger: false },
  );
  const login = (password = 'SeedQA@2026') =>
    app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'kapila.barad@gpp.local', password, device: { deviceId: 'kapila-phone', name: 'Kapila phone', os: 'Android' } },
    });
  const as = (token: string) => ({
    post: (url: string, payload: object) => app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` }, payload }),
    get: (url: string) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } }),
  });
  running = app;
  return { app, dcrs, model, login, as };
}

it('signs a person in with their DCRS account, keeping the session to the close of the DCRS day', async () => {
  const { login, dcrs } = await start({ 'POST /api/auth/login': () => signedIn({ maxAge: 3_600 }) });
  const response = await login();
  expect(response.statusCode).toBe(200);
  expect(response.json<LoginResponse>().user).toMatchObject({ username: 'kapila.barad@gpp.local', displayName: 'Kapila Barad', role: 'user' });

  const [session] = await database.db.select().from(sessions);
  // The server's own session ends when DCRS's does, an hour from now, not after SESSION_TTL_DAYS.
  expect(session!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 3_600_000);
  expect(session!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3_500_000);
  const [stored] = await database.db.select().from(connectorCredentials);
  expect(stored!.sealed).not.toContain(TOKEN);
  expect(dcrs.seen.map((r) => r.headers['x-client-name'])).toEqual(['Mitra mobile app', 'Mitra mobile app']);
});

it("turns a sign-in down in DCRS's own words outside working hours, and a wrong password as such", async () => {
  const closed = 'Staff working hours: 8:40 am to 6:20 pm on working days. Today is Thursday, the weekly off; staff hours start again on Friday 2 October at 8:40 am.';
  const { login } = await start({ 'POST /api/auth/login': (r) => ((r.body as { password: string }).password === 'wrong' ? json(401, { error: 'Invalid email or password.' }) : refusal(403, 'outside-working-hours', closed)) });
  const refused = await login();
  expect(refused.statusCode).toBe(403);
  expect(refused.json()).toMatchObject({ error: 'forbidden', message: closed });
  const wrong = await login('wrong');
  expect(wrong.statusCode).toBe(401);
  const events = await database.db.select().from(loginEvents);
  expect(events.map((e) => e.failureReason).sort()).toEqual(['forbidden', 'invalid_credentials']);
});

it("answers a lookup at once, and starts today's record only once the person confirms", async () => {
  const { login, as, dcrs, model } = await start({
    'GET /api/v1/today': () => json(200, { today: '2026-09-30', workingDay: true, due: [{ document: 'Daily Pest Control Monitoring Record', documentId: 'daily-pest-monitoring' }] }),
    'GET /api/v1/documents/daily-pest-monitoring': () => json(200, { id: 'daily-pest-monitoring', formatNo: 'F/HR/17', name: 'Daily Pest Control Monitoring Record' }),
    // DCRS's day for "today", which the card is pinned to.
    'GET /api/v1/records': () =>
      json(200, { document: { id: 'daily-pest-monitoring', formatNo: 'F/HR/17', name: 'Daily Pest Control Monitoring Record' }, from: '2026-09-30', to: '2026-09-30', total: 0, records: [] }),
    'POST /api/v1/records': () => json(201, { recordId: 'rec-new', existed: false, status: 'Draft', date: '2026-09-30' }),
  });
  const token = (await login()).json<LoginResponse>().token;
  const kapila = as(token);

  model.queue(callsTool('dcrs__todays_facts', {}), says('The daily pest control record is due today.'));
  const facts = (await kapila.post('/assistant/messages', { text: 'What is due today?' })).json<AssistantReply>();
  expect(facts).toMatchObject({ reply: 'The daily pest control record is due today.', confirmation: null });
  expect(model.requests[1]!.messages.at(-1)).toMatchObject({ role: 'tool', content: expect.stringContaining('daily-pest-monitoring') });
  expect(model.requests[0]!.tools.map((tool) => tool.function?.name)).toContain('dcrs__edit_record');

  model.queue(callsTool('dcrs__open_record', { documentId: 'daily-pest-monitoring' }, "I'll start today's record."));
  const proposed = (await kapila.post('/assistant/messages', { text: "Start today's pest control record", conversationId: facts.conversationId })).json<AssistantReply>();
  expect(proposed.confirmation?.changes).toEqual([
    { system: 'Digital Controlled Record System', summary: "Open today's record of F/HR/17 Daily Pest Control Monitoring Record, starting it if there is none yet" },
  ]);
  // Described by asking DCRS which document the words name and which day today is; nothing started yet.
  expect(dcrs.seen.filter((r) => r.path === '/api/v1/records' && r.method === 'POST')).toEqual([]);
  expect(dcrs.seen.filter((r) => r.path === '/api/v1/records' && r.method === 'GET')).toMatchObject([{ query: { documentId: 'daily-pest-monitoring', from: 'today', to: 'today' } }]);

  model.queue(says("Done. Today's record is started."));
  const done = await kapila.post(`/assistant/conversations/${proposed.conversationId}/decision`, { confirmationId: proposed.confirmation!.id, decision: 'confirm' });
  expect(done.json<AssistantReply>().reply).toBe("Done. Today's record is started.");
  const started = dcrs.seen.filter((r) => r.path === '/api/v1/records' && r.method === 'POST');
  expect(started).toMatchObject([{ method: 'POST', body: { documentId: 'daily-pest-monitoring', date: '2026-09-30' }, headers: { authorization: `Bearer ${TOKEN}`, 'x-client-name': 'Mitra mobile app' } }]);

  const logged = await database.db.select({ action: actions.action, kind: actions.kind, status: actions.status }).from(actions);
  expect(logged).toEqual(
    expect.arrayContaining([
      { action: 'todays_facts', kind: 'read', status: 'succeeded' },
      { action: 'open_record', kind: 'write', status: 'succeeded' },
    ]),
  );
});

it("shows a record's values on Mitra's submit card, and tells DCRS it was reviewed only once the person confirms", async () => {
  const { login, as, dcrs, model } = await start({
    'GET /api/v1/records/rec-1': () => json(200, RECORD),
    'POST /api/v1/records/rec-1/actions': () => json(200, { done: 'submit', recordId: 'rec-1', status: 'Pending Verification', editable: false, actions: ['verify', 'send_back'] }),
  });
  const kapila = as((await login()).json<LoginResponse>().token);

  model.queue(callsTool('dcrs__record_action', { recordId: 'rec-1', action: 'submit' }, "Here is what it says. I'll submit it once you confirm."));
  const proposed = (await kapila.post('/assistant/messages', { text: 'Submit the line clearance' })).json<AssistantReply>();
  expect(proposed.confirmation?.changes).toEqual([
    {
      system: 'Digital Controlled Record System',
      summary: 'Submit record rec-1. Its values: Line No.: 3; row 1: Status: OK. Confirming says you have reviewed them and they are correct.',
    },
  ]);
  // Only read while the card waits.
  expect(dcrs.seen.filter((r) => r.path === '/api/v1/records/rec-1/actions')).toEqual([]);

  model.queue(says('Submitted.'));
  await kapila.post(`/assistant/conversations/${proposed.conversationId}/decision`, { confirmationId: proposed.confirmation!.id, decision: 'confirm' });
  expect(dcrs.seen.filter((r) => r.path === '/api/v1/records/rec-1/actions')).toMatchObject([
    { method: 'POST', body: { action: 'submit', reviewed: true }, headers: { authorization: `Bearer ${TOKEN}`, 'x-client-name': 'Mitra mobile app' } },
  ]);
});

it('ends the session when DCRS says its sign-in has ended', async () => {
  const { login, as, model } = await start({ 'GET /api/v1/today': () => refusal(401, 'not-signed-in', 'Not signed in, or the session has ended.') });
  const token = (await login()).json<LoginResponse>().token;
  model.queue(callsTool('dcrs__todays_facts', {}));
  const response = await as(token).post('/assistant/messages', { text: 'What is due today?' });
  expect(response.statusCode).toBe(401);
  expect(response.json()).toMatchObject({ error: 'session_expired' });
  const [session] = await database.db.select().from(sessions).where(eq(sessions.endReason, 'upstream_signed_out'));
  expect(session).toBeDefined();
  expect((await as(token).get('/me')).statusCode).toBe(401);
});

it("passes a refusal on in DCRS's words and carries on", async () => {
  const { login, as, model } = await start({
    'GET /api/v1/people': () => refusal(403, 'not-your-department', 'HR Master Data belongs to Human Resources, and this account is not kept to it.'),
  });
  const token = (await login()).json<LoginResponse>().token;
  model.queue(callsTool('dcrs__hr_master_lookup', { q: 'Roshni' }), says('Only Human Resources can look people up.'));
  const reply = (await as(token).post('/assistant/messages', { text: 'Who is Roshni?' })).json<AssistantReply>();
  expect(reply.reply).toBe('Only Human Resources can look people up.');
  expect(model.requests[1]!.messages.at(-1)).toMatchObject({
    role: 'tool',
    content: JSON.stringify({ error: 'HR Master Data belongs to Human Resources, and this account is not kept to it.' }),
  });
});

it("makes DCRS's super admin the app's super admin from DCRS's own answer, and stops at the next sign-in when DCRS says otherwise", async () => {
  let role = 'admin';
  const { app, as } = await start({
    'GET /api/v1/me': () => json(200, { id: 'u-owner', name: 'Owner', email: 'owner@gpp.local', role, departments: [] }),
  });
  // Not in SUPER_ADMINS (the test's list has admin@gpp.local only): DCRS's word is enough.
  const signIn = (deviceId: string) =>
    app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'owner@gpp.local', password: 'x', device: { deviceId, name: deviceId, os: 'Android' } } });
  const first = await signIn('owner-phone');
  expect(first.statusCode).toBe(200);
  expect(first.json<LoginResponse>().user.role).toBe('super_admin');
  const owner = as(first.json<LoginResponse>().token);
  expect((await owner.get('/me')).json()).toMatchObject({ user: { role: 'super_admin' } });
  expect((await owner.get('/admin/accounts')).statusCode).toBe(200);

  // The role is taken away in DCRS: at the next sign-in it no longer counts, on every device of the person.
  role = 'staff';
  const second = await signIn('owner-tablet');
  expect(second.json<LoginResponse>().user.role).toBe('user');
  expect((await owner.get('/me')).json()).toMatchObject({ user: { role: 'user' } });
  expect((await owner.get('/admin/accounts')).statusCode).toBe(403);
});

it('keeps SUPER_ADMINS as an extra list beside DCRS', async () => {
  const { app } = await start({
    'GET /api/v1/me': () => json(200, { id: 'u-admin', name: 'Admin', email: 'admin@gpp.local', role: 'staff', departments: [] }),
  });
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'admin@gpp.local', password: 'x', device: { deviceId: 'd1' } } });
  expect(response.json<LoginResponse>().user.role).toBe('super_admin');
});

const ADD_LINE = { addItems: { rows: [{ time: '11:00', viscosity: 20.2, checkedBy: 'Jeni' }] } };
const TITLE_32 = 'the Adhesive Mixing Ratio Record of 11-Oct-2026';
const UNDO = { removeItems: { rows: ['row-c3'] } };

/** The last thing the model was told: a tool's result, as JSON. */
function lastToldTo(model: ReturnType<typeof scriptedModel>): Record<string, unknown> {
  return JSON.parse((model.requests.at(-1)!.messages.at(-1) as { content: string }).content) as Record<string, unknown>;
}

it("adds, undoes and corrects lines through DCRS's dry run (§113): the card from the dry run, the real call on yes, Undo by the added line's id, the reason asked for a signed-off record", async () => {
  const preview = (extra: Record<string, unknown>) => ({ dryRun: true, recordId: 'rec-32', title: TITLE_32, status: 'In Progress', editable: true, willReopen: false, changes: [], added: [], removed: [], cleared: [], problems: [], ...extra });
  const made = (extra: Record<string, unknown>) => ({ recordId: 'rec-32', status: 'In Progress', editable: true, actions: ['submit'], history: [], changes: [], added: [], removed: [], cleared: [], problems: [], ...extra });
  const LINE = 'line 3 (11:00, 20.2, Jeni)';
  let verified = false;
  const { login, as, dcrs, model } = await start({
    'POST /api/v1/records/rec-32/changes': (r) => {
      const body = r.body as { patch: Record<string, unknown>; dryRun?: boolean; reason?: string };
      const removing = !!body.patch.removeItems;
      if (verified && !body.reason) {
        return body.dryRun
          ? json(200, preview({ status: 'Verified', editable: false, willReopen: true, reasonNeeded: true, removed: [LINE] }))
          : refusal(409, 'needs-reopen', 'This record is Verified: reopen it for correction, with a reason.', { reasonNeeded: true, canReopen: true });
      }
      if (body.dryRun) {
        return json(200, removing ? preview({ removed: [LINE], ...(verified ? { status: 'Verified', editable: false, willReopen: true, reasonNeeded: false } : {}) }) : preview({ added: [{ collection: 'rows', words: '11:00 · 20.2 · Jeni' }] }));
      }
      return json(200, removing ? made({ removed: [LINE], ...(verified ? { reopened: true } : {}) }) : made({ added: [{ collection: 'rows', id: 'row-c3', row: 3, words: '11:00 · 20.2 · Jeni' }] }));
    },
  });
  const kapila = as((await login()).json<LoginResponse>().token);
  const changes = () => dcrs.seen.filter((r) => r.path === '/api/v1/records/rec-32/changes').map((r) => r.body);

  // ADD: the card lists the line back, no question; only the dry run was asked while it waits.
  model.queue(callsTool('dcrs__edit_record', { recordId: 'rec-32', patch: ADD_LINE, note: 'from the floor' }, 'I can add that line.'));
  const proposed = (await kapila.post('/assistant/messages', { text: 'Add a line 11:00 viscosity 20.2 Jeni to F-QC-32' })).json<AssistantReply>();
  expect(proposed.confirmation?.changes).toEqual([{ system: 'Digital Controlled Record System', summary: `Add a line (11:00 · 20.2 · Jeni) in ${TITLE_32}. (note: "from the floor")` }]);
  expect(changes()).toEqual([{ patch: ADD_LINE, dryRun: true }]);

  model.queue(says('Done. Added line 3 (11:00 · 20.2 · Jeni). Say "undo" to take it off again.'));
  const added = (await kapila.post(`/assistant/conversations/${proposed.conversationId}/decision`, { confirmationId: proposed.confirmation!.id, decision: 'confirm' })).json<AssistantReply>();
  expect(added.reply).toContain('Added line 3');
  expect(changes().at(-1)).toEqual({ patch: ADD_LINE, note: 'from the floor' });
  // The model was told what was added, in words, with the Undo patch by the line's id as DCRS stored it.
  expect(lastToldTo(model)).toMatchObject({ said: 'Added 11:00 · 20.2 · Jeni.', added: [{ id: 'row-c3' }], undoPatch: UNDO });
  expect(lastToldTo(model)).not.toHaveProperty('recordCard');
  // The chat shows the record as a card with the line touched, which opens the Review screen at that line.
  const saved = (await kapila.get(`/assistant/conversations/${proposed.conversationId}`)).json<{ messages: { parts?: { type: string }[] }[] }>();
  const card = saved.messages.at(-1)!.parts!.find((part) => part.type === 'record');
  expect(card).toMatchObject({ type: 'record', recordId: 'rec-32', title: 'Record rec-32', lines: ['11:00 · 20.2 · Jeni'], lineId: 'row-c3' });

  // UNDO: the same tool with that patch; the card asks, with the line's words from the dry run.
  model.queue(callsTool('dcrs__edit_record', { recordId: 'rec-32', patch: UNDO }));
  const undo = (await kapila.post('/assistant/messages', { text: 'undo', conversationId: proposed.conversationId })).json<AssistantReply>();
  expect(undo.confirmation?.changes[0]!.summary).toBe(`Delete ${LINE} in ${TITLE_32}?`);
  model.queue(says('Deleted line 3.'));
  await kapila.post(`/assistant/conversations/${undo.conversationId}/decision`, { confirmationId: undo.confirmation!.id, decision: 'confirm' });
  expect(changes().at(-1)).toEqual({ patch: UNDO });
  expect(lastToldTo(model)).toMatchObject({ said: `Deleted ${LINE}.` });

  // A SIGNED-OFF RECORD: the dry run says a reason is needed, so the model is told to ask; with the reason, the card says it reopens.
  verified = true;
  model.queue(callsTool('dcrs__edit_record', { recordId: 'rec-32', patch: UNDO }), says('That record is Verified. Why is it being corrected?'));
  const asked = (await kapila.post('/assistant/messages', { text: 'delete line 3 of F-QC-32', conversationId: proposed.conversationId })).json<AssistantReply>();
  expect(asked.confirmation).toBeNull();
  expect(asked.reply).toBe('That record is Verified. Why is it being corrected?');
  expect(lastToldTo(model)).toEqual({ error: 'The Adhesive Mixing Ratio Record of 11-Oct-2026 is Verified. Changing it reopens it for correction, which needs a reason: ask the person why, then call edit_record again with the reason.' });
  model.queue(callsTool('dcrs__edit_record', { recordId: 'rec-32', patch: UNDO, reason: 'it was a test line' }));
  const correction = (await kapila.post('/assistant/messages', { text: 'it was a test line', conversationId: proposed.conversationId })).json<AssistantReply>();
  expect(correction.confirmation?.changes[0]!.summary).toBe(
    `The Adhesive Mixing Ratio Record of 11-Oct-2026 is Verified. Reopen it for correction and delete ${LINE}? Reason: “it was a test line”. It will need submitting and verifying again.`,
  );
  model.queue(says('Deleted line 3; the record is reopened for correction.'));
  await kapila.post(`/assistant/conversations/${correction.conversationId}/decision`, { confirmationId: correction.confirmation!.id, decision: 'confirm' });
  expect(changes().at(-1)).toEqual({ patch: UNDO, reason: 'it was a test line' });
  expect(lastToldTo(model)).toMatchObject({ reopened: true, said: `Deleted ${LINE}. The record was reopened for correction: it needs submitting and verifying again.` });
});

it('words the card in the reply language (Gujarati), and refuses a change that would change nothing before any card', async () => {
  const { login, as, model } = await start({
    'POST /api/v1/records/rec-32/changes': (r) => {
      const body = r.body as { patch: Record<string, unknown> };
      if (body.patch.remarks) return refusal(400, 'nothing-changed', 'Nothing on the form changed.', { problems: ['"remarks" isn\'t a field on this form, so I left it out.'] });
      return json(200, { dryRun: true, recordId: 'rec-32', title: '11-Oct-2026 નો Adhesive Mixing Ratio Record', status: 'In Progress', editable: true, willReopen: false, changes: [], added: [], removed: ['લાઇન 3 (11:00, 20.2, Jeni)'], cleared: [], problems: [] });
    },
  });
  const kapila = as((await login()).json<LoginResponse>().token);
  model.queue(callsTool('dcrs__edit_record', { recordId: 'rec-32', patch: { removeItems: { rows: [3] } } }));
  const gu = (await kapila.post('/assistant/messages', { text: 'F-QC-32 ની લાઇન 3 કાઢી નાખો', replyLanguage: 'gu' })).json<AssistantReply>();
  expect(gu.confirmation?.changes[0]!.summary).toBe('11-Oct-2026 નો Adhesive Mixing Ratio Recordમાં લાઇન 3 (11:00, 20.2, Jeni) કાઢી નાખો?');

  model.queue(callsTool('dcrs__edit_record', { recordId: 'rec-32', patch: { remarks: 'x' } }), says('There is no Remarks box on that form.'));
  const nothing = (await kapila.post('/assistant/messages', { text: 'set remarks to x' })).json<AssistantReply>();
  expect(nothing.confirmation).toBeNull();
  expect(nothing.reply).toBe('There is no Remarks box on that form.');
  expect(lastToldTo(model)).toEqual({ error: 'Nothing on the form changed: "remarks" isn\'t a field on this form, so I left it out..' });
});
