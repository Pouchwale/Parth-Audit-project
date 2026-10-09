// The phone app's notifications, Tasks and Review screen, as plain functions (mobile/src/lib/notification-logic.ts,
// tasks-logic.ts and record-entry.ts): registering for alerts, what a tap opens, the inbox by day, the daily reminder,
// the day's sections, and the inputs and patches of the Review screen. The app has no test runner of its own, and these
// are plain functions, so they are checked here with the server's tests.
import { expect, it } from 'vitest';
import type { NotificationItem, RecordView, TaskItem, Tasks } from '@shared/api.ts';
import { RECORD } from './dcrs-standin.ts';

// Loaded by paths the server's typecheck does not follow: the app's files are the app's typecheck's.
const load = async (name: string) => (await import(new URL(`../../mobile/src/lib/${name}.ts`, import.meta.url).href)) as Record<string, any>;
const notifications = await load('notification-logic');
const tasksLogic = await load('tasks-logic');
const entryLogic = await load('record-entry');

it("writes alerts in the language Mitra replies in, or the phone's own language for 'the language I write in'", () => {
  const { pushLanguage } = notifications;
  expect(pushLanguage('gu', 'en-IN')).toBe('gu');
  expect(pushLanguage('hi', null)).toBe('hi');
  expect(pushLanguage('en', 'gu-IN')).toBe('en');
  expect(pushLanguage('auto', 'gu-IN')).toBe('gu');
  expect(pushLanguage('auto', 'hi_IN')).toBe('hi');
  expect(pushLanguage('auto', 'mr-IN')).toBe('en');
  expect(pushLanguage('auto', undefined)).toBe('en');
});

it('registers the phone again only for a new token, language, server or person, or once a day', () => {
  const { needsRegistering, parseRegistration, REGISTER_AGAIN_MS } = notifications;
  const now = { token: 'ExponentPushToken[a]', language: 'gu', server: 'http://10.0.0.5:3000', userId: 'u1' };
  const saved = { ...now, at: 1_000_000 };
  expect(needsRegistering(null, now, 1_000_000)).toBe(true);
  expect(needsRegistering(saved, now, 1_000_000 + 60_000)).toBe(false);
  expect(needsRegistering(saved, { ...now, token: 'ExponentPushToken[b]' }, 1_000_001)).toBe(true);
  expect(needsRegistering(saved, { ...now, language: 'hi' }, 1_000_001)).toBe(true);
  expect(needsRegistering(saved, { ...now, server: 'http://10.0.0.6:3000' }, 1_000_001)).toBe(true);
  expect(needsRegistering(saved, { ...now, userId: 'u2' }, 1_000_001)).toBe(true);
  expect(needsRegistering(saved, now, 1_000_000 + REGISTER_AGAIN_MS)).toBe(true);
  // A clock put back: sent again rather than trusted.
  expect(needsRegistering(saved, now, 999_000)).toBe(true);

  expect(parseRegistration(JSON.stringify(saved))).toEqual(saved);
  for (const wrong of [null, '', 'not json', '{}', JSON.stringify({ ...saved, language: 'fr' }), JSON.stringify({ ...saved, at: 'yesterday' })]) {
    expect(parseRegistration(wrong), String(wrong)).toBeNull();
  }
});

it('opens what a tapped alert is about: its record, Tasks, or the inbox, also from a closed app', () => {
  const { linkOf, itemLink, notificationIdOf } = notifications;
  expect(linkOf({ url: 'mitra://task/rec-1' })).toEqual({ screen: 'task', recordId: 'rec-1' });
  expect(linkOf({ url: 'mitra:///task/rec%201?from=push' })).toEqual({ screen: 'task', recordId: 'rec 1' });
  expect(linkOf({ url: '/task/rec-9' })).toEqual({ screen: 'task', recordId: 'rec-9' });
  expect(linkOf({ url: 'mitra://inbox' })).toEqual({ screen: 'inbox' });
  expect(linkOf({ url: 'mitra://tasks' })).toEqual({ screen: 'tasks' });
  // No link: its record, else Tasks for a kind about the day, else the inbox.
  expect(linkOf({ recordId: 'rec-2', kind: 'verify' })).toEqual({ screen: 'task', recordId: 'rec-2' });
  expect(linkOf({ kind: 'due', documentId: 'qc-viscosity' })).toEqual({ screen: 'tasks' });
  expect(linkOf({ kind: 'boss_summary' })).toEqual({ screen: 'tasks' });
  for (const nothing of [undefined, null, 'mitra://task/x', {}, { url: 'https://evil.example/task/1' }, { url: 'mitra://task/' }, { url: 'mitra://task/%E0%A4' }]) {
    expect(linkOf(nothing), JSON.stringify(nothing)).toEqual({ screen: 'inbox' });
  }
  // What DCRS's pushes carry (its "What a push carries"): one record, or several ("group") opening the inbox.
  const one = { url: 'mitra://task/rec-mgj2k1-7-abcd12', kind: 'ready', notificationId: 413, recordId: 'rec-mgj2k1-7-abcd12', count: 1 };
  expect(linkOf(one)).toEqual({ screen: 'task', recordId: 'rec-mgj2k1-7-abcd12' });
  expect(notificationIdOf(one)).toBe(413);
  const several = { url: 'mitra://inbox', kind: 'group', count: 3 };
  expect(linkOf(several)).toEqual({ screen: 'inbox' });
  expect(notificationIdOf(several)).toBeNull();
  expect(itemLink({ kind: 'needs_input', data: { recordId: 'rec-1' } })).toEqual({ screen: 'task', recordId: 'rec-1' });
  expect(itemLink({ kind: 'upcoming', data: { documentId: 'qc-viscosity', dueDate: '2026-10-09' } })).toEqual({ screen: 'tasks' });
  expect(itemLink({ kind: 'access_changed', data: {} })).toBeNull();
  expect(notificationIdOf({ notificationId: 41 })).toBe(41);
  expect(notificationIdOf({ id: 7 })).toBe(7);
  expect(notificationIdOf({ id: '7' })).toBeNull();
  expect(notificationIdOf(null)).toBeNull();
});

it("groups the inbox by the plant's day, newest first", () => {
  const { inboxSections, dayTitle } = notifications;
  const at = (createdAt: string, id: number): NotificationItem => ({ id, kind: 'ready', priority: 'medium', title: 't', body: 'b', data: {}, createdAt, readAt: null, resolvedAt: null });
  // 330 minutes east of UTC: 20:00 UTC on the 7th is already the 8th at the plant.
  const items = [at('2026-10-08T05:00:00Z', 3), at('2026-10-07T20:00:00Z', 2), at('2026-10-07T10:00:00Z', 1), at('2026-10-05T10:00:00Z', 0)];
  const sections = inboxSections(items, '2026-10-08T06:00:00Z', 330);
  expect(sections.map((s: { title: string; data: NotificationItem[] }) => [s.title, s.data.map((i) => i.id)])).toEqual([
    ['Today', [3, 2]],
    ['Yesterday', [1]],
    ['Monday 5 Oct', [0]],
  ]);
  expect(dayTitle('2025-12-31', '2026-10-08')).toBe('Wednesday 31 Dec 2025');
});

it('says in plain words whether alerts reach the phone, and keeps the daily reminder on only while they do not', () => {
  const { pushStateWords, remindersOn, reminderSlots, reminderWords, kindsFor, NOTIFICATION_KINDS, KIND_WORDS } = notifications;
  expect(pushStateWords({ status: 'on' })).toMatch(/^On\./);
  for (const reason of ['web', 'expo-go', 'not-asked', 'denied', 'no-token', 'server', 'not-offered']) {
    const words = pushStateWords({ status: 'off', reason });
    expect(words, reason).toMatch(/^(Off|Alerts come)/);
    expect(words, reason).not.toMatch(/\b(he|she|his|her|him)\b/i);
  }
  expect(pushStateWords({ status: 'off', reason: 'expo-go' })).toContain('1.1.0');

  expect(remindersOn('auto', false)).toBe(true);
  expect(remindersOn('auto', true)).toBe(false);
  expect(remindersOn('on', true)).toBe(true);
  expect(remindersOn('off', false)).toBe(false);

  // 08:50 and 17:30 on six days; never on the weekly off (Thursday, weekday 5 as the phone counts from Sunday = 1).
  const slots = reminderSlots('Thursday');
  expect(slots).toHaveLength(12);
  expect(slots.some((slot: { weekday: number }) => slot.weekday === 5)).toBe(false);
  expect(slots.slice(0, 2)).toEqual([{ weekday: 1, hour: 8, minute: 50 }, { weekday: 1, hour: 17, minute: 30 }]);
  expect(reminderSlots(undefined)).toEqual(slots);
  expect(reminderSlots('Sunday').some((slot: { weekday: number }) => slot.weekday === 1)).toBe(false);
  expect(reminderSlots('Someday')).toEqual(slots);

  for (const language of ['en', 'hi', 'gu']) {
    for (const hour of [8, 17]) {
      const words = reminderWords(language, hour);
      expect(words.title.length).toBeGreaterThan(5);
      expect(words.body).toContain('Tasks');
    }
  }
  expect(reminderWords('gu', 8).title).toMatch(/[઀-૿]/);
  expect(reminderWords('hi', 8).title).toMatch(/[ऀ-ॿ]/);

  // The reminder choice is kept in DCRS too (its preferences' `reminders`), so it follows the person to another phone;
  // absent until the person chooses, when the phone keeps its own (on by itself while alerts cannot reach it).
  const { reminderSettingOf, testResultWords, deviceLabel } = notifications;
  expect(reminderSettingOf(true)).toBe('on');
  expect(reminderSettingOf(false)).toBe('off');
  expect(reminderSettingOf(undefined)).toBeNull();
  expect(reminderSettingOf(null)).toBeNull();

  // "Send me a test notification": how many phones it went to, or why none, in DCRS's words when it says.
  expect(testResultWords({ sent: 1 })).toEqual({ tone: 'warning', words: 'Sent to your phone. It should arrive within a minute.' });
  expect(testResultWords({ sent: 2 })).toEqual({ tone: 'warning', words: 'Sent to 2 of your phones. It should arrive within a minute.' });
  expect(testResultWords({ sent: 0, reason: 'Push is switched off on the server.' })).toEqual({ tone: 'danger', words: 'Push is switched off on the server.' });
  expect(testResultWords({ sent: 0 })).toEqual({ tone: 'danger', words: 'No phone of yours is registered for alerts yet.' });
  expect(testResultWords({ sent: 0, reason: '  ' }).words).toBe('No phone of yours is registered for alerts yet.');

  // The phone's name as DCRS keeps it: at most 120 characters, none when there is none.
  expect(deviceLabel('  Galaxy A14 ')).toBe('Galaxy A14');
  expect(deviceLabel('P'.repeat(150))).toHaveLength(120);
  expect(deviceLabel('')).toBeUndefined();
  expect(deviceLabel(null)).toBeUndefined();

  expect(kindsFor('user')).not.toContain('boss_summary');
  expect(kindsFor('user')).not.toContain('escalation');
  expect(kindsFor('super_admin')).toEqual(NOTIFICATION_KINDS);
  expect(Object.keys(KIND_WORDS).sort()).toEqual([...NOTIFICATION_KINDS].sort());
});

const line = (over: Partial<TaskItem>): TaskItem => ({
  documentId: 'daily-pest-monitoring',
  formatNo: 'F/HR/17',
  document: 'Daily Pest Control Monitoring Record',
  dueDate: '2026-10-08',
  status: 'In Progress',
  recordId: 'rec-1',
  started: true,
  ...over,
});

const DAY: Tasks = {
  date: '2026-10-08',
  readyToSubmit: [line({ recordId: 'rec-ready', module: 'HR' })],
  needsInput: [line({ recordId: 'rec-1', module: 'HR', count: 12 })],
  // Due today: one already listed above, and one not started (no id yet), of Quality Control.
  due: [line({ recordId: 'rec-1', module: 'HR' }), line({ recordId: null, started: false, status: null, documentId: 'qc-viscosity', formatNo: 'F-QC-30', document: 'Lamination Adhesive Viscosity Record' })],
  overdue: [line({ recordId: 'rec-late', dueDate: '2026-10-06', formatNo: 'F/MNT/02', document: 'Breakdown record', module: 'Maintenance' })],
  awaitingVerification: [line({ recordId: 'rec-sub', status: 'Pending Verification', module: 'HR' })],
  upcoming: [line({ recordId: null, started: false, status: null, dueDate: '2026-10-09', module: 'HR' })],
};

it("puts DCRS's day into the Tasks screen's sections, and counts each module for the super admin", () => {
  const { taskSections, modulesOf, moduleSummary, moduleOf, openCount, taskTitle, taskLine, dateWords } = tasksLogic;
  const sections = taskSections(DAY);
  expect(sections.map((s: { key: string; items: TaskItem[] }) => [s.key, s.items.map((i) => i.recordId ?? i.documentId)])).toEqual([
    ['ready', ['rec-ready']],
    ['input', ['rec-1', 'qc-viscosity']],
    ['overdue', ['rec-late']],
    ['verify', ['rec-sub']],
    ['upcoming', ['daily-pest-monitoring']],
  ]);
  expect(taskSections({ date: '2026-10-08', readyToSubmit: [], needsInput: [], due: [], overdue: [], awaitingVerification: [], upcoming: [] })).toEqual([]);

  expect(moduleOf({ module: 'HR', formatNo: 'F/QC/30' })).toBe('HR');
  // DCRS says null when it knows no module: the format number decides.
  expect(moduleOf({ module: null, formatNo: 'F/MNT/02' })).toBe('MNT');
  expect(moduleOf({ formatNo: 'F-QC-30' })).toBe('QC');
  expect(moduleOf({ formatNo: 'F: QA/PRO/FL/CCT/01' })).toBe('QA');
  expect(moduleOf({ formatNo: 'TO BE CONFIRMED' })).toBe('Other');
  expect(modulesOf(DAY)).toEqual(['HR', 'Maintenance', 'QC']);
  expect(taskSections(DAY, 'QC').map((s: { key: string }) => s.key)).toEqual(['input']);
  expect(moduleSummary(DAY)).toEqual([
    { module: 'HR', ready: 1, input: 1, overdue: 0, verify: 1, upcoming: 1 },
    { module: 'Maintenance', ready: 0, input: 0, overdue: 1, verify: 0, upcoming: 0 },
    { module: 'QC', ready: 0, input: 1, overdue: 0, verify: 0, upcoming: 0 },
  ]);
  expect(openCount(DAY)).toBe(5);

  expect(taskTitle(line({}))).toBe('F/HR/17 Daily Pest Control Monitoring Record');
  expect(taskTitle(line({ formatNo: 'TO BE ISSUED', document: 'Fly service report' }))).toBe('Fly service report');
  expect(taskLine(line({ count: 12 }), '2026-10-08')).toBe('Today · In Progress · 12 readings to enter');
  expect(taskLine(line({ recordId: null, started: false, status: null, dueDate: '2026-10-09' }), '2026-10-08')).toBe('9 Oct 2026 · Not started');
  expect(dateWords('2026-01-31')).toBe('31 Jan 2026');
});

const PEST: RecordView = {
  recordId: 'rec-pest',
  documentId: 'daily-pest-monitoring',
  document: { id: 'daily-pest-monitoring', formatNo: 'F/HR/17', name: 'Daily Pest Control Monitoring Record', kind: 'daily-pest-monitoring' },
  date: '2026-10-08',
  status: 'In Progress',
  editable: true,
  actions: ['submit', 'delete'],
  prepared: { at: '2026-10-08T03:00:00Z', notes: ['The known parts; the readings are yours.'] },
  layout: {
    kind: 'daily-pest-monitoring',
    checkpoints: [
      { number: 1, question: 'Any gap under the doors?', answer: 'yesno', findingWhen: 'Yes' },
      { number: 4, question: 'How many glue traps are in place?', answer: 'number' },
    ],
    fields: [
      { key: 'checker', label: 'Checker', type: 'text' },
      { key: 'timeOfChecking', label: 'Time of checking', type: 'time' },
      { key: 'isHoliday', label: 'Holiday', type: 'yesno' },
    ],
    lists: [{ key: 'rodentCatches', label: 'Rodent catches', items: ['trapBoxNo', 'location', 'count'] }],
  },
  inWords: [],
  data: { checkpoints: { '1': { value: 'No' } }, checker: '', timeOfChecking: '', isHoliday: false, rodentCatches: [{ id: 'r1', trapBoxNo: 'T-3', location: 'Store', count: 0 }] },
};

it("makes an input of every value of a log sheet a person can write, saved in DCRS's own patch shape", () => {
  const { entryOf, patchFor } = entryLogic;
  const entry = entryOf(RECORD as unknown as RecordView);
  expect(entry.supported).toBe(true);
  // The Line No. box at the top; each line's Status (its Check point is printed on the form, so it is not asked).
  expect(entry.groups.map((g: { title: string; items: { id: string; value: string; quick: string[]; type: string }[] }) => [g.title, g.items.map((i) => [i.id, i.type, i.value, i.quick])])).toEqual([
    ['At the top of the sheet', [['header:lineNo', 'text', '3', []]]],
    ['Row 1: Floor clean', [['row:0:status', 'choice', 'OK', ['OK', 'Not OK']]]],
    ['Row 2: No old labels', [['row:1:status', 'choice', '', ['OK', 'Not OK']]]],
  ]);
  expect(entry).toMatchObject({ count: 3, empty: 1, requiredEmpty: 0 });
  const [, , second] = entry.groups;
  expect(patchFor(second.items[0].target, 'Not OK')).toEqual({ itemEdits: [{ collection: 'rows', match: { row: 2 }, set: { status: 'Not OK' } }] });
  expect(patchFor(entry.groups[0].items[0].target, '4')).toEqual({ header: { lineNo: '4' } });
});

it('asks every check point of the daily pest control with Yes and No, or 0 1 2 for a count, and its lines', () => {
  const { entryOf, patchFor, withValues, submitState } = entryLogic;
  const entry = entryOf(PEST);
  const items = entry.groups.flatMap((g: { items: unknown[] }) => g.items) as { id: string; where: string | null; type: string; value: string; quick: string[]; required: boolean; target: unknown }[];
  expect(items.map((i) => [i.id, i.where, i.type, i.value, i.quick, i.required])).toEqual([
    ['checkpoint:1', 'Check point 1', 'yesno', 'No', ['Yes', 'No'], true],
    ['checkpoint:4', 'Check point 4', 'number', '', ['0', '1', '2'], true],
    ['field:checker', null, 'text', '', [], true],
    ['field:timeOfChecking', null, 'time', '', [], true],
    ['field:isHoliday', null, 'yesno', 'No', ['Yes', 'No'], false],
    ['list:rodentCatches:0:trapBoxNo', 'Rodent catches, line 1', 'text', 'T-3', [], false],
    ['list:rodentCatches:0:location', 'Rodent catches, line 1', 'text', 'Store', [], false],
    ['list:rodentCatches:0:count', 'Rodent catches, line 1', 'number', '0', ['0', '1', '2'], false],
  ]);
  expect(entry.requiredEmpty).toBe(3);
  expect(patchFor(items[1]!.target, '12')).toEqual({ checkpoints: { '4': '12' } });
  expect(patchFor(items[2]!.target, 'Roshni')).toEqual({ checker: 'Roshni' });
  expect(patchFor(items[7]!.target, '1')).toEqual({ itemEdits: [{ collection: 'rodentCatches', match: { row: 1 }, set: { count: '1' } }] });

  // Submit waits for the required boxes (when DCRS gives no problems of its own), then for the tick.
  expect(submitState(PEST, entry, true)).toEqual({ shown: true, enabled: false, why: '3 required boxes are still empty.' });
  const filled = withValues(entry, { 'checkpoint:4': '12', 'field:checker': 'Roshni', 'field:timeOfChecking': '09:30' });
  expect(filled.requiredEmpty).toBe(0);
  expect(submitState(PEST, filled, false)).toMatchObject({ enabled: false, why: expect.stringContaining('Reviewed and correct') });
  expect(submitState(PEST, filled, true)).toEqual({ shown: true, enabled: true, why: null });
  // DCRS's own checks, when its answer gives them, decide.
  expect(submitState({ ...PEST, problems: ['Check point 2 is required.', 'Checker is required.'] }, filled, true)).toEqual({
    shown: true,
    enabled: false,
    why: 'Not ready to submit: Check point 2 is required. (and 1 more)',
  });
  expect(submitState({ ...PEST, problems: [] }, entry, true)).toMatchObject({ enabled: true });
  // Not offered: a record already submitted, or a person who may only read it.
  expect(submitState({ ...PEST, actions: ['verify', 'send_back'] }, filled, true)).toEqual({ shown: false, enabled: false, why: null });
  expect(submitState({ ...PEST, canSubmit: false }, filled, true)).toEqual({ shown: false, enabled: false, why: null });
});

it('reads any other form by its fields, leaves pictures and forms with pages of their own to DCRS, and notes a reading out of range', () => {
  const { entryOf, patchFor, rangeNote, quickAnswers } = entryLogic;
  const form: RecordView = {
    ...PEST,
    document: { ...PEST.document, kind: 'service-report' },
    layout: {
      kind: 'service-report',
      fields: [
        { key: 'serviceDate', label: 'Service date', type: 'date' },
        { key: 'remarks', label: 'Remarks', type: 'text' },
        { key: 'signature', label: 'Signature', type: 'group', parts: ['name', 'designation'] },
        { key: 'lines', label: 'Lines', type: 'list', items: ['area', 'done'] },
        { key: 'photos', label: 'Photos', type: 'list', items: ['fileName'] },
      ],
    },
    data: { serviceDate: '2026-10-08', remarks: '', signature: { name: 'Gurudev', designation: '' }, lines: [{ id: 'l1', area: 'Store', done: true }], photos: [{ id: 'p1', fileName: 'a.jpg', dataUrl: 'data:' }] },
  };
  const entry = entryOf(form);
  expect(entry.groups.map((g: { title: string; items: { id: string; value: string }[] }) => [g.title, g.items.map((i) => `${i.id}=${i.value}`)])).toEqual([
    ['On the form', ['field:serviceDate=2026-10-08', 'field:remarks=']],
    ['Signature', ['part:signature:name=Gurudev', 'part:signature:designation=']],
    ['Lines, line 1', ['list:lines:0:area=Store', 'list:lines:0:done=Yes']],
  ]);
  expect(patchFor({ kind: 'part', key: 'signature', part: 'designation' }, 'Supervisor')).toEqual({ signature: { designation: 'Supervisor' } });
  expect(entry.groups[0].items[1].quick).toEqual(['OK', 'Not OK']);

  for (const kind of ['gap-inspection', 'complaint-checklist', 'training-record']) {
    expect(entryOf({ ...form, layout: { kind, fields: [] } }), kind).toMatchObject({ supported: false, groups: [], count: 0 });
  }
  expect(entryOf({ ...form, layout: null })).toMatchObject({ supported: false });

  const viscosity = { type: 'number', min: 19, max: 21, unit: 'Sec.' };
  expect(rangeNote(viscosity, '20.4')).toBeNull();
  expect(rangeNote(viscosity, '')).toBeNull();
  expect(rangeNote(viscosity, '22')).toBe('Outside 19 to 21 Sec.: add a remark.');
  expect(rangeNote(viscosity, 'abc')).toBe('Write a number.');
  expect(rangeNote({ type: 'number', min: 0, max: null, unit: null }, '-1')).toBe('Below 0: add a remark.');
  expect(quickAnswers('choice', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'], 'Shift')).toEqual([]);
  expect(quickAnswers('text', [], 'Checked by')).toEqual([]);
});
