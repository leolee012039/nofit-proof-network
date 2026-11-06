import { eq, sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditEvents,
  buyerRequests,
  fitAssessments,
  outcomeRecords,
  paypalOrders,
  paypalWebhookEvents,
  proofContracts,
  proofRuns,
} from "@/db/schema";
import { tenantOf } from "@/lib/auth/actor";
import { withSystem, withTenant } from "@/lib/db/client";
import { ORG } from "@/lib/demo/fixtures";
import { runDemoScenario } from "@/lib/demo/scenario";
import { isAppError } from "@/lib/domain/errors";
import { demoRequirement } from "@/lib/domain/requirements";
import { CONTRACT_STATUSES, canTransitionContract } from "@/lib/domain/states";
import { setGatewayForTesting } from "@/lib/paypal/gateway";
import { SandboxGateway } from "@/lib/paypal/sandbox";
import { resetDemo } from "@/lib/services/demo";
import { capturePaymentOrder, createPaymentOrder, reconcilePaymentOrder } from "@/lib/services/payments";
import { createBuyerRequest, submitBuyerRequest } from "@/lib/services/requests";
import { handlePayPalWebhook } from "@/lib/services/webhooks";
import { actors, setupTestDb } from "../helpers/db";
import { FakePayPal, SIGNED_HEADERS, webhookEvent } from "../helpers/fake-paypal";
import { OFFLINE, acceptedContract } from "../helpers/flow";

/** Regression tests for the ECC review fixes (2026-10-27). */

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "NO_ERROR";
  } catch (e) {
    return isAppError(e) ? e.code : `RAW:${String((e as { cause?: Error }).cause?.message ?? (e as Error).message)}`;
  }
}

const rawError = (statement: SQL) => code(withSystem((tx) => tx.execute(statement)));

async function rowFor(paypalOrderId: string) {
  return withSystem(async (tx) => (await tx.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, paypalOrderId)))[0]);
}

/** Installs a trigger that fails one kind of write, to simulate a database outage at an exact step. */
async function failWrites(table: string, event: "insert" | "update", condition = "true") {
  await withSystem(async (tx) => {
    await tx.execute(
      sql.raw(`create function test_outage() returns trigger language plpgsql as $$ begin raise exception 'simulated outage'; end $$`),
    );
    await tx.execute(
      sql.raw(`create trigger test_outage_trg before ${event} on ${table} for each row when (${condition}) execute function test_outage()`),
    );
  });
}

const SANDBOX_ENV = {
  PAYPAL_ENV: "sandbox",
  PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
  PAYPAL_CLIENT_ID: "fake-client-id",
  PAYPAL_CLIENT_SECRET: "fake-client-secret-DO-NOT-LOG",
  PAYPAL_WEBHOOK_ID: "WH-FAKE-123",
};

describe("ECC review: payment and webhook hardening (fake PayPal HTTP server)", () => {
  let fake: FakePayPal;
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const [k, v] of Object.entries(SANDBOX_ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    setGatewayForTesting(undefined);
  });
  beforeEach(async () => {
    await setupTestDb();
    fake = new FakePayPal();
    setGatewayForTesting(
      new SandboxGateway({
        baseUrl: SANDBOX_ENV.PAYPAL_BASE_URL,
        clientId: "fake-client-id",
        clientSecret: SANDBOX_ENV.PAYPAL_CLIENT_SECRET,
        webhookId: "WH-FAKE-123",
        fetchImpl: fake.fetch,
        sleep: async () => {},
      }),
    );
  });

  it("re-opening a redirect checkout returns the PayPal approval link again", async () => {
    const { buyer, contract } = await acceptedContract();
    const first = await createPaymentOrder(buyer, contract.id, { flow: "redirect" });
    expect(first.approveUrl).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\//);
    const again = await createPaymentOrder(buyer, contract.id, { flow: "redirect" });
    expect(again).toMatchObject({ reused: true, paypalOrderId: first.paypalOrderId, approveUrl: first.approveUrl });
  });

  it("a local failure after PayPal captured is CAPTURE_UNKNOWN with a 'do not pay again' error, then reconciles once", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    // PayPal captures, then recording CAPTURED locally fails.
    await failWrites("paypal_orders", "update", "new.payment_state = 'CAPTURED'");
    const err = await capturePaymentOrder(buyer, order.paypalOrderId).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isAppError(err) && err.code).toBe("PAYMENT_PROVIDER_ERROR");
    expect(isAppError(err) && err.details).toMatchObject({ reconcilable: true });
    expect((err as Error).message).toMatch(/Do not pay again/);
    expect((await rowFor(order.paypalOrderId)).paymentState).toBe("CAPTURE_UNKNOWN");
    expect(fake.captureCalls).toBe(1);

    await withSystem((tx) => tx.execute(sql.raw(`drop trigger test_outage_trg on paypal_orders`)));
    expect((await reconcilePaymentOrder(buyer, order.paypalOrderId)).state).toBe("CAPTURED");
    expect(fake.captureCalls).toBe(1);
  });

  it("webhook: a PayPal outage answers 502 (PayPal retries); a refused envelope is 401; neither is stored", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    const body = webhookEvent("WH-EVT-OUTAGE", "CHECKOUT.ORDER.APPROVED", { id: order.paypalOrderId, status: "APPROVED" });

    fake.behavior.verifyHttpStatus = 500;
    const outage = await handlePayPalWebhook(body, SIGNED_HEADERS).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isAppError(outage) && [outage.code, outage.status]).toEqual(["PAYMENT_PROVIDER_ERROR", 502]);

    fake.behavior.verifyHttpStatus = 400;
    expect(await code(handlePayPalWebhook(body, SIGNED_HEADERS))).toBe("WEBHOOK_REJECTED");
    expect(await withSystem((tx) => tx.select().from(paypalWebhookEvents))).toHaveLength(0);

    fake.behavior.verifyHttpStatus = undefined;
    expect((await handlePayPalWebhook(body, SIGNED_HEADERS)).result).toBe("APPLIED_APPROVED");
  });

  it("webhook: a JSON body that is not an object is rejected", async () => {
    for (const body of ["null", "[1,2]", "42", '"text"']) {
      expect(await code(handlePayPalWebhook(body, SIGNED_HEADERS))).toBe("WEBHOOK_REJECTED");
    }
  });

  it("a revoked PayPal access token is refreshed once, transparently", async () => {
    const { buyer, contract } = await acceptedContract();
    await createPaymentOrder(buyer, contract.id, {});
    expect(fake.tokenIssued).toBe(1);
    fake.revokeToken();
    const redirect = await createPaymentOrder(buyer, contract.id, { flow: "redirect" });
    expect(redirect.approveUrl).toBeTruthy();
    expect(fake.tokenIssued).toBe(2);
  });

  it("the database refuses to cancel a contract while a capture is in flight", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    fake.behavior.captureStatus = "PENDING";
    expect((await capturePaymentOrder(buyer, order.paypalOrderId)).state).toBe("CAPTURE_PENDING");
    expect(await rawError(sql`update proof_contracts set status = 'CANCELLED' where id = ${contract.id}`)).toMatch(/in-flight payment/);
  });

  it("a proof run cannot skip RUNNING, and cannot be created already finished", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    await capturePaymentOrder(buyer, order.paypalOrderId);
    const [run] = await withSystem((tx) => tx.select().from(proofRuns).where(eq(proofRuns.proofContractId, contract.id)));
    expect(run.status).toBe("QUEUED");
    expect(
      await rawError(sql`update proof_runs set status = 'PASSED', evidence_json = '{}'::jsonb, artifact_digest = 'x' where id = ${run.id}`),
    ).toMatch(/cannot move from QUEUED to PASSED/);
    expect(
      await rawError(sql`insert into proof_runs (id, proof_contract_id, buyer_organization_id, seller_organization_id, run_number, fixture_key, executor_mode, test_case, environment_version, environment_json, status, input_fixture_hash, runner_version, reproduce_command, queued_by, queued_reason)
        values ('run_forged', ${contract.id}, ${contract.buyerOrganizationId}, ${contract.sellerOrganizationId}, 2, 'x', 'x', 'x', 'x', '{}'::jsonb, 'PASSED', 'x', 'x', 'x', 'x', 'x')`),
    ).toMatch(/must be created as QUEUED/);
  });

  it("the scripted storyline reset is refused BEFORE wiping when PayPal Sandbox is configured", async () => {
    const { buyer } = await acceptedContract();
    expect(await code(resetDemo(buyer, "storyline"))).toBe("PAYMENT_NOT_CONFIGURED");
    expect(await withSystem((tx) => tx.select().from(buyerRequests))).toHaveLength(1);
  });
});

describe("ECC review: database state guards and safe request submission", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it("the SQL contract state machine matches the TypeScript one exactly", async () => {
    const pairs = CONTRACT_STATUSES.flatMap((from) => CONTRACT_STATUSES.map((to) => [from, to] as const));
    const values = sql.join(
      pairs.map(([from, to]) => sql`(${from}::text, ${to}::text)`),
      sql`, `,
    );
    const res = await withSystem((tx) =>
      tx.execute(sql`select f, t, contract_transition_ok(f, t) as ok from (values ${values}) as p(f, t)`),
    );
    const rows = (res as unknown as { rows: Array<{ f: string; t: string; ok: boolean }> }).rows;
    expect(rows).toHaveLength(pairs.length);
    for (const r of rows) expect([r.f, r.t, r.ok]).toEqual([r.f, r.t, canTransitionContract(r.f as never, r.t as never)]);
  });

  it("tenant sessions cannot forge contracts, skip approval, or rewrite terms, assessments and requests", async () => {
    const a = await actors();
    const r = await createBuyerRequest(a.buyer, demoRequirement(ORG.lumen), OFFLINE);
    const c = r.contract!;
    const as = (actor: typeof a.buyer, fn: Parameters<typeof withTenant>[1]) => code(withTenant(tenantOf(actor), fn));

    expect(await as(a.buyer, (tx) => tx.insert(proofContracts).values({ ...c, id: "pc_forged_b" }))).toMatch(/fit engine/);
    expect(await as(a.seller, (tx) => tx.insert(proofContracts).values({ ...c, id: "pc_forged_s" }))).toMatch(/fit engine/);
    expect(
      await as(a.buyer, (tx) =>
        tx
          .update(proofContracts)
          .set({
            status: "BUYER_ACCEPTED",
            buyerAcceptedBy: a.buyer.userId,
            buyerAcceptedAt: new Date(),
            buyerAcceptedScopeHash: c.scopeHash,
          })
          .where(eq(proofContracts.id, c.id)),
      ),
    ).toMatch(/can only be recorded when accepting|cannot move/);
    expect(await as(a.seller, (tx) => tx.update(proofContracts).set({ priceMinor: 1 }).where(eq(proofContracts.id, c.id)))).toMatch(
      /terms cannot be changed/,
    );
    expect(
      await as(a.seller, (tx) => tx.update(fitAssessments).set({ fitStatus: "FIT" }).where(eq(fitAssessments.id, r.assessment.id))),
    ).toMatch(/immutable/);
    expect(await as(a.buyer, (tx) => tx.update(buyerRequests).set({ budgetMinor: 1 }).where(eq(buyerRequests.id, r.request.id)))).toMatch(
      /only change the state/,
    );
    expect(
      await as(a.buyer, (tx) =>
        tx.insert(auditEvents).values({
          id: "aud_forged",
          organizationId: a.buyer.orgId,
          counterpartyOrganizationId: ORG.harbor,
          actorId: a.buyer.userId,
          actorRole: "buyer",
          action: "forged",
          targetType: "x",
          targetId: "x",
        }),
      ),
    ).toMatch(/row-level security/);
  });

  it("an outcome record must match its completed run: no forged digest or result", async () => {
    const s = await runDemoScenario();
    const { seller } = await actors();
    const o = s.run1.outcome;
    const forge = (id: string, patch: Partial<typeof o>) =>
      code(withTenant(tenantOf(seller), (tx) => tx.insert(outcomeRecords).values({ ...o, id, ...patch })));
    expect(await forge("out_forged_digest", { artifactDigest: "0".repeat(64) })).toMatch(/must match a completed proof run/);
    expect(await forge("out_forged_result", { result: "PASS" })).toMatch(/must match a completed proof run/);
  });

  it("if the assessment step fails, the saved request is still returned (no duplicate resubmits)", async () => {
    const { buyer } = await actors();
    await failWrites("fit_assessments", "insert");
    const res = await submitBuyerRequest(buyer, demoRequirement(ORG.lumen), OFFLINE);
    expect(res.assessment).toBeNull();
    expect(res.assessmentError).toMatch(/Re-run/);
    expect(await withSystem((tx) => tx.select().from(buyerRequests).where(eq(buyerRequests.id, res.request.id)))).toHaveLength(1);
  });
});
