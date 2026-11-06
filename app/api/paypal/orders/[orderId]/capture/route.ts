import { NextResponse } from "next/server";
import { currentActor, route } from "@/lib/http";
import { capturePaymentOrder } from "@/lib/services/payments";

/** Captures a buyer-approved order. The response reflects server-verified state only. */
export const POST = route<{ params: Promise<{ orderId: string }> }>(
  async (_req, ctx) => {
    const { orderId } = await ctx.params;
    const result = await capturePaymentOrder(await currentActor(), orderId);
    return NextResponse.json(result);
  },
  { mutation: true },
);
