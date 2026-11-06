import { eq } from "drizzle-orm";
import { fixtureProviderOrders } from "@/db/schema";
import { withSystem } from "@/lib/db/client";
import { newId } from "@/lib/ids";
import { PayPalApiError, type CreateOrderInput, type PayPalOrder, type PaymentGateway } from "./types";

/**
 * FIXTURE payment provider — a local simulation of the PayPal Orders API used
 * only when sandbox credentials are absent. It is never labelled as PayPal,
 * cannot receive webhooks, and its order IDs always start with "FIXTURE-".
 */

type Row = typeof fixtureProviderOrders.$inferSelect;

function toOrder(row: Row): PayPalOrder {
  const captured = row.status === "COMPLETED" && row.captureId;
  return {
    id: row.id,
    status: row.status,
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: row.referenceId,
        custom_id: row.customId,
        amount: { currency_code: row.currency, value: row.amountValue },
        payments: captured
          ? {
              captures: [
                {
                  id: row.captureId!,
                  status: "COMPLETED",
                  amount: { currency_code: row.currency, value: row.amountValue },
                  custom_id: row.customId,
                  final_capture: true,
                },
              ],
            }
          : undefined,
      },
    ],
    links: [{ href: `/checkout/fixture/${row.id}`, rel: "payer-action", method: "GET" }],
  };
}

export class FixtureGateway implements PaymentGateway {
  readonly mode = "fixture" as const;

  async createOrder(input: CreateOrderInput) {
    return withSystem(async (tx) => {
      const existing = await tx.select().from(fixtureProviderOrders).where(eq(fixtureProviderOrders.requestId, input.requestId));
      if (existing[0]) return toOrder(existing[0]); // idempotent like PayPal-Request-Id
      const [row] = await tx
        .insert(fixtureProviderOrders)
        .values({
          id: `FIXTURE-${newId("ord", 10).slice(4).toUpperCase()}`,
          requestId: input.requestId,
          referenceId: input.referenceId,
          customId: input.customId,
          amountValue: input.amountValue,
          currency: input.currency,
          status: "CREATED",
        })
        .returning();
      return toOrder(row);
    });
  }

  async getOrder(orderId: string) {
    const rows = await withSystem((tx) => tx.select().from(fixtureProviderOrders).where(eq(fixtureProviderOrders.id, orderId)));
    if (!rows[0]) throw new PayPalApiError("Fixture order not found", { httpStatus: 404, issue: "RESOURCE_NOT_FOUND" });
    return toOrder(rows[0]);
  }

  async captureOrder(orderId: string, requestId: string) {
    return withSystem(async (tx) => {
      const [row] = await tx.select().from(fixtureProviderOrders).where(eq(fixtureProviderOrders.id, orderId)).for("update");
      if (!row) throw new PayPalApiError("Fixture order not found", { httpStatus: 404, issue: "RESOURCE_NOT_FOUND" });
      if (row.status === "COMPLETED") {
        if (row.captureRequestId === requestId) return toOrder(row); // idempotent replay
        throw new PayPalApiError("Order already captured", { httpStatus: 422, issue: "ORDER_ALREADY_CAPTURED" });
      }
      if (row.status !== "APPROVED") {
        throw new PayPalApiError("Payer has not approved the order", { httpStatus: 422, issue: "ORDER_NOT_APPROVED" });
      }
      const [updated] = await tx
        .update(fixtureProviderOrders)
        .set({
          status: "COMPLETED",
          captureId: `FIXTURE-CAP-${newId("cap", 10).slice(4).toUpperCase()}`,
          captureRequestId: requestId,
          capturedAt: new Date(),
        })
        .where(eq(fixtureProviderOrders.id, orderId))
        .returning();
      return toOrder(updated);
    });
  }

  async verifyWebhookSignature() {
    return { verified: false, method: "fixture", detail: "Fixture mode never accepts webhooks." };
  }
}

/** The simulated payer approval step (the fixture checkout page). */
export async function approveFixtureOrder(orderId: string): Promise<"APPROVED" | "ALREADY" | "NOT_FOUND"> {
  return withSystem(async (tx) => {
    const [row] = await tx.select().from(fixtureProviderOrders).where(eq(fixtureProviderOrders.id, orderId));
    if (!row) return "NOT_FOUND";
    if (row.status !== "CREATED") return "ALREADY";
    await tx.update(fixtureProviderOrders).set({ status: "APPROVED", approvedAt: new Date() }).where(eq(fixtureProviderOrders.id, orderId));
    return "APPROVED";
  });
}

export async function getFixtureOrder(orderId: string) {
  const rows = await withSystem((tx) => tx.select().from(fixtureProviderOrders).where(eq(fixtureProviderOrders.id, orderId)));
  return rows[0] ?? null;
}
