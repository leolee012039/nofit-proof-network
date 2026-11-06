import { desc, eq, inArray } from "drizzle-orm";
import { organizations, outcomeRecords, proofRuns } from "@/db/schema";
import { requireRole, tenantOf, type Actor } from "@/lib/auth/actor";
import { withTenant } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";
import { evidenceDigest, type ProofEvidence } from "@/lib/proofs/runner";

export interface OutcomeFilters {
  result?: string;
  failureClass?: string;
  version?: string;
  freshness?: "current" | "expired";
}

export function outcomeFreshness(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() > now.getTime() ? "current" : "expired";
}

export async function listOutcomes(actorIn: Actor | null, filters: OutcomeFilters = {}, now = new Date()) {
  const actor = requireRole(actorIn, ["buyer", "seller_admin", "reviewer"]);
  return withTenant(tenantOf(actor), async (tx) => {
    const rows = await tx.select().from(outcomeRecords).orderBy(desc(outcomeRecords.createdAt));
    const orgIds = [...new Set(rows.flatMap((r) => [r.buyerOrganizationId, r.sellerOrganizationId]))];
    const orgs = orgIds.length ? await tx.select().from(organizations).where(inArray(organizations.id, orgIds)) : [];
    return rows
      .filter((r) => !filters.result || r.result === filters.result)
      .filter((r) => !filters.failureClass || (r.failureClass ?? "NONE") === filters.failureClass)
      .filter((r) => !filters.version || (r.testedVersionsJson as Record<string, string>).hubspot === filters.version)
      .filter((r) => !filters.freshness || outcomeFreshness(r.expiresAt, now) === filters.freshness)
      .map((r) => ({
        outcome: r,
        freshness: outcomeFreshness(r.expiresAt, now),
        buyerName: orgs.find((o) => o.id === r.buyerOrganizationId)?.name ?? "",
        sellerName: orgs.find((o) => o.id === r.sellerOrganizationId)?.name ?? "",
      }));
  });
}

export async function getOutcomeDetail(actorIn: Actor | null, outcomeId: string, now = new Date()) {
  const actor = requireRole(actorIn, ["buyer", "seller_admin", "reviewer"]);
  return withTenant(tenantOf(actor), async (tx) => {
    const [outcome] = await tx.select().from(outcomeRecords).where(eq(outcomeRecords.id, outcomeId));
    if (!outcome) throw new AppError("NOT_FOUND", "Outcome record not found.");
    const [run] = await tx.select().from(proofRuns).where(eq(proofRuns.id, outcome.proofRunId));
    const evidence = (run?.evidenceJson ?? null) as ProofEvidence | null;
    const recomputed = evidence ? evidenceDigest(evidence) : null;
    return {
      outcome,
      run,
      evidence,
      integrity: recomputed === outcome.artifactDigest ? ("valid" as const) : ("invalid" as const),
      recomputedDigest: recomputed,
      freshness: outcomeFreshness(outcome.expiresAt, now),
    };
  });
}
