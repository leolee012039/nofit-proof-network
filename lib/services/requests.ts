import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  auditEvents,
  buyerRequests,
  fitAssessments,
  organizations,
  outcomeRecords,
  paypalOrders,
  paypalWebhookEvents,
  proofContracts,
  proofRuns,
  type FitAssessmentRow,
} from "@/db/schema";
import type { AgentAssessment } from "@/lib/ai/schema";
import { audit } from "@/lib/audit";
import { requireRole, tenantOf, type Actor } from "@/lib/auth/actor";
import { withTenant } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";
import { BuyerRequirementInput } from "@/lib/domain/requirements";
import { newId } from "@/lib/ids";
import { assessAndPersist, type AssessOptions } from "./assessments";

export function zodIssues(err: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return err.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

/** Saves a request and assesses it; throws if either step fails (scripts and tests). */
export async function createBuyerRequest(actorIn: Actor | null, input: unknown, opts: AssessOptions = {}) {
  const { actor, request } = await insertBuyerRequest(actorIn, input);
  const { assessment, contract } = await assessAndPersist(request, actor.userId, opts);
  return { request, assessment, contract };
}

/**
 * Route-facing submit. The saved request is never lost when the assessment step fails:
 * the buyer lands on the request page and re-runs it there instead of resubmitting a duplicate.
 */
export async function submitBuyerRequest(actorIn: Actor | null, input: unknown, opts: AssessOptions = {}) {
  const { actor, request } = await insertBuyerRequest(actorIn, input);
  try {
    const { assessment, contract } = await assessAndPersist(request, actor.userId, opts);
    return { request, assessment, contract, assessmentError: null };
  } catch (err) {
    console.error("[nofit] assessment failed after the request was saved", {
      requestId: request.id,
      error: err instanceof Error ? err.name : "unknown",
    });
    return {
      request,
      assessment: null,
      contract: null,
      assessmentError: "The request was saved, but the assessment did not finish. Re-run it.",
    };
  }
}

async function insertBuyerRequest(actorIn: Actor | null, input: unknown) {
  const actor = requireRole(actorIn, ["buyer"]);
  const parsed = BuyerRequirementInput.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", "Please fix the highlighted fields.", { issues: zodIssues(parsed.error) });
  const req = parsed.data;

  const request = await withTenant(tenantOf(actor), async (tx) => {
    const [seller] = await tx.select().from(organizations).where(eq(organizations.id, req.sellerOrganizationId));
    if (!seller || seller.role !== "seller") throw new AppError("VALIDATION", "Choose a valid seller.");
    const [row] = await tx
      .insert(buyerRequests)
      .values({
        id: newId("req"),
        organizationId: actor.orgId,
        sellerOrganizationId: seller.id,
        createdBy: actor.userId,
        title: req.title,
        goal: req.goal,
        budgetMinor: req.budgetMinor,
        currency: req.currency,
        timelineDays: req.timelineDays,
        toolsJson: req.tools,
        requirementsJson: req,
      })
      .returning();
    await audit(tx, {
      organizationId: actor.orgId,
      counterpartyOrganizationId: seller.id,
      actorId: actor.userId,
      actorRole: actor.role,
      action: "buyer_request.submitted",
      targetType: "buyer_request",
      targetId: row.id,
      metadata: { sellerOrganizationId: seller.id },
    });
    return row;
  });
  return { actor, request };
}

export async function listRequests(actorIn: Actor | null) {
  const actor = requireRole(actorIn, ["buyer", "seller_admin", "reviewer"]);
  return withTenant(tenantOf(actor), async (tx) => {
    const requests = await tx.select().from(buyerRequests).orderBy(desc(buyerRequests.createdAt));
    if (requests.length === 0) return [];
    const ids = requests.map((r) => r.id);
    const assessments = await tx.select().from(fitAssessments).where(inArray(fitAssessments.requestId, ids));
    const contracts = await tx.select().from(proofContracts).where(inArray(proofContracts.requestId, ids));
    const orgs = await tx.select().from(organizations);
    return requests.map((r) => {
      const latest = assessments.filter((a) => a.requestId === r.id).sort((a, b) => b.sequence - a.sequence)[0] ?? null;
      return {
        request: r,
        buyerName: orgs.find((o) => o.id === r.organizationId)?.name ?? r.organizationId,
        sellerName: orgs.find((o) => o.id === r.sellerOrganizationId)?.name ?? r.sellerOrganizationId,
        latestAssessment: latest ? { id: latest.id, fitStatus: latest.fitStatus, override: latest.overrideJson } : null,
        contracts: contracts.filter((c) => c.requestId === r.id).map((c) => ({ id: c.id, status: c.status })),
      };
    });
  });
}

const WITHHELD = "[Internal seller source — excerpt withheld from buyer view]";

/** Buyers never see excerpts of seller-internal sources (including injected uploads). */
export function redactAssessmentForBuyer(a: AgentAssessment): AgentAssessment {
  const internal = new Set(a.evidence_refs.filter((c) => c.visibility === "seller_internal").map((c) => c.sourceId));
  return {
    ...a,
    evidence_refs: a.evidence_refs.map((c) => (c.visibility === "seller_internal" ? { ...c, excerpt: WITHHELD } : c)),
    injection_flags: a.injection_flags.map((f) => (internal.has(f.sourceId) ? { ...f, snippet: WITHHELD } : f)),
  };
}

export function viewAssessment(row: FitAssessmentRow, actor: Actor) {
  const output = row.agentOutputJson as AgentAssessment;
  return {
    row,
    output: actor.orgRole === "buyer" ? redactAssessmentForBuyer(output) : output,
    override: row.overrideJson as null | { status: string; reason: string; byName: string; at: string; policyStatus: string },
  };
}

/** Everything about one request, visible only to its two parties (RLS-enforced). */
export async function getRequestDetail(actorIn: Actor | null, requestId: string) {
  const actor = requireRole(actorIn, ["buyer", "seller_admin", "reviewer"]);
  return withTenant(tenantOf(actor), async (tx) => {
    const [request] = await tx.select().from(buyerRequests).where(eq(buyerRequests.id, requestId));
    if (!request) throw new AppError("NOT_FOUND", "Request not found.");
    const assessments = await tx
      .select()
      .from(fitAssessments)
      .where(eq(fitAssessments.requestId, requestId))
      .orderBy(desc(fitAssessments.sequence));
    const contracts = await tx
      .select()
      .from(proofContracts)
      .where(eq(proofContracts.requestId, requestId))
      .orderBy(asc(proofContracts.createdAt));
    const contractIds = contracts.map((c) => c.id);
    const orders = contractIds.length ? await tx.select().from(paypalOrders).where(inArray(paypalOrders.proofContractId, contractIds)) : [];
    const runs = contractIds.length
      ? await tx.select().from(proofRuns).where(inArray(proofRuns.proofContractId, contractIds)).orderBy(asc(proofRuns.runNumber))
      : [];
    const outcomes = await tx.select().from(outcomeRecords).where(eq(outcomeRecords.requestId, requestId));
    const orgs = await tx
      .select()
      .from(organizations)
      .where(inArray(organizations.id, [request.organizationId, request.sellerOrganizationId]));
    const targetIds = [requestId, ...contractIds, ...orders.map((o) => o.id), ...runs.map((r) => r.id)];
    const events = await tx.select().from(auditEvents).where(inArray(auditEvents.targetId, targetIds)).orderBy(asc(auditEvents.createdAt));
    const webhooks = orders.length
      ? await tx
          .select()
          .from(paypalWebhookEvents)
          .where(
            inArray(
              paypalWebhookEvents.paypalOrderRowId,
              orders.map((o) => o.id),
            ),
          )
      : [];
    return {
      actor,
      request,
      buyerName: orgs.find((o) => o.id === request.organizationId)?.name ?? "",
      sellerName: orgs.find((o) => o.id === request.sellerOrganizationId)?.name ?? "",
      assessments: assessments.map((a) => viewAssessment(a, actor)),
      contracts,
      orders,
      runs,
      outcomes,
      events,
      webhooks,
    };
  });
}
