-- ============================================================================
-- THE SHARED DATABASE, PART 2: plain-English views over DCRS's own data.
--
-- Every view in this file reads DCRS's live tables in the schema "public", so
-- a change made in DCRS shows here at once. Nothing here holds data of its own.
-- One row is one real-world thing: a sign-in account, a filled-in form, a CAPA
-- finding, a customer complaint, a day of the pest control register, a line of
-- the activity log, a download or a print.
--
-- NOTHING OF DCRS IS CHANGED. The views belong to the role that already owns
-- DCRS's table app_storage, so they read DCRS's tables with that role's own
-- rights and nothing on DCRS's tables is granted to anyone. The role
-- overview_viewer may read the views, never the tables under them.
--
-- WHAT THE VIEWS NEVER SHOW: a password hash, and any stored item other than
-- the company's records, document list and master data (the other items hold
-- people's own settings and their chats with Mitra). database/tests checks both
-- from the catalog.
--
-- TIMES. A moment is shown twice: in the factory's time (Asia/Kolkata, the
-- function overview.factory_time_zone below) and in UTC, both without a time
-- zone mark. A calendar day is a date. "Today" is the factory's today.
--
-- Needs part 1 (01-schemas-and-roles.sql) first, and DCRS started at least
-- once, so that its tables exist. Needs PostgreSQL 16 or newer (it uses
-- pg_input_is_valid to read a stored date safely). Run as a superuser, in the
-- DCRS database. Safe to run again. Run by: npm run db:shared -- setup.
-- ============================================================================

DO $$
BEGIN
  IF current_setting('server_version_num')::int < 160000 THEN
    RAISE EXCEPTION 'The overview views need PostgreSQL 16 or newer; this server is %.', current_setting('server_version');
  END IF;
  IF to_regnamespace('overview') IS NULL THEN
    RAISE EXCEPTION 'The schema "overview" does not exist. Apply database/sql/01-schemas-and-roles.sql first.';
  END IF;
  IF to_regclass('public.app_storage') IS NULL OR to_regclass('public.users') IS NULL
     OR to_regclass('public.activity_log') IS NULL OR to_regclass('public.activity_log_archive') IS NULL THEN
    RAISE EXCEPTION 'DCRS''s tables are not in this database. Start DCRS once against it (it makes its own tables), then run this again.';
  END IF;
END $$;

-- ============================================================ small helpers
-- Each is a one-line SQL function, which PostgreSQL copies into the query that
-- calls it, so it costs nothing to use. Called from a view, a function runs as
-- the person reading the view, so none of them reads a table.

CREATE OR REPLACE FUNCTION overview.factory_time_zone() RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 'Asia/Kolkata'::text $$;
COMMENT ON FUNCTION overview.factory_time_zone() IS
  'The factory''s time zone, Asia/Kolkata (DCRS''s PLANT_TIMEZONE). The one place to change it if the plant is elsewhere.';

CREATE OR REPLACE FUNCTION overview.factory_today() RETURNS date
LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT (now() AT TIME ZONE overview.factory_time_zone())::date $$;
COMMENT ON FUNCTION overview.factory_today() IS
  'Today''s date at the factory.';

CREATE OR REPLACE FUNCTION overview.factory_time(moment timestamptz) RETURNS timestamp
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT moment AT TIME ZONE overview.factory_time_zone() $$;
COMMENT ON FUNCTION overview.factory_time(timestamptz) IS
  'A moment as the clock at the factory showed it.';

CREATE OR REPLACE FUNCTION overview.utc_time(moment timestamptz) RETURNS timestamp
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT moment AT TIME ZONE 'UTC' $$;
COMMENT ON FUNCTION overview.utc_time(timestamptz) IS
  'A moment in UTC (Coordinated Universal Time).';

CREATE OR REPLACE FUNCTION overview.moment_from_text(value text) RETURNS timestamptz
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}' AND pg_input_is_valid(value, 'timestamptz')
    THEN value::timestamptz
  END
$$;
COMMENT ON FUNCTION overview.moment_from_text(text) IS
  'A moment DCRS stored as text (for example 2026-09-17T10:45:07.591Z), or nothing when the text is not a moment.';

CREATE OR REPLACE FUNCTION overview.date_from_text(value text) RETURNS date
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND pg_input_is_valid(value, 'date')
    THEN value::date
  END
$$;
COMMENT ON FUNCTION overview.date_from_text(text) IS
  'A calendar day DCRS stored as text (for example 2026-09-29), or nothing when the text is not a real date.';

-- WHICH DEPARTMENT OWNS A DOCUMENT: DCRS's own rule, copied from
-- frontend/src/data/seed/documentDepartments.ts (DOCUMENT_DEPARTMENTS, then
-- departmentFromFormatNo). database/tests/sharedDatabase.test.ts checks this copy
-- against that file for every stored document, so the two cannot drift apart
-- unnoticed: when a document is added there, add it here too.
CREATE OR REPLACE FUNCTION overview.department_of_document(document_id text, format_number text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN document_id IN (
      'sys-document-list', 'sys-format-list', 'sys-document-change', 'sys-mrm-record', 'sys-mrm-agenda',
      'sys-audit-schedule', 'sys-audit-plan', 'sys-audit-risk', 'sys-audit-findings', 'sys-audit-nc', 'sys-nc-car',
      'sys-hara-monthly', 'sys-mock-recall', 'sys-backward-trace', 'sys-forward-trace', 'sys-objectives',
      'sys-site-security', 'sys-hara-annual'
    ) THEN 'SYS'
    WHEN document_id IN (
      'capa-customer-complaint', 'capa-complaint-ack', 'mkt-customer-feedback', 'mkt-feedback-analysis',
      'mkt-complaint-trend'
    ) THEN 'MKT'
    WHEN document_id IN (
      'service-agreement', 'pur-supplier-registration', 'pur-supplier-audit-report', 'pur-approved-suppliers',
      'pur-supplier-performance', 'pur-service-provider-performance'
    ) THEN 'PUR'
    WHEN document_id IN (
      'str-incoming-material-vehicle', 'str-sharp-metal-objects'
    ) THEN 'STR'
    WHEN document_id IN (
      'qc-viscosity', 'qc-adhesive-mixing', 'qc-temperature', 'qc-inspection-pouching', 'qc-inspection-slitting',
      'qc-inspection-printed-film', 'qc-inprocess-printing', 'qc-weight-scale-calibration',
      'qc-gsm-plate-calibration', 'qc-bopp-film', 'qc-corrugated-box', 'qc-label-stock', 'qc-paper-core',
      'qc-pvc-pet-film', 'qc-offset-ink', 'qc-duplex-board', 'qc-kraft-paper', 'qc-flexo-ink',
      'qc-lamination-adhesive-inspection', 'qc-side-pasting-adhesive', 'qc-starch-powder', 'qc-sheet-pasting-powder',
      'qc-line-clearance-printing', 'qc-line-clearance-qc-machine', 'qc-line-clearance-qc-manual',
      'qc-line-clearance-slitting', 'qc-line-clearance-sleeve-gluing', 'qc-line-clearance-sleeve-cutting',
      'qc-line-clearance-materials', 'qc-line-clearance-quality', 'qc-calibration-master-list', 'qc-coa-label',
      'qc-coa-sleeve', 'qc-coa-corrugated', 'qc-obsolete-artwork', 'qc-printing-aids-destruction',
      'qc-camera-challenge-test', 'qc-tolerance-card-nivea', 'qc-analysis-report', 'qc-utility-test-report',
      'qc-minutes-of-meetings', 'soc-labels', 'soc-flexible-packaging'
    ) THEN 'QC'
    WHEN document_id IN (
      'gap-inspection'
    ) THEN 'QA'
    WHEN document_id IN (
      'prd-process-parameter', 'prd-alc-production'
    ) THEN 'PRD'
    WHEN document_id IN (
      'mnt-equipment-list', 'mnt-pm-record', 'mnt-yearly-pm-schedule', 'mnt-daily-health', 'mnt-breakdown-memo',
      'mnt-breakdown-clearance', 'mnt-breakdown-record', 'mnt-temporary-engineering', 'mnt-new-equipment',
      'mnt-glass-breakage', 'mnt-wooden-articles', 'mnt-lux-level'
    ) THEN 'MNT'
    WHEN document_id IN (
      'daily-pest-monitoring', 'fly-catcher', 'service-report-rodent', 'service-report-general',
      'service-report-fly', 'pest-responsibilities', 'training-record', 'chemical-master',
      'gurudev-insecticide-licence', 'hr-competence', 'hr-skill-matrix', 'hr-pre-employment-health',
      'hr-induction-staff', 'hr-induction-operators', 'hr-job-responsibility', 'hr-training-needs',
      'hr-training-calendar', 'hr-training-effectiveness', 'hr-training-feedback', 'hr-mobile-authorization',
      'hr-visitor-health', 'hr-gmp-checklist', 'hr-psc-survey', 'hr-psc-survey-analysis', 'hr-hygiene-report'
    ) THEN 'HR'
    WHEN document_id IN (
      'disp-safe-transporter-agreement', 'disp-container-stuffing'
    ) THEN 'DISP'
    -- Otherwise the department the format number names: F-QC-30, F/QC/37 and
    -- F/QC-09 all read as QC. A number that names none gives none.
    ELSE substring(upper(coalesce(format_number, '')) FROM '^F[-/](SYS|MKT|PUR|STR|QC|QA|PRD|MNT|HR|DISP)[-/]')
  END
$$;
COMMENT ON FUNCTION overview.department_of_document(text, text) IS
  'The code of the department that owns a document (QC, HR ...), by DCRS''s own rule: its fixed list first, then the department its format number names. Nothing when neither says.';

CREATE OR REPLACE FUNCTION overview.department_name(code text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE code
    WHEN 'SYS' THEN 'System / Management'
    WHEN 'MKT' THEN 'Marketing'
    WHEN 'PUR' THEN 'Purchase'
    WHEN 'STR' THEN 'Store'
    WHEN 'QC' THEN 'Quality Control'
    WHEN 'QA' THEN 'Quality Assurance'
    WHEN 'PRD' THEN 'Production'
    WHEN 'MNT' THEN 'Maintenance'
    WHEN 'HR' THEN 'Human Resources'
    WHEN 'DISP' THEN 'Dispatch'
    ELSE nullif(code, '')
  END
$$;
COMMENT ON FUNCTION overview.department_name(text) IS
  'A department''s full name from its code (HR gives Human Resources), as DCRS names it. An unknown code is shown as it is.';

-- WHAT KIND OF THING A LINE OF DCRS'S ACTIVITY LOG IS. The action words are
-- DCRS's own (frontend/src/engine/recordHistory.ts, utils/print.ts,
-- components/documents/DownloadDocumentButton.tsx, backend/index.ts).
CREATE OR REPLACE FUNCTION overview.activity_category(action text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN action LIKE 'Document downloaded as %' THEN 'Download'
    WHEN action = 'Document printed' THEN 'Print'
    WHEN action LIKE 'Document changes uploaded from %' THEN 'Upload'
    WHEN action IN (
      'Record started', 'Record edited', 'Record edited through Mitra', 'Record changed from an uploaded Word/Excel file',
      'Record prepared', 'Record submitted for verification', 'Record verified', 'Record sent back', 'Record resumed',
      'Record reopened for correction', 'Correction cancelled', 'Record deleted', 'CAPA raised from an insight'
    ) THEN 'Record change'
    WHEN action IN ('Signed in', 'Signed out', 'Sign-in failed', 'Sign-in refused') THEN 'Sign-in'
    WHEN action IN (
      'Sign-up refused', 'Account created', 'Account created by the administrator', 'Password reset by the administrator',
      'Account switched on', 'Account switched off', 'Department access changed', 'Password change refused',
      'Password changed'
    ) THEN 'Account'
    WHEN action IN ('Escalated to the super admin', 'Escalation acknowledged', 'Weekly digest prepared') THEN 'Escalation'
    ELSE 'Other'
  END
$$;
COMMENT ON FUNCTION overview.activity_category(text) IS
  'The kind of thing a line of DCRS''s activity log records: Download, Print, Upload, Record change, Sign-in, Account, Escalation or Other.';

-- WHICH OTHER SYSTEM MADE A CHANGE. When another server (the Audit Assistant)
-- acts through the DCRS API, DCRS starts the line's detail with
-- "Through <its name>" followed by ": ", " · " or nothing (backend/apiV1.ts).
CREATE OR REPLACE FUNCTION overview.through_client(detail text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT substring(detail FROM '^Through (.+?)(?:: | · |$)') $$;
COMMENT ON FUNCTION overview.through_client(text) IS
  'The other system a change came through (for example Audit Assistant), read from the start of an activity line''s detail; nothing when the person did it in DCRS itself.';

-- ============================================================ the views

-- ---------------------------------------------------------------- accounts
CREATE OR REPLACE VIEW overview.dcrs_accounts AS
SELECT
  u.id AS person_id,
  u.name AS name,
  u.email AS email,
  CASE WHEN u.role = 'admin' THEN 'Super admin' ELSE 'Staff' END AS role,
  CASE
    WHEN u.role = 'admin' OR cardinality(codes.list) = 0 THEN 'Every department'
    ELSE array_to_string(ARRAY(SELECT overview.department_name(c) FROM unnest(codes.list) WITH ORDINALITY AS x(c, n) ORDER BY n), ', ')
  END AS departments,
  CASE
    WHEN u.role = 'admin' OR cardinality(codes.list) = 0 THEN NULL
    ELSE array_to_string(codes.list, ', ')
  END AS department_codes,
  CASE WHEN u.active THEN 'Active' ELSE 'Switched off' END AS account_status,
  u.must_change_password AS must_change_password,
  overview.factory_time(overview.moment_from_text(u.created_at)) AS created_factory_time,
  overview.utc_time(overview.moment_from_text(u.created_at)) AS created_utc,
  overview.factory_time(overview.moment_from_text(u.last_sign_in)) AS last_sign_in_factory_time,
  overview.utc_time(overview.moment_from_text(u.last_sign_in)) AS last_sign_in_utc
FROM public.users u
CROSS JOIN LATERAL (
  SELECT ARRAY(
    SELECT upper(btrim(c)) FROM unnest(string_to_array(u.departments, ',')) WITH ORDINALITY AS p(c, n)
    WHERE btrim(c) <> '' ORDER BY n
  ) AS list
) codes
ORDER BY u.name, u.email;

COMMENT ON VIEW overview.dcrs_accounts IS
  'One row per DCRS sign-in account: who it is, what it may see, whether it is switched on, and when it last signed in. Never the password.';
COMMENT ON COLUMN overview.dcrs_accounts.person_id IS 'The account''s id in DCRS. It never changes. The Audit Assistant keeps it as the person''s external id.';
COMMENT ON COLUMN overview.dcrs_accounts.name IS 'The person''s name, as DCRS shows it and writes it in records.';
COMMENT ON COLUMN overview.dcrs_accounts.email IS 'The email address the person signs in with.';
COMMENT ON COLUMN overview.dcrs_accounts.role IS 'Super admin (sees and manages everything) or Staff.';
COMMENT ON COLUMN overview.dcrs_accounts.departments IS 'The departments whose documents the account may see, by full name, or Every department.';
COMMENT ON COLUMN overview.dcrs_accounts.department_codes IS 'The same departments by their short codes (for example HR, QC). Empty when the account sees every department.';
COMMENT ON COLUMN overview.dcrs_accounts.account_status IS 'Active, or Switched off (the account cannot sign in).';
COMMENT ON COLUMN overview.dcrs_accounts.must_change_password IS 'True while the account still has a password the administrator set, which the person must change at the next sign-in.';
COMMENT ON COLUMN overview.dcrs_accounts.created_factory_time IS 'When the account was made, in factory time.';
COMMENT ON COLUMN overview.dcrs_accounts.created_utc IS 'When the account was made, in UTC.';
COMMENT ON COLUMN overview.dcrs_accounts.last_sign_in_factory_time IS 'When the person last signed in to DCRS, in factory time. Empty if never.';
COMMENT ON COLUMN overview.dcrs_accounts.last_sign_in_utc IS 'When the person last signed in to DCRS, in UTC. Empty if never.';

-- ---------------------------------------------------------------- records
-- Every record of the plant is one line of one JSON list, the stored item
-- (company, records). It is read once per query (MATERIALIZED).
CREATE OR REPLACE VIEW overview.records AS
WITH stored AS MATERIALIZED (
  SELECT s.value::jsonb AS list FROM public.app_storage s WHERE s.scope = 'company' AND s.key = 'records'
),
stored_documents AS MATERIALIZED (
  SELECT s.value::jsonb AS list FROM public.app_storage s WHERE s.scope = 'company' AND s.key = 'documents'
),
documents AS (
  -- As DCRS reads them (backend/index.ts documentFormatNos): the last definition of an id wins.
  SELECT DISTINCT ON (d.definition->>'id')
    d.definition->>'id' AS document_id,
    CASE WHEN jsonb_typeof(d.definition->'formatNo') = 'string' THEN d.definition->>'formatNo' END AS format_number,
    d.definition->>'name' AS document_name
  FROM stored_documents
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(stored_documents.list) = 'array' THEN stored_documents.list ELSE '[]'::jsonb END)
    WITH ORDINALITY AS d(definition, place)
  WHERE jsonb_typeof(d.definition->'id') = 'string'
  ORDER BY d.definition->>'id', d.place DESC
),
live AS (
  SELECT r.rec
  FROM stored
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(stored.list) = 'array' THEN stored.list ELSE '[]'::jsonb END) AS r(rec)
  WHERE r.rec->'isDemo' = 'false'::jsonb
)
SELECT
  live.rec->>'id' AS record_id,
  live.rec->>'documentId' AS document_id,
  doc.format_number AS format_number,
  coalesce(doc.document_name, live.rec->>'documentId') AS document_name,
  dep.code AS department_code,
  overview.department_name(dep.code) AS department_name,
  overview.date_from_text(live.rec->>'dueDate') AS record_date,
  live.rec->>'status' AS status,
  nullif(live.rec->>'submittedBy', '') AS submitted_by,
  overview.factory_time(overview.moment_from_text(live.rec->>'submittedAt')) AS submitted_factory_time,
  overview.utc_time(overview.moment_from_text(live.rec->>'submittedAt')) AS submitted_utc,
  nullif(live.rec->>'verifiedBy', '') AS verified_by,
  overview.factory_time(overview.moment_from_text(live.rec->>'verifiedAt')) AS verified_factory_time,
  overview.utc_time(overview.moment_from_text(live.rec->>'verifiedAt')) AS verified_utc,
  nullif(live.rec->>'rejectedBy', '') AS sent_back_by,
  overview.factory_time(overview.moment_from_text(live.rec->>'rejectedAt')) AS sent_back_factory_time,
  overview.utc_time(overview.moment_from_text(live.rec->>'rejectedAt')) AS sent_back_utc,
  nullif(live.rec->>'rejectionReason', '') AS sent_back_reason,
  overview.factory_time(overview.moment_from_text(live.rec->>'createdAt')) AS created_factory_time,
  overview.utc_time(overview.moment_from_text(live.rec->>'createdAt')) AS created_utc,
  overview.factory_time(overview.moment_from_text(live.rec->>'updatedAt')) AS last_changed_factory_time,
  overview.utc_time(overview.moment_from_text(live.rec->>'updatedAt')) AS last_changed_utc,
  CASE WHEN jsonb_typeof(live.rec->'history') = 'array' THEN nullif(live.rec->'history'->-1->>'by', '') END AS last_changed_by,
  CASE WHEN jsonb_typeof(live.rec->'history') = 'array' THEN jsonb_array_length(live.rec->'history') ELSE 0 END AS history_entries
FROM live
LEFT JOIN documents doc ON doc.document_id = live.rec->>'documentId'
CROSS JOIN LATERAL (SELECT overview.department_of_document(live.rec->>'documentId', doc.format_number) AS code) dep
ORDER BY record_date DESC NULLS LAST, document_name, record_id;

COMMENT ON VIEW overview.records IS
  'One row per DCRS record, that is one filled-in (or still blank) copy of a form for one date. Live records only, never the demonstration data.';
COMMENT ON COLUMN overview.records.record_id IS 'The record''s id in DCRS. It never changes. The record opens in DCRS at #/record/<this id>.';
COMMENT ON COLUMN overview.records.document_id IS 'Which form this is a copy of, by its id in DCRS (for example daily-pest-monitoring).';
COMMENT ON COLUMN overview.records.format_number IS 'The form''s format number as printed on the paper (for example F/HR/17). TO BE CONFIRMED when the plant has not given one yet.';
COMMENT ON COLUMN overview.records.document_name IS 'The form''s name (for example Daily Pest Control Monitoring Record).';
COMMENT ON COLUMN overview.records.department_code IS 'The short code of the department that owns the form (for example HR).';
COMMENT ON COLUMN overview.records.department_name IS 'The full name of the department that owns the form (for example Human Resources).';
COMMENT ON COLUMN overview.records.record_date IS 'The date the record is for (its due date).';
COMMENT ON COLUMN overview.records.status IS 'Where the record stands, in DCRS''s own words: Scheduled, Due, In Progress, Submitted, Pending Verification, Verified or Rejected (sent back).';
COMMENT ON COLUMN overview.records.submitted_by IS 'Who submitted the record for verification.';
COMMENT ON COLUMN overview.records.submitted_factory_time IS 'When it was submitted, in factory time.';
COMMENT ON COLUMN overview.records.submitted_utc IS 'When it was submitted, in UTC.';
COMMENT ON COLUMN overview.records.verified_by IS 'Who verified (approved) the record.';
COMMENT ON COLUMN overview.records.verified_factory_time IS 'When it was verified, in factory time.';
COMMENT ON COLUMN overview.records.verified_utc IS 'When it was verified, in UTC.';
COMMENT ON COLUMN overview.records.sent_back_by IS 'Who last sent the record back for changes.';
COMMENT ON COLUMN overview.records.sent_back_factory_time IS 'When it was last sent back, in factory time.';
COMMENT ON COLUMN overview.records.sent_back_utc IS 'When it was last sent back, in UTC.';
COMMENT ON COLUMN overview.records.sent_back_reason IS 'Why it was last sent back, in the words of the person who sent it back.';
COMMENT ON COLUMN overview.records.created_factory_time IS 'When the record was made, in factory time.';
COMMENT ON COLUMN overview.records.created_utc IS 'When the record was made, in UTC.';
COMMENT ON COLUMN overview.records.last_changed_factory_time IS 'When the record last changed in any way, in factory time.';
COMMENT ON COLUMN overview.records.last_changed_utc IS 'When the record last changed in any way, in UTC.';
COMMENT ON COLUMN overview.records.last_changed_by IS 'Who made the latest change written in the record''s history. Empty when its history is empty.';
COMMENT ON COLUMN overview.records.history_entries IS 'How many entries the record''s history holds: every edit, submission, verification, sending back and correction.';

-- ---------------------------------------------------------------- findings
-- The internal CAPA findings: data.findings[] of the live records of the
-- document gap-inspection. The readable finding id follows the one rule that
-- backend/findingsCore.ts also follows (REQUIREMENTS §83, contract C2);
-- database/tests/sharedDatabase.test.ts checks that the two give the same id to every
-- finding.
CREATE OR REPLACE VIEW overview.findings AS
WITH stored AS MATERIALIZED (
  SELECT s.value::jsonb AS list FROM public.app_storage s WHERE s.scope = 'company' AND s.key = 'records'
),
reports AS (
  SELECT
    r.rec,
    r.place,
    CASE WHEN jsonb_typeof(r.rec->'dueDate') = 'string' THEN r.rec->>'dueDate' ELSE '' END AS report_day,
    CASE WHEN jsonb_typeof(r.rec->'createdAt') = 'string' THEN r.rec->>'createdAt' ELSE '' END AS made
  FROM stored
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(stored.list) = 'array' THEN stored.list ELSE '[]'::jsonb END)
    WITH ORDINALITY AS r(rec, place)
  WHERE r.rec->'documentId' = '"gap-inspection"'::jsonb AND r.rec->'isDemo' = 'false'::jsonb
),
day_tagged AS (
  -- Reports of one date in the order they were made; the first keeps the plain
  -- date, the next ones get b, c ... z, then -27, -28 ...
  SELECT
    reports.*,
    row_number() OVER (PARTITION BY report_day ORDER BY made COLLATE "C", rec->>'id' COLLATE "C", place) AS nth
  FROM reports
),
lines AS (
  SELECT
    t.rec,
    t.place,
    t.report_day,
    CASE
      WHEN t.nth = 1 THEN t.report_day
      WHEN t.nth <= 26 THEN t.report_day || chr(96 + t.nth::int)
      ELSE t.report_day || '-' || t.nth
    END AS day_tag,
    f.finding,
    f.position - 1 AS position,
    CASE
      WHEN jsonb_typeof(f.finding->'sNo') = 'number'
       AND (f.finding->>'sNo')::numeric > 0
       AND (f.finding->>'sNo')::numeric <= 9007199254740991
       AND (f.finding->>'sNo')::numeric = trunc((f.finding->>'sNo')::numeric)
      THEN trunc((f.finding->>'sNo')::numeric)::bigint
      ELSE f.position
    END AS number
  FROM day_tagged t
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(t.rec->'data'->'findings') = 'array' THEN t.rec->'data'->'findings' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS f(finding, position)
  WHERE jsonb_typeof(f.finding) = 'object'
),
named AS (
  SELECT
    lines.*,
    'CAPA-' || day_tag || '-' || number AS base,
    row_number() OVER (PARTITION BY place, 'CAPA-' || day_tag || '-' || number ORDER BY position) AS k,
    CASE
      WHEN finding->'status' IN ('"Closed"'::jsonb, '"Verified"'::jsonb) THEN finding->>'status'
      WHEN jsonb_typeof(finding->'targetDate') = 'string'
       AND finding->>'targetDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       AND (finding->>'targetDate') COLLATE "C" < to_char(overview.factory_today(), 'YYYY-MM-DD') COLLATE "C"
       AND (finding->'actualDateOfAction' IS NULL OR finding->'actualDateOfAction' IN ('null'::jsonb, '""'::jsonb))
      THEN 'Overdue'
      ELSE 'Open'
    END AS shown_status
  FROM lines
)
SELECT
  CASE WHEN k = 1 THEN base ELSE base || '.' || k END AS finding_id,
  CASE WHEN jsonb_typeof(finding->'id') = 'string' AND finding->>'id' <> '' THEN (rec->>'id') || ':' || (finding->>'id') END AS finding_reference,
  rec->>'id' AS record_id,
  number AS finding_number,
  overview.date_from_text(rec->>'dueDate') AS report_date,
  overview.date_from_text(rec->'data'->>'inspectionDate') AS inspection_date,
  nullif(finding->>'findingOfInspection', '') AS finding,
  nullif(finding->>'commentsOnFindings', '') AS comments,
  nullif(finding->>'correctiveActionContractor', '') AS corrective_action_by_contractor,
  nullif(finding->>'correctiveActionClient', '') AS corrective_action_by_plant,
  overview.date_from_text(finding->>'targetDate') AS target_date,
  overview.date_from_text(finding->>'actualDateOfAction') AS action_date,
  nullif(finding->>'verifiedByServiceProvider', '') AS verified_by_service_provider,
  shown_status AS status,
  finding->>'status' AS stored_status,
  CASE WHEN shown_status = 'Overdue' THEN overview.factory_today() - overview.date_from_text(finding->>'targetDate') END AS days_overdue,
  finding->>'source' AS source,
  rec->>'status' AS report_status,
  nullif(rec->>'verifiedBy', '') AS report_verified_by,
  overview.factory_time(overview.moment_from_text(rec->>'updatedAt')) AS last_changed_factory_time,
  overview.utc_time(overview.moment_from_text(rec->>'updatedAt')) AS last_changed_utc
FROM named
ORDER BY report_day, place, position;

COMMENT ON VIEW overview.findings IS
  'One row per internal CAPA finding (the Pest Control Inspection Findings Report). The status is the one people see in DCRS: Overdue is worked out from the target date, today.';
COMMENT ON COLUMN overview.findings.finding_id IS 'The finding''s readable id, for example CAPA-2023-12-13-1: the report''s date (with b, c ... when a date has more than one report), then the finding''s number. The same id the DCRS API and the Audit Assistant use. It can change if a report is added earlier on the same date; finding_reference never does.';
COMMENT ON COLUMN overview.findings.finding_reference IS 'The finding''s permanent reference, <record id>:<finding''s own id>. It never changes. The DCRS API accepts it wherever it accepts the readable id.';
COMMENT ON COLUMN overview.findings.record_id IS 'The report (record) the finding is written in. It opens in DCRS at #/gap/<this id>.';
COMMENT ON COLUMN overview.findings.finding_number IS 'The finding''s S.No on the report (its place in the list when no S.No is given).';
COMMENT ON COLUMN overview.findings.report_date IS 'The date of the report the finding is on.';
COMMENT ON COLUMN overview.findings.inspection_date IS 'The date of the inspection, as written on the report.';
COMMENT ON COLUMN overview.findings.finding IS 'What was found, in the inspector''s words.';
COMMENT ON COLUMN overview.findings.comments IS 'Comments on the finding.';
COMMENT ON COLUMN overview.findings.corrective_action_by_contractor IS 'The corrective action the pest control contractor takes.';
COMMENT ON COLUMN overview.findings.corrective_action_by_plant IS 'The corrective action the plant itself takes.';
COMMENT ON COLUMN overview.findings.target_date IS 'The date by which the finding should be dealt with.';
COMMENT ON COLUMN overview.findings.action_date IS 'The date the action was actually taken (DCRS''s Close button fills it in).';
COMMENT ON COLUMN overview.findings.verified_by_service_provider IS 'Who from the service provider verified the action.';
COMMENT ON COLUMN overview.findings.status IS 'Open, Overdue (past its target date with no action date), Closed or Verified: what DCRS shows today.';
COMMENT ON COLUMN overview.findings.stored_status IS 'The status as it was last saved in the record. It can say Open when the finding has since become overdue; the column status is the one to read.';
COMMENT ON COLUMN overview.findings.days_overdue IS 'How many days past its target date an overdue finding is. Empty unless the status is Overdue.';
COMMENT ON COLUMN overview.findings.source IS 'Internal (the plant''s own inspection) or External (an outside audit, customer or regulator).';
COMMENT ON COLUMN overview.findings.report_status IS 'The status of the report the finding is on (In Progress, Pending Verification, Verified ...). A finding cannot be closed on a Verified or sent-back report until the report is reopened or resumed in DCRS.';
COMMENT ON COLUMN overview.findings.report_verified_by IS 'Who verified the report, once it is verified.';
COMMENT ON COLUMN overview.findings.last_changed_factory_time IS 'When the report last changed, in factory time.';
COMMENT ON COLUMN overview.findings.last_changed_utc IS 'When the report last changed, in UTC.';

-- ---------------------------------------------------------------- complaints
CREATE OR REPLACE VIEW overview.customer_complaints AS
WITH stored AS MATERIALIZED (
  SELECT s.value::jsonb AS list FROM public.app_storage s WHERE s.scope = 'company' AND s.key = 'records'
),
complaints AS (
  SELECT r.rec, r.rec->'data' AS d
  FROM stored
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(stored.list) = 'array' THEN stored.list ELSE '[]'::jsonb END) AS r(rec)
  WHERE r.rec->'documentId' = '"capa-customer-complaint"'::jsonb AND r.rec->'isDemo' = 'false'::jsonb
)
SELECT
  c.rec->>'id' AS record_id,
  nullif(c.d->>'complaintNo', '') AS complaint_number,
  nullif(c.d->>'customerName', '') AS customer_name,
  nullif(c.d->>'jobName', '') AS job_name,
  nullif(c.d->>'jobCode', '') AS job_code,
  overview.date_from_text(c.d->>'complaintReceivedDate') AS complaint_received_date,
  activities.answered AS activities_answered,
  activities.total AS activities_total,
  CASE
    WHEN c.rec->>'status' = 'Verified' THEN 'Closed'
    WHEN c.rec->>'status' IN ('Submitted', 'Pending Verification') THEN 'Awaiting approval'
    ELSE 'Open'
  END AS status,
  c.rec->>'status' AS record_status,
  nullif(c.d->'preparedBy'->>'name', '') AS prepared_by,
  nullif(c.d->'approvedBy'->>'name', '') AS approved_by,
  overview.date_from_text(c.d->'approvedBy'->>'date') AS approved_date,
  overview.factory_time(overview.moment_from_text(c.rec->>'updatedAt')) AS last_changed_factory_time,
  overview.utc_time(overview.moment_from_text(c.rec->>'updatedAt')) AS last_changed_utc
FROM complaints c
CROSS JOIN LATERAL (
  -- An activity counts as answered when it is ticked done, marked not
  -- required, or has a comment (engine/guidedChecklist.ts isItemAnswered).
  SELECT
    count(*) FILTER (
      WHERE item->'done' = 'true'::jsonb OR item->'notRequired' = 'true'::jsonb
         OR coalesce(item->>'comment', '') ~ '[^[:space:]]'
    )::int AS answered,
    count(*)::int AS total
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.d->'sections') = 'array' THEN c.d->'sections' ELSE '[]'::jsonb END) AS s(section)
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.section->'items') = 'array' THEN s.section->'items' ELSE '[]'::jsonb END) AS i(item)
) activities
ORDER BY complaint_received_date DESC NULLS LAST, complaint_number, record_id;

COMMENT ON VIEW overview.customer_complaints IS
  'One row per customer complaint handled on the Customer Complaint Handling Checklist (F/MKT/05, CAPA External): how far its 31 activities are answered and whether it is closed.';
COMMENT ON COLUMN overview.customer_complaints.record_id IS 'The checklist''s record id in DCRS. It opens at #/gap/complaint/<this id>.';
COMMENT ON COLUMN overview.customer_complaints.complaint_number IS 'The complaint number (for example 26-27/001).';
COMMENT ON COLUMN overview.customer_complaints.customer_name IS 'The customer who complained.';
COMMENT ON COLUMN overview.customer_complaints.job_name IS 'The job the complaint is about.';
COMMENT ON COLUMN overview.customer_complaints.job_code IS 'The job''s code.';
COMMENT ON COLUMN overview.customer_complaints.complaint_received_date IS 'The date the complaint was received.';
COMMENT ON COLUMN overview.customer_complaints.activities_answered IS 'How many of the checklist''s activities are answered (done, not required, or commented on).';
COMMENT ON COLUMN overview.customer_complaints.activities_total IS 'How many activities the checklist has.';
COMMENT ON COLUMN overview.customer_complaints.status IS 'Open, Awaiting approval (submitted, waiting for the QA Head) or Closed (approved).';
COMMENT ON COLUMN overview.customer_complaints.record_status IS 'The checklist record''s own status in DCRS''s words.';
COMMENT ON COLUMN overview.customer_complaints.prepared_by IS 'Who prepared the checklist.';
COMMENT ON COLUMN overview.customer_complaints.approved_by IS 'Who approved the closing of the complaint.';
COMMENT ON COLUMN overview.customer_complaints.approved_date IS 'The date it was approved.';
COMMENT ON COLUMN overview.customer_complaints.last_changed_factory_time IS 'When the checklist last changed, in factory time.';
COMMENT ON COLUMN overview.customer_complaints.last_changed_utc IS 'When the checklist last changed, in UTC.';

-- ---------------------------------------------------------------- pest control
-- F/HR/17, the Daily Pest Control Monitoring Record: one record per day by
-- DCRS's convention. Should a day ever hold two, the one changed last is shown.
CREATE OR REPLACE VIEW overview.pest_control_reports_by_day AS
WITH stored AS MATERIALIZED (
  SELECT s.value::jsonb AS list FROM public.app_storage s WHERE s.scope = 'company' AND s.key = 'records'
),
reports AS (
  SELECT DISTINCT ON (day) day, rec
  FROM (
    SELECT overview.date_from_text(r.rec->>'dueDate') AS day, r.rec, r.place
    FROM stored
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(stored.list) = 'array' THEN stored.list ELSE '[]'::jsonb END)
      WITH ORDINALITY AS r(rec, place)
    WHERE r.rec->'documentId' = '"daily-pest-monitoring"'::jsonb AND r.rec->'isDemo' = 'false'::jsonb
  ) found
  WHERE day IS NOT NULL
  ORDER BY day, (rec->>'updatedAt') COLLATE "C" DESC NULLS LAST, place DESC
),
days AS (
  SELECT d::date AS day
  FROM generate_series((SELECT min(day) FROM reports)::timestamp, overview.factory_today()::timestamp, interval '1 day') AS g(d)
)
SELECT
  days.day AS report_date,
  to_char(days.day, 'FMDay') AS weekday,
  reports.rec->>'id' AS record_id,
  CASE WHEN reports.rec IS NULL THEN 'Not started' ELSE reports.rec->>'status' END AS status,
  CASE WHEN reports.rec IS NOT NULL THEN coalesce(reports.rec->'data'->'isHoliday' = 'true'::jsonb, false) END AS holiday,
  nullif(reports.rec->'data'->>'checker', '') AS checked_by,
  nullif(reports.rec->'data'->>'timeOfChecking', '') AS time_of_checking,
  CASE WHEN reports.rec IS NOT NULL THEN (
    SELECT count(*)::int
    FROM jsonb_each(CASE WHEN jsonb_typeof(reports.rec->'data'->'checkpoints') = 'object' THEN reports.rec->'data'->'checkpoints' ELSE '{}'::jsonb END) AS c(point, answer)
    WHERE jsonb_typeof(c.answer) = 'object' AND c.answer->'value' IS NOT NULL
      AND c.answer->'value' NOT IN ('null'::jsonb, '""'::jsonb)
  ) END AS checkpoints_answered,
  CASE WHEN reports.rec IS NOT NULL THEN (
    SELECT coalesce(sum((k.catch->>'count')::numeric), 0)::int
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(reports.rec->'data'->'rodentCatches') = 'array' THEN reports.rec->'data'->'rodentCatches' ELSE '[]'::jsonb END) AS k(catch)
    WHERE jsonb_typeof(k.catch->'count') = 'number'
  ) END AS rodents_caught,
  CASE WHEN reports.rec IS NOT NULL THEN (
    CASE WHEN jsonb_typeof(reports.rec->'data'->'summaryActions') = 'array' THEN jsonb_array_length(reports.rec->'data'->'summaryActions') ELSE 0 END
  ) END AS observations,
  (
    SELECT nullif(string_agg(
      concat_ws('. ',
        nullif(concat_ws(': ', nullif(btrim(o.item->>'dateOfObservation'), ''), nullif(rtrim(btrim(o.item->>'descriptionOfObservation'), '. '), '')), ''),
        'Action taken: ' || nullif(rtrim(btrim(o.item->>'actionTaken'), '. '), ''),
        'Remarks: ' || nullif(rtrim(btrim(o.item->>'remarks'), '. '), '')
      ), ' | ' ORDER BY o.n), '')
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(reports.rec->'data'->'summaryActions') = 'array' THEN reports.rec->'data'->'summaryActions' ELSE '[]'::jsonb END)
      WITH ORDINALITY AS o(item, n)
  ) AS observation_details,
  nullif(reports.rec->>'submittedBy', '') AS submitted_by,
  overview.factory_time(overview.moment_from_text(reports.rec->>'submittedAt')) AS submitted_factory_time,
  nullif(reports.rec->>'verifiedBy', '') AS verified_by,
  overview.factory_time(overview.moment_from_text(reports.rec->>'verifiedAt')) AS verified_factory_time
FROM days
LEFT JOIN reports ON reports.day = days.day
ORDER BY days.day DESC;

COMMENT ON VIEW overview.pest_control_reports_by_day IS
  'One row per calendar day of the Daily Pest Control Monitoring Record (F/HR/17), from the first day DCRS holds to today, including the days with no record at all (status Not started).';
COMMENT ON COLUMN overview.pest_control_reports_by_day.report_date IS 'The day.';
COMMENT ON COLUMN overview.pest_control_reports_by_day.weekday IS 'The day of the week (Thursday is the factory''s weekly day off).';
COMMENT ON COLUMN overview.pest_control_reports_by_day.record_id IS 'That day''s F/HR/17 record in DCRS. Empty when there is none. It opens at #/record/<this id>.';
COMMENT ON COLUMN overview.pest_control_reports_by_day.status IS 'Not started when DCRS holds no record for the day; otherwise the record''s status (Due, In Progress, Pending Verification, Verified ...).';
COMMENT ON COLUMN overview.pest_control_reports_by_day.holiday IS 'True when the record is marked as a holiday (no checking that day). Empty when there is no record.';
COMMENT ON COLUMN overview.pest_control_reports_by_day.checked_by IS 'Who did the checking.';
COMMENT ON COLUMN overview.pest_control_reports_by_day.time_of_checking IS 'The time of the checking, as written (hours:minutes).';
COMMENT ON COLUMN overview.pest_control_reports_by_day.checkpoints_answered IS 'How many of the ten checkpoints are answered.';
COMMENT ON COLUMN overview.pest_control_reports_by_day.rodents_caught IS 'How many rodents were found in the trap boxes that day.';
COMMENT ON COLUMN overview.pest_control_reports_by_day.observations IS 'How many observations are written in the summary of actions.';
COMMENT ON COLUMN overview.pest_control_reports_by_day.observation_details IS 'The observations: the date, what was seen, the action taken and remarks, one after another.';
COMMENT ON COLUMN overview.pest_control_reports_by_day.submitted_by IS 'Who submitted the day''s record for verification.';
COMMENT ON COLUMN overview.pest_control_reports_by_day.submitted_factory_time IS 'When it was submitted, in factory time.';
COMMENT ON COLUMN overview.pest_control_reports_by_day.verified_by IS 'Who verified the day''s record.';
COMMENT ON COLUMN overview.pest_control_reports_by_day.verified_factory_time IS 'When it was verified, in factory time.';

-- ---------------------------------------------------------------- activity
CREATE OR REPLACE VIEW overview.dcrs_activity AS
WITH lines AS (
  SELECT a.id, a.at, a.user_id, a.user_name, a.user_email, a.action, a.target, a.detail, a.department, a.ip, false AS archived
  FROM public.activity_log a
  UNION ALL
  SELECT b.id, b.at, b.user_id, b.user_name, b.user_email, b.action, b.target, b.detail, b.department, b.ip, true AS archived
  FROM public.activity_log_archive b
)
SELECT
  l.id AS activity_id,
  overview.factory_time(l.at) AS happened_factory_time,
  overview.utc_time(l.at) AS happened_utc,
  overview.factory_time(l.at)::date AS happened_date,
  l.user_id AS person_id,
  nullif(l.user_name, '') AS person_name,
  nullif(l.user_email, '') AS person_email,
  l.action AS action,
  overview.activity_category(l.action) AS category,
  nullif(l.target, '') AS on_what,
  nullif(l.detail, '') AS detail,
  nullif(l.department, '') AS department_code,
  overview.department_name(nullif(l.department, '')) AS department_name,
  nullif(l.ip, '') AS ip_address,
  overview.through_client(l.detail) AS through_client,
  l.archived AS archived
FROM lines l
ORDER BY l.at DESC, l.id DESC;

COMMENT ON VIEW overview.dcrs_activity IS
  'One row per line of DCRS''s activity log, the archived lines included: who did what, on what, when and from which address. The log can never be changed or deleted.';
COMMENT ON COLUMN overview.dcrs_activity.activity_id IS 'The line''s number in the activity log.';
COMMENT ON COLUMN overview.dcrs_activity.happened_factory_time IS 'When it happened, in factory time.';
COMMENT ON COLUMN overview.dcrs_activity.happened_utc IS 'When it happened, in UTC.';
COMMENT ON COLUMN overview.dcrs_activity.happened_date IS 'The day it happened, at the factory.';
COMMENT ON COLUMN overview.dcrs_activity.person_id IS 'The DCRS account that did it. Empty for DCRS''s own scheduled jobs (shown as System).';
COMMENT ON COLUMN overview.dcrs_activity.person_name IS 'The name of the person who did it, as it was then.';
COMMENT ON COLUMN overview.dcrs_activity.person_email IS 'The email of the person who did it, as it was then.';
COMMENT ON COLUMN overview.dcrs_activity.action IS 'What was done, in DCRS''s own words (for example Record edited, Document printed, Signed in).';
COMMENT ON COLUMN overview.dcrs_activity.category IS 'The kind of action: Download, Print, Upload, Record change, Sign-in, Account, Escalation or Other.';
COMMENT ON COLUMN overview.dcrs_activity.on_what IS 'What it was done on: usually the form''s number, name and date.';
COMMENT ON COLUMN overview.dcrs_activity.detail IS 'More about it: the note, the fields changed, the file name and so on.';
COMMENT ON COLUMN overview.dcrs_activity.department_code IS 'The short code of the department the line is filed under.';
COMMENT ON COLUMN overview.dcrs_activity.department_name IS 'The full name of the department the line is filed under.';
COMMENT ON COLUMN overview.dcrs_activity.ip_address IS 'The network address the request came from.';
COMMENT ON COLUMN overview.dcrs_activity.through_client IS 'The other system the person acted through (for example Audit Assistant). Empty when the person did it in DCRS itself.';
COMMENT ON COLUMN overview.dcrs_activity.archived IS 'True for a line the super admin has moved to the archive of old lines.';

-- ---------------------------------------------------------------- downloads
CREATE OR REPLACE VIEW overview.dcrs_downloads AS
SELECT
  a.activity_id AS activity_id,
  a.happened_factory_time AS happened_factory_time,
  a.happened_utc AS happened_utc,
  a.happened_date AS happened_date,
  a.person_name AS person_name,
  a.person_email AS person_email,
  CASE a.action
    WHEN 'Document downloaded as Excel' THEN 'Downloaded as Excel'
    WHEN 'Document downloaded as Word' THEN 'Downloaded as Word'
    WHEN 'Document downloaded as PDF' THEN 'Downloaded as PDF'
    WHEN 'Document printed' THEN 'Printed'
    WHEN 'Document changes uploaded from Word' THEN 'Uploaded changes from Word'
    WHEN 'Document changes uploaded from Excel' THEN 'Uploaded changes from Excel'
  END AS what_happened,
  a.on_what AS document,
  a.detail AS detail,
  a.department_name AS department_name,
  a.ip_address AS ip_address,
  a.through_client AS through_client
FROM overview.dcrs_activity a
WHERE a.action IN (
  'Document downloaded as Excel', 'Document downloaded as Word', 'Document downloaded as PDF', 'Document printed',
  'Document changes uploaded from Word', 'Document changes uploaded from Excel'
)
ORDER BY a.happened_utc DESC, a.activity_id DESC;

COMMENT ON VIEW overview.dcrs_downloads IS
  'Every time a document left DCRS or came back into it: downloaded as Excel, Word or PDF, printed, or changes uploaded from a Word or Excel file. Who, what, when and from which address.';
COMMENT ON COLUMN overview.dcrs_downloads.activity_id IS 'The line''s number in DCRS''s activity log.';
COMMENT ON COLUMN overview.dcrs_downloads.happened_factory_time IS 'When it happened, in factory time.';
COMMENT ON COLUMN overview.dcrs_downloads.happened_utc IS 'When it happened, in UTC.';
COMMENT ON COLUMN overview.dcrs_downloads.happened_date IS 'The day it happened, at the factory.';
COMMENT ON COLUMN overview.dcrs_downloads.person_name IS 'Who did it.';
COMMENT ON COLUMN overview.dcrs_downloads.person_email IS 'The email of the person who did it.';
COMMENT ON COLUMN overview.dcrs_downloads.what_happened IS 'Downloaded as Excel, Downloaded as Word, Downloaded as PDF, Printed, Uploaded changes from Word or Uploaded changes from Excel.';
COMMENT ON COLUMN overview.dcrs_downloads.document IS 'Which document: its format number, name and, for a record, its date. For a print, the titles of the pages printed.';
COMMENT ON COLUMN overview.dcrs_downloads.detail IS 'More about it: the date of the record downloaded, the page printed, or how many changes came from which file.';
COMMENT ON COLUMN overview.dcrs_downloads.department_name IS 'The department that owns the document.';
COMMENT ON COLUMN overview.dcrs_downloads.ip_address IS 'The network address the request came from.';
COMMENT ON COLUMN overview.dcrs_downloads.through_client IS 'The other system it went through (for example Audit Assistant). Empty when it was done in DCRS itself.';

-- ============================================================ who owns and who reads
-- The views belong to the role that owns DCRS's table app_storage, so they read
-- DCRS's tables with that role's own rights: nothing on DCRS's tables is
-- granted. The helper functions belong to it too.
DO $$
DECLARE
  dcrs_owner name := (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_storage');
  v text;
  f regprocedure;
BEGIN
  FOREACH v IN ARRAY ARRAY['dcrs_accounts', 'records', 'findings', 'customer_complaints', 'pest_control_reports_by_day',
                           'dcrs_activity', 'dcrs_downloads'] LOOP
    EXECUTE format('ALTER VIEW overview.%I OWNER TO %I', v, dcrs_owner);
    EXECUTE format('REVOKE ALL ON overview.%I FROM PUBLIC', v);
    EXECUTE format('GRANT SELECT ON overview.%I TO overview_viewer', v);
  END LOOP;
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.pronamespace = 'overview'::regnamespace
      AND p.proname IN ('factory_time_zone', 'factory_today', 'factory_time', 'utc_time', 'moment_from_text', 'date_from_text',
                        'department_of_document', 'department_name', 'activity_category', 'through_client')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO %I', f, dcrs_owner);
    -- Only the two overview roles may call them (a view's functions run as the
    -- person reading the view).
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO overview_viewer, overview_owner', f);
  END LOOP;
END $$;
