-- HiLabs data model, v1 (PostgreSQL 16)
-- Dated 2026-10-23. Canonical schema, per ADR 0002 (React + NestJS + PostgreSQL).
--
-- Implements the data model in docs/prd.md, with the invariants in CLAUDE.md enforced in the
-- database rather than left to application code. Prisma or TypeORM should be generated from
-- this file, not the other way round: the triggers and CHECKs below are the research design,
-- and an ORM migration that drops them silently invalidates the pilot.
--
-- Three kinds of table, and the difference is load-bearing:
--
--   RECORD         -- current-state rows that may be updated (learner, resource, task)
--   OBSERVATION    -- what actually happened. Append-only. Never updated, never deleted except
--                     through an authorised erasure (R21). Triggers enforce this.
--   INTERPRETATION -- what we think it means. Append-only and versioned: a revised view
--                     supersedes its predecessor, carrying model_version and its evidence.
--
-- The split exists so the GIM types, the phase rules and DI can all change as findings come in
-- without rewriting what learners did.

BEGIN;

-- ---------------------------------------------------------------------------
-- Meta
-- ---------------------------------------------------------------------------

CREATE TABLE schema_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_meta (key, value) VALUES
  ('schema_version', '1'),
  ('model_version',  'gim-interp-v1'),
  ('rubric_version', 'v1'),
  ('domain',         'critical-and-systems-thinking');

-- ---------------------------------------------------------------------------
-- RECORD tables
-- ---------------------------------------------------------------------------

-- R2: no grades, school or credentials. Do not add such a column.
-- prior_health_care_experience is a confound control for the far-transfer task (see
-- docs/research/assessment-tasks-v1.md section 7), not a credential: it records occupation
-- exposure, is never used to select or stream a learner, and is reported only as a sensitivity
-- analysis.
CREATE TABLE learner (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal         TEXT NOT NULL CHECK (length(btrim(goal)) > 0),  -- R1: a goal, not a course choice
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  study_arm    TEXT CHECK (study_arm IN ('full', 'skip')),     -- NULL until randomised
  prior_health_care_experience BOOLEAN,
  withdrawn_at TIMESTAMPTZ
);

-- Consent is append-only history, not a mutable field: a learner may narrow or withdraw consent,
-- and the pilot must be able to show what was in force when each row was written.
CREATE TABLE consent_event (                        -- OBSERVATION
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id       UUID NOT NULL REFERENCES learner(id),
  level            TEXT NOT NULL CHECK (level IN ('research_full','research_no_quotes','withdrawn')),
  document_version TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_consent_learner ON consent_event (learner_id, created_at);

-- Randomisation audit (PRD: "Random, balanced on baseline task score").
-- learner.study_arm is the convenience field; this is the record of how it got that way.
CREATE TABLE arm_assignment (                       -- OBSERVATION
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id       UUID NOT NULL UNIQUE REFERENCES learner(id),
  arm              TEXT NOT NULL CHECK (arm IN ('full', 'skip')),
  baseline_stratum TEXT NOT NULL,
  rng_seed         TEXT NOT NULL,
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by      TEXT NOT NULL
);

CREATE TABLE resource (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  author           TEXT,
  source           TEXT NOT NULL,
  url              TEXT NOT NULL,                   -- always the original; copies are not hosted
  licence          TEXT NOT NULL,
  licence_version  TEXT,
  licence_url      TEXT,
  concepts         TEXT[] NOT NULL CHECK (cardinality(concepts) > 0),   -- C1..C8
  format           TEXT NOT NULL CHECK (format IN ('video','audio','text','interactive','dataset')),
  duration_minutes INTEGER,
  language         TEXT,
  origin_region    TEXT,                            -- for the many-traditions coverage check
  is_practitioner  BOOLEAN NOT NULL DEFAULT FALSE,  -- R9
  phase_tag        TEXT NOT NULL CHECK (phase_tag IN ('osmotic','tailored','either')),
  has_audio_only   BOOLEAN NOT NULL DEFAULT FALSE,  -- R20
  has_transcript   BOOLEAN NOT NULL DEFAULT FALSE,  -- R20
  approx_mb        NUMERIC,
  is_core          BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by      TEXT NOT NULL,
  verified_at      TIMESTAMPTZ NOT NULL,
  -- R20: a core resource must be reachable without video.
  CONSTRAINT core_resource_reachable_without_video
    CHECK (NOT is_core OR format <> 'video' OR has_audio_only OR has_transcript)
);

-- Task catalogue: discovery challenges, assessment tasks, tailored exercises, review items.
CREATE TABLE task (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL CHECK (kind IN ('discovery','assessment','tailored','review')),
  code       TEXT NOT NULL,                   -- D1..D6 for discovery; B,N,F,D,P for assessment
  gim_domain TEXT CHECK (gim_domain IN
               ('cognitive','analytical','creative','emotional','adaptive','instinctive')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  tier       INTEGER NOT NULL DEFAULT 0,      -- 0 = required attempt; 1+ = optional extension
  version    TEXT NOT NULL,
  UNIQUE (kind, code, tier, version)
);

CREATE TABLE rater (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role          TEXT NOT NULL CHECK (role IN ('rater','adjudicator','gim_scorer')),
  calibrated_at TIMESTAMPTZ,                  -- NULL until the 0.75 gate is passed
  notes         TEXT
);

-- ---------------------------------------------------------------------------
-- Erasure (R21, Nigeria Data Protection Act 2023)
-- ---------------------------------------------------------------------------
--
-- Observation rows cannot be deleted by ordinary means. The only way through is an authorised,
-- open erasure request, which the delete trigger below checks for. This makes "deletion only
-- through the erasure path" a property of the database.
--
-- Deliberately NOT a foreign key to learner: this row is the audit record that an erasure
-- happened, so it has to outlive the learner row it erases. learner_id is held only while the
-- request is open; the CHECK makes it impossible to mark a request complete while still holding
-- the identifier, so what survives afterwards is the salted hash and the dates.
CREATE TABLE erasure_request (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id       UUID,
  learner_ref_hash TEXT NOT NULL,             -- salted hash, kept permanently
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  authorised_at    TIMESTAMPTZ,
  authorised_by    TEXT,
  completed_at     TIMESTAMPTZ,
  scope            TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all')),
  note             TEXT,
  CONSTRAINT identifier_released_before_completion
    CHECK (completed_at IS NULL OR learner_id IS NULL),
  CONSTRAINT completion_requires_authorisation
    CHECK (completed_at IS NULL OR authorised_at IS NOT NULL)
);
CREATE INDEX idx_erasure_open ON erasure_request (learner_id)
  WHERE authorised_at IS NOT NULL AND completed_at IS NULL;

-- ---------------------------------------------------------------------------
-- RECORD: the journey
-- ---------------------------------------------------------------------------

CREATE TABLE journey_step (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id        UUID NOT NULL REFERENCES learner(id),
  phase             TEXT NOT NULL CHECK (phase IN ('discovery','osmotic','tailored','assessment')),
  gim_domain        TEXT CHECK (gim_domain IN
                      ('cognitive','analytical','creative','emotional','adaptive','instinctive')),
  task_id           UUID REFERENCES task(id),
  resource_id       UUID REFERENCES resource(id),
  chosen_by_learner BOOLEAN NOT NULL,         -- volition, 5.1
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at          TIMESTAMPTZ,
  CONSTRAINT step_points_at_something CHECK (task_id IS NOT NULL OR resource_id IS NOT NULL)
);
CREATE INDEX idx_step_learner ON journey_step (learner_id, started_at);

-- ---------------------------------------------------------------------------
-- OBSERVATION tables
-- ---------------------------------------------------------------------------

-- R6: raw depth-seeking behaviour (4.1)
CREATE TABLE depth_event (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id            UUID NOT NULL REFERENCES learner(id),
  task_id               UUID REFERENCES task(id),
  journey_step_id       UUID REFERENCES journey_step(id),
  type                  TEXT NOT NULL CHECK (type IN
                          ('extension_taken','retry_after_failure','question_asked','time_on_task')),
  value_seconds         INTEGER,
  idle_excluded_seconds INTEGER,              -- gaps over 5 min, excluded and recorded
  detail                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT time_on_task_has_a_value
    CHECK (type <> 'time_on_task' OR value_seconds IS NOT NULL)
);
CREATE INDEX idx_depth_learner ON depth_event (learner_id, created_at);

-- R14: every draft kept, with dates. support_level separates GIM from IIM (4.4).
CREATE TABLE work_sample (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id           UUID NOT NULL REFERENCES learner(id),
  task_id              UUID NOT NULL REFERENCES task(id),
  journey_step_id      UUID REFERENCES journey_step(id),
  content              TEXT NOT NULL,
  version              INTEGER NOT NULL CHECK (version >= 1),
  support_level        TEXT NOT NULL CHECK (support_level IN
                         ('none','companion_hints','companion_explanation','human_help','unknown')),
  input_mode           TEXT NOT NULL DEFAULT 'typed'
                         CHECK (input_mode IN ('typed','spoken_transcript')),
  time_on_task_minutes INTEGER,
  conditions_note      TEXT,                  -- 6.4: DI cannot be read from output alone
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (learner_id, task_id, version)
);
CREATE INDEX idx_sample_learner ON work_sample (learner_id, created_at);

-- R7: self-report signal
CREATE TABLE reflection (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id  UUID NOT NULL REFERENCES learner(id),
  prompt_type TEXT NOT NULL CHECK (prompt_type IN ('learning_history','self_reflection')),
  prompt_id   TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reflection_learner ON reflection (learner_id, created_at);

-- R19: observer testimony signal
CREATE TABLE testimony (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id     UUID NOT NULL REFERENCES learner(id),
  work_sample_id UUID REFERENCES work_sample(id),
  author_role    TEXT NOT NULL CHECK (author_role IN ('peer','practitioner')),
  author_ref     TEXT NOT NULL,
  text           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_testimony_learner ON testimony (learner_id, created_at);

-- Separates the companion's help from the learner's own work (4.4).
-- The citation rule is enforced here, not left to the prompt: an explanation without a resource
-- cannot be written (CLAUDE.md invariant 7).
CREATE TABLE companion_event (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id      UUID NOT NULL REFERENCES learner(id),
  journey_step_id UUID REFERENCES journey_step(id),
  work_sample_id  UUID REFERENCES work_sample(id),
  phase           TEXT NOT NULL CHECK (phase IN ('discovery','osmotic','tailored','assessment')),
  type            TEXT NOT NULL CHECK (type IN
                    ('hint','explanation','example','question','draft_edit_suggestion')),
  content         TEXT NOT NULL,
  resource_id     UUID REFERENCES resource(id),
  model_id        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT explanation_cites_a_resource
    CHECK (type <> 'explanation' OR resource_id IS NOT NULL)
);
CREATE INDEX idx_companion_learner ON companion_event (learner_id, created_at);

-- R13: spaced review
CREATE TABLE review_event (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id    UUID NOT NULL REFERENCES learner(id),
  task_id       UUID NOT NULL REFERENCES task(id),
  concept       TEXT NOT NULL,                -- C1..C8
  interval_days INTEGER NOT NULL,
  outcome       TEXT NOT NULL CHECK (outcome IN ('recalled','partial','not_recalled','skipped')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_learner ON review_event (learner_id, created_at);

-- R18: the blind export. Kept so that marker parity between arms can be checked, and so that an
-- erasure reaches exports already generated.
CREATE TABLE export_batch (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  operator     TEXT NOT NULL,
  rng_seed     TEXT NOT NULL,
  sample_count INTEGER NOT NULL,
  note         TEXT
);

CREATE TABLE export_item (                    -- OBSERVATION
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id               UUID NOT NULL REFERENCES export_batch(id),
  work_sample_id         UUID NOT NULL REFERENCES work_sample(id),
  learner_id             UUID NOT NULL REFERENCES learner(id),
  display_code           TEXT NOT NULL,       -- e.g. L-4471; unlinkable without this table
  position               INTEGER NOT NULL,
  redaction_marker_count INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, position),
  UNIQUE (batch_id, display_code)
);
CREATE INDEX idx_export_item_learner ON export_item (learner_id);

-- R18 / rubric: independent rater scores.
-- learner_id is denormalised so the erasure trigger can resolve the learner without joining
-- through work_sample. It is never included in a blind export.
CREATE TABLE rating (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_sample_id UUID NOT NULL REFERENCES work_sample(id),
  learner_id     UUID NOT NULL REFERENCES learner(id),
  rater_id       UUID NOT NULL REFERENCES rater(id),
  rubric_version TEXT NOT NULL,
  pass           TEXT NOT NULL CHECK (pass IN ('independent','adjudication','drift_recheck')),
  blind          BOOLEAN NOT NULL,
  export_item_id UUID REFERENCES export_item(id),
  minutes_spent  INTEGER,
  flavour_note   TEXT CHECK (flavour_note IN ('theory_leaning','framework_leaning','neither')),
  free_note      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_sample_id, rater_id, pass, rubric_version)
);
CREATE INDEX idx_rating_sample ON rating (work_sample_id);

-- One row per dimension, rather than six columns, so that a v1.1 rubric can change the dimension
-- set without a migration that rewrites existing ratings.
-- Exactly one of score / ns_code is present. NS is the absence of a score, not a low one.
CREATE TABLE rating_score (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id  UUID NOT NULL REFERENCES rating(id),
  dimension  INTEGER NOT NULL CHECK (dimension BETWEEN 1 AND 6),
  score      INTEGER CHECK (score BETWEEN 1 AND 4),
  ns_code    TEXT CHECK (ns_code IN ('NS-blank','NS-offtask','NS-leak','NS-unreadable')),
  learner_id UUID NOT NULL REFERENCES learner(id),
  UNIQUE (rating_id, dimension),
  CONSTRAINT score_xor_ns_code CHECK ((score IS NULL) <> (ns_code IS NULL))
);

-- ---------------------------------------------------------------------------
-- INTERPRETATION
-- ---------------------------------------------------------------------------

-- R16. Never shown to the learner in v1. Never overwritten: a revised view inserts a new row
-- pointing at the one it supersedes.
CREATE TABLE gim_hypothesis (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id        UUID NOT NULL REFERENCES learner(id),
  gim_type          TEXT NOT NULL CHECK (gim_type IN
                      ('cognitive_analytical','creative','adaptive')),  -- in-scope types only
  domain            TEXT NOT NULL,
  scorer_id         UUID NOT NULL REFERENCES rater(id),
  signal_portfolio  INTEGER CHECK (signal_portfolio  BETWEEN 1 AND 5),
  signal_trajectory INTEGER CHECK (signal_trajectory BETWEEN 1 AND 5),
  signal_testimony  INTEGER CHECK (signal_testimony  BETWEEN 1 AND 5),
  signal_selfreport INTEGER CHECK (signal_selfreport BETWEEN 1 AND 5),
  -- NULL on a signal means NS. Per gim-signal-scoring-v1.md section 4, any NS forces
  -- 'indeterminate' rather than a downgrade, and the CHECK below enforces that.
  convergence       TEXT NOT NULL CHECK (convergence IN ('strong','mixed','weak','indeterminate')),
  support_profile   TEXT NOT NULL CHECK (support_profile IN
                      ('low_support_depth','supported_depth','fading','mixed','insufficient_evidence')),
  flavour_note      TEXT CHECK (flavour_note IN ('theory_leaning','framework_leaning','neither')),
  model_version     TEXT NOT NULL,
  supersedes_id     UUID REFERENCES gim_hypothesis(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT missing_signal_forces_indeterminate CHECK (
    convergence = 'indeterminate'
    OR (signal_portfolio  IS NOT NULL
    AND signal_trajectory IS NOT NULL
    AND signal_testimony  IS NOT NULL
    AND signal_selfreport IS NOT NULL)
  )
);
CREATE INDEX idx_gim_learner ON gim_hypothesis (learner_id, created_at);
CREATE UNIQUE INDEX idx_gim_supersedes ON gim_hypothesis (supersedes_id)
  WHERE supersedes_id IS NOT NULL;             -- a row is superseded at most once

-- Observation before inference: every hypothesis links to the evidence behind it.
-- Enforced by the application inside the same transaction, and verified by the
-- v_gim_hypothesis_missing_evidence view below, which must always return zero rows.
-- It is not a CHECK because the child rows cannot exist before their parent.
CREATE TABLE gim_evidence (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id  UUID NOT NULL REFERENCES gim_hypothesis(id),
  signal         TEXT NOT NULL CHECK (signal IN
                   ('portfolio','trajectory','testimony','self_report')),
  evidence_table TEXT NOT NULL CHECK (evidence_table IN
                   ('work_sample','depth_event','reflection','testimony','rating')),
  evidence_id    UUID NOT NULL,                -- polymorphic, so no foreign key
  learner_id     UUID NOT NULL REFERENCES learner(id),
  UNIQUE (hypothesis_id, evidence_table, evidence_id, signal)
);

-- R15: the learner's challenge to an interpretation.
-- The PRD lists `resolution` as a field on Dispute. It is split out into its own append-only
-- table instead, because filling a resolution in later would be an update to an observation, and
-- a learner's challenge is exactly the row that must not be editable after the fact.
CREATE TABLE dispute (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id        UUID NOT NULL REFERENCES learner(id),
  interpretation_id UUID NOT NULL REFERENCES gim_hypothesis(id),
  text              TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dispute_response (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES dispute(id),
  learner_id UUID NOT NULL REFERENCES learner(id),
  responder  TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN
               ('interpretation_superseded','learner_note_added','no_change','pending')),
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Must always be empty. A hypothesis with no evidence breaks the guardrail of observation before
-- inference, and is a bug, not a data state.
CREATE VIEW v_gim_hypothesis_missing_evidence AS
SELECT h.id, h.learner_id, h.gim_type, h.created_at
FROM gim_hypothesis h
LEFT JOIN gim_evidence e ON e.hypothesis_id = h.id
WHERE e.id IS NULL;

-- The current interpretation for each learner and type: the row nothing supersedes.
CREATE VIEW v_gim_hypothesis_current AS
SELECT h.*
FROM gim_hypothesis h
WHERE NOT EXISTS (SELECT 1 FROM gim_hypothesis s WHERE s.supersedes_id = h.id);

-- Blinding check (rater-protocol-v1.md section 3): redaction marker frequency by arm, per batch.
-- A sharp difference means the redaction rules are leaking the arm.
CREATE VIEW v_export_marker_parity AS
SELECT i.batch_id,
       l.study_arm,
       count(*)                                  AS items,
       sum(i.redaction_marker_count)             AS markers,
       round(avg(i.redaction_marker_count), 3)   AS markers_per_item
FROM export_item i
JOIN learner l ON l.id = i.learner_id
GROUP BY i.batch_id, l.study_arm;

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------
--
-- UPDATE is refused on every observation table, without exception. Corrections are new rows.
-- DELETE is refused unless an authorised, uncompleted erasure request is open for that learner
-- (R21).
--
-- Do not drop these to fix a bug. If a write needs an update, the write is wrong. An ORM
-- migration that recreates a table will drop its triggers: re-run the DO block below after any
-- such migration, and keep observation_tables() as the single list.

CREATE FUNCTION hilabs_observation_tables() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'consent_event','arm_assignment','depth_event','work_sample','reflection','testimony',
    'companion_event','review_event','rating','rating_score','export_item','gim_hypothesis',
    'gim_evidence','dispute','dispute_response'
  ];
$$;

CREATE FUNCTION hilabs_refuse_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: write a new row, never an update', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE FUNCTION hilabs_refuse_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM erasure_request e
    WHERE e.learner_id = OLD.learner_id
      AND e.authorised_at IS NOT NULL
      AND e.completed_at IS NULL
  ) THEN
    RAISE EXCEPTION '%: delete only via an authorised erasure (R21)', TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY hilabs_observation_tables() LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION hilabs_refuse_update()',
      t || '_no_update', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION hilabs_refuse_delete()',
      t || '_no_delete', t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Erasure, performed in one place (R21)
-- ---------------------------------------------------------------------------
--
-- The delete order is a foreign-key dependency order, and getting it wrong leaves a learner
-- partly erased. It lives here rather than in application code so that there is exactly one copy
-- of it and the API cannot drift from it: NestJS calls this function, and nothing else deletes a
-- learner. It refuses to run without an authorised, open request, and closes the request itself,
-- releasing the identifier so only the salted hash survives.
CREATE FUNCTION hilabs_erase_learner(p_learner UUID) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM erasure_request e
    WHERE e.learner_id = p_learner
      AND e.authorised_at IS NOT NULL
      AND e.completed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'no authorised, open erasure request for learner %', p_learner
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  DELETE FROM rating_score     WHERE learner_id = p_learner;
  DELETE FROM rating           WHERE learner_id = p_learner;
  DELETE FROM dispute_response WHERE learner_id = p_learner;
  DELETE FROM dispute          WHERE learner_id = p_learner;
  DELETE FROM gim_evidence     WHERE learner_id = p_learner;
  DELETE FROM gim_hypothesis   WHERE learner_id = p_learner;
  DELETE FROM export_item      WHERE learner_id = p_learner;
  DELETE FROM testimony        WHERE learner_id = p_learner;  -- references work_sample
  DELETE FROM companion_event  WHERE learner_id = p_learner;  -- references work_sample
  DELETE FROM depth_event      WHERE learner_id = p_learner;
  DELETE FROM reflection       WHERE learner_id = p_learner;
  DELETE FROM review_event     WHERE learner_id = p_learner;
  DELETE FROM work_sample      WHERE learner_id = p_learner;
  DELETE FROM journey_step     WHERE learner_id = p_learner;
  DELETE FROM arm_assignment   WHERE learner_id = p_learner;
  DELETE FROM consent_event    WHERE learner_id = p_learner;
  DELETE FROM learner          WHERE id = p_learner;

  UPDATE erasure_request
     SET completed_at = now(), learner_id = NULL
   WHERE learner_id = p_learner;
END;
$$;

COMMIT;
