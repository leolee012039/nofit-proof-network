import { NextResponse } from "next/server";
import { currentActor, route } from "@/lib/http";
import { reconcilePaymentOrder } from "@/lib/services/payments";

export const POST = route<{ params: Promise<{ orderId: string }> }>(
  async (_req, ctx) => {
    const { orderId } = await ctx.params;
    return NextResponse.json(await reconcilePaymentOrder(await currentActor(), orderId));
  },
  { mutation: true },
);
