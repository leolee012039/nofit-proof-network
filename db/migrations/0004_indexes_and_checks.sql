CREATE INDEX "audit_events_target_id_idx" ON "audit_events" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "audit_events_counterparty_idx" ON "audit_events" USING btree ("counterparty_organization_id");--> statement-breakpoint
CREATE INDEX "outcome_records_buyer_idx" ON "outcome_records" USING btree ("buyer_organization_id");--> statement-breakpoint
CREATE INDEX "outcome_records_contract_idx" ON "outcome_records" USING btree ("proof_contract_id");--> statement-breakpoint
CREATE INDEX "outcome_records_request_idx" ON "outcome_records" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "paypal_orders_buyer_idx" ON "paypal_orders" USING btree ("buyer_organization_id");--> statement-breakpoint
CREATE INDEX "paypal_orders_seller_idx" ON "paypal_orders" USING btree ("seller_organization_id");--> statement-breakpoint
CREATE INDEX "paypal_webhook_events_order_row_idx" ON "paypal_webhook_events" USING btree ("paypal_order_row_id");--> statement-breakpoint
CREATE INDEX "paypal_webhook_events_buyer_idx" ON "paypal_webhook_events" USING btree ("buyer_organization_id");--> statement-breakpoint
CREATE INDEX "paypal_webhook_events_seller_idx" ON "paypal_webhook_events" USING btree ("seller_organization_id");--> statement-breakpoint
CREATE INDEX "profiles_org_idx" ON "profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "proof_contracts_assessment_idx" ON "proof_contracts" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proof_contracts_one_open_per_request_uq" ON "proof_contracts" USING btree ("request_id") WHERE status <> 'CANCELLED';--> statement-breakpoint
CREATE INDEX "proof_runs_buyer_idx" ON "proof_runs" USING btree ("buyer_organization_id");--> statement-breakpoint
ALTER TABLE "paypal_orders" ADD CONSTRAINT "paypal_orders_amount_positive" CHECK ("paypal_orders"."amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "proof_contracts" ADD CONSTRAINT "proof_contracts_price_positive" CHECK ("proof_contracts"."price_minor" > 0);--> statement-breakpoint
ALTER TABLE "proof_contracts" ADD CONSTRAINT "proof_contracts_max_runs_range" CHECK ("proof_contracts"."max_runs" between 1 and 5);