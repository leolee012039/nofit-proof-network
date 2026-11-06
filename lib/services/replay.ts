import { eq } from "drizzle-orm";
import { buyerRequests } from "@/db/schema";
import { requireRole, tenantOf, type Actor } from "@/lib/auth/actor";
import { withTenant } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";
import { BuyerRequirementInput } from "@/lib/domain/requirements";
import type { Citation, Finding, PolicyResult } from "@/lib/policy/types";
import { computeAssessment } from "./assessments";
import { redactAssessmentForBuyer } from "./requests";

export interface FindingChange {
  code: string;
  title: string;
  from: Finding["severity"] | "absent";
  to: Finding["severity"] | "absent";
  verifiedByOutcomeIds: string[];
}

export interface DecisionDiff {
  statusChanged: boolean;
  from: PolicyResult["fitStatus"];
  to: PolicyResult["fitStatus"];
  findingChanges: FindingChange[];
  addedEvidence: Citation[];
  reasonCodesAdded: string[];
  reasonCodesRemoved: string[];
  proofOfferChanged: boolean;
  drivingOutcomeIds: string[];
}

export function diffDecisions(baseline: PolicyResult, after: PolicyResult): DecisionDiff {
  const key = (f: Finding) => `${f.code}|${f.tool ?? ""}`;
  const keys = new Set([...baseline.findings.map(key), ...after.findings.map(key)]);
  const findingChanges: FindingChange[] = [];
  for (const k of keys) {
    const b = baseline.findings.find((f) => key(f) === k);
    const a = after.findings.find((f) => key(f) === k);
    if (b?.severity === a?.severity) continue;
    findingChanges.push({
      code: (a ?? b)!.code,
      title: (a ?? b)!.title,
      from: b?.severity ?? "absent",
      to: a?.severity ?? "absent",
      verifiedByOutcomeIds: a?.verifiedByOutcomeIds ?? [],
    });
  }
  const baseSources = new Set(baseline.citations.map((c) => `${c.kind}:${c.sourceId}`));
  const addedEvidence = after.citations.filter((c) => !baseSources.has(`${c.kind}:${c.sourceId}`));
  return {
    statusChanged: baseline.fitStatus !== after.fitStatus,
    from: baseline.fitStatus,
    to: after.fitStatus,
    findingChanges,
    addedEvidence,
    reasonCodesAdded: after.reasonCodes.filter((r) => !baseline.reasonCodes.includes(r)),
    reasonCodesRemoved: baseline.reasonCodes.filter((r) => !after.reasonCodes.includes(r)),
    proofOfferChanged: Boolean(baseline.proposedProof) !== Boolean(after.proposedProof),
    drivingOutcomeIds: [...new Set(findingChanges.flatMap((c) => c.verifiedByOutcomeIds))],
  };
}

/**
 * Decision replay: the same request evaluated (a) without outcome memory and
 * (b) with every authorized, integrity-checked outcome record. Offline
 * narrative only, so the comparison is deterministic and makes no model calls.
 */
export async function replayDecision(actorIn: Actor | null, requestId: string, now = new Date()) {
  const actor = requireRole(actorIn, ["buyer", "seller_admin", "reviewer"]);
  const request = await withTenant(tenantOf(actor), async (tx) => {
    const [r] = await tx.select().from(buyerRequests).where(eq(buyerRequests.id, requestId));
    return r;
  });
  if (!request) throw new AppError("NOT_FOUND", "Request not found.");
  const requirement = BuyerRequirementInput.parse(request.requirementsJson);
  const offline = { kind: "offline-fixture", reason: "replay" } as const;
  const baseline = await computeAssessment(requirement, request.sellerOrganizationId, { includeOutcomes: false, now, aiMode: offline });
  const after = await computeAssessment(requirement, request.sellerOrganizationId, { includeOutcomes: true, now, aiMode: offline });
  const isBuyer = actor.orgRole === "buyer";
  const diff = diffDecisions(baseline.policy, after.policy);
  if (isBuyer) {
    diff.addedEvidence = diff.addedEvidence.map((c) =>
      c.visibility === "seller_internal" ? { ...c, excerpt: "[Internal seller source — excerpt withheld from buyer view]" } : c,
    );
  }
  return {
    request,
    baseline: isBuyer ? redactAssessmentForBuyer(baseline.assessment) : baseline.assessment,
    after: isBuyer ? redactAssessmentForBuyer(after.assessment) : after.assessment,
    diff,
    outcomesConsidered: after.policy.outcomesConsidered,
  };
}
