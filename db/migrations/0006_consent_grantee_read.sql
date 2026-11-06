-- Outcome reuse consent (2026-10-31). A buyer organization grants a seller the right
-- to reuse its proof outcomes; the seller's System Agent must be able to read that
-- grant, and its revocation, to honour it. Read-only: only the granting
-- organization can create, change or revoke its own consent rows.
CREATE POLICY sharing_consents_grantee_read ON sharing_consents FOR SELECT TO app_tenant
  USING (grantee = app_org());
