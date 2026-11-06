import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getSystemStatus } from "@/lib/services/system";

/** Public, non-secret checkout configuration for the browser (client ID is public by design). */
export const GET = route(async () => {
  const { payment } = getSystemStatus();
  if (payment.kind === "sandbox") {
    return NextResponse.json({
      mode: "sandbox",
      clientId: payment.clientId,
      sdkUrl: "https://www.sandbox.paypal.com/web-sdk/v6/core",
    });
  }
  return NextResponse.json({ mode: payment.kind, reason: "reason" in payment ? payment.reason : undefined });
});
