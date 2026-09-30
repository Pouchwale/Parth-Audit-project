-- ============================================================================
-- THE SHARED DATABASE, PART 3: plain-English views over the Audit Assistant's
-- own tables (schema chatbot), joined to DCRS's people and records.
--
-- DRAFT until the owner hands over the Audit Assistant's updated migration
-- files (REQUIREMENTS §83). It is written against the assistant's tables as its
-- server/src/db/schema.ts defines them on 29-Sep-2026, moved into the schema
-- chatbot the way docs/chatbot-integration.md says, and it is tested against
-- those tables on a throwaway copy. Apply it only after the assistant has
-- started once and made its tables: npm run db:shared -- setup --with-chatbot.
--
-- WHAT THE VIEWS NEVER SHOW: the assistant's session tokens, its stored DCRS
-- sign-ins (connector_credentials), the text of chats (conversations), what a
-- person asked in their own words (actions.request), file contents
-- (files.data, files.text), what was handed out (conversation_exports.content
-- and content_bytes, and the conversation's title) and the weekly reports. The
-- views here belong to the role overview_owner, which may read only the other
-- columns of the assistant's tables: a view that tried to read one of those
-- would fail. database/tests checks this from the catalog.
--
-- THE ASSISTANT'S MIGRATIONS. These views depend on the assistant's tables. A
-- later migration of the assistant that drops or changes the type of a column
-- read here would stop with "cannot drop ... because other objects depend on
-- it". Adding tables or columns is never a problem. Before such a migration,
-- run npm run db:shared -- setup --rebuild-views: it drops every overview view
-- and makes only the DCRS ones again, so nothing depends on the assistant's
-- tables any more. After the migration, npm run db:shared -- setup
-- --with-chatbot makes the views of this file again.
--
-- Needs parts 1 and 2 first. Run as a superuser, in the DCRS database. Safe to
-- run again.
-- ============================================================================

DO $$
DECLARE
  missing text;
BEGIN
  IF to_regclass('overview.dcrs_accounts') IS NULL OR to_regclass('overview.findings') IS NULL
     OR to_regclass('overview.records') IS NULL OR to_regclass('overview.dcrs_downloads') IS NULL THEN
    RAISE EXCEPTION 'The DCRS views are missing. Apply database/sql/02-overview-dcrs.sql first.';
  END IF;
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['chatbot.users', 'chatbot.sessions', 'chatbot.login_events', 'chatbot.actions',
                    'chatbot.message_events', 'chatbot.conversation_exports']) AS t
  WHERE to_regclass(t) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'The Audit Assistant''s tables are not there yet (missing: %). Start the Audit Assistant once against this database with its updated migrations, then run this again.', missing;
  END IF;
END $$;

-- ============================================================ what overview_owner may read
-- Exactly the columns the views read, table by table. Never a token, a
-- credential, chat text, a person's own words or file contents. Everything
-- else it may have had is taken back first, so this list is the whole truth.
REVOKE ALL ON ALL TABLES IN SCHEMA chatbot FROM overview_owner;
GRANT SELECT (id, provider, external_id, username, display_name, created_at, last_login_at)
  ON chatbot.users TO overview_owner;
GRANT SELECT (id, user_id, device_id, device_name, device_model, os, os_version, app_version, user_agent, sign_in_ip,
              last_ip, created_at, last_seen_at, expires_at, ended_at, end_reason)
  ON chatbot.sessions TO overview_owner;
GRANT SELECT (id, user_id, session_id, username, success, failure_reason, ip, user_agent, device, created_at)
  ON chatbot.login_events TO overview_owner;
GRANT SELECT (id, user_id, session_id, conversation_id, connector_id, action, kind, input, summary, status, error,
              created_at, finished_at)
  ON chatbot.actions TO overview_owner;
GRANT SELECT (id, user_id, session_id, conversation_id, chars, attachments, created_at)
  ON chatbot.message_events TO overview_owner;
GRANT SELECT (id, kind, purpose, user_id, username, display_name, session_id, conversation_id, source, file_id, filename,
              mime_type, size_bytes, message_count, sha256, ip, user_agent, device, time_zone, created_at)
  ON chatbot.conversation_exports TO overview_owner;

-- The DCRS views these views join to (a grant on a view, never on DCRS's tables).
GRANT SELECT ON overview.dcrs_accounts, overview.records, overview.findings, overview.dcrs_downloads TO overview_owner;

-- ============================================================ helpers

CREATE OR REPLACE FUNCTION overview.device_description(device jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT nullif(concat_ws(', ',
    nullif(btrim(device->>'name'), ''),
    nullif(btrim(device->>'model'), ''),
    nullif(btrim(concat_ws(' ', btrim(device->>'os'), btrim(device->>'osVersion'))), ''),
    'app ' || nullif(btrim(device->>'appVersion'), '')
  ), '')
$$;
COMMENT ON FUNCTION overview.device_description(jsonb) IS
  'A device in a few words, from what the Audit Assistant''s app reported: its name, model, operating system and app version.';

-- WHICH DCRS RECORD AND FINDING AN ACTION OF THE ASSISTANT WAS ABOUT, read from
-- the action's input. THE ONE PLACE TO CHANGE when the DCRS connector's actions
-- and their inputs are final (docs/chatbot-integration.md). It only reads the
-- input; overview.assistant_activity then finds the record, the finding and the
-- day's record in DCRS, in one pass over all actions.
--   dcrs_record_id  a record the input names: recordId, or the record part of
--                   a finding's permanent reference "<record id>:<finding id>"
--   finding_id      the finding the input names, as given: a readable id such
--                   as CAPA-2023-12-13-1, or the permanent reference
--   document_id,    for an action that asks for a day's report rather than a
--   record_date     record (the daily pest control report): which document
--                   and which day
CREATE OR REPLACE FUNCTION overview.assistant_action_targets(action text, input jsonb)
RETURNS TABLE (dcrs_record_id text, finding_id text, document_id text, record_date date)
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT
    coalesce(
      nullif(btrim(input->>'recordId'), ''),
      nullif(btrim(input->>'record_id'), ''),
      CASE WHEN given.finding LIKE '%:%' THEN nullif(split_part(given.finding, ':', 1), '') END
    ),
    given.finding,
    CASE WHEN action ILIKE '%pest%' AND overview.date_from_text(btrim(input->>'date')) IS NOT NULL THEN 'daily-pest-monitoring' END,
    CASE WHEN action ILIKE '%pest%' THEN overview.date_from_text(btrim(input->>'date')) END
  FROM (
    SELECT nullif(btrim(coalesce(
      input->>'findingId',
      input->>'finding_id',
      input->>'ref',
      CASE WHEN action ILIKE '%finding%' THEN input->>'id' END
    )), '') AS finding
  ) given
$$;
COMMENT ON FUNCTION overview.assistant_action_targets(text, jsonb) IS
  'Which DCRS record, finding or day an Audit Assistant action was about, read from the action''s input. The one place to change when the assistant''s DCRS actions change.';

-- ============================================================ the views
-- Made again from scratch each time: nothing depends on them.
DROP VIEW IF EXISTS overview.downloads;
DROP VIEW IF EXISTS overview.people;
DROP VIEW IF EXISTS overview.assistant_sessions;
DROP VIEW IF EXISTS overview.assistant_sign_ins;
DROP VIEW IF EXISTS overview.assistant_activity;
DROP VIEW IF EXISTS overview.file_handouts;

-- ---------------------------------------------------------------- people
CREATE VIEW overview.people AS
WITH assistant_users AS (
  SELECT u.id, u.external_id, u.created_at, u.last_login_at FROM chatbot.users u WHERE u.provider = 'dcrs'
),
sign_ins AS (
  SELECT e.user_id,
         count(*) FILTER (WHERE e.success) AS good,
         count(*) FILTER (WHERE NOT e.success) AS refused,
         min(e.created_at) FILTER (WHERE e.success) AS first_at,
         max(e.created_at) FILTER (WHERE e.success) AS last_at
  FROM chatbot.login_events e WHERE e.user_id IS NOT NULL GROUP BY e.user_id
),
refused_unknown AS (
  -- A refused attempt the assistant could not tie to an account of its own
  -- (the person had never signed in to it): matched on the username typed,
  -- which is the DCRS email.
  SELECT lower(btrim(e.username)) AS username, count(*) AS refused
  FROM chatbot.login_events e WHERE e.user_id IS NULL AND NOT e.success GROUP BY 1
),
devices AS (
  SELECT s.user_id,
         count(DISTINCT coalesce(nullif(s.device_id, ''), concat_ws('|', s.device_name, s.device_model, s.os, s.user_agent))) AS all_devices,
         count(DISTINCT coalesce(nullif(s.device_id, ''), concat_ws('|', s.device_name, s.device_model, s.os, s.user_agent)))
           FILTER (WHERE s.ended_at IS NULL AND s.expires_at > now()) AS signed_in_devices,
         (array_agg(coalesce(s.last_ip, s.sign_in_ip) ORDER BY s.last_seen_at DESC)
           FILTER (WHERE coalesce(s.last_ip, s.sign_in_ip) IS NOT NULL))[1] AS last_ip
  FROM chatbot.sessions s GROUP BY s.user_id
),
messages AS (
  SELECT m.user_id, count(*) AS sent FROM chatbot.message_events m WHERE m.user_id IS NOT NULL GROUP BY m.user_id
),
acts AS (
  SELECT a.user_id, count(*) AS done FROM chatbot.actions a GROUP BY a.user_id
)
SELECT
  p.person_id, p.name, p.email, p.role, p.departments, p.department_codes, p.account_status, p.must_change_password,
  p.created_factory_time, p.created_utc, p.last_sign_in_factory_time, p.last_sign_in_utc,
  coalesce(si.good, 0)::int AS assistant_sign_ins,
  (coalesce(si.refused, 0) + coalesce(ru.refused, 0))::int AS assistant_failed_sign_ins,
  overview.factory_time(coalesce(si.first_at, au.created_at)) AS assistant_first_sign_in_factory_time,
  overview.factory_time(coalesce(au.last_login_at, si.last_at)) AS assistant_last_sign_in_factory_time,
  overview.utc_time(coalesce(au.last_login_at, si.last_at)) AS assistant_last_sign_in_utc,
  coalesce(d.all_devices, 0)::int AS assistant_devices,
  coalesce(d.signed_in_devices, 0)::int AS assistant_signed_in_devices,
  d.last_ip AS assistant_last_ip_address,
  coalesce(m.sent, 0)::int AS assistant_messages_sent,
  coalesce(a.done, 0)::int AS assistant_actions
FROM overview.dcrs_accounts p
LEFT JOIN assistant_users au ON au.external_id = p.person_id
LEFT JOIN sign_ins si ON si.user_id = au.id
LEFT JOIN refused_unknown ru ON ru.username = lower(p.email)
LEFT JOIN devices d ON d.user_id = au.id
LEFT JOIN messages m ON m.user_id = au.id
LEFT JOIN acts a ON a.user_id = au.id
ORDER BY p.name, p.email;

COMMENT ON VIEW overview.people IS
  'One row per DCRS sign-in account, with how that person uses the Audit Assistant: sign-ins, refused sign-ins, devices, messages and actions. Joined on the assistant''s users.external_id, which holds the DCRS account id.';
COMMENT ON COLUMN overview.people.person_id IS 'The account''s id in DCRS. It never changes. The Audit Assistant keeps it as the person''s external id.';
COMMENT ON COLUMN overview.people.name IS 'The person''s name, as DCRS shows it.';
COMMENT ON COLUMN overview.people.email IS 'The email address the person signs in with, to DCRS and to the Audit Assistant.';
COMMENT ON COLUMN overview.people.role IS 'Super admin or Staff, in DCRS.';
COMMENT ON COLUMN overview.people.departments IS 'The departments whose documents the person may see in DCRS, or Every department.';
COMMENT ON COLUMN overview.people.department_codes IS 'The same departments by their short codes. Empty when the person sees every department.';
COMMENT ON COLUMN overview.people.account_status IS 'Active, or Switched off in DCRS (then the person cannot sign in to the Audit Assistant either).';
COMMENT ON COLUMN overview.people.must_change_password IS 'True while the person must still change the password the administrator gave them.';
COMMENT ON COLUMN overview.people.created_factory_time IS 'When the DCRS account was made, in factory time.';
COMMENT ON COLUMN overview.people.created_utc IS 'When the DCRS account was made, in UTC.';
COMMENT ON COLUMN overview.people.last_sign_in_factory_time IS 'When the person last signed in to DCRS itself, in factory time.';
COMMENT ON COLUMN overview.people.last_sign_in_utc IS 'When the person last signed in to DCRS itself, in UTC.';
COMMENT ON COLUMN overview.people.assistant_sign_ins IS 'How many times the person has signed in to the Audit Assistant.';
COMMENT ON COLUMN overview.people.assistant_failed_sign_ins IS 'How many sign-ins to the Audit Assistant with this person''s username were refused.';
COMMENT ON COLUMN overview.people.assistant_first_sign_in_factory_time IS 'When the person first signed in to the Audit Assistant, in factory time. Empty if never.';
COMMENT ON COLUMN overview.people.assistant_last_sign_in_factory_time IS 'When the person last signed in to the Audit Assistant, in factory time. Empty if never.';
COMMENT ON COLUMN overview.people.assistant_last_sign_in_utc IS 'When the person last signed in to the Audit Assistant, in UTC. Empty if never.';
COMMENT ON COLUMN overview.people.assistant_devices IS 'How many different devices the person has signed in to the Audit Assistant from.';
COMMENT ON COLUMN overview.people.assistant_signed_in_devices IS 'On how many devices the person is signed in to the Audit Assistant right now.';
COMMENT ON COLUMN overview.people.assistant_last_ip_address IS 'The network address the person last used the Audit Assistant from.';
COMMENT ON COLUMN overview.people.assistant_messages_sent IS 'How many messages the person has sent to the Audit Assistant (their text is never shown here).';
COMMENT ON COLUMN overview.people.assistant_actions IS 'How many actions the Audit Assistant has taken or proposed in DCRS for this person.';

-- ---------------------------------------------------------------- sessions
CREATE VIEW overview.assistant_sessions AS
SELECT
  s.id::text AS session_id,
  CASE WHEN u.provider = 'dcrs' THEN u.external_id END AS person_id,
  coalesce(p.name, u.display_name) AS person_name,
  s.device_name AS device_name,
  s.device_model AS device_model,
  nullif(btrim(concat_ws(' ', s.os, s.os_version)), '') AS operating_system,
  s.app_version AS app_version,
  s.user_agent AS user_agent,
  s.sign_in_ip AS sign_in_ip_address,
  s.last_ip AS last_ip_address,
  overview.factory_time(s.created_at) AS started_factory_time,
  overview.utc_time(s.created_at) AS started_utc,
  overview.factory_time(s.last_seen_at) AS last_seen_factory_time,
  overview.utc_time(s.last_seen_at) AS last_seen_utc,
  overview.factory_time(s.expires_at) AS expires_factory_time,
  overview.factory_time(s.ended_at) AS ended_factory_time,
  overview.utc_time(s.ended_at) AS ended_utc,
  CASE s.end_reason
    WHEN 'signed_out' THEN 'Signed out'
    WHEN 'revoked' THEN 'Signed out by a super admin'
    WHEN 'replaced' THEN 'Signed in again on the same device'
    WHEN 'upstream_signed_out' THEN 'DCRS stopped accepting the sign-in'
    ELSE s.end_reason
  END AS end_reason,
  CASE
    WHEN s.ended_at IS NOT NULL THEN 'Ended'
    WHEN s.expires_at <= now() THEN 'Expired'
    ELSE 'Signed in'
  END AS state
FROM chatbot.sessions s
JOIN chatbot.users u ON u.id = s.user_id
LEFT JOIN overview.dcrs_accounts p ON u.provider = 'dcrs' AND p.person_id = u.external_id
ORDER BY s.last_seen_at DESC;

COMMENT ON VIEW overview.assistant_sessions IS
  'One row per device a person has signed in to the Audit Assistant from: which device, from which address, since when, and whether it is still signed in. Never the session''s token.';
COMMENT ON COLUMN overview.assistant_sessions.session_id IS 'The sign-in''s id in the Audit Assistant.';
COMMENT ON COLUMN overview.assistant_sessions.person_id IS 'The person''s DCRS account id.';
COMMENT ON COLUMN overview.assistant_sessions.person_name IS 'The person''s name.';
COMMENT ON COLUMN overview.assistant_sessions.device_name IS 'The name the owner gave the device (for example Parth''s Pixel).';
COMMENT ON COLUMN overview.assistant_sessions.device_model IS 'The device''s model (for example Pixel 8).';
COMMENT ON COLUMN overview.assistant_sessions.operating_system IS 'The device''s operating system and its version (for example Android 15).';
COMMENT ON COLUMN overview.assistant_sessions.app_version IS 'The version of the Audit Assistant app on the device.';
COMMENT ON COLUMN overview.assistant_sessions.user_agent IS 'What the app or browser said it was, word for word.';
COMMENT ON COLUMN overview.assistant_sessions.sign_in_ip_address IS 'The network address the person signed in from.';
COMMENT ON COLUMN overview.assistant_sessions.last_ip_address IS 'The network address the device last used.';
COMMENT ON COLUMN overview.assistant_sessions.started_factory_time IS 'When the person signed in on this device, in factory time.';
COMMENT ON COLUMN overview.assistant_sessions.started_utc IS 'When the person signed in on this device, in UTC.';
COMMENT ON COLUMN overview.assistant_sessions.last_seen_factory_time IS 'When the device was last used, in factory time.';
COMMENT ON COLUMN overview.assistant_sessions.last_seen_utc IS 'When the device was last used, in UTC.';
COMMENT ON COLUMN overview.assistant_sessions.expires_factory_time IS 'When the sign-in runs out on its own, in factory time.';
COMMENT ON COLUMN overview.assistant_sessions.ended_factory_time IS 'When the sign-in was ended, in factory time. Empty while it lasts.';
COMMENT ON COLUMN overview.assistant_sessions.ended_utc IS 'When the sign-in was ended, in UTC. Empty while it lasts.';
COMMENT ON COLUMN overview.assistant_sessions.end_reason IS 'Why it ended: Signed out, Signed out by a super admin, Signed in again on the same device, or DCRS stopped accepting the sign-in.';
COMMENT ON COLUMN overview.assistant_sessions.state IS 'Signed in, Expired or Ended.';

-- ---------------------------------------------------------------- sign-ins
CREATE VIEW overview.assistant_sign_ins AS
SELECT
  e.id::text AS sign_in_id,
  overview.factory_time(e.created_at) AS happened_factory_time,
  overview.utc_time(e.created_at) AS happened_utc,
  overview.factory_time(e.created_at)::date AS happened_date,
  e.username AS username,
  coalesce(CASE WHEN u.provider = 'dcrs' THEN u.external_id END, by_name.person_id) AS person_id,
  coalesce(by_id.name, u.display_name, by_name.name) AS person_name,
  CASE WHEN e.success THEN 'Signed in' ELSE 'Refused' END AS result,
  CASE e.failure_reason
    WHEN 'invalid_credentials' THEN 'Wrong username or password'
    WHEN 'forbidden' THEN 'Not allowed to sign in'
    WHEN 'unauthorized' THEN 'DCRS did not accept the sign-in'
    WHEN 'unavailable' THEN 'DCRS could not be reached'
    WHEN 'error' THEN 'Something went wrong on the way to DCRS'
    ELSE e.failure_reason
  END AS failure_reason,
  e.ip AS ip_address,
  e.user_agent AS user_agent,
  overview.device_description(e.device) AS device
FROM chatbot.login_events e
LEFT JOIN chatbot.users u ON u.id = e.user_id
LEFT JOIN overview.dcrs_accounts by_id ON u.provider = 'dcrs' AND by_id.person_id = u.external_id
LEFT JOIN overview.dcrs_accounts by_name ON e.user_id IS NULL AND lower(by_name.email) = lower(btrim(e.username))
ORDER BY e.created_at DESC;

COMMENT ON VIEW overview.assistant_sign_ins IS
  'One row per attempt to sign in to the Audit Assistant, whether it worked or not: who, when, from which address and device, and why it was refused. Never the password.';
COMMENT ON COLUMN overview.assistant_sign_ins.sign_in_id IS 'The attempt''s id in the Audit Assistant.';
COMMENT ON COLUMN overview.assistant_sign_ins.happened_factory_time IS 'When it happened, in factory time.';
COMMENT ON COLUMN overview.assistant_sign_ins.happened_utc IS 'When it happened, in UTC.';
COMMENT ON COLUMN overview.assistant_sign_ins.happened_date IS 'The day it happened, at the factory.';
COMMENT ON COLUMN overview.assistant_sign_ins.username IS 'The username typed (the DCRS email).';
COMMENT ON COLUMN overview.assistant_sign_ins.person_id IS 'The DCRS account it was for, when known.';
COMMENT ON COLUMN overview.assistant_sign_ins.person_name IS 'The person''s name, when known.';
COMMENT ON COLUMN overview.assistant_sign_ins.result IS 'Signed in, or Refused.';
COMMENT ON COLUMN overview.assistant_sign_ins.failure_reason IS 'Why it was refused: Wrong username or password, Not allowed to sign in, DCRS could not be reached, and so on.';
COMMENT ON COLUMN overview.assistant_sign_ins.ip_address IS 'The network address the attempt came from.';
COMMENT ON COLUMN overview.assistant_sign_ins.user_agent IS 'What the app or browser said it was, word for word.';
COMMENT ON COLUMN overview.assistant_sign_ins.device IS 'The device, as the app reported it: name, model, operating system and app version.';

-- ---------------------------------------------------------------- actions
CREATE VIEW overview.assistant_activity AS
WITH recs AS MATERIALIZED (
  SELECT r.record_id, r.document_id, r.document_name, r.record_date, r.last_changed_utc FROM overview.records r
),
records_by_id AS (
  SELECT DISTINCT ON (record_id) record_id, document_name, record_date FROM recs ORDER BY record_id, last_changed_utc DESC NULLS LAST
),
records_by_day AS (
  SELECT DISTINCT ON (document_id, record_date) document_id, record_date, record_id
  FROM recs WHERE record_date IS NOT NULL
  ORDER BY document_id, record_date, last_changed_utc DESC NULLS LAST, record_id
),
document_names AS (
  SELECT DISTINCT ON (document_id) document_id, document_name FROM recs ORDER BY document_id
),
found AS MATERIALIZED (
  SELECT f.finding_id, f.finding_reference, f.record_id FROM overview.findings f
),
targeted AS (
  -- The action's columns by name, never a.*: that would also read
  -- actions.request (the person's own words), which overview_owner may not
  -- read, and the whole view would then refuse to answer.
  SELECT a.id, a.user_id, a.action, a.kind, a.input, a.summary, a.status, a.error, a.created_at, a.finished_at,
         t.dcrs_record_id AS named_record_id, t.finding_id AS named_finding, t.document_id AS named_document,
         t.record_date AS named_day
  FROM chatbot.actions a
  LEFT JOIN LATERAL overview.assistant_action_targets(a.action, a.input) t ON true
),
resolved AS (
  SELECT
    x.*,
    coalesce(by_ref.record_id, by_id.record_id, x.named_record_id, by_day.record_id) AS target_record_id,
    coalesce(by_ref.finding_id, by_id.finding_id, x.named_finding) AS target_finding_id
  FROM targeted x
  LEFT JOIN found by_ref ON by_ref.finding_reference = x.named_finding
  LEFT JOIN found by_id ON by_ref.finding_id IS NULL AND lower(by_id.finding_id) = lower(x.named_finding)
  LEFT JOIN records_by_day by_day ON by_day.document_id = x.named_document AND by_day.record_date = x.named_day
)
SELECT
  r.id::text AS action_id,
  overview.factory_time(r.created_at) AS asked_factory_time,
  overview.utc_time(r.created_at) AS asked_utc,
  overview.factory_time(r.created_at)::date AS asked_date,
  overview.factory_time(r.finished_at) AS finished_factory_time,
  overview.utc_time(r.finished_at) AS finished_utc,
  CASE WHEN u.provider = 'dcrs' THEN u.external_id END AS person_id,
  coalesce(p.name, u.display_name) AS person_name,
  upper(left(replace(r.action, '_', ' '), 1)) || substr(replace(r.action, '_', ' '), 2) AS dcrs_action,
  CASE r.kind WHEN 'read' THEN 'Reads' WHEN 'write' THEN 'Changes' ELSE r.kind END AS reads_or_changes,
  r.summary AS what_was_asked,
  CASE r.status
    WHEN 'awaiting_confirmation' THEN 'Waiting for confirmation'
    WHEN 'running' THEN 'Running'
    WHEN 'succeeded' THEN 'Done'
    WHEN 'failed' THEN 'Failed'
    WHEN 'cancelled' THEN 'Cancelled'
    ELSE r.status
  END AS status,
  r.error AS error,
  r.input::text AS details,
  r.target_record_id AS dcrs_record_id,
  r.target_finding_id AS finding_id,
  coalesce(rec.document_name, names.document_name) AS document_name,
  coalesce(rec.record_date, r.named_day) AS record_date
FROM resolved r
JOIN chatbot.users u ON u.id = r.user_id
LEFT JOIN overview.dcrs_accounts p ON u.provider = 'dcrs' AND p.person_id = u.external_id
LEFT JOIN records_by_id rec ON rec.record_id = r.target_record_id
LEFT JOIN document_names names ON names.document_id = r.named_document
ORDER BY r.created_at DESC;

COMMENT ON VIEW overview.assistant_activity IS
  'One row per action the Audit Assistant took or proposed in DCRS for a person: who asked, which DCRS action it was, whether it only read or changed something, what happened, and which DCRS record or finding it was about. Never the person''s own words.';
COMMENT ON COLUMN overview.assistant_activity.action_id IS 'The action''s id in the Audit Assistant.';
COMMENT ON COLUMN overview.assistant_activity.asked_factory_time IS 'When the action was asked for (or proposed), in factory time.';
COMMENT ON COLUMN overview.assistant_activity.asked_utc IS 'When the action was asked for, in UTC.';
COMMENT ON COLUMN overview.assistant_activity.asked_date IS 'The day it was asked for, at the factory.';
COMMENT ON COLUMN overview.assistant_activity.finished_factory_time IS 'When it finished, in factory time. Empty while it waits or runs.';
COMMENT ON COLUMN overview.assistant_activity.finished_utc IS 'When it finished, in UTC.';
COMMENT ON COLUMN overview.assistant_activity.person_id IS 'The DCRS account of the person it was done for.';
COMMENT ON COLUMN overview.assistant_activity.person_name IS 'The person it was done for.';
COMMENT ON COLUMN overview.assistant_activity.dcrs_action IS 'Which DCRS action ran (for example Close finding, Get pest control report).';
COMMENT ON COLUMN overview.assistant_activity.reads_or_changes IS 'Reads (only looked something up) or Changes (changed something in DCRS, after the person confirmed).';
COMMENT ON COLUMN overview.assistant_activity.what_was_asked IS 'The action in one plain line, as the assistant described it to the person (for example Close finding CAPA-2023-12-13-1 with the note ...).';
COMMENT ON COLUMN overview.assistant_activity.status IS 'Waiting for confirmation, Running, Done, Failed or Cancelled.';
COMMENT ON COLUMN overview.assistant_activity.error IS 'What went wrong, when it failed.';
COMMENT ON COLUMN overview.assistant_activity.details IS 'What the action was given (its input), as the assistant sent it.';
COMMENT ON COLUMN overview.assistant_activity.dcrs_record_id IS 'The DCRS record the action was about, when there is one. It opens in DCRS at #/record/<this id> (a CAPA report at #/gap/<this id>).';
COMMENT ON COLUMN overview.assistant_activity.finding_id IS 'The CAPA finding the action was about, by its readable id, when there is one.';
COMMENT ON COLUMN overview.assistant_activity.document_name IS 'The name of the DCRS form the record is a copy of.';
COMMENT ON COLUMN overview.assistant_activity.record_date IS 'The date of that record, or the day the action asked about.';

-- ---------------------------------------------------------------- file handouts
CREATE VIEW overview.file_handouts AS
SELECT
  e.id::text AS handout_id,
  overview.factory_time(e.created_at) AS happened_factory_time,
  overview.utc_time(e.created_at) AS happened_utc,
  overview.factory_time(e.created_at)::date AS happened_date,
  coalesce(CASE WHEN u.provider = 'dcrs' THEN u.external_id END, by_name.person_id) AS person_id,
  e.display_name AS person_name,
  e.username AS username,
  CASE e.kind WHEN 'conversation' THEN 'Conversation' WHEN 'file' THEN 'File' ELSE e.kind END AS kind,
  CASE e.purpose WHEN 'open' THEN 'Opened' WHEN 'download' THEN 'Downloaded' WHEN 'share' THEN 'Shared' ELSE e.purpose END AS what_happened,
  e.filename AS file_name,
  e.mime_type AS file_type,
  e.size_bytes AS size_bytes,
  e.sha256 AS sha256,
  e.source AS source,
  e.conversation_id::text AS conversation_id,
  e.ip AS ip_address,
  e.user_agent AS user_agent,
  overview.device_description(e.device) AS device,
  e.time_zone AS time_zone
FROM chatbot.conversation_exports e
LEFT JOIN chatbot.users u ON u.id = e.user_id
LEFT JOIN overview.dcrs_accounts by_name ON u.id IS NULL AND lower(by_name.email) = lower(btrim(e.username))
ORDER BY e.created_at DESC;

COMMENT ON VIEW overview.file_handouts IS
  'One row per time data left the Audit Assistant for someone''s device: a conversation downloaded or shared, or a file (such as a DCRS report) opened, downloaded or shared. Who, what, when, from which address and device. The trail to follow after a data breach. Never the contents.';
COMMENT ON COLUMN overview.file_handouts.handout_id IS 'The hand-out''s id in the Audit Assistant.';
COMMENT ON COLUMN overview.file_handouts.happened_factory_time IS 'When it happened, in factory time.';
COMMENT ON COLUMN overview.file_handouts.happened_utc IS 'When it happened, in UTC.';
COMMENT ON COLUMN overview.file_handouts.happened_date IS 'The day it happened, at the factory.';
COMMENT ON COLUMN overview.file_handouts.person_id IS 'The DCRS account of the person who received it.';
COMMENT ON COLUMN overview.file_handouts.person_name IS 'The person''s name, as it was then.';
COMMENT ON COLUMN overview.file_handouts.username IS 'The person''s username (the DCRS email), as it was then.';
COMMENT ON COLUMN overview.file_handouts.kind IS 'Conversation (a chat) or File (for example a report from DCRS).';
COMMENT ON COLUMN overview.file_handouts.what_happened IS 'Opened, Downloaded or Shared.';
COMMENT ON COLUMN overview.file_handouts.file_name IS 'The file''s name.';
COMMENT ON COLUMN overview.file_handouts.file_type IS 'The kind of file (for example application/pdf).';
COMMENT ON COLUMN overview.file_handouts.size_bytes IS 'The file''s size in bytes.';
COMMENT ON COLUMN overview.file_handouts.sha256 IS 'The file''s SHA-256 fingerprint: a copy found anywhere can be matched to this row.';
COMMENT ON COLUMN overview.file_handouts.source IS 'The system a file came from (for example the Digital Controlled Record System). Empty for a conversation.';
COMMENT ON COLUMN overview.file_handouts.conversation_id IS 'The conversation it was handed out from.';
COMMENT ON COLUMN overview.file_handouts.ip_address IS 'The network address it went to.';
COMMENT ON COLUMN overview.file_handouts.user_agent IS 'What the app or browser said it was, word for word.';
COMMENT ON COLUMN overview.file_handouts.device IS 'The device, as the app reported it: name, model, operating system and app version.';
COMMENT ON COLUMN overview.file_handouts.time_zone IS 'The time zone the device reported.';

-- ---------------------------------------------------------------- downloads
CREATE VIEW overview.downloads AS
SELECT
  d.happened_factory_time AS happened_factory_time,
  d.happened_utc AS happened_utc,
  d.happened_date AS happened_date,
  'DCRS'::text AS system,
  d.person_name AS person_name,
  d.what_happened AS what_happened,
  d.document AS what,
  d.detail AS detail,
  d.ip_address AS ip_address,
  NULL::text AS device
FROM overview.dcrs_downloads d
UNION ALL
SELECT
  h.happened_factory_time,
  h.happened_utc,
  h.happened_date,
  'Audit Assistant'::text,
  h.person_name,
  h.what_happened || CASE WHEN h.kind = 'Conversation' THEN ' a conversation' ELSE ' a file' END,
  h.file_name,
  nullif(concat_ws(', ', 'from ' || h.source, h.file_type, pg_size_pretty(h.size_bytes::bigint)), ''),
  h.ip_address,
  h.device
FROM overview.file_handouts h
ORDER BY happened_utc DESC;

COMMENT ON VIEW overview.downloads IS
  'Everything that left either system, together: DCRS''s downloads, prints and uploads, and the Audit Assistant''s files and conversations opened, downloaded or shared. Who, what, when and from where.';
COMMENT ON COLUMN overview.downloads.happened_factory_time IS 'When it happened, in factory time.';
COMMENT ON COLUMN overview.downloads.happened_utc IS 'When it happened, in UTC.';
COMMENT ON COLUMN overview.downloads.happened_date IS 'The day it happened, at the factory.';
COMMENT ON COLUMN overview.downloads.system IS 'DCRS, or Audit Assistant.';
COMMENT ON COLUMN overview.downloads.person_name IS 'Who did it.';
COMMENT ON COLUMN overview.downloads.what_happened IS 'For DCRS: Downloaded as Excel, Word or PDF, Printed, or Uploaded changes. For the Audit Assistant: Opened, Downloaded or Shared a file or a conversation.';
COMMENT ON COLUMN overview.downloads.what IS 'Which document or file.';
COMMENT ON COLUMN overview.downloads.detail IS 'More about it: for DCRS the record''s date, page or file; for the Audit Assistant where the file came from, its type and size.';
COMMENT ON COLUMN overview.downloads.ip_address IS 'The network address it went to.';
COMMENT ON COLUMN overview.downloads.device IS 'The device, as the Audit Assistant''s app reported it. DCRS does not record devices, so it is empty for DCRS.';

-- ============================================================ who owns and who reads
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['people', 'assistant_sessions', 'assistant_sign_ins', 'assistant_activity', 'file_handouts', 'downloads'] LOOP
    EXECUTE format('ALTER VIEW overview.%I OWNER TO overview_owner', v);
    EXECUTE format('REVOKE ALL ON overview.%I FROM PUBLIC', v);
    EXECUTE format('GRANT SELECT ON overview.%I TO overview_viewer', v);
  END LOOP;
END $$;

DO $$
DECLARE
  dcrs_owner name := (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_storage');
BEGIN
  EXECUTE format('ALTER FUNCTION overview.device_description(jsonb) OWNER TO %I', dcrs_owner);
  EXECUTE format('ALTER FUNCTION overview.assistant_action_targets(text, jsonb) OWNER TO %I', dcrs_owner);
END $$;
REVOKE ALL ON FUNCTION overview.device_description(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION overview.assistant_action_targets(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION overview.device_description(jsonb) TO overview_viewer, overview_owner;
GRANT EXECUTE ON FUNCTION overview.assistant_action_targets(text, jsonb) TO overview_viewer, overview_owner;
