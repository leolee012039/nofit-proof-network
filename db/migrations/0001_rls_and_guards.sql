-- Tenant isolation (row-level security) and integrity guards.
-- Request-scoped sessions run as role app_tenant with app.org_id / app.role set
-- via set_config(..., true). Table owners (migrations, verified webhook worker,
-- seed) are not subject to these policies; RLS is ENABLED but not FORCED.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT app_tenant TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not grant app_tenant to %: %', current_user, SQLERRM;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_org() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_can_write() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.role', true), '') IN ('buyer', 'seller_admin', 'system_agent')
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_tenant;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_org() TO app_tenant;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_can_write() TO app_tenant;
--> statement-breakpoint
GRANT SELECT ON organizations, profiles, paypal_orders, paypal_webhook_events TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON service_capabilities, knowledge_sources, buyer_requests, fit_assessments, proof_contracts, proof_runs, sharing_consents TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT ON outcome_records, audit_events TO app_tenant;
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE service_capabilities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE buyer_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE fit_assessments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE proof_contracts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE paypal_orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE paypal_webhook_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE proof_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE outcome_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sharing_consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE fixture_provider_orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organizations_directory ON organizations FOR SELECT TO app_tenant USING (true);
--> statement-breakpoint
CREATE POLICY profiles_own_org ON profiles FOR SELECT TO app_tenant USING (organization_id = app_org());
--> statement-breakpoint
CREATE POLICY service_capabilities_own_org ON service_capabilities FOR ALL TO app_tenant
  USING (organization_id = app_org())
  WITH CHECK (organization_id = app_org() AND app_can_write());
--> statement-breakpoint
CREATE POLICY knowledge_sources_own_org ON knowledge_sources FOR ALL TO app_tenant
  USING (organization_id = app_org())
  WITH CHECK (organization_id = app_org() AND app_can_write());
--> statement-breakpoint
CREATE POLICY buyer_requests_parties ON buyer_requests FOR ALL TO app_tenant
  USING (app_org() IN (organization_id, seller_organization_id))
  WITH CHECK (app_org() IN (organization_id, seller_organization_id) AND app_can_write());
--> statement-breakpoint
CREATE POLICY fit_assessments_parties ON fit_assessments FOR ALL TO app_tenant
  USING (app_org() IN (buyer_organization_id, seller_organization_id))
  WITH CHECK (app_org() IN (buyer_organization_id, seller_organization_id) AND app_can_write());
--> statement-breakpoint
CREATE POLICY proof_contracts_parties ON proof_contracts FOR ALL TO app_tenant
  USING (app_org() IN (buyer_organization_id, seller_organization_id))
  WITH CHECK (app_org() IN (buyer_organization_id, seller_organization_id) AND app_can_write());
--> statement-breakpoint
CREATE POLICY paypal_orders_parties_read ON paypal_orders FOR SELECT TO app_tenant
  USING (app_org() IN (buyer_organization_id, seller_organization_id));
--> statement-breakpoint
CREATE POLICY paypal_webhook_events_parties_read ON paypal_webhook_events FOR SELECT TO app_tenant
  USING (app_org() IN (buyer_organization_id, seller_organization_id));
--> statement-breakpoint
CREATE POLICY proof_runs_parties ON proof_runs FOR ALL TO app_tenant
  USING (app_org() IN (buyer_organization_id, seller_organization_id))
  WITH CHECK (app_org() = seller_organization_id AND app_can_write());
--> statement-breakpoint
CREATE POLICY outcome_records_parties_read ON outcome_records FOR SELECT TO app_tenant
  USING (app_org() IN (buyer_organization_id, seller_organization_id));
--> statement-breakpoint
CREATE POLICY outcome_records_seller_insert ON outcome_records FOR INSERT TO app_tenant
  WITH CHECK (app_org() = seller_organization_id AND app_can_write());
--> statement-breakpoint
CREATE POLICY sharing_consents_own_org ON sharing_consents FOR ALL TO app_tenant
  USING (organization_id = app_org())
  WITH CHECK (organization_id = app_org() AND app_can_write());
--> statement-breakpoint
CREATE POLICY audit_events_parties_read ON audit_events FOR SELECT TO app_tenant
  USING (app_org() IN (organization_id, counterparty_organization_id));
--> statement-breakpoint
CREATE POLICY audit_events_own_insert ON audit_events FOR INSERT TO app_tenant
  WITH CHECK (organization_id = app_org() AND app_can_write());
--> statement-breakpoint
-- Proof contracts: scope/price immutable after seller approval; payment-derived
-- states can only be written by the payment service (never a tenant session);
-- proof states require a verified captured payment.
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
CREATE TRIGGER proof_contracts_guard_trg BEFORE INSERT OR UPDATE ON proof_contracts
  FOR EACH ROW EXECUTE FUNCTION proof_contracts_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION paypal_orders_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payment_state = 'CAPTURED' AND NEW.capture_id IS NULL THEN
    RAISE EXCEPTION 'CAPTURED payment requires a provider capture id';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount_minor IS DISTINCT FROM OLD.amount_minor OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.paypal_order_id IS DISTINCT FROM OLD.paypal_order_id
       OR NEW.proof_contract_id IS DISTINCT FROM OLD.proof_contract_id THEN
      RAISE EXCEPTION 'payment amount, currency, order and contract are immutable';
    END IF;
    IF OLD.payment_state = 'CAPTURED' AND NEW.payment_state NOT IN ('CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REVERSED') THEN
      RAISE EXCEPTION 'captured payment cannot move to %', NEW.payment_state;
    END IF;
    IF OLD.capture_id IS NOT NULL AND NEW.capture_id IS DISTINCT FROM OLD.capture_id THEN
      RAISE EXCEPTION 'capture id is immutable once recorded';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER paypal_orders_guard_trg BEFORE INSERT OR UPDATE ON paypal_orders
  FOR EACH ROW EXECUTE FUNCTION paypal_orders_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION proof_runs_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) AND NEW.status IN ('QUEUED', 'RUNNING') AND NOT EXISTS (
    SELECT 1 FROM paypal_orders p WHERE p.proof_contract_id = NEW.proof_contract_id AND p.payment_state = 'CAPTURED'
  ) THEN
    RAISE EXCEPTION 'proof run refused: contract % has no verified captured payment', NEW.proof_contract_id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('PASSED', 'FAILED', 'INCONCLUSIVE') AND (
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.evidence_json IS DISTINCT FROM OLD.evidence_json OR
    NEW.artifact_digest IS DISTINCT FROM OLD.artifact_digest
  ) THEN
    RAISE EXCEPTION 'completed proof run % evidence is immutable', OLD.id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER proof_runs_guard_trg BEFORE INSERT OR UPDATE ON proof_runs
  FOR EACH ROW EXECUTE FUNCTION proof_runs_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;
--> statement-breakpoint
CREATE TRIGGER outcome_records_append_only BEFORE UPDATE ON outcome_records
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
