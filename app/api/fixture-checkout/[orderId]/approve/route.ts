import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { paypalOrders } from "@/db/schema";
import { requireRole, tenantOf } from "@/lib/auth/actor";
import { withTenant } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";
import { currentActor, route } from "@/lib/http";
import { approveFixtureOrder } from "@/lib/paypal/fixture";

/** Simulated payer approval for FIXTURE orders only. Requires the buyer who owns the order. */
export const POST = route<{ params: Promise<{ orderId: string }> }>(
  async (_req, ctx) => {
    const { orderId } = await ctx.params;
    if (!orderId.startsWith("FIXTURE-")) throw new AppError("FORBIDDEN", "Only fixture orders can be approved here.");
    const actor = requireRole(await currentActor(), ["buyer"]);
    const row = await withTenant(
      tenantOf(actor),
      async (tx) => (await tx.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, orderId)))[0],
    );
    if (!row || row.buyerOrganizationId !== actor.orgId || row.providerMode !== "fixture")
      throw new AppError("NOT_FOUND", "Fixture order not found.");
    const result = await approveFixtureOrder(orderId);
    if (result === "NOT_FOUND") throw new AppError("NOT_FOUND", "Fixture order not found.");
    return NextResponse.json({ ok: true, result, contractId: row.proofContractId });
  },
  { mutation: true },
);
