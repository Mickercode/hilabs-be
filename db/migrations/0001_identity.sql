-- 0001_identity — accounts, credentials and sessions
--
-- Applies to a database already created from an earlier schema.sql. A fresh database gets all
-- of this from schema.sql directly; this file exists so an existing one can be brought forward.
--
-- Why identity lives apart from `learner`:
--
-- `learner` deliberately carries no identifier — no name, no email, no school, no employer. It
-- holds a goal and a date. That is what lets the research dataset be handled, exported to raters
-- and analysed without carrying a person's contact details through every table.
--
-- The team still has to reach a learner (the retention task lands about three weeks after the
-- journey ends), so an email has to exist somewhere. It lives here, in `account`, joined to the
-- learner by a key. Erasing a learner erases the account with it.

BEGIN;

-- Anyone who can sign in: a learner, or a member of the research team.
CREATE TABLE account (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('learner', 'researcher', 'rater', 'admin')),
  email       TEXT NOT NULL,
  display_name TEXT,
  -- Set only for kind='learner'. A staff account has no learner record and never gets one.
  learner_id  UUID REFERENCES learner(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ,
  CONSTRAINT learner_account_has_a_learner
    CHECK ((kind = 'learner') = (learner_id IS NOT NULL)),
  CONSTRAINT one_account_per_learner UNIQUE (learner_id)
);

-- Case-insensitive uniqueness: people type their address inconsistently.
CREATE UNIQUE INDEX idx_account_email ON account (lower(email));
CREATE INDEX idx_account_kind ON account (kind);

-- How an account proves who it is. The pilot issues an enrolment code to each accepted learner;
-- `type` is here so a password or an emailed one-time code can be added without a migration of
-- everything that reads it.
CREATE TABLE credential (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('password')),
  -- Always a hash. A code or password readable in the database is one leak away from being
  -- readable everywhere.
  secret_hash TEXT NOT NULL,
  expires_at  TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credential_account ON credential (account_id, type);

CREATE TABLE session (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  -- The cookie holds the token; the database holds only its hash, so a database copy cannot be
  -- used to impersonate anyone.
  token_hash  TEXT NOT NULL UNIQUE,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  CONSTRAINT session_expires_after_issue CHECK (expires_at > issued_at)
);
CREATE INDEX idx_session_account ON session (account_id);
CREATE INDEX idx_session_live ON session (token_hash) WHERE revoked_at IS NULL;

-- Erasure has to reach the account, and the credentials and sessions hanging off it. `account`
-- carries learner_id so the catalogue sweep in test_schema.sql finds it; `credential` and
-- `session` do not, so they are deleted explicitly here.
CREATE OR REPLACE FUNCTION hilabs_erase_learner(p_learner UUID) RETURNS void LANGUAGE plpgsql AS $$
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

  -- Identity first: sessions and credentials cascade from the account.
  DELETE FROM account          WHERE learner_id = p_learner;

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
