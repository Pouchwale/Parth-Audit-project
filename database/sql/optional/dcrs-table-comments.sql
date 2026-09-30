-- ============================================================================
-- OPTIONAL: plain-English comments on DCRS's own tables and columns.
--
-- NOT APPLIED BY DEFAULT. A comment is metadata only: it changes no table,
-- column, type, index, constraint, trigger, grant or owner, and no row, and
-- DCRS neither reads nor writes comments. But the rule of the shared database
-- is to change nothing that exists in DCRS, so adding them is the owner's
-- call. They make DCRS's tables readable in any database tool and in the data
-- dictionary (docs/database/data-dictionary.md).
--
-- Apply with:   npm run db:shared -- setup --with-dcrs-comments
-- (or run this file as a superuser, or as the role that owns DCRS's tables).
-- Safe to run again: each statement simply sets the comment.
--
-- To take them all off again (DCRS's tables had no comments before):
--   DO $$ DECLARE t regclass; c name; BEGIN
--     FOR t IN SELECT oid::regclass FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') LOOP
--       EXECUTE format('COMMENT ON TABLE %s IS NULL', t);
--       FOR c IN SELECT attname FROM pg_attribute WHERE attrelid = t AND attnum > 0 AND NOT attisdropped LOOP
--         EXECUTE format('COMMENT ON COLUMN %s.%I IS NULL', t, c);
--       END LOOP;
--     END LOOP;
--   END $$;
--
-- Written against DCRS's tables as backend/db.ts, backend/activityArchive.ts
-- and backend/escalation.ts make them (30-Sep-2026). When DCRS gains a table
-- or a column, add its comment here: database/tests/sharedDatabase.test.ts
-- checks that this file leaves no DCRS table or column without one.
-- ============================================================================

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['public.users', 'public.digest_log', 'public.app_storage', 'public.activity_log',
                    'public.activity_log_archive', 'public.activity_daily', 'public.activity_daily_state',
                    'public.job_runs', 'public.escalations', 'public.weekly_digests']) AS t
  WHERE to_regclass(t) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'DCRS''s tables are not all here (missing: %). Start DCRS once against this database (it makes and updates its own tables), then run this again.', missing;
  END IF;
END $$;

-- ---------------------------------------------------------------- users
COMMENT ON TABLE public.users IS
  'One row per DCRS sign-in account. Made by the super admin on the Users & Access page, or by DCRS itself for the seeded accounts. An account is never deleted: it is switched off, so the person''s name stays on everything they signed.';
COMMENT ON COLUMN public.users.id IS 'The account''s id (a random UUID, kept as text). It never changes. The Audit Assistant keeps it as the person''s external id (chatbot.users.external_id).';
COMMENT ON COLUMN public.users.name IS 'The person''s name, as DCRS shows it and writes it in records and their history.';
COMMENT ON COLUMN public.users.email IS 'The email address the person signs in with, in lower case. No two accounts share one.';
COMMENT ON COLUMN public.users.password_hash IS 'SECRET. The bcrypt hash of the person''s password. Never sent to a browser and never shown in any overview view.';
COMMENT ON COLUMN public.users.role IS 'admin (the super admin, who sees and manages everything) or staff.';
COMMENT ON COLUMN public.users.created_at IS 'When the account was made, as text in ISO form (for example 2026-09-17T10:45:07.591Z).';
COMMENT ON COLUMN public.users.departments IS 'The codes of the departments whose documents the account may see, separated by commas (for example HR,QC). Empty means every department.';
COMMENT ON COLUMN public.users.must_change_password IS 'True while the person still has a password the super admin gave them. They must choose their own before they can do anything else.';
COMMENT ON COLUMN public.users.active IS 'False for an account the super admin has switched off: it cannot sign in, and a session still open stops at its next request.';
COMMENT ON COLUMN public.users.last_sign_in IS 'When the person last signed in, as text in ISO form. Empty if never.';

-- ---------------------------------------------------------------- digest_log
COMMENT ON TABLE public.digest_log IS
  'One row: the last date a reminder email digest went out, so the digest goes once a day however many people open DCRS that morning.';
COMMENT ON COLUMN public.digest_log.id IS 'Always 1: the table holds one row.';
COMMENT ON COLUMN public.digest_log.last_sent_date IS 'The date the last reminder digest was sent (YYYY-MM-DD).';

-- ---------------------------------------------------------------- app_storage
COMMENT ON TABLE public.app_storage IS
  'DCRS''s own data, one row per stored item, each item whole as JSON text. The company''s items (scope company): records (every filled-in form), documents (the forms themselves), master (master data), hrMasterData, referenceEdits, formatEdits, deletions and live-start. A person''s own items (scope = their account id): settings, assistant-conversations (their chats with Mitra), sidebar-open-modules and sidebar-visible. The overview views read only the company''s records, documents and master.';
COMMENT ON COLUMN public.app_storage.scope IS 'company for what the whole plant shares, or a person''s account id (users.id) for what is theirs alone.';
COMMENT ON COLUMN public.app_storage.key IS 'Which item: records, documents, master, hrMasterData, referenceEdits, formatEdits, deletions or live-start for the company; settings, assistant-conversations, sidebar-open-modules or sidebar-visible for a person.';
COMMENT ON COLUMN public.app_storage.value IS 'The item exactly as DCRS wrote it, as JSON text. A person''s own items hold their settings and their chats with Mitra, and are never shown in any overview view.';
COMMENT ON COLUMN public.app_storage.version IS 'How many times the item has been written. A write made from an older version is refused and merged in the browser, never written over a newer one.';
COMMENT ON COLUMN public.app_storage.seq IS 'The order of every write to every item (from the sequence app_storage_seq), so a browser can ask what has changed since it last looked.';
COMMENT ON COLUMN public.app_storage.updated_at IS 'When the item was last written.';
COMMENT ON COLUMN public.app_storage.updated_by IS 'The email of the account that last wrote the item.';

-- ---------------------------------------------------------------- activity_log
COMMENT ON TABLE public.activity_log IS
  'DCRS''s activity log: one line for everything anybody does, such as signing in and out, opening, filling in, submitting, verifying, printing and downloading records, and changing formats and accounts. Who, when and from which address are stamped by the server. Lines are only ever added: a trigger refuses to change or delete them, and the super admin moves old lines to activity_log_archive.';
COMMENT ON COLUMN public.activity_log.id IS 'The line''s number. It never changes, even when the line is moved to the archive.';
COMMENT ON COLUMN public.activity_log.at IS 'When it happened.';
COMMENT ON COLUMN public.activity_log.user_id IS 'The account that did it (users.id). Empty for DCRS''s own scheduled jobs, whose lines are written as System.';
COMMENT ON COLUMN public.activity_log.user_name IS 'The person''s name as it was at the time.';
COMMENT ON COLUMN public.activity_log.user_email IS 'The person''s email as it was at the time.';
COMMENT ON COLUMN public.activity_log.action IS 'What was done, in DCRS''s own words (for example Record edited, Document printed, Signed in).';
COMMENT ON COLUMN public.activity_log.target IS 'What it was done on: usually the form''s number, name and date.';
COMMENT ON COLUMN public.activity_log.detail IS 'More about it: the note, the fields changed, the file name. A change made through another system starts with Through <its name> (for example Through Audit Assistant).';
COMMENT ON COLUMN public.activity_log.department IS 'The code of the department that owns the document it concerns. Empty when it concerns no document.';
COMMENT ON COLUMN public.activity_log.ip IS 'The network address the request came from.';
COMMENT ON COLUMN public.activity_log.client_id IS 'The browser''s own id for the line (a UUID), so a line sent twice is written once. Empty for the server''s own lines.';

-- ---------------------------------------------------------------- activity_log_archive
COMMENT ON TABLE public.activity_log_archive IS
  'Old lines of the activity log that the super admin moved out of it on purpose (Activity Log page), with the ids and columns they had in the log. Lines here are only ever added too.';
COMMENT ON COLUMN public.activity_log_archive.id IS 'The line''s number: the same number it had in the activity log.';
COMMENT ON COLUMN public.activity_log_archive.at IS 'When it happened.';
COMMENT ON COLUMN public.activity_log_archive.user_id IS 'The account that did it (users.id). Empty for DCRS''s own scheduled jobs.';
COMMENT ON COLUMN public.activity_log_archive.user_name IS 'The person''s name as it was at the time.';
COMMENT ON COLUMN public.activity_log_archive.user_email IS 'The person''s email as it was at the time.';
COMMENT ON COLUMN public.activity_log_archive.action IS 'What was done, in DCRS''s own words.';
COMMENT ON COLUMN public.activity_log_archive.target IS 'What it was done on: usually the form''s number, name and date.';
COMMENT ON COLUMN public.activity_log_archive.detail IS 'More about it: the note, the fields changed, the file name.';
COMMENT ON COLUMN public.activity_log_archive.department IS 'The code of the department that owns the document it concerns. Empty when it concerns no document.';
COMMENT ON COLUMN public.activity_log_archive.ip IS 'The network address the request came from.';
COMMENT ON COLUMN public.activity_log_archive.client_id IS 'The browser''s own id for the line, as it was in the log.';
COMMENT ON COLUMN public.activity_log_archive.archived_at IS 'When the line was moved to the archive.';
COMMENT ON COLUMN public.activity_log_archive.archived_by IS 'The super admin who moved it, as Name <email>.';

-- ---------------------------------------------------------------- activity_daily
COMMENT ON TABLE public.activity_daily IS
  'The activity log counted day by day, which the per-person tally reads for days that are over: one row per day, person, department and action. A copy made from the log and its archive, never instead of them.';
COMMENT ON COLUMN public.activity_daily.day IS 'The day, in the factory''s time zone.';
COMMENT ON COLUMN public.activity_daily.archived IS 'True when the lines counted are in the archive, false when they are in the activity log itself.';
COMMENT ON COLUMN public.activity_daily.user_id IS 'The account whose lines are counted (users.id). Empty for DCRS''s own scheduled jobs.';
COMMENT ON COLUMN public.activity_daily.user_name IS 'The person''s name, as written on the lines.';
COMMENT ON COLUMN public.activity_daily.department IS 'The department code the lines are filed under. Empty for lines about no document.';
COMMENT ON COLUMN public.activity_daily.action IS 'The action counted, in DCRS''s own words.';
COMMENT ON COLUMN public.activity_daily.n IS 'How many lines there were.';
COMMENT ON COLUMN public.activity_daily.first_at IS 'When the first of them happened.';
COMMENT ON COLUMN public.activity_daily.last_at IS 'When the last of them happened.';

-- ---------------------------------------------------------------- activity_daily_state
COMMENT ON TABLE public.activity_daily_state IS
  'One row: how far activity_daily is complete. Deleting the row makes DCRS count every day again.';
COMMENT ON COLUMN public.activity_daily_state.id IS 'Always 1: the table holds one row.';
COMMENT ON COLUMN public.activity_daily_state.through IS 'Every day up to and including this date is counted in activity_daily.';
COMMENT ON COLUMN public.activity_daily_state.time_zone IS 'The time zone the days were counted in (DCRS''s PLANT_TIMEZONE).';

-- ---------------------------------------------------------------- job_runs
COMMENT ON TABLE public.job_runs IS
  'One row per scheduled run a DCRS server has claimed: the daily escalation and the weekly digest. The job and period together are the claim, so each runs once however many servers share the database.';
COMMENT ON COLUMN public.job_runs.job IS 'Which job: escalation (every working day) or weekly-digest (once a week).';
COMMENT ON COLUMN public.job_runs.period IS 'What it ran for: a day (for example 2026-09-24) for the escalation, an ISO week (for example 2026-W38) for the digest. A run that failed or was abandoned is kept as <period> failed <when> or <period> abandoned <when>, so it can be tried again.';
COMMENT ON COLUMN public.job_runs.claimed_at IS 'When a server claimed the run.';
COMMENT ON COLUMN public.job_runs.finished_at IS 'When the run finished. Empty while it runs.';
COMMENT ON COLUMN public.job_runs.outcome IS 'How the run ended, in words.';

-- ---------------------------------------------------------------- escalations
COMMENT ON TABLE public.escalations IS
  'The super admin''s escalations: one row per person or department per ISO week with 3 or more late submissions, or 2 or more records never done, in the last 30 days. Seen by the super admin only.';
COMMENT ON COLUMN public.escalations.id IS 'The escalation''s number.';
COMMENT ON COLUMN public.escalations.raised_at IS 'When it was first raised.';
COMMENT ON COLUMN public.escalations.updated_at IS 'When its figures last changed.';
COMMENT ON COLUMN public.escalations.kind IS 'person or department.';
COMMENT ON COLUMN public.escalations.subject_key IS 'Who it is about: an account id (users.id), or dept:<code> for a department (for example dept:HR).';
COMMENT ON COLUMN public.escalations.subject_name IS 'The person''s or the department''s name.';
COMMENT ON COLUMN public.escalations.department IS 'The code of the department it is filed under.';
COMMENT ON COLUMN public.escalations.period IS 'The ISO week it is for (for example 2026-W39).';
COMMENT ON COLUMN public.escalations.late IS 'How many records were handed in late in the last 30 days.';
COMMENT ON COLUMN public.escalations.never_done IS 'How many records were never done in the last 30 days.';
COMMENT ON COLUMN public.escalations.evidence IS 'What it stands on, as JSON: the 30 days, the rule, the worst documents and up to ten of the records.';
COMMENT ON COLUMN public.escalations.acknowledged_by IS 'The super admin who acknowledged it. Empty until then.';
COMMENT ON COLUMN public.escalations.acknowledged_at IS 'When it was acknowledged. Empty until then.';
COMMENT ON COLUMN public.escalations.record_ids IS 'The id of every record behind the figures that day.';
COMMENT ON COLUMN public.escalations.seen_ids IS 'The records the super admin had in front of them when they acknowledged it. It opens again only for a record not among these.';

-- ---------------------------------------------------------------- weekly_digests
COMMENT ON TABLE public.weekly_digests IS
  'The super admin''s digest of each week, as the Performance page shows it: one row per ISO week.';
COMMENT ON COLUMN public.weekly_digests.period IS 'The ISO week it digests (for example 2026-W38).';
COMMENT ON COLUMN public.weekly_digests.created_at IS 'When it was made.';
COMMENT ON COLUMN public.weekly_digests.body IS 'The digest itself, as JSON.';
