-- Hardening from the security review (2026-10-26).
-- 1. Each party may only write its own approval columns and its own status moves.
-- 2. Outcome records and audit events cannot be deleted row-by-row either.

CREATE OR REPLACE FUNCTION proof_contracts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('DRAFT', 'PROPOSED') THEN
      RAISE EXCEPTION 'proof contract must be created as DRAFT or PROPOSED, got %', NEW.status;
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
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER outcome_records_no_delete BEFORE DELETE ON outcome_records
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
