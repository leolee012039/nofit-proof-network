import { NextResponse } from "next/server";
import { AppError } from "@/lib/domain/errors";
import { route } from "@/lib/http";
import { MAX_WEBHOOK_BYTES, handlePayPalWebhook, webhookHeadersFrom } from "@/lib/services/webhooks";

/**
 * PayPal webhook listener. Reads the raw body (needed byte-for-byte for
 * signature verification). Unverified events are rejected with 401 and never
 * stored or acted upon; duplicates return 200 so PayPal stops retrying.
 */
export const POST = route(async (req) => {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > MAX_WEBHOOK_BYTES) throw new AppError("WEBHOOK_REJECTED", "Payload too large.");
  const raw = await req.text();
  const result = await handlePayPalWebhook(raw, webhookHeadersFrom(req.headers));
  return NextResponse.json({ ok: true, duplicate: result.duplicate, result: result.result });
});
