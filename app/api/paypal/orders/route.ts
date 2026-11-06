import { NextResponse } from "next/server";
import { currentActor, readJson, route, stringField } from "@/lib/http";
import { createPaymentOrder } from "@/lib/services/payments";

/**
 * Creates a PayPal (Sandbox) order for a proof contract. Only `contractId` and
 * `flow` are read from the body; amount and currency come from the stored contract.
 */
export const POST = route(
  async (req) => {
    const body = await readJson(req);
    const contractId = stringField(body, "contractId", { required: true, max: 64 });
    const flow = stringField(body, "flow", { max: 16 }) === "redirect" ? "redirect" : "sdk";
    const order = await createPaymentOrder(await currentActor(), contractId, { flow });
    return NextResponse.json({
      id: order.paypalOrderId,
      providerMode: order.providerMode,
      approveUrl: order.approveUrl,
      reused: order.reused,
    });
  },
  { mutation: true },
);
