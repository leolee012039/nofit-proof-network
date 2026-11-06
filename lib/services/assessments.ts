import { and, desc, eq, inArray, max, ne } from "drizzle-orm";
import {
  buyerRequests,
  fitAssessments,
  knowledgeSources,
  organizations,
  outcomeRecords,
  proofContracts,
  proofRuns,
  serviceCapabilities,
  sharingConsents,
  type BuyerRequestRow,
  type FitAssessmentRow,
  type KnowledgeSource,
  type ProofContractRow,
  type ServiceCapability,
} from "@/db/schema";
import { anthropicNarrative, type AnthropicFactory } from "@/lib/ai/anthropic";
import { LIVE_MODEL_LIMIT_REASON, takeLiveModelCall } from "@/lib/ai/budget";
import { draftProofBrief, type ProofBrief } from "@/lib/ai/proof-brief";
import { offlineNarrative } from "@/lib/ai/offline";
import { composeAssessment, sanitizeNarrative, type AgentAssessment, type EvaluatorInfo } from "@/lib/ai/schema";
import { audit } from "@/lib/audit";
import { requireRole, tenantOf, type Actor } from "@/lib/auth/actor";
import { getAiMode, type AiMode } from "@/lib/config";
import { sha256Canonical } from "@/lib/crypto";
import { withTenant, type Tx } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";
import { BuyerRequirementInput, type BuyerRequirement } from "@/lib/domain/requirements";
import { FIT_STATUSES, type FitStatus } from "@/lib/domain/states";
import { newId } from "@/lib/ids";
import { evaluatePolicy } from "@/lib/policy/engine";
import { OUTCOME_REUSE_SCOPE, type OutcomeEvidence, type PolicyResult } from "@/lib/policy/types";
import { evidenceDigest, type ProofEvidence } from "@/lib/proofs/runner";

export const SYSTEM_AGENT_ID = "agent:fit-engine";

export interface AssessOptions {
  includeOutcomes?: boolean;
  now?: Date;
  aiMode?: AiMode;
  anthropicFactory?: AnthropicFactory;
  /** Set when new outcome evidence (not a person) triggered this assessment; recorded in the audit trail. */
  trigger?: { outcomeId: string };
  /** Also draft the buyer-facing proof brief (only worth a model call when a new contract will be proposed). */
  withProofBrief?: boolean;
}

interface SellerContext {
  implementation: ServiceCapability | null;
  proofOffering: ServiceCapability | null;
  sources: KnowledgeSource[];
  outcomes: OutcomeEvidence[];
}

function latest<T extends { version: number }>(rows: T[]): T | null {
  return rows.reduce<T | null>((best, r) => (!best || r.version > best.version ? r : best), null);
}

/**
 * Buyer organizations that revoked outcome reuse for this seller: they hold an
 * inactive consent row and no active one. No row at all leaves the consent the
 * buyer gave when it accepted the contract in force.
 */
async function revokedReuseConsents(tx: Tx, sellerOrgId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ organizationId: sharingConsents.organizationId, active: sharingConsents.active })
    .from(sharingConsents)
    .where(and(eq(sharingConsents.grantee, sellerOrgId), eq(sharingConsents.scope, OUTCOME_REUSE_SCOPE)));
  const active = new Set(rows.filter((r) => r.active).map((r) => r.organizationId));
  return new Set(rows.filter((r) => !r.active && !active.has(r.organizationId)).map((r) => r.organizationId));
}

/** Outcome records visible to the seller, with evidence integrity and reuse consent re-verified. */
export async function loadOutcomeEvidence(tx: Tx, sellerOrgId: string): Promise<OutcomeEvidence[]> {
  const rows = await tx
    .select({ o: outcomeRecords, evidence: proofRuns.evidenceJson, runDigest: proofRuns.artifactDigest })
    .from(outcomeRecords)
    .innerJoin(proofRuns, eq(proofRuns.id, outcomeRecords.proofRunId))
    .where(eq(outcomeRecords.sellerOrganizationId, sellerOrgId));
  const revoked = await revokedReuseConsents(tx, sellerOrgId);
  return rows.map(({ o, evidence, runDigest }) => {
    const recomputed = evidence ? evidenceDigest(evidence as ProofEvidence) : null;
    const valid = recomputed !== null && recomputed === o.artifactDigest && runDigest === o.artifactDigest;
    const consented = (o.consentJson as { scope?: string } | null)?.scope === OUTCOME_REUSE_SCOPE;
    return {
      id: o.id,
      proofRunId: o.proofRunId,
      result: o.result,
      failureClass: o.failureClass,
      toolKeys: o.toolKeysJson,
      operations: o.operationsJson,
      testedVersions: o.testedVersionsJson as Record<string, string>,
      grantedPermissions: o.grantedPermissionsJson as string[],
      conditions: o.conditionsJson as { approvalWorkflow?: boolean },
      artifactDigest: o.artifactDigest,
      integrity: valid ? "valid" : "invalid",
      consent: !consented ? "missing" : revoked.has(o.buyerOrganizationId) ? "revoked" : "granted",
      expiresAt: o.expiresAt,
      environmentVersion: o.environmentVersion,
      createdAt: o.createdAt,
    };
  });
}

/** The System Agent reads only the seller tenant's own knowledge (enforced by RLS). */
async function loadSellerContext(sellerOrgId: string, includeOutcomes: boolean): Promise<SellerContext> {
  return withTenant({ orgId: sellerOrgId, userId: SYSTEM_AGENT_ID, role: "system_agent" }, async (tx) => {
    const caps = await tx
      .select()
      .from(serviceCapabilities)
      .where(and(eq(serviceCapabilities.organizationId, sellerOrgId), eq(serviceCapabilities.active, true)));
    const sources = await tx.select().from(knowledgeSources).where(eq(knowledgeSources.organizationId, sellerOrgId));
    return {
      implementation: latest(caps.filter((c) => c.kind === "implementation")),
      proofOffering: latest(caps.filter((c) => c.kind === "feasibility_proof")),
      sources,
      outcomes: includeOutcomes ? await loadOutcomeEvidence(tx, sellerOrgId) : [],
    };
  });
}

/** Deterministic policy + narrative (live model if configured, offline otherwise), plus the proof brief when asked. */
export async function computeAssessment(
  requirement: BuyerRequirement,
  sellerOrgId: string,
  opts: AssessOptions = {},
): Promise<{ policy: PolicyResult; assessment: AgentAssessment; proofBrief: ProofBrief | null }> {
  const ctx = await loadSellerContext(sellerOrgId, opts.includeOutcomes ?? true);
  const policy = evaluatePolicy({ requirement, ...ctx, now: opts.now ?? new Date() });
  const aiMode = opts.aiMode ?? getAiMode();
  // Both model calls depend only on the policy result, so they run side by side.
  const [{ narrative, evaluator }, proofBrief] = await Promise.all([
    explain(requirement, policy, aiMode, opts.anthropicFactory),
    opts.withProofBrief && policy.proposedProof
      ? draftProofBrief({ requirement, policy }, { aiMode, anthropicFactory: opts.anthropicFactory })
      : Promise.resolve(null),
  ]);
  return { policy, assessment: composeAssessment(policy, sanitizeNarrative(narrative), evaluator), proofBrief };
}

async function explain(requirement: BuyerRequirement, policy: PolicyResult, aiMode: AiMode, factory?: AnthropicFactory) {
  let narrative = offlineNarrative(policy);
  let evaluator: EvaluatorInfo = {
    mode: "offline-fixture",
    label: "Offline deterministic evaluator — no language model was called",
  };
  if (aiMode.kind === "anthropic" && !takeLiveModelCall()) {
    evaluator = {
      mode: "offline-fixture",
      label: "Offline deterministic evaluator (live model call limit reached)",
      fallbackReason: LIVE_MODEL_LIMIT_REASON,
    };
  } else if (aiMode.kind === "anthropic") {
    try {
      const docs = policy.citations.map((c) => ({ ref: c.ref, title: c.title, version: c.version, trust: c.trust, excerpt: c.excerpt }));
      const live = await anthropicNarrative({ apiKey: aiMode.apiKey, model: aiMode.model, factory }, requirement, policy, docs);
      narrative = live.narrative;
      evaluator = {
        mode: "live",
        provider: "anthropic",
        model: live.model,
        label: `Live model (${live.model}) explanation; decision by deterministic policy`,
      };
    } catch (err) {
      const fallbackReason = err instanceof Error ? err.message.slice(0, 200) : "unknown error";
      // Visible to operators too, not only on the report: a silent fallback would hide an expired key or outage.
      console.warn("[nofit] AI narrative fell back to the offline evaluator", { model: aiMode.model, reason: fallbackReason });
      evaluator = {
        mode: "offline-fixture",
        label: "Offline deterministic evaluator (live model unavailable)",
        fallbackReason,
      };
    }
  }
  return { narrative, evaluator };
}

export function buildContractScope(args: {
  request: BuyerRequestRow;
  assessmentId: string;
  fitStatus: FitStatus;
  proof: NonNullable<PolicyResult["proposedProof"]>;
  proofBrief?: ProofBrief | null;
  buyerName: string;
  sellerName: string;
}) {
  return {
    contractTitle: args.proof.title,
    // Sealed with the rest of the scope: the seller approves, and the buyer accepts, this exact wording.
    ...(args.proofBrief ? { proofBrief: args.proofBrief } : {}),
    requestId: args.request.id,
    requestTitle: args.request.title,
    assessmentId: args.assessmentId,
    assessmentFitStatus: args.fitStatus,
    buyerOrganization: { id: args.request.organizationId, name: args.buyerName },
    sellerOrganization: { id: args.request.sellerOrganizationId, name: args.sellerName },
    proof: args.proof,
    paymentTerms:
      "Fixed price paid through PayPal Sandbox (test money only). The payment pays for running the bounded test. It is not escrow, it is not conditional on the result, and refunds are not automatic.",
    consent:
      "The buyer consents to the seller running the simulated test described here and to the seller reusing the resulting outcome record in future assessments.",
    demoNotice: "Fictional demo data. PayPal Sandbox only. No real money.",
  };
}

/** Runs and persists an assessment; proposes (never approves) a proof contract. */
export async function assessAndPersist(
  request: BuyerRequestRow,
  triggeredBy: string,
  opts: AssessOptions = {},
): Promise<{ assessment: FitAssessmentRow; contract: ProofContractRow | null }> {
  const requirement = BuyerRequirementInput.parse(request.requirementsJson);
  const tenant = { orgId: request.sellerOrganizationId, userId: SYSTEM_AGENT_ID, role: "system_agent" as const };
  // A brief costs a model call, so draft one only when this assessment can open a new contract.
  const openBefore = await withTenant(tenant, (tx) =>
    tx
      .select({ id: proofContracts.id })
      .from(proofContracts)
      .where(and(eq(proofContracts.requestId, request.id), ne(proofContracts.status, "CANCELLED")))
      .limit(1),
  );
  const { policy, assessment, proofBrief } = await computeAssessment(requirement, request.sellerOrganizationId, {
    ...opts,
    withProofBrief: openBefore.length === 0,
  });

  return withTenant(tenant, async (tx) => {
    // Serialize concurrent assessments of the same request (sequence number + "one open contract" check).
    const [locked] = await tx.select({ id: buyerRequests.id }).from(buyerRequests).where(eq(buyerRequests.id, request.id)).for("update");
    if (!locked) throw new AppError("NOT_FOUND", "Request not found.");
    // Query builder (not raw .rows) so this works on both PGlite and postgres-js.
    const [{ last }] = await tx
      .select({ last: max(fitAssessments.sequence) })
      .from(fitAssessments)
      .where(eq(fitAssessments.requestId, request.id));
    const next = (last ?? 0) + 1;
    const [row] = await tx
      .insert(fitAssessments)
      .values({
        id: newId("fa"),
        requestId: request.id,
        buyerOrganizationId: request.organizationId,
        sellerOrganizationId: request.sellerOrganizationId,
        sequence: next,
        fitStatus: assessment.fit_status,
        hardBlockersJson: assessment.hard_blockers,
        assumptionsJson: assessment.assumptions,
        citationsJson: assessment.evidence_refs,
        agentOutputJson: assessment,
        evaluatorMode: assessment.evaluator.mode === "live" ? `live:anthropic:${assessment.evaluator.model}` : "offline-fixture",
        policyVersion: policy.policyVersion,
        includeOutcomes: opts.includeOutcomes ?? true,
        inputHash: sha256Canonical(requirement),
        createdBy: triggeredBy,
      })
      .returning();

    await audit(tx, {
      organizationId: request.sellerOrganizationId,
      counterpartyOrganizationId: request.organizationId,
      actorId: SYSTEM_AGENT_ID,
      actorRole: "system_agent",
      action: opts.trigger ? "assessment.updated_by_outcome" : "assessment.created",
      targetType: "buyer_request",
      targetId: request.id,
      metadata: {
        assessmentId: row.id,
        fitStatus: row.fitStatus,
        evaluator: row.evaluatorMode,
        reasonCodes: policy.reasonCodes,
        ...(opts.trigger ? { triggeredByOutcomeId: opts.trigger.outcomeId } : {}),
      },
    });

    let contract: ProofContractRow | null = null;
    const open = await tx
      .select({ id: proofContracts.id })
      .from(proofContracts)
      .where(and(eq(proofContracts.requestId, request.id), ne(proofContracts.status, "CANCELLED")));
    if (policy.proposedProof && open.length === 0) {
      const orgs = await tx
        .select()
        .from(organizations)
        .where(inArray(organizations.id, [request.organizationId, request.sellerOrganizationId]));
      const name = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;
      const scope = buildContractScope({
        request,
        assessmentId: row.id,
        fitStatus: assessment.fit_status,
        proof: policy.proposedProof,
        proofBrief,
        buyerName: name(request.organizationId),
        sellerName: name(request.sellerOrganizationId),
      });
      [contract] = await tx
        .insert(proofContracts)
        .values({
          id: newId("pc"),
          requestId: request.id,
          assessmentId: row.id,
          sellerOrganizationId: request.sellerOrganizationId,
          buyerOrganizationId: request.organizationId,
          capabilityId: policy.proposedProof.capabilityId,
          immutableScopeJson: scope,
          scopeHash: sha256Canonical(scope),
          priceMinor: policy.proposedProof.priceMinor,
          currency: policy.proposedProof.currency,
          status: "PROPOSED",
          maxRuns: policy.proposedProof.maxRuns,
        })
        .returning();
      await audit(tx, {
        organizationId: request.sellerOrganizationId,
        counterpartyOrganizationId: request.organizationId,
        actorId: SYSTEM_AGENT_ID,
        actorRole: "system_agent",
        action: "proof_contract.proposed",
        targetType: "proof_contract",
        targetId: contract.id,
        metadata: { priceMinor: contract.priceMinor, currency: contract.currency, scopeHash: contract.scopeHash },
      });
    }

    await tx
      .update(buyerRequests)
      .set({ state: contract || open.length ? "CONTRACT_PROPOSED" : "ASSESSED", updatedAt: new Date() })
      .where(eq(buyerRequests.id, request.id));

    return { assessment: row, contract };
  });
}

/** Seller re-runs the assessment (e.g. after new outcome evidence). */
export async function reassessRequest(actorIn: Actor | null, requestId: string, opts: AssessOptions = {}) {
  const actor = requireRole(actorIn, ["seller_admin", "buyer"]);
  const request = await withTenant(tenantOf(actor), async (tx) => {
    const [r] = await tx.select().from(buyerRequests).where(eq(buyerRequests.id, requestId));
    return r;
  });
  if (!request) throw new AppError("NOT_FOUND", "Request not found.");
  return assessAndPersist(request, actor.userId, opts);
}

const OverrideInput = {
  parse(input: unknown): { status: FitStatus; reason: string } {
    const v = input as { status?: string; reason?: string };
    if (!v || !FIT_STATUSES.includes(v.status as FitStatus)) throw new AppError("VALIDATION", "Choose a valid fit status.");
    const reason = String(v.reason ?? "").trim();
    if (reason.length < 10 || reason.length > 1000) throw new AppError("VALIDATION", "Give a reason of 10–1000 characters.");
    return { status: v.status as FitStatus, reason };
  },
};

/** Human override of the recommendation. Recorded and labelled; hard findings stay visible. */
export async function overrideAssessment(actorIn: Actor | null, assessmentId: string, input: unknown) {
  const actor = requireRole(actorIn, ["seller_admin"]);
  const { status, reason } = OverrideInput.parse(input);
  return withTenant(tenantOf(actor), async (tx) => {
    const [a] = await tx.select().from(fitAssessments).where(eq(fitAssessments.id, assessmentId));
    if (!a) throw new AppError("NOT_FOUND", "Assessment not found.");
    if (a.sellerOrganizationId !== actor.orgId) throw new AppError("FORBIDDEN", "Only the assessing seller can override.");
    const override = {
      status,
      reason,
      by: actor.userId,
      byName: actor.displayName,
      at: new Date().toISOString(),
      policyStatus: a.fitStatus,
    };
    const [updated] = await tx.update(fitAssessments).set({ overrideJson: override }).where(eq(fitAssessments.id, a.id)).returning();
    await audit(tx, {
      organizationId: actor.orgId,
      counterpartyOrganizationId: a.buyerOrganizationId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: "assessment.overridden",
      targetType: "buyer_request",
      targetId: a.requestId,
      metadata: { assessmentId: a.id, from: a.fitStatus, to: status, reason },
    });
    return updated;
  });
}

export async function latestAssessment(tx: Tx, requestId: string) {
  const rows = await tx
    .select()
    .from(fitAssessments)
    .where(eq(fitAssessments.requestId, requestId))
    .orderBy(desc(fitAssessments.sequence))
    .limit(1);
  return rows[0] ?? null;
}
