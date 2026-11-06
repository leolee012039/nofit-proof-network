import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { organizations, paypalOrders, proofContracts, proofRuns, type PaypalOrderRow, type ProofContractRow } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireRole, tenantOf, type Actor } from "@/lib/auth/actor";
import { getAppBaseUrl, getPaymentMode } from "@/lib/config";
import { withSystem, withTenant, type Tx } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { AppError } from "@/lib/domain/errors";
import { CAPTURABLE_STATES, RESOLVABLE_STATES, canTransitionContract, type ContractStatus } from "@/lib/domain/states";
import { newId } from "@/lib/ids";
import { decimalStringToMinor, minorToDecimalString } from "@/lib/money";
import { getGateway } from "@/lib/paypal/gateway";
import { PayPalApiError, type PayPalOrder } from "@/lib/paypal/types";
import { verifyCapturedOrder } from "@/lib/paypal/verify";
import { fixtureKeyFor, reproduceCommandFor, fixtureHash } from "@/lib/proofs/runner";
import { ProofSpec, RUNNER_VERSION } from "@/lib/proofs/types";

const PAYMENT_SERVICE = "system:payment-service";
// Longer than the worst-case gateway budget (3 calls x 3 attempts x 15 s + backoff).
const CAPTURE_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

function errName(err: unknown) {
  return err instanceof Error ? `${err.name}: ${err.message.slice(0, 160)}` : "unknown";
}

export function customIdFor(contract: Pick<ProofContractRow, "id" | "version">) {
  return `${contract.id}:v${contract.version}`;
}

function approveLink(order: PayPalOrder): string | null {
  return order.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href ?? null;
}

function flowOf(row: Pick<PaypalOrderRow, "createRequestId">): "sdk" | "redirect" {
  return row.createRequestId.endsWith("-redirect") ? "redirect" : "sdk";
}

/**
 * Creates a provider order for a buyer-accepted contract. The amount always
 * comes from the server-side contract; any client-supplied amount is ignored.
 * At most one live order exists per contract (unique index): an open order is
 * reused for the same flow, otherwise it is voided before a new one is created.
 */
export async function createPaymentOrder(actorIn: Actor | null, contractId: string, input: { flow?: "sdk" | "redirect" } = {}) {
  const actor = requireRole(actorIn, ["buyer"]);
  const gateway = getGateway();
  const flow = input.flow ?? "sdk";

  const { contract, attempt, open } = await withTenant(tenantOf(actor), async (tx) => {
    const [c] = await tx.select().from(proofContracts).where(eq(proofContracts.id, contractId));
    if (!c) throw new AppError("NOT_FOUND", "Proof contract not found.");
    if (c.buyerOrganizationId !== actor.orgId) throw new AppError("FORBIDDEN", "Only the buyer can pay for this contract.");
    if (!["BUYER_ACCEPTED", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(c.status)) {
      throw new AppError("INVALID_TRANSITION", `Payment is not available while the contract is ${c.status}.`);
    }
    if (!c.sellerApprovedAt || !c.buyerAcceptedAt || c.buyerAcceptedScopeHash !== c.scopeHash) {
      throw new AppError("INVALID_TRANSITION", "Seller approval and buyer acceptance of the current scope are both required.");
    }
    const orders = await tx.select().from(paypalOrders).where(eq(paypalOrders.proofContractId, c.id));
    if (orders.some((o) => o.paymentState === "CAPTURED")) throw new AppError("CONFLICT", "This contract is already paid.");
    if (orders.some((o) => ["CAPTURING", "CAPTURE_PENDING", "CAPTURE_UNKNOWN"].includes(o.paymentState))) {
      throw new AppError("CONFLICT", "A capture is already in progress for this contract. Use “Check status with PayPal”.");
    }
    const live = orders.find((o) => o.paymentState === "CREATED" || o.paymentState === "APPROVED") ?? null;
    return { contract: c, attempt: orders.length + 1, open: live };
  });

  if (open && open.providerMode === gateway.mode && (gateway.mode === "fixture" || flowOf(open) === flow)) {
    if (open.providerMode === "fixture") {
      return {
        paypalOrderId: open.paypalOrderId,
        providerMode: open.providerMode,
        approveUrl: `/checkout/fixture/${open.paypalOrderId}`,
        reused: true,
      };
    }
    // A redirect checkout needs the payer-action link again (e.g. the buyer cancelled at PayPal and came back).
    const approveUrl =
      flow === "redirect"
        ? approveLink(
            await gateway.getOrder(open.paypalOrderId).catch((err: unknown) => {
              throw providerError(err, "read the open order");
            }),
          )
        : null;
    return { paypalOrderId: open.paypalOrderId, providerMode: open.providerMode, approveUrl, reused: true };
  }

  // A seller with a payout account is paid directly: the order names it as payee (Sandbox only; the fixture is not PayPal).
  const payeeMerchantId =
    gateway.mode === "sandbox"
      ? ((
          await withSystem((tx) =>
            tx
              .select({ id: organizations.paypalMerchantId })
              .from(organizations)
              .where(eq(organizations.id, contract.sellerOrganizationId)),
          )
        )[0]?.id ?? undefined)
      : undefined;

  // Create the new provider order BEFORE retiring the old one: if PayPal fails, the old checkout still works.
  const localId = newId("pay");
  const createRequestId = `nofit-create-${contract.id}-${attempt}-${flow}`;
  const base = getAppBaseUrl();
  const order = await gateway
    .createOrder({
      requestId: createRequestId,
      referenceId: contract.id,
      customId: customIdFor(contract),
      description: "NoFit bounded feasibility proof (Sandbox demo, fictional)",
      amountValue: minorToDecimalString(contract.priceMinor),
      currency: contract.currency,
      ...(payeeMerchantId ? { payeeMerchantId } : {}),
      ...(flow === "redirect"
        ? { returnUrl: `${base}/checkout/return?contract=${contract.id}`, cancelUrl: `${base}/contracts/${contract.id}?checkout=cancelled` }
        : {}),
    })
    .catch((err: unknown) => {
      throw providerError(err, "create the order");
    });

  const unit = order.purchase_units[0];
  const providerAmount = unit?.amount ? decimalStringToMinor(unit.amount.value) : contract.priceMinor;
  if (
    unit?.reference_id !== contract.id ||
    providerAmount !== contract.priceMinor ||
    (unit?.amount && unit.amount.currency_code !== contract.currency) ||
    (payeeMerchantId && unit?.payee?.merchant_id && unit.payee.merchant_id !== payeeMerchantId)
  ) {
    throw new AppError("PAYMENT_VERIFICATION_FAILED", "The provider order does not match the contract amount/reference.");
  }

  try {
    await withSystem(async (tx) => {
      // Lock order: payment rows first, then the contract, the same as finalize/cancel (avoids deadlocks).
      await tx.select({ id: paypalOrders.id }).from(paypalOrders).where(eq(paypalOrders.proofContractId, contract.id)).for("update");
      // Re-check the contract is still payable (a cancel may have committed meanwhile).
      const [fresh] = await tx.select().from(proofContracts).where(eq(proofContracts.id, contract.id)).for("update");
      if (!fresh || !["BUYER_ACCEPTED", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(fresh.status)) {
        throw new AppError("INVALID_TRANSITION", `Payment is no longer available: the contract is ${fresh?.status ?? "missing"}.`);
      }
      const existing = await tx.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, order.id));
      if (existing.length === 0) {
        if (open) {
          const voided = await tx
            .update(paypalOrders)
            .set({ paymentState: "VOIDED", lockedAt: null, lastError: "Superseded by a new checkout" })
            .where(and(eq(paypalOrders.id, open.id), inArray(paypalOrders.paymentState, ["CREATED", "APPROVED"])))
            .returning();
          if (voided.length === 0) throw new AppError("CONFLICT", "The previous checkout changed state. Refresh and try again.");
        }
        await tx.insert(paypalOrders).values({
          id: localId,
          proofContractId: contract.id,
          buyerOrganizationId: contract.buyerOrganizationId,
          sellerOrganizationId: contract.sellerOrganizationId,
          providerMode: gateway.mode,
          paypalOrderId: order.id,
          createRequestId,
          captureRequestId: `nofit-capture-${localId}`,
          amountMinor: contract.priceMinor,
          currency: contract.currency,
          payeeMerchantId: payeeMerchantId ?? null,
          paymentState: order.status === "APPROVED" ? "APPROVED" : "CREATED",
          providerStatus: order.status,
        });
      }
      if (fresh.status !== "PAYMENT_PENDING" && canTransitionContract(fresh.status as ContractStatus, "PAYMENT_PENDING")) {
        await tx
          .update(proofContracts)
          .set({ status: "PAYMENT_PENDING" })
          .where(and(eq(proofContracts.id, fresh.id), eq(proofContracts.status, fresh.status)));
      }
      await audit(tx, {
        organizationId: contract.buyerOrganizationId,
        counterpartyOrganizationId: contract.sellerOrganizationId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: "payment.order_created",
        targetType: "proof_contract",
        targetId: contract.id,
        metadata: {
          providerMode: gateway.mode,
          paypalOrderId: order.id,
          amountMinor: contract.priceMinor,
          currency: contract.currency,
          flow,
          replacedOrderId: open?.paypalOrderId ?? null,
        },
      });
    });
  } catch (err) {
    // A concurrent checkout already holds the single live-order slot for this contract.
    if (isUniqueViolation(err))
      throw new AppError("CONFLICT", "Another checkout for this contract was just started. Refresh and continue there.");
    throw err;
  }

  return { paypalOrderId: order.id, providerMode: gateway.mode, approveUrl: approveLink(order), reused: false };
}

function providerError(err: unknown, what: string): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof PayPalApiError) {
    // Server-side trace an operator can match to a PayPal support ticket (no payloads, no secrets).
    console.warn("[nofit] paypal error", { what, issue: err.issue, debugId: err.debugId, httpStatus: err.httpStatus });
    return new AppError("PAYMENT_PROVIDER_ERROR", `PayPal could not ${what} (${err.issue ?? `HTTP ${err.httpStatus}`}).`, {
      issue: err.issue,
      debugId: err.debugId,
      retryable: err.retryable,
    });
  }
  console.warn("[nofit] payment provider error", { what, error: err instanceof Error ? err.name : "unknown" });
  return new AppError("PAYMENT_PROVIDER_ERROR", `Payment provider error while trying to ${what}. Please retry.`);
}

async function loadOrderForParty(actor: Actor, paypalOrderId: string) {
  return withTenant(tenantOf(actor), async (tx) => {
    const [row] = await tx.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, paypalOrderId));
    if (!row) throw new AppError("NOT_FOUND", "Payment order not found.");
    const [contract] = await tx.select().from(proofContracts).where(eq(proofContracts.id, row.proofContractId));
    return { row, contract };
  });
}

export type FinalizeSource = "capture" | "webhook" | "reconcile";

/**
 * Applies an authoritative provider order to the local ledger. Idempotent and
 * race-safe: payment state only moves via compare-and-set from a resolvable
 * state, and the first proof run is inserted with ON CONFLICT DO NOTHING.
 */
export async function finalizeFromProviderOrder(rowId: string, order: PayPalOrder, source: FinalizeSource, actorId: string) {
  const mode = getPaymentMode();
  return withSystem(async (tx) => {
    const [row] = await tx.select().from(paypalOrders).where(eq(paypalOrders.id, rowId));
    if (!row) throw new AppError("NOT_FOUND", "Payment order not found.");
    if (row.paymentState === "CAPTURED") return { state: "CAPTURED" as const, changed: false, row };
    if (!RESOLVABLE_STATES.includes(row.paymentState as never)) return { state: row.paymentState, changed: false, row };
    // Only a COMPLETED order is evidence of anything; an APPROVED or stale read changes nothing.
    if (order.status !== "COMPLETED") return { state: "UNCHANGED" as const, changed: false, row };

    const [contract] = await tx.select().from(proofContracts).where(eq(proofContracts.id, row.proofContractId));
    const verification = verifyCapturedOrder(order, {
      paypalOrderId: row.paypalOrderId,
      contractId: contract.id,
      customId: customIdFor(contract),
      amountMinor: row.amountMinor,
      currency: row.currency,
      // The payee the order was created with (the seller's payout account), else the configured app merchant.
      merchantId:
        row.providerMode === "sandbox" ? (row.payeeMerchantId ?? (mode.kind === "sandbox" ? mode.merchantId : undefined)) : undefined,
    });
    const verificationJson = { source, at: new Date().toISOString(), ...verification };
    const orgs = { organizationId: row.buyerOrganizationId, counterpartyOrganizationId: row.sellerOrganizationId };

    const setState = async (state: string, patch: Partial<typeof paypalOrders.$inferInsert> = {}) => {
      const [updated] = await tx
        .update(paypalOrders)
        .set({ paymentState: state, providerStatus: order.status, verificationJson, lockedAt: null, ...patch })
        .where(and(eq(paypalOrders.id, row.id), inArray(paypalOrders.paymentState, [...RESOLVABLE_STATES])))
        .returning();
      return updated;
    };
    const moveContract = async (to: ContractStatus) => {
      const [fresh] = await tx.select().from(proofContracts).where(eq(proofContracts.id, contract.id));
      if (fresh.status === to || !canTransitionContract(fresh.status as ContractStatus, to)) return fresh;
      const [u] = await tx
        .update(proofContracts)
        .set({ status: to })
        .where(and(eq(proofContracts.id, fresh.id), eq(proofContracts.status, fresh.status)))
        .returning();
      return u ?? fresh;
    };

    if (!verification.ok) {
      const updated = await setState("VERIFICATION_FAILED", { lastError: "Provider order did not match the contract." });
      if (!updated) return { state: "UNCHANGED", changed: false, row };
      await moveContract("NEEDS_REVIEW");
      await audit(tx, {
        ...orgs,
        actorId,
        actorRole: "system",
        action: "payment.verification_failed",
        targetType: "paypal_order",
        targetId: row.id,
        metadata: { source, failed: verification.checks.filter((c) => !c.ok) },
      });
      return { state: "VERIFICATION_FAILED" as const, changed: true, row: updated };
    }

    if (verification.captureStatus === "COMPLETED") {
      const updated = await setState("CAPTURED", { captureId: verification.captureId, capturedAt: new Date(), lastError: null });
      if (!updated) return { state: "UNCHANGED", changed: false, row };
      const paid = await moveContract("PAID");
      await audit(tx, {
        ...orgs,
        actorId,
        actorRole: "system",
        action: "payment.captured",
        targetType: "paypal_order",
        targetId: row.id,
        metadata: {
          source,
          providerMode: row.providerMode,
          paypalOrderId: row.paypalOrderId,
          captureId: verification.captureId,
          amountMinor: row.amountMinor,
          currency: row.currency,
        },
      });
      if (paid.status === "PAID") {
        await queueFirstProofRun(tx, contract, verification.captureId!);
      } else {
        // Money moved for a contract that is no longer payable (e.g. cancelled): never start a proof; flag for a human refund decision.
        await moveContract("NEEDS_REVIEW");
        await audit(tx, {
          ...orgs,
          actorId,
          actorRole: "system",
          action: "payment.captured_inactive_contract",
          targetType: "proof_contract",
          targetId: contract.id,
          metadata: { contractStatus: paid.status, captureId: verification.captureId },
        });
      }
      return { state: "CAPTURED" as const, changed: true, row: updated };
    }

    if (verification.captureStatus === "PENDING") {
      const updated = await setState("CAPTURE_PENDING", { captureId: verification.captureId });
      if (updated)
        await audit(tx, {
          ...orgs,
          actorId,
          actorRole: "system",
          action: "payment.capture_pending",
          targetType: "paypal_order",
          targetId: row.id,
          metadata: { source, captureId: verification.captureId },
        });
      return { state: "CAPTURE_PENDING" as const, changed: Boolean(updated), row: updated ?? row };
    }

    const updated = await setState("DENIED", { captureId: verification.captureId, lastError: `Capture ${verification.captureStatus}` });
    if (updated) {
      await moveContract("PAYMENT_FAILED");
      await audit(tx, {
        ...orgs,
        actorId,
        actorRole: "system",
        action: "payment.denied",
        targetType: "paypal_order",
        targetId: row.id,
        metadata: { source, captureStatus: verification.captureStatus },
      });
    }
    return { state: "DENIED" as const, changed: Boolean(updated), row: updated ?? row };
  });
}

/** Idempotently queues proof run #1 after a verified capture (duplicate events cannot double-queue). */
async function queueFirstProofRun(tx: Tx, contract: ProofContractRow, captureId: string) {
  const scope = contract.immutableScopeJson as { proof: unknown };
  const proof = ProofSpec.parse(scope.proof);
  const env = proof.initialEnvironment;
  const inserted = await tx
    .insert(proofRuns)
    .values({
      id: newId("run"),
      proofContractId: contract.id,
      buyerOrganizationId: contract.buyerOrganizationId,
      sellerOrganizationId: contract.sellerOrganizationId,
      runNumber: 1,
      fixtureKey: fixtureKeyFor(env),
      executorMode: "deterministic_simulator",
      testCase: proof.testCase,
      environmentVersion: env.envVersion,
      environmentJson: env,
      status: "QUEUED",
      inputFixtureHash: fixtureHash(proof.testCase, env),
      runnerVersion: RUNNER_VERSION,
      reproduceCommand: reproduceCommandFor(proof.testCase, env, "<digest after run>"),
      queuedBy: PAYMENT_SERVICE,
      queuedReason: `Verified capture ${captureId}`,
    })
    .onConflictDoNothing({ target: [proofRuns.proofContractId, proofRuns.runNumber] })
    .returning();
  if (inserted.length === 0) return;
  const [fresh] = await tx.select().from(proofContracts).where(eq(proofContracts.id, contract.id));
  if (fresh.status === "PAID") {
    await tx
      .update(proofContracts)
      .set({ status: "PROOF_QUEUED" })
      .where(and(eq(proofContracts.id, fresh.id), eq(proofContracts.status, "PAID")));
  }
  await audit(tx, {
    organizationId: contract.sellerOrganizationId,
    counterpartyOrganizationId: contract.buyerOrganizationId,
    actorId: PAYMENT_SERVICE,
    actorRole: "system",
    action: "proof.queued",
    targetType: "proof_run",
    targetId: inserted[0].id,
    metadata: { runNumber: 1, fixtureKey: inserted[0].fixtureKey, reason: "verified capture" },
  });
}

/**
 * Captures a buyer-approved order. Never trusts the browser: it re-reads the
 * order from the provider, captures with a stable PayPal-Request-Id, re-reads
 * again and verifies amount/currency/reference/payee before marking PAID.
 */
export async function capturePaymentOrder(actorIn: Actor | null, paypalOrderId: string) {
  const actor = requireRole(actorIn, ["buyer"]);
  const { row, contract } = await loadOrderForParty(actor, paypalOrderId);
  if (row.buyerOrganizationId !== actor.orgId) throw new AppError("FORBIDDEN", "Only the buyer can capture this order.");
  if (row.paymentState === "CAPTURED") return { state: "CAPTURED", alreadyCaptured: true, contractId: contract.id };
  if (contract.status !== "PAYMENT_PENDING") {
    throw new AppError("INVALID_TRANSITION", `This contract is ${contract.status}; payment cannot be captured.`);
  }

  const gateway = getGateway();
  if (gateway.mode !== row.providerMode)
    throw new AppError("CONFLICT", `This order was created in ${row.providerMode} mode; the app is now in ${gateway.mode} mode.`);

  // Compare-and-set lock: only one capture attempt may be in flight per order.
  const lockAt = new Date();
  const locked = await withSystem(async (tx) => {
    const staleBefore = new Date(lockAt.getTime() - CAPTURE_LOCK_TIMEOUT_MS);
    const [l] = await tx
      .update(paypalOrders)
      .set({ paymentState: "CAPTURING", lockedAt: lockAt, captureAttempts: sql`${paypalOrders.captureAttempts} + 1` })
      .where(
        and(
          eq(paypalOrders.id, row.id),
          or(
            inArray(paypalOrders.paymentState, [...CAPTURABLE_STATES]),
            and(eq(paypalOrders.paymentState, "CAPTURING"), lt(paypalOrders.lockedAt, staleBefore)),
          ),
        ),
      )
      .returning();
    return l ?? null;
  });
  if (!locked) {
    const current = await withSystem(async (tx) => (await tx.select().from(paypalOrders).where(eq(paypalOrders.id, row.id)))[0]);
    if (current.paymentState === "CAPTURED") return { state: "CAPTURED", alreadyCaptured: true, contractId: contract.id };
    if (current.paymentState === "CAPTURING") throw new AppError("CONFLICT", "A capture for this order is already in progress.");
    throw new AppError("INVALID_TRANSITION", `Order cannot be captured from state ${current.paymentState}.`);
  }

  // Releases our lock. A failed release is logged but never hides the original error; the
  // stale-lock window (and "Check status with PayPal") recovers the row afterwards.
  const release = async (state: string, lastError: string | null) => {
    try {
      await withSystem((tx) =>
        tx
          .update(paypalOrders)
          .set({ paymentState: state, lockedAt: null, lastError })
          // Lock token: only the holder of this lock may release it.
          .where(and(eq(paypalOrders.id, row.id), eq(paypalOrders.paymentState, "CAPTURING"), eq(paypalOrders.lockedAt, lockAt))),
      );
    } catch (err) {
      console.error("[nofit] could not release capture lock", {
        orderRowId: row.id,
        paypalOrderId: row.paypalOrderId,
        state,
        error: errName(err),
      });
    }
  };

  let authoritative: PayPalOrder;
  try {
    const before = await gateway.getOrder(row.paypalOrderId);
    if (before.status === "APPROVED") {
      await gateway.captureOrder(row.paypalOrderId, row.captureRequestId);
    } else if (before.status !== "COMPLETED") {
      await release(before.status === "VOIDED" ? "VOIDED" : "CREATED", `Provider status ${before.status}`);
      throw new AppError("PAYMENT_NOT_APPROVED", `The buyer has not approved this payment yet (provider status ${before.status}).`);
    }
    authoritative = await gateway.getOrder(row.paypalOrderId);
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof PayPalApiError && err.issue === "ORDER_NOT_APPROVED") {
      await release("CREATED", "ORDER_NOT_APPROVED");
      throw new AppError("PAYMENT_NOT_APPROVED", "The buyer has not approved this payment yet.");
    }
    if (err instanceof PayPalApiError && err.issue === "INSTRUMENT_DECLINED") {
      await release("CREATED", "INSTRUMENT_DECLINED");
      throw new AppError("PAYMENT_PROVIDER_ERROR", "The funding source was declined. Choose another payment method.", {
        recoverable: true,
        issue: err.issue,
      });
    }
    if (err instanceof PayPalApiError && err.issue === "ORDER_ALREADY_CAPTURED") {
      authoritative = await gateway.getOrder(row.paypalOrderId).catch(async (e) => {
        await release("CAPTURE_UNKNOWN", "Already captured; status lookup failed");
        throw providerError(e, "read the order");
      });
    } else {
      // Unknown outcome (timeout / 5xx): never assume success or failure. Reconcile later.
      await release("CAPTURE_UNKNOWN", err instanceof Error ? err.message.slice(0, 200) : "unknown error");
      throw new AppError("PAYMENT_PROVIDER_ERROR", "The capture result is unknown. Use “Check status with PayPal” to reconcile.", {
        reconcilable: true,
      });
    }
  }

  let result: Awaited<ReturnType<typeof finalizeFromProviderOrder>>;
  try {
    result = await finalizeFromProviderOrder(row.id, authoritative, "capture", actor.userId);
  } catch (err) {
    // The provider may already hold the money: never report "failed" and never invite a second payment.
    console.error("[nofit] capture finalize failed", { orderRowId: row.id, paypalOrderId: row.paypalOrderId, error: errName(err) });
    await release("CAPTURE_UNKNOWN", "Local finalize failed after the provider call");
    throw new AppError(
      "PAYMENT_PROVIDER_ERROR",
      "PayPal may have captured this payment, but it could not be recorded yet. Do not pay again: use “Check status with PayPal”.",
      { reconcilable: true },
    );
  }
  if (result.state === "UNCHANGED") {
    await release("CAPTURE_UNKNOWN", `Provider order status ${authoritative.status} after capture`);
    throw new AppError("PAYMENT_PROVIDER_ERROR", "The capture result is not confirmed yet. Use “Check status with PayPal” to reconcile.", {
      reconcilable: true,
    });
  }
  if (result.state === "VERIFICATION_FAILED") {
    throw new AppError(
      "PAYMENT_VERIFICATION_FAILED",
      "The provider order did not match the contract. The contract was flagged for review and is NOT paid.",
    );
  }
  return { state: result.state, alreadyCaptured: false, contractId: contract.id };
}

/** Server-side reconcile for uncertain states (e.g. timeout or delayed webhook). */
export async function reconcilePaymentOrder(actorIn: Actor | null, paypalOrderId: string) {
  const actor = requireRole(actorIn, ["buyer", "seller_admin"]);
  const { row } = await loadOrderForParty(actor, paypalOrderId);
  if (row.paymentState === "CAPTURED") return { state: "CAPTURED", providerStatus: row.providerStatus };
  const gateway = getGateway();
  if (gateway.mode !== row.providerMode) throw new AppError("CONFLICT", "Order was created in a different payment mode.");
  const order = await gateway.getOrder(row.paypalOrderId).catch((e) => {
    throw providerError(e, "read the order");
  });
  if (order.status === "COMPLETED") {
    const res = await finalizeFromProviderOrder(row.id, order, "reconcile", actor.userId);
    return { state: res.state, providerStatus: order.status };
  }
  if (order.status === "APPROVED" && row.paymentState === "CREATED") {
    await withSystem((tx) =>
      tx
        .update(paypalOrders)
        .set({ paymentState: "APPROVED", providerStatus: order.status })
        .where(and(eq(paypalOrders.id, row.id), eq(paypalOrders.paymentState, "CREATED"))),
    );
    return { state: "APPROVED", providerStatus: order.status };
  }
  if (row.paymentState === "CAPTURE_UNKNOWN" && order.status !== "COMPLETED") {
    // Provider confirms nothing was captured: the order can be captured again safely (idempotent request id).
    const next = order.status === "APPROVED" ? "APPROVED" : "CREATED";
    const updated = await withSystem((tx) =>
      tx
        .update(paypalOrders)
        .set({ paymentState: next, providerStatus: order.status })
        .where(and(eq(paypalOrders.id, row.id), eq(paypalOrders.paymentState, "CAPTURE_UNKNOWN")))
        .returning(),
    );
    if (updated.length) return { state: next, providerStatus: order.status };
  }
  return { state: row.paymentState, providerStatus: order.status };
}

export function describePaymentState(row: Pick<PaypalOrderRow, "paymentState" | "providerMode">, webhookConfirmed: boolean) {
  switch (row.paymentState) {
    case "CAPTURED":
      if (row.providerMode === "fixture")
        return "Paid. The server captured and verified it with the simulated provider (which sends no webhooks).";
      return webhookConfirmed
        ? "Paid. The server verified the capture with PayPal, and a signed webhook confirmed it."
        : "Paid. The server verified the capture with PayPal; the confirming webhook has not arrived yet.";
    case "CAPTURE_PENDING":
      return "Capture pending at the provider. Not paid yet; proof cannot start.";
    case "CAPTURE_UNKNOWN":
      return "Capture result unknown (timeout). Not treated as paid until reconciled with the provider.";
    case "CAPTURING":
      return "Capture in progress…";
    case "APPROVED":
      return "Buyer approved; not captured yet.";
    case "CREATED":
      return "Order created; waiting for buyer approval.";
    case "DENIED":
      return "Capture denied. Not paid.";
    case "VERIFICATION_FAILED":
      return "Provider data did not match the contract. Not paid; flagged for review.";
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
    case "REVERSED":
      return `Recorded as ${row.paymentState.toLowerCase().replace("_", " ")} by a verified webhook (record only).`;
    default:
      return row.paymentState;
  }
}
