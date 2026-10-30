// The lines of a record through DCRS's API (DCRS REQUIREMENTS §113): the lists a record describes, the four
// operations, the dry run that words the confirmation card, the real change with the ids Undo needs, DCRS's refusals
// (nothing changed, a level too low, a signed-off record without a reason) and the paging of the lists.
import { describe as group, expect, it } from 'vitest';
import { cardWords, changeMade, listsOf, madeWords, previewOf, undoPatch } from '../src/connectors/dcrs/lines.ts';
import { patchInWords } from '../src/connectors/dcrs/inputs.ts';
import { recordForModel, recordsForModel } from '../src/connectors/dcrs/shape.ts';
import { ConnectorError, type ActionContext, type Described } from '../src/connectors/types.ts';
import { actionOf, ctx, json, RECORD, refusal, standInDcrs, TOKEN, type Seen } from './dcrs-standin.ts';

const summaryOf = (said: string | Described<unknown>) => (typeof said === 'string' ? said : said.summary);
const inGujarati: ActionContext = { ...ctx, language: 'gu' };
const inHindi: ActionContext = { ...ctx, language: 'hi' };

/** F-QC-32 (free lines) as GET /api/v1/records/rec-32 answers it since §113: each list's rules and its lines by id. */
const FREE_SHEET = {
  ...RECORD,
  recordId: 'rec-32',
  document: { id: 'qc-adhesive-mixing', formatNo: 'F-QC-32', name: 'Adhesive Mixing Ratio Record', kind: 'log-sheet' },
  layout: {
    kind: 'log-sheet',
    header: [],
    footer: [],
    columns: [
      { key: 'time', label: 'Time', type: 'time' },
      { key: 'viscosity', label: 'Viscosity', type: 'number', unit: 'Sec.' },
      { key: 'checkedBy', label: 'Checked By', type: 'text' },
    ],
    rows: { mode: 'free', count: 2 },
    lists: [
      {
        key: 'rows',
        label: 'Lines',
        noun: 'line',
        canAdd: true,
        canRemove: true,
        minLines: 1,
        maxAddAtOnce: 50,
        nameKey: 'time',
        item: ['time', 'viscosity', 'checkedBy'],
        writable: ['time', 'viscosity', 'checkedBy'],
        count: 2,
        lines: [
          { row: 1, id: 'row-a1', time: '09:00', words: '09:00 · 20.1 · Jeni' },
          { row: 2, id: 'row-b2', time: '10:00', words: '10:00 · 20.4 · Jeni' },
        ],
      },
    ],
  },
  patchShape: 'A box … addItems — Add lines, only what the person said … removeItems — Take off lines … A whole list is never replaced.',
  data: { header: {}, rows: [{ id: 'row-a1', time: '09:00', viscosity: 20.1, checkedBy: 'Jeni' }, { id: 'row-b2', time: '10:00', viscosity: 20.4, checkedBy: 'Jeni' }] },
};

const TITLE = 'the Adhesive Mixing Ratio Record of 11-Oct-2026';

/** What DCRS's dry run answers for a patch (ChangePreview): nothing written. */
function preview(extra: Record<string, unknown>) {
  return { dryRun: true, recordId: 'rec-32', title: TITLE, status: 'In Progress', editable: true, willReopen: false, changes: [], added: [], removed: [], cleared: [], problems: [], route: '/record/rec-32', ...extra };
}

/** What DCRS's real change answers (ChangeResponse). */
function made(extra: Record<string, unknown>) {
  return {
    recordId: 'rec-32',
    status: 'In Progress',
    editable: true,
    actions: ['submit', 'delete'],
    history: [{ at: '2026-10-11T07:00:00.000Z', by: 'Kapila Barad', action: 'assistant-edit', note: 'Through Mitra mobile app: from the floor', changes: [] }],
    route: '/record/rec-32',
    changes: [],
    added: [],
    removed: [],
    cleared: [],
    problems: [],
    ...extra,
  };
}

const ADD = { addItems: { rows: [{ time: '11:00', viscosity: 20.2, checkedBy: 'Jeni' }] } };
const REMOVE = { removeItems: { rows: ['row-b2'] } };
const CLEAR = { clearItems: { rows: [{ id: 'row-a1', keys: ['viscosity'] }] } };

/** A stand-in DCRS whose /changes answers by whether the call is a dry run. */
function dcrsWith(onChange: (body: Record<string, unknown>, request: Seen) => Response) {
  return standInDcrs({
    'GET /api/v1/records/rec-32': () => json(200, FREE_SHEET),
    'POST /api/v1/records/rec-32/changes': (request) => onChange(request.body as Record<string, unknown>, request),
  });
}

group('the lists a record describes (layout.lists)', () => {
  it("reads each list's rules and its lines by id, and a document's rules without lines", () => {
    const [rows] = listsOf(FREE_SHEET);
    expect(rows).toMatchObject({ key: 'rows', noun: 'line', canAdd: true, canRemove: true, minLines: 1, maxAddAtOnce: 50, nameKey: 'time', item: ['time', 'viscosity', 'checkedBy'], count: 2 });
    expect(rows!.lines).toEqual([
      { row: 1, id: 'row-a1', name: '09:00', words: '09:00 · 20.1 · Jeni' },
      { row: 2, id: 'row-b2', name: '10:00', words: '10:00 · 20.4 · Jeni' },
    ]);
    const fixed = listsOf({ layout: { lists: [{ key: 'rows', label: 'Lines', noun: 'line', canAdd: false, canRemove: false, whyFixed: 'This sheet has one line for each time slot the form prints.', minLines: 24, maxAddAtOnce: 0, item: [], writable: ['viscosity'] }] } });
    expect(fixed[0]).toMatchObject({ canAdd: false, canRemove: false, whyFixed: expect.stringContaining('time slot'), maxAddAtOnce: 0 });
    expect(fixed[0]!.lines).toBeUndefined();
    // A DCRS before §113, or the old shape of F/HR/17's lists: nothing, and nothing breaks.
    expect(listsOf(RECORD)).toEqual([]);
    expect(listsOf({ layout: { lists: [{ key: 'rodentCatches', label: 'Rodent catches', items: ['trapBoxNo'] }] } })).toMatchObject([{ key: 'rodentCatches', canAdd: false, item: [] }]);
    expect(listsOf(null)).toEqual([]);
  });

  it("gives the model each list's rules and lines by row, id and words with the record", () => {
    const shaped = recordForModel(FREE_SHEET) as { layout: { lists: { key: string; canAdd: boolean; lines: { id: string }[] }[] } };
    expect(shaped.layout.lists[0]).toMatchObject({ key: 'rows', canAdd: true, canRemove: true, nameKey: 'time' });
    expect(shaped.layout.lists[0]!.lines.map((line) => line.id)).toEqual(['row-a1', 'row-b2']);
  });
});

group('the dry run and the card', () => {
  it('asks DCRS what the patch would do, in the language of the reply, and words a deletion as a question with the line in its own words', async () => {
    const { connector, seen } = dcrsWith((body) => (body.dryRun === true ? json(200, preview({ removed: ['line 2 (10:00, 20.4, Jeni)'], changes: [{ label: 'Row 2 (10:00)', before: '10:00 · 20.4 · Jeni', after: '(row removed)' }] })) : json(200, made({}))));
    const edit = actionOf(connector.actions, 'edit_record');
    const said = await edit.describe({ recordId: 'rec-32', patch: REMOVE }, inGujarati);
    expect(summaryOf(said)).toBe(`${TITLE}માં line 2 (10:00, 20.4, Jeni) કાઢી નાખો?`);
    const call = seen.find((r) => r.path === '/api/v1/records/rec-32/changes')!;
    expect(call.body).toEqual({ patch: REMOVE, dryRun: true });
    expect(call.headers['x-language']).toBe('gu');
    expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
    // Nothing else was asked of DCRS, and nothing was written: the dry run is the card's only source.
    expect(seen.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/v1/records/rec-32/changes']);
  });

  it('lists an added line back without a question, in English and in Hindi', async () => {
    const { connector } = dcrsWith(() => json(200, preview({ added: [{ collection: 'rows', words: '11:00 · 20.2 · Jeni' }], changes: [{ label: 'Row 3 (11:00)', before: '(no row)', after: '11:00 · 20.2 · Jeni' }] })));
    const edit = actionOf(connector.actions, 'edit_record');
    expect(summaryOf(await edit.describe({ recordId: 'rec-32', patch: ADD, note: 'from the floor' }, ctx))).toBe(`Add a line (11:00 · 20.2 · Jeni) in ${TITLE}. (note: "from the floor")`);
    expect(summaryOf(await edit.describe({ recordId: 'rec-32', patch: ADD }, inHindi))).toBe(`${TITLE} में एक लाइन जोड़ें (11:00 · 20.2 · Jeni)।`.replace('।', '.'));
  });

  it('asks before clearing a written value, and says a plain change as set', () => {
    const cleared = previewOf(preview({ cleared: ['20.1 from line 1 (09:00)'], changes: [{ label: 'Row 1 (09:00) · Viscosity', before: '20.1', after: '' }] }));
    expect(cardWords(cleared, 'en', undefined)).toBe(`Clear 20.1 from line 1 (09:00) in ${TITLE}?`);
    const set = previewOf(preview({ changes: [{ label: 'Row 1 (09:00) · Viscosity', before: '20.1', after: '20.3' }] }));
    expect(cardWords(set, 'en', undefined)).toBe(`Set Row 1 (09:00) · Viscosity to 20.3 in ${TITLE}.`);
    const both = previewOf(preview({ removed: ['line 2 (10:00, 20.4, Jeni)'], added: [{ collection: 'rows', words: '11:00 · 20.2' }] }));
    expect(cardWords(both, 'en', undefined)).toBe(`Delete line 2 (10:00, 20.4, Jeni) and add a line (11:00 · 20.2) in ${TITLE}?`);
  });

  it('refuses a patch that changes nothing before any card, with what DCRS left out', async () => {
    const { connector } = dcrsWith(() => refusal(400, 'nothing-changed', 'Nothing on the form changed.', { problems: ['"remarks" isn\'t a field on this form, so I left it out.'] }));
    const edit = actionOf(connector.actions, 'edit_record');
    const error = await Promise.resolve(edit.describe({ recordId: 'rec-32', patch: { remarks: 'x' } }, ctx)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as ConnectorError).kind).toBe('invalid_request');
    expect((error as ConnectorError).code).toBe('nothing-changed');
    expect((error as ConnectorError).message).toBe('Nothing on the form changed: "remarks" isn\'t a field on this form, so I left it out..');
    // So does a dry run whose answer names nothing to do.
    expect(() => cardWords(previewOf(preview({ problems: ['Printed columns cannot be written.'] })), 'en', undefined)).toThrow('Nothing on the form would change. Printed columns cannot be written.');
  });

  it("passes on DCRS's refusal of a level too low (access-level) in DCRS's words", async () => {
    const { connector } = dcrsWith(() => refusal(403, 'access-level', 'F-QC-32 Adhesive Mixing Ratio Record is Read only for you. Filling in a record needs Write access: ask the super admin for it.'));
    const error = await Promise.resolve(actionOf(connector.actions, 'edit_record').describe({ recordId: 'rec-32', patch: ADD }, ctx)).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'forbidden', code: 'access-level', message: expect.stringContaining('needs Write access') });
  });

  it('asks the reason first for a signed-off record, then words the card as a correction with the reason', async () => {
    const { connector, seen } = dcrsWith((body) =>
      json(200, preview({ status: 'Verified', editable: false, willReopen: true, reasonNeeded: typeof body.reason !== 'string', removed: ['line 2 (10:00, 20.4, Jeni)'] })),
    );
    const edit = actionOf(connector.actions, 'edit_record');
    const error = await Promise.resolve(edit.describe({ recordId: 'rec-32', patch: REMOVE }, ctx)).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'invalid_request', message: `${TITLE.charAt(0).toUpperCase()}${TITLE.slice(1)} is Verified. Changing it reopens it for correction, which needs a reason: ask the person why, then call edit_record again with the reason.` });
    const said = await edit.describe({ recordId: 'rec-32', patch: REMOVE, reason: 'it was a test line' }, ctx);
    expect(summaryOf(said)).toBe(`The Adhesive Mixing Ratio Record of 11-Oct-2026 is Verified. Reopen it for correction and delete line 2 (10:00, 20.4, Jeni)? Reason: “it was a test line”. It will need submitting and verifying again.`);
    expect(seen.at(-1)!.body).toEqual({ patch: REMOVE, dryRun: true, reason: 'it was a test line' });
  });

  it('keeps DCRS\'s needs-reopen refusal of a real change with reasonNeeded and canReopen', async () => {
    const { connector } = dcrsWith(() => refusal(409, 'needs-reopen', 'This record is Verified. Reopen it for correction, with a reason, to change it.', { reasonNeeded: true, canReopen: true }));
    const error = await actionOf(connector.actions, 'edit_record').run(ctx, { recordId: 'rec-32', patch: REMOVE }).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'conflict', code: 'needs-reopen', details: { reasonNeeded: true, canReopen: true }, message: expect.stringContaining('Reopen it') });
  });

  it('cannot word a card from a DCRS that answers a real change to a dry run (before §113): refused, nothing written', () => {
    expect(() => previewOf(made({}))).toThrow(/cannot say what a change would do/);
  });
});

group('the real change', () => {
  it('adds a line and answers its id, the words for the reply, and the Undo patch that takes it off again', async () => {
    const { connector, seen } = dcrsWith((body) =>
      body.dryRun === true
        ? json(200, preview({}))
        : json(200, made({ added: [{ collection: 'rows', id: 'row-c3', row: 3, words: '11:00 · 20.2 · Jeni' }], changes: [{ label: 'Row 3 (11:00)', before: '(no row)', after: '11:00 · 20.2 · Jeni' }] })),
    );
    const result = (await actionOf(connector.actions, 'edit_record').run(ctx, { recordId: 'rec-32', patch: ADD, note: 'from the floor' })) as Record<string, unknown>;
    expect(seen.at(-1)!.body).toEqual({ patch: ADD, note: 'from the floor' });
    expect(result.said).toBe('Added 11:00 · 20.2 · Jeni.');
    expect(result.added).toEqual([{ collection: 'rows', id: 'row-c3', row: 3, words: '11:00 · 20.2 · Jeni' }]);
    expect(result.undoPatch).toEqual({ removeItems: { rows: ['row-c3'] } });
    expect(result.undo).toMatch(/Undo/i);
    expect(result).toMatchObject({ recordId: 'rec-32', status: 'In Progress', editable: true, actions: ['submit', 'delete'] });
  });

  it('removes and clears, naming the lines in DCRS\'s words, with no Undo patch for a removal', async () => {
    const { connector } = dcrsWith((body) =>
      json(200, made((body.patch as Record<string, unknown>).removeItems ? { removed: ['line 2 (10:00, 20.4, Jeni)'] } : { cleared: ['20.1 from line 1 (09:00)'] })),
    );
    const edit = actionOf(connector.actions, 'edit_record');
    const removed = (await edit.run(inGujarati, { recordId: 'rec-32', patch: REMOVE })) as Record<string, unknown>;
    expect(removed.said).toBe('line 2 (10:00, 20.4, Jeni) કાઢી નાખી.');
    expect(removed.undoPatch).toBeUndefined();
    const cleared = (await edit.run(ctx, { recordId: 'rec-32', patch: CLEAR })) as Record<string, unknown>;
    expect(cleared.said).toBe('Cleared 20.1 from line 1 (09:00).');
  });

  it('says a correction reopened the record, and sends the reason with the change', async () => {
    const { connector, seen } = dcrsWith(() => json(200, made({ reopened: true, status: 'In Progress', changes: [{ label: 'Row 2 (10:00) · Viscosity', before: '20.4', after: '20.3' }] })));
    const result = (await actionOf(connector.actions, 'edit_record').run(inHindi, { recordId: 'rec-32', patch: { itemEdits: [{ collection: 'rows', match: { id: 'row-b2' }, set: { viscosity: 20.3 } }] }, reason: 'misread' })) as Record<string, unknown>;
    expect(seen.at(-1)!.body).toMatchObject({ reason: 'misread' });
    expect(seen.at(-1)!.headers['x-language']).toBe('hi');
    expect(result.said).toBe('रिकॉर्ड सुधार के लिए फिर खोला गया: उसे फिर से सबमिट और वेरिफ़ाई करना होगा।');
  });

  it('reads a change\'s answer defensively and groups the Undo by list', () => {
    const answer = changeMade(made({ added: [{ collection: 'rows', id: 'row-1', words: 'a' }, { collection: 'rodentCatches', id: 7, words: 'b' }, { collection: 'rows', words: 'no id' }] }));
    expect(undoPatch(answer)).toEqual({ removeItems: { rows: ['row-1'], rodentCatches: [7] } });
    expect(undoPatch(changeMade(made({})))).toBeNull();
    expect(madeWords(changeMade(made({ added: [{ collection: 'rows', id: 'row-1', words: 'a' }, { collection: 'rows', id: 'row-2', words: 'b' }] })), 'en')).toBe('Added a and b.');
  });

  it('says the four operations in words for a record not started yet, where no dry run can be asked', () => {
    expect(patchInWords({ addItems: { rows: [{ time: '11:00', viscosity: 20.2 }] }, removeItems: { rows: ['row-b2', { row: 1 }] }, clearItems: { rows: [{ id: 'row-a1', keys: ['viscosity'] }, 2] } })).toBe(
      'add to rows: time "11:00", viscosity 20.2; delete from rows: "row-b2"; delete from rows: row 1; clear viscosity of the line in rows where id "row-a1"; clear the line in rows at 2',
    );
  });
});

group('paging (offset)', () => {
  it('sends offset to DCRS for records, the search, documents and findings, and keeps the page in the answer', async () => {
    const page = { offset: 20, limit: 20, total: 45, more: true };
    const { connector, seen } = standInDcrs({
      'GET /api/v1/records': () => json(200, { ...page, from: '2026-09-01', to: '2026-10-11', records: [] }),
      'GET /api/v1/records/search': () => json(200, { ...page, query: 'floor', kind: 'words', hits: [] }),
      'GET /api/v1/documents': () => json(200, { ...page, query: '', documents: [], kept: [], notInDcrs: [] }),
      'GET /api/v1/findings': () => json(200, { ...page, findings: [] }),
    });
    const run = (name: string, input: Record<string, unknown>) => actionOf(connector.actions, name).run(ctx, input);
    const records = (await run('list_records', { offset: 20 })) as Record<string, unknown>;
    expect(records).toMatchObject({ offset: 20, more: true, total: 45 });
    await run('search_records', { q: 'floor', offset: 20 });
    await run('find_documents', { offset: 20 });
    await run('list_findings', { offset: 20 });
    expect(seen.map((r) => r.query.offset)).toEqual(['20', '20', '20', '20']);
    expect(recordsForModel({ ...page, records: [] })).toMatchObject({ offset: 20, more: true });
    // The card says where the page starts.
    expect(summaryOf(await actionOf(connector.actions, 'list_records').describe({ offset: 20 }, ctx))).toBe('List the records from number 21');
  });
});
