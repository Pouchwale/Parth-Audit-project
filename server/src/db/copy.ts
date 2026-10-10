// COPIES MITRA'S EMBEDDED DATABASE INTO POSTGRESQL, WITHOUT LOSS (DCRS REQUIREMENTS §107).
//
//   npm --prefix server run db:copy -- --from .data/pglite --to postgres://mitra:<password>@127.0.0.1:5432/mitra
//
// The owner, 9-Oct-2026: "make sure data will stored in our postgres database perfectly of both application because now
// i am going towards deployment part". In development the server keeps its data in an embedded PGlite folder; in
// production (NODE_ENV or MITRA_ENV = production) it refuses to start on anything but PostgreSQL (src/config.ts). This
// brings what a PGlite folder already holds into an EMPTY PostgreSQL database, once, before the switch:
//
//   * THE FOLDER IS ONLY READ. It is copied to a temporary folder first, and the copy is opened and brought up to this
//     server's migrations, as the server does at every start. The Mitra server must be stopped: PGlite keeps a lock
//     file (postmaster.pid) in a folder that is open, and the copy refuses a folder that has one, unless --not-running
//     says the server is not running (a power cut leaves the file behind; the copy is then recovered as PostgreSQL
//     recovers after a power cut).
//   * THE TARGET MUST BE EMPTY: no row in any of Mitra's tables, and not DCRS's database (Mitra has its own database,
//     "mitra", on the same PostgreSQL server: its tables users and sessions would meet DCRS's in DCRS's). Its tables are
//     made by this server's own migrations, as at a first start.
//   * EVERY TABLE OF THE SCHEMA (src/db/schema.ts), in an order its foreign keys allow, every column, every row, the
//     ids kept: each value is read as the text PostgreSQL writes for it and given back to PostgreSQL as that text, so
//     nothing is rounded on the way (a moment keeps its microseconds, a file its every byte, JSON its every character).
//   * IN ONE TRANSACTION: either everything is copied or nothing is. Before it commits, each table's rows are counted
//     and fingerprinted (an MD5 of every row's text) on both sides; one difference and nothing is copied. Then each
//     sequence of a copied column is set past its highest id, so a new row never takes an id already used.
//   * The counts are printed, table by table. The password in an address is never printed.
// Tested by test/db-copy.test.ts: always on PGlite to PGlite; on a real PostgreSQL when MITRA_PG_TEST_URL names a
// throwaway server.
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { is, sql, type SQL } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { POSTGRES_URL } from '../config.ts';
import { openDatabase, type Db } from './index.ts';
import * as schema from './schema.ts';

/** One table of the schema: its name, its columns in order, and the columns of its primary key. */
export interface TableInfo {
  name: string;
  columns: string[];
  primaryKey: string[];
  /** The tables its foreign keys point to. */
  references: string[];
}

/** Every table of the drizzle schema, each after the tables its foreign keys point to. */
export function tablesInOrder(): TableInfo[] {
  const tables = (Object.values(schema) as unknown[])
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => {
      const config = getTableConfig(table);
      const primaryKey = config.primaryKeys[0]?.columns.map((c) => c.name) ?? config.columns.filter((c) => c.primary).map((c) => c.name);
      return {
        name: config.name,
        columns: config.columns.map((c) => c.name),
        primaryKey,
        references: [...new Set(config.foreignKeys.map((fk) => getTableConfig(fk.reference().foreignTable).name))].filter((n) => n !== config.name),
      };
    });
  const ordered: TableInfo[] = [];
  const placed = new Set<string>();
  while (ordered.length < tables.length) {
    const next = tables.find((t) => !placed.has(t.name) && t.references.every((r) => placed.has(r)));
    if (!next) throw new Error(`The schema's foreign keys go round in a circle: ${tables.filter((t) => !placed.has(t.name)).map((t) => t.name).join(', ')}`);
    ordered.push(next);
    placed.add(next.name);
  }
  return ordered;
}

const ident = (name: string): string => `"${name.replace(/"/g, '""')}"`;

/** The rows of a query, whichever driver answered it (node-postgres or PGlite). */
async function rowsOf<T>(db: Db, query: SQL): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
}

// Every value as the text PostgreSQL writes, written the same way on both sides: moments in UTC, ISO dates, bytes as hex.
const SAME_TEXT = ["SET TimeZone = 'UTC'", "SET DateStyle = 'ISO, YMD'", "SET IntervalStyle = 'postgres'", "SET bytea_output = 'hex'", 'SET extra_float_digits = 3'];

/** What would make a database the wrong place to copy into, in plain words; null when it is empty of Mitra's rows. */
export async function targetProblem(db: Db): Promise<string | null> {
  const [dcrs] = await rowsOf<{ dcrs: boolean }>(db, sql`SELECT to_regclass('public.app_storage') IS NOT NULL AS dcrs`);
  if (dcrs?.dcrs) {
    return "That is DCRS's database (it holds DCRS's app_storage). Mitra keeps its data in a database of its own on the same PostgreSQL server, \"mitra\": name that one.";
  }
  const holding: string[] = [];
  for (const table of tablesInOrder()) {
    const [there] = await rowsOf<{ there: boolean }>(db, sql`SELECT to_regclass(${`public.${ident(table.name)}`}) IS NOT NULL AS there`);
    if (!there?.there) continue;
    const [count] = await rowsOf<{ n: string }>(db, sql.raw(`SELECT count(*)::text AS n FROM public.${ident(table.name)}`));
    if (Number(count?.n ?? 0) > 0) holding.push(`${table.name} (${count?.n} rows)`);
  }
  return holding.length ? `That database already holds Mitra's data: ${holding.join(', ')}. The copy goes only into an empty database, so nothing in it is ever written over.` : null;
}

/** The columns PostgreSQL has for a table, in order, with their types. */
async function columnsIn(db: Db, table: string): Promise<{ name: string; type: string }[]> {
  return rowsOf(
    db,
    sql`SELECT a.attname::text AS name, format_type(a.atttypid, a.atttypmod) AS type
          FROM pg_attribute a
         WHERE a.attrelid = to_regclass(${`public.${ident(table)}`}) AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
         ORDER BY a.attnum`
  );
}

/** How many rows a table holds, and a fingerprint of all of them: the MD5 of every row's text, in a fixed order. */
async function fingerprint(db: Db, table: string): Promise<{ rows: number; md5: string }> {
  const [r] = await rowsOf<{ n: string; f: string }>(
    db,
    sql.raw(`SELECT count(*)::text AS n, coalesce(md5(string_agg(md5(t::text), '' ORDER BY md5(t::text))), '') AS f FROM public.${ident(table)} AS t`)
  );
  return { rows: Number(r?.n ?? 0), md5: r?.f ?? '' };
}

/** What each table holds in the source and, after the copy, in the target. */
export interface TableCopied {
  table: string;
  rows: number;
  copied: number;
}

// A page of rows at a time, read on from the last primary key (never an OFFSET, which would read every earlier row
// again), and an insert of at most this much text. A table with bytes in it is read a few rows at a time: a file may be
// 20 MB (FILE_MAX_MB), 40 MB as text.
const PAGE_ROWS = 500;
const PAGE_ROWS_WITH_BYTES = 4;
const BATCH_CHARS = 8 * 1024 * 1024;

/**
 * Copies every table of the schema from `source` into `target` in ONE transaction of the target's, and checks before it
 * commits that every table holds the same rows on both sides. Both are open on this server's schema (openDatabase).
 */
export async function copyTables(source: Db, target: Db, log: (line: string) => void = () => undefined): Promise<TableCopied[]> {
  for (const setting of SAME_TEXT) await source.execute(sql.raw(setting));
  const tables = tablesInOrder();
  const unknown = await rowsOf<{ name: string }>(
    source,
    sql`SELECT c.relname::text AS name FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
          AND NOT (c.relname = ANY (${sql.param(tables.map((t) => t.name))}::text[])) ORDER BY 1`
  );
  for (const { name } of unknown) {
    const { rows } = await fingerprint(source, name);
    if (rows > 0) throw new Error(`The embedded database holds a table this server does not know, ${name}, with ${rows} rows. Nothing was copied.`);
  }

  return target.transaction(async (tx) => {
    for (const setting of SAME_TEXT) await tx.execute(sql.raw(setting.replace(/^SET /, 'SET LOCAL ')));
    const problem = await targetProblem(tx as unknown as Db);
    if (problem) throw new Error(`${problem} Nothing was copied.`);
    const result: TableCopied[] = [];
    for (const table of tables) {
      const from = await columnsIn(source, table.name);
      const to = await columnsIn(tx as unknown as Db, table.name);
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        throw new Error(`The table ${table.name} is not the same in the two databases (${from.map((c) => c.name).join(', ')} / ${to.map((c) => c.name).join(', ')}). Nothing was copied.`);
      }
      const names = from.map((c) => c.name);
      const keys = table.primaryKey.length ? table.primaryKey : names;
      const keyTypes = keys.map((k) => from.find((c) => c.name === k)?.type ?? 'text');
      const pageRows = from.some((c) => c.type === 'bytea') ? PAGE_ROWS_WITH_BYTES : PAGE_ROWS;
      const select = `SELECT ${names.map((n) => `${ident(n)}::text AS ${ident(n)}`).join(', ')} FROM public.${ident(table.name)}`;
      const order = ` ORDER BY ${keys.map(ident).join(', ')} LIMIT ${pageRows}`;
      // The next page: the rows after the last one read, by the primary key in its own types.
      const after = (last: (string | null)[]): SQL =>
        sql.join(
          [
            sql.raw(` WHERE (${keys.map(ident).join(', ')}) > (`),
            sql.join(
              last.map((value, i) => sql`${sql.param(value)}::text::${sql.raw(keyTypes[i]!)}`),
              sql.raw(', ')
            ),
            sql.raw(')'),
          ],
          sql.raw('')
        );
      // The rows go in as columns of text, each read back by its column's own type: nothing is converted on the way.
      const insert = (columns: (string | null)[][]): SQL =>
        sql.join(
          [
            sql.raw(`INSERT INTO public.${ident(table.name)} (${names.map(ident).join(', ')}) SELECT ${from.map((c, i) => `c${i}::${c.type}`).join(', ')} FROM unnest(`),
            sql.join(
              columns.map((values) => sql`${sql.param(values)}::text[]`),
              sql.raw(', ')
            ),
            sql.raw(`) AS x(${from.map((_c, i) => `c${i}`).join(', ')})`),
          ],
          sql.raw('')
        );
      let copied = 0;
      let last: (string | null)[] | null = null;
      for (;;) {
        const page: Record<string, string | null>[] = await rowsOf<Record<string, string | null>>(
          source,
          sql.join([sql.raw(select), last ? after(last) : sql.raw(''), sql.raw(order)], sql.raw(''))
        );
        let batch: (string | null)[][] = names.map(() => []);
        let rowsInBatch = 0;
        let chars = 0;
        const flush = async (): Promise<void> => {
          if (!rowsInBatch) return;
          await tx.execute(insert(batch));
          copied += rowsInBatch;
          batch = names.map(() => []);
          rowsInBatch = 0;
          chars = 0;
        };
        for (const row of page) {
          names.forEach((n, i) => {
            const value = row[n] ?? null;
            batch[i]!.push(value);
            chars += value?.length ?? 0;
          });
          rowsInBatch++;
          if (chars >= BATCH_CHARS) await flush();
        }
        await flush();
        if (page.length < pageRows) break;
        const end = page[page.length - 1]!;
        last = keys.map((k) => end[k] ?? null);
      }
      const there = await fingerprint(source, table.name);
      const here = await fingerprint(tx as unknown as Db, table.name);
      if (there.rows !== here.rows || there.md5 !== here.md5 || copied !== there.rows) {
        throw new Error(`The table ${table.name} did not copy whole: ${there.rows} rows in the embedded database, ${here.rows} in PostgreSQL${there.rows === here.rows ? ', and their contents differ' : ''}. Nothing was copied.`);
      }
      await setSequences(tx as unknown as Db, table.name);
      log(`  ${table.name.padEnd(22, '.')} ${here.rows} row${here.rows === 1 ? '' : 's'} copied, the same as in the embedded database`);
      result.push({ table: table.name, rows: there.rows, copied: here.rows });
    }
    return result;
  });
}

/** Sets each sequence that gives a column of `table` its next value past the highest one there (or back to its start when empty). */
export async function setSequences(db: Db, table: string): Promise<string[]> {
  const sequences = await rowsOf<{ col: string; seq: string }>(
    db,
    sql`SELECT a.attname::text AS col, pg_get_serial_sequence(${`public.${ident(table)}`}, a.attname) AS seq
          FROM pg_attribute a
         WHERE a.attrelid = to_regclass(${`public.${ident(table)}`}) AND a.attnum > 0 AND NOT a.attisdropped
           AND pg_get_serial_sequence(${`public.${ident(table)}`}, a.attname) IS NOT NULL`
  );
  const set: string[] = [];
  for (const { col, seq } of sequences) {
    await db.execute(
      sql.raw(`SELECT setval('${seq.replace(/'/g, "''")}', coalesce((SELECT max(${ident(col)}) FROM public.${ident(table)}), 1), (SELECT max(${ident(col)}) FROM public.${ident(table)}) IS NOT NULL)`)
    );
    set.push(seq);
  }
  return set;
}

// ---------------------------------------------------------------------------
// the command

/** A connection address with its password hidden, for printing. */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '(an address that could not be read)';
  }
}

export interface CopyOptions {
  /** The PGlite folder. */
  from: string;
  /** The postgres:// address of the empty database. */
  to: string;
  /** The person says the Mitra server is not running, though the folder's lock file is there (a power cut). */
  notRunning?: boolean;
  log?: (line: string) => void;
}

/** A refusal: said plainly, and nothing was changed. */
export class CopyRefused extends Error {}

/** The whole copy, as the command runs it. Returns what each table holds. */
export async function copyIntoPostgres(options: CopyOptions): Promise<TableCopied[]> {
  const log = options.log ?? ((line: string) => console.log(line));
  const folder = resolve(options.from);
  if (!existsSync(join(folder, 'PG_VERSION'))) {
    throw new CopyRefused(`There is no embedded database at ${folder} (no PG_VERSION file there). Name the folder the Mitra server used: DATABASE_URL in server/.env, or .data/pglite when it was empty. Nothing was changed.`);
  }
  if (existsSync(join(folder, 'postmaster.pid')) && !options.notRunning) {
    throw new CopyRefused(
      `The embedded database at ${folder} is open: a Mitra server is using it, or the last one did not stop cleanly (its lock file postmaster.pid is there). ` +
        'Stop the Mitra server first (Ctrl+C in its window, or stop the plant servers), then run this again. If no Mitra server is running (after a power cut, say), ' +
        'add --not-running: the copy is then taken from the folder as it stands and recovered as PostgreSQL recovers after a power cut. Nothing was changed.'
    );
  }
  if (!POSTGRES_URL.test(options.to)) throw new CopyRefused(`--to must be a postgres:// address, for example postgres://mitra:<its password>@127.0.0.1:5432/mitra. Nothing was changed.`);

  log("Copying Mitra's embedded database into PostgreSQL (DCRS REQUIREMENTS §107)");
  log(`  From: ${folder} (only read: it is copied first, and the copy is opened)`);
  log(`  To:   ${maskUrl(options.to)} (must be empty)`);

  // The target first, before anything is made in it: reachable, UTF8, PostgreSQL 13 or newer, not DCRS's, and empty.
  const probe = new pg.Client({ connectionString: options.to, application_name: 'mitra db:copy (check)' });
  try {
    await probe.connect();
  } catch (err) {
    throw new CopyRefused(`Could not connect to ${maskUrl(options.to)}: ${err instanceof Error ? err.message : String(err)}. Nothing was changed.`);
  }
  try {
    const facts = (await probe.query<{ version: number; text: string; encoding: string }>(
      "SELECT current_setting('server_version_num')::int AS version, current_setting('server_version') AS text, pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = current_database()"
    )).rows[0]!;
    if (facts.version < 130000) throw new CopyRefused(`The PostgreSQL there is ${facts.text}; Mitra needs 13 or newer. Nothing was changed.`);
    if (facts.encoding !== 'UTF8') {
      throw new CopyRefused(`That database uses the ${facts.encoding} encoding; Mitra's data holds Gujarati and Hindi, so it must be UTF8: CREATE DATABASE mitra OWNER mitra ENCODING 'UTF8' TEMPLATE template0; Nothing was changed.`);
    }
    const problem = await targetProblem(drizzlePg(probe, { schema }));
    if (problem) throw new CopyRefused(`${problem} Nothing was changed.`);
    log(`  PostgreSQL ${facts.text}, ${facts.encoding}: empty of Mitra's data.`);
  } finally {
    await probe.end().catch(() => undefined);
  }

  const snapshot = mkdtempSync(join(tmpdir(), 'mitra-copy-'));
  let source: Awaited<ReturnType<typeof openDatabase>> | null = null;
  let target: Awaited<ReturnType<typeof openDatabase>> | null = null;
  try {
    cpSync(folder, snapshot, { recursive: true });
    rmSync(join(snapshot, 'postmaster.pid'), { force: true });
    log(`  The folder copied aside (${sizeOf(snapshot)}), and opened there with this server's migrations, as the server opens it.`);
    source = await openDatabase(snapshot);
    target = await openDatabase(options.to);
    log("  Mitra's tables made in PostgreSQL by this server's migrations. Copying, in one transaction:");
    const copied = await copyTables(source.db, target.db, log);
    const total = copied.reduce((sum, t) => sum + t.copied, 0);
    log(`Done: ${copied.length} tables, ${total} rows, every row checked against the embedded database before the transaction was committed.`);
    log('Next: set DATABASE_URL in server/.env to that address (and NODE_ENV=production), start the Mitra server, and keep the folder as it is until you have checked the app.');
    return copied;
  } finally {
    await source?.close().catch(() => undefined);
    await target?.close().catch(() => undefined);
    rmSync(snapshot, { recursive: true, force: true });
  }
}

/** The size of a folder, in words. */
function sizeOf(folder: string): string {
  let bytes = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else bytes += statSync(full).size;
    }
  };
  walk(folder);
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function usage(): string {
  return [
    "Copies Mitra's embedded database (a PGlite folder) into an empty PostgreSQL database, without loss (DCRS REQUIREMENTS §107).",
    '',
    '  npm --prefix server run db:copy -- --from .data/pglite --to postgres://mitra:<its password>@127.0.0.1:5432/mitra',
    '',
    '  --from <folder>   the PGlite folder (.data/pglite unless given)',
    '  --to <address>    the empty PostgreSQL database for Mitra (DATABASE_URL in server/.env unless given)',
    '  --not-running     the Mitra server is not running, though the folder still has its lock file (after a power cut)',
    '',
    'Stop the Mitra server first. The folder is only read. Everything is copied in one transaction, or nothing is.',
  ].join('\n');
}

async function main(argv: string[]): Promise<number> {
  let from = '.data/pglite';
  let to = process.env.DATABASE_URL?.trim() ?? '';
  let notRunning = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' || a === '--to') {
      const value = argv[++i];
      if (!value) throw new CopyRefused(`${a} needs a value.\n\n${usage()}`);
      if (a === '--from') from = value;
      else to = value;
    } else if (a === '--not-running') notRunning = true;
    else if (a === '--help' || a === '-h') {
      console.log(usage());
      return 0;
    } else throw new CopyRefused(`"${a}" is not something db:copy knows.\n\n${usage()}`);
  }
  if (!to) throw new CopyRefused(`Name the PostgreSQL database to copy into with --to (or DATABASE_URL in server/.env).\n\n${usage()}`);
  await copyIntoPostgres({ from, to, notRunning });
  return 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err instanceof CopyRefused ? `REFUSED: ${err.message}` : `FAILED: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(err instanceof CopyRefused ? 2 : 1);
    },
  );
}
