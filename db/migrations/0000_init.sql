CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"counterparty_organization_id" text,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"seller_organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"goal" text NOT NULL,
	"budget_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"timeline_days" integer NOT NULL,
	"tools_json" jsonb NOT NULL,
	"requirements_json" jsonb NOT NULL,
	"state" text DEFAULT 'SUBMITTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fit_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"buyer_organization_id" text NOT NULL,
	"seller_organization_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"fit_status" text NOT NULL,
	"hard_blockers_json" jsonb NOT NULL,
	"assumptions_json" jsonb NOT NULL,
	"citations_json" jsonb NOT NULL,
	"agent_output_json" jsonb NOT NULL,
	"evaluator_mode" text NOT NULL,
	"policy_version" text NOT NULL,
	"include_outcomes" boolean DEFAULT true NOT NULL,
	"input_hash" text NOT NULL,
	"override_json" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixture_provider_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"reference_id" text NOT NULL,
	"custom_id" text NOT NULL,
	"amount_value" text NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"capture_id" text,
	"capture_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"captured_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"doc_key" text NOT NULL,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"content" text NOT NULL,
	"claims_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hash" text NOT NULL,
	"version" integer NOT NULL,
	"visibility" text NOT NULL,
	"trust" text DEFAULT 'authored' NOT NULL,
	"status" text DEFAULT 'current' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"is_fictional" boolean DEFAULT true NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcome_records" (
	"id" text PRIMARY KEY NOT NULL,
	"proof_run_id" text NOT NULL,
	"request_id" text NOT NULL,
	"proof_contract_id" text NOT NULL,
	"seller_organization_id" text NOT NULL,
	"buyer_organization_id" text NOT NULL,
	"result" text NOT NULL,
	"failure_class" text,
	"tool_keys_json" jsonb NOT NULL,
	"operations_json" jsonb NOT NULL,
	"tested_versions_json" jsonb NOT NULL,
	"required_permissions_json" jsonb NOT NULL,
	"granted_permissions_json" jsonb NOT NULL,
	"conditions_json" jsonb NOT NULL,
	"limits_json" jsonb NOT NULL,
	"expected" text NOT NULL,
	"actual" text NOT NULL,
	"evidence_ids_json" jsonb NOT NULL,
	"artifact_digest" text NOT NULL,
	"verifier_type" text NOT NULL,
	"consent_json" jsonb NOT NULL,
	"payment_evidence_json" jsonb NOT NULL,
	"environment_version" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paypal_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"proof_contract_id" text NOT NULL,
	"buyer_organization_id" text NOT NULL,
	"seller_organization_id" text NOT NULL,
	"provider_mode" text NOT NULL,
	"paypal_order_id" text NOT NULL,
	"capture_id" text,
	"create_request_id" text NOT NULL,
	"capture_request_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"payment_state" text NOT NULL,
	"provider_status" text,
	"verification_json" jsonb,
	"last_error" text,
	"capture_attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paypal_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"paypal_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"verified" boolean NOT NULL,
	"verification_method" text NOT NULL,
	"payload_digest" text NOT NULL,
	"summary_json" jsonb NOT NULL,
	"paypal_order_row_id" text,
	"buyer_organization_id" text,
	"seller_organization_id" text,
	"processing_result" text DEFAULT 'RECEIVED' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"display_name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"assessment_id" text NOT NULL,
	"seller_organization_id" text NOT NULL,
	"buyer_organization_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"immutable_scope_json" jsonb NOT NULL,
	"scope_hash" text NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"max_runs" integer DEFAULT 3 NOT NULL,
	"seller_approved_by" text,
	"seller_approved_at" timestamp with time zone,
	"buyer_accepted_by" text,
	"buyer_accepted_at" timestamp with time zone,
	"buyer_accepted_scope_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"proof_contract_id" text NOT NULL,
	"buyer_organization_id" text NOT NULL,
	"seller_organization_id" text NOT NULL,
	"run_number" integer NOT NULL,
	"fixture_key" text NOT NULL,
	"executor_mode" text NOT NULL,
	"test_case" text NOT NULL,
	"environment_version" text NOT NULL,
	"environment_json" jsonb NOT NULL,
	"status" text NOT NULL,
	"failure_class" text,
	"steps_json" jsonb,
	"logs_json" jsonb,
	"evidence_json" jsonb,
	"artifact_digest" text,
	"input_fixture_hash" text NOT NULL,
	"runner_version" text NOT NULL,
	"reproduce_command" text NOT NULL,
	"queued_by" text NOT NULL,
	"queued_reason" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_capabilities" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"service_key" text NOT NULL,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"supported_tools_json" jsonb NOT NULL,
	"limitations_json" jsonb NOT NULL,
	"base_price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sharing_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"scope" text NOT NULL,
	"grantee" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "buyer_requests" ADD CONSTRAINT "buyer_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_requests" ADD CONSTRAINT "buyer_requests_seller_organization_id_organizations_id_fk" FOREIGN KEY ("seller_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fit_assessments" ADD CONSTRAINT "fit_assessments_request_id_buyer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."buyer_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_records" ADD CONSTRAINT "outcome_records_proof_run_id_proof_runs_id_fk" FOREIGN KEY ("proof_run_id") REFERENCES "public"."proof_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paypal_orders" ADD CONSTRAINT "paypal_orders_proof_contract_id_proof_contracts_id_fk" FOREIGN KEY ("proof_contract_id") REFERENCES "public"."proof_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_contracts" ADD CONSTRAINT "proof_contracts_request_id_buyer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."buyer_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_contracts" ADD CONSTRAINT "proof_contracts_assessment_id_fit_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."fit_assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_runs" ADD CONSTRAINT "proof_runs_proof_contract_id_proof_contracts_id_fk" FOREIGN KEY ("proof_contract_id") REFERENCES "public"."proof_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_capabilities" ADD CONSTRAINT "service_capabilities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_consents" ADD CONSTRAINT "sharing_consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_events_org_idx" ON "audit_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "buyer_requests_buyer_idx" ON "buyer_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "buyer_requests_seller_idx" ON "buyer_requests" USING btree ("seller_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fit_assessments_request_seq_uq" ON "fit_assessments" USING btree ("request_id","sequence");--> statement-breakpoint
CREATE INDEX "fit_assessments_buyer_idx" ON "fit_assessments" USING btree ("buyer_organization_id");--> statement-breakpoint
CREATE INDEX "fit_assessments_seller_idx" ON "fit_assessments" USING btree ("seller_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fixture_provider_orders_request_uq" ON "fixture_provider_orders" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_org_doc_version_uq" ON "knowledge_sources" USING btree ("organization_id","doc_key","version");--> statement-breakpoint
CREATE INDEX "knowledge_sources_org_idx" ON "knowledge_sources" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outcome_records_run_uq" ON "outcome_records" USING btree ("proof_run_id");--> statement-breakpoint
CREATE INDEX "outcome_records_seller_idx" ON "outcome_records" USING btree ("seller_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_orders_paypal_order_id_uq" ON "paypal_orders" USING btree ("paypal_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_orders_capture_id_uq" ON "paypal_orders" USING btree ("capture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_orders_create_request_id_uq" ON "paypal_orders" USING btree ("create_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_orders_one_capture_per_contract_uq" ON "paypal_orders" USING btree ("proof_contract_id") WHERE payment_state = 'CAPTURED';--> statement-breakpoint
CREATE INDEX "paypal_orders_contract_idx" ON "paypal_orders" USING btree ("proof_contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_webhook_events_event_id_uq" ON "paypal_webhook_events" USING btree ("paypal_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_user_id_uq" ON "profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "proof_contracts_buyer_idx" ON "proof_contracts" USING btree ("buyer_organization_id");--> statement-breakpoint
CREATE INDEX "proof_contracts_seller_idx" ON "proof_contracts" USING btree ("seller_organization_id");--> statement-breakpoint
CREATE INDEX "proof_contracts_request_idx" ON "proof_contracts" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proof_runs_contract_run_uq" ON "proof_runs" USING btree ("proof_contract_id","run_number");--> statement-breakpoint
CREATE INDEX "proof_runs_seller_idx" ON "proof_runs" USING btree ("seller_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_capabilities_org_key_version_uq" ON "service_capabilities" USING btree ("organization_id","service_key","version");--> statement-breakpoint
CREATE INDEX "service_capabilities_org_idx" ON "service_capabilities" USING btree ("organization_id");