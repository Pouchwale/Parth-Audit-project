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
-- Run as a superuser, in the DCRS database. Safe to run again: every step
-- checks first. Passwords are not set here — scripts/database/shared-database.ts sets
-- them from the environment, or a DBA sets them with psql's \password.
-- ============================================================================

-- ---------------------------------------------------------------- the roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_assistant') THEN
    CREATE ROLE audit_assistant LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'overview_viewer') THEN
    CREATE ROLE overview_viewer LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'overview_owner') THEN
    CREATE ROLE overview_owner NOLOGIN;
  END IF;
END $$;

-- Nothing more than a plain login: never a superuser, never able to make roles
-- or databases, never bypassing row security, never inheriting another role.
ALTER ROLE audit_assistant NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE overview_viewer NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE overview_owner  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT NOLOGIN;

-- So the assistant can never slow DCRS down:
--   at most 20 connections (its pool holds 10; 20 lets an old and a new server
--   overlap for a moment during a restart), no statement longer than 30 s, and
--   no transaction left open and idle for more than a minute (it would hold
--   locks and keep old row versions alive for everyone).
ALTER ROLE audit_assistant CONNECTION LIMIT 20;
ALTER ROLE audit_assistant SET statement_timeout = '30s';
ALTER ROLE audit_assistant SET idle_in_transaction_session_timeout = '60s';
-- A second guard: an unqualified table name means the assistant's own table,
-- never DCRS's "public.users" of the same name.
ALTER ROLE audit_assistant SET search_path = chatbot;

-- The viewer: a handful of connections, every transaction read-only by default,
-- and a query that runs away is stopped after a minute.
ALTER ROLE overview_viewer CONNECTION LIMIT 5;
ALTER ROLE overview_viewer SET statement_timeout = '60s';
ALTER ROLE overview_viewer SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE overview_viewer SET default_transaction_read_only = on;
ALTER ROLE overview_viewer SET search_path = overview;

-- ---------------------------------------------------------------- the schemas
CREATE SCHEMA IF NOT EXISTS chatbot AUTHORIZATION audit_assistant;
ALTER SCHEMA chatbot OWNER TO audit_assistant;
COMMENT ON SCHEMA chatbot IS
  'The Audit Assistant''s own tables: its users, sessions, sign-ins, chats, actions, files and the record of every file handed out. Created and changed only by the Audit Assistant''s own migrations. DCRS never reads or writes them.';

CREATE SCHEMA IF NOT EXISTS overview;
COMMENT ON SCHEMA overview IS
  'Plain-English views over DCRS and the Audit Assistant, one row per real-world thing, for people to read. Nothing here holds data of its own: every view reads the live tables, so a change shows at once. Read-only for the role overview_viewer.';

-- Who may use which schema. A new schema grants nothing to PUBLIC.
GRANT USAGE ON SCHEMA overview TO overview_viewer, overview_owner;
-- overview_owner reads the assistant's harmless columns (granted per column in
-- part 3, once the assistant has made its tables).
GRANT USAGE ON SCHEMA chatbot TO overview_owner;
-- overview_owner owns views in "overview", so it must be able to create there.
GRANT CREATE ON SCHEMA overview TO overview_owner;

-- The Audit Assistant's migration tool runs CREATE SCHEMA IF NOT EXISTS
-- "chatbot" at every start. PostgreSQL checks the CREATE privilege on the
-- DATABASE before it notices that the schema already exists (tested on a copy,
-- 29-Sep-2026: "permission denied for database" without it), so this is the
-- least that lets the assistant start. It lets the role make new, empty schemas
-- of its own; it gives no access to anything DCRS has.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO audit_assistant', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO overview_viewer', current_database());
END $$;

COMMENT ON ROLE audit_assistant IS 'The Audit Assistant server''s login. Owns the schema chatbot. No access to DCRS''s tables: it changes DCRS data only through the DCRS API, as the signed-in person.';
COMMENT ON ROLE overview_viewer IS 'Read-only login for the database viewer. Reads the views in the schema overview and nothing else.';
COMMENT ON ROLE overview_owner IS 'No login. Owns the overview views that read the Audit Assistant''s tables, and may read only their harmless columns (never tokens, credentials, chat text or file bytes).';
