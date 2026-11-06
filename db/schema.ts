import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/*
 * Tenant isolation: every tenant-owned table carries the organization columns
 * that Postgres row-level security policies (db/migrations/*_rls.sql) check
 * against `app.org_id`. Money is always integer minor units.
 */

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").$type<"buyer" | "seller">().notNull(),
  isFictional: boolean("is_fictional").notNull().default(true),
  description: text("description").notNull().default(""),
  /** Seller's PayPal merchant (payer) ID: proof payments name it as payee and are verified against it. */
  paypalMerchantId: text("paypal_merchant_id"),
  createdAt: createdAt(),
});

export const profiles = pgTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role").$type<"buyer" | "seller_admin" | "reviewer">().notNull(),
    displayName: text("display_name").notNull(),
    title: text("title").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("profiles_user_id_uq").on(t.userId), index("profiles_org_idx").on(t.organizationId)],
);

export const serviceCapabilities = pgTable(
  "service_capabilities",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    serviceKey: text("service_key").notNull(),
    kind: text("kind").$type<"implementation" | "feasibility_proof">().notNull(),
    displayName: text("display_name").notNull(),
    supportedToolsJson: jsonb("supported_tools_json").notNull(),
    limitationsJson: jsonb("limitations_json").notNull(),
    basePriceMinor: integer("base_price_minor").notNull(),
    currency: text("currency").notNull(),
    version: integer("version").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("service_capabilities_org_key_version_uq").on(t.organizationId, t.serviceKey, t.version),
    index("service_capabilities_org_idx").on(t.organizationId),
  ],
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    docKey: text("doc_key").notNull(),
    title: text("title").notNull(),
    sourceType: text("source_type").$type<"policy" | "connector_note" | "offering" | "uploaded_document">().notNull(),
    content: text("content").notNull(),
    claimsJson: jsonb("claims_json")
      .notNull()
      .default(sql`'{}'::jsonb`),
    tagsJson: jsonb("tags_json")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    hash: text("hash").notNull(),
    version: integer("version").notNull(),
    visibility: text("visibility").$type<"buyer_visible" | "seller_internal">().notNull(),
    trust: text("trust").$type<"authored" | "untrusted_upload">().notNull().default("authored"),
    status: text("status").$type<"current" | "superseded">().notNull().default("current"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("knowledge_sources_org_doc_version_uq").on(t.organizationId, t.docKey, t.version),
    index("knowledge_sources_org_idx").on(t.organizationId),
  ],
);

export const buyerRequests = pgTable(
  "buyer_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    sellerOrganizationId: text("seller_organization_id")
      .notNull()
      .references(() => organizations.id),
    createdBy: text("created_by").notNull(),
    title: text("title").notNull(),
    goal: text("goal").notNull(),
    budgetMinor: integer("budget_minor").notNull(),
    currency: text("currency").notNull(),
    timelineDays: integer("timeline_days").notNull(),
    toolsJson: jsonb("tools_json").notNull(),
    requirementsJson: jsonb("requirements_json").notNull(),
    state: text("state").$type<"SUBMITTED" | "ASSESSED" | "CONTRACT_PROPOSED" | "CLOSED">().notNull().default("SUBMITTED"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("buyer_requests_buyer_idx").on(t.organizationId), index("buyer_requests_seller_idx").on(t.sellerOrganizationId)],
);

export const fitAssessments = pgTable(
  "fit_assessments",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => buyerRequests.id),
    buyerOrganizationId: text("buyer_organization_id").notNull(),
    sellerOrganizationId: text("seller_organization_id").notNull(),
    sequence: integer("sequence").notNull(),
    fitStatus: text("fit_status").notNull(),
    hardBlockersJson: jsonb("hard_blockers_json").notNull(),
    assumptionsJson: jsonb("assumptions_json").notNull(),
    citationsJson: jsonb("citations_json").notNull(),
    agentOutputJson: jsonb("agent_output_json").notNull(),
    evaluatorMode: text("evaluator_mode").notNull(),
    policyVersion: text("policy_version").notNull(),
    includeOutcomes: boolean("include_outcomes").notNull().default(true),
    inputHash: text("input_hash").notNull(),
    overrideJson: jsonb("override_json"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("fit_assessments_request_seq_uq").on(t.requestId, t.sequence),
    index("fit_assessments_buyer_idx").on(t.buyerOrganizationId),
    index("fit_assessments_seller_idx").on(t.sellerOrganizationId),
  ],
);

export const proofContracts = pgTable(
  "proof_contracts",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => buyerRequests.id),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => fitAssessments.id),
    sellerOrganizationId: text("seller_organization_id").notNull(),
    buyerOrganizationId: text("buyer_organization_id").notNull(),
    capabilityId: text("capability_id").notNull(),
    version: integer("version").notNull().default(1),
    immutableScopeJson: jsonb("immutable_scope_json").notNull(),
    scopeHash: text("scope_hash").notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    maxRuns: integer("max_runs").notNull().default(3),
    sellerApprovedBy: text("seller_approved_by"),
    sellerApprovedAt: timestamp("seller_approved_at", { withTimezone: true }),
    buyerAcceptedBy: text("buyer_accepted_by"),
    buyerAcceptedAt: timestamp("buyer_accepted_at", { withTimezone: true }),
    buyerAcceptedScopeHash: text("buyer_accepted_scope_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("proof_contracts_buyer_idx").on(t.buyerOrganizationId),
    index("proof_contracts_seller_idx").on(t.sellerOrganizationId),
    index("proof_contracts_request_idx").on(t.requestId),
    index("proof_contracts_assessment_idx").on(t.assessmentId),
    // One open contract per request: concurrent assessments can never propose two.
    uniqueIndex("proof_contracts_one_open_per_request_uq")
      .on(t.requestId)
      .where(sql`status <> 'CANCELLED'`),
    check("proof_contracts_price_positive", sql`${t.priceMinor} > 0`),
    check("proof_contracts_max_runs_range", sql`${t.maxRuns} between 1 and 5`),
  ],
);

export const paypalOrders = pgTable(
  "paypal_orders",
  {
    id: text("id").primaryKey(),
    proofContractId: text("proof_contract_id")
      .notNull()
      .references(() => proofContracts.id),
    buyerOrganizationId: text("buyer_organization_id").notNull(),
    sellerOrganizationId: text("seller_organization_id").notNull(),
    providerMode: text("provider_mode").$type<"sandbox" | "fixture">().notNull(),
    paypalOrderId: text("paypal_order_id").notNull(),
    captureId: text("capture_id"),
    createRequestId: text("create_request_id").notNull(),
    captureRequestId: text("capture_request_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    /** The payee named on the provider order at creation; capture verification checks against it. */
    payeeMerchantId: text("payee_merchant_id"),
    paymentState: text("payment_state").notNull(),
    providerStatus: text("provider_status"),
    verificationJson: jsonb("verification_json"),
    lastError: text("last_error"),
    captureAttempts: integer("capture_attempts").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("paypal_orders_paypal_order_id_uq").on(t.paypalOrderId),
    uniqueIndex("paypal_orders_capture_id_uq").on(t.captureId),
    uniqueIndex("paypal_orders_create_request_id_uq").on(t.createRequestId),
    // At most one live (payable, in-flight or captured) order per proof contract:
    // a second order can never be approved and captured in parallel.
    uniqueIndex("paypal_orders_one_live_order_per_contract_uq")
      .on(t.proofContractId)
      .where(sql`payment_state in ('CREATED', 'APPROVED', 'CAPTURING', 'CAPTURED', 'CAPTURE_PENDING', 'CAPTURE_UNKNOWN')`),
    index("paypal_orders_contract_idx").on(t.proofContractId),
    index("paypal_orders_buyer_idx").on(t.buyerOrganizationId),
    index("paypal_orders_seller_idx").on(t.sellerOrganizationId),
    check("paypal_orders_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

export const paypalWebhookEvents = pgTable(
  "paypal_webhook_events",
  {
    id: text("id").primaryKey(),
    paypalEventId: text("paypal_event_id").notNull(),
    eventType: text("event_type").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    verified: boolean("verified").notNull(),
    verificationMethod: text("verification_method").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    summaryJson: jsonb("summary_json").notNull(),
    paypalOrderRowId: text("paypal_order_row_id"),
    buyerOrganizationId: text("buyer_organization_id"),
    sellerOrganizationId: text("seller_organization_id"),
    processingResult: text("processing_result").notNull().default("RECEIVED"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("paypal_webhook_events_event_id_uq").on(t.paypalEventId),
    index("paypal_webhook_events_order_row_idx").on(t.paypalOrderRowId),
    index("paypal_webhook_events_buyer_idx").on(t.buyerOrganizationId),
    index("paypal_webhook_events_seller_idx").on(t.sellerOrganizationId),
  ],
);

export const proofRuns = pgTable(
  "proof_runs",
  {
    id: text("id").primaryKey(),
    proofContractId: text("proof_contract_id")
      .notNull()
      .references(() => proofContracts.id),
    buyerOrganizationId: text("buyer_organization_id").notNull(),
    sellerOrganizationId: text("seller_organization_id").notNull(),
    runNumber: integer("run_number").notNull(),
    fixtureKey: text("fixture_key").notNull(),
    executorMode: text("executor_mode").notNull(),
    testCase: text("test_case").notNull(),
    environmentVersion: text("environment_version").notNull(),
    environmentJson: jsonb("environment_json").notNull(),
    status: text("status").notNull(),
    failureClass: text("failure_class"),
    stepsJson: jsonb("steps_json"),
    logsJson: jsonb("logs_json"),
    evidenceJson: jsonb("evidence_json"),
    artifactDigest: text("artifact_digest"),
    inputFixtureHash: text("input_fixture_hash").notNull(),
    runnerVersion: text("runner_version").notNull(),
    reproduceCommand: text("reproduce_command").notNull(),
    queuedBy: text("queued_by").notNull(),
    queuedReason: text("queued_reason").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("proof_runs_contract_run_uq").on(t.proofContractId, t.runNumber),
    index("proof_runs_seller_idx").on(t.sellerOrganizationId),
    index("proof_runs_buyer_idx").on(t.buyerOrganizationId),
  ],
);

export const outcomeRecords = pgTable(
  "outcome_records",
  {
    id: text("id").primaryKey(),
    proofRunId: text("proof_run_id")
      .notNull()
      .references(() => proofRuns.id),
    requestId: text("request_id").notNull(),
    proofContractId: text("proof_contract_id").notNull(),
    sellerOrganizationId: text("seller_organization_id").notNull(),
    buyerOrganizationId: text("buyer_organization_id").notNull(),
    result: text("result").$type<"PASS" | "FAIL" | "INCONCLUSIVE">().notNull(),
    failureClass: text("failure_class"),
    toolKeysJson: jsonb("tool_keys_json").$type<string[]>().notNull(),
    operationsJson: jsonb("operations_json").$type<string[]>().notNull(),
    testedVersionsJson: jsonb("tested_versions_json").notNull(),
    requiredPermissionsJson: jsonb("required_permissions_json").notNull(),
    grantedPermissionsJson: jsonb("granted_permissions_json").notNull(),
    conditionsJson: jsonb("conditions_json").notNull(),
    limitsJson: jsonb("limits_json").notNull(),
    expected: text("expected").notNull(),
    actual: text("actual").notNull(),
    evidenceIdsJson: jsonb("evidence_ids_json").notNull(),
    artifactDigest: text("artifact_digest").notNull(),
    verifierType: text("verifier_type").notNull(),
    consentJson: jsonb("consent_json").notNull(),
    paymentEvidenceJson: jsonb("payment_evidence_json").notNull(),
    environmentVersion: text("environment_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("outcome_records_run_uq").on(t.proofRunId),
    index("outcome_records_seller_idx").on(t.sellerOrganizationId),
    index("outcome_records_buyer_idx").on(t.buyerOrganizationId),
    index("outcome_records_contract_idx").on(t.proofContractId),
    index("outcome_records_request_idx").on(t.requestId),
  ],
);

export const sharingConsents = pgTable("sharing_consents", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  scope: text("scope").notNull(),
  grantee: text("grantee").notNull(),
  active: boolean("active").notNull().default(true),
  grantedBy: text("granted_by").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    counterpartyOrganizationId: text("counterparty_organization_id"),
    actorId: text("actor_id").notNull(),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadataJson: jsonb("metadata_json")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_events_target_idx").on(t.targetType, t.targetId),
    // Timelines query by target id alone (inArray), which the (type, id) index cannot serve.
    index("audit_events_target_id_idx").on(t.targetId),
    index("audit_events_org_idx").on(t.organizationId),
    index("audit_events_counterparty_idx").on(t.counterpartyOrganizationId),
  ],
);

/**
 * Offline FIXTURE payment provider state. This plays the role PayPal's servers
 * play in sandbox mode so the capture/verification code path is identical.
 * Never readable by tenant sessions; never labelled as a PayPal transaction.
 */
export const fixtureProviderOrders = pgTable(
  "fixture_provider_orders",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    referenceId: text("reference_id").notNull(),
    customId: text("custom_id").notNull(),
    amountValue: text("amount_value").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    captureId: text("capture_id"),
    captureRequestId: text("capture_request_id"),
    createdAt: createdAt(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("fixture_provider_orders_request_uq").on(t.requestId)],
);

export type Organization = typeof organizations.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type ServiceCapability = typeof serviceCapabilities.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type BuyerRequestRow = typeof buyerRequests.$inferSelect;
export type FitAssessmentRow = typeof fitAssessments.$inferSelect;
export type ProofContractRow = typeof proofContracts.$inferSelect;
export type PaypalOrderRow = typeof paypalOrders.$inferSelect;
export type PaypalWebhookEventRow = typeof paypalWebhookEvents.$inferSelect;
export type ProofRunRow = typeof proofRuns.$inferSelect;
export type OutcomeRecordRow = typeof outcomeRecords.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
