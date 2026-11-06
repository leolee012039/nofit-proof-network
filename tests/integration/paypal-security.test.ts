import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, organizations, paypalOrders, paypalWebhookEvents, proofContracts, proofRuns } from "@/db/schema";
import { tenantOf } from "@/lib/auth/actor";
import { withSystem, withTenant } from "@/lib/db/client";
import { isAppError } from "@/lib/domain/errors";
import { setGatewayForTesting } from "@/lib/paypal/gateway";
import { SandboxGateway } from "@/lib/paypal/sandbox";
import { cancelContract } from "@/lib/services/contracts";
import { capturePaymentOrder, createPaymentOrder, reconcilePaymentOrder } from "@/lib/services/payments";
import { setPayoutAccount } from "@/lib/services/payout";
import { executeProofRun } from "@/lib/services/proofs";
import { handlePayPalWebhook } from "@/lib/services/webhooks";
import { setupTestDb } from "../helpers/db";
import { FakePayPal, SIGNED_HEADERS, webhookEvent } from "../helpers/fake-paypal";
import { acceptedContract } from "../helpers/flow";

const SANDBOX_ENV = {
  PAYPAL_ENV: "sandbox",
  PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
  PAYPAL_CLIENT_ID: "fake-client-id",
  PAYPAL_CLIENT_SECRET: "fake-client-secret-DO-NOT-LOG",
  PAYPAL_WEBHOOK_ID: "WH-FAKE-123",
};

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, `expected AppError ${code}`).not.toBeNull();
  expect(isAppError(err) ? err.code : String(err)).toBe(code);
}

async function rowFor(paypalOrderId: string) {
  return withSystem(async (tx) => (await tx.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, paypalOrderId)))[0]);
}
async function contractRow(id: string) {
  return withSystem(async (tx) => (await tx.select().from(proofContracts).where(eq(proofContracts.id, id)))[0]);
}
async function runsFor(contractId: string) {
  return withSystem((tx) => tx.select().from(proofRuns).where(eq(proofRuns.proofContractId, contractId)));
}

describe("PayPal Sandbox integration — security cases (fake PayPal HTTP server)", () => {
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
    delete process.env.PAYPAL_MERCHANT_ID;
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
    delete process.env.PAYPAL_MERCHANT_ID;
  });

  it("creates the order with the server-side contract amount (USD 49.00), never a client amount", async () => {
    const { buyer, contract } = await acceptedContract();
    // Extra fields a malicious client might send are not part of the service signature at all.
    const order = await createPaymentOrder(buyer, contract.id, { flow: "sdk", ...({ amount: "0.01", amountMinor: 1 } as object) });
    const create = fake.calls.find((c) => c.path === "/v2/checkout/orders" && c.method === "POST")!;
    const body = JSON.parse(create.body!);
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "49.00" });
    expect(body.purchase_units[0].reference_id).toBe(contract.id);
    expect((await rowFor(order.paypalOrderId)).amountMinor).toBe(4900);
    expect((await contractRow(contract.id)).status).toBe("PAYMENT_PENDING");
  });

  it("happy path: approve → capture → verified CAPTURED → PAID → proof run #1 queued once", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    const res = await capturePaymentOrder(buyer, order.paypalOrderId);
    expect(res.state).toBe("CAPTURED");
    const row = await rowFor(order.paypalOrderId);
    expect(row.paymentState).toBe("CAPTURED");
    expect(row.captureId).toMatch(/^CAP/);
    expect((await contractRow(contract.id)).status).toBe("PROOF_QUEUED");
    expect(await runsFor(contract.id)).toHaveLength(1);
  });

  it("replayed and concurrent capture requests never double-capture or double-queue", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    const settled = await Promise.allSettled([
      capturePaymentOrder(buyer, order.paypalOrderId),
      capturePaymentOrder(buyer, order.paypalOrderId),
    ]);
    expect(settled.some((s) => s.status === "fulfilled")).toBe(true);
    const again = await capturePaymentOrder(buyer, order.paypalOrderId);
    expect(again.alreadyCaptured).toBe(true);
    expect(fake.captureCalls).toBe(1);
    expect(await runsFor(contract.id)).toHaveLength(1);
  });

  it("an approved-but-not-captured or unapproved order cannot trigger proof execution", async () => {
    const { buyer, seller, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    await expectCode(capturePaymentOrder(buyer, order.paypalOrderId), "PAYMENT_NOT_APPROVED");
    expect((await rowFor(order.paypalOrderId)).paymentState).toBe("CREATED");
    expect(await runsFor(contract.id)).toHaveLength(0);
    // Even a forged run row cannot be inserted: the Postgres trigger requires a captured payment.
    await expect(
      withSystem((tx) =>
        tx.execute(sql`insert into proof_runs (id, proof_contract_id, buyer_organization_id, seller_organization_id, run_number, fixture_key, executor_mode, test_case, environment_version, environment_json, status, input_fixture_hash, runner_version, reproduce_command, queued_by, queued_reason)
          values ('run_forged', ${contract.id}, ${contract.buyerOrganizationId}, ${contract.sellerOrganizationId}, 9, 'x', 'x', 'x', 'x', '{}'::jsonb, 'QUEUED', 'x', 'x', 'x', 'x', 'x')`),
      ),
    ).rejects.toSatisfy((e: unknown) => /no verified captured payment/.test(String((e as { cause?: Error }).cause?.message ?? e)));
    await expectCode(executeProofRun(seller, "run_forged"), "NOT_FOUND");
  });

  it("provider amount mismatch (USD 0.01) is rejected: VERIFICATION_FAILED, NEEDS_REVIEW, never PAID", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    fake.behavior.reportAmount = "0.01";
    await expectCode(capturePaymentOrder(buyer, order.paypalOrderId), "PAYMENT_VERIFICATION_FAILED");
    expect((await rowFor(order.paypalOrderId)).paymentState).toBe("VERIFICATION_FAILED");
    expect((await contractRow(contract.id)).status).toBe("NEEDS_REVIEW");
    expect(await runsFor(contract.id)).toHaveLength(0);
  });

  it("wrong currency is rejected", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    fake.behavior.reportCurrency = "EUR";
    await expectCode(capturePaymentOrder(buyer, order.paypalOrderId), "PAYMENT_VERIFICATION_FAILED");
    expect(await runsFor(contract.id)).toHaveLength(0);
  });

  it("wrong payee is rejected when PAYPAL_MERCHANT_ID is configured", async () => {
    process.env.PAYPAL_MERCHANT_ID = "EXPECTEDMERCHANT";
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    await expectCode(capturePaymentOrder(buyer, order.paypalOrderId), "PAYMENT_VERIFICATION_FAILED");
    const row = await rowFor(order.paypalOrderId);
    const failed = (row.verificationJson as { checks: Array<{ name: string; ok: boolean }> }).checks
      .filter((c) => !c.ok)
      .map((c) => c.name);
    expect(failed).toEqual(["payee_merchant_id"]);
  });

  it("a seller with a payout account is named as payee and paid directly; the capture is verified against it", async () => {
    const { buyer, seller, contract } = await acceptedContract();
    await setPayoutAccount(seller, { merchantId: "lumensellr001" });
    const order = await createPaymentOrder(buyer, contract.id, {});
    const create = fake.calls.find((c) => c.path === "/v2/checkout/orders" && c.method === "POST")!;
    expect(JSON.parse(create.body!).purchase_units[0].payee).toEqual({ merchant_id: "LUMENSELLR001" });
    expect((await rowFor(order.paypalOrderId)).payeeMerchantId).toBe("LUMENSELLR001");
    fake.approve(order.paypalOrderId);
    expect((await capturePaymentOrder(buyer, order.paypalOrderId)).state).toBe("CAPTURED");
    const check = (await rowFor(order.paypalOrderId)).verificationJson as {
      checks: Array<{ name: string; ok: boolean; expected: string }>;
    };
    expect(check.checks.find((c) => c.name === "payee_merchant_id")).toMatchObject({ ok: true, expected: "LUMENSELLR001" });
    expect(await runsFor(contract.id)).toHaveLength(1);
  });

  it("money that reaches a different account than the named payee fails verification; no proof runs", async () => {
    const { buyer, seller, contract } = await acceptedContract();
    await setPayoutAccount(seller, { merchantId: "LUMENSELLR001" });
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    fake.behavior.reportPayeeMerchantId = "SOMEONEELSE01";
    await expectCode(capturePaymentOrder(buyer, order.paypalOrderId), "PAYMENT_VERIFICATION_FAILED");
    expect(await runsFor(contract.id)).toHaveLength(0);
  });

  it("only a seller admin can set its own payout account, and only in PayPal's merchant ID format", async () => {
    const { buyer, seller } = await acceptedContract();
    await expectCode(setPayoutAccount(buyer, { merchantId: "LUMENSELLR001" }), "FORBIDDEN");
    await expectCode(setPayoutAccount(seller, { merchantId: "not-an-id" }), "VALIDATION");
    await expectCode(setPayoutAccount(seller, { merchantId: 42 }), "VALIDATION");
    expect(await setPayoutAccount(seller, { merchantId: "" })).toEqual({ paypalMerchantId: null });
    // Even a raw write inside the seller's own tenant session cannot store a malformed ID or touch another org.
    const raw = await withTenant(tenantOf(seller), (tx) =>
      tx.execute(sql`update organizations set paypal_merchant_id = 'X' where id = ${seller.orgId}`),
    ).then(
      () => "stored",
      () => "refused",
    );
    expect(raw).toBe("refused");
    const other = await withTenant(tenantOf(seller), (tx) =>
      tx.update(organizations).set({ paypalMerchantId: "OTHERSELLER01" }).where(eq(organizations.id, "org_harbor")).returning(),
    );
    expect(other).toHaveLength(0);
  });

  it("forged webhook is rejected, not stored, and cannot fulfil a proof", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.behavior.verifyWebhook = "FAILURE";
    const body = webhookEvent("WH-EVT-FORGED", "PAYMENT.CAPTURE.COMPLETED", {
      id: "CAP-FORGED",
      status: "COMPLETED",
      amount: { value: "49.00", currency_code: "USD" },
      supplementary_data: { related_ids: { order_id: order.paypalOrderId } },
    });
    await expectCode(handlePayPalWebhook(body, SIGNED_HEADERS), "WEBHOOK_REJECTED");
    await expectCode(handlePayPalWebhook(body, { ...SIGNED_HEADERS, transmissionSig: null }), "WEBHOOK_REJECTED");
    const stored = await withSystem((tx) => tx.select().from(paypalWebhookEvents));
    expect(stored).toHaveLength(0);
    expect((await rowFor(order.paypalOrderId)).paymentState).toBe("CREATED");
    expect(await runsFor(contract.id)).toHaveLength(0);
  });

  it("PENDING capture is not paid; a verified webhook later completes it; duplicates are ignored", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    fake.behavior.captureStatus = "PENDING";
    expect((await capturePaymentOrder(buyer, order.paypalOrderId)).state).toBe("CAPTURE_PENDING");
    expect(await runsFor(contract.id)).toHaveLength(0);

    fake.settle(order.paypalOrderId, "COMPLETED");
    const captureId = (await rowFor(order.paypalOrderId)).captureId!;
    const body = webhookEvent("WH-EVT-1", "PAYMENT.CAPTURE.COMPLETED", {
      id: captureId,
      status: "COMPLETED",
      amount: { value: "49.00", currency_code: "USD" },
      supplementary_data: { related_ids: { order_id: order.paypalOrderId } },
    });
    const first = await handlePayPalWebhook(body, SIGNED_HEADERS);
    expect(first.result).toBe("APPLIED_CAPTURED");
    const dup = await handlePayPalWebhook(body, SIGNED_HEADERS);
    expect(dup).toEqual({ duplicate: true, result: "DUPLICATE_IGNORED" });
    expect((await rowFor(order.paypalOrderId)).paymentState).toBe("CAPTURED");
    expect(await runsFor(contract.id)).toHaveLength(1);
    expect(await withSystem((tx) => tx.select().from(paypalWebhookEvents))).toHaveLength(1);
    // The postback carried the raw body byte-for-byte.
    const verifyCall = fake.calls.find((c) => c.path === "/v1/notifications/verify-webhook-signature")!;
    expect(verifyCall.body).toContain(`"webhook_event":${body}`);
  });

  it("lost capture response → CAPTURE_UNKNOWN (not paid) → reconcile with PayPal → CAPTURED exactly once", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    fake.behavior.loseCaptureResponse = true;
    await expectCode(capturePaymentOrder(buyer, order.paypalOrderId), "PAYMENT_PROVIDER_ERROR");
    expect((await rowFor(order.paypalOrderId)).paymentState).toBe("CAPTURE_UNKNOWN");
    expect(await runsFor(contract.id)).toHaveLength(0);
    fake.behavior.loseCaptureResponse = false;
    const rec = await reconcilePaymentOrder(buyer, order.paypalOrderId);
    expect(rec.state).toBe("CAPTURED");
    expect(fake.captureCalls).toBe(1);
    expect(await runsFor(contract.id)).toHaveLength(1);
  });

  it("a lost capture response is recovered by an idempotent retry (same PayPal-Request-Id), capturing once", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    fake.behavior.loseFirstCaptureResponse = true;
    expect((await capturePaymentOrder(buyer, order.paypalOrderId)).state).toBe("CAPTURED");
    expect(fake.captureCalls).toBe(1);
    const captureRequests = fake.calls.filter((c) => c.path.endsWith("/capture"));
    expect(captureRequests.length).toBeGreaterThan(1);
    expect(await runsFor(contract.id)).toHaveLength(1);
  });

  it("webhook without correlation ids matches nothing and changes nothing", async () => {
    const { buyer, contract } = await acceptedContract();
    await createPaymentOrder(buyer, contract.id, {});
    const res = await handlePayPalWebhook(
      webhookEvent("WH-EVT-NOID", "PAYMENT.CAPTURE.COMPLETED", { status: "COMPLETED" }),
      SIGNED_HEADERS,
    );
    expect(res.result).toBe("UNMATCHED");
    expect(await runsFor(contract.id)).toHaveLength(0);
  });

  it("refund webhook is recorded only (no money moved) and flags the contract for review", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    await capturePaymentOrder(buyer, order.paypalOrderId);
    const captureId = (await rowFor(order.paypalOrderId)).captureId!;
    const refund = (id: string, value: string, total: string) =>
      webhookEvent(id, "PAYMENT.CAPTURE.REFUNDED", {
        id: `REFUND-${id}`,
        status: "COMPLETED",
        amount: { value, currency_code: "USD" },
        seller_payable_breakdown: { total_refunded_amount: { value: total, currency_code: "USD" } },
        links: [{ rel: "up", href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}`, method: "GET" }],
      });
    const partial = await handlePayPalWebhook(refund("WH-EVT-PARTIAL", "10.00", "10.00"), SIGNED_HEADERS);
    expect(partial.result).toBe("RECORDED_PARTIALLY_REFUNDED");
    const res = await handlePayPalWebhook(refund("WH-EVT-REFUND", "39.00", "49.00"), SIGNED_HEADERS);
    expect(res.result).toBe("RECORDED_REFUNDED");
    expect((await rowFor(order.paypalOrderId)).paymentState).toBe("REFUNDED");
    expect((await contractRow(contract.id)).status).toBe("NEEDS_REVIEW");
    expect(fake.calls.some((c) => c.path.includes("refund"))).toBe(false);
  });

  it("review fix: two checkouts for one contract can never both be captured", async () => {
    const { buyer, contract } = await acceptedContract();
    const sdkOrder = await createPaymentOrder(buyer, contract.id, { flow: "sdk" });
    const again = await createPaymentOrder(buyer, contract.id, { flow: "sdk" });
    expect(again.paypalOrderId).toBe(sdkOrder.paypalOrderId);
    const redirectOrder = await createPaymentOrder(buyer, contract.id, { flow: "redirect" });
    expect(redirectOrder.paypalOrderId).not.toBe(sdkOrder.paypalOrderId);
    expect((await rowFor(sdkOrder.paypalOrderId)).paymentState).toBe("VOIDED");
    fake.approve(sdkOrder.paypalOrderId);
    fake.approve(redirectOrder.paypalOrderId);
    await expectCode(capturePaymentOrder(buyer, sdkOrder.paypalOrderId), "INVALID_TRANSITION");
    expect((await capturePaymentOrder(buyer, redirectOrder.paypalOrderId)).state).toBe("CAPTURED");
    expect(fake.captureCalls).toBe(1);
    // The database itself refuses a second live order for the contract.
    await expect(
      withSystem((tx) =>
        tx.execute(sql`insert into paypal_orders (id, proof_contract_id, buyer_organization_id, seller_organization_id, provider_mode, paypal_order_id, create_request_id, capture_request_id, amount_minor, currency, payment_state)
          values ('pay_dup', ${contract.id}, ${contract.buyerOrganizationId}, ${contract.sellerOrganizationId}, 'sandbox', 'ORDER-DUP', 'c-dup', 'k-dup', 4900, 'USD', 'APPROVED')`),
      ),
    ).rejects.toSatisfy((e: unknown) => /duplicate key|unique/i.test(String((e as { cause?: Error }).cause?.message ?? e)));
  });

  it("review fix: a cancelled contract cannot be paid, even with an order already approved at PayPal", async () => {
    const { buyer, seller, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    await cancelContract(seller, contract.id, { reason: "Seller withdrew the offer" });
    expect((await rowFor(order.paypalOrderId)).paymentState).toBe("VOIDED");
    await expectCode(capturePaymentOrder(buyer, order.paypalOrderId), "INVALID_TRANSITION");
    expect(fake.captureCalls).toBe(0);
    expect(await runsFor(contract.id)).toHaveLength(0);
  });

  it("review fix: a webhook that fails mid-processing is retried, not swallowed as a duplicate", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    fake.behavior.captureStatus = "PENDING";
    await capturePaymentOrder(buyer, order.paypalOrderId);
    fake.settle(order.paypalOrderId, "COMPLETED");
    const captureId = (await rowFor(order.paypalOrderId)).captureId!;
    const body = webhookEvent("WH-EVT-RETRY", "PAYMENT.CAPTURE.COMPLETED", {
      id: captureId,
      status: "COMPLETED",
      supplementary_data: { related_ids: { order_id: order.paypalOrderId } },
    });
    fake.behavior.failGetOrders = 3;
    await expect(handlePayPalWebhook(body, SIGNED_HEADERS)).rejects.toBeTruthy();
    expect(await withSystem((tx) => tx.select().from(paypalWebhookEvents))).toHaveLength(0);
    expect((await handlePayPalWebhook(body, SIGNED_HEADERS)).result).toBe("APPLIED_CAPTURED");
    expect(await runsFor(contract.id)).toHaveLength(1);
  });

  it("review fix: a PENDING/DENIED webhook for a not-yet-captured order changes nothing", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    const res = await handlePayPalWebhook(
      webhookEvent("WH-EVT-EARLY", "PAYMENT.CAPTURE.DENIED", {
        id: "CAP-UNKNOWN",
        status: "DECLINED",
        supplementary_data: { related_ids: { order_id: order.paypalOrderId } },
      }),
      SIGNED_HEADERS,
    );
    expect(res.result).toBe("APPLIED_UNCHANGED");
    expect((await rowFor(order.paypalOrderId)).paymentState).toBe("CREATED");
    expect((await contractRow(contract.id)).status).toBe("PAYMENT_PENDING");
    expect((await capturePaymentOrder(buyer, order.paypalOrderId)).state).toBe("CAPTURED");
  });

  it("other tenants cannot create or capture orders for this contract", async () => {
    const { buyer, otherBuyer, seller, contract } = await acceptedContract();
    await expectCode(createPaymentOrder(otherBuyer, contract.id, {}), "NOT_FOUND");
    await expectCode(createPaymentOrder(seller, contract.id, {}), "FORBIDDEN");
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    await expectCode(capturePaymentOrder(otherBuyer, order.paypalOrderId), "NOT_FOUND");
    await expectCode(capturePaymentOrder(null, order.paypalOrderId), "UNAUTHENTICATED");
  });

  it("secrets and access tokens never reach the database or audit log", async () => {
    const { buyer, contract } = await acceptedContract();
    const order = await createPaymentOrder(buyer, contract.id, {});
    fake.approve(order.paypalOrderId);
    await capturePaymentOrder(buyer, order.paypalOrderId);
    const dump = JSON.stringify(
      await withSystem(async (tx) => ({
        orders: await tx.select().from(paypalOrders),
        audit: await tx.select().from(auditEvents),
        webhooks: await tx.select().from(paypalWebhookEvents),
      })),
    );
    expect(dump).not.toContain(SANDBOX_ENV.PAYPAL_CLIENT_SECRET);
    expect(dump).not.toContain("A21-fake-access-token");
    expect(dump).not.toContain("Basic ");
  });
});
