import { asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { auditEvents, fitAssessments, proofContracts, sharingConsents } from "@/db/schema";
import { tenantOf } from "@/lib/auth/actor";
import { withSystem, withTenant } from "@/lib/db/client";
import { ORG } from "@/lib/demo/fixtures";
import { runDemoScenario } from "@/lib/demo/scenario";
import { demoRequirement } from "@/lib/domain/requirements";
import { computeAssessment } from "@/lib/services/assessments";
import { getOutcomeDetail } from "@/lib/services/outcomes";
import { createBuyerRequest } from "@/lib/services/requests";
import { actors, setupTestDb } from "../helpers/db";
import { OFFLINE } from "../helpers/flow";

/** The outcome-memory loop: a paid proof's result feeds every later decision the seller makes. */
describe("outcome memory loop", () => {
  let s: Awaited<ReturnType<typeof runDemoScenario>>;

  beforeAll(async () => {
    await setupTestDb();
    s = await runDemoScenario();
  });

  it("a failing run does not re-assess; a passing run re-assesses the request it was bought for", async () => {
    expect(s.run1.reassessment).toBeNull();
    expect(s.run2.reassessment?.fitStatus).toBe("CONDITIONAL_FIT");

    const versions = await withSystem((tx) =>
      tx.select().from(fitAssessments).where(eq(fitAssessments.requestId, s.first.request.id)).orderBy(asc(fitAssessments.sequence)),
    );
    expect(versions.map((v) => v.fitStatus)).toEqual(["NO_FIT", "CONDITIONAL_FIT"]);
    expect(versions[1].id).toBe(s.run2.reassessment?.assessmentId);

    const contracts = await withSystem((tx) => tx.select().from(proofContracts).where(eq(proofContracts.requestId, s.first.request.id)));
    expect(contracts).toHaveLength(1);

    const [event] = await withSystem((tx) => tx.select().from(auditEvents).where(eq(auditEvents.action, "assessment.updated_by_outcome")));
    expect(event.targetId).toBe(s.first.request.id);
    expect(event.metadataJson).toMatchObject({ triggeredByOutcomeId: s.run2.outcome.id, fitStatus: "CONDITIONAL_FIT" });
  });

  it("another buyer's request to the same seller benefits, but that buyer cannot open the record itself", async () => {
    const { otherBuyer } = await actors();
    const r = await createBuyerRequest(
      otherBuyer,
      { ...demoRequirement(ORG.lumen), title: "Aster: the same LINE → HubSpot need" },
      OFFLINE,
    );
    expect(r.assessment.fitStatus).toBe("CONDITIONAL_FIT");
    expect(r.contract).toBeNull();
    const cited = (r.assessment.citationsJson as Array<{ kind: string; sourceId: string }>).filter((c) => c.kind === "outcome");
    expect(cited.map((c) => c.sourceId)).toContain(s.run2.outcome.id);
    await expect(getOutcomeDetail(otherBuyer, s.run2.outcome.id)).rejects.toThrow(/not found/i);
  });

  it("the buyer can revoke reuse consent; the seller cannot restore it, and revoked outcomes stop counting", async () => {
    const { buyer, seller } = await actors();
    const restored = await withTenant(tenantOf(seller), (tx) =>
      tx.update(sharingConsents).set({ active: true }).where(eq(sharingConsents.organizationId, ORG.brightline)).returning(),
    );
    expect(restored).toHaveLength(0);

    const revoked = await withTenant(tenantOf(buyer), (tx) =>
      tx
        .update(sharingConsents)
        .set({ active: false, revokedAt: new Date() })
        .where(eq(sharingConsents.organizationId, ORG.brightline))
        .returning(),
    );
    expect(revoked).toHaveLength(1);

    const after = await computeAssessment(demoRequirement(ORG.lumen), ORG.lumen, OFFLINE);
    expect(after.policy.fitStatus).toBe("NO_FIT");
    expect(after.policy.proposedProof).not.toBeNull();
    expect(after.policy.outcomesConsidered.map((o) => o.reason)).toEqual([
      "reuse consent revoked by the buyer",
      "reuse consent revoked by the buyer",
    ]);

    await withTenant(tenantOf(buyer), (tx) =>
      tx.update(sharingConsents).set({ active: true, revokedAt: null }).where(eq(sharingConsents.organizationId, ORG.brightline)),
    );
    const again = await computeAssessment(demoRequirement(ORG.lumen), ORG.lumen, OFFLINE);
    expect(again.policy.fitStatus).toBe("CONDITIONAL_FIT");
  });

  it("evidence expires: after its 90-day TTL the decision falls back and a new proof is offered", async () => {
    const later = new Date(Date.now() + 91 * 86_400_000);
    const r = await computeAssessment(demoRequirement(ORG.lumen), ORG.lumen, { ...OFFLINE, now: later });
    expect(r.policy.fitStatus).toBe("NO_FIT");
    expect(r.policy.proposedProof).not.toBeNull();
    expect(r.policy.outcomesConsidered.every((o) => o.reason === "expired evidence")).toBe(true);
  });

  it("a different seller never sees this seller's outcomes", async () => {
    const r = await computeAssessment(demoRequirement(ORG.harbor), ORG.harbor, OFFLINE);
    expect(r.policy.outcomesConsidered).toEqual([]);
  });
});
