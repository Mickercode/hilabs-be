-- Tests that schema.sql enforces the invariants in CLAUDE.md, on PostgreSQL.
--
-- These are not unit tests of application code. They check that the database itself refuses the
-- writes the research design cannot tolerate, so that a migration which quietly drops a trigger
-- or a CHECK fails here rather than during the pilot.
--
-- Run:  psql -v ON_ERROR_STOP=1 -f schema/schema.sql -f schema/test_schema.sql
-- A failure raises and, with ON_ERROR_STOP, exits non-zero.

\set QUIET on
SET client_min_messages = notice;

CREATE FUNCTION must_fail(stmt text, label text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAIL  % -- accepted, should have been refused', label;
  EXCEPTION
    WHEN sqlstate '23000' OR check_violation OR unique_violation
      OR foreign_key_violation OR not_null_violation THEN
      RAISE NOTICE 'pass  %', label;
  END;
END;
$fn$;

CREATE FUNCTION must_pass(stmt text, label text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  EXECUTE stmt;
  RAISE NOTICE 'pass  %', label;
END;
$fn$;

CREATE FUNCTION must_be(actual anyelement, expected anyelement, label text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL  % -- expected %, got %', label, expected, actual;
  END IF;
  RAISE NOTICE 'pass  %', label;
END;
$fn$;

-- ---------------------------------------------------------------- fixtures

INSERT INTO learner (id, goal, study_arm) VALUES
  ('11111111-1111-1111-1111-111111111111', 'why do fixes make things worse', 'full'),
  ('22222222-2222-2222-2222-222222222222', 'how do queues build', 'skip');

INSERT INTO task (id, kind, code, title, body, version) VALUES
  ('33333333-3333-3333-3333-333333333333', 'assessment', 'B', 'Baseline',
   'street trading ban', 'v1');

INSERT INTO resource (id, title, source, url, licence, concepts, format, phase_tag,
                      verified_by, verified_at, has_transcript) VALUES
  ('44444444-4444-4444-4444-444444444444', 'Loops and delays', 'OpenX',
   'https://example.org/a', 'CC BY 4.0', ARRAY['C2','C4'], 'text', 'either', 'ops', now(), TRUE);

INSERT INTO rater (id, role) VALUES
  ('55555555-5555-5555-5555-555555555555', 'rater'),
  ('66666666-6666-6666-6666-666666666666', 'gim_scorer');

INSERT INTO work_sample (id, learner_id, task_id, content, version, support_level) VALUES
  ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'my answer', 1, 'none');

-- ------------------------------------------- invariant 2: append-only observations

SELECT must_fail(
  $$UPDATE work_sample SET content = 'edited'
    WHERE id = '77777777-7777-7777-7777-777777777777'$$,
  'work_sample refuses UPDATE');

SELECT must_fail(
  $$DELETE FROM work_sample WHERE id = '77777777-7777-7777-7777-777777777777'$$,
  'work_sample refuses DELETE without an authorised erasure');

SELECT must_pass(
  $$INSERT INTO companion_event (id, learner_id, phase, type, content)
    VALUES ('88888888-8888-8888-8888-888888888888',
            '11111111-1111-1111-1111-111111111111', 'discovery', 'hint', 'what changes first?')$$,
  'a hint needs no cited resource');

SELECT must_fail(
  $$UPDATE companion_event SET content = 'x'
    WHERE id = '88888888-8888-8888-8888-888888888888'$$,
  'companion_event refuses UPDATE');

SELECT must_pass(
  $$INSERT INTO work_sample (learner_id, task_id, content, version, support_level)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333', 'draft two', 2, 'companion_hints')$$,
  'a revision is a new version row (R14)');

SELECT must_fail(
  $$INSERT INTO work_sample (learner_id, task_id, content, version, support_level)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333', 'dup', 1, 'none')$$,
  'a duplicate version is refused');

-- ------------------------------------------- invariant 7: explanations cite a resource

SELECT must_fail(
  $$INSERT INTO companion_event (learner_id, phase, type, content)
    VALUES ('11111111-1111-1111-1111-111111111111', 'tailored', 'explanation',
            'a delay means...')$$,
  'an explanation without a cited resource is refused');

SELECT must_pass(
  $$INSERT INTO companion_event (learner_id, phase, type, content, resource_id)
    VALUES ('11111111-1111-1111-1111-111111111111', 'tailored', 'explanation',
            'a delay means...', '44444444-4444-4444-4444-444444444444')$$,
  'an explanation with a citation is accepted');

-- ------------------------------------------- the convergence rule

SELECT must_fail(
  $$INSERT INTO gim_hypothesis (learner_id, gim_type, domain, scorer_id,
      signal_portfolio, signal_trajectory, signal_testimony, signal_selfreport,
      convergence, support_profile, model_version)
    VALUES ('11111111-1111-1111-1111-111111111111', 'creative', 'systems',
            '66666666-6666-6666-6666-666666666666', 5, 4, NULL, 4, 'strong', 'mixed', 'v1')$$,
  'a missing signal cannot be classified strong');

SELECT must_pass(
  $$INSERT INTO gim_hypothesis (id, learner_id, gim_type, domain, scorer_id,
      signal_portfolio, signal_trajectory, signal_testimony, signal_selfreport,
      convergence, support_profile, model_version)
    VALUES ('99999999-9999-9999-9999-999999999999',
            '11111111-1111-1111-1111-111111111111', 'creative', 'systems',
            '66666666-6666-6666-6666-666666666666', 5, 4, NULL, 4,
            'indeterminate', 'mixed', 'gim-interp-v1')$$,
  'a missing signal is allowed as indeterminate');

SELECT must_fail(
  $$UPDATE gim_hypothesis SET convergence = 'strong'
    WHERE id = '99999999-9999-9999-9999-999999999999'$$,
  'an interpretation is never overwritten');

SELECT must_pass(
  $$INSERT INTO gim_hypothesis (id, learner_id, gim_type, domain, scorer_id,
      signal_portfolio, signal_trajectory, signal_testimony, signal_selfreport,
      convergence, support_profile, model_version, supersedes_id)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111', 'creative', 'systems',
            '66666666-6666-6666-6666-666666666666', 4, 4, 4, 4,
            'strong', 'mixed', 'gim-interp-v1', '99999999-9999-9999-9999-999999999999')$$,
  'a revised view supersedes its predecessor');

SELECT must_fail(
  $$INSERT INTO gim_hypothesis (learner_id, gim_type, domain, scorer_id,
      signal_portfolio, signal_trajectory, signal_testimony, signal_selfreport,
      convergence, support_profile, model_version, supersedes_id)
    VALUES ('11111111-1111-1111-1111-111111111111', 'creative', 'systems',
            '66666666-6666-6666-6666-666666666666', 4, 4, 4, 4,
            'strong', 'mixed', 'v1', '99999999-9999-9999-9999-999999999999')$$,
  'a row can be superseded only once');

SELECT must_be(
  (SELECT count(*)::int FROM v_gim_hypothesis_current
   WHERE learner_id = '11111111-1111-1111-1111-111111111111'),
  1, 'the current view holds only the superseding row');

SELECT must_be(
  (SELECT count(*)::int FROM v_gim_hypothesis_missing_evidence),
  2, 'the missing-evidence view reports hypotheses with no evidence');

SELECT must_pass(
  $$INSERT INTO gim_evidence (hypothesis_id, signal, evidence_table, evidence_id, learner_id)
    VALUES ('99999999-9999-9999-9999-999999999999', 'portfolio', 'work_sample',
            '77777777-7777-7777-7777-777777777777',
            '11111111-1111-1111-1111-111111111111'),
           ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'portfolio', 'work_sample',
            '77777777-7777-7777-7777-777777777777',
            '11111111-1111-1111-1111-111111111111')$$,
  'evidence links to the hypothesis');

SELECT must_be(
  (SELECT count(*)::int FROM v_gim_hypothesis_missing_evidence),
  0, 'the missing-evidence view is empty once evidence is linked');

-- ------------------------------------------- the rubric: NS is not a score

INSERT INTO rating (id, work_sample_id, learner_id, rater_id, rubric_version, pass, blind)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111',
        '55555555-5555-5555-5555-555555555555', 'v1', 'independent', TRUE);

SELECT must_fail(
  $$INSERT INTO rating_score (rating_id, dimension, score, ns_code, learner_id)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 3, 'NS-blank',
            '11111111-1111-1111-1111-111111111111')$$,
  'a score and an NS code together are refused');

SELECT must_fail(
  $$INSERT INTO rating_score (rating_id, dimension, learner_id)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1,
            '11111111-1111-1111-1111-111111111111')$$,
  'neither a score nor an NS code is refused');

SELECT must_fail(
  $$INSERT INTO rating_score (rating_id, dimension, score, learner_id)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 5,
            '11111111-1111-1111-1111-111111111111')$$,
  'a score outside 1-4 is refused');

SELECT must_pass(
  $$INSERT INTO rating_score (rating_id, dimension, score, learner_id)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 3,
            '11111111-1111-1111-1111-111111111111');
    INSERT INTO rating_score (rating_id, dimension, ns_code, learner_id)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 4, 'NS-blank',
            '11111111-1111-1111-1111-111111111111')$$,
  'a score, or an NS code, one or the other');

SELECT must_be(
  (SELECT count(*)::int FROM information_schema.columns
   WHERE table_name = 'rating'
     AND column_name IN ('total','total_score','overall','di_total')),
  0, 'the rubric has no total column');

-- ------------------------------------------- R20: a core resource works without video

SELECT must_fail(
  $$INSERT INTO resource (title, source, url, licence, concepts, format, phase_tag,
                          verified_by, verified_at, is_core)
    VALUES ('Lecture', 'OpenY', 'https://example.org/v', 'CC BY 4.0', ARRAY['C1'],
            'video', 'tailored', 'ops', now(), TRUE)$$,
  'a core video with no audio or transcript is refused (R20)');

SELECT must_pass(
  $$INSERT INTO resource (title, source, url, licence, concepts, format, phase_tag,
                          verified_by, verified_at, is_core, has_transcript)
    VALUES ('Lecture', 'OpenY', 'https://example.org/v', 'CC BY 4.0', ARRAY['C1'],
            'video', 'tailored', 'ops', now(), TRUE, TRUE)$$,
  'a core video with a transcript is accepted (R20)');

-- ------------------------------------------- R15: a dispute cannot be edited afterwards

INSERT INTO dispute (id, learner_id, interpretation_id, text)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111',
        '99999999-9999-9999-9999-999999999999', 'that is not why I stopped');

SELECT must_fail(
  $$UPDATE dispute SET text = 'softened'
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  'a dispute is append-only');

SELECT must_pass(
  $$INSERT INTO dispute_response (dispute_id, learner_id, responder, resolution, text)
    VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',
            '11111111-1111-1111-1111-111111111111', 'team',
            'interpretation_superseded', 'fair point')$$,
  'a response is a separate append-only row');

-- ------------------------------------------- R18: blinding parity view

INSERT INTO work_sample (id, learner_id, task_id, content, version, support_level)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333', 'answer', 1, 'none');

INSERT INTO export_batch (id, operator, rng_seed, sample_count)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ops', 'seed-7', 2);

INSERT INTO export_item (batch_id, work_sample_id, learner_id, display_code, position,
                         redaction_marker_count) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '77777777-7777-7777-7777-777777777777',
   '11111111-1111-1111-1111-111111111111', 'L-4471', 1, 3),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222', 'L-8812', 2, 0);

SELECT must_be(
  (SELECT markers_per_item FROM v_export_marker_parity WHERE study_arm = 'full'),
  3.000::numeric, 'marker parity reports the full arm');

SELECT must_be(
  (SELECT markers_per_item FROM v_export_marker_parity WHERE study_arm = 'skip'),
  0.000::numeric, 'marker parity reports the skip arm -- a gap this stark is the point of it');

-- ------------------------------------------- every observation table is guarded

SELECT must_be(
  (SELECT count(*)::int
   FROM unnest(hilabs_observation_tables()) AS t(name)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
     WHERE c.relname = t.name AND g.tgname = t.name || '_no_update')
      OR NOT EXISTS (
     SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
     WHERE c.relname = t.name AND g.tgname = t.name || '_no_delete')),
  0, 'every observation table has both guards');

-- Any future table carrying learner_id must be either an observation table or a deliberate
-- exception. journey_step is a RECORD (ended_at is filled in later); erasure_request is the
-- audit row that outlives the learner; account is a RECORD (disabled_at is set on suspension).
SELECT must_be(
  (SELECT coalesce(string_agg(c.table_name, ', ' ORDER BY c.table_name), '')
   FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.column_name = 'learner_id'
     AND c.table_name <> ALL (hilabs_observation_tables())
     AND c.table_name NOT IN ('journey_step', 'erasure_request', 'account')
     AND c.table_name IN (SELECT table_name FROM information_schema.tables
                          WHERE table_schema = 'public' AND table_type = 'BASE TABLE')),
  '', 'no learner-scoped table is left unguarded');

-- ------------------------------------------- R21: erasure reaches everything

INSERT INTO consent_event (learner_id, level, document_version)
VALUES ('11111111-1111-1111-1111-111111111111', 'research_full', 'consent-v1');
INSERT INTO arm_assignment (learner_id, arm, baseline_stratum, rng_seed, assigned_by)
VALUES ('11111111-1111-1111-1111-111111111111', 'full', 'mid', 'seed-7', 'ops');
INSERT INTO journey_step (id, learner_id, phase, task_id, chosen_by_learner)
VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111',
        'discovery', '33333333-3333-3333-3333-333333333333', TRUE);
INSERT INTO depth_event (learner_id, task_id, type)
VALUES ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
        'extension_taken');
INSERT INTO reflection (learner_id, prompt_type, prompt_id, text)
VALUES ('11111111-1111-1111-1111-111111111111', 'learning_history', 'p1', 'once I...');
INSERT INTO testimony (learner_id, work_sample_id, author_role, author_ref, text)
VALUES ('11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777777',
        'practitioner', 'pr-2', 'she pushed on');
INSERT INTO review_event (learner_id, task_id, concept, interval_days, outcome)
VALUES ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
        'C4', 3, 'recalled');

-- Identity: an account with a credential and a live session, so the erasure can be shown to
-- reach the things that let someone sign in.
INSERT INTO account (id, kind, email, learner_id)
VALUES ('a0000000-0000-0000-0000-00000000000a', 'learner', 'learner@example.org',
        '11111111-1111-1111-1111-111111111111');
INSERT INTO credential (account_id, type, secret_hash, expires_at)
VALUES ('a0000000-0000-0000-0000-00000000000a', 'password', 'scrypt:not-a-real-hash',
        now() + interval '30 days');
INSERT INTO session (account_id, token_hash, expires_at)
VALUES ('a0000000-0000-0000-0000-00000000000a', 'sha256:not-a-real-token',
        now() + interval '7 days');

SELECT must_fail(
  $$INSERT INTO account (kind, email) VALUES ('learner', 'nobody@example.org')$$,
  'a learner account without a learner is refused');

SELECT must_fail(
  $$INSERT INTO account (kind, email, learner_id)
    VALUES ('researcher', 'staff@example.org', '22222222-2222-2222-2222-222222222222')$$,
  'a staff account with a learner is refused');

SELECT must_fail(
  $$INSERT INTO account (kind, email, learner_id)
    VALUES ('learner', 'Learner@EXAMPLE.org', '22222222-2222-2222-2222-222222222222')$$,
  'the same address in different case is one account');


SELECT must_fail(
  $$DELETE FROM depth_event WHERE learner_id = '11111111-1111-1111-1111-111111111111'$$,
  'nothing may be deleted without an authorisation');

SELECT must_fail(
  $$SELECT hilabs_erase_learner('11111111-1111-1111-1111-111111111111')$$,
  'erasure refuses to run without an authorised request');

INSERT INTO erasure_request (learner_id, learner_ref_hash, authorised_at, authorised_by)
VALUES ('11111111-1111-1111-1111-111111111111', 'sha256:0ab3...', now(), 'dpo');

SELECT must_pass(
  $$SELECT hilabs_erase_learner('11111111-1111-1111-1111-111111111111')$$,
  'an authorised erasure runs');

-- Checked across every table carrying learner_id, discovered from the catalogue rather than from
-- a hand-written list. This is what catches a new table that the erasure path forgot.
DO $$
DECLARE
  r record;
  n bigint;
  survivors text := '';
  checked int := 0;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'learner_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'erasure_request'
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE learner_id = %L',
                   r.table_name, '11111111-1111-1111-1111-111111111111') INTO n;
    checked := checked + 1;
    IF n > 0 THEN
      survivors := survivors || r.table_name || '(' || n || ') ';
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM learner WHERE id = '11111111-1111-1111-1111-111111111111') THEN
    survivors := survivors || 'learner(1) ';
  END IF;

  IF survivors <> '' THEN
    RAISE EXCEPTION 'FAIL  rows survived the erasure: %', survivors;
  END IF;
  RAISE NOTICE 'pass  nothing survives an erasure, checked across % learner-scoped tables', checked;
END;
$$;

SELECT must_be(
  (SELECT count(*)::int FROM credential), 0,
  'erasing a learner takes their credentials with it');

SELECT must_be(
  (SELECT count(*)::int FROM session), 0,
  'erasing a learner takes their sessions with it, so no one stays signed in');

SELECT must_be(
  (SELECT (learner_id IS NULL AND learner_ref_hash IS NOT NULL AND completed_at IS NOT NULL)
   FROM erasure_request LIMIT 1),
  TRUE, 'the audit record survives and no longer identifies anyone');

DO $$ BEGIN RAISE NOTICE '--- all invariant tests passed ---'; END $$;
