-- ============================================================================
-- OPTIONAL: plain-English comments on the Audit Assistant's own tables and
-- columns (schema chatbot).
--
-- The Audit Assistant makes and owns these tables through its own migrations;
-- DCRS never touches them. This file is written for two people:
--   * the Audit Assistant's developer, to fold into the assistant's own
--     migrations (a custom migration: drizzle-kit generate --custom, then paste
--     the COMMENT statements), so the comments travel with the tables;
--   * the database administrator, who may run it after the assistant has
--     started once and made its tables:
--         npm run db:shared -- setup --with-chatbot --with-chatbot-comments
--     (or run this file as a superuser, or as the role audit_assistant).
-- A comment is metadata only: no table, column, row or grant changes. Safe to
-- run again.
--
-- Written against the assistant's tables as its server/src/db/schema.ts
-- defines them on 29-Sep-2026, in the schema chatbot. When the assistant gains
-- a table or a column, add its comment here: database/tests/sharedDatabase.test.ts
-- checks that this file leaves none without one.
--
-- SECRET and PRIVATE mark the columns that no overview view ever shows: the
-- role that owns those views (overview_owner) is not even allowed to read them.
-- ============================================================================

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['chatbot.users', 'chatbot.sessions', 'chatbot.connector_credentials', 'chatbot.login_events',
                    'chatbot.conversations', 'chatbot.actions', 'chatbot.message_events', 'chatbot.files',
                    'chatbot.conversation_exports', 'chatbot.weekly_reports']) AS t
  WHERE to_regclass(t) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'The Audit Assistant''s tables are not all here (missing: %). Start the Audit Assistant once against this database with its updated migrations, then run this again.', missing;
  END IF;
END $$;

-- ---------------------------------------------------------------- users
COMMENT ON TABLE chatbot.users IS
  'One row per person who has signed in to the Audit Assistant, keyed by their account in the system they sign in with (DCRS). The row is made at the first sign-in.';
COMMENT ON COLUMN chatbot.users.id IS 'The person''s id in the Audit Assistant (a UUID). Every other table of the assistant points to it.';
COMMENT ON COLUMN chatbot.users.provider IS 'The system the person signs in with: dcrs.';
COMMENT ON COLUMN chatbot.users.external_id IS 'The person''s account id in that system: for DCRS, public.users.id. A link by value only, never a foreign key: the assistant never reads DCRS''s tables.';
COMMENT ON COLUMN chatbot.users.username IS 'The username the person signs in with (their DCRS email).';
COMMENT ON COLUMN chatbot.users.display_name IS 'The person''s name, as DCRS gave it at the last sign-in.';
COMMENT ON COLUMN chatbot.users.created_at IS 'When the person first signed in to the Audit Assistant.';
COMMENT ON COLUMN chatbot.users.last_login_at IS 'When the person last signed in to the Audit Assistant.';

-- ---------------------------------------------------------------- sessions
COMMENT ON TABLE chatbot.sessions IS
  'One row per signed-in device. A session lasts while ended_at is empty and expires_at is still ahead. Kept for good, as the record of who used the assistant from which device.';
COMMENT ON COLUMN chatbot.sessions.id IS 'The session''s id (a UUID).';
COMMENT ON COLUMN chatbot.sessions.user_id IS 'Who signed in (chatbot.users.id).';
COMMENT ON COLUMN chatbot.sessions.token_hash IS 'SECRET. A hash of the session token the device holds. Never shown in any overview view.';
COMMENT ON COLUMN chatbot.sessions.device_id IS 'The app''s own id for the device, so signing in again on the same device replaces the old session.';
COMMENT ON COLUMN chatbot.sessions.device_name IS 'The name the owner gave the device (for example Parth''s Pixel).';
COMMENT ON COLUMN chatbot.sessions.device_model IS 'The device''s model (for example Pixel 8).';
COMMENT ON COLUMN chatbot.sessions.os IS 'The device''s operating system (for example Android).';
COMMENT ON COLUMN chatbot.sessions.os_version IS 'The operating system''s version (for example 15).';
COMMENT ON COLUMN chatbot.sessions.app_version IS 'The version of the Audit Assistant app on the device.';
COMMENT ON COLUMN chatbot.sessions.user_agent IS 'What the app or browser said it was, word for word.';
COMMENT ON COLUMN chatbot.sessions.sign_in_ip IS 'The network address the person signed in from.';
COMMENT ON COLUMN chatbot.sessions.last_ip IS 'The network address the device last used.';
COMMENT ON COLUMN chatbot.sessions.created_at IS 'When the person signed in on this device.';
COMMENT ON COLUMN chatbot.sessions.last_seen_at IS 'When the device was last used.';
COMMENT ON COLUMN chatbot.sessions.expires_at IS 'When the session runs out on its own.';
COMMENT ON COLUMN chatbot.sessions.ended_at IS 'When the session was ended. Empty while it lasts.';
COMMENT ON COLUMN chatbot.sessions.end_reason IS 'Why it ended: signed_out (by the person), revoked (by a super admin), replaced (the same device signed in again) or upstream_signed_out (DCRS stopped accepting the stored sign-in).';

-- ---------------------------------------------------------------- connector_credentials
COMMENT ON TABLE chatbot.connector_credentials IS
  'SECRET. The DCRS sign-in behind each session, encrypted with the assistant''s CREDENTIALS_KEY. No overview view reads this table at all.';
COMMENT ON COLUMN chatbot.connector_credentials.session_id IS 'The session it belongs to (chatbot.sessions.id). Deleted with the session.';
COMMENT ON COLUMN chatbot.connector_credentials.connector_id IS 'The connected system: dcrs.';
COMMENT ON COLUMN chatbot.connector_credentials.sealed IS 'SECRET. The DCRS session token, encrypted. Never shown anywhere.';
COMMENT ON COLUMN chatbot.connector_credentials.expires_at IS 'When DCRS stops accepting the token (a DCRS session ends at the close of the day it began).';

-- ---------------------------------------------------------------- login_events
COMMENT ON TABLE chatbot.login_events IS
  'One row per attempt to sign in to the Audit Assistant, whether it worked or not, with the address and device it came from. Kept for good. Never the password.';
COMMENT ON COLUMN chatbot.login_events.id IS 'The attempt''s id (a UUID).';
COMMENT ON COLUMN chatbot.login_events.user_id IS 'Who signed in (chatbot.users.id). Empty when the attempt could not be tied to a person the assistant knows.';
COMMENT ON COLUMN chatbot.login_events.session_id IS 'The session the sign-in opened (chatbot.sessions.id). Empty when it was refused.';
COMMENT ON COLUMN chatbot.login_events.username IS 'The username typed (the DCRS email).';
COMMENT ON COLUMN chatbot.login_events.success IS 'True when the sign-in worked.';
COMMENT ON COLUMN chatbot.login_events.failure_reason IS 'Why it was refused: invalid_credentials (wrong username or password), forbidden (not allowed to sign in), unauthorized, unavailable (DCRS could not be reached) or error.';
COMMENT ON COLUMN chatbot.login_events.ip IS 'The network address the attempt came from.';
COMMENT ON COLUMN chatbot.login_events.user_agent IS 'What the app or browser said it was, word for word.';
COMMENT ON COLUMN chatbot.login_events.device IS 'The device as the app reported it, as JSON: its name, model, operating system and app version.';
COMMENT ON COLUMN chatbot.login_events.created_at IS 'When the attempt was made.';

-- ---------------------------------------------------------------- conversations
COMMENT ON TABLE chatbot.conversations IS
  'PRIVATE. Each person''s chats with the Audit Assistant. They hold copies of business data, so they are deleted after a retention period (30 days without use by default). No overview view shows their text.';
COMMENT ON COLUMN chatbot.conversations.id IS 'The conversation''s id (a UUID).';
COMMENT ON COLUMN chatbot.conversations.user_id IS 'Whose conversation it is (chatbot.users.id).';
COMMENT ON COLUMN chatbot.conversations.session_id IS 'The session it was started from (chatbot.sessions.id).';
COMMENT ON COLUMN chatbot.conversations.title IS 'PRIVATE. The conversation''s title, made from its words. Never shown in any overview view.';
COMMENT ON COLUMN chatbot.conversations.transcript IS 'PRIVATE. The conversation as the person sees it, as JSON. Never shown in any overview view.';
COMMENT ON COLUMN chatbot.conversations.messages IS 'PRIVATE. The conversation as the model works on it, as JSON. Never shown in any overview view.';
COMMENT ON COLUMN chatbot.conversations.pending IS 'PRIVATE. Changes the assistant proposed that wait for the person to confirm, with what the person said, as JSON. Never shown in any overview view.';
COMMENT ON COLUMN chatbot.conversations.locked_until IS 'While a request is working on the conversation: until when no other request may change it.';
COMMENT ON COLUMN chatbot.conversations.created_at IS 'When the conversation was started.';
COMMENT ON COLUMN chatbot.conversations.updated_at IS 'When it last changed. The retention period counts from here.';

-- ---------------------------------------------------------------- actions
COMMENT ON TABLE chatbot.actions IS
  'The assistant''s audit trail: one row per action taken or proposed against DCRS, such as looking up findings or closing one. Changes wait for the person to confirm. Kept for good.';
COMMENT ON COLUMN chatbot.actions.id IS 'The action''s id (a UUID).';
COMMENT ON COLUMN chatbot.actions.user_id IS 'Who it was done for (chatbot.users.id).';
COMMENT ON COLUMN chatbot.actions.session_id IS 'The session it was asked from (chatbot.sessions.id).';
COMMENT ON COLUMN chatbot.actions.conversation_id IS 'The conversation it was asked in. A value only: the conversation may since have been deleted.';
COMMENT ON COLUMN chatbot.actions.connector_id IS 'The system acted on: dcrs.';
COMMENT ON COLUMN chatbot.actions.action IS 'The action''s name (for example close_finding, get_pest_control_report).';
COMMENT ON COLUMN chatbot.actions.kind IS 'read (only looks something up) or write (changes something, after the person confirms).';
COMMENT ON COLUMN chatbot.actions.input IS 'What the action was given, as JSON (for example the finding''s id and the note). overview.assistant_action_targets reads the DCRS record and finding from it.';
COMMENT ON COLUMN chatbot.actions.summary IS 'The action in one plain line, as the assistant described it to the person.';
COMMENT ON COLUMN chatbot.actions.status IS 'awaiting_confirmation, running, succeeded, failed or cancelled.';
COMMENT ON COLUMN chatbot.actions.error IS 'What went wrong, when it failed.';
COMMENT ON COLUMN chatbot.actions.request IS 'PRIVATE. What the person said that led to the action, in their own words. Never shown in any overview view.';
COMMENT ON COLUMN chatbot.actions.created_at IS 'When the action was asked for or proposed.';
COMMENT ON COLUMN chatbot.actions.finished_at IS 'When it finished. Empty while it waits or runs.';

-- ---------------------------------------------------------------- message_events
COMMENT ON TABLE chatbot.message_events IS
  'One row per message a person sent that the assistant took on: how long it was and how many files came with it, never its text. Kept for good, so the weekly reports can count messages after the conversations are deleted.';
COMMENT ON COLUMN chatbot.message_events.id IS 'The message''s id (a UUID).';
COMMENT ON COLUMN chatbot.message_events.user_id IS 'Who sent it (chatbot.users.id).';
COMMENT ON COLUMN chatbot.message_events.session_id IS 'The session it was sent from (chatbot.sessions.id).';
COMMENT ON COLUMN chatbot.message_events.conversation_id IS 'The conversation it was sent in. A value only: the conversation may since have been deleted.';
COMMENT ON COLUMN chatbot.message_events.chars IS 'How many characters the message had.';
COMMENT ON COLUMN chatbot.message_events.attachments IS 'How many files were attached to it.';
COMMENT ON COLUMN chatbot.message_events.created_at IS 'When it was sent.';

-- ---------------------------------------------------------------- files
COMMENT ON TABLE chatbot.files IS
  'PRIVATE. Files people attached and files DCRS returned (such as reports), with their bytes. They go with their conversation, and an upload never attached to a message is deleted after a day. No overview view shows their contents.';
COMMENT ON COLUMN chatbot.files.id IS 'The file''s id (a UUID).';
COMMENT ON COLUMN chatbot.files.user_id IS 'Whose file it is (chatbot.users.id).';
COMMENT ON COLUMN chatbot.files.conversation_id IS 'The conversation it belongs to (chatbot.conversations.id). Deleted with it.';
COMMENT ON COLUMN chatbot.files.origin IS 'upload (a person attached it) or system (a connected system such as DCRS returned it).';
COMMENT ON COLUMN chatbot.files.connector_id IS 'For a returned file: the system it came from (dcrs).';
COMMENT ON COLUMN chatbot.files.action_id IS 'For a returned file: the action that fetched it (chatbot.actions.id).';
COMMENT ON COLUMN chatbot.files.filename IS 'The file''s name.';
COMMENT ON COLUMN chatbot.files.relative_path IS 'Where the file sat inside a folder that was attached, when it came in one.';
COMMENT ON COLUMN chatbot.files.mime_type IS 'The kind of file (for example application/pdf).';
COMMENT ON COLUMN chatbot.files.size_bytes IS 'The file''s size in bytes.';
COMMENT ON COLUMN chatbot.files.sha256 IS 'The file''s SHA-256 fingerprint.';
COMMENT ON COLUMN chatbot.files.width IS 'For a picture: its width in pixels.';
COMMENT ON COLUMN chatbot.files.height IS 'For a picture: its height in pixels.';
COMMENT ON COLUMN chatbot.files.data IS 'PRIVATE. The file''s bytes. Never shown in any overview view.';
COMMENT ON COLUMN chatbot.files.text IS 'PRIVATE. The text read out of the file, or a description of a picture, as given to the model. Never shown in any overview view.';
COMMENT ON COLUMN chatbot.files.text_status IS 'Whether its text was read: ok, none (nothing readable), unsupported, failed or pending.';
COMMENT ON COLUMN chatbot.files.created_at IS 'When the file arrived.';

-- ---------------------------------------------------------------- conversation_exports
COMMENT ON TABLE chatbot.conversation_exports IS
  'Every time data left the assistant for someone''s device: a conversation downloaded or shared, or a file (such as a DCRS report) opened, downloaded or shared. Who, what, when, from which address and device, and the SHA-256 of what went. The trail to follow after a data breach. Kept for good: nothing that deletes a conversation, a file or an account deletes these rows.';
COMMENT ON COLUMN chatbot.conversation_exports.id IS 'The hand-out''s id (a UUID).';
COMMENT ON COLUMN chatbot.conversation_exports.kind IS 'conversation or file.';
COMMENT ON COLUMN chatbot.conversation_exports.purpose IS 'open, download or share.';
COMMENT ON COLUMN chatbot.conversation_exports.user_id IS 'Who received it (chatbot.users.id). Empty if the person''s row is gone; username and display_name keep who it was.';
COMMENT ON COLUMN chatbot.conversation_exports.username IS 'The person''s username (DCRS email) at the time.';
COMMENT ON COLUMN chatbot.conversation_exports.display_name IS 'The person''s name at the time.';
COMMENT ON COLUMN chatbot.conversation_exports.session_id IS 'The session it went to (chatbot.sessions.id).';
COMMENT ON COLUMN chatbot.conversation_exports.conversation_id IS 'The conversation it came from. A value only: the conversation may since have been deleted.';
COMMENT ON COLUMN chatbot.conversation_exports.conversation_title IS 'PRIVATE. The conversation''s title at the time. Never shown in any overview view.';
COMMENT ON COLUMN chatbot.conversation_exports.source IS 'For a file: the system it came from (for example the Digital Controlled Record System).';
COMMENT ON COLUMN chatbot.conversation_exports.file_id IS 'For a file: its id in chatbot.files. A value only: the file may since have been deleted.';
COMMENT ON COLUMN chatbot.conversation_exports.filename IS 'The name of what went out.';
COMMENT ON COLUMN chatbot.conversation_exports.mime_type IS 'The kind of file (for example application/pdf).';
COMMENT ON COLUMN chatbot.conversation_exports.size_bytes IS 'Its size in bytes.';
COMMENT ON COLUMN chatbot.conversation_exports.message_count IS 'For a conversation: how many messages it held.';
COMMENT ON COLUMN chatbot.conversation_exports.sha256 IS 'The SHA-256 fingerprint of exactly what went out: a copy found anywhere can be matched to this row.';
COMMENT ON COLUMN chatbot.conversation_exports.content IS 'PRIVATE. A copy of the conversation''s text that went out. Never shown in any overview view.';
COMMENT ON COLUMN chatbot.conversation_exports.content_bytes IS 'PRIVATE. A copy of the file''s bytes that went out. Never shown in any overview view.';
COMMENT ON COLUMN chatbot.conversation_exports.ip IS 'The network address it went to.';
COMMENT ON COLUMN chatbot.conversation_exports.user_agent IS 'What the app or browser said it was, word for word.';
COMMENT ON COLUMN chatbot.conversation_exports.device IS 'The device as the app reported it, as JSON: its name, model, operating system and app version.';
COMMENT ON COLUMN chatbot.conversation_exports.time_zone IS 'The time zone the device reported.';
COMMENT ON COLUMN chatbot.conversation_exports.created_at IS 'When it went out.';

-- ---------------------------------------------------------------- weekly_reports
COMMENT ON TABLE chatbot.weekly_reports IS
  'PRIVATE. The assistant''s report of each completed week, stored once and never changed. No overview view shows it.';
COMMENT ON COLUMN chatbot.weekly_reports.week_start IS 'The Monday the week starts on.';
COMMENT ON COLUMN chatbot.weekly_reports.time_zone IS 'The time zone the week was counted in.';
COMMENT ON COLUMN chatbot.weekly_reports.generated_at IS 'When the report was made.';
COMMENT ON COLUMN chatbot.weekly_reports.report IS 'PRIVATE. The report itself, as JSON. Never shown in any overview view.';

-- ---------------------------------------------------------------- the migrations ledger
-- Made by the assistant's migration tool (drizzle), not by its own schema, and
-- only when its migrations are told to keep their ledger in chatbot.
DO $$
BEGIN
  IF to_regclass('chatbot.__drizzle_migrations') IS NOT NULL THEN
    COMMENT ON TABLE chatbot.__drizzle_migrations IS
      'The Audit Assistant''s migration tool''s ledger: one row per migration already applied to the tables in chatbot. Written by the tool, never by hand.';
    COMMENT ON COLUMN chatbot.__drizzle_migrations.id IS 'The ledger line''s number.';
    COMMENT ON COLUMN chatbot.__drizzle_migrations.hash IS 'A fingerprint of the migration''s SQL.';
    COMMENT ON COLUMN chatbot.__drizzle_migrations.created_at IS 'The migration''s own time stamp, in milliseconds since 1970. Migrations newer than the last one here run at the next start.';
  END IF;
END $$;
