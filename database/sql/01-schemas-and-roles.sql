-- ============================================================================
-- THE SHARED DATABASE, PART 1: two new schemas and three new roles.
--
-- DCRS and the Audit Assistant share DCRS's PostgreSQL database. DCRS keeps
-- its tables in the schema "public" exactly as they are; this file adds:
--
--   schema chatbot    the Audit Assistant's own tables (it creates them itself,
--                     from its own migrations, the first time it starts)
--   schema overview   plain-English views for people to read
--
--   role audit_assistant   the Audit Assistant's login. Owns "chatbot". Cannot
--                          read or write any DCRS table: it is granted nothing
--                          on "public", and PUBLIC holds no privilege on DCRS's
--                          tables (checked by database/tests).
--   role overview_viewer   a read-only login for the viewer. Reads the views in
--                          "overview" and nothing else; cannot write.
--   role overview_owner    no login. Owns the views that read the assistant's
--                          tables, and may read only the harmless columns of
--                          those tables (part 3). Never a person.
--
-- NOTHING OF DCRS IS CHANGED: no DCRS table is moved, renamed, altered or
-- granted on. The views over DCRS data (part 2) belong to the role that already
-- owns DCRS's tables, so they need no grant on them.
--
-- Run as a superuser, in the DCRS database (npm run db:shared -- setup). Safe
-- to run again: every step looks first and changes only what differs, so a
-- second run changes nothing. DCRS also runs it itself, at start-up, when its
-- own role may (REQUIREMENTS §107, backend/overviewSetup.ts): a superuser, or a
-- role that may make roles (CREATEROLE) and create in the database. Such a role
-- makes the three roles with createrole_self_grant = 'set', so it may become
-- them and never inherits their rights; and it may not change what only a
-- superuser may (SUPERUSER, REPLICATION ...), which is why a role is made with
-- every attribute it keeps and an attribute is changed only where it differs.
-- Passwords are not set here — scripts/database/shared-database.ts sets them
-- from the environment, or a DBA sets them with psql's \password.
-- ============================================================================

-- ---------------------------------------------------------------- the roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_assistant') THEN
    CREATE ROLE audit_assistant LOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'overview_viewer') THEN
    CREATE ROLE overview_viewer LOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'overview_owner') THEN
    CREATE ROLE overview_owner NOLOGIN NOINHERIT;
  END IF;
END $$;

-- Nothing more than a plain login: never a superuser, never able to make roles
-- or databases, never bypassing row security, never inheriting another role.
DO $$
DECLARE
  r record;
  changes text;
BEGIN
  FOR r IN SELECT * FROM pg_roles WHERE rolname IN ('audit_assistant', 'overview_viewer', 'overview_owner') ORDER BY rolname LOOP
    changes := concat_ws(' ',
      CASE WHEN r.rolsuper THEN 'NOSUPERUSER' END,
      CASE WHEN r.rolcreatedb THEN 'NOCREATEDB' END,
      CASE WHEN r.rolcreaterole THEN 'NOCREATEROLE' END,
      CASE WHEN r.rolreplication THEN 'NOREPLICATION' END,
      CASE WHEN r.rolbypassrls THEN 'NOBYPASSRLS' END,
      CASE WHEN r.rolinherit THEN 'NOINHERIT' END,
      CASE WHEN r.rolname = 'overview_owner' AND r.rolcanlogin THEN 'NOLOGIN' END);
    IF changes <> '' THEN
      EXECUTE format('ALTER ROLE %I %s', r.rolname, changes);
    END IF;
  END LOOP;
END $$;

-- So the assistant can never slow DCRS down:
--   at most 20 connections (its pool holds 10; 20 lets an old and a new server
--   overlap for a moment during a restart), no statement longer than 30 s, and
--   no transaction left open and idle for more than a minute (it would hold
--   locks and keep old row versions alive for everyone);
--   and a second guard: an unqualified table name means the assistant's own
--   table, never DCRS's "public.users" of the same name (search_path chatbot).
-- The viewer: a handful of connections, every transaction read-only by default,
-- and a query that runs away is stopped after a minute.
DO $$
DECLARE
  s record;
  config text[];
BEGIN
  IF (SELECT rolconnlimit FROM pg_roles WHERE rolname = 'audit_assistant') <> 20 THEN
    ALTER ROLE audit_assistant CONNECTION LIMIT 20;
  END IF;
  IF (SELECT rolconnlimit FROM pg_roles WHERE rolname = 'overview_viewer') <> 5 THEN
    ALTER ROLE overview_viewer CONNECTION LIMIT 5;
  END IF;
  FOR s IN SELECT * FROM (VALUES
      ('audit_assistant', 'statement_timeout', '30s'),
      ('audit_assistant', 'idle_in_transaction_session_timeout', '60s'),
      ('audit_assistant', 'search_path', 'chatbot'),
      ('overview_viewer', 'statement_timeout', '60s'),
      ('overview_viewer', 'idle_in_transaction_session_timeout', '60s'),
      ('overview_viewer', 'default_transaction_read_only', 'on'),
      ('overview_viewer', 'search_path', 'overview')
    ) AS wanted(role, setting, value)
  LOOP
    SELECT rolconfig INTO config FROM pg_roles WHERE rolname = s.role;
    IF NOT coalesce(s.setting || '=' || s.value = ANY (config), false) THEN
      EXECUTE format('ALTER ROLE %I SET %s = %L', s.role, s.setting, s.value);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- the schemas
-- chatbot belongs to audit_assistant. Made only when it is missing (CREATE
-- SCHEMA IF NOT EXISTS would still ask to become its owner when it is there).
DO $$
BEGIN
  IF to_regnamespace('chatbot') IS NULL THEN
    CREATE SCHEMA chatbot AUTHORIZATION audit_assistant;
  END IF;
END $$;
ALTER SCHEMA chatbot OWNER TO audit_assistant;

CREATE SCHEMA IF NOT EXISTS overview;

-- What each schema is, and who may use which. A new schema grants nothing to
-- PUBLIC. A comment is written, and a grant made, only where it is missing.
DO $$
DECLARE
  chatbot_words text := 'The Audit Assistant''s own tables: its users, sessions, sign-ins, chats, actions, files and the record of every file handed out. Created and changed only by the Audit Assistant''s own migrations. DCRS never reads or writes them.';
  overview_words text := 'Plain-English views over DCRS and the Audit Assistant, one row per real-world thing, for people to read. Nothing here holds data of its own: every view reads the live tables, so a change shows at once. Read-only for the role overview_viewer.';
BEGIN
  IF obj_description('overview'::regnamespace, 'pg_namespace') IS DISTINCT FROM overview_words THEN
    EXECUTE format('COMMENT ON SCHEMA overview IS %L', overview_words);
  END IF;
  IF NOT has_schema_privilege('overview_viewer', 'overview', 'USAGE') THEN
    GRANT USAGE ON SCHEMA overview TO overview_viewer;
  END IF;
  IF NOT has_schema_privilege('overview_owner', 'overview', 'USAGE') THEN
    GRANT USAGE ON SCHEMA overview TO overview_owner;
  END IF;
  -- overview_owner owns views in "overview", so it must be able to create there.
  IF NOT has_schema_privilege('overview_owner', 'overview', 'CREATE') THEN
    GRANT CREATE ON SCHEMA overview TO overview_owner;
  END IF;
  -- The schema chatbot's comment, and overview_owner's use of it (it reads the
  -- assistant's harmless columns, granted per column in part 3, once the
  -- assistant has made its tables): its owner's to give, so given as its owner.
  IF obj_description('chatbot'::regnamespace, 'pg_namespace') IS DISTINCT FROM chatbot_words
     OR NOT has_schema_privilege('overview_owner', 'chatbot', 'USAGE') THEN
    SET LOCAL ROLE audit_assistant;
    EXECUTE format('COMMENT ON SCHEMA chatbot IS %L', chatbot_words);
    GRANT USAGE ON SCHEMA chatbot TO overview_owner;
    RESET ROLE;
  END IF;
END $$;

-- The Audit Assistant's migration tool runs CREATE SCHEMA IF NOT EXISTS
-- "chatbot" at every start. PostgreSQL checks the CREATE privilege on the
-- DATABASE before it notices that the schema already exists (tested on a copy,
-- 29-Sep-2026: "permission denied for database" without it), so this is the
-- least that lets the assistant start. It lets the role make new, empty schemas
-- of its own; it gives no access to anything DCRS has. Granted by name, as
-- before, only where the database's own list does not hold it yet.
DO $$
DECLARE
  held text[] := ARRAY(
    SELECT a.grantee::regrole::text || ' ' || a.privilege_type
      FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a
     WHERE d.datname = current_database());
BEGIN
  IF NOT ('audit_assistant CONNECT' = ANY (held) AND 'audit_assistant CREATE' = ANY (held)) THEN
    EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO audit_assistant', current_database());
  END IF;
  IF NOT ('overview_viewer CONNECT' = ANY (held)) THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO overview_viewer', current_database());
  END IF;
END $$;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
      ('audit_assistant', 'The Audit Assistant server''s login. Owns the schema chatbot. No access to DCRS''s tables: it changes DCRS data only through the DCRS API, as the signed-in person.'),
      ('overview_viewer', 'Read-only login for the database viewer. Reads the views in the schema overview and nothing else.'),
      ('overview_owner', 'No login. Owns the overview views that read the Audit Assistant''s tables, and may read only their harmless columns (never tokens, credentials, chat text or file bytes).')
    ) AS wanted(role, words)
  LOOP
    IF shobj_description((SELECT oid FROM pg_roles WHERE rolname = c.role), 'pg_authid') IS DISTINCT FROM c.words THEN
      EXECUTE format('COMMENT ON ROLE %I IS %L', c.role, c.words);
    END IF;
  END LOOP;
END $$;
