ALTER TABLE "organizations" ADD COLUMN "paypal_merchant_id" text;--> statement-breakpoint
-- Seller payout account (2026-11-06). A seller names the PayPal merchant account that
-- receives its proof payments; orders name it as payee and capture verification
-- checks it. PayPal merchant (payer) IDs are 13 upper-case letters and digits.
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_paypal_merchant_id_format"
  CHECK ("paypal_merchant_id" IS NULL OR "paypal_merchant_id" ~ '^[A-Z0-9]{13}$');--> statement-breakpoint
-- An organization's own writers may set only this column, and only on their own row.
GRANT UPDATE ("paypal_merchant_id") ON organizations TO app_tenant;--> statement-breakpoint
CREATE POLICY organizations_own_payout_update ON organizations FOR UPDATE TO app_tenant
  USING (id = app_org() AND app_can_write())
  WITH CHECK (id = app_org() AND app_can_write());
