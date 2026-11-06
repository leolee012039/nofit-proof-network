import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  auditEvents,
  buyerRequests,
  organizations,
  outcomeRecords,
  paypalOrders,
  paypalWebhookEvents,
  proofContracts,
  proofRuns,
  type ProofContractRow,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireRole, tenantOf, type Actor } from "@/lib/auth/actor";
import { withSystem, withTenant, type Tx } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";
import { assertContractTransition, type ContractStatus } from "@/lib/domain/states";

async function loadContract(tx: Tx, contractId: string): Promise<ProofContractRow> {
  const [c] = await tx.select().from(proofContracts).where(eq(proofContracts.id, contractId));
  if (!c) throw new AppError("NOT_FOUND", "Proof contract not found.");
  return c;
}

/** Compare-and-set status update; fails if another request changed the status first. */
async function casStatus(tx: Tx, c: ProofContractRow, to: ContractStatus, patch: Partial<typeof proofContracts.$inferInsert> = {}) {
  assertContractTransition(c.status, to);
  const [updated] = await tx
    .update(proofContracts)
    .set({ ...patch, status: to })
    .where(and(eq(proofContracts.id, c.id), eq(proofContracts.status, c.status)))
    .returning();
  if (!updated) throw new AppError("CONFLICT", "The contract changed while you were acting on it. Refresh and retry.");
  return updated;
}

/** Seller approves the exact proposed scope and price. Scope becomes immutable (DB trigger). */
export async function approveContract(actorIn: Actor | null, contractId: string, input: { scopeHash?: string }) {
  const actor = requireRole(actorIn, ["seller_admin"]);
  return withTenant(tenantOf(actor), async (tx) => {
    const c = await loadContract(tx, contractId);
    if (c.sellerOrganizationId !== actor.orgId) throw new AppError("FORBIDDEN", "Only the seller can approve this contract.");
    if (input.scopeHash !== c.scopeHash)
      throw new AppError("CONFLICT", "The scope you reviewed is not the current scope. Refresh and review again.");
    const updated = await casStatus(tx, c, "SELLER_APPROVED", { sellerApprovedBy: actor.userId, sellerApprovedAt: new Date() });
    await audit(tx, {
      organizationId: actor.orgId,
      counterpartyOrganizationId: c.buyerOrganizationId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: "proof_contract.seller_approved",
      targetType: "proof_contract",
      targetId: c.id,
      metadata: { scopeHash: c.scopeHash, priceMinor: c.priceMinor, currency: c.currency },
    });
    return updated;
  });
}

/** Buyer explicitly accepts the seller-approved version (hash must match what they saw). */
export async function acceptContract(actorIn: Actor | null, contractId: string, input: { scopeHash?: string; acknowledge?: boolean }) {
  const actor = requireRole(actorIn, ["buyer"]);
  if (input.acknowledge !== true) throw new AppError("VALIDATION", "Confirm that you read the scope, limitations and price.");
  return withTenant(tenantOf(actor), async (tx) => {
    const c = await loadContract(tx, contractId);
    if (c.buyerOrganizationId !== actor.orgId) throw new AppError("FORBIDDEN", "Only the buyer can accept this contract.");
    if (input.scopeHash !== c.scopeHash)
      throw new AppError("CONFLICT", "The scope changed since you reviewed it. Refresh and review again.");
    const updated = await casStatus(tx, c, "BUYER_ACCEPTED", {
      buyerAcceptedBy: actor.userId,
      buyerAcceptedAt: new Date(),
      buyerAcceptedScopeHash: c.scopeHash,
    });
    await audit(tx, {
      organizationId: actor.orgId,
      counterpartyOrganizationId: c.sellerOrganizationId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: "proof_contract.buyer_accepted",
      targetType: "proof_contract",
      targetId: c.id,
      metadata: { scopeHash: c.scopeHash, priceMinor: c.priceMinor, currency: c.currency },
    });
    return updated;
  });
}

const IN_FLIGHT_PAYMENT_STATES = ["CAPTURING", "CAPTURED", "CAPTURE_PENDING", "CAPTURE_UNKNOWN"];

/**
 * Cancels a contract and, in the same transaction, voids any payable order so it
 * can never be captured afterwards. Refused once a capture is captured or in flight.
 */
export async function cancelContract(actorIn: Actor | null, contractId: string, input: { reason?: string }) {
  const actor = requireRole(actorIn, ["buyer", "seller_admin"]);
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 5) throw new AppError("VALIDATION", "Give a short reason (5+ characters).");
  const visible = await withTenant(tenantOf(actor), (tx) => loadContract(tx, contractId));
  if (actor.orgId !== visible.buyerOrganizationId && actor.orgId !== visible.sellerOrganizationId) {
    throw new AppError("FORBIDDEN", "Not a party to this contract.");
  }
  // Payment rows are writable only by the payment side (table owner), after the party check above.
  return withSystem(async (tx) => {
    // Lock order: payment rows first, then the contract, the same as finalize/capture (avoids deadlocks).
    const orders = await tx.select().from(paypalOrders).where(eq(paypalOrders.proofContractId, contractId)).for("update");
    const [c] = await tx.select().from(proofContracts).where(eq(proofContracts.id, contractId)).for("update");
    assertContractTransition(c.status, "CANCELLED");
    if (orders.some((o) => IN_FLIGHT_PAYMENT_STATES.includes(o.paymentState))) {
      throw new AppError("INVALID_TRANSITION", "A payment is captured or in progress; this contract cannot be cancelled here.");
    }
    const voided = await tx
      .update(paypalOrders)
      .set({ paymentState: "VOIDED", lockedAt: null, lastError: "Contract cancelled" })
      .where(and(eq(paypalOrders.proofContractId, c.id), inArray(paypalOrders.paymentState, ["CREATED", "APPROVED"])))
      .returning({ id: paypalOrders.id });
    const updated = await casStatus(tx, c, "CANCELLED");
    await audit(tx, {
      organizationId: actor.orgId,
      counterpartyOrganizationId: actor.orgId === c.buyerOrganizationId ? c.sellerOrganizationId : c.buyerOrganizationId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: "proof_contract.cancelled",
      targetType: "proof_contract",
      targetId: c.id,
      metadata: { reason, voidedOrders: voided.map((v) => v.id) },
    });
    return updated;
  });
}

export async function getContractDetail(actorIn: Actor | null, contractId: string) {
  const actor = requireRole(actorIn, ["buyer", "seller_admin", "reviewer"]);
  return withTenant(tenantOf(actor), async (tx) => {
    const c = await loadContract(tx, contractId);
    const [request] = await tx.select().from(buyerRequests).where(eq(buyerRequests.id, c.requestId));
    const orgs = await tx
      .select()
      .from(organizations)
      .where(inArray(organizations.id, [c.buyerOrganizationId, c.sellerOrganizationId]));
    const orders = await tx.select().from(paypalOrders).where(eq(paypalOrders.proofContractId, c.id)).orderBy(asc(paypalOrders.createdAt));
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
          .orderBy(asc(paypalWebhookEvents.receivedAt))
      : [];
    const runs = await tx.select().from(proofRuns).where(eq(proofRuns.proofContractId, c.id)).orderBy(asc(proofRuns.runNumber));
    const outcomes = await tx.select().from(outcomeRecords).where(eq(outcomeRecords.proofContractId, c.id));
    const events = await tx
      .select()
      .from(auditEvents)
      .where(inArray(auditEvents.targetId, [c.id, ...orders.map((o) => o.id), ...runs.map((r) => r.id)]))
      .orderBy(asc(auditEvents.createdAt));
    return {
      actor,
      contract: c,
      request,
      buyerName: orgs.find((o) => o.id === c.buyerOrganizationId)?.name ?? "",
      sellerName: orgs.find((o) => o.id === c.sellerOrganizationId)?.name ?? "",
      orders,
      webhooks,
      runs,
      outcomes,
      events,
    };
  });
}

export async function listContracts(actorIn: Actor | null) {
  const actor = requireRole(actorIn, ["buyer", "seller_admin", "reviewer"]);
  return withTenant(tenantOf(actor), async (tx) => {
    const contracts = await tx.select().from(proofContracts).orderBy(desc(proofContracts.updatedAt));
    const orgIds = [...new Set(contracts.flatMap((c) => [c.buyerOrganizationId, c.sellerOrganizationId]))];
    const orgs = orgIds.length ? await tx.select().from(organizations).where(inArray(organizations.id, orgIds)) : [];
    const orders = contracts.length
      ? await tx
          .select()
          .from(paypalOrders)
          .where(
            inArray(
              paypalOrders.proofContractId,
              contracts.map((c) => c.id),
            ),
          )
          .orderBy(asc(paypalOrders.createdAt))
      : [];
    return contracts.map((c) => ({
      contract: c,
      buyerName: orgs.find((o) => o.id === c.buyerOrganizationId)?.name ?? "",
      sellerName: orgs.find((o) => o.id === c.sellerOrganizationId)?.name ?? "",
      latestOrder: orders.filter((o) => o.proofContractId === c.id).at(-1) ?? null,
    }));
  });
}
