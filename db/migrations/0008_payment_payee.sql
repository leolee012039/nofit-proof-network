-- The payee named on the provider order when it was created (2026-11-06). Capture
-- verification checks the captured order against it, so a seller changing its payout
-- account mid-checkout cannot make a valid capture fail or a wrong payee pass.
-- Written once by the payment service; tenants have no write access to paypal_orders.
ALTER TABLE "paypal_orders" ADD COLUMN "payee_merchant_id" text;
