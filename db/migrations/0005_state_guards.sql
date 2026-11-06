-- State-machine guards from the ECC review (2026-10-27). Defence in depth: the
-- service layer already enforces all of this. These triggers make a bypass of the
-- service layer (a bug, or a raw query inside a tenant session) fail closed.
-- Trigger functions run as the invoker, so in a tenant session their lookups are
-- themselves limited by row-level security.

-- Mirror of CONTRACT_TRANSITIONS in lib/domain/states.ts (a test keeps them in sync).
CREATE OR REPLACE FUNCTION contract_transition_ok(from_status text, to_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE from_status
    WHEN 'DRAFT' THEN to_status IN ('PROPOSED', 'CANCELLED')
    WHEN 'PROPOSED' THEN to_status IN ('SELLER_APPROVED', 'CANCELLED')
    WHEN 'SELLER_APPROVED' THEN to_status IN ('BUYER_ACCEPTED', 'CANCELLED')
    WHEN 'BUYER_ACCEPTED' THEN to_status IN ('PAYMENT_PENDING', 'CANCELLED')
    WHEN 'PAYMENT_PENDING' THEN to_status IN ('PAID', 'PAYMENT_FAILED', 'NEEDS_REVIEW', 'CANCELLED')
    WHEN 'PAYMENT_FAILED' THEN to_status IN ('PAYMENT_PENDING', 'CANCELLED')
    WHEN 'PAID' THEN to_status IN ('PROOF_QUEUED', 'NEEDS_REVIEW')
    WHEN 'PROOF_QUEUED' THEN to_status IN ('RUNNING', 'NEEDS_REVIEW')
    WHEN 'RUNNING' THEN to_status IN ('PASSED', 'FAILED', 'INCONCLUSIVE')
    WHEN 'FAILED' THEN to_status IN ('PROOF_QUEUED', 'NEEDS_REVIEW')
    WHEN 'INCONCLUSIVE' THEN to_status IN ('PROOF_QUEUED', 'NEEDS_REVIEW')
    WHEN 'PASSED' THEN to_status IN ('NEEDS_REVIEW')
    WHEN 'NEEDS_REVIEW' THEN to_status IN ('PROOF_QUEUED', 'CANCELLED')
    WHEN 'CANCELLED' THEN to_status IN ('NEEDS_REVIEW')
    ELSE false
  END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION contract_transition_ok(text, text) TO app_tenant;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION proof_contracts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('DRAFT', 'PROPOSED') THEN
      RAISE EXCEPTION 'proof contract must be created as DRAFT or PROPOSED, got %', NEW.status;
    END IF;
    IF NEW.seller_approved_by IS NOT NULL OR NEW.seller_approved_at IS NOT NULL OR NEW.buyer_accepted_by IS NOT NULL
       OR NEW.buyer_accepted_at IS NOT NULL OR NEW.buyer_accepted_scope_hash IS NOT NULL THEN
      RAISE EXCEPTION 'a new proof contract cannot carry approvals';
    END IF;
    IF current_user = 'app_tenant' AND (
      app_org() IS DISTINCT FROM NEW.seller_organization_id OR
      coalesce(current_setting('app.role', true), '') <> 'system_agent'
    ) THEN
      RAISE EXCEPTION 'only the seller''s fit engine can propose a proof contract';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM buyer_requests br JOIN fit_assessments fa ON fa.request_id = br.id
      WHERE br.id = NEW.request_id AND fa.id = NEW.assessment_id
        AND br.organization_id = NEW.buyer_organization_id AND br.seller_organization_id = NEW.seller_organization_id
    ) THEN
      RAISE EXCEPTION 'proof contract parties must match its request and assessment';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('DRAFT', 'PROPOSED') AND (
    NEW.immutable_scope_json IS DISTINCT FROM OLD.immutable_scope_json OR
    NEW.scope_hash IS DISTINCT FROM OLD.scope_hash OR
    NEW.price_minor IS DISTINCT FROM OLD.price_minor OR
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.max_runs IS DISTINCT FROM OLD.max_runs
  ) THEN
    RAISE EXCEPTION 'proof contract % scope and price are immutable after seller approval', OLD.id;
  END IF;

  IF current_user = 'app_tenant' THEN
    IF NEW.buyer_organization_id IS DISTINCT FROM OLD.buyer_organization_id
       OR NEW.seller_organization_id IS DISTINCT FROM OLD.seller_organization_id
       OR NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.assessment_id IS DISTINCT FROM OLD.assessment_id THEN
      RAISE EXCEPTION 'contract parties and links are immutable';
    END IF;
    IF app_org() = OLD.buyer_organization_id AND (
      NEW.seller_approved_by IS DISTINCT FROM OLD.seller_approved_by OR
      NEW.seller_approved_at IS DISTINCT FROM OLD.seller_approved_at OR
      (NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('BUYER_ACCEPTED', 'CANCELLED'))
    ) THEN
      RAISE EXCEPTION 'the buyer cannot make this change to contract %', OLD.id;
    END IF;
    IF app_org() = OLD.seller_organization_id AND (
      NEW.buyer_accepted_by IS DISTINCT FROM OLD.buyer_accepted_by OR
      NEW.buyer_accepted_at IS DISTINCT FROM OLD.buyer_accepted_at OR
      NEW.buyer_accepted_scope_hash IS DISTINCT FROM OLD.buyer_accepted_scope_hash OR
      (NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'BUYER_ACCEPTED')
    ) THEN
      RAISE EXCEPTION 'the seller cannot make this change to contract %', OLD.id;
    END IF;
    -- Terms never change in a tenant session, not even while PROPOSED: a new proposal is a new contract.
    IF NEW.immutable_scope_json IS DISTINCT FROM OLD.immutable_scope_json OR
       NEW.scope_hash IS DISTINCT FROM OLD.scope_hash OR
       NEW.price_minor IS DISTINCT FROM OLD.price_minor OR
       NEW.currency IS DISTINCT FROM OLD.currency OR
       NEW.version IS DISTINCT FROM OLD.version OR
       NEW.max_runs IS DISTINCT FROM OLD.max_runs OR
       NEW.capability_id IS DISTINCT FROM OLD.capability_id OR
       NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'contract % terms cannot be changed in a tenant session', OLD.id;
    END IF;
  END IF;

  -- Each approval is written exactly once, together with its own status move.
  IF (NEW.seller_approved_by IS DISTINCT FROM OLD.seller_approved_by OR NEW.seller_approved_at IS DISTINCT FROM OLD.seller_approved_at)
     AND NOT (OLD.status = 'PROPOSED' AND NEW.status = 'SELLER_APPROVED' AND OLD.seller_approved_by IS NULL) THEN
    RAISE EXCEPTION 'seller approval of contract % can only be recorded when approving it', OLD.id;
  END IF;
  IF (NEW.buyer_accepted_by IS DISTINCT FROM OLD.buyer_accepted_by OR NEW.buyer_accepted_at IS DISTINCT FROM OLD.buyer_accepted_at
      OR NEW.buyer_accepted_scope_hash IS DISTINCT FROM OLD.buyer_accepted_scope_hash)
     AND NOT (OLD.status = 'SELLER_APPROVED' AND NEW.status = 'BUYER_ACCEPTED' AND OLD.buyer_accepted_by IS NULL) THEN
    RAISE EXCEPTION 'buyer acceptance of contract % can only be recorded when accepting it', OLD.id;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_user = 'app_tenant' AND NEW.status IN ('PAYMENT_PENDING', 'PAID', 'PAYMENT_FAILED') THEN
      RAISE EXCEPTION 'contract status % can only be set by the payment service', NEW.status;
    END IF;
    IF NEW.status IN ('PAID', 'PROOF_QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'INCONCLUSIVE') AND NOT EXISTS (
      SELECT 1 FROM paypal_orders p WHERE p.proof_contract_id = NEW.id AND p.payment_state = 'CAPTURED'
    ) THEN
      RAISE EXCEPTION 'contract % has no verified captured payment; status % refused', NEW.id, NEW.status;
    END IF;
    IF NOT contract_transition_ok(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'proof contract % cannot move from % to %', OLD.id, OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'SELLER_APPROVED' AND (NEW.seller_approved_by IS NULL OR NEW.seller_approved_at IS NULL) THEN
      RAISE EXCEPTION 'SELLER_APPROVED requires the approving seller';
    END IF;
    IF NEW.status = 'BUYER_ACCEPTED' AND (
      NEW.buyer_accepted_by IS NULL OR NEW.buyer_accepted_at IS NULL OR NEW.buyer_accepted_scope_hash IS DISTINCT FROM NEW.scope_hash
    ) THEN
      RAISE EXCEPTION 'BUYER_ACCEPTED requires the accepting buyer and the accepted scope hash';
    END IF;
    IF NEW.status = 'CANCELLED' AND EXISTS (
      SELECT 1 FROM paypal_orders p
      WHERE p.proof_contract_id = NEW.id AND p.payment_state IN ('CAPTURING', 'CAPTURED', 'CAPTURE_PENDING', 'CAPTURE_UNKNOWN')
    ) THEN
      RAISE EXCEPTION 'contract % has a captured or in-flight payment and cannot be cancelled', NEW.id;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION proof_runs_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'QUEUED' THEN
      RAISE EXCEPTION 'proof run must be created as QUEUED, got %', NEW.status;
    END IF;
    IF NEW.evidence_json IS NOT NULL OR NEW.artifact_digest IS NOT NULL OR NEW.steps_json IS NOT NULL OR NEW.logs_json IS NOT NULL
       OR NEW.failure_class IS NOT NULL OR NEW.started_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new proof run cannot carry results';
    END IF;
  END IF;

  IF (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) AND NEW.status IN ('QUEUED', 'RUNNING') AND NOT EXISTS (
    SELECT 1 FROM paypal_orders p WHERE p.proof_contract_id = NEW.proof_contract_id AND p.payment_state = 'CAPTURED'
  ) THEN
    RAISE EXCEPTION 'proof run refused: contract % has no verified captured payment', NEW.proof_contract_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM proof_contracts c
      WHERE c.id = NEW.proof_contract_id
        AND c.buyer_organization_id = NEW.buyer_organization_id AND c.seller_organization_id = NEW.seller_organization_id
    ) THEN
      RAISE EXCEPTION 'proof run parties must match its contract';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('PASSED', 'FAILED', 'INCONCLUSIVE') AND (
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.evidence_json IS DISTINCT FROM OLD.evidence_json OR
    NEW.artifact_digest IS DISTINCT FROM OLD.artifact_digest
  ) THEN
    RAISE EXCEPTION 'completed proof run % evidence is immutable', OLD.id;
  END IF;
  IF NEW.proof_contract_id IS DISTINCT FROM OLD.proof_contract_id OR
     NEW.run_number IS DISTINCT FROM OLD.run_number OR
     NEW.buyer_organization_id IS DISTINCT FROM OLD.buyer_organization_id OR
     NEW.seller_organization_id IS DISTINCT FROM OLD.seller_organization_id OR
     NEW.test_case IS DISTINCT FROM OLD.test_case OR
     NEW.environment_json IS DISTINCT FROM OLD.environment_json OR
     NEW.environment_version IS DISTINCT FROM OLD.environment_version OR
     NEW.fixture_key IS DISTINCT FROM OLD.fixture_key OR
     NEW.input_fixture_hash IS DISTINCT FROM OLD.input_fixture_hash THEN
    RAISE EXCEPTION 'proof run % inputs are immutable', OLD.id;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'QUEUED' AND NEW.status IN ('RUNNING', 'CANCELLED')) OR
    (OLD.status = 'RUNNING' AND NEW.status IN ('PASSED', 'FAILED', 'INCONCLUSIVE'))
  ) THEN
    RAISE EXCEPTION 'proof run % cannot move from % to %', OLD.id, OLD.status, NEW.status;
  END IF;
  IF NEW.status IN ('QUEUED', 'RUNNING', 'CANCELLED') AND (NEW.evidence_json IS NOT NULL OR NEW.artifact_digest IS NOT NULL) THEN
    RAISE EXCEPTION 'proof run % evidence can only be written when it completes', OLD.id;
  END IF;
  IF NEW.status IN ('PASSED', 'FAILED', 'INCONCLUSIVE') AND (NEW.evidence_json IS NULL OR NEW.artifact_digest IS NULL) THEN
    RAISE EXCEPTION 'completed proof run % needs its evidence and digest', OLD.id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- An outcome record is only ever a summary of one completed run: same ids, parties, result and digest.
CREATE OR REPLACE FUNCTION outcome_records_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM proof_runs r JOIN proof_contracts c ON c.id = r.proof_contract_id
    WHERE r.id = NEW.proof_run_id
      AND r.status IN ('PASSED', 'FAILED', 'INCONCLUSIVE')
      AND r.proof_contract_id = NEW.proof_contract_id
      AND c.request_id = NEW.request_id
      AND r.buyer_organization_id = NEW.buyer_organization_id
      AND r.seller_organization_id = NEW.seller_organization_id
      AND r.artifact_digest = NEW.artifact_digest
      AND NEW.result = CASE r.status WHEN 'PASSED' THEN 'PASS' WHEN 'FAILED' THEN 'FAIL' ELSE 'INCONCLUSIVE' END
  ) THEN
    RAISE EXCEPTION 'outcome record must match a completed proof run (ids, parties, result and digest)';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER outcome_records_link_guard_trg BEFORE INSERT ON outcome_records
  FOR EACH ROW EXECUTE FUNCTION outcome_records_link_guard();
--> statement-breakpoint
-- Tenants submit their own requests; afterwards only the workflow state may change.
CREATE OR REPLACE FUNCTION buyer_requests_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'app_tenant' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF app_org() IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'only the buyer can submit its own request';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = NEW.seller_organization_id AND o.role = 'seller') THEN
      RAISE EXCEPTION 'a request must name a seller organization';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'updated_at') THEN
    RAISE EXCEPTION 'a tenant session may only change the state of request %', OLD.id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER buyer_requests_guard_trg BEFORE INSERT OR UPDATE ON buyer_requests
  FOR EACH ROW EXECUTE FUNCTION buyer_requests_guard();
--> statement-breakpoint
-- Assessments are written by the seller's fit engine; afterwards only the seller's override may be recorded.
CREATE OR REPLACE FUNCTION fit_assessments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'app_tenant' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF app_org() IS DISTINCT FROM NEW.seller_organization_id
       OR coalesce(current_setting('app.role', true), '') <> 'system_agent'
       OR NEW.override_json IS NOT NULL
       OR NOT EXISTS (
         SELECT 1 FROM buyer_requests br
         WHERE br.id = NEW.request_id
           AND br.organization_id = NEW.buyer_organization_id AND br.seller_organization_id = NEW.seller_organization_id
       ) THEN
      RAISE EXCEPTION 'assessments are written only by the seller''s fit engine, for its own requests';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'override_json') IS DISTINCT FROM (to_jsonb(OLD) - 'override_json') THEN
    RAISE EXCEPTION 'assessment % is immutable; only an override can be recorded', OLD.id;
  END IF;
  IF app_org() IS DISTINCT FROM OLD.seller_organization_id OR coalesce(current_setting('app.role', true), '') <> 'seller_admin' THEN
    RAISE EXCEPTION 'only the assessing seller can override assessment %', OLD.id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER fit_assessments_guard_trg BEFORE INSERT OR UPDATE ON fit_assessments
  FOR EACH ROW EXECUTE FUNCTION fit_assessments_guard();
--> statement-breakpoint
-- A tenant may name a counterparty only if the two organizations share a request.
DROP POLICY audit_events_own_insert ON audit_events;
--> statement-breakpoint
CREATE POLICY audit_events_own_insert ON audit_events FOR INSERT TO app_tenant
  WITH CHECK (
    organization_id = app_org() AND app_can_write() AND (
      counterparty_organization_id IS NULL OR EXISTS (
        SELECT 1 FROM buyer_requests br
        WHERE (br.organization_id = app_org() AND br.seller_organization_id = audit_events.counterparty_organization_id)
           OR (br.seller_organization_id = app_org() AND br.organization_id = audit_events.counterparty_organization_id)
      )
    )
  );
