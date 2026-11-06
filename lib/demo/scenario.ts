import { eq } from "drizzle-orm";
import { proofRuns } from "@/db/schema";
import { loadActor, type Actor } from "@/lib/auth/actor";
import { getPaymentMode } from "@/lib/config";
import { withSystem } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";
import { demoRequirement } from "@/lib/domain/requirements";
import { approveFixtureOrder } from "@/lib/paypal/fixture";
import { getGateway } from "@/lib/paypal/gateway";
import type { AssessOptions } from "@/lib/services/assessments";
import { acceptContract, approveContract } from "@/lib/services/contracts";
import { capturePaymentOrder, createPaymentOrder } from "@/lib/services/payments";
import { executeProofRun, queueRetest } from "@/lib/services/proofs";
import { createBuyerRequest } from "@/lib/services/requests";
import { ORG, USER } from "./fixtures";

async function must(userId: string): Promise<Actor> {
  const a = await loadActor(userId);
  if (!a) throw new Error(`demo user ${userId} missing`);
  return a;
}

/**
 * Plays the full storyline through the real services: intake → NO_FIT →
 * seller-approved $49 proof → FIXTURE payment → run_001 FAIL → environment
 * change → run_002 PASS (which re-assesses the request) → a similar request now
 * assessed CONDITIONAL_FIT.
 * Only allowed in fixture mode: a real Sandbox payment needs a human buyer.
 */
export async function runDemoScenario(opts: AssessOptions = { aiMode: { kind: "offline-fixture", reason: "scenario" } }) {
  if (getGateway().mode !== "fixture" && getPaymentMode().kind !== "fixture") {
    throw new AppError(
      "PAYMENT_NOT_CONFIGURED",
      "The scripted scenario uses FIXTURE payments; real Sandbox checkout must be done by a human buyer.",
    );
  }
  const buyer = await must(USER.maya);
  const seller = await must(USER.ravi);

  const first = await createBuyerRequest(buyer, demoRequirement(ORG.lumen), opts);
  if (!first.contract) throw new Error(`expected a proof proposal, got ${first.assessment.fitStatus}`);
  const approved = await approveContract(seller, first.contract.id, { scopeHash: first.contract.scopeHash });
  await acceptContract(buyer, approved.id, { scopeHash: approved.scopeHash, acknowledge: true });

  const order = await createPaymentOrder(buyer, approved.id, {});
  await approveFixtureOrder(order.paypalOrderId);
  await capturePaymentOrder(buyer, order.paypalOrderId);

  const [run1] = await withSystem((tx) => tx.select().from(proofRuns).where(eq(proofRuns.proofContractId, approved.id)));
  const r1 = await executeProofRun(seller, run1.id, undefined, opts);
  const run2 = await queueRetest(seller, approved.id, {
    grantWriteScope: true,
    enableApproval: true,
    reason: "Buyer admin granted contacts.write (simulated) and an approval gate was enabled.",
  });
  const r2 = await executeProofRun(seller, run2.id, undefined, opts);

  const second = await createBuyerRequest(
    buyer,
    { ...demoRequirement(ORG.lumen), title: "Similar request: LINE → HubSpot lifecycle updates (Q1)" },
    opts,
  );
  return { first, run1: r1, run2: r2, second, paypalOrderId: order.paypalOrderId };
}
