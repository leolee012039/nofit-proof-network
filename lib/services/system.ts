import os from "node:os";
import { pgliteDataDir } from "@/lib/db/client";
import { getAiMode, getPaymentMode, isDemoResetEnabled, isLocalDeployment } from "@/lib/config";

/** Non-secret integration status for the UI. Never returns secrets. */
export function getSystemStatus() {
  const payment = getPaymentMode();
  const ai = getAiMode();
  return {
    payment:
      payment.kind === "sandbox"
        ? {
            kind: "sandbox" as const,
            label: "PayPal Sandbox",
            host: new URL(payment.baseUrl).host,
            clientId: payment.clientId,
            webhookConfigured: Boolean(payment.webhookId),
            merchantCheck: Boolean(payment.merchantId),
          }
        : {
            kind: payment.kind,
            label: payment.kind === "fixture" ? "Fixture payments (simulated — not PayPal)" : "Payments disabled",
            reason: payment.reason,
          },
    ai:
      ai.kind === "anthropic"
        ? { kind: "anthropic" as const, label: `Live model configured (${ai.model})`, model: ai.model }
        : { kind: "offline-fixture" as const, label: "Offline deterministic evaluator", reason: ai.reason },
    database: process.env.DATABASE_URL?.trim()
      ? "PostgreSQL (DATABASE_URL)"
      : // The folder helps a local developer; a hosted demo does not publish its server paths.
        isLocalDeployment()
        ? `Embedded PostgreSQL (PGlite) at ${pgliteDataDir().replace(os.homedir(), "~")}`
        : "Embedded PostgreSQL (PGlite)",
    demoReset: isDemoResetEnabled(),
  };
}
export type SystemStatus = ReturnType<typeof getSystemStatus>;
