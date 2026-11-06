import { and, eq, inArray, isNull } from "drizzle-orm";
import { paypalOrders, paypalWebhookEvents, proofContracts, type PaypalOrderRow } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getPaymentMode } from "@/lib/config";
import { sha256Hex } from "@/lib/crypto";
import { withSystem } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";
import { canTransitionContract, RESOLVABLE_STATES, type ContractStatus } from "@/lib/domain/states";
import { newId } from "@/lib/ids";
import { decimalStringToMinor } from "@/lib/money";
import { getGateway } from "@/lib/paypal/gateway";
import { PayPalApiError, type WebhookHeaders } from "@/lib/paypal/types";
import { finalizeFromProviderOrder } from "./payments";

const WEBHOOK_ACTOR = "system:paypal-webhook";
export const MAX_WEBHOOK_BYTES = 256 * 1024;

interface WebhookEvent {
  id?: unknown;
  event_type?: unknown;
  resource_type?: unknown;
  resource?: {
    id?: unknown;
    status?: unknown;
    amount?: { value?: unknown; currency_code?: unknown };
    supplementary_data?: { related_ids?: { order_id?: unknown; capture_id?: unknown } };
    links?: Array<{ rel?: unknown; href?: unknown }>;
    seller_payable_breakdown?: { total_refunded_amount?: { value?: unknown } };
  };
}

/** An event row older than this that never finished processing is treated as abandoned. */
const STALE_PROCESSING_MS = 5 * 60 * 1000;

/** A refund resource's own id is the refund id; its capture is the "up" link (or related_ids.capture_id). */
function refundCaptureId(resource: NonNullable<WebhookEvent["resource"]>): string | null {
  const related = str(resource.supplementary_data?.related_ids?.capture_id);
  if (related) return related;
  const up = resource.links?.find((l) => l.rel === "up" && typeof l.href === "string");
  const m = typeof up?.href === "string" ? up.href.match(/\/v2\/payments\/captures\/([A-Za-z0-9-]+)/) : null;
  return m ? m[1] : null;
}

const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 128 ? v : null);

/**
 * PayPal webhook handler. Order of operations:
 *  1. reject unless sandbox mode (fixture mode never accepts webhooks)
 *  2. verify the signature with PayPal BEFORE storing or acting on anything
 *  3. dedupe on paypal_event_id (unique) so retries are no-ops
 *  4. re-read the order from PayPal and reuse the capture verification path
 * Only a sanitized summary and a SHA-256 digest of the payload are stored.
 */
export async function handlePayPalWebhook(rawBody: string, headers: WebhookHeaders) {
  const mode = getPaymentMode();
  if (mode.kind !== "sandbox") throw new AppError("WEBHOOK_REJECTED", "Webhooks are accepted only when PayPal Sandbox is configured.");
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) throw new AppError("WEBHOOK_REJECTED", "Payload too large.");

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    throw new AppError("WEBHOOK_REJECTED", "Invalid JSON.");
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new AppError("WEBHOOK_REJECTED", "Body must be a JSON object.");
  const eventId = str(event.id);
  const eventType = str(event.event_type);
  if (!eventId || !eventType) throw new AppError("WEBHOOK_REJECTED", "Missing event id or type.");

  const gateway = getGateway();
  let verdict: { verified: boolean; method: string; detail?: string };
  try {
    verdict = await gateway.verifyWebhookSignature(headers, rawBody);
  } catch (err) {
    const status = err instanceof PayPalApiError ? err.httpStatus : 0;
    // PayPal refusing the envelope itself (4xx other than our own auth/rate limit) means the event is not genuine.
    if (status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 429) {
      verdict = { verified: false, method: "postback", detail: `verification request rejected (HTTP ${status})` };
    } else {
      // PayPal unreachable or our credentials failing is NOT a forged event: answer 502 so PayPal retries later.
      console.error("[nofit] webhook verification call failed", {
        eventId,
        eventType,
        error: err instanceof Error ? err.name : "unknown",
        httpStatus: status,
        debugId: err instanceof PayPalApiError ? err.debugId : undefined,
      });
      throw new AppError("PAYMENT_PROVIDER_ERROR", "Could not verify the webhook with PayPal right now. Retry later.");
    }
  }
  if (!verdict.verified) {
    // No internal detail in the response; the reason is visible only in server logs.
    console.warn(`[nofit] webhook rejected (${verdict.method}): ${verdict.detail ?? "unverified"}`);
    throw new AppError("WEBHOOK_REJECTED", "Webhook signature could not be verified.");
  }

  const resource = event.resource ?? {};
  const isRefund = eventType === "PAYMENT.CAPTURE.REFUNDED" || eventType === "PAYMENT.CAPTURE.REVERSED";
  const resourceId = str(resource.id);
  const captureIdForLookup = isRefund ? refundCaptureId(resource) : eventType.startsWith("PAYMENT.CAPTURE.") ? resourceId : null;
  const relatedOrderId = str(resource.supplementary_data?.related_ids?.order_id);
  const summary = {
    resourceId,
    relatedOrderId,
    resourceStatus: str(resource.status),
    amountMinor: decimalStringToMinor(resource.amount?.value),
    currency: str(resource.amount?.currency_code),
    totalRefundedMinor: decimalStringToMinor(resource.seller_payable_breakdown?.total_refunded_amount?.value),
  };

  const insertEvent = () =>
    withSystem((tx) =>
      tx
        .insert(paypalWebhookEvents)
        .values({
          id: newId("whe"),
          paypalEventId: eventId,
          eventType,
          resourceType: str(event.resource_type),
          resourceId,
          verified: true,
          verificationMethod: verdict.method,
          payloadDigest: sha256Hex(rawBody),
          summaryJson: summary,
        })
        .onConflictDoNothing({ target: paypalWebhookEvents.paypalEventId })
        .returning(),
    );
  let inserted = await insertEvent();
  if (inserted.length === 0) {
    const [existing] = await withSystem((tx) =>
      tx.select().from(paypalWebhookEvents).where(eq(paypalWebhookEvents.paypalEventId, eventId)),
    );
    if (existing?.processedAt) return { duplicate: true, result: "DUPLICATE_IGNORED" };
    if (existing && Date.now() - existing.receivedAt.getTime() < STALE_PROCESSING_MS) {
      // Another delivery is processing this event right now: ask PayPal to retry later.
      throw new AppError("CONFLICT", "Event is being processed; retry later.");
    }
    // Abandoned (crashed) processing: clear it and process this delivery.
    await withSystem((tx) =>
      tx.delete(paypalWebhookEvents).where(and(eq(paypalWebhookEvents.paypalEventId, eventId), isNull(paypalWebhookEvents.processedAt))),
    );
    inserted = await insertEvent();
    if (inserted.length === 0) throw new AppError("CONFLICT", "Event is being processed; retry later.");
  }
  const eventRow = inserted[0];

  try {
    return await processEvent(eventRow.id, { eventId, eventType, resourceId, relatedOrderId, captureIdForLookup, summary });
  } catch (err) {
    console.error("[nofit] webhook processing failed", { eventId, eventType, error: err instanceof Error ? err.name : "unknown" });
    // Processing failed: forget the event so the PayPal retry is processed instead of deduplicated.
    await withSystem((tx) => tx.delete(paypalWebhookEvents).where(eq(paypalWebhookEvents.id, eventRow.id))).catch((cleanupErr: unknown) => {
      // The row then looks "in progress": retries get 409 until it goes stale (STALE_PROCESSING_MS) and is cleared.
      console.warn("[nofit] webhook dedupe-row cleanup failed", {
        eventId,
        error: cleanupErr instanceof Error ? cleanupErr.name : "unknown",
      });
    });
    throw err;
  }
}

async function processEvent(
  eventRowId: string,
  e: {
    eventId: string;
    eventType: string;
    resourceId: string | null;
    relatedOrderId: string | null;
    captureIdForLookup: string | null;
    summary: { amountMinor: number | null; currency: string | null; totalRefundedMinor: number | null };
  },
) {
  const { eventId, eventType, resourceId, relatedOrderId, captureIdForLookup, summary } = e;
  const gateway = getGateway();
  const orderIdForLookup = eventType.startsWith("CHECKOUT.ORDER.") ? resourceId : relatedOrderId;
  // Prefer the exact capture id, then the order id. No id at all never falls through to an unfiltered query.
  let local: PaypalOrderRow | undefined;
  if (captureIdForLookup) {
    local = (await withSystem((tx) => tx.select().from(paypalOrders).where(eq(paypalOrders.captureId, captureIdForLookup))))[0];
  }
  if (!local && orderIdForLookup) {
    local = (await withSystem((tx) => tx.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, orderIdForLookup))))[0];
  }

  let result = "IGNORED_EVENT_TYPE";
  if (!local) {
    result = "UNMATCHED";
  } else if (local.providerMode !== "sandbox") {
    result = "IGNORED_NON_SANDBOX_ORDER";
  } else if (
    ["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED"].includes(eventType)
  ) {
    if (summary.amountMinor !== null && (summary.amountMinor !== local.amountMinor || summary.currency !== local.currency)) {
      result = "AMOUNT_MISMATCH_FLAGGED";
    }
    if (local.paymentState === "CAPTURED" && eventType === "PAYMENT.CAPTURE.COMPLETED") {
      result = result === "AMOUNT_MISMATCH_FLAGGED" ? result : "ALREADY_CAPTURED";
    } else if (RESOLVABLE_STATES.includes(local.paymentState as never)) {
      // Never trust the webhook body for money: re-read the order from PayPal.
      const order = await gateway.getOrder(local.paypalOrderId);
      const res = await finalizeFromProviderOrder(local.id, order, "webhook", WEBHOOK_ACTOR);
      result = result === "AMOUNT_MISMATCH_FLAGGED" ? result : `APPLIED_${res.state}`;
    } else {
      result = `NO_CHANGE_FROM_${local.paymentState}`;
    }
  } else if (["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"].includes(eventType)) {
    // Cumulative refunded amount when PayPal provides it; otherwise this refund's own amount.
    const refunded = summary.totalRefundedMinor ?? summary.amountMinor;
    const partial = eventType === "PAYMENT.CAPTURE.REFUNDED" && refunded !== null && refunded < local.amountMinor;
    result = await recordRefund(
      local.id,
      eventType === "PAYMENT.CAPTURE.REVERSED" ? "REVERSED" : partial ? "PARTIALLY_REFUNDED" : "REFUNDED",
    );
  } else if (eventType === "CHECKOUT.ORDER.APPROVED") {
    const updated = await withSystem((tx) =>
      tx
        .update(paypalOrders)
        .set({ paymentState: "APPROVED", providerStatus: "APPROVED" })
        .where(and(eq(paypalOrders.id, local.id), eq(paypalOrders.paymentState, "CREATED")))
        .returning(),
    );
    result = updated.length ? "APPLIED_APPROVED" : "NO_CHANGE";
  }

  await withSystem(async (tx) => {
    await tx
      .update(paypalWebhookEvents)
      .set({
        processingResult: result,
        processedAt: new Date(),
        paypalOrderRowId: local?.id ?? null,
        buyerOrganizationId: local?.buyerOrganizationId ?? null,
        sellerOrganizationId: local?.sellerOrganizationId ?? null,
      })
      .where(eq(paypalWebhookEvents.id, eventRowId));
    if (local) {
      await audit(tx, {
        organizationId: local.sellerOrganizationId,
        counterpartyOrganizationId: local.buyerOrganizationId,
        actorId: WEBHOOK_ACTOR,
        actorRole: "system",
        action: "payment.webhook_processed",
        targetType: "paypal_order",
        targetId: local.id,
        metadata: { eventId, eventType, result },
      });
    }
  });
  return { duplicate: false, result };
}

/** Record-only refund handling: never moves money, never auto-refunds. */
async function recordRefund(rowId: string, state: "REFUNDED" | "PARTIALLY_REFUNDED" | "REVERSED") {
  return withSystem(async (tx) => {
    const [updated] = await tx
      .update(paypalOrders)
      .set({ paymentState: state })
      .where(and(eq(paypalOrders.id, rowId), inArray(paypalOrders.paymentState, ["CAPTURED", "PARTIALLY_REFUNDED"])))
      .returning();
    if (!updated) return "NO_CHANGE";
    const [c] = await tx.select().from(proofContracts).where(eq(proofContracts.id, updated.proofContractId));
    if (c && canTransitionContract(c.status as ContractStatus, "NEEDS_REVIEW")) {
      await tx
        .update(proofContracts)
        .set({ status: "NEEDS_REVIEW" })
        .where(and(eq(proofContracts.id, c.id), eq(proofContracts.status, c.status)));
    }
    return `RECORDED_${state}`;
  });
}

export function webhookHeadersFrom(h: Headers): WebhookHeaders {
  return {
    transmissionId: h.get("paypal-transmission-id"),
    transmissionTime: h.get("paypal-transmission-time"),
    transmissionSig: h.get("paypal-transmission-sig"),
    certUrl: h.get("paypal-cert-url"),
    authAlgo: h.get("paypal-auth-algo"),
  };
}
