// THE DATA DICTIONARY OF THE SHARED DATABASE (REQUIREMENTS §83): every view,
// table and column of the schemas overview, chatbot and public, with its
// plain-English comment, read from the database's own catalog and written to
// docs/database/data-dictionary.md.
//
//   npm run db:dictionary
//   npm run db:dictionary -- --url <database URL> --out <file>
//
// The URL: --url, else DICTIONARY_DATABASE_URL, else SUPERUSER_DATABASE_URL,
// else DATABASE_URL. Any login will do, even the viewer's: the comments live in
// the catalog, which every role may read, and nothing but the catalog is read.
// So the dictionary says what the database says: to change a line of it, change
// the comment in database/sql/ (or the optional comment files), apply it, and
// run this again. The top of the file says which database it came from and
// whether the optional comments on DCRS's and the assistant's tables were there.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { ASSISTANT_VIEWS, DCRS_VIEWS, maskUrl, ROOT } from "./shared-database.ts";

interface Column {
  relation: string;
  name: string;
  type: string;
  comment: string | null;
}

interface Relation {
  schema: string;
  name: string;
  kind: string;
  owner: string;
  comment: string | null;
}

interface FunctionInfo {
  signature: string;
  returns: string;
  comment: string | null;
}

// PostgreSQL's names for the kinds of value, in plain words.
const TYPE_WORDS: [RegExp, string][] = [
  [/^text$/, "text"],
  [/^character varying/, "text"],
  [/^(integer|bigint|smallint)$/, "whole number"],
  [/^(numeric|real|double precision)/, "number"],
  [/^boolean$/, "yes or no"],
  [/^date$/, "date"],
  [/^timestamp without time zone$/, "date and time"],
  [/^timestamp with time zone$/, "moment"],
  [/^jsonb?$/, "JSON"],
  [/^uuid$/, "UUID"],
  [/^bytea$/, "bytes"],
  [/^text\[\]$/, "list of text"],
];

function typeWords(type: string): string {
  for (const [re, words] of TYPE_WORDS) if (re.test(type)) return words;
  return type;
}

/** Text safe inside a Markdown table cell: one line, no table or HTML breaks. */
function cell(text: string | null): string {
  if (!text) return "";
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\*/g, "\\*")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const SCHEMAS: { name: string; title: string }[] = [
  { name: "overview", title: "The schema overview: the views people read" },
  { name: "chatbot", title: "The schema chatbot: the Audit Assistant's own tables" },
  { name: "public", title: "The schema public: DCRS's own tables" },
];

const KIND_WORDS: Record<string, string> = { r: "table", p: "table", v: "view", m: "materialised view", f: "foreign table" };

function order(schema: string, a: Relation, b: Relation): number {
  if (schema === "overview") {
    const known: readonly string[] = [...DCRS_VIEWS, ...ASSISTANT_VIEWS];
    const ia = known.indexOf(a.name);
    const ib = known.indexOf(b.name);
    if (ia !== ib) return (ia < 0 ? known.length : ia) - (ib < 0 ? known.length : ib);
  }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

async function main(argv: string[]): Promise<void> {
  let url = process.env.DICTIONARY_DATABASE_URL || process.env.SUPERUSER_DATABASE_URL || process.env.DATABASE_URL || "";
  let out = path.join(ROOT, "docs", "database", "data-dictionary.md");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--url" && argv[i + 1]) url = argv[++i];
    else if (argv[i] === "--out" && argv[i + 1]) out = path.resolve(argv[++i]);
    else throw new Error(`"${argv[i]}" is not something db:dictionary knows. Use --url <database URL> and --out <file>.`);
  }
  if (!url.trim()) {
    throw new Error("No database named. Give --url <database URL>, or set DICTIONARY_DATABASE_URL (any login will do, the viewer's too).");
  }

  const client = new pg.Client({ connectionString: url.trim(), application_name: "dcrs data dictionary" });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`Could not connect to ${maskUrl(url)}: ${(err as Error).message}`);
  }
  try {
    // Names come out whole (overview.factory_today(), not factory_today()) whichever login reads them.
    await client.query("SET search_path = pg_catalog");
    const about = (
      await client.query<{ database: string; version: string; today: string }>(
        `SELECT current_database() AS database, current_setting('server_version') AS version,
                to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'DD-Mon-YYYY') AS today`
      )
    ).rows[0];
    const relations = (
      await client.query<Relation>(
        `SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind, pg_get_userbyid(c.relowner) AS owner,
                obj_description(c.oid, 'pg_class') AS comment
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`,
        [SCHEMAS.map((s) => s.name)]
      )
    ).rows;
    const columns = (
      await client.query<Column>(
        `SELECT n.nspname || '.' || c.relname AS relation, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
                col_description(c.oid, a.attnum) AS comment
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
          WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          ORDER BY c.oid, a.attnum`,
        [SCHEMAS.map((s) => s.name)]
      )
    ).rows;
    const schemaComments = new Map(
      (
        await client.query<{ name: string; comment: string | null }>(
          "SELECT nspname AS name, obj_description(oid, 'pg_namespace') AS comment FROM pg_namespace WHERE nspname = ANY($1::text[])",
          [SCHEMAS.map((s) => s.name)]
        )
      ).rows.map((r) => [r.name, r.comment])
    );
    const functions = (
      await client.query<FunctionInfo>(
        `SELECT p.oid::regprocedure::text AS signature, pg_get_function_result(p.oid) AS returns, obj_description(p.oid, 'pg_proc') AS comment
           FROM pg_proc p WHERE p.pronamespace = to_regnamespace('overview') ORDER BY p.proname, 1`
      )
    ).rows;

    const bySchema = (s: string): Relation[] => relations.filter((r) => r.schema === s).sort((a, b) => order(s, a, b));
    // Whether every table of a schema, and every column of them, has a comment.
    const commented = (s: string): { tables: number; withComments: boolean } => {
      const tables = bySchema(s).filter((r) => r.kind === "r" || r.kind === "p");
      const keys = new Set(tables.map((t) => `${t.schema}.${t.name}`));
      const allColumns = columns.filter((c) => keys.has(c.relation));
      return { tables: tables.length, withComments: tables.length > 0 && tables.every((t) => t.comment) && allColumns.every((c) => c.comment) };
    };
    const dcrs = commented("public");
    const assistant = commented("chatbot");

    const lines: string[] = [];
    lines.push("# Data dictionary of the shared database");
    lines.push("");
    lines.push(
      `Generated by \`npm run db:dictionary\` from the database \`${about.database}\` (PostgreSQL ${about.version}) on ${about.today}, ` +
        "from the comments the database itself holds. Do not edit this file by hand: change the comment in `database/sql/` " +
        "(or in the optional comment files), apply it, and generate this file again."
    );
    lines.push("");
    lines.push("Where the comments on this page came from:");
    lines.push("");
    lines.push("- The views in `overview`: `database/sql/02-overview-dcrs.sql` and `03-overview-chatbot.sql`, applied by `npm run db:shared -- setup`.");
    lines.push(
      dcrs.withComments
        ? "- DCRS's own tables in `public`: the OPTIONAL file `database/sql/optional/dcrs-table-comments.sql` was applied to this database. It is not applied by default: on a database without it, DCRS's tables have no comments."
        : "- DCRS's own tables in `public`: the optional file `database/sql/optional/dcrs-table-comments.sql` was NOT applied to this database, so they have no comments here."
    );
    lines.push(
      !assistant.tables
        ? "- The Audit Assistant's tables in `chatbot`: not in this database yet."
        : assistant.withComments
          ? "- The Audit Assistant's tables in `chatbot`: the OPTIONAL file `database/sql/optional/chatbot-table-comments.sql` was applied to this database (the assistant's developer may fold it into the assistant's own migrations)."
          : "- The Audit Assistant's tables in `chatbot`: the optional file `database/sql/optional/chatbot-table-comments.sql` was NOT applied to this database, so they have no comments here."
    );
    lines.push("");
    lines.push("What the view and table names mean, how the roles may use them and how to set it all up: [README.md](README.md).");
    lines.push("");
    lines.push("Kinds of value, in the Type column:");
    lines.push("");
    lines.push("| Written here | PostgreSQL's name | What it is |");
    lines.push("|---|---|---|");
    lines.push("| text | text | Words, of any length. |");
    lines.push("| whole number | integer, bigint | A number with no fraction. |");
    lines.push("| yes or no | boolean | True or false. |");
    lines.push("| date | date | A calendar day. |");
    lines.push("| date and time | timestamp without time zone | A clock time with no zone attached. In the views, a column ending in `_factory_time` is the factory's clock (Asia/Kolkata) and one ending in `_utc` is UTC. |");
    lines.push("| moment | timestamp with time zone | A point in time, shown in the time zone of whoever reads it. |");
    lines.push("| JSON | json, jsonb | Structured data, as JSON. |");
    lines.push("| UUID | uuid | A random id. |");
    lines.push("| bytes | bytea | A file's raw bytes. |");
    lines.push("| list of text | text[] | Several pieces of text. |");
    lines.push("");
    lines.push("## Contents");
    lines.push("");
    for (const s of SCHEMAS) {
      const list = bySchema(s.name);
      lines.push(`- [${s.title}](#${s.title.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-")}) (${list.length})`);
      for (const r of list) lines.push(`  - [${r.schema}.${r.name}](#${`${r.schema}${r.name}`.replace(/[^a-z0-9_-]/g, "")})`);
    }
    if (functions.length) lines.push("- [Helper functions in overview](#helper-functions-in-overview)");
    lines.push("");

    for (const s of SCHEMAS) {
      const list = bySchema(s.name);
      lines.push(`## ${s.title}`);
      lines.push("");
      if (schemaComments.get(s.name)) lines.push(cell(schemaComments.get(s.name) ?? null), "");
      if (!list.length) {
        lines.push(s.name === "chatbot" ? "Not in this database yet: the Audit Assistant makes these tables the first time it starts." : "None.", "");
        continue;
      }
      for (const r of list) {
        lines.push(`### ${r.schema}.${r.name}`);
        lines.push("");
        lines.push(`*A ${KIND_WORDS[r.kind] ?? r.kind}, owned by ${r.owner}.* ${cell(r.comment) || "(No comment.)"}`);
        lines.push("");
        lines.push("| Column | Type | What it holds |");
        lines.push("|---|---|---|");
        for (const c of columns.filter((x) => x.relation === `${r.schema}.${r.name}`)) {
          lines.push(`| \`${c.name}\` | ${cell(typeWords(c.type))} | ${cell(c.comment)} |`);
        }
        lines.push("");
      }
    }
    if (functions.length) {
      lines.push("## Helper functions in overview");
      lines.push("");
      lines.push("Small functions the views use. They read no table: each works only on the values it is given.");
      lines.push("");
      lines.push("| Function | Gives | What it does |");
      lines.push("|---|---|---|");
      for (const f of functions) lines.push(`| \`${f.signature}\` | ${cell(typeWords(f.returns))} | ${cell(f.comment)} |`);
      lines.push("");
    }

    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, lines.join("\n"), "utf8");
    const counted = SCHEMAS.map((s) => `${bySchema(s.name).length} in ${s.name}`).join(", ");
    console.log(`Wrote ${path.relative(ROOT, out) || out}: ${relations.length} views and tables (${counted}), ${columns.length} columns, ${functions.length} functions, from ${maskUrl(url)}.`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
