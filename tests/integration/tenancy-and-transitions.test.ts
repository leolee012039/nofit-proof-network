import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditEvents, buyerRequests, knowledgeSources, outcomeRecords, proofContracts } from "@/db/schema";
import { tenantOf } from "@/lib/auth/actor";
import { withSystem, withTenant } from "@/lib/db/client";
import { runDemoScenario } from "@/lib/demo/scenario";
import { isAppError } from "@/lib/domain/errors";
import { overrideAssessment } from "@/lib/services/assessments";
import { acceptContract, approveContract, cancelContract, getContractDetail } from "@/lib/services/contracts";
import { getKnowledgeBase } from "@/lib/services/knowledge";
import { listOutcomes } from "@/lib/services/outcomes";
import { createPaymentOrder } from "@/lib/services/payments";
import { executeProofRun, queueRetest } from "@/lib/services/proofs";
import { createBuyerRequest, getRequestDetail, listRequests } from "@/lib/services/requests";
import { ORG } from "@/lib/demo/fixtures";
import { demoRequirement } from "@/lib/domain/requirements";
import { actors, setupTestDb } from "../helpers/db";
import { OFFLINE, acceptedContract } from "../helpers/flow";

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "NO_ERROR";
  } catch (e) {
    return isAppError(e) ? e.code : `RAW:${String((e as { cause?: Error }).cause?.message ?? (e as Error).message)}`;
  }
}

describe("tenant isolation (Postgres RLS + service checks)", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it("a second buyer cannot see or reach another tenant's request, contract or outcomes", async () => {
    const result = await runDemoScenario();
    const { otherBuyer, otherSeller } = await actors();
    expect(await listRequests(otherBuyer)).toEqual([]);
    expect(await listRequests(otherSeller)).toEqual([]);
    expect(await code(getRequestDetail(otherBuyer, result.first.request.id))).toBe("NOT_FOUND");
    expect(await code(getContractDetail(otherBuyer, result.first.contract!.id))).toBe("NOT_FOUND");
    expect(await listOutcomes(otherBuyer)).toEqual([]);
    expect(await listOutcomes(otherSeller)).toEqual([]);
  });

  it("RLS hides rows even from raw queries inside a tenant session", async () => {
    await runDemoScenario();
    const { buyer, otherBuyer, otherSeller } = await actors();
    const counts = async (a: typeof buyer) =>
      withTenant(tenantOf(a), async (tx) => ({
        requests: (await tx.select().from(buyerRequests)).length,
        contracts: (await tx.select().from(proofContracts)).length,
        outcomes: (await tx.select().from(outcomeRecords)).length,
        knowledge: (await tx.select().from(knowledgeSources)).length,
      }));
    expect(await counts(buyer)).toMatchObject({ requests: 2, contracts: 1, outcomes: 2, knowledge: 0 });
    expect(await counts(otherBuyer)).toEqual({ requests: 0, contracts: 0, outcomes: 0, knowledge: 0 });
    // Harbor sees only its own knowledge, never Lumen's.
    const harborKnowledge = await withTenant(tenantOf(otherSeller), (tx) => tx.select().from(knowledgeSources));
    expect(harborKnowledge.every((k) => k.organizationId === ORG.harbor)).toBe(true);
  });

  it("RLS rejects writes into another tenant and read-only reviewer writes", async () => {
    const { buyer, reviewer } = await actors();
    const forged = await code(
      withTenant(tenantOf(buyer), (tx) =>
        tx.insert(buyerRequests).values({
          id: "req_forged",
          organizationId: ORG.aster,
          sellerOrganizationId: ORG.harbor,
          createdBy: buyer.userId,
          title: "forged",
          goal: "forged goal text for another tenant",
          budgetMinor: 1,
          currency: "USD",
          timelineDays: 1,
          toolsJson: [],
          requirementsJson: {},
        }),
      ),
    );
    // The buyer_requests guard (BEFORE trigger) fires ahead of the RLS WITH CHECK; either refusal is correct.
    expect(forged).toMatch(/row-level security|only the buyer can submit/);
    const reviewerWrite = await code(
      withTenant(tenantOf(reviewer), (tx) =>
        tx.insert(auditEvents).values({
          id: "aud_x",
          organizationId: ORG.lumen,
          actorId: "x",
          actorRole: "reviewer",
          action: "x",
          targetType: "x",
          targetId: "x",
        }),
      ),
    );
    expect(reviewerWrite).toMatch(/row-level security/);
  });

  it("buyers cannot read seller knowledge; the System Agent never cites another seller's documents", async () => {
    const { buyer } = await actors();
    expect(await code(getKnowledgeBase(buyer))).toBe("FORBIDDEN");
    const r = await createBuyerRequest(buyer, demoRequirement(ORG.lumen), OFFLINE);
    expect(JSON.stringify(r.assessment.agentOutputJson)).not.toContain("HARBOR-CONFIDENTIAL");
    expect(JSON.stringify(r.assessment.agentOutputJson)).not.toContain("ks_harbor");
  });

  it("buyer view redacts seller-internal excerpts (including the injected upload)", async () => {
    const { buyer, seller } = await actors();
    const r = await createBuyerRequest(buyer, demoRequirement(ORG.lumen), OFFLINE);
    const asBuyer = JSON.stringify((await getRequestDetail(buyer, r.request.id)).assessments[0].output);
    const asSeller = JSON.stringify((await getRequestDetail(seller, r.request.id)).assessments[0].output);
    expect(asBuyer).not.toContain("SYSTEM OVERRIDE");
    expect(asBuyer).toContain("excerpt withheld");
    expect(asSeller).toContain("SYSTEM OVERRIDE");
  });
});

describe("authorization and contract state transitions", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it("only the right role can act at each step", async () => {
    const a = await actors();
    const r = await createBuyerRequest(a.buyer, demoRequirement(ORG.lumen), OFFLINE);
    const c = r.contract!;
    expect(await code(approveContract(a.buyer, c.id, { scopeHash: c.scopeHash }))).toBe("FORBIDDEN");
    expect(await code(approveContract(a.reviewer, c.id, { scopeHash: c.scopeHash }))).toBe("FORBIDDEN");
    expect(await code(approveContract(a.otherSeller, c.id, { scopeHash: c.scopeHash }))).toBe("NOT_FOUND");
    expect(await code(approveContract(null, c.id, { scopeHash: c.scopeHash }))).toBe("UNAUTHENTICATED");
    expect(await code(acceptContract(a.buyer, c.id, { scopeHash: c.scopeHash, acknowledge: true }))).toBe("INVALID_TRANSITION");
    expect(await code(createPaymentOrder(a.buyer, c.id, {}))).toBe("INVALID_TRANSITION");
    expect(await code(approveContract(a.seller, c.id, { scopeHash: "0".repeat(64) }))).toBe("CONFLICT");
    await approveContract(a.seller, c.id, { scopeHash: c.scopeHash });
    expect(await code(acceptContract(a.seller, c.id, { scopeHash: c.scopeHash, acknowledge: true }))).toBe("FORBIDDEN");
    expect(await code(acceptContract(a.buyer, c.id, { scopeHash: c.scopeHash, acknowledge: false }))).toBe("VALIDATION");
    expect(await code(acceptContract(a.buyer, c.id, { scopeHash: "tampered", acknowledge: true }))).toBe("CONFLICT");
  });

  it("scope and price are immutable after seller approval (Postgres trigger)", async () => {
    const { contract } = await acceptedContract();
    expect(
      await code(withSystem((tx) => tx.update(proofContracts).set({ priceMinor: 1 }).where(eq(proofContracts.id, contract.id)))),
    ).toMatch(/immutable/);
    expect(
      await code(
        withSystem((tx) =>
          tx
            .update(proofContracts)
            .set({ immutableScopeJson: { hacked: true } })
            .where(eq(proofContracts.id, contract.id)),
        ),
      ),
    ).toMatch(/immutable/);
  });

  it("a tenant session can never set PAID directly, even bypassing the service layer", async () => {
    const { buyer, seller, contract } = await acceptedContract();
    for (const actor of [buyer, seller]) {
      const res = await code(
        withTenant(tenantOf(actor), (tx) => tx.update(proofContracts).set({ status: "PAID" }).where(eq(proofContracts.id, contract.id))),
      );
      expect(res).toMatch(/payment service|no verified captured payment|cannot make this change/);
    }
    const sys = await code(
      withSystem((tx) => tx.execute(sql`update proof_contracts set status = 'PROOF_QUEUED' where id = ${contract.id}`)),
    );
    expect(sys).toMatch(/no verified captured payment/);
  });

  it("each party can only write its own approval fields and status moves (Postgres trigger)", async () => {
    const a = await actors();
    const r = await createBuyerRequest(a.buyer, demoRequirement(ORG.lumen), OFFLINE);
    const id = r.contract!.id;
    const asBuyer = await code(
      withTenant(tenantOf(a.buyer), (tx) =>
        tx.update(proofContracts).set({ sellerApprovedBy: a.buyer.userId, status: "SELLER_APPROVED" }).where(eq(proofContracts.id, id)),
      ),
    );
    expect(asBuyer).toMatch(/buyer cannot/);
    await approveContract(a.seller, id, { scopeHash: r.contract!.scopeHash });
    const asSeller = await code(
      withTenant(tenantOf(a.seller), (tx) =>
        tx.update(proofContracts).set({ status: "BUYER_ACCEPTED", buyerAcceptedBy: a.seller.userId }).where(eq(proofContracts.id, id)),
      ),
    );
    expect(asSeller).toMatch(/seller cannot/);
  });

  it("proof retests are refused without payment; runs and outcomes are append-only evidence", async () => {
    const { seller, contract } = await acceptedContract();
    expect(
      await code(queueRetest(seller, contract.id, { grantWriteScope: true, enableApproval: true, reason: "attempt without payment" })),
    ).toBe("INVALID_TRANSITION");
    await setupTestDb();
    const s = await runDemoScenario();
    const a = await actors();
    expect(await code(executeProofRun(a.seller, s.run1.run.id))).toBe("INVALID_TRANSITION");
    expect(await code(executeProofRun(a.buyer, s.run2.run.id))).toBe("FORBIDDEN");
    expect(
      await code(withSystem((tx) => tx.update(outcomeRecords).set({ result: "PASS" }).where(eq(outcomeRecords.id, s.run1.outcome.id)))),
    ).toMatch(/append-only/);
    expect(
      await code(withSystem((tx) => tx.execute(sql`update proof_runs set artifact_digest = 'forged' where id = ${s.run1.run.id}`))),
    ).toMatch(/immutable/);
    expect(await code(withSystem((tx) => tx.delete(outcomeRecords).where(eq(outcomeRecords.id, s.run1.outcome.id))))).toMatch(
      /append-only/,
    );
    expect(await code(withSystem((tx) => tx.delete(auditEvents)))).toMatch(/append-only/);
  });

  it("an identical environment cannot be re-run to fabricate extra evidence", async () => {
    const s = await runDemoScenario();
    const { seller } = await actors();
    // Contract has PASSED: no further retests.
    expect(
      await code(
        queueRetest(seller, s.first.contract!.id, { grantWriteScope: true, enableApproval: true, reason: "try again after pass" }),
      ),
    ).toBe("INVALID_TRANSITION");
  });

  it("cancellation is refused once a payment is captured", async () => {
    const s = await runDemoScenario();
    const { buyer } = await actors();
    expect(await code(cancelContract(buyer, s.first.contract!.id, { reason: "changed my mind" }))).toBe("INVALID_TRANSITION");
  });

  it("manual override is recorded with reason and audit; the policy status stays on record", async () => {
    const a = await actors();
    const r = await createBuyerRequest(a.buyer, demoRequirement(ORG.lumen), OFFLINE);
    expect(await code(overrideAssessment(a.buyer, r.assessment.id, { status: "FIT", reason: "buyer wants FIT" }))).toBe("FORBIDDEN");
    expect(await code(overrideAssessment(a.seller, r.assessment.id, { status: "FIT", reason: "short" }))).toBe("VALIDATION");
    const updated = await overrideAssessment(a.seller, r.assessment.id, {
      status: "NEEDS_REVIEW",
      reason: "Buyer admin confirmed a write grant by phone; needs paperwork.",
    });
    expect(updated.fitStatus).toBe("NO_FIT");
    expect(updated.overrideJson).toMatchObject({ status: "NEEDS_REVIEW", policyStatus: "NO_FIT" });
    const events = await withSystem((tx) => tx.select().from(auditEvents).where(eq(auditEvents.action, "assessment.overridden")));
    expect(events).toHaveLength(1);
  });
});
